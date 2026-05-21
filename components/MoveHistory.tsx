"use client";

import { useEffect, useRef } from "react";

type Props = {
    moves: string[];
    onUndo: () => void;
    onRedo: () => void;
    canUndo: boolean;
    canRedo: boolean;

    onSelectMove: (index: number | null) => void; // ✅ ADD
    currentIndex: number | null;                  // ✅ ADD
};

export default function MoveHistory({
    moves,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
    onSelectMove,
    currentIndex
}: Props) {
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom on new move
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [moves]);

    // Pair moves into rows: [{num, white, black?}]
    const pairs: { num: number; white: string; black?: string }[] = [];
    for (let i = 0; i < moves.length; i += 2) {
        pairs.push({ num: Math.floor(i / 2) + 1, white: moves[i], black: moves[i + 1] });
    }

    return (
        <div className="bg-white/5 border border-white/10 backdrop-blur-xl rounded-2xl p-4 shadow-xl flex flex-col gap-3 min-h-48 max-h-72">
            {/* Header + buttons */}
            <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold uppercase tracking-widest text-indigo-300/80">Moves</span>
                <div className="flex gap-2">
                    <button
                        onClick={onUndo}
                        disabled={!canUndo}
                        title="Undo"
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                        ← Undo
                    </button>
                    <button
                        onClick={onRedo}
                        disabled={!canRedo}
                        title="Redo"
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-500/20 text-indigo-200 hover:bg-indigo-500/40 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                        Redo →
                    </button>
                </div>
            </div>

            {/* Move list */}
            <div
                ref={scrollRef}
                className="flex flex-col gap-1 overflow-y-auto pr-2 custom-scrollbar flex-1"
            >
                {pairs.length === 0 && (
                    <span className="text-xs text-white/30 italic text-center mt-4">No moves yet</span>
                )}
                {pairs.map(({ num, white, black }) => (
                    <div key={num} className="flex items-center text-sm px-2 py-1.5 rounded-xl hover:bg-white/5 transition-colors">
                        <span className="w-8 text-xs font-bold text-white/20 shrink-0">{num}.</span>
                        <button
                            onClick={() => onSelectMove((num - 1) * 2)} // white move index
                            className={`flex-1 px-2 py-1 rounded-md font-mono font-medium text-left transition
        ${currentIndex === (num - 1) * 2
                                    ? "bg-indigo-500/30 text-white"
                                    : "text-indigo-100 hover:bg-white/10"}`}
                        >
                            {white}
                        </button>
                        <button
                            onClick={() => onSelectMove((num - 1) * 2 + 1)}
                            className={`flex-1 px-2 py-1 rounded-md font-mono font-medium text-left transition
        ${currentIndex === (num - 1) * 2 + 1
                                    ? "bg-fuchsia-500/30 text-white"
                                    : "text-fuchsia-200 hover:bg-white/10"}`}
                            disabled={!black}
                        >
                            {black ?? ""}
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}