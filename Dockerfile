FROM nvidia/cuda:12.4.1-cudnn-devel-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1
ENV LANG=C.UTF-8 LC_ALL=C.UTF-8

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    git git-lfs curl wget ffmpeg sox libsox-dev unzip build-essential \
    && apt-get clean && rm -rf /var/lib/apt/lists/* \
    && git lfs install

# Install Miniforge
RUN wget -q https://github.com/conda-forge/miniforge/releases/latest/download/Miniforge3-Linux-x86_64.sh -O /tmp/miniforge.sh \
    && bash /tmp/miniforge.sh -b -p /opt/conda \
    && rm /tmp/miniforge.sh
ENV PATH=/opt/conda/bin:$PATH

# Create conda environment with pynini
RUN conda create -n cosyvoice python=3.10 -y \
    && conda install -n cosyvoice -c conda-forge pynini==2.1.5 -y \
    && conda clean -afy

# Set conda env
ENV CONDA_DEFAULT_ENV=cosyvoice
ENV PATH=/opt/conda/envs/cosyvoice/bin:$PATH
SHELL ["conda", "run", "-n", "cosyvoice", "/bin/bash", "-c"]

WORKDIR /app

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    -i https://mirrors.aliyun.com/pypi/simple/ --trusted-host=mirrors.aliyun.com

# Install additional dependencies
RUN pip install --no-cache-dir fastmcp funasr "ruamel.yaml<0.18" \
    -i https://mirrors.aliyun.com/pypi/simple/ --trusted-host=mirrors.aliyun.com

# Copy application code (including third_party with Matcha-TTS)
COPY third_party third_party/
COPY cosyvoice cosyvoice/
COPY asset asset/
COPY static static/
COPY app.py mcp_server.py model.py ./

# Set Python path
ENV PYTHONPATH=/app:/app/third_party/Matcha-TTS

# Create data directories
RUN mkdir -p /data/input /data/output /app/pretrained_models

# Environment variables
# Mount model at runtime: -v /your/local/model:/app/pretrained_models/Fun-CosyVoice3-0.5B
ENV MODEL_DIR=pretrained_models/Fun-CosyVoice3-0.5B
ENV INPUT_DIR=/data/input
ENV OUTPUT_DIR=/data/output
ENV PORT=8188
ENV GPU_IDLE_TIMEOUT=600

EXPOSE 8188

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

CMD ["conda", "run", "--no-capture-output", "-n", "cosyvoice", "python", "app.py"]
