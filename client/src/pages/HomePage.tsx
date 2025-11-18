import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

const HomePage: React.FC = () => {
  return (
    <div className="min-h-screen bg-cipher-black relative overflow-hidden">
      {/* Animated Grid Background */}
      <div className="absolute inset-0 bg-grid-cipher bg-[size:60px_60px] opacity-30" />

      {/* Radial Glow Effect */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-glow opacity-40" />

      {/* Floating Cipher Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute font-mono text-cipher-phosphor/10 text-sm"
            initial={{
              x: Math.random() * 100 + '%',
              y: -20,
              opacity: 0
            }}
            animate={{
              y: '120vh',
              opacity: [0, 0.3, 0]
            }}
            transition={{
              duration: 10 + Math.random() * 10,
              repeat: Infinity,
              delay: Math.random() * 5,
              ease: 'linear'
            }}
          >
            {['0x', '<<', '>>', '&&', '||', '{}', '[]', '**', '//'][Math.floor(Math.random() * 9)]}
          </motion.div>
        ))}
      </div>

      {/* Main Content */}
      <div className="relative z-10 container mx-auto px-4 py-16 sm:py-24">
        {/* Navigation */}
        <motion.nav
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="flex items-center justify-between mb-24"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-cipher-phosphor/20 border border-cipher-phosphor/50 flex items-center justify-center">
              <svg className="w-6 h-6 text-cipher-phosphor" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <span className="font-mono text-lg tracking-wider text-text-primary">CRYPTIC</span>
          </div>
          <div className="flex items-center gap-6">
            <Link
              to="/login"
              className="font-mono text-sm tracking-wider text-text-secondary hover:text-cipher-phosphor transition-colors"
            >
              SIGN IN
            </Link>
            <Link
              to="/register"
              className="btn btn-outline text-sm px-4 py-2"
            >
              GET STARTED
            </Link>
          </div>
        </motion.nav>

        {/* Hero Section */}
        <div className="text-center max-w-5xl mx-auto">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-cipher-charcoal border border-cipher-slate/50 mb-8"
          >
            <span className="w-2 h-2 rounded-full bg-cipher-phosphor animate-pulse" />
            <span className="font-mono text-xs tracking-wider text-text-secondary">
              ZERO-KNOWLEDGE ENCRYPTION
            </span>
          </motion.div>

          {/* Main Heading */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="font-display text-6xl sm:text-7xl lg:text-8xl mb-8"
          >
            <span className="block text-text-primary">Your files.</span>
            <span className="block text-gradient-cipher">Your keys.</span>
          </motion.h1>

          {/* Subheading */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="text-xl sm:text-2xl text-text-secondary mb-12 max-w-2xl mx-auto font-body leading-relaxed"
          >
            Military-grade encryption that happens on your device.
            We never see your data. Ever.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.7 }}
            className="flex flex-col sm:flex-row gap-4 justify-center mb-16"
          >
            <Link
              to="/register"
              className="btn btn-primary text-base px-8 py-4 shadow-glow-md hover:shadow-glow-lg transition-all"
            >
              START ENCRYPTING FREE
            </Link>
            <Link
              to="/login"
              className="btn btn-secondary text-base px-8 py-4"
            >
              VIEW DEMO
            </Link>
          </motion.div>

          {/* Terminal Preview */}
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.9 }}
            className="relative max-w-3xl mx-auto"
          >
            <div className="absolute -inset-1 bg-gradient-to-r from-cipher-phosphor/30 via-cipher-amber/20 to-cipher-phosphor/30 rounded-xl blur-xl opacity-50" />
            <div className="relative bg-cipher-obsidian border border-cipher-slate/50 rounded-xl overflow-hidden shadow-deep">
              {/* Terminal Header */}
              <div className="flex items-center gap-2 px-4 py-3 bg-cipher-charcoal border-b border-cipher-slate/30">
                <div className="w-3 h-3 rounded-full bg-cipher-crimson/80" />
                <div className="w-3 h-3 rounded-full bg-cipher-amber/80" />
                <div className="w-3 h-3 rounded-full bg-cipher-phosphor/80" />
                <span className="ml-4 font-mono text-xs text-text-muted">cryptic://vault</span>
              </div>
              {/* Terminal Content */}
              <div className="p-6 font-mono text-sm">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.2, duration: 0.3 }}
                >
                  <span className="text-cipher-phosphor">$</span>
                  <span className="text-text-secondary ml-2">cryptic upload secret-documents.zip</span>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.5, duration: 0.3 }}
                  className="mt-3 text-text-muted"
                >
                  <span className="text-cipher-amber">[i]</span> Generating AES-256-GCM key...
                </motion.div>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.8, duration: 0.3 }}
                  className="mt-1 text-text-muted"
                >
                  <span className="text-cipher-amber">[i]</span> Encrypting locally...
                </motion.div>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 2.1, duration: 0.3 }}
                  className="mt-1 text-text-muted"
                >
                  <span className="text-cipher-phosphor">[+]</span> Upload complete. File ID:
                  <span className="text-cipher-cyan ml-1">cx_7f3k9m2p</span>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 2.4, duration: 0.3 }}
                  className="mt-3 flex items-center"
                >
                  <span className="text-cipher-phosphor">$</span>
                  <span className="ml-2 w-2 h-4 bg-cipher-phosphor animate-pulse" />
                </motion.div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Features Grid */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 1.5 }}
          className="mt-32 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
        >
          {[
            {
              icon: (
                <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              ),
              title: 'End-to-End Encrypted',
              description: 'AES-256-GCM encryption before your files leave your device',
              delay: 0.1
            },
            {
              icon: (
                <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
              ),
              title: 'Zero-Knowledge',
              description: 'We never see your keys or unencrypted data. Mathematically impossible.',
              delay: 0.2
            },
            {
              icon: (
                <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  <polyline points="3.27,6.96 12,12.01 20.73,6.96" />
                  <line x1="12" y1="22.08" x2="12" y2="12" />
                </svg>
              ),
              title: 'Secure Upload',
              description: 'Chunked uploads with integrity verification at every step',
              delay: 0.3
            },
            {
              icon: (
                <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                </svg>
              ),
              title: 'Your Keys Only',
              description: 'Derived from your passphrase using Argon2id. You control access.',
              delay: 0.4
            },
          ].map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 1.5 + feature.delay }}
              className="group relative"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-cipher-phosphor/10 to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="relative p-6 bg-cipher-obsidian border border-cipher-slate/30 rounded-xl hover:border-cipher-phosphor/30 transition-colors duration-300">
                <div className="w-12 h-12 rounded-lg bg-cipher-charcoal border border-cipher-slate/50 flex items-center justify-center text-cipher-phosphor mb-4 group-hover:shadow-glow-sm transition-shadow duration-300">
                  {feature.icon}
                </div>
                <h3 className="font-mono text-sm tracking-wider text-text-primary mb-2">
                  {feature.title.toUpperCase()}
                </h3>
                <p className="text-sm text-text-secondary leading-relaxed">
                  {feature.description}
                </p>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Bottom CTA */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 2 }}
          className="mt-32 text-center"
        >
          <p className="font-mono text-xs tracking-wider text-text-muted mb-8">
            TRUSTED BY SECURITY-CONSCIOUS USERS WORLDWIDE
          </p>
          <div className="flex items-center justify-center gap-8 opacity-40">
            {['AES-256', 'ARGON2ID', 'RSA-OAEP', 'PBKDF2'].map((tech) => (
              <span key={tech} className="font-mono text-xs tracking-widest text-text-secondary">
                {tech}
              </span>
            ))}
          </div>
        </motion.div>

        {/* Footer */}
        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 2.2 }}
          className="mt-24 pt-8 border-t border-cipher-slate/20"
        >
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="font-mono text-xs text-text-muted">
              {new Date().getFullYear()} CRYPTICSTORAGE. ALL RIGHTS RESERVED.
            </p>
            <div className="flex items-center gap-6">
              {['PRIVACY', 'TERMS', 'SECURITY', 'DOCS'].map((link) => (
                <a
                  key={link}
                  href={`/${link.toLowerCase()}`}
                  className="font-mono text-xs text-text-muted hover:text-cipher-phosphor transition-colors"
                >
                  {link}
                </a>
              ))}
            </div>
          </div>
        </motion.footer>
      </div>
    </div>
  );
};

export default HomePage;
