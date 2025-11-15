import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastProps {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  onClose: (id: string) => void;
}

const toastConfig = {
  success: {
    icon: CheckCircleIcon,
    className: 'bg-green-50 border-green-500 dark:bg-green-900/20 dark:border-green-500',
    iconColor: 'text-green-500',
  },
  error: {
    icon: XCircleIcon,
    className: 'bg-red-50 border-red-500 dark:bg-red-900/20 dark:border-red-500',
    iconColor: 'text-red-500',
  },
  warning: {
    icon: ExclamationTriangleIcon,
    className: 'bg-yellow-50 border-yellow-500 dark:bg-yellow-900/20 dark:border-yellow-500',
    iconColor: 'text-yellow-500',
  },
  info: {
    icon: InformationCircleIcon,
    className: 'bg-blue-50 border-blue-500 dark:bg-blue-900/20 dark:border-blue-500',
    iconColor: 'text-blue-500',
  },
};

export const Toast: React.FC<ToastProps> = ({ id, type, title, message, duration = 5000, onClose }) => {
  const config = toastConfig[type];
  const Icon = config.icon;

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onClose(id);
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [id, duration, onClose]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -50, scale: 0.3 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 300, scale: 0.5 }}
      transition={{ type: 'spring', stiffness: 500, damping: 40 }}
      className={`flex items-start gap-3 p-4 rounded-lg border-l-4 shadow-lg max-w-md w-full ${config.className}`}
    >
      <Icon className={`h-6 w-6 ${config.iconColor} flex-shrink-0 mt-0.5`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</p>
        {message && <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{message}</p>}
      </div>
      <button
        onClick={() => onClose(id)}
        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors flex-shrink-0"
      >
        <XMarkIcon className="h-5 w-5" />
      </button>
    </motion.div>
  );
};

export interface ToastContainerProps {
  toasts: ToastProps[];
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';
}

const positionClasses = {
  'top-right': 'top-4 right-4',
  'top-left': 'top-4 left-4',
  'bottom-right': 'bottom-4 right-4',
  'bottom-left': 'bottom-4 left-4',
  'top-center': 'top-4 left-1/2 -translate-x-1/2',
  'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2',
};

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, position = 'top-right' }) => {
  return (
    <div className={`fixed ${positionClasses[position]} z-50 flex flex-col gap-2`}>
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <Toast key={toast.id} {...toast} />
        ))}
      </AnimatePresence>
    </div>
  );
};
