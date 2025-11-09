"""
Script này xây dựng bộ dữ liệu huấn luyện/kiểm thử gồm 25.000 payload độc hại
và 25.000 payload hợp lệ. Tập dữ liệu được chia theo tỷ lệ 80% huấn luyện và
20% kiểm thử, sử dụng nguồn dữ liệu gốc tại:
https://github.com/christianscano/modsec-test-dataset/
"""

import os
import toml
import sys
import json
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from src.data_loader import DataLoader
from sklearn.utils import shuffle
from sklearn.model_selection import train_test_split


if __name__ == '__main__':
    settings        = toml.load('config.toml')
    crs_dir         = settings['crs_dir']
    crs_ids_path    = settings['crs_ids_path']
    malicious_path  = settings['malicious_path']
    legitimate_path = settings['legitimate_path']

    # Tạo bộ nạp dữ liệu với đường dẫn tương ứng cho payload hợp lệ và độc hại
    loader = DataLoader(
        legitimate_path = legitimate_path,
        malicious_path  = malicious_path,
    )    
    
    df = loader.load_data()

    # Xáo trộn và trích ra 25.000 mẫu mỗi lớp để đảm bảo cân bằng
    legitimate_data = shuffle(
        df[df['label'] == 0],
        random_state = 77,
        n_samples    = 25_000
    )
    malicious_data  = shuffle(
        df[df['label'] == 1],
        random_state = 77,
        n_samples    = 25_000
    )

    # CHIA TẬP DỮ LIỆU HỢP LỆ (80% - 20%)
    xtr, xts, _, _ = train_test_split(
        legitimate_data['payload'],
        legitimate_data['label'],
        test_size    = 0.2,
        random_state = 77,
        shuffle      = True
    )

    # Lưu dữ liệu hợp lệ đã chia thành hai tệp JSON riêng biệt
    with open('data/dataset/legitimate_train.json', 'w') as file:
        json.dump(xtr.tolist(), file, indent=4)

    with open('data/dataset/legitimate_test.json', 'w') as file:
        json.dump(xts.tolist(), file, indent=4)

    # CHIA TẬP DỮ LIỆU ĐỘC HẠI (80% - 20%)
    xtr, xts, _, _ = train_test_split(
        malicious_data['payload'],
        malicious_data['label'],
        test_size    = 0.2,
        random_state = 77,
        shuffle      = True
    )

    # Lưu dữ liệu độc hại đã chia thành hai tệp JSON tương ứng
    with open('data/dataset/malicious_train.json', 'w') as file:
        json.dump(xtr.tolist(), file, indent=4)

    with open('data/dataset/malicious_test.json', 'w') as file:
        json.dump(xts.tolist(), file, indent=4)