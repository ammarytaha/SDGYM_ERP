import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { canManageMembers } from '../lib/roles';
import styles from './Sidebar.module.css';

// Navigation. Members (1b), Plans (2), and المتابعة (3b) are live; the rest are
// shown disabled ("قريبًا") so the overall structure is visible and lands in
// later phases. `ownerOnly` renders only for the owner (plan management);
// `staffOnly` renders for owner + front_desk (operational follow-up).
const NAV = [
  { to: '/members', label: 'الأعضاء', icon: '👥', enabled: true },
  { to: '/kiosk', label: 'شاشة الحضور', icon: '✅', enabled: true, staffOnly: true },
  { to: '/attention', label: 'المتابعة', icon: '📋', enabled: true, staffOnly: true },
  { to: '/plans', label: 'الخطط', icon: '🏷️', enabled: true, ownerOnly: true },
  { to: '/notifications', label: 'الإشعارات', icon: '🔔', enabled: true, staffOnly: true },
  { to: '/dashboard', label: 'لوحة التحكم', icon: '📊', enabled: false },
];

export default function Sidebar() {
  const { user } = useAuth();
  const items = NAV.filter((item) => {
    if (item.ownerOnly) return user?.role === 'owner';
    if (item.staffOnly) return canManageMembers(user?.role);
    return true;
  });

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
