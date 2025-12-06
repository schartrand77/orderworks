package com.orderworks.stockworks.data.repository

import com.orderworks.stockworks.data.sample.sampleAdjustments
import com.orderworks.stockworks.data.sample.sampleCategories
import com.orderworks.stockworks.data.sample.sampleInventory
import com.orderworks.stockworks.domain.model.BarcodeHandlingResult
import com.orderworks.stockworks.domain.model.InventoryAdjustment
import com.orderworks.stockworks.domain.model.InventoryItem
import com.orderworks.stockworks.domain.repository.StockworksRepository
import java.time.Instant
import java.util.UUID
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.withContext
import kotlinx.coroutines.launch

class InMemoryStockworksRepository(
    private val defaultDispatcher: CoroutineDispatcher
) : StockworksRepository {

    private val inventory = MutableStateFlow(sampleInventory)
    private val categories = MutableStateFlow(sampleCategories)
    private val adjustments = MutableStateFlow(sampleAdjustments)

    override val inventoryStream: Flow<List<InventoryItem>> = inventory
    override val categoriesStream = categories

    override fun observeItem(itemId: String): Flow<InventoryItem?> {
        return inventory.map { items -> items.firstOrNull { it.id == itemId } }
    }

    override fun observeAdjustments(itemId: String): Flow<List<InventoryAdjustment>> {
        return adjustments.map { map ->
            map[itemId].orEmpty().sortedByDescending { it.createdAt }
        }
    }

    override suspend fun refreshInventory() {
        kotlinx.coroutines.withContext(defaultDispatcher) {
            delay(250)
        }
    }

    override suspend fun upsertItem(item: InventoryItem) {
        inventory.update { current ->
            val existingIndex = current.indexOfFirst { it.id == item.id }
            val updatedItem = item.copy(lastUpdated = Instant.now())
            if (existingIndex >= 0) {
                current.toMutableList().also { it[existingIndex] = updatedItem }
            } else {
                current + updatedItem
            }
        }
        if (categories.value.none { it.id == item.categoryId }) {
            categories.update { it + com.orderworks.stockworks.domain.model.ItemCategory(item.categoryId, item.categoryName, color = 0xFF94A3B8) }
        }
    }

    override suspend fun deleteItem(itemId: String) {
        inventory.update { list -> list.filterNot { it.id == itemId } }
        adjustments.update { map -> map - itemId }
    }

    override suspend fun recordAdjustment(itemId: String, delta: Int, reason: String) {
        val adjustment = InventoryAdjustment(
            id = UUID.randomUUID().toString(),
            itemId = itemId,
            delta = delta,
            reason = reason,
            createdAt = Instant.now()
        )
        inventory.update { list ->
            list.map { item ->
                if (item.id == itemId) {
                    item.copy(
                        quantityOnHand = (item.quantityOnHand + delta).coerceAtLeast(0),
                        lastUpdated = Instant.now()
                    )
                } else item
            }
        }
        adjustments.update { map ->
            val existing = map[itemId].orEmpty()
            map + (itemId to (listOf(adjustment) + existing))
        }
    }

    override suspend fun handleBarcodeScan(barcode: String): BarcodeHandlingResult {
        val existing = inventory.value.firstOrNull { it.barcode == barcode }
        return if (existing != null) {
            recordAdjustment(existing.id, 1, reason = "Barcode intake")
            val updated = inventory.value.first { it.id == existing.id }
            BarcodeHandlingResult.ItemIncremented(updated)
        } else {
            BarcodeHandlingResult.RequiresNewItem(barcode)
        }
    }
}


