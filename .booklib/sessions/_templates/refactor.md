<session_handoff>
  <metadata>
    <timestamp>{{timestamp}}</timestamp>
    <session_id>{{session_name}}</session_id>
    <working_directory>{{working_directory}}</working_directory>
  </metadata>

  <context>
    <goal>Refactor: {{goal}}</goal>
    <progress>Current state: analyzed. Improvement opportunities identified.</progress>
    <pending_tasks>
1. Extract duplicate logic
2. Improve naming and organization
3. Add tests to verify behavior unchanged
4. Performance benchmarks
5. Documentation updates
    </pending_tasks>
  </context>

  <active_knowledge>
    <skill id="clean-code-reviewer" />
    <skill id="design-patterns" />
  </active_knowledge>

  <git_state>
    <branch>{{branch}}</branch>
  </git_state>

  <metadata_tags>
    <tag>refactor</tag>
    <tag>tech-debt</tag>
  </metadata_tags>
</session_handoff>
