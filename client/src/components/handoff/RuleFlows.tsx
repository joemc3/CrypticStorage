import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { OneFact } from '../common/OneFact';
import { RuleSheet, type RuleDraft } from './RuleSheet';
import { RuleDetail } from './RuleDetail';
import type { HandoffRule } from '../../services/api.service';
import { toApiError } from '../../services/api.service';
import { createRule, revokeRule, witnessSummary, type RuleTarget, type WitnessSummary } from '../../services/rules.service';
import { useToast } from '../../hooks/useToast';
import { addDays, formatDay, joinNames, periodLabel, personName, recipientNames } from './format';

export interface FlowItem {
  target: RuleTarget;
  name: string;
  /** "Folder · 7 files" or "1.2 MB". */
  detail: string;
}

export type FlowIntent =
  | { kind: 'create'; item: FlowItem }
  | { kind: 'detail'; itemName: string; detail?: string; rules: HandoffRule[]; addTo?: FlowItem };

export interface RuleFlowsProps {
  intent: FlowIntent | null;
  onClose: () => void;
  /** A rule was created or revoked: reload whatever shows rules. */
  onChanged: () => void;
}

type Stage = 'sheet' | 'confirm' | 'detail' | 'revoke';

/** Full screen over the app chrome, because an irreversible act gets nothing but its sentence (decision 4). */
const FullScreen: React.FC<{ children: React.ReactNode }> = ({ children }) =>
  createPortal(<div className="fixed inset-0 z-[70] overflow-y-auto bg-bg">{children}</div>, document.body);

/** The create sheet, its confirmation, the rule detail and the revoke confirmation, as one flow. */
export const RuleFlows: React.FC<RuleFlowsProps> = ({ intent, onClose, onChanged }) =>
  // Closing sets the intent to null, so every opening mounts a fresh flow with nothing carried over.
  intent ? <Flow intent={intent} onClose={onClose} onChanged={onChanged} /> : null;

const Flow: React.FC<{ intent: FlowIntent; onClose: () => void; onChanged: () => void }> = ({ intent, onClose, onChanged }) => {
  const toast = useToast();
  const [stage, setStage] = useState<Stage>(intent.kind === 'create' ? 'sheet' : 'detail');
  const [item, setItem] = useState<FlowItem | null>(intent.kind === 'create' ? intent.item : (intent.addTo ?? null));
  const [draft, setDraft] = useState<(RuleDraft & { periodDays: number }) | null>(null);
  const [revoking, setRevoking] = useState<HandoffRule | null>(null);
  const [busy, setBusy] = useState(false);
  const [witnesses, setWitnesses] = useState<WitnessSummary | null>(null);

  useEffect(() => {
    let live = true;
    witnessSummary()
      .then((w) => live && setWitnesses(w))
      // If the set cannot be read, say it is not ready rather than leave the sheet waiting.
      .catch(() => live && setWitnesses({ threshold: 2, accepted: 0, total: 0, acceptedUserIds: [] }));
    return () => {
      live = false;
    };
  }, []);

  const create = async () => {
    if (!item || !draft) return;
    setBusy(true);
    try {
      await createRule({ target: item.target, recipients: draft.recipients.map((r) => ({ userId: r.userId, publicKey: r.publicKey })), periodDays: draft.periodDays });
      toast.success('Rule created', `${joinNames(draft.recipients.map(personName))} will receive ${item.name} on your terms.`);
      onChanged();
      onClose();
    } catch (error) {
      toast.error('Could not create the rule', error instanceof Error ? error.message : toApiError(error).message);
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (!revoking) return;
    setBusy(true);
    try {
      await revokeRule(revoking.id);
      toast.success('Rule revoked');
      onChanged();
      onClose();
    } catch (error) {
      toast.error('Could not revoke the rule', error instanceof Error ? error.message : toApiError(error).message);
      setBusy(false);
    }
  };

  if (stage === 'confirm' && item && draft) {
    const names = joinNames(draft.recipients.map(personName));
    return (
      <FullScreen>
        <OneFact
          eyebrow={`Handoff rule · ${item.name} · ${periodLabel(draft.periodDays)}`}
          fact={`On ${formatDay(addDays(new Date(), draft.periodDays))}, or sooner if your witnesses agree, ${names} will receive ${item.name}.`}
          supporting="You will be reminded before then. Signing in resets the clock."
          action={{ label: 'Create', onClick: () => void create(), disabled: busy }}
          back={() => setStage('sheet')}
          backDisabled={busy}
          cancel={onClose}
        />
      </FullScreen>
    );
  }

  if (stage === 'revoke' && revoking) {
    const itemName = intent.kind === 'detail' ? intent.itemName : (item?.name ?? '');
    return (
      <FullScreen>
        <OneFact
          eyebrow={`Revoke handoff rule · ${itemName}`}
          fact={`${recipientNames(revoking)} will no longer receive ${itemName}.`}
          supporting="Your own copies are untouched. You can make a new rule at any time."
          action={{ label: 'Revoke rule', onClick: () => void revoke(), disabled: busy, danger: true }}
          back={() => setStage('detail')}
          backLabel="Keep the rule"
          backDisabled={busy}
          cancel={onClose}
        />
      </FullScreen>
    );
  }

  if (stage === 'detail' && intent.kind === 'detail') {
    const addTo = intent.addTo;
    return (
      <RuleDetail
        isOpen
        onClose={onClose}
        itemName={intent.itemName}
        detail={intent.detail}
        rules={intent.rules}
        witnesses={witnesses}
        onRevoke={(rule) => {
          setRevoking(rule);
          setStage('revoke');
        }}
        onAddAnother={addTo ? () => { setItem(addTo); setStage('sheet'); } : undefined}
      />
    );
  }

  return (
    <RuleSheet
      // Back from the confirmation remounts the sheet with what was chosen.
      key={draft ? 'again' : 'first'}
      isOpen
      onClose={onClose}
      item={{ name: item!.name, detail: item!.detail }}
      witnesses={witnesses}
      initial={draft ?? undefined}
      onReview={(next) => {
        setDraft(next);
        setStage('confirm');
      }}
    />
  );
};
