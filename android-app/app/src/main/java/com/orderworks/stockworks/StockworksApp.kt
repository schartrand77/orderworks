package com.orderworks.stockworks

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.navigation.compose.rememberNavController
import com.orderworks.stockworks.navigation.StockworksNavHost
import com.orderworks.stockworks.ui.viewmodel.StockworksViewModelFactory

@Composable
fun StockworksApp(
    viewModelFactory: StockworksViewModelFactory
) {
    val navController = rememberNavController()
    val snackbarHostState = remember { SnackbarHostState() }

    Scaffold(
        snackbarHost = { SnackbarHost(hostState = snackbarHostState) }
    ) { paddingValues ->
        StockworksNavHost(
            navController = navController,
            viewModelFactory = viewModelFactory,
            modifier = Modifier.padding(paddingValues)
        )
    }
}


