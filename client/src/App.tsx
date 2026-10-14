/**
 * CrypticStorage - Main App Component
 * Router, auth gating, theme application and global toasts.
 */

import React, { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Spinner } from './components/common/Spinner';
import { Toast } from './components/common/Toast';
import ProtectedRoute from './components/ProtectedRoute';
import { useAuthStore } from './stores/auth.store';
import { useUIStore } from './stores/ui.store';

const HomePage = lazy(() => import('./pages/HomePage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const FilesPage = lazy(() => import('./pages/FilesPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const SharedPage = lazy(() => import('./pages/SharedPage').then((m) => ({ default: m.SharedPage })));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

const LoadingFallback: React.FC = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
    <Spinner size="lg" label="Loading…" />
  </div>
);

/** Old share URLs used /shared/:id; keep them working. */
const LegacySharedRedirect: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  return <Navigate to={`/s/${token ?? ''}${window.location.hash}`} replace />;
};

const ToastContainer: React.FC = () => {
  const toasts = useUIStore((s) => s.toasts);
  const removeToast = useUIStore((s) => s.removeToast);
  return (
    <div className="fixed top-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence mode="popLayout">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <Toast id={t.id} type={t.type} title={t.message} message={t.description} duration={t.duration} onClose={removeToast} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
};

/** Applies the persisted theme preference to <html>. */
const ThemeEffect: React.FC = () => {
  const theme = useUIStore((s) => s.theme);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches);
      document.documentElement.classList.toggle('dark', dark);
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
  return null;
};

const PublicOnly: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const status = useAuthStore((s) => s.status);
  return status === 'unlocked' ? <Navigate to="/dashboard" replace /> : <>{children}</>;
};

const App: React.FC = () => (
  <BrowserRouter>
    <ThemeEffect />
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        <Route
          path="/"
          element={
            <PublicOnly>
              <HomePage />
            </PublicOnly>
          }
        />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/s/:token" element={<SharedPage />} />
        <Route path="/shared/:token" element={<LegacySharedRedirect />} />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/files"
          element={
            <ProtectedRoute>
              <FilesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/files/:folderId"
          element={
            <ProtectedRoute>
              <FilesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <SettingsPage />
            </ProtectedRoute>
          }
        />

        <Route path="/404" element={<NotFoundPage />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Routes>
    </Suspense>
    <ToastContainer />
  </BrowserRouter>
);

export default App;
