// 语音合成服务

/**
 * 获取支持的TTS模型列表
 */
export function getTTSModels() {
  return [
    {
      value: "qwen3-tts-flash",
      label: "Qwen3-TTS-Flash（0.8元/万字符）",
      description: "49种音色，支持多语言",
      maxChars: 600,
    },
    {
      value: "cosyvoice-v3-flash",
      label: "CosyVoice-V3-Flash（1元/万字符）",
      description: "26种音色，支持中文",
      maxChars: 600,
    },
    {
      value: "cosyvoice-v2",
      label: "CosyVoice-V2（2元/万字符）",
      description: "49种音色，支持多语言",
      maxChars: 600,
    },
  ];
}

/**
 * 从阿里云API查询音色列表
 */
export async function queryVoiceList(modelId = "qwen3-tts-flash") {
  try {
    const result = await window.electronAPI.queryVoiceList(modelId);

    // 如果API返回失败，使用模拟数据
    if (!result.success || !result.voices || result.voices.length === 0) {
      return {
        success: true,
        voices: getMockVoices(),
      };
    }

    return result;
  } catch (error) {
    console.error("查询音色列表失败，使用模拟数据:", error);
    // API失败时返回模拟数据
    return {
      success: true,
      voices: getMockVoices(),
    };
  }
}

/**
 * 获取默认音色
 */
export function getDefaultVoice(model) {
  return "Cherry"; // 默认使用芊悦音色
}

/**
 * 调用TTS API合成语音
 */
export async function synthesizeSpeech(text, model, voice, params = {}) {
  try {
    const result = await window.electronAPI.synthesizeSpeech({
      text,
      model,
      voice,
      languageType: "Auto", // 自动检测语言
      ...params, // 包含 volume 和 speed
    });
    return result;
  } catch (error) {
    console.error("语音合成失败:", error);
    throw error;
  }
}

/**
 * 下载音频文件
 */
export function downloadAudio(audioUrl, filename = "synthesized_speech.wav") {
  const link = document.createElement("a");
  link.href = audioUrl;
  link.download = filename;
  link.click();
}
