'use client';

import React from 'react';
import {
  AvatarGroup,
  Badge,
  Button,
  EmptyState,
  Input,
  Kbd,
  Progress,
  Segment,
  Select,
  Skeleton,
  StatCard,
  Textarea,
  TonePill,
  UserAvatar,
} from '../common';
import { PlumoLogo, PlumoMark, PlumoAnimatedIcon, BlobHappy, BlobSleepy, BlobFocused, BlobCelebrating, BlobLost } from '../brand';

/**
 * The shared design system, as the support console consumes it. Every element
 * below is the same component the project-management console renders — only the
 * brand anchor differs, so `--primary` resolves to support green here.
 */
const PANEL = 'rounded-token bg-surface border border-[color:var(--border)] shadow-card p-4 flex flex-col gap-3';
const LABEL = 'text-[11px] font-medium uppercase tracking-[2px] text-[color:var(--primary)]';
const NOTE = 'text-[12.5px] text-fg-3 leading-relaxed';
const ROW = 'flex gap-2 items-center flex-wrap';

function Section({ label, note, children }) {
  return (
    <div className={PANEL}>
      <span className={LABEL}>{label}</span>
      {note && <span className={NOTE}>{note}</span>}
      {children}
    </div>
  );
}

export default function Kit({ V }) {
  // the shared Select is always controlled (it renders `value ?? ''`), so the
  // showcase holds its own state rather than warning about a read-only field
  const [team, setTeam] = React.useState('t1');
  const [density, setDensity] = React.useState('balanced');
  const people = [
    { id: 1, name: 'Mira Solberg' },
    { id: 2, name: 'Tomas Ek' },
    { id: 3, name: 'Aya Nakamura' },
    { id: 4, name: 'Jules Okafor' },
    { id: 5, name: 'Priya Raman' },
  ];

  return (
    <div data-scroll className="flex-1 min-h-0 overflow-y-auto px-6 py-[22px] flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-[22px] font-medium tracking-[-.6px]">ui kit</h2>
        <p className="text-[13px] text-fg-3 max-w-[62ch]">
          the shared plumo design system. these are the same components the project-management console uses —
          the only difference is the brand anchor, so every accent resolves to support green.
        </p>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))' }}>
        <Section
          label="brand"
          note="the shared brand components. their colour defaults to var(--primary), so they render green here and blue in the project-management console — one component, both pillars."
        >
          <div className={ROW}><PlumoLogo height={34} /></div>
          <div className={ROW}>
            <PlumoMark height={30} />
            <PlumoAnimatedIcon size={30} />
            <BlobHappy size={30} />
            <BlobSleepy size={30} />
            <BlobFocused size={30} />
            <BlobCelebrating size={30} />
            <BlobLost size={30} />
          </div>
        </Section>

        <Section label="button" note="nine variants, four sizes. loading swaps the label for a spinner.">
          <div className={ROW}>
            <Button size="sm">primary</Button>
            <Button variant="secondary" size="sm">secondary</Button>
            <Button variant="outline" size="sm">outline</Button>
            <Button variant="ghost" size="sm">ghost</Button>
          </div>
          <div className={ROW}>
            <Button variant="success" size="sm">success</Button>
            <Button variant="warning" size="sm">warning</Button>
            <Button variant="danger" size="sm">danger</Button>
            <Button variant="link" size="sm">link</Button>
          </div>
          <div className={ROW}>
            <Button size="sm" loading>saving</Button>
            <Button size="md">medium</Button>
            <Button size="lg">large</Button>
            <Button size="sm" disabled>disabled</Button>
          </div>
        </Section>

        <Section label="badge" note="the tones both pillars share.">
          <div className={ROW}>
            <Badge>default</Badge>
            <Badge variant="primary">primary</Badge>
            <Badge variant="success">success</Badge>
            <Badge variant="warning">warning</Badge>
            <Badge variant="danger">danger</Badge>
            <Badge variant="outline">outline</Badge>
            <Badge variant="primary" dot>with dot</Badge>
          </div>
        </Section>

        <Section
          label="tone pill"
          note="support's own semantics — status, priority, sla and tags. colour comes from [data-tone], so the palette lives in one place."
        >
          <div className={ROW}>
            {[
              ['st-new', 'new'], ['st-open', 'open'], ['st-pending', 'pending'],
              ['st-hold', 'on hold'], ['st-resolved', 'resolved'], ['st-closed', 'closed'],
            ].map(([tone, label]) => (
              <TonePill key={tone} tone={tone} dot size="md">{label}</TonePill>
            ))}
          </div>
          <div className={ROW}>
            {[['pr-low', '· low'], ['pr-normal', '· normal'], ['pr-high', '↑ high'], ['pr-urgent', '⚑ urgent']].map(
              ([tone, label]) => <TonePill key={tone} tone={tone} size="md">{label}</TonePill>,
            )}
          </div>
          <div className={ROW}>
            {[['sla-ok', 'on track'], ['sla-due', 'due soon'], ['sla-breach', 'overdue'], ['sla-met', 'met'], ['sla-paused', 'paused']].map(
              ([tone, label]) => <TonePill key={tone} tone={tone} size="md">{label}</TonePill>,
            )}
          </div>
          <div className={ROW}>
            {(V.tagRows ?? []).map((t) => (
              <TonePill key={t.id} tone={t.tone}>{t.label}</TonePill>
            ))}
          </div>
        </Section>

        <Section label="form" note="label, icon slots, error and helper text all come from the component.">
          <Input label="work email" placeholder="you@work.com" required />
          <Input label="with an error" defaultValue="not-an-email" error="that doesn't look like an address" />
          <Select
            label="team"
            value={team}
            onChange={(e) => setTeam(e.target.value)}
            options={[
              { value: 't1', label: 'Tier 1' },
              { value: 't2', label: 'Billing' },
            ]}
          />
          <Textarea label="a note" placeholder="in their words…" rows={3} />
        </Section>

        <Section label="avatar" note="initials, presence dot, and an overflow stack.">
          <div className={ROW}>
            <UserAvatar firstName="Mira" lastName="Solberg" size="xs" />
            <UserAvatar firstName="Mira" lastName="Solberg" size="sm" />
            <UserAvatar firstName="Mira" lastName="Solberg" size="md" />
            <UserAvatar firstName="Mira" lastName="Solberg" size="lg" />
            <UserAvatar firstName="Mira" lastName="Solberg" size="xl" />
          </div>
          <div className={ROW}>
            <AvatarGroup users={people} max={4} size={24} />
          </div>
        </Section>

        <Section label="stat card" note="the KPI tile behind the reports screen.">
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))' }}>
            <StatCard label="people waiting" value="20" delta="open right now" />
            <StatCard label="first response" value="18h 04m" delta="median · 7 days" />
          </div>
        </Section>

        <Section label="progress · segment · kbd">
          <Progress value={68} />
          <Segment
            value={density}
            onChange={setDensity}
            options={[
              { value: 'dense', label: 'dense' },
              { value: 'balanced', label: 'balanced' },
              { value: 'soft', label: 'soft' },
            ]}
          />
          <div className={ROW}>
            <span className="text-[13px] text-fg-2 flex items-center gap-2">
              <Kbd>j</Kbd><Kbd>k</Kbd> move · <Kbd>enter</Kbd> open · <Kbd>?</Kbd> shortcuts
            </span>
          </div>
        </Section>

        <Section label="skeleton" note="shimmer placeholders while a list loads.">
          <Skeleton className="h-4 w-[70%]" />
          <Skeleton className="h-4 w-[85%]" />
          <Skeleton className="h-4 w-[55%]" />
        </Section>

        <Section label="overlays" note="the same modal chrome every dialog uses.">
          <div className={ROW}>
            <Button size="sm" onClick={V.openNewTicket}>open a modal</Button>
            <Button variant="secondary" size="sm" onClick={V.openSheet}>shortcut sheet</Button>
            <Button variant="danger" size="sm" onClick={V.askMock}>confirm dialog</Button>
          </div>
        </Section>
      </div>

      <div className={PANEL}>
        <span className={LABEL}>empty state</span>
        <EmptyState
          icon={
            <img
              src="/assets/mascots/mascot-01-listening.svg"
              alt=""
              className="w-[84px] h-auto block"
              style={{ animation: 'cs-breathe 5.5s ease-in-out infinite' }}
            />
          }
          title="nothing here yet ✿"
          description="empty states carry a mascot in the support console — the same component, a friendlier illustration."
          action={{ label: 'do the thing', onClick: V.openNewTicket }}
        />
      </div>
    </div>
  );
}
