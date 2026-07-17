// Chart colors for the dashboard (Phase 6). These mirror the design tokens in
// styles/tokens.css — Recharts renders SVG fills and can't read CSS custom
// properties, so the hex values are duplicated here. Keep them in sync with
// tokens.css if the palette ever changes.
//
// DESIGN_SYSTEM.md rule: the status colors map 1:1 to membership status and must
// never be reused for anything else. So generic/financial charts use the BRAND
// orange (or charcoal), and only the status breakdown chart uses STATUS_COLORS.

export const BRAND = '#f97316'; // --color-primary (revenue, new members, generic)
export const CHARCOAL = '#18181b'; // --color-text
export const GRID = '#e4e4e7'; // --color-border (axes / gridlines)
export const MUTED = '#6b7280'; // axis labels / secondary text

// Membership status → color. Legitimate use of the status palette (this chart IS
// the status breakdown). Order matches the API's status_breakdown order.
export const STATUS_COLORS = {
  active: '#16a34a', // --color-status-active (green)
  frozen: '#2563eb', // --color-status-frozen (blue)
  expired: '#dc2626', // --color-status-expired (red)
  cancelled: '#6b7280', // --color-status-cancelled (gray)
};
