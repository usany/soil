---
name: auto-commit
description: Commit the current git changes automatically after edits are finished, with a message that matches the repo's history. Use when the user asks to auto-commit, commit after each change, or keep the working tree committed as work progresses.
---

# Auto Commit

## When to use

- The user asks to commit changes automatically, or to commit after each change.
- The task is finished and the user has asked for the result to be committed.

Do not commit when the user has not asked for commits. Commit or push only when the user asks.

## Steps

1. Run `git status --short` and `git diff --stat`. Stop if the repo is not a git repository.
2. Skip files that should not be committed: `.env`, key or credential files, `node_modules/`, build output, and anything the user said to leave out. Name any skipped file in the report.
3. Read the diff for the files to commit. If the changes cover unrelated work, split them into separate commits by topic.
4. Stage files by name with `git add <file>`. Avoid `git add -A` unless every change is intended.
5. Write the message as a Conventional Commit: `<type>: <subject>`, with a lowercase imperative subject of about 50 characters, such as `chore: update package.json` or `feat: add show script`. Pick the type from the change (`feat`, `fix`, `docs`, `refactor`, `chore`, and so on); use `chore` for config and automated file updates. Add a body only when the why is not obvious from the diff.
6. Commit with the attribution line below. Do not amend or force-push unless the user asks.
7. Report the commit hash, the subject, and any files left uncommitted.

## Attribution

End the commit message with:

```
Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
```

## Failure handling

- If a pre-commit hook fails, fix the reported problem and create a new commit. Do not bypass the hook with `--no-verify`.
- If there is nothing to commit, say so and stop.
