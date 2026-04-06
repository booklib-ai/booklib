import fs from 'node:fs';
import path from 'node:path';

const HEURISTICS = {
  'framework-docs': [
    { pattern: /```[\s\S]*?```/g, weight: 2, name: 'code-blocks' },
    { pattern: /\bimport\s+|require\s*\(/gi, weight: 3, name: 'imports' },
    { pattern: /\b(npm|yarn|pnpm)\s+(install|add|run)/gi, weight: 2, name: 'package-mgr' },
    { pattern: /\b(config|configuration|setup|getting.started)\b/gi, weight: 1, name: 'setup-words' },
  ],
  'api-reference': [
    { pattern: /\b(GET|POST|PUT|DELETE|PATCH)\s+\//gi, weight: 3, name: 'http-methods' },
    { pattern: /\/api\//gi, weight: 2, name: 'api-paths' },
    { pattern: /\b(endpoint|request|response|header|status.code)\b/gi, weight: 1, name: 'api-words' },
    { pattern: /\b(200|201|400|401|403|404|500)\b/g, weight: 1, name: 'status-codes' },
  ],
  'release-notes': [
    { pattern: /^#{1,3}\s*v?\d+\.\d+/gm, weight: 4, name: 'version-headers' },
    { pattern: /\b(breaking|deprecated|removed)\b/gi, weight: 3, name: 'breaking-words' },
    { pattern: /\b(added|fixed|changed|updated)\b/gi, weight: 2, name: 'changelog-words' },
    { pattern: /\bchangelog\b/gi, weight: 2, name: 'changelog-mention' },
  ],
  'spec': [
    { pattern: /\b(requirement|acceptance.criteria|user.story)\b/gi, weight: 4, name: 'spec-terms' },
    { pattern: /\b(shall|must|should)\b/gi, weight: 2, name: 'rfc-modals' },
    { pattern: /given.*when.*then/gi, weight: 4, name: 'gherkin' },
    { pattern: /\b(feature|scenario|priority)\b/gi, weight: 1, name: 'spec-words' },
  ],
  'team-decision': [
    { pattern: /##\s*(Context|Decision|Consequences)/gi, weight: 5, name: 'adr-headers' },
    { pattern: /\bStatus:\s*(Accepted|Proposed|Deprecated)/gi, weight: 4, name: 'adr-status' },
    { pattern: /\b(ADR|architecture.decision)\b/gi, weight: 3, name: 'adr-mention' },
  ],
  'tutorial': [
    { pattern: /\bstep\s+\d+/gi, weight: 3, name: 'step-numbers' },
    { pattern: /^#{1,3}\s*step\s+\d+/gim, weight: 4, name: 'step-headers' },
    { pattern: /\b(first|next|then|finally|let's)\b/gi, weight: 1, name: 'sequence-words' },
  ],
  // Spec-driven development frameworks: SpecKit, GSD, Kiro, Superpowers
  'sdd-spec': [
    { pattern: /\b(GOAL|DELIVERS|NOT.DOING|ASSUMPTIONS)\b/g, weight: 5, name: 'spec-card' },
    { pattern: /\b(requirement|acceptance.criteria|user.story)\b/gi, weight: 3, name: 'req-terms' },
    { pattern: /^#{1,3}\s*Task\s+\d+/gm, weight: 4, name: 'task-headers' },
    { pattern: /- \[ \]/g, weight: 2, name: 'task-checkboxes' },
    { pattern: /\b(implementation.plan|design.doc|architecture)\b/gi, weight: 2, name: 'plan-words' },
    { pattern: /\b(spec|specification|roadmap|milestone)\b/gi, weight: 2, name: 'spec-words' },
    { pattern: /\b(constitution|steering|constraints)\b/gi, weight: 3, name: 'speckit-terms' },
    { pattern: /\b(STATE|REQUIREMENTS|ROADMAP|PROJECT)\.md\b/g, weight: 4, name: 'gsd-files' },
  ],
  // OpenAPI, AsyncAPI, GraphQL SDL, Protocol Buffers
  'api-spec': [
    { pattern: /\bopenapi:\s*["']?3\./gi, weight: 6, name: 'openapi-version' },
    { pattern: /\bswagger:\s*["']?2\./gi, weight: 6, name: 'swagger-version' },
    { pattern: /\basyncapi:\s*["']?[23]\./gi, weight: 6, name: 'asyncapi-version' },
    { pattern: /\bpaths:\s*$/gm, weight: 4, name: 'openapi-paths' },
    { pattern: /\bschemas?:\s*$/gm, weight: 3, name: 'openapi-schemas' },
    { pattern: /\b(operationId|requestBody|responses):/gi, weight: 3, name: 'openapi-keywords' },
    { pattern: /^type\s+(Query|Mutation|Subscription)\s*\{/gm, weight: 6, name: 'graphql-types' },
    { pattern: /^(input|enum|interface|union)\s+\w+/gm, weight: 3, name: 'graphql-defs' },
    { pattern: /^service\s+\w+\s*\{/gm, weight: 5, name: 'grpc-service' },
    { pattern: /^message\s+\w+\s*\{/gm, weight: 3, name: 'proto-message' },
  ],
  // Gherkin BDD specs (.feature files)
  'bdd-spec': [
    { pattern: /^Feature:\s+/gm, weight: 6, name: 'feature-keyword' },
    { pattern: /^\s*Scenario(?:\s+Outline)?:\s+/gm, weight: 5, name: 'scenario-keyword' },
    { pattern: /^\s*Given\s+/gm, weight: 3, name: 'given-step' },
    { pattern: /^\s*When\s+/gm, weight: 3, name: 'when-step' },
    { pattern: /^\s*Then\s+/gm, weight: 3, name: 'then-step' },
    { pattern: /^\s*And\s+/gm, weight: 1, name: 'and-step' },
    { pattern: /^\s*Background:/gm, weight: 4, name: 'background' },
    { pattern: /^\s*Examples:/gm, weight: 4, name: 'examples-table' },
  ],
  // Architecture: Structurizr DSL, C4 model
  'architecture': [
    { pattern: /\bworkspace\s*\{/gi, weight: 6, name: 'structurizr-workspace' },
    { pattern: /\b(softwareSystem|container|component|person)\s+/gi, weight: 5, name: 'c4-elements' },
    { pattern: /\b(deploymentEnvironment|infrastructureNode)\b/gi, weight: 4, name: 'c4-deployment' },
    { pattern: /\b(System.Context|Container|Component|Dynamic|Deployment)\s+(Diagram|View)/gi, weight: 5, name: 'c4-diagrams' },
    { pattern: /\b(arc42|architecture.overview|building.block)/gi, weight: 3, name: 'arc42-terms' },
    { pattern: /\b(quality.requirements|runtime.view|deployment.view)\b/gi, weight: 3, name: 'arc42-sections' },
  ],
  // Internal project documentation with code examples and spec terms
  'project-docs': [
    { pattern: /```[\s\S]*?```/g, weight: 1, name: 'code-blocks' },
    { pattern: /\bimport\s+|require\s*\(/gi, weight: 1, name: 'imports' },
    { pattern: /\b(acceptance.criteria|user.stor(?:y|ies))\b/gi, weight: 4, name: 'project-spec-terms' },
    { pattern: /##\s*(Context|Decision|Consequences)/gi, weight: 3, name: 'adr-headers' },
    { pattern: /\b(implementation.plan|design.doc|technical.design)\b/gi, weight: 3, name: 'internal-plan-terms' },
    { pattern: /\b(sprint|backlog|epic|milestone)\b/gi, weight: 2, name: 'agile-terms' },
    { pattern: /\b(TODO|FIXME|HACK|NOTE):/g, weight: 2, name: 'dev-markers' },
    { pattern: /\b(refactor|deprecate|migrate|upgrade)\b/gi, weight: 1, name: 'maintenance-words' },
  ],
  // Personal knowledge management: Obsidian, Logseq, Foam, Dendron
  'pkm': [
    { pattern: /\[\[([^\]]+)\]\]/g, weight: 4, name: 'wikilinks' },
    { pattern: /\(\(([a-f0-9-]+)\)\)/g, weight: 5, name: 'logseq-block-refs' },
    { pattern: /^tags:\s*\[/gm, weight: 3, name: 'yaml-tags-array' },
    { pattern: /^aliases:\s*\[/gm, weight: 4, name: 'obsidian-aliases' },
    { pattern: /^cssclass:/gm, weight: 5, name: 'obsidian-cssclass' },
    { pattern: /^publish:\s*(true|false)/gm, weight: 4, name: 'obsidian-publish' },
    { pattern: /^date:\s*\d{4}-\d{2}-\d{2}/gm, weight: 2, name: 'dated-notes' },
    { pattern: /#[a-zA-Z][\w/-]+/g, weight: 1, name: 'hashtags' },
    { pattern: /^\s*- \[\[/gm, weight: 3, name: 'linked-list-items' },
    { pattern: /\^[a-f0-9]{6}/g, weight: 4, name: 'obsidian-block-ids' },
  ],
};

/** Penalty patterns that reduce scores for misclassified types. */
const NEGATIVE_SIGNALS = {
  'framework-docs': [
    { pattern: /\b(acceptance.criteria|user.stor(?:y|ies))\b/gi, weight: -5, name: 'project-spec-terms' },
    { pattern: /##\s*(Context|Decision|Consequences)/gi, weight: -4, name: 'adr-headers' },
    { pattern: /\bStatus:\s*(Accepted|Proposed|Deprecated)/gi, weight: -4, name: 'adr-status' },
    { pattern: /\b(sprint|backlog|epic|kanban)\b/gi, weight: -3, name: 'agile-terms' },
    { pattern: /\b(implementation.plan|design.doc|technical.design)\b/gi, weight: -3, name: 'internal-plan-terms' },
  ],
};

/**
 * Detect the source type of a directory by analyzing file contents.
 * Scores each file against keyword/pattern heuristics and picks the highest-scoring type.
 * Falls back to 'wiki' when no type scores above the threshold.
 *
 * @param {string} dirPath - directory to analyze
 * @param {object} [opts]
 * @param {number} [opts.maxFiles=10] - max files to sample
 * @param {number} [opts.minScore=5] - minimum score to beat 'wiki' default
 * @returns {{ type: string, scores: Record<string, number>, confidence: string }}
 */
export function detectSourceType(dirPath, opts = {}) {
  const { maxFiles = 10, minScore = 5 } = opts;

  if (maxFiles < 1) throw new Error('maxFiles must be >= 1');
  if (minScore < 0) throw new Error('minScore must be >= 0');

  let files;
  try {
    files = findContentFiles(dirPath).slice(0, maxFiles);
  } catch {
    return { type: 'wiki', scores: {}, confidence: 'none' };
  }

  if (files.length === 0) {
    return { type: 'wiki', scores: {}, confidence: 'none' };
  }

  // Directory-level signals: config dirs that strongly indicate a tool
  const dirBonus = detectDirSignals(dirPath);

  const parts = [];
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8').trim();
    if (text.length > 0) parts.push(text);
  }
  if (parts.length === 0) {
    return { type: 'wiki', scores: {}, confidence: 'none' };
  }
  const content = parts.join('\n');

  const scores = {};
  for (const [type, rules] of Object.entries(HEURISTICS)) {
    let score = 0;
    for (const rule of rules) {
      const matches = content.match(rule.pattern);
      if (matches) score += matches.length * rule.weight;
    }
    // Apply negative signals (penalties for misclassification)
    const penalties = NEGATIVE_SIGNALS[type];
    if (penalties) {
      for (const rule of penalties) {
        const matches = content.match(rule.pattern);
        if (matches) score += matches.length * rule.weight;
      }
    }
    scores[type] = Math.max(0, score + (dirBonus[type] ?? 0));
  }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [bestType, bestScore] = sorted[0];

  if (bestScore < minScore) {
    return { type: 'wiki', scores, confidence: 'low' };
  }

  const runnerUp = sorted[1]?.[1] ?? 0;
  const confidence = bestScore >= runnerUp * 2 ? 'high' : 'medium';

  return { type: bestType, scores, confidence };
}

/** Check for tool-specific config directories that strongly signal a source type. */
function detectDirSignals(dirPath) {
  const bonus = {};
  const DIR_SIGNALS = {
    '.obsidian': { type: 'pkm', score: 100 },
    '.logseq': { type: 'pkm', score: 100 },
    '.foam': { type: 'pkm', score: 100 },
    '.specify': { type: 'sdd-spec', score: 100 },
    '.planning': { type: 'sdd-spec', score: 100 },
    '.gsd': { type: 'sdd-spec', score: 100 },
    '.kiro': { type: 'sdd-spec', score: 100 },
    'docs': { type: 'project-docs', score: 100 },
    'doc': { type: 'project-docs', score: 100 },
  };

  // Check the directory name itself (fixes BUG 9: self-check)
  const selfSignal = DIR_SIGNALS[path.basename(dirPath)];
  if (selfSignal) bonus[selfSignal.type] = (bonus[selfSignal.type] ?? 0) + selfSignal.score;

  try {
    const entries = fs.readdirSync(dirPath);
    for (const name of entries) {
      const signal = DIR_SIGNALS[name];
      if (signal) bonus[signal.type] = (bonus[signal.type] ?? 0) + signal.score;
    }
  } catch { /* best effort */ }
  return bonus;
}

/** Recursively find content files, skipping common noise directories.
 *  Includes markdown, YAML, JSON, GraphQL, Gherkin, and proto files
 *  so structured formats (OpenAPI, GraphQL SDL, .feature) are detected. */
function findContentFiles(dirPath) {
  const results = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!['node_modules', '.git', '.booklib'].includes(entry.name)) {
          walk(full);
        }
      } else if (/\.(md|mdx|txt|rst|ya?ml|json|graphql|gql|feature|proto|dsl)$/i.test(entry.name)) {
        results.push(full);
      }
    }
  };
  walk(dirPath);
  return results;
}
