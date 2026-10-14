import React, { useState } from 'react';
import { LockClosedIcon } from '@heroicons/react/24/outline';
import { Button } from '../common/Button';
import { Input } from '../common/Input';

export interface UnlockFormProps {
  email: string;
  onUnlock: (password: string) => Promise<void>;
  isLoading?: boolean;
  lockAfterMinutes?: number;
}

/** Shown after a lock or reload: the session is valid but the keys left memory. */
export const UnlockForm: React.FC<UnlockFormProps> = ({ email, onUnlock, isLoading = false, lockAfterMinutes = 5 }) => {
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
    <div className="w-full">
      <form onSubmit={submit} className="space-y-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-full border-[1.5px] border-line-strong text-ink">
          <LockClosedIcon className="h-7 w-7" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h1 className="font-serif text-3xl text-ink">Your safe is locked.</h1>
          <p className="text-ink-2">{email}</p>
        </div>
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
        <p className="text-sm text-ink-3">
          Locks after {lockAfterMinutes} minutes idle and when you close the tab. Unlocking works offline.
        </p>
      </form>
    </div>
  );
};
