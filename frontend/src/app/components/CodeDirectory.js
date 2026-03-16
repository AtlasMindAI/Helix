"use client";

import { useState, useEffect } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || (typeof window !== "undefined" ? `http://${window.location.hostname}:8000` : "http://localhost:8000");

export default function CodeDirectory({ onNodeSelect }) {
    const [treeData, setTreeData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedNodes, setExpandedNodes] = useState({});

    useEffect(() => {
        fetch(`${API_URL}/api/tree`)
            .then(async (res) => {
                const contentType = res.headers.get("content-type");
                if (!res.ok) {
                    throw new Error(`HTTP Error: ${res.status}`);
                }
                if (!contentType || !contentType.includes("application/json")) {
                    throw new TypeError("Received non-JSON response from server");
                }
                return res.json();
            })
            .then((data) => {
                setTreeData(data.tree || []);
                setLoading(false);
            })
            .catch((err) => {
                console.error("Failed to load tree:", err);
                setTreeData([]);
                setLoading(false);
            });
    }, []);

    const toggleExpand = (e, nodeId) => {
        e.stopPropagation();
        setExpandedNodes(prev => ({
            ...prev,
            [nodeId]: !prev[nodeId]
        }));
    };

    const getIcon = (type, isExpanded, hasChildren) => {
        if (type === "Module") return hasChildren ? (isExpanded ? "📂" : "📁") : "📄";
        if (type === "Class") return "🏛️";
        if (type === "Function") return "⚙️";
        return "🔹";
    };

    const getColor = (type) => {
        if (type === "Module") return "text-neon-cyan";
        if (type === "Class") return "text-[var(--neon-purple)]";
        if (type === "Function") return "text-neon-emerald";
        return "text-secondary";
    };

    const getMetabolicStyle = (node) => {
        if (!node.pagerank) return {};
        const intensity = Math.min(8, node.pagerank * 15);
        return {
            boxShadow: `inset 0 0 ${intensity}px rgba(0, 229, 255, ${intensity / 10})`,
            borderRight: node.community ? `3px solid hf(calc(${node.community} * 40), 70%, 50%)` : 'none'
        };
    };

    const renderNode = (node, depth = 0, index = 0) => {
        const hasChildren = node.children && node.children.length > 0;
        const isExpanded = expandedNodes[node.id];
        const isHighAuthority = node.pagerank > 0.1;

        return (
            <div key={`${node.id}-${depth}-${index}`} className="w-full">
                <div
                    className={`flex items-center hover:bg-elevated cursor-pointer py-1.5 px-2 rounded-md transition-all group ${depth === 0 ? "mt-1" : ""} ${isHighAuthority ? "border-l-2 border-neon-cyan/30" : ""}`}
                    style={{
                        paddingLeft: `${depth * 16 + 8}px`,
                        ...getMetabolicStyle(node)
                    }}
                    onClick={() => onNodeSelect(node)}
                >
                    {/* Caret for expansion */}
                    <div
                        className={`w-4 h-4 flex items-center justify-center mr-1 text-muted hover:text-white transition-transform ${hasChildren && isExpanded ? "rotate-90" : ""}`}
                        onClick={(e) => hasChildren && toggleExpand(e, node.id)}
                    >
                        {hasChildren ? "▸" : ""}
                    </div>

                    {/* Icon */}
                    <span className="mr-2 text-sm">{getIcon(node.type, isExpanded, hasChildren)}</span>

                    {/* Name */}
                    <span className={`text-sm font-mono truncate transition-colors ${getColor(node.type)} group-hover:text-white`}>
                        {node.name}
                    </span>

                    {/* Metabolic Probe (PageRank Score) */}
                    {node.pagerank > 0 && (
                        <div className="ml-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="w-8 h-1 bg-surface rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-neon-cyan"
                                    style={{ width: `${Math.min(100, node.pagerank * 500)}%` }}
                                ></div>
                            </div>
                            <span className="text-[8px] text-muted font-mono">{(node.pagerank * 100).toFixed(1)}</span>
                        </div>
                    )}

                    {/* Small type pill */}
                    {depth === 0 && (
                        <span className="ml-auto text-[9px] uppercase tracking-wider text-muted bg-surface px-1.5 py-0.5 rounded-sm group-hover:border-neon-cyan/30 border border-transparent transition-all">
                            {node.type}
                        </span>
                    )}

                    {/* Quick Navigation Action */}
                    <button
                        className="ml-2 opacity-0 group-hover:opacity-100 p-1 hover:text-neon-cyan transition-all text-xs"
                        title="Navigate in 3D Space"
                        onClick={(e) => {
                            e.stopPropagation();
                            onNodeSelect({ ...node, action: 'NAVIGATE' });
                        }}
                    >
                        🎯
                    </button>
                </div>

                {/* Children */}
                {hasChildren && isExpanded && (
                    <div className="border-l border-surface-border ml-4 mt-0.5 mb-1 animate-fade-in">
                        {node.children.map((child, i) => renderNode(child, depth + 1, i))}
                    </div>
                )}
            </div>
        );
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <span className="text-neon-cyan animate-pulse flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-neon-cyan"></span>
                    Scanning Directory...
                </span>
            </div>
        );
    }

    if (treeData.length === 0) {
        return (
            <div className="flex items-center justify-center h-full text-muted text-sm italic">
                No directory structure found. Have you synced a repository?
            </div>
        );
    }

    return (
        <div className="h-full w-full overflow-y-auto custom-scrollbar p-2">
            <div className="mb-4 px-2">
                <h3 className="text-neon-cyan text-sm font-semibold tracking-wide uppercase flex items-center gap-2">
                    <span>🧬</span> Biological Architecture
                </h3>
                <p className="text-muted text-[10px] tracking-wider mt-1">Hierarchical Tree View</p>
            </div>
            <div className="flex flex-col">
                {treeData.map((node, i) => renderNode(node, 0, i))}
            </div>
        </div>
    );
}
