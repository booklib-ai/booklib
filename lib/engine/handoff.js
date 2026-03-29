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

  /**
   * Sets up automatic handoff saving on process exit (SIGINT, SIGTERM, SIGHUP).
   * Catches the case where user forgets to explicitly call save-state.
   * 
   * Usage: 
   *   const handoff = new BookLibHandoff();
   *   handoff.setupAutoSave({
   *     goal: 'Build payment processor',
   *     progress: 'Phase 2 in progress',
   *     next: 'Implement webhook handler',
   *     skills: ['effective-typescript', 'clean-code-reviewer']
   *   });
   */
  setupAutoSave(options = {}) {
    const { goal, progress, next, skills } = options;
    const sessionId = this.getAutoSessionId();
    
    const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
    
    signals.forEach(signal => {
      process.on(signal, () => {
        try {
          console.log('\n⚠️  Session interrupted. Auto-saving handoff...');
          this.saveState({
            name: sessionId,
            goal: goal || 'Session interrupted - see git log for context',
            progress: progress || 'In progress - check recent commits',
            next: next || 'Resume from last commit',
            skills: skills || []
          });
          console.log(`✅ Auto-saved to ~/.booklib/sessions/${sessionId}.md`);
          console.log(`💡 Next agent can resume with: booklib resume`);
          process.exit(0);
        } catch (err) {
          console.error('⚠️  Auto-save failed:', err.message);
          process.exit(1);
        }
      });
    });
  }

  /**
   * Recovers handoff state from session files OR git (100% coverage).
   * 
   * Priority order:
   * 1. Explicit session file for current branch
   * 2. Parent session (via lineage)
   * 3. Most recent session on same branch
   * 4. Git-based recovery (fallback)
   * 
   * Usage:
   *   const recovered = handoff.recoverFromSessionOrGit();
   *   console.log(recovered);
   */
  recoverFromSessionOrGit() {
    const branch = this._getCurrentBranch();
    const sessionPath = this.getSessionPath(branch);

    // Try 1: Explicit session file for current branch
    if (fs.existsSync(sessionPath)) {
      const content = fs.readFileSync(sessionPath, 'utf8');
      return `
SESSION-BASED RECOVERY (found matching session)
═══════════════════════════════════════════════════

Branch: ${branch}
Status: Session file found for this branch ✅

${content}

NEXT STEPS:
1. Review the context above from the previous agent
2. Check git status for any uncommitted work
3. Run: git log --oneline -5 to see recent commits
4. Continue work as indicated in pending_tasks above
`;
    }

    // Try 2: Check lineage for parent session
    const parentSession = this._getParentSession(branch);
    if (parentSession) {
      const parentPath = this.getSessionPath(parentSession);
      if (fs.existsSync(parentPath)) {
        const content = fs.readFileSync(parentPath, 'utf8');
        return `
SESSION-BASED RECOVERY (found parent session in lineage)
═════════════════════════════════════════════════════════

Branch: ${branch}
Status: No explicit session for this branch, but parent "${parentSession}" found ✅

PARENT SESSION CONTEXT:
${content}

RECOVERY INTERPRETATION:
- This branch was created from: ${parentSession}
- Parent agent's work provides the base context
- Any commits since parent session show your additional work
- Run: git log ${parentSession}..HEAD to see your new commits

NEXT STEPS:
1. Review parent session context above
2. Run: git diff ${parentSession}..HEAD to see your changes
3. Review pending_tasks from parent session
4. Continue or adjust based on what you've added
`;
      }
    }

    // Try 3: Most recent session on same branch
    const recentSession = this._getMostRecentSessionOnBranch(branch);
    if (recentSession) {
      const recentPath = this.getSessionPath(recentSession);
      if (fs.existsSync(recentPath)) {
        const content = fs.readFileSync(recentPath, 'utf8');
        return `
SESSION-BASED RECOVERY (found recent session on branch)
═══════════════════════════════════════════════════════

Branch: ${branch}
Status: Using most recent session on this branch: "${recentSession}" ✅

${content}

RECOVERY INTERPRETATION:
- This is the most recent session saved on this branch
- Any new commits since this session represent your continued work
- Run: git log ${recentSession}.. to see what you did after this session

NEXT STEPS:
1. Review the session context above
2. Check your recent commits for what you accomplished
3. Review pending_tasks from the session
4. Continue from where you left off
`;
      }
    }

    // Fallback: Git-based recovery
    return this.recoverFromGit();
  }

  // ─── HELPER METHODS FOR ENHANCED RECOVERY ───

  /**
   * Gets current git branch.
   */
  _getCurrentBranch() {
    try {
      return execSync('git rev-parse --abbrev-ref HEAD', { stdio: 'pipe' }).toString().trim();
    } catch {
      return 'unknown';
    }
  }

  /**
   * Gets parent session from lineage file.
   */
  _getParentSession(branch) {
    const lineageFile = path.join(this.handoffDir, '_lineage.json');
    if (!fs.existsSync(lineageFile)) return null;

    try {
      const lineage = JSON.parse(fs.readFileSync(lineageFile, 'utf8'));
      return lineage[branch]?.parent || null;
    } catch {
      return null;
    }
  }

  /**
   * Finds most recent session saved on current branch.
   */
  _getMostRecentSessionOnBranch(branch) {
    if (!fs.existsSync(this.handoffDir)) return null;

    const sessions = fs.readdirSync(this.handoffDir)
      .filter(f => f.endsWith('.md') && f !== '_lineage.json')
      .map(f => {
        const filePath = path.join(this.handoffDir, f);
        const content = fs.readFileSync(filePath, 'utf8');
        const branchMatch = content.match(/<branch>(.*?)<\/branch>/);
        const sessionBranch = branchMatch ? branchMatch[1] : null;
        
        return {
          name: f.replace('.md', ''),
          branch: sessionBranch,
          mtime: fs.statSync(filePath).mtime
        };
      })
      .filter(s => s.branch === branch)
      .sort((a, b) => b.mtime - a.mtime);

    return sessions.length > 0 ? sessions[0].name : null;
  }

  /**
   * Recovers handoff state from git when explicit save file is missing.
   * Useful if user forgets to save-state before quota hit.
   * 
   * Usage:
   *   const recovered = handoff.recoverFromGit();
   *   console.log(recovered);
   */
  recoverFromGit() {
    try {
      const branch = this._getCurrentBranch();
      const lastCommit = execSync('git log -1 --format=%H%n%s%n%b', { stdio: 'pipe' }).toString().trim().split('\n');
      const commits = execSync('git log --oneline -10', { stdio: 'pipe' }).toString().trim();
      const status = execSync('git status --short', { stdio: 'pipe' }).toString().trim();
      
      return `
GIT-BASED RECOVERY (no session files found)
═══════════════════════════════════════════

Branch: ${branch}

Last Commit: ${lastCommit[0]}
Message: ${lastCommit[1] || 'N/A'}

Recent 10 Commits:
${commits}

Uncommitted Changes:
${status || 'None'}

RECOVERY STEPS:
1. Review recent commits above to understand what was done
2. Run: git show <commit-sha> to see code + reasoning
3. Run: git log -p -- <file> to trace file evolution
4. Run: git status to see current work in progress
5. Create explicit handoff for next agent: booklib save-state

SAVE FOR NEXT TIME:
Call "booklib save-state" before quota exhaustion to preserve:
- Goal statement
- Progress summary
- Next tasks
- Active skills
- Recovery instructions
`;
    } catch (err) {
      return `Could not recover from git: ${err.message}. Check manual git history.`;
    }
  }
}
