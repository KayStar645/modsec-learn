class NotSklearnModelError(Exception):
    """Ngoại lệ ném ra khi đối tượng không phải là mô hình của sklearn."""

    def __init__(self, *args, **kwargs):
        return super().__init__(*args, **kwargs)


class SklearnInternalError(Exception):
    """Ngoại lệ dùng để bao bọc lỗi nội bộ phát sinh từ sklearn."""

    def __init__(self, *args, **kwargs):
        return super().__init__(*args, **kwargs)


class ModelNotLoadedError(Exception):
    """Ngoại lệ báo hiệu mô hình chưa được nạp mà đã được sử dụng."""

    def __init__(self, *args, **kwargs):
        return super().__init__(*args, **kwargs)


class UnknownModelError(Exception):
    """Ngoại lệ được dùng khi nhận dạng mô hình không thuộc danh sách hỗ trợ."""

    def __init__(self, *args, **kwargs):
        return super().__init__(*args, **kwargs)