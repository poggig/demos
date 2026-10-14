# Starfall

A private, **turn-based** remake of the classic browser space-strategy game: same economy, research,
fleet and combat mathematics, but with no real-time countdowns. Everyone gets the same Action Points (AP)
each turn, so strategy decides who wins, not hours spent online. Italian + English, works on phone and desktop.

Play: open `starfall/index.html` from any static host (e.g. GitHub Pages: `https://poggig.github.io/demos/starfall/`).

Design and rules: [PLAN.md](PLAN.md).

## How a turn works

- Plan freely: upgrades, research, ships, fleets. An upgrade **completes immediately** if you have the
  resources and the AP. Bigger ones absorb AP over several turns.
- AP pools: **build AP** and **yard AP** per planet, **research AP** for the empire (12 each per turn by default,
  unused AP carries over up to 24). AP cost comes from the original build-time formula, so Drone Works,
  Nanoforge, Orbital Yard and Research Institute levels make things cheaper, exactly as they made them faster.
- Press **End turn**. When everyone has ended (or the deadline passes), all orders resolve at once:
  queues → production → fleets in arrival order (battles, espionage, colonisation, recycling) → returns.

## Modes

- **Same device (hotseat)**: works out of the box, saved in the browser. Also good for solo testing.
- **Online with friends**: needs a free Supabase project (5 minutes, below).

## Online setup (Supabase, free tier)

1. Create a project at <https://supabase.com> (free plan).
2. **SQL Editor** → New query → paste all of [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
3. **Authentication → Sign In / Providers** → enable **Allow anonymous sign-ins**.
4. **Project Settings → API**: copy the **Project URL** and the **anon public** key.
5. Put both in [`config.js`](config.js) and push, so your friends get them automatically.
   (Or paste them in the game under *Online setup*; that is stored only in your browser.)
6. In the game: *Online with friends* → your name → **Create**. Share the invite link or the 6-letter code.
   When everyone has joined, the host presses **Start game**.

How it stays fair without a paid server:
- Your orders are private (row-level security): nobody can read them until the turn is locked.
- A turn locks when everyone has submitted or the deadline passes. Drafts are auto-saved, so at a
  deadline your planned orders still count.
- Once locked, any player's client resolves the turn with the deterministic engine; the database accepts
  only the first commit for that turn. Every client would compute the identical result.

Known limits (friends-only trust model): the game state is readable by all members through the
database API (the UI only shows what you would know), and identity is per browser (anonymous sign-in).

## Development

No build step. Engine tests: `cd starfall && npm test` (Node 18+).

```
src/engine/   data tables, formulas, combat, orders, turn resolution (pure, deterministic)
src/net/      LocalGame (browser storage) and OnlineGame (Supabase) — same interface
src/ui/       views, procedural SVG icons, app controller
supabase/     schema + RLS + RPCs
```
