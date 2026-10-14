FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

WORKDIR /app

# Copy repository files
COPY . /app

# Expose server port
EXPOSE 8000

# Start DevOnboard server
CMD ["python3", "backend/app.py"]
