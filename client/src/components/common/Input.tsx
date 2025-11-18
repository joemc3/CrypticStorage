import React from 'react';
import { motion } from 'framer-motion';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  success?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, success, helperText, leftIcon, rightIcon, ...props }, ref) => {
    const hasError = !!error;
    const hasSuccess = !!success;

    return (
      <div className="w-full">
        {label && (
          <label className="block font-mono text-xs tracking-wider text-text-secondary mb-2 uppercase">
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <span className={`${hasError ? 'text-cipher-crimson' : 'text-text-muted'} transition-colors`}>
                {leftIcon}
              </span>
            </div>
          )}
          <input
            ref={ref}
            className={`
              block w-full px-4 py-3 font-mono text-sm
              bg-cipher-charcoal border rounded-lg
              text-text-primary placeholder-text-muted
              transition-all duration-200
              ${leftIcon ? 'pl-12' : ''}
              ${rightIcon || hasError || hasSuccess ? 'pr-12' : ''}
              ${
                hasError
                  ? 'border-cipher-crimson focus:border-cipher-crimson focus:ring-cipher-crimson/20'
                  : hasSuccess
                  ? 'border-cipher-phosphor focus:border-cipher-phosphor focus:ring-cipher-phosphor/20'
                  : 'border-cipher-slate/50 focus:border-cipher-phosphor focus:ring-cipher-phosphor/20'
              }
              focus:outline-none focus:ring-2 focus:shadow-glow-sm
              disabled:opacity-50 disabled:cursor-not-allowed
              ${className || ''}
            `}
            {...props}
          />
          {(rightIcon || hasError || hasSuccess) && (
            <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
              {hasError ? (
                <svg className="w-5 h-5 text-cipher-crimson" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              ) : hasSuccess ? (
                <svg className="w-5 h-5 text-cipher-phosphor" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              ) : (
                rightIcon && <span className="text-text-muted">{rightIcon}</span>
              )}
            </div>
          )}
        </div>
        {(error || success || helperText) && (
          <motion.p
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mt-2 font-mono text-xs ${
              hasError
                ? 'text-cipher-crimson'
                : hasSuccess
                ? 'text-cipher-phosphor'
                : 'text-text-muted'
            }`}
          >
            {error || success || helperText}
          </motion.p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
