/**
 * CrypticStorage - Register Page
 */

import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthLayout } from '../layouts/AuthLayout';
import { RegisterForm, type RegisterData } from '../components/auth/RegisterForm';
import { useAuth } from '../hooks/useAuth';

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { register, isLoading } = useAuth();
  const [error, setError] = useState<string | undefined>();

  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/dashboard';

  const handleRegister = async (data: RegisterData) => {
    setError(undefined);
    try {
      await register(data.email, data.password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    }
  };

  return (
    <AuthLayout>
      <RegisterForm onSubmit={handleRegister} onLogin={() => navigate('/login', { state: { from } })} isLoading={isLoading} error={error} />
      <p className="mt-6 text-center text-xs text-gray-500 dark:text-gray-400">
        Your encryption keys are generated in this browser. The server only ever stores them encrypted with your password.
      </p>
    </AuthLayout>
  );
};

export default RegisterPage;
