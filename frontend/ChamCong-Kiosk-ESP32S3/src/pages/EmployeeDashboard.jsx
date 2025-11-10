import React, { useState, useEffect } from 'react';
import axios from 'axios';
import authService from '../services/authServices';

const EmployeeDashboard = () => {
  const [user, setUser] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Hàm tải dữ liệu cá nhân (UC-02)
  const fetchMyData = async () => {
    setLoading(true);
    try {
      // 1. Lấy thông tin user từ Token
      const currentUser = authService.getUser();
      setUser(currentUser); // Token đã chứa name, email, role, employee_id

      // 2. Gọi API mới để lấy log cá nhân
      const response = await axios.get(`http://localhost:5000/api/my-logs`, {
        headers: authService.getAuthHeader(), // Đính kèm Token
      });
      setLogs(response.data);

    } catch (err) {
      setError('Không thể tải dữ liệu cá nhân.');
      console.error(err);
    }
    setLoading(false);
  };

  // Chạy khi trang được tải
  useEffect(() => {
    fetchMyData();
  }, []);

  if (loading) {
    return <p>Đang tải dữ liệu...</p>;
  }

  if (error) {
    return <p className="text-red-500">{error}</p>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-800">Trang cá nhân</h1>

      {/* --- Thẻ Thông tin Cá nhân --- */}
      <div className="p-6 bg-white rounded-xl shadow-lg flex items-center space-x-6">
        <img
          // (Backend của bạn chưa có API upload avatar, nên tạm dùng ảnh mặc định)
          src={`http://localhost:5000/public/avatars/default.png`}
          alt="Avatar"
          className="w-24 h-24 rounded-full object-cover border-4 border-gray-200"
        />
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{user?.name}</h2>
          <p className="text-gray-500">{user?.email}</p>
          <p className="text-gray-500">Mã NV: {user?.employee_id}</p>
          <span className="mt-2 px-3 py-1 inline-flex text-sm leading-5 font-semibold rounded-full bg-green-100 text-green-800">
            {user?.role}
          </span>
        </div>
      </div>

      {/* --- Bảng Lịch sử Chấm công Cá nhân (UC-02) --- */}
      <div className="p-6 bg-white rounded-xl shadow-lg">
        <h2 className="text-xl font-semibold mb-4 text-gray-700">Lịch sử Chấm công Gần đây</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Thời gian Chấm công</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ảnh bằng chứng</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan="2" className="px-6 py-4 text-center text-gray-500">Bạn chưa có lượt chấm công nào.</td>
                </tr>
              ) : (
                logs.map(log => (
                  <tr key={log._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(log.timestamp).toLocaleString('vi-VN')}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <a href={`http://localhost:5000${log.proof_image_path}`} target="_blank" rel="noopener noreferrer">
                        <img
                          src={`http://localhost:5000${log.proof_image_path}`}
                          alt="Proof"
                          className="w-16 h-16 object-cover rounded-md shadow-sm hover:scale-150 transition-transform"
                        />
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default EmployeeDashboard;