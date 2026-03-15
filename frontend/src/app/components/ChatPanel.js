"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";

export default function ChatPanel({ onResponse, showHeader = true }) {
    const [messages, setMessages] = useState([
        {
            role: "assistant",
            content:
                "Hello! I am Helix, your Cyber-Bio codebase agent. \n\nI can navigate the Neo4j Graph and Qdrant Vectors to answer questions about this codebase. Ask me things like:\n\n- *Tell me how the parsing flow works.*\n- *What happens if I delete `python_parser.py`?*\n- *Where is the logic for semantic search?*",
        },
    ]);
    const [input, setInput] = useState("");
    const [isTyping, setIsTyping] = useState(false);
    const messagesEndRef = useRef(null);

    const API_URL = process.env.NEXT_PUBLIC_API_URL || (typeof window !== "undefined" ? `http://${window.location.hostname}:8000` : "http://localhost:8000");

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isTyping]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!input.trim() || isTyping) return;

        const userMessage = input.trim();
        setInput("");
        setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
        setIsTyping(true);

        try {
            const res = await fetch(`${API_URL}/api/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query: userMessage }),
            });

            const data = await res.json();

            if (data.error) {
                setMessages((prev) => [
                    ...prev,
                    { role: "assistant", content: `❌ **Error:** ${data.error}` },
                ]);
            } else {
                setMessages((prev) => [
                    ...prev,
                    { role: "assistant", content: data.response },
                ]);
                if (onResponse) onResponse(data);
            }
        } catch (err) {
            setMessages((prev) => [
                ...prev,
                {
                    role: "assistant",
                    content: `❌ **Connection Error:** Could not reach the Helix brain at ${API_URL}. Is \`python api/server.py\` running?`,
                },
            ]);
        } finally {
            setIsTyping(false);
        }
    };

    return (
        <div className="flex flex-col h-full w-full overflow-hidden">
            {showHeader && (
                <div className="bg-surface px-5 py-3 border-b border-[rgba(0,229,255,0.1)] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-neon-emerald animate-pulse"></div>
                        <span className="text-neon-cyan font-mono text-xs uppercase tracking-widest font-bold">
                            Neural Link Active
                        </span>
                    </div>
                </div>
            )}

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-5 pb-2 min-h-0">
                {messages.map((msg, i) => (
                    <div
                        key={i}
                        className={`mb-4 flex ${msg.role === "user" ? "justify-end" : "justify-start"
                            }`}
                    >
                        <div
                            className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${msg.role === "user"
                                ? "bg-[rgba(0,229,255,0.15)] border border-[rgba(0,229,255,0.3)] text-neon-cyan rounded-tr-sm"
                                : "bg-elevated border border-[rgba(153,69,255,0.2)] text-text-primary rounded-tl-sm prose prose-invert prose-sm prose-pre:bg-surface prose-pre:border prose-pre:border-[rgba(255,255,255,0.1)] prose-a:text-neon-cyan max-w-full"
                                }`}
                        >
                            {msg.role === "user" ? (
                                msg.content
                            ) : (
                                <ReactMarkdown>{msg.content}</ReactMarkdown>
                            )}
                        </div>
                    </div>
                ))}

                {isTyping && (
                    <div className="mb-4 flex justify-start">
                        <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-elevated border border-[rgba(153,69,255,0.2)] px-4 py-3 text-sm text-secondary flex items-center gap-2">
                            <span className="w-1.5 h-1.5 bg-neon-purple rounded-full animate-bounce"></span>
                            <span
                                className="w-1.5 h-1.5 bg-neon-purple rounded-full animate-bounce"
                                style={{ animationDelay: "0.15s" }}
                            ></span>
                            <span
                                className="w-1.5 h-1.5 bg-neon-purple rounded-full animate-bounce"
                                style={{ animationDelay: "0.3s" }}
                            ></span>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-surface border-t border-[rgba(0,229,255,0.1)]">
                <form onSubmit={handleSubmit} className="relative">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        disabled={isTyping}
                        placeholder="Interrogate the codebase..."
                        className="w-full bg-elevated border border-[rgba(153,69,255,0.3)] rounded-xl py-3 pl-4 pr-12 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-neon-purple focus:ring-1 focus:ring-neon-purple transition-all disabled:opacity-50"
                    />
                    <button
                        type="submit"
                        disabled={!input.trim() || isTyping}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-neon-cyan hover:text-neon-emerald disabled:opacity-30 transition-colors"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <line x1="22" y1="2" x2="11" y2="13"></line>
                            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                        </svg>
                    </button>
                </form>
            </div>
        </div>
    );
}
