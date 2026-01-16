/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { spawn } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const VENDOR_DIR = path.join(PROJECT_ROOT, 'src', 'main', 'vendor', 'whisper');
const MODELS_DIR = path.join(VENDOR_DIR, 'models');

function envFlag(name) {
  const v = process.env[name];
  if (!v) return false;
  return v === '1' || v.toLowerCase() === 'true' || v.toLowerCase() === 'yes';
}

function log(msg) {
  console.log(`[postinstall:whisper] ${msg}`);
}

function warn(msg) {
  console.warn(`[postinstall:whisper] ${msg}`);
}

function failOrWarn(err, strict) {
  if (strict) {
    throw err;
  }
  warn(err instanceof Error ? err.message : String(err));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => resolve(res));
    req.on('error', reject);
    req.end();
  });
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, ...options });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d) => { stdout += d.toString(); });
    child.stderr?.on('data', (d) => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

async function expandZipWindows(zipPath, destDir) {
  // Use PowerShell's Expand-Archive to avoid extra npm dependencies.
  const ps = 'powershell';
  const script = [
    '$ErrorActionPreference = "Stop";',
    `Expand-Archive -LiteralPath "${zipPath.replace(/"/g, '""')}" -DestinationPath "${destDir.replace(/"/g, '""')}" -Force;`,
  ].join(' ');
  const r = await run(ps, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script]);
  if (r.code !== 0) {
    throw new Error(r.stderr || r.stdout || `Expand-Archive failed with code ${r.code}`);
  }
}

async function fetchJson(url, headers) {
  const res = await request(url, { headers });
  if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
    return fetchJson(res.headers.location, headers);
  }
  if (res.statusCode !== 200) {
    throw new Error(`HTTP ${res.statusCode} for ${url}`);
  }
  const chunks = [];
  for await (const c of res) chunks.push(c);
  const text = Buffer.concat(chunks).toString('utf-8');
  return JSON.parse(text);
}

async function downloadToFile(url, outPath, headers) {
  ensureDir(path.dirname(outPath));

  // On Windows, PowerShell's Invoke-WebRequest tends to work better in proxied networks.
  // If you want to force Node's https downloader, set MEDIATOOL_NODE_HTTPS_DOWNLOAD=1
  const forceNode = envFlag('MEDIATOOL_NODE_HTTPS_DOWNLOAD');
  if (process.platform === 'win32' && !forceNode) {
    const script = [
      '$ErrorActionPreference = "Stop";',
      '$ProgressPreference = "SilentlyContinue";',
      `Invoke-WebRequest -Uri "${url.replace(/"/g, '""')}" -OutFile "${outPath.replace(/"/g, '""')}" -UseBasicParsing;`,
    ].join(' ');
    const r = await run('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script]);
    if (r.code === 0) return outPath;
    // fall back to Node https below
  }

  const res = await request(url, { headers });
  if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
    return downloadToFile(res.headers.location, outPath, headers);
  }
  if (res.statusCode !== 200) {
    throw new Error(`HTTP ${res.statusCode} for ${url}`);
  }

  const total = Number(res.headers['content-length'] || 0);
  let got = 0;

  await new Promise((resolve, reject) => {
    const f = fs.createWriteStream(outPath);
    res.on('data', (chunk) => {
      got += chunk.length;
      if (total > 0) {
        const pct = Math.floor((got / total) * 100);
        if (pct === 0 || pct === 100 || pct % 10 === 0) {
          // avoid being too chatty
        }
      }
    });
    res.pipe(f);
    f.on('finish', resolve);
    f.on('error', reject);
  });

  return outPath;
}

function listFilesRecursive(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    const entries = fs.readdirSync(d, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else out.push(p);
    }
  }
  return out;
}

function copyIfExists(src, dest) {
  if (!fs.existsSync(src)) return false;
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
  return true;
}

async function installWhisperCppBinary({ tag, strict, dryRun }) {
  if (process.platform !== 'win32') {
    log(`platform=${process.platform} -> skip whisper.cpp binary auto-download (Windows-only in this project)`);
    return;
  }

  ensureDir(VENDOR_DIR);

  const expectedExe = path.join(VENDOR_DIR, 'whisper.exe');
  const expectedCli = path.join(VENDOR_DIR, 'whisper-cli.exe');
  const alreadyThere = fs.existsSync(expectedExe) || fs.existsSync(expectedCli);
  if (alreadyThere) {
    log('whisper binary already present -> skip download');
    return;
  }

  const forcedUrl = process.env.WHISPER_CPP_ASSET_URL;
  const headers = {
    'User-Agent': 'MediaTool-postinstall',
    'Accept': 'application/vnd.github+json',
  };

  let downloadUrl = forcedUrl;
  if (!downloadUrl) {
    const apiBase = 'https://api.github.com/repos/ggml-org/whisper.cpp/releases';
    const release = tag
      ? await fetchJson(`${apiBase}/tags/${encodeURIComponent(tag)}`, headers)
      : await fetchJson(`${apiBase}/latest`, headers);

    const assets = Array.isArray(release.assets) ? release.assets : [];
    const wantedName = process.arch === 'ia32' ? 'whisper-bin-Win32.zip' : 'whisper-bin-x64.zip';
    const asset = assets.find((a) => a && a.name === wantedName);
    if (!asset?.browser_download_url) {
      throw new Error(
        `Cannot find release asset '${wantedName}'. Set WHISPER_CPP_ASSET_URL to a direct .zip download URL.`
      );
    }
    downloadUrl = asset.browser_download_url;
    log(`using whisper.cpp ${release.tag_name} asset: ${wantedName}`);
  } else {
    log('using WHISPER_CPP_ASSET_URL override');
  }

  if (dryRun) {
    log(`[dry-run] would download whisper.cpp zip from: ${downloadUrl}`);
    return;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mediatool-whispercpp-'));
  const zipPath = path.join(tmpDir, 'whispercpp.zip');
  const extractDir = path.join(tmpDir, 'extract');
  ensureDir(extractDir);

  log('downloading whisper.cpp binary zip...');
  await downloadToFile(downloadUrl, zipPath, { 'User-Agent': 'MediaTool-postinstall' });

  log('extracting...');
  await expandZipWindows(zipPath, extractDir);

  // Copy relevant runtime files into vendor dir.
  const files = listFilesRecursive(extractDir);
  const exeAndDll = files.filter((p) => {
    const ext = path.extname(p).toLowerCase();
    return ext === '.exe' || ext === '.dll';
  });

  if (!exeAndDll.length) {
    throw new Error('No .exe/.dll found inside whisper.cpp zip');
  }

  for (const f of exeAndDll) {
    const base = path.basename(f);
    fs.copyFileSync(f, path.join(VENDOR_DIR, base));
  }

  // Normalize executable name expected by the app.
  if (!fs.existsSync(expectedExe) && fs.existsSync(expectedCli)) {
    fs.copyFileSync(expectedCli, expectedExe);
  }

  if (!fs.existsSync(expectedExe)) {
    throw new Error('whisper.exe was not installed successfully');
  }

  log(`installed whisper.cpp binary to ${VENDOR_DIR}`);
}

async function installModel({ modelName, strict, dryRun }) {
  if (envFlag('WHISPER_CPP_SKIP_MODEL') || envFlag('MEDIATOOL_SKIP_WHISPER_MODEL')) {
    log('model download skipped via env');
    return;
  }

  ensureDir(MODELS_DIR);
  const modelPath = path.join(MODELS_DIR, modelName);
  if (fs.existsSync(modelPath)) {
    log(`model already present (${modelName}) -> skip download`);
    return;
  }

  const forcedUrl = process.env.WHISPER_CPP_MODEL_URL;
  // Official guidance in whisper.cpp points to: https://huggingface.co/ggerganov/whisper.cpp
  const candidates = forcedUrl
    ? [forcedUrl]
    : [
        `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${encodeURIComponent(modelName)}`,
        `https://huggingface.co/ggml-org/whisper.cpp/resolve/main/${encodeURIComponent(modelName)}`,
        `https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/${encodeURIComponent(modelName)}`,
        `https://hf-mirror.com/ggml-org/whisper.cpp/resolve/main/${encodeURIComponent(modelName)}`,
      ];

  if (dryRun) {
    log(`[dry-run] would download model from: ${candidates[0]}`);
    return;
  }

  log(`downloading model (${modelName})... (this can be large)`);
  let lastErr = null;
  for (const url of candidates) {
    try {
      await downloadToFile(url, modelPath, { 'User-Agent': 'MediaTool-postinstall' });
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      try {
        if (fs.existsSync(modelPath)) fs.unlinkSync(modelPath);
      } catch {
        // ignore
      }
    }
  }

  if (lastErr) {
    // If model download fails, keep binary installed and allow fallback to system whisper.
    failOrWarn(lastErr, strict);
    return;
  }

  log(`installed model to ${modelPath}`);
}

async function main() {
  const strict = envFlag('MEDIATOOL_WHISPER_STRICT');
  const dryRun = process.argv.includes('--dry-run');

  if (envFlag('MEDIATOOL_SKIP_WHISPER_DOWNLOAD')) {
    log('skipped via MEDIATOOL_SKIP_WHISPER_DOWNLOAD=1');
    return;
  }

  const tag = process.env.WHISPER_CPP_TAG || process.env.npm_package_config_whisperCppTag || 'v1.8.2';
  const modelName = process.env.WHISPER_CPP_MODEL_NAME || process.env.npm_package_config_whisperCppModel || 'ggml-base.bin';

  try {
    await installWhisperCppBinary({ tag, strict, dryRun });
    await installModel({ modelName, strict, dryRun });
  } catch (e) {
    failOrWarn(e, strict);
  }
}

main();
