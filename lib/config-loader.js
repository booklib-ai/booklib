import fs from 'fs';
import { resolveBookLibPaths } from './paths.js';

const DEFAULT_CONFIG = {
  sources: [
    { type: 'registry', trusted: true }
  ],
  discovery: {
    ttlHours: 24
  },
  search: {
    minScore: 0.3,
    registryFallbackThreshold: 0.4
  }
};

/**
 * Loads booklib.config.json from project-local or global user dir.
 * Returns DEFAULT_CONFIG if no config file is found.
 * User config is shallow-merged with defaults so missing keys always have values.
 */
export function loadConfig(projectCwd) {
  const { configPath } = resolveBookLibPaths(projectCwd);

  let userConfig = {};
  if (fs.existsSync(configPath)) {
    try {
      userConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch {
      // malformed config — fall back to defaults silently
    }
  }

  return {
    sources:   userConfig.sources   ?? DEFAULT_CONFIG.sources,
    discovery: { ...DEFAULT_CONFIG.discovery,   ...(userConfig.discovery   ?? {}) },
    search:    { ...DEFAULT_CONFIG.search,       ...(userConfig.search      ?? {}) },
  };
}
