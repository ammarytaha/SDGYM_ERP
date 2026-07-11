import { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/ToastProvider';
import { ApiError } from '../api/client';
import Card from '../components/Card';
import Field from '../components/Field';
import Button from '../components/Button';
import styles from './LoginPage.module.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage() {
  const { login, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const destination = location.state?.from?.pathname || '/members';

  // Already logged in (e.g. navigated here manually) → bounce to the app.
  if (!loading && isAuthenticated) {
    return <Navigate to={destination} replace />;
  }

  function validate() {
    const next = {};
    if (!email.trim()) next.email = 'أدخل البريد الإلكتروني';
    else if (!EMAIL_RE.test(email.trim())) next.email = 'صيغة البريد الإلكتروني غير صحيحة';
    if (!password) next.password = 'أدخل كلمة المرور';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate(destination, { replace: true });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'تعذّر تسجيل الدخول';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <Card className={styles.card}>
        <div className={styles.brand}>
          <span className={styles.mark} aria-hidden="true">
            💪
          </span>
          <h1 className={styles.title}>نظام إدارة صالة سعد</h1>
          <p className={styles.sub}>تسجيل دخول الموظفين</p>
        </div>

        <form onSubmit={onSubmit} noValidate>
          <Field
            label="البريد الإلكتروني"
            id="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
          />
          <Field
            label="كلمة المرور"
            id="password"
            type="password"
            autoComplete="current-password"
            dir="ltr"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
          />
          <Button
            type="submit"
            variant="primary"
            className={styles.submit}
            disabled={submitting}
          >
            {submitting ? 'جارٍ الدخول…' : 'تسجيل الدخول'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
