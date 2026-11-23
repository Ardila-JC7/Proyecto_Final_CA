
FROM python:3.12-slim

WORKDIR /app

# Instalar dependencias
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar los componentes del proyecto
COPY app/ ./app/
COPY frontend/ ./frontend/
COPY models/ ./models/

# Puerto de la aplicación
EXPOSE 8000

# Iniciar FastAPI
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]