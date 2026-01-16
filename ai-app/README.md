# AI App

基于第三方大模型 API 的 Electron 应用。

## 技术栈

- Electron
- React
- Vite
- Ant Design
- Axios（用于调用大模型 API）

## 快速开始

```bash
cd D:/MediaTool/ai-app
npm install
npm run dev:electron
```

## 开发说明

### 大模型 API 集成

本项目支持集成多种大模型 API：

- OpenAI API
- Claude API
- 通义千问
- 文心一言
- 其他兼容 OpenAI 格式的 API

### 项目结构

```
ai-app/
├── src/
│   ├── main/          # Electron 主进程
│   │   ├── main.js    # 主进程入口
│   │   └── preload.js # 预加载脚本
│   └── renderer/      # React 渲染进程
│       ├── App.jsx    # 主应用组件
│       ├── index.html # HTML 模板
│       └── main.jsx   # 渲染进程入口
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## 配置说明

在使用前需要配置大模型 API 密钥：

1. 在应用设置中添加 API Key
2. 选择使用的模型提供商
3. 开始使用

## 构建

```bash
npm run build
```
