// Dev helper: list the elements that push a page wider than a phone viewport.
import { chromium } from "playwright-core";
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const ROOT = path.resolve("..", "..");
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(new URL(q.url, "http://x").pathname));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "Content-Type": f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : f.endsWith(".json") ? "application/json" : "text/html" });
  fs.createReadStream(f).pipe(r); }).listen(0);
const base = `http://127.0.0.1:${srv.address().port}/`;
const b = await chromium.launch({ channel: "chrome" });
for (const p of process.argv.slice(2)) {
  const pg = await b.newPage({ viewport: { width: 375, height: 800 } });
  await pg.goto(base + p); await pg.waitForLoadState("networkidle"); await pg.waitForTimeout(800);
  const out = await pg.evaluate(() => [...document.querySelectorAll("body *")].filter(e => {
      const r = e.getBoundingClientRect(); return r.right > innerWidth + 1 && r.width > 0; })
    .filter(e => ![...e.children].some(c => c.getBoundingClientRect().right > innerWidth + 1))
    .slice(0, 8).map(e => `${e.tagName.toLowerCase()}.${[...e.classList].join(".")}#${e.id} right=${Math.round(e.getBoundingClientRect().right)} w=${Math.round(e.getBoundingClientRect().width)} :: ${(e.textContent||"").trim().slice(0,50)}`));
  console.log(p, "\n  " + out.join("\n  "));
}
await b.close(); srv.close();
