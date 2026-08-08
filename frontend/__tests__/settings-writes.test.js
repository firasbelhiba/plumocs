/**
 * The settings screen used to be 18 buttons that toasted a made-up outcome and
 * sent nothing. The worst of them showed a confirmation dialog and said
 * "X deactivated" while the person kept their session and every permission.
 *
 * These tests pin the two properties that failure had in common, for every
 * control that survived the audit:
 *   1. a success line is printed only after the request succeeded, and
 *   2. a failure prints what the server actually said, and changes nothing.
 *
 * The handlers are exercised on the Console instance directly — they are plain
 * methods over state, and driving them here catches a lie without needing a
 * browser.
 */
import fs from 'fs';
import path from 'path';
import Console from '@/components/Console';
import * as api from '@/lib/api/endpoints';

jest.mock('@/lib/api/endpoints');

const ME = 'u-me';
const THEM = 'u-them';

const err = (status, message) => Object.assign(new Error(message), { status, message });

function fakeAdapter() {
  return {
    currentUser: { id: ME, name: 'Ada Admin', role: 'admin', teamId: 't-1' },
    agents: [
      { id: ME, name: 'Ada Admin', role: 'admin', team: 't-1', email: 'ada@x.com', avail: 'available', av: 1, lastActive: 3 },
      { id: THEM, name: 'Rui Santos', role: 'agent', team: 't-1', email: 'rui@x.com', avail: 'away', av: 2, lastActive: 40 },
    ],
    teams: [{ id: 't-1', name: 'support' }],
    tags: [], cannedResponses: [], customers: [], slaPolicies: [], businessHours: [],
    webhooks: [], apiKeys: [], invitations: [], notifications: [], drilldowns: {},
    reports: { kpis: [], volume: [], byChannel: [], byAgent: [] },
    meta: { orgName: (x) => x },
  };
}

/**
 * A Console with synchronous state, a toast log instead of a timer, and a
 * scripted answer to the confirm dialog.
 *
 * `this.confirm` is the seam onto `DialogProvider`: in the app it is a promise
 * handed down as a prop from `app/page.jsx`, so here it records what was asked
 * and resolves whatever `answerConfirm` last queued. That the question is asked
 * at all, and that a "no" changes nothing, is the property these tests pin.
 */
function mount(patch = {}) {
  const c = new Console({});
  c.setState = (next, cb) => {
    const delta = typeof next === 'function' ? next(c.state) : next;
    if (delta) c.state = { ...c.state, ...delta };
    if (cb) cb();
  };
  c.forceUpdate = () => {};
  c.toasts = [];
  c.toast = (text, tone) => c.toasts.push({ text, tone: tone || 'ok' });
  c.confirms = [];
  c.answerConfirm = (yes) => { c.confirmAnswer = yes; };
  c.confirmAnswer = true;
  c.confirm = (options) => { c.confirms.push(options); return Promise.resolve(c.confirmAnswer); };
  c.api = fakeAdapter();
  c.state = { ...c.state, role: 'admin', ...patch };
  return c;
}

const ev = (dataset) => ({ currentTarget: { dataset } });

beforeEach(() => jest.clearAllMocks());

describe('deactivating somebody', () => {
  it('asks first, then actually calls the endpoint', async () => {
    const c = mount();
    api.users.deactivate.mockResolvedValue({ id: THEM, isMember: false });

    c.answerConfirm(false);
    await c.askDeactivate(ev({ id: THEM, name: 'Rui Santos' }));
    expect(c.confirms[0]).toMatchObject({ title: 'Deactivate Rui Santos?', danger: true });
    expect(api.users.deactivate).not.toHaveBeenCalled(); // declining changes nothing

    c.answerConfirm(true);
    await c.askDeactivate(ev({ id: THEM, name: 'Rui Santos' }));

    expect(api.users.deactivate).toHaveBeenCalledWith(THEM);
    expect(c.api.agents.map((a) => a.id)).toEqual([ME]);
    expect(c.toasts).toEqual([{ text: 'Rui Santos deactivated successfully', tone: 'ok' }]);
  });

  // the exact regression: the old handler toasted this without any request
  it('never claims success when the request fails, and leaves them in place', async () => {
    const c = mount();
    api.users.deactivate.mockRejectedValue(err(403, 'Insufficient role'));

    await c.askDeactivate(ev({ id: THEM, name: 'Rui Santos' }));

    expect(c.toasts).toEqual([{ text: 'That action requires an admin', tone: 'bad' }]);
    expect(c.api.agents.map((a) => a.id)).toContain(THEM);
  });

  it('says the server was unreachable rather than that nothing was needed', async () => {
    const c = mount();
    api.users.deactivate.mockRejectedValue(err(0, "can't reach the server"));

    await c.askDeactivate(ev({ id: THEM, name: 'Rui Santos' }));

    expect(c.toasts[0].tone).toBe('bad');
    expect(c.toasts[0].text).toMatch(/nothing was saved/i);
  });

  it('offers the control to admins only, and never on your own row', () => {
    const admin = mount().renderVals().teamRows;
    expect(admin.find((r) => r.id === THEM).canDeactivate).toBe(true);
    // the backend has no self-guard: deactivating yourself revokes your tokens
    expect(admin.find((r) => r.id === ME).canDeactivate).toBe(false);

    const lead = mount({ role: 'lead' }).renderVals().teamRows;
    expect(lead.every((r) => r.canDeactivate === false)).toBe(true);
    expect(lead.every((r) => r.canEdit === false)).toBe(true);
  });
});

describe('editing a member', () => {
  it('sends only what changed, and null to clear the team', async () => {
    const c = mount();
    api.users.patch.mockResolvedValue({ id: THEM, role: 'lead', teamId: null });

    c.editUser(ev({ id: THEM }));
    c.onEditorField({ currentTarget: { dataset: { f: 'role' }, type: 'select-one', value: 'lead' } });
    c.onEditorField({ currentTarget: { dataset: { f: 'teamId' }, type: 'select-one', value: '' } });
    await c.submitEditor();

    expect(api.users.patch).toHaveBeenCalledWith(THEM, { role: 'lead', teamId: null });
    expect(c.api.agents.find((a) => a.id === THEM)).toMatchObject({ role: 'lead', team: null });
    expect(c.state.editor).toBeNull();
  });
});

describe('the record editor', () => {
  it('stays open with what you typed, and shows the server’s own words', async () => {
    const c = mount();
    api.tags.create.mockRejectedValue(err(409, 'Tag key already exists'));

    c.newTag();
    c.onEditorField({ currentTarget: { dataset: { f: 'key' }, type: 'text', value: 'billing' } });
    c.onEditorField({ currentTarget: { dataset: { f: 'label' }, type: 'text', value: 'billing' } });
    await c.submitEditor();

    expect(c.state.editor).not.toBeNull();
    expect(c.state.editor.values.label).toBe('billing');
    expect(c.state.editorError).toBe('Tag key already exists');
    expect(c.toasts).toEqual([]); // no cheerful line over a failed write
  });

  it('refuses a target it cannot turn into minutes, before the round trip', async () => {
    const c = mount();

    c.newSlaPolicy();
    c.onEditorField({ currentTarget: { dataset: { f: 'name' }, type: 'text', value: 'weekend cover' } });
    c.onEditorField({ currentTarget: { dataset: { f: 'first' }, type: 'text', value: 'soonish' } });
    await c.submitEditor();

    expect(api.slaPolicies.create).not.toHaveBeenCalled();
    expect(c.state.editorError).toMatch(/30m, 4h or 2d/);
  });

  it('sends minutes, and re-reads the list only after the write lands', async () => {
    const c = mount({ settings: { sla: [{ id: 'p1', name: 'urgent', firstResponseMins: 30, resolutionMins: 240 }] } });
    api.slaPolicies.patch.mockResolvedValue({});
    api.slaPolicies.list.mockResolvedValue([]);

    c.editSlaPolicy(ev({ id: 'p1' }));
    expect(c.state.editor.values).toEqual({ name: 'urgent', first: '30m', resolution: '4h' });

    c.onEditorField({ currentTarget: { dataset: { f: 'resolution' }, type: 'text', value: '2d' } });
    await c.submitEditor();

    expect(api.slaPolicies.patch).toHaveBeenCalledWith('p1', {
      name: 'urgent', firstResponseMins: 30, resolutionMins: 2880,
    });
    expect(api.slaPolicies.list).toHaveBeenCalled();
    expect(c.toasts).toEqual([{ text: 'Policy updated successfully', tone: 'ok' }]);
  });

  // the table row is keyed by the tag's slug; PATCH /tags/:id wants the uuid
  it('edits a tag by its uuid rather than the key the table shows', async () => {
    const c = mount({ settings: { tags: [{ id: 'de305d54-75b4-431b-adb2-eb6b9e546014', key: 'billing', label: 'billing' }] } });
    api.tags.patch.mockResolvedValue({});
    api.tags.list.mockResolvedValue([]);

    c.editTag(ev({ key: 'billing' }));
    await c.submitEditor();

    expect(api.tags.patch).toHaveBeenCalledWith('de305d54-75b4-431b-adb2-eb6b9e546014', expect.anything());
  });

  it('says the rows are missing instead of sending a request that cannot work', () => {
    const c = mount({ settingsErr: { sla: 'couldn’t load these just now' } });

    c.editSlaPolicy(ev({ id: 'p1' }));

    expect(c.state.editor).toBeNull();
    expect(c.toasts).toEqual([{ text: 'couldn’t load these just now', tone: 'bad' }]);
  });
});

describe('business hours', () => {
  const row = { id: 'bh1', weeklyJson: { mon: [['09:00', '18:00']], tue: [['09:00', '18:00']] }, holidaysJson: [] };

  it('rewrites the whole week to switch one day off', async () => {
    const c = mount({ settings: { hours: [row] } });
    api.businessHours.patch.mockResolvedValue({ ...row, weeklyJson: { ...row.weeklyJson, tue: [] } });

    await c.toggleHoursDay({ currentTarget: { dataset: { day: 'tue' }, checked: false } });

    expect(api.businessHours.patch).toHaveBeenCalledWith('bh1', {
      weeklyJson: { mon: [['09:00', '18:00']], tue: [] },
    });
    expect(c.state.settings.hours[0].weeklyJson.tue).toEqual([]);
  });

  it('reuses the week’s own window instead of inventing 9–5', async () => {
    const eight = { ...row, weeklyJson: { mon: [['08:00', '16:00']], sat: [] } };
    const c = mount({ settings: { hours: [eight] } });
    api.businessHours.patch.mockResolvedValue(eight);

    await c.toggleHoursDay({ currentTarget: { dataset: { day: 'sat' }, checked: true } });

    expect(api.businessHours.patch.mock.calls[0][1].weeklyJson.sat).toEqual([['08:00', '16:00']]);
  });

  it('leaves the schedule untouched when the write fails, and says why', async () => {
    const c = mount({ settings: { hours: [row] } });
    api.businessHours.patch.mockRejectedValue(err(403, 'Insufficient role'));

    await c.toggleHoursDay({ currentTarget: { dataset: { day: 'tue' }, checked: false } });

    expect(c.state.settings.hours[0].weeklyJson.tue).toEqual([['09:00', '18:00']]);
    expect(c.toasts[0].tone).toBe('bad');
  });

  it('keeps the date in the field when adding a holiday fails', async () => {
    const c = mount({ settings: { hours: [row] }, holidayDraft: '2026-12-25' });
    api.businessHours.patch.mockRejectedValue(err(500, 'boom'));

    await c.addHoliday();

    expect(c.state.holidayDraft).toBe('2026-12-25');
    expect(c.toasts[0].tone).toBe('bad');
  });
});

describe('the desk’s receiving address', () => {
  it('sends an explicit null to switch inbound mail off', async () => {
    const c = mount({ inboundDraft: '  ' });
    api.email.setInboundAddress.mockResolvedValue({ inboundEmail: null });

    await c.saveInbound();

    expect(api.email.setInboundAddress).toHaveBeenCalledWith(null);
    expect(c.toasts[0].text).toMatch(/switched off/);
  });

  it('names the address the server confirmed, not the one that was typed', async () => {
    const c = mount({ inboundDraft: 'Help@Example.com' });
    api.email.setInboundAddress.mockResolvedValue({ inboundEmail: 'help@example.com' });

    await c.saveInbound();

    expect(c.toasts[0].text).toContain('help@example.com');
    expect(c.state.inboundDraft).toBe('help@example.com');
  });

  it('surfaces a conflict in the panel instead of toasting success', async () => {
    const c = mount({ inboundDraft: 'help@example.com' });
    api.email.setInboundAddress.mockRejectedValue(err(409, 'Another workspace already receives mail at that address'));

    await c.saveInbound();

    expect(c.state.inboundError).toBe('Another workspace already receives mail at that address');
    expect(c.toasts).toEqual([]);
  });
});

describe('the panels themselves', () => {
  it('records why a panel could not load rather than showing a stale copy as current', async () => {
    const c = mount();
    api.tags.list.mockRejectedValue(err(500, 'boom'));

    await c.loadSettingsTab('tags');

    expect(c.state.settingsErr.tags).toBe('boom');
    expect(c.state.settings.tags).toBeUndefined();
  });

  it('does not ask for admin-only rows as a lead', async () => {
    const c = mount({ role: 'lead' });
    await c.loadSettingsTab('hooks');
    expect(api.webhooks.list).not.toHaveBeenCalled();
  });

  // the whole point of the audit: no control on this screen may announce an
  // outcome it did not cause
  it('leaves no mock handlers behind on the settings screen', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'components', 'screens', 'Settings.jsx'),
      'utf8',
    );
    expect(src).not.toMatch(/V\.mock/);
    expect(src).not.toMatch(/V\.askMock/);
  });
});
