import mongoose from "mongoose";

const attendanceSchema = new mongoose.Schema({
    name:{type: String, required: true},
    employee_id:{type: String, required: true},
    timestamp:{type: Date, default: Date.now},
    proof_image_path: {type: String, required: true}
}, {timestamps: true});

const AttendanceLog = mongoose.model("AttendanceLog", attendanceSchema);

export default AttendanceLog;