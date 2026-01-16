# MediaTool

Electron + Vite + React + Ant Design + FFmpeg sample project.

Quick start:

```bash
cd D:/MediaTool
npm install
npm run dev:electron
```

Notes:
- This project uses `ffmpeg-static` and `fluent-ffmpeg` in the main process.
- Renderer is served by Vite during development; Electron loads the dev server.

## 字幕识别（Whisper）

本项目的“识别字幕”优先使用项目内置的 `whisper.cpp`（类似 `ffmpeg-static`：应用自带可执行文件），找不到才会回退到系统环境里的 `whisper` / `python -m whisper`。

### 自动拉取（npm install 后自动下载）

默认在 `npm install` 后会自动下载：

- whisper.cpp Windows 预编译包（来自 GitHub Releases，默认 tag：`v1.8.2`）
- 默认模型（来自 HuggingFace：`ggml-base.bin`）

下载目标目录：`src/main/vendor/whisper/`（已加入 `.gitignore`，避免把大文件提交进仓库）

可用环境变量：

- `MEDIATOOL_SKIP_WHISPER_DOWNLOAD=1`：完全跳过自动下载
- `WHISPER_CPP_SKIP_MODEL=1`：只下载二进制，不下载模型
- `MEDIATOOL_WHISPER_STRICT=1`：下载失败时让 `npm install` 直接失败（默认是警告并继续）
- `WHISPER_CPP_TAG=v1.8.2`：指定 whisper.cpp release tag
- `WHISPER_CPP_ASSET_URL=...zip`：直接指定要下载的 whisper.cpp zip（覆盖自动选择）
- `WHISPER_CPP_MODEL_NAME=ggml-base.bin`：指定模型文件名
- `WHISPER_CPP_MODEL_URL=...bin`：直接指定模型下载 URL

### 方案 A：把 whisper.cpp 放进项目（推荐）

1) 准备 whisper.cpp 可执行文件（Windows 通常是 `whisper.exe`）

2) 准备模型文件（例如 `ggml-base.bin` / `ggml-small.bin`）

3) 放到以下目录（自行创建）：

- `src/main/vendor/whisper/whisper.exe`
- `src/main/vendor/whisper/models/ggml-base.bin`（或其他 .bin 模型）

然后直接运行 `npm run dev:electron` 即可。

### 方案 B：用环境变量指定路径（不改项目目录结构）

在启动 Electron 之前设置：

- `WHISPER_CPP_BIN`：whisper.cpp 可执行文件路径
- `WHISPER_CPP_MODEL`：模型 .bin 文件路径

示例（PowerShell）：

```powershell
$env:WHISPER_CPP_BIN = "D:\tools\whisper.cpp\whisper.exe"
$env:WHISPER_CPP_MODEL = "D:\tools\whisper.cpp\models\ggml-base.bin"
npm run dev:electron
```

### 回退：使用系统 whisper（Python）

如果你更想用 Python 版本：确保命令行里能运行 `whisper --help` 或 `python -m whisper --help`。
