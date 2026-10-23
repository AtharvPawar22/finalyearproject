#pragma once

#include <Arduino.h>
#include <Preferences.h>

struct TerminalTxnRecord {
    char tid[36];
    char cid[24];
    uint32_t amountPaise;
    uint32_t timestamp;
};

class TerminalStorage {
public:
    TerminalStorage();
    bool begin();

    uint32_t getNextSequence();
    bool isTransactionRecorded(const String &tid);
    bool saveTransaction(const String &tid, const String &cid, uint32_t amountPaise);
    uint32_t getTotalTransactionCount();
    uint64_t getTotalCollectedPaise();
    void resetAll();

private:
    Preferences _prefs;
};
