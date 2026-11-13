// Render the existing, unmodified logo inside a square PWA icon. No new artwork.
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
const logo = (await readFile("frontend/public/logoklooyd.png")).toString(
  "base64",
);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="#f5f6f3"/><image href="data:image/png;base64,${logo}" x="48" y="175" width="416" height="162"/></svg>`;
await writeFile("frontend/public/mobile/icon.svg", svg);
const browser = await chromium.launch({ headless: true });
try {
  for (const size of [192, 512]) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    await page.setContent(
      `<style>html,body{margin:0;width:100%;height:100%;background:#f5f6f3}svg{width:100%;height:100%;display:block}</style>${svg}`,
    );
    await page.screenshot({ path: `frontend/public/mobile/icon-${size}.png` });
    await page.close();
  }
} finally {
  await browser.close();
}
