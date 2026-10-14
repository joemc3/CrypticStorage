import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { AuthLayout } from '../layouts/AuthLayout';
import { UnlockForm } from './auth/UnlockForm';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * anonymous → login page; locked → unlock screen (offline); unlocked → page.
 */
const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { status, user, isLoading, unlock, logoutUser } = useAuth();
  const location = useLocation();

  if (status === 'anonymous') {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (status === 'locked') {
    return (
      <AuthLayout>
        <UnlockForm email={user?.email ?? ''} onUnlock={unlock} onSignOut={() => void logoutUser()} isLoading={isLoading} lockAfterMinutes={user?.lockAfterMinutes} />
      </AuthLayout>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
