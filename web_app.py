import os

# Web giriş noktası yalnızca web/üyelik katmanını açar.
# Asıl uygulama app.py'dir; masaüstü sisteminin ekranları ve iş mantığı değiştirilmez.
os.environ.setdefault("BASARI_WEB_MODE", "1")
os.environ.setdefault("WEB_DATA_ROOT", "/data")

import app  # noqa: F401,E402
