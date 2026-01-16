const { app, BrowserWindow, ipcMain, protocol, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(ffmpegPath);

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

function registerLocalProtocol() {
  protocol.registerFileProtocol('local', (request, callback) => {
    try {
      const u = new URL(request.url);

      const host = u.host;
      const pathname = decodeURIComponent(u.pathname || '');

      let filePath;

      if (/^[A-Za-z]$/.test(host)) {
        filePath = `${host}:${pathname}`;
      } else if (pathname.match(/^\/[A-Za-z]:\//)) {
        filePath = pathname.slice(1);
      } else {
        filePath = decodeURIComponent(`${host}${pathname}`);
      }

      callback({ path: path.normalize(filePath) });
    } catch {
      callback({ error: -324 });
    }
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  }

  win.webContents.openDevTools({ mode: 'detach' });
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      ...options,
    });

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d) => { stdout += d.toString(); });
    child.stderr?.on('data', (d) => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

function firstExistingPath(candidates) {
  for (const p of candidates) {
    try {
      if (p && typeof p === 'string' && fs.existsSync(p)) return p;
    } catch {
      // ignore
    }
  }
  return '';
}

function getBundledWhisperCppBin() {
  const envBin = process.env.WHISPER_CPP_BIN;
  if (envBin && fs.existsSync(envBin)) return envBin;

  const names = process.platform === 'win32'
    ? ['whisper.exe', 'whisper-cli.exe']
    : ['whisper', 'whisper-cli'];

  const candidates = [];
  for (const name of names) {
    candidates.push(path.join(process.resourcesPath || '', 'whisper', name));
    candidates.push(path.join(__dirname, 'vendor', 'whisper', name));
  }

  return firstExistingPath(candidates);
}

function getBundledWhisperCppModel() {
  const envModel = process.env.WHISPER_CPP_MODEL;
  if (envModel && fs.existsSync(envModel)) return envModel;

  const devModelsDir = path.join(__dirname, 'vendor', 'whisper', 'models');
  const packagedModelsDir = path.join(process.resourcesPath || '', 'whisper', 'models');

  const pickFromDir = (dir) => {
    try {
      if (!dir || !fs.existsSync(dir)) return '';
      const files = fs.readdirSync(dir);
      // Prefer a reasonable default if present.
      const preferred = [
        'ggml-small.bin',
        'ggml-base.bin',
        'ggml-medium.bin',
        'ggml-tiny.bin',
      ];
      for (const name of preferred) {
        const p = path.join(dir, name);
        if (fs.existsSync(p)) return p;
      }
      const anyBin = files.find((n) => n.toLowerCase().endsWith('.bin'));
      return anyBin ? path.join(dir, anyBin) : '';
    } catch {
      return '';
    }
  };

  return pickFromDir(packagedModelsDir) || pickFromDir(devModelsDir) || '';
}

async function ensureWav16kMono(inputPath, wavPath) {
  fs.mkdirSync(path.dirname(wavPath), { recursive: true });
  await new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioChannels(1)
      .audioFrequency(16000)
      .audioCodec('pcm_s16le')
      .format('wav')
      .on('end', resolve)
      .on('error', reject)
      .save(wavPath);
  });
}

async function transcribeWithWhisperCpp(inputWavPath, outputDir, env) {
  const bin = getBundledWhisperCppBin();
  const model = getBundledWhisperCppModel();
  if (!bin || !model) {
    throw new Error(
      'Bundled whisper.cpp not found. Set WHISPER_CPP_BIN and WHISPER_CPP_MODEL or place vendor files.'
    );
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const outBase = path.join(outputDir, 'whispercpp_out');

  // whisper.cpp CLI uses: -m <model> -f <audio.wav> -of <out_base> -osrt
  const args = ['-m', model, '-f', inputWavPath, '-of', outBase, '-osrt'];
  const r = await runCommand(bin, args, { env });
  if (r.code !== 0) {
    throw new Error(r.stderr || r.stdout || `whisper.cpp exited with code ${r.code}`);
  }

  const srtPath = `${outBase}.srt`;
  if (!fs.existsSync(srtPath)) {
    const anySrt = fs.readdirSync(outputDir).find((n) => n.toLowerCase().endsWith('.srt'));
    if (!anySrt) throw new Error('whisper.cpp did not produce .srt output');
    return { runner: 'whisper.cpp', code: 0, stdout: r.stdout, stderr: r.stderr, srtPath: path.join(outputDir, anySrt) };
  }
  return { runner: 'whisper.cpp', code: 0, stdout: r.stdout, stderr: r.stderr, srtPath };
}

async function transcribeWithWhisperCli(inputAudioPath, outputDir, env) {
  // Try `whisper ...` first; if not installed, fall back to `python -m whisper ...`.
  const baseArgs = [
    inputAudioPath,
    '--output_dir', outputDir,
    '--output_format', 'srt',
    '--verbose', 'False',
    '--fp16', 'False',
  ];

  try {
    const r1 = await runCommand('whisper', baseArgs, { env });
    if (r1.code === 0) return { runner: 'whisper', ...r1 };
    // Non-zero could be model download fail, etc. Surface stderr.
    throw new Error(r1.stderr || r1.stdout || `whisper exited with code ${r1.code}`);
  } catch (e) {
    // ENOENT or other spawn errors -> try python module
    const r2 = await runCommand('python', ['-m', 'whisper', ...baseArgs], { env });
    if (r2.code === 0) return { runner: 'python -m whisper', ...r2 };
    throw new Error(r2.stderr || r2.stdout || `python -m whisper exited with code ${r2.code}`);
  }
}

function pickUniquePath(dir, fileName) {
  const parsed = path.parse(fileName);
  const base = parsed.name || 'subtitles';
  const ext = parsed.ext || '.srt';
  let candidate = path.join(dir, `${base}${ext}`);
  if (!fs.existsSync(candidate)) return candidate;
  let i = 1;
  while (true) {
    const next = path.join(dir, `${base} (${i})${ext}`);
    if (!fs.existsSync(next)) return next;
    i += 1;
  }
}

ipcMain.handle('ffmpeg-version', async () => {
  return new Promise((resolve, reject) => {
    ffmpeg()._getFfmpegVersion(function(err, version) {
      if (err) return reject(err);
      resolve(version);
    });
  });
});

ipcMain.handle('files-dropped', async (event, files) => {
  console.log('Files dropped:', files);
  // For now just acknowledge receipt. Further processing (transcode, probe, etc.) can be added.
  return { received: files.length, files };
});

ipcMain.handle('choose-save-audio-path', async (event, inputPath) => {
  if (!inputPath || typeof inputPath !== 'string') {
    throw new Error('Invalid input path');
  }

  const parsed = path.parse(inputPath);
  const safeBase = (parsed.name || 'audio').replace(/[\\/:*?"<>|]/g, '_');

  const outDir = path.join(app.getPath('userData'), 'extracted-audio');
  fs.mkdirSync(outDir, { recursive: true });

  const { canceled, filePath } = await dialog.showSaveDialog({
    title: '保存分离的音频',
    defaultPath: path.join(outDir, `${safeBase}.m4a`),
    filters: [
      { name: 'Audio (m4a)', extensions: ['m4a'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  return { canceled, filePath: filePath || '' };
});

ipcMain.handle('extract-audio', async (event, args) => {
  const inputPath = args?.inputPath;
  let outputPath = args?.outputPath;
  const muteOriginal = args?.muteOriginal !== false;

  if (!inputPath || typeof inputPath !== 'string') {
    throw new Error('Invalid input path');
  }
  const parsed = path.parse(inputPath);
  const safeBase = (parsed.name || 'video').replace(/[\\/:*?"<>|]/g, '_');
  const ext = parsed.ext || '.mp4';

  const audioTag = '__mediatool_audio';
  const mutedTag = '__mediatool_muted';

  if (!outputPath || typeof outputPath !== 'string') {
    const base = path.join(parsed.dir, `${safeBase}${audioTag}.m4a`);
    outputPath = base;
    if (fs.existsSync(outputPath)) {
      let i = 1;
      while (true) {
        const candidate = path.join(parsed.dir, `${safeBase}${audioTag} (${i}).m4a`);
        if (!fs.existsSync(candidate)) {
          outputPath = candidate;
          break;
        }
        i += 1;
      }
    }
  }

  const backupDir = path.join(app.getPath('userData'), 'video-backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupVideoPath = path.join(backupDir, `${safeBase}-${Date.now()}${ext}`);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  await new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .noVideo()
      .audioCodec('aac')
      .audioBitrate('192k')
      .outputOptions(['-movflags +faststart'])
      .on('end', resolve)
      .on('error', reject)
      .save(outputPath);
  });

  if (muteOriginal) {
    let mutedVideoPath = path.join(parsed.dir, `${safeBase}${mutedTag}${ext}`);
    if (fs.existsSync(mutedVideoPath)) {
      let i = 1;
      while (true) {
        const candidate = path.join(parsed.dir, `${safeBase}${mutedTag} (${i})${ext}`);
        if (!fs.existsSync(candidate)) {
          mutedVideoPath = candidate;
          break;
        }
        i += 1;
      }
    }

    const faststartExts = new Set(['.mp4', '.m4v', '.mov']);
    const extra = faststartExts.has(ext.toLowerCase()) ? ['-movflags +faststart'] : [];

    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .noAudio()
        .videoCodec('copy')
        .outputOptions(['-map 0:v:0?'].concat(extra))
        .on('end', resolve)
        .on('error', reject)
        .save(mutedVideoPath);
    });

    return { outputPath, mutedVideoPath, muted: true, muteError: '' };
  }

  return { outputPath, mutedVideoPath: '', muted: false, muteError: '' };
});

ipcMain.handle('restore-video', async (event, args) => {
  const originalPath = args?.originalPath;
  const backupPath = args?.backupPath;

  if (!originalPath || typeof originalPath !== 'string') {
    throw new Error('Invalid original path');
  }
  if (!backupPath || typeof backupPath !== 'string') {
    throw new Error('Invalid backup path');
  }
  if (!fs.existsSync(backupPath)) {
    throw new Error('Backup file not found');
  }

  fs.copyFileSync(backupPath, originalPath);
  try {
    fs.unlinkSync(backupPath);
  } catch {
    // ignore
  }

  return { restored: true };
});

ipcMain.handle('delete-files', async (event, filePaths) => {
  const list = Array.isArray(filePaths) ? filePaths : [];
  const results = list.map((p) => ({ path: p, deleted: false, error: '' }));

  for (const r of results) {
    try {
      if (!r.path || typeof r.path !== 'string') continue;
      if (fs.existsSync(r.path)) fs.unlinkSync(r.path);
      r.deleted = true;
    } catch (e) {
      r.error = e?.message || String(e);
    }
  }

  return { results };
});

ipcMain.handle('transcribe-subtitles', async (event, args) => {
  const inputPath = args?.inputPath;
  if (!inputPath || typeof inputPath !== 'string') {
    throw new Error('Invalid input path');
  }
  if (!fs.existsSync(inputPath)) {
    throw new Error('Input file not found');
  }

  const parsed = path.parse(inputPath);
  const safeBase = (parsed.name || 'audio').replace(/[\\/:*?"<>|]/g, '_');
  const tag = '__mediatool_subtitles';

  const outDir = args?.outputDir && typeof args.outputDir === 'string'
    ? args.outputDir
    : parsed.dir;
  fs.mkdirSync(outDir, { recursive: true });

  // Whisper writes <basename>.srt; we generate in a temp dir then move/rename.
  const tmpRoot = path.join(app.getPath('userData'), 'subtitles-tmp', String(Date.now()));
  fs.mkdirSync(tmpRoot, { recursive: true });

  // Convert to a known-good format for both whisper.cpp and python-whisper.
  const wavPath = path.join(tmpRoot, `${safeBase}.wav`);
  await ensureWav16kMono(inputPath, wavPath);

  const env = {
    ...process.env,
    // Ensure ffmpeg from ffmpeg-static is discoverable for python whisper.
    PATH: `${path.dirname(ffmpegPath)}${path.delimiter}${process.env.PATH || ''}`,
  };

  let producedSrtPath = '';
  let whisperCppErr = null;
  try {
    // Prefer bundled whisper.cpp for a self-contained app experience.
    const r = await transcribeWithWhisperCpp(wavPath, tmpRoot, env);
    producedSrtPath = r?.srtPath || '';
  } catch (e) {
    whisperCppErr = e;
    try {
      // Fall back to system whisper / python module.
      await transcribeWithWhisperCli(wavPath, tmpRoot, env);
      const guessed = path.join(tmpRoot, `${safeBase}.srt`);
      if (fs.existsSync(guessed)) producedSrtPath = guessed;
    } catch (e2) {
      const hint =
        '字幕识别不可用：未找到内置 whisper.cpp，且系统 whisper 也不可用。\n' +
        '解决方式：\n' +
        '1) 在项目根目录运行：node scripts/postinstall-whisper.js（自动下载 whisper.cpp + 模型）\n' +
        '2) 或设置环境变量 WHISPER_CPP_BIN / WHISPER_CPP_MODEL 指向你的 whisper.cpp 与模型\n' +
        '3) 或安装 Python whisper，使 whisper / python -m whisper 可用。';

      const details = [
        whisperCppErr ? `whisper.cpp: ${whisperCppErr.message || String(whisperCppErr)}` : '',
        e2 ? `system whisper: ${e2.message || String(e2)}` : '',
      ].filter(Boolean).join('\n');

      throw new Error(`${hint}${details ? `\n\n${details}` : ''}`);
    }
  }

  if (!producedSrtPath || !fs.existsSync(producedSrtPath)) {
    const anySrt = fs.readdirSync(tmpRoot).find((n) => n.toLowerCase().endsWith('.srt'));
    if (!anySrt) throw new Error('Transcription did not produce .srt output');
    producedSrtPath = path.join(tmpRoot, anySrt);
  }

  const outputPath = pickUniquePath(outDir, `${safeBase}${tag}.srt`);
  fs.copyFileSync(producedSrtPath, outputPath);

  let srtText = '';
  try {
    srtText = fs.readFileSync(outputPath, 'utf-8');
  } catch {
    srtText = '';
  }

  return { outputPath, srtText };
});

app.whenReady().then(() => {
  registerLocalProtocol();
  createWindow();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });