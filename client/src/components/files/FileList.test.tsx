import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { FileList } from './FileList';

const files = [
  { id: 'f1', name: 'Will.pdf', size: 2048, mimeType: 'application/pdf', uploadedAt: '2026-10-03T10:00:00Z' },
  { id: 'f2', name: 'Bank accounts.txt', size: 900, mimeType: 'text/plain', uploadedAt: '2026-09-28T10:00:00Z' },
];
const folders = [
  { id: 'd1', name: 'Property' },
  { id: 'd2', name: 'Insurance' },
];

describe('FileList', () => {
  it('renders two folders and two files as rows of one list', () => {
    render(<FileList files={files} folders={folders} />);
    const list = screen.getByRole('list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(4);
    for (const name of ['Property', 'Insurance', 'Will.pdf', 'Bank accounts.txt']) expect(screen.getByText(name)).toBeInTheDocument();
  });

  it('lists folders before files', () => {
    render(<FileList files={files} folders={folders} />);
    const names = screen.getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(names[0]).toContain('Insurance');
    expect(names[1]).toContain('Property');
    expect(names[2]).toContain('Will.pdf');
  });

  it('fires the handlers when a row is clicked', () => {
    const onFileClick = vi.fn();
    const onFolderOpen = vi.fn();
    render(<FileList files={files} folders={folders} onFileClick={onFileClick} onFolderOpen={onFolderOpen} />);
    fireEvent.click(screen.getByText('Will.pdf'));
    expect(onFileClick).toHaveBeenCalledWith('f1');
    fireEvent.click(screen.getByText('Property'));
    expect(onFolderOpen).toHaveBeenCalledWith('d1');
  });

  it('filters by the search box, folders included', () => {
    render(<FileList files={files} folders={folders} />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search files' }), { target: { value: 'bank' } });
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('Bank accounts.txt')).toBeInTheDocument();
  });

  it('shows the empty state when there is nothing', () => {
    render(<FileList files={[]} emptyMessage="No files yet." />);
    expect(screen.getByText('No files yet.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('toggles selection through the row checkbox', () => {
    const onToggleSelect = vi.fn();
    render(<FileList files={files} selectedIds={new Set(['f2'])} onToggleSelect={onToggleSelect} />);
    const box = screen.getByRole('checkbox', { name: 'Select Will.pdf' });
    expect(box).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select Bank accounts.txt' })).toBeChecked();
    fireEvent.click(box);
    expect(onToggleSelect).toHaveBeenCalledWith('f1');
  });

  it('draws a shared marker and leaves the handoff slot empty', () => {
    render(<FileList files={[{ ...files[0]!, sharedWith: 2 }, files[1]!]} />);
    expect(screen.getByText('Shared with 2')).toBeInTheDocument();
    expect(screen.queryByText(/handoff/i)).toBeNull();
  });
});
