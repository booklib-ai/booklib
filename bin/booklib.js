#!/usr/bin/env node

import path from 'path';
import fs from 'fs';
import os from 'os';
import { createInterface } from 'node:readline';
import { BookLibIndexer } from '../lib/engine/indexer.js';
import { BookLibSearcher } from '../lib/engine/searcher.js';
import { BookLibHandoff } from '../lib/engine/handoff.js';
import { BookLibAuditor } from '../lib/engine/auditor.js';
import { BookLibRegistrySearcher } from '../lib/registry-searcher.js';
import { BookLibInstaller } from '../lib/installer.js';
import { BookLibSynthesizer } from '../lib/engine/synthesizer.js';
import { BookLibScanner } from '../lib/engine/scanner.js';
import { BookLibSessionCoordinator } from '../lib/engine/session-coordinator.js';
import { BookLibSessionManager } from '../lib/engine/session-manager.js';
import { BookLibAIFeatures } from '../lib/engine/ai-features.js';
import { resolveBookLibPaths } from '../lib/paths.js';
import { SkillFetcher, RequiresConfirmationError, listInstalledSkillNames, countInstalledSlots } from '../lib/skill-fetcher.js';
import { runWizard } from '../lib/wizard/index.js';
import { SKILL_LIMIT } from '../lib/wizard/skill-recommender.js';
import {
  generateNodeId, serializeNode, saveNode, loadNode,
  listNodes, appendEdge, parseNodeFrontmatter, resolveKnowledgePaths,
  resolveNodeRef, EDGE_TYPES,
} from '../lib/engine/graph.js';
import { DiscoveryEngine } from '../lib/discovery-engine.js';
import { ProjectInitializer } from '../lib/project-initializer.js';
import { ContextBuilder } from '../lib/context-builder.js';
import {
  buildDictatePrompt, buildSummarizePrompt, callAnthropicAPI,
  openEditor, readStdin, readInteractive,
} from '../lib/engine/capture.js';
import { readUsage, summarize } from '../lib/doctor/usage-tracker.js';
import { installTrackingHook } from '../lib/doctor/hook-installer.js';
import { listAvailable as listAvailableRules, installRule as installRuleFn, status as rulesStatus } from '../lib/rules/rules-manager.js';

const args = process.argv.slice(2);
const command = args[0];

function parseFlag(args, flag) {
  const long = args.find(a => a.startsWith(`--${flag}=`))?.replace(`--${flag}=`, '');
  if (long !== undefined) return long;
  const idx = args.indexOf(`--${flag}`);
  return idx !== -1 ? args[idx + 1] : null;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Auto-index a freshly saved node so it's immediately searchable. Silently skips on error. */
async function autoIndexNode(filePath) {
  const { nodesDir } = resolveKnowledgePaths();
  try {
    const indexer = new BookLibIndexer();
    await indexer.indexNodeFile(filePath, nodesDir);
  } catch {
    // Index may not exist yet — user can run `booklib index` to build it
  }
}


const TOOL_MENU = [
  { num: 1, name: 'Claude Code', target: 'claude',   file: 'CLAUDE.md' },
  { num: 2, name: 'Cursor',      target: 'cursor',   file: '.cursor/rules/' },
  { num: 3, name: 'Copilot',     target: 'copilot',  file: '.github/copilot-instructions.md' },
  { num: 4, name: 'Gemini CLI',  target: 'gemini',   file: '.gemini/context.md' },
  { num: 5, name: 'Codex',       target: 'codex',    file: 'AGENTS.md' },
  { num: 6, name: 'Windsurf',    target: 'windsurf', file: '.windsurfrules' },
  { num: 7, name: 'All',         target: 'all',      file: null },
];

const MCP_TOOL_MENU = [
  { num: 1, name: 'Claude Code', target: 'claude',   file: '.claude/settings.json' },
  { num: 2, name: 'Cursor',      target: 'cursor',   file: '.cursor/mcp.json' },
  { num: 3, name: 'Gemini CLI',  target: 'gemini',   file: '.gemini/settings.json' },
  { num: 4, name: 'Codex',       target: 'codex',    file: '.codex/config.toml' },
  { num: 5, name: 'Zed',         target: 'zed',      file: '.zed/settings.json' },
  { num: 6, name: 'Continue',    target: 'continue', file: '.continue/mcpServers/booklib.yaml' },
  { num: 7, name: 'All of the above', target: 'all', file: null },
];

async function promptToolSelection() {
  process.stdout.write('\nWhich AI tool do you use?\n\n');
  for (const t of TOOL_MENU) {
    const fileInfo = t.file ? `  → ${t.file}` : '';
    process.stdout.write(`  ${t.num}) ${t.name.padEnd(12)}${fileInfo}\n`);
  }
  process.stdout.write('\nSelect [1-7, or comma-separated for multiple]: ');

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise(resolve => {
    rl.once('line', line => { rl.close(); resolve(line.trim()); });
  });

  if (!answer) return 'all';
  const nums = answer.split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n));
  if (nums.length === 0 || nums.includes(7)) return 'all';
  const selected = nums.map(n => TOOL_MENU.find(t => t.num === n)?.target).filter(Boolean);
  return selected.length > 0 ? selected.join(',') : 'all';
}

async function promptMcpToolSelection() {
  const SEP = '━'.repeat(51);
  process.stdout.write(`\n${SEP}\n  MCP Server Setup\n${SEP}\n\n`);
  process.stdout.write('  BookLib has an MCP server — your AI tools can call it\n');
  process.stdout.write('  directly to search knowledge, fetch context, and create\n');
  process.stdout.write('  notes without leaving the conversation.\n\n');
  process.stdout.write('  Wire up the MCP server? (Y/n): ');

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const yn = await new Promise(resolve => {
    rl.once('line', line => { rl.close(); resolve(line.trim().toLowerCase()); });
  });
  if (yn === 'n' || yn === 'no') return null;

  process.stdout.write('\n  Which tools should I configure? (select all that apply)\n\n');
  for (const t of MCP_TOOL_MENU) {
    const fileInfo = t.file ? `  → ${t.file}` : '';
    process.stdout.write(`  ${t.num}. ${t.name.padEnd(18)}${fileInfo}\n`);
  }
  process.stdout.write('\n  Enter numbers separated by commas (1,2,5) or 7 for all: ');

  const rl2 = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise(resolve => {
    rl2.once('line', line => { rl2.close(); resolve(line.trim()); });
  });

  if (!answer) return 'all';
  const nums = answer.split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n));
  if (nums.length === 0 || nums.includes(7)) return 'all';
  const selected = nums.map(n => MCP_TOOL_MENU.find(t => t.num === n)?.target).filter(Boolean);
  return selected.length > 0 ? selected.join(',') : 'all';
}

async function main() {
  switch (command) {
    case 'index': {
      const { skillsPath, cachePath } = resolveBookLibPaths();
      const targetDir = args[1] && !args[1].startsWith('--') ? args[1] : skillsPath;
      const indexer = new BookLibIndexer();
      // Always clear first so stale chunks don't accumulate on rebuild
      await indexer.indexDirectory(targetDir, true);
      // Also include fetched community skills when present
      const communitySkillsDir = path.join(cachePath, 'skills');
      if (fs.existsSync(communitySkillsDir)) {
        const communityCount = fs.readdirSync(communitySkillsDir).length;
        if (communityCount > 0) {
          console.log(`Indexing ${communityCount} community skill(s) from ${communitySkillsDir}...`);
          await indexer.indexDirectory(communitySkillsDir, false);
        }
      }
      // Index knowledge nodes from .booklib/knowledge/nodes/
      const { resolveKnowledgePaths } = await import('../lib/engine/graph.js');
      const { nodesDir } = resolveKnowledgePaths();
      await indexer.indexKnowledgeNodes(nodesDir);
      console.log('✅ Index built');
      break;
    }

    case 'search': {
      const autoFetch = args.includes('--auto-fetch');
      const roleFilter = (args.find(a => a.startsWith('--role=')) ?? '').replace('--role=', '') || null;
      const query = args.slice(1).filter(a => !a.startsWith('--')).join(' ');
      if (!query) { console.error('Usage: booklib search "<query>" [--auto-fetch] [--role=<role>]'); process.exit(1); }

      const regSearcher = new BookLibRegistrySearcher();
      let { local, suggested, conflicts } = await regSearcher.searchHybrid(query);

      // Role filter — narrow results to skills tagged for the requested agent role
      if (roleFilter) {
        const roleMatch = s => !s.roles || s.roles.includes(roleFilter);
        local     = local.filter(r => roleMatch(r.metadata ?? r));
        suggested = suggested.filter(roleMatch);
        if (local.length === 0 && suggested.length === 0) {
          console.log(`No results for "${query}" in role "${roleFilter}". Try without --role to see all matches.`);
          break;
        }
      }

      // Auto-fetch: silently fetch trusted suggestions and re-search
      if (autoFetch && suggested.length > 0) {
        const trustedSuggestions = suggested.filter(s => s.trusted);
        if (trustedSuggestions.length > 0) {
          const fetcher = new SkillFetcher();
          for (const skill of trustedSuggestions) {
            if (!fetcher.isCached(skill)) {
              process.stderr.write(`[booklib] Fetching ${skill.name}...\n`);
              try { await fetcher.fetch(skill); } catch { /* non-fatal */ }
            }
          }
          // Re-index and re-search with newly fetched skills
          const { cachePath } = resolveBookLibPaths();
          const indexer = new BookLibIndexer();
          await indexer.indexDirectory(path.join(cachePath, 'skills'));
          ({ local, suggested, conflicts } = await regSearcher.searchHybrid(query));
        }
      }

      if (local.length > 0) {
        console.log('\n📚 Local results:\n');
        local.forEach(r => {
          const rationale = r._rationale ? `  ↳ ${r._rationale}` : '';
          const isNode = r.metadata?.nodeKind === 'knowledge';
          const label = isNode
            ? `📝 ${r.metadata?.title ?? r.metadata?.filePath ?? '?'} [${r.metadata?.type ?? 'note'}]`
            : `📚 ${r.metadata?.name ?? r.metadata?.filePath ?? '?'} (${r.metadata?.type ?? 'chunk'})`;
          console.log(`  [${r.score?.toFixed(2)}] ${label}`);
          if (rationale) console.log(rationale);
        });
      }
      if (suggested.length > 0) {
        console.log('\n💡 Community skills available (not yet indexed):');
        suggested.forEach(s => {
          const stars = s.stars ? ` ★${s.stars.toLocaleString()}` : '';
          const rationale = s._rationale ? `\n     ↳ ${s._rationale}` : '';
          console.log(`  • ${s.name}${stars} — ${s.description}${rationale}`);
        });
        if (!autoFetch) console.log('\nTip: run with --auto-fetch to install and search in one step');
      }
      if ((conflicts ?? []).length > 0) {
        console.log('\n⚠️  Conflicts — your input needed:');
        conflicts.forEach(c => console.log(`  ? ${c.message}`));
      }
      if (local.length === 0 && suggested.length === 0) {
        console.log('No results found.');
      }
      break;
    }

    case 'audit': {
      const auditor = new BookLibAuditor();
      const skillName = args[1];
      const filePath = args[2];
      if (!skillName || !filePath) { console.error('Usage: booklib audit <skill-name> <file-path>'); process.exit(1); }
      const { skillsPath } = resolveBookLibPaths();
      const skillPath = path.join(skillsPath, skillName);
      const report = await auditor.audit(skillPath, filePath);
      console.log(report);
      break;
    }

    case 'scan': {
      const scanner = new BookLibScanner();
      const docsMode = args.includes('--docs');
      const scanDir = args.filter(a => !a.startsWith('--'))[1] || process.cwd();
      const report = await scanner.scan(scanDir, { mode: docsMode ? 'docs' : 'code' });
      console.log(report);
      break;
    }

    case 'context': {
      const promptOnly = args.includes('--prompt-only');
      const task = args.slice(1).filter(a => !a.startsWith('--')).join(' ');
      if (!task) {
        console.error('Usage: booklib context "<task description>" [--prompt-only] [--file=<path>] [--no-graph]');
        console.error('Example: booklib context "implement a payment service in Kotlin with async error handling"');
        process.exit(1);
      }
      const builder = new ContextBuilder();
      const useGraph = !args.includes('--no-graph') && !promptOnly;
      const fileArg = parseFlag(args, 'file');
      const result = useGraph
        ? await builder.buildWithGraph(task, fileArg)
        : await builder.build(task, { promptOnly });
      console.log(result);

      if (fileArg && useGraph && !result.includes('## Knowledge Graph Context')) {
        process.stderr.write(
          `\nTip: no component is mapped to "${fileArg}".\n` +
          `  To enable graph context injection: booklib component add <name> "<glob>"\n` +
          `  Example: booklib component add auth "src/auth/**"\n`
        );
      }
      break;
    }

    case 'save-state': {
      const handoff = new BookLibHandoff();
      const parsed = {};
      args.slice(1).forEach(a => {
        const [k, ...v] = a.replace('--', '').split('=');
        if (k && v.length) parsed[k] = v.join('=');
      });
      handoff.saveState(parsed);
      break;
    }

    case 'resume': {
      const handoff = new BookLibHandoff();
      console.log(handoff.resume(args[1]));
      break;
    }

    case 'recover-auto': {
      const handoff = new BookLibHandoff();
      console.log(handoff.recoverFromSessionOrGit());
      break;
    }

    case 'sessions': {
      const mgr = new BookLibSessionManager(process.cwd());
      const subCmd = args[1];

      if (subCmd === 'cleanup') {
        const beforeDays = parseInt(args[2]?.split('=')[1]) || 90;
        const result = mgr.cleanupSessions({ beforeDays, archive: true });
        console.log(`✅ Archived ${result.archived} sessions, deleted ${result.deleted}`);
        console.log(`Preview: ${JSON.stringify(result.preview.slice(0, 3), null, 2)}`);
      } else if (subCmd === 'diff') {
        const diff = mgr.diffSessions(args[2], args[3]);
        if (diff.error) console.error(diff.error);
        else {
          console.log(`\n📊 Comparing: ${diff.session1} vs ${diff.session2}`);
          console.log(`\nGoal Changed: ${diff.goal.changed}`);
          console.log(`  ${diff.session1}: ${diff.goal.s1}`);
          console.log(`  ${diff.session2}: ${diff.goal.s2}`);
          console.log(`\nConflicting Tasks: ${diff.tasks.conflicts.length}`);
          diff.tasks.conflicts.forEach(t => console.log(`  ⚠️  ${t}`));
          console.log(`\nNew Skills: ${diff.skills.added.join(', ') || 'none'}`);
        }
      } else if (subCmd === 'find') {
        const result = mgr.findSession(args[2], { searchGlobal: true });
        if (result) {
          console.log(`✅ Found: ${result.path} (${result.scope})`);
        } else {
          console.log(`❌ Session not found: ${args[2]}`);
        }
      } else if (subCmd === 'search') {
        const results = mgr.searchSessions(args[2]);
        if (results.length === 0) {
          console.log(`No sessions found matching: ${args[2]}`);
        } else {
          console.log(`\n🔍 Found ${results.length} session(s):`);
          results.forEach(r => {
            console.log(`\n  📝 ${r.name}`);
            console.log(`     Goal: ${r.goal}`);
            console.log(`     Tags: ${r.tags.join(', ') || 'none'}`);
          });
        }
      } else if (subCmd === 'tag') {
        const sessionId = args[2];
        const tagArg = args.find(a => a.startsWith('--add='));
        if (!tagArg) {
          console.error('Usage: booklib sessions tag <id> --add=tag1,tag2');
          process.exit(1);
        }
        const tags = tagArg.split('=')[1].split(',');
        const result = mgr.tagSession(sessionId, tags, 'add');
        console.log(`✅ Tagged: ${result.session}`);
        console.log(`   Tags: ${result.tags.join(', ')}`);
      } else if (subCmd === 'validate') {
        const result = mgr.validateSession(args[2]);
        console.log(`\n${result.valid ? '✅' : '⚠️'} Validation Result:`);
        if (result.errors.length > 0) {
          console.log('Errors:');
          result.errors.forEach(e => console.log(`  ❌ ${e}`));
        }
        if (result.warnings.length > 0) {
          console.log('Warnings:');
          result.warnings.forEach(w => console.log(`  ⚠️  ${w}`));
        }
        console.log(`Score: ${result.score}/100`);
      } else if (subCmd === 'create') {
        const templateArg = args.find(a => a.startsWith('--template='));
        const template = templateArg?.split('=')[1];
        const sessionName = args[3];
        if (!template || !sessionName) {
          console.error('Usage: booklib sessions create --template=<type> <name>');
          process.exit(1);
        }
        const result = mgr.createFromTemplate(template, sessionName);
        if (result.error) console.error(result.error);
        else console.log(`✅ Created session from template: ${result.created}`);
      } else if (subCmd === 'report') {
        const sinceArg = args.find(a => a.startsWith('--since='));
        const since = sinceArg?.split('=')[1];
        const stats = mgr.generateReport({ since });
        console.log(`\n📊 Session Report`);
        console.log(`Total sessions: ${stats.total_sessions}`);
        console.log(`Pending tasks: ${stats.total_tasks}`);
        console.log(`Active skills: ${stats.unique_skills}`);
        console.log(`\nTop Skills: ${stats.unique_skills.slice(0, 3).join(', ')}`);
        console.log(`\nRecent Activity:`);
        stats.recent_activity.forEach(a => {
          console.log(`  📝 ${a.name}: ${a.goal} (${new Date(a.timestamp).toLocaleDateString()})`);
        });
      } else if (subCmd === 'history') {
        const history = mgr.getVersionHistory(args[2]);
        console.log(`\n📜 Version History: ${args[2]}`);
        console.log(`Total versions: ${history.length}`);
        history.slice(0, 5).forEach(v => {
          console.log(`  Version ${v.version}: ${v.timestamp}`);
        });
      } else if (subCmd === 'encrypt') {
        const result = mgr.encryptSession(args[2]);
        if (result.error) console.error(result.error);
        else console.log(`🔒 Encrypted: ${result.encrypted}`);
      } else if (subCmd === 'summarize') {
        const ai = new BookLibAIFeatures(process.cwd());
        const hasAiFlag = args.includes('--ai');
        if (!hasAiFlag) {
          console.log('Use: booklib sessions summarize <id> --ai');
          process.exit(1);
        }
        const sessionPath = path.join(process.cwd(), '.booklib/sessions', `${args[2]}.md`);
        if (!fs.existsSync(sessionPath)) {
          console.error(`Session not found: ${args[2]}`);
          process.exit(1);
        }
        const content = fs.readFileSync(sessionPath, 'utf8');
        const parseSessionContent = (c) => {
          const extract = (tag) => {
            const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`);
            const match = c.match(regex);
            return match ? match[1].trim() : '';
          };
          return { session_id: extract('session_id'), goal: extract('goal') };
        };
        const summary = parseSessionContent(content);
        const rec = ai.recommendSkills(summary.goal);
        console.log(`\n📝 Session: ${summary.session_id}`);
        console.log(`Goal: ${summary.goal}`);
        console.log(`\n💡 Suggested Skills:`);
        rec.recommendations.forEach(r => {
          console.log(`  • ${r.skill} (${r.confidence}%): ${r.reason}`);
        });
      }
      break;
    }

    case 'sessions-list': {
      const coord = new BookLibSessionCoordinator();
      const sessions = coord.listAllSessions();
      if (sessions.length === 0) { console.log('No sessions found.'); break; }
      sessions.forEach(s => console.log(`  📝 ${s.id} — ${s.goal} [${s.branch}]`));
      break;
    }

    case 'sessions-merge': {
      const coord = new BookLibSessionCoordinator();
      const ids = args[1]?.split(',');
      const output = args[2];
      if (!ids || !output) { console.error('Usage: booklib sessions-merge <id1,id2,...> <output-name>'); process.exit(1); }
      const result = coord.mergeSessions(ids, output);
      console.log(result.message || `✅ Merged into: ${output}`);
      break;
    }

    case 'sessions-lineage': {
      const coord = new BookLibSessionCoordinator();
      if (args[1] && args[2]) {
        coord.trackLineage(args[1], args[2], args[3] || '');
        console.log(`✅ Lineage tracked: ${args[1]} → ${args[2]}`);
      } else {
        console.log(coord.displayLineageTree());
      }
      break;
    }

    case 'sessions-compare': {
      const coord = new BookLibSessionCoordinator();
      const ids = args[1]?.split(',');
      const targetFile = args[2];
      const output = args[3];
      if (!ids || !targetFile || !output) { console.error('Usage: booklib sessions-compare <id1,id2,...> <file> <output-name>'); process.exit(1); }
      const result = coord.compareAudits(ids, targetFile, output);
      console.log(result.message || `✅ Comparison saved: ${output}`);
      break;
    }

    case 'hooks': {
      const mgr = new BookLibSessionManager(process.cwd());
      if (args[1] === 'install') {
        const result = mgr.installGitHooks();
        console.log(`✅ Installed hooks: ${result.installed.join(', ')}`);
      }
      break;
    }

    case 'extension-data': {
      const ai = new BookLibAIFeatures(process.cwd());
      const data = ai.getExtensionData();
      console.log(JSON.stringify(data, null, 2));
      break;
    }

    case 'github-integration': {
      const ai = new BookLibAIFeatures(process.cwd());
      const data = ai.getGitHubIntegrationData(args[1]);
      console.log(JSON.stringify(data, null, 2));
      break;
    }

    case 'slack-integration': {
      const ai = new BookLibAIFeatures(process.cwd());
      const data = ai.getSlackIntegrationData(args[1]);
      console.log(JSON.stringify(data, null, 2));
      break;
    }

    case 'init': {
      // Backwards-compat: if legacy flags are passed, run old init flow
      const hasLegacyFlags = args.some(a =>
        a.startsWith('--tool=') || a.startsWith('--skills=') ||
        a.includes('--dry-run') || a.includes('--ecc')
      );

      if (hasLegacyFlags) {
        // ── Legacy init path ─────────────────────────────────────────────────
        const orchestratorArg = args.find(a => a.startsWith('--orchestrator='))?.split('=')[1] ?? null;
        const dryRun          = args.includes('--dry-run');
        const hasToolFlag     = args.some(a => a.startsWith('--tool='));
        let targetArg;
        if (hasToolFlag) {
          targetArg = args.find(a => a.startsWith('--tool='))?.split('=')[1];
        } else if (!dryRun) {
          const { configPath } = resolveBookLibPaths();
          let savedConfig = {};
          try { savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch { /* no config yet */ }
          if (savedConfig.tools?.length) {
            targetArg = savedConfig.tools.join(',');
            console.log(`Using saved tool selection: ${targetArg} (pass --tool=X to override)\n`);
          } else {
            targetArg = await promptToolSelection();
            const updatedConfig = { ...savedConfig, tools: targetArg === 'all'
              ? ['claude', 'cursor', 'copilot', 'gemini', 'codex', 'windsurf']
              : targetArg.split(',') };
            try { fs.writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2)); } catch { /* best-effort */ }
          }
        } else {
          targetArg = 'all';
        }
        const skillsArg = args.find(a => a.startsWith('--skills='))?.split('=')[1];
        const rulesArg  = args.find(a => a.startsWith('--rules='))?.split('=')[1];
        const pullEcc         = args.includes('--ecc');
        const includeAgents   = pullEcc || args.includes('--agents');
        const includeCommands = pullEcc || args.includes('--commands');
        const includeRules    = pullEcc || args.includes('--rules') || rulesArg != null;
        const skillList = skillsArg?.split(',').map(s => s.trim());
        const langList  = rulesArg ? rulesArg.split(',').map(s => s.trim()) : (includeRules ? null : false);
        const initializer = new ProjectInitializer();

        if (!skillList) {
          const detected = initializer.detectRelevantSkills();
          if (detected.length === 0 && !includeAgents && !includeCommands && !includeRules) {
            console.log('No skills auto-detected. Specify with --skills=skill1,skill2 or use --ecc to pull agents/commands/rules.');
            process.exit(1);
          }
          if (detected.length > 0) console.log(`Auto-detected skills: ${detected.join(', ')}\n`);
        }

        if (hasToolFlag && !dryRun) {
          const { configPath } = resolveBookLibPaths();
          let savedConfig = {};
          try { savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch { /* no config yet */ }
          const toolList = targetArg === 'all'
            ? ['claude', 'cursor', 'copilot', 'gemini', 'codex', 'windsurf']
            : targetArg.split(',');
          try { fs.writeFileSync(configPath, JSON.stringify({ ...savedConfig, tools: toolList }, null, 2)); } catch { /* best-effort */ }
        }

        if (skillList || initializer.detectRelevantSkills().length > 0) {
          console.log(`Generating context files for: ${targetArg === 'all' ? 'claude, cursor, copilot, gemini, codex, windsurf' : targetArg}\n`);
          const written = await initializer.init({ skills: skillList, target: targetArg, dryRun });
          if (!dryRun && written.length > 0) console.log('');
        }

        if (includeAgents || includeCommands || includeRules) {
          const pulling = [];
          if (includeRules)    pulling.push(langList ? `rules (${langList.join(',')})` : 'rules (all languages)');
          if (includeAgents)   pulling.push('agents → .claude/agents/');
          if (includeCommands) pulling.push('commands → .claude/commands/');
          console.log(`Pulling ECC artifacts: ${pulling.join(', ')}\n`);
          try {
            const eccWritten = await initializer.fetchEccArtifacts({ languages: langList, includeAgents, includeCommands, dryRun });
            if (!dryRun && eccWritten.length > 0) console.log(`\nPulled ${eccWritten.length} artifact(s) from ECC.`);
          } catch (err) {
            console.error(`ECC fetch failed: ${err.message}`);
          }
        }
        break;
      }

      // ── New guided wizard ─────────────────────────────────────────────────
      await runWizard(process.cwd());
      break;
    }

    case 'setup': {
      const engine = new DiscoveryEngine();
      const fetcher = new SkillFetcher();
      console.log('Discovering skills...');
      const skills = await engine.refresh();
      const trusted = skills.filter(s => s.trusted);
      const untrusted = skills.filter(s => !s.trusted);
      if (trusted.length === 0) {
        console.log('No trusted skills found. Check your booklib.config.json sources.');
        break;
      }
      console.log(`Found ${trusted.length} trusted skill(s) to install, ${untrusted.length} require confirmation.\n`);
      let installed = 0;
      for (const skill of trusted) {
        if (fetcher.isCached(skill)) {
          console.log(`  ✓ ${skill.name} (already installed)`);
          continue;
        }
        process.stdout.write(`  ↓ Fetching ${skill.name}...`);
        try {
          await fetcher.fetch(skill);
          console.log(' done');
          installed++;
        } catch (err) {
          console.log(` failed: ${err.message}`);
        }
      }
      if (installed > 0) {
        console.log(`\nRe-indexing...`);
        const { skillsPath, cachePath } = resolveBookLibPaths();
        const indexer = new BookLibIndexer();
        await indexer.indexDirectory(skillsPath);
        await indexer.indexDirectory(path.join(cachePath, 'skills'));
      }
      console.log('\n✅ Setup complete. Run: booklib search "<query>"');
      console.log('   Skills synced to ~/.claude/skills/ — pair with an orchestrator if needed:');
      console.log('   obra/superpowers: /plugin install superpowers   ruflo: npm install -g ruflo');
      if (untrusted.length > 0) {
        console.log(`\nTo install remaining skills, run: booklib fetch <skill-name>`);
        untrusted.forEach(s => console.log(`  • ${s.name}`));
      }
      break;
    }

    case 'add': {
      const installer = new BookLibInstaller();
      const skillId = args[1];
      if (!skillId) { console.error('Usage: booklib add <skill-id-or-url>'); process.exit(1); }
      await installer.add(skillId);
      break;
    }

    case 'fetch': {
      const { SKILL_REGISTRY } = await import('../lib/registry/skills.js');
      const skillName = args[1];
      if (!skillName) { console.error('Usage: booklib fetch <skill-name>'); process.exit(1); }
      const skill = SKILL_REGISTRY.find(s => s.name === skillName || s.name.endsWith(`/${skillName}`));
      if (!skill) { console.error(`Skill not found in registry: ${skillName}`); process.exit(1); }
      const fetcher = new SkillFetcher();
      try {
        await fetcher.fetch(skill, {
          onPrompt: async (s) => {
            process.stdout.write(`Index "${s.name}" from ${s.source.type} (untrusted)? [y/N] `);
            const answer = await new Promise(r => {
              process.stdin.once('data', d => r(d.toString().trim().toLowerCase()));
            });
            return answer === 'y' || answer === 'yes';
          },
        });
      } catch (err) {
        if (err instanceof RequiresConfirmationError) {
          console.error(err.message);
          process.exit(1);
        }
        throw err;
      }
      // Slot limit warning
      const slotCount = countInstalledSlots();
      if (slotCount >= SKILL_LIMIT) {
        console.log(`\n  ⚠  You now have ${slotCount}/${SKILL_LIMIT} skill slots used.`);
        console.log('     Claude may truncate skill descriptions. Run "booklib doctor" to clean up.');
      } else if (slotCount >= SKILL_LIMIT - 4) {
        console.log(`\n  ⚠  ${slotCount}/${SKILL_LIMIT} slots used — approaching limit.`);
        console.log('     Run "booklib doctor" to review installed skills.');
      }
      break;
    }

    case 'sync': {
      // Retroactively sync all already-fetched BookLib skills to ~/.claude/skills/
      const { cachePath } = resolveBookLibPaths();
      const skillsDir = path.join(cachePath, 'skills');
      if (!fs.existsSync(skillsDir)) { console.log('No fetched skills found. Run: booklib setup'); break; }
      const fetcher = new SkillFetcher();
      const dirs = fs.readdirSync(skillsDir).filter(d => fs.existsSync(path.join(skillsDir, d, 'SKILL.md')));
      let synced = 0;
      for (const d of dirs) {
        const skillFile = path.join(skillsDir, d, 'SKILL.md');
        const head = fs.readFileSync(skillFile, 'utf8').split('\n').slice(0, 15).join('\n');
        const nameMatch = head.match(/^name:\s*["']?(.+?)["']?\s*$/m);
        const descMatch = head.match(/^description:\s*(.+)$/m);
        const name = nameMatch ? nameMatch[1].trim() : d;
        const description = descMatch ? descMatch[1].trim().replace(/^["']|["']$/g, '') : '';
        fetcher._syncToClaudeSkills({ name, description }, path.join(skillsDir, d));
        synced++;
      }
      console.log(`Synced ${synced} skills to ~/.claude/skills/ — available via Claude Code Skill tool`);
      console.log(`  Pair with an orchestrator:  /plugin install superpowers  (obra)  ·  npm install -g ruflo  (ruflo)`);
      break;
    }

    case 'discover': {
      const engine = new DiscoveryEngine();
      const flag = args[1];
      if (flag === '--refresh') {
        console.log('Refreshing discovery cache...');
        const skills = await engine.refresh();
        console.log(`Found ${skills.length} skills from external sources.`);
        skills.forEach(s => {
          const stars = s.stars ? ` ★${s.stars.toLocaleString()}` : '';
          const trust = s.trusted ? '' : ' (requires confirmation)';
          console.log(`  • ${s.name}${stars} [${s.source.type}]${trust} — ${s.description}`);
        });
      } else {
        const skills = await engine.discover();
        if (skills.length === 0) {
          console.log('No external sources configured. Add sources to booklib.config.json.');
        } else {
          console.log(`Discovered ${skills.length} skills:`);
          skills.forEach(s => {
            const stars = s.stars ? ` ★${s.stars.toLocaleString()}` : '';
            const trust = s.trusted ? '' : ' (requires confirmation)';
            console.log(`  • ${s.name}${stars} [${s.source.type}]${trust} — ${s.description}`);
          });
        }
      }
      break;
    }

    case 'profile': {
      const role = args[1];
      const ALL_ROLES = ['architect', 'coder', 'reviewer', 'tester', 'security', 'frontend', 'optimizer', 'devops', 'ai-engineer', 'manager', 'product', 'legal', 'writer', 'strategist', 'designer'];
      if (!role || role === '--list') {
        console.log('\nAvailable agent roles:\n');
        ALL_ROLES.forEach(r => console.log(`  • ${r}`));
        console.log('\nUsage: booklib profile <role>\n');
        break;
      }

      const engine = new DiscoveryEngine();
      const all = await engine.discover();
      // Merge with registry for role metadata
      const { skills: regSkills } = JSON.parse(
        (await import('fs')).default.readFileSync(
          (await import('path')).default.join(
            (await import('url')).default.fileURLToPath(new URL('.', import.meta.url)),
            '../community/registry.json'
          ), 'utf8'
        )
      );
      const roleMap = new Map(regSkills.map(s => [s.name, s.roles ?? []]));

      const matches = all.filter(s => {
        const roles = roleMap.get(s.name) ?? s.roles ?? [];
        return roles.includes(role);
      });

      if (matches.length === 0) {
        console.log(`No skills found for role "${role}". Try: booklib profile --list`);
        break;
      }

      console.log(`\n🤖 Skill profile for agent role: ${role}\n`);
      console.log(`   ${matches.length} skills pre-selected from ${all.length} available\n`);
      matches.forEach(s => {
        const stars = s.stars ? ` ★${s.stars.toLocaleString()}` : '';
        console.log(`  • ${s.name}${stars}`);
        if (s.description) console.log(`    ${s.description.slice(0, 100)}`);
      });
      console.log(`\nTo load all: booklib setup  (then each skill is available to inject)`);
      console.log(`To search within role: booklib search "<query>" --role=${role}\n`);
      break;
    }

    case 'swarm-config': {
      const trigger = args[1];

      // Trigger → roles → skill domains mapping (extends ruflo's worker-integration concept)
      const SWARM_TRIGGERS = {
        audit:      { roles: ['security', 'tester'],       phases: ['security-scan', 'coverage', 'vulnerability-check'] },
        refactor:   { roles: ['coder', 'reviewer'],        phases: ['complexity', 'naming', 'patterns', 'solid'] },
        architect:  { roles: ['architect'],                phases: ['system-design', 'ddd', 'api-design'] },
        frontend:   { roles: ['frontend', 'tester'],       phases: ['components', 'state', 'performance', 'a11y'] },
        release:    { roles: ['devops', 'security'],       phases: ['docker', 'secrets', 'headers', 'changelog'] },
        research:   { roles: ['ai-engineer', 'architect'], phases: ['prompt-design', 'rag', 'reliability'] },
        manage:     { roles: ['manager'],                  phases: ['leadership', 'retro', 'process'] },
        product:    { roles: ['product', 'writer'],        phases: ['requirements', 'user-stories', 'prioritization'] },
        legal:      { roles: ['legal'],                    phases: ['contract-review', 'risk-assessment', 'compliance'] },
        write:      { roles: ['writer'],                   phases: ['outline', 'draft', 'edit', 'review'] },
        strategy:   { roles: ['strategist', 'product'],   phases: ['discovery', 'positioning', 'roadmap'] },
        design:     { roles: ['designer', 'frontend'],    phases: ['visual-hierarchy', 'typography', 'brand'] },
      };

      if (!trigger || trigger === '--list') {
        console.log('\n🐝 BookLib Swarm Trigger Config\n');
        console.log('   Maps swarm triggers → agent roles → skill domains\n');
        console.log('   Usage: booklib swarm-config <trigger>\n');
        Object.entries(SWARM_TRIGGERS).forEach(([t, cfg]) => {
          console.log(`  ${t.padEnd(12)} → roles: ${cfg.roles.join(', ')}`);
        });
        console.log('\n  booklib swarm-config <trigger>   Show skills for a trigger');
        console.log('  booklib profile <role>           Show skills for a role\n');
        break;
      }

      const cfg = SWARM_TRIGGERS[trigger];
      if (!cfg) {
        console.log(`Unknown trigger "${trigger}". Available: ${Object.keys(SWARM_TRIGGERS).join(', ')}`);
        break;
      }

      const engine = new DiscoveryEngine();
      const all = await engine.discover();
      const { skills: regSkills } = JSON.parse(
        (await import('fs')).default.readFileSync(
          (await import('path')).default.join(
            (await import('url')).default.fileURLToPath(new URL('.', import.meta.url)),
            '../community/registry.json'
          ), 'utf8'
        )
      );
      const roleMap = new Map(regSkills.map(s => [s.name, s.roles ?? []]));

      console.log(`\n🐝 Swarm config for trigger: ${trigger}\n`);
      console.log(`   Phases: ${cfg.phases.join(' → ')}\n`);

      for (const role of cfg.roles) {
        const roleSkills = all.filter(s => (roleMap.get(s.name) ?? s.roles ?? []).includes(role));
        console.log(`  Agent role: ${role} (${roleSkills.length} skills)`);
        roleSkills.slice(0, 5).forEach(s => {
          const stars = s.stars ? ` ★${s.stars.toLocaleString()}` : '';
          console.log(`    • ${s.name}${stars} — ${(s.description ?? '').slice(0, 75)}`);
        });
        if (roleSkills.length > 5) console.log(`    … and ${roleSkills.length - 5} more (booklib profile ${role})`);
        console.log();
      }
      break;
    }

    case 'note': {
      const title = args.slice(1).join(' ');
      if (!title) { console.error('Usage: booklib note "<title>"'); process.exit(1); }
      const id = generateNodeId('node');
      let body = await readStdin();
      if (!body) body = openEditor('') ?? '';
      if (!body) body = await readInteractive('Enter note content (Ctrl+D to finish):\n');
      const noteContent = serializeNode({ id, type: 'note', title, content: body ?? '' });
      const filePath = saveNode(noteContent, id);
      await autoIndexNode(filePath);
      console.log(`✅ Note created: ${filePath}`);
      console.log(`   ID: ${id}`);
      break;
    }

    case 'component': {
      const subcommand = args[1];
      const name = args[2];
      const glob = args[3];
      if (subcommand !== 'add' || !name || !glob) {
        console.error('Usage: booklib component add <name> "<glob>"');
        process.exit(1);
      }
      const id = `comp_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      const content = serializeNode({
        id,
        type: 'component',
        title: name,
        nodePaths: [glob],
        content: '',
      });
      const filePath = saveNode(content, id);
      console.log(`✅ Component created: ${filePath}`);
      console.log(`   ID: ${id}  paths: ${glob}`);
      break;
    }

    case 'link': {
      const [, fromRef, toRef] = args;
      const typeArg = parseFlag(args, 'type');
      const weightArg = parseFlag(args, 'weight');
      if (!fromRef || !toRef || !typeArg) {
        console.error('Usage: booklib link "<title-or-id>" "<title-or-id>" --type <edge-type> [--weight 0.9]');
        process.exit(1);
      }
      if (!EDGE_TYPES.includes(typeArg)) {
        console.error(`Invalid edge type "${typeArg}". Valid: ${EDGE_TYPES.join(', ')}`);
        process.exit(1);
      }
      let from, to;
      try {
        from = resolveNodeRef(fromRef);
        to = resolveNodeRef(toRef);
      } catch (err) {
        console.error(err.message);
        process.exit(1);
      }
      const edge = {
        from,
        to,
        type: typeArg,
        weight: weightArg ? parseFloat(weightArg) : 1.0,
        created: new Date().toISOString().split('T')[0],
      };
      appendEdge(edge);
      console.log(`✅ Edge added: ${from} --[${typeArg}]--> ${to} (weight: ${edge.weight})`);
      break;
    }

    case 'nodes': {
      const subcommand = args[1];
      if (!subcommand || subcommand === 'list') {
        const ids = listNodes();
        if (ids.length === 0) { console.log('No knowledge nodes yet. Try: booklib note "title"'); break; }
        console.log(`\n📝 Knowledge nodes (${ids.length}):\n`);
        for (const id of ids) {
          const raw = loadNode(id);
          const parsed = raw ? parseNodeFrontmatter(raw) : {};
          const tags = Array.isArray(parsed.tags) ? parsed.tags.join(', ') : '';
          console.log(`  ${id}  [${parsed.type ?? '?'}]  ${parsed.title ?? '?'}${tags ? `  (${tags})` : ''}`);
        }
        break;
      }
      if (subcommand === 'show') {
        const id = args[2];
        if (!id) { console.error('Usage: booklib nodes show <id>'); process.exit(1); }
        const raw = loadNode(id);
        if (!raw) { console.error(`Node "${id}" not found.`); process.exit(1); }
        console.log(raw);
        break;
      }
      console.error('Usage: booklib nodes list | booklib nodes show <id>');
      process.exit(1);
    }

    case 'dictate': {
      const isRaw = args.includes('--raw');
      const titleArg = parseFlag(args, 'title');

      const stdinText = await readStdin();
      const rawText = stdinText || await readInteractive();

      if (!rawText) { console.error('No input provided.'); process.exit(1); }

      const id = generateNodeId('node');
      let nodeContent;

      if (isRaw) {
        const title = titleArg ?? rawText.split('\n')[0].slice(0, 60);
        nodeContent = serializeNode({ id, type: 'note', title, content: rawText });
      } else {
        console.log('Structuring with AI...');
        let structured;
        try {
          structured = await callAnthropicAPI(buildDictatePrompt(rawText));
        } catch (err) {
          console.error(`AI structuring failed: ${err.message}`);
          console.error('Tip: use --raw to save without AI processing.');
          const title = titleArg ?? rawText.split('\n')[0].slice(0, 60);
          nodeContent = serializeNode({ id, type: 'note', title, content: rawText });
        }
        if (structured) {
          nodeContent = `---\nid: "${id}"\n` + structured.replace(/^---\n?/, '');
        }
      }

      const filePath = saveNode(nodeContent, id);
      await autoIndexNode(filePath);
      console.log(`✅ Note saved: ${filePath}`);
      console.log(`   ID: ${id}`);
      break;
    }

    case 'save-chat': {
      const doSummarize = args.includes('--summarize');
      const titleArg = parseFlag(args, 'title');
      // Skip flag values consumed by --flag value pairs so they aren't mistaken for a file path
      const titleIdx = args.indexOf('--title');
      const consumedIndices = new Set(titleIdx !== -1 ? [titleIdx, titleIdx + 1] : []);
      const fileArg = args.slice(1).find((a, i) => !a.startsWith('--') && !consumedIndices.has(i + 1));

      let transcript;
      if (fileArg) {
        transcript = fs.readFileSync(fileArg, 'utf8').trim();
      } else {
        transcript = await readStdin();
      }
      if (!transcript) {
        transcript = openEditor('# Paste or type the conversation here\n\n');
      }
      if (!transcript) { console.error('No conversation content provided.'); process.exit(1); }

      const id = generateNodeId('node');
      let nodeContent;

      if (doSummarize) {
        console.log('Summarizing conversation with AI...');
        try {
          const summary = await callAnthropicAPI(buildSummarizePrompt(transcript, titleArg ?? ''));
          nodeContent = `---\nid: "${id}"\n` + summary.replace(/^---\n?/, '');
        } catch (err) {
          console.error(`AI summarization failed: ${err.message}`);
          nodeContent = serializeNode({
            id, type: 'note',
            title: titleArg ?? 'Conversation transcript',
            content: transcript,
            sources: ['conversation'],
          });
        }
      } else {
        nodeContent = serializeNode({
          id, type: 'note',
          title: titleArg ?? 'Conversation transcript',
          content: transcript,
          sources: ['conversation'],
        });
      }

      const filePath = saveNode(nodeContent, id);
      await autoIndexNode(filePath);
      console.log(`✅ Conversation saved: ${filePath}`);
      console.log(`   ID: ${id}`);
      break;
    }

    case 'research': {
      const topic = args.slice(1).join(' ');
      if (!topic) { console.error('Usage: booklib research "<topic>"'); process.exit(1); }
      const id = generateNodeId('node');
      const template = `## Sources\n\n<!-- Add URLs, papers, docs -->\n\n## Key Findings\n\n<!-- Fill in after researching -->\n\n## Summary\n\n<!-- 2-3 sentence summary -->\n`;
      const nodeContent = serializeNode({
        id,
        type: 'research',
        title: topic,
        content: template,
        confidence: 'low',
      });
      const filePath = saveNode(nodeContent, id);
      await autoIndexNode(filePath);
      console.log(`✅ Research template created: ${filePath}`);
      console.log(`   ID: ${id}`);
      console.log(`   Fill in the findings — this node is already indexed and searchable.`);
      break;
    }

    case 'uninstall': {
      const skillName = args[1];
      if (!skillName) {
        console.error('Usage: booklib uninstall <skill-name>');
        process.exit(1);
      }
      const fetcher = new SkillFetcher();
      fetcher.desyncFromClaudeSkills({ name: skillName });
      const remaining = countInstalledSlots();
      console.log(`✓ Removed ${skillName} from ~/.claude/skills/`);
      console.log(`  ${remaining}/${SKILL_LIMIT} slots now used`);
      break;
    }

    case 'list': {
      const names = listInstalledSkillNames();
      const slots = countInstalledSlots();
      if (names.length === 0) {
        console.log('No BookLib-managed skills installed. Run "booklib init" to get started.');
        break;
      }
      console.log(`\nInstalled skills (${slots}/${SKILL_LIMIT} slots):\n`);
      for (const name of names) console.log(`  · ${name}`);
      console.log('');
      if (slots > SKILL_LIMIT - 4) console.log('  ⚠  Approaching slot limit. Run "booklib doctor" to review.');
      break;
    }

    case 'doctor': {
  const installHook = args.includes('--install-hook');
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const SKILL_NAME_PAD = 24;
  const USE_LABEL_PAD  = 9;

  if (installHook) {
    try {
      const result = installTrackingHook();
      if (result.alreadyInstalled) {
        console.log('  Hook already installed — nothing changed.');
      } else {
        console.log('✓ Tracking hook installed');
        console.log(`  Script:  ${result.scriptPath}`);
        console.log(`  Hook:    ${result.settingsPath} → PreToolUse[Skill]`);
        console.log('');
        console.log('  Skill usage will be tracked from now on.');
        console.log('  Run `booklib doctor` after a few sessions to see your report.');
      }
    } catch (err) {
      console.error(`Failed to install hook: ${err.message}`);
      process.exit(1);
    }
    break;
  }

  const claudeSkillsDir = path.join(os.homedir(), '.claude', 'skills');
  const usagePath       = path.join(os.homedir(), '.booklib', 'usage.json');
  const installedNames  = listInstalledSkillNames();
  const usageData       = readUsage(usagePath);

  if (installedNames.length === 0) {
    console.log('\n  No BookLib-managed skills installed. Run "booklib init" to get started.\n');
    break;
  }

  const installDates = {};
  for (const name of installedNames) {
    try {
      const stat = fs.statSync(path.join(claudeSkillsDir, name, '.booklib'));
      installDates[name] = stat.mtime;
    } catch { /* unknown install date */ }
  }

  const summary     = summarize(usageData, installedNames, installDates);
  const suggestions = summary.filter(s => s.suggestion !== null);

  console.log('\n► Skill health check\n');

  for (const item of summary) {
    const icon     = item.suggestion ? '⚠' : '✓';
    const useLabel = item.uses === 1 ? '1 use ' : `${item.uses} uses`;
    let whenLabel;
    if (item.lastUsed === null) {
      const days = installDates[item.name]
        ? Math.floor((Date.now() - installDates[item.name].getTime()) / MS_PER_DAY)
        : null;
      whenLabel = days !== null ? `never — installed ${days} days ago` : 'never';
    } else {
      whenLabel = `${item.daysSinceLastUse} day${item.daysSinceLastUse === 1 ? '' : 's'} ago`;
    }
    console.log(`  ${icon} ${item.name.padEnd(SKILL_NAME_PAD)} ${useLabel.padEnd(USE_LABEL_PAD)} (${whenLabel})`);
  }

  if (suggestions.length > 0) {
    console.log('\n  Suggestions:');
    for (const item of suggestions) {
      if (item.suggestion === 'remove') {
        console.log(`  · ${item.name}: never used — consider removing (booklib uninstall ${item.name})`);
      } else {
        const days = item.daysSinceLastUse ?? 60;
        console.log(`  · ${item.name}: ${item.uses} use${item.uses === 1 ? '' : 's'} in ${days} days — low activity`);
      }
    }
    console.log('\n  Run `booklib uninstall <skill>` to free up slots.');
  }

  if (!fs.existsSync(usagePath)) {
    console.log('\n  Tip: run `booklib doctor --install-hook` to start tracking usage.');
  }

  console.log('');
  break;
}

case 'rules': {
  const subcommand = args[1];

  switch (subcommand) {
    case 'list': {
      const available = listAvailableRules();
      console.log('\n► Available rule sets\n');
      console.log(`  ${'Bundled:'.padEnd(22)} ${'project'.padEnd(12)} global`);
      for (const item of available) {
        const icon = (item.installedProject || item.installedGlobal) ? '✓' : '·';
        const proj = item.installedProject ? 'installed' : '—';
        const glob = item.installedGlobal  ? 'installed' : '—';
        console.log(`  ${icon} ${item.lang.padEnd(22)} ${proj.padEnd(12)} ${glob}`);
      }
      console.log('');
      console.log('  booklib rules install <lang>           → add to .cursor/rules/');
      console.log('  booklib rules install <lang> --global  → add to ~/.claude/CLAUDE.md');
      console.log('');
      break;
    }

    case 'install': {
      const lang = args[2];
      if (!lang || lang.startsWith('--')) {
        console.error('  Usage: booklib rules install <lang> [--global]');
        process.exit(1);
      }
      const isGlobal = args.includes('--global');
      try {
        const written = installRuleFn(lang, { global: isGlobal });
        if (isGlobal) {
          const sizeBytes = fs.statSync(written[0]).size;
          console.log(`\n✓ Installed ${lang} rules globally`);
          console.log(`  ${written[0]}  (${formatBytes(sizeBytes)})\n`);
        } else {
          console.log(`\n✓ Installed ${lang} rules`);
          for (const p of written) {
            console.log(`  ${p}  (${formatBytes(fs.statSync(p).size)})`);
          }
          console.log('');
        }
      } catch (err) {
        console.error(`  ${err.message}`);
        process.exit(1);
      }
      break;
    }

    case 'status': {
      const st = rulesStatus();
      console.log('\n► Rules status\n');

      if (st.cursor.length === 0 && st.global.length === 0) {
        console.log('  No rules installed in current project.\n');
        console.log('  Tip: booklib rules install <lang> to add standards.\n');
        break;
      }

      if (st.cursor.length > 0) {
        console.log('  .cursor/rules/ (project)');
        for (const item of st.cursor) {
          console.log(`    ${path.basename(item.path).padEnd(42)} ${formatBytes(item.sizeBytes)}`);
        }
        console.log('');
      }

      if (st.global.length > 0) {
        console.log('  ~/.claude/CLAUDE.md (global)');
        for (const item of st.global) {
          console.log(`    ${item.lang.padEnd(42)} ${formatBytes(item.sizeBytes)}`);
        }
        console.log('');
      }

      const projCount = st.cursor.length;
      const globCount = st.global.length;
      console.log(`  Total: ${formatBytes(st.totalBytes)} across ${projCount} project + ${globCount} global rule(s)\n`);
      break;
    }

    default:
      console.log('\n  booklib rules list                          — show available rule sets');
      console.log('  booklib rules install <lang>                — install to .cursor/rules/');
      console.log('  booklib rules install <lang> --global       — install to ~/.claude/CLAUDE.md');
      console.log('  booklib rules status                        — show installed rules + sizes\n');
  }
  break;
}

    default:
      console.log(`
BookLib — AI Agent Skill Library

CORE:
  booklib index [dir] [--clear]                  Build semantic index (skills + knowledge nodes)
  booklib search "<query>"                       Search skills and your knowledge nodes
  booklib audit <skill> <file>                   Deep-audit a file against a skill
  booklib scan [dir] [--docs]                    Project-wide heatmap
  booklib context "<task>" [--prompt-only]       Cross-skill context + conflict resolution
  booklib context "<task>" --file <path>         Also injects graph context for the file's component

KNOWLEDGE GRAPH:
  booklib note "<title>"                         Create a note (pipe content via stdin, or opens editor)
  booklib dictate [--raw] [--title "<t>"]        Type/speak rough thoughts → AI structures → note
  booklib research "<topic>"                     Create a research template node to fill in later
  booklib save-chat [--summarize] [--title "<t>"] Save current conversation as a knowledge node
  booklib component add <name> "<glob>"          Define a project component (e.g. "auth" "src/auth/**")
  booklib link "<title-or-id>" "<title-or-id>" --type <edge-type>  Connect two nodes
  booklib nodes list                             List all knowledge nodes
  booklib nodes show <id>                        View a specific node

  Edge types: implements · contradicts · extends · applies-to · see-also · inspired-by · supersedes · depends-on
  note vs dictate: use note when you have content ready; use dictate to speak/type rough thoughts

SKILLS:
  booklib init [--tool=claude|cursor|copilot|gemini|codex|windsurf|all] [--skills=s1,s2]
               [--ecc] [--agents] [--commands] [--rules[=kotlin,python]]
               [--orchestrator=obra|ruflo] [--dry-run]
  booklib setup                                  Fetch & index all trusted community skills
  booklib discover [--refresh]                   List available community skills
  booklib fetch <skill-name>                     Fetch + index a specific skill
  booklib add <skill-id-or-url>                  Add skill via registry ID or URL

SESSION HANDOFF:
  booklib save-state --goal=".." --next=".."     Save agent context
  booklib resume [session-name]                  Resume last session
  booklib recover-auto                           Auto-recover from session or git

SESSION MANAGEMENT:
  booklib sessions cleanup --before 90days       Archive old sessions
  booklib sessions diff <id1> <id2>              Compare two sessions
  booklib sessions find <name>                   Find session (local+global)
  booklib sessions search <query>                Search by content
  booklib sessions tag <id> --add=tag1,tag2      Tag sessions
  booklib sessions validate [id]                 Check quality
  booklib sessions report [--since "2 weeks"]    Team report
  booklib sessions create --template=<t> <n>     Create from template
  booklib sessions history <id>                  Version history

ORCHESTRATOR COMPATIBILITY:
  booklib sync                                   Sync all fetched skills → ~/.claude/skills/

SWARM INTEGRATION:
  booklib profile <role>                         Skill bundle for an agent role
  booklib profile --list                         List all available roles
  booklib swarm-config [trigger]                 Trigger → roles → skills pipeline
  booklib search "<q>" --role=<role>             Search within a role domain

MULTI-AGENT:
  booklib sessions-list                          List all agent sessions
  booklib sessions-merge <id1,id2> <output>      Merge session insights
  booklib sessions-lineage [parent] [child]      Track session lineage
  booklib sessions-compare <ids> <file> <out>    Compare multi-agent audits

`);
  }
}

const NO_NUDGE_COMMANDS = new Set(['help', 'search', 'context', 'audit', 'scan', 'nodes', 'sessions', 'sessions-list']);
const BOOKLIB_DIR = path.join(os.homedir(), '.booklib');

function readCounter(file) {
  try { return parseInt(fs.readFileSync(file, 'utf8'), 10) || 0; } catch { return 0; }
}
function writeCounter(file, value) {
  fs.mkdirSync(BOOKLIB_DIR, { recursive: true });
  fs.writeFileSync(file, String(value));
}

async function maybeAskFeedback() {
  // Only in interactive terminals, only on action commands
  if (!process.stderr.isTTY || !command || NO_NUDGE_COMMANDS.has(command) || args.includes('--help')) return;

  const FEEDBACK_EVERY = 25;
  const counterFile = path.join(BOOKLIB_DIR, 'feedback-count');
  const count = readCounter(counterFile);
  const next = count + 1;
  writeCounter(counterFile, next);
  if (next % FEEDBACK_EVERY !== 0) return;

  return new Promise(resolve => {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    rl.question('\n  Quick question: is BookLib useful to you? [y/n/skip] ', answer => {
      rl.close();
      const a = answer.trim().toLowerCase();
      if (a === 'y' || a === 'yes') {
        console.error('  Glad to hear it! A ⭐ helps others find it: https://github.com/booklib-ai/skills\n');
      } else if (a === 'n' || a === 'no') {
        console.error('  Thanks for the honesty. Tell us what\'s missing: https://github.com/booklib-ai/skills/issues\n');
      }
      resolve();
    });
  });
}

function maybeNudgeStar() {
  if (!command || NO_NUDGE_COMMANDS.has(command) || args.includes('--help')) return;
  const NUDGE_EVERY = 50;
  const counterFile = path.join(BOOKLIB_DIR, 'nudge-count');
  try {
    const next = readCounter(counterFile) + 1;
    writeCounter(counterFile, next);
    if (next % NUDGE_EVERY === 0) {
      console.error('\n  ⭐  If BookLib is useful, a star helps: https://github.com/booklib-ai/skills\n');
    }
  } catch {
    // never block the CLI for a nudge
  }
}

main()
  .then(() => maybeAskFeedback())
  .then(() => maybeNudgeStar())
  .catch(err => {
    console.error(err.message);
    console.error('\n  If this looks like a bug, please report it: https://github.com/booklib-ai/skills/issues\n');
    process.exit(1);
  });
