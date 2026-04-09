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
    flex-direction: column;
    justify-content: center;
    padding: 0 100px;
    position: relative;
  }

  /* Subtle gradient accent */
  body::before {
    content: "";
    position: absolute;
    top: -100px; right: -100px;
    width: 500px; height: 500px;
    background: radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%);
    pointer-events: none;
  }

  .logo {
    width: 56px; height: 56px;
    margin-bottom: 40px;
    filter: brightness(0) invert(1);
  }

  .headline {
    font-size: 52px;
    font-weight: 800;
    color: #f1f5f9;
    line-height: 1.15;
    letter-spacing: -0.03em;
    margin-bottom: 20px;
    max-width: 800px;
  }

  .punchline {
    font-size: 44px;
    font-weight: 700;
    color: #6366f1;
    line-height: 1.2;
    margin-bottom: 48px;
  }

  .install {
    font-family: "SF Mono", "Fira Code", "Consolas", monospace;
    font-size: 20px;
    color: #475569;
    letter-spacing: 0.02em;
  }

  .install span {
    color: #64748b;
  }
</style>
</head>
<body>
  <img class="logo" src="https://raw.githubusercontent.com/booklib-ai/booklib/main/assets/logo.svg" />
  <div class="headline">Your AI doesn't know the APIs<br/>you shipped last month.</div>
  <div class="punchline">BookLib fixes that.</div>
  <div class="install"><span>$</span> npm install -g @booklib/core</div>
</body>
</html>`;

let puppeteer;
try {
  puppeteer = await import("puppeteer");
} catch {
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
