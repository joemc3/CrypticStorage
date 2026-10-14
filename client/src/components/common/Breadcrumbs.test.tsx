import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Breadcrumbs } from './Breadcrumbs';

describe('Breadcrumbs', () => {
  it('marks the last item as the current page and links the others', () => {
    render(<Breadcrumbs items={[{ label: 'Files', href: '/files' }, { label: 'Estate', href: '/files/1' }, { label: 'Property' }]} />);
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
    expect(screen.getByText('Property')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Files' })).toHaveAttribute('href', '/files');
    expect(screen.queryByRole('link', { name: 'Property' })).toBeNull();
  });

  it('calls onClick instead of following the link', () => {
    const onClick = vi.fn();
    render(<Breadcrumbs items={[{ label: 'Files', href: '/files', onClick }, { label: 'Estate' }]} />);
    fireEvent.click(screen.getByRole('link', { name: 'Files' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
