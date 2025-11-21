"""
Lớp bao bọc ModSecurity CRS WAF để thao tác từ Python.
"""

import os
import numpy as np
import re

from src.utils import type_check
from urllib.parse import quote_plus
from ModSecurity import ModSecurity, RulesSet, Transaction, LogProperty


class PyModSecurity():
    """Lớp bao bọc tiện dụng cho ModSecurity CRS WAF."""

    _BAD_STATUS_CODES = [401, 403]
    _GOOD_STATUS_CODES = list(range(200, 209))
    _SELECTED_RULES_FILES = [
        'REQUEST-901-INITIALIZATION.conf',
        'REQUEST-942-APPLICATION-ATTACK-SQLI.conf'
    ]

    def __init__(
            self,
            rules_dir,
            threshold   = 5.0,
            pl          = 4,
            output_type = 'score',
            debug       = False
        ):
        """
        Hàm khởi tạo lớp PyModSecurity.
        
        Tham số
        ---------
            rules_dir: str
                Đường dẫn tới thư mục chứa các luật CRS cần nạp.
            threshold: float
                Ngưỡng điểm ModSecurity dùng để quyết định chặn yêu cầu.
            pl: int from 1 to 4
                Paranoia Level (1-4) để xác định độ nhạy khi kích hoạt luật.
            output_type: str
                Kiểu đầu ra mong muốn: 'binary' (0/1) hoặc 'score' (điểm).
        """
        type_check(rules_dir, str, 'rules_dir')
        type_check(threshold, float, 'threshold')
        type_check(pl, int, 'pl'),
        type_check(output_type, str, 'output_type')

        # Kiểm tra tính hợp lệ của Paranoia Level
        if not 1 <= pl <= 4:
            raise ValueError(
                "Giá trị pl không hợp lệ: {}. Chỉ chấp nhận các giá trị [1, 2, 3, 4]"
                    .format(pl)
            )
        
        # Kiểm tra giá trị tham số output_type
        if output_type not in ['binary', 'score']:
            raise ValueError(
                "Giá trị output_type không hợp lệ: {}. Chỉ chấp nhận ['binary', 'score']"
                    .format(output_type)
            )
        
        self._output_type           = output_type
        self._modsec                = ModSecurity()
        self._rules                 = RulesSet()
        self._rules_logger_callback = None
        self._threshold             = threshold
        self._debug                 = debug

        # Nạp các tệp cấu hình nền tảng của ModSecurity CRS
        for conf_file in ['modsecurity.conf', f'crs-setup-pl{pl}.conf']:
            config_path = os.path.join('./modsec_config', conf_file)
            assert os.path.isfile(config_path)
            self._rules.loadFromUri(config_path)
    
        # Nạp các tệp luật cụ thể sẽ dùng để trích xuất đặc trưng
        for filename in PyModSecurity._SELECTED_RULES_FILES:
            rule_path = os.path.join(os.path.abspath(rules_dir), filename)
            assert os.path.isfile(rule_path)
            self._rules.loadFromUri(rule_path)

        if self._debug:
            print("[INFO] Sử dụng ModSecurity CRS với PL = {} và ngưỡng = {}"
                    .format(pl, threshold)
            )


    def _process_query(self, payload: str):
        """
        Đưa payload vào bộ máy ModSecurity CRS để đánh giá.

        Tham số:
        ----------
            payload: str
                Payload cần kiểm tra. 
        """
        # Tạo logger thu thập luật bị kích hoạt trong lần đánh giá này
        rules_logger_cb = RulesLogger(
            threshold=self._threshold,
            debug=self._debug
        )
        # Gắn hàm callback để ModSecurity ghi nhận lại luật vi phạm
        self._modsec.setServerLogCb2(
            rules_logger_cb, 
            LogProperty.RuleMessageLogProperty,
        )

        self._rules_logger_cb = rules_logger_cb

        # Chuẩn hoá payload thành dạng URL-encoded để ModSecurity xử lý thống nhất
        payload = quote_plus(payload)
        
        # Tạo transaction và đưa các bước xử lý chuẩn của ModSecurity
        transaction = Transaction(self._modsec, self._rules)
        transaction.processURI(
            "http://127.0.0.1/test?{}".format(payload), 
            "GET", 
            "HTTP/1.1"
        )
        transaction.processRequestHeaders()
        transaction.processRequestBody()

    
    def _process_response(self) -> float:
        """
        Xử lý phản hồi sau khi ModSecurity đánh giá payload.

        Trả về:
        --------
            score: float
                Điểm ModSecurity nếu chọn `score`. Với `binary`, trả về 0.0 khi
                yêu cầu an toàn và 1.0 khi bị chặn.
        """
        if self._rules_logger_cb is not None:
            if self._output_type == 'binary':
                if self._rules_logger_cb.get_status() in __class__._BAD_STATUS_CODES:
                    return 1.0
                else:
                    return 0.0
            elif self._output_type == 'score':
                return self._rules_logger_cb.get_score()
        else:
            raise SystemExit("Callback thu thập luật chưa được khởi tạo")


    def predict(self, X):
        """
        Dự đoán kết quả cho danh sách payload. Trả về nhãn nhị phân hoặc điểm số
        tuỳ theo cấu hình `output_type`.

        Tham số:
        ----------
            X: array-like of shape (n_samples,)
                Tập mẫu đầu vào cần đánh giá.

        Trả về
        -------
            y_pred : ndarray of shape (n_samples,)
                Vector chứa nhãn hoặc điểm tương ứng từng payload.
        """
        def process_and_get_prediction(x):
            self._process_query(x)
            return self._process_response()

        if isinstance(X, list) or len(X.shape) == 1:
            scores = np.array([process_and_get_prediction(x) for x in X])
        else:
            raise ValueError(
            "Dữ liệu đầu vào không hợp lệ. Yêu cầu danh sách hoặc mảng 1 chiều, nhận được mảng {} chiều"
                .format(len(X.shape))
            )
        
        return scores

    def _get_triggered_rules(self):
        """
        Lấy danh sách các mã luật đã bị kích hoạt trong lần xử lý gần nhất.

        Trả về:
        --------
            list
                Danh sách mã luật dạng chuỗi.
        """
        return self._rules_logger_cb.get_triggered_rules()

    def _get_triggered_rules_details(self):
        """
        Lấy danh sách chi tiết các luật đã bị kích hoạt.

        Returns
        -------
            list
                Danh sách dict chứa thông tin chi tiết từng luật.
        """
        return self._rules_logger_cb.get_triggered_rules_details()
    

class RulesLogger:
    _SEVERITY_SCORE = {
            2: 5,   # NGHIÊM TRỌNG (CRITICAL)
            3: 4,   # LỖI (ERROR)
            4: 3,   # CẢNH BÁO (WARNING)
            5: 2    # THÔNG BÁO (NOTICE)
        }
    _SEVERITY_LABEL = {
        0: "EMERGENCY",
        1: "ALERT",
        2: "CRITICAL",
        3: "ERROR",
        4: "WARNING",
        5: "NOTICE",
        6: "INFO",
        7: "DEBUG",
    }
    
    def _severity2score(self, severity):
        """
        Chuyển đổi mức độ nghiêm trọng của luật sang điểm tương ứng.

        Tham số:
        ----------
            severity: int
                Mức độ nghiêm trọng (severity) mà ModSecurity trả về.
        
        Trả về:
        --------
            score: float
                Điểm tương ứng mức độ nghiêm trọng.
        """
        return self._SEVERITY_SCORE.get(severity, 1)
    

    def __init__(self, threshold=5.0, regex_rules_filter=None, debug=False):
        """
        Khởi tạo RulesLogger để thu thập các luật bị kích hoạt.

        Tham số:
        ----------
            threshold: float
                Ngưỡng điểm để chuyển sang trạng thái chặn.
            regex_rules_filter: str
                Mẫu regex lọc mã luật quan tâm.
            debug: bool
                Bật debug để in chi tiết từng luật.
        """
        self._rules_triggered = []
        self._debug           = debug
        self._rules_filter    = re.compile(regex_rules_filter) if regex_rules_filter is not None \
                                    else re.compile('^.*')
        self._score           = 0.0
        self._threshold       = threshold
        self._status          = 200
        self._rules_details   = {}


    def __call__(self, data, rule_message):
        """
        Hàm callback được ModSecurity gọi khi có luật bị kích hoạt.

        Tham số:
        ----------
            data: object
                Dữ liệu thêm từ ModSecurity (không sử dụng).
            rule_message: object
                Thông tin chi tiết về luật vừa kích hoạt.
        """
        if self._debug:
            print('[DEBUG] Callback ghi nhận luật trong PyModSecurity')
            print("[DEBUG] ID: {}, Thông điệp: {}, Pha: {}, Mức độ: {}".format(
                rule_message.m_ruleId, 
                rule_message.m_message, 
                rule_message.m_phase,
                rule_message.m_severity
            ))
 
        rule_id = str(rule_message.m_ruleId)
        if re.match(self._rules_filter, rule_id):
            if rule_id not in self._rules_triggered:
                self._rules_triggered.append(rule_id)
            if rule_id not in self._rules_details:
                self._rules_details[rule_id] = {
                    "id": rule_id,
                    "message": getattr(rule_message, "m_message", "") or "",
                    "data": getattr(rule_message, "m_data", "") or "",
                    "phase": getattr(rule_message, "m_phase", None),
                    "severity": getattr(rule_message, "m_severity", None),
                    "severity_label": self._SEVERITY_LABEL.get(
                        getattr(rule_message, "m_severity", None),
                        "UNKNOWN",
                    ),
                }

        # Cộng dồn điểm cảnh báo dựa trên mức độ nghiêm trọng
        self._score += self._severity2score(rule_message.m_severity)
        
        if self._score >= self._threshold:
            self._status = 403


    def get_triggered_rules(self):
        """
        Trả về danh sách mã luật đã ghi nhận.
        
        Trả về:
        --------
            rules: list
                Danh sách mã luật bị kích hoạt.
        """
        return self._rules_triggered

    def get_triggered_rules_details(self):
        """
        Trả về danh sách chi tiết các luật đã ghi nhận.

        Returns
        -------
            list
                Danh sách dict chứa id, message, severity, phase...
        """
        return [
            self._rules_details[rule_id]
            for rule_id in self._rules_triggered
            if rule_id in self._rules_details
        ]


    def get_score(self):
        """
        Lấy tổng điểm tích luỹ của yêu cầu hiện tại.
        
        Trả về:
        --------
            score: float
                Điểm ModSecurity tính được.
        """
        return self._score
    
    def get_status(self):
        """
        Lấy trạng thái HTTP hiện tại tương ứng với quyết định của ModSecurity.

        Trả về:
        --------
            request_status: int
                Mã trạng thái HTTP (200 nếu an toàn, 403 nếu bị chặn).
        """
        return self._status