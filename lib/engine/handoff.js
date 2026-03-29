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
   * Enhanced with git state, uncommitted changes, and recent commits tracking.
   * For long-running chats: includes recent commit history as implicit memory.
   */
  saveState({ name, goal, next, progress, skills }) {
    if (!fs.existsSync(this.handoffDir)) {
      fs.mkdirSync(this.handoffDir, { recursive: true });
    }

    // Capture git state
    let gitInfo = '';
    let recentCommits = '';
    try {
      const branch = execSync('git rev-parse --abbrev-ref HEAD', { stdio: 'pipe' }).toString().trim();
      const lastCommit = execSync('git log -1 --format=%H%n%s', { stdio: 'pipe' }).toString().trim().split('\n');
      const stagedFiles = execSync('git diff --name-only --cached', { stdio: 'pipe' }).toString().trim().split('\n').filter(Boolean);
      const unstagedFiles = execSync('git diff --name-only', { stdio: 'pipe' }).toString().trim().split('\n').filter(Boolean);
      
      // Capture last 10 commits (implicit chat memory via commit messages)
      const commits = execSync('git log --oneline -10', { stdio: 'pipe' }).toString().trim().split('\n');
      recentCommits = commits.map(c => `      ${c}`).join('\n');
      
      gitInfo = `
  <git_state>
    <branch>${branch}</branch>
    <last_commit_sha>${lastCommit[0]}</last_commit_sha>
    <last_commit_msg>${lastCommit[1] || 'N/A'}</last_commit_msg>
    <uncommitted_changes>
      <staged_files>${stagedFiles.length > 0 ? stagedFiles.join(', ') : 'None'}</staged_files>
      <modified_files>${unstagedFiles.length > 0 ? unstagedFiles.join(', ') : 'None'}</modified_files>
    </uncommitted_changes>
    <recent_commit_history>
      <note>Use this as implicit context: each commit message documents decisions made</note>
${recentCommits}
    </recent_commit_history>
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
    <note>For long chats: review recent_commit_history below for detailed reasoning and decisions</note>
  </context>

  <active_knowledge>
    ${(skills || []).map(s => `<skill id="${s}" />`).join('\n    ')}
  </active_knowledge>
${gitInfo}

  <recovery_instructions>
    <step1>Run: \`node bin/booklib.js resume ${name || this.getAutoSessionId()}\` to load this context</step1>
    <step2>Review the pending_tasks above</step2>
    <step3>CHECK RECENT COMMIT HISTORY (git_state/recent_commit_history) for chat reasoning</step3>
    <step4>If resuming in a different session, ensure you're in the correct working_directory</step4>
    <step5>Run: \`git log --oneline -20\` to see full history if needed</step5>
  </recovery_instructions>

  <long_chat_recovery_guide>
    <context_source>Since conversation transcripts aren't saved, use these sources:</context_source>
    <source1>Recent commit messages (above) document each decision</source1>
    <source2>Run: \`git show\` on recent commits to see code changes + reasoning</source2>
    <source3>Run: \`git log -p --follow -- &lt;file&gt;\` to see file evolution</source3>
    <source4>Pending_tasks above shows immediate next steps</source4>
    <source5>Active skills tell you which frameworks were being applied</source5>
  </long_chat_recovery_guide>
</session_handoff>
`;

    fs.writeFileSync(sessionPath, content.trim());
    console.log(`✅ Session snapshot saved to ${sessionPath}`);
    console.log(`📝 Git state captured: branch, commits, uncommitted changes`);
    console.log(`📚 Recent 10 commits saved for implicit chat memory`);
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
