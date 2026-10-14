# Starfall — design plan

A private, turn-based reimagining of the classic browser space-strategy game (OGame-style).
Same mathematics; no real-time countdowns. Everyone plays the same number of actions per turn,
so strategy — not hours spent online — decides who wins.

Names and art are original (procedural); formulas and numbers follow the classic game's
community-documented values.

## Decisions (agreed)

| Topic | Decision |
|---|---|
| Multiplayer | Static frontend on GitHub Pages + free **Supabase** project for shared state |
| Turn order | **Simultaneous** (WEGO): everyone plans in secret, orders resolve together |
| Turn end | When **all players submit**, or at a **per-game deadline** |
| Action budget | **Separate AP pools** (buildings / research / shipyard) |
| v1 scope | Economy, research, ships, defence, espionage, attack, transport, deploy, colonise, debris + recycling, moons |
| Later | Expeditions, alliances, ACS, moon buildings (phalanx, jump gate), missiles |
| Pace | Per-game speed setting (like universe speed) |
| UI | Italian + English, responsive for phone and desktop |

## Core mapping: time → Action Points

The classic game runs three queues in parallel per planet: buildings, research (global), and shipyard.
A turn represents `TURN_HOURS` hours of game time, so each queue gets that many hours of work per turn,
expressed as Action Points:

```
AP_per_pool_per_turn = TURN_HOURS / HOURS_PER_AP          (default 6h / 0.5h = 12 AP)
build_hours    = (metal + crystal) / (2500 · (1 + robotics) · 2^nanite) / speed
research_hours = (metal + crystal) / (1000 · (1 + labLevel)) / speed
ship_hours     = (metal + crystal) / (2500 · (1 + shipyard) · 2^nanite) / speed   (per unit)
AP cost        = max(1, ceil(hours / HOURS_PER_AP))       (ships: fractional, per batch)
```

- Robotics, Nanite and the Research Lab keep their exact purpose: they make each level cheaper in AP.
- **Instant when affordable:** if you have the resources and the AP, the upgrade completes immediately
  during your planning phase, so you see the new level right away.
- **Big projects span turns:** if a level costs more AP than you have, it goes in progress and absorbs
  that pool's AP each turn until finished (just as a long queue item would). It can be cancelled for a full refund.
- **Unused AP carries over** up to a cap (default 2× the per-turn budget).
- **Shipyard batches:** order *N* ships in one action. They are delivered as AP pays for them, including partial batches.
- Building and shipyard pools are **per planet**, as in the original. Research is one **global** pool.
  More colonies therefore mean more parallel work, the same trade-off as the original game.

Production: each turn adds `hourly_production × TURN_HOURS × speed` to every planet, capped by storage.

## Rules kept 1:1

- **Mines:** metal `30·L·1.1^L`, crystal `20·L·1.1^L`, deuterium `10·L·1.1^L·(1.28 − 0.002·Tmax)`;
  base income 30 metal / 15 crystal. Plasma technology bonus.
- **Energy:** solar `20·L·1.1^L`, fusion `30·L·(1.05 + 0.01·energyTech)^L` (burns deuterium),
  solar satellites `(Tmax + 140) / 6`. Mine consumption `10/10/20·L·1.1^L`; the production factor
  drops when energy is short.
- **Storage:** `5000 · floor(2.5 · e^(20·L/33))`.
- **Costs:** `base · factor^(L−1)`, using the original base costs and factors for every building,
  research, ship and defence.
- **Requirements tree**, planet fields, temperatures by position, Terraformer.
- **Fleets:**
  - Distance: galaxy `20000·Δg`, system `2700 + 95·Δs`, position `1000 + 5·Δp`.
  - Duration: `10 + 3500/p · √(10·d/v)`.
  - Fuel: the original consumption formula.
  - Drive bonuses: combustion +10%, impulse +20%, hyperspace +30% per level.
  - Ship drive upgrades as in the original.
  - Flight seconds become turns through `FLEET_SECONDS_PER_TURN` (a game setting).
- **Combat:**
  - Up to 6 rounds; every unit fires at a random enemy unit.
  - A shot that deals less than 1% of the target's shield is absorbed.
  - Shields regenerate every round.
  - A unit whose hull drops below 70% explodes with probability `1 − hull/maxHull`.
  - Rapid-fire table as in the original.
  - Weapons, shielding and armour technology each add +10% per level.
  - 30% of destroyed ships' metal and crystal becomes debris; 70% of destroyed defences are rebuilt.
  - Moon chance is 1% per 100k debris, up to 20%.
  - Plunder takes 50% of the resources, limited by cargo capacity.
- **Espionage:** probes vs. espionage technology determine how much of the report you see and the counter-espionage chance.
- **Score:** 1 point per 1000 resources spent.

## Turn resolution (deterministic, seeded)

1. Lock everyone's orders.
2. Advance in-progress queues using each pool's AP.
3. Production: resources are added and capped by storage.
4. Fleets advance. Arrivals at the same target are resolved in a fixed order: transport/deploy → espionage → attack → colonise/recycle.
5. Combat, plunder, debris and moon creation.
6. Return flights land.
7. Reports are generated; AP is refilled up to the cap.

The engine is a pure function: `nextState = resolve(state, orders, seed)`. Every client can re-run it
and verify the outcome, so no paid server code is needed. Whichever client resolves first (the
last player to submit, or anyone after the deadline) writes the result. Other clients verify it.
Supabase row-level security keeps each player's orders private until the turn locks.

## Architecture

```
starfall/
  index.html            entry point, no build step
  src/engine/           pure rules: data tables, formulas, AP, production, fleets, combat, espionage, resolve()
  src/net/              storage adapters: LocalAdapter (single device / hotseat / tests), SupabaseAdapter
  src/ui/               screens: overview, buildings, research, shipyard, defence, galaxy, fleet, reports, lobby
  src/i18n.js           Italian + English
  test/                 Node tests: formulas vs. known reference values, combat statistics, resolve determinism
  supabase/schema.sql   tables + row-level-security policies; step-by-step setup in README
```

## Milestones

1. **Engine core:** data tables, formulas, AP pools, production, instant and multi-turn builds, tests.
2. **Single-player UI:** overview, buildings, research, shipyard and defence. Playable locally with turn advance.
3. **Fleets:** galaxy map, transport, deploy, espionage, colonisation and travel in turns.
4. **Combat:** combat engine, debris, recyclers, moons and battle reports.
5. **Multiplayer:** Supabase adapter, lobby, simultaneous submit, deadline and verification.
6. **Balance:** bot simulations to tune default AP, turn hours and fleet seconds per turn.
7. **Later:** expeditions, alliances, ACS, phalanx and jump gate, missiles.
