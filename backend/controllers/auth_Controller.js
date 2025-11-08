import User from '../models/User.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

export const login = async (req, res) =>{
    try{
        // Sửa 1: Đổi "email" thành "employee_id" để khớp với Frontend
        const { email, password } = req.body;
        const user = await User.findOne({ email }); // <-- Sửa ở đây

        // Sửa 2: Kiểm tra User VÀ Password
        if (!user || !(await bcrypt.compare(password, user.password))) {
            // Sửa 3: Luôn trả về CÙNG MỘT lỗi
            return res.status(401).json({ success: false, message: "Sai Email hoặc Mật khẩu" });
        }
        
        // (Nếu code chạy đến đây, tức là đã thành công)

        const token = jwt.sign({
            _id: user._id,
            role: user.role,
            name: user.name // <-- Thêm tên vào Token
            //employee_id: user.employee_id // <-- Thêm Mã NV vào Token
          },
            process.env.JWT_SECRET, {expiresIn: '10d'}
        );

        res.status(200).json({
            success: true, 
            message: "Đăng nhập thành công", 
            token, // Chỉ cần gửi token
            // Không cần gửi lại user, vì nó đã có trong token
        });

    } catch(error){
        console.log(error);
        res.status(500).json({ success: false, message: "Lỗi máy chủ nội bộ" });
    }
};

export const verifyToken =   (req, res) => {
    // Nếu code chạy được đến đây, nghĩa là middleware "protect" đã thành công
    // "protect" đã giải mã Token và gắn user vào req.user
    res.status(200).json({ 
        success: true, 
        message: "Token hợp lệ",
        user: req.user // Gửi lại thông tin user cho React
    });
};

