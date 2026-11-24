# One-time owner setup — development only
Status: pending real account, registration and installation. Do not share credentials in chat, git, screenshots or logs. No production or paid service authorized.

## 1. Account and demo site
Use https://developer.atlassian.com/console/myapps/ and sign in with the owner's Atlassian account.
For CLI authentication use https://id.atlassian.com/manage-profile/security/api-tokens : Create API token with scopes, select Forge, choose the necessary recommended scopes and a limited expiry. Copy privately. Never paste the token into ChatGPT. Do not enable billing or choose a paid plan.
On Windows PowerShell with Node 22 and npm available:
```powershell
node --version
npm --version
npm install --global @forge/cli@15.1.0
forge login
forge whoami
forge site provision
```
At sign-in, enter the token only in the CLI's credential prompt. Check site URL, READY status, expiry, and free usage/billing terms. The demo site is not the production site. Official: https://developer.atlassian.com/platform/forge/getting-started/ and https://developer.atlassian.com/platform/forge/provision-a-demo-development-site/ .

## 2. Register once, without changing the project
Use a separate empty directory (not this repository) for a new Forge-generated scaffold. Run `forge create "HAE TrustFlow"` interactively, selecting Jira and a Custom UI issue panel if offered. If an app already exists, use that app's existing ID instead; do NOT create or register repeatedly. Read the app.id from the generated manifest or developer console. Keep only the actual UUID for this project's FORGE_APP_ID. Do not copy scaffold code into our repository. Never substitute a fake app ID or use another app's ID.
Owner should confirm just the actual app UUID, demo site hostname, and successful registration/site provisioning; these identifiers are not API tokens. Never send secrets.
Official: https://developer.atlassian.com/platform/forge/cli-reference/create/ and https://developer.atlassian.com/platform/forge/cli-reference/register/ .

## 3. GitHub build
The feature branch workflow uses standard GitHub hosted Ubuntu, Node 22, exact direct dependency versions, read-only GITHUB_TOKEN, no Atlassian secrets, no deploy. If no committed lockfile exists, CI resolves a lockfile and installs from it; review lockfile artifact and commit it before repeatable release builds. Lockfile generation itself is not verified installation. Artifact contains public source-derived bundle and lockfile only.
First build evidence: exact SHA, Actions run link, steps, output checksums and lockfile. A build failure must be fixed, not waived. A skipped/no-run action is NOT PASS. GitHub App-originated ref updates may not produce a workflow run; if so use permitted GitHub UI trigger or an authorized local execution. Do not change repository security settings to bypass restrictions.
Review GitHub settings and standard runner eligibility (public repo) before enabling any paid runner or service.

## 4. Development lint/deploy/install — separate after evidence
Clone feature/forge-p1 into a clean folder or use an existing clone with no uncommitted changes. In apps/forge:
```powershell
$env:FORGE_APP_ID = '<actual registered UUID>'
npm ci
npm run test:smoke
npm run build
forge lint
```
Use npm ci only once the lockfile is present. For the first lockfile resolution use npm install --package-lock-only --ignore-scripts, then npm ci. Actual app registration and access must exist.
After explicit development-only deploy/install approval, cost/rights review, exact SHA and lint/build PASS:
```powershell
forge deploy --environment development
forge install --environment development --product jira --site <approved-demo-site.atlassian.net>
```
Review prompts and requested read:jira-work scope. No write scope or storage:app activation yet. Check installed app in the selected synthetic Jira issue, actual asUser read success/403/404 path, no mutation. Do not use production environment, auto-upgrade, --accept-terms, or unattended scope consent.

## 5. Optional CI credentials later
Only after owner explicitly approves development deployment automation and the read-only build is verified, add a separate manually gated development workflow/environment, with FORGE_EMAIL and FORGE_API_TOKEN as protected GitHub secrets, actual FORGE_APP_ID and approved site as variables. Do not use secrets in a push-build workflow. No default production, public distribution, write or storage scope. Official https://developer.atlassian.com/platform/forge/set-up-cicd/ .
