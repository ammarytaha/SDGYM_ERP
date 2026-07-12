import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { checkinsApi } from '../api/checkins';
import { membersApi } from '../api/members';
import { useToast } from '../components/ToastProvider';
import { formatDateTime, formatPhone } from '../lib/format';
import StatusBadge from '../components/StatusBadge';
import Button from '../components/Button';
import Spinner from '../components/Spinner';
import styles from './KioskPage.module.css';

// Full-screen check-in kiosk for the front-desk tablet (spec §7 #5). A hardware QR
// scanner behaves like a keyboard: it "types" the member's qr_code_token into the
// focused input and presses Enter. We POST it, then show a big allowed/denied card.
// A manual search fallback covers an unreadable QR. WhatsApp confirmation is Phase 5.

const REASON_LABELS = {
  expired: 'اشتراك منتهٍ — يرجى التجديد',
  frozen: 'اشتراك مُجمّد',
  no_subscription: 'لا يوجد اشتراك ساري',
};

function todayISO() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export default function KioskPage() {
  const navigate = useNavigate();
  const toast = useToast();

  const inputRef = useRef(null);
  const clearTimer = useRef(null);

  const [token, setToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState(null); // { kind, member?, reason?, already_today?, token? }

  const [manual, setManual] = useState(false);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);

  const [recent, setRecent] = useState([]);

  const focusInput = useCallback(() => {
    // Only steal focus back in scan mode (manual mode has its own search box).
    if (!manual) inputRef.current?.focus();
  }, [manual]);

  const loadRecent = useCallback(async () => {
    try {
      setRecent(await checkinsApi.list({ date: todayISO() }));
    } catch {
      // Non-fatal — the recent list is secondary.
    }
  }, []);

  useEffect(() => {
    focusInput();
    loadRecent();
    return () => clearTimeout(clearTimer.current);
  }, [focusInput, loadRecent]);

  // Debounced member search for the manual fallback.
  useEffect(() => {
    if (!manual || search.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const { members } = await membersApi.list({ search: search.trim(), page: 1, limit: 6 });
        setResults(members);
      } catch {
        setResults([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [manual, search]);

  function scheduleClear() {
    clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => {
      setOutcome(null);
      focusInput();
    }, 6000);
  }

  const runCheckin = useCallback(
    async (payload) => {
      setSubmitting(true);
      clearTimeout(clearTimer.current);
      try {
        const data = await checkinsApi.create(payload);
        setOutcome({
          kind: data.result === 'allowed' ? 'allowed' : 'denied',
          member: data.member,
          reason: data.reason,
          already_today: data.already_today,
        });
        loadRecent();
        scheduleClear();
      } catch (err) {
        if (err.status === 404) {
          setOutcome({ kind: 'unknown', token: payload.qr_code_token });
          scheduleClear();
        } else {
          toast.error(err.message || 'تعذّر تسجيل الحضور، حاول مجددًا.');
        }
      } finally {
        setSubmitting(false);
        setToken('');
        setSearch('');
        setResults([]);
        focusInput();
      }
    },
    [loadRecent, focusInput, toast]
  );

  function handleScan(e) {
    e.preventDefault();
    const t = token.trim();
    if (!t) return;
    runCheckin({ qr_code_token: t });
  }

  const initial = outcome?.member?.full_name?.trim()?.[0] || '؟';

  return (
    <div className={styles.kiosk}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span aria-hidden="true">💪</span> صالة سعد — تسجيل الحضور
        </div>
        <button type="button" className={styles.exit} onClick={() => navigate('/members')}>
          → رجوع للوحة
        </button>
      </header>

      <main className={styles.main}>
        {/* Scan / manual entry */}
        {manual ? (
          <div className={styles.scanBox}>
            <input
              className={styles.scanInput}
              type="search"
              placeholder="ابحث بالاسم أو رقم الهاتف…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              disabled={submitting}
            />
            {results.length > 0 && (
              <ul className={styles.results}>
                {results.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      className={styles.resultRow}
                      onClick={() => runCheckin({ member_id: m.id })}
                      disabled={submitting}
                    >
                      <span>{m.full_name}</span>
                      <span className="num">{formatPhone(m.phone)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" className={styles.modeToggle} onClick={() => setManual(false)}>
              ← العودة لمسح الرمز
            </button>
          </div>
        ) : (
          <form className={styles.scanBox} onSubmit={handleScan}>
            <label className={styles.scanLabel}>امسح رمز العضو</label>
            <input
              ref={inputRef}
              className={styles.scanInput}
              type="text"
              inputMode="none"
              placeholder="في انتظار المسح…"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onBlur={() => setTimeout(focusInput, 0)}
              autoComplete="off"
              disabled={submitting}
            />
            <button type="button" className={styles.modeToggle} onClick={() => setManual(true)}>
              تعذّر المسح؟ إدخال يدوي
            </button>
          </form>
        )}

        {/* Result card */}
        {submitting ? (
          <div className={styles.resultCard}>
            <Spinner label="جارٍ التحقق…" />
          </div>
        ) : outcome ? (
          <div
            className={`${styles.resultCard} ${
              outcome.kind === 'allowed'
                ? styles.allowed
                : outcome.kind === 'denied'
                  ? styles.denied
                  : styles.unknown
            }`}
          >
            {outcome.kind === 'unknown' ? (
              <>
                <div className={styles.resultIcon}>❓</div>
                <div className={styles.resultTitle}>رمز غير معروف</div>
                <div className={styles.resultHint}>تأكد من الرمز أو استخدم الإدخال اليدوي.</div>
              </>
            ) : (
              <>
                <div className={styles.resultIcon}>{outcome.kind === 'allowed' ? '✅' : '⛔'}</div>
                <div className={styles.resultMember}>
                  {outcome.member.photo_url ? (
                    <img className={styles.avatarImg} src={outcome.member.photo_url} alt="" />
                  ) : (
                    <span className={styles.avatar} aria-hidden="true">
                      {initial}
                    </span>
                  )}
                  <div className={styles.resultMemberText}>
                    <div className={styles.resultName}>{outcome.member.full_name}</div>
                    <StatusBadge status={outcome.member.status} />
                  </div>
                </div>
                {outcome.kind === 'allowed' ? (
                  <>
                    <div className={styles.resultTitle}>مرحبًا 👋</div>
                    {outcome.already_today && (
                      <div className={styles.resultInfo}>ℹ️ سُجِّل حضوره اليوم بالفعل</div>
                    )}
                  </>
                ) : (
                  <>
                    <div className={styles.resultTitle}>
                      {REASON_LABELS[outcome.reason] || 'الدخول مرفوض'}
                    </div>
                    <div className={styles.resultHint}>يرجى التوجه إلى الاستقبال.</div>
                  </>
                )}
              </>
            )}
            <Button variant="secondary" onClick={() => { setOutcome(null); focusInput(); }}>
              التالي
            </Button>
          </div>
        ) : (
          <div className={`${styles.resultCard} ${styles.idle}`}>
            <div className={styles.resultIcon}>📷</div>
            <div className={styles.resultHint}>جاهز لمسح رمز العضو التالي.</div>
          </div>
        )}
      </main>

      {/* Today's recent scans */}
      <section className={styles.recent}>
        <h2 className={styles.recentTitle}>آخر عمليات الدخول اليوم</h2>
        {recent.length === 0 ? (
          <p className={styles.recentEmpty}>لا توجد عمليات دخول بعد اليوم.</p>
        ) : (
          <ul className={styles.recentList}>
            {recent.slice(0, 8).map((c) => (
              <li key={c.id} className={styles.recentRow}>
                <span className={styles.recentName}>{c.member_name}</span>
                <span
                  className={c.result === 'allowed' ? styles.tagAllowed : styles.tagDenied}
                >
                  {c.result === 'allowed' ? 'دخل' : 'مرفوض'}
                </span>
                <span className={`num ${styles.recentTime}`}>{formatDateTime(c.checked_in_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
