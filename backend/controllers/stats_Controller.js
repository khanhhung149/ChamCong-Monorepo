import User from '../models/User.js';
import AttendanceLog from '../models/Attendance.js';

export const getDashboardStats = async (req, res) => {
  try {
    // 1. Lấy ngày hôm nay (00:00:00 và 23:59:59)
    const now = new Date();
    // Đặt múi giờ +7 (Việt Nam)
    now.setHours(now.getHours() + 7);
    
    // Tính toán mốc 00:00:00 (giờ VN)
    const todayStart = new Date(now.toISOString().split('T')[0]);
    todayStart.setHours(todayStart.getHours() - 7); // Quay về UTC 17:00 ngày hôm trước
    
    // Tính toán mốc 23:59:59 (giờ VN)
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);
    todayEnd.setSeconds(todayEnd.getSeconds() - 1);


    // 2. Lấy tổng số nhân viên
    const totalUsers = await User.countDocuments();

    // 3. Lấy số nhân viên DUY NHẤT đã chấm công hôm nay
    const presentIds = await AttendanceLog.distinct('employee_id', {
      timestamp: { $gte: todayStart, $lte: todayEnd },
    });
    
    const presentToday = presentIds.length;
    const absentToday = totalUsers - presentToday;

    // 4. Trả về kết quả
    res.json({
      totalUsers,
      presentToday,
      absentToday,
    });

  } catch (error) {
    console.error("Lỗi trong getDashboardStats:", error); // Log lỗi ra server
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};