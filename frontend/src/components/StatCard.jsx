import Card from './Card';
import styles from './StatCard.module.css';

// A single at-a-glance KPI tile for the dashboard (Phase 6): a label, a big
// number, and an optional sub-note. `accent` (a CSS color) tints the value and a
// thin top bar — used only where it's meaningful (e.g. green for active members,
// brand orange for revenue); left off, the value is charcoal.
export default function StatCard({ label, value, sub, accent }) {
  const accentStyle = accent ? { color: accent } : undefined;
  return (
    <Card className={styles.tile}>
      {accent ? <span className={styles.bar} style={{ backgroundColor: accent }} /> : null}
      <span className={styles.label}>{label}</span>
      <span className={`num ${styles.value}`} style={accentStyle}>
        {value}
      </span>
      {sub ? <span className={styles.sub}>{sub}</span> : null}
    </Card>
  );
}
