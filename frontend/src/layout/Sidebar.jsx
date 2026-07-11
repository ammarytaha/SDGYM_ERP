import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import styles from './Sidebar.module.css';

// Navigation. Members (Phase 1b) and Plans (Phase 2) are live; the rest are
// shown disabled ("قريبًا") so the overall structure is visible and lands in
// later phases. `ownerOnly` items only render for the owner (plan management).
const NAV = [
  { to: '/members', label: 'الأعضاء', icon: '👥', enabled: true },
  { to: '/plans', label: 'الخطط', icon: '🏷️', enabled: true, ownerOnly: true },
  { to: '/dashboard', label: 'لوحة التحكم', icon: '📊', enabled: false },
  { to: '/payments', label: 'المدفوعات', icon: '💵', enabled: false },
  { to: '/notifications', label: 'الإشعارات', icon: '🔔', enabled: false },
];

export default function Sidebar() {
  const { user } = useAuth();
  const items = NAV.filter((item) => !item.ownerOnly || user?.role === 'owner');

  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <span className={styles.brandMark} aria-hidden="true">
          💪
        </span>
        <span className={styles.brandName}>صالة سعد</span>
      </div>

      <nav className={styles.nav}>
        {items.map((item) =>
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
