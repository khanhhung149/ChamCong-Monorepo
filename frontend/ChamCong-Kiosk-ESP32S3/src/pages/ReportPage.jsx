import React, { useEffect, useState} from 'react'
import axios from 'axios'
import authService from '../services/authServices.js'


const PaginationControls = ({ currentPage, totalPages, onPageChange }) => {
    // Chỉ hiển thị nút nếu có nhiều hơn 1 trang
    if (totalPages <= 1) return null;

    const pageNumbers = [];
    for (let i = 1; i <= totalPages; i++) {
        pageNumbers.push(i);
    }

    return (
        <div className="flex justify-center items-center space-x-2 mt-6">
            <button
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="px-4 py-2 font-medium bg-gray-200 rounded-md disabled:opacity-50 hover:bg-gray-300"
            >
                Trước
            </button>

            {/* Hiển thị các số trang */}
            {pageNumbers.map(number => (
                <button
                    key={number}
                    onClick={() => onPageChange(number)}
                    className={`px-4 py-2 rounded-md font-medium ${currentPage === number
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 hover:bg-gray-300'
                        }`}
                >
                    {number}
                </button>
            ))}

            <button
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="px-4 py-2 font-medium bg-gray-200 rounded-md disabled:opacity-50 hover:bg-gray-300"
            >
                Tiếp
            </button>
        </div>
    );
};

const ReportPage = () => {
    const [logs, setLogs] =useState([]);
    const [loading, setLoading] = useState(true);

    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);

    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const fetchLogs = async(page = 1)=>{
        setLoading(true);
        try{
            const response = await axios.get('http://localhost:5000/api/logs', {
                headers: authService.getAuthHeader(),
                params: {
                    startDate: startDate || null, // Gửi null nếu rỗng
                    endDate: endDate || null,
                    page: page
                }
            });
            setLogs(response.data.logs);
            setCurrentPage(response.data.currentPage);
            setTotalPages(response.data.totalPages);
        }
        catch(error){
            console.log(error);
        }
        setLoading(false);
    };

    useEffect(() =>{fetchLogs(1);},[]);

    const handleFilterClick = () => {
        fetchLogs(1); // Gọi lại API với state (startDate, endDate) mới
    };
    
    const handlePageChange = (newPage) => {
        if (newPage > 0 && newPage <= totalPages) {
            fetchLogs(newPage);
        }
    };
  return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-800">Báo cáo Chấm công</h1>

            {/* --- Khu vực Lọc (Filters) - Giống Behance --- */}
            <div className="p-6 bg-white rounded-xl shadow-lg">
                <h2 className="text-xl font-semibold mb-4 text-gray-700">Bộ lọc báo cáo</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Từ ngày</label>
                        <input 
                        value={startDate}
                        onChange={e => setStartDate(e.target.value)}
                        type="date" className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Đến ngày</label>
                        <input 
                        value={endDate}
                        onChange={e => setEndDate(e.target.value)}
                        type="date" className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
                    </div>
                    <div className="self-end">
                        <button
                            onClick={handleFilterClick}
                            disabled={loading}
                            className="w-full px-4 py-2 font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-400"
                        >
                            {loading ? 'Đang tải...' : 'Lọc Báo cáo'}
                        </button>
                    </div>
                </div>
            </div>

            {/* --- Bảng Báo cáo (Styled) --- */}
            <div className="p-6 bg-white rounded-xl shadow-lg">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mã NV</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Thời gian Chấm công</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trạng thái</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ảnh bằng chứng</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {logs.map(log => (
                                <tr key={log._id} className="hover:bg-gray-50">
                                    {/* SỬA LỖI CRASH: "log.name" không tồn tại, chỉ có "log.employee_id" */}
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{log.employee_id}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(log.timestamp).toLocaleString('vi-VN')}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                                            Đã chấm công
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                        {/* Hiển thị ảnh thumbnail thay vì link "Xem ảnh" */}
                                        <a href={`http://localhost:5000${log.proof_image_path}`} target="_blank" rel="noopener noreferrer">
                                            <img 
                                                src={`http://localhost:5000${log.proof_image_path}`} 
                                                alt="Proof" 
                                                className="w-16 h-16 object-cover rounded-md shadow-sm hover:scale-150 transition-transform"
                                            />
                                        </a>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <PaginationControls
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={handlePageChange}
                />
            </div>
        </div>
    );
}

export default ReportPage
