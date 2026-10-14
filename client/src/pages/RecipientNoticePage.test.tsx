import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ApiService from '../services/api.service';
import RecipientNoticePage from './RecipientNoticePage';

const renderAt = (path: string) =>
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={[path]}>
      <Routes>
        <Route path="/notice/:ruleId" element={<RecipientNoticePage />} />
        <Route path="/dashboard" element={<p>dashboard here</p>} />
      </Routes>
    </MemoryRouter>
  );

describe('RecipientNoticePage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('says the verbatim sentence and line, then Done goes to the dashboard', async () => {
    vi.spyOn(ApiService, 'handoffForMe').mockResolvedValue([
      { id: 'n1', owner: { id: 'o', email: 'tom.becker@icloud.com', displayName: null }, state: 'active', createdAt: '2026-10-12T12:00:00.000Z' },
    ]);
    renderAt('/notice/n1');
    expect(await screen.findByRole('heading', { name: 'tom.becker@icloud.com has set something aside for you.' })).toBeInTheDocument();
    expect(screen.getByText('You will receive it on their terms. There is nothing to do now.')).toBeInTheDocument();
    expect(screen.getByText('If you do not know this person, you can ignore this.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(await screen.findByText('dashboard here')).toBeInTheDocument();
  });

  it('is calm about a notice that is not there', async () => {
    vi.spyOn(ApiService, 'handoffForMe').mockResolvedValue([]);
    renderAt('/notice/missing');
    expect(await screen.findByRole('heading', { name: 'There is no notice here.' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
  });
});
