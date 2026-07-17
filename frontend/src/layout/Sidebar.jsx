import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { canManageMembers } from '../lib/roles';
import styles from './Sidebar.module.css';

// Navigation. All items are live as of Phase 6. `ownerOnly` renders only for the
// owner (plan management + the dashboard's financials); `staffOnly` renders for
// owner + front_desk (operational follow-up). The disabled ("قريبًا") state is
// kept for any future items. Order is roughly the daily workflow, owner tools last.
const NAV = [
  { to: '/members', label: 'الأعضاء', icon: '👥', enabled: true },
  { to: '/kiosk', label: 'شاشة الحضور', icon: '✅', enabled: true, staffOnly: true },
  { to: '/attention', label: 'المتابعة', icon: '📋', enabled: true, staffOnly: true },
  { to: '/plans', label: 'الخطط', icon: '🏷️', enabled: true, ownerOnly: true },
  { to: '/notifications', label: 'الإشعارات', icon: '🔔', enabled: true, staffOnly: true },
  { to: '/dashboard', label: 'لوحة التحكم', icon: '📊', enabled: true, ownerOnly: true },
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
