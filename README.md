# 🎮 Demos

Playable browser mini-games built by the studio's automated production line — zero install,
zero build. Each folder is self-contained: open its `index.html` over any static host and it runs.

## ▶ Play

| Game | Link | About |
|------|------|-------|
| 🪐 **Starfall** | **https://poggig.github.io/demos/starfall/** | A private, turn-based remake of the classic browser space-strategy game: same economy, research, fleet and combat maths, but every player gets the same Action Points per turn, so strategy decides who wins rather than hours spent online. Hotseat or online with friends (free Supabase). Italian + English. |
| 🧟 **Gate Shooter** | **https://poggig.github.io/demos/gate-shooter/** | A portrait crowd-runner for phones: start with one soldier, grow your squad through +/−/×/÷ gates, grab 9 weapons that pop up at random (including a flamethrower, an egg-laying chicken and a clown squirt gun), call air strikes and helicopters, dodge buses and acid, and survive 8 slow, relentless bosses across 8 places — countryside, desert, snowy pass, neon city, autumn woods, graveyard, seaside and volcano. Infinite procedural campaign (every level proven winnable by a simulator), Endless mode, shop, Italian + English. Fully procedural art and synthesized audio. |
| ⚔️ **Chronicles of Azurerune** | **https://poggig.github.io/demos/dragon/** | A 5-level / 26-act action platformer. Five heroes with personalized skills + ultimates, live party swap, stealth, an underwater air-gauge, a fishing minigame, a masquerade, and a boss-rush finale against a dragon. |
| 🌸 **Flor de Sal** | **https://poggig.github.io/demos/** | A short, warm personalized gift game (a florist's retirement) — playable in Portuguese + English. |

## 🕹️ Controls (Gate Shooter)

- **Phone:** drag anywhere — the squad follows your finger's movement · **Desktop:** the squad follows the mouse, or **← / →** / **A / D**
- **P / Esc** or the ‖ button: pause · `?seed=123` replays the same run

## 🕹️ Controls (Azurerune)

- **← / →** move · **↑ / W / Space** jump (double-jump!) · **Z / J** attack
- **Q / L** skill · **X** ultimate · **K** dash · **Tab / 1–5** swap hero · **R** revive · **Esc** pause · **M** music

## 🛠️ Tech

No frameworks-of-frameworks, no build step. Azurerune and Flor de Sal: a vendored
`phaser.min.js` `<script>` tag + plain-JS `src/`, art generated with Retro Diffusion and
assembled by the studio's asset pipeline. Gate Shooter: vanilla JS + canvas 2D ES modules,
zero dependencies, every sprite drawn procedurally and every sound synthesized with Web Audio.
Every game is a single shareable folder.

_These are demos / dry-runs of an automated game studio — no real user data._
