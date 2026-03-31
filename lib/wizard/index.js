// lib/wizard/index.js
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createWizardUI, sep } from './prompt.js';
import { detect as detectProject } from './project-detector.js';
import { SKILL_LIMIT } from './skill-recommender.js';
import { detectIntegrations } from './integration-detector.js';
import { SkillFetcher, countAllSlots, countInstalledSlots, listInstalledSkillNames, installSkill } from '../skill-fetcher.js';
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

export async function runWizard(cwd = process.cwd(), opts = {}) {
  const markerPath = path.join(cwd, '.booklib', 'initialized');

  if (opts.reset) {
    if (fs.existsSync(markerPath)) fs.unlinkSync(markerPath);
    return runSetup(cwd);
  }

  if (fs.existsSync(markerPath)) {
    console.log('\n  Already initialized. Running relevance check...');
    console.log('  (to re-run full setup: rm -rf .booklib && booklib init)\n');
    return runRelevanceAudit(cwd);
  }
  return runSetup(cwd);
}

// ── Setup flow ───────────────────────────────────────────────────────────────

async function runSetup(cwd) {
  const ui = createWizardUI();

  // Banner
  console.log('');
  console.log('      \u250c\u2500\u2500\u2500\u2500\u2500\u2500\u252c\u2500\u2500\u2500\u2500\u2500\u2500\u2510 \u2726');
  console.log('      \u2502 \u2500\u2500\u2500  \u2502 \u2500\u2500\u2500  \u2502');
  console.log('      \u2502 \u2500\u2500   \u2502 \u2500\u2500   \u2502  BookLib');
  console.log('      \u2502 \u2500\u2500\u2500  \u2502 \u2500\u2500\u2500  \u2502');
  console.log('      \u2502 \u2500\u2500   \u2502 \u2500\u2500   \u2502  AI-agent skills from');
  console.log('      \u2502 \u2500\u2500\u2500  \u2502 \u2500\u2500\u2500  \u2502  expert knowledge');
  console.log('      \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2534\u2500\u2500\u2500\u2500\u2500\u2500\u2518');
  console.log('');

  ui.intro('Setup Wizard');

  // Step 1: Project detection
  const project = await stepProjectDetection(ui, cwd);

  // Step 2: Profile selection
  const profile = await stepProfileSelection(ui);

  // Save profile to config
  try {
    const { configPath } = resolveBookLibPaths(cwd);
    let savedConfig = {};
    try { savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch { /* no config */ }
    savedConfig.profile = profile;
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(savedConfig, null, 2));
  } catch { /* best-effort */ }

  // Step 3: Health check
  const slotsUsed = countAllSlots();
  const installedNames = listInstalledSkillNames();
  if (slotsUsed > SKILL_LIMIT) {
    ui.log.warn(
      `${slotsUsed} skills installed (limit: ${SKILL_LIMIT}).\n` +
      'Agent context is overloaded \u2014 most skills get truncated.\n' +
      'After indexing, I\'ll find the best skills for your stack and help clean up.'
    );
  }

  // Step 4: Tool detection
  const selectedAgents = await stepToolSelection(ui, cwd);

  // Step 5: Index build with spinner
  await stepIndexBuild(ui);

  // Step 6: Recommend + install + cleanup
  const selectedSkills = await stepRecommendAndInstall(ui, project, slotsUsed, installedNames);

  // Step 7: Write config files
  const skillsForConfig = selectedSkills.length > 0 ? selectedSkills : installedNames.slice(0, 10);
  const stack = project.languages.join(', ');
  await stepWriteConfigs(ui, cwd, selectedAgents, skillsForConfig, profile, stack);

  // Step 8: Summary
  ui.outro('BookLib is ready');

  const finalSlots = countInstalledSlots();
  console.log('');
  if (selectedSkills.length > 0) console.log(`  \u2713 ${selectedSkills.length} skills configured`);
  console.log(`  \u2713 ${finalSlots} total skills loaded`);
  console.log('');
  console.log(`  ${sep()}`);
  console.log('  Quick reference:');
  console.log('');
  console.log('  booklib search "query"         find patterns');
  console.log('  booklib search "q" --graph     include graph links');
  console.log('  booklib capture --title "..."   save knowledge');
  console.log('  booklib doctor                 health check');
  console.log('  booklib doctor --cure          auto-fix issues');
  console.log('  booklib init --reset           re-run setup');
  console.log(`  ${sep()}`);
  console.log('');

  // Mark initialized
  const markerPath = path.join(cwd, '.booklib', 'initialized');
  fs.mkdirSync(path.dirname(markerPath), { recursive: true });
  fs.writeFileSync(markerPath, new Date().toISOString());
}

async function stepProjectDetection(ui, cwd) {
  const project = detectProject(cwd);

  if (project.languages.length > 0) {
    const langs = project.languages.join(', ');
    const fw = project.frameworks.length ? ` (${project.frameworks.join(', ')})` : '';
    const ok = await ui.confirm(`Detected: ${langs}${fw}. Correct?`, true);
    if (!ok) {
      const answer = await ui.text('Describe your stack:', 'e.g. React + Node.js, Kotlin Android');
      return { languages: [answer], frameworks: [], signals: [] };
    }
  } else {
    const answer = await ui.text('What are you building?', 'e.g. React + Node.js, Kotlin Android');
    return { languages: [answer], frameworks: [], signals: [] };
  }

  return project;
}

async function stepProfileSelection(ui) {
  const profile = await ui.select('What kind of work is this project for?', [
    { value: 'software-development', label: 'Software development', hint: 'recommended' },
    { value: 'writing-content', label: 'Writing & content' },
    { value: 'research-analysis', label: 'Research & analysis' },
    { value: 'design', label: 'Design' },
    { value: 'general', label: 'General / other' },
  ]);
  return profile;
}

async function stepToolSelection(ui, cwd) {
  const detector = new AgentDetector({ cwd });
  const detected = detector.detect();
  const detectedSet = new Set(detected);

  const options = ALL_AGENTS.map(a => ({
    value: a,
    label: AGENT_LABELS[a],
    hint: detectedSet.has(a) ? 'detected' : undefined,
  }));

  const selected = await ui.multiselect('Which AI tools do you use?', options, {
    initialValues: detected,
  });

  // Save to config
  try {
    const { configPath } = resolveBookLibPaths(cwd);
    let savedConfig = {};
    try { savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch { /* no config */ }
    savedConfig.tools = selected;
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(savedConfig, null, 2));
  } catch { /* best-effort */ }

  const integrations = detectIntegrations({ cwd });
  if (integrations.superpowers) {
    ui.log.info('Detected: obra/superpowers plugin (skills auto-synced)');
  }

  return selected;
}

async function stepIndexBuild(ui) {
  const s = ui.spinner();
  s.start('Building knowledge index...');
  const indexer = new BookLibIndexer();

  try {
    const { skillsPath } = resolveBookLibPaths();
    let lastFile = '';
    await indexer.indexDirectory(skillsPath, false, {
      quiet: true,
      onProgress({ current, total, file }) {
        lastFile = file.split('/')[0] ?? file;
        s.message(`Building knowledge index... [${current}/${total}] ${lastFile}`);
      },
    });
    s.stop('Index ready');
  } catch (err) {
    s.stop(`Index build failed: ${err.message}`);
  }
}

async function stepRecommendAndInstall(ui, project, slotsUsed, installedNames) {
  const s = ui.spinner();
  s.start('Finding best skills for your project...');

  const searcher = new BookLibSearcher();
  const queryText = project.languages.join(' ') + ' best practices';
  let results;
  try {
    results = await searcher.search(queryText, 20, 0);
  } catch {
    s.stop('Search index not available');
    return [];
  }

  const bySkill = new Map();
  for (const r of results) {
    const name = r.metadata?.name;
    if (!name) continue;
    if (!bySkill.has(name) || r.score > bySkill.get(name).score) {
      const snippet = (r.text ?? '').replace(/\n/g, ' ').slice(0, 80).trim();
      bySkill.set(name, { name, score: r.score, displayScore: r.displayScore, snippet, description: r.metadata?.description ?? '' });
    }
  }
  const recommended = [...bySkill.values()].sort((a, b) => b.score - a.score).slice(0, 10);
  s.stop(`Found ${recommended.length} matching skills`);

  if (recommended.length === 0) return [];

  const installedSet = new Set(installedNames.map(n => n.toLowerCase()));

  const options = recommended.map(sk => ({
    value: sk.name,
    label: `${sk.name} [${sk.displayScore ?? Math.round((sk.score ?? 0) * 100)}%]`,
    hint: installedSet.has(sk.name.toLowerCase()) ? 'installed' : (sk.snippet || sk.description.slice(0, 50)),
  }));

  const selected = await ui.multiselect('Top skills for your project:', options);

  if (selected.length === 0) return installedNames;

  // Install selected skills
  const toInstall = selected.filter(n => !installedSet.has(n.toLowerCase()));
  const installed = [];

  for (const name of selected) {
    if (installedSet.has(name.toLowerCase())) {
      ui.log.info(`${name} (already installed)`);
      installed.push(name);
    } else {
      const result = installSkill(name);
      if (result === 'installed') {
        ui.log.success(`${name}`);
        installed.push(name);
      } else if (result === 'already-installed') {
        ui.log.info(`${name} (already installed)`);
        installed.push(name);
      } else {
        ui.log.warn(`${name}: not found in any catalog`);
      }
    }
  }

  // Cleanup offer
  if (slotsUsed > SKILL_LIMIT && installed.length > 0) {
    const toRemove = installedNames.filter(n => !selected.includes(n));
    const cleanup = await ui.select(`You have ${slotsUsed} skills but only need ~${installed.length}.`, [
      { value: 'clean', label: `Clean up \u2014 keep only recommended (remove ${toRemove.length})` },
      { value: 'keep', label: 'Keep all + add recommended' },
      { value: 'skip', label: 'Skip \u2014 I\'ll handle it manually' },
    ]);

    if (cleanup === 'clean') {
      const fetcher = new SkillFetcher();
      let removed = 0;
      for (const name of toRemove) {
        fetcher.desyncFromClaudeSkills({ name });
        removed++;
      }
      ui.log.success(`Removed ${removed} skills. Kept ${installed.length}.`);
    }
  }

  return installed;
}

async function stepWriteConfigs(ui, cwd, selectedAgents, skillNames, profile, stack) {
  if (selectedAgents.length === 0 || skillNames.length === 0) return;

  const s = ui.spinner();
  s.start('Writing config files...');

  const initializer = new ProjectInitializer({ projectCwd: cwd });
  const target = selectedAgents.length === ALL_AGENTS.length ? 'all' : selectedAgents.join(',');

  try {
    const written = await initializer.init({ skills: skillNames, target, dryRun: false, quiet: true, profile, stack });
    if (written.length > 0) {
      s.stop('Config files written');
      for (const file of written) {
        ui.log.success(file);
      }
    } else {
      s.stop('No config files needed');
    }
  } catch (err) {
    s.stop(`Config write failed: ${err.message}`);
  }
}

// ── Re-run flow (already initialized) ────────────────────────────────────────

async function runRelevanceAudit(cwd) {
  const { cosine } = await import('./skill-recommender.js');
  const { getEmbeddings } = await import('./registry-embeddings.js');
  const { detect: detectProj } = await import('./project-detector.js');

  console.log('\n  BookLib \u2014 Relevance Check\n');

  const project = detectProj(cwd);
  const installedNames = listInstalledSkillNames();

  if (installedNames.length === 0) {
    console.log('  No BookLib-managed skills installed. Run "booklib init" to set up.');
    return;
  }

  process.stdout.write(`\u25ba Scoring ${installedNames.length} skill(s) against your project`);
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
    process.stdout.write(`  ${unindexedCount} skill(s) not yet indexed \u2014 run "booklib index" to score them\n\n`);
  }

  if (scored.length === 0) {
    process.stdout.write('  Nothing to score yet. Run "booklib index" first.\n\n');
    return;
  }

  const relevant = scored.filter(s => s.score >= RELEVANCE_THRESHOLD);
  const lowRelevance = scored.filter(s => s.score < RELEVANCE_THRESHOLD);

  for (const { name, score } of relevant.slice(0, 5)) {
    process.stdout.write(`  \u2713 ${name.padEnd(30)} ${(score * 100).toFixed(0)}% match\n`);
  }
  if (relevant.length > 5) {
    process.stdout.write(`  \u2026 and ${relevant.length - 5} more relevant skill(s)\n`);
  }

  if (lowRelevance.length === 0) {
    process.stdout.write(`\n  All ${scored.length} scored skill(s) are relevant to this project.\n\n`);
    return;
  }

  process.stdout.write('\n  Low relevance for this project:\n');
  for (const { name, score } of lowRelevance.slice(0, 10)) {
    process.stdout.write(`  \u00b7 ${name.padEnd(30)} ${(score * 100).toFixed(0)}% match\n`);
  }
  if (lowRelevance.length > 10) {
    process.stdout.write(`  \u2026 and ${lowRelevance.length - 10} more\n`);
  }

  process.stdout.write('\n  Tip: run "booklib uninstall <skill>" to free slots for more relevant skills.\n\n');
}
