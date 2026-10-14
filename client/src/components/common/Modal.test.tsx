import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Modal } from './Modal';

describe('Modal', () => {
  it('renders its title and children when open', () => {
    render(
      <Modal isOpen onClose={() => undefined} title="Rename">
        <p>Body text</p>
      </Modal>
    );
    expect(screen.getByRole('dialog', { name: 'Rename' })).toBeInTheDocument();
    expect(screen.getByText('Body text')).toBeInTheDocument();
  });

  it('renders nothing when closed', () => {
    render(
      <Modal isOpen={false} onClose={() => undefined} title="Rename">
        <p>Body text</p>
      </Modal>
    );
    expect(screen.queryByText('Rename')).not.toBeInTheDocument();
    expect(screen.queryByText('Body text')).not.toBeInTheDocument();
  });
});
