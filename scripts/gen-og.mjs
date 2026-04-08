#!/usr/bin/env node
/**
 * gen-og.mjs — generates docs/og.png (1200×630) for GitHub Pages OG preview.
 * Usage: node scripts/gen-og.mjs
 * Requires: npm install -g puppeteer  OR  npx puppeteer is available
 */
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "../docs/og.png");

const HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1200px; height: 630px; overflow: hidden;
    background: #0d0d1a;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 80px;
    position: relative;
  }

  /* Left: text content */
  .left { flex: 0 0 auto; max-width: 540px; z-index: 2; }

  .org {
    font-size: 22px; font-weight: 500; color: #6366f1;
    letter-spacing: 0.04em; margin-bottom: 16px;
    font-family: "SF Mono", "Fira Code", monospace;
  }
  h1 {
    font-size: 72px; font-weight: 800; color: #f1f5f9;
    line-height: 1; letter-spacing: -0.04em; margin-bottom: 20px;
  }
  .tagline {
    font-size: 24px; color: #64748b; line-height: 1.4; margin-bottom: 40px;
    max-width: 460px;
  }
  .pills { display: flex; gap: 12px; flex-wrap: wrap; }
  .pill {
    background: #161625; border: 1px solid #2d2d4a;
    border-radius: 999px; padding: 8px 20px;
    font-size: 15px; color: #a5b4fc; font-weight: 600;
  }

  /* Right: book grid */
  .books {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 8px;
    width: 420px;
    flex-shrink: 0;
    opacity: 0.92;
  }
  .book {
    aspect-ratio: 2/3;
    border-radius: 5px;
    background: var(--c);
    position: relative;
    overflow: hidden;
  }
  .book::after {
    content: "";
    position: absolute; inset: 0;
    background: linear-gradient(135deg, rgba(255,255,255,0.08) 0%, transparent 60%);
  }
  /* Spine line */
  .book::before {
    content: "";
    position: absolute; top: 0; bottom: 0; left: 8px;
    width: 2px; background: rgba(0,0,0,0.2);
  }

  /* Fade edge on left side of book grid */
  .books-wrap {
    position: relative;
    flex-shrink: 0;
  }
  .books-wrap::before {
    content: "";
    position: absolute; top: 0; bottom: 0; left: -60px;
    width: 80px;
    background: linear-gradient(to right, #0d0d1a, transparent);
    z-index: 1;
    pointer-events: none;
  }
</style>
</head>
<body>
<div class="left">
  <div class="org">booklib-ai / skills</div>
  <h1>Skills</h1>
  <p class="tagline">Expert knowledge from 24 canonical programming books — packaged as AI agent skills.</p>
  <div class="pills">
    <span class="pill">24 skills</span>
    <span class="pill">760 tests</span>
    <span class="pill">10 ecosystems</span>
    <span class="pill">14 AI tools</span>
    <span class="pill">v2.1.0</span>
  </div>
</div>

<div class="books-wrap">
  <div class="books">
    ${[
      "#1e3a5f","#5f1e1e","#1e5f2a","#5f4a1e","#2a1e5f",
      "#1e4d5f","#5f1e4a","#3d5f1e","#5f3d1e","#1e5f5f",
      "#4a1e5f","#1e5f3d","#5f5f1e","#1e2a5f","#5f1e2a",
      "#2a5f1e","#5f2a1e","#1e5f4a","#4a5f1e","#1e4a5f",
      "#5f1e5f","#3d1e5f","#1e5f1e","#5f3d3d","#1e3d5f",
      "#5f4d1e","#1e4d3d","#4d1e1e","#1e1e4d","#3d5f3d",
    ].map(c => `<div class="book" style="--c:${c}"></div>`).join("")}
  </div>
</div>
</body>
</html>`;

let puppeteer;
try {
  puppeteer = await import("puppeteer");
} catch {
  // Try puppeteer-core as fallback
  puppeteer = await import("puppeteer-core");
}

const browser = await puppeteer.default.launch({ headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 2 });
await page.setContent(HTML, { waitUntil: "domcontentloaded" });
const buf = await page.screenshot({ type: "png" });
await browser.close();

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, buf);
console.log(`Written: ${OUT} (${(buf.length / 1024).toFixed(0)} KB)`);
