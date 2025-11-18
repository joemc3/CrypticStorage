/**
 * CrypticStorage - Auth Layout
 * Cipher-aesthetic layout for authentication pages
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

export interface AuthLayoutProps {
  children: React.ReactNode;
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-cipher-black relative overflow-hidden">
      {/* Grid Background */}
      <div className="absolute inset-0 bg-grid-cipher bg-[size:40px_40px] opacity-20" />

      {/* Diagonal Scan Line */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute w-[200%] h-1 bg-gradient-to-r from-transparent via-cipher-phosphor/20 to-transparent -rotate-45"
          initial={{ x: '-100%', y: '-100%' }}
          animate={{ x: '100%', y: '100%' }}
          transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
        />
      </div>

      {/* Ambient Glow */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-cipher-phosphor/5 rounded-full blur-[100px]" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-cipher-amber/5 rounded-full blur-[80px]" />

      <div className="relative z-10 container mx-auto px-4 py-8 min-h-screen flex flex-col">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="flex items-center justify-between"
        >
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-lg bg-cipher-phosphor/20 border border-cipher-phosphor/50 flex items-center justify-center group-hover:shadow-glow-sm transition-shadow">
              <svg className="w-6 h-6 text-cipher-phosphor" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <span className="font-mono text-lg tracking-wider text-text-primary">CRYPTIC</span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cipher-phosphor animate-pulse" />
            <span className="font-mono text-xs tracking-wider text-text-muted">SECURE CONNECTION</span>
          </div>
        </motion.header>

        {/* Main Content */}
        <div className="flex-1 flex items-center justify-center py-12">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="w-full max-w-md"
          >
            {/* Card Container */}
            <div className="relative">
              {/* Glow Effect */}
              <div className="absolute -inset-0.5 bg-gradient-to-r from-cipher-phosphor/20 to-cipher-amber/20 rounded-xl blur opacity-50" />

              {/* Card */}
              <div className="relative bg-cipher-obsidian border border-cipher-slate/40 rounded-xl overflow-hidden">
                {/* Top Accent Line */}
                <div className="h-1 bg-gradient-to-r from-transparent via-cipher-phosphor to-transparent" />

                {/* Content */}
                <div className="p-8">
                  {children}
                </div>

                {/* Bottom Pattern */}
                <div className="px-8 pb-6">
                  <div className="flex items-center gap-2 justify-center">
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent to-cipher-slate/30" />
                    <svg className="w-4 h-4 text-cipher-slate" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <div className="h-px flex-1 bg-gradient-to-l from-transparent to-cipher-slate/30" />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Footer */}
        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="text-center"
        >
          <div className="flex items-center justify-center gap-6 mb-4">
            {['PRIVACY', 'TERMS', 'HELP'].map((link) => (
              <a
                key={link}
                href={`/${link.toLowerCase()}`}
                className="font-mono text-xs text-text-muted hover:text-cipher-phosphor transition-colors"
              >
                {link}
              </a>
            ))}
          </div>
          <p className="font-mono text-xs text-text-muted">
            {new Date().getFullYear()} CRYPTICSTORAGE
          </p>
        </motion.footer>
      </div>
    </div>
  );
};
