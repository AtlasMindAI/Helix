"use client";

import { useState } from "react";

export default function RepoRootNode({ onSyncComplete }) {
    const [repoUrl, setRepoUrl] = useState("");
    const [status, setStatus] = useState("idle"); // idle, digesting, synced, error
    const [errorMsg, setErrorMsg] = useState("");

    const API_URL = process.env.NEXT_PUBLIC_API_URL || (typeof window !== "undefined" ? `http://${window.location.hostname}:8000` : "http://localhost:8000");

    const handleIngest = async (e) => {
        e.preventDefault();
        if (!repoUrl.trim() || status === "digesting") return;

        setStatus("digesting");
        setErrorMsg("");

        try {
            const res = await fetch(`${API_URL}/api/ingest`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ repo_url: repoUrl.trim() }),
            });

            const data = await res.json();

            if (!res.ok || data.error) {
                const detail = data.detail || data.error || "Ingestion failed";
                if (res.status === 429 || `${detail}`.includes("Quota exceeded") || `${detail}`.includes("RESOURCE_EXHAUSTED")) {
                    throw new Error("Embedding quota exceeded. Wait and retry, or switch to EMBEDDING_PROVIDER=qwen.");
                }
                throw new Error(detail);
            }

            setStatus("synced");
            if (onSyncComplete) {
                onSyncComplete(); // Trigger graph reload
            }
        } catch (err) {
            console.error(err);
            setErrorMsg(err.message);
            setStatus("error");
        }
    };

    // Determine pulse color and glow based on status
    let pulseColor = "border-[rgba(255,255,255,0.1)] shadow-none";
    let statusText = "Awaiting Target Sequence";

    if (status === "digesting") {
        pulseColor = "border-neon-cyan shadow-[0_0_30px_rgba(0,229,255,0.4)] animate-pulse";
        statusText = "Digesting Repository...";
    } else if (status === "synced") {
        pulseColor = "border-neon-emerald shadow-[0_0_30px_rgba(0,255,153,0.4)]";
        statusText = "Repository Synced";
    } else if (status === "error") {
        pulseColor = "border-red-500 shadow-[0_0_30px_rgba(255,0,0,0.4)]";
        statusText = "Assimilation Failed";
    }

    return (
        <div className="relative w-full flex flex-col items-center">
            {/* The Central Node Representation */}
            <div
                className={`glass-strong rounded-2xl p-5 transition-all duration-500 border-2 ${pulseColor} backdrop-blur-xl flex flex-col items-center justify-center w-full max-w-[320px]`}
            >
                <div className="text-neon-cyan font-mono text-xs tracking-widest uppercase font-bold mb-4 text-center">
                    {statusText}
                </div>

                {status !== "digesting" && status !== "synced" ? (
                    <form onSubmit={handleIngest} className="w-full relative">
                        <p className="text-[10px] uppercase tracking-widest text-muted font-bold mb-2">
                            Repository URL
                        </p>
                        <input
                            type="text"
                            value={repoUrl}
                            onChange={(e) => setRepoUrl(e.target.value)}
                            placeholder="https://github.com/..."
                            className="w-full bg-[rgba(0,0,0,0.5)] border border-[rgba(255,255,255,0.1)] rounded-lg py-2 px-3 text-xs text-text-primary placeholder:text-muted focus:outline-none focus:border-neon-cyan transition-colors"
                        />
                        <p className="text-[10px] text-secondary mt-2">
                            Paste a GitHub URL or local repo path.
                        </p>
                        <button
                            type="submit"
                            className="mt-3 w-full bg-[rgba(0,229,255,0.1)] hover:bg-[rgba(0,229,255,0.2)] text-neon-cyan border border-[rgba(0,229,255,0.3)] py-1.5 rounded-md text-xs font-bold transition-all"
                        >
                            INITIALIZE INGESTION
                        </button>
                    </form>
                ) : (
                    <div className="text-center w-full">
                        <div className="text-xs text-text-secondary truncate w-full" title={repoUrl}>
                            {repoUrl.split('/').slice(-2).join('/')}
                        </div>
                        {status === "synced" && (
                            <button
                                onClick={() => { setStatus("idle"); setRepoUrl(""); }}
                                className="mt-3 text-[10px] text-muted hover:text-white transition-colors uppercase tracking-wider"
                            >
                                Target New Repo
                            </button>
                        )}
                    </div>
                )}
            </div>

            {errorMsg && (
                <div className="mt-4 bg-red-900/50 border border-red-500 text-red-200 px-4 py-2 rounded-lg text-xs font-mono max-w-xs text-center backdrop-blur-sm">
                    {errorMsg}
                </div>
            )}
        </div>
    );
}
