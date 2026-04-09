import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const PACKAGE_ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..');

/**
 * Resolves the three-tier path hierarchy for BookLib:
 *   1. Project-local  — <cwd>/.booklib/
 *   2. Global user    — ~/.booklib/
 *   3. Package install — <npm package root>/.booklib/
 *
 * Returns the highest-priority paths that exist, falling back to
 * project-local as the write target when nothing exists yet.
 */
export function resolveBookLibPaths(projectCwd = process.cwd()) {
  const projectLocal  = path.join(projectCwd, '.booklib');
  const globalUser    = path.join(os.homedir(), '.booklib');
  const packageBuiltin = path.join(PACKAGE_ROOT, '.booklib');

  // Index: project-local is the write target for project docs.
  // Global (~/.booklib/index) is the write target for global docs.
  // Package index is a read-only fallback with bundled skills.
  // Search reads from all three; writes go to project-local by default.
  const indexCandidates = [
    path.join(projectLocal, 'index'),
    path.join(globalUser, 'index'),
    path.join(packageBuiltin, 'index'),
  ];
  // For search: use existing index (read). For write: always project-local.
  const existingIndex = indexCandidates.find(p => fs.existsSync(p));
  const indexPath = path.join(projectLocal, 'index');           // write target
  const readIndexPath = existingIndex ?? indexPath;              // read target (fallback chain)

  // Skills: use the first location that contains .md files
  const skillsCandidates = [
    path.join(projectCwd, 'skills'),
    path.join(globalUser, 'skills'),
    path.join(PACKAGE_ROOT, 'skills'),
  ];
  const existingSkills = skillsCandidates.find(p => {
    if (!fs.existsSync(p)) return false;
    try { return fs.readdirSync(p).length > 0; } catch { return false; }
  });
  const skillsPath = existingSkills ?? skillsCandidates[2]; // default = package bundled

  // Sessions: always project-local
  const sessionsPath = path.join(projectLocal, 'sessions');

  // Cache: always global user dir (downloaded skills land here)
  const cachePath = globalUser;

  // Config: project-local first, then global
  const configCandidates = [
    path.join(projectCwd, 'booklib.config.json'),
    path.join(globalUser, 'booklib.config.json'),
  ];
  const configPath = configCandidates.find(p => fs.existsSync(p)) ?? configCandidates[0];

  return { indexPath, readIndexPath, skillsPath, sessionsPath, cachePath, configPath };
}
