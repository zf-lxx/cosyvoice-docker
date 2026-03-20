# CosyVoice MCP Guide

CosyVoice 提供 Model Context Protocol (MCP) 接口，支持程序化调用 TTS 功能。

## 配置

在 MCP 客户端配置文件中添加：

```json
{
  "mcpServers": {
    "cosyvoice": {
      "command": "python",
      "args": ["/path/to/CosyVoice/mcp_server.py"],
      "env": {
        "MODEL_DIR": "pretrained_models/CosyVoice2-0.5B",
        "GPU_IDLE_TIMEOUT": "600",
        "INPUT_DIR": "/tmp/cosyvoice/input",
        "OUTPUT_DIR": "/tmp/cosyvoice/output"
      }
    }
  }
}
```

## 可用工具

### 1. tts_zero_shot
零样本语音克隆，使用参考音频复制说话人音色。

**参数：**
| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| text | str | ✅ | 要合成的文本 |
| prompt_text | str | ✅ | 参考音频的文本内容（需与音频一致） |
| prompt_audio_path | str | ✅ | 参考音频路径（3-30秒） |
| speed | float | ❌ | 语速 0.5-2.0，默认 1.0 |
| output_filename | str | ❌ | 输出文件名，默认自动生成 |

**示例：**
```python
result = await mcp.call_tool("tts_zero_shot", {
    "text": "你好，这是一段测试文本。",
    "prompt_text": "希望你以后能够做的比我还好呦。",
    "prompt_audio_path": "/data/input/reference.wav",
    "speed": 1.0
})
# 返回: {"status": "success", "output_path": "/data/output/tts_xxx.wav", "duration_seconds": 3.5}
```

### 2. tts_cross_lingual
跨语种语音克隆，合成文本可以与参考音频不同语言。

**参数：**
| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| text | str | ✅ | 要合成的文本（支持多语言） |
| prompt_audio_path | str | ✅ | 参考音频路径 |
| speed | float | ❌ | 语速 |
| output_filename | str | ❌ | 输出文件名 |

**示例：**
```python
result = await mcp.call_tool("tts_cross_lingual", {
    "text": "Hello, this is a cross-lingual test.",
    "prompt_audio_path": "/data/input/chinese_reference.wav"
})
```

### 3. tts_instruct
指令控制 TTS，支持方言、情感、语速等控制。

**参数：**
| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| text | str | ✅ | 要合成的文本 |
| instruct_text | str | ✅ | 控制指令（如"用四川话说"、"speak slowly"） |
| prompt_audio_path | str | ✅ | 参考音频路径 |
| speed | float | ❌ | 语速 |
| output_filename | str | ❌ | 输出文件名 |

**支持的指令示例：**
- 方言：用四川话说、用广东话说、用东北话说
- 情感：开心地说、悲伤地说
- 语速：快速地说、慢慢地说

### 4. tts_sft
使用预训练音色合成语音。

**参数：**
| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| text | str | ✅ | 要合成的文本 |
| speaker_id | str | ✅ | 说话人 ID（使用 list_speakers 获取） |
| speed | float | ❌ | 语速 |
| output_filename | str | ❌ | 输出文件名 |

### 5. list_speakers
获取可用的预训练音色列表。

**返回：**
```json
{"status": "success", "speakers": ["中文女", "中文男", "英文女", ...]}
```

### 6. gpu_status
获取 GPU 和模型状态。

**返回：**
```json
{
  "model_loaded": true,
  "model_dir": "pretrained_models/CosyVoice2-0.5B",
  "gpu": {
    "available": true,
    "device": "NVIDIA L40S",
    "memory_used_gb": 8.5,
    "memory_total_gb": 46.0
  },
  "idle_seconds": 120
}
```

### 7. gpu_offload
释放 GPU 显存，卸载模型。

### 8. load_model
加载指定模型。

**参数：**
| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| model_dir | str | ✅ | 模型目录路径 |

**可用模型：**
- `pretrained_models/CosyVoice2-0.5B` - 推荐，平衡性能
- `pretrained_models/Fun-CosyVoice3-0.5B` - 最新版本，最佳效果
- `pretrained_models/CosyVoice-300M` - 基础模型
- `pretrained_models/CosyVoice-300M-SFT` - 预训练音色
- `pretrained_models/CosyVoice-300M-Instruct` - 指令控制

## MCP vs API 对比

| 特性 | MCP | API |
|------|-----|-----|
| 调用方式 | 工具函数 | HTTP 请求 |
| 适用场景 | AI Agent 集成 | Web 应用、脚本 |
| 文件传输 | 本地路径 | 上传/下载 |
| 流式输出 | ❌ | ✅ |
| 异步任务 | ❌ | ✅ |

## 注意事项

1. **参考音频要求**：3-30 秒，采样率 ≥16kHz
2. **GPU 管理**：模型空闲超时后自动释放显存
3. **输出目录**：所有生成的音频保存在 `OUTPUT_DIR`
4. **错误处理**：所有工具返回 `{"status": "error", "error": "..."}` 表示失败
