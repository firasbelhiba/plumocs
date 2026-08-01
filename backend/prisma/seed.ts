/* Dev seed — matches the frontend's placeholder data so the two line up
 * during development. Creates an admin, teams, SLA policies, tags, canned
 * responses, customers/orgs, and ~30 tickets with threaded messages.
 *
 * All dev users share the password: password123
 */
import { PrismaClient, TicketStatus, TicketPriority, Channel, AuthorType } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const MIN = 60_000;
const HOUR = 3_600_000;
const T0 = Date.now();
const at = (msAgo: number) => new Date(T0 - msAgo);

async function main() {
  console.log('Seeding plumo_cs…');

  // ---- teams ----
  const tier1 = await prisma.team.create({ data: { name: 'Tier 1', description: 'Front-line support' } });
  const billing = await prisma.team.create({ data: { name: 'Billing', description: 'Payments and invoicing' } });
  const teamId = { t1: tier1.id, t2: billing.id } as Record<string, string>;

  // ---- users (agents/leads/admins) ----
  const passwordHash = await argon2.hash('password123');
  const userSeeds: Array<[string, string, 'agent' | 'lead' | 'admin', string, string]> = [
    ['a1', 'Mira Solberg', 'lead', 't1', 'mira@plumo.app'],
    ['a2', 'Tomas Ek', 'agent', 't1', 'tomas@plumo.app'],
    ['a3', 'Aya Nakamura', 'agent', 't1', 'aya@plumo.app'],
    ['a4', 'Devon Price', 'agent', 't2', 'devon@plumo.app'],
    ['a5', 'Rosa Lindqvist', 'agent', 't2', 'rosa@plumo.app'],
    ['a6', 'Jules Okafor', 'agent', 't1', 'jules@plumo.app'],
    ['a7', 'Sam Whitfield', 'agent', 't2', 'sam@plumo.app'],
    ['a8', 'Priya Raman', 'admin', 't1', 'priya@plumo.app'],
  ];
  const users: Record<string, string> = {};
  for (const [key, name, role, team, email] of userSeeds) {
    const u = await prisma.user.create({
      data: { name, role, email, teamId: teamId[team], passwordHash },
    });
    users[key] = u.id;
  }

  // ---- organizations ----
  const orgSeeds: Array<[string, string, string]> = [
    ['o1', 'Northwind Health', 'northwindhealth.com'],
    ['o2', 'HashCare', 'hashcare.io'],
    ['o3', 'Vela Studio', 'velastudio.co'],
    ['o4', 'Bramble Coffee', 'bramblecoffee.com'],
  ];
  const orgs: Record<string, string> = {};
  for (const [key, name, domain] of orgSeeds) {
    const o = await prisma.organization.create({ data: { name, domain } });
    orgs[key] = o.id;
  }

  // ---- customers ----
  const custSeeds: Array<[string, string, string, string, string, string, string]> = [
    ['c1', 'Ines Duarte', 'ines@northwindhealth.com', 'o1', 'Europe/Lisbon', 'pt-PT', '+351 21 555 0148'],
    ['c2', 'Marcus Vogel', 'm.vogel@northwindhealth.com', 'o1', 'Europe/Berlin', 'de-DE', '+49 30 5550 221'],
    ['c3', 'Leah Brenner', 'leah.brenner@hashcare.io', 'o2', 'America/New_York', 'en-US', '+1 212 555 0119'],
    ['c4', 'Ahmed Farouk', 'ahmed@hashcare.io', 'o2', 'Africa/Cairo', 'ar-EG', '+20 2 5550 774'],
    ['c5', 'Nora Kelley', 'nora@velastudio.co', 'o3', 'America/Los_Angeles', 'en-US', '+1 415 555 0182'],
    ['c6', 'Tobias Lund', 'tobias@velastudio.co', 'o3', 'Europe/Copenhagen', 'da-DK', '+45 33 555 019'],
    ['c7', 'Rina Patel', 'rina@bramblecoffee.com', 'o4', 'Asia/Kolkata', 'en-IN', '+91 22 5550 3312'],
    ['c8', 'Gus Alvarez', 'gus@bramblecoffee.com', 'o4', 'America/Mexico_City', 'es-MX', '+52 55 5550 8841'],
    ['c9', 'Hana Kim', 'hana.kim@northwindhealth.com', 'o1', 'Asia/Seoul', 'ko-KR', '+82 2 555 0166'],
    ['c10', 'Elliot Shaw', 'elliot@velastudio.co', 'o3', 'Europe/London', 'en-GB', '+44 20 5550 771'],
  ];
  const customers: Record<string, { id: string; org: string; name: string }> = {};
  for (const [key, name, email, org, timezone, locale, phone] of custSeeds) {
    const c = await prisma.customer.create({
      data: { name, email, organizationId: orgs[org], timezone, locale, phone },
    });
    customers[key] = { id: c.id, org: orgs[org], name };
  }

  // ---- business hours + SLA policies ----
  const hours = await prisma.businessHours.create({
    data: {
      name: 'Lisbon office hours',
      timezone: 'Europe/Lisbon',
      weeklyJson: {
        mon: [['09:00', '18:00']],
        tue: [['09:00', '18:00']],
        wed: [['09:00', '18:00']],
        thu: [['09:00', '18:00']],
        fri: [['09:00', '17:00']],
        sat: [],
        sun: [],
      },
      holidaysJson: ['2026-12-25', '2027-01-01'],
    },
  });
  const mkPolicy = (name: string, priority: TicketPriority, fr: number, res: number, bh: string | null) =>
    prisma.slaPolicy.create({
      data: { name, priority, firstResponseMins: fr, resolutionMins: res, businessHoursId: bh },
    });
  const pStandardLow = await mkPolicy('Standard', 'low', 240, 1440, hours.id);
  const pStandard = await mkPolicy('Standard', 'normal', 240, 1440, hours.id);
  const pPriority = await mkPolicy('Priority', 'high', 60, 480, hours.id);
  const pUrgent = await mkPolicy('Urgent', 'urgent', 15, 240, null); // 24/7
  const policyFor: Record<string, string> = {
    low: pStandardLow.id,
    normal: pStandard.id,
    high: pPriority.id,
    urgent: pUrgent.id,
  };

  // ---- tags ----
  const tagSeeds: Array<[string, string, string]> = [
    ['billing', 'billing', '#4C9F6E'],
    ['bug', 'bug', '#C98A5E'],
    ['how-to', 'how-to', '#60A5FA'],
    ['account', 'account', '#4F46E5'],
    ['urgent', 'urgent', '#E8A97E'],
    ['integration', 'integration', '#0E7490'],
  ];
  for (const [key, label, color] of tagSeeds) {
    await prisma.tag.create({ data: { key, label, color } });
  }

  // ---- canned responses ----
  const canned: Array<[string, string, string | null, string[], string]> = [
    ['warm opener', "hi {{name}} — thanks for writing in. i've picked this up and i'm looking at it now. i'll come back to you shortly with something useful.", teamId.t1, ['general'], 'a1'],
    ['account key reset', "i've sent a fresh reset link to this address — it's good for 30 minutes. if it hasn't landed in a couple of minutes, do check the spam folder and i'll try another route.", teamId.t1, ['account'], 'a1'],
    ['double charge refund', "you're right, that's a duplicate charge — sorry about that. i've refunded it in full; it usually shows on the statement within 3–5 working days.", teamId.t2, ['billing'], 'a4'],
    ['need a little more detail', "could you tell me which browser and version you're on, and roughly when you last saw it? a screenshot helps too, whenever you have a moment.", teamId.t1, ['bug'], 'a1'],
    ['export walkthrough', "settings → data → export gives you a csv of everything in the pack. it's emailed to you when it's ready, usually under a minute.", teamId.t1, ['how-to'], 'a1'],
  ];
  for (const [title, body, team, tags, by] of canned) {
    await prisma.cannedResponse.create({
      data: { title, body, teamId: team, tags, createdById: users[by] },
    });
  }

  // ---- tickets -------------------------------------------------------------
  // [num, subject, cust, status, priority, channel, tags, assignee, team,
  //  createdH, updatedM, frDueM, frMetM, resDueH, sourceRef]
  type Seed = [number, string, string, TicketStatus, TicketPriority, Channel, string[], string | null, string, number, number, number, number | null, number, string | null];
  const seeds: Seed[] = [
    [1042, "can't reset my account key", 'c1', 'open', 'urgent', 'email', ['account', 'urgent'], 'a2', 't1', 6, 4, 22, null, 3, null],
    [1041, 'billing charged twice this month', 'c3', 'open', 'high', 'email', ['billing'], 'a4', 't2', 9, 12, -18, null, 6, null],
    [1040, 'widget not loading on mobile safari', 'c5', 'new', 'high', 'widget', ['bug'], null, 't1', 1, 3, 38, null, 11, null],
    [1039, 'how do i export my data?', 'c7', 'pending', 'normal', 'email', ['how-to'], 'a3', 't1', 22, 95, 240, 88, 30, null],
    [1038, 'sso login loops back to sign-in', 'c4', 'open', 'urgent', 'hashcare', ['bug', 'urgent'], 'a1', 't1', 3, 7, -6, 12, 2, 'HashCare CS-4821'],
    [1037, 'invoice missing vat number', 'c2', 'open', 'normal', 'email', ['billing'], 'a5', 't2', 30, 140, 150, 120, 18, null],
    [1036, 'api returns 429 on every request', 'c6', 'open', 'high', 'api', ['bug', 'integration'], 'a2', 't1', 2, 9, 26, 35, 7, null],
    [1035, "team member can't see shared board", 'c9', 'new', 'normal', 'widget', ['account'], null, 't1', 1, 16, 205, null, 22, null],
    [1034, 'request: bulk import from csv', 'c10', 'pending', 'low', 'email', ['how-to'], 'a6', 't1', 51, 300, 400, 260, 60, null],
    [1033, 'password reset email never arrives', 'c8', 'open', 'high', 'email', ['account'], 'a3', 't1', 4, 22, -42, null, 4, null],
    [1032, 'attachment upload fails over 10mb', 'c1', 'open', 'normal', 'widget', ['bug'], 'a7', 't1', 12, 48, 190, 95, 12, null],
    [1031, "plan downgrade didn't take effect", 'c5', 'on_hold', 'normal', 'email', ['billing'], 'a4', 't2', 40, 210, 300, 180, 40, null],
    [1030, 'how do i move a task between packs?', 'c7', 'resolved', 'low', 'widget', ['how-to'], 'a2', 't1', 26, 180, -60, 400, -6, null],
    [1029, 'hashcare sync stopped overnight', 'c3', 'open', 'urgent', 'hashcare', ['integration', 'urgent'], 'a1', 't1', 8, 2, -3, 40, 1, 'HashCare CS-4790'],
    [1028, 'duplicate notifications for one task', 'c6', 'open', 'low', 'api', ['bug'], null, 't1', 15, 70, 120, null, 15, null],
    [1027, 'can we get an invoice for last quarter?', 'c2', 'pending', 'low', 'email', ['billing', 'how-to'], 'a5', 't2', 60, 330, 420, 300, 55, null],
    [1026, 'dark mode text unreadable in vault', 'c10', 'open', 'normal', 'widget', ['bug'], 'a6', 't1', 19, 86, 170, 60, 14, null],
    [1025, 'seat count wrong after removing user', 'c4', 'open', 'high', 'email', ['billing', 'account'], 'a4', 't2', 5, 18, 44, 30, 5, null],
    [1024, 'how do i set up business hours?', 'c9', 'resolved', 'low', 'email', ['how-to'], 'a3', 't1', 34, 400, -90, 600, -12, null],
    [1023, 'mobile app crashes on launch (android)', 'c8', 'new', 'urgent', 'widget', ['bug', 'urgent'], null, 't1', 0, 1, 11, null, 3, null],
    [1022, 'webhook deliveries retrying forever', 'c6', 'open', 'high', 'api', ['integration', 'bug'], 'a7', 't1', 7, 33, -70, 55, 2, null],
    [1021, 'refund for accidental annual upgrade', 'c1', 'open', 'high', 'email', ['billing', 'urgent'], 'a5', 't2', 10, 26, 29, 45, 8, null],
    [1020, "can't archive a completed project", 'c5', 'closed', 'low', 'widget', ['how-to'], 'a2', 't1', 72, 900, -400, 800, -40, null],
    [1019, 'export csv has empty date column', 'c3', 'open', 'normal', 'api', ['bug'], 'a6', 't1', 16, 58, 155, 80, 13, null],
    [1018, 'two-factor codes rejected', 'c4', 'open', 'urgent', 'hashcare', ['account', 'urgent'], 'a1', 't1', 2, 5, 9, 14, 2, 'HashCare CS-4802'],
    [1017, 'how do i share a read-only view?', 'c7', 'pending', 'normal', 'email', ['how-to'], 'a3', 't1', 28, 260, 280, 200, 26, null],
    [1016, 'rest mode turns off by itself', 'c10', 'open', 'low', 'widget', ['bug'], null, 't1', 21, 110, 100, null, 20, null],
    [1015, 'calendar sync duplicating events', 'c9', 'open', 'normal', 'api', ['integration'], 'a7', 't1', 13, 44, 165, 70, 16, null],
    [1014, 'account deletion request (gdpr)', 'c8', 'on_hold', 'high', 'email', ['account'], 'a1', 't1', 44, 240, 320, 210, 36, null],
    [1013, "widget colors don't match our brand", 'c2', 'resolved', 'normal', 'widget', ['how-to'], 'a2', 't1', 38, 520, -200, 700, -20, null],
  ];

  const openings: Record<number, string> = {
    1042: "morning — i've tried the reset link three times and it keeps telling me the key is already in use. i can't get into the vault pack at all and i have a handover tomorrow.",
    1041: "we've been charged twice for july, same amount, same day. i've attached both receipts. could you sort the second one out?",
    1040: 'the widget just spins on iphone. works fine on desktop chrome. a few of our people have mentioned it this week.',
    1039: 'hello! is there a way to get everything out as a spreadsheet? our finance team wants a copy for the audit.',
    1038: 'sso sends me back to the sign-in page in a loop. it started this morning for everyone on our tenant, about 40 people.',
    1037: "the july invoice is missing our vat number so our accounts team won't accept it. can you reissue with it included?",
    1036: "every api call is coming back 429 since roughly 06:00 utc. we haven't changed our request volume.",
    1035: 'one of my team can see the board in the list but gets an empty screen when she opens it. the rest of us are fine.',
    1034: "we're moving off a spreadsheet and have about 900 rows. is there a csv import, or do we do it by hand?",
    1033: "no reset email arrives, ever. i've checked spam. i've tried two different addresses.",
    1032: 'uploading anything over about 10mb fails silently — the bar reaches the end and then nothing appears.',
    1031: "we downgraded to team on the 3rd but we're still being billed for business and still see the business features.",
    1030: 'quick one — can a task be moved from the pm pack into hr, or does it need recreating?',
    1029: "our hashcare sync stopped overnight, nothing since 02:14. patient tickets aren't reaching plumo at all.",
    1028: 'i get two push notifications for every task someone assigns me. only one on the web though.',
    1027: 'could we get a single invoice covering april to june for expenses? happy to take a pdf.',
    1026: 'in dark mode the note text in the vault pack is nearly invisible — dark grey on dark blue.',
    1025: "we removed two people last week but we're still paying for 34 seats. the settings page shows 32.",
    1024: "where do i tell plumo our working hours? we don't want sla clocks running overnight.",
    1023: 'the android app closes itself the moment it opens. samsung s23, freshly reinstalled, still nothing.',
    1022: 'our webhook endpoint returns 200 but plumo keeps re-delivering the same events, hundreds of times now.',
    1021: 'i clicked annual by mistake this morning. can we go back to monthly and refund the difference?',
    1020: "the archive button does nothing on a project that's fully done. minor, but it's cluttering the list.",
    1019: 'the exported csv has a date column with nothing in it. everything else looks right.',
    1018: 'our authenticator codes are being rejected as invalid. two of us are locked out completely.',
    1017: 'is there a way to share a board with a client without giving them edit rights?',
    1016: 'rest mode switches itself off after a few minutes and the shell goes bright again mid-evening.',
    1015: 'every calendar event is appearing twice since we reconnected google last friday.',
    1014: 'we need one of our accounts fully deleted under gdpr, with confirmation for our records.',
    1013: 'the widget uses plumo blue and it clashes with our palette. can we set our own colour?',
  };

  const agentReplies: Record<number, string> = {
    1042: "hi ines — thanks for the detail, that helps. the key is stuck in a half-rotated state on our side, which is why it reads as in use. i'm clearing it now and will send you a fresh link the moment it's done. you'll be in well before tomorrow.",
    1038: "hi ahmed — we can see the loop in our logs and it's on us: a certificate rotated early this morning. our platform team is on it and i'll update you here every 30 minutes until it's cleared.",
    1036: "hi tobias — you're being caught by a rate-limit rule we tightened yesterday. i've raised your ceiling back to where it was; you should see 429s stop within a couple of minutes.",
    1029: "hi leah — sync stopped when the hashcare token expired at 02:14. i've refreshed it and the backlog is replaying now; about 60 tickets should land in the next few minutes.",
    1025: "hi ahmed — the seat count didn't follow the removals through to billing. i've corrected it to 32 and credited the two seats on your next invoice.",
    1018: "hi ahmed — your tenant's clock drifted by about 40 seconds, which is enough to reject codes. i've widened the window while we fix it; try a fresh code now.",
    1039: "hi rina — yes: settings → data → export gives you a csv of everything in the pack, emailed when it's ready. i'll leave this open in case finance needs a hand with it.",
    1024: 'hi hana — settings → business hours, then set your timezone and weekly schedule. sla clocks pause outside those hours automatically.',
    1030: 'hi rina — you can drag it across, or use move to pack from the task menu. nothing is lost when it moves.',
  };

  const notes: Record<number, string> = {
    1042: "vault key rotation half-failed — same shape as #1009. logged with platform, they're patching the rotation job today. no need to escalate unless it recurs.",
    1038: 'cert rotated 12h early — incident INC-204 is open. mira is on the bridge call, updates every 30m.',
    1029: 'token refresh is manual for hashcare until the oauth work ships. if this comes back, ping devon before touching anything.',
    1023: 'third android crash report this week, all on one build. sending to mobile with the trace.',
    1033: 'domain is on a strict dmarc policy — their it needs to allow our sender. drafted the wording for them.',
  };

  for (const [num, subject, custKey, status, priority, channel, tags, assigneeKey, team, createdH, updatedM, frDueM, frMetM, resDueH, sourceRef] of seeds) {
    const cust = customers[custKey];
    const assigneeId = assigneeKey ? users[assigneeKey] : null;
    const paused = status === 'pending' || status === 'on_hold';
    const done = status === 'resolved' || status === 'closed';
    const createdAt = at(createdH * HOUR + 4 * MIN);
    const updatedAt = at(updatedM * MIN);

    const ticket = await prisma.ticket.create({
      data: {
        number: BigInt(num),
        subject,
        status,
        priority,
        channel,
        customerId: cust.id,
        organizationId: cust.org,
        assigneeId,
        teamId: teamId[team],
        slaPolicyId: policyFor[priority],
        firstResponseDueAt: new Date(T0 + frDueM * MIN),
        resolutionDueAt: new Date(T0 + resDueH * HOUR),
        firstRespondedAt: frMetM != null ? at(frMetM * MIN) : null,
        resolvedAt: status === 'resolved' || status === 'closed' ? updatedAt : null,
        closedAt: status === 'closed' ? updatedAt : null,
        slaPausedAt: paused ? updatedAt : null,
        sourceRef,
        tags,
        createdAt,
        updatedAt,
      },
    });

    // thread: opening message, optional agent reply + internal note
    await prisma.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        authorType: AuthorType.customer,
        authorId: cust.id,
        body: openings[num] ?? 'hello — hoping you can help with this one.',
        channel,
        createdAt,
      },
    });
    if (frMetM != null && assigneeId) {
      const repliedAt = at(frMetM * MIN);
      await prisma.ticketMessage.create({
        data: {
          ticketId: ticket.id,
          authorType: AuthorType.agent,
          authorId: assigneeId,
          body:
            agentReplies[num] ??
            `hi ${cust.name.split(' ')[0].toLowerCase()} — thanks for flagging this. i've had a look and i'm picking it up now; i'll come back to you with something useful shortly.`,
          channel,
          createdAt: repliedAt,
        },
      });
      if (notes[num]) {
        await prisma.ticketMessage.create({
          data: {
            ticketId: ticket.id,
            authorType: AuthorType.agent,
            authorId: assigneeId,
            body: notes[num],
            isInternalNote: true,
            channel,
            createdAt: new Date(repliedAt.getTime() + 4 * MIN),
          },
        });
      }
    }
    if (done && assigneeId) {
      await prisma.ticketMessage.create({
        data: {
          ticketId: ticket.id,
          authorType: AuthorType.agent,
          authorId: assigneeId,
          body: "that's sorted now — i've made the change on our side. i'll leave this closed but do reopen it any time; no need to start again.",
          channel,
          createdAt: new Date(updatedAt.getTime() - 6 * MIN),
        },
      });
    }
  }

  // ---- a webhook + demo notification ----
  await prisma.webhook.create({
    data: {
      url: 'https://api.hashcare.io/v2/plumo/events',
      events: ['ticket_created', 'ticket_updated', 'message_added'],
      secret: 'dev-webhook-secret',
    },
  });
  await prisma.notification.create({
    data: {
      userId: users.a2,
      kind: 'assignment',
      text: "mira handed leah's conversation to you",
    },
  });

  console.log('Seed complete.');
  console.log('Dev logins (password: password123):');
  console.log('  admin: priya@plumo.app · lead: mira@plumo.app · agent: tomas@plumo.app');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
