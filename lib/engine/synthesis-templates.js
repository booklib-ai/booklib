export const SYNTHESIS_TEMPLATES = {
  'framework-docs': `You are synthesizing a context injection from framework documentation. The agent needs to use a specific API correctly.

Task: {query}
{fileContext}

Search results from indexed docs:
{results}

Structure as:

## API Reference
- [Exact function/component name with signature and parameters]
- [Required configuration or setup steps]

## Migration (if applicable)
- [Old API → New API with specific method names]
- [What changed and why]

## Code Example
[Working code example from the search results — not invented]

## Gotchas
- [Non-obvious behavior, common mistakes, or breaking changes]

Only include what's IN the search results. Don't add knowledge from training data.
If not relevant: NO_RELEVANT_KNOWLEDGE`,

  'api-reference': `You are synthesizing a context injection from API documentation.

Task: {query}
{fileContext}

Search results:
{results}

Structure as:

## Endpoints
- [Method + path + description]

## Request Format
- [Parameters, headers, body schema]

## Response Format
- [Status codes + response body]

## Error Handling
- [Error codes and what they mean]

Only include what's IN the search results.
If not relevant: NO_RELEVANT_KNOWLEDGE`,

  'release-notes': `You are synthesizing a context injection from release notes and changelogs.

Task: {query}
{fileContext}

Search results:
{results}

Structure as:

## What Changed
- [Specific API or behavior change with version number]

## Before → After
- Before: [old pattern] → After: [new pattern]

## Migration Code
[Code showing the new way to do it]

## Breaking Changes
- [What will break if old patterns are used]

Only include what's IN the search results. Flag deprecated APIs explicitly.
If not relevant: NO_RELEVANT_KNOWLEDGE`,

  'spec': `You are synthesizing a context injection from project specifications.

Task: {query}
{fileContext}

Search results:
{results}

Structure as:

## Requirements
- [Specific requirement with acceptance criteria]

## Constraints
- [Technical or business constraint that limits implementation]

## Dependencies
- [Other features or systems this depends on]

Only include what's IN the search results. Don't add assumptions.
If not relevant: NO_RELEVANT_KNOWLEDGE`,

  'team-decision': `You are synthesizing a context injection from team architecture decisions.

Task: {query}
{fileContext}

Search results:
{results}

Structure as:

## Decision
- [What was decided and when]

## Context
- [Why this decision was made — the problem it solves]

## Constraints
- [What this decision requires or prohibits in the codebase]

## Consequences
- [Trade-offs accepted with this decision]

Only include what's IN the search results.
If not relevant: NO_RELEVANT_KNOWLEDGE`,

  'tutorial': `You are synthesizing a context injection from a tutorial or guide.

Task: {query}
{fileContext}

Search results:
{results}

Structure as:

## Steps
1. [First step with specific command or action]
2. [Next step]
3. [Continue...]

## Key Concepts
- [Important concept the agent needs to understand]

## Common Mistakes
- [What beginners get wrong]

Only include what's IN the search results.
If not relevant: NO_RELEVANT_KNOWLEDGE`,

  'sdd-spec': `You are synthesizing a context injection from a spec-driven development artifact (SpecKit, GSD, Kiro, Superpowers, or similar).

Task: {query}
{fileContext}

Search results:
{results}

Structure as:

## Goal
- [What the spec is trying to achieve]

## Requirements
- [Specific deliverables or acceptance criteria]

## Constraints
- [What is explicitly out of scope or not allowed]

## Architecture / Approach
- [Technical approach, key files, dependencies]

## Tasks
- [Implementation steps if defined in the spec]

Only include what's IN the search results.
If not relevant: NO_RELEVANT_KNOWLEDGE`,

  'api-spec': `You are synthesizing a context injection from a structured API specification (OpenAPI, AsyncAPI, GraphQL, gRPC/Proto).

Task: {query}
{fileContext}

Search results:
{results}

Structure as:

## Endpoints / Operations
- [Method + path + description, or query/mutation/subscription name]

## Schema
- [Request/response types, message definitions, input types]

## Parameters
- [Path params, query params, headers, field arguments]

## Authentication
- [Security schemes, required headers/tokens]

## Errors
- [Error codes, error types, validation rules]

Only include what's IN the search results. Preserve exact type names and field definitions.
If not relevant: NO_RELEVANT_KNOWLEDGE`,

  'bdd-spec': `You are synthesizing a context injection from BDD/Gherkin specifications.

Task: {query}
{fileContext}

Search results:
{results}

Structure as:

## Features
- [Feature name and description]

## Scenarios
- [Scenario name: Given/When/Then steps summarized]

## Business Rules
- [Rules or constraints implied by the scenarios]

## Test Coverage
- [What behaviors are specified vs gaps]

Only include what's IN the search results. Preserve exact Given/When/Then language.
If not relevant: NO_RELEVANT_KNOWLEDGE`,

  'architecture': `You are synthesizing a context injection from architecture documentation (C4 model, Structurizr, arc42, or similar).

Task: {query}
{fileContext}

Search results:
{results}

Structure as:

## System Overview
- [Systems, containers, and their purposes]

## Components
- [Key components and their responsibilities]

## Relationships
- [How components interact — protocols, data flow]

## Constraints
- [Technology choices, deployment requirements, quality attributes]

Only include what's IN the search results. Preserve exact component and system names.
If not relevant: NO_RELEVANT_KNOWLEDGE`,

  'pkm': `You are synthesizing a context injection from a personal knowledge base (Obsidian, Logseq, Foam, or similar PKM vault).

Task: {query}
{fileContext}

Search results:
{results}

Structure as:

## Key Insights
- [Main ideas and conclusions relevant to the task]

## Decisions & Agreements
- [Any decisions, commitments, or agreements captured in the notes]

## Connected Topics
- [Related notes, linked concepts, and cross-references mentioned]

## Context & Background
- [Relevant context, meeting notes, or research findings]

Only include what's IN the search results. Preserve note titles and link references.
If not relevant: NO_RELEVANT_KNOWLEDGE`,

  'project-docs': `You are synthesizing a context injection from internal project documentation that contains both specifications and code examples.

Task: {query}
{fileContext}

Search results from project docs:
{results}

Structure as:

## Requirements & Decisions
- [Relevant requirements, acceptance criteria, or architectural decisions]

## Implementation Notes
- [Code patterns, conventions, or technical constraints from the project]

## Code Context
[Relevant code examples from the project docs -- not from external frameworks]

## Dependencies & Risks
- [Related components, migration concerns, or known issues]

Only include what's IN the search results. Don't add external knowledge.
If not relevant: NO_RELEVANT_KNOWLEDGE`,

  'wiki': `You are synthesizing a context injection from general documentation.

Task: {query}
{fileContext}

Search results:
{results}

Structure as:

## Summary
- [Key points relevant to the task]

## Details
- [Specific information the agent needs]

## Related
- [Connected topics or references mentioned]

Only include what's IN the search results.
If not relevant: NO_RELEVANT_KNOWLEDGE`,
};

/**
 * Get the synthesis prompt for a source type.
 * Falls back to 'wiki' template for unknown types.
 *
 * @param {string} sourceType
 * @param {object} vars - { query, file, results }
 * @returns {string} filled prompt
 */
export function getSynthesisPrompt(sourceType, vars) {
  const template = SYNTHESIS_TEMPLATES[sourceType] ?? SYNTHESIS_TEMPLATES['wiki'];
  // Sanitize inputs: length-limit to prevent prompt injection and context overflow
  const query = String(vars.query ?? '').slice(0, 500);
  const file = vars.file ? `File: ${String(vars.file).slice(0, 200)}` : '';
  const results = String(vars.results ?? '').slice(0, 10000);
  return template
    .replace('{query}', query)
    .replace('{fileContext}', file)
    .replace('{results}', results);
}

/**
 * Detect the majority source type from search result metadata.
 * @param {Array} results - search results with metadata
 * @returns {string|null} majority source type or null
 */
export function detectResultSourceType(results) {
  const counts = {};
  for (const r of results) {
    const st = r.metadata?.sourceType ?? r.metadata?.sourceName;
    if (st) counts[st] = (counts[st] ?? 0) + 1;
  }
  if (Object.keys(counts).length === 0) return null;

  // Return the most frequent
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}
