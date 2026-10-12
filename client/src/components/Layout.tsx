import React from 'react';
import { Outlet } from 'react-router-dom';
import { DashboardLayout } from '../layouts/DashboardLayout';

/** Route-outlet wrapper around the dashboard chrome, for nested route setups. */
const Layout: React.FC = () => (
  <DashboardLayout>
    <Outlet />
  </DashboardLayout>
);

export default Layout;
