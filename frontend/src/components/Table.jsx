import styles from './Table.module.css';

// Card-wrapped table with row hover (DESIGN_SYSTEM.md). Horizontally scrolls
// inside its own container on narrow screens so the page never scrolls sideways.
// Callers supply <thead>/<tbody>.
export default function Table({ children }) {
  return (
    <div className={styles.wrap}>
      <table className={styles.table}>{children}</table>
    </div>
  );
}
