// Dev helper: screenshot one element (selector) of a page.  node clip.mjs page selector out [width] [theme]
import { chromium } from "playwright-core";
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const ROOT = path.resolve("..", "..");
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(new URL(q.url, "http://x").pathname));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "Content-Type": f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : f.endsWith(".json") ? "application/json" : "text/html" });
  fs.createReadStream(f).pipe(r); }).listen(0);
const [p, sel, out, w = "1400", theme = "dark"] = process.argv.slice(2);
fs.mkdirSync("shots", { recursive: true });
const b = await chromium.launch({ channel: "chrome" });
const pg = await b.newPage({ viewport: { width: +w, height: 900 } });
await pg.goto(`http://127.0.0.1:${srv.address().port}/${p}${p.includes("?") ? "&" : "?"}theme=${theme}`);
await pg.waitForLoadState("networkidle"); await pg.waitForTimeout(600);
await pg.locator(sel).first().screenshot({ path: "shots/" + out });
await b.close(); srv.close();
