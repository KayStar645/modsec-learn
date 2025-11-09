# Báo cáo chi tiết dự án `modsec-learn`

## 1. Bài toán và mục tiêu
- **Vấn đề**: Xây dựng hệ thống phát hiện tấn công SQL Injection (SQLi) hiệu quả, có khả năng tận dụng tri thức từ bộ luật OWASP Core Rule Set (CRS) của ModSecurity và đồng thời khai thác sức mạnh của các mô hình học máy.
- **Mục tiêu chính**:
  - Chuẩn hoá pipeline xử lý dữ liệu SQLi hợp lệ/độc hại.
  - Trích xuất đặc trưng dựa trên các luật ModSecurity ở nhiều mức Paranoia Level (PL).
  - Huấn luyện và so sánh các mô hình học máy (Linear SVC, Random Forest, Logistic Regression) với chính ModSecurity.
  - Trực quan hoá kết quả (đường cong ROC, phân tích trọng số luật) để đưa ra đánh giá định tính lẫn định lượng.

## 2. Tập dữ liệu
- **Nguồn hợp lệ**: tổng hợp từ các log hợp lệ (thư mục `modsec-learn-dataset/legitimate/`).
- **Nguồn độc hại**: lấy từ nhiều dataset công khai (`openappsec`, `httpparams`, `sqli_kaggle`, `sqlmap`, …) trong `modsec-learn-dataset/malicious/`.
- **Tiền xử lý dữ liệu gốc**:
  - Mỗi nguồn chứa các tệp JSON nhỏ. Script `merge.py` (đã chỉnh sửa để xử lý trường hợp thiếu file) ghép thành:
    - `legitimate_dataset.json`
    - `sqli_dataset.json`
  - Các script chạy độc lập cho từng nhánh `legitimate/` và `malicious/`.
- **Xây dựng tập train/test**:
  - Script `scripts/build_dataset.py`:
    - Xáo trộn từng lớp dữ liệu.
    - Lấy 25.000 mẫu đại diện cho mỗi lớp (tương ứng 50.000 bản ghi tổng cộng).
    - Chia 80% train – 20% test và lưu thành 4 tệp JSON trong `data/dataset/`.
- **Định dạng dữ liệu**:
  - Mỗi record: `{ "payload": "<chuỗi request>", "label": 0|1 }`.
  - `label = 1`: payload độc hại; `label = 0`: payload hợp lệ.

## 3. Hạ tầng ModSecurity & CRS
- **Phiên bản**: ModSecurity 3.0.10 + CRS 4.0.0.
- **Môi trường**: khuyến nghị Ubuntu/WSL (hướng dẫn chi tiết trong `docs/modsecurity_setup.md`).
- **Các bước chính**:
  1. Biên dịch ModSecurity với các tuỳ chọn `--with-lua`, `--with-pcre2`, `--with-libxml`, `--with-libbrotli`.
  2. Cài `pymodsecurity` từ dự án `AvalZ/pymodsecurity`.
  3. Đảm bảo `libmodsecurity.so` nằm trong `/usr/local/lib` và đã chạy `ldconfig`.
  4. Sao chép thư mục `coreruleset/` (PL 1–4) vào gốc dự án và cấu hình lại `modsec_config/`.
- **Kiểm thử**: dùng `/usr/local/modsecurity/bin/modsec-rules-check modsec_config/modsecurity.conf modsec_config/include-crs.conf` để chắc chắn cấu hình hợp lệ (trả về `Syntax OK`).

## 4. Trích xuất đặc trưng bằng ModSecurity
- **Lớp chính**: `src/models/modsec.py` (`PyModSecurity`) – bao bọc thư viện `pymodsecurity` để:
  - Nạp cấu hình nền (`modsecurity.conf`, `crs-setup-pl{pl}.conf`).
  - Nạp các file luật trọng tâm (`REQUEST-901-INITIALIZATION.conf`, `REQUEST-942-APPLICATION-ATTACK-SQLI.conf`).
  - Xử lý từng payload, ghi nhận luật bị kích hoạt và tính điểm (`score` hoặc nhị phân).
- **Extractor**: `ModSecurityFeaturesExtractor` trong `src/extractor.py`:
  - Gửi payload qua `PyModSecurity`.
  - Biểu diễn mỗi mẫu bằng vector bit (kích thước = số luật) – 1 nếu luật kích hoạt.
  - Hỗ trợ trích xuất danh sách luật (`extract_crs_ids`) và lưu ma trận đặc trưng (`.npy`).
- **Danh sách luật**: lưu trong `data/crs_sqli_ids_4.0.0.json`; có thể tái tạo bằng `scripts/extract_modsec_crs_ids.py`.

## 5. Pipeline huấn luyện
- **Cấu hình**: file `config.toml` chỉ định đường dẫn dataset, thư mục CRS, nơi lưu mô hình/biểu đồ, danh sách mô hình và mức PL cần xét.
- **Quy trình `scripts/run_training.py`**:
  1. Nạp dữ liệu train (`DataLoader`).
  2. Lặp qua từng PL (1 → 4), trích xuất đặc trưng.
  3. Huấn luyện lần lượt:
     - `RandomForestClassifier` (`class_weight='balanced'`, `n_jobs=-1`).
     - `LinearSVC` (tuỳ chỉnh `dual=False` khi dùng chuẩn phạt L1 để tránh lỗi sklearn).
     - `LogisticRegression` (`solver='saga'`, `class_weight='balanced'`, `max_iter=1000`).
  4. Lưu mô hình dưới dạng `joblib` trong `data/models/`.
- **Tự động hoá**: các print `[INFO] ...` giúp theo dõi tiến trình theo từng PL và từng mô hình.

## 6. Đánh giá & trực quan hoá
- **Script `scripts/run_experiments.py`**:
  - Nạp dữ liệu train/test.
  - Duyệt từng PL để:
    - Lấy điểm dự đoán của ModSecurity (`waf.predict`) và các mô hình ML.
    - Vẽ đường cong ROC với thang log cho FPR, thêm vùng zoom (giảm tiếng ồn khi FPR nhỏ).
  - Kết quả lưu tại `data/figures/roc_curves.pdf`.
- **Script `scripts/analyze_rules.py`**:
  - So sánh trọng số luật giữa ModSecurity và các mô hình tuyến tính (SVM/Logistic).
  - Xuất các biểu đồ như `data/figures/lr_weights_comp.pdf`.

## 7. Kết quả tiêu biểu
- **Đường cong ROC**:
  - Các mô hình ML (đặc biệt Logistic Regression và Linear SVC với chuẩn phạt L1) đạt ROC-AUC cao, đường cong nằm trên ModSecurity ở hầu hết PL.
  - ModSecurity vẫn giữ vai trò baseline tốt, đặc biệt khi kết hợp với tính điểm (`score`) làm đặc trưng bổ sung.
- **Trọng số luật**:
  - Biểu đồ so sánh chỉ ra nhóm luật SQLi quan trọng nhất (ví dụ các luật thuộc REQUEST-942).
  - Chuẩn phạt L1 tạo ra mô hình thưa, dễ diễn giải; chuẩn phạt L2 trải đều hơn nhưng có xu hướng giữ lại nhiều luật với trọng số nhỏ.
- **Tốc độ xử lý**:
  - Trích xuất đặc trưng phụ thuộc vào việc ModSecurity đánh giá từng payload; với 50.000 mẫu, cần tối ưu (chạy parallel/tối ưu cấu hình) nếu muốn rút ngắn thời gian.

## 8. Khó khăn và cách xử lý
- **Thiếu dữ liệu JSON khi merge**: bổ sung kiểm tra trong `merge.py` để bỏ qua nguồn thiếu/tệp rỗng, tránh crash.
- **Import `ModSecurity` thất bại trên Windows**: chuyển sang WSL, biên dịch ModSecurity và cài `pymodsecurity` trong môi trường Linux.
- **Lỗi sklearn với LinearSVC (penalty=L1)**: thiết lập lại tham số `dual=False` nhằm tương thích với solver liblinear.
- **ROC bị nhiễu ở vùng FPR nhỏ**: viết hàm `update_roc` để nội suy và thêm vùng zoom.

## 9. Kết luận
- Việc kết hợp ModSecurity CRS với học máy mang lại hiệu quả cao trong phát hiện SQLi, vừa tận dụng tri thức chuyên gia (luật) vừa khai thác khả năng tổng quát của mô hình.
- Mô hình tuyến tính với chuẩn phạt L1 cung cấp khả năng lý giải tốt, trong khi Random Forest cho hiệu năng ổn định nhưng khó giải thích hơn.
- ModSecurity đóng vai trò nền tảng: danh sách luật kích hoạt là đặc trưng quan trọng giúp mô hình ML vượt qua đường chuẩn.
- Bộ pipeline hiện tại có thể mở rộng sang:
  - Bổ sung các kiểu tấn công khác (XSS, RCE…).
  - Thử nghiệm mô hình khác (Gradient Boosting, Neural Networks).
  - Ứng dụng học chuyển tiếp: huấn luyện trên một bộ dữ liệu, kiểm thử trên bộ khác để đánh giá khả năng tổng quát hoá.

## 10. Hướng phát triển tiếp theo
- **Tự động hoá CI/CD**: tích hợp script vào workflow để mỗi lần cập nhật luật hoặc dữ liệu sẽ huấn luyện lại và xuất báo cáo mới.
- **Thu thập thêm nhãn từ môi trường thực**: nâng cao đa dạng mẫu, bổ sung các payload evasive.
- **Triển khai realtime**: nghiên cứu cách chuyển mô hình ML đã huấn luyện vào pipeline ModSecurity (ví dụ convert sang rules hoặc triển khai song song).
- **Báo cáo định kỳ**: sinh thêm thống kê (Precision/Recall, confusion matrix) và log quá trình để dễ dàng so sánh giữa các lần huấn luyện.

---

**Tài liệu tham chiếu chính**:
- `README.md` – hướng dẫn tổng quan và sử dụng.
- `docs/modsecurity_setup.md` – hướng dẫn cài đặt ModSecurity & CRS.
- `scripts/*.py` – các script tự động hoá thu thập dữ liệu, huấn luyện, đánh giá.
- `data/figures/*.pdf` – kết quả trực quan hoá.
- `data/models/*.joblib` – mô hình đã huấn luyện.

