import React, { useState, useEffect } from 'react';
import { Layout, Input, Button, Card, message, Tabs } from 'antd';
import { SendOutlined, SettingOutlined, CommentOutlined, SoundOutlined } from '@ant-design/icons';
import ConfigModal from './components/ConfigModal';
import TTSPanel from './components/TTS/TTSPanel';
import { loadApiConfig, saveApiConfig, validateConfig } from './services/config';

const { Header, Content } = Layout;
const { TextArea } = Input;

function App() {
  const [activeTab, setActiveTab] = useState('chat');
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [configVisible, setConfigVisible] = useState(false);
  const [config, setConfig] = useState({
    provider: 'qwen',
    apiKey: '',
    model: 'qwen-plus',
    baseUrl: 'https://dashscope.aliyuncs.com/api/v1'
  });

  useEffect(() => {
    initConfig();
  }, []);

  const initConfig = async () => {
    try {
      const savedConfig = await loadApiConfig();
      setConfig(savedConfig);
    } catch (error) {
      console.error('加载配置失败:', error);
    }
  };

  const handleSaveConfig = async (values) => {
    try {
      await saveApiConfig(values);
      setConfig(values);
      setConfigVisible(false);
      message.success('配置保存成功');
    } catch (error) {
      message.error('配置保存失败');
      console.error(error);
    }
  };

  const handleSend = async () => {
    if (!inputValue.trim()) return;
    
    // 验证配置
    const validation = validateConfig(config);
    if (!validation.valid) {
      message.warning(validation.message);
      setConfigVisible(true);
      return;
    }

    const userMessage = {
      role: 'user',
      content: inputValue,
      timestamp: new Date().toISOString()
    };

    setMessages([...messages, userMessage]);
    setInputValue('');
    setLoading(true);

    try {
      const response = await window.electronAPI.chatCompletion({
        messages: [...messages, userMessage],
        config: config
      });

      if (response.success) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: response.message,
          timestamp: new Date().toISOString()
        }]);
      } else {
        message.error('请求失败: ' + (response.error || '未知错误'));
      }
    } catch (error) {
      message.error('发送消息失败: ' + (error.message || '未知错误'));
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ 
        background: '#fff', 
        padding: '0 24px',
        height: '64px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        <h2>语音合成</h2>
        <Button 
          icon={<SettingOutlined />}
          onClick={() => setConfigVisible(true)}
        >
          配置
        </Button>
      </Header>

      <Content style={{ background: '#f0f2f5', height: 'calc(100vh - 64px)' }}>
         <TTSPanel />
      </Content>

      <ConfigModal
        visible={configVisible}
        config={config}
        onSave={handleSaveConfig}
        onCancel={() => setConfigVisible(false)}
      />
    </Layout>
  );
}

export default App;
