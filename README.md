# ♟️ Sarva Chess Solver

A real-time, browser-based chess analysis app powered by **Stockfish 18** (WASM), built with **Next.js 16** and **Tailwind CSS v4**. Play, analyze, and review your games with engine-backed move classification, a live evaluation bar, opening detection, and an interactive move history — all without leaving the browser.

---

## Features

### Stockfish 18 Engine (In-Browser)
- Uses the **lite single-threaded** WASM build of Stockfish 18, running entirely client-side as a Web Worker — no server-side engine calls.
- The worker correctly queues position updates using a `pendingFen` ref, ensuring it always waits for `bestmove` before starting a new search. This prevents WebAssembly memory corruption when moves are made rapidly.
- Analyzes at **depth 20** with **MultiPV 3** (top 3 lines displayed simultaneously).

### Real-Time Move Classification
Every move is automatically rated against the engine's best line using **win-probability loss**:

| Rating      | Symbol | Win-Prob Loss  |
|-------------|--------|----------------|
| Brilliant   | `!!`   | ≤ 0.02, sacrifice, WP gain > 15% |
| Great       | `!`    | ≤ 0.02, turns losing position |
| Best        | `★`    | ≤ 0.02         |
| Excellent   | `✦`    | ≤ 0.05         |
| Good        | `✓`    | ≤ 0.10         |
| Book        | `◉`    | Opening theory |
| Inaccuracy  | `?!`   | ≤ 0.18         |
| Mistake     | `?`    | ≤ 0.32         |
| Miss        | `✕`    | Lost winning/dominant position |
| Blunder     | `??`   | > 0.32, or massive eval swing |

Win probability uses the standard Stockfish-derived sigmoid formula:
```
WP = 1 / (1 + e^(-0.3682 × eval))
```

Ratings are strictly bound to the **correct player** via a `pendingMoveIndex` ref, preventing desync when moves are interrupted mid-analysis.

### Evaluation Bar & Game Momentum Graph
- **Vertical Eval Bar**: 500px tall, animates smoothly as Stockfish evaluates. Shows the numeric evaluation (e.g. `+1.4`) and win percentage. Flips appropriately for mate scores (`M3`).
- **Game Momentum Graph**: SVG line chart that plots evaluation history across all moves, normalized to a ±5 pawn range with a gradient stroke.

### Opening Detection
- Loads ECO opening books (A–E TSVs) from `/public/openings/`.
- Detects the **most specific matching opening** by comparing SAN move history against all known opening lines.
- Displays as `A45 · Trompowsky Attack` in the UI.
- Moves within the opening book are automatically rated as **"Book"**.

### Drag & Drop + Click-to-Move
- Built on **@dnd-kit/core** for drag-and-drop piece movement.
- Click-to-select with **legal move highlighting** (dots on valid destination squares).
- Pieces can only be moved when it's your turn.
- Distinct `didDrag` ref prevents accidental click-fires after dragging.

### Piece Move Animation
- Pieces animate from their origin square to their destination square using a double `requestAnimationFrame` trick for smooth CSS transitions.
- Uses cubic-bezier easing for a natural, premium feel.

### Move History & Navigation
- Full SAN move list paired in rows (White / Black).
- Click any move to **jump to that position** (view-only mode; board becomes read-only).
- Arrow key navigation: `←` / `→` to step through the game.
- **Undo / Redo** support with a redo stack.
- Auto-scrolls to the latest move.

### Analyzer Panel
Switchable between two modes:
- **Analysis**: Shows the top 3 engine lines (MultiPV) with scores/mate indicators. Click a line to expand it to 20 moves deep.
- **Review**: Shows per-side accuracy scores and a full move breakdown table (count of each move quality for White and Black).

### FEN / PGN Import
- Accepts both **FEN strings** and **PGN notation**.
- Auto-detects format using a regex pattern.
- PGN import replays the full game, restores move history, and re-evaluates from the final position.

### Hint System
- Press `H` or click **Hint** to briefly highlight the engine's best move on the board (2-second flash).

### Board Flip
- Press `Space` or click **Flip Board** to rotate the board 180°. All coordinates, animations, and arrows update correctly.

### Engine Move Arrows
- Top 3 engine lines are visualized as arrows on the board (gold, silver, bronze) using inline SVG with custom arrowheads.
- Arrows update live as the engine calculates.

---

## Project Structure

```
.
├── app/
│   ├── layout.tsx          # Root layout (fonts, global styles)
│   └── page.tsx            # Renders <Chessboard />
├── components/
│   ├── Chessboard.tsx      # Core game logic, Stockfish integration, board UI
│   ├── Analyzer.tsx        # Engine lines panel + accuracy review
│   ├── EvalBar.tsx         # Vertical evaluation bar
│   └── MoveHistory.tsx     # Move list with undo/redo/navigation
├── hooks/
│   └── useStockfish.ts     # Web Worker lifecycle manager
├── public/
│   ├── pieces/             # SVG chess piece images (e.g. queen-w.svg)
│   ├── openings/           # ECO opening TSVs (a.tsv – e.tsv)
│   ├── stockfish-18-lite-single.js   # Copied by postinstall
│   └── stockfish-18-lite-single.wasm # Copied by postinstall
├── next.config.ts          # COOP/COEP/CORP headers for SharedArrayBuffer + WASM
└── package.json
```

---

## Getting Started

### Prerequisites
- Node.js 18+
- npm

### Install

```bash
npm install
```

The `postinstall` script automatically copies the Stockfish WASM engine files into `public/`:

```json
"postinstall": "cp node_modules/stockfish/bin/stockfish-18-lite-single.js public/... && cp ..."
```

### Develop

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> **Note:** If you see 404 errors for `/assets/transformers.web-*.js` or similar Vite-looking paths, these are from a **stale Service Worker** from a previous project on the same port. Open DevTools → Application → Storage → **Clear site data** → reload.

### Build

```bash
npm run build
npm run start
```

---

## Configuration

### `next.config.ts` — Cross-Origin Headers

The app requires specific HTTP headers for `SharedArrayBuffer` and Web Worker support:

```ts
{ key: "Cross-Origin-Opener-Policy",   value: "same-origin" }
{ key: "Cross-Origin-Embedder-Policy", value: "require-corp" }
{ key: "Cross-Origin-Resource-Policy", value: "cross-origin" }
```

These are applied globally, and additionally to the `.js` and `.wasm` Stockfish files specifically. This enables the browser to load WASM workers without security policy violations.

---

## Engine Architecture

```
useStockfish (hook)
  └── new Worker("/stockfish-18-lite-single.js")
        │
        ├── UCI initialization:
        │     send("uci")
        │     send("setoption name MultiPV value 3")
        │     send("isready")
        │
        └── Per-position analysis:
              send("position fen <fen>")
              send("go depth 20")
              ← streams "info depth ... score cp ... pv ..."
              ← emits "bestmove ..."
```

**Race condition handling:** When the user makes a move while the engine is still thinking, the new FEN is stored in `pendingFen`. The engine receives `stop`, and when `bestmove` arrives, it immediately processes the pending FEN instead of going idle. This keeps `isThinkingRef` accurate and prevents the array desync bug that causes moves to be rated for the wrong player.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2 (App Router, Turbopack) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS v4 |
| Chess Logic | chess.js 1.4 |
| Drag & Drop | @dnd-kit/core |
| Engine | Stockfish 18 WASM (lite single-threaded) |

---

## License

MIT — built for learning, analysis, and chess improvement.
