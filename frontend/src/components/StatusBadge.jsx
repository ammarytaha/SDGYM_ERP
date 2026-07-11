import styles from './StatusBadge.module.css';
import { STATUS_MAP } from '../lib/statuses';

// Pill badge for a membership status. Color comes from the design-system status
// tokens via lib/statuses — never hardcoded here.
export default function StatusBadge({ status }) {
  const entry = STATUS_MAP[status];
  if (!entry) return null;
  return (
    <span className={styles.badge} style={{ backgroundColor: `var(${entry.colorVar})` }}>
      {entry.label}
    </span>
  );
}
