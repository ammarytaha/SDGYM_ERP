import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { membersApi } from '../api/members';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/ToastProvider';
import { canManageMembers } from '../lib/roles';
import { STATUS_OPTIONS } from '../lib/statuses';
import { formatDate, formatPhone } from '../lib/format';
import Card from '../components/Card';
import Table from '../components/Table';
import StatusBadge from '../components/StatusBadge';
import Button from '../components/Button';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import styles from './MembersListPage.module.css';

const PAGE_SIZE = 10;

export default function MembersListPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const canManage = canManageMembers(user?.role);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const [data, setData] = useState(null); // { members, pagination }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Debounce the search box; reset to page 1 whenever the query changes.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  // Reset to page 1 when the status filter changes.
  useEffect(() => {
    setPage(1);
  }, [status]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await membersApi.list({
        search: debouncedSearch,
        status,
        page,
        limit: PAGE_SIZE,
      });
      setData(res);
    } catch (err) {
      setError(true);
      toast.error(err.message || 'تعذّر تحميل الأعضاء');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, status, page, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const members = data?.members || [];
  const pagination = data?.pagination;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>الأعضاء</h1>
          {pagination && (
            <p className={styles.count}>
              الإجمالي: <span className="num">{pagination.total}</span>
            </p>
          )}
        </div>
        {canManage && (
          <Button variant="primary" onClick={() => navigate('/members/new')}>
            + عضو جديد
          </Button>
        )}
      </div>

      <Card className={styles.controls}>
        <input
          className={styles.search}
          type="search"
          placeholder="ابحث بالاسم أو رقم الهاتف…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="بحث عن عضو"
        />
        <div className={styles.filters}>
          <button
            type="button"
            className={`${styles.chip} ${status === '' ? styles.chipActive : ''}`}
            onClick={() => setStatus('')}
          >
            الكل
          </button>
          {STATUS_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              className={`${styles.chip} ${status === option.key ? styles.chipActive : ''}`}
              onClick={() => setStatus(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </Card>

      {loading ? (
        <div className={styles.center}>
          <Spinner label="جارٍ التحميل…" />
        </div>
      ) : error ? (
        <EmptyState
          icon="⚠️"
          title="تعذّر تحميل الأعضاء"
          hint="تحقّق من تشغيل الخادم وحاول مجددًا."
        />
      ) : members.length === 0 ? (
        <EmptyState
          icon="🔍"
          title="لا يوجد أعضاء مطابقون"
          hint="جرّب تعديل كلمة البحث أو التصفية."
        />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <th>الاسم</th>
                <th>رقم الهاتف</th>
                <th>الحالة</th>
                <th>تاريخ الانضمام</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr
                  key={member.id}
                  className={styles.row}
                  onClick={() => navigate(`/members/${member.id}`)}
                >
                  <td>{member.full_name}</td>
                  <td>
                    <span className="num">{formatPhone(member.phone)}</span>
                  </td>
                  <td>
                    <StatusBadge status={member.status} />
                  </td>
                  <td>
                    <span className="num">{formatDate(member.joined_at)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>

          {pagination && pagination.total_pages > 1 && (
            <div className={styles.pager}>
              <Button
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                السابق
              </Button>
              <span className={styles.pageInfo}>
                صفحة <span className="num">{pagination.page}</span> من{' '}
                <span className="num">{pagination.total_pages}</span>
              </span>
              <Button
                variant="secondary"
                disabled={page >= pagination.total_pages}
                onClick={() => setPage((p) => p + 1)}
              >
                التالي
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
