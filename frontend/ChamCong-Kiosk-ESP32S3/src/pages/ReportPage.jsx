import React, {use, useEffect, useState} from 'react'
import axios from 'axios'
import authService from '../services/authServices.js'


const ReportPage = () => {
    const [logs, setLogs] =useState([]);
    const [loading, setLoading] = useState(true);

    const fetchLogs = async()=>{
        setLoading(true);
        try{
            const response = await axios.get('http://localhost:5000/api/logs', {
                headers: authService.getAuthHeader(),
            });
            setLogs(response.data);
        }
        catch(error){
            console.log(error);
        }
        setLoading(false);
    };

    useEffect(() =>{fetchLogs();},[]);
  return (
    <div>
      <div>
        <h1>Báo cáo chấm công</h1>
        <button onClick={fetchLogs}
        disabled={loading}

        >{loading ? 'Đang tải...' : 'Tải lại (F5)'}</button>
      </div>
      <div>
        <table>
            <thead>
                <tr>
                    <th>Tên</th>
                    <th>Mã nhân viên</th>
                    <th>Thời gian vào</th>
                    <th>Thời gian ra</th>
                    <th>Trạng thái</th>
                    <th>Ảnh bằng chứng</th>
                </tr>
            </thead>

            <tbody>
                {logs.map(log =>(
                    <tr key={log._id}>
                        <td>{log.name}</td>
                        <td>{log.employee_id}</td>
                        <td>{new Date(log.timestamp).toLocaleString('vi-VN')}</td>
                        <td>Chưa có</td>
                        <td>...</td>
                        <td><a 
                                  href={`http://localhost:5000/${log.proof_image_path}`} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                >
                                    Xem ảnh
                                </a>
                                </td>

                    </tr>
                ))}
            </tbody>
        </table>
      </div>
    </div>
  )
}

export default ReportPage
