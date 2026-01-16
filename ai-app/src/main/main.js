const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { qwen3_tts_flash_voices } = require('./audioLIst');

// 配置文件路径
const getConfigPath = () => {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'qwen-config.json');
};

function createWindow() {
  const win = new BrowserWindow({
    width: 1500,
    height: 993,
    minWidth: 1500,
    minHeight: 993,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL || 'http://localhost:5174');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  }
}

// 通义千问 API 调用
ipcMain.handle('chat-completion', async (event, args) => {
  const { messages, config } = args;
  
  try {
    // 使用 node-fetch 或 axios 调用通义千问 API
    const response = await fetch(`${config.baseUrl}/services/aigc/text-generation/generation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        input: {
          messages: messages.map(msg => ({
            role: msg.role,
            content: msg.content
          }))
        },
        parameters: {
          result_format: 'message'
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      return {
        success: false,
        error: errorData.message || `HTTP ${response.status}: ${response.statusText}`
      };
    }

    const data = await response.json();
    
    if (data.output && data.output.choices && data.output.choices.length > 0) {
      return {
        success: true,
        message: data.output.choices[0].message.content
      };
    } else {
      return {
        success: false,
        error: '响应格式异常'
      };
    }
  } catch (error) {
    console.error('API 调用失败:', error);
    return {
      success: false,
      error: error.message || '网络请求失败'
    };
  }
});

// 保存配置
ipcMain.handle('save-api-config', async (event, config) => {
  try {
    const configPath = getConfigPath();
    const configDir = path.dirname(configPath);
    
    // 确保目录存在
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    return { success: true };
  } catch (error) {
    console.error('保存配置失败:', error);
    throw error;
  }
});

// 加载配置
ipcMain.handle('load-api-config', async () => {
  try {
    const configPath = getConfigPath();
    
    if (fs.existsSync(configPath)) {
      const configData = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(configData);
    }
    
    // 返回默认配置
    return {
      provider: 'qwen',
      apiKey: '',
      model: 'qwen-plus',
      baseUrl: 'https://dashscope.aliyuncs.com/api/v1'
    };
  } catch (error) {
    console.error('加载配置失败:', error);
    return {
      provider: 'qwen',
      apiKey: '',
      model: 'qwen-plus',
      baseUrl: 'https://dashscope.aliyuncs.com/api/v1'
    };
  }
});

// 语音合成
ipcMain.handle('synthesize-speech', async (event, args) => {
  const { text, model, voice, languageType } = args;
  
  console.log('=== 语音合成请求 ===');
  console.log('文本:', text);
  console.log('模型:', model);
  console.log('音色:', voice);
  console.log('语言类型:', languageType);
  
  try {
    // 获取配置
    const configPath = getConfigPath();
    let apiKey = '';
    
    if (fs.existsSync(configPath)) {
      const configData = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(configData);
      apiKey = config.apiKey;
    }
    
    if (!apiKey) {
      return {
        success: false,
        error: '请先配置 API Key'
      };
    }

    // 调用通义千问 TTS API
    const requestBody = {
      model: model,
      input: {
        text: text,
         voice: voice,
         language_type: languageType || 'Auto',
        format: 'wav',
        sample_rate: 24000
      },
    };
    
    console.log('请求体:', JSON.stringify(requestBody, null, 2));
    
    const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    console.log('响应状态:', response.status);

    if (!response.ok) {
      const errorData = await response.json();
      console.log('错误响应:', errorData);
      return {
        success: false,
        error: errorData.message || `HTTP ${response.status}: ${response.statusText}`
      };
    }

    const data = await response.json();
    console.log('成功响应:', data);
    
    if (data.output && data.output.audio && data.output.audio.url) {
      return {
        success: true,
        audioUrl: data.output.audio.url,
        expiresAt: data.output.audio.expires_at
      };
    } else {
      return {
        success: false,
        error: '响应格式异常，未获取到音频URL'
      };
    }
  } catch (error) {
    console.error('语音合成失败:', error);
    return {
      success: false,
      error: error.message || '网络请求失败'
    };
  }
});

// 查询音色列表
ipcMain.handle('query-voice-list', async (event, modelId) => {
  try {
    // 直接返回硬编码的音色数据
    const voices = qwen3_tts_flash_voices.map(item => ({
      voice: item.ttsVoiceConfig.voice,  // 添加 voice 字段作为音色ID
      name: item.ttsVoiceConfig.voice,
      chineseName: item.ttsVoiceConfig.name,
      description: item.ttsVoiceConfig.illustration,
      gender: item.ttsVoiceConfig.gender.split(',')[0], // "女声" or "男声"
      image: item.ttsVoiceConfig.image,
      illustrationAudio: item.ttsVoiceConfig.illustrationAudio,
      language: item.ttsVoiceConfig.language,
      age: item.ttsVoiceConfig.age,
      scenario: item.ttsVoiceConfig.scenario,
      region: item.ttsVoiceConfig.profile,
      profile: item.ttsVoiceConfig.profile
    }));

    return {
      success: true,
      voices: voices
    };
  } catch (error) {
    console.error('查询音色列表失败:', error);
    return {
      success: false,
      error: error.message || '获取音色列表失败'
    };
  }
});

app.whenReady().then(() => {
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
