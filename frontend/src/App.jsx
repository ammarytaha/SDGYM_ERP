// Phase 0 placeholder screen. NOT a real spec screen — its only job is to prove
// the scaffold renders: Arabic RTL layout, Cairo/Inter fonts, and the design
// tokens (brand + status colors, card/badge shapes). Replaced by real screens
// (login, dashboard, ...) in later phases.

// The four membership statuses, each mapped to its design-system status color.
const STATUSES = [
  { key: 'active', label: 'نشط', color: 'var(--color-status-active)' },
  { key: 'frozen', label: 'مُجمّد', color: 'var(--color-status-frozen)' },
  { key: 'expired', label: 'منتهٍ', color: 'var(--color-status-expired)' },
  { key: 'cancelled', label: 'ملغى', color: 'var(--color-status-cancelled)' },
];

function StatusBadge({ label, color }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '4px 12px',
        borderRadius: 'var(--radius-badge)',
        backgroundColor: color,
        color: '#fff',
        fontSize: '14px',
        fontWeight: 600,
      }}
    >
      {label}
    </span>
  );
}

export default function App() {
  return (
    <div style={{ minHeight: '100vh', padding: 'var(--space-8)' }}>
      <header style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ margin: 0, color: 'var(--color-primary)', fontSize: '28px' }}>
          نظام إدارة صالة سعد
        </h1>
        <p style={{ margin: '4px 0 0', color: 'var(--color-status-cancelled)' }}>
          الإصدار التجريبي — المرحلة صفر (تهيئة المشروع)
        </p>
      </header>

      <section
        style={{
          maxWidth: '520px',
          padding: 'var(--space-6)',
          backgroundColor: '#fff',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-card)',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.06)',
        }}
      >
        <h2 style={{ marginTop: 0, fontSize: '18px' }}>الواجهة تعمل ✅</h2>
        <p style={{ marginBottom: 'var(--space-4)' }}>
          الاتجاه من اليمين لليسار، والخطوط، والألوان مطبّقة من نظام التصميم.
        </p>

        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
          {STATUSES.map((s) => (
            <StatusBadge key={s.key} label={s.label} color={s.color} />
          ))}
        </div>

        {/* Numbers use Inter + tabular figures per the typography rule. */}
        <p className="num" style={{ margin: 0 }}>
          مثال أرقام: 01000-123-456 · 750.00 ج.م · 2026-07-11
        </p>
      </section>
    </div>
  );
}
