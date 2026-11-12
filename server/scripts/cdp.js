// server/scripts/cdp.js — Person 1
// A tiny remote control for a headless Chrome, used by screens-walkthrough.js to click through the
// app and save screenshots. It uses only Node's built-ins (child_process, fetch, WebSocket), so no
// npm package is needed.
//
// How it works: Chrome started with --remote-debugging-port opens a small web server. We ask it for
// a page's "DevTools WebSocket" address, then send it JSON commands such as
// { id: 1, method: 'Page.navigate', params: { url } } and wait for the reply with the same id.
// That is the Chrome DevTools Protocol (CDP), the same thing Chrome's own DevTools use.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Where Chrome usually lives on Windows, macOS and Linux. CHROME_PATH overrides it.
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

/** A promise that resolves after `ms` milliseconds. */
export function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Start a headless Chrome and connect to its first tab.
 * @param {{ port?: number, width?: number, height?: number }} options
 * @returns {Promise<object>} a "page" with send(), eval(), goto(), screenshot(), close()
 */
export async function launchChrome({ port = 9333, width = 1440, height = 900 } = {}) {
  const chromePath = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!chromePath) {
    throw new Error('[cdp] Chrome not found. Set CHROME_PATH to chrome.exe (or msedge.exe).');
  }

  // A throwaway profile folder, so we never touch the real browser's profile.
  const profileDir = path.join(tmpdir(), `proxispeak-cdp-${Date.now()}`);
  const chrome = spawn(
    chromePath,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profileDir}`,
      `--window-size=${width},${height}`,
      // A fake microphone, and no permission pop-up, so the lobby's mic test and "Join" work.
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  // Wait until Chrome's debugging web server answers (up to about 10 seconds).
  let targets = null;
  for (let attempt = 0; attempt < 50 && targets === null; attempt += 1) {
    await pause(200);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = await response.json();
      const pageTarget = list.find((target) => target.type === 'page');
      if (pageTarget) targets = pageTarget;
    } catch {
      // not up yet
    }
  }
  if (targets === null) {
    chrome.kill();
    throw new Error(`[cdp] Chrome did not open its debugging port ${port}.`);
  }

  const page = await connectToTarget(targets.webSocketDebuggerUrl);
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  await page.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  // A second tab in the same Chrome (its own sessionStorage, so it can sign in as someone else).
  page.openPage = async () => {
    const response = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
    const target = await response.json();
    const extra = await connectToTarget(target.webSocketDebuggerUrl);
    await extra.send('Page.enable');
    await extra.send('Runtime.enable');
    await extra.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    // Bring the first tab back to the front: a background tab may pause its animation.
    await page.send('Page.bringToFront');
    return extra;
  };
  page.close = async () => {
    try {
      page.socket.close();
    } catch {
      // already closed
    }
    chrome.kill();
  };
  return page;
}

/** Open the DevTools WebSocket of one tab and wrap it in a few helpers. */
async function connectToTarget(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  let nextId = 1;
  const waiting = new Map(); // id → { resolve, reject }
  const consoleLines = [];

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && waiting.has(message.id)) {
      const { resolve, reject } = waiting.get(message.id);
      waiting.delete(message.id);
      if (message.error) reject(new Error(`[cdp] ${message.error.message}`));
      else resolve(message.result);
    }
    // Keep the page's console output, so a failing walkthrough can print what the app said.
    if (message.method === 'Runtime.consoleAPICalled') {
      const text = message.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' ');
      consoleLines.push(text);
    }
  });

  /** Send one command and wait for its answer. */
  function send(method, params = {}) {
    const id = nextId;
    nextId += 1;
    socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => waiting.set(id, { resolve, reject }));
  }

  /** Run JavaScript in the page and give back its (JSON-able) result. Promises are awaited. */
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      throw new Error(`[cdp] page error: ${result.exceptionDetails.exception?.description || result.exceptionDetails.text}`);
    }
    return result.result.value;
  }

  /** Go to a URL and wait a moment for React to draw. */
  async function goto(url, settleMs = 1200) {
    await send('Page.navigate', { url });
    await pause(settleMs);
  }

  /** Wait until `expression` is true in the page (checked every 100 ms), or fail after timeoutMs. */
  async function waitFor(expression, timeoutMs = 8000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      try {
        if (await evaluate(`Boolean(${expression})`)) return;
      } catch {
        // the page may be navigating
      }
      await pause(100);
    }
    throw new Error(`[cdp] timed out waiting for: ${expression}`);
  }

  /** Save a PNG of the visible page. */
  async function screenshot(filePath) {
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, Buffer.from(data, 'base64'));
    console.log(`[cdp] saved ${filePath}`);
  }

  /** Press one key (e.g. 'ArrowRight' or 'd'), optionally holding it for holdMs. */
  async function press(key, { holdMs = 0, ctrl = false } = {}) {
    const modifiers = ctrl ? 2 : 0;
    const code = key.length === 1 ? `Key${key.toUpperCase()}` : key;
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, modifiers, windowsVirtualKeyCode: keyCodeOf(key) });
    if (holdMs > 0) await pause(holdMs);
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, modifiers, windowsVirtualKeyCode: keyCodeOf(key) });
  }

  return { socket, send, eval: evaluate, goto, waitFor, screenshot, press, consoleLines };
}

/** The old numeric key codes some code still reads. */
function keyCodeOf(key) {
  const codes = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Enter: 13, Escape: 27 };
  if (codes[key]) return codes[key];
  return key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0;
}
