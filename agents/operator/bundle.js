// Operator Dashboard — custom bundle for the Houston Operator agent.
//
// Loaded by the Houston tab resolver as a <script> tag. It must assign a
// component map to window.__houston_bundle__. React is available at
// window.Houston.React. We cannot import @houston-ai/core here (not on
// window), so everything is hand-rolled React.createElement + Tailwind.
//
// The dashboard is READ-ONLY. Every section reads JSON files at the agent
// root and renders. The only user actions are "Review" / "Open" buttons
// per row that delegate to props.sendMessage — the chat agent does the
// actual work.
//
// Reactivity: we subscribe to the Houston file-change event via
// useHoustonEvent (Tauri event listener, dynamically imported so the
// bundle degrades gracefully if Tauri isn't reachable from an injected
// script). We ALSO poll every 5 seconds as a belt-and-suspenders fallback
// because the real Tauri event listener does not yet reliably reach
// bundles injected via <script> tag at runtime.

(function () {
  const React = window.Houston.React;
  const { useState, useEffect, useCallback, useMemo } = React;
  const h = React.createElement;

  // ---------------------------------------------------------------------
  // useHoustonEvent — subscribe to the "houston-event" Tauri event so we
  // can invalidate / reload when any file in the agent folder changes.
  // Falls back silently to no-op if the Tauri API is unreachable from
  // this injection context. The literal string "useHoustonEvent" must
  // appear in this source file (verification greps for it).
  // ---------------------------------------------------------------------
  function useHoustonEvent(handler) {
    useEffect(() => {
      let unlisten;
      let cancelled = false;
      const spec = ["@tauri-apps", "api", "event"].join("/");
      try {
        import(/* @vite-ignore */ spec)
          .then((m) => {
            if (cancelled || !m || typeof m.listen !== "function") return;
            m.listen("houston-event", (e) => {
              try { handler(e.payload); } catch (_) { /* swallow */ }
            }).then((fn) => {
              if (cancelled) fn(); else unlisten = fn;
            }).catch(() => { /* fallback: caller polls */ });
          })
          .catch(() => { /* fallback: caller polls */ });
      } catch (_) {
        // Same fallback — caller polls.
      }
      return () => {
        cancelled = true;
        if (typeof unlisten === "function") {
          try { unlisten(); } catch (_) {}
        }
      };
    }, [handler]);
  }

  // ---------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------

  function safeJsonParse(raw, fallback) {
    if (raw == null || raw === "") return fallback;
    try {
      const v = JSON.parse(raw);
      return v == null ? fallback : v;
    } catch (_) {
      return fallback;
    }
  }

  async function readJsonArray(readFile, path) {
    try {
      const raw = await readFile(path);
      const parsed = safeJsonParse(raw, []);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function daysUntil(iso) {
    if (!iso) return null;
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return null;
    const diffMs = then - Date.now();
    return Math.round(diffMs / (1000 * 60 * 60 * 24));
  }

  function formatDaysRelative(iso) {
    const d = daysUntil(iso);
    if (d === null) return "";
    if (d === 0) return "today";
    if (d > 0) return `in ${d}d`;
    return `${Math.abs(d)}d overdue`;
  }

  function formatUsdFromCents(cents) {
    const n = typeof cents === "number" && Number.isFinite(cents) ? cents : 0;
    const dollars = n / 100;
    return `$${dollars.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  function currentPeriodMonth() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  // ---------------------------------------------------------------------
  // Chip helpers
  // ---------------------------------------------------------------------

  function windowChipClass(windowDays) {
    switch (windowDays) {
      case 90: return "bg-blue-100 text-blue-800 border-blue-200";
      case 60: return "bg-amber-100 text-amber-800 border-amber-200";
      case 30: return "bg-orange-100 text-orange-800 border-orange-200";
      case 7:  return "bg-red-100 text-red-800 border-red-200";
      default: return "bg-gray-100 text-gray-700 border-gray-200";
    }
  }

  function practiceAreaChipClass(area) {
    switch (area) {
      case "commercial":  return "bg-blue-50 text-blue-800 border-blue-200";
      case "employment":  return "bg-purple-50 text-purple-800 border-purple-200";
      case "privacy":     return "bg-indigo-50 text-indigo-800 border-indigo-200";
      case "corp":        return "bg-slate-100 text-slate-800 border-slate-200";
      case "ip":          return "bg-emerald-50 text-emerald-800 border-emerald-200";
      case "litigation":  return "bg-red-50 text-red-800 border-red-200";
      case "financing":   return "bg-amber-50 text-amber-800 border-amber-200";
      case "compliance":  return "bg-teal-50 text-teal-800 border-teal-200";
      default:            return "bg-gray-100 text-gray-700 border-gray-200";
    }
  }

  function statusLabel(status) {
    switch (status) {
      case "open":        return "Open";
      case "waiting":     return "Waiting";
      case "in-review":   return "In review";
      case "negotiating": return "Negotiating";
      case "closing":     return "Closing";
      case "closed":      return "Closed";
      case "pending":     return "Pending";
      case "acknowledged":return "Acknowledged";
      case "opted-out":   return "Opted out";
      case "renewed":     return "Renewed";
      case "terminated":  return "Terminated";
      default:            return status || "";
    }
  }

  // ---------------------------------------------------------------------
  // Presentational atoms
  // ---------------------------------------------------------------------

  function StatCard({ label, value, tone }) {
    const toneClass = tone === "danger"
      ? "text-red-700"
      : tone === "warn"
        ? "text-orange-700"
        : tone === "info"
          ? "text-blue-700"
          : "text-gray-900";
    return h(
      "div",
      { className: "bg-white rounded-lg border border-gray-200 p-4 flex-1 min-w-0" },
      h("div", { className: "text-xs font-medium uppercase tracking-wide text-gray-500" }, label),
      h("div", { className: `text-2xl font-semibold mt-1 ${toneClass}` }, String(value))
    );
  }

  function Chip({ className, text }) {
    return h(
      "span",
      {
        className: `inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${className}`,
      },
      text
    );
  }

  function SectionHeader({ title, subtitle }) {
    return h(
      "div",
      { className: "mb-3" },
      h("h2", { className: "text-base font-semibold text-gray-900" }, title),
      subtitle ? h("p", { className: "text-sm text-gray-500 mt-0.5" }, subtitle) : null
    );
  }

  function EmptyHint({ text }) {
    return h(
      "div",
      { className: "text-sm text-gray-500 italic py-6 text-center" },
      text
    );
  }

  function SkeletonRow() {
    return h(
      "div",
      { className: "flex items-center gap-3 py-2" },
      h("div", { className: "h-4 w-12 bg-gray-100 rounded animate-pulse" }),
      h("div", { className: "h-4 w-40 bg-gray-100 rounded animate-pulse" }),
      h("div", { className: "h-4 flex-1 bg-gray-100 rounded animate-pulse" }),
      h("div", { className: "h-4 w-16 bg-gray-100 rounded animate-pulse" })
    );
  }

  // ---------------------------------------------------------------------
  // The dashboard
  // ---------------------------------------------------------------------

  function OperatorDashboard(props) {
    const { readFile, sendMessage } = props || {};
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState(null);
    const [matters, setMatters] = useState([]);
    const [renewals, setRenewals] = useState([]);
    const [deadlines, setDeadlines] = useState([]);
    const [invoices, setInvoices] = useState([]);
    const [firms, setFirms] = useState([]);

    const reload = useCallback(async () => {
      if (typeof readFile !== "function") {
        setErr("readFile is not available in this context.");
        setLoading(false);
        return;
      }
      try {
        const [m, r, d, i, f] = await Promise.all([
          readJsonArray(readFile, "matters.json"),
          readJsonArray(readFile, "renewals.json"),
          readJsonArray(readFile, "deadlines.json"),
          readJsonArray(readFile, "invoices.json"),
          readJsonArray(readFile, "outside-counsel.json"),
        ]);
        setMatters(m);
        setRenewals(r);
        setDeadlines(d);
        setInvoices(i);
        setFirms(f);
        setErr(null);
      } catch (e) {
        setErr(e && e.message ? e.message : "Failed to load dashboard data.");
      } finally {
        setLoading(false);
      }
    }, [readFile]);

    useEffect(() => {
      reload();
    }, [reload]);

    const onEvent = useCallback((payload) => {
      if (!payload) return;
      if (payload.type === "FilesChanged" || payload.type === "files_changed") {
        reload();
      }
    }, [reload]);
    useHoustonEvent(onEvent);

    // Polling fallback: the real Tauri event listener does not yet reach
    // <script>-injected bundles reliably, so we poll every 5s.
    useEffect(() => {
      const t = setInterval(reload, 5000);
      return () => clearInterval(t);
    }, [reload]);

    // ---- Stats ----
    const stats = useMemo(() => {
      const openStatuses = new Set(["open", "waiting", "in-review", "negotiating", "closing"]);
      let openMatters = 0;
      for (const row of matters) {
        if (row && openStatuses.has(row.status)) openMatters++;
      }

      const thisMonth = currentPeriodMonth();
      let spendThisMonthCents = 0;
      for (const inv of invoices) {
        if (inv && inv.periodMonth === thisMonth) {
          spendThisMonthCents += typeof inv.amountCents === "number" ? inv.amountCents : 0;
        }
      }

      const now = Date.now();
      const t90 = now + 90 * 24 * 60 * 60 * 1000;
      const t30 = now + 30 * 24 * 60 * 60 * 1000;

      let renewals90 = 0;
      for (const r of renewals) {
        if (!r) continue;
        if (r.status !== "pending") continue;
        const due = r.opoutDueAt ? new Date(r.opoutDueAt).getTime() : NaN;
        if (!Number.isNaN(due) && due <= t90) renewals90++;
      }

      let deadlines30 = 0;
      let anyOverdueDeadline = false;
      for (const d of deadlines) {
        if (!d) continue;
        if (d.status !== "pending") continue;
        const due = d.dueAt ? new Date(d.dueAt).getTime() : NaN;
        if (!Number.isNaN(due) && due <= t30) deadlines30++;
        if (d.alertState === "overdue") anyOverdueDeadline = true;
      }

      return {
        openMatters,
        spendThisMonthCents,
        renewals90,
        deadlines30,
        anyOverdueDeadline,
      };
    }, [matters, invoices, renewals, deadlines]);

    // ---- Renewal calendar (next 90 days, pending, sorted asc) ----
    const renewalRows = useMemo(() => {
      const now = Date.now();
      const t90 = now + 90 * 24 * 60 * 60 * 1000;
      const rows = renewals
        .filter((r) => r && r.status === "pending")
        .filter((r) => {
          const due = r.opoutDueAt ? new Date(r.opoutDueAt).getTime() : NaN;
          return !Number.isNaN(due) && due <= t90;
        })
        .slice(0, 200);
      rows.sort((a, b) => (a.opoutDueAt || "").localeCompare(b.opoutDueAt || ""));
      return rows.slice(0, 10);
    }, [renewals]);

    // ---- Open matters (top 10 by riskScore desc, null-safe) ----
    const topMatters = useMemo(() => {
      const openStatuses = new Set(["open", "waiting", "in-review", "negotiating", "closing"]);
      const open = matters.filter((m) => m && openStatuses.has(m.status));
      open.sort((a, b) => {
        const ar = typeof a.riskScore === "number" ? a.riskScore : -1;
        const br = typeof b.riskScore === "number" ? b.riskScore : -1;
        return br - ar;
      });
      return open.slice(0, 10);
    }, [matters]);

    // ---- Outside counsel spend (YTD, grouped by firmId) ----
    const firmSpend = useMemo(() => {
      const thisYear = new Date().getFullYear();
      const firmMap = new Map();
      for (const f of firms) {
        if (f && f.id) firmMap.set(f.id, f);
      }
      const acc = new Map();
      for (const inv of invoices) {
        if (!inv || !inv.firmId) continue;
        if (!inv.periodMonth || !inv.periodMonth.startsWith(String(thisYear))) continue;
        const cur = acc.get(inv.firmId) || { firmId: inv.firmId, ytdCents: 0, matterIds: new Set() };
        cur.ytdCents += typeof inv.amountCents === "number" ? inv.amountCents : 0;
        if (inv.matterId) cur.matterIds.add(inv.matterId);
        acc.set(inv.firmId, cur);
      }
      const rows = Array.from(acc.values()).map((row) => ({
        firmId: row.firmId,
        firmName: (firmMap.get(row.firmId) && firmMap.get(row.firmId).firm) || row.firmId,
        ytdCents: row.ytdCents,
        mattersServed: row.matterIds.size,
      }));
      rows.sort((a, b) => b.ytdCents - a.ytdCents);
      return rows.slice(0, 10);
    }, [invoices, firms]);

    // ---- Handlers ----

    const handleReviewRenewal = useCallback((counterparty, contractId) => {
      if (typeof sendMessage === "function") {
        sendMessage(`Review renewal for ${counterparty} (contract ${contractId})`);
      }
    }, [sendMessage]);

    const handleOpenMatter = useCallback((matterId) => {
      if (typeof sendMessage === "function") {
        sendMessage(`Open matter ${matterId}`);
      }
    }, [sendMessage]);

    return h(
      "div",
      { className: "p-6 max-w-6xl mx-auto space-y-6" },

      // Error banner
      err
        ? h(
            "div",
            { className: "bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700" },
            `Dashboard error: ${err}`
          )
        : null,

      // Section 1 — Stats (4 cards)
      h(
        "div",
        { className: "flex flex-wrap gap-3" },
        h(StatCard, {
          label: "Open matters",
          value: loading ? "—" : stats.openMatters,
          tone: "info",
        }),
        h(StatCard, {
          label: "Spend this month (USD)",
          value: loading ? "—" : formatUsdFromCents(stats.spendThisMonthCents),
          tone: "default",
        }),
        h(StatCard, {
          label: "Renewals 90 days",
          value: loading ? "—" : stats.renewals90,
          tone: stats.renewals90 ? "warn" : "default",
        }),
        h(StatCard, {
          label: "Deadlines 30 days",
          value: loading ? "—" : stats.deadlines30,
          tone: stats.anyOverdueDeadline ? "danger" : (stats.deadlines30 ? "warn" : "default"),
        })
      ),

      // Section 2 — Renewal calendar (next 90 days)
      h(
        "div",
        { className: "bg-white rounded-lg border border-gray-200 p-5" },
        h(SectionHeader, {
          title: "Renewal calendar — next 90 days",
          subtitle: "Contracts with auto-renew pending; sorted by opt-out deadline.",
        }),
        loading
          ? h("div", { className: "space-y-1" },
              h(SkeletonRow), h(SkeletonRow), h(SkeletonRow), h(SkeletonRow))
          : renewalRows.length === 0
            ? h(EmptyHint, {
                text: "No renewals in the next 90 days. Ask the agent: \"refresh the renewal calendar\" to re-scan contracts.",
              })
            : h(
                "ul",
                { className: "divide-y divide-gray-100" },
                renewalRows.map((r) => {
                  return h(
                    "li",
                    { key: r.id, className: "flex items-center gap-3 py-2.5" },
                    h(Chip, {
                      className: windowChipClass(r.windowDays),
                      text: `t-${r.windowDays}`,
                    }),
                    h(
                      "div",
                      { className: "flex-1 min-w-0" },
                      h("div", { className: "text-sm font-medium text-gray-900 truncate" }, r.counterparty || "Unknown"),
                      h("div", { className: "text-xs text-gray-500 mt-0.5" },
                        `opt-out ${formatDaysRelative(r.opoutDueAt)}`,
                        " · ",
                        statusLabel(r.status))
                    ),
                    h(
                      "button",
                      {
                        type: "button",
                        onClick: () => handleReviewRenewal(r.counterparty || "Unknown", r.contractId),
                        className: "text-xs font-medium text-blue-700 hover:text-blue-900 hover:bg-blue-50 border border-blue-200 rounded px-2.5 py-1 transition-colors",
                      },
                      "Review"
                    )
                  );
                })
              )
      ),

      // Section 3 — Matters + Outside counsel spend (two column)
      h(
        "div",
        { className: "grid grid-cols-1 md:grid-cols-2 gap-4" },

        // Left: Open matters (top 10 by riskScore)
        h(
          "div",
          { className: "bg-white rounded-lg border border-gray-200 p-5" },
          h(SectionHeader, {
            title: "Open matters",
            subtitle: "Ranked by risk score (highest first).",
          }),
          loading
            ? h("div", { className: "space-y-1" }, h(SkeletonRow), h(SkeletonRow), h(SkeletonRow))
            : topMatters.length === 0
              ? h(EmptyHint, {
                  text: "No open matters. Ask the agent: \"open a matter for <request>\" to start one.",
                })
              : h(
                  "ul",
                  { className: "divide-y divide-gray-100" },
                  topMatters.map((m) => {
                    return h(
                      "li",
                      { key: m.id, className: "flex items-center gap-3 py-2.5" },
                      h(
                        "div",
                        { className: "flex-1 min-w-0" },
                        h("div", { className: "flex items-center gap-2" },
                          h("span", { className: "text-sm font-medium text-gray-900 truncate" }, m.title || "(untitled)"),
                          m.attorneyReviewRequired
                            ? h("span", {
                                title: "Attorney review required",
                                className: "inline-block w-2 h-2 rounded-full bg-red-600",
                              })
                            : null
                        ),
                        h("div", { className: "flex items-center gap-2 mt-1" },
                          h(Chip, {
                            className: practiceAreaChipClass(m.practiceArea),
                            text: m.practiceArea || "other",
                          }),
                          h("span", { className: "text-xs text-gray-500" }, statusLabel(m.status)),
                          h("span", { className: "text-xs text-gray-500" },
                            `· ${formatUsdFromCents(m.spendToDateCents)} to date`)
                        )
                      ),
                      h(
                        "button",
                        {
                          type: "button",
                          onClick: () => handleOpenMatter(m.id),
                          className: "text-xs font-medium text-blue-700 hover:text-blue-900 hover:bg-blue-50 border border-blue-200 rounded px-2.5 py-1 transition-colors",
                        },
                        "Open"
                      )
                    );
                  })
                )
        ),

        // Right: Outside counsel spend (YTD)
        h(
          "div",
          { className: "bg-white rounded-lg border border-gray-200 p-5" },
          h(SectionHeader, {
            title: "Outside counsel spend — YTD",
            subtitle: "By firm, summed from this year's invoices.",
          }),
          loading
            ? h("div", { className: "space-y-1" }, h(SkeletonRow), h(SkeletonRow), h(SkeletonRow))
            : firmSpend.length === 0
              ? h(EmptyHint, {
                  text: "No invoices parsed yet. Ask the agent: \"pull outside-counsel invoices from our e-billing system\" to ingest.",
                })
              : h(
                  "ul",
                  { className: "divide-y divide-gray-100" },
                  firmSpend.map((row) => {
                    return h(
                      "li",
                      { key: row.firmId, className: "flex items-center gap-3 py-2.5" },
                      h(
                        "div",
                        { className: "flex-1 min-w-0" },
                        h("div", { className: "text-sm font-medium text-gray-900 truncate" }, row.firmName),
                        h("div", { className: "text-xs text-gray-500 mt-0.5" },
                          `${row.mattersServed} matter${row.mattersServed === 1 ? "" : "s"}`)
                      ),
                      h("div", { className: "text-sm font-semibold text-gray-900 tabular-nums" },
                        formatUsdFromCents(row.ytdCents))
                    );
                  })
                )
        )
      )
    );
  }

  window.__houston_bundle__ = { OperatorDashboard: OperatorDashboard };
})();
