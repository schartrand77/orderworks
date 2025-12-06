package com.orderworks.stockworks.ui.screens

import android.Manifest
import androidx.camera.core.CameraController
import androidx.camera.mlkit.vision.MlKitAnalyzer
import androidx.camera.view.LifecycleCameraController
import androidx.camera.view.PreviewView
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LargeTopAppBar
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.isGranted
import com.google.accompanist.permissions.rememberPermissionState
import com.google.mlkit.vision.barcode.Barcode
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.BarcodeScannerOptions
import com.orderworks.stockworks.domain.model.BarcodeHandlingResult
import com.orderworks.stockworks.ui.viewmodel.ScannerUiState

@OptIn(ExperimentalMaterial3Api::class, ExperimentalPermissionsApi::class)
@Composable
fun BarcodeScannerScreen(
    state: ScannerUiState,
    onBack: () -> Unit,
    onCreateFromBarcode: (String) -> Unit,
    onBarcodeHandled: (String) -> Unit
) {
    val cameraPermission = rememberPermissionState(Manifest.permission.CAMERA)
    LaunchedEffect(Unit) {
        if (!cameraPermission.status.isGranted) {
            cameraPermission.launchPermissionRequest()
        }
    }
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val controller = remember {
        LifecycleCameraController(context).apply {
            setEnabledUseCases(CameraController.IMAGE_ANALYSIS)
        }
    }
    val executor = remember { ContextCompat.getMainExecutor(context) }
    val barcodeScanner = remember {
        val options = BarcodeScannerOptions.Builder()
            .setBarcodeFormats(
                Barcode.FORMAT_CODE_128,
                Barcode.FORMAT_EAN_13,
                Barcode.FORMAT_EAN_8,
                Barcode.FORMAT_UPC_A,
                Barcode.FORMAT_UPC_E
            )
            .build()
        BarcodeScanning.getClient(options)
    }

    Scaffold(
        topBar = {
            LargeTopAppBar(
                title = { Text("Scan barcode") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        }
    ) { paddingValues ->
        if (cameraPermission.status.isGranted) {
            DisposableEffect(lifecycleOwner) {
                controller.bindToLifecycle(lifecycleOwner)
                val analyzer = MlKitAnalyzer(
                    listOf(barcodeScanner),
                    CameraController.COORDINATE_SYSTEM_VIEW_REFERENCED,
                    executor
                ) { result ->
                    val barcodes = result?.getValue(barcodeScanner).orEmpty()
                    val raw = barcodes.firstOrNull()?.rawValue
                    if (!raw.isNullOrBlank()) {
                        onBarcodeHandled(raw)
                    }
                }
                controller.setImageAnalysisAnalyzer(executor, analyzer)
                onDispose {
                    controller.clearImageAnalysisAnalyzer()
                }
            }
        }

        Column(
            modifier = Modifier
                .padding(paddingValues)
                .fillMaxSize(),
            verticalArrangement = Arrangement.Top
        ) {
            if (cameraPermission.status.isGranted) {
                AndroidView(
                    modifier = Modifier
                        .padding(horizontal = 16.dp)
                        .aspectRatio(3f / 4f)
                        .fillMaxWidth(),
                    factory = { ctx ->
                        PreviewView(ctx).apply {
                            this.controller = controller
                        }
                    }
                )
            } else {
                Text(
                    text = "Camera permission is required to scan barcodes.",
                    modifier = Modifier.padding(16.dp),
                    style = MaterialTheme.typography.bodyLarge
                )
            }
            Spacer(modifier = Modifier.height(16.dp))
            ScannerStateMessage(
                state = state,
                onCreateFromBarcode = onCreateFromBarcode
            )
        }
    }
}

@Composable
private fun ScannerStateMessage(
    state: ScannerUiState,
    onCreateFromBarcode: (String) -> Unit
) {
    if (state.errorMessage != null) {
        ResultCard(
            icon = Icons.Default.ErrorOutline,
            title = "Scan error",
            description = state.errorMessage
        )
        return
    }
    when (val result = state.result) {
        is BarcodeHandlingResult.ItemIncremented -> {
            ResultCard(
                icon = Icons.Default.CheckCircle,
                title = "${result.item.name} updated",
                description = "Quantity bumped to ${result.item.quantityOnHand}"
            )
        }
        is BarcodeHandlingResult.RequiresNewItem -> {
            ResultCard(
                icon = Icons.Default.ErrorOutline,
                title = "Unrecognized barcode",
                description = "Create an item for ${result.barcode}",
                actionLabel = "Create item",
                onAction = { onCreateFromBarcode(result.barcode) }
            )
        }
        null -> {
            Text(
                text = if (state.isProcessing) "Processing scan..." else "Align the barcode inside the frame",
                modifier = Modifier.padding(16.dp)
            )
        }
    }
}

@Composable
private fun ResultCard(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    description: String,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null
) {
    androidx.compose.material3.Surface(
        tonalElevation = 3.dp,
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Icon(icon, contentDescription = null)
            Text(text = title, style = MaterialTheme.typography.titleMedium)
            Text(text = description, style = MaterialTheme.typography.bodyMedium)
            if (actionLabel != null && onAction != null) {
                Spacer(modifier = Modifier.height(8.dp))
                Button(onClick = onAction) {
                    Text(actionLabel)
                }
            }
        }
    }
}
