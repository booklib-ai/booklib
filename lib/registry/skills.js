/**
 * The BookLib Curated Registry.
 *
 * Each entry describes a skill — where it lives, what triggers it,
 * and which languages it applies to. The `source` field tells the
 * skill fetcher how to retrieve the skill content.
 *
 * source.type values:
 *   "npm"    — bundled in this package, available at source.path
 *   "github" — raw content fetched from source.url
 */
export const SKILL_REGISTRY = [
  {
    name: 'clean-code-reviewer',
    description: 'Principles for readable, maintainable, and expressive code.',
    source: { type: 'npm', package: '@booklib/skills', path: 'skills/clean-code-reviewer' },
    triggers: { extensions: ['.js', '.ts', '.py', '.java', '.kt', '.rb'], keywords: ['naming', 'functions', 'refactor', 'smells', 'clean code'] },
    languages: ['all'],
    version: '1.10.0',
  },
  {
    name: 'effective-kotlin',
    description: 'Best practices for safety, readability, and efficiency in Kotlin.',
    source: { type: 'npm', package: '@booklib/skills', path: 'skills/effective-kotlin' },
    triggers: { extensions: ['.kt', '.kts'], keywords: ['kotlin', 'null safety', 'mutability', 'coroutines'] },
    languages: ['kotlin'],
    version: '1.10.0',
  },
  {
    name: 'effective-typescript',
    description: 'Type-safe patterns from the 62 items of Effective TypeScript.',
    source: { type: 'npm', package: '@booklib/skills', path: 'skills/effective-typescript' },
    triggers: { extensions: ['.ts', '.tsx'], keywords: ['typescript', 'type safety', 'any', 'generics', 'inference'] },
    languages: ['typescript'],
    version: '1.10.0',
  },
  {
    name: 'effective-python',
    description: 'Pythonic patterns from Effective Python 3rd edition.',
    source: { type: 'npm', package: '@booklib/skills', path: 'skills/effective-python' },
    triggers: { extensions: ['.py'], keywords: ['python', 'pythonic', 'comprehensions', 'generators', 'async'] },
    languages: ['python'],
    version: '1.10.0',
  },
  {
    name: 'effective-java',
    description: 'Best practices from Effective Java 3rd edition.',
    source: { type: 'npm', package: '@booklib/skills', path: 'skills/effective-java' },
    triggers: { extensions: ['.java'], keywords: ['java', 'generics', 'concurrency', 'immutability', 'builder'] },
    languages: ['java'],
    version: '1.10.0',
  },
  {
    name: 'domain-driven-design',
    description: 'DDD patterns: aggregates, value objects, bounded contexts.',
    source: { type: 'npm', package: '@booklib/skills', path: 'skills/domain-driven-design' },
    triggers: { extensions: ['.ts', '.java', '.kt', '.py'], keywords: ['domain', 'aggregate', 'entity', 'value object', 'bounded context', 'ddd'] },
    languages: ['all'],
    version: '1.10.0',
  },
  {
    name: 'microservices-patterns',
    description: 'Patterns for building reliable microservices.',
    source: { type: 'npm', package: '@booklib/skills', path: 'skills/microservices-patterns' },
    triggers: { extensions: ['.ts', '.java', '.py', '.go'], keywords: ['microservices', 'saga', 'event', 'api gateway', 'service mesh'] },
    languages: ['all'],
    version: '1.10.0',
  },
  {
    name: 'system-design-interview',
    description: 'High-level patterns for scalability, estimation, and distributed systems.',
    source: { type: 'npm', package: '@booklib/skills', path: 'skills/system-design-interview' },
    triggers: { extensions: ['.md', '.ts', '.java'], keywords: ['scalability', 'load balancer', 'caching', 'replication', 'sharding'] },
    languages: ['all'],
    version: '1.10.0',
  },
  {
    name: 'data-intensive-patterns',
    description: 'Patterns for data systems: storage, replication, consistency.',
    source: { type: 'npm', package: '@booklib/skills', path: 'skills/data-intensive-patterns' },
    triggers: { extensions: ['.py', '.java', '.scala', '.ts'], keywords: ['data', 'replication', 'consistency', 'stream', 'batch', 'kafka'] },
    languages: ['all'],
    version: '1.10.0',
  },
  {
    name: 'refactoring-ui',
    description: 'Visual design principles for developers building UI.',
    source: { type: 'npm', package: '@booklib/skills', path: 'skills/refactoring-ui' },
    triggers: { extensions: ['.tsx', '.jsx', '.css', '.html', '.svelte', '.vue'], keywords: ['ui', 'design', 'spacing', 'typography', 'color', 'tailwind'] },
    languages: ['typescript', 'javascript', 'css'],
    version: '1.10.0',
  },
  // External / community skills (fetched from GitHub on demand)
  {
    name: 'superpowers-debug',
    description: 'Systematic debugging workflow.',
    source: { type: 'github', url: 'https://raw.githubusercontent.com/obra/superpowers/main/skills/debugging.md' },
    triggers: { extensions: [], keywords: ['debugging', 'troubleshooting', 'systematic', 'bug'] },
    languages: ['all'],
    version: null,
  },
];
