import axios from "axios";
import {jwtDecode} from "jwt-decode";

const API_URL = `http://localhost:5000/api/auth`;

const login = async (email, password) =>{
    const response = await axios.post(`${API_URL}/login`, {
        email,
        password
    });
    if(response.data.token){
        localStorage.setItem("jwtToken", response.data.token);
    }
    return response.data;

}

const logout = () =>{
    localStorage.removeItem("jwtToken");
}

const getToken = () =>{
    return localStorage.getItem("jwtToken");
}

const getUser = () =>{
    try{
    const token = getToken();
    if(token){
        const decoded = jwtDecode(token);
        return decoded;
    }
    return null;
    }
    catch(error){
        return null;
    }
}

const getAuthHeader = () =>{
    const token = getToken();
    if(token){
        return {Authorization: `Bearer ${token}`};
    }
    else {
        return {};
    }
}

const authService = {
    login,
    logout,
    getToken,
    getUser,
    getAuthHeader
};

export default authService;