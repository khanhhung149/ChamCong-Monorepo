import User from "./models/User.js";
import bcrypt from "bcrypt";
import connectDB  from "./config/db.js";

const userRegister = async()=>{
    try{
        connectDB();
        const hashPassword = await bcrypt.hash("manager",10);
        const newUser = new User({
            name: "Manager",
            employee_id: "MGR000",
            email:"manager@gmail.com",
            password: hashPassword,
            role:"manager"
        });
        await newUser.save();
    }catch(error){
        console.log(error);
    }
}

userRegister();