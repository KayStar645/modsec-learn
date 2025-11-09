"""
Script này tạo biểu đồ so sánh trực quan giữa trọng số mà các mô hình học máy
(huấn luyện với chuẩn phạt L1 và L2) gán cho từng luật CRS và trọng số đến từ
ModSecurity WAF.
"""

import toml
import os
import sys
import joblib
import matplotlib.pyplot as plt
import seaborn.objects as so
import numpy as np
import pandas as pd
import json
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from sklearn.preprocessing import minmax_scale


def analyze_weights(
    model_name,
    model_l1,
    model_l2,
    crs_ids,
    crs_weights,
    figure_path,
    legend_fontsize  = 18,
    axis_labels_size = 20,
    tick_labels_size = 18
):
    """
    Phân tích các trọng số được gán cho từng luật CRS giữa các mô hình học máy
    (chuẩn phạt L1/L2) và ModSecurity WAF, sau đó vẽ biểu đồ cột để đối chiếu.

    Tham số
    -------
    model_name: str
        Tên mô hình được hiển thị trên biểu đồ.
    model_l1: sklearn.linear_model
        Mô hình huấn luyện với chuẩn phạt L1 (thưa).
    model_l2: sklearn.linear_model
        Mô hình huấn luyện với chuẩn phạt L2 (trơn).
    crs_ids: list
        Danh sách mã số các luật CRS cần so sánh.
    crs_weights: dict
        Bảng ánh xạ từ mã luật CRS sang trọng số trong ModSecurity.
    figure_path: str
        Đường dẫn thư mục nơi sẽ lưu biểu đồ kết quả.
    legend_fontsize: int
        Cỡ chữ cho phần chú thích.
    axis_labels_size: int
        Cỡ chữ nhãn trục.
    tick_labels_size: int
        Cỡ chữ nhãn giá trị trên trục.
    """
    # Lấy trọng số tuyến tính từ hai mô hình học máy (cả hai đều trả về vector 1D)
    model_l1_weights = model_l1.coef_.flatten()
    model_l2_weights = model_l2.coef_.flatten()

    modsec_weights = np.array([int(crs_weights[rule]) for rule in crs_ids])
    # Chuẩn hoá trọng số của ModSecurity về cùng miền với trọng số mô hình học máy
    # (bằng cách nối thêm giá trị 0 để hàm minmax_scale luôn hoạt động đúng)
    modsec_weights = np.append(modsec_weights, 0) 
    modsec_weights = minmax_scale(
        modsec_weights, 
        feature_range = (0, model_l1_weights.max())
    )

    fig, axs = plt.subplots(1, 1)
    
    # Kiến tạo DataFrame chứa dữ liệu ở định dạng “dài” phục vụ seaborn
    df_plot = pd.DataFrame(
        {
            'rules': crs_ids * 3,
            'weight': modsec_weights.tolist()[:-1] + 
                      model_l1_weights.tolist() + 
                      model_l2_weights.tolist(),
            'type': ['ModSec'] * len(crs_ids) + 
                    [f'{model_name} - $\ell_1$'] * len(crs_ids) + 
                    [f'{model_name} - $\ell_2$'] * len(crs_ids)
        }
    )

    _ = so.Plot(
        df_plot, 
        x     = 'rules',
        y     = 'weight',
        color = 'type'
    ) \
        .add(so.Bar()) \
        .scale(color=['#aedc41', '#81b8ef', '#fe6d73']) \
        .on(axs) \
        .plot()
    
    legend = fig.legends.pop(0)

    axs.set_xticklabels(
        [rule[3:] for rule in crs_ids], 
        rotation      = 75,
        ha            = 'right',
        rotation_mode = 'anchor'
    )
    axs.legend(
        legend.legendHandles, 
        [t.get_text() for t in legend.texts], 
        loc      = 'lower right',
        fancybox = True,
        shadow   = False,
        fontsize = legend_fontsize
    )
    
    axs.set_xlabel('Luật CRS về SQLi', fontsize=axis_labels_size, labelpad=10)
    axs.set_ylabel('Trọng số', fontsize=axis_labels_size, labelpad=10)
    axs.set_xmargin(0.05)
    axs.set_ymargin(0.15)
    axs.xaxis.set_tick_params(labelsize=tick_labels_size)
    axs.yaxis.set_tick_params(labelsize=tick_labels_size)
    
    axs.grid(visible=True, axis='both', color='gray', linestyle='dotted')
    
    fig.set_size_inches(18, 8)
    fig.tight_layout()
    fig.savefig(
        os.path.join( 
            figure_path,
            '{}_weights_comp.pdf'.format(model_name.lower())
        ), 
        dpi         = 600,
        format      = 'pdf',
        bbox_inches = "tight"
    )


if __name__ == '__main__':
    settings         = toml.load('config.toml')
    crs_ids_path     = settings['crs_ids_path']
    crs_weiths_path  = settings['crs_weights_path']
    models_path      = settings['models_path']
    figures_path     = settings['figures_path']
    pl               = 4

    with open(crs_ids_path) as file:
        crs_ids = sorted(json.load(file)['rules_ids'])
    
    with open(crs_weiths_path) as file:
        weights = json.load(file)['weights']
    
    # Linear SVC: nạp hai biến thể chuẩn phạt L1/L2 để so sánh
    model_name = 'linear_svc_pl{}_l1.joblib'.format(pl)
    model_l1      = joblib.load(
        os.path.join(models_path, model_name)
    )
    model_name = 'linear_svc_pl{}_l2.joblib'.format(pl)
    model_l2      = joblib.load(
        os.path.join(models_path, model_name)
    )

    analyze_weights(
        'SVM',
        model_l1,
        model_l2,
        crs_ids,
        weights,
        figures_path
    )

    # Logistic Regression: lặp lại quy trình với mô hình hồi quy logistic
    model_name = 'log_reg_pl{}_l1.joblib'.format(pl)
    model_l1      = joblib.load(
        os.path.join(models_path, model_name)
    )
    model_name = 'log_reg_pl{}_l2.joblib'.format(pl)
    model_l2      = joblib.load(
        os.path.join(models_path, model_name)
    )

    analyze_weights(
        'LR',
        model_l1,
        model_l2,
        crs_ids,
        weights,
        figures_path
    )