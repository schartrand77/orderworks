package com.orderworks.stockworks.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LargeTopAppBar
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.orderworks.stockworks.domain.model.InventoryAdjustment
import com.orderworks.stockworks.domain.model.InventoryItem
import com.orderworks.stockworks.ui.viewmodel.ItemDetailUiState
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.time.ZoneId

private val adjustmentFormatter: DateTimeFormatter = DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ItemDetailScreen(
    state: ItemDetailUiState,
    onBack: () -> Unit,
    onEditItem: (String) -> Unit,
    onAdjustQuantity: (Int, String) -> Unit,
    onDeleteItem: () -> Unit,
    onScan: () -> Unit
) {
    val item = state.item
    Scaffold(
        topBar = {
            LargeTopAppBar(
                title = { Text(item?.name ?: "Inventory Item") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = onScan) {
                        Icon(Icons.Default.CameraAlt, contentDescription = "Scan")
                    }
                    if (item != null) {
                        IconButton(onClick = { onEditItem(item.id) }) {
                            Icon(Icons.Default.Edit, contentDescription = "Edit")
                        }
                    }
                }
            )
        }
    ) { paddingValues ->
        if (item == null) {
            Column(
                modifier = Modifier
                    .padding(paddingValues)
                    .fillMaxSize(),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                CircularProgressIndicator()
            }
        } else {
            LazyColumn(
                modifier = Modifier
                    .padding(paddingValues)
                    .fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                item {
                    ItemMetaCard(item = item, onAdjustQuantity = onAdjustQuantity, onDeleteItem = onDeleteItem)
                }
                item {
                    AdjustmentHistory(adjustments = state.adjustments)
                }
            }
        }
    }
}

@Composable
private fun ItemMetaCard(
    item: InventoryItem,
    onAdjustQuantity: (Int, String) -> Unit,
    onDeleteItem: () -> Unit
) {
    Card(
        modifier = Modifier
            .padding(horizontal = 16.dp)
            .fillMaxWidth(),
        colors = CardDefaults.cardColors()
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(text = "SKU ${item.sku}", style = MaterialTheme.typography.bodyMedium)
            Spacer(modifier = Modifier.height(4.dp))
            Text(text = "Barcode: ${item.barcode ?: "-"}")
            Spacer(modifier = Modifier.height(8.dp))
            Text(text = "Quantity on hand: ${item.quantityOnHand}", style = MaterialTheme.typography.titleLarge)
            Text(text = "Reorder point: ${item.reorderPoint}")
            Spacer(modifier = Modifier.height(8.dp))
            Text(text = "Location ${item.binLocation}")
            Text(text = "Category ${item.categoryName}")
            Spacer(modifier = Modifier.height(16.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = { onAdjustQuantity(1, "Manual increment") }) {
                    Text("+1 Received")
                }
                Button(onClick = { onAdjustQuantity(-1, "Manual decrement") }) {
                    Text("-1 Used")
                }
            }
            Spacer(modifier = Modifier.height(8.dp))
            TextButton(onClick = onDeleteItem) {
                Text("Delete item", color = MaterialTheme.colorScheme.error)
            }
        }
    }
}

@Composable
private fun AdjustmentHistory(adjustments: List<InventoryAdjustment>) {
    Card(
        modifier = Modifier
            .padding(horizontal = 16.dp)
            .fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(text = "Recent adjustments", fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.height(8.dp))
            if (adjustments.isEmpty()) {
                Text("No adjustments yet.")
            } else {
                adjustments.forEach { adjustment ->
                    AdjustmentRow(adjustment = adjustment)
                    Spacer(modifier = Modifier.height(6.dp))
                }
            }
        }
    }
}

@Composable
private fun AdjustmentRow(adjustment: InventoryAdjustment) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = if (adjustment.delta > 0) "+${adjustment.delta}" else adjustment.delta.toString(),
            style = MaterialTheme.typography.titleMedium
        )
        Text(text = adjustment.reason, style = MaterialTheme.typography.bodyMedium)
        Text(
            text = adjustmentFormatter.format(adjustment.createdAt.atZone(ZoneId.systemDefault())),
            style = MaterialTheme.typography.bodySmall
        )
    }
}

