'use client';

import React from 'react';
import hotToast from 'react-hot-toast';
import { adapter } from '@/lib/api/adapter';
import { ThemeContext } from '@/contexts/ThemeContext';
import * as api from '@/lib/api/endpoints';
import Login from './screens/Login';
import Header from './screens/Header';
import Sidebar from './screens/Sidebar';
import Queue from './screens/Queue';
import Ticket from './screens/Ticket';
import { Customers, CustomerProfile } from './screens/Customers';
import Reports from './screens/Reports';
import Account from './screens/Account';
import Settings from './screens/Settings';
import { NotFound, Oops } from './screens/EdgeScreens';
import Overlays from './screens/Overlays';
import { LogoLoader } from './common';

/**
 * "30m" / "4h" / "2d" → minutes, and back. SLA targets are stored as a minute
 * count but nobody writes 360 when they mean six hours. null means "that isn't
 * a duration", which lets the form say so before the round trip rather than
 * after a 400.
 */
const MINS = (s) => {
  const m = /^(\d+)\s*(m|min|mins|h|hr|hrs|d)?$/i.exec(String(s ?? '').trim());
  if (!m) return null;
  const n = Number(m[1]);
  if (!n) return null;
  const u = (m[2] || 'm').toLowerCase();
  return u.startsWith('h') ? n * 60 : u === 'd' ? n * 1440 : n;
};
const MINS_TEXT = (n) =>
  n == null ? '' : n % 1440 === 0 ? n / 1440 + 'd' : n % 60 === 0 ? n / 60 + 'h' : n + 'm';

/** Mirrors the adapter's own formatting so the table reads the same either way. */
const FMT_MINS = (mins) => {
  if (mins == null) return '—';
  if (mins < 60) return `${Math.round(mins)}m`;
  if (mins < 48 * 60) {
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return m ? `${h}h ${String(m).padStart(2, '0')}m` : `${h}h`;
  }
  return `${Math.round(mins / 1440)}d`;
};

/**
 * Display labels for the webhook status chip. The chip's *value* stays the
 * lowercase slug — the tone lookup below compares against it — so only the
 * rendered string is capitalised, the same split the ticket STATUS/PRIO maps use.
 */
const HOOK_STATUS_LABEL = { active: 'Active', failing: 'Failing', disabled: 'Disabled' };

/** The only event names the webhooks API accepts — anything else is a 400. */
const WEBHOOK_EVENTS = [
  { value: 'ticket.created', label: 'A conversation is opened' },
  { value: 'ticket.updated', label: 'A conversation changes' },
  { value: 'ticket.assigned', label: 'A conversation is assigned' },
  { value: 'ticket.resolved', label: 'A conversation is resolved' },
  { value: 'message.added', label: 'A message is added' },
  { value: 'sla.breached', label: 'An SLA target is missed' },
];

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' }, { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' }, { value: 'urgent', label: 'Urgent' },
];

/** Sunday-first keys, matching the schedule json the backend walks. */
const DAY_KEYS = [
  ['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'],
  ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday'],
];

export default class Console extends React.Component {
  /**
   * Theme and density live in the shared ThemeProvider, not in this component's
   * state: they persist to localStorage, follow the OS colour-scheme preference
   * on first run, and are stamped onto <html> before hydration.
   *
   * Every access is null-guarded because the tests construct `new Console({})`
   * directly rather than rendering it, so `this.context` is undefined there.
   * In the app it is always present — `app/layout.jsx` wraps the tree.
   */
  static contextType = ThemeContext;
  theme() { return this.context ? this.context.theme : 'light'; }
  density() { return this.context ? this.context.density : 'comfortable'; }

  STATUS = {
    new: { l: 'New', t: 'st-new' }, open: { l: 'Open', t: 'st-open' },
    pending: { l: 'Pending', t: 'st-pending' }, 'on-hold': { l: 'On hold', t: 'st-hold' },
    resolved: { l: 'Resolved', t: 'st-resolved' }, closed: { l: 'Closed', t: 'st-closed' },
  };
  PRIO = {
    low: { l: 'Low', t: 'pr-low', g: '·' }, normal: { l: 'Normal', t: 'pr-normal', g: '·' },
    high: { l: 'High', t: 'pr-high', g: '↑' }, urgent: { l: 'Urgent', t: 'pr-urgent', g: '⚑' },
  };
  CHAN = { email: '✉', api: '⌗', widget: '◲', hashcare: '✚' };
  CHAN_LABEL = { chatbot: 'Chatbot', email: 'Email', api: 'API', widget: 'Widget', hashcare: 'HashCare' };
  TAGTONE = { billing: 'tag-billing', bug: 'tag-bug', 'how-to': 'tag-howto', account: 'tag-account', urgent: 'tag-urgent', integration: 'tag-integration' };
  SORTS = [{ id: 'updated', label: 'Last updated' }, { id: 'created', label: 'Created' }, { id: 'priority', label: 'Priority' }, { id: 'sla', label: 'SLA due' }];
  DENSITIES = ['compact', 'comfortable', 'relaxed'];
  ARC = { 'sla-ok': ['72 100', '#B8CFB4'], 'sla-due': ['30 100', '#FFE8A3'], 'sla-breach': ['8 100', '#FFD4B8'], 'sla-met': ['100 100', '#B8CFB4'], 'sla-paused': ['45 100', '#E2E8F0'], neutral: ['0 100', '#E2E8F0'] };

  state = {
    booted: false, loggedIn: true, screen: 'queue',
    role: 'agent', avail: 'available',
    nav: true, filters: true, rail: true,
    // Below `md` the rail is not collapsed, it is replaced by an overlay drawer
    // (PM `DashboardLayout.tsx:21,112-124`), and the header search folds to an
    // icon (`Header.tsx:222`). Both are mobile-only states, separate from the
    // desktop `nav` collapse, which stays a pure user choice at every width.
    mobileNav: false, mobileSearch: false,
    // Below `lg` the ticket's two panes become one at a time; `railOn` still
    // owns the desktop toggle. PM hides its detail rail outright below `xl`
    // (`issues/[id]/page.tsx:951`) — the plan asks CS for tabs instead, because
    // CS's rail is the only home the SLA targets and customer card have.
    ticketPane: 'conversation',
    view: 'all-open', sort: 'updated', page: 0,
    f: { status: [], priority: [], channel: [], tag: null, team: null, assignee: null, range: 'any' },
    rows: [], total: 0, pageSize: 25, counts: {}, facets: { status: {}, priority: {}, channel: {}, tag: {} },
    load: 'loading', sel: [], hover: null, cursor: 0,
    ticket: null, ticketLoad: 'idle', remote: false,
    mode: 'reply', draft: '', sending: false, subjEdit: false, subjDraft: '',
    customers: [], customer: null, custQ: '',
    settingsTab: 'overview', menu: null, menuQ: '',
    q: '', results: null,
    sheet: false, newT: false,
    newSubject: '', newCustomer: '', newPriority: 'normal', newBody: '', newError: null,
    notifs: [], secret: null,
    loginEmail: '', loginPw: '', loginError: false, pwShown: false, loginView: 'signin', drill: null,
    now: Date.now(), refreshed: Date.now(), failMode: false,
    pwCur: '', pwNew: '', pwConfirm: '', reportsAt: 0,
    keepSignedIn: true, serviceUp: true,
    keyName: '', keyKind: 'chatbot',
    invites: [], invitesLoad: 'idle',
    inviteOpen: false, inviteEmail: '', inviteRole: 'agent', inviteTeam: '', inviteBusy: false, inviteError: '',
    // settings panels own their rows once opened — see loadSettingsTab
    settings: {}, settingsErr: {},
    editor: null, editorBusy: false, editorError: '',
    hoursBusy: false, holidayDraft: '',
    inboundDraft: '', inboundBusy: false, inboundError: '',
  };

  forgot = (e) => { e.preventDefault(); this.setState({ loginView: 'reset', loginError: false }); };
  sendReset = () => {
    // never leaks whether the address exists — the API answers 200 either way
    this.api.forgotPassword(this.state.loginEmail.trim()).catch(() => {});
    this.setState({ loginView: 'sent' });
  };
  backToSignin = () => this.setState({ loginView: 'signin' });
  toggleKeepSignedIn = (e) => this.setState({ keepSignedIn: e.target.checked });
  onLoginKey = (e) => { if (e.key === 'Enter') this.signIn(); };
  /** Neither provider is configured on this instance — say so plainly. */
  federated = (e) => {
    const provider = e.currentTarget.dataset.provider === 'google' ? 'google' : 'sso';
    this.toast(`${provider} sign-in is not set up on this instance. Please use your email and password.`, 'bad');
  };
  requestAccess = () => this.toast('Ask an admin to invite you from Settings › Team & users.');
  saveName = (e) => {
    const v = (e.target.value || '').trim();
    if (!v || v === this.me().name) return;
    this.api.updateName(v)
      .then(() => { this.toast('Profile updated successfully!'); this.setState({}); })
      .catch(() => this.toast('Failed to save changes. Please try again.', 'bad'));
  };
  onPwCur = (e) => this.setState({ pwCur: e.target.value });
  onPwNew = (e) => this.setState({ pwNew: e.target.value });
  onPwConfirm = (e) => this.setState({ pwConfirm: e.target.value });
  savePassword = () => {
    const { pwCur, pwNew, pwConfirm } = this.state;
    if (!pwNew || pwNew.length < 8) { this.toast('Password must be at least 8 characters', 'bad'); return; }
    if (pwNew !== pwConfirm) { this.toast('New passwords do not match', 'bad'); return; }
    this.api.changePassword(pwCur, pwNew)
      .then(() => { this.setState({ pwCur: '', pwNew: '', pwConfirm: '' }); this.toast('Password changed successfully!'); })
      .catch((e) => this.toast(e?.status === 401 ? 'The current password is not correct' : 'Failed to change password. Please try again.', 'bad'));
  };
  // Ask the server where to send the browser, then navigate. A 302 from fetch()
  // is followed opaquely instead of navigating the page, which is why the
  // endpoint returns a URL rather than redirecting.
  // Sign in WITH plumo, from the login screen. Separate from connectPm: that
  // links an identity to the account you are already in; this resolves which
  // account you are.
  signInWithPm = async () => {
    this.setState({ pmSignInBusy: true, pmSignInError: '' });
    try {
      const { authorizationUrl } = await api.pm.signinUrl();
      window.location.assign(authorizationUrl);
    } catch (e) {
      this.setState({ pmSignInBusy: false, pmSignInError: e?.message || 'Could not reach plumo' });
    }
  };

  // The callback returns tokens in the URL FRAGMENT, which never reaches a
  // server, so they stay out of access logs and Referer headers. Consume and
  // strip immediately.
  readPmSignIn = () => {
    if (!window.location.hash) return false;
    const h = new URLSearchParams(window.location.hash.slice(1));
    if (h.get('pmSignIn') !== 'ok') return false;
    const accessToken = h.get('accessToken');
    const refreshToken = h.get('refreshToken');
    window.history.replaceState({}, '', window.location.pathname + window.location.search);
    if (!accessToken || !refreshToken) return false;
    // Adopt, then run the same bootstrap the password path runs — the session
    // is identical once the tokens are stored, so nothing here should be a
    // second, subtly different login.
    adapter
      .adoptPmSession({ accessToken, refreshToken })
      .then(async () => {
        const me = await adapter.bootstrap();
        this.setState(
          { booted: true, loggedIn: true, loginError: false, role: me.role, avail: me.availability ?? 'available', notifs: adapter.notifications, screen: 'queue' },
          () => { this.loadQueue({ noFail: true }); this.loadCounts(); },
        );
      })
      .catch((e) => this.setState({ booted: true, loggedIn: false, pmSignInError: e?.message || 'Plumo sign-in failed' }));
    return true;
  };

  connectPm = async () => {
    this.setState({ pmBusy: true, pmNotice: '' });
    try {
      const { authorizationUrl } = await api.pm.start(window.location.pathname);
      window.location.assign(authorizationUrl);
    } catch (e) {
      this.setState({ pmBusy: false, pmNotice: e?.message || 'Could not reach plumo' });
    }
  };

  disconnectPm = async () => {
    this.setState({ pmBusy: true, pmNotice: '' });
    try {
      await api.pm.unlink();
      this.setState({ pm: { ...(this.state.pm || {}), linked: false }, pmBusy: false, pmNotice: 'Disconnected from plumo' });
    } catch (e) {
      this.setState({ pmBusy: false, pmNotice: e?.message || 'Could not disconnect' });
    }
  };

  // The callback redirects back with ?pmLink=…; surface the outcome once and
  // strip it, so a refresh does not replay a stale banner.
  readPmCallback = () => {
    const q = new URLSearchParams(window.location.search);

    // A failed SIGN-IN comes back to the login screen, not to settings — the
    // caller has no session, so there is nothing behind /settings for them.
    // Surface the reason there instead of dropping it.
    const signIn = q.get('pmSignIn');
    if (signIn && signIn !== 'ok') {
      this.setState({
        pmSignInError:
          signIn === 'cancelled' ? 'Plumo sign-in was cancelled' : q.get('reason') || 'Plumo sign-in failed',
      });
      q.delete('pmSignIn'); q.delete('pmLink'); q.delete('reason');
      const left = q.toString();
      window.history.replaceState({}, '', window.location.pathname + (left ? '?' + left : ''));
      return;
    }

    const outcome = q.get('pmLink');
    if (!outcome) return;
    const ws = q.get('workspace');
    const notice =
      outcome === 'ok' ? (ws ? `Connected to plumo. This desk is linked to ${ws}.` : 'Connected to plumo')
      : outcome === 'cancelled' ? 'Plumo sign-in was cancelled'
      : outcome === 'invalid' ? 'That plumo link was incomplete'
      : `Could not connect: ${q.get('reason') || 'unknown error'}`;
    this.setState({ pmNotice: notice });
    q.delete('pmLink'); q.delete('workspace'); q.delete('reason');
    const rest = q.toString();
    window.history.replaceState({}, '', window.location.pathname + (rest ? '?' + rest : ''));
  };

  // Whether to offer plumo on the login screen at all. Unauthenticated, so it
  // cannot use /auth/pm/status.
  loadPmSignInAvailability = async () => {
    try {
      await api.pm.signinUrl();
      this.setState({ pmSignInAvailable: true });
    } catch (e) {
      // Hidden is the right outcome when plumo is not configured — but say why.
      // A bare `catch {}` here swallowed a ReferenceError for a missing import
      // and the button was silently absent in production with nothing to show
      // for it: no failed request, no console error, nothing to search for.
      console.warn('[pm] sign-in unavailable:', e?.message || e);
    }
  };

  loadPmStatus = async () => {
    try {
      this.setState({ pm: await api.pm.status() });
    } catch (e) {
      console.warn('[pm] status unavailable:', e?.message || e);
    }
  };

  setDrill = (e) => this.setState({ drill: e.currentTarget.dataset.k });
  clearDrill = () => this.setState({ drill: null });
  openAccount = () => this.setState({ screen: 'account', menu: null });
  SETTINGS_CARDS = [
    { v: 'team', name: 'Team & users', meta: '8 people · 2 teams', blurb: 'Who is here, what they can reach, and who is available right now.' },
    { v: 'sla', name: 'SLA policies', meta: '3 policies', blurb: 'Response and resolution targets, by priority.' },
    { v: 'hours', name: 'Business hours', meta: 'Mon–Fri · Europe/Lisbon', blurb: 'When the clocks run, and the days they rest.' },
    { v: 'canned', name: 'Canned responses', meta: '5 saved', blurb: 'Words worth keeping, so nobody writes them twice.' },
    { v: 'tags', name: 'Tags', meta: '6 tags', blurb: 'How tickets get sorted, and the colours they wear.' },
    { v: 'hooks', name: 'Webhooks', meta: '3 endpoints · 1 failing', blurb: 'Where plumo tells other systems what happened.' },
    { v: 'keys', name: 'API keys', meta: '3 keys', blurb: 'Secrets are shown once and never again.' },
    { v: 'email', name: 'Email & channels', meta: '3 connected', blurb: 'Where conversations arrive, and who they look like they are from.' },
  ];

  searchRef = React.createRef();
  replyRef = React.createRef();
  threadRef = React.createRef();
  mock = (e) => this.toast((e.currentTarget.dataset || {}).msg || 'Saved');
  keyBuf = '';

  async componentDidMount() {
    const p = this.props || {};
    const seed = {};
    if (p.simulateFailures) seed.failMode = true;
    if (p.startScreen && p.startScreen !== 'ticket' && p.startScreen !== 'login') seed.screen = p.startScreen;
    if (Object.keys(seed).length) this.setState(seed);
    // Read the PM callback outcome before anything else can navigate away, then
    // ask whether this deployment offers the link at all.
    // Before anything else: a returning plumo sign-in carries its tokens in the
    // fragment and must be adopted before the app decides it is logged out.
    const signedInWithPm = this.readPmSignIn();
    this.readPmCallback();
    this.loadPmStatus();
    if (!signedInWithPm) this.loadPmSignInAvailability();
    window.addEventListener('keydown', this.onKey, true);
    this.timer = setInterval(() => this.setState({ now: Date.now() }), 1000);

    this.api = adapter;
    adapter.onUnauthorized(() => this.setState({ loggedIn: false }));
    this.unsubscribeRealtime = adapter.onEvent(this.onRealtime);

    // restore a stored session; otherwise land on the sign-in screen
    if (!adapter.restore()) {
      this.setState({ booted: true, loggedIn: false });
      this.pingService();
      return;
    }
    try {
      const me = await adapter.bootstrap();
      this.setState(
        { booted: true, loggedIn: true, role: me.role, avail: me.availability ?? 'available', notifs: adapter.notifications },
        () => {
          this.loadQueue({ noFail: true });
          this.loadCounts();
          if ((p.startScreen || '') === 'ticket') this.openTicket('tk1042');
          if ((p.startScreen || '') === 'customers') this.loadCustomers();
          if ((p.startScreen || '') === 'reports') this.loadReports();
        },
      );
    } catch (e) {
      this.setState({ booted: true, loggedIn: false });
      this.pingService();
      if (e?.offline) this.toast('Network error. Please check your connection.', 'bad');
    }
  }

  /** Footer status dot on the sign-in screen — a real liveness check. */
  pingService() {
    adapter
      .serviceStatus()
      .then((s) => this.setState({ serviceUp: s === 'operational' }))
      .catch(() => this.setState({ serviceUp: false }));
  }
  componentDidUpdate() {
    const el = this.threadRef.current;
    if (el) {
      const n = this.state.ticket ? this.state.ticket.thread.length : 0;
      if (n !== this._threadLen) { this._threadLen = n; el.scrollTop = el.scrollHeight; }
    }
  }
  componentWillUnmount() {
    window.removeEventListener('keydown', this.onKey, true);
    clearInterval(this.timer); clearTimeout(this.countsTimer);
    if (this.unsubscribeRealtime) this.unsubscribeRealtime();
  }

  /** Server-push events (socket.io via Redis pub/sub on the backend). */
  onRealtime = (event, payload) => {
    const S = this.state;
    if (event === 'message.added') {
      if (S.ticket && payload.ticketId === S.ticket.id && !adapter.isLocalMessage(payload.messageId)) {
        // Pull the new message in rather than only offering a button. A chatbot
        // relays a visitor's reply within a second of them typing it; making an
        // agent notice a banner and click it is the difference between a live
        // conversation and a slow one.
        this.refreshOpenTicket();
      }
      this.throttledCounts();
      this.throttledQueue();
      return;
    }
    if (event === 'notification.created') {
      const meId = adapter.currentUser?.id;
      if (!payload.userIds || (meId && payload.userIds.includes(meId))) {
        adapter.refreshNotifications().then((n) => this.setState({ notifs: n })).catch(() => {});
      }
      return;
    }
    if (['ticket.created', 'ticket.updated', 'ticket.assigned', 'sla.warning'].includes(event)) {
      this.throttledCounts();
      // The counts alone used to update, so a new conversation bumped the badge
      // to 4 while the list under it still showed 3 rows until a refresh.
      this.throttledQueue();
    }
  };

  /**
   * Reload the inbox list, at most once every few seconds.
   *
   * Skipped while a conversation is open: re-fetching the list underneath does
   * nothing visible and costs a query per message on a busy desk.
   */
  throttledQueue() {
    if (this.queueTimer || this.state.screen === 'ticket') return;
    this.queueTimer = setTimeout(() => {
      this.queueTimer = null;
      if (this.state.screen === 'queue') this.loadQueue({ noFail: true });
    }, 2000);
  }

  /** Counts refresh at most once every few seconds no matter how chatty the socket gets. */
  throttledCounts() {
    if (this.countsTimer) return;
    this.countsTimer = setTimeout(() => {
      this.countsTimer = null;
      this.loadCounts();
    }, 3000);
  }
  /* `syncDoc()` is gone. The theme class and `data-density` went to
     ThemeProvider (item 12); pane *visibility* went to the panes (item 42); and
     the last thing left — `data-cs-nav`, which existed only to feed
     `[data-cs-nav="off"]{--cs-navw:64px}` — went with `--cs-navw` itself, now
     that `Sidebar` writes both of its widths as classes the way PM's does. The
     never-passed `accent` prop, which wrote `--cs-accent-src`, went too: there
     is one brand anchor and it lives in globals.css. */

  me() {
    const u = this.api?.currentUser;
    if (!u) return { id: '', name: '—', role: this.state.role, av: 1, team: null };
    const cached = this.api.agents.find(a => a.id === u.id);
    return { id: u.id, name: u.name, role: u.role, av: cached?.av ?? 1, team: u.teamId ?? null };
  }
  initials(n) { return (n || '?').split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase(); }
  rel(at) {
    const m = Math.round((this.state.now - at) / 60000);
    if (m < 1) return 'now'; if (m < 60) return m + 'm';
    const h = Math.round(m / 60); if (h < 24) return h + 'h';
    return Math.round(h / 24) + 'd';
  }
  /** rel() looks backwards; this looks forwards — "in 6d", for things that expire. */
  until(at) {
    if (at == null) return '—';
    const m = Math.round((at - this.state.now) / 60000);
    if (m <= 0) return 'expired';
    if (m < 60) return 'in ' + m + 'm';
    const h = Math.round(m / 60);
    if (h < 24) return 'in ' + h + 'h';
    return 'in ' + Math.round(h / 24) + 'd';
  }
  dur(ms) {
    const s = Math.floor(ms / 1000), m = Math.floor(s / 60);
    if (m < 60) return m + 'm ' + String(s % 60).padStart(2, '0') + 's';
    const h = Math.floor(m / 60);
    if (h < 48) return h + 'h ' + String(m % 60).padStart(2, '0') + 'm';
    return Math.floor(h / 24) + 'd';
  }
  clock(at) { return new Date(at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  sla(t) {
    if (!t) return { label: '—', tone: 'neutral', title: '' };
    if (t.status === 'resolved' || t.status === 'closed') return { label: 'Met', tone: 'sla-met', title: 'Closed within target' };
    if (t.sla.paused) return { label: 'Paused', tone: 'sla-paused', title: 'Clock paused while pending' };
    const fr = t.sla.firstResponse, res = t.sla.resolution;
    const first = fr.metAt == null;
    const due = first ? fr.dueAt : res.dueAt;
    // no policy attached — nothing to count down
    if (due == null) return { label: '—', tone: 'neutral', title: 'No SLA policy applies' };
    const left = due - this.state.now;
    const d = this.dur(Math.abs(left));
    const what = first ? 'First response' : 'Resolution';
    if (left < 0) return { label: '−' + d, tone: 'sla-breach', title: what + ' overdue by ' + d };
    if (left <= 1800000) return { label: d, tone: 'sla-due', title: what + ' due in ' + d };
    return { label: d, tone: 'sla-ok', title: what + ' due ' + this.clock(due) };
  }
  cust(id) { return (this.api ? this.api.customers.find(c => c.id === id) : null) || { name: '—', org: '', av: 1 }; }
  orgName(id) { return this.api ? this.api.meta.orgName(id) : '—'; }
  agent(id) { return this.api ? this.api.agents.find(a => a.id === id) : null; }
  /**
   * The console's one toast seam, now backed by react-hot-toast.
   *
   * The library is configured once in `components/layout/RootLayoutClient.jsx`;
   * all this does is translate the console's two tones into the two
   * variants that configuration styles. `bad` was already rendered as the
   * breach colour and `ok` as the met colour, so error/success is the same
   * distinction with the library's icon and the theme's surface instead of a
   * hardcoded navy pill.
   */
  toast(text, tone) {
    if (tone === 'bad') hotToast.error(text);
    else hotToast.success(text);
  }

  /**
   * Promise-based confirm, from the shared DialogProvider.
   *
   * `app/page.jsx` reads `useConfirm()` and passes it down — the console is a
   * class component and already spends its one `contextType` on the theme.
   * Resolving false without a provider is the safe default: the tests construct
   * `new Console({})` and drive handlers directly, and a confirm nobody can
   * answer must not proceed.
   */
  confirm = (options) =>
    this.props && this.props.confirm ? this.props.confirm(options) : Promise.resolve(false);
  dirty() { return this.state.draft.trim().length > 0; }

  async loadQueue(opts) {
    const s = this.state;
    if (!this.api) return;
    this.setState({ load: 'loading' });
    try {
      if (s.failMode && !(opts || {}).noFail) this.api.simulateNextFailure();
      const res = await this.api.listTickets({ view: s.view, filters: s.f, sort: s.sort, me: this.me().id, page: s.page });
      this.setState({ rows: res.rows, total: res.total, pageSize: res.pageSize, load: 'ok', refreshed: Date.now(), cursor: 0 });
    } catch (e) { this.setState({ load: 'error' }); }
  }
  async loadCounts() {
    if (!this.api) return;
    try {
      const { views, facets } = await this.api.refreshCounts();
      this.setState({ counts: views, facets });
    } catch (e) { }
  }

  async loadReports() {
    if (!this.api) return;
    try {
      await this.api.loadReports();
      this.setState({ reportsAt: Date.now() });
    } catch (e) { }
  }
  async loadCustomers() {
    if (!this.api) return;
    try { const rows = await this.api.listCustomers(this.state.custQ); this.setState({ customers: rows }); } catch (e) { }
  }

  go = (e) => { this.navTo(e.currentTarget.dataset.s); };
  async navTo(screen) {
    if (this.dirty() && this.state.screen === 'ticket') {
      const ok = await this.confirm({
        title: 'Discard this reply?',
        message: "You have written something that has not been sent yet. It will still be here if you stay.",
        confirmLabel: 'Discard',
        cancelLabel: 'Keep editing',
        danger: true,
      });
      if (!ok) return;
      this.setState({ draft: '' });
    }
    this.reallyNav(screen);
  }
  reallyNav(screen) {
    // PM's drawer closes on any nav click (`Sidebar.tsx:172-174`); the rows are
    // the same rows in the drawer and in the desktop rail, so the close belongs
    // here rather than at the call site.
    const patch = { screen, menu: null, sel: [], mobileNav: false };
    if (screen === 'settings') patch.settingsTab = 'overview';
    if (screen === 'mine') { patch.screen = 'queue'; patch.view = 'my-open'; }
    else if (screen === 'queue' && this.state.view === 'my-open') patch.view = 'all-open';
    this.setState(patch, () => {
      if (patch.screen === 'queue') this.loadQueue({ noFail: true });
      if (screen === 'customers') this.loadCustomers();
      if (screen === 'reports') this.loadReports();
    });
  }
  openRow = (e) => { this.openTicket(e.currentTarget.dataset.id); };
  async openTicket(id) {
    this.setState({ screen: 'ticket', ticketLoad: 'loading', ticket: null, remote: false, mode: 'reply', draft: '', menu: null, q: '', results: null });
    try {
      // the adapter marks the ticket seen; the "someone replied" banner is WS-driven
      const t = await this.api.getTicket(id);
      this.setState({ ticket: t, ticketLoad: 'ok' });
    } catch (e) {
      if (e?.status === 404 || e?.status === 400) { this.setState({ screen: 'notfound', ticketLoad: 'idle' }); return; }
      this.setState({ ticketLoad: 'error' });
    }
  }
  /**
   * Re-fetch the open ticket in place, leaving the composer alone.
   *
   * openTicket() resets `draft` and `mode`, which is right when you navigate to
   * a conversation and wrong when a message merely arrives in the one you are
   * already reading — it would delete a half-written reply. That is why the
   * banner used to be a manual button. This refreshes the thread and keeps
   * whatever the agent is typing.
   */
  async refreshOpenTicket() {
    const id = this.state.ticket?.id;
    if (!id) return;
    try {
      const t = await this.api.getTicket(id);
      // guard against the agent having navigated away mid-request
      if (this.state.ticket?.id === id) this.setState({ ticket: t, remote: false });
    } catch { /* the banner stays; a manual reload is still available */ }
  }

  /**
   * Silence the assistant, or hand the conversation back to it.
   *
   * Replying already disables the bot, but there is a window between an agent
   * deciding to answer and their message landing: the visitor writes, the bot
   * answers in under a second, and now two of you are talking. This closes it.
   */
  toggleBot = async () => {
    const t = this.state.ticket;
    if (!t) return;
    const next = !t.botEnabled;
    // optimistic — the button is the feedback, and a failure restores it below
    this.setState({ ticket: { ...t, botEnabled: next } });
    try {
      await this.api.setBotEnabled(t.id, next);
      this.toast(next ? 'The assistant can reply again' : 'The assistant is silenced. This conversation is yours.');
    } catch {
      this.setState((st) => (st.ticket ? { ticket: { ...st.ticket, botEnabled: !next } } : null));
      this.toast('Failed to update. Please try again.', 'bad');
    }
  };

  backToQueue = () => { this.navTo('queue'); };
  openCustomer = async (e) => {
    const id = e.currentTarget.dataset.id;
    this.setState({ screen: 'customer', customer: null, q: '', results: null, menu: null });
    try { this.setState({ customer: await this.api.getCustomer(id) }); } catch (err) { }
  };

  onView = (e) => { this.setState({ view: e.currentTarget.dataset.v, page: 0, sel: [] }, () => this.loadQueue({ noFail: true })); };
  setSort = (v) => { this.setState({ sort: v }, () => this.loadQueue({ noFail: true })); };
  cycleDensity = () => { if (this.context) this.context.setDensity(this.DENSITIES[(this.DENSITIES.indexOf(this.density()) + 1) % 3]); };
  toggleTheme = () => { if (this.context) this.context.toggleTheme(); };
  toggleNav = () => this.setState(s => ({ nav: !s.nav }));
  toggleFilters = () => this.setState(s => ({ filters: !s.filters }));
  toggleRail = () => this.setState(s => ({ rail: !s.rail }));
  openMobileNav = () => this.setState({ mobileNav: true });
  closeMobileNav = () => this.setState({ mobileNav: false });
  toggleMobileSearch = () => this.setState(s => ({ mobileSearch: !s.mobileSearch }));
  setTicketPane = (pane) => this.setState({ ticketPane: pane });
  refresh = () => this.loadQueue({ noFail: true });
  saveView = () => this.toast('View saved successfully!');
  toggleFacet = (e) => {
    const k = e.currentTarget.dataset.k, v = e.currentTarget.dataset.v;
    if (k === 'tag') { this.setState(s => ({ f: { ...s.f, tag: s.f.tag === v ? null : v }, page: 0 }), () => this.loadQueue({ noFail: true })); return; }
    this.setState(s => {
      const cur = s.f[k] || [];
      return { f: { ...s.f, [k]: cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v] }, page: 0 };
    }, () => this.loadQueue({ noFail: true }));
  };
  setAssigneeFilter = (e) => {
    const v = e.currentTarget.dataset.v;
    this.setState(s => ({ f: { ...s.f, assignee: s.f.assignee === v ? null : v }, page: 0 }), () => this.loadQueue({ noFail: true }));
  };
  setTeamFilter = (e) => {
    const v = e.currentTarget.dataset.v;
    this.setState(s => ({ f: { ...s.f, team: s.f.team === v ? null : v }, page: 0 }), () => this.loadQueue({ noFail: true }));
  };
  setRange = (e) => {
    const v = e.currentTarget.dataset.v;
    this.setState(s => ({ f: { ...s.f, range: v }, page: 0 }), () => this.loadQueue({ noFail: true }));
  };
  clearFilters = () => this.setState({ f: { status: [], priority: [], channel: [], tag: null, team: null, assignee: null, range: 'any' }, page: 0 }, () => this.loadQueue({ noFail: true }));
  removeChip = (e) => {
    const k = e.currentTarget.dataset.k, v = e.currentTarget.dataset.v;
    this.setState(s => {
      const f = { ...s.f };
      if (Array.isArray(f[k])) f[k] = f[k].filter(x => x !== v);
      else f[k] = k === 'range' ? 'any' : null;
      return { f, page: 0 };
    }, () => this.loadQueue({ noFail: true }));
  };
  prevPage = () => this.setState(s => ({ page: Math.max(0, s.page - 1) }), () => this.loadQueue({ noFail: true }));
  nextPage = () => this.setState(s => ({ page: (s.page + 1) * s.pageSize < s.total ? s.page + 1 : s.page }), () => this.loadQueue({ noFail: true }));

  stop = (e) => { e.stopPropagation(); };
  onRowEnter = (e) => { const id = e.currentTarget.dataset.id; if (this.state.hover !== id) this.setState({ hover: id }); };
  onRowLeave = () => this.setState({ hover: null });
  toggleSel = (e) => {
    const id = e.currentTarget.dataset.id;
    this.setState(s => ({ sel: s.sel.includes(id) ? s.sel.filter(x => x !== id) : [...s.sel, id] }));
  };
  toggleAll = () => this.setState(s => ({ sel: s.sel.length === s.rows.length ? [] : s.rows.map(r => r.id) }));
  clearSel = () => this.setState({ sel: [] });
  quickAssign = (e) => { e.stopPropagation(); this.patch(e.currentTarget.dataset.id, { assigneeId: this.me().id }, 'Assigned to you'); };
  quickStatus = (e) => { e.stopPropagation(); this.patch(e.currentTarget.dataset.id, { status: 'pending' }, 'Set to pending'); };
  quickOpen = (e) => { e.stopPropagation(); this.openTicket(e.currentTarget.dataset.id); };
  bulkAssign = () => this.bulk({ assigneeId: this.me().id }, 'Assigned to you');
  bulkPending = () => this.bulk({ status: 'pending' }, 'Set to pending');
  bulkTag = () => {
    const ids = this.state.sel, rows = this.state.rows;
    this.setState(s => ({ rows: s.rows.map(r => ids.includes(r.id) && !r.tags.includes('urgent') ? { ...r, tags: [...r.tags, 'urgent'] } : r), sel: [] }));
    ids.forEach(id => { const r = rows.find(x => x.id === id); if (r) this.api.patchTicket(id, { tags: Array.from(new Set([...r.tags, 'urgent'])) }); });
    this.toast(ids.length + ' flagged for review');
  };
  bulkClose = async () => {
    const n = this.state.sel.length;
    const ok = await this.confirm({
      title: 'Close ' + n + ' ' + (n === 1 ? 'conversation' : 'conversations') + '?',
      message: "The people on the other end will be told it is wrapped up. They can reopen it at any time.",
      confirmLabel: 'Close',
      cancelLabel: 'Cancel',
      // No `danger` — PM reserves the red button for what cannot be undone
      // (`users/page.tsx:426` remove vs `:454` reactivate). Closing is
      // reversible, and the sentence above says so.
    });
    if (!ok) return;
    return this.bulk({ status: 'closed' }, n + ' closed successfully');
  };
  async bulk(patch, label) {
    const ids = this.state.sel, prev = this.state.rows;
    this.setState(s => ({ rows: s.rows.map(r => ids.includes(r.id) ? { ...r, ...patch, updatedAt: Date.now() } : r), sel: [] }));
    try {
      if (this.state.failMode) this.api.simulateNextFailure();
      await Promise.all(ids.map(id => this.api.patchTicket(id, patch)));
      this.toast(label); this.loadCounts();
    } catch (e) { this.setState({ rows: prev }); this.toast('Failed to save changes. Please try again.', 'bad'); }
  }

  async patch(id, patch, label) {
    const prevRows = this.state.rows, prevT = this.state.ticket;
    const applied = { ...patch, updatedAt: Date.now() };
    this.setState(s => ({
      rows: s.rows.map(r => r.id === id ? { ...r, ...applied } : r),
      ticket: s.ticket && s.ticket.id === id
        ? { ...s.ticket, ...applied, sla: { ...s.ticket.sla, paused: patch.status ? (patch.status === 'pending' || patch.status === 'on-hold') : s.ticket.sla.paused } }
        : s.ticket,
      menu: null,
    }));
    try {
      if (this.state.failMode) this.api.simulateNextFailure();
      await this.api.patchTicket(id, patch);
      if (label) this.toast(label);
      this.loadCounts();
    } catch (e) {
      this.setState({ rows: prevRows, ticket: prevT });
      this.toast('Failed to save changes. Please try again.', 'bad');
    }
  }
  /* The five setters below take a value, not an event. `Dropdown` owns its own
     open state and hands `DropdownItem` a bare `onClick` with no element to
     hang `data-v` on, so the id has to come through the argument — which is
     also how PM calls them (`IssueSidebar.tsx:194`). The three that still read
     `e.currentTarget.dataset` (`setAssignee`, `setAssigneeFilter`, the facet
     toggles) are the panels that stayed hand-rolled. */
  setStatus = (v) => { this.patch(this.state.ticket.id, { status: v }, 'Status updated successfully!'); };
  setPriority = (v) => { this.patch(this.state.ticket.id, { priority: v }, 'Priority updated successfully!'); };
  setAssignee = (e) => {
    const v = e.currentTarget.dataset.v || null;
    const a = this.agent(v);
    this.patch(this.state.ticket.id, { assigneeId: v }, a ? 'Assigned to ' + a.name.split(' ')[0] : 'Unassigned');
  };
  unassign = () => this.patch(this.state.ticket.id, { assigneeId: null }, 'Unassigned');
  assignMe = () => this.patch(this.state.ticket.id, { assigneeId: this.me().id }, 'Assigned to you');
  setTeam = (v) => { this.patch(this.state.ticket.id, { teamId: v }, 'Team updated successfully'); };
  addTag = (v) => {
    const t = this.state.ticket;
    if (!t || t.tags.includes(v)) return;
    this.patch(t.id, { tags: [...t.tags, v] }, 'Tag added');
  };
  removeTag = (e) => {
    const v = e.currentTarget.dataset.v, t = this.state.ticket;
    this.patch(t.id, { tags: t.tags.filter(x => x !== v) }, 'Tag removed');
  };
  editSubject = () => this.setState(s => ({ subjEdit: true, subjDraft: s.ticket.subject }));
  onSubjDraft = (e) => this.setState({ subjDraft: e.target.value });
  saveSubject = () => {
    const v = this.state.subjDraft.trim();
    this.setState({ subjEdit: false });
    if (v && v !== this.state.ticket.subject) this.patch(this.state.ticket.id, { subject: v }, 'Subject updated successfully');
  };
  onSubjKey = (e) => { if (e.key === 'Enter') this.saveSubject(); if (e.key === 'Escape') this.setState({ subjEdit: false }); };

  setMode = (e) => this.setState({ mode: e.currentTarget.dataset.m });
  onDraft = (e) => this.setState({ draft: e.target.value });
  insertCanned = (e) => {
    const id = e.currentTarget.dataset.v;
    const r = this.api.cannedResponses.find(x => x.id === id);
    const t = this.state.ticket;
    const body = r.body.replace('{{name}}', this.cust(t.customerId).name.split(' ')[0]);
    this.setState(s => ({ draft: (s.draft ? s.draft + '\n\n' : '') + body, menu: null }), () => { if (this.replyRef.current) this.replyRef.current.focus(); });
  };
  async send(then) {
    const body = this.state.draft.trim();
    if (!body || !this.state.ticket) return;
    const internal = this.state.mode === 'note';
    const me = this.me(), t = this.state.ticket;
    const tmp = { kind: internal ? 'note' : 'message', id: 'tmp' + Date.now(), author: me.name, authorId: me.id, side: 'agent', role: me.role === 'lead' ? 'team lead' : 'support', at: Date.now(), body, attachments: [], pending: true };
    this.setState(s => ({ ticket: { ...s.ticket, thread: [...s.ticket.thread, tmp], updatedAt: Date.now() }, draft: '', sending: true, menu: null }));
    try {
      if (this.state.failMode) this.api.simulateNextFailure();
      await this.api.addMessage(t.id, { body, internal, author: me.id });
      this.setState(s => ({
        sending: false,
        ticket: {
          ...s.ticket,
          thread: s.ticket.thread.map(i => i.id === tmp.id ? { ...i, pending: false } : i),
          sla: { ...s.ticket.sla, firstResponse: { ...s.ticket.sla.firstResponse, metAt: internal ? s.ticket.sla.firstResponse.metAt : (s.ticket.sla.firstResponse.metAt || Date.now()) } },
        },
      }));
      this.toast(internal ? 'Note added. Only your team can see it.' : 'Reply sent successfully!');
      if (then) this.patch(t.id, { status: then }, 'Status updated successfully!');
    } catch (e) {
      this.setState(s => ({ sending: false, draft: body, ticket: { ...s.ticket, thread: s.ticket.thread.filter(i => i.id !== tmp.id) } }));
      this.toast('Failed to send. Your message is still here. Please try again.', 'bad');
    }
  }
  onSend = () => this.send(null);
  onSendPending = () => this.send('pending');
  onSendResolved = () => this.send('resolved');
  reloadTicket = () => { const id = this.state.ticket.id; this.setState({ remote: false }); this.openTicket(id); };

  /* `state.menu` now only drives the panels that `Dropdown` cannot hold: the
     two with a search field in them (assignee, canned responses) and the two
     that are not menus at all (notifications, search results). Everything else
     — status, priority, team, tags, the ticket overflow, the queue sort and the
     sidebar user card — moved to `Dropdown`, which keeps its own open state. */
  menuTo(name) { return (e) => { if (e && e.stopPropagation) e.stopPropagation(); this.setState(s => ({ menu: s.menu === name ? null : name, menuQ: '' })); }; }
  openAssigneeMenu = this.menuTo('assignee');
  openCanned = this.menuTo('canned');
  toggleNotif = this.menuTo('notif');
  closeMenu = () => this.setState({ menu: null });
  onMenuQ = (e) => this.setState({ menuQ: e.target.value });
  readAllNotif = () => {
    this.setState(s => ({ notifs: s.notifs.map(n => ({ ...n, unread: false })) }));
    this.api.markAllNotificationsRead().catch(() => {});
  };
  openSheet = () => this.setState({ sheet: true, menu: null });
  closeSheet = () => this.setState({ sheet: false });
  openNewTicket = () => this.setState(s => ({
    newT: true,
    menu: null,
    newError: null,
    // default to whatever the select will actually show
    newCustomer: s.newCustomer || this.api?.customers?.[0]?.id || '',
  }));
  closeNewTicket = () => this.setState({ newT: false, newError: null });
  onNewSubject = (e) => this.setState({ newSubject: e.target.value, newError: null });
  onNewBody = (e) => this.setState({ newBody: e.target.value });
  onNewCustomer = (e) => this.setState({ newCustomer: e.target.value, newError: null });
  onNewPriority = (e) => this.setState({ newPriority: e.currentTarget.dataset.v });
  submitNew = async () => {
    const s = this.state;
    // Field-level, not a toast: the complaint belongs under the field it is
    // about, and it has to still be there while the field is being corrected.
    if (!s.newSubject.trim()) {
      this.setState({ newError: { field: 'subject', text: 'Please enter a subject' } });
      return;
    }
    if (!s.newCustomer) {
      this.setState({ newError: { field: 'customer', text: 'Please select a customer' } });
      return;
    }
    this.setState({ newT: false, newError: null });
    try {
      const t = await this.api.createTicket({ subject: s.newSubject.trim(), customerId: s.newCustomer, priority: s.newPriority, body: s.newBody });
      this.setState({ newSubject: '', newBody: '' });
      this.toast('Conversation #' + t.num + ' created successfully!');
      this.loadCounts(); this.openTicket(t.id);
    } catch (e) { this.toast('Failed to create the conversation. Please try again.', 'bad'); }
  };
  askDelete = async () => {
    this.setState({ menu: null });
    const ok = await this.confirm({
      title: 'Delete this conversation?',
      message: "This cannot be undone. The whole thread goes with it. If you are unsure, close it instead. Closed conversations can always be reopened.",
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      danger: true,
    });
    if (!ok) return;
    const id = this.state.ticket?.id;
    if (!id) return;
    return this.api.deleteTicket(id)
      .then(() => { this.toast('Conversation deleted successfully!'); this.reallyNav('queue'); this.loadCounts(); })
      .catch((e) => this.toast(e?.status === 403 ? 'Deleting requires an admin' : 'Failed to delete. Please try again.', 'bad'));
  };
  askSpam = async () => {
    this.setState({ menu: null });
    const ok = await this.confirm({
      title: 'Mark as spam?',
      message: "This will be moved out of the queue. You can pull it back from the spam view.",
      confirmLabel: 'Mark as spam',
      cancelLabel: 'Cancel',
      danger: true,
    });
    if (!ok) return;
    this.toast('Marked as spam');
    this.reallyNav('queue');
  };
  copyLink = () => { this.setState({ menu: null }); this.toast('Link copied!'); };
  mergeTicket = () => { this.setState({ menu: null }); this.toast('The merge picker opens here in the real app'); };
  onKeyName = (e) => this.setState({ keyName: e.target.value });
  setKeyKind = (e) => this.setState({ keyKind: e.currentTarget.dataset.v });

  /**
   * Scope presets rather than a free checkbox list.
   *
   * The scopes are conjunctive and unforgiving: a chatbot key needs exactly
   * chat:write + chat:read and nothing else, and the old hardcoded
   * tickets:read/write produced keys that 403'd on every chat route. Two named
   * intentions are harder to get wrong than seven checkboxes.
   */
  KEY_KINDS = {
    chatbot: { label: 'Chatbot', scopes: ['chat:write', 'chat:read'], hint: 'Open conversations, post turns, hand off' },
    readonly: { label: 'Read-only', scopes: ['tickets:read', 'reports:read'], hint: 'Dashboards and exports; cannot write' },
    integration: { label: 'Integration', scopes: ['tickets:read', 'tickets:write', 'customers:read', 'customers:write'], hint: 'Full ticket and customer access' },
  };

  genKey = async () => {
    const kind = this.KEY_KINDS[this.state.keyKind] ?? this.KEY_KINDS.chatbot;
    const name = this.state.keyName.trim();
    if (!name) { this.toast('Please give the key a name', 'bad'); return; }
    try {
      const secret = await this.api.generateApiKey({ name, scopes: kind.scopes });
      this.setState({ secret, keyName: '' });
    } catch {
      this.toast('Failed to generate a key. Admin only.', 'bad');
    }
  };

  revokeKey = async (e) => {
    const id = e.currentTarget.dataset.id;
    try {
      await this.api.revokeApiKey(id);
      this.forceUpdate();
      this.toast('Key revoked successfully');
    } catch {
      this.toast('Failed to revoke the key. Please try again.', 'bad');
    }
  };

  /** Actually copies. The old handler only showed a toast saying it had. */
  copySecret = async () => {
    const text = this.state.secret;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      this.toast('Copied! Store it now. It cannot be shown again.');
    } catch {
      // clipboard needs a secure context and permission; say so rather than lie
      this.toast('Please select the key and copy it manually', 'bad');
    }
  };
  hideKey = () => this.setState({ secret: null });

  /* ---- invitations -------------------------------------------------------
   *
   * The button that opens this modal used to be onClick={V.mock}: it showed
   * "invite sent — they'll get a gentle nudge by email ✿" and made no request
   * at all. Everything below is the real thing — POST /invitations, the pending
   * list, and revoke — and every message the reader sees is the server's actual
   * answer rather than a cheerful guess.
   */

  ROLE_OPTIONS = [
    { value: 'agent', label: 'Agent · answers conversations' },
    { value: 'lead', label: 'Lead · agent, plus their team' },
    { value: 'admin', label: 'Admin · everything, settings included' },
  ];

  async loadInvites() {
    // Only admins may list them; asking as anyone else is a guaranteed 403.
    if (!this.api || this.state.role !== 'admin') return;
    this.setState({ invitesLoad: 'loading' });
    try {
      const rows = await this.api.listInvitations();
      this.setState({ invites: rows, invitesLoad: 'ok' });
    } catch (e) {
      this.setState({ invites: [], invitesLoad: 'error' });
    }
  }

  openInvite = () => this.setState({
    inviteOpen: true, inviteEmail: '', inviteRole: 'agent', inviteTeam: '', inviteError: '', menu: null,
  });
  closeInvite = () => this.setState({ inviteOpen: false, inviteError: '' });
  onInviteEmail = (e) => this.setState({ inviteEmail: e.target.value, inviteError: '' });
  onInviteRole = (e) => this.setState({ inviteRole: e.target.value });
  onInviteTeam = (e) => this.setState({ inviteTeam: e.target.value });
  onInviteKey = (e) => { if (e.key === 'Enter') this.submitInvite(); };

  submitInvite = async () => {
    const email = this.state.inviteEmail.trim().toLowerCase();
    // Say the obvious thing before the round trip; everything else is the
    // server's to judge — already a member, already invited, not an admin.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.setState({ inviteError: 'Please enter a valid email address' });
      return;
    }
    this.setState({ inviteBusy: true, inviteError: '' });
    try {
      const inv = await this.api.createInvitation({
        email, role: this.state.inviteRole, teamId: this.state.inviteTeam || undefined,
      });
      this.setState({ inviteOpen: false, inviteBusy: false, inviteEmail: '' });
      this.toast('Invitation sent to ' + (inv?.email || email));
      this.loadInvites();
    } catch (e) {
      this.setState({
        inviteBusy: false,
        inviteError:
          e?.status === 0 ? 'Network error. Nothing was sent.'
          : e?.status === 403 ? 'Inviting people requires an admin'
          : e?.message || 'Failed to send the invitation. Please try again.',
      });
    }
  };

  revokeInvite = async (e) => {
    const { id, email } = e.currentTarget.dataset;
    const ok = await this.confirm({
      title: 'Revoke the invitation to ' + email + '?',
      message: "Their link stops working straight away. Nothing else changes, and you can invite them again at any time.",
      confirmLabel: 'Revoke',
      cancelLabel: 'Cancel',
      danger: true,
    });
    if (!ok) return;
    try {
      await this.api.revokeInvitation(id);
      this.setState((s) => ({ invites: s.invites.filter((i) => i.id !== id) }));
      this.toast('Invitation revoked successfully');
    } catch (err) {
      this.toast(err?.message || 'Failed to revoke the invitation. Please try again.', 'bad');
    }
  };

  /* ---- settings: real writes ---------------------------------------------
   *
   * Every handler below replaced an onClick={V.mock} — a toast that named an
   * outcome and sent nothing. The worst was deactivate: it rendered a
   * confirmation dialog and said "X deactivated" while the person kept their
   * session, their role and every permission, so an admin revoking an
   * outsider's access was told it had worked when it had not.
   *
   * Two rules hold for all of it. A success line is printed only after a 2xx,
   * and a failure prints what the server actually said.
   */

  /** The server's own words, with kinder phrasing for the two we can predict. */
  apiMessage(e, fallback = 'Failed to save changes. Please try again.') {
    if (e?.status === 0) return 'Network error. Nothing was saved.';
    if (e?.status === 403) return 'That action requires an admin';
    return e?.message || fallback;
  }

  /**
   * Each settings panel loads its own rows when it opens.
   *
   * The adapter fills its caches once at bootstrap and offers no reload, so a
   * tag created here would not reach the table until the next full page load,
   * and an SLA row would arrive pre-formatted ("4h 30m") with the minute count
   * the PATCH needs already thrown away. These panels are the only place these
   * records are written, so they keep their own copy and re-read it after every
   * write — that is what makes "the list updated" a fact rather than a hope.
   * Until the first read lands, renderVals falls back to the bootstrap copy so
   * nothing is ever blank.
   */
  SETTINGS_SOURCES = {
    sla: { load: () => api.slaPolicies.list() },
    hours: { load: () => api.businessHours.list() },
    canned: { load: () => api.cannedResponses.list() },
    tags: { load: () => api.tags.list() },
    // Both are admin-only reads; asking as anyone else is a guaranteed 403.
    hooks: { load: () => api.webhooks.list(), adminOnly: true },
    email: {
      load: () => api.email.inboundAddress(),
      adminOnly: true,
      then: (row) => this.setState({ inboundDraft: row?.inboundEmail ?? '', inboundError: '' }),
    },
  };

  loadSettingsTab = async (tab) => {
    const src = this.SETTINGS_SOURCES[tab];
    if (!src || !this.api) return;
    if (src.adminOnly && this.state.role !== 'admin') return;
    try {
      const rows = await src.load();
      this.setState((s) => ({
        settings: { ...s.settings, [tab]: rows },
        settingsErr: { ...s.settingsErr, [tab]: '' },
      }));
      if (src.then) src.then(rows);
    } catch (e) {
      // Say the panel is stale rather than presenting bootstrap's copy as current.
      this.setState((s) => ({
        settingsErr: { ...s.settingsErr, [tab]: this.apiMessage(e, 'Failed to load data') },
      }));
    }
  };

  /**
   * Keep the console's copy of the people list in step with a write.
   *
   * `agents` is built at bootstrap and the adapter offers no reload, so without
   * this the table — and every assignee menu that reads the same array — would
   * keep showing the old role, or the deactivated person, until the next full
   * page load. Passing null for `changes` removes them.
   */
  syncAgent(id, changes) {
    const A = this.api;
    if (!A) return;
    A.agents = changes
      ? A.agents.map((a) => (a.id === id ? { ...a, ...changes } : a))
      : A.agents.filter((a) => a.id !== id);
    this.forceUpdate();
  }

  teamChoices(noneLabel = 'No team for now') {
    return [{ value: '', label: noneLabel }].concat(
      (this.api ? this.api.teams : []).map((x) => ({ value: x.id, label: x.name })),
    );
  }

  /**
   * Deactivate somebody's access to this desk.
   *
   * DELETE is a soft deactivate of the membership: their replies stay on every
   * ticket, and the backend revokes their refresh tokens so the session ends
   * instead of lingering. Removing them from the cached list afterwards is the
   * visible half — an admin has to be able to see that it took.
   */
  askDeactivate = async (e) => {
    const { id, name } = e.currentTarget.dataset;
    const ok = await this.confirm({
      title: 'Deactivate ' + name + '?',
      message: "They lose access to this desk straight away and are signed out. Their replies stay on every ticket, and you can invite them back at any time.",
      confirmLabel: 'Deactivate',
      cancelLabel: 'Cancel',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.users.deactivate(id);
      this.syncAgent(id, null);
      this.toast(name + ' deactivated successfully');
    } catch (err) {
      this.toast(this.apiMessage(err, 'Failed to deactivate the user'), 'bad');
    }
  };

  /**
   * Settings' one record editor.
   *
   * Six panels each needed a small form. One modal driven by a descriptor beats
   * six bespoke ones for the property that matters here: there is exactly one
   * place a failure is rendered and exactly one place a success is announced,
   * so none of them can quietly drift back into announcing something that did
   * not happen.
   */
  EDITORS = {
    user: {
      title: (m) => 'Edit ' + m.name,
      ok: 'Save',
      note: 'Role and team belong to this desk only. Changing them here does not touch any other workspace they are a member of.',
      fields: () => [
        { name: 'role', kind: 'select', label: 'Role', options: this.ROLE_OPTIONS },
        { name: 'teamId', kind: 'select', label: 'Team', options: this.teamChoices() },
      ],
      initial: (m) => ({ role: m.role, teamId: m.teamId || '' }),
      submit: async (v, m) => {
        const patch = {};
        if (v.role !== m.role) patch.role = v.role;
        // null, not undefined: an explicit null is how the team is cleared, and
        // @IsOptional lets it through to reach the update.
        if ((v.teamId || null) !== (m.teamId || null)) patch.teamId = v.teamId || null;
        if (!Object.keys(patch).length) return 'Nothing changed';
        const after = await api.users.patch(m.id, patch);
        this.syncAgent(m.id, { role: after.role, team: after.teamId });
        return m.name + ' updated successfully';
      },
    },

    'sla-new': {
      title: () => 'New SLA policy',
      ok: 'Create policy',
      note: 'Targets are written as 30m, 4h or 2d. Priority is fixed when the policy is created.',
      fields: () => [
        { name: 'name', kind: 'text', label: 'Name', placeholder: 'Weekend cover' },
        { name: 'priority', kind: 'select', label: 'Applies to priority', options: PRIORITY_OPTIONS },
        { name: 'first', kind: 'text', label: 'First response target', placeholder: '30m' },
        { name: 'resolution', kind: 'text', label: 'Resolution target', placeholder: '6h' },
      ],
      initial: () => ({ name: '', priority: 'normal', first: '', resolution: '' }),
      validate: (v) =>
        !v.name.trim() ? 'Name is required'
        : MINS(v.first) == null ? 'The first response target should read like 30m, 4h or 2d'
        : MINS(v.resolution) == null ? 'The resolution target should read like 30m, 4h or 2d'
        : '',
      submit: async (v) => {
        await api.slaPolicies.create({
          name: v.name.trim(), priority: v.priority,
          firstResponseMins: MINS(v.first), resolutionMins: MINS(v.resolution),
        });
        await this.loadSettingsTab('sla');
        return 'Policy created successfully';
      },
    },

    'sla-edit': {
      title: (m) => 'Edit ' + m.name,
      ok: 'Save',
      // priority is absent from UpdateSlaPolicyDto, so it is absent here too
      // rather than offered as a field the server would silently ignore.
      note: 'Priority cannot be changed after a policy exists. Create another one instead.',
      fields: () => [
        { name: 'name', kind: 'text', label: 'Name' },
        { name: 'first', kind: 'text', label: 'First response target', placeholder: '30m' },
        { name: 'resolution', kind: 'text', label: 'Resolution target', placeholder: '6h' },
      ],
      initial: (m) => ({
        name: m.name, first: MINS_TEXT(m.firstResponseMins), resolution: MINS_TEXT(m.resolutionMins),
      }),
      validate: (v) =>
        !v.name.trim() ? 'Name is required'
        : MINS(v.first) == null ? 'the first response target should read like 30m, 4h or 2d'
        : MINS(v.resolution) == null ? 'the resolution target should read like 30m, 4h or 2d'
        : '',
      submit: async (v, m) => {
        await api.slaPolicies.patch(m.id, {
          name: v.name.trim(), firstResponseMins: MINS(v.first), resolutionMins: MINS(v.resolution),
        });
        await this.loadSettingsTab('sla');
        return 'Policy updated successfully';
      },
    },

    'canned-new': {
      title: () => 'New canned response',
      ok: 'Save response',
      note: 'A response for everyone is admin-only; a lead can write one for their own team.',
      fields: () => this.CANNED_FIELDS(),
      initial: () => ({ title: '', body: '', tags: '', teamId: '' }),
      validate: (v) => (!v.title.trim() ? 'Title is required' : !v.body.trim() ? 'A response needs some words' : ''),
      submit: async (v) => {
        await api.cannedResponses.create(this.cannedBody(v));
        await this.loadSettingsTab('canned');
        return 'Response saved successfully';
      },
    },

    'canned-edit': {
      title: (m) => 'Edit ' + m.title,
      ok: 'Save',
      fields: () => this.CANNED_FIELDS(),
      initial: (m) => ({
        title: m.title, body: m.body, tags: (m.tags || []).join(', '), teamId: m.teamId || '',
      }),
      validate: (v) => (!v.title.trim() ? 'Title is required' : !v.body.trim() ? 'A response needs some words' : ''),
      submit: async (v, m) => {
        await api.cannedResponses.patch(m.id, this.cannedBody(v));
        await this.loadSettingsTab('canned');
        return 'Response updated successfully';
      },
    },

    'tag-new': {
      title: () => 'New tag',
      ok: 'Create tag',
      fields: () => [
        { name: 'key', kind: 'text', label: 'Key', placeholder: 'billing', helper: 'Lowercase letters, numbers and hyphens. This is what gets stored on a conversation, and it cannot be changed later.' },
        { name: 'label', kind: 'text', label: 'Label', placeholder: 'Billing' },
        { name: 'color', kind: 'text', label: 'Colour', placeholder: '#B8CFB4', helper: 'Optional.' },
      ],
      initial: () => ({ key: '', label: '', color: '' }),
      validate: (v) =>
        !/^[a-z0-9-]+$/.test(v.key.trim()) ? 'The key can only hold lowercase letters, numbers and hyphens'
        : !v.label.trim() ? 'Label is required' : '',
      submit: async (v) => {
        await api.tags.create({
          key: v.key.trim(), label: v.label.trim(), color: v.color.trim() || undefined,
        });
        await this.loadSettingsTab('tags');
        return 'Tag created successfully';
      },
    },

    'tag-edit': {
      title: (m) => 'Edit ' + m.label,
      ok: 'Save',
      note: 'The key stays as it is. Conversations already carry it.',
      fields: () => [
        { name: 'label', kind: 'text', label: 'Label' },
        { name: 'color', kind: 'text', label: 'Colour', placeholder: '#B8CFB4', helper: 'Optional.' },
      ],
      initial: (m) => ({ label: m.label, color: m.color || '' }),
      validate: (v) => (!v.label.trim() ? 'Label is required' : ''),
      submit: async (v, m) => {
        await api.tags.patch(m.id, { label: v.label.trim(), color: v.color.trim() || undefined });
        await this.loadSettingsTab('tags');
        return 'Tag updated successfully';
      },
    },

    'hook-new': {
      title: () => 'Add an endpoint',
      ok: 'Add endpoint',
      note: 'A JSON body is POSTed to this URL whenever one of the chosen events happens.',
      fields: () => [
        { name: 'url', kind: 'text', label: 'Endpoint URL', placeholder: 'https://example.com/hooks/plumo' },
        { name: 'events', kind: 'checks', label: 'Notify on', options: WEBHOOK_EVENTS },
        { name: 'secret', kind: 'text', label: 'Signing secret', helper: 'Optional. Each delivery is signed with it so you can verify us.' },
      ],
      initial: () => ({ url: '', events: [], secret: '' }),
      validate: (v) =>
        !v.url.trim() ? 'Endpoint URL is required'
        : !v.events.length ? 'Select at least one event' : '',
      submit: async (v) => {
        await api.webhooks.create({
          url: v.url.trim(), events: v.events, secret: v.secret.trim() || undefined,
        });
        await this.loadSettingsTab('hooks');
        return 'Endpoint added successfully';
      },
    },
  };

  CANNED_FIELDS = () => [
    { name: 'title', kind: 'text', label: 'Title', placeholder: 'Refund is on its way' },
    { name: 'body', kind: 'textarea', label: 'Message', placeholder: 'Hi {{name}}, …', helper: '{{name}} becomes the customer’s first name when it is inserted.' },
    { name: 'tags', kind: 'text', label: 'Tags', placeholder: 'billing, refund', helper: 'Comma separated. Optional.' },
    { name: 'teamId', kind: 'select', label: 'Team', options: this.teamChoices('Everyone') },
  ];

  cannedBody(v) {
    return {
      title: v.title.trim(),
      body: v.body,
      tags: v.tags.split(',').map((t) => t.trim()).filter(Boolean),
      // undefined, not null: teamId is @IsUUID and a global response is the
      // absence of a team, not a team called null.
      teamId: v.teamId || undefined,
    };
  }

  openEditor(kind, meta = {}) {
    const def = this.EDITORS[kind];
    if (!def) return;
    this.setState({
      editor: { kind, meta, values: def.initial(meta) }, editorBusy: false, editorError: '', menu: null,
    });
  }
  closeEditor = () => this.setState({ editor: null, editorBusy: false, editorError: '' });
  onEditorField = (e) => {
    // Read the element eagerly: the updater below runs later, and by then the
    // input's own value may have moved on.
    const el = e.currentTarget;
    const name = el.dataset.f;
    const box = el.type === 'checkbox';
    const value = el.value;
    const checked = el.checked;
    this.setState((s) => {
      if (!s.editor) return null;
      const cur = s.editor.values[name];
      const next = box
        ? (checked ? [...(cur || []), value] : (cur || []).filter((x) => x !== value))
        : value;
      return { editor: { ...s.editor, values: { ...s.editor.values, [name]: next } }, editorError: '' };
    });
  };
  submitEditor = async () => {
    const ed = this.state.editor;
    if (!ed) return;
    const def = this.EDITORS[ed.kind];
    const complaint = def.validate ? def.validate(ed.values) : '';
    if (complaint) { this.setState({ editorError: complaint }); return; }
    this.setState({ editorBusy: true, editorError: '' });
    try {
      const said = await def.submit(ed.values, ed.meta);
      this.setState({ editor: null, editorBusy: false });
      this.toast(said);
    } catch (e) {
      // Stay open and keep what they typed. Closing on failure is how a form
      // ends up looking like it saved.
      this.setState({ editorBusy: false, editorError: this.apiMessage(e) });
    }
  };

  /**
   * Row openers.
   *
   * Each reads the raw record the panel loaded, because the table row has
   * already been formatted for reading and cannot be turned back into a PATCH
   * body: "4h 30m" is not 270, and a tag's row id is its key rather than the
   * uuid the route wants. If the raw row is not there, say so instead of
   * sending something that would 400.
   */
  rawRow(tab, match) {
    const rows = this.state.settings[tab];
    if (!Array.isArray(rows)) return null;
    return rows.find(match) ?? null;
  }
  missingRow(tab) {
    this.toast(this.state.settingsErr[tab] || 'Still loading these. Please try again in a moment.', 'bad');
  }

  editUser = (e) => {
    const id = e.currentTarget.dataset.id;
    const a = (this.api?.agents || []).find((x) => x.id === id);
    if (!a) return;
    this.openEditor('user', { id, name: a.name, role: a.role, teamId: a.team || '' });
  };
  newSlaPolicy = () => this.openEditor('sla-new');
  editSlaPolicy = (e) => {
    const row = this.rawRow('sla', (p) => p.id === e.currentTarget.dataset.id);
    row ? this.openEditor('sla-edit', row) : this.missingRow('sla');
  };
  newCanned = () => this.openEditor('canned-new');
  editCanned = (e) => {
    const row = this.rawRow('canned', (r) => r.id === e.currentTarget.dataset.id);
    row ? this.openEditor('canned-edit', row) : this.missingRow('canned');
  };
  newTag = () => this.openEditor('tag-new');
  editTag = (e) => {
    const row = this.rawRow('tags', (t) => t.key === e.currentTarget.dataset.key);
    row ? this.openEditor('tag-edit', row) : this.missingRow('tags');
  };
  newWebhook = () => this.openEditor('hook-new');

  /* ---- business hours ---- */

  /** The one schedule row this desk keeps, once the panel has read it. */
  hoursRow() {
    const rows = this.state.settings.hours;
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  }
  async writeHours(patch, said) {
    const row = this.hoursRow();
    if (!row) { this.missingRow('hours'); return false; }
    this.setState({ hoursBusy: true });
    try {
      const next = await api.businessHours.patch(row.id, patch);
      this.setState((s) => ({
        settings: { ...s.settings, hours: [next, ...(s.settings.hours || []).slice(1)] },
        hoursBusy: false,
      }));
      if (said) this.toast(said);
      return true;
    } catch (e) {
      // The checkbox is bound to server state, so it snaps back on its own.
      this.setState({ hoursBusy: false });
      this.toast(this.apiMessage(e, 'Failed to update the schedule'), 'bad');
      return false;
    }
  }
  /**
   * Turn a working day on or off.
   *
   * The week is one json blob on one row, so a single day is a read-modify-write
   * of the whole thing. Turning a day back on reuses whatever window the rest of
   * the week keeps, rather than inventing 9–5 for a desk that works 8–4.
   */
  toggleHoursDay = (e) => {
    const { day } = e.currentTarget.dataset;
    const on = e.currentTarget.checked;
    const row = this.hoursRow();
    if (!row) { this.missingRow('hours'); return; }
    const weekly = { ...(row.weeklyJson || {}) };
    const sample = Object.values(weekly).find((w) => Array.isArray(w) && w.length) || [['09:00', '17:00']];
    weekly[day] = on ? [[...sample[0]]] : [];
    this.writeHours({ weeklyJson: weekly }, on ? 'That day counts again' : 'The clocks rest that day now');
  };
  onHolidayDraft = (e) => this.setState({ holidayDraft: e.target.value });
  addHoliday = async () => {
    const date = this.state.holidayDraft;
    if (!date) { this.toast('Please pick a date first', 'bad'); return; }
    const row = this.hoursRow();
    if (!row) { this.missingRow('hours'); return; }
    const list = Array.isArray(row.holidaysJson) ? row.holidaysJson : [];
    if (list.includes(date)) { this.toast('That day is already a holiday', 'bad'); return; }
    const ok = await this.writeHours({ holidaysJson: [...list, date].sort() }, 'Holiday added successfully');
    if (ok) this.setState({ holidayDraft: '' });
  };
  removeHoliday = (e) => {
    const { date } = e.currentTarget.dataset;
    const row = this.hoursRow();
    if (!row) { this.missingRow('hours'); return; }
    const list = (Array.isArray(row.holidaysJson) ? row.holidaysJson : []).filter((d) => d !== date);
    this.writeHours({ holidaysJson: list }, 'Holiday removed successfully');
  };

  /* ---- inbound address ---- */

  onInboundDraft = (e) => this.setState({ inboundDraft: e.target.value, inboundError: '' });
  saveInbound = async () => {
    const v = this.state.inboundDraft.trim();
    // An empty field means "switch the channel off", which the API takes as an
    // explicit null. It is deliberately not the same as omitting the field.
    const next = v === '' ? null : v;
    this.setState({ inboundBusy: true, inboundError: '' });
    try {
      const res = await api.email.setInboundAddress(next);
      this.setState((s) => ({
        settings: { ...s.settings, email: res },
        inboundDraft: res?.inboundEmail ?? '', inboundBusy: false,
      }));
      this.toast(res?.inboundEmail
        ? 'This desk now receives mail at ' + res.inboundEmail
        : 'Inbound mail is switched off for this desk');
    } catch (e) {
      this.setState({
        inboundBusy: false,
        inboundError: this.apiMessage(e, 'Failed to save that address'),
      });
    }
  };

  setSettingsTab = (e) => {
    const v = e.currentTarget.dataset.v;
    this.setState({ settingsTab: v, secret: null }, () => {
      if (v === 'team') this.loadInvites();
      this.loadSettingsTab(v);
    });
  };
  /** Value-form of setAvail — Segment hands us the next value directly. */
  pickAvail = (v) => this.applyAvail(v);
  setAvail = (e) => this.applyAvail(e.currentTarget.dataset.a);
  applyAvail(v) {
    if (v === this.state.avail) return;
    this.setState({ avail: v });
    this.api.setAvailability(v)
      .then(() => this.toast('You are now ' + v))
      .catch(() => this.setState({ avail: v === 'available' ? 'away' : 'available' }, () => this.toast('Failed to save changes. Please try again.', 'bad')));
  };
  toggleAvail = () => {
    const next = this.state.avail === 'available' ? 'away' : 'available';
    this.setState({ avail: next, menu: null });
    this.api.setAvailability(next)
      .then(() => this.toast('You are now ' + next))
      .catch(() => this.setState({ avail: next === 'available' ? 'away' : 'available' }, () => this.toast('Failed to save changes. Please try again.', 'bad')));
  };
  signOut = () => {
    this.api.logout().catch(() => {});
    this.setState({ loggedIn: false, menu: null, screen: 'queue', loginView: 'signin', loginPw: '' });
    this.pingService();
  };
  signIn = async () => {
    const email = this.state.loginEmail.trim();
    if (!email || !this.state.loginPw.trim()) { this.setState({ loginError: true }); return; }
    try {
      await this.api.login(email, this.state.loginPw, this.state.keepSignedIn);
      const me = await this.api.bootstrap();
      this.setState(
        { loggedIn: true, loginError: false, loginPw: '', role: me.role, avail: me.availability ?? 'available', notifs: this.api.notifications, screen: 'queue' },
        () => { this.loadQueue({ noFail: true }); this.loadCounts(); },
      );
    } catch (e) {
      // The error itself, not a boolean. Login.jsx's loginErrorMessage reads
      // `status` and `code` off it to tell a 429 and a switched-off membership
      // apart from a wrong password; setting `true` here discarded both and was
      // why every failure rendered the same sentence. `?? true` keeps the old
      // shape for a throw that carries nothing — that function takes either.
      this.setState({ loginError: e ?? true });
      if (e?.offline) this.toast('Network error. Please check your connection.', 'bad');
    }
  };
  onLoginEmail = (e) => this.setState({ loginEmail: e.target.value, loginError: false });
  onLoginPw = (e) => this.setState({ loginPw: e.target.value, loginError: false });
  togglePw = () => this.setState(s => ({ pwShown: !s.pwShown }));
  onQ = async (e) => {
    const q = e.target.value;
    this.setState({ q });
    if (!q) { this.#searchSeq++; this.setState({ results: null }); return; }
    // sequence guard: a slow response for "bil" must not overwrite "billing"
    const seq = ++this.#searchSeq;
    try {
      const r = await this.api.search(q);
      if (seq === this.#searchSeq) this.setState({ results: r });
    } catch (err) { }
  };
  #searchSeq = 0;
  onQFocus = () => { };
  onCustQ = (e) => this.setState({ custQ: e.target.value }, () => this.loadCustomers());
  focusSearch = () => { if (this.searchRef.current) this.searchRef.current.focus(); };

  onKey = (e) => {
    const el = e.target || {};
    const tag = (el.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || el.isContentEditable;
    if (e.key === 'Escape') {
      if (typing && el.blur) el.blur();
      this.setState({ menu: null, sheet: false, newT: false, results: null });
      return;
    }
    if (typing) return;
    const S = this.state;
    if (e.key === '/') { e.preventDefault(); this.focusSearch(); return; }
    if (e.key === '?') { e.preventDefault(); this.setState({ sheet: true }); return; }
    if (e.key === 'g') { this.keyBuf = 'g'; setTimeout(() => { this.keyBuf = ''; }, 900); return; }
    if (this.keyBuf === 'g') {
      this.keyBuf = '';
      if (e.key === 'i') { this.navTo('queue'); return; }
      if (e.key === 'm') { this.navTo('mine'); return; }
      if (e.key === 'c') { this.navTo('customers'); return; }
      if (e.key === 'r') { this.navTo('reports'); return; }
    }
    if (!S.loggedIn) return;
    if (e.key === 'n') { e.preventDefault(); this.openNewTicket(); return; }
    if (S.screen === 'queue') {
      if (e.key === 'j' || e.key === 'k') {
        e.preventDefault();
        const next = Math.max(0, Math.min(S.rows.length - 1, S.cursor + (e.key === 'j' ? 1 : -1)));
        this.setState({ cursor: next, hover: S.rows[next] ? S.rows[next].id : null });
        return;
      }
      const row = S.rows[S.cursor];
      if (!row) return;
      if (e.key === 'Enter') { e.preventDefault(); this.openTicket(row.id); return; }
      if (e.key === 'e') { e.preventDefault(); this.patch(row.id, { status: row.status === 'pending' ? 'open' : 'pending' }, 'status changed'); return; }
      if (e.key === 'a') { e.preventDefault(); this.patch(row.id, { assigneeId: this.me().id }, 'Assigned to you'); return; }
      if (e.key === 'x') { e.preventDefault(); this.setState(s => ({ sel: s.sel.includes(row.id) ? s.sel.filter(x => x !== row.id) : [...s.sel, row.id] })); return; }
    }
    if (S.screen === 'ticket' && S.ticket) {
      if (e.key === 'r') { e.preventDefault(); if (this.replyRef.current) this.replyRef.current.focus(); return; }
      if (e.key === 'e') { e.preventDefault(); this.setState({ menu: 'status' }); return; }
      if (e.key === 'a') { e.preventDefault(); this.setState({ menu: 'assignee' }); return; }
    }
  };

  renderVals() {
    const S = this.state, A = this.api;
    const me = this.me();
    const meView = {
      name: me.name, initials: this.initials(me.name), role: me.role, av: me.av, avail: S.avail,
      first: (me.name || '').split(' ')[0] || '', last: (me.name || '').split(' ').slice(1).join(' ') || '',
      availTone: S.avail === 'available' ? 'sla-met' : 'sla-paused',
      availAction: S.avail === 'available' ? 'Set yourself away' : 'Set yourself available',
    };
    const sel = S.sel;

    const rows = (S.rows || []).map((t) => {
      const c = this.cust(t.customerId), a = this.agent(t.assigneeId);
      const st = this.STATUS[t.status] || this.STATUS.open;
      const pr = this.PRIO[t.priority] || this.PRIO.normal;
      const sla = this.sla(t);
      return {
        id: t.id, num: t.num, subject: t.subject, snippet: t.snippet, unread: !!t.unread, status: t.status, tags: t.tags,
        statusLabel: st.l, statusTone: st.t, prioLabel: pr.l, prioTone: pr.t, prioGlyph: pr.g,
        custName: t.customerName ?? c.name, custOrg: t.customerOrg ?? this.orgName(c.org),
        assigneeName: a ? a.name : 'Unassigned', assigneeInitials: a ? this.initials(a.name) : '?', assigneeAv: a ? a.av : 'ghost',
        tagChips: (t.tags || []).slice(0, 2).map(g => ({ label: g, tone: this.TAGTONE[g] || 'neutral' })),
        hasMoreTags: (t.tags || []).length > 2, tagMore: '+' + ((t.tags || []).length - 2),
        slaLabel: sla.label, slaTone: sla.tone, slaTitle: sla.title,
        arcDash: (this.ARC[sla.tone] || this.ARC.neutral)[0], arcColor: (this.ARC[sla.tone] || this.ARC.neutral)[1],
        updated: this.rel(t.updatedAt), channelLabel: this.CHAN_LABEL[t.channel] || t.channel, channelGlyph: this.CHAN[t.channel] || '·',
        selected: sel.includes(t.id), hovered: S.hover === t.id,
      };
    });

    const fc = S.facets || { status: {}, priority: {}, channel: {}, tag: {} };
    const opt = (kind, id, label) => ({ id, label, count: (fc[kind] || {})[id] || 0, on: (S.f[kind] || []).includes(id) });
    const facetGroups = [
      { kind: 'status', label: 'Status', options: ['new', 'open', 'pending', 'on-hold', 'resolved', 'closed'].map(id => opt('status', id, (this.STATUS[id] || {}).l || id)) },
      { kind: 'priority', label: 'Priority', options: ['urgent', 'high', 'normal', 'low'].map(id => opt('priority', id, (this.PRIO[id] || {}).l || id)) },
      // Must track the Channel enum in prisma/schema.prisma. `chatbot` was added
      // for third-party bot ingest and missing here meant the one channel in
      // real use could not be filtered — every count read 0. `hashcare` was a
      // fictional customer in the original demo data and is not a channel
      // anybody has.
      { kind: 'channel', label: 'Channel', options: [['chatbot', 'Chatbot'], ['email', 'Email'], ['api', 'API'], ['widget', 'Widget']].map(p => opt('channel', p[0], p[1])) },
      { kind: 'tag', label: 'Tag', options: (A ? A.tags : []).map(t => ({ id: t.id, label: t.label, count: (fc.tag || {})[t.id] || 0, on: S.f.tag === t.id })) },
    ];
    const chips = [];
    const CHIP_LABEL = { status: (v) => (this.STATUS[v] || {}).l || v, priority: (v) => (this.PRIO[v] || {}).l || v };
    ['status', 'priority', 'channel'].forEach(k => (S.f[k] || []).forEach(v => chips.push({ kind: k, value: v, label: CHIP_LABEL[k] ? CHIP_LABEL[k](v) : v })));
    if (S.f.tag) chips.push({ kind: 'tag', value: S.f.tag, label: S.f.tag });
    if (S.f.team) chips.push({ kind: 'team', value: S.f.team, label: ((A ? A.teams : []).find(t => t.id === S.f.team) || {}).name || S.f.team });
    if (S.f.assignee) chips.push({ kind: 'assignee', value: S.f.assignee, label: S.f.assignee === '@unassigned' ? 'Unassigned' : ((this.agent(S.f.assignee) || {}).name || '') });
    if (S.f.range && S.f.range !== 'any') chips.push({ kind: 'range', value: S.f.range, label: S.f.range });

    const assigneeOptions = [
      { id: me.id, label: 'Me · ' + me.name.split(' ')[0], initials: this.initials(me.name), av: me.av, on: S.f.assignee === me.id },
      { id: '@unassigned', label: 'Unassigned', initials: '?', av: 'ghost', on: S.f.assignee === '@unassigned' },
    ].concat((A ? A.agents : []).filter(a => a.id !== me.id).slice(0, 5).map(a => ({ id: a.id, label: a.name, initials: this.initials(a.name), av: a.av, on: S.f.assignee === a.id })));

    const t = S.ticket;
    const tc = t ? (t.customerFull || this.cust(t.customerId)) : null;
    const ta = t ? this.agent(t.assigneeId) : null;
    const tsla = this.sla(t);
    // dueAt is genuinely null when no policy applies — which is every chatbot
    // conversation, since the human clock only starts at handoff. `null - now`
    // coerces null to 0 and reports a breach dated to the epoch: "overdue by
    // 20666d", "target 1 jan 01:00". Keep null null and let the labels below
    // decide.
    const frDue = t && t.sla.firstResponse.dueAt != null ? t.sla.firstResponse.dueAt : null;
    const resDue = t && t.sla.resolution.dueAt != null ? t.sla.resolution.dueAt : null;
    const frLeft = frDue != null ? frDue - S.now : null;
    const resLeft = resDue != null ? resDue - S.now : null;
    const thread = t ? t.thread.map(i => ({
      id: i.id, author: i.author, body: i.body || i.text || '', kind: i.kind, role: i.role,
      isBubble: i.kind !== 'event', sideKey: i.kind === 'note' ? 'note' : i.side,
      isMessage: i.kind === 'message', isNote: i.kind === 'note', isEvent: i.kind === 'event',
      isCustomer: i.kind === 'message' && i.side === 'customer', isAgentMsg: i.kind === 'message' && i.side === 'agent',
      initials: this.initials(i.author), av: i.side === 'agent' ? ((this.agent(i.authorId) || {}).av || 1) : (this.cust(i.authorId).av || 2),
      rel: this.rel(i.at), exact: this.clock(i.at), hasFiles: (i.attachments || []).length > 0, files: i.attachments || [],
      paras: (i.body || '').split('\n\n').map((p, n) => ({ id: i.id + 'p' + n, text: p })),
      side: i.side,
      pending: !!i.pending,
    })) : [];

    const agentList = (A ? A.agents : []).filter(a => !S.menuQ || a.name.toLowerCase().includes(S.menuQ.toLowerCase()))
      .map(a => ({ id: a.id, name: a.name, initials: this.initials(a.name), av: a.av, role: a.role, on: !!(t && t.assigneeId === a.id), availTone: a.avail === 'available' ? 'sla-met' : 'sla-paused' }));

    const custRows = (S.customers || []).map(c => ({ ...c, initials: this.initials(c.name), lastRel: c.lastContact ? this.rel(c.lastContact) : '—' }));
    const cust = S.customer;
    const custTickets = cust ? cust.tickets.map(x => ({
      id: x.id, num: x.num, subject: x.subject,
      statusLabel: (this.STATUS[x.status] || {}).l || x.status, statusTone: (this.STATUS[x.status] || {}).t || 'neutral',
      prioLabel: (this.PRIO[x.priority] || {}).l || x.priority, prioTone: (this.PRIO[x.priority] || {}).t || 'neutral',
      created: this.clock(x.createdAt), updated: this.rel(x.updatedAt),
    })) : [];

    // Pending only: an accepted invitation is a person in the table above, and a
    // revoked one is deliberately gone. Anything past its expiry is still shown
    // — it is the reason nobody arrived, and it can be replaced by re-inviting.
    const inviteRows = (S.invites || [])
      .filter((i) => i.status !== 'accepted' && i.status !== 'revoked')
      .map((i) => {
        const expired = i.status === 'expired' || (i.expiresAt != null && i.expiresAt <= S.now);
        return {
          id: i.id, email: i.email, role: i.role, invitedBy: i.invitedBy,
          sentRel: i.createdAt != null ? this.rel(i.createdAt) + ' ago' : '—',
          expiresLabel: expired ? 'expired' : this.until(i.expiresAt),
          expired, tone: expired ? 'sla-breach' : 'sla-paused',
        };
      });

    /**
     * The settings tables, built from the rows each panel loaded for itself,
     * falling back to the bootstrap caches until that first read lands so
     * nothing flashes empty. The raw rows are also what make the editors
     * possible at all: the adapter's copies are already formatted for reading
     * ("4h 30m", a tag keyed by its slug) and cannot be turned back into a
     * request body.
     */
    const stg = S.settings;
    const bh = Array.isArray(stg.hours) && stg.hours.length ? stg.hours[0] : null;
    const settingsRows = {
      slaRows: Array.isArray(stg.sla)
        ? stg.sla.filter((p) => p.isActive !== false).map((p) => ({
            id: p.id, name: p.name, priority: p.priority,
            firstResponse: FMT_MINS(p.firstResponseMins), resolution: FMT_MINS(p.resolutionMins),
            hours: p.businessHours ? 'business hours' : '24/7',
          }))
        : (A ? A.slaPolicies : []),
      hoursRows: bh
        ? DAY_KEYS.map(([key, day]) => {
            const w = (bh.weeklyJson || {})[key] || [];
            return { key, day, open: w.length ? w[0][0] : '—', close: w.length ? w[0][1] : '—', on: w.length > 0 };
          })
        : (A ? A.businessHours : []).map((d) => ({ ...d, key: '' })),
      cannedRows: Array.isArray(stg.canned)
        ? stg.canned.map((r) => ({
            id: r.id, title: r.title, team: r.team?.name ?? 'Everyone',
            tagList: (r.tags || []).join(', '), snippet: r.body.slice(0, 110) + '…',
          }))
        : (A ? A.cannedResponses : []).map(r => ({ id: r.id, title: r.title, team: r.team, tagList: r.tags.join(', '), snippet: r.body.slice(0, 110) + '…' })),
      tagRows: Array.isArray(stg.tags)
        ? stg.tags.map((t2) => ({
            id: t2.id, key: t2.key, label: t2.label,
            tone: this.TAGTONE[t2.key] || 'neutral', count: (fc.tag || {})[t2.key] || t2.count || 0,
          }))
        : (A ? A.tags : []).map(t2 => ({ id: t2.id, key: t2.id, label: t2.label, tone: t2.tone, count: (fc.tag || {})[t2.id] || 0 })),
      hookRows: Array.isArray(stg.hooks)
        ? stg.hooks.map((w) => ({
            id: w.id, url: w.url, events: (w.events || []).join(', '),
            status: HOOK_STATUS_LABEL[!w.isActive ? 'disabled' : w.lastDelivery?.status === 'failed' ? 'failing' : 'active'],
            last: w.lastDelivery ? this.rel(Date.parse(w.lastDelivery.createdAt)) + ' ago' : '—',
            tone: w.isActive && w.lastDelivery?.status !== 'failed' ? 'sla-met' : 'sla-breach',
          }))
        : (A ? A.webhooks : []).map(w => ({ id: w.id, url: w.url, events: w.events, status: HOOK_STATUS_LABEL[w.status] || w.status, last: w.last, tone: w.status === 'active' ? 'sla-met' : 'sla-breach' })),
    };
    const holidays = (bh && Array.isArray(bh.holidaysJson) ? bh.holidaysJson : []).map((d) => ({
      date: d,
      label: new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
    }));

    const ed = S.editor;
    const edDef = ed ? this.EDITORS[ed.kind] : null;

    const dd = (A && S.drill && A.drilldowns) ? A.drilldowns[S.drill] : null;
    const rep = A ? A.reports : { kpis: [], volume: [], byChannel: [], byAgent: [] };
    const maxVol = Math.max(1, ...rep.volume.map(v => Math.max(v.created, v.resolved)));
    const maxCh = Math.max(1, ...rep.byChannel.map(c => c.n));

    return {
      // Until the bootstrap resolves we know neither who you are nor whether
      // you are signed in, so neither branch below is safe to render. `booted`
      // gates both; before this the console guessed "signed in" and drew the
      // whole shell against empty data.
      isBooting: !S.booted, isLogin: S.booted && !S.loggedIn, inApp: S.booted && S.loggedIn,
      loginEmail: S.loginEmail, loginPw: S.loginPw, loginError: S.loginError,
      pwType: S.pwShown ? 'text' : 'password', pwToggleLabel: S.pwShown ? 'Hide' : 'Show',
      onLoginEmail: this.onLoginEmail, onLoginPw: this.onLoginPw, togglePw: this.togglePw, signIn: this.signIn, forgot: this.forgot,
      onLoginKey: this.onLoginKey, keepSignedIn: S.keepSignedIn, toggleKeepSignedIn: this.toggleKeepSignedIn,
      federated: this.federated, requestAccess: this.requestAccess, serviceUp: S.serviceUp,

      me: meView, go: this.go, signOut: this.signOut,
      canAdmin: S.role !== 'agent', toggleAvail: this.toggleAvail, openSheet: this.openSheet,
      themeAction: this.theme() === 'dark' ? 'Switch to light' : 'Switch to dark', toggleTheme: this.toggleTheme, toggleNav: this.toggleNav,
      navOn: S.nav,
      mobileNavOpen: S.mobileNav, openMobileNav: this.openMobileNav, closeMobileNav: this.closeMobileNav,
      mobileSearchOpen: S.mobileSearch, toggleMobileSearch: this.toggleMobileSearch,

      isQueue: S.screen === 'queue' && S.view !== 'my-open', isMine: S.screen === 'queue' && S.view === 'my-open',
      isQueueLike: S.screen === 'queue', isTicket: S.screen === 'ticket',
      isCustomers: S.screen === 'customers', isCustomer: S.screen === 'customer',
      isCustomersNav: S.screen === 'customers' || S.screen === 'customer',
      isReports: S.screen === 'reports', isSettings: S.screen === 'settings',

      q: S.q, onQ: this.onQ, onQFocus: this.onQFocus, searchRef: this.searchRef,
      searchOpen: !!(S.q && S.results),
      resTickets: (S.results ? S.results.tickets : []).map(r => ({ id: r.id, num: r.num, subject: r.subject, statusLabel: (this.STATUS[r.status] || {}).l, statusTone: (this.STATUS[r.status] || {}).t })),
      resCustomers: (S.results ? S.results.customers : []).map(c => ({ id: c.id, name: c.name, orgName: c.orgName, initials: this.initials(c.name), av: this.cust(c.id).av })),
      resNoTickets: !!(S.results && S.results.tickets.length === 0),
      openRow: this.openRow, openCustomer: this.openCustomer,

      notifOpen: S.menu === 'notif', toggleNotif: this.toggleNotif, readAllNotif: this.readAllNotif,
      hasUnreadNotif: S.notifs.some(n => n.unread),
      notifs: S.notifs.map(n => ({ id: n.id, text: n.text, unread: n.unread, rel: this.rel(n.at), tone: n.kind === 'sla' ? 'sla-breach' : n.kind === 'mention' ? 'st-open' : 'sla-met', glyph: n.kind === 'sla' ? '!' : n.kind === 'mention' ? '@' : '↦' })),

      cAll: S.counts['all-open'] || 0, cUn: S.counts.unassigned || 0, cMy: S.counts['my-open'] || 0,
      cBr: S.counts.breaching || 0, cPd: S.counts.pending || 0, cRe: S.counts.resolved || 0,
      cBot: S.counts['bot-handled'] || 0,
      vAll: S.view === 'all-open', vUn: S.view === 'unassigned', vMy: S.view === 'my-open', vBot: S.view === 'bot-handled',
      vBr: S.view === 'breaching', vPd: S.view === 'pending', vRe: S.view === 'resolved',
      onView: this.onView, saveView: this.saveView,
      sortLabel: (this.SORTS.find(x => x.id === S.sort) || {}).label,
      setSort: this.setSort, sortOptions: this.SORTS.map(o => ({ id: o.id, label: o.label, on: o.id === S.sort })),
      densityLabel: this.density(), cycleDensity: this.cycleDensity, toggleFilters: this.toggleFilters, filtersOn: S.filters, refresh: this.refresh,
      refreshedRel: this.rel(S.refreshed), loading: S.load === 'loading',

      facetGroups, chips, removeChip: this.removeChip, toggleFacet: this.toggleFacet, clearFilters: this.clearFilters,
      assigneeOptions, setAssigneeFilter: this.setAssigneeFilter,
      teamOptions: (A ? A.teams : []).map(x => ({ id: x.id, label: x.name, on: S.f.team === x.id })), setTeamFilter: this.setTeamFilter,
      rangeOptions: [['any', 'Any time'], ['today', 'Today'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days']].map(p => ({ id: p[0], label: p[1], on: S.f.range === p[0] })), setRange: this.setRange,

      rows, loadingRows: S.load === 'loading' && rows.length === 0, hasError: S.load === 'error',
      isEmpty: S.load === 'ok' && rows.length === 0,
      skeletons: [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => ({ id: 'sk' + n })),
      onRowEnter: this.onRowEnter, onRowLeave: this.onRowLeave, toggleSel: this.toggleSel, toggleAll: this.toggleAll, stop: this.stop,
      allSelected: rows.length > 0 && sel.length === rows.length,
      hasSelection: sel.length > 0, selCount: sel.length, clearSel: this.clearSel,
      quickAssign: this.quickAssign, quickStatus: this.quickStatus, quickOpen: this.quickOpen,
      bulkAssign: this.bulkAssign, bulkPending: this.bulkPending, bulkTag: this.bulkTag, bulkClose: this.bulkClose,
      pageLabel: S.total === 0 ? 'Nothing to show' : (S.page * S.pageSize + 1) + '–' + Math.min(S.total, (S.page + 1) * S.pageSize) + ' of ' + S.total,
      prevPage: this.prevPage, nextPage: this.nextPage,

      ticketLoading: S.ticketLoad === 'loading', ticketReady: S.ticketLoad === 'ok' && !!t,
      tNum: t ? t.num : '', tSubject: t ? t.subject : '', tStatus: t ? (this.STATUS[t.status] || {}).l : '',
      tStatusTone: t ? (this.STATUS[t.status] || {}).t : 'neutral', tPrio: t ? ((this.PRIO[t.priority] || {}).l || t.priority) : '',
      tPrioTone: t ? (this.PRIO[t.priority] || {}).t : 'neutral', tPrioGlyph: t ? (this.PRIO[t.priority] || {}).g : '',
      tTeam: t ? (((A ? A.teams : []).find(x => x.id === t.teamId) || {}).name || '') : '',
      tAssigneeName: ta ? ta.name : 'Unassigned', tAssigneeInitials: ta ? this.initials(ta.name) : '?', tAssigneeAv: ta ? ta.av : 'ghost',
      thread, tSlaLabel: tsla.label, tSlaTone: tsla.tone, tSlaTitle: tsla.title, tPaused: !!(t && t.sla.paused),
      frLabel: t ? (t.sla.firstResponse.metAt ? 'met ' + this.rel(t.sla.firstResponse.metAt) + ' ago' : frLeft == null ? 'no target' : (frLeft < 0 ? 'overdue by ' + this.dur(-frLeft) : 'due in ' + this.dur(frLeft))) : '',
      frTone: t ? (t.sla.firstResponse.metAt ? 'sla-met' : frLeft == null ? 'neutral' : t.sla.paused ? 'sla-paused' : frLeft < 0 ? 'sla-breach' : frLeft < 1800000 ? 'sla-due' : 'sla-ok') : 'neutral',
      frDue: t && t.sla.firstResponse.dueAt != null ? this.clock(t.sla.firstResponse.dueAt) : '—',
      resLabel: t ? (t.sla.resolution.metAt ? 'met ' + this.rel(t.sla.resolution.metAt) + ' ago' : resLeft == null ? 'no target' : (resLeft < 0 ? 'overdue by ' + this.dur(-resLeft) : 'due in ' + this.dur(resLeft))) : '',
      resTone: t ? (t.sla.resolution.metAt ? 'sla-met' : resLeft == null ? 'neutral' : t.sla.paused ? 'sla-paused' : resLeft < 0 ? 'sla-breach' : resLeft < 1800000 ? 'sla-due' : 'sla-ok') : 'neutral',
      resDue: t && t.sla.resolution.dueAt != null ? this.clock(t.sla.resolution.dueAt) : '—', slaPolicy: t ? t.sla.policy : '',
      tChannel: t ? (this.CHAN_LABEL[t.channel] || t.channel) : '', tCreated: t ? this.clock(t.createdAt) : '', tRequester: t ? t.requester : '',
      tCc: t && t.cc.length ? t.cc.join(', ') : '—', tSource: t && t.sourceRef ? t.sourceRef : '—', tId: t ? t.id : '',
      tTags: t ? t.tags.map(g => ({ id: g, label: g, tone: this.TAGTONE[g] || 'neutral' })) : [],
      tagAddOptions: (A ? A.tags : []).filter(x => !t || !t.tags.includes(x.id)).map(x => ({ id: x.id, label: x.label, tone: x.tone })),
      activity: t ? t.activity.map((x, n) => ({ id: 'ac' + n, who: x.who, what: x.what, rel: this.rel(x.at) })) : [],
      custName: tc ? tc.name : '', custInitials: tc ? this.initials(tc.name) : '', custAv: tc ? tc.av : 1,
      custEmail: tc ? tc.email : '', custOrg: tc ? this.orgName(tc.org) : '', custTz: tc ? tc.tz : '', custLocale: tc ? tc.locale : '',
      custId: tc ? tc.id : '',
      backToQueue: this.backToQueue, toggleRail: this.toggleRail, railOn: S.rail,
      ticketPane: S.ticketPane, setTicketPane: this.setTicketPane,
      remote: S.remote, reloadTicket: this.reloadTicket,
      // only chatbot conversations have an assistant to silence
      isBotConversation: !!(t && t.createdByApiKeyId),
      botEnabled: t ? t.botEnabled !== false : true,
      toggleBot: this.toggleBot,
      subjEdit: S.subjEdit, subjDraft: S.subjDraft, editSubject: this.editSubject, onSubjDraft: this.onSubjDraft, saveSubject: this.saveSubject, onSubjKey: this.onSubjKey,
      assigneeOpen: S.menu === 'assignee', cannedOpen: S.menu === 'canned',
      openAssigneeMenu: this.openAssigneeMenu, openCanned: this.openCanned,
      statusOptions: Object.keys(this.STATUS).map(id => ({ id, label: this.STATUS[id].l, tone: this.STATUS[id].t, on: !!(t && t.status === id) })),
      prioOptions: Object.keys(this.PRIO).map(id => ({ id, label: this.PRIO[id].l, tone: this.PRIO[id].t, glyph: this.PRIO[id].g, on: !!(t && t.priority === id) })),
      agentList, menuQ: S.menuQ, onMenuQ: this.onMenuQ,
      teamList: (A ? A.teams : []).map(x => ({ id: x.id, label: x.name, on: !!(t && t.teamId === x.id) })),
      setStatus: this.setStatus, setPriority: this.setPriority, setAssignee: this.setAssignee, assignMe: this.assignMe, unassign: this.unassign,
      setTeam: this.setTeam, addTag: this.addTag, removeTag: this.removeTag,
      askDelete: this.askDelete, askSpam: this.askSpam, copyLink: this.copyLink, mergeTicket: this.mergeTicket,

      subjNotEdit: !S.subjEdit, threadRef: this.threadRef, mock: this.mock,
      composerKey: S.mode === 'note' ? 'note' : 'reply',
      composerPlaceholder: S.mode === 'note' ? 'A note for your team. The customer never sees this…' : 'Write your reply…',
      cannedFiltered: (A ? A.cannedResponses : []).filter(r => !S.menuQ || (r.title + r.body).toLowerCase().includes(S.menuQ.toLowerCase())).map(r => ({ id: r.id, title: r.title, team: r.team, snippet: r.body.slice(0, 92) + '…' })),
      isReply: S.mode === 'reply', isNote: S.mode === 'note', setMode: this.setMode,
      draft: S.draft, onDraft: this.onDraft, replyRef: this.replyRef, sending: S.sending,
      sendLabel: S.mode === 'note' ? 'Add note' : 'Send',
      canned: (A ? A.cannedResponses : []).map(r => ({ id: r.id, title: r.title, team: r.team, snippet: r.body.slice(0, 92) + '…' })), insertCanned: this.insertCanned,
      onSend: this.onSend, onSendPending: this.onSendPending, onSendResolved: this.onSendResolved,

      custRows, custQ: S.custQ, onCustQ: this.onCustQ,
      cName: cust ? cust.name : '', cInitials: cust ? this.initials(cust.name) : '', cAv: cust ? cust.av : 1,
      cEmail: cust ? cust.email : '', cOrg: cust ? cust.orgName : '', cPhone: cust ? cust.phone : '', cTz: cust ? cust.tz : '',
      cTotal: cust ? cust.stats.total : 0, cOpen: cust ? cust.stats.open : 0, cAvg: cust ? cust.stats.avgResolution : '',
      cLastSeen: cust && cust.stats.lastSeen ? this.rel(cust.stats.lastSeen) : '—', custTickets, customerReady: !!cust,

      kpis: rep.kpis,
      volume: rep.volume.map(v => {
        const hC = Math.round(v.created / maxVol * 96), hR = Math.round(v.resolved / maxVol * 96);
        return { d: v.d, created: v.created, resolved: v.resolved, hC, hR, yC: 100 - hC, yR: 100 - hR };
      }),
      byChannel: rep.byChannel.map(c => ({ label: c.label, n: c.n, wn: Math.round(c.n / maxCh * 100) })),
      byAgent: rep.byAgent.map(a => ({ id: a.id, name: a.name, open: a.open, resolved: a.resolved, avg: a.avg, initials: this.initials(a.name), av: (this.agent(a.id) || {}).av || 1 })),

      availOn: S.avail === 'available', availOff: S.avail !== 'available', setAvail: this.setAvail, pickAvail: this.pickAvail,
      saveName: this.saveName, savePassword: this.savePassword,
      pwCur: S.pwCur, pwNew: S.pwNew, pwConfirm: S.pwConfirm,
      onPwCur: this.onPwCur, onPwNew: this.onPwNew, onPwConfirm: this.onPwConfirm,
      isSignin: S.loginView === 'signin', isReset: S.loginView === 'reset', isSent: S.loginView === 'sent',
      sendReset: this.sendReset, backToSignin: this.backToSignin,
      isAccount: S.screen === 'account', openAccount: this.openAccount,
      isNotFound: S.screen === 'notfound', isOops: S.screen === 'oops',
      tabOverview: S.settingsTab === 'overview', settingsCards: this.SETTINGS_CARDS,
      // Linking this desk to a Plumo PM workspace. `pmAvailable` is false on a
      // deployment with no PM_ISSUER configured, in which case the panel is not
      // rendered at all rather than shown broken.
      pmAvailable: S.pm?.available === true, pmLinked: S.pm?.linked === true,
      pmBusy: !!S.pmBusy, pmNotice: S.pmNotice || '',
      pmSignInAvailable: S.pmSignInAvailable === true, pmSignInBusy: !!S.pmSignInBusy,
      pmSignInError: S.pmSignInError || '', signInWithPm: this.signInWithPm,
      connectPm: this.connectPm, disconnectPm: this.disconnectPm,
      drillOpen: !!S.drill, noDrill: !S.drill, setDrill: this.setDrill, clearDrill: this.clearDrill,
      drillTitle: dd ? dd.title : '', drillValue: dd ? dd.value : '', drillNote: dd ? dd.note : '', drillAxis: dd ? dd.axis : '',
      drillPoints: dd ? dd.series.map((v, i) => (i / (dd.series.length - 1) * 100).toFixed(1) + ',' + (36 - (v - Math.min(...dd.series)) / ((Math.max(...dd.series) - Math.min(...dd.series)) || 1) * 32).toFixed(1)).join(' ') : '',
      drillFirst: dd ? dd.series[0] : '', drillLast: dd ? dd.series[dd.series.length - 1] : '',
      // Math.max(1, …) guards a quiet week: an all-zero breakdown would give NaN widths
      drillBreakdown: dd ? dd.breakdown.map(b => ({ label: b.label, n: b.n, wn: Math.round(b.n / Math.max(1, ...dd.breakdown.map(x => x.n)) * 100) })) : [],
      drillTickets: dd ? (dd.tickets ?? []).map(x => ({ num: x.num, subject: x.subject, id: x.id ?? 'tk' + x.num, statusLabel: (this.STATUS[x.status] || {}).l, statusTone: (this.STATUS[x.status] || {}).t })) : [],
      settingsTab: S.settingsTab, setSettingsTab: this.setSettingsTab,
      // Leaf crumb for the settings breadcrumb. Empty on the overview tab, which
      // is the section root and so is already named by the crumb above it.
      settingsTabLabel: (this.SETTINGS_CARDS.find(c => c.v === S.settingsTab) || {}).name || '',
      tabTeam: S.settingsTab === 'team', tabSla: S.settingsTab === 'sla', tabHours: S.settingsTab === 'hours',
      tabCanned: S.settingsTab === 'canned', tabTags: S.settingsTab === 'tags', tabHooks: S.settingsTab === 'hooks',
      tabKeys: S.settingsTab === 'keys', tabEmail: S.settingsTab === 'email',
      teamRows: (A ? A.agents : []).map(a => ({ id: a.id, name: a.name, email: a.email, role: a.role, av: a.av, initials: this.initials(a.name), teamName: ((A ? A.teams : []).find(t2 => t2.id === a.team) || {}).name, avail: a.avail, lastRel: a.lastActive < 60 ? a.lastActive + 'm ago' : Math.round(a.lastActive / 60) + 'h ago', availTone: a.avail === 'available' ? 'sla-met' : 'sla-paused',
        // Both writes are @Roles('admin'), so offering them to a lead would be
        // offering them a 403. Never on your own row: the backend has no
        // self-guard, and deactivating yourself revokes your own tokens.
        canEdit: S.role === 'admin', canDeactivate: S.role === 'admin' && a.id !== me.id,
      })),
      ...settingsRows,
      keyRows: A ? A.apiKeys : [],
      secret: S.secret, hasSecret: !!S.secret, copySecret: this.copySecret,
      keyName: S.keyName, onKeyName: this.onKeyName,
      keyKind: S.keyKind, setKeyKind: this.setKeyKind,
      keyKinds: Object.entries(this.KEY_KINDS).map(([id, k]) => ({ id, ...k, on: S.keyKind === id })),
      revokeKey: this.revokeKey, genKey: this.genKey, hideKey: this.hideKey,

      /* settings writes. Everything here replaced a V.mock — see the block
         above setSettingsTab. The write endpoints are @Roles('admin') except
         canned responses, which leads may manage for their own team, so the
         controls are offered on exactly those terms rather than offered to
         everyone and refused by the server. */
      canManageDesk: S.role === 'admin', canManageCanned: S.role !== 'agent',
      editUser: this.editUser, askDeactivate: this.askDeactivate,
      newSlaPolicy: this.newSlaPolicy, editSlaPolicy: this.editSlaPolicy,
      newCanned: this.newCanned, editCanned: this.editCanned,
      newTag: this.newTag, editTag: this.editTag, newWebhook: this.newWebhook,
      slaErr: S.settingsErr.sla || '', hoursErr: S.settingsErr.hours || '',
      cannedErr: S.settingsErr.canned || '', tagsErr: S.settingsErr.tags || '',
      hooksErr: S.settingsErr.hooks || '', emailErr: S.settingsErr.email || '',

      editorOpen: !!ed, editorTitle: ed && edDef ? edDef.title(ed.meta) : '',
      editorOk: ed && edDef ? edDef.ok : '', editorNote: ed && edDef ? edDef.note || '' : '',
      editorError: S.editorError, editorBusy: !!S.editorBusy,
      editorFields: ed && edDef
        ? edDef.fields(ed.meta).map((f) => ({
            ...f,
            value: ed.values[f.name] ?? '',
            options: (f.options || []).map((o) => ({
              ...o,
              on: f.kind === 'checks'
                ? (ed.values[f.name] || []).includes(o.value)
                : o.value === ed.values[f.name],
            })),
          }))
        : [],
      closeEditor: this.closeEditor, submitEditor: this.submitEditor, onEditorField: this.onEditorField,

      hoursReady: !!bh, hoursBusy: !!S.hoursBusy, toggleHoursDay: this.toggleHoursDay,
      holidays, hasHolidays: holidays.length > 0, holidayDraft: S.holidayDraft,
      onHolidayDraft: this.onHolidayDraft, addHoliday: this.addHoliday, removeHoliday: this.removeHoliday,

      inboundDraft: S.inboundDraft, onInboundDraft: this.onInboundDraft, saveInbound: this.saveInbound,
      inboundBusy: !!S.inboundBusy, inboundError: S.inboundError || '',
      inboundOn: !!(stg.email && stg.email.inboundEmail),

      // invitations. `canInvite` is admin and only admin — the endpoints are,
      // so offering the button to a lead would be offering them a 403.
      canInvite: S.role === 'admin',
      inviteOpen: S.inviteOpen, openInvite: this.openInvite, closeInvite: this.closeInvite,
      inviteEmail: S.inviteEmail, onInviteEmail: this.onInviteEmail, onInviteKey: this.onInviteKey,
      inviteRole: S.inviteRole, onInviteRole: this.onInviteRole,
      inviteTeam: S.inviteTeam, onInviteTeam: this.onInviteTeam,
      inviteBusy: !!S.inviteBusy, inviteError: S.inviteError || '',
      submitInvite: this.submitInvite, revokeInvite: this.revokeInvite,
      inviteRoleOptions: this.ROLE_OPTIONS,
      inviteTeamOptions: [{ value: '', label: 'No team for now' }].concat(
        (A ? A.teams : []).map((x) => ({ value: x.id, label: x.name })),
      ),
      inviteRows, hasInvites: inviteRows.length > 0,
      invitesLoading: S.invitesLoad === 'loading', invitesFailed: S.invitesLoad === 'error',

      sheet: S.sheet, closeSheet: this.closeSheet,
      newT: S.newT, closeNewTicket: this.closeNewTicket, openNewTicket: this.openNewTicket,
      newSubject: S.newSubject, newBody: S.newBody, newCustomer: S.newCustomer, submitNew: this.submitNew,
      newSubjectError: S.newError?.field === 'subject' ? S.newError.text : '',
      newCustomerError: S.newError?.field === 'customer' ? S.newError.text : '',
      onNewSubject: this.onNewSubject, onNewBody: this.onNewBody, onNewCustomer: this.onNewCustomer, onNewPriority: this.onNewPriority,
      newPriorityOptions: Object.keys(this.PRIO).map(id => ({ id, label: this.PRIO[id].l, on: S.newPriority === id })),
      customerOptions: (A ? A.customers : []).map(c => ({ id: c.id, label: c.name + ' · ' + this.orgName(c.org) })),
    };
  }

  render() {
    const V = this.renderVals();
    return (
      <>
        {V.isBooting && (
          <div className="h-screen flex items-center justify-center bg-bg">
            <LogoLoader />
          </div>
        )}
        {V.isLogin && <Login V={V} />}
        {V.inApp && (
          <div className="h-screen flex flex-col overflow-hidden bg-bg text-fg">
            <Header V={V} />
            <div className="flex-1 flex min-h-0">
              {/* Desktop rail. PM keeps it out of the flow entirely below `md`
                  (`DashboardLayout.tsx:76-80`) rather than shrinking it, and
                  wraps it in a `relative` box with no `overflow-hidden` so the
                  collapse handle can straddle the rail's right edge. */}
              <div className="relative hidden md:flex">
                <Sidebar V={V} />
                {/* PM `DashboardLayout.tsx:82-105`, verbatim apart from the
                    label and the flip condition. CS's collapse used to live on
                    the header's hamburger; the hamburger is `md:hidden` now and
                    belongs to the drawer, so the desktop control moves to PM's
                    own affordance instead of disappearing. */}
                <button
                  type="button"
                  onClick={V.toggleNav}
                  aria-label={V.navOn ? 'collapse sidebar' : 'expand sidebar'}
                  title={V.navOn ? 'collapse sidebar' : 'expand sidebar'}
                  className="group absolute left-full top-1/2 z-20 flex h-7 w-7 items-center justify-center rounded-full border border-[color:var(--border-strong)] bg-surface text-fg-2 shadow-sm transition-colors hover:border-[color:var(--primary)] hover:bg-[color:var(--primary-soft)] hover:text-[color:var(--primary)]"
                  style={{ transform: 'translate(-50%, -50%)' }}
                >
                  <svg
                    className={'h-3.5 w-3.5 transition-transform duration-200 ' + (V.navOn ? '' : 'rotate-180')}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.2}
                    aria-hidden
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
              </div>

              {/* Mobile drawer + scrim, PM `DashboardLayout.tsx:108-124`. */}
              {V.mobileNavOpen && (
                <>
                  <div
                    className="fixed inset-0 bg-black/50 z-modal-backdrop md:hidden animate-fade-in"
                    onClick={V.closeMobileNav}
                  />
                  <div className="fixed inset-y-0 left-0 w-72 z-modal md:hidden animate-fade-in">
                    <Sidebar V={V} isMobile />
                  </div>
                </>
              )}

              <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
                {V.isQueueLike && <Queue V={V} />}
                {V.isTicket && <Ticket V={V} />}
                {V.isCustomers && <Customers V={V} />}
                {V.isCustomer && <CustomerProfile V={V} />}
                {V.isReports && <Reports V={V} />}
                {V.isAccount && <Account V={V} />}
                {V.isNotFound && <NotFound V={V} />}
                {V.isOops && <Oops V={V} />}
                {V.isSettings && <Settings V={V} />}
              </main>
            </div>
          </div>
        )}
        <Overlays V={V} />
      </>
    );
  }
}
