import React from 'react';
import { ExclamationCircleIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
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

    const inputClasses = `
      block w-full rounded-lg border px-4 py-2.5 transition-colors
      ${leftIcon ? 'pl-10' : ''}
      ${rightIcon || hasError || hasSuccess ? 'pr-10' : ''}
      ${
        hasError
          ? 'border-red-300 text-red-900 placeholder-red-300 focus:border-red-500 focus:ring-red-500 dark:border-red-700 dark:text-red-100'
          : hasSuccess
          ? 'border-green-300 text-green-900 placeholder-green-300 focus:border-green-500 focus:ring-green-500 dark:border-green-700 dark:text-green-100'
          : 'border-gray-300 text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400'
      }
      focus:outline-none focus:ring-2 focus:ring-offset-0
      disabled:opacity-50 disabled:cursor-not-allowed
      ${className || ''}
    `;

    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <span className="text-gray-400 dark:text-gray-500">{leftIcon}</span>
            </div>
          )}
          <input ref={ref} className={inputClasses} {...props} />
          {(rightIcon || hasError || hasSuccess) && (
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
              {hasError ? (
                <ExclamationCircleIcon className="h-5 w-5 text-red-500" />
              ) : hasSuccess ? (
                <CheckCircleIcon className="h-5 w-5 text-green-500" />
              ) : (
                rightIcon && <span className="text-gray-400 dark:text-gray-500">{rightIcon}</span>
              )}
            </div>
          )}
        </div>
        {(error || success || helperText) && (
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mt-1 text-sm ${
              hasError
                ? 'text-red-600 dark:text-red-400'
                : hasSuccess
                ? 'text-green-600 dark:text-green-400'
                : 'text-gray-500 dark:text-gray-400'
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
