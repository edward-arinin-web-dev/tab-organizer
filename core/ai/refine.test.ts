import { describe, expect, it } from 'vitest';
import { buildCritiquePrompt, embeddingEjection, type EmbedFn } from './refine';
import type { ClusterCandidate, SemanticCluster } from './protocol';

describe('buildCritiquePrompt', () => {
  it('includes the draft JSON and the tab table', () => {
    const draft: SemanticCluster[] = [
      { label: 'Test', emoji: '🧪', tabIds: [1, 2], confidence: 0.9 },
    ];
    const tabs: ClusterCandidate[] = [
      { id: 1, title: 'A', url: 'https://a.com/' },
      { id: 2, title: 'B', url: 'https://b.com/' },
    ];
    const prompt = buildCritiquePrompt(draft, tabs);
    expect(prompt).toContain('"label": "Test"');
    expect(prompt).toContain('1\tA\thttps://a.com/');
    expect(prompt).toContain('2\tB\thttps://b.com/');
    expect(prompt).toContain('Eject any tab');
  });
});

describe('embeddingEjection', () => {
  function mockEmbed(byText: Record<string, Float32Array>): EmbedFn {
    return async (texts: string[]) =>
      texts.map((t) => byText[t] ?? new Float32Array([0, 0]));
  }

  it('ejects a tab whose embedding is far from the cluster centroid', async () => {
    // Off-topic vector points opposite so the centroid lands well away
    // from it (avoids the test passing only by being borderline orthogonal).
    const onTopic = new Float32Array([1, 0]);
    const onTopicB = new Float32Array([0.99, 0.14]);
    const offTopic = new Float32Array([-1, 0]);
    const embed = mockEmbed({
      'rust skin a — https://rustskin.com/a': onTopic,
      'rust skin b — https://rustskin.com/b': onTopicB,
      'youtube — https://youtube.com/watch': offTopic,
    });

    const clusters: SemanticCluster[] = [
      { label: 'Rust skins', emoji: '🎯', tabIds: [1, 2, 3], confidence: 0.9 },
    ];
    const tabs: ClusterCandidate[] = [
      { id: 1, title: 'rust skin a', url: 'https://rustskin.com/a' },
      { id: 2, title: 'rust skin b', url: 'https://rustskin.com/b' },
      { id: 3, title: 'youtube', url: 'https://youtube.com/watch' },
    ];

    const { clusters: refined, ejected } = await embeddingEjection(
      clusters,
      tabs,
      0.4,
      embed,
    );
    expect(refined[0]?.tabIds.sort()).toEqual([1, 2]);
    expect(ejected).toEqual([3]);
  });

  it('preserves a tight cluster unchanged', async () => {
    const v = new Float32Array([1, 0]);
    const embed = mockEmbed({
      'a — https://a.com/': v,
      'b — https://a.com/b': v,
      'c — https://a.com/c': v,
    });
    const clusters: SemanticCluster[] = [
      { label: 'Tight', emoji: '✅', tabIds: [1, 2, 3], confidence: 0.9 },
    ];
    const tabs: ClusterCandidate[] = [
      { id: 1, title: 'a', url: 'https://a.com/' },
      { id: 2, title: 'b', url: 'https://a.com/b' },
      { id: 3, title: 'c', url: 'https://a.com/c' },
    ];
    const { clusters: refined, ejected } = await embeddingEjection(clusters, tabs, 0.4, embed);
    expect(refined[0]?.tabIds).toEqual([1, 2, 3]);
    expect(ejected).toEqual([]);
  });

  it('drops a cluster entirely if too many tabs get ejected', async () => {
    const inA = new Float32Array([1, 0]);
    const farB = new Float32Array([0, 1]);
    const farC = new Float32Array([-1, 0]);
    const embed = mockEmbed({
      'x — https://x.com/': inA,
      'y — https://y.com/': farB,
      'z — https://z.com/': farC,
    });
    const clusters: SemanticCluster[] = [
      { label: 'Garbage', emoji: '🗑️', tabIds: [1, 2, 3], confidence: 0.9 },
    ];
    const tabs: ClusterCandidate[] = [
      { id: 1, title: 'x', url: 'https://x.com/' },
      { id: 2, title: 'y', url: 'https://y.com/' },
      { id: 3, title: 'z', url: 'https://z.com/' },
    ];
    const { clusters: refined, ejected } = await embeddingEjection(clusters, tabs, 0.4, embed);
    expect(refined).toEqual([]);
    expect(ejected.sort()).toEqual([1, 2, 3]);
  });
});
