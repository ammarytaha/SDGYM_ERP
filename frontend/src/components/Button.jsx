import styles from './Button.module.css';

// Button variants per DESIGN_SYSTEM.md: primary (brand orange), secondary
// (outline), danger (expired-red — reused deliberately, no new red).
export default function Button({
  variant = 'primary',
  type = 'button',
  className = '',
  ...props
}) {
  const variantClass = styles[variant] || styles.primary;
  return (
    <button
      type={type}
      className={`${styles.btn} ${variantClass} ${className}`}
      {...props}
    />
  );
}
