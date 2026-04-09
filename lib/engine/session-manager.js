import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class BookLibSessionManager {
  constructor(projectRoot = process.cwd()) {
    this.projectRoot = projectRoot;
    this.sessionsDir = path.join(projectRoot, '.booklib/sessions');
    this.globalSessionsDir = path.join(os.homedir(), '.booklib/sessions');
    this.archiveDir = path.join(this.sessionsDir, '_archive');
    this.templatesDir = path.join(this.sessionsDir, '_templates');
    this.tagsFile = path.join(this.sessionsDir, '_tags.json');
    this.versionsDir = path.join(this.sessionsDir, '_versions');
    this.configFile = path.join(projectRoot, '.booklib/config.json');
    this.hooksDir = path.join(projectRoot, '.git/hooks');
  }

  findSession(sessionName, options = {}) {
    const { searchGlobal = false } = options;
    const projectSession = path.join(this.sessionsDir, `${sessionName}.md`);
    if (fs.existsSync(projectSession)) {
      return { path: projectSession, scope: 'project' };
    }
    if (searchGlobal || this._getConfig().indexFallback === 'global') {
      if (fs.existsSync(this.globalSessionsDir)) {
        const globalSession = path.join(this.globalSessionsDir, `${sessionName}.md`);
        if (fs.existsSync(globalSession)) {
          return { path: globalSession, scope: 'global' };
        }
      }
    }
    return null;
  }

  cleanupSessions(options = {}) {
    const { beforeDays = 90, archive = true, dryRun = false } = options;
    if (!fs.existsSync(this.sessionsDir)) return { archived: 0, deleted: 0 };
    
    const cutoffTime = Date.now() - (beforeDays * 24 * 60 * 60 * 1000);
    const files = fs.readdirSync(this.sessionsDir)
      .filter(f => f.endsWith('.md') && !f.startsWith('_'));
    
    let archived = 0, deleted = 0;
    const result = [];

    for (const file of files) {
      const filePath = path.join(this.sessionsDir, file);
      const stat = fs.statSync(filePath);

      if (stat.mtime.getTime() < cutoffTime) {
        const action = archive ? 'archive' : 'delete';
        result.push({ file, action, mtime: stat.mtime });

        if (!dryRun) {
          if (archive) {
            this._archiveFile(filePath);
            archived++;
          } else {
            fs.unlinkSync(filePath);
            deleted++;
          }
        }
      }
    }

    return { archived, deleted, preview: result };
  }

  diffSessions(session1Name, session2Name) {
    const s1 = this.findSession(session1Name);
    const s2 = this.findSession(session2Name);

    if (!s1 || !s2) {
      return { error: 'Session not found' };
    }

    const data1 = this._parseSession(fs.readFileSync(s1.path, 'utf8'));
    const data2 = this._parseSession(fs.readFileSync(s2.path, 'utf8'));

    return {
      session1: session1Name,
      session2: session2Name,
      goal: {
        s1: data1.goal,
        s2: data2.goal,
        changed: data1.goal !== data2.goal
      },
      progress: {
        s1: data1.progress,
        s2: data2.progress,
        changed: data1.progress !== data2.progress
      },
      tasks: {
        s1: data1.pending_tasks,
        s2: data2.pending_tasks,
        conflicts: this._detectConflicts(data1.pending_tasks, data2.pending_tasks)
      },
      skills: {
        s1: data1.skills,
        s2: data2.skills,
        added: data2.skills.filter(s => !data1.skills.includes(s)),
        removed: data1.skills.filter(s => !data2.skills.includes(s))
      }
    };
  }

  installGitHooks() {
    if (!fs.existsSync(this.hooksDir)) {
      fs.mkdirSync(this.hooksDir, { recursive: true });
    }

    const postCommitPath = path.join(this.hooksDir, 'post-commit');
    const postCommitContent = `#!/bin/bash
if [ -f ".booklib/handoff.md" ]; then
  node bin/booklib.js sessions auto-save
fi
`;
    if (!fs.existsSync(postCommitPath)) {
      fs.writeFileSync(postCommitPath, postCommitContent);
      fs.chmodSync(postCommitPath, 0o755);
    }

    const postCheckoutPath = path.join(this.hooksDir, 'post-checkout');
    const postCheckoutContent = `#!/bin/bash
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ -f ".booklib/sessions/\${BRANCH}.md" ]; then
  echo "📝 Restored session for branch: \${BRANCH}"
fi
`;
    if (!fs.existsSync(postCheckoutPath)) {
      fs.writeFileSync(postCheckoutPath, postCheckoutContent);
      fs.chmodSync(postCheckoutPath, 0o755);
    }

    return { installed: ['post-commit', 'post-checkout'] };
  }

  createFromTemplate(templateName, sessionName, overrides = {}) {
    const templatePath = path.join(this.templatesDir, `${templateName}.md`);
    
    if (!fs.existsSync(templatePath)) {
      return { error: `Template not found: ${templateName}` };
    }

    let content = fs.readFileSync(templatePath, 'utf8');
    content = content.replace(/\{\{session_name\}\}/g, sessionName);
    content = content.replace(/\{\{timestamp\}\}/g, new Date().toISOString());
    
    if (overrides.goal) {
      content = content.replace(/goal>.+?<\/goal/, `goal>${overrides.goal}</goal`);
    }

    const sessionPath = path.join(this.sessionsDir, `${sessionName}.md`);
    fs.writeFileSync(sessionPath, content);

    return { created: sessionPath, template: templateName };
  }

  searchSessions(query, options = {}) {
    if (!fs.existsSync(this.sessionsDir)) return [];

    const files = fs.readdirSync(this.sessionsDir)
      .filter(f => f.endsWith('.md') && !f.startsWith('_'));
    
    const results = [];
    const lowerQuery = query.toLowerCase();

    for (const file of files) {
      const filePath = path.join(this.sessionsDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const data = this._parseSession(content);

      const matches = 
        data.goal.toLowerCase().includes(lowerQuery) ||
        data.progress.toLowerCase().includes(lowerQuery) ||
        (data.tags && data.tags.some(t => t.toLowerCase().includes(lowerQuery)));

      if (matches) {
        results.push({
          name: file.replace('.md', ''),
          goal: data.goal.substring(0, 50),
          tags: data.tags || [],
          timestamp: data.timestamp
        });
      }
    }

    return results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  tagSession(sessionName, tags, action = 'add') {
    let allTags = this._loadTags();
    
    if (!allTags[sessionName]) {
      allTags[sessionName] = [];
    }

    if (action === 'add') {
      allTags[sessionName] = [...new Set([...allTags[sessionName], ...tags])];
    } else if (action === 'remove') {
      allTags[sessionName] = allTags[sessionName].filter(t => !tags.includes(t));
    }

    this._saveTags(allTags);
    return { session: sessionName, tags: allTags[sessionName] };
  }

  generateReport(options = {}) {
    const { since = null, groupBy = null } = options;
    
    if (!fs.existsSync(this.sessionsDir)) {
      return { sessions: 0, report: {} };
    }

    const files = fs.readdirSync(this.sessionsDir)
      .filter(f => f.endsWith('.md') && !f.startsWith('_'));
    
    const sessions = [];
    const sinceTime = since ? new Date(since).getTime() : 0;

    for (const file of files) {
      const filePath = path.join(this.sessionsDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const data = this._parseSession(content);

      if (new Date(data.timestamp).getTime() >= sinceTime) {
        sessions.push(data);
      }
    }

    const stats = {
      total_sessions: sessions.length,
      total_tasks: sessions.reduce((sum, s) => sum + (s.pending_tasks ? s.pending_tasks.split('\n').length : 0), 0),
      total_skills: [...new Set(sessions.flatMap(s => s.skills || []))].length,
      unique_skills: [...new Set(sessions.flatMap(s => s.skills || []))],
      by_branch: this._groupBy(sessions, 'branch'),
      recent_activity: sessions.slice(0, 5).map(s => ({
        name: s.session_id,
        timestamp: s.timestamp,
        goal: s.goal
      }))
    };

    return stats;
  }

  validateSession(sessionName) {
    const session = this.findSession(sessionName);
    if (!session) return { valid: false, errors: ['Session not found'] };

    const content = fs.readFileSync(session.path, 'utf8');
    const data = this._parseSession(content);
    const errors = [];
    const warnings = [];

    if (!data.goal || data.goal.length < 10) {
      errors.push('Goal too vague (< 10 characters)');
    }

    if (!data.progress || data.progress.length < 10) {
      warnings.push('Progress not detailed enough');
    }

    if (!data.pending_tasks || data.pending_tasks.length === 0) {
      warnings.push('No pending tasks defined');
    }

    if (!data.skills || data.skills.length === 0) {
      warnings.push('No skills specified');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      score: this._calculateSessionScore(data)
    };
  }

  saveVersion(sessionName, reason = 'auto-save') {
    const session = this.findSession(sessionName);
    if (!session) return { error: 'Session not found' };

    if (!fs.existsSync(this.versionsDir)) {
      fs.mkdirSync(this.versionsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const versionDir = path.join(this.versionsDir, sessionName);
    if (!fs.existsSync(versionDir)) {
      fs.mkdirSync(versionDir, { recursive: true });
    }

    const versionPath = path.join(versionDir, `${timestamp}.md`);
    const content = fs.readFileSync(session.path, 'utf8');
    fs.writeFileSync(versionPath, content);

    return { saved: versionPath, reason, timestamp };
  }

  getVersionHistory(sessionName) {
    const versionDir = path.join(this.versionsDir, sessionName);
    if (!fs.existsSync(versionDir)) return [];

    return fs.readdirSync(versionDir)
      .map(f => path.join(versionDir, f))
      .sort((a, b) => fs.statSync(b).mtime - fs.statSync(a).mtime)
      .map((p, i) => ({
        version: i + 1,
        timestamp: path.basename(p, '.md'),
        path: p
      }));
  }

  // PRIVATE METHODS

  _parseSession(content) {
    const extract = (tag) => {
      const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`);
      const match = content.match(regex);
      return match ? match[1].trim() : '';
    };

    const skillRegex = /<skill id="([^"]+)"/g;
    const skills = [];
    let match;
    while ((match = skillRegex.exec(content)) !== null) {
      skills.push(match[1]);
    }

    return {
      timestamp: extract('timestamp'),
      session_id: extract('session_id'),
      branch: extract('branch'),
      goal: extract('goal'),
      progress: extract('progress'),
      pending_tasks: extract('pending_tasks'),
      skills,
      tags: this._extractTags(extract('session_id'))
    };
  }

  _extractTags(sessionId) {
    const tagsFile = this._loadTags();
    return tagsFile[sessionId] || [];
  }

  _loadTags() {
    if (fs.existsSync(this.tagsFile)) {
      return JSON.parse(fs.readFileSync(this.tagsFile, 'utf8'));
    }
    return {};
  }

  _saveTags(tags) {
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }
    fs.writeFileSync(this.tagsFile, JSON.stringify(tags, null, 2));
  }

  _archiveFile(filePath) {
    if (!fs.existsSync(this.archiveDir)) {
      fs.mkdirSync(this.archiveDir, { recursive: true });
    }
    const fileName = path.basename(filePath);
    const destPath = path.join(this.archiveDir, fileName);
    fs.copyFileSync(filePath, destPath);
    fs.unlinkSync(filePath);
  }

  _detectConflicts(tasks1, tasks2) {
    if (!tasks1 || !tasks2) return [];
    const t1Array = tasks1.split('\n');
    const t2Array = tasks2.split('\n');
    return t1Array.filter(t => t2Array.some(t2 => t.toLowerCase() === t2.toLowerCase()));
  }

  _calculateSessionScore(data) {
    let score = 0;
    if (data.goal && data.goal.length > 10) score += 25;
    if (data.progress && data.progress.length > 20) score += 25;
    if (data.pending_tasks && data.pending_tasks.length > 0) score += 25;
    if (data.skills && data.skills.length > 0) score += 25;
    return score;
  }

  _groupBy(items, key) {
    return items.reduce((acc, item) => {
      const groupKey = item[key] || 'unknown';
      if (!acc[groupKey]) acc[groupKey] = [];
      acc[groupKey].push(item);
      return acc;
    }, {});
  }

  _getConfig() {
    if (fs.existsSync(this.configFile)) {
      return JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
    }
    return {};
  }
}
