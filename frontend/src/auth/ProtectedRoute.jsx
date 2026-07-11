// Route guard. Blocks unauthenticated users (→ /login, remembering where they
// were headed) and, optionally, users whose role isn't allowed (→ /members).
// While the session is being restored on load, shows a full-page spinner so we
// don't flash the login screen for an already-logged-in user.
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import Spinner from '../components/Spinner';

export default function ProtectedRoute({ children, allowedRoles }) {
  const { isAuthenticated, user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
        <Spinner label="جارٍ التحميل…" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    // Authenticated but not permitted here — send back to the members list.
    return <Navigate to="/members" replace />;
  }

  return children;
}
