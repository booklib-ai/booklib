#!/usr/bin/env node

import path from 'path';
import { BookLibIndexer } from '../lib/engine/indexer.js';
import { BookLibSearcher } from '../lib/engine/searcher.js';
import { BookLibHandoff } from '../lib/engine/handoff.js';
import { BookLibAuditor } from '../lib/engine/auditor.js';
import { BookLibRegistrySearcher } from '../lib/registry-searcher.js';
import { BookLibInstaller } from '../lib/installer.js';
import { BookLibSynthesizer } from '../lib/engine/synthesizer.js';
import { BookLibScanner } from '../lib/engine/scanner.js';

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  switch (command) {
    case 'index': {
      const clear = args.includes('--clear');
      const dirArg = args.find((a, i) => i > 0 && !a.startsWith('--'));
      const dir = dirArg || path.join(process.cwd(), 'skills');
      
      const indexer = new BookLibIndexer();
      await indexer.indexDirectory(dir, clear);
      break;
    }

    case 'search': {
      const query = args[1];
      if (!query) {
        console.error('Usage: booklib search "<query>"');
        process.exit(1);
      }
      
      const hybrid = new BookLibRegistrySearcher();
      const results = await hybrid.searchHybrid(query);
      
      if (results.local.length === 0 && results.suggested.length === 0) {
        console.log('No relevant skills found locally or in the registry.');
      } else {
        if (results.local.length > 0) {
          console.log('--- LOCAL RESULTS ---');
          console.log(JSON.stringify(results.local, null, 2));
        }
        if (results.suggested.length > 0) {
          console.log('\n--- SUGGESTED FROM INDUSTRY REGISTRY ---');
          console.log('The following refined skills match your query. Run "booklib add <id>" to install:');
          results.suggested.forEach(s => console.log(`- ${s.id} (${s.name} by ${s.author}): ${s.description}`));
        }
      }
      break;
    }

    case 'add': {
      const skillId = args[1];
      if (!skillId) {
        console.error('Usage: booklib add <skill-id|url>');
        process.exit(1);
      }
      const installer = new BookLibInstaller();
      await installer.add(skillId);
      break;
    }

    case 'synthesize': {
      const skillIds = args[1]?.split(',');
      const project = args[2] || 'New Project';
      
      if (!skillIds) {
        console.error('Usage: booklib synthesize <skill1,skill2> ["Project Name"]');
        process.exit(1);
      }

      const synthesizer = new BookLibSynthesizer();
      const prompt = await synthesizer.synthesize(skillIds, project);
      console.log(prompt);
      break;
    }

    case 'save-state': {
      const handoff = new BookLibHandoff();
      const getArg = (name) => {
        const idx = args.findIndex(a => a === `--${name}`);
        return (idx !== -1 && args[idx + 1]) ? args[idx + 1] : null;
      };

      handoff.saveState({
        name: getArg('name'),
        goal: getArg('goal'),
        next: getArg('next'),
        progress: getArg('progress'),
        skills: getArg('skills')?.split(',')
      });
      break;
    }

    case 'resume': {
      const handoff = new BookLibHandoff();
      const name = args.find((a, i) => i > 0 && !a.startsWith('--'));
      console.log(handoff.resume(name));
      break;
    }

    case 'list-sessions': {
      const handoff = new BookLibHandoff();
      const sessions = handoff.listSessions();
      if (sessions.length === 0) {
        console.log('No active session snapshots found.');
      } else {
        console.log('Active BookLib Sessions:');
        sessions.forEach(s => console.log(`- ${s}`));
      }
      break;
    }

    case 'audit': {
      const skillName = args[1];
      const targetFile = args[2];
      if (!skillName || !targetFile) {
        console.error('Usage: booklib audit <skill-name> <target-file>');
        process.exit(1);
      }
      const skillPath = path.join(process.cwd(), 'skills', skillName);
      const auditor = new BookLibAuditor();
      const report = await auditor.audit(skillPath, targetFile);
      console.log(report);
      break;
    }

    case 'scan': {
      const dirArg = args.find((a, i) => i > 0 && !a.startsWith('--'));
      const dir = dirArg || process.cwd();
      const scanner = new BookLibScanner();
      const report = await scanner.scan(dir);
      console.log(report);
      break;
    }

    default:
      console.log(`
BookLib Universal Engine — Local Semantic RAG for Skills

Usage:
  booklib index [dir] [--clear]   Index a directory of skills (default: ./skills)
  booklib search "<query>"       Perform semantic search + registry suggestions
  booklib add <id|url>           Install a refined skill from registry or URL
  booklib synthesize <s1,s2>     Combine multiple experts into a project SOP
  booklib save-state [options]   Save a session snapshot for the next agent
    --name "<session-name>"      (Defaults to current git branch)
    --goal "<goal>"
    --next "<next task>"
    --progress "<progress>"
    --skills "<skill1,skill2>"
  booklib resume [name]          Resume context from a snapshot (defaults to current branch)
  booklib list-sessions          List all available session snapshots
  booklib audit <skill> <file>   Perform a systematic audit against a skill
  booklib scan [dir]             Scan a project for architectural debt (default: cwd)
`);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
