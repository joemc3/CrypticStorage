import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Input } from './Input';

describe('Input', () => {
  it('links the label to the field', () => {
    render(<Input label="Email" />);
    expect(screen.getByLabelText('Email')).toBeInstanceOf(HTMLInputElement);
  });

  it('keeps an id the caller passes', () => {
    render(<Input label="Email" id="mine" />);
    expect(screen.getByLabelText('Email')).toHaveAttribute('id', 'mine');
  });

  it('links the error line to the field and marks it invalid', () => {
    render(<Input label="Password" error="That did not match." />);
    const field = screen.getByLabelText('Password');
    const line = screen.getByText('That did not match.');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field.getAttribute('aria-describedby')).toBe(line.id);
  });

  it('links the helper line when there is no error', () => {
    render(<Input label="Name" helperText="Visible to people you share with." />);
    const field = screen.getByLabelText('Name');
    expect(field.getAttribute('aria-describedby')).toBe(screen.getByText('Visible to people you share with.').id);
    expect(field).not.toHaveAttribute('aria-invalid');
  });
});
