import React from 'react';
import { Modal, Form, Input, Button, Divider, Typography } from 'antd';

const { Text, Link } = Typography;

function ConfigModal({ visible, config, onSave, onCancel }) {
  const [form] = Form.useForm();

  const handleSubmit = async (values) => {
    await onSave(values);
    form.resetFields();
  };

  return (
    <Modal
      title="通义千问 API 配置"
      open={visible}
      onCancel={onCancel}
      footer={null}
      width={500}
    >
      <div style={{ marginBottom: '16px' }}>
        <Text type="secondary">
          使用阿里云通义千问 API，需要先获取 API Key。
        </Text>
        <div style={{ marginTop: '8px' }}>
          <Link 
            href="https://bailian.console.aliyun.com/cn-beijing/?tab=model#/api-key" 
            target="_blank"
          >
            如何获取 API Key？
          </Link>
        </div>
      </div>

      <Divider />

      <Form
        form={form}
        layout="vertical"
        initialValues={config}
        onFinish={handleSubmit}
      >
        <Form.Item
          label="API Key"
          name="apiKey"
          rules={[
            { required: true, message: '请输入通义千问 API Key' },
            { 
              pattern: /^sk-[a-zA-Z0-9]+$/, 
              message: 'API Key 格式不正确，应以 sk- 开头' 
            }
          ]}
          extra="格式：sk-xxxxxxxxxxxxxxxx"
        >
          <Input.Password 
            placeholder="sk-..." 
            autoComplete="off"
          />
        </Form.Item>

        <Form.Item>
          <Button type="primary" htmlType="submit" block size="large">
            保存配置
          </Button>
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default ConfigModal;
