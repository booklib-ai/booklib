#!/usr/bin/env node

import path from 'path';
import fs from 'fs';
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
import { SkillFetcher, RequiresConfirmationError } from '../lib/skill-fetcher.js';
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

const args = process.argv.slice(2);
const command = args[0];

function parseFlag(args, flag) {
  const long = args.find(a => a.startsWith(`--${flag}=`))?.replace(`--${flag}=`, '');
  if (long !== undefined) return long;
  const idx = args.indexOf(`--${flag}`);
  return idx !== -1 ? args[idx + 1] : null;
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
      const orchestratorArg = args.find(a => a.startsWith('--orchestrator='))?.split('=')[1] ?? null;
      const targetArg = args.find(a => a.startsWith('--tool='))?.split('=')[1] ?? 'all';
      const skillsArg = args.find(a => a.startsWith('--skills='))?.split('=')[1];
      const rulesArg  = args.find(a => a.startsWith('--rules='))?.split('=')[1];
      const dryRun        = args.includes('--dry-run');
      const pullEcc       = args.includes('--ecc');
      const includeAgents   = pullEcc || args.includes('--agents');
      const includeCommands = pullEcc || args.includes('--commands');
      const includeRules    = pullEcc || args.includes('--rules') || rulesArg != null;
      const skillList = skillsArg?.split(',').map(s => s.trim());

      // Languages to pull rules for: --rules (all) or --rules=kotlin,python (specific)
      const langList = rulesArg ? rulesArg.split(',').map(s => s.trim()) : (includeRules ? null : false);

      const initializer = new ProjectInitializer();

      if (!skillList) {
        const detected = initializer.detectRelevantSkills();
        if (detected.length === 0 && !includeAgents && !includeCommands && !includeRules) {
          console.log('No skills auto-detected. Specify with --skills=skill1,skill2 or use --ecc to pull agents/commands/rules.');
          process.exit(1);
        }
        if (detected.length > 0) console.log(`Auto-detected skills: ${detected.join(', ')}\n`);
      }

      // Generate AI tool context files from skills
      if (skillList || initializer.detectRelevantSkills().length > 0) {
        console.log(`Generating context files for: ${targetArg === 'all' ? 'cursor, claude, copilot, gemini' : targetArg}\n`);
        const written = await initializer.init({ skills: skillList, target: targetArg, dryRun });
        if (!dryRun && written.length > 0) {
          console.log('');
        }
      }

      // Pull ECC artifacts (rules / agents / commands)
      if (includeAgents || includeCommands || includeRules) {
        const pulling = [];
        if (includeRules)    pulling.push(langList ? `rules (${langList.join(',')})` : 'rules (all languages)');
        if (includeAgents)   pulling.push('agents → .claude/agents/');
        if (includeCommands) pulling.push('commands → .claude/commands/');
        console.log(`Pulling ECC artifacts: ${pulling.join(', ')}\n`);

        try {
          const eccWritten = await initializer.fetchEccArtifacts({
            languages: langList,
            includeAgents,
            includeCommands,
            dryRun,
          });
          if (!dryRun && eccWritten.length > 0) {
            console.log(`\nPulled ${eccWritten.length} artifact(s) from ECC.`);
          }
        } catch (err) {
          console.error(`ECC fetch failed: ${err.message}`);
        }
      }

      // Orchestrator integration
      if (orchestratorArg && !dryRun) {
        const ORCHESTRATORS = {
          obra: {
            label: 'obra/superpowers',
            install: '/plugin install superpowers',
            note: 'BookLib skills are already in ~/.claude/skills/ — superpowers will surface them via the Skill tool.',
          },
          ruflo: {
            label: 'ruflo',
            install: 'npm install -g ruflo',
            note: 'BookLib skills are already in ~/.claude/skills/ — ruflo will surface them via the Skill tool.',
          },
        };
        const orch = ORCHESTRATORS[orchestratorArg];
        if (!orch) {
          console.log(`\nUnknown orchestrator "${orchestratorArg}". Available: ${Object.keys(ORCHESTRATORS).join(', ')}`);
        } else {
          console.log(`\n🐝 Orchestrator: ${orch.label}`);
          console.log(`   Install : ${orch.install}`);
          console.log(`   Note    : ${orch.note}`);
        }
      }

      if (!dryRun) {
        console.log('\nDone. Add these files to your repo so all AI tools share the same standards.');
        console.log('Re-run after adding new skills: booklib init');
        if (!orchestratorArg) {
          console.log('Tip: booklib init --orchestrator=obra|ruflo  to add an agent orchestrator');
        }
      }
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
  booklib init [--tool=cursor|claude|copilot|gemini|all] [--skills=s1,s2]
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

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
