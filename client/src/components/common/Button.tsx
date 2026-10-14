import React from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cva, type VariantProps } from 'class-variance-authority';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed',
  {
    variants: {
      variant: {
        primary: 'bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500',
        secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-500 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600',
        danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
        ghost: 'bg-transparent hover:bg-gray-100 text-gray-700 focus:ring-gray-500 dark:hover:bg-gray-800 dark:text-gray-300',
        outline: 'border-2 border-indigo-600 text-indigo-600 hover:bg-indigo-50 focus:ring-indigo-500 dark:border-indigo-400 dark:text-indigo-400 dark:hover:bg-indigo-900/20',
      },
      size: {
        sm: 'text-sm px-3 py-1.5',
        md: 'text-base px-4 py-2',
        lg: 'text-lg px-6 py-3',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  }
);

export interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'ref' | 'children'>, VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  children?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, isLoading, leftIcon, rightIcon, children, disabled, type = 'button', ...props }, ref) => (
    <motion.button
      ref={ref}
      type={type}
      className={buttonVariants({ variant, size, className })}
      disabled={disabled || isLoading}
      whileTap={disabled || isLoading ? undefined : { scale: 0.98 }}
      transition={{ duration: 0.1 }}
      {...props}
    >
      {isLoading ? (
        <>
          <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Working…
        </>
      ) : (
        <>
          {leftIcon && <span className="mr-2">{leftIcon}</span>}
          {children}
          {rightIcon && <span className="ml-2">{rightIcon}</span>}
        </>
      )}
    </motion.button>
  )
);

Button.displayName = 'Button';
