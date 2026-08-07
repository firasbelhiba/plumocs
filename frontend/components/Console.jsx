'use client';

import React from 'react';
import { adapter } from '@/lib/api/adapter';
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
import { sx } from './sx';

export default class Console extends React.Component {
  STATUS = {
    new: { l: 'new', t: 'st-new' }, open: { l: 'open', t: 'st-open' },
    pending: { l: 'pending', t: 'st-pending' }, 'on-hold': { l: 'on hold', t: 'st-hold' },
    resolved: { l: 'resolved', t: 'st-resolved' }, closed: { l: 'closed', t: 'st-closed' },
  };
  PRIO = {
    low: { l: 'low', t: 'pr-low', g: '·' }, normal: { l: 'normal', t: 'pr-normal', g: '·' },
    high: { l: 'high', t: 'pr-high', g: '↑' }, urgent: { l: 'urgent', t: 'pr-urgent', g: '⚑' },
  };
  CHAN = { email: '✉', api: '⌗', widget: '◲', hashcare: '✚' };
  TAGTONE = { billing: 'tag-billing', bug: 'tag-bug', 'how-to': 'tag-howto', account: 'tag-account', urgent: 'tag-urgent', integration: 'tag-integration' };
  SORTS = [{ id: 'updated', label: 'last updated' }, { id: 'created', label: 'created' }, { id: 'priority', label: 'priority' }, { id: 'sla', label: 'sla due' }];
  SOFT = ['soft', 'balanced', 'dense'];
  ARC = { 'sla-ok': ['72 100', '#B8CFB4'], 'sla-due': ['30 100', '#FFE8A3'], 'sla-breach': ['8 100', '#FFD4B8'], 'sla-met': ['100 100', '#B8CFB4'], 'sla-paused': ['45 100', '#E2E8F0'], neutral: ['0 100', '#E2E8F0'] };

  state = {
    booted: false, loggedIn: true, screen: 'queue',
    theme: 'light', soft: 'balanced', role: 'agent', avail: 'available',
    nav: true, filters: true, rail: true,
    view: 'all-open', sort: 'updated', page: 0,
    f: { status: [], priority: [], channel: [], tag: null, team: null, assignee: null, range: 'any' },
    rows: [], total: 0, pageSize: 25, counts: {}, facets: { status: {}, priority: {}, channel: {}, tag: {} },
    load: 'loading', sel: [], hover: null, cursor: 0,
    ticket: null, ticketLoad: 'idle', remote: false,
    mode: 'reply', draft: '', sending: false, subjEdit: false, subjDraft: '',
    customers: [], customer: null, custQ: '',
    settingsTab: 'overview', menu: null, menuQ: '',
    q: '', results: null,
    toasts: [], confirm: null, sheet: false, newT: false,
    newSubject: '', newCustomer: '', newPriority: 'normal', newBody: '',
    notifs: [], secret: null,
    loginEmail: '', loginPw: '', loginError: false, pwShown: false, loginView: 'signin', drill: null,
    now: Date.now(), refreshed: Date.now(), failMode: false,
    pwCur: '', pwNew: '', pwConfirm: '', reportsAt: 0,
    keepSignedIn: true, serviceUp: true,
    keyName: '', keyKind: 'chatbot',
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
    this.toast(`${provider} sign-in isn't set up on this instance yet — use your email and password`, 'bad');
  };
  requestAccess = () => this.toast('ask an admin to invite you — they can add you from settings › team & users');
  saveName = (e) => {
    const v = (e.target.value || '').trim();
    if (!v || v === this.me().name) return;
    this.api.updateName(v)
      .then(() => { this.toast('name updated ✿'); this.setState({}); })
      .catch(() => this.toast("that didn't save — try again in a moment", 'bad'));
  };
  onPwCur = (e) => this.setState({ pwCur: e.target.value });
  onPwNew = (e) => this.setState({ pwNew: e.target.value });
  onPwConfirm = (e) => this.setState({ pwConfirm: e.target.value });
  savePassword = () => {
    const { pwCur, pwNew, pwConfirm } = this.state;
    if (!pwNew || pwNew.length < 8) { this.toast('the new password needs at least 8 characters', 'bad'); return; }
    if (pwNew !== pwConfirm) { this.toast("those two don't match — try once more", 'bad'); return; }
    this.api.changePassword(pwCur, pwNew)
      .then(() => { this.setState({ pwCur: '', pwNew: '', pwConfirm: '' }); this.toast("password changed — you're still signed in ✿"); })
      .catch((e) => this.toast(e?.status === 401 ? "the current password isn't right" : "couldn't change it — try again in a moment", 'bad'));
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
      this.setState({ pmSignInBusy: false, pmSignInError: e?.message || 'could not reach plumo' });
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
      .catch((e) => this.setState({ booted: true, loggedIn: false, pmSignInError: e?.message || 'plumo sign-in failed' }));
    return true;
  };

  connectPm = async () => {
    this.setState({ pmBusy: true, pmNotice: '' });
    try {
      const { authorizationUrl } = await api.pm.start(window.location.pathname);
      window.location.assign(authorizationUrl);
    } catch (e) {
      this.setState({ pmBusy: false, pmNotice: e?.message || 'could not reach plumo' });
    }
  };

  disconnectPm = async () => {
    this.setState({ pmBusy: true, pmNotice: '' });
    try {
      await api.pm.unlink();
      this.setState({ pm: { ...(this.state.pm || {}), linked: false }, pmBusy: false, pmNotice: 'disconnected from plumo' });
    } catch (e) {
      this.setState({ pmBusy: false, pmNotice: e?.message || 'could not disconnect' });
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
          signIn === 'cancelled' ? 'plumo sign-in was cancelled' : q.get('reason') || 'plumo sign-in failed',
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
      outcome === 'ok' ? (ws ? `connected to plumo — this desk is linked to ${ws}` : 'connected to plumo')
      : outcome === 'cancelled' ? 'plumo sign-in was cancelled'
      : outcome === 'invalid' ? 'that plumo link was incomplete'
      : `could not connect: ${q.get('reason') || 'unknown error'}`;
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
    { v: 'team', name: 'team & users', meta: '8 people · 2 teams', blurb: 'who is here, what they can reach, and who is available right now.' },
    { v: 'sla', name: 'sla policies', meta: '3 policies', blurb: 'response and resolution targets, by priority.' },
    { v: 'hours', name: 'business hours', meta: 'mon–fri · europe/lisbon', blurb: 'when the clocks run, and the days they rest.' },
    { v: 'canned', name: 'canned responses', meta: '5 saved', blurb: 'words worth keeping, so nobody writes them twice.' },
    { v: 'tags', name: 'tags', meta: '6 tags', blurb: 'how tickets get sorted, and the colours they wear.' },
    { v: 'hooks', name: 'webhooks', meta: '3 endpoints · 1 failing', blurb: 'where plumo tells other systems what happened.' },
    { v: 'keys', name: 'api keys', meta: '3 keys', blurb: 'secrets, kept softly — shown once and never again.' },
    { v: 'email', name: 'email & channels', meta: '3 connected', blurb: 'where conversations arrive, and who they look like they are from.' },
  ];

  searchRef = React.createRef();
  replyRef = React.createRef();
  threadRef = React.createRef();
  mock = (e) => this.toast((e.currentTarget.dataset || {}).msg || 'noted ✿');
  askMock = (e) => {
    const d = e.currentTarget.dataset;
    this.setState({ confirm: { title: d.title, body: d.body, ok: d.ok, tone: d.tone || 'warn', action: () => { this.setState({ confirm: null }); this.toast(d.msg || 'done ✿'); } } });
  };
  keyBuf = '';

  async componentDidMount() {
    const p = this.props || {};
    const seed = {};
    if (p.theme) seed.theme = p.theme;
    if (p.softness) seed.soft = p.softness;
    if (p.simulateFailures) seed.failMode = true;
    if (p.startScreen && p.startScreen !== 'ticket' && p.startScreen !== 'login') seed.screen = p.startScreen;
    if (Object.keys(seed).length) this.setState(seed);
    this.syncDoc(seed.theme || this.state.theme, seed.soft || this.state.soft);
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
      if (e?.offline) this.toast("can't reach the server — is the backend running?", 'bad');
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
  syncDoc(theme, soft) {
    const r = document.documentElement;
    r.dataset.csTheme = theme || this.state.theme;
    r.dataset.csSoft = soft || this.state.soft;
    r.dataset.csNav = this.state.nav ? 'on' : 'off';
    r.dataset.csRail = this.state.rail ? 'on' : 'off';
    r.dataset.csFilters = this.state.filters ? 'on' : 'off';
    const accent = (this.props || {}).accent;
    r.style.removeProperty('--cs-brand');
    if (accent) r.style.setProperty('--cs-accent-src', accent);
  }

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
  dur(ms) {
    const s = Math.floor(ms / 1000), m = Math.floor(s / 60);
    if (m < 60) return m + 'm ' + String(s % 60).padStart(2, '0') + 's';
    const h = Math.floor(m / 60);
    if (h < 48) return h + 'h ' + String(m % 60).padStart(2, '0') + 'm';
    return Math.floor(h / 24) + 'd';
  }
  clock(at) { return new Date(at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).toLowerCase(); }
  sla(t) {
    if (!t) return { label: '—', tone: 'neutral', title: '' };
    if (t.status === 'resolved' || t.status === 'closed') return { label: 'met', tone: 'sla-met', title: 'closed within target' };
    if (t.sla.paused) return { label: 'paused', tone: 'sla-paused', title: 'clock paused while pending' };
    const fr = t.sla.firstResponse, res = t.sla.resolution;
    const first = fr.metAt == null;
    const due = first ? fr.dueAt : res.dueAt;
    // no policy attached — nothing to count down
    if (due == null) return { label: '—', tone: 'neutral', title: 'no sla policy applies' };
    const left = due - this.state.now;
    const d = this.dur(Math.abs(left));
    const what = first ? 'first response' : 'resolution';
    if (left < 0) return { label: '−' + d, tone: 'sla-breach', title: what + ' overdue by ' + d };
    if (left <= 1800000) return { label: d, tone: 'sla-due', title: what + ' due in ' + d };
    return { label: d, tone: 'sla-ok', title: what + ' due ' + this.clock(due) };
  }
  cust(id) { return (this.api ? this.api.customers.find(c => c.id === id) : null) || { name: '—', org: '', av: 1 }; }
  orgName(id) { return this.api ? this.api.meta.orgName(id) : '—'; }
  agent(id) { return this.api ? this.api.agents.find(a => a.id === id) : null; }
  toast(text, tone) {
    const id = 'ts' + Date.now() + Math.random();
    this.setState(s => ({ toasts: [...s.toasts, { id, text, tone: tone || 'ok' }] }));
    setTimeout(() => this.setState(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), 3600);
  }
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
  navTo(screen) {
    if (this.dirty() && this.state.screen === 'ticket') {
      this.setState({
        confirm: {
          title: 'leave this reply behind?', body: "you've written something that hasn't been sent yet. it'll still be here if you stay.",
          ok: 'leave anyway', tone: 'warn', action: () => { this.setState({ draft: '' }); this.reallyNav(screen); },
        }
      });
      return;
    }
    this.reallyNav(screen);
  }
  reallyNav(screen) {
    const patch = { screen, menu: null, confirm: null, sel: [] };
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
      this.toast(next ? 'the assistant can reply again' : 'the assistant is silenced — this one is yours');
    } catch {
      this.setState((st) => (st.ticket ? { ticket: { ...st.ticket, botEnabled: !next } } : null));
      this.toast("couldn't change that — try again in a moment", 'bad');
    }
  };

  backToQueue = () => { this.navTo('queue'); };
  openCustomer = async (e) => {
    const id = e.currentTarget.dataset.id;
    this.setState({ screen: 'customer', customer: null, q: '', results: null, menu: null });
    try { this.setState({ customer: await this.api.getCustomer(id) }); } catch (err) { }
  };

  onView = (e) => { this.setState({ view: e.currentTarget.dataset.v, page: 0, sel: [] }, () => this.loadQueue({ noFail: true })); };
  toggleSort = () => this.setState(s => ({ menu: s.menu === 'sort' ? null : 'sort' }));
  setSort = (e) => { this.setState({ sort: e.currentTarget.dataset.v, menu: null }, () => this.loadQueue({ noFail: true })); };
  cycleSoft = () => this.setSoft(this.SOFT[(this.SOFT.indexOf(this.state.soft) + 1) % 3]);
  setSoft(v) { this.setState({ soft: v }, () => this.syncDoc()); }
  setTheme(v) { this.setState({ theme: v }, () => this.syncDoc()); }
  toggleTheme = () => this.setTheme(this.state.theme === 'dark' ? 'light' : 'dark');
  toggleNav = () => this.setState(s => ({ nav: !s.nav }), () => this.syncDoc());
  toggleFilters = () => this.setState(s => ({ filters: !s.filters }), () => this.syncDoc());
  toggleRail = () => this.setState(s => ({ rail: !s.rail }), () => this.syncDoc());
  refresh = () => this.loadQueue({ noFail: true });
  saveView = () => this.toast("view saved — it's in your tabs now ✿");
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
  quickAssign = (e) => { e.stopPropagation(); this.patch(e.currentTarget.dataset.id, { assigneeId: this.me().id }, 'assigned to you'); };
  quickStatus = (e) => { e.stopPropagation(); this.patch(e.currentTarget.dataset.id, { status: 'pending' }, 'set to pending'); };
  quickOpen = (e) => { e.stopPropagation(); this.openTicket(e.currentTarget.dataset.id); };
  bulkAssign = () => this.bulk({ assigneeId: this.me().id }, 'assigned to you');
  bulkPending = () => this.bulk({ status: 'pending' }, 'set to pending');
  bulkTag = () => {
    const ids = this.state.sel, rows = this.state.rows;
    this.setState(s => ({ rows: s.rows.map(r => ids.includes(r.id) && !r.tags.includes('urgent') ? { ...r, tags: [...r.tags, 'urgent'] } : r), sel: [] }));
    ids.forEach(id => { const r = rows.find(x => x.id === id); if (r) this.api.patchTicket(id, { tags: Array.from(new Set([...r.tags, 'urgent'])) }); });
    this.toast(ids.length + ' flagged for a look ✿');
  };
  bulkClose = () => {
    const n = this.state.sel.length;
    this.setState({
      confirm: {
        title: 'close ' + n + ' ' + (n === 1 ? 'conversation' : 'conversations') + '?',
        body: "the people on the other end will hear it's wrapped up. they can reopen anytime — nothing is final here.",
        ok: 'close them', tone: 'warn', action: () => this.bulk({ status: 'closed' }, n + ' closed quietly — reopen anytime'),
      }
    });
  };
  async bulk(patch, label) {
    const ids = this.state.sel, prev = this.state.rows;
    this.setState(s => ({ rows: s.rows.map(r => ids.includes(r.id) ? { ...r, ...patch, updatedAt: Date.now() } : r), sel: [], confirm: null }));
    try {
      if (this.state.failMode) this.api.simulateNextFailure();
      await Promise.all(ids.map(id => this.api.patchTicket(id, patch)));
      this.toast(label + ' ✿'); this.loadCounts();
    } catch (e) { this.setState({ rows: prev }); this.toast("that didn't stick — your work is safe, try again in a moment", 'bad'); }
  }

  async patch(id, patch, label) {
    const prevRows = this.state.rows, prevT = this.state.ticket;
    const applied = { ...patch, updatedAt: Date.now() };
    this.setState(s => ({
      rows: s.rows.map(r => r.id === id ? { ...r, ...applied } : r),
      ticket: s.ticket && s.ticket.id === id
        ? { ...s.ticket, ...applied, sla: { ...s.ticket.sla, paused: patch.status ? (patch.status === 'pending' || patch.status === 'on-hold') : s.ticket.sla.paused } }
        : s.ticket,
      menu: null, confirm: null,
    }));
    try {
      if (this.state.failMode) this.api.simulateNextFailure();
      await this.api.patchTicket(id, patch);
      if (label) this.toast(label + ' ✿');
      this.loadCounts();
    } catch (e) {
      this.setState({ rows: prevRows, ticket: prevT });
      this.toast("hmm, that didn't save. your work is safe — we'll try again in a moment", 'bad');
    }
  }
  setStatus = (e) => { const v = e.currentTarget.dataset.v; this.patch(this.state.ticket.id, { status: v }, 'status is now ' + v); };
  setPriority = (e) => { const v = e.currentTarget.dataset.v; this.patch(this.state.ticket.id, { priority: v }, 'priority is now ' + v); };
  setAssignee = (e) => {
    const v = e.currentTarget.dataset.v || null;
    const a = this.agent(v);
    this.patch(this.state.ticket.id, { assigneeId: v }, a ? "i'll pass it to " + a.name.split(' ')[0].toLowerCase() : 'back to no one');
  };
  unassign = () => this.patch(this.state.ticket.id, { assigneeId: null }, 'back to no one');
  assignMe = () => this.patch(this.state.ticket.id, { assigneeId: this.me().id }, 'assigned to you');
  setTeam = (e) => { const v = e.currentTarget.dataset.v; this.patch(this.state.ticket.id, { teamId: v }, 'handed to another team'); };
  addTag = (e) => {
    const v = e.currentTarget.dataset.v, t = this.state.ticket;
    if (!t || t.tags.includes(v)) return;
    this.patch(t.id, { tags: [...t.tags, v] }, 'tagged ' + v);
  };
  removeTag = (e) => {
    const v = e.currentTarget.dataset.v, t = this.state.ticket;
    this.patch(t.id, { tags: t.tags.filter(x => x !== v) }, 'removed ' + v);
  };
  editSubject = () => this.setState(s => ({ subjEdit: true, subjDraft: s.ticket.subject }));
  onSubjDraft = (e) => this.setState({ subjDraft: e.target.value });
  saveSubject = () => {
    const v = this.state.subjDraft.trim();
    this.setState({ subjEdit: false });
    if (v && v !== this.state.ticket.subject) this.patch(this.state.ticket.id, { subject: v }, 'subject updated');
  };
  onSubjKey = (e) => { if (e.key === 'Enter') this.saveSubject(); if (e.key === 'Escape') this.setState({ subjEdit: false }); };

  setMode = (e) => this.setState({ mode: e.currentTarget.dataset.m });
  onDraft = (e) => this.setState({ draft: e.target.value });
  insertCanned = (e) => {
    const id = e.currentTarget.dataset.v;
    const r = this.api.cannedResponses.find(x => x.id === id);
    const t = this.state.ticket;
    const body = r.body.replace('{{name}}', this.cust(t.customerId).name.split(' ')[0].toLowerCase());
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
      this.toast(internal ? 'note added — only your team can see it' : 'sent ✿');
      if (then) this.patch(t.id, { status: then }, 'status is now ' + then);
    } catch (e) {
      this.setState(s => ({ sending: false, draft: body, ticket: { ...s.ticket, thread: s.ticket.thread.filter(i => i.id !== tmp.id) } }));
      this.toast("that didn't send. your words are still here — try again in a moment", 'bad');
    }
  }
  onSend = () => this.send(null);
  onSendPending = () => this.send('pending');
  onSendResolved = () => this.send('resolved');
  reloadTicket = () => { const id = this.state.ticket.id; this.setState({ remote: false }); this.openTicket(id); };

  menuTo(name) { return (e) => { if (e && e.stopPropagation) e.stopPropagation(); this.setState(s => ({ menu: s.menu === name ? null : name, menuQ: '' })); }; }
  openStatusMenu = this.menuTo('status');
  openPriorityMenu = this.menuTo('priority');
  openAssigneeMenu = this.menuTo('assignee');
  openTeamMenu = this.menuTo('team');
  openOverflow = this.menuTo('overflow');
  openCanned = this.menuTo('canned');
  openTagMenu = this.menuTo('tag');
  toggleUser = this.menuTo('user');
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
    // default to whatever the select will actually show
    newCustomer: s.newCustomer || this.api?.customers?.[0]?.id || '',
  }));
  closeNewTicket = () => this.setState({ newT: false });
  onNewSubject = (e) => this.setState({ newSubject: e.target.value });
  onNewBody = (e) => this.setState({ newBody: e.target.value });
  onNewCustomer = (e) => this.setState({ newCustomer: e.target.value });
  onNewPriority = (e) => this.setState({ newPriority: e.currentTarget.dataset.v });
  submitNew = async () => {
    const s = this.state;
    if (!s.newSubject.trim()) { this.toast('a line about what happened helps us route it — anything is fine', 'bad'); return; }
    if (!s.newCustomer) { this.toast('pick who this is for and we\'ll open it', 'bad'); return; }
    this.setState({ newT: false });
    try {
      const t = await this.api.createTicket({ subject: s.newSubject.trim().toLowerCase(), customerId: s.newCustomer, priority: s.newPriority, body: s.newBody });
      this.setState({ newSubject: '', newBody: '' });
      this.toast('conversation #' + t.num + ' started ✿');
      this.loadCounts(); this.openTicket(t.id);
    } catch (e) { this.toast("couldn't create that one — try again in a moment", 'bad'); }
  };
  confirmOk = () => { const c = this.state.confirm; if (c && c.action) c.action(); else this.setState({ confirm: null }); };
  confirmCancel = () => this.setState({ confirm: null });
  askDelete = () => this.setState({
    menu: null, confirm: {
      title: 'delete this conversation?', body: "this one can't be undone — the whole thread goes with it. if you're unsure, closing it is gentler; closed conversations can always be reopened.",
      ok: 'delete it', tone: 'danger',
      action: () => {
        const id = this.state.ticket?.id;
        this.setState({ confirm: null });
        if (!id) return;
        this.api.deleteTicket(id)
          .then(() => { this.toast('deleted'); this.reallyNav('queue'); this.loadCounts(); })
          .catch((e) => this.toast(e?.status === 403 ? 'deleting needs an admin' : "that didn't work — try again in a moment", 'bad'));
      },
    }
  });
  askSpam = () => this.setState({
    menu: null, confirm: {
      title: 'mark as spam?', body: "we'll move it out of the queue and learn from it. you can pull it back from the spam view.",
      ok: 'mark spam', tone: 'warn', action: () => { this.setState({ confirm: null }); this.toast('marked as spam'); this.reallyNav('queue'); },
    }
  });
  copyLink = () => { this.setState({ menu: null }); this.toast('link copied to your clipboard'); };
  mergeTicket = () => { this.setState({ menu: null }); this.toast('the merge picker opens here in the real app'); };
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
    chatbot: { label: 'chatbot', scopes: ['chat:write', 'chat:read'], hint: 'open conversations, post turns, hand off' },
    readonly: { label: 'read-only', scopes: ['tickets:read', 'reports:read'], hint: 'dashboards and exports; cannot write' },
    integration: { label: 'integration', scopes: ['tickets:read', 'tickets:write', 'customers:read', 'customers:write'], hint: 'full ticket and customer access' },
  };

  genKey = async () => {
    const kind = this.KEY_KINDS[this.state.keyKind] ?? this.KEY_KINDS.chatbot;
    const name = this.state.keyName.trim();
    if (!name) { this.toast('give the key a name so you can tell them apart later', 'bad'); return; }
    try {
      const secret = await this.api.generateApiKey({ name, scopes: kind.scopes });
      this.setState({ secret, keyName: '' });
    } catch {
      this.toast("couldn't generate a key — admin only", 'bad');
    }
  };

  revokeKey = async (e) => {
    const id = e.currentTarget.dataset.id;
    try {
      await this.api.revokeApiKey(id);
      this.forceUpdate();
      this.toast('key revoked — it stops working immediately');
    } catch {
      this.toast("couldn't revoke that key — try again", 'bad');
    }
  };

  /** Actually copies. The old handler only showed a toast saying it had. */
  copySecret = async () => {
    const text = this.state.secret;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      this.toast('copied — store it now, we cannot show it again');
    } catch {
      // clipboard needs a secure context and permission; say so rather than lie
      this.toast('select the key and copy it manually', 'bad');
    }
  };
  hideKey = () => this.setState({ secret: null });
  setSettingsTab = (e) => this.setState({ settingsTab: e.currentTarget.dataset.v, secret: null });
  /** Value-form of setAvail — Segment hands us the next value directly. */
  pickAvail = (v) => this.applyAvail(v);
  setAvail = (e) => this.applyAvail(e.currentTarget.dataset.a);
  applyAvail(v) {
    if (v === this.state.avail) return;
    this.setState({ avail: v });
    this.api.setAvailability(v)
      .then(() => this.toast("you're " + v + ' now'))
      .catch(() => this.setState({ avail: v === 'available' ? 'away' : 'available' }, () => this.toast("that didn't save — try again in a moment", 'bad')));
  };
  toggleAvail = () => {
    const next = this.state.avail === 'available' ? 'away' : 'available';
    this.setState({ avail: next, menu: null });
    this.api.setAvailability(next)
      .then(() => this.toast("you're " + next + ' now'))
      .catch(() => this.setState({ avail: next === 'available' ? 'away' : 'available' }, () => this.toast("that didn't save — try again in a moment", 'bad')));
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
      this.setState({ loginError: true });
      if (e?.offline) this.toast("can't reach the server — is the backend running?", 'bad');
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
      this.setState({ menu: null, sheet: false, newT: false, confirm: null, results: null });
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
      if (e.key === 'a') { e.preventDefault(); this.patch(row.id, { assigneeId: this.me().id }, 'assigned to you'); return; }
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
      availAction: S.avail === 'available' ? 'set yourself away' : 'come back — set available',
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
        assigneeName: a ? a.name : 'no one yet', assigneeInitials: a ? this.initials(a.name) : '?', assigneeAv: a ? a.av : 'ghost',
        tagChips: (t.tags || []).slice(0, 2).map(g => ({ label: g, tone: this.TAGTONE[g] || 'neutral' })),
        hasMoreTags: (t.tags || []).length > 2, tagMore: '+' + ((t.tags || []).length - 2),
        slaLabel: sla.label, slaTone: sla.tone, slaTitle: sla.title,
        arcDash: (this.ARC[sla.tone] || this.ARC.neutral)[0], arcColor: (this.ARC[sla.tone] || this.ARC.neutral)[1],
        updated: this.rel(t.updatedAt), channelLabel: t.channel, channelGlyph: this.CHAN[t.channel] || '·',
        selected: sel.includes(t.id), hovered: S.hover === t.id,
      };
    });

    const fc = S.facets || { status: {}, priority: {}, channel: {}, tag: {} };
    const opt = (kind, id, label) => ({ id, label, count: (fc[kind] || {})[id] || 0, on: (S.f[kind] || []).includes(id) });
    const facetGroups = [
      { kind: 'status', label: 'status', options: ['new', 'open', 'pending', 'on-hold', 'resolved', 'closed'].map(id => opt('status', id, (this.STATUS[id] || {}).l || id)) },
      { kind: 'priority', label: 'priority', options: ['urgent', 'high', 'normal', 'low'].map(id => opt('priority', id, id)) },
      // Must track the Channel enum in prisma/schema.prisma. `chatbot` was added
      // for third-party bot ingest and missing here meant the one channel in
      // real use could not be filtered — every count read 0. `hashcare` was a
      // fictional customer in the original demo data and is not a channel
      // anybody has.
      { kind: 'channel', label: 'channel', options: [['chatbot', 'chatbot'], ['email', 'email'], ['api', 'api'], ['widget', 'widget']].map(p => opt('channel', p[0], p[1])) },
      { kind: 'tag', label: 'tag', options: (A ? A.tags : []).map(t => ({ id: t.id, label: t.label, count: (fc.tag || {})[t.id] || 0, on: S.f.tag === t.id })) },
    ];
    const chips = [];
    ['status', 'priority', 'channel'].forEach(k => (S.f[k] || []).forEach(v => chips.push({ kind: k, value: v, label: v })));
    if (S.f.tag) chips.push({ kind: 'tag', value: S.f.tag, label: S.f.tag });
    if (S.f.team) chips.push({ kind: 'team', value: S.f.team, label: ((A ? A.teams : []).find(t => t.id === S.f.team) || {}).name || S.f.team });
    if (S.f.assignee) chips.push({ kind: 'assignee', value: S.f.assignee, label: S.f.assignee === '@unassigned' ? 'unassigned' : ((this.agent(S.f.assignee) || {}).name || '') });
    if (S.f.range && S.f.range !== 'any') chips.push({ kind: 'range', value: S.f.range, label: S.f.range });

    const assigneeOptions = [
      { id: me.id, label: 'me · ' + me.name.split(' ')[0].toLowerCase(), initials: this.initials(me.name), av: me.av, on: S.f.assignee === me.id },
      { id: '@unassigned', label: 'no one yet', initials: '?', av: 'ghost', on: S.f.assignee === '@unassigned' },
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
      prioLabel: x.priority, prioTone: (this.PRIO[x.priority] || {}).t || 'neutral',
      created: this.clock(x.createdAt), updated: this.rel(x.updatedAt),
    })) : [];

    const dd = (A && S.drill && A.drilldowns) ? A.drilldowns[S.drill] : null;
    const rep = A ? A.reports : { kpis: [], volume: [], byChannel: [], byAgent: [] };
    const maxVol = Math.max(1, ...rep.volume.map(v => Math.max(v.created, v.resolved)));
    const maxCh = Math.max(1, ...rep.byChannel.map(c => c.n));

    return {
      isLogin: !S.loggedIn, inApp: S.loggedIn,
      loginEmail: S.loginEmail, loginPw: S.loginPw, loginError: S.loginError,
      pwType: S.pwShown ? 'text' : 'password', pwToggleLabel: S.pwShown ? 'hide' : 'show',
      onLoginEmail: this.onLoginEmail, onLoginPw: this.onLoginPw, togglePw: this.togglePw, signIn: this.signIn, forgot: this.forgot,
      onLoginKey: this.onLoginKey, keepSignedIn: S.keepSignedIn, toggleKeepSignedIn: this.toggleKeepSignedIn,
      federated: this.federated, requestAccess: this.requestAccess, serviceUp: S.serviceUp,

      me: meView, go: this.go, signOut: this.signOut, toggleUser: this.toggleUser, userOpen: S.menu === 'user',
      canAdmin: S.role !== 'agent', toggleAvail: this.toggleAvail, openSheet: this.openSheet,
      themeAction: S.theme === 'dark' ? 'switch to light' : 'switch to dark', toggleTheme: this.toggleTheme, toggleNav: this.toggleNav,

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
      sortLabel: (this.SORTS.find(x => x.id === S.sort) || {}).label, sortOpen: S.menu === 'sort',
      toggleSort: this.toggleSort, setSort: this.setSort, sortOptions: this.SORTS.map(o => ({ id: o.id, label: o.label, on: o.id === S.sort })),
      softLabel: S.soft, cycleSoft: this.cycleSoft, toggleFilters: this.toggleFilters, refresh: this.refresh,
      refreshedRel: this.rel(S.refreshed), loading: S.load === 'loading',

      facetGroups, chips, removeChip: this.removeChip, toggleFacet: this.toggleFacet, clearFilters: this.clearFilters,
      assigneeOptions, setAssigneeFilter: this.setAssigneeFilter,
      teamOptions: (A ? A.teams : []).map(x => ({ id: x.id, label: x.name, on: S.f.team === x.id })), setTeamFilter: this.setTeamFilter,
      rangeOptions: [['any', 'any time'], ['today', 'today'], ['7d', 'last 7 days'], ['30d', 'last 30 days']].map(p => ({ id: p[0], label: p[1], on: S.f.range === p[0] })), setRange: this.setRange,

      rows, loadingRows: S.load === 'loading' && rows.length === 0, hasError: S.load === 'error',
      isEmpty: S.load === 'ok' && rows.length === 0,
      skeletons: [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => ({ id: 'sk' + n })),
      onRowEnter: this.onRowEnter, onRowLeave: this.onRowLeave, toggleSel: this.toggleSel, toggleAll: this.toggleAll, stop: this.stop,
      allSelected: rows.length > 0 && sel.length === rows.length,
      hasSelection: sel.length > 0, selCount: sel.length, clearSel: this.clearSel,
      quickAssign: this.quickAssign, quickStatus: this.quickStatus, quickOpen: this.quickOpen,
      bulkAssign: this.bulkAssign, bulkPending: this.bulkPending, bulkTag: this.bulkTag, bulkClose: this.bulkClose,
      pageLabel: S.total === 0 ? 'no one waiting' : (S.page * S.pageSize + 1) + '–' + Math.min(S.total, (S.page + 1) * S.pageSize) + ' of ' + S.total,
      prevPage: this.prevPage, nextPage: this.nextPage,

      ticketLoading: S.ticketLoad === 'loading', ticketReady: S.ticketLoad === 'ok' && !!t,
      tNum: t ? t.num : '', tSubject: t ? t.subject : '', tStatus: t ? (this.STATUS[t.status] || {}).l : '',
      tStatusTone: t ? (this.STATUS[t.status] || {}).t : 'neutral', tPrio: t ? t.priority : '',
      tPrioTone: t ? (this.PRIO[t.priority] || {}).t : 'neutral', tPrioGlyph: t ? (this.PRIO[t.priority] || {}).g : '',
      tTeam: t ? (((A ? A.teams : []).find(x => x.id === t.teamId) || {}).name || '') : '',
      tAssigneeName: ta ? ta.name : 'no one yet', tAssigneeInitials: ta ? this.initials(ta.name) : '?', tAssigneeAv: ta ? ta.av : 'ghost',
      thread, tSlaLabel: tsla.label, tSlaTone: tsla.tone, tSlaTitle: tsla.title, tPaused: !!(t && t.sla.paused),
      frLabel: t ? (t.sla.firstResponse.metAt ? 'met ' + this.rel(t.sla.firstResponse.metAt) + ' ago' : frLeft == null ? 'no target' : (frLeft < 0 ? 'overdue by ' + this.dur(-frLeft) : 'due in ' + this.dur(frLeft))) : '',
      frTone: t ? (t.sla.firstResponse.metAt ? 'sla-met' : frLeft == null ? 'neutral' : t.sla.paused ? 'sla-paused' : frLeft < 0 ? 'sla-breach' : frLeft < 1800000 ? 'sla-due' : 'sla-ok') : 'neutral',
      frDue: t && t.sla.firstResponse.dueAt != null ? this.clock(t.sla.firstResponse.dueAt) : '—',
      resLabel: t ? (t.sla.resolution.metAt ? 'met ' + this.rel(t.sla.resolution.metAt) + ' ago' : resLeft == null ? 'no target' : (resLeft < 0 ? 'overdue by ' + this.dur(-resLeft) : 'due in ' + this.dur(resLeft))) : '',
      resTone: t ? (t.sla.resolution.metAt ? 'sla-met' : resLeft == null ? 'neutral' : t.sla.paused ? 'sla-paused' : resLeft < 0 ? 'sla-breach' : resLeft < 1800000 ? 'sla-due' : 'sla-ok') : 'neutral',
      resDue: t && t.sla.resolution.dueAt != null ? this.clock(t.sla.resolution.dueAt) : '—', slaPolicy: t ? t.sla.policy : '',
      tChannel: t ? t.channel : '', tCreated: t ? this.clock(t.createdAt) : '', tRequester: t ? t.requester : '',
      tCc: t && t.cc.length ? t.cc.join(', ') : '—', tSource: t && t.sourceRef ? t.sourceRef : '—', tId: t ? t.id : '',
      tTags: t ? t.tags.map(g => ({ id: g, label: g, tone: this.TAGTONE[g] || 'neutral' })) : [],
      tagAddOptions: (A ? A.tags : []).filter(x => !t || !t.tags.includes(x.id)).map(x => ({ id: x.id, label: x.label, tone: x.tone })),
      activity: t ? t.activity.map((x, n) => ({ id: 'ac' + n, who: x.who, what: x.what, rel: this.rel(x.at) })) : [],
      custName: tc ? tc.name : '', custInitials: tc ? this.initials(tc.name) : '', custAv: tc ? tc.av : 1,
      custEmail: tc ? tc.email : '', custOrg: tc ? this.orgName(tc.org) : '', custTz: tc ? tc.tz : '', custLocale: tc ? tc.locale : '',
      custId: tc ? tc.id : '',
      backToQueue: this.backToQueue, toggleRail: this.toggleRail, railOn: S.rail,
      remote: S.remote, reloadTicket: this.reloadTicket,
      // only chatbot conversations have an assistant to silence
      isBotConversation: !!(t && t.createdByApiKeyId),
      botEnabled: t ? t.botEnabled !== false : true,
      toggleBot: this.toggleBot,
      subjEdit: S.subjEdit, subjDraft: S.subjDraft, editSubject: this.editSubject, onSubjDraft: this.onSubjDraft, saveSubject: this.saveSubject, onSubjKey: this.onSubjKey,
      statusOpen: S.menu === 'status', prioOpen: S.menu === 'priority', assigneeOpen: S.menu === 'assignee',
      teamOpen: S.menu === 'team', overflowOpen: S.menu === 'overflow', cannedOpen: S.menu === 'canned', tagOpen: S.menu === 'tag',
      openStatusMenu: this.openStatusMenu, openPriorityMenu: this.openPriorityMenu, openAssigneeMenu: this.openAssigneeMenu,
      openTeamMenu: this.openTeamMenu, openOverflow: this.openOverflow, openCanned: this.openCanned, openTagMenu: this.openTagMenu,
      statusOptions: Object.keys(this.STATUS).map(id => ({ id, label: this.STATUS[id].l, tone: this.STATUS[id].t, on: !!(t && t.status === id) })),
      prioOptions: Object.keys(this.PRIO).map(id => ({ id, label: this.PRIO[id].l, tone: this.PRIO[id].t, glyph: this.PRIO[id].g, on: !!(t && t.priority === id) })),
      agentList, menuQ: S.menuQ, onMenuQ: this.onMenuQ,
      teamList: (A ? A.teams : []).map(x => ({ id: x.id, label: x.name, on: !!(t && t.teamId === x.id) })),
      setStatus: this.setStatus, setPriority: this.setPriority, setAssignee: this.setAssignee, assignMe: this.assignMe, unassign: this.unassign,
      setTeam: this.setTeam, addTag: this.addTag, removeTag: this.removeTag,
      askDelete: this.askDelete, askSpam: this.askSpam, copyLink: this.copyLink, mergeTicket: this.mergeTicket,

      subjNotEdit: !S.subjEdit, threadRef: this.threadRef, mock: this.mock, askMock: this.askMock,
      composerKey: S.mode === 'note' ? 'note' : 'reply',
      composerPlaceholder: S.mode === 'note' ? 'a note for your team — the customer never sees this…' : 'write something kind and useful…',
      cannedFiltered: (A ? A.cannedResponses : []).filter(r => !S.menuQ || (r.title + r.body).toLowerCase().includes(S.menuQ.toLowerCase())).map(r => ({ id: r.id, title: r.title, team: r.team, snippet: r.body.slice(0, 92) + '…' })),
      isReply: S.mode === 'reply', isNote: S.mode === 'note', setMode: this.setMode,
      draft: S.draft, onDraft: this.onDraft, replyRef: this.replyRef, sending: S.sending,
      sendLabel: S.mode === 'note' ? 'add note' : 'send',
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
      tabTeam: S.settingsTab === 'team', tabSla: S.settingsTab === 'sla', tabHours: S.settingsTab === 'hours',
      tabCanned: S.settingsTab === 'canned', tabTags: S.settingsTab === 'tags', tabHooks: S.settingsTab === 'hooks',
      tabKeys: S.settingsTab === 'keys', tabEmail: S.settingsTab === 'email',
      teamRows: (A ? A.agents : []).map(a => ({ id: a.id, name: a.name, email: a.email, role: a.role, av: a.av, initials: this.initials(a.name), teamName: ((A ? A.teams : []).find(t2 => t2.id === a.team) || {}).name, avail: a.avail, lastRel: a.lastActive < 60 ? a.lastActive + 'm ago' : Math.round(a.lastActive / 60) + 'h ago', availTone: a.avail === 'available' ? 'sla-met' : 'sla-paused' })),
      slaRows: A ? A.slaPolicies : [], hoursRows: A ? A.businessHours : [],
      hookRows: (A ? A.webhooks : []).map(w => ({ id: w.id, url: w.url, events: w.events, status: w.status, last: w.last, tone: w.status === 'active' ? 'sla-met' : 'sla-breach' })),
      keyRows: A ? A.apiKeys : [], tagRows: (A ? A.tags : []).map(t2 => ({ id: t2.id, label: t2.label, tone: t2.tone, count: (fc.tag || {})[t2.id] || 0 })),
      cannedRows: (A ? A.cannedResponses : []).map(r => ({ id: r.id, title: r.title, team: r.team, tagList: r.tags.join(', '), snippet: r.body.slice(0, 110) + '…' })),
      secret: S.secret, hasSecret: !!S.secret, copySecret: this.copySecret,
      keyName: S.keyName, onKeyName: this.onKeyName,
      keyKind: S.keyKind, setKeyKind: this.setKeyKind,
      keyKinds: Object.entries(this.KEY_KINDS).map(([id, k]) => ({ id, ...k, on: S.keyKind === id })),
      revokeKey: this.revokeKey, genKey: this.genKey, hideKey: this.hideKey,

      toasts: S.toasts.map(x => ({ id: x.id, text: x.text, tone: x.tone === 'bad' ? 'sla-breach' : 'sla-met' })),
      hasConfirm: !!S.confirm,
      confirmTitle: S.confirm ? S.confirm.title : '', confirmBody: S.confirm ? S.confirm.body : '',
      confirmOkLabel: S.confirm ? S.confirm.ok : '', confirmDanger: !!(S.confirm && S.confirm.tone === 'danger'),
      confirmOk: this.confirmOk, confirmCancel: this.confirmCancel,
      sheet: S.sheet, closeSheet: this.closeSheet,
      newT: S.newT, closeNewTicket: this.closeNewTicket, openNewTicket: this.openNewTicket,
      newSubject: S.newSubject, newBody: S.newBody, newCustomer: S.newCustomer, submitNew: this.submitNew,
      onNewSubject: this.onNewSubject, onNewBody: this.onNewBody, onNewCustomer: this.onNewCustomer, onNewPriority: this.onNewPriority,
      newPriorityOptions: Object.keys(this.PRIO).map(id => ({ id, label: this.PRIO[id].l, on: S.newPriority === id })),
      customerOptions: (A ? A.customers : []).map(c => ({ id: c.id, label: c.name + ' · ' + this.orgName(c.org) })),
    };
  }

  render() {
    const V = this.renderVals();
    return (
      <>
        {V.isLogin && <Login V={V} />}
        {V.inApp && (
          <div className={sx('height:100vh;display:flex;flex-direction:column;background:var(--cs-canvas);color:var(--cs-text);overflow:hidden')}>
            <Header V={V} />
            <div className={sx('flex:1;display:flex;min-height:0')}>
              <Sidebar V={V} />
              <main className={sx('flex:1;min-width:0;display:flex;flex-direction:column;overflow:hidden')}>
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
