# StockWorks Android

The `android-app` module is a native Android client for StockWorks inventory management. It mirrors the OrderWorks feature set (status-aware inventory, item detail workflow, adjustments) and adds a barcode scanning intake flow using CameraX + ML Kit so items can be added/updated from the device camera.

## Highlights

- Kotlin + Jetpack Compose UI with Material 3 components and navigation.
- In-memory repository seeded with realistic sample data; the repository boundary allows you to plug in a REST or gRPC client later.
- Inventory list with search, category filters, and low-stock flagging.
- Item detail view showing metadata, adjustment shortcuts, and history.
- Item editor sheet for creating/updating inventory with SKU, barcode, and bin metadata.
- Barcode scanner built on CameraX + ML Kit that increments seen items or routes unrecognized barcodes into the editor flow.

## Project layout

```
android-app/
|-- app/build.gradle.kts          # module configuration & dependencies
|-- gradlew / gradlew.bat         # Gradle wrapper
|-- settings.gradle.kts           # project definition
`-- app/src/main/java/com/orderworks/stockworks
    |-- data/repository           # InMemoryStockworksRepository
    |-- data/sample               # Seed data for demo/testing
    |-- domain/model              # Inventory entities + barcode result types
    |-- domain/repository         # Repository contract
    |-- navigation                # Compose navigation graph
    |-- ui/screens                # Compose screens (list, detail, editor, scanner)
    |-- ui/viewmodel              # ViewModels powering the screens
    `-- ui/theme                  # Material theme definitions
```

## Running the app

1. Open the `android-app` folder in Android Studio Iguana (or newer).
2. Let Gradle sync (the wrapper pins AGP 8.7.x / Kotlin 1.9.24).
3. Create an Android 14 (API 34) emulator or plug in a physical device.
4. Press **Run**. The default `debug` build launches a seeded workspace so you can navigate without a backend.

> NOTE: The barcode scanner uses CameraX + ML Kit and therefore needs a camera-capable emulator or a physical device. On emulators that lack a virtual camera feed, open the Extended Controls > Camera pane and feed a static barcode image to exercise the flow.

## Integrating with a backend

The `StockworksRepository` interface is the single boundary between UI logic and data sources. The current `InMemoryStockworksRepository` keeps data in a `MutableStateFlow` for demo purposes, but you can:

1. Implement `StockworksRepository` with Retrofit/Ktor to call your OrderWorks/StockWorks API.
2. Swap the binding inside `AppContainer` in `StockworksApplication` to return the real implementation.
3. Expand the data models (e.g., add unit cost, fulfillment status) without touching the UI contract.

Because every screen observes repository flows, real-time updates (web sockets, push) simply emit new values to those flows.

## Barcode intake workflow

- The scanner requests `CAMERA` permission the first time it opens.
- Camera frames run through ML Kit's on-device barcode detector (EAN/UPC/Code 128 by default).
- When a known barcode is scanned, the repository logs a `Barcode intake` adjustment and bumps the quantity.
- Unknown barcodes render an action chip that navigates directly to the item editor with the barcode pre-filled.

You can adjust which barcode formats are accepted in `BarcodeScannerScreen.kt` (via `BarcodeScannerOptions`) or customize the repository's `handleBarcodeScan` implementation to call a backend endpoint.

## Next steps

- Replace the in-memory repository with an API-backed implementation that talks to the existing OrderWorks services.
- Persist adjustments/items with Room or another local database for offline support.
- Extend the scanner to support multi-quantity receipts (e.g., prompt for counts instead of auto-incrementing by 1).
- Hook up authentication by layering a session manager and gated navigation graph.
