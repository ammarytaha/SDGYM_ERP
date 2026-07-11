import styles from './Field.module.css';

// Labeled text input. Label is right-aligned (RTL), input has generous height
// for touch use. Pass `error` (string) to show a validation message and error
// styling. Any extra props (type, value, onChange, dir, ...) pass to <input>.
export default function Field({ label, id, error, className = '', ...inputProps }) {
  return (
    <div className={styles.field}>
      {label && (
        <label htmlFor={id} className={styles.label}>
          {label}
        </label>
      )}
      <input
        id={id}
        className={`${styles.input} ${error ? styles.inputError : ''} ${className}`}
        aria-invalid={error ? 'true' : undefined}
        {...inputProps}
      />
      {error && <span className={styles.error}>{error}</span>}
    </div>
  );
}
