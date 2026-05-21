import { useEffect, useRef } from "react";

export function useStockfish(onMessage: (msg: string) => void) {
    const workerRef = useRef<Worker | null>(null);
    const onMessageRef = useRef(onMessage);

    // Keep the ref current without recreating the worker
    useEffect(() => {
        onMessageRef.current = onMessage;
    });

    // Initialize worker once
    useEffect(() => {
        const worker = new Worker("/stockfish-18-lite-single.js");
        workerRef.current = worker;

        worker.onmessage = (e) => {
            onMessageRef.current(e.data);
        };

        worker.onerror = (e) => console.error("Stockfish error:", e);

        return () => worker.terminate();
    }, []);

    function send(cmd: string) {
        workerRef.current?.postMessage(cmd);
    }

    return { send };
}