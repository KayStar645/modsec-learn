# Hướng Dẫn Huấn Luyện Mô Hình (WSL)

## 1. Yêu Cầu

Đảm bảo đã hoàn tất `DATA_SETUP_GUIDE.md`:
- ✅ File train/test trong `data/dataset/`
- ✅ File `data/crs_sqli_ids_4.0.0.json`
- ✅ Môi trường ảo đã kích hoạt

**Kích hoạt môi trường ảo:**
```bash
cd /mnt/d/2.Learn/1.HUIT/1.Master/3.ModernIssues/1.Project/modsec-learn
source .venv/bin/activate
```

Kiểm tra nhanh:
```bash
python3 -c "
import os
files = ['data/dataset/legitimate_train.json', 'data/dataset/malicious_train.json', 
         'data/crs_sqli_ids_4.0.0.json']
for f in files:
    print('✓' if os.path.exists(f) else '✗', f)
"
```

## 2. Cấu Hình

Mở `config.toml`, kiểm tra:
```toml
paranoia_levels = [1, 2, 3, 4]  # Có thể giảm để train nhanh hơn
models = ['svc', 'log_reg']
other_models = ['rf']
penalties = ['l1', 'l2']
```

## 3. Huấn Luyện

```bash
python3 scripts/run_training.py
```

**Lưu ý:**
- Quá trình trích xuất đặc trưng mất 30-60 phút/PL
- Sẽ train 20 mô hình (4 PL × 5 mô hình)
- Tổng thời gian: ~3-5 giờ
- Có thể chạy background: `nohup python3 scripts/run_training.py > training.log 2>&1 &`

## 4. Kiểm Tra Kết Quả

```bash
# Đếm số mô hình
ls data/models/*.joblib | wc -l  # Kỳ vọng: 20

# Kiểm tra load được
python3 -c "
import joblib, os
for f in sorted(os.listdir('data/models'))[:3]:
    try:
        joblib.load(f'data/models/{f}')
        print(f'✓ {f}')
    except: print(f'✗ {f}')
"
```

## 5. Đánh Giá Mô Hình

```bash
python3 scripts/run_experiments.py
```

Kết quả: `data/figures/roc_curves.pdf` - biểu đồ ROC so sánh các mô hình

**Xem file PDF trong WSL:**
```bash
# Cài xdg-utils để mở file
sudo apt-get install -y xdg-utils
# Hoặc copy sang Windows để xem
cp data/figures/roc_curves.pdf /mnt/d/
```

## 6. Phân Tích Trọng Số (Tùy chọn)

```bash
python3 scripts/analyze_rules.py
```

Kết quả: Biểu đồ so sánh trọng số luật trong `data/figures/`

## Xử Lý Sự Cố

- **FileNotFoundError**: Chạy lại `build_dataset.py` và `extract_modsec_crs_ids.py`
- **ModSecurity error**: 
  - Kiểm tra: `python3 -c "import pymodsecurity; print('OK')"`
  - Nếu lỗi: `sudo ldconfig` và cài lại pymodsecurity
- **MemoryError**: 
  - Giảm `paranoia_levels` hoặc số mẫu train
  - Tăng swap: `sudo swapon --show`
- **Lỗi vẽ biểu đồ**: Thêm `matplotlib.use('Agg')` vào đầu script hoặc cài: `sudo apt-get install -y python3-tk`

## Tối Ưu

- Train từng PL một: `paranoia_levels = [1]`
- Giảm số mẫu trong `build_dataset.py` (sửa `n_samples = 25_000` thành số nhỏ hơn)
- Điều chỉnh tham số mô hình trong `run_training.py` (C, n_estimators, max_iter)
- Sử dụng `nohup` để chạy background và xem log sau
