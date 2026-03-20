# CosyVoice All-in-One Docker

基于 Fun-CosyVoice3-0.5B 的一站式语音合成服务，支持 Web UI、REST API 和 MCP 接口。

## 🚀 快速开始

```bash
docker pull neosun/cosyvoice:v3.4.0

docker run -d \
  --name cosyvoice \
  --gpus '"device=0"' \
  -p 8188:8188 \
  -v /tmp/cosyvoice/voices:/data/voices \
  neosun/cosyvoice:v3.4.0
```

## ✨ 特性

- **Fun-CosyVoice3-0.5B** - 最新最优 TTS 模型
- **Fun-ASR-Nano** - 自动语音识别 (替代 Whisper)
- **OpenAI 兼容 API** - `/v1/audio/speech`
- **自定义音色管理** - 上传一次，ID 调用
- **真正的流式输出** - PCM chunk-by-chunk
- **Embedding 缓存** - 首 Token 延迟降低 53%
- **启动预热** - 自动缓存所有已保存音色
- **Web UI** - 流式默认、下载按钮、计时器

## 📊 性能基准测试

### 首 Token 延迟 (TTFB)

测试环境：NVIDIA L40S GPU

| 文本长度 | 首Token延迟 | 总时间 | 音频时长 | RTF |
|---------|------------|--------|---------|-----|
| 短文本(4字) | **1.20s** | 1.55s | 1.88s | 0.82x |
| 短文本(10字) | **1.34s** | 1.75s | 2.28s | 0.77x |
| 中文本(30字) | **1.24s** | 4.98s | 6.88s | 0.72x |
| 中文本(50字) | **1.27s** | 12.52s | 17.12s | 0.73x |
| 长文本(80字) | **1.24s** | 17.91s | 23.68s | 0.76x |
| 长文本(120字) | **1.35s** | 19.08s | 25.32s | 0.75x |

> RTF (Real-Time Factor) < 1.0 表示生成速度快于播放速度

### Embedding 缓存效果

| 场景 | 首Token延迟 | 说明 |
|------|------------|------|
| 首次使用音色 | ~3.5s | 提取特征 + 缓存到 GPU |
| 缓存命中 | **~1.2s** | 直接使用缓存 |
| **提升** | **-53%** | |

## 📡 API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/v1/audio/speech` | POST | 语音合成 (OpenAI 兼容) |
| `/v1/voices/create` | POST | 创建自定义音色 (支持自动转写) |
| `/v1/voices/custom` | GET | 列出自定义音色 |
| `/v1/voices/{id}` | GET | 获取音色详情 |
| `/v1/voices/{id}` | DELETE | 删除音色 |
| `/v1/models` | GET | 列出模型 |
| `/health` | GET | 健康检查 |
| `/docs` | GET | Swagger 文档 |

## 🎤 使用示例

### 1. 创建自定义音色

```bash
# 提供文本
curl -X POST https://cosyvoice.aws.xin/v1/voices/create \
  -F "audio=@voice.wav" \
  -F "name=我的音色" \
  -F "text=音频对应的文本"

# 自动转写 (使用 Fun-ASR-Nano)
curl -X POST https://cosyvoice.aws.xin/v1/voices/create \
  -F "audio=@voice.wav" \
  -F "name=我的音色"

# 返回: {"voice_id": "5764b8575f7f", "text": "自动识别的文本", ...}
```

### 2. 使用音色生成语音

```bash
# WAV 格式
curl -s https://cosyvoice.aws.xin/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{"input": "你好世界", "voice": "5764b8575f7f"}' \
  -o output.wav

# PCM 流式 (最低延迟)
curl -s https://cosyvoice.aws.xin/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{"input": "你好世界", "voice": "5764b8575f7f", "response_format": "pcm"}' \
  -o output.pcm

# PCM 转 WAV
ffmpeg -f s16le -ar 24000 -ac 1 -i output.pcm output.wav
```

### 3. 流式播放

```bash
curl -s https://cosyvoice.aws.xin/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{"input": "你好世界", "voice": "5764b8575f7f"}' \
  | ffplay -autoexit -nodisp -
```

## 🗣️ 支持语言

### TTS (Fun-CosyVoice3)
- **主要语言**: 中文、英文、日语、韩语
- **欧洲语言**: 德语、西班牙语、法语、意大利语、俄语
- **中文方言**: 广东话、四川话、东北话、上海话、闽南语等 18+ 种

### ASR (Fun-ASR-Nano)
- **支持语言**: 中文、英文、日语 + 自动检测
- **中文方言**: 7 大方言 + 26 种地方口音
- **特性**: 高噪声识别、歌词识别

## 🐳 Docker 配置

### docker-compose.yml

```yaml
services:
  cosyvoice:
    image: neosun/cosyvoice:v3.4.0
    container_name: cosyvoice
    restart: unless-stopped
    ports:
      - "8188:8188"
    volumes:
      - ./voices:/data/voices
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              device_ids: ["0"]
              capabilities: [gpu]
```

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `MODEL_DIR` | `pretrained_models/Fun-CosyVoice3-0.5B` | TTS 模型路径 |
| `PORT` | `8188` | 服务端口 |

## 🎨 Web UI 功能

- **流式输出默认开启** - 低延迟体验
- **计时器显示** - 首包延迟 | 总耗时 | 音频时长
- **下载按钮** - 生成完成后可下载 WAV
- **主题切换** - 深色/浅色主题
- **多语言** - 中文/英文/日文界面

## 📦 版本历史

| 版本 | 日期 | 更新内容 |
|------|------|---------|
| v3.4.0 | 2024-12-18 | Fun-ASR-Nano 替代 Whisper |
| v3.3.0 | 2024-12-18 | UI 改进: 流式默认、下载按钮、计时器 |
| v3.2.1 | 2024-12-18 | 启动时自动预热所有音色 |
| v3.2.0 | 2024-12-18 | Embedding 缓存 (-53% TTFB) |
| v3.1.0 | 2024-12-18 | 轮询优化 + 模型预热 |
| v3.0.0 | 2024-12-18 | All-in-One 基础版 |

## 🔗 相关链接

- **Web UI**: https://cosyvoice.aws.xin
- **API 文档**: https://cosyvoice.aws.xin/docs
- **Docker Hub**: https://hub.docker.com/r/neosun/cosyvoice
- **TTS 模型**: [Fun-CosyVoice3-0.5B](https://huggingface.co/FunAudioLLM/Fun-CosyVoice3-0.5B-2512)
- **ASR 模型**: [Fun-ASR-Nano-2512](https://huggingface.co/FunAudioLLM/Fun-ASR-Nano-2512)

## 📄 License

Apache License 2.0
