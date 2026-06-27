import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const APP_URL = process.env.APP_URL || "http://127.0.0.1:8765/";
const DEBUG_PORT = Number(process.env.COMMAND_PALETTE_DEBUG_PORT || 9224);

const browserPath = process.env.BROWSER_PATH || findBrowser();
if (!browserPath) {
  throw new Error("Chrome or Edge was not found. Set BROWSER_PATH to a browser executable.");
}

const userDataDir = await mkdtemp(path.join(tmpdir(), "matrix-command-palette-smoke-"));
const browser = spawn(browserPath, [
  "--headless=new",
  "--disable-gpu",
  "--disable-dev-shm-usage",
  "--no-first-run",
  "--no-default-browser-check",
  `--remote-debugging-port=${DEBUG_PORT}`,
  `--user-data-dir=${userDataDir}`,
  "about:blank"
], { stdio: "ignore" });

try {
  const wsUrl = await waitForDebugger();
  const cdp = await createCdpClient(wsUrl);
  const result = await runCommandPaletteSmoke(cdp);

  assert(result.routeStable, "command palette changed the initial route unexpectedly");
  assert(result.opened, "command palette did not open with Ctrl+K");
  assert(result.inputFocused, "command palette input did not receive focus");
  assert(result.commandCount >= 1, `command list was empty: ${result.commandCount}`);
  assert(result.workspaceCommandsVisible >= 5, `workspace commands were missing: ${result.workspaceCommandsVisible}`);
  assert(result.workspaceCommandExecuted, "workspace command did not navigate to portfolio");
  assert(result.closedWithEscape, "command palette did not close with Escape");
  assert(result.noOverflow, "command palette introduced horizontal overflow");

  console.log("ok - command palette");
} finally {
  browser.kill();
  await waitForExit(browser);
  await rmRetry(userDataDir);
}

async function runCommandPaletteSmoke(cdp) {
  const target = await cdp.send("Target.createTarget", { url: "about:blank" });
  const attached = await cdp.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  const sessionId = attached.sessionId;

  await cdp.send("Runtime.enable", {}, sessionId);
  await cdp.send("Network.enable", {}, sessionId);
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false
  }, sessionId);

  await cdp.send("Page.navigate", { url: `${APP_URL}#dashboard` }, sessionId);
  await waitForDashboardReady(cdp, sessionId);

  await dispatchCtrlK(cdp, sessionId);
  await waitForCommandPalette(cdp, sessionId);
  const opened = await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const input = document.querySelector(".command-backdrop .command-palette input");
      return {
        routeStable: window.location.hash === "#dashboard",
        opened: Boolean(input),
        inputFocused: document.activeElement === input,
        commandCount: document.querySelectorAll(".command-list button").length,
        noOverflow: document.documentElement.scrollWidth === document.documentElement.clientWidth
      };
    })()`,
    returnByValue: true
  }, sessionId);

  await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const input = document.querySelector(".command-backdrop .command-palette input");
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(input, "çalışma");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })()`,
    returnByValue: true
  }, sessionId);
  await delay(300);
  const workspaceVisible = await cdp.send("Runtime.evaluate", {
    expression: `(() => ({
      workspaceCommandsVisible: ["workspace-favorites", "workspace-risk", "workspace-fib", "workspace-news", "workspace-portfolio"].filter((id) => document.querySelector('.command-list button[data-command-id="' + id + '"]')).length
    }))()`,
    returnByValue: true
  }, sessionId);

  await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const input = document.querySelector(".command-backdrop .command-palette input");
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(input, "portföy çalışma");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })()`,
    returnByValue: true
  }, sessionId);
  await delay(300);
  await cdp.send("Runtime.evaluate", {
    expression: `document.querySelector('.command-list button[data-command-id="workspace-portfolio"]').click()`,
    returnByValue: true
  }, sessionId);
  await delay(500);
  const workspaceExecuted = await cdp.send("Runtime.evaluate", {
    expression: `(() => ({
      workspaceCommandExecuted: !document.querySelector(".command-backdrop") && window.location.hash === "#portfolio" && Boolean(document.querySelector("#portfolio.portfolio-page"))
    }))()`,
    returnByValue: true
  }, sessionId);

  await dispatchCtrlK(cdp, sessionId);
  await waitForCommandPalette(cdp, sessionId);

  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27
  }, sessionId);
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27
  }, sessionId);
  await delay(300);

  const closed = await cdp.send("Runtime.evaluate", {
    expression: `(() => ({
      closedWithEscape: !document.querySelector(".command-backdrop"),
      routeStillStable: window.location.hash === "#portfolio"
    }))()`,
    returnByValue: true
  }, sessionId);

  await cdp.send("Target.closeTarget", { targetId: target.targetId });
  return {
    ...opened.result.value,
    ...workspaceVisible.result.value,
    ...workspaceExecuted.result.value,
    closedWithEscape: Boolean(closed.result.value.closedWithEscape && closed.result.value.routeStillStable)
  };
}

async function dispatchCtrlK(cdp, sessionId) {
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Control",
    code: "ControlLeft",
    windowsVirtualKeyCode: 17,
    modifiers: 2
  }, sessionId);
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "k",
    code: "KeyK",
    windowsVirtualKeyCode: 75,
    modifiers: 2
  }, sessionId);
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "k",
    code: "KeyK",
    windowsVirtualKeyCode: 75,
    modifiers: 2
  }, sessionId);
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Control",
    code: "ControlLeft",
    windowsVirtualKeyCode: 17
  }, sessionId);
}

async function waitForDashboardReady(cdp, sessionId) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const result = await cdp.send("Runtime.evaluate", {
      expression: `document.readyState === "complete" && Boolean(document.querySelector(".mfe-app")) && document.querySelectorAll(".stock-table tbody tr").length >= 1`,
      returnByValue: true
    }, sessionId);
    if (result.result.value) {
      await delay(1000);
      return;
    }
    await delay(250);
  }
  throw new Error("dashboard was not ready for command palette smoke");
}

async function waitForCommandPalette(cdp, sessionId) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const result = await cdp.send("Runtime.evaluate", {
      expression: `Boolean(document.querySelector(".command-backdrop .command-palette input")) && document.querySelectorAll(".command-list button").length >= 1`,
      returnByValue: true
    }, sessionId);
    if (result.result.value) {
      await delay(250);
      return;
    }
    await delay(200);
  }
  throw new Error("command palette did not open");
}

async function waitForDebugger() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
      if (response.ok) {
        const json = await response.json();
        if (json.webSocketDebuggerUrl) return json.webSocketDebuggerUrl;
      }
    } catch {
      // Browser is still starting.
    }
    await delay(250);
  }
  throw new Error("browser debug endpoint was not ready");
}

async function createCdpClient(wsUrl) {
  const socket = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  let nextId = 1;
  const pending = new Map();

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result || {});
  });

  return {
    send(method, params = {}, sessionId) {
      const id = nextId++;
      const payload = { id, method, params };
      if (sessionId) payload.sessionId = sessionId;
      socket.send(JSON.stringify(payload));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    }
  };
}

function findBrowser() {
  const candidates = [
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
  ];
  return candidates.find((candidate) => existsSync(candidate)) || "";
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForExit(process) {
  if (process.exitCode !== null || process.killed) return delay(500);
  return Promise.race([
    new Promise((resolve) => process.once("exit", resolve)),
    delay(3000)
  ]);
}

async function rmRetry(target) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await rm(target, { recursive: true, force: true });
      return;
    } catch (error) {
      if (error.code !== "EBUSY" && error.code !== "EPERM") throw error;
      await delay(500);
    }
  }
  await rm(target, { recursive: true, force: true });
}
