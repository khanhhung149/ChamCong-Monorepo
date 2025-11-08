import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import connectDB from './config/db.js';
import apiRoutes from './routes/api.routes.js'
import authRouter from './routes/auth.js'
import http from 'http';
import { WebSocketServer } from 'ws';

//Cấu hình
const app = express();
const PORT = process.env.PORT || 5000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


connectDB();// Chạy hàm kết nối DB

//Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({extended: true}));

//Phục vụ file tĩnh
app.use('/public', express.static(path.join(__dirname, 'public')));

// --- Gắn Routes ---
app.use('/api/auth', authRouter);
app.use('/api', apiRoutes);

// --- Khởi động Server ---
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({ server, path: '/ws' });

// track clients by role
const devices = new Set();
const admins = new Set();

wss.on('connection', (ws, req) => {
    console.log('WS: client connected');
    ws.isAlive = true;
    ws.isAuthenticated = false; // <-- Thêm trạng thái xác thực
    ws.role = 'guest';

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (message) => {
        try {
            const raw = message.toString();
            const txt = raw.trim();

            // --- BƯỚC XÁC THỰC (MỚI) ---
            // Yêu cầu client (React) gửi token ngay khi kết nối
            // Ví dụ: "auth:admin:token_cua_toi_o_day"
            // if (txt.startsWith('auth:admin:')) {
            //     const token = txt.substring(11);
            //     try {
            //         // Giải mã token
            //         const decoded = jwt.verify(token, process.env.JWT_SECRET);
                    
            //         // Chỉ chấp nhận token hợp lệ VÀ role là 'manager'
            //         if (decoded && decoded.role === 'manager') {
            //             console.log('WS: Admin verified:', decoded._id);
            //             ws.isAuthenticated = true;
            //             ws.role = 'manager';
            //             admins.add(ws); // <-- CHỈ THÊM KHI ĐÃ XÁC THỰC
            //             ws.send("auth:success"); // Báo cho React là đã OK
            //         } else {
            //             ws.send("auth:failed:invalid_role");
            //             ws.terminate();
            //         }
            //     } catch (e) {
            //         console.log("WS: Auth failed, invalid token");
            //         ws.send("auth:failed:invalid_token");
            //         ws.terminate();
            //     }
            //     return;
            // }

            // Client là Kiosk (ESP32)
            if (txt === 'role:device') {
                console.log('WS: Kiosk connected');
                ws.isAuthenticated = true; // Kiosk được tin tưởng ngầm
                ws.role = 'device';
                devices.add(ws);
                return;
            }
            if (txt === 'role:admin') {
                console.log('WS: Admin (Postman) connected');
                ws.isAuthenticated = true; // Tin tưởng
                ws.role = 'manager';       // Đặt vai trò là manager
                admins.add(ws);          // Thêm vào nhóm admins
                ws.send("auth:success (test mode)"); // Gửi phản hồi
                return;
            }
            
            // --- KẾT THÚC BƯỚC XÁC THỰC ---

            // Nếu client chưa xác thực (chưa gửi token), bắt họ xác thực
            // if (!ws.isAuthenticated) {
            //     console.log('WS: Unauthenticated message ignored');
            //     ws.send("auth:required"); // Báo client "vui lòng xác thực"
            //     return;
            // }

            // --- CÁC LỆNH ĐÃ ĐƯỢC BẢO VỆ ---

            // 1. Chỉ Manager (đã xác thực) mới được gửi lệnh
            if (ws.role === 'manager') {
                if (txt.startsWith('enroll:') || txt === 'delete_all' || txt === 'dump_db') {
                    console.log(`WS: Manager command '${txt}' -> forwarding to devices`);
                    // Gửi lệnh này đến TẤT CẢ các Kiosk
                    devices.forEach(d => {
                        if (d.readyState === d.OPEN) d.send(txt);
                    });
                }
                return;
            }

            // 2. Chỉ Kiosk mới được gửi tiến độ
            if (ws.role === 'device') {
                // Kiosk gửi (VD: "progress:...") -> Chuyển tiếp cho Admin
                admins.forEach(a => {
                    if (a.readyState === a.OPEN) a.send(txt);
                });
                return;
            }

        } catch (e) {
            console.error('WS message error', e);
        }
    });

    ws.on('close', () => {
        devices.delete(ws);
        admins.delete(ws);
        console.log('WS: client disconnected');
    });
});

// heartbeat
setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

server.listen(PORT, ()=>{
    console.log(`Server running on port ${PORT}`);
});