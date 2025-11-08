import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import authService from '../services/authServices.js';

// Component này sẽ "bọc" các trang cần bảo vệ
const ProtectedRoute = ({ children, role }) => {
  const user = authService.getUser();
  const location = useLocation();

  if (!user) {
    // 1. Chưa login -> Đá về trang Login
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (role && user.role !== role) {
    // 2. Đã login, nhưng sai quyền -> Đá về trang "Unauthorized"
    // (Hoặc đá về dashboard của họ)
    const homePath = user.role === 'manager' ? '/manager' : '/employee';
    return <Navigate to={homePath} replace />;
  }

  // 3. OK -> Cho phép vào
  return children;
};

export default ProtectedRoute;