package com.orderworks.stockworks

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.core.view.WindowCompat
import com.orderworks.stockworks.ui.theme.StockworksTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val container = (application as StockworksApplication).container
        setContent {
            StockworksTheme {
                StockworksApp(viewModelFactory = container.viewModelFactory)
            }
        }
    }
}


