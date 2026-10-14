/**
 * CrypticStorage - Auth Layout
 * The public frame at form width: sign in, register, locked screen.
 */

import React from 'react';
import { PublicFrame } from './PublicFrame';

export interface AuthLayoutProps {
  children: React.ReactNode;
  /** The one quiet action at top right, for example a link to create an account. */
  action?: React.ReactNode;
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({ children, action }) => (
  <PublicFrame width="form" action={action}>
    <div className="pt-6 md:pt-0">{children}</div>
  </PublicFrame>
);
