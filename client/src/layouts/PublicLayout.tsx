/**
 * CrypticStorage - Public Layout
 * The public frame at page width: landing, shared links, not found.
 */

import React from 'react';
import { PublicFrame } from './PublicFrame';

export interface PublicLayoutProps {
  children: React.ReactNode;
  action?: React.ReactNode;
  /** Use the 400 px form column instead of 560 px. */
  narrow?: boolean;
}

export const PublicLayout: React.FC<PublicLayoutProps> = ({ children, action, narrow = false }) => (
  <PublicFrame width={narrow ? 'form' : 'page'} action={action}>
    {children}
  </PublicFrame>
);
