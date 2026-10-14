import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HomePage from './HomePage';

describe('HomePage', () => {
  it('states the five promises and offers sign in and create account', () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <HomePage />
      </MemoryRouter>
    );
    for (const line of [
      'The server holds nothing it can read.',
      'Sharing needs no second secret.',
      'Links exist, and know their place.',
      'Anything can be handed on.',
      'There is no recovery.',
    ]) {
      expect(screen.getByText(line)).toBeInTheDocument();
    }
    expect(screen.getByRole('heading', { name: 'A safe, not a drive.' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create account' })).toHaveAttribute('href', '/register');
    expect(screen.getAllByRole('link', { name: 'Sign in' }).length).toBeGreaterThan(0);
  });
});
