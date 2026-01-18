const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  chatCompletion: (args) => ipcRenderer.invoke('chat-completion', args),
  saveApiConfig: (config) => ipcRenderer.invoke('save-api-config', config),
  loadApiConfig: () => ipcRenderer.invoke('load-api-config'),
  synthesizeSpeech: (args) => ipcRenderer.invoke('synthesize-speech', args),
  queryVoiceList: (modelId) => ipcRenderer.invoke('query-voice-list', modelId),
  createClonedVoice: (args) => ipcRenderer.invoke('create-cloned-voice', args),
  listClonedVoices: () => ipcRenderer.invoke('list-cloned-voices'),
  deleteClonedVoice: (voiceId) => ipcRenderer.invoke('delete-cloned-voice', voiceId),
});
