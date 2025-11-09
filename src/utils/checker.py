def type_check(object_to_check, type_to_check, param_name):
    """
    Kiểm tra xem `object_to_check` có thuộc kiểu `type_to_check` hay không.

    Tham số:
    ----------
        object_to_check: object
            Đối tượng cần kiểm tra.
        type_to_check: type
            Kiểu yêu cầu đối tượng phải tuân theo.
        param_name: str
            Tên tham số để đưa vào thông báo lỗi.

    Ngoại lệ:
    -------
        TypeError: 
            nếu `object_to_check` không phải kiểu yêu cầu.
    """
    if not isinstance(object_to_check, type_to_check):
        raise TypeError(
            "{} is not {} but {}".format(
                param_name, type_to_check, type(object_to_check)
            )
        )