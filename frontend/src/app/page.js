"use client";

import { useState, useEffect, useRef } from "react";
import GraphVisualizer from "./components/GraphVisualizer";
import CellularGraph from "./components/CellularGraph";
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
  const [viewMode, setViewMode] = useState("graph"); // "graph" | "cellular" | "directory"
  const [graphMode, setGraphMode] = useState("macro"); // "macro" | "deep"
  const [umlCode, setUmlCode] = useState(null);
  const [generatingUml, setGeneratingUml] = useState(false);
  const [cellularData, setCellularData] = useState(null);
  const [highlightNodes, setHighlightNodes] = useState([]);
  const [interrogating, setInterrogating] = useState(false);
  const [currentTimestamp, setCurrentTimestamp] = useState(Date.now() / 1000);
  const [timeRange, setTimeRange] = useState({ min: 0, max: Date.now() / 1000 });
  const [swarmLogs, setSwarmLogs] = useState([]);
  const [crisprProposal, setCrisprProposal] = useState(null);
  const [swarmActive, setSwarmActive] = useState(false);
  const [swarmConnected, setSwarmConnected] = useState(false);
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
  const pendingSwarmRef = useRef(false);
  const lastSelectionRef = useRef(null);
  const lastSwarmCountRef = useRef(0);


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

  // Fetch cellular data
  const fetchCellularData = () => {
    fetch(`${API_URL}/api/v1/graph/cellular`)
      .then((r) => r.json())
      .then((data) => setCellularData(data))
      .catch((e) => console.error("Failed to fetch cellular data", e));
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
    const swarmSignal = swarmActive || Boolean(crisprProposal);

    if (selectionChanged || swarmSignal) {
      setAnalysisDismissed(false);
    }

    if (!analysisDismissed && (selectionChanged || swarmSignal)) {
      if (selectedNode || swarmSignal) {
        setAnalysisOpen(true);
      }
    }

    lastSelectionRef.current = selectionName;
  }, [selectedNode, swarmActive, crisprProposal, analysisDismissed]);


  const connectSwarmSocket = () => {
    const wsUrl = API_URL.replace("http", "ws") + "/ws/immune_swarm";
    if (socketRef.current?.readyState === WebSocket.OPEN || socketRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log("Connected to Immune Swarm WebSocket");
      setSwarmConnected(true);
      setSwarmLogs(prev => [...prev, "✅ Swarm link online."].slice(-50));
      if (pendingSwarmRef.current) {
        pendingSwarmRef.current = false;
        socket.send(JSON.stringify({ command: "DEPLOY_SWARM" }));
        setSwarmActive(true);
      }
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "LOG") {
        setSwarmLogs(prev => [...prev, data.message].slice(-50)); // Keep last 50 logs
      } else if (data.type === "CRISPR_PROPOSAL") {
        if (autoEvolveRef.current) {
          setSwarmLogs((prev) =>
            [...prev, "⚡ Auto-Evolve override: applying mutation..."].slice(-50)
          );
          acceptMutation(data);
        } else {
          setCrisprProposal(data);
        }
        setSwarmActive(false);
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
      }
    };

    socket.onclose = () => {
      console.log("Disconnected from Immune Swarm WebSocket");
      setSwarmConnected(false);
      setSwarmLogs(prev => [...prev, "⚠️ Swarm link lost. Reconnecting..."].slice(-50));
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      reconnectTimerRef.current = setTimeout(() => {
        connectSwarmSocket();
      }, 1500);
    };

    socket.onerror = () => {
      setSwarmConnected(false);
      socket.close();
    };

    socketRef.current = socket;
  };

  // Initialize WebSocket for Swarm
  useEffect(() => {
    connectSwarmSocket();
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

  // Interrogation (agent-powered search for cellular view)
  const deploySwarm = () => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      setSwarmActive(true);
      setSwarmLogs([]);
      setCrisprProposal(null);
      socketRef.current.send(JSON.stringify({ command: "DEPLOY_SWARM" }));
      return;
    }

    pendingSwarmRef.current = true;
    setSwarmLogs(prev => [...prev, "⚠️ Swarm reconnecting... deploying on connect.", "ℹ️ Check API server and WebSocket endpoint if this persists."]);
    setAnalysisOpen(true);
    setAnalysisDismissed(false);
    connectSwarmSocket();
  };

  const guideDiagram = `
flowchart TD
  A[Start: Ingest Repository] --> B[Sync & Index]
  B --> C[Explore Graph]
  C --> D[Neural Link: Ask Questions]
  C --> E[Select Node → Analysis]
  E --> F[Shadow Doc / UML]
  C --> G[Deploy Immune Swarm]
  G --> H[Review Proposal]
  H --> I{Auto-Evolve?}
  I -->|Yes| J[Apply Mutation]
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

  const verifyMutation = async () => {
    if (!crisprProposal) return;
    setSwarmLogs(prev => [...prev, `🛡️ Sandbox: Initiating isolated staging for ${crisprProposal.node}...`]);
    try {
      const res = await fetch(`${API_URL}/api/verify_mutation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          node: crisprProposal.node,
          proposal: crisprProposal.proposal,
          file_path: crisprProposal.file_path
        })
      });
      const data = await res.json();
      if (data.success) {
        setSwarmLogs(prev => [...prev, "✅ Sandbox: Verification successful. Metrics: " + data.stability_score]);
      } else {
        setSwarmLogs(prev => [...prev, "❌ Sandbox: Verification failed."]);
      }
    } catch (err) {
      setSwarmLogs(prev => [...prev, "❌ Sandbox: Error during staging."]);
    }
  };

  const handleVisualDiagnostic = () => {
    setCapturingVision(true);
    setVisionResult(null);
    setSwarmLogs(prev => [...prev, "👁️ Vision: Initiating high-fidelity UI phenotype capture..."].slice(-50));

    // 1. Capture UI
    fetch(`${API_URL}/api/vision/capture?url=${encodeURIComponent(window.location.origin)}`)
      .then(r => r.json())
      .then(data => {
        if (data.status === "success") {
          setSwarmLogs(prev => [...prev, "🧬 Vision: Snapshot secured. Sequencing visual DNA..."].slice(-50));
          // 2. Analyze Vision
          return fetch(`${API_URL}/api/vision/analyze?path=${encodeURIComponent(data.path)}`);
        }
        throw new Error("Capture failed");
      })
      .then(r => r.json())
      .then(result => {
        setVisionResult(result);
        setCapturingVision(false);
        setSwarmLogs(prev => [...prev, "✅ Vision: Diagnostic complete. Visual health score: " + result.score].slice(-50));
        setAnalysisOpen(true); // Open analysis panel to show results
      })
      .catch(e => {
        console.error("Vision diagnostic error", e);
        setCapturingVision(false);
        setSwarmLogs(prev => [...prev, "❌ Vision: Diagnostic scan failed."].slice(-50));
      });
  };

  const acceptMutation = async (proposalOverride) => {
    const proposal = proposalOverride || crisprProposal;
    if (!proposal) return;
    setSwarmLogs(prev => [...prev, "🧬 CRISPR: Mutation starting..."]);
    // Phase 3: CRISPR Implementation will go here
    try {
      const res = await fetch(`${API_URL}/api/accept_mutation`, {
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
        setSwarmLogs(prev => [...prev, "✅ Mutation Physical: Code successfully re-spliced."]);
        setCrisprProposal(null);
        fetchGraphData();
      } else {
        setSwarmLogs(prev => [...prev, `❌ Mutation Rejected: ${data.message || "Validation failed."}`]);
      }
    } catch (err) {
      setSwarmLogs(prev => [...prev, "❌ Mutation Failed: Splicing error."]);
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


  // Semantic search (uses interrogation in cellular view)
  const handleSearch = async (e) => {
    if (viewMode === "cellular") {
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
              <p className="text-muted text-[10px] italic">No historical mutations found.</p>
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
      id: "swarm",
      label: "Swarm",
      description: "Deploy the Immune Swarm for analysis.",
      done: swarmLogs.length > 0 || swarmActive,
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

  const swarmDockDesc = swarmConnected
    ? "Deploy autonomous healing"
    : "Swarm offline — start API server";

  return (
    <main className="helix-layout">
      {/* ── Main Stage (Graph/Cellular/Directory) ── */}
      <section className="helix-stage">
        {viewMode === "cellular" && cellularData && (
          <div className="absolute inset-0 animate-fade-in">
            <CellularGraph
              data={cellularData}
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
          <div className={`absolute inset-0 animate-fade-in helix-graph-layer ${seedActive ? "helix-graph-layer--onboarding" : ""}`}>
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
              <div className="absolute bottom-24 left-1/2 -translate-x-1/2 w-[60%] z-50">
                <div className="helix-panel p-5 flex flex-col items-center gap-3">
                  <div className="flex justify-between w-full text-[10px] uppercase tracking-widest font-bold">
                    <span className="text-muted">{new Date(timeRange.min * 1000).toLocaleDateString()}</span>
                    <span className="text-neon-cyan">Evolutionary State: {new Date(currentTimestamp * 1000).toLocaleString()}</span>
                    <span className="text-muted">{new Date(timeRange.max * 1000).toLocaleDateString()}</span>
                  </div>
                  <input
                    type="range"
                    min={timeRange.min}
                    max={timeRange.max}
                    step={1}
                    value={currentTimestamp}
                    onChange={(e) => setCurrentTimestamp(Number(e.target.value))}
                    className="w-full cursor-pointer accent-neon-cyan bg-[#141a33] h-1 rounded-full appearance-none"
                  />
                  <p className="text-[9px] text-secondary uppercase tracking-[0.2em]">Scrub timeline to watch the organism evolve</p>
                </div>
              </div>
            )}
          </div>
        )}

        {showDock && (
          <aside className={`helix-wing-left ${sidebarOpen ? "is-open" : "is-collapsed"}`}>
            <div className="helix-wing-toggle">
              <button
                className="helix-icon-button"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                title={sidebarOpen ? "Collapse Directory" : "Expand Directory"}
              >
                {sidebarOpen ? "⇠" : "🧬"}
              </button>
            </div>
            <div className="helix-wing-content h-full flex flex-col">
              <div className="h-full helix-panel overflow-hidden">
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
            </div>
          </aside>
        )}

        {/* Overlays (Loading/Error/Search Results) */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-50 bg-[#050510]/80 backdrop-blur-sm">
            <div className="text-center animate-slide-up">
              <div className="text-5xl mb-6 animate-pulse-glow drop-shadow-[0_0_15px_rgba(0,229,255,0.4)]">🧬</div>
              <h2 className="text-neon-cyan text-xl font-bold tracking-widest uppercase">
                Initializing Neural Map
              </h2>
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

        {error && (
          <div className="absolute inset-0 flex items-center justify-center z-50 bg-[#050510]/80 backdrop-blur-sm">
            <div className="helix-panel p-8 max-w-md text-center border-t-2 border-neon-pink">
              <div className="text-4xl mb-4">🚨</div>
              <h2 className="text-neon-pink text-lg font-bold uppercase tracking-widest mb-2">
                Neural Link Severed
              </h2>
              <p className="text-secondary text-sm mb-6 leading-relaxed bg-[#1a0f1e] p-3 rounded-lg border border-neon-pink/20">
                {error}
              </p>
              <div className="text-left space-y-2 mb-6">
                <p className="text-muted text-[10px] uppercase tracking-widest">Diagnostic Steps:</p>
                <div className="text-[11px] font-mono text-gray-400 space-y-1">
                  <p>1. Ensure Neo4j & Qdrant are active</p>
                  <p>2. Verify API server: <span className="text-neon-emerald">python api/server.py</span></p>
                  <p>3. Check .env configuration</p>
                </div>
              </div>
              <button
                onClick={() => fetchGraphData()}
                className="helix-button-secondary helix-button-secondary--pink w-full"
              >
                Attempt Re-Link
              </button>
            </div>
          </div>
        )}
      </section>

      {seedActive && !loading && !error && (
        <div className={`helix-seed-overlay ${onboardingTransition ? "is-exiting" : ""}`}>
          <div className="helix-seed-card">
            <button
              className="helix-seed-node"
              onClick={() => {
                setGuideOpen(true);
              }}
              aria-label="Initiate Helix"
            >
              <span className="helix-seed-core"></span>
              <span className="helix-seed-label">Initiate Helix</span>
            </button>
            <p className="helix-seed-text">
              Begin with ingestion to grow the organism. The flow guide will open your next steps.
            </p>
            <div className="helix-seed-actions">
              <button className="helix-button-primary" onClick={beginGuide}>
                Start With Ingestion
              </button>
              <button className="helix-button-secondary" onClick={() => setGuideOpen(true)}>
                Open Flow Guide
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Top HUD ── */}
      {showDock && stats && (
        <div className="helix-hud helix-hud-floating">
          <div className="hud-metric">
            <span className="label">SYMBOLS:</span>
            <span className="value">{stats.graph?.nodes || 0}</span>
          </div>
          <div className="hud-divider" />
          <div className="hud-metric">
            <span className="label">SYNAPSES:</span>
            <span className="value">{stats.graph?.relationships || 0}</span>
          </div>
          <div className="hud-divider" />
          <div className="hud-metric">
            <span className="label">VECTORS:</span>
            <span className="value">{stats.vectors?.points_count || 0}</span>
          </div>
        </div>
      )}

      {showDock && stats && (
        <div className="helix-system-status">
          <span className="label">SYSTEM ACTIVE</span>
          <span className="value">{stats.graph?.nodes || 0} nodes</span>
        </div>
      )}

      {/* ── Analysis Overlay (Ghost UI) ── */}
      {analysisOpen && (selectedNode || swarmLogs.length > 0 || swarmActive) && (
        <div className="helix-overlay helix-overlay--analysis" onClick={() => { setAnalysisOpen(false); setAnalysisDismissed(true); }}>
          <div className="helix-overlay-panel helix-overlay-panel--analysis" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] uppercase tracking-widest text-muted font-bold">Analysis & Output</p>
              <button
                onClick={() => { setAnalysisOpen(false); setAnalysisDismissed(true); }}
                className="helix-icon-button"
                aria-label="Close analysis"
              >
                ✕
              </button>
            </div>

            {selectedNode && renderInfoPanel()}

            {visionResult && (
              <div className="helix-panel-subtle animate-fade-in mb-4">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[10px] text-neon-purple uppercase tracking-widest font-bold flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-neon-purple animate-pulse"></span>
                    Visual Phenotype Diagnostic
                  </p>
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] text-muted font-mono uppercase">Health Score</span>
                    <span className={`text-xl font-bold font-mono ${visionResult.score > 80 ? 'text-neon-emerald' : visionResult.score > 50 ? 'text-neon-yellow' : 'text-neon-pink'}`}>
                      {visionResult.score}%
                    </span>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <span className="text-[9px] text-muted uppercase tracking-widest block mb-1">Aesthetic Rating</span>
                    <p className="text-secondary text-xs font-bold text-white italic">"{visionResult.aesthetic_rating}"</p>
                  </div>

                  {visionResult.anomalies && visionResult.anomalies.length > 0 && (
                    <div>
                      <span className="text-[9px] text-muted uppercase tracking-widest block mb-2">Structural Anomalies</span>
                      <ul className="space-y-1">
                        {visionResult.anomalies.map((anomaly, i) => (
                          <li key={i} className="text-[10px] text-neon-pink flex gap-2">
                            <span>⚠</span> <span>{anomaly}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {visionResult.suggestions && visionResult.suggestions.length > 0 && (
                    <div>
                      <span className="text-[9px] text-muted uppercase tracking-widest block mb-2">Refinement Suggestions</span>
                      <ul className="space-y-1">
                        {visionResult.suggestions.map((suggestion, i) => (
                          <li key={i} className="text-[10px] text-neon-cyan flex gap-2">
                            <span>🧬</span> <span>{suggestion}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {swarmActive && (
              <div className="helix-panel-subtle">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] text-neon-cyan uppercase tracking-widest font-bold flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${swarmActive ? 'bg-neon-cyan animate-ping' : 'bg-secondary'}`}></span>
                    Immune Swarm Monologue
                  </p>
                  <button onClick={() => setSwarmLogs([])} className="text-muted hover:text-white transition-colors text-xs">✕</button>
                </div>
                <div className="max-h-56 overflow-y-auto custom-scrollbar pr-2 space-y-1">
                  {swarmLogs.map((log, i) => (
                    <p key={i} className="text-[10px] font-mono text-gray-300 leading-tight">
                      {log.startsWith('❌') ? <span className="text-neon-pink">{log}</span> :
                        log.startsWith('✅') ? <span className="text-neon-emerald">{log}</span> :
                          log.startsWith('🔍') ? <span className="text-neon-cyan">{log}</span> : log}
                    </p>
                  ))}
                  <div id="swarm-logs-bottom"></div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── CRISPR Proposal Card ── */}
      {crisprProposal && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[60] w-[500px] animate-slide-up">
          <div className="helix-panel p-6 border-2 border-neon-cyan">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-neon-emerald/20 flex items-center justify-center text-2xl animate-pulse">🧬</div>
              <div>
                <h2 className="text-neon-emerald font-bold uppercase tracking-widest text-lg">CRISPR Mutation Proposal</h2>
                <p className="text-[10px] text-secondary uppercase tracking-wider">Target Entity: {crisprProposal.node}</p>
              </div>
            </div>

            <div className="bg-[#0a0f14] p-4 rounded-xl border border-neon-cyan/20 mb-6 max-h-60 overflow-y-auto custom-scrollbar">
              <p className="text-neon-cyan text-[11px] font-bold uppercase mb-2">Genetic Vulnerability Detected:</p>
              <p className="text-gray-400 text-xs mb-4 italic">"{crisprProposal.vulnerability.substring(0, 200)}..."</p>

              <p className="text-neon-emerald text-[11px] font-bold uppercase mb-2">Recommended DNA Slice (Mutation):</p>
              <pre className="text-[10px] font-mono text-gray-300 bg-black/40 p-3 rounded border border-white/5 overflow-x-auto">
                <code>{crisprProposal.proposal}</code>
              </pre>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={verifyMutation}
                className="w-full helix-button-secondary py-3 text-xs border-neon-purple text-neon-purple hover:bg-neon-purple/10"
              >
                🛡️ Verify in Sandbox (Shadow Staging)
              </button>
              <div className="flex gap-4">
                <button
                  onClick={acceptMutation}
                  className="flex-1 helix-button-primary py-3 text-xs"
                >
                  Accept & Splicing DNA
                </button>
                <button
                  onClick={() => setCrisprProposal(null)}
                  className="flex-1 helix-button-secondary py-3 text-xs"
                >
                  Reject Mutation
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Ghost Dock ── */}
      {showDock && (
        <div className="helix-dock-zone">
          <div className="helix-dock">
            <button
              className="helix-dock-item"
              onClick={() => setIngestOpen(true)}
              aria-label="Ingestion"
              data-label="Ingestion"
              data-desc="Target a new repository"
              title="Ingestion"
            >
              ⌂
            </button>
            <button
              className="helix-dock-item"
              onClick={() => { setSettingsSection("navigation"); setSettingsOpen(true); }}
              aria-label="Navigation"
              data-label="Navigation"
              data-desc="Switch graph perspectives"
              title="Navigation"
            >
              ⊙
            </button>
            <button
              className="helix-dock-item"
              onClick={() => setChatOpen(true)}
              aria-label="Neural Link"
              data-label="Neural Link"
              data-desc="Interrogate the codebase"
              title="Neural Link"
            >
              🧠
            </button>
            <button
              className={`helix-dock-item helix-dock-item--primary ${swarmConnected ? "" : "helix-dock-item--offline"}`}
              onClick={deploySwarm}
              disabled={swarmActive}
              aria-label="Immune Swarm"
              data-label="Immune Swarm"
              data-desc={swarmDockDesc}
              title="Immune Swarm"
            >
              🧬
            </button>
            <button
              className="helix-dock-item"
              onClick={() => { setSettingsSection("environment"); setSettingsOpen(true); }}
              aria-label="Environment"
              data-label="Environment"
              data-desc="Adjust depth & filters"
              title="Environment"
            >
              ⚙
            </button>
          </div>
        </div>
      )}

      {/* ── Overlays ── */}
      {chatOpen && (
        <div className="helix-overlay" onClick={() => setChatOpen(false)}>
          <div className="helix-overlay-panel helix-overlay-panel--chat" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] uppercase tracking-widest text-muted font-bold">Neural Link</p>
              <button onClick={() => setChatOpen(false)} className="helix-icon-button">✕</button>
            </div>
            <div className="helix-progress-map">
              <p className="text-[10px] uppercase tracking-widest text-muted font-bold">Progress Map</p>
              <div className="helix-progress-list">
                {progressStages.map((stage) => (
                  <div key={stage.id} className={`helix-progress-item ${stage.done ? "is-done" : ""}`}>
                    <span className="helix-progress-dot" />
                    <div className="helix-progress-copy">
                      <span className="helix-progress-title">{stage.label}</span>
                      <span className="helix-progress-desc">{stage.description}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <ChatPanel onResponse={handleChatResponse} showHeader={false} />
          </div>
        </div>
      )}

      {ingestOpen && (
        <div className="helix-overlay" onClick={() => setIngestOpen(false)}>
          <div className="helix-overlay-panel helix-overlay-panel--sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] uppercase tracking-widest text-muted font-bold">Target Sequence</p>
              <button onClick={() => setIngestOpen(false)} className="helix-icon-button">✕</button>
            </div>
            <RepoRootNode
              onSyncComplete={() => {
                fetchGraphData();
                markOnboarded();
                setGuideExpanded(true);
                setGuideOpen(true);
              }}
            />
          </div>
        </div>
      )}

      {settingsOpen && (
        <div className="helix-overlay" onClick={() => setSettingsOpen(false)}>
          <div className="helix-overlay-panel" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] uppercase tracking-widest text-muted font-bold">Settings</p>
              <button onClick={() => setSettingsOpen(false)} className="helix-icon-button">✕</button>
            </div>
            <div className="flex flex-col gap-4">
              <button
                className="helix-button-secondary w-full"
                onClick={() => { setGuideOpen(true); }}
              >
                Open Flow Guide
              </button>
              <div className={`flex flex-col gap-2 ${settingsSection === "navigation" ? "" : "opacity-70"}`}>
                <p className="text-[10px] uppercase tracking-widest text-muted font-bold">Navigation Mode</p>
                <div className="flex items-center gap-2 bg-[#0d1117] border border-[#141a33] rounded-xl p-1">
                  <button
                    onClick={() => setViewMode("graph")}
                    className={`flex-1 py-1.5 text-[9px] uppercase tracking-wider font-bold rounded transition-all ${viewMode === "graph" ? "text-[#0d1117] bg-neon-cyan shadow-[0_0_15px_rgba(0,229,255,0.3)]" : "text-secondary hover:text-white"}`}
                  >
                    Graph
                  </button>
                  <button
                    onClick={() => { setViewMode("cellular"); setHighlightNodes([]); }}
                    className={`flex-1 py-1.5 text-[9px] uppercase tracking-wider font-bold rounded transition-all ${viewMode === "cellular" ? "text-[#0d1117] bg-neon-purple shadow-[0_0_15px_rgba(153,69,255,0.3)]" : "text-secondary hover:text-white"}`}
                  >
                    Cellular
                  </button>
                  <button
                    onClick={() => setViewMode("directory")}
                    className={`flex-1 py-1.5 text-[9px] uppercase tracking-wider font-bold rounded transition-all ${viewMode === "directory" ? "text-[#0d1117] bg-neon-emerald shadow-[0_0_15px_rgba(0,255,136,0.3)]" : "text-secondary hover:text-white"}`}
                  >
                    Directory
                  </button>
                </div>
              </div>

              {viewMode === "graph" && (
                <div className="flex flex-col gap-2">
                  <p className="text-[10px] uppercase tracking-widest text-muted font-bold">Graph Depth</p>
                  <div className="flex items-center gap-2 bg-[#0d1117] border border-[#141a33] rounded-xl p-1">
                    <button
                      onClick={() => {
                        setGraphMode("macro");
                        fetchGraphData("macro");
                      }}
                      className={`flex-1 py-1.5 text-[9px] uppercase tracking-wider font-bold rounded transition-all ${graphMode === "macro" ? "text-[#0d1117] bg-neon-emerald shadow-[0_0_15px_rgba(0,255,136,0.3)]" : "text-secondary hover:text-white"}`}
                    >
                      Macro
                    </button>
                    <button
                      onClick={() => {
                        setGraphMode("deep");
                        fetchGraphData("deep");
                      }}
                      className={`flex-1 py-1.5 text-[9px] uppercase tracking-wider font-bold rounded transition-all ${graphMode === "deep" ? "text-[#0d1117] bg-neon-pink shadow-[0_0_15px_rgba(255,0,170,0.3)]" : "text-secondary hover:text-white"}`}
                    >
                      Deep
                    </button>
                    <button
                      onClick={() => {
                        setGraphMode("temporal");
                        fetchGraphData("temporal");
                      }}
                      className={`flex-1 py-1.5 text-[9px] uppercase tracking-wider font-bold rounded transition-all ${graphMode === "temporal" ? "text-[#0d1117] bg-neon-cyan shadow-[0_0_15px_rgba(0,229,255,0.3)]" : "text-secondary hover:text-white"}`}
                    >
                      4D Timeline
                    </button>
                  </div>

                  {graphMode === "temporal" && timeline.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-white/5 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] text-neon-cyan font-bold tracking-widest uppercase">Temporal Morphogenesis</span>
                        <span className="text-[9px] text-secondary font-mono">T-{timeline.length}</span>
                      </div>

                      <input
                        type="range"
                        min={timeRange.min}
                        max={timeRange.max}
                        step={1}
                        value={currentTimestamp}
                        onChange={(e) => setCurrentTimestamp(Number(e.target.value))}
                        className="w-full helix-scrubber"
                      />

                      <div className="bg-black/40 p-2 border border-white/5 rounded">
                        {timeline.find(c => c.timestamp <= currentTimestamp) ? (
                          <div className="space-y-1">
                            <p className="text-[10px] text-white font-mono truncate">
                              {timeline.find(c => c.timestamp <= currentTimestamp).hash.substring(0, 8)}
                            </p>
                            <p className="text-[9px] text-secondary line-clamp-2">
                              {timeline.find(c => c.timestamp <= currentTimestamp).message}
                            </p>
                            <p className="text-[8px] text-muted text-right">
                              {new Date(timeline.find(c => c.timestamp <= currentTimestamp).timestamp * 1000).toLocaleString()}
                            </p>
                          </div>
                        ) : (
                          <p className="text-[9px] text-muted italic">No state recorded at T-zero</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-1">
                <p className="text-[10px] uppercase tracking-widest text-muted font-bold">Search / Interrogate</p>
                <p className="text-[9px] text-secondary uppercase tracking-wider">Ask a question or locate a symbol</p>
                <form onSubmit={handleSearch} className="relative group">
                  <input
                    type="text"
                    className="search-input pr-10"
                    placeholder={viewMode === "cellular" ? "Type a question for the agent..." : "Search classes, functions, modules..."}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted group-focus-within:text-neon-cyan transition-colors">
                    ⏎
                  </div>
                </form>
              </div>

              <div className={`flex items-center justify-between gap-4 ${settingsSection === "environment" ? "" : "opacity-70"}`}>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted font-bold">Auto-Evolve</p>
                  <p className="text-[9px] text-secondary uppercase tracking-wider">Zero-click mutations</p>
                </div>
                <button
                  onClick={() => setAutoEvolve(prev => !prev)}
                  aria-pressed={autoEvolve}
                  className={`relative w-12 h-6 rounded-full transition-colors ${autoEvolve ? "bg-neon-emerald/70" : "bg-white/10"}`}
                  title={autoEvolve ? "Auto-Evolve enabled" : "Auto-Evolve disabled"}
                >
                  <span
                    className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${autoEvolve ? "translate-x-6" : ""}`}
                  />
                </button>
              </div>

              <div className="pt-4 border-t border-white/5">
                <button
                  onClick={handleVisualDiagnostic}
                  disabled={capturingVision}
                  className="w-full helix-button-primary py-3 flex items-center justify-center gap-3 text-xs bg-neon-purple/20 border-neon-purple hover:bg-neon-purple/30 group mb-6"
                >
                  <span className={`w-2 h-2 rounded-full ${capturingVision ? "bg-neon-pink animate-ping" : "bg-neon-cyan"}`}></span>
                  {capturingVision ? "SCANNING PHENOTYPE..." : "RUN VISUAL DIAGNOSTIC"}
                </button>
              </div>

              <div className="flex flex-col gap-2">
                <LegendItem color="#00ff88" label="Function" />
                <LegendItem color="#9945ff" label="Class" />
                <LegendItem color="#00e5ff" label="Module" />
                <LegendItem color="#ff00aa" label="Calls" />
              </div>
            </div>
          </div>
        </div>
      )}


      {guideOpen && (
        <div className="helix-overlay helix-overlay--guide" onClick={closeGuide}>
          <div className="helix-overlay-panel helix-overlay-panel--guide" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex flex-col gap-1">
                <p className="text-[10px] uppercase tracking-widest text-muted font-bold">Flow Guide</p>
                <p className="text-secondary text-xs">Start here and follow the system path.</p>
              </div>
              <button onClick={closeGuide} className="helix-icon-button" aria-label="Close guide">✕</button>
            </div>

            <div className="helix-guide-grid">
              <div className="helix-guide-stack">
                <p className="text-[10px] uppercase tracking-widest text-muted font-bold">Quick Start</p>
                <ol className="helix-guide-list">
                  <li>Ingest a repository to seed the organism.</li>
                  <li>Explore the graph and select a node for analysis.</li>
                  <li>Use Neural Link to ask questions or deploy the Immune Swarm.</li>
                </ol>

                <div className="helix-guide-actions">
                  <button className="helix-button-primary" onClick={beginGuide}>
                    Start With Ingestion
                  </button>
                  <button className="helix-button-secondary" onClick={closeGuide}>
                    Close Guide
                  </button>
                </div>

                <button
                  className="helix-ghost-link"
                  onClick={() => setGuideExpanded(prev => !prev)}
                >
                  {guideExpanded ? "Hide Full Flow" : "Show Full Flow"}
                </button>
              </div>

              {guideExpanded && (
                <div className="helix-guide-flow">
                  <MermaidDiagram code={guideDiagram} />
                </div>
              )}
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
