import { prisma } from '../../config/prisma';

/**
 * Which ready files an active or warning rule covers but has no wrapped key for.
 * Kept free of imports from the files and folders modules, which both call into here.
 */

interface RuleTarget {
  id: string;
  fileId: string | null;
  folderId: string | null;
}

/** parentId by folder id, for every folder the owner has. One query, then everything is in memory. */
async function folderParents(ownerId: string): Promise<Map<string, string | null>> {
  const rows = await prisma.folder.findMany({ where: { userId: ownerId }, select: { id: true, parentId: true } });
  return new Map(rows.map((r) => [r.id, r.parentId]));
}

function subtreeOf(rootId: string, parents: Map<string, string | null>): Set<string> {
  const children = new Map<string, string[]>();
  for (const [id, parent] of parents) {
    if (parent) children.set(parent, [...(children.get(parent) ?? []), id]);
  }
  const out = new Set<string>([rootId]);
  const stack = [rootId];
  while (stack.length) {
    for (const child of children.get(stack.pop()!) ?? []) {
      if (!out.has(child)) {
        out.add(child);
        stack.push(child);
      }
    }
  }
  return out;
}

interface GapFile {
  id: string;
  folderId: string | null;
}

/** Per rule, the ready files under its target that have no item row. One files query per rule. */
async function gapsByRule(ownerId: string, rules: RuleTarget[], parents: Map<string, string | null>): Promise<Map<string, GapFile[]>> {
  const out = new Map<string, GapFile[]>();
  await Promise.all(
    rules.map(async (rule) => {
      const where = rule.fileId ? { id: rule.fileId } : { folderId: { in: [...subtreeOf(rule.folderId!, parents)] } };
      const files = await prisma.file.findMany({
        where: { userId: ownerId, status: 'READY', ...where, handoffItems: { none: { ruleId: rule.id } } },
        select: { id: true, folderId: true },
      });
      out.set(rule.id, files);
    })
  );
  return out;
}

/** Number of uncovered ready files per rule id. */
export async function ruleCoverageGaps(ownerId: string, rules: RuleTarget[]): Promise<Map<string, number>> {
  if (rules.length === 0) return new Map();
  const parents = rules.some((r) => r.folderId) ? await folderParents(ownerId) : new Map<string, string | null>();
  const gaps = await gapsByRule(ownerId, rules, parents);
  return new Map([...gaps].map(([id, files]) => [id, files.length]));
}

export interface FolderCoverage {
  coverageGaps: number;
  ruleIds: string[];
}

/**
 * For each folder: the active or warning rules on it or any ancestor, and how many distinct ready files under it
 * are missing from at least one of those rules. Cost is one folder query, one rule query and one files query per
 * folder rule, regardless of how many folders are asked about.
 */
export async function folderCoverage(ownerId: string, folderIds: string[]): Promise<Map<string, FolderCoverage>> {
  const out = new Map<string, FolderCoverage>(folderIds.map((id) => [id, { coverageGaps: 0, ruleIds: [] }]));
  if (folderIds.length === 0) return out;
  const rules = await prisma.handoffRule.findMany({
    where: { ownerId, state: { in: ['active', 'warning'] }, folderId: { not: null } },
    select: { id: true, fileId: true, folderId: true },
    orderBy: { createdAt: 'asc' },
  });
  if (rules.length === 0) return out;

  const parents = await folderParents(ownerId);
  const gaps = await gapsByRule(ownerId, rules, parents);
  const covered = new Map(rules.map((r) => [r.id, subtreeOf(r.folderId!, parents)]));

  for (const folderId of folderIds) {
    const below = subtreeOf(folderId, parents);
    const entry = out.get(folderId)!;
    const missing = new Set<string>();
    for (const rule of rules) {
      // A rule applies to this folder when the folder is the rule's folder or lies inside it.
      if (!covered.get(rule.id)!.has(folderId)) continue;
      entry.ruleIds.push(rule.id);
      for (const file of gaps.get(rule.id) ?? []) {
        if (file.folderId && below.has(file.folderId)) missing.add(file.id);
      }
    }
    entry.coverageGaps = missing.size;
  }
  return out;
}
