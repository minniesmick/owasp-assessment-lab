# Product

## Register

product

## Users
- **Primary: the four team members** (Alper, Elif, Samed, Altay) of a university cyber-security group project. Three of them are new to web security and Git. They open the dashboard a few times a week, usually on a laptop in the evening between solving Juice Shop challenges, to answer: *where are we, what did I and the others do, what is still missing in my OWASP categories?*
- **Secondary: the course instructor**, who sees the dashboard once, projected in a lit classroom during the 10–15 minute final presentation, and needs to grasp coverage, findings and risk quickly.

## Product Purpose
The OWASP Assessment Lab dashboard turns the repository's raw files (finding Markdown files, per-member Juice Shop progress JSON, git history and pull-request reviews) into a live picture of the security assessment of OWASP Juice Shop against the OWASP Top 10:2025. It is rebuilt on every push and published on GitHub Pages.

Success: team members check it instead of asking each other on WhatsApp; gaps in OWASP coverage are visible early; at the presentation, the same screens tell the story (team → coverage → findings → risk) with real data and nothing staged.

## Brand Personality
Precise, calm, credible. It should feel like a tool a professional security team would trust: serious about severity, quiet about everything else. Individual contribution is shown factually, never competitively.

## Anti-references
- **Hacker cliché**: Matrix green, neon on black, glitch effects, skulls/padlock iconography, terminal cosplay.
- **Generic SaaS admin**: purple gradient cards, the big-number-small-label hero metric template, identical card grids, AdminLTE-style templates.
- **Gamification**: leaderboards, ranks, badges, points, "#1" callouts. Contribution is information, not a competition.
- **Student-homework look**: Bootstrap defaults, misaligned tables, default Chart.js colors.

Positive references: Datadog / Wiz security views (severity vocabulary, risk-first ordering), Vercel dashboard (typographic calm, clean activity/deploy log), GitHub Insights (contributor summaries, activity timelines).

## Design Principles
1. **Truth over theatre** — every number traces back to a file or a commit; no demo-only mode, no invented or decorative metrics.
2. **Severity is the only loud thing** — color and emphasis are reserved for risk; everything else stays neutral so critical findings are unmistakable.
3. **Contribution without competition** — show what each person did and owns, side by side, without rankings.
4. **Tracking-first, demo-ready** — optimized for the team's regular check-ins; the presentation reuses the same screens in a deliberate order.
5. **Useful when empty** — early in the semester most data is missing; empty states explain what will appear and how to make it appear.

## Accessibility & Inclusion
Baseline: WCAG AA text contrast (4.5:1 body, 3:1 large text) in both dark and light themes, full keyboard navigation with visible focus, `prefers-reduced-motion` respected. A light, high-contrast theme exists for projector use. Severity is also labelled in text, not conveyed by color alone.
