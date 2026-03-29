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
   */
  saveState({ name, goal, next, progress, skills }) {
    if (!fs.existsSync(this.handoffDir)) {
      fs.mkdirSync(this.handoffDir, { recursive: true });
    }

    const sessionPath = this.getSessionPath(name);
    const content = `
<session_handoff>
  <metadata>
    <timestamp>${new Date().toISOString()}</timestamp>
    <session_id>${name || this.getAutoSessionId()}</session_id>
  </metadata>

  <context>
    <goal>${goal || 'Not specified'}</goal>
    <progress>${progress || 'Just started'}</progress>
    <pending_tasks>${next || 'Determine next steps'}</pending_tasks>
  </context>

  <active_knowledge>
    ${(skills || []).map(s => `<skill id="${s}" />`).join('\n    ')}
  </active_knowledge>
</session_handoff>
`;

    fs.writeFileSync(sessionPath, content.trim());
    console.log(`Session snapshot saved to ${sessionPath}`);
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
