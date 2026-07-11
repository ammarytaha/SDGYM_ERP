import styles from './EmptyState.module.css';

// Centered placeholder for "no data" / "no results" / error states.
export default function EmptyState({ icon = '📭', title, hint }) {
  return (
    <div className={styles.empty}>
      <div className={styles.icon} aria-hidden="true">
        {icon}
      </div>
      {title && <p className={styles.title}>{title}</p>}
      {hint && <p className={styles.hint}>{hint}</p>}
    </div>
  );
}
