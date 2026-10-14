import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Fingerprint } from './Fingerprint';

const VALUE = '7f3a91c20b4ed58a3c61e0f79a24b1d8';

describe('Fingerprint', () => {
  it('groups by four in upper case and labels the whole string', () => {
    render(<Fingerprint value={VALUE} />);
    const el = screen.getByLabelText('Key fingerprint 7F3A 91C2 0B4E D58A 3C61 E0F7 9A24 B1D8');
    expect(el.querySelectorAll('span')).toHaveLength(8);
    expect(el).toHaveClass('font-mono');
  });

  it('accepts a value that is already spaced', () => {
    render(<Fingerprint value="7f3a 91c2 0b4e d58a" />);
    expect(screen.getByLabelText('Key fingerprint 7F3A 91C2 0B4E D58A')).toBeInTheDocument();
  });

  it('shows the verified marker only when set', () => {
    const { rerender } = render(<Fingerprint value={VALUE} />);
    expect(screen.queryByText('Verified')).toBeNull();
    rerender(<Fingerprint value={VALUE} verified />);
    expect(screen.getByText('Verified')).toBeInTheDocument();
  });
});
