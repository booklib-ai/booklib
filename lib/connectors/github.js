import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const RATE_MS = 1000;

export class GitHubConnector {
  constructor(opts = {}) {
    this.rateMs = opts.rateMs ?? RATE_MS;
  }

  /**
   * Check if gh CLI is installed and authenticated.
   * @returns {{ ok: boolean, error?: string }}
   */
  checkAuth() {
    try {
      execFileSync('gh', ['auth', 'status'], { stdio: 'pipe' });
      return { ok: true };
    } catch {
      return {
        ok: false,
        error: 'gh CLI not authenticated. Install: https://cli.github.com then run: gh auth login',
      };
    }
  }

  /**
   * Fetch releases from a GitHub repo and save as markdown.
   * @param {string} repo - owner/repo format
   * @param {string} outputDir - where to save markdown files
   * @param {object} [opts]
   * @param {number} [opts.limit=30] - max releases to fetch
   * @param {string} [opts.since] - ISO date, only fetch releases after this
   * @returns {Promise<{ pageCount: number, releases: string[] }>}
   */
  async fetchReleases(repo, outputDir, opts = {}) {
    const { limit = 30, since } = opts;
    this._validateRepo(repo);
    fs.mkdirSync(outputDir, { recursive: true });

    const data = this._ghApi(`/repos/${repo}/releases?per_page=${Math.min(limit, 100)}`);
    const releases = JSON.parse(data);

    if (!Array.isArray(releases)) return { pageCount: 0, releases: [] };

    const saved = [];
    for (const release of releases) {
      if (since && new Date(release.published_at) <= new Date(since)) continue;

      const tag = release.tag_name.replace(/[/\\:*?"<>|]/g, '_');
      const filename = `release-${tag}.md`;
      const content = this._formatRelease(release);
      fs.writeFileSync(path.join(outputDir, filename), content);
      saved.push(filename);
    }

    return { pageCount: saved.length, releases: saved };
  }

  /**
   * Fetch wiki pages by cloning the wiki git repo.
   * GitHub wikis live at <repo>.wiki.git — no REST API endpoint exists.
   * @param {string} repo - owner/repo format
   * @param {string} outputDir
   * @returns {Promise<{ pageCount: number }>}
   */
  async fetchWiki(repo, outputDir) {
    this._validateRepo(repo);
    fs.mkdirSync(outputDir, { recursive: true });

    const wikiUrl = `https://github.com/${repo}.wiki.git`;
    try {
      // Array form prevents shell injection via outputDir
      execFileSync('git', ['clone', '--depth', '1', wikiUrl, outputDir], {
        stdio: 'pipe',
        timeout: 30000,
      });
    } catch (err) {
      const msg = err.stderr?.toString() ?? '';
      if (msg.includes('not found') || msg.includes('not exist')) {
        return { pageCount: 0 };
      }
      throw new Error(`Wiki clone failed: ${msg.slice(0, 200)}`);
    }

    // Remove .git directory — we only want the content files
    const gitDir = path.join(outputDir, '.git');
    if (fs.existsSync(gitDir)) {
      fs.rmSync(gitDir, { recursive: true, force: true });
    }

    const files = fs.readdirSync(outputDir).filter(f => f.endsWith('.md'));
    return { pageCount: files.length };
  }

  /**
   * Fetch discussion threads via GraphQL API.
   * @param {string} repo - owner/repo format
   * @param {string} outputDir
   * @param {object} [opts]
   * @param {number} [opts.limit=20] - max discussions
   * @param {string} [opts.category] - filter by category name
   * @returns {Promise<{ pageCount: number }>}
   */
  async fetchDiscussions(repo, outputDir, opts = {}) {
    const { limit = 20, category } = opts;
    this._validateRepo(repo);
    fs.mkdirSync(outputDir, { recursive: true });

    const [owner, name] = repo.split('/');
    const count = Math.min(limit, 100);

    // Parameterized GraphQL query — variables passed via -f to prevent injection
    const query = `query($owner: String!, $name: String!, $count: Int!) {
      repository(owner: $owner, name: $name) {
        discussions(first: $count, orderBy: {field: UPDATED_AT, direction: DESC}) {
          nodes {
            number title body createdAt updatedAt
            category { name }
            answer { body author { login } }
            comments(first: 10) { nodes { body author { login } } }
          }
        }
      }
    }`;

    let data;
    try {
      const raw = execFileSync('gh', [
        'api', 'graphql',
        '-f', `query=${query}`,
        '-f', `owner=${owner}`,
        '-f', `name=${name}`,
        '-F', `count=${count}`,
      ], { stdio: 'pipe', timeout: 30000 });
      data = JSON.parse(raw.toString());
    } catch (err) {
      const msg = err.stderr?.toString().slice(0, 200) ?? err.message;
      console.error(`GitHub discussions fetch failed: ${msg}`);
      return { pageCount: 0 };
    }

    const discussions = data?.data?.repository?.discussions?.nodes ?? [];
    let saved = 0;

    for (const disc of discussions) {
      if (category && disc.category?.name !== category) continue;

      const filename = `discussion-${disc.number}.md`;
      const content = this._formatDiscussion(disc);
      fs.writeFileSync(path.join(outputDir, filename), content);
      saved++;
    }

    return { pageCount: saved };
  }

  /** Format a release object as markdown. */
  _formatRelease(release) {
    const lines = [
      `# ${release.name || release.tag_name}`,
      '',
      `**Tag:** ${release.tag_name}`,
      `**Published:** ${release.published_at?.split('T')[0] ?? 'unknown'}`,
      release.prerelease ? '**Pre-release**' : '',
      '',
      release.body ?? '_No release notes._',
    ];
    return lines.filter(l => l !== '').join('\n') + '\n';
  }

  /** Format a discussion as markdown with comments. */
  _formatDiscussion(disc) {
    const lines = [
      `# ${disc.title}`,
      '',
      `**Discussion #${disc.number}** — ${disc.category?.name ?? 'General'}`,
      `**Created:** ${disc.createdAt?.split('T')[0] ?? 'unknown'}`,
      '',
      disc.body ?? '',
    ];

    if (disc.answer) {
      lines.push('', '---', `## Accepted Answer (by ${disc.answer.author?.login ?? 'unknown'})`, '', disc.answer.body);
    }

    const comments = disc.comments?.nodes ?? [];
    if (comments.length > 0) {
      lines.push('', '---', '## Comments', '');
      for (const c of comments) {
        lines.push(`**${c.author?.login ?? 'unknown'}:**`, c.body, '');
      }
    }

    return lines.join('\n') + '\n';
  }

  /** Validate repo format is owner/name. */
  _validateRepo(repo) {
    if (!repo || !/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(repo)) {
      throw new Error(`Invalid repo format: "${repo}". Use owner/repo (e.g., facebook/react)`);
    }
  }

  /** Call gh api and return stdout — array form prevents shell injection. */
  _ghApi(endpoint) {
    try {
      return execFileSync('gh', ['api', endpoint], {
        stdio: 'pipe',
        timeout: 15000,
        maxBuffer: 10 * 1024 * 1024,
      }).toString();
    } catch (err) {
      throw new Error(`GitHub API error: ${err.stderr?.toString().slice(0, 200) ?? err.message}`);
    }
  }
}
