// Single source of truth for membership status → Arabic label + design-system
// color. Mirrors the backend `member_status` enum (spec §4 / Phase 1a). Any
// screen that shows a status (list, profile, badges, filters) reads from here so
// labels and colors never drift.

export const STATUS_MAP = {
  active: { label: 'نشط', colorVar: '--color-status-active' },
  frozen: { label: 'مُجمّد', colorVar: '--color-status-frozen' },
  expired: { label: 'منتهٍ', colorVar: '--color-status-expired' },
  cancelled: { label: 'ملغى', colorVar: '--color-status-cancelled' },
};

// Ordered list for filter chips / dropdowns (excludes the "all" pseudo-option,
// which screens add themselves).
export const STATUS_OPTIONS = Object.entries(STATUS_MAP).map(([key, v]) => ({
  key,
  label: v.label,
  colorVar: v.colorVar,
}));
