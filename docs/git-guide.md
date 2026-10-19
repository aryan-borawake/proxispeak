# Git guide for ProxiSpeak

Plain steps for our rules. Type the commands in a terminal (on Windows: Git Bash, or the terminal inside VS Code). Replace `<your-branch>` with your own branch name: `aryan`, `pratik`, `anjali` or `koushik`.

**Words you need**

| Word | Plain meaning |
|---|---|
| Repository (repo) | The project folder plus its full history, stored on GitHub |
| Clone | Download the repo to your laptop, once |
| Branch | Your own copy of the code where you work without touching anyone else's. Yours is named after you |
| `main` | The starting branch. Only Person 1 changes it, and only once (the skeleton) |
| `dev` | The branch where Person 1 joins everyone's work together (integration) |
| Commit | A saved snapshot of your changes, with a message saying what changed |
| Push | Upload your commits to GitHub |
| Pull request (PR) | A request on GitHub to bring your branch's work into `dev` |
| Merge | Combine the work of two branches |
| Conflict | Git can't merge automatically because two people changed the same lines |
| Patch | A file listing exact line changes, which Git can apply for you |

---

## 1. One-time setup

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"     # the same email as your GitHub account
git clone <repo URL from GitHub>
cd <repo folder>
git switch <your-branch>
```

Use the same email as your GitHub account, or your commits won't count as yours.

---

## 2. Getting started (once)

Your branch already exists on GitHub. Wait until Person 1 says the skeleton is on `main`, then run:

```bash
git switch main
git pull
git switch <your-name>
git merge main --no-edit
git push
```

This one-time merge of `main` into your own branch is **the only merge you ever run**. Never merge `main` or `dev` into your branch again.

If Git prints `CONFLICT`, **stop** and ask Person 1. Don't try to fix it yourself.

Then install the packages, once in each folder:

```bash
cd server
npm install
cd ../client
npm install
cd ..
```

Finally, copy `.env.example` to `.env` in the repo root (example: `cp .env.example .env`).

---

## 3. Daily

```bash
git status                       # first line must say "On branch <your-branch>"
git add <files>                  # e.g. git add client/src/world/ docs/logs/anjali.md
git commit -m "feat(world): keyboard movement"
git push origin <your-branch>
```

- **Check you're on your branch first.** `git status` shows it on the first line. If it's wrong, stop and read section 7.
- Commit your code **and** your log together.
- Commit at least once a day, between 6 AM and 11:30 PM.
- Commit message format: `type(module): what changed`. Types: `feat` (new feature), `fix` (bug fix), `docs`, `test`, `perf` (speed), `chore` (setup).
- Add files by name. Avoid `git add .`, which can pick up files you didn't mean to commit.

---

## 4. Opening a pull request

On integration days (Wed 21 and Sat 24 Oct, then as the calendar says), in the morning:

1. On GitHub, go to **Pull requests → New pull request**.
2. Set **base: `dev`** ← **compare: `<your-branch>`**. Double-check base is `dev`, not `main`.
3. Fill in the template (what it adds, how to test, which brief day, checklist).
4. Click **Create pull request**.

Only Person 1 merges pull requests, always with **"Create a merge commit"**. You never click merge.

---

## 5. Applying a fix patch from an Issue

When Person 1 fixes something in your folder during integration, you get a GitHub Issue with a patch file `fix-<name>-<n>.patch` attached. You apply it yourself, so the fix becomes your commit and you understand it.

1. Download the patch file into the repo's root folder.
2. Make sure you're on your branch: `git status`.
3. Check it applies cleanly: `git apply --check fix-<name>-<n>.patch` (no output = good).
4. Apply it: `git apply fix-<name>-<n>.patch`
5. Ask your AI to explain it, with the fix-patch prompt in `docs/ai-session-prompt.md`.
6. Write a log entry in your own words.
7. Commit (the patch file itself is git-ignored, so it won't be committed):
   ```bash
   git add <the changed files> docs/logs/<your-name>.md
   git commit -m "fix(<module>): <what the patch fixed>"
   git push origin <your-branch>
   ```
8. Open a pull request into `dev` (section 4).

If `git apply --check` prints an error, stop and send the error to Person 1.

---

## 6. Never

- Push to someone else's branch.
- Merge anything into `main`.
- Merge `dev` into your branch.
- Force-push (`git push --force` or `-f`).
- Click GitHub's **"Update branch"**, **"Resolve conflicts"** or **"Delete branch"** buttons.

---

## 7. Common situations

**"I committed on the wrong branch."**
1. **Don't push.**
2. Copy the commit's id: `git log --oneline -1` (the short code at the start, e.g. `a1b2c3d`).
3. Move to your branch and copy the commit there:
   ```bash
   git switch <your-branch>
   git cherry-pick <commit id>
   git push origin <your-branch>
   ```
4. Tell Person 1 which branch has the stray commit, so it can be cleaned up safely. Don't try `git reset` yourself.

**"Should I pull my teammates' work?"**
No. We never pull teammates' branches. Their work and yours meet only in `dev`, when Person 1 merges the pull requests. Until then, you use a fake (e.g. `createFakeNet()`).

**"Git says: LF will be replaced by CRLF."**
Harmless on Windows. It's about invisible line-ending characters. Ignore it and carry on.

**"Git says: Your branch is behind."**
Run `git pull` while on **your** branch. If it prints `CONFLICT`, stop and ask Person 1.

**"I'm stuck or something looks scary."**
Stop, don't type more commands, take a screenshot and send it to Person 1.
