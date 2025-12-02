# Hướng Dẫn Setup và Xử Lý Dữ Liệu (WSL)

## 0. Cài Đặt WSL2

**Nếu chưa có WSL2:**
```powershell
# Mở PowerShell (Admin) và chạy:
wsl --install
# Hoặc cài Ubuntu cụ thể:
wsl --install -d Ubuntu-22.04
```

Sau khi cài xong, khởi động lại máy và mở Ubuntu terminal.

## 1. Cài Đặt Công Cụ Build

```bash
sudo apt-get update
sudo apt-get install -y build-essential libtool automake autoconf pkg-config
sudo apt-get install -y libxml2-dev libyajl-dev libpcre2-dev libcurl4-openssl-dev
sudo apt-get install -y git python3 python3-pip python3-venv
```

## 2. Cài Đặt Môi Trường Python

```bash
# Di chuyển đến thư mục dự án (trong WSL)
cd /mnt/d/2.Learn/1.HUIT/1.Master/3.ModernIssues/1.Project/modsec-learn

# Tạo môi trường ảo
python3 -m venv .venv

# Kích hoạt
source .venv/bin/activate

# Nâng cấp pip và cài đặt thư viện
pip install --upgrade pip
pip install -r requirements.txt
```

## 3. Cài Đặt ModSecurity và pymodsecurity

```bash
# Tải và biên dịch ModSecurity 3.0.10
cd ~
git clone https://github.com/SpiderLabs/ModSecurity.git
cd ModSecurity
git checkout v3.0.10
./build.sh
./configure --with-libxml2 --with-libmagic --with-pcre2
make -j$(nproc)
sudo make install

# Cập nhật thư viện hệ thống
sudo ldconfig

# Cài đặt pymodsecurity
cd ~
git clone https://github.com/AvalZ/pymodsecurity.git
cd pymodsecurity
python3 setup.py build
python3 setup.py install
```

## 4. Cài Đặt OWASP CRS 4.0.0

```bash
cd /mnt/d/2.Learn/1.HUIT/1.Master/3.ModernIssues/1.Project/modsec-learn
git clone --branch v4.0.0 https://github.com/coreruleset/coreruleset.git
```

## 5. Cấu Hình Đường Dẫn

Mở `config.toml` và kiểm tra các đường dẫn:
- `crs_dir = "./coreruleset/rules/"`
- `malicious_path = '../modsec-learn-dataset/malicious/sqli_dataset.json'`
- `legitimate_path = '../modsec-learn-dataset/legitimate/legitimate_dataset.json'`

Tạo thư mục:
```bash
mkdir -p data/dataset data/models data/figures
```

## 6. Ghép Dữ Liệu

```bash
# Ghép dữ liệu hợp lệ
cd modsec-learn-dataset/legitimate
python3 merge.py

# Ghép dữ liệu độc hại
cd ../malicious
python3 merge.py

cd ../..
```

## 7. Xây Dựng Dataset Train/Test

```bash
python3 scripts/build_dataset.py
```

Kết quả: 4 file trong `data/dataset/`
- `legitimate_train.json` (20,000 mẫu)
- `legitimate_test.json` (5,000 mẫu)
- `malicious_train.json` (20,000 mẫu)
- `malicious_test.json` (5,000 mẫu)

## 8. Trích Xuất Mã Luật CRS

```bash
python3 scripts/extract_modsec_crs_ids.py
```

Kết quả: `data/crs_sqli_ids_4.0.0.json`

## 9. Kiểm Tra

```bash
python3 -c "
import os, json
files = ['data/dataset/legitimate_train.json', 'data/dataset/malicious_train.json', 
         'data/crs_sqli_ids_4.0.0.json']
for f in files:
    if os.path.exists(f):
        data = json.load(open(f))
        print(f'✓ {f}: {len(data) if isinstance(data, list) else \"OK\"}')
    else:
        print(f'✗ {f}: THIẾU')
"
```

## Xử Lý Sự Cố

- **command not found**: Chạy lại bước 1 để cài đầy đủ công cụ build
- **ModuleNotFoundError: pymodsecurity**: 
  - Kiểm tra ModSecurity đã cài: `modsec --version`
  - Cài lại: `cd ~/pymodsecurity && python3 setup.py install`
- **FileNotFoundError**: Kiểm tra đường dẫn trong `config.toml`, đảm bảo đã chạy `merge.py`
- **ModSecurity error**: Kiểm tra file cấu hình trong `modsec_config/`
- **MemoryError**: Giảm số lượng mẫu hoặc tăng swap: `sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`
