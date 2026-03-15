"use client";

import { useState, useEffect, useRef } from "react";
import GraphVisualizer from "./components/GraphVisualizer";
import HierarchicalGraph from "./components/HierarchicalGraph";
import ChatPanel from "./components/ChatPanel";
import RepoRootNode from "./components/RepoRootNode";
import CodeDirectory from "./components/CodeDirectory";
import MermaidDiagram from "./components/MermaidDiagram";
import ReactMarkdown from "react-markdown";

const API_URL = process.env.NEXT_PUBLIC_API_URL || (typeof window !== "undefined" ? `http://${window.location.hostname}:8000` : "http://localhost:8000");

export default function Home() {
  const [graphData, setGraphData] = useState(null);
  const [stats, setStats] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [fileContent, setFileContent] = useState("");
  const [loadingFile, setLoadingFile] = useState(false);
  const [generatingDoc, setGeneratingDoc] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState("graph"); // "graph" | "hierarchical" | "directory"
  const [graphMode, setGraphMode] = useState("macro"); // "macro" | "deep"
  const [umlCode, setUmlCode] = useState(null);
  const [generatingUml, setGeneratingUml] = useState(false);
  const [hierarchicalData, setHierarchicalData] = useState(null);
  const [highlightNodes, setHighlightNodes] = useState([]);
  const [interrogating, setInterrogating] = useState(false);
  const [currentTimestamp, setCurrentTimestamp] = useState(Date.now() / 1000);
  const [timeRange, setTimeRange] = useState({ min: 0, max: Date.now() / 1000 });
  const [agentLogs, setAgentLogs] = useState([]);
  const [autoFixProposal, setCrisprProposal] = useState(null);
  const [agentActive, setAgentActive] = useState(false);
  const [agentConnected, setAgentConnected] = useState(false);
  const [autoEvolve, setAutoEvolve] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [showUml, setShowUml] = useState(false);
  const [shadowNodes, setShadowNodes] = useState(new Set());
  const [timeline, setTimeline] = useState([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [nodeHistory, setNodeHistory] = useState([]);
  const [fetchingHistory, setFetchingHistory] = useState(false);
  const [visionResult, setVisionResult] = useState(null);
  const [capturingVision, setCapturingVision] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [analysisDismissed, setAnalysisDismissed] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [ingestOpen, setIngestOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState("navigation");
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideExpanded, setGuideExpanded] = useState(true);
  const [onboarded, setOnboarded] = useState(false);
  const [onboardingTransition, setOnboardingTransition] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const socketRef = useRef(null);
  const autoEvolveRef = useRef(false);
  const reconnectTimerRef = useRef(null);
  const pendingAgentRef = useRef(false);
  const lastSelectionRef = useRef(null);
  const lastAgentCountRef = useRef(0);


  // Refactored data fetching — now supports macro/deep graph modes
  const fetchGraphData = (mode) => {
    const m = mode || graphMode;
    setLoading(true);
    setError(null);
    fetch(`${API_URL}/api/graph?mode=${m}`)
      .then((r) => r.json())
      .then((data) => {
        setGraphData(data);
        if (m === "temporal" && data.nodes) {
          const timestamps = data.nodes
            .map(n => n.timestamp)
            .filter(t => t > 0);
          if (timestamps.length > 0) {
            const min = Math.min(...timestamps);
            const max = Math.max(...timestamps);
            setTimeRange({ min, max });
            setCurrentTimestamp(max);
          }
        }
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });

    fetch(`${API_URL}/api/stats`)
      .then((r) => r.json())
      .then(setStats)
      .catch(() => { });

    if (m === "temporal") {
      setLoadingTimeline(true);
      fetch(`${API_URL}/api/evolution/timeline?limit=100`)
        .then(r => r.json())
        .then(data => {
          setTimeline(data);
          setLoadingTimeline(false);
        })
        .catch(e => {
          console.error("Timeline fetch error", e);
          setLoadingTimeline(false);
        });
    }
  };

  // Fetch hierarchical data
  const fetchCellularData = () => {
    fetch(`${API_URL}/api/v1/graph/hierarchical`)
      .then((r) => r.json())
      .then((data) => setHierarchicalData(data))
      .catch((e) => console.error("Failed to fetch hierarchical data", e));
  };

  const fetchNodeHistory = (filePath) => {
    if (!filePath) return;
    setFetchingHistory(true);
    fetch(`${API_URL}/api/evolution/node_history?file_path=${encodeURIComponent(filePath)}`)
      .then(r => r.json())
      .then(data => {
        setNodeHistory(data);
        setFetchingHistory(false);
      })
      .catch(e => {
        console.error("Node history fetch error", e);
        setFetchingHistory(false);
      });
  };

  useEffect(() => {
    if (selectedNode?.file_path) {
      fetchNodeHistory(selectedNode.file_path);
    } else {
      setNodeHistory([]);
    }
  }, [selectedNode?.file_path]);

  useEffect(() => {
    autoEvolveRef.current = autoEvolve;
  }, [autoEvolve]);

  useEffect(() => {
    setShowCode(false);
    setShowUml(false);
  }, [selectedNode?.name]);

  useEffect(() => {
    if (!onboarded && graphData?.nodes?.length && !onboardingTransition) {
      setOnboardingTransition(true);
      const timer = setTimeout(() => {
        markOnboarded();
        setOnboardingTransition(false);
      }, 900);
      return () => clearTimeout(timer);
    }
  }, [graphData, onboarded, onboardingTransition]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const seen = window.localStorage.getItem("helix_guide_seen");
    if (!seen) {
      setGuideOpen(true);
    }
    const onboardedFlag = window.localStorage.getItem("helix_onboarded");
    setOnboarded(Boolean(onboardedFlag));
  }, []);

  useEffect(() => {
    const selectionName = selectedNode?.name || null;
    const selectionChanged = selectionName !== lastSelectionRef.current;
    const agentSignal = agentActive || Boolean(autoFixProposal);

    if (selectionChanged || agentSignal) {
      setAnalysisDismissed(false);
    }

    if (!analysisDismissed && (selectionChanged || agentSignal)) {
      if (selectedNode || agentSignal) {
        setAnalysisOpen(true);
      }
    }

    lastSelectionRef.current = selectionName;
  }, [selectedNode, agentActive, autoFixProposal, analysisDismissed]);


  const connectAgentSocket = () => {
    const wsUrl = API_URL.replace("http", "ws") + "/ws/agent_agent";
    if (socketRef.current?.readyState === WebSocket.OPEN || socketRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log("Connected to Agent System WebSocket");
      setAgentConnected(true);
      setAgentLogs(prev => [...prev, "✅ Agent link online."].slice(-50));
      if (pendingAgentRef.current) {
        pendingAgentRef.current = false;
        socket.send(JSON.stringify({ command: "DEPLOY_SWARM" }));
        setAgentActive(true);
      }
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "LOG") {
        setAgentLogs(prev => [...prev, data.message].slice(-50)); // Keep last 50 logs
      } else if (data.type === "CRISPR_PROPOSAL") {
        if (autoEvolveRef.current) {
          setAgentLogs((prev) =>
            [...prev, "⚡ Auto-Evolve override: applying patch..."].slice(-50)
          );
          acceptPatch(data);
        } else {
          setCrisprProposal(data);
        }
        setAgentActive(false);
      } else if (data.type === "SHADOW_VERIFY") {
        setShadowNodes(prev => {
          const next = new Set(prev);
          if (data.state === "START") {
            next.add(data.node);
          } else {
            next.delete(data.node);
          }
          return next;
        });
      } else if (data.type === "INGESTION_COMPLETE") {
        // Broadcasted from backend when ingestion finishes
        setAgentLogs(prev => [...prev, `✅ Repository digested: ${data.repo_url}`].slice(-50));
        fetchGraphData();
        fetchCellularData();
        // Dispatch a custom event so RepoRootNode can update its status
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("helix_ingestion_complete", { detail: data.repo_url }));
        }
      } else if (data.type === "INGESTION_FAILED") {
        setAgentLogs(prev => [...prev, `❌ Ingestion failed: ${data.error}`].slice(-50));
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("helix_ingestion_failed", { detail: data.error }));
        }
      }
    };

    socket.onclose = () => {
      console.log("Disconnected from Agent System WebSocket");
      setAgentConnected(false);
      setAgentLogs(prev => [...prev, "⚠️ Agent link lost. Reconnecting..."].slice(-50));
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      reconnectTimerRef.current = setTimeout(() => {
        connectAgentSocket();
      }, 1500);
    };

    socket.onerror = () => {
      setAgentConnected(false);
      socket.close();
    };

    socketRef.current = socket;
  };

  // Initialize WebSocket for Agent
  useEffect(() => {
    connectAgentSocket();
    fetchGraphData(graphMode);
    fetchCellularData();

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      socketRef.current?.close();
    };
  }, []);

  // Re-fetch when graph mode changes
  const handleGraphModeChange = (newMode) => {
    setGraphMode(newMode);
    fetchGraphData(newMode);
  };

  const loadFileContent = (node) => {
    if (node && node.file_path) {
      setLoadingFile(true);
      setFileContent("");
      fetch(`${API_URL}/api/file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_path: node.file_path,
          line_start: node.line_start || 0,
          line_end: node.line_end || 0
        })
      })
        .then(r => r.json())
        .then(data => {
          setFileContent(data.content || "No content available.");
          setLoadingFile(false);
        })
        .catch(() => {
          setFileContent("Failed to load file content.");
          setLoadingFile(false);
        });
    } else {
      setFileContent("");
    }
  };

  // Interrogation (agent-powered search for hierarchical view)
  const deployAgent = () => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      setAgentActive(true);
      setAgentLogs([]);
      setCrisprProposal(null);
      socketRef.current.send(JSON.stringify({ command: "DEPLOY_SWARM" }));
      return;
    }

    pendingAgentRef.current = true;
    setAgentLogs(prev => [...prev, "⚠️ Agent reconnecting... deploying on connect.", "ℹ️ Check API server and WebSocket endpoint if this persists."]);
    setAnalysisOpen(true);
    setAnalysisDismissed(false);
    connectAgentSocket();
  };

  const guideDiagram = `
flowchart TD
  A[Start: Ingest Repository] --> B[Sync & Index]
  B --> C[Explore Graph]
  C --> D[Neural Link: Ask Questions]
  C --> E[Select Node → Analysis]
  E --> F[Shadow Doc / UML]
  C --> G[Deploy Agent System]
  G --> H[Review Proposal]
  H --> I{Auto-Evolve?}
  I -->|Yes| J[Apply Patch]
  I -->|No| K[Accept / Reject]
  J --> L[Re-index & Observe]
  K --> L
  `;

  const closeGuide = () => {
    setGuideOpen(false);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("helix_guide_seen", "1");
    }
  };

  const beginGuide = () => {
    closeGuide();
    setIngestOpen(true);
  };

  const markOnboarded = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("helix_onboarded", "1");
    }
    setOnboarded(true);
  };

  const verifyPatch = async () => {
    if (!autoFixProposal) return;
    setAgentLogs(prev => [...prev, `🛡️ Sandbox: Initiating isolated staging for ${autoFixProposal.node}...`]);
    try {
      const res = await fetch(`${API_URL}/api/verify_patch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          node: autoFixProposal.node,
          proposal: autoFixProposal.proposal,
          file_path: autoFixProposal.file_path
        })
      });
      const data = await res.json();
      if (data.success) {
        setAgentLogs(prev => [...prev, "✅ Sandbox: Verification successful. Metrics: " + data.stability_score]);
      } else {
        setAgentLogs(prev => [...prev, "❌ Sandbox: Verification failed."]);
      }
    } catch (err) {
      setAgentLogs(prev => [...prev, "❌ Sandbox: Error during staging."]);
    }
  };

  const handleVisualDiagnostic = () => {
    setCapturingVision(true);
    setVisionResult(null);
    setAgentLogs(prev => [...prev, "👁️ Vision: Initiating high-fidelity UI phenotype capture..."].slice(-50));

    // 1. Capture UI
    fetch(`${API_URL}/api/vision/capture?url=${encodeURIComponent(window.location.origin)}`)
      .then(r => r.json())
      .then(data => {
        if (data.status === "success") {
          setAgentLogs(prev => [...prev, "🧬 Vision: Snapshot secured. Sequencing visual DNA..."].slice(-50));
          // 2. Analyze Vision
          return fetch(`${API_URL}/api/vision/analyze?path=${encodeURIComponent(data.path)}`);
        }
        throw new Error("Capture failed");
      })
      .then(r => r.json())
      .then(result => {
        setVisionResult(result);
        setCapturingVision(false);
        setAgentLogs(prev => [...prev, "✅ Vision: Diagnostic complete. Visual health score: " + result.score].slice(-50));
        setAnalysisOpen(true); // Open analysis panel to show results
      })
      .catch(e => {
        console.error("Vision diagnostic error", e);
        setCapturingVision(false);
        setAgentLogs(prev => [...prev, "❌ Vision: Diagnostic scan failed."].slice(-50));
      });
  };

  const acceptPatch = async (proposalOverride) => {
    const proposal = proposalOverride || autoFixProposal;
    if (!proposal) return;
    setAgentLogs(prev => [...prev, "🧬 AutoFix: Patch starting..."]);
    // Phase 3: AutoFix Implementation will go here
    try {
      const res = await fetch(`${API_URL}/api/accept_patch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          node: proposal.node,
          proposal: proposal.proposal,
          file_path: proposal.file_path
        })
      });
      const data = await res.json();
      if (data.success) {
        setAgentLogs(prev => [...prev, "✅ Patch Physical: Code successfully re-spliced."]);
        setCrisprProposal(null);
        fetchGraphData();
      } else {
        setAgentLogs(prev => [...prev, `❌ Patch Rejected: ${data.message || "Validation failed."}`]);
      }
    } catch (err) {
      setAgentLogs(prev => [...prev, "❌ Patch Failed: Splicing error."]);
    }
  };

  const handleInterrogate = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setInterrogating(true);
    setHighlightNodes([]);
    try {
      const res = await fetch(`${API_URL}/api/v1/interrogate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery }),
      });
      const data = await res.json();
      if (data.highlight_nodes) {
        setHighlightNodes(data.highlight_nodes);
      }
      if (data.answer) {
        setSearchResults([{ metadata: { name: "Agent Response" }, score: 1, answer: data.answer }]);
      }
    } catch (err) {
      console.error("Interrogation failed", err);
    } finally {
      setInterrogating(false);
    }
  };

  const handleChatResponse = (data) => {
    if (data.highlight_nodes && data.highlight_nodes.length > 0) {
      const firstEntity = data.highlight_nodes[0];
      // Find the node in our current graph data for camera traversal and info display
      const node = graphData?.nodes?.find(n => n.name === firstEntity);
      if (node) {
        setSelectedNode(node);
        loadFileContent(node);
      }
      setHighlightNodes(data.highlight_nodes);
    }
  };

  const handleGenerateShadowDoc = async (nodeName) => {
    if (generatingDoc) return;
    setGeneratingDoc(true);
    try {
      const res = await fetch(`${API_URL}/api/shadow_doc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nodeName })
      });
      const data = await res.json();
      if (data.doc) {
        setSelectedNode(prev => prev ? { ...prev, shadow_doc: data.doc } : prev);
        setGraphData(prev => {
          if (!prev) return prev;
          const newNodes = prev.nodes.map(n =>
            n.name === nodeName ? { ...n, shadow_doc: data.doc } : n
          );
          return { ...prev, nodes: newNodes };
        });
      }
    } catch (err) {
      console.error("Failed to generate shadow doc", err);
    } finally {
      setGeneratingDoc(false);
    }
  };

  const handleGenerateUml = async (nodeName) => {
    if (generatingUml) return;
    setGeneratingUml(true);
    setUmlCode(null);
    try {
      const res = await fetch(`${API_URL}/api/uml?name=${encodeURIComponent(nodeName)}`);
      const data = await res.json();
      if (data.mermaid) {
        setUmlCode(data.mermaid);
      }
    } catch (err) {
      console.error("Failed to generate UML diagram", err);
    } finally {
      setGeneratingUml(false);
    }
  };


  // Semantic search (uses interrogation in hierarchical view)
  const handleSearch = async (e) => {
    if (viewMode === "hierarchical") {
      return handleInterrogate(e);
    }
    e.preventDefault();
    if (!searchQuery.trim()) return;

    try {
      const res = await fetch(
        `${API_URL}/api/search?q=${encodeURIComponent(searchQuery)}`
      );
      const data = await res.json();
      setSearchResults(data.results || []);
    } catch {
      setSearchResults([]);
    }
  };



  const renderInfoPanel = () => {
    if (!selectedNode) return null;
    return (
      <div className="flex flex-col h-full gap-4 animate-fade-in">
        <div className="flex items-center justify-between">
          <span className={`helix-pill helix-pill-${selectedNode.type?.toLowerCase()}`}>
            {selectedNode.type || "Entity"}
          </span>
          <button
            onClick={() => {
              setSelectedNode(null);
              setUmlCode(null);
              setHighlightNodes([]);
              setFileContent("");
            }}
            className="text-muted hover:text-neon-pink transition-colors text-lg"
          >
            ✕
          </button>
        </div>

        <h3 className="text-neon-cyan text-lg font-mono font-bold break-all">
          {selectedNode.name}
        </h3>

        {selectedNode.docstring && (
          <p className="text-secondary text-sm leading-relaxed whitespace-pre-wrap">
            {selectedNode.docstring}
          </p>
        )}

        {selectedNode.file_path && (
          <div className="helix-panel-subtle">
            <p className="text-muted text-[10px] uppercase tracking-widest mb-1 flex justify-between">
              <span>File Path</span>
              {selectedNode.line_start > 0 && <span>Lines {selectedNode.line_start}–{selectedNode.line_end}</span>}
            </p>
            <p className="text-neon-emerald text-xs font-mono break-all leading-tight">
              {selectedNode.file_path}
            </p>
          </div>
        )}

        {/* Clinical Documentation (Shadow Doc) */}
        <div className="helix-panel-subtle flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <p className="text-neon-emerald text-[10px] uppercase tracking-widest font-bold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-neon-emerald animate-pulse"></span>
              Clinical Shadow Documentation
            </p>
            {!selectedNode.shadow_doc && (
              <button
                onClick={() => handleGenerateShadowDoc(selectedNode.name)}
                disabled={generatingDoc}
                className="helix-button-secondary"
              >
                {generatingDoc ? "Synthesizing..." : "Auto-Document"}
              </button>
            )}
          </div>

          {selectedNode.shadow_doc ? (
            <div className="prose prose-invert prose-sm max-w-none prose-headings:text-neon-cyan prose-strong:text-neon-cyan prose-a:text-neon-emerald prose-code:text-neon-pink text-xs text-gray-300 overflow-y-auto custom-scrollbar pr-2 max-h-[260px]">
              <ReactMarkdown>{selectedNode.shadow_doc}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-muted text-xs italic">
              {generatingDoc ? "Initiating Bio-Semantic scan... Querying Neo4j for structural context..." : "No clinical documentation found for this entity. Click to generate."}
            </p>
          )}
        </div>

        {/* Raw Code Content (Accordion) */}
        {selectedNode.file_path && (
          <div className="helix-accordion">
            <button
              className="helix-accordion-header"
              onClick={() => setShowCode(prev => !prev)}
            >
              <span>DNA Source</span>
              <span className="text-neon-cyan">{showCode ? "−" : "+"}</span>
            </button>
            {showCode && (
              <div className="helix-accordion-body">
                <p className="text-muted text-[10px] uppercase tracking-widest mb-2 flex justify-between">
                  <span>Raw Code</span>
                  {loadingFile && <span className="text-neon-cyan animate-pulse">Sequencing...</span>}
                </p>
                <pre className="text-[11px] font-mono text-gray-300 leading-relaxed overflow-x-auto">
                  <code>{fileContent}</code>
                </pre>
              </div>
            )}
          </div>
        )}

        {/* DNA Evolution History */}
        <div className="helix-panel-subtle flex flex-col gap-2">
          <p className="text-neon-cyan text-[10px] uppercase tracking-widest font-bold flex items-center gap-2">
            🧬 DNA Evolution Sequence
          </p>
          <div className="space-y-4 relative mt-2 pl-4 border-l border-white/10">
            {fetchingHistory ? (
              <p className="text-muted text-[10px] animate-pulse italic">Reconstructing history...</p>
            ) : nodeHistory.length > 0 ? (
              nodeHistory.map((h, i) => (
                <div key={h.hash} className="relative">
                  <span className="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-neon-cyan/30 border border-neon-cyan/50"></span>
                  <p className="text-[10px] text-white font-mono">{h.hash.substring(0, 8)}</p>
                  <p className="text-[9px] text-secondary line-clamp-1">{h.message}</p>
                  <p className="text-[8px] text-muted">{new Date(h.timestamp * 1000).toLocaleDateString()}</p>
                </div>
              ))
            ) : (
              <p className="text-muted text-[10px] italic">No historical patchs found.</p>
            )}
          </div>
        </div>

        {/* Architectural UML Diagram (Accordion) */}
        {(selectedNode.type === "Class" || selectedNode.type === "Module") && (
          <div className="helix-accordion">
            <button
              className="helix-accordion-header"
              onClick={() => setShowUml(prev => !prev)}
            >
              <span>Architectural UML</span>
              <span className="text-neon-purple">{showUml ? "−" : "+"}</span>
            </button>
            {showUml && (
              <div className="helix-accordion-body">
                <div className="flex justify-between items-center mb-3">
                  {!umlCode && (
                    <button
                      onClick={() => handleGenerateUml(selectedNode.name)}
                      disabled={generatingUml}
                      className="helix-button-secondary helix-button-secondary--purple"
                    >
                      {generatingUml ? "Mapping..." : "Generate UML"}
                    </button>
                  )}
                  {umlCode && (
                    <button
                      onClick={() => { setUmlCode(null); }}
                      className="text-muted hover:text-white transition-colors text-[10px] uppercase tracking-wider"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {umlCode ? (
                  <MermaidDiagram code={umlCode} />
                ) : (
                  <p className="text-muted text-xs italic">
                    {generatingUml ? "Scanning inheritance trees... Extracting method signatures..." : "Visualize structural relationships. Click to generate UML diagram."}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const isOnboarding = !onboarded;
  const seedActive = isOnboarding || onboardingTransition;
  const showDock = onboarded && !onboardingTransition;

  const progressStages = [
    {
      id: "ingest",
      label: "Ingest",
      description: "Connect a repository to seed the organism.",
      done: onboarded || Boolean(graphData),
    },
    {
      id: "explore",
      label: "Explore",
      description: "Select a node or traverse the graph.",
      done: Boolean(selectedNode) || highlightNodes.length > 0,
    },
    {
      id: "agent",
      label: "Agent",
      description: "Deploy the Agent System for analysis.",
      done: agentLogs.length > 0 || agentActive,
    },
  ];

  const seedGraphData = {
    nodes: [
      {
        id: "seed",
        name: "Initiate Helix",
        type: "Module",
        pagerank: 0,
        degree: 0,
      },
    ],
    links: [],
  };

  const agentDockDesc = agentConnected
    ? "Deploy autonomous healing"
    : "Agent offline — start API server";

  return (
    <main className="flex h-screen w-screen overflow-hidden bg-[#05080f] text-white font-sans">

      {/* ── Left Sidebar: Navigation & Controls ── */}
      {showDock && (
        <aside className="w-72 h-full border-r border-[#1a2332] bg-[#0a0f14]/80 backdrop-blur flex flex-col z-40 shrink-0">
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
            <Sidebar
              stats={stats}
              graphMode={graphMode}
              onGraphModeChange={handleGraphModeChange}
              onSettingsClick={() => setSettingsOpen(true)}
              onGuideClick={() => setGuideOpen(true)}
            />
          </div>
          <div className="h-1/3 border-t border-[#1a2332] overflow-hidden">
            <CodeDirectory
              onNodeSelect={(node) => {
                if (node.action === 'NAVIGATE') {
                  setViewMode("graph");
                  setSelectedNode(node);
                  loadFileContent(node);
                } else {
                  setSelectedNode(node);
                  setUmlCode(null);
                  loadFileContent(node);
                }
              }}
            />
          </div>
        </aside>
      )}

      {/* ── Center Stage: Main Visualization ── */}
      <section className="flex-1 relative h-full flex flex-col min-w-0">
        <div className="absolute top-4 left-4 z-50 pointer-events-none">
          {stats && (
            <div className="flex bg-[#0a0f14]/80 backdrop-blur border border-white/10 rounded-full px-4 py-2 gap-4 shadow-lg pointer-events-auto">
              <div className="text-xs font-mono"><span className="text-muted mr-2">NODES:</span><span className="text-neon-cyan">{stats.graph?.nodes || 0}</span></div>
              <div className="w-px bg-white/10" />
              <div className="text-xs font-mono"><span className="text-muted mr-2">EDGES:</span><span className="text-neon-emerald">{stats.graph?.relationships || 0}</span></div>
              <div className="w-px bg-white/10" />
              <div className="text-xs font-mono"><span className="text-muted mr-2">VECTORS:</span><span className="text-neon-purple">{stats.vectors?.points_count || 0}</span></div>
            </div>
          )}
        </div>

        {viewMode === "hierarchical" && hierarchicalData && (
          <div className="absolute inset-0 animate-fade-in bg-[radial-gradient(circle_at_center,_transparent_0%,_#05080f_100%)]">
            <HierarchicalGraph
              data={hierarchicalData}
              highlightNodes={highlightNodes}
              onNodeClick={(node) => {
                setSelectedNode(node);
                setUmlCode(null);
                loadFileContent(node);
              }}
            />
          </div>
        )}

        {viewMode === "graph" && (graphData || isOnboarding) && (
          <div className={`absolute inset-0 animate-fade-in ${seedActive ? "opacity-30" : ""}`}>
            <GraphVisualizer
              graphData={graphData || seedGraphData}
              focusedNode={selectedNode?.name}
              currentTimestamp={graphMode === "temporal" ? currentTimestamp : null}
              seedMode={isOnboarding}
              transitioning={onboardingTransition}
              shadowNodes={shadowNodes}
              onNodeClick={(node) => {
                if (isOnboarding) {
                  setGuideOpen(true);
                  return;
                }
                setSelectedNode(node);
                setUmlCode(null);
                loadFileContent(node);
              }}
            />

            {graphMode === "temporal" && (
              <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-[60%] z-50">
                <div className="bg-[#0a0f14]/80 backdrop-blur border border-neon-cyan/30 rounded-2xl p-4 shadow-[0_0_30px_rgba(0,229,255,0.1)] flex flex-col items-center gap-3">
                  <div className="flex justify-between w-full text-[10px] uppercase tracking-widest font-bold">
                    <span className="text-muted">{new Date(timeRange.min * 1000).toLocaleDateString()}</span>
                    <span className="text-neon-cyan drop-shadow-[0_0_8px_rgba(0,229,255,0.5)]">Evolutionary State: {new Date(currentTimestamp * 1000).toLocaleString()}</span>
                    <span className="text-muted">{new Date(timeRange.max * 1000).toLocaleDateString()}</span>
                  </div>
                  <input
                    type="range"
                    min={timeRange.min}
                    max={timeRange.max}
                    step={1}
                    value={currentTimestamp}
                    onChange={(e) => setCurrentTimestamp(Number(e.target.value))}
                    className="w-full cursor-pointer accent-neon-cyan bg-[#141a33] h-1.5 rounded-full appearance-none outline-none"
                  />
                  <p className="text-[9px] text-secondary uppercase tracking-[0.2em]">Scrub timeline to watch the organism evolve</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Loading Overlay */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-50 bg-[#05080f]/90 backdrop-blur-md">
            <div className="flex flex-col items-center">
              <div className="text-5xl mb-6 animate-pulse-glow drop-shadow-[0_0_15px_rgba(0,229,255,0.4)]">⬡</div>
              <h2 className="text-neon-cyan text-xl tracking-widest font-bold uppercase animate-pulse">Initializing Neural Map</h2>
              <div className="mt-4 flex flex-col items-center gap-2">
                <div className="w-48 h-1 bg-[#141a33] rounded-full overflow-hidden">
                  <div className="h-full bg-neon-cyan animate-[loading_2s_infinite]"></div>
                </div>
                <p className="text-muted text-[10px] uppercase tracking-widest">
                  Syncing structural metadata...
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Error Overlay */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center z-50 bg-[#05080f]/80 backdrop-blur-md">
            <div className="bg-[#0a0f14] p-8 max-w-md w-full border border-neon-pink/30 rounded-2xl shadow-[0_0_50px_rgba(255,0,102,0.1)] flex flex-col gap-4 text-center">
              <span className="text-4xl text-neon-pink">🚨</span>
              <h2 className="text-neon-pink tracking-widest uppercase font-bold text-lg">System Error</h2>
              <p className="text-sm text-gray-400 bg-red-900/10 p-3 rounded-lg border border-neon-pink/10">{error}</p>
              <button onClick={fetchGraphData} className="mt-4 w-full bg-neon-pink/10 hover:bg-neon-pink/20 text-neon-pink border border-neon-pink/50 py-2 rounded-lg transition-colors text-xs tracking-widest uppercase font-bold">
                Attempt Re-Link
              </button>
            </div>
          </div>
        )}

        {/* Floating Guide overlay */}
        {seedActive && !loading && !error && (
          <div className="absolute bottom-10 left-10 z-50 w-80 bg-[#0a0f14]/80 backdrop-blur border border-white/10 rounded-2xl p-6 shadow-xl text-center flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-neon-cyan/20 flex items-center justify-center border border-neon-cyan/30 text-2xl shadow-[0_0_20px_rgba(0,229,255,0.2)]">⬡</div>
            <h3 className="text-neon-cyan font-bold tracking-widest uppercase text-sm">Initiate System</h3>
            <p className="text-xs text-gray-400 leading-relaxed">Begin with ingestion to map the project architecture.</p>
            <div className="flex gap-2 w-full mt-2">
              <button className="flex-1 bg-neon-cyan text-[#05080f] font-bold text-[10px] uppercase tracking-widest py-2 rounded hover:bg-[#00b8cc] transition-colors" onClick={() => setGuideOpen(true)}>Start Ingestion</button>
            </div>
          </div>
        )}
      </section>

      {/* ── Right Sidebar: Context & Actions ── */}
      {showDock && (
        <aside className="w-[400px] h-full border-l border-[#1a2332] bg-[#0a0f14]/90 backdrop-blur z-40 flex flex-col shrink-0">

          {/* Top Panel: Agent Chat / Agent Log */}
          <div className="flex-1 border-b border-[#1a2332] overflow-hidden flex flex-col relative">
            <ChatPanel
              onChatResponse={handleChatResponse}
              onDeployAgent={deployAgent}
              agentActive={agentActive}
              agentConnected={agentConnected}
              agentLogs={agentLogs}
              crisprProposal={autoFixProposal}
            />

            {/* Agent Monologue overlay inside chat area */}
            {(agentActive || agentLogs.length > 0) && (
              <div className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t ${agentActive ? 'from-black/90 to-transparent' : 'from-[#05080f]/90 to-transparent'} pointer-events-none p-4 flex flex-col justify-end max-h-[150px]`}>
                <div className="pointer-events-auto bg-black/60 backdrop-blur-md border border-neon-cyan/20 p-3 rounded-xl max-h-[120px] overflow-y-auto custom-scrollbar shadow-[0_0_20px_rgba(0,229,255,0.05)]">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${agentActive ? 'bg-neon-cyan animate-ping' : 'bg-gray-500'}`}></span>
                      <span className={`text-[9px] uppercase tracking-widest font-bold ${agentActive ? 'text-neon-cyan' : 'text-gray-400'}`}>Agent System</span>
                    </div>
                    <button onClick={() => setAgentLogs([])} className="text-muted hover:text-white text-xs">✕</button>
                  </div>
                  <div className="space-y-1 font-mono text-[10px] text-gray-300">
                    {agentLogs.slice(-5).map((log, i) => (
                      <div key={i} className={`border-l pl-2 py-0.5 ${log.startsWith('❌') ? 'border-neon-pink text-neon-pink' : log.startsWith('✅') ? 'border-neon-emerald text-neon-emerald' : 'border-neon-cyan/30'}`}>{log}</div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Panel: Node Details / Interrogation Info */}
          <div className="h-[45%] overflow-y-auto custom-scrollbar p-0 bg-[#05080f]">
            {selectedNode ? (
              renderInfoPanel()
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-secondary opacity-30 space-y-4 p-8">
                <span className="text-4xl text-gray-700">⬡</span>
                <p className="text-xs font-mono tracking-widest uppercase text-center leading-relaxed">
                  Awaiting Entity Selection <br />
                  <span className="text-[10px] text-gray-600">Select a node to inspect architecture</span>
                </p>
              </div>
            )}
          </div>
        </aside>
      )}

      {/* ── AutoFix Proposal Modal ── */}
      {autoFixProposal && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0a0f14] p-6 border-2 border-neon-emerald rounded-2xl shadow-[0_0_50px_rgba(0,255,153,0.15)] w-[600px] animate-slide-up">
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-neon-emerald/20 flex items-center justify-center text-2xl shadow-[0_0_20px_rgba(0,255,153,0.3)] animate-pulse">🧬</div>
                <div>
                  <h2 className="text-neon-emerald font-bold uppercase tracking-widest text-lg">AutoFix Patch Proposal</h2>
                  <p className="text-xs text-secondary uppercase tracking-wider font-mono">Target Entity: {autoFixProposal.node}</p>
                </div>
              </div>
              <span className="px-2 py-1 bg-neon-emerald/20 text-neon-emerald border border-neon-emerald/40 rounded text-[10px] font-bold">HIGH CONFIDENCE</span>
            </div>

            <div className="bg-[#05080f] p-4 rounded-xl border border-white/5 mb-6">
              <p className="text-neon-cyan text-[10px] font-bold uppercase tracking-widest mb-2">Issue / Vulnerability</p>
              <p className="text-gray-400 text-xs mb-4 italic leading-relaxed bg-white/5 p-3 rounded">"{autoFixProposal.vulnerability}"</p>

              <p className="text-neon-emerald text-[10px] font-bold uppercase tracking-widest mb-2">Recommended Code Patch</p>
              <pre className="text-[11px] font-mono text-gray-300 bg-black/60 p-4 rounded border border-neon-emerald/20 overflow-x-auto max-h-48 custom-scrollbar">
                <code>{autoFixProposal.proposal}</code>
              </pre>
            </div>

            <div className="flex gap-4">
              <button onClick={() => setCrisprProposal(null)} className="flex-1 bg-transparent border border-white/20 hover:border-white/40 text-gray-300 hover:text-white py-3 rounded-xl transition-colors text-xs uppercase tracking-widest font-bold">
                Dismiss Proposal
              </button>
              <button onClick={verifyPatch} className="flex-1 bg-neon-purple/20 hover:bg-neon-purple/30 border border-neon-purple/50 text-neon-purple shadow-[0_0_15px_rgba(153,69,255,0.2)] py-3 rounded-xl transition-colors text-xs uppercase tracking-widest font-bold">
                🛡️ Sandbox Verify
              </button>
              <button onClick={acceptPatch} className="flex-1 bg-neon-emerald text-[#05080f] hover:bg-[#00db80] shadow-[0_0_20px_rgba(0,255,153,0.4)] py-3 rounded-xl transition-colors text-xs uppercase tracking-widest font-bold">
                Apply Patch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Guide Modal Overlay */}
      {guideOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-8 bg-black/80 backdrop-blur-md" onClick={closeGuide}>
          <div className="bg-[#0a0f14] max-w-4xl w-full h-[80vh] flex flex-col rounded-3xl border border-neon-cyan/20 shadow-[0_0_50px_rgba(0,229,255,0.1)] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-white/10 flex justify-between items-center bg-[#0d1117]">
              <h2 className="text-xl font-bold tracking-widest uppercase text-neon-cyan flex items-center gap-3">
                <span className="text-3xl">⬡</span> Helix Operator Manual
              </h2>
              <button onClick={closeGuide} className="text-muted hover:text-white text-xl">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-8 prose prose-invert prose-sm max-w-none prose-headings:text-white prose-p:text-gray-300">
              <h3>Code Architecture Intelligence</h3>
              <p>Helix processes repositories into conceptual network graphs. Use the Sidebar to navigate your codebase, track statistics, and manage configurations.</p>

              <div className="grid grid-cols-2 gap-6 mt-8">
                <div className="bg-[#141a22] p-5 rounded-2xl border border-white/5 hover:border-neon-cyan/30 transition-colors">
                  <h4 className="text-neon-cyan tracking-widest uppercase text-sm mb-2 font-bold">1. Ingestion</h4>
                  <p className="text-xs text-gray-400 mt-0 leading-relaxed">Provide a GitHub URL or local path. The Engine will dissect the repository and extract semantic connections.</p>
                </div>
                <div className="bg-[#141a22] p-5 rounded-2xl border border-white/5 hover:border-neon-purple/30 transition-colors">
                  <h4 className="text-neon-purple tracking-widest uppercase text-sm mb-2 font-bold">2. Exploration</h4>
                  <p className="text-xs text-gray-400 mt-0 leading-relaxed">Click on nodes to view metadata, source code, and AI-generated component diagrams.</p>
                </div>
                <div className="bg-[#141a22] p-5 rounded-2xl border border-white/5 hover:border-neon-pink/30 transition-colors">
                  <h4 className="text-neon-pink tracking-widest uppercase text-sm mb-2 font-bold">3. Neural Chat</h4>
                  <p className="text-xs text-gray-400 mt-0 leading-relaxed">Ask questions in the right sidebar. The AI will traverse the code graph to answer system-level queries.</p>
                </div>
                <div className="bg-[#141a22] p-5 rounded-2xl border border-white/5 hover:border-neon-emerald/30 transition-colors">
                  <h4 className="text-neon-emerald tracking-widest uppercase text-sm mb-2 font-bold">4. Agent System</h4>
                  <p className="text-xs text-gray-400 mt-0 leading-relaxed">Deploy the agent to detect vulnerabilities, propose fixes, and sandbox changes automatically.</p>
                </div>
              </div>

              <div className="mt-12">
                <h4 className="text-white tracking-widest uppercase text-sm mb-6 font-bold border-b border-white/10 pb-2">System Architecture Flow</h4>
                <div className="bg-[#05080f] p-6 rounded-2xl border border-white/5">
                  <MermaidDiagram code={guideDiagram} />
                </div>
              </div>
            </div>
            {seedActive && (
              <div className="p-6 bg-[#0d1117] border-t border-white/10 flex justify-end">
                <button onClick={beginGuide} className="bg-neon-cyan hover:bg-[#00b8cc] text-[#05080f] font-bold py-3 px-8 rounded-xl transition-colors tracking-widest uppercase text-xs">
                  Acknowledge & Start
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {settingsOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-8 bg-black/80 backdrop-blur-md" onClick={() => setSettingsOpen(false)}>
          <div className="bg-[#0a0f14] w-[450px] flex flex-col rounded-3xl border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-white/10 flex justify-between items-center bg-[#0d1117]">
              <h2 className="text-lg font-bold tracking-widest uppercase text-white flex items-center gap-3">
                System Configuration
              </h2>
              <button onClick={() => setSettingsOpen(false)} className="text-muted hover:text-white text-xl">✕</button>
            </div>

            <div className="p-8 space-y-8">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-sm font-bold text-white mb-1 uppercase tracking-widest">Autonomous Fixing</label>
                  <p className="text-xs text-muted">Allow agent to automatically apply patches</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const next = !autoEvolveRef.current;
                    autoEvolveRef.current = next;
                    setAgentLogs(prev => [...prev]);
                  }}
                  className={`relative w-12 h-6 rounded-full transition-colors ${autoEvolveRef.current ? "bg-neon-emerald/70 shadow-[0_0_10px_rgba(0,255,153,0.5)]" : "bg-white/10"}`}
                >
                  <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${autoEvolveRef.current ? "translate-x-6" : ""}`} />
                </button>
              </div>

              <div>
                <label className="block text-sm uppercase tracking-widest font-bold text-white mb-3">Graph Environment Density</label>
                <div className="flex flex-col gap-2">
                  <button className="flex items-center justify-between p-3 rounded-xl border border-neon-cyan/40 bg-neon-cyan/10 text-neon-cyan text-sm">
                    <span>Comfortable (Default)</span>
                    <span className="w-4 h-4 rounded-full bg-neon-cyan/50 flex flex-col justify-center items-center"><span className="w-2 h-2 rounded-full bg-neon-cyan"></span></span>
                  </button>
                  <button className="flex items-center justify-between p-3 rounded-xl border border-white/10 hover:border-white/30 text-gray-300 text-sm transition-colors">
                    <span>Terminal / Compact</span>
                    <span className="w-4 h-4 rounded-full bg-white/10"></span>
                  </button>
                </div>
              </div>
            </div>
            <div className="p-6 bg-[#0d1117] border-t border-white/10">
              <button onClick={() => setSettingsOpen(false)} className="w-full bg-white/10 hover:bg-white/20 text-white font-bold py-3 rounded-xl transition-colors tracking-widest uppercase text-xs">
                Save Parameters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Target Ingest Modal Overlay */}
      {ingestOpen && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md p-4" onClick={() => setIngestOpen(false)}>
          <div className="bg-[#0a0f14] w-[450px] flex flex-col rounded-3xl border border-neon-cyan/30 shadow-[0_0_50px_rgba(0,229,255,0.1)] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-white/10 flex justify-between items-center bg-[#0d1117]">
              <h2 className="text-sm font-bold tracking-widest uppercase text-neon-cyan flex items-center gap-3">
                Target Sequence Acquisition
              </h2>
              <button onClick={() => setIngestOpen(false)} className="text-muted hover:text-white text-lg">✕</button>
            </div>
            <div className="p-6">
              <RepoRootNode
                onSyncComplete={() => {
                  fetchGraphData();
                  markOnboarded();
                  setTimeout(() => { setIngestOpen(false); }, 1500);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function LegendItem({ color, label }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="w-3 h-3 rounded-full"
        style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}55` }}
      />
      <span className="text-secondary text-xs">{label}</span>
    </div>
  );
}
