package com.orderworks.stockworks.ui.viewmodel

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.orderworks.stockworks.domain.model.InventoryItem
import com.orderworks.stockworks.domain.model.ItemCategory
import com.orderworks.stockworks.domain.repository.StockworksRepository
import java.time.Instant
import java.util.UUID
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

private const val ITEM_ID_ARG = "itemId"
private const val BARCODE_ARG = "barcode"

data class ItemEditorUiState(
    val itemId: String? = null,
    val name: String = "",
    val sku: String = "",
    val barcode: String = "",
    val quantityOnHand: String = "0",
    val reorderPoint: String = "0",
    val binLocation: String = "",
    val supplier: String = "",
    val description: String = "",
    val categoryId: String? = null,
    val categoryName: String = "",
    val categories: List<ItemCategory> = emptyList(),
    val isSaving: Boolean = false,
    val isNew: Boolean = true,
    val errorMessage: String? = null
)

class ItemEditorViewModel(
    private val repository: StockworksRepository,
    savedStateHandle: SavedStateHandle
) : ViewModel() {

    private val itemIdArg: String? = savedStateHandle[ITEM_ID_ARG]?.ifBlank { null }
    private val barcodeArg: String? = savedStateHandle[BARCODE_ARG]?.ifBlank { null }

    private val internalState = MutableStateFlow(ItemEditorUiState())

    val uiState = combine(
        internalState,
        repository.categoriesStream
    ) { base, categories ->
        val selectedCategory = when {
            base.categoryId != null -> categories.firstOrNull { it.id == base.categoryId }
            base.categoryName.isNotBlank() -> categories.firstOrNull { it.name.equals(base.categoryName, ignoreCase = true) }
            else -> categories.firstOrNull()
        }
        base.copy(
            categories = categories,
            categoryId = base.categoryId ?: selectedCategory?.id,
            categoryName = if (base.categoryName.isNotBlank()) base.categoryName else selectedCategory?.name.orEmpty()
        )
    }.stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5_000),
        ItemEditorUiState()
    )

    init {
        if (!barcodeArg.isNullOrBlank()) {
            internalState.update { it.copy(barcode = barcodeArg) }
        }
        if (!itemIdArg.isNullOrBlank()) {
            viewModelScope.launch {
                repository.observeItem(itemIdArg).filterNotNull().first().let { item ->
                    internalState.value = ItemEditorUiState(
                        itemId = item.id,
                        name = item.name,
                        sku = item.sku,
                        barcode = item.barcode.orEmpty(),
                        quantityOnHand = item.quantityOnHand.toString(),
                        reorderPoint = item.reorderPoint.toString(),
                        binLocation = item.binLocation,
                        supplier = item.supplier.orEmpty(),
                        description = item.description,
                        categoryId = item.categoryId,
                        categoryName = item.categoryName,
                        categories = emptyList(),
                        isNew = false
                    )
                }
            }
        }
    }

    fun saveItem(onSaved: () -> Unit) {
        val snapshot = internalState.value
        if (snapshot.name.isBlank()) {
            internalState.update { it.copy(errorMessage = "Item name is required") }
            return
        }
        viewModelScope.launch {
            internalState.update { it.copy(isSaving = true, errorMessage = null) }
            val quantity = snapshot.quantityOnHand.toIntOrNull() ?: 0
            val reorderPoint = snapshot.reorderPoint.toIntOrNull() ?: 0
            val categoryId = snapshot.categoryId ?: snapshot.categoryName.lowercase().replace(" ", "-")
            val item = InventoryItem(
                id = snapshot.itemId ?: UUID.randomUUID().toString(),
                name = snapshot.name.trim(),
                sku = snapshot.sku.trim(),
                barcode = snapshot.barcode.ifBlank { null },
                categoryId = categoryId,
                categoryName = snapshot.categoryName.ifBlank { "General" },
                quantityOnHand = quantity,
                reorderPoint = reorderPoint,
                binLocation = snapshot.binLocation,
                supplier = snapshot.supplier.ifBlank { null },
                description = snapshot.description,
                unitCost = null,
                lastUpdated = Instant.now()
            )
            repository.upsertItem(item)
            internalState.update { it.copy(isSaving = false) }
            onSaved()
        }
    }

    fun onNameChanged(value: String) = internalState.update { it.copy(name = value) }
    fun onSkuChanged(value: String) = internalState.update { it.copy(sku = value) }
    fun onBarcodeChanged(value: String) = internalState.update { it.copy(barcode = value) }
    fun onQuantityChanged(value: String) = internalState.update { it.copy(quantityOnHand = value.filter { ch -> ch.isDigit() }) }
    fun onReorderPointChanged(value: String) = internalState.update { it.copy(reorderPoint = value.filter { ch -> ch.isDigit() }) }
    fun onLocationChanged(value: String) = internalState.update { it.copy(binLocation = value) }
    fun onSupplierChanged(value: String) = internalState.update { it.copy(supplier = value) }
    fun onDescriptionChanged(value: String) = internalState.update { it.copy(description = value) }
    fun onCategoryChanged(id: String, name: String) = internalState.update { it.copy(categoryId = id, categoryName = name) }
}


