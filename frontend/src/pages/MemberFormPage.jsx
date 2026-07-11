import { useParams, useNavigate } from 'react-router-dom';
import Card from '../components/Card';
import Button from '../components/Button';
import styles from './Stub.module.css';

// Placeholder for both /members/new and /members/:id/edit. The real create/edit
// form is built in Phase 1b-ii. Access is already role-gated (owner/front_desk)
// at the route level.
export default function MemberFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const editing = Boolean(id);
  return (
    <div className={styles.wrap}>
      <Card className={styles.card}>
        <div className={styles.icon} aria-hidden="true">
          🚧
        </div>
        <h1 className={styles.title}>{editing ? 'تعديل عضو' : 'عضو جديد'}</h1>
        <p className={styles.text}>
          نموذج {editing ? 'تعديل بيانات العضو' : 'إضافة عضو'} قيد الإنشاء — سيُبنى
          في المرحلة التالية (1ب-ii).
        </p>
        <Button variant="secondary" onClick={() => navigate('/members')}>
          → رجوع إلى الأعضاء
        </Button>
      </Card>
    </div>
  );
}
