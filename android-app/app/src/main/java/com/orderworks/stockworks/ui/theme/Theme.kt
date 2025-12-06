package com.orderworks.stockworks.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

private val DarkColors = darkColorScheme(
    primary = Primary,
    onPrimary = ColorPalette.white,
    secondary = Secondary,
    background = ColorPalette.surface,
    surface = ColorPalette.surface,
    onSurface = ColorPalette.onSurface
)

private val LightColors = lightColorScheme(
    primary = Primary,
    onPrimary = ColorPalette.white,
    secondary = Secondary,
    background = ColorPalette.lightSurface,
    surface = ColorPalette.lightSurface,
    onSurface = ColorPalette.onLightSurface
)

@Composable
fun StockworksTheme(
    useDarkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colors = if (useDarkTheme) DarkColors else LightColors
    MaterialTheme(
        colorScheme = colors,
        typography = Typography,
        content = content
    )
}

private object ColorPalette {
    val white = androidx.compose.ui.graphics.Color.White
    val surface = androidx.compose.ui.graphics.Color(0xFF0F172A)
    val lightSurface = androidx.compose.ui.graphics.Color(0xFFF8FAFC)
    val onSurface = androidx.compose.ui.graphics.Color(0xFFE2E8F0)
    val onLightSurface = androidx.compose.ui.graphics.Color(0xFF0F172A)
}


