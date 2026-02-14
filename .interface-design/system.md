# DK Dashboard Interface Design System

## Principles
- Optimize for rapid scanning in live use.
- Use a small set of reusable patterns across all routes.
- Prefer structure, spacing, and labels over decorative styling.

## Spacing And Layout Rhythm
- Base unit: `4px`.
- Scale: `4, 8, 12, 16, 20, 24, 32`.
- Page padding: `16px` mobile, `20px` desktop.
- Vertical rhythm:
  - Page sections separated by `16px`.
  - Related controls grouped with `8px` gaps.
  - Card internals use `8-12px` gaps.
- Content width:
  - Main content max width `1200px`.
  - Use responsive grids for sport cards and summary blocks.

## Typography Scale
- Page title: `28px/1.2`, semibold.
- Section title: `20px/1.25`, semibold.
- Subsection title: `16px/1.3`, semibold.
- Body: `14px/1.45`, regular.
- Meta/helper text: `12px/1.4`, medium/regular.
- Use sentence case labels and concise wording.

## Borders, Radius, Shadow
- Border color: one neutral stroke token for all surfaces.
- Surface radius:
  - Panels/cards: `12px`
  - Inputs/buttons/badges: `8px`
  - Pills/status chips: `999px`
- Shadow:
  - Default panels: subtle single-layer shadow.
  - Elevated/focus states: slightly stronger shadow plus clear ring.

## Component Sizing
- Badge:
  - Height target ~`22-24px`.
  - Horizontal padding `8px`.
  - Text size `12px`, semibold.
- Button:
  - Min height `36px`.
  - Horizontal padding `12px`.
  - Font `14px`, semibold.
- Input/select:
  - Min height `36px`.
  - Horizontal padding `10-12px`.
  - Clear border and visible focus ring.

## Table Density Guidelines
- Default table mode: compact readable.
- Header row: sticky style not required yet; use stronger weight and subtle background.
- Cell padding: `8px 10px`.
- Row separators visible but light.
- Keep numeric columns right-aligned where practical.
- For dense data, require search first and preserve readable line-height.

## Accessibility Basics
- Focus:
  - All interactive controls must have a visible `:focus-visible` outline.
  - Outline must not rely only on color changes in text.
- Contrast:
  - Maintain readable text contrast on all surfaces.
  - Status chips pair color with text labels (`Fresh`, `Stale`, `Error`, etc.).
- Status semantics:
  - Never rely on color alone; always include a textual state.
- Touch/mobile:
  - Interactive targets should be comfortably tappable (>= `36px` high).
- Motion:
  - Keep motion minimal; no required animations for comprehension.

## Reusable UI Patterns In This App
- `page` wrapper with consistent heading + meta/action row.
- `panel` surface for grouped content.
- `action-row` for grouped controls (refresh, change key, filters).
- `field`, `field-grid`, and `form-grid` for labels/inputs.
- `data-table` for player pools and health diagnostics.
- `list-panel` and `item-card` for timeline/profile lists.
