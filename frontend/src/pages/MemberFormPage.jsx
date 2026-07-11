import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { membersApi } from '../api/members';
import { useToast } from '../components/ToastProvider';
import { STATUS_OPTIONS } from '../lib/statuses';
import { formatDate } from '../lib/format';
import Card from '../components/Card';
import Field from '../components/Field';
import Select from '../components/Select';
import Button from '../components/Button';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import styles from './MemberFormPage.module.css';

// Shared create/edit form for /members/new and /members/:id/edit (spec §7 #4).
// Route access is already restricted to owner/front_desk (ProtectedRoute); the
// backend enforces the same. Client validation mirrors the Phase 1a zod rules.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+\-\s]{7,20}$/;

const STATUS_SELECT = STATUS_OPTIONS.map((o) => ({ value: o.key, label: o.label }));

const EMPTY_FORM = {
  full_name: '',
  phone: '',
  email: '',
  status: 'active',
  joined_at: '',
};

function validate(form) {
  const errors = {};
  if (form.full_name.trim().length < 2) {
    errors.full_name = 'الاسم قصير جدًا (حرفان على الأقل).';
  }
  if (!PHONE_RE.test(form.phone.trim())) {
    errors.phone = 'أدخل رقم هاتف صحيح.';
  }
  if (form.email.trim() && !EMAIL_RE.test(form.email.trim())) {
    errors.email = 'أدخل بريدًا إلكترونيًا صحيحًا.';
  }
  return errors;
}

export default function MemberFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const editing = Boolean(id);

  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Edit mode: load the existing member to prefill the form.
  const [loadingMember, setLoadingMember] = useState(editing);
  const [loadError, setLoadError] = useState(null);

  const loadMember = useCallback(() => {
    if (!editing) return undefined;
    let alive = true;
    setLoadingMember(true);
    setLoadError(null);
    membersApi
      .get(id)
      .then((m) => {
        if (!alive) return;
        setForm({
          full_name: m.full_name || '',
          phone: m.phone || '',
          email: m.email || '',
          status: m.status || 'active',
          joined_at: m.joined_at ? formatDate(m.joined_at) : '',
        });
      })
      .catch((err) => {
        if (!alive) return;
        setLoadError(err);
        if (err.status !== 404) toast.error(err.message || 'تعذّر تحميل بيانات العضو');
      })
      .finally(() => alive && setLoadingMember(false));
    return () => {
      alive = false;
    };
  }, [editing, id, toast]);

  useEffect(() => loadMember(), [loadMember]);

  const setField = (name) => (e) => {
    setForm((prev) => ({ ...prev, [name]: e.target.value }));
    // Clear a field's error as soon as the user edits it.
    setErrors((prev) => (prev[name] ? { ...prev, [name]: undefined } : prev));
  };

  async function handleSubmit(e) {
    e.preventDefault();
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    // Only send fields the backend accepts; omit empty optionals so the server
    // applies its defaults (e.g. joined_at → today on create).
    const payload = {
      full_name: form.full_name.trim(),
      phone: form.phone.trim(),
      status: form.status,
    };
    if (form.email.trim()) payload.email = form.email.trim();
    if (form.joined_at) payload.joined_at = form.joined_at;

    setSubmitting(true);
    try {
      const saved = editing
        ? await membersApi.update(id, payload)
        : await membersApi.create(payload);
      toast.success(editing ? 'تم تحديث بيانات العضو.' : 'تمت إضافة العضو بنجاح.');
      navigate(`/members/${saved.id}`);
    } catch (err) {
      if (err.code === 'PHONE_TAKEN') {
        setErrors((prev) => ({ ...prev, phone: 'هذا الرقم مسجَّل بالفعل لعضو آخر.' }));
      } else {
        toast.error(err.message || 'تعذّر حفظ البيانات، حاول مجددًا.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const goBack = () => navigate(editing ? `/members/${id}` : '/members');

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <Button variant="secondary" onClick={goBack} disabled={submitting}>
          → رجوع
        </Button>
      </div>

      <Card className={styles.card}>
        <h1 className={styles.title}>{editing ? 'تعديل بيانات العضو' : 'عضو جديد'}</h1>

        {loadingMember ? (
          <div className={styles.center}>
            <Spinner label="جارٍ تحميل البيانات…" />
          </div>
        ) : loadError ? (
          <EmptyState
            icon={loadError.status === 404 ? '🔎' : '⚠️'}
            title={loadError.status === 404 ? 'العضو غير موجود' : 'تعذّر تحميل البيانات'}
            hint={
              loadError.status === 404
                ? 'ربما تم حذف هذا العضو أو أن الرابط غير صحيح.'
                : 'تحقّق من تشغيل الخادم وحاول مجددًا.'
            }
          />
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <Field
              label="الاسم الكامل *"
              id="full_name"
              value={form.full_name}
              onChange={setField('full_name')}
              error={errors.full_name}
              autoComplete="name"
              maxLength={160}
            />
            <Field
              label="رقم الهاتف *"
              id="phone"
              dir="ltr"
              inputMode="tel"
              placeholder="01000000000"
              value={form.phone}
              onChange={setField('phone')}
              error={errors.phone}
              autoComplete="tel"
            />
            <Field
              label="البريد الإلكتروني (اختياري)"
              id="email"
              type="email"
              dir="ltr"
              placeholder="name@example.com"
              value={form.email}
              onChange={setField('email')}
              error={errors.email}
              autoComplete="email"
            />
            <Select
              label="الحالة"
              id="status"
              options={STATUS_SELECT}
              value={form.status}
              onChange={setField('status')}
            />
            <Field
              label="تاريخ الانضمام"
              id="joined_at"
              type="date"
              dir="ltr"
              value={form.joined_at}
              onChange={setField('joined_at')}
            />
            <p className={styles.hint}>اتركه فارغًا لاستخدام تاريخ اليوم.</p>

            <div className={styles.actions}>
              <Button type="submit" variant="primary" disabled={submitting}>
                {submitting ? 'جارٍ الحفظ…' : editing ? 'حفظ التعديلات' : 'إضافة العضو'}
              </Button>
              <Button type="button" variant="secondary" onClick={goBack} disabled={submitting}>
                إلغاء
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
