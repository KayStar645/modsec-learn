# Hướng Dẫn Setup và Xử Lý Dữ Liệu

Tài liệu này hướng dẫn chi tiết từng bước để chuẩn bị môi trường và xử lý toàn bộ dữ liệu cho dự án `modsec-learn`.

## Mục Lục

1. [Yêu Cầu Hệ Thống](#1-yêu-cầu-hệ-thống)
2. [Cài Đặt Môi Trường Python](#2-cài-đặt-môi-trường-python)
3. [Cài Đặt ModSecurity và pymodsecurity](#3-cài-đặt-modsecurity-và-pymodsecurity)
4. [Cài Đặt OWASP Core Rule Set (CRS)](#4-cài-đặt-owasp-core-rule-set-crs)
5. [Chuẩn Bị Dữ Liệu Gốc](#5-chuẩn-bị-dữ-liệu-gốc)
6. [Cấu Hình Đường Dẫn](#6-cấu-hình-đường-dẫn)
7. [Ghép Dữ Liệu Từ Các File Nhỏ](#7-ghép-dữ-liệu-từ-các-file-nhỏ)
8. [Xây Dựng Bộ Dữ Liệu Train/Test](#8-xây-dựng-bộ-dữ-liệu-traintest)
9. [Trích Xuất Mã Luật CRS](#9-trích-xuất-mã-luật-crs)
10. [Kiểm Tra Kết Quả](#10-kiểm-tra-kết-quả)
11. [Xử Lý Sự Cố](#11-xử-lý-sự-cố)

---

## 1. Yêu Cầu Hệ Thống

Trước khi bắt đầu, đảm bảo hệ thống của bạn đáp ứng các yêu cầu sau:

### 1.1. Phần Mềm Cơ Bản

- **Python**: Phiên bản 3.10 trở lên
  - Kiểm tra: `python --version` hoặc `python3 --version`
- **pip**: Công cụ quản lý gói Python
  - Kiểm tra: `pip --version` hoặc `pip3 --version`
- **virtualenv** (khuyến nghị): Để tạo môi trường ảo Python
  - Kiểm tra: `virtualenv --version`

### 1.2. Công Cụ Biên Dịch (Cho ModSecurity)

**Trên Windows (WSL hoặc MSYS2):**
- `gcc` hoặc `clang` (trình biên dịch C/C++)
- `make` (công cụ build)
- `libtool`, `automake`, `autoconf` (công cụ tự động hóa build)
- `pkg-config` (quản lý thư viện)

**Trên Linux:**
```bash
sudo apt-get update
sudo apt-get install -y build-essential libtool automake autoconf pkg-config
sudo apt-get install -y libxml2-dev libyajl-dev libpcre2-dev libcurl4-openssl-dev
```

**Trên macOS:**
```bash
brew install automake autoconf libtool pkg-config
brew install libxml2 libyajl pcre2 curl
```

### 1.3. Thư Viện Hệ Thống Cần Thiết

- `libxml2`: Xử lý XML
- `libyajl`: Xử lý JSON
- `pcre2`: Biểu thức chính quy
- `libcurl`: Xử lý HTTP requests

---

## 2. Cài Đặt Môi Trường Python

### Bước 2.1: Tạo Môi Trường Ảo

Mở terminal/command prompt và di chuyển đến thư mục gốc của dự án:

```bash
cd D:\2.Learn\1.HUIT\1.Master\3.ModernIssues\1.Project\modsec-learn
```

**Trên Windows (PowerShell hoặc CMD):**
```bash
python -m venv .venv
```

**Trên Linux/macOS:**
```bash
python3 -m venv .venv
```

### Bước 2.2: Kích Hoạt Môi Trường Ảo

**Trên Windows (PowerShell):**
```powershell
.venv\Scripts\Activate.ps1
```

**Trên Windows (CMD):**
```cmd
.venv\Scripts\activate.bat
```

**Trên Linux/macOS:**
```bash
source .venv/bin/activate
```

Sau khi kích hoạt, bạn sẽ thấy `(.venv)` ở đầu dòng lệnh.

### Bước 2.3: Nâng Cấp pip

```bash
python -m pip install --upgrade pip
```

### Bước 2.4: Cài Đặt Các Thư Viện Python

```bash
pip install -r requirements.txt
```

Các thư viện sẽ được cài đặt:
- `numpy==1.26.4`: Tính toán số học
- `pandas==1.3.5`: Xử lý dữ liệu
- `matplotlib==3.8.4`: Vẽ biểu đồ
- `joblib==1.3.2`: Lưu/tải mô hình
- `scikit-learn==1.4.0`: Machine learning
- `toml==0.10.2`: Đọc file cấu hình
- `seaborn==0.13.2`: Vẽ biểu đồ nâng cao
- `Flask==3.0.3`: Web framework (cho demo app)

**Kiểm tra cài đặt:**
```bash
python -c "import numpy, pandas, sklearn; print('Cài đặt thành công!')"
```

---

## 3. Cài Đặt ModSecurity và pymodsecurity

### Bước 3.1: Tải ModSecurity

ModSecurity là một Web Application Firewall (WAF) mã nguồn mở. Chúng ta cần biên dịch từ mã nguồn.

**Tải mã nguồn ModSecurity 3.0.10:**
```bash
cd ..
git clone https://github.com/SpiderLabs/ModSecurity.git
cd ModSecurity
git checkout v3.0.10
```

Hoặc tải file ZIP từ: https://github.com/SpiderLabs/ModSecurity/releases/tag/v3.0.10

### Bước 3.2: Biên Dịch ModSecurity

**Trên Linux/macOS:**
```bash
cd ModSecurity
./build.sh
./configure --with-libxml2 --with-libmagic --with-pcre2
make
sudo make install
```

**Trên Windows (WSL):**
Làm tương tự như Linux.

**Lưu ý quan trọng:**
- Đảm bảo các thư viện `libxml2`, `libmagic`, `pcre2` đã được cài đặt
- Nếu gặp lỗi thiếu thư viện, cài đặt các package tương ứng

### Bước 3.3: Cài Đặt pymodsecurity

`pymodsecurity` là Python binding cho ModSecurity, cho phép gọi ModSecurity từ Python.

```bash
cd ..
git clone https://github.com/AvalZ/pymodsecurity.git
cd pymodsecurity
python setup.py build
python setup.py install
```

**Kiểm tra cài đặt:**
```bash
python -c "import pymodsecurity; print('pymodsecurity đã được cài đặt!')"
```

Nếu gặp lỗi, tham khảo tài liệu tại: https://github.com/AvalZ/pymodsecurity

---

## 4. Cài Đặt OWASP Core Rule Set (CRS)

OWASP CRS là bộ luật bảo mật cho ModSecurity. Dự án này sử dụng phiên bản 4.0.0.

### Bước 4.1: Tải CRS 4.0.0

```bash
cd D:\2.Learn\1.HUIT\1.Master\3.ModernIssues\1.Project\modsec-learn
git clone --branch v4.0.0 https://github.com/coreruleset/coreruleset.git
```

Hoặc tải từ: https://github.com/coreruleset/coreruleset/releases/tag/v4.0.0

### Bước 4.2: Kiểm Tra Cấu Trúc

Sau khi tải, cấu trúc thư mục sẽ như sau:
```
modsec-learn/
├── coreruleset/
│   └── rules/          # Thư mục chứa các file luật CRS
│       ├── REQUEST-942-APPLICATION-ATTACK-SQLI.conf
│       ├── REQUEST-943-APPLICATION-ATTACK-SESSION-FIXATION.conf
│       └── ...
├── modsec_config/      # File cấu hình ModSecurity
└── ...
```

### Bước 4.3: Kiểm Tra File Cấu Hình

Đảm bảo các file cấu hình trong `modsec_config/` đã tồn tại:
- `modsecurity.conf`: Cấu hình chính
- `crs-setup-pl1.conf`: Cấu hình cho Paranoia Level 1
- `crs-setup-pl2.conf`: Cấu hình cho Paranoia Level 2
- `crs-setup-pl3.conf`: Cấu hình cho Paranoia Level 3
- `crs-setup-pl4.conf`: Cấu hình cho Paranoia Level 4
- `unicode.mapping`: Bảng ánh xạ Unicode

---

## 5. Chuẩn Bị Dữ Liệu Gốc

### Bước 5.1: Kiểm Tra Thư Mục Dữ Liệu

Dữ liệu gốc nằm trong thư mục `modsec-learn-dataset/` với cấu trúc:

```
modsec-learn-dataset/
├── legitimate/          # Dữ liệu hợp lệ (legitimate)
│   ├── merge.py        # Script ghép file
│   ├── openappsec/     # Các file JSON nhỏ
│   └── legitimate_dataset.json  # File đã ghép (nếu có)
└── malicious/          # Dữ liệu độc hại (SQL injection)
    ├── merge.py        # Script ghép file
    ├── httpparams/     # Dữ liệu từ httpparams
    ├── sqli_kaggle/    # Dữ liệu từ Kaggle
    ├── sqlmap/         # Dữ liệu từ SQLMap
    └── sqli_dataset.json  # File đã ghép (nếu có)
```

### Bước 5.2: Kiểm Tra Dữ Liệu Có Sẵn

Kiểm tra xem các file đã được ghép chưa:

```bash
# Kiểm tra file legitimate
ls modsec-learn-dataset/legitimate/legitimate_dataset.json

# Kiểm tra file malicious
ls modsec-learn-dataset/malicious/sqli_dataset.json
```

Nếu các file này chưa tồn tại, bạn cần thực hiện bước ghép dữ liệu (xem mục 7).

---

## 6. Cấu Hình Đường Dẫn

### Bước 6.1: Mở File Cấu Hình

Mở file `config.toml` trong thư mục gốc dự án bằng trình soạn thảo văn bản.

### Bước 6.2: Điều Chỉnh Các Đường Dẫn

Kiểm tra và điều chỉnh các đường dẫn sau cho phù hợp với hệ thống của bạn:

```toml
# Đường dẫn tới thư mục chứa các file luật CRS
crs_dir = "./coreruleset/rules/"

# Đường dẫn file chứa danh sách mã luật CRS (sẽ được tạo tự động)
crs_ids_path = "./data/crs_sqli_ids_4.0.0.json"

# Đường dẫn file chứa trọng số luật (sẽ được tạo tự động)
crs_weights_path = "./data/crs_sqli_weights_4.0.0.json"

# Thư mục lưu các mô hình đã huấn luyện
models_path = "./data/models/"

# Thư mục lưu các biểu đồ
figures_path = './data/figures/'

# Thư mục chứa dữ liệu train/test sau khi build
dataset_path = './data/dataset/'

# Đường dẫn tới file dữ liệu độc hại đã ghép
malicious_path = '../modsec-learn-dataset/malicious/sqli_dataset.json'

# Đường dẫn tới file dữ liệu hợp lệ đã ghép
legitimate_path = '../modsec-learn-dataset/legitimate/legitimate_dataset.json'
```

### Bước 6.3: Tạo Các Thư Mục Cần Thiết

Tạo các thư mục nếu chưa tồn tại:

```bash
mkdir -p data/dataset
mkdir -p data/models
mkdir -p data/figures
```

**Trên Windows (PowerShell):**
```powershell
New-Item -ItemType Directory -Force -Path data\dataset
New-Item -ItemType Directory -Force -Path data\models
New-Item -ItemType Directory -Force -Path data\figures
```

---

## 7. Ghép Dữ Liệu Từ Các File Nhỏ

Dữ liệu gốc được chia thành nhiều file JSON nhỏ. Chúng ta cần ghép chúng lại thành file lớn.

### Bước 7.1: Ghép Dữ Liệu Hợp Lệ (Legitimate)

```bash
cd modsec-learn-dataset/legitimate
python merge.py
```

**Lưu ý:**
- Trên Linux/macOS, có thể cần dùng `python3 merge.py`
- Script sẽ quét tất cả file JSON trong thư mục `openappsec/` và ghép lại
- Kết quả sẽ được lưu vào `legitimate_dataset.json`

**Kiểm tra kết quả:**
```bash
# Đếm số dòng trong file JSON (mỗi dòng là một payload)
python -c "import json; data = json.load(open('legitimate_dataset.json')); print(f'Số lượng payload: {len(data)}')"
```

### Bước 7.2: Ghép Dữ Liệu Độc Hại (Malicious)

```bash
cd ../malicious
python merge.py
```

**Lưu ý:**
- Script sẽ quét các thư mục: `httpparams/`, `sqli_kaggle/`, `sqlmap/`, `openappsec/`
- Kết quả sẽ được lưu vào `sqli_dataset.json`

**Kiểm tra kết quả:**
```bash
python -c "import json; data = json.load(open('sqli_dataset.json')); print(f'Số lượng payload: {len(data)}')"
```

### Bước 7.3: Quay Lại Thư Mục Gốc

```bash
cd ../..
```

Bây giờ bạn đã có 2 file dữ liệu lớn:
- `modsec-learn-dataset/legitimate/legitimate_dataset.json`
- `modsec-learn-dataset/malicious/sqli_dataset.json`

---

## 8. Xây Dựng Bộ Dữ Liệu Train/Test

### Bước 8.1: Hiểu Về Script build_dataset.py

Script `scripts/build_dataset.py` sẽ:
1. Đọc dữ liệu từ 2 file đã ghép
2. Xáo trộn dữ liệu
3. Lấy 25.000 mẫu cho mỗi lớp (legitimate và malicious)
4. Chia thành train (80%) và test (20%)
5. Lưu thành 4 file JSON riêng biệt

### Bước 8.2: Chạy Script Build Dataset

Đảm bảo bạn đang ở thư mục gốc dự án và môi trường ảo đã được kích hoạt:

```bash
python scripts/build_dataset.py
```

**Trên Linux/macOS:**
```bash
python3 scripts/build_dataset.py
```

### Bước 8.3: Kiểm Tra Kết Quả

Sau khi chạy xong, kiểm tra các file đã được tạo:

```bash
# Kiểm tra các file train/test
ls data/dataset/

# Kết quả mong đợi:
# - legitimate_train.json
# - legitimate_test.json
# - malicious_train.json
# - malicious_test.json
```

**Kiểm tra số lượng mẫu:**
```bash
python -c "
import json
leg_train = json.load(open('data/dataset/legitimate_train.json'))
leg_test = json.load(open('data/dataset/legitimate_test.json'))
mal_train = json.load(open('data/dataset/malicious_train.json'))
mal_test = json.load(open('data/dataset/malicious_test.json'))
print(f'Legitimate train: {len(leg_train)}')
print(f'Legitimate test: {len(leg_test)}')
print(f'Malicious train: {len(mal_train)}')
print(f'Malicious test: {len(mal_test)}')
"
```

**Kết quả mong đợi:**
- Legitimate train: 20,000 mẫu
- Legitimate test: 5,000 mẫu
- Malicious train: 20,000 mẫu
- Malicious test: 5,000 mẫu

---

## 9. Trích Xuất Mã Luật CRS

### Bước 9.1: Hiểu Về Quá Trình Trích Xuất

ModSecurity CRS có hàng nghìn luật, mỗi luật có một mã ID duy nhất. Script `extract_modsec_crs_ids.py` sẽ:
1. Đọc toàn bộ dữ liệu (legitimate + malicious)
2. Cho từng payload đi qua ModSecurity
3. Ghi nhận các luật bị kích hoạt
4. Lưu danh sách tất cả mã luật vào file JSON

### Bước 9.2: Kiểm Tra Trước Khi Chạy

Đảm bảo:
- ModSecurity đã được cài đặt và hoạt động
- `pymodsecurity` đã được cài đặt
- File cấu hình trong `modsec_config/` hợp lệ
- Đường dẫn `crs_dir` trong `config.toml` đúng

### Bước 9.3: Chạy Script Trích Xuất

```bash
python scripts/extract_modsec_crs_ids.py
```

**Lưu ý:**
- Quá trình này có thể mất nhiều thời gian (tùy thuộc vào số lượng payload)
- Script sẽ in ra tiến trình: `[INFO] Đang nạp bộ dữ liệu...`, `[INFO] Đang trích xuất mã luật CRS...`

### Bước 9.4: Kiểm Tra Kết Quả

```bash
# Kiểm tra file đã được tạo
ls data/crs_sqli_ids_4.0.0.json

# Xem một phần nội dung
python -c "
import json
with open('data/crs_sqli_ids_4.0.0.json', 'r') as f:
    data = json.load(f)
    print(f'Số lượng mã luật: {len(data[\"rules_ids\"])}')
    print(f'10 mã luật đầu tiên: {data[\"rules_ids\"][:10]}')
"
```

**Kết quả mong đợi:**
- File `data/crs_sqli_ids_4.0.0.json` đã được tạo
- Chứa danh sách các mã luật CRS (ví dụ: `["942100", "942110", ...]`)

---

## 10. Kiểm Tra Kết Quả

### Bước 10.1: Kiểm Tra Cấu Trúc Thư Mục

Sau khi hoàn tất, cấu trúc thư mục `data/` sẽ như sau:

```
data/
├── crs_sqli_ids_4.0.0.json      # Danh sách mã luật CRS
├── dataset/
│   ├── legitimate_train.json    # 20,000 mẫu train hợp lệ
│   ├── legitimate_test.json     # 5,000 mẫu test hợp lệ
│   ├── malicious_train.json     # 20,000 mẫu train độc hại
│   └── malicious_test.json      # 5,000 mẫu test độc hại
├── figures/                      # (Sẽ có sau khi chạy experiments)
└── models/                       # (Sẽ có sau khi train)
```

### Bước 10.2: Kiểm Tra Dữ Liệu

Chạy script kiểm tra nhanh:

```bash
python -c "
import json
import os

# Kiểm tra file CRS IDs
if os.path.exists('data/crs_sqli_ids_4.0.0.json'):
    with open('data/crs_sqli_ids_4.0.0.json', 'r') as f:
        crs_data = json.load(f)
        print(f'✓ CRS IDs: {len(crs_data[\"rules_ids\"])} luật')
else:
    print('✗ Thiếu file CRS IDs')

# Kiểm tra dataset
files = [
    'data/dataset/legitimate_train.json',
    'data/dataset/legitimate_test.json',
    'data/dataset/malicious_train.json',
    'data/dataset/malicious_test.json'
]

for file in files:
    if os.path.exists(file):
        with open(file, 'r') as f:
            data = json.load(f)
            print(f'✓ {os.path.basename(file)}: {len(data)} mẫu')
    else:
        print(f'✗ Thiếu file: {file}')
"
```

### Bước 10.3: Xem Mẫu Dữ Liệu

```bash
python -c "
import json

# Xem mẫu payload hợp lệ
with open('data/dataset/legitimate_train.json', 'r') as f:
    data = json.load(f)
    print('Mẫu payload hợp lệ:')
    print(data[0][:100] + '...' if len(data[0]) > 100 else data[0])
    print()

# Xem mẫu payload độc hại
with open('data/dataset/malicious_train.json', 'r') as f:
    data = json.load(f)
    print('Mẫu payload độc hại:')
    print(data[0][:100] + '...' if len(data[0]) > 100 else data[0])
"
```

---

## 11. Xử Lý Sự Cố

### Lỗi 1: Không Tìm Thấy Module

**Triệu chứng:**
```
ModuleNotFoundError: No module named 'pymodsecurity'
```

**Giải pháp:**
1. Đảm bảo môi trường ảo đã được kích hoạt
2. Kiểm tra ModSecurity đã được cài đặt
3. Cài lại pymodsecurity:
```bash
cd pymodsecurity
python setup.py build
python setup.py install
```

### Lỗi 2: ModSecurity Không Tìm Thấy File Cấu Hình

**Triệu chứng:**
```
Error: Cannot find configuration file
```

**Giải pháp:**
1. Kiểm tra đường dẫn trong `modsec_config/`
2. Đảm bảo chạy script từ thư mục gốc dự án
3. Kiểm tra file `modsec_config/modsecurity.conf` tồn tại

### Lỗi 3: File Dữ Liệu Không Tồn Tại

**Triệu chứng:**
```
FileNotFoundError: [Errno 2] No such file or directory: '../modsec-learn-dataset/...'
```

**Giải pháp:**
1. Kiểm tra đường dẫn trong `config.toml`
2. Đảm bảo đã chạy script `merge.py` để ghép dữ liệu
3. Kiểm tra file có tồn tại bằng lệnh `ls` hoặc `dir`

### Lỗi 4: Thiếu Thư Viện Hệ Thống

**Triệu chứng:**
```
error: libxml2 not found
```

**Giải pháp:**
- **Linux:** `sudo apt-get install libxml2-dev`
- **macOS:** `brew install libxml2`
- **Windows (WSL):** Làm tương tự Linux

### Lỗi 5: Lỗi Khi Ghép Dữ Liệu

**Triệu chứng:**
```
JSONDecodeError hoặc lỗi khi đọc file
```

**Giải pháp:**
1. Kiểm tra các file JSON trong thư mục con có hợp lệ không
2. Thử chạy lại script `merge.py`
3. Kiểm tra quyền truy cập file

### Lỗi 6: Hết Bộ Nhớ Khi Trích Xuất CRS IDs

**Triệu chứng:**
```
MemoryError hoặc hệ thống chậm
```

**Giải pháp:**
1. Giảm số lượng payload trong dataset
2. Chạy script trên máy có RAM lớn hơn
3. Xử lý dữ liệu theo batch nhỏ hơn

---

## Kết Luận

Sau khi hoàn tất tất cả các bước trên, bạn đã có:
- ✅ Môi trường Python đã được cài đặt và cấu hình
- ✅ ModSecurity và pymodsecurity đã được cài đặt
- ✅ OWASP CRS đã được tải và cấu hình
- ✅ Dữ liệu đã được ghép và chia thành train/test
- ✅ Danh sách mã luật CRS đã được trích xuất

Bạn đã sẵn sàng để bước sang giai đoạn **huấn luyện mô hình**. Hãy tham khảo file `TRAINING_GUIDE.md` để tiếp tục.

---

## Tài Liệu Tham Khảo

- [ModSecurity Documentation](https://github.com/SpiderLabs/ModSecurity/wiki)
- [OWASP CRS Documentation](https://coreruleset.org/)
- [pymodsecurity GitHub](https://github.com/AvalZ/pymodsecurity)
- [scikit-learn Documentation](https://scikit-learn.org/stable/)

