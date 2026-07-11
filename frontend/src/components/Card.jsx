import styles from './Card.module.css';

// White surface with the design-system card radius + subtle border/shadow.
export default function Card({ className = '', children, ...props }) {
  return (
    <div className={`${styles.card} ${className}`} {...props}>
      {children}
    </div>
  );
}
