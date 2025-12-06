package com.orderworks.stockworks.domain.model

sealed interface BarcodeHandlingResult {
    data class ItemIncremented(val item: InventoryItem) : BarcodeHandlingResult
    data class RequiresNewItem(val barcode: String) : BarcodeHandlingResult
}


