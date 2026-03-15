"use client";

import { useEffect, useRef } from "react";
import mermaid from "mermaid";

mermaid.initialize({
    startOnLoad: false,
    theme: "dark",
    securityLevel: "loose",
    fontFamily: "var(--font-geist-mono)",
    themeVariables: {
        primaryColor: "#00e5ff",
        primaryTextColor: "#fff",
        primaryBorderColor: "#00e5ff",
        lineColor: "#9945ff",
        secondaryColor: "#00ff88",
        tertiaryColor: "#0a0f14"
    }
});

export default function MermaidDiagram({ code }) {
    const containerRef = useRef(null);

    useEffect(() => {
        if (code && containerRef.current) {
            // Clear previous content
            containerRef.current.innerHTML = '<div class="animate-pulse text-neon-cyan text-[10px] uppercase tracking-widest p-4">Synthesizing SVG...</div>';

            const renderDiagram = async () => {
                try {
                    const id = `mermaid-${Math.floor(Math.random() * 1000000)}`;
                    // Adding a small delay to ensure container is ready
                    const { svg } = await mermaid.render(id, code);
                    if (containerRef.current) {
                        containerRef.current.innerHTML = svg;

                        // Adjust SVG sizing for better responsiveness
                        const svgElement = containerRef.current.querySelector('svg');
                        if (svgElement) {
                            svgElement.style.maxWidth = "100%";
                            svgElement.style.height = "auto";
                        }
                    }
                } catch (err) {
                    console.error("Mermaid rendering failed", err);
                    if (containerRef.current) {
                        containerRef.current.innerHTML = `
              <div class="text-neon-pink text-xs p-4 flex flex-col items-center">
                <span>⚠️ UML SYNTHESIS ERROR</span>
                <span class="text-[10px] text-muted mt-2">Invalid structure detected in graph relationships.</span>
              </div>
            `;
                    }
                }
            };

            // Delay render slightly to avoid race conditions with React's DOM updates
            const timer = setTimeout(renderDiagram, 50);
            return () => clearTimeout(timer);
        }
    }, [code]);

    return (
        <div
            ref={containerRef}
            className="mermaid-container w-full overflow-x-auto py-6 flex justify-center bg-[rgba(0,0,0,0.5)] rounded-xl border border-[rgba(255,255,255,0.05)] shadow-inner transition-all duration-500"
        />
    );
}
