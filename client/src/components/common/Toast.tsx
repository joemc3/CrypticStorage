import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckIcon, ExclamationTriangleIcon, InformationCircleIcon } from '@heroicons/react/24/outline';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastProps {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  onClose: (id: string) => void;
}

const icons = {
  success: CheckIcon,
  error: ExclamationTriangleIcon,
  warning: ExclamationTriangleIcon,
  info: InformationCircleIcon,
};

/** Inverse colours, one line, a quiet Dismiss. */
export const Toast: React.FC<ToastProps> = ({ id, type, title, message, duration = 5000, onClose }) => {
  const Icon = icons[type];

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => onClose(id), duration);
      return () => clearTimeout(timer);
    }
  }, [id, duration, onClose]);

  return (
    <motion.div
      layout
      role={type === 'error' ? 'alert' : 'status'}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
      className="flex w-full max-w-md items-center gap-3 rounded-[10px] bg-[var(--inverse)] py-3 pl-4 pr-3 text-sm leading-5 text-[var(--inverse-ink)] shadow-[var(--shadow)]"
    >
      <Icon className="h-5 w-5 flex-none" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        {message && <p className="opacity-80">{message}</p>}
      </div>
      <button
        type="button"
        onClick={() => onClose(id)}
        className="h-8 flex-none rounded-lg px-2.5 text-sm font-semibold hover:underline"
      >
        Dismiss
      </button>
    </motion.div>
  );
};

export interface ToastContainerProps {
  toasts: ToastProps[];
  position?: 'bottom-right' | 'bottom-center';
}

const positionClasses = {
  'bottom-right': 'bottom-4 right-4',
  'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2',
};

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, position = 'bottom-right' }) => (
  <div className={`fixed ${positionClasses[position]} z-50 flex flex-col gap-2`}>
    <AnimatePresence mode="popLayout">
      {toasts.map((toast) => (
        <Toast key={toast.id} {...toast} />
      ))}
    </AnimatePresence>
  </div>
);
