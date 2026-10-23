#include <Arduino.h>
#include <Wire.h>
#include <ArduinoJson.h>

#include "config.h"
#include "ntag_i2c.h"
#include "display_oled.h"
#include "storage_nvs.h"

enum TerminalState {
    STATE_BOOT,
    STATE_IDLE,
    STATE_WAIT_TAP1,
    STATE_WAIT_TAP2,
    STATE_VERIFYING,
    STATE_SHOW_RESULT
};

TerminalState currentState = STATE_BOOT;

NTAG_I2C ntag(NT3H2111_I2C_ADDR, NT3H2111_FD_PIN);
DisplayOLED oled;
TerminalStorage storage;

uint8_t selectedPresetIdx = 3; // Default ₹100.00
uint32_t activeAmountPaise = 10000;
String activeTid = "";
String activeNonce = "";
uint32_t stateEntryTime = 0;

// Button debounce tracking
uint32_t lastUpPress = 0;
uint32_t lastConfirmPress = 0;

String generateNonce() {
    uint32_t randVal1 = esp_random();
    uint32_t randVal2 = esp_random();
    char buf[12];
    snprintf(buf, sizeof(buf), "%04x%04x", (uint16_t)(randVal1 & 0xFFFF), (uint16_t)(randVal2 & 0xFFFF));
    return String(buf);
}

String createTransactionId(uint32_t seq) {
    char buf[36];
    snprintf(buf, sizeof(buf), "TXN_%lu_%04u", (unsigned long)(millis() / 1000 + 1727650000), (unsigned int)(seq % 10000));
    return String(buf);
}

void transitionTo(TerminalState nextState) {
    currentState = nextState;
    stateEntryTime = millis();
}

void setup() {
    Serial.begin(115200);
    delay(500);
    Serial.println("\n[NETZERO PAY] Merchant Terminal Starting...");

    pinMode(BTN_UP_PIN, INPUT_PULLUP);
    pinMode(BTN_CONFIRM_PIN, INPUT_PULLUP);

    Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN, I2C_CLOCK_SPEED);

    if (!oled.begin()) {
        Serial.println("[-] OLED Display initialization failed!");
    } else {
        Serial.println("[+] OLED Display initialized.");
        oled.showBoot();
    }

    if (!storage.begin()) {
        Serial.println("[-] NVS Storage initialization failed!");
    } else {
        Serial.printf("[+] NVS Storage ready. Total Txns: %u\n", storage.getTotalTransactionCount());
    }

    if (!ntag.begin(Wire)) {
        Serial.println("[-] NT3H2111 NFC Tag not detected on I2C!");
    } else {
        Serial.println("[+] NT3H2111 NFC Tag detected.");
        ntag.formatNDEF();
    }

    delay(1200);
    activeAmountPaise = AMOUNT_PRESETS_PAISE[selectedPresetIdx];
    oled.showIdle(activeAmountPaise);
    transitionTo(STATE_IDLE);
}

void loop() {
    uint32_t now = millis();

    switch (currentState) {
        case STATE_IDLE: {
            // Button 1 (UP): Cycle Amount Presets
            if (digitalRead(BTN_UP_PIN) == LOW && (now - lastUpPress > BTN_DEBOUNCE_MS)) {
                lastUpPress = now;
                selectedPresetIdx = (selectedPresetIdx + 1) % NUM_AMOUNT_PRESETS;
                activeAmountPaise = AMOUNT_PRESETS_PAISE[selectedPresetIdx];
                oled.showIdle(activeAmountPaise);
                Serial.printf("[UI] Selected Amount: Rs. %u.%02u\n", activeAmountPaise / 100, activeAmountPaise % 100);
            }

            // Button 2 (CONFIRM): Initiate Payment Request
            if (digitalRead(BTN_CONFIRM_PIN) == LOW && (now - lastConfirmPress > BTN_DEBOUNCE_MS)) {
                lastConfirmPress = now;
                uint32_t seq = storage.getNextSequence();
                activeTid = createTransactionId(seq);
                activeNonce = generateNonce();

                // Format JSON PAYMENT_REQUEST payload
                StaticJsonDocument<256> doc;
                doc["t"] = "REQ";
                doc["v"] = PROTOCOL_VERSION;
                doc["mid"] = MERCHANT_ID;
                doc["tid"] = activeTid;
                doc["amt"] = activeAmountPaise;
                doc["n"] = activeNonce;

                String reqJson;
                serializeJson(doc, reqJson);

                Serial.println("\n--------------------------------------");
                Serial.println("[NFC] Writing PAYMENT_REQUEST to NT3H2111:");
                Serial.println(reqJson);

                if (ntag.writeNDEFText(reqJson)) {
                    Serial.println("[+] PAYMENT_REQUEST loaded on tag.");
                    oled.showWaitingTap1(activeAmountPaise, activeTid);
                    transitionTo(STATE_WAIT_TAP1);
                } else {
                    Serial.println("[-] Failed to write to NFC tag.");
                    oled.showFailure("NFC Write Error");
                    delay(2000);
                    oled.showIdle(activeAmountPaise);
                }
            }
            break;
        }

        case STATE_WAIT_TAP1: {
            // Check for cancel / timeout (60 seconds)
            if (digitalRead(BTN_UP_PIN) == LOW && (now - lastUpPress > BTN_DEBOUNCE_MS)) {
                lastUpPress = now;
                Serial.println("[UI] Payment cancelled by merchant.");
                oled.showIdle(activeAmountPaise);
                transitionTo(STATE_IDLE);
                break;
            }

            if (now - stateEntryTime > 60000) {
                Serial.println("[TIMEOUT] Payment request timed out.");
                oled.showFailure("Session Timeout");
                delay(2000);
                oled.showIdle(activeAmountPaise);
                transitionTo(STATE_IDLE);
                break;
            }

            // Detect if phone tapped (FD pin triggered)
            if (ntag.isFieldDetected()) {
                Serial.println("[NFC] Phone detected in RF field (Tap 1).");
                delay(600); // Allow browser to finish reading NDEF
                oled.showWaitingTap2(activeAmountPaise, activeTid);
                transitionTo(STATE_WAIT_TAP2);
            }
            break;
        }

        case STATE_WAIT_TAP2: {
            // Timeout after 60s
            if (now - stateEntryTime > 60000) {
                oled.showFailure("Approval Timeout");
                delay(2500);
                oled.showIdle(activeAmountPaise);
                transitionTo(STATE_IDLE);
                break;
            }

            // Check if phone writes back or taps again
            String readPayload = "";
            bool hasData = ntag.readNDEFText(readPayload);

            if (hasData && readPayload.indexOf("\"t\":\"APR\"") >= 0) {
                Serial.println("[NFC] Received PAYMENT_APPROVED from phone:");
                Serial.println(readPayload);
                oled.showProcessing();
                transitionTo(STATE_VERIFYING);

                // Parse and verify approval
                StaticJsonDocument<384> doc;
                DeserializationError err = deserializeJson(doc, readPayload);

                if (err) {
                    Serial.println("[-] JSON deserialization failed.");
                    oled.showFailure("Malformed Data");
                    delay(2500);
                    oled.showIdle(activeAmountPaise);
                    transitionTo(STATE_IDLE);
                    break;
                }

                const char *type = doc["t"];
                const char *tid = doc["tid"];
                const char *mid = doc["mid"];
                uint32_t amt = doc["amt"];
                const char *cid = doc["cid"] | "UNKNOWN";
                const char *nonce = doc["n"];

                bool valid = true;
                String failReason = "";

                if (!type || strcmp(type, "APR") != 0) {
                    valid = false;
                    failReason = "Bad Msg Type";
                } else if (!tid || activeTid != String(tid)) {
                    valid = false;
                    failReason = "Txn ID Mismatch";
                } else if (amt != activeAmountPaise) {
                    valid = false;
                    failReason = "Amount Mismatch";
                } else if (!mid || strcmp(mid, MERCHANT_ID) != 0) {
                    valid = false;
                    failReason = "Wrong Merchant";
                } else if (!nonce || activeNonce != String(nonce)) {
                    valid = false;
                    failReason = "Invalid Nonce";
                } else if (storage.isTransactionRecorded(activeTid)) {
                    valid = false;
                    failReason = "Replay Detected";
                }

                if (valid) {
                    Serial.println("[+] Transaction verified successfully!");
                    storage.saveTransaction(activeTid, cid, activeAmountPaise);

                    // Write PAYMENT_RESULT OK back to tag
                    StaticJsonDocument<256> resDoc;
                    resDoc["t"] = "RES";
                    resDoc["tid"] = activeTid;
                    resDoc["amt"] = activeAmountPaise;
                    resDoc["s"] = "OK";
                    String resJson;
                    serializeJson(resDoc, resJson);
                    ntag.writeNDEFText(resJson);

                    oled.showSuccess(activeAmountPaise, activeTid, cid);
                    delay(4000);
                } else {
                    Serial.printf("[-] Verification failed: %s\n", failReason.c_str());
                    
                    StaticJsonDocument<256> resDoc;
                    resDoc["t"] = "RES";
                    resDoc["tid"] = activeTid;
                    resDoc["amt"] = activeAmountPaise;
                    resDoc["s"] = "FAIL";
                    resDoc["msg"] = failReason;
                    String resJson;
                    serializeJson(resDoc, resJson);
                    ntag.writeNDEFText(resJson);

                    oled.showFailure(failReason);
                    delay(3000);
                }

                oled.showIdle(activeAmountPaise);
                transitionTo(STATE_IDLE);
            }
            break;
        }

        default:
            break;
    }

    delay(25);
}
