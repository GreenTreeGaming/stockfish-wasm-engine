"use client";

import { useState, useMemo } from "react";

type MoveQuality =
    | "brilliant" | "great" | "best" | "excellent" | "good"
    | "inaccuracy" | "mistake" | "miss" | "blunder" | "book";

const qualityMeta: Record<MoveQuality, { label: string; bg: string; text: string; symbol: string }> = {
    brilliant: { label: "Brilliant", bg: "#05B8A0", text: "#fff", symbol: "!!" },
    great: { label: "Great", bg: "#6EA8D8", text: "#fff", symbol: "!" },
    best: { label: "Best", bg: "#5FAD56", text: "#fff", symbol: "★" },
    excellent: { label: "Excellent", bg: "#7BC67E", text: "#fff", symbol: "✦" },
    good: { label: "Good", bg: "#96C97D", text: "#fff", symbol: "✓" },
    book: { label: "Book", bg: "#C49A6C", text: "#fff", symbol: "◉" },
    inaccuracy: { label: "Inaccuracy", bg: "#F0C040", text: "#7a5c00", symbol: "?!" },
    mistake: { label: "Mistake", bg: "#E07B39", text: "#fff", symbol: "?" },
    miss: { label: "Miss", bg: "#E05C5C", text: "#fff", symbol: "✕" },
    blunder: { label: "Blunder", bg: "#CC3333", text: "#fff", symbol: "??" },
};

const qualityOrder: MoveQuality[] = [
    "brilliant", "great", "best", "excellent", "good",
    "book", "inaccuracy", "mistake", "miss", "blunder",
];

type AnalyzerProps = {
    evaluation: number | null;
    bestMoves: { score: number; mate?: number; line: string[] }[];
    depth: number;
    isThinking: boolean;
    moveQualities?: MoveQuality[];
    evalHistory?: number[];
    mode?: "analysis" | "review";
};

function formatMoves(line: string[], limit = 6) {
    return line.slice(0, limit).map((m, i) =>
        i % 2 === 0 ? `${Math.floor(i / 2) + 1}. ${m}` : m
    ).join(" ");
}

export default function Analyzer({ bestMoves, depth, isThinking, moveQualities = [], evalHistory = [0], mode = "analysis" }: AnalyzerProps) {
    const [expandedLine, setExpandedLine] = useState<number | null>(null);
    const [showDetails, setShowDetails] = useState(true);

    const whiteQualities = moveQualities.filter((_, i) => i % 2 === 0);
    const blackQualities = moveQualities.filter((_, i) => i % 2 === 1);

    // Calculate Accuracy based on move qualities
    const calculateAccuracy = (qualities: MoveQuality[]) => {
        if (!qualities.length) return 100;
        const weights: Record<MoveQuality, number> = {
            brilliant: 100, great: 100, best: 100, excellent: 95, good: 85,
            book: 100, inaccuracy: 60, mistake: 30, miss: 20, blunder: 0
        };
        const sum = qualities.reduce((acc, q) => acc + weights[q], 0);
        return Math.round(sum / qualities.length);
    };

    const whiteAccuracy = useMemo(() => calculateAccuracy(whiteQualities), [whiteQualities]);
    const blackAccuracy = useMemo(() => calculateAccuracy(blackQualities), [blackQualities]);

    // Graph Data
    const graphPath = useMemo(() => {
        if (evalHistory.length < 2) return "";
        const width = 340; // Adjusted for wider sidebar
        const height = 60;
        const maxEval = 5; // Normalize scale to ±5
        const points = evalHistory.map((val, i) => {
            const x = (i / (evalHistory.length - 1)) * width;
            const clamped = Math.max(-maxEval, Math.min(maxEval, val));
            const y = height / 2 - (clamped / maxEval) * (height / 2);
            return `${x},${y}`;
        });
        return `M ${points.join(" L ")}`;
    }, [evalHistory]);

    return (
        <div className="flex flex-col gap-4 w-full text-white/90">
            {mode === "review" && (
                <>
                    {/* ── ACCURACY BADGES ── */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-xl text-center">
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 block mb-1">White Accuracy</span>
                            <span className="text-2xl font-black text-white">{whiteAccuracy}%</span>
                        </div>
                        <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-xl text-center">
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 block mb-1">Black Accuracy</span>
                            <span className="text-2xl font-black text-white">{blackAccuracy}%</span>
                        </div>
                    </div>

                    {/* ── MOVE CLASSIFICATION ── */}
                    <div className="bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden backdrop-blur-xl">
                        <button
                            onClick={() => setShowDetails(!showDetails)}
                            className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition"
                        >
                            <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Move Breakdown</span>
                            <span className="text-white/20 text-[10px]">{showDetails ? "▲" : "▼"}</span>
                        </button>

                        {showDetails && (
                            <div className="px-4 pb-4">
                                <div className="grid grid-cols-[1fr_24px_4px_24px] gap-x-2 mb-2 px-1 opacity-20">
                                    <div />
                                    <span className="text-[8px] font-black text-center">W</span>
                                    <div />
                                    <span className="text-[8px] font-black text-center">B</span>
                                </div>
                                <div className="flex flex-col gap-1">
                                    {qualityOrder.map(q => {
                                        const w = whiteQualities.filter(x => x === q).length;
                                        const b = blackQualities.filter(x => x === q).length;
                                        if (w === 0 && b === 0) return null;
                                        const meta = qualityMeta[q];
                                        return (
                                            <div key={q} className="grid grid-cols-[1fr_24px_4px_24px] items-center gap-x-2 px-2 py-1 rounded-lg bg-white/5">
                                                <div className="flex items-center gap-2">
                                                    <div style={{
                                                        width: 14, height: 14, borderRadius: "50%",
                                                        background: meta.bg, color: meta.text,
                                                        fontSize: 6, fontWeight: 900, flexShrink: 0,
                                                        display: "flex", alignItems: "center", justifyContent: "center"
                                                    }}>
                                                        {meta.symbol}
                                                    </div>
                                                    <span className="text-[10px] font-bold text-white/50">{meta.label}</span>
                                                </div>
                                                <span className="text-[10px] font-black text-center" style={{ color: w > 0 ? meta.bg : "rgba(255,255,255,0.1)" }}>{w}</span>
                                                <div className="w-[1px] h-2 bg-white/10" />
                                                <span className="text-[10px] font-black text-center" style={{ color: b > 0 ? meta.bg : "rgba(255,255,255,0.1)" }}>{b}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}

            {mode === "analysis" && (
                <>
                    {/* ── EVALUATION GRAPH ── */}
                    <div className="relative p-4 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-xl overflow-hidden">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Game Momentum</span>
                            {isThinking && <span className="text-[9px] text-fuchsia-400 animate-pulse uppercase font-black">Analyzing…</span>}
                        </div>
                        <div className="h-[60px] w-full relative">
                            <svg width="100%" height="100%" viewBox="0 0 340 60" preserveAspectRatio="none">
                                <line x1="0" y1="30" x2="340" y2="30" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                                <path
                                    d={graphPath}
                                    fill="none"
                                    stroke="url(#graph-gradient)"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                                <defs>
                                    <linearGradient id="graph-gradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#a78bfa" />
                                        <stop offset="50%" stopColor="#fff" />
                                        <stop offset="100%" stopColor="#f472b6" />
                                    </linearGradient>
                                </defs>
                            </svg>
                        </div>
                    </div>

                    {/* ── ENGINE TOP PICKS ── */}
                    <div className="bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden backdrop-blur-xl">
                        <div className="flex items-center justify-between px-4 pt-4 pb-2">
                            <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Engine Top Picks</span>
                            <span className="text-[10px] text-white/20 font-bold uppercase tracking-widest">Depth {depth}</span>
                        </div>

                        <div className="flex flex-col gap-2 p-3 max-h-[300px] overflow-y-auto custom-scrollbar">
                            {bestMoves.length === 0 ? (
                                <p className="text-[10px] text-white/20 italic text-center py-4">Sizing up the board…</p>
                            ) : (
                                bestMoves.map((entry, i) => (
                                    <div
                                        key={i}
                                        className="group flex gap-3 p-2.5 bg-black/40 rounded-xl border border-white/5 hover:border-white/20 transition-all cursor-pointer"
                                        onClick={() => setExpandedLine(expandedLine === i ? null : i)}
                                    >
                                        <span
                                            className="text-[11px] font-black font-mono shrink-0 w-12 text-center py-0.5 rounded-md bg-white/5"
                                            style={{
                                                color: entry.mate ? "#facc15"
                                                    : entry.score > 0 ? "#a78bfa"
                                                        : entry.score < 0 ? "#f472b6"
                                                            : "#9ca3af",
                                            }}
                                        >
                                            {entry.mate ? `#${entry.mate}` : `${entry.score > 0 ? "+" : ""}${entry.score.toFixed(2)}`}
                                        </span>

                                        <span className="text-[11px] font-mono text-white/60 leading-tight group-hover:text-white transition-colors">
                                            {expandedLine === i ? formatMoves(entry.line, 20) : formatMoves(entry.line, 6)}
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}