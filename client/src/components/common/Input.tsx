import React, { useId } from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  /** Monospace, for URLs and keys. */
  mono?: boolean;
  /** One wide mono field for a six-digit code, so paste and autofill work. */
  code?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, helperText, mono, code, id, 'aria-describedby': describedBy, ...props }, ref) => {
    const generated = useId();
    const fieldId = id ?? generated;
    const noteId = `${fieldId}-note`;
    const hasNote = !!(error || helperText);
    const describedIds = [describedBy, hasNote ? noteId : undefined].filter(Boolean).join(' ') || undefined;

    const sizing = code
      ? 'h-14 pl-[.38em] text-center font-mono text-[26px] font-medium tracking-[.38em]'
      : `h-11 px-3 text-[15px] ${mono ? 'font-mono text-sm' : ''}`;

    return (
      <div className="flex w-full flex-col gap-1.5">
        {label && (
          <label htmlFor={fieldId} className="text-sm font-medium leading-[18px] text-ink">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedIds}
          className={`block w-full rounded-lg border bg-surface text-ink placeholder:text-ink-3 read-only:bg-surface-2 read-only:text-ink-2 disabled:cursor-not-allowed disabled:opacity-[.42] ${
            error ? 'border-danger' : 'border-line-strong'
          } ${sizing} ${className ?? ''}`}
          {...props}
        />
        {hasNote && (
          <p id={noteId} className={`text-[13px] leading-[18px] ${error ? 'text-danger-text' : 'text-ink-3'}`}>
            {error || helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
