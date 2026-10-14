/**
 * CrypticStorage - Register Page
 * The contract, the form, then "check your email". The safe opens after verification.
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RegisterForm, type RegisterData } from '../components/auth/RegisterForm';
import { useAuth } from '../hooks/useAuth';

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { register, resendVerification, isLoading } = useAuth();
  const [error, setError] = useState<string | undefined>();
  const [sentTo, setSentTo] = useState<string | undefined>();
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  const handleRegister = async (data: RegisterData) => {
    setError(undefined);
    try {
      await register(data.email, data.password, data.displayName, data.phrase);
      setSentTo(data.email.trim().toLowerCase());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    }
  };

  const handleResend = async () => {
    if (!sentTo || resending) return;
    setResending(true);
    try {
      await resendVerification(sentTo);
    } catch {
      /* the server answers the same either way */
    }
    setResending(false);
    setResent(true);
  };

  return (
    <RegisterForm onSubmit={handleRegister} onResend={handleResend} onCancel={() => navigate('/')} isLoading={isLoading || resending} resent={resent} error={error} sentTo={sentTo} />
  );
};

export default RegisterPage;
