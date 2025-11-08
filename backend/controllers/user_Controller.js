import User from '../models/User.js';
import bcrypt from 'bcrypt';

export const createUser = async (req, res) =>{
    const {name, employee_id, email, password, role} = req.body;
    try{
        if(!name || !employee_id || !email || !password || !role){
            return res.status(400).json({message: "Vui lòng điền đầy đủ thông tin"})
        }

        const emailExists = await User.findOne({email});
        if(emailExists){
            return res.status(400).json({message: "Email đã được sử dụng"});
        }
        

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = new User({
            name,
            employee_id,
            email,
            password: hashedPassword,
            role
        });

        const savedUser = await newUser.save();

        res.status(201).json({
            _id: savedUser._id,
            name: savedUser.name,
            email: savedUser.email,
            role: savedUser.role,
            employee_id: savedUser.employee_id
        })
    }
    catch(error){
        console.log(error);
        res.status(500).json({
            message: "Lỗi server",
            error: error.message
        });
    }
};

export const getAllUsers = async(req, res) =>{
    try{
        const users = await User.find({}).select('-password').sort({createdAt: -1});
        res.status(200).json(users);
    }

    catch(error){
        console.log(error);
        res.status(500).json({
            message: "Lỗi server",
            error: error.message
        });
    }
}

export const deleteUser = async(req, res) =>{
    try{
        const user = await User.findById(req.params.id);
        if(user){
            await user.deleteOne();
            res.status(200).json({message: "Xóa thành công"});
        }
        else{
            res.status(404).json({message: "Nhân viên không tồn tại"});
        }
    }
    catch(error){
        res.status(500).json({
            message: 'Lỗi server', 
            error: error.message
        })
    }
}

