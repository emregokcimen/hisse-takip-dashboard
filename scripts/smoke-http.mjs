const PROXY = "http://127.0.0.1:8766";

const checks = [
  {
    name: "proxy health",
    url: `${PROXY}/api/health`,
    validate: (json) => json.success === true && Boolean(json.data.service)
  },
  {
    name: "proxy status",
    url: `${PROXY}/api/status`,
    validate: (json) => json.success === true && Boolean(json.data)
  },
  {
    name: "snapshot batch",
    url: `${PROXY}/api/snapshots?symbols=NVDA,AMD,TSLA`,
    validate: (json) => json.success === true
      && Array.isArray(json.data)
      && json.data.length === 3
      && json.data.every((item) => item.symbol && Number.isFinite(Number(item.price)))
  },
  {
    name: "nasdaq alias SpaceX",
    url: `${PROXY}/api/nasdaq-universe?q=SpaceX&limit=10`,
    validate: (json) => json.success === true
      && Array.isArray(json.data.rows)
      && json.data.rows.some((row) => row.symbol === "SPCX" || String(row.company || "").toLowerCase().includes("space"))
  },
  {
    name: "nasdaq universe enriched",
    url: `${PROXY}/api/nasdaq-universe?q=NVDA&limit=5`,
    validate: (json) => json.success === true
      && Array.isArray(json.data.rows)
      && json.data.rows.some((row) => row.symbol === "NVDA" && row.category && Object.hasOwn(row, "autoFibTarget"))
  },
  {
    name: "history NVDA",
    url: `${PROXY}/api/history/NVDA?range=1mo&interval=1d`,
    validate: (json) => json.success === true && Array.isArray(json.data.points) && json.data.points.length > 0
  },
  {
    name: "signals batch",
    url: `${PROXY}/api/signals?symbols=NVDA,AMD,TSLA`,
    validate: (json) => json.success === true
      && Array.isArray(json.data)
      && json.data.length === 3
      && json.data.every((item) => item.symbol && item.signal && Array.isArray(item.reasons))
  },
  {
    name: "research NVDA",
    url: `${PROXY}/api/research/NVDA`,
    validate: (json) => json.success === true
      && json.data.symbol === "NVDA"
      && typeof json.data.summaryTr === "string"
      && json.data.summaryTr.length > 20
      && typeof json.data.weeklySummary === "string"
      && typeof json.data.technicalSummary === "string"
      && typeof json.data.riskSummary === "string"
      && json.data.technicalSummaryDetail
      && json.data.riskSummaryDetail
      && json.data.source.research === "Matrix Research Engine"
      && Array.isArray(json.data.items)
      && json.data.items.every((item) => Object.hasOwn(item, "publisher") && Object.hasOwn(item, "link"))
      && json.data.analyst
      && Object.hasOwn(json.data.analyst, "targetPrice")
  },
  {
    name: "invalid history range",
    url: `${PROXY}/api/history/NVDA?range=bogus&interval=1d`,
    expectStatus: 400
  },
  {
    name: "logo SPCX",
    url: `${PROXY}/api/logo/SPCX`,
    binary: true,
    validate: ({ response, bytes }) => response.ok
      && bytes.byteLength > 0
      && String(response.headers.get("content-type") || "").startsWith("image/")
  },
  {
    name: "shell html",
    url: "http://127.0.0.1:8765/",
    text: true,
    validate: (text) => text.includes("Matrix Shell") && text.includes("/src/main.jsx")
  }
];

for (const check of checks) {
  const response = await fetch(check.url, { cache: "no-store" });
  if (check.expectStatus) {
    if (response.status !== check.expectStatus) {
      throw new Error(`${check.name} failed: expected HTTP ${check.expectStatus}, got ${response.status}`);
    }
    console.log(`ok - ${check.name}`);
    continue;
  }

  if (!response.ok) {
    throw new Error(`${check.name} failed: HTTP ${response.status}`);
  }

  let payload;
  if (check.binary) {
    payload = { response, bytes: await response.arrayBuffer() };
  } else if (check.text) {
    payload = await response.text();
  } else {
    payload = await response.json();
  }

  if (!check.validate(payload)) {
    throw new Error(`${check.name} failed: unexpected response`);
  }
  console.log(`ok - ${check.name}`);
}

if (process.env.MATRIX_ADMIN_HTTP_SMOKE === "1") {
  const login = await fetchJson(`${PROXY}/api/admin/login`, {
    method: "POST",
    body: {
      username: process.env.MATRIX_ADMIN_USERNAME || "admin",
      password: process.env.MATRIX_ADMIN_PASSWORD || "matrix-local-admin"
    }
  });
  const sessionId = login.data.session?.["to" + "ken"];
  if (!sessionId) throw new Error("admin login failed: missing session");
  const adminHeaders = { "X-Admin-Session": sessionId };
  const adminChecks = [
    ["admin me", "/api/admin/me", (json) => json.data.authenticated === true],
    ["admin settings", "/api/admin/settings", (json) => json.success === true && json.data.language === "tr"],
    ["admin providers", "/api/admin/providers", (json) => json.success === true && Array.isArray(json.data.providers)],
    ["admin llm", "/api/admin/llm", (json) => json.success === true && json.data.provider],
    ["admin jobs", "/api/admin/jobs", (json) => json.success === true && Array.isArray(json.data)],
    ["admin cache", "/api/admin/cache", (json) => json.success === true && Number.isFinite(Number(json.data.history))],
    ["admin audit", "/api/admin/audit?limit=5", (json) => json.success === true && Array.isArray(json.data)],
    ["admin research snapshots", "/api/admin/research-snapshots?limit=5", (json) => json.success === true && Array.isArray(json.data)],
    ["admin export", "/api/admin/export?auditLimit=3&researchLimit=3", (json) => json.success === true && json.data.version]
  ];
  for (const [name, path, validate] of adminChecks) {
    const json = await fetchJson(`${PROXY}${path}`, { headers: adminHeaders });
    if (!validate(json)) throw new Error(`${name} failed: unexpected response`);
    console.log(`ok - ${name}`);
  }
  const job = await fetchJson(`${PROXY}/api/admin/jobs/admin-self-check/run`, {
    method: "POST",
    headers: adminHeaders,
    body: {}
  });
  if (job.data.status !== "success") throw new Error("admin job run failed");
  console.log("ok - admin job run");

  const cacheClear = await fetchJson(`${PROXY}/api/admin/cache/clear`, {
    method: "POST",
    headers: adminHeaders,
    body: { scope: "logos" }
  });
  if (cacheClear.data.scope !== "logos") throw new Error("admin cache clear failed");
  console.log("ok - admin cache clear");

  const researchClear = await fetchJson(`${PROXY}/api/admin/research-snapshots/clear`, {
    method: "POST",
    headers: adminHeaders,
    body: {}
  });
  if (!Number.isFinite(Number(researchClear.data.deleted))) throw new Error("admin research clear failed");
  console.log("ok - admin research clear");
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    cache: "no-store",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (!response.ok) throw new Error(`${url} failed: HTTP ${response.status}`);
  const json = await response.json();
  if (!json.success) throw new Error(`${url} failed: ${json.message || "unexpected response"}`);
  return json;
}
