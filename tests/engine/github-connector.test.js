import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { GitHubConnector } from '../../lib/connectors/github.js';

/**
 * Subclass that stubs _ghApi to avoid real network calls.
 * Tests can inject mock JSON data via the constructor.
 */
class TestGitHubConnector extends GitHubConnector {
  constructor(mockData) {
    super();
    this._mockData = mockData;
  }
  _ghApi() { return JSON.stringify(this._mockData); }
}

describe('GitHubConnector', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'booklib-gh-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('_validateRepo', () => {
    const gh = new GitHubConnector();

    it('accepts valid owner/repo format', () => {
      assert.doesNotThrow(() => gh._validateRepo('facebook/react'));
    });

    it('rejects empty string', () => {
      assert.throws(() => gh._validateRepo(''), /Invalid repo format/);
    });

    it('rejects missing slash', () => {
      assert.throws(() => gh._validateRepo('noslash'), /Invalid repo format/);
    });

    it('rejects repo with spaces', () => {
      assert.throws(() => gh._validateRepo('owner/repo name'), /Invalid repo format/);
    });

    it('accepts repos with dots and hyphens', () => {
      assert.doesNotThrow(() => gh._validateRepo('my-org/my.repo-name'));
    });

    it('accepts repos with underscores', () => {
      assert.doesNotThrow(() => gh._validateRepo('owner_1/repo_2'));
    });

    it('rejects null', () => {
      assert.throws(() => gh._validateRepo(null), /Invalid repo format/);
    });

    it('rejects undefined', () => {
      assert.throws(() => gh._validateRepo(undefined), /Invalid repo format/);
    });

    it('rejects double slashes', () => {
      assert.throws(() => gh._validateRepo('owner//repo'), /Invalid repo format/);
    });
  });

  describe('_formatRelease', () => {
    const gh = new GitHubConnector();

    it('formats release with name, tag, date, and body', () => {
      const md = gh._formatRelease({
        name: 'v2.0 — Big Update',
        tag_name: 'v2.0.0',
        published_at: '2025-06-15T10:00:00Z',
        prerelease: false,
        body: 'Added new features.\n\n- Feature A\n- Feature B',
      });

      assert.ok(md.includes('# v2.0 — Big Update'));
      assert.ok(md.includes('**Tag:** v2.0.0'));
      assert.ok(md.includes('**Published:** 2025-06-15'));
      assert.ok(md.includes('- Feature A'));
      assert.ok(!md.includes('Pre-release'));
    });

    it('uses tag_name when name is empty', () => {
      const md = gh._formatRelease({
        name: '',
        tag_name: 'v1.0.0',
        published_at: '2025-01-01T00:00:00Z',
        prerelease: false,
        body: 'Notes here.',
      });

      assert.ok(md.includes('# v1.0.0'));
    });

    it('marks pre-releases', () => {
      const md = gh._formatRelease({
        name: 'Beta',
        tag_name: 'v0.9.0-beta',
        published_at: '2025-03-01T00:00:00Z',
        prerelease: true,
        body: 'Beta release.',
      });

      assert.ok(md.includes('**Pre-release**'));
    });

    it('handles missing body gracefully', () => {
      const md = gh._formatRelease({
        name: 'No Notes',
        tag_name: 'v0.1.0',
        published_at: '2025-02-01T00:00:00Z',
        prerelease: false,
        body: null,
      });

      assert.ok(md.includes('_No release notes._'));
    });

    it('handles missing published_at', () => {
      const md = gh._formatRelease({
        name: 'Draft',
        tag_name: 'v0.0.1',
        published_at: null,
        prerelease: false,
        body: 'Draft release.',
      });

      assert.ok(md.includes('**Published:** unknown'));
    });
  });

  describe('_formatDiscussion', () => {
    const gh = new GitHubConnector();

    it('formats discussion with title, category, body', () => {
      const md = gh._formatDiscussion({
        number: 42,
        title: 'How to deploy?',
        body: 'I need help deploying.',
        createdAt: '2025-05-01T12:00:00Z',
        category: { name: 'Q&A' },
        answer: null,
        comments: { nodes: [] },
      });

      assert.ok(md.includes('# How to deploy?'));
      assert.ok(md.includes('**Discussion #42**'));
      assert.ok(md.includes('Q&A'));
      assert.ok(md.includes('2025-05-01'));
      assert.ok(md.includes('I need help deploying.'));
    });

    it('includes accepted answer when present', () => {
      const md = gh._formatDiscussion({
        number: 10,
        title: 'Config question',
        body: 'How do I configure X?',
        createdAt: '2025-04-01T00:00:00Z',
        category: { name: 'Q&A' },
        answer: { body: 'Set the X_FLAG env var.', author: { login: 'helper' } },
        comments: { nodes: [] },
      });

      assert.ok(md.includes('## Accepted Answer (by helper)'));
      assert.ok(md.includes('Set the X_FLAG env var.'));
    });

    it('includes comments', () => {
      const md = gh._formatDiscussion({
        number: 7,
        title: 'Feature request',
        body: 'Add dark mode.',
        createdAt: '2025-03-15T00:00:00Z',
        category: { name: 'Ideas' },
        answer: null,
        comments: {
          nodes: [
            { body: 'Great idea!', author: { login: 'user1' } },
            { body: 'I second this.', author: { login: 'user2' } },
          ],
        },
      });

      assert.ok(md.includes('## Comments'));
      assert.ok(md.includes('**user1:**'));
      assert.ok(md.includes('Great idea!'));
      assert.ok(md.includes('**user2:**'));
    });

    it('handles discussion with no comments or answer', () => {
      const md = gh._formatDiscussion({
        number: 1,
        title: 'Empty discussion',
        body: 'Just a thought.',
        createdAt: '2025-01-01T00:00:00Z',
        category: null,
        answer: null,
        comments: { nodes: [] },
      });

      assert.ok(md.includes('# Empty discussion'));
      assert.ok(md.includes('General'));
      assert.ok(!md.includes('## Accepted Answer'));
      assert.ok(!md.includes('## Comments'));
    });

    it('handles null author in answer', () => {
      const md = gh._formatDiscussion({
        number: 5,
        title: 'Test',
        body: 'Body',
        createdAt: '2025-01-01T00:00:00Z',
        category: { name: 'General' },
        answer: { body: 'The answer.', author: null },
        comments: { nodes: [] },
      });

      assert.ok(md.includes('## Accepted Answer (by unknown)'));
    });
  });

  describe('checkAuth', () => {
    it('returns ok:true or ok:false without throwing', () => {
      const gh = new GitHubConnector();
      const result = gh.checkAuth();

      assert.equal(typeof result.ok, 'boolean');
      if (!result.ok) {
        assert.ok(result.error, 'should include error message when not ok');
        assert.ok(result.error.includes('gh CLI'), 'error should mention gh CLI');
      }
    });
  });

  describe('fetchReleases', () => {
    it('creates output directory', async () => {
      const outputDir = path.join(tmpDir, 'releases');
      const gh = new TestGitHubConnector([]);

      await gh.fetchReleases('owner/repo', outputDir);
      assert.ok(fs.existsSync(outputDir));
    });

    it('saves releases as markdown files', async () => {
      const outputDir = path.join(tmpDir, 'releases');
      const gh = new TestGitHubConnector([
        {
          name: 'v1.0.0',
          tag_name: 'v1.0.0',
          published_at: '2025-06-01T00:00:00Z',
          prerelease: false,
          body: 'First release.',
        },
        {
          name: 'v1.1.0',
          tag_name: 'v1.1.0',
          published_at: '2025-07-01T00:00:00Z',
          prerelease: false,
          body: 'Second release.',
        },
      ]);

      const result = await gh.fetchReleases('owner/repo', outputDir);

      assert.equal(result.pageCount, 2);
      assert.equal(result.releases.length, 2);
      assert.ok(result.releases.includes('release-v1.0.0.md'));
      assert.ok(result.releases.includes('release-v1.1.0.md'));

      const content = fs.readFileSync(path.join(outputDir, 'release-v1.0.0.md'), 'utf8');
      assert.ok(content.includes('# v1.0.0'));
      assert.ok(content.includes('First release.'));
    });

    it('filters releases by since date', async () => {
      const outputDir = path.join(tmpDir, 'releases');
      const gh = new TestGitHubConnector([
        {
          name: 'Old',
          tag_name: 'v0.1.0',
          published_at: '2024-01-01T00:00:00Z',
          prerelease: false,
          body: 'Old one.',
        },
        {
          name: 'New',
          tag_name: 'v2.0.0',
          published_at: '2025-06-01T00:00:00Z',
          prerelease: false,
          body: 'New one.',
        },
      ]);

      const result = await gh.fetchReleases('owner/repo', outputDir, {
        since: '2025-01-01',
      });

      assert.equal(result.pageCount, 1);
      assert.ok(result.releases.includes('release-v2.0.0.md'));
      assert.ok(!result.releases.includes('release-v0.1.0.md'));
    });

    it('returns empty when API returns non-array', async () => {
      const outputDir = path.join(tmpDir, 'releases');
      const gh = new TestGitHubConnector({ message: 'Not Found' });

      const result = await gh.fetchReleases('owner/repo', outputDir);

      assert.equal(result.pageCount, 0);
      assert.deepEqual(result.releases, []);
    });

    it('sanitizes special characters in tag names', async () => {
      const outputDir = path.join(tmpDir, 'releases');
      const gh = new TestGitHubConnector([
        {
          name: 'Weird Tag',
          tag_name: 'v1.0/rc:1',
          published_at: '2025-01-01T00:00:00Z',
          prerelease: false,
          body: 'Release.',
        },
      ]);

      const result = await gh.fetchReleases('owner/repo', outputDir);

      assert.equal(result.releases[0], 'release-v1.0_rc_1.md');
      assert.ok(fs.existsSync(path.join(outputDir, 'release-v1.0_rc_1.md')));
    });
  });
});
