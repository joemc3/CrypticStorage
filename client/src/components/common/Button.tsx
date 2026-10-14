import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg border font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-[.42]',
  {
    variants: {
      variant: {
        primary: 'border-transparent bg-accent text-accent-ink hover:bg-accent-hover',
        secondary: 'border-line-strong bg-surface text-ink hover:bg-surface-2',
        quiet: 'border-transparent bg-transparent px-2.5 text-ink-2 hover:text-ink hover:underline',
        danger: 'border-transparent bg-danger text-danger-ink hover:bg-danger-hover',
      },
      size: {
        sm: 'h-9 px-3 text-sm',
        md: 'h-11 px-[18px] text-[15px]',
        lg: 'h-12 px-6 text-base',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  }
);

export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'>, VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  children?: React.ReactNode;
}

export const Spin: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span
    aria-hidden="true"
    className={`inline-block h-[18px] w-[18px] flex-none animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
  />
);

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, isLoading, leftIcon, rightIcon, children, disabled, type = 'button', ...props }, ref) => (
    <button ref={ref} type={type} className={buttonVariants({ variant, size, className })} disabled={disabled || isLoading} {...props}>
      {isLoading ? (
        <>
          <Spin />
          Working…
        </>
      ) : (
        <>
          {leftIcon}
          {children}
          {rightIcon}
        </>
      )}
    </button>
  )
);

Button.displayName = 'Button';
