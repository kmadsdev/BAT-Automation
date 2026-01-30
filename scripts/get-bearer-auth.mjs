#!/usr/bin/env node

import { execSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const TARGET_URL = process.env.SURVEY_AUTH_URL ?? 'http://survey-picpay.ms.qa/home';
const CHROME_DEBUG_PORT = Number(process.env.CHROME_DEBUG_PORT ?? '9222');
const DEFAULT_USER_DATA_DIR = join(
    process.env.HOME ?? tmpdir(),
    'Library/Application Support/Google/Chrome'
);
const USER_DATA_DIR = process.env.CHROME_PROFILE_DIR ?? DEFAULT_USER_DATA_DIR;
const PROFILE_NAME = process.env.CHROME_PROFILE_NAME ?? 'Trabalho';
const CHROME_BIN = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ENV_PATH = resolve(process.cwd(), '.env');
const TIMEOUT_MS = Number(process.env.AUTH_CAPTURE_TIMEOUT_MS ?? '60000');
const DEVTOOLS_STARTUP_MS = Number(process.env.DEVTOOLS_STARTUP_MS ?? '20000');
const SNAPSHOT_MODE = (process.env.CHROME_PROFILE_SNAPSHOT ?? 'auto').toLowerCase();

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}get-be

function shouldUseSnapshot(isRunning) {
    if (SNAPSHOT_MODE === 'always') {
        return true;
    }
    if (SNAPSHOT_MODE === 'never') {
        return false;
    }
    return isRunning;
}

function createProfileSnapshot(profileDir) {
    const snapshotRoot = mkdtempSync(join(tmpdir(), 'chrome-auth-'));
    const localStateSrc = join(USER_DATA_DIR, 'Local State');
    const localStateDest = join(snapshotRoot, 'Local State');
    const profileSrc = join(USER_DATA_DIR, profileDir);
    const profileDest = join(snapshotRoot, profileDir);

    if (!existsSync(profileSrc)) {
        throw new Error(`Chrome profile found: ${profileSrc}`);
    }

    if (existsSync(localStateSrc)) {
        cpSync(localStateSrc, localStateDest);
    }
    cpSync(profileSrc, profileDest, { recursive: true });

    return snapshotRoot;
}

function launchChrome({ userDataDir, profileDir }) {
    const args = [
        `--remote-debugging-port=${CHROME_DEBUG_PORT}`,
        `--user-data-dir=${userDataDir}`,
        `--profile-directory=${profileDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--new-window',
        TARGET_URL,
    ];

    if (existsSync(CHROME_BIN)) {
        const child = spawn(CHROME_BIN, args, { detached: true, stdio: 'ignore' });
        child.unref();
        return;
    }

    try {
        execSync(`open -na "Google Chrome" --args ${args.map((arg) => `'${arg}'`).join(' ')}`);
    } catch (error) {
        console.error('Chrome failed to run. Close the all opened tabs and try again.');
        throw error;
    }
}

function resolveProfileDirectory(displayName) {
  const fallback = displayName || 'Default';
  const localStatePath = join(USER_DATA_DIR, 'Local State');

  if (!existsSync(localStatePath)) {
    return fallback;
  }

  try {
    const raw = readFileSync(localStatePath, 'utf8');
    const data = JSON.parse(raw);
    const infoCache = data?.profile?.info_cache ?? {};

    for (const [dir, info] of Object.entries(infoCache)) {
      if (info?.name === displayName) {
        return dir;
      }
    }
  } catch {
    // ignore and fall back to provided name
  }

  return fallback;
}

async function waitForDevtools() {
  const deadline = Date.now() + DEVTOOLS_STARTUP_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://localhost:${CHROME_DEBUG_PORT}/json/version`, { cache: 'no-store' });
      if (response.ok) {
        return response.json();
      }
    } catch {
      // keep trying
    }
    await sleep(300);
  }

  throw new Error(
    `Chrome DevTools did not answered in http://localhost:${CHROME_DEBUG_PORT}. ` +
    'Verify if Chrome started or the remote debugging is active.'
  );
}

async function getWebSocketDebuggerUrl() {
  const listTargets = async () => {
    const response = await fetch(`http://localhost:${CHROME_DEBUG_PORT}/json`, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error('Couldn\'t list all pages from DevTools.');
    }
    return response.json();
  };

  const pickTarget = (targets) => targets.find((item) => item.type === 'page' && item.url?.includes(TARGET_URL))
    || targets.find((item) => item.type === 'page');

  let targets = await listTargets();
  let target = pickTarget(targets);

  if (target?.webSocketDebuggerUrl) {
    return target.webSocketDebuggerUrl;
  }

  openTabWithAppleScript(TARGET_URL);

  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    await sleep(300);
    targets = await listTargets();
    target = pickTarget(targets);
    if (target?.webSocketDebuggerUrl) {
      return target.webSocketDebuggerUrl;
    }
  }

  throw new Error(
    'Couldn\'t open page from DevTools. ' +
    'Close your Chrome and try running again.'
  );
}

function openTabWithAppleScript(url) {
  try {
    const safeUrl = String(url).replace(/"/g, '\\"');
    execSync(
      `osascript -e 'tell application \"Google Chrome\" to open location \"${safeUrl}\"'`,
      { stdio: 'ignore' }
    );
  } catch {
    // ignore and let the retry logic handle it
  }
}

function normalizeAuthorization(raw) {
  if (!raw) {
    return '';
  }

  const cleaned = String(raw).trim();
  const withoutPrefix = cleaned.replace(/^bearer/i, '').trim();
  const token = withoutPrefix.replace(/\s+/g, '');
  return `Bearer ${token}`;
}

function updateEnvFile(authorization) {
  const line = `AUTHORIZATION="${authorization}"`;

  if (!existsSync(ENV_PATH)) {
    writeFileSync(ENV_PATH, line + '\n', 'utf8');
    return;
  }

  const current = readFileSync(ENV_PATH, 'utf8');
  if (/^AUTHORIZATION=.*$/m.test(current)) {
    const updated = current.replace(/^AUTHORIZATION=.*$/m, line);
    writeFileSync(ENV_PATH, updated, 'utf8');
    return;
  }

  const separator = current.endsWith('\n') ? '' : '\n';
  writeFileSync(ENV_PATH, current + separator + line + '\n', 'utf8');
}

function extractAuthorization(headers) {
  if (!headers || typeof headers !== 'object') {
    return null;
  }

  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === 'authorization') {
      return value;
    }
  }

  return null;
}

async function captureAuthorization(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let nextId = 1;
    let timeout = null;

    const finish = (error, auth) => {
      if (timeout) {
        clearTimeout(timeout);
      }
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      if (error) {
        reject(error);
        return;
      }
      resolve(auth);
    };

    timeout = setTimeout(() => {
      finish(new Error('Timeout while capturing Authorization.'));
    }, TIMEOUT_MS);

    ws.onopen = () => {
      ws.send(JSON.stringify({ id: nextId++, method: 'Network.enable' }));
      ws.send(JSON.stringify({ id: nextId++, method: 'Page.enable' }));
      ws.send(JSON.stringify({
        id: nextId++,
        method: 'Page.navigate',
        params: { url: TARGET_URL },
      }));
    };

    ws.onmessage = (event) => {
      let payload;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }

      if (payload.method === 'Network.requestWillBeSent') {
        const request = payload.params?.request;
        const url = request?.url ?? '';
        if (!url.includes('/account')) {
          return;
        }

        const auth = extractAuthorization(request?.headers);
        if (auth) {
          finish(null, auth);
        }
      }

      if (payload.method === 'Network.requestWillBeSentExtraInfo') {
        const headers = payload.params?.headers;
        const auth = extractAuthorization(headers);
        if (auth) {
          finish(null, auth);
        }
      }
    };

    ws.onerror = (error) => finish(error instanceof Error ? error : new Error('Erro no WebSocket'));
  });
}

function isChromeRunning() {
  try {
    execSync('pgrep -x "Google Chrome"', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function closeBrowser(wsUrl) {
  if (!wsUrl) {
    return;
  }

  await new Promise((resolve) => {
    const ws = new WebSocket(wsUrl);
    let finished = false;

    const done = () => {
      if (finished) return;
      finished = true;
      resolve();
    };

    ws.onopen = () => {
      ws.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
      setTimeout(done, 1000);
    };

    ws.onclose = done;
    ws.onerror = done;
  });
}

async function main() {
  const chromeRunning = isChromeRunning();
  const profileDir = resolveProfileDirectory(PROFILE_NAME);
  let userDataDir = USER_DATA_DIR;
  let cleanupDir = null;

  if (shouldUseSnapshot(chromeRunning)) {
    userDataDir = createProfileSnapshot(profileDir);
    cleanupDir = userDataDir;
  }

  launchChrome({ userDataDir, profileDir });

  const devtoolsInfo = await waitForDevtools();
  const wsUrl = await getWebSocketDebuggerUrl();
  const rawAuth = await captureAuthorization(wsUrl);
  const normalized = normalizeAuthorization(rawAuth);

  if (!normalized || normalized === 'Bearer ') {
    throw new Error('Authorization vazio ou inválido.');
  }

  updateEnvFile(normalized);
  await closeBrowser(devtoolsInfo?.webSocketDebuggerUrl);

  if (cleanupDir) {
    try {
      rmSync(cleanupDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }

  console.log('AUTHORIZATION atualizado em .env');
}

main().catch((error) => {
  console.error(error?.message ?? error);
  process.exit(1);
});
