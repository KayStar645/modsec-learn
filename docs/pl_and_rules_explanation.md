# Giải thích PL (Paranoia Level) và Rules (ModSecurity Rules)

## PL là gì? (Paranoia Level)

### Định nghĩa

**Paranoia Level (PL)** là **mức độ nhạy cảm** của ModSecurity CRS khi phát hiện tấn công. PL có 4 mức từ 1 đến 4:

- **PL 1** (Mặc định): Ít nhạy nhất, ít false positive, phù hợp production
- **PL 2**: Tăng độ nhạy, bắt thêm một số tấn công, có một số false positive
- **PL 3**: Rất nhạy, bắt nhiều tấn công hơn, nhiều false positive
- **PL 4**: Cực kỳ nhạy, bắt hầu hết tấn công, rất nhiều false positive

### Ảnh hưởng của PL

**PL cao hơn = Nhiều rules được kích hoạt hơn**

Ví dụ từ log của bạn:
- Tất cả payload đều dùng **PL 1** (mức thấp nhất)
- Một số payload tấn công không bị phát hiện vì PL 1 quá ít nhạy

### So sánh PL trong thực tế

```
Payload: "id=1' OR '1'='1"

PL 1: Có thể không kích hoạt rule nào → Score = 0 → ALLOW
PL 2: Kích hoạt rule 942110 → Score = 2.5 → ALLOW (chưa đủ threshold)
PL 3: Kích hoạt rules 942110, 942200 → Score = 5.0 → BLOCK
PL 4: Kích hoạt nhiều rules hơn → Score cao hơn → BLOCK
```

### Tại sao log của bạn dùng PL 1?

Trong log, bạn thấy:
- `"paranoia_level": 1` - Tất cả payload đều được test với PL 1
- Đây là mức **ít nhạy nhất**, nên nhiều tấn công không bị phát hiện

**Lưu ý**: Bạn có thể thay đổi PL trong giao diện demo để xem sự khác biệt!

---

## Rules là gì? (ModSecurity CRS Rules)

### Định nghĩa

**Rules** là các **luật phát hiện** của ModSecurity CRS. Mỗi rule có một **mã số** (rule ID) và **mô tả** hành vi tấn công mà nó phát hiện.

### Các Rules phổ biến trong log của bạn

#### 1. Rule 942100 - SQL Keywords Detection

**Mục đích**: Phát hiện các từ khóa SQL nguy hiểm

**Từ khóa phát hiện**:
- `SELECT`
- `UNION`
- `INSERT`
- `UPDATE`
- `DELETE`
- `DROP`

**Ví dụ từ log**:
```json
Payload: "id=1 UNION SELECT username, password FROM users --"
Triggered rules: ["942100", "942200"]
```
→ Rule 942100 kích hoạt vì có `UNION SELECT`

#### 2. Rule 942110 - Logic Bypass Detection

**Mục đích**: Phát hiện các cố gắng bypass logic (luôn đúng)

**Pattern phát hiện**:
- `OR 1=1`
- `OR true`
- `AND sleep`

**Ví dụ từ log**:
```json
Payload: "id=5' AND SLEEP(5)--"
Triggered rules: ["942110", "942130", "942200"]
```
→ Rule 942110 kích hoạt vì có `AND SLEEP` (logic bypass)

#### 3. Rule 942120 - Database Schema Detection

**Mục đích**: Phát hiện truy cập vào schema database

**Pattern phát hiện**:
- `information_schema`
- `pg_catalog`
- `sys.schema`

**Ví dụ từ log**:
```json
Payload: "id=1 AND (SELECT 1 FROM information_schema.tables..."
Triggered rules: ["942100", "942120"]
```
→ Rule 942120 kích hoạt vì có `information_schema`

#### 4. Rule 942130 - Time-based Attack Detection

**Mục đích**: Phát hiện tấn công time-based (dùng delay)

**Pattern phát hiện**:
- `benchmark(`
- `sleep(`
- `waitfor delay`

**Ví dụ từ log**:
```json
Payload: "id=5' AND SLEEP(5)--"
Triggered rules: ["942110", "942130", "942200"]
```
→ Rule 942130 kích hoạt vì có `SLEEP(5)`

#### 5. Rule 942200 - SQL Comment Detection

**Mục đích**: Phát hiện SQL comments (thường dùng để bypass)

**Pattern phát hiện**:
- `--` (double dash)
- `#` (hash)
- `/*` (multi-line comment)

**Ví dụ từ log**:
```json
Payload: "id=1 UNION SELECT username, password FROM users --"
Triggered rules: ["942100", "942200"]
```
→ Rule 942200 kích hoạt vì có `--` (SQL comment)

### Cách Rules hoạt động

1. **ModSecurity quét payload** qua tất cả rules
2. **Mỗi rule kiểm tra** pattern của nó
3. **Nếu khớp** → Rule **kích hoạt** (triggered)
4. **Mỗi rule kích hoạt** → Cộng điểm vào **score**
5. **Nếu score >= threshold** (5.0) → **BLOCK**

### Ví dụ chi tiết từ log

#### Ví dụ 1: Payload hợp lệ
```json
Payload: "username=alice&password=SuperSecure123"
Triggered rules: []  // Không có rule nào kích hoạt
Score: 0.0
Decision: ALLOW ✅
```

#### Ví dụ 2: SQLi UNION SELECT
```json
Payload: "id=1 UNION SELECT username, password FROM users --"
Triggered rules: ["942100", "942200"]
  - 942100: Phát hiện "UNION SELECT" (SQL keywords)
  - 942200: Phát hiện "--" (SQL comment)
Score: 5.0 (2.5 + 2.5)
Threshold: 5.0
Decision: BLOCK ✅
```

#### Ví dụ 3: Time-based SQLi
```json
Payload: "id=5' AND SLEEP(5)--"
Triggered rules: ["942110", "942130", "942200"]
  - 942110: Phát hiện "AND SLEEP" (logic bypass)
  - 942130: Phát hiện "SLEEP(5)" (time-based attack)
  - 942200: Phát hiện "--" (SQL comment)
Score: 7.5 (2.5 + 2.5 + 2.5)
Threshold: 5.0
Decision: BLOCK ✅
```

#### Ví dụ 4: Tấn công không bị phát hiện (PL 1 quá ít nhạy)
```json
Payload: "username=admin' OR '1'='1&password=anything"
Triggered rules: []  // Không có rule nào kích hoạt ở PL 1
Score: 0.0
Decision: ALLOW ❌ (Sai! Đây là tấn công)
```

**Tại sao không phát hiện?**
- Ở PL 1, rule phát hiện `OR '1'='1` không được kích hoạt
- Nếu dùng PL 2 hoặc cao hơn, sẽ có rule khác phát hiện

---

## Mối quan hệ giữa PL và Rules

### PL quyết định Rules nào được kích hoạt

```
PL 1: Chỉ kích hoạt các rules cơ bản nhất
  → Ít rules kích hoạt
  → Ít điểm hơn
  → Ít phát hiện tấn công hơn

PL 2: Kích hoạt thêm một số rules
  → Nhiều rules hơn PL 1
  → Nhiều điểm hơn
  → Phát hiện nhiều tấn công hơn

PL 3: Kích hoạt nhiều rules hơn nữa
  → Rất nhiều rules
  → Điểm cao
  → Phát hiện hầu hết tấn công (nhưng có false positive)

PL 4: Kích hoạt tất cả rules
  → Tất cả rules có thể
  → Điểm rất cao
  → Phát hiện gần như mọi thứ (nhiều false positive)
```

### Ví dụ thực tế

**Cùng một payload, khác PL:**

```
Payload: "id=1' OR '1'='1"

PL 1:
  Triggered rules: []
  Score: 0.0
  Decision: ALLOW ❌

PL 2:
  Triggered rules: ["942110"]
  Score: 2.5
  Decision: ALLOW (chưa đủ threshold)

PL 3:
  Triggered rules: ["942110", "942200"]
  Score: 5.0
  Decision: BLOCK ✅
```

---

## Tại sao một số tấn công không bị phát hiện?

Từ log của bạn, có nhiều payload tấn công nhưng ModSecurity vẫn **ALLOW**:

### 1. Authentication Bypass
```json
Payload: "username=admin' OR '1'='1&password=anything"
Decision: ALLOW ❌
```
**Lý do**: Ở PL 1, pattern này không khớp với rules cơ bản

### 2. DROP TABLE
```json
Payload: "id=1; DROP TABLE orders; --"
Triggered rules: ["942200"]  // Chỉ phát hiện comment
Score: 2.5 (chưa đủ threshold 5.0)
Decision: ALLOW ❌
```
**Lý do**: 
- Chỉ phát hiện được `--` (comment)
- Không phát hiện được `DROP TABLE` ở PL 1
- Score = 2.5 < 5.0 → Không block

### 3. Obfuscated UNION SELECT
```json
Payload: "id=1/**/UNION/**/SELECT/**/user,pass/**/FROM/**/users"
Triggered rules: ["942200"]  // Chỉ phát hiện comment
Score: 2.5
Decision: ALLOW ❌
```
**Lý do**: 
- Comment `/**/` làm cho `UNION SELECT` không bị phát hiện ở PL 1
- Chỉ phát hiện được comment pattern

### Giải pháp

1. **Tăng PL**: Dùng PL 2, 3, hoặc 4 để phát hiện nhiều hơn
2. **Dùng ML Model**: Mô hình học máy có thể phát hiện các pattern mà rules không bắt được
3. **Kết hợp cả hai**: ModSecurity + ML để tăng độ chính xác

---

## Tóm tắt

### PL (Paranoia Level)
- **Là gì**: Mức độ nhạy cảm của ModSecurity (1-4)
- **PL 1**: Ít nhạy, ít false positive, phù hợp production
- **PL 4**: Rất nhạy, nhiều false positive, cần tuning

### Rules (ModSecurity CRS Rules)
- **Là gì**: Các luật phát hiện tấn công (mã số như 942100, 942110...)
- **Cách hoạt động**: Quét payload, nếu khớp pattern → kích hoạt → cộng điểm
- **Quyết định**: Nếu tổng điểm >= threshold (5.0) → BLOCK

### Mối quan hệ
- **PL cao** → **Nhiều rules kích hoạt** → **Nhiều điểm** → **Phát hiện nhiều hơn**
- **PL thấp** → **Ít rules kích hoạt** → **Ít điểm** → **Có thể bỏ sót tấn công**

### Lưu ý từ log của bạn
- Log đang dùng **PL 1** (mức thấp nhất)
- Nhiều tấn công không bị phát hiện vì PL 1 quá ít nhạy
- Nên thử với **PL 2, 3, hoặc 4** để xem sự khác biệt!

