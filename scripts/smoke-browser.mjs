import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const APP_URL = "http://127.0.0.1:8765/";
const DEBUG_PORT = 9223;
const ADMIN_USERNAME = process.env.MATRIX_ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.MATRIX_ADMIN_PASSWORD || "matrix-local-admin";

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
  assert(desktop.mojibakeCount === 0, `desktop bozuk karakter imzası bulundu: ${desktop.mojibakeSamples.join(" | ")}`);
  assert(desktop.rows >= 52, `desktop en az 52 satır bekleniyordu, gelen ${desktop.rows}`);
  assert(desktop.tableDisplay !== "none", "desktop tablo görünür olmalı");
  assert(desktop.visibleCards === 0, "desktop mobil kartlar görünmemeli");
  assert(desktop.desktopHeatmaps >= 52, `desktop ısı haritası bekleniyordu, gelen ${desktop.desktopHeatmaps}`);
  assert(desktop.signalStrips >= 52, `desktop sinyal şeridi bekleniyordu, gelen ${desktop.signalStrips}`);
  assert(!desktop.signalsCenterVisible, "desktop dashboard içinde sinyal merkezi görünmemeli");
  assert(desktop.signalsRouteVisible, "desktop #signals sayfasında sinyal merkezi görünmedi");
  assert(desktop.signalRows >= 52, `desktop #signals satır bekleniyordu, gelen ${desktop.signalRows}`);
  assert(desktop.screenerRouteVisible, "desktop #screener sayfası açılmadı");
  assert(desktop.screenerRows >= 1, `desktop #screener sonuç satırı bekleniyordu, gelen ${desktop.screenerRows}`);
  assert(desktop.screenerSummaryMetrics >= 6, `desktop #screener özet metriği bekleniyordu, gelen ${desktop.screenerSummaryMetrics}`);
  assert(desktop.screenerHeatTiles >= 1, `desktop #screener heatmap bekleniyordu, gelen ${desktop.screenerHeatTiles}`);
  assert(desktop.screenerCompareCells >= 1, `desktop #screener karşılaştırma hücresi bekleniyordu, gelen ${desktop.screenerCompareCells}`);
  assert(desktop.screenerTriggerSummaries >= 1, "desktop #screener trigger özeti görünmedi");
  assert(desktop.screenerEvidenceRows >= 1, "desktop #screener risk/haber kanıt satırı görünmedi");
  assert(desktop.screenerPresetSaveVisible, "desktop #screener kaydedilebilir preset alanı görünmedi");
  assert(desktop.screenerSavedPresetListVisible, "desktop #screener kaydedilmiş preset listesi görünmedi");
  assert(desktop.screenerAdvancedCriteriaVisible, "desktop #screener gelişmiş kriter paneli görünmedi");
  assert(desktop.researchRouteVisible, "desktop #research sayfası açılmadı");
  assert(desktop.researchMetrics >= 5, `desktop #research etki metriği bekleniyordu, gelen ${desktop.researchMetrics}`);
  assert(desktop.researchSummaryVisible, "desktop #research özet kartı görünmedi");
  assert(desktop.researchDetailCards >= 2, `desktop #research detay kartı bekleniyordu, gelen ${desktop.researchDetailCards}`);
  assert(desktop.researchNewsReactionVisible, "desktop #research haber reaksiyon satırı görünmedi");
  assert(desktop.researchProvenanceCells >= 6, `desktop #research kaynak kanıtı bekleniyordu, gelen ${desktop.researchProvenanceCells}`);
  assert(desktop.portfolioRouteVisible, "desktop #portfolio sayfası açılmadı");
  assert(desktop.portfolioKpis >= 5, `desktop #portfolio KPI bekleniyordu, gelen ${desktop.portfolioKpis}`);
  assert(desktop.portfolioRows >= 1, `desktop #portfolio satır bekleniyordu, gelen ${desktop.portfolioRows}`);
  assert(desktop.portfolioJournalVisible, "desktop #portfolio işlem günlüğü görünmedi");
  assert(desktop.brokerImportVisible, "desktop #portfolio broker CSV import kartı görünmedi");
  assert(desktop.brokerImportPreviewWorks, "desktop #portfolio broker CSV önizleme çalışmadı");
  assert(desktop.portfolioRiskTiles >= 4, `desktop #portfolio risk özeti bekleniyordu, gelen ${desktop.portfolioRiskTiles}`);
  assert(desktop.portfolioPerformanceTiles >= 5, `desktop #portfolio işlem performansı bekleniyordu, gelen ${desktop.portfolioPerformanceTiles}`);
  assert(desktop.portfolioExposureVisible, "desktop #portfolio kategori yoğunlaşması görünmedi");
  assert(desktop.reportsRouteVisible, "desktop #reports sayfası açılmadı");
  assert(desktop.reportMetrics >= 7, `desktop #reports metrik bekleniyordu, gelen ${desktop.reportMetrics}`);
  assert(desktop.reportActions >= 3, `desktop #reports aksiyon kartı bekleniyordu, gelen ${desktop.reportActions}`);
  assert(desktop.reportCsvButtons >= 5, `desktop #reports CSV aksiyonu bekleniyordu, gelen ${desktop.reportCsvButtons}`);
  assert(desktop.weeklyReportSections >= 5, `desktop #reports haftalık rapor bölümü bekleniyordu, gelen ${desktop.weeklyReportSections}`);
  assert(desktop.reportPortfolioSummaryVisible, "desktop #reports portföy özeti görünmedi");
  assert(desktop.reportImportPreviewVisible, "desktop #reports import önizleme görünmedi");
  assert(desktop.reportImportIdleVisible && desktop.reportImportSubmitDisabledInitial, "desktop #reports boş import durumu doğru değil");
  assert(desktop.reportImportSuccessVisible && desktop.reportImportSubmitEnabledForValid, "desktop #reports geçerli import durumu doğru değil");
  assert(desktop.reportImportDangerVisible && desktop.reportImportSubmitDisabledForInvalid, "desktop #reports hatalı import durumu doğru değil");
  assert(desktop.reportHistoryVisible, "desktop #reports rapor geçmişi görünmedi");
  assert(desktop.adminRouteVisible, "desktop #admin sayfası açılmadı");
  assert(desktop.adminLoggedIn, "desktop #admin login sonrası panel görünmedi");
  assert(desktop.adminProviderEditorVisible, "desktop #admin sağlayıcı düzenleme formu görünmedi");
  assert(desktop.adminProviderActionsVisible, "desktop #admin sağlayıcı ekle/kaydet aksiyonları görünmedi");
  assert(desktop.adminProviderDraftPreserved, "desktop #admin sağlayıcı taslağı yenileme sonrası korunmadı");
  assert(desktop.adminProviderIdsLocked, "desktop #admin kayıtlı sağlayıcı kimlikleri kilitli değil");
  assert(desktop.adminTestDetails >= 2, `desktop #admin test sonucu satırı bekleniyordu, gelen ${desktop.adminTestDetails}`);
  assert(desktop.adminAuditFiltersVisible, "desktop #admin denetim filtreleri görünmedi");
  assert(desktop.adminAuditSummaryVisible, "desktop #admin denetim özeti görünmedi");
  assert(desktop.adminResearchFiltersVisible, "desktop #admin araştırma filtreleri görünmedi");
  assert(desktop.adminResearchSummaryVisible, "desktop #admin araştırma özeti görünmedi");
  assert(desktop.adminResearchCardVisible, "desktop #admin araştırma kartı görünmedi");
  assert(desktop.adminResearchListOrEmptyVisible, "desktop #admin araştırma liste/boş durum görünmedi");
  assert(desktop.adminResearchClearVisible, "desktop #admin araştırma temizleme aksiyonu görünmedi");
  assert(desktop.adminOperationResultVisible, "desktop #admin son operasyon kartı görünmedi");
  assert(desktop.nasdaqCategoryVisible, "desktop Nasdaq seçim listesinde kategori görünmedi");
  assert(desktop.searchableSelectVisible, "desktop standart select arama kutusu görünmedi");
  assert(desktop.searchableSelectClosed, "desktop standart select dış tıklamayla kapanmadı");
  assert(desktop.commandPaletteVisible, "desktop Ctrl+K command palette açılmadı");
  assert(desktop.commandPaletteExecuted, "desktop command palette komutu çalışmadı");
  assert(desktop.chartRangeOk, "desktop 1H grafik aralığı çalışmadı");
  assert(desktop.chartVolumeLayerVisible, "desktop grafik hacim katmanı görünmedi");
  assert(desktop.chartCandlesVisible, "desktop grafik mum katmanı görünmedi");
  assert(desktop.chartOverlayLabelsVisible, "desktop grafik overlay etiketleri görünmedi");
  assert(desktop.chartFibLabelsVisible, "desktop grafik Fib etiketleri görünmedi");
  assert(desktop.scrollWidth === desktop.clientWidth, "desktop yatay taşma var");

  assert(tablet.proxyLive, "750px proxy badge görünmedi");
  assert(tablet.mojibakeCount === 0, `750px bozuk karakter imzası bulundu: ${tablet.mojibakeSamples.join(" | ")}`);
  assert(tablet.rows >= 52, `750px row model en az 52 bekleniyordu, gelen ${tablet.rows}`);
  assert(tablet.tableDisplay === "none", "750px tablo gizlenmeli");
  assert(tablet.visibleCards >= 52, `750px en az 52 mobil kart bekleniyordu, gelen ${tablet.visibleCards}`);
  assert(tablet.mobileHeatmaps >= 52, `750px mobil ısı haritası bekleniyordu, gelen ${tablet.mobileHeatmaps}`);
  assert(tablet.signalsRouteVisible, "750px #signals sinyal merkezi görünmedi");
  assert(tablet.screenerRouteVisible, "750px #screener sayfası açılmadı");
  assert(tablet.screenerRows >= 1, `750px #screener sonuç satırı bekleniyordu, gelen ${tablet.screenerRows}`);
  assert(tablet.screenerSummaryMetrics >= 6, `750px #screener özet metriği bekleniyordu, gelen ${tablet.screenerSummaryMetrics}`);
  assert(tablet.screenerHeatTiles >= 1, `750px #screener heatmap bekleniyordu, gelen ${tablet.screenerHeatTiles}`);
  assert(tablet.screenerTriggerSummaries >= 1, "750px #screener trigger özeti görünmedi");
  assert(tablet.screenerEvidenceRows >= 1, "750px #screener risk/haber kanıt satırı görünmedi");
  assert(tablet.screenerPresetSaveVisible, "750px #screener kaydedilebilir preset alanı görünmedi");
  assert(tablet.screenerAdvancedCriteriaVisible, "750px #screener gelişmiş kriter paneli görünmedi");
  assert(tablet.researchRouteVisible, "750px #research sayfası açılmadı");
  assert(tablet.researchMetrics >= 5, `750px #research etki metriği bekleniyordu, gelen ${tablet.researchMetrics}`);
  assert(tablet.researchDetailCards >= 2, `750px #research detay kartı bekleniyordu, gelen ${tablet.researchDetailCards}`);
  assert(tablet.researchNewsReactionVisible, "750px #research haber reaksiyon satırı görünmedi");
  assert(tablet.researchProvenanceCells >= 6, `750px #research kaynak kanıtı bekleniyordu, gelen ${tablet.researchProvenanceCells}`);
  assert(tablet.portfolioRouteVisible, "750px #portfolio sayfası açılmadı");
  assert(tablet.portfolioKpis >= 5, `750px #portfolio KPI bekleniyordu, gelen ${tablet.portfolioKpis}`);
  assert(tablet.brokerImportVisible, "750px #portfolio broker CSV import kartı görünmedi");
  assert(tablet.brokerImportPreviewWorks, "750px #portfolio broker CSV önizleme çalışmadı");
  assert(tablet.portfolioRiskTiles >= 4, `750px #portfolio risk özeti bekleniyordu, gelen ${tablet.portfolioRiskTiles}`);
  assert(tablet.portfolioPerformanceTiles >= 5, `750px #portfolio işlem performansı bekleniyordu, gelen ${tablet.portfolioPerformanceTiles}`);
  assert(tablet.portfolioExposureVisible, "750px #portfolio kategori yoğunlaşması görünmedi");
  assert(tablet.reportsRouteVisible, "750px #reports sayfası açılmadı");
  assert(tablet.reportMetrics >= 7, `750px #reports metrik bekleniyordu, gelen ${tablet.reportMetrics}`);
  assert(tablet.reportCsvButtons >= 5, `750px #reports CSV aksiyonu bekleniyordu, gelen ${tablet.reportCsvButtons}`);
  assert(tablet.weeklyReportSections >= 5, `750px #reports haftalık rapor bölümü bekleniyordu, gelen ${tablet.weeklyReportSections}`);
  assert(tablet.reportPortfolioSummaryVisible, "750px #reports portföy özeti görünmedi");
  assert(tablet.reportImportPreviewVisible, "750px #reports import önizleme görünmedi");
  assert(tablet.reportImportIdleVisible && tablet.reportImportSubmitDisabledInitial, "750px #reports boş import durumu doğru değil");
  assert(tablet.reportImportSuccessVisible && tablet.reportImportSubmitEnabledForValid, "750px #reports geçerli import durumu doğru değil");
  assert(tablet.reportImportDangerVisible && tablet.reportImportSubmitDisabledForInvalid, "750px #reports hatalı import durumu doğru değil");
  assert(tablet.reportHistoryVisible, "750px #reports rapor geçmişi görünmedi");
  assert(tablet.adminRouteVisible, "750px #admin sayfası açılmadı");
  assert(tablet.adminLoggedIn, "750px #admin login sonrası panel görünmedi");
  assert(tablet.adminProviderEditorVisible, "750px #admin sağlayıcı düzenleme formu görünmedi");
  assert(tablet.adminProviderActionsVisible, "750px #admin sağlayıcı ekle/kaydet aksiyonları görünmedi");
  assert(tablet.adminProviderDraftPreserved, "750px #admin sağlayıcı taslağı yenileme sonrası korunmadı");
  assert(tablet.adminProviderIdsLocked, "750px #admin kayıtlı sağlayıcı kimlikleri kilitli değil");
  assert(tablet.adminTestDetails >= 2, `750px #admin test sonucu satırı bekleniyordu, gelen ${tablet.adminTestDetails}`);
  assert(tablet.adminAuditFiltersVisible, "750px #admin denetim filtreleri görünmedi");
  assert(tablet.adminAuditSummaryVisible, "750px #admin denetim özeti görünmedi");
  assert(tablet.adminResearchFiltersVisible, "750px #admin araştırma filtreleri görünmedi");
  assert(tablet.adminResearchSummaryVisible, "750px #admin araştırma özeti görünmedi");
  assert(tablet.adminResearchCardVisible, "750px #admin araştırma kartı görünmedi");
  assert(tablet.adminResearchListOrEmptyVisible, "750px #admin araştırma liste/boş durum görünmedi");
  assert(tablet.adminResearchClearVisible, "750px #admin araştırma temizleme aksiyonu görünmedi");
  assert(tablet.adminOperationResultVisible, "750px #admin son operasyon kartı görünmedi");
  assert(tablet.commandPaletteVisible, "750px Ctrl+K command palette açılmadı");
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
  await waitForCommandPalette(cdp, sessionId);
  const commandOpenResult = await cdp.send("Runtime.evaluate", {
    expression: `(() => ({
      commandPaletteVisible: Boolean(document.querySelector(".command-backdrop .command-palette input")),
      commandCount: document.querySelectorAll(".command-list button").length
    }))()`,
    returnByValue: true
  }, sessionId);
  await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const input = document.querySelector(".command-palette input");
      if (!input) return false;
      input.value = "risk";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })()`,
    returnByValue: true
  }, sessionId);
  await delay(250);
  await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const button = Array.from(document.querySelectorAll(".command-list button")).find((item) => item.textContent.includes("Risklileri göster"));
      if (!button) return false;
      button.click();
      return true;
    })()`,
    returnByValue: true
  }, sessionId);
  await delay(500);
  const commandExecutedResult = await cdp.send("Runtime.evaluate", {
    expression: `(() => ({
      commandPaletteExecuted: !document.querySelector(".command-backdrop") && window.location.hash === "#dashboard" && document.body.innerText.includes("RİSK YÜKSEK")
    }))()`,
    returnByValue: true
  }, sessionId);

  const expression = `(() => {
    const text = document.body.innerText || "";
    const mojibakeMatches = text.match(/[\\u00c2\\u00c3\\ufffd]|\\u00e2[\\u0080-\\u00bf]|\\u00c4[\\u0080-\\u00bf]|\\u00c5[\\u0080-\\u00bf]/g) || [];
    return {
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
    chartVolumeLayerVisible: Boolean(document.querySelector(".price-chart .chart-volume-bars")),
    chartCandlesVisible: document.querySelectorAll(".price-chart .chart-candlesticks rect").length >= 1,
    chartOverlayLabelsVisible: document.querySelectorAll(".price-chart .chart-overlay-labels text").length >= 1,
    chartFibLabelsVisible: document.querySelectorAll(".price-chart .fib-level-labels text").length >= 1,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    mojibakeCount: mojibakeMatches.length,
    mojibakeSamples: mojibakeMatches.slice(0, 8)
  };
  })()`;
  const result = await cdp.send("Runtime.evaluate", { expression, returnByValue: true }, sessionId);
  await cdp.send("Page.navigate", { url: APP_URL + "#signals" }, sessionId);
  await waitForSignalsReady(cdp, sessionId);
  const signalsResult = await cdp.send("Runtime.evaluate", {
    expression: `(() => ({
      signalsRouteVisible: Boolean(document.querySelector(".signals-center")),
      signalRows: document.querySelectorAll(".signal-table tbody tr").length
    }))()`,
    returnByValue: true
  }, sessionId);
  await cdp.send("Page.navigate", { url: APP_URL + "#screener" }, sessionId);
  await waitForScreenerReady(cdp, sessionId);
  const screenerResult = await cdp.send("Runtime.evaluate", {
    expression: `(() => ({
      screenerRouteVisible: Boolean(document.querySelector("#screener.screener-page")) && Boolean(document.querySelector('a[href="#screener"].active')),
      screenerRows: document.querySelectorAll(".screener-result-row").length,
      screenerSummaryMetrics: document.querySelectorAll("#screener .screener-summary-strip .metric").length,
      screenerHeatTiles: document.querySelectorAll("#screener .category-heatmap .heat-tile").length,
      screenerCompareCells: document.querySelectorAll("#screener .compare-cell").length,
      screenerTriggerSummaries: document.querySelectorAll("#screener .trigger-summary-strip em").length,
      screenerEvidenceRows: document.querySelectorAll("#screener .screener-evidence").length,
      screenerPresetSaveVisible: Boolean(document.querySelector("#screener .preset-save-row input")),
      screenerSavedPresetListVisible: Boolean(document.querySelector("#screener .saved-preset-list")),
      screenerAdvancedCriteriaVisible: document.querySelectorAll("#screener .advanced-screener-grid input, #screener .advanced-screener-grid button, #screener .advanced-screener-grid .metronic-select").length >= 5
    }))()`,
    returnByValue: true
  }, sessionId);
  await cdp.send("Page.navigate", { url: APP_URL + "#research" }, sessionId);
  await waitForResearchReady(cdp, sessionId);
  const researchResult = await cdp.send("Runtime.evaluate", {
    expression: `(() => ({
      researchRouteVisible: Boolean(document.querySelector("#research.research-page")) && Boolean(document.querySelector('a[href="#research"].active')),
      researchMetrics: document.querySelectorAll("#research .research-impact-metric").length,
      researchSummaryVisible: Boolean(document.querySelector("#research .research-summary")),
      researchDetailCards: document.querySelectorAll("#research .research-detail-card").length,
      researchNewsReactionVisible: Boolean(document.querySelector("#research .important-news-item em")),
      researchProvenanceCells: document.querySelectorAll("#research .research-provenance-row span").length
    }))()`,
    returnByValue: true
  }, sessionId);
  await cdp.send("Page.navigate", { url: APP_URL + "#portfolio" }, sessionId);
  await waitForPortfolioReady(cdp, sessionId);
  const brokerPreviewResult = await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const textarea = document.querySelector("#portfolio #broker-import textarea");
      const previewButton = Array.from(document.querySelectorAll("#portfolio #broker-import button")).find((button) => button.textContent.includes("Önizle"));
      const sampleButton = Array.from(document.querySelectorAll("#portfolio #broker-import button")).find((button) => button.textContent.includes("Örnek Yükle"));
      if (!textarea || !previewButton || !sampleButton) return { brokerImportPreviewWorks: false };
      sampleButton.click();
      const sampleGeneratedPreview = document.querySelectorAll("#portfolio .broker-preview-table tbody tr").length >= 2
        && document.body.innerText.includes("Örnek CSV yüklendi");
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
      return new Promise((resolve) => setTimeout(() => {
        const sampleGeneratedPreview = document.querySelectorAll("#portfolio .broker-preview-table tbody tr").length >= 2
          && document.body.innerText.includes("Örnek CSV yüklendi");
        setter.call(textarea, "symbol,date,type,quantity,price,note\\nNVDA,2026-06-26,buy,10,192.5,smoke alım\\nAMD,2026-06-27,sell,4,165.2,smoke satış");
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        previewButton.click();
        setTimeout(() => {
          const summary = document.querySelector("#portfolio [data-testid='broker-import-summary']");
          resolve({
            brokerImportPreviewWorks: sampleGeneratedPreview
              && document.querySelectorAll("#portfolio .broker-preview-table tbody tr").length >= 2
              && document.body.innerText.includes("2 satır okundu")
              && Boolean(summary)
              && summary.innerText.includes("Alım")
              && summary.innerText.includes("Satım")
              && summary.innerText.includes("NVDA")
          });
        }, 500);
      }, 500));
    })()`,
    awaitPromise: true,
    returnByValue: true
  }, sessionId);
  const portfolioResult = await cdp.send("Runtime.evaluate", {
    expression: `(() => ({
      portfolioRouteVisible: Boolean(document.querySelector("#portfolio.portfolio-page")) && Boolean(document.querySelector('a[href="#portfolio"].active')),
      portfolioKpis: document.querySelectorAll("#portfolio .portfolio-kpis .metric-card").length,
      portfolioRows: document.querySelectorAll("#portfolio .portfolio-row").length,
      portfolioJournalVisible: Boolean(document.querySelector("#portfolio .journal-grid")) && Boolean(document.querySelector("#portfolio .journal-form")),
      brokerImportVisible: Boolean(document.querySelector("#portfolio #broker-import textarea")) && Boolean(document.querySelector("#portfolio .broker-import-meta")),
      portfolioRiskTiles: document.querySelectorAll("#portfolio .portfolio-risk-tile").length,
      portfolioPerformanceTiles: document.querySelectorAll("#portfolio .portfolio-performance-tile").length,
      portfolioExposureVisible: document.body.innerText.includes("Kategori Yoğunlaşması") && Boolean(document.querySelector("#portfolio .exposure-list"))
    }))()`,
    returnByValue: true
  }, sessionId);
  await cdp.send("Page.navigate", { url: APP_URL + "#reports" }, sessionId);
  await waitForReportsReady(cdp, sessionId);
  const importIdleResult = await cdp.send("Runtime.evaluate", {
    expression: `(() => ({
      reportImportIdleVisible: Boolean(document.querySelector("#reports .backup-import-preview.idle")),
      reportImportSubmitDisabledInitial: Boolean(document.querySelector('#reports [data-testid="backup-import-submit"]').disabled)
    }))()`,
    returnByValue: true
  }, sessionId);
  await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const textarea = document.querySelector("#reports .import-card textarea");
      if (!textarea) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
      setter.call(textarea, JSON.stringify({ version: 1, settings: { favorites: [], fibTargets: {}, hiddenSymbols: [] } }));
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })()`,
    returnByValue: true
  }, sessionId);
  await delay(300);
  const importSuccessResult = await cdp.send("Runtime.evaluate", {
    expression: `(() => ({
      reportImportSuccessVisible: Boolean(document.querySelector("#reports .backup-import-preview.success")),
      reportImportSubmitEnabledForValid: document.querySelector('#reports [data-testid="backup-import-submit"]').disabled === false
    }))()`,
    returnByValue: true
  }, sessionId);
  await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const textarea = document.querySelector("#reports .import-card textarea");
      if (!textarea) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
      setter.call(textarea, "{");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })()`,
    returnByValue: true
  }, sessionId);
  await delay(300);
  const importDangerResult = await cdp.send("Runtime.evaluate", {
    expression: `(() => ({
      reportImportDangerVisible: Boolean(document.querySelector("#reports .backup-import-preview.danger")),
      reportImportSubmitDisabledForInvalid: Boolean(document.querySelector('#reports [data-testid="backup-import-submit"]').disabled)
    }))()`,
    returnByValue: true
  }, sessionId);
  const reportsResult = await cdp.send("Runtime.evaluate", {
    expression: `(() => ({
      reportsRouteVisible: Boolean(document.querySelector("#reports.reports-page")) && Boolean(document.querySelector('a[href="#reports"].active')),
      reportMetrics: document.querySelectorAll("#reports .daily-summary-metric").length,
      reportActions: document.querySelectorAll("#reports .report-action-card").length,
      reportCsvButtons: document.querySelectorAll("#reports .report-button-stack-wide button").length,
      weeklyReportSections: document.querySelectorAll("#reports .weekly-report-section").length,
      reportImportVisible: Boolean(document.querySelector("#reports .import-card textarea")),
      reportPortfolioSummaryVisible: document.body.innerText.includes("Portföy özeti") && document.body.innerText.includes("Portföy ve işlem disiplini"),
      reportImportPreviewVisible: Boolean(document.querySelector("#reports .backup-import-preview")),
      reportHistoryVisible: document.body.innerText.includes("Rapor Geçmişi") && Boolean(document.querySelector("#reports .report-history-list"))
    }))()`,
    returnByValue: true
  }, sessionId);
  await cdp.send("Page.navigate", { url: APP_URL + "#admin" }, sessionId);
  await waitForAdminLogin(cdp, sessionId);
  const adminLoginResult = await cdp.send("Runtime.evaluate", {
    expression: `(() => ({
      adminRouteVisible: Boolean(document.querySelector("#admin")),
      adminLoginVisible: Boolean(document.querySelector(".admin-login-form"))
    }))()`,
    returnByValue: true
  }, sessionId);
  await cdp.send("Runtime.evaluate", {
    expression: `fetch("http://127.0.0.1:8766/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: ${JSON.stringify(ADMIN_USERNAME)}, password: ${JSON.stringify(ADMIN_PASSWORD)} })
    }).then(response => response.json()).then(json => {
      const session = json && json.data && json.data.session && json.data.session.token;
      if (!session) throw new Error("admin session missing");
      sessionStorage.setItem("matrix-admin-session-v1", session);
      location.reload();
      return true;
    })`,
    awaitPromise: true,
    returnByValue: true
  }, sessionId);
  await waitForAdminReady(cdp, sessionId);
  const providerDraftResult = await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const noteInput = document.querySelector("#admin .admin-provider-row .admin-provider-notes input");
      const refreshButton = Array.from(document.querySelectorAll("#admin .section-header button")).find((button) => button.textContent.includes("Yenile"));
      const idInputs = Array.from(document.querySelectorAll("#admin .admin-provider-row label:nth-child(2) input"));
      if (!noteInput || !refreshButton) return { adminProviderDraftPreserved: false, adminProviderIdsLocked: false };
      const marker = "smoke-draft-" + Date.now();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(noteInput, marker);
      noteInput.dispatchEvent(new Event("input", { bubbles: true }));
      refreshButton.click();
      return new Promise((resolve) => setTimeout(() => {
        resolve({
          adminProviderDraftPreserved: noteInput.value === marker && document.body.innerText.includes("Kaydedilmem"),
          adminProviderIdsLocked: idInputs.length > 0 && idInputs.every((input) => input.disabled)
        });
      }, 900));
    })()`,
    awaitPromise: true,
    returnByValue: true
  }, sessionId);
  const adminPanelResult = await cdp.send("Runtime.evaluate", {
    expression: `(() => ({
      adminLoggedIn: Boolean(document.querySelector(".admin-grid")),
      adminProviderEditorVisible: document.querySelectorAll("#admin .admin-provider-row input").length >= 6,
      adminProviderActionsVisible: Array.from(document.querySelectorAll("#admin .admin-cache-card button")).some((button) => button.textContent.includes("Ekle")) && Array.from(document.querySelectorAll("#admin .admin-cache-card button")).some((button) => button.textContent.includes("Kaydet")),
      adminTestDetails: document.querySelectorAll("#admin .admin-provider-test-result").length,
      adminAuditFiltersVisible: document.querySelectorAll("#admin .admin-audit-toolbar input, #admin .admin-audit-toolbar select").length >= 2,
      adminAuditSummaryVisible: document.querySelectorAll("#admin .admin-audit-summary span").length >= 5,
      adminResearchFiltersVisible: document.querySelectorAll("#admin .admin-research-toolbar input, #admin .admin-research-toolbar select").length >= 2,
      adminResearchSummaryVisible: document.querySelectorAll("#admin .admin-research-summary span").length >= 5,
      adminResearchCardVisible: Boolean(document.querySelector("#admin .admin-research-card")),
      adminResearchListOrEmptyVisible: Boolean(document.querySelector("#admin .admin-research-row")) || Boolean(document.querySelector("#admin .admin-research-card .admin-empty-state")),
      adminResearchClearVisible: Array.from(document.querySelectorAll("#admin .admin-research-toolbar button")).some((button) => button.textContent.includes("Araştırma Kayıtlarını Temizle")),
      adminOperationResultVisible: Boolean(document.querySelector("#admin .admin-operation-card")) && document.body.innerText.includes("Son Operasyon Sonucu")
    }))()`,
    returnByValue: true
  }, sessionId);
  await cdp.send("Target.closeTarget", { targetId: target.targetId });
  return { ...result.result.value, ...commandOpenResult.result.value, ...commandExecutedResult.result.value, ...signalsResult.result.value, ...screenerResult.result.value, ...researchResult.result.value, ...brokerPreviewResult.result.value, ...portfolioResult.result.value, ...importIdleResult.result.value, ...importSuccessResult.result.value, ...importDangerResult.result.value, ...reportsResult.result.value, ...adminLoginResult.result.value, ...providerDraftResult.result.value, ...adminPanelResult.result.value };
}

function assertNoBrowserErrors(events, label) {
  const failures = events.filter((event) => event.method === "Network.responseReceived" && event.params.response.status >= 400);
  const exceptions = events.filter((event) => event.method === "Runtime.exceptionThrown");
  if (failures.length || exceptions.length) {
    throw new Error(`${label}: ${JSON.stringify({ failures, exceptions }).slice(0, 1000)}`);
  }
}

async function waitForPageReady(cdp, sessionId) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const result = await cdp.send("Runtime.evaluate", {
      expression: `document.readyState === "complete" && document.body.innerText.includes("Proxy canlı")`,
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
  throw new Error("Command palette browser smoke için açılmadı.");
}

async function waitForSignalsReady(cdp, sessionId) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const result = await cdp.send("Runtime.evaluate", {
      expression: `Boolean(document.querySelector(".signals-center")) && document.querySelectorAll(".signal-table tbody tr").length >= 1`,
      returnByValue: true
    }, sessionId);
    if (result.result.value) {
      await delay(500);
      return;
    }
    await delay(250);
  }
  throw new Error("Sinyaller sayfası browser smoke için hazır olmadı.");
}

async function waitForAdminLogin(cdp, sessionId) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const result = await cdp.send("Runtime.evaluate", {
      expression: `Boolean(document.querySelector("#admin")) && Boolean(document.querySelector(".admin-login-form"))`,
      returnByValue: true
    }, sessionId);
    if (result.result.value) {
      await delay(500);
      return;
    }
    await delay(250);
  }
  throw new Error("Admin login sayfası browser smoke için hazır olmadı.");
}

async function waitForScreenerReady(cdp, sessionId) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const result = await cdp.send("Runtime.evaluate", {
      expression: `Boolean(document.querySelector("#screener.screener-page")) && document.querySelectorAll(".screener-result-row").length >= 1`,
      returnByValue: true
    }, sessionId);
    if (result.result.value) {
      await delay(500);
      return;
    }
    await delay(250);
  }
  throw new Error("Screener sayfası browser smoke için hazır olmadı.");
}

async function waitForResearchReady(cdp, sessionId) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const result = await cdp.send("Runtime.evaluate", {
      expression: `Boolean(document.querySelector("#research.research-page")) && document.querySelectorAll(".research-impact-metric").length >= 5`,
      returnByValue: true
    }, sessionId);
    if (result.result.value) {
      await delay(500);
      return;
    }
    await delay(250);
  }
  throw new Error("Araştırma sayfası browser smoke için hazır olmadı.");
}

async function waitForPortfolioReady(cdp, sessionId) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const result = await cdp.send("Runtime.evaluate", {
      expression: `Boolean(document.querySelector("#portfolio.portfolio-page")) && document.querySelectorAll(".portfolio-kpis .metric-card").length >= 4`,
      returnByValue: true
    }, sessionId);
    if (result.result.value) {
      await delay(500);
      return;
    }
    await delay(250);
  }
  throw new Error("Portföy sayfası browser smoke için hazır olmadı.");
}

async function waitForReportsReady(cdp, sessionId) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const result = await cdp.send("Runtime.evaluate", {
      expression: `Boolean(document.querySelector("#reports.reports-page")) && document.querySelectorAll(".daily-summary-metric").length >= 7`,
      returnByValue: true
    }, sessionId);
    if (result.result.value) {
      await delay(500);
      return;
    }
    await delay(250);
  }
  throw new Error("Raporlar sayfası browser smoke için hazır olmadı.");
}

async function waitForAdminReady(cdp, sessionId) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const result = await cdp.send("Runtime.evaluate", {
      expression: `Boolean(document.querySelector(".admin-grid"))`,
      returnByValue: true
    }, sessionId);
    if (result.result.value) {
      await delay(500);
      return;
    }
    await delay(250);
  }
  throw new Error("Admin panel browser smoke için hazır olmadı.");
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
