# Prompts for starting an AI session

Copy one of these at the start of **every** AI session, fill in the `<placeholders>`, and paste it. They make the AI follow our rules and explain what it builds.

## Which one do I use?

| Version | Use it when | Example tools |
|---|---|---|
| **A** | Your AI is a **coding agent** that can read the repo on your laptop | Claude Code, Antigravity, Cursor, Copilot agent mode |
| **B** | Your AI is a **free web chat** that can't see any of your files | ChatGPT, Gemini, Claude.ai |
| **C** | Optional: you want a web chat to **plan**, by writing a detailed prompt that you then give to your coding agent | Any web chat, then a version A tool |
| **Fix-patch** | Person 1 sent you a fix as a patch file in a GitHub Issue, and you've already applied it | Any |

Your folders, module number and brief file are in the ownership table in `AGENTS.md`, section 3. Your task number for today is in the calendar in your brief.

---

## Version A — coding agent

```
I'm <name>, owner of Module <N> (<module name>). My folders: <folders from AGENTS.md>.
Today's task: Task <X> in docs/briefs/<my brief file>.
Before writing any code, read AGENTS.md, CONTRACTS.md, my brief and my log (docs/logs/<name>.md).
Build only today's task, only inside my folders, using names from CONTRACTS.md and shared/ exactly.
Then explain what you built in plain English for a beginner, define every new term, and tell me how to test it.
Finally, draft a 3–5 line log entry that I will rewrite in my own words. Don't commit or push; I do that myself.
```

---

## Version B — free web chat

```
I'm <name>, a beginner building Module <N> (<module name>) of a team project. You can't see my files, so everything you need is pasted below.
Follow AGENTS.md and CONTRACTS.md exactly. Only create or change files inside my folders: <folders>.
Today's task is pasted below. Give me complete files, never fragments, each with its full path (for example server/geo/db.js), and tell me exactly how to run and test them. I'll paste any error back to you.
When it works, explain the code in plain English for a beginner, then draft a 3–5 line log entry that I will rewrite in my own words.

--- AGENTS.md ---
<paste the whole file>
--- CONTRACTS.md ---
<paste the whole file>
--- My brief: sections 1–2, today's task, and the appendix ---
<paste>
--- Current content of the files I'll change ---
<paste each file with its path, or write "none yet">
```

---

## Version C — optional planner

```
Don't write code. Turn my task below into a detailed prompt for my coding agent (<tool name>), which already has the repo, AGENTS.md and CONTRACTS.md.
The prompt must say: which files to create or change (only inside <my folders>), which names from CONTRACTS.md to use, how to test the result, and what "done" looks like.

--- My brief: sections 1–2, today's task, and the appendix ---
<paste>
```

---

## Fix-patch prompt

Use this after you've run `git apply fix-<name>-<n>.patch` yourself (steps in `docs/git-guide.md`).

```
I applied fix-<name>-<n>.patch from GitHub Issue #<N>. Here is the patch: <paste>. Explain each change in plain English so I can write my log entry.
```
