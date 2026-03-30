/**
 * ContextBuilder — task-aware cross-skill knowledge synthesizer.
 *
 * Given a task description:
 *   1. Decomposes the task into search sub-queries
 *   2. Searches all indexed skills for each sub-query
 *   3. Groups results by skill — keeps the best chunk per skill
 *   4. Within each matched chunk, extracts the most relevant paragraph
 *      and labels it with book title + section (where in the skill it came from)
 *   5. Resolves conflicts using ConflictResolver:
 *      - Auto-resolved: shown with full prose rationale, non-blocking
 *      - Genuine conflict: user is prompted to choose interactively
 *   6. Compiles a sharp, dense system prompt from all resolved knowledge,
 *      each piece cited with its source book and section
 *
 * Usage:
 *   const builder = new ContextBuilder();
 *   const output = await builder.build('implement a Kotlin payment service with async error handling');
 *   // pipe-friendly: builder.build(task, { promptOnly: true })
 */

import * as rl from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { BookLibSearcher } from './engine/searcher.js';
import { ConflictResolver } from './conflict-resolver.js';
import { resolveBookLibPaths } from './paths.js';
import { buildGraphContext } from './engine/graph-injector.js';

// ── Book label map ──────────────────────────────────────────────────────────
const BOOK_LABELS = {
  'clean-code-reviewer':    'Clean Code — Robert C. Martin',
  'effective-kotlin':       'Effective Kotlin — Marcin Moskała',
  'effective-java':         'Effective Java — Joshua Bloch',
  'effective-python':       'Effective Python — Brett Slatkin',
  'effective-typescript':   'Effective TypeScript — Dan Vanderkam',
  'domain-driven-design':   'Domain-Driven Design — Eric Evans',
  'microservices-patterns': 'Microservices Patterns — Chris Richardson',
  'system-design-interview':'System Design Interview — Alex Xu',
  'data-intensive-patterns':'Designing Data-Intensive Applications — Martin Kleppmann',
  'data-pipelines':         'Data Pipelines Pocket Reference — James Densmore',
  'design-patterns':        'Head First Design Patterns — Freeman & Robson',
  'kotlin-in-action':       'Kotlin in Action — Elizarov & Isakova',
  'programming-with-rust':  'Programming with Rust — Donis Marshall',
  'rust-in-action':         'Rust in Action — Tim McNamara',
  'refactoring-ui':         'Refactoring UI — Wathan & Schoger',
  'storytelling-with-data': 'Storytelling with Data — Cole Knaflic',
  'animation-at-work':      'Animation at Work — Rachel Nabors',
  'spring-boot-in-action':  'Spring Boot in Action — Craig Walls',
  'lean-startup':           'The Lean Startup — Eric Ries',
  'using-asyncio-python':   'Using Asyncio in Python — Caleb Hattingh',
  'web-scraping-python':    'Web Scraping with Python — Ryan Mitchell',
  'skill-router':           'BookLib skill-router',
  // Non-code community skills
  'writing-plans':          'Writing Plans — BookLib Community',
  'writing-skills':         'Writing Skills — BookLib Community',
  'article-writing':        'Article Writing — BookLib Community',
  'strategic-compact':      'Strategic Compact — BookLib Community',
  'product-lens':           'Product Lens — BookLib Community',
  'brand-guidelines':       'Brand Guidelines — BookLib Community',
  'web-design-guidelines':  'Web Design Guidelines — BookLib Community',
};

// Maps stored chunk type/tag to a human-readable section name
const SECTION_LABELS = {
  'framework':    'core principles',
  'core_principles': 'core principles',
  'pitfalls':     'anti-patterns',
  'anti_patterns':'anti-patterns',
  'case_studies': 'examples',
  'examples':     'examples',
  'summary':      'overview',
  'content':      'guidance',
};

function bookLabel(skillName) {
  return BOOK_LABELS[skillName] ?? skillName;
}

function sectionLabel(chunk) {
  const raw = chunk.metadata?.originalTag ?? chunk.metadata?.type ?? 'guidance';
  return SECTION_LABELS[raw] ?? raw;
}

/**
 * Split a skill chunk into individual items (principles, rules, anti-patterns).
 *
 * Recognises three item shapes:
 *   - Bold-headed bullets:  "- **Item Name** — body text"
 *   - Numbered items:       "1. **Item Name** — body"  or  "1. Plain body"
 *   - Markdown headings:    "## § Section Name\nbody paragraphs"
 *   - Plain bullets:        "- body without a bold header"
 *
 * Returns Array<{ label: string|null, body: string, raw: string }>
 */
function extractItems(text) {
  if (!text) return [];

  // Strip YAML frontmatter block (ECC community skills include it in chunk text)
  text = text.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '').trim();
  if (!text) return [];

  const items = [];

  // Split into blocks at heading or double-newline boundaries
  const blocks = text
    .split(/\n(?=#{1,3} )|(?<=\n)\n(?=\S)|\n{3,}/)
    .map(b => b.trim())
    .filter(b => b.length > 10);

  for (const block of blocks) {
    // Case 1: Markdown heading block
    const headingMatch = block.match(/^(#{1,3})\s+(.+)\n([\s\S]*)/);
    if (headingMatch) {
      const label = headingMatch[2].replace(/^\*+|\*+$/g, '').trim();
      const body = headingMatch[3].trim();
      items.push({ label, body: body.slice(0, 300), raw: block });
      continue;
    }

    // Case 2: Bold-headed bullet list — split each bullet
    if (/^- \*\*/.test(block) || /^\d+\.\s+\*\*/.test(block)) {
      const bulletRe = /^(?:-|\d+\.)\s+\*\*([^*]+)\*\*\s*[—–:-]?\s*([\s\S]*?)(?=\n(?:-|\d+\.)\s+\*\*|\n#{1,3} |$)/gm;
      let m;
      while ((m = bulletRe.exec(block)) !== null) {
        const label = m[1].trim();
        const body = m[2].replace(/\n/g, ' ').trim().slice(0, 250);
        if (label && body) items.push({ label, body, raw: m[0] });
      }
      // If regex matched nothing, fall through to plain bullet handling
      if (items.length > 0) continue;
    }

    // Case 3: Plain bullets — each bullet becomes its own item (no label)
    if (/^- /.test(block)) {
      const bullets = block
        .split(/\n(?=- )/)
        .map(b => b.replace(/^- /, '').trim())
        .filter(b => b.length > 15);
      for (const b of bullets) {
        items.push({ label: null, body: b.slice(0, 250), raw: b });
      }
      continue;
    }

    // Case 4: Plain paragraph — skip if it looks like a heading, code fence, or XML
    if (/^#{1,3} /.test(block) || /^```/.test(block) || /^<[a-z]/.test(block)) continue;

    // Case 4a: Long prose — split into individual sentences so rankItems can score each one.
    // Covers narrative books (strategy, writing, product, legal) that don't use bullet structure.
    if (block.length > 150) {
      const sentences = block
        .split(/(?<=[.!?])\s+(?=[A-Z"'])/)
        .map(s => s.trim())
        .filter(s => s.length > 30 && !/^\[!\[/.test(s) && !/^!\[/.test(s));
      if (sentences.length >= 2) {
        for (const s of sentences) {
          items.push({ label: null, body: s.slice(0, 300), raw: s });
        }
        continue;
      }
    }
    items.push({ label: null, body: block.slice(0, 300), raw: block });
  }

  // Filter and clean items
  return items
    .map(item => {
      let b = item.body.trim();
      // Strip "You should generate:" prefix from example chunks — keep the list
      b = b.replace(/^You should generate:\s*/i, '');
      // Strip "Actions:" prefix
      b = b.replace(/^Actions:\s*/i, '');
      return { ...item, body: b.trim() };
    })
    .filter(item => {
      const b = item.body.trim();
      if (b.length < 20) return false;
      if (/^#+ /.test(b)) return false;                      // naked heading
      if (/^<[a-z]/.test(b)) return false;                   // XML tag
      if (/^```/.test(b)) return false;                      // code fence
      if (/^[-─═]{3,}/.test(b)) return false;               // horizontal rule / YAML separator
      if (/^You are (an? |the )/.test(b)) return false;      // skill meta-instruction
      if (/^You help (developers|teams|users)/.test(b)) return false;
      if (/^(name|description|origin|version|tags|author):\s+\S/.test(b)) return false; // YAML frontmatter lines
      if (/^\[!\[/.test(b)) return false;                      // badge markdown [![img](url)](url)
      if (/^!\[/.test(b)) return false;                        // inline image ![alt](url)
      return true;
    });
}

/**
 * Score items by keyword overlap with the query, return top N.
 * Items with a label score higher (they're named principles, not noise).
 */
function rankItems(items, queryWords, topN = 3) {
  if (items.length === 0) return [];

  const scored = items.map(item => {
    const text = `${item.label ?? ''} ${item.body}`.toLowerCase();
    const hits = queryWords.reduce((n, w) => n + (text.includes(w) ? 1 : 0), 0);
    const labelBonus = item.label ? 0.5 : 0;
    return { item, score: hits + labelBonus };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topN).map(s => s.item);
}

function hr(label = '', width = 64) {
  const pad = label ? ` ${label} ` : '';
  const dashes = '─'.repeat(Math.max(2, width - pad.length - 4));
  return `── ${pad}${dashes}`;
}

// ── ContextBuilder ──────────────────────────────────────────────────────────

export class ContextBuilder {
  constructor(options = {}) {
    const paths = resolveBookLibPaths(options.projectCwd);
    this._searcher = new BookLibSearcher(paths.indexPath);
  }

  /**
   * Build context for a task.
   * @param {string} task
   * @param {object} opts
   * @param {boolean} opts.promptOnly  - Skip the report, output only the prompt block
   */
  async build(task, { promptOnly = false } = {}) {
    const queries = this._decomposeTask(task);
    const queryWords = task.toLowerCase().split(/\W+/).filter(w => w.length > 3);

    const bySkill = await this._searchAndGroup(queries);

    if (bySkill.size === 0) {
      return 'No indexed skills found. Run `booklib index` first.';
    }

    // Enrich each chunk: extract item-level knowledge + section label
    for (const [, chunk] of bySkill) {
      chunk._section = sectionLabel(chunk);
      chunk._items = rankItems(extractItems(chunk.text), queryWords, 3);
    }

    // Resolve conflicts
    const chunks = [...bySkill.values()];
    const resolver = new ConflictResolver();
    const { winners, suppressed, conflicts } = resolver.resolveChunks(chunks);

    // Build suppression lookup: skillName → { rationale, winnerName }
    const suppressionMap = new Map(
      suppressed.map(s => {
        const winnerMatch = (s._rationale ?? '').match(/`([^`]+)`/);
        return [s._skill, { rationale: s._rationale, winner: winnerMatch?.[1] }];
      })
    );

    // Resolve genuine conflicts interactively or auto
    const decisions = [];
    const extraWinners = [];

    for (const conflict of conflicts) {
      if (promptOnly || !process.stdin.isTTY) {
        const winner = chunks.find(c => c._skill === conflict.options[0].name);
        if (winner) {
          extraWinners.push({ ...winner, _decision: 'auto-conflict' });
          decisions.push({
            conflict,
            chosen: conflict.options[0].name,
            rejected: conflict.options.slice(1).map(o => o.name),
            auto: true,
            reason: `auto-resolved: highest specificity (${conflict.options[0].specificity})`,
          });
        }
      } else {
        const choice = await this._promptConflict(conflict, chunks, queryWords);
        extraWinners.push({ ...choice.chunk, _decision: 'user' });
        decisions.push({
          conflict,
          chosen: choice.skillName,
          rejected: conflict.options.map(o => o.name).filter(n => n !== choice.skillName),
          auto: false,
        });
      }
    }

    const allWinners = [...winners, ...extraWinners];

    if (promptOnly) {
      return this._compilePrompt(task, allWinners, suppressionMap, decisions, queryWords);
    }

    return (
      this._compileReport(task, allWinners, suppressionMap, bySkill, decisions) +
      '\n\n' + hr('Final prompt') + '\n\n' +
      this._compilePrompt(task, allWinners, suppressionMap, decisions, queryWords)
    );
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  _decomposeTask(task) {
    const queries = [task];

    // Split on connectors (avoid 'in' — too common, breaks phrases like "service in Kotlin")
    const parts = task
      .split(/\s+(?:and|with|using|via|plus|,)\s+/i)
      .map(p => p.trim())
      .filter(p => p.length > 4 && p !== task);

    // Include all parts (up to 5), not just first 3
    for (const p of parts.slice(0, 5)) queries.push(p);

    // Also add multi-word noun phrases (2–3 consecutive capitalised/content words)
    // e.g. "domain driven design", "async error handling"
    const nounPhrases = task.match(/(?:[a-z]+ ){1,3}[a-z]+/gi) ?? [];
    for (const phrase of nounPhrases) {
      if (phrase.split(' ').length >= 2 && !queries.includes(phrase)) {
        queries.push(phrase);
      }
    }

    return [...new Set(queries)].slice(0, 8); // cap at 8 queries to keep search fast
  }

  async _searchAndGroup(queries) {
    const bySkill = new Map();
    for (const query of queries) {
      let results = [];
      // MiniLM scores for domain-specific technical content cluster at 0.28-0.55.
      // Principled sections (core knowledge) get the lowest floor — they're worth
      // surfacing even at modest similarity. Generic/review sections need stronger match.
      const SCORE_FLOORS = {
        framework: 0.27, core_principles: 0.27, pitfalls: 0.27, anti_patterns: 0.27,
        content: 0.29, guidelines: 0.29,
        summary: 0.38, overview: 0.38,           // generic meta-descriptions — need stronger match
        case_studies: 0.40, examples: 0.40,       // narrow examples — need strong match
        strengths_to_praise: 0.40,                // review-mode content, not design guidance
      };
      const DEFAULT_FLOOR = 0.35;

      // Fetch 30 candidates — duplicates in the index can fill slots, so we over-fetch then deduplicate
      try { results = await this._searcher.search(query, 30, 0.25); } catch { /* not indexed */ }
      // Deduplicate by (skillName, type, content fingerprint) — index can have duplicate entries
      const seen = new Set();
      results = results.filter(chunk => {
        const key = `${chunk.metadata?.name}|${chunk.metadata?.type}|${(chunk.text ?? '').slice(0, 60)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      for (const chunk of results) {
        // name is in frontmatter for SKILL.md chunks; reference files derive it from filePath
        const skillName = chunk.metadata?.name
          ?? chunk.metadata?.filePath?.split('/')[0]
          ?? null;
        if (!skillName) continue;

        // Apply per-type score floor
        const chunkType = chunk.metadata?.type ?? '';
        const floor = SCORE_FLOORS[chunkType] ?? DEFAULT_FLOOR;
        if (chunk.score < floor) continue;

        // Normalise chunk so _skill and metadata.name are always set
        const normChunk = { ...chunk, _skill: skillName, metadata: { ...chunk.metadata, name: skillName } };
        const existing = bySkill.get(skillName);
        if (!existing) {
          bySkill.set(skillName, normChunk);
          continue;
        }
        // Prefer principled sections over overview/examples
        const principled = ['framework', 'core_principles', 'pitfalls', 'anti_patterns', 'content', 'guidelines'];
        const newType = chunkType;
        const existingType = existing.metadata?.type ?? '';
        const newIsPrincipled = principled.includes(newType);
        const existingIsPrincipled = principled.includes(existingType);
        const scoreDelta = chunk.score - existing.score;
        if (
          (newIsPrincipled && !existingIsPrincipled) ||
          (newIsPrincipled === existingIsPrincipled && scoreDelta > 0)
        ) {
          bySkill.set(skillName, normChunk);
        }
      }
    }
    return bySkill;
  }

  async _promptConflict(conflict, chunks, queryWords) {
    const iface = rl.createInterface({ input, output });
    const options = conflict.options;

    console.log('');
    console.log(hr(`Conflict — ${conflict.topic}`));
    console.log(`  Both skills are equally applicable. Which should guide this decision?\n`);

    for (let i = 0; i < options.length; i++) {
      const letter = String.fromCharCode(97 + i);
      const chunk = chunks.find(c => c._skill === options[i].name);
      const book = bookLabel(options[i].name);
      const section = chunk?._section ?? 'guidance';
      const items = chunk?._items ?? [];

      console.log(`  [${letter}] ${book}  (${section})`);
      for (const item of items.slice(0, 2)) {
        if (item.label) {
          console.log(`       • ${item.label}: ${item.body.slice(0, 100)}…`);
        } else {
          console.log(`       • ${item.body.slice(0, 110)}…`);
        }
      }
      console.log('');
    }

    let answer = '';
    while (true) {
      answer = (await iface.question('  → Your choice: ')).trim().toLowerCase();
      const idx = answer.charCodeAt(0) - 97;
      if (idx >= 0 && idx < options.length) {
        iface.close();
        return {
          skillName: options[idx].name,
          chunk: chunks.find(c => c._skill === options[idx].name),
        };
      }
      console.log(`  Invalid — enter a–${String.fromCharCode(97 + options.length - 1)}.`);
    }
  }

  // ── Report (full explanation view) ─────────────────────────────────────────

  _compileReport(task, winners, suppressionMap, bySkill, decisions) {
    const lines = [
      `Context for: "${task}"`,
      '─'.repeat(64),
      `${bySkill.size} skills matched · ${winners.length} selected · ${suppressionMap.size} suppressed`,
      '',
    ];

    for (const w of winners) {
      const book = bookLabel(w._skill);
      const section = w._section ?? 'guidance';
      const items = w._items ?? [];
      const score = (w.score ?? 0).toFixed(2);

      const confidence = w.score >= 0.45 ? '' : w.score >= 0.35 ? '  ⚠ low confidence' : '  ⚠ borderline match';
      lines.push(hr(w._skill));
      lines.push(`  📖 ${book}`);
      lines.push(`     Section: ${section}   Relevance: ${score}${confidence}`);
      lines.push('');

      if (items.length > 0) {
        for (const item of items) {
          if (item.label) {
            lines.push(`     § ${item.label}`);
            lines.push(`       ${item.body}`);
          } else {
            lines.push(`     • ${item.body}`);
          }
          lines.push('');
        }
      }


      // Show auto-decision rationale (non-blocking, always visible)
      if (w._decision === 'auto' && w._rationale) {
        lines.push(`  ✓  Auto-selected`);
        lines.push(`     ${w._rationale}`);

        // Show what was suppressed in favour of this skill and why
        for (const [suppName, { rationale, winner }] of suppressionMap) {
          if (winner === w._skill) {
            lines.push(`     ↳ suppressed: ${bookLabel(suppName)}`);
            lines.push(`       Reason: ${rationale}`);
          }
        }
        lines.push('');
      }

      // Show user decision rationale
      const dec = decisions.find(d => d.chosen === w._skill);
      if (dec && w._decision === 'user') {
        const rejected = dec.rejected.map(r => bookLabel(r)).join(', ');
        lines.push(`  ✓  Your choice — selected over: ${rejected}`);
        lines.push('');
      }
      if (dec && w._decision === 'auto-conflict') {
        const rejected = dec.rejected.map(r => bookLabel(r)).join(', ');
        lines.push(`  ✓  Auto-resolved conflict`);
        lines.push(`     ${dec.reason}`);
        lines.push(`     ↳ suppressed: ${rejected}`);
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  // ── Graph-augmented context ─────────────────────────────────────────────────

  /**
   * Builds combined context: skill chunks + knowledge graph nodes.
   * @param {string} task - Task description
   * @param {string|null} filePath - Current file path for component matching
   * @returns {Promise<string>} Formatted context string
   */
  async buildWithGraph(task, filePath = null) {
    const skillContext = await this.build(task);

    const searcher = new BookLibSearcher();
    const graphNodes = await buildGraphContext({ filePath, taskContext: task, searcher });

    if (graphNodes.length === 0) return skillContext;

    const nodeSection = graphNodes
      .map(node => `### 📝 ${node.title} [${node.type}]\n${node.body}`)
      .join('\n\n---\n\n');

    return `${skillContext}\n\n---\n\n## Knowledge Graph Context\n\n${nodeSection}`;
  }

  // ── Prompt (sharp injectable block) ────────────────────────────────────────

  _compilePrompt(task, winners, suppressionMap, decisions, queryWords) {
    const lines = [
      `You are working on: ${task}`,
      '',
      'Apply the following principles from canonical books and sources:',
      '',
    ];

    for (const w of winners) {
      const book = bookLabel(w._skill);
      const section = w._section ?? 'guidance';
      const items = w._items ?? [];

      lines.push(`**${book}** — ${section}`);

      // Show each specific item with its label
      for (const item of items) {
        if (item.label) {
          lines.push(`- **${item.label}**: ${item.body}`);
        } else {
          lines.push(`- ${item.body}`);
        }
      }

      // Inline decision note
      const dec = decisions.find(d => d.chosen === w._skill);
      if (dec) {
        const how = dec.auto ? 'auto-resolved' : 'your choice';
        const over = dec.rejected.map(r => bookLabel(r)).join(', ');
        lines.push(`*(${how} over: ${over})*`);
      } else if (w._decision === 'auto' && w._rationale) {
        lines.push(`*(auto-selected: ${w._rationale})*`);
      }

      lines.push('');
    }

    const suppressed = [...suppressionMap.keys()];
    if (suppressed.length > 0) {
      lines.push('---');
      lines.push('*Additional books matched but were suppressed — more specific guidance above covers their domain:*');
      for (const s of suppressed) {
        const info = suppressionMap.get(s);
        lines.push(`- **${bookLabel(s)}** — ${info.rationale ?? 'lower specificity'}`);
      }
    }

    return lines.join('\n');
  }
}
