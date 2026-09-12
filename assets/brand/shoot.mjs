// Minimal CDP driver over the WebSocket Chrome exposes with --remote-debugging-port.
// No deps: uses Node's built-in ws via undici? No — use the raw devtools JSON + a tiny WS.
// Node 18+ has global WebSocket (undici). We rely on that.
const BASE = "http://localhost:3001/";
const DBG = "http://127.0.0.1:9222";
const OUT = "/Users/haziqrohaizan/Documents/ethonline2026/screenshots";
import { writeFileSync } from "node:fs";

async function targets() {
  const r = await fetch(`${DBG}/json`);
  return r.json();
}

function rpc(ws) {
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });
  return (method, params = {}) =>
    new Promise((resolve) => {
      const myId = ++id;
      pending.set(myId, resolve);
      ws.send(JSON.stringify({ id: myId, method, params }));
    });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shoot(send, name, { w = 1440, h = 900, scale = 2 } = {}) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: w, height: h, deviceScaleFactor: scale, mobile: w < 700,
  });
  await sleep(600);
  const { result } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(result.data, "base64"));
  console.log("saved", name);
}

async function click(send, selector) {
  const js = `(() => { const el = [...document.querySelectorAll('button')].find(b => b.textContent.includes(${JSON.stringify(selector)})); if (el) { el.click(); return true; } return false; })()`;
  const r = await send("Runtime.evaluate", { expression: js, returnByValue: true });
  return r.result?.value;
}

async function main() {
  // find a page target
  let t = (await targets()).find((x) => x.type === "page");
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res) => (ws.onopen = res));
  const send = rpc(ws);
  await send("Page.enable");
  await send("Runtime.enable");

  // 1) landing / dashboard (unverified) — already have one, retake clean
  await send("Page.navigate", { url: BASE });
  await sleep(2500);
  await shoot(send, "01-dashboard");

  // 2) verify via dev bypass, then screenshot the verified create panel
  const clicked = await click(send, "Dev bypass");
  await sleep(1800);
  await shoot(send, "02-verified-create");

  // 3) run the agent -> outcome
  await click(send, "Run agent");
  await sleep(3500);
  await shoot(send, "03-run-outcome");

  // 4) mobile responsive view
  await send("Page.navigate", { url: BASE });
  await sleep(2500);
  await shoot(send, "04-mobile", { w: 390, h: 844, scale: 3 });

  ws.close();
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
