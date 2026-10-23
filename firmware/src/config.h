#pragma once

#include <Arduino.h>

// ==========================================
// NETZERO PAY - ESP32 MERCHANT TERMINAL CONFIG
// ==========================================

// I2C Bus Pins (ESP32 standard)
#define I2C_SDA_PIN         21
#define I2C_SCL_PIN         22
#define I2C_CLOCK_SPEED     400000 // 400 kHz

// Hardware Addresses
#define NT3H2111_I2C_ADDR   0x55
#define OLED_I2C_ADDR       0x3C
#define OLED_SCREEN_WIDTH   128
#define OLED_SCREEN_HEIGHT  64

// NT3H2111 Field Detection Interrupt Pin
#define NT3H2111_FD_PIN     19

// Push Buttons (Active LOW with internal pull-up)
#define BTN_UP_PIN          18 // Cycles amount / navigates
#define BTN_CONFIRM_PIN     5  // Confirms amount / accepts / resets

// Terminal Parameters
#define MERCHANT_ID         "DEMO_STORE_01"
#define MERCHANT_NAME       "Campus Canteen"
#define PROTOCOL_VERSION    1

// Amount Presets in Paise (₹10, ₹20, ₹50, ₹100, ₹200, ₹500)
const uint32_t AMOUNT_PRESETS_PAISE[] = {
    1000,   // ₹10.00
    2000,   // ₹20.00
    5000,   // ₹50.00
    10000,  // ₹100.00
    20000,  // ₹200.00
    50000   // ₹500.00
};
const uint8_t NUM_AMOUNT_PRESETS = sizeof(AMOUNT_PRESETS_PAISE) / sizeof(AMOUNT_PRESETS_PAISE[0]);

// Debounce Timing (ms)
#define BTN_DEBOUNCE_MS     180
