/**
 * The shared `Dropdown`'s behaviour, which nothing covered before.
 *
 * The fix that made this component usable — closing when you pick an item —
 * shipped with the note that the suite had no component-rendering library and
 * adding one was a bigger decision than the fix. It turns out none is needed:
 * `react-dom/client` is already a dependency and `jest-environment-jsdom` is
 * already the environment, so `React.act` and a real container are enough. No
 * package was added for this.
 *
 * What is pinned here is exactly the behaviour a screen gives up when it drops
 * its hand-rolled menu: close on pick, close on click-outside, and close on
 * Escape *from anywhere inside* — the last of which the primitive did not
 * actually do until now.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Dropdown, DropdownItem } from '@/components/common/Dropdown';

global.IS_REACT_ACT_ENVIRONMENT = true;

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

const trigger = () => container.querySelector('button[aria-haspopup="menu"]');
const menu = () => container.querySelector('[role="menu"]');
// Both roles: a row that marks a current selection is a `menuitemradio`, and
// matching only `menuitem` would quietly stop seeing exactly the rows the
// selection tests are about.
const items = () => [...container.querySelectorAll('[role="menuitem"],[role="menuitemradio"]')];

const fire = (el, type, init) => act(() => { el.dispatchEvent(new init.Ctor(type, init)); });
const click = (el) => fire(el, 'click', { Ctor: MouseEvent, bubbles: true });
const mouseDown = (el) => fire(el, 'mousedown', { Ctor: MouseEvent, bubbles: true });
const key = (el, k) => fire(el, 'keydown', { Ctor: KeyboardEvent, key: k, bubbles: true });

const open = (children) => {
  render(<Dropdown trigger={<span>open</span>}>{children}</Dropdown>);
  click(trigger());
  expect(menu()).not.toBeNull();
};

describe('Dropdown', () => {
  it('opens on the trigger and reports it to assistive tech', () => {
    render(<Dropdown trigger={<span>open</span>}><DropdownItem>One</DropdownItem></Dropdown>);
    expect(menu()).toBeNull();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');

    click(trigger());
    expect(menu()).not.toBeNull();
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    // aria-controls only points at a menu that exists.
    expect(trigger().getAttribute('aria-controls')).toBe(menu().id);
  });

  it('runs the item and closes — the whole reason screens hand-rolled their own', () => {
    const onClick = jest.fn();
    open(<DropdownItem onClick={onClick}>Pick me</DropdownItem>);

    click(items()[0]);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(menu()).toBeNull();
  });

  it('runs the item BEFORE closing, so a handler reading live state still can', () => {
    const seen = [];
    open(<DropdownItem onClick={() => seen.push(document.querySelectorAll('[role="menu"]').length)}>Pick me</DropdownItem>);

    click(items()[0]);
    // The menu was still mounted while the handler ran.
    expect(seen).toEqual([1]);
  });

  it('keepOpen leaves it up, for the item you mean to hit repeatedly', () => {
    const onClick = jest.fn();
    open(<DropdownItem keepOpen onClick={onClick}>Toggle me</DropdownItem>);

    click(items()[0]);
    click(items()[0]);
    expect(onClick).toHaveBeenCalledTimes(2);
    expect(menu()).not.toBeNull();
  });

  it('closes on a mousedown outside, and ignores one inside', () => {
    open(<DropdownItem>One</DropdownItem>);

    mouseDown(menu());
    expect(menu()).not.toBeNull();

    mouseDown(document.body);
    expect(menu()).toBeNull();
  });

  /**
   * The regression this file exists for.
   *
   * The menu is a sibling of the trigger, not a child, so Escape bound to the
   * trigger never saw a keydown raised on an item: it closed the menu only
   * while focus was still on the trigger. Every hand-rolled panel it replaces
   * closed on Escape from anywhere.
   */
  it('closes on Escape pressed on an item, not just on the trigger', () => {
    open(<DropdownItem>One</DropdownItem>);

    const item = items()[0];
    item.focus();
    key(item, 'Escape');
    expect(menu()).toBeNull();
  });

  it('gives focus back to the trigger on Escape, instead of dropping it on <body>', () => {
    open(<DropdownItem>One</DropdownItem>);

    const item = items()[0];
    item.focus();
    expect(document.activeElement).toBe(item);

    key(item, 'Escape');
    // Without this the focused node unmounts with the menu and the reader is
    // stranded at the top of the document.
    expect(document.activeElement).toBe(trigger());
  });

  it('still closes on Escape from the trigger itself', () => {
    open(<DropdownItem>One</DropdownItem>);
    key(trigger(), 'Escape');
    expect(menu()).toBeNull();
  });

  it('reaches items nested inside groups and separators', () => {
    const onClick = jest.fn();
    open(
      <div>
        <div className="h-px" />
        <DropdownItem onClick={onClick}>Nested</DropdownItem>
      </div>,
    );

    click(items()[0]);
    expect(onClick).toHaveBeenCalledTimes(1);
    // A cloneElement-over-children implementation would not have reached this
    // one, which is why closing goes through context.
    expect(menu()).toBeNull();
  });
});

/**
 * The current-selection marker.
 *
 * Four pickers moved to this component — Ticket's status, priority and team,
 * and the queue's sort order — and every one of them had tinted its current row
 * before the move (`data-on={String(o.on)}` against `--cs-onbg/onfg/onw`). The
 * conversion dropped the tint but kept the data: `statusOptions`, `prioOptions`,
 * `teamList` and `sortOptions` still compute `.on` on every render, and nothing
 * read it, so all four opened with no indication of where you already were.
 */
describe('DropdownItem selected state', () => {
  it('marks the current row for sighted and screen-reader users alike', () => {
    open(
      <>
        <DropdownItem selected={false}>Open</DropdownItem>
        <DropdownItem selected>Pending</DropdownItem>
      </>,
    );

    const [open_, pending] = items();
    // `data-on` was invisible to assistive tech; a radio role is not.
    expect(pending.getAttribute('role')).toBe('menuitemradio');
    expect(pending.getAttribute('aria-checked')).toBe('true');
    expect(open_.getAttribute('aria-checked')).toBe('false');

    // And the tint itself — the thing a sighted reader actually navigates by.
    expect(pending.className).toContain('var(--primary-soft)');
    expect(open_.className).not.toContain('var(--primary-soft)');
  });

  it('leaves an action row a plain menuitem', () => {
    open(<DropdownItem onClick={() => {}}>Copy link</DropdownItem>);

    // Omitting `selected` is the claim that this row is an action, not one
    // option among alternatives. A menu of actions with radio roles would
    // announce a choice that does not exist.
    expect(items()[0].getAttribute('role')).toBe('menuitem');
    expect(items()[0].hasAttribute('aria-checked')).toBe(false);
  });

  it('still runs and still closes when it is the selected row', () => {
    const onClick = jest.fn();
    open(<DropdownItem selected onClick={onClick}>Pending</DropdownItem>);

    click(items()[0]);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(menu()).toBeNull();
  });

  it('keeps the selected colour off the danger variant it would otherwise fight', () => {
    open(<DropdownItem variant="danger">Delete conversation</DropdownItem>);
    // Danger is an action; it must keep reading as danger.
    expect(items()[0].className).toContain('var(--danger)');
    expect(items()[0].className).not.toContain('var(--primary)');
  });
});
