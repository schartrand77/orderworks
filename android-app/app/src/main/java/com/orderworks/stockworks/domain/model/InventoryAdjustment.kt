package com.orderworks.stockworks.domain.model

import java.time.Instant

data class InventoryAdjustment(
    val id: String,
    val itemId: String,
    val delta: Int,
    val reason: String,
    val createdAt: Instant
)


