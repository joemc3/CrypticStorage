import React, { useState } from 'react';
import { ShieldCheckIcon, DocumentDuplicateIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { Modal } from '../common/Modal';
import { TwoFactorSetup } from './TwoFactorSetup';
import { useAuth } from '../../hooks/useAuth';

const BackupCodes: React.FC<{ codes: string[]; onDone: () => void }> = ({ codes, onDone }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(codes.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Each backup code works once. Store them somewhere safe; they are the only way in if you lose your authenticator.
      </p>
      <div className="grid grid-cols-2 gap-2 font-mono text-sm bg-gray-100 dark:bg-gray-700 rounded-lg p-4">
        {codes.map((code) => (
          <span key={code} className="text-gray-900 dark:text-gray-100">
            {code}
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={copy} leftIcon={copied ? <CheckCircleIcon className="h-5 w-5 text-green-500" /> : <DocumentDuplicateIcon className="h-5 w-5" />}>
          {copied ? 'Copied' : 'Copy codes'}
        </Button>
        <Button onClick={onDone}>I saved them</Button>
      </div>
    </div>
  );
};

/** Full enable / disable / regenerate flow for the settings page. */
export const TwoFactorSettings: React.FC = () => {
  const { user, isLoading, setupTwoFactor, enableTwoFactor, disableTwoFactor, regenerateBackupCodes } = useAuth();
  const [setup, setSetup] = useState<{ secret: string; qrCode: string } | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [modal, setModal] = useState<'disable' | 'regenerate' | null>(null);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();

  const closeModal = () => {
    setModal(null);
    setPassword('');
    setCode('');
    setError(undefined);
  };

  const startSetup = async () => {
    setSetup(await setupTwoFactor());
  };

  const verify = async (token: string): Promise<boolean> => {
    try {
      const codes = await enableTwoFactor(token);
      setBackupCodes(codes);
      return true;
    } catch {
      return false;
    }
  };

  const confirmDisable = async () => {
    setError(undefined);
    try {
      await disableTwoFactor(code, password);
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  };

  const confirmRegenerate = async () => {
    setError(undefined);
    try {
      const codes = await regenerateBackupCodes(password);
      closeModal();
      setBackupCodes(codes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  };

  if (backupCodes) {
    return (
      <BackupCodes
        codes={backupCodes}
        onDone={() => {
          setBackupCodes(null);
          setSetup(null);
        }}
      />
    );
  }

  if (setup) {
    return <TwoFactorSetup secret={setup.secret} qrCodeUrl={setup.qrCode} onVerify={verify} onComplete={() => setSetup(null)} isLoading={isLoading} />;
  }

  return (
    <div className="space-y-4">
      {user?.twoFactorEnabled ? (
        <>
          <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <ShieldCheckIcon className="h-6 w-6 text-green-600 dark:text-green-400" />
            <div>
              <p className="font-medium text-green-900 dark:text-green-100">Two-factor authentication is on</p>
              <p className="text-sm text-green-800 dark:text-green-300">Every sign-in needs a code from your authenticator app.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setModal('regenerate')}>
              Regenerate backup codes
            </Button>
            <Button variant="danger" onClick={() => setModal('disable')}>
              Turn off
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Protect your account with a time-based code from an authenticator app such as Aegis, 1Password or Google Authenticator.
          </p>
          <Button onClick={startSetup} isLoading={isLoading} leftIcon={<ShieldCheckIcon className="h-5 w-5" />}>
            Turn on two-factor authentication
          </Button>
        </>
      )}

      <Modal isOpen={modal === 'disable'} onClose={closeModal} title="Turn off two-factor authentication" size="sm">
        <div className="space-y-4">
          <Input type="text" label="Authenticator code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} autoComplete="one-time-code" />
          <Input type="password" label="Password" value={password} onChange={(e) => setPassword(e.target.value)} error={error} autoComplete="current-password" />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeModal}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmDisable} isLoading={isLoading} disabled={code.length !== 6 || !password}>
              Turn off
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={modal === 'regenerate'} onClose={closeModal} title="Regenerate backup codes" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">Your existing backup codes stop working immediately.</p>
          <Input type="password" label="Password" value={password} onChange={(e) => setPassword(e.target.value)} error={error} autoComplete="current-password" />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeModal}>
              Cancel
            </Button>
            <Button onClick={confirmRegenerate} isLoading={isLoading} disabled={!password}>
              Regenerate
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
