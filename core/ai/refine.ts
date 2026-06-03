/**
 * Cluster refinement passes that run AFTER the LLM returns a draft.
 *
 * The order applied in semanticGroup() is:
 *  1. LLM produces draft clusters.
 *  2. (optional) Self-critique pass — LLM gets its own draft back and is
 *     instructed to eject incoherent tabs / split mixed clusters.
 *  3. Embedding-based cohesion check — ejects tabs whose vector sits too far
 *     from their cluster's centroid.
 *  4. Domain-affinity merge + outlier ejection happen later in router.ts.
 *
 * Each refinement returns a NEW clusters array — never mutates the input.
 */

import { centroid, cosineSimilarity, embed as defaultEmbed } from './embeddings';
import type { ClusterCandidate, SemanticCluster } from './protocol';

export type EmbedFn = (texts: string[]) => Promise<Float32Array[]>;

/**
 * Eject tabs whose embedding sits more than `threshold` cosine-distance
 * from the cluster's centroid. Returns new clusters and the set of ejected
 * tab ids (for caller to route through rule-based fallback).
 *
 * Default threshold of 0.4 was picked empirically — MiniLM L6 produces
 * pretty tight cosine similarities within a topic (typically > 0.55) and
 * sub-0.4 sits in the "different topic" zone.
 */
export async function embeddingEjection(
  clusters: SemanticCluster[],
  tabs: ClusterCandidate[],
  threshold = 0.4,
  embedFn: EmbedFn = defaultEmbed,
): Promise<{ clusters: SemanticCluster[]; ejected: number[] }> {
  if (clusters.length === 0) return { clusters, ejected: [] };

  const byId = new Map(tabs.map((t) => [t.id, t]));
  const allTabIds: number[] = [];
  for (const c of clusters) for (const id of c.tabIds) allTabIds.push(id);

  const texts = allTabIds.map((id) => {
    const t = byId.get(id);
    return t ? `${t.title} — ${t.url}` : '';
  });
  const vecs = await embedFn(texts);
  const vecById = new Map<number, Float32Array>();
  for (let i = 0; i < allTabIds.length; i++) vecById.set(allTabIds[i]!, vecs[i]!);

  const ejected: number[] = [];
  const refined: SemanticCluster[] = [];

  for (const c of clusters) {
    if (c.tabIds.length < 2) {
      refined.push(c);
      continue;
    }
    const clusterVecs = c.tabIds.map((id) => vecById.get(id)).filter((v): v is Float32Array => !!v);
    const cent = centroid(clusterVecs);
    if (!cent) {
      refined.push(c);
      continue;
    }
    const kept: number[] = [];
    for (const id of c.tabIds) {
      const v = vecById.get(id);
      if (!v) {
        kept.push(id);
        continue;
      }
      const sim = cosineSimilarity(v, cent);
      if (sim >= threshold) kept.push(id);
      else ejected.push(id);
    }
    if (kept.length >= 2) refined.push({ ...c, tabIds: kept });
    else for (const id of kept) ejected.push(id);
  }

  return { clusters: refined, ejected };
}

/**
 * Build the self-critique prompt: feed the draft back and ask the model
 * to refine. Pure helper so the prompt assembly is unit-testable.
 */
export function buildCritiquePrompt(
  draft: SemanticCluster[],
  tabs: ClusterCandidate[],
): string {
  const draftJson = JSON.stringify({ clusters: draft }, null, 2);
  const tabLines = tabs
    .map((t) => `${t.id}\t${truncate(t.title, 80)}\t${truncate(t.url, 120)}`)
    .join('\n');
  return `You produced this draft clustering:

${draftJson}

The tabs being grouped:
${tabLines}

Refine the draft. Strict rules:
- Eject any tab that doesn't clearly fit its cluster's topic. It is BETTER to omit a tab than to keep a mis-fit.
- Split a cluster if it actually contains two distinct topics.
- Merge clusters only if they are truly the same topic.
- Each surviving cluster must remain a single coherent topic.
- If you reject a cluster entirely, drop it.
- Return the same schema: {"clusters": [{label, emoji, tabIds, confidence}, ...]}`;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}
