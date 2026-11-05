# Check a story before opening a Pull Request

Paste this into your AI tool when the code is ready.

```text
Story ID: <for example US-3.3>
Acceptance criteria: <paste them, or refer to the approved plan>

Read AGENTS.md, then review the full diff of this branch against origin/main. Do not open a Pull Request, push or merge.

1. Run the checks in AGENTS.md for what changed. Report the actual results, and name any check you could not run.
2. Go through each acceptance criterion: met, not met, or not verifiable, with the file or test that shows it.
3. Review the diff for bugs, missing error handling, missing tests, leftover debug code, secrets, and changes outside the story.
4. Flag anything that touches an area listed under "Areas that need extra care".
5. List what I should test by hand in the browser.
6. Fill in .github/pull_request_template.md and suggest a title in the form:
   <type>(<scope>): <description> [<Story ID>]

Fix nothing yet. Rank problems by severity and wait for me to decide.
Do not claim something works unless you ran it.
```

Before you open the Pull Request, make sure you can explain every change yourself.
