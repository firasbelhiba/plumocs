'use client';

/**
 * The adapter — the console's data layer, backed by the real API.
 *
 * It exposes the same interface the screens were built against (listTickets,
 * getTicket, patchTicket, caches like `agents`/`teams`/`tags`, …) and does
 * all shape translation in one place:
 *   - ISO timestamps → epoch ms (the UI ticks clocks off Date.now())
 *   - on_hold ↔ on-hold status spelling
 *   - flat SLA columns → the { firstResponse, resolution, paused, policy } shape
 *   - messages → thread items (message / note / event)
 *   - audit entries → the activity rail
 * Unread state is client-side (localStorage last-seen per ticket) — the API
 * has no per-agent read model in v1.
 */
import * as api from './endpoints';
import { restoreSession, setSession, currentSession, setUnauthorizedHandler, WS_URL, ApiError } from './client';

const ms = (iso) => (iso ? new Date(iso).getTime() : null);
const uiStatus = (s) => (s === 'on_hold' ? 'on-hold' : s);
const apiStatus = (s) => (s === 'on-hold' ? 'on_hold' : s);
const TAGTONE = {
  billing: 'tag-billing', bug: 'tag-bug', 'how-to': 'tag-howto',
  account: 'tag-account', urgent: 'tag-urgent', integration: 'tag-integration',
};
const isMarkerTag = (t) => t.startsWith('sla:');

/** Display names for the Channel enum — the raw values are lowercase slugs. */
const CHANNEL_LABEL = {
  chatbot: 'Chatbot', email: 'Email', api: 'API', widget: 'Widget', hashcare: 'HashCare',
};

const isUuid = (v) =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/** Deterministic avatar bucket 1–6 from any id. */
function av(id) {
  let h = 0;
  const s = String(id ?? '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (h % 6) + 1;
}

function fmtMins(mins) {
  if (mins == null) return '—';
  if (mins < 60) return `${Math.round(mins)}m`;
  if (mins < 48 * 60) {
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return m ? `${h}h ${String(m).padStart(2, '0')}m` : `${h}h`;
  }
  return `${Math.round(mins / 1440)}d`;
}

function fmtBytes(n) {
  if (n == null) return '';
  if (n < 1024) return `${n} b`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} kb`;
  return `${(n / (1024 * 1024)).toFixed(1)} mb`;
}

// ---- client-side unread tracking -------------------------------------------------

const SEEN_KEY = 'plumo.seen';
function seenMap() {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}');
  } catch {
    return {};
  }
}
function markSeen(ticketId) {
  const map = seenMap();
  map[ticketId] = Date.now();
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

// ---- the adapter ------------------------------------------------------------------

/** Dev seed accounts for the demo role switcher (see prisma/seed.ts). */

class Adapter {
  // caches the screens read synchronously via renderVals()
  agents = [];
  customers = [];
  teams = [];
  tags = [];
  cannedResponses = [];
  slaPolicies = [];
  businessHours = [];
  webhooks = [];
  apiKeys = [];
  invitations = [];
  notifications = [];
  reports = { kpis: [], volume: [], byChannel: [], byAgent: [] };
  drilldowns = {};
  meta = { orgName: (idOrName) => this.#orgs.get(idOrName) ?? idOrName ?? '—' };

  currentUser = null; // { id, email, name, role, teamId, availability }
  // The API renamed this relation `organization` -> `company` on 2026-08-08 (the
  // Plumo PM/CS name collision — see backend/docs/organization-vs-workspace.md).
  // Only the WIRE key moved. The console's own vocabulary — `#orgs`, `orgName`,
  // `org`, `customerOrg` — is unchanged, because it is read by Console.jsx,
  // Customers.jsx and Header.jsx and renaming it buys nothing the user can see.
  // So every read below is `c.company` while every field emitted stays `org*`.
  // That asymmetry is deliberate; do not "fix" one half of it.
  #orgs = new Map();
  #failNext = false;
  #socket = null;
  #listeners = new Set();
  #localMessageIds = new Set();

  // ---- session ------------------------------------------------------------------

  restore() {
    return restoreSession();
  }

  onUnauthorized(fn) {
    setUnauthorizedHandler(fn);
  }

  /**
   * Adopt a session handed back by the plumo sign-in callback.
   *
   * The tokens arrive in the URL fragment rather than from a login call, so
   * there is no response body carrying the user — store the tokens first, then
   * ask /auth/me who this is. Storing before asking is deliberate: the request
   * needs the token to succeed.
   */
  async adoptPmSession({ accessToken, refreshToken }, keepSignedIn = true) {
    setSession({ accessToken, refreshToken, user: null, workspace: null }, { persist: keepSignedIn });
    const me = await api.auth.me();
    setSession(
      {
        accessToken,
        refreshToken,
        user: me.user ?? me,
        workspace: me.workspace ?? null,
      },
      { persist: keepSignedIn },
    );
    return me.user ?? me;
  }

  async login(email, password, keepSignedIn = true) {
    const data = await api.auth.login(email, password);
    setSession(
      {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        user: data.user,
        // Which desk this session belongs to. Stored so every later request can
        // name it explicitly instead of letting the server fall back to "the
        // only workspace" — a fallback that switches itself off, for everyone
        // at once, the moment a second workspace is created.
        workspace: data.workspace ?? null,
      },
      { persist: keepSignedIn },
    );
    return data.user;
  }

  /** Backend liveness — drives the footer status dot. */
  async serviceStatus() {
    try {
      await api.health.liveness();
      return 'operational';
    } catch {
      return 'unreachable';
    }
  }

  async logout() {
    const session = currentSession();
    if (session?.refreshToken) await api.auth.logout(session.refreshToken).catch(() => {});
    setSession(null);
    this.currentUser = null;
    this.#disconnectSocket();
  }

  /** Demo role switcher — re-authenticates as the seed user for that role. */
  /** Silence the chatbot on one conversation, or let it speak again. */
  setBotEnabled(ticketId, enabled) {
    return api.tickets.setBotEnabled(ticketId, enabled);
  }

  /** Revoke a key. The row survives so its history stays attributable. */
  async revokeApiKey(id) {
    await api.apiKeys.revoke(id);
    await this.refreshApiKeys();
    return this.apiKeys;
  }

  async refreshApiKeys() {
    const keys = await api.apiKeys.list();
    this.apiKeys = keys.map((k) => ({
      id: k.id, name: k.name, scope: (k.scopes ?? []).join(', '),
      active: k.isActive !== false,
      team: k.team?.name ?? 'All teams',
      created: new Date(k.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
      last: k.lastUsedAt ? this.#rel(ms(k.lastUsedAt)) + ' ago' : 'Never',
    }));
    return this.apiKeys;
  }

  forgotPassword(email) {
    return api.auth.forgotPassword(email);
  }

  changePassword(currentPassword, newPassword) {
    return api.auth.changePassword(currentPassword, newPassword);
  }

  async setAvailability(availability) {
    const me = await api.users.updateSelf({ availability });
    if (this.currentUser) this.currentUser.availability = me.availability;
    this.#patchAgentCache(me);
    return me;
  }

  async updateName(name) {
    const me = await api.users.updateSelf({ name });
    if (this.currentUser) this.currentUser.name = me.name;
    this.#patchAgentCache(me);
    return me;
  }

  #patchAgentCache(user) {
    const idx = this.agents.findIndex((a) => a.id === user.id);
    if (idx >= 0) {
      this.agents[idx] = { ...this.agents[idx], name: user.name, avail: user.availability };
    }
  }

  // ---- bootstrap: everything renderVals reads synchronously ----------------------

  async bootstrap() {
    const me = await api.auth.me();
    this.currentUser = me;

    // Backfill the workspace onto sessions that predate it.
    //
    // Anyone already signed in when this shipped has a stored session with no
    // workspace, and they will not log in again for weeks. Learning it here —
    // on the one call every session makes at startup — means those sessions
    // start naming their workspace too, rather than quietly depending on the
    // single-tenant fallback until the next time they sign out.
    const s = currentSession();
    if (s && me?.workspace?.slug && s.workspace?.slug !== me.workspace.slug) {
      setSession({ ...s, workspace: me.workspace });
    }

    const [usersRes, teamsRes, tagsRes, cannedRes, customersRes, notifsRes, slaRes, hoursRes] = await Promise.all([
      api.users.list(),
      api.teams.list(),
      api.tags.list(),
      api.cannedResponses.list(),
      api.customers.list({ limit: 100 }),
      api.notifications.list(),
      api.slaPolicies.list().catch(() => []),
      api.businessHours.list().catch(() => []),
    ]);

    this.teams = teamsRes.map((t) => ({ id: t.id, name: t.name }));
    this.agents = usersRes.map((u) => ({
      id: u.id,
      name: u.name,
      role: u.role,
      team: u.teamId,
      email: u.email,
      avail: u.availability,
      av: av(u.id),
      lastActive: u.lastActiveAt ? Math.max(1, Math.round((Date.now() - ms(u.lastActiveAt)) / 60000)) : 999,
    }));
    this.tags = tagsRes.map((t) => ({ id: t.key, label: t.label, tone: TAGTONE[t.key] ?? 'neutral', count: t.count ?? 0 }));
    this.cannedResponses = cannedRes.map((r) => ({
      id: r.id, title: r.title, body: r.body,
      team: r.team?.name ?? 'All teams', tags: r.tags ?? [],
    }));
    this.#ingestCustomers(customersRes.data);
    this.notifications = notifsRes.map((n) => this.#mapNotification(n));
    this.slaPolicies = slaRes.map((p) => ({
      id: p.id, name: p.name, priority: p.priority,
      firstResponse: fmtMins(p.firstResponseMins), resolution: fmtMins(p.resolutionMins),
      hours: p.businessHours ? 'business hours' : '24/7',
    }));
    this.businessHours = this.#mapBusinessHours(hoursRes[0]);

    // admin-only panes — tolerate 403 for agents/leads
    if (me.role === 'admin') {
      const [hooks, keys] = await Promise.all([
        api.webhooks.list().catch(() => []),
        api.apiKeys.list().catch(() => []),
      ]);
      this.webhooks = hooks.map((w) => ({
        id: w.id,
        url: w.url,
        events: (w.events ?? []).join(', '),
        status: !w.isActive ? 'disabled' : w.lastDelivery?.status === 'failed' ? 'failing' : 'active',
        last: w.lastDelivery ? this.#rel(ms(w.lastDelivery.createdAt)) + ' ago' : '—',
      }));
      this.apiKeys = keys.map((k) => ({
        id: k.id,
        name: k.name,
        scope: (k.scopes ?? []).join(', '),
        team: k.team?.name ?? 'All teams',
        created: new Date(k.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
        last: k.lastUsedAt ? this.#rel(ms(k.lastUsedAt)) + ' ago' : 'Never',
      }));
    } else {
      this.webhooks = [];
      this.apiKeys = [];
    }

    this.#connectSocket();
    return me;
  }

  #ingestCustomers(rows) {
    this.customers = rows.map((c) => {
      if (c.company) this.#orgs.set(c.company.id, c.company.name);
      return {
        id: c.id,
        name: c.name,
        email: c.email,
        org: c.company?.id ?? null,
        orgName: c.company?.name ?? '—',
        tz: c.timezone ?? '—',
        locale: c.locale ?? '—',
        phone: c.phone ?? '—',
        av: av(c.id),
        open: c.tickets?.open ?? 0,
        total: c.tickets?.total ?? 0,
        lastContact: ms(c.lastContact),
      };
    });
  }

  #mapBusinessHours(row) {
    if (!row) return [];
    const weekly = row.weeklyJson ?? {};
    const days = [
      ['mon', 'monday'], ['tue', 'tuesday'], ['wed', 'wednesday'], ['thu', 'thursday'],
      ['fri', 'friday'], ['sat', 'saturday'], ['sun', 'sunday'],
    ];
    return days.map(([key, day]) => {
      const windows = weekly[key] ?? [];
      const on = windows.length > 0;
      return { day, open: on ? windows[0][0] : '—', close: on ? windows[0][1] : '—', on };
    });
  }

  #mapNotification(n) {
    const kind = n.kind?.startsWith('sla') ? 'sla' : n.kind === 'mention' ? 'mention' : 'assign';
    return { id: n.id, kind, text: n.text, at: ms(n.createdAt), unread: !n.readAt, ticketId: n.ticketId ?? null };
  }

  #rel(at) {
    const m = Math.round((Date.now() - at) / 60000);
    if (m < 1) return 'now';
    if (m < 60) return `${m}m`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.round(h / 24)}d`;
  }

  // ---- failure simulation (demo) — client-side, mutations only -------------------

  simulateNextFailure() {
    this.#failNext = true;
  }

  #maybeFail() {
    if (this.#failNext) {
      this.#failNext = false;
      throw new ApiError('simulated network failure (demo)', { status: 0 });
    }
  }

  // ---- tickets --------------------------------------------------------------------

  async listTickets({ view = 'all-open', filters = {}, sort = 'updated', page = 0, pageSize = 25 } = {}) {
    const params = {
      view,
      sort,
      offset: page * pageSize,
      limit: pageSize,
      status: (filters.status ?? []).map(apiStatus).join(',') || undefined,
      priority: (filters.priority ?? []).join(',') || undefined,
      channel: (filters.channel ?? []).join(',') || undefined,
      tag: filters.tag ?? undefined,
      teamId: filters.team ?? undefined,
      assigneeId: filters.assignee ?? undefined,
      q: filters.q ?? undefined,
      range: filters.range && filters.range !== 'any' ? filters.range : undefined,
    };
    const res = await api.tickets.list(params);
    const seen = seenMap();
    return {
      rows: res.data.map((t) => this.#mapTicketRow(t, seen)),
      total: res.page.total,
      pageSize: res.page.limit,
    };
  }

  #mapTicketRow(t, seen = seenMap()) {
    if (t.customer?.company) this.#orgs.set(t.customer.company.id, t.customer.company.name);
    const updatedAt = ms(t.updatedAt);
    const lastMsg = t.messages?.[0];
    return {
      id: t.id,
      num: t.number,
      subject: t.subject,
      snippet: lastMsg
        ? (lastMsg.isInternalNote ? 'internal note · ' : lastMsg.authorType === 'agent' ? 'you · ' : '') +
          lastMsg.body.replace(/\s+/g, ' ').slice(0, 120)
        : '',
      unread: !seen[t.id] || updatedAt > seen[t.id],
      status: uiStatus(t.status),
      priority: t.priority,
      channel: t.channel,
      tags: (t.tags ?? []).filter((x) => !isMarkerTag(x)),
      customerId: t.customerId,
      customerName: t.customer?.name,
      customerOrg: t.customer?.company?.name,
      assigneeId: t.assigneeId,
      teamId: t.teamId,
      createdAt: ms(t.createdAt),
      updatedAt,
      sla: this.#mapSla(t),
    };
  }

  #mapSla(t) {
    // dueAt may be genuinely null (no active policy for the priority). Keep it
    // null so the UI shows "—" rather than treating now() as an instant breach.
    return {
      paused: !!t.slaPausedAt,
      policy: t.slaPolicy?.name ?? '—',
      firstResponse: { dueAt: ms(t.firstResponseDueAt), metAt: ms(t.firstRespondedAt) },
      resolution: { dueAt: ms(t.resolutionDueAt), metAt: ms(t.resolvedAt) },
    };
  }

  async viewCounts() {
    const res = await api.tickets.counts();
    return res.views;
  }

  /** Facets come from the same counts call; cached between loads. */
  #facets = { status: {}, priority: {}, channel: {}, tag: {} };
  facetCounts() {
    return this.#facets;
  }

  async refreshCounts() {
    const res = await api.tickets.counts();
    const status = {};
    for (const [k, v] of Object.entries(res.facets.status ?? {})) status[uiStatus(k)] = v;
    this.#facets = { ...res.facets, status };
    return { views: res.views, facets: this.#facets };
  }

  /** Accepts a UUID or a human ref like 'tk1042' / '1042' (resolved via list). */
  async #resolveTicketId(id) {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return id;
    const num = String(id).replace(/^tk/i, '');
    const res = await api.tickets.list({ q: num, limit: 5 });
    const hit = res.data.find((t) => String(t.number) === num);
    if (!hit) throw new ApiError('Ticket not found', { status: 404 });
    return hit.id;
  }

  async getTicket(rawId) {
    const id = await this.#resolveTicketId(rawId);
    const [t, auditTrail] = await Promise.all([
      api.tickets.get(id),
      api.tickets.audit(id).catch(() => []),
    ]);
    markSeen(id);

    const customer = t.customer
      ? {
          id: t.customer.id, name: t.customer.name, email: t.customer.email,
          org: t.customer.company?.id ?? null, tz: t.customer.timezone ?? '—',
          locale: t.customer.locale ?? '—', av: av(t.customer.id),
        }
      : null;
    if (t.customer?.company) this.#orgs.set(t.customer.company.id, t.customer.company.name);

    const thread = (t.messages ?? []).map((m) => this.#mapMessage(m, t));
    return {
      ...this.#mapTicketRow(t),
      unread: false,
      requester: t.customer?.email ?? '—',
      cc: [],
      sourceRef: t.sourceRef,
      // Needed by the AI on/off control: whether a chatbot opened this at all,
      // and whether it is currently allowed to reply. Dropping them here is why
      // the control would never render.
      createdByApiKeyId: t.createdByApiKeyId ?? null,
      botEnabled: t.botEnabled !== false,
      handling: t.handling ?? null,
      customerFull: customer,
      thread,
      activity: auditTrail.slice(0, 6).map((a) => this.#mapAudit(a)),
    };
  }

  #mapMessage(m, ticket) {
    const isEvent = m.authorType === 'system' && !m.isInternalNote && m.body.length < 120 && !m.body.includes('\n');
    const agent = m.authorType === 'agent' ? this.agents.find((a) => a.id === m.authorId) : null;
    const isCustomer = m.authorType === 'customer';
    const isBot = m.authorType === 'bot';
    return {
      kind: m.isInternalNote ? 'note' : isEvent ? 'event' : 'message',
      id: m.id,
      author: agent?.name ?? (isCustomer ? ticket.customer?.name ?? 'customer' : 'plumo'),
      authorId: m.authorId,
      side: isCustomer ? 'customer' : 'agent',
      // A chatbot reply is not a 'system' event — that label is for merge
      // markers and automated notes. Showing the AI's answers as "system" makes
      // the transcript unreadable and hides who actually said what.
      role: agent
        ? (agent.role === 'lead' ? 'team lead' : agent.role === 'admin' ? 'admin' : 'support')
        : isBot ? 'AI assistant'
        : isCustomer ? (ticket.customer?.company?.name ?? '')
        : 'system',
      at: ms(m.createdAt),
      body: m.body,
      attachments: (m.attachments ?? []).map((f) => ({ id: f.id, name: f.filename, size: fmtBytes(f.sizeBytes) })),
      pending: false,
    };
  }

  #mapAudit(a) {
    const actor =
      a.actorType === 'user'
        ? this.agents.find((u) => u.id === a.actorId)?.name ?? 'someone'
        : a.actorType === 'api_key'
          ? 'integration'
          : 'plumo';
    const diff = a.diffJson ?? {};
    let what = a.action;
    if (a.action === 'create') what = 'opened the conversation';
    else if (a.action === 'message.add') what = 'replied to the customer';
    else if (a.action === 'note.add') what = 'left a team note';
    else if (a.action === 'merge') what = `merged it into #${diff.targetNumber ?? '…'}`;
    else if (a.action === 'update') {
      const keys = Object.keys(diff);
      if (keys.includes('status')) what = `changed status to ${uiStatus(String(diff.status?.to ?? ''))}`;
      else if (keys.includes('assigneeId')) what = 'reassigned it';
      else if (keys.includes('priority')) what = `changed priority to ${diff.priority?.to ?? ''}`;
      else if (keys.includes('tags')) what = 'retagged it';
      else if (keys.includes('subject')) what = 'renamed it';
      else what = 'updated it';
    }
    return { who: actor, what, at: ms(a.createdAt) };
  }

  async patchTicket(id, patch) {
    this.#maybeFail();
    const body = { ...patch };
    if (body.status) body.status = apiStatus(body.status);
    if (body.unread !== undefined) {
      // unread is client-side — nothing to send
      delete body.unread;
      if (Object.keys(body).length === 0) return { ok: true };
    }
    return api.tickets.patch(id, body);
  }

  async addMessage(ticketId, { body, internal }) {
    this.#maybeFail();
    const msg = await api.tickets.addMessage(ticketId, { body, isInternalNote: !!internal });
    this.#localMessageIds.add(msg.id);
    markSeen(ticketId);
    return msg;
  }

  async createTicket({ subject, customerId, priority = 'normal', body = '' }) {
    this.#maybeFail();
    const t = await api.tickets.create({ subject, customerId, priority, channel: 'manual', body: body || undefined });
    return { id: t.id, num: t.number };
  }

  deleteTicket(id) {
    return api.tickets.remove(id);
  }

  bulkTickets(ids, action, extra = {}) {
    this.#maybeFail();
    const body = { ids, action, ...extra };
    if (body.status) body.status = apiStatus(body.status);
    return api.tickets.bulk(body);
  }

  // ---- customers -------------------------------------------------------------------

  async listCustomers(q = '') {
    const res = await api.customers.list({ q: q || undefined, limit: 100 });
    this.#ingestCustomers(res.data);
    return this.customers;
  }

  async getCustomer(id) {
    const c = await api.customers.get(id);
    if (c.company) this.#orgs.set(c.company.id, c.company.name);
    return {
      id: c.id,
      name: c.name,
      email: c.email,
      orgName: c.company?.name ?? '—',
      phone: c.phone ?? '—',
      tz: c.timezone ?? '—',
      av: av(c.id),
      tickets: (c.tickets ?? []).map((x) => ({
        id: x.id, num: x.number, subject: x.subject,
        status: uiStatus(x.status), priority: x.priority,
        createdAt: ms(x.createdAt), updatedAt: ms(x.updatedAt),
      })),
      stats: {
        total: c.tickets?.length ?? 0,
        open: (c.tickets ?? []).filter((x) => !['resolved', 'closed'].includes(x.status)).length,
        avgResolution: c.stats?.avgResolution ?? '—',
        lastSeen: ms(c.stats?.lastSeen) ?? 0,
      },
    };
  }

  // ---- search / notifications --------------------------------------------------------

  async search(q) {
    const res = await api.search(q);
    return {
      tickets: res.tickets.map((t) => ({ id: t.id, num: t.number, subject: t.subject, status: uiStatus(t.status) })),
      customers: res.customers.map((c) => ({
        id: c.id, name: c.name, email: c.email, orgName: c.company?.name ?? '—',
      })),
    };
  }

  async refreshNotifications() {
    const rows = await api.notifications.list();
    this.notifications = rows.map((n) => this.#mapNotification(n));
    return this.notifications;
  }

  async markAllNotificationsRead() {
    await api.notifications.markAllRead();
    this.notifications = this.notifications.map((n) => ({ ...n, unread: false }));
    return this.notifications;
  }

  // ---- reports ------------------------------------------------------------------------

  async loadReports() {
    const [summary, volume, byChannel, byAgent, volume14] = await Promise.all([
      api.reports.summary(),
      api.reports.volume({ days: 7 }),
      api.reports.byChannel({ days: 7 }),
      api.reports.byAgent({ days: 7 }),
      api.reports.volume({ days: 14 }),
    ]);

    const dayName = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short' });

    this.reports = {
      kpis: [
        { id: 'k1', label: 'People waiting', value: String(summary.openTickets), delta: 'Open right now' },
        { id: 'k2', label: 'First response', value: summary.firstResponseMedian ?? '—', delta: 'Median · 7 days' },
        { id: 'k3', label: 'Time to closed', value: summary.resolutionMedian ?? '—', delta: 'Median · 7 days' },
        { id: 'k4', label: 'Promises kept', value: summary.slaMetPct != null ? `${summary.slaMetPct}%` : '—', delta: 'SLA met · 7 days' },
        { id: 'k5', label: 'Resolved', value: String(summary.resolvedLast7Days), delta: 'Last 7 days' },
      ],
      volume: volume.map((v) => ({ d: dayName(v.d), created: v.created, resolved: v.resolved })),
      byChannel: byChannel.map((c) => ({ label: CHANNEL_LABEL[c.channel] ?? c.channel, n: c.count })),
      byAgent: byAgent.map((a) => ({ id: a.id, name: a.name, open: a.open, resolved: a.resolved, avg: a.avgResolution ?? '—' })),
    };

    // drill-downs: real 14-day series + real breakdowns; sample tickets fetched on demand
    const createdSeries = volume14.map((v) => v.created);
    const resolvedSeries = volume14.map((v) => v.resolved);
    const channelBreakdown = this.reports.byChannel.map((c) => ({ label: c.label, n: c.n }));
    const agentBreakdown = byAgent.slice(0, 4).map((a) => ({ label: a.name.split(' ')[0], n: a.resolved }));
    this.drilldowns = {
      k1: {
        title: 'Open tickets', value: String(summary.openTickets),
        note: 'Created per day over the last two weeks.', axis: 'Created per day',
        series: createdSeries, breakdown: channelBreakdown, view: 'all-open',
      },
      k2: {
        title: 'First response', value: summary.firstResponseMedian ?? '—',
        note: 'Median time to the first public reply, last 7 days.', axis: 'Created per day',
        series: createdSeries, breakdown: channelBreakdown, view: 'breaching',
      },
      k3: {
        title: 'Resolution', value: summary.resolutionMedian ?? '—',
        note: 'Median time from open to resolved, last 7 days.', axis: 'Resolved per day',
        series: resolvedSeries, breakdown: agentBreakdown, view: 'pending',
      },
      k4: {
        title: 'SLA met', value: summary.slaMetPct != null ? `${summary.slaMetPct}%` : '—',
        note: 'Share of resolutions inside their target, last 7 days.', axis: 'Resolved per day',
        series: resolvedSeries, breakdown: agentBreakdown, view: 'breaching',
      },
      k5: {
        title: 'Resolved', value: String(summary.resolvedLast7Days),
        note: 'Conversations closed out over the last two weeks.', axis: 'Resolved per day',
        series: resolvedSeries, breakdown: agentBreakdown, view: 'resolved',
      },
    };
    // attach three sample conversations per drill-down
    await Promise.all(
      Object.values(this.drilldowns).map(async (d) => {
        const res = await api.tickets.list({ view: d.view, limit: 3 }).catch(() => ({ data: [] }));
        d.tickets = res.data.map((t) => ({ id: t.id, num: t.number, subject: t.subject, status: uiStatus(t.status) }));
      }),
    );
    return this.reports;
  }

  // ---- api keys (settings pane) ----------------------------------------------------------

  /**
   * Mint a key for an integration.
   *
   * The API refuses an unscoped key unless instance-wide access is asked for
   * explicitly, so the console binds the key to the signing-in admin's own team
   * by default — the safe choice. `teamId: null` opts into instance-wide, which
   * the settings UI should surface as a deliberate toggle rather than a default.
   */
  /**
   * Mint a key. `scopes` is a real argument now: it used to be hardcoded to
   * tickets:read/write, so every key made from the console 403'd on the chat
   * routes — which are the only ones a chatbot uses.
   */
  async generateApiKey({ name = 'console key', scopes, teamId } = {}) {
    const boundTo = teamId === undefined ? this.currentUser?.teamId ?? null : teamId;
    const key = await api.apiKeys.create({
      name,
      scopes: scopes?.length ? scopes : ['tickets:read', 'tickets:write'],
      ...(boundTo ? { teamId: boundTo } : { allowInstanceWide: true }),
    });
    await api.apiKeys.list().then((keys) => {
      this.apiKeys = keys.map((k) => ({
        id: k.id, name: k.name, scope: (k.scopes ?? []).join(', '), active: k.isActive !== false,
        team: k.team?.name ?? 'All teams',
        created: new Date(k.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
        last: k.lastUsedAt ? this.#rel(ms(k.lastUsedAt)) + ' ago' : 'Never',
      }));
    }).catch(() => {});
    return key.secret;
  }

  // ---- invitations (settings pane) -------------------------------------------------------

  /**
   * Pending invitations, in the shape the team & users table reads.
   *
   * Timestamps become epoch ms like everywhere else, because the settings table
   * ticks its "expires in…" off the same Date.now() clock as the SLA counters.
   */
  async listInvitations() {
    const rows = await api.invitations.list();
    this.invitations = (rows ?? []).map((i) => this.#mapInvitation(i));
    return this.invitations;
  }

  /**
   * `invitedBy` is whoever the API hands us — an id, a nested user, or a plain
   * name. Resolve it against the agent cache first so the table shows a person
   * rather than a uuid, and fall back to 'someone' rather than printing one.
   */
  #mapInvitation(i) {
    const by = i.invitedBy;
    const byId = isUuid(by) ? by : by?.id;
    const invitedBy =
      this.agents.find((a) => a.id === byId)?.name ??
      (typeof by === 'string' ? (isUuid(by) ? 'someone' : by) : by?.name ?? by?.email ?? 'someone');
    return {
      id: i.id,
      email: i.email,
      role: i.role,
      status: i.status ?? 'pending',
      invitedBy,
      createdAt: ms(i.createdAt),
      expiresAt: ms(i.expiresAt),
    };
  }

  /**
   * Invite somebody. `teamId` is optional and only sent when chosen — an empty
   * string would be a uuid the API has to reject.
   */
  async createInvitation({ email, role, teamId } = {}) {
    const invitation = await api.invitations.create({ email, role, ...(teamId ? { teamId } : {}) });
    return invitation;
  }

  /** Revoke. The row goes; the token it stood for stops working immediately. */
  async revokeInvitation(id) {
    await api.invitations.revoke(id);
    this.invitations = this.invitations.filter((i) => i.id !== id);
    return this.invitations;
  }

  // ---- realtime -----------------------------------------------------------------------------

  /** Subscribe to server events. Returns an unsubscribe function. */
  onEvent(fn) {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  /** True when this client itself created the message (skip the "someone replied" banner). */
  isLocalMessage(messageId) {
    return this.#localMessageIds.has(messageId);
  }

  async #connectSocket() {
    this.#disconnectSocket();
    const token = currentSession()?.accessToken;
    if (!token) return;
    try {
      const { io } = await import('socket.io-client');
      // auth as a callback, not a captured value: reconnects after an access
      // token rotates must present the CURRENT token or the gateway rejects them
      const socket = io(WS_URL, {
        path: '/ws',
        auth: (cb) => cb({ token: currentSession()?.accessToken ?? token }),
        reconnectionAttempts: 10,
      });
      for (const event of ['ticket.created', 'ticket.updated', 'ticket.assigned', 'message.added', 'sla.warning', 'notification.created']) {
        socket.on(event, (payload) => {
          for (const fn of this.#listeners) fn(event, payload ?? {});
        });
      }
      this.#socket = socket;
    } catch {
      /* realtime is progressive enhancement — polling still works */
    }
  }

  #disconnectSocket() {
    this.#socket?.disconnect();
    this.#socket = null;
  }
}

export const adapter = new Adapter();
