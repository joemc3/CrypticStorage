import React, { useState } from 'react';
import { LockClosedIcon } from '@heroicons/react/24/outline';
import { Button } from '../common/Button';
import { Input } from '../common/Input';

export interface UnlockFormProps {
  email: string;
  onUnlock: (password: string) => Promise<void>;
  onSignOut: () => void;
  isLoading?: boolean;
  lockAfterMinutes?: number;
}

/** Shown after a lock or reload: the session is valid but the keys left memory. */
export const UnlockForm: React.FC<UnlockFormProps> = ({ email, onUnlock, onSignOut, isLoading = false, lockAfterMinutes = 5 }) => {
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
    <div className="relative w-full max-w-sm mx-auto">
      <button type="button" onClick={onSignOut} className="absolute -top-16 right-0 text-sm text-ink-2 hover:text-ink">
        Sign out
      </button>
      <form onSubmit={submit} className="space-y-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-full border-[1.5px] border-line text-ink">
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
