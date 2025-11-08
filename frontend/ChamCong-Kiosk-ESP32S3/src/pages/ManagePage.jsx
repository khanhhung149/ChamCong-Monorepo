import React, {useState, useEffect, Children} from 'react'
import axios from 'axios'
import authService from '../services/authServices.js'

const Button= ({children, onClick, className='', type='button'}) =>(
    <button type={type} onClick={onClick} className={`px-4 py-2 font-semibold text-white transition-colors duration-200 rounded-md ${className}`}>
        {children}
    </button>
)

const ManagePage = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

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
    if(window.confirm(`Bạn có chắc chắn muốn xóa nhân viên ${name}?`));
    try{
        await axios.delete(`http://localhost:5000/api/users/${userId}`, {
            headers: authService.getAuthHeader(),
        });
        fetchUsers();
    }
    catch(error){
        setError('Lỗi khi xóa nhân viên');
        console.log(error);
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
        fetchUsers();
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
  return (
    <div className='space-y-6'>
      <h1 className='text-3xl font-bold'>Quản lý nhân viên</h1>

      <div className='p-6 bg-white rounded-lg shadow-md'>
        <h2 className='text-2xl font-semibold mb-4'>Thêm nhân viên</h2>
        <form onSubmit={handleSubmit} className='space-y-4'>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                <div>
                    <label className='block text-sm font-medium text-gray-700'>Tên nhân viên</label>
                    <input type="text" name="name" value={formData.name} onChange={handleInputChange} 
                    className='mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md'/>
                </div>
                <div>
                    <label className='block text-sm font-medium text-gray-700'>Mã nhân viên</label>
                    <input type="text" name="employee_id" value={formData.employee_id} onChange={handleInputChange} 
                    className='mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md'/>
                </div>
                <div>
                    <label className='block text-sm font-medium text-gray-700'>Email</label>
                    <input 
                    className='mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md' type="email" name="email" value={formData.email} onChange={handleInputChange} />
                </div>
                <div>
                    <label className='block text-sm font-medium text-gray-700'>Mật khẩu</label>
                    <input className='mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md' type="password" name="password" value={formData.password} onChange={handleInputChange} />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Phân quyền</label>
                    <select
                        name="role"
                        value={formData.role}
                        onChange={handleInputChange}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md bg-white"
                    >
                        <option value="employee">Nhân viên</option>
                        <option value="manager">Quản lý</option>
                    </select>
                </div>
            </div>
             {error && (
            <p className="text-sm text-red-600">{error}</p>
          )} 
          <div className="text-right">
            <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
              Lưu Nhân viên
            </Button>
          </div>

        </form>
      </div>

      <div className='p-4 bg-white rounded-lg shadow-md'>
        <h2 className='text-xl font-semibold mb-4'>Danh sách nhân viên</h2>
        {loading?(
            <p>Đang tải danh sách...</p>
        ):(
            <table className='min-w-full divide-y divide-gray-200 border-collapse'>
                <thead className='bg-gray-100'>
                    <tr>
                        <th className='p-3 text-left border-b'>Mã nhân viên</th>
                        <th className='p-3 text-left border-b'>Tên</th>
                        <th className='p-3 text-left border-b'>Email</th>
                        <th className='p-3 text-left border-b'>Chức vụ</th>
                        <th className='p-3 text-left border-b'>Trạng thái</th>
                    </tr>
                </thead>
                <tbody className='bg-white divide-y divide-gray-200'>
                    {users.map(user =>(
                        <tr key={user._id} className='hover:bg-gray-50'>
                            <td className='p-3 border-b'>{user.employee_id}</td>
                            <td className='p-3 border-b'>{user.name}</td>
                            <td className='p-3 border-b'>{user.email}</td>
                            <td className='p-3 border-b'>{user.role ==='manager' ?( <span className="px-2 py-1 text-xs font-semibold text-red-800 bg-red-200 rounded-full">Quản lý</span>
                            ) : ( <span className="px-2 py-1 text-xs font-semibold text-green-800 bg-green-200 rounded-full">Nhân viên</span>
                            )}
                            </td>
                            <td className="p-3 border-b"><Button className='bg-red-600 hover:bg-red-700 text-xs' onClick={()=> handleDelete(user._id, user.name)}>Xóa</Button></td>
                        </tr>
                    ))}
                </tbody>
            </table>
        )}
      </div>

    </div>
  );
}

export default ManagePage
