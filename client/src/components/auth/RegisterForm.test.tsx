import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RegisterForm } from './RegisterForm';

const PHRASE = 'I understand there is no way back';

const setup = (props: Partial<React.ComponentProps<typeof RegisterForm>> = {}) => {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onResend = vi.fn();
  const onCancel = vi.fn();
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <RegisterForm onSubmit={onSubmit} onResend={onResend} onCancel={onCancel} {...props} />
    </MemoryRouter>
  );
  return { onSubmit, onResend, onCancel };
};

const toStep4 = () => {
  for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: 'I understand' }));
};

describe('RegisterForm wizard', () => {
  it('starts with the first fact, verbatim', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'There is no password reset.' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'If you forget your password, nothing and nobody can get your items back. Not us, not support, not a recovery key.'
      )
    ).toBeInTheDocument();
  });

  it('walks through the three facts to the confirmation', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'I understand' }));
    expect(screen.getByRole('heading', { name: 'Your email address cannot be changed later.' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'I understand' }));
    expect(screen.getByRole('heading', { name: 'Your witnesses can release your items without you.' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'I understand' }));
    expect(
      screen.getByRole('heading', { name: 'Type "I understand there is no way back" to continue.' })
    ).toBeInTheDocument();
  });

  it('"Not now" on step 1 cancels, Back returns one step', () => {
    const { onCancel } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'I understand' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { name: 'There is no password reset.' })).toBeInTheDocument();
  });

  it('keeps Continue disabled until the exact phrase is typed', () => {
    setup();
    toStep4();
    const field = screen.getByLabelText('Confirmation phrase');
    const cont = screen.getByRole('button', { name: 'Continue' });
    expect(cont).toBeDisabled();
    fireEvent.change(field, { target: { value: 'i understand there is no way back' } });
    expect(cont).toBeDisabled();
    fireEvent.change(field, { target: { value: 'I understand there is no way' } });
    expect(cont).toBeDisabled();
    fireEvent.change(field, { target: { value: PHRASE } });
    expect(cont).toBeEnabled();
  });

  it('shows the form only after the phrase is accepted, and submits it', () => {
    const { onSubmit } = setup();
    expect(screen.queryByLabelText('Email')).toBeNull();
    toStep4();
    expect(screen.queryByLabelText('Email')).toBeNull();
    fireEvent.change(screen.getByLabelText('Confirmation phrase'), { target: { value: PHRASE } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } });
    fireEvent.change(screen.getByLabelText(/Display name/), { target: { value: 'Ada' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'lantern-orchard-basalt-71' } });
    fireEvent.change(screen.getByLabelText('Password again'), { target: { value: 'lantern-orchard-basalt-71' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(onSubmit).toHaveBeenCalledWith({
      email: 'a@b.co',
      password: 'lantern-orchard-basalt-71',
      displayName: 'Ada',
      phrase: PHRASE,
    });
  });

  it('does not submit when the passwords differ', () => {
    const { onSubmit } = setup();
    toStep4();
    fireEvent.change(screen.getByLabelText('Confirmation phrase'), { target: { value: PHRASE } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'lantern-orchard-basalt-71' } });
    fireEvent.change(screen.getByLabelText('Password again'), { target: { value: 'something-else-entirely' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('The two passwords differ.')).toBeInTheDocument();
  });

  it('shows check-your-email with a resend action once sentTo is set', () => {
    const { onResend } = setup({ sentTo: 'm.hale@fastmail.com' });
    expect(screen.getByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(screen.getByText('m.hale@fastmail.com')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Resend the email' }));
    expect(onResend).toHaveBeenCalledTimes(1);
  });

  it('disables resend while one is in flight and confirms once it went out', () => {
    setup({ sentTo: 'm.hale@fastmail.com', isLoading: true });
    expect(screen.getByRole('button', { name: 'Resend the email' })).toBeDisabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('says "Sent." after a resend', () => {
    setup({ sentTo: 'm.hale@fastmail.com', resent: true });
    expect(screen.getByRole('status')).toHaveTextContent('Sent.');
  });
});
