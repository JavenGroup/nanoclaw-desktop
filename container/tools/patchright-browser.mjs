#!/usr/bin/env node
/**
 * Patchright Browser Tool
 * Anti-detection browser automation using Patchright (undetected Playwright fork).
 *
 * Browser profile is persisted per-conversation via Chromium's --user-data-dir.
 * Chromium is spawned as a detached process and controlled via CDP, so it survives
 * Node process exits — login state and open pages persist across tool invocations.
 *
 * Usage:
 *   patchright-browser open <url>           Open URL in headed Chromium
 *   patchright-browser screenshot [url]     Take screenshot (optionally navigate first)
 *   patchright-browser html [url]           Print page HTML
 *   patchright-browser text [url]           Print visible text
 *   patchright-browser click <selector>     Click element (requires open page)
 *   patchright-browser type <selector> <text>  Type into element
 *   patchright-browser eval <js>            Evaluate JavaScript on current page
 *   patchright-browser close                Close browser
 *   patchright-browser status               Show browser status
 */

import { chromium } from 'patchright';
import { spawn } from 'child_process';
import net from 'net';
import fs from 'fs';
import path from 'path';
import http from 'http';

const WORKSPACE_BASE = process.env.WORKSPACE_BASE || '/tmp';
const PROFILE_DIR = path.join(WORKSPACE_BASE, 'group', '.browser-data');
const STATE_FILE = path.join(PROFILE_DIR, '.state.json');
const SCREENSHOT_DIR = path.join(WORKSPACE_BASE, 'group');

// --- State management ---

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    }
  } catch {}
  return null;
}

function saveState(port, pid) {
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify({ port, pid }));
}

function clearState() {
  try { fs.unlinkSync(STATE_FILE); } catch {}
}

// --- CDP helpers ---

/** Check if Chrome's CDP endpoint is reachable */
function isCdpAlive(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/json/version`, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(res.statusCode === 200));
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => { req.destroy(); resolve(false); });
  });
}

/** Wait for Chrome's debug port to become available */
async function waitForCdpReady(port, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isCdpAlive(port)) return;
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`Chrome CDP not ready on port ${port} after ${timeoutMs}ms`);
}

/** Find an available TCP port */
function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

// --- Browser lifecycle ---

/** Spawn a detached Chromium process with persistent profile and CDP */
function spawnChromium(debugPort) {
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  const execPath = chromium.executablePath();
  const child = spawn(execPath, [
    `--user-data-dir=${PROFILE_DIR}`,
    `--remote-debugging-port=${debugPort}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--lang=zh-CN',
    '--window-size=1280,800',
    'about:blank',
  ], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  return child;
}

/** Connect to existing browser or launch a new one */
async function ensureBrowser(url) {
  let port;
  const state = loadState();

  // Try reconnecting to existing browser
  if (state?.port && await isCdpAlive(state.port)) {
    port = state.port;
  } else {
    // Launch a new detached Chromium process
    clearState();
    port = await findFreePort();
    const child = spawnChromium(port);
    await waitForCdpReady(port);
    saveState(port, child.pid);
  }

  // connectOverCDP auto-discovers wsUrl from http endpoint
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);

  // Use the default context (tied to --user-data-dir, survives disconnection)
  const context = browser.contexts()[0];
  if (!context) {
    throw new Error('No default browser context found after CDP connection');
  }

  let page = context.pages()[0];
  if (!page) {
    page = await context.newPage();
  }

  if (url) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  }

  return { browser, context, page };
}

// --- Command dispatch ---

const [,, command, ...args] = process.argv;

try {
  switch (command) {
    case 'open': {
      const url = args[0];
      if (!url) { console.error('Usage: patchright-browser open <url>'); process.exit(1); }
      const { page } = await ensureBrowser(url);
      const title = await page.title();
      console.log(`Opened: ${url}`);
      console.log(`Title: ${title}`);
      console.log(`Profile: ${PROFILE_DIR}`);
      break;
    }

    case 'screenshot': {
      const url = args[0];
      const { page } = await ensureBrowser(url);
      if (url) await page.waitForTimeout(2000);
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
      const filePath = path.join(SCREENSHOT_DIR, `screenshot-${Date.now()}.png`);
      await page.screenshot({ path: filePath, fullPage: false });
      console.log(`Screenshot saved: ${filePath}`);
      break;
    }

    case 'html': {
      const url = args[0];
      const { page } = await ensureBrowser(url);
      console.log(await page.content());
      break;
    }

    case 'text': {
      const url = args[0];
      const { page } = await ensureBrowser(url);
      console.log(await page.evaluate(() => document.body.innerText));
      break;
    }

    case 'click': {
      const selector = args[0];
      if (!selector) { console.error('Usage: patchright-browser click <selector>'); process.exit(1); }
      const { page } = await ensureBrowser();
      await page.click(selector, { timeout: 10000 });
      console.log(`Clicked: ${selector}`);
      break;
    }

    case 'type': {
      const selector = args[0];
      const text = args.slice(1).join(' ');
      if (!selector || !text) { console.error('Usage: patchright-browser type <selector> <text>'); process.exit(1); }
      const { page } = await ensureBrowser();
      await page.fill(selector, text, { timeout: 10000 });
      console.log(`Typed into ${selector}: ${text}`);
      break;
    }

    case 'eval': {
      const js = args.join(' ');
      if (!js) { console.error('Usage: patchright-browser eval <javascript>'); process.exit(1); }
      const { page } = await ensureBrowser();
      const result = await page.evaluate(js);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'close': {
      const state = loadState();
      if (state?.port && await isCdpAlive(state.port)) {
        const browser = await chromium.connectOverCDP(`http://127.0.0.1:${state.port}`);
        await browser.close();
        clearState();
        console.log('Browser closed.');
      } else {
        // Kill stale process if PID is known
        if (state?.pid) {
          try { process.kill(state.pid, 'SIGTERM'); } catch {}
        }
        clearState();
        console.log('No browser running.');
      }
      break;
    }

    case 'status': {
      const state = loadState();
      if (state?.port && await isCdpAlive(state.port)) {
        const browser = await chromium.connectOverCDP(`http://127.0.0.1:${state.port}`);
        const pages = browser.contexts().flatMap(c => c.pages());
        console.log(`Browser running (port ${state.port}). Pages: ${pages.length}`);
        console.log(`Profile: ${PROFILE_DIR}`);
        for (const p of pages) {
          console.log(`  - ${await p.title()} (${p.url()})`);
        }
      } else {
        if (state) clearState();
        console.log('No browser running.');
      }
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      console.error('Commands: open, screenshot, html, text, click, type, eval, close, status');
      process.exit(1);
  }
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
