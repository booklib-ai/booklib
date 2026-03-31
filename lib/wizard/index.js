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
import { getEmbeddings, loadSkillCatalog } from './registry-embeddings.js';
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
  const catalogSize = loadSkillCatalog().length;

  console.log('\n  BookLib — Knowledge Setup Wizard\n');
  console.log(`  ${sep()}\n`);
  console.log(`  BookLib gives your AI agent access to ${catalogSize} curated skills`);
  console.log('  from books and guides on code quality, architecture, design,');
  console.log('  security, testing, and more.\n');

  // Step 1: What are you building? (single question, feeds into recommendations)
  const project = await stepProjectDetection(cwd);

  // Step 2: Skill recommendations + selection
  const installedCount = await stepSkillRecommendation(project);

  // Step 3: AI tool detection + config files
  const selectedAgents = await stepToolSelection(cwd);

  // Step 4: Index build
  await stepIndexBuild();

  // Step 5: Write config files (after index, so skills are detected)
  await stepWriteConfigs(cwd, selectedAgents);

  // Step 6: Summary
  stepSummary(installedCount);

  // Mark as initialized
  const markerPath = path.join(cwd, '.booklib', 'initialized');
  fs.mkdirSync(path.dirname(markerPath), { recursive: true });
  fs.writeFileSync(markerPath, new Date().toISOString());
}

async function stepProjectDetection(cwd) {
  process.stdout.write('► What are you building?\n');
  const project = detectProject(cwd);

  if (project.languages.length > 0) {
    const langs = project.languages.join(', ');
    const fw    = project.frameworks.length ? ` (${project.frameworks.join(', ')})` : '';
    process.stdout.write(`  Auto-detected: ${langs}${fw}\n`);
    const ok = await confirm('  Correct?', true);
    if (!ok) {
      const answer = await readText('  Describe your stack (e.g. "React + Node.js", "Kotlin Android"): ');
      return { languages: [answer], frameworks: [], signals: [] };
    }
  } else {
    const answer = await readText('  Describe your stack (e.g. "React + Node.js", "Kotlin Android"): ');
    return { languages: [answer], frameworks: [], signals: [] };
  }

  return project;
}

async function stepSkillRecommendation(project) {
  const cacheExists = fs.existsSync(path.join(os.homedir(), '.booklib', 'registry-embeddings.json'));
  const loadMsg = cacheExists ? 'matching skills to your project' : 'first run: building skill catalog (~30s)';
  process.stdout.write(`\n► ${loadMsg}`);

  const installedNames = listInstalledSkillNames();
  const slotsUsed = countInstalledSlots();

  const dotInterval = setInterval(() => { process.stdout.write('.'); }, 300);

  const skills = await recommend('', {
    languages: project.languages,
    installedNames,
    slotsUsed,
  });

  clearInterval(dotInterval);
  process.stdout.write('\n\n');

  if (skills.length === 0) {
    process.stdout.write('  No new skills to recommend.\n');
    return 0;
  }

  // Show top 10 only — don't overwhelm
  const showCount = Math.min(skills.length, 10);
  const topSkills = skills.slice(0, showCount);

  const choices = topSkills.map(s => ({
    label: s.name.padEnd(28) + (s.score ? `[${(s.score * 100).toFixed(0)}% match]` : ''),
    description: s.description?.slice(0, 60),
  }));

  const selected = await multiSelect(
    `► Top ${showCount} skills for your project:`,
    choices,
  );

  if (selected.length === 0) {
    process.stdout.write('  Skipped — you can install skills later with: booklib install <name>\n');
    return 0;
  }

  // Show slot info if user already has skills
  if (slotsUsed > 0) {
    const slotsAfter = slotsUsed + selected.length;
    process.stdout.write(`\n  Slots: ${slotsUsed} used + ${selected.length} new = ${slotsAfter}/${SKILL_LIMIT}\n`);
    if (slotsAfter > SKILL_LIMIT) {
      process.stdout.write('  (over limit — Claude will still load them but may truncate long descriptions)\n');
    }
  }

  process.stdout.write('\n► Installing skills...\n');
  const fetcher = new SkillFetcher();
  let installed = 0;

  for (const idx of selected) {
    const skill = topSkills[idx];
    try {
      if (skill.source === 'bundled') {
        installBundledSkill(skill.name);
      } else if (skill.entry) {
        await fetcher.fetch(skill.entry, { onPrompt: async () => true });
      } else {
        process.stdout.write(`  · ${skill.name} (already available via index)\n`);
        installed++;
        continue;
      }
      process.stdout.write(`  ✓ ${skill.name}\n`);
      installed++;
    } catch (err) {
      process.stdout.write(`  ✗ ${skill.name}: ${err.message}\n`);
    }
  }

  return installed;
}

async function stepToolSelection(cwd) {
  process.stdout.write('\n► Which AI tools do you use?\n');

  const detector = new AgentDetector({ cwd });
  const detected = detector.detect();

  const AGENT_LABELS = {
    claude: 'Claude Code', cursor: 'Cursor', copilot: 'Copilot',
    gemini: 'Gemini CLI', codex: 'Codex', windsurf: 'Windsurf',
    'roo-code': 'Roo Code', openhands: 'OpenHands', junie: 'Junie',
    goose: 'Goose', opencode: 'OpenCode', letta: 'Letta',
  };

  process.stdout.write(`  Auto-detected: ${detected.map(a => AGENT_LABELS[a] ?? a).join(', ')}\n`);

  let selectedAgents = [...detected];

  const ALL_AGENTS = Object.keys(AGENT_LABELS);
  const undetected = ALL_AGENTS.filter(a => !detected.includes(a));

  if (undetected.length > 0) {
    const addMore = await confirm('  Add more?', false);
    if (addMore) {
      const choices = undetected.map(a => ({ label: AGENT_LABELS[a] ?? a }));
      const picked = await multiSelect('  Select additional tools:', choices);
      for (const idx of picked) {
        selectedAgents.push(undetected[idx]);
      }
    }
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

  // Note integrations
  const integrations = detectIntegrations({ cwd });
  if (integrations.superpowers) {
    process.stdout.write('  Detected: obra/superpowers plugin (skills auto-synced)\n');
  }

  return selectedAgents;
}

async function stepIndexBuild() {
  process.stdout.write('\n► Building knowledge index...\n');
  const indexer = new BookLibIndexer();

  try {
    const { skillsPath } = resolveBookLibPaths();
    await indexer.indexDirectory(skillsPath, false, { quiet: true });
    process.stdout.write('  ✓ Index ready\n');
  } catch (err) {
    process.stdout.write(`  Index build failed: ${err.message}\n  Run "booklib index" manually.\n`);
  }
}

async function stepWriteConfigs(cwd, selectedAgents) {
  if (selectedAgents.length === 0) return;

  const AGENT_LABELS = {
    claude: 'Claude Code', cursor: 'Cursor', copilot: 'Copilot',
    gemini: 'Gemini CLI', codex: 'Codex', windsurf: 'Windsurf',
    'roo-code': 'Roo Code', openhands: 'OpenHands', junie: 'Junie',
    goose: 'Goose', opencode: 'OpenCode', letta: 'Letta',
  };
  const ALL_AGENTS = Object.keys(AGENT_LABELS);

  process.stdout.write('\n► Writing config files for your tools...\n');
  const initializer = new ProjectInitializer({ projectCwd: cwd });
  const skills = initializer.detectRelevantSkills();

  if (skills.length === 0) {
    process.stdout.write('  No project-specific skills detected — config files not needed yet.\n');
    process.stdout.write('  Run "booklib init --tool=claude" later to generate them.\n');
    return;
  }

  const target = selectedAgents.length === ALL_AGENTS.length ? 'all' : selectedAgents.join(',');
  try {
    const written = await initializer.init({ skills, target, dryRun: false });
    if (written.length > 0) {
      for (const file of written) {
        process.stdout.write(`  ✓ ${file}\n`);
      }
    }
  } catch (err) {
    process.stdout.write(`  ⚠ Config write failed: ${err.message}\n`);
  }

  // MCP offer for non-Claude tools
  const hasNonClaude = selectedAgents.some(a => a !== 'claude');
  if (hasNonClaude) {
    const mcp = await confirm('\n  Set up MCP server for live search from other tools?', false);
    if (mcp) {
      process.stdout.write('  Run: booklib mcp setup\n');
    }
  }
}

function stepSummary(installedCount) {
  const slotsUsed = countInstalledSlots();

  process.stdout.write(`\n  ${'═'.repeat(45)}\n`);
  process.stdout.write(`       BookLib is ready\n`);
  process.stdout.write(`  ${'═'.repeat(45)}\n\n`);

  if (installedCount > 0) {
    process.stdout.write(`  ✓ ${installedCount} new skill(s) added (${slotsUsed}/${SKILL_LIMIT} slots)\n`);
  }

  process.stdout.write(`\n  ${'─'.repeat(45)}\n`);
  process.stdout.write(`  Quick reference:\n\n`);
  process.stdout.write(`  booklib search "query"         find relevant patterns\n`);
  process.stdout.write(`  booklib search "q" --graph     include graph-linked skills\n`);
  process.stdout.write(`  booklib capture --title "..."   save a knowledge node\n`);
  process.stdout.write(`  booklib scan [dir]             project-wide analysis\n`);
  process.stdout.write(`  booklib audit <skill> <file>   deep-audit a file\n`);
  process.stdout.write(`  booklib doctor                 check skill health\n`);
  process.stdout.write(`  booklib list                   see installed skills\n`);
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
