import React from 'react';

export interface OneFactProps {
  /** The consequence, in one or two sentences. Rendered in the serif. */
  fact: string;
  supporting?: string;
  action: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean };
  back?: () => void;
  /** Label for the quiet back button. Defaults to "Back". */
  backLabel?: string;
  backDisabled?: boolean;
  /** Small mono line above the fact, for example a date. */
  eyebrow?: string;
  cancel?: () => void;
  /** Label for the top-right button. Defaults to "Cancel". */
  cancelLabel?: string;
  /** Rendered between the supporting text and the action, for example a text field. */
  children?: React.ReactNode;
}

const quiet =
  'rounded-lg px-3 py-2 text-sm font-medium text-ink-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';

/** Full-screen, chrome-free screen that states one fact and offers one action. */
export const OneFact: React.FC<OneFactProps> = ({ fact, supporting, action, back, backLabel = 'Back', backDisabled, cancel, cancelLabel = 'Cancel', eyebrow, children }) => (
  <main className="relative flex min-h-screen flex-col bg-bg text-ink">
    {cancel && (
      <div className="absolute right-4 top-4 md:right-8 md:top-6">
        <button type="button" className={quiet} onClick={cancel}>
          {cancelLabel}
        </button>
      </div>
    )}
    <div className="mx-auto flex w-full max-w-[560px] flex-1 flex-col justify-center px-4 py-16 md:px-0">
      {eyebrow && <span className="mb-3 font-mono text-xs text-ink-3">{eyebrow}</span>}
      <h1 className="font-serif text-[30px] font-semibold leading-9 text-ink md:text-[44px] md:leading-[50px]">{fact}</h1>
      {supporting && <p className="mt-4 font-sans text-base leading-6 text-ink-2">{supporting}</p>}
      {children && <div className="mt-6">{children}</div>}
      <div className="mt-8 flex flex-col gap-2">
        <button
          type="button"
          onClick={action.onClick}
          disabled={action.disabled}
          className={`w-full rounded-lg px-4 py-3 font-sans text-[15px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            action.danger
              ? 'bg-danger text-danger-ink hover:bg-danger-hover'
              : 'bg-accent text-accent-ink hover:bg-accent-hover'
          }`}
        >
          {action.label}
        </button>
        {back && (
          <button type="button" className={`${quiet} self-center disabled:opacity-50`} onClick={back} disabled={backDisabled}>
            {backLabel}
          </button>
        )}
      </div>
    </div>
  </main>
);
