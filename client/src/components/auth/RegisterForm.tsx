import React, { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { OneFact } from '../common/OneFact';
import { AuthLayout } from '../../layouts/AuthLayout';

export const CONTRACT_PHRASE = 'I understand there is no way back';

export interface RegisterData {
  email: string;
  password: string;
  displayName?: string;
  phrase: string;
}

export interface RegisterFormProps {
  onSubmit: (data: RegisterData) => Promise<void>;
  onResend: () => void;
  onCancel: () => void;
  isLoading?: boolean;
  error?: string;
  /** Set by the page once the account exists; moves the wizard to "check your email". */
  sentTo?: string;
}

type Step = 1 | 2 | 3 | 4 | 'form';

const FACTS: Record<1 | 2 | 3, { fact: string; supporting: string }> = {
  1: {
    fact: 'There is no password reset.',
    supporting:
      'If you forget your password, nothing and nobody can get your items back. Not us, not support, not a recovery key.',
  },
  2: {
    fact: 'Your email address cannot be changed later.',
    supporting: 'Your email is part of how your keys are derived. Choose the one you will still have in ten years.',
  },
  3: {
    fact: 'Your witnesses can release your items without you.',
    supporting:
      'You will choose them later. Any k of n of them, together, can hand your items to the people you name. Choose people you would trust with a key to your house.',
  },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Strength {
  score: number; // 0-4
  line: string;
}

/** A short, honest description of the password, not a gate. */
const describeStrength = (password: string): Strength => {
  if (!password) return { score: 0, line: 'Use a long phrase. Length matters more than symbols.' };
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (password.length >= 16) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password)) score++;
  score = Math.min(score, 4);
  const lines = [
    'Too short. Use at least 8 characters.',
    'Weak. A longer phrase is much stronger.',
    'Fair. Add a few more words.',
    'Good. Write it down and keep it somewhere that is not this safe.',
    'Strong. Write it down and keep it somewhere that is not this safe.',
  ];
  return { score, line: lines[score] };
};

const fieldClass =
  'block w-full rounded-lg border border-line bg-surface px-3 py-2.5 font-sans text-base text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50';
const labelClass = 'mb-1 block font-sans text-sm font-medium text-ink';
const helpClass = 'mt-1 block font-sans text-sm text-ink-3';

export const RegisterForm: React.FC<RegisterFormProps> = ({ onSubmit, onResend, onCancel, isLoading = false, error, sentTo }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [phrase, setPhrase] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [problem, setProblem] = useState<string | undefined>();

  const accepted = phrase.trim() === CONTRACT_PHRASE;
  const strength = useMemo(() => describeStrength(password), [password]);

  // The step lives in history state so the browser back button walks the wizard.
  // Nothing about the acknowledgement is stored: a reload loses the typed phrase,
  // so a restored "form" step without it falls back to the first screen.
  const requested = (location.state as { registerStep?: Step } | null)?.registerStep ?? 1;
  const step: Step = requested === 'form' && !accepted ? 1 : requested;

  const go = (next: Step) => navigate(location.pathname, { state: { ...(location.state as object | null), registerStep: next } });

  if (sentTo) {
    return (
      <AuthLayout>
        <div className="flex flex-col gap-5">
          <h1 className="font-serif text-[30px] font-semibold leading-9 text-ink">Check your email</h1>
          <p className="font-sans text-base leading-6 text-ink-2">
            We sent a link to <span className="text-ink">{sentTo}</span>. Open it on any device to finish. Your safe exists once the
            address is verified.
          </p>
          <button
            type="button"
            onClick={onResend}
            disabled={isLoading}
            className="w-full rounded-lg border border-line-strong bg-surface px-4 py-3 font-sans text-[15px] font-medium text-ink hover:bg-surface-2 disabled:opacity-50"
          >
            Resend the email
          </button>
          <p className="text-center font-sans text-sm text-ink-3">Nothing after a few minutes? Check spam, then resend.</p>
        </div>
      </AuthLayout>
    );
  }

  if (step === 1 || step === 2 || step === 3) {
    const { fact, supporting } = FACTS[step];
    return (
      <OneFact
        fact={fact}
        supporting={supporting}
        action={{ label: 'I understand', onClick: () => go((step + 1) as Step) }}
        back={step === 1 ? onCancel : () => go((step - 1) as Step)}
        backLabel={step === 1 ? 'Not now' : 'Back'}
      />
    );
  }

  if (step === 4) {
    return (
      <OneFact
        fact={`Type "${CONTRACT_PHRASE}" to continue.`}
        action={{ label: 'Continue', onClick: () => go('form'), disabled: !accepted }}
        back={() => go(3)}
      >
        <label htmlFor="contract-phrase" className="sr-only">
          Confirmation phrase
        </label>
        <input
          id="contract-phrase"
          type="text"
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          placeholder={CONTRACT_PHRASE}
          autoComplete="off"
          spellCheck={false}
          className={fieldClass}
        />
        {accepted && <span className="mt-1 block font-sans text-sm text-accent-text">Matches</span>}
      </OneFact>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) return setProblem('Enter a valid email address.');
    if (password.length < 8) return setProblem('The password needs at least 8 characters.');
    if (password !== again) return setProblem('The two passwords differ.');
    setProblem(undefined);
    await onSubmit({ email, password, displayName: displayName.trim() || undefined, phrase: phrase.trim() });
  };

  const shown = problem ?? error;

  return (
    <AuthLayout>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        <div>
          <h1 className="font-serif text-[30px] font-semibold leading-9 text-ink">Create your account</h1>
          <p className="mt-2 font-sans text-base text-ink-2">The password is the only key there is.</p>
        </div>

        {shown && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 font-sans text-sm text-danger-text">
            {shown}
          </p>
        )}

        <div>
          <label htmlFor="reg-email" className={labelClass}>Email</label>
          <input id="reg-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" disabled={isLoading} className={fieldClass} />
          <span className={helpClass}>Cannot be changed later.</span>
        </div>

        <div>
          <label htmlFor="reg-name" className={labelClass}>Display name (optional)</label>
          <input id="reg-name" type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="name" disabled={isLoading} className={fieldClass} />
          <span className={helpClass}>People you share with will see this name.</span>
        </div>

        <div>
          <label htmlFor="reg-password" className={labelClass}>Password</label>
          <input id="reg-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" disabled={isLoading} className={fieldClass} />
          <div className="mt-2 flex gap-1" aria-hidden="true">
            {[1, 2, 3, 4].map((i) => (
              <span key={i} className={`h-1 flex-1 rounded-full ${i <= strength.score ? 'bg-accent' : 'bg-line'}`} />
            ))}
          </div>
          <span className={helpClass}>{strength.line}</span>
        </div>

        <div>
          <label htmlFor="reg-again" className={labelClass}>Password again</label>
          <input id="reg-again" type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" disabled={isLoading} className={fieldClass} />
          {again && password === again && <span className="mt-1 block font-sans text-sm text-accent-text">Both match</span>}
        </div>

        <div className="mt-2 flex flex-col gap-2">
          <button type="submit" disabled={isLoading} className="w-full rounded-lg bg-accent px-4 py-3 font-sans text-[15px] font-medium text-accent-ink hover:bg-accent-hover disabled:opacity-50">
            {isLoading ? 'Creating your keys…' : 'Create account'}
          </button>
          <button type="button" onClick={() => go(4)} disabled={isLoading} className="self-center rounded-lg px-3 py-2 font-sans text-sm font-medium text-ink-2 hover:text-ink">
            Back
          </button>
        </div>
      </form>
    </AuthLayout>
  );
};
