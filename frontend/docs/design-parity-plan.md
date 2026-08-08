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

**STATUS 2026-08-08:** items 1–6 all **DONE**, commit `e0f4139`. This batch shipped before
the per-item `✅ DONE` convention that batches 2–10 use, so the markers below were added
retroactively during the final pass; the code was verified present at the time, and again
now. Two items resolved differently from their written instruction, both already recorded:

- **Item 2, `--r-sm`** — not defined. The item's own table says "fix the call site, do not
  define the var", and batch 4 did exactly that (`Login.jsx:183` → `rounded-token`). No
  `var(--r-sm)` reference survives anywhere in the tree.
- **Item 2, `--wash-lilac`** — still an inline `#A78BFA` at `Login.jsx:13`,
  `accept-invite/page.jsx:27` and `reset-password/page.jsx:28`, not repointed at `--epic`.
  Batch 4 declined deliberately: `--epic` is `#7c3aed` in light and only `#a78bfa` in dark,
  so repointing turns the light-mode auth wash deep violet. See the note under item 2.

The other thirteen of the fifteen variables are defined in both themes; the `@layer base { * }`
border rule, the motion layer, the Tailwind animations/ramps and the widened content glob are
all confirmed present in source and in the built stylesheet.

---

#### 1. Add the global border-colour rule — **S** ✅ DONE 2026-08-08

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

#### 2. Define the 15 missing CSS variables — **S** ✅ DONE 2026-08-08 (13 of 15 — see batch status)

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

#### 3. Port PM's motion layer — **M** ✅ DONE 2026-08-08

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

#### 4. Restore the missing Tailwind animations and keyframes — **S** ✅ DONE 2026-08-08

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

#### 5. Restore PM's colour scales in the Tailwind config — **S** ✅ DONE 2026-08-08

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

#### 6. Widen the content glob — **S** ✅ DONE 2026-08-08

**CS** `tailwind.config.ts:9`: `['./components/**/*.{js,jsx,ts,tsx}', './app/**/*.{js,jsx,ts,tsx}']`
**PM** `tailwind.config.ts:4-8` covers `src/pages`, `src/components`, `src/app`.

**After:** add `'./lib/**/*.{js,jsx,ts,tsx}'` and `'./hooks/**/*.{js,jsx,ts,tsx}'`.
**Blast radius:** none today (`lib/utils.ts` holds only `cn()`), but a class string added to
either directory would silently purge.
**Risk:** none.

---

### BATCH 2 — Base element parity
*Still `globals.css` only. These are the rules that decide how untouched HTML looks.*

**STATUS 2026-08-08:** items 7, 8, 9, 11 **DONE**. Item 10 **DEFERRED** — it is Open
Question I and unanswered; see the note under it.

---

#### 7. Fix the base heading and link rules — **S** ✅ DONE 2026-08-08

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

**DONE 2026-08-08.** PM `:207-218` copied verbatim into CS's `@layer base`; the unlayered
`h1,h2,h3,h4` weight/tracking rule, the `--cs-brand-ink` heading colour and the
`a{color:var(--cs-brand)} a:hover{opacity:.8}` pair are all gone. Heading `margin:0` and link
`text-decoration:none` now come from Tailwind preflight, which is where PM gets them.
**The check above only half-lands: the title goes to near-black *500*, not 600.**
`Reports.jsx:30`, `Customers.jsx:23`, `Account.jsx:23` and `EdgeScreens.jsx:16,37` each carry
a literal `font-medium`, and `@layer utilities` outranks `@layer base`, so the base
`font-semibold` cannot reach them. The colour half lands everywhere. **The weight arrives with
item 34** — see the correction noted there.
Side effect: `--plumo-fw-medium` (`:57`) is now defined and unused. Left in place deliberately;
item 46 already schedules the `--plumo-fw-*` pair for deletion.

---

#### 8. Port the scrollbar suite — **M** ✅ DONE 2026-08-08

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

**DONE 2026-08-08.** PM `:549-556` + `:562-600` copied verbatim, `.scrollbar-hidden` included;
the superseded `[data-scroll]` rule removed, the JSX attributes left alone. Confirmed in the
built stylesheet, not just in source. **The Chrome check above is still owed** — nothing in
this batch has been looked at in a browser.

---

#### 9. Hide the native password reveal control — **S** ✅ DONE 2026-08-08

**CS** — absent. **PM** `src/app/globals.css:225-228`:
`input::-ms-reveal, input::-ms-clear { display: none; }`

**Before:** Edge draws its own eye icon next to CS's own toggle at `screens/Login.jsx:238-250`.
**After:** one toggle.
**Blast radius:** 1 (the login password field). **Risk:** none. **Check:** Edge, login screen.

**DONE 2026-08-08.** PM `:225-228` copied verbatim with its comment, placed immediately after
`@layer base` as in PM. The Edge check is still owed.

---

#### 10. Decide the scroll ownership model — **M** ⏸ DEFERRED 2026-08-08

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

**DEFERRED 2026-08-08 — this is Open Question I and the owner has not answered it.** Two
findings that should inform the answer, both established while doing the rest of Batch 2:
- **The in-app half is a no-op, confirmed.** `Console.jsx:1968` already builds
  `height:100vh; display:flex; overflow:hidden`. Locking `html`/`body` changes nothing there.
- **The login half does not survive a straight copy.** PM's counterpart
  (`src/app/login/page.tsx:128`) is `min-h-screen flex flex-col login-bg overflow-y-auto` —
  but `overflow-y-auto` on an auto-height block never opens a scroll container, so once
  `body{overflow:hidden}` lands, anything past 100vh is clipped and unreachable **in PM too**.
  CS's three tall centred pages (`screens/Login.jsx:145`, `app/accept-invite/page.jsx:246`,
  `app/reset-password/page.jsx:131`) are `min-h-screen … overflow-hidden` and would clip the
  same way. Adopting PM here means either accepting the clipping or giving those wrappers a
  definite height (`h-full overflow-y-auto`) — **a fix PM does not have.** That makes this a
  "fix PM first" call rather than a port, which is a third option Open Question I does not
  currently offer.

---

#### 11. Align the reduced-motion block — **S** ✅ DONE 2026-08-08

**CS** `app/globals.css:117-123` — `0.001ms`, no `scroll-behavior`.
**PM** `src/app/globals.css:527-536` — `0.01ms` and `scroll-behavior: auto !important`.

Trivial; do it while you're in the file. **Blast radius:** reduced-motion users only.

**DONE 2026-08-08.** `0.001ms` → `0.01ms` ×2, `scroll-behavior: auto !important` added, and the
block moved to sit directly after `.interactive` to match PM's position at `:526-536`.

---

### BATCH 3 — Theme and density plumbing
*Without this, CS dark mode is unreachable by users and half the audit findings cannot be
verified.*

**STATUS 2026-08-08:** items 12 and 13 **DONE**. Open Question B answered in PM's favour
(`.dark` class). Open Question C **still open** and deferred with a reason — see under item 12.

---

#### 12. Add a ThemeProvider — **M** ✅ DONE 2026-08-08

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

**DONE 2026-08-08.** `contexts/ThemeContext.tsx` is PM's file: same `Density` union, same
`plumo_density` key, same `theme` key, same `prefers-color-scheme` bootstrap, same effects,
same `data-density` removal at `comfortable`. Mounted at `app/layout.jsx` around `{children}`.
Three deliberate differences, all noted in the file:

- **Open Question B — answered PM's way.** CS is now on `.dark`. `darkMode: 'class'` in
  `tailwind.config.ts:15`; `[data-cs-theme="dark"]` → `.dark` at `globals.css:203`, and the two
  descendant rules (`[data-tone]`, `[data-av]`). `data-cs-nav/-rail/-filters` stay attributes —
  Console still owns those and still stamps them in `syncDoc()`.
- **Open Question C — still open, and now has a blocking reason.** PM's `terminal` overrides
  six tokens only: `--bg`, `--surface`, `--surface-2/-3`, `--border`, `--border-strong`. In CS
  those reach the ported primitives but **not** `components/screens/*`, which run on
  `--cs-canvas` / `--cs-surface` / `--cs-border`. A verbatim port therefore repaints the
  buttons, inputs and modals near-black while the shell, queue and rails stay green. Making it
  whole needs a parallel near-black `--cs-*` ramp that PM has no source for — invention, not a
  port. **Terminal is cheap only after item 46 retires `--cs-*`.** `Theme` is `'light' |
  'dark'` and the cycle is two-state until then; the class swap already clears `terminal`.
- **The no-flash script is a raw `<script>`, not `next/script`.** PM's `beforeInteractive`
  pattern (`src/app/layout.tsx:120`) does not survive the version gap: on Next 15 an *inline*
  `beforeInteractive` script is serialised into the RSC flight payload, so it runs after first
  paint. Verified in the built HTML — the tag landed at index 1586, past `</head>` at 1014,
  inside a `self.__next_f.push`. `app/layout.jsx` uses `dangerouslySetInnerHTML` as the first
  child of `<body>`, which emits a parse-time script at index 1077. Same snippet either way.

Console (`components/Console.jsx`) is a class, so it reads the provider through
`static contextType = ThemeContext` — hence the one additive export PM does not have,
`export const ThemeContext`. `state.theme` / `state.soft` are gone, `syncDoc()` no longer
writes `csTheme` / `csSoft`, and `app/page.jsx` no longer passes `theme=` / `softness=` (those
props seeded the old state and would have fought persistence).

Every `this.context` access is null-guarded. The suites build consoles with `new Console({})`
and call handlers on the instance rather than rendering, so `this.context` is undefined under
test; guarding only the readers would have left `toggleTheme` / `cycleDensity` rendering fine
and then throwing on the first click.

**Check performed, in Chrome at localhost:3000.** Fresh load with no stored theme and OS dark
→ `<html class="dark">`, `body` background `rgb(11,23,16)`, `--primary` `hsl(145 35% 62%)`
(green, not PM's sky), then persisted as `theme=dark`. Reload with `theme=dark` stored → class
present at parse time, no light frame. Driving the live Console instance's `toggleTheme()`
flipped `dark → light` and rewrote localStorage. The provider reaches the class component:
`this.context` carries all five members. Backend was not running, so the checks were done on
the sign-in screen — **the in-app toggle call sites (`Header.jsx:135`, `Sidebar.jsx:115`,
`Account.jsx:53`) have not been clicked by hand.**

---

#### 13. Unify the density attribute — **S** ✅ DONE 2026-08-08

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

**DONE 2026-08-08.** PM `globals.css:106-111` copied verbatim — `:root[data-density='compact']`
0.85 / `:root[data-density='relaxed']` 1.15, in PM's position between `:root` and the dark
block. `[data-cs-soft="dense"|"soft"]` gone, and `[data-cs-soft="dense"] [data-snip]` →
`:root[data-density='compact'] [data-snip]`. The attribute is written by ThemeProvider, not by
`Console.syncDoc()`, and is *removed* at `comfortable` rather than set to a value that matches
no rule — which was the old `balanced` bug.

The second re-scaling set is cut to `--cs-rowpy` alone, as specified. `--cs-fs`, `--cs-r-sm`,
`--cs-r-md`, `--cs-gap`, `--cs-cardpad` and `--cs-qcols` no longer move with density — so type
size, radius, gaps, card padding and the queue column track are constant across all three
steps and only the `--density` multiplier plus row padding respond. Note this is a wider cut
than "type size and radius": `--cs-gap`, `--cs-cardpad` and `--cs-qcols` went too, on the
literal reading of "keep `--cs-rowpy` only" and PM's "vertical rhythm only". The visible
consequence is that `relaxed` and `compact` no longer widen or narrow the queue columns.

Vocabulary reached the call sites: `Console.SOFT` → `DENSITIES = ['compact', 'comfortable',
'relaxed']`, `V.softLabel` → `V.densityLabel`, `V.cycleSoft` → `V.cycleDensity`, updated at
`screens/Queue.jsx:109,113` and `screens/Account.jsx:57`. **Those two buttons now read
"comfortable" / "compact" / "relaxed" instead of "balanced" / "dense" / "soft"** — a user-facing
copy change, which the density item necessarily implies.

**Check performed.** `data-density="compact"` → `--density: 0.85`, `--cs-rowpy: 4px`;
`relaxed` → `1.15` / `17px`; `--cs-fs` stayed `13.5px` in both, confirming the type-size fork
is gone. Cycling through the live Console's `cycleDensity()` advanced the attribute and
persisted it to `plumo_density`. **The Queue itself was not seen** — no backend — so "buttons,
rows and nav items scale together" is verified at the token level, not visually.

---

### BATCH 4 — Route the controls through the primitives
*Each item here fixes many screens at once because it deletes a local re-implementation.*

**STATUS 2026-08-08:** items 14–21 all **DONE**. Open Question A answered in the login/signup
recipe's favour, Open Question D answered `w-11 h-6` — both per the items' own
recommendations. Nothing was seen in a browser; the checks below are still owed.

*Review pass, same day:* three fixes on top of the batch as delivered. `Switch` was a `<label>`
and Account nested it inside another one — invalid HTML that double-toggles; it is now a
`<span>` and both call sites supply the label, matching PM (item 17). `CHECK_LABEL` said `flex`
where PM says `inline-flex`. Settings' editor check-rows had `CHECK_LABEL`'s string copied out
by hand instead of importing it, which is the duplication item 16 exists to end. Build and 87
tests green before and after; no colour moved.

---

#### 14. Replace eight hand-rolled icon-button geometries with `size="icon"` — **L** ✅ DONE 2026-08-08

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

**DONE 2026-08-08.** All nine rows of the table above are gone; 14 call sites now render
`<Button size="icon">`. `outline` where the old shape had a ring (Queue add-filter and refresh,
Ticket back / overflow / rail, Reports drill close, Header's `IconButton`, Settings deactivate),
`ghost` where it did not (Queue's three row quick-actions and the bulk-bar close, Ticket's four
composer format buttons) — **that is `ghost`'s first use in CS, 0 → 8.** The `QUICK_BTN`,
`TOOL_BTN` and `ICON_BTN` constants are deleted, as is Header's `!w-[30px] !h-[30px]
!rounded-token-sm` override and Ticket's `!rounded-token-sm` on the rail toggle. Every one of
them is now 32×32 × density, `rounded-full`, focus-ringed and press-scaled.

Three notes:
- **The dashed border is gone** from Queue's add-filter button, per "PM has no dashed button".
  Ticket's `+ add` tag chip is still dashed — it is not in the table above and not an icon
  button. Left alone.
- **The bulk bar keeps its own colours.** It is a dark surface, so `ghost`'s `text-fg-2` /
  `hover:bg-surface-2` are overridden there with `!text-white/70 hover:!bg-white/15`. Geometry,
  press and focus ring are the shared ones; only the foreground pair is local.
- **`Settings.jsx` is one call site, not thirty.** The deactivate control named in the table is
  converted (via `buttonVariants({ variant: 'outline', size: 'icon' })`, matching how that file
  already borrows `editBtn`). The other ~30 raw `<button>`s there are item 47, as specified.

**One thing this item hands us, flagged not fixed.** PM's `icon` size is `h-btn-md w-8` — the
height is a token, the width is a literal 32px. In PM those are both 32 and it is a circle. In
CS `.h-btn-md` is `calc(32px * var(--density))`, and `--density` is 0.85 / 1 / 1.15, so at the
two non-default densities every icon button is now an oval: 27×32 at compact, 37×32 at roomy.
The nine shapes deleted above were all explicitly square (`w-7 h-7`, `w-8 h-8`, `w-[26px]
h-[26px]`, `w-[30px] h-[30px]`) and so survived the density switch; with 14 call sites the
lozenge is now visible across the app. **Copying PM's string is correct and that is what is
committed** — `Button.tsx` is byte-identical to PM's and no batch-4 item touches it. But PM's
value encodes an intent (a square) that CS's density feature breaks, and the fix is a
one-token change (`w-8` → a `w-btn-md` utility). That is a primitive-level decision with an
owner, not something to slip into a batch, so: **owner call, and the first thing to look at when
these are finally seen in a browser at compact density.**

---

#### 15. Restore `focus-ring` on the 10 focusable elements that lack it — **S** ✅ DONE 2026-08-08

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

**DONE 2026-08-08.** 14 landed first, so `QUICK_BTN` and `TOOL_BTN` disappeared into `<Button>`;
the other eight constants each gained `focus-ring`. Two more focusables not on the list got it
while the files were open — Ticket's `unassign` row and its canned-response rows, both of which
are keyboard-reachable menu items with the same defect.

---

#### 16. One checkbox definition — **S** ✅ DONE 2026-08-08

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

**DONE 2026-08-08. Open Question A answered: the login/signup recipe,** per the recommendation
and the standing "PM is correct by definition" rule. `components/common/formControls.ts` exports
`CHECKBOX` (`h-3.5 w-3.5 rounded-token-sm border accent-[color:var(--primary)]`),
`CHECKBOX_STYLE` (`{ borderColor: 'var(--border-strong)' }`), `CHECK_LABEL` and `RADIO` — all
four copied from PM verbatim. All five definitions are deleted. **The `--cs-brand` accent fork
is gone from the tree entirely**; `grep 'accent-' components/screens/` returns nothing but the
shared constant.

Two consequences worth knowing:
- **Only three of the five sites still take a checkbox.** Account's notification rows and
  Settings' business-hours days became switches under item 17. The recipe is live at Queue (row
  select, select-all, facets), Login (keep me signed in) and Settings' editor check groups.
- **PM's recipe has no `cursor-pointer`** — PM puts it on the enclosing `<label>`. Queue's
  select-all and per-row checkboxes are bare inputs with no label, so they lose the pointer
  cursor. Copied verbatim rather than improved, per the standing rule; flagging it because it is
  the one place the copy is a small step backwards.

Label rows standardised on PM's `text-[12px] text-fg-2` at all three named sites.

---

#### 17. Add a switch/toggle and a radio — **M** ✅ DONE 2026-08-08

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

**DONE 2026-08-08. Open Question D answered `w-11 h-6`,** the majority geometry, per this item's
recommendation. `components/common/Switch.tsx` is 44×24 track / 20px knob / `translate-x-5`,
`--surface-3` off and `--primary` on, white knob — the timer page's track and knob, plus the
focus ring (`peer-focus:ring-2 peer-focus:ring-[color:var(--ring)]`) that the three row-shaped
PM implementations carry (`ProjectSettingsTab`, `AdminSettingsSection`,
`NotificationPreferencesSection` — identical string in all three; only the timer page omits it).
`role="switch"` and a `disabled` state are additive; `grep 'role="switch"'` over CS returned
zero before this.

**The wrapper is a `<span>`, not a `<label>` — deliberately, and this is load-bearing.** PM
writes the switch two ways: the whole row is a `<label>` and the switch a plain box
(`NotificationPreferencesSection`, `AdminSettingsSection`), or the row is a `<div>` and the
switch is its own `<label>` (timer page, `ProjectSettingsTab`). It never nests one in the other,
because nested `<label>`s are invalid HTML and the inner click bubbles to the outer, which
forwards it to the same input and toggles it a second time — a switch that visibly does nothing.
Account had exactly that shape until it was caught in review. So `Switch` renders no label of
its own and **must sit inside one**: Account's row is PM's `<label>` row, and Settings' hours
grid wraps it in a `<label>` of its own (that cell was a `<span>`, so this also gains it the
click-anywhere-on-the-cell target it never had).

Both call sites converted, and **Account's notification card now uses PM's own row**
(`flex items-center justify-between p-3 rounded-token-sm hover:bg-surface-2 …` with a
`text-sm text-fg-2` label, copied from `NotificationPreferencesSection.tsx:41-43`). CS's
on/off label-tinting is dropped — PM does not have it, and with a switch beside the label it was
saying the same thing twice.

`RADIO` ships as a constant in `formControls.ts` with **no call site** — CS still has zero
`type="radio"`. It is there so the next radio is not a sixth invention.

---

#### 18. Invert the secondary-button convention: `secondary` → `outline` — **M** ✅ DONE 2026-08-08

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

**DONE 2026-08-08.** All 25 `variant="secondary"` call sites are now `outline`, plus a 26th the
count missed: `Settings.jsx`'s `editBtn()` helper, which is `buttonVariants({ variant:
'secondary' })` and drives every edit/revoke button on that screen. **`grep 'variant="secondary"'
components/screens/` returns nothing.** `ghost` arrived with item 14 (8 uses). The tally is now
`outline` 33 / `ghost` 8 / `secondary` 0, against PM's 111 / 40 / 45 — CS has no `secondary`
left at all, where PM keeps 45; if any of those 25 wanted a filled chip, this is the item that
took it away, and the Ticket-header comparison above is where it would show.

---

#### 19. Drop the login geometry overrides — **S** ✅ DONE 2026-08-08

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

**DONE 2026-08-08.** `h-[44px]`, `!rounded-[10px]` and `text-[14px]` are gone from all three
`<Input>`s; `Federated` is now `<Button variant="outline" size="md" className="w-full
justify-center">` — PM's `login/page.tsx:145-170` exactly — with the provider glyph moved to
`leftIcon`; both `size="lg" … h-[44px] rounded-[10px] text-[15px]` submit buttons are
`size="md" className="w-full justify-center"`, PM's `:258-266`. `grep 'h-\[44px\]\|rounded-\[10px\]'`
over `Login.jsx` returns nothing. **The login page is now markedly tighter — 32px controls, 3px
radius, 13px type — and that is the intent.**

**PM's login shows form-level errors as a banner, not via `error=`** (`login/page.tsx:180-192`),
so CS's `loginError` banner stays a banner. That is a finding for item 21, not a gap here.

**Two batch-1 leftovers found in this file** (item 2 said to fix both call sites and neither was):
- `rounded-[var(--r-sm)]` at `:183` — the undefined-variable typo. **Fixed** to `rounded-token`
  (= `--radius`, 6px, and PM's own error-banner radius). It was resolving to nothing, so that
  banner had square corners.
- `--wash-lilac: #A78BFA` at `:12` — **still there, deliberately.** Item 2 says to point it at
  `var(--epic)` now that `--epic` exists, but `--epic` is `#7c3aed` in light and only `#a78bfa`
  in dark. Repointing turns the login wash's top-right glow deep violet in light mode, which is
  a visible colour change and reads like an oversight in the instruction rather than an
  intention. **Left for whoever owns item 2 to confirm.**

---

#### 20. Restore the Ticket composer's input chrome — **S** ✅ DONE 2026-08-08

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

**DONE 2026-08-08, taking the flush-inside-the-card concession — saying so here as instructed.**
The className is now `!border-none !bg-transparent !rounded-none` and nothing else. The card
already paints the border, radius and fill, so those three stay; **`focus:!shadow-none` is
gone**, and so are `text-[14px]`, `p-3.5`, `min-h-[96px]` and `leading-relaxed`. The composer is
now `min-h-textarea` (72px × density, so it responds to the density switch — it did not before),
`px-2.5 py-2`, `text-[13px]`, and it shows a focus ring. It is a visibly smaller box: 96px → 72px
at comfortable, and 14px → 13px type on the surface agents write on all day. That is the item as
specified, but it is the change in this batch most likely to draw a complaint.

---

#### 21. Wire the `error=` prop into CS forms — **M** ✅ DONE 2026-08-08

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

**DONE 2026-08-08.** `error=` is reachable at last — `grep 'error='` over
`components/screens/` now returns three sites where it returned zero.

- **New-conversation modal.** `Console.jsx:806-816` no longer toasts its two validation
  failures; it sets `newError: { field, text }`, which `renderVals` splits into
  `newSubjectError` / `newCustomerError` for the `<Input>` and the `<Select>`. Typing in either
  field clears it. The complaint now sits under the field it is about and stays there while the
  field is being corrected, instead of drifting away on a 3.6s timer.
- **`fieldInput()` is deleted, not completed** — the plan offered both and deleting was the
  cheaper correct one. Its three call sites (holiday date, api-key name, inbound address) are
  `<Input>` now, which brings back the missing `disabled:` line — **a disabled field in Settings
  looked enabled until today** — and the error border. Passing `label=` to `<Input>` also
  retires the two hand-rolled labels at the old `:434,540` (12.5px / 400 / `--text-2` / 6px) for
  PM's `block text-xs font-medium text-fg mb-1`.
- **The inbound-address banner is now `error={V.inboundError}`** on the field itself. The save
  button beside it gets `mt-5` so its top edge meets the field's rather than the label's.
- **Login keeps its banner** — PM does too, see the note under item 19. Not a gap.

**Not done, and not in this item's list:** the invite modal's `inviteError` is still a banner
above the field, though "that address doesn't look quite right" is as field-level as they come.
Its other message is a server error that may not be about the address at all, which is why it
was left. Worth a line in item 47 or a follow-up.

---

### BATCH 5 — Overlays, feedback, motion
*Depends on Batch 1 item 3.*

**STATUS 2026-08-08:** items 22–28 all **DONE**, commit `bd9b4dd`. Build clean,
87 tests green. Most of this batch *was* seen in a browser — see the per-item
notes — but the ticket screen itself was not, because there is no backend on
this machine.

*Recovery note, same day.* The agent that ran this batch died mid-run and the
tree it left behind did not work. Four defects were found and fixed before the
commit; they are worth knowing because three of them would have passed a build:

- **`Sidebar.jsx` used `<Dropdown>`/`<DropdownItem>` without importing them.**
  `next build` passes — an unbound identifier in JSX is a runtime
  `ReferenceError`, and `.jsx` files are outside `tsc`'s reach. The sidebar
  renders on every in-app screen, so the whole console was a white page. Found
  by *running* it, not by building it. (Item 28's own error route is what
  reported it, which is the item verifying itself.)
- **`Overlays.jsx` still rendered the hand-rolled toast and confirm** against
  `V.toasts` / `V.hasConfirm`, which item 22 and item 26 had already deleted
  from `renderVals()`. `V.toasts.map` on `undefined` — a crash on first render.
- **Five setters had been called with a value and left reading an event.**
  `Queue.jsx` and `Ticket.jsx` were converted to `V.setSort(o.id)` etc.;
  `Console.jsx` still had `setSort = (e) => e.currentTarget.dataset.v`. Every
  status, priority, team, tag and sort change would have thrown on click.
- **`V.statusMenuRef` / `V.tagMenuRef` were referenced and never defined**, and
  the ticket overflow menu still had an "add a tag" row that could no longer
  open anything.

Items 23 (Header's two panels), 27 (the `loading` half), 28 (all of it) and the
copy consequences below had not been started at all and were finished in the
same pass.

---

#### 22. Replace the hand-rolled toast with `react-hot-toast` — **L** ✅ DONE 2026-08-08

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

**DONE 2026-08-08.** `react-hot-toast@^2.6.0`, per the note above — not PM's `^2.4.1`.
`components/layout/RootLayoutClient.jsx` is PM's `RootLayout.tsx:50-97` minus the three
services CS has no equivalent of (i18n, achievements, changelog); the `<Toaster>` options are
PM's `:57-94` verbatim. The `<Toaster>` lives there rather than in `app/layout.jsx` as this
item guessed, because `DialogProvider` has to wrap `{children}` and both belong in the same
client boundary — which is also where PM puts them.

`Console.toast(text, tone)` **survives as a method** rather than ~40 call sites becoming
`toast.success(...)` / `toast.error(...)` directly. It is one line (`tone === 'bad'` → error,
else success), it keeps the console's two-tone vocabulary at the call sites, and — the reason
that matters — the test suites replace `c.toast` with a log to assert what was said. Forty
direct library calls would have taken that seam away. `state.toasts`, the 3600ms timer and
`Overlays.jsx:12-25` are all deleted.

**Check performed, in Chrome.** Success and error toasts, measured on the live DOM: container
`top: 16px; right: 16px; z-index: 9999`; toast `max-width: 350px`, `padding: 10px 14px`,
`border-radius: 6px`, `shadow-modal`; success `background: --success-soft` / `color:
--success` → `rgb(62,204,142)`, error `--danger-soft` / `--danger` → `rgb(240,138,122)`.
Both resolve through tokens in the dark theme, so **the toast is theme-aware and green, and
the navy is gone.** Duration 4000 is configured but not sat through.

---

#### 23. Adopt the shared `Dropdown` primitive — **L** ✅ DONE 2026-08-08

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

**DONE 2026-08-08.** `Dropdown` went from 0 imports to 7 instances: the queue sort menu, the
sidebar user card, and the ticket header's status, priority, team, overflow and tag menus.
The eight `V.*Open` flags and seven `openXMenu` handlers this item predicted could be retired
are retired; `state.menu` now carries only `assignee`, `canned`, `notif` and `search`.

**Five of the twelve instances stayed hand-rolled, deliberately, and this is the shape of the
answer rather than a shortfall.** The assignee picker and the canned-response list each have a
search field, and `Dropdown` has no room for one — PM hand-rolls its own searchable popovers
(`AssigneePopover`) for exactly this reason. `Header.jsx`'s two panels are not menus at all:
one is a grouped search-result list, the other has a header row and a "mark all read" action.
What all five give up is their *own chrome*: a shared `PANEL` constant in each file supplies
`top-full mt-2` (8px, not the 7/8/9px they each picked), `z-dropdown` (10, not `z-popover` 60),
`shadow-card` (not `shadow-modal`), and `animate-dropdown`. They also gain `role="menu"` /
`role="menuitem"` and `focus-visible:bg-surface-2`.

Two consequences that are user-visible and that a reader should not rediscover the hard way:

- **`Dropdown` does not close when you pick an item.** It closes on outside `mousedown`, or on
  Escape while the trigger has focus. That is PM's behaviour — `IssueSidebar.tsx:194` picks a
  status the same way — and `Dropdown.tsx` is byte-identical to PM's, so it was copied rather
  than improved, the same call item 14 made about the `w-8` oval. The old CS menus all closed
  on select (`patch()` set `menu: null`), so this *is* a regression in feel, and it is the
  first thing likely to be questioned. Fixing it is a one-line change in the primitive and
  belongs to the owner, not to a batch.
- **One menu can no longer open another.** The ticket overflow menu's "add a tag" row opened
  the same menu the rail's `+ add` chip opens, via `state.menu`. With the open state inside the
  primitive there is no way to reach it, so **that row is gone**; the rail chip is the single
  entry point.

Also load-bearing: **five console setters now take a value, not an event.** `setSort`,
`setStatus`, `setPriority`, `setTeam` and `addTag` were `(e) => e.currentTarget.dataset.v`, and
`DropdownItem` hands `onClick` no element to read. PM calls them the same way
(`IssueSidebar.tsx:194`, `onClick={() => onStatusChange(opt.id)}`). The three that still read
the dataset — `setAssignee`, `setAssigneeFilter`, the facet toggles — are the panels that
stayed hand-rolled. The split is commented in `Console.jsx`.

Triggers are `<span>` carrying `buttonVariants(...)`, not `<Button>` — `Dropdown` renders its
own `<button>` and nesting one inside it is invalid markup. PM's real call sites do the same
(`IssueHeader.tsx:136`, `ProjectToolbar.tsx:859`); only PM's Storybook story nests a `<Button>`.

**Check performed, in Chrome, on the live queue sort menu.** `animation: dropdown-in 0.15s`,
`transform-origin: top`, `z-index: 10`, `min-width: 200px`, panel `padding: 4px 0`, items
`padding: 8px 16px` at `14px` — PM's column of the table above, value for value. Escape and
outside-click both close it. Selecting an item ran `setSort('priority')` with no error and
updated the trigger label, which is the fix for the dead handler described in the recovery
note. The sidebar card was confirmed to open *upward* (`mb-2`, `mt-0`) via the wrapper
override. **The ticket header's five menus were not clicked** — no backend — but they are the
same primitive with the same call shape.

---

#### 24. Retire the `[data-anim]` motion vocabulary — **S** ✅ DONE 2026-08-08

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

**DONE 2026-08-08.** `@keyframes cs-in`, `cs-shimmer` and `cs-spin` are deleted along with all
three `[data-anim]` rules; `cs-breathe` stays, as specified, and is still the mascot idle in
`Overlays.jsx`. Every `data-anim` attribute went with them — the ~10 menu/popover ones with
item 23, the toast with item 22, `Queue.jsx`'s spinner with item 27, and the last two
(`Reports.jsx:51` drill panel, `Settings.jsx:466` API-key reveal) here. Neither of those two is
a menu, so both took `.animate-fade-in` — PM's `fade-in var(--dur) var(--ease-out) both` —
rather than a dropdown animation. `grep 'data-anim' components/` returns nothing.

**Check performed.** The queue sort menu's computed `animation-name` is `dropdown-in` and its
`animation-duration` is `0.15s`, with no second animation on the element. Item 3's warning
about double-animating between items 3 and 24 never applied: they landed in different batches
and nothing shipped in between with both.

---

#### 25. Add a drawer primitive — **M** ✅ DONE 2026-08-08

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

**DONE 2026-08-08.** `components/common/Drawer.tsx` is `DayDetailDrawer:73-118` generalised:
same backdrop (`bg-black/40 backdrop-blur-[1px] animate-fade-in`, the lighter blur), same
`w-full sm:w-[420px]` panel at `z-modal` with `border-l` and `shadow-modal`, same 48px header
with the 10px mono `tracking-[0.14em]` eyebrow over a 14px semibold title and a `size={16}`
close glyph, same `flex-1 overflow-y-auto` body, same window-keydown Escape, backdrop click and
`useBodyScrollLock(open)`. `.animate-slide-in-right` and its keyframe were copied byte-for-byte
from PM `globals.css:685-706`; note they live *outside* the tailwind `animation` map in PM too,
so item 4's `slide-in` entry is a different class and this item did not need it after all.

The shortcuts sheet is the first caller. Its hand-drawn 17px title and subtitle became the
drawer's eyebrow and title, and **the two shortcut groups stack instead of sitting in
`grid-cols-2`** — two columns inside 420px would have been about 190px each, which the
`<Kbd>j</Kbd><Kbd>k</Kbd>move through the list` rows do not fit.

**Check performed, in Chrome.** Opened it and measured: `position: fixed`, `width: 420px`, full
viewport height, right-anchored, `animation: slide-in-right 0.3s`, close button present with
`aria-label="Close"`, `aria-modal="true"`, `document.body` overflow `hidden` while open and
`visible` after. Escape closed it. **The animation itself could not be watched** — the browser
pane was not compositing frames, so `getAnimations()[0].currentTime` stayed at 0 and every
animated element measured mid-flight. That is a harness limit, not a defect; the end state is
correct because the keyframe's `to` is the element's natural state and needs no fill mode.

---

#### 26. Replace ad-hoc confirms with a dialog service — **M** ✅ DONE 2026-08-08

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

**DONE 2026-08-08.** `contexts/DialogContext.tsx` is byte-identical to PM's (`diff
--strip-trailing-cr` returns nothing), mounted inside `RootLayoutClient`. Six call sites, not
eight: `navTo`'s unsaved-draft guard, `bulkClose`, `askDelete`, `askSpam`, `revokeInvite`,
`askDeactivate`. All six became `async` — awaiting a promise instead of stashing an `action`
callback is what this item actually is, and `state.confirm`, `confirmOk`, `confirmCancel`,
`askMock` and five `V.confirm*` keys are gone with it.

**`this.confirm` is a prop, not context.** `Console` is a class and spends its one
`contextType` on the theme (item 12), so `app/page.jsx` reads `useConfirm()` and passes it
down. `Console.confirm` falls back to `Promise.resolve(false)` when the prop is absent, which
is both the safe default and what lets the suites construct `new Console({})` and drive the
handlers directly.

**The `warn` → `danger` mapping is per call site, on PM's rule, not blanket.** PM sets `danger`
for what cannot be undone and omits it for what can — `users/page.tsx:426` (remove user) vs
`:454` (reactivate). So: delete, mark-as-spam, revoke, deactivate and the unsaved-draft guard
are `danger: true`; **`bulkClose` is not**, because closing conversations is reversible and its
own copy says "they can reopen anytime — nothing is final here". A first pass had all six red.

`cancelLabel: 'keep it as is'` is passed at every call site. Without it the provider's default
is PM's `'Cancel'`, which would have read as `Cancel` beside `mark spam` in the same footer.
Copy voice is batch 9's decision; this only avoids introducing a mixed footer here.

**Check performed, in Chrome.** Drove the live provider with the "mark as spam" options: the
dialog rendered with the title and body, the confirm button computed to `background:
rgb(240,138,122)` — `--danger`, **red, which is the bug this item names** — and the cancel
button to a transparent outline. Clicking cancel resolved the promise `false` and unmounted the
dialog. `ConfirmDeleteModal.tsx` is still a dead port; it stays with item 45 as written.

---

#### 27. Unify the spinners and use `Button loading` — **S** ✅ DONE 2026-08-08

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

**DONE 2026-08-08.** `Queue.jsx:91`'s 11px CSS ring is `<LoadingSpinner size="sm" />` — the
16px SVG at 1s that CS had ported and never rendered. That was the last `data-anim="spin"`, so
`cs-spin` went with it under item 24, exactly as this item predicted.

`loading` is passed for the first time in CS, at five buttons: the reply composer's three sends
(`send`, `send & set pending`, `send & resolve` — `V.sending` had existed since the composer
was written and *nothing displayed it*), the invite submit, and the record-editor submit.
`loading` also disables, so a second click cannot post the same reply twice.

**PM's shape for this is a still label plus a spinner** (`EditProjectMemberTagModal.tsx:154`,
and 20-odd more), not a label that changes. So the two Settings buttons that read
`{V.inviteBusy ? 'sending…' : 'send the invitation'}` now read `send the invitation` with the
spinner beside it. **That is a small copy loss, taken on purpose** — the words no longer move
under the cursor.

**Two sites deliberately not converted.** `Settings.jsx`'s `generate key` and `save inbound
address` are raw `<button className={primaryBtn()}>`, part of the ~30 that item 47 owns; and
the new-conversation submit has no busy flag in the console to pass. **`send reply` on a slow
connection was not clicked** — no backend.

---

#### 28. Add the boot loader and the error routes — **M** ✅ DONE 2026-08-08

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

**DONE 2026-08-08, both halves.**

**(a)** `components/common/LogoLoader.tsx` carries PM's structure: the masked 48px grid wash,
the `w-[260px]` stack, the 44/56/72px `primary-soft` tile with a `primary-soft-border` hairline,
the 10px mono `tracking-[0.14em]` uppercase status line with its pulsing dot, and the 4px rail
on `--surface-3` driven by `.plumo-loader-progress-bar` (copied byte-for-byte from PM
`globals.css:295-310`). `renderVals()` gained `isBooting`, and `isLogin` / `inApp` are now both
gated on `booted` — before this the console *guessed* "signed in" and drew the whole shell
against empty data while the bootstrap was in flight.

**Two adaptations, not ports.** PM's loader reads the tenant's uploaded logo out of
`WorkspaceContext` with a localStorage cache and falls back to `PlumoAnimatedIcon`; CS is one
desk with one mark, so it renders `/assets/marks/mark-primary.svg` directly — and the mark is
the logo, which is the one thing parity exempts. PM's `fullPage` variant portals over the app;
CS shows the loader *instead of* the shell, so there is nothing to portal above, and the
`createPortal` branch is not ported. The workspace-name line is omitted rather than filled with
a constant.

**(b)** `app/error.jsx`, `app/not-found.jsx` and `app/global-error.jsx`, all three from PM's
originals, all three rendering `ErrorScreen` (which is now rendered for the first time).
`EdgeScreens.jsx` is untouched and stays — it is the in-shell "this conversation is gone" /
"that action failed" pair, which is a different thing from a route that never resolved. The
`24px/500` vs `22px/600` comparison above is therefore still open and belongs with whatever
item eventually reconciles the two; these routes are `ErrorScreen`'s geometry as shipped.

**Colour, and why the illustrations are not PM's.** PM's `public/brand/empty-states/plumo-404.svg`
and `plumo-500.svg` are drawn in `#60A5FA` / `#EFF6FF` / `#1E3A8A`. Copying them would have put
PM's accent blue on a full-screen surface — the one mistake the owner sees instantly. The
routes use CS's own mascots instead (`mascot-05-waiting` for 404, `mascot-03-empathetic` for
500, matching what `EdgeScreens.jsx` already chose). `global-error.jsx` is the one file in the
tree that legitimately needs literal hex — it renders when the layout that imports
`globals.css` is the thing that failed, so no custom property is guaranteed to resolve — and it
uses `#4C9F6E` and `#1F4A2E` where PM writes `#2563EB` and `#1E3A8A`.

**Check performed, in Chrome, and this one verified itself.** Forcing the shell to render
against a null adapter threw, and **`app/error.jsx` caught it and rendered `ErrorScreen`** —
500 badge, CS copy, both actions, and the collapsible details panel, which is how the missing
`Dropdown` import in `Sidebar.jsx` was found in the first place. The card measured
`max-width: 480px`, `border-radius: 6px`, `h1` 22px/600, buttons on `--primary` green. The boot
loader was driven by forcing `booted: false`: 56px tile at `--primary-soft` with a
`--primary-soft-border` hairline, 10px mono uppercase at `letter-spacing: 1.4px`, 4px rail on
`--surface-3`, bar `--primary` green running `plumo-loader-progress 3.6s forwards`. No blue
anywhere. `global-error.jsx` was **not** exercised — it needs the root layout itself to throw.

---

### BATCH 6 — The shell
*The most-looked-at surfaces. Nothing here depends on Batches 4–5, so it can be interleaved.*

---

#### 29. Fix the blue active nav state — **S** ✅ DONE 2026-08-08

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

**SHIPPED 2026-08-08.** Took the "or better" branch: `--cs-btn` and the `nav [data-on="true"]`
override are both deleted, and the rail no longer reads `[data-on]` at all — item 30 puts PM's
pair at the call site. **Checked in the browser, both themes:** active row resolves to
`#EDF4EE` on `#4C9F6E` in light and `rgba(46,96,67,.38)` on `#7CC098` in dark. A sweep of every
computed `color`/`background`/`fill`/`stroke` on the logged-in console found no blue-dominant
value in either theme; the one that trips a naive filter is `rgb(61,39,104)`, a `UserAvatar`
hue from the pre-existing avatar ramp.

---

#### 30. Rebuild the nav item on PM's geometry — **M** ✅ DONE 2026-08-08

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

**SHIPPED 2026-08-08.** Every row of the table above, plus the structural change: the two
section headings are gone and the rows sit in PM's `flex-1 overflow-y-auto py-2` +
`px-2 space-y-0.5` pair (`Sidebar.tsx:446,461`). `SECTION` and `NAV_ROW_STYLE` deleted. The
trailing count `Badge` is **kept** — PM's badge in that slot is a red `--danger` pip and would
mis-signal an ordinary inbox count. **Measured in the browser at 1280×900:** rows 38px tall /
14px / 500 / `px-3` / `gap-3` / 6px radius, 2px apart, active pill 3×20 at the row's left edge;
the nav's scroll region is 765px against a 765px scrollHeight and the user card lands at
821–900, i.e. fully on screen. At ≤1180px the labels, the count and the pill all go with
`[data-navlabel]` and the rail sits at 64px.

*Measuring note for whoever verifies the next batch:* the Browser pane reports
`document.visibilityState === 'hidden'`, so CSS transitions never advance and
`getComputedStyle` returns the pre-transition value for anything carrying `transition-colors`
or `transition-[width]`. The rail reads 64px wide and the wrong theme's colours until you
inject `*{transition:none !important}`. That is an instrumentation artifact, not a defect —
don't file it as one.

---

#### 31. Replace the `<img>` nav icons with inline `currentColor` SVG — **S** ✅ DONE 2026-08-08

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

**SHIPPED 2026-08-08.** All seven live in `components/screens/glyphs.jsx` as inline SVG at
`strokeWidth="2"` on `currentColor`; all nine `<img src="/assets/icons/*">` call sites across
`Sidebar.jsx`, `Queue.jsx` and `Ticket.jsx` converted. The `.svg` files stay in `public/` as
the source artwork. One literal kept on purpose: the agent glyph's accent bead keeps its
`--cs-leafsoft` fill and `#5A7856` stroke — those were already green, only the navy outline
was the defect. **Verified in the browser:** the active row's icon resolves to `--primary`
and an idle row's to `--fg-3`, i.e. the icon now tracks the row rather than sitting at navy.

---

#### 32. Bring the top bar to PM's spec — **M** ◐ PARTLY DONE 2026-08-08

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

**SHIPPED 2026-08-08 — the six safe rows only.** Height, padding, background, z-layer, icon
buttons and create button are done. **Measured in the browser:** header 56px at desktop, solid
`bg-surface`, `backdrop-filter: none`, `z-index: 20`, `padding-left: 12px`; icon buttons at
`border-width: 0` on a transparent fill in `--fg-2`; create button 28px tall. The icon buttons
went to `variant="ghost"` — PM's `p-1 rounded text-fg-2 hover:bg-surface-2` colour pair
exactly — while the box stays the primitive's `size="icon"` per item 14.

**Still open, and why:**
- **The search row.** Untouched, including `RESULT_ROW` / `GROUP_LABEL`. Blocked on Open
  Question E, as this item instructs.
- **The "menu width" and "menu item" rows.** Not in this item's "safe to do now" list, and
  **there is a defect in those two table cells.** `w-[246px]` no longer exists — item 23 folded
  that menu into `Dropdown`'s `min-w-[200px]`. And `w-[320px]` is our **notification panel**,
  which the table maps onto PM's *user menu* (`w-48` = 192px). PM's actual notification
  counterpart is `NotificationDropdown.tsx:140` — **`w-[360px]`**, i.e. **wider** than ours,
  not 128px narrower. Applying the row literally would ship a cramped panel PM does not have.
  Left at `w-[320px]` pending an owner call on which PM surface it should match.

---

#### 33. Move the logo to the top bar — **S** ✅ DONE 2026-08-08

**CS** `screens/Sidebar.jsx:46-51` — mark 26px + wordmark `text-[16px] font-medium
tracking-[-.4px]`, at the **top of the sidebar**.
**PM** `src/components/layout/Header.tsx:176-184` — `<PlumoMark size={24} />` + wordmark
`text-[14px] font-medium tracking-tight text-fg`, in the **top bar**.

The logo *artwork* is exempt. Its *position and size in the shell* is not — different corner
of the screen, and 16px vs 14px wordmark.

**Blast radius:** 2 files. **Risk:** none — but it changes the first thing anyone sees.
**Check:** side-by-side screenshot.

**SHIPPED 2026-08-08.** In the header's left group beside the hamburger, with PM's
`gap-2 md:gap-3` and `ml-4 md:ml-8`. **Measured:** mark 24px, wordmark 14px/500, and no mark
left in the sidebar. Kept a non-interactive `<span>`: PM's is a `<Link href=/dashboard>` and
we have no such route, so making it clickable would be a feature add. The side-by-side
screenshot is still owed — the Browser pane would not composite frames this session, so every
check above is a computed-style read rather than an image.

---

#### 34. Adopt PM's page-header pattern — **S** ✅ DONE 2026-08-08

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

~~Item 7 already fixes the colour and weight globally; this item fixes the element, size and
subtitle tone.~~
**CORRECTED 2026-08-08, after item 7 shipped.** Item 7 fixes the **colour** globally — these
four titles are near-black today. It does **not** fix the weight here: each of these call
sites carries a literal `font-medium`, and `@layer utilities` outranks the `@layer base`
`font-semibold`. **The 500 → 600 change is this item's job, not item 7's** — the `font-medium`
class has to be deleted at the call site, along with `tracking-[-.6px]` (item 7 removed the
base tracking; these override it back). Add `EdgeScreens.jsx:16,37` to the file list above:
same `font-medium` + `tracking` pair on `text-[24px]` headings.

CS is internally inconsistent too: `Login.jsx:161, 284, 320` uses `font-semibold` at 26–32px
while every in-app title uses `font-medium` at 21–22px. Standardising on PM removes that too.

**Blast radius:** 4 screens. **Risk:** none.

**SHIPPED 2026-08-08.** `Reports.jsx`, `Customers.jsx`, `Account.jsx`: `<h1>` at
`text-[26px] font-semibold tracking-tight text-fg`, subtitle `text-[13px] text-fg-2 mt-1`, and
the wrapper's `gap-1`/`gap-0.5` dropped so `mt-1` is the only rhythm — PM's `users/page.tsx`
header has no gap. `EdgeScreens.jsx:16,37` per the CORRECTED note: `font-medium` and
`tracking-[-.7px]` deleted, `<h1>` + `font-semibold tracking-tight text-fg`, **size left at
24px**, which is PM's other page-title size and what the correction calls them.
**Measured in the browser on all three in-app screens:** `H1`, 26px, weight 600, letter-spacing
−0.65px, colour `--fg`; subtitle 13px `--fg-2` at `margin-top: 4px`.

---

#### 35. Normalise icon stroke width — **S** ✅ DONE 2026-08-08

**CS** — `strokeWidth="1.75"` in **40** hand-drawn inline SVGs across `components/`.
**PM** — `strokeWidth={2}` **288×**, `1.8` 71×.

**Before:** every hand-drawn glyph in the console is a consistently lighter line than PM's.
**After:** `2`.

**Blast radius:** 40 one-token edits, 8 files. Mechanical.
**Risk:** none. **Check:** the Ticket toolbar icons should read at the same weight as PM's.
Does not affect `components/common/icons/registry.generated.ts`, which is already identical.

**SHIPPED 2026-08-08.** Exactly **40** edits across 9 files (`Customers`, `Header`, `Login`,
`Queue`, `Settings`, `Sidebar`, `Ticket`, `app/accept-invite/page.jsx`,
`app/reset-password/page.jsx`). `components/common/StatusPill.tsx` is **deliberately not
touched**: `diff` against `dbwork/frontend/src/components/common/StatusPill.tsx` returns clean,
so its nine `1.75`s are PM's own and changing them would break parity rather than restore it.
That is also the arithmetic that makes the plan's count of 40 exact.

---

#### 36. Wire in the breadcrumb — **S** ✅ DONE 2026-08-08

**CS** — `components/common/Breadcrumb.tsx` is byte-identical to PM's, exported at
`components/common/index.ts:37`, and **rendered zero times**. CS has no breadcrumb anywhere.
**PM** renders `<Breadcrumb>` on 17 pages (e.g. `users/page.tsx:611-620` with `className="mb-6"`).

**Blast radius:** each screen with a parent context — Ticket (inbox → #NNN), Customer profile
(customers → name), Settings sub-tabs.
**Risk:** none. **Check:** the Ticket screen should show `Home / Inbox / #1042`.

**SHIPPED 2026-08-08.** 0 renders → 3: Ticket (above the toolbar, per PM `IssueHeader.tsx:71`),
CustomerProfile and Settings. `V.settingsTabLabel` added in `Console.jsx` off `SETTINGS_CARDS`,
empty on the overview tab since that tab *is* the section root. The crumbs above the leaf are
href-less labels rather than links — we have no router for those ancestors and
`components/common/` is import-only, so no `onClick` was added to the primitive.

**Every leaf is conditional.** `cName` and `tNum` are `''` while their record loads
(`Console.jsx:1889`, `:1841`), and the primitive draws a chevron before an item whether or not
that item has text — an unguarded leaf renders as a dangling 32px chevron. Caught in the
browser on CustomerProfile and fixed there; Ticket and Settings already guarded.
**Verified in the browser:** Settings renders `Home / Settings / team & users` with the
`workspace-building` home icon and two `state-chevron-right` separators, all three icon names
resolving out of `registry.generated.ts`.

**Note on the four chrome words.** "Home", "Inbox", "Customers" and "Settings" are Sentence
case because this item's own check spells them that way; the leaves are live data in whatever
case the app holds. Until item 43 lands, those four words are the only Sentence-case chrome in
a lowercase UI. Deliberate, and item 43 sweeps them up with everything else.

---

### BATCH 7 — Layout rhythm, cards, tables

**STATUS 2026-08-08:** items 37–41 all **DONE**. Item 41 was no longer blocked —
Open Question F is answered — and applying that answer in full took it past the
four call sites its blast radius names; see under it. Nothing was seen in a
browser beyond the 404 route (no backend), so the in-app checks below are owed.

---

#### 37. Add responsive page padding — **S** ✅ DONE 2026-08-08

**CS** — a single fixed value on all four page screens: `px-6 py-[22px]` — `Reports.jsx:28`,
`Customers.jsx:5` (`PAGE`), `Account.jsx:12`.
**PM** — responsive on every page: `p-3 md:p-4 lg:p-6` (`dashboard/page.tsx:92`,
`projects/page.tsx:167`), `p-4 md:p-6 lg:p-8` (`issues/page.tsx:109`), `p-4 md:p-8`
(`reports/page.tsx:313`), `p-8` (`users/page.tsx:610`).

**Blast radius:** 4 screens. **Risk:** none. **Depends on nothing.**
**Note:** this is the first item that introduces Tailwind breakpoints into CS screen code,
which currently has **zero** — see item 42.

**DONE 2026-08-08.** `px-6 py-[22px]` is gone from all three constants; all four screens now
carry PM's reports recipe `p-4 md:p-8` (`reports/page.tsx:313`). **`components/screens/` has
its first Tailwind breakpoints** — `md:` ×3, where it had zero. Reports and Customers are a
verbatim copy of that page, padding and width together (item 38).

**Account is a reconciliation, and it is the one value here that is not a straight copy.**
Its PM counterpart is a settings page, and PM's settings pages get their padding from the
layout's content pane (`settings/layout.tsx:343`, `px-8 py-8`) — a flat, non-responsive `p-8`
that CS has nowhere to inherit from, since CS has no settings layout. `p-4 md:p-8` resolves to
exactly PM's `p-8` from `md` up and degrades below it, which is what this item asks for.

**A fifth site, added on review: Settings' content pane.** This item's CS list has three
constants, so the first pass changed three and left `Settings.jsx:52` on `padding:22px 24px`.
That left CS with two 720px settings surfaces — Account and Settings — on **different**
padding, where before this batch they matched exactly (`px-6 py-[22px]` and `22px 24px` are the
same 24/22). It is also the one place the "nothing to inherit from" argument above does not
hold: this div *is* PM's settings content pane (`settings/layout.tsx:343`), and PM pads it a
flat `px-8 py-8` with no breakpoint. Copied literally: `padding:32px`. Account and Settings now
agree at `md` and up, both on PM's number.

---

#### 38. Add page content max-widths — **S** ✅ DONE 2026-08-08

**CS** — **zero** page-level `mx-auto` wrappers; every screen is full-bleed. The only `max-w`
values sit on inner elements (`max-w-[520px]` search, `max-w-[42ch]` copy). `Account.jsx:12`
has `max-w-[760px]` but is **not centred**.
**PM** — centres content in 18 places: `max-w-[720px] mx-auto` ×7 (settings-shaped pages),
`max-w-[1400px] mx-auto` ×2, `max-w-[840px]` ×2, `max-w-7xl` / `5xl` / `3xl` ×2 each.

**After:** Account and Settings → `max-w-[720px] mx-auto`; Reports and Customers →
`max-w-[1400px] mx-auto`.
**Blast radius:** 4 screens. **Risk:** none — but at 1920px this is very visible. Show him
before pushing.

**DONE 2026-08-08.** `max-w-[1400px] mx-auto` on Reports and on Customers' `PAGE` (which is
both the list and the profile, so 3 screens for 2 constants); `max-w-[720px] mx-auto` on
Account — it was 760px and **not centred** — and on Settings' content pane. CS had zero
page-level `mx-auto` before this; it now has four.

**One structural deviation, deliberate.** PM caps a plain `<div>` *inside* a full-bleed scroll
container. In CS the page element *is* the scroll container (`data-scroll flex-1 min-h-0
overflow-y-auto`), so the cap sits on it directly and the scrollbar rides the right edge of
the capped column rather than the right edge of the viewport. Matching PM exactly would mean
wrapping each screen's whole body in a new div — a ~150-line reindent per screen for a
scrollbar's x-position. The content geometry is identical either way.

---

#### 39. Move the tables onto the shared row utilities — **M** ✅ DONE 2026-08-08

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

**DONE 2026-08-08.** Six definitions, not five — Reports had a second, inline row recipe for
the per-agent table that the count missed; it is now a `TROW` constant alongside `THEAD`, and
Queue's skeleton row (`h-[46px]`) went with the real rows. **`h-row` / `h-row-header` go from
0 uses to 6.** Every row in the difference table is now PM's: `bg-surface-2` not `bg-bg`,
`font-semibold`, `px-3` not `px-4`, `text-[13px]` not `13.5`, and **`tracking-wider` in place
of `tracking-[1.4px]` — 0.55px against 1.4px**, measured in the browser, which was the most
visible of the set. Queue's selected row gets `bg-[color:var(--primary-soft)]`; Customers and
Reports have no selection to indicate, so PM's rule reaches the one table that does.

`--cs-rowpy` is **deleted from `globals.css`**, declaration and both density overrides — item
13 left it as the last piece of console-specific vertical rhythm and this was the item that
was supposed to take it. `--cs-fs` survives, but only on `body`; no table reads it any more.
Verified: `h-row` computes 44 / 37.39 / 50.59px across the three densities, `--cs-rowpy` is
undefined.

**One thing this hands us, flagged not fixed** — same shape as the `w-8` oval under item 14.
PM's rows are single-line, so `h-row` as a fixed `height` is safe there. **CS's queue row is
two-line** (subject over snippet). At the inherited `line-height: 1.65` that is 21.45 + 2 +
20.63 = **44.08px inside a 44px box** — it fits to within a rounding error at `comfortable`
and has room at `relaxed`, and at `compact` the snippet already collapses inline
(`globals.css`, `[data-snip]`). Copying PM's utility is correct and that is what is committed,
but PM's value encodes "one line of text" and CS's row is not that. **First thing to look at
when the queue is finally seen in a browser.**

---

#### 40. Drop `shadow-card` from the panel constant — **S** ✅ DONE 2026-08-08

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

**DONE 2026-08-08.** Four sites, not three — Customers' profile header card is a fourth,
written out by hand rather than through `PANEL`. `shadow-card` is gone from all four and `p-5`
went to PM's `p-4` in the three that carried padding (`Account`'s `CARD`, Reports' drill-down
panel, the profile header). **Every card and table panel in CS is now flat and bordered.**

`shadow-card` survives in exactly the places PM keeps it — things that float above the page:
Header's search popover, Ticket's two menus and its composer, and Queue's hover quick-actions.
That is the 25% minority the item describes, and it is now the only thing wearing it.

---

#### 41. Fix the `EmptyState` illustration scale — **S** ✅ DONE 2026-08-08

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

**DONE 2026-08-08. Not blocked any more — F is answered, and this is the item that spends the
answer.** CS's mascots are gone from the tree: `grep 'assets/mascots' components/ app/` returns
nothing.

**The four `/brand/empty-states/` assets are imported and re-tinted.** Per F's note, every one
was checked for blue first, and all four are drawn in PM's blue triad. **The colour mapping —
the only thing changed inside the files:**

| PM | CS | why that value |
|---|---|---|
| `#1E3A8A` `--plumo-night` (ink, strokes, eyes) | `#1F4A2E` `--cs-forest` | the mapping `app/global-error.jsx` already used |
| `#EFF6FF` `--plumo-mist` (soft fill) | `#EDF4EE` `--cs-soft` | CS binds `--primary-soft` here where PM binds `--plumo-mist` |
| `#60A5FA` `--plumo-sky` | `#7CC098` = `hsl(145 35% 62%)` | CS's dark `--primary`, which is exactly where PM's dark `--primary` is `var(--plumo-sky)` |

The peach and butter accents (`#FFD4B8`, `#FFAB85`, `#FFE8A3`) are shared between the pillars
and are copied byte-for-byte. Each file carries the mapping as a header comment.

**This also repaired a live break, in the same shape as item 2.** CS ships `EmptyState.tsx`
byte-identical to PM's, and `BRAND_ILLUSTRATIONS` points at
`/brand/empty-states/plumo-no-results.svg` and `plumo-no-permissions.svg` — **CS's `public/`
had no `brand/` directory at all**, so `illustration="no-results"` would have rendered a broken
image. Both presets now resolve.

**Call sites.** Queue's two empty states drop the raw 84px `icon` for PM's presets —
`illustration="error"` (the `state-critical` chip) and `illustration="no-results"` (the blob at
280×187). `EdgeScreens`' in-shell 404 and Oops take `plumo-404.svg` / `plumo-500.svg` at 280px
instead of a 96px mascot.

**Three files past the named blast radius, deliberately:** `app/error.jsx`,
`app/not-found.jsx`, `app/global-error.jsx`. Item 28 shipped CS mascots there *because* PM's
404/500 were blue, and F's answer explicitly handed the re-tint to whoever picked up 41. They
are the same two screens as `EdgeScreens`; leaving them would have left CS with two different
404 illustrations.

**The four decorative mascots have no PM call site to copy, so the source is PM's component,
not a PM screen.** Login's "it's on its way", accept-invite's and reset-password's confirmations
and the shortcuts drawer now render **`BlobHappy` from `components/brand/Blobs.tsx` — PM's own
mascot, byte-identical in CS since before this plan and imported zero times.** It fills with
`var(--primary)`, so it is green here and blue there off one file with no fork. Sizes are PM's
default 80, except the drawer's, which sits inline beside a 12.5px caption at 40.
`BlobCelebrating` reads better on a success screen, but it carries a `#60A5FA` confetti dot —
the palette exemption forbids that outright, and re-tinting would fork a file that currently
diffs clean against PM.

`cs-breathe` is **deleted**: it was the idle on CS's mascots, PM's illustrations carry their own
SMIL, and with the swap done it had no callers. `/public/assets/mascots/*` is now unreferenced;
the files are left on disk for item 46's sweep.

**One trap worth writing down.** The first draft of the provenance header spelled the tokens
`--plumo-night` / `--cs-forest`. **XML comments may not contain `--`**, so all four SVGs became
unparseable and every one of them silently failed to load — `complete: true`, `naturalWidth: 0`,
no console error. Rewritten without double hyphens; all four now parse and load at 360×240,
confirmed in Chrome, and the 404 route renders the green blob at its 360×240 box.

---

### BATCH 8 — Responsive

**STATUS 2026-08-08:** item 42 **DONE**, all four splits. Checked in Chrome at
375 / 768 / 1024 / 1280 / 1920 with the shell live; see under it.

---

#### 42. Give CS a mobile layout and align the breakpoints — **L** ✅ DONE 2026-08-08

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

**DONE 2026-08-08 — all four splits.** `components/screens/` goes from **zero** responsive
prefixes to ~60, `app/globals.css` from four `@media` blocks to one
(`prefers-reduced-motion`, PM's only one), and every breakpoint in the tree is now
640 / 768 / 1024 / 1280 / 1536.

**(a) Drawer.** PM `DashboardLayout.tsx:108-124` verbatim: scrim `fixed inset-0 bg-black/50
z-modal-backdrop md:hidden animate-fade-in`, drawer `fixed inset-y-0 left-0 w-72 z-modal
md:hidden`, desktop rail `hidden md:flex`. `Sidebar` took PM's `isMobile` prop
(`Sidebar.tsx:112`) with PM's mobile header and close button (`:429-443`), and PM's
`isCollapsed = isMobile ? false : collapsed` (`:381`). The drawer closes on any nav click, as
PM's does (`:172-174`). **Measured at 375:** scrim `rgba(0,0,0,.5)` at z-40, drawer 288px at
z-50, the rail inside it 288px with labels showing, closed on a nav click.

**The header hamburger is `md:hidden` now, so the desktop collapse needed somewhere to live:
PM's own collapse handle** (`DashboardLayout.tsx:82-105`, copied whole) — the 28px round
button straddling the rail's right edge. Without it, making the hamburger mobile-only would
have deleted CS's collapse outright.

**Search folds to an icon** (`Header.tsx:222`), and the create button's label goes with
`hidden md:inline` (`:258`). PM's mobile search icon opens a command palette; CS has none —
that is Open Question E, which item 32 left alone — so the icon drops the *same* `<Input>`
into a row under the bar rather than inventing a second search mechanism. `<header>` is now
PM's bordered box around a `h-12 md:h-14` bar (`:126-130`), which is what leaves room for that
row. Field and results popover are one component each, used by both slots; only the desktop
copy takes `V.searchRef`, since both are in the DOM at once and `/` has to land on the visible
one.

**(b) Queue.** Below `md` the row is PM's stacked list row (`IssuesList.tsx:142-160`) — badge
line, subject, meta line — and the column header is gone. One DOM serves both: two wrapper
spans are the card's lines below `md` and `md:contents` above it, so their children become
direct grid items.

**The column budget is the part that is not a straight re-labelling of CS's breakpoints, and
it is the item's real finding.** Mapping 1400 → `xl` and 1180 → `lg` does not work, because
CS's old sets only ever fitted by *force-collapsing the rail to 64px* — the very override this
item removes. With the rail left at the user's 236px, the old 7-column set at 768 needs 692px
of a 508px container, and the 9-column set at 1280 needs 774 of 804, leaving the subject 30px.
So columns are now **added as room appears** rather than dropped as it runs out: 5 at `md`,
priority at `lg`, customer and assignee at `xl`, tags at `2xl`. The subject track is
`minmax(0,1fr)` at every step — its old 180–220px floor is exactly what pushed the total past
the container and clipped the right-hand columns instead of shrinking the one that truncates.
**Measured, no overflow at any step:** 768 → `26 92 214 82 46`; 1024 → `28 96 88 142 84 50`;
1280 → `28 100 92 160 168 32 88 52`; 1920 → the full nine with a 670px subject.

The filter rail moves from CS's 1080 to `lg`, and the toolbar's `filters` button goes with it
— it would otherwise toggle something that cannot appear. The bulk bar spans the list and
wraps below `sm`; `left-1/2` had to wait for `sm` too, since an absolutely positioned box with
only `left` set shrink-fits to whatever is right of that edge and the pill was getting 187px
to wrap seven controls into.

**(c) Ticket.** Tabs below `lg` on the `Segment` primitive — CS's second use of it.
**This is the one place the plan and PM disagree and the plan won:** PM's detail rail is
simply `hidden xl:block` (`issues/[id]/page.tsx:951`), but PM's rail repeats fields that also
appear inline in its header and CS's does not — the SLA targets, the customer card, the tags
and the CSAT have no other home — so hiding it outright would lose them rather than repeat
them. The rail toggle is `hidden lg:inline-flex`: below `lg` the tab decides, and a second
invisible switch on the same thing would only be a way to make the details tab render nothing.
**Measured at 375:** conversation tab → rail `display:none`; details tab → rail 375px, thread
hidden; at 1920 the tabs are gone and both panes sit side by side, rail 322px.

**(d) The three queries are gone, and so are the three attribute rules that went with them.**
`[data-cs-nav="off"] [data-navlabel]`, `[data-cs-rail="off"] [data-rail]` and
`[data-cs-filters="off"] [data-filterrail]` could not survive this item: a pane now has to
answer to a user toggle *and* a breakpoint at once (`hidden lg:flex` vs `lg:hidden`), which a
selector on `<html>` cannot express. The sidebar, details rail and filter rail take
`navOn` / `railOn` / `filtersOn` as props instead, the way PM's take `isCollapsed`.
`Console.syncDoc()` still writes `data-cs-nav` (the width token, which has to animate).
`app/layout.jsx` no longer server-renders `data-cs-rail` / `data-cs-filters` either — it had
gone on emitting both for `syncDoc` to delete on mount, which left two dead attributes on
`<html>` and a `delete` on each side of them; both sides are gone now, and `data-cs-nav` is
the only one left. `--cs-qcols` is deleted; **`--cs-gap` is now unreferenced** and left for
item 46's sweep, like `--plumo-fw-medium` under item 7.

**Three screens past the four splits, because "no horizontal scroll at any width" is the
check and they failed it.** Customers' two tables (798px and 728px floors), Reports' agent
table (530px) and Settings' seven table panels now scroll inside their own panel — PM's own
answer for a table wider than its container (`users/page.tsx:696`). Reports' `minmax(320px,
1.6fr) minmax(240px,1fr)` split is one column until `lg`, PM's idiom at
`ProjectsDetailedView.tsx:59`. Settings' 210px tab rail turns the corner below `md` into a
horizontal scrolling strip, PM's shape for a tab row (`AdminSettingsSection.tsx:89`) — that
element and its parent had to come off `sx()` to say so, because `sx` injects its sheet into
`<head>` at runtime and therefore wins every `display` or `width` tie against Tailwind.

**Checked in Chrome at 375 / 768 / 1024 / 1280 / 1920**, on queue, ticket, customers, customer
profile, reports, account and settings: `scrollWidth === clientWidth` on every one, and no row
or grid overflowing its own container. The backend was down, so the shell was driven by
setting `booted`/`loggedIn` and three synthetic rows on the live Console instance — **real
data has not been through this**, and the frozen-animation artifact from item 30's note still
applies (the Browser pane reports `visibilityState: hidden`, so `animate-slide-up` never
completes and its `translateY` masks the bar's `translateX(-50%)`).

**Re-verified on commit 2026-08-08**, independently of the run above, with the rail *forced
expanded* at each width — the worst case, and the one CS's old sets never had to survive
because 1180px collapsed the rail for them. Measured column templates came back exactly as
computed: 768 → `26 92 214 82 46` (filter rail `display:none`); 1024 → `28 96 88 142 84 50`;
1280 → `28 100 92 160 168 32 88 52`, summing with gaps to **804px inside an 828px container**.
`scrollWidth === clientWidth` on the document at 375 / 768 / 1024 / 1280. Drawer measured
288px at z-50 over an `rgba(0,0,0,.5)` scrim at z-40, labels showing, closing on a nav click;
ticket tabs switch panes (details rail 375px full width, conversation `display:none`, and the
reverse at 1280 with the tab strip gone); the collapse handle flips its label and `--cs-navw`
resolves to 64px. Two notes for whoever measures next: the Browser pane reports
`visibilityState: hidden`, which **freezes the rail's `transition-[width]` mid-flight** — the
token is right and the rail settles at 64px the moment the transition is removed, so measure
the token, not the rect. And a whole-tree scan for elements wider than their own container
flags exactly one, `DIV.relative hidden md:flex`: that is the rail wrapper, and it is
*supposed* to overflow, because PM deliberately puts no `overflow-hidden` there so the
collapse handle can straddle the edge (`DashboardLayout.tsx:76-80`). It does not reach the
document.

**One thing this hands us, flagged not fixed.** The nav rail is 236px at every width ≥768.
PM's is `w-[240px]` expanded and **`w-12` (48px) collapsed** (`Sidebar.tsx:423`); CS's collapsed
width is 64px, and neither number is in this item's scope — but the whole column budget above
is computed against 236, so if item 46 or a later pass moves the rail to PM's widths the four
templates want re-checking. Same shape as the `w-8` oval under item 14.

---

### BATCH 9 — Copy voice
*The owner exempted the palette and the logo. He did not exempt the writing. Confirm the
decision before executing — see Open Question G.*

**STATUS 2026-08-08:** item 43 **DONE**. Item 44 **NOT DONE** — it is Open Question H and
unanswered; see the note under it.

*Two pre-existing misses spotted while reading every string in these files, left for the item
that owns them: `app/accept-invite/page.jsx:398` still passes `variant="secondary"` (item 18
swept only `components/screens/`), and `Ticket.jsx:4` imports `Card` from `../common`, which
does not export it — `components/ui/index.js` does. It binds `undefined` rather than failing,
and the build stays green only because nothing in the file renders it (item 45).*

---

#### 43. Bring the copy into PM's register — **M** ✅ DONE 2026-08-08

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

**DONE 2026-08-08. Open Question G answered by the owner — the copy voice is in scope.** All
20 flower glyphs are gone from the tree (2 remained outside this item's list, in
`app/accept-invite/page.jsx:343` and `app/reset-password/page.jsx:225`; one survives, in a
`Console.jsx:971` comment quoting the string it replaced). Toasts, confirm dialogs, form
labels, placeholders, helper text, validation messages, nav labels, page titles, menu items,
tooltips and aria-labels are Sentence/Title case. Where PM's `toasts.json` had the same event,
its string is used verbatim — `"Password changed successfully!"`, `"Profile updated
successfully!"`, `"Notification preference updated"`, `"Feedback submitted successfully!"`,
`"No results found"`, `"Network error. Please check your connection."`.

**The blast radius was materially larger than "~35 strings across 7 files": ~250 strings
across 18 files.** Three sources the item does not list carry user-facing copy:
- **`components/screens/Settings.jsx`** (~60 strings) — every panel heading, tab label, form
  label and empty state. Item 47 rewrites this file's *styling*; its copy is batch 9's.
- **`app/accept-invite/page.jsx`** and **`app/reset-password/page.jsx`** (~30) — both carry a
  glyph and the full lowercase register.
- **`lib/api/adapter.js`** (~25) — the reports KPI labels, deltas, drill-down titles, notes
  and axis labels all live here, not in `Reports.jsx`.

**Eleven `.toLowerCase()` calls were the register applied to data rather than to copy, and all
eleven are removed.** Six in `Console.jsx`: the ticket subject *before POSTing it* (`submitNew`),
the customer's first name when expanding `{{name}}` into a reply (`insertCanned`), an agent's
first name in a toast (`setAssignee`), the assignee filter's own `me · <name>` label, and two
formatted dates (`clock()`, the holidays label). Five in `adapter.js`: weekday names on the
reports chart axis, people's first names in the drill-down breakdown, and the API-key `created`
date in all three of its load paths. The subject one changed stored data, not just display.

**Two things deliberately left lowercase, because PM is lowercase there.** The item's premise
("PM ... all Sentence case, no glyphs") holds for `toasts.json` — verified: 232 keys, zero
em-dashes, zero lowercase starts, and exactly one em-dash across all 14 locale namespaces — but
**PM's own error screens are lowercase prose**: `src/app/not-found.tsx:20` is `title="this page
wandered off"`, `src/app/error.tsx:36` is `title="something went sideways"` with the description
`"this isn't your fault — we're looking into it."` — an em-dash reassurance clause in PM. So the
titles and descriptions in `app/not-found.jsx`, `app/error.jsx`, `app/global-error.jsx` and
`components/screens/EdgeScreens.jsx` are unchanged; only their **action labels** moved, because
PM's are `'Go back'` / `'Go home'` / `'Try again'` and CS's were lowercase. If the owner wants
those four screens Sentence case too, that is a change *away* from PM, and it is one edit.

**Not changed, deliberately: strings inside an `uppercase` container**, where the source case is
invisible — every table header (`Queue`, `Customers`, `Reports`, `Settings`), the `EYEBROW` /
`GROUP_LABEL` / `RAIL_LABEL` eyebrows, `StatCard`'s label, and the Settings rail's `settings`
heading. `Customers.jsx`'s four `StatCard` labels were capitalised anyway, since `"last seen
ago"` read wrong at any case and is now `"Last seen"`.

**Also changed, since the copy is the interface:** three view names the item names
(`'no one yet'` → `Unassigned`, `'waiting on them'` → `Pending`, `'needs attention'` →
`Breaching`), and the filter chips for status and priority, which rendered the raw enum id
(`on-hold`) rather than the label table's text.

**Tests:** 7 assertions in `__tests__/login-errors.test.js` and
`__tests__/settings-writes.test.js` asserted the old copy. Five were case-only `toMatch`
patterns and are now case-insensitive — they test *which* message is chosen, not its
capitalisation, so this stops them breaking on the next copy edit. Two asserted exact strings
and were updated. Build green, 87/87 tests green.

**Swept on verification — the first pass stopped at the reports half of `lib/api/adapter.js`
and left the settings half.** The tell was `.toLowerCase()` on a formatted date: the pass
removed it from `Console.jsx`'s `clock()`, the holidays label and the reports weekday axis, but
three identical calls survived on the API-key `created` column, so that one table would have
rendered `7 aug 2026` under a heading whose siblings all now read `7 Aug 2026`. Removed, plus
the lowercase display strings in the same objects: `'all teams'` ×4, `'never'` ×3,
`Console.jsx`'s canned-response `'everyone'`, and the invite form's `'no team for now'`.

**The webhook status chip was the same miss one layer up.** The pass capitalised the ticket
`STATUS` / `PRIO` label tables, which is what every other chip in the app reads from, but the
webhook chip renders `w.status` directly — so `active` / `failing` / `disabled` stayed lowercase
inside a pill sitting beside newly-capitalised ones. That value is also the tone discriminator
(`w.status === 'active' ? 'sla-met' : 'sla-breach'`), so it could not simply be capitalised in
place; `HOOK_STATUS_LABEL` now maps slug to label at the view-model boundary and the comparison
still sees the slug. PM capitalises these (`common.json` `"active": "Active"`).

**Confirmed correct, not changed:** every remaining lowercase JSX text node sits inside a
container with `uppercase` — `THEAD`, `EYEBROW`, `GROUP_LABEL` — where source case is invisible;
`placeholder: 'billing'` and `'billing, refund'` are sample *tag keys*, which the adjacent helper
text documents as lowercase-only, next to a `placeholder: 'Billing'` for the display label; and
`<Kbd>g then i</Kbd>` is a key sequence.

---

#### 44. Externalise the strings to i18next — **L** ⏸ NOT DONE 2026-08-08

**CS** has no i18n; every string is hardcoded in JSX, so CS cannot be translated and there is
no single file where the voice can be corrected.
**PM** — `i18next` + `react-i18next`, 14 namespaces × en/fr.

**Blast radius:** every screen. **Effort L.**
**Risk:** low but tedious. Worth doing only if CS is going to ship in French like PM, or if
item 43 is approved (a single locale file makes the voice fix reviewable in one diff instead
of 35). **Open Question H.**

**NOT DONE 2026-08-08 — Open Question H is unanswered, and the owner's batch-9 decision does
not settle it.** What was approved was the *register*; i18n is a dependency addition
(`i18next` + `react-i18next`) and a refactor of every screen, which is an architecture call
rather than a design-parity one. Two findings from doing item 43 that bear on the answer:
- **The second half of the item's own rationale is now spent.** "A single locale file makes
  the voice fix reviewable in one diff" was an argument for doing 44 *before* 43. 43 is done,
  so that value is gone; what remains is only the French question.
- **The real string count is ~250 across 18 files, not 35 across 7** — including
  `lib/api/adapter.js`, which is not a screen and would need a namespace of its own. That is a
  larger L than the item assumes.

---

### BATCH 10 — Delete the parallel systems
*Last, because everything above has to stop depending on them first.*

**STATUS 2026-08-08:** items 45, 46, 47, 48 all **DONE**. One row of item 45's table was
deliberately **not** done — `ConfirmDeleteModal.tsx` is kept; reasons under the item.
`npm run build`, `tsc --noEmit` and 87 tests green. Unlike batches 4–7, this batch **was seen in
a browser**: Settings was rendered against a stub `V` on a scratch route (since deleted) and
every geometry claimed below is a measured number, not an inference. Queue, Ticket, Header and
Sidebar still need a backend and have **not** been looked at.

---

#### 45. Delete the dead code — **S** ✅ DONE 2026-08-08

| Path | What it is | Status |
|---|---|---|
| `components/ds.jsx` (132 lines) | A **third** component language — `Button` / `Badge` / `Pill` on inline styles and the marketing `--plumo-*` palette (`--plumo-blue`, `--plumo-mist`, `--plumo-peach`, `--plumo-butter`). Its Button is `padding: 12px 22px; font-size: 15px; border-radius: var(--plumo-radius-pill)` against `Button.tsx`'s `h-btn-md px-3 text-[13px]`. | **Imported by nothing.** Delete. |
| `components/ui/index.js` (13 lines) | Barrel re-exporting `./Button`, `./Input`, `./Badge`, `./Surface`, `./Overlay`, `./Avatar`, `./Segment`. **None of those files exist** — the directory contains only `index.js`. Any import fails to resolve. | Delete the directory. |
| `screens/Ticket.jsx:3` | `import { Button, Card, … } from '../common'` — **there is no `Card`** in `components/common/` and `index.ts` does not export one. Never rendered, so no crash today; will fail `tsc`. | Remove `Card` from the import list. |
| `app/globals.css:305` | `[data-anim="sk"]` + `@keyframes cs-shimmer` — referenced by nothing. | Delete (folded into item 24). |
| `app/globals.css:54-55` vs `:150-151` | `--font-sans` and `--font-mono` each defined **twice** in the same `:root`; the second wins. Same effective value, live footgun. | Delete the first pair. |
| `components/common/ConfirmDeleteModal.tsx` | Byte-identical to PM's, imported by no screen. | Wire in (item 26) or delete. |
| `app/globals.css:299-300` | `.h-topbar` (44px) and `.h-navitem` (28px). **Newly dead as of batch 6** — item 32 moved the header to `h-12 md:h-14` and item 30 moved the nav row to `h-[38px]`, so both utilities now have zero call sites. `.h-navitem` is the more dangerous of the two: it still says 28px, which is the geometry item 30 exists to remove. | Delete. |

PM has no equivalent of any of these. They are drift generators aimed at the next person who
greps for "Button" in CS.

**Effort S. Risk: none. Check:** `npm run build` and `tsc --noEmit`.

**DONE 2026-08-08, six of the seven rows.** `components/ds.jsx` and the whole `components/ui/`
directory are deleted; neither had an importer. `Card` is out of `Ticket.jsx:4`'s import list.
The duplicate `--font-sans` / `--font-mono` pair is gone — and with item 48 the surviving pair is
PM's own string. `.h-topbar` and `.h-navitem` are deleted from the `@layer components` block,
with a note saying which items retired them. `[data-anim="sk"]` / `@keyframes cs-shimmer` had
already gone with item 24; nothing to do.

Found during review and fixed in the same commit: two `data-unread` attributes
(`Header.jsx:174`, `Queue.jsx:338`) outlived the `[data-unread]` rule item 46 deleted. No CSS
and no test read them, and the unread weight is now a `font-medium` class on the element itself,
so they were dead markup of exactly the kind this item exists to remove.

**`components/common/ConfirmDeleteModal.tsx` is kept, against the row's "or delete".** The
table's stated rationale — *"PM has no equivalent of any of these"* — is the one thing that is
**false** for this file. It is byte-identical to PM's and PM renders it in five places
(`issues/[id]/page.tsx:996`, `admin/changelogs/page.tsx:447`, `admin/project-member-tags`,
`McpClientModal`, `EditIssueModal`). Deleting it would be the only edit in this batch that moves
CS *away* from PM, and it would break the next port that arrives carrying
`<ConfirmDeleteModal>`. It is an unused-but-identical primitive, which is the case item 2 already
ruled on for `StatusPill` — *"define them anyway; the file is shipped and the next port will use
it."* **Owner call if you disagree; it is a one-line delete plus one line of `index.ts`.** Note
item 26 did not orphan it by accident: PM ships *both* `DialogContext` and `ConfirmDeleteModal`
and uses both.

---

#### 46. Retire the `--plumo-*` / `--cs-*` duplicate token layer — **L** ✅ DONE 2026-08-08

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

**DONE 2026-08-08. There is one namespace.** `globals.css` has a single `:root` now, not two,
and **the built stylesheet contains zero `--cs-*`** — `grep -o -- '--cs-[a-z-]*'
.next/static/css/*.css` returns nothing. What survives of `--plumo-*` is exactly the eight names
PM keeps: the six theme-invariant brand hexes (`night` / `blue` / `sky` / `mist` / `peach` /
`butter`, copied from PM `globals.css:17-23` verbatim, lowercase hexes and all) plus
`--plumo-blob-stroke` and `--plumo-on-surface`, which `PriorityBars.tsx` and
`icons/registry.generated.ts` — both byte-identical PM files — need. Every row of the table above
is spent, and so are `--cs-warm`, `--cs-hover`, `--cs-forest`, `--cs-leafsoft`, `--cs-navw` /
`-railw` / `-filtw`, `--cs-fs`, `--cs-gap`, `--cs-cardpad`, `--cs-subjw` / `-subjc`, `--cs-okbg` /
`-okfg` and the `--cs-on*` quartet, which the table did not name.

Where a legacy name carried a value with no PM token, it mapped rather than vanished:
`--cs-warm` → `--warning-soft` (so it gains a dark value it never had), `--cs-leafsoft` →
`--primary-soft-border`, `--cs-forest` and `--cs-brand-ink` → `--primary`, `--cs-r-md` (12px) →
`--radius` (6px), `--cs-hover` → `--surface-2`.

Four things this cost beyond a rename, all deliberate:

- **`[data-on]` is gone, not renamed.** It was a second way to say "selected", driven from a
  global attribute selector, and PM has no analogue — PM writes it at the call site as
  `bg-[color:var(--primary-soft)]` + `text-[color:var(--primary)]` (`NavLink.tsx:32`). Seven
  places moved to that recipe: Queue's saved views and its three filter facets, Ticket's assignee
  menu and its reply/note segments, Overlays' new-ticket priority row, Settings' tab rail and its
  API-key kinds. Two of them — Ticket's composer segments — **gained a `focus-ring` they never
  had.**
- **`--av-fg: var(--plumo-night)` → `var(--primary)`,** as the item asks. Measured: `--av-fg`
  computes `hsl(145 35% 62%)` in dark where it was `#1E3A8A` navy. `[data-av]` still has zero
  call sites; it is kept on the item's CORRECT-BY-DESIGN instruction, like `StatusPill`.
- **`--cs-navw` and `[data-cs-nav="off"]` are gone, and so is `Console.syncDoc()`.** The sidebar
  carries `collapsed ? 'w-16' : 'w-[236px]'` as classes, which is how PM writes it
  (`Sidebar.tsx:422`: `isCollapsed ? 'w-12' : 'w-[240px]'`). **CS's 236 / 64 values are kept —
  matching PM's 240 / 48 is item 30's business, not this one.** With the token gone `syncDoc()`
  had nothing left to write, so it and the `data-cs-nav` attribute on `<html>` are deleted;
  `<html>` now carries no `data-cs-*` at all. The never-passed `accent` prop went with it.
- **`[data-danger]` and `[data-unread]` are deleted.** Both were rule pairs feeding variables
  nothing reads any more — the confirm footer left for `DialogContext` in item 26, and the unread
  subject weight is now a `font-medium` class on the row that is unread. `[data-tone]`,
  `[data-av]`, `[data-side]` and `[data-showq]` stay: support-domain, no PM analogue.

**Two `--plumo-*` colour uses survive that no item authorises changing — flagged, not fixed.**
Queue's bulk-action bar is `background: var(--plumo-night)` (`Queue.jsx:452`) and Reports' second
chart series is `var(--plumo-sky)` (`:144, 152`): PM's navy and PM's accent-light, on prominent
CS surfaces. §6 calls the *toast's* navy "a missed re-green, not a decision" and item 22 fixed
it; these two have the same shape and no item names them, so re-tinting would be inventing a
colour decision. **Owner call.** The auth wash keeps a 9%-alpha `--plumo-sky` for the same
reason. Queue's Close button did *not* survive: it was `--plumo-butter` on `--plumo-on-butter`, a
marketing text-on-colour pairing with no PM definition left once the block was cut, so it is now
`<Button variant="warning">` — the shared variant PM uses 14 times.

**Body type.** `body` no longer reads `--cs-fs` / `--plumo-fw-regular` / `--plumo-lh-body`; the
values are inlined at `13.5px` / `1.65`. §3 confirms PM's body is the 16px browser default and
CS's is 13.5px, but **no item in this plan moves the console off 13.5px**, so this one did not
either. `font-family` is dropped entirely — it comes from `<body className="font-sans">` now,
which is where PM gets it.

---

#### 47. Rewrite `Settings.jsx` off `sx()` — **L** ✅ DONE 2026-08-08

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

**DONE 2026-08-08, and `components/sx.js` is deleted.** `grep 'sx('` over the tree returns
nothing, and no `<style data-sx>` element is created at runtime. Console's four remaining calls
(`:2050, 2056, 2058, 2104` — the boot shell, the app shell, the shell row and `<main>`) went to
plain utilities in the same pass; the file cannot be deleted while they stand, and the item
already calls them trivial.

All five defects the item lists are gone, **measured in Chrome** on a scratch route rendering
Settings against a stub `V`:

| | before | now (measured) |
|---|---|---|
| table header | `9px 16px`, 11px, `letter-spacing: 1.4px` | `h-row-header` **40px**, `bg-surface-2`, 600, **0.55px**, `px-3` |
| table row | `10px 16px`, 13.5px | `h-row` **44px**, 13px, `px-3` |
| icon button | 26×26, `0.5px` border, 50% radius | **32×32**, `rounded-full` (item 14's `size="icon"`) |
| pills | `border-radius: 100px`, 11.5–12px | `Badge` / `TonePill`, **`rounded-token-sm` = 3px**, h 18 / 22px |
| card hover | `translateY(-4px)` over `--plumo-dur-default` (250ms, overshoot) | `.interactive` — `translateY(-1px)`, `--dur-fast`, `--ease-out` |
| surfaces | `border: 0.5px solid` throughout | **1px**, `rounded-token` (6px, was `--cs-r-md` 12px), no `shadow-card` |

It also spends four things the item did not ask for but the rewrite made unavoidable:

- **The tab rail is PM's settings rail** (`settings/layout.tsx:275-309`), not a restyle of CS's:
  240px (was 210), `bg-surface-2`, tabs at `h-8 px-2 rounded-token-sm text-[13px]` with the
  active one raised onto `bg-surface` + `shadow-card`. Measured 240 / 32 / 3px. Its eyebrow is
  PM's `text-[11px] font-mono font-semibold uppercase tracking-wider text-fg-3` — the old one
  bound `--cs-brand`, which no longer exists.
- **Panel titles are `<h1>` at PM's settings size** — `text-[24px] font-semibold tracking-tight`
  over `text-[13px] text-fg-2 mt-1` (`settings/notifications/page.tsx:137-144`) — where they were
  `<h2>` at `20px / 500 / -.5px`. Measured 24px / 600 / −0.6px. That is item 34's rule; Settings
  was not in item 34's file list, and there is no third heading convention to leave it in.
- **`LoadNote` stops borrowing `data-tone="sla-breach"`.** An SLA-breach colour was standing in
  for "this panel failed to load"; it now uses the same `--danger-soft` / `--danger` banner the
  modal two hundred lines below already used.
- **Six hand-rolled buttons became `Button`s** — the two Revoke controls, Copy, Done, "+ New tag"
  and "Add a holiday". `+ New tag` loses its dashed border, on item 14's "PM has no dashed
  button".

**One correction to the item's own numbers:** the ~30 raw `<button>`s item 14 deferred here are
not thirty. After this rewrite `Settings.jsx` has **eight** hand-rolled `<button>`s left, and
every one wears a `buttonVariants()` string (`editBtn` / `iconBtn` / `primaryBtn`). They stay
`<button>` rather than `<Button>` only because they carry the `data-id` / `data-v` attributes the
handlers read.

---

#### 48. Self-host the fonts — **M** ✅ DONE 2026-08-08

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

**DONE 2026-08-08.** `app/layout.jsx` takes PM's two `next/font/google` calls verbatim — `Inter`
and `JetBrains_Mono`, `subsets: ['latin']`, `display: 'swap'`, and **PM's own variable names
`--font-geist-sans` / `--font-geist-mono`**, so a file ported from either side resolves them
identically. The two variable classes go on `<html>` and `font-sans` on `<body>`, both PM's
(`layout.tsx:120-121`). `--font-sans` / `--font-mono` in `globals.css` are now PM's strings
byte-for-byte, and the `@import url('https://fonts.googleapis.com/…')` at line 1 is gone.

All three differences the item lists are fixed and **measured in Chrome**:
1. **Delivery** — 13 `.woff2` files under `.next/static/media/`; the page fetches two of them
   from `/_next/static/media/`, and there is no request to `fonts.googleapis.com`.
2. **Weights** — `document.fonts` reports `Inter 100 900 loaded`. The same string at 300 / 400 /
   500 / 600 / 700 / 800 / 900 measures 321.35 / 325.73 / 329.64 / 333.45 / 337.36 / 342.10 /
   347.24px — seven distinct widths, so every weight is a real cut. **`font-bold` is no longer
   synthesized faux-bold.**
3. **Mono** — `JetBrains Mono 100 800 loaded`. The API-key secret renders in it, and the same
   string measures 360px against Consolas' 329.89px, which is the proof CS is no longer falling
   back to the OS mono.

One cosmetic note: `--font-sans` resolves to `'Inter', 'Inter Fallback', 'Inter', system-ui,
sans-serif` — Tailwind's `fontFamily.sans` appends its own tail to a token that already has one.
PM's config has the identical shape, so this is copied, not introduced.

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
**ANSWERED 2026-08-08 — the login/signup recipe,** per the recommendation. Landed with item 16
as `CHECKBOX` / `CHECKBOX_STYLE` in `components/common/formControls.ts`. One wrinkle noted
there: PM's string has no `cursor-pointer` (it lives on PM's enclosing `<label>`), so Queue's
two label-less checkboxes lost the pointer cursor. Copied verbatim rather than improved.

**B. `.dark` class or `[data-cs-theme]` attribute?**
PM: `darkMode: 'class'` (`tailwind.config.ts:9`), `.dark` on `<html>`. CS: `darkMode:
['class', '[data-cs-theme="dark"]']` (`tailwind.config.ts:10`), attribute on `<html>`. A
`.dark` class does nothing in CS; a `data-cs-theme` attribute does nothing in PM. Any
stylesheet or component that hardcodes either selector is non-portable between the two.
Neither app uses a single `dark:` variant today, so this only bites on future ports.
**Recommendation: unify on PM's `.dark`.** But CS's attribute also carries `data-cs-soft`,
`data-cs-nav`, `data-cs-rail`, `data-cs-filters` on the same element, so it may be cleaner to
keep the attribute and accept that PM ports need one find-replace. **Your call.**
**ANSWERED 2026-08-08 — unified on PM's `.dark`,** per the recommendation and the standing
"PM is correct by definition" rule. Landed with item 12. The other four `data-cs-*` attributes
stay as attributes; only the theme moved to a class.

**C. Does CS get PM's third theme?**
PM offers light / dark / **terminal** (a near-black variant, `globals.css:176-183`, cycled at
`ThemeContext.tsx:83-85`). CS has no terminal variant. Strict parity says add it. It is ~8
lines of CSS. Worth it, or is two themes enough for a support console?
**UPDATED 2026-08-08 — still unanswered, but it is no longer an ~8-line question.** Terminal
overrides six base tokens; in CS those six reach the ported primitives but not
`components/screens/*`, which still run on `--cs-canvas` / `--cs-surface` / `--cs-border`. Ship
it verbatim today and the buttons, inputs and modals go near-black inside a green shell.
Completing it means inventing a near-black `--cs-*` ramp PM cannot supply. **Recommendation:
answer C after item 46, not before.** Item 12 shipped light + dark and left the seam clean —
the theme union and the toggle are a one-line change each.

**D. Which switch geometry?**
PM has four and does not agree with itself — `w-11 h-6` (44×24) ×2, `h-5 w-9` (20×36) ×1,
`w-8 h-4` (32×16) in the design-system reference. Item 17 recommends `w-11 h-6` on the
majority. If you would rather fix PM first and then port, say so — it is the one place where
"copy PM" has no single answer.
**ANSWERED 2026-08-08 — `w-11 h-6`,** the majority, per the recommendation. Landed with item 17
as `components/common/Switch.tsx`: the timer page's track and knob with the focus ring the three
row-shaped implementations share. CS now has a single switch geometry where PM has four — if PM
is ever reconciled, this is the file that follows it. Note the component is not a `<label>` and
requires one around it; see item 17 for why.

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
**ANSWERED 2026-08-08 by the owner — mascots are distinct from the logo, and CS adopts PM's.**
**One hard constraint discovered while doing item 28, which the answer has to survive:
PM's error illustrations are blue.** `public/brand/empty-states/plumo-404.svg` and
`plumo-500.svg` are drawn in `#60A5FA`, `#EFF6FF` and `#1E3A8A` — copying either puts PM's
accent blue on a full-screen surface, which the palette exemption forbids outright. So item 28
shipped CS's own mascots on the three new error routes, and **adopting PM's illustration family
means re-tinting these two files to green first, not copying them.** Whoever picks up item 41
should check every `/brand/empty-states/` asset the same way before importing it.
**CLOSED 2026-08-08 by item 41.** All four assets were blue, all four are re-tinted (mapping
table under item 41), and the three error routes now carry them. The decorative mascots — two
success screens, an invite confirmation and the shortcuts drawer — have no PM call site to copy,
so they render PM's `BlobHappy` component instead; it fills with `var(--primary)` and needs no
fork. CS's own mascot files are unreferenced.

**G. Is the copy voice in scope?**
CS's lowercase-with-`✿` register is a deliberate, consistent authorial choice — 20 flower
glyphs, 92% lowercase placeholders, lowercase nav labels, em-dash reassurance clauses. PM is
Sentence case with zero glyphs and "successfully" everywhere. The instruction exempted the
palette and the logo and nothing else, which reads as "the copy should match." But this is the
one finding where CS's difference is clearly intentional rather than drift. **Confirm before
item 43 — it is ~35 strings and it is not reversible by taste.**
**ANSWERED 2026-08-08 by the owner — the copy voice is in scope.** Landed with item 43.
**One correction the answer has to survive: the question's premise is not quite right.** PM is
Sentence case in its *toasts, placeholders, nav labels and page titles* — verified, 232 toast
keys with zero lowercase starts and zero em-dashes — but **PM's error screens are lowercase
with an em-dash reassurance clause** (`not-found.tsx` "this page wandered off", `error.tsx`
"this isn't your fault — we're looking into it"). So "match PM" and "de-lowercase everything"
are not the same instruction on those four screens. Item 43 chose *match PM*: their prose is
unchanged, their action labels moved to PM's `'Go back'` / `'Try again'`. If the owner meant
the stronger reading, say so — it is one edit, and it is a step away from PM.

**H. Does CS need i18n?**
PM ships en + fr across 14 namespaces. CS has none. Item 44 is only worth doing if CS will
ship in French, or if item 43 is approved and you want the voice fix as one reviewable file
instead of 35 scattered edits.

**I. Scroll ownership (item 10).**
PM locks `html` and `body` to `overflow: hidden` and delegates all scrolling to the shell. CS
scrolls at the document level. Adopting PM's rule should be a no-op for the in-app views but
will change `Login.jsx`, which is a tall centred page. Do you want CS's login to scroll the
document (as now) or to be a fixed-height centred card (as PM's)?
**UPDATED 2026-08-08 — still unanswered, and there is a third option.** The in-app no-op is
now confirmed (`Console.jsx:1968`). But PM's own login only *appears* to scroll: its
`overflow-y-auto` sits on an auto-height block, which never opens a scroll container, so under
`body{overflow:hidden}` PM clips tall login content too. So the real choice is: (a) keep CS's
document scrolling, (b) copy PM and inherit its clipping bug on three pages, or (c) fix PM
first — give the auth wrappers a definite height so `overflow-y-auto` actually engages, then
port. Full detail under item 10.

**J. React version constraint.**
CS is React 19.1 / Next 15.4; PM is React 18.3 / Next 14.2. `react-hot-toast` must be `^2.6.0`
or later on CS, not PM's pinned `^2.4.1` (item 22). Same caution applies to any other PM
dependency you port. Worth confirming there is no plan to align the framework versions first
— if there is, do that before Batch 5.

**K. CS is already shipping PM's accent blue on the sidebar.** *(Added 2026-08-08, found
during the Batch 2 colour check. Pre-existing — no batch put it there.)*
`globals.css:121` defines `--cs-btn: #2563EB` and `:207` overrides it to `#3B82F6` in dark.
Those are byte-for-byte PM's `--plumo-blue` and `--plumo-sky`. `:342` uses it for the active
nav item: `nav [data-on="true"] { --cs-onfg: var(--cs-btn); --cs-onbar: var(--cs-btn) }` — so
the selected sidebar row, its label and its indicator bar are all PM accent blue in a green
product. No item in this plan touches it. **Is that deliberate, or should the nav active state
bind `--primary` like everything else?**
