# Contributing to iSQL

Thanks for contributing! This guide describes how Scrum Team **AIgile** works on iSQL. Please read it before opening your first Pull Request.

## 1. Getting Started

1. Clone the repository and follow the [Quick Start with Docker](README.md#6-quick-start-with-docker) in the README, or run the services manually using [backend/README.md](backend/README.md) and [frontend/README.md](frontend/README.md).
2. Pick a backlog item from the current sprint on [Notion](https://app.notion.com/p/SCRUM-PROJECT-AIgile-40da4207918d80d4a50ed5add8055d5a) and assign yourself before you start.
3. Never commit `.env` files, passwords, API keys or database credentials.

## 2. Branching

| Branch | Purpose |
| --- | --- |
| `main` | Stable code; every change arrives through a reviewed Pull Request |
| `production` | Deployed to Azure; only updated from `main` |
| `feature/<short-name>` | New features, branched from `main` |
| `fix/<short-name>` | Bug fixes, branched from `main` |
| `hotfix/<short-name>` | Urgent production fixes |
| `docs/<short-name>`, `chore/<short-name>` | Documentation and maintenance work |

Use lowercase and hyphens, and keep branches short-lived. Example: `feature/rbac-guard`, `fix/query-timeout`.

```bash
git switch main
git pull
git switch -c feature/rbac-guard
```

## 3. Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>(<optional scope>): <short imperative description>
```

| Type | Use for |
| --- | --- |
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation only |
| `style` | Formatting, no behavior change |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test` | Adding or updating tests |
| `perf` | Performance improvement |
| `ci` | CI/CD workflows |
| `chore` | Tooling, dependencies, other maintenance |

Suggested scopes: `backend`, `frontend`, `admin`, `teacher`, `student`, `auth`, `sandbox`, `db`.

Examples:

```text
feat(sandbox): implement SQL query validator endpoint
fix(auth): resolve token expiry check
docs: add contributing guide
```

Rules:

- Use the imperative mood ("add", not "added"), no trailing period, keep the subject under about 72 characters.
- One logical change per commit.
- Add a body when the reason for the change is not obvious.

## 4. Before You Open a Pull Request

Run the same checks as CI locally.

Frontend:

```bash
cd frontend
npm ci
npm test
npm run build
```

Backend:

```bash
cd backend
DATABASE_URL=sqlite:///./ci-test.db python -m unittest discover -s tests -v
```

Full stack (optional, but recommended for database-related changes):

```bash
docker compose up --build -d --wait
python3 scripts/ci/smoke_compose.py
```

If you change grading logic in `backend/app/services/sandbox.py`, add test cases for:

- a correct query (accepted),
- a query with a wrong result (rejected),
- a different but equivalent query (accepted),
- a query with a syntax error (clear error message, no crash),
- a blocked statement such as `DROP`, `DELETE`, `UPDATE` or `INSERT`.

## 5. Pull Requests

1. Push your branch and open a Pull Request into `main`.
2. Use a Conventional Commit style title, e.g. `feat(admin): add class management page`.
3. In the description, link the Notion backlog item and explain what changed and how you tested it. Add screenshots for UI changes.
4. All CI checks must pass: `Frontend checks`, `Backend checks`, and `Docker and SQL Server integration`.
5. At least **one other team member** must approve. **Self-merging without review is not allowed.**
6. Resolve every required review comment before merging, and delete the branch after merge.

Reviewers should give feedback on the code, not the person, and keep it polite, objective and solution-oriented.

## 6. Coding Guidelines

- Follow the existing structure: API routes in `backend/app/routers/`, business logic in `backend/app/services/`, pages in `frontend/src/pages/<role>/`, API calls in `frontend/src/services/`.
- Match the naming and style of the surrounding code; add comments where the logic is not obvious.
- New API endpoints need a short summary so they show up clearly in the FastAPI docs (`/docs`).
- Update the README or Notion if your change affects how the project is run or used.

### Using AI Tools

AI tools (GitHub Copilot, ChatGPT, Claude, ...) are welcome, but:

- You are fully accountable for any code you commit, including AI-generated code. Understand and review it before opening a PR.
- Never paste production credentials, private keys or real user data into AI prompts.

## 7. Definition of Done

A backlog item is **Done** only when all of the following are met:

1. **Tests passed:** unit and integration tests pass; no known critical bug (crash, data loss, wrong grading result) remains open.
2. **Code reviewed:** merged into `main` through an approved Pull Request; frontend and backend build and run without errors.
3. **Acceptance criteria met** for the user story.
4. **Functional tests passed:** the main flow and its error cases work as expected.
5. **Non-functional requirements met:** student queries cannot modify data; a typical query is graded in under 3 seconds; a teammate can use the feature without help.
6. **Product Owner acceptance** in the demo environment, and the item is moved to "Done" on Notion.

## 8. Getting Help

- Stuck for more than 2 hours? Ask the team in the main chat channel.
- Raise blockers at the Daily Standup or in chat right away, not on the deadline day.
- Process questions go to the Scrum Master; product and scope questions go to the Product Owner.
