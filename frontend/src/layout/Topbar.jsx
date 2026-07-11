import { useAuth } from '../auth/AuthContext';
import { ROLE_LABELS } from '../lib/roles';
import Button from '../components/Button';
import styles from './Topbar.module.css';

// App title, current user (name + role), and logout.
export default function Topbar() {
  const { user, logout } = useAuth();
  return (
    <header className={styles.topbar}>
      <div className={styles.title}>نظام إدارة صالة سعد</div>
      <div className={styles.right}>
        {user && (
          <div className={styles.user}>
            <span className={styles.userName}>{user.name}</span>
            <span className={styles.userRole}>{ROLE_LABELS[user.role] || user.role}</span>
          </div>
        )}
        <Button variant="secondary" onClick={logout}>
          تسجيل الخروج
        </Button>
      </div>
    </header>
  );
}
