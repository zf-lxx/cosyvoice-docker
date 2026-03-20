# CosyVoice API 使用指南

## 🎯 快速开始

### 基础语音合成
```bash
# 使用自定义音色生成 WAV
curl -s https://cosyvoice.aws.xin/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{"input": "你好世界", "voice": "YOUR_VOICE_ID"}' \
  -o output.wav

# 生成并直接播放（Linux）
curl -s https://cosyvoice.aws.xin/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{"input": "你好世界", "voice": "YOUR_VOICE_ID"}' \
  | ffplay -autoexit -nodisp -
```

## 📡 API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/v1/audio/speech` | POST | 语音合成（支持流式） |
| `/v1/voices/create` | POST | 上传音频创建自定义音色 |
| `/v1/voices/custom` | GET | 列出所有自定义音色 |
| `/v1/voices/{voice_id}` | GET | 获取音色详情 |
| `/v1/voices/{voice_id}` | DELETE | 删除自定义音色 |
| `/v1/voices` | GET | 列出所有可用音色 |
| `/v1/models` | GET | 列出可用模型 |
| `/health` | GET | 健康检查 |
| `/docs` | GET | Swagger API 文档 |

## 🎤 语音合成 API

### POST `/v1/audio/speech`

#### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `model` | string | 否 | 模型：`cosyvoice-v3`(默认) |
| `input` | string | 是 | 要合成的文本 |
| `voice` | string | 是 | 自定义 voice_id |
| `response_format` | string | 否 | 输出格式：`wav`(默认), `pcm` |
| `speed` | float | 否 | 语速：0.5-2.0，默认1.0 |
| `instruct` | string | 否 | 指令文本（方言、情感等） |

#### 示例

```bash
# WAV 格式
curl -s https://cosyvoice.aws.xin/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{"input": "让子弹飞一会儿", "voice": "5764b8575f7f"}' \
  -o speech.wav

# PCM 流式（最低延迟）
curl -s https://cosyvoice.aws.xin/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{"input": "让子弹飞一会儿", "voice": "5764b8575f7f", "response_format": "pcm"}' \
  -o speech.pcm

# PCM 转 WAV
ffmpeg -f s16le -ar 24000 -ac 1 -i speech.pcm speech.wav

# 使用指令控制（方言、情感）
curl -s https://cosyvoice.aws.xin/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{"input": "今天天气真好", "voice": "5764b8575f7f", "instruct": "用四川话说这句话"}' \
  -o speech.wav
```

## 🎨 自定义音色 API

### 1. 创建自定义音色

上传参考音频（3-30秒），获取 voice_id：

```bash
curl -X POST https://cosyvoice.aws.xin/v1/voices/create \
  -F "audio=@your_voice.wav" \
  -F "name=我的音色" \
  -F "text=音频对应的文本内容"
```

> 💡 如果不提供 `text`，系统会使用 Whisper 自动识别

**响应：**
```json
{
  "success": true,
  "voice_id": "5764b8575f7f",
  "name": "我的音色",
  "text": "音频对应的文本内容",
  "message": "音色创建成功，使用 voice='5764b8575f7f' 调用 /v1/audio/speech"
}
```

### 2. 使用自定义音色

```bash
# 使用自定义 voice_id
curl -s https://cosyvoice.aws.xin/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{"input": "让子弹飞一会儿", "voice": "5764b8575f7f"}' \
  -o output.wav

# 直接播放
curl -s https://cosyvoice.aws.xin/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{"input": "让子弹飞一会儿", "voice": "5764b8575f7f"}' \
  | ffplay -autoexit -nodisp -
```

### 3. 列出自定义音色

```bash
curl -s https://cosyvoice.aws.xin/v1/voices/custom | jq .
```

**响应：**
```json
{
  "voices": [
    {
      "id": "5764b8575f7f",
      "name": "张麻子",
      "text": "翻译翻译，什么叫惊喜",
      "created_at": 1766033216
    }
  ]
}
```

### 4. 获取音色详情

```bash
curl -s https://cosyvoice.aws.xin/v1/voices/5764b8575f7f | jq .
```

### 5. 删除自定义音色

```bash
curl -X DELETE https://cosyvoice.aws.xin/v1/voices/5764b8575f7f
```

### 6. 列出所有音色

```bash
curl -s https://cosyvoice.aws.xin/v1/voices | jq .
```

**响应：**
```json
{
  "preset_voices": [],
  "custom_voices": [
    {"id": "5764b8575f7f", "name": "张麻子", "text": "...", "created_at": 1766033216}
  ]
}
```

## 🌊 流式播放

### Web 前端

访问测试页面：**https://cosyvoice.aws.xin**

勾选「流式输出」选项，可以边生成边播放。

### 命令行流式播放

```bash
# WAV 流式播放
curl -s https://cosyvoice.aws.xin/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{"input": "你好，这是流式语音测试", "voice": "5764b8575f7f"}' \
  | ffplay -autoexit -nodisp -

# PCM 流式播放
curl -s https://cosyvoice.aws.xin/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{"input": "你好", "voice": "5764b8575f7f", "response_format": "pcm"}' \
  | ffplay -f s16le -ar 24000 -ac 1 -autoexit -nodisp -
```

## 🐳 Docker 部署

```bash
# 拉取镜像
docker pull neosun/cosyvoice:v3

# 运行
docker run -d \
  --name cosyvoice \
  --gpus '"device=0"' \
  -p 8188:8188 \
  -v /tmp/cosyvoice/input:/data/input \
  -v /tmp/cosyvoice/output:/data/output \
  -v /tmp/cosyvoice/voices:/data/voices \
  neosun/cosyvoice:v3
```

## 📊 性能指标

| 指标 | 数值 |
|------|------|
| PCM 首字节延迟 | ~0.001s |
| WAV 生成时间 | ~3-5s（取决于文本长度） |
| 音频质量 | 24kHz, 16-bit PCM |
| 模型 | Fun-CosyVoice3-0.5B |

## 🗣️ 支持语言

- 中文、英文、日语、韩语
- 德语、西班牙语、法语、意大利语、俄语
- 18+ 种中文方言（广东话、四川话、东北话等）

## 🔗 相关链接

- Web UI：https://cosyvoice.aws.xin
- API 文档：https://cosyvoice.aws.xin/docs
- Docker Hub：https://hub.docker.com/r/neosun/cosyvoice
- 模型：[Fun-CosyVoice3-0.5B](https://huggingface.co/FunAudioLLM/Fun-CosyVoice3-0.5B-2512)
