---
description: Route your task to the most relevant @booklib/skills skill. Usage: /skill-router [file | task description]
---

Apply the `skill-router` skill to recommend the best @booklib skill for this task.

**Input:** $ARGUMENTS
If no input was given, use `git diff HEAD` as the scope.

Return a ranked recommendation with rationale and anti-triggers. Then ask if you should apply the recommended skill immediately.
