/**
 * CrypticStorage - 404 Not Found Page
 * Cipher-styled error page
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-cipher-black relative overflow-hidden flex items-center justify-center px-4">
      {/* Grid Background */}
      <div className="absolute inset-0 bg-grid-cipher bg-[size:40px_40px] opacity-20" />

      {/* Ambient Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cipher-crimson/10 rounded-full blur-[100px]" />

      <div className="relative z-10 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          {/* Glitch-style 404 */}
          <div className="relative">
            <h1 className="font-mono text-[150px] sm:text-[200px] font-bold text-cipher-crimson leading-none">
              404
            </h1>
            <div className="absolute inset-0 font-mono text-[150px] sm:text-[200px] font-bold text-cipher-phosphor leading-none opacity-20 transform translate-x-1 -translate-y-1">
              404
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mb-8"
        >
          <h2 className="font-display text-3xl text-text-primary mb-4">
            Route Not Found
          </h2>
          <p className="font-mono text-sm text-text-muted max-w-md mx-auto">
            THE REQUESTED PATH DOES NOT EXIST OR HAS BEEN MOVED
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <Link
            to="/"
            className="btn btn-primary px-6 py-3"
          >
            <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            </svg>
            GO HOME
          </Link>
          <button
            onClick={() => window.history.back()}
            className="btn btn-secondary px-6 py-3"
          >
            <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            GO BACK
          </button>
        </motion.div>

        {/* Terminal-style error details */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-12 p-4 bg-cipher-obsidian border border-cipher-slate/30 rounded-lg max-w-md mx-auto"
        >
          <div className="font-mono text-xs text-text-muted text-left">
            <span className="text-cipher-crimson">[ERROR]</span> Path resolution failed
            <br />
            <span className="text-cipher-amber">[INFO]</span> Requested: <span className="text-text-primary">{window.location.pathname}</span>
            <br />
            <span className="text-cipher-phosphor">[HINT]</span> Check URL or return home
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default NotFoundPage;
