import pandas as pd
import json


class DataLoader:
    """
    Lớp tiện ích để nạp dữ liệu từ hệ thống file và chuẩn hoá thành DataFrame.
    """
    def __init__(self, malicious_path, legitimate_path):
        """
        Khởi tạo lớp DataLoader.

        Tham số:
        ----------
            malicious_path: str
                Đường dẫn tới tệp chứa payload độc hại.
            legitimate_path: str
                Đường dẫn tới tệp chứa payload hợp lệ.
        """
        self._malicious_path  = malicious_path
        self._legitimate_path = legitimate_path

    
    def load_data(self):
        """
        Đọc dữ liệu từ các tệp JSON và trả về DataFrame gồm payload và nhãn.

        Trả về:
        --------
            pd.DataFrame
                Bảng dữ liệu gồm hai cột `payload` và `label`.
        """
        
        with open(self._legitimate_path, 'r') as file:
            legitimate_data= json.load(file)
        
        with open(self._malicious_path, 'r') as file:
            malicious_data = json.load(file)

        malicious_labels  = [1] * len(malicious_data)
        legitimate_labels = [0] * len(legitimate_data)
        combined_data     = malicious_data   + legitimate_data
        combined_labels   = malicious_labels + legitimate_labels

        # Hợp nhất payload và nhãn rồi chuyển thành DataFrame chuẩn cho các bước tiếp theo
        return pd.DataFrame({
            'payload': combined_data,
            'label': combined_labels
        })