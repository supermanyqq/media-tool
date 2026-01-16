const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  chatCompletion: (args) => ipcRenderer.invoke('chat-completion', args),
  saveApiConfig: (config) => ipcRenderer.invoke('save-api-config', config),
  loadApiConfig: () => ipcRenderer.invoke('load-api-config'),
  synthesizeSpeech: (args) => ipcRenderer.invoke('synthesize-speech', args),
  queryVoiceList: (modelId) => ipcRenderer.invoke('query-voice-list', modelId),
});
