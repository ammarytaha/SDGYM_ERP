import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { notificationsApi } from '../api/notifications';
import { useToast } from '../components/ToastProvider';
import { formatDateTime } from '../lib/format';
import { notificationTypeLabel } from '../lib/notifications';
import Card from '../components/Card';
import Table from '../components/Table';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import styles from './NotificationsPage.module.css';

// الإشعارات (Phase 5) — the WhatsApp message log across all members (spec §7 #7):
// what was sent (welcome / check-in / renewal / overdue) and whether it succeeded.
export default function NotificationsPage() {
  const navigate = useNavigate();
  const toast = useToast();

  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setItems(await notificationsApi.list());
    } catch (err) {
      setError(true);
      toast.error(err.message || 'تعذّر تحميل الإشعارات');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>الإشعارات</h1>
        <p className={styles.subtitle}>سجل رسائل واتساب المُرسَلة للأعضاء</p>
      </div>

      {loading ? (
        <div className={styles.center}>
          <Spinner label="جارٍ التحميل…" />
        </div>
      ) : error ? (
        <EmptyState icon="⚠️" title="تعذّر تحميل الإشعارات" hint="تحقّق من تشغيل الخادم وحاول مجددًا." />
      ) : items.length === 0 ? (
        <EmptyState icon="🔔" title="لا توجد إشعارات بعد" hint="ستظهر هنا الرسائل المُرسَلة للأعضاء." />
      ) : (
        <Card className={styles.card}>
          <Table>
            <thead>
              <tr>
                <th>العضو</th>
                <th>النوع</th>
                <th>الحالة</th>
                <th>التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {items.map((n) => (
                <tr
                  key={n.id}
                  className={styles.row}
                  onClick={() => navigate(`/members/${n.member_id}`)}
                >
                  <td>{n.member_name}</td>
                  <td>{notificationTypeLabel(n.type)}</td>
                  <td>
                    <span className={n.status === 'sent' ? styles.sent : styles.failed}>
                      {n.status === 'sent' ? 'تم الإرسال' : 'فشل'}
                    </span>
                  </td>
                  <td>
                    <span className="num">{formatDateTime(n.sent_at)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
