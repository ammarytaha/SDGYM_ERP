import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { membersApi } from '../api/members';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/ToastProvider';
import { canManageMembers } from '../lib/roles';
import { formatDate, formatPhone } from '../lib/format';
import Card from '../components/Card';
import Button from '../components/Button';
import Spinner from '../components/Spinner';
import StatusBadge from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';
import SubscriptionsSection from '../components/SubscriptionsSection';
import PaymentsSection from '../components/PaymentsSection';
import CheckinsSection from '../components/CheckinsSection';
import styles from './MemberProfilePage.module.css';

// Member profile (spec §7 screen #4). Shows the member's details, a scannable
// check-in QR, subscriptions (Phase 2), payments (Phase 3), and check-in
// history (Phase 4).
export default function MemberProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const canManage = canManageMembers(user?.role);

  const [member, setMember] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null); // ApiError | null

  const [qr, setQr] = useState(null); // { token, qr_data_url }
  const [qrError, setQrError] = useState(false);

  const load = useCallback(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setQr(null);
    setQrError(false);

    membersApi
      .get(id)
      .then((m) => alive && setMember(m))
      .catch((err) => {
        if (!alive) return;
        setError(err);
        // 404 is an expected state (bad id) — no toast; other errors get one.
        if (err.status !== 404) toast.error(err.message || 'تعذّر تحميل بيانات العضو');
      })
      .finally(() => alive && setLoading(false));

    // QR is secondary — load it in parallel and degrade gracefully if it fails.
    membersApi
      .getQr(id)
      .then((q) => alive && setQr(q))
      .catch(() => alive && setQrError(true));

    return () => {
      alive = false;
    };
  }, [id, toast]);

  useEffect(() => load(), [load]);

  // Re-fetch just the member after a subscription action so the status badge
  // reflects the server-side sync (create→active, freeze→frozen, etc.).
  const refreshMember = useCallback(async () => {
    try {
      setMember(await membersApi.get(id));
    } catch {
      // Non-fatal — the subscription list already refreshed itself.
    }
  }, [id]);

  if (loading) {
    return (
      <div className={styles.center}>
        <Spinner label="جارٍ تحميل بيانات العضو…" />
      </div>
    );
  }

  if (error) {
    const notFound = error.status === 404;
    return (
      <div className={styles.page}>
        <div className={styles.topbar}>
          <Button variant="secondary" onClick={() => navigate('/members')}>
            → رجوع إلى الأعضاء
          </Button>
        </div>
        <EmptyState
          icon={notFound ? '🔎' : '⚠️'}
          title={notFound ? 'العضو غير موجود' : 'تعذّر تحميل بيانات العضو'}
          hint={
            notFound
              ? 'ربما تم حذف هذا العضو أو أن الرابط غير صحيح.'
              : 'تحقّق من تشغيل الخادم وحاول مجددًا.'
          }
        />
      </div>
    );
  }

  const initial = member.full_name?.trim()?.[0] || '؟';

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <Button variant="secondary" onClick={() => navigate('/members')}>
          → رجوع إلى الأعضاء
        </Button>
        {canManage && (
          <Button variant="primary" onClick={() => navigate(`/members/${id}/edit`)}>
            تعديل البيانات
          </Button>
        )}
      </div>

      <div className={styles.grid}>
        {/* Identity + core details */}
        <Card className={styles.identity}>
          <div className={styles.identityHead}>
            {member.photo_url ? (
              <img className={styles.avatarImg} src={member.photo_url} alt={member.full_name} />
            ) : (
              <div className={styles.avatar} aria-hidden="true">
                {initial}
              </div>
            )}
            <div className={styles.identityText}>
              <h1 className={styles.name}>{member.full_name}</h1>
              <StatusBadge status={member.status} />
            </div>
          </div>

          <dl className={styles.details}>
            <div className={styles.detailRow}>
              <dt className={styles.dt}>رقم الهاتف</dt>
              <dd className={styles.dd}>
                <span className="num">{formatPhone(member.phone)}</span>
              </dd>
            </div>
            <div className={styles.detailRow}>
              <dt className={styles.dt}>البريد الإلكتروني</dt>
              <dd className={styles.dd}>
                {member.email ? <span className="num">{member.email}</span> : '—'}
              </dd>
            </div>
            <div className={styles.detailRow}>
              <dt className={styles.dt}>تاريخ الانضمام</dt>
              <dd className={styles.dd}>
                <span className="num">{formatDate(member.joined_at)}</span>
              </dd>
            </div>
            <div className={styles.detailRow}>
              <dt className={styles.dt}>رقم العضوية</dt>
              <dd className={styles.dd}>
                <span className="num">{member.id}</span>
              </dd>
            </div>
          </dl>
        </Card>

        {/* Check-in QR */}
        <Card className={styles.qrCard}>
          <h2 className={styles.qrTitle}>رمز الحضور</h2>
          <div className={styles.qrBox}>
            {qr ? (
              <img className={styles.qrImg} src={qr.qr_data_url} alt="رمز الحضور QR" />
            ) : qrError ? (
              <span className={styles.qrError}>تعذّر تحميل الرمز</span>
            ) : (
              <Spinner />
            )}
          </div>
          <p className={styles.qrHint}>يُمسح عند مكتب الاستقبال لتسجيل حضور العضو.</p>
        </Card>
      </div>

      {/* Subscriptions — real (Phase 2). */}
      <Card className={styles.subsCard}>
        <SubscriptionsSection
          memberId={id}
          canManage={canManage}
          onMemberChanged={refreshMember}
        />
      </Card>

      {/* Payments — real (Phase 3). */}
      <Card className={styles.subsCard}>
        <PaymentsSection memberId={id} canManage={canManage} />
      </Card>

      {/* Check-in history — real (Phase 4). */}
      <Card className={styles.historyCard}>
        <CheckinsSection memberId={id} />
      </Card>
    </div>
  );
}
