---
name: Fix patch
about: Person 1 sends a tested fix for a module, as a patch file the owner applies
title: "Fix: <short description>"
labels: fix-patch
assignees: ''
---

## What broke

<!-- What went wrong during integration, in plain English. Example: "Characters kept walking after clicking away from the window." -->

## Why

<!-- The cause. Example: "The browser never sends keyup when the window loses focus, so the key stayed 'pressed'." -->

## The fix

Patch file attached: `fix-<name>-<n>.patch`

<!-- Which files it changes, and what it changes in each. -->

## Prompt for your AI

```
I applied fix-<name>-<n>.patch from GitHub Issue #<N>. Here is the patch: <paste>. Explain each change in plain English so I can write my log entry.
```

## Steps

1. Download the patch into the repo's root folder and check you're on your own branch (`git status`).
2. `git apply --check fix-<name>-<n>.patch`, then `git apply fix-<name>-<n>.patch`.
3. Ask your AI to explain it, with the prompt above.
4. Write a log entry in your own words.
5. Commit the changed files and your log, and push to your own branch.
6. Open a pull request into `dev`, and mention this Issue (`Fixes #<N>`).

Full details: `docs/git-guide.md`, section 5.
