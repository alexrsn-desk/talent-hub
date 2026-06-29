## Goal
Complete visual redesign of Desky to feel like a performance intelligence tool. Light theme everywhere except Biller's Workflow (stays dark). Zero functionality changes — tokens, spacing, typography, and key page chrome only.

## Scope of change
- Global design tokens (light theme by default, semantic colors with meaning)
- Sidebar (dark `#111827`, sectioned, badge styles)
- My Desk / Dashboard (morning brief, stats bar, action cards)
- Candidate Profile header + Profile tab layout
- Biller's Workflow (already dark cockpit — retune to spec palette/spacing)
- Shared primitives: Card, Button, Badge variants

Everything else (Jobs, Clients, Placements, Pipelines, etc.) inherits the new tokens automatically and gets light styling without layout rework.

## Plan

### 1. Tokens — `src/index.css` + `tailwind.config.ts`
Rewrite `:root` to the light palette:
- bg `#F9FAFB`, card `#FFFFFF`, border `#E5E7EB`
- text `#111827` / `#6B7280` / `#9CA3AF`
- primary `#3B82F6`, destructive `#EF4444`, warning `#F59E0B`, success `#10B981`
- sidebar bg `#111827`, sidebar fg `#9CA3AF`, sidebar primary `#3B82F6`
Add `--cockpit-*` tokens for Biller's Workflow dark surfaces so that page keeps its identity.
Set base font to Inter, default radius 6px. Add small typography utility classes (`.text-display`, `.text-h1`, `.text-h2`, `.text-micro`).

### 2. Card / Button / Badge
- `card.tsx`: padding 16, radius 8, border `#E5E7EB`, shadow `0 1px 3px rgba(0,0,0,0.06)`. Remove heavy outlines.
- `button.tsx`: tighten primary/secondary/ghost variants to spec (no gradient/shadow, 13px semibold, 6px radius, hover states).
- `badge.tsx`: add status variants (active/passive/li/hold/cold/dnc) matching the spec pills.

### 3. Sidebar — `src/components/AppSidebar.tsx`
- Dark `#111827`, 220px width, Desky logo in blue
- Section dividers with uppercase 10px labels (`WORKSPACE` / `DATA` / `TOOLS`) grouping existing nav items
- Active state: blue icon + light label + `rgba(59,130,246,0.1)` bg
- Badge counts as pills (urgent red / info blue)

### 4. My Desk (`src/pages/Dashboard.tsx`)
- Drop card chrome from morning brief; greeting `28px bold`, AI summary `14px #374151`
- Horizontal stats bar (5 numbers) with colored emphasis only when meaningful
- "Actions" header + action cards (white, 3px left border in urgency color, pill action button right)
- "My list" using same card style with checkbox left

### 5. Candidate Profile (`src/components/CandidateDetail.tsx`)
- Header without card: 48px blue initials circle, name 22px bold, role line, key facts line, action buttons right
- Tabs with 2px blue underline active state
- Profile tab: 60/40 split, inline-edit fields with uppercase labels, motivations paragraph, skill pills, "not interested in" red pills, industries tags

### 6. Biller's Workflow (`src/pages/BillersWorkflow.tsx`)
Retune existing cockpit to exact spec: page `#0F172A`, coach banner `#1E293B` with `⚡`, two 48% columns with amber/green header tinted blocks, subsection labels `11px uppercase #475569`, item cards `#1E293B` with 3px left urgency border, 8px urgency dot top-right, subtle "Done" bottom-right, green empty state.

### 7. Visual sweep
Spot-check Jobs / Clients / Placements / Pipelines / Settings to confirm new tokens render cleanly (no hard-coded dark colors leaking). Replace any `bg-black` / `text-white` literals found with semantic tokens. No layout changes.

## Non-goals
- No feature changes, no new components, no data model edits
- No copy changes beyond labels explicitly in the spec ("Actions", section headers)
- Pages outside the highlighted set get token-level updates only

## Technical notes
- All colors live in `index.css` as HSL; Tailwind classes (`bg-background`, `text-foreground`, `border-border`, `bg-primary`, `text-destructive`, etc.) continue to work — most files need zero edits.
- Cockpit dark surfaces stay scoped to `BillersWorkflow.tsx` via inline `style` or a `.cockpit` utility class so they don't bleed.
- Typography utilities added once in `index.css` to keep usage consistent.
