# Giải thích chi tiết Batch Summary

## Các số liệu trong Batch Summary

Khi bạn chạy batch phân tích, bạn sẽ thấy các số liệu sau:

```
Tổng payload: 20
ModSecurity chặn: 6
ML đánh dấu attack: 7
Cùng chặn: 5
```

---

## 1. Tổng payload: 20

### Định nghĩa
**Tổng số payload** đã được phân tích trong batch này.

### Ví dụ
- Bạn chọn dataset "default" với 20 payload
- Hệ thống phân tích tất cả 20 payload này
- → **Tổng payload = 20**

### Ý nghĩa
Đây là **tổng số mẫu** đã được test, bao gồm cả payload hợp lệ và payload tấn công.

---

## 2. ModSecurity chặn: 6

### Định nghĩa
**Số lượng payload** mà **ModSecurity quyết định chặn** (decision = "block").

### Cách hoạt động
1. ModSecurity quét payload qua các rules
2. Tính điểm (score) dựa trên rules kích hoạt
3. Nếu **score >= threshold (5.0)** → Quyết định **"block"**
4. Nếu **score < threshold** → Quyết định **"allow"**

### Ví dụ từ log

**Payload bị ModSecurity chặn:**
```json
Payload: "id=1 UNION SELECT username, password FROM users --"
ModSecurity: decision = "block", score = 6.25 (>= 5.0)
Rules kích hoạt: ["942100", "942200"]
→ Được tính vào "ModSecurity chặn"
```

**Payload không bị ModSecurity chặn:**
```json
Payload: "username=alice&password=SuperSecure123"
ModSecurity: decision = "allow", score = 0.0 (< 5.0)
Rules kích hoạt: []
→ KHÔNG được tính vào "ModSecurity chặn"
```

### Trong batch của bạn
- **6 payload** có score >= 5.0 → ModSecurity quyết định **block**
- **14 payload** còn lại có score < 5.0 → ModSecurity quyết định **allow**

---

## 3. ML đánh dấu attack: 7

### Định nghĩa
**Số lượng payload** mà **mô hình học máy dự đoán là tấn công** (prediction = 1).

### Cách hoạt động
1. Hệ thống chuyển đổi rules kích hoạt thành **feature vector** (nhị phân)
2. Mô hình ML nhận feature vector và đưa ra dự đoán:
   - **prediction = 1** → Attack (tấn công)
   - **prediction = 0** → Legit (hợp lệ)

### Ví dụ từ log

**Payload được ML đánh dấu là attack:**
```json
Payload: "id=1 UNION SELECT username, password FROM users --"
ML: prediction = 1, probability_attack = 100.0%
→ Được tính vào "ML đánh dấu attack"
```

**Payload được ML đánh dấu là legit:**
```json
Payload: "username=alice&password=SuperSecure123"
ML: prediction = 0, probability_attack = 1.1%
→ KHÔNG được tính vào "ML đánh dấu attack"
```

### Trong batch của bạn
- **7 payload** được ML dự đoán là **attack** (prediction = 1)
- **13 payload** còn lại được ML dự đoán là **legit** (prediction = 0)

### Lưu ý
ML có thể phát hiện các tấn công mà ModSecurity bỏ sót, hoặc ngược lại!

---

## 4. Cùng chặn: 5

### Định nghĩa
**Số lượng payload** mà **CẢ ModSecurity VÀ ML đều chặn/đánh dấu là tấn công**.

### Điều kiện
Một payload được tính vào "Cùng chặn" khi:
- **ModSecurity**: decision = "block" (score >= 5.0)
- **VÀ ML**: prediction = 1 (đánh dấu là attack)

### Ví dụ từ log

**Payload được cả hai chặn:**
```json
Payload: "id=1 UNION SELECT username, password FROM users --"
ModSecurity: decision = "block", score = 6.25
ML: prediction = 1, probability_attack = 100.0%
→ Được tính vào "Cùng chặn" ✅
```

**Payload chỉ ModSecurity chặn:**
```json
Payload: "id=5' AND SLEEP(5)--"
ModSecurity: decision = "block", score = 9.375
ML: prediction = 0, probability_attack = 20.0% (legit)
→ KHÔNG được tính vào "Cùng chặn" ❌
```

**Payload chỉ ML đánh dấu:**
```json
Payload: "id=1 UNION SELECT 0x61646d696e,0x70617373776f7264"
ModSecurity: decision = "allow", score = 3.125 (< 5.0)
ML: prediction = 1, probability_attack = 100.0%
→ KHÔNG được tính vào "Cùng chặn" ❌
```

### Trong batch của bạn
- **5 payload** được **CẢ ModSecurity VÀ ML** đều chặn/đánh dấu
- Đây là các payload **rõ ràng là tấn công** và cả hai hệ thống đều đồng ý

---

## Phân tích chi tiết từ số liệu

### Từ batch của bạn:
- **Tổng payload**: 20
- **ModSecurity chặn**: 6
- **ML đánh dấu attack**: 7
- **Cùng chặn**: 5

### Phân tích:

#### 1. ModSecurity chặn 6, ML đánh dấu 7
- ML phát hiện **nhiều hơn 1 payload** so với ModSecurity
- Nghĩa là có **1 payload** mà:
  - ModSecurity: **allow** (không chặn)
  - ML: **attack** (đánh dấu là tấn công)
- → ML **bù đắp** cho ModSecurity khi ModSecurity bỏ sót

#### 2. Cùng chặn = 5
- Trong 6 payload ModSecurity chặn, chỉ có **5 payload** ML cũng đánh dấu
- Nghĩa là có **1 payload** mà:
  - ModSecurity: **block** (chặn)
  - ML: **legit** (không đánh dấu là attack)
- → Có thể là **false positive** của ModSecurity, hoặc ML chưa học được pattern này

#### 3. Tổng hợp
```
ModSecurity chặn: 6
├─ Cùng chặn với ML: 5 ✅
└─ Chỉ ModSecurity chặn: 1 ⚠️ (ML không đồng ý)

ML đánh dấu attack: 7
├─ Cùng chặn với ModSecurity: 5 ✅
└─ Chỉ ML đánh dấu: 2 ✅ (ML phát hiện thêm)
```

---

## Ma trận kết quả

Dựa vào số liệu, ta có thể phân loại 20 payload như sau:

### Nhóm 1: Cả hai đều chặn (5 payload)
- ModSecurity: **block**
- ML: **attack**
- → **Đồng thuận cao**: Rất có khả năng là tấn công thật

### Nhóm 2: Chỉ ModSecurity chặn (1 payload)
- ModSecurity: **block**
- ML: **legit**
- → **Có thể là false positive** của ModSecurity, hoặc ML chưa học được

### Nhóm 3: Chỉ ML đánh dấu (2 payload)
- ModSecurity: **allow**
- ML: **attack**
- → **ML phát hiện thêm**: ML bù đắp cho ModSecurity

### Nhóm 4: Cả hai đều cho phép (12 payload)
- ModSecurity: **allow**
- ML: **legit**
- → **Đồng thuận**: Có thể là payload hợp lệ

**Tổng**: 5 + 1 + 2 + 12 = **20 payload** ✅

---

## Ý nghĩa thực tế

### 1. Độ chính xác
- **Cùng chặn = 5**: Cả hai hệ thống đồng ý về 5 payload là tấn công
- Tỉ lệ đồng thuận: 5/20 = **25%** (nếu chỉ tính payload tấn công)

### 2. Bù đắp lẫn nhau
- ModSecurity chặn 6, ML đánh dấu 7
- Tổng cộng: **6 + 7 - 5 = 8 payload** được ít nhất một hệ thống phát hiện
- → Kết hợp cả hai giúp **tăng độ phủ** phát hiện tấn công

### 3. False Positive/Negative
- **Chỉ ModSecurity chặn (1)**: Có thể là false positive của ModSecurity
- **Chỉ ML đánh dấu (2)**: Có thể là false positive của ML, hoặc ML phát hiện đúng

---

## Ví dụ cụ thể từ log

### Ví dụ 1: Cả hai đều chặn ✅
```json
Payload: "id=1 UNION SELECT username, password FROM users --"
ModSecurity: block (score 6.25)
ML: attack (100% confidence)
→ Cùng chặn
```

### Ví dụ 2: Chỉ ML đánh dấu
```json
Payload: "id=1 UNION SELECT 0x61646d696e,0x70617373776f7264"
ModSecurity: allow (score 3.125 - chưa đủ threshold)
ML: attack (100% confidence)
→ ML phát hiện thêm
```

### Ví dụ 3: Chỉ ModSecurity chặn
```json
Payload: "id=5' AND SLEEP(5)--"
ModSecurity: block (score 9.375)
ML: legit (20% attack probability)
→ ModSecurity chặn nhưng ML không đồng ý
```

### Ví dụ 4: Cả hai đều cho phép
```json
Payload: "username=alice&password=SuperSecure123"
ModSecurity: allow (score 0.0)
ML: legit (1.1% attack probability)
→ Payload hợp lệ
```

---

## Tóm tắt

| Số liệu | Ý nghĩa | Giá trị |
|---------|---------|---------|
| **Tổng payload** | Tổng số payload đã phân tích | 20 |
| **ModSecurity chặn** | Số payload ModSecurity quyết định block | 6 |
| **ML đánh dấu attack** | Số payload ML dự đoán là attack | 7 |
| **Cùng chặn** | Số payload cả hai đều chặn/đánh dấu | 5 |

### Phân tích
- **ML phát hiện nhiều hơn**: 7 > 6 (ML bù đắp cho ModSecurity)
- **Đồng thuận**: 5 payload cả hai đều đồng ý
- **Bất đồng**: 3 payload (1 chỉ ModSecurity, 2 chỉ ML)
- **Kết hợp hiệu quả**: Tổng 8 payload được ít nhất một hệ thống phát hiện

### Kết luận
Kết hợp ModSecurity và ML giúp:
1. **Tăng độ phủ**: Phát hiện nhiều tấn công hơn
2. **Giảm false negative**: ML bù đắp khi ModSecurity bỏ sót
3. **Xác thực chéo**: Đồng thuận giữa hai hệ thống tăng độ tin cậy

