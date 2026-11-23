# CLAUDE.md

## Git: auto-commit on change

- After every file edit in this repo, commit that file on its own. A PostToolUse hook (`.claude/hooks/auto-commit.sh`, wired in `.claude/settings.json`) does this for Edit, Write and MultiEdit. Do not add extra commits on top of it.
- Commit message: `chore: update <path>` (Conventional Commits: type, colon, lowercase imperative subject), ending with `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`.
- Never commit `.env*`, `*.pem`, `*.key`, or files with "secret" or "credential" in the name.
- Do not push. Pushing, amending, rebasing or force-pushing needs an explicit request.
- Commit only the changed path, but do not leave other staged work behind. If other changes are staged, commit each one on its own with the same message format.
