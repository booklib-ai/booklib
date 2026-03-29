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
 * Extract the leading heading from a text block, if any.
 * Returns e.g. "Item 7: Prefer null safety operators" or null.
 */
function leadingHeading(text) {
  const line = (text ?? '').split('\n').find(l => /^#+\s/.test(l.trim()) || /^\d+[\.\)]\s/.test(l.trim()));
  return line ? line.replace(/^#+\s*/, '').replace(/^\d+[\.\)]\s*/, '').trim() : null;
}

/**
 * From a potentially large chunk, extract the paragraph most relevant to the query.
 * Uses keyword overlap as a simple relevance heuristic — no re-embedding needed.
 */
function extractRelevantPassage(chunkText, queryWords, maxLen = 300) {
  if (!chunkText) return '';

  // Split into paragraphs (double newline or heading boundaries)
  const paragraphs = chunkText
    .split(/\n{2,}|(?=\n#{1,3} )/)
    .map(p => p.trim())
    .filter(p => p.length > 20);

  if (paragraphs.length <= 1) {
    return chunkText.trim().slice(0, maxLen);
  }

  // Score each paragraph by query keyword overlap
  const scored = paragraphs.map(p => {
    const lower = p.toLowerCase();
    const hits = queryWords.filter(w => lower.includes(w)).length;
    return { p, hits };
  });

  scored.sort((a, b) => b.hits - a.hits);
  const best = scored[0].p;

  return best.length <= maxLen ? best : best.slice(0, maxLen - 1) + '…';
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

    // Enrich each chunk: extract relevant passage + heading + section label
    for (const [skillName, chunk] of bySkill) {
      chunk._passage = extractRelevantPassage(chunk.text, queryWords);
      chunk._heading = leadingHeading(chunk.text);
      chunk._section = sectionLabel(chunk);
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
    const parts = task
      .split(/\s+(?:and|with|using|for|in|via|plus|,)\s+/i)
      .map(p => p.trim())
      .filter(p => p.length > 4 && p !== task);
    for (const p of parts.slice(0, 3)) queries.push(p);
    return [...new Set(queries)];
  }

  async _searchAndGroup(queries) {
    const bySkill = new Map();
    for (const query of queries) {
      let results = [];
      try { results = await this._searcher.search(query, 8, 0.45); } catch { /* not indexed */ }
      for (const chunk of results) {
        const skillName = chunk.metadata?.name;
        if (!skillName) continue; // skip example/unnamed chunks
        const existing = bySkill.get(skillName);
        if (!existing || chunk.score > existing.score) {
          bySkill.set(skillName, { ...chunk, _skill: skillName });
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
      const section = chunk ? sectionLabel(chunk) : '';
      const heading = chunk?._heading;
      const passage = chunk ? extractRelevantPassage(chunk.text, queryWords, 140) : '';

      console.log(`  [${letter}] ${book}`);
      if (section) console.log(`       Section: ${section}${heading ? ` — "${heading}"` : ''}`);
      if (passage) console.log(`       "${passage}"`);
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
      const heading = w._heading;
      const passage = w._passage ?? '';
      const score = (w.score ?? 0).toFixed(2);

      lines.push(hr(w._skill));
      lines.push(`  📖 ${book}`);
      lines.push(`     Section: ${section}${heading ? ` — "${heading}"` : ''}`);
      lines.push(`     Relevance: ${score}`);
      if (passage) lines.push(`\n     "${passage}"`);
      lines.push('');

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

  // ── Prompt (sharp injectable block) ────────────────────────────────────────

  _compilePrompt(task, winners, suppressionMap, decisions, queryWords) {
    const lines = [
      `You are working on: ${task}`,
      '',
      'Apply the following principles from canonical programming books:',
      '',
    ];

    for (const w of winners) {
      const book = bookLabel(w._skill);
      const section = w._section ?? 'guidance';
      const heading = w._heading;
      const passage = w._passage ?? w.text?.slice(0, 350) ?? '';

      // Header: Book — section — heading
      const loc = [section, heading ? `"${heading}"` : null].filter(Boolean).join(' › ');
      lines.push(`**${book}** (${loc})`);
      if (passage) lines.push(passage);

      // Inline decision note for this book
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
