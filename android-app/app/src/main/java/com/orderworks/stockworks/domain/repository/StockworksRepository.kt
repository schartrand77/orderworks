package com.orderworks.stockworks.domain.repository

import com.orderworks.stockworks.domain.model.BarcodeHandlingResult
import com.orderworks.stockworks.domain.model.InventoryAdjustment
import com.orderworks.stockworks.domain.model.InventoryItem
import com.orderworks.stockworks.domain.model.ItemCategory
import kotlinx.coroutines.flow.Flow

interface StockworksRepository {
    val inventoryStream: Flow<List<InventoryItem>>
    val categoriesStream: Flow<List<ItemCategory>>

    fun observeItem(itemId: String): Flow<InventoryItem?>
    fun observeAdjustments(itemId: String): Flow<List<InventoryAdjustment>>

    suspend fun refreshInventory()
    suspend fun upsertItem(item: InventoryItem)
    suspend fun deleteItem(itemId: String)
    suspend fun recordAdjustment(itemId: String, delta: Int, reason: String)
    suspend fun handleBarcodeScan(barcode: String): BarcodeHandlingResult
}


