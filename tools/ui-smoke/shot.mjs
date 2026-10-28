// Dev helper: screenshot pages at desktop and phone width into ./shots/.
import { chromium } from "playwright-core";
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const ROOT = path.resolve("..", "..");
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(new URL(q.url, "http://x").pathname));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "Content-Type": f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : f.endsWith(".json") ? "application/json" : "text/html" });
  fs.createReadStream(f).pipe(r); }).listen(0);
fs.mkdirSync("shots", { recursive: true });
const b = await chromium.launch({ channel: "chrome" });
for (const spec of process.argv.slice(2)) {
  const [p, w = "1400", theme = "dark", full = ""] = spec.split(",");
  const pg = await b.newPage({ viewport: { width: +w, height: 900 } });
  const errs = []; pg.on("pageerror", e => errs.push(e.message));
  const [file, hash = ""] = p.split("#");
  await pg.goto(`http://127.0.0.1:${srv.address().port}/${file}${file.includes("?") ? "&" : "?"}theme=${theme}${hash ? "#" + hash : ""}`);
  await pg.waitForLoadState("networkidle"); await pg.waitForTimeout(700);
  const out = `shots/${p.replace(/[^a-z0-9]+/gi, "_")}_${w}_${theme}.png`;
  await pg.screenshot({ path: out, fullPage: full === "full" });
  console.log(out, errs.length ? "ERR " + errs.join(" | ") : "");
}
await b.close(); srv.close();
