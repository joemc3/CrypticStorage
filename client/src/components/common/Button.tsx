import React from 'react';
import { motion } from 'framer-motion';
import { cva, type VariantProps } from 'class-variance-authority';

const buttonVariants = cva(
  'inline-flex items-center justify-center font-mono text-sm tracking-wider uppercase transition-all focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden',
  {
    variants: {
      variant: {
        primary: 'bg-cipher-phosphor text-cipher-black shadow-glow-sm hover:shadow-glow-md hover:-translate-y-0.5',
        secondary: 'bg-cipher-charcoal text-text-primary border border-cipher-slate hover:bg-cipher-slate hover:border-cipher-phosphor/50',
        danger: 'bg-cipher-crimson text-white hover:shadow-[0_0_20px_rgb(255_51_102/0.5)] hover:-translate-y-0.5',
        ghost: 'bg-transparent text-text-secondary border border-transparent hover:bg-cipher-charcoal hover:text-cipher-phosphor',
        outline: 'bg-transparent text-cipher-phosphor border-2 border-cipher-phosphor hover:bg-cipher-phosphor/10 hover:shadow-glow-sm',
      },
      size: {
        sm: 'text-xs px-3 py-1.5 rounded-md',
        md: 'text-sm px-5 py-2.5 rounded-lg',
        lg: 'text-base px-7 py-3.5 rounded-lg',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, isLoading, leftIcon, rightIcon, children, disabled, ...props }, ref) => {
    return (
      <motion.button
        ref={ref}
        className={buttonVariants({ variant, size, className })}
        disabled={disabled || isLoading}
        whileTap={{ scale: 0.98 }}
        transition={{ duration: 0.1 }}
        {...props}
      >
        {/* Shine effect on hover */}
        <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 hover:opacity-100 transition-opacity -skew-x-12" />

        {isLoading ? (
          <span className="flex items-center gap-2">
            <svg
              className="animate-spin h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            PROCESSING...
          </span>
        ) : (
          <span className="flex items-center gap-2 relative z-10">
            {leftIcon && <span className="flex-shrink-0">{leftIcon}</span>}
            {children}
            {rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
          </span>
        )}
      </motion.button>
    );
  }
);

Button.displayName = 'Button';
