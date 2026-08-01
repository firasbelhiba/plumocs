'use client';

/* sx — turns the design's inline CSS strings into injected atomic classes,
 * with optional :hover / :focus / :active variants. This keeps the JSX
 * byte-for-byte faithful to the source template's style attributes. */

const cache = new Map();
let styleEl = null;

function ensureSheet() {
  if (styleEl) return styleEl;
  styleEl = document.createElement('style');
  styleEl.setAttribute('data-sx', '');
  document.head.appendChild(styleEl);
  return styleEl;
}

function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export function sx(base, states) {
  const key = base + '|' + (states ? JSON.stringify(states) : '');
  const hit = cache.get(key);
  if (hit) return hit;
  const cls = 'sx-' + hash(key);
  let rule = base ? `.${cls}{${base}}` : '';
  if (states) {
    if (states.hover) rule += `.${cls}:hover{${states.hover}}`;
    if (states.focus) rule += `.${cls}:focus{${states.focus}}`;
    if (states.active) rule += `.${cls}:active{${states.active}}`;
  }
  if (typeof document !== 'undefined') ensureSheet().appendChild(document.createTextNode(rule));
  cache.set(key, cls);
  return cls;
}
