/* Plumo CS — mock data layer.
 * Every screen talks to this module only, through the async functions at the
 * bottom. Their signatures mirror a REST API, so swapping this file for real
 * network calls does not touch any screen.
 */

const MIN = 60000, HOUR = 3600000, DAY = 86400000;
const T0 = Date.now();

export const teams = [
  { id: 't1', name: 'Tier 1' },
  { id: 't2', name: 'Billing' },
];

export const orgs = [
  { id: 'o1', name: 'Northwind Health', plan: 'Business', seats: 240 },
  { id: 'o2', name: 'HashCare', plan: 'Enterprise', seats: 1100 },
  { id: 'o3', name: 'Vela Studio', plan: 'Team', seats: 32 },
  { id: 'o4', name: 'Bramble Coffee', plan: 'Team', seats: 18 },
];

export const agents = [
  { id: 'a1', name: 'Mira Solberg',  role: 'lead',  team: 't1', email: 'mira@plumo.app',  avail: 'available', av: 1, lastActive: 2 },
  { id: 'a2', name: 'Tomas Ek',      role: 'agent', team: 't1', email: 'tomas@plumo.app', avail: 'available', av: 2, lastActive: 1 },
  { id: 'a3', name: 'Aya Nakamura',  role: 'agent', team: 't1', email: 'aya@plumo.app',   avail: 'away',      av: 3, lastActive: 46 },
  { id: 'a4', name: 'Devon Price',   role: 'agent', team: 't2', email: 'devon@plumo.app', avail: 'available', av: 4, lastActive: 8 },
  { id: 'a5', name: 'Rosa Lindqvist',role: 'agent', team: 't2', email: 'rosa@plumo.app',  avail: 'available', av: 5, lastActive: 3 },
  { id: 'a6', name: 'Jules Okafor',  role: 'agent', team: 't1', email: 'jules@plumo.app', avail: 'away',      av: 6, lastActive: 120 },
  { id: 'a7', name: 'Sam Whitfield', role: 'agent', team: 't2', email: 'sam@plumo.app',   avail: 'available', av: 1, lastActive: 15 },
  { id: 'a8', name: 'Priya Raman',   role: 'admin', team: 't1', email: 'priya@plumo.app', avail: 'available', av: 4, lastActive: 5 },
];

/* the signed-in agent for each role, so the console can preview all three */
export const meFor = { agent: 'a2', lead: 'a1', admin: 'a8' };

export const customers = [
  { id: 'c1',  name: 'Ines Duarte',   email: 'ines@northwindhealth.com',    org: 'o1', tz: 'Europe/Lisbon',       locale: 'pt-PT', phone: '+351 21 555 0148', av: 3 },
  { id: 'c2',  name: 'Marcus Vogel',  email: 'm.vogel@northwindhealth.com', org: 'o1', tz: 'Europe/Berlin',       locale: 'de-DE', phone: '+49 30 5550 221',  av: 5 },
  { id: 'c3',  name: 'Leah Brenner',  email: 'leah.brenner@hashcare.io',    org: 'o2', tz: 'America/New_York',    locale: 'en-US', phone: '+1 212 555 0119',  av: 2 },
  { id: 'c4',  name: 'Ahmed Farouk',  email: 'ahmed@hashcare.io',           org: 'o2', tz: 'Africa/Cairo',        locale: 'ar-EG', phone: '+20 2 5550 774',   av: 6 },
  { id: 'c5',  name: 'Nora Kelley',   email: 'nora@velastudio.co',          org: 'o3', tz: 'America/Los_Angeles', locale: 'en-US', phone: '+1 415 555 0182',  av: 4 },
  { id: 'c6',  name: 'Tobias Lund',   email: 'tobias@velastudio.co',        org: 'o3', tz: 'Europe/Copenhagen',   locale: 'da-DK', phone: '+45 33 555 019',   av: 1 },
  { id: 'c7',  name: 'Rina Patel',    email: 'rina@bramblecoffee.com',      org: 'o4', tz: 'Asia/Kolkata',        locale: 'en-IN', phone: '+91 22 5550 3312', av: 6 },
  { id: 'c8',  name: 'Gus Alvarez',   email: 'gus@bramblecoffee.com',       org: 'o4', tz: 'America/Mexico_City', locale: 'es-MX', phone: '+52 55 5550 8841', av: 2 },
  { id: 'c9',  name: 'Hana Kim',      email: 'hana.kim@northwindhealth.com',org: 'o1', tz: 'Asia/Seoul',          locale: 'ko-KR', phone: '+82 2 555 0166',   av: 5 },
  { id: 'c10', name: 'Elliot Shaw',   email: 'elliot@velastudio.co',        org: 'o3', tz: 'Europe/London',       locale: 'en-GB', phone: '+44 20 5550 771',  av: 3 },
];

export const tags = [
  { id: 'billing',     label: 'billing',     tone: 'tag-billing' },
  { id: 'bug',         label: 'bug',         tone: 'tag-bug' },
  { id: 'how-to',      label: 'how-to',      tone: 'tag-howto' },
  { id: 'account',     label: 'account',     tone: 'tag-account' },
  { id: 'urgent',      label: 'urgent',      tone: 'tag-urgent' },
  { id: 'integration', label: 'integration', tone: 'tag-integration' },
];

export const channels = [
  { id: 'email',    label: 'email' },
  { id: 'api',      label: 'api' },
  { id: 'widget',   label: 'widget' },
  { id: 'hashcare', label: 'HashCare' },
];

export const slaPolicies = [
  { id: 'p1', name: 'Standard', priority: 'low, normal', firstResponse: '4h', resolution: '24h', hours: 'business hours' },
  { id: 'p2', name: 'Priority', priority: 'high',        firstResponse: '1h', resolution: '8h',  hours: 'business hours' },
  { id: 'p3', name: 'Urgent',   priority: 'urgent',      firstResponse: '15m', resolution: '4h', hours: '24/7' },
];

export const cannedResponses = [
  { id: 'r1', title: 'warm opener', team: 'Tier 1', tags: ['general'], body: "hi {{name}} — thanks for writing in. i've picked this up and i'm looking at it now. i'll come back to you shortly with something useful." },
  { id: 'r2', title: 'account key reset', team: 'Tier 1', tags: ['account'], body: "i've sent a fresh reset link to this address — it's good for 30 minutes. if it hasn't landed in a couple of minutes, do check the spam folder and i'll try another route." },
  { id: 'r3', title: 'double charge refund', team: 'Billing', tags: ['billing'], body: "you're right, that's a duplicate charge — sorry about that. i've refunded it in full; it usually shows on the statement within 3–5 working days." },
  { id: 'r4', title: 'need a little more detail', team: 'Tier 1', tags: ['bug'], body: "could you tell me which browser and version you're on, and roughly when you last saw it? a screenshot helps too, whenever you have a moment." },
  { id: 'r5', title: 'export walkthrough', team: 'Tier 1', tags: ['how-to'], body: "settings → data → export gives you a csv of everything in the pack. it's emailed to you when it's ready, usually under a minute." },
];

/* ---- ticket seeds -----------------------------------------------------
 * [num, subject, cust, status, priority, channel, tags, assignee, team,
 *  createdH, updatedM, frDueM, frMetM, resDueH, unread, sourceRef]
 * frDueM  = minutes from now the first response is due (negative = passed)
 * frMetM  = minutes ago the first response was met (null = not yet)
 */
const seeds = [
  [1042, "can't reset my account key",            'c1', 'open',     'urgent', 'email',    ['account','urgent'],       'a2', 't1',  6,   4,  22,  null,  3,  1, null],
  [1041, 'billing charged twice this month',      'c3', 'open',     'high',   'email',    ['billing'],                'a4', 't2',  9,  12, -18,  null,  6,  1, null],
  [1040, 'widget not loading on mobile safari',   'c5', 'new',      'high',   'widget',   ['bug'],                    null,'t1',  1,   3,  38,  null, 11,  1, null],
  [1039, 'how do i export my data?',              'c7', 'pending',  'normal', 'email',    ['how-to'],                 'a3', 't1', 22,  95, 240,   88, 30,  0, null],
  [1038, 'sso login loops back to sign-in',       'c4', 'open',     'urgent', 'hashcare', ['bug','urgent'],           'a1', 't1',  3,   7,  -6,   12,  2,  1, 'HashCare CS-4821'],
  [1037, 'invoice missing vat number',            'c2', 'open',     'normal', 'email',    ['billing'],                'a5', 't2', 30, 140, 150,  120, 18,  0, null],
  [1036, 'api returns 429 on every request',      'c6', 'open',     'high',   'api',      ['bug','integration'],      'a2', 't1',  2,   9,  26,   35,  7,  1, null],
  [1035, "team member can't see shared board",    'c9', 'new',      'normal', 'widget',   ['account'],                null,'t1',  1,  16, 205,  null, 22,  1, null],
  [1034, 'request: bulk import from csv',         'c10','pending',  'low',    'email',    ['how-to'],                 'a6', 't1', 51, 300, 400,  260, 60,  0, null],
  [1033, 'password reset email never arrives',    'c8', 'open',     'high',   'email',    ['account'],                'a3', 't1',  4,  22, -42,  null,  4,  1, null],
  [1032, 'attachment upload fails over 10mb',     'c1', 'open',     'normal', 'widget',   ['bug'],                    'a7', 't1', 12,  48, 190,   95, 12,  0, null],
  [1031, "plan downgrade didn't take effect",     'c5', 'on-hold',  'normal', 'email',    ['billing'],                'a4', 't2', 40, 210, 300,  180, 40,  0, null],
  [1030, 'how do i move a task between packs?',   'c7', 'resolved', 'low',    'widget',   ['how-to'],                 'a2', 't1', 26, 180, -60,  400, -6,  0, null],
  [1029, 'hashcare sync stopped overnight',       'c3', 'open',     'urgent', 'hashcare', ['integration','urgent'],   'a1', 't1',  8,   2,  -3,   40,  1,  1, 'HashCare CS-4790'],
  [1028, 'duplicate notifications for one task',  'c6', 'open',     'low',    'api',      ['bug'],                    null,'t1', 15,  70, 120,  null, 15,  0, null],
  [1027, 'can we get an invoice for last quarter?','c2','pending',  'low',    'email',    ['billing','how-to'],       'a5', 't2', 60, 330, 420,  300, 55,  0, null],
  [1026, 'dark mode text unreadable in vault',    'c10','open',     'normal', 'widget',   ['bug'],                    'a6', 't1', 19,  86, 170,   60, 14,  0, null],
  [1025, 'seat count wrong after removing user',  'c4', 'open',     'high',   'email',    ['billing','account'],      'a4', 't2',  5,  18,  44,   30,  5,  1, null],
  [1024, 'how do i set up business hours?',       'c9', 'resolved', 'low',    'email',    ['how-to'],                 'a3', 't1', 34, 400, -90,  600, -12, 0, null],
  [1023, 'mobile app crashes on launch (android)','c8', 'new',      'urgent', 'widget',   ['bug','urgent'],           null,'t1',  0,   1,  11,  null,  3,  1, null],
  [1022, 'webhook deliveries retrying forever',   'c6', 'open',     'high',   'api',      ['integration','bug'],      'a7', 't1',  7,  33, -70,   55,  2,  0, null],
  [1021, 'refund for accidental annual upgrade',  'c1', 'open',     'high',   'email',    ['billing','urgent'],       'a5', 't2', 10,  26,  29,   45,  8,  1, null],
  [1020, "can't archive a completed project",     'c5', 'closed',   'low',    'widget',   ['how-to'],                 'a2', 't1', 72, 900, -400, 800, -40, 0, null],
  [1019, 'export csv has empty date column',      'c3', 'open',     'normal', 'api',      ['bug'],                    'a6', 't1', 16,  58, 155,   80, 13,  0, null],
  [1018, 'two-factor codes rejected',             'c4', 'open',     'urgent', 'hashcare', ['account','urgent'],       'a1', 't1',  2,   5,   9,   14,  2,  1, 'HashCare CS-4802'],
  [1017, 'how do i share a read-only view?',      'c7', 'pending',  'normal', 'email',    ['how-to'],                 'a3', 't1', 28, 260, 280,  200, 26,  0, null],
  [1016, 'rest mode turns off by itself',         'c10','open',     'low',    'widget',   ['bug'],                    null,'t1', 21, 110, 100,  null, 20,  0, null],
  [1015, 'calendar sync duplicating events',      'c9', 'open',     'normal', 'api',      ['integration'],            'a7', 't1', 13,  44, 165,   70, 16,  0, null],
  [1014, 'account deletion request (gdpr)',       'c8', 'on-hold',  'high',   'email',    ['account'],                'a1', 't1', 44, 240, 320,  210, 36,  0, null],
  [1013, "widget colors don't match our brand",   'c2', 'resolved', 'normal', 'widget',   ['how-to'],                 'a2', 't1', 38, 520, -200, 700, -20, 0, null],
];

const openings = {
  1042: "morning — i've tried the reset link three times and it keeps telling me the key is already in use. i can't get into the vault pack at all and i have a handover tomorrow.",
  1041: "we've been charged twice for july, same amount, same day. i've attached both receipts. could you sort the second one out?",
  1040: "the widget just spins on iphone. works fine on desktop chrome. a few of our people have mentioned it this week.",
  1039: "hello! is there a way to get everything out as a spreadsheet? our finance team wants a copy for the audit.",
  1038: "sso sends me back to the sign-in page in a loop. it started this morning for everyone on our tenant, about 40 people.",
  1037: "the july invoice is missing our vat number so our accounts team won't accept it. can you reissue with it included?",
  1036: "every api call is coming back 429 since roughly 06:00 utc. we haven't changed our request volume.",
  1035: "one of my team can see the board in the list but gets an empty screen when she opens it. the rest of us are fine.",
  1034: "we're moving off a spreadsheet and have about 900 rows. is there a csv import, or do we do it by hand?",
  1033: "no reset email arrives, ever. i've checked spam. i've tried two different addresses.",
  1032: "uploading anything over about 10mb fails silently — the bar reaches the end and then nothing appears.",
  1031: "we downgraded to team on the 3rd but we're still being billed for business and still see the business features.",
  1030: "quick one — can a task be moved from the pm pack into hr, or does it need recreating?",
  1029: "our hashcare sync stopped overnight, nothing since 02:14. patient tickets aren't reaching plumo at all.",
  1028: "i get two push notifications for every task someone assigns me. only one on the web though.",
  1027: "could we get a single invoice covering april to june for expenses? happy to take a pdf.",
  1026: "in dark mode the note text in the vault pack is nearly invisible — dark grey on dark blue.",
  1025: "we removed two people last week but we're still paying for 34 seats. the settings page shows 32.",
  1024: "where do i tell plumo our working hours? we don't want sla clocks running overnight.",
  1023: "the android app closes itself the moment it opens. samsung s23, freshly reinstalled, still nothing.",
  1022: "our webhook endpoint returns 200 but plumo keeps re-delivering the same events, hundreds of times now.",
  1021: "i clicked annual by mistake this morning. can we go back to monthly and refund the difference?",
  1020: "the archive button does nothing on a project that's fully done. minor, but it's cluttering the list.",
  1019: "the exported csv has a date column with nothing in it. everything else looks right.",
  1018: "our authenticator codes are being rejected as invalid. two of us are locked out completely.",
  1017: "is there a way to share a board with a client without giving them edit rights?",
  1016: "rest mode switches itself off after a few minutes and the shell goes bright again mid-evening.",
  1015: "every calendar event is appearing twice since we reconnected google last friday.",
  1014: "we need one of our accounts fully deleted under gdpr, with confirmation for our records.",
  1013: "the widget uses plumo blue and it clashes with our palette. can we set our own colour?",
};

const agentReplies = {
  1042: "hi ines — thanks for the detail, that helps. the key is stuck in a half-rotated state on our side, which is why it reads as in use. i'm clearing it now and will send you a fresh link the moment it's done. you'll be in well before tomorrow.",
  1041: "hi leah — you're right, that's a duplicate. i've refunded the second charge in full; it usually shows on the statement within 3–5 working days. sorry for the noise.",
  1038: "hi ahmed — we can see the loop in our logs and it's on us: a certificate rotated early this morning. our platform team is on it and i'll update you here every 30 minutes until it's cleared.",
  1036: "hi tobias — you're being caught by a rate-limit rule we tightened yesterday. i've raised your ceiling back to where it was; you should see 429s stop within a couple of minutes.",
  1033: "hi gus — nothing is leaving our side for that domain, so it looks like it's being dropped upstream. i've queued a resend from a different sender and asked your it contact to allow it.",
  1029: "hi leah — sync stopped when the hashcare token expired at 02:14. i've refreshed it and the backlog is replaying now; about 60 tickets should land in the next few minutes.",
  1025: "hi ahmed — the seat count didn't follow the removals through to billing. i've corrected it to 32 and credited the two seats on your next invoice.",
  1021: "hi ines — no trouble at all. i've put you back on monthly and refunded the difference; you'll see it within a few days.",
  1018: "hi ahmed — your tenant's clock drifted by about 40 seconds, which is enough to reject codes. i've widened the window while we fix it; try a fresh code now.",
  1039: "hi rina — yes: settings → data → export gives you a csv of everything in the pack, emailed when it's ready. i'll leave this open in case finance needs a hand with it.",
  1024: "hi hana — settings → business hours, then set your timezone and weekly schedule. sla clocks pause outside those hours automatically.",
  1030: "hi rina — you can drag it across, or use move to pack from the task menu. nothing is lost when it moves.",
};

const notes = {
  1042: "vault key rotation half-failed — same shape as #1009. logged with platform, they're patching the rotation job today. no need to escalate unless it recurs.",
  1041: "second charge came from the retry worker. finance are aware, refund raised as REF-8841.",
  1038: "cert rotated 12h early — incident INC-204 is open. mira is on the bridge call, updates every 30m.",
  1029: "token refresh is manual for hashcare until the oauth work ships. if this comes back, ping devon before touching anything.",
  1023: "third android crash report this week, all on one build. sending to mobile with the trace.",
  1033: "domain is on a strict dmarc policy — their it needs to allow our sender. drafted the wording for them.",
  1018: "clock drift on their tenant. widened window is temporary, remove it when platform ships the ntp fix.",
  1022: "their endpoint returns 200 but with an empty body, so our retry logic never marks it delivered. explained gently, they're changing it.",
};

const followUps = {
  1042: "that would be a relief, thank you. i'll keep an eye out for the link.",
  1038: "understood — please do keep the updates coming, our clinicians are asking.",
  1029: "seeing tickets arrive now. i'll confirm once the backlog is clear.",
  1041: "perfect, thanks for being quick about it.",
  1036: "429s have stopped. thanks tobias-side is happy again.",
};

const custOf = id => customers.find(c => c.id === id);
const orgName = id => (orgs.find(o => o.id === id) || {}).name || '—';
const agentOf = id => agents.find(a => a.id === id) || null;

function buildThread(s) {
  const [num, subject, custId, status, priority, channel, tagIds, assigneeId, , createdH, updatedM, , frMetM] = s;
  const cust = custOf(custId);
  const created = T0 - createdH * HOUR - 4 * MIN;
  const items = [];
  items.push({
    kind: 'message', id: num + '-m1', author: cust.name, authorId: custId, side: 'customer',
    role: orgName(cust.org), at: created, body: openings[num] || 'hello — hoping you can help with this one.',
    attachments: num === 1041 ? [{ name: 'receipt-july-a.pdf', size: '84 kb' }, { name: 'receipt-july-b.pdf', size: '81 kb' }] : (num === 1040 ? [{ name: 'widget-spinner.png', size: '412 kb' }] : []),
  });
  items.push({ kind: 'event', id: num + '-e1', at: created + 40000, text: 'ticket created via ' + (channel === 'hashcare' ? 'HashCare' : channel) });
  const ag = agentOf(assigneeId);
  if (ag) items.push({ kind: 'event', id: num + '-e2', at: created + 90000, text: ag.name + ' was assigned' });
  if (frMetM != null && ag) {
    const repliedAt = T0 - frMetM * MIN;
    items.push({
      kind: 'message', id: num + '-m2', author: ag.name, authorId: ag.id, side: 'agent',
      role: ag.role === 'lead' ? 'team lead' : 'support', at: repliedAt, attachments: [],
      body: agentReplies[num] || ("hi " + cust.name.split(' ')[0].toLowerCase() + " — thanks for flagging this. i've had a look and i'm picking it up now; i'll come back to you with something useful shortly."),
    });
    items.push({ kind: 'event', id: num + '-e3', at: repliedAt + 1000, text: 'first response target met' });
    if (notes[num]) items.push({ kind: 'note', id: num + '-n1', author: ag.name, authorId: ag.id, at: repliedAt + 4 * MIN, body: notes[num], attachments: [] });
    if (followUps[num]) items.push({ kind: 'message', id: num + '-m3', author: cust.name, authorId: custId, side: 'customer', role: orgName(cust.org), at: T0 - updatedM * MIN, body: followUps[num], attachments: [] });
  } else if (ag) {
    items.push({ kind: 'note', id: num + '-n1', author: ag.name, authorId: ag.id, at: created + 8 * MIN, attachments: [],
      body: notes[num] || 'picked this up from the queue. checking their account history before i reply.' });
  }
  if (status === 'pending') items.push({ kind: 'event', id: num + '-e4', at: T0 - updatedM * MIN + 2000, text: 'status changed to pending — sla clock paused' });
  if (status === 'on-hold') items.push({ kind: 'event', id: num + '-e4', at: T0 - updatedM * MIN + 2000, text: 'status changed to on-hold — waiting on another team' });
  if (status === 'resolved' || status === 'closed') {
    items.push({ kind: 'message', id: num + '-m9', author: (ag || agents[1]).name, authorId: (ag || agents[1]).id, side: 'agent', role: 'support', at: T0 - updatedM * MIN - 6 * MIN, attachments: [],
      body: "that's sorted now — i've made the change on our side. i'll leave this closed but do reopen it any time; no need to start again." });
    items.push({ kind: 'event', id: num + '-e5', at: T0 - updatedM * MIN, text: 'status changed to ' + status });
  }
  return items.sort((a, b) => a.at - b.at);
}

function buildTicket(s) {
  const [num, subject, custId, status, priority, channel, tagIds, assigneeId, teamId, createdH, updatedM, frDueM, frMetM, resDueH, unread, sourceRef] = s;
  const thread = buildThread(s);
  const last = [...thread].reverse().find(i => i.kind !== 'event') || thread[0];
  const paused = status === 'pending' || status === 'on-hold';
  const done = status === 'resolved' || status === 'closed';
  return {
    id: 'tk' + num, num, subject, customerId: custId, status, priority, channel,
    tags: tagIds, assigneeId, teamId, unread: !!unread, sourceRef,
    createdAt: T0 - createdH * HOUR - 4 * MIN,
    updatedAt: T0 - updatedM * MIN,
    requester: custOf(custId).email,
    cc: num % 4 === 0 ? ['ops@' + custOf(custId).email.split('@')[1]] : [],
    sla: {
      paused, policy: priority === 'urgent' ? 'Urgent' : priority === 'high' ? 'Priority' : 'Standard',
      firstResponse: { dueAt: T0 + frDueM * MIN, metAt: frMetM == null ? null : T0 - frMetM * MIN },
      resolution: { dueAt: T0 + resDueH * HOUR, metAt: done ? T0 - updatedM * MIN : null },
    },
    snippet: (last.kind === 'note' ? 'internal note · ' : last.side === 'agent' ? 'you · ' : '') + last.body.replace(/\s+/g, ' ').slice(0, 120),
    thread,
    activity: [
      assigneeId ? { at: T0 - updatedM * MIN - 3 * MIN, who: (agentOf(assigneeId) || {}).name, what: 'replied to the customer' } : { at: T0 - updatedM * MIN, who: 'plumo', what: 'routed to ' + (teams.find(t => t.id === teamId) || {}).name },
      { at: T0 - updatedM * MIN - 30 * MIN, who: 'Mira Solberg', what: 'changed priority to ' + priority },
      { at: T0 - createdH * HOUR, who: 'plumo', what: 'created from ' + channel },
    ],
  };
}

let tickets = seeds.map(buildTicket);

export const notifications = [
  { id: 'n1', kind: 'assign', text: 'mira handed leah\'s conversation to you', at: T0 - 4 * MIN, unread: true },
  { id: 'n2', kind: 'sla',    text: 'leah has been waiting a while for a first reply', at: T0 - 18 * MIN, unread: true },
  { id: 'n3', kind: 'mention',text: 'devon mentioned you on ahmed\'s conversation', at: T0 - 52 * MIN, unread: true },
  { id: 'n4', kind: 'sla',    text: "ahmed's first reply is due very soon", at: T0 - 70 * MIN, unread: false },
];

export const reports = {
  kpis: [
    { id: 'k1', label: 'people waiting', value: '128', delta: '-12 this week', good: true },
    { id: 'k2', label: 'first response', value: '38m', delta: 'target 1h', good: true },
    { id: 'k3', label: 'time to closed', value: '6h 12m', delta: '+22m vs last week', good: false },
    { id: 'k4', label: 'promises kept', value: '94%', delta: '+3 pts', good: true },
    { id: 'k5', label: 'how we did', value: '4.6', delta: '212 responses', good: true },
  ],
  volume: [
    { d: 'mon', created: 42, resolved: 38 }, { d: 'tue', created: 51, resolved: 47 },
    { d: 'wed', created: 46, resolved: 52 }, { d: 'thu', created: 58, resolved: 49 },
    { d: 'fri', created: 63, resolved: 55 }, { d: 'sat', created: 19, resolved: 22 },
    { d: 'sun', created: 14, resolved: 12 },
  ],
  byChannel: [
    { label: 'email', n: 61 }, { label: 'widget', n: 39 }, { label: 'api', n: 17 }, { label: 'HashCare', n: 11 },
  ],
  byAgent: [
    { id: 'a2', name: 'Tomas Ek', open: 14, resolved: 41, avg: '5h 02m' },
    { id: 'a3', name: 'Aya Nakamura', open: 11, resolved: 36, avg: '6h 40m' },
    { id: 'a4', name: 'Devon Price', open: 9, resolved: 33, avg: '4h 18m' },
    { id: 'a5', name: 'Rosa Lindqvist', open: 12, resolved: 29, avg: '7h 05m' },
    { id: 'a6', name: 'Jules Okafor', open: 8, resolved: 24, avg: '8h 12m' },
    { id: 'a7', name: 'Sam Whitfield', open: 10, resolved: 27, avg: '5h 46m' },
  ],
};

export const webhooks = [
  { id: 'w1', url: 'https://hooks.northwindhealth.com/plumo', events: 'ticket.created, ticket.updated', status: 'active', last: '2m ago' },
  { id: 'w2', url: 'https://api.hashcare.io/v2/plumo/events', events: 'ticket.*', status: 'active', last: '14m ago' },
  { id: 'w3', url: 'https://vela.zapier-hooks.com/9f21', events: 'message.created', status: 'failing', last: '3h ago · 502' },
];

export const apiKeys = [
  { id: 'k1', name: 'hashcare bridge', scope: 'read, write', created: '12 mar 2026', last: '2m ago' },
  { id: 'k2', name: 'reporting export', scope: 'read', created: '4 jan 2026', last: 'yesterday' },
  { id: 'k3', name: 'legacy widget', scope: 'read', created: '22 nov 2025', last: 'never' },
];

export const businessHours = [
  { day: 'monday', open: '09:00', close: '18:00', on: true },
  { day: 'tuesday', open: '09:00', close: '18:00', on: true },
  { day: 'wednesday', open: '09:00', close: '18:00', on: true },
  { day: 'thursday', open: '09:00', close: '18:00', on: true },
  { day: 'friday', open: '09:00', close: '17:00', on: true },
  { day: 'saturday', open: '—', close: '—', on: false },
  { day: 'sunday', open: '—', close: '—', on: false },
];

export const drilldowns = {
  k1: {
    title: 'open tickets', value: '128', note: 'twelve fewer than last week — the queue is breathing again.',
    axis: 'open at end of day', series: [141, 139, 144, 138, 136, 132, 134, 130, 133, 129, 131, 127, 129, 128],
    breakdown: [{ label: 'urgent', n: 9 }, { label: 'high', n: 27 }, { label: 'normal', n: 61 }, { label: 'low', n: 31 }],
    tickets: [{ num: 1023, subject: 'mobile app crashes on launch (android)', status: 'new' }, { num: 1029, subject: 'hashcare sync stopped overnight', status: 'open' }, { num: 1040, subject: 'widget not loading on mobile safari', status: 'new' }],
  },
  k2: {
    title: 'first response', value: '38m', note: 'well inside the 1h standard target.',
    axis: 'median minutes to first reply', series: [52, 49, 47, 44, 46, 41, 43, 40, 42, 39, 41, 38, 39, 38],
    breakdown: [{ label: 'widget', n: 22 }, { label: 'email', n: 36 }, { label: 'api', n: 41 }, { label: 'HashCare', n: 58 }],
    tickets: [{ num: 1041, subject: 'billing charged twice this month', status: 'open' }, { num: 1033, subject: 'password reset email never arrives', status: 'open' }, { num: 1022, subject: 'webhook deliveries retrying forever', status: 'open' }],
  },
  k3: {
    title: 'resolution', value: '6h 12m', note: 'twenty-two minutes slower than last week. worth a look, not a worry.',
    axis: 'median hours to resolve', series: [5.2, 5.4, 5.1, 5.6, 5.5, 5.8, 5.7, 6.0, 5.9, 6.1, 6.0, 6.3, 6.1, 6.2],
    breakdown: [{ label: 'Tier 1', n: 5 }, { label: 'Billing', n: 8 }],
    tickets: [{ num: 1014, subject: 'account deletion request (gdpr)', status: 'on-hold' }, { num: 1031, subject: "plan downgrade didn't take effect", status: 'on-hold' }, { num: 1027, subject: 'can we get an invoice for last quarter?', status: 'pending' }],
  },
  k4: {
    title: 'sla met', value: '94%', note: 'three points better than last week.',
    axis: 'percent of targets met', series: [88, 89, 90, 89, 91, 90, 92, 91, 93, 92, 93, 94, 93, 94],
    breakdown: [{ label: 'Standard', n: 97 }, { label: 'Priority', n: 93 }, { label: 'Urgent', n: 86 }],
    tickets: [{ num: 1038, subject: 'sso login loops back to sign-in', status: 'open' }, { num: 1018, subject: 'two-factor codes rejected', status: 'open' }, { num: 1021, subject: 'refund for accidental annual upgrade', status: 'open' }],
  },
  k5: {
    title: 'csat', value: '4.6', note: '212 people answered. eleven left a note as well.',
    axis: 'average score out of five',	series: [4.4, 4.4, 4.5, 4.5, 4.4, 4.6, 4.5, 4.6, 4.6, 4.5, 4.7, 4.6, 4.6, 4.6],
    breakdown: [{ label: '5 ✿', n: 71 }, { label: '4', n: 19 }, { label: '3', n: 6 }, { label: '1–2', n: 4 }],
    tickets: [{ num: 1030, subject: 'how do i move a task between packs?', status: 'resolved' }, { num: 1024, subject: 'how do i set up business hours?', status: 'resolved' }, { num: 1013, subject: "widget colors don't match our brand", status: 'resolved' }],
  },
};

/* ---- transport ------------------------------------------------------- */
const wait = ms => new Promise(r => setTimeout(r, ms));
let failNext = false;
export function simulateNextFailure() { failNext = true; }
async function hop(ms = 260) {
  await wait(ms);
  if (failNext) { failNext = false; throw new Error('network'); }
}
const clone = v => JSON.parse(JSON.stringify(v));

const VIEW_RULES = {
  'all-open':   t => !['resolved', 'closed'].includes(t.status),
  'unassigned': t => !t.assigneeId && !['resolved', 'closed'].includes(t.status),
  'my-open':    (t, me) => t.assigneeId === me && !['resolved', 'closed'].includes(t.status),
  'breaching':  t => !['resolved', 'closed'].includes(t.status) && !t.sla.paused && (t.sla.firstResponse.metAt == null && t.sla.firstResponse.dueAt - Date.now() < 30 * MIN),
  'pending':    t => t.status === 'pending' || t.status === 'on-hold',
  'resolved':   t => t.status === 'resolved' || t.status === 'closed',
};

function matches(t, f) {
  if (f.status && f.status.length && !f.status.includes(t.status)) return false;
  if (f.priority && f.priority.length && !f.priority.includes(t.priority)) return false;
  if (f.channel && f.channel.length && !f.channel.includes(t.channel)) return false;
  if (f.tag && !t.tags.includes(f.tag)) return false;
  if (f.team && t.teamId !== f.team) return false;
  if (f.assignee === '@unassigned' && t.assigneeId) return false;
  if (f.assignee && f.assignee !== '@unassigned' && t.assigneeId !== f.assignee) return false;
  if (f.q) {
    const q = f.q.toLowerCase();
    const c = custOf(t.customerId);
    if (!(t.subject.toLowerCase().includes(q) || String(t.num).includes(q) || c.name.toLowerCase().includes(q) || orgName(c.org).toLowerCase().includes(q))) return false;
  }
  return true;
}

const SORTS = {
  updated: (a, b) => b.updatedAt - a.updatedAt,
  created: (a, b) => b.createdAt - a.createdAt,
  priority: (a, b) => ['urgent', 'high', 'normal', 'low'].indexOf(a.priority) - ['urgent', 'high', 'normal', 'low'].indexOf(b.priority) || b.updatedAt - a.updatedAt,
  sla: (a, b) => a.sla.firstResponse.dueAt - b.sla.firstResponse.dueAt,
};

export async function listTickets({ view = 'all-open', filters = {}, sort = 'updated', me = 'a2', page = 0, pageSize = 25 } = {}) {
  await hop(280);
  const rule = VIEW_RULES[view] || (() => true);
  const all = tickets.filter(t => rule(t, me) && matches(t, filters)).sort(SORTS[sort] || SORTS.updated);
  return { rows: clone(all.slice(page * pageSize, page * pageSize + pageSize)), total: all.length, pageSize };
}

export async function viewCounts(me = 'a2') {
  await hop(60);
  const out = {};
  Object.keys(VIEW_RULES).forEach(k => { out[k] = tickets.filter(t => VIEW_RULES[k](t, me)).length; });
  return out;
}

export function facetCounts() {
  const c = { status: {}, priority: {}, channel: {}, tag: {} };
  tickets.forEach(t => {
    c.status[t.status] = (c.status[t.status] || 0) + 1;
    c.priority[t.priority] = (c.priority[t.priority] || 0) + 1;
    c.channel[t.channel] = (c.channel[t.channel] || 0) + 1;
    t.tags.forEach(g => { c.tag[g] = (c.tag[g] || 0) + 1; });
  });
  return c;
}

export async function getTicket(id) {
  await hop(220);
  const t = tickets.find(x => x.id === id || x.num === Number(id));
  if (!t) throw new Error('not found');
  return clone(t);
}

export async function patchTicket(id, patch) {
  await hop(340);
  const t = tickets.find(x => x.id === id);
  if (!t) throw new Error('not found');
  Object.assign(t, patch, { updatedAt: Date.now() });
  if (patch.status) t.sla.paused = patch.status === 'pending' || patch.status === 'on-hold';
  return clone(t);
}

export async function addMessage(id, { body, internal, author }) {
  await hop(380);
  const t = tickets.find(x => x.id === id);
  if (!t) throw new Error('not found');
  const ag = agentOf(author) || agents[1];
  const item = { kind: internal ? 'note' : 'message', id: id + '-' + Date.now(), author: ag.name, authorId: ag.id, side: 'agent', role: ag.role === 'lead' ? 'team lead' : 'support', at: Date.now(), body, attachments: [] };
  t.thread.push(item);
  t.updatedAt = Date.now();
  if (!internal && t.sla.firstResponse.metAt == null) t.sla.firstResponse.metAt = Date.now();
  return clone(item);
}

export async function createTicket({ subject, customerId, priority = 'normal', channel = 'email', body = '' }) {
  await hop(420);
  const num = Math.max(...tickets.map(t => t.num)) + 1;
  const t = buildTicket([num, subject, customerId, 'new', priority, channel, [], null, 't1', 0, 0, 240, null, 24, 1, null]);
  t.thread = [{ kind: 'message', id: num + '-m1', author: custOf(customerId).name, authorId: customerId, side: 'customer', role: orgName(custOf(customerId).org), at: Date.now(), body: body || subject, attachments: [] }];
  t.snippet = body || subject;
  tickets = [t, ...tickets];
  return clone(t);
}

export async function listCustomers(q = '') {
  await hop(200);
  const rows = customers.filter(c => !q || (c.name + c.email + orgName(c.org)).toLowerCase().includes(q.toLowerCase())).map(c => ({
    ...c, orgName: orgName(c.org),
    open: tickets.filter(t => t.customerId === c.id && !['resolved', 'closed'].includes(t.status)).length,
    total: tickets.filter(t => t.customerId === c.id).length,
    lastContact: Math.max(...tickets.filter(t => t.customerId === c.id).map(t => t.updatedAt), 0),
  }));
  return clone(rows);
}

export async function getCustomer(id) {
  await hop(200);
  const c = customers.find(x => x.id === id);
  if (!c) throw new Error('not found');
  const mine = tickets.filter(t => t.customerId === id);
  return clone({
    ...c, orgName: orgName(c.org),
    tickets: mine.map(t => ({ id: t.id, num: t.num, subject: t.subject, status: t.status, priority: t.priority, createdAt: t.createdAt, updatedAt: t.updatedAt })),
    stats: { total: mine.length, open: mine.filter(t => !['resolved', 'closed'].includes(t.status)).length, avgResolution: '5h 48m', lastSeen: Math.max(...mine.map(t => t.updatedAt), 0) },
  });
}

export async function search(q) {
  await hop(140);
  if (!q) return { tickets: [], customers: [] };
  const ql = q.toLowerCase();
  return clone({
    tickets: tickets.filter(t => t.subject.toLowerCase().includes(ql) || String(t.num).includes(ql)).slice(0, 5)
      .map(t => ({ id: t.id, num: t.num, subject: t.subject, status: t.status })),
    customers: customers.filter(c => (c.name + c.email).toLowerCase().includes(ql)).slice(0, 4)
      .map(c => ({ id: c.id, name: c.name, email: c.email, orgName: orgName(c.org) })),
  });
}

export const meta = { orgName, custOf, agentOf, T0 };
