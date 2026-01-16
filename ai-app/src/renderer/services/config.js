// 配置管理服务

const DEFAULT_CONFIG = {
  provider: 'qwen',
  apiKey: '',
  baseUrl: 'https://dashscope.aliyuncs.com/api/v1',
  model: 'qwen-plus' // 固定使用 qwen-plus 模型
};

/**
 * 加载API配置
 */
export async function loadApiConfig() {
  try {
    const config = await window.electronAPI.loadApiConfig();
    return { ...DEFAULT_CONFIG, ...config };
  } catch (error) {
    console.error('加载配置失败:', error);
    return DEFAULT_CONFIG;
  }
}

/**
 * 保存API配置
 */
export async function saveApiConfig(config) {
  try {
    // 保存时自动添加固定配置
    const fullConfig = {
      ...DEFAULT_CONFIG,
      ...config,
      provider: 'qwen',
      model: 'qwen-plus',
      baseUrl: 'https://dashscope.aliyuncs.com/api/v1'
    };
    await window.electronAPI.saveApiConfig(fullConfig);
    return true;
  } catch (error) {
    console.error('保存配置失败:', error);
    throw error;
  }
}

/**
 * 验证配置是否完整
 */
export function validateConfig(config) {
  if (!config.apiKey || !config.apiKey.trim()) {
    return { valid: false, message: '请输入 API Key' };
  }
  return { valid: true };
}
