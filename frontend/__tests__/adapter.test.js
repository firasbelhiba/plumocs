/**
 * The adapter translates API DTOs into the shapes the console screens read.
 * Every mismatch here shows up as wrong data on screen, so the mappings are
 * pinned: epoch conversion, status spelling, null SLA dates, and the tag
 * markers the UI must never see.
 */
import { adapter } from '@/lib/api/adapter';
import * as api from '@/lib/api/endpoints';

jest.mock('@/lib/api/endpoints');

const ISO = '2026-07-29T10:00:00.000Z';
const EPOCH = Date.parse(ISO);

const TICKET_ID = '58c38cb5-763c-481e-901e-fbcddbbd71f9';

const ticketDto = (over = {}) => ({
  id: TICKET_ID,
  number: 1042,
  subject: "can't reset my account key",
  status: 'open',
  priority: 'urgent',
  channel: 'email',
  customerId: 'c-1',
  customer: { id: 'c-1', name: 'Ines Duarte', email: 'ines@nw.com', timezone: 'Europe/Lisbon', locale: 'pt-PT', company: { id: 'o-1', name: 'Northwind Health' } },
  assigneeId: 'u-2',
  teamId: 't-1',
  tags: ['account', 'urgent'],
  slaPausedAt: null,
  slaPolicy: { id: 'p1', name: 'Urgent' },
  firstResponseDueAt: ISO,
  resolutionDueAt: ISO,
  firstRespondedAt: null,
  resolvedAt: null,
  createdAt: ISO,
  updatedAt: ISO,
  messages: [{ body: 'the key is stuck', isInternalNote: false, authorType: 'customer' }],
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
});

describe('ticket row mapping', () => {
  it('converts ISO timestamps to epoch ms for the ticking clocks', async () => {
    api.tickets.list.mockResolvedValue({ data: [ticketDto()], page: { total: 1, limit: 25 } });
    const { rows } = await adapter.listTickets({});
    expect(rows[0].updatedAt).toBe(EPOCH);
    expect(rows[0].createdAt).toBe(EPOCH);
    expect(rows[0].sla.firstResponse.dueAt).toBe(EPOCH);
  });

  it('translates on_hold to the on-hold spelling the UI uses', async () => {
    api.tickets.list.mockResolvedValue({ data: [ticketDto({ status: 'on_hold' })], page: { total: 1, limit: 25 } });
    const { rows } = await adapter.listTickets({});
    expect(rows[0].status).toBe('on-hold');
  });

  it('hides sla:* sweep markers from the tag list', async () => {
    api.tickets.list.mockResolvedValue({
      data: [ticketDto({ tags: ['account', 'sla:breached', 'urgent'] })],
      page: { total: 1, limit: 25 },
    });
    const { rows } = await adapter.listTickets({});
    expect(rows[0].tags).toEqual(['account', 'urgent']);
  });

  // regression: mapping null to Date.now() rendered no-policy tickets as breaching
  it('keeps a missing SLA due date null instead of inventing "now"', async () => {
    api.tickets.list.mockResolvedValue({
      data: [ticketDto({ firstResponseDueAt: null, resolutionDueAt: null, slaPolicy: null })],
      page: { total: 1, limit: 25 },
    });
    const { rows } = await adapter.listTickets({});
    expect(rows[0].sla.firstResponse.dueAt).toBeNull();
    expect(rows[0].sla.resolution.dueAt).toBeNull();
  });

  it('builds the row snippet from the latest message', async () => {
    api.tickets.list.mockResolvedValue({ data: [ticketDto()], page: { total: 1, limit: 25 } });
    const { rows } = await adapter.listTickets({});
    expect(rows[0].snippet).toBe('the key is stuck');
  });

  it('prefixes an internal note and an own reply in the snippet', async () => {
    api.tickets.list.mockResolvedValue({
      data: [
        ticketDto({ id: 'a', messages: [{ body: 'team only', isInternalNote: true, authorType: 'agent' }] }),
        ticketDto({ id: 'b', messages: [{ body: 'sent it', isInternalNote: false, authorType: 'agent' }] }),
      ],
      page: { total: 2, limit: 25 },
    });
    const { rows } = await adapter.listTickets({});
    expect(rows[0].snippet).toMatch(/^internal note · /);
    expect(rows[1].snippet).toMatch(/^you · /);
  });

  it('surfaces the customer name and org for the row', async () => {
    api.tickets.list.mockResolvedValue({ data: [ticketDto()], page: { total: 1, limit: 25 } });
    const { rows } = await adapter.listTickets({});
    expect(rows[0].customerName).toBe('Ines Duarte');
    expect(rows[0].customerOrg).toBe('Northwind Health');
  });
});

describe('list query translation', () => {
  it('maps UI filters onto API params and re-spells on-hold', async () => {
    api.tickets.list.mockResolvedValue({ data: [], page: { total: 0, limit: 25 } });
    await adapter.listTickets({
      view: 'breaching',
      sort: 'sla',
      page: 2,
      pageSize: 25,
      filters: { status: ['open', 'on-hold'], priority: ['high'], channel: [], tag: 'billing', team: 't-1', assignee: '@unassigned', range: '7d' },
    });
    const params = api.tickets.list.mock.calls[0][0];
    expect(params).toMatchObject({
      view: 'breaching', sort: 'sla', offset: 50, limit: 25,
      status: 'open,on_hold', priority: 'high', tag: 'billing', teamId: 't-1', assigneeId: '@unassigned', range: '7d',
    });
    expect(params.channel).toBeUndefined(); // empty arrays are dropped, not sent blank
  });

  it('omits the range when it is "any"', async () => {
    api.tickets.list.mockResolvedValue({ data: [], page: { total: 0, limit: 25 } });
    await adapter.listTickets({ filters: { range: 'any' } });
    expect(api.tickets.list.mock.calls[0][0].range).toBeUndefined();
  });
});

describe('unread tracking (client-side)', () => {
  it('marks a ticket unread until it has been opened', async () => {
    api.tickets.list.mockResolvedValue({ data: [ticketDto()], page: { total: 1, limit: 25 } });
    const first = await adapter.listTickets({});
    expect(first.rows[0].unread).toBe(true);

    api.tickets.get.mockResolvedValue({ ...ticketDto(), messages: [] });
    api.tickets.audit.mockResolvedValue([]);
    await adapter.getTicket(TICKET_ID);

    const second = await adapter.listTickets({});
    expect(second.rows[0].unread).toBe(false);
  });
});

describe('thread mapping', () => {
  beforeEach(() => {
    api.tickets.audit.mockResolvedValue([]);
  });

  it('classifies customer messages, agent replies, and internal notes', async () => {
    api.tickets.get.mockResolvedValue(ticketDto({
      messages: [
        { id: 'm1', authorType: 'customer', authorId: 'c-1', body: 'help', isInternalNote: false, createdAt: ISO, attachments: [] },
        { id: 'm2', authorType: 'agent', authorId: 'u-2', body: 'on it', isInternalNote: false, createdAt: ISO, attachments: [] },
        { id: 'm3', authorType: 'agent', authorId: 'u-2', body: 'note for the team', isInternalNote: true, createdAt: ISO, attachments: [] },
      ],
    }));
    const t = await adapter.getTicket(TICKET_ID);
    expect(t.thread.map((m) => m.kind)).toEqual(['message', 'message', 'note']);
    expect(t.thread[0].side).toBe('customer');
    expect(t.thread[1].side).toBe('agent');
  });

  // The byline under a customer's message is their COMPANY name, read straight
  // off the wire as `customer.company.name` (renamed from `organization` on
  // 2026-08-08). It falls back to '' when absent, so reading the wrong key does
  // not throw and does not blank a screen — it silently drops the company from
  // every customer message in every thread. Pin the mapping so the fallback
  // cannot quietly become the only behaviour.
  it('labels a customer message with their company, not an empty string', async () => {
    api.tickets.get.mockResolvedValue(ticketDto({
      messages: [{ id: 'm1', authorType: 'customer', authorId: 'c-1', body: 'help', isInternalNote: false, createdAt: ISO, attachments: [] }],
    }));
    const t = await adapter.getTicket(TICKET_ID);
    expect(t.thread[0].role).toBe('Northwind Health');
  });

  it('falls back to an empty byline when the customer has no company', async () => {
    api.tickets.get.mockResolvedValue(ticketDto({
      customer: { id: 'c-1', name: 'Ines Duarte', email: 'ines@nw.com', timezone: 'Europe/Lisbon', locale: 'pt-PT' },
      messages: [{ id: 'm1', authorType: 'customer', authorId: 'c-1', body: 'help', isInternalNote: false, createdAt: ISO, attachments: [] }],
    }));
    const t = await adapter.getTicket(TICKET_ID);
    expect(t.thread[0].role).toBe('');
  });

  it('formats attachment sizes for display', async () => {
    api.tickets.get.mockResolvedValue(ticketDto({
      messages: [{ id: 'm1', authorType: 'customer', authorId: 'c-1', body: 'see attached', isInternalNote: false, createdAt: ISO, attachments: [{ id: 'a1', filename: 'receipt.pdf', sizeBytes: 86_016 }] }],
    }));
    const t = await adapter.getTicket(TICKET_ID);
    expect(t.thread[0].attachments[0]).toMatchObject({ name: 'receipt.pdf', size: '84 kb' });
  });

  it('exposes epoch timestamps the UI can diff against now', async () => {
    api.tickets.get.mockResolvedValue(ticketDto({
      messages: [{ id: 'm1', authorType: 'customer', authorId: 'c-1', body: 'hi', isInternalNote: false, createdAt: ISO, attachments: [] }],
    }));
    const t = await adapter.getTicket(TICKET_ID);
    expect(t.thread[0].at).toBe(EPOCH);
  });
});

describe('ticket id resolution', () => {
  it('passes a uuid straight through', async () => {
    api.tickets.get.mockResolvedValue(ticketDto({ messages: [] }));
    api.tickets.audit.mockResolvedValue([]);
    await adapter.getTicket(TICKET_ID);
    expect(api.tickets.get).toHaveBeenCalledWith(TICKET_ID);
    expect(api.tickets.list).not.toHaveBeenCalled();
  });

  it('resolves a human ref like tk1042 via lookup', async () => {
    api.tickets.list.mockResolvedValue({ data: [ticketDto()], page: { total: 1, limit: 5 } });
    api.tickets.get.mockResolvedValue(ticketDto({ messages: [] }));
    api.tickets.audit.mockResolvedValue([]);
    await adapter.getTicket('tk1042');
    expect(api.tickets.list).toHaveBeenCalledWith({ q: '1042', limit: 5 });
    expect(api.tickets.get).toHaveBeenCalledWith(TICKET_ID);
  });

  it('raises a 404-shaped error for an unknown ref', async () => {
    api.tickets.list.mockResolvedValue({ data: [], page: { total: 0, limit: 5 } });
    await expect(adapter.getTicket('tk9999')).rejects.toMatchObject({ status: 404 });
  });
});

describe('status translation on writes', () => {
  it('sends on_hold back to the API', async () => {
    api.tickets.patch.mockResolvedValue({});
    await adapter.patchTicket('tk-1', { status: 'on-hold' });
    expect(api.tickets.patch).toHaveBeenCalledWith('tk-1', { status: 'on_hold' });
  });

  it('drops the client-only unread flag rather than sending it', async () => {
    api.tickets.patch.mockResolvedValue({});
    const res = await adapter.patchTicket('tk-1', { unread: false });
    expect(api.tickets.patch).not.toHaveBeenCalled();
    expect(res).toEqual({ ok: true });
  });

  it('translates bulk status too', async () => {
    api.tickets.bulk.mockResolvedValue({ results: [] });
    await adapter.bulkTickets(['a'], 'status', { status: 'on-hold' });
    expect(api.tickets.bulk).toHaveBeenCalledWith({ ids: ['a'], action: 'status', status: 'on_hold' });
  });
});

describe('counts and facets', () => {
  it('re-spells on_hold in the status facet', async () => {
    api.tickets.counts.mockResolvedValue({
      views: { 'all-open': 20, unassigned: 5, 'my-open': 4, breaching: 3, pending: 4, resolved: 4 },
      facets: { status: { open: 13, on_hold: 1 }, priority: {}, channel: {}, tag: {} },
    });
    const { views, facets } = await adapter.refreshCounts();
    expect(views['all-open']).toBe(20);
    expect(facets.status['on-hold']).toBe(1);
    expect(facets.status.on_hold).toBeUndefined();
  });
});

describe('search results', () => {
  it('normalizes ticket numbers, status and org names', async () => {
    api.search.mockResolvedValue({
      tickets: [{ id: 'tk1', number: 1042, subject: 'key', status: 'on_hold' }],
      customers: [{ id: 'c1', name: 'Ines', email: 'i@n.com', company: { name: 'Northwind' } }],
    });
    const res = await adapter.search('key');
    expect(res.tickets[0]).toMatchObject({ num: 1042, status: 'on-hold' });
    expect(res.customers[0].orgName).toBe('Northwind');
  });
});

describe('customer profile', () => {
  it('maps stats and ticket history into the shapes the screen reads', async () => {
    api.customers.get.mockResolvedValue({
      id: 'c-1', name: 'Ines Duarte', email: 'ines@nw.com', phone: '+351', timezone: 'Europe/Lisbon',
      company: { id: 'o-1', name: 'Northwind Health' },
      tickets: [{ id: 'tk1', number: 1042, subject: 'key', status: 'on_hold', priority: 'urgent', createdAt: ISO, updatedAt: ISO }],
      stats: { total: 1, open: 1, avgResolution: '5h 48m', lastSeen: ISO },
    });
    const c = await adapter.getCustomer('c-1');
    expect(c.orgName).toBe('Northwind Health');
    expect(c.tickets[0]).toMatchObject({ num: 1042, status: 'on-hold', updatedAt: EPOCH });
    expect(c.stats).toMatchObject({ total: 1, open: 1, avgResolution: '5h 48m', lastSeen: EPOCH });
  });

  it('degrades gracefully when stats are absent', async () => {
    api.customers.get.mockResolvedValue({ id: 'c-1', name: 'x', email: 'e', tickets: [] });
    const c = await adapter.getCustomer('c-1');
    expect(c.stats.avgResolution).toBe('—');
    expect(c.orgName).toBe('—');
  });
});

describe('failure simulation (demo switch)', () => {
  it('fails exactly the next mutation, then recovers', async () => {
    api.tickets.patch.mockResolvedValue({});
    adapter.simulateNextFailure();
    await expect(adapter.patchTicket('tk-1', { priority: 'high' })).rejects.toBeDefined();
    await expect(adapter.patchTicket('tk-1', { priority: 'high' })).resolves.toBeDefined();
  });
});
