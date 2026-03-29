import fs from 'fs';
import path from 'path';
import https from 'https';
import { SKILL_REGISTRY } from './registry/skills.js';
import { BookLibIndexer } from './engine/indexer.js';

/**
 * Handles adding new skills from the registry or external URLs.
 */
export class BookLibInstaller {
  constructor() {
    this.indexer = new BookLibIndexer();
  }

  async add(skillId) {
    const registryEntry = SKILL_REGISTRY.find(s => s.id === skillId);
    let url = registryEntry ? registryEntry.url : skillId;

    if (!url.startsWith('http')) {
      throw new Error(`Invalid skill ID or URL: ${skillId}`);
    }

    console.log(`Fetching skill from ${url}...`);
    let content = await this.fetchUrl(url);
    
    // Universal Adapter: Ensure the content is wrapped in BookLib tags for retrieval
    if (!content.includes('<framework>') && !content.includes('<core_principles>')) {
      console.log('External skill detected. Applying Universal Wrap...');
      content = `
---
name: ${registryEntry ? registryEntry.id : 'external-skill'}
source: ${url}
---

# ${registryEntry ? registryEntry.name : 'External Skill'}

<framework>
${content}
</framework>

> **Note**: This skill was automatically optimized by the BookLib Universal Engine.
`;
    }

    const targetDir = path.join(process.cwd(), 'skills', registryEntry ? registryEntry.id : 'external');
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const targetFile = path.join(targetDir, 'SKILL.md');
    fs.writeFileSync(targetFile, content);
    console.log(`Skill saved to ${targetFile}`);

    console.log('Re-indexing to include new skill...');
    await this.indexer.indexDirectory(targetDir);
    console.log('Success.');
  }

  fetchUrl(url) {
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => resolve(data));
      }).on('error', reject);
    });
  }
}
