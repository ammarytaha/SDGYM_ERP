import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { dashboardApi } from '../api/dashboard';
import { useToast } from '../components/ToastProvider';
import { formatMoney, formatDate, formatPhone } from '../lib/format';
import { STATUS_MAP } from '../lib/statuses';
import { BRAND, GRID, MUTED, STATUS_COLORS } from '../lib/chartColors';
import StatCard from '../components/StatCard';
import Card from '../components/Card';
import Table from '../components/Table';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import styles from './DashboardPage.module.css';

// لوحة التحكم (Phase 6) — the owner's comprehensive view: at-a-glance KPIs, then
// Financial / Growth / Retention breakdowns to help grow the gym. Owner-only
// (the backend enforces it; the sidebar link is owner-only too).

// "ends in N days" / "today" in Arabic, flagged urgent when ≤3 days out.
function endsInLabel(days) {
  if (days <= 0) return { text: 'اليوم', urgent: true };
  return { text: `خلال ${days} يوم`, urgent: days <= 3 };
}

// Charts render numbers; the API returns money as numeric strings.
const toNum = (v) => Number(v) || 0;

export default function DashboardPage() {
  const navigate = useNavigate();
  const toast = useToast();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setData(await dashboardApi.get());
    } catch (err) {
      setError(true);
      toast.error(err.message || 'تعذّر تحميل لوحة التحكم');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.center}>
          <Spinner label="جارٍ التحميل…" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={styles.page}>
        <EmptyState icon="⚠️" title="تعذّر تحميل لوحة التحكم" hint="تحقّق من تشغيل الخادم وحاول مجددًا." />
      </div>
    );
  }

  const { kpis, revenue_trend, revenue_by_plan, new_members_trend, status_breakdown, retention } = data;

  const revenueData = revenue_trend.map((r) => ({ month: r.month, total: toNum(r.total) }));
  const membersData = new_members_trend.map((r) => ({ month: r.month, count: r.count }));
  const statusData = status_breakdown
    .map((s) => ({ ...s, label: STATUS_MAP[s.status]?.label || s.status }))
    .filter((s) => s.count > 0);
  const totalMembers = status_breakdown.reduce((acc, s) => acc + s.count, 0);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>لوحة التحكم</h1>
        <p className={styles.subtitle}>نظرة شاملة على أداء الصالة</p>
      </div>

      {/* ---- KPI tiles ---- */}
      <div className={styles.kpiGrid}>
        <StatCard label="الأعضاء النشطون" value={kpis.active_members} accent="var(--color-status-active)" />
        <StatCard label="إيراد هذا الشهر" value={formatMoney(kpis.revenue_this_month)} accent="var(--color-primary)" />
        <StatCard label="أعضاء جدد هذا الشهر" value={kpis.new_members_this_month} />
        <StatCard label="تنتهي هذا الأسبوع" value={kpis.expiring_this_week} sub="اشتراكات" />
        <StatCard label="متأخرات مستحقة" value={formatMoney(kpis.outstanding_dues)} />
        <StatCard label="حضور اليوم" value={kpis.checkins_today} />
      </div>

      {/* ---- Financial ---- */}
      <Card className={styles.section}>
        <h2 className={styles.sectionTitle}>التحليل المالي</h2>

        <div className={styles.chartBlock}>
          <h3 className={styles.chartTitle}>الإيراد خلال آخر ٦ أشهر</h3>
          <div className={styles.chartArea}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueData} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="month" reversed tick={{ fontSize: 12, fill: MUTED }} tickLine={false} axisLine={{ stroke: GRID }} />
                <YAxis orientation="right" tick={{ fontSize: 12, fill: MUTED }} tickLine={false} axisLine={false} width={64} />
                <Tooltip
                  formatter={(value) => [formatMoney(value), 'الإيراد']}
                  labelFormatter={(m) => `شهر ${m}`}
                  contentStyle={{ direction: 'rtl', fontSize: 13, borderRadius: 10, borderColor: GRID }}
                />
                <Bar dataKey="total" fill={BRAND} radius={[6, 6, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={styles.chartBlock}>
          <h3 className={styles.chartTitle}>الإيراد حسب الخطة</h3>
          {revenue_by_plan.length === 0 ? (
            <p className={styles.empty}>لا توجد خطط بعد.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>الخطة</th>
                  <th>اشتراكات نشطة</th>
                  <th>الإيراد</th>
                </tr>
              </thead>
              <tbody>
                {revenue_by_plan.map((p) => (
                  <tr key={p.plan_id}>
                    <td>{p.plan_name}</td>
                    <td>
                      <span className="num">{p.active_subs}</span>
                    </td>
                    <td>
                      <span className="num">{formatMoney(p.revenue)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      </Card>

      {/* ---- Growth ---- */}
      <Card className={styles.section}>
        <h2 className={styles.sectionTitle}>النمو</h2>

        <div className={styles.growthRow}>
          <div className={styles.chartBlock}>
            <h3 className={styles.chartTitle}>أعضاء جدد خلال آخر ٦ أشهر</h3>
            <div className={styles.chartArea}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={membersData} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis dataKey="month" reversed tick={{ fontSize: 12, fill: MUTED }} tickLine={false} axisLine={{ stroke: GRID }} />
                  <YAxis orientation="right" allowDecimals={false} tick={{ fontSize: 12, fill: MUTED }} tickLine={false} axisLine={false} width={32} />
                  <Tooltip
                    formatter={(value) => [value, 'أعضاء جدد']}
                    labelFormatter={(m) => `شهر ${m}`}
                    contentStyle={{ direction: 'rtl', fontSize: 13, borderRadius: 10, borderColor: GRID }}
                  />
                  <Bar dataKey="count" fill={BRAND} radius={[6, 6, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className={styles.chartBlock}>
            <h3 className={styles.chartTitle}>توزيع حالات الأعضاء</h3>
            <div className={styles.chartArea}>
              {totalMembers === 0 ? (
                <p className={styles.empty}>لا يوجد أعضاء بعد.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData}
                      dataKey="count"
                      nameKey="label"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                    >
                      {statusData.map((s) => (
                        <Cell key={s.status} fill={STATUS_COLORS[s.status]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, name) => [value, name]}
                      contentStyle={{ direction: 'rtl', fontSize: 13, borderRadius: 10, borderColor: GRID }}
                    />
                    <Legend
                      formatter={(value) => <span style={{ fontSize: 13, color: 'var(--color-text)' }}>{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* ---- Retention ---- */}
      <Card className={styles.section}>
        <div className={styles.retentionHead}>
          <h2 className={styles.sectionTitle}>الاحتفاظ بالأعضاء</h2>
          <div className={styles.miniStats}>
            <span className={styles.miniStat}>
              تنتهي هذا الأسبوع: <span className="num">{retention.expiring_this_week}</span>
            </span>
            <span className={styles.miniStat}>
              تنتهي هذا الشهر: <span className="num">{retention.expiring_this_month}</span>
            </span>
          </div>
        </div>

        <div className={styles.chartBlock}>
          <h3 className={styles.chartTitle}>الأقرب للانتهاء</h3>
          {retention.expiring_soon.length === 0 ? (
            <p className={styles.empty}>لا توجد اشتراكات تنتهي خلال ٣٠ يومًا. 👍</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>العضو</th>
                  <th>الهاتف</th>
                  <th>الخطة</th>
                  <th>تنتهي في</th>
                  <th>المتبقّي</th>
                </tr>
              </thead>
              <tbody>
                {retention.expiring_soon.map((e) => {
                  const when = endsInLabel(e.days_left);
                  return (
                    <tr key={e.subscription_id} className={styles.row} onClick={() => navigate(`/members/${e.member_id}`)}>
                      <td>{e.member_name}</td>
                      <td>
                        <span className="num">{formatPhone(e.phone)}</span>
                      </td>
                      <td>{e.plan_name}</td>
                      <td>
                        <span className="num">{formatDate(e.end_date)}</span>
                      </td>
                      <td>
                        <span className={when.urgent ? styles.urgent : styles.soon}>{when.text}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </div>

        <div className={styles.chartBlock}>
          <h3 className={styles.chartTitle}>
            منتهية ولم تُجدَّد{' '}
            <span className={styles.count}>
              (<span className="num">{retention.churn_count}</span>)
            </span>
          </h3>
          {retention.churned.length === 0 ? (
            <p className={styles.empty}>لا يوجد أعضاء منقطعون — الجميع مشترك حاليًا. 🎉</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>العضو</th>
                  <th>الهاتف</th>
                  <th>آخر انتهاء</th>
                </tr>
              </thead>
              <tbody>
                {retention.churned.map((c) => (
                  <tr key={c.member_id} className={styles.row} onClick={() => navigate(`/members/${c.member_id}`)}>
                    <td>{c.member_name}</td>
                    <td>
                      <span className="num">{formatPhone(c.phone)}</span>
                    </td>
                    <td>
                      <span className="num">{formatDate(c.last_end_date)}</span>
                      {c.days_since > 0 ? <span className={styles.sinceNote}> · منذ {c.days_since} يوم</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      </Card>
    </div>
  );
}
