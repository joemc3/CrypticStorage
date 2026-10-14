import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { AuthLayout } from '../layouts/AuthLayout';
import { quietAction } from '../layouts/PublicFrame';
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
      <AuthLayout
        action={
          <button type="button" onClick={() => void logoutUser()} className={quietAction}>
            Sign out
          </button>
        }
      >
        <UnlockForm email={user?.email ?? ''} onUnlock={unlock} isLoading={isLoading} lockAfterMinutes={user?.lockAfterMinutes} />
      </AuthLayout>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
