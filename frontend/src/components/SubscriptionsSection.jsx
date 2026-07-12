import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { subscriptionsApi } from '../api/subscriptions';
import { useToast } from './ToastProvider';
import { formatDate, formatMoney } from '../lib/format';
import Button from './Button';
import Spinner from './Spinner';
import StatusBadge from './StatusBadge';
import styles from './SubscriptionsSection.module.css';

// Member profile → subscription history + lifecycle actions (Phase 2). Reused
// StatusBadge because subscription statuses share the member status vocabulary.
// Cancel uses an inline confirm (not window.confirm) so it never blocks.
export default function SubscriptionsSection({ memberId, canManage, onMemberChanged }) {
  const navigate = useNavigate();
  const toast = useToast();

  const [subs, setSubs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [confirmCancelId, setConfirmCancelId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setSubs(await subscriptionsApi.listForMember(memberId));
    } catch (err) {
      setError(true);
      toast.error(err.message || 'تعذّر تحميل الاشتراكات');
    } finally {
      setLoading(false);
    }
  }, [memberId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function doAction(sub, action) {
    setBusyId(sub.id);
    try {
      await subscriptionsApi.patch(sub.id, action);
      toast.success(
        action === 'freeze'
          ? 'تم تجميد الاشتراك.'
          : action === 'unfreeze'
            ? 'تم إلغاء التجميد.'
            : 'تم إلغاء الاشتراك.'
      );
      setConfirmCancelId(null);
      await load();
      onMemberChanged?.(); // refresh the member badge (status synced server-side)
    } catch (err) {
      toast.error(err.message || 'تعذّر تنفيذ العملية، حاول مجددًا.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className={styles.section}>
      <div className={styles.head}>
        <h2 className={styles.title}>الاشتراكات</h2>
        {canManage && (
          <Button variant="primary" onClick={() => navigate(`/members/${memberId}/subscribe`)}>
            اشتراك جديد / تجديد
          </Button>
        )}
      </div>

      {loading ? (
        <div className={styles.center}>
          <Spinner />
        </div>
      ) : error ? (
        <p className={styles.empty}>تعذّر تحميل الاشتراكات.</p>
      ) : subs.length === 0 ? (
        <p className={styles.empty}>لا توجد اشتراكات بعد — أنشئ أول اشتراك لهذا العضو.</p>
      ) : (
        <ul className={styles.list}>
          {subs.map((sub) => (
            <li key={sub.id} className={styles.item}>
              <div className={styles.itemMain}>
                <div className={styles.itemTop}>
                  <span className={styles.planName}>{sub.plan_name}</span>
                  <StatusBadge status={sub.status} />
                  {sub.is_expired && <span className={styles.expiredTag}>انتهت المدة</span>}
                </div>
                <div className={styles.dates}>
                  <span className="num">{formatDate(sub.start_date)}</span>
                  <span className={styles.arrow} aria-hidden="true">
                    ←
                  </span>
                  <span className="num">{formatDate(sub.end_date)}</span>
                </div>
                {/* Installment balance (Phase 3b). */}
                <div className={styles.balance}>
                  <span className={styles.balanceItem}>
                    الإجمالي <span className="num">{formatMoney(sub.agreed_total)}</span>
                  </span>
                  <span className={styles.dot} aria-hidden="true">
                    ·
                  </span>
                  <span className={styles.balanceItem}>
                    مدفوع <span className="num">{formatMoney(sub.amount_paid)}</span>
                  </span>
                  {sub.is_paid ? (
                    <span className={styles.paidFull}>مدفوع بالكامل</span>
                  ) : (
                    <span className={styles.owing}>
                      متبقّي <span className="num">{formatMoney(sub.balance)}</span>
                    </span>
                  )}
                </div>
              </div>

              {canManage && (sub.status === 'active' || sub.status === 'frozen') && (
                <div className={styles.itemActions}>
                  {sub.status === 'active' && (
                    <Button
                      variant="secondary"
                      disabled={busyId === sub.id}
                      onClick={() => doAction(sub, 'freeze')}
                    >
                      تجميد
                    </Button>
                  )}
                  {sub.status === 'frozen' && (
                    <Button
                      variant="secondary"
                      disabled={busyId === sub.id}
                      onClick={() => doAction(sub, 'unfreeze')}
                    >
                      إلغاء التجميد
                    </Button>
                  )}
                  {confirmCancelId === sub.id ? (
                    <span className={styles.confirm}>
                      <span className={styles.confirmText}>تأكيد الإلغاء؟</span>
                      <Button
                        variant="danger"
                        disabled={busyId === sub.id}
                        onClick={() => doAction(sub, 'cancel')}
                      >
                        نعم، ألغِ
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={busyId === sub.id}
                        onClick={() => setConfirmCancelId(null)}
                      >
                        تراجع
                      </Button>
                    </span>
                  ) : (
                    <Button
                      variant="danger"
                      disabled={busyId === sub.id}
                      onClick={() => setConfirmCancelId(sub.id)}
                    >
                      إلغاء
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
