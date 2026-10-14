/**
 * CrypticStorage - Dashboard Layout
 * Phone: 60 px top bar and a four-tab bar. Desktop (720 px up): 240 px sidebar with the lock state.
 */

import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { HomeIcon, FolderIcon, ShareIcon, Cog6ToothIcon, LockClosedIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../hooks/useAuth';
import { useIdleLock } from '../hooks/useIdleLock';
import { Brand } from './PublicFrame';

export interface DashboardLayoutProps {
  children: React.ReactNode;
}

const navigation = [
  { name: 'Home', href: '/dashboard', icon: HomeIcon },
  { name: 'Files', href: '/files', icon: FolderIcon },
  { name: 'Shared', href: '/shared', icon: ShareIcon },
  { name: 'Settings', href: '/settings', icon: Cog6ToothIcon },
];

const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logoutUser, lock } = useAuth();
  useIdleLock();
  const lockMinutes = user?.lockAfterMinutes ?? 5;
  const account = user?.displayName || user?.email || '';

  const isActive = (href: string) => location.pathname === href || (href === '/files' && location.pathname.startsWith('/files/'));

  const handleLogout = async () => {
    await logoutUser();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-bg text-ink">
      {/* Phone top bar */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-[60px] items-center justify-between border-b border-line bg-surface pl-4 pr-2 md:hidden">
        <Brand to="/dashboard" />
        <button type="button" onClick={lock} aria-label="Lock now" className={`flex h-11 w-11 items-center justify-center rounded-lg text-ink-2 hover:text-ink ${focus}`}>
          <LockClosedIcon className="h-5 w-5" />
        </button>
      </header>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface md:flex">
        <div className="px-5 pb-4 pt-5">
          <Brand to="/dashboard" />
        </div>
        <nav aria-label="Main" className="flex-1 space-y-1 px-3">
          {navigation.map((item) => (
            <Link
              key={item.name}
              to={item.href}
              aria-current={isActive(item.href) ? 'page' : undefined}
              className={`flex h-11 items-center gap-3 rounded-lg px-3 font-sans text-[15px] font-medium ${
                isActive(item.href) ? 'bg-accent-soft text-accent-text' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
              } ${focus}`}
            >
              <item.icon className="h-5 w-5" aria-hidden="true" />
              {item.name}
            </Link>
          ))}
        </nav>
        <div className="space-y-3 border-t border-line px-5 py-4">
          <div className="flex items-center justify-between gap-2 font-sans text-[13px] leading-[18px] text-ink-3">
            <span>Unlocked · locks after {lockMinutes} min idle</span>
          </div>
          <button type="button" onClick={lock} className={`h-9 w-full rounded-lg border border-line-strong bg-surface font-sans text-sm font-semibold text-ink hover:bg-surface-2 ${focus}`}>
            Lock now
          </button>
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate font-sans text-[13px] text-ink-2" title={account}>
              {account}
            </p>
            <button type="button" onClick={() => void handleLogout()} className={`flex-none rounded px-1 font-sans text-[13px] font-medium text-ink-3 hover:text-ink ${focus}`}>
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Content */}
      <div className="md:pl-60">
        <main className="px-4 pb-24 pt-[76px] md:px-14 md:pb-14 md:pt-14">
          <motion.div key={location.pathname} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }} className="mx-auto w-full max-w-[1000px]">
            {children}
          </motion.div>
        </main>
      </div>

      {/* Phone tab bar */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-surface md:hidden">
        {navigation.map((item) => (
          <Link
            key={item.name}
            to={item.href}
            aria-current={isActive(item.href) ? 'page' : undefined}
            className={`flex h-14 flex-col items-center justify-center gap-0.5 font-sans text-xs font-medium ${isActive(item.href) ? 'text-accent-text' : 'text-ink-3'} ${focus}`}
          >
            <item.icon className="h-5 w-5" aria-hidden="true" />
            {item.name}
          </Link>
        ))}
      </nav>
    </div>
  );
};
