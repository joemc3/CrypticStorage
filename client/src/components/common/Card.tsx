import React from 'react';

export interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  onClick?: () => void;
}

const paddingClasses = {
  none: '',
  sm: 'p-3',
  md: 'p-5',
  lg: 'p-6',
};

/** Surface, 1 px line, 12 px radius. No left-border accents. */
export const Card: React.FC<CardProps> = ({ children, className = '', padding = 'md', onClick }) => {
  const classes = `rounded-xl border border-line bg-surface ${paddingClasses[padding]} ${onClick ? 'w-full text-left hover:bg-surface-2' : ''} ${className}`;
  return onClick ? (
    <button type="button" className={classes} onClick={onClick}>
      {children}
    </button>
  ) : (
    <div className={classes}>{children}</div>
  );
};

export const CardHeader: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`mb-4 ${className}`}>{children}</div>
);

export const CardTitle: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <h3 className={`text-base font-semibold leading-[22px] text-ink ${className}`}>{children}</h3>
);

export const CardDescription: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <p className={`text-sm text-ink-2 ${className}`}>{children}</p>
);

export const CardContent: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={className}>{children}</div>
);

export const CardFooter: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`mt-4 border-t border-line pt-4 ${className}`}>{children}</div>
);
