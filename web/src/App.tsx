import { useAuth } from './auth/AuthContext';
import { LoginScreen } from './features/login/LoginScreen';
import { AdminLayout } from './features/admin/AdminLayout';
import { ExamineeLayout } from './features/practice/ExamineeLayout';

export function App() {
  const { user, restoring } = useAuth();

  if (restoring) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
      </div>
    );
  }

  if (!user) return <LoginScreen />;
  return user.role === 'admin' ? <AdminLayout /> : <ExamineeLayout />;
}
