import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { HandoffRule } from '../../services/api.service';
import { useUIStore } from '../../stores/ui.store';
import { RuleFlows, type FlowIntent } from './RuleFlows';

const rules = vi.hoisted(() => ({
  createRule: vi.fn(),
  revokeRule: vi.fn(),
  witnessSummary: vi.fn(),
}));
vi.mock('../../services/rules.service', async () => ({
  ...(await vi.importActual<typeof import('../../services/rules.service')>('../../services/rules.service')),
  ...rules,
}));
const contacts = vi.hoisted(() => ({ lookupContact: vi.fn(), setContactVerified: vi.fn() }));
vi.mock('../../services/witness.service', () => contacts);

const contact = (email: string, over: Record<string, unknown> = {}) => ({
  id: `u-${email}`,
  email,
  publicKey: `pk-${email}`,
  fingerprint: 'ab'.repeat(32),
  localFingerprint: 'ABCD '.repeat(8).trim(),
  trust: null,
  keyChanged: false,
  verifiedInPerson: false,
  ...over,
});

const estate: FlowIntent = { kind: 'create', item: { target: { folderId: 'folder-1' }, name: 'Estate', detail: 'Folder · 7 files' } };
const witnesses = { threshold: 2, accepted: 3, total: 3, acceptedUserIds: ['w1', 'w2', 'w3'] };

function renderFlow(intent: FlowIntent) {
  const onClose = vi.fn();
  const onChanged = vi.fn();
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <RuleFlows intent={intent} onClose={onClose} onChanged={onChanged} />
    </MemoryRouter>
  );
  return { onClose, onChanged };
}

async function addRecipient(email: string) {
  fireEvent.change(screen.getByLabelText('Add a recipient by email'), { target: { value: email } });
  fireEvent.click(screen.getByRole('button', { name: 'Check key' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Add recipient' }));
  await screen.findByRole('button', { name: `Remove ${email}` });
}

// Headless UI's Dialog observes its panel; jsdom has no ResizeObserver.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

describe('rule flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUIStore.setState({ toasts: [] });
    rules.witnessSummary.mockResolvedValue(witnesses);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-14T12:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('the rule sheet (C3)', () => {
    it('names the item and its size or file count in the head', async () => {
      renderFlow(estate);
      expect(await screen.findByText('Estate')).toBeInTheDocument();
      expect(screen.getByText(/Folder · 7 files/)).toBeInTheDocument();
    });

    it('cannot reach Review without a recipient and a period', async () => {
      contacts.lookupContact.mockResolvedValue(contact('daniel.hale@gmail.com'));
      renderFlow(estate);
      const review = await screen.findByRole('button', { name: 'Review' });
      expect(review).toBeDisabled();

      fireEvent.click(screen.getByRole('button', { name: '1 year' }));
      expect(review).toBeDisabled(); // a period alone is not enough

      await addRecipient('daniel.hale@gmail.com');
      await waitFor(() => expect(review).toBeEnabled());
    });

    it('does not accept a recipient alone either', async () => {
      contacts.lookupContact.mockResolvedValue(contact('daniel.hale@gmail.com'));
      renderFlow(estate);
      await addRecipient('daniel.hale@gmail.com');
      expect(screen.getByRole('button', { name: 'Review' })).toBeDisabled();
    });

    it('takes a custom number of days from 7 to 3650 only', async () => {
      contacts.lookupContact.mockResolvedValue(contact('daniel.hale@gmail.com'));
      renderFlow(estate);
      await addRecipient('daniel.hale@gmail.com');
      fireEvent.click(screen.getByRole('button', { name: 'Custom' }));
      const days = screen.getByLabelText('Days');
      for (const bad of ['3', '3651', '10.5', '']) {
        fireEvent.change(days, { target: { value: bad } });
        expect(screen.getByRole('button', { name: 'Review' })).toBeDisabled();
      }
      fireEvent.change(days, { target: { value: '400' } });
      expect(screen.getByRole('button', { name: 'Review' })).toBeEnabled();
    });

    it('states the quorum path and the reminder dates in the person’s own numbers', async () => {
      renderFlow(estate);
      fireEvent.click(await screen.findByRole('button', { name: '1 year' }));
      // 365 days from 14 Oct 2026 at noon UTC. The 90 % mark falls exactly on a UTC midnight, so the day shown
      // depends on the machine's zone; compute the expectation through the same formatter the sheet uses.
      const { first, second, final } = reminderDates(new Date('2026-10-14T12:00:00.000Z'), 365);
      expect(await screen.findByText(/any 2 of your 3 witnesses agree/)).toBeInTheDocument();
      expect(screen.getByText(`You will get reminders on ${formatDay(first)}, ${formatDay(second)} and ${formatDay(final)}.`, { exact: false })).toBeInTheDocument();
    });

    it('blocks Review and says why when the witnesses are not ready', async () => {
      rules.witnessSummary.mockResolvedValue({ threshold: 2, accepted: 1, total: 2, acceptedUserIds: ['w1'] });
      contacts.lookupContact.mockResolvedValue(contact('daniel.hale@gmail.com'));
      renderFlow(estate);
      await addRecipient('daniel.hale@gmail.com');
      fireEvent.click(screen.getByRole('button', { name: '1 year' }));
      expect(await screen.findByText(/Your witnesses are not ready/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Review' })).toBeDisabled();
    });

    it('warns when a recipient is also an accepted witness', async () => {
      contacts.lookupContact.mockResolvedValue(contact('priya@x.co', { id: 'w1' }));
      renderFlow(estate);
      await addRecipient('priya@x.co');
      expect(await screen.findByText(/also receives Estate/)).toBeInTheDocument();
    });

    it('shows the red callout for a changed key and will not add the person until it is checked', async () => {
      contacts.lookupContact.mockResolvedValue(contact('daniel.hale@gmail.com', { keyChanged: true }));
      contacts.setContactVerified.mockResolvedValue(undefined);
      renderFlow(estate);
      fireEvent.change(await screen.findByLabelText('Add a recipient by email'), { target: { value: 'daniel.hale@gmail.com' } });
      fireEvent.click(screen.getByRole('button', { name: 'Check key' }));
      expect(await screen.findByText('daniel.hale@gmail.com has a new key.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Add recipient' })).toBeDisabled();
      fireEvent.click(screen.getByRole('switch', { name: 'Mark as verified in person' }));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Add recipient' })).toBeEnabled());
      expect(contacts.setContactVerified).toHaveBeenCalledWith('u-daniel.hale@gmail.com', true);
    });
  });

  describe('the confirmation (C3)', () => {
    async function toConfirmation() {
      contacts.lookupContact.mockImplementation(async (email: string) => contact(email));
      const handlers = renderFlow(estate);
      await addRecipient('daniel.hale@gmail.com');
      await addRecipient('sam.hale@proton.me');
      fireEvent.click(screen.getByRole('button', { name: '1 year' }));
      fireEvent.click(screen.getByRole('button', { name: 'Review' }));
      return handlers;
    }

    it('says the verbatim sentence with the real date, the people and the item', async () => {
      await toConfirmation();
      expect(
        await screen.findByRole('heading', {
          name: 'On 14 Oct 2027, or sooner if your witnesses agree, daniel.hale@gmail.com and sam.hale@proton.me will receive Estate.',
        })
      ).toBeInTheDocument();
      expect(screen.getByText('You will be reminded before then. Signing in resets the clock.')).toBeInTheDocument();
    });

    it('sends nothing until Create, then makes the rule, tells the owner and reloads', async () => {
      rules.createRule.mockResolvedValue({});
      const { onChanged, onClose } = await toConfirmation();
      await screen.findByRole('heading', { name: /^On 14 Oct 2027/ });
      expect(rules.createRule).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Create' }));
      await waitFor(() => expect(rules.createRule).toHaveBeenCalledTimes(1));
      expect(rules.createRule).toHaveBeenCalledWith({
        target: { folderId: 'folder-1' },
        recipients: [
          { userId: 'u-daniel.hale@gmail.com', publicKey: 'pk-daniel.hale@gmail.com' },
          { userId: 'u-sam.hale@proton.me', publicKey: 'pk-sam.hale@proton.me' },
        ],
        periodDays: 365,
      });
      await waitFor(() => expect(onChanged).toHaveBeenCalled());
      expect(onClose).toHaveBeenCalled();
      expect(useUIStore.getState().toasts.some((t) => t.type === 'success' && t.message === 'Rule created')).toBe(true);
    });

    it('goes back to the sheet with the choices kept', async () => {
      await toConfirmation();
      fireEvent.click(await screen.findByRole('button', { name: 'Back' }));
      expect(await screen.findByRole('button', { name: 'Remove sam.hale@proton.me' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '1 year' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('stays on the confirmation and says so when the rule cannot be made', async () => {
      rules.createRule.mockRejectedValue(new Error('Your witnesses are not ready.'));
      await toConfirmation();
      fireEvent.click(await screen.findByRole('button', { name: 'Create' }));
      await waitFor(() => expect(useUIStore.getState().toasts.some((t) => t.type === 'error')).toBe(true));
      expect(screen.getByRole('heading', { name: /^On 14 Oct 2027/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled();
    });
  });

  describe('rules on an item (C4)', () => {
    const rule: HandoffRule = {
      id: 'r1',
      folderId: 'folder-1',
      periodDays: 365,
      state: 'active',
      createdAt: '2026-10-03T12:00:00.000Z',
      nextCheckInAt: '2027-10-14T12:00:00.000Z',
      warningAt: '2027-07-14T12:00:00.000Z',
      sharesStale: false,
      coverageGaps: 0,
      recipients: [
        { userId: 'a', email: 'daniel.hale@gmail.com', displayName: null, notifiedAt: null },
        { userId: 'b', email: 'sam.hale@proton.me', displayName: null, notifiedAt: null },
      ],
    };
    const detail: FlowIntent = { kind: 'detail', itemName: 'Estate', rules: [rule], addTo: estate.kind === 'create' ? estate.item : undefined };

    it('lists state, recipients, period, next date, last reset and the witness threshold', async () => {
      renderFlow(detail);
      expect(await screen.findByText('Active')).toBeInTheDocument();
      expect(screen.getByText('daniel.hale@gmail.com and sam.hale@proton.me')).toBeInTheDocument();
      expect(screen.getByText('1 year without a sign-in')).toBeInTheDocument();
      expect(screen.getByText('14 Oct 2027')).toBeInTheDocument();
      expect(screen.getByText('Today, by your sign-in')).toBeInTheDocument();
      expect(await screen.findByText('Any 2 of 3')).toBeInTheDocument();
    });

    it('asks with the verbatim sentence, and Keep the rule goes back without revoking', async () => {
      renderFlow(detail);
      fireEvent.click(await screen.findByRole('button', { name: 'Revoke this rule' }));
      expect(await screen.findByRole('heading', { name: 'daniel.hale@gmail.com and sam.hale@proton.me will no longer receive Estate.' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Keep the rule' }));
      expect(await screen.findByRole('button', { name: 'Revoke this rule' })).toBeInTheDocument();
      expect(rules.revokeRule).not.toHaveBeenCalled();
    });

    it('revokes only on the red button', async () => {
      rules.revokeRule.mockResolvedValue({});
      const { onChanged, onClose } = renderFlow(detail);
      fireEvent.click(await screen.findByRole('button', { name: 'Revoke this rule' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Revoke rule' }));
      await waitFor(() => expect(rules.revokeRule).toHaveBeenCalledWith('r1'));
      await waitFor(() => expect(onChanged).toHaveBeenCalled());
      expect(onClose).toHaveBeenCalled();
    });

    it('offers no revoke for a rule that has already released', async () => {
      renderFlow({ ...detail, rules: [{ ...rule, state: 'released_timer', nextCheckInAt: null, releasedAt: '2026-10-10T00:00:00.000Z' }] } as FlowIntent);
      expect(await screen.findByText('Released by timer')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Revoke this rule' })).toBeNull();
    });

    it('Add another rule opens the sheet for the same item', async () => {
      renderFlow(detail);
      fireEvent.click(await screen.findByRole('button', { name: 'Add another rule' }));
      expect(await screen.findByText(/Folder · 7 files/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Review' })).toBeDisabled();
    });
  });
});
