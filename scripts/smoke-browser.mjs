import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const APP_URL = "http://127.0.0.1:8765/";
const DEBUG_PORT = 9223;

const browserPath = process.env.BROWSER_PATH || findBrowser();
if (!browserPath) {
  throw new Error("Edge/Chrome bulunamadı. BROWSER_PATH ile browser exe yolu verilebilir.");
}

const userDataDir = await mkdtemp(path.join(tmpdir(), "fvt-browser-smoke-"));
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

  const desktop = await runViewportSmoke(cdp, 1440, 1000);
  const tablet = await runViewportSmoke(cdp, 750, 950);

  assert(desktop.proxyLive, "desktop proxy badge görünmedi");
  assert(desktop.rows >= 52, `desktop en az 52 satır bekleniyordu, gelen ${desktop.rows}`);
  assert(desktop.tableDisplay !== "none", "desktop tablo görünür olmalı");
  assert(desktop.visibleCards === 0, "desktop mobil kartlar görünmemeli");
  assert(desktop.desktopHeatmaps >= 52, `desktop heatmap bekleniyordu, gelen ${desktop.desktopHeatmaps}`);
  assert(desktop.signalStrips >= 52, `desktop sinyal şeridi bekleniyordu, gelen ${desktop.signalStrips}`);
  assert(desktop.signalsCenterVisible, "desktop sinyal merkezi görünmedi");
  assert(desktop.signalRows >= 52, `desktop sinyal merkezi satır bekleniyordu, gelen ${desktop.signalRows}`);
  assert(desktop.nasdaqCategoryVisible, "desktop Nasdaq seçim listesinde kategori görünmedi");
  assert(desktop.searchableSelectVisible, "desktop standart select arama kutusu görünmedi");
  assert(desktop.searchableSelectClosed, "desktop standart select dış tıklamayla kapanmadı");
  assert(desktop.chartRangeOk, "desktop 1H grafik aralığı çalışmadı");
  assert(desktop.scrollWidth === desktop.clientWidth, "desktop yatay taşma var");

  assert(tablet.proxyLive, "750px proxy badge görünmedi");
  assert(tablet.rows >= 52, `750px row model en az 52 bekleniyordu, gelen ${tablet.rows}`);
  assert(tablet.tableDisplay === "none", "750px tablo gizlenmeli");
  assert(tablet.visibleCards >= 52, `750px en az 52 mobil kart bekleniyordu, gelen ${tablet.visibleCards}`);
  assert(tablet.mobileHeatmaps >= 52, `750px mobil heatmap bekleniyordu, gelen ${tablet.mobileHeatmaps}`);
  assert(tablet.signalsCenterVisible, "750px sinyal merkezi görünmedi");
  assert(tablet.scrollWidth === tablet.clientWidth, "750px yatay taşma var");

  console.log("ok - browser desktop");
  console.log("ok - browser 750px mobile/tablet");
} finally {
  browser.kill();
  await waitForExit(browser);
  await rmRetry(userDataDir);
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
  throw new Error("Browser debug endpoint hazır olmadı.");
}

async function createCdpClient(wsUrl) {
  const socket = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  const events = [];

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result || {});
      return;
    }
    if (message.method) events.push(message);
  });

  return {
    events,
    send(method, params = {}, sessionId) {
      const id = nextId++;
      const payload = { id, method, params };
      if (sessionId) payload.sessionId = sessionId;
      socket.send(JSON.stringify(payload));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    }
  };
}

async function runViewportSmoke(cdp, width, height) {
  cdp.events.length = 0;
  const target = await cdp.send("Target.createTarget", { url: "about:blank" });
  const attached = await cdp.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  const sessionId = attached.sessionId;

  await cdp.send("Runtime.enable", {}, sessionId);
  await cdp.send("Network.enable", {}, sessionId);
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width <= 760
  }, sessionId);
  await cdp.send("Page.navigate", { url: APP_URL }, sessionId);
  await waitForPageReady(cdp, sessionId);

  assertNoBrowserErrors(cdp.events, "Browser smoke hata");

  cdp.events.length = 0;
  await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const button = Array.from(document.querySelectorAll(".range-row button")).find((item) => item.textContent.trim() === "1H");
      if (button) button.click();
      return Boolean(button);
    })()`,
    returnByValue: true
  }, sessionId);
  await delay(1800);
  assertNoBrowserErrors(cdp.events, "Browser range smoke hata");

  await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const input = document.querySelector(".smart-select input");
      if (!input) return false;
      input.focus();
      input.value = "NVDA";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })()`,
    returnByValue: true
  }, sessionId);
  await delay(500);

  await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const selectButton = document.querySelector(".metronic-select > button");
      if (!selectButton) return false;
      selectButton.click();
      return true;
    })()`,
    returnByValue: true
  }, sessionId);
  await delay(250);
  const selectOpenCheck = await cdp.send("Runtime.evaluate", {
    expression: `Boolean(document.querySelector(".metronic-options .metronic-search input"))`,
    returnByValue: true
  }, sessionId);
  await cdp.send("Runtime.evaluate", {
    expression: `document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 1, clientY: 1 }))`,
    returnByValue: true
  }, sessionId);
  await delay(250);

  const expression = `(() => ({
    proxyLive: document.body.innerText.includes("Proxy canlı"),
    rows: document.querySelectorAll(".stock-table tbody tr").length,
    visibleCards: Array.from(document.querySelectorAll(".stock-mobile-card")).filter(el => el.offsetParent !== null).length,
    tableDisplay: getComputedStyle(document.querySelector(".table-card")).display,
    cardDisplay: getComputedStyle(document.querySelector(".stock-card-list")).display,
    desktopHeatmaps: document.querySelectorAll(".stock-table .return-heatmap").length,
    mobileHeatmaps: Array.from(document.querySelectorAll(".stock-mobile-card .return-heatmap")).filter(el => el.offsetParent !== null).length,
    signalStrips: document.querySelectorAll(".stock-table .signal-strip").length,
    signalsCenterVisible: Boolean(document.querySelector(".signals-center")),
    signalRows: document.querySelectorAll(".signal-table tbody tr").length,
    nasdaqCategoryVisible: Array.from(document.querySelectorAll(".combo-list small b")).some(el => el.textContent.trim().length > 0),
    searchableSelectVisible: ${Boolean(selectOpenCheck.result.value)},
    searchableSelectClosed: !document.querySelector(".metronic-options"),
    chartRangeOk: document.body.innerText.includes("1H") && Boolean(document.querySelector(".price-chart")),
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }))()`;
  const result = await cdp.send("Runtime.evaluate", { expression, returnByValue: true }, sessionId);
  await cdp.send("Target.closeTarget", { targetId: target.targetId });
  return result.result.value;
}

function assertNoBrowserErrors(events, label) {
  const failures = events.filter((event) => event.method === "Network.responseReceived" && event.params?.response?.status >= 400);
  const exceptions = events.filter((event) => event.method === "Runtime.exceptionThrown");
  if (failures.length || exceptions.length) {
    throw new Error(`${label}: ${JSON.stringify({ failures, exceptions }).slice(0, 1000)}`);
  }
}

async function waitForPageReady(cdp, sessionId) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const result = await cdp.send("Runtime.evaluate", {
      expression: `document.readyState === "complete" && document.body?.innerText.includes("Proxy canlı")`,
      returnByValue: true
    }, sessionId);
    if (result.result.value) {
      await delay(1000);
      return;
    }
    await delay(250);
  }
  throw new Error("Dashboard browser smoke için hazır olmadı.");
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
      if (error?.code !== "EBUSY" && error?.code !== "EPERM") throw error;
      await delay(500);
    }
  }
  await rm(target, { recursive: true, force: true });
}
