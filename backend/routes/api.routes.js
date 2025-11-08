import { Router } from "express";
import upload from "../middleware/upload.js";
import { logAttendance, getLogs } from "../controllers/attendance_Controller.js";
import { protect, isManager } from "../middleware/authMiddleware.js";
import { getAllUsers, createUser, deleteUser } from "../controllers/user_Controller.js";

const router = Router();

router.post('/log-attendance', upload.single('image'), logAttendance);
router.get('/logs', protect, isManager, getLogs);

router.route('/users')
.post(protect, isManager, createUser)
.get(protect, isManager, getAllUsers);

router.route('/users/:id').delete(protect, isManager, deleteUser);

export default router;