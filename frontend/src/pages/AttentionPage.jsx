import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { subscriptionsApi } from '../api/subscriptions';
import { useToast } from '../components/ToastProvider';
import { formatDate, formatMoney, formatPhone } from '../lib/format';
import Card from '../components/Card';
import Table from '../components/Table';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import styles from './AttentionPage.module.css';

// المتابعة (Phase 3b) — the front desk's daily follow-up: subscriptions due for
// renewal (ending soon / expired) and members who still owe money. In-app only;
// WhatsApp reminders to members come in Phase 5.
const WINDOWS = [7, 14, 30];

// "ends in N days" / "today" / "expired N days ago" in Arabic.
function renewalWhen(daysLeft, isExpired) {
  if (isExpired || daysLeft < 0) {
    const ago = Math.abs(daysLeft);
    return { text: ago <= 0 ? 'منتهية اليوم' : `منتهية منذ ${ago} يوم`, urgent: true };
  }
  if (daysLeft === 0) return { text: 'تنتهي اليوم', urgent: true };
  return { text: `خلال ${daysLeft} يوم`, urgent: daysLeft <= 3 };
}

export default function AttentionPage() {
  const navigate = useNavigate();
  const toast = useToast();

  const [within, setWithin] = useState(7);
  const [data, setData] = useState(null); // { renewals, dues }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setData(await subscriptionsApi.attention({ within }));
    } catch (err) {
      setError(true);
      toast.error(err.message || 'تعذّر تحميل المتابعة');
    } finally {
      setLoading(false);
    }
  }, [within, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const renewals = data?.renewals || [];
  const dues = data?.dues || [];

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>المتابعة</h1>
        <p className={styles.subtitle}>التجديدات المستحقة والمديونيات</p>
      </div>

      {loading ? (
        <div className={styles.center}>
          <Spinner label="جارٍ التحميل…" />
        </div>
      ) : error ? (
        <EmptyState icon="⚠️" title="تعذّر تحميل المتابعة" hint="تحقّق من تشغيل الخادم وحاول مجددًا." />
      ) : (
        <>
          {/* Renewals due */}
          <Card className={styles.section}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>
                تجديدات مستحقة{' '}
                <span className={styles.count}>
                  (<span className="num">{renewals.length}</span>)
                </span>
              </h2>
              <div className={styles.windows}>
                <span className={styles.windowsLabel}>خلال</span>
                {WINDOWS.map((w) => (
                  <button
                    key={w}
                    type="button"
                    className={`${styles.chip} ${within === w ? styles.chipActive : ''}`}
                    onClick={() => setWithin(w)}
                  >
                    <span className="num">{w}</span> يوم
                  </button>
                ))}
              </div>
            </div>

            {renewals.length === 0 ? (
              <p className={styles.empty}>لا توجد تجديدات مستحقة خلال هذه الفترة. 👍</p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>العضو</th>
                    <th>الهاتف</th>
                    <th>الخطة</th>
                    <th>تنتهي في</th>
                    <th>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {renewals.map((r) => {
                    const when = renewalWhen(r.days_left, r.is_expired);
                    return (
                      <tr
                        key={r.subscription_id}
                        className={styles.row}
                        onClick={() => navigate(`/members/${r.member_id}`)}
                      >
                        <td>{r.member_name}</td>
                        <td>
                          <span className="num">{formatPhone(r.phone)}</span>
                        </td>
                        <td>{r.plan_name}</td>
                        <td>
                          <span className="num">{formatDate(r.end_date)}</span>
                        </td>
                        <td>
                          <span className={when.urgent ? styles.urgent : styles.soon}>
                            {when.text}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </Card>

          {/* Outstanding balances */}
          <Card className={styles.section}>
            <h2 className={styles.sectionTitle}>
              مديونيات{' '}
              <span className={styles.count}>
                (<span className="num">{dues.length}</span>)
              </span>
            </h2>

            {dues.length === 0 ? (
              <p className={styles.empty}>لا توجد مديونيات — الجميع سدّدوا بالكامل. 🎉</p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>العضو</th>
                    <th>الهاتف</th>
                    <th>الخطة</th>
                    <th>الإجمالي</th>
                    <th>مدفوع</th>
                    <th>المتبقّي</th>
                  </tr>
                </thead>
                <tbody>
                  {dues.map((d) => (
                    <tr
                      key={d.subscription_id}
                      className={styles.row}
                      onClick={() => navigate(`/members/${d.member_id}`)}
                    >
                      <td>{d.member_name}</td>
                      <td>
                        <span className="num">{formatPhone(d.phone)}</span>
                      </td>
                      <td>{d.plan_name}</td>
                      <td>
                        <span className="num">{formatMoney(d.agreed_total)}</span>
                      </td>
                      <td>
                        <span className="num">{formatMoney(d.amount_paid)}</span>
                      </td>
                      <td>
                        <span className={styles.owing}>
                          <span className="num">{formatMoney(d.balance)}</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
