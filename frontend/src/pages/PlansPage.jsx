import { useEffect, useState, useCallback } from 'react';
import { plansApi } from '../api/plans';
import { useToast } from '../components/ToastProvider';
import { formatMoney } from '../lib/format';
import Card from '../components/Card';
import Table from '../components/Table';
import Button from '../components/Button';
import Field from '../components/Field';
import Select from '../components/Select';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import styles from './PlansPage.module.css';

// Membership plans management (spec §4/§6). Owner-only — the route is gated and
// the backend enforces it; this screen just adds/edits the plans the subscribe
// picker offers. A plan is "retired" (active=false) rather than deleted so old
// subscriptions stay valid.
const EMPTY = { name: '', duration_days: '', price: '', active: 'true' };
const ACTIVE_OPTIONS = [
  { value: 'true', label: 'مفعّلة' },
  { value: 'false', label: 'متوقفة' },
];

function validate(f) {
  const e = {};
  if (f.name.trim().length < 2) e.name = 'اسم الخطة قصير جدًا (حرفان على الأقل).';
  const d = Number(f.duration_days);
  if (!Number.isInteger(d) || d <= 0) e.duration_days = 'أدخل عدد أيام صحيح أكبر من صفر.';
  const p = Number(f.price);
  if (Number.isNaN(p) || p < 0) e.price = 'أدخل سعرًا صحيحًا (صفر أو أكثر).';
  return e;
}

export default function PlansPage() {
  const toast = useToast();

  const [plans, setPlans] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [editingId, setEditingId] = useState(null); // null = form closed | 'new' | plan id
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setPlans(await plansApi.list());
    } catch (err) {
      setError(true);
      toast.error(err.message || 'تعذّر تحميل الخطط');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const openNew = () => {
    setEditingId('new');
    setForm(EMPTY);
    setErrors({});
  };
  const openEdit = (plan) => {
    setEditingId(plan.id);
    setForm({
      name: plan.name,
      duration_days: String(plan.duration_days),
      price: String(plan.price),
      active: plan.active ? 'true' : 'false',
    });
    setErrors({});
  };
  const closeForm = () => {
    setEditingId(null);
    setErrors({});
  };

  const setField = (name) => (e) => {
    setForm((prev) => ({ ...prev, [name]: e.target.value }));
    setErrors((prev) => (prev[name] ? { ...prev, [name]: undefined } : prev));
  };

  async function handleSubmit(e) {
    e.preventDefault();
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const payload = {
      name: form.name.trim(),
      duration_days: Number(form.duration_days),
      price: Number(form.price),
      active: form.active === 'true',
    };

    setSaving(true);
    try {
      if (editingId === 'new') {
        await plansApi.create(payload);
        toast.success('تمت إضافة الخطة.');
      } else {
        await plansApi.update(editingId, payload);
        toast.success('تم تحديث الخطة.');
      }
      closeForm();
      await load();
    } catch (err) {
      if (err.code === 'PLAN_NAME_TAKEN') {
        setErrors((prev) => ({ ...prev, name: 'توجد خطة بنفس الاسم بالفعل.' }));
      } else {
        toast.error(err.message || 'تعذّر حفظ الخطة، حاول مجددًا.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>الخطط</h1>
        {editingId === null && (
          <Button variant="primary" onClick={openNew}>
            + خطة جديدة
          </Button>
        )}
      </div>

      {editingId !== null && (
        <Card className={styles.formCard}>
          <h2 className={styles.formTitle}>{editingId === 'new' ? 'خطة جديدة' : 'تعديل الخطة'}</h2>
          <form onSubmit={handleSubmit} noValidate>
            <Field
              label="اسم الخطة *"
              id="name"
              value={form.name}
              onChange={setField('name')}
              error={errors.name}
              maxLength={120}
            />
            <div className={styles.row}>
              <Field
                label="المدة (بالأيام) *"
                id="duration_days"
                dir="ltr"
                inputMode="numeric"
                placeholder="30"
                value={form.duration_days}
                onChange={setField('duration_days')}
                error={errors.duration_days}
              />
              <Field
                label="السعر (ج.م) *"
                id="price"
                dir="ltr"
                inputMode="decimal"
                placeholder="300"
                value={form.price}
                onChange={setField('price')}
                error={errors.price}
              />
            </div>
            <Select
              label="الحالة"
              id="active"
              options={ACTIVE_OPTIONS}
              value={form.active}
              onChange={setField('active')}
            />
            <div className={styles.actions}>
              <Button type="submit" variant="primary" disabled={saving}>
                {saving ? 'جارٍ الحفظ…' : editingId === 'new' ? 'إضافة الخطة' : 'حفظ التعديلات'}
              </Button>
              <Button type="button" variant="secondary" onClick={closeForm} disabled={saving}>
                إلغاء
              </Button>
            </div>
          </form>
        </Card>
      )}

      {loading ? (
        <div className={styles.center}>
          <Spinner label="جارٍ التحميل…" />
        </div>
      ) : error ? (
        <EmptyState icon="⚠️" title="تعذّر تحميل الخطط" hint="تحقّق من تشغيل الخادم وحاول مجددًا." />
      ) : plans.length === 0 ? (
        <EmptyState icon="🏷️" title="لا توجد خطط بعد" hint="أضف أول خطة اشتراك للبدء." />
      ) : (
        <Table>
          <thead>
            <tr>
              <th>الاسم</th>
              <th>المدة</th>
              <th>السعر</th>
              <th>الحالة</th>
              <th aria-label="إجراءات" />
            </tr>
          </thead>
          <tbody>
            {plans.map((plan) => (
              <tr key={plan.id}>
                <td>{plan.name}</td>
                <td>
                  <span className="num">{plan.duration_days}</span> يوم
                </td>
                <td>
                  <span className="num">{formatMoney(plan.price)}</span>
                </td>
                <td>
                  {plan.active ? (
                    <span className={styles.badgeActive}>مفعّلة</span>
                  ) : (
                    <span className={styles.badgeRetired}>متوقفة</span>
                  )}
                </td>
                <td className={styles.rowActions}>
                  <Button variant="secondary" onClick={() => openEdit(plan)}>
                    تعديل
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
