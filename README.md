# MediaTool 项目集合

这是一个包含多个独立 Electron 应用的项目集合。

## 项目列表

### 1. media-tool-app

视频音频处理工具，支持：
- 音频提取与静音
- 字幕识别（Whisper）
- 基于 FFmpeg 的媒体处理

[查看详细文档](./media-tool-app/README.md)

```bash
cd media-tool-app
npm install
npm run dev:electron
```

### 2. ai-app

基于第三方大模型 API 的 AI 助手应用，支持：
- OpenAI API
- Claude API
- 通义千问
- 文心一言
- 其他兼容 OpenAI 格式的 API

[查看详细文档](./ai-app/README.md)

```bash
cd ai-app
npm install
npm run dev:electron
```

## 技术栈

两个项目都基于以下技术：
- **Electron** - 跨平台桌面应用框架
- **React** - 用户界面库
- **Vite** - 快速的前端构建工具
- **Ant Design** - UI 组件库

## 开发说明

每个子项目都是独立的，拥有自己的：
- `package.json` - 依赖管理
- `vite.config.ts` - Vite 配置
- `src/` - 源代码目录

## 项目结构

```
MediaTool/
├── media-tool-app/      # 媒体工具应用
│   ├── src/
│   │   ├── main/       # Electron 主进程
│   │   └── renderer/   # React 渲染进程
│   ├── package.json
│   └── README.md
│
├── ai-app/             # AI 助手应用
│   ├── src/
│   │   ├── main/       # Electron 主进程
│   │   └── renderer/   # React 渲染进程
│   ├── package.json
│   └── README.md
│
└── README.md           # 本文件
```

## 注意事项

- 每个项目需要单独安装依赖
- 开发时注意端口配置（media-tool-app: 5173, ai-app: 5174）
- 生产环境构建时需要分别构建每个项目
