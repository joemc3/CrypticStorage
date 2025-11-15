/**
 * CrypticStorage - Login Page
 * User login page with 2FA support
 */

import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthLayout } from '../layouts/AuthLayout';
import { LoginForm, LoginData } from '../components/auth/LoginForm';
import { useAuth } from '../hooks/useAuth';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { loginUser, isLoading } = useAuth();
  const [error, setError] = useState<string | undefined>();

  // Get the redirect URL from location state, default to dashboard
  const from = (location.state as any)?.from?.pathname || '/dashboard';

  const handleLogin = async (data: LoginData) => {
    try {
      setError(undefined);
      const result = await loginUser({
        email: data.email,
        password: data.password,
        rememberMe: false,
      });

      if (!result.requiresTwoFactor) {
        // Redirect to the page they were trying to access or dashboard
        navigate(from, { replace: true });
      }
    } catch (err: any) {
      setError(err.message || 'Login failed. Please try again.');
    }
  };

  const handleRegister = () => {
    navigate('/register', { state: { from } });
  };

  const handleForgotPassword = () => {
    // TODO: Implement forgot password flow
    alert('Password reset functionality coming soon!');
  };

  return (
    <AuthLayout>
      <LoginForm
        onSubmit={handleLogin}
        onRegister={handleRegister}
        onForgotPassword={handleForgotPassword}
        isLoading={isLoading}
        error={error}
      />
    </AuthLayout>
  );
};

export default LoginPage;
