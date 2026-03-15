"use client";

import { useState, useEffect } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || (typeof window !== "undefined" ? `http://${window.location.hostname}:8000` : "http://localhost:8000");

export default function Sidebar() {
    const [gitStatus, setGitStatus] = useState(null);

    useEffect(() => {
        // Fetch Git status on mount and every 30 seconds
        const fetchGit = async () => {
            try {
                const res = await fetch(`${API_URL}/api/v1/git/status`);
                const data = await res.json();
                setGitStatus(data);
            } catch (err) {
                console.error("Failed to fetch git status", err);
            }
        };
        fetchGit();
        const interval = setInterval(fetchGit, 30000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="w-16 md:w-20 h-full flex flex-col justify-between bg-[#0a0f1e] border-r border-[#141a33] shadow-[4px_0_24px_rgba(0,0,0,0.5)] z-50">
            {/* Top: Branding & Nav */}
            <div className="flex flex-col items-center pt-6 gap-8">
                {/* Logo */}
                <div className="flex flex-col items-center group cursor-pointer" title="Helix Repository">
                    <div className="text-2xl mb-1 group-hover:scale-110 transition-transform drop-shadow-[0_0_8px_rgba(0,255,136,0.5)]">🧬</div>
                    <div className="text-[10px] font-bold tracking-widest uppercase">
                        <span className="text-[#00ff88]">He</span><span className="text-[#00e5ff]">lix</span>
                    </div>
                </div>

                {/* Separator */}
                <div className="w-8 h-[1px] bg-[#141a33]" />

                {/* Nav Icons (Visual only for the shell) */}
                <div className="flex flex-col gap-6">
                    <NavIcon emoji="🌌" label="Overview" active={true} />
                    <NavIcon emoji="🔬" label="Interrogate" />
                    <NavIcon emoji="📁" label="Directory" />
                    <NavIcon emoji="⚙️" label="Settings" />
                </div>
            </div>

            {/* Bottom: Git Status */}
            <div className="pb-6 flex flex-col items-center gap-4">
                {gitStatus ? (
                    <div className="flex flex-col items-center gap-3">
                        {/* Branch */}
                        <div className="flex flex-col items-center" title={`Branch: ${gitStatus.branch}`}>
                            <span className="text-sm">🌿</span>
                            <span className="text-[9px] text-[#8892a8] font-mono mt-1 max-w-[50px] truncate">
                                {gitStatus.branch}
                            </span>
                        </div>

                        {/* Changes */}
                        <div className="flex flex-col items-center" title={`${gitStatus.changes} uncommitted changes`}>
                            <div className={`w-2 h-2 rounded-full ${gitStatus.changes > 0 ? "bg-[#ff00aa] shadow-[0_0_8px_rgba(255,0,170,0.6)] animate-pulse" : "bg-[#4a5568]"}`} />
                            <span className="text-[9px] text-[#8892a8] font-mono mt-1">
                                {gitStatus.changes > 0 ? `+${gitStatus.changes}` : "0"}
                            </span>
                        </div>

                        {/* Commit Hash */}
                        <div className="bg-[#141a33] px-2 py-1 rounded border border-[#1e293b]" title="Latest Commit">
                            <span className="text-[9px] text-[#00e5ff] font-mono">
                                {gitStatus.commit}
                            </span>
                        </div>
                    </div>
                ) : (
                    <div className="w-4 h-4 border-2 border-[#4a5568] border-t-transparent rounded-full animate-spin" />
                )}
            </div>
        </div>
    );
}

function NavIcon({ emoji, label, active = false }) {
    return (
        <div
            className="group relative flex items-center justify-center w-10 h-10 rounded-xl cursor-pointer transition-all hover:bg-[#141a33]"
            title={label}
        >
            <span className={`text-lg transition-transform group-hover:scale-110 ${active ? "opacity-100 drop-shadow-[0_0_8px_rgba(0,229,255,0.5)]" : "opacity-50 grayscale"}`}>
                {emoji}
            </span>
            {active && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-[#00e5ff] rounded-r shadow-[0_0_8px_rgba(0,229,255,0.8)]" />
            )}
        </div>
    );
}
