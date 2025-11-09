import numpy as np
import json
import os

from src.utils import type_check
from src.models import PyModSecurity


class ModSecurityFeaturesExtractor:
    """
    Lớp hỗ trợ trích xuất đặc trưng dựa trên ModSecurity WAF.
    """

    def __init__(
        self,
        crs_ids_path,
        crs_path,
        crs_threshold = 5.0,
        crs_pl        = 4,
        features_path = None,
    ):
        """
        Khởi tạo lớp ModSecurityFeaturesExtractor.
        
        Tham số:
        ----------
            crs_ids_path: str
                Đường dẫn tới tệp JSON chứa danh sách mã luật CRS.
            crs_path: str
                Đường dẫn tới thư mục chứa bộ luật ModSecurity CRS.
            crs_threshold: float
                Ngưỡng điểm để ModSecurity quyết định chặn.
            crs_pl: int
                Paranoia Level (mức nhạy) khi chạy ModSecurity.
            features_path: str
                Đường dẫn tệp sẽ lưu ma trận đặc trưng (tuỳ chọn).
        """
        type_check(crs_path, str, "crs_path")
        type_check(crs_threshold, float, "crs_threshold")
        type_check(crs_pl, int, "crs_pl")
        
        # Nếu cung cấp đường dẫn, nạp sẵn danh sách mã luật CRS để tiết kiệm thời gian
        if crs_ids_path is not None:
            self._load_crs_rules_ids(crs_ids_path)
        else:
            self._crs_ids = list() 

        self._crs_ids_path = crs_ids_path
        self._pymodsec     = PyModSecurity(
            crs_path,
            crs_threshold,
            crs_pl
        )
        self._features_path      = features_path


    def extract_features(self, data):
        """
        Trả về ma trận đặc trưng dựa trên các luật CRS cho bộ dữ liệu đầu vào.
        
        Tham số:
        ----------
            data: array-like of shape (n_samples,)
                DataFrame chứa payload và nhãn tương ứng.
        
        Trả về:
        --------
            X: np.ndarray 
                Ma trận đặc trưng theo luật OWASP CRS với kích thước (số_mẫu, số_luật).
            y: np.ndarray
                Vector nhãn tương ứng từng mẫu.
        """
        if len(self._crs_ids) == 0:
            raise ValueError(
                "Không tìm thấy mã luật CRS. Hãy trích xuất hoặc nạp trước danh sách mã luật."
            )

        num_rules = len(self._crs_ids)
        X         = np.zeros((data.shape[0], num_rules))
        y         = data['label']

        for idx, payload in enumerate(data['payload']):  
            # Gửi payload đi qua ModSecurity để thu thập các luật bị kích hoạt
            self._pymodsec._process_query(payload)
        
            for rule in self._pymodsec._get_triggered_rules():
                # Đánh dấu 1 cho những luật bị kích hoạt tại vị trí tương ứng
                X[idx, self._crs_ids.index(rule)] = 1.0

        if self._features_path is not None:
            self._save_features(X, self._features_path)

        return X, np.array(y)


    def extract_crs_ids(self, data):
        """
        Trích xuất toàn bộ mã luật CRS duy nhất xuất hiện trong bộ dữ liệu đầu vào.
        Nếu đã cung cấp `crs_ids_path`, danh sách sẽ được lưu xuống đĩa.

        Tham số:
        ----------
            data: pandas DataFrame
                Bộ dữ liệu nguồn để quét tìm các luật kích hoạt.
        """    
        payloads = data.drop('label', axis=1)['payload']

        new_crs_ids = set()
        for payload in payloads:
            self._pymodsec._process_query(payload)
            triggered_rules = self._pymodsec._get_triggered_rules()
            new_crs_ids.update(triggered_rules)

        # Hợp nhất danh sách mã luật mới với danh sách sẵn có
        self._crs_ids = sorted(list(new_crs_ids.union(set(self._crs_ids))))

        if self._crs_ids_path is not None:
            self._save_crs_rules_ids()


    def _save_features(self, X, features_path):
        """
        Lưu ma trận đặc trưng xuống tệp nhị phân định dạng NumPy.

        Tham số:
        ----------
            X: np.ndarray
                Ma trận đặc trưng cần lưu.
            features_path: str
                Đường dẫn tệp đích.
        """
        np.save(features_path, X, allow_pickle=True)


    def _save_crs_rules_ids(self):
        """
        Lưu danh sách mã luật CRS vào tệp JSON.
        """
        
        data = {"rules_ids": self._crs_ids}
        
        with open(self._crs_ids_path, 'w') as file:
            json.dump(data, file, indent=4)


    def _load_crs_rules_ids(self, path):
        """
        Nạp danh sách mã luật CRS từ tệp JSON.

        Tham số:
        ----------
            crs_path: str
                Đường dẫn tới tệp JSON chứa danh sách mã luật CRS.
        """
        if os.path.exists(path):
            with open(path, 'r') as file:
                self._crs_ids = json.load(file)['rules_ids']
        else:
            self._crs_ids = list()