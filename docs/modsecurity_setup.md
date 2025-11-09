# Hướng dẫn cài đặt ModSecurity, pymodsecurity và CRS

Tài liệu này mở rộng mục 3 trong `README.md`, cung cấp chi tiết từng bước để
cài đặt ModSecurity 3.0.10, binding Python `pymodsecurity` và bộ luật OWASP
Core Rule Set (CRS) v4.0.0.

> **Khuyến nghị:** Thực hiện các bước dưới đây trong môi trường Linux (Ubuntu
> 22.04 hoặc tương đương) hoặc WSL nếu đang dùng Windows. Bạn cần quyền `sudo`
> để cài gói hệ thống.

## 1. Chuẩn bị hệ thống

```bash
sudo apt update
sudo apt install -y \
    build-essential autoconf automake libtool \
    pkg-config git libxml2 libxml2-dev libyajl-dev \
    libpcre2-dev libgeoip-dev libmaxminddb-dev \
    libcurl4-openssl-dev liblua5.4-dev libssl-dev \
    zlib1g zlib1g-dev
```

Các gói chính:

- `libxml2`, `libpcre2`: đáp ứng yêu cầu `WITH-LIBXML2`, `WITH-PCRE2`.
- `libmagic-dev`: cung cấp `file` magic (được cài kèm `libmagic1`).
- `libyajl-dev`, `libcurl4-openssl-dev`: cần cho JSON logging và HTTP client.

## 2. Biên dịch ModSecurity 3.0.10

1. Lấy mã nguồn và submodule:
   ```bash
   git clone --branch v3.0.10 --depth 1 https://github.com/SpiderLabs/ModSecurity
   cd ModSecurity
   git submodule init
   git submodule update
   ```

2. Cấu hình và biên dịch:
   ```bash
   ./build.sh
   ./configure \
       --with-lua \
       --with-pcre2 \
       --with-libxml \
       --with-libbrotli
   make -j"$(nproc)"
   sudo make install
   ```

3. Xác minh cài đặt:
   ```bash
   sudo /usr/local/modsecurity/bin/modsec-rules-check /mnt/d/2.Learn/1.HUIT/1.Master/3.ModernIssues/1.Project/modsec-learn/modsec_config/modsecurity.conf
   ```

   Nếu lệnh trả về `Test ok.`, ModSecurity đã được cài thành công.

## 3. Thiết lập thư viện dùng chung

`ModSecurity` cài vào `/usr/local/modsecurity`. Tạo liên kết thư viện để các
ứng dụng khác tìm thấy:

```bash
sudo cp /usr/local/modsecurity/lib/libmodsecurity.so /usr/local/lib/
sudo ldconfig
```

Trên WSL, `ldconfig` đã cập nhật cache nên không cần chỉnh thêm `LD_LIBRARY_PATH`
trừ khi bạn dùng user không có quyền đọc `/etc/ld.so.cache`.

## 4. Cài đặt `pymodsecurity`

1. Tạo (hoặc kích hoạt) môi trường Python trên **Linux/WSL**:
   ```bash
   cd /path/to/modsec-learn
   sudo apt install -y python3-pip python3-venv
   python3 -m venv .venv_wsl
   source .venv_wsl/bin/activate
   python -m pip install --upgrade pip setuptools wheel pybind11
   ```
   > Nếu trước đó bạn đã tạo `.venv` trên Windows, hãy tách biệt môi trường WSL
   > như trên để tránh xung đột kiến trúc.

2. Biên dịch và cài `pymodsecurity`:
   ```bash
   git clone https://github.com/AvalZ/pymodsecurity.git  # hoặc dùng thư mục đã clone
   cd pymodsecurity
   python setup.py build
   python setup.py install
   ```

3. Kiểm tra import:
   ```bash
   python - <<'PY'
    import ModSecurity
    print("ModSecurity bindings OK")
    PY
   ```
   Nếu lệnh báo lỗi tìm thư viện, đảm bảo `libmodsecurity.so` có trong
   `/usr/local/lib` và đã chạy `sudo ldconfig`.

## 5. Sao chép OWASP Core Rule Set (CRS) v4.0.0

```bash
cd /path/to/modsec-learn
git clone --branch v4.0.0 --depth 1 https://github.com/coreruleset/coreruleset.git
```

Đặt cấu trúc:

```
modsec-learn/
├── coreruleset/
├── modsec_config/
└── ...
```

- `modsec_config/` chứa các tệp cấu hình mẫu được dự án cung cấp.
- Bạn có thể tùy chỉnh `crs-setup.conf.example` và `rules/REQUEST-900-EXCLUSION-RULES-BEFORE-CRS.conf.example`
  rồi đổi tên bỏ hậu tố `.example` để kích hoạt.

## 6. Cấu hình ModSecurity cho dự án

1. Sao chép `modsec_config/modsecurity.conf.example` thành `modsecurity.conf`
   và cập nhật đường dẫn tuyệt đối tới `coreruleset/`.

2. Kiểm tra tác vụ phân tích:
   ```bash
   modsecurity.conf  # kiểm tra tham số SecRuleEngine, SecAuditEngine, ...
   ```

3. Với mỗi script trong dự án, đảm bảo biến `crs_dir` trong `config.toml` trỏ
   về đúng thư mục `./coreruleset`.

## 7. Kiểm thử nhanh

Bạn có thể dùng tiện ích `modsec-rules-check` để nạp toàn bộ cấu hình:

```bash
/usr/local/modsecurity/bin/modsec-rules-check \
    modsec_config/modsecurity.conf \
    modsec_config/include-crs.conf
```

Nếu kết quả là `Syntax OK`, bạn đã sẵn sàng chạy các script trong `modsec-learn`.

## 8. Gỡ lỗi thường gặp

- **Không tìm thấy `libmodsecurity.so`**  
  Chạy lại `sudo cp /usr/local/modsecurity/lib/libmodsecurity.so /usr/local/lib/`
  và `sudo ldconfig`.

- **`pymodsecurity` build thất bại**  
  Kiểm tra đã cài `python3-dev` (`sudo apt install python3-dev`) và `pkg-config`.

- **CRS không kích hoạt**  
  Kiểm tra dòng `Include` trong `modsecurity.conf` trỏ tới đúng đường dẫn
  `coreruleset/rules/*.conf`.

Sau khi hoàn tất, quay lại `README.md` và tiếp tục các bước xử lý dữ liệu, huấn
luyện mô hình như hướng dẫn.

