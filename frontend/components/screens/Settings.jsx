'use client';

import { sx } from '../sx';
import { buttonVariants } from '../common/Button';
import { cn } from '@/lib/utils';
import { Button, Input, Modal, Select, Textarea, UserAvatar } from '../common';

/* Settings keeps its dense bespoke layout, but every control below borrows the
   shared components' own class strings (buttonVariants / the Input recipe) so
   geometry, colour and focus rings match Button and Input exactly. */
const tabBtn = () => cn(
  'w-full px-2.5 py-[9px] rounded-token-sm border-none text-[13px] text-left cursor-pointer',
  'transition-colors duration-[var(--dur-instant)] hover:bg-surface-2',
);
const editBtn = () => buttonVariants({ variant: 'secondary', size: 'sm' });
const primaryBtn = () => cn(buttonVariants({ variant: 'primary', size: 'md' }), 'whitespace-nowrap');
const fieldInput = () => cn(
  'flex h-input w-full rounded-token-sm border bg-surface px-2.5 py-1.5 text-[13px] text-fg placeholder:text-fg-3',
  'border-[color:var(--border)] focus:outline-none focus:border-[color:var(--primary)] focus-ring',
);

/**
 * A panel whose rows could not be fetched says so, in place, rather than
 * showing the copy bootstrap happened to leave behind as if it were current.
 */
const LoadNote = ({ children }) => (
  <span data-tone="sla-breach" className={sx('font-size:12.5px;padding:8px 12px;border-radius:var(--cs-r-sm);background:color-mix(in srgb, var(--tone-hue) 14%, var(--cs-surface));color:var(--tone-fg)')}>
    {children}
  </span>
);

export default function Settings({ V }) {
  return (
    <div className={sx('flex:1;min-height:0;display:flex;overflow:hidden')}>
      <aside data-scroll className={sx('flex:none;width:210px;border-right:1px solid var(--cs-border);background:var(--cs-surface);padding:16px 12px;overflow-y:auto;display:flex;flex-direction:column;gap:2px')}>
        <span className={sx('font-size:11px;letter-spacing:2px;text-transform:uppercase;color:var(--cs-brand);font-weight:500;padding:4px 10px 10px')}>settings</span>
        <button onClick={V.setSettingsTab} data-v="overview" data-on={String(V.tabOverview)} className={tabBtn()} style={{background:"var(--cs-onbg)",color:"var(--cs-onfg)",fontWeight:"var(--cs-onw)"}}>overview</button>
        <button onClick={V.setSettingsTab} data-v="team" data-on={String(V.tabTeam)} className={tabBtn()} style={{background:"var(--cs-onbg)",color:"var(--cs-onfg)",fontWeight:"var(--cs-onw)"}}>team &amp; users</button>
        <button onClick={V.setSettingsTab} data-v="sla" data-on={String(V.tabSla)} className={tabBtn()} style={{background:"var(--cs-onbg)",color:"var(--cs-onfg)",fontWeight:"var(--cs-onw)"}}>sla policies</button>
        <button onClick={V.setSettingsTab} data-v="hours" data-on={String(V.tabHours)} className={tabBtn()} style={{background:"var(--cs-onbg)",color:"var(--cs-onfg)",fontWeight:"var(--cs-onw)"}}>business hours</button>
        <button onClick={V.setSettingsTab} data-v="canned" data-on={String(V.tabCanned)} className={tabBtn()} style={{background:"var(--cs-onbg)",color:"var(--cs-onfg)",fontWeight:"var(--cs-onw)"}}>canned responses</button>
        <button onClick={V.setSettingsTab} data-v="tags" data-on={String(V.tabTags)} className={tabBtn()} style={{background:"var(--cs-onbg)",color:"var(--cs-onfg)",fontWeight:"var(--cs-onw)"}}>tags</button>
        <button onClick={V.setSettingsTab} data-v="hooks" data-on={String(V.tabHooks)} className={tabBtn()} style={{background:"var(--cs-onbg)",color:"var(--cs-onfg)",fontWeight:"var(--cs-onw)"}}>webhooks</button>
        <button onClick={V.setSettingsTab} data-v="keys" data-on={String(V.tabKeys)} className={tabBtn()} style={{background:"var(--cs-onbg)",color:"var(--cs-onfg)",fontWeight:"var(--cs-onw)"}}>api keys</button>
        <button onClick={V.setSettingsTab} data-v="email" data-on={String(V.tabEmail)} className={tabBtn()} style={{background:"var(--cs-onbg)",color:"var(--cs-onfg)",fontWeight:"var(--cs-onw)"}}>email &amp; channels</button>
      </aside>

      <div data-scroll className={sx('flex:1;min-width:0;overflow-y:auto;padding:22px 24px;display:flex;flex-direction:column;gap:16px')}>
        {V.tabOverview && (
          <div className={sx('display:flex;flex-direction:column;gap:16px')}>
            <div className={sx('display:flex;flex-direction:column;gap:4px')}>
              <h2 className={sx('font-size:20px;font-weight:500;letter-spacing:-.5px')}>settings</h2>
              <p className={sx('font-size:13px;color:var(--cs-muted)')}>eight panels. everything here is shared by the whole instance, so changes touch every agent.</p>
            </div>
            <div className={sx('display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px')}>
              {V.settingsCards.map(c => (
                <button key={c.v} onClick={V.setSettingsTab} data-v={c.v} className={sx('display:flex;flex-direction:column;align-items:flex-start;gap:6px;padding:var(--cs-cardpad);border:0.5px solid var(--cs-border);border-radius:var(--cs-r-md);background:var(--cs-surface);cursor:pointer;text-align:left;transition:transform var(--plumo-dur-default) var(--plumo-ease)', { hover: 'transform:translateY(-4px)' })}>
                  <span className={sx('font-size:14.5px;font-weight:500')}>{c.name}</span>
                  <span className={sx('font-size:12.5px;color:var(--cs-muted);line-height:1.5')}>{c.blurb}</span>
                  <span className={sx('margin-top:2px;padding:2px 9px;border-radius:100px;background:var(--cs-soft);font-size:11.5px;color:var(--cs-brand-ink)')}>{c.meta}</span>
                </button>
              ))}
            </div>

            {V.pmAvailable && (
              <div className={sx('display:flex;flex-direction:column;gap:10px;padding:var(--cs-cardpad);border:0.5px solid var(--cs-border);border-radius:var(--cs-r-md);background:var(--cs-surface)')}>
                <div className={sx('display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap')}>
                  <div className={sx('flex:1;min-width:220px;display:flex;flex-direction:column;gap:4px')}>
                    <span className={sx('font-size:14.5px;font-weight:500')}>plumo account</span>
                    <span className={sx('font-size:12.5px;color:var(--cs-muted);line-height:1.5')}>
                      {V.pmLinked
                        ? 'this desk is connected to plumo. your account and workspace are linked.'
                        : 'connect this desk to your plumo workspace, so the same people and projects line up across both.'}
                    </span>
                  </div>
                  <button
                    onClick={V.pmLinked ? V.disconnectPm : V.connectPm}
                    disabled={V.pmBusy}
                    className={V.pmLinked ? editBtn() : primaryBtn()}
                  >
                    {V.pmBusy ? 'working…' : V.pmLinked ? 'disconnect' : 'connect plumo'}
                  </button>
                </div>
                {V.pmNotice && (
                  <span className={sx('font-size:12.5px;color:var(--cs-brand-ink);background:var(--cs-soft);padding:6px 10px;border-radius:var(--cs-r-sm)')}>{V.pmNotice}</span>
                )}
              </div>
            )}
          </div>
        )}

        {V.tabTeam && (
          <div className={sx('display:flex;flex-direction:column;gap:16px')}>
            <div className={sx('display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap')}>
              <div className={sx('flex:1;min-width:200px;display:flex;flex-direction:column;gap:4px')}>
                <h2 className={sx('font-size:20px;font-weight:500;letter-spacing:-.5px')}>team &amp; users</h2>
                <p className={sx('font-size:13px;color:var(--cs-muted)')}>eight people across two teams. roles decide what each of them can reach.</p>
              </div>
              {V.canInvite && <button onClick={V.openInvite} className={primaryBtn()}>invite someone</button>}
            </div>
            <div className={sx('border:0.5px solid var(--cs-border);border-radius:var(--cs-r-md);background:var(--cs-surface);overflow:hidden')}>
              <div className={sx('display:grid;grid-template-columns:minmax(170px,1.2fr) minmax(180px,1.4fr) 110px 100px 120px 92px;gap:12px;padding:9px 16px;border-bottom:1px solid var(--cs-border);background:var(--cs-canvas);font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:var(--cs-muted)')}>
                <span>name</span><span>email</span><span>role</span><span>team</span><span>last active</span><span className={sx('text-align:right')}>actions</span>
              </div>
              {V.teamRows.map(u => (
                <div key={u.id} className={sx('display:grid;grid-template-columns:minmax(170px,1.2fr) minmax(180px,1.4fr) 110px 100px 120px 92px;gap:12px;padding:10px 16px;border-bottom:1px solid var(--cs-border);align-items:center;font-size:13.5px')}>
                  <span className={sx('display:flex;align-items:center;gap:9px;min-width:0')}>
                    <span className={sx('position:relative;flex:none')}>
                      <UserAvatar firstName={(u.name||"").split(" ")[0]} lastName={(u.name||"").split(" ").slice(1).join(" ")} size="sm" />
                      <i data-tone={u.availTone} className={sx('position:absolute;right:-1px;bottom:-1px;width:8px;height:8px;border-radius:50%;background:var(--tone-hue);border:2px solid var(--cs-surface)')}></i>
                    </span>
                    <span className={sx('overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{u.name}</span>
                  </span>
                  <span className={sx('color:var(--cs-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{u.email}</span>
                  <span data-tone="st-open" className={sx('padding:3px 9px;border-radius:100px;font-size:12px;background:color-mix(in srgb, var(--tone-hue) 12%, var(--cs-surface));color:var(--tone-fg);width:fit-content')}>{u.role}</span>
                  <span className={sx('color:var(--cs-muted)')}>{u.teamName}</span>
                  <span className={sx('color:var(--cs-muted);font-size:12.5px;font-variant-numeric:tabular-nums')}>{u.lastRel}</span>
                  {/* Both writes are admin-only on the server. A lead sees no
                      buttons rather than buttons that answer 403, and nobody
                      sees a deactivate control on their own row — it would
                      revoke their own tokens and sign them out mid-sentence. */}
                  <span className={sx('display:flex;gap:6px;justify-content:flex-end')}>
                    {u.canEdit && <button onClick={V.editUser} data-id={u.id} className={editBtn()}>edit</button>}
                    {u.canDeactivate && (
                      <button onClick={V.askDeactivate} data-id={u.id} data-name={u.name} aria-label={'deactivate ' + u.name} title={'deactivate ' + u.name} className={sx('display:grid;place-items:center;width:26px;height:26px;border:0.5px solid var(--cs-border);border-radius:50%;background:var(--cs-surface);color:var(--cs-muted);cursor:pointer', { hover: 'background:var(--cs-hover);color:var(--cs-text)' })}>
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"></path></svg>
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>

            {/* pending invitations — people who have been asked but haven't arrived yet */}
            {V.canInvite && (
              <div className={sx('display:flex;flex-direction:column;gap:10px')}>
                <div className={sx('display:flex;flex-direction:column;gap:3px')}>
                  <span className={sx('font-size:14.5px;font-weight:500')}>pending invitations</span>
                  <span className={sx('font-size:12.5px;color:var(--cs-muted)')}>each link works once, and only for seven days.</span>
                </div>

                {V.invitesLoading && (
                  <span className={sx('font-size:12.5px;color:var(--cs-muted)')}>one moment…</span>
                )}

                {V.invitesFailed && (
                  <span data-tone="sla-breach" className={sx('font-size:12.5px;padding:8px 12px;border-radius:var(--cs-r-sm);background:color-mix(in srgb, var(--tone-hue) 14%, var(--cs-surface));color:var(--tone-fg)')}>
                    couldn&apos;t load the invitations just now — the people above are unaffected.
                  </span>
                )}

                {!V.invitesLoading && !V.invitesFailed && !V.hasInvites && (
                  <span className={sx('font-size:12.5px;color:var(--cs-muted);padding:12px 16px;border:0.5px dashed var(--cs-border);border-radius:var(--cs-r-md)')}>
                    nobody is waiting on an invitation right now.
                  </span>
                )}

                {V.hasInvites && (
                  <div className={sx('border:0.5px solid var(--cs-border);border-radius:var(--cs-r-md);background:var(--cs-surface);overflow:hidden')}>
                    <div className={sx('display:grid;grid-template-columns:minmax(180px,1.4fr) 110px minmax(130px,1fr) 120px 92px;gap:12px;padding:9px 16px;border-bottom:1px solid var(--cs-border);background:var(--cs-canvas);font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:var(--cs-muted)')}>
                      <span>email</span><span>role</span><span>invited by</span><span>expires</span><span className={sx('text-align:right')}>actions</span>
                    </div>
                    {V.inviteRows.map(i => (
                      <div key={i.id} className={sx('display:grid;grid-template-columns:minmax(180px,1.4fr) 110px minmax(130px,1fr) 120px 92px;gap:12px;padding:10px 16px;border-bottom:1px solid var(--cs-border);align-items:center;font-size:13.5px')}>
                        <span className={sx('overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{i.email}</span>
                        <span data-tone="st-open" className={sx('padding:3px 9px;border-radius:100px;font-size:12px;background:color-mix(in srgb, var(--tone-hue) 12%, var(--cs-surface));color:var(--tone-fg);width:fit-content')}>{i.role}</span>
                        <span className={sx('color:var(--cs-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{i.invitedBy} · {i.sentRel}</span>
                        <span data-tone={i.tone} className={sx('padding:3px 9px;border-radius:100px;font-size:12px;background:color-mix(in srgb, var(--tone-hue) 14%, var(--cs-surface));color:var(--tone-fg);width:fit-content')}>{i.expiresLabel}</span>
                        <span className={sx('display:flex;justify-content:flex-end')}>
                          <button onClick={V.revokeInvite} data-id={i.id} data-email={i.email}
                            className={sx('padding:4px 10px;border:0.5px solid var(--cs-border);border-radius:100px;background:transparent;color:var(--cs-muted);font-size:12px;cursor:pointer', { hover: 'background:var(--cs-hover);color:var(--cs-text)' })}>
                            revoke
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
              title="invite someone"
              size="md"
              footer={
                <>
                  <Button variant="secondary" size="md" onClick={V.closeInvite}>not now</Button>
                  <Button size="md" onClick={V.submitInvite} disabled={V.inviteBusy}>
                    {V.inviteBusy ? 'sending…' : 'send the invitation'}
                  </Button>
                </>
              }
            >
              <div className="flex flex-col gap-3.5">
                <p className="text-[13px] text-fg-3">
                  we&apos;ll email them a link that works once and expires in seven days. if they already
                  have a plumo account, it simply adds this desk to it.
                </p>

                {V.inviteError && (
                  <div className="px-3 py-2.5 rounded-token-sm text-[13px] bg-[color:var(--danger-soft)] text-[color:var(--danger)]">
                    {V.inviteError}
                  </div>
                )}

                <Input
                  label="email"
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
                  label="role"
                  value={V.inviteRole}
                  onChange={V.onInviteRole}
                  options={V.inviteRoleOptions}
                />

                <Select
                  label="team"
                  value={V.inviteTeam}
                  onChange={V.onInviteTeam}
                  options={V.inviteTeamOptions}
                  helperText="you can move them later — nothing here is final."
                />
              </div>
            </Modal>
          </div>
        )}

        {V.tabSla && (
          <div className={sx('display:flex;flex-direction:column;gap:16px')}>
            <div className={sx('display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap')}>
              <div className={sx('flex:1;min-width:200px;display:flex;flex-direction:column;gap:4px')}>
                <h2 className={sx('font-size:20px;font-weight:500;letter-spacing:-.5px')}>sla policies</h2>
                <p className={sx('font-size:13px;color:var(--cs-muted)')}>targets by priority. clocks pause outside business hours, and while you are waiting on someone.</p>
              </div>
              {V.canManageDesk && <button onClick={V.newSlaPolicy} className={primaryBtn()}>add a policy</button>}
            </div>
            {V.slaErr && <LoadNote>{V.slaErr}</LoadNote>}
            <div className={sx('border:0.5px solid var(--cs-border);border-radius:var(--cs-r-md);background:var(--cs-surface);overflow:hidden')}>
              <div className={sx('display:grid;grid-template-columns:minmax(140px,1fr) minmax(140px,1fr) 140px 130px 150px 70px;gap:12px;padding:9px 16px;border-bottom:1px solid var(--cs-border);background:var(--cs-canvas);font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:var(--cs-muted)')}>
                <span>name</span><span>priority</span><span>first response</span><span>resolution</span><span>hours</span><span className={sx('text-align:right')}></span>
              </div>
              {V.slaRows.map(p => (
                <div key={p.id} className={sx('display:grid;grid-template-columns:minmax(140px,1fr) minmax(140px,1fr) 140px 130px 150px 70px;gap:12px;padding:11px 16px;border-bottom:1px solid var(--cs-border);align-items:center;font-size:13.5px')}>
                  <span className={sx('font-weight:500')}>{p.name}</span>
                  <span className={sx('color:var(--cs-muted)')}>{p.priority}</span>
                  <span className={sx('font-variant-numeric:tabular-nums')}>{p.firstResponse}</span>
                  <span className={sx('font-variant-numeric:tabular-nums')}>{p.resolution}</span>
                  <span className={sx('color:var(--cs-muted)')}>{p.hours}</span>
                  <span className={sx('text-align:right')}>
                    {V.canManageDesk && <button onClick={V.editSlaPolicy} data-id={p.id} className={editBtn()}>edit</button>}
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
          <div className={sx('display:flex;flex-direction:column;gap:16px;max-width:680px')}>
            <div className={sx('display:flex;flex-direction:column;gap:4px')}>
              <h2 className={sx('font-size:20px;font-weight:500;letter-spacing:-.5px')}>business hours</h2>
              <p className={sx('font-size:13px;color:var(--cs-muted)')}>sla clocks rest when your team does.</p>
            </div>
            {V.hoursErr && <LoadNote>{V.hoursErr}</LoadNote>}

            {/* No calendar at all is a real state, not a loading one — the
                clocks then run around the clock. Say that rather than show an
                empty week with every switch greyed out and no explanation. */}
            {!V.hoursReady && !V.hoursErr && (
              <span className={sx('font-size:12.5px;color:var(--cs-muted);padding:12px 16px;border:0.5px dashed var(--cs-border);border-radius:var(--cs-r-md);line-height:1.55')}>
                this desk has no working calendar yet, so sla clocks run 24/7. one has to be created on
                the server before the days below can be switched on and off here.
              </span>
            )}

            {/* The tick is bound to what the server confirmed, not to a local
                guess: a failed write leaves the day exactly as it was and says
                so, instead of a tick that stays put over an unchanged schedule. */}
            <div className={sx('border:0.5px solid var(--cs-border);border-radius:var(--cs-r-md);background:var(--cs-surface);overflow:hidden')}>
              {V.hoursRows.map(d => (
                <div key={d.day} className={sx('display:grid;grid-template-columns:130px 1fr 1fr 70px;gap:12px;padding:11px 16px;border-bottom:1px solid var(--cs-border);align-items:center;font-size:13.5px')}>
                  <span>{d.day}</span>
                  <span className={sx('font-variant-numeric:tabular-nums;color:var(--cs-muted)')}>{d.open}</span>
                  <span className={sx('font-variant-numeric:tabular-nums;color:var(--cs-muted)')}>{d.close}</span>
                  <span className={sx('text-align:right')}>
                    <input
                      type="checkbox"
                      checked={d.on}
                      disabled={!V.canManageDesk || !V.hoursReady || V.hoursBusy}
                      onChange={V.toggleHoursDay}
                      data-day={d.key}
                      aria-label={'work on ' + d.day}
                      className={sx('width:15px;height:15px;accent-color:var(--cs-brand);cursor:pointer')}
                    />
                  </span>
                </div>
              ))}
            </div>
            <div className={sx('border:0.5px solid var(--cs-border);border-radius:var(--cs-r-md);background:var(--cs-surface);padding:var(--cs-cardpad);display:flex;flex-direction:column;gap:10px')}>
              <div className={sx('display:flex;flex-direction:column;gap:3px')}>
                <span className={sx('font-size:13.5px;font-weight:500')}>holidays</span>
                <span className={sx('font-size:12.5px;color:var(--cs-muted)')}>the clocks rest on these days too, so no target ever lands on one.</span>
              </div>
              <div className={sx('display:flex;gap:6px;flex-wrap:wrap;align-items:center')}>
                {V.holidays.map(h => (
                  <span key={h.date} className={sx('display:inline-flex;align-items:center;gap:6px;padding:4px 11px;border-radius:100px;background:var(--cs-soft);font-size:12.5px')}>
                    {h.label}
                    {V.canManageDesk && (
                      <button onClick={V.removeHoliday} data-date={h.date} disabled={V.hoursBusy} aria-label={'stop resting on ' + h.label} className={sx('border:none;background:transparent;color:var(--cs-muted);font-size:13px;line-height:1;cursor:pointer;padding:0')}>×</button>
                    )}
                  </span>
                ))}
                {!V.hasHolidays && (
                  <span className={sx('font-size:12.5px;color:var(--cs-muted)')}>none yet — every working day counts.</span>
                )}
              </div>
              {V.canManageDesk && (
                <div className={sx('display:flex;gap:8px;align-items:center;flex-wrap:wrap')}>
                  <input type="date" value={V.holidayDraft} onChange={V.onHolidayDraft} aria-label="holiday date" className={cn(fieldInput(), 'max-w-[200px]')} />
                  <button onClick={V.addHoliday} disabled={!V.hoursReady || V.hoursBusy} className={editBtn()}>add a holiday</button>
                </div>
              )}
            </div>
          </div>
        )}

        {V.tabCanned && (
          <div className={sx('display:flex;flex-direction:column;gap:16px')}>
            <div className={sx('display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap')}>
              <div className={sx('flex:1;min-width:200px;display:flex;flex-direction:column;gap:4px')}>
                <h2 className={sx('font-size:20px;font-weight:500;letter-spacing:-.5px')}>canned responses</h2>
                <p className={sx('font-size:13px;color:var(--cs-muted)')}>written once, kindly, so nobody has to find the words twice.</p>
              </div>
              {V.canManageCanned && <button onClick={V.newCanned} className={primaryBtn()}>new response</button>}
            </div>
            {V.cannedErr && <LoadNote>{V.cannedErr}</LoadNote>}
            <div className={sx('display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px')}>
              {V.cannedRows.map(r => (
                <div key={r.id} className={sx('border:0.5px solid var(--cs-border);border-radius:var(--cs-r-md);background:var(--cs-surface);padding:var(--cs-cardpad);display:flex;flex-direction:column;gap:8px')}>
                  <span className={sx('display:flex;align-items:center;gap:8px')}>
                    <span className={sx('flex:1;font-size:13.5px;font-weight:500')}>{r.title}</span>
                    <span className={sx('font-size:11.5px;color:var(--cs-muted)')}>{r.team}</span>
                  </span>
                  <p className={sx('font-size:12.5px;color:var(--cs-muted);line-height:1.55')}>{r.snippet}</p>
                  <span className={sx('display:flex;align-items:center;gap:8px')}>
                    <span className={sx('padding:2px 9px;border-radius:100px;background:var(--cs-soft);font-size:11.5px;color:var(--cs-muted)')}>{r.tagList}</span>
                    <span className={sx('flex:1')}></span>
                    {V.canManageCanned && <button onClick={V.editCanned} data-id={r.id} className={editBtn()}>edit</button>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {V.tabTags && (
          <div className={sx('display:flex;flex-direction:column;gap:16px;max-width:620px')}>
            <div className={sx('display:flex;flex-direction:column;gap:4px')}>
              <h2 className={sx('font-size:20px;font-weight:500;letter-spacing:-.5px')}>tags</h2>
              <p className={sx('font-size:13px;color:var(--cs-muted)')}>how conversations get sorted. a key is written onto every conversation that wears it, so it never changes.</p>
            </div>
            {V.tagsErr && <LoadNote>{V.tagsErr}</LoadNote>}
            <div className={sx('border:0.5px solid var(--cs-border);border-radius:var(--cs-r-md);background:var(--cs-surface);overflow:hidden')}>
              {V.tagRows.map(t => (
                <div key={t.id} className={sx('display:grid;grid-template-columns:1fr 90px 80px;gap:12px;padding:11px 16px;border-bottom:1px solid var(--cs-border);align-items:center;font-size:13.5px')}>
                  <span data-tone={t.tone} className={sx('display:inline-flex;align-items:center;gap:7px;padding:3px 11px;border-radius:100px;background:color-mix(in srgb, var(--tone-hue) 14%, var(--cs-surface));color:var(--tone-fg);width:fit-content')}><i className={sx('width:7px;height:7px;border-radius:50%;background:var(--tone-hue)')}></i>{t.label}</span>
                  <span className={sx('color:var(--cs-muted);font-variant-numeric:tabular-nums;font-size:12.5px')}>{t.count} conversations</span>
                  <span className={sx('text-align:right')}>
                    {V.canManageDesk && <button onClick={V.editTag} data-key={t.key} className={editBtn()}>edit</button>}
                  </span>
                </div>
              ))}
            </div>
            {V.canManageDesk && (
              <button onClick={V.newTag} className={sx('align-self:flex-start;padding:9px 16px;border:0.5px dashed var(--cs-border);border-radius:var(--plumo-radius-pill);background:transparent;color:var(--cs-muted);font-size:13px;cursor:pointer', { hover: 'color:var(--cs-brand);border-color:var(--cs-brand)' })}>+ new tag</button>
            )}
          </div>
        )}

        {V.tabHooks && (
          <div className={sx('display:flex;flex-direction:column;gap:16px')}>
            <div className={sx('display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap')}>
              <div className={sx('flex:1;min-width:200px;display:flex;flex-direction:column;gap:4px')}>
                <h2 className={sx('font-size:20px;font-weight:500;letter-spacing:-.5px')}>webhooks</h2>
                <p className={sx('font-size:13px;color:var(--cs-muted)')}>where plumo tells other systems what happened.</p>
              </div>
              {V.canManageDesk && <button onClick={V.newWebhook} className={primaryBtn()}>add endpoint</button>}
            </div>
            {V.hooksErr && <LoadNote>{V.hooksErr}</LoadNote>}
            <div className={sx('border:0.5px solid var(--cs-border);border-radius:var(--cs-r-md);background:var(--cs-surface);overflow:hidden')}>
              <div className={sx('display:grid;grid-template-columns:minmax(240px,1.6fr) minmax(180px,1fr) 110px 140px;gap:12px;padding:9px 16px;border-bottom:1px solid var(--cs-border);background:var(--cs-canvas);font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:var(--cs-muted)')}>
                <span>endpoint</span><span>events</span><span>status</span><span className={sx('text-align:right')}>last delivery</span>
              </div>
              {V.hookRows.map(w => (
                <div key={w.id} className={sx('display:grid;grid-template-columns:minmax(240px,1.6fr) minmax(180px,1fr) 110px 140px;gap:12px;padding:11px 16px;border-bottom:1px solid var(--cs-border);align-items:center;font-size:13px')}>
                  <span className={sx('font-family:var(--plumo-font-mono);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{w.url}</span>
                  <span className={sx('color:var(--cs-muted);font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{w.events}</span>
                  <span data-tone={w.tone} className={sx('display:inline-flex;align-items:center;gap:6px;padding:3px 9px;border-radius:100px;font-size:12px;background:color-mix(in srgb, var(--tone-hue) 14%, var(--cs-surface));color:var(--tone-fg);width:fit-content')}><i className={sx('width:6px;height:6px;border-radius:50%;background:var(--tone-hue)')}></i>{w.status}</span>
                  <span className={sx('text-align:right;color:var(--cs-muted);font-size:12.5px')}>{w.last}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {V.tabKeys && (
          <div className={sx('display:flex;flex-direction:column;gap:16px')}>
            <div className={sx('display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap')}>
              <div className={sx('flex:1;min-width:200px;display:flex;flex-direction:column;gap:4px')}>
                <h2 className={sx('font-size:20px;font-weight:500;letter-spacing:-.5px')}>api keys</h2>
                <p className={sx('font-size:13px;color:var(--cs-muted)')}>secrets, kept softly — a key is shown once and never again.</p>
              </div>
            </div>

            <div className={sx('border:0.5px solid var(--cs-border);border-radius:var(--cs-r-md);background:var(--cs-surface);padding:16px;display:flex;flex-direction:column;gap:12px')}>
              <span className={sx('font-size:13.5px;font-weight:500')}>new key</span>
              <div className={sx('display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end')}>
                <label className={sx('flex:1;min-width:200px;display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:var(--cs-muted)')}>
                  name
                  <input
                    value={V.keyName}
                    onChange={V.onKeyName}
                    placeholder="4hacks chatbot"
                    className={fieldInput()}
                  />
                </label>
                <button onClick={V.genKey} className={primaryBtn()}>generate key</button>
              </div>
              <div className={sx('display:flex;flex-direction:column;gap:7px')}>
                <span className={sx('font-size:12.5px;color:var(--cs-muted)')}>what is it for</span>
                <div className={sx('display:flex;gap:7px;flex-wrap:wrap')}>
                  {V.keyKinds.map((k) => (
                    <button
                      key={k.id}
                      onClick={V.setKeyKind}
                      data-v={k.id}
                      data-on={String(k.on)}
                      title={k.scopes.join(', ')}
                      className={sx('padding:7px 13px;border-radius:100px;font-size:12.5px;cursor:pointer')}
                      style={{ border: '1px solid var(--cs-onbd)', background: 'var(--cs-onbg)', color: 'var(--cs-onfg)', fontWeight: 'var(--cs-onw)' }}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>
                <span className={sx('font-size:12px;color:var(--cs-muted)')}>
                  {(V.keyKinds.find((k) => k.on) || {}).hint}
                </span>
              </div>
            </div>
            {V.hasSecret && (
              <div data-anim="in" data-tone="st-pending" className={sx('display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:var(--cs-r-md);background:color-mix(in srgb, var(--tone-hue) 12%, var(--cs-surface));border:1px solid color-mix(in srgb, var(--tone-hue) 30%, transparent);flex-wrap:wrap')}>
                <div className={sx('flex:1;min-width:220px;display:flex;flex-direction:column;gap:4px')}>
                  <span className={sx("font-size:12.5px;color:var(--tone-fg);font-weight:500")}>copy this now — we won't show it again</span>
                  <span className={sx('font-family:var(--plumo-font-mono);font-size:13px;color:var(--cs-text);word-break:break-all')}>{V.secret}</span>
                </div>
                <button onClick={V.copySecret} className={sx('padding:8px 14px;border:0.5px solid var(--cs-border);border-radius:var(--plumo-radius-pill);background:var(--cs-surface);color:var(--cs-text);font-size:12.5px;cursor:pointer')}>copy</button>
                <button onClick={V.hideKey} className={sx('padding:8px 14px;border:none;border-radius:var(--plumo-radius-pill);background:transparent;color:var(--cs-muted);font-size:12.5px;cursor:pointer')}>done</button>
              </div>
            )}
            <div className={sx('border:0.5px solid var(--cs-border);border-radius:var(--cs-r-md);background:var(--cs-surface);overflow:hidden')}>
              <div className={sx('display:grid;grid-template-columns:minmax(180px,1.4fr) 130px 130px 110px 90px;gap:12px;padding:9px 16px;border-bottom:1px solid var(--cs-border);background:var(--cs-canvas);font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:var(--cs-muted)')}>
                <span>name</span><span>scope</span><span>created</span><span className={sx('text-align:right')}>last used</span><span className={sx('text-align:right')}></span>
              </div>
              {V.keyRows.map(k => (
                <div key={k.id} className={sx('display:grid;grid-template-columns:minmax(180px,1.4fr) 130px 130px 110px 90px;gap:12px;padding:11px 16px;border-bottom:1px solid var(--cs-border);align-items:center;font-size:13.5px')}>
                  <span className={sx('display:flex;align-items:center;gap:7px')}>
                    {k.name}
                    {k.active === false && (
                      <span data-tone="st-closed" className={sx('font-size:11px;padding:1px 7px;border-radius:100px')}
                        style={{ background: 'color-mix(in srgb, var(--tone-hue) 16%, transparent)', color: 'var(--tone-fg)' }}>revoked</span>
                    )}
                  </span>
                  <span className={sx('color:var(--cs-muted)')}>{k.scope}</span>
                  <span className={sx('color:var(--cs-muted);font-size:12.5px')}>{k.created}</span>
                  <span className={sx('text-align:right;color:var(--cs-muted);font-size:12.5px')}>{k.last}</span>
                  <span className={sx('text-align:right')}>
                    {k.active !== false && (
                      <button onClick={V.revokeKey} data-id={k.id}
                        className={sx('padding:4px 10px;border:0.5px solid var(--cs-border);border-radius:100px;background:transparent;color:var(--cs-muted);font-size:12px;cursor:pointer')}>
                        revoke
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {V.tabEmail && (
          <div className={sx('display:flex;flex-direction:column;gap:16px;max-width:680px')}>
            <div className={sx('display:flex;flex-direction:column;gap:4px')}>
              <h2 className={sx('font-size:20px;font-weight:500;letter-spacing:-.5px')}>email &amp; channels</h2>
              <p className={sx("font-size:13px;color:var(--cs-muted)")}>where conversations come in.</p>
            </div>

            {/* The receiving address is the only setting on this screen with
                anything behind it. The reply-to name and the three "manage"
                buttons that used to sit under it had no endpoint at all — they
                showed a toast and changed nothing, so they are gone. */}
            {!V.canManageDesk ? (
              <span className={sx('font-size:12.5px;color:var(--cs-muted);padding:12px 16px;border:0.5px dashed var(--cs-border);border-radius:var(--cs-r-md)')}>
                the receiving address is an admin setting — ask one of yours.
              </span>
            ) : (
              <div className={sx('border:0.5px solid var(--cs-border);border-radius:var(--cs-r-md);background:var(--cs-surface);padding:20px;display:flex;flex-direction:column;gap:12px')}>
                <div className={sx('display:flex;flex-direction:column;gap:4px')}>
                  <span className={sx('font-size:14px;font-weight:500')}>inbound</span>
                  <span className={sx('font-size:12.5px;color:var(--cs-muted);line-height:1.5')}>
                    mail sent to this address becomes a conversation on this desk. leave it empty to stop
                    receiving mail — nothing already here is lost, new messages are simply refused.
                  </span>
                </div>

                {V.emailErr && <LoadNote>{V.emailErr}</LoadNote>}

                {V.inboundError && (
                  <div className="px-3 py-2.5 rounded-token-sm text-[13px] bg-[color:var(--danger-soft)] text-[color:var(--danger)]">
                    {V.inboundError}
                  </div>
                )}

                <div className={sx('display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end')}>
                  <label className={sx('flex:1;min-width:220px;display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:var(--cs-muted)')}>receiving address
                    <input
                      type="email"
                      value={V.inboundDraft}
                      onChange={V.onInboundDraft}
                      placeholder="help@yourcompany.com"
                      autoComplete="off"
                      className={fieldInput()}
                    />
                  </label>
                  <button onClick={V.saveInbound} disabled={V.inboundBusy} className={primaryBtn()}>
                    {V.inboundBusy ? 'saving…' : 'save'}
                  </button>
                </div>

                <span data-tone={V.inboundOn ? 'sla-met' : 'sla-paused'} className={sx('width:fit-content;padding:3px 9px;border-radius:100px;font-size:12px;background:color-mix(in srgb, var(--tone-hue) 14%, var(--cs-surface));color:var(--tone-fg)')}>
                  {V.inboundOn ? 'receiving mail' : 'inbound mail is off'}
                </span>
              </div>
            )}

            <span className={sx('font-size:12.5px;color:var(--cs-muted);line-height:1.55')}>
              the reply-to name, the in-app widget and the chatbot bridge have no setting behind them yet,
              so there is nothing here to change. keys for the public api live in the api keys panel.
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
              <Button variant="secondary" size="md" onClick={V.closeEditor}>not now</Button>
              <Button size="md" onClick={V.submitEditor} disabled={V.editorBusy}>
                {V.editorBusy ? 'saving…' : V.editorOk}
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

            {V.editorFields.map(f => (
              f.kind === 'select' ? (
                <Select key={f.name} label={f.label} value={f.value} data-f={f.name}
                  onChange={V.onEditorField} options={f.options} helperText={f.helper} />
              ) : f.kind === 'textarea' ? (
                <Textarea key={f.name} label={f.label} value={f.value} data-f={f.name}
                  onChange={V.onEditorField} placeholder={f.placeholder} helperText={f.helper} rows={6} />
              ) : f.kind === 'checks' ? (
                <fieldset key={f.name} className="flex flex-col gap-1.5">
                  <legend className="text-xs font-medium text-fg mb-1">{f.label}</legend>
                  {f.options.map(o => (
                    <label key={o.value} className="flex items-center gap-2 text-[13px] text-fg-2">
                      <input type="checkbox" data-f={f.name} value={o.value} checked={o.on}
                        onChange={V.onEditorField}
                        className={sx('width:14px;height:14px;accent-color:var(--cs-brand);cursor:pointer')} />
                      {o.label}
                    </label>
                  ))}
                </fieldset>
              ) : (
                <Input key={f.name} label={f.label} value={f.value} data-f={f.name}
                  onChange={V.onEditorField} placeholder={f.placeholder} helperText={f.helper}
                  autoComplete="off" />
              )
            ))}
          </div>
        </Modal>
      </div>
    </div>
  );
}
