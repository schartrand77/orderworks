package com.orderworks.stockworks.domain.model

import java.time.Instant

data class InventoryItem(
    val id: String,
    val name: String,
    val sku: String,
    val barcode: String?,
    val categoryId: String,
    val categoryName: String,
    val quantityOnHand: Int,
    val reorderPoint: Int,
    val binLocation: String,
    val supplier: String?,
    val description: String,
    val unitCost: Double?,
    val lastUpdated: Instant
) {
    val isLowStock: Boolean get() = quantityOnHand <= reorderPoint
}


