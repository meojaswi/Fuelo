# Fuelo Design System

The visual and interaction rules for the Fuelo web app. Read this before building or changing any screen. Source files: `frontend/tailwind.config.js`, `frontend/src/index.css`, `frontend/src/components/shared/`.

Sections marked **Current** describe what the code does today. Sections marked **Rule** are the standard new work must follow. Where the two differ, the gap is listed in section 12.

---

## 1. Principles

1. **Built for a phone at a counter.** Pump attendants and yard owners work one-handed, standing up, often in bright sunlight. Design mobile-first at **360px width**, then widen.
2. **Fast over fancy.** The in-app screens are plain, light and quick. Animation and drama belong to the marketing and auth pages only.
3. **Money and stock are never ambiguous.** Amounts, quantities and statuses must be readable at a glance, with the unit next to every number.
4. **One way to do each thing.** Reuse shared components and tokens. Do not invent a new button, card or badge style on a page.
5. **Accessible by default.** Text must be readable outdoors (see section 9). Never rely on color alone.

---

## 2. Stack (Current)

- React 19, Vite, **Tailwind CSS 3**, `react-router` v7
- Icons: `lucide-react` (one icon family only)
- Animation: `motion` plus a few CSS keyframes in `index.css`
- Fonts: Inter (text) and JetBrains Mono (labels, numbers), loaded from Google Fonts
- No external component library. Shared components live in `frontend/src/components/shared/`.

---

## 3. Color

### Brand and neutral tokens (Current, `tailwind.config.js`)

| Token | Hex | Use |
|---|---|---|
| `fuelo-coral` | `#CC8066` | Brand accent: active nav, highlights, selection, coral buttons |
| `fuelo-ink` | `#111827` | Primary text, primary buttons, modal backdrop |
| `fuelo-slate` | `#334155` | Primary button hover |
| `fuelo-surface` | `#191C21` | Dark surface: login, signup, pricing, hero panels, page background behind the auth screens |
| `fuelo-muted` | `#4B5563` | Secondary text (defined, rarely used) |
| `fuelo-line` | `#E5E7EB` | Borders (defined, rarely used; code uses `slate-200`) |
| `fuelo-soft` | `#F8FAFC` | Soft background (defined, rarely used) |
| `fuelo-bg` | `#FFFFFF` | White |

Anything else uses Tailwind's default **slate** scale for neutrals.

### Status colors (Current, ad hoc, to be tokenised)

| Meaning | Tailwind colors used today |
|---|---|
| Danger / error / destructive | `red-600` (text, buttons), `red-50` (backgrounds) |
| Success / positive | `emerald-600` / `emerald-700` text, `emerald-50` background |
| Warning / caution | `amber-700` text, `amber-50` background, `amber-200` border |
| Info | `blue-500` (rarely) |

### Rules
- **Use tokens, not hex codes.** No raw hex values in components. (Today `index.css` has a few; see section 12.)
- **Status colors carry meaning, so use them only for status:** red for errors and destructive actions, green for success and money received, amber for warnings and caps, never decoratively.
- **Do not use color alone.** Pair status color with an icon or text ("Voided", "Overdue", "Low stock").
- Coral is an accent, not a status. Do not use it for success or error.

---

## 4. Typography

### Current
- **Inter** for all text, weights 400 to 800. **JetBrains Mono** for labels and tabular figures.
- Common sizes: `text-sm` (14px) for body and controls, `text-xs` for helper text, headings `text-lg` to `text-2xl`.
- Signature element: **`.mono-label`**, tiny (10px) uppercase monospace with wide tracking, used above headings and for section labels.

### Rules
- Body text and form text: **14px minimum** (`text-sm`). Interactive labels: 12px minimum.
- Avoid text below 11px. The 10px `mono-label` and bottom-nav labels are a known exception (section 12).
- Numbers that line up in columns (amounts, quantities, balances) use tabular figures (`tabular-nums`) and right-align.
- Amounts: format with the shared formatter (Indian digit grouping, `₹` prefix, 2 decimals for money, 3 for timber volume). Never hand-format numbers in a component.
- Sentence case for buttons and labels. No ALL CAPS except `.mono-label`.

---

## 5. Shape, spacing and elevation

### Current
- **Radius:** `rounded-[8px]` for cards, inputs, buttons, modals (the dominant style). `rounded-full` for pills and avatars. A few `rounded-lg` and `rounded-[6px]` exist and are inconsistent.
- **Surfaces:** `.panel` = white, 8px radius, 1px `slate-200` border.
- **Controls:** `.control` = white input with `slate-200` border and a soft focus ring.
- **Shadows:** `shadow-panel` (resting cards) and `shadow-float` (modals, toasts).

### Rules
- **8px radius** for every box-like element. Pills use `rounded-full`.
- Spacing on the Tailwind 4px scale. Page gutters: `p-4` on mobile, `md:p-8` on desktop. Space between sections: `space-y-6`.
- One level of elevation for resting content (`.panel`, optionally `shadow-panel`), one for floating layers (`shadow-float`). Do not stack shadows.

---

## 6. Layout and navigation

### Current
- **Desktop (md and up):** fixed left sidebar (width 16rem) with the workspace switcher, grouped nav ("Workspace", "Manage") and sign-out. Content is offset `md:pl-64`, max width 1400px.
- **Mobile:** bottom tab bar (fixed, five items at most, filtered by permission) plus a horizontally scrollable strip of vertical-specific operation links (pump, timber) above the page content.
- **Auth and marketing pages:** dark `fuelo-surface` background, faint grid texture, a coral glow, fade-up entrance animations, "receipt stub" cards.
- A `TopBar` shows "Workspace / Fuelo" context.

### Rules
- **Every page must work at 360px** with no horizontal page scroll. Wide tables become stacked cards on mobile (see section 8).
- Primary action on a screen is reachable with the thumb. On mobile, a page's main action sits at the bottom (or in the `QuickAddFAB`), not top-right.
- Navigation items are shown by **role permission and vertical/plan flags**, never by hardcoded role names. The backend remains the source of truth; the UI only hides.
- Locked-by-plan items show the shared upgrade dialog; they are not silently hidden when the user could unlock them.

---

## 7. Components

All in `frontend/src/components/shared/`. **Use these. Do not copy their markup into pages.**

| Component | Purpose | Notes |
|---|---|---|
| `Button` | All buttons | Variants: `primary` (ink), `secondary` (outlined), `coral`, `ghost`, `danger`. Has `loading` state. |
| `Input`, `Textarea` | Form fields with label and error | Label above, error below in red |
| `PhoneInput`, `PillSelector` | Phone number, segmented choices | |
| `Modal` | Dialogs | Centered, `max-w-lg`, backdrop click closes |
| `Toast` | Transient feedback | Bottom-right, above the bottom nav on mobile |
| `EmptyState` | Nothing here yet | Always say what to do next |
| `SkeletonCard`, `LoadingSpinner` | Loading | Prefer skeletons for lists and cards |
| `Pagination`, `DateRangePicker` | Lists and reports | |
| `HighlightPill`, `MotionWord` | Marketing flourish | **Marketing/auth pages only** |
| `ErrorBoundary` | Crash containment | |

Planned shared components (see the cleanup in section 12): `Select`, `Badge`, `Alert`, `Table` (responsive), `Card`, `Stat`.

### Button rules
- One **primary** button per screen section. Secondary actions use `secondary` or `ghost`.
- Destructive or hard-to-undo actions (void, delete, reopen, cancel subscription) use `danger` and require a confirmation step with a **reason** where the backend asks for one.
- A button that triggers a request shows `loading` and is disabled while in flight, so repeated taps cannot double-submit a sale or a payment.

---

## 8. Patterns

### Forms
- Label above the field, helper text below, error replaces helper text in red.
- Validate on submit and on blur, never block typing. Keep entered data when a request fails.
- Money inputs: numeric keypad (`inputMode="decimal"`), no spinner arrows.
- Phone inputs: numeric keypad (`inputMode="tel"`).
- Server errors are shown as a readable message, never raw JSON or a status code.

### Data and tables
- **Mobile: stacked cards. Desktop: tables.** Same data, two layouts (see `TransactionCardList` and `TransactionTable`).
- Right-align numbers. Show units. Show status as a `Badge`, not just colored text.
- Always provide loading (skeleton), empty (`EmptyState`) and error states.

### Status and feedback
- **Toast** for quick confirmation ("Saved"). **Inline `Alert`** for problems the user must act on. **Modal** for confirmation of risky actions. **Banner** (`WorkspaceBillingNotice`) for workspace-wide state such as trial or read-only.
- Plan limits: warn at 80% usage, block at 100% with the upgrade dialog.

### Money and stock display
- Credit balance positive = **dues** (customer owes). Negative = **Customer credit** (never show a minus sign alone).
- Voided records stay visible, marked **Voided**, and are excluded from totals.
- Variances (shift, tank) show a sign and color: shortfall in red, surplus in amber (it still needs explaining), zero in neutral.

---

## 9. Accessibility (Rule)

Approximate contrast ratios against white, computed from the hex values (verify with a checker before relying on them):

| Pair | Approx. ratio | WCAG AA (4.5:1 body text) |
|---|---|---|
| `slate-400` text (mono labels) on white | ~2.6:1 | Fails |
| `slate-500` text on white | ~4.8:1 | Passes |
| `fuelo-coral` `#CC8066` text on white | ~3.1:1 | Fails for body text; OK only for large text and icons |
| White text on a `fuelo-coral` button | ~3.1:1 | Fails for 14px text |
| `fuelo-ink` on white | very high | Passes |

Rules:
- **Body and label text on white: at least `slate-500`.** Do not use `slate-400` or lighter for text people must read. Placeholder text is a hint, not a label.
- **Do not put small text in the brand coral on white.** Use a darker coral variant for text and for coral button backgrounds, chosen to reach 4.5:1 (the cleanup task defines it).
- **Touch targets at least 44 x 44px** (`min-h-11`). Today default buttons are about 40px tall.
- **Visible keyboard focus** on every interactive element (`focus-visible` ring).
- **Dialogs:** `role="dialog"`, `aria-modal`, an accessible title, focus moves in on open and returns on close, Esc closes, focus is trapped inside.
- **Toasts and alerts:** announced to screen readers (`role="status"` or `role="alert"`).
- **Icon-only buttons** (the modal close "×", the toast close) need an `aria-label`.
- **Forms:** errors linked with `aria-describedby`, invalid fields `aria-invalid`.
- **Motion:** respect `prefers-reduced-motion`. The marquee and glow animations switch off.
- Never convey meaning by color alone (section 3).

---

## 10. Motion

- Marketing and auth pages: entrance fades (`animate-fade-up`), the pulsing glow, the marquee. These are decorative.
- In-app screens: only subtle transitions (hover, focus, modal open). No entrance animations on data screens.
- Keep animations under 600ms and always honor reduced motion.

---

## 11. Content and voice

- Plain, short, direct English. Say what happened and what to do ("Not enough stock. 3 litres available.").
- Use the words owners use: **udhaar / credit**, **bill / invoice**, **stock**. The glossary of core terms (sale, credit, payment, void, shift, tank, delivery, supplier, purchase) must be used consistently across screens, messages and PDFs.
- Never blame the user. Never show internal error text, stack traces or IDs without a human explanation.
- Tax and legal screens carry the note: "Tax settings are set by you. Confirm rates, HSN codes and invoice format with your CA."
- UI language is English for now. WhatsApp messages can be English or Hinglish (a workspace setting).

---

## 12. Known gaps (to fix in the design cleanup)

1. **Raw hex values** in `index.css` (`#191c21`, `#0f172a`, `#cc8066`, `#111827`) instead of tokens.
2. **Leftover Vite template CSS** in `App.css` (`.counter`, `.hero`) is unused.
3. **Status colors are not tokens**; usage is ad hoc (about 100 uses of red, amber and emerald classes).
4. **Missing shared components:** `Select`, `Badge`, `Alert`, `Table`, `Card`, `Stat`. Newer pump and timber pages repeat markup instead.
5. **Contrast failures** listed in section 9 (mono labels, coral text, white on coral buttons, placeholders).
6. **Touch targets** about 40px; bottom-nav labels are 10px.
7. **Dialog and toast accessibility** (role, focus trap, aria-labels) is incomplete.
8. **Radius inconsistency:** a handful of `rounded-lg` and `rounded-[6px]`.
9. **Fonts load from Google at runtime** (privacy, speed, offline). Consider self-hosting.
10. **No `prefers-reduced-motion` handling.**
11. **No component showcase page**, so appearance drift is hard to spot.

---

## 13. Checklist for any new screen

- [ ] Works at 360px with no horizontal scroll
- [ ] Uses shared components and tokens only (no raw hex, no copied markup)
- [ ] One primary action; destructive actions confirmed
- [ ] Loading, empty and error states exist
- [ ] Amounts and quantities formatted with the shared formatter, with units
- [ ] Text contrast at least 4.5:1; touch targets at least 44px; visible focus
- [ ] Status shown with text or icon, not color alone
- [ ] Buttons that send requests show `loading` and block double submit
- [ ] Hidden by permission and plan flags from the session, not by role name
