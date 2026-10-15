/**
 * CrypticStorage - Recipient notice (/notice/:ruleId), design C5.
 * The recipient's side of a rule: someone has set something aside, and there is nothing to do yet.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { OneFact } from '../components/common/OneFact';
import { Spinner } from '../components/common/Spinner';
import { personName } from '../components/handoff/format';
import type { HandoffForMe } from '../services/api.service';
import { forMe } from '../services/rules.service';

export const RecipientNoticePage: React.FC = () => {
  const { ruleId = '' } = useParams<{ ruleId: string }>();
  const navigate = useNavigate();
  const [rule, setRule] = useState<HandoffForMe | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    forMe()
      .then((rules) => live && setRule(rules.find((r) => r.id === ruleId) ?? null))
      .catch(() => live && setRule(null));
    return () => {
      live = false;
    };
  }, [ruleId]);

  if (rule === undefined) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg">
        <Spinner size="lg" color="text-accent" label="Loading…" />
      </main>
    );
  }

  const done = { label: 'Done', onClick: () => navigate('/dashboard') };

  if (rule === null) {
    return <OneFact fact="There is no notice here." supporting="It may have been withdrawn. Nothing is needed from you." action={done} />;
  }

  return (
    <OneFact
      fact={`${personName(rule.owner)} has set something aside for you.`}
      supporting="You will receive it on their terms. There is nothing to do now."
      action={done}
    >
      <p className="text-sm text-ink-3">If you do not know this person, you can ignore this.</p>
    </OneFact>
  );
};

export default RecipientNoticePage;
