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
  return template
    .replace('{query}', vars.query ?? '')
    .replace('{fileContext}', vars.file ? `File: ${vars.file}` : '')
    .replace('{results}', vars.results ?? '');
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
