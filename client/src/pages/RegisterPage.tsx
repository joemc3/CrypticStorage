/**
 * CrypticStorage - Register Page
 * User registration page
 */

import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthLayout } from '../layouts/AuthLayout';
import { RegisterForm, RegisterData } from '../components/auth/RegisterForm';
import { useAuth } from '../hooks/useAuth';

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { register, isLoading } = useAuth();
  const [error, setError] = useState<string | undefined>();

  // Get the redirect URL from location state, default to dashboard
  const from = (location.state as any)?.from?.pathname || '/dashboard';

  const handleRegister = async (data: RegisterData) => {
    try {
      setError(undefined);
      await register({
        email: data.email,
        password: data.password,
      });

      // Redirect to the page they were trying to access or dashboard
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please try again.');
    }
  };

  const handleLogin = () => {
    navigate('/login', { state: { from } });
  };

  return (
    <AuthLayout>
      <RegisterForm
        onSubmit={handleRegister}
        onLogin={handleLogin}
        isLoading={isLoading}
        error={error}
      />
    </AuthLayout>
  );
};

export default RegisterPage;
