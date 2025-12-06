package com.orderworks.stockworks.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.createSavedStateHandle
import androidx.lifecycle.viewmodel.CreationExtras
import com.orderworks.stockworks.domain.repository.StockworksRepository

class StockworksViewModelFactory(
    private val repository: StockworksRepository
) : ViewModelProvider.Factory {

    override fun <T : ViewModel> create(modelClass: Class<T>, extras: CreationExtras): T {
        val savedStateHandle = extras.createSavedStateHandle()
        val viewModel = when (modelClass) {
            InventoryListViewModel::class.java -> InventoryListViewModel(repository)
            ItemDetailViewModel::class.java -> ItemDetailViewModel(repository, savedStateHandle)
            ItemEditorViewModel::class.java -> ItemEditorViewModel(repository, savedStateHandle)
            ScannerViewModel::class.java -> ScannerViewModel(repository)
            else -> throw IllegalArgumentException("Unknown ViewModel: ${modelClass.name}")
        }
        @Suppress("UNCHECKED_CAST")
        return viewModel as T
    }
}


