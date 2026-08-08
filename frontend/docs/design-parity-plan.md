# Plumo CS → Plumo PM design parity — work queue

**Standard.** Plumo PM is correct by definition. Where CS differs, CS is wrong, unless the
difference is (a) the colour palette or (b) the logo. Goal: someone moving between the two
products cannot feel a seam.

**Source of truth:** `C:/Users/firas/OneDrive/Documents/dbwork/frontend` (PM)
**Target:** `C:/Users/firas/OneDrive/Documents/plumocs/frontend` (CS)

Execute one numbered item at a time and push. Items are ordered so earlier ones shrink later
ones — a token fix repairs twelve components, a primitive fix repairs twelve screens.

---

## 1. VERDICT

**The foundations are done; the port stopped before the CSS layer and never started on the
shell.** Thirty-three of thirty-five files in `components/common/` are byte-identical to PM's
(verified by diff, modulo CRLF), and the token layer matches exactly: `--radius: 6px`,
`--density: 1`, all four `--dur-*`, all three `--ease-*`, all three light-mode `--shadow-*`
byte-for-byte, all seven `zIndex` layers, all three custom `fontSize` entries, `.focus-ring`,
and the nine density height utilities. `Button.tsx` is identical apart from an additive
`export { buttonVariants }`. That is real, and it is most of the hard work.

What is missing is everything *between* the tokens and the screens. CS's `app/globals.css`
(309 lines) never received PM's `globals.css:185-536` — the global border-colour rule, the
motion utilities, the universal button transition and press, the form-control transition, the
scrollbar suite. The consequence is not cosmetic: **CS ships components that reference CSS
classes CS does not define.** `Modal.tsx:124` applies `animate-modal-in` and
`Dropdown.tsx:64` applies `animate-dropdown`; neither exists in CS's stylesheet, so every CS
modal and dropdown appears with no entry animation. Fifteen CSS custom properties are
referenced by ported components and defined nowhere in CS (`--epic*` ×3, `--status-*` ×8,
`--plumo-blob-stroke`, `--plumo-on-surface`, plus two invented names in `Login.jsx`), so
`Badge variant="epic"`, `StatusPill`, `PriorityBars` and two registry icons render broken
*right now*.

Above that sits the second problem: **CS's eleven screens bypass the primitives they ship.**
`Dropdown` is imported zero times; `size="icon"` is used zero times against PM's eight;
`ghost` zero times against PM's forty; there are eight hand-rolled button geometries, five
checkbox definitions, three inline menu systems and a hand-rolled toast. CS also carries a
second, older token namespace (`--plumo-*` / `--cs-*`, ~105 variables PM does not have) that
`components/screens/*` still runs on — two radius systems, two elevation systems, two motion
systems, two density systems, side by side.

**Size of the job:** roughly 40 items. The first batch is six edits to two files and buys
back more visible parity than anything else on the list. Batches 1–3 are about a day. Batches
4–7 are the bulk. Batch 9 (copy voice) is a decision, not an engineering problem.

---

## 2. WHAT ALREADY MATCHES — do not re-check

Verified this pass, not inherited from the audits:

- **`components/common/*`** — `diff --strip-trailing-cr` returns identical for `Modal`,
  `Dropdown`, `Input`, `Textarea`, `Select`, `Badge`, `EmptyState`, `Skeleton`, `ErrorScreen`,
  `StatusPill`, `Breadcrumb`, `LoadingSpinner`, `ConfirmDeleteModal`, `Icon`, `Segment`, and
  by the earlier passes: `UserAvatar`, `AvatarGroup`, `Progress`, `StatCard`, `Kbd`,
  `Pagination`, `FilterBar`, `SortIcon`, `Sparkline`, `MiniActivityChart`, `ErrorBoundary`,
  `PriorityBars`, `SettingsFormSkeleton`, `AdminListPageSkeleton`, `icons/registry.generated.ts`.
  `Button.tsx` differs only by `export { buttonVariants }` at CS `components/common/Button.tsx:88-91`.
- **Tailwind config**, PM `tailwind.config.ts:105-131` ≡ CS `tailwind.config.ts:29-56`:
  `fontFamily.sans/mono`, `borderRadius.token/-sm/-lg` (3/6/9px), all seven `zIndex`,
  `fontSize.2xs/3xs/badge`, `boxShadow.card/-hover/-modal`. The 13 semantic colour aliases
  (PM `:15-27` / CS `:14-27`) are name-for-name identical.
- **Tokens**, PM `globals.css:14-102` ≡ CS `globals.css:152-186`: `--radius`, `--density`,
  `--dur-instant/-fast/--dur/-slow` (100/150/200/300ms), `--ease-out/-in/-spring`, the three
  light `--shadow-*` (byte-identical strings), `--success/--warning/--danger` + light softs.
- **Density utilities**, PM `globals.css:232-273` ≡ CS `globals.css:212-224`: `.focus-ring`,
  `.h-btn-sm/-md/-lg` (28/32/40), `.h-input` (32), `.h-row` (44), `.h-row-header` (40),
  `.h-topbar` (44), `.h-navitem` (28), `.h-segment` (28), `.min-h-textarea` (72). Density
  multipliers 0.85 / 1.15 are identical on both sides.
- **`.shimmer`** — identical. **Zero `dark:` Tailwind variants** in either tree (both are
  pure token-flip). **`plugins: []`** in both.
- **Sidebar width transition string** — identical: `transition-[width] duration-[var(--dur)]
  ease-[cubic-bezier(0.2,0,0,1)]`, PM `Sidebar/Sidebar.tsx:432` / CS `Sidebar.jsx:43`.
- **Shell topology** — both are a full-width top bar over a `flex` row of sidebar + `<main>`.
- **Icon library** — same 65 icons, same names, same default `size = 20`, same 18px nav glyph
  size.
- **Tooltips** — neither app has a tooltip primitive; both use native `title=`. Nothing to port.
- **`TonePill.tsx`** — CS-only extension that borrows Badge's geometry (`h-[18px] px-1.5
  text-[11px]`). **CORRECT-BY-DESIGN.**

---

## 3. CORRECTIONS TO THE FOUR AUDITS

Read this before trusting a downstream item. Where the passes disagreed or were wrong, this
is the verified answer.

| Claim | Verdict |
|---|---|
| *Overlays pass:* "CS toast tones `ok`/`bad` are undefined, so success and error toasts are visually indistinguishable." | **WRONG.** `Console.jsx:1947` maps `ok → 'sla-met'` and `bad → 'sla-breach'` before the tone reaches `Overlays.jsx:17`. Both are defined at `globals.css:260` / `:259`, so the dot *is* colour-coded (leaf `#B8CFB4` vs peach `#E8A97E`). The other toast defects in item 22 all stand. |
| *Foundations pass:* "`Skeleton.tsx:34` carries a hand-patched `style={{borderColor}}` — someone hit the missing global border rule and worked around it locally." | **WRONG.** `Skeleton.tsx` is byte-identical to PM's; that inline style came from PM. Not evidence of a CS workaround. The missing global rule (item 1) is still real. |
| *Controls pass:* "CS uses `variant="outline"` exactly once." | **Count wrong** — 7 uses. The finding survives: CS `secondary` 25 / `outline` 7; PM `outline` 111 / `secondary` 45. The inversion is real. |
| *Controls pass:* PM's canonical checkbox is `design-system/page.tsx:384-388`. | **Wrong file.** That demo uses a bare `accent-[color:var(--primary)]` with no sizing. The specified recipe is `login/page.tsx:245` and `signup/page.tsx:324` — `h-3.5 w-3.5 rounded-token-sm border accent-[color:var(--primary)]` + `style={{ borderColor: 'var(--border-strong)' }}`. **PM is internally inconsistent here** → see Open Question A. |
| *Shell pass:* 22 occurrences of `✿`; PM `strokeWidth={2}` 297×. | **Counts slightly off** — 20 and 288. Findings stand. |
| *Foundations pass:* PM body text is 16px browser default, CS 13.5px. | **Confirmed**, with a nuance: PM's `<body className="font-sans">` (`layout.tsx:120-121`) beats the `font-family` in `globals.css:198-200`, so both apps render Inter. Only the inherited *size* differs. |

**New finding, missed by all four passes:** CS `components/screens/Ticket.jsx:3` imports
`Card` from `../common`. There is no `Card.tsx` and `components/common/index.ts` does not
export one — the binding is `undefined`. It is never rendered, so nothing crashes today, but
it will fail `tsc` and any lint pass. Fold into item 45.

---

## 4. THE WORK QUEUE

---

### BATCH 1 — Repair the broken port
*Two files: `app/globals.css`, `tailwind.config.ts`. Purely additive. No component or screen
touched. This batch fixes visible defects that are shipping now, and it is a prerequisite for
almost everything below. Push each item separately; they are independent.*

---

#### 1. Add the global border-colour rule — **S**

**CS** `app/globals.css` — no equivalent. **PM** `src/app/globals.css:185-188`.

```css
@layer base {
  * { @apply border-[color:var(--border)]; }
}
```

**Before:** Tailwind preflight's `border-color: #e5e7eb` stands wherever a bare `border` /
`border-b` class is used.
**After:** those hairlines resolve to `var(--border)` — `#E2E8F0` light, `#26402E` dark.

**Blast radius:** 9 live sites — `components/common/AdminListPageSkeleton.tsx:18,68,84,88`,
`ErrorScreen.tsx:53`, `FileUpload.tsx:134,159,264`, `SettingsFormSkeleton.tsx:21`. Also
unblocks every future file ported from PM, which assumes this rule exists.

**Risk:** low. The one thing to watch is any element that *wanted* Tailwind's grey — grep for
`border-gray`/`border-slate` first (currently zero hits).
**Check:** flip to dark (after item 12) and confirm the skeleton hairlines are dark green, not
near-white.

---

#### 2. Define the 15 missing CSS variables — **S**

**CS** `app/globals.css:130-208` (add to `:root` and to `[data-cs-theme="dark"]`).
**PM** `src/app/globals.css:51-53, 69-76, 82, 89` (light) and `:136-138, 153-163` (dark).

| Variable | PM light | PM dark | Referenced in CS at |
|---|---|---|---|
| `--epic` | `#7c3aed` | `#a78bfa` | `components/common/Badge.tsx:22` |
| `--epic-soft` | `#f3e8ff` | `rgb(167 139 250 / 0.28)` | same |
| `--epic-soft-border` | `#ddd6fe` | `rgb(167 139 250 / 0.45)` | same |
| `--status-ring-muted` | `#cbd5e1` | `#475569` | `StatusPill.tsx` (11 refs total across the 8) |
| `--status-ring-neutral` | `#94a3b8` | `#94a3b8` | " |
| `--status-progress-track` | `#dbeafe` | `rgb(96 165 250 / 0.3)` | " |
| `--status-progress-arc` | `var(--plumo-blue)` | `var(--plumo-sky)` | " |
| `--status-review` | `#7a5f1f` | `var(--plumo-butter)` | " |
| `--status-blocked` | `#fb923c` | `var(--plumo-peach)` | " |
| `--status-done-fill` | `var(--plumo-blue)` | `var(--plumo-sky)` | " |
| `--status-done-check` | `#ffffff` | `var(--plumo-night)` | " |
| `--plumo-blob-stroke` | `var(--plumo-night)` | `#ffffff` | `PriorityBars.tsx:114,141` (2 refs) |
| `--plumo-on-surface` | `var(--plumo-night)` | `#ffffff` | `icons/registry.generated.ts:113-114` (7 refs) |
| `--r-sm` | *(does not exist)* | — | `screens/Login.jsx:183` — **typo for `--radius`; fix the call site, do not define the var** |
| `--wash-lilac` | *(does not exist)* | — | `screens/Login.jsx:16,19` — defined inline at `Login.jsx:10` as `#A78BFA`, i.e. PM's dark `--epic`. Once `--epic` exists, point it there and delete the local override |

**Before:** `var(--status-done-fill)` resolves to nothing → the glyph strokes/fills `none`.
`<Badge variant="epic">` renders transparent with inherited text. Two registry icons lose
their strokes.
**After:** all render.

**Blast radius:** 23 references across 5 files. `StatusPill` is imported 0× today, so 8 of the
tokens are latent — define them anyway; the file is shipped and the next port will use it.

**Risk:** none — pure addition. **Check:** render `<Badge variant="epic">Epic</Badge>` and
`<StatusPill status="done" />` in a scratch route.

**Note:** `--status-progress-arc` and `--status-done-fill` bind to `var(--plumo-blue)` in PM.
CS already defines `--plumo-blue: #2563EB` at `globals.css:15`, so copying PM verbatim gives
you blue status glyphs in the green product. **Re-anchor these two to `var(--primary)`** —
that is a palette substitution, which is in scope.

---

#### 3. Port PM's motion layer — **M**

**CS** `app/globals.css` — none of this exists. **PM** `src/app/globals.css:317-524`.

Copy verbatim: keyframes `fade-up`, `scale-in`, `fade-in`, `route-slide`, `dropdown-in`,
`modal-in`, `modal-out`, `fade-out`, `card-out`; utilities `.animate-fade-up`,
`.animate-scale-in`, `.animate-fade-in`, `.animate-route`, `.animate-dropdown`,
`.animate-modal-in`, `.animate-modal-out`, `.animate-fade-out`, `.card-exit`, `.stagger > *`
(8-step, 30ms); the universal transition block (`:485-494`), the universal press
(`:497-500`), the form-control transition (`:503-509`), and `.interactive` (`:512-524`).

**Concrete before/after:**

| | CS now | After |
|---|---|---|
| `.animate-modal-in` | **undefined** — CS modals pop in with zero entry animation while the backdrop fades | `modal-in 300ms cubic-bezier(0.2,0,0,1)` from `scale(.94) translateY(10px)` |
| `.animate-dropdown` | **undefined** | `dropdown-in 150ms ease-out`, `transform-origin: top`, from `scale(.97) translateY(-4px)` |
| `.animate-fade-in` | Tailwind's `fadeIn 0.2s ease-in-out`, no `both` | overridden to `fade-in var(--dur) var(--ease-out) both` |
| button press | none | every `button:active` → `scale(0.98)` |
| button state change | whatever the class string says (`transition-colors` 100ms in most CS screens) | `color, background-color, border-color, box-shadow, transform, opacity, filter` @ `--dur-instant` `--ease-out` on `button:not([disabled]), a, [role=button], summary, label[for]` |
| input focus | ring snaps on | `box-shadow, border-color, background-color` @ `--dur-fast` |

**Blast radius:** every interactive element in the app. Immediately revives `animate-modal-in`
at `components/common/Modal.tsx:124` and `animate-dropdown` at
`components/common/Dropdown.tsx:64`. Note `.animate-fade-in` is currently applied 9× in CS
screens; after this item those all change timing function.

**Risk:** medium — this is the largest single behaviour change in the plan. The universal
`button:active { transform: scale(0.98) }` will now apply to CS's ~40 hand-rolled buttons,
including ones inside grid cells. Watch for any button whose parent has `overflow: hidden`
and a tight fit.
**Check:** open a modal, open the sort menu in `Queue.jsx`, click any button. All three should
now move. Then set OS "reduce motion" and confirm everything stills.

**Interaction with item 24:** after this lands, CS's `[data-anim="in"]` (400ms overshoot,
`globals.css:304`) is running *alongside* PM's motion on the same elements. Item 24 removes it.
Between item 3 and item 24 the popovers will animate twice. If you dislike that in review,
do 3 and 24 in one push.

---

#### 4. Restore the missing Tailwind animations and keyframes — **S**

**CS** `tailwind.config.ts:57-67`. **PM** `tailwind.config.ts:132-151`.

**Before:** `animation: { 'fade-in', 'slide-up' }`, `keyframes: { fadeIn, slideUp }`.
**After:** add `'slide-in': 'slideIn 0.3s ease-out'` and `'spin-slow': 'spin 1.5s linear
infinite'`, and keyframe `slideIn: { '0%': { transform: 'translateX(-100%)' }, '100%':
{ transform: 'translateX(0)' } }`.

**Blast radius:** 0 today (nothing in CS uses them), but `animate-slide-in-right` is required
by the drawer in item 25 and PM's mobile sidebar in item 42.
**Risk:** none. **Check:** `npx tailwindcss --content …` or just confirm the class appears in
the built CSS.

---

#### 5. Restore PM's colour scales in the Tailwind config — **S**

**CS** `tailwind.config.ts:13-28`. **PM** `tailwind.config.ts:30-102`.

**Before:** `primary: { DEFAULT: 'var(--primary)' }` only.
**After:** add the numbered ramps PM defines — `primary.50–900` + `primary.dark`,
`secondary.50–900`, `success.50–900`, `warning.50–900`, `danger.50–900`, `dark.50–900`,
**re-tinted to CS green for the `primary` ramp** (see §5 for the mapping; `secondary`,
`success`, `warning`, `danger`, `dark` copy verbatim).

**Blast radius:** 0 today. PM uses these class names 273× across `src/**/*.tsx`. Any file you
port from PM later (e.g. `ChatToast.tsx`, `users/page.tsx`) emits `bg-success-400`,
`bg-primary-50` etc.; Tailwind CS cannot resolve them and the element renders **unstyled**,
not wrong-coloured — which is much harder to catch in review. This item is insurance for
batches 4–7.

**Risk:** none. **Check:** `grep -rE 'bg-(primary|success|danger|warning|dark)-[0-9]'
components/` returns nothing today; after any future port it should resolve.

---

#### 6. Widen the content glob — **S**

**CS** `tailwind.config.ts:9`: `['./components/**/*.{js,jsx,ts,tsx}', './app/**/*.{js,jsx,ts,tsx}']`
**PM** `tailwind.config.ts:4-8` covers `src/pages`, `src/components`, `src/app`.

**After:** add `'./lib/**/*.{js,jsx,ts,tsx}'` and `'./hooks/**/*.{js,jsx,ts,tsx}'`.
**Blast radius:** none today (`lib/utils.ts` holds only `cn()`), but a class string added to
either directory would silently purge.
**Risk:** none.

---

### BATCH 2 — Base element parity
*Still `globals.css` only. These are the rules that decide how untouched HTML looks.*

---

#### 7. Fix the base heading and link rules — **S**

**CS** `app/globals.css:110-114` and `:297` and `:296`.
**PM** `src/app/globals.css:207-218`.

| | CS now | PM / after |
|---|---|---|
| heading weight | `500` (`:111`) | `font-semibold` = **600** |
| heading tracking | `-0.3px` (`:112`) | none |
| heading colour | `var(--cs-brand-ink)` = `#1F4A2E` forest green (`:297`) | `text-fg` = `var(--text)` |
| heading coverage | `h1,h2,h3,h4` | `h1`–`h6` |
| link colour | `var(--cs-brand)` (`:296`) | `var(--primary)` |
| link hover | `opacity: .8` | `color: var(--primary-hover)`, `transition-colors` |

**Why it matters:** CS headings are currently *brand-tinted*, PM's are foreground. That is a
systemic tonal difference on every page title, card title and modal title — and it is not a
palette difference, it is a different rule. Separately, `a` binding `--cs-brand` while
everything else binds `--primary` means in dark mode CS links (`≈#A6CFB6`) and CS buttons
(`≈#7CB894`) are **two different greens**.

**Blast radius:** every `h1`–`h4` and every `<a>` in the app. Note `Login.jsx:161,284,320`
already overrides to `font-semibold` + `text-fg`, so login is unaffected; the in-app page
titles (item 33) change appearance immediately.
**Risk:** medium-visible, low-technical. **Check:** `Reports.jsx:30` title should go from
forest green 500 to near-black 600.

---

#### 8. Port the scrollbar suite — **M**

**CS** `app/globals.css:299` — `[data-scroll]{scrollbar-width:thin;scrollbar-color:var(--cs-border) transparent}`, opt-in, no webkit rules.
**PM** `src/app/globals.css:549-556, 562-600`.

**Before:** Chrome and Edge — the majority of the userbase — show default OS scrollbars in CS.
**After:** `*` thin, `scrollbar-color: var(--border) transparent`, `--border-strong` on hover
and focus-within; `::-webkit-scrollbar` 10px, thumb `border-radius: 999px` with a `3px solid
transparent` inset and `background-clip: padding-box`, `transition: background-color 0.15s
ease`, thumb-hover → `var(--text-3)`, transparent track and corner. Also bring `.scrollbar-hidden`.

**Blast radius:** every scroll container. CS's 8 `data-scroll` attributes become redundant but
harmless — leave them.
**Risk:** low. **Check:** the Queue list and the Ticket rail in Chrome.

---

#### 9. Hide the native password reveal control — **S**

**CS** — absent. **PM** `src/app/globals.css:225-228`:
`input::-ms-reveal, input::-ms-clear { display: none; }`

**Before:** Edge draws its own eye icon next to CS's own toggle at `screens/Login.jsx:238-250`.
**After:** one toggle.
**Blast radius:** 1 (the login password field). **Risk:** none. **Check:** Edge, login screen.

---

#### 10. Decide the scroll ownership model — **M**

**CS** `app/globals.css:290` — `html, body { height: 100% }` only; document-level scrolling.
**PM** `src/app/globals.css:191-194, 203-204` — `html { overflow: hidden; height: 100% }` and
`body { height: 100%; overflow: hidden }`; all scrolling is delegated to the dashboard shell.

CS already builds a full-height shell at `Console.jsx:1967` (`height:100vh;overflow:hidden`)
and scrolls inside each screen (`data-scroll` + `overflow-y-auto`), so adopting PM's rule
should be a no-op for the in-app views — but it will change `Login.jsx`, which is a tall
centred page.

**Blast radius:** the whole app. **Effort M** because it needs testing, not because the edit
is big.
**Risk:** medium — this is the one item in Batches 1–2 that can break layout.
**Check:** login at 800px viewport height (must still scroll or fit), Queue with 200 rows,
Ticket with a long thread, Settings.

---

#### 11. Align the reduced-motion block — **S**

**CS** `app/globals.css:117-123` — `0.001ms`, no `scroll-behavior`.
**PM** `src/app/globals.css:527-536` — `0.01ms` and `scroll-behavior: auto !important`.

Trivial; do it while you're in the file. **Blast radius:** reduced-motion users only.

---

### BATCH 3 — Theme and density plumbing
*Without this, CS dark mode is unreachable by users and half the audit findings cannot be
verified.*

---

#### 12. Add a ThemeProvider — **M**

**CS** — `contexts/` contains only `WebSocketContext.tsx`. `app/layout.jsx:10` hardcodes
`data-cs-theme="light"`. **PM** `src/contexts/ThemeContext.tsx` (103 lines), mounted at
`src/app/layout.tsx:122`.

PM's contract: localStorage key `theme`, `prefers-color-scheme` bootstrap (`:40-41`), class
swap on `<html>` (`:54-67`), cycle light → dark → terminal (`:83-85`), plus a `density`
control persisting to `localStorage['plumo_density']` (`:71-80`).

**Before:** `Header.jsx:135` and `Sidebar.jsx:115` both render a "switch light or dark theme"
button. `Console.jsx` has a `toggleTheme`; the attribute is set on `<html>` by hardcode in the
layout, so a fresh load is always light and there is no persistence and no system-preference
respect.
**After:** theme is user-selectable, persisted, and system-aware, same as PM.

**Two sub-decisions, both Open Questions:** whether to unify on PM's `.dark` class or keep
CS's `[data-cs-theme]` attribute (Open Question B), and whether CS gets PM's third `terminal`
theme (Open Question C).

**Blast radius:** `app/layout.jsx`, one new `contexts/ThemeContext.tsx`, the two toggle call
sites, and `tailwind.config.ts:10` if the selector changes.
**Risk:** medium — a theme provider that reads localStorage in a Server Component tree needs
the `beforeInteractive` inline-script pattern PM uses, or you get a flash of light.
**Check:** hard reload in dark, no flash; toggle persists across reload.

---

#### 13. Unify the density attribute — **S**

**CS** `app/globals.css:228-229` — `[data-cs-soft="dense"|"soft"]` → 0.85 / 1.15; default
`balanced` set at `app/layout.jsx:10` matches no rule and falls through to `:root`.
**PM** `src/app/globals.css:106-111` — `:root[data-density='compact'|'relaxed']` → 0.85 / 1.15;
default `comfortable` = attribute removed.

Same multipliers, different attribute name and different vocabulary. Rename CS's to PM's
(`data-density` / `compact` · `comfortable` · `relaxed`).

**Also in this item:** CS's switch re-scales a *second* set at `globals.css:238-241` —
`--cs-fs` (13.5 → 13/14px), `--cs-r-sm`, `--cs-r-md`, `--cs-gap`, `--cs-cardpad`,
`--cs-rowpy` (10 → 4/17px), `--cs-qcols`. PM's does not touch type size or radius, only
vertical rhythm. At `soft`, CS stretches buttons ×1.15, type ×1.04 and row padding ×1.7 —
three different factors on the same screen. Drop the type-size and radius re-scaling; keep
`--cs-rowpy` only until item 39 replaces it with `h-row`.

**Blast radius:** `app/layout.jsx:10`, `globals.css:228-229,238-241,242,246`, and the
`Console.jsx` density control.
**Risk:** low. **Check:** cycle all three densities on the Queue and confirm buttons, rows and
nav items scale together.

---

### BATCH 4 — Route the controls through the primitives
*Each item here fixes many screens at once because it deletes a local re-implementation.*

---

#### 14. Replace eight hand-rolled icon-button geometries with `size="icon"` — **L**

**CS** — eight distinct shapes. **PM** `src/components/common/Button.tsx:27` — one:
`size: { icon: 'h-btn-md w-8' }` → **32×32, density-scaled, `rounded-full`, `focus-ring`,
`active:scale-[0.97]`**. Used 8× in PM, **0× in CS**.

| CS call site | current box | radius | notes |
|---|---|---|---|
| `screens/Queue.jsx:17-18` (`QUICK_BTN`) | 26×26 fixed | full | no `focus-ring` |
| `screens/Queue.jsx:372` (bulk-bar close) | 26×26 fixed | full | no `focus-ring` |
| `screens/Queue.jsx:55` (add-filter) | 30×30 fixed | full, **dashed** border | PM has no dashed button |
| `screens/Queue.jsx:100` (refresh) | 28×28 | full | has `focus-ring` |
| `screens/Ticket.jsx:15-16` (`TOOL_BTN`) | 28×28 fixed | `rounded-token-sm` (3px) | no `focus-ring`; wrong radius |
| `screens/Ticket.jsx:13-14` (`ICON_BTN`) | 30×30 fixed | full | adds a `--border` ring PM's icon size does not |
| `screens/Reports.jsx:63` (drill close) | 30×30 fixed | full | |
| `screens/Header.jsx:11-23` (`IconButton`) + `:29` (`!w-[30px] !h-[30px] !rounded-token-sm`) | 32×32 / 30×30 | full / 3px | closest to PM, but adds a border |
| `screens/Settings.jsx:125` (deactivate) | 26×26, `0.5px` border | 50% | `sx()` string |

**Before:** eight geometries at 26/28/30/32px, three radii, five without a focus ring, all
**fixed pixels** — so they do not respond to the density switch, while the shared `<Button>`
beside them does (at `soft`: `<Button>` 36.8px, icon button still 26px).
**After:** one `<Button variant="ghost" size="icon">` (or `outline` where a ring is wanted).

**Blast radius:** ~14 call sites across 5 screens, plus ~30 more raw `<button>`s in
`Settings.jsx` if you do it there too — split `Settings.jsx` out into item 47.
**Effort L** — this is the biggest single item in the plan. Consider one push per screen.
**Risk:** medium — a 26px button becoming 32px changes toolbar wrapping. Check the Queue bulk
bar (7 controls in a row) and the Ticket composer toolbar at 1180px.
**Check:** every icon button should now depress on click and show a focus ring on Tab.

---

#### 15. Restore `focus-ring` on the 10 focusable elements that lack it — **S**

**CS:** `Queue.jsx:17` (`QUICK_BTN`), `Queue.jsx:20` (`BULK_BTN`), `Queue.jsx:131` (sort menu
item), `Ticket.jsx:8` (`MENU_ROW`), `Ticket.jsx:15` (`TOOL_BTN`), `Ticket.jsx:107` (subject
button), `Sidebar.jsx:7` (`NAV_ROW`), `Sidebar.jsx:20` (`MENU_ITEM`), `Header.jsx:5`
(`RESULT_ROW`), `Settings.jsx:11` (`tabBtn`).
**PM:** `focus-ring` is unconditional in `Button.tsx:6` and present on every hand-rolled
focusable in `src/`.

**Before:** ten keyboard-reachable controls give no focus indication.
**After:** `0 0 0 2px var(--bg), 0 0 0 4px var(--ring)` — the utility already exists in CS at
`globals.css:212-213`.

**Blast radius:** 10 constants → dozens of rendered elements.
**Risk:** none. **Check:** Tab through the Queue, the Ticket header and the Sidebar.
**Note:** items 14 and 15 overlap. If 14 lands first, 5 of these disappear.

---

#### 16. One checkbox definition — **S**

**CS** — five definitions:

| file:line | size | radius | border | accent |
|---|---|---|---|---|
| `screens/Queue.jsx:15` | 14px | none | none | `--primary` |
| `screens/Account.jsx:8` | 15px | none | none | `--primary` |
| `screens/Login.jsx:257-262` | 15px | none | none | `--primary` |
| `screens/Settings.jsx:306` | 15px | none | none | **`--cs-brand`** |
| `screens/Settings.jsx:608` | 14px | none | none | **`--cs-brand`** |

**PM** `src/app/login/page.tsx:245` and `src/app/signup/page.tsx:324`:
`className="h-3.5 w-3.5 rounded-token-sm border accent-[color:var(--primary)]"` +
`style={{ borderColor: 'var(--border-strong)' }}`.

**After:** one exported constant, PM's recipe, all five sites. Kill the `--cs-brand` accent
fork — in dark mode `--cs-brand` is `color-mix(green 52%, white)` while `--primary` is
`hsl(145 35% 62%)`, so two checkboxes on the *same Settings page* are currently different
greens.

Label rows also diverge: PM `text-[12px] text-fg-2` (`login/page.tsx:240`); CS
`text-[13px] text-fg` (`Login.jsx:255`), `text-[13px]` (`Account.jsx:7`), `text-[13px]
text-fg-2` (`Settings.jsx:606`). Standardise on PM's.

**Blast radius:** 5 definitions, ~10 rendered checkboxes.
**Risk:** none. **Check:** Settings in dark mode — both checkboxes the same green.
**See Open Question A** — PM's own design-system page shows a bare unsized checkbox.

---

#### 17. Add a switch/toggle and a radio — **M**

**CS** — `grep -r 'role="switch"\|aria-checked\|sr-only peer'` over `plumocs/frontend`
returns **zero**. `grep 'type="radio"'` returns **zero**. Settings rows that PM gives a switch
get a bare checkbox instead: `screens/Account.jsx:80-90`, `screens/Settings.jsx:300-308`.

**PM has four geometries and does not agree with itself** — see Open Question D:

| PM file:line | track | knob | translate |
|---|---|---|---|
| `settings/admin/timer/page.tsx:45-54` | `w-11 h-6` (44×24) | `w-5 h-5` | `peer-checked:translate-x-5` |
| `projects/[id]/settings/components/ProjectSettingsTab.tsx:136-144` | `w-11 h-6` | `h-5 w-5` | " |
| `settings/workspace/page.tsx:2526-2540` | `h-5 w-9` (20×36) | `h-4 w-4` | `translate-x-4` |
| `app/design-system/page.tsx:413-420` (the documented reference) | `w-8 h-4` (32×16) | `w-3 h-3` | `left: 16 / 2` |

All four: off = `var(--surface-3)`, on = `var(--primary)`, knob white.
**Recommendation:** `w-11 h-6` — the majority (2 of 4) and the one with a proper `peer` +
focus-ring implementation.

Radio: PM `app/design-system/page.tsx:401-406` — `accent-[color:var(--primary)]`.

**Blast radius:** new primitive in `components/common/`, then 2 call sites now and every
future settings row.
**Risk:** low. **Check:** the "notifications" rows in `Account.jsx` and `Settings.jsx`.

---

#### 18. Invert the secondary-button convention: `secondary` → `outline` — **M**

**CS** `components/screens/*` — `secondary` 25×, `outline` 7×, `ghost` **0×**.
**PM** `src/` — `outline` **111×**, `secondary` 45×, `ghost` **40×**, `primary` 43×,
`danger` 25×, `warning` 14×, `success` 9×.

**Before:** CS toolbars read as filled grey chips (`bg-surface-2`, `border --border`).
**After:** outlined-on-canvas (`bg-transparent`, `border --border-strong`), like PM.

The variants are already identical — PM `Button.tsx:14` (`outline`) vs `:18-19`. This is
purely a call-site convention change.

**Blast radius:** 25 call sites across all 11 screens. Also introduce `ghost` where a control
should be chromeless — that is PM's third-most-used variant and CS uses it zero times.
**Risk:** low technically, high-visibility. **Check:** put the Ticket header side by side with
PM's issue-detail header.

---

#### 19. Drop the login geometry overrides — **S**

**CS** `screens/Login.jsx:218, 231, 299` — `className="h-[44px] !rounded-[10px] text-[14px]"`
on three `<Input>`s; `:65-83` (`Federated`) — `h-[44px] px-4 rounded-[10px] text-[14px]`;
`:283, 320` — `<Button size="lg" className="w-full h-[44px] rounded-[10px] text-[15px]">`.
**PM** `src/app/login/page.tsx:196-204` passes **no** `className` to `<Input>` at all, and
`:145-170` uses `<Button variant="outline" size="md" className="w-full justify-center">`.

**Before:** 44px tall / 10px radius / 14–15px type.
**After:** the primitives' own values — `h-input` (32px × density), `rounded-token-sm` = 3px,
`text-[13px]`; buttons `h-btn-md` 32px, `rounded-full`, `text-[13px]`.

`rounded-[10px]` appears nowhere in PM. Neither does a 44px form control.

**Blast radius:** `Login.jsx` only — 8 elements.
**Risk:** low, but this will make the login page look markedly tighter. That is the point.
**Check:** compare against `dbwork/frontend/src/app/login/page.tsx` rendered.

---

#### 20. Restore the Ticket composer's input chrome — **S**

**CS** `screens/Ticket.jsx:409-416`:
`className="!border-none !bg-transparent !rounded-none p-3.5 min-h-[96px] text-[14px] leading-relaxed focus:!shadow-none"`
**PM** `src/components/common/Textarea.tsx:27-31`: `min-h-textarea` (72px × density),
`px-2.5 py-2`, `text-[13px]`, `focus-ring`.

**The load-bearing part is `focus:!shadow-none`** — it disables the focus ring on the primary
writing surface of the product. Four other `!important` overrides strip the border, background
and radius.

**Before:** a chromeless 96px box at 14px with no focus indication.
**After:** the shared Textarea. If the composer genuinely needs to sit flush inside its card,
keep `!border-none !rounded-none` and drop only `focus:!shadow-none` and `text-[14px]` — but
say so in the commit.

**Blast radius:** 1 element, used constantly. **Risk:** low. **Check:** Tab into the composer.

---

#### 21. Wire the `error=` prop into CS forms — **M**

**CS** `grep 'error='` over `components/screens/` returns **zero**. The `error` prop, the
`border --danger` state and the `mt-1 text-[11px] font-medium text-[color:var(--danger)]`
message line all exist in the ported `Input.tsx:52-54` and are unreachable. CS surfaces
validation failures as toasts instead (`Console.jsx:1179, 1194`).
**PM** uses `error=` throughout.

Also in this item: `screens/Settings.jsx:17-20` (`fieldInput()`) reproduces `Input.tsx:35-36`
but **omits** line 37 (`disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-surface-2`)
and line 38 (the error border). Used at `Settings.jsx:333, 440, 546` — **a disabled field in
Settings looks enabled.** Either complete it or delete it in favour of `<Input>`.

Label contract also diverges where hand-rolled: PM `block text-xs font-medium text-fg mb-1`
(12px / 500 / `--text` / 4px gap, `Input.tsx:21`); CS `Settings.jsx:434,540` uses
`font-size:12.5px; color:var(--cs-muted); gap:6px` (12.5px / 400 / `--text-2` / 6px).

**Blast radius:** every form in CS — Login, the new-conversation modal, Settings (3 fields).
**Risk:** low. **Check:** submit the new-conversation modal empty; the error should appear
under the field, not only as a toast.

---

### BATCH 5 — Overlays, feedback, motion
*Depends on Batch 1 item 3.*

---

#### 22. Replace the hand-rolled toast with `react-hot-toast` — **L**

**CS** — hand-rolled. State + 3600ms timer at `components/Console.jsx:475-479`; render at
`components/screens/Overlays.jsx:12-25`. `react-hot-toast` is **not** in
`plumocs/frontend/package.json`.
**PM** — `react-hot-toast@^2.4.1`, configured once at
`src/components/layout/RootLayout.tsx:57-94`.

| | CS now | PM / after |
|---|---|---|
| position | `fixed right-5 bottom-5` — **bottom-right** | **top-right**, 16px offset, 8px gutter |
| duration | **3600ms** (`Console.jsx:479`) | **4000ms** |
| shape | `rounded-full` pill, `px-4 py-3`, `max-w-[420px]` | `borderRadius: var(--radius)` (6px) rectangle, `padding: 10px 14px`, `max-width: 350px` |
| type | `text-[13px]`, weight inherited | `fontSize: 13px`, `fontWeight: 500` |
| colour | `background: var(--plumo-night)` `#1E3A8A` **navy**, `color: var(--plumo-on-night)` `#DBEAFE` — hardcoded, identical in light and dark, does not respond to the theme | `background: var(--surface)`, `color: var(--text)`, `border: 1px solid var(--border)`, `boxShadow: var(--shadow-modal)` — theme-aware |
| success | leaf-green dot only | `background: var(--success-soft)`, `color: var(--success)`, animated check icon |
| error | peach dot only | `background: var(--danger-soft)`, `color: var(--danger)`, animated cross icon |
| enter | `cs-in` 400ms `cubic-bezier(0.34,1.25,0.64,1)` | `translate3d(0,-200%,0) scale(.6)` → identity, 0.35s `cubic-bezier(.21,1.02,.73,1)` |
| exit | none — vanishes on unmount | 0.4s scale-out |
| stacking | newest at bottom | newest at top, height-aware |
| z-index | inline `style={{ zIndex: 120 }}` — a magic number bypassing the shared scale both configs define | library-managed 9999 |
| dismiss | impossible (`pointer-events-none`, no close button) | same for defaults; PM's rich toasts have close buttons |

**A navy toast in a green product is the single most obviously-wrong surface in CS.**

**Blast radius:** one dependency, `Console.jsx:475-479` deleted, `Overlays.jsx:12-25` deleted,
`app/layout.jsx` gains a `<Toaster>`, and every `this.toast(...)` call in `Console.jsx` (~40
sites) becomes `toast.success(...)` / `toast.error(...)`.
**Risk:** medium. `react-hot-toast` 2.4.1 predates React 19 — CS is on React 19.1 / Next 15.4
while PM is React 18.3 / Next 14.2. **Install `^2.6.0` or later, not PM's pinned `^2.4.1`.**
Verify hydration is clean before pushing.
**Check:** trigger a success and an error; confirm top-right, 4s, icon, theme-aware background.

---

#### 23. Adopt the shared `Dropdown` primitive — **L**

**CS** ships `components/common/Dropdown.tsx` byte-identical to PM's and **imports it zero
times.** Three inline menu systems instead.

| | PM `Dropdown.tsx:64, 85` | CS `Ticket.jsx:6-9` | CS `Sidebar.jsx:20-22` | CS `Header.jsx:5-7` | CS `Queue.jsx:124,131` |
|---|---|---|---|---|---|
| offset | `mt-2` (8px) | `top-[calc(100%+7px)]` | — | `+8px` | `+7px` |
| shadow | `shadow-card` (`0 1px 2px`) | **`shadow-modal`** (`0 20px 40px -8px`) | — | `shadow-modal` | `shadow-modal` |
| z | `z-dropdown` (10) | **`z-popover`** (60) | — | `z-popover` | `z-dropdown` (10) |
| panel padding | `py-1` (4px vertical, 0 horizontal) | `p-1.5` (6px all round) | — | `p-2` | `p-1.5` |
| width | `min-w-[200px]` | hand-sized `w-[150px]`…`w-[340px]` (7 values) | `w-[246px]` | `w-[320px]` | `w-[186px]` |
| item padding | `px-4 py-2` | `px-2.5 py-2` | `px-2.5 py-[9px]` | `px-2.5 py-2` | `px-2.5 py-2` |
| item font | `text-sm` = **14px** | `text-[13px]` | `text-[13px]` | `text-[13px]` | `text-[13px]` |
| item radius | square | `rounded-token-sm` | `rounded-token-sm` | `rounded-token-sm` | — |
| item focus | `focus-visible:bg-surface-2` | **none** | **none** | **none** | none |
| animation | `animate-dropdown` (150ms, `scale(.97) translateY(-4px)`, origin top) | `data-anim="in"` **+** `animate-fade-in` — the former wins → **400ms overshoot rise-from-below** | same | same | same |
| a11y | `aria-haspopup="menu"`, `role="menu"`, mousedown outside-close, Escape | none | none | none | none |

**This is the most *felt* popover difference: CS menus bounce up slowly from below, PM menus
snap down crisply from the top edge.**

**Blast radius:** ~12 menu instances across `Ticket.jsx` (7), `Header.jsx` (2), `Sidebar.jsx`
(1), `Queue.jsx` (2).
**Effort L.** Split per screen.
**Risk:** medium — the primitive owns its own open/close state and outside-click, so the
`Console.jsx` `V.*Open` flags for each menu can be retired. That is a behavioural refactor,
not a restyle.
**Check:** Escape closes; click-outside closes; Tab reaches items; the entry animation is a
150ms shrink from the top.

---

#### 24. Retire the `[data-anim]` motion vocabulary — **S**

**CS** `app/globals.css:300-306` — `@keyframes cs-in / cs-shimmer / cs-spin / cs-breathe` and
`[data-anim="in"|"sk"|"spin"]`, driven by `--plumo-dur-moment` (400ms) and `--plumo-ease`
(`cubic-bezier(0.34,1.25,0.64,1)`, an overshoot curve).
**PM** — no equivalent; PM's is `--dur` (200ms) `--ease-out` (`cubic-bezier(0.2,0,0,1)`, flat
decelerate).

**Before:** two motion systems side by side, one at 2× the other's duration with a bouncy
curve. `data-anim="in"` is on ~10 elements (every menu, popover and the toast).
**After:** delete `[data-anim="in"]` and `[data-anim="sk"]` (the latter is referenced by
nothing — dead). Keep `cs-spin` until item 27 and `cs-breathe` (mascot idle) pending Open
Question F.

**Blast radius:** ~10 `data-anim="in"` attributes. **Do this in the same push as item 3** or
they will double-animate.
**Risk:** low. **Check:** every menu now animates once, at 150ms.

---

#### 25. Add a drawer primitive — **M**

**CS** — **MISSING entirely.** `grep 'fixed top-0 right-0 h-full\|translate-x-full\|
animate-slide-in-right'` over `plumocs/frontend` returns nothing. CS's nearest thing is
`screens/Overlays.jsx:109` — `<Modal size="lg">` with **no `title`**, so `Modal.tsx:130` gates
out the whole header and it renders with **no close button**. It is called a sheet and behaves
as a chrome-less centred modal.

**PM** has five right-side drawers. Canonical: `src/components/dashboard/DayDetailDrawer.tsx:73-118`
— backdrop `fixed inset-0 z-modal-backdrop bg-black/40 backdrop-blur-[1px] animate-fade-in`
(note: **lighter blur than the modal's `backdrop-blur-sm`**), panel `w-full sm:w-[420px]`,
`animate-slide-in-right`, `z-modal`, `border-l`, `shadow-modal`, `role="dialog" aria-modal`,
header `px-4 h-12` with a 10px mono uppercase `tracking-[0.14em]` eyebrow over a 14px
semibold title and a `size={16}` close button, body `flex-1 overflow-y-auto`. Escape via
window keydown (`:59-66`), backdrop click (`:77`), `useBodyScrollLock(open)` (`:34`) — CS
already has `hooks/useBodyScrollLock.ts`, byte-identical.

PM is split between two drawer mechanisms (CSS animation vs always-mounted
`transition-transform`); `DayDetailDrawer` is the newer, token-driven one and the right model.

**Blast radius:** new primitive; immediately fixes the shortcuts sheet; unlocks a customer-detail
drawer and a ticket-preview drawer later.
**Depends on item 4** (`slide-in` keyframe) **and item 3**.
**Risk:** low. **Check:** the shortcuts sheet gets a header and a close button.

---

#### 26. Replace ad-hoc confirms with a dialog service — **M**

**CS** `components/Console.jsx:1948-1950` projects component state into
`components/screens/Overlays.jsx:27-42`. No `prompt` equivalent exists.
**PM** `src/contexts/DialogContext.tsx:56-169` — promise-based `useConfirm()` / `usePrompt()`,
`danger` flag → danger button, `required` gating, Enter-to-confirm. Mounted at
`src/components/layout/RootLayout.tsx:53`.

**Concrete bug this fixes:** CS defaults the confirm tone to `'warn'` (`Console.jsx:288, 828`)
but `confirmDanger` is only true when `tone === 'danger'` (`Console.jsx:1950`). So "mark as
spam" and "leave this reply behind?" render a **green primary** confirm button where PM would
render `danger`.

Also note `components/common/ConfirmDeleteModal.tsx` is byte-identical in CS and imported by
**no screen** — a dead port. Either wire it in or delete it (item 45).

**Blast radius:** ~8 confirm call sites in `Console.jsx`.
**Risk:** low. **Check:** "mark as spam" shows a red confirm button.

---

#### 27. Unify the spinners and use `Button loading` — **S**

**CS** — `components/common/LoadingSpinner.tsx` is byte-identical to PM's (16/32/48px SVG,
`r=7 strokeWidth=2`, `animate-spin` = 1s linear, `text-[color:var(--primary)]`) and is
**never rendered**. CS's actual spinner is hand-rolled at `screens/Queue.jsx:91` — an
`11px` CSS ring, `border-[1.5px]`, `data-anim="spin"` → `cs-spin 1.1s linear infinite`.

**Before:** 11px ring at 1.1s. **After:** `<LoadingSpinner size="sm" />` — 16px SVG at 1s.

Second half: **no CS call site ever passes `loading` to `<Button>`.** `grep` finds only
`disabled={loading}` in `ConfirmDeleteModal.tsx:67,70`, a file that is never rendered. CS's
async actions (`Console.jsx` send / save / generate-key) give no in-button progress. The prop
and the spinner markup are already in CS's `Button.tsx:56-77`.

**Blast radius:** 1 spinner site + ~6 async buttons.
**Risk:** none. **Check:** click "send reply" on a slow connection.

---

#### 28. Add the boot loader and the error routes — **M**

Two gaps, both "nothing renders":

**(a) Page-level loading — MISSING.** `Console.jsx:1962-1988` has **no `!booted` branch**;
nothing at all is shown while the console bootstraps. PM has
`src/components/common/LogoLoader.tsx:20-147` — workspace logo in a 44/56/72px `primary-soft`
tile, a 10px mono `tracking-[0.14em]` uppercase status line with a pulsing dot, and a 4px
progress rail driven by `.plumo-loader-progress-bar` (`globals.css:295-310` —
`plumo-loader-progress 3.6s cubic-bezier(0.2,0.7,0.2,1) forwards`, scaleX 0.06 → 0.64 → 0.92,
GPU-only). Used at `src/app/(authenticated)/[workspace]/layout.tsx:94`.

**(b) Route-level errors — MISSING.** CS has no `app/error.tsx`, `app/not-found.tsx` or
`app/global-error.tsx`. An uncaught render throws to a blank page. `components/common/
ErrorScreen.tsx` is byte-identical and exported at `components/common/index.ts:41` but
**never rendered**; `ErrorBoundary.tsx` likewise. PM uses `ErrorScreen` at `src/app/error.tsx`,
`global-error.tsx`, `not-found.tsx` and the workspace-scoped equivalents.

CS instead ships `screens/EdgeScreens.jsx` (51 lines), rendered *inside* the console shell:
no card, a radial-gradient wash, mascot at `w-24` (96px), an 11px uppercase `tracking-[2px]`
primary eyebrow, `h2 text-[24px] font-medium tracking-[-.7px]`, body `text-[14px]
max-w-[40ch]`. PM's `ErrorScreen`: centred card `max-w-[480px] bg-surface rounded-token border
p-8`, optional mono badge chip, illustration 360×240, `h1 text-[22px] font-semibold
tracking-tight`, body `text-[13px] text-fg-2`, collapsible mono details panel.

So: **24px/500/−0.7px vs 22px/600/tight; 14px body vs 13px; 96px mascot vs 360px blob; no
card, no badge chip, no details panel.**

**Blast radius:** 3 new route files + `LogoLoader` + the `!booted` branch in `Console.jsx`.
**Risk:** low. **Check:** throw in a screen; you should get `ErrorScreen`, not a white page.
**Open Question F** covers whether the mascots survive.

---

### BATCH 6 — The shell
*The most-looked-at surfaces. Nothing here depends on Batches 4–5, so it can be interleaved.*

---

#### 29. Fix the blue active nav state — **S**

**CS** `app/globals.css:134` — `--cs-btn: #2563EB` (literally PM's `--plumo-blue`);
`:279` — `nav [data-on="true"]{ --cs-onbg: color-mix(--cs-btn 9%, surface); --cs-onfg:
var(--cs-btn); --cs-onbar: var(--cs-btn) }`, which **overrides the green `[data-on="true"]`
rule one line above it** at `:277`. Dark: `:192` sets `--cs-btn: #3B82F6` — also blue.

**Before:** the active nav row's text, left bar and tint are **blue in a green product**.
**After:** delete the `nav [data-on="true"]` override at `:279` (and `--cs-btn` at `:134`/`:192`)
so the generic green `[data-on]` rule applies, or better, retire the pair entirely in favour of
`bg-[color:var(--primary-soft)] text-[color:var(--primary)]` (PM `NavLink.tsx:32`) as part of
item 30.

**This is not a palette decision — it is the one place the re-green was missed.**

**Blast radius:** every nav row. **Risk:** none. **Check:** the active nav row is green.

---

#### 30. Rebuild the nav item on PM's geometry — **M**

**CS** `screens/Sidebar.jsx:7-16, 26`. **PM** `src/components/layout/Sidebar/NavLink.tsx:29-44`.

| | CS now | PM / after |
|---|---|---|
| height | **28px** (`h-navitem`) with a contradictory `py-[9px]` | **38px** (`h-[38px]`, hardcoded in all 7 PM nav surfaces) |
| font | `13.5px`, weight `var(--cs-onw)` (400 idle → 500 active) | `14px`, `font-medium` (500) always |
| padding-x | `px-2.5` (10px) | `px-3` (12px) |
| gap | `gap-2.5` (10px) | `gap-3` (12px) |
| radius | `rounded-token-sm` (3px) | `rounded-token` (6px) |
| active mark | attached square `borderLeft: 2.5px solid`, **always rendered** (transparent when off) | detached pill `absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-full`, **suppressed when collapsed** |
| active fill | `color-mix(--cs-btn 9%, surface)` + `--cs-btn` | `bg-[color:var(--primary-soft)]` + `text-[color:var(--primary)]` |
| idle | `--cs-muted` | `text-fg-2 hover:bg-surface-2 hover:text-fg` |
| icon colour | fixed (see item 31) | `text-fg-3 group-hover:text-fg-2`, active `text-[color:var(--primary)]` |

**28px → 38px is the single most visible shell difference — a 10px-per-row rhythm change
across the whole rail.**

Also structural: PM's main nav is a **flat unlabelled list** (`Sidebar/Sidebar.tsx:461`,
`px-2 space-y-0.5`) with exactly one section label ("Projects"); CS splits five items under
two labels — `Sidebar.jsx:53` ("overview") and `:57` ("people"). Section header style also
differs: PM `ProjectsSection.tsx:65` `text-[10px] font-semibold uppercase tracking-wider` at
`px-4 mb-1.5`; CS `Sidebar.jsx:18` `text-[10.5px] font-medium uppercase tracking-[1.5px]` at
`px-3 pt-3 pb-1.5`.

**Blast radius:** the whole left rail — 5–6 rows plus the user card.
**Risk:** low technically; the rail gets ~60px taller. **Check:** at 900px viewport height the
user card must still be reachable.

---

#### 31. Replace the `<img>` nav icons with inline `currentColor` SVG — **S**

**CS** `screens/Sidebar.jsx:38` — `<img src="/assets/icons/*.svg" className="w-[18px] h-[18px]">`.
Verified in `public/assets/icons/icon-ticket.svg` and `icon-customer.svg`: the files hardcode
`stroke="#1E3A8A"` (PM's `--plumo-night` navy) at `stroke-width="1.6"`.
**PM** `Sidebar/navConfig.tsx:7` — inline SVG at `w-[18px] h-[18px]`, colour driven by the
parent via `currentColor` (`NavLink.tsx:45-51`).

**Before:** the CS rail shows **navy** icons that never change on hover or active, in a green
product.
**After:** they inherit `text-fg-3` → `text-fg-2` → `var(--primary)` like PM's.

**Blast radius:** 7 assets referenced from `Sidebar.jsx`, `Queue.jsx`, `Ticket.jsx`.
**Risk:** none. **Check:** hover a nav row; the icon should change colour with the label.

---

#### 32. Bring the top bar to PM's spec — **M**

**CS** `screens/Header.jsx:28` and `:11-23, 29, 36-50, 82-93`.
**PM** `src/components/layout/Header.tsx:129-131, 189-214, 241-243, 277-287, 291, 302`.

| | CS now | PM / after |
|---|---|---|
| height | **44px** fixed (`h-topbar`) | **48px mobile / 56px desktop** (`h-12 md:h-14`) |
| padding | `px-4 py-2` | `px-2 md:px-3` |
| background | `color-mix(surface 86%, transparent)` + `backdrop-blur-md` | solid `bg-surface` |
| z-layer | `z-fixed` (30) | `z-sticky` (20) |
| search | **live `<Input>`** with results popover, `h-btn-md` (32px), `!rounded-full` | **button** opening a command palette: `h-7` (28px), `rounded` (4px — note: PM uses raw `rounded`, not the token), `border-strong`, `text-xs`, `⌘K` `<Kbd>` hint |
| icon buttons | `w-8 h-8 rounded-full border border-[--border] bg-surface` — outlined circles | bare `p-1 rounded hover:bg-surface-2`, **no border** |
| create button | `size="md"` (32px) | `size="sm"` (28px) |
| menu width | `w-[246px]` / `w-[320px]` | `w-40` / `w-48` |
| menu item | `px-2.5 py-2 text-[13px]` | `px-3 py-1.5 text-xs` (12px) |

**Blast radius:** `Header.jsx` end to end (142 lines).
**Risk:** medium — the search *mechanism* differs, not just its size. Converting a live search
field into a command-palette trigger is a feature change; **see Open Question E** before
touching it. The height, padding, background, z-layer, icon-button and create-button rows are
safe to do now.
**Check:** header height must match PM's when both are open side by side.

---

#### 33. Move the logo to the top bar — **S**

**CS** `screens/Sidebar.jsx:46-51` — mark 26px + wordmark `text-[16px] font-medium
tracking-[-.4px]`, at the **top of the sidebar**.
**PM** `src/components/layout/Header.tsx:176-184` — `<PlumoMark size={24} />` + wordmark
`text-[14px] font-medium tracking-tight text-fg`, in the **top bar**.

The logo *artwork* is exempt. Its *position and size in the shell* is not — different corner
of the screen, and 16px vs 14px wordmark.

**Blast radius:** 2 files. **Risk:** none — but it changes the first thing anyone sees.
**Check:** side-by-side screenshot.

---

#### 34. Adopt PM's page-header pattern — **S**

**CS** `screens/Reports.jsx:30-31`, `Customers.jsx:23-24`, `Account.jsx:23`.
**PM** `src/app/(authenticated)/[workspace]/users/page.tsx:625-626`.

| | CS now | PM / after |
|---|---|---|
| element | `<h2>` | `<h1>` |
| size | 21–22px | **26px** (9 pages) or 24px (7 pages) — use 26 |
| weight | `font-medium` (500) | `font-semibold` (600) |
| tracking | `tracking-[-.6px]` | `tracking-tight` (≈ −0.65px at 26px — effectively the same) |
| colour | none → inherits the brand-green base rule | explicit `text-fg` |
| subtitle | `text-[13px] text-fg-3` | `text-[13px] text-fg-2 mt-1` — one step darker |

Item 7 already fixes the colour and weight globally; this item fixes the element, size and
subtitle tone.

CS is internally inconsistent too: `Login.jsx:161, 284, 320` uses `font-semibold` at 26–32px
while every in-app title uses `font-medium` at 21–22px. Standardising on PM removes that too.

**Blast radius:** 4 screens. **Risk:** none.

---

#### 35. Normalise icon stroke width — **S**

**CS** — `strokeWidth="1.75"` in **40** hand-drawn inline SVGs across `components/`.
**PM** — `strokeWidth={2}` **288×**, `1.8` 71×.

**Before:** every hand-drawn glyph in the console is a consistently lighter line than PM's.
**After:** `2`.

**Blast radius:** 40 one-token edits, 8 files. Mechanical.
**Risk:** none. **Check:** the Ticket toolbar icons should read at the same weight as PM's.
Does not affect `components/common/icons/registry.generated.ts`, which is already identical.

---

#### 36. Wire in the breadcrumb — **S**

**CS** — `components/common/Breadcrumb.tsx` is byte-identical to PM's, exported at
`components/common/index.ts:37`, and **rendered zero times**. CS has no breadcrumb anywhere.
**PM** renders `<Breadcrumb>` on 17 pages (e.g. `users/page.tsx:611-620` with `className="mb-6"`).

**Blast radius:** each screen with a parent context — Ticket (inbox → #NNN), Customer profile
(customers → name), Settings sub-tabs.
**Risk:** none. **Check:** the Ticket screen should show `Home / Inbox / #1042`.

---

### BATCH 7 — Layout rhythm, cards, tables

---

#### 37. Add responsive page padding — **S**

**CS** — a single fixed value on all four page screens: `px-6 py-[22px]` — `Reports.jsx:28`,
`Customers.jsx:5` (`PAGE`), `Account.jsx:12`.
**PM** — responsive on every page: `p-3 md:p-4 lg:p-6` (`dashboard/page.tsx:92`,
`projects/page.tsx:167`), `p-4 md:p-6 lg:p-8` (`issues/page.tsx:109`), `p-4 md:p-8`
(`reports/page.tsx:313`), `p-8` (`users/page.tsx:610`).

**Blast radius:** 4 screens. **Risk:** none. **Depends on nothing.**
**Note:** this is the first item that introduces Tailwind breakpoints into CS screen code,
which currently has **zero** — see item 42.

---

#### 38. Add page content max-widths — **S**

**CS** — **zero** page-level `mx-auto` wrappers; every screen is full-bleed. The only `max-w`
values sit on inner elements (`max-w-[520px]` search, `max-w-[42ch]` copy). `Account.jsx:12`
has `max-w-[760px]` but is **not centred**.
**PM** — centres content in 18 places: `max-w-[720px] mx-auto` ×7 (settings-shaped pages),
`max-w-[1400px] mx-auto` ×2, `max-w-[840px]` ×2, `max-w-7xl` / `5xl` / `3xl` ×2 each.

**After:** Account and Settings → `max-w-[720px] mx-auto`; Reports and Customers →
`max-w-[1400px] mx-auto`.
**Blast radius:** 4 screens. **Risk:** none — but at 1920px this is very visible. Show him
before pushing.

---

#### 39. Move the tables onto the shared row utilities — **M**

**CS** `screens/Customers.jsx:7-13` (`THEAD` / `TROW`), `screens/Reports.jsx:6-7`,
`screens/Queue.jsx:207, 270`.
**PM** `src/app/design-system/page.tsx:495, 508`.

| | PM | CS `Customers` / `Reports` | CS `Queue` |
|---|---|---|---|
| header height | `h-row-header` = **40px × density** | `py-2.5` ≈ 30px fixed | `py-2` ≈ 27px fixed |
| header bg | `bg-surface-2` | **`bg-bg`** | **`bg-bg`** |
| header weight | **`font-semibold`** (600) | none → 400 | none → 400 |
| header tracking | `tracking-wider` (0.05em ≈ **0.55px** at 11px) | **`tracking-[1.4px]`** | **`tracking-[1.4px]`** |
| header padding-x | `px-3` | `px-4` | `px-4` |
| row height | `h-row` = **44px × density** | `py-3` fixed | `--cs-rowpy` (10 / 4 / 17px) |
| row font | `text-[13px]` | **`text-[13.5px]`** | `--cs-fs` (13.5 / 13 / 14px) |
| row hover | `hover:bg-surface-2` | ✓ matches | ✓ matches |
| selected row | `bg-[color:var(--primary-soft)]` | **MISSING** | **MISSING** |
| zebra | none | ✓ none | ✓ none |
| empty state | `EmptyState` | ✓ `EmptyState` | ✓ `EmptyState` (`Queue.jsx:239,258`) |

`h-row` and `h-row-header` are already defined in CS `app/globals.css:218-219` and used **zero
times**. `tracking-[1.4px]` is nearly 3× PM's — the most visible of these.

**Blast radius:** 3 screens, 5 table definitions.
**Risk:** low. Rows getting 14px taller changes how many fit on screen. **Check:** Queue at
1080p — row count per page.
**Depends on item 13** (retire `--cs-rowpy` / `--cs-fs` here).

---

#### 40. Drop `shadow-card` from the panel constant — **S**

**CS** `screens/Reports.jsx:5` and `screens/Customers.jsx:6` —
`PANEL = 'rounded-token bg-surface border border-[color:var(--border)] shadow-card'`.
Also `screens/Account.jsx:5` (`CARD`, `shadow-card p-5`).
**PM** — the dominant card is **flat and bordered, no shadow**: 64 shadowless instances vs 21
with `shadow-card` (75 / 25). Top recipes: `bg-surface rounded-token border overflow-hidden`
(20×), `… border p-4` (11×), `… border p-4 md:p-5` (7×).

Padding also differs: PM `p-4` or `p-4 md:p-5`; CS `p-5` (`Reports.jsx:53`, `Account.jsx:5`).

**Before:** every CS panel lifts. **After:** flat, like PM's, with `shadow-card` reserved for
the minority case.
**Blast radius:** 3 constants → every card and table panel in CS.
**Risk:** none. **Check:** side-by-side with PM's projects list.

---

#### 41. Fix the `EmptyState` illustration scale — **S**

**CS** never uses the `illustration` preset prop; it passes mascot SVGs through the raw `icon`
prop at **84px** — `screens/Queue.jsx:236-256` (`/assets/mascots/mascot-05-waiting.svg`,
`mascot-01-listening.svg`, the latter with `animation: cs-breathe 5.5s ease-in-out infinite`).
**PM** `src/components/common/EmptyState.tsx:31-37, 128-140` routes through `illustration` →
brand blob SVGs from `/brand/empty-states/` at **280×187** (compact 200×134).

The component itself is byte-identical, so this is purely what gets passed in: a different
illustration family at roughly a third the size, plus an idle breathing animation PM has no
analogue for.

**Blast radius:** 2 empty states in `Queue.jsx`, plus the mascots in `Login.jsx:315`,
`EdgeScreens.jsx:14,36`, `Overlays.jsx:112`.
**Blocked on Open Question F** — whether the mascots count as "the logo".

---

### BATCH 8 — Responsive

---

#### 42. Give CS a mobile layout and align the breakpoints — **L**

**CS** — **24** responsive prefixes in the whole tree, and **all 24 are inside three ported
primitives** (`common/FilterBar.tsx`, `common/Modal.tsx`, `common/SettingsFormSkeleton.tsx`).
`components/screens/` contains **zero** `sm:` / `md:` / `lg:` prefixes (verified). Layout
response is three hand-written max-width media queries at `app/globals.css:307-309`:
1400px drops the tags column; 1180px forces `--cs-navw: 64px`, hides `[data-navlabel]` and
drops the priority column; 1080px hides the filter rail.

**PM** — **557** responsive prefixes (`sm:` 136, `md:` 314, `lg:` 104, `xl:` 3) at Tailwind
defaults 640 / 768 / 1024 / 1280. Its only CSS `@media` is `prefers-reduced-motion`.

**Three consequences:**
1. **No shared breakpoint value.** CS's are 1080 / 1180 / 1400; PM's are 640 / 768 / 1024 / 1280.
2. **CS has no mobile layout at all.** Its smallest breakpoint is 1080px. At 375px CS still
   renders a 64px icon rail plus a fixed-pixel grid (`--cs-qcols: 26px 92px minmax(180px,1fr)
   140px 30px 82px 46px` ≈ 600px minimum) and scrolls horizontally. No drawer, no scrim, no
   hamburger path.
3. **Collapse semantics differ.** In PM, collapsing is only a user choice
   (`DashboardLayout.tsx:87-105`). In CS the viewport also forces it (`globals.css:308`), so
   between 1080–1180px the user's toggle is silently overridden.

**PM's mobile pattern to copy** (`src/components/layout/DashboardLayout.tsx:80, 112-124` and
`Header.tsx:137, 222, 258`): desktop rail `hidden md:flex`; below 768px an overlay drawer
`fixed inset-y-0 left-0 w-72 z-modal` with a `bg-black/50 z-modal-backdrop` scrim; header
hamburger `md:hidden`; search collapses to an icon; the create button's label hides via
`hidden md:inline`.

**Blast radius:** every screen. **Effort L** — this is the second-largest item after 14 and 23.
**Risk:** high. Split it: (a) hamburger + drawer + scrim; (b) Queue grid → a stacked card list
below `md`; (c) Ticket two-pane → tabs below `lg`; (d) retire the three raw media queries.
**Check:** 375 / 768 / 1024 / 1280 / 1920, no horizontal scroll at any width.

---

### BATCH 9 — Copy voice
*The owner exempted the palette and the logo. He did not exempt the writing. Confirm the
decision before executing — see Open Question G.*

---

#### 43. Bring the copy into PM's register — **M**

**CS** hardcodes every string in JSX; all lowercase, with a flower glyph.
**PM** keeps 232 keys in `src/i18n/locales/en/toasts.json`, all Sentence case, no glyphs.

The same event, both apps: PM says **"Profile updated successfully!"**; CS says
**"name updated ✿"** (`Console.jsx:134`).

| | PM | CS |
|---|---|---|
| `✿` glyph | **0** across all `.tsx`/`.ts`/`.json` | **20** — `Console.jsx` ×13, `Header.jsx:66`, `Login.jsx`, `Overlays.jsx:120`, `Queue.jsx`, `Ticket.jsx` ×2, `EdgeScreens.jsx:47` |
| toasts | `"Password changed successfully!"`, `"Issue created successfully!"`, `"Sprint started successfully"` | `Console.jsx:145` `"password changed — you're still signed in ✿"`, `:607` `"view saved — it's in your tabs now ✿"`, `:805` `"conversation #… started ✿"`, `:285` `"noted ✿"` |
| placeholders | 50 Sentence case / 19 lowercase (72%) — `"Brief summary of the issue"`, `"Confirm password"` | 12 lowercase / 1 uppercase (92%) — `"what's going on?"`, `"in their words, as best you have them…"`, `"just to be sure"` |
| nav labels | `"Dashboard"`, `"Issues"` | `Sidebar.jsx:53-59` — `overview`, `inbox`, `mine`, `people`, `customers`, `reports`, `settings` |
| page titles | `"User Management"` | `"reports"`, `"customers"` |
| register | plain | em-dash reassurance clauses PM never uses — `Console.jsx:890` `"invite sent — they'll get a gentle nudge by email ✿"`; `Queue.jsx:27-35` view names `'no one yet'`, `'waiting on them'`, `'needs attention'` |

**Blast radius:** ~35 strings across `Console.jsx`, `Sidebar.jsx`, `Queue.jsx`, `Header.jsx`,
`Login.jsx`, `Overlays.jsx`, `EdgeScreens.jsx`.
**Risk:** none technically. This is entirely a taste decision — **do not execute before
Open Question G is answered.**

---

#### 44. Externalise the strings to i18next — **L**

**CS** has no i18n; every string is hardcoded in JSX, so CS cannot be translated and there is
no single file where the voice can be corrected.
**PM** — `i18next` + `react-i18next`, 14 namespaces × en/fr.

**Blast radius:** every screen. **Effort L.**
**Risk:** low but tedious. Worth doing only if CS is going to ship in French like PM, or if
item 43 is approved (a single locale file makes the voice fix reviewable in one diff instead
of 35). **Open Question H.**

---

### BATCH 10 — Delete the parallel systems
*Last, because everything above has to stop depending on them first.*

---

#### 45. Delete the dead code — **S**

| Path | What it is | Status |
|---|---|---|
| `components/ds.jsx` (132 lines) | A **third** component language — `Button` / `Badge` / `Pill` on inline styles and the marketing `--plumo-*` palette (`--plumo-blue`, `--plumo-mist`, `--plumo-peach`, `--plumo-butter`). Its Button is `padding: 12px 22px; font-size: 15px; border-radius: var(--plumo-radius-pill)` against `Button.tsx`'s `h-btn-md px-3 text-[13px]`. | **Imported by nothing.** Delete. |
| `components/ui/index.js` (13 lines) | Barrel re-exporting `./Button`, `./Input`, `./Badge`, `./Surface`, `./Overlay`, `./Avatar`, `./Segment`. **None of those files exist** — the directory contains only `index.js`. Any import fails to resolve. | Delete the directory. |
| `screens/Ticket.jsx:3` | `import { Button, Card, … } from '../common'` — **there is no `Card`** in `components/common/` and `index.ts` does not export one. Never rendered, so no crash today; will fail `tsc`. | Remove `Card` from the import list. |
| `app/globals.css:305` | `[data-anim="sk"]` + `@keyframes cs-shimmer` — referenced by nothing. | Delete (folded into item 24). |
| `app/globals.css:54-55` vs `:150-151` | `--font-sans` and `--font-mono` each defined **twice** in the same `:root`; the second wins. Same effective value, live footgun. | Delete the first pair. |
| `components/common/ConfirmDeleteModal.tsx` | Byte-identical to PM's, imported by no screen. | Wire in (item 26) or delete. |

PM has no equivalent of any of these. They are drift generators aimed at the next person who
greps for "Button" in CS.

**Effort S. Risk: none. Check:** `npm run build` and `tsc --noEmit`.

---

#### 46. Retire the `--plumo-*` / `--cs-*` duplicate token layer — **L**

**CS** `app/globals.css:12-104` (the `--plumo-*` block, 60 vars) and `:130-142` (the `--cs-*`
block, ~45 vars) — 105 variables PM does not have. **PM** has one namespace.

Every row below is a CS variable meaning the same thing as a PM variable under a different
name. Both live side by side today, so a future edit to one silently desyncs the other.

| Concept | PM name | CS duplicates | CS line |
|---|---|---|---|
| page background | `--bg` | `--surface-canvas`, `--plumo-canvas`, `--cs-canvas` | `:41, 27, 131` |
| card surface | `--surface` | `--surface-page`, `--surface-card`, `--plumo-white`, `--cs-surface` | `:40, 42, 28, 131` |
| soft accent | `--primary-soft` | `--surface-soft`, `--cs-brand-soft`, `--cs-soft` | `:43, 135, 131` |
| primary text | `--text` | `--text-primary`, `--plumo-dark`, `--cs-text` | `:36, 24, 132` |
| secondary text | `--text-2` | `--text-secondary`, `--plumo-muted`, `--cs-muted` | `:37, 25, 132` |
| border | `--border` | `--border-default`, `--plumo-border`, `--cs-border` | `:46, 26, 133` |
| brand | `--primary` | `--accent-primary`, `--text-brand`, `--cs-brand`, `--cs-accent-src` | `:48, 38, 133` |
| brand hover | `--primary-hover` | `--accent-hover` (= `--plumo-night`, **a different colour**) | `:49` |
| focus ring | `--ring` | `--border-focus` (= `--plumo-sky`, **blue**) | `:47` |
| radius | `--radius` (6px) | `--plumo-radius-sm/md/lg/xl/pill` (8/12/16/20/100px), `--cs-r-sm/-r-md` (8/12px) | `:77-81, 138` |
| elevation | `--shadow-card/-hover/-modal` | `--plumo-shadow-card/-float/-toast` | `:101-103` |
| duration | `--dur-fast/--dur/--dur-slow` (150/200/300) | `--plumo-dur-micro/-default/-moment/-hero` (150/250/400/700) | `:85-88` |
| easing | `--ease-out` (0.2,0,0,1) | `--plumo-ease` (0.34,**1.25**,0.64,1 — overshoot) | `:84` |
| spacing | *(Tailwind's)* | `--plumo-space-1…12` | `:91-98` |
| type scale | *(Tailwind `fontSize`)* | `--plumo-text-display-xl…-eyebrow` (96/56/40/28/20/16/13/11px) | `:58-64` |
| tracking | *(none)* | `--plumo-track-*` (−4 / −2 / −1.2 / −0.6 / −0.3 / +2px) | `:66-71` |
| line height | *(none)* | `--plumo-lh-tight/-snug/-body` (0.95/1.1/1.65) | `:72-74` |
| font weight | *(`font-medium`)* | `--plumo-fw-regular/-medium` (400/500) | `:56-57` |

**Net effect: two radius systems** (3/6/9px on the primitives, 8/12/16px on the console
chrome), **two elevation systems** (`0 1px 2px @4%` vs `0 10px 30px @6% + 1px ring`), **two
motion systems**. Usage census: `components/screens/*` = 238 legacy refs vs 150 shared;
`components/common/*` = **0 legacy vs 149 shared**.

**Keep** the domain-semantic `[data-tone]` (`:247-268`) and `[data-av]` (`:269-276`) blocks —
those encode support-domain meaning PM has no analogue for. **CORRECT-BY-DESIGN.** But fix
`--av-fg: var(--plumo-night)` at `:140` (navy default) → `var(--primary)`.

**Blast radius:** all 11 screens. **Effort L.**
**Risk:** medium. Do this **after** items 46's dependents (14, 18, 22, 23, 24, 39, 47) so the
count of legacy refs is already small.
**Check:** `grep -c -- '--plumo-\|--cs-' components/screens/*.jsx` should trend to zero
(except `[data-tone]` / `[data-av]` consumers).

---

#### 47. Rewrite `Settings.jsx` off `sx()` — **L**

**CS** `components/screens/Settings.jsx` (625 lines) uses the `sx()` runtime CSS injector
(`components/sx.js`, 38 lines) with raw CSS strings against the `--cs-*` palette — ~150 call
sites. **PM has no equivalent.**

Its header comment (`Settings.jsx:8-10`) claims controls "borrow the shared components' own
class strings … so geometry, colour and focus rings match Button and Input exactly." That is
true for `editBtn` / `primaryBtn` / `fieldInput` (`:15-20`) and **false for the ~30 raw
`<button>`s and the entire table.** It has:

- its own table (`:102, 106`) — `padding: 9px 16px` header / `10px 16px` row,
  `font-size: 11px` / `13.5px`, `letter-spacing: 1.4px`
- its own 26×26 icon button (`:125`)
- its own pills (`:60, 115`) — `padding: 2px 9px` / `3px 9px`, `border-radius: 100px`,
  `font-size: 11.5px` / `12px`. PM's `Badge` is `rounded-token-sm` (3px), never a pill
- its own card hover (`:57`) — `transform: translateY(-4px)` on `var(--plumo-dur-default)`
  (250ms), a **marketing-site token**, where PM's `.interactive` is `translateY(-1px)` on
  `--dur-fast`
- **`border: 0.5px solid`** throughout, where every other CS surface and every PM surface is
  `1px`

**Blast radius:** one file, but it is 625 lines and ~15% of CS's screen code. After it lands,
`components/sx.js` has one remaining consumer (`Console.jsx:1967-1983`), which is trivial to
convert — then delete `sx.js`.
**Effort L.** Split by settings tab.
**Risk:** medium — Settings has the most stateful forms in the app.
**Check:** every tab; the disabled-field state (item 21) should now work.

---

#### 48. Self-host the fonts — **M**

**CS** `app/globals.css:1` —
`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap')`.
**PM** `src/app/layout.tsx:17-18` — `next/font/google`, self-hosted, `display: 'swap'`, no
external request; injected via `<html className={sans.variable}>` at `:120` and
`<body className="font-sans">` at `:121`.

Three differences:
1. **Delivery** — CS makes a render-blocking third-party fetch at runtime; PM self-hosts.
2. **Weights** — CS loads only `400;500;600`. Anything at `font-bold` (700), e.g.
   `components/common/ErrorBoundary.tsx`, renders **synthesized faux-bold**. PM's variable
   Inter covers 100–900.
3. **Mono** — PM loads JetBrains Mono as a webfont (`layout.tsx:18` → `--font-mono`). CS has
   **no mono webfont**: `'SF Mono', Menlo, Consolas, monospace` (`globals.css:53, 151`), so it
   falls back to Consolas on Windows and Menlo on macOS. Different glyphs, different metrics
   — visible on every `font-mono` eyebrow, the `reference 7f21-c4` line at `EdgeScreens.jsx:49`,
   and every tabular figure.

**Blast radius:** app-wide typography. **Risk:** low. **Check:** DevTools Network — no request
to `fonts.googleapis.com`; `font-bold` renders a real 700 weight.

---

## 5. STRUCTURAL FINDINGS

These matter more than any single value, because each one guarantees the drift comes back.

**S1. CS re-implements inline what PM has as a primitive — in five categories.**

| Primitive | PM usage | CS usage | CS's inline replacement |
|---|---|---|---|
| `Button size="icon"` | 8× | **0×** | 8 hand-rolled geometries at 26/28/30/32px, 3 radii |
| `Dropdown` | the primitive | **imported 0×** | 3 inline menu systems across 5 screens |
| `Button variant="ghost"` | 40× | **0×** | bare `<button>` with `hover:bg-surface-2` |
| checkbox recipe | 1 | — | **5** definitions, 2 accent sources |
| `LoadingSpinner` | the primitive | **rendered 0×** | an 11px CSS ring at `Queue.jsx:91` |
| `ErrorScreen` / `ErrorBoundary` | 5 routes | **rendered 0×** | `EdgeScreens.jsx`, in-shell |
| `ConfirmDeleteModal` | in use | **imported 0×** | — |
| `Breadcrumb` | 17 pages | **rendered 0×** | — |

**Fix:** treat `components/common/` as read-only and import-only. Add a CI check —
`grep -rE '<button' components/screens/` should trend to zero, and any new `class` string
containing `h-\[[0-9]+px\]` on a control should fail review. The nine ported-but-unused
components are the tell: the port copied the files but never rewired the screens.

**S2. Two design systems, two token namespaces, running side by side.** `components/common/*`
resolves **149** shared-token refs and **0** legacy refs. `components/screens/*` resolves
**238** legacy refs vs **150** shared. So the primitives are on PM's language and the app is
not. Concretely that is two radius scales (3/6/9 vs 8/12/16px), two elevation recipes, two
motion vocabularies (200ms decelerate vs 400ms overshoot) and two density systems driven off
the same attribute with different multipliers. **Fix: items 13, 24, 46.**

**S3. A third and fourth dead system in the tree.** `components/ds.jsx` (132 lines, its own
Button/Badge/Pill on `--plumo-blue`) and `components/ui/index.js` (a barrel to seven files
that do not exist). Neither is imported. They exist to mislead the next person who greps for
"Button". **Fix: item 45.**

**S4. Different libraries for the same job.** PM uses `react-hot-toast@^2.4.1` configured once
at `RootLayout.tsx:57-94`; CS hand-rolls toasts in component state (`Console.jsx:475-479` +
`Overlays.jsx:12-25`). PM uses a promise-based `DialogContext`; CS threads confirm state
through `renderVals()`. PM externalises copy to `i18next`; CS hardcodes it. Every one of these
is a place where CS will diverge again the next time either app changes. **Fix: items 22, 26, 44.**

**S5. `sx()` — a runtime CSS-in-JS injector with no PM counterpart.** `components/sx.js`
emits raw CSS strings at runtime, bypassing Tailwind, the token utilities and the purge step
entirely. Used by `Settings.jsx` (~150 sites), `Console.jsx:1967-1983` and `Ticket.jsx`.
Anything written in `sx()` is invisible to every tool that could keep the two apps aligned.
**Fix: item 47, then delete `sx.js`.**

**S6. CS's screens have zero responsive prefixes.** All 24 in the tree live inside ported
primitives. Layout response is three raw px media queries at 1080/1180/1400 that align with no
Tailwind breakpoint, so no utility class can ever match them. This is not a value difference —
it is a different mechanism, and it means CS's layout cannot be adjusted the way PM's is.
**Fix: item 42.**

---

## 6. EXPLICITLY OUT OF SCOPE

### The palette

**Do not "fix" these. They are the product difference.**

| Token | PM (blue) | CS (green) | Note |
|---|---|---|---|
| `--brand-h` / `--brand-s` | `221` / `83%` (PM `globals.css:28-29`) | `145` / `35%` (CS `:155-156`) | the anchor — every derived variant follows from these two |
| `--primary` light | `var(--plumo-blue)` `#2563EB` | `var(--cs-accent-src)` `#4C9F6E` | |
| `--primary-soft` light | `var(--plumo-mist)` `#EFF6FF` | `var(--cs-soft)` `#EDF4EE` | |
| `--surface-2` / `-3` | `#f4f4f5` / `#e9e9ec` | `#F4F6F5` / `#E8EDE9` | green-tinted neutrals |
| `--border-strong` | `#d4d4d8` | `#CBD5D0` | |
| `--text-3` | `#a1a1aa` | `#8CA093` | |
| `--ring` | `hsl(221 83% 53% / 0.35)` | `hsl(145 35% 46% / 0.35)` | alpha identical — **correct** |
| dark `--bg` / `--surface` / `--text` | `#1a1a1d` / `#232327` / `#fafafa` | `#0B1710` / `#12261A` / `#E7F0E9` | |
| dark `--surface-2` / `-3` | `#2c2c31` / `#38383e` | `#173023` / `#1F3D2C` | |
| `--success` / `--warning` / `--danger` light | | **identical** | already at parity |
| the logo | `PlumoMark` + wordmark | `/assets/marks/mark-primary.svg` | artwork exempt; **position and size are not** — item 33 |

### Colour differences that are load-bearing, not cosmetic

Four places where a colour difference is doing structural work. Read before touching.

1. **`[data-tone]`, CS `globals.css:247-268` (22 rules).** Encodes support-domain semantics —
   ticket status (`st-*`), priority (`pr-*`), SLA (`sla-*`), tags (`tag-*`). PM has no
   analogue because PM has no tickets. **CORRECT-BY-DESIGN. Keep. `TonePill.tsx` too.**
2. **`[data-av]`, CS `globals.css:269-276`.** Six-colour avatar rotation, deliberately
   multi-hue. Keep — but `--av-fg: var(--plumo-night)` at `:140` is a navy *default*, which is
   a leak, not a design. Re-point to `var(--primary)`.
3. **`--epic` `#7c3aed` purple.** Not brand blue and not brand green — it is a *semantic*
   colour for a work-item type. Copy PM's hex verbatim (item 2), do not green it.
4. **`--status-progress-arc` / `--status-done-fill`.** These bind to `var(--plumo-blue)` in PM
   (`globals.css:72, 75`). Copying verbatim gives blue status glyphs in CS. **Re-anchor these
   two to `var(--primary)`** — that is a palette substitution and is in scope.

### Not exempt, despite looking like palette

- **`--cs-btn: #2563EB`** (CS `globals.css:134`, dark `:192` `#3B82F6`) driving
  `nav [data-on="true"]` at `:279` — blue active nav. **A missed re-green, not a decision.** Item 29.
- **`background: var(--plumo-night)`** on the toast (`Overlays.jsx:19`) — navy pill. Item 22.
- **`stroke="#1E3A8A"`** baked into the 7 nav icon SVG assets. Item 31.
- **`h1,h2,h3,h4 { color: var(--cs-brand-ink) }`** (CS `globals.css:297`) — brand-tinting every
  heading is a *rule* PM does not have, not a palette value. Item 7.
- **`a { color: var(--cs-brand) }`** (CS `:296`) — binds links to a different green than
  `--primary`, so links and buttons are two greens in dark mode. Item 7.

---

## 7. OPEN QUESTIONS

Do not guess at these. Each one is a place where PM contradicts itself or where matching PM
would cost CS something real.

**A. Which PM checkbox is canonical?**
`app/design-system/page.tsx:384-388` (the documented reference) shows a bare
`accent-[color:var(--primary)]` with no size, radius or border. `login/page.tsx:245` and
`signup/page.tsx:324` use `h-3.5 w-3.5 rounded-token-sm border` + `borderColor:
var(--border-strong)`. PM ships both. **Recommendation: the login/signup recipe** — it is the
specified one and it is what CS is closest to. Confirm.

**B. `.dark` class or `[data-cs-theme]` attribute?**
PM: `darkMode: 'class'` (`tailwind.config.ts:9`), `.dark` on `<html>`. CS: `darkMode:
['class', '[data-cs-theme="dark"]']` (`tailwind.config.ts:10`), attribute on `<html>`. A
`.dark` class does nothing in CS; a `data-cs-theme` attribute does nothing in PM. Any
stylesheet or component that hardcodes either selector is non-portable between the two.
Neither app uses a single `dark:` variant today, so this only bites on future ports.
**Recommendation: unify on PM's `.dark`.** But CS's attribute also carries `data-cs-soft`,
`data-cs-nav`, `data-cs-rail`, `data-cs-filters` on the same element, so it may be cleaner to
keep the attribute and accept that PM ports need one find-replace. **Your call.**

**C. Does CS get PM's third theme?**
PM offers light / dark / **terminal** (a near-black variant, `globals.css:176-183`, cycled at
`ThemeContext.tsx:83-85`). CS has no terminal variant. Strict parity says add it. It is ~8
lines of CSS. Worth it, or is two themes enough for a support console?

**D. Which switch geometry?**
PM has four and does not agree with itself — `w-11 h-6` (44×24) ×2, `h-5 w-9` (20×36) ×1,
`w-8 h-4` (32×16) in the design-system reference. Item 17 recommends `w-11 h-6` on the
majority. If you would rather fix PM first and then port, say so — it is the one place where
"copy PM" has no single answer.

**E. Search: live field or command palette?**
PM's header search is a **button** that opens a command palette (`Header.tsx:189-214`, `h-7`,
`⌘K` hint). CS's is a **live `<Input>`** with a results popover (`Header.jsx:36-50`,
`h-btn-md`, `!rounded-full`). Matching PM means replacing a working search with a palette CS
does not have — a feature change, not a restyle. Item 32 stops short of it. **Do you want
the palette, or should CS keep live search and only match the geometry?**

**F. Are the mascots "the logo"?**
CS uses `/assets/mascots/mascot-01…07` in six places — empty states (`Queue.jsx:236-256`, at
84px with a `cs-breathe` idle animation), the shortcuts sheet (`Overlays.jsx:112`), the login
success screen (`Login.jsx:315`), and both edge screens (`EdgeScreens.jsx:14, 36`). PM uses
brand blob SVGs from `/brand/empty-states/` at 280×187 via `EmptyState`'s `illustration` prop.
Different illustration family, roughly a third the size, plus an idle animation PM has no
analogue for. **If the mascots are CS's brand identity they are exempt and items 28 and 41
shrink to a size change. If they are not, they go.** This is the biggest open question by
blast radius.

**G. Is the copy voice in scope?**
CS's lowercase-with-`✿` register is a deliberate, consistent authorial choice — 20 flower
glyphs, 92% lowercase placeholders, lowercase nav labels, em-dash reassurance clauses. PM is
Sentence case with zero glyphs and "successfully" everywhere. The instruction exempted the
palette and the logo and nothing else, which reads as "the copy should match." But this is the
one finding where CS's difference is clearly intentional rather than drift. **Confirm before
item 43 — it is ~35 strings and it is not reversible by taste.**

**H. Does CS need i18n?**
PM ships en + fr across 14 namespaces. CS has none. Item 44 is only worth doing if CS will
ship in French, or if item 43 is approved and you want the voice fix as one reviewable file
instead of 35 scattered edits.

**I. Scroll ownership (item 10).**
PM locks `html` and `body` to `overflow: hidden` and delegates all scrolling to the shell. CS
scrolls at the document level. Adopting PM's rule should be a no-op for the in-app views but
will change `Login.jsx`, which is a tall centred page. Do you want CS's login to scroll the
document (as now) or to be a fixed-height centred card (as PM's)?

**J. React version constraint.**
CS is React 19.1 / Next 15.4; PM is React 18.3 / Next 14.2. `react-hot-toast` must be `^2.6.0`
or later on CS, not PM's pinned `^2.4.1` (item 22). Same caution applies to any other PM
dependency you port. Worth confirming there is no plan to align the framework versions first
— if there is, do that before Batch 5.
