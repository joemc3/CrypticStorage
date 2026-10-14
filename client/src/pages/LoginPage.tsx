/**
 * CrypticStorage - Login Page
 */

import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthLayout } from '../layouts/AuthLayout';
import { LoginForm, type LoginData } from '../components/auth/LoginForm';
import { useAuth } from '../hooks/useAuth';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { loginUser, verifyTwoFactor, cancelTwoFactor, isLoading, pendingTwoFactorEmail } = useAuth();
  const [error, setError] = useState<string | undefined>();

  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/dashboard';

  const handleSubmit = async (data: LoginData) => {
    setError(undefined);
    try {
      if (pendingTwoFactorEmail) {
        await verifyTwoFactor(data.twoFactorCode ?? '');
        navigate(from, { replace: true });
        return;
      }
      const result = await loginUser({ email: data.email, password: data.password });
      if (!result.requiresTwoFactor) navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    }
  };

  return (
    <AuthLayout>
      <LoginForm
        onSubmit={handleSubmit}
        onRegister={() => navigate('/register', { state: { from } })}
        twoFactorRequired={pendingTwoFactorEmail !== null}
        onCancelTwoFactor={() => {
          cancelTwoFactor();
          setError(undefined);
        }}
        isLoading={isLoading}
        error={error}
      />
      {!pendingTwoFactorEmail && (
        <p className="mt-6 text-center text-xs text-gray-500 dark:text-gray-400">
          Zero-knowledge means there is no password reset. If you lose your password, your files cannot be recovered.
        </p>
      )}
    </AuthLayout>
  );
};

export default LoginPage;
