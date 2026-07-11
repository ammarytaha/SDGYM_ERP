import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './auth/ProtectedRoute';
import AdminShell from './layout/AdminShell';
import { MEMBER_MANAGE_ROLES } from './lib/roles';
import LoginPage from './pages/LoginPage';
import MembersListPage from './pages/MembersListPage';
import MemberProfilePage from './pages/MemberProfilePage';
import MemberFormPage from './pages/MemberFormPage';
import NotFoundPage from './pages/NotFoundPage';

// Route map for Phase 1b-i. Everything except /login sits behind auth inside the
// admin shell. Create/edit routes carry an extra role gate (owner/front_desk).
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        element={
          <ProtectedRoute>
            <AdminShell />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Navigate to="/members" replace />} />
        <Route path="/members" element={<MembersListPage />} />
        <Route
          path="/members/new"
          element={
            <ProtectedRoute allowedRoles={MEMBER_MANAGE_ROLES}>
              <MemberFormPage />
            </ProtectedRoute>
          }
        />
        <Route path="/members/:id" element={<MemberProfilePage />} />
        <Route
          path="/members/:id/edit"
          element={
            <ProtectedRoute allowedRoles={MEMBER_MANAGE_ROLES}>
              <MemberFormPage />
            </ProtectedRoute>
          }
        />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
