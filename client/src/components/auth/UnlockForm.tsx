import React, { useState } from 'react';
import { LockClosedIcon } from '@heroicons/react/24/outline';
import { motion } from 'framer-motion';
import { Button } from '../common/Button';
import { Input } from '../common/Input';

export interface UnlockFormProps {
  email: string;
  onUnlock: (password: string) => Promise<void>;
  onSignOut: () => void;
  isLoading?: boolean;
}

/** Shown after a reload: the session is valid but the keys left memory. */
export const UnlockForm: React.FC<UnlockFormProps> = ({ email, onUnlock, onSignOut, isLoading = false }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setError(undefined);
    try {
      await onUnlock(password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not unlock');
      setPassword('');
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md mx-auto">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-100 dark:bg-indigo-900 rounded-full mb-4">
          <LockClosedIcon className="h-8 w-8 text-indigo-600 dark:text-indigo-400" />
        </div>
        <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Vault locked</h2>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Enter your password to decrypt your keys on this device. Nothing is sent to the server.
        </p>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <Input type="email" label="Account" value={email} disabled autoComplete="username" />
        <Input
          type="password"
          label="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={error}
          autoFocus
          autoComplete="current-password"
          disabled={isLoading}
        />
        <Button type="submit" isLoading={isLoading} className="w-full">
          Unlock
        </Button>
        <button type="button" onClick={onSignOut} className="w-full text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          Sign out instead
        </button>
      </form>
    </motion.div>
  );
};
