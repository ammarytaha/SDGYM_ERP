import styles from './Select.module.css';

// Labeled <select>, styled to match Field (right-aligned RTL label, touch
// height, error state). `options` is [{ value, label }]. Any extra props
// (value, onChange, disabled, ...) pass through to the native <select>.
export default function Select({ label, id, error, options = [], className = '', ...selectProps }) {
  return (
    <div className={styles.field}>
      {label && (
        <label htmlFor={id} className={styles.label}>
          {label}
        </label>
      )}
      <div className={styles.selectWrap}>
        <select
          id={id}
          className={`${styles.select} ${error ? styles.selectError : ''} ${className}`}
          aria-invalid={error ? 'true' : undefined}
          {...selectProps}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <span className={styles.chevron} aria-hidden="true">
          ▾
        </span>
      </div>
      {error && <span className={styles.error}>{error}</span>}
    </div>
  );
}
