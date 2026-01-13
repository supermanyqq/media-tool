const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  ffmpegVersion: () => ipcRenderer.invoke('ffmpeg-version'),
  dropFiles: (files) => ipcRenderer.invoke('files-dropped', files),
  chooseSaveAudioPath: (inputPath) => ipcRenderer.invoke('choose-save-audio-path', inputPath),
  extractAudio: (inputPath, outputPath, muteOriginal = true) =>
    ipcRenderer.invoke('extract-audio', { inputPath, outputPath, muteOriginal }),
  deleteFiles: (paths) => ipcRenderer.invoke('delete-files', paths),
  restoreVideo: (originalPath, backupPath) => ipcRenderer.invoke('restore-video', { originalPath, backupPath }),
  transcribeSubtitles: (inputPath, outputDir) =>
    ipcRenderer.invoke('transcribe-subtitles', { inputPath, outputDir }),
});