package com.orderworks.stockworks.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LargeTopAppBar
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.orderworks.stockworks.domain.model.InventoryItem
import com.orderworks.stockworks.ui.viewmodel.InventoryListUiState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InventoryListScreen(
    state: InventoryListUiState,
    onSearchChanged: (String) -> Unit,
    onCategorySelected: (String?) -> Unit,
    onLowStockToggled: () -> Unit,
    onItemSelected: (String) -> Unit,
    onAddItem: () -> Unit,
    onScan: () -> Unit
) {
    Scaffold(
        modifier = Modifier.fillMaxSize(),
        topBar = {
            LargeTopAppBar(
                title = { Text(text = "StockWorks Inventory") },
                actions = {
                    IconButton(onClick = onScan) {
                        Icon(imageVector = Icons.Default.CameraAlt, contentDescription = "Scan Barcode")
                    }
                }
            )
        },
        floatingActionButton = {
            androidx.compose.material3.ExtendedFloatingActionButton(
                text = { Text("New Item") },
                icon = { Icon(Icons.Default.Add, contentDescription = null) },
                onClick = onAddItem,
                modifier = Modifier.navigationBarsPadding()
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .padding(paddingValues)
                .fillMaxSize()
        ) {
            SearchSection(
                state = state,
                onSearchChanged = onSearchChanged,
                onCategorySelected = onCategorySelected,
                onLowStockToggled = onLowStockToggled
            )
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(bottom = 112.dp)
            ) {
                items(state.items) { item ->
                    InventoryItemCard(
                        item = item,
                        onClick = { onItemSelected(item.id) }
                    )
                }
                if (state.items.isEmpty() && !state.isLoading) {
                    item {
                        Text(
                            text = "No items match the current filters.",
                            modifier = Modifier
                                .padding(32.dp)
                                .fillMaxWidth(),
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SearchSection(
    state: InventoryListUiState,
    onSearchChanged: (String) -> Unit,
    onCategorySelected: (String?) -> Unit,
    onLowStockToggled: () -> Unit
) {
    Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
        OutlinedTextField(
            value = state.query,
            onValueChange = onSearchChanged,
            label = { Text("Search name or SKU") },
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(modifier = Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedEvenly, modifier = Modifier.fillMaxWidth()) {
            AssistChip(
                onClick = onLowStockToggled,
                label = { Text("Low stock only") },
                leadingIcon = if (state.lowStockOnly) {
                    {
                        Icon(
                            imageVector = Icons.Default.Check,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary
                        )
                    }
                } else null,
                colors = AssistChipDefaults.assistChipColors(
                    containerColor = if (state.lowStockOnly) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface
                )
            )
            TextButton(onClick = { onCategorySelected(null) }) {
                Text("All Categories")
            }
        }
        Spacer(modifier = Modifier.height(8.dp))
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(state.categories, key = { it.id }) { category ->
                FilterChip(
                    selected = state.selectedCategoryId == category.id,
                    onClick = { onCategorySelected(category.id) },
                    label = { Text(category.name) },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = MaterialTheme.colorScheme.primaryContainer
                    )
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InventoryItemCard(
    item: InventoryItem,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        colors = CardDefaults.cardColors(
            containerColor = if (item.isLowStock) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.surfaceVariant
        ),
        onClick = onClick
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(text = item.name, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Spacer(modifier = Modifier.height(4.dp))
            Text(text = "SKU: ${item.sku}", style = MaterialTheme.typography.bodySmall)
            Spacer(modifier = Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                Text(text = "On hand: ${item.quantityOnHand}", style = MaterialTheme.typography.bodyLarge)
                Text(text = "Reorder @ ${item.reorderPoint}")
            }
            Spacer(modifier = Modifier.height(4.dp))
            Text(text = "Bin ${item.binLocation} | ${item.categoryName}", style = MaterialTheme.typography.bodySmall)
        }
    }
}


