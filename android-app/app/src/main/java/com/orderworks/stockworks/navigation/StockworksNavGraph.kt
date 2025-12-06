package com.orderworks.stockworks.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import com.orderworks.stockworks.ui.screens.BarcodeScannerScreen
import com.orderworks.stockworks.ui.screens.InventoryListScreen
import com.orderworks.stockworks.ui.screens.ItemDetailScreen
import com.orderworks.stockworks.ui.screens.ItemEditorScreen
import com.orderworks.stockworks.ui.viewmodel.InventoryListViewModel
import com.orderworks.stockworks.ui.viewmodel.ItemDetailViewModel
import com.orderworks.stockworks.ui.viewmodel.ItemEditorViewModel
import com.orderworks.stockworks.ui.viewmodel.ScannerViewModel
import com.orderworks.stockworks.ui.viewmodel.StockworksViewModelFactory

object Destinations {
    const val InventoryList = "inventory"
    const val ItemDetail = "inventory/detail/{itemId}"
    const val ItemEditor = "inventory/editor?itemId={itemId}&barcode={barcode}"
    const val Scanner = "inventory/scanner"

    fun detailRoute(itemId: String) = "inventory/detail/$itemId"
    fun editorRoute(itemId: String? = null, barcode: String? = null): String {
        val idPart = itemId?.let { Uri.encode(it) } ?: ""
        val barcodePart = barcode?.let { Uri.encode(it) } ?: ""
        return "inventory/editor?itemId=$idPart&barcode=$barcodePart"
    }
}

@Composable
fun StockworksNavHost(
    navController: NavHostController,
    viewModelFactory: StockworksViewModelFactory,
    modifier: Modifier = Modifier
) {
    NavHost(
        navController = navController,
        startDestination = Destinations.InventoryList,
        modifier = modifier
    ) {
        composable(Destinations.InventoryList) { backStackEntry ->
            val viewModel: InventoryListViewModel = viewModel(
                backStackEntry,
                factory = viewModelFactory
            )
            val state by viewModel.uiState.collectAsStateWithLifecycle()
            InventoryListScreen(
                state = state,
                onSearchChanged = viewModel::onSearchQueryChanged,
                onCategorySelected = viewModel::onCategorySelected,
                onLowStockToggled = viewModel::toggleLowStockOnly,
                onItemSelected = { id ->
                    navController.navigate(Destinations.detailRoute(id))
                },
                onAddItem = { navController.navigate(Destinations.editorRoute()) },
                onScan = { navController.navigate(Destinations.Scanner) }
            )
        }

        composable(
            route = Destinations.ItemDetail,
            arguments = listOf(
                navArgument("itemId") { type = NavType.StringType }
            )
        ) { backStackEntry ->
            val viewModel: ItemDetailViewModel = viewModel(
                backStackEntry,
                factory = viewModelFactory
            )
            val state by viewModel.uiState.collectAsStateWithLifecycle()
            ItemDetailScreen(
                state = state,
                onBack = { navController.popBackStack() },
                onEditItem = { itemId ->
                    navController.navigate(Destinations.editorRoute(itemId = itemId))
                },
                onAdjustQuantity = viewModel::onAdjustQuantity,
                onDeleteItem = {
                    viewModel.deleteItem()
                    navController.popBackStack()
                },
                onScan = { navController.navigate(Destinations.Scanner) }
            )
        }

        composable(
            route = Destinations.ItemEditor,
            arguments = listOf(
                navArgument("itemId") {
                    type = NavType.StringType
                    nullable = true
                    defaultValue = null
                },
                navArgument("barcode") {
                    type = NavType.StringType
                    nullable = true
                    defaultValue = null
                }
            )
        ) { backStackEntry ->
            val viewModel: ItemEditorViewModel = viewModel(
                backStackEntry,
                factory = viewModelFactory
            )
            val state by viewModel.uiState.collectAsStateWithLifecycle()
            ItemEditorScreen(
                state = state,
                onBack = { navController.popBackStack() },
                onSave = { viewModel.saveItem { navController.popBackStack() } },
                onNameChanged = viewModel::onNameChanged,
                onSkuChanged = viewModel::onSkuChanged,
                onBarcodeChanged = viewModel::onBarcodeChanged,
                onQuantityChanged = viewModel::onQuantityChanged,
                onReorderPointChanged = viewModel::onReorderPointChanged,
                onLocationChanged = viewModel::onLocationChanged,
                onSupplierChanged = viewModel::onSupplierChanged,
                onDescriptionChanged = viewModel::onDescriptionChanged,
                onCategoryChanged = viewModel::onCategoryChanged
            )
        }

        composable(Destinations.Scanner) { backStackEntry ->
            val viewModel: ScannerViewModel = viewModel(
                backStackEntry,
                factory = viewModelFactory
            )
            val state by viewModel.uiState.collectAsStateWithLifecycle()
            BarcodeScannerScreen(
                state = state,
                onBack = { navController.popBackStack() },
                onCreateFromBarcode = { barcode ->
                    navController.navigate(Destinations.editorRoute(barcode = barcode))
                },
                onBarcodeHandled = viewModel::onBarcodeScanned
            )
        }
    }
}


import android.net.Uri
