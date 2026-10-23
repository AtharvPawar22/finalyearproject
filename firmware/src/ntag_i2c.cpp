#include "ntag_i2c.h"

NTAG_I2C::NTAG_I2C(uint8_t i2c_addr, int8_t fd_pin)
    : _addr(i2c_addr), _fd_pin(fd_pin), _wire(&Wire) {}

bool NTAG_I2C::begin(TwoWire &wirePort) {
    _wire = &wirePort;
    if (_fd_pin >= 0) {
        pinMode(_fd_pin, INPUT_PULLUP);
    }

    // Ping device on I2C
    _wire->beginTransmission(_addr);
    return (_wire->endTransmission() == 0);
}

bool NTAG_I2C::isFieldDetected() {
    if (_fd_pin >= 0) {
        // Active LOW when RF field is detected
        return (digitalRead(_fd_pin) == LOW);
    }
    return false;
}

bool NTAG_I2C::waitForReady(uint32_t timeoutMs) {
    uint32_t start = millis();
    while (millis() - start < timeoutMs) {
        _wire->beginTransmission(_addr);
        if (_wire->endTransmission() == 0) {
            return true;
        }
        delay(1);
    }
    return false;
}

bool NTAG_I2C::readBlock(uint8_t blockNum, uint8_t *buffer) {
    if (!waitForReady(25)) return false;

    _wire->beginTransmission(_addr);
    _wire->write(blockNum);
    if (_wire->endTransmission(false) != 0) {
        return false;
    }

    uint8_t bytesRead = _wire->requestFrom((int)_addr, 16);
    if (bytesRead != 16) {
        return false;
    }

    for (int i = 0; i < 16; i++) {
        buffer[i] = _wire->read();
    }
    return true;
}

bool NTAG_I2C::writeBlock(uint8_t blockNum, const uint8_t *buffer) {
    if (!waitForReady(25)) return false;

    _wire->beginTransmission(_addr);
    _wire->write(blockNum);
    for (int i = 0; i < 16; i++) {
        _wire->write(buffer[i]);
    }
    
    if (_wire->endTransmission() != 0) {
        return false;
    }

    // EEPROM write cycle delay (~5ms internal programming)
    delay(6);
    return waitForReady(25);
}

bool NTAG_I2C::formatNDEF() {
    // Write Capability Container at Block 0
    // CC for NT3H2111 (888 bytes user memory): E1 10 6D 00
    uint8_t block0[16] = {
        0x00, 0x00, 0x00, 0x00, // Serial / config
        0xE1, 0x10, 0x6D, 0x00, // CC (Magic 0xE1, Ver 1.0, Size 888 bytes, Read/Write)
        0x03, 0x00, 0xFE, 0x00, // Empty NDEF TLV (len 0), Terminator 0xFE
        0x00, 0x00, 0x00, 0x00
    };
    return writeBlock(0, block0);
}

bool NTAG_I2C::writeNDEFText(const String &payload) {
    // Construct NDEF Text Record (en-US, UTF-8)
    // Record Header:
    // 0xD1 = MB:1, ME:1, CF:0, SR:1, IL:0, TNF:0x01 (NFC Forum Well Known Type)
    // 0x01 = Type Length (1 byte: 'T')
    // <payload_len> = 1 (status byte) + 2 (lang 'en') + text.length()
    // 'T' (0x54) = Type: Text
    // 0x02 = Status byte: UTF-8, lang length 2
    // 'e', 'n' = Language code

    uint8_t langLen = 2; // "en"
    uint8_t statusByte = langLen; // UTF-8 (bit 7 = 0)
    uint32_t textLen = payload.length();
    uint32_t recordPayloadLen = 1 + langLen + textLen;
    uint32_t ndefMessageLen = 3 + 1 + recordPayloadLen; // Header(1) + TypeLen(1) + PayloadLen(1) + Type(1) + RecordPayload

    // Buffer to assemble total NDEF data
    uint8_t rawData[512];
    memset(rawData, 0, sizeof(rawData));

    uint16_t ptr = 0;

    // NDEF TLV
    rawData[ptr++] = 0x03; // NDEF Message TLV Tag
    if (ndefMessageLen < 255) {
        rawData[ptr++] = (uint8_t)ndefMessageLen;
    } else {
        rawData[ptr++] = 0xFF;
        rawData[ptr++] = (uint8_t)((ndefMessageLen >> 8) & 0xFF);
        rawData[ptr++] = (uint8_t)(ndefMessageLen & 0xFF);
    }

    // NDEF Record
    rawData[ptr++] = 0xD1; // Short Record, MB=1, ME=1, TNF=1
    rawData[ptr++] = 0x01; // Type Length ('T' = 1)
    rawData[ptr++] = (uint8_t)recordPayloadLen; // Payload Length
    rawData[ptr++] = 0x54; // Type = 'T'
    rawData[ptr++] = statusByte;
    rawData[ptr++] = 'e';
    rawData[ptr++] = 'n';

    // Copy text payload
    for (uint32_t i = 0; i < textLen; i++) {
        rawData[ptr++] = (uint8_t)payload[i];
    }

    // Terminator TLV
    rawData[ptr++] = 0xFE;

    // Write in 16-byte blocks starting from Block 1 (preserving Block 0 CC if possible)
    // For standard NT3H2111 memory layout:
    // Block 0: I2C address, CC bytes (bytes 12-15 = E1 10 6D 00)
    // Block 1+: NDEF data
    
    // Ensure CC is written in Block 0
    uint8_t blk0[16];
    if (readBlock(0, blk0)) {
        blk0[12] = 0xE1;
        blk0[13] = 0x10;
        blk0[14] = 0x6D;
        blk0[15] = 0x00;
        writeBlock(0, blk0);
    }

    uint8_t numBlocks = (ptr + 15) / 16;
    for (uint8_t b = 0; b < numBlocks; b++) {
        uint8_t blockBuffer[16];
        memcpy(blockBuffer, &rawData[b * 16], 16);
        if (!writeBlock(b + 1, blockBuffer)) {
            return false;
        }
    }

    return true;
}

bool NTAG_I2C::readNDEFText(String &outPayload) {
    outPayload = "";
    uint8_t rawBuffer[512];
    memset(rawBuffer, 0, sizeof(rawBuffer));

    // Read first 4 blocks (64 bytes) to parse header
    for (uint8_t b = 0; b < 4; b++) {
        if (!readBlock(b + 1, &rawBuffer[b * 16])) {
            return false;
        }
    }

    // Locate NDEF TLV (Tag = 0x03)
    uint16_t idx = 0;
    while (idx < 64 && rawBuffer[idx] != 0x03) {
        if (rawBuffer[idx] == 0xFE) return false; // End of TLVs
        idx++;
    }

    if (idx >= 60 || rawBuffer[idx] != 0x03) {
        return false;
    }

    idx++; // Skip Tag 0x03
    uint16_t messageLen = rawBuffer[idx++];
    if (messageLen == 0xFF) {
        messageLen = (rawBuffer[idx] << 8) | rawBuffer[idx + 1];
        idx += 2;
    }

    if (messageLen == 0 || messageLen > 450) {
        return false;
    }

    // Read remaining blocks if message spans further
    uint16_t totalBytesNeeded = idx + messageLen + 1;
    uint8_t totalBlocksNeeded = (totalBytesNeeded + 15) / 16;
    for (uint8_t b = 4; b < totalBlocksNeeded && b < 28; b++) {
        readBlock(b + 1, &rawBuffer[b * 16]);
    }

    // Check NDEF Record Header (0xD1 or similar)
    // idx points to Record Header
    uint8_t tnfHeader = rawBuffer[idx++];
    (void)tnfHeader;
    uint8_t typeLen = rawBuffer[idx++];
    uint32_t payloadLen = rawBuffer[idx++];
    uint8_t recordType = rawBuffer[idx++];

    if (recordType != 'T' && recordType != 't') {
        // Attempt raw scan for JSON bracket '{'
        for (uint16_t i = 0; i < 256; i++) {
            if (rawBuffer[i] == '{') {
                int endIdx = -1;
                for (uint16_t j = i; j < 500; j++) {
                    if (rawBuffer[j] == '}') {
                        endIdx = j;
                    }
                }
                if (endIdx > i) {
                    for (uint16_t k = i; k <= endIdx; k++) {
                        outPayload += (char)rawBuffer[k];
                    }
                    return true;
                }
            }
        }
        return false;
    }

    // Text record: status byte + language code + text
    uint8_t statusByte = rawBuffer[idx++];
    uint8_t langCodeLen = statusByte & 0x3F;
    idx += langCodeLen; // Skip language code (e.g. "en")

    uint32_t actualTextLen = payloadLen - 1 - langCodeLen;
    for (uint32_t i = 0; i < actualTextLen; i++) {
        outPayload += (char)rawBuffer[idx + i];
    }

    return (outPayload.length() > 0);
}
