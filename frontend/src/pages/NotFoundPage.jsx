import { Link } from 'react-router-dom';
import styles from './Stub.module.css';

export default function NotFoundPage() {
  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.icon} aria-hidden="true">
          🔎
        </div>
        <h1 className={styles.title}>الصفحة غير موجودة</h1>
        <p className={styles.text}>عذرًا، الصفحة المطلوبة غير متاحة.</p>
        <Link to="/members" className={styles.link}>
          → العودة إلى الأعضاء
        </Link>
      </div>
    </div>
  );
}
