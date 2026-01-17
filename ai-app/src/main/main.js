const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const WebSocket = require("ws");
const { v4: uuidv4 } = require("uuid");
const { qwen3_tts_flash_voices } = require("./audioLIst");
const {
  cosy_voice_v3_flash_voices,
  cosy_voice_v2_voices,
} = require("./cosyVoiceList");

// 配置文件路径
const getConfigPath = () => {
  const userDataPath = app.getPath("userData");
  return path.join(userDataPath, "qwen-config.json");
};

function createWindow() {
  const win = new BrowserWindow({
    width: 1500,
    height: 993,
    minWidth: 1500,
    minHeight: 993,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL || "http://localhost:5174");
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  }
}

// 通义千问 API 调用
ipcMain.handle("chat-completion", async (event, args) => {
  const { messages, config } = args;

  try {
    // 使用 node-fetch 或 axios 调用通义千问 API
    const response = await fetch(
      `${config.baseUrl}/services/aigc/text-generation/generation`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          input: {
            messages: messages.map((msg) => ({
              role: msg.role,
              content: msg.content,
            })),
          },
          parameters: {
            result_format: "message",
          },
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      return {
        success: false,
        error:
          errorData.message ||
          `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const data = await response.json();

    if (data.output && data.output.choices && data.output.choices.length > 0) {
      return {
        success: true,
        message: data.output.choices[0].message.content,
      };
    } else {
      return {
        success: false,
        error: "响应格式异常",
      };
    }
  } catch (error) {
    console.error("API 调用失败:", error);
    return {
      success: false,
      error: error.message || "网络请求失败",
    };
  }
});

// 保存配置
ipcMain.handle("save-api-config", async (event, config) => {
  try {
    const configPath = getConfigPath();
    const configDir = path.dirname(configPath);

    // 确保目录存在
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
    return { success: true };
  } catch (error) {
    console.error("保存配置失败:", error);
    throw error;
  }
});

// 加载配置
ipcMain.handle("load-api-config", async () => {
  try {
    const configPath = getConfigPath();

    if (fs.existsSync(configPath)) {
      const configData = fs.readFileSync(configPath, "utf-8");
      return JSON.parse(configData);
    }

    // 返回默认配置
    return {
      provider: "qwen",
      apiKey: "",
      model: "qwen-plus",
      baseUrl: "https://dashscope.aliyuncs.com/api/v1",
    };
  } catch (error) {
    console.error("加载配置失败:", error);
    return {
      provider: "qwen",
      apiKey: "",
      model: "qwen-plus",
      baseUrl: "https://dashscope.aliyuncs.com/api/v1",
    };
  }
});

// 语音合成
ipcMain.handle("synthesize-speech", async (event, args) => {
  const { text, model, voice, languageType, volume, speed } = args;

  console.log("=== 语音合成请求 ===");
  console.log("文本:", text);
  console.log("模型:", model);
  console.log("音色:", voice);
  if (volume !== undefined) console.log("音量:", volume);
  if (speed !== undefined) console.log("语速:", speed);

  try {
    // 获取配置
    const configPath = getConfigPath();
    let apiKey = "";

    if (fs.existsSync(configPath)) {
      const configData = fs.readFileSync(configPath, "utf-8");
      const config = JSON.parse(configData);
      apiKey = config.apiKey;
    }

    if (!apiKey) {
      return {
        success: false,
        error: "请先配置 API Key",
      };
    }

    // 根据模型选择不同的API方式
    if (model.startsWith('cosyvoice')) {
      // CosyVoice 使用 WebSocket
      return await synthesizeWithWebSocket(text, model, voice, apiKey, volume, speed);
    } else {
      // Qwen TTS 使用 HTTP REST API
      return await synthesizeWithHTTP(text, model, voice, languageType, apiKey);
    }
  } catch (error) {
    console.error("语音合成失败:", error);
    return {
      success: false,
      error: error.message || "网络请求失败",
    };
  }
});

// WebSocket 方式合成（用于 CosyVoice）
async function synthesizeWithWebSocket(text, model, voice, apiKey, volume = 50, speed = 1) {
  return new Promise((resolve, reject) => {
    const taskId = uuidv4().replace(/-/g, '');
    const wsUrl = "wss://dashscope.aliyuncs.com/api-ws/v1/inference";
    
    const ws = new WebSocket(wsUrl, {
      headers: {
        "Authorization": `bearer ${apiKey}`,
      }
    });

    let audioChunks = [];
    let hasError = false;

    ws.on('open', () => {
      console.log('WebSocket 连接已建立');
      
      // 发送 run-task 指令
      const runTaskMessage = {
        header: {
          action: "run-task",
          task_id: taskId,
          streaming: "duplex"
        },
        payload: {
          task_group: "audio",
          task: "tts",
          function: "SpeechSynthesizer",
          model: model,
          parameters: {
            text_type: "PlainText",
            voice: voice,
            format: "mp3",
            sample_rate: 22050,
            volume: volume,
            rate: speed,
            pitch: 1
          },
          input: {}
        }
      };
      
      ws.send(JSON.stringify(runTaskMessage));
      console.log('已发送 run-task 指令');
    });

    ws.on('message', (data) => {
      // 先尝试解析为JSON（文本消息）
      try {
        const messageText = data.toString('utf8');
        const message = JSON.parse(messageText);
        console.log('收到事件:', message.header?.event);
        
        if (message.header?.event === 'task-started') {
          console.log('任务已开启，发送文本');
          // 发送 continue-task 指令
          const continueTaskMessage = {
            header: {
              action: "continue-task",
              task_id: taskId,
              streaming: "duplex"
            },
            payload: {
              input: {
                text: text
              }
            }
          };
          ws.send(JSON.stringify(continueTaskMessage));
          
          // 立即发送 finish-task 指令
          setTimeout(() => {
            const finishTaskMessage = {
              header: {
                action: "finish-task",
                task_id: taskId,
                streaming: "duplex"
              },
              payload: {
                input: {}
              }
            };
            ws.send(JSON.stringify(finishTaskMessage));
            console.log('已发送 finish-task 指令');
          }, 100);
          
        } else if (message.header?.event === 'task-finished') {
          console.log('任务完成，音频块数:', audioChunks.length);
          ws.close();
          
          if (audioChunks.length > 0 && !hasError) {
            // 合并音频数据
            const audioBuffer = Buffer.concat(audioChunks);
            const base64Audio = audioBuffer.toString('base64');
            const audioUrl = `data:audio/mp3;base64,${base64Audio}`;
            
            resolve({
              success: true,
              audioUrl: audioUrl
            });
          } else {
            resolve({
              success: false,
              error: "未接收到音频数据"
            });
          }
          
        } else if (message.header?.event === 'task-failed') {
          hasError = true;
          const errorMsg = `${message.header?.error_code}: ${message.header?.error_message}`;
          console.error('任务失败:', errorMsg);
          ws.close();
          resolve({
            success: false,
            error: errorMsg
          });
        }
      } catch (err) {
        // 如果不是JSON，则是二进制音频数据
        if (data instanceof Buffer) {
          audioChunks.push(data);
          console.log(`接收到音频数据块，大小: ${data.length} 字节`);
        }
      }
    });

    ws.on('error', (error) => {
      console.error('WebSocket 错误:', error);
      hasError = true;
      resolve({
        success: false,
        error: error.message
      });
    });

    ws.on('close', () => {
      console.log('WebSocket 连接已关闭');
    });

    // 设置超时
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
        if (!hasError) {
          resolve({
            success: false,
            error: "请求超时"
          });
        }
      }
    }, 30000);
  });
}

// HTTP 方式合成（用于 Qwen TTS）
async function synthesizeWithHTTP(text, model, voice, languageType, apiKey) {
  const requestBody = {
    model: model,
    input: {
      text: text,
      voice: voice,
      language_type: languageType || "Auto",
      format: "wav",
      sample_rate: 24000,
    },
  };

  console.log("HTTP请求体:", JSON.stringify(requestBody, null, 2));

  const response = await fetch(
    "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const errorData = await response.json();
    console.log("错误响应:", errorData);
    return {
      success: false,
      error: errorData.message || `HTTP ${response.status}: ${response.statusText}`,
    };
  }

  const data = await response.json();
  console.log("成功响应:", data);

  if (data.output && data.output.audio && data.output.audio.url) {
    return {
      success: true,
      audioUrl: data.output.audio.url,
      expiresAt: data.output.audio.expires_at,
    };
  } else {
    return {
      success: false,
      error: "响应格式异常，未获取到音频URL",
    };
  }
}

// 查询音色列表
ipcMain.handle("query-voice-list", async (event, modelId) => {
  let voices = [];
  if (modelId === "qwen3-tts-flash") {
    voices = qwen3_tts_flash_voices.map((item) => ({
      ...item.ttsVoiceConfig,
    }));
  } else if (modelId === "cosyvoice-v3-flash") {
    voices = cosy_voice_v3_flash_voices.map((item) => ({
      ...item.ttsVoiceConfig,
    }));
  } else if (modelId === "cosyvoice-v2") {
    voices = cosy_voice_v2_voices.map((item) => ({
      ...item.ttsVoiceConfig,
    }));
  }

  return {
    success: true,
    voices: voices,
  };
});

app.whenReady().then(() => {
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
