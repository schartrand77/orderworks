package com.orderworks.stockworks.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LargeTopAppBar
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardOptions
import androidx.compose.ui.unit.dp
import com.orderworks.stockworks.ui.viewmodel.ItemEditorUiState

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun ItemEditorScreen(
    state: ItemEditorUiState,
    onBack: () -> Unit,
    onSave: () -> Unit,
    onNameChanged: (String) -> Unit,
    onSkuChanged: (String) -> Unit,
    onBarcodeChanged: (String) -> Unit,
    onQuantityChanged: (String) -> Unit,
    onReorderPointChanged: (String) -> Unit,
    onLocationChanged: (String) -> Unit,
    onSupplierChanged: (String) -> Unit,
    onDescriptionChanged: (String) -> Unit,
    onCategoryChanged: (String, String) -> Unit
) {
    Scaffold(
        topBar = {
            LargeTopAppBar(
                title = { Text(if (state.isNew) "Add inventory" else "Edit inventory") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        }
    ) { paddingValues ->
        LazyColumn(
            modifier = Modifier
                .padding(paddingValues)
                .fillMaxSize(),
            contentPadding = PaddingValues(16.dp)
        ) {
            item {
                OutlinedTextField(
                    value = state.name,
                    onValueChange = onNameChanged,
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Item name") },
                    singleLine = true
                )
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(
                    value = state.sku,
                    onValueChange = onSkuChanged,
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("SKU") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters)
                )
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(
                    value = state.barcode,
                    onValueChange = onBarcodeChanged,
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Barcode") },
                    singleLine = true
                )
                Spacer(modifier = Modifier.height(8.dp))
                RowedFields(
                    quantity = state.quantityOnHand,
                    reorderPoint = state.reorderPoint,
                    onQuantityChanged = onQuantityChanged,
                    onReorderPointChanged = onReorderPointChanged
                )
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(
                    value = state.binLocation,
                    onValueChange = onLocationChanged,
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Bin / location") },
                    singleLine = true
                )
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(
                    value = state.supplier,
                    onValueChange = onSupplierChanged,
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Supplier") },
                    singleLine = true
                )
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(
                    value = state.description,
                    onValueChange = onDescriptionChanged,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(120.dp),
                    label = { Text("Description") }
                )
                Spacer(modifier = Modifier.height(12.dp))
                Text(text = "Category", style = MaterialTheme.typography.titleMedium)
                Spacer(modifier = Modifier.height(6.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    state.categories.forEach { category ->
                        FilterChip(
                            selected = state.categoryId == category.id,
                            onClick = { onCategoryChanged(category.id, category.name) },
                            label = { Text(category.name) }
                        )
                    }
                }
                Spacer(modifier = Modifier.height(16.dp))
                Button(
                    onClick = onSave,
                    enabled = !state.isSaving,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(if (state.isSaving) "Saving..." else "Save item")
                }
                state.errorMessage?.let { error ->
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(error, color = MaterialTheme.colorScheme.error)
                }
            }
        }
    }
}

@Composable
private fun RowedFields(
    quantity: String,
    reorderPoint: String,
    onQuantityChanged: (String) -> Unit,
    onReorderPointChanged: (String) -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        OutlinedTextField(
            value = quantity,
            onValueChange = onQuantityChanged,
            modifier = Modifier.weight(1f),
            label = { Text("Quantity") }
        )
        OutlinedTextField(
            value = reorderPoint,
            onValueChange = onReorderPointChanged,
            modifier = Modifier.weight(1f),
            label = { Text("Reorder point") }
        )
    }
}
