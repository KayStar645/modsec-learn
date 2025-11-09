"""
Script này trích xuất danh sách mã luật (ID) từ bộ luật OWASP ModSecurity Core
Rule Set (CRS) và lưu kết quả vào một tệp JSON để tái sử dụng.
"""

import os
import toml
import sys
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from src.data_loader import DataLoader
from src.extractor import ModSecurityFeaturesExtractor


if __name__ == '__main__':
    settings        = toml.load('config.toml')
    dataset_path    = settings['dataset_path']
    crs_dir         = settings['crs_dir']
    crs_ids_path    = settings['crs_ids_path']
    legitimate_path = settings['legitimate_path']
    malicious_path  = settings['malicious_path']

    # GIAI ĐOẠN NẠP DỮ LIỆU
    print('[INFO] Đang nạp bộ dữ liệu...')

    loader = DataLoader(
        legitimate_path = legitimate_path,
        malicious_path  = malicious_path,
    )     

    data = loader.load_data()   

    # GIAI ĐOẠN TRÍCH XUẤT MÃ LUẬT CRS
    print('[INFO] Đang trích xuất mã luật CRS...')

    extractor = ModSecurityFeaturesExtractor(
        crs_ids_path = crs_ids_path,
        crs_path     = crs_dir,
    )

    extractor.extract_crs_ids(data)