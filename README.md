# Volute

An arcade mineral puzzle inside a geothermal pump hall. Fire faceted cores into the winding train, gather three matching charges, and extract them before they reach the intake. Rejoining groups build scoring chains. Marked cores grant choke, backflow, bore, or sightline machinery. Clear five halls with three cells.

## Run

```sh
npm ci
npm run dev
```

Open the local address Vite prints. The game runs entirely in your browser. Sound unlocks on the first key or pointer gesture.

## Controls

| Action                 | Controls                                   |
| ---------------------- | ------------------------------------------ |
| Aim                    | Mouse, pen, touch, or Left / Right (A / D) |
| Fire                   | Click, touch, or Space                     |
| Swap loaded and queued | X                                          |
| Start / dismiss ending | Enter, Space, click, or touch              |
| Pause / resume         | P or Escape                                |
| Mute                   | M                                          |
| Diagnostics            | Backtick                                   |

Touch devices also receive the engine's on-screen controls. Each shot and swap answers a press, rather than repeating while held. Mineral glyphs distinguish the charges as well as their colors.

## Production

```sh
npm run build
npm run preview
```

`dist/` is a complete static site. Serve it from a root or a subdirectory; all bundled files resolve relative to the page. No service, API key, runtime asset generator, or external asset host is needed.

## Verification

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

The unit suite runs the real Simple 2D engine over a native canvas and counted clocks, with a Node asset/audio host. It also checks geometry, simulation, insertion, chains, machinery, pressure, progression, debug poses, inputs, and music switching. Browser validation uses the installed Playwright Chromium.

## Implementation and assets

Simple 2D owns the frame loop, canvas fit, input, asset loading, audio bus, and diagnostics. `src/game.ts` defines the immutable authoritative state and transitions; `simulation.ts` implements the 60 Hz rules; `debug.ts` supplies the state-based automation interface; `presentation.ts` draws the hall and composites the produced animations and live particle systems.

`public/assets/` contains the finished original pixel art, individual animation frames, four particle systems, thirteen sound effects, and two eight-second music loops with portable MIDI scores. Charge-colored extraction frames are prepared from the shared authored sheet during initialization. Particle effects are simulated by `@clockwyrks/particle-runtime/canvas` at their state-held age and seed, so rendering never advances game state.

`tools/produce.py` records the one-time authoring process. It uses `draw`, `draw-sheet`, `particle-2d`, `sfx-synth`, `sfx-sample` with the combat-core pack, and `music` with the synthwave bank. Running it requires those development tools and Python 3; ordinary installation and production builds never run it. It regenerates committed assets and writes intermediate authoring logs under `tools/source/`. Audio and graphics are original compositions and designs authored for Volute using the provided tool banks.
