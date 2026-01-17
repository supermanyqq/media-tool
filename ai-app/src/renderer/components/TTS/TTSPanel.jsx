import React, { useState, useEffect } from "react";
import "./index.less";
import {
  Card,
  Input,
  Button,
  Space,
  message,
  Tag,
  Typography,
  Divider,
  Avatar,
  Select,
  Row,
  Col,
  Slider,
} from "antd";
import {
  SoundOutlined,
  DownloadOutlined,
  PlayCircleOutlined,
  SelectOutlined,
  SwapOutlined,
} from "@ant-design/icons";
import {
  getTTSModels,
  synthesizeSpeech,
  downloadAudio,
} from "../../services/tts";
import VoiceSelectionModal from "./VoiceSelectionModal";

const { TextArea } = Input;
const { Text, Title } = Typography;

function TTSPanel() {
  const [model, setModel] = useState("qwen3-tts-flash");
  const [voice, setVoice] = useState(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState("");
  const [voiceModalVisible, setVoiceModalVisible] = useState(false);
  const [volume, setVolume] = useState(50);
  const [speed, setSpeed] = useState(1);

  // 监听模型切换，重置音色选择
  useEffect(() => {
    setVoice(null);
    setAudioUrl("");
    loadVoices()
  }, [model]);

   const loadVoices = async () => {
      setLoading(true);
      try {
        const { queryVoiceList } = await import('../../services/tts');
        const result = await queryVoiceList(model);
        
        if (result.success && result.voices) {
          setVoice(result.voices[0] || null);
        } else {
          message.error('加载音色列表失败: ' + (result.error || '未知错误'));
        }
      } catch (error) {
        message.error('加载音色列表失败: ' + error.message);
      } finally {
        setLoading(false);
      }
    };

  const handleVoiceSelect = (selectedVoice) => {
    setVoice(selectedVoice);
    message.success(
      `已选择音色: ${selectedVoice.chineseName || selectedVoice.name}`
    );
  };
  
  const handleModelChange = (newModel) => {
    setModel(newModel);
    message.info(`已切换到 ${getTTSModels().find(m => m.value === newModel)?.label}`);
  };

  const handleSynthesize = async () => {
    if (!text.trim()) {
      message.warning("请输入要合成的文本");
      return;
    }

    if (!voice) {
      message.warning("请先选择音色");
      return;
    }

    const modelInfo = getTTSModels().find((m) => m.value === model);
    if (text.length > modelInfo.maxChars) {
      message.warning(`文本长度超过限制，最多 ${modelInfo.maxChars} 个字符`);
      return;
    }

    setLoading(true);
    setAudioUrl("");

    try {
      // 使用 voice 字段作为 API 调用的音色 ID
      const voiceId = voice.voice;
      console.log('选中的音色对象:', voice);
      console.log('使用的音色ID:', voiceId);
      
      // 如果是cosyvoice模型，传递音量和语速参数
      const params = model.startsWith('cosyvoice') ? {
        volume,
        speed
      } : {};
      
      const result = await synthesizeSpeech(text, model, voiceId, params);

      if (result.success && result.audioUrl) {
        setAudioUrl(result.audioUrl);
        message.success("语音合成成功");
      } else {
        message.error("合成失败: " + (result.error || "未知错误"));
      }
    } catch (error) {
      message.error("合成失败: " + (error.message || "未知错误"));
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (audioUrl) {
      const filename = `TTS_${
        voice?.chineseName || voice?.name
      }_${Date.now()}.wav`;
      downloadAudio(audioUrl, filename);
      message.success("开始下载");
    }
  };

  const modelInfo = getTTSModels().find((m) => m.value === model);
  

  return (
    <div className="tts-container">
      <Row gutter={24} style={{ height: "100%" }}>
        {/* 左侧文本输入区域 */}
        <Col span={14}>
          <Card
            title={<Text strong>输入文字合成语音</Text>}
            bordered={false}
            style={{ height: "100%", display: "flex", flexDirection: "column" }}
            bodyStyle={{ flex: 1, display: "flex", flexDirection: "column" }}
          >
            <div style={{ marginBottom: "8px" }}>
              <Text type="secondary" style={{ fontSize: "12px" }}>
                输入文字，转换成逼真的语音，赋能场景丰富的实时应用
              </Text>
            </div>
            <TextArea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="请输入文字"
              style={{ flex: 1, minHeight: "300px", fontSize: "14px" }}
              maxLength={modelInfo?.maxChars || 600}
            />
            <div
              style={{
                marginTop: "12px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Space>
                <Button
                  type="primary"
                  size="large"
                  icon={<PlayCircleOutlined />}
                  onClick={handleSynthesize}
                  loading={loading}
                  style={{ minWidth: "120px" }}
                >
                  {loading ? "合成中..." : "开始合成"}
                </Button>
                {/* 音频预览和下载 */}
              </Space>
              <Text type="secondary" style={{ fontSize: "12px" }}>
                {text.length}/{modelInfo?.maxChars || 600}
              </Text>
            </div>
            {audioUrl && (
              <>
                <Divider />
                <div>
                  <Text
                    strong
                    style={{ marginBottom: "8px", display: "block" }}
                  >
                    合成结果：
                  </Text>
                  <div
                    style={{
                      padding: "16px",
                      background: "#fafafa",
                      borderRadius: "8px",
                      border: "1px solid #f0f0f0",
                    }}
                  >
                    <audio controls src={audioUrl} style={{ width: "100%" }}>
                      您的浏览器不支持音频播放
                    </audio>
                    <div style={{ marginTop: "12px", textAlign: "center" }}>
                      <Button
                        type="primary"
                        icon={<DownloadOutlined />}
                        onClick={handleDownload}
                      >
                        下载音频
                      </Button>
                    </div>
                    <div style={{ marginTop: "8px", textAlign: "center" }}>
                      <Text type="secondary" style={{ fontSize: "12px" }}>
                        注意：音频链接有效期为 24 小时
                      </Text>
                    </div>
                  </div>
                </div>
              </>
            )}
          </Card>
        </Col>

        {/* 右侧配置区域 */}
        <Col span={10}>
          <Card
            title={<Text strong>调试台</Text>}
            bordered={false}
            style={{ height: "100%" }}
          >
            <Space direction="vertical" size="middle" style={{ width: "100%" }}>
              {/* 模型选择 */}
              <div>
                <Text strong style={{ display: "block", marginBottom: "8px" }}>
                  模型版本
                </Text>
                <Select
                  value={model}
                  onChange={handleModelChange}
                  style={{ width: "100%" }}
                  options={getTTSModels().map((m) => ({
                    label: m.label,
                    value: m.value,
                  }))}
                />
                {modelInfo && (
                  <Text type="secondary" style={{ fontSize: "12px", marginTop: "4px", display: "block" }}>
                    {modelInfo.description}
                  </Text>
                )}
              </div>

              {/* 音色选择 */}
              <div>
                <Text strong style={{ display: "block", marginBottom: "8px" }}>
                  音色
                </Text>
                {voice ? (
                  <div
                    onClick={() => setVoiceModalVisible(true)}
                    style={{
                      cursor: "pointer",
                      border: "1px solid #f0f0f0",
                      borderRadius: "8px",
                      padding: "12px",
                      background: "#fafafa",
                      transition: "all 0.3s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "#1890ff";
                      e.currentTarget.style.background = "#e6f7ff";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "#f0f0f0";
                      e.currentTarget.style.background = "#fafafa";
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                        }}
                      >
                        <Avatar
                          size={40}
                          src={voice.image}
                          style={{
                            backgroundColor: voice.image
                              ? "transparent"
                              : "#1890ff",
                          }}
                        >
                          {!voice.image &&
                            (voice.chineseName?.[0] || voice.name?.[0])}
                        </Avatar>
                        <div>
                          <div style={{ fontWeight: 500, fontSize: "14px" }}>
                            {voice.chineseName || voice.name}
                          </div>
                          <div style={{ fontSize: "12px", color: "#999" }}>
                            {voice.region || voice.description}
                          </div>
                        </div>
                      </div>
                      <SwapOutlined
                        style={{ fontSize: "16px", color: "#1890ff" }}
                      />
                    </div>
                  </div>
                ) : (
                  <Button
                    size="large"
                    icon={<SelectOutlined />}
                    onClick={() => setVoiceModalVisible(true)}
                    block
                    style={{ height: "auto", padding: "12px" }}
                  >
                    选择音色
                  </Button>
                )}
              </div>

              {/* CosyVoice 模型专属参数 */}
              {model.startsWith('cosyvoice') && (
                <>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <Text strong>音量</Text>
                      <Text type="secondary">{volume}</Text>
                    </div>
                    <Slider
                      min={0}
                      max={100}
                      value={volume}
                      onChange={setVolume}
                      tooltip={{ formatter: (value) => `${value}` }}
                    />
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <Text strong>语速</Text>
                      <Text type="secondary">{speed}</Text>
                    </div>
                    <Slider
                      min={0.5}
                      max={2}
                      step={0.1}
                      value={speed}
                      onChange={setSpeed}
                      tooltip={{ formatter: (value) => `${value}x` }}
                      marks={{
                        0.5: '0.5x',
                        1: '1x',
                        1.5: '1.5x',
                        2: '2x'
                      }}
                    />
                  </div>
                </>
              )}

              {/* 查看模型更多控制能力 */}
              <div style={{ marginTop: "16px" }}>
                <a
                  href="#"
                  style={{ color: "#1890ff", fontSize: "13px" }}
                  onClick={(e) => {
                    e.preventDefault();
                    message.info("更多控制选项开发中...");
                  }}
                >
                  查看模型 ssml 的更强控制能力
                </a>
              </div>
            </Space>
          </Card>
        </Col>
      </Row>

      {/* 音色选择 Modal */}
      <VoiceSelectionModal
        visible={voiceModalVisible}
        onCancel={() => setVoiceModalVisible(false)}
        onSelect={handleVoiceSelect}
        modelId={model}
      />
    </div>
  );
}

export default TTSPanel;
