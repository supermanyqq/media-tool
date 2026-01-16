import React, { useState, useEffect, useRef } from 'react';
import { Modal, Card, Input, Space, Tag, Button, Spin, message, Avatar, Row, Col, Empty, Tabs } from 'antd';
import { SearchOutlined, CustomerServiceOutlined, PlayCircleOutlined, PauseCircleOutlined, StarOutlined, StarFilled } from '@ant-design/icons';

const { Search } = Input;

function VoiceSelectionModal({ visible, onCancel, onSelect, modelId }) {
  const [voices, setVoices] = useState([]);
  const [filteredVoices, setFilteredVoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [playingVoice, setPlayingVoice] = useState(null);
  const [selectedScene, setSelectedScene] = useState('全部场景');
  const [selectedAge, setSelectedAge] = useState('全部年龄');
  const [selectedGender, setSelectedGender] = useState('全部性别');
  const [selectedLanguage, setSelectedLanguage] = useState('全部语言');
  const [favorites, setFavorites] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState(null);
  const audioRef = useRef(null);

  useEffect(() => {
    if (visible) {
      loadVoices();
    }
  }, [visible, modelId]);

  useEffect(() => {
    let filtered = voices;
    
    // 搜索过滤
    if (searchText) {
      filtered = filtered.filter(v => 
        v.name?.toLowerCase().includes(searchText.toLowerCase()) ||
        v.chineseName?.toLowerCase().includes(searchText.toLowerCase()) ||
        v.description?.toLowerCase().includes(searchText.toLowerCase()) ||
        v.region?.toLowerCase().includes(searchText.toLowerCase())
      );
    }
    
    // 场景过滤 - 使用映射关系
    if (selectedScene !== '全部场景') {
      // UI显示名称到实际数据值的映射
      const sceneMap = {
        '陪伴助手': '陪伴聊天',
        '电话客服': '电话客服',
        '消费电子': '消费电子',
        '有声书': '有声书',
        '短视频配音': '短视频配音',
        '电商直播': '电商直播',
        '语音助手': '语音助手'
      };
      const actualScene = sceneMap[selectedScene] || selectedScene;
      filtered = filtered.filter(v => v.scenario?.name === actualScene);
    }
    
    // 年龄过滤
    if (selectedAge !== '全部年龄') {
      filtered = filtered.filter(v => v.age?.includes(selectedAge));
    }
    
    // 性别过滤
    if (selectedGender !== '全部性别') {
      filtered = filtered.filter(v => v.gender?.includes(selectedGender));
    }
    
    // 语言过滤
    if (selectedLanguage !== '全部语言') {
      filtered = filtered.filter(v => v.language?.includes(selectedLanguage));
    }
    
    setFilteredVoices(filtered);
  }, [searchText, voices, selectedAge, selectedGender, selectedLanguage, selectedScene]);

  const loadVoices = async () => {
    setLoading(true);
    try {
      const { queryVoiceList } = await import('../../services/tts');
      const result = await queryVoiceList(modelId);
      
      if (result.success && result.voices) {
        setVoices(result.voices);
        setFilteredVoices(result.voices);
      } else {
        message.error('加载音色列表失败: ' + (result.error || '未知错误'));
      }
    } catch (error) {
      message.error('加载音色列表失败: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePlayPreview = (voice) => {
    if (playingVoice === voice.name) {
      // 暂停当前播放
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setPlayingVoice(null);
    } else {
      // 播放新音频
      if (audioRef.current) {
        audioRef.current.pause();
      }
      
      if (voice.illustrationAudio) {
        const audio = new Audio(voice.illustrationAudio);
        audioRef.current = audio;
        
        audio.play().catch(err => {
          message.error('播放失败: ' + err.message);
        });
        
        audio.onended = () => {
          setPlayingVoice(null);
        };
        
        audio.onerror = () => {
          message.error('音频加载失败');
          setPlayingVoice(null);
        };
        
        setPlayingVoice(voice.name);
      } else {
        message.warning('该音色暂无试听音频');
      }
    }
  };

  const handleSelectVoice = (voice) => {
    setSelectedVoice(voice);
  };
  
  const handleConfirm = () => {
    if (!selectedVoice) {
      message.warning('请先选择音色');
      return;
    }
    
    // 停止播放
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setPlayingVoice(null);
    
    onSelect(selectedVoice);
    onCancel();
  };
  
  const toggleFavorite = (voiceName, e) => {
    e.stopPropagation();
    setFavorites(prev => {
      if (prev.includes(voiceName)) {
        return prev.filter(v => v !== voiceName);
      } else {
        return [...prev, voiceName];
      }
    });
  };

  const getGenderTag = (gender) => {
    if (gender === 'female' || gender === '女') {
      return <Tag color="pink">女声</Tag>;
    } else if (gender === 'male' || gender === '男') {
      return <Tag color="blue">男声</Tag>;
    }
    return null;
  };

  return (
    <Modal
      title="选择音色"
      open={visible}
      onCancel={onCancel}
      width={950}
      centered
      footer={
        <div style={{ textAlign: 'right' }}>
          <Button onClick={onCancel} style={{ marginRight: 8 }}>取消</Button>
          <Button type="primary" onClick={handleConfirm}>确定</Button>
        </div>
      }
      bodyStyle={{ padding: '24px', height: '630px' }}
    >
       <Space direction="vertical" style={{ width: '100%', marginTop: 16 }} size="middle">
        {/* 搜索框 */}
        <Search
          placeholder="搜索音色"
          allowClear
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{ width: '100%' }}
        />

        {/* 年龄/性别/语言过滤 */}
        <div>
          <Space wrap size="small">
            {['全部年龄', '儿童', '青年', '中年', '老人'].map(age => (
              <Tag.CheckableTag
                key={age}
                checked={selectedAge === age}
                onChange={() => setSelectedAge(age)}
                style={{
                  padding: '2px 10px',
                  fontSize: '13px',
                  borderRadius: '3px',
                  background: selectedAge === age ? '#1890ff' : 'transparent',
                  color: selectedAge === age ? '#fff' : '#666',
                }}
              >
                {age}
              </Tag.CheckableTag>
            ))}
            
            <span style={{ color: '#d9d9d9', margin: '0 4px' }}>|</span>
            
            {['全部性别', '男声', '女声'].map(gender => (
              <Tag.CheckableTag
                key={gender}
                checked={selectedGender === gender}
                onChange={() => setSelectedGender(gender)}
                style={{
                  padding: '2px 10px',
                  fontSize: '13px',
                  borderRadius: '3px',
                  background: selectedGender === gender ? '#1890ff' : 'transparent',
                  color: selectedGender === gender ? '#fff' : '#666',
                }}
              >
                {gender}
              </Tag.CheckableTag>
            ))}
            
            <span style={{ color: '#d9d9d9', margin: '0 4px' }}>|</span>
            
            {['全部语言', '中文', '英文', '方言', '小语种'].map(lang => (
              <Tag.CheckableTag
                key={lang}
                checked={selectedLanguage === lang}
                onChange={() => setSelectedLanguage(lang)}
                style={{
                  padding: '2px 10px',
                  fontSize: '13px',
                  borderRadius: '3px',
                  background: selectedLanguage === lang ? '#1890ff' : 'transparent',
                  color: selectedLanguage === lang ? '#fff' : '#666',
                }}
              >
                {lang}
              </Tag.CheckableTag>
            ))}
          </Space>
        </div>

        {/* 音色列表 */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <Spin size="large" tip="加载音色列表中..." />
          </div>
        ) : filteredVoices.length === 0 ? (
          <Empty description="没有找到符合条件的音色" />
        ) : (
          <div style={{ maxHeight: '400px', overflowY: 'auto', overflowX: 'hidden' }}>
            <Row gutter={[12, 12]}>
              {filteredVoices.map((voice) => (
                <Col xs={24} sm={12} md={8} lg={6} key={voice.name}>
                  <div
                    onClick={() => handleSelectVoice(voice)}
                    style={{
                      cursor: 'pointer',
                      border: selectedVoice?.name === voice.name ? '2px solid #1890ff' : '1px solid #f0f0f0',
                      borderRadius: '8px',
                      padding: '12px',
                      background: selectedVoice?.name === voice.name ? '#e6f7ff' : '#fff',
                      position: 'relative',
                      transition: 'all 0.3s',
                    }}
                    onMouseEnter={(e) => {
                      if (selectedVoice?.name !== voice.name) {
                        e.currentTarget.style.borderColor = '#d9d9d9';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedVoice?.name !== voice.name) {
                        e.currentTarget.style.borderColor = '#f0f0f0';
                      }
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ position: 'relative', flexShrink: 0 }}>
                        <Avatar 
                          size={48} 
                          src={voice.image}
                          style={{ 
                            backgroundColor: voice.image ? 'transparent' : '#1890ff',
                          }}
                        >
                          {!voice.image && (voice.chineseName?.[0] || voice.name?.[0])}
                        </Avatar>
                        {voice.illustrationAudio && (
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePlayPreview(voice);
                            }}
                            style={{
                              position: 'absolute',
                              bottom: 0,
                              right: 0,
                              width: '18px',
                              height: '18px',
                              borderRadius: '50%',
                              background: '#8c8c8c',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              border: '2px solid #fff',
                              zIndex: 1,
                            }}
                          >
                            {playingVoice === voice.name ? (
                              <PauseCircleOutlined style={{ color: '#fff', fontSize: '10px' }} />
                            ) : (
                              <PlayCircleOutlined style={{ color: '#fff', fontSize: '10px' }} />
                            )}
                          </div>
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ 
                          fontWeight: 500, 
                          fontSize: '14px',
                          marginBottom: '4px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {voice.chineseName || voice.name}
                        </div>
                        <div style={{ 
                          fontSize: '12px', 
                          color: '#999',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {voice.region || voice.description}
                        </div>
                      </div>
                      <div 
                        onClick={(e) => toggleFavorite(voice.name, e)}
                        style={{ cursor: 'pointer', fontSize: '18px', flexShrink: 0 }}
                      >
                        {favorites.includes(voice.name) ? (
                          <StarFilled style={{ color: '#faad14' }} />
                        ) : (
                          <StarOutlined style={{ color: '#d9d9d9' }} />
                        )}
                      </div>
                    </div>
                  </div>
                </Col>
              ))}
            </Row>
          </div>
        )}
      </Space>
    </Modal>
  );
}

export default VoiceSelectionModal;
