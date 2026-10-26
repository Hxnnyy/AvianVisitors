FROM python:3.11-slim AS system
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM system AS export
RUN pip install --no-cache-dir torch==2.14.1 torchvision==0.29.1 --index-url https://download.pytorch.org/whl/cpu
COPY services/inference/requirements.txt ./
RUN pip install --no-compile --no-cache-dir -r requirements.txt
RUN pip install --no-compile --no-cache-dir onnxruntime==1.31.1 onnx==1.23.2
COPY services/inference/download_models.py ./
RUN python download_models.py
COPY services/inference/export_photo.py services/inference/model-checksums.json ./
COPY services/inference/tests/fixtures/robin.jpg ./tests/fixtures/robin.jpg
ENV OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1
RUN python export_photo.py

FROM system AS runtime
COPY services/inference/requirements-runtime.txt ./
RUN pip install --no-compile --no-cache-dir -r requirements-runtime.txt
COPY --from=export /app/models/photo-classifier.onnx /app/models/bird-detector.onnx /app/models/photo-runtime.json ./models/
COPY model/BirdNET_GLOBAL_6K_V2.4_Model_FP16.tflite model/BirdNET_GLOBAL_6K_V2.4_MData_Model_V2_FP16.tflite model/BirdNET_GLOBAL_6K_V2.4_Model_FP16_Labels.txt /models/
COPY model/l18n/labels_en.json /models/l18n/labels_en.json
COPY ["tests/testdata/Pica pica_30s.wav", "/fixtures/Pica pica_30s.wav"]
COPY services/inference/ ./
ENV ENVIRONMENT=production BIRDNET_MODELS=/models OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1
RUN python -c "import importlib.util; assert importlib.util.find_spec('torch') is None; assert importlib.util.find_spec('birder') is None" && python -m pytest -q
RUN useradd --uid 10001 --create-home inference && chown -R inference /app
USER inference
EXPOSE 8081
CMD ["uvicorn", "service:app", "--host", "0.0.0.0", "--port", "8081", "--workers", "1", "--limit-concurrency", "4", "--no-proxy-headers"]
