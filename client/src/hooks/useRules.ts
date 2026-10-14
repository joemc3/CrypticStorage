import { useCallback, useEffect, useMemo, useState } from 'react';
import type { HandoffRule } from '../services/api.service';
import { listRules } from '../services/rules.service';

/** The owner's rules that are not revoked, indexed by what they name. A load failure just means no markers. */
export function useRules() {
  const [rules, setRules] = useState<HandoffRule[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      setRules((await listRules()).filter((r) => r.state !== 'revoked'));
    } catch {
      setRules([]);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const index = useMemo(() => {
    const byFile = new Map<string, HandoffRule[]>();
    const byFolder = new Map<string, HandoffRule[]>();
    for (const rule of rules) {
      const [map, id] = rule.fileId ? ([byFile, rule.fileId] as const) : ([byFolder, rule.folderId] as const);
      if (!id) continue;
      map.set(id, [...(map.get(id) ?? []), rule]);
    }
    return { byFile, byFolder };
  }, [rules]);

  return { rules, loaded, reload, ...index };
}
