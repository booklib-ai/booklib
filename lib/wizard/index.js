// lib/wizard/index.js
import fs from 'fs';
import path from 'path';
import os from 'os';
import { confirm, multiSelect, sep, readText } from './prompt.js';
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

const AGENT_LABELS = {
  claude: 'Claude Code', cursor: 'Cursor', copilot: 'Copilot',
  gemini: 'Gemini CLI', codex: 'Codex', windsurf: 'Windsurf',
  'roo-code': 'Roo Code', openhands: 'OpenHands', junie: 'Junie',
  goose: 'Goose', opencode: 'OpenCode', letta: 'Letta',
};
const ALL_AGENTS = Object.keys(AGENT_LABELS);

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
  const slotsUsed = countInstalledSlots();
  const installedNames = listInstalledSkillNames();
  const catalogSize = loadSkillCatalog().length;
  const totalSkills = catalogSize + installedNames.length;

  // Banner
  console.log('');
  console.log('  ┌─────────────────────────────────────────────┐');
  console.log('  │         BookLib — Setup Wizard               │');
  console.log('  │                                              │');
  console.log('  │   AI-agent skills from expert knowledge      │');
  console.log('  │   Code quality · Architecture · Security     │');
  console.log('  │   Testing · Design · DevOps · and more       │');
  console.log('  └─────────────────────────────────────────────┘');
  console.log('');

  if (slotsUsed > 0) {
    console.log(`  You already have ${slotsUsed} skills installed globally.`);
    console.log(`  This wizard will configure BookLib for this project.\n`);
  }

  // Step 1: What are you building?
  const project = await stepProjectDetection(cwd);

  // Step 2: Skill recommendations + selection
  const selectedSkills = await stepSkillRecommendation(project, installedNames);

  // Step 3: AI tool detection
  const selectedAgents = await stepToolSelection(cwd);

  // Step 4: Index build
  await stepIndexBuild();

  // Step 5: Write config files (after index, using selected/installed skills)
  const skillsForConfig = selectedSkills.length > 0 ? selectedSkills : installedNames.slice(0, 10);
  await stepWriteConfigs(cwd, selectedAgents, skillsForConfig);

  // Step 6: Summary
  stepSummary(selectedSkills.length);

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

async function stepSkillRecommendation(project, installedNames) {
  const cacheExists = fs.existsSync(path.join(os.homedir(), '.booklib', 'registry-embeddings.json'));
  const loadMsg = cacheExists ? 'matching skills to your project' : 'first run: building skill catalog (~30s)';
  process.stdout.write(`\n► ${loadMsg}`);

  const dotInterval = setInterval(() => { process.stdout.write('.'); }, 300);

  // Always recommend regardless of slot count — slots are informational, not blocking
  const skills = await recommend('', {
    languages: project.languages,
    installedNames,
    slotsUsed: 0,
  });

  clearInterval(dotInterval);
  process.stdout.write('\n\n');

  if (skills.length === 0) {
    if (installedNames.length > 0) {
      process.stdout.write(`  All ${installedNames.length} relevant skills are already installed.\n`);
      process.stdout.write('  Your AI agent can use them automatically.\n');
    } else {
      process.stdout.write('  No matching skills found in the catalog.\n');
    }
    return [];
  }

  // Show top 10 only
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
    process.stdout.write('  Skipped — install skills later with: booklib install <name>\n');
    return [];
  }

  process.stdout.write('\n► Installing skills...\n');
  const fetcher = new SkillFetcher();
  const installedSkillNames = [];

  for (const idx of selected) {
    const skill = topSkills[idx];
    try {
      if (skill.source === 'bundled') {
        installBundledSkill(skill.name);
      } else if (skill.entry) {
        await fetcher.fetch(skill.entry, { onPrompt: async () => true });
      } else {
        process.stdout.write(`  · ${skill.name} (available via search index)\n`);
        installedSkillNames.push(skill.name);
        continue;
      }
      process.stdout.write(`  ✓ ${skill.name}\n`);
      installedSkillNames.push(skill.name);
    } catch (err) {
      process.stdout.write(`  ✗ ${skill.name}: ${err.message}\n`);
    }
  }

  return installedSkillNames;
}

async function stepToolSelection(cwd) {
  process.stdout.write('\n► Which AI tools do you use?\n');

  const detector = new AgentDetector({ cwd });
  const detected = detector.detect();
  const detectedSet = new Set(detected);

  // Show all agents — mark detected ones
  process.stdout.write('\n');
  const undetected = ALL_AGENTS.filter(a => !detectedSet.has(a));
  for (const a of detected) {
    process.stdout.write(`  ✓ ${AGENT_LABELS[a]} (detected)\n`);
  }
  if (undetected.length > 0) {
    process.stdout.write('\n  Also available:\n');
    undetected.forEach((a, i) => {
      process.stdout.write(`  ${i + 1}. ${AGENT_LABELS[a]}\n`);
    });
    process.stdout.write(`\n  Enter numbers to add (e.g. 1,3) or press Enter to continue: `);
    const { createInterface } = await import('node:readline');
    const answer = await new Promise(resolve => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      rl.once('line', line => { rl.close(); resolve(line.trim()); });
      rl.once('close', () => resolve(''));
    });

    if (answer) {
      const picks = answer.split(',')
        .map(n => parseInt(n.trim(), 10) - 1)
        .filter(n => !isNaN(n) && n >= 0 && n < undetected.length);
      for (const idx of picks) {
        detected.push(undetected[idx]);
      }
    }
  }

  process.stdout.write(`\n  Selected: ${detected.map(a => AGENT_LABELS[a] ?? a).join(', ')}\n`);

  // Save tool selection to config
  try {
    const { configPath } = resolveBookLibPaths(cwd);
    let savedConfig = {};
    try { savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch { /* no config yet */ }
    savedConfig.tools = detected;
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(savedConfig, null, 2));
  } catch { /* best-effort */ }

  // Note integrations
  const integrations = detectIntegrations({ cwd });
  if (integrations.superpowers) {
    process.stdout.write('  Detected: obra/superpowers plugin (skills auto-synced)\n');
  }

  return detected;
}

async function stepIndexBuild() {
  process.stdout.write('\n► Building knowledge index (this may take a minute)...\n');
  const indexer = new BookLibIndexer();

  try {
    const { skillsPath } = resolveBookLibPaths();
    await indexer.indexDirectory(skillsPath, false, { quiet: true });
    process.stdout.write('  ✓ Index ready\n');
  } catch (err) {
    process.stdout.write(`  Index build failed: ${err.message}\n  Run "booklib index" manually.\n`);
  }
}

async function stepWriteConfigs(cwd, selectedAgents, skillNames) {
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

  // MCP offer for non-Claude tools
  const hasNonClaude = selectedAgents.some(a => a !== 'claude');
  if (hasNonClaude) {
    const mcp = await confirm('\n  Set up MCP server for live search from other tools?', false);
    if (mcp) {
      process.stdout.write('  Run: booklib mcp setup\n');
    }
  }
}

function stepSummary(newSkillCount) {
  const slotsUsed = countInstalledSlots();

  console.log('');
  console.log('  ┌─────────────────────────────────────────────┐');
  console.log('  │           BookLib is ready                   │');
  console.log('  └─────────────────────────────────────────────┘');
  console.log('');

  if (newSkillCount > 0) {
    process.stdout.write(`  ✓ ${newSkillCount} new skill(s) added\n`);
  }
  process.stdout.write(`  ✓ ${slotsUsed} total skills loaded for your AI agent\n\n`);

  process.stdout.write(`  ${sep()}\n`);
  process.stdout.write(`  Quick reference:\n\n`);
  process.stdout.write(`  booklib search "query"         find relevant patterns\n`);
  process.stdout.write(`  booklib search "q" --graph     include graph-linked skills\n`);
  process.stdout.write(`  booklib capture --title "..."   save a knowledge node\n`);
  process.stdout.write(`  booklib scan [dir]             project-wide analysis\n`);
  process.stdout.write(`  booklib audit <skill> <file>   deep-audit a file\n`);
  process.stdout.write(`  booklib doctor                 check skill health\n`);
  process.stdout.write(`  booklib list                   see installed skills\n`);
  process.stdout.write(`  booklib init --tool=cursor     add another AI tool\n`);
  process.stdout.write(`  ${sep()}\n\n`);
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

  const relevant    = scored.filter(s => s.score >= RELEVANCE_THRESHOLD);
  const lowRelevance = scored.filter(s => s.score < RELEVANCE_THRESHOLD);

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

  process.stdout.write(`\n  Low relevance for this project:\n`);
  for (const { name, score } of lowRelevance.slice(0, 10)) {
    process.stdout.write(`  · ${name.padEnd(30)} ${(score * 100).toFixed(0)}% match\n`);
  }
  if (lowRelevance.length > 10) {
    process.stdout.write(`  … and ${lowRelevance.length - 10} more\n`);
  }

  process.stdout.write(`\n  Tip: run "booklib uninstall <skill>" to free slots for more relevant skills.\n\n`);
}
