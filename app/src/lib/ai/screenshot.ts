// ============================================================================
// Screenshot a slide by rendering HTML in a headless browser
// Used for visual recheck — renders renderSlide() output → PNG base64
// Dependencies (@sparticuz/chromium + puppeteer-core) are optional —
// installed only on Vercel deployment, not required for local dev/build.
// ============================================================================

import { renderSlide } from '../renderSlide';
import type { Slide, Theme } from '../types';

/**
 * Generate a full HTML page wrapping a single slide for screenshot.
 */
export function slideToFullHtml(slide: Slide, theme: Theme): string {
  const html = renderSlide(slide, theme);
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&family=Noto+Sans+SC:wght@300;400;500;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 960px; height: 540px; overflow: hidden; }
  </style>
</head>
<body>${html}</body>
</html>`;
}

/**
 * Take a screenshot using Puppeteer (serverless).
 * Returns base64-encoded PNG, or empty string if Puppeteer is not available.
 */
export async function screenshotSlide(slide: Slide, theme: Theme): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const chromium = require('@sparticuz/chromium');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const puppeteer = require('puppeteer-core');

    const browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 960, height: 540 });

      const html = slideToFullHtml(slide, theme);
      await page.setContent(html, { waitUntil: 'networkidle0' });

      const screenshot = await page.screenshot({ encoding: 'base64', type: 'png' });
      return screenshot as string;
    } finally {
      await browser.close();
    }
  } catch {
    // Puppeteer not available (local dev), skip screenshot
    return '';
  }
}
