/**
 * CrypticStorage - Dashboard Page
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '../hooks/useToast';
import { REPAIR_FAILED_DESCRIPTION, REPAIR_FAILED_MESSAGE } from '../components/handoff/RepairAtUnlock';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { StorageChart } from '../components/dashboard/StorageChart';
import { RecentFiles } from '../components/dashboard/RecentFiles';
import { QuickStats, type StatCard } from '../components/dashboard/QuickStats';
import { ForYouSection, RulesSection, WitnessesEntry } from '../components/handoff/DashboardSections';
import { RuleFlows, type FlowIntent } from '../components/handoff/RuleFlows';
import { formatDay, stateLabel } from '../components/handoff/format';
import { useAuth } from '../hooks/useAuth';
import { useFiles } from '../hooks/useFiles';
import ApiService, { type HandoffForMe, type HandoffRule, type StorageStats } from '../services/api.service';
import { forMe, isOpen, listRules, nameRuleTargets, repairAtUnlock, repairRunning, witnessSummary, type WitnessSummary } from '../services/rules.service';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, refreshProfile } = useAuth();
  const { files, isLoading, loadFiles, sharedWithMe, loadSharedWithMe, downloadFile } = useFiles();
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [rules, setRules] = useState<HandoffRule[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [forYou, setForYou] = useState<HandoffForMe[]>([]);
  const [witnesses, setWitnesses] = useState<WitnessSummary | null>(null);
  const [flow, setFlow] = useState<FlowIntent | null>(null);
  const toast = useToast();
  const retried = useRef(false);

  const loadHandoff = useCallback(async () => {
    // Each part fails alone: a missing list leaves its section empty, never the whole page.
    const [mine, theirs, summary] = await Promise.all([
      listRules().catch(() => [] as HandoffRule[]),
      forMe().catch(() => [] as HandoffForMe[]),
      witnessSummary().catch(() => null),
    ]);
    const shown = mine.filter((r) => r.state !== 'revoked');
    setRules(shown);
    setForYou(theirs);
    setWitnesses(summary);
    setNames(await nameRuleTargets(shown));

    // The repair at unlock may have failed (offline, a witness not yet accepted). Try again once per visit.
    if (!retried.current && !repairRunning() && shown.some((r) => isOpen(r) && (r.sharesStale || r.coverageGaps > 0))) {
      retried.current = true;
      repairAtUnlock()
        .then((result) => {
          if (result.failed > 0) toast.error(REPAIR_FAILED_MESSAGE, REPAIR_FAILED_DESCRIPTION);
          else if (result.repaired > 0) void loadHandoff();
        })
        .catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadFiles(null);
    void loadSharedWithMe();
    void loadHandoff();
    refreshProfile().catch(() => undefined);
    ApiService.getStorageStats()
      .then(setStats)
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const used = stats?.used ?? user?.storageUsed ?? 0;
  const limit = stats?.limit ?? user?.storageLimit ?? 1;
  const folderCount = stats?.folderCount ?? 0;
  const open = rules.filter(isOpen);
  const earliest = open.map((r) => r.nextCheckInAt).filter((d): d is string => !!d).sort()[0];
  const cards: StatCard[] = [
    {
      id: 'items',
      label: 'Items',
      value: ((stats?.fileCount ?? files.length) + folderCount).toLocaleString(),
      detail: `in ${folderCount.toLocaleString()} ${folderCount === 1 ? 'folder' : 'folders'}`,
    },
    { id: 'shared', label: 'Shared with me', value: sharedWithMe.length.toLocaleString() },
    {
      id: 'rules',
      label: 'Handoff rules',
      value: open.length.toLocaleString(),
      detail: earliest ? `active · earliest release ${formatDay(earliest)}` : 'active',
    },
  ];

  const recent = [...files]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6)
    .map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, size: f.size, uploadedAt: f.createdAt }));

  const openRule = (rule: HandoffRule) => {
    const name = names.get(rule.id) ?? 'This item';
    const target = rule.folderId ? { folderId: rule.folderId } : { fileId: rule.fileId! };
    setFlow({
      kind: 'detail',
      itemName: name,
      detail: `${stateLabel[rule.state]} · ${rule.folderId ? 'Folder' : 'File'}`,
      rules: [rule],
      addTo: { target, name, detail: rule.folderId ? 'Folder' : 'File' },
    });
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        <h1 className="font-sans text-2xl font-semibold leading-[30px] tracking-[-0.01em] text-ink md:text-[28px] md:leading-[34px]">Your safe</h1>

        <QuickStats stats={cards} isLoading={isLoading && !stats}>
          <StorageChart data={{ used, total: limit }} />
        </QuickStats>

        <ForYouSection rules={forYou} />
        <RulesSection rules={rules} names={names} onOpen={openRule} />
        {witnesses && <WitnessesEntry summary={witnesses} />}

        <RecentFiles files={recent} isLoading={isLoading && files.length === 0} onFileClick={(id) => void downloadFile(id)} onViewAll={() => navigate('/files')} />
      </div>
      <RuleFlows intent={flow} onClose={() => setFlow(null)} onChanged={() => void loadHandoff()} />
    </DashboardLayout>
  );
};

export default DashboardPage;
