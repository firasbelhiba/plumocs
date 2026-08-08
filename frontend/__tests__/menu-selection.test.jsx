/**
 * The current-selection marker, at the call sites rather than in the primitive.
 *
 * `dropdown.test.jsx` pins what `selected` does. This pins that the screens
 * actually pass it — which is the half that broke. When these pickers moved to
 * the shared `Dropdown` the tint went missing but the data did not: the console
 * still computes `.on` for every option on every render (`sortOptions`,
 * `statusOptions`, `prioOptions`, `teamList`), and the new call sites simply
 * never read it. A primitive-only test would have stayed green through all of
 * that, because the primitive was never the thing at fault.
 *
 * So this renders the real `Queue` against a stub `V` and asks the rendered
 * markup which row is current. Delete `selected={o.on}` from the call site and
 * this goes red; the tests in `dropdown.test.jsx` do not.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import Queue from '@/components/screens/Queue';

global.IS_REACT_ACT_ENVIRONMENT = true;

const noop = () => {};

/**
 * `Queue` reads about seventy fields off `V` and this test cares about four of
 * them. Rather than transcribe the other sixty-six and let them rot, unknown
 * keys resolve by shape: anything the screen calls gets a function, anything it
 * maps over gets an empty list.
 */
const stubV = (over = {}) =>
  new Proxy(over, {
    get(target, key) {
      if (key in target) return target[key];
      if (typeof key !== 'string') return undefined;
      // Handlers, by the naming the screen already uses.
      if (/^(on|set|toggle|open|close|clear|bulk|quick|next|prev|cycle|save|refresh|remove|stop)/.test(key)) return noop;
      return [];
    },
    has: () => true,
  });

const SORTS = [
  { id: 'updated', label: 'Last updated' },
  { id: 'created', label: 'Created' },
  { id: 'priority', label: 'Priority' },
  { id: 'sla', label: 'SLA due' },
];

let container;
let root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const render = (ui) => act(() => root.render(ui));
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

/** Mirrors `renderVals`: the console tags the live sort and always has. */
const sortOptions = (current) => SORTS.map((o) => ({ ...o, on: o.id === current }));

const openSort = (current) => {
  render(<Queue V={stubV({ sortOptions: sortOptions(current), sortLabel: SORTS.find((s) => s.id === current).label })} />);
  const trigger = container.querySelector('button[aria-label="Sort order"]');
  expect(trigger).not.toBeNull();
  click(trigger);
};

const options = () => [...container.querySelectorAll('[role="menuitem"],[role="menuitemradio"]')];
const checked = () => options().filter((o) => o.getAttribute('aria-checked') === 'true').map((o) => o.textContent.trim());

describe("the queue's sort menu", () => {
  it('marks the sort that is actually in force', () => {
    openSort('priority');

    expect(options()).toHaveLength(4);
    expect(checked()).toEqual(['Priority']);
  });

  it('marks a different row when a different sort is in force', () => {
    // The mark has to follow the data. A call site that hardcoded the first row
    // as current would pass the test above and fail this one.
    openSort('sla');
    expect(checked()).toEqual(['SLA due']);
  });

  it('marks exactly one row, and offers the rest as alternatives', () => {
    openSort('updated');

    expect(checked()).toHaveLength(1);
    // All four are alternatives to each other, so all four carry the radio
    // role — a menu where only the current row is a `menuitemradio` reads to a
    // screen reader as one checked thing beside three unrelated commands.
    expect(options().every((o) => o.getAttribute('role') === 'menuitemradio')).toBe(true);
    expect(options().filter((o) => o.getAttribute('aria-checked') === 'false')).toHaveLength(3);
  });

  it('tints the current row, not just its aria', () => {
    openSort('created');

    const current = options().find((o) => o.getAttribute('aria-checked') === 'true');
    // `--primary-soft` is CS's own green; the picker read as four identical
    // rows without it, whatever the aria said.
    expect(current.className).toContain('var(--primary-soft)');
  });
});
