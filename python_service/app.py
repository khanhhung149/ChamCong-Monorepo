from flask import Flask, request, jsonify
from deepface import DeepFace
import os
import uuid # Dùng để tạo tên file tạm duy nhất

app = Flask(__name__)

# Đường dẫn đến "cơ sở dữ liệu" ảnh của bạn
DB_PATH = os.path.join(os.path.dirname(__file__), "database")

# Đảm bảo thư mục uploads tồn tại để lưu ảnh tạm
UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), "uploads_temp")
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

@app.route('/recognize', methods=['POST'])
def recognize_face():
    if 'image' not in request.files:
        return jsonify({"error": "No image provided"}), 400

    image_file = request.files['image']
    
    # Tạo một tên file tạm thời và duy nhất
    temp_filename = f"{str(uuid.uuid4())}.jpg"
    temp_filepath = os.path.join(UPLOAD_FOLDER, temp_filename)
    
    # Lưu ảnh được gửi lên vào file tạm
    image_file.save(temp_filepath)
    print(f"📸  Ảnh tạm đã được lưu tại: {temp_filepath}")

    try:
        # Sử dụng DeepFace để tìm khuôn mặt trong database
        # model_name: 'VGG-Face' là một mô hình phổ biến và cân bằng
        # enforce_detection=False: Vẫn cố gắng nhận diện ngay cả khi ảnh chất lượng thấp
        dfs = DeepFace.find(img_path=temp_filepath, db_path=DB_PATH, model_name='VGG-Face', enforce_detection=False)
        
        # DeepFace.find trả về một danh sách các dataframe
        # Nếu danh sách không rỗng và dataframe đầu tiên có dữ liệu
        if dfs and not dfs[0].empty:
            # Lấy dòng đầu tiên (khuôn mặt khớp nhất)
            best_match = dfs[0].iloc[0]
            identity_path = best_match['identity']
            
            # Trích xuất ID nhân viên từ đường dẫn (tên của thư mục cha)
            # Ví dụ: ".../database/NV001/anh_the.jpg" -> "NV001"
            employee_id = os.path.basename(os.path.dirname(identity_path))
            
            print(f"✅  Nhận diện thành công. ID: {employee_id}")
            return jsonify({
                "status": "success",
                "employee_id": employee_id
            })
        else:
            print("⚠️  Không tìm thấy khuôn mặt nào khớp trong database.")
            return jsonify({
                "status": "failed",
                "message": "Unknown face"
            })

    except Exception as e:
        print(f"❌  Đã xảy ra lỗi trong quá trình nhận diện: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

    finally:
        # Luôn xóa file tạm sau khi xử lý xong
        if os.path.exists(temp_filepath):
            os.remove(temp_filepath)
            print(f"🗑️  Đã xóa ảnh tạm: {temp_filepath}")

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001)