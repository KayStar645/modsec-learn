# modsec-learn

## Giới thiệu

`modsec-learn` là bộ công cụ kết hợp ModSecurity CRS với các mô hình học máy
để phát hiện tấn công SQL Injection (SQLi). Dự án cung cấp:

- Bộ đặc trưng dựa trên các luật ModSecurity ở nhiều mức Paranoia Level (PL).
- Tập script tự động hoá huấn luyện, đánh giá và trực quan hoá kết quả.
- Các mô hình học máy huấn luyện sẵn làm đường chuẩn so sánh với ModSecurity.

Tài liệu này hướng dẫn từng bước từ khâu cài đặt môi trường cho tới huấn
luyện và đánh giá mô hình.

## 1. Yêu cầu hệ thống

- Python 3.10 hoặc mới hơn.
- `pip`, `virtualenv` (khuyến nghị).
- Đủ quyền để biên dịch ModSecurity và cài đặt thư viện hệ thống (gcc, make,
  libtool, automake, pkg-config, libxml2, libyajl...).
- Thư viện đồ hoạ: `matplotlib`, `seaborn`, `numpy`, `pandas`, `scikit-learn`,
  `joblib`.

## 2. Chuẩn bị môi trường Python

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
python.exe -m pip install --upgrade pip
pip install --upgrade pip
pip install -r requirements.txt
```

## 3. Cài đặt ModSecurity & pymodsecurity

> Xem hướng dẫn chi tiết trong `docs/modsecurity_setup.md` nếu bạn cần từng bước cụ thể.

1. Biên dịch ModSecurity 3.0.10:
   - Làm theo hướng dẫn chính thức tại:
     https://github.com/SpiderLabs/ModSecurity/wiki/Compilation-recipes-for-v3.x
   - Đảm bảo bật `WITH-LIBXML2`, `WITH-LIBMAGIC`, `WITH-PCRE2`.

2. Cài đặt `pymodsecurity`:
   ```bash
   git clone https://github.com/AvalZ/pymodsecurity.git
   cd pymodsecurity
   python setup.py build
   python setup.py install
   ```

3. Sao chép OWASP Core Rule Set (CRS) 4.0.0 vào thư mục dự án:
   ```bash
   git clone --branch v4.0.0 https://github.com/coreruleset/coreruleset.git
   ```
   - Đặt thư mục `coreruleset/` song song với `modsec_config/`.
   - Các tệp cấu hình ví dụ đã được cung cấp trong `modsec_config/`.

## 4. Chuẩn bị dữ liệu

### 4.1. Tải và ghép bộ dữ liệu gốc

- Bộ dữ liệu nguyên bản nằm trong thư mục `modsec-learn-dataset/`.
- Mỗi nhánh (`legitimate/`, `malicious/`) có script `merge.py` để ghép các
  mảnh JSON nhỏ thành tệp hoàn chỉnh:
  ```bash
  cd modsec-learn-dataset/legitimate
  python merge.py     # tạo legitimate_dataset.json

  cd ../malicious
  python merge.py     # tạo sqli_dataset.json
  ```

### 4.2. Cấu hình đường dẫn trong `config.toml`

Mở `config.toml` và kiểm tra/điều chỉnh các khóa sau sao cho khớp với
hệ thống của bạn:

- `dataset_path`: thư mục chứa các tệp JSON đầu vào (ví dụ `data/dataset/`).
- `legitimate_path`, `malicious_path`: đường dẫn tới dữ liệu đã ghép ở bước 4.1.
- `crs_dir`: đường dẫn tới thư mục chứa các tệp luật CRS (ví dụ `./coreruleset`).
- `models_path`, `figures_path`: thư mục lưu mô hình và biểu đồ đầu ra.

## 5. Xây dựng bộ dữ liệu huấn luyện/kiểm thử

Script `scripts/build_dataset.py` sẽ:
- Đọc dữ liệu gốc,
- Xáo trộn,
- Lấy 25.000 mẫu cho mỗi lớp,
- Chia train/test theo tỷ lệ 80/20,
- Lưu thành 4 tệp:
  - `data/dataset/legitimate_train.json`
  - `data/dataset/legitimate_test.json`
  - `data/dataset/malicious_train.json`
  - `data/dataset/malicious_test.json`

Chạy:
```bash
python scripts/build_dataset.py
```

## 6. Trích xuất mã luật CRS (tùy chọn)

Nếu bạn muốn tạo lại danh sách mã luật (IDs) ModSecurity đã kích hoạt,
hãy chạy:

```bash
python scripts/extract_modsec_crs_ids.py
```

Script sẽ:
- Nạp dữ liệu,
- Cho từng payload đi qua ModSecurity để ghi nhận luật bị kích hoạt,
- Lưu danh sách mã luật vào `data/crs_sqli_ids_4.0.0.json`.

## 7. Huấn luyện mô hình

Script `scripts/run_training.py` sẽ:
- Tải dữ liệu train,
- Trích xuất đặc trưng theo từng Paranoia Level,
- Huấn luyện lần lượt các mô hình `LinearSVC`, `RandomForest`, `LogisticRegression`
  với các chuẩn phạt (L1/L2),
- Lưu mô hình vào thư mục `data/models/` (định dạng `.joblib`).

Chạy lệnh:
```bash
python scripts/run_training.py
```

> Mẹo: đảm bảo ModSecurity đã được cài đặt và các file cấu hình trong
> `modsec_config/` hợp lệ trước khi huấn luyện, vì module trích xuất
> đặc trưng sẽ gọi trực tiếp ModSecurity.

## 8. Đánh giá và trực quan hoá

### 8.1. Vẽ ROC cho mô hình huấn luyện sẵn

Script `scripts/run_experiments.py` sẽ:
- Nạp dữ liệu train/test,
- Trích xuất đặc trưng test theo từng PL,
- Tính điểm dự đoán của các mô hình đã huấn luyện và ModSecurity,
- Vẽ biểu đồ ROC (kèm vùng phóng đại) lưu thành `data/figures/roc_curves.pdf`.

Chạy:
```bash
python scripts/run_experiments.py
```

### 8.2. So sánh trọng số luật

Nếu bạn quan tâm sự khác biệt trọng số giữa mô hình tuyến tính và ModSecurity,
hãy dùng:
```bash
python scripts/analyze_rules.py
```

Kết quả sẽ là các biểu đồ `.pdf` trong `data/figures/`, mỗi biểu đồ so sánh
trọng số của ModSecurity và hai biến thể L1/L2 của mô hình tương ứng.

## 9. Cấu trúc thư mục chính

```
modsec-learn/
├── config.toml                 # Thông số cấu hình chính
├── data/
│   ├── crs_sqli_ids_4.0.0.json # Danh sách mã luật CRS
│   ├── crs_sqli_weights...     # Trọng số luật từ ModSecurity
│   ├── dataset/                # Dữ liệu train/test sau khi build
│   ├── figures/                # Hình ảnh ROC, biểu đồ so sánh
│   └── models/                 # Mô hình huấn luyện (joblib)
├── modsec_config/              # Cấu hình mẫu cho ModSecurity
├── scripts/                    # Các script tự động hoá
└── src/                        # Mã nguồn chính (DataLoader, Extractor, Models, Utils)
```

## 10. Gợi ý xử lý sự cố

- **ModSecurity báo lỗi không tìm thấy file cấu hình**  
  Kiểm tra lại đường dẫn trong `modsec_config/` và đảm bảo chạy script từ
  thư mục gốc dự án.
- **pymodsecurity không import được**  
  Xác minh đã cài đặt đúng Python environment và đường dẫn thư viện hệ thống.
- **ROC không xuất hình**  
  Đảm bảo máy chủ có thể tạo cửa sổ đồ hoạ hoặc sử dụng backend không cần hiển thị
  (ví dụ `matplotlib.use("Agg")`).

## 11. Liên hệ & đóng góp

Nếu bạn gặp lỗi hoặc muốn đóng góp, vui lòng mở issue/PR trực tiếp trên kho
Git. Mọi phản hồi đều được hoan nghênh!

## 12. Demo web trực quan

Dự án kèm theo một ứng dụng web nhỏ trong thư mục `demo_app/` để giả lập các payload
SQLi và quan sát phản ứng của ModSecurity CRS lẫn mô hình học máy.

### 12.1. Chuẩn bị

- Hoàn tất các bước cài đặt ModSecurity, `pymodsecurity` và huấn luyện mô hình (mục 7–8).
- Đảm bảo đã cài thêm dependencies web: `pip install -r requirements.txt` (gồm Flask).
- Nếu môi trường chưa cài được `pymodsecurity`, ứng dụng sẽ tự động chuyển sang chế độ **stub**
  (mô phỏng luật cơ bản) để vẫn có thể trình diễn luồng xử lý.

### 12.2. Khởi chạy

```bash
python -m demo_app.app
```

Ứng dụng mặc định chạy tại `http://127.0.0.1:5000`. Màn hình chính cung cấp:

- Form nhập payload tùy ý, lựa chọn Paranoia Level và mô hình ML.
- Các nút payload mẫu (legit/SQLi/Blind SQLi) để trình diễn nhanh.
- Bảng kết quả hiển thị quyết định của ModSecurity, dự đoán mô hình và các rule CRS bị kích hoạt.

> Lưu ý: khi chạy lần đầu, ứng dụng sẽ nạp toàn bộ mô hình `.joblib` tương ứng từng PL.
> Nếu chưa huấn luyện đủ mô hình, ứng dụng sẽ tự động bỏ qua mô hình không tồn tại.
> Giao diện sẽ hiển thị thêm trạng thái `backend` = `stub` nếu đang dùng chế độ mô phỏng.

### 12.3. Tính năng nâng cao

- **Giao diện đa tab:**  
  - *Trình diễn tức thời*: thử payload thủ công và xem bảng kết quả mới nhất.  
  - *Batch & Lịch sử*: chọn dataset, chạy batch, xem thống kê tóm tắt và tải log JSON.  
  - *Báo cáo mô hình*: biểu đồ so sánh hiệu năng giữa các mô hình ML dựa trên log hiện có.
- **Datasets demo:**  
  - `demo_app/data/sample_attacks.json`: bộ ngắn (~20 payload) cho demo nhanh.  
  - `demo_app/data/advanced_attacks.json`: 100 payload SQLi đa dạng (union, boolean, time-based, error, obfuscated) để trình diễn quy mô lớn.  
    Bạn có thể mở rộng/tuỳ biến cả hai file để phù hợp kịch bản trình diễn.
- **Lựa chọn batch linh hoạt:**  
  - Chọn dataset, số mẫu (để trống hoặc nhập 0 = chạy toàn bộ).  
  - Tick chọn một hay nhiều mô hình ML muốn so sánh cho Paranoia Level tương ứng.  
  - Kết quả mỗi payload sẽ ghi nhận đầy đủ từng mô hình đã chạy (hiển thị trong bảng, modal chi tiết, log và báo cáo biểu đồ).
- **Lịch sử log phân trang:**  
  - Ô `limit` dùng để chọn số dòng mỗi trang, hỗ trợ chuyển trang trước/sau và cập nhật biểu đồ theo dữ liệu trang hiện tại.
- **Batch attack simulator:** chọn dataset + số lượng payload và nhấn “Chạy batch”. Kết quả
  sẽ được lưu vào log, đồng thời tạo thống kê tổng quan (ModSecurity chặn, ML đánh dấu, tỉ lệ đồng thuận).
- **Timeline trực quan:** mỗi bản ghi (thời gian thực hoặc log) có sơ đồ xử lý từng bước
  (nhận payload → ModSecurity → ML → kết luận) hiển thị dưới dạng modal.
- **Báo cáo biểu đồ:** tab “Báo cáo mô hình” sử dụng Chart.js để hiển thị:
  - Tỉ lệ mỗi mô hình đánh dấu payload độc hại.
  - Số lượt dự đoán & mức độ đồng thuận với ModSecurity.
- **Hệ thống log JSON Lines:** mọi phân tích được ghi vào `demo_app/logs/analysis.log`.
  Có thể điều chỉnh số dòng đọc (mặc định 50) và tái tải log ngay trong giao diện.
- **API bổ sung:**
  - `POST /api/run_batch`: chạy batch theo dataset (tham số `dataset`, `limit`, `paranoia_level`, `model_key`).  
  - `GET /api/logs`: đọc log dưới dạng JSON (tham số `limit`).  
  - `GET /api/stats`: trả về thống kê hiệu năng mô hình dựa trên log.  
  - `GET /api/config`: cung cấp thông tin backend, đường dẫn log, danh sách dataset, mô hình sẵn có.