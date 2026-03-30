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

const MARKER_PATH  = path.join(os.homedir(), '.booklib', 'initialized');
const RELEVANCE_THRESHOLD = 0.35;

/**
 * Main wizard entry point.
 * If already initialized, runs relevance audit instead of full setup.
 */
export async function runWizard(cwd = process.cwd()) {
  if (fs.existsSync(MARKER_PATH)) {
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
  fs.mkdirSync(path.dirname(MARKER_PATH), { recursive: true });
  fs.writeFileSync(MARKER_PATH, new Date().toISOString());
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
  const query = await readText('\n► What do you want to improve? (free text, or Enter to skip)\n  > ');

  process.stdout.write('\n► Finding best skills for you');

  const slotsUsed = countInstalledSlots();
  const installedNames = listInstalledSkillNames();
  const available = SKILL_LIMIT - slotsUsed;

  const dotInterval = setInterval(() => {
    process.stdout.write('.');
  }, 300);

  const skills = await recommend(query, {
    languages: project.languages,
    installedNames,
    slotsUsed,
  });

  clearInterval(dotInterval);
  process.stdout.write(`\n\n  ${available} slots available (${slotsUsed}/${SKILL_LIMIT} used)\n`);

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
  if (slotsAfter > SKILL_LIMIT) {
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

async function stepIntegrations(cwd) {
  process.stdout.write('\n► Checking your environment...\n');
  const integrations = detectIntegrations({ cwd });

  if (integrations.superpowers) {
    process.stdout.write('  Detected: obra/superpowers plugin\n');
    await confirm('  → Skills are already synced to ~/.claude/skills/ — superpowers can access them. OK?', true);
  }

  if (integrations.ruflo) {
    process.stdout.write('  Detected: Ruflo framework\n');
    await confirm('  → Skills synced to ~/.claude/skills/ — Ruflo agents can access them. OK?', true);
  }

  process.stdout.write('\n  Other AI tools (Cursor, Gemini, Zed)?\n');
  const mcp = await confirm('  → Set up MCP server so they can query BookLib mid-conversation?', false);
  if (mcp) {
    process.stdout.write('\n  Run: booklib mcp setup\n  (MCP setup requires a running server — do this after wizard completes)\n');
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
    await indexer.indexDirectory(skillsPath);
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
  process.stdout.write(`  booklib search "query"   → find patterns manually\n`);
  process.stdout.write(`  booklib doctor           → check skill health\n`);
  process.stdout.write(`  booklib install <skill>  → add a skill\n`);
  process.stdout.write(`  booklib list             → see what's installed\n`);
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

  process.stdout.write(`► Checking ${installedNames.length} installed skills against your project`);

  const dotInterval = setInterval(() => { process.stdout.write('.'); }, 300);

  const embeddings = await getEmbeddings();
  const searcher   = new BookLibSearcher();
  const queryText  = project.languages.map(l => `${l} programming`).join('. ') || 'software engineering';
  const queryVec   = await searcher.getEmbedding(queryText);

  clearInterval(dotInterval);
  process.stdout.write('\n\n');

  const scored = installedNames.map(name => {
    const vec = embeddings.get(name);
    return { name, score: vec ? cosine(queryVec, vec) : null };
  }).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  const lowRelevance = [];
  for (const { name, score } of scored) {
    if (score === null) {
      process.stdout.write(`  ? ${name.padEnd(30)} (no embedding — run booklib index)\n`);
    } else if (score < RELEVANCE_THRESHOLD) {
      process.stdout.write(`  ⚠ ${name.padEnd(30)} score: ${(score * 100).toFixed(0)}% — low relevance\n`);
      lowRelevance.push(name);
    } else {
      process.stdout.write(`  ✓ ${name.padEnd(30)} score: ${(score * 100).toFixed(0)}%\n`);
    }
  }

  const slotsUsed  = countInstalledSlots();
  const slotsAfter = slotsUsed - lowRelevance.length;
  const available  = SKILL_LIMIT - slotsAfter;

  if (lowRelevance.length === 0) {
    process.stdout.write(`\n  All skills are relevant. ${slotsUsed}/${SKILL_LIMIT} slots used.\n\n`);
    return;
  }

  process.stdout.write(`\n  ${lowRelevance.length} low-relevance skill(s) found. Removing frees ${available} slots.\n`);

  // Recommend replacements for freed slots
  const recommendations = await recommend('', {
    languages: project.languages,
    installedNames,
    slotsUsed: slotsAfter,
  });

  if (recommendations.length > 0) {
    process.stdout.write(`\n  Top ${Math.min(available, recommendations.length)} replacements:\n`);
    recommendations.slice(0, Math.min(available, 6)).forEach((s, i) => {
      process.stdout.write(`   ${i + 1}. ${s.name.padEnd(28)} ${(s.score * 100).toFixed(0)}% match\n`);
    });
  }

  process.stdout.write('\n');
  const apply = await confirm(`  Remove ${lowRelevance.join(', ')} and install ${recommendations.slice(0, available).length} replacements?`, true);

  if (!apply) {
    process.stdout.write('  No changes made. Run "booklib uninstall <skill>" to manage manually.\n\n');
    return;
  }

  // Remove low-relevance
  const fetcher = new SkillFetcher();
  for (const name of lowRelevance) {
    fetcher.desyncFromClaudeSkills({ name });
    process.stdout.write(`  ✓ Removed ${name}\n`);
  }

  // Install replacements
  await stepSkillSelection(recommendations.slice(0, available));
  process.stdout.write('\n  Done.\n\n');
}
