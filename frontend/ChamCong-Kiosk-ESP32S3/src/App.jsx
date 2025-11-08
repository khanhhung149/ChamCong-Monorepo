import authService from './services/authServices.js';
import { BrowserRouter, Routes, Route, Navigate, Outlet, NavLink } from "react-router-dom"
import Login from "./pages/Login"
import ManagerDashboard from "./pages/ManagerDashboard"
import ProtectedRoute from './components/ProtectedRoute';
import EmployeeDashboard from './pages/EmployeeDashboard';
import ManagePage from './pages/ManagePage.jsx';
import ReportPage from './pages/ReportPage.jsx';


const SidebarLink = ({ to, children, end=false }) => (
  <NavLink
    to={to}
    // Tailwind sẽ tô màu nền và chữ khi link này "active"
    end={end}
    className={({ isActive }) =>
      `block px-4 py-3 rounded-md text-sm font-medium transition-colors cursor-pointer
      ${isActive
        ? 'bg-blue-600 text-white'
        : 'text-gray-300 hover:bg-gray-700 hover:text-white'
      }`
    }
  >
    {children}
  </NavLink>
);

const ManagerLayout = () => (
  <div className="flex h-screen bg-gray-100">
    {/* --- Sidebar --- */}
    <div className="flex w-64 flex-col bg-gray-800 text-white">
      {/* Logo/Header */}
      <div className="flex h-16 items-center justify-center px-4 shadow-md">
        <h1 className="text-xl font-bold text-white">Manager</h1>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 space-y-2 p-4">
        <SidebarLink to="/manager" end>Trang chủ</SidebarLink>
        <SidebarLink to="/manager/employees">Quản lý nhân viên</SidebarLink>
        <SidebarLink to="/manager/reports">Báo cáo</SidebarLink>
      </nav>

      {/* Logout Button (ở dưới cùng) */}
      <div className="p-4">
        <button 
          onClick={() => {
            authService.logout();
            window.location.href = '/login';
          }}
          className="w-full px-4 py-2 font-semibold text-white bg-red-600 rounded-md hover:bg-red-700"
        >
          Đăng xuất
        </button>
      </div>
    </div>

    {/* --- Main Content Area --- */}
    <div className="flex-1 flex-col overflow-y-auto">
      <div className="container mx-auto p-6">
        <Outlet /> {/* Đây là nơi trang của bạn (Dashboard, Report) sẽ hiện ra */}
      </div>
    </div>
  </div>
);

const EmployeeLayout = () => (
  <div className="flex h-screen bg-gray-100">
    {/* --- Sidebar --- */}
    <div className="flex w-64 flex-col bg-gray-800 text-white">
      <div className="flex h-16 items-center justify-center px-4 shadow-md">
        <h1 className="text-xl font-bold text-white">Employee</h1>
      </div>
      <nav className="flex-1 space-y-2 p-4">
        <SidebarLink to="/employee" end>Trang cá nhân</SidebarLink>
      </nav>
      <div className="p-4">
        <button 
          onClick={() => {
            authService.logout();
            window.location.href = '/login';
          }}
          className="w-full px-4 py-2 font-semibold text-white bg-red-600 rounded-md hover:bg-red-700"
        >
          Đăng xuất
        </button>
      </div>
    </div>

    {/* --- Main Content Area --- */}
    <div className="flex-1 flex-col overflow-y-auto">
      <div className="container mx-auto p-6">
        <Outlet /> {/* Đây là nơi EmployeeDashboard sẽ hiện ra */}
      </div>
    </div>
  </div>
);
function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Route Công khai */}
        <Route path="/login" element={<Login />} />

        {/* Route cho Manager (Yêu cầu role="manager") */}
        <Route 
          path="/manager" 
          element={<ProtectedRoute role="manager"><ManagerLayout /></ProtectedRoute>}
        >
          <Route index element={<ManagerDashboard />} /> 
          <Route path="employees" element={<ManagePage />} />
          <Route path="reports" element={<ReportPage />} /> 
        </Route>

        {/* Route cho Employee (Yêu cầu role="employee") */}
        <Route 
          path="/employee-dashboard" 
          element={<ProtectedRoute role="employee"><EmployeeLayout /></ProtectedRoute>}
        >
          <Route index element={<EmployeeDashboard />} /> {/* Trang mặc định /employee */}
        </Route>

        {/* Route mặc định: Tự động chuyển hướng */}
        <Route path="/" element={<HomeRedirect />} />
      </Routes>
    </BrowserRouter>
  );
}

const HomeRedirect = () => {
  const user = authService.getUser();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'manager') return <Navigate to="/manager" replace />;
  if (user.role === 'employee') return <Navigate to="/employee-dashboard" replace />;
  return <Navigate to="/login" replace />;
};

export default App
