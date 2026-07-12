import { useEffect, useState, useCallback } from 'react';
import { checkinsApi } from '../api/checkins';
import { useToast } from './ToastProvider';
import { formatDateTime } from '../lib/format';
import Spinner from './Spinner';
import styles from './CheckinsSection.module.css';

// Member profile → check-in history (Phase 4). Read-only for all roles; lists both
// allowed entries and denied attempts, newest first.
const METHOD_LABELS = { qr: 'مسح رمز', manual: 'إدخال يدوي' };

export default function CheckinsSection({ memberId }) {
  const toast = useToast();

  const [checkins, setCheckins] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setCheckins(await checkinsApi.list({ member_id: memberId }));
    } catch (err) {
      setError(true);
      toast.error(err.message || 'تعذّر تحميل سجل الحضور');
    } finally {
      setLoading(false);
    }
  }, [memberId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className={styles.section}>
      <h2 className={styles.title}>سجل الحضور</h2>

      {loading ? (
        <div className={styles.center}>
          <Spinner />
        </div>
      ) : error ? (
        <p className={styles.empty}>تعذّر تحميل سجل الحضور.</p>
      ) : checkins.length === 0 ? (
        <p className={styles.empty}>لا يوجد حضور مسجَّل بعد.</p>
      ) : (
        <ul className={styles.list}>
          {checkins.map((c) => (
            <li key={c.id} className={styles.item}>
              <span className={c.result === 'allowed' ? styles.allowed : styles.denied}>
                {c.result === 'allowed' ? 'دخل' : 'مرفوض'}
              </span>
              <span className={`num ${styles.time}`}>{formatDateTime(c.checked_in_at)}</span>
              <span className={styles.method}>{METHOD_LABELS[c.method] || c.method}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
