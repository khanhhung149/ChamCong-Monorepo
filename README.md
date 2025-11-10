# ChamCong-Monorepo (Employee Timekeeping System)

Một dự án monorepo full-stack cho hệ thống chấm công, bao gồm backend Node.js, web admin panel và thiết bị kiosk phần cứng ESP32-S3.

## 🚀 About The Project

Dự án này cung cấp một giải pháp toàn diện để theo dõi chấm công của nhân viên. Nó kết hợp một thiết bị phần cứng (Kiosk) để check-in/out theo thời gian thực (sử dụng camera, RFID, v.v.) và một ứng dụng web để quản trị viên quản lý nhân viên, xem báo cáo và cấu hình hệ thống.

## ✨ Key Features

* ✅ **Quản lý nhân viên:** Thêm, sửa, xóa thông tin nhân viên.
* ✅ **Kiosk phần cứng:** Check-in và check-out theo thời gian thực bằng thiết bị ESP32-S3.
* ✅ **Xác thực:** (ví dụ: Đăng nhập an toàn cho quản trị viên, xác thực RFID/Vân tay cho nhân viên).
* ✅ **Báo cáo chấm công:** Tạo báo cáo chấm công hàng ngày, hàng tuần và hàng tháng.
* ✅ **Cập nhật theo thời gian thực:** (ví dụ: Bảng điều khiển trực tiếp hiển thị ai đang có mặt).
* ✅ **Quản lý nghỉ phép:** (ví dụ: Nhân viên có thể yêu cầu nghỉ phép và quản trị viên có thể phê duyệt/từ chối).
* *(Thêm các tính năng khác của bạn tại đây...)*

## 🛠️ Technology Stack

Liệt kê các công nghệ, framework và phần cứng chính được sử dụng.

### Backend (`/backend`)

* **Ngôn ngữ:** JavaScript (hoặc TypeScript)
* **Framework:** (ví dụ: **Node.js**, **Express.js**, NestJS...)
* **Cơ sở dữ liệu:** (ví dụ: **MongoDB**, **PostgreSQL**, **MySQL**...)
* **Xác thực:** (ví dụ: **JWT (JSON Web Tokens)**)
* **Real-time:** (ví dụ: **Socket.IO** hoặc **WebSockets**)

### Web Frontend (`/frontend/ChamCong-Kiosk-ESP32S3`)

* **Framework:** (ví dụ: **React**, **Vue.js**, **Angular**...)
* **Ngôn ngữ:** JavaScript (hoặc TypeScript)
* **Thư viện UI:** (ví dụ: **Material-UI**, **Ant Design**, **Tailwind CSS**...)

### Hardware Kiosk (`/doan`)

* **Ngôn ngữ:** **C++**
* **Nền tảng:** (ví dụ: **Arduino Framework**, **ESP-IDF**...)
* **Vi điều khiển:** **ESP32-S3**
* **Phần cứng:** (ví dụ: **Camera OV5640**, **Đầu đọc RFID**, **Cảm biến vân tay**...)

## 📦 Repository Structure

Đây là một monorepo chứa tất cả các phần của hệ thống:

```bash
ChamCong-Monorepo/
├── backend/                   # Backend API (ví dụ: Node.js/Express)
├── doan/                      # Code C++ cho Kiosk ESP32-S3
├── frontend/
│   └── ChamCong-Kiosk-ESP32S3/  # Web Frontend cho Quản lý & Nhân viên (ví dụ: React/Vue)
└── kịch bản.docx              # Tài liệu kịch bản/Trường hợp sử dụng

```
🔧 Getting Started (Installation & Setup)
Hướng dẫn chi tiết, từng bước để chạy dự án này trên máy cục bộ.

Yêu cầu hệ thống
(ví dụ: Node.js v18.x trở lên)

(ví dụ: Git)

(ví dụ: Một instance cơ sở dữ liệu MongoDB / PostgreSQL đang chạy)

(ví dụ: Arduino IDE hoặc PlatformIO cho ESP32)

Cài đặt chung
Clone repository:

```Bash

git clone [https://github.com/khanhhung149/ChamCong-Monorepo.git](https://github.com/khanhhung149/ChamCong-Monorepo.git)
cd ChamCong-Monorepo
(Tùy chọn) Nếu sử dụng npm workspaces hoặc pnpm/yarn workspaces, hãy cài đặt các phụ thuộc gốc:

```Bash

npm install  # hoặc pnpm install / yarn install
1. Backend (/backend)
Di chuyển đến thư mục backend:

```Bash

cd backend
Cài đặt các phụ thuộc:

```Bash

npm install
Tạo tệp .env từ tệp ví dụ (nếu có) và thêm cấu hình của bạn (ví dụ: chuỗi kết nối cơ sở dữ liệu, khóa bí mật JWT):

```Bash

cp .env.example .env
# Bây giờ, hãy chỉnh sửa tệp .env với các giá trị của bạn
Khởi động máy chủ phát triển:

```Bash

npm run dev # hoặc npm start
2. Web Frontend (/frontend/ChamCong-Kiosk-ESP32S3)
Di chuyển đến thư mục frontend (web):

```Bash

cd frontend
cd ChamCong-Kiosk-ESP32S3
Cài đặt các phụ thuộc:

```Bash

npm install
Tạo tệp .env (nếu cần) để chỉ định URL API backend: (ví dụ: VITE_API_URL=http://localhost:5000/api)

Khởi động máy chủ phát triển:

```Bash

npm run dev
Mở trình duyệt và truy cập http://localhost:3000 (hoặc cổng được chỉ định).

3. Hardware Kiosk (/doan)
Mở thư mục dự án (/doan) bằng Arduino IDE hoặc VS Code với PlatformIO.

Định cấu hình các cài đặt cần thiết trong code (ví dụ: config.h):

Tên (SSID) và Mật khẩu WiFi

IP/Hostname và Cổng của máy chủ Backend

Kết nối bo mạch ESP32-S3 với máy tính của bạn.

Biên dịch (Compile) và Nạp (Upload) code lên bo mạch.

Mở Serial Monitor (tốc độ baud ví dụ: 115200) để kiểm tra log và gỡ lỗi.