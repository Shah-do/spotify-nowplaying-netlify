FROM python:3.12-alpine
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY server.py /app/server.py
EXPOSE 8787
CMD ["python", "/app/server.py"]
