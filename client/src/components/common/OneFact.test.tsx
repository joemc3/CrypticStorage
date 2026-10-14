import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OneFact } from './OneFact';

const base = { fact: 'There is no password reset.', action: { label: 'I understand', onClick: () => {} } };

describe('OneFact', () => {
  it('renders the fact in the serif class', () => {
    render(<OneFact {...base} />);
    const h = screen.getByRole('heading', { name: base.fact });
    expect(h).toHaveClass('font-serif');
  });

  it('disables the action when disabled', () => {
    render(<OneFact {...base} action={{ ...base.action, disabled: true }} />);
    expect(screen.getByRole('button', { name: 'I understand' })).toBeDisabled();
  });

  it('calls onClick, back and cancel', () => {
    const onClick = vi.fn(), back = vi.fn(), cancel = vi.fn();
    render(<OneFact {...base} action={{ label: 'Go', onClick }} back={back} cancel={cancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(back).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('omits Back and Cancel when not given', () => {
    render(<OneFact {...base} />);
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });

  it('renders supporting text and children before the action', () => {
    render(<OneFact {...base} supporting="Nobody can help." ><input aria-label="phrase" /></OneFact>);
    expect(screen.getByText('Nobody can help.')).toBeInTheDocument();
    expect(screen.getByLabelText('phrase')).toBeInTheDocument();
  });
});
