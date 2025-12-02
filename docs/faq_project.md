# Câu Hỏi Thường Gặp (FAQ) - Dự án modsec-learn

## 1. Dự án modsec-learn giải quyết vấn đề gì và mục tiêu chính là gì?

### Vấn đề
SQL Injection (SQLi) là một trong những lỗ hổng bảo mật phổ biến và nguy hiểm nhất trong các ứng dụng web. Các hệ thống phát hiện truyền thống như ModSecurity dựa trên rule-based approach có thể bỏ sót các payload tấn công tinh vi hoặc tạo ra nhiều false positive. Ngược lại, các mô hình học máy thuần túy thiếu tri thức chuyên gia về các pattern tấn công cụ thể.

### Mục tiêu chính
Dự án `modsec-learn` kết hợp **tri thức chuyên gia từ ModSecurity CRS** với **sức mạnh của học máy** để:

1. **Tận dụng tri thức chuyên gia**: Sử dụng các rule của OWASP Core Rule Set (CRS) làm đặc trưng (features) cho mô hình học máy, thay vì chỉ dựa vào raw payload.

2. **Cải thiện độ chính xác**: Các mô hình ML được huấn luyện trên features từ ModSecurity có thể phát hiện các pattern phức tạp mà rule-based system có thể bỏ sót.

3. **So sánh hiệu năng**: Đánh giá xem mô hình ML nào (Linear SVC, Random Forest, Logistic Regression) hoạt động tốt nhất so với ModSecurity baseline.

4. **Tăng khả năng giải thích**: Sử dụng các rule đã kích hoạt làm đặc trưng giúp hiểu rõ tại sao một payload bị đánh dấu là tấn công.

5. **Hỗ trợ nhiều Paranoia Levels**: Hệ thống hỗ trợ 4 mức Paranoia Level (PL 1-4) của ModSecurity, cho phép điều chỉnh độ nhạy cảm của phát hiện.

---

## 2. Kiến trúc tổng thể của dự án như thế nào và các thành phần chính hoạt động ra sao?

### Kiến trúc 3 tầng

Dự án được xây dựng theo mô hình **3 tầng**:

```
┌─────────────────────────────────────────┐
│   Frontend (HTML/JS/Bootstrap)          │
│   - Giao diện web demo                  │
│   - Tương tác AJAX với API              │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│   Flask Application (routes.py)        │
│   - Xử lý HTTP requests                │
│   - Định tuyến API endpoints            │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│   DetectionEngine (engine.py)         │
│   - Điều phối ModSecurity               │
│   - Điều phối mô hình ML                │
│   - Quản lý logging                     │
└─────────────────┬───────────────────────┘
        ┌─────────┴─────────┐
        │                   │
┌───────▼──────┐    ┌───────▼──────┐
│ ModSecurity │    │ ML Models   │
│  (Native/   │    │  (joblib)    │
│   Stub)     │    │              │
└─────────────┘    └──────────────┘
```

### Các thành phần chính

#### 1. **Data Layer** (`src/data_loader.py`)
- **Chức năng**: Nạp và chuẩn hóa dữ liệu từ JSON files
- **Input**: Files JSON chứa payload và label (0=legitimate, 1=malicious)
- **Output**: Pandas DataFrame chuẩn hóa

#### 2. **Feature Extraction** (`src/extractor.py`)
- **Chức năng**: Trích xuất đặc trưng từ payload sử dụng ModSecurity
- **Quy trình**:
  1. Gửi payload qua ModSecurity với Paranoia Level cụ thể
  2. Thu thập danh sách rules đã kích hoạt
  3. Tạo binary feature vector (1 nếu rule kích hoạt, 0 nếu không)
  4. Vector có kích thước = số lượng rules trong CRS

#### 3. **ModSecurity Integration** (`src/models/modsec.py`)
- **Chức năng**: Wrapper cho thư viện `pymodsecurity`
- **Nhiệm vụ**:
  - Nạp cấu hình ModSecurity (modsecurity.conf, crs-setup-pl{1-4}.conf)
  - Nạp CRS rules (REQUEST-942-APPLICATION-ATTACK-SQLI.conf)
  - Xử lý payload và trả về:
    - Decision: "block" hoặc "allow"
    - Score: Điểm số anomaly (threshold = 5.0)
    - Triggered rules: Danh sách rule IDs đã kích hoạt

#### 4. **Machine Learning Models** (`src/models/`)
- **Các mô hình được huấn luyện**:
  - **Linear SVC** (L1 và L2 penalty)
  - **Random Forest Classifier**
  - **Logistic Regression** (L1 và L2 penalty)
- **Đặc điểm**: Tất cả models được lưu dưới dạng `.joblib` files

#### 5. **Training Pipeline** (`scripts/run_training.py`)
- **Quy trình**:
  1. Nạp dữ liệu train
  2. Lặp qua từng Paranoia Level (1-4)
  3. Trích xuất features cho mỗi PL
  4. Huấn luyện từng mô hình với features tương ứng
  5. Lưu model vào `data/models/`

#### 6. **Evaluation** (`scripts/run_experiments.py`)
- **Chức năng**: Đánh giá models và vẽ ROC curves
- **Output**: File PDF chứa biểu đồ ROC so sánh ML models với ModSecurity

#### 7. **Demo Web Application** (`demo_app/`)
- **Frontend**: HTML/CSS/JavaScript với Bootstrap
- **Backend**: Flask application
- **Tính năng**:
  - Phân tích payload đơn lẻ
  - Batch processing
  - Logging và statistics
  - So sánh nhiều models cùng lúc

---

## 3. ModSecurity CRS là gì và Paranoia Level (PL) có ý nghĩa như thế nào?

### ModSecurity CRS (Core Rule Set)

**ModSecurity** là một Web Application Firewall (WAF) mã nguồn mở, cung cấp bảo vệ cho ứng dụng web bằng cách phân tích HTTP requests và responses.

**OWASP Core Rule Set (CRS)** là bộ rule mặc định cho ModSecurity, được phát triển bởi OWASP. CRS chứa hàng nghìn rules để phát hiện các loại tấn công khác nhau:
- SQL Injection (REQUEST-942)
- Cross-Site Scripting (REQUEST-941)
- Remote Code Execution (REQUEST-932)
- Path Traversal (REQUEST-930)
- Và nhiều loại tấn công khác

### Paranoia Level (PL)

**Paranoia Level** là cơ chế trong ModSecurity CRS cho phép điều chỉnh độ nhạy cảm của phát hiện. Có 4 mức (PL 1-4):

#### **PL 1 (Mặc định - Default)**
- **Đặc điểm**: Cân bằng giữa bảo mật và false positive
- **Rules**: Chỉ kích hoạt các rules cơ bản, đã được kiểm chứng
- **Sử dụng**: Môi trường production thông thường
- **Ví dụ rules**: 942100 (SQL keywords), 942200 (SQL comment detection)

#### **PL 2 (Nâng cao - Advanced)**
- **Đặc điểm**: Tăng độ nhạy cảm, nhiều rules hơn PL 1
- **Rules**: Bao gồm PL 1 + các rules phát hiện pattern phức tạp hơn
- **Sử dụng**: Môi trường cần bảo mật cao hơn
- **Ví dụ rules bổ sung**: 942131 (Time-based attacks extended), 942140 (Boolean-based blind SQLi)

#### **PL 3 (Rất cao - Very High)**
- **Đặc điểm**: Rất nhạy cảm, có thể tạo nhiều false positive
- **Rules**: Bao gồm PL 1-2 + các rules experimental và heuristic
- **Sử dụng**: Môi trường cực kỳ nhạy cảm, có thể chấp nhận false positive
- **Ví dụ rules bổ sung**: 942151 (SQL tautology extended), 942240 (MySQL stored procedures)

#### **PL 4 (Cực đại - Maximum)**
- **Đặc điểm**: Mức độ nhạy cảm tối đa, rất nhiều false positive
- **Rules**: Tất cả rules có sẵn, kể cả experimental
- **Sử dụng**: Nghiên cứu, testing, hoặc môi trường có đội ngũ xử lý false positive tốt
- **Ví dụ rules bổ sung**: 942290 (MongoDB SQLi), 942310 (Hex encoding)

### Tác động đến Feature Extraction

Khi trích xuất features ở các PL khác nhau:
- **PL 1**: Feature vector có ít dimensions hơn (ít rules kích hoạt)
- **PL 4**: Feature vector có nhiều dimensions hơn (nhiều rules kích hoạt)
- Mỗi PL tạo ra một "không gian đặc trưng" khác nhau
- Models được huấn luyện riêng cho từng PL

---

## 4. Quá trình trích xuất đặc trưng (Feature Extraction) hoạt động như thế nào?

### Nguyên lý cơ bản

Thay vì sử dụng raw payload (chuỗi ký tự) làm input cho ML models, dự án sử dụng **binary feature vector** dựa trên các ModSecurity rules đã kích hoạt.

### Quy trình chi tiết

#### Bước 1: Chuẩn bị danh sách Rules
```python
# Đọc danh sách tất cả rules có thể kích hoạt
crs_ids = load_json("data/crs_sqli_ids_4.0.0.json")
# Ví dụ: [942100, 942110, 942120, ..., 942500]
# Tổng cộng có thể có hàng trăm rules
```

#### Bước 2: Xử lý Payload qua ModSecurity
```python
# Gửi payload qua ModSecurity với PL cụ thể
result = modsecurity.process(payload, paranoia_level=2)

# Kết quả trả về:
# {
#   "decision": "block",
#   "score": 6.25,
#   "triggered_rules": [942100, 942200, 942210]
# }
```

#### Bước 3: Tạo Binary Feature Vector
```python
# Khởi tạo vector toàn 0
feature_vector = [0] * len(crs_ids)

# Đánh dấu 1 cho các rules đã kích hoạt
for rule_id in result["triggered_rules"]:
    index = crs_ids.index(rule_id)
    feature_vector[index] = 1

# Ví dụ với 500 rules:
# feature_vector = [0, 0, 1, 0, 1, 0, ..., 1, 0, 0]
#                   ↑  ↑  ↑  ↑  ↑  ↑       ↑  ↑  ↑
#                  r1 r2 r3 r4 r5 r6    r498 r499 r500
#                  (r3, r5, r498 = 1 vì đã kích hoạt)
```

### Ví dụ cụ thể

**Payload**: `id=1' UNION SELECT username, password FROM users--`

**Qua ModSecurity PL 2**:
- Rule 942100 kích hoạt (SQL keywords: UNION, SELECT)
- Rule 942200 kích hoạt (SQL comment: --)
- Rule 942210 kích hoạt (Chained SQL injection)

**Feature Vector** (giả sử có 500 rules):
```python
[0, 0, 0, ..., 1, ..., 0, 1, ..., 1, ..., 0, 0]
         ↑ rule 942100  ↑ rule 942200  ↑ rule 942210
```

### Ưu điểm của phương pháp này

1. **Tận dụng tri thức chuyên gia**: Rules của ModSecurity đã được các chuyên gia bảo mật kiểm chứng
2. **Giảm chiều dữ liệu**: Thay vì xử lý chuỗi ký tự dài, chỉ cần vector nhị phân
3. **Dễ giải thích**: Có thể biết chính xác rules nào đã kích hoạt
4. **Tương thích với nhiều loại payload**: Không phụ thuộc vào format cụ thể

### So sánh với phương pháp khác

| Phương pháp | Ưu điểm | Nhược điểm |
|------------|---------|-----------|
| **Raw payload** | Đơn giản | Chiều dữ liệu lớn, khó xử lý |
| **TF-IDF / N-gram** | Phát hiện pattern | Không tận dụng tri thức chuyên gia |
| **Word embeddings** | Hiểu ngữ nghĩa | Cần dữ liệu lớn, khó giải thích |
| **Rule-based features** (dự án này) | Tận dụng tri thức, dễ giải thích | Phụ thuộc vào chất lượng rules |

---

## 5. Các mô hình học máy được sử dụng là gì và tại sao chọn chúng?

### Các mô hình được huấn luyện

Dự án huấn luyện **5 biến thể mô hình**:

1. **Linear SVC (L1 penalty)**
2. **Linear SVC (L2 penalty)**
3. **Random Forest Classifier**
4. **Logistic Regression (L1 penalty)**
5. **Logistic Regression (L2 penalty)**

### Chi tiết từng mô hình

#### 1. Linear SVC (Support Vector Classifier)

**Nguyên lý**: Tìm siêu phẳng tối ưu để phân tách hai lớp (legitimate vs malicious).

**L1 Penalty**:
- **Ưu điểm**: Tạo ra mô hình **sparse** (nhiều trọng số = 0), dễ giải thích
- **Nhược điểm**: Có thể bỏ sót một số features quan trọng
- **Sử dụng**: Khi muốn biết rules nào quan trọng nhất

**L2 Penalty**:
- **Ưu điểm**: Phân bố trọng số đều hơn, ít bỏ sót features
- **Nhược điểm**: Khó giải thích hơn (nhiều rules có trọng số nhỏ)
- **Sử dụng**: Khi muốn tận dụng tất cả thông tin

**Tham số trong dự án**:
```python
LinearSVC(
    penalty='l1' hoặc 'l2',
    dual=False,  # Bắt buộc khi dùng L1
    class_weight='balanced',  # Xử lý class imbalance
    max_iter=1000
)
```

#### 2. Random Forest Classifier

**Nguyên lý**: Ensemble của nhiều cây quyết định, mỗi cây vote và lấy kết quả đa số.

**Ưu điểm**:
- **Hiệu năng cao**: Thường đạt accuracy tốt nhất
- **Xử lý non-linear**: Có thể phát hiện pattern phức tạp
- **Robust**: Ít bị overfitting

**Nhược điểm**:
- **Khó giải thích**: Không biết rules nào quan trọng nhất
- **Tốn tài nguyên**: Cần nhiều bộ nhớ và thời gian

**Tham số trong dự án**:
```python
RandomForestClassifier(
    n_estimators=100,
    class_weight='balanced',
    n_jobs=-1  # Sử dụng tất cả CPU cores
)
```

#### 3. Logistic Regression

**Nguyên lý**: Mô hình tuyến tính với hàm sigmoid, output là xác suất (0-1).

**L1 Penalty**:
- Tương tự Linear SVC L1: sparse model, dễ giải thích

**L2 Penalty**:
- Tương tự Linear SVC L2: phân bố đều, tận dụng tất cả features

**Tham số trong dự án**:
```python
LogisticRegression(
    penalty='l1' hoặc 'l2',
    solver='saga',  # Hỗ trợ cả L1 và L2
    class_weight='balanced',
    max_iter=1000
)
```

### Tại sao chọn các mô hình này?

1. **Linear Models (SVC, Logistic)**:
   - **Dễ giải thích**: Có thể xem trọng số của từng rule
   - **Nhanh**: Training và inference đều nhanh
   - **Phù hợp với binary features**: Rule-based features là binary, linear models hoạt động tốt

2. **Random Forest**:
   - **Baseline tốt**: Thường đạt hiệu năng cao nhất
   - **So sánh**: Dùng để so sánh với linear models

3. **L1 vs L2**:
   - **L1**: Khi muốn biết rules quan trọng nhất (feature selection tự động)
   - **L2**: Khi muốn tận dụng tất cả thông tin

### Kết quả thực tế

Theo báo cáo dự án:
- **Logistic Regression (L1)** và **Linear SVC (L1)** thường đạt ROC-AUC cao nhất
- **Random Forest** đạt hiệu năng ổn định nhưng khó giải thích
- Tất cả ML models đều **vượt ModSecurity baseline** ở hầu hết Paranoia Levels

---

## 6. Demo web application có những tính năng gì và hoạt động như thế nào?

### Tổng quan

Demo web application (`demo_app/`) là một Flask application cho phép người dùng tương tác với hệ thống phát hiện SQLi một cách trực quan.

### Kiến trúc

```
Frontend (HTML/JS/Bootstrap)
    ↕ AJAX
Flask Routes (routes.py)
    ↕
DetectionEngine (engine.py)
    ↕
ModSecurity + ML Models
```

### Các tính năng chính

#### 1. **Trình diễn tức thời (Real-time Demo)**

**Chức năng**: Phân tích một payload đơn lẻ ngay lập tức.

**Quy trình**:
1. Người dùng nhập payload vào form
2. Chọn Paranoia Level (1-4)
3. Chọn một hoặc nhiều ML models
4. Nhấn "Phân tích"
5. Kết quả hiển thị:
   - ModSecurity decision (block/allow) và score
   - ML prediction (attack/legit) và confidence
   - Danh sách rules đã kích hoạt (với tooltip giải thích)
   - Timeline xử lý

**API Endpoint**: `POST /api/analyze`

#### 2. **Batch Processing & Lịch sử**

**Chức năng**: Chạy phân tích hàng loạt payload từ dataset.

**Tính năng**:
- Chọn dataset (sample_attacks.json, advanced_attacks.json)
- Chọn số lượng payload (hoặc để trống = tất cả)
- Chọn Paranoia Level
- Chọn nhiều ML models cùng lúc
- Kết quả:
  - Tóm tắt batch: Tổng payload, ModSecurity chặn, ML đánh dấu, cùng chặn
  - Phân tích chi tiết theo từng model:
    - Cả hai đều chặn
    - Chỉ ModSecurity chặn
    - Chỉ ML đánh dấu
    - Cả hai đều cho phép
  - Danh sách payload cụ thể trong từng nhóm

**API Endpoint**: `POST /api/run_batch`

#### 3. **Lịch sử Log**

**Chức năng**: Xem lại các phân tích đã thực hiện.

**Tính năng**:
- Phân trang (có thể điều chỉnh số dòng mỗi trang)
- Hiển thị timestamp, payload, PL, ModSecurity decision, ML predictions
- Modal chi tiết cho mỗi entry
- Tải log dưới dạng JSON

**API Endpoint**: `GET /api/logs?limit=50&page=1`

#### 4. **Báo cáo mô hình**

**Chức năng**: Thống kê hiệu năng của các ML models dựa trên log.

**Biểu đồ**:
- **Tỉ lệ đánh dấu attack**: % payload mà mỗi model đánh dấu là attack
- **Đồng thuận với ModSecurity**: % payload mà model đồng ý với ModSecurity

**API Endpoint**: `GET /api/stats`

#### 5. **Tra cứu Rules & PL**

**Chức năng**: Giải thích chi tiết về các ModSecurity rules và Paranoia Levels.

**Tính năng**:
- Giải thích từng Paranoia Level (1-4)
- Tìm kiếm rules theo ID hoặc tên
- Lọc rules theo Paranoia Level
- Hiển thị thông tin chi tiết:
  - Tên rule
  - Mô tả
  - Patterns phát hiện
  - Severity
  - Điểm số
  - Paranoia Levels áp dụng

**Tooltip**: Khi hover vào rule badges trong kết quả, hiển thị tooltip với thông tin chi tiết.

### Luồng xử lý payload

```
1. User nhập payload
   ↓
2. Frontend gửi AJAX request đến /api/analyze
   ↓
3. Routes.py nhận request, gọi DetectionEngine.analyze_payload()
   ↓
4. DetectionEngine:
   a. Gửi payload qua ModSecurity (với PL đã chọn)
   b. Trích xuất features từ triggered rules
   c. Chạy qua các ML models đã chọn
   d. Tổng hợp kết quả
   ↓
5. Lưu vào log (JSON Lines format)
   ↓
6. Trả về JSON response
   ↓
7. Frontend render kết quả
```

### Stub Mode

**Vấn đề**: ModSecurity và `pymodsecurity` khó cài đặt trên một số hệ thống (đặc biệt Windows).

**Giải pháp**: Demo có chế độ **stub** (`demo_app/modsec_stub.py`):
- Mô phỏng ModSecurity với các rules cơ bản
- Cho phép demo hoạt động ngay cả khi chưa cài ModSecurity
- Hiển thị cảnh báo "STUB MODE" trong giao diện

### Logging System

**Format**: JSON Lines (mỗi dòng là một JSON object)

**Nội dung mỗi entry**:
```json
{
  "analysis_id": "uuid",
  "timestamp": "2025-11-30T08:52:44",
  "payload": "id=1' UNION SELECT...",
  "paranoia_level": 2,
  "modsecurity": {
    "decision": "block",
    "score": 6.25,
    "triggered_rules": [942100, 942200]
  },
  "ml_results": [
    {
      "model_key": "logistic_regression_l1_pl2",
      "model_name": "Logistic Regression (L1)",
      "prediction": 1,
      "probability_attack": 0.95
    }
  ]
}
```

---

## 7. Tập dữ liệu được sử dụng như thế nào và quá trình tiền xử lý ra sao?

### Nguồn dữ liệu

#### Dữ liệu hợp lệ (Legitimate)
- **Nguồn**: Tổng hợp từ các log hợp lệ thực tế
- **Vị trí**: `modsec-learn-dataset/legitimate/`
- **Định dạng**: Nhiều file JSON nhỏ, mỗi file chứa các payload hợp lệ
- **Ví dụ payload**: `id=123`, `name=John`, `search=hello world`

#### Dữ liệu độc hại (Malicious)
- **Nguồn**: Tổng hợp từ nhiều dataset công khai:
  - `openappsec`
  - `httpparams`
  - `sqli_kaggle`
  - `sqlmap`
  - Và các nguồn khác
- **Vị trí**: `modsec-learn-dataset/malicious/`
- **Định dạng**: Nhiều file JSON nhỏ, mỗi file chứa các payload SQLi
- **Ví dụ payload**: 
  - `id=1' UNION SELECT username, password FROM users--`
  - `id=5' AND SLEEP(5)--`
  - `id=1' OR '1'='1`

### Quá trình tiền xử lý

#### Bước 1: Merge dữ liệu gốc

**Script**: `merge.py` (trong mỗi thư mục `legitimate/` và `malicious/`)

**Chức năng**:
- Đọc tất cả file JSON nhỏ trong thư mục
- Ghép thành một file lớn
- Xử lý lỗi: Bỏ qua file thiếu hoặc rỗng

**Output**:
- `legitimate_dataset.json`
- `sqli_dataset.json`

**Định dạng mỗi record**:
```json
{
  "payload": "id=123",
  "label": 0  // 0 = legitimate, 1 = malicious
}
```

#### Bước 2: Xây dựng tập train/test

**Script**: `scripts/build_dataset.py`

**Quy trình**:
1. **Nạp dữ liệu đã merge**:
   - `legitimate_dataset.json`
   - `sqli_dataset.json`

2. **Xáo trộn (shuffle)**:
   - Xáo trộn ngẫu nhiên mỗi lớp để tránh bias

3. **Lấy mẫu**:
   - Lấy 25.000 mẫu cho mỗi lớp
   - Tổng cộng: 50.000 mẫu

4. **Chia train/test**:
   - **80% train** (20.000 mẫu mỗi lớp = 40.000 tổng)
   - **20% test** (5.000 mẫu mỗi lớp = 10.000 tổng)

5. **Lưu thành 4 files**:
   - `data/dataset/legitimate_train.json`
   - `data/dataset/legitimate_test.json`
   - `data/dataset/malicious_train.json`
   - `data/dataset/malicious_test.json`

**Lý do chia 80/20**:
- Đủ dữ liệu train để models học tốt
- Đủ dữ liệu test để đánh giá khách quan
- Tỷ lệ phổ biến trong ML

### Sử dụng trong training

**Script**: `scripts/run_training.py`

**Quy trình**:
1. Nạp 4 files train/test bằng `DataLoader`
2. Kết hợp legitimate và malicious thành một DataFrame
3. Trích xuất features cho từng PL
4. Huấn luyện models

**Ví dụ code**:
```python
# Nạp dữ liệu
train_legit = DataLoader.load("data/dataset/legitimate_train.json")
train_mal = DataLoader.load("data/dataset/malicious_train.json")

# Kết hợp
train_data = pd.concat([train_legit, train_mal])

# Trích xuất features
extractor = ModSecurityFeaturesExtractor(pl=2)
X_train = extractor.extract_features(train_data["payload"])
y_train = train_data["label"]
```

### Dataset cho demo

**Vị trí**: `demo_app/data/`

**Files**:
1. **`sample_attacks.json`**: ~20 payload cho demo nhanh
2. **`advanced_attacks.json`**: 100 payload SQLi đa dạng

**Định dạng**:
```json
[
  {
    "payload": "id=1' UNION SELECT...",
    "metadata": {
      "name": "Union-based SQLi",
      "type": "union"
    }
  }
]
```

**Sử dụng**: Người dùng có thể chọn dataset này trong tab "Batch & Lịch sử" để chạy batch processing.

---

## 8. Quá trình huấn luyện mô hình diễn ra như thế nào?

### Tổng quan

Quá trình huấn luyện được tự động hóa hoàn toàn bởi script `scripts/run_training.py`.

### Cấu hình

**File**: `config.toml`

**Các tham số quan trọng**:
```toml
[paths]
dataset_path = "data/dataset"
crs_dir = "./coreruleset"
models_path = "data/models"

[training]
paranoia_levels = [1, 2, 3, 4]
models = [
    "linear_svc_l1",
    "linear_svc_l2",
    "random_forest",
    "logistic_regression_l1",
    "logistic_regression_l2"
]
```

### Quy trình chi tiết

#### Bước 1: Nạp dữ liệu

```python
# Nạp train data
train_legit = DataLoader.load("data/dataset/legitimate_train.json")
train_mal = DataLoader.load("data/dataset/malicious_train.json")
train_data = pd.concat([train_legit, train_mal])

# Xáo trộn
train_data = train_data.sample(frac=1).reset_index(drop=True)

# Tách features và labels
X_raw = train_data["payload"]
y = train_data["label"]
```

#### Bước 2: Lặp qua từng Paranoia Level

```python
for pl in [1, 2, 3, 4]:
    print(f"[INFO] Processing PL {pl}...")
    
    # Khởi tạo extractor với PL cụ thể
    extractor = ModSecurityFeaturesExtractor(paranoia_level=pl)
    
    # Trích xuất features
    X = extractor.extract_features(X_raw)
    # X là ma trận (n_samples, n_features)
    # n_features = số lượng rules trong CRS
```

**Lưu ý**: Mỗi PL tạo ra một không gian đặc trưng khác nhau vì số lượng rules kích hoạt khác nhau.

#### Bước 3: Huấn luyện từng mô hình

```python
models_config = {
    "linear_svc_l1": LinearSVC(penalty='l1', dual=False, class_weight='balanced'),
    "linear_svc_l2": LinearSVC(penalty='l2', class_weight='balanced'),
    "random_forest": RandomForestClassifier(class_weight='balanced', n_jobs=-1),
    "logistic_regression_l1": LogisticRegression(penalty='l1', solver='saga', class_weight='balanced'),
    "logistic_regression_l2": LogisticRegression(penalty='l2', solver='saga', class_weight='balanced')
}

for model_name, model_class in models_config.items():
    print(f"[INFO] Training {model_name} for PL {pl}...")
    
    # Khởi tạo model
    model = model_class
    
    # Huấn luyện
    model.fit(X, y)
    
    # Lưu model
    model_key = f"{model_name}_pl{pl}"
    model_path = f"data/models/{model_key}.joblib"
    joblib.dump(model, model_path)
    
    print(f"[INFO] Saved {model_key}")
```

### Xử lý Class Imbalance

**Vấn đề**: Dataset có thể không cân bằng (ví dụ: nhiều legitimate hơn malicious).

**Giải pháp**: Sử dụng `class_weight='balanced'`
- Tự động điều chỉnh trọng số để cân bằng 2 lớp
- Models sẽ chú ý hơn đến lớp thiểu số (malicious)

### Thời gian huấn luyện

**Ước tính** (với 40.000 mẫu train):
- **Feature extraction**: ~2-4 giờ (phụ thuộc vào tốc độ ModSecurity)
- **Training mỗi model**: ~5-15 phút
- **Tổng cộng**: ~3-5 giờ cho tất cả PL và models

**Tối ưu hóa**:
- Sử dụng `n_jobs=-1` cho Random Forest (parallel processing)
- Có thể chạy song song nhiều PL nếu có nhiều CPU cores

### Output

**Thư mục**: `data/models/`

**Tên files**:
- `linear_svc_l1_pl1.joblib`
- `linear_svc_l1_pl2.joblib`
- `linear_svc_l1_pl3.joblib`
- `linear_svc_l1_pl4.joblib`
- `linear_svc_l2_pl1.joblib`
- ... (tổng cộng 20 files: 5 models × 4 PLs)

**Format**: Joblib (Python serialization format, tương thích với scikit-learn)

### Sử dụng models đã huấn luyện

**Trong demo app**:
```python
# Nạp model
model = joblib.load("data/models/logistic_regression_l1_pl2.joblib")

# Dự đoán
features = extractor.extract_features([payload])
prediction = model.predict(features)[0]  # 0 hoặc 1
probability = model.predict_proba(features)[0][1]  # Xác suất là attack
```

---

## 9. Làm thế nào để đánh giá và so sánh hiệu năng của các mô hình?

### Các metric đánh giá

#### 1. **ROC Curve và AUC**

**ROC Curve (Receiver Operating Characteristic)**:
- **Trục X**: False Positive Rate (FPR) = FP / (FP + TN)
- **Trục Y**: True Positive Rate (TPR) = TP / (TP + FN)
- **Ý nghĩa**: Thể hiện trade-off giữa TPR và FPR ở các ngưỡng khác nhau

**AUC (Area Under Curve)**:
- Diện tích dưới đường ROC
- Giá trị từ 0 đến 1
- **AUC = 1**: Hoàn hảo
- **AUC = 0.5**: Ngẫu nhiên (không tốt hơn đoán ngẫu nhiên)
- **AUC > 0.9**: Rất tốt

**Script**: `scripts/run_experiments.py`

**Quy trình**:
1. Nạp dữ liệu test
2. Trích xuất features cho từng PL
3. Dự đoán bằng ModSecurity và các ML models
4. Tính TPR và FPR ở nhiều ngưỡng
5. Vẽ ROC curve

**Kết quả**: File `data/figures/roc_curves.pdf`

#### 2. **Confusion Matrix**

**Các chỉ số**:
- **True Positive (TP)**: Dự đoán đúng là attack
- **True Negative (TN)**: Dự đoán đúng là legitimate
- **False Positive (FP)**: Dự đoán sai là attack (false alarm)
- **False Negative (FN)**: Dự đoán sai là legitimate (bỏ sót)

**Các metric từ Confusion Matrix**:
- **Accuracy** = (TP + TN) / (TP + TN + FP + FN)
- **Precision** = TP / (TP + FP) - Độ chính xác khi dự đoán attack
- **Recall (Sensitivity)** = TP / (TP + FN) - Khả năng phát hiện attack
- **F1-Score** = 2 × (Precision × Recall) / (Precision + Recall)

#### 3. **Agreement Rate**

**Định nghĩa**: Tỉ lệ ML model đồng ý với ModSecurity

**Công thức**:
```
Agreement Rate = (Số payload cả hai cùng chặn) / (Tổng số payload ModSecurity chặn)
```

**Ý nghĩa**:
- **Agreement cao**: ML model học được pattern tương tự ModSecurity
- **Agreement thấp**: ML model phát hiện thêm hoặc bỏ sót so với ModSecurity

### So sánh với ModSecurity Baseline

**ModSecurity Baseline**:
- Sử dụng quyết định block/allow của ModSecurity
- Score >= 5.0 → block, < 5.0 → allow
- Được coi là "ground truth" từ chuyên gia

**So sánh**:
- Nếu ML model có AUC cao hơn ModSecurity → ML tốt hơn
- Nếu ML model có Agreement cao → ML học được pattern của ModSecurity
- Nếu ML model có Agreement thấp nhưng AUC cao → ML phát hiện thêm pattern mới

### Script đánh giá

#### `scripts/run_experiments.py`

**Chức năng chính**:
1. Nạp dữ liệu test
2. Lặp qua từng PL:
   - Trích xuất features
   - Dự đoán bằng ModSecurity
   - Dự đoán bằng tất cả ML models
   - Tính ROC cho mỗi model
3. Vẽ biểu đồ ROC:
   - Mỗi PL một subplot
   - So sánh tất cả models với ModSecurity
   - Thêm vùng zoom cho FPR nhỏ

**Output**: `data/figures/roc_curves.pdf`

#### `scripts/analyze_rules.py`

**Chức năng**: So sánh trọng số rules giữa ModSecurity và ML models

**Quy trình**:
1. Lấy trọng số từ ModSecurity (từ file `crs_sqli_weights_4.0.0.json`)
2. Lấy trọng số từ linear models (coefficients)
3. So sánh và vẽ biểu đồ

**Output**: 
- `data/figures/lr_weights_comp.pdf`
- `data/figures/svm_weights_comp.pdf`

**Ý nghĩa**:
- Xem ML model coi rules nào quan trọng
- So sánh với trọng số của ModSecurity
- Hiểu cách ML model "học" từ rules

### Kết quả thực tế

Theo báo cáo dự án:

1. **ROC-AUC**:
   - **Logistic Regression (L1)**: AUC cao nhất (~0.95-0.98)
   - **Linear SVC (L1)**: AUC tương đương (~0.94-0.97)
   - **Random Forest**: AUC ổn định (~0.92-0.96)
   - **ModSecurity**: AUC baseline (~0.85-0.90)
   - **Kết luận**: ML models vượt ModSecurity ở hầu hết PL

2. **Agreement Rate**:
   - **PL 1**: Agreement cao (~80-90%) vì ít rules, dễ học
   - **PL 4**: Agreement thấp hơn (~60-70%) vì nhiều rules, ML phát hiện thêm

3. **Trọng số Rules**:
   - **L1 models**: Tập trung vào một số rules quan trọng (sparse)
   - **L2 models**: Phân bố đều hơn, tận dụng nhiều rules
   - **ModSecurity**: Trọng số cố định, không học được

### Đánh giá trong Demo App

**Tab "Báo cáo mô hình"**:
- Hiển thị biểu đồ tỉ lệ đánh dấu attack
- Hiển thị biểu đồ agreement rate
- Dựa trên dữ liệu log thực tế

**Tab "Batch & Lịch sử"**:
- Tóm tắt batch: Số payload ModSecurity chặn, ML đánh dấu, cùng chặn
- Phân tích chi tiết: Nhóm payload theo quyết định của từng model

---

## 10. Những thách thức gặp phải trong dự án và cách giải quyết là gì?

### Thách thức 1: Cài đặt ModSecurity và pymodsecurity

**Vấn đề**:
- ModSecurity cần biên dịch từ source code
- Phụ thuộc nhiều thư viện hệ thống (libxml2, libyajl, pcre2...)
- `pymodsecurity` là Python binding, khó cài trên Windows
- Thiếu tài liệu hướng dẫn chi tiết

**Giải pháp**:
1. **Tạo tài liệu chi tiết**: File `docs/modsecurity_setup.md` với từng bước cụ thể
2. **Hỗ trợ WSL**: Hướng dẫn cài trên WSL (Windows Subsystem for Linux)
3. **Stub mode**: Tạo `demo_app/modsec_stub.py` để demo hoạt động ngay cả khi chưa cài ModSecurity
4. **Kiểm tra cấu hình**: Script kiểm tra syntax của ModSecurity config files

### Thách thức 2: Xử lý dữ liệu không đồng nhất

**Vấn đề**:
- Dữ liệu từ nhiều nguồn khác nhau
- Một số file JSON có thể thiếu hoặc rỗng
- Định dạng không nhất quán

**Giải pháp**:
1. **Merge script robust**: `merge.py` xử lý lỗi, bỏ qua file thiếu
2. **Chuẩn hóa format**: `DataLoader` chuẩn hóa tất cả dữ liệu về format thống nhất
3. **Validation**: Kiểm tra dữ liệu trước khi training

### Thách thức 3: Class Imbalance

**Vấn đề**:
- Dataset có thể không cân bằng (nhiều legitimate hơn malicious hoặc ngược lại)
- Models có xu hướng dự đoán lớp đa số

**Giải pháp**:
1. **Class weight balancing**: Sử dụng `class_weight='balanced'` trong tất cả models
2. **Lấy mẫu cân bằng**: Script `build_dataset.py` lấy 25.000 mẫu cho mỗi lớp
3. **Đánh giá bằng ROC**: ROC-AUC không bị ảnh hưởng bởi class imbalance

### Thách thức 4: Thời gian xử lý lâu

**Vấn đề**:
- Feature extraction cần gửi từng payload qua ModSecurity
- Với 50.000 mẫu, quá trình có thể mất hàng giờ
- Training nhiều models cho nhiều PL cũng tốn thời gian

**Giải pháp**:
1. **Parallel processing**: Sử dụng `n_jobs=-1` cho Random Forest
2. **Lưu trữ features**: Có thể lưu features đã trích xuất để tái sử dụng
3. **Tối ưu ModSecurity**: Điều chỉnh cấu hình để tăng tốc độ
4. **Chạy từng PL riêng**: Có thể chạy training cho từng PL độc lập

### Thách thức 5: Lỗi sklearn với LinearSVC L1

**Vấn đề**:
- LinearSVC với `penalty='l1'` mặc định dùng `dual=True`
- Gây lỗi với solver liblinear

**Giải pháp**:
- Thiết lập `dual=False` khi dùng L1 penalty
- Code trong `run_training.py`:
  ```python
  LinearSVC(penalty='l1', dual=False, ...)
  ```

### Thách thức 6: ROC curve bị nhiễu ở FPR nhỏ

**Vấn đề**:
- Ở vùng FPR rất nhỏ (< 0.01), đường ROC bị nhiễu, khó so sánh

**Giải pháp**:
1. **Log scale cho FPR**: Sử dụng log scale để phóng đại vùng FPR nhỏ
2. **Vùng zoom**: Thêm subplot zoom vào vùng FPR nhỏ
3. **Interpolation**: Làm mịn đường ROC bằng interpolation

### Thách thức 7: Giải thích kết quả

**Vấn đề**:
- Người dùng muốn hiểu tại sao một payload bị đánh dấu là attack
- Random Forest khó giải thích

**Giải pháp**:
1. **Hiển thị triggered rules**: Trong demo app, hiển thị danh sách rules đã kích hoạt
2. **Tooltip giải thích**: Hover vào rule badge hiển thị tooltip với thông tin chi tiết
3. **Tab tra cứu Rules**: Tab riêng để tìm hiểu về từng rule
4. **Phân tích trọng số**: Script `analyze_rules.py` so sánh trọng số rules
5. **Timeline xử lý**: Modal chi tiết hiển thị quá trình xử lý từng bước

### Thách thức 8: Tích hợp nhiều models trong demo

**Vấn đề**:
- Demo cần hỗ trợ chạy nhiều models cùng lúc
- Cần so sánh kết quả giữa các models
- Hiển thị kết quả rõ ràng, không rối

**Giải pháp**:
1. **Multi-model support**: `DetectionEngine` hỗ trợ chạy nhiều models
2. **Structured response**: API trả về `ml_results` là array chứa kết quả từng model
3. **UI accordion**: Sử dụng Bootstrap accordion để hiển thị từng model
4. **Bảng so sánh**: Bảng so sánh số liệu giữa các models
5. **Phân tích chi tiết**: Nhóm payload theo quyết định của từng model

### Thách thức 9: Logging và persistence

**Vấn đề**:
- Cần lưu lại tất cả phân tích để xem lại
- Log file có thể lớn nhanh
- Cần phân trang và tìm kiếm

**Giải pháp**:
1. **JSON Lines format**: Mỗi dòng là một JSON object, dễ đọc và xử lý
2. **Disk quota**: `Logger` có cơ chế giới hạn kích thước log file
3. **Pagination**: API `/api/logs` hỗ trợ `limit` và `page`
4. **Statistics**: API `/api/stats` tính toán thống kê từ log

### Thách thức 10: Tài liệu và hướng dẫn

**Vấn đề**:
- Dự án phức tạp, nhiều thành phần
- Người dùng mới khó bắt đầu
- Thiếu ví dụ và giải thích

**Giải pháp**:
1. **README chi tiết**: Hướng dẫn từng bước cài đặt và sử dụng
2. **Tài liệu kiến trúc**: `docs/demo_architecture.md` giải thích chi tiết
3. **Hướng dẫn demo**: `docs/demo_guide.md` hướng dẫn chạy demo
4. **Giải thích PL và Rules**: `docs/pl_and_rules_explanation.md`
5. **Báo cáo dự án**: `docs/project_report.md` tổng hợp toàn bộ
6. **FAQ**: File này - giải đáp các câu hỏi thường gặp
7. **Tooltip và help text**: Trong giao diện web có tooltip và giải thích

---

## Kết luận

Dự án `modsec-learn` là một hệ thống hoàn chỉnh kết hợp ModSecurity CRS với Machine Learning để phát hiện SQL Injection. Dự án không chỉ đạt được mục tiêu kỹ thuật (cải thiện hiệu năng phát hiện) mà còn cung cấp công cụ demo trực quan và tài liệu đầy đủ.

Các điểm nổi bật:
- **Tận dụng tri thức chuyên gia**: Sử dụng ModSecurity rules làm features
- **Hiệu năng cao**: ML models vượt ModSecurity baseline
- **Dễ giải thích**: Rule-based features giúp hiểu rõ quyết định
- **Hỗ trợ nhiều PL**: Linh hoạt điều chỉnh độ nhạy cảm
- **Demo trực quan**: Web application dễ sử dụng
- **Tài liệu đầy đủ**: Hướng dẫn chi tiết từ cài đặt đến sử dụng

Hướng phát triển tiếp theo có thể bao gồm:
- Mở rộng sang các loại tấn công khác (XSS, RCE...)
- Thử nghiệm mô hình deep learning
- Triển khai real-time trong production
- Tích hợp với các hệ thống SIEM

---

**Tài liệu tham khảo**:
- `README.md` - Hướng dẫn tổng quan
- `docs/project_report.md` - Báo cáo chi tiết dự án
- `docs/demo_architecture.md` - Kiến trúc demo web
- `docs/demo_guide.md` - Hướng dẫn chạy demo
- `docs/pl_and_rules_explanation.md` - Giải thích PL và Rules

