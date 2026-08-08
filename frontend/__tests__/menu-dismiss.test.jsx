/**
 * Click-outside for the panels that are NOT on the shared `Dropdown`.
 *
 * Three menus cannot move to the primitive — the assignee and canned-response
 * pickers each carry a search field, and the notification panel has a header
 * row over rows that cannot be picked at all. `Dropdown` dismisses itself on an
 * outside mousedown; those three never did. `Console.closeMenu` existed from
 * the first commit and nothing called it, so the only ways out were Escape or
 * hitting the trigger a second time.
 *
 * This drives the real handler against the real `Header` markup, because the
 * part that can silently rot is not the handler — it is whether the wrapper
 * carrying `data-menu-root` still contains BOTH the trigger and its panel. If
 * someone moves the attribute onto the panel alone, the outside-mousedown test
 * keeps passing and the menu quietly starts ignoring every second click on its
 * own trigger; the containment assertions below are what catch that.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import Console from '@/components/Console';
import Header from '@/components/screens/Header';

global.IS_REACT_ACT_ENVIRONMENT = true;

const noop = () => {};

const headerV = (over = {}) => ({
  openMobileNav: noop,
  toggleMobileSearch: noop,
  mobileSearchOpen: false,
  openNewTicket: noop,
  toggleTheme: noop,
  searchRef: React.createRef(),
  q: '',
  onQ: noop,
  onQFocus: noop,
  searchOpen: false,
  searching: false,
  searchFailed: false,
  searchEmpty: true,
  resTickets: [],
  resCustomers: [],
  resNoTickets: false,
  hasUnreadNotif: true,
  notifOpen: false,
  toggleNotif: noop,
  readAllNotif: noop,
  notifs: [{ id: 'n1', tone: 'st-open', glyph: '!', text: 'A reply landed', rel: '2m', unread: true }],
  ...over,
});

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

const mouseDown = (el) =>
  act(() => { el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });

/** The real console instance, with `setState` reduced to a plain object. */
const consoleHandler = (menu) => {
  const instance = new Console({});
  const state = { ...instance.state, menu };
  instance.state = state;
  instance.setState = (patch) => Object.assign(state, typeof patch === 'function' ? patch(state) : patch);
  return { instance, state };
};

describe('the notification panel', () => {
  it('keeps its trigger and its panel inside one data-menu-root', () => {
    render(<Header V={headerV({ notifOpen: true })} />);

    const root_ = container.querySelector('[data-menu-root]');
    expect(root_).not.toBeNull();

    const bell = root_.querySelector('button[aria-label="Notifications"]');
    expect(bell).not.toBeNull();
    // The panel, identified by the action only it carries.
    const panel = [...root_.querySelectorAll('button')].find((b) => b.textContent.includes('Mark all as read'));
    expect(panel).not.toBeNull();
  });

  it('is not wrapped when it is closed, but its trigger still is', () => {
    render(<Header V={headerV({ notifOpen: false })} />);
    const root_ = container.querySelector('[data-menu-root]');
    expect(root_.querySelector('button[aria-label="Notifications"]')).not.toBeNull();
  });
});

describe('Console.onDocMouseDown', () => {
  it('closes an open panel when the press lands outside it', () => {
    const { instance, state } = consoleHandler('notif');
    document.addEventListener('mousedown', instance.onDocMouseDown);
    render(<Header V={headerV({ notifOpen: true })} />);

    mouseDown(document.body);
    expect(state.menu).toBeNull();

    document.removeEventListener('mousedown', instance.onDocMouseDown);
  });

  it('leaves it open when the press lands on the trigger, so the trigger can toggle it', () => {
    const { instance, state } = consoleHandler('notif');
    document.addEventListener('mousedown', instance.onDocMouseDown);
    render(<Header V={headerV({ notifOpen: true })} />);

    // Were this not excluded, mousedown would close and the trigger's own click
    // would reopen — a bell that appears to ignore you.
    mouseDown(container.querySelector('button[aria-label="Notifications"]'));
    expect(state.menu).toBe('notif');

    document.removeEventListener('mousedown', instance.onDocMouseDown);
  });

  it('leaves it open when the press lands inside the panel', () => {
    const { instance, state } = consoleHandler('notif');
    document.addEventListener('mousedown', instance.onDocMouseDown);
    render(<Header V={headerV({ notifOpen: true })} />);

    const markAll = [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Mark all as read'));
    mouseDown(markAll);
    expect(state.menu).toBe('notif');

    document.removeEventListener('mousedown', instance.onDocMouseDown);
  });

  it('does nothing at all when no panel is open', () => {
    const { instance, state } = consoleHandler(null);
    const setState = jest.fn();
    instance.setState = setState;

    document.addEventListener('mousedown', instance.onDocMouseDown);
    render(<Header V={headerV()} />);

    mouseDown(document.body);
    expect(setState).not.toHaveBeenCalled();
    expect(state.menu).toBeNull();

    document.removeEventListener('mousedown', instance.onDocMouseDown);
  });
});
