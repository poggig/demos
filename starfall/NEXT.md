# Next step: our own math + themed variants

Status: proposal, to start once the first playtests confirm the turn/AP model is fun.

## Goals

1. **Own math.** Replace the inherited formulas with a model designed for turns from the start,
   instead of real-time numbers converted to AP.
2. **One engine, many games.** A variant = a *ruleset* (numbers and mechanics) + a *theme*
   (words, art, map flavour). New variants come from data files, not new code.
3. **Balanced by machine.** Every ruleset is checked by bot tournaments before anyone plays it.

## Architecture: engine ← ruleset + theme

```
engine/      generic: resources[], buildings[], techs[], units[], map, AP pools, combat, missions
rulesets/    numbers and mechanics (pure data + a few named formula types)
themes/      names, descriptions (IT/EN), palette, icon style, map metaphor, sounds
variants/    ruleset + theme + default settings = one playable game
```

What becomes data instead of code:

| Today (hard-coded) | Ruleset field |
|---|---|
| 3 resources + energy | `resources: [{ id, storable, capBuilding }]`, any count; energy optional |
| Mine production `k·L·1.1^L` | `production: { curve: 'powexp', k, a, g }` per producer |
| Cost `base · factor^(L-1)` | `cost: { curve, base[], factor }`; curves: exponential, polynomial, logistic |
| Time → AP conversion | `ap: { pools[], perTurn, cap, cost: { curve, ... } }`: AP designed directly |
| Rapid fire table | `combat: { model: 'rounds' / 'lanchester' / 'dice', counters: matrix }` |
| Galaxy:system:position distance | `map: { topology: 'galaxy' / 'hexgrid' / 'islands' / 'graph', distance }` |
| Missions | `missions: [attack, transport, spy, settle, salvage, ...]`, each with theme names |

## Our own math (draft principles)

- **Turn-native costs.** Each level costs resources and AP from curves we pick, e.g.
  `cost(L) = base · L^p · g^L` with small `g`. Late levels stay reachable in a 40–80 turn game.
- **Fewer, sharper choices per turn.** Production has diminishing returns (e.g. `k · L^0.8`), so
  spreading across resources/colonies beats stacking one mine.
- **Combat with a counter triangle** (light beats ranged, ranged beats heavy, heavy beats light)
  instead of rapid fire. Deterministic expected losses plus a small seeded variance, so battle
  outcomes can be predicted from a spy report. That rewards planning, which is the point of a turn game.
- **Fog and timing matter.** Fleets are visible only within sensor range; travel is short (1–4 turns),
  so simultaneous orders create real bluffing.
- **Catch-up levers** so a bad start isn't fatal among friends: e.g. AP bonus for the lowest score,
  protection for new colonies for N turns. Each is a ruleset toggle.

## Balance harness

- Scripted bots with distinct strategies: economy, rush, turtle, raider, explorer.
- Round-robin tournaments over many seeds for each ruleset.
- Pass criteria: no strategy wins over ~40% in a 4-player field; mid-game reached in the target
  number of turns; no unit type unused or dominant.
- A tuner that nudges ruleset numbers until the criteria pass, then writes a report.

## Variant ideas ("a billion variations")

Hand-made themes, each with its own map metaphor:

| Theme | Resources | "Fleet" | Map |
|---|---|---|---|
| Starfall (space) | metal, crystal, deuterium | fleets | galaxies |
| Kingdoms (medieval) | wood, stone, grain | armies | provinces |
| Pirate archipelago | timber, rum, gold | ships | islands |
| Wasteland (post-apocalypse) | scrap, fuel, water | convoys | ruins on a hex grid |
| Neon megacorps (cyberpunk) | credits, data, power | runners | city districts |
| Abyss (underwater colonies) | ore, kelp, oxygen | subs | trench network |
| Sky cities (steampunk) | coal, brass, steam | airships | floating islands |
| The Hive (insects) | sugar, protein, wax | swarms | the garden |
| Famiglia (1920s mob) | cash, booze, favours | crews | city blocks |
| Arcane towers (wizards) | mana, crystals, souls | familiars | ley lines |

Then, for the "billion":
- **Seeded ruleset mutations:** every new game can roll variations (resource count, curve shapes,
  unit roster subset, map topology), kept only if the balance harness passes.
- **Theme generator:** names, palette and procedural icon style from a seed plus a theme word list.
  Hand-made themes stay the polished ones.

## Migration steps

1. Extract today's numbers into `rulesets/classic.js`; engine reads the ruleset; all tests stay green.
2. Generalise resources (N resources, optional energy) and map topology.
3. Theme layer: move names/descriptions/icons/palette out of `i18n.js` and `icons.js`.
4. Design `rulesets/starfall2.js` with our own math; build the bot harness and balance it.
5. Second theme on the same engine (e.g. Kingdoms) to prove the split.
6. Variant picker in the lobby; seeded mutations; theme generator.

## Questions for after the playtest

- Did the AP budget feel right (too many / too few actions per turn)?
- How long should a game last (turns, real-life weeks)?
- Which theme first after space?
- Keep combat readable and predictable, or keep some luck?
