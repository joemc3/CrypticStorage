/**
 * CrypticStorage - Public Layout
 * Layout for public pages (shared files, etc.)
 */

import React from 'react';
import { motion } from 'framer-motion';
import { ShieldCheckIcon } from '@heroicons/react/24/outline';
import { Link } from 'react-router-dom';

export interface PublicLayoutProps {
  children: React.ReactNode;
}

export const PublicLayout: React.FC<PublicLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center">
              <ShieldCheckIcon className="h-8 w-8 text-indigo-600 dark:text-indigo-400 mr-2" />
              <span className="text-xl font-bold text-gray-900 dark:text-white">
                CrypticStorage
              </span>
            </Link>
            <Link
              to="/login"
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
            >
              Sign In
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {children}
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 mt-12">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center text-sm text-gray-600 dark:text-gray-400 space-y-2">
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
        </div>
      </footer>
    </div>
  );
};
