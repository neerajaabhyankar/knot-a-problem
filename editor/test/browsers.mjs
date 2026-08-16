// Layout and theme, checked in every engine we claim to support.
//
//   npm run dev          (in another shell)
//   node test/browsers.mjs
//
// The full smoke test drives Firefox only, which is how a swatch that collapsed
// to 2px wide in WebKit reached the user. Anything here is cheap and engine-
// sensitive: box geometry, and tokens read back out of the stylesheet.

import { firefox, webkit } from 'playwright';

const APP_URL = process.env.URL ?? 'http://localhost:5173/';

const problems = [];
function check(engine, ok, label, detail = '') {
  console.log(`${ok ? '  ok  ' : ' FAIL '} [${engine}] ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) problems.push(`${engine}: ${label}`);
}

for (const [name, engine] of [['firefox', firefox], ['webkit', webkit]]) {
  const browser = await engine.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(APP_URL, { waitUntil: 'networkidle' });
  await page.click('#help-close');
  await page.keyboard.press('d');
  await page.waitForTimeout(250);

  const layout = await page.evaluate(() => {
    const box = (sel) => {
      const b = document.querySelector(sel).getBoundingClientRect();
      return { w: Math.round(b.width), h: Math.round(b.height), right: b.right };
    };
    const rail = document.getElementById('rail').getBoundingClientRect();
    const tool = box('[data-tool="draw"]');
    return {
      swatches: ['#sw-draw-color', '#sw-draw-size'].map(box),
      toolHeight: tool.h,
      railRight: rail.right,
    };
  });

  check(
    name,
    layout.swatches.every((s) => s.w === s.h),
    'the swatches are square',
    layout.swatches.map((s) => `${s.w}x${s.h}`).join(' '),
  );
  check(
    name,
    layout.swatches.every((s) => s.h === layout.toolHeight),
    'and exactly as tall as the tool button',
    `swatch ${layout.swatches[0].h}px, button ${layout.toolHeight}px`,
  );
  check(
    name,
    layout.swatches.every((s) => s.right <= layout.railRight + 1),
    'and stay inside the rail',
  );

  // theme.js reads the palette out of style.css. If the stylesheet had not been
  // applied when it ran, every strand would render white instead.
  const theme = await page.evaluate(() => {
    const bg = getComputedStyle(document.getElementById('sw-draw-color')).backgroundColor;
    const chips = [...document.querySelectorAll('.panel .chip')].map((c) => c.dataset.color);
    return { bg, chips: chips.slice(0, 9), unique: new Set(chips.slice(0, 9)).size };
  });
  check(
    name,
    theme.unique === 9 && theme.chips.every((c) => /^#[0-9a-f]{6}$/i.test(c)),
    'the palette came through from style.css',
    `${theme.unique} distinct`,
  );
  check(name, theme.bg === 'rgb(210, 210, 75)', 'the draw swatch starts on citron', theme.bg);

  check(name, errors.length === 0, 'no page errors', errors.slice(0, 2).join(' | '));
  await browser.close();
}

console.log(problems.length ? `\n${problems.length} failing check(s)` : '\nall checks passed');
process.exit(problems.length ? 1 : 0);
