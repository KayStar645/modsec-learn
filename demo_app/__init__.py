"""
Khởi tạo ứng dụng web demo cho dự án modsec-learn.
"""

from flask import Flask

from demo_app.engine import DetectionEngine
from demo_app.routes import register_routes


def create_app() -> Flask:
    """
    Tạo Flask app với các route đã cấu hình sẵn.
    """
    app = Flask(
        __name__,
        template_folder="templates",
        static_folder="static",
    )

    engine = DetectionEngine()
    register_routes(app, engine)
    return app


__all__ = ["create_app"]

