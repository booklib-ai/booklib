/**
 * Resolves conflicts between skill suggestions or indexed chunks.
 *
 * Resolution rules (applied per topic group):
 *   specificity delta >= 2  OR  score delta >= 0.2  →  auto-resolve (higher wins, rationale attached)
 *   otherwise                                        →  escalate (add to conflicts list)
 *
 * Usage:
 *   const resolver = new ConflictResolver(registryArray);
 *   const { winners, suppressed, conflicts } = resolver.resolveSkills(suggestions);
 *   const { winners, suppressed, conflicts } = resolver.resolveChunks(searchResults);
 */
export class ConflictResolver {
  /**
   * @param {Array<{name: string, specificity?: number, topic?: string, stars?: number}>} registry
   */
  constructor(registry = []) {
    this._byName = new Map(registry.map(s => [s.name, s]));
  }

  /**
   * Resolves conflicts between registry-level skill suggestions.
   * @param {object[]} skills  — each must have .name
   */
  resolveSkills(skills) {
    return this._resolve(
      skills,
      s => s.name,
      s => this._meta(s.name, s)
    );
  }

  /**
   * Resolves conflicts between semantic-search chunks.
   * @param {Array<{score: number, text: string, metadata: object}>} chunks
   */
  resolveChunks(chunks) {
    return this._resolve(
      chunks,
      c => c.metadata?.name ?? c.metadata?.filePath ?? 'unknown',
      c => this._meta(c.metadata?.name, c)
    );
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /** Look up registry metadata, falling back to inline values or defaults. */
  _meta(name, item = {}) {
    const reg = this._byName.get(name);
    return {
      specificity: reg?.specificity ?? item?.specificity ?? 5,
      topic: reg?.topic ?? item?.topic ?? name ?? 'unknown',
      stars: reg?.stars ?? item?.stars ?? 0,
    };
  }

  _resolve(items, getName, getMeta) {
    // Group by topic
    const byTopic = new Map();
    for (const item of items) {
      const { topic } = getMeta(item);
      if (!byTopic.has(topic)) byTopic.set(topic, []);
      byTopic.get(topic).push(item);
    }

    const winners = [];
    const suppressed = [];
    const conflicts = [];

    for (const [, candidates] of byTopic) {
      if (candidates.length === 1) {
        winners.push({ ...candidates[0], _decision: 'auto', _rationale: null });
        continue;
      }

      // Sort: specificity desc → score desc → stars desc
      const sorted = [...candidates].sort((a, b) => {
        const ma = getMeta(a), mb = getMeta(b);
        if (mb.specificity !== ma.specificity) return mb.specificity - ma.specificity;
        if ((b.score ?? 0) !== (a.score ?? 0)) return (b.score ?? 0) - (a.score ?? 0);
        return (mb.stars ?? 0) - (ma.stars ?? 0);
      });

      const best = sorted[0];
      const bestMeta = getMeta(best);
      let bestAdded = false;

      for (const runner of sorted.slice(1)) {
        const runnerMeta = getMeta(runner);
        const dSpec = bestMeta.specificity - runnerMeta.specificity;
        const dScore = (best.score ?? 0) - (runner.score ?? 0);

        if (dSpec >= 2 || dScore >= 0.2) {
          // Clear winner — auto-resolve silently
          const reason = dSpec >= 2
            ? `more specific (${bestMeta.specificity} vs ${runnerMeta.specificity})`
            : `higher relevance (${(best.score ?? 0).toFixed(2)} vs ${(runner.score ?? 0).toFixed(2)})`;

          if (!bestAdded) {
            winners.push({
              ...best,
              _decision: 'auto',
              _rationale: `chosen over \`${getName(runner)}\` — ${reason}`,
            });
            bestAdded = true;
          }
          suppressed.push({ ...runner, _decision: 'suppressed', _rationale: `\`${getName(best)}\` preferred — ${reason}` });
        } else {
          // Genuine conflict — escalate to human
          if (!conflicts.find(c => c.options.some(o => o.name === getName(best)))) {
            conflicts.push({
              topic: bestMeta.topic,
              options: sorted.map(s => ({
                name: getName(s),
                specificity: getMeta(s).specificity,
                score: s.score ?? null,
              })),
              message:
                `\`${getName(best)}\` vs \`${getName(runner)}\` — both equally applicable` +
                ` (specificity ${bestMeta.specificity} vs ${runnerMeta.specificity}).` +
                ` Which should guide this decision?`,
            });
          }
        }
      }

      // Add best as winner if no conflict was raised for it
      if (!bestAdded && !conflicts.some(c => c.options.some(o => o.name === getName(best)))) {
        winners.push({ ...best, _decision: 'auto', _rationale: null });
      }
    }

    return { winners, suppressed, conflicts };
  }
}
