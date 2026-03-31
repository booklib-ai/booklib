// lib/wizard/index.js
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createSession, sep } from './prompt.js';
import { detect as detectProject } from './project-detector.js';
import { SKILL_LIMIT } from './skill-recommender.js';
import { detectIntegrations } from './integration-detector.js';
import { SkillFetcher, countInstalledSlots, listInstalledSkillNames, installSkill } from '../skill-fetcher.js';
import { BookLibIndexer } from '../engine/indexer.js';
import { BookLibSearcher } from '../engine/searcher.js';
import { AgentDetector } from '../agent-detector.js';
import { ProjectInitializer } from '../project-initializer.js';
import { resolveBookLibPaths } from '../paths.js';

const AGENT_LABELS = {
  claude: 'Claude Code', cursor: 'Cursor', copilot: 'Copilot',
  gemini: 'Gemini CLI', codex: 'Codex', windsurf: 'Windsurf',
  'roo-code': 'Roo Code', openhands: 'OpenHands', junie: 'Junie',
  goose: 'Goose', opencode: 'OpenCode', letta: 'Letta',
};
const ALL_AGENTS = Object.keys(AGENT_LABELS);

export async function runWizard(cwd = process.cwd()) {
  const markerPath = path.join(cwd, '.booklib', 'initialized');
  if (fs.existsSync(markerPath)) {
    return runRelevanceAudit(cwd);
  }
  return runSetup(cwd);
}

// ── Setup flow ───────────────────────────────────────────────────────────────

async function runSetup(cwd) {
  const session = createSession();

  try {
    // 1. Banner
    printBanner();

    // 2. Project detection
    const project = await stepProjectDetection(session, cwd);

    // 3. Health check — diagnose slot problems
    const slotsUsed = countInstalledSlots();
    const installedNames = listInstalledSkillNames();
    stepHealthCheck(slotsUsed, installedNames);

    // 4. AI tool detection
    const selectedAgents = await stepToolSelection(session, cwd);

    // 5. Build index (with progress)
    await stepIndexBuild();

    // 6. Recommend from search index + install/cleanup
    const selectedSkills = await stepRecommendAndInstall(session, project, slotsUsed, installedNames);

    // 7. Write config files
    const skillsForConfig = selectedSkills.length > 0 ? selectedSkills : installedNames.slice(0, 10);
    await stepWriteConfigs(session, cwd, selectedAgents, skillsForConfig);

    // 8. Summary
    printSummary(selectedSkills.length);

    // Mark as initialized
    const markerPath = path.join(cwd, '.booklib', 'initialized');
    fs.mkdirSync(path.dirname(markerPath), { recursive: true });
    fs.writeFileSync(markerPath, new Date().toISOString());
  } finally {
    session.close();
  }
}

function printBanner() {
  console.log('');
  console.log('      ┌──────┬──────┐ ✦');
  console.log('      │ ───  │ ───  │');
  console.log('      │ ──   │ ──   │  BookLib');
  console.log('      │ ───  │ ───  │');
  console.log('      │ ──   │ ──   │  AI-agent skills from');
  console.log('      │ ───  │ ───  │  expert knowledge');
  console.log('      └──────┴──────┘');
  console.log('');
}

async function stepProjectDetection(session, cwd) {
  process.stdout.write('► What are you building?\n');
  const project = detectProject(cwd);

  if (project.languages.length > 0) {
    const langs = project.languages.join(', ');
    const fw = project.frameworks.length ? ` (${project.frameworks.join(', ')})` : '';
    process.stdout.write(`  Auto-detected: ${langs}${fw}\n`);
    const ok = await session.confirm('  Correct?', true);
    if (!ok) {
      const answer = await session.readText('  Describe your stack (e.g. "React + Node.js", "Kotlin Android"): ');
      return { languages: [answer], frameworks: [], signals: [] };
    }
  } else {
    const answer = await session.readText('  Describe your stack (e.g. "React + Node.js", "Kotlin Android"): ');
    return { languages: [answer], frameworks: [], signals: [] };
  }

  return project;
}

function stepHealthCheck(slotsUsed, installedNames) {
  if (slotsUsed <= SKILL_LIMIT) return;

  process.stdout.write('\n► Checking your setup...\n\n');
  process.stdout.write(`  ⚠ You have ${slotsUsed} skills installed in ~/.claude/skills/\n\n`);
  process.stdout.write('  Claude loads all skills into its context window at startup.\n');
  process.stdout.write(`  With ${slotsUsed}, most get truncated — your agent misses key content.\n`);
  process.stdout.write('  Recommended: 10–20 skills matched to your project.\n\n');
  process.stdout.write('  After indexing, I\'ll find the best skills for your stack\n');
  process.stdout.write('  and help you clean up the rest.\n');
}

async function stepToolSelection(session, cwd) {
  process.stdout.write('\n► Which AI tools do you use?\n\n');

  const detector = new AgentDetector({ cwd });
  const detected = detector.detect();
  const detectedSet = new Set(detected);

  for (const a of detected) {
    process.stdout.write(`  ✓ ${AGENT_LABELS[a] ?? a} (detected)\n`);
  }

  const undetected = ALL_AGENTS.filter(a => !detectedSet.has(a));
  if (undetected.length > 0) {
    process.stdout.write('\n  Also available:\n');
    undetected.forEach((a, i) => {
      process.stdout.write(`  ${i + 1}. ${AGENT_LABELS[a] ?? a}\n`);
    });
    const picks = await session.numberedInput(
      `\n  Enter numbers to add (e.g. 1,3) or Enter to skip: `,
      undetected.length,
    );
    for (const idx of picks) {
      detected.push(undetected[idx]);
    }
  }

  process.stdout.write(`\n  Selected: ${detected.map(a => AGENT_LABELS[a] ?? a).join(', ')}\n`);

  // Save to config
  try {
    const { configPath } = resolveBookLibPaths(cwd);
    let savedConfig = {};
    try { savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch { /* no config */ }
    savedConfig.tools = detected;
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(savedConfig, null, 2));
  } catch { /* best-effort */ }

  const integrations = detectIntegrations({ cwd });
  if (integrations.superpowers) {
    process.stdout.write('  Detected: obra/superpowers plugin (skills auto-synced)\n');
  }

  return detected;
}

async function stepIndexBuild() {
  process.stdout.write('\n► Building knowledge index...\n');
  const indexer = new BookLibIndexer();

  try {
    const { skillsPath } = resolveBookLibPaths();
    await indexer.indexDirectory(skillsPath, false, {
      quiet: true,
      onProgress({ current, total, file }) {
        const name = file.split('/')[0]?.replace('/SKILL.md', '') ?? file;
        process.stdout.write(`\r  [${current}/${total}] ${name.padEnd(30)}`);
      },
    });
    process.stdout.write('\r' + ' '.repeat(60) + '\r');
    process.stdout.write('  ✓ Index ready\n');
  } catch (err) {
    process.stdout.write(`\n  Index build failed: ${err.message}\n  Run "booklib index" manually.\n`);
  }
}

async function stepRecommendAndInstall(session, project, slotsUsed, installedNames) {
  process.stdout.write('\n► Finding best skills for your project...\n');

  const searcher = new BookLibSearcher();
  const queryText = project.languages.join(' ') + ' best practices';
  let results;
  try {
    results = await searcher.search(queryText, 20, 0);
  } catch {
    process.stdout.write('  Search index not available. Run "booklib index" first.\n');
    return [];
  }

  // Aggregate by skill name — multiple chunks may match the same skill
  const bySkill = new Map();
  for (const r of results) {
    const name = r.metadata?.name;
    if (!name) continue;
    if (!bySkill.has(name) || r.score > bySkill.get(name).score) {
      bySkill.set(name, { name, score: r.score, description: r.metadata?.description ?? '' });
    }
  }
  const recommended = [...bySkill.values()].sort((a, b) => b.score - a.score).slice(0, 10);

  if (recommended.length === 0) {
    process.stdout.write('  No matching skills found.\n');
    return [];
  }

  const installedSet = new Set(installedNames.map(n => n.toLowerCase()));

  // Show recommendations
  const choices = recommended.map(s => {
    const installed = installedSet.has(s.name.toLowerCase());
    const tag = installed ? ' (installed)' : '';
    return {
      label: s.name.padEnd(28) + `[${(s.score * 100).toFixed(0)}% match]${tag}`,
      description: s.description.slice(0, 60),
    };
  });

  const selected = await session.multiSelect(
    `► Top ${recommended.length} skills for your project:`,
    choices,
  );

  if (selected.length === 0) {
    process.stdout.write('  Skipped.\n');
    return installedNames;
  }

  // Install selected skills that aren't already installed
  const selectedNames = selected.map(i => recommended[i].name);
  const toInstall = selectedNames.filter(n => !installedSet.has(n.toLowerCase()));

  if (toInstall.length > 0) {
    process.stdout.write('\n► Installing skills...\n');
    for (const name of toInstall) {
      const result = installSkill(name);
      if (result === 'already-installed') {
        process.stdout.write(`  · ${name} (already installed)\n`);
      } else if (result === 'installed') {
        process.stdout.write(`  ✓ ${name}\n`);
      } else {
        process.stdout.write(`  ✗ ${name}: not found in any catalog\n`);
      }
    }
  }

  // Cleanup offer — if way over limit
  if (slotsUsed > SKILL_LIMIT && selectedNames.length > 0) {
    const toRemove = installedNames.filter(n => !selectedNames.includes(n));
    process.stdout.write(`\n  You have ${slotsUsed} skills but only need ~${selectedNames.length} for this project.\n\n`);
    process.stdout.write('  [C] Clean up — keep only recommended (remove ' + toRemove.length + ' others)\n');
    process.stdout.write('  [K] Keep all + add recommended\n');
    process.stdout.write('  [S] Skip — I\'ll handle it manually\n\n');
    const answer = await session.readText('  > ');
    const choice = answer.toLowerCase();

    if (choice === 'c') {
      process.stdout.write('\n  Cleaning up...\n');
      const fetcher = new SkillFetcher();
      let removed = 0;
      for (const name of toRemove) {
        fetcher.desyncFromClaudeSkills({ name });
        removed++;
      }
      process.stdout.write(`  ✓ Removed ${removed} skills. Kept ${selectedNames.length}.\n`);
    }
  }

  return selectedNames;
}

async function stepWriteConfigs(session, cwd, selectedAgents, skillNames) {
  if (selectedAgents.length === 0 || skillNames.length === 0) return;

  process.stdout.write('\n► Writing config files for your tools...\n');
  const initializer = new ProjectInitializer({ projectCwd: cwd });
  const target = selectedAgents.length === ALL_AGENTS.length ? 'all' : selectedAgents.join(',');

  try {
    const written = await initializer.init({ skills: skillNames, target, dryRun: false });
    if (written.length > 0) {
      for (const file of written) {
        process.stdout.write(`  ✓ ${file}\n`);
      }
    }
  } catch (err) {
    process.stdout.write(`  ⚠ ${err.message}\n`);
    process.stdout.write('  Run "booklib init --tool=claude" later to generate config files.\n');
  }

  const hasNonClaude = selectedAgents.some(a => a !== 'claude');
  if (hasNonClaude) {
    const mcp = await session.confirm('\n  Set up MCP server for live search from other tools?', false);
    if (mcp) {
      process.stdout.write('  Run: booklib mcp setup\n');
    }
  }
}

function printSummary(newSkillCount) {
  const slotsUsed = countInstalledSlots();

  console.log('');
  console.log('      ┌──────┬──────┐');
  console.log('      │      │      │  BookLib is ready');
  console.log('      └──────┴──────┘');
  console.log('');

  if (newSkillCount > 0) {
    process.stdout.write(`  ✓ ${newSkillCount} new skill(s) added\n`);
  }
  process.stdout.write(`  ✓ ${slotsUsed} skills loaded for your AI agent\n\n`);

  process.stdout.write(`  ${sep()}\n`);
  process.stdout.write('  Quick reference:\n\n');
  process.stdout.write('  booklib search "query"         find relevant patterns\n');
  process.stdout.write('  booklib search "q" --graph     include graph-linked skills\n');
  process.stdout.write('  booklib capture --title "..."   save a knowledge node\n');
  process.stdout.write('  booklib scan [dir]             project-wide analysis\n');
  process.stdout.write('  booklib audit <skill> <file>   deep-audit a file\n');
  process.stdout.write('  booklib doctor                 check skill health\n');
  process.stdout.write('  booklib list                   see installed skills\n');
  process.stdout.write('  booklib init --tool=cursor     add another AI tool\n');
  process.stdout.write(`  ${sep()}\n\n`);
}

// ── Re-run flow (already initialized) ────────────────────────────────────────

// Keep existing runRelevanceAudit unchanged — import cosine and getEmbeddings
// only for the re-run path to avoid loading them during first-run setup.
async function runRelevanceAudit(cwd) {
  const { cosine } = await import('./skill-recommender.js');
  const { getEmbeddings } = await import('./registry-embeddings.js');
  const { detect: detectProj } = await import('./project-detector.js');

  console.log('\n  BookLib — Relevance Check\n');

  const project = detectProj(cwd);
  const installedNames = listInstalledSkillNames();

  if (installedNames.length === 0) {
    console.log('  No BookLib-managed skills installed. Run "booklib init" to set up.');
    return;
  }

  process.stdout.write(`► Scoring ${installedNames.length} skill(s) against your project`);
  const dotInterval = setInterval(() => { process.stdout.write('.'); }, 300);

  const embeddings = await getEmbeddings();
  const searcher = new BookLibSearcher();
  const queryText = project.languages.map(l => `${l} programming`).join('. ') || 'software engineering';
  const queryVec = await searcher.getEmbedding(queryText);

  clearInterval(dotInterval);
  process.stdout.write('\n\n');

  const RELEVANCE_THRESHOLD = 0.35;
  const scored = installedNames
    .map(name => ({ name, score: embeddings.has(name) ? cosine(queryVec, embeddings.get(name)) : null }))
    .filter(s => s.score !== null)
    .sort((a, b) => b.score - a.score);

  const unindexedCount = installedNames.length - scored.length;
  if (unindexedCount > 0) {
    process.stdout.write(`  ${unindexedCount} skill(s) not yet indexed — run "booklib index" to score them\n\n`);
  }

  if (scored.length === 0) {
    process.stdout.write('  Nothing to score yet. Run "booklib index" first.\n\n');
    return;
  }

  const relevant = scored.filter(s => s.score >= RELEVANCE_THRESHOLD);
  const lowRelevance = scored.filter(s => s.score < RELEVANCE_THRESHOLD);

  for (const { name, score } of relevant.slice(0, 5)) {
    process.stdout.write(`  ✓ ${name.padEnd(30)} ${(score * 100).toFixed(0)}% match\n`);
  }
  if (relevant.length > 5) {
    process.stdout.write(`  … and ${relevant.length - 5} more relevant skill(s)\n`);
  }

  if (lowRelevance.length === 0) {
    process.stdout.write(`\n  All ${scored.length} scored skill(s) are relevant to this project.\n\n`);
    return;
  }

  process.stdout.write('\n  Low relevance for this project:\n');
  for (const { name, score } of lowRelevance.slice(0, 10)) {
    process.stdout.write(`  · ${name.padEnd(30)} ${(score * 100).toFixed(0)}% match\n`);
  }
  if (lowRelevance.length > 10) {
    process.stdout.write(`  … and ${lowRelevance.length - 10} more\n`);
  }

  process.stdout.write('\n  Tip: run "booklib uninstall <skill>" to free slots for more relevant skills.\n\n');
}
