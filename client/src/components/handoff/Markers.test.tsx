import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { HandoffRule } from '../../services/api.service';
import { FileList } from '../files/FileList';
import { FolderRuleBanner, FromHandoffMarker, HandoffMarker, ShareMarker } from './Markers';

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const rule = (over: Partial<HandoffRule> = {}): HandoffRule => ({
  id: 'r1', folderId: 'f1', periodDays: 365, state: 'active', createdAt: '2026-10-03T12:00:00.000Z', nextCheckInAt: '2027-10-14T12:00:00.000Z', warningAt: null,
  sharesStale: false, coverageGaps: 0, recipients: [{ userId: 'a', email: 'daniel.hale@gmail.com', displayName: 'Daniel', notifiedAt: null }], ...over,
});

describe('folder banner', () => {
  it('says who gets the folder, when, and the state, with a way to the rule', () => {
    const onView = vi.fn();
    render(<FolderRuleBanner rules={[rule()]} onView={onView} />);
    expect(screen.getByText('Handed off to Daniel on 14 Oct 2027 · Active')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View rule' }));
    expect(onView).toHaveBeenCalled();
  });

  it('draws nothing without rules', () => {
    const { container } = render(<FolderRuleBanner rules={[]} onView={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('row markers and actions', () => {
  it('words the handoff marker by state', () => {
    const { rerender } = render(<HandoffMarker rules={[rule()]} />);
    expect(screen.getByText('Handoff')).toBeInTheDocument();
    rerender(<HandoffMarker rules={[rule({ state: 'warning' })]} />);
    expect(screen.getByText('Handoff · due soon')).toBeInTheDocument();
  });

  it('puts the marker on the covered folder row and shows Shared on a shared file, and no marker on children', () => {
    render(
      <FileList
        folders={[{ id: 'f1', name: 'Estate', marker: <HandoffMarker rules={[rule()]} /> }, { id: 'f2', name: 'Receipts' }]}
        files={[{ id: 'a', name: 'deed.pdf', size: 10, mimeType: 'application/pdf', uploadedAt: '2026-10-01T00:00:00.000Z', shareMarker: <ShareMarker /> }]}
      />
    );
    expect(screen.getAllByText('Handoff')).toHaveLength(1);
    expect(screen.getByText('Shared')).toBeInTheDocument();
  });

  it('offers Hand off… on every file and folder, and Rules only where a rule exists', () => {
    const onFile = vi.fn();
    const onFolder = vi.fn();
    const onRules = vi.fn();
    render(
      <FileList
        folders={[{ id: 'f1', name: 'Estate', onRules }, { id: 'f2', name: 'Receipts' }]}
        files={[{ id: 'a', name: 'deed.pdf', size: 10, mimeType: 'application/pdf', uploadedAt: '2026-10-01T00:00:00.000Z' }]}
        onFileHandoff={onFile}
        onFolderHandoff={onFolder}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Actions for deed.pdf' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Hand off…' }));
    expect(onFile).toHaveBeenCalledWith('a');

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Estate' }));
    expect(screen.getByRole('menuitem', { name: 'Rules' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rules' }));
    expect(onRules).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Receipts' }));
    fireEvent.click(screen.getAllByRole('menuitem', { name: 'Hand off…' })[0]);
    expect(onFolder).toHaveBeenCalledWith('f2');
  });
});

describe('from-handoff marker', () => {
  it('names the witnesses after a quorum release and leaves the timer wording alone', () => {
    const { rerender } = render(<FromHandoffMarker from="Tom" />);
    expect(screen.getByText('Handed off by Tom')).toBeInTheDocument();
    rerender(<FromHandoffMarker from="Tom" witnesses={2} />);
    expect(screen.getByText('Handed off by Tom · released by 2 witnesses')).toBeInTheDocument();
  });
});
