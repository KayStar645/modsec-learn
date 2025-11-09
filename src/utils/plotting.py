import numpy as np

from sklearn.metrics import roc_curve, roc_auc_score


def update_roc(fpr, tpr):
    """
    Cập nhật lại các giá trị ROC (FPR, TPR) khi matplotlib không nội suy chính xác,
    chủ yếu xảy ra với ModSecurity ở Paranoia Level 1.
    
    Tham số
    ----------
    fpr: list
        Danh sách giá trị False Positive Rate.
    tpr: list
        Danh sách giá trị True Positive Rate.

    Trả về
    -------
    fpr_values: np.array
        Mảng FPR đã hiệu chỉnh.
    
    tpr_values: np.array
        Mảng TPR đã hiệu chỉnh.
    """
    highest_tpr = 0.
    start_idx   = 0
        
    for fpr_i, tpr_i in zip(fpr, tpr):
        if fpr_i <= 0:
            start_idx += 1
            highest_tpr = tpr_i
        else:
            break
    
    fpr_values = [1e-6]
    tpr_values = [highest_tpr]
    
    for idx in range(start_idx, len(fpr)):
        fpr_values.extend([fpr[idx], fpr[idx]])
        tpr_values.extend([tpr[idx-1], tpr[idx]])

    return np.array(fpr_values), np.array(tpr_values)


def plot_roc(
    y_true, 
    y_scores,
    label_legend, 
    ax,
    settings           = None,
    plot_rand_guessing = True,
    log_scale          = False,
    legend_settings    = None,
    update_roc_values  = False,
    include_zoom       = False,
    zoom_axs           = None,
    pl                 = None
):   
    """
    Vẽ đường cong ROC cho một mô hình cụ thể.

    Tham số
    ----------
    y_true: np.array
        Nhãn thực tế.
    y_scores: np.array
        Điểm dự đoán hoặc xác suất.
    label_legend: str
        Nhãn hiển thị trong chú thích.
    ax: matplotlib.axes.Axes
        Trục matplotlib để vẽ ROC.
    settings: dict
        Thiết lập thêm cho đường cong.
    plot_rand_guessing: bool
        Có vẽ đường tham chiếu đoán ngẫu nhiên hay không.
    log_scale: bool
        Có dùng thang log cho trục x hay không.
    legend_settings: dict
        Thiết lập chú thích tuỳ chỉnh.
    update_roc_values: bool
        Có cần điều chỉnh lại các điểm ROC hay không (chỉ dùng cho ModSecurity PL1).
    include_zoom: bool
        Có vẽ thêm vùng thu phóng hay không.
    zoom_axs: dict
        Bộ nhớ tạm để tái sử dụng trục thu phóng.
    pl: int
        Paranoia Level tương ứng (dùng đặt nhãn và vùng zoom).
    """
    # Tính AUC cục bộ (1%) để đảm bảo dữ liệu ROC hợp lệ
    _ = roc_auc_score(y_true, y_scores, max_fpr=0.01)
    fpr, tpr, _ = roc_curve(y_true, y_scores)
    
    # Điều chỉnh lại đường cong nếu matplotlib không vẽ được đoạn đầu
    if update_roc_values:
        fpr, tpr = update_roc(fpr, tpr)
    
    # Cấu hình chung cho biểu đồ ROC
    if log_scale:
        ax.set_xscale('log')
    else:
        ax.set_xlim([-0.05, 1.05])
    
    if legend_settings is not None:
        ax.legend(**legend_settings)

    ax.set_ylim([0.45, 1.05])
    ax.set_xlabel("False Positive Rate (FPR)", fontsize=16, labelpad=10)
    ax.set_ylabel("True Positive Rate (TPR)", fontsize=16, labelpad=10)
    ax.grid(True)

    # Vẽ đường chẩn đoán đoán ngẫu nhiên
    if plot_rand_guessing:
        ax.plot([0, 1], [0, 1], color="navy", lw=2, linestyle="--")

    # Vẽ đường ROC chính
    if settings is not None and isinstance(settings, dict):
        ax.plot(fpr, tpr, **settings, label=label_legend)
    else:
        ax.plot(fpr, tpr, label=label_legend)
    
    # Nếu cần, thêm vùng thu phóng để xem chi tiết FPR rất nhỏ
    if include_zoom:
        if pl not in zoom_axs:
            zoom_axs[pl] = ax.inset_axes(
                [0.5, 0.1, 0.3, 0.3], 
                xticklabels = [], 
                yticklabels = []
            )
         
        if pl == 1:
            zoom_axs[pl].set_xlim([3e-4, 2e-3])
            zoom_axs[pl].set_ylim([0.85, 0.96])
        else:    
            zoom_axs[pl].set_xlim([5e-4, 1e-3]) 
            zoom_axs[pl].set_ylim([0.95, 1.00]) 
      
        zoom_axs[pl].plot(fpr, tpr, **settings)
        
        ax.indicate_inset_zoom(zoom_axs[pl], edgecolor="grey")