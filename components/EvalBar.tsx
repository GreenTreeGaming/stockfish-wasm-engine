"use client";

type Props = {
    evaluation: number | null;
    mate?: number | null;
};

function evalToWinProb(eval_: number): number {
    return 1 / (1 + Math.exp(-0.25 * eval_));
}

export default function EvalBar({ evaluation, mate }: Props) {
    const isMate = mate !== null && mate !== undefined;

    const evalClamped = isMate
        ? (mate! > 0 ? 10 : -10)
        : Math.max(-10, Math.min(10, evaluation ?? 0));

    const whitePercent = isMate
        ? (mate! > 0 ? 100 : 0)
        : ((evalClamped + 10) / 20) * 100;

    const winProb = evaluation !== null ? evalToWinProb(evaluation) : 0.5;
    const winProbPercent = (winProb * 100).toFixed(0);

    const label = isMate
        ? `M${Math.abs(mate!)}`
        : evaluation === null
            ? "—"
            : evaluation > 0
                ? `+${evaluation.toFixed(1)}`
                : evaluation.toFixed(1);

    const isOnWhite = whitePercent > 15;

    return (
        <div className="relative h-[500px] w-12 overflow-hidden rounded-xl border border-white/10 bg-slate-900 shadow-2xl">
            {/* White fill with gradient */}
            <div
                className="absolute bottom-0 w-full bg-gradient-to-t from-slate-100 to-white transition-all duration-700 ease-in-out"
                style={{ height: `${whitePercent}%` }}
            />

            {/* Divider */}
            <div className="absolute left-0 right-0 top-1/2 h-[1px] bg-white/20 z-10" />

            {/* Winning Chance label */}
            <div className="absolute top-2 left-0 w-full text-center z-20 pointer-events-none opacity-40">
                <span className="text-[8px] font-black uppercase tracking-tighter text-white">Win %</span>
            </div>

            {/* Eval label */}
            <div
                className="absolute left-1/2 -translate-x-1/2 z-20 pointer-events-none transition-all duration-500"
                style={{ bottom: `calc(${whitePercent}% - 24px)` }}
            >
                <span
                    className={`
                        text-[10px] font-black
                        ${isOnWhite ? "text-slate-900" : "text-white"}
                    `}
                >
                    {label}
                </span>
            </div>

            {/* Probability at bottom */}
            <div className="absolute bottom-2 left-0 w-full text-center z-20 pointer-events-none">
                <span className={`text-[9px] font-black ${isOnWhite ? "text-slate-900" : "text-white/40"}`}>
                    {winProbPercent}%
                </span>
            </div>
        </div>
    );
}