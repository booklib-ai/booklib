#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { fileURLToPath } from 'node:url';

const SKILLS_DIR = path.resolve(fileURLToPath(import.meta.url), '../../skills');
const REQUIRED = ['name', 'description', 'version', 'tags', 'license'];

let failures = 0;
for (const skill of fs.readdirSync(SKILLS_DIR)) {
  const file = path.join(SKILLS_DIR, skill, 'SKILL.md');
  if (!fs.existsSync(file)) continue;
  const { data } = matter(fs.readFileSync(file, 'utf8'));
  const missing = REQUIRED.filter(field => {
    const v = data[field];
    return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
  });
  if (missing.length) {
    console.log(`MISSING in ${skill}: ${missing.join(', ')}`);
    failures++;
  }
}
if (failures === 0) console.log('All skills compliant.');
process.exit(failures > 0 ? 1 : 0);
