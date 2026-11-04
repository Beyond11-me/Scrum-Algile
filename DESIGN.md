# iSQL design standard

The reference screens are the **problem list** (`/problems`) and the **workspace** (`/workspace/:id`).
New and redesigned screens follow them. When a mockup disagrees with this file, this file wins for
color, type and shape; the mockup wins for layout and content.

Values come from `frontend/src/styles/tokens.css`. Use the tokens, not hex codes, so both themes work.

## Color

| Role | Token | Used for |
|---|---|---|
| Page background | `--canvas` | Behind every card |
| Card background | `--surface` | Cards, panes, inputs |
| Quiet fill | `--subtle` | Table headers, hovered rows, segmented controls |
| Text | `--text` | Headings, values, labels |
| Secondary text | `--text-secondary`, `--muted` | Descriptions, hints, table headers |
| Border | `--border`, `--border-subtle` | Card outlines, row dividers |
| Accent | `--accent`, `--on-accent`, `--accent-subtle` | Primary buttons, links, hover |
| Success | `--success`, `--success-subtle` | Solved, accepted, Easy |
| Warning | `--warning`, `--warning-subtle` | In progress, hints, Medium |
| Danger | `--danger`, `--danger-subtle` | Errors, wrong answer, Hard |

- Dark mode swaps these tokens through `:root[data-theme="dark"]`. Do not write per-theme rules for a screen.
- The SQL editor is the one exception: it stays dark in both themes and has its own `--editor-*` tokens.
- Selected chips and filters invert, with `--text` as background and `--surface` as text. Accent is kept for actions and links.

## Type

JetBrains Mono everywhere, through `--font-ui` and `--font-mono`.

| Level | Size | Weight |
|---|---|---|
| Page title | 28px (22px on mobile) | 700 |
| Screen or problem title | 24px, line height 1.25 | 700 |
| Card or group title | 15px | 700 |
| Body, table cell, button | 13–14px | 400–600 |
| Label | 12–14px | 600 |
| Hint, badge, table header | 11–13px | 500–600 |

## Shape and spacing

- **Radius:** cards and panes `--radius-lg` (12px); inputs and buttons `--radius-md` (8px); badges and chips `--radius-full`.
- **Cards:** `--surface` with a 1px `--border`. No shadows, except the auth card.
- **Spacing:** multiples of 4px. Cards use 20–28px padding; form fields stack with 16px gaps; a label sits 6–8px above its input.
- **Page width:** `--content-width` (1200px) with a 16–20px side gutter.

## Components

- **Primary button:** `--accent` background, `--on-accent` text, 600 weight, 38–46px tall. Use one per view.
- **Secondary button:** `--surface` background with a `--border-default` border.
- **Input:** `--surface` background, 1px `--border-default` border, 44–46px tall in forms. An invalid input gets a `--danger` border.
- **Links:** `--accent`, no underline, 500–600 weight.
- **Tabs:** underlined. The active tab has a 2px `--text` line and 600 weight.
- **Badges:** `--*-subtle` background with the matching text color.
- **Banners:** 8px radius, 10–14px padding, `--*-subtle` background with the matching text color.
- **Icons:** `lucide-react` at 16–20px, or a small inline SVG for status icons.

## Behavior

- **Language:** interface copy is English.
- **Validation:** check on submit. After that, errors clear as the user fixes each field.
- **Errors:** field errors sit under the field. Server errors go in a banner above the form with `role="alert"`.
- **Empty states:** say what is missing and offer the next action.
- **No dead controls:** do not show a button or checkbox the backend cannot honor yet.
- **Forms:** connect errors with `aria-invalid` and `aria-describedby`, and give icon buttons an `aria-label`.
- **Mobile:** works at 375px with a 16px gutter and no horizontal page scroll.

## Auth screens

Sign in is the reference and uses `AuthLayout` with `centered`. Accounts are created by an administrator, so there is no sign-up screen.

- **Layout:** one raised card in the middle of the page, with no side panel. The card is the one place a shadow is allowed.
- **Page background:** `--canvas` in light mode and a darker `#131315` in dark mode, so the card stands out.
- **Card:** 440px wide, 32px padding, `--radius-lg`, 1px `--border`.
- **Order:** eyebrow pill, title and subtitle, form, then the switch link under the submit button.
- **Fields:** a visible label above each input, with an example as placeholder.
- **Password:** a text Show/Hide toggle inside the field, with the length rule under it on forms that create a password.
- **Submit button:** the standard primary button, full width.
