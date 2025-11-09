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
