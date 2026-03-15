"use client";

import { useEffect, useState, useRef } from 'react';

export default function SystemVitals() {
    const [stats, setStats] = useState({ fps: 0, memory: 0, latency: 0 });
    const framesRef = useRef(0);
    const lastTimeRef = useRef(performance.now());
    const [history, setHistory] = useState([]);

    useEffect(() => {
        let raf;
        const update = () => {
            framesRef.current++;
            const now = performance.now();
            if (now >= lastTimeRef.current + 1000) {
                const fps = Math.round((framesRef.current * 1000) / (now - lastTimeRef.current));

                // Estimate memory if available
                const memory = window.performance.memory ?
                    Math.round(window.performance.memory.usedJSHeapSize / 1048576) : 0;

                // Mock latency (to be replaced with real backend telemetry)
                const mockLatency = Math.round(50 + Math.random() * 20);

                setStats({ fps, memory, latency: mockLatency });
                setHistory(prev => [...prev.slice(-19), fps]);

                framesRef.current = 0;
                lastTimeRef.current = now;
            }
            raf = requestAnimationFrame(update);
        };
        raf = requestAnimationFrame(update);
        return () => cancelAnimationFrame(raf);
    }, []);

    return (
        <div className="fixed bottom-24 right-6 pointer-events-none z-50 flex flex-col items-end space-y-2 font-monospace">
            <div className="bg-[#050510dd] backdrop-blur-md border border-[#00ffd533] p-3 rounded-lg shadow-[0_0_20px_rgba(0,255,213,0.1)] w-40">
                <div className="text-[10px] text-[#00ffd5] opacity-60 uppercase tracking-widest mb-2 flex justify-between">
                    <span>Metabolism</span>
                    <span className={stats.fps > 55 ? "text-green-400" : "text-yellow-400"}>Healthy</span>
                </div>

                <div className="space-y-3">
                    <div className="flex justify-between items-end">
                        <span className="text-[9px] text-white/50 uppercase">Rendering</span>
                        <div className="text-right">
                            <span className="text-lg font-bold text-[#00ffd5] leading-none">{stats.fps}</span>
                            <span className="text-[8px] text-white/30 ml-1">FPS</span>
                        </div>
                    </div>

                    <div className="h-4 flex items-end space-x-[1px]">
                        {history.map((val, i) => (
                            <div
                                key={i}
                                className="bg-[#00ffd5] opacity-40 w-full"
                                style={{ height: `${(val / 120) * 100}%` }}
                            />
                        ))}
                    </div>

                    <div className="flex justify-between items-center text-[10px]">
                        <span className="text-white/40 uppercase">Memory</span>
                        <span className="text-[#9945ff] font-bold">{stats.memory} <span className="text-[8px] opacity-50 font-normal">MB</span></span>
                    </div>

                    <div className="flex justify-between items-center text-[10px]">
                        <span className="text-white/40 uppercase">Latency</span>
                        <span className="text-[#ff00ff] font-bold">{stats.latency} <span className="text-[8px] opacity-50 font-normal">ms</span></span>
                    </div>
                </div>

                <div className="mt-3 pt-2 border-t border-white/5 flex justify-between items-center">
                    <div className="w-1.5 h-1.5 bg-[#00ffd5] rounded-full animate-pulse shadow-[0_0_5px_#00ffd5]" />
                    <span className="text-[8px] text-white/20 uppercase tracking-tighter">SOTA Diagnostic v1.0</span>
                </div>
            </div>
        </div>
    );
}
