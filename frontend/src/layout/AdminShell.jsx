import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import styles from './AdminShell.module.css';

// The admin chrome: sidebar (rendered first → sits on the RIGHT under RTL) +
// topbar + content area. Child routes render into <Outlet />.
export default function AdminShell() {
  return (
    <div className={styles.shell}>
      <Sidebar />
      <div className={styles.main}>
        <Topbar />
        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
