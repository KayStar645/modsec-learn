# Hướng dẫn chạy Demo Web

## Yêu cầu trước khi chạy

1. **Python 3.10+** đã được cài đặt
2. **Các thư viện Python** đã được cài đặt:
   ```bash
   pip install -r requirements.txt
   ```
   (Bao gồm: Flask, numpy, pandas, scikit-learn, joblib, toml, matplotlib, seaborn)

3. **ModSecurity & pymodsecurity** (tùy chọn):
   - Nếu đã cài đặt: demo sẽ sử dụng ModSecurity thật
   - Nếu chưa cài: demo tự động chuyển sang chế độ **stub** (mô phỏng)

4. **Mô hình học máy** (tùy chọn):
   - Nếu đã huấn luyện mô hình: demo sẽ sử dụng các mô hình thật
   - Nếu chưa có: demo vẫn chạy được nhưng chỉ hiển thị kết quả ModSecurity

5. **File cấu hình**:
   - Đảm bảo file `config.toml` tồn tại ở thư mục gốc
   - File `data/crs_sqli_ids_4.0.0.json` phải tồn tại (nếu không sẽ báo lỗi)

## Cách chạy Demo

### Bước 1: Kích hoạt môi trường ảo (nếu có)

```bash
# Windows
.venv\Scripts\activate

# Linux/Mac
source .venv/bin/activate
```

### Bước 2: Chạy ứng dụng

Từ thư mục gốc của dự án, chạy một trong các lệnh sau:

**Cách 1: Sử dụng module Python (khuyến nghị)**
```bash
python -m demo_app.app
```

**Cách 2: Chạy trực tiếp file**
```bash
python demo_app/app.py
```

### Bước 3: Truy cập ứng dụng

Mở trình duyệt và truy cập:
```
http://127.0.0.1:5000
```

hoặc

```
http://localhost:5000
```

## Các tính năng của Demo

### 1. Tab "Trình diễn tức thời"
- Nhập payload tùy ý hoặc chọn payload mẫu
- Chọn Paranoia Level (1-4)
- Chọn mô hình ML (nếu có)
- Xem kết quả phân tích ngay lập tức:
  - Quyết định của ModSecurity (block/allow)
  - Điểm số ModSecurity
  - Các luật CRS bị kích hoạt
  - Dự đoán của mô hình ML
  - Timeline xử lý từng bước

### 2. Tab "Batch & Lịch sử"
- **Chạy batch**: Chọn dataset và số lượng payload
  - `sample_attacks.json`: ~20 payload mẫu
  - `advanced_attacks.json`: 100 payload SQLi đa dạng
- **Xem lịch sử**: Phân trang các bản ghi đã phân tích
- **Tải log**: Xuất log dưới dạng JSON
- **Thống kê**: Xem tổng quan kết quả batch

### 3. Tab "Báo cáo mô hình"
- Biểu đồ so sánh hiệu năng các mô hình ML
- Tỉ lệ phát hiện tấn công
- Mức độ đồng thuận với ModSecurity

## Cấu trúc dữ liệu

### Datasets mẫu
- `demo_app/data/sample_attacks.json`: Dataset nhỏ (~20 payload) cho demo nhanh
- `demo_app/data/advanced_attacks.json`: Dataset lớn (100 payload) với nhiều loại SQLi

### Log files
- `demo_app/logs/analysis.log`: File log JSON Lines chứa tất cả các phân tích

## Xử lý sự cố

### Lỗi: "Không tìm thấy tệp cấu hình"
- Đảm bảo file `config.toml` tồn tại ở thư mục gốc
- Kiểm tra đường dẫn trong `config.toml` có đúng không

### Lỗi: "Không tìm thấy danh sách CRS IDs"
- Đảm bảo file `data/crs_sqli_ids_4.0.0.json` tồn tại
- Nếu chưa có, chạy script:
  ```bash
  python scripts/extract_modsec_crs_ids.py
  ```

### Lỗi: "Port 5000 đã được sử dụng"
- Thay đổi port trong `demo_app/app.py`:
  ```python
  app.run(debug=True, host="0.0.0.0", port=5001)  # Đổi port
  ```

### Demo chạy nhưng không có mô hình ML
- Đây là bình thường nếu chưa huấn luyện mô hình
- Demo vẫn hoạt động và hiển thị kết quả ModSecurity
- Để có mô hình ML, chạy:
  ```bash
  python scripts/run_training.py
  ```

### Backend hiển thị "stub"
- Nghĩa là `pymodsecurity` chưa được cài đặt
- Demo vẫn hoạt động nhưng chỉ mô phỏng ModSecurity
- Để có ModSecurity thật, cần cài đặt theo hướng dẫn trong `docs/modsecurity_setup.md`

## API Endpoints

Demo cung cấp các API endpoint sau:

- `GET /`: Trang chủ
- `GET /api/config`: Lấy thông tin cấu hình (paranoia levels, models, datasets)
- `POST /api/analyze`: Phân tích một payload
- `POST /api/run_batch`: Chạy batch phân tích
- `GET /api/logs`: Lấy log entries (hỗ trợ phân trang)
- `GET /api/stats`: Lấy thống kê mô hình

## Ví dụ sử dụng API

### Phân tích payload đơn lẻ
```bash
curl -X POST http://localhost:5000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "payload": "1 OR 1=1",
    "paranoia_level": 2,
    "model_key": "log_reg_l1"
  }'
```

### Chạy batch
```bash
curl -X POST http://localhost:5000/api/run_batch \
  -H "Content-Type: application/json" \
  -d '{
    "dataset": "sample_attacks",
    "limit": 10,
    "paranoia_level": 2,
    "model_keys": ["log_reg_l1", "svc_l2"]
  }'
```

## Lưu ý

- Demo chạy ở chế độ `debug=True`, không nên dùng cho production
- Mọi phân tích đều được ghi vào log file
- Log file có thể phát triển lớn theo thời gian, nên định kỳ xóa hoặc rotate

