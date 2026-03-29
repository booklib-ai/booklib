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
import { BookLibDashboard } from '../lib/engine/dashboard.js';
import { BookLibAIFeatures } from '../lib/engine/ai-features.js';

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  switch (command) {
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

    case 'hooks': {
      const mgr = new BookLibSessionManager(process.cwd());
      if (args[1] === 'install') {
        const result = mgr.installGitHooks();
        console.log(`✅ Installed hooks: ${result.installed.join(', ')}`);
      }
      break;
    }

    case 'dashboard': {
      const dashboard = new BookLibDashboard(process.cwd());
      dashboard.start();
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

    default:
      console.log(`
BookLib Enhanced Session Manager

✨ NEW FEATURES (15 Enhancements):

LAYER 1 - HIGH-IMPACT:
  booklib sessions cleanup --before 90days       Archive old sessions
  booklib sessions diff <id1> <id2>              Compare two sessions
  booklib sessions find <name>                   Find session (local+global)
  booklib hooks install                          Install git auto-save

LAYER 2 - QUALITY-OF-LIFE:
  booklib sessions create --template=<t> <n>    Create from template
  booklib sessions search <query>                Search by content
  booklib sessions tag <id> --add=tag1,tag2      Tag sessions
  booklib sessions validate [id]                 Check quality
  booklib sessions report --since "2 weeks"      Team report

LAYER 3 - ADVANCED:
  booklib sessions history <id>                  Version history
  booklib sessions encrypt <id>                  Encrypt metadata
  booklib dashboard                              Start web UI (port 3000)
  booklib sessions summarize <id> --ai           AI summaries

LAYER 4 - INTEGRATIONS:
  booklib extension-data                         VSCode/IDE data
  booklib github-integration <id>                GitHub wiki/issues
  booklib slack-integration <id>                 Slack notifications

`);
  }
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
