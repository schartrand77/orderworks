package com.orderworks.stockworks.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.orderworks.stockworks.domain.model.InventoryItem
import com.orderworks.stockworks.domain.model.ItemCategory
import com.orderworks.stockworks.domain.repository.StockworksRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class InventoryListUiState(
    val isLoading: Boolean = true,
    val items: List<InventoryItem> = emptyList(),
    val query: String = "",
    val selectedCategoryId: String? = null,
    val lowStockOnly: Boolean = false,
    val categories: List<ItemCategory> = emptyList()
)

class InventoryListViewModel(
    private val repository: StockworksRepository
) : ViewModel() {

    private val searchQuery = MutableStateFlow("")
    private val lowStockOnly = MutableStateFlow(false)
    private val selectedCategoryId = MutableStateFlow<String?>(null)

    val uiState = combine(
        repository.inventoryStream,
        repository.categoriesStream,
        searchQuery,
        lowStockOnly,
        selectedCategoryId
    ) { inventory, categories, query, lowStockOnlyValue, categoryId ->
        val filtered = inventory.filter { item ->
            val matchesQuery = query.isBlank() ||
                item.name.contains(query, ignoreCase = true) ||
                item.sku.contains(query, ignoreCase = true)
            val matchesCategory = categoryId == null || item.categoryId == categoryId
            val matchesStock = !lowStockOnlyValue || item.isLowStock
            matchesQuery && matchesCategory && matchesStock
        }
        InventoryListUiState(
            isLoading = false,
            items = filtered.sortedBy { it.name },
            query = query,
            selectedCategoryId = categoryId,
            lowStockOnly = lowStockOnlyValue,
            categories = categories
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = InventoryListUiState()
    )

    init {
        viewModelScope.launch { repository.refreshInventory() }
    }

    fun onSearchQueryChanged(value: String) {
        searchQuery.value = value
    }

    fun onCategorySelected(categoryId: String?) {
        selectedCategoryId.value = categoryId
    }

    fun toggleLowStockOnly() {
        lowStockOnly.value = !lowStockOnly.value
    }
}


