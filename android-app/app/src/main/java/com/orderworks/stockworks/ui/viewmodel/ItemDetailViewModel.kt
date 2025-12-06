package com.orderworks.stockworks.ui.viewmodel

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.orderworks.stockworks.domain.model.InventoryAdjustment
import com.orderworks.stockworks.domain.model.InventoryItem
import com.orderworks.stockworks.domain.repository.StockworksRepository
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

private const val ITEM_ID_KEY = "itemId"

data class ItemDetailUiState(
    val isLoading: Boolean = true,
    val item: InventoryItem? = null,
    val adjustments: List<InventoryAdjustment> = emptyList()
)

class ItemDetailViewModel(
    private val repository: StockworksRepository,
    savedStateHandle: SavedStateHandle
) : ViewModel() {

    private val itemId: String = checkNotNull(savedStateHandle[ITEM_ID_KEY])

    val uiState = combine(
        repository.observeItem(itemId),
        repository.observeAdjustments(itemId)
    ) { item, adjustments ->
        ItemDetailUiState(
            isLoading = item == null,
            item = item,
            adjustments = adjustments
        )
    }.stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5_000),
        ItemDetailUiState()
    )

    fun onAdjustQuantity(delta: Int, reason: String) {
        viewModelScope.launch {
            repository.recordAdjustment(itemId, delta, reason)
        }
    }

    fun deleteItem() {
        viewModelScope.launch { repository.deleteItem(itemId) }
    }
}


