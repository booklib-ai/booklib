---
description: Review code against Clean Code principles (Robert C. Martin). Usage: /clean-code-reviewer [file | path]
---

Apply the `clean-code-reviewer` skill.

**Target:** $ARGUMENTS
If no target was given, run `git diff HEAD` and review those changes.

Classify each finding as **HIGH** (correctness, naming that obscures intent), **MEDIUM** (design, structure), or **LOW** (style). Reference every finding as `file:line`.
