import { useParams, useNavigate } from 'react-router-dom';
import Card from '../components/Card';
import Button from '../components/Button';
import styles from './Stub.module.css';

// Placeholder for Phase 1b-i. The real profile (member details, QR image, and
// subscription/payment/check-in history) is built in Phase 1b-ii.
export default function MemberProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  return (
    <div className={styles.wrap}>
      <Card className={styles.card}>
        <div className={styles.icon} aria-hidden="true">
          🚧
        </div>
        <h1 className={styles.title}>صفحة العضو</h1>
        <p className={styles.text}>
          ملف العضو رقم <span className="num">{id}</span> قيد الإنشاء — سيُبنى في
          المرحلة التالية (1ب-ii): التفاصيل، رمز QR، وسجلّ الاشتراكات والمدفوعات
          والحضور.
        </p>
        <Button variant="secondary" onClick={() => navigate('/members')}>
          → رجوع إلى الأعضاء
        </Button>
      </Card>
    </div>
  );
}
