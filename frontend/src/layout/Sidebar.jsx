import { NavLink } from 'react-router-dom';
import styles from './Sidebar.module.css';

// Navigation. Only Members is live in Phase 1b-i; the rest are shown disabled
// ("قريبًا") so the overall structure is visible and lands in later phases.
const NAV = [
  { to: '/members', label: 'الأعضاء', icon: '👥', enabled: true },
  { to: '/dashboard', label: 'لوحة التحكم', icon: '📊', enabled: false },
  { to: '/subscriptions', label: 'الاشتراكات', icon: '🎫', enabled: false },
  { to: '/payments', label: 'المدفوعات', icon: '💵', enabled: false },
  { to: '/notifications', label: 'الإشعارات', icon: '🔔', enabled: false },
];

export default function Sidebar() {
  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <span className={styles.brandMark} aria-hidden="true">
          💪
        </span>
        <span className={styles.brandName}>صالة سعد</span>
      </div>

      <nav className={styles.nav}>
        {NAV.map((item) =>
          item.enabled ? (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `${styles.link} ${isActive ? styles.active : ''}`
              }
            >
              <span className={styles.icon} aria-hidden="true">
                {item.icon}
              </span>
              <span className={styles.label}>{item.label}</span>
            </NavLink>
          ) : (
            <span
              key={item.to}
              className={`${styles.link} ${styles.disabled}`}
              title="قريبًا"
              aria-disabled="true"
            >
              <span className={styles.icon} aria-hidden="true">
                {item.icon}
              </span>
              <span className={styles.label}>{item.label}</span>
              <span className={styles.soon}>قريبًا</span>
            </span>
          )
        )}
      </nav>
    </aside>
  );
}
