# Kiến Trúc và Cơ Chế Hoạt Động của Demo Web

## Mục lục

1. [Tổng quan kiến trúc](#tổng-quan-kiến-trúc)
2. [Các thành phần chính](#các-thành-phần-chính)
3. [Luồng xử lý payload](#luồng-xử-lý-payload)
4. [Tham số và cấu hình](#tham-số-và-cấu-hình)
5. [Mô hình học máy](#mô-hình-học-máy)
6. [Tích hợp ModSecurity](#tích-hợp-modsecurity)
7. [Hệ thống logging](#hệ-thống-logging)
8. [API và Endpoints](#api-và-endpoints)

---

## Tổng quan kiến trúc

Demo web được xây dựng theo kiến trúc **3 tầng**:

```
┌─────────────────────────────────────────┐
│         Frontend (HTML/JS/Bootstrap)      │
│  - Giao diện người dùng                   │
│  - Tương tác AJAX với API                 │
└─────────────────┬─────────────────────────┘
                  │
┌─────────────────▼─────────────────────────┐
│      Flask Application (routes.py)        │
│  - Xử lý HTTP requests                    │
│  - Định tuyến API endpoints               │
└─────────────────┬─────────────────────────┘
                  │
┌─────────────────▼─────────────────────────┐
│    DetectionEngine (engine.py)            │
│  - Điều phối ModSecurity                  │
│  - Điều phối mô hình ML                   │
│  - Quản lý log                            │
└─────────────────┬─────────────────────────┘
                  │
        ┌─────────┴─────────┐
        │                   │
┌───────▼──────┐    ┌───────▼──────┐
│ ModSecurity │    │ ML Models   │
│  (Native/   │    │  (joblib)    │
│   Stub)     │    │              │
└─────────────┘    └──────────────┘
```

### Các module chính

- **`demo_app/app.py`**: Điểm khởi động ứng dụng Flask
- **`demo_app/__init__.py`**: Factory function tạo Flask app
- **`demo_app/routes.py`**: Định nghĩa các route và API endpoints
- **`demo_app/engine.py`**: Core engine xử lý phát hiện tấn công
- **`demo_app/logger.py`**: Hệ thống logging JSON Lines
- **`demo_app/modsec_stub.py`**: Stub mô phỏng ModSecurity khi chưa cài đặt

---

## Các thành phần chính

### 1. DetectionEngine

**Vị trí**: `demo_app/engine.py`

**Chức năng**: Lớp trung tâm điều phối toàn bộ quá trình phát hiện tấn công.

#### Khởi tạo

```python
engine = DetectionEngine(
    settings_path="config.toml",
    log_path="demo_app/logs/analysis.log",
    dataset_paths=None
)
```

**Quá trình khởi tạo**:

1. **Nạp cấu hình** từ `config.toml`:
   - Đường dẫn CRS rules
   - Đường dẫn file CRS IDs
   - Đường dẫn models
   - Danh sách Paranoia Levels

2. **Nạp CRS IDs**: Đọc danh sách các mã luật ModSecurity từ `data/crs_sqli_ids_4.0.0.json`

3. **Khởi tạo ModSecurity instances**: Tạo một instance cho mỗi Paranoia Level (1-4)

4. **Nạp mô hình ML**: Tự động tìm và nạp các mô hình `.joblib` có sẵn

5. **Chuẩn bị datasets**: Nạp danh sách dataset mẫu (`sample_attacks.json`, `advanced_attacks.json`)

#### Các phương thức chính

- `analyze_payload()`: Phân tích một payload đơn lẻ
- `run_batch()`: Chạy phân tích hàng loạt
- `batch_payloads()`: Đọc payload từ dataset
- `log_entries()`: Đọc log với phân trang
- `model_statistics()`: Tính thống kê hiệu năng mô hình

### 2. ModSecurity Integration

#### Native ModSecurity (`src/models/modsec.py`)

**Lớp `PyModSecurity`**:

- **Wrapper** cho thư viện ModSecurity C++ qua Python bindings
- **Xử lý payload** qua các phase của ModSecurity:
  1. `processURI()`: Phân tích URI
  2. `processRequestHeaders()`: Phân tích headers
  3. `processRequestBody()`: Phân tích body

**Cấu hình**:
- `rules_dir`: Thư mục chứa CRS rules
- `threshold`: Ngưỡng điểm để chặn (mặc định 5.0)
- `pl`: Paranoia Level (1-4)
- `output_type`: `'score'` (điểm số) hoặc `'binary'` (0/1)

**Lớp `RulesLogger`**:

- **Callback** được ModSecurity gọi khi có luật kích hoạt
- **Tính điểm** dựa trên severity:
  - Severity 2 (CRITICAL): +5 điểm
  - Severity 3 (ERROR): +4 điểm
  - Severity 4 (WARNING): +3 điểm
  - Severity 5 (NOTICE): +2 điểm
- **Thu thập** danh sách luật bị kích hoạt và chi tiết

#### Stub ModSecurity (`demo_app/modsec_stub.py`)

**Khi nào sử dụng**: Khi `pymodsecurity` chưa được cài đặt

**Cơ chế**:
- Sử dụng **regex patterns** để mô phỏng các luật CRS phổ biến
- **Tính điểm** đơn giản: mỗi pattern khớp = +2.5 điểm
- **Tăng độ nhạy** theo PL: `score *= 1 + (pl - 1) * 0.25`

**Các luật mô phỏng**:
- `942100`: SQL keywords (SELECT, UNION, INSERT, UPDATE)
- `942110`: Logic bypass (OR 1=1, OR true)
- `942120`: Database schema (information_schema, pg_catalog)
- `942130`: Time-based attacks (benchmark, sleep)
- `942200`: SQL comments (--, #, /*)

### 3. Feature Extraction

**Lớp `ModSecurityFeaturesExtractor`** (`src/extractor.py`):

**Chức năng**: Chuyển đổi payload thành vector đặc trưng nhị phân

**Quy trình**:

1. **Gửi payload qua ModSecurity** để thu thập luật kích hoạt
2. **Tạo vector** có chiều dài = số lượng CRS rules
3. **Đánh dấu** vị trí tương ứng với luật kích hoạt = 1.0, còn lại = 0.0

**Ví dụ**:
```
Payload: "1' OR 1=1--"
Triggered rules: ["942100", "942110", "942200"]
Feature vector: [0, 0, ..., 1, 1, ..., 1, ..., 0]  (chỉ vị trí tương ứng = 1)
```

**Kích thước vector**: Phụ thuộc vào số lượng CRS rules được trích xuất (thường ~100-200 rules)

### 4. Machine Learning Models

#### Các mô hình được hỗ trợ

1. **Logistic Regression (L1/L2)**
2. **Linear SVC (L1/L2)**
3. **Random Forest**

#### Cấu trúc file model

**Quy ước đặt tên**:
- `log_reg_pl{pl}_l1.joblib`
- `log_reg_pl{pl}_l2.joblib`
- `linear_svc_pl{pl}_l1.joblib`
- `linear_svc_pl{pl}_l2.joblib`
- `rf_pl{pl}.joblib`

**Ví dụ**: `log_reg_pl2_l1.joblib` = Logistic Regression, PL=2, penalty L1

#### Tham số huấn luyện

**Logistic Regression**:
```python
LogisticRegression(
    C=0.5,                    # Độ mạnh regularization (nghịch đảo)
    penalty='l1' hoặc 'l2',   # Loại chuẩn phạt
    class_weight='balanced',  # Cân bằng lớp (SQLi thường ít hơn legitimate)
    random_state=77,          # Seed để tái tạo kết quả
    max_iter=1000,            # Số lần lặp tối đa
    solver='saga',            # Thuật toán tối ưu (hỗ trợ L1/L2)
    n_jobs=-1                 # Sử dụng tất cả CPU cores
)
```

**Linear SVC**:
```python
LinearSVC(
    C=0.5,
    penalty='l1' hoặc 'l2',
    dual=False nếu L1, True nếu L2,  # Dual formulation
    class_weight='balanced',
    random_state=77,
    fit_intercept=False       # Không có bias term
)
```

**Random Forest**:
```python
RandomForestClassifier(
    class_weight='balanced',
    random_state=77,
    n_jobs=-1                 # Parallel processing
)
```

#### Dự đoán

**Input**: Feature vector nhị phân (shape: `(1, n_rules)`)
**Output**:
- `prediction`: 0 (legitimate) hoặc 1 (attack)
- `probability_attack`: Xác suất là tấn công (nếu có `predict_proba`)
- `probability_legit`: Xác suất là hợp lệ
- `decision_score`: Điểm quyết định (nếu có `decision_function`)

---

## Luồng xử lý payload

### Luồng phân tích đơn lẻ

```
1. User nhập payload
   ↓
2. Frontend gửi POST /api/analyze
   ↓
3. routes.py: api_analyze() nhận request
   ↓
4. engine.analyze_payload() được gọi
   ↓
5. [ModSecurity Phase]
   ├─ Tạo/Reuse ModSecurity instance cho PL
   ├─ _process_query(payload)
   │  ├─ URL encode payload
   │  ├─ Tạo Transaction
   │  ├─ processURI()
   │  ├─ processRequestHeaders()
   │  └─ processRequestBody()
   ├─ _get_triggered_rules() → danh sách rule IDs
   ├─ _get_triggered_rules_details() → chi tiết rules
   └─ _process_response() → score
   ↓
6. [ML Phase] (nếu có model)
   ├─ _rules_to_vector(triggered_rules)
   │  └─ Tạo vector nhị phân từ rule IDs
   ├─ _prepare_ml_payloads()
   │  ├─ Chọn model(s) theo yêu cầu
   │  ├─ _run_model() cho mỗi model
   │  │  ├─ model.predict() → prediction
   │  │  ├─ model.predict_proba() → probabilities
   │  │  └─ model.decision_function() → score (nếu có)
   │  └─ Tạo dict kết quả cho mỗi model
   └─ Trả về danh sách kết quả ML
   ↓
7. [Build Result]
   ├─ Tạo analysis_id (UUID)
   ├─ Tạo timestamp
   ├─ _build_steps() → timeline xử lý
   └─ Tạo dict kết quả hoàn chỉnh
   ↓
8. [Logging] (nếu record=True)
   └─ logger.append() → ghi vào analysis.log
   ↓
9. Trả về JSON response
   ↓
10. Frontend hiển thị kết quả
```

### Luồng batch processing

```
1. User chọn dataset + số lượng
   ↓
2. Frontend gửi POST /api/run_batch
   ↓
3. engine.run_batch() được gọi
   ↓
4. Đọc payloads từ dataset
   ↓
5. Lặp qua từng payload:
   ├─ analyze_payload() (record=False)
   └─ Thu thập kết quả
   ↓
6. Ghi log hàng loạt: logger.append_many()
   ↓
7. _summarise_batch() → thống kê tổng hợp
   ↓
8. Trả về {summary, results}
```

---

## Tham số và cấu hình

### File `config.toml`

```toml
# Đường dẫn CRS rules
crs_dir = "./coreruleset/rules/"

# File chứa danh sách CRS rule IDs
crs_ids_path = "./data/crs_sqli_ids_4.0.0.json"

# File chứa trọng số CRS rules (dùng cho phân tích)
crs_weights_path = "./data/crs_sqli_weights_4.0.0.json"

# Thư mục chứa models đã huấn luyện
models_path = "./data/models/"

# Thư mục lưu biểu đồ
figures_path = "./data/figures/"

# Thư mục dataset
dataset_path = "./data/dataset/"

# Đường dẫn dataset gốc
malicious_path = "../modsec-test-dataset/malicious/sqli_dataset.json"
legitimate_path = "../modsec-test-dataset/legitimate/legitimate_dataset.json"

[params]
# Các Paranoia Level sẽ sử dụng
paranoia_levels = [1, 2, 3, 4]

# Models hỗ trợ penalty (L1/L2)
models = ['svc', 'log_reg']

# Models không hỗ trợ penalty
other_models = ['rf', 'modsec']

# Các loại penalty
penalties = ['l1', 'l2']
```

### Paranoia Level (PL)

**Định nghĩa**: Mức độ nhạy cảm của ModSecurity CRS

**Các mức**:
- **PL 1**: Mặc định, ít false positive, phù hợp production
- **PL 2**: Tăng độ nhạy, bắt thêm một số tấn công
- **PL 3**: Rất nhạy, có thể có false positive
- **PL 4**: Cực kỳ nhạy, nhiều false positive, chỉ dùng khi cần thiết

**Ảnh hưởng**:
- **Số lượng rules kích hoạt**: PL cao → nhiều rules hơn
- **Feature vector**: PL cao → nhiều features = 1 hơn
- **Mô hình ML**: Mỗi PL có bộ model riêng

### Threshold

**Định nghĩa**: Ngưỡng điểm ModSecurity để quyết định chặn

**Mặc định**: `5.0`

**Cách tính điểm**:
- Mỗi rule kích hoạt cộng điểm theo severity
- Tổng điểm >= threshold → `decision = "block"`
- Tổng điểm < threshold → `decision = "allow"`

**Severity → Score mapping**:
- CRITICAL (2): +5
- ERROR (3): +4
- WARNING (4): +3
- NOTICE (5): +2

### Model Keys

**Định nghĩa**: Mã định danh cho từng loại mô hình

**Mapping**:
```python
{
    "log_reg_l1": "Logistic Regression (L1)",
    "log_reg_l2": "Logistic Regression (L2)",
    "svc_l1": "Linear SVC (L1)",
    "svc_l2": "Linear SVC (L2)",
    "rf": "Random Forest"
}
```

**Priority** (khi không chỉ định):
1. `log_reg_l1`
2. `log_reg_l2`
3. `svc_l1`
4. `svc_l2`
5. `rf`

---

## Mô hình học máy

### Kiến trúc

#### 1. Feature Space

**Kích thước**: `n_rules` (số lượng CRS rules, thường 100-200)

**Loại**: **Binary features** (0 hoặc 1)

**Ý nghĩa**: Mỗi feature đại diện cho một CRS rule có bị kích hoạt hay không

**Ví dụ**:
```
Feature vector: [0, 1, 0, 1, 0, ..., 1, 0]
                 │  │  │  │  │      │  │
                 │  │  │  │  │      │  └─ Rule 942200 (SQL comment)
                 │  │  │  │  │      └─ Rule 942130 (Time-based)
                 │  │  │  └─ Rule 942110 (Logic bypass)
                 │  └─ Rule 942100 (SQL keywords)
                 └─ Rule khác không kích hoạt
```

#### 2. Model Architecture

**Logistic Regression**:
```
Input: x ∈ {0,1}^n
       ↓
Linear transformation: z = w^T · x + b
       ↓
Sigmoid: p = σ(z) = 1/(1 + e^(-z))
       ↓
Output: y = 1 if p > 0.5 else 0
```

**Linear SVC**:
```
Input: x ∈ {0,1}^n
       ↓
Decision function: z = w^T · x + b
       ↓
Output: y = sign(z)
```

**Random Forest**:
```
Input: x ∈ {0,1}^n
       ↓
Multiple Decision Trees (ensemble)
       ↓
Voting: y = majority vote of trees
```

### Regularization

#### L1 Regularization (Lasso)

**Công thức**: `Loss = CrossEntropy + λ · ||w||₁`

**Đặc điểm**:
- **Feature selection**: Đưa một số trọng số về 0
- **Sparse weights**: Chỉ giữ lại các features quan trọng
- **Giải thích được**: Dễ hiểu rule nào quan trọng

**Sử dụng**: Khi muốn biết rule nào quan trọng nhất

#### L2 Regularization (Ridge)

**Công thức**: `Loss = CrossEntropy + λ · ||w||₂²`

**Đặc điểm**:
- **Smooth weights**: Trọng số phân bố đều hơn
- **Không feature selection**: Tất cả features đều có trọng số
- **Ổn định hơn**: Ít nhạy với noise

**Sử dụng**: Khi muốn sử dụng tất cả thông tin từ rules

### Class Weight Balancing

**Vấn đề**: Dataset thường mất cân bằng (legitimate >> malicious)

**Giải pháp**: `class_weight='balanced'`

**Cách hoạt động**:
```python
weight_class_0 = n_samples / (n_classes * count_class_0)
weight_class_1 = n_samples / (n_classes * count_class_1)
```

**Ví dụ**:
- Legitimate: 25,000 mẫu
- Malicious: 25,000 mẫu
- → Cân bằng, weights = [1.0, 1.0]

Nếu:
- Legitimate: 50,000 mẫu
- Malicious: 10,000 mẫu
- → Weight legitimate = 60,000/(2×50,000) = 0.6
- → Weight malicious = 60,000/(2×10,000) = 3.0

### Training Process

**Quy trình** (từ `scripts/run_training.py`):

1. **Nạp dữ liệu train**
2. **Với mỗi Paranoia Level**:
   - Tạo `ModSecurityFeaturesExtractor` với PL tương ứng
   - Trích xuất features: `X_train, y_train`
3. **Với mỗi model type**:
   - Tạo model với hyperparameters
   - `model.fit(X_train, y_train)`
   - Lưu: `joblib.dump(model, path)`

**Lưu ý**: Mỗi PL có bộ model riêng vì feature space khác nhau (số lượng rules kích hoạt khác nhau)

---

## Tích hợp ModSecurity

### Native Integration

**Thư viện**: `pymodsecurity` (Python bindings cho ModSecurity C++)

**Quy trình**:

1. **Khởi tạo**:
   ```python
   modsec = ModSecurity()
   rules = RulesSet()
   rules.loadFromUri("modsecurity.conf")
   rules.loadFromUri("crs-setup-pl{pl}.conf")
   rules.loadFromUri("REQUEST-942-APPLICATION-ATTACK-SQLI.conf")
   ```

2. **Xử lý payload**:
   ```python
   transaction = Transaction(modsec, rules)
   transaction.processURI(url, method, protocol)
   transaction.processRequestHeaders()
   transaction.processRequestBody()
   ```

3. **Thu thập kết quả**:
   - Đăng ký callback: `modsec.setServerLogCb2(callback)`
   - Callback được gọi mỗi khi rule kích hoạt
   - Tổng hợp điểm và danh sách rules

### Stub Mode

**Khi nào**: Khi `pymodsecurity` không có sẵn

**Cơ chế**:
- Import fallback: `from demo_app.modsec_stub import PyModSecurityStub`
- API tương thích với native
- Sử dụng regex patterns thay vì rules thật

**Hạn chế**:
- Chỉ mô phỏng một số rules phổ biến
- Không chính xác như native
- Dùng cho demo/development

### Rule Selection

**Các file rules được nạp**:
- `REQUEST-901-INITIALIZATION.conf`: Khởi tạo CRS
- `REQUEST-942-APPLICATION-ATTACK-SQLI.conf`: SQL Injection rules

**Lý do**: Chỉ nạp SQLi rules để giảm overhead và tập trung vào SQLi detection

---

## Hệ thống logging

### Format: JSON Lines

**Định dạng**: Mỗi dòng là một JSON object độc lập

**Ví dụ**:
```json
{"analysis_id": "abc123", "timestamp": "2024-01-01T00:00:00Z", "payload": "1' OR 1=1", ...}
{"analysis_id": "def456", "timestamp": "2024-01-01T00:01:00Z", "payload": "SELECT * FROM users", ...}
```

**Lợi ích**:
- Dễ đọc từng dòng
- Có thể append mới mà không cần parse toàn bộ
- Hỗ trợ streaming

### Cấu trúc log entry

```json
{
  "analysis_id": "uuid-hex",
  "timestamp": "ISO-8601",
  "payload": "original payload",
  "payload_preview": "first 120 chars",
  "paranoia_level": 2,
  "modsecurity": {
    "backend": "native" | "stub",
    "decision": "block" | "allow",
    "score": 7.5,
    "threshold": 5.0,
    "triggered_rules": ["942100", "942110"],
    "triggered_rules_details": [...]
  },
  "ml": {
    "model_key": "log_reg_l1",
    "model_name": "Logistic Regression (L1)",
    "prediction": 1,
    "probability_attack": 0.95,
    "probability_legit": 0.05
  },
  "ml_results": [...],
  "steps": [...],
  "metadata": {
    "batch_id": "...",
    "batch_index": 0,
    "source": "sample_attacks"
  }
}
```

### Disk Quota Management

**Mặc định**: 20 MB

**Cơ chế**: Khi vượt quota:
1. Đọc 75% dòng cuối cùng
2. Ghi đè file với phần giữ lại
3. Tiếp tục append mới

**Lý do**: Tránh log phát triển vô hạn

### Pagination

**API**: `GET /api/logs?page=1&limit=50`

**Cơ chế**:
- Đọc toàn bộ log
- Đảo ngược (mới nhất trước)
- Cắt theo `(page-1)*page_size` đến `page*page_size`

**Lưu ý**: Với log lớn, có thể chậm. Nên giới hạn `limit` hợp lý.

---

## API và Endpoints

### 1. `GET /`

**Mục đích**: Trang chủ demo

**Response**: HTML template

### 2. `GET /api/config`

**Mục đích**: Lấy thông tin cấu hình

**Response**:
```json
{
  "paranoia_levels": [1, 2, 3, 4],
  "models": {
    "1": [{"key": "log_reg_l1", "label": "..."}, ...],
    "2": [...],
    ...
  },
  "modsecurity_backend": "native" | "stub",
  "log_path": "demo_app/logs/analysis.log",
  "datasets": [
    {"key": "default", "path": "...", "count": 20},
    {"key": "advanced", "path": "...", "count": 100}
  ]
}
```

### 3. `POST /api/analyze`

**Mục đích**: Phân tích một payload

**Request body**:
```json
{
  "payload": "1' OR 1=1--",
  "paranoia_level": 2,
  "model_key": "log_reg_l1",
  "model_keys": ["log_reg_l1", "svc_l2"],  // Tùy chọn: nhiều models
  "record": true  // Có ghi log không
}
```

**Response**: Xem cấu trúc log entry ở trên

### 4. `POST /api/run_batch`

**Mục đích**: Chạy batch phân tích

**Request body**:
```json
{
  "dataset": "sample_attacks" | "advanced",
  "limit": 10,  // Số lượng payload (null = tất cả)
  "paranoia_level": 2,
  "model_key": "log_reg_l1",
  "model_keys": ["log_reg_l1", "rf"]  // Tùy chọn
}
```

**Response**:
```json
{
  "summary": {
    "total": 10,
    "modsecurity_block": 8,
    "ml_detect": 9,
    "concordant_block": 7
  },
  "results": [...]
}
```

### 5. `GET /api/logs`

**Mục đích**: Đọc log entries

**Query parameters**:
- `page`: Số trang (mặc định 1)
- `limit`: Số dòng mỗi trang (mặc định 50)

**Response**:
```json
{
  "entries": [...],
  "page": 1,
  "page_size": 50,
  "total": 100,
  "total_pages": 2
}
```

### 6. `GET /api/stats`

**Mục đích**: Thống kê hiệu năng mô hình

**Query parameters**:
- `limit`: Số entries để tính (null = tất cả)

**Response**:
```json
{
  "models": [
    {
      "model_key": "log_reg_l1",
      "model_name": "Logistic Regression (L1)",
      "total": 100,
      "predict_attack": 85,
      "agree_with_modsecurity": 80,
      "modsecurity_block": 90,
      "modsecurity_allow": 10
    },
    ...
  ],
  "total_entries": 100
}
```

---

## Tóm tắt

### Kiến trúc tổng thể

- **Frontend**: Bootstrap + JavaScript (AJAX)
- **Backend**: Flask (routes) → DetectionEngine → ModSecurity/ML
- **Storage**: JSON Lines log, joblib models

### Luồng xử lý

1. Payload → ModSecurity → Triggered rules
2. Rules → Feature vector (binary)
3. Feature vector → ML model(s) → Prediction
4. Kết hợp kết quả → Response + Log

### Tham số quan trọng

- **Paranoia Level**: 1-4, ảnh hưởng số lượng rules
- **Threshold**: Ngưỡng ModSecurity (mặc định 5.0)
- **Model keys**: log_reg_l1, log_reg_l2, svc_l1, svc_l2, rf
- **Regularization**: L1 (sparse) vs L2 (smooth)

### Điểm mạnh

- **Modular**: Tách biệt rõ ràng các thành phần
- **Flexible**: Hỗ trợ nhiều models, nhiều PL
- **Robust**: Fallback stub mode khi thiếu dependencies
- **Observable**: Logging chi tiết, thống kê đầy đủ

### Hạn chế

- **Performance**: Mỗi payload phải qua ModSecurity (có thể chậm)
- **Memory**: Nạp tất cả models vào memory
- **Scalability**: Không phù hợp production scale lớn (cần queue, workers)

---

**Tài liệu này giải thích chi tiết kiến trúc và cơ chế hoạt động của demo web. Để biết cách sử dụng, xem `docs/demo_guide.md`.**

