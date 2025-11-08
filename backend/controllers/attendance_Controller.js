import AttendanceLog from '../models/Attendance.js';
import User from '../models/User.js'; // <-- THÊM DÒNG NÀY

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

        res.status(200).send({message:' Cham cong thanh cong'});
    }
    catch(error){
        console.error('Loi khi cham cong', error);
        res.status(500).send({message:' Loi server', error: error.message});
    }
};

export const getLogs = async(req,res) =>{
    try{
        const logs= await AttendanceLog.find().sort({timestamp: -1 }).limit(50);
        res.status(200).json(logs);
    }
    catch(error){
        res.status(500).send({message: 'Loi server', error:error.message});
    }
};