import { useEffect, useState, useCallback } from 'react';
import { paymentsApi } from '../api/payments';
import { subscriptionsApi } from '../api/subscriptions';
import { useToast } from './ToastProvider';
import { formatDate, formatMoney } from '../lib/format';
import { PAYMENT_METHODS, methodLabel } from '../lib/payments';
import Button from './Button';
import Spinner from './Spinner';
import Field from './Field';
import Select from './Select';
import styles from './PaymentsSection.module.css';

// Member profile → payment history + a standalone "record payment" form (Phase 3).
// A payment always ties to a subscription, so recording one needs at least one
// subscription (the picker defaults to the member's current active/frozen one).
// Creating a payment isn't destructive, so there's no confirm step.
export default function PaymentsSection({ memberId, canManage }) {
  const toast = useToast();

  const [payments, setPayments] = useState(null);
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [subId, setSubId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [notes, setNotes] = useState('');
  const [amountError, setAmountError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      // Payments to show; subscriptions to populate the "which subscription" picker.
      const [pays, subscriptions] = await Promise.all([
        paymentsApi.listForMember(memberId),
        subscriptionsApi.listForMember(memberId),
      ]);
      setPayments(pays);
      setSubs(subscriptions);
    } catch (err) {
      setError(true);
      toast.error(err.message || 'تعذّر تحميل المدفوعات');
    } finally {
      setLoading(false);
    }
  }, [memberId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  // The subscription a new payment defaults to: the current active/frozen one,
  // else the most recent (subs come back newest-first from the API).
  function defaultSubId() {
    const current = subs.find((s) => s.status === 'active' || s.status === 'frozen');
    return String((current || subs[0])?.id ?? '');
  }

  function openForm() {
    setSubId(defaultSubId());
    setAmount('');
    setMethod('cash');
    setNotes('');
    setAmountError('');
    setShowForm(true);
  }

  async function handleCreate(e) {
    e.preventDefault();
    const amt = Number(amount);
    if (!(amt > 0)) {
      setAmountError('أدخل مبلغًا أكبر من صفر.');
      return;
    }
    if (!subId) {
      toast.error('اختر الاشتراك الذي تخص الدفعة.');
      return;
    }
    setSaving(true);
    try {
      await paymentsApi.create({
        member_id: Number(memberId),
        subscription_id: Number(subId),
        amount: amt,
        method,
        notes: notes.trim() || undefined,
      });
      toast.success('تم تسجيل الدفعة.');
      setShowForm(false);
      await load();
    } catch (err) {
      toast.error(err.message || 'تعذّر تسجيل الدفعة، حاول مجددًا.');
    } finally {
      setSaving(false);
    }
  }

  const subOptions = subs.map((s) => ({
    value: String(s.id),
    label: `${s.plan_name} — ${formatDate(s.start_date)} ← ${formatDate(s.end_date)}`,
  }));

  return (
    <div className={styles.section}>
      <div className={styles.head}>
        <h2 className={styles.title}>المدفوعات</h2>
        {canManage &&
          !showForm &&
          (subs.length > 0 ? (
            <Button variant="primary" onClick={openForm}>
              + تسجيل دفعة
            </Button>
          ) : (
            !loading && <span className={styles.hint}>أنشئ اشتراكًا أولًا لتسجيل دفعة.</span>
          ))}
      </div>

      {canManage && showForm && (
        <form className={styles.form} onSubmit={handleCreate} noValidate>
          <Select
            label="الاشتراك"
            id="pay_sub"
            options={subOptions}
            value={subId}
            onChange={(e) => setSubId(e.target.value)}
          />
          <Field
            label="المبلغ (ج.م) *"
            id="pay_amount"
            type="number"
            dir="ltr"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setAmountError('');
            }}
            error={amountError}
          />
          <Select
            label="طريقة الدفع"
            id="pay_method"
            options={PAYMENT_METHODS}
            value={method}
            onChange={(e) => setMethod(e.target.value)}
          />
          <Field
            label="ملاحظات (اختياري)"
            id="pay_notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <div className={styles.formActions}>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? 'جارٍ الحفظ…' : 'حفظ الدفعة'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={saving}
              onClick={() => setShowForm(false)}
            >
              إلغاء
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <div className={styles.center}>
          <Spinner />
        </div>
      ) : error ? (
        <p className={styles.empty}>تعذّر تحميل المدفوعات.</p>
      ) : payments.length === 0 ? (
        <p className={styles.empty}>لا توجد مدفوعات بعد.</p>
      ) : (
        <ul className={styles.list}>
          {payments.map((pay) => (
            <li key={pay.id} className={styles.item}>
              <div className={styles.itemMain}>
                <span className={styles.amount}>
                  <span className="num">{formatMoney(pay.amount)}</span>
                </span>
                <span className={styles.meta}>
                  {methodLabel(pay.method)} · <span className="num">{formatDate(pay.paid_date)}</span>
                  {' · '}
                  {pay.plan_name}
                </span>
                {pay.notes && <span className={styles.notes}>{pay.notes}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
