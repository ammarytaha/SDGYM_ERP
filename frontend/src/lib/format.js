// Display formatting for numbers the design system says must stay legible:
// phones and dates. Both render inside elements with the `.num` class (Inter,
// tabular figures) at the call site.

/**
 * Format a member's joined date to YYYY-MM-DD.
 *
 * The API may return the DATE as a plain 'YYYY-MM-DD' string or (once JSON-
 * serialised from a pg Date) as a UTC ISO timestamp. Reading the LOCAL date
 * components reconstructs the intended calendar day for both forms in this
 * (Egypt, UTC+2/+3) deployment.
 */
export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Light grouping for readability. Egyptian mobile numbers (11 digits) become
 * "0100 000 0001"; anything else is returned trimmed and unchanged.
 */
export function formatPhone(phone) {
  if (!phone) return '—';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 11) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  return String(phone).trim();
}

/**
 * Format a price (number or pg-numeric string) as Egyptian Pounds, e.g.
 * 2800 -> "2,800 ج.م". Comma-grouped so the digits stay a single LTR run
 * (safe inside RTL text); drops the ".00" on whole amounts.
 */
export function formatMoney(value) {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  const hasFraction = n % 1 !== 0;
  const formatted = n.toLocaleString('en-US', {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return `${formatted} ج.م`;
}
