"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useSession, signIn, SessionProvider } from "next-auth/react";
import { BackButton } from "@/components/dashboard/back-button";

/* ── Types ──────────────────────────────────────── */
type Category = {
  id: string;
  name: string;
  type: "expense" | "income";
};

type Subcategory = {
  id: string;
  name: string;
  category_id: string;
};

type Tag = {
  id: string;
  name: string;
};

type Rule = {
  id: string;
  pattern: string;
  category_id: string;
  subcategory_id: string | null;
  finance_categories: { name: string; type: string } | null;
  finance_subcategories: { name: string } | null;
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
  subcategoryId: string | null;
  subcategoryName: string | null;
  aiSuggested: boolean;
  tag: string | null;
  intermediary?: { kind: "opaque" | "prefixed"; provider: string | null } | null;
  needsLookup?: boolean;
};

const isOpaque = (tx: ImportedTransaction) => tx.intermediary?.kind === "opaque";
// Status messages from row analysis — shown in the UI, never saved as notes.
const NON_NOTES = new Set(["Brak sugestii", "Błąd analizy"]);

type SavedTransaction = {
  id: string;
  date: string;
  description: string;
  counterparty: string | null;
  merchant: string | null;
  amount: number;
  category_id: string | null;
  subcategory_id: string | null;
  tag: string | null;
  notes: string | null;
  finance_categories: { id: string; name: string; type: string } | null;
  finance_subcategories: { id: string; name: string } | null;
};

type ImportStats = {
  total: number;
  new: number;
  duplicates: number;
  autoCategorized: number;
  aiSuggested: number;
  needsReview: number;
  needsLookup?: number;
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
function FinansePageInner() {
  const { data: session } = useSession();
  const gmailConnected = !!session?.googleConnected;
  const [tab, setTab] = useState<"import" | "historia" | "budzet" | "kategorie">("import");

  // Categories
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);

  // Tags
  const [tags, setTags] = useState<Tag[]>([]);
  const [newTagName, setNewTagName] = useState("");
  const [categoryTags, setCategoryTags] = useState<Record<string, Tag[]>>({});

  // Import state
  const [importing, setImporting] = useState(false);
  const [importStats, setImportStats] = useState<ImportStats | null>(null);
  const [importRows, setImportRows] = useState<ImportedTransaction[]>([]);
  const [categoryAssignments, setCategoryAssignments] = useState<Record<string, string>>({});
  const [subcategoryAssignments, setSubcategoryAssignments] = useState<Record<string, string>>({});
  const [tagAssignments, setTagAssignments] = useState<Record<string, string>>({});
  const [userOverrides, setUserOverrides] = useState<Set<string>>(new Set());
  const [saveRules, setSaveRules] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [autoApplied, setAutoApplied] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [rowAnalyzing, setRowAnalyzing] = useState<Record<string, boolean>>({});
  const [rowNotes, setRowNotes] = useState<Record<string, string>>({});
  const [gmailLoading, setGmailLoading] = useState<Record<string, boolean>>({});
  const [gmailResults, setGmailResults] = useState<Record<string, { subject: string; from: string; snippet: string }[]>>({});
  const [smartAnalyzing, setSmartAnalyzing] = useState<Record<string, boolean>>({});
  // Automatic lookup of opaque intermediary payments (PayU, PayPro…) after import
  const [lookupProgress, setLookupProgress] = useState<{ done: number; total: number; found: number } | null>(null);
  const lookupRunRef = useRef(0);
  const [budgetExpandedCat, setBudgetExpandedCat] = useState<string | null>(null);
  const [budgetExpandedMerchants, setBudgetExpandedMerchants] = useState<Set<string>>(new Set());
  const [budgetSortCol, setBudgetSortCol] = useState<"date" | "amount" | "description">("date");
  const [budgetSortDir, setBudgetSortDir] = useState<"asc" | "desc">("desc");
  const [budgetMerchantPage, setBudgetMerchantPage] = useState<Record<string, number>>({});
  const BUDGET_TX_PAGE_SIZE = 15;
  const [histNotes, setHistNotes] = useState<Record<string, string>>({});
  const [histTagValues, setHistTagValues] = useState<Record<string, string>>({});
  const [histUserNotes, setHistUserNotes] = useState<Record<string, string>>({});
  const [importPage, setImportPage] = useState(0);
  const IMPORT_PAGE_SIZE = 20;
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Historia state
  const [histMonth, setHistMonth] = useState(currentMonth());
  const [histFilter, setHistFilter] = useState<"all" | "uncategorized">("all");
  const [transactions, setTransactions] = useState<SavedTransaction[]>([]);
  const [loadingTx, setLoadingTx] = useState(false);
  const [pendingCategories, setPendingCategories] = useState<Record<string, string>>({});
  const [pendingSubcategories, setPendingSubcategories] = useState<Record<string, string>>({});
  const [savedRuleIds, setSavedRuleIds] = useState<Record<string, string>>({});

  // Kategorie state
  const [newCatName, setNewCatName] = useState("");
  const [newCatType, setNewCatType] = useState<"expense" | "income">("expense");
  const [newSubcatNames, setNewSubcatNames] = useState<Record<string, string>>({});
  const [rules, setRules] = useState<Rule[]>([]);
  const [loadingRules, setLoadingRules] = useState(false);

  // Load import state from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("finanse_import");
      if (saved) {
        const d = JSON.parse(saved);
        if (d.importRows?.length) {
          setImportRows(d.importRows);
          setCategoryAssignments(d.categoryAssignments || {});
          setTagAssignments(d.tagAssignments || {});
          setSaveRules(d.saveRules || {});
        }
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist import state to localStorage on every change
  useEffect(() => {
    if (importRows.length === 0) {
      localStorage.removeItem("finanse_import");
      return;
    }
    try {
      localStorage.setItem(
        "finanse_import",
        JSON.stringify({ importRows, categoryAssignments, tagAssignments, saveRules })
      );
    } catch {}
  }, [importRows, categoryAssignments, tagAssignments, saveRules]);

  // Load categories, subcategories, tags, and category-tag links on mount
  useEffect(() => {
    fetch("/api/finanse/categories")
      .then((r) => r.json())
      .then((d) => setCategories(d.categories || []))
      .catch(() => {});
    fetch("/api/finanse/subcategories")
      .then((r) => r.json())
      .then((d) => setSubcategories(d.subcategories || []))
      .catch(() => {});
    fetch("/api/finanse/tags")
      .then((r) => r.json())
      .then((d) => setTags(d.tags || []))
      .catch(() => {});
    fetch("/api/finanse/category-tags")
      .then((r) => r.json())
      .then((d) => setCategoryTags(d.categoryTags || {}))
      .catch(() => {});
  }, []);

  // Load transactions when historia tab active or month/filter changes
  const loadTransactions = useCallback(() => {
    setLoadingTx(true);
    const url = histFilter === "uncategorized"
      ? `/api/finanse/transactions?uncategorized=true`
      : `/api/finanse/transactions?month=${histMonth}`;
    fetch(url)
      .then((r) => r.json())
      .then((d) => setTransactions(d.transactions || []))
      .catch(() => {})
      .finally(() => setLoadingTx(false));
  }, [histMonth, histFilter]);

  function subcatsFor(categoryId: string) {
    return subcategories.filter((s) => s.category_id === categoryId);
  }

  useEffect(() => {
    if (tab === "historia") loadTransactions();
    if (tab === "budzet") {
      setLoadingTx(true);
      fetch(`/api/finanse/transactions?month=${histMonth}`)
        .then((r) => r.json())
        .then((d) => setTransactions(d.transactions || []))
        .catch(() => {})
        .finally(() => setLoadingTx(false));
    }
  }, [tab, loadTransactions, histMonth]);

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
    setSavedCount(0);
    lookupRunRef.current++; // stop a lookup still running for the previous file
    setLookupProgress(null);

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
      setTagAssignments({});
      setSaveRules(rules);
      setUserOverrides(new Set());
      setSavedCount(0);

      // Background: look up what opaque intermediary payments were for (2 at a time)
      runIntermediaryLookups(
        ((data.transactions || []) as ImportedTransaction[]).filter((t) => t.needsLookup)
      );
    } catch {
      alert("Błąd podczas parsowania pliku");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function sameMerchantRows(tx: ImportedTransaction) {
    const key = tx.merchant.trim().toLowerCase();
    return importRows.filter(
      (t) => !t.isDuplicate && t.merchant.trim().toLowerCase() === key && t.importHash !== tx.importHash
    );
  }

  // Fuzzy match by first significant word (>=4 chars) in merchant name
  function fuzzyMerchantKey(name: string) {
    const words = name.trim().toUpperCase().split(/[\s/\-_]+/);
    return words.find((w) => w.length >= 4) || name.trim().toUpperCase().slice(0, 6);
  }

  function fuzzyMerchantMatches(tx: ImportedTransaction) {
    const key = fuzzyMerchantKey(tx.merchant);
    return importRows.filter(
      (t) =>
        !t.isDuplicate &&
        t.importHash !== tx.importHash &&
        t.merchant.toUpperCase().includes(key)
    );
  }

  function handleApplyToSimilar(tx: ImportedTransaction) {
    const catId = categoryAssignments[tx.importHash];
    if (!catId) return;
    const tag = tagAssignments[tx.importHash] || "";
    const matches = fuzzyMerchantMatches(tx);
    if (matches.length === 0) return;

    setCategoryAssignments((prev) => {
      const updated = { ...prev };
      for (const m of matches) updated[m.importHash] = catId;
      return updated;
    });
    if (tag) {
      setTagAssignments((prev) => {
        const updated = { ...prev };
        for (const m of matches) if (!updated[m.importHash]) updated[m.importHash] = tag;
        return updated;
      });
    }
    setSaveRules((prev) => {
      const updated = { ...prev, [tx.importHash]: true };
      for (const m of matches) updated[m.importHash] = true;
      return updated;
    });
    setAutoApplied(matches.length);
    setTimeout(() => setAutoApplied(0), 3000);
  }

  // Auto-apply category to all same-merchant transactions
  function handleCategoryChange(tx: ImportedTransaction, categoryId: string) {
    // Opaque intermediary: same "merchant" (e.g. PayPro) means different shops — don't copy.
    const matches = isOpaque(tx) ? [] : sameMerchantRows(tx);

    setCategoryAssignments((prev) => {
      const updated = { ...prev, [tx.importHash]: categoryId };
      if (categoryId) {
        for (const m of matches) updated[m.importHash] = categoryId;
      }
      return updated;
    });

    if (categoryId && matches.length > 0) {
      setSaveRules((prev) => {
        const updated = { ...prev, [tx.importHash]: true };
        for (const m of matches) updated[m.importHash] = true;
        return updated;
      });
      setAutoApplied(matches.length);
      setTimeout(() => setAutoApplied(0), 3000);
    }

    if (tx.aiSuggested || tx.needsLookup) {
      setUserOverrides((prev) => new Set(prev).add(tx.importHash));
    }
  }

  // Auto-apply tag + create new tag if needed
  async function handleTagBlur(tx: ImportedTransaction, value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;

    // Create new tag if doesn't exist yet
    if (!tags.some((t) => t.name === trimmed)) {
      const res = await fetch("/api/finanse/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (data.tag) {
        setTags((prev) => [...prev, data.tag].sort((a, b) => a.name.localeCompare(b.name)));
      }
    }

    // Auto-apply to all same-merchant rows
    const matches = sameMerchantRows(tx);
    if (matches.length > 0) {
      setTagAssignments((prev) => {
        const updated = { ...prev };
        for (const m of matches) updated[m.importHash] = trimmed;
        return updated;
      });
    }
  }

  function noteFor(t: ImportedTransaction): string | null {
    const note = rowNotes[t.importHash];
    return note && !NON_NOTES.has(note) ? note : null;
  }

  // Partial save — only transactions with category assigned
  async function handleSaveImport() {
    const toSave = importRows.filter((t) => !t.isDuplicate && categoryAssignments[t.importHash]);
    if (toSave.length === 0) return;

    setSaving(true);
    try {
      const transactions = toSave.map((t) => ({
        ...t,
        categoryId: categoryAssignments[t.importHash] || null,
        tag: tagAssignments[t.importHash] || null,
        notes: noteFor(t),
      }));

      const rulesToSave: { pattern: string; categoryId: string }[] = [];
      for (const tx of toSave) {
        if (saveRules[tx.importHash] && categoryAssignments[tx.importHash] && !isOpaque(tx)) {
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
        const savedHashes = new Set(toSave.map((t) => t.importHash));
        setImportRows((prev) => prev.filter((t) => !savedHashes.has(t.importHash)));
        setSavedCount((prev) => prev + data.saved);
      }
    } catch {
      alert("Błąd podczas zapisywania");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveUncategorized() {
    const toSave = newRows.filter((t) => !categoryAssignments[t.importHash]);
    if (toSave.length === 0) return;
    setSaving(true);
    try {
      const transactions = toSave.map((t) => ({
        ...t,
        categoryId: null,
        tag: null,
        notes: noteFor(t),
      }));
      const res = await fetch("/api/finanse/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactions, rules: [] }),
      });
      const data = await res.json();
      if (data.ok) {
        const savedHashes = new Set(toSave.map((t) => t.importHash));
        setImportRows((prev) => prev.filter((t) => !savedHashes.has(t.importHash)));
        setSavedCount((prev) => prev + data.saved);
      }
    } catch {
      alert("Błąd podczas zapisywania");
    } finally {
      setSaving(false);
    }
  }

  // AI web-search analysis for uncategorized transactions
  async function handleAnalyze() {
    const uncategorized = newRows.filter((t) => !categoryAssignments[t.importHash]);
    if (uncategorized.length === 0) return;
    setAnalyzing(true);
    try {
      const res = await fetch("/api/finanse/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactions: uncategorized.slice(0, 10).map((t) => ({
            importHash: t.importHash,
            merchant: t.merchant,
            amount: t.amount,
            description: t.description,
            counterparty: t.counterparty,
          })),
        }),
      });
      const data = await res.json();
      if (data.suggestions) {
        setCategoryAssignments((prev) => {
          const updated = { ...prev };
          for (const [hash, s] of Object.entries(data.suggestions as Record<string, { categoryId: string }>)) {
            if (!updated[hash]) updated[hash] = s.categoryId;
          }
          return updated;
        });
        setUserOverrides((prev) => {
          const updated = new Set(prev);
          for (const hash of Object.keys(data.suggestions)) updated.add(hash);
          return updated;
        });
      }
    } catch {
      alert("Błąd analizy AI");
    } finally {
      setAnalyzing(false);
    }
  }

  // Single-row AI analysis — "CO TO JEST?"
  async function handleRowAnalyze(tx: ImportedTransaction) {
    setRowAnalyzing((prev) => ({ ...prev, [tx.importHash]: true }));
    try {
      const res = await fetch("/api/finanse/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactions: [{
            importHash: tx.importHash,
            merchant: tx.merchant,
            amount: tx.amount,
            description: tx.description,
            counterparty: tx.counterparty,
          }],
        }),
      });
      const data = await res.json();
      const suggestion = data.suggestions?.[tx.importHash];
      if (suggestion) {
        setRowNotes((prev) => ({ ...prev, [tx.importHash]: suggestion.note || "" }));
        if (suggestion.categoryId && !categoryAssignments[tx.importHash]) {
          handleCategoryChange(tx, suggestion.categoryId);
        }
      } else {
        setRowNotes((prev) => ({ ...prev, [tx.importHash]: "Brak sugestii" }));
      }
    } catch {
      setRowNotes((prev) => ({ ...prev, [tx.importHash]: "Błąd analizy" }));
    } finally {
      setRowAnalyzing((prev) => ({ ...prev, [tx.importHash]: false }));
    }
  }

  // Gmail lookup for a specific transaction
  async function handleGmailLookup(tx: ImportedTransaction) {
    setGmailLoading((prev) => ({ ...prev, [tx.importHash]: true }));
    try {
      const res = await fetch("/api/finanse/gmail-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: tx.date,
          merchant: tx.merchant,
          amount: tx.amount,
          importHash: tx.importHash,
        }),
      });
      const data = await res.json();
      if (data.error) { alert(data.error); return; }
      setGmailResults((prev) => ({ ...prev, [tx.importHash]: data.emails || [] }));
      if (data.suggestion?.categoryId) {
        setCategoryAssignments((prev) => ({ ...prev, [tx.importHash]: data.suggestion.categoryId }));
      }
    } catch {
      alert("Błąd pobierania maili");
    } finally {
      setGmailLoading((prev) => ({ ...prev, [tx.importHash]: false }));
    }
  }

  /** Returns true when a category was suggested. */
  async function handleSmartAnalyzeImport(tx: ImportedTransaction): Promise<boolean> {
    let found = false;
    setSmartAnalyzing((prev) => ({ ...prev, [tx.importHash]: true }));
    try {
      const res = await fetch("/api/finanse/smart-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: tx.importHash,
          date: tx.date,
          merchant: tx.merchant,
          amount: tx.amount,
          description: tx.description,
          counterparty: tx.counterparty,
          provider: isOpaque(tx) ? tx.intermediary?.provider : undefined,
        }),
      });
      const data = await res.json();
      if (data.suggestion?.note) {
        setRowNotes((prev) => ({ ...prev, [tx.importHash]: data.suggestion.note }));
      }
      const suggestedId: string | undefined = data.suggestion?.categoryId;
      if (suggestedId && isOpaque(tx)) {
        // Suggestion for this row only; never overwrites a category Jan already picked.
        found = true;
        setCategoryAssignments((prev) =>
          prev[tx.importHash] ? prev : { ...prev, [tx.importHash]: suggestedId }
        );
        setImportRows((prev) =>
          prev.map((t) => (t.importHash === tx.importHash ? { ...t, aiSuggested: true } : t))
        );
      } else if (suggestedId && !categoryAssignments[tx.importHash]) {
        found = true;
        handleCategoryChange(tx, suggestedId);
      }
      if (data.emails?.length) {
        setGmailResults((prev) => ({ ...prev, [tx.importHash]: data.emails }));
      }
    } catch {
      setRowNotes((prev) => ({ ...prev, [tx.importHash]: "Błąd analizy" }));
    } finally {
      setSmartAnalyzing((prev) => ({ ...prev, [tx.importHash]: false }));
    }
    return found;
  }

  // Client-side loop: one request per row (each within its own Vercel time limit), max 2 at once.
  async function runIntermediaryLookups(rows: ImportedTransaction[]) {
    const runId = ++lookupRunRef.current;
    if (rows.length === 0) return;
    let next = 0;
    let done = 0;
    let found = 0;
    setLookupProgress({ done, total: rows.length, found });
    const worker = async () => {
      while (next < rows.length && lookupRunRef.current === runId) {
        const tx = rows[next++];
        const ok = await handleSmartAnalyzeImport(tx);
        if (lookupRunRef.current !== runId) return;
        done++;
        if (ok) found++;
        setLookupProgress({ done, total: rows.length, found });
      }
    };
    await Promise.all([worker(), worker()]);
  }

  async function handleSmartAnalyzeHistory(tx: SavedTransaction) {
    setSmartAnalyzing((prev) => ({ ...prev, [tx.id]: true }));
    try {
      const merchantFromDesc = tx.description?.split(" ").slice(0, 3).join(" ") || "";
      const res = await fetch("/api/finanse/smart-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: tx.id,
          date: tx.date,
          merchant: tx.counterparty || merchantFromDesc,
          amount: tx.amount,
          description: tx.description,
          counterparty: tx.counterparty,
        }),
      });
      const data = await res.json();
      const note = data.suggestion?.note || "Brak sugestii";
      setHistNotes((prev) => ({ ...prev, [tx.id]: note }));
      if (data.suggestion?.categoryId && !tx.category_id) {
        updateCategoryAndSubcategory(tx.id, data.suggestion.categoryId, null);
      }
    } catch {
      setHistNotes((prev) => ({ ...prev, [tx.id]: "Błąd analizy" }));
    } finally {
      setSmartAnalyzing((prev) => ({ ...prev, [tx.id]: false }));
    }
  }

  /* ── Historia actions ──────────────────────────── */
  async function updateCategoryAndSubcategory(txId: string, categoryId: string, subcategoryId: string | null) {
    await fetch(`/api/finanse/transactions?id=${txId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId, subcategoryId: subcategoryId || null }),
    });
    const cat = categories.find((c) => c.id === categoryId) || null;
    const subcat = subcategoryId ? subcategories.find((s) => s.id === subcategoryId) || null : null;
    setTransactions((prev) =>
      prev.map((t) =>
        t.id === txId
          ? {
              ...t,
              category_id: categoryId || null,
              subcategory_id: subcategoryId || null,
              finance_categories: cat ? { id: cat.id, name: cat.name, type: cat.type } : null,
              finance_subcategories: subcat ? { id: subcat.id, name: subcat.name } : null,
            }
          : t
      )
    );
  }

  async function savePendingCategory(tx: SavedTransaction) {
    const categoryId = pendingCategories[tx.id];
    if (!categoryId) return;
    const subcategoryId = pendingSubcategories[tx.id] ?? null;
    await updateCategoryAndSubcategory(tx.id, categoryId, subcategoryId);
    setPendingCategories((prev) => { const n = { ...prev }; delete n[tx.id]; return n; });
    setPendingSubcategories((prev) => { const n = { ...prev }; delete n[tx.id]; return n; });
  }

  async function updateTag(txId: string, tag: string) {
    await fetch(`/api/finanse/transactions?id=${txId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag }),
    });
    setHistTagValues((prev) => ({ ...prev, [txId]: tag }));
    if (tag && !tags.some((t) => t.name === tag)) {
      const res = await fetch("/api/finanse/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: tag }),
      });
      const data = await res.json();
      if (data.tag) setTags((prev) => [...prev, data.tag].sort((a, b) => a.name.localeCompare(b.name)));
    }
    setTransactions((prev) =>
      prev.map((t) => (t.id === txId ? { ...t, tag: tag || null } : t))
    );
  }

  async function updateNotes(txId: string, notes: string) {
    await fetch(`/api/finanse/transactions?id=${txId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    });
    setHistUserNotes((prev) => ({ ...prev, [txId]: notes }));
    setTransactions((prev) =>
      prev.map((t) => (t.id === txId ? { ...t, notes: notes || null } : t))
    );
  }

  async function saveHistRule(tx: SavedTransaction) {
    const pattern = histMerchantKey(tx);
    if (!pattern || pattern.length < 3 || !tx.category_id) return;
    const subcategoryId = tx.subcategory_id || pendingSubcategories[tx.id] || null;
    await fetch("/api/finanse/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pattern, categoryId: tx.category_id, subcategoryId }),
    });
    setSavedRuleIds((prev) => ({ ...prev, [tx.id]: pattern }));
  }

  function extractMerchantName(description: string): string {
    const cardMatch = description.match(/PŁATNOŚĆ KARTĄ [\d,.]+ PLN (.+)/);
    if (cardMatch) return cardMatch[1].trim();
    const blikMatch = description.match(/Zakup BLIK (.+?) ref:/);
    if (blikMatch) return blikMatch[1].trim();
    const standingMatch = description.match(/Platnosc powtarzalna ([^\s].*?) (sp\b|S\.A\.|ul\.|ref:|$)/i);
    if (standingMatch) return standingMatch[1].trim();
    return description;
  }

  function histMerchantKey(tx: SavedTransaction) {
    const src = tx.merchant || tx.counterparty || extractMerchantName(tx.description);
    return src.trim().toUpperCase().split(/[\s/\-_]+/)[0];
  }

  function similarHistTransactions(tx: SavedTransaction) {
    const key = histMerchantKey(tx);
    if (key.length < 3) return [];
    return transactions.filter(
      (t) => t.id !== tx.id && histMerchantKey(t) === key
    );
  }

  async function applyToSimilarHistory(tx: SavedTransaction) {
    const effectiveCategoryId = pendingCategories[tx.id] ?? tx.category_id;
    if (!effectiveCategoryId) return;
    const effectiveSubcategoryId = pendingSubcategories[tx.id] ?? tx.subcategory_id ?? null;
    const similar = similarHistTransactions(tx);
    if (similar.length === 0) return;
    const cat = categories.find((c) => c.id === effectiveCategoryId) || null;
    const subcat = effectiveSubcategoryId ? subcategories.find((s) => s.id === effectiveSubcategoryId) || null : null;
    const currentTag = histTagValues[tx.id] ?? (tx.tag || "");
    const allIds = [tx.id, ...similar.map((s) => s.id)];
    setTransactions((prev) =>
      prev.map((t) =>
        allIds.includes(t.id)
          ? {
              ...t,
              category_id: effectiveCategoryId,
              subcategory_id: effectiveSubcategoryId,
              finance_categories: cat ? { id: cat.id, name: cat.name, type: cat.type } : null,
              finance_subcategories: subcat ? { id: subcat.id, name: subcat.name } : null,
              tag: currentTag || null,
            }
          : t
      )
    );
    setPendingCategories((prev) => { const n = { ...prev }; allIds.forEach((id) => delete n[id]); return n; });
    setPendingSubcategories((prev) => { const n = { ...prev }; allIds.forEach((id) => delete n[id]); return n; });
    if (currentTag) {
      setHistTagValues((prev) => {
        const updated = { ...prev };
        allIds.forEach((id) => { updated[id] = currentTag; });
        return updated;
      });
    }
    const effectiveTx = { ...tx, category_id: effectiveCategoryId, subcategory_id: effectiveSubcategoryId };
    await Promise.all([
      ...allIds.map((id) =>
        fetch(`/api/finanse/transactions?id=${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ categoryId: effectiveCategoryId, subcategoryId: effectiveSubcategoryId, tag: currentTag || "" }),
        })
      ),
      saveHistRule(effectiveTx),
    ]);
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

  async function addSubcategory(categoryId: string, name: string) {
    if (!name.trim()) return;
    const res = await fetch("/api/finanse/subcategories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), categoryId }),
    });
    const data = await res.json();
    if (data.subcategory) {
      setSubcategories((prev) => [...prev, data.subcategory].sort((a, b) => a.name.localeCompare(b.name)));
    }
  }

  async function deleteSubcategory(id: string) {
    if (!confirm("Usunąć podkategorię? Transakcje stracą przypisanie.")) return;
    await fetch(`/api/finanse/subcategories?id=${id}`, { method: "DELETE" });
    setSubcategories((prev) => prev.filter((s) => s.id !== id));
  }

  async function addTag() {
    if (!newTagName.trim()) return;
    const res = await fetch("/api/finanse/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newTagName.trim() }),
    });
    const data = await res.json();
    if (data.tag) {
      setTags((prev) => [...prev, data.tag].sort((a, b) => a.name.localeCompare(b.name)));
      setNewTagName("");
    }
  }

  async function deleteTag(id: string) {
    await fetch(`/api/finanse/tags?id=${id}`, { method: "DELETE" });
    setTags((prev) => prev.filter((t) => t.id !== id));
    setCategoryTags((prev) => {
      const updated = { ...prev };
      for (const catId of Object.keys(updated)) {
        updated[catId] = updated[catId].filter((t) => t.id !== id);
      }
      return updated;
    });
  }

  async function addCategoryTag(categoryId: string, tagId: string) {
    await fetch("/api/finanse/category-tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId, tagId }),
    });
    const tag = tags.find((t) => t.id === tagId);
    if (tag) {
      setCategoryTags((prev) => ({
        ...prev,
        [categoryId]: [...(prev[categoryId] || []), tag].sort((a, b) => a.name.localeCompare(b.name)),
      }));
    }
  }

  async function removeCategoryTag(categoryId: string, tagId: string) {
    await fetch(`/api/finanse/category-tags?categoryId=${categoryId}&tagId=${tagId}`, { method: "DELETE" });
    setCategoryTags((prev) => ({
      ...prev,
      [categoryId]: (prev[categoryId] || []).filter((t) => t.id !== tagId),
    }));
  }

  /* ── Render ──────────────────────────────────── */
  const newRows = importRows.filter((t) => !t.isDuplicate);
  const totalPages = Math.ceil(newRows.length / IMPORT_PAGE_SIZE);
  const visibleRows = newRows.slice(importPage * IMPORT_PAGE_SIZE, (importPage + 1) * IMPORT_PAGE_SIZE);
  const expenseCategories = categories.filter((c) => c.type === "expense");
  const incomeCategories = categories.filter((c) => c.type === "income");

  // Historia / Budżet stats
  const totalExpenses = transactions
    .filter((t) => (t.amount || 0) < 0)
    .reduce((s, t) => s + Math.abs(t.amount || 0), 0);
  const totalIncome = transactions
    .filter((t) => (t.amount || 0) > 0)
    .reduce((s, t) => s + (t.amount || 0), 0);

  // Budget: group expenses by category
  type CategoryTotal = { id: string | null; name: string; total: number; count: number };
  const expenseByCat: CategoryTotal[] = (() => {
    const map = new Map<string, CategoryTotal>();
    for (const tx of transactions.filter((t) => (t.amount || 0) < 0)) {
      const key = tx.category_id || "__none__";
      const name = tx.finance_categories?.name || "Bez kategorii";
      const existing = map.get(key) || { id: tx.category_id || null, name, total: 0, count: 0 };
      existing.total += Math.abs(tx.amount || 0);
      existing.count += 1;
      map.set(key, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  })();

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
          {(["import", "historia", "budzet", "kategorie"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                tab === t
                  ? "bg-white text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "import" ? "Import" : t === "historia" ? "Historia" : t === "budzet" ? "Budżet" : "Kategorie"}
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

            {/* Gmail status */}
            <div className="mt-4 flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
              {gmailConnected ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    ✅ Gmail połączony ({session?.user?.email}) — przyciski 📧 aktywne
                  </p>
                  <button
                    onClick={() => signIn("google")}
                    className="ml-4 shrink-0 text-xs text-muted-foreground underline hover:text-foreground"
                  >
                    Odśwież dostęp
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm text-blue-700">
                    Połącz Gmail żeby AI analizowało maile przy niejasnych transakcjach (BLIK, PayPal).
                  </p>
                  <button
                    onClick={() => signIn("google")}
                    className="ml-4 shrink-0 rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100"
                  >
                    Połącz Gmail
                  </button>
                </>
              )}
            </div>

            {importing && (
              <div className="mt-4 text-center text-sm text-muted-foreground">Parsowanie pliku...</div>
            )}

            {/* Stats */}
            {importStats && (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                {[
                  { label: "Wszystkich", value: importStats.total, color: "text-foreground" },
                  { label: "Nowych", value: importStats.new, color: "text-emerald-600" },
                  { label: "Duplikatów", value: importStats.duplicates, color: "text-muted-foreground" },
                  { label: "Sugestii AI", value: importStats.aiSuggested, color: "text-amber-500" },
                  { label: "Do przypisania", value: importStats.needsReview, color: "text-red-500" },
                ].map((s) => (
                  <div key={s.label} className="rounded-xl border border-border bg-card p-3 text-center">
                    <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Intermediary lookup progress */}
            {lookupProgress && (
              <div className="mt-4 rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground">
                {lookupProgress.done < lookupProgress.total
                  ? `🔎 Rozpoznaję płatności przez pośredników: ${lookupProgress.done} / ${lookupProgress.total}`
                  : `🔎 Rozpoznano ${lookupProgress.found} z ${lookupProgress.total} — sprawdź propozycje`}
                {!gmailConnected && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    ·{" "}
                    <button onClick={() => signIn("google")} className="underline hover:text-foreground">
                      Gmail niepołączony
                    </button>{" "}
                    — szukam tylko w internecie
                  </span>
                )}
              </div>
            )}

            {/* Transaction review table */}
            {newRows.length > 0 && (
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">
                    Przejrzyj i przypisz kategorie ({newRows.length} transakcji)
                  </p>
                  <button
                    onClick={handleAnalyze}
                    disabled={analyzing || newRows.filter((t) => !categoryAssignments[t.importHash]).length === 0}
                    className="flex items-center gap-1.5 rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-100 disabled:opacity-40"
                  >
                    {analyzing ? "Analizuję..." : `🔍 Analizuj AI (${newRows.filter((t) => !categoryAssignments[t.importHash]).length} bez kategorii)`}
                  </button>
                </div>
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Data</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Opis / Merchant</th>
                        <th className="px-3 py-2 text-right font-medium text-muted-foreground">Kwota</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Kategoria</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Tag</th>
                        <th className="px-3 py-2 text-center font-medium text-muted-foreground">📧</th>
                        <th className="px-3 py-2 text-center font-medium text-muted-foreground">Zapamiętaj</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {visibleRows.map((tx) => (
                        <React.Fragment key={tx.importHash}>
                        <tr className="hover:bg-muted/30">
                          <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                            {formatDate(tx.date)}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-start gap-1.5">
                              <div className="min-w-0">
                                <p className="font-medium text-foreground truncate max-w-[180px]" title={tx.merchant}>
                                  {tx.merchant}
                                </p>
                                {isOpaque(tx) && (
                                  <span className="inline-block rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                                    via {tx.intermediary?.provider}
                                  </span>
                                )}
                                {tx.counterparty && (
                                  <p className="text-xs text-muted-foreground truncate max-w-[180px]">{tx.counterparty}</p>
                                )}
                                {rowNotes[tx.importHash] && (
                                  <p className="mt-0.5 text-xs text-violet-700 max-w-[180px]" title={rowNotes[tx.importHash]}>
                                    🤖 {rowNotes[tx.importHash]}
                                  </p>
                                )}
                              </div>
                              <div className="flex gap-1 shrink-0">
                                <button
                                  onClick={() => handleRowAnalyze(tx)}
                                  disabled={rowAnalyzing[tx.importHash]}
                                  title="Szybka analiza AI (web search)"
                                  className="rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-40"
                                >
                                  {rowAnalyzing[tx.importHash] ? "…" : "?"}
                                </button>
                                <button
                                  onClick={() => handleSmartAnalyzeImport(tx)}
                                  disabled={smartAnalyzing[tx.importHash]}
                                  title="Zbadaj szczegółowo: szuka w Gmail po kwocie + web search"
                                  className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-40"
                                >
                                  {smartAnalyzing[tx.importHash] ? "⏳" : "🕵️"}
                                </button>
                              </div>
                            </div>
                          </td>
                          <td className={`whitespace-nowrap px-3 py-2 text-right font-medium ${
                            tx.amount < 0 ? "text-red-600" : "text-emerald-600"
                          }`}>
                            {formatAmount(tx.amount)}
                          </td>
                          <td className="px-3 py-2">
                            {tx.aiSuggested && !userOverrides.has(tx.importHash) && (
                              <span
                                title="Sugestia AI — sprawdź i zatwierdź"
                                className="mb-1 inline-block rounded px-1 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-300"
                              >
                                AI
                              </span>
                            )}
                            <select
                              value={categoryAssignments[tx.importHash] || ""}
                              onChange={(e) => handleCategoryChange(tx, e.target.value)}
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
                            {(() => {
                              const hasCat = !!categoryAssignments[tx.importHash];
                              const similarCount = hasCat ? fuzzyMerchantMatches(tx).filter(m => !categoryAssignments[m.importHash]).length : 0;
                              if (!hasCat || similarCount === 0) return null;
                              return (
                                <button
                                  onClick={() => handleApplyToSimilar(tx)}
                                  title={`Zastosuj tę kategorię i tag do wszystkich podobnych merchantów (${similarCount})`}
                                  className="mt-1 w-full rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100"
                                >
                                  → {similarCount} podobnych
                                </button>
                              );
                            })()}
                          </td>
                          <td className="px-3 py-2">
                            {(() => {
                              const selectedCatId = categoryAssignments[tx.importHash];
                              const catTags = selectedCatId ? (categoryTags[selectedCatId] || []) : [];
                              const availableTags = catTags.length > 0 ? catTags : tags;
                              const listId = `tags-${tx.importHash}`;
                              return (
                                <>
                                  <input
                                    type="text"
                                    list={listId}
                                    value={tagAssignments[tx.importHash] || ""}
                                    onChange={(e) =>
                                      setTagAssignments((prev) => ({
                                        ...prev,
                                        [tx.importHash]: e.target.value,
                                      }))
                                    }
                                    onBlur={(e) => handleTagBlur(tx, e.target.value)}
                                    placeholder="Tag..."
                                    className="w-full rounded-lg border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                  />
                                  <datalist id={listId}>
                                    {availableTags.map((t) => (
                                      <option key={t.id} value={t.name} />
                                    ))}
                                  </datalist>
                                </>
                              );
                            })()}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {(() => {
                              const isBlikOrPaypal = /blik|paypal|apple\s?pay|przelewy24/i.test(tx.merchant + " " + tx.description);
                              const hasResults = gmailResults[tx.importHash];
                              if (!isBlikOrPaypal && !hasResults) return <span className="text-muted-foreground/30">—</span>;
                              return (
                                <button
                                  onClick={() => gmailConnected ? handleGmailLookup(tx) : signIn("google")}
                                  disabled={gmailLoading[tx.importHash]}
                                  title={gmailConnected ? "Szukaj w Gmail" : "Połącz Gmail żeby użyć tej funkcji"}
                                  className="text-sm disabled:opacity-40"
                                >
                                  {gmailLoading[tx.importHash] ? "⏳" : "📧"}
                                </button>
                              );
                            })()}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={(saveRules[tx.importHash] && !isOpaque(tx)) || false}
                              onChange={(e) =>
                                setSaveRules((prev) => ({
                                  ...prev,
                                  [tx.importHash]: e.target.checked,
                                }))
                              }
                              disabled={!categoryAssignments[tx.importHash] || isOpaque(tx)}
                              title={
                                isOpaque(tx)
                                  ? "Pośrednik płatności — reguła złapałaby różne sklepy"
                                  : "Zapamiętaj regułę dla tego merchanta"
                              }
                              className="h-4 w-4 cursor-pointer accent-emerald-500"
                            />
                          </td>
                        </tr>
                        {gmailResults[tx.importHash]?.length > 0 && (
                          <tr className="bg-blue-50/50">
                            <td colSpan={7} className="px-4 py-2">
                              <p className="mb-1 text-xs font-medium text-blue-700">Maile z tego okresu:</p>
                              <div className="space-y-1">
                                {gmailResults[tx.importHash].map((email, i) => (
                                  <div key={i} className="rounded border border-blue-200 bg-white px-2 py-1 text-xs">
                                    <span className="font-medium text-foreground">{email.subject}</span>
                                    <span className="ml-2 text-muted-foreground">{email.from}</span>
                                    <p className="mt-0.5 text-muted-foreground">{email.snippet}</p>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 && (
                  <div className="mt-3 flex items-center justify-center gap-2">
                    <button
                      onClick={() => setImportPage((p) => Math.max(0, p - 1))}
                      disabled={importPage === 0}
                      className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted disabled:opacity-40"
                    >
                      ← Poprzednia
                    </button>
                    <span className="text-sm text-muted-foreground">
                      Strona {importPage + 1} / {totalPages}
                      <span className="ml-2 text-xs">
                        ({importPage * IMPORT_PAGE_SIZE + 1}–{Math.min((importPage + 1) * IMPORT_PAGE_SIZE, newRows.length)} z {newRows.length})
                      </span>
                    </span>
                    <button
                      onClick={() => setImportPage((p) => Math.min(totalPages - 1, p + 1))}
                      disabled={importPage >= totalPages - 1}
                      className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted disabled:opacity-40"
                    >
                      Następna →
                    </button>
                  </div>
                )}

                {autoApplied > 0 && (
                  <div className="mt-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-700">
                    Zastosowano tę samą kategorię dla {autoApplied} podobnych transakcji
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-muted-foreground">
                    {savedCount > 0 && (
                      <span className="text-emerald-600 font-medium">Zapisano: {savedCount} · </span>
                    )}
                    Pozostało: {newRows.length} · Skategoryzowanych: {newRows.filter((t) => categoryAssignments[t.importHash]).length}
                  </div>
                  <div className="flex gap-2">
                    {newRows.filter((t) => !categoryAssignments[t.importHash]).length > 0 && (
                      <button
                        onClick={handleSaveUncategorized}
                        disabled={saving}
                        title="Zapisuje do bazy bez kategorii — możesz uzupełnić później w zakładce Historia"
                        className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50"
                      >
                        {saving ? "Zapisuję..." : `Wyślij pozostałe do kolejki (${newRows.filter((t) => !categoryAssignments[t.importHash]).length})`}
                      </button>
                    )}
                    <button
                      onClick={handleSaveImport}
                      disabled={saving || newRows.filter((t) => categoryAssignments[t.importHash]).length === 0}
                      className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {saving ? "Zapisuję..." : `Zapisz skategoryzowane (${newRows.filter((t) => categoryAssignments[t.importHash]).length})`}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {savedCount > 0 && newRows.length === 0 && (
              <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
                <p className="font-medium text-emerald-700">Zapisano łącznie {savedCount} transakcji</p>
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
              <div className="flex rounded-lg border border-border overflow-hidden text-sm">
                <button
                  onClick={() => setHistFilter("all")}
                  className={`px-3 py-2 transition-colors ${histFilter === "all" ? "bg-emerald-600 text-white font-medium" : "bg-background text-muted-foreground hover:text-foreground"}`}
                >
                  Wszystkie
                </button>
                <button
                  onClick={() => setHistFilter("uncategorized")}
                  className={`px-3 py-2 border-l border-border transition-colors ${histFilter === "uncategorized" ? "bg-amber-500 text-white font-medium" : "bg-background text-muted-foreground hover:text-foreground"}`}
                >
                  Do kategoryzacji
                  {histFilter !== "uncategorized" && transactions.filter(t => !t.category_id).length > 0 && (
                    <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                      {transactions.filter(t => !t.category_id).length}
                    </span>
                  )}
                </button>
              </div>
              {histFilter === "all" && (
                <input
                  type="month"
                  value={histMonth}
                  onChange={(e) => setHistMonth(e.target.value)}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              )}
              {histFilter === "all" && (
                <button
                  onClick={handleExport}
                  className="ml-auto flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
                >
                  ↓ Eksportuj do Budget.csv
                </button>
              )}
            </div>

            {/* Bulk dismiss in Do kategoryzacji */}
            {histFilter === "uncategorized" && !loadingTx && transactions.some((t) => t.category_id) && (
              <div className="mt-3 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2">
                <span className="text-sm text-emerald-700">
                  {transactions.filter((t) => t.category_id).length} transakcji już skategoryzowanych
                </span>
                <button
                  onClick={() => setTransactions((prev) => prev.filter((t) => !t.category_id))}
                  className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  Ukryj skategoryzowane ✓
                </button>
              </div>
            )}

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
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Tag</th>
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
                        <td className="px-3 py-2 max-w-[320px]">
                          <p className="break-words text-foreground">
                            {tx.description}
                          </p>
                          {tx.counterparty && (
                            <p className="text-xs text-muted-foreground break-words">{tx.counterparty}</p>
                          )}
                          {histNotes[tx.id] && (
                            <p className="mt-0.5 text-xs text-blue-700 break-words" title={histNotes[tx.id]}>
                              🕵️ {histNotes[tx.id]}
                            </p>
                          )}
                          <input
                            type="text"
                            placeholder="Dodaj notatkę..."
                            value={histUserNotes[tx.id] ?? (tx.notes || "")}
                            onChange={(e) => setHistUserNotes((prev) => ({ ...prev, [tx.id]: e.target.value }))}
                            onBlur={(e) => { if (e.target.value !== (tx.notes || "")) updateNotes(tx.id, e.target.value); }}
                            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                            className="mt-1 w-full rounded border border-border bg-background px-1.5 py-0.5 text-xs text-muted-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                        </td>
                        <td className="px-3 py-2">
                          {(() => {
                            const effectiveCategoryId = pendingCategories[tx.id] ?? tx.category_id ?? "";
                            const effectiveSubcategoryId = pendingSubcategories[tx.id] ?? tx.subcategory_id ?? "";
                            const isPending = tx.id in pendingCategories || tx.id in pendingSubcategories;
                            const effectiveTx = { ...tx, category_id: effectiveCategoryId || null, subcategory_id: effectiveSubcategoryId || null };
                            const similar = similarHistTransactions(effectiveTx);
                            const catSubcats = subcatsFor(effectiveCategoryId);
                            return (
                              <>
                                <div className="flex flex-col gap-1">
                                  <div className="flex items-center gap-1.5">
                                    <select
                                      value={effectiveCategoryId}
                                      onChange={(e) => {
                                        setPendingCategories((prev) => ({ ...prev, [tx.id]: e.target.value }));
                                        setPendingSubcategories((prev) => { const n = { ...prev }; delete n[tx.id]; return n; });
                                      }}
                                      className={`rounded-lg border px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 ${isPending ? "border-amber-400 bg-amber-50" : "border-border bg-background"}`}
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
                                    {isPending && (
                                      <button
                                        onClick={() => savePendingCategory(tx)}
                                        className="rounded-lg border border-emerald-400 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                                      >
                                        Zapisz
                                      </button>
                                    )}
                                  </div>
                                  {effectiveCategoryId && catSubcats.length > 0 && (
                                    <select
                                      value={effectiveSubcategoryId}
                                      onChange={(e) => setPendingSubcategories((prev) => ({ ...prev, [tx.id]: e.target.value }))}
                                      className={`rounded-lg border px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 ${tx.id in pendingSubcategories ? "border-amber-400 bg-amber-50" : "border-border bg-background"}`}
                                    >
                                      <option value="">— podkategoria —</option>
                                      {catSubcats.map((s) => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                      ))}
                                    </select>
                                  )}
                                </div>
                                {effectiveCategoryId && (
                                  <div className="mt-1 flex flex-col gap-0.5">
                                    {similar.length > 0 && (
                                      <button
                                        onClick={() => applyToSimilarHistory(effectiveTx)}
                                        className="text-left text-[10px] font-medium text-emerald-700 hover:underline"
                                      >
                                        → Zastosuj do {similar.length} podobnych
                                      </button>
                                    )}
                                    {savedRuleIds[tx.id] ? (
                                      <span className="text-[10px] font-medium text-emerald-600">
                                        ✓ Reguła zapisana: <code className="rounded bg-emerald-100 px-1 font-mono">{savedRuleIds[tx.id]}</code>
                                      </span>
                                    ) : (
                                      <label className="flex cursor-pointer items-center gap-1 text-[10px] text-muted-foreground hover:text-emerald-700">
                                        <input
                                          type="checkbox"
                                          onChange={(e) => { if (e.target.checked) saveHistRule(effectiveTx); }}
                                          className="h-3 w-3 cursor-pointer accent-emerald-500"
                                        />
                                        Zapamiętaj regułę
                                      </label>
                                    )}
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            list={`hist-tags-${tx.id}`}
                            value={histTagValues[tx.id] ?? (tx.tag || "")}
                            onChange={(e) => setHistTagValues((prev) => ({ ...prev, [tx.id]: e.target.value }))}
                            onBlur={(e) => {
                              const val = e.target.value;
                              if (val !== (tx.tag || "")) updateTag(tx.id, val);
                            }}
                            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                            placeholder="Tag..."
                            className="w-full rounded-lg border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                          <datalist id={`hist-tags-${tx.id}`}>
                            {tags.map((t) => (
                              <option key={t.id} value={t.name} />
                            ))}
                          </datalist>
                        </td>
                        <td className={`whitespace-nowrap px-3 py-2 text-right font-medium ${
                          tx.amount < 0 ? "text-red-600" : "text-emerald-600"
                        }`}>
                          {formatAmount(tx.amount)}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            {histFilter === "uncategorized" && tx.category_id && (
                              <button
                                onClick={() => setTransactions((prev) => prev.filter((t) => t.id !== tx.id))}
                                title="Gotowe — usuń z listy"
                                className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100"
                              >
                                ✓
                              </button>
                            )}
                            <button
                              onClick={() => handleSmartAnalyzeHistory(tx)}
                              disabled={smartAnalyzing[tx.id]}
                              title="Zbadaj szczegółowo: szuka w Gmail po kwocie + web search"
                              className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-40"
                            >
                              {smartAnalyzing[tx.id] ? "⏳" : "🕵️"}
                            </button>
                            <button
                              onClick={() => deleteTransaction(tx.id)}
                              className="text-xs text-muted-foreground hover:text-red-600"
                            >
                              ✕
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── BUDŻET TAB ──────────────────────────────── */}
        {tab === "budzet" && (
          <div className="mt-6">
            {/* Month picker + export */}
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

            {loadingTx ? (
              <p className="mt-6 text-center text-sm text-muted-foreground">Ładowanie...</p>
            ) : transactions.length === 0 ? (
              <div className="mt-6 rounded-xl border border-border bg-card p-8 text-center">
                <p className="text-sm text-muted-foreground">Brak transakcji w tym miesiącu.</p>
              </div>
            ) : (
              <>
                {/* Summary cards */}
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <div className="rounded-xl border border-border bg-card p-4 text-center">
                    <p className="text-2xl font-bold text-red-600">−{formatAmount(totalExpenses)}</p>
                    <p className="text-xs text-muted-foreground mt-1">Wydatki</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4 text-center">
                    <p className="text-2xl font-bold text-emerald-600">+{formatAmount(totalIncome)}</p>
                    <p className="text-xs text-muted-foreground mt-1">Przychody</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4 text-center">
                    <p className={`text-2xl font-bold ${totalIncome - totalExpenses >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {formatAmount(totalIncome - totalExpenses)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Bilans</p>
                  </div>
                </div>

                {/* Category breakdown */}
                <div className="mt-4 rounded-xl border border-border bg-card overflow-hidden">
                  <div className="border-b border-border bg-muted/50 px-4 py-2">
                    <p className="text-sm font-semibold text-foreground">Wydatki wg kategorii</p>
                  </div>
                  <div className="divide-y divide-border">
                    {expenseByCat.map((row) => {
                      const pct = totalExpenses > 0 ? (row.total / totalExpenses) * 100 : 0;
                      const catKey = row.id || "__none__";
                      const isExpanded = budgetExpandedCat === catKey;
                      const catTxs = transactions.filter((t) =>
                        (t.amount || 0) < 0 && (row.id ? t.category_id === row.id : !t.category_id)
                      );
                      return (
                        <div key={catKey}>
                          <button
                            onClick={() => setBudgetExpandedCat(isExpanded ? null : catKey)}
                            className="w-full px-4 py-3 text-left hover:bg-muted/30 transition-colors"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm">{isExpanded ? "▾" : "▸"}</span>
                                <span className="text-sm font-medium text-foreground">{row.name}</span>
                                <span className="text-xs text-muted-foreground">({row.count} trans.)</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-xs text-muted-foreground">{pct.toFixed(1)}%</span>
                                <span className="text-sm font-bold text-red-600">−{formatAmount(row.total)}</span>
                              </div>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                              <div className="h-full rounded-full bg-red-400" style={{ width: `${pct}%` }} />
                            </div>
                          </button>

                          {isExpanded && (() => {
                            // Group by merchant
                            const merchantMap = new Map<string, { label: string; txs: typeof catTxs; total: number }>();
                            for (const tx of catTxs) {
                              const label = tx.merchant || extractMerchantName(tx.description);
                              const key = label.trim().toUpperCase().split(/[\s/\-_]+/)[0];
                              const existing = merchantMap.get(key) || { label, txs: [], total: 0 };
                              existing.txs.push(tx);
                              existing.total += Math.abs(tx.amount);
                              merchantMap.set(key, existing);
                            }
                            const merchants = Array.from(merchantMap.entries()).sort((a, b) => b[1].total - a[1].total);

                            return (
                              <div className="border-t border-border divide-y divide-border bg-muted/10">
                                {merchants.map(([mKey, { label, txs, total }]) => {
                                  const expandKey = `${catKey}::${mKey}`;
                                  const isMerchantExpanded = budgetExpandedMerchants.has(expandKey);
                                  return (
                                    <div key={mKey}>
                                      <button
                                        onClick={() => setBudgetExpandedMerchants((prev) => {
                                          const next = new Set(prev);
                                          next.has(expandKey) ? next.delete(expandKey) : next.add(expandKey);
                                          return next;
                                        })}
                                        className="w-full flex items-center justify-between px-6 py-2 hover:bg-muted/40 transition-colors"
                                      >
                                        <div className="flex items-center gap-2 text-sm">
                                          <span className="text-muted-foreground">{isMerchantExpanded ? "▾" : "▸"}</span>
                                          <span className="font-medium text-foreground">{label.split(/\s+/).slice(0, 4).join(" ")}</span>
                                          <span className="text-xs text-muted-foreground">({txs.length} trans.)</span>
                                        </div>
                                        <span className="text-sm font-semibold text-red-600">−{formatAmount(total)}</span>
                                      </button>

                                      {isMerchantExpanded && (() => {
                                        const sorted = [...txs].sort((a, b) => {
                                          let cmp = 0;
                                          if (budgetSortCol === "date") cmp = a.date.localeCompare(b.date);
                                          else if (budgetSortCol === "amount") cmp = Math.abs(a.amount) - Math.abs(b.amount);
                                          else cmp = a.description.localeCompare(b.description);
                                          return budgetSortDir === "asc" ? cmp : -cmp;
                                        });
                                        const page = budgetMerchantPage[expandKey] || 0;
                                        const totalPg = Math.ceil(sorted.length / BUDGET_TX_PAGE_SIZE);
                                        const pageTxs = sorted.slice(page * BUDGET_TX_PAGE_SIZE, (page + 1) * BUDGET_TX_PAGE_SIZE);
                                        const toggleSort = (col: typeof budgetSortCol) => {
                                          if (budgetSortCol === col) setBudgetSortDir((d) => d === "asc" ? "desc" : "asc");
                                          else { setBudgetSortCol(col); setBudgetSortDir("desc"); }
                                        };
                                        const sortIcon = (col: typeof budgetSortCol) =>
                                          budgetSortCol === col ? (budgetSortDir === "asc" ? " ↑" : " ↓") : " ↕";
                                        return (
                                          <div className="overflow-x-auto bg-white">
                                            <table className="w-full text-sm">
                                              <thead>
                                                <tr className="border-b border-border bg-muted/30">
                                                  <th onClick={() => toggleSort("date")} className="cursor-pointer px-4 py-1.5 text-left text-xs font-medium text-muted-foreground hover:text-foreground">Data{sortIcon("date")}</th>
                                                  <th onClick={() => toggleSort("description")} className="cursor-pointer px-4 py-1.5 text-left text-xs font-medium text-muted-foreground hover:text-foreground">Opis{sortIcon("description")}</th>
                                                  <th className="px-4 py-1.5 text-left text-xs font-medium text-muted-foreground">Kategoria</th>
                                                  <th className="px-4 py-1.5 text-left text-xs font-medium text-muted-foreground">Tag</th>
                                                  <th onClick={() => toggleSort("amount")} className="cursor-pointer px-4 py-1.5 text-right text-xs font-medium text-muted-foreground hover:text-foreground">Kwota{sortIcon("amount")}</th>
                                                  <th className="px-2 py-1.5" />
                                                </tr>
                                              </thead>
                                              <tbody className="divide-y divide-border">
                                                {pageTxs.map((tx) => (
                                                  <tr key={tx.id} className="hover:bg-muted/20">
                                                    <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">{formatDate(tx.date)}</td>
                                                    <td className="px-4 py-2 max-w-[200px]">
                                                      <p className="break-words text-xs text-foreground">{tx.description}</p>
                                                      {histNotes[tx.id] && (
                                                        <p className="mt-0.5 text-xs text-blue-700">🕵️ {histNotes[tx.id]}</p>
                                                      )}
                                                      <input
                                                        type="text"
                                                        placeholder="Notatka..."
                                                        value={histUserNotes[tx.id] ?? (tx.notes || "")}
                                                        onChange={(e) => setHistUserNotes((prev) => ({ ...prev, [tx.id]: e.target.value }))}
                                                        onBlur={(e) => { if (e.target.value !== (tx.notes || "")) updateNotes(tx.id, e.target.value); }}
                                                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                                        className="mt-1 w-full rounded border border-border bg-background px-1.5 py-0.5 text-xs text-muted-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                                      />
                                                    </td>
                                                    <td className="px-4 py-2">
                                                      <select
                                                        value={tx.category_id || ""}
                                                        onChange={(e) => updateCategoryAndSubcategory(tx.id, e.target.value, null)}
                                                        className="rounded-lg border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                                      >
                                                        <option value="">— bez kategorii —</option>
                                                        <optgroup label="Wydatki">
                                                          {expenseCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                                                        </optgroup>
                                                        <optgroup label="Przychody">
                                                          {incomeCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                                                        </optgroup>
                                                      </select>
                                                    </td>
                                                    <td className="px-4 py-2">
                                                      <input
                                                        type="text"
                                                        list={`bud-tags-${tx.id}`}
                                                        value={histTagValues[tx.id] ?? (tx.tag || "")}
                                                        onChange={(e) => setHistTagValues((prev) => ({ ...prev, [tx.id]: e.target.value }))}
                                                        onBlur={(e) => { if (e.target.value !== (tx.tag || "")) updateTag(tx.id, e.target.value); }}
                                                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                                        placeholder="Tag..."
                                                        className="w-24 rounded-lg border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                                      />
                                                      <datalist id={`bud-tags-${tx.id}`}>
                                                        {tags.map((t) => <option key={t.id} value={t.name} />)}
                                                      </datalist>
                                                    </td>
                                                    <td className="whitespace-nowrap px-4 py-2 text-right text-xs font-medium text-red-600">
                                                      {formatAmount(tx.amount)}
                                                    </td>
                                                    <td className="px-2 py-2">
                                                      <button
                                                        onClick={() => handleSmartAnalyzeHistory(tx)}
                                                        disabled={smartAnalyzing[tx.id]}
                                                        title="Zbadaj: Gmail + web search"
                                                        className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700 hover:bg-blue-100 disabled:opacity-40"
                                                      >
                                                        {smartAnalyzing[tx.id] ? "⏳" : "🕵️"}
                                                      </button>
                                                    </td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                            {totalPg > 1 && (
                                              <div className="flex items-center justify-center gap-2 border-t border-border px-4 py-2">
                                                <button
                                                  onClick={() => setBudgetMerchantPage((p) => ({ ...p, [expandKey]: Math.max(0, (p[expandKey] || 0) - 1) }))}
                                                  disabled={page === 0}
                                                  className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-40"
                                                >← Poprzednia</button>
                                                <span className="text-xs text-muted-foreground">{page + 1} / {totalPg}</span>
                                                <button
                                                  onClick={() => setBudgetMerchantPage((p) => ({ ...p, [expandKey]: Math.min(totalPg - 1, (p[expandKey] || 0) + 1) }))}
                                                  disabled={page >= totalPg - 1}
                                                  className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-40"
                                                >Następna →</button>
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })()}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
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

            {/* Categories list with tags */}
            {(["expense", "income"] as const).map((type) => {
              const cats = categories.filter((c) => c.type === type);
              if (cats.length === 0) return null;
              return (
                <div key={type} className="rounded-xl border border-border bg-card p-4">
                  <p className="mb-3 text-sm font-semibold text-foreground">
                    {type === "expense" ? "Wydatki" : "Przychody"}
                  </p>
                  <div className="space-y-2">
                    {cats.map((c) => {
                      const assignedTags = categoryTags[c.id] || [];
                      const unassignedTags = tags.filter((t) => !assignedTags.some((at) => at.id === t.id));
                      return (
                        <div
                          key={c.id}
                          className="rounded-lg border border-border bg-background px-3 py-2"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-foreground min-w-[120px]">{c.name}</span>
                            <div className="flex flex-wrap items-center gap-1.5 flex-1">
                              {assignedTags.map((t) => (
                                <span
                                  key={t.id}
                                  className="flex items-center gap-1 rounded-full bg-emerald-100 border border-emerald-200 px-2 py-0.5 text-xs text-emerald-800"
                                >
                                  {t.name}
                                  <button
                                    onClick={() => removeCategoryTag(c.id, t.id)}
                                    className="hover:text-red-600 transition-colors"
                                  >
                                    ✕
                                  </button>
                                </span>
                              ))}
                              {unassignedTags.length > 0 && (
                                <select
                                  value=""
                                  onChange={(e) => { if (e.target.value) addCategoryTag(c.id, e.target.value); }}
                                  className="rounded-lg border border-dashed border-border bg-transparent px-2 py-0.5 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                >
                                  <option value="">+ tag</option>
                                  {unassignedTags.map((t) => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                  ))}
                                </select>
                              )}
                            </div>
                            <button
                              onClick={() => deleteCategory(c.id)}
                              className="ml-auto shrink-0 text-xs text-muted-foreground hover:text-red-600 transition-colors"
                            >
                              ✕
                            </button>
                          </div>
                          {/* Subcategories */}
                          {(() => {
                            const catSubcats = subcatsFor(c.id);
                            return (
                              <div className="mt-2 ml-2 border-l-2 border-border pl-3">
                                <div className="flex flex-wrap gap-1 mb-1">
                                  {catSubcats.map((s) => (
                                    <span
                                      key={s.id}
                                      className="flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-xs text-slate-700"
                                    >
                                      {s.name}
                                      <button
                                        onClick={() => deleteSubcategory(s.id)}
                                        className="hover:text-red-600 transition-colors"
                                      >
                                        ✕
                                      </button>
                                    </span>
                                  ))}
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="text"
                                    placeholder="+ podkategoria"
                                    value={newSubcatNames[c.id] || ""}
                                    onChange={(e) => setNewSubcatNames((prev) => ({ ...prev, [c.id]: e.target.value }))}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" && newSubcatNames[c.id]?.trim()) {
                                        addSubcategory(c.id, newSubcatNames[c.id]);
                                        setNewSubcatNames((prev) => ({ ...prev, [c.id]: "" }));
                                      }
                                    }}
                                    className="rounded border border-dashed border-border bg-transparent px-2 py-0.5 text-xs text-muted-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-emerald-500 w-36"
                                  />
                                  {newSubcatNames[c.id]?.trim() && (
                                    <button
                                      onClick={() => {
                                        addSubcategory(c.id, newSubcatNames[c.id]);
                                        setNewSubcatNames((prev) => ({ ...prev, [c.id]: "" }));
                                      }}
                                      className="text-xs text-emerald-700 hover:underline"
                                    >
                                      Dodaj
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Tags management */}
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="mb-3 text-sm font-medium text-foreground">Tagi</p>
              <div className="mb-3 flex gap-2">
                <input
                  type="text"
                  placeholder="Nowy tag (np. Żona)"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addTag()}
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <button
                  onClick={addTag}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  Dodaj
                </button>
              </div>
              {tags.length === 0 ? (
                <p className="text-sm text-muted-foreground">Brak tagów. Dodaj tagi żeby przypisywać je do transakcji.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {tags.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-sm"
                    >
                      <span>{t.name}</span>
                      <button
                        onClick={() => deleteTag(t.id)}
                        className="text-muted-foreground hover:text-red-600 transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

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
                        {r.finance_subcategories?.name && (
                          <span className="text-xs text-muted-foreground">/ {r.finance_subcategories.name}</span>
                        )}
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

export default function FinansePage() {
  return (
    <SessionProvider>
      <FinansePageInner />
    </SessionProvider>
  );
}
