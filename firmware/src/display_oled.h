#pragma once

#include <Arduino.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

class DisplayOLED {
public:
    DisplayOLED();
    bool begin();

    void showBoot();
    void showIdle(uint32_t amountPaise);
    void showWaitingTap1(uint32_t amountPaise, const String &tid);
    void showWaitingTap2(uint32_t amountPaise, const String &tid);
    void showProcessing();
    void showSuccess(uint32_t amountPaise, const String &tid, const String &cid);
    void showFailure(const String &reason);

private:
    Adafruit_SSD1306 _display;
    String formatRupees(uint32_t paise);
};
