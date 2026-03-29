import express from 'express';
import path from 'path';
import fs from 'fs';

export class BookLibDashboard {
  constructor(projectRoot = process.cwd()) {
    this.projectRoot = projectRoot;
    this.sessionsDir = path.join(projectRoot, '.booklib/sessions');
    this.app = express();
    this.port = 3000;
    this.setupRoutes();
  }

  setupRoutes() {
    this.app.use(express.static('public'));
    this.app.use(express.json());

    this.app.get('/api/sessions', (req, res) => this.getSessions(req, res));
    this.app.get('/api/sessions/:id', (req, res) => this.getSession(req, res));
    this.app.get('/api/lineage', (req, res) => this.getLineage(req, res));
    this.app.get('/api/timeline', (req, res) => this.getTimeline(req, res));
    this.app.get('/api/tasks', (req, res) => this.getTasks(req, res));
    
    this.app.get('/', (req, res) => {
      res.send(this.getHtmlDashboard());
    });
  }

  getSessions(req, res) {
    const sessions = this.loadAllSessions();
    res.json({ sessions });
  }

  getSession(req, res) {
    const sessionPath = path.join(this.sessionsDir, `${req.params.id}.md`);
    if (!fs.existsSync(sessionPath)) {
      return res.status(404).json({ error: 'Session not found' });
    }
    const content = fs.readFileSync(sessionPath, 'utf8');
    const data = this.parseSessionContent(content);
    res.json(data);
  }

  getLineage(req, res) {
    const lineagePath = path.join(this.sessionsDir, '_lineage.json');
    if (!fs.existsSync(lineagePath)) {
      return res.json({ tree: {} });
    }
    const lineage = JSON.parse(fs.readFileSync(lineagePath, 'utf8'));
    res.json({ tree: lineage });
  }

  getTimeline(req, res) {
    const sessions = this.loadAllSessions();
    const timeline = sessions
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .map((s, i) => ({
        id: i,
        session: s.session_id,
        goal: s.goal,
        timestamp: s.timestamp,
        progress: s.progress.substring(0, 100) + '...'
      }));
    res.json({ timeline });
  }

  getTasks(req, res) {
    const sessions = this.loadAllSessions();
    const tasks = [];
    
    sessions.forEach(session => {
      if (session.pending_tasks) {
        session.pending_tasks.split('\n').forEach(task => {
          if (task.trim()) {
            tasks.push({
              task: task.trim(),
              session: session.session_id,
              status: 'pending'
            });
          }
        });
      }
    });

    res.json({ tasks });
  }

  loadAllSessions() {
    if (!fs.existsSync(this.sessionsDir)) return [];
    
    return fs.readdirSync(this.sessionsDir)
      .filter(f => f.endsWith('.md') && !f.startsWith('_'))
      .map(file => {
        const content = fs.readFileSync(path.join(this.sessionsDir, file), 'utf8');
        return this.parseSessionContent(content);
      });
  }

  parseSessionContent(content) {
    const extract = (tag) => {
      const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`);
      const match = content.match(regex);
      return match ? match[1].trim() : '';
    };

    return {
      session_id: extract('session_id'),
      timestamp: extract('timestamp'),
      goal: extract('goal'),
      progress: extract('progress'),
      pending_tasks: extract('pending_tasks'),
      branch: extract('branch')
    };
  }

  getHtmlDashboard() {
    return `<!DOCTYPE html>
<html>
<head>
  <title>BookLib Dashboard</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI"; background: #f5f5f5; }
    header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px; }
    h1 { font-size: 2em; }
    .container { max-width: 1200px; margin: 20px auto; padding: 0 20px; }
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin: 20px 0; }
    .stat-box { background: white; padding: 20px; text-align: center; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .stat-number { font-size: 2.5em; color: #667eea; font-weight: bold; }
    h2 { margin: 30px 0 15px; }
    .card { background: white; padding: 15px; margin: 10px 0; border-radius: 8px; }
  </style>
</head>
<body>
  <header>
    <h1>📚 BookLib Dashboard</h1>
    <p>Session Overview & Analytics</p>
  </header>
  <div class="container">
    <div class="stats">
      <div class="stat-box">
        <div class="stat-number" id="sessions">0</div>
        <div>Sessions</div>
      </div>
      <div class="stat-box">
        <div class="stat-number" id="tasks">0</div>
        <div>Tasks</div>
      </div>
      <div class="stat-box">
        <div class="stat-number" id="skills">0</div>
        <div>Skills</div>
      </div>
      <div class="stat-box">
        <div class="stat-number">100%</div>
        <div>Coverage</div>
      </div>
    </div>
    <h2>Recent Sessions</h2>
    <div id="timeline"></div>
  </div>
  <script>
    async function load() {
      const resp = await fetch('/api/sessions');
      const { sessions } = await resp.json();
      document.getElementById('sessions').textContent = sessions.length;
      sessions.slice(0, 5).forEach(s => {
        document.getElementById('timeline').innerHTML += '<div class="card">' + s.session_id + ': ' + s.goal + '</div>';
      });
    }
    load();
  </script>
</body>
</html>`;
  }

  start() {
    this.app.listen(this.port, () => {
      console.log(`\n🎨 Dashboard running: http://localhost:${this.port}\n`);
    });
  }
}
