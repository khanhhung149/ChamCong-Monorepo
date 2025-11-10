import AttendanceLog from '../models/Attendance.js';
import User from '../models/User.js'; // <-- THÊM DÒNG NÀY


export const getMyLogs = async (req, res) => {
  try {
    // Middleware 'protect' đã giải mã token và gắn user vào req.user
    // Chúng ta cần lấy 'employee_id' từ user đã đăng nhập
    const userEmployeeId = req.user.employee_id;

    if (!userEmployeeId) {
      return res.status(400).json({ message: 'Tài khoản của bạn thiếu Mã Nhân viên (employee_id).' });
    }

    const logs = await AttendanceLog.find({ employee_id: userEmployeeId })
      .sort({ timestamp: -1 })
      .limit(50); // Giới hạn 50 log gần nhất
      
    res.json(logs);

  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

export const getLogs = async (req, res) => {
  try {
    // SỬA 1: Lấy thêm 'page' từ query, mặc định là trang 1
    const { startDate, endDate, page = 1 } = req.query;

    // SỬA 2: Định nghĩa số lượng log trên mỗi trang
    const limit = 10; // Hiển thị 10 log mỗi trang
    const pageNum = Number(page);

    // Xây dựng bộ lọc (filter) (Logic này đã đúng)
    const filter = {};
    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) {
        filter.timestamp.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        filter.timestamp.$lte = new Date(end.setDate(end.getDate() + 1));
      }
    }

    // SỬA 3: Đếm tổng số log khớp với bộ lọc
    const totalLogs = await AttendanceLog.countDocuments(filter);
    
    // SỬA 4: Tính toán tổng số trang
    const totalPages = Math.ceil(totalLogs / limit);

    // SỬA 5: Lấy log của trang hiện tại (dùng .skip() và .limit())
    const logs = await AttendanceLog.find(filter)
      .sort({ timestamp: -1 })
      .skip((pageNum - 1) * limit) // Bỏ qua các trang trước
      .limit(limit); // Giới hạn số lượng

    // SỬA 6: Trả về dữ liệu mới (thêm currentPage và totalPages)
    res.status(200).json({
      logs, // Mảng log của trang hiện tại
      currentPage: pageNum,
      totalPages: totalPages,
      totalLogs: totalLogs
    });

  }
  catch (error) {
    res.status(500).send({ message: 'Loi server', error: error.message });
  }
};

export const logAttendance =async(req, res) =>{
    try{
        const {employee_id }= req.body;
        if(!req.file){
            return res.status(400).send({message: 'Loi khong co file anh bang chung.' });
        }
        if(!employee_id){
            return res.status(400).send({message: 'Loi khong co employee_id.'});
        }
        const user = await User.findOne({employee_id});
        if(!user){
            return res.status(404).send({message:'Nhân viên không tồn tại'})
        }
        const employeeName = user.name;

        const imagePath = `/public/attendance_imgs/${req.file.filename}`;

        const newLog = new AttendanceLog({
            name: employeeName,
            employee_id: employee_id,
            proof_image_path: imagePath
        });
        await newLog.save();
        console.log(`Da cham cong cho: ${employee_id} tai ${imagePath}`);

        req.broadcastToAdmins({
        type: 'new_log',
        data: newLog 
    });

        res.status(200).send({message:' Cham cong thanh cong'});
    }
    catch(error){
        console.error('Loi khi cham cong', error);
        res.status(500).send({message:' Loi server', error: error.message});
    }
};

