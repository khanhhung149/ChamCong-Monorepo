import React, {useState, useEffect, useRef} from 'react'
import axios from 'axios'
import authService from '../services/authServices.js'
import { Link } from 'react-router-dom'; // <-- Thêm Link

const Button= ({children, onClick, className='', type='button'}) =>(
    <button type={type} onClick={onClick} className={`px-4 py-2 font-semibold text-white transition-colors duration-200 rounded-md ${className}`}>
        {children}
    </button>
)
const StatusBadge =({status}) =>{
    let colorClass = 'bg-gray-500';
    if(status.includes('Đã kết nối')) colorClass = 'bg-green-500';
    if(status.includes('Lỗi') || status.includes('Offline')) colorClass = 'bg-red-500';
    return (
        <span className={`px-3 py-1 text-sm font-medium text-white rounded-full ${colorClass}`}>
            {status}
        </span>
    );
}

const ManagePage = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [adminWsStatus, setAdminWsStatus] = useState('Đang kết nối Server...');
    const [kioskCount, setKioskCount] = useState(0); // <-- State mới để đếm Kiosk
    const ws = useRef(null);

    useEffect(() => {
        if (ws.current) return; // Chỉ kết nối 1 lần
        const wsClient = new WebSocket('ws://192.168.88.119:5000/ws');
        ws.current = wsClient;

        wsClient.onopen = () => {
            const token = authService.getToken();
            if (token) {
                wsClient.send(`auth:admin:${token}`); // Xác thực
            }
        };

        wsClient.onmessage = (event) => {
            const msgText = event.data;
            console.log('WS (ManagePage):', msgText);

            try {
                // Thử parse JSON trước (cho tin nhắn status)
                const msg = JSON.parse(msgText);

                if (msg.type === 'kiosk_status') {
                    setKioskCount(msg.count); // <-- Cập nhật số lượng Kiosk
                }
                
            } catch (e) {
                // Nếu không phải JSON, xử lý text
                if (msgText === 'auth:success') {
                    setAdminWsStatus('Đã kết nối Server');
                    // Server sẽ gửi 'kiosk_status' ngay sau đây
                } else if (msgText.startsWith('progress:')) {
                    const parts = msgText.split(':');
                    setAdminWsStatus(`Đang đăng ký ${parts[1]}... (${parts[2]})`);
                } else if (msgText.startsWith('enroll_done:')) {
                    setAdminWsStatus('Đăng ký Hoàn tất!');
                } else if (msgText === 'db_cleared') {
                    alert('Database trên Kiosk đã bị xóa!');
                }
            }
        };
        
        wsClient.onclose = () => {
            setAdminWsStatus('Server Offline');
            setKioskCount(0); // Nếu rớt mạng, coi như Kiosk offline
        };
        wsClient.onerror = (err) => setAdminWsStatus("Lỗi kết nối Server");
        
        return () => {
            wsClient.close();
            ws.current = null;
        };
    }, []);

    const [formData, setFormData]= useState({
        name:'',
        employee_id:'',
        email:'',
        password:'',
        role:'employee'
    });

    const fetchUsers = async()=>{
        setLoading(true);
        try{
            const response = await axios.get('http://localhost:5000/api/users', {
                headers: authService.getAuthHeader(),
            });
            setUsers(response.data);
        }
        catch(error){
            setError('Lỗi khi tải danh sách nhân viên.');
            console.log(error);
        }
        setLoading(false);
    }

    useEffect(() => {
    fetchUsers();
  }, []);

  const handleDelete = async(userId, name) =>{
    if(window.confirm(`Bạn có chắc chắn muốn xóa nhân viên ${name}?`)){
    try{
        await axios.delete(`http://localhost:5000/api/users/${userId}`, {
            headers: authService.getAuthHeader(),
        });
        setUsers(prevUsers => prevUsers.filter(user => user._id !== userId));
    }
    catch(error){
        setError('Lỗi khi xóa nhân viên');
        console.log(error);
    }
    }
  }

  const handleInputChange = (e) =>{
    const {name, value} = e.target;
    setFormData((prev) =>({
        ...prev,
        [name]:value,
    }));
  }

  const handleSubmit = async(e) =>{
    e.preventDefault();
    if(!formData.email || !formData.password || !formData.name || !formData.employee_id){
        setError('Vui lòng điền tất cả các trường thông tin bắt buộc.');
        return;
    }
    try{
        await axios.post('http://localhost:5000/api/users', formData, {
            headers: authService.getAuthHeader(),
        });
        setUsers(prevUsers => [res.data, ...prevUsers]);
        setFormData({
            name:'',
            employee_id:'',
            email:'',
            password:'',
            role:'employee'
        });
        setError('');
    }
    catch(error){
        setError('Lỗi khi thêm nhân viên');
        console.log(error);

    }
  }

  const sendWsCommand = (command) => {
        if (kioskCount === 0) { // <-- SỬA: Kiểm tra Kiosk có online không
            alert('Kiosk đang Offline! Không thể gửi lệnh.');
            return;
        }
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            ws.current.send(command);
        } else {
            alert('Chưa kết nối WebSocket (Server Offline)!');
        }
    };

    // Hàm kích hoạt Enroll (UC-07)
    const handleEnroll = (employeeId) => {
        if (!employeeId) {
            alert('Lỗi: Nhân viên này chưa có Mã NV (employee_id).');
            return;
        }
        if (window.confirm(`Bạn có muốn kích hoạt Kiosk để đăng ký khuôn mặt cho ${employeeId}?`)) {
            setWsStatus(`Đang gửi lệnh enroll cho ${employeeId}...`);
            sendWsCommand(`enroll:${employeeId}`);
        }
    };

    // Hàm xóa DB Kiosk (UC-08)
    const handleClearKioskDB = () => {
        if (window.confirm('CẢNH BÁO: Bạn có CHẮC muốn XÓA HẾT khuôn mặt trên Kiosk?')) {
            sendWsCommand('delete_all');
        }
    };
  return (
        <div className='space-y-6'>
            <div className="flex items-center justify-between">
                <h1 className='text-3xl font-bold text-gray-800'>Quản lý Nhân viên & Kiosk</h1>
                {/* (PHẦN MỚI) Hiển thị trạng thái WS */}
                <StatusBadge 
                    status={kioskCount > 0 ? `Kiosk Online (${kioskCount})` : 'Kiosk Offline'} 
                />
            </div>

            <div className='p-6 bg-white rounded-xl shadow-lg'>
                <h2 className='text-xl font-semibold mb-5 text-gray-700'>Điều khiển Kiosk (UC-07, 08)</h2>
                <div className="flex space-x-3">
                    <Button onClick={handleClearKioskDB} className="bg-red-600 hover:bg-red-700">
                        Xóa sạch DB Kiosk
                    </Button>
                    <Button onClick={() => sendWsCommand('dump_db')} className="bg-yellow-500 hover:bg-yellow-600">
                        Dump DB (Kiểm tra)
                    </Button>
                </div>
            </div>

            {/* --- Form Thêm Mới (Styled) --- */}
            <div className='p-6 bg-white rounded-xl shadow-lg'>
                <h2 className='text-xl font-semibold mb-5 text-gray-700'>Thêm Nhân viên mới</h2>
                <form onSubmit={handleSubmit} className='space-y-4'>
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                        <div>
                            <label className='block text-sm font-medium text-gray-700'>Tên nhân viên *</label>
                            <input type="text" name="name" value={formData.name} onChange={handleInputChange}
                                className='mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500' />
                        </div>
                        <div>
                            <label className='block text-sm font-medium text-gray-700'>Mã nhân viên *</label>
                            <input type="text" name="employee_id" value={formData.employee_id} onChange={handleInputChange}
                                className='mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500' />
                        </div>
                        <div>
                            <label className='block text-sm font-medium text-gray-700'>Email *</label>
                            <input
                                className='mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500' type="email" name="email" value={formData.email} onChange={handleInputChange} />
                        </div>
                        <div>
                            <label className='block text-sm font-medium text-gray-700'>Mật khẩu *</label>
                            <input className='mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500' type="password" name="password" value={formData.password} onChange={handleInputChange} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Phân quyền *</label>
                            <select
                                name="role"
                                value={formData.role}
                                onChange={handleInputChange}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                            >
                                <option value="employee">Nhân viên</option>
                                <option value="manager">Quản lý</option>
                            </select>
                        </div>
                    </div>
                    {error && (
                        <p className="text-sm text-red-600 mt-2">{error}</p>
                    )}
                    <div className="text-right pt-2">
                        <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                            Lưu Nhân viên
                        </Button>
                    </div>
                </form>
            </div>

            {/* --- Bảng Danh sách (Styled) --- */}
            <div className='p-6 bg-white rounded-xl shadow-lg'>
                <h2 className='text-xl font-semibold mb-4 text-gray-700'>Danh sách nhân viên</h2>
                {loading ? (
                    <p>Đang tải danh sách...</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className='min-w-full divide-y divide-gray-200'>
                            <thead className='bg-gray-50'>
                                <tr>
                                    <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>Mã NV</th>
                                    <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>Tên</th>
                                    <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>Email</th>
                                    <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>Chức vụ</th>
                                    <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>Hành động</th>
                                </tr>
                            </thead>
                            <tbody className='bg-white divide-y divide-gray-200'>
                                {users.map(user => (
                                    <tr key={user._id} className='hover:bg-gray-50'>
                                        <td className='px-6 py-4 whitespace-nowrap text-sm text-gray-900'>{user.employee_id}</td>
                                        <td className='px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900'>
                                            <Link to={`/manager/employees/${user._id}`} className="text-blue-600 hover:underline">
                                                {user.name}
                                            </Link>
                                        </td>
                                        <td className='px-6 py-4 whitespace-nowrap text-sm text-gray-500'>{user.email}</td>
                                        <td className='px-6 py-4 whitespace-nowrap text-sm text-gray-500'>{user.role === 'manager' ? (
                                            <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">Quản lý</span>
                                        ) : (
                                            <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Nhân viên</span>
                                        )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                            <Button className='bg-green-600 hover:bg-green-700 text-xs' onClick={() => handleEnroll(user.employee_id)}>
                                                Đăng ký
                                            </Button>
                                            <Button className='bg-red-600 hover:bg-red-700 text-xs' onClick={() => handleDelete(user._id, user.name)}>Xóa</Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

export default ManagePage
