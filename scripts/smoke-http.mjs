const PROXY = "http://127.0.0.1:8766";

const checks = [
  {
    name: "proxy health",
    url: `${PROXY}/api/health`,
    validate: (json) => json?.success === true && Boolean(json?.data?.service)
  },
  {
    name: "proxy status",
    url: `${PROXY}/api/status`,
    validate: (json) => json?.success === true && Boolean(json?.data)
  },
  {
    name: "snapshot batch",
    url: `${PROXY}/api/snapshots?symbols=NVDA,AMD,TSLA`,
    validate: (json) => json?.success === true
      && Array.isArray(json?.data)
      && json.data.length === 3
      && json.data.every((item) => item.symbol && Number.isFinite(Number(item.price)))
  },
  {
    name: "nasdaq alias SpaceX",
    url: `${PROXY}/api/nasdaq-universe?q=SpaceX&limit=10`,
    validate: (json) => json?.success === true
      && Array.isArray(json?.data?.rows)
      && json.data.rows.some((row) => row.symbol === "SPCX" || String(row.company || "").toLowerCase().includes("space"))
  },
  {
    name: "nasdaq universe enriched",
    url: `${PROXY}/api/nasdaq-universe?q=NVDA&limit=5`,
    validate: (json) => json?.success === true
      && Array.isArray(json?.data?.rows)
      && json.data.rows.some((row) => row.symbol === "NVDA" && row.category && Object.hasOwn(row, "autoFibTarget"))
  },
  {
    name: "history NVDA",
    url: `${PROXY}/api/history/NVDA?range=1mo&interval=1d`,
    validate: (json) => json?.success === true && Array.isArray(json?.data?.points) && json.data.points.length > 0
  },
  {
    name: "signals batch",
    url: `${PROXY}/api/signals?symbols=NVDA,AMD,TSLA`,
    validate: (json) => json?.success === true
      && Array.isArray(json?.data)
      && json.data.length === 3
      && json.data.every((item) => item.symbol && item.signal && Array.isArray(item.reasons))
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
