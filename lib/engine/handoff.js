import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

/**
 * Manages agent session snapshots for multi-agent handoffs.
 */
export class BookLibHandoff {
  constructor(handoffDir = path.join(process.cwd(), '.booklib', 'sessions')) {
    this.handoffDir = handoffDir;
  }

  /**
   * Automatically detects a session ID based on Git branch or folder name + timestamp.
   */
  getAutoSessionId() {
    try {
      // 1. Try Git Branch
      return execSync('git rev-parse --abbrev-ref HEAD', { stdio: 'pipe' }).toString().trim();
    } catch {
      // 2. Fallback to Folder Name + Date (for non-git or unrelated chats)
      const folder = path.basename(process.cwd());
      const date = new Date().toISOString().split('T')[0];
      return `${folder}-${date}`;
    }
  }

  /**
   * Resolves the file path for a session.
   */
  getSessionPath(name) {
    const sessionName = name || this.getAutoSessionId();
    return path.join(this.handoffDir, `${sessionName}.md`);
  }

  /**
   * Saves the current agent session state to a file.
   * Enhanced with git state and uncommitted changes tracking.
   */
  saveState({ name, goal, next, progress, skills }) {
    if (!fs.existsSync(this.handoffDir)) {
      fs.mkdirSync(this.handoffDir, { recursive: true });
    }

    // Capture git state
    let gitInfo = '';
    try {
      const branch = execSync('git rev-parse --abbrev-ref HEAD', { stdio: 'pipe' }).toString().trim();
      const lastCommit = execSync('git log -1 --format=%H%n%s', { stdio: 'pipe' }).toString().trim().split('\n');
      const stagedFiles = execSync('git diff --name-only --cached', { stdio: 'pipe' }).toString().trim().split('\n').filter(Boolean);
      const unstagedFiles = execSync('git diff --name-only', { stdio: 'pipe' }).toString().trim().split('\n').filter(Boolean);
      
      gitInfo = `
  <git_state>
    <branch>${branch}</branch>
    <last_commit_sha>${lastCommit[0]}</last_commit_sha>
    <last_commit_msg>${lastCommit[1] || 'N/A'}</last_commit_msg>
    <uncommitted_changes>
      <staged_files>${stagedFiles.length > 0 ? stagedFiles.join(', ') : 'None'}</staged_files>
      <modified_files>${unstagedFiles.length > 0 ? unstagedFiles.join(', ') : 'None'}</modified_files>
    </uncommitted_changes>
  </git_state>`;
    } catch (err) {
      gitInfo = `
  <git_state>
    <warning>Could not capture git state. Verify changes are committed before resuming.</warning>
  </git_state>`;
    }

    const sessionPath = this.getSessionPath(name);
    const content = `
<session_handoff>
  <metadata>
    <timestamp>${new Date().toISOString()}</timestamp>
    <session_id>${name || this.getAutoSessionId()}</session_id>
    <working_directory>${process.cwd()}</working_directory>
  </metadata>

  <context>
    <goal>${goal || 'Not specified'}</goal>
    <progress>${progress || 'Just started'}</progress>
    <pending_tasks>${next || 'Determine next steps'}</pending_tasks>
  </context>

  <active_knowledge>
    ${(skills || []).map(s => `<skill id="${s}" />`).join('\n    ')}
  </active_knowledge>
${gitInfo}

  <recovery_instructions>
    <step1>Run: \`node bin/booklib.js resume ${name || this.getAutoSessionId()}\` to load this context</step1>
    <step2>Review the pending_tasks above</step2>
    <step3>Check git_state to see if there are uncommitted changes to address</step3>
    <step4>If resuming in a different session, ensure you're in the correct working_directory</step4>
  </recovery_instructions>
</session_handoff>
`;

    fs.writeFileSync(sessionPath, content.trim());
    console.log(`✅ Session snapshot saved to ${sessionPath}`);
    console.log(`📝 Git state captured: branch, last commit, uncommitted changes tracked`);
  }

  /**
   * Resumes the session by reading the handoff file.
   */
  resume(name) {
    const sessionPath = this.getSessionPath(name);
    
    if (!fs.existsSync(sessionPath)) {
      const sessions = this.listSessions();
      if (sessions.length > 0) {
        return `No snapshot found for "${name || this.getAutoSessionId()}". \nAvailable sessions: ${sessions.join(', ')}`;
      }
      return 'No handoff files found in .booklib/sessions/. Starting a fresh session.';
    }

    const content = fs.readFileSync(sessionPath, 'utf8');
    return `
=== RESUMING SESSION [${name || this.getAutoSessionId()}] ===
An previous agent has left a context snapshot for you. 
Please read the following handoff details and continue the work:

${content}
`;
  }

  /**
   * Lists all available handoff sessions.
   */
  listSessions() {
    if (!fs.existsSync(this.handoffDir)) return [];
    return fs.readdirSync(this.handoffDir)
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace('.md', ''));
  }
}
