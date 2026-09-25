# Git, Pull Requests, and GitHub Actions Workflow Guide
 
This document explains the Git and GitHub workflow for this repository, including where continuous-integration (CI) commands run. It is intended for contributors who are new to Git, GitHub, and pull requests.
 
## 1. The three places where commands can run
 
It is important to distinguish these environments:
 
| Environment               | Who starts it          | Where commands run                          | Typical purpose                                                   |
| ------------------------- | ---------------------- | ------------------------------------------- | ------------------------------------------------------------------ |
| Local development machine | You, in Terminal       | Your Mac                                    | Writing code, reviewing changes, and running checks before a push  |
| GitHub Actions CI         | GitHub, after an event | A fresh GitHub-hosted `ubuntu-24.04` runner | Independently validating the branch or pull request                |
| Application containers    | Docker Compose          | Docker containers on your Mac or server     | Running the deployed web application, API, database, and Keycloak  |
 
The workflow in `ci.yml` uses:
 
```yaml
runs-on: ubuntu-24.04
```
 
Therefore, CI commands do **not** run on your Mac and do **not** run inside your local Docker containers. GitHub provisions an isolated, temporary Ubuntu virtual machine for each workflow run. The runner checks out the repository, executes the commands defined in `ci.yml`, reports the result back to GitHub, and is then discarded.
 
This is often described as a sandboxed or ephemeral environment. More precisely, it is a **GitHub-hosted virtual runner**. It has no access to your local files, local Docker containers, browser sessions, or personal environment variables — it only sees what the workflow explicitly checks out or is given via secrets/env vars.
 
## 2. When the CI workflow runs
 
The current workflow is triggered by the following events:
 
```yaml
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
  merge_group:
    types: [checks_requested]
  workflow_dispatch:
```
 
This means:
 
1. **Pull request targeting `main`:** CI runs whenever a PR is opened, updated, reopened, or synchronized (new commits pushed) against `main`.
2. **Push to `main`:** CI runs after changes have been merged or pushed directly to `main`.
3. **Merge queue:** CI runs for GitHub's merge queue, if that repository feature is enabled.
4. **Manual run:** A user with sufficient repository permissions can trigger the workflow manually from the GitHub Actions tab.
A push to a feature branch by itself does **not** match `push.branches: [main]`, so it does not trigger CI on its own. Once that feature branch has an open pull request whose base branch is `main`, the `pull_request` trigger runs CI for that PR — and it re-runs automatically on every new commit pushed to the branch.
 
## 3. What the CI runner executes
 
The `quality-gate` job in `ci.yml` runs these steps, in order:
 
```text
1. Check out the repository source code
2. Set up Node.js 24
3. Run npm ci
4. Run npm run format:check
5. Run npm run lint
6. Run npm test
7. Run npm run build
```
 
The equivalent shell commands are:
 
```bash
npm ci
npm run format:check
npm run lint
npm test
npm run build
```
 
Each `run:` step executes as a normal shell command on the GitHub-hosted Ubuntu runner, from the checked-out repository directory — it is not executed by your local terminal.
 
Note: `npm ci` (not `npm install`) is used deliberately in CI — it installs exact versions from `package-lock.json` and gives a clean, reproducible install, failing if the lockfile and `package.json` are out of sync.
 
The workflow may pass a small set of CI-only environment values (e.g. dummy config, secrets for build-time validation) to the job. These make configuration validation and builds possible, but they do **not** connect the runner to your local PostgreSQL database, Docker network, or Keycloak server — the runner is a completely separate, isolated machine with no network path to your Mac.
 
## 4. Why running checks locally still matters
 
The CI run is the repository's authoritative, independent check, but waiting for a remote run is slower than checking locally first. Before committing and pushing, run the same checks on your Mac:
 
```bash
npm run format:check
npm run lint
npm test
npm run build
```
 
Local and CI environments intentionally use the same Node.js version (Node 24), but they are not identical: your local machine is macOS, while CI runs on Ubuntu. A local pass gives fast feedback; a green CI run confirms the branch also passes cleanly on a fresh, dependency-locked GitHub runner — catching issues like "works on my machine" problems (OS-specific paths, uncommitted local files, stale caches, etc.).
 
If the CI log reports a formatting error such as:
 
```text
[warn] apps/web/src/app/tea-cafe/brew-list.tsx
Code style issues found
```
 
the workflow itself is working correctly — it's telling you the listed file needs formatting. Format only the relevant file(s) and re-check:
 
```bash
npx prettier --write apps/web/src/app/tea-cafe/brew-list.tsx
npm run format:check
```
 
## 5. Essential Git concepts
 
| Term               | Meaning                                                               |
| ------------------ | ---------------------------------------------------------------------- |
| Repository          | The project and its complete version history                          |
| Branch              | An independent line of work, such as `main` or `feature/tea-cafe`     |
| Commit              | A named snapshot of selected file changes                             |
| Remote              | A hosted copy of the repository; this project calls GitHub `origin`   |
| Push                | Send local commits to the remote repository                           |
| Pull                | Fetch and integrate remote commits into your local branch              |
| Pull Request (PR)   | A GitHub request to review and merge one branch into another          |
| Merge Request       | GitLab's name for the same concept as a Pull Request                  |
 
In this repository, `main` is the integration branch. New work should be done on a separate feature, fix, or documentation branch and merged into `main` through a PR — never committed directly to `main`.
 
## 6. Standard contribution workflow
 
Open Terminal in the project directory:
 
```bash
cd /Users/macbook/Desktop/hizmet
```
 
### Step 1: Inspect the current state
 
```bash
git status --short --branch
git branch --all
```
 
`git status --short --branch` shows which branch is active and whether files have changed. For example:
 
```text
## feature/tea-cafe...origin/feature/tea-cafe
 M apps/web/src/app/tea-cafe/brew-list.tsx
```
 
The first line identifies the local branch and the remote branch it tracks. `M` means the file has been modified but not yet staged/committed. Understand every local change before switching branches.
 
### Step 2: Update local `main`
 
Before starting new work:
 
```bash
git switch main
git pull --ff-only origin main
```
 
`git pull --ff-only` only updates the branch when Git can do so as a fast-forward, without creating a merge commit. If it refuses, someone diverged history unexpectedly — inspect the situation rather than forcing it.
 
Never commit or push feature work directly on `main`.
 
### Step 3: Create or enter a working branch
 
To resume an existing branch:
 
```bash
git switch feature/tea-cafe
git pull --ff-only origin feature/tea-cafe
```
 
To create a new branch from the current `main`:
 
```bash
git switch -c feature/short-description
```
 
Use meaningful names, e.g. `feature/tea-cafe`, `fix/login-timeout`, or `docs/pr-workflow`.
 
### Step 4: Review your changes
 
```bash
git status --short
git diff
git diff --check
```
 
- `git diff` shows uncommitted, line-by-line changes.
- `git diff --check` flags whitespace problems (trailing whitespace, leftover conflict markers).
Run the local quality checks from [Section 4](#4-why-running-checks-locally-still-matters) before committing.
 
### Step 5: Stage only the intended files
 
```bash
git add apps/api/src/modules/tea-cafe/tea-cafe.service.ts
git add apps/web/src/app/tea-cafe/brew-list.tsx
git status --short
```
 
`git add` selects what goes into the next commit. Prefer explicit paths over `git add .` (or `git add -A`) so unrelated files, local settings, scratch notes, or secrets aren't accidentally staged.
 
### Step 6: Create a commit
 
```bash
git commit -m "feat(tea-cafe): expire old brews automatically"
```
 
Use a concise message describing the resulting change. Common prefixes (Conventional Commits style):
 
- `feat:` new functionality
- `fix:` bug correction
- `docs:` documentation only
- `style:` formatting only, no logic change
- `refactor:` code change that neither fixes a bug nor adds a feature
- `test:` tests only
- `chore:` maintenance or tooling
To inspect the most recent commit:
 
```bash
git log -1 --oneline
```
 
### Step 7: Push the branch to GitHub
 
For an existing tracked remote branch:
 
```bash
git push origin feature/tea-cafe
```
 
For a newly created branch (first push):
 
```bash
git push -u origin feature/short-description
```
 
The `-u` (`--set-upstream`) flag records the GitHub branch as the upstream for your local branch. After that, a plain `git push` (with no arguments) is enough.
 
## 7. Opening and merging a Pull Request
 
### Open the PR in GitHub
 
1. Open the repository on GitHub.
2. Select **Compare & pull request**, or go to **Pull requests → New pull request**.
3. Set the **base** branch to `main`.
4. Set the **compare** branch to your working branch, e.g. `feature/tea-cafe`.
5. Add a clear title and fill in the repository's PR template.
6. Include screenshots for UI changes and note which checks you ran locally.
7. Select **Create pull request**.
Every subsequent push to the same branch is automatically added to the existing PR — do not open a new PR for each follow-up commit.
 
### Read the CI result
 
Open the PR's **Checks** tab. The expected check is named `quality-gate`.
 
- **Green** — every command in the workflow completed successfully.
- **Red** — one command failed. Open the failed step and start with the first meaningful error message, not the last line of output.
- **Skipped/greyed out** — the trigger conditions didn't match the event, or a workflow `if:` condition prevented that job from running.
### Merge the PR
 
Once CI is green and required reviews are approved:
 
1. Open **Files changed** and confirm every changed file belongs to this piece of work.
2. Confirm the merge direction is your working branch → `main`.
3. Select **Merge pull request** (or whichever merge strategy the repository enforces — merge commit, squash, or rebase).
4. Confirm the merge.
5. Update your local `main` afterwards:
```bash
git switch main
git pull --ff-only origin main
```
 
Deleting the feature branch after merge (GitHub usually offers a button for this) does **not** remove the merged code from `main` — the commits already live in `main`'s history.
 
## 8. When the remote branch changed first
 
If `git push` is rejected, someone else likely pushed to the same branch. Investigate before acting:
 
```bash
git fetch origin
git status --short --branch
git log --graph --oneline --decorate -8 HEAD origin/feature/tea-cafe
```
 
If the remote commits are compatible with yours, replay your work on top of them:
 
```bash
git rebase origin/feature/tea-cafe
git push origin feature/tea-cafe
```
 
Rebase reapplies your local commits on top of the current remote branch tip. It may skip a local commit if an equivalent change was already pushed by someone else. If a conflict occurs, do not guess or delete code at random — inspect `git status`, resolve only the flagged conflicts, or back out safely with:
 
```bash
git rebase --abort
```
 
> Note: after a successful rebase, `git push origin feature/tea-cafe` may itself be rejected because the branch history was rewritten. In that case (and only on your own feature branch, never on `main`), use `git push --force-with-lease origin feature/tea-cafe`, which is safer than a plain `--force` because it refuses to overwrite commits you haven't seen yet.
 
## 9. When Git refuses a branch switch
 
Git can block a branch switch with a message like:
 
```text
Your local changes would be overwritten by checkout
```
 
This is a safety feature, not a bug. Commit the work if it's ready. If it isn't ready yet, stash only the specific files:
 
```bash
git stash push -m "short-description" -- file-one file-two
git switch target-branch
git stash pop
```
 
`git stash pop` can produce conflicts, so use it only when you're sure exactly which files were stashed and why.
 
## 10. Quick reference
 
```bash
# Start work
git status --short --branch
git switch main
git pull --ff-only origin main
git switch -c feature/short-description
 
# Validate and commit
npm run format:check
npm run lint
npm test
npm run build
git diff --check
git add path/to/intended-file
git commit -m "feat: short description"
git push -u origin feature/short-description
 
# After the PR is merged
git switch main
git pull --ff-only origin main
git branch -d feature/short-description   # delete local copy of the merged branch
```
 
Never commit passwords, API tokens, private keys, `.env` files, or personal data. If a command produces an unexpected result, stop and inspect `git status` before taking another action.
 