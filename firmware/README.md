# NETZERO PAY — ESP32 Merchant Terminal Firmware

This directory contains the production-ready firmware for the hardware merchant terminal of the NETZERO PAY offline payment system.

## Circuit & Pin Connections

| Peripheral | Peripheral Pin | ESP32 GPIO | Description / Notes |
|:---|:---|:---|:---|
| **NT3H2111** (NTAG I2C) | VCC | 3.3V | Power (Do not use 5V) |
| | GND | GND | Common Ground |
| | SDA | GPIO 21 | I2C Data (4.7kΩ pull-up to 3.3V) |
| | SCL | GPIO 22 | I2C Clock (4.7kΩ pull-up to 3.3V) |
| | FD | GPIO 19 | Field Detection Interrupt (Active LOW) |
| **SSD1306 OLED** (0.96") | VCC | 3.3V | Power |
| | GND | GND | Ground |
| | SDA | GPIO 21 | Shared I2C Bus |
| | SCL | GPIO 22 | Shared I2C Bus |
| **Button 1 (UP)** | Pin 1 | GPIO 18 | Cycles amount preset (Internal Pull-Up) |
| | Pin 2 | GND | Connect to GND on press |
| **Button 2 (CONFIRM)** | Pin 1 | GPIO 5 | Confirms amount & initiates txn (Internal Pull-Up) |
| | Pin 2 | GND | Connect to GND on press |

---

## How to Flash the Firmware

### Option A: Using PlatformIO (Recommended)
1. Open this `firmware/` folder in VS Code with the PlatformIO extension installed.
2. Connect your ESP32 board via USB.
3. Click **Build** (`Ctrl+Alt+B` / `Cmd+Shift+B`) and then **Upload**.
4. Open the Serial Monitor at **115200 baud**.

### Option B: Using Arduino IDE
1. Open Arduino IDE and select board `ESP32 Dev Module`.
2. Install the following libraries via Library Manager:
   - `ArduinoJson` (v7.x)
   - `Adafruit SSD1306`
   - `Adafruit GFX Library`
3. Open `src/main.cpp` (or copy all `.h`/`.cpp` files into an `.ino` sketch folder).
4. Set upload speed to `115200` and flash the board.

---

## Merchant Operation Flow

1. **Power On**: OLED displays `NETZERO PAY - Initializing...` and formats the NTAG I2C CC headers.
2. **Idle Screen**: Displays `ENTER AMOUNT: Rs. 100.00`.
   - Press **Button 1 (GPIO 18)** to cycle between ₹10, ₹20, ₹50, ₹100, ₹200, ₹500.
   - Press **Button 2 (GPIO 5)** to confirm and initiate the transaction.
3. **Tap 1 (Phone Read)**: ESP32 writes `PAYMENT_REQUEST` JSON to the NT3H2111 chip. The OLED instructs the customer to hold their phone near the coil.
4. **Approval**: The customer's Android Chrome browser reads the request, prompts them with "Demo Store requests ₹100", and the customer taps "Pay ₹100".
5. **Tap 2 (Commit)**: The customer holds their phone to the coil. Chrome writes `PAYMENT_APPROVED` back to the tag.
6. **Verification**: ESP32 reads the tag via I2C, checks that `tid`, `amt`, `mid`, and `nonce` match, verifies that the transaction is not replayed, saves the record to internal NVS flash, writes `PAYMENT_RESULT` (`"s":"OK"`), and displays `[ SUCCESSFUL ] Rs. 100.00` on the OLED.
