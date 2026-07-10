# Saad Gym — Design System

Read this file before building any component or screen. Don't invent colors,
spacing, or shapes ad hoc, everything should trace back to a rule here.

## Brand direction

Energetic and confident (it's a gym), but grounded and trustworthy (this is an
admin tool handling money and membership data, not a marketing site). Bold, not
flashy.

## Colors

| Role | Color | Hex |
|---|---|---|
| Primary/brand accent | Warm orange | `#F97316` |
| Text / dark elements | Charcoal | `#18181B` |
| Background | Off-white | `#FAFAFA` |
| Border/divider | Light gray | `#E4E4E7` |

### Status colors (map directly to membership status — must be instantly
### distinguishable, do not substitute or reuse these for anything else)

| Status | Color | Hex |
|---|---|---|
| Active | Green | `#16A34A` |
| Frozen | Blue | `#2563EB` |
| Expired | Red | `#DC2626` |
| Cancelled | Gray | `#6B7280` |

Brand orange is never used for status indicators, to avoid confusion with these
semantic colors.

Implement as CSS custom properties (`--color-primary`, `--color-status-active`,
etc.) so dark mode can be added later without a rewrite, even though dark mode
is out of scope for MVP (light mode only for now).

## Typography

- Arabic: **Cairo**
- Latin characters & numbers: **Inter**
- Numbers (prices, phone numbers, dates) must stay clearly legible at a glance,
  don't shrink these below body text size

## Shape language

- Buttons: 8-12px border radius. Grounded and confident, not full pill shapes
- Cards: 12-16px border radius, subtle border or low-opacity shadow
- Status badges: fully rounded (pill shape) — the one exception, since small
  scannable tags benefit from this shape
- Tables: wrapped in a card, row hover state, status shown as a colored pill
  badge inline

## Layout

- All screens: `dir="rtl"`, Arabic first
- **Admin shell** (dashboard, members, subscriptions, payments, notification
  log): sidebar navigation on the right (RTL reading direction) + topbar +
  content area. Sidebar collapses to a hamburger/bottom-nav on mobile widths
- **Check-in kiosk screen**: separate full-screen layout, NO sidebar or admin
  chrome. Large central card: member photo, name, status badge. Sized to be
  readable from about a meter away (tablet at the front desk). Large touch
  targets for any manual override buttons
- Forms: labels right-aligned (RTL), generous input height for tablet/touch use
  at the front desk

## Components checklist

Before building a new component type, check whether it fits an existing
pattern above rather than introducing a new style:
- Buttons (primary/secondary/danger — danger uses the expired-red, not a new red)
- Cards
- Tables
- Status badges
- Form inputs
- Modals (confirmations: freeze, cancel, payment entry)
- Toast notifications (success/error, using status colors above)
