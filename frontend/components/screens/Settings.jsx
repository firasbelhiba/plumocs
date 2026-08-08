'use client';

import { buttonVariants } from '../common/Button';
import { cn } from '@/lib/utils';
import {
  Badge,
  Breadcrumb,
  Button,
  CHECKBOX,
  CHECKBOX_STYLE,
  CHECK_LABEL,
  Input,
  Modal,
  Select,
  Skeleton,
  Switch,
  Textarea,
  TonePill,
  UserAvatar,
} from '../common';

/* This screen used to be written in `sx()` — a runtime CSS-in-JS injector with
   no counterpart in PM — against the `--cs-*` palette, ~150 call sites of raw
   CSS that Tailwind, the token utilities and the purge step could not see. It is
   now ordinary utility classes on the shared tokens, which means the five things
   it had invented for itself are gone:

     - its own table (9px/16px header, 10px/16px row, `tracking: 1.4px`) → the
       shared `h-row-header` / `h-row` recipe item 39 gave Customers and Reports;
     - its own 26×26 icon button → `Button size="icon"` (item 14);
     - its own pills (`border-radius: 100px`) → `Badge` / `TonePill`, both
       `rounded-token-sm`, because PM's badge is never a pill;
     - its own card hover (`translateY(-4px)` over `--plumo-dur-default`, a
       marketing-site token) → `.interactive`, PM's `translateY(-1px)` over
       `--dur-fast`;
     - `border: 0.5px solid` throughout → 1px, like every other surface in
       either app. */

/* Panel geometry, identical to `Customers.jsx` / `Reports.jsx`: flat, bordered,
   no `shadow-card` — PM's card carries no shadow three times in four. */
const PANEL = 'rounded-token bg-surface border border-[color:var(--border)]';
const TABLE = PANEL + ' overflow-x-auto';
const CARD = PANEL + ' p-4 flex flex-col gap-3';

/* Table header and row from PM's reference table (`design-system/page.tsx:495,
   508`), via the constants item 39 established on the other two screens. */
const THEAD =
  'grid gap-3 h-row-header px-3 border-b border-[color:var(--border)] bg-surface-2 items-center text-[11px] font-semibold uppercase tracking-wider text-fg-3';
const TROW =
  'grid gap-3 h-row px-3 border-b border-[color:var(--border)] last:border-b-0 items-center text-[13px] text-fg';

const TEAM_COLS = 'minmax(170px,1.2fr) minmax(180px,1.4fr) 110px 100px 120px 92px';
const INVITE_COLS = 'minmax(180px,1.4fr) 110px minmax(130px,1fr) 120px 92px';
const SLA_COLS = 'minmax(140px,1fr) minmax(140px,1fr) 140px 130px 150px 70px';
const HOURS_COLS = '130px 1fr 1fr 70px';
const TAG_COLS = '1fr 90px 80px';
const HOOK_COLS = 'minmax(240px,1.6fr) minmax(180px,1fr) 110px 140px';
const KEY_COLS = 'minmax(180px,1.4fr) 130px 130px 110px 90px';

/* PM's settings pages open with `text-[24px] font-semibold tracking-tight` over
   a `text-[13px] text-fg-2 mt-1` subtitle (`settings/notifications/page.tsx:
   137-144`); the section headings inside a card are `text-[14px] font-semibold`
   (`NotificationPreferencesSection.tsx:73`). */
const PAGE_TITLE = 'text-[24px] font-semibold tracking-tight text-fg';
const PAGE_SUB = 'text-[13px] text-fg-2 mt-1';
const CARD_TITLE = 'text-[14px] font-semibold text-fg';
const CARD_SUB = 'text-[13px] text-fg-2';

/* A hint where there is nothing to list yet — bordered, dashed, 1px. */
const HINT =
  'rounded-token border border-dashed border-[color:var(--border)] px-4 py-3 text-[12.5px] text-fg-2 leading-relaxed';

const editBtn = () => buttonVariants({ variant: 'outline', size: 'sm' });
const iconBtn = () => buttonVariants({ variant: 'outline', size: 'icon' });
const primaryBtn = () => cn(buttonVariants({ variant: 'primary', size: 'md' }), 'whitespace-nowrap');

/* The tab rail, on PM's own settings rail (`settings/layout.tsx:305-309`):
   `h-8 px-2 rounded-token-sm text-[13px]`, active raised onto `bg-surface`
   against the rail's `bg-surface-2`. This replaces the `[data-on]` token trio
   (`--cs-onbg` / `--cs-onfg` / `--cs-onw`), which said the same thing through a
   global attribute selector PM has no analogue for.
   `md:w-full` only: below `md` the rail is a horizontal strip, and a full-width
   button in a row would give each tab the whole viewport. */
const TAB = 'md:w-full flex items-center h-8 px-2 rounded-token-sm text-[13px] whitespace-nowrap cursor-pointer transition-colors focus-ring';
const TAB_ON = 'bg-surface text-fg shadow-card';
const TAB_OFF = 'text-fg-2 hover:bg-surface hover:text-fg';

const TABS = [
  ['overview', 'Overview'],
  ['team', 'Team & users'],
  ['sla', 'SLA policies'],
  ['hours', 'Business hours'],
  ['canned', 'Canned responses'],
  ['tags', 'Tags'],
  ['hooks', 'Webhooks'],
  ['keys', 'API keys'],
  ['email', 'Email & channels'],
];

/**
 * A panel whose rows could not be fetched says so, in place, rather than
 * showing the copy bootstrap happened to leave behind as if it were current.
 * Same recipe as the modal's error banner two hundred lines below — it used to
 * borrow the SLA-breach tone, which is a support-domain colour standing in for a
 * plain failure.
 */
const LoadNote = ({ children, onRetry }) => (
  <div className="flex flex-wrap items-center gap-2.5 px-3 py-2.5 rounded-token-sm text-[13px] bg-[color:var(--danger-soft)] text-[color:var(--danger)]">
    <span className="flex-1 min-w-[200px]">{children}</span>
    {/* Saying a panel is stale and giving no way to un-stale it left the reader
        with a full page reload as their only move. */}
    {onRetry && (
      <button
        onClick={onRetry}
        className="h-btn-sm px-3 rounded-full border border-current bg-transparent text-current text-[12.5px] cursor-pointer focus-ring"
      >
        Try again
      </button>
    )}
  </div>
);

const Ellipsis = ({ className, children }) => (
  <span className={cn('truncate', className)}>{children}</span>
);

/**
 * Rows for a settings table that has not answered yet.
 *
 * Every table on this screen is the same `THEAD` / `TROW` pair over its own
 * COLS constant, so one skeleton serves all of them and takes the constant its
 * table takes — which is what stops the two drifting. `cells` are the widths,
 * in the column order the real row uses.
 *
 * These panels used to lean on the bootstrap caches to cover their own read, so
 * they never looked empty. Two of them — webhooks and API keys — no longer ride
 * along in boot at all, so without this an admin opening either would get a
 * table of column headings over nothing for a whole round trip.
 */
const TableSkeleton = ({ cols, cells, rows = 4 }) =>
  Array.from({ length: rows }).map((_, i) => (
    <div key={i} className={TROW} style={{ gridTemplateColumns: cols }} aria-hidden="true">
      {cells.map((w, c) => (
        <Skeleton
          key={c}
          className="h-3 rounded-full"
          style={{
            width: typeof w === 'number' ? `${w - ((i * 6) % 16)}%` : w,
            animationDelay: `${i * 100 + c * 30}ms`,
          }}
        />
      ))}
    </div>
  ));

export default function Settings({ V }) {
  return (
    // The tab rail cannot be a 240px column beside a 720px pane at 375px, so it
    // turns the corner: a horizontal scrolling strip under the header below
    // `md`, PM's own shape for a tab row (`AdminSettingsSection.tsx:89`), and
    // the vertical rail from `md` up.
    <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
      <aside
        data-scroll
        className={cn(
          'flex-none flex gap-0.5 px-2 py-2 overflow-x-auto bg-surface-2 scrollbar-hidden',
          'border-b border-[color:var(--border)]',
          // 240px and `bg-surface-2` are PM's settings rail verbatim
          // (`settings/layout.tsx:275-277`).
          'md:w-[240px] md:flex-col md:overflow-x-visible md:overflow-y-auto',
          'md:border-b-0 md:border-r md:border-[color:var(--border)]',
        )}
      >
        <span className="hidden md:block px-2 pt-2 pb-1 text-[11px] font-mono font-semibold uppercase tracking-wider text-fg-3">
          Settings
        </span>
        {TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={V.setSettingsTab}
            data-v={key}
            className={cn(TAB, V.settingsTab === key ? TAB_ON : TAB_OFF)}
          >
            {label}
          </button>
        ))}
      </aside>

      {/* PM's settings pages cap their content at 720px and centre it (7 pages,
          e.g. `settings/profile/page.tsx:368`); this pane was full-bleed, which
          at 1920px stretched every form field the width of the screen. PM puts
          the cap on the page inside a full-bleed scroll container; here the
          pane is the scroll container, so the cap sits on it directly.

          The padding is PM's too — its settings content pane is a flat `px-8
          py-8` with no breakpoint (`settings/layout.tsx:343`). */}
      <div
        data-scroll
        className="flex-1 min-w-0 max-w-[720px] mx-auto overflow-y-auto p-8 flex flex-col gap-4"
      >
        <Breadcrumb
          items={[{ label: 'Home' }, { label: 'Settings' }].concat(
            V.settingsTabLabel ? [{ label: V.settingsTabLabel }] : [],
          )}
        />

        {V.tabOverview && (
          <div className="flex flex-col gap-4">
            <div>
              <h1 className={PAGE_TITLE}>Settings</h1>
              <p className={PAGE_SUB}>
                Eight panels. Everything here is shared by the whole instance, so changes touch
                every agent.
              </p>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-3">
              {V.settingsCards.map((c) => (
                // `.interactive` is PM's opt-in card tactility: -1px on
                // `--dur-fast`, where this card used to lift 4px over 250ms on
                // the marketing site's overshoot curve.
                <button
                  key={c.v}
                  onClick={V.setSettingsTab}
                  data-v={c.v}
                  className={cn(
                    PANEL,
                    'interactive p-4 flex flex-col items-start gap-1.5 text-left cursor-pointer focus-ring',
                  )}
                >
                  <span className="text-[14px] font-semibold text-fg">{c.name}</span>
                  <span className="text-[12.5px] text-fg-2 leading-relaxed">{c.blurb}</span>
                  <Badge variant="primary" className="mt-0.5">
                    {c.meta}
                  </Badge>
                </button>
              ))}
            </div>

            {V.pmAvailable && (
              <div className={CARD}>
                <div className="flex items-start gap-3 flex-wrap">
                  <div className="flex-1 min-w-[220px]">
                    <span className={CARD_TITLE}>Plumo account</span>
                    <p className="text-[12.5px] text-fg-2 leading-relaxed mt-1">
                      {V.pmLinked
                        ? 'This desk is connected to plumo. Your account and workspace are linked.'
                        : 'Connect this desk to your plumo workspace, so the same people and projects line up across both.'}
                    </p>
                  </div>
                  <button
                    onClick={V.pmLinked ? V.disconnectPm : V.connectPm}
                    disabled={V.pmBusy}
                    className={V.pmLinked ? editBtn() : primaryBtn()}
                  >
                    {V.pmBusy ? 'Working…' : V.pmLinked ? 'Disconnect' : 'Connect plumo'}
                  </button>
                </div>
                {V.pmNotice && (
                  <span className="text-[12.5px] text-[color:var(--primary)] bg-[color:var(--primary-soft)] px-2.5 py-1.5 rounded-token-sm">
                    {V.pmNotice}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {V.tabTeam && (
          <div className="flex flex-col gap-4">
            <div className="flex items-end gap-3 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <h1 className={PAGE_TITLE}>Team &amp; users</h1>
                <p className={PAGE_SUB}>
                  Eight people across two teams. Roles decide what each of them can reach.
                </p>
              </div>
              {V.canInvite && (
                <button onClick={V.openInvite} className={primaryBtn()}>
                  Invite someone
                </button>
              )}
            </div>
            <div className={TABLE}>
              <div className={THEAD} style={{ gridTemplateColumns: TEAM_COLS }}>
                <span>name</span>
                <span>email</span>
                <span>role</span>
                <span>team</span>
                <span>last active</span>
                <span className="text-right">actions</span>
              </div>
              {/* The people table is built from the reference wave, not from a
                  panel read, so a cold boot straight into Settings finds it
                  empty for as long as that wave takes. */}
              {V.teamLoading && V.teamRows.length === 0 && (
                <TableSkeleton cols={TEAM_COLS} cells={[64, 78, '50%', '54%', '58%', '40%']} rows={5} />
              )}
              {/* And when that wave failed, five rows of bars pulsing under the
                  headings would be a promise nobody is going to keep. */}
              {V.teamFailed && V.teamRows.length === 0 && (
                <div className="px-3 py-8 text-center text-[13px] text-fg-3">
                  Couldn&apos;t load your people. Use <b className="font-medium">Try again</b> at the top of the console.
                </div>
              )}
              {V.teamRows.map((u) => (
                <div key={u.id} className={TROW} style={{ gridTemplateColumns: TEAM_COLS }}>
                  <span className="flex items-center gap-2.5 min-w-0">
                    <span className="relative flex-none">
                      <UserAvatar
                        firstName={(u.name || '').split(' ')[0]}
                        lastName={(u.name || '').split(' ').slice(1).join(' ')}
                        size="sm"
                      />
                      {/* `[data-tone]` is the support-domain palette both apps
                          agree CS keeps — availability has no PM analogue. */}
                      <i
                        data-tone={u.availTone}
                        className="absolute -right-px -bottom-px w-2 h-2 rounded-full border-2 border-[color:var(--surface)]"
                        style={{ background: 'var(--tone-hue)' }}
                      />
                    </span>
                    <Ellipsis>{u.name}</Ellipsis>
                  </span>
                  <Ellipsis className="text-fg-2">{u.email}</Ellipsis>
                  <TonePill tone="st-open" size="md">
                    {u.role}
                  </TonePill>
                  <span className="text-fg-2">{u.teamName}</span>
                  <span className="text-fg-2 text-[12.5px] tabular-nums">{u.lastRel}</span>
                  {/* Both writes are admin-only on the server. A lead sees no
                      buttons rather than buttons that answer 403, and nobody
                      sees a deactivate control on their own row — it would
                      revoke their own tokens and sign them out mid-sentence. */}
                  <span className="flex gap-1.5 justify-end">
                    {u.canEdit && (
                      <button onClick={V.editUser} data-id={u.id} className={editBtn()}>
                        Edit
                      </button>
                    )}
                    {u.canDeactivate && (
                      <button
                        onClick={V.askDeactivate}
                        data-id={u.id}
                        data-name={u.name}
                        aria-label={'Deactivate ' + u.name}
                        title={'Deactivate ' + u.name}
                        className={iconBtn()}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          width="13"
                          height="13"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        >
                          <path d="M6 6l12 12M18 6L6 18" />
                        </svg>
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>

            {/* pending invitations — people who have been asked but haven't arrived yet */}
            {V.canInvite && (
              <div className="flex flex-col gap-2.5">
                <div>
                  <span className={CARD_TITLE}>Pending invitations</span>
                  <p className={CARD_SUB}>Each link works once, and only for seven days.</p>
                </div>

                {V.invitesLoading && <span className="text-[12.5px] text-fg-2">Loading…</span>}

                {V.invitesFailed && (
                  <LoadNote>
                    Failed to load the invitations. The people above are unaffected.
                  </LoadNote>
                )}

                {!V.invitesLoading && !V.invitesFailed && !V.hasInvites && (
                  <span className={HINT}>Nobody is waiting on an invitation right now.</span>
                )}

                {V.hasInvites && (
                  <div className={TABLE}>
                    <div className={THEAD} style={{ gridTemplateColumns: INVITE_COLS }}>
                      <span>email</span>
                      <span>role</span>
                      <span>invited by</span>
                      <span>expires</span>
                      <span className="text-right">actions</span>
                    </div>
                    {V.inviteRows.map((i) => (
                      <div key={i.id} className={TROW} style={{ gridTemplateColumns: INVITE_COLS }}>
                        <Ellipsis>{i.email}</Ellipsis>
                        <TonePill tone="st-open" size="md">
                          {i.role}
                        </TonePill>
                        <Ellipsis className="text-fg-2">
                          {i.invitedBy} · {i.sentRel}
                        </Ellipsis>
                        <TonePill tone={i.tone} size="md">
                          {i.expiresLabel}
                        </TonePill>
                        <span className="flex justify-end">
                          <button
                            onClick={V.revokeInvite}
                            data-id={i.id}
                            data-email={i.email}
                            className={editBtn()}
                          >
                            Revoke
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <Modal
              isOpen={V.inviteOpen}
              onClose={V.closeInvite}
              title="Invite someone"
              size="md"
              footer={
                <>
                  <Button variant="outline" size="md" onClick={V.closeInvite}>
                    Cancel
                  </Button>
                  {/* PM keeps the label still and puts the progress in the
                      button's own spinner (`EditProjectMemberTagModal.tsx:154`)
                      rather than swapping the words out under the cursor. */}
                  <Button size="md" onClick={V.submitInvite} loading={V.inviteBusy}>
                    Send invitation
                  </Button>
                </>
              }
            >
              <div className="flex flex-col gap-3.5">
                <p className="text-[13px] text-fg-3">
                  They are emailed a link that works once and expires in seven days. If they already
                  have a plumo account, this simply adds the desk to it.
                </p>

                {V.inviteError && (
                  <div className="px-3 py-2.5 rounded-token-sm text-[13px] bg-[color:var(--danger-soft)] text-[color:var(--danger)]">
                    {V.inviteError}
                  </div>
                )}

                <Input
                  label="Email"
                  type="email"
                  required
                  value={V.inviteEmail}
                  onChange={V.onInviteEmail}
                  onKeyDown={V.onInviteKey}
                  placeholder="them@theircompany.com"
                  autoComplete="off"
                  className="h-btn-lg text-[14px]"
                />

                <Select
                  label="Role"
                  value={V.inviteRole}
                  onChange={V.onInviteRole}
                  options={V.inviteRoleOptions}
                />

                <Select
                  label="Team"
                  value={V.inviteTeam}
                  onChange={V.onInviteTeam}
                  options={V.inviteTeamOptions}
                  helperText="You can move them to another team later."
                />
              </div>
            </Modal>
          </div>
        )}

        {V.tabSla && (
          <div className="flex flex-col gap-4">
            <div className="flex items-end gap-3 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <h1 className={PAGE_TITLE}>SLA policies</h1>
                <p className={PAGE_SUB}>
                  Targets by priority. Clocks pause outside business hours, and while you are
                  waiting on someone.
                </p>
              </div>
              {V.canManageDesk && (
                <button onClick={V.newSlaPolicy} className={primaryBtn()}>
                  Add a policy
                </button>
              )}
            </div>
            {V.slaErr && <LoadNote onRetry={V.retrySettingsTab}>{V.slaErr}</LoadNote>}
            <div className={TABLE}>
              <div className={THEAD} style={{ gridTemplateColumns: SLA_COLS }}>
                <span>name</span>
                <span>priority</span>
                <span>first response</span>
                <span>resolution</span>
                <span>hours</span>
                <span className="text-right" />
              </div>
              {V.settingsLoading && V.slaRows.length === 0 && (
                <TableSkeleton cols={SLA_COLS} cells={[62, 58, '46%', '46%', '52%', '40%']} rows={3} />
              )}
              {V.slaRows.map((p) => (
                <div key={p.id} className={TROW} style={{ gridTemplateColumns: SLA_COLS }}>
                  <span className="font-medium">{p.name}</span>
                  <span className="text-fg-2">{p.priority}</span>
                  <span className="tabular-nums">{p.firstResponse}</span>
                  <span className="tabular-nums">{p.resolution}</span>
                  <span className="text-fg-2">{p.hours}</span>
                  <span className="text-right">
                    {V.canManageDesk && (
                      <button onClick={V.editSlaPolicy} data-id={p.id} className={editBtn()}>
                        Edit
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>
            {/* The "new policy" card that used to sit here was a set of inputs
                nothing read and two buttons that only toasted. "add a policy"
                above opens the real form. */}
          </div>
        )}

        {V.tabHours && (
          <div className="flex flex-col gap-4 max-w-[680px]">
            <div>
              <h1 className={PAGE_TITLE}>Business hours</h1>
              <p className={PAGE_SUB}>SLA clocks rest when your team does.</p>
            </div>
            {V.hoursErr && <LoadNote onRetry={V.retrySettingsTab}>{V.hoursErr}</LoadNote>}

            {/* No calendar at all is a real state, not a loading one — the
                clocks then run around the clock. Say that rather than show an
                empty week with every switch greyed out and no explanation. */}
            {!V.hoursReady && !V.hoursErr && (
              <span className={HINT}>
                This desk has no working calendar yet, so SLA clocks run 24/7. One has to be created
                on the server before the days below can be switched on and off here.
              </span>
            )}

            {/* The tick is bound to what the server confirmed, not to a local
                guess: a failed write leaves the day exactly as it was and says
                so, instead of a tick that stays put over an unchanged schedule. */}
            <div className={TABLE}>
              {V.hoursRows.map((d) => (
                <div key={d.day} className={TROW} style={{ gridTemplateColumns: HOURS_COLS }}>
                  <span>{d.day}</span>
                  <span className="tabular-nums text-fg-2">{d.open}</span>
                  <span className="tabular-nums text-fg-2">{d.close}</span>
                  {/* The label is what makes the track clickable — Switch's
                      input is sr-only and the component is not a label itself. */}
                  <label className="text-right cursor-pointer">
                    {/* Writes on flip, so it reads as a switch. */}
                    <Switch
                      checked={d.on}
                      disabled={!V.canManageDesk || !V.hoursReady || V.hoursBusy}
                      onChange={V.toggleHoursDay}
                      data-day={d.key}
                      aria-label={'Work on ' + d.day}
                    />
                  </label>
                </div>
              ))}
            </div>
            <div className={CARD}>
              <div>
                <span className={CARD_TITLE}>Holidays</span>
                <p className={CARD_SUB}>
                  The clocks rest on these days too, so no target ever lands on one.
                </p>
              </div>
              <div className="flex gap-1.5 flex-wrap items-center">
                {V.holidays.map((h) => (
                  <Badge key={h.date} variant="primary" className="h-[22px] px-2 text-[12px] gap-1">
                    {h.label}
                    {V.canManageDesk && (
                      <button
                        onClick={V.removeHoliday}
                        data-date={h.date}
                        disabled={V.hoursBusy}
                        aria-label={'Stop resting on ' + h.label}
                        className="rounded-full leading-none cursor-pointer focus-ring opacity-70 hover:opacity-100"
                      >
                        ×
                      </button>
                    )}
                  </Badge>
                ))}
                {!V.hasHolidays && (
                  <span className="text-[12.5px] text-fg-2">None yet. Every working day counts.</span>
                )}
              </div>
              {V.canManageDesk && (
                <div className="flex gap-2 items-center flex-wrap">
                  <div className="w-[200px]">
                    <Input
                      type="date"
                      value={V.holidayDraft}
                      onChange={V.onHolidayDraft}
                      aria-label="Holiday date"
                    />
                  </div>
                  <button
                    onClick={V.addHoliday}
                    disabled={!V.hoursReady || V.hoursBusy}
                    className={editBtn()}
                  >
                    Add a holiday
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {V.tabCanned && (
          <div className="flex flex-col gap-4">
            <div className="flex items-end gap-3 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <h1 className={PAGE_TITLE}>Canned responses</h1>
                <p className={PAGE_SUB}>Written once, so nobody has to find the words twice.</p>
              </div>
              {V.canManageCanned && (
                <button onClick={V.newCanned} className={primaryBtn()}>
                  New response
                </button>
              )}
            </div>
            {V.cannedErr && <LoadNote onRetry={V.retrySettingsTab}>{V.cannedErr}</LoadNote>}
            <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-3">
              {/* This one is a card grid, not a table, so it gets the card's
                  own shape: title row, two body lines, tag chip. */}
              {V.settingsLoading && V.cannedRows.length === 0 && [0, 1, 2].map((i) => (
                <div key={i} className={PANEL + ' p-4 flex flex-col gap-2'} aria-hidden="true">
                  <span className="flex items-center gap-2">
                    <Skeleton className="h-3.5 flex-1 rounded-full" style={{ maxWidth: `${56 + ((i * 11) % 24)}%`, animationDelay: `${i * 100}ms` }} />
                    <Skeleton className="h-2.5 w-16 rounded-full" style={{ animationDelay: `${i * 100 + 30}ms` }} />
                  </span>
                  <Skeleton className="h-3 w-full rounded-full" style={{ animationDelay: `${i * 100 + 60}ms` }} />
                  <Skeleton className="h-3 w-4/5 rounded-full" style={{ animationDelay: `${i * 100 + 90}ms` }} />
                  <Skeleton className="h-4 w-20 rounded-token-sm" style={{ animationDelay: `${i * 100 + 120}ms` }} />
                </div>
              ))}
              {V.cannedRows.map((r) => (
                <div key={r.id} className={PANEL + ' p-4 flex flex-col gap-2'}>
                  <span className="flex items-center gap-2">
                    <span className="flex-1 text-[13.5px] font-medium">{r.title}</span>
                    <span className="text-[11.5px] text-fg-2">{r.team}</span>
                  </span>
                  <p className="text-[12.5px] text-fg-2 leading-relaxed">{r.snippet}</p>
                  <span className="flex items-center gap-2">
                    <Badge>{r.tagList}</Badge>
                    <span className="flex-1" />
                    {V.canManageCanned && (
                      <button onClick={V.editCanned} data-id={r.id} className={editBtn()}>
                        Edit
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {V.tabTags && (
          <div className="flex flex-col gap-4 max-w-[620px]">
            <div>
              <h1 className={PAGE_TITLE}>Tags</h1>
              <p className={PAGE_SUB}>
                How conversations get sorted. A key is written onto every conversation that wears
                it, so it never changes.
              </p>
            </div>
            {V.tagsErr && <LoadNote onRetry={V.retrySettingsTab}>{V.tagsErr}</LoadNote>}
            <div className={TABLE}>
              {V.settingsLoading && V.tagRows.length === 0 && (
                <TableSkeleton cols={TAG_COLS} cells={[54, '58%', '40%']} rows={4} />
              )}
              {V.tagRows.map((t) => (
                <div key={t.id} className={TROW} style={{ gridTemplateColumns: TAG_COLS }}>
                  <TonePill tone={t.tone} size="md" dot>
                    {t.label}
                  </TonePill>
                  <span className="text-fg-2 tabular-nums text-[12.5px]">
                    {t.count} conversations
                  </span>
                  <span className="text-right">
                    {V.canManageDesk && (
                      <button onClick={V.editTag} data-key={t.key} className={editBtn()}>
                        Edit
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>
            {V.canManageDesk && (
              <Button variant="outline" size="sm" onClick={V.newTag} className="self-start">
                + New tag
              </Button>
            )}
          </div>
        )}

        {V.tabHooks && (
          <div className="flex flex-col gap-4">
            <div className="flex items-end gap-3 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <h1 className={PAGE_TITLE}>Webhooks</h1>
                <p className={PAGE_SUB}>Where plumo tells other systems what happened.</p>
              </div>
              {V.canManageDesk && (
                <button onClick={V.newWebhook} className={primaryBtn()}>
                  Add endpoint
                </button>
              )}
            </div>
            {V.hooksErr && <LoadNote onRetry={V.retrySettingsTab}>{V.hooksErr}</LoadNote>}
            <div className={TABLE}>
              <div className={THEAD} style={{ gridTemplateColumns: HOOK_COLS }}>
                <span>endpoint</span>
                <span>events</span>
                <span>status</span>
                <span className="text-right">last delivery</span>
              </div>
              {V.settingsLoading && V.hookRows.length === 0 && (
                <TableSkeleton cols={HOOK_COLS} cells={[78, 62, '46%', '56%']} rows={3} />
              )}
              {V.hookRows.map((w) => (
                <div key={w.id} className={TROW} style={{ gridTemplateColumns: HOOK_COLS }}>
                  <Ellipsis className="font-mono text-[12px]">{w.url}</Ellipsis>
                  <Ellipsis className="text-fg-2 text-[12.5px]">{w.events}</Ellipsis>
                  <TonePill tone={w.tone} size="md" dot>
                    {w.status}
                  </TonePill>
                  <span className="text-right text-fg-2 text-[12.5px]">{w.last}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {V.tabKeys && (
          <div className="flex flex-col gap-4">
            <div>
              <h1 className={PAGE_TITLE}>API keys</h1>
              <p className={PAGE_SUB}>A key is shown once and never again.</p>
            </div>

            <div className={CARD}>
              <span className={CARD_TITLE}>New key</span>
              <div className="flex gap-2.5 flex-wrap items-end">
                <div className="flex-1 min-w-[200px]">
                  <Input
                    label="Name"
                    value={V.keyName}
                    onChange={V.onKeyName}
                    placeholder="4hacks chatbot"
                  />
                </div>
                <button onClick={V.genKey} className={primaryBtn()}>
                  Generate key
                </button>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-[12.5px] text-fg-2">What is it for</span>
                <div className="flex gap-1.5 flex-wrap">
                  {V.keyKinds.map((k) => (
                    // Selected/unselected on PM's own recipe — soft primary fill
                    // with a primary border and label (`NavLink.tsx:32`) — in
                    // place of the `[data-on]` token trio.
                    <button
                      key={k.id}
                      onClick={V.setKeyKind}
                      data-v={k.id}
                      title={k.scopes.join(', ')}
                      className={cn(
                        'h-btn-sm px-3 rounded-token-sm border text-[12.5px] cursor-pointer transition-colors focus-ring',
                        k.on
                          ? 'bg-[color:var(--primary-soft)] border-[color:var(--primary-soft-border)] text-[color:var(--primary)] font-medium'
                          : 'bg-transparent border-[color:var(--border)] text-fg-2 hover:bg-surface-2 hover:text-fg',
                      )}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>
                <span className="text-[12px] text-fg-2">
                  {(V.keyKinds.find((k) => k.on) || {}).hint}
                </span>
              </div>
            </div>
            {V.hasSecret && (
              <div
                data-tone="st-pending"
                className="animate-fade-in flex items-center gap-3 flex-wrap px-4 py-3.5 rounded-token border"
                style={{
                  background: 'color-mix(in srgb, var(--tone-hue) 12%, var(--surface))',
                  borderColor: 'color-mix(in srgb, var(--tone-hue) 30%, transparent)',
                }}
              >
                <div className="flex-1 min-w-[220px] flex flex-col gap-1">
                  <span className="text-[12.5px] font-medium" style={{ color: 'var(--tone-fg)' }}>
                    Copy this now — it cannot be shown again
                  </span>
                  <span className="font-mono text-[13px] text-fg break-all">{V.secret}</span>
                </div>
                <Button variant="outline" size="sm" onClick={V.copySecret}>
                  Copy
                </Button>
                <Button variant="ghost" size="sm" onClick={V.hideKey}>
                  Done
                </Button>
              </div>
            )}
            <div className={TABLE}>
              <div className={THEAD} style={{ gridTemplateColumns: KEY_COLS }}>
                <span>name</span>
                <span>scope</span>
                <span>created</span>
                <span className="text-right">last used</span>
                <span className="text-right" />
              </div>
              {V.settingsLoading && V.keyRows.length === 0 && (
                <TableSkeleton cols={KEY_COLS} cells={[70, 80, '64%', '58%', '40%']} rows={3} />
              )}
              {V.keyRows.map((k) => (
                <div key={k.id} className={TROW} style={{ gridTemplateColumns: KEY_COLS }}>
                  <span className="flex items-center gap-1.5 min-w-0">
                    <Ellipsis>{k.name}</Ellipsis>
                    {k.active === false && (
                      <TonePill tone="st-closed">Revoked</TonePill>
                    )}
                  </span>
                  <span className="text-fg-2">{k.scope}</span>
                  <span className="text-fg-2 text-[12.5px]">{k.created}</span>
                  <span className="text-right text-fg-2 text-[12.5px]">{k.last}</span>
                  <span className="text-right">
                    {k.active !== false && (
                      <button onClick={V.revokeKey} data-id={k.id} className={editBtn()}>
                        Revoke
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {V.tabEmail && (
          <div className="flex flex-col gap-4 max-w-[680px]">
            <div>
              <h1 className={PAGE_TITLE}>Email &amp; channels</h1>
              <p className={PAGE_SUB}>Where conversations come in.</p>
            </div>

            {/* The receiving address is the only setting on this screen with
                anything behind it. The reply-to name and the three "manage"
                buttons that used to sit under it had no endpoint at all — they
                showed a toast and changed nothing, so they are gone. */}
            {!V.canManageDesk ? (
              <span className={HINT}>The receiving address is an admin setting.</span>
            ) : (
              <div className={PANEL + ' p-5 flex flex-col gap-3'}>
                <div>
                  <span className={CARD_TITLE}>Inbound</span>
                  <p className="text-[12.5px] text-fg-2 leading-relaxed mt-1">
                    Mail sent to this address becomes a conversation on this desk. Leave it empty to
                    stop receiving mail. Nothing already here is lost; new messages are simply
                    refused.
                  </p>
                </div>

                {V.emailErr && <LoadNote onRetry={V.retrySettingsTab}>{V.emailErr}</LoadNote>}

                {/* The rejection sits under the address it is about, rather
                    than in a banner two rows above it. */}
                <div className="flex gap-2.5 flex-wrap items-start">
                  <div className="flex-1 min-w-[220px]">
                    {/* Disabled until the current address is known. Typing into
                        it while the GET was in flight got the typing silently
                        replaced when the response landed. */}
                    <Input
                      label="Receiving address"
                      type="email"
                      value={V.inboundDraft}
                      onChange={V.onInboundDraft}
                      error={V.inboundError}
                      disabled={!V.inboundKnown}
                      placeholder={V.inboundKnown ? 'help@yourcompany.com' : 'Reading the current address…'}
                      autoComplete="off"
                    />
                  </div>
                  {/* 20px = the label's 16px line box + its 4px margin, so the
                      button's top edge meets the field's, not the label's. */}
                  <button
                    onClick={V.saveInbound}
                    disabled={V.inboundBusy || !V.inboundKnown}
                    className={cn(primaryBtn(), 'mt-5')}
                  >
                    {V.inboundBusy ? 'Saving…' : 'Save'}
                  </button>
                </div>

                {/* "Inbound mail is off" was printed for the whole of the GET,
                    telling an admin the channel was switched off when it was
                    not. There is a third state and this is it. */}
                {V.inboundKnown ? (
                  <TonePill tone={V.inboundOn ? 'sla-met' : 'sla-paused'} size="md">
                    {V.inboundOn ? 'Receiving mail' : 'Inbound mail is off'}
                  </TonePill>
                ) : (
                  <Skeleton className="h-[22px] w-32 rounded-full" />
                )}
              </div>
            )}

            <span className="text-[12.5px] text-fg-2 leading-relaxed">
              The reply-to name, the in-app widget and the chatbot bridge have no setting behind
              them yet, so there is nothing here to change. Keys for the public API live in the API
              keys panel.
            </span>
          </div>
        )}

        {/* One editor for every panel that writes a record.
            Six bespoke forms would be six places for a success message to
            drift back in front of a failed request; this is one place a
            failure is shown and one place a success is announced, and it
            stays open — holding what was typed — until the server agrees. */}
        <Modal
          isOpen={V.editorOpen}
          onClose={V.closeEditor}
          title={V.editorTitle}
          size="md"
          footer={
            <>
              <Button variant="outline" size="md" onClick={V.closeEditor}>
                Cancel
              </Button>
              <Button size="md" onClick={V.submitEditor} loading={V.editorBusy}>
                {V.editorOk}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-3.5">
            {V.editorNote && <p className="text-[13px] text-fg-3">{V.editorNote}</p>}

            {V.editorError && (
              <div className="px-3 py-2.5 rounded-token-sm text-[13px] bg-[color:var(--danger-soft)] text-[color:var(--danger)]">
                {V.editorError}
              </div>
            )}

            {V.editorFields.map((f) =>
              f.kind === 'select' ? (
                <Select
                  key={f.name}
                  label={f.label}
                  value={f.value}
                  data-f={f.name}
                  onChange={V.onEditorField}
                  options={f.options}
                  helperText={f.helper}
                />
              ) : f.kind === 'textarea' ? (
                <Textarea
                  key={f.name}
                  label={f.label}
                  value={f.value}
                  data-f={f.name}
                  onChange={V.onEditorField}
                  placeholder={f.placeholder}
                  helperText={f.helper}
                  rows={6}
                />
              ) : f.kind === 'checks' ? (
                <fieldset key={f.name} className="flex flex-col gap-1.5">
                  <legend className="text-xs font-medium text-fg mb-1">{f.label}</legend>
                  {f.options.map((o) => (
                    <label key={o.value} className={CHECK_LABEL}>
                      <input
                        type="checkbox"
                        data-f={f.name}
                        value={o.value}
                        checked={o.on}
                        onChange={V.onEditorField}
                        className={CHECKBOX}
                        style={CHECKBOX_STYLE}
                      />
                      {o.label}
                    </label>
                  ))}
                </fieldset>
              ) : (
                <Input
                  key={f.name}
                  label={f.label}
                  value={f.value}
                  data-f={f.name}
                  onChange={V.onEditorField}
                  placeholder={f.placeholder}
                  helperText={f.helper}
                  autoComplete="off"
                />
              ),
            )}
          </div>
        </Modal>
      </div>
    </div>
  );
}
