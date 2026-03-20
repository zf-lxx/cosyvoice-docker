# CosyVoice 本地开发环境配置指南

> 基于实际踩坑总结，适用于 Ubuntu 22.04 + NVIDIA GPU + CUDA 12.x 环境

---

## 前置条件

- NVIDIA GPU（显存 8GB+），已安装驱动（CUDA 12.x）
- conda 已安装（推荐安装到 `/data/` 等大磁盘，避免占满根目录）
- `/data/` 目录有足够空间（模型 + 环境共约 20GB）

### 确认 conda 配置到大磁盘

`~/.condarc` 应包含：
```yaml
envs_dirs:
  - /data/anaconda3/envs
pkgs_dirs:
  - /data/anaconda3/pkgs
```

---

## Step 1：初始化 git submodule

```bash
cd /data/project-dev/cosyvoice-docker
git submodule update --init --recursive
```

> `third_party/Matcha-TTS` 是必须的依赖，不初始化会报 `No module named 'matcha'`。

---

## Step 2：创建 conda 环境

```bash
conda create -n cosyvoice python=3.10 -y
```

### 安装 pynini（必须用 conda，pip 装不了）

```bash
conda install -n cosyvoice -c conda-forge pynini==2.1.5 -y
```

---

## Step 3：安装 Python 依赖

**注意**：`requirements.txt` 里有版本冲突，不能直接 `pip install -r requirements.txt` 一次性装完，需要分组安装并固定版本。

### 3.1 安装 torch（需指定 CUDA 源）

```bash
conda run -n cosyvoice pip install torch==2.3.1 torchaudio==2.3.1 \
  --extra-index-url https://download.pytorch.org/whl/cu121 \
  -i https://mirrors.aliyun.com/pypi/simple/ \
  --trusted-host mirrors.aliyun.com
```

> **坑**：torch 和 torchaudio 必须版本一致，否则报 `undefined symbol: libtorchaudio.so`。

### 3.2 安装核心 Web 框架

```bash
conda run -n cosyvoice pip install \
  fastapi==0.115.6 uvicorn==0.30.0 pydantic==2.7.0 gradio==5.4.0 \
  -i https://mirrors.aliyun.com/pypi/simple/ --trusted-host mirrors.aliyun.com
```

> **坑**：`fastmcp` 与 `fastapi==0.115.6` 有依赖冲突，不要放在一起装。

### 3.3 安装 AI/ML 依赖

```bash
conda run -n cosyvoice pip install \
  accelerate==0.34.2 diffusers==0.29.0 \
  transformers==4.44.2 \
  librosa==0.10.2 soundfile==0.12.1 \
  omegaconf==2.3.0 hydra-core==1.3.2 conformer==0.3.2 \
  HyperPyYAML matplotlib==3.7.5 \
  -i https://mirrors.aliyun.com/pypi/simple/ --trusted-host mirrors.aliyun.com
```

> **坑1**：`transformers==4.51.x` 与 torch 2.3.1 不兼容，用 `4.44.2`。
> **坑2**：`matplotlib` 不在常规安装步骤里，但 Matcha-TTS 需要它。

### 3.4 安装 onnxruntime-gpu

```bash
conda run -n cosyvoice pip install onnxruntime-gpu==1.18.0 \
  --extra-index-url https://aiinfra.pkgs.visualstudio.com/PublicPackages/_packaging/onnxruntime-cuda-12/pypi/simple/ \
  -i https://mirrors.aliyun.com/pypi/simple/ --trusted-host mirrors.aliyun.com
```

### 3.5 固定 numpy 版本

```bash
conda run -n cosyvoice pip install numpy==1.26.4 \
  -i https://mirrors.aliyun.com/pypi/simple/ --trusted-host mirrors.aliyun.com
```

> **坑**：其他包（如 gradio）会自动升级 numpy 到 2.x，导致 onnxruntime 报 `NumPy 1.x compiled module cannot run in NumPy 2.x`，必须降回 1.26.4。

### 3.6 降级 setuptools（解决 lightning 兼容问题）

```bash
conda run -n cosyvoice pip install 'setuptools<72' \
  -i https://mirrors.aliyun.com/pypi/simple/ --trusted-host mirrors.aliyun.com
```

> **坑**：setuptools >= 72 移除了 `pkg_resources.declare_namespace`，导致 `lightning` 报 `No module named 'pkg_resources'`。

### 3.7 安装 openai-whisper

```bash
conda run -n cosyvoice pip install openai-whisper --no-build-isolation \
  -i https://mirrors.aliyun.com/pypi/simple/ --trusted-host mirrors.aliyun.com
```

> **坑**：直接装会构建失败，加 `--no-build-isolation` 解决。

### 3.8 安装其余依赖

```bash
conda run -n cosyvoice pip install \
  inflect==7.3.1 pyworld==0.3.4 x-transformers==2.11.24 \
  wetext==0.0.4 wget==3.2 pyarrow==18.1.0 \
  lightning==2.2.4 tensorboard==2.14.0 gdown==5.1.0 \
  grpcio==1.57.0 grpcio-tools==1.57.0 onnx==1.16.0 \
  rich==13.7.1 modelscope==1.20.0 funasr huggingface_hub \
  -i https://mirrors.aliyun.com/pypi/simple/ --trusted-host mirrors.aliyun.com
```

---

## Step 4：下载模型

模型下载到项目目录（在 `/data/` 磁盘，不占根目录）：

```bash
export HF_ENDPOINT=https://hf-mirror.com
conda run -n cosyvoice python -c "
from huggingface_hub import snapshot_download
snapshot_download(
    'FunAudioLLM/Fun-CosyVoice3-0.5B-2512',
    local_dir='pretrained_models/Fun-CosyVoice3-0.5B',
    resume_download=True
)
print('Done!')
"
```

> **坑**：hf-mirror.com 有时连接不稳定会中断，加 `resume_download=True` 支持断点续传，重新执行即可继续。

---

## Step 5：启动服务

```bash
cd /data/project-dev/cosyvoice-docker
export PYTHONPATH=$PWD:$PWD/third_party/Matcha-TTS
export MODEL_DIR=pretrained_models/Fun-CosyVoice3-0.5B

# 前台运行（开发调试）
conda run -n cosyvoice python app.py

# 后台运行
nohup conda run -n cosyvoice python app.py > /tmp/cosyvoice_app.log 2>&1 &
```

### 验证启动成功

```bash
curl http://localhost:8188/health
# 返回: {"status":"healthy","gpu":{"model_loaded":true,...}}
```

访问 Web UI：http://localhost:8188

---

## 坑点汇总

| 问题 | 原因 | 解决方法 |
|------|------|----------|
| `No module named 'pynini'` | pip 无法编译 | `conda install -c conda-forge pynini==2.1.5` |
| `libtorchaudio.so: undefined symbol` | torch/torchaudio 版本不匹配 | 同版本 `--force-reinstall` |
| `No module named 'pkg_resources'` | setuptools >= 72 移除了此模块 | `pip install 'setuptools<72'` |
| `NumPy 1.x compiled module cannot run in NumPy 2.x` | numpy 被升级到 2.x | `pip install numpy==1.26.4` |
| `torch.compiler.disable() unexpected keyword 'recursive'` | transformers 太新 | `pip install transformers==4.44.2` |
| `openai-whisper` 构建失败 | 缺少构建隔离 | 加 `--no-build-isolation` |
| `fastmcp` 与 `fastapi` 冲突 | 依赖版本冲突 | 分开安装，不要放一条命令 |
| `No module named 'matcha'` | submodule 未初始化 | `git submodule update --init --recursive` |
| HuggingFace 下载中断 | 网络不稳定 | 加 `resume_download=True`，重新执行即可续传 |
| 大文件撑爆根目录 | conda/pip 默认装到根目录 | 配置 `~/.condarc` 将 envs/pkgs 指向 `/data/` |

---

## 环境变量说明

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `8188` | 服务端口 |
| `MODEL_DIR` | `pretrained_models/Fun-CosyVoice3-0.5B` | 模型路径 |
| `GPU_IDLE_TIMEOUT` | `600` | GPU 空闲释放超时（秒） |
| `PYTHONPATH` | 需手动设置 | 必须包含项目根目录和 `third_party/Matcha-TTS` |
