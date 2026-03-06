"use client"

import { useSession, signIn, signOut, SessionProvider } from "next-auth/react"
import { useState, useEffect, useCallback } from "react"
import type { BacklogItem, DriveFile, BacklogItemType, BacklogPriority } from "@/types/backlog"

const PILLAR_LABELS: Record<number, string> = {
  1: "Zdrowie i Fitness",
  2: "Rozwoj Osobisty",
  3: "Relacje i Partnerstwo",
  4: "Praca",
  5: "Duchowosc",
}

const TYPE_LABELS: Record<BacklogItemType, string> = {
  task: "task",
  idea: "idea",
  note: "note",
  goal: "goal",
  question: "question",
}

const PRIORITY_COLORS: Record<BacklogPriority, string> = {
  A: "bg-red-100 text-red-800",
  B: "bg-orange-100 text-orange-800",
  C: "bg-yellow-100 text-yellow-800",
  D: "bg-gray-100 text-gray-600",
  E: "bg-gray-50 text-gray-400",
}

type ProcessingStage = "idle" | "downloading" | "transcribing" | "classifying" | "done" | "error"

const STAGE_LABELS: Record<ProcessingStage, string> = {
  idle: "",
  downloading: "Pobieranie pliku...",
  transcribing: "Transkrypcja...",
  classifying: "Klasyfikacja...",
  done: "Gotowe!",
  error: "Blad",
}

function formatFileSize(bytes: string) {
  const b = parseInt(bytes, 10)
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("pl-PL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function BacklogPageInner() {
  const { data: session, status: sessionStatus } = useSession()

  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([])
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [filesError, setFilesError] = useState("")

  const [processingFileId, setProcessingFileId] = useState<string | null>(null)
  const [processingStage, setProcessingStage] = useState<ProcessingStage>("idle")
  const [processError, setProcessError] = useState("")

  const [transcript, setTranscript] = useState("")
  const [processedItems, setProcessedItems] = useState<BacklogItem[]>([])
  const [processedFileName, setProcessedFileName] = useState("")
  const [showTranscript, setShowTranscript] = useState(false)

  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState("")

  const [backlogItems, setBacklogItems] = useState<BacklogItem[]>([])
  const [loadingBacklog, setLoadingBacklog] = useState(false)

  const [filterType, setFilterType] = useState<BacklogItemType | "all">("all")
  const [filterPillar, setFilterPillar] = useState<number | 0>(0)
  const [filterPriority, setFilterPriority] = useState<BacklogPriority | "all">("all")

  const fetchDriveFiles = useCallback(async () => {
    setLoadingFiles(true)
    setFilesError("")
    try {
      const res = await fetch("/api/backlog/drive-files")
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setDriveFiles(data.files)
    } catch (err) {
      setFilesError(err instanceof Error ? err.message : "Blad ladowania plikow")
    } finally {
      setLoadingFiles(false)
    }
  }, [])

  const fetchBacklog = useCallback(async () => {
    setLoadingBacklog(true)
    try {
      const res = await fetch("/api/backlog/save?status=backlog")
      const data = await res.json()
      if (res.ok) setBacklogItems(data.items || [])
    } catch {
      // silent
    } finally {
      setLoadingBacklog(false)
    }
  }, [])

  useEffect(() => {
    if (session) {
      fetchDriveFiles()
      fetchBacklog()
    }
  }, [session, fetchDriveFiles, fetchBacklog])

  async function handleProcess(file: DriveFile) {
    setProcessingFileId(file.id)
    setProcessingStage("downloading")
    setProcessError("")
    setProcessedItems([])
    setTranscript("")
    setProcessedFileName(file.name)
    setSaveSuccess("")

    try {
      setProcessingStage("transcribing")
      const res = await fetch("/api/backlog/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: file.id, fileName: file.name }),
      })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error)

      setProcessingStage("done")
      setTranscript(data.transcript)
      setProcessedItems(
        data.items.map((item: BacklogItem) => ({
          ...item,
          status: "backlog" as const,
          is_wig: item.is_wig || false,
        }))
      )
    } catch (err) {
      setProcessingStage("error")
      setProcessError(err instanceof Error ? err.message : "Blad przetwarzania")
    } finally {
      setProcessingFileId(null)
    }
  }

  function updateProcessedItem(index: number, updates: Partial<BacklogItem>) {
    setProcessedItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...updates } : item))
    )
  }

  function removeProcessedItem(index: number) {
    setProcessedItems((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSave() {
    if (processedItems.length === 0) return
    setSaving(true)
    setSaveSuccess("")
    try {
      const res = await fetch("/api/backlog/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: processedItems,
          audioFileName: processedFileName,
          transcript,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSaveSuccess(`Zapisano ${data.saved} wpisow`)
      setProcessedItems([])
      setTranscript("")
      fetchBacklog()
    } catch (err) {
      setProcessError(err instanceof Error ? err.message : "Blad zapisu")
    } finally {
      setSaving(false)
    }
  }

  async function handleStatusChange(id: string, newStatus: string) {
    try {
      await fetch("/api/backlog/save", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: newStatus }),
      })
      fetchBacklog()
    } catch {
      // silent
    }
  }

  async function handleDeleteBacklogItem(id: string) {
    if (!confirm("Usunac ten wpis?")) return
    try {
      await fetch("/api/backlog/save", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
      fetchBacklog()
    } catch {
      // silent
    }
  }

  const filteredBacklog = backlogItems.filter((item) => {
    if (filterType !== "all" && item.type !== filterType) return false
    if (filterPillar !== 0 && item.pillar !== filterPillar) return false
    if (filterPriority !== "all" && item.priority !== filterPriority) return false
    return true
  })

  if (sessionStatus === "loading") {
    return (
      <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-gray-300 border-t-gray-800 rounded-full" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FAFAF9]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Backlog glosowy</h1>
          {session ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">{session.user?.email}</span>
              <button
                onClick={() => signOut()}
                className="text-sm text-gray-400 hover:text-gray-600 underline"
              >
                Wyloguj
              </button>
            </div>
          ) : null}
        </div>

        {/* Not logged in */}
        {!session && (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <p className="text-gray-600 mb-4">
              Polacz z Google Drive aby wgrywac nagrania glosowe
            </p>
            <button
              onClick={() => signIn("google")}
              className="bg-gray-900 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-gray-800 transition-colors"
            >
              Polacz z Google Drive
            </button>
          </div>
        )}

        {/* Logged in */}
        {session && (
          <>
            {/* Drive files */}
            <section className="mb-8">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-gray-900">Pliki do przetworzenia</h2>
                <button
                  onClick={fetchDriveFiles}
                  disabled={loadingFiles}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Odswiez
                </button>
              </div>

              {filesError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mb-3">
                  {filesError}
                </div>
              )}

              {loadingFiles ? (
                <div className="bg-white rounded-lg border border-gray-200 p-6 text-center text-gray-500">
                  Ladowanie plikow z Drive...
                </div>
              ) : driveFiles.length === 0 ? (
                <div className="bg-white rounded-lg border border-gray-200 p-6 text-center text-gray-400">
                  Brak plikow audio w folderze &quot;Backlog Audio&quot;
                </div>
              ) : (
                <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
                  {driveFiles.map((file) => (
                    <div key={file.id} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="text-lg">🎙</span>
                        <div>
                          <div className="font-medium text-gray-900 text-sm">{file.name}</div>
                          <div className="text-xs text-gray-400">
                            {formatFileSize(file.size)} &middot; {formatDate(file.createdTime)}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleProcess(file)}
                        disabled={processingFileId !== null}
                        className="text-sm font-medium px-3 py-1.5 rounded-md bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {processingFileId === file.id ? STAGE_LABELS[processingStage] : "Przetwórz"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Processing indicator */}
            {processingStage !== "idle" && processingStage !== "done" && processingStage !== "error" && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-8 flex items-center gap-3">
                <div className="animate-spin h-5 w-5 border-2 border-blue-300 border-t-blue-600 rounded-full" />
                <span className="text-sm text-blue-700">{STAGE_LABELS[processingStage]}</span>
              </div>
            )}

            {/* Process error */}
            {processError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mb-8">
                {processError}
              </div>
            )}

            {/* Save success */}
            {saveSuccess && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700 mb-8">
                {saveSuccess}
              </div>
            )}

            {/* Processed results */}
            {(processedItems.length > 0 || transcript) && (
              <section className="mb-8">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">
                  Podglad przetworzonych
                </h2>
                <div className="bg-white rounded-lg border border-gray-200">
                  {/* Transcript */}
                  {transcript && (
                    <div className="px-4 py-3 border-b border-gray-100">
                      <button
                        onClick={() => setShowTranscript(!showTranscript)}
                        className="text-sm text-gray-500 hover:text-gray-700 font-medium"
                      >
                        {showTranscript ? "Zwiń transkrypcję" : "Pokaż transkrypcję"}
                      </button>
                      {showTranscript && (
                        <p className="mt-2 text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">
                          {transcript}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Editable items */}
                  <div className="divide-y divide-gray-100">
                    {processedItems.map((item, idx) => (
                      <div key={idx} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 space-y-2">
                            {/* Type + Priority + Pillar row */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <select
                                value={item.type}
                                onChange={(e) =>
                                  updateProcessedItem(idx, {
                                    type: e.target.value as BacklogItemType,
                                  })
                                }
                                className="text-xs border border-gray-200 rounded px-1.5 py-0.5 bg-gray-50"
                              >
                                {Object.entries(TYPE_LABELS).map(([k, v]) => (
                                  <option key={k} value={k}>
                                    {v}
                                  </option>
                                ))}
                              </select>

                              <select
                                value={item.priority}
                                onChange={(e) =>
                                  updateProcessedItem(idx, {
                                    priority: e.target.value as BacklogPriority,
                                  })
                                }
                                className={`text-xs font-bold border rounded px-1.5 py-0.5 ${PRIORITY_COLORS[item.priority]}`}
                              >
                                {(["A", "B", "C", "D", "E"] as const).map((p) => (
                                  <option key={p} value={p}>
                                    {p}
                                  </option>
                                ))}
                              </select>

                              <select
                                value={item.pillar || ""}
                                onChange={(e) =>
                                  updateProcessedItem(idx, {
                                    pillar: e.target.value ? parseInt(e.target.value) : null,
                                  })
                                }
                                className="text-xs border border-gray-200 rounded px-1.5 py-0.5 bg-gray-50"
                              >
                                <option value="">Filar...</option>
                                {Object.entries(PILLAR_LABELS).map(([k, v]) => (
                                  <option key={k} value={k}>
                                    {v}
                                  </option>
                                ))}
                              </select>

                              {item.pillar === 4 && (
                                <select
                                  value={item.project || ""}
                                  onChange={(e) =>
                                    updateProcessedItem(idx, {
                                      project: (e.target.value || null) as BacklogItem["project"],
                                    })
                                  }
                                  className="text-xs border border-gray-200 rounded px-1.5 py-0.5 bg-gray-50"
                                >
                                  <option value="">Projekt...</option>
                                  <option value="ovoc">Ovoc</option>
                                  <option value="plantacja">Plantacja</option>
                                  <option value="inne">Inne</option>
                                </select>
                              )}

                              <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={item.is_wig}
                                  onChange={(e) =>
                                    updateProcessedItem(idx, { is_wig: e.target.checked })
                                  }
                                  className="rounded"
                                />
                                WIG
                              </label>
                            </div>

                            {/* Title */}
                            <input
                              type="text"
                              value={item.title}
                              onChange={(e) =>
                                updateProcessedItem(idx, { title: e.target.value })
                              }
                              className="w-full text-sm font-medium text-gray-900 border border-gray-200 rounded px-2 py-1"
                            />

                            {/* Description */}
                            <input
                              type="text"
                              value={item.description || ""}
                              onChange={(e) =>
                                updateProcessedItem(idx, {
                                  description: e.target.value || null,
                                })
                              }
                              placeholder="Opis (opcjonalnie)"
                              className="w-full text-xs text-gray-600 border border-gray-100 rounded px-2 py-1"
                            />

                            {/* Due date */}
                            <input
                              type="date"
                              value={item.due_date || ""}
                              onChange={(e) =>
                                updateProcessedItem(idx, {
                                  due_date: e.target.value || null,
                                })
                              }
                              className="text-xs border border-gray-200 rounded px-2 py-0.5 text-gray-600"
                            />
                          </div>

                          <button
                            onClick={() => removeProcessedItem(idx)}
                            className="text-gray-300 hover:text-red-500 transition-colors text-lg leading-none"
                            title="Usun"
                          >
                            &times;
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Save button */}
                  {processedItems.length > 0 && (
                    <div className="px-4 py-3 border-t border-gray-100">
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="w-full bg-gray-900 text-white py-2 rounded-lg font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
                      >
                        {saving
                          ? "Zapisywanie..."
                          : `Zapisz wszystkie do backlogu (${processedItems.length})`}
                      </button>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Existing backlog */}
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">
                Istniejacy backlog
              </h2>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value as BacklogItemType | "all")}
                  className="text-xs border border-gray-200 rounded px-2 py-1 bg-white"
                >
                  <option value="all">Wszystkie typy</option>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>

                <select
                  value={filterPillar}
                  onChange={(e) => setFilterPillar(parseInt(e.target.value))}
                  className="text-xs border border-gray-200 rounded px-2 py-1 bg-white"
                >
                  <option value={0}>Wszystkie filary</option>
                  {Object.entries(PILLAR_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>

                <select
                  value={filterPriority}
                  onChange={(e) =>
                    setFilterPriority(e.target.value as BacklogPriority | "all")
                  }
                  className="text-xs border border-gray-200 rounded px-2 py-1 bg-white"
                >
                  <option value="all">Wszystkie priorytety</option>
                  {(["A", "B", "C", "D", "E"] as const).map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              {loadingBacklog ? (
                <div className="bg-white rounded-lg border border-gray-200 p-6 text-center text-gray-500">
                  Ladowanie backlogu...
                </div>
              ) : filteredBacklog.length === 0 ? (
                <div className="bg-white rounded-lg border border-gray-200 p-6 text-center text-gray-400">
                  Brak wpisow w backlogu
                </div>
              ) : (
                <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
                  {filteredBacklog.map((item) => (
                    <div key={item.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            {item.is_wig && (
                              <span className="text-xs font-bold text-amber-600" title="WIG">
                                ◆
                              </span>
                            )}
                            <span
                              className={`text-xs font-bold px-1.5 py-0.5 rounded ${PRIORITY_COLORS[item.priority]}`}
                            >
                              {item.priority}
                            </span>
                            <span className="text-xs text-gray-400">{item.type}</span>
                            {item.pillar && (
                              <>
                                <span className="text-xs text-gray-300">|</span>
                                <span className="text-xs text-gray-500">
                                  {PILLAR_LABELS[item.pillar]}
                                  {item.project ? ` / ${item.project}` : ""}
                                </span>
                              </>
                            )}
                          </div>
                          <div className="text-sm font-medium text-gray-900">{item.title}</div>
                          {item.description && (
                            <div className="text-xs text-gray-500 mt-0.5">{item.description}</div>
                          )}
                          {item.due_date && (
                            <div className="text-xs text-gray-400 mt-1">
                              ⏰ {formatDate(item.due_date)}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleStatusChange(item.id!, "this_week")}
                            className="text-xs text-blue-600 hover:text-blue-800 whitespace-nowrap px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                            title="Przenies do tego tygodnia"
                          >
                            → Ten tydzien
                          </button>
                          <button
                            onClick={() => handleDeleteBacklogItem(item.id!)}
                            className="text-gray-300 hover:text-red-500 transition-colors text-sm px-1"
                            title="Usun"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}

export default function BacklogPage() {
  return (
    <SessionProvider>
      <BacklogPageInner />
    </SessionProvider>
  )
}
