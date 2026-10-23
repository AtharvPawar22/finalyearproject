#include "storage_nvs.h"

TerminalStorage::TerminalStorage() {}

bool TerminalStorage::begin() {
    return _prefs.begin("netzero_merch", false);
}

uint32_t TerminalStorage::getNextSequence() {
    uint32_t seq = _prefs.getUInt("seq", 1);
    _prefs.putUInt("seq", seq + 1);
    return seq;
}

bool TerminalStorage::isTransactionRecorded(const String &tid) {
    String key = "t_" + tid.substring(tid.length() > 12 ? tid.length() - 12 : 0);
    return _prefs.isKey(key.c_str());
}

bool TerminalStorage::saveTransaction(const String &tid, const String &cid, uint32_t amountPaise) {
    String key = "t_" + tid.substring(tid.length() > 12 ? tid.length() - 12 : 0);
    _prefs.putBool(key.c_str(), true);

    uint32_t count = _prefs.getUInt("count", 0);
    _prefs.putUInt("count", count + 1);

    uint64_t total = _prefs.getULong64("total", 0);
    _prefs.putULong64("total", total + amountPaise);

    return true;
}

uint32_t TerminalStorage::getTotalTransactionCount() {
    return _prefs.getUInt("count", 0);
}

uint64_t TerminalStorage::getTotalCollectedPaise() {
    return _prefs.getULong64("total", 0);
}

void TerminalStorage::resetAll() {
    _prefs.clear();
    _prefs.putUInt("seq", 1);
    _prefs.putUInt("count", 0);
    _prefs.putULong64("total", 0);
}
