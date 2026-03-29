import fs from 'fs';
import path from 'path';
import { parseSkillFile } from './parser.js';
import { resolveBookLibPaths } from '../paths.js';

/**
 * Handles the creation of 'Hybrid Skills' by combining wisdom from multiple sources.
 */
export class BookLibSynthesizer {
  constructor() {}

  /**
   * Synthesizes multiple skills into a single 'Master Standard' template.
   * 
   * @param {Array<string>} skillNames - List of skill folders to combine.
   * @param {string} projectType - Brief description of the project context.
   * @returns {string} - A unified synthesis prompt for the agent.
   */
  async synthesize(skillNames, projectType = 'Universal Project') {
    const skills = [];

    for (const name of skillNames) {
      const skillPath = path.join(resolveBookLibPaths().skillsPath, name, 'SKILL.md');
      if (fs.existsSync(skillPath)) {
        const content = fs.readFileSync(skillPath, 'utf8');
        const chunks = parseSkillFile(content, skillPath);
        skills.push({ name, chunks });
      }
    }

    if (skills.length === 0) {
      throw new Error(`No valid skills found for synthesis: ${skillNames.join(', ')}`);
    }

    let synthesisOutput = `
# 🧪 BookLib Dynamic Synthesis: ${projectType}
**Combined Wisdom from**: ${skillNames.join(', ')}

## 🛠 Instructions for the Agent
You are acting as a Senior Consultant. Your task is to resolve conflicts between these experts and create a unified **Standard Operating Procedure (SOP)** for this project.

### Step 1: Combine Frameworks
Merge the following principles into a single cohesive workflow. If two authors disagree, prioritize the one most relevant to "${projectType}".

${skills.map(s => {
  const framework = s.chunks.find(c => c.metadata.type === 'framework' || c.metadata.type === 'core_principles')?.text || 'See metadata';
  return `#### From ${s.name}:\n${framework}`;
}).join('\n\n')}

### Step 2: Unify Pitfalls
Combine the anti-patterns and pitfalls from all sources into a "Stop List".

${skills.map(s => {
  const pitfalls = s.chunks.find(c => c.metadata.type === 'pitfalls' || c.metadata.type === 'anti_patterns')?.text || 'See metadata';
  return `#### From ${s.name}:\n${pitfalls}`;
}).join('\n\n')}

### Step 3: Generate the Final SOP
Write a new \`.cursorrules\` or \`CLAUDE.md\` file that embodies this synthesized wisdom. Ensure it is:
1. **Surgical**: Only includes rules relevant to "${projectType}".
2. **Actionable**: Provides concrete examples.
3. **Cited**: Mentions which author contributed each rule.

---
> **Synthesized by the BookLib Universal Engine.**
`;

    return synthesisOutput;
  }
}
