#include "display_oled.h"
#include "config.h"

DisplayOLED::DisplayOLED()
    : _display(OLED_SCREEN_WIDTH, OLED_SCREEN_HEIGHT, &Wire, -1) {}

bool DisplayOLED::begin() {
    if (!_display.begin(SSD1306_SWITCHCAPVCC, OLED_I2C_ADDR)) {
        return false;
    }
    _display.clearDisplay();
    _display.setTextColor(SSD1306_WHITE);
    _display.display();
    return true;
}

String DisplayOLED::formatRupees(uint32_t paise) {
    uint32_t rupees = paise / 100;
    uint32_t dec = paise % 100;
    char buf[20];
    snprintf(buf, sizeof(buf), "Rs.%u.%02u", rupees, dec);
    return String(buf);
}

void DisplayOLED::showBoot() {
    _display.clearDisplay();
    _display.setTextSize(1);
    _display.setCursor(18, 12);
    _display.println("NETZERO PAY");
    _display.drawFastHLine(18, 22, 92, SSD1306_WHITE);

    _display.setCursor(10, 30);
    _display.println("Offline Merchant Node");
    _display.setCursor(26, 44);
    _display.println("Initializing...");
    _display.display();
}

void DisplayOLED::showIdle(uint32_t amountPaise) {
    _display.clearDisplay();
    
    // Header Bar
    _display.fillRect(0, 0, 128, 12, SSD1306_WHITE);
    _display.setTextColor(SSD1306_BLACK);
    _display.setTextSize(1);
    _display.setCursor(4, 2);
    _display.print(MERCHANT_NAME);
    
    // Amount Center
    _display.setTextColor(SSD1306_WHITE);
    _display.setCursor(8, 20);
    _display.print("ENTER AMOUNT:");
    
    _display.setTextSize(2);
    _display.setCursor(8, 32);
    _display.print(formatRupees(amountPaise));

    // Footer Hint
    _display.setTextSize(1);
    _display.setCursor(4, 54);
    _display.print("[B1: +Amt] [B2: OK]");
    _display.display();
}

void DisplayOLED::showWaitingTap1(uint32_t amountPaise, const String &tid) {
    _display.clearDisplay();
    
    _display.fillRect(0, 0, 128, 12, SSD1306_WHITE);
    _display.setTextColor(SSD1306_BLACK);
    _display.setTextSize(1);
    _display.setCursor(4, 2);
    _display.print("TAP 1: PHONE READ");

    _display.setTextColor(SSD1306_WHITE);
    _display.setTextSize(2);
    _display.setCursor(8, 20);
    _display.print(formatRupees(amountPaise));

    _display.setTextSize(1);
    _display.setCursor(6, 40);
    _display.print("Hold Phone to Coil");
    _display.setCursor(6, 52);
    _display.print("Txn: " + tid.substring(tid.length() > 8 ? tid.length() - 8 : 0));
    _display.display();
}

void DisplayOLED::showWaitingTap2(uint32_t amountPaise, const String &tid) {
    _display.clearDisplay();
    
    _display.fillRect(0, 0, 128, 12, SSD1306_WHITE);
    _display.setTextColor(SSD1306_BLACK);
    _display.setTextSize(1);
    _display.setCursor(4, 2);
    _display.print("TAP 2: APPROVE");

    _display.setTextColor(SSD1306_WHITE);
    _display.setTextSize(1);
    _display.setCursor(4, 18);
    _display.print("User confirmed on web");
    
    _display.setTextSize(2);
    _display.setCursor(8, 30);
    _display.print(formatRupees(amountPaise));

    _display.setTextSize(1);
    _display.setCursor(4, 52);
    _display.print("Tap Phone to Commit");
    _display.display();
}

void DisplayOLED::showProcessing() {
    _display.clearDisplay();
    _display.setTextSize(1);
    _display.setCursor(16, 20);
    _display.println("VERIFYING PAYMENT");
    _display.setCursor(20, 34);
    _display.println("Validating Nonce");
    _display.setCursor(28, 48);
    _display.println("Please Wait...");
    _display.display();
}

void DisplayOLED::showSuccess(uint32_t amountPaise, const String &tid, const String &cid) {
    _display.clearDisplay();
    
    _display.drawRect(0, 0, 128, 64, SSD1306_WHITE);
    _display.setTextSize(1);
    _display.setCursor(8, 6);
    _display.print("[ SUCCESSFUL ]");

    _display.setTextSize(2);
    _display.setCursor(8, 20);
    _display.print(formatRupees(amountPaise));

    _display.setTextSize(1);
    _display.setCursor(8, 40);
    _display.print("From: " + cid);
    _display.setCursor(8, 52);
    _display.print("Txn: " + tid.substring(tid.length() > 8 ? tid.length() - 8 : 0));
    _display.display();
}

void DisplayOLED::showFailure(const String &reason) {
    _display.clearDisplay();
    _display.drawRect(0, 0, 128, 64, SSD1306_WHITE);
    
    _display.setTextSize(1);
    _display.setCursor(16, 8);
    _display.print("[ PAYMENT FAILED ]");

    _display.setCursor(8, 28);
    _display.print("Reason:");
    _display.setCursor(8, 42);
    _display.print(reason.substring(0, 18));
    _display.display();
}
