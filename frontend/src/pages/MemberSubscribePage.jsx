import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { membersApi } from '../api/members';
import { plansApi } from '../api/plans';
import { subscriptionsApi } from '../api/subscriptions';
import { useToast } from '../components/ToastProvider';
import { formatMoney } from '../lib/format';
import Card from '../components/Card';
import Field from '../components/Field';
import Select from '../components/Select';
import Button from '../components/Button';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import styles from './MemberSubscribePage.module.css';

// New subscription / renew (spec §7 #6). Picks a plan + start date and creates a
// subscription; end_date is previewed client-side and computed authoritatively
// server-side. Payment entry pairs with this in Phase 3.

// Local, timezone-safe date helpers (avoid Date() UTC drift on 'YYYY-MM-DD').
function todayISO() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
function addDays(isoDate, days) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${mm}-${dd}`;
}

export default function MemberSubscribePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [member, setMember] = useState(null);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [planId, setPlanId] = useState('');
  const [startDate, setStartDate] = useState(todayISO());
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [m, activePlans, subs] = await Promise.all([
        membersApi.get(id),
        plansApi.list({ active: true }),
        subscriptionsApi.listForMember(id),
      ]);
      setMember(m);
      setPlans(activePlans);
      if (activePlans.length > 0) setPlanId(String(activePlans[0].id));

      // Renewal: if there's a current (active/frozen) subscription, default the
      // start date to the day after its end so the new term stacks on top.
      const current = subs
        .filter((s) => s.status === 'active' || s.status === 'frozen')
        .sort((a, b) => (a.end_date < b.end_date ? 1 : -1))[0];
      if (current && current.end_date >= todayISO()) {
        setStartDate(addDays(current.end_date, 1));
      }
    } catch (err) {
      setLoadError(err);
      if (err.status !== 404) toast.error(err.message || 'تعذّر تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedPlan = useMemo(
    () => plans.find((p) => String(p.id) === planId),
    [plans, planId]
  );
  const endPreview = useMemo(
    () => (selectedPlan && startDate ? addDays(startDate, selectedPlan.duration_days) : ''),
    [selectedPlan, startDate]
  );

  async function handleSubmit(e) {
    e.preventDefault();
    if (!planId) {
      toast.error('اختر خطة أولًا.');
      return;
    }
    setSubmitting(true);
    try {
      await subscriptionsApi.create({
        member_id: Number(id),
        plan_id: Number(planId),
        start_date: startDate || undefined,
      });
      toast.success('تم إنشاء الاشتراك بنجاح.');
      navigate(`/members/${id}`);
    } catch (err) {
      toast.error(err.message || 'تعذّر إنشاء الاشتراك، حاول مجددًا.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className={styles.center}>
        <Spinner label="جارٍ التحميل…" />
      </div>
    );
  }

  if (loadError) {
    const notFound = loadError.status === 404;
    return (
      <div className={styles.page}>
        <div className={styles.topbar}>
          <Button variant="secondary" onClick={() => navigate(`/members/${id}`)}>
            → رجوع
          </Button>
        </div>
        <EmptyState
          icon={notFound ? '🔎' : '⚠️'}
          title={notFound ? 'العضو غير موجود' : 'تعذّر تحميل البيانات'}
          hint={notFound ? 'الرابط غير صحيح.' : 'تحقّق من تشغيل الخادم وحاول مجددًا.'}
        />
      </div>
    );
  }

  const planOptions = plans.map((p) => ({
    value: String(p.id),
    label: `${p.name} — ${p.duration_days} يوم — ${formatMoney(p.price)}`,
  }));

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <Button variant="secondary" onClick={() => navigate(`/members/${id}`)} disabled={submitting}>
          → رجوع
        </Button>
      </div>

      <Card className={styles.card}>
        <h1 className={styles.title}>اشتراك جديد / تجديد</h1>
        <p className={styles.subtitle}>
          العضو: <strong>{member.full_name}</strong>
        </p>

        {plans.length === 0 ? (
          <EmptyState
            icon="🏷️"
            title="لا توجد خطط مفعّلة"
            hint="يجب على المالك إضافة خطة اشتراك أولًا من صفحة الخطط."
          />
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <Select
              label="الخطة *"
              id="plan"
              options={planOptions}
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
            />
            <Field
              label="تاريخ البدء"
              id="start_date"
              type="date"
              dir="ltr"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />

            {selectedPlan && (
              <div className={styles.preview}>
                <div className={styles.previewRow}>
                  <span className={styles.previewLabel}>المدة</span>
                  <span className={styles.previewValue}>
                    <span className="num">{selectedPlan.duration_days}</span> يوم
                  </span>
                </div>
                <div className={styles.previewRow}>
                  <span className={styles.previewLabel}>السعر</span>
                  <span className={styles.previewValue}>
                    <span className="num">{formatMoney(selectedPlan.price)}</span>
                  </span>
                </div>
                <div className={styles.previewRow}>
                  <span className={styles.previewLabel}>تاريخ الانتهاء</span>
                  <span className={styles.previewValue}>
                    <span className="num">{endPreview}</span>
                  </span>
                </div>
              </div>
            )}

            <p className={styles.note}>
              💡 سيُسجَّل الدفع في الخطوة التالية (مرحلة المدفوعات).
            </p>

            <div className={styles.actions}>
              <Button type="submit" variant="primary" disabled={submitting}>
                {submitting ? 'جارٍ الحفظ…' : 'إنشاء الاشتراك'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => navigate(`/members/${id}`)}
                disabled={submitting}
              >
                إلغاء
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
