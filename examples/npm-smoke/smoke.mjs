import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
  rm,
} from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { startServer } from "./server.mjs";
const chromeBin = process.env.CHROME_BIN;
if (!chromeBin)
  throw new Error(
    "Set CHROME_BIN to your Chrome or Chromium executable. See README.md.",
  );
await access(chromeBin);
await mkdir("artifacts", { recursive: true });
const { server, url } = await startServer();
const profile = await mkdtemp(
  new URL("./artifacts/chrome-profile-", import.meta.url).pathname,
);
const chrome = spawn(
  chromeBin,
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank",
  ],
  { stdio: ["ignore", "ignore", "pipe"] },
);
let chromeLog = "";
chrome.stderr.on("data", (data) => (chromeLog += data));
let ws;
let id = 0;
const pending = new Map();
const errors = [];
const consoleCalls = [];
const networkErrors = [];
const checks = [];
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const key = ++id;
    const timer = setTimeout(() => {
      pending.delete(key);
      reject(new Error("CDP timeout: " + method));
    }, 15000);
    pending.set(key, { resolve, reject, timer });
    ws.send(JSON.stringify({ id: key, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails)
    throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function ready() {
  for (let i = 0; i < 100; i++) {
    if (await evaluate("Boolean(window.smoke)")) return;
    await delay(50);
  }
  throw new Error("App failed to initialize");
}
async function check(name, fn) {
  await fn();
  checks.push({ name, status: "passed" });
  console.log("PASS", name);
}
async function click(selector) {
  const p = await evaluate(
    `(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`,
  );
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    button: "left",
    buttons: 1,
    clickCount: 1,
    ...p,
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    button: "left",
    buttons: 0,
    clickCount: 1,
    ...p,
  });
}
async function selectText(selector, text, kind = "main") {
  const points = await evaluate(`(()=>{
    window.getSelection().removeAllRanges();document.querySelector('#frame').contentWindow.getSelection().removeAllRanges();
    const kind=${JSON.stringify(kind)},doc=kind==='frame'?document.querySelector('#frame').contentDocument:document;
    const el=doc.querySelector(${JSON.stringify(selector)}),text=${JSON.stringify(text)},start=el.textContent.indexOf(text);if(start<0)throw new Error('Text missing');
    const walker=doc.createTreeWalker(el,NodeFilter.SHOW_TEXT);const nodes=[];let node,total=0;while(node=walker.nextNode()){nodes.push({node,start:total,end:total+node.length});total+=node.length;}
    function charRect(offset){const entry=nodes.find(n=>offset>=n.start&&offset<n.end);const range=doc.createRange();range.setStart(entry.node,offset-entry.start);range.setEnd(entry.node,offset-entry.start+1);return range.getBoundingClientRect();}
    const first=charRect(start),last=charRect(start+text.length-1),frame=document.querySelector('#frame'),fr=frame.getBoundingClientRect();const dx=kind==='frame'?fr.left+frame.clientLeft:0,dy=kind==='frame'?fr.top+frame.clientTop:0;
    return {from:{x:first.left+1+dx,y:first.top+first.height/2+dy},to:{x:last.right-1+dx,y:last.top+last.height/2+dy}};
  })()`);
  await send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    ...points.from,
  });
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    button: "left",
    buttons: 1,
    clickCount: 1,
    ...points.from,
  });
  for (let step = 1; step <= 12; step++)
    await send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      buttons: 1,
      button: "left",
      x: points.from.x + ((points.to.x - points.from.x) * step) / 12,
      y: points.from.y + ((points.to.y - points.from.y) * step) / 12,
    });
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    button: "left",
    buttons: 0,
    clickCount: 1,
    ...points.to,
  });
  assert.equal(
    await evaluate(`smoke.markers.${kind}.window.getSelection().toString()`),
    text,
    "Actual mouse-selected text",
  );
}
async function texts(kind = "main") {
  return evaluate(`[...smoke.state.${kind}.values()].map(x=>x.text)`);
}
try {
  let port;
  for (let i = 0; i < 100; i++) {
    try {
      port = (await readFile(profile + "/DevToolsActivePort", "utf8")).split(
        "\n",
      )[0];
      break;
    } catch {
      await delay(100);
    }
  }
  if (!port) throw new Error("Chrome did not start: " + chromeLog);
  const browser = await (
    await fetch(`http://127.0.0.1:${port}/json/version`)
  ).json();
  const target = await (
    await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {
      method: "PUT",
    })
  ).json();
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  ws.onmessage = ({ data }) => {
    const event = JSON.parse(data);
    if (event.id) {
      const request = pending.get(event.id);
      if (!request) return;
      clearTimeout(request.timer);
      pending.delete(event.id);
      event.error
        ? request.reject(new Error(JSON.stringify(event.error)))
        : request.resolve(event.result);
    } else if (event.method === "Runtime.exceptionThrown")
      errors.push(event.params);
    else if (event.method === "Runtime.consoleAPICalled")
      consoleCalls.push(event.params);
    else if (event.method === "Network.loadingFailed")
      networkErrors.push(event.params);
    else if (
      event.method === "Network.responseReceived" &&
      event.params.response.status >= 400
    )
      networkErrors.push(event.params.response);
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1200,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", { url });
  await ready();
  const version = await evaluate("smoke.version");
  const registry = JSON.parse(await readFile("registry.json", "utf8"));
  await check("Public npm latest loads in Chromium", async () =>
    assert.equal(version, registry["dist-tags"].latest),
  );
  const original = await evaluate(
    'document.querySelector("#reader").textContent',
  );
  const styles = await evaluate(
    '[document.querySelectorAll("style").length,smoke.markers.frame.document.querySelectorAll("style").length]',
  );
  await check(
    "Mouse-select one Chinese character, paint, and deserialize",
    async () => {
      await selectText("#plain", "眠");
      await click("#paint");
      assert.deepEqual(await texts(), ["眠"]);
      assert.equal(
        await evaluate(
          'document.querySelector("[data-test-highlight]").textContent',
        ),
        "眠",
      );
      assert.equal(
        await evaluate(
          "smoke.markers.main.deserializeRange([...smoke.state.main.values()][0]).toString()",
        ),
        "眠",
      );
    },
  );
  await check("Click removes highlight and cached range state", async () => {
    const uid = await evaluate("[...smoke.state.main.keys()][0]");
    await click("[data-test-highlight]");
    assert.deepEqual(await texts(), []);
    assert.equal(
      await evaluate(
        `smoke.markers.main.getSerializedRangeFromUid(${JSON.stringify(uid)})`,
      ),
      null,
    );
    assert.equal(await evaluate("smoke.state.clicks"), 1);
    assert.equal(
      await evaluate('document.querySelector("#reader").textContent'),
      original,
    );
  });
  await check("Mouse-select Chinese text across inline elements", async () => {
    await selectText("#mixed", "选择汉字，跨越行内元素");
    await click("#paint");
    assert.deepEqual(await texts(), ["选择汉字，跨越行内元素"]);
    assert.equal(
      await evaluate(
        '[...document.querySelectorAll("#mixed [data-test-highlight]")].map(x=>x.textContent).join("")',
      ),
      "选择汉字，跨越行内元素",
    );
  });
  await check(
    "Mouse selection and painting use iframe owner document",
    async () => {
      await selectText("#frameText", "中文选择", "frame");
      await click("#paint");
      assert.deepEqual(await texts("frame"), ["中文选择"]);
      assert.equal(
        await evaluate(
          'smoke.markers.frame.document.querySelector("[data-test-highlight]").textContent',
        ),
        "中文选择",
      );
    },
  );
  await check("JSON save and restore survive a full page reload", async () => {
    await click("#save");
    await send("Page.reload");
    await delay(150);
    await ready();
    assert.deepEqual(await texts(), []);
    await click("#restore");
    assert.deepEqual(await texts(), ["选择汉字，跨越行内元素"]);
    assert.deepEqual(await texts("frame"), ["中文选择"]);
    assert.equal(
      await evaluate(
        "smoke.markers.main.deserializeRange([...smoke.state.main.values()][0]).toString()",
      ),
      "选择汉字，跨越行内元素",
    );
  });
  await writeFile(
    "artifacts/chinese-highlights.png",
    Buffer.from(
      (
        await send("Page.captureScreenshot", {
          format: "png",
          captureBeyondViewport: true,
        })
      ).data,
      "base64",
    ),
  );
  await check(
    "Supplementary Chinese character and emoji remain intact",
    async () => {
      await click("#clear");
      await selectText("#mixed", "𠮷野家与😀");
      await click("#paint");
      assert.deepEqual(await texts(), ["𠮷野家与😀"]);
      await click("#clear");
    },
  );
  await check("Text equal to __proto__ round-trips", async () => {
    await selectText("#edge", "__proto__");
    await click("#paint");
    assert.deepEqual(await texts(), ["__proto__"]);
    assert.equal(
      await evaluate(
        "smoke.markers.main.deserializeRange([...smoke.state.main.values()][0]).toString()",
      ),
      "__proto__",
    );
    await click("#clear");
  });
  for (const [mode, expected] of [
    ["allow", ["春眠不觉", "不觉晓"]],
    ["merge", ["春眠不觉晓"]],
    ["dontCreateNewHighlight", ["春眠不觉"]],
    ["deleteOverlappedHighlight", ["不觉晓"]],
  ]) {
    await check("Overlap policy: " + mode, async () => {
      await evaluate(
        `document.querySelector('#mode').value=${JSON.stringify(mode)};smoke.reset()`,
      );
      await selectText("#plain", "春眠不觉");
      await click("#paint");
      await selectText("#plain", "不觉晓");
      await click("#paint");
      assert.deepEqual(await texts(), expected);
      await click("#clear");
    });
  }
  await check("No text corruption or leaked temporary styles", async () => {
    assert.equal(
      await evaluate('document.querySelector("#reader").textContent'),
      original,
    );
    assert.deepEqual(
      await evaluate(
        '[document.querySelectorAll("style").length,smoke.markers.frame.document.querySelectorAll("style").length]',
      ),
      styles,
    );
  });
  await check(
    "No browser errors, failed requests, or default debug logging",
    async () => {
      assert.deepEqual(errors, []);
      assert.deepEqual(networkErrors, []);
      assert.deepEqual(consoleCalls, []);
    },
  );
  await writeFile(
    "artifacts/report.json",
    JSON.stringify(
      {
        version,
        browser: browser.Browser,
        protocol: browser["Protocol-Version"],
        transport: "Direct Chrome DevTools Protocol over WebSocket",
        registryIntegrity: registry["dist.integrity"],
        checks,
        errors,
        networkErrors,
        consoleCalls,
      },
      null,
      2,
    ),
  );
  console.log(
    `Passed ${checks.length} checks for @notelix/web-marker@${version} (${browser.Browser})`,
  );
} catch (error) {
  await writeFile(
    "artifacts/failure.json",
    JSON.stringify(
      {
        message: error.message,
        stack: error.stack,
        checks,
        errors,
        networkErrors,
        consoleCalls,
      },
      null,
      2,
    ),
  );
  console.error(error);
  process.exitCode = 1;
} finally {
  ws?.close();
  const stopped = new Promise((resolve) => chrome.once("close", resolve));
  chrome.kill("SIGTERM");
  await stopped;
  server.close();
  await rm(profile, { recursive: true, force: true });
  await writeFile("artifacts/chrome.log", chromeLog);
}
