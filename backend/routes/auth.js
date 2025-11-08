import express from "express";
import { login , verifyToken } from "../controllers/auth_Controller.js";
import {protect} from "../middleware/authMiddleware.js";
const router = express.Router();

router.post('/login', login);
router.post('/verify', protect, verifyToken);

export default router;