import fs from 'fs';
import path from 'path';

export class BookLibAIFeatures {
  constructor(projectRoot = process.cwd()) {
    this.projectRoot = projectRoot;
    this.sessionsDir = path.join(projectRoot, '.booklib/sessions');
  }

  async generateSessionSummary(sessionName, modelProvider = 'claude') {
    const sessionPath = path.join(this.sessionsDir, `${sessionName}.md`);
    if (!fs.existsSync(sessionPath)) {
      return { error: 'Session not found' };
    }

    const content = fs.readFileSync(sessionPath, 'utf8');
    const data = this._parseSession(content);

    const summary = this._generateMockSummary(data);

    return {
      session: sessionName,
      summary,
      tokens_estimated: 100,
      model: modelProvider
    };
  }

  recommendSkills(goal, availableSkills = []) {
    const skillKeywords = {
      'effective-typescript': ['typescript', 'type', 'interface', 'generic', 'null safety'],
      'clean-code-reviewer': ['code quality', 'refactor', 'clean', 'maintainability'],
      'microservices-patterns': ['service', 'distributed', 'saga', 'cqrs', 'message queue'],
      'effective-python': ['python', 'async', 'decorator', 'context manager'],
      'design-patterns': ['pattern', 'factory', 'observer', 'singleton', 'decorator'],
      'domain-driven-design': ['domain', 'entity', 'aggregate', 'ubiquitous language'],
      'system-design-interview': ['scale', 'load balance', 'cache', 'database sharding'],
      'refactoring-ui': ['ui', 'design', 'layout', 'typography', 'color palette'],
      'data-pipelines': ['data', 'etl', 'pipeline', 'orchestration', 'warehouse'],
      'animation-at-work': ['animation', 'transition', 'motion', 'keyframe']
    };

    const lowerGoal = goal.toLowerCase();
    const recommendations = {};

    for (const [skill, keywords] of Object.entries(skillKeywords)) {
      const matchCount = keywords.filter(kw => lowerGoal.includes(kw)).length;
      if (matchCount > 0) {
        recommendations[skill] = matchCount;
      }
    }

    const sorted = Object.entries(recommendations)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([skill, score]) => ({
        skill,
        confidence: Math.min(100, score * 20),
        reason: this._getSkillReason(skill, goal)
      }));

    return { recommendations: sorted };
  }

  getExtensionData() {
    const sessions = this._loadAllSessions();
    
    return {
      version: '1.0.0',
      sessions: sessions.map(s => ({
        id: s.session_id,
        name: s.session_id,
        goal: s.goal,
        branch: s.branch,
        timestamp: s.timestamp
      })),
      status_bar_data: sessions[0] ? {
        current_session: sessions[0].session_id,
        branch: sessions[0].branch,
        pending_tasks: (sessions[0].pending_tasks || '').split('\n').length
      } : null,
      quick_actions: [
        { command: 'booklib.saveSession', title: 'Save Session', icon: 'save' },
        { command: 'booklib.recoverSession', title: 'Recover Session', icon: 'refresh' },
        { command: 'booklib.viewTasks', title: 'View Tasks', icon: 'list' },
        { command: 'booklib.switchSession', title: 'Switch Session', icon: 'branch' }
      ]
    };
  }

  getGitHubIntegrationData(sessionName) {
    const sessionPath = path.join(this.sessionsDir, `${sessionName}.md`);
    if (!fs.existsSync(sessionPath)) {
      return { error: 'Session not found' };
    }

    const content = fs.readFileSync(sessionPath, 'utf8');
    const data = this._parseSession(content);

    return {
      wiki_page: {
        title: `Session: ${data.session_id}`,
        content: this._generateWikiMarkdown(data),
        slug: `session-${data.session_id}`
      },
      issues_to_create: (data.pending_tasks || '')
        .split('\n')
        .filter(t => t.trim())
        .map((task, i) => ({
          title: task.trim(),
          body: `From session: ${data.session_id}\n\nContext: ${data.goal}`,
          labels: ['from-session', ...data.skills],
          priority: i === 0 ? 'high' : 'medium'
        })),
      pr_context: {
        session: data.session_id,
        goal: data.goal,
        branch: data.branch,
        summary: `Working on: ${data.goal}`
      }
    };
  }

  getSlackIntegrationData(sessionName) {
    const sessionPath = path.join(this.sessionsDir, `${sessionName}.md`);
    if (!fs.existsSync(sessionPath)) {
      return { error: 'Session not found' };
    }

    const content = fs.readFileSync(sessionPath, 'utf8');
    const data = this._parseSession(content);

    return {
      webhook_enabled: !!process.env.SLACK_WEBHOOK,
      message: {
        text: `📝 Session Update: ${data.session_id}`,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: `📝 ${data.session_id}`
            }
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Goal:*\n${data.goal}`
              },
              {
                type: 'mrkdwn',
                text: `*Progress:*\n${data.progress.substring(0, 100)}...`
              }
            ]
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Skills:* ${data.skills.join(', ')}`
            }
          }
        ]
      },
      notification_types: {
        on_save: true,
        on_complete: true,
        team_mention: data.pending_tasks ? '@team' : null,
        branch_mention: `#${data.branch}`
      }
    };
  }

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
      session_id: extract('session_id'),
      timestamp: extract('timestamp'),
      goal: extract('goal'),
      progress: extract('progress'),
      pending_tasks: extract('pending_tasks'),
      branch: extract('branch'),
      skills
    };
  }

  _generateMockSummary(data) {
    const parts = [
      `Building: ${data.goal.split(' ').slice(0, 3).join(' ')}`,
      `Progress: ${data.progress.split('\n')[0]}`,
      data.pending_tasks ? `Next: ${data.pending_tasks.split('\n')[0]}` : 'Ready for review'
    ];
    return parts.join('. ');
  }

  _getSkillReason(skill, goal) {
    const reasons = {
      'effective-typescript': 'Goal mentions TypeScript or type safety concerns',
      'clean-code-reviewer': 'Goal includes code quality or refactoring',
      'microservices-patterns': 'Goal mentions distributed systems or services',
      'system-design-interview': 'Goal includes scaling or architecture',
      'design-patterns': 'Goal mentions patterns or architecture',
      'refactoring-ui': 'Goal includes UI/design work'
    };
    return reasons[skill] || 'Relevant to development goals';
  }

  _generateWikiMarkdown(data) {
    return `# Session: ${data.session_id}

## Goal
${data.goal}

## Progress
${data.progress}

## Next Tasks
${data.pending_tasks || 'No tasks defined'}

## Skills
- ${data.skills.join('\n- ')}

## Metadata
- **Branch:** ${data.branch}
- **Created:** ${new Date(data.timestamp).toLocaleString()}
`;
  }

  _loadAllSessions() {
    if (!fs.existsSync(this.sessionsDir)) return [];
    
    return fs.readdirSync(this.sessionsDir)
      .filter(f => f.endsWith('.md') && !f.startsWith('_'))
      .map(file => {
        const content = fs.readFileSync(path.join(this.sessionsDir, file), 'utf8');
        return this._parseSession(content);
      });
  }
}
