"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { BackButton } from "@/components/dashboard/back-button";

/* ── Types ──────────────────────────────────────── */
type Category = {
  id: string;
  name: string;
  type: "expense" | "income";
};

type Rule = {
  id: string;
  pattern: string;
  category_id: string;
  finance_categories: { name: string; type: string } | null;
};

type ImportedTransaction = {
  date: string;
  description: string;
  counterparty: string | null;
  merchant: string;
  amount: number;
  balance: number | null;
  importHash: string;
  isDuplicate: boolean;
  categoryId: string | null;
  categoryName: string | null;
};

type SavedTransaction = {
  id: string;
  date: string;
  description: string;
  counterparty: string | null;
  amount: number;
  category_id: string | null;
  finance_categories: { id: string; name: string; type: string } | null;
};

type ImportStats = {
  total: number;
  new: number;
  duplicates: number;
  autoCategorized: number;
  needsReview: number;
};

/* ── Helpers ──────────────────────────────────────── */
function formatAmount(amount: number) {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: "numeric" });
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/* ── Main Component ──────────────────────────────── */
export default function FinansePage() {
  const [tab, setTab] = useState<"import" | "historia" | "kategorie">("import");

  // Categories
  const [categories, setCategories] = useState<Category[]>([]);

  // Import state
  const [importing, setImporting] = useState(false);
  const [importStats, setImportStats] = useState<ImportStats | null>(null);
  const [importRows, setImportRows] = useState<ImportedTransaction[]>([]);
  const [categoryAssignments, setCategoryAssignments] = useState<Record<string, string>>({});
  const [saveRules, setSaveRules] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Historia state
  const [histMonth, setHistMonth] = useState(currentMonth());
  const [transactions, setTransactions] = useState<SavedTransaction[]>([]);
  const [loadingTx, setLoadingTx] = useState(false);

  // Kategorie state
  const [newCatName, setNewCatName] = useState("");
  const [newCatType, setNewCatType] = useState<"expense" | "income">("expense");
  const [rules, setRules] = useState<Rule[]>([]);
  const [loadingRules, setLoadingRules] = useState(false);

  // Load categories on mount
  useEffect(() => {
    fetch("/api/finanse/categories")
      .then((r) => r.json())
      .then((d) => setCategories(d.categories || []))
      .catch(() => {});
  }, []);

  // Load transactions when historia tab active or month changes
  const loadTransactions = useCallback(() => {
    setLoadingTx(true);
    fetch(`/api/finanse/transactions?month=${histMonth}`)
      .then((r) => r.json())
      .then((d) => setTransactions(d.transactions || []))
      .catch(() => {})
      .finally(() => setLoadingTx(false));
  }, [histMonth]);

  useEffect(() => {
    if (tab === "historia") loadTransactions();
  }, [tab, loadTransactions]);

  // Load rules when kategorie tab active
  useEffect(() => {
    if (tab !== "kategorie") return;
    setLoadingRules(true);
    fetch("/api/finanse/rules")
      .then((r) => r.json())
      .then((d) => setRules(d.rules || []))
      .catch(() => {})
      .finally(() => setLoadingRules(false));
  }, [tab]);

  /* ── Import flow ──────────────────────────────── */
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportStats(null);
    setImportRows([]);
    setSavedCount(null);

    try {
      const content = await file.text();
      const res = await fetch("/api/finanse/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      setImportRows(data.transactions || []);
      setImportStats(data.stats || null);

      // Pre-fill category assignments from auto-categorized
      const assignments: Record<string, string> = {};
      const rules: Record<string, boolean> = {};
      for (const tx of data.transactions || []) {
        if (tx.categoryId && !tx.isDuplicate) {
          assignments[tx.importHash] = tx.categoryId;
        }
        rules[tx.importHash] = false;
      }
      setCategoryAssignments(assignments);
      setSaveRules(rules);
    } catch {
      alert("Błąd podczas parsowania pliku");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleSaveImport() {
    const toSave = importRows.filter((t) => !t.isDuplicate);
    if (toSave.length === 0) return;

    setSaving(true);
    try {
      const transactions = toSave.map((t) => ({
        ...t,
        categoryId: categoryAssignments[t.importHash] || null,
      }));

      // Build rules to save
      const rulesToSave: { pattern: string; categoryId: string }[] = [];
      for (const tx of toSave) {
        if (saveRules[tx.importHash] && categoryAssignments[tx.importHash]) {
          // Use merchant name (uppercased) as pattern
          const pattern = tx.merchant.toUpperCase().slice(0, 50);
          if (pattern.length > 3) {
            rulesToSave.push({ pattern, categoryId: categoryAssignments[tx.importHash] });
          }
        }
      }

      const res = await fetch("/api/finanse/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactions, rules: rulesToSave }),
      });
      const data = await res.json();
      if (data.ok) {
        setSavedCount(data.saved);
        setImportRows([]);
        setImportStats(null);
      }
    } catch {
      alert("Błąd podczas zapisywania");
    } finally {
      setSaving(false);
    }
  }

  /* ── Historia actions ──────────────────────────── */
  async function updateCategory(txId: string, categoryId: string) {
    await fetch(`/api/finanse/transactions?id=${txId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId }),
    });
    loadTransactions();
  }

  async function deleteTransaction(txId: string) {
    if (!confirm("Usunąć transakcję?")) return;
    await fetch(`/api/finanse/transactions?id=${txId}`, { method: "DELETE" });
    loadTransactions();
  }

  function handleExport() {
    window.location.href = `/api/finanse/export?month=${histMonth}`;
  }

  /* ── Kategorie actions ────────────────────────── */
  async function addCategory() {
    if (!newCatName.trim()) return;
    const res = await fetch("/api/finanse/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newCatName.trim(), type: newCatType }),
    });
    const data = await res.json();
    if (data.category) {
      setCategories((prev) => [...prev, data.category].sort((a, b) => a.name.localeCompare(b.name)));
      setNewCatName("");
    }
  }

  async function deleteCategory(id: string) {
    if (!confirm("Usunąć kategorię? Transakcje stracą przypisanie.")) return;
    await fetch(`/api/finanse/categories?id=${id}`, { method: "DELETE" });
    setCategories((prev) => prev.filter((c) => c.id !== id));
  }

  async function deleteRule(id: string) {
    await fetch(`/api/finanse/rules?id=${id}`, { method: "DELETE" });
    setRules((prev) => prev.filter((r) => r.id !== id));
  }

  /* ── Render ──────────────────────────────────── */
  const newRows = importRows.filter((t) => !t.isDuplicate);
  const expenseCategories = categories.filter((c) => c.type === "expense");
  const incomeCategories = categories.filter((c) => c.type === "income");

  // Historia stats
  const totalExpenses = transactions
    .filter((t) => (t.amount || 0) < 0)
    .reduce((s, t) => s + Math.abs(t.amount || 0), 0);
  const totalIncome = transactions
    .filter((t) => (t.amount || 0) > 0)
    .reduce((s, t) => s + (t.amount || 0), 0);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <BackButton />
        <div className="mt-4 flex items-center gap-3">
          <span className="text-3xl">💰</span>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Finanse</h1>
            <p className="text-sm text-muted-foreground">Import z Santandera · Kategoryzacja · Eksport do Budget</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-6 flex gap-1 rounded-xl bg-muted p-1">
          {(["import", "historia", "kategorie"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                tab === t
                  ? "bg-white text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "import" ? "Import" : t === "historia" ? "Historia" : "Kategorie"}
            </button>
          ))}
        </div>

        {/* ── IMPORT TAB ──────────────────────────── */}
        {tab === "import" && (
          <div className="mt-6">
            {/* Upload area */}
            <div
              className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-card p-10 transition-colors hover:border-emerald-400 hover:bg-emerald-50/30"
              onClick={() => fileInputRef.current?.click()}
            >
              <span className="text-4xl">📂</span>
              <p className="mt-3 text-sm font-medium text-foreground">Kliknij aby wybrać plik CSV z Santandera</p>
              <p className="mt-1 text-xs text-muted-foreground">historia_*.csv (konto 93 1090 1476...)</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {importing && (
              <div className="mt-4 text-center text-sm text-muted-foreground">Parsowanie pliku...</div>
            )}

            {/* Stats */}
            {importStats && (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Wszystkich", value: importStats.total, color: "text-foreground" },
                  { label: "Nowych", value: importStats.new, color: "text-emerald-600" },
                  { label: "Duplikatów", value: importStats.duplicates, color: "text-muted-foreground" },
                  { label: "Do przypisania", value: importStats.needsReview, color: "text-amber-600" },
                ].map((s) => (
                  <div key={s.label} className="rounded-xl border border-border bg-card p-3 text-center">
                    <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Transaction review table */}
            {newRows.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-sm font-medium text-foreground">
                  Przejrzyj i przypisz kategorie ({newRows.length} transakcji)
                </p>
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Data</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Opis / Merchant</th>
                        <th className="px-3 py-2 text-right font-medium text-muted-foreground">Kwota</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Kategoria</th>
                        <th className="px-3 py-2 text-center font-medium text-muted-foreground">Zapamiętaj</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {newRows.map((tx) => (
                        <tr key={tx.importHash} className="hover:bg-muted/30">
                          <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                            {formatDate(tx.date)}
                          </td>
                          <td className="px-3 py-2">
                            <p className="font-medium text-foreground truncate max-w-[200px]" title={tx.merchant}>
                              {tx.merchant}
                            </p>
                            {tx.counterparty && (
                              <p className="text-xs text-muted-foreground truncate max-w-[200px]">{tx.counterparty}</p>
                            )}
                          </td>
                          <td className={`whitespace-nowrap px-3 py-2 text-right font-medium ${
                            tx.amount < 0 ? "text-red-600" : "text-emerald-600"
                          }`}>
                            {formatAmount(tx.amount)}
                          </td>
                          <td className="px-3 py-2">
                            <select
                              value={categoryAssignments[tx.importHash] || ""}
                              onChange={(e) =>
                                setCategoryAssignments((prev) => ({
                                  ...prev,
                                  [tx.importHash]: e.target.value,
                                }))
                              }
                              className="w-full rounded-lg border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            >
                              <option value="">— bez kategorii —</option>
                              {tx.amount < 0 ? (
                                <>
                                  <optgroup label="Wydatki">
                                    {expenseCategories.map((c) => (
                                      <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                  </optgroup>
                                  <optgroup label="Przychody">
                                    {incomeCategories.map((c) => (
                                      <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                  </optgroup>
                                </>
                              ) : (
                                <>
                                  <optgroup label="Przychody">
                                    {incomeCategories.map((c) => (
                                      <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                  </optgroup>
                                  <optgroup label="Wydatki">
                                    {expenseCategories.map((c) => (
                                      <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                  </optgroup>
                                </>
                              )}
                            </select>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={saveRules[tx.importHash] || false}
                              onChange={(e) =>
                                setSaveRules((prev) => ({
                                  ...prev,
                                  [tx.importHash]: e.target.checked,
                                }))
                              }
                              disabled={!categoryAssignments[tx.importHash]}
                              title="Zapamiętaj regułę dla tego merchanta"
                              className="h-4 w-4 cursor-pointer accent-emerald-500"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {Object.values(saveRules).filter(Boolean).length} reguł do zapamiętania
                  </p>
                  <button
                    onClick={handleSaveImport}
                    disabled={saving}
                    className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {saving ? "Zapisuję..." : `Zapisz ${newRows.length} transakcji`}
                  </button>
                </div>
              </div>
            )}

            {savedCount !== null && (
              <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
                <p className="font-medium text-emerald-700">Zapisano {savedCount} transakcji</p>
                <button
                  onClick={() => setTab("historia")}
                  className="mt-2 text-sm text-emerald-600 underline"
                >
                  Zobacz w historii →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── HISTORIA TAB ──────────────────────────── */}
        {tab === "historia" && (
          <div className="mt-6">
            {/* Controls */}
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="month"
                value={histMonth}
                onChange={(e) => setHistMonth(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <button
                onClick={handleExport}
                className="ml-auto flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
              >
                ↓ Eksportuj do Budget.csv
              </button>
            </div>

            {/* Summary */}
            {!loadingTx && transactions.length > 0 && (
              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-border bg-card p-3 text-center">
                  <p className="text-xl font-bold text-red-600">−{formatAmount(totalExpenses)}</p>
                  <p className="text-xs text-muted-foreground">Wydatki</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-3 text-center">
                  <p className="text-xl font-bold text-emerald-600">+{formatAmount(totalIncome)}</p>
                  <p className="text-xs text-muted-foreground">Przychody</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-3 text-center">
                  <p className={`text-xl font-bold ${totalIncome - totalExpenses >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {formatAmount(totalIncome - totalExpenses)}
                  </p>
                  <p className="text-xs text-muted-foreground">Bilans</p>
                </div>
              </div>
            )}

            {/* Transactions table */}
            {loadingTx ? (
              <p className="mt-6 text-center text-sm text-muted-foreground">Ładowanie...</p>
            ) : transactions.length === 0 ? (
              <div className="mt-6 rounded-xl border border-border bg-card p-8 text-center">
                <p className="text-sm text-muted-foreground">Brak transakcji w tym miesiącu.</p>
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Data</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Opis</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Kategoria</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Kwota</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {transactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-muted/30">
                        <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                          {formatDate(tx.date)}
                        </td>
                        <td className="px-3 py-2">
                          <p className="truncate max-w-[180px] text-foreground" title={tx.description}>
                            {tx.description}
                          </p>
                          {tx.counterparty && (
                            <p className="text-xs text-muted-foreground truncate max-w-[180px]">{tx.counterparty}</p>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={tx.category_id || ""}
                            onChange={(e) => updateCategory(tx.id, e.target.value)}
                            className="rounded-lg border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          >
                            <option value="">— bez kategorii —</option>
                            <optgroup label="Wydatki">
                              {expenseCategories.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </optgroup>
                            <optgroup label="Przychody">
                              {incomeCategories.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </optgroup>
                          </select>
                        </td>
                        <td className={`whitespace-nowrap px-3 py-2 text-right font-medium ${
                          tx.amount < 0 ? "text-red-600" : "text-emerald-600"
                        }`}>
                          {formatAmount(tx.amount)}
                        </td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => deleteTransaction(tx.id)}
                            className="text-xs text-muted-foreground hover:text-red-600"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── KATEGORIE TAB ──────────────────────────── */}
        {tab === "kategorie" && (
          <div className="mt-6 space-y-6">
            {/* Add category */}
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="mb-3 text-sm font-medium text-foreground">Dodaj kategorię</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Nazwa kategorii"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addCategory()}
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <select
                  value={newCatType}
                  onChange={(e) => setNewCatType(e.target.value as "expense" | "income")}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="expense">Wydatek</option>
                  <option value="income">Przychód</option>
                </select>
                <button
                  onClick={addCategory}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  Dodaj
                </button>
              </div>
            </div>

            {/* Categories list */}
            {(["expense", "income"] as const).map((type) => {
              const cats = categories.filter((c) => c.type === type);
              if (cats.length === 0) return null;
              return (
                <div key={type} className="rounded-xl border border-border bg-card p-4">
                  <p className="mb-3 text-sm font-semibold text-foreground">
                    {type === "expense" ? "Wydatki" : "Przychody"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {cats.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-sm"
                      >
                        <span>{c.name}</span>
                        <button
                          onClick={() => deleteCategory(c.id)}
                          className="text-muted-foreground hover:text-red-600 transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Rules list */}
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="mb-3 text-sm font-semibold text-foreground">Reguły auto-kategoryzacji</p>
              {loadingRules ? (
                <p className="text-sm text-muted-foreground">Ładowanie...</p>
              ) : rules.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Brak reguł. Zapamiętaj kategorie podczas importu.
                </p>
              ) : (
                <div className="space-y-1">
                  {rules.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono truncate max-w-[180px]">
                          {r.pattern}
                        </code>
                        <span className="text-muted-foreground">→</span>
                        <span className="font-medium">{r.finance_categories?.name || "—"}</span>
                      </div>
                      <button
                        onClick={() => deleteRule(r.id)}
                        className="ml-2 shrink-0 text-xs text-muted-foreground hover:text-red-600"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
