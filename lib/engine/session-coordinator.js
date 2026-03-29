import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

/**
 * Coordinates handoff sessions across multiple agents.
 * Enables session merging, lineage tracking, and cross-agent insights.
 */
export class BookLibSessionCoordinator {
  constructor(handoffDir = path.join(process.cwd(), '.booklib', 'sessions')) {
    this.handoffDir = handoffDir;
  }

  /**
   * Lists all available sessions with metadata.
   */
  listAllSessions() {
    if (!fs.existsSync(this.handoffDir)) return [];
    
    const sessions = fs.readdirSync(this.handoffDir)
      .filter(f => f.endsWith('.md'))
      .map(f => {
        const sessionName = f.replace('.md', '');
        const filePath = path.join(this.handoffDir, f);
        const stats = fs.statSync(filePath);
        const content = fs.readFileSync(filePath, 'utf8');
        
        // Extract key info without full XML parsing (faster)
        const goalMatch = content.match(/<goal>(.*?)<\/goal>/);
        const progressMatch = content.match(/<progress>(.*?)<\/progress>/);
        const branchMatch = content.match(/<branch>(.*?)<\/branch>/);
        
        return {
          id: sessionName,
          goal: goalMatch ? goalMatch[1] : 'Unknown',
          progress: progressMatch ? progressMatch[1] : 'Unknown',
          branch: branchMatch ? branchMatch[1] : 'Unknown',
          timestamp: stats.mtime,
          size: stats.size
        };
      });

    return sessions.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Merges multiple sessions into a combined session.
   * Useful for: combining work from parallel agents, multi-agent reviews, etc.
   * 
   * Usage:
   *   coordinator.mergeSessions(['agent-python', 'agent-kotlin'], 'combined-review')
   *   → Creates combined-review.md with insights from both
   */
  mergeSessions(sessionIds, outputSessionId) {
    const sessions = sessionIds.map(id => {
      const filePath = path.join(this.handoffDir, `${id}.md`);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Session not found: ${id}`);
      }
      return {
        id,
        content: fs.readFileSync(filePath, 'utf8')
      };
    });

    // Extract metadata from all sessions
    const merged = {
      metadata: {
        timestamp: new Date().toISOString(),
        session_id: outputSessionId,
        parent_sessions: sessionIds.join(', '),
        merge_type: 'multi-agent-combined'
      }
    };

    const outputPath = path.join(this.handoffDir, `${outputSessionId}.md`);
    const content = `
<session_handoff>
  <metadata>
    <timestamp>${merged.metadata.timestamp}</timestamp>
    <session_id>${merged.metadata.session_id}</session_id>
    <parent_sessions>${merged.metadata.parent_sessions}</parent_sessions>
    <merge_type>${merged.metadata.merge_type}</merge_type>
  </metadata>

  <context>
    <goal>Combined context from multiple agents</goal>
    <progress>Merged from: ${sessionIds.join(', ')}</progress>
    <pending_tasks>Review merged insights below</pending_tasks>
    <note>This session combines work from multiple agents. See merged_agent_contexts below.</note>
  </context>

  <merged_agent_contexts>
${sessions.map(s => {
  const goal = s.content.match(/<goal>(.*?)<\/goal>/)?.[1] || 'Unknown';
  const progress = s.content.match(/<progress>(.*?)<\/progress>/)?.[1] || 'Unknown';
  const branch = s.content.match(/<branch>(.*?)<\/branch>/)?.[1] || 'Unknown';
  return `    <agent id="${s.id}">
      <goal>${goal}</goal>
      <progress>${progress}</progress>
      <branch>${branch}</branch>
    </agent>`;
}).join('\n')}
  </merged_agent_contexts>

  <cross_agent_insights>
    <note>Each agent contributed unique insights. Review their branches below:</note>
${sessions.map(s => {
  const commits = s.content.match(/<recent_commit_history>([\s\S]*?)<\/recent_commit_history>/)?.[1] || '';
  return `    <agent_work id="${s.id}">
${commits.trim()}
    </agent_work>`;
}).join('\n')}
  </cross_agent_insights>

  <recovery_instructions>
    <step1>This is a merged session combining: ${sessionIds.join(', ')}</step1>
    <step2>Review merged_agent_contexts above to see what each agent accomplished</step2>
    <step3>Review cross_agent_insights for commits from each agent</step3>
    <step4>Decide: continue on one branch or synthesize both?</step4>
    <step5>If synthesizing: git merge the branches with appropriate strategy</step5>
  </recovery_instructions>
</session_handoff>
`;

    fs.writeFileSync(outputPath, content.trim());
    return outputPath;
  }

  /**
   * Tracks session lineage (parent-child relationships).
   * For example: agent-1 creates "main" session, agent-2 branches to "feature-x"
   * 
   * Usage:
   *   coordinator.trackLineage('main', 'feature-x', 'Agent 2 branched from main')
   *   → Records parent-child relationship
   */
  trackLineage(parentSessionId, childSessionId, reason = '') {
    const lineageFile = path.join(this.handoffDir, '_lineage.json');
    
    let lineage = {};
    if (fs.existsSync(lineageFile)) {
      lineage = JSON.parse(fs.readFileSync(lineageFile, 'utf8'));
    }

    if (!lineage[childSessionId]) {
      lineage[childSessionId] = {
        parent: parentSessionId,
        reason,
        createdAt: new Date().toISOString(),
        children: []
      };
    }

    if (!lineage[parentSessionId]) {
      lineage[parentSessionId] = { children: [] };
    }
    
    if (!lineage[parentSessionId].children) {
      lineage[parentSessionId].children = [];
    }
    lineage[parentSessionId].children.push(childSessionId);

    fs.writeFileSync(lineageFile, JSON.stringify(lineage, null, 2));
    return lineage;
  }

  /**
   * Displays session lineage as a tree.
   * Shows parent-child relationships visually.
   */
  displayLineageTree() {
    const lineageFile = path.join(this.handoffDir, '_lineage.json');
    if (!fs.existsSync(lineageFile)) {
      return 'No session lineage tracked yet. Start with trackLineage().';
    }

    const lineage = JSON.parse(fs.readFileSync(lineageFile, 'utf8'));
    const roots = Object.entries(lineage)
      .filter(([_, info]) => !info.parent)
      .map(([id]) => id);

    let output = 'SESSION LINEAGE TREE\n═══════════════════\n\n';
    
    const drawTree = (sessionId, depth = 0) => {
      const info = lineage[sessionId];
      const indent = '  '.repeat(depth);
      const prefix = depth === 0 ? '📍' : '└─';
      
      output += `${indent}${prefix} ${sessionId}\n`;
      if (info.reason) output += `${indent}   (${info.reason})\n`;
      
      if (info.children && info.children.length > 0) {
        info.children.forEach(child => {
          drawTree(child, depth + 1);
        });
      }
    };

    roots.forEach(root => drawTree(root));
    return output;
  }

  /**
   * Gets the full lineage path of a session (all ancestors).
   * 
   * Usage:
   *   coordinator.getLineagePath('feature-x')
   *   → Returns: ['main', 'feature-base', 'feature-x']
   */
  getLineagePath(sessionId) {
    const lineageFile = path.join(this.handoffDir, '_lineage.json');
    if (!fs.existsSync(lineageFile)) return [sessionId];

    const lineage = JSON.parse(fs.readFileSync(lineageFile, 'utf8'));
    const path = [sessionId];
    
    let current = sessionId;
    while (lineage[current] && lineage[current].parent) {
      path.unshift(lineage[current].parent);
      current = lineage[current].parent;
    }

    return path;
  }

  /**
   * Creates a session comparing multiple agents' audits.
   * Useful for: "Compare Python audit vs Kotlin audit of same file"
   */
  compareAudits(auditSessionIds, targetFile, outputSessionId) {
    const audits = auditSessionIds.map(id => {
      const filePath = path.join(this.handoffDir, `${id}.md`);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Audit session not found: ${id}`);
      }
      return {
        id,
        content: fs.readFileSync(filePath, 'utf8')
      };
    });

    const content = `
<session_handoff>
  <metadata>
    <timestamp>${new Date().toISOString()}</timestamp>
    <session_id>${outputSessionId}</session_id>
    <type>audit-comparison</type>
    <target_file>${targetFile}</target_file>
  </metadata>

  <context>
    <goal>Compare audit findings from multiple agents for ${targetFile}</goal>
    <progress>Aggregated ${auditSessionIds.length} audits</progress>
    <pending_tasks>Review and prioritize findings, decide which issues to fix first</pending_tasks>
  </context>

  <audit_comparison>
    <note>Each agent audited ${targetFile} against their own skill framework</note>
${audits.map(a => `    <agent_audit id="${a.id}">
${this._extractContext(a.content)}
    </agent_audit>`).join('\n')}
  </audit_comparison>

  <recovery_instructions>
    <step1>This session compares audits from: ${auditSessionIds.join(', ')}</step1>
    <step2>Review each agent's findings in audit_comparison above</step2>
    <step3>Note overlapping issues (high priority)</step3>
    <step4>Note unique issues per agent (domain-specific)</step4>
    <step5>Prioritize fixes: overlapping first, then unique critical ones</step5>
  </recovery_instructions>
</session_handoff>
`;

    const outputPath = path.join(this.handoffDir, `${outputSessionId}.md`);
    fs.writeFileSync(outputPath, content.trim());
    return outputPath;
  }

  // ─── HELPER METHODS ───

  /**
   * Extracts skills from session content.
   */
  _extractSkills(sessions) {
    const skills = new Set();
    sessions.forEach(s => {
      const skillMatches = s.content.match(/<skill id="(.*?)"/g) || [];
      skillMatches.forEach(match => {
        const skill = match.match(/id="(.*?)"/)[1];
        skills.add(skill);
      });
    });
    return Array.from(skills);
  }

  /**
   * Extracts context snippet from session.
   */
  _extractContext(content) {
    const goal = content.match(/<goal>(.*?)<\/goal>/)?.[1] || 'Unknown';
    const progress = content.match(/<progress>(.*?)<\/progress>/)?.[1] || 'Unknown';
    const tasks = content.match(/<pending_tasks>(.*?)<\/pending_tasks>/)?.[1] || 'None specified';
    return `Goal: ${goal}\nProgress: ${progress}\nNext: ${tasks}`;
  }
}
