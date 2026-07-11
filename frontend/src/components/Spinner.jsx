import styles from './Spinner.module.css';

// Simple loading spinner with an optional label. role=status for a11y.
export default function Spinner({ label }) {
  return (
    <div className={styles.wrap} role="status" aria-live="polite">
      <span className={styles.spinner} aria-hidden="true" />
      {label && <span className={styles.label}>{label}</span>}
    </div>
  );
}
