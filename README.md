# NETZERO PAY — Zero-Connectivity Offline NFC Payment System

A production-ready digital payment prototype capable of executing end-to-end contactless transactions **without Internet, Wi-Fi, mobile data, or cellular connectivity**, using an Android browser (Google Chrome via Web NFC) and a custom ESP32 hardware terminal.

Built as an ENTC Final-Year Engineering Project.

---

## 🌟 Key Features

- **True Offline Contactless Payments**: Transactions occur entirely over Near Field Communication (NFC) between Chrome and the hardware terminal without network signals.
- **Zero Native App Footprint**: Runs as a Next.js Progressive Web App (PWA) in standard mobile Google Chrome. No APK or native installation required.
- **Dual-Interface Hardware NFC Bridge**: Uses the **NXP NT3H2111 (NTAG I2C Plus)** chip to eliminate fragile card emulation timing issues and deliver a reliable two-tap protocol.
- **Transactional Integer Paise Accounting**: Eliminates floating-point rounding errors across all balance deductions and top-ups.
- **Local IndexedDB Persistence**: Stores wallet state, customer credentials, and encrypted transaction logs offline using Dexie.js.
- **Asynchronous Cloud Reconciliation**: Queues offline transactions and uploads them to Supabase backend as soon as connectivity is restored.
- **Hardware Merchant Terminal**: ESP32 microcontroller with SSD1306 OLED display, physical push buttons, and Non-Volatile Storage (NVS) replay protection.

---

## 🏗 System Architecture

```
┌─────────────────────────────────────────────────────────┐
│              CUSTOMER (Android Phone)                   │
│                                                         │
│   ┌─────────────────────────────────────────────────┐   │
│   │   Google Chrome Browser (Next.js PWA)           │   │
│   │   - Web NFC API (NDEFReader)                    │   │
│   │   - Local IndexedDB (Dexie.js)                  │   │
│   │   - Service Worker (Offline App Shell)          │   │
│   └────────────────────────┬────────────────────────┘   │
└────────────────────────────┼────────────────────────────┘
                             │
                  RF Field (13.56 MHz, NDEF)
                             │
┌────────────────────────────┼────────────────────────────┐
│              MERCHANT (Hardware Terminal)               │
│                            │                            │
│   ┌────────────────────────┴────────────────────────┐   │
│   │   NT3H2111 NTAG I2C Plus (Dual-Interface Tag)   │   │
│   │   - 888 Bytes EEPROM / 64 Bytes SRAM            │   │
│   │   - Field Detection (FD) Interrupt Pin          │   │
│   └────────────────────────┬────────────────────────┘   │
│                            │ I2C Bus (400 kHz)          │
│   ┌────────────────────────┴────────────────────────┐   │
│   │   ESP32 Microcontroller (Master Node)           │   │
│   │   ├── SSD1306 0.96" OLED Display (0x3C)         │   │
│   │   ├── Physical Buttons (Amount Cycle & Confirm) │   │
│   │   └── NVS Flash Storage (Replay Defense)        │   │
│   └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## 📡 Two-Tap NFC Transaction Protocol

| Phase | Initiator | Target | Payload Type | Description |
|:---|:---|:---|:---:|:---|
| **Setup** | Merchant | ESP32 | Internal | Merchant selects amount (e.g. ₹100.00) and presses Confirm. |
| **Tap 1** | Phone | NT3H2111 | `PAYMENT_REQUEST` (`REQ`) | ESP32 writes request JSON. Phone scans NDEF via Web NFC and displays confirmation modal. |
| **User Action** | Customer | Phone UI | Internal | User taps "Approve & Pay ₹100.00" on Chrome. |
| **Tap 2** | Phone | NT3H2111 | `PAYMENT_APPROVED` (`APR`) | Phone writes signed approval. ESP32 reads via I2C, validates nonces/TID, checks replay in NVS, and updates OLED. |
| **Commit** | Phone | IndexedDB | Local State | Phone deducts ₹100 from balance and queues record for sync. |
| **Reconcile** | Phone | Supabase | REST Upsert | When Internet returns, queued records sync to cloud. |

### Message Formats (NDEF JSON)

#### 1. `PAYMENT_REQUEST` (`REQ`)
```json
{
  "t": "REQ",
  "v": 1,
  "mid": "DEMO_STORE_01",
  "tid": "TXN_1727650123_001",
  "amt": 10000,
  "n": "4a7b9c2d"
}
```

#### 2. `PAYMENT_APPROVED` (`APR`)
```json
{
  "t": "APR",
  "tid": "TXN_1727650123_001",
  "mid": "DEMO_STORE_01",
  "amt": 10000,
  "cid": "CUST_DEMO_01",
  "n": "4a7b9c2d",
  "ts": 1727650125000
}
```

---

## 🔌 Hardware Circuit Connections

| Module | Pin | ESP32 GPIO | Function |
|:---|:---|:---|:---|
| **NT3H2111 Breakout** | VCC | 3.3V | Power Supply |
| | GND | GND | Ground |
| | SDA | GPIO 21 | I2C Data (4.7kΩ Pull-Up) |
| | SCL | GPIO 22 | I2C Clock (4.7kΩ Pull-Up) |
| | FD | GPIO 19 | Field Detection Interrupt |
| **SSD1306 OLED (0.96")** | VCC | 3.3V | Power Supply |
| | GND | GND | Ground |
| | SDA | GPIO 21 | Shared I2C Bus |
| | SCL | GPIO 22 | Shared I2C Bus |
| **Button 1 (Amount +)** | Signal | GPIO 18 | Cycle preset (Internal Pull-Up) |
| **Button 2 (Confirm)** | Signal | GPIO 5 | Confirm payment (Internal Pull-Up) |

---

## 🚀 Quickstart Guide

### 1. Web Application

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production / Vercel
npm run build
```

Deploy the repository to **Vercel** with one click. Ensure HTTPS is active (required by Chrome for Web NFC API).

### 2. ESP32 Merchant Terminal

1. Open `firmware/` in PlatformIO or Arduino IDE.
2. Select board `ESP32 Dev Module`.
3. Build and upload firmware over USB.
4. Open Serial Monitor at `115200 baud`.

---

## 🎓 Final Demonstration Procedure

1. **Open Vercel Website**: Open the HTTPS URL on an NFC-enabled Android phone running Google Chrome.
2. **Add Dummy Funds**: Tap "Add Money" and credit ₹500.00 to the local demo wallet.
3. **Cut Connectivity**: Turn on Airplane mode or disable Wi-Fi and Mobile Data on the phone. The app will immediately display the **OFFLINE** status banner.
4. **Select Amount on Terminal**: Press Button 1 on the ESP32 to choose `Rs. 100.00`, then press Button 2 (Confirm). OLED shows `TAP 1: PHONE READ`.
5. **Tap 1**: Tap the phone to the NFC antenna. Chrome will detect the tag and display `Campus Canteen requests ₹100.00`.
6. **Confirm on Phone**: Tap `Approve & Pay ₹100.00`.
7. **Tap 2**: Touch the phone back to the terminal. The ESP32 validates the nonce, updates OLED to `[ SUCCESSFUL ]`, and the phone balance updates from `₹500.00` to `₹400.00`.
8. **Restore Internet**: Turn off Airplane mode. The web app detects connectivity and displays the **Sync Available** banner.
9. **Sync to Cloud**: Tap "Sync Cloud" to upload offline transactions to the Supabase database.
