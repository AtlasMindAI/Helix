"use client";

import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";

// Helix Cyber-Bio color scheme
const TYPE_COLORS = {
    Root: "#0f172a",
    Module: "#00e5ff",    // Neon Cyan
    Class: "#9945ff",     // Neon Purple
    Function: "#00ff88",  // Neon Emerald
};

const TYPE_FILLS = {
    Root: "rgba(15, 23, 42, 0.3)",
    Module: "rgba(0, 229, 255, 0.08)",
    Class: "rgba(153, 69, 255, 0.10)",
    Function: "rgba(0, 255, 136, 0.15)",
};

export default function CellularGraph({ data, onNodeClick, highlightNodes = [] }) {
    const containerRef = useRef();
    const svgRef = useRef();
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

    // State to handle the floating Shadow Doc panel
    const [tooltip, setTooltip] = useState({
        visible: false,
        x: 0,
        y: 0,
        content: null
    });

    // Track dimensions
    useEffect(() => {
        const update = () => {
            if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                setDimensions({ width: rect.width || window.innerWidth, height: rect.height || window.innerHeight });
            } else {
                setDimensions({ width: window.innerWidth, height: window.innerHeight });
            }
        };
        update();
        window.addEventListener("resize", update);
        return () => window.removeEventListener("resize", update);
    }, []);

    useEffect(() => {
        if (!data || !dimensions.width || !dimensions.height) return;

        const { width, height } = dimensions;
        const size = Math.min(width, height);

        // Clear previous render
        d3.select(svgRef.current).selectAll("*").remove();

        // 1. Create the D3 Hierarchy
        const root = d3.hierarchy(data)
            .sum(d => d.value || 0)
            .sort((a, b) => (b.value || 0) - (a.value || 0));

        // Ensure all non-leaf nodes have at least the sum of children
        root.each(d => {
            if (!d.children && !d.data.value) {
                d.data.value = 1;
            }
        });
        root.sum(d => d.value || (d.children ? 0 : 1));

        // 2. Setup the Circle Pack Layout
        const pack = d3.pack()
            .size([size - 4, size - 4])
            .padding(d => d.depth === 0 ? 20 : d.depth === 1 ? 10 : 4);

        const packedRoot = pack(root);
        const nodes = packedRoot.descendants();

        // Highlight set for fast lookup
        const highlightSet = new Set(highlightNodes.map(n => n.toLowerCase()));

        // 3. Create SVG with zoom
        const svg = d3.select(svgRef.current)
            .attr("width", width)
            .attr("height", height)
            .attr("viewBox", `0 0 ${size} ${size}`)
            .style("background", "transparent")
            .style("cursor", "grab");

        const g = svg.append("g")
            .attr("transform", `translate(2, 2)`);

        // Zoom behavior
        const zoom = d3.zoom()
            .scaleExtent([0.5, 8])
            .on("zoom", (event) => {
                g.attr("transform", event.transform);
            });
        svg.call(zoom);

        // 4. Render circles
        const circles = g.selectAll("circle")
            .data(nodes)
            .join("circle")
            .attr("cx", d => d.x)
            .attr("cy", d => d.y)
            .attr("r", 0) // Start at 0 for animation
            .attr("fill", d => TYPE_FILLS[d.data.type] || "rgba(100,100,100,0.1)")
            .attr("stroke", d => {
                const isHighlighted = highlightSet.has((d.data.name || "").toLowerCase());
                if (isHighlighted) return "#00e5ff";
                return TYPE_COLORS[d.data.type] || "#334155";
            })
            .attr("stroke-width", d => {
                const isHighlighted = highlightSet.has((d.data.name || "").toLowerCase());
                if (isHighlighted) return 3;
                return d.depth === 0 ? 1 : d.depth === 1 ? 1.5 : 0.8;
            })
            .attr("stroke-opacity", d => {
                const isHighlighted = highlightSet.has((d.data.name || "").toLowerCase());
                return isHighlighted ? 1 : 0.5;
            })
            .style("filter", d => {
                const isHighlighted = highlightSet.has((d.data.name || "").toLowerCase());
                if (isHighlighted) return "drop-shadow(0 0 12px rgba(0, 229, 255, 0.8))";
                return d.depth <= 1 ? "drop-shadow(0 0 4px rgba(0, 229, 255, 0.1))" : "none";
            })
            .style("cursor", d => d.depth > 0 ? "pointer" : "default")
            .on("mouseenter", function (event, d) {
                if (d.depth === 0) return;

                // Highlight the specific node visually in D3
                d3.select(this)
                    .transition().duration(200)
                    .attr("stroke-opacity", 1)
                    .attr("stroke-width", d.depth === 1 ? 2.5 : 2)
                    .style("filter", `drop-shadow(0 0 10px ${TYPE_COLORS[d.data.type]}66)`);

                // Trigger the React tooltip
                setTooltip({
                    visible: true,
                    x: event.pageX + 15,
                    y: event.pageY + 15,
                    content: { ...d.data, childCount: d.children ? d.children.length : 0 }
                });
            })
            .on("mousemove", function (event) {
                // Determine screen position to keep tooltip within bounds
                let tipX = event.pageX + 15;
                let tipY = event.pageY + 15;

                // Simple boundary check (assuming ~300px tooltip width)
                if (tipX + 320 > window.innerWidth) tipX = event.pageX - 335;
                if (tipY + 200 > window.innerHeight) tipY = window.innerHeight - 210;

                setTooltip(prev => ({ ...prev, x: tipX, y: tipY }));
            })
            .on("mouseleave", function (event, d) {
                if (d.depth === 0) return;
                const isHighlighted = highlightSet.has((d.data.name || "").toLowerCase());

                // Revert aesthetics
                d3.select(this)
                    .transition().duration(300)
                    .attr("stroke-opacity", isHighlighted ? 1 : 0.5)
                    .attr("stroke-width", isHighlighted ? 3 : (d.depth === 1 ? 1.5 : 0.8))
                    .style("filter", isHighlighted
                        ? "drop-shadow(0 0 12px rgba(0, 229, 255, 0.8))"
                        : d.depth <= 1 ? "drop-shadow(0 0 4px rgba(0, 229, 255, 0.1))" : "none"
                    );

                // Hide tooltip
                setTooltip({ visible: false, x: 0, y: 0, content: null });
            })
            .on("click", function (event, d) {
                if (d.depth === 0) return;
                event.stopPropagation();

                // Flash animation
                d3.select(this)
                    .transition().duration(100)
                    .attr("stroke-width", 4)
                    .attr("stroke", "#00e5ff")
                    .style("filter", "drop-shadow(0 0 20px rgba(0, 229, 255, 0.9))")
                    .transition().duration(400)
                    .attr("stroke-width", d.depth === 1 ? 1.5 : 0.8)
                    .attr("stroke", TYPE_COLORS[d.data.type] || "#334155")
                    .style("filter", d.depth <= 1 ? "drop-shadow(0 0 4px rgba(0, 229, 255, 0.1))" : "none");

                // Trigger React info panel
                if (onNodeClick) {
                    onNodeClick({
                        name: d.data.name,
                        type: d.data.type,
                        file_path: d.data.file_path || "",
                        docstring: d.data.docstring || "",
                        shadow_doc: d.data.shadow_doc || "",
                        line_start: d.data.line_start || 0,
                        line_end: d.data.line_end || 0,
                    });
                }
            });

        // Animate circles in with staggered delay
        circles.transition()
            .duration(800)
            .delay((d, i) => d.depth * 200 + i * 2)
            .attr("r", d => d.r)
            .ease(d3.easeElasticOut.amplitude(1).period(0.5));

        // 5. Labels
        g.selectAll("text")
            .data(nodes.filter(d => d.depth > 0 && d.r > 20))
            .join("text")
            .attr("x", d => d.x)
            .attr("y", d => d.y)
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "central")
            .attr("fill", d => TYPE_COLORS[d.data.type] || "#e8ecf5")
            .attr("font-size", d => Math.min(d.r / 3.5, 14))
            .attr("font-family", "'Inter', 'Segoe UI', monospace")
            .attr("font-weight", d => d.depth === 1 ? 700 : 500)
            .attr("letter-spacing", "0.03em")
            .attr("opacity", 0)
            .attr("pointer-events", "none")
            .text(d => {
                const maxLen = Math.floor(d.r / 4);
                const name = d.data.name || "";
                return name.length > maxLen ? name.substring(0, maxLen) + "…" : name;
            })
            .transition()
            .duration(600)
            .delay((d, i) => d.depth * 200 + 400 + i * 5)
            .attr("opacity", d => d.depth === 1 ? 0.9 : 0.7);

    }, [data, dimensions, highlightNodes, onNodeClick]);

    return (
        <div ref={containerRef} className="absolute inset-0" style={{ background: "#050510" }}>
            <svg ref={svgRef} className="w-full h-full" />

            {/* The Clinical Shadow Doc Tooltip (React State) */}
            {tooltip.visible && tooltip.content && (
                <div
                    className="fixed z-[100] p-4 border rounded-xl shadow-2xl pointer-events-none"
                    style={{
                        top: tooltip.y,
                        left: tooltip.x,
                        backgroundColor: "rgba(10, 15, 30, 0.95)", // Cyber-bio glassmorphism
                        backdropFilter: "blur(16px)",
                        WebkitBackdropFilter: "blur(16px)",
                        borderColor: "rgba(0, 229, 255, 0.2)",
                        color: "#e2e8f0",
                        width: "320px",
                        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5), 0 0 20px rgba(0, 229, 255, 0.1)",
                        animation: "fade-in 0.2s ease-out"
                    }}
                >
                    <h3 className="text-[0.65rem] font-bold uppercase tracking-[0.08em] mb-1" style={{ color: TYPE_COLORS[tooltip.content.type] }}>
                        [{tooltip.content.type}]
                    </h3>
                    <div className="text-[0.85rem] font-semibold text-[#e8ecf5] font-mono break-all mb-2">
                        {tooltip.content.name}
                    </div>

                    {tooltip.content.childCount > 0 && (
                        <div className="text-[0.7rem] text-[#8892a8] mb-2">
                            {tooltip.content.childCount} {tooltip.content.type === "Module" ? "classes/functions" : "methods"}
                        </div>
                    )}

                    <hr className="my-2 border-[rgba(0,229,255,0.1)]" />

                    <div className="text-[0.7rem] leading-relaxed text-[#8892a8] max-h-[200px] overflow-hidden">
                        {/* We use the ACTUAL Shadow Doc or Docstring text provided in the API payload */}
                        {tooltip.content.shadow_doc ? (
                            <div className="line-clamp-6">
                                <span className="text-[#00e5ff] font-semibold">Clinical Data:</span><br />
                                {tooltip.content.shadow_doc}
                            </div>
                        ) : tooltip.content.docstring ? (
                            <div className="line-clamp-6">
                                <span className="text-[#00ff88] font-semibold">Raw Docstring:</span><br />
                                {tooltip.content.docstring}
                            </div>
                        ) : (
                            <div className="italic text-[#4a5568]">No documentation found. Click to generate Shadow Doc in panel.</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
