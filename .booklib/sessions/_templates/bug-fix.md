<session_handoff>
  <metadata>
    <timestamp>{{timestamp}}</timestamp>
    <session_id>{{session_name}}</session_id>
    <working_directory>{{working_directory}}</working_directory>
  </metadata>

  <context>
    <goal>Fix: {{goal}}</goal>
    <progress>Reproduced the bug. Root cause identified. Solution planned.</progress>
    <pending_tasks>
1. Implement fix
2. Write regression test
3. Verify fix doesn't break existing tests
4. Test edge cases
5. Create PR with detailed explanation
    </pending_tasks>
  </context>

  <active_knowledge>
    <skill id="effective-typescript" />
    <skill id="clean-code-reviewer" />
  </active_knowledge>

  <git_state>
    <branch>{{branch}}</branch>
  </git_state>

  <metadata_tags>
    <tag>bug-fix</tag>
    <tag>urgent</tag>
  </metadata_tags>
</session_handoff>
