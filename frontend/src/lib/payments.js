// Payment methods (Phase 3). Mirrors the backend `payment_method` enum. Kept
// here so the picker options and the display labels never drift apart.

export const PAYMENT_METHODS = [
  { value: 'cash', label: 'نقدًا' },
  { value: 'card_manual', label: 'بطاقة (يدوي)' },
  { value: 'other', label: 'أخرى' },
];

const LABELS = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.value, m.label]));

/** Arabic label for a payment method value; falls back to the raw value. */
export function methodLabel(method) {
  return LABELS[method] || method || '—';
}
