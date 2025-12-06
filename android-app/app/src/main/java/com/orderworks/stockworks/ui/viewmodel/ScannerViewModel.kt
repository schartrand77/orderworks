package com.orderworks.stockworks.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.orderworks.stockworks.domain.model.BarcodeHandlingResult
import com.orderworks.stockworks.domain.repository.StockworksRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ScannerUiState(
    val isProcessing: Boolean = false,
    val lastBarcode: String? = null,
    val result: BarcodeHandlingResult? = null,
    val errorMessage: String? = null
)

class ScannerViewModel(
    private val repository: StockworksRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(ScannerUiState())
    val uiState: StateFlow<ScannerUiState> = _uiState.asStateFlow()

    private var lastScanTimestamp: Long = 0L

    fun onBarcodeScanned(barcode: String) {
        val now = System.currentTimeMillis()
        if (barcode == _uiState.value.lastBarcode && (now - lastScanTimestamp) < 1_500) {
            return
        }
        lastScanTimestamp = now
        viewModelScope.launch {
            _uiState.update { it.copy(isProcessing = true, errorMessage = null) }
            try {
                val result = repository.handleBarcodeScan(barcode)
                _uiState.update {
                    it.copy(
                        isProcessing = false,
                        lastBarcode = barcode,
                        result = result
                    )
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isProcessing = false,
                        errorMessage = e.message ?: "Unable to handle barcode"
                    )
                }
            }
        }
    }

    fun clearResult() {
        _uiState.update { it.copy(result = null, errorMessage = null) }
    }
}


