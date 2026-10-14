import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders title, body and action', () => {
    render(<EmptyState title="Nothing in this folder yet." body="Drop files here." action={<button type="button">Upload</button>} />);
    expect(screen.getByText('Nothing in this folder yet.')).toBeInTheDocument();
    expect(screen.getByText('Drop files here.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload' })).toBeInTheDocument();
  });

  it('works with a title alone', () => {
    render(<EmptyState title="No files yet." />);
    expect(screen.getByText('No files yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
