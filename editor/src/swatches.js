// The little squares beside a tool, and the panels they open.
//
// Two kinds, and they behave identically: a swatch shows the current value, a
// click opens a panel to the right of the rail, a change fires `onChange`. The
// panels float clear of the rail, so nothing reflows when one opens, and each
// square is exactly as tall as the tool button beside it.

import { DEFAULT_COLOR, PALETTE, STRAND_S, STRAND_L, colorHue, hueColor } from './theme.js';

let openPanel = null;

/** Close whatever is open. Clicking anywhere else does this too. */
export function closeSwatch() {
  openPanel?.el.classList.remove('open');
  openPanel?.swatch.classList.remove('active');
  openPanel = null;
}

addEventListener('pointerdown', (ev) => {
  if (!openPanel) return;
  if (openPanel.el.contains(ev.target) || openPanel.swatch.contains(ev.target)) return;
  closeSwatch();
});
addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && openPanel) {
    closeSwatch();
    ev.stopImmediatePropagation(); // Escape closes the panel, not the strand
  }
}, true);

function toggle(swatch, el) {
  const isOpen = openPanel?.swatch === swatch;
  closeSwatch();
  if (isOpen) return;
  // Line the panel up with its swatch, floating clear of the rail.
  el.style.top = `${swatch.getBoundingClientRect().top}px`;
  el.classList.add('open');
  swatch.classList.add('active');
  openPanel = { swatch, el };
}

/**
 * A colour swatch. The panel is the nine presets plus one hue strip — saturation
 * and lightness are locked, so every colour it can produce belongs to the set.
 */
export function colorSwatch(swatch, onChange) {
  const el = document.createElement('div');
  el.className = 'panel';
  el.innerHTML = `
    <div class="grid">${PALETTE.map(
      (c) => `<button class="chip" data-color="${c}" style="background:${c}" title="${c}"></button>`,
    ).join('')}</div>
    <label class="strip">
      <span>Hue</span>
      <input type="range" min="0" max="359" step="1" />
    </label>`;
  document.body.appendChild(el);

  const slider = el.querySelector('input');
  slider.style.background = `linear-gradient(to right, ${Array.from(
    { length: 13 },
    (_, i) => `hsl(${i * 30} ${STRAND_S}% ${STRAND_L}%)`,
  ).join(',')})`;

  let value = DEFAULT_COLOR;
  const paint = () => {
    swatch.style.background = value;
    for (const chip of el.querySelectorAll('.chip')) {
      chip.classList.toggle('on', chip.dataset.color === value);
    }
  };

  const set = (next, notify = true) => {
    value = next;
    slider.value = Math.round(colorHue(next));
    paint();
    if (notify) onChange(value);
  };

  el.addEventListener('click', (ev) => {
    const chip = ev.target.closest('.chip');
    if (chip) set(chip.dataset.color);
  });
  slider.addEventListener('input', () => set(hueColor(slider.value)));
  swatch.addEventListener('click', () => toggle(swatch, el));

  set(DEFAULT_COLOR, false);
  return { get: () => value, set: (c) => set(c, false), el };
}

/**
 * A size swatch: a slider, and the square itself previews the size as a dot.
 * `format` turns the raw value into the caption.
 */
export function sizeSwatch(swatch, { min, max, step, value, format }, onChange) {
  const el = document.createElement('div');
  el.className = 'panel';
  el.innerHTML = `
    <label class="strip">
      <span>Size</span>
      <output></output>
      <input type="range" min="${min}" max="${max}" step="${step}" />
    </label>`;
  document.body.appendChild(el);

  const slider = el.querySelector('input');
  const out = el.querySelector('output');
  const dot = document.createElement('i');
  swatch.appendChild(dot);

  let current = value;
  const paint = () => {
    out.textContent = format(current);
    // The dot fills the square in proportion to where the value sits.
    const f = (current - min) / (max - min);
    const px = 6 + Math.round(f * 13);
    dot.style.width = `${px}px`;
    dot.style.height = `${px}px`;
  };

  const set = (next, notify = true) => {
    current = Number(next);
    slider.value = current;
    paint();
    if (notify) onChange(current);
  };

  slider.addEventListener('input', () => set(slider.value));
  swatch.addEventListener('click', () => toggle(swatch, el));

  set(value, false);
  return { get: () => current, set: (v) => set(v, false), el };
}
