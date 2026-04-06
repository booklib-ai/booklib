import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { detectSourceType } from '../../lib/engine/source-detector.js';

describe('detectSourceType', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'booklib-detector-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects framework-docs from code blocks + imports + install commands', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'setup.md'),
      [
        '# Getting Started',
        '```js',
        "import React from 'react'",
        "import { useState } from 'react'",
        '```',
        'Run `npm install react`',
        '## Configuration',
        '```json',
        '{ "compilerOptions": {} }',
        '```',
      ].join('\n')
    );

    const result = detectSourceType(tmpDir);
    assert.equal(result.type, 'framework-docs');
  });

  it('detects api-reference from HTTP methods + endpoints + status codes', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'api.md'),
      [
        '## GET /api/users',
        'Returns 200 with user list.',
        '',
        '### POST /api/users',
        'Request body: {name, email}',
        'Response: 201 Created',
        '',
        '### DELETE /api/users/:id',
        'Returns 200 on success, 404 if not found.',
        'Include Authorization header.',
      ].join('\n')
    );

    const result = detectSourceType(tmpDir);
    assert.equal(result.type, 'api-reference');
  });

  it('detects release-notes from version headers + breaking/added/fixed', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'changelog.md'),
      [
        '## v2.0.0',
        '### Breaking Changes',
        '- Removed deprecated API',
        '### Added',
        '- New caching layer',
        '### Fixed',
        '- Login bug',
        '',
        '## v1.5.0',
        '### Added',
        '- Dashboard widget',
        '### Fixed',
        '- Memory leak in parser',
      ].join('\n')
    );

    const result = detectSourceType(tmpDir);
    assert.equal(result.type, 'release-notes');
  });

  it('detects spec from requirements + acceptance criteria + shall/must', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'spec.md'),
      [
        '## Requirements',
        '- System shall authenticate users via OAuth 2.0',
        '- System must enforce rate limits on all endpoints',
        '',
        '## Acceptance Criteria',
        '- Given a valid token, when accessing /api, then return 200',
        '- Given an expired token, when accessing /api, then return 401',
        '',
        '## User Story',
        'As a developer I want to authenticate so that I can access the API.',
      ].join('\n')
    );

    const result = detectSourceType(tmpDir);
    assert.equal(result.type, 'spec');
  });

  it('detects team-decision from ADR headers (Context/Decision/Consequences)', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'adr-001.md'),
      [
        '# ADR-001: Use JWT for Authentication',
        '',
        '**Status:** Accepted',
        '',
        '## Context',
        'We need a stateless authentication mechanism.',
        '',
        '## Decision',
        'Use JWT with short-lived access tokens.',
        '',
        '## Consequences',
        'Need to implement refresh token rotation.',
      ].join('\n')
    );

    const result = detectSourceType(tmpDir);
    assert.equal(result.type, 'team-decision');
  });

  it('detects tutorial from step numbers + sequential words', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'tutorial.md'),
      [
        '# Getting Started',
        '',
        '## Step 1: Install',
        'First, install the package with npm.',
        '',
        '## Step 2: Configure',
        'Next, add the config file to your project.',
        '',
        '## Step 3: Run',
        'Then, start the development server.',
        '',
        '## Step 4: Deploy',
        "Finally, let's deploy the application.",
      ].join('\n')
    );

    const result = detectSourceType(tmpDir);
    assert.equal(result.type, 'tutorial');
  });

  it('returns wiki as default when no strong signals', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'general.md'),
      [
        '# Company Wiki',
        '',
        'Welcome to our internal knowledge base.',
        '',
        'This page has general information about the team.',
        'We meet on Tuesdays for standup.',
        'The office is on the third floor.',
      ].join('\n')
    );

    const result = detectSourceType(tmpDir);
    assert.equal(result.type, 'wiki');
  });

  it('returns wiki when directory has no markdown files', () => {
    // tmpDir is empty — no files at all
    const result = detectSourceType(tmpDir);
    assert.equal(result.type, 'wiki');
    assert.equal(result.confidence, 'none');
  });

  it('confidence is high when winner is 2x runner-up', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'adr.md'),
      [
        '# ADR-005',
        '**Status:** Accepted',
        '## Context',
        'Need to choose a database.',
        '## Decision',
        'Use PostgreSQL.',
        '## Consequences',
        'Need connection pooling.',
        '',
        '# ADR-006',
        '**Status:** Proposed',
        '## Context',
        'Need caching.',
        '## Decision',
        'Use Redis.',
        '## Consequences',
        'Additional infrastructure.',
      ].join('\n')
    );

    const result = detectSourceType(tmpDir);
    assert.equal(result.type, 'team-decision');
    assert.equal(result.confidence, 'high');
  });

  it('confidence is medium when scores are close', () => {
    // Mix framework-docs signals with tutorial signals so scores are close
    fs.writeFileSync(
      path.join(tmpDir, 'mixed.md'),
      [
        '## Step 1: Install',
        'First, run `npm install express`.',
        '```js',
        "import express from 'express'",
        '```',
        '## Step 2: Setup',
        'Next, configure the server.',
        '```js',
        "import cors from 'cors'",
        '```',
      ].join('\n')
    );

    const result = detectSourceType(tmpDir);
    // Both types score, so confidence should be medium (not high)
    assert.ok(
      ['framework-docs', 'tutorial'].includes(result.type),
      `expected framework-docs or tutorial, got ${result.type}`
    );
    assert.equal(result.confidence, 'medium');
  });

  it('maxFiles option limits files sampled', () => {
    // Create 5 files, limit to 2
    for (let i = 0; i < 5; i++) {
      fs.writeFileSync(
        path.join(tmpDir, `doc-${i}.md`),
        `## v${i}.0.0\n### Breaking Changes\n- Removed old API\n### Added\n- New feature ${i}\n`
      );
    }

    // With maxFiles=2, should still detect (scores may be lower but type is the same)
    const limited = detectSourceType(tmpDir, { maxFiles: 2 });
    const full = detectSourceType(tmpDir, { maxFiles: 10 });

    assert.equal(limited.type, full.type);
    // Full scan should have equal or higher score for the winning type
    assert.ok(full.scores[full.type] >= limited.scores[limited.type]);
  });

  it('returns scores for all types', () => {
    fs.writeFileSync(path.join(tmpDir, 'any.md'), '# Some content\nHello world.');

    const result = detectSourceType(tmpDir);
    const expectedTypes = [
      'framework-docs',
      'api-reference',
      'release-notes',
      'spec',
      'team-decision',
      'tutorial',
      'sdd-spec',
      'api-spec',
      'bdd-spec',
      'architecture',
      'project-docs',
      'pkm',
    ];

    for (const t of expectedTypes) {
      assert.ok(t in result.scores, `scores should include ${t}`);
      assert.equal(typeof result.scores[t], 'number');
    }
  });

  it('detects sdd-spec from SpecKit/GSD/Superpowers patterns', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'spec.md'),
      [
        '# Feature Design',
        '',
        'GOAL: Build user authentication system',
        '',
        'DELIVERS:',
        '- OAuth 2.0 integration',
        '- JWT token management',
        '',
        'NOT DOING:',
        '- Social login (Phase 2)',
        '',
        'ASSUMPTIONS:',
        '- PostgreSQL as primary database',
        '',
        '### Task 1: Setup auth middleware',
        '- [ ] Write failing test for JWT validation',
        '- [ ] Implement middleware',
        '- [ ] Write integration test',
        '',
        '### Task 2: Token rotation',
        '- [ ] Design refresh token flow',
      ].join('\n')
    );

    const result = detectSourceType(tmpDir);
    assert.equal(result.type, 'sdd-spec');
  });

  it('detects api-spec from OpenAPI YAML', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'openapi.yaml'),
      [
        'openapi: "3.1.0"',
        'info:',
        '  title: User API',
        '  version: 1.0.0',
        'paths:',
        '  /users:',
        '    get:',
        '      operationId: listUsers',
        '      responses:',
        '        200:',
        '          description: OK',
        '    post:',
        '      operationId: createUser',
        '      requestBody:',
        '        required: true',
        '      responses:',
        '        201:',
        '          description: Created',
        'components:',
        '  schemas:',
        '    User:',
        '      type: object',
      ].join('\n')
    );

    const result = detectSourceType(tmpDir);
    assert.equal(result.type, 'api-spec');
  });

  it('detects api-spec from GraphQL SDL', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'schema.graphql'),
      [
        'type Query {',
        '  users: [User!]!',
        '  user(id: ID!): User',
        '}',
        '',
        'type Mutation {',
        '  createUser(input: CreateUserInput!): User!',
        '}',
        '',
        'input CreateUserInput {',
        '  name: String!',
        '  email: String!',
        '}',
        '',
        'enum Role {',
        '  ADMIN',
        '  USER',
        '}',
      ].join('\n')
    );

    const result = detectSourceType(tmpDir);
    assert.equal(result.type, 'api-spec');
  });

  it('detects bdd-spec from Gherkin .feature files', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'auth.feature'),
      [
        'Feature: User Authentication',
        '  Users should be able to log in and access their account.',
        '',
        '  Background:',
        '    Given the application is running',
        '',
        '  Scenario: Successful login',
        '    Given a registered user with email "test@example.com"',
        '    When the user logs in with correct credentials',
        '    Then the user should see the dashboard',
        '    And a session token should be created',
        '',
        '  Scenario: Failed login',
        '    Given a registered user with email "test@example.com"',
        '    When the user logs in with wrong password',
        '    Then the user should see an error message',
        '',
        '  Scenario Outline: Rate limiting',
        '    Given <attempts> failed login attempts',
        '    When the user tries to log in again',
        '    Then the account should be locked',
        '',
        '    Examples:',
        '      | attempts |',
        '      | 3        |',
        '      | 5        |',
      ].join('\n')
    );

    const result = detectSourceType(tmpDir);
    assert.equal(result.type, 'bdd-spec');
  });

  it('detects pkm from Obsidian vault with wikilinks', () => {
    // Simulate .obsidian config dir
    fs.mkdirSync(path.join(tmpDir, '.obsidian'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'architecture-decisions.md'),
      [
        '---',
        'tags: [architecture, decisions]',
        'aliases: [ADRs]',
        'date: 2025-03-15',
        '---',
        '',
        '# Architecture Decisions',
        '',
        'We decided to use [[PostgreSQL]] over [[MongoDB]].',
        'See also [[API Design]] and [[Authentication Strategy]].',
        '',
        '## Related Notes',
        '- [[Sprint Planning 2025-03]]',
        '- [[Tech Debt Tracker]]',
        '',
        '#architecture #decisions',
      ].join('\n')
    );

    const result = detectSourceType(tmpDir);
    assert.equal(result.type, 'pkm');
    assert.equal(result.confidence, 'high');
  });

  it('detects pkm from Logseq content with block refs', () => {
    fs.mkdirSync(path.join(tmpDir, '.logseq'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'meeting-notes.md'),
      [
        '- Team meeting 2025-03-20',
        '  - Discussed [[migration plan]]',
        '  - Action: move to [[Kubernetes]] by Q3',
        '  - Referenced ((a1b2c3d4-5678-9abc-def0-123456789abc))',
      ].join('\n')
    );

    const result = detectSourceType(tmpDir);
    assert.equal(result.type, 'pkm');
  });

  it('detects sdd-spec from .specify directory presence', () => {
    fs.mkdirSync(path.join(tmpDir, '.specify'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'spec.md'),
      [
        '# Feature: User Auth',
        '',
        'Basic spec content here.',
      ].join('\n')
    );

    const result = detectSourceType(tmpDir);
    assert.equal(result.type, 'sdd-spec');
  });

  it('detects architecture from Structurizr DSL', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'workspace.dsl'),
      [
        'workspace {',
        '  model {',
        '    user = person "User"',
        '    webapp = softwareSystem "Web Application" {',
        '      frontend = container "Frontend" "React SPA"',
        '      backend = container "Backend" "Node.js API"',
        '      database = container "Database" "PostgreSQL"',
        '    }',
        '    user -> webapp "Uses"',
        '    frontend -> backend "API calls"',
        '    backend -> database "Reads/writes"',
        '  }',
        '  views {',
        '    systemContext webapp {',
        '      include *',
        '    }',
        '    container webapp {',
        '      include *',
        '    }',
        '  }',
        '}',
      ].join('\n')
    );

    const result = detectSourceType(tmpDir);
    assert.equal(result.type, 'architecture');
  });

  it('detects sdd-spec when target directory IS a signal directory', () => {
    // BUG 9 regression: self-check on path.basename(dirPath)
    const specifyDir = path.join(tmpDir, '.specify');
    fs.mkdirSync(specifyDir, { recursive: true });
    fs.mkdirSync(path.join(specifyDir, 'memory'));
    fs.mkdirSync(path.join(specifyDir, 'scripts'));
    fs.mkdirSync(path.join(specifyDir, 'templates'));
    fs.writeFileSync(
      path.join(specifyDir, 'constitution.md'),
      [
        '# Project Constitution',
        '',
        'GOAL: Build the authentication system',
        'ASSUMPTIONS: PostgreSQL available',
      ].join('\n')
    );

    const result = detectSourceType(specifyDir);
    assert.equal(result.type, 'sdd-spec');
  });

  it('does not classify project docs with code examples as framework-docs', () => {
    // BUG 10 regression: negative signals penalize framework-docs
    fs.writeFileSync(
      path.join(tmpDir, 'auth-design.md'),
      [
        '# Authentication Design',
        '',
        '## Context',
        'We need OAuth 2.0 for the API gateway.',
        '',
        '## Decision',
        'Use Passport.js with JWT strategy.',
        '',
        '## Consequences',
        '- Need refresh token rotation',
        '- Must handle token expiry',
        '',
        '## Acceptance Criteria',
        '- User can log in with email/password',
        '- Token refreshes automatically',
        '',
        '## Implementation',
        '```typescript',
        "import { Strategy } from 'passport-jwt';",
        "import { AuthService } from './auth.service';",
        '```',
        '',
        '```typescript',
        "import { JwtModule } from '@nestjs/jwt';",
        "import { ConfigService } from '@nestjs/config';",
        '```',
        '',
        '**Status:** Accepted',
        '',
        'Sprint 4 backlog item. See epic AUTH-100.',
      ].join('\n')
    );

    const result = detectSourceType(tmpDir);
    assert.notEqual(result.type, 'framework-docs',
      `expected anything but framework-docs, got ${result.type} (score: ${result.scores['framework-docs']})`
    );
    assert.ok(
      ['team-decision', 'project-docs'].includes(result.type),
      `expected team-decision or project-docs, got ${result.type}`
    );
  });

  it('detects project-docs from internal documentation with code and spec terms', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'api-guidelines.md'),
      [
        '# API Guidelines',
        '',
        '## User Stories',
        '- As a developer, I want consistent error responses',
        '- As a developer, I want pagination on all list endpoints',
        '',
        '## Implementation Plan',
        '',
        '```typescript',
        "import { Controller, Get } from '@nestjs/common';",
        "import { PaginationDto } from './dto/pagination.dto';",
        '```',
        '',
        '```typescript',
        "import { ApiResponse } from './types';",
        '// TODO: migrate to v2 response format',
        '```',
        '',
        'We need to refactor the error handling middleware.',
        'The sprint 5 backlog includes this work.',
      ].join('\n')
    );

    const result = detectSourceType(tmpDir);
    assert.equal(result.type, 'project-docs');
  });

  it('does not misclassify non-English docs/ directory as framework-docs (BUG 10)', () => {
    // Simulate a project docs/ directory with Ukrainian content containing
    // code blocks and import statements — high-weight framework-docs patterns.
    // Without the docs/ dir signal, framework-docs wins (166 vs 83).
    const docsDir = path.join(tmpDir, 'docs');
    fs.mkdirSync(docsDir, { recursive: true });
    fs.writeFileSync(
      path.join(docsDir, 'architecture.md'),
      [
        '# Архітектура системи',
        '',
        '## Огляд',
        'Система побудована на мікросервісній архітектурі.',
        '',
        '## Приклад коду',
        '```typescript',
        "import { Controller } from '@nestjs/common';",
        "import { AuthService } from './auth.service';",
        "import { JwtStrategy } from './jwt.strategy';",
        '```',
        '',
        '## Конфігурація',
        '```json',
        '{ "database": "postgresql", "port": 5432 }',
        '```',
        '',
        '```typescript',
        "import { Module } from '@nestjs/common';",
        "import { ConfigModule } from '@nestjs/config';",
        '```',
        '',
        'Запустити: `npm install` та `npm run start`',
      ].join('\n')
    );

    const result = detectSourceType(docsDir);
    assert.notEqual(result.type, 'framework-docs',
      `docs/ with non-English content should not be framework-docs (score: ${result.scores['framework-docs']})`
    );
    assert.equal(result.type, 'project-docs',
      `docs/ directory should be detected as project-docs, got ${result.type}`
    );
  });

  it('detects project-docs from doc/ directory name', () => {
    const docDir = path.join(tmpDir, 'doc');
    fs.mkdirSync(docDir, { recursive: true });
    fs.writeFileSync(
      path.join(docDir, 'guide.md'),
      [
        '# Development Guide',
        '',
        '```bash',
        'npm install',
        '```',
        '',
        '```javascript',
        "import express from 'express';",
        '```',
      ].join('\n')
    );

    const result = detectSourceType(docDir);
    assert.notEqual(result.type, 'framework-docs',
      `doc/ directory should not be framework-docs`
    );
  });
});
