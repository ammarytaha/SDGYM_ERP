import { useEffect, useState, useCallback } from 'react';
import { notificationsApi } from '../api/notifications';
import { useToast } from './ToastProvider';
import { formatDateTime } from '../lib/format';
import { notificationTypeLabel } from '../lib/notifications';
import Spinner from './Spinner';
import styles from './NotificationsSection.module.css';

// Member profile → WhatsApp notification history (Phase 5). Read-only for all
// roles; shows what was sent (or failed), newest first.
export default function NotificationsSection({ memberId }) {
  const toast = useToast();

  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setItems(await notificationsApi.listForMember(memberId));
    } catch (err) {
      setError(true);
      toast.error(err.message || 'تعذّر تحميل الإشعارات');
    } finally {
      setLoading(false);
    }
  }, [memberId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className={styles.section}>
      <h2 className={styles.title}>الإشعارات</h2>

      {loading ? (
        <div className={styles.center}>
          <Spinner />
        </div>
      ) : error ? (
        <p className={styles.empty}>تعذّر تحميل الإشعارات.</p>
      ) : items.length === 0 ? (
        <p className={styles.empty}>لا توجد إشعارات مُرسَلة بعد.</p>
      ) : (
        <ul className={styles.list}>
          {items.map((n) => (
            <li key={n.id} className={styles.item}>
              <span className={styles.type}>{notificationTypeLabel(n.type)}</span>
              <span className={`num ${styles.time}`}>{formatDateTime(n.sent_at)}</span>
              <span className={n.status === 'sent' ? styles.sent : styles.failed}>
                {n.status === 'sent' ? 'تم الإرسال' : 'فشل'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
