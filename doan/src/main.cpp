
#include <Arduino.h>
#include <eloquent_esp32cam.h>
#include <eloquent_esp32cam/face/detection.h>
#include <TFT_eSPI.h>
#include <WiFi.h>
#include <HTTPClient.h> // Thư viện để gửi POST
// #include "esp_partition.h"       

#include <FS.h>
#include <SPIFFS.h>
#include "esp_camera.h"
// FreeRTOS and helpers for background uploads
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include <time.h>
#include <ctype.h>
// WebSocket client for admin-triggered enrollments
#include <WebSocketsClient.h>

using fs::File;
#include <eloquent_esp32cam/face/recognition.h>

using eloq::camera;
using eloq::face_t;
using eloq::face::detection;
using eloq::face::recognition;

const char* WIFI_SSID = "KHANH HUNG VNPT";         // <<<< SỬA LẠI
const char* WIFI_PASSWORD = "0978395904"; // <<<< SỬA LẠI
String API_URL = "http://192.168.88.119:5000/api/log-attendance";

const char* ntpServer = "pool.ntp.org";
const long  gmtOffset_sec = 3600 * 7; // Múi giờ Việt Nam (GMT+7)
const int   daylightOffset_sec = 0;   // Không có tiết kiệm ánh sáng ban ngày

String prompt(String message);
void enroll();
void recognize();
void connectWiFi();
void sendAttendanceProof(String employeeId);

// Background upload job structure
typedef struct {
    char employee[48];
    char timestamp[32];
    uint8_t *data;
    size_t len;
} UploadJob;

static QueueHandle_t uploadQueue = NULL;
SemaphoreHandle_t camAIMutex = NULL;

static TaskHandle_t g_senderTaskHandle = NULL;
static TaskHandle_t g_enrollTaskHandle = NULL;
static TaskHandle_t g_recogTaskHandle = NULL;
static TaskHandle_t g_wsTaskHandle = NULL; // Thêm cho wsTask
// enroll queue
typedef struct {
    char name[48];
    int samples;
} EnrollJob;
static QueueHandle_t enrollQueue = NULL;

TFT_eSPI tft = TFT_eSPI();

// forward declaration for the background sender task so setup() can create it
static void senderTask(void *pvParameters);

// WebSocket client
WebSocketsClient wsClient;
bool wsConnected = false;

// defer websocket initialization to avoid startup races
static bool wsInitialized = false;
static unsigned long wsInitAt = 0;
static const unsigned long WS_INIT_DELAY_MS = 5000; // wait 5s before connecting

// WebSocket send queue (all tasks should enqueue outgoing text messages here)
typedef struct {
    char payload[128];
} WSMessage;
static QueueHandle_t wsSendQueue = NULL;
// global flags to coordinate tasks
static volatile bool gEnrollingInProgress = false;  // pause recognition while enrolling

// host/port for WS (computed in setup)
static String wsHost = "";
static uint16_t wsPort = 80;

// forward declaration
static void enrollRoutine(const String &name, int samples = 5);
static void enrollTask(void *pvParameters);
static void recognitionTask(void *pvParameters);

// WS task and helper to enqueue outgoing WS messages
static bool wsSendTxt(const String &msg);

// helper: pump websocket for short time so ws stays alive during blocking enroll
static void pumpWebSocket(int ms) {
   vTaskDelay(ms / portTICK_PERIOD_MS);
}

// new forward declarations (refactor helpers)
static bool detectAndRecognize(String &outName, float &outSim, face_t &outFace);
static void handleRecognitionResult(const String &name, float similarity, const face_t &face);
// forward declare WS message handler so webSocketEvent can call it
static void handleWsMessage(const String &msg);
// clear recognition database (delete all enrolled faces)
static void clearRecognitionDatabase();
// dump recognition database (print enrolled faces to Serial and notify WS)
static void dumpRecognitionDatabase();

unsigned long lastRecognitionTime = 0; // Lưu thời điểm lần cuối nhận dạng thành công
const unsigned long COOLDOWN_PERIOD = 10000; // Thời gian chờ: 10 giây (10000 ms)
// Recognition post-check threshold to avoid false positives (0..1)
const float RECOG_SIMILARITY_THRESHOLD = 0.95f; // hạ nhẹ để dễ nhận hơn, vẫn có xác nhận liên tiếp
// Điều chỉnh tốc độ và độ ổn định trước khi nhận diện
const unsigned long RECOG_MIN_INTERVAL_MS = 300;   // chỉ thử nhận diện tối đa ~3 lần/giây
const int RECOG_STABLE_FRAMES = 3;                 // yêu cầu thấy mặt ổn định N khung hình liên tiếp
const int RECOG_MIN_FACE_AREA = 2000;              // yêu cầu khuôn mặt đủ lớn (gần camera)
const int RECOG_MAX_CENTER_DELTA = 12;             // sai khác vị trí tâm tối đa (px) giữa các khung
bool faceWasPresentInPreviousFrame = false;
// consecutive confirmation settings
const int REQUIRED_CONSISTENT_MATCHES = 3; // require 3 consecutive confirmations
const unsigned long CONSISTENT_WINDOW_MS = 2000; // matches must occur within 2s
static String lastCandidateName = "";
static int candidateCount = 0;
static unsigned long candidateLastSeen = 0;
// trạng thái ổn định của khuôn mặt cho nhận diện
static int gStableFrames = 0;
static int gLastCX = -1, gLastCY = -1;
static size_t gLastArea = 0;
static unsigned long gLastRecognitionAttempt = 0;

void draw_face_box(face_t face) {
    tft.drawRect(face.x, face.y, face.width, face.height, TFT_GREEN);
    Serial.printf("Phat hien khuon mat tai: x=%d, y=%d, w=%d, h=%d\n", face.x, face.y, face.width, face.height);
}


void connectWiFi() {
    Serial.print("Dang ket noi Wifi");
    Serial.println(WIFI_SSID);
    tft.drawString("Dang ket noi Wifi...", 5,100,2);

    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 20) { // Thử trong 10 giây
        delay(500);
        Serial.print(".");
        tft.drawString(".", 5 + (attempts * 10), 120, 2);
        attempts++;
    }

    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("\nKet noi WiFi THAT BAI!");
        tft.fillScreen(TFT_RED);
        tft.drawString("Ket noi WiFi THAT BAI!", 5, 100, 2);
        while(1) delay(1000); // Dừng nếu không có mạng
    }

    Serial.println("\nKet noi WiFi thanh cong!");
    Serial.print("Dia chi IP: ");
    Serial.println(WiFi.localIP());
    tft.drawString("WiFi Da ket noi!", 5, 120, 2);
    configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);
    // Chờ thời gian được đồng bộ
    int ntp_attempts = 0;
    // Chờ tối đa 10 giây cho đến khi time() trả về một mốc thời gian hợp lý
    while (time(NULL) < 1600000000 && ntp_attempts < 60) { 
        Serial.print(".");
        delay(500);
        ntp_attempts++;
    }

    if (time(NULL) < 1600000000) {
        Serial.println("\nLoi: Khong the dong bo thoi gian NTP!");
        tft.drawString("Loi NTP!", 5, 140, 2); // Hiển thị lỗi
    } else {
        Serial.println("\nDong bo thoi gian NTP thanh cong!");
        tft.drawString("NTP OK!", 5, 140, 2);
    }
    delay(1000);
}

// WebSocket event handler
void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
    // Note: a plain function avoids std::function/lamdba allocations which may
    // touch the heap/PSRAM; keep handling lightweight here.
    if (type == WStype_CONNECTED) {
        wsConnected = true;
        Serial.println("WS connected");
        // identify this client as a device so backend forwards enroll requests
        wsClient.sendTXT("role:device");
        Serial.println("WS: sent role:device");
    } else if (type == WStype_DISCONNECTED) {
        wsConnected = false;
        Serial.println("WS disconnected");
    } else if (type == WStype_TEXT) {
        // construct String safely with explicit length
        String msg = String((char*)payload, length);
        handleWsMessage(msg);
    }
}

// Simple wrapper to parse incoming text messages
void handleWsMessage(const String &msg) {
    Serial.printf("WS RX: %s\n", msg.c_str());
    if (msg.startsWith("enroll:")) {
        String name = msg.substring(7);
        name.trim();
        if (name.length() > 0) {
            Serial.printf("WS: enqueue enroll for %s\n", name.c_str());
            if (enrollQueue) {
                EnrollJob job;
                memset(&job, 0, sizeof(job));
                strncpy(job.name, name.c_str(), sizeof(job.name) - 1);
                job.samples = 5;
                // pause recognition immediately to free camera while we enqueue
                gEnrollingInProgress = true;
                if (xQueueSend(enrollQueue, &job, 0) != pdTRUE) {
                    Serial.println("enrollQueue full, cannot enqueue");
                    gEnrollingInProgress = false; // revert pause on failure
                } else {
                    Serial.println("WS: enroll job enqueued");
                    wsSendTxt(String("progress:") + name + ":0/" + String(job.samples));
                }
            } else {
                Serial.println("enrollQueue not created, falling back to direct enroll (may block)");
                enrollRoutine(name, 5);
            }
        }
    } else if (msg == "delete_all" || msg == "clear_db" || msg == "reset_db") {
        clearRecognitionDatabase();
    } else if (msg == "dump_db" || msg == "dump_faces" || msg == "list_faces" || msg == "dump") {
        dumpRecognitionDatabase();
    }
}

static void wsTask(void *pvParameters) {
    Serial.println("wsTask started");
    
    // 1. Đặt hàm xử lý sự kiện
    wsClient.onEvent(webSocketEvent);
    
    // 2. Kết nối
    // wsHost và wsPort đã được tính toán trong setup()
    wsClient.begin(wsHost.c_str(), wsPort, "/ws");
    // Tự động reconnect nếu mất kết nối
    wsClient.setReconnectInterval(5000);

    unsigned long lastSend = 0;
    
    for (;;) {
        // 3. Duy trì kết nối
        wsClient.loop();
        
        // 4. Kiểm tra hàng đợi và Gửi tin nhắn đi (nếu có)
        WSMessage msg;
        if (wsSendQueue != NULL && xQueueReceive(wsSendQueue, &msg, 0) == pdTRUE) {
            if (msg.payload[0] != '\0') {
                Serial.printf("wsTask: Sending: %s\n", msg.payload);
                wsClient.sendTXT(msg.payload);
            }
        }
        
        // Giữ kết nối (ping) mỗi 10 giây; đồng thời nhắc lại role để backend luôn biết đây là device
        if (millis() - lastSend > 10000) {
            if (wsConnected) {
                wsClient.sendTXT("ping");
                wsClient.sendTXT("role:device");
            }
            lastSend = millis();
        }

        // 5. Ngủ 50ms để nhường CPU
        vTaskDelay(50 / portTICK_PERIOD_MS);
    }
}
void setup() {
    delay(3000);
    Serial.begin(115200);
    Serial.println("___FACE DETECTION___");

    //  print_partitions();
    tft.init();
    // Ensure color order matches camera RGB565 buffer when pushing frames
    // This often prevents washed/whitish images on some TFT_eSPI setups
    tft.setRotation(3); // Xoay ngang (320x240)
    tft.fillScreen(TFT_BLACK);

    tft.setTextColor(TFT_WHITE);
    tft.drawString("Khoi tao LCD OK!", 5, 5, 2);

    if (!SPIFFS.begin(true)) {
        Serial.println("An Error has occurred while mounting SPIFFS");
        tft.fillScreen(TFT_RED);
        tft.drawString("SPIFFS Mount FAILED!", 5, 40, 2);
        while(1) delay(1000); // Dừng nếu lỗi
    }

    tft.drawString("SPIFFS OK!", 5, 40, 2);

    connectWiFi();
    // camera settings
    // !!!!REPLACE WITH YOUR OWN MODEL!!!!
    camera.pinout.freenove_s3(); // e.g. xiao(), lilygo_tcamera_s3(), ...
    camera.brownout.disable();
    camera.xclk.slow();
    // face detection only works at 240x240
    camera.resolution.face();
    camera.quality.best();
    camera.pixformat.rgb565();
    //camera.sensor.vflip();
    // you can choose fast detection (50ms)
    //detection.fast();
    // or accurate detection (80ms)
    detection.fast();
    
    // you can set a custom confidence score
    // to consider a face valid
    // (in range 0 - 1, default is 0.5)
    detection.confidence(0.80);
    recognition.confidence(0.97);


    tft.drawString("Khoi tao Camera...", 5, 60, 2);  
    // init camera
    while (!camera.begin().isOk()){
        Serial.println(camera.exception.toString());
        tft.fillScreen(TFT_RED); // Báo lỗi trên LCD
        tft.drawString("Camera init FAILED!", 5, 40, 2);
        delay(1000);
    }
    camera.sensor.hmirror(true);
    camera.sensor.vflip(true);
    // init recognizer
    while (!recognition.begin().isOk())
        Serial.println(recognition.exception.toString());
    //  

    

    camera.sensor.setAutomaticWhiteBalance(true); // Tự động cân bằng trắng
    camera.sensor.setAutomaticGainControl(true);    // Tự động điều chỉnh độ lợi (giảm nhiễu)
    camera.sensor.setExposureControl(true);
    camera.sensor.setBrightness(2);   // Tăng độ sáng (Thử -2 đến 2)
    camera.sensor.setSaturation(1);

    
    Serial.println("Camera OK");
    Serial.println("Face recognizer OK");


    //  if (prompt("Do you want to delete all existing faces? [yes|no]").startsWith("y")) {
    //     Serial.println("Deleting all existing faces...");
    //     recognition.deleteAll();
    // }

    // // dump stored faces, if user confirms
    // if (prompt("Do you want to dump existing faces? [yes|no]").startsWith("y")) {
    //     recognition.dump();
    // }
    Serial.println("Awaiting for face...");
    tft.fillScreen(TFT_BLACK); // Xóa màn hình
    

    camAIMutex = xSemaphoreCreateMutex();
if (camAIMutex == NULL) {
    Serial.println("Loi: Khong the tao camAIMutex");
}
    // create upload queue and start sender task
    uploadQueue = xQueueCreate(4, sizeof(UploadJob));
    if (uploadQueue == NULL) {
        Serial.println("Loi: Khong the tao uploadQueue");
    } else {
    // pin senderTask to core 0 so background network/filesystem work
    // doesn't compete with the main loop/recognition (which runs on the
    // Arduino loop task core). This reduces concurrent pressure on PSRAM.
    xTaskCreatePinnedToCore(senderTask, "senderTask", 10 * 1024, NULL, 1, &g_senderTaskHandle, 0);
        Serial.println("senderTask started");
    }

    // create enroll queue and task
    enrollQueue = xQueueCreate(2, sizeof(EnrollJob));
    if (enrollQueue == NULL) {
        Serial.println("Loi: Khong the tao enrollQueue");
    } else {
    // pin enrollTask to core 0 and give it higher priority than recognition to preempt quickly
    xTaskCreatePinnedToCore(enrollTask, "enrollTask", 36 * 1024, NULL, 2, &g_enrollTaskHandle, 1);
        Serial.println("enrollTask started");
    }

    // Start websocket via a dedicated task to avoid startup races and crashes.
    // backend WS is ws://<host>:<port>/ws
    {
        String url = API_URL;
        if (url.startsWith("http://")) url = url.substring(7);
        int slashIdx = url.indexOf('/');
        String host = (slashIdx == -1) ? url : url.substring(0, slashIdx);
        int colonIdx = host.indexOf(':');
        wsPort = 80;
        wsHost = host;
        if (colonIdx != -1) {
            wsPort = host.substring(colonIdx + 1).toInt();
            wsHost = host.substring(0, colonIdx);
        }
    }

    Serial.printf("WS will connect to %s:%u/ws (wsTask)\n", wsHost.c_str(), wsPort);

    // WebSocket send queue disabled for testing (Option B):
    // do NOT create wsSendQueue so wsSendTxt() becomes a no-op and
    // sending from background tasks is skipped. This helps identify if
    // WebSocket or its callbacks are the root cause of crashes.
    wsSendQueue = xQueueCreate(8, sizeof(WSMessage));
if (wsSendQueue == NULL) { 
    Serial.println("Loi: Khong the tao wsSendQueue"); 
}

    // register event handler for websocket messages using a plain function
    // (avoid lambda/std::function which may allocate on the heap/PSRAM)


    // WebSocket disabled for Option B testing: do not call wsClient.begin()
    // and leave wsInitialized false so the client is never started.
    xTaskCreatePinnedToCore(
    wsTask,           // Hàm chạy
    "wsTask",         // Tên task
    10 * 1024,         // Kích thước stack (6KB)
    NULL,             // Tham số
    2,                // Ưu tiên
    &g_wsTaskHandle,             // Handle
    0                 // Chạy trên Core 0
);
Serial.println("wsTask started");

    // Create recognition task pinned to core 1 with larger stack to avoid
    // running heavy model inference on the default Arduino loop stack.
    xTaskCreatePinnedToCore(
        recognitionTask,
        "recognitionTask",
        28 * 1024, // larger stack for model inference
        NULL,
        1,
        &g_recogTaskHandle,
        1 // pin to core 1 (Arduino loop core)
    );
    Serial.println("recognitionTask started");
}

/**
 * 
 */
// Helper: format timestamp to YYYYMMDD-HHMMSS; fallback to millis if time not set
static void make_timestamp(char *buf, size_t buflen) {
    time_t now = time(NULL);
    if (now > 1600000000) {
        // Convert to Vietnam local time (UTC+7) to ensure filenames use VN date/time
        struct tm t;
        localtime_r(&now, &t); // Chỉ cần truyền 'now' (UTC)
        snprintf(buf, buflen, "%04d%02d%02d-%02d%02d%02d",
            t.tm_year + 1900, t.tm_mon + 1, t.tm_mday,
            t.tm_hour, t.tm_min, t.tm_sec);
    } else {
        // fallback
        unsigned long ms = millis();
        snprintf(buf, buflen, "ms%lu", ms);
    }
}

// Sanitize employee name to generate safe filename component.
// Behavior:
// - Trim leading/trailing spaces
// - Replace spaces with '_'
// - If name contains a suffix like "-<digits>" (common when auto-generated), strip that suffix
// - Remove any remaining characters except [A-Za-z0-9_-]
static void sanitize_name_for_file(const char *in, char *out, size_t outlen) {
    if (!in || !out || outlen == 0) return;
    // copy to a temp buffer and trim
    char tmp[64];
    size_t i = 0, j = 0;
    // trim leading spaces
    while (in[i] && isspace((unsigned char)in[i])) i++;
    // copy up to tmp size
    while (in[i] && j + 1 < sizeof(tmp)) {
        tmp[j++] = in[i++];
    }
    // trim trailing spaces
    while (j > 0 && isspace((unsigned char)tmp[j-1])) j--;
    tmp[j] = '\0';

    // iteratively strip trailing -digits groups (handles names like "hung-1234-5678")
    size_t take = j;
    while (take > 0) {
        // find last hyphen
        ssize_t last_dash = -1;
        for (ssize_t p = (ssize_t)take - 1; p >= 0; --p) {
            if (tmp[p] == '-') { last_dash = p; break; }
        }
        if (last_dash == -1) break;
        bool all_digits = true;
        if ((size_t)last_dash + 1 >= take) break; // nothing after dash
        for (size_t q = (size_t)last_dash + 1; q < take; ++q) {
            if (!isdigit((unsigned char)tmp[q])) { all_digits = false; break; }
        }
        if (all_digits) {
            // strip the suffix and continue (in case multiple groups)
            take = (size_t)last_dash;
        } else {
            break;
        }
    }

    // build output, replacing spaces with '_' and keeping only safe chars
    size_t outi = 0;
    for (size_t k = 0; k < take && outi + 1 < outlen; ++k) {
        char c = tmp[k];
        if (isspace((unsigned char)c)) c = '_';
        if ( (c >= '0' && c <= '9') || (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c == '_' || c == '-') {
            out[outi++] = c;
        }
        // else skip
    }
    if (outi == 0 && outlen > 1) {
        // fallback name
        strncpy(out, "unknown", outlen - 1);
        out[outlen-1] = '\0';
    } else {
        out[outi] = '\0';
    }
}

// Capture N frames and pick the "best" one (largest detected face area).
// Then encode that frame to JPEG and enqueue it for background upload.
static bool capture_best_and_enqueue(const String &employeeId, int attempts = 5, int quality = 80) {
    camera_fb_t *best_fb = NULL;
    size_t best_area = 0;
    uint8_t *best_jpg = NULL;
    size_t best_jpg_len = 0;
    bool best_must_free = false;
    bool result = false; // Biến tạm để lưu kết quả

    Serial.println("[BEST] waiting camAIMutex...");
    if (xSemaphoreTake(camAIMutex, pdMS_TO_TICKS(5000)) == pdTRUE) {
    Serial.println("[BEST] got camAIMutex");
    for (int i = 0; i < attempts; ++i) {
        if (!camera.capture().isOk()) {
            Serial.println("capture_best: camera.capture failed");
            continue;
        }
        camera_fb_t *fb = camera.frame;
        if (!fb) continue;

        // run detection on this frame
        if (!detection.run().isOk()) {
            Serial.println("capture_best: no face detected in this frame");
            continue;
        }
        if (detection.notFound()) {
            Serial.println("capture_best: detection.notFound() - skip");
            continue;
        }

        face_t f = detection.first;
        size_t area = (size_t)f.width * (size_t)f.height;
        Serial.printf("capture_best: frame %d face area=%u\n", i, (unsigned)area);

        // if this is the best so far, encode to JPEG and keep it
        if (area > best_area) {
            // free previous jpg buffer
            if (best_must_free && best_jpg) { free(best_jpg); best_jpg = NULL; best_jpg_len = 0; best_must_free = false; }

            // if fb is already JPEG, copy it directly
            if (fb->format == PIXFORMAT_JPEG) {
                best_jpg_len = fb->len;
                best_jpg = (uint8_t*)malloc(best_jpg_len);
                if (best_jpg) {
                    memcpy(best_jpg, fb->buf, best_jpg_len);
                    best_must_free = true;
                    best_area = area;
                }
            } else {
                // encode to JPEG
                uint8_t *jpg_buf = NULL;
                size_t jpg_len = 0;
                if (frame2jpg(fb, quality, &jpg_buf, &jpg_len)) {
                    best_jpg = jpg_buf;
                    best_jpg_len = jpg_len;
                    best_must_free = true;
                    best_area = area;
                } else {
                    if (jpg_buf) free(jpg_buf);
                }
            }
        }

        // small delay to let camera update frames; tune if necessary
        delay(80);
    }

    if (!best_jpg || best_jpg_len == 0) {
        Serial.println("capture_best: no suitable frame found to enqueue");
        result = false;
    }
    // build job and enqueue
    uint8_t *payload = (uint8_t*)malloc(best_jpg_len);
    if (!payload) {
        Serial.println("capture_best: malloc failed for payload");
        if (best_must_free && best_jpg) free(best_jpg);
        xSemaphoreGive(camAIMutex);
        return false;
    }
    memcpy(payload, best_jpg, best_jpg_len);

    UploadJob job;
    memset(&job, 0, sizeof(job));
    strncpy(job.employee, employeeId.c_str(), sizeof(job.employee) - 1);
    make_timestamp(job.timestamp, sizeof(job.timestamp));
    job.data = payload;
    job.len = best_jpg_len;

    if (uploadQueue == NULL) {
        Serial.println("capture_best: uploadQueue not created");
        free(payload);
        if (best_must_free && best_jpg) free(best_jpg);
        xSemaphoreGive(camAIMutex);
        return false;
    }

    if (xQueueSend(uploadQueue, &job, 0) != pdTRUE) {
        Serial.println("capture_best: upload queue full");
        free(payload);
        if (best_must_free && best_jpg) free(best_jpg);
        xSemaphoreGive(camAIMutex);
        return false;
    }

    Serial.println("capture_best: enqueued best frame for upload");
    result = true;

    if (best_must_free && best_jpg) free(best_jpg);
    Serial.println("[BEST] give camAIMutex");
    xSemaphoreGive(camAIMutex);
    } else {
        Serial.println("capture_best: Failed to get camAIMutex (timeout)");
        result = false;
    }
    return result;
}

// Helper: detect then recognize using current camera.frame. Returns true if recognition produced match info.
static bool detectAndRecognize(String &outName, float &outSim, face_t &outFace) {
    if (!camera.hasFrame()) return false;
    camera_fb_t* fb = camera.frame;
    if (!fb) return false;

    if (!detection.run().isOk()) return false;
    if (detection.notFound()) return false;
    outFace = detection.first;
    if (!recognition.recognize().isOk()) return false;
    outName = recognition.match.name;
    outSim = recognition.match.similarity;
    return true;
}

// Handle a recognition result: implement consecutive confirmation and enqueue an upload when confirmed
static void handleRecognitionResult(const String &name, float similarity, const face_t &face) {
    if (name.length() == 0 || name == "unknown" || similarity < RECOG_SIMILARITY_THRESHOLD) {
        // not a reliable candidate
        lastCandidateName = "";
        candidateCount = 0;
        candidateLastSeen = 0;
        return;
    }

    unsigned long now = millis();
    if (name == lastCandidateName && (now - candidateLastSeen) <= CONSISTENT_WINDOW_MS) {
        candidateCount++;
    } else {
        lastCandidateName = name;
        candidateCount = 1;
    }
    candidateLastSeen = now;
    Serial.printf("Candidate %s count=%d sim=%.4f\n", name.c_str(), candidateCount, similarity);

    if (candidateCount >= REQUIRED_CONSISTENT_MATCHES) {
        Serial.printf("Confirmed %s after %d matches, similarity=%.4f\n", name.c_str(), candidateCount, similarity);
        lastRecognitionTime = now;
        // try to enqueue best-of-N capture for higher-quality proof image
        bool ok = capture_best_and_enqueue(name, 6, 85);
        if (!ok) {
            // fallback: use immediate current frame but enqueue to background
            sendAttendanceProof(name);
        }
        // reset candidate
        lastCandidateName = "";
        candidateCount = 0;
        candidateLastSeen = 0;
    }
}

// enrollTask: waits for EnrollJob from queue and runs enrollRoutine
static void enrollTask(void *pvParameters) {
    EnrollJob job;
    for (;;) {
        if (xQueueReceive(enrollQueue, &job, portMAX_DELAY) == pdTRUE) {
            if (job.name[0] == '\0') continue;
            String sname = String(job.name);
            Serial.printf("enrollTask: starting enroll for %s samples=%d\n", job.name, job.samples);
            gEnrollingInProgress = true; // pause recognition
            enrollRoutine(sname, job.samples);
            gEnrollingInProgress = false; // resume recognition
            Serial.printf("enrollTask: finished enroll for %s\n", job.name);
        }
        // small yield
        vTaskDelay(10 / portTICK_PERIOD_MS);
    }
}

// NOTE: websocket handling is run from the main loop() to avoid concurrency with
// the camera/recognition code and to prevent issues observed when running the
// WebSocketsClient in a separate FreeRTOS task on this board.

// enqueue a text message to be sent by wsTask
static bool wsSendTxt(const String &msg) {
    if (wsSendQueue == NULL) return false;
    WSMessage m;
    memset(&m, 0, sizeof(m));
    strncpy(m.payload, msg.c_str(), sizeof(m.payload) - 1);
    BaseType_t ok = xQueueSend(wsSendQueue, &m, 10 / portTICK_PERIOD_MS);
    return ok == pdTRUE;
}

// Background sender task: receives UploadJob from queue, saves to SPIFFS using the job timestamp,
// then performs an HTTP multipart POST to API_URL. Always frees job.data.
static void senderTask(void *pvParameters) {
    UploadJob job;
    for (;;) {
        if (xQueueReceive(uploadQueue, &job, portMAX_DELAY) == pdTRUE) {
            // ensure null-termination
            job.timestamp[sizeof(job.timestamp)-1] = '\0';
            job.employee[sizeof(job.employee)-1] = '\0';

            // create filename from employee and timestamp (sanitize employee name first)
            char safe_emp[48];
            sanitize_name_for_file(job.employee, safe_emp, sizeof(safe_emp));
            // create filename
            char filename[160];
            snprintf(filename, sizeof(filename), "/%s-%s.jpg", safe_emp, job.timestamp);

            // save to SPIFFS
            File f = SPIFFS.open(filename, FILE_WRITE);
            if (!f) {
                Serial.printf("Loi: Khong the mo file %s de luu\n", filename);
            } else {
                size_t written = f.write(job.data, job.len);
                f.close();
                Serial.printf("Da luu file %s (%u bytes)\n", filename, (unsigned)written);
            }

            // Send to server (only HTTP supported here)
            String url = API_URL;
            String host;
            uint16_t port = 80;
            String path = "/";
            if (url.startsWith("http://")) {
                url = url.substring(7);
                port = 80;
            } else if (url.startsWith("https://")) {
                Serial.println("HTTPS not supported by senderTask (needs WiFiClientSecure)");
                free(job.data);
                continue;
            }
            int slashIdx = url.indexOf('/');
            if (slashIdx == -1) {
                host = url;
                path = "/";
            } else {
                host = url.substring(0, slashIdx);
                path = url.substring(slashIdx);
            }
            int colonIdx = host.indexOf(':');
            if (colonIdx != -1) {
                port = host.substring(colonIdx + 1).toInt();
                host = host.substring(0, colonIdx);
            }

            Serial.printf("[senderTask] Posting to host=%s port=%u path=%s\n", host.c_str(), port, path.c_str());

            WiFiClient client;
            const int MAX_RETRIES = 3; // Thử kết nối tối đa 3 lần
            int retries = 0;
            bool connected = false;

            while (retries < MAX_RETRIES && !connected) {
                if (client.connect(host.c_str(), port)) {
                    connected = true; // Kết nối thành công!
                } else {
                    retries++;
                    Serial.printf("[senderTask] Ket noi server that bai. Thu lai (%d/%d)...\n", retries, MAX_RETRIES);
                    vTaskDelay(2000 / portTICK_PERIOD_MS); // Chờ 2 giây trước khi thử lại
                }
            }

            // Nếu sau 3 lần vẫn thất bại, mới chịu bỏ cuộc
            if (!connected) {
                Serial.println("[senderTask] Loi: Khong the ket noi den server sau 3 lan thu.");
                free(job.data);
                continue;
            }

            String boundary = "----ESP32Boundary7MA4YWxk";
            String body_start = "--" + boundary + "\r\n";
            body_start += "Content-Disposition: form-data; name=\"employee_id\"\r\n\r\n";
            body_start += String(job.employee) + "\r\n";

            // use basename for uploaded filename
            const char *basename = filename;
            if (basename[0] == '/') basename++;
            String image_header = "--" + boundary + "\r\n";
            image_header += "Content-Disposition: form-data; name=\"image\"; filename=\"" + String(basename) + "\"\r\n";
            image_header += "Content-Type: image/jpeg\r\n\r\n";
            String body_end = "\r\n--" + boundary + "--\r\n";
            size_t totalLen = body_start.length() + image_header.length() + job.len + body_end.length();

            String req = String("POST ") + path + " HTTP/1.1\r\n";
            req += String("Host: ") + host + ":" + String(port) + "\r\n";
            req += "User-Agent: ESP32-CAM\r\n";
            req += "Connection: close\r\n";
            req += "Content-Type: multipart/form-data; boundary=" + boundary + "\r\n";
            req += "Content-Length: " + String(totalLen) + "\r\n\r\n";

            client.print(req);
            client.print(body_start);
            client.print(image_header);
            size_t w = client.write(job.data, job.len);
            client.print(body_end);

            unsigned long timeout = millis() + 5000;
            while(!client.available() && millis() < timeout) {
                delay(10);
            }
            if (client.available()) {
                String status = client.readStringUntil('\n');
                status.trim();
                Serial.println(status);
                while(client.available()) {
                    String line = client.readStringUntil('\n');
                    Serial.println(line);
                }
            } else {
                Serial.println("[senderTask] Loi: Khong nhan duoc phan hoi tu server (timeout)");
            }

            client.stop();
            free(job.data);
        }
    }
}

// Recognition task: moved from Arduino loop() to a dedicated FreeRTOS task
static void recognitionTask(void *pvParameters) {
    (void) pvParameters;
    for (;;) {
        // If an enrollment is in progress, pause recognition to free camera
        if (gEnrollingInProgress) {
            vTaskDelay(50 / portTICK_PERIOD_MS);
            continue;
        }
        String localName = "";
        float localSim = 0.0f;
        face_t localFace = {0,0,0,0,0};

        Serial.println("[REC] waiting camAIMutex...");
        if (xSemaphoreTake(camAIMutex, portMAX_DELAY) == pdTRUE) {
            Serial.println("[REC] got camAIMutex");
            // 1) Capture a frame
            if (!camera.capture().isOk()) {
                Serial.println(camera.exception.toString());
                Serial.println("[REC] give camAIMutex (capture fail)");
                xSemaphoreGive(camAIMutex);
                vTaskDelay(10 / portTICK_PERIOD_MS);
                continue;
            }
            camera_fb_t* fb = camera.frame;
            if (!fb) {
                Serial.println("Frame buffer is null");
                Serial.println("[REC] give camAIMutex (fb null)");
                xSemaphoreGive(camAIMutex);
                vTaskDelay(10 / portTICK_PERIOD_MS);
                continue;
            }

            // 2) Draw to TFT
            tft.pushImage(0, 0, fb->width, fb->height, (uint16_t*)fb->buf);
            // --- BẮT ĐẦU CODE SIDEBAR ---
            // Luôn xóa sidebar trước khi vẽ nội dung mới
            tft.fillRect(240, 0, 80, 240, TFT_BLACK); 

            // Hiển thị thời gian (nếu có)
            char time_buf[20];
            time_t now = time(NULL);
            if (now > 1600000000) {
                struct tm t;
                localtime_r(&now, &t);
                snprintf(time_buf, sizeof(time_buf), "%02d:%02d:%02d", t.tm_hour, t.tm_min, t.tm_sec);
                tft.setTextColor(TFT_CYAN, TFT_BLACK);
                tft.setCursor(245, 220); // Đặt ở dưới cùng
                tft.setTextSize(1);
                tft.print(time_buf);
            }

            // 3) Detection: is a face present?
            bool faceIsPresent = detection.run().isOk();
            if (!faceIsPresent || detection.notFound()) {
                faceWasPresentInPreviousFrame = false;
                gStableFrames = 0;
                gLastCX = gLastCY = -1;

                // --- SIDEBAR STATUS ---
                tft.setTextColor(TFT_GREEN, TFT_BLACK);
                tft.setCursor(245, 10);
                tft.setTextSize(2);
                tft.print("SCAN");
                // --- KẾT THÚC ---
                Serial.println("[REC] give camAIMutex (no face)");
                xSemaphoreGive(camAIMutex);
                
                vTaskDelay(40 / portTICK_PERIOD_MS);
                continue;
            }

            // Box info
            face_t f = detection.first;
            int cx = f.x + f.width / 2;
            int cy = f.y + f.height / 2;
            size_t area = (size_t)f.width * (size_t)f.height;

            // yêu cầu kích thước tối thiểu
            if ((int)area < RECOG_MIN_FACE_AREA) {
                tft.drawRect(f.x, f.y, f.width, f.height, TFT_YELLOW);
                gStableFrames = 0;
                gLastCX = cx; gLastCY = cy; gLastArea = area;

                // --- SIDEBAR STATUS ---
                tft.setTextColor(TFT_YELLOW, TFT_BLACK);
                tft.setCursor(245, 10);
                tft.setTextSize(2);
                tft.print("SCAN");
                tft.setCursor(245, 40);
                tft.setTextSize(1);
                tft.print("Lai gan hon");
                // --- KẾT THÚC ---
                Serial.println("[REC] give camAIMutex (face too small)");
                xSemaphoreGive(camAIMutex);
                vTaskDelay(40 / portTICK_PERIOD_MS);
                
                continue;
            }

            // kiểm tra ổn định vị trí giữa các khung
            if (gLastCX < 0) {
                gStableFrames = 1;
            } else {
                int dx = abs(cx - gLastCX);
                int dy = abs(cy - gLastCY);
                if (dx <= RECOG_MAX_CENTER_DELTA && dy <= RECOG_MAX_CENTER_DELTA) {
                    gStableFrames++;
                } else {
                    gStableFrames = 1;
                }
            }
            gLastCX = cx; gLastCY = cy; gLastArea = area;

            // Skip first frame after face appears and until stable for N frames
            if (!faceWasPresentInPreviousFrame || gStableFrames < RECOG_STABLE_FRAMES) {
                faceWasPresentInPreviousFrame = true;
                tft.drawRect(f.x, f.y, f.width, f.height, TFT_YELLOW);

                // --- SIDEBAR STATUS ---
                tft.setTextColor(TFT_YELLOW, TFT_BLACK);
                tft.setCursor(245, 10);
                tft.setTextSize(2);
                tft.print("SCAN");
                tft.setCursor(245, 40);
                tft.setTextSize(1);
                tft.print("Giu yen...");
                // --- KẾT THÚC ---
                Serial.println("[REC] give camAIMutex (stabilizing)");
                xSemaphoreGive(camAIMutex);
                vTaskDelay(40 / portTICK_PERIOD_MS);
               
                continue;
            }

            // respect cooldown after a successful recognition
            if (millis() - lastRecognitionTime < COOLDOWN_PERIOD) {
                tft.drawRect(f.x, f.y, f.width, f.height, TFT_ORANGE);

                // --- SIDEBAR STATUS ---
                tft.setTextColor(TFT_ORANGE, TFT_BLACK);
                tft.setCursor(245, 10);
                tft.setTextSize(2);
                tft.print("WAIT");
                tft.setCursor(245, 40);
                tft.setTextSize(1);
                tft.print(lastCandidateName); // Hiển thị tên người vừa quét
                // --- KẾT THÚC ---
                Serial.println("[REC] give camAIMutex (cooldown)");
                xSemaphoreGive(camAIMutex);
                //vTaskDelay(40 / portTICK_PERIOD_MS);
                vTaskDelay(10 / portTICK_PERIOD_MS);
                continue;
            }

            // hạn chế tần suất gọi recognize
            unsigned long nowMs = millis();
            if (nowMs - gLastRecognitionAttempt < RECOG_MIN_INTERVAL_MS) {
                tft.drawRect(f.x, f.y, f.width, f.height, TFT_GREEN);
                Serial.println("[REC] give camAIMutex (min interval)");
                xSemaphoreGive(camAIMutex);
                //vTaskDelay(40 / portTICK_PERIOD_MS);
                vTaskDelay(10 / portTICK_PERIOD_MS);
                continue;
            }

            // 4) Recognition: perform while holding the camera lock, then copy results
            Serial.println("[REC] recognition.recognize()...");
            if (recognition.recognize().isOk()) {
                localName = recognition.match.name;
                localSim = recognition.match.similarity;
                localFace = f;
                gLastRecognitionAttempt = nowMs;
            } else {
                // no reliable recognition result, copy detection box for UI
                localName = "";
                localSim = 0.0f;
                localFace = f;
                gLastRecognitionAttempt = nowMs;
            }

            // release camera lock before calling handlers that may also take it
            Serial.println("[REC] give camAIMutex (after recognize)");
            xSemaphoreGive(camAIMutex);
        }

        // Now handle recognition result outside the camera mutex (handlers will take it if needed)
        if (localName.length() > 0 && localSim > 0.1f && localName != "unknown") {
            tft.setTextColor(TFT_GREEN, TFT_BLACK);
            tft.setCursor(245, 10);
            tft.setTextSize(2);
            tft.print("OK");
            tft.setCursor(245, 40);
            tft.setTextSize(1);
            tft.println(localName);
            tft.setCursor(245, 60);
            tft.print(String(localSim, 2));
            handleRecognitionResult(localName, localSim, localFace);
        } else {
            // draw yellow detection box (no confirmed recognition)
            tft.setTextColor(TFT_RED, TFT_BLACK);
            tft.setCursor(245, 10);
            tft.setTextSize(2);
            tft.print("SCAN");
            tft.setCursor(245, 40);
            tft.setTextSize(1);
            tft.print("Unknown");
            tft.drawRect(localFace.x, localFace.y, localFace.width, localFace.height, TFT_YELLOW);
        }

        // small sleep to yield CPU
        //vTaskDelay(80 / portTICK_PERIOD_MS);
        vTaskDelay(10 / portTICK_PERIOD_MS);
    }
}

void sendAttendanceProof(String employeeId){
    // New implementation: capture in current camera format (don't switch to JPEG)
    // Convert to JPEG only if needed to avoid interrupting the camera stream used by recognition.
    Serial.println("Chuan bi gui bang chung...");
    tft.drawString("Dang luu...", 100,100,2);

    // Ensure exclusive access to camera/frame data
    if (camAIMutex == NULL) {
        Serial.println("sendAttendanceProof: camAIMutex is NULL");
    }
    Serial.println("[SEND] waiting camAIMutex...");
    if (xSemaphoreTake(camAIMutex, pdMS_TO_TICKS(5000)) != pdTRUE) {
        Serial.println("sendAttendanceProof: Failed to take camAIMutex, aborting");
        return;
    }
    Serial.println("[SEND] got camAIMutex");

    // Use the already-captured frame from the main loop to avoid interrupting the stream.
    // Do NOT call camera.capture() here because the main loop already has the current frame.
    camera_fb_t* fb = camera.frame;
    if (!camera.hasFrame()) {
        Serial.println("Khong co frame de gui (camera.frame null)!");
        Serial.println("[SEND] give camAIMutex (no frame)");
        xSemaphoreGive(camAIMutex);
        return;
    }
    if(!fb){
        Serial.println("Khung hinh bi loi!");
        Serial.println("[SEND] give camAIMutex (fb null)");
        xSemaphoreGive(camAIMutex);
        return;
    }

    Serial.printf("Da chup anh: %u bytes | format=%d\n", (unsigned)fb->len, (int)fb->format);

    // If frame is not JPEG, convert it to JPEG in memory
    uint8_t * jpg_buf = NULL;
    size_t jpg_len = 0;
    const uint8_t * img_buf = NULL;
    size_t img_len = 0;
    bool must_free = false;

    if (fb->format == PIXFORMAT_JPEG) {
        img_buf = fb->buf;
        img_len = fb->len;
    } else {
        // encode to JPEG (quality 80)
        if (frame2jpg(fb, 80, &jpg_buf, &jpg_len)) {
            img_buf = jpg_buf;
            img_len = jpg_len;
            must_free = true;
            Serial.printf("Encoded RGB->JPEG: %u bytes\n", (unsigned)img_len);
        } else {
            Serial.println("Failed to encode frame to JPEG");
            if (jpg_buf) free(jpg_buf);
            return;
        }
    }

    // Instead of uploading synchronously, enqueue the JPEG buffer for background upload
    uint8_t *payload = (uint8_t*)malloc(img_len);
    if (!payload) {
        Serial.println("Loi: Khong du bo nho de luu anh tam (malloc failed)");
        if (must_free && jpg_buf) free(jpg_buf);
        Serial.println("[SEND] give camAIMutex (malloc fail)");
        xSemaphoreGive(camAIMutex);
        return;
    }
    memcpy(payload, img_buf, img_len);

    UploadJob job;
    memset(&job, 0, sizeof(job));
    strncpy(job.employee, employeeId.c_str(), sizeof(job.employee) - 1);
    make_timestamp(job.timestamp, sizeof(job.timestamp));
    job.data = payload;
    job.len = img_len;

    if (uploadQueue == NULL) {
        Serial.println("Loi: uploadQueue chua duoc tao");
        free(payload);
        if (must_free && jpg_buf) free(jpg_buf);
        Serial.println("[SEND] give camAIMutex (queue missing)");
        xSemaphoreGive(camAIMutex);
        return;
    }

    if (xQueueSend(uploadQueue, &job, 0) != pdTRUE) {
        Serial.println("Upload queue full, bo qua luu anh");
        free(payload);
        if (must_free && jpg_buf) free(jpg_buf);
        Serial.println("[SEND] give camAIMutex (queue full)");
        xSemaphoreGive(camAIMutex);
        return;
    }

    // we copied the data into payload; free temporary encoder buffer if any
    if (must_free && jpg_buf) free(jpg_buf);

    Serial.println("Anh da duoc dua vao hang doi upload (background)");
    // release camera mutex and return so stream continues
    Serial.println("[SEND] give camAIMutex (done)");
    xSemaphoreGive(camAIMutex);
    return;
}

void loop() {
    // main Arduino loop is now idle; recognition and camera work are handled
    // by the `recognitionTask` FreeRTOS task which has a larger stack.
    Serial.println("--- HEAP VA STACK HIGH WATER MARKS ---");

    // 1. In thông tin HEAP (RAM nội bộ) và PSRAM
    Serial.printf("HEAP: Con trong %u / Tong %u\n", ESP.getFreeHeap(), ESP.getHeapSize());
    Serial.printf("PSRAM: Con trong %u / Tong %u\n", ESP.getFreePsram(), ESP.getPsramSize());

    // 2. In HWM của từng tác vụ (số byte còn trống)
    if (g_recogTaskHandle)
        Serial.printf(" - RecogTask HWM (Core 1): %u bytes\n", uxTaskGetStackHighWaterMark(g_recogTaskHandle));
    if (g_enrollTaskHandle)
        Serial.printf(" - EnrollTask HWM (Core 1): %u bytes\n", uxTaskGetStackHighWaterMark(g_enrollTaskHandle));
    if (g_senderTaskHandle)
        Serial.printf(" - SenderTask HWM (Core 0): %u bytes\n", uxTaskGetStackHighWaterMark(g_senderTaskHandle));
    if (g_wsTaskHandle)
        Serial.printf(" - WsTask HWM (Core 0): %u bytes\n", uxTaskGetStackHighWaterMark(g_wsTaskHandle));
    
    // Tác vụ loop này cũng có HWM!
    Serial.printf(" - LoopTask HWM (Core %d): %u bytes\n", xPortGetCoreID(), uxTaskGetStackHighWaterMark(NULL)); // NULL = tác vụ hiện tại

    Serial.println("---------------------------------------");

    vTaskDelay(5000 / portTICK_PERIOD_MS); // Ngủ 5 giây
}

// Xóa toàn bộ dữ liệu khuôn mặt đã enroll để tất cả trở thành "unknown"
static void clearRecognitionDatabase() {
    Serial.println("[DB] Clearing recognition database...");
    // Tạm dừng nhận diện để tránh truy cập đồng thời
    bool prevPause = gEnrollingInProgress;
    gEnrollingInProgress = true;
    vTaskDelay(50 / portTICK_PERIOD_MS);

    // // Không bắt buộc phải giữ camera, nhưng để an toàn ta lấy mutex ngắn
    // bool took = false;
    // if (camAIMutex && xSemaphoreTake(camAIMutex, portMAX_DELAY) == pdTRUE) {
    //     took = true;
    // }

    // // API của thư viện: xóa toàn bộ dữ liệu đã enroll
    // recognition.deleteAll();

    // // reset trạng thái xác nhận liên tiếp
    // lastCandidateName = "";
    // candidateCount = 0;
    // candidateLastSeen = 0;

    // if (took) xSemaphoreGive(camAIMutex);

    Serial.println("[DB] Waiting for camAIMutex...");
    if (camAIMutex && xSemaphoreTake(camAIMutex, portMAX_DELAY) == pdTRUE) {
        Serial.println("[DB] Got camAIMutex.");

        // 1. API của thư viện: xóa toàn bộ dữ liệu đã enroll (trong RAM list)
        recognition.deleteAll();
        Serial.println("[DB] recognition.deleteAll() OK (RAM list cleared).");

        // 2. (FIX) Xóa file vĩnh viễn trong SPIFFS
        Serial.println("[DB] Xoa file vinh vien trong SPIFFS (Root)...");
        File root = SPIFFS.open("/");
        if (root && root.isDirectory()) {
            File file = root.openNextFile();
            int deleted_count = 0;
            while (file) {
                if (!file.isDirectory()) {
                    // file.name() THƯỜNG TRẢ VỀ ĐƯỜNG DẪN ĐẦY ĐỦ (VÍ DỤ: "/hung1.json")
                    String filepath = file.name(); 
                    
                    if (filepath.endsWith(".json")) {
                        Serial.printf("[DB] Dang xoa file enrollment: %s\n", filepath.c_str());
                        
                        // (FIX) Dùng trực tiếp filepath và KIỂM TRA KẾT QUẢ
                        if (SPIFFS.remove(filepath)) {
                            Serial.println("[DB] -> Xoa thanh cong.");
                            deleted_count++;
                        } else {
                            Serial.println("[DB] -> LOI: Xoa file that bai!");
                        }
                    }
                }
                file = root.openNextFile();
            }
            root.close();
            Serial.printf("[DB] Da xoa %d file enrollment.\n", deleted_count);
        } else {
            Serial.println("[DB] Khong mo duoc thu muc root '/'");
        }

        // 3. (FIX) Yeu cau tai lai (re-load) engine nhan dang tu SPIFFS (nay da trong rong)
        Serial.println("[DB] Dang tai lai recognition engine (de xoa RAM)...");
        if (!recognition.begin().isOk()) {
            Serial.println("[DB] LOI: Khong the khoi dong lai recognition engine!");
            ESP.restart(); // An toàn nhất là khởi động lại nếu lỗi
        } else {
            Serial.println("[DB] Recognition engine da duoc tai lai (trong).");
        }

        // 4. Reset trạng thái
        lastCandidateName = "";
        candidateCount = 0;
        candidateLastSeen = 0;

        Serial.println("[DB] Giving camAIMutex.");
        xSemaphoreGive(camAIMutex);
    } else {
        Serial.println("[DB] FAILED to get camAIMutex!");
    }

    // cập nhật UI + thông báo
    tft.fillScreen(TFT_BLACK);
    tft.setTextColor(TFT_WHITE);
    tft.drawString("Database cleared", 5, 5, 2);
    wsSendTxt("db_cleared");
    Serial.println("[DB] Database cleared");

    // tiếp tục nhận diện nếu trước đó không tạm dừng
    gEnrollingInProgress = prevPause;
}

// Dump enrolled faces to Serial for verification and notify via WebSocket/TFT
static void dumpRecognitionDatabase() {
    Serial.println("[DB] Dumping enrolled faces...");
    // Pause recognition briefly
    bool prevPause = gEnrollingInProgress;
    gEnrollingInProgress = true;
    vTaskDelay(20 / portTICK_PERIOD_MS);

    bool took = false;
    if (camAIMutex && xSemaphoreTake(camAIMutex, pdMS_TO_TICKS(2000)) == pdTRUE) {
        took = true;
    }

    // The library prints the list of enrolled faces to Serial
    // Use monitor to see the output
    recognition.dump();

    if (took) xSemaphoreGive(camAIMutex);

    // UI + WS notify
    tft.fillScreen(TFT_BLACK);
    tft.setTextColor(TFT_WHITE);
    tft.drawString("Dump faces -> Serial", 5, 5, 2);
    wsSendTxt("db_dumped");
    Serial.println("[DB] Dump done (see Serial log)");

    gEnrollingInProgress = prevPause;
}

String prompt(String message) {
    String answer;

    do {
        Serial.print(message);

        while (!Serial.available())
            delay(1);

        answer = Serial.readStringUntil('\n');
        answer.trim();
    } while (!answer);

    Serial.print(" ");
    Serial.println(answer);
    return answer;
}


/**
 * Enroll new person
 */
void enroll() {
    String name = prompt("Enter person name:");
    if (!name || name.length() == 0) return;
    // enqueue enroll job rather than running inline (prevents blocking)
    if (enrollQueue) {
        EnrollJob job;
        memset(&job, 0, sizeof(job));
        strncpy(job.name, name.c_str(), sizeof(job.name) - 1);
        job.samples = 6;
        if (xQueueSend(enrollQueue, &job, 0) != pdTRUE) {
            Serial.println("enrollQueue full, running enroll inline");
            enrollRoutine(name, 6);
        }
    } else {
        enrollRoutine(name, 6);
    }
}

// Enhanced enroll routine: capture multiple samples and call recognition.enroll for each
static void enrollRoutine(const String &name, int samples) {
    Serial.printf("Starting enhanced enroll for %s (%d samples)\n", name.c_str(), samples);
    const size_t MIN_FACE_AREA = 1500; // kích thước tối thiểu để coi là hợp lệ
    const uint32_t WAIT_FACE_TIMEOUT_MS = 15000; // tối đa 15s để chờ người dùng đưa mặt vào
    const int STABLE_FRAMES = 3; // cần thấy mặt ổn định N khung hình liên tiếp

    int successes = 0;
    int required = max(1, (samples * 70 + 99) / 100); // yêu cầu ~70% mẫu thành công

    tft.fillScreen(TFT_BLACK);
    tft.setTextColor(TFT_WHITE);
    tft.drawString("Enroll: " + name, 5, 5, 2);
    bool took = false;
    Serial.println("[ENR] waiting camAIMutex...");
    if (xSemaphoreTake(camAIMutex, pdMS_TO_TICKS(10000)) == pdTRUE) {
        took = true;
        Serial.println("[ENR] got camAIMutex");
        // --- (FIX) Them code "moi" camera ---
        Serial.println("[ENR] Priming camera...");
        camera.capture(); // Bỏ qua 1 khung hình đầu để camera ổn định
        vTaskDelay(20 / portTICK_PERIOD_MS);
        // --- KET THUC FIX ---

        // Thu thập lần lượt tới khi đủ số mẫu thành công
        for (int s = 0; s < samples; ) {
            // Hiển thị hướng dẫn
            // tft.fillRect(0, 20, 320, 60, TFT_BLACK);
            // tft.drawString("Mau " + String(s + 1) + "/" + String(samples) + ": Nhin thang & giu yen", 5, 30, 2);

            uint32_t start = millis();
            int stable = 0;
            bool gotFace = false;
            face_t f = {0,0,0,0,0};

            // Chờ người dùng đưa mặt vào và giữ ổn định
           while (millis() - start < WAIT_FACE_TIMEOUT_MS) {
                
                // 1. Luôn chụp ảnh
                if (!camera.capture().isOk()) {
                    Serial.println("enroll: camera.capture failed");
                    delay(80);
                    continue; // Chấp nhận bỏ qua khung hình này nếu chụp lỗi
                }

                // 2. Luôn đẩy ảnh lên LCD để "stream"
                camera_fb_t* fb = camera.frame;
                if (fb && fb->buf && fb->width > 0 && fb->height > 0) {
                    tft.pushImage(0, 0, fb->width, fb->height, (uint16_t*)fb->buf);
                    // --- BẮT ĐẦU CODE SIDEBAR ENROLL ---
                    tft.fillRect(240, 0, 80, 240, TFT_BLACK); 
                    tft.setTextColor(TFT_CYAN, TFT_BLACK);
                    tft.setCursor(245, 10);
                    tft.setTextSize(2);
                    tft.print("ENROLL");

                    tft.setCursor(245, 40);
                    tft.setTextSize(1);
                    tft.println(name); // 'name' có sẵn trong hàm này

                    tft.setCursor(245, 80);
                    tft.print("Mau:");
                    tft.setCursor(245, 90);
                    tft.setTextSize(2);
                    tft.print(String(s + 1) + "/" + String(samples)); // 's' và 'samples' có sẵn
                    // --- KẾT THÚC CODE SIDEBAR ENROLL ---
                } else {
                    delay(80);
                    continue; // Frame lỗi, bỏ qua
                }

                // 3. Chạy nhận diện trên khung hình vừa hiển thị
                if (!detection.run().isOk() || detection.notFound()) {
                    // chưa thấy mặt
                    stable = 0;
                    delay(80); // Thêm delay nhỏ
                    continue; // Quay lại vòng lặp (để chụp và stream tiếp)
                }

                f = detection.first;
                size_t area = (size_t)f.width * (size_t)f.height;
                
                if (area < MIN_FACE_AREA) {
                    // mặt quá nhỏ / quá xa
                    stable = 0;
                    tft.drawRect(f.x, f.y, f.width, f.height, TFT_YELLOW); // Vẽ vàng nếu quá nhỏ
                    delay(80); // Thêm delay nhỏ
                    continue; // Quay lại vòng lặp
                }

                // 4. Nếu mặt OK (đủ lớn), vẽ khung xanh
                tft.drawRect(f.x, f.y, f.width, f.height, TFT_GREEN);
                stable++;
                
                if (stable >= STABLE_FRAMES) {
                    gotFace = true;
                    break; // Đã tìm thấy, thoát vòng lặp while
                }
                
                delay(80); // Thêm delay nhỏ để chờ khung hình tiếp theo
            }

            if (!gotFace) {
                Serial.println("enroll: timeout waiting for a valid face, retrying same sample");
                // Không tăng s, cho người dùng thêm thời gian đưa mặt vào
                continue;
            }

            // attempt to enroll current frame (truncate name to max 16 chars)
            String nameTrunc = name;
            if (nameTrunc.length() > 16) {
                Serial.printf("[ENR] Name too long (%d), trunc to 16\n", nameTrunc.length());
                nameTrunc = nameTrunc.substring(0, 16);
            }
            if (recognition.enroll(nameTrunc).isOk()) {
                successes++;
                s++; // chỉ tăng chỉ số mẫu khi enroll thành công
                Serial.printf("enroll: sample ok (%d/%d)\n", successes, samples);
            } else {
                Serial.print("enroll: recognition.enroll failed for this sample: ");
                Serial.println(recognition.exception.toString());
                // Cho phép thử lại cùng mẫu s hiện tại
            }

            // Gửi tiến độ tới admin
            String prog = String("progress:") + name + ":" + String(successes) + "/" + String(samples);
            wsSendTxt(prog);

            // Nghỉ ngắn giữa các mẫu
            int pauseMs = 350;
            int step = 50;
            for (int t = 0; t < pauseMs; t += step) {
                pumpWebSocket(step);
            }
        }
    } else {
        Serial.println("enrollRoutine: Failed to get camAIMutex (timeout)");
        tft.drawString("Loi: Camera dang ban!", 5, 60, 2);
    }

    // Trả mutex nếu đã lấy
    if (took) {
        Serial.println("[ENR] give camAIMutex");
        xSemaphoreGive(camAIMutex);
    }

    if (successes >= required) {
        Serial.printf("Enroll completed: %d/%d (required %d)\n", successes, samples, required);
        tft.drawString("Enroll success", 5, 60, 2);
    } else {
        Serial.printf("Enroll insufficient: %d/%d (required %d)\n", successes, samples, required);
        tft.drawString("Enroll failed - try again", 5, 60, 2);
    }

    // Thông báo hoàn tất tới admin
    {
        String doneMsg = String("enroll_done:") + name + ":" + String(successes) + "/" + String(samples);
        wsSendTxt(doneMsg);
    }
    delay(1000);
    tft.fillScreen(TFT_BLACK);
}


/**
 * Recognize current face
 */
void recognize() {
    if (!recognition.recognize().isOk()) {
        Serial.println(recognition.exception.toString());
        return;
    }


    
  }
