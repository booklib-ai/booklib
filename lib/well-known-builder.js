import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const BUNDLED_SKILLS_DIR = path.join(PACKAGE_ROOT, 'skills');
const DEFAULT_OUT = path.join(PACKAGE_ROOT, 'docs', '.well-known', 'skills', 'default');

export class WellKnownBuilder {
  constructor({ outDir = DEFAULT_OUT } = {}) {
    this.outDir = outDir;
  }

  async build() {
    const skills = this._readBundledSkills();
    const content = this._render(skills);
    fs.mkdirSync(this.outDir, { recursive: true });
    const outPath = path.join(this.outDir, 'skill.md');
    fs.writeFileSync(outPath, content);
    return outPath;
  }

  _readBundledSkills() {
    return fs.readdirSync(BUNDLED_SKILLS_DIR)
      .map(name => {
        const file = path.join(BUNDLED_SKILLS_DIR, name, 'SKILL.md');
        if (!fs.existsSync(file)) return null;
        const { data } = matter(fs.readFileSync(file, 'utf8'));
        return { name: data.name ?? name, description: data.description ?? '', tags: data.tags ?? [] };
      })
      .filter(Boolean);
  }

  _render(skills) {
    const list = skills
      .map(s => `- **${s.name}**: ${String(s.description).replace(/\s+/g, ' ').slice(0, 120)}`)
      .join('\n');

    return `---
name: booklib-skills
description: >
  BookLib — curated skills from canonical programming books. Covers Kotlin,
  Python, Java, TypeScript, Rust, architecture, DDD, data-intensive systems,
  UI design, and more. Install individual skills via npx skillsadd booklib-ai/skills/<name>.
version: "1.0"
license: MIT
tags: [books, knowledge, all-languages, architecture, best-practices]
---

# BookLib Skills

Book knowledge distilled into structured AI skills. Install any skill with:

\`\`\`
npx skillsadd booklib-ai/skills/<skill-name>
\`\`\`

## Available Skills

${list}

## Install Everything

\`\`\`bash
npm install -g @booklib/skills && booklib init
\`\`\`
`;
  }
}
