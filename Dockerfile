FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 BASARI_WEB_MODE=1 WEB_DATA_ROOT=/data
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN mkdir -p /data
CMD ["sh","-c","streamlit run app.py --server.address=0.0.0.0 --server.port=${PORT:-8501} --server.headless=true --server.enableCORS=false --server.enableXsrfProtection=false"]
