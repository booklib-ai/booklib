// lib/wizard/index.js
import fs from 'fs';
import path from 'path';
import os from 'os';
import { confirm, multiSelect, progressBar, sep, readText } from './prompt.js';
import { detect as detectProject } from './project-detector.js';
import { recommend, SKILL_LIMIT } from './skill-recommender.js';
import { detectIntegrations } from './integration-detector.js';
import { SkillFetcher, countInstalledSlots, listInstalledSkillNames, installBundledSkill } from '../skill-fetcher.js';
import { BookLibIndexer } from '../engine/indexer.js';
import { cosine } from './skill-recommender.js';
import { getEmbeddings } from './registry-embeddings.js';
import { BookLibSearcher } from '../engine/searcher.js';
import { AgentDetector } from '../agent-detector.js';
import { ProjectInitializer } from '../project-initializer.js';
import { resolveBookLibPaths } from '../paths.js';

const RELEVANCE_THRESHOLD = 0.35;

/**
 * Main wizard entry point.
 * If already initialized, runs relevance audit instead of full setup.
 */
export async function runWizard(cwd = process.cwd()) {
  const markerPath = path.join(cwd, '.booklib', 'initialized');
  if (fs.existsSync(markerPath)) {
    return runRelevanceAudit(cwd);
  }
  return runSetup(cwd);
}

// ── Setup flow (first run) ────────────────────────────────────────────────────

async function runSetup(cwd) {
  console.log('\n  BookLib — Knowledge Setup Wizard\n');
  console.log(`  ${sep()}\n`);

  // Step 1: Project detection
  const project = await stepProjectDetection(cwd);

  // Step 2: Goal input → skill recommendations
  const { skills: recommendedSkills } = await stepSkillRecommendations(project);

  // Step 3: Skill selection + install
  const installedCount = await stepSkillSelection(recommendedSkills);

  // Step 4: Integrations
  await stepIntegrations(cwd);

  // Step 5: Index build
  await stepIndexBuild();

  // Step 6: Summary
  stepSummary(installedCount);

  // Mark as initialized
  const markerPath = path.join(cwd, '.booklib', 'initialized');
  fs.mkdirSync(path.dirname(markerPath), { recursive: true });
  fs.writeFileSync(markerPath, new Date().toISOString());
}

async function stepProjectDetection(cwd) {
  process.stdout.write('► Detecting project...\n');
  const project = detectProject(cwd);

  if (project.languages.length > 0) {
    const langs = project.languages.join(', ');
    const fw    = project.frameworks.length ? ` (${project.frameworks.join(', ')})` : '';
    process.stdout.write(`  Detected: ${langs}${fw}\n`);
    const ok = await confirm('  Is this correct?', true);
    if (!ok) {
      const answer = await readText('  Enter your tech stack (e.g. "Python FastAPI", "Kotlin Android"): ');
      return { languages: [answer], frameworks: [], signals: [] };
    }
  } else {
    process.stdout.write('  No language detected.\n');
    const answer = await readText('  What are you working on? (e.g. "Python backend", "Kotlin Android"): ');
    return { languages: [answer], frameworks: [], signals: [] };
  }

  return project;
}

async function stepSkillRecommendations(project) {
  process.stdout.write('\n► BookLib has 22+ skills covering code quality, architecture,\n');
  process.stdout.write('  and best practices from books like Effective Kotlin, Clean Code, etc.\n');
  const query = await readText('  Describe what you want to focus on (or Enter to auto-detect):\n  > ');

  const cacheExists = fs.existsSync(path.join(os.homedir(), '.booklib', 'registry-embeddings.json'));
  const loadMsg = cacheExists ? 'scanning skill catalog' : 'first run: building skill catalog (~30s)';
  process.stdout.write(`\n► Finding best skills for you (${loadMsg})`);

  const installedNames = listInstalledSkillNames();

  const dotInterval = setInterval(() => {
    process.stdout.write('.');
  }, 300);

  const skills = await recommend(query, {
    languages: project.languages,
    installedNames,
    slotsUsed: 0,
  });

  clearInterval(dotInterval);
  process.stdout.write('\n\n');

  return { skills, query };
}

async function stepSkillSelection(skills) {
  if (skills.length === 0) {
    process.stdout.write('  No new skills to recommend (slots full or catalog empty).\n');
    return 0;
  }

  const choices = skills.map(s => ({
    label: s.name.padEnd(28) + (s.score ? `[${(s.score * 100).toFixed(0)}% match]` : ''),
    description: s.description?.slice(0, 60),
  }));

  const selected = await multiSelect(
    `► Recommended skills for you: (${skills.length} available)`,
    choices,
  );

  if (selected.length === 0) {
    process.stdout.write('  Skipped skill installation.\n');
    return 0;
  }

  // Warn if approaching limit
  const slotsAfter = countInstalledSlots() + selected.length;
  if (selected.length > 0 && slotsAfter > SKILL_LIMIT) {
    process.stdout.write(`\n  ⚠  This would use ${slotsAfter}/${SKILL_LIMIT} slots. Some descriptions may be truncated.\n`);
    const ok = await confirm('  Continue?', false);
    if (!ok) return 0;
  }

  process.stdout.write('\n► Installing skills...\n');
  const fetcher = new SkillFetcher();
  let installed = 0;

  for (const idx of selected) {
    const skill = skills[idx];
    try {
      if (skill.source === 'bundled') {
        installBundledSkill(skill.name);
      } else if (skill.entry) {
        await fetcher.fetch(skill.entry, { onPrompt: async () => true });
      }
      process.stdout.write(`  ✓ ${skill.name}\n`);
      installed++;
    } catch (err) {
      process.stdout.write(`  ✗ ${skill.name}: ${err.message}\n`);
    }
  }

  return installed;
}

const AGENT_LABELS = {
  claude: 'Claude Code', cursor: 'Cursor', copilot: 'Copilot',
  gemini: 'Gemini CLI', codex: 'Codex', windsurf: 'Windsurf',
  'roo-code': 'Roo Code', openhands: 'OpenHands', junie: 'Junie',
  goose: 'Goose', opencode: 'OpenCode', letta: 'Letta',
};

const ALL_AGENTS = Object.keys(AGENT_LABELS);

async function stepIntegrations(cwd) {
  process.stdout.write('\n► Detecting AI tools in your environment...\n');

  const detector = new AgentDetector({ cwd });
  const detected = detector.detect();

  process.stdout.write(`  Found: ${detected.map(a => AGENT_LABELS[a] ?? a).join(', ')}\n`);

  let selectedAgents = detected;

  const addMore = await confirm('  Add more tools?', false);
  if (addMore) {
    const undetected = ALL_AGENTS.filter(a => !detected.includes(a));
    if (undetected.length > 0) {
      const choices = undetected.map(a => ({
        label: AGENT_LABELS[a] ?? a,
      }));
      const picked = await multiSelect('  Select additional tools:', choices);
      for (const idx of picked) {
        selectedAgents.push(undetected[idx]);
      }
    }
  }

  // Write context files for selected agents
  if (selectedAgents.length > 0) {
    process.stdout.write('\n► Writing config files for your tools...\n');
    const initializer = new ProjectInitializer({ projectCwd: cwd });
    const skills = initializer.detectRelevantSkills();
    if (skills.length > 0) {
      const target = selectedAgents.length === ALL_AGENTS.length ? 'all' : selectedAgents.join(',');
      try {
        const written = await initializer.init({ skills, target, dryRun: false });
        if (written.length > 0) {
          for (const file of written) {
            process.stdout.write(`  ✓ ${file}\n`);
          }
        } else {
          process.stdout.write('  (no config files needed — skills sync via ~/.claude/skills/)\n');
        }
      } catch (err) {
        process.stdout.write(`  ⚠ Config write failed: ${err.message}\n`);
      }
    } else {
      process.stdout.write('  (no skills detected yet — config files written after index build)\n');
    }

    // Save tool selection to config
    try {
      const { configPath } = resolveBookLibPaths(cwd);
      let savedConfig = {};
      try { savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch { /* no config yet */ }
      savedConfig.tools = selectedAgents;
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, JSON.stringify(savedConfig, null, 2));
    } catch { /* best-effort */ }
  }

  // MCP offer for non-Claude tools
  const hasNonClaude = selectedAgents.some(a => a !== 'claude');
  if (hasNonClaude) {
    const mcp = await confirm('\n  Set up MCP server for live search from other tools?', false);
    if (mcp) {
      process.stdout.write('  Run: booklib mcp setup\n  (do this after wizard completes)\n');
    }
  }

  // Note integrations
  const integrations = detectIntegrations({ cwd });
  if (integrations.superpowers) {
    process.stdout.write('  Detected: obra/superpowers plugin (skills auto-synced)\n');
  }
  if (integrations.ruflo) {
    process.stdout.write('  Detected: Ruflo framework (skills auto-synced)\n');
  }
}

async function stepIndexBuild() {
  process.stdout.write('\n► Building knowledge index...\n  ');
  const indexer = new BookLibIndexer();

  try {
    const { resolveBookLibPaths } = await import('../paths.js');
    const { skillsPath } = resolveBookLibPaths();
    let total = 0;
    try { total = fs.readdirSync(skillsPath).length; } catch { total = 50; }
    const bar = progressBar(total);
    await indexer.indexDirectory(skillsPath, false, { quiet: true });
    bar.done();
    process.stdout.write('  ✓ Index ready\n');
  } catch (err) {
    process.stdout.write(`\n  Index build failed: ${err.message}\n  Run "booklib index" manually to build it.\n`);
  }
}

function stepSummary(installedCount) {
  const slotsUsed = countInstalledSlots();
  const names     = listInstalledSkillNames();

  process.stdout.write(`\n  ${'═'.repeat(45)}\n`);
  process.stdout.write(`       BookLib is ready to use\n`);
  process.stdout.write(`  ${'═'.repeat(45)}\n\n`);
  process.stdout.write(`  ✓ ${installedCount} skills installed (${slotsUsed}/${SKILL_LIMIT} slots)\n`);
  for (const n of names) process.stdout.write(`    · ${n}\n`);
  process.stdout.write(`\n  ${'─'.repeat(45)}\n`);
  process.stdout.write(`  How to use BookLib day-to-day:\n\n`);
  process.stdout.write(`  Just work — Claude applies skills automatically\n\n`);
  process.stdout.write(`  booklib search "query"        → find patterns\n`);
  process.stdout.write(`  booklib search "q" --graph    → search with graph links\n`);
  process.stdout.write(`  booklib capture --title "..."  → save knowledge nodes\n`);
  process.stdout.write(`  booklib doctor                → check skill health\n`);
  process.stdout.write(`  booklib list                  → see what's installed\n`);
  process.stdout.write(`  ${'─'.repeat(45)}\n\n`);
}

// ── Re-run flow (already initialized) ─────────────────────────────────────────

async function runRelevanceAudit(cwd) {
  console.log('\n  BookLib — Relevance Check\n');

  const project        = detectProject(cwd);
  const installedNames = listInstalledSkillNames();

  if (installedNames.length === 0) {
    console.log('  No BookLib-managed skills installed. Run "booklib init" to set up.');
    return;
  }

  // Only audit skills that have embeddings — unindexed ones can't be scored
  process.stdout.write(`► Scoring ${installedNames.length} skill(s) against your project`);

  const dotInterval = setInterval(() => { process.stdout.write('.'); }, 300);

  const embeddings = await getEmbeddings();
  const searcher   = new BookLibSearcher();
  const queryText  = project.languages.map(l => `${l} programming`).join('. ') || 'software engineering';
  const queryVec   = await searcher.getEmbedding(queryText);

  clearInterval(dotInterval);
  process.stdout.write('\n\n');

  const scored = installedNames
    .map(name => ({ name, score: embeddings.has(name) ? cosine(queryVec, embeddings.get(name)) : null }))
    .filter(s => s.score !== null)                     // skip unindexed — not useful to show
    .sort((a, b) => b.score - a.score);

  const unindexedCount = installedNames.length - scored.length;
  if (unindexedCount > 0) {
    process.stdout.write(`  ${unindexedCount} skill(s) not yet indexed — run "booklib index" to score them\n\n`);
  }

  if (scored.length === 0) {
    process.stdout.write('  Nothing to score yet. Run "booklib index" first.\n\n');
    return;
  }

  const relevant    = scored.filter(s => s.score >= RELEVANCE_THRESHOLD);
  const lowRelevance = scored.filter(s => s.score < RELEVANCE_THRESHOLD);

  // Show top 5 relevant
  const topShow = relevant.slice(0, 5);
  for (const { name, score } of topShow) {
    process.stdout.write(`  ✓ ${name.padEnd(30)} ${(score * 100).toFixed(0)}% match\n`);
  }
  if (relevant.length > 5) {
    process.stdout.write(`  … and ${relevant.length - 5} more relevant skill(s)\n`);
  }

  if (lowRelevance.length === 0) {
    process.stdout.write(`\n  All ${scored.length} scored skill(s) are relevant to this project.\n\n`);
    return;
  }

  // Show low-relevance (max 10)
  process.stdout.write(`\n  Low relevance for this project:\n`);
  for (const { name, score } of lowRelevance.slice(0, 10)) {
    process.stdout.write(`  · ${name.padEnd(30)} ${(score * 100).toFixed(0)}% match\n`);
  }
  if (lowRelevance.length > 10) {
    process.stdout.write(`  … and ${lowRelevance.length - 10} more\n`);
  }

  // Non-destructive tip — never auto-remove
  process.stdout.write(`\n  Tip: run "booklib uninstall <skill>" to free slots for more relevant skills.\n\n`);
}
