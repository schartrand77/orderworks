package com.orderworks.stockworks

import android.app.Application
import com.orderworks.stockworks.data.repository.InMemoryStockworksRepository
import com.orderworks.stockworks.domain.repository.StockworksRepository
import com.orderworks.stockworks.ui.viewmodel.StockworksViewModelFactory
import kotlinx.coroutines.Dispatchers

class StockworksApplication : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer()
    }
}

class AppContainer {
    private val ioDispatcher = Dispatchers.IO

    val repository: StockworksRepository by lazy {
        InMemoryStockworksRepository(defaultDispatcher = ioDispatcher)
    }

    val viewModelFactory: StockworksViewModelFactory by lazy {
        StockworksViewModelFactory(repository)
    }
}


