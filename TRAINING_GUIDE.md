# Hướng Dẫn Huấn Luyện Mô Hình

Tài liệu này hướng dẫn chi tiết từng bước để huấn luyện các mô hình machine learning cho dự án `modsec-learn`.

## Mục Lục

1. [Yêu Cầu Trước Khi Bắt Đầu](#1-yêu-cầu-trước-khi-bắt-đầu)
2. [Hiểu Về Quy Trình Huấn Luyện](#2-hiểu-về-quy-trình-huấn-luyện)
3. [Cấu Hình Tham Số](#3-cấu-hình-tham-số)
4. [Huấn Luyện Mô Hình](#4-huấn-luyện-mô-hình)
5. [Kiểm Tra Kết Quả](#5-kiểm-tra-kết-quả)
6. [Đánh Giá Mô Hình](#6-đánh-giá-mô-hình)
7. [Trực Quan Hóa Kết Quả](#7-trực-quan-hóa-kết-quả)
8. [Phân Tích Trọng Số Luật](#8-phân-tích-trọng-số-luật)
9. [Xử Lý Sự Cố](#9-xử-lý-sự-cố)
10. [Tối Ưu Hóa Hiệu Suất](#10-tối-ưu-hóa-hiệu-suất)

---

## 1. Yêu Cầu Trước Khi Bắt Đầu

### 1.1. Hoàn Tất Các Bước Setup

Đảm bảo bạn đã hoàn tất **TẤT CẢ** các bước trong `DATA_SETUP_GUIDE.md`:

- ✅ Môi trường Python đã được cài đặt
- ✅ ModSecurity và pymodsecurity đã được cài đặt
- ✅ Dữ liệu train/test đã được tạo (4 file trong `data/dataset/`)
- ✅ File `data/crs_sqli_ids_4.0.0.json` đã được tạo
- ✅ File cấu hình `config.toml` đã được điều chỉnh đúng

### 1.2. Kiểm Tra Dữ Liệu

Chạy lệnh kiểm tra nhanh:

```bash
python -c "
import os
import json

required_files = [
    'data/dataset/legitimate_train.json',
    'data/dataset/legitimate_test.json',
    'data/dataset/malicious_train.json',
    'data/dataset/malicious_test.json',
    'data/crs_sqli_ids_4.0.0.json'
]

missing = []
for f in required_files:
    if not os.path.exists(f):
        missing.append(f)

if missing:
    print('✗ Thiếu các file sau:')
    for f in missing:
        print(f'  - {f}')
    exit(1)
else:
    print('✓ Tất cả file cần thiết đã sẵn sàng!')
    
    # Kiểm tra số lượng mẫu
    with open('data/dataset/legitimate_train.json', 'r') as f:
        leg_train = len(json.load(f))
    with open('data/dataset/malicious_train.json', 'r') as f:
        mal_train = len(json.load(f))
    print(f'  - Legitimate train: {leg_train:,} mẫu')
    print(f'  - Malicious train: {mal_train:,} mẫu')
"
```

### 1.3. Kích Hoạt Môi Trường Ảo

Đảm bảo môi trường ảo đã được kích hoạt:

**Windows:**
```powershell
.venv\Scripts\Activate.ps1
```

**Linux/macOS:**
```bash
source .venv/bin/activate
```

---

## 2. Hiểu Về Quy Trình Huấn Luyện

### 2.1. Tổng Quan

Quy trình huấn luyện bao gồm các bước sau:

1. **Nạp dữ liệu train**: Đọc 2 file `legitimate_train.json` và `malicious_train.json`
2. **Trích xuất đặc trưng**: Cho từng payload đi qua ModSecurity để lấy vector đặc trưng (các luật bị kích hoạt)
3. **Huấn luyện mô hình**: Train các mô hình ML với đặc trưng đã trích xuất
4. **Lưu mô hình**: Lưu mô hình đã train vào file `.joblib`

### 2.2. Paranoia Level (PL)

ModSecurity CRS có 4 mức Paranoia Level (1-4):
- **PL1**: Mức cơ bản, ít luật nhất, ít false positive
- **PL2**: Mức trung bình
- **PL3**: Mức cao, nhiều luật hơn, có thể có false positive
- **PL4**: Mức cao nhất, nhiều luật nhất, có thể có nhiều false positive

Mỗi PL sẽ có bộ đặc trưng khác nhau (số lượng luật khác nhau), do đó chúng ta sẽ train riêng mô hình cho từng PL.

### 2.3. Các Mô Hình Sẽ Được Train

Dự án này train 3 loại mô hình:

1. **LinearSVC (Support Vector Classifier)**
   - Với penalty L1 và L2
   - Tên file: `linear_svc_pl{1-4}_l{1,2}.joblib`

2. **Logistic Regression**
   - Với penalty L1 và L2
   - Tên file: `log_reg_pl{1-4}_l{1,2}.joblib`

3. **Random Forest**
   - Không có penalty
   - Tên file: `rf_pl{1-4}.joblib`

**Tổng cộng:** 4 PL × (2 SVC + 2 LogReg + 1 RF) = **20 mô hình**

### 2.4. Thời Gian Huấn Luyện Ước Tính

- **Trích xuất đặc trưng**: ~30-60 phút (cho mỗi PL)
- **Train mỗi mô hình**: ~1-5 phút
- **Tổng thời gian**: ~3-5 giờ (tùy thuộc vào phần cứng)

---

## 3. Cấu Hình Tham Số

### Bước 3.1: Mở File Cấu Hình

Mở file `config.toml` và kiểm tra các tham số:

```toml
[params]
# Các mức Paranoia Level sẽ train
paranoia_levels = [1, 2, 3, 4]

# Các mô hình có tham số penalty
models = ['svc', 'log_reg']

# Các mô hình không có tham số penalty
other_models = ['rf', 'modsec']

# Các loại penalty
penalties = ['l1', 'l2']
```

### Bước 3.2: Tùy Chỉnh (Tùy Chọn)

Nếu bạn muốn train ít mô hình hơn để tiết kiệm thời gian:

**Ví dụ: Chỉ train PL1 và PL2:**
```toml
paranoia_levels = [1, 2]
```

**Ví dụ: Chỉ train Random Forest:**
```toml
models = []
other_models = ['rf']
```

**Lưu ý:** Không xóa `'modsec'` khỏi `other_models` vì nó không được train (chỉ dùng để so sánh).

### Bước 3.3: Kiểm Tra Đường Dẫn

Đảm bảo các đường dẫn trong `config.toml` đúng:

```toml
crs_dir = "./coreruleset/rules/"
crs_ids_path = "./data/crs_sqli_ids_4.0.0.json"
models_path = "./data/models/"
dataset_path = './data/dataset/'
```

---

## 4. Huấn Luyện Mô Hình

### Bước 4.1: Hiểu Về Script run_training.py

Script `scripts/run_training.py` sẽ:

1. Đọc cấu hình từ `config.toml`
2. Nạp dữ liệu train
3. Với mỗi Paranoia Level:
   - Trích xuất đặc trưng (cho payload đi qua ModSecurity)
   - Với mỗi mô hình:
     - Khởi tạo mô hình với tham số phù hợp
     - Train mô hình
     - Lưu mô hình vào file `.joblib`

### Bước 4.2: Chạy Script Huấn Luyện

Đảm bảo bạn đang ở thư mục gốc dự án:

```bash
python scripts/run_training.py
```

**Trên Linux/macOS:**
```bash
python3 scripts/run_training.py
```

### Bước 4.3: Theo Dõi Tiến Trình

Script sẽ in ra các thông báo như sau:

```
[INFO] Đang nạp bộ dữ liệu...
[INFO] Đang trích xuất đặc trưng cho PL 1...
[INFO] Đang huấn luyện mô hình svc cho PL 1...
[INFO] Đang huấn luyện mô hình svc cho PL 1...
[INFO] Đang huấn luyện mô hình rf cho PL 1...
[INFO] Đang huấn luyện mô hình log_reg cho PL 1...
[INFO] Đang huấn luyện mô hình log_reg cho PL 1...
[INFO] Đang trích xuất đặc trưng cho PL 2...
...
```

**Lưu ý quan trọng:**
- Quá trình trích xuất đặc trưng là bước chậm nhất (có thể mất 30-60 phút cho mỗi PL)
- Mỗi payload phải đi qua ModSecurity để lấy vector đặc trưng
- Có thể thấy CPU/Memory sử dụng cao trong quá trình này

### Bước 4.4: Xử Lý Nếu Bị Gián Đoạn

Nếu script bị dừng giữa chừng:

1. **Kiểm tra mô hình đã train:**
```bash
ls data/models/
```

2. **Chạy lại script:** Script sẽ tự động bỏ qua các mô hình đã tồn tại (nếu file đã có)

3. **Hoặc xóa mô hình chưa hoàn chỉnh và train lại:**
```bash
# Xóa tất cả mô hình (cẩn thận!)
rm data/models/*.joblib

# Hoặc xóa mô hình cụ thể
rm data/models/linear_svc_pl1_l1.joblib
```

---

## 5. Kiểm Tra Kết Quả

### Bước 5.1: Kiểm Tra Số Lượng Mô Hình

Sau khi train xong, kiểm tra số lượng mô hình đã được tạo:

```bash
# Đếm số file mô hình
ls data/models/*.joblib | wc -l

# Hoặc trên Windows PowerShell
(Get-ChildItem data\models\*.joblib).Count
```

**Kết quả mong đợi:** 20 file (4 PL × 5 mô hình)

### Bước 5.2: Liệt Kê Tất Cả Mô Hình

```bash
ls -lh data/models/
```

**Kết quả mong đợi:**
```
linear_svc_pl1_l1.joblib
linear_svc_pl1_l2.joblib
linear_svc_pl2_l1.joblib
linear_svc_pl2_l2.joblib
linear_svc_pl3_l1.joblib
linear_svc_pl3_l2.joblib
linear_svc_pl4_l1.joblib
linear_svc_pl4_l2.joblib
log_reg_pl1_l1.joblib
log_reg_pl1_l2.joblib
log_reg_pl2_l1.joblib
log_reg_pl2_l2.joblib
log_reg_pl3_l1.joblib
log_reg_pl3_l2.joblib
log_reg_pl4_l1.joblib
log_reg_pl4_l2.joblib
rf_pl1.joblib
rf_pl2.joblib
rf_pl3.joblib
rf_pl4.joblib
```

### Bước 5.3: Kiểm Tra Kích Thước File

```bash
python -c "
import os
models_dir = 'data/models'
files = [f for f in os.listdir(models_dir) if f.endswith('.joblib')]
print(f'Tổng số mô hình: {len(files)}')
print('\nKích thước từng mô hình:')
for f in sorted(files):
    size = os.path.getsize(os.path.join(models_dir, f))
    print(f'  {f}: {size/1024/1024:.2f} MB')
"
```

**Lưu ý:** 
- Mô hình Random Forest thường lớn hơn (có thể 10-50 MB)
- Mô hình LinearSVC và Logistic Regression thường nhỏ hơn (1-5 MB)

### Bước 5.4: Kiểm Tra Mô Hình Có Thể Load Được

```bash
python -c "
import joblib
import os

models_dir = 'data/models'
files = [f for f in os.listdir(models_dir) if f.endswith('.joblib')]

print('Kiểm tra load mô hình:')
for f in sorted(files)[:3]:  # Chỉ test 3 mô hình đầu
    try:
        model = joblib.load(os.path.join(models_dir, f))
        print(f'  ✓ {f}: OK (type: {type(model).__name__})')
    except Exception as e:
        print(f'  ✗ {f}: LỖI - {e}')
"
```

---

## 6. Đánh Giá Mô Hình

### Bước 6.1: Hiểu Về Script run_experiments.py

Script `scripts/run_experiments.py` sẽ:
1. Nạp dữ liệu test
2. Trích xuất đặc trưng test cho từng PL
3. Load các mô hình đã train
4. Tính điểm dự đoán cho từng mô hình
5. So sánh với ModSecurity
6. Vẽ biểu đồ ROC (Receiver Operating Characteristic)
7. Lưu biểu đồ vào `data/figures/roc_curves.pdf`

### Bước 6.2: Chạy Script Đánh Giá

```bash
python scripts/run_experiments.py
```

**Lưu ý:**
- Quá trình này cũng mất thời gian vì phải trích xuất đặc trưng cho dữ liệu test
- Script sẽ tạo file PDF chứa biểu đồ ROC

### Bước 6.3: Xem Kết Quả

Sau khi chạy xong, kiểm tra file biểu đồ:

```bash
ls -lh data/figures/roc_curves.pdf
```

Mở file PDF để xem biểu đồ ROC so sánh hiệu suất các mô hình.

**Giải thích biểu đồ ROC:**
- **Trục X (False Positive Rate)**: Tỷ lệ dự đoán sai payload hợp lệ là độc hại
- **Trục Y (True Positive Rate)**: Tỷ lệ dự đoán đúng payload độc hại
- **Đường chéo**: Mô hình ngẫu nhiên (baseline)
- **Đường cong càng gần góc trên bên trái**: Mô hình càng tốt
- **AUC (Area Under Curve)**: Diện tích dưới đường cong, càng gần 1.0 càng tốt

---

## 7. Trực Quan Hóa Kết Quả

### Bước 7.1: Xem Biểu Đồ ROC

Mở file `data/figures/roc_curves.pdf` bằng PDF viewer.

Biểu đồ sẽ hiển thị:
- Các đường ROC cho từng mô hình (LinearSVC L1/L2, Logistic Regression L1/L2, Random Forest)
- So sánh với ModSecurity
- Có thể có nhiều biểu đồ cho các PL khác nhau

### Bước 7.2: Phân Tích Kết Quả

**Các câu hỏi cần trả lời:**
1. Mô hình nào có AUC cao nhất?
2. Mô hình nào có False Positive Rate thấp nhất?
3. Mô hình ML có tốt hơn ModSecurity không?
4. PL nào cho kết quả tốt nhất?

---

## 8. Phân Tích Trọng Số Luật

### Bước 8.1: Hiểu Về Script analyze_rules.py

Script `scripts/analyze_rules.py` sẽ:
1. So sánh trọng số (weights) của các luật giữa:
   - ModSecurity (trọng số mặc định)
   - Mô hình LinearSVC/Logistic Regression với L1
   - Mô hình LinearSVC/Logistic Regression với L2
2. Vẽ biểu đồ so sánh
3. Lưu vào `data/figures/`

### Bước 8.2: Chạy Script Phân Tích

```bash
python scripts/analyze_rules.py
```

### Bước 8.3: Xem Kết Quả

Kiểm tra các file biểu đồ đã được tạo:

```bash
ls data/figures/
```

Các file có thể bao gồm:
- `rule_weights_comparison_pl1.pdf`
- `rule_weights_comparison_pl2.pdf`
- ...

**Giải thích:**
- Biểu đồ so sánh trọng số của từng luật CRS
- Giúp hiểu mô hình ML "học" được gì từ dữ liệu
- So sánh với trọng số mặc định của ModSecurity

---

## 9. Xử Lý Sự Cố

### Lỗi 1: Không Tìm Thấy File Dữ Liệu

**Triệu chứng:**
```
FileNotFoundError: [Errno 2] No such file or directory: 'data/dataset/legitimate_train.json'
```

**Giải pháp:**
1. Kiểm tra file có tồn tại: `ls data/dataset/`
2. Đảm bảo đã chạy `scripts/build_dataset.py` trước
3. Kiểm tra đường dẫn trong `config.toml`

### Lỗi 2: ModSecurity Không Hoạt Động

**Triệu chứng:**
```
Error: ModSecurity initialization failed
```

**Giải pháp:**
1. Kiểm tra ModSecurity đã được cài đặt: `python -c "import pymodsecurity"`
2. Kiểm tra file cấu hình trong `modsec_config/`
3. Kiểm tra đường dẫn `crs_dir` trong `config.toml`

### Lỗi 3: Thiếu File CRS IDs

**Triệu chứng:**
```
ValueError: Không tìm thấy mã luật CRS
```

**Giải pháp:**
1. Chạy script trích xuất CRS IDs trước:
```bash
python scripts/extract_modsec_crs_ids.py
```

### Lỗi 4: Hết Bộ Nhớ (Out of Memory)

**Triệu chứng:**
```
MemoryError
```

**Giải pháp:**
1. Giảm số lượng mẫu train (sửa trong `build_dataset.py`)
2. Train từng PL một (sửa `paranoia_levels = [1]` trong `config.toml`)
3. Sử dụng máy có RAM lớn hơn

### Lỗi 5: Mô Hình Không Load Được

**Triệu chứng:**
```
joblib.exceptions.UnpicklingError
```

**Giải pháp:**
1. Xóa file mô hình bị lỗi
2. Train lại mô hình đó

### Lỗi 6: Lỗi Khi Vẽ Biểu Đồ

**Triệu chứng:**
```
RuntimeError: Invalid DISPLAY variable
```

**Giải pháp:**
1. **Trên Linux (headless server):**
```python
import matplotlib
matplotlib.use('Agg')  # Thêm vào đầu script
```

2. **Hoặc cài đặt Xvfb:**
```bash
sudo apt-get install xvfb
xvfb-run python scripts/run_experiments.py
```

---

## 10. Tối Ưu Hóa Hiệu Suất

### 10.1. Tăng Tốc Trích Xuất Đặc Trưng

Quá trình trích xuất đặc trưng là bottleneck chính. Một số cách tối ưu:

1. **Sử dụng đa luồng (nếu có thể):**
   - Sửa code trong `extractor.py` để xử lý song song
   - Lưu ý: ModSecurity có thể không thread-safe

2. **Cache kết quả:**
   - Lưu đặc trưng đã trích xuất vào file
   - Load lại thay vì tính lại

3. **Giảm số lượng mẫu:**
   - Train với ít mẫu hơn (ví dụ: 10,000 thay vì 20,000)

### 10.2. Tối Ưu Tham Số Mô Hình

Có thể điều chỉnh tham số trong `run_training.py`:

**LinearSVC:**
```python
model = LinearSVC(
    C=0.5,  # Có thể thử 0.1, 1.0, 10.0
    penalty=penalty,
    ...
)
```

**Logistic Regression:**
```python
model = LogisticRegression(
    C=0.5,  # Có thể thử các giá trị khác
    max_iter=1000,  # Tăng nếu không hội tụ
    ...
)
```

**Random Forest:**
```python
model = RandomForestClassifier(
    n_estimators=100,  # Có thể tăng lên 200, 500
    max_depth=None,    # Có thể giới hạn: max_depth=20
    ...
)
```

### 10.3. Sử Dụng GPU (Nếu Có)

Một số thư viện ML hỗ trợ GPU:
- XGBoost (có thể thay thế Random Forest)
- CuPy (thay thế NumPy)

Tuy nhiên, các mô hình trong dự án này (LinearSVC, Logistic Regression, Random Forest) từ scikit-learn không hỗ trợ GPU trực tiếp.

---

## Kết Luận

Sau khi hoàn tất tất cả các bước trên, bạn đã có:

- ✅ 20 mô hình đã được huấn luyện (4 PL × 5 mô hình)
- ✅ Biểu đồ ROC so sánh hiệu suất các mô hình
- ✅ Phân tích trọng số luật (nếu đã chạy `analyze_rules.py`)
- ✅ Hiểu rõ quy trình và có thể tùy chỉnh

Bạn có thể:
- Sử dụng các mô hình đã train để dự đoán payload mới
- So sánh hiệu suất giữa các mô hình
- Chạy demo web app (xem `README.md` phần 12)

---

## Tài Liệu Tham Khảo

- [scikit-learn Documentation](https://scikit-learn.org/stable/)
- [ModSecurity CRS Documentation](https://coreruleset.org/)
- [ROC Curve Explanation](https://en.wikipedia.org/wiki/Receiver_operating_characteristic)
- [Machine Learning Best Practices](https://scikit-learn.org/stable/modules/cross_validation.html)

---

## Phụ Lục: Script Kiểm Tra Nhanh

Tạo file `check_training.py` để kiểm tra nhanh:

```python
import os
import json
import joblib

print("=== KIỂM TRA TRAINING ===\n")

# 1. Kiểm tra file dữ liệu
print("1. Kiểm tra dữ liệu:")
data_files = [
    'data/dataset/legitimate_train.json',
    'data/dataset/malicious_train.json',
    'data/crs_sqli_ids_4.0.0.json'
]
for f in data_files:
    if os.path.exists(f):
        with open(f, 'r') as file:
            data = json.load(file)
            print(f"  ✓ {f}: {len(data) if isinstance(data, list) else 'OK'}")
    else:
        print(f"  ✗ {f}: KHÔNG TỒN TẠI")

# 2. Kiểm tra mô hình
print("\n2. Kiểm tra mô hình:")
models_dir = 'data/models'
if os.path.exists(models_dir):
    models = [f for f in os.listdir(models_dir) if f.endswith('.joblib')]
    print(f"  Tổng số mô hình: {len(models)}")
    
    # Kiểm tra từng PL
    for pl in [1, 2, 3, 4]:
        pl_models = [m for m in models if f'pl{pl}' in m]
        print(f"  PL{pl}: {len(pl_models)} mô hình")
        
        # Test load một mô hình
        if pl_models:
            try:
                model = joblib.load(os.path.join(models_dir, pl_models[0]))
                print(f"    ✓ Có thể load: {pl_models[0]}")
            except:
                print(f"    ✗ Lỗi khi load: {pl_models[0]}")
else:
    print(f"  ✗ Thư mục {models_dir} không tồn tại")

# 3. Kiểm tra biểu đồ
print("\n3. Kiểm tra biểu đồ:")
figures_dir = 'data/figures'
if os.path.exists(figures_dir):
    figures = [f for f in os.listdir(figures_dir) if f.endswith('.pdf')]
    print(f"  Tổng số biểu đồ: {len(figures)}")
    for f in figures:
        print(f"  - {f}")
else:
    print(f"  ✗ Thư mục {figures_dir} không tồn tại")

print("\n=== HOÀN TẤT ===")
```

Chạy script:
```bash
python check_training.py
```

