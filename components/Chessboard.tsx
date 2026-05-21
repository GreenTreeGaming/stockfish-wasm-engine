"use client";

import Image from "next/image";
import { useState, useEffect, useRef } from "react";
import { Chess } from "chess.js";
import { useStockfish } from "@/hooks/useStockfish";
import Analyzer from "@/components/Analyzer";
import MoveHistory from "@/components/MoveHistory";
import EvalBar from "@/components/EvalBar";

import {
    DndContext,
    useDraggable,
    useDroppable,
} from "@dnd-kit/core";

type Square = string;
type MoveQuality = "brilliant" | "great" | "best" | "excellent" | "good" | "inaccuracy" | "mistake" | "miss" | "blunder" | "book";

const pieceMap: Record<string, string> = {
    p: "pawn",
    r: "rook",
    n: "knight",
    b: "bishop",
    q: "queen",
    k: "king",
};

function evalToWinProb(eval_: number): number {
    return 1 / (1 + Math.exp(-0.25 * eval_));
}

function DraggablePiece({ id, children, game, lastMove, flipped }: any) {
    const { attributes, listeners, setNodeRef, transform } = useDraggable({
        id,
        activationConstraint: { distance: 5 },
    });

    const [animating, setAnimating] = useState(false);
    const [offset, setOffset] = useState({ x: 0, y: 0 });

    const piece = game.get(id);
    const isDestination = lastMove?.to === id;

    useEffect(() => {
        if (!isDestination || !lastMove) return; // guard is INSIDE the effect, not before hooks

        const fileToX = (f: string) => {
            const x = "abcdefgh".indexOf(f);
            return flipped ? 7 - x : x;
        };
        const rankToY = (r: string) => {
            const y = 8 - parseInt(r);
            return flipped ? 7 - y : y;
        };

        const fromX = fileToX(lastMove.from[0]);
        const fromY = rankToY(lastMove.from[1]);
        const toX = fileToX(lastMove.to[0]);
        const toY = rankToY(lastMove.to[1]);

        const squareSize = 500 / 8;
        const dx = (fromX - toX) * squareSize;
        const dy = (fromY - toY) * squareSize;

        setAnimating(false);
        setOffset({ x: dx, y: dy });

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                setAnimating(true);
                setOffset({ x: 0, y: 0 });
            });
        });
    }, [lastMove?.from, lastMove?.to]);

    const dragStyle = transform
        ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 50 }
        : {};

    const animStyle = isDestination
        ? {
            transform: `translate(${offset.x}px, ${offset.y}px)`,
            transition: animating ? "transform 0.18s cubic-bezier(0.25, 1, 0.5, 1)" : "none",
        }
        : {};

    const style = transform ? dragStyle : animStyle;

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...(piece && piece.color === game.turn() ? { ...listeners, ...attributes } : {})}
        >
            {children}
        </div>
    );
}

function DroppableSquare({ id, children }: any) {
    const { setNodeRef } = useDroppable({ id });
    return <div ref={setNodeRef} className="w-full h-full">{children}</div>;
}

function parseTSV(text: string) {
    const lines = text.split("\n").slice(1);
    return lines.map((line) => {
        const [eco, name, pgn] = line.split("\t");
        const moves = pgn
            .replace(/\d+\./g, "")
            .replace(/\s+/g, " ")
            .trim()
            .split(" ");
        return { eco, name, moves };
    });
}

function findOpening(history: string[], openings: any[]) {
    let bestMatch = null;
    for (const opening of openings) {
        let match = true;
        for (let i = 0; i < opening.moves.length; i++) {
            if (history[i] !== opening.moves[i]) { match = false; break; }
        }
        if (match && (!bestMatch || opening.moves.length > bestMatch.moves.length)) {
            bestMatch = opening;
        }
    }
    return bestMatch;
}

function getArrowMoves(game: Chess, bestMoves: any[]) {
    const arrows: { from: string; to: string }[] = [];

    bestMoves.slice(0, 3).forEach(entry => {
        if (!entry.line?.length) return;

        const temp = new Chess(game.fen());

        try {
            const move = temp.move(entry.line[0]); // SAN → move object

            if (move) {
                arrows.push({
                    from: move.from,
                    to: move.to,
                });
            }
        } catch { }
    });

    return arrows;
}

const qualityConfig: Record<MoveQuality, { label: string; bg: string; text: string }> = {
    brilliant: { label: "!!", bg: "#05B8A0", text: "#fff" },
    great: { label: "!", bg: "#6EA8D8", text: "#fff" },
    best: { label: "★", bg: "#5FAD56", text: "#fff" },
    excellent: { label: "✦", bg: "#7BC67E", text: "#fff" },
    good: { label: "✓", bg: "#96C97D", text: "#fff" },
    book: { label: "◉", bg: "#C49A6C", text: "#fff" },
    inaccuracy: { label: "?!", bg: "#F0C040", text: "#7a5c00" },
    mistake: { label: "?", bg: "#E07B39", text: "#fff" },
    miss: { label: "✕", bg: "#E05C5C", text: "#fff" },
    blunder: { label: "??", bg: "#CC3333", text: "#fff" },
};

export default function Chessboard() {
    const [game, setGame] = useState(new Chess());
    const [selected, setSelected] = useState<Square | null>(null);
    const [moves, setMoves] = useState<string[]>([]);
    const [sanHistory, setSanHistory] = useState<string[]>([]);
    const [redoStack, setRedoStack] = useState<string[]>([]);
    const [flipped, setFlipped] = useState(false);
    const [importValue, setImportValue] = useState("");
    const [showHint, setShowHint] = useState(false);

    const pendingBrilliant = useRef(false);
    const bestMoveRef = useRef<string | null>(null);

    const [evaluation, setEvaluation] = useState<number | null>(null);
    const [bestMoves, setBestMoves] = useState<{
        score: number;
        mate?: number;
        line: string[];
    }[]>([]);
    const [depth, setDepth] = useState(0);
    const [isThinking, setIsThinking] = useState(false);

    const [openings, setOpenings] = useState<any[]>([]);
    const [currentOpening, setCurrentOpening] = useState<string | null>(null);

    const [moveQualities, setMoveQualities] = useState<MoveQuality[]>([]);
    const [lastMovedSquare, setLastMovedSquare] = useState<string | null>(null);

    const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);

    const [viewIndex, setViewIndex] = useState<number | null>(null);
    const [evalHistory, setEvalHistory] = useState<number[]>([0]);
    const [activeTab, setActiveTab] = useState<"analysis" | "review" | "history">("analysis");
    const [startTurn, setStartTurn] = useState<"w" | "b">("w");
    const prevViewFen = useRef<string | null>(null);

    const viewIndexRef = useRef<number | null>(null);

    function handleImport() {
        const trimmed = importValue.trim();
        if (!trimmed) return;

        const temp = new Chess();
        try {
            // Better FEN detection
            const isFEN = /^[rnbqkpRNBQKP1-8\/]+ /.test(trimmed);

            if (isFEN) {
                const success = temp.load(trimmed);
                if (!success) throw new Error("Invalid FEN");

                setGame(temp);
                stableEval.current = null;
                setSanHistory([]);
                setMoveQualities([]);
                setStartTurn(temp.turn());
            } else {
                const cleaned = trimmed
                    .replace(/\u00A0/g, " ")
                    .replace(/\s+/g, " ")
                    .trim();

                const withResult = /1-0|0-1|1\/2-1\/2/.test(cleaned)
                    ? cleaned
                    : cleaned + " *";

                temp.loadPgn(withResult);

                const history = temp.history();
                const verboseHistory = temp.history({ verbose: true });

                setSanHistory(history);
                setMoveQualities(new Array(history.length).fill("book"));
                setEvalHistory(new Array(history.length + 1).fill(0));
                setStartTurn("w");
                setGame(temp);

                const lastVerbose = verboseHistory[verboseHistory.length - 1];
                if (lastVerbose) {
                    setLastMove({ from: lastVerbose.from, to: lastVerbose.to });
                    setLastMovedSquare(lastVerbose.to);
                }
            }

            setImportValue("");
            setViewIndex(null);

        } catch (e) {
            alert("Invalid FEN or PGN: " + (e as Error).message);
        }
    }

    useEffect(() => {
        if (viewIndex === null) {
            if (sanHistory.length > 0) {
                const temp = new Chess();
                sanHistory.forEach(m => temp.move(m));
                const hist = temp.history({ verbose: true });
                const last = hist[hist.length - 1];
                if (last) setLastMove({ from: last.from, to: last.to });
                setGame(temp); // ← add this
            }
            viewIndexRef.current = null;
            return;
        }

        const moveIndex = viewIndex;
        const temp = new Chess();
        for (let i = 0; i <= moveIndex; i++) temp.move(sanHistory[i]);
        const hist = temp.history({ verbose: true });
        const last = hist[hist.length - 1];
        if (last) setLastMove({ from: last.from, to: last.to });

        setGame(temp); // ← add this
        viewIndexRef.current = viewIndex;
    }, [viewIndex]);

    const stableEval = useRef<number | null>(null);
    const prevEval = useRef<number | null>(null);
    const pendingQuality = useRef(false);
    const currentTurnRef = useRef<"w" | "b">("w");

    const didDrag = useRef(false);

    const currentBestScoreRef = useRef<number | null>(null);
    const prevBestScoreRef = useRef<number | null>(null);

    const lastMoveIndex = sanHistory.length - 1;
    const lastQuality = moveQualities[lastMoveIndex];

    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const { send } = useStockfish((msg) => {
        if (msg.startsWith("info") && msg.includes(" pv ")) {
            const cpMatch = msg.match(/score cp (-?\d+)/);
            const mateMatch = msg.match(/score mate (-?\d+)/);
            const depthMatch = msg.match(/\bdepth (\d+)/);
            const pvMatch = msg.match(/ pv (.+)/);
            const multiMatch = msg.match(/ multipv (\d+)/);

            if (mateMatch) {
                const mate = parseInt(mateMatch[1]);
                const adjustedMate = game.turn() === "w" ? mate : -mate;
                const value = adjustedMate > 0 ? 100 - Math.abs(mate) : -100 + Math.abs(mate);
                setEvaluation(value);
            } else if (cpMatch) {
                const raw = parseInt(cpMatch[1]) / 100;
                const normalized = game.turn() === "w" ? raw : -raw;
                setEvaluation(normalized);
            }

            if (depthMatch) setDepth(parseInt(depthMatch[1]));

            if (pvMatch && (cpMatch || mateMatch) && multiMatch) {
                const multi = parseInt(multiMatch[1]) - 1;
                const rawMate = mateMatch ? parseInt(mateMatch[1]) : undefined;
                const mate = rawMate !== undefined
                    ? (game.turn() === "w" ? rawMate : -rawMate)
                    : undefined;
                let normalized = 0;

                if (mateMatch) {
                    const rawMate = parseInt(mateMatch[1]);
                    const adjustedMate = game.turn() === "w" ? rawMate : -rawMate;
                    normalized = adjustedMate > 0 ? 100 - Math.abs(rawMate) : -100 + Math.abs(rawMate);
                } else if (cpMatch) {
                    const raw = parseInt(cpMatch[1]) / 100;
                    normalized = game.turn() === "w" ? raw : -raw;
                }

                const uciMoves = pvMatch[1].trim().split(" ");
                const sanLine: string[] = [];
                const tempGame = new Chess(game.fen());

                for (const uci of uciMoves) {
                    try {
                        const result = tempGame.move({
                            from: uci.slice(0, 2),
                            to: uci.slice(2, 4),
                            promotion: uci[4] ?? "q",
                        });
                        if (result) sanLine.push(result.san);
                    } catch { break; }
                }

                if (multi === 0) {
                    currentBestScoreRef.current = normalized;

                    if (sanLine.length > 0) {
                        bestMoveRef.current = sanLine[0];
                    }
                }

                if (!sanLine.length) return;

                setBestMoves((prev) => {
                    const updated = [...prev];

                    updated[multi] = {
                        score: normalized,
                        mate,
                        line: sanLine,
                    };

                    return updated.filter(Boolean).slice(0, 3);
                });
            }
        }

        if (msg.startsWith("bestmove")) {
            setIsThinking(false);
            stableEval.current = currentBestScoreRef.current ?? evaluation ?? 0;

            if (pendingQuality.current && prevEval.current !== null && stableEval.current !== null) {
                const pre = prevEval.current;
                const post = stableEval.current;
                const justMoved = currentTurnRef.current;

                const preWP = justMoved === "w" ? evalToWinProb(pre) : evalToWinProb(-pre);
                const postWP = justMoved === "w" ? evalToWinProb(post) : evalToWinProb(-post);

                const bestEval = prevBestScoreRef.current ?? pre;
                const bestWP = justMoved === "w" ? evalToWinProb(bestEval) : evalToWinProb(-bestEval);
                const loss = bestWP - postWP;

                let quality: MoveQuality;

                if (loss <= 0.02) quality = "best";
                else if (loss <= 0.05) quality = "excellent";
                else if (loss <= 0.10) quality = "good";
                else if (loss <= 0.18) quality = "inaccuracy";
                else if (loss <= 0.32) quality = "mistake";
                else quality = "blunder";

                if (Math.abs(post) >= 95 && Math.abs(pre) < 20) {
                    quality = "blunder";
                }

                if (["good", "inaccuracy", "mistake"].includes(quality)) {
                    const opponentWasLosing = (justMoved === "w" ? evalToWinProb(-pre) : evalToWinProb(pre)) < 0.35;
                    if (opponentWasLosing && postWP < 0.60) quality = "miss";
                }

                if (quality === "best" && preWP < 0.50 && postWP > 0.58) quality = "great";

                if (
                    pendingBrilliant.current &&
                    quality === "best" &&
                    loss <= 0.01 &&
                    postWP - preWP > 0.15
                ) {
                    quality = "brilliant";
                }

                pendingBrilliant.current = false;
                setMoveQualities((prev) => [...prev, quality]);
                setEvalHistory((prev) => [...prev, post]);
                pendingQuality.current = false;
            }
        }
    });

    const viewGame = (() => {
        if (viewIndex === null) return game;

        const temp = new Chess();
        for (let i = 0; i <= viewIndex; i++) {
            temp.move(sanHistory[i]);
        }
        return temp;
    })();

    const rawBoard = viewGame.board();
    const board = flipped
        ? rawBoard.slice().reverse().map(row => row.slice().reverse())
        : rawBoard;

    function getPieceImage(piece: any) {
        return `/pieces/${pieceMap[piece.type]}-${piece.color}.svg`;
    }

    useEffect(() => {
        send("uci");
        send("setoption name MultiPV value 3");
        send("isready");
    }, []);

    useEffect(() => {
        setIsThinking(true);
        setBestMoves([]);
        send("stop");
        send("position fen " + game.fen());
        send("go depth 20");
    }, [game]);

    useEffect(() => {
        const files = ["a.tsv", "b.tsv", "c.tsv", "d.tsv", "e.tsv"];
        Promise.all(files.map(f => fetch(`/openings/${f}`).then(r => r.text()).then(parseTSV)))
            .then(res => setOpenings(res.flat()));
    }, []);

    useEffect(() => {
        if (!openings.length || sanHistory.length === 0) return;
        const match = findOpening(sanHistory, openings);
        if (match) setCurrentOpening(`${match.eco} · ${match.name}`);
    }, [sanHistory, openings]);

    const pendingBookMove = useRef(false);

    function makeMove(from: string, to: string) {
        const newGame = new Chess(game.fen());
        let result = null;
        try {
            result = newGame.move({ from, to, promotion: "q" });
        } catch { return; }
        if (!result) return;

        const isSacrifice =
            !result.captured &&
            ["n", "b", "r", "q"].includes(result.piece) &&
            game.moves({ verbose: true }).filter(m => m.to === result.to).length <= 2;
        pendingBrilliant.current = isRealSacrifice(game, result);

        const newHistory = [...sanHistory, result.san];
        const openingMatch = findOpening(newHistory, openings);
        const isBook =
            openingMatch !== null &&
            newHistory.length <= openingMatch.moves.length &&
            newHistory[newHistory.length - 1] === openingMatch.moves[newHistory.length - 1];

        pendingBookMove.current = isBook;
        prevBestScoreRef.current = currentBestScoreRef.current;
        currentBestScoreRef.current = null;
        currentTurnRef.current = game.turn();

        function isRealSacrifice(game: Chess, move: any) {
            const attackers = game.moves({ verbose: true })
                .filter(m => m.to === move.to && m.color !== game.turn());

            if (attackers.length === 0) return false;

            const pieceValue: Record<string, number> = {
                p: 1, n: 3, b: 3, r: 5, q: 9, k: 0
            };

            const movedValue = pieceValue[move.piece];

            const canRecaptureCheaply = attackers.some(a => pieceValue[a.piece] <= movedValue);

            return !canRecaptureCheaply;
        }

        if (isBook) {
            setMoveQualities((prev) => [...prev, "book"]);
            pendingQuality.current = false;
        } else {
            prevEval.current = stableEval.current;
            pendingQuality.current = true;
        }

        setLastMove({ from, to });
        setGame(newGame);
        setSanHistory(newHistory);
        setLastMovedSquare(result.to);
        setRedoStack([]);
        setSelected(null);
        setMoves([]);
    }

    function onSquareClick(square: string) {
        if (viewIndex !== null) return;

        if (selected === square) {
            setSelected(null);
            setMoves([]);
            return;
        }

        if (selected && moves.includes(square)) {
            makeMove(selected, square);
            return;
        }

        const piece = viewGame.get(square);
        if (piece && piece.color === game.turn()) {
            const legalMoves = game.moves({ square, verbose: true });
            setSelected(square);
            setMoves(legalMoves.map((m) => m.to));
        } else {
            setSelected(null);
            setMoves([]);
        }
    }

    function handleUndo() {
        if (!sanHistory.length) return;
        const newHistory = sanHistory.slice(0, -1);
        const newGame = new Chess();
        newHistory.forEach((m) => newGame.move(m));

        setRedoStack((prev) => [...prev, sanHistory.at(-1)!]);
        setSanHistory(newHistory);
        setGame(newGame);
        setLastMovedSquare(null);
        setMoveQualities((prev) => prev.slice(0, -1));
        pendingQuality.current = false;
    }

    function handleRedo() {
        if (!redoStack.length) return;
        const move = redoStack.at(-1)!;
        const newHistory = [...sanHistory, move];
        const newGame = new Chess();
        newHistory.forEach((m) => newGame.move(m));

        setRedoStack((prev) => prev.slice(0, -1));
        setSanHistory(newHistory);
        setGame(newGame);
    }

    useEffect(() => {
        function handleKey(e: KeyboardEvent) {
            if (!sanHistory.length) return;

            if (e.key === "ArrowLeft") {
                setViewIndex((prev) => {
                    if (prev === null) return sanHistory.length - 1;
                    if (prev <= 0) return null;
                    return prev - 1;
                });
            }

            if (e.key === "ArrowRight") {
                setViewIndex((prev) => {
                    if (prev === null) return null;
                    if (prev >= sanHistory.length - 1) return null;
                    return prev + 1;
                });
            }

            if (e.code === "Space") {
                e.preventDefault();
                setFlipped(f => !f);
            }

            if (e.key.toLowerCase() === "h") {
                setShowHint(true);
                setTimeout(() => setShowHint(false), 2000);
            }
        }

        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [sanHistory]);

    const bestMate = bestMoves.find(m => m?.mate !== undefined)?.mate ?? null;
    const arrows = getArrowMoves(game, bestMoves);
    const colors = [
        "rgba(255, 215, 0, 0.95)",
        "rgba(192, 192, 192, 0.95)",
        "rgba(205, 127, 50, 0.95)",
    ];

    return (
        <div className="flex flex-col lg:flex-row items-center justify-center min-h-screen gap-10 px-6 py-10">
            <div className="flex flex-col items-center gap-4">

                <div className="flex gap-2">
                    <button
                        onClick={() => setFlipped(!flipped)}
                        className="px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition"
                    >
                        Flip Board
                    </button>
                    <button
                        onClick={() => {
                            setShowHint(true);
                            setTimeout(() => setShowHint(false), 2000);
                        }}
                        className="px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/40 transition"
                    >
                        Hint
                    </button>
                </div>

                <div className="text-center">
                    {currentOpening && <div className="text-indigo-300 text-sm">{currentOpening}</div>}
                    <div>Turn: {game.turn() === "w" ? "White" : "Black"}</div>
                </div>

                <div className="flex items-center gap-3">
                    <EvalBar
                        evaluation={bestMoves[0]?.score ?? evaluation}
                        mate={bestMoves[0]?.mate ?? bestMate}
                    />
                    {mounted && (
                        <DndContext
                            onDragMove={() => { didDrag.current = true; }}

                            onDragStart={(event) => {
                                if (viewIndex !== null) return;
                                didDrag.current = false;
                                const from = event.active.id as string;
                                const piece = game.get(from);
                                if (!piece || piece.color !== game.turn()) return;
                                const legalMoves = game.moves({ square: from, verbose: true });
                                setSelected(from);
                                setMoves(legalMoves.map((m) => m.to));
                            }}

                            onDragEnd={(event) => {
                                const { active, over } = event;

                                if (!didDrag.current) return;

                                if (!over || active.id === over.id) {
                                    setSelected(null);
                                    setMoves([]);
                                    return;
                                }

                                makeMove(active.id as string, over.id as string);
                            }}
                        >
                            <div className="relative w-[500px] h-[500px]">
                                <svg className="absolute inset-0 w-full h-full pointer-events-none z-10 filter drop-shadow-2xl">
                                    <defs>
                                        {colors.map((color, i) => (
                                            <marker
                                                key={i}
                                                id={`arrowhead-${i}`}
                                                markerWidth="6"
                                                markerHeight="6"
                                                refX="4"
                                                refY="3"
                                                orient="auto"
                                            >
                                                <polygon points="0 0, 6 3, 0 6" fill={color} />
                                            </marker>
                                        ))}
                                    </defs>

                                    {arrows.map((arrow, i) => {
                                        const toCoords = (square: string) => {
                                            let x = "abcdefgh".indexOf(square[0]);
                                            let y = 8 - parseInt(square[1]);
                                            if (flipped) { x = 7 - x; y = 7 - y; }
                                            return { x, y };
                                        };

                                        const from = toCoords(arrow.from);
                                        const to = toCoords(arrow.to);
                                        const size = 500 / 8;

                                        const x1 = (from.x + 0.5) * size;
                                        const y1 = (from.y + 0.5) * size;
                                        const x2 = (to.x + 0.5) * size;
                                        const y2 = (to.y + 0.5) * size;

                                        // Shorten the arrow slightly so it doesn't overlap the marker perfectly
                                        const dx = x2 - x1;
                                        const dy = y2 - y1;
                                        const len = Math.sqrt(dx * dx + dy * dy);
                                        const shorten = 12;
                                        const x2_s = x2 - (dx / len) * shorten;
                                        const y2_s = y2 - (dy / len) * shorten;

                                        return (
                                            <line
                                                key={i}
                                                x1={x1}
                                                y1={y1}
                                                x2={x2_s}
                                                y2={y2_s}
                                                stroke={colors[i]}
                                                strokeWidth={i === 0 ? 9 : 6}
                                                opacity={1 - i * 0.3}
                                                strokeLinecap="round"
                                                markerEnd={`url(#arrowhead-${i})`}
                                                className="transition-all duration-300"
                                            />
                                        );
                                    })}
                                </svg>

                                <div className="grid grid-cols-8 grid-rows-8 w-full h-full">
                                    {board.map((row, r) =>
                                        row.map((square, c) => {
                                            const file = "abcdefgh"[flipped ? 7 - c : c];
                                            const rank = flipped ? r + 1 : 8 - r;
                                            const coord = `${file}${rank}`;

                                            const isDark = (r + c) % 2 === 1;
                                            const isSelected = selected === coord;
                                            const isMove = moves.includes(coord);
                                            const showRank = c === 0;
                                            const showFile = r === 7;

                                            const quality = coord === lastMovedSquare ? lastQuality : null;
                                            const qConfig = quality ? qualityConfig[quality] : null;

                                            return (
                                                <DroppableSquare id={coord} key={coord}>
                                                    <div
                                                        onClick={() => onSquareClick(coord)}
                                                        className={`relative flex items-center justify-center w-full h-full cursor-pointer
                                                        ${isDark ? "bg-[#3D4F6E]" : "bg-[#7E90B0]"}`}
                                                    >
                                                        {showRank && (
                                                            <span className={`absolute top-1 left-1 text-[10px] font-bold opacity-40 ${isDark ? "text-slate-300" : "text-slate-900"}`}>{rank}</span>
                                                        )}
                                                        {showFile && (
                                                            <span className={`absolute bottom-1 right-1 text-[10px] font-bold opacity-40 ${isDark ? "text-slate-300" : "text-slate-900"}`}>{file}</span>
                                                        )}
                                                        {isSelected && (
                                                            <div className="absolute inset-0 bg-indigo-400/40" />
                                                        )}
                                                        {(lastMove?.from === coord || lastMove?.to === coord) && (
                                                            <div className="absolute inset-0 bg-yellow-400/20" />
                                                        )}
                                                        {showHint && bestMoves[0]?.line[0] && (
                                                            (() => {
                                                                const bestSAN = bestMoves[0].line[0];
                                                                // Simple check if coord is part of the SAN (e.g. "Nf3" matches "f3")
                                                                // Note: This is an approximation for SAN → Square mapping
                                                                if (bestSAN.includes(coord)) {
                                                                    return <div className="absolute inset-0 border-4 border-indigo-400 animate-pulse z-30 pointer-events-none" />;
                                                                }
                                                                return null;
                                                            })()
                                                        )}
                                                        {isMove && !square && (
                                                            <div className="w-4 h-4 bg-black/40 rounded-full absolute" />
                                                        )}
                                                        {isMove && square && (
                                                            <div className="absolute inset-1 border-4 border-black/40 rounded-full" />
                                                        )}
                                                        {square && (
                                                            <>
                                                                {qConfig && qConfig.label && (
                                                                    <div className="absolute top-1 right-1 z-20">
                                                                        <div
                                                                            style={{
                                                                                width: 22, height: 22, borderRadius: "50%",
                                                                                background: qConfig.bg, color: qConfig.text,
                                                                                display: "flex", alignItems: "center", justifyContent: "center",
                                                                                fontSize: 9, fontWeight: 700, boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
                                                                                letterSpacing: "-0.5px"
                                                                            }}
                                                                        >
                                                                            {qConfig.label}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                                <DraggablePiece key={coord} id={coord} game={viewGame} lastMove={lastMove} flipped={flipped}>
                                                                    <Image
                                                                        src={getPieceImage(square)}
                                                                        alt=""
                                                                        width={48}
                                                                        height={48}
                                                                        className="pointer-events-none"
                                                                    />
                                                                </DraggablePiece>
                                                            </>
                                                        )}
                                                    </div>
                                                </DroppableSquare>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        </DndContext>
                    )}
                </div>
            </div>

            <div className="flex flex-col gap-6 w-[400px]">
                {/* Sidebar Tabs */}
                <div className="flex p-1 bg-white/[0.03] border border-white/10 rounded-xl backdrop-blur-xl">
                    {(["analysis", "review", "history"] as const).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === tab
                                ? "bg-indigo-500/20 text-indigo-200 border border-indigo-500/30"
                                : "text-slate-500 hover:text-slate-300"
                                }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                <div className="flex-1">
                    {activeTab === "analysis" && (
                        <div className="flex flex-col gap-6">
                            <Analyzer
                                evaluation={bestMoves[0]?.score ?? evaluation}
                                bestMoves={bestMoves}
                                depth={depth}
                                isThinking={isThinking}
                                moveQualities={moveQualities}
                                evalHistory={evalHistory}
                                mode="analysis"
                            />

                            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-xl">
                                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Import PGN / FEN</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={importValue}
                                        onChange={(e) => setImportValue(e.target.value)}
                                        placeholder="Paste here..."
                                        className="flex-1 bg-black/40 border border-white/5 rounded-lg px-3 py-2 text-xs text-white focus:border-indigo-500 outline-none transition-colors"
                                    />
                                    <button
                                        onClick={handleImport}
                                        className="px-3 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-xs font-bold transition"
                                    >
                                        Load
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === "review" && (
                        <Analyzer
                            evaluation={bestMoves[0]?.score ?? evaluation}
                            bestMoves={bestMoves}
                            depth={depth}
                            isThinking={isThinking}
                            moveQualities={moveQualities}
                            evalHistory={evalHistory}
                            mode="review"
                        />
                    )}

                    {activeTab === "history" && (
                        <MoveHistory
                            moves={sanHistory}
                            onUndo={handleUndo}
                            onRedo={handleRedo}
                            canUndo={sanHistory.length > 0}
                            canRedo={redoStack.length > 0}
                            onSelectMove={(i) => setViewIndex(i)}
                            currentIndex={viewIndex}
                        />
                    )}
                </div>

                {/* Elegant Footer */}
                <div className="pt-4 border-t border-white/[0.04] text-center mt-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 transition-all duration-300">
                        Made by{" "}
                        <a
                            href="https://sarvajithkarun.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="relative inline-block text-indigo-400 hover:text-indigo-300 transition-colors duration-300 after:absolute after:bottom-0 after:left-0 after:w-full after:h-[1px] after:bg-indigo-400 after:origin-bottom-right after:scale-x-0 hover:after:scale-x-100 hover:after:origin-bottom-left after:transition-transform after:duration-300 font-black"
                        >
                            Sarvajith Karun
                        </a>
                    </p>
                </div>
            </div>
        </div>
    );
}