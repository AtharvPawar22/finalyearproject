#pragma once

#include <Arduino.h>
#include <Wire.h>

class NTAG_I2C {
public:
    NTAG_I2C(uint8_t i2c_addr = 0x55, int8_t fd_pin = 19);

    bool begin(TwoWire &wirePort = Wire);
    bool isFieldDetected();

    // Raw block read/write (16 bytes per block)
    bool readBlock(uint8_t blockNum, uint8_t *buffer);
    bool writeBlock(uint8_t blockNum, const uint8_t *buffer);

    // High-level NDEF Text Record operations
    bool writeNDEFText(const String &payload);
    bool readNDEFText(String &outPayload);

    // Clear / reset user memory
    bool formatNDEF();

private:
    uint8_t _addr;
    int8_t _fd_pin;
    TwoWire *_wire;

    bool waitForReady(uint32_t timeoutMs = 20);
};
