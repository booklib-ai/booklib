# Tool Spec: `review_file`
*Replaces: `audit_content`*

## Name
`review_file`

## Purpose
Deep-review a specific file against known principles. Returns structured findings organized by principle — what's good, what violates known patterns, what to improve.

## When the agent should call this
- User asks "review this file" or "check this code"
- User asks for a thorough quality analysis
- Agent detects a file with potential quality issues
- User wants to compare their code against known expert patterns

## When NOT to call this
- For quick questions (use `lookup` instead)
- When the user just wants to understand the code, not review it
- For files that have no relevant knowledge domain

## Input
```json
{
  "file_path": "string (required) — path to the file to review",
  "skill": "string (optional) — specific knowledge domain to review against. If omitted, auto-detects from file type and content."
}
```

## Output (target format)
```json
{
  "file": "src/auth/JwtFilter.java",
  "reviewed_against": "springboot-security",
  "findings": [
    {
      "type": "violation",
      "principle": "Validate tokens per-request with OncePerRequestFilter",
      "location": "line 23-45",
      "detail": "Token validation bypasses filter chain on certain paths"
    },
    {
      "type": "good",
      "principle": "Use httpOnly, Secure cookies",
      "detail": "Cookie configuration follows recommended practice"
    }
  ],
  "summary": "1 violation, 1 good practice found."
}
```

When no relevant skill exists:
```json
{
  "file": "styles.css",
  "reviewed_against": null,
  "findings": [],
  "summary": "No relevant knowledge domain found for this file type."
}
```

## Processing
1. Read the file content
2. If `skill` provided, use it. Otherwise, detect from file extension and content using `lookup`
3. Load the skill's principles and anti-patterns
4. Compare file content against each principle
5. Structure findings

## Edge cases
- File doesn't exist → return error
- File is binary → return error "Binary files cannot be reviewed"
- No matching skill → return empty with note
- Skill specified but doesn't exist → return error with available skills list

## Difference from `lookup`
`lookup` answers questions. `review_file` analyzes a specific file. Different trigger, different output shape, different use case.
