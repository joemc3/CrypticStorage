/**
 * CrypticStorage - Auth Layout
 * Layout for authentication pages (login, register)
 */

import React from 'react';
import { motion } from 'framer-motion';
import { ShieldCheckIcon } from '@heroicons/react/24/outline';

export interface AuthLayoutProps {
  children: React.ReactNode;
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-indigo-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <div className="flex items-center justify-center mb-4">
            <ShieldCheckIcon className="h-12 w-12 text-indigo-600 dark:text-indigo-400 mr-3" />
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
              CrypticStorage
            </h1>
          </div>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Secure, encrypted cloud storage with client-side encryption.
            Your files, your keys, your privacy.
          </p>
        </motion.div>

        {/* Main Content */}
        <div className="flex items-center justify-center min-h-[60vh]">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="w-full max-w-md"
          >
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
              {children}
            </div>
          </motion.div>
        </div>

        {/* Footer */}
        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-12 text-center"
        >
          <div className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
            <div className="flex items-center justify-center gap-6">
              <a
                href="/about"
                className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
              >
                About
              </a>
              <a
                href="/privacy"
                className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
              >
                Privacy
              </a>
              <a
                href="/terms"
                className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
              >
                Terms
              </a>
              <a
                href="/help"
                className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
              >
                Help
              </a>
            </div>
            <p className="text-xs">
              &copy; {new Date().getFullYear()} CrypticStorage. All rights reserved.
            </p>
          </div>
        </motion.footer>
      </div>
    </div>
  );
};
