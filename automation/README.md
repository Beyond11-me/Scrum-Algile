# AI Manager

Reads the Notion Product Backlog and GitHub, finds what is stuck, suggests next actions per person, and writes a brief on the `AI Manager` Notion page. It runs on a schedule or on demand.

It only suggests. It never changes a story's status, assigns work or merges anything. The PO or Scrum Master ticks the suggestions they accept, and people do the rest.

## How it works

```text
collect (Notion + GitHub) -> analyze (rules in code) -> plan (AI) -> publish (AI Manager page)
```

If there is no AI key or the AI call fails, the brief is still published with rule results only.

Each run replaces the bot's previous brief, including its ticked boxes, so the workspace's block allowance is not used up. Anything people write on the page stays. Act on approved items before the next run.

If the workspace is out of free blocks, the brief is written as plain text into one block instead, without tickable boxes. The bot goes back to the full layout once Notion accepts new blocks.

## Try it

```bash
cd automation
npm ci
npm run manager:demo
```

This uses made-up data and publishes nothing. Add `GEMINI_API_KEY` to try the AI step.

## Set up for the team

1. A Notion workspace owner creates an internal integration with read content, update content and insert content capabilities, then shares it with the `Product Backlog` database and a new `AI Manager` page.
2. A repository admin adds these under GitHub Settings > Secrets and variables > Actions:

   | Type | Name | Value |
   | --- | --- | --- |
   | Secret | `NOTION_TOKEN` | Integration token |
   | Secret | `AI_MANAGER_GEMINI_API_KEY` | A separate key, not the app's key (optional) |
   | Variable | `NOTION_DATABASE_ID` | Product Backlog database ID |
   | Variable | `NOTION_BRIEF_PAGE_ID` | `AI Manager` page ID |

3. After this workflow reaches `main`, open Actions > AI Manager > Run workflow.

To preview real data on your machine without publishing, copy `.env.example` to `.env`, fill it in, and run:

```bash
npx tsx --env-file=.env src/run.ts --dry-run
```

Remove `--dry-run` to publish the brief to Notion. Git ignores `.env`; do not commit those values.

## Rules for the bot

- This repository is public and so are its Actions logs. The bot prints only counts in CI; never add board content to logs or to `demo-data.ts`.
- Board and PR text is untrusted input. The agent has no tools, and suggestions for anyone outside the board's roster are dropped.
- Do not send real student data to the AI. Keep it out of backlog items.
- Board property names are read in `src/sources.ts`. Update them there if the board's columns are renamed.
