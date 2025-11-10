import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import authService from '../services/authServices';

// Component Thẻ Thống kê
const StatsCard = ({ title, value, unit, icon, colorClass }) => (
  <div className={`p-6 bg-white rounded-xl shadow-lg flex items-center justify-between ${colorClass}`}>
    <div>
      <div className={`text-3xl font-bold ${colorClass.replace('bg-', 'text-')}`}>{value}</div>
      <div className="text-sm font-medium text-gray-500">{title}</div>
    </div>
    {/* Bạn có thể thêm icon ở đây */}
  </div>
);

const ManagerDashboard = () => {
  const [stats, setStats] = useState({ totalUsers: 0, totalLogs: 0 });
  const [recentLogs, setRecentLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [kioskStatus, setKioskStatus] = useState({isOnline: false, statusText: 'Offline'});

  const ws = useRef(null);


  // Hàm này gọi 2 API để lấy thông tin cho Dashboard
  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      // 1. Gọi API Stats (Lấy totalUsers, presentToday, absentToday)
      const statsRes = await axios.get('http://localhost:5000/api/stats/dashboard', {
          headers: authService.getAuthHeader(),
      });
      const statsData = statsRes.data;

      // 2. Gọi API Logs (Lấy recentLogs và totalLogs)
      // (Chúng ta gọi trang 1 với 5 mục)
      const logsRes = await axios.get('http://localhost:5000/api/logs', {
        headers: authService.getAuthHeader(),
        params: { page: 1, limit: 5 } // Yêu cầu 5 log đầu tiên
      });
      
      // SỬA LỖI .slice()
      // Truy cập vào mảng .logs bên trong object
      setRecentLogs(logsRes.data.logs); 

      // 3. Kết hợp (Merge) 2 kết quả vào state
      setStats({
        ...statsData, // { totalUsers, presentToday, absentToday }
        totalLogs: logsRes.data.totalLogs // Thêm totalLogs từ API logs
      });

    } catch (error) {
      console.error("Lỗi khi tải dữ liệu Dashboard:", error);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchDashboardData();

    if(ws.current) return;
    const wsClient = new WebSocket('ws://192.168.88.119:5000/ws');
    ws.current = wsClient;

    wsClient.onopen = () => {
      console.log('WS Dashboard Connected');
      const token = authService.getToken();
      if (token) {
        wsClient.send(`auth:admin:${token}`); // Gửi Token
      }
    };

    wsClient.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        // Lắng nghe log mới từ Kiosk (Gợi ý 1C)
        if (msg.type === 'new_log') {
          console.log('Real-time log received:', msg.data);
          // Thêm log mới vào đầu danh sách, và giữ 5 mục
          setRecentLogs(prevLogs => [msg.data, ...prevLogs.slice(0, 4)]);
        }
      } catch (e) {
        // Lắng nghe tin nhắn text (auth, progress...)
        console.log('WS Text:', event.data);
        if(event.data.includes('auth:success')) {
            setKioskStatus({ isOnline: true, statusText: 'Đã kết nối Admin' });
        }
      }
    };

    wsClient.onclose = () => {
      console.log('WS Dashboard Disconnected');
      setKioskStatus({ isOnline: false, statusText: 'Đã ngắt kết nối' });
    };

    return () => 
      {
        wsClient.close();
        ws.current = null;
      }
  }, []);

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold text-gray-800">Trang chủ Manager</h1>

      {/* --- Khu vực Thẻ Thống kê --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard 
          title="Tổng số Nhân viên" 
          value={stats.totalUsers} 
          colorClass="bg-blue-100 text-blue-800"
        />
        <StatsCard 
          title="Tổng lượt Chấm công" 
          value={stats.totalLogs} 
          colorClass="bg-green-100 text-green-800"
        />
        {/* (Thẻ giả - Bạn có thể thêm API cho 2 thẻ này sau) */}
        <StatsCard 
          title="Hiện diện Hôm nay" 
          value={stats.presentToday} 
          colorClass="bg-green-100 text-green-800"
        />
        <StatsCard 
          title="Vắng mặt Hôm nay" 
          value={stats.absentToday} 
          colorClass="bg-red-100 text-red-800"
        />

        <StatsCard 
          title="Trạng thái Kiosk" 
          value={kioskStatus.statusText} 
          colorClass={kioskStatus.isOnline ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}
        />
      </div>

      {/* --- Khu vực Hoạt động Gần đây --- */}
      <div className="p-6 bg-white rounded-xl shadow-lg">
        <h2 className="text-xl font-semibold mb-4 text-gray-700">Hoạt động Chấm công Gần đây</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mã NV</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Thời gian</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ảnh</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr><td colSpan="3" className="p-4 text-center">Đang tải...</td></tr>
              ) : recentLogs.map(log => (
                <tr key={log._id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{log.employee_id}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(log.timestamp).toLocaleString('vi-VN')}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600">
                    <a href={`http://localhost:5000${log.proof_image_path}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      Xem ảnh
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default ManagerDashboard;