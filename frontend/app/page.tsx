"use client";

import { useState, useRef, useEffect } from "react";

interface Task {
  task_id: string;
  filename: string;
  status: "pending" | "processing" | "completed" | "failed";
  error?: string;
  processed_path?: string;
  original_path?: string;
  created_at?: string;
}

export default function Home() {
  const [files, setFiles] = useState<File[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingInterval = useRef<NodeJS.Timeout | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalImageUrl, setModalImageUrl] = useState("");
  const [modalOriginalUrl, setModalOriginalUrl] = useState("");
  const [modalFilename, setModalFilename] = useState("");
  const [compareMode, setCompareMode] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    setFiles((prev) => [...prev, ...dropped]);
  };

  const removeFile = (index: number) => setFiles((prev) => prev.filter((_, i) => i !== index));

  const handleUpload = async () => {
    if (!files.length) return;
    setIsProcessing(true);
    const formData = new FormData();
    files.forEach((f) => formData.append("files", f));
    try {
      const res = await fetch("http://localhost:8000/upload-bulk", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok && data.tasks) {
        setTasks((prev) => [
          ...prev,
          ...data.tasks.map((t: any) => ({ task_id: t.task_id, filename: t.filename, status: "pending" })),
        ]);
        setFiles([]);
        startPolling();
      } else {
        alert("Upload failed: " + (data.message || "Unknown error"));
      }
    } catch {
      alert("Failed to connect to backend.");
    } finally {
      setIsProcessing(false);
    }
  };

  const startPolling = () => {
    if (pollingInterval.current) clearInterval(pollingInterval.current);
    pollingInterval.current = setInterval(() => {
      const active = tasks.filter((t) => t.status !== "completed" && t.status !== "failed");
      if (!active.length) { clearInterval(pollingInterval.current!); return; }
      active.forEach((task) =>
        fetch(`http://localhost:8000/status/${task.task_id}`)
          .then((r) => r.json())
          .then((data) =>
            setTasks((prev) =>
              prev.map((t) =>
                t.task_id === task.task_id
                  ? { ...t, status: data.status, error: data.error, processed_path: data.processed_path, original_path: data.original_path }
                  : t
              )
            )
          )
          .catch(console.error)
      );
    }, 2000);
  };

  useEffect(() => {
    if (tasks.some((t) => t.status === "pending" || t.status === "processing")) startPolling();
    return () => { if (pollingInterval.current) clearInterval(pollingInterval.current); };
  }, [tasks]);

  const openModal = (task: Task, compare = false) => {
    setModalFilename(task.filename);
    setCompareMode(compare && task.status !== "failed");
    const originalUrl = `http://localhost:8000/original/${task.task_id}`;
    setModalImageUrl(task.status === "failed" ? originalUrl : `http://localhost:8000/download/${task.task_id}`);
    setModalOriginalUrl(originalUrl);
    setModalOpen(true);
  };

  const completedCount = tasks.filter((t) => t.status === "completed").length;
  const processingCount = tasks.filter((t) => t.status === "processing" || t.status === "pending").length;
  const progress = tasks.length ? (completedCount / tasks.length) * 100 : 0;

  const statusStyles: Record<string, string> = {
    pending:    "bg-amber-500/10 text-amber-400 border border-amber-500/20",
    processing: "bg-cyan-400/10 text-cyan-400 border border-cyan-400/25",
    completed:  "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
    failed:     "bg-red-500/10 text-red-400 border border-red-500/20",
  };

  const cardBorderStyles: Record<string, string> = {
    pending:    "border-white/7",
    processing: "border-white/7",
    completed:  "border-emerald-500/15",
    failed:     "border-red-500/15",
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap');
        body { font-family: 'Inter', sans-serif; }
        .font-display { font-family: 'Space Grotesk', sans-serif; }
        .gradient-text {
          background: linear-gradient(90deg, #00d4ff, #0088ff);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .shimmer { position: relative; overflow: hidden; }
        .shimmer::after {
          content: '';
          position: absolute;
          top: 0; left: -60%; width: 60%; height: 100%;
          background: linear-gradient(90deg, transparent, rgba(0,212,255,0.06), transparent);
          animation: shimmer 2s infinite;
        }
        @keyframes shimmer { 0% { left: -60%; } 100% { left: 160%; } }
        .dot-pulse { animation: dotpulse 1.4s infinite ease-in-out; }
        .dot-pulse:nth-child(2) { animation-delay: 0.2s; }
        .dot-pulse:nth-child(3) { animation-delay: 0.4s; }
        @keyframes dotpulse {
          0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
          40%            { opacity: 1;   transform: scale(1); }
        }
      `}</style>

      <div className="min-h-screen bg-[#0a0a0c] text-[#e8e8ed] pb-20">

        {/* ── Header ── */}
        <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#0a0a0c]/85 backdrop-blur-xl px-10 py-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M12 3L20 7.5V16.5L12 21L4 16.5V7.5L12 3Z" stroke="#000" strokeWidth="2" strokeLinejoin="round"/>
                <circle cx="12" cy="12" r="3" fill="#000"/>
              </svg>
            </div>
            <span className="font-display font-bold text-[18px] tracking-tight text-white">
              Car<span className="text-cyan-400">Studio</span>
            </span>
          </div>
          <span className="text-[11px] font-semibold tracking-widest uppercase text-cyan-400 bg-cyan-400/10 border border-cyan-400/20 px-3 py-1 rounded-full">
            AI-Powered
          </span>
        </header>

        {/* ── Hero ── */}
        <div className="max-w-3xl mx-auto text-center px-10 pt-16 pb-12">
          <p className="text-[11px] font-semibold tracking-[0.14em] uppercase text-cyan-400 mb-5">
            Bulk Photo Processing
          </p>
          <h1 className="font-display font-bold text-[clamp(30px,5vw,50px)] leading-[1.1] tracking-[-1px] text-white mb-4">
            Studio-quality shots,<br />
            <em className="not-italic gradient-text">in seconds</em>
          </h1>
          <p className="text-base text-gray-500 leading-relaxed max-w-md mx-auto">
            Drop your car photos. Our AI removes backgrounds, enhances lighting, and delivers showroom-ready images.
          </p>
        </div>

        {/* ── Content ── */}
        <div className="max-w-3xl mx-auto px-10">

          {/* Drop zone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`border-[1.5px] border-dashed rounded-2xl px-8 py-14 text-center cursor-pointer transition-all duration-200
              ${isDragging
                ? "border-cyan-400/40 bg-cyan-400/[0.03]"
                : "border-white/[0.12] bg-white/[0.02] hover:border-cyan-400/30 hover:bg-cyan-400/[0.02]"
              }`}
          >
            <input ref={fileInputRef} type="file" onChange={handleFileChange} accept="image/*" multiple className="hidden" />
            <div className="w-13 h-13 mx-auto mb-4 bg-cyan-400/[0.08] rounded-[14px] flex items-center justify-center w-[52px] h-[52px]">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"
                  stroke="#00d4ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            {files.length > 0 ? (
              <>
                <p className="font-display font-semibold text-[17px] text-[#e8e8ed] mb-1.5">
                  {files.length} image{files.length !== 1 ? "s" : ""} selected
                </p>
                <p className="text-[13px] text-gray-600">Click to add more</p>
              </>
            ) : (
              <>
                <p className="font-display font-semibold text-[17px] text-[#e8e8ed] mb-1.5">Drop images here</p>
                <p className="text-[13px] text-gray-600">
                  or <span className="text-cyan-400 font-medium">click to browse</span> · JPG, PNG, WEBP
                </p>
              </>
            )}
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div className="mt-4">
              <p className="text-[13px] font-medium text-gray-500 mb-2 tracking-wide">
                {files.length} file{files.length !== 1 ? "s" : ""} ready
              </p>
              <div className="flex flex-col gap-2">
                {files.map((file, i) => (
                  <div key={i} className="flex items-center justify-between bg-white/[0.04] border border-white/[0.06] rounded-xl px-3.5 py-2.5 text-[13px]">
                    <span className="text-gray-300 font-medium truncate max-w-[60%]">{file.name}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-gray-600 text-[12px]">{(file.size / 1024).toFixed(0)} KB</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                        className="text-gray-600 hover:text-red-400 transition-colors text-lg leading-none px-1 rounded"
                      >×</button>
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={handleUpload}
                disabled={isProcessing}
                className="mt-5 w-full py-3.5 px-6 rounded-xl font-display font-bold text-[15px] text-black
                  bg-gradient-to-r from-cyan-400 to-blue-600
                  hover:opacity-90 hover:-translate-y-px active:translate-y-0
                  disabled:bg-none disabled:bg-white/[0.08] disabled:text-gray-600 disabled:cursor-not-allowed disabled:transform-none
                  transition-all duration-150 tracking-[0.01em]"
              >
                {isProcessing ? "Uploading…" : `Process ${files.length} image${files.length !== 1 ? "s" : ""} →`}
              </button>
            </div>
          )}

          {/* Task queue */}
          {tasks.length > 0 && (
            <div className="mt-12">
              {/* Stats bar */}
              <div className="flex items-center justify-between mb-6">
                <p className="font-display font-bold text-[18px] text-[#e8e8ed]">Processing queue</p>
                <div className="flex gap-2">
                  {completedCount > 0 && (
                    <span className="text-[12px] font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {completedCount} done
                    </span>
                  )}
                  {processingCount > 0 && (
                    <span className="text-[12px] font-semibold px-2.5 py-1 rounded-full bg-cyan-400/10 text-cyan-400 border border-cyan-400/20">
                      {processingCount} running
                    </span>
                  )}
                  <span className="text-[12px] font-semibold px-2.5 py-1 rounded-full bg-white/[0.05] text-gray-500 border border-white/[0.08]">
                    {tasks.length} total
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-[3px] bg-white/[0.06] rounded-full mb-7 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-600 transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>

              {/* Card grid */}
              <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
                {tasks.map((task) => (
                  <div
                    key={task.task_id}
                    className={`bg-white/[0.03] border rounded-2xl overflow-hidden transition-all duration-200 hover:-translate-y-0.5
                      ${cardBorderStyles[task.status] || "border-white/[0.07]"}
                      hover:border-white/[0.14]
                      ${task.status === "processing" || task.status === "pending" ? "shimmer" : ""}
                    `}
                  >
                    {/* Thumbnail */}
                    <div className="w-full aspect-video bg-white/[0.03] overflow-hidden relative">
                      {task.status === "completed" ? (
                        <img
                          src={`http://localhost:8000/download/${task.task_id}`}
                          alt="Processed"
                          className="w-full h-full object-cover transition-transform duration-300 hover:scale-[1.04]"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="opacity-15">
                            <rect x="3" y="3" width="18" height="18" rx="2" stroke="#fff" strokeWidth="1.5"/>
                            <circle cx="8.5" cy="8.5" r="1.5" fill="#fff"/>
                            <path d="M21 15l-5-5L5 21" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Body */}
                    <div className="p-3.5">
                      <p className="text-[13px] font-semibold text-[#e8e8ed] truncate mb-0.5">{task.filename}</p>
                      <p className="text-[11px] text-gray-700 font-mono mb-3">#{task.task_id.slice(0, 12)}</p>
                      {task.error && <p className="text-[11px] text-red-400 mb-2">⚠ {task.error}</p>}

                      <div className="flex items-center justify-between gap-1.5">
                        {/* Status badge */}
                        <span className={`text-[10px] font-bold tracking-wider uppercase px-2 py-1 rounded-full whitespace-nowrap ${statusStyles[task.status]}`}>
                          {task.status === "processing" || task.status === "pending" ? (
                            <span className="flex gap-1 items-center">
                              <span className="w-1.5 h-1.5 rounded-full bg-current dot-pulse" />
                              <span className="w-1.5 h-1.5 rounded-full bg-current dot-pulse" />
                              <span className="w-1.5 h-1.5 rounded-full bg-current dot-pulse" />
                            </span>
                          ) : task.status}
                        </span>

                        {/* Actions */}
                        <div className="flex gap-1">
                          {task.status === "completed" && (
                            <>
                              <button
                                onClick={() => openModal(task, false)}
                                className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-cyan-400/15 text-cyan-400 hover:opacity-80 transition-opacity"
                              >View</button>
                              <button
                                onClick={() => openModal(task, true)}
                                className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-violet-500/15 text-violet-400 hover:opacity-80 transition-opacity"
                              >Compare</button>
                              <a
                                href={`http://localhost:8000/download/${task.task_id}`}
                                download
                                className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 hover:opacity-80 transition-opacity"
                              >↓</a>
                            </>
                          )}
                          {task.status === "failed" && (
                            <>
                              <button
                                onClick={() => openModal(task, false)}
                                className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-cyan-400/15 text-cyan-400 hover:opacity-80 transition-opacity"
                              >View</button>
                              <button
                                onClick={() => alert("Retry not implemented yet.")}
                                className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-400 hover:opacity-80 transition-opacity"
                              >Retry</button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {tasks.length === 0 && files.length === 0 && (
            <div className="text-center py-16 mt-10">
              <div className="text-4xl mb-3 opacity-40">🚗</div>
              <p className="text-[14px] text-gray-600">Select images above to get started</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Modal ── */}
      {modalOpen && (
        <div
          className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-5"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="bg-[#111116] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[72vh] flex flex-col shadow-[0_40px_80px_rgba(0,0,0,0.8)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07] shrink-0">
              <p className="font-display font-semibold text-[15px] text-[#e8e8ed] truncate max-w-[75%]">
                {modalFilename}
              </p>
              <button
                onClick={() => setModalOpen(false)}
                className="w-8 h-8 rounded-lg bg-white/[0.07] hover:bg-white/[0.12] text-gray-400 hover:text-white transition-all flex items-center justify-center text-lg"
              >×</button>
            </div>

            {/* Modal body — scrollable */}
            <div className="overflow-y-auto px-5 py-4 flex-1 min-h-0">
              {compareMode ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[11px] font-semibold tracking-widest uppercase text-gray-600 mb-2">Original</p>
                    <img src={modalOriginalUrl} alt="Original" className="w-full h-auto rounded-xl border border-white/[0.08] block" />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold tracking-widest uppercase text-gray-600 mb-2">Processed</p>
                    <img src={modalImageUrl} alt="Processed" className="w-full h-auto rounded-xl border border-white/[0.08] block" />
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-[11px] font-semibold tracking-widest uppercase text-gray-600 mb-2">
                    {modalImageUrl === modalOriginalUrl ? "Original image" : "Processed image"}
                  </p>
                  <img src={modalImageUrl} alt="Processed" className="w-full h-auto rounded-xl border border-white/[0.08] block max-h-[42vh] object-contain mx-auto" />
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-white/[0.07] shrink-0">
              <button
                onClick={() => setCompareMode(!compareMode)}
                className="text-[13px] font-semibold px-4 py-2 rounded-lg bg-violet-500/[0.18] text-violet-400 hover:opacity-85 transition-opacity"
              >
                {compareMode ? "Single view" : "Compare"}
              </button>
              <a
                href={modalImageUrl}
                download
                className="text-[13px] font-semibold px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:opacity-85 transition-opacity"
              >
                Download
              </a>
              <button
                onClick={() => setModalOpen(false)}
                className="text-[13px] font-semibold px-4 py-2 rounded-lg bg-white/[0.07] text-gray-400 hover:bg-white/[0.12] hover:text-white transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}