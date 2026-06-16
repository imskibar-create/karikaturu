# ---- Build frontend ----
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Python backend ----
FROM python:3.12-slim
WORKDIR /app

# Install Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy built frontend static files
COPY --from=frontend-builder /app/dist/public ./dist/public

# Copy backend source
COPY server/ ./server/
COPY generate_image.py ./generate_image.py

# Serve static files from FastAPI too
RUN pip install --no-cache-dir aiofiles==24.1.0

EXPOSE 8000

CMD ["uvicorn", "server.caricature_server:app", "--host", "0.0.0.0", "--port", "8000"]
