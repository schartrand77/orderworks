package com.orderworks.stockworks.data.sample

import com.orderworks.stockworks.domain.model.InventoryAdjustment
import com.orderworks.stockworks.domain.model.InventoryItem
import com.orderworks.stockworks.domain.model.ItemCategory
import java.time.Instant

val sampleCategories = listOf(
    ItemCategory(id = "filament", name = "Filament", color = 0xFF6366F1),
    ItemCategory(id = "resin", name = "Resin", color = 0xFFEC4899),
    ItemCategory(id = "hardware", name = "Hardware", color = 0xFF22C55E),
    ItemCategory(id = "shipping", name = "Shipping", color = 0xFFF97316)
)

private fun nowMinus(minutes: Long) = Instant.now().minusSeconds(minutes * 60)

val sampleInventory = listOf(
    InventoryItem(
        id = "inv-1001",
        name = "PLA Filament - Onyx Black",
        sku = "PLA-ONYX-1KG",
        barcode = "012345678905",
        categoryId = "filament",
        categoryName = "Filament",
        quantityOnHand = 8,
        reorderPoint = 5,
        binLocation = "A1",
        supplier = "ProtoMat",
        description = "1kg spool of matte black PLA filament",
        unitCost = 18.25,
        lastUpdated = nowMinus(10)
    ),
    InventoryItem(
        id = "inv-1002",
        name = "Tough Resin - Clear",
        sku = "RSN-CLR-05L",
        barcode = "045678912345",
        categoryId = "resin",
        categoryName = "Resin",
        quantityOnHand = 3,
        reorderPoint = 4,
        binLocation = "R2",
        supplier = "FormWare",
        description = "0.5L of engineering-grade transparent resin",
        unitCost = 52.0,
        lastUpdated = nowMinus(40)
    ),
    InventoryItem(
        id = "inv-1003",
        name = "M3 Socket Cap Screws (100 ct)",
        sku = "SCREW-M3-12",
        barcode = "023459871234",
        categoryId = "hardware",
        categoryName = "Hardware",
        quantityOnHand = 120,
        reorderPoint = 50,
        binLocation = "H5",
        supplier = "Fastenal",
        description = "100-pack of stainless M3 x 12mm socket cap screws",
        unitCost = 11.0,
        lastUpdated = nowMinus(90)
    ),
    InventoryItem(
        id = "inv-1004",
        name = "12x12x6 Shipping Box",
        sku = "BOX-121206",
        barcode = null,
        categoryId = "shipping",
        categoryName = "Shipping",
        quantityOnHand = 42,
        reorderPoint = 30,
        binLocation = "S3",
        supplier = "Uline",
        description = "Kraft box used for printers and kits",
        unitCost = 1.18,
        lastUpdated = nowMinus(8)
    )
)

val sampleAdjustments = mapOf(
    "inv-1001" to listOf(
        InventoryAdjustment(
            id = "adj-1",
            itemId = "inv-1001",
            delta = 3,
            reason = "Cycle count true-up",
            createdAt = nowMinus(90)
        ),
        InventoryAdjustment(
            id = "adj-2",
            itemId = "inv-1001",
            delta = -1,
            reason = "Prototype run",
            createdAt = nowMinus(60)
        )
    ),
    "inv-1002" to listOf(
        InventoryAdjustment(
            id = "adj-3",
            itemId = "inv-1002",
            delta = -2,
            reason = "Printer install",
            createdAt = nowMinus(120)
        )
    )
)


