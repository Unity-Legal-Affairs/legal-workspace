// Intake Dashboard — custom bundle for the Houston Intake agent.
//
// Loaded by the Houston tab resolver as a <script> tag. It must assign a
// component map to window.__houston_bundle__. React is available at
// window.Houston.React. We cannot import @houston-ai/core here (not on
// window), so everything is hand-rolled React.createElement + Tailwind.
//
// The dashboard is READ-ONLY. Every section reads JSON files at the agent
// root and renders. The only user actions are "Review" buttons per row,
// which delegate to props.sendMessage — the chat agent does the actual work.
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
  // appear in this source file (Phase 6 verification greps for it).
  // ---------------------------------------------------------------------
  function useHoustonEvent(handler) {
    useEffect(() => {
      let unlisten;
      let cancelled = false;
      // Build the module specifier dynamically so a static analyzer
      // doesn't try to resolve it at bundle-time (this is an IIFE, not
      // a module — import() is still available at runtime in the
      // webview).
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
      // File may not exist yet — empty is the right shape.
      return [];
    }
  }

  function formatRelative(iso) {
    if (!iso) return "";
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return "";
    const diff = Date.now() - then;
    const abs = Math.abs(diff);
    const mins = Math.floor(abs / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m${diff < 0 ? " away" : " ago"}`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h${diff < 0 ? " away" : " ago"}`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d${diff < 0 ? " away" : " ago"}`;
    const months = Math.floor(days / 30);
    return `${months}mo${diff < 0 ? " away" : " ago"}`;
  }

  function priorityBadgeClass(priority) {
    switch (priority) {
      case "P1": return "bg-red-100 text-red-800 border-red-200";
      case "P2": return "bg-orange-100 text-orange-800 border-orange-200";
      case "P3": return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "P4": return "bg-gray-100 text-gray-700 border-gray-200";
      default:   return "bg-gray-100 text-gray-700 border-gray-200";
    }
  }

  function trafficLightClass(light) {
    switch (light) {
      case "GREEN":  return "bg-green-100 text-green-800 border-green-200";
      case "YELLOW": return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "RED":    return "bg-red-100 text-red-800 border-red-200";
      default:       return "bg-gray-100 text-gray-700 border-gray-200";
    }
  }

  function statusLabel(status) {
    switch (status) {
      case "new":           return "New";
      case "classified":    return "Classified";
      case "drafted":       return "Drafted";
      case "routed":        return "Routed";
      case "matter-opened": return "Matter opened";
      case "closed":        return "Closed";
      default:              return status || "";
    }
  }

  function categoryLabel(cat) {
    switch (cat) {
      case "nda":                     return "NDA";
      case "msa":                     return "MSA";
      case "dpa":                     return "DPA";
      case "order-form":              return "Order form";
      case "employment":              return "Employment";
      case "privacy":                 return "Privacy";
      case "security-questionnaire":  return "Sec questionnaire";
      case "subpoena":                return "Subpoena";
      case "litigation-hold":         return "Lit hold";
      case "dsr":                     return "DSR";
      case "vendor-security":         return "Vendor security";
      case "corp":                    return "Corp";
      case "other":                   return "Other";
      default:                        return cat || "";
    }
  }

  function priorityRank(p) {
    return { P1: 0, P2: 10, P3: 100, P4: 1000 }[p] ?? 500;
  }

  function scoreRow(row) {
    // Lower score = more urgent. Used to rank "Needs you now".
    let score = 0;
    if (row.sla && row.sla.breached) score -= 1000;
    score += priorityRank(row.priority);
    if (row.attorneyReviewRequired) score -= 5;
    return score;
  }

  function isWithinHours(iso, hours) {
    if (!iso) return false;
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return false;
    return (Date.now() - then) <= hours * 60 * 60 * 1000;
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

  function PriorityBadge({ priority }) {
    return h(
      "span",
      {
        className: `inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${priorityBadgeClass(priority)}`,
      },
      priority || "P?"
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

  function IntakeDashboard(props) {
    const { readFile, sendMessage } = props || {};
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState(null);
    const [queue, setQueue] = useState([]);
    const [ndas, setNdas] = useState([]);

    const reload = useCallback(async () => {
      if (typeof readFile !== "function") {
        setErr("readFile is not available in this context.");
        setLoading(false);
        return;
      }
      try {
        const [q, n] = await Promise.all([
          readJsonArray(readFile, "queue.json"),
          readJsonArray(readFile, "ndas.json"),
        ]);
        setQueue(q);
        setNdas(n);
        setErr(null);
      } catch (e) {
        setErr(e && e.message ? e.message : "Failed to load dashboard data.");
      } finally {
        setLoading(false);
      }
    }, [readFile]);

    // Initial load.
    useEffect(() => {
      reload();
    }, [reload]);

    // React to Houston file-change events (Tauri listener when available).
    const onEvent = useCallback((payload) => {
      if (!payload) return;
      if (payload.type === "FilesChanged" || payload.type === "files_changed") {
        reload();
      }
    }, [reload]);
    useHoustonEvent(onEvent);

    // Polling fallback: the real Tauri event listener does not yet reach
    // <script>-injected bundles reliably, so we poll every 5s. Cheap for
    // a handful of small JSON files; keeps the dashboard reactive.
    useEffect(() => {
      const t = setInterval(reload, 5000);
      return () => clearInterval(t);
    }, [reload]);

    // ---- Stats ----
    const stats = useMemo(() => {
      let inQueue = 0;
      let attorneyReview = 0;
      let overdue = 0;
      for (const row of queue) {
        if (!row) continue;
        if (row.status !== "closed") inQueue++;
        if (row.attorneyReviewRequired) attorneyReview++;
        if (row.sla && row.sla.breached) overdue++;
      }
      let ndasToday = 0;
      for (const n of ndas) {
        if (n && isWithinHours(n.createdAt, 24)) ndasToday++;
      }
      return { inQueue, attorneyReview, ndasToday, overdue };
    }, [queue, ndas]);

    // ---- Needs you now (top 5) ----
    const needsYou = useMemo(() => {
      const candidates = queue
        .filter((row) => row && row.status !== "closed")
        .slice(0, 200); // safety cap
      candidates.sort((a, b) => scoreRow(a) - scoreRow(b));
      return candidates.slice(0, 5);
    }, [queue]);

    // ---- NDA section ----
    const recentNdas = useMemo(() => {
      const copy = ndas.slice();
      copy.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      return copy.slice(0, 8);
    }, [ndas]);

    const weeklyNdaCounts = useMemo(() => {
      let green = 0, yellow = 0, red = 0;
      for (const n of ndas) {
        if (!n || !isWithinHours(n.createdAt, 7 * 24)) continue;
        if (n.trafficLight === "GREEN") green++;
        else if (n.trafficLight === "YELLOW") yellow++;
        else if (n.trafficLight === "RED") red++;
      }
      return { green, yellow, red };
    }, [ndas]);

    // ---- Render ----

    const handleReviewIntake = useCallback((intakeId) => {
      if (typeof sendMessage === "function") {
        sendMessage(`Review intake ${intakeId}`);
      }
    }, [sendMessage]);

    const handleReviewNda = useCallback((queueId) => {
      if (typeof sendMessage === "function") {
        sendMessage(`Review NDA intake ${queueId}`);
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

      // Section 1 — Stats
      h(
        "div",
        { className: "flex flex-wrap gap-3" },
        h(StatCard, { label: "In queue", value: loading ? "—" : stats.inQueue, tone: "info" }),
        h(StatCard, { label: "Attorney review", value: loading ? "—" : stats.attorneyReview, tone: stats.attorneyReview ? "warn" : "default" }),
        h(StatCard, { label: "NDAs today", value: loading ? "—" : stats.ndasToday, tone: "default" }),
        h(StatCard, { label: "Overdue SLA", value: loading ? "—" : stats.overdue, tone: stats.overdue ? "danger" : "default" })
      ),

      // Section 2 — Needs you now
      h(
        "div",
        { className: "bg-white rounded-lg border border-gray-200 p-5" },
        h(SectionHeader, {
          title: "Needs you now",
          subtitle: "Ranked by SLA breach, priority, and attorney-review flag.",
        }),
        loading
          ? h("div", { className: "space-y-1" },
              h(SkeletonRow), h(SkeletonRow), h(SkeletonRow), h(SkeletonRow), h(SkeletonRow))
          : needsYou.length === 0
            ? h(EmptyHint, {
                text: "Queue is clear. Ask the agent: \"triage my legal inbox\" to pull the latest inbound requests.",
              })
            : h(
                "ul",
                { className: "divide-y divide-gray-100" },
                needsYou.map((row) => {
                  const breached = !!(row.sla && row.sla.breached);
                  const label = row.counterparty
                    ? `${row.counterparty} — ${row.subject || "(no subject)"}`
                    : (row.subject || "(no subject)");
                  return h(
                    "li",
                    { key: row.id, className: "flex items-center gap-3 py-2.5" },
                    h(PriorityBadge, { priority: row.priority }),
                    h(
                      "div",
                      { className: "flex-1 min-w-0" },
                      h("div", { className: "flex items-center gap-2" },
                        h("span", { className: "text-sm font-medium text-gray-900 truncate" }, label),
                        h("span", {
                          className: "inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border bg-gray-50 text-gray-700 border-gray-200",
                        }, categoryLabel(row.category)),
                        row.attorneyReviewRequired
                          ? h("span", { className: "text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-200 rounded px-1.5 py-0.5" }, "Attorney")
                          : null,
                        breached
                          ? h("span", { className: "text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded px-1.5 py-0.5" }, "SLA")
                          : null
                      ),
                      h("div", { className: "text-xs text-gray-500 mt-0.5" },
                        statusLabel(row.status),
                        " · ",
                        formatRelative(row.updatedAt || row.createdAt))
                    ),
                    h(
                      "button",
                      {
                        type: "button",
                        onClick: () => handleReviewIntake(row.id),
                        className: "text-xs font-medium text-blue-700 hover:text-blue-900 hover:bg-blue-50 border border-blue-200 rounded px-2.5 py-1 transition-colors",
                      },
                      "Review"
                    )
                  );
                })
              )
      ),

      // Section 3 — NDA traffic light (two columns)
      h(
        "div",
        { className: "grid grid-cols-1 md:grid-cols-2 gap-4" },

        // Left — Recent NDAs
        h(
          "div",
          { className: "bg-white rounded-lg border border-gray-200 p-5" },
          h(SectionHeader, {
            title: "Recent NDAs",
            subtitle: "Last 8 NDAs with traffic-light classification.",
          }),
          loading
            ? h("div", { className: "space-y-1" }, h(SkeletonRow), h(SkeletonRow), h(SkeletonRow))
            : recentNdas.length === 0
              ? h(EmptyHint, {
                  text: "No NDAs classified yet. Ask the agent: \"classify the NDAs in my inbox\" to run the traffic-light rubric.",
                })
              : h(
                  "ul",
                  { className: "divide-y divide-gray-100" },
                  recentNdas.map((n) => {
                    const mutualLabel = n.mutual ? "mutual" : "one-way";
                    const term = n.termMonths ? `${n.termMonths}mo` : "";
                    const sub = [mutualLabel, term].filter(Boolean).join(" · ");
                    return h(
                      "li",
                      { key: n.id, className: "flex items-center gap-3 py-2.5" },
                      h("span", {
                        className: `inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${trafficLightClass(n.trafficLight)}`,
                      }, n.trafficLight || "—"),
                      h(
                        "div",
                        { className: "flex-1 min-w-0" },
                        h("div", { className: "text-sm font-medium text-gray-900 truncate" }, n.counterparty || "(unknown counterparty)"),
                        h("div", { className: "text-xs text-gray-500 mt-0.5" }, sub)
                      ),
                      h(
                        "button",
                        {
                          type: "button",
                          onClick: () => handleReviewNda(n.queueId),
                          className: "text-xs font-medium text-blue-700 hover:text-blue-900 hover:bg-blue-50 border border-blue-200 rounded px-2.5 py-1 transition-colors",
                        },
                        "Review"
                      )
                    );
                  })
                )
        ),

        // Right — Traffic light counts (this week)
        h(
          "div",
          { className: "bg-white rounded-lg border border-gray-200 p-5" },
          h(SectionHeader, {
            title: "Traffic light counts",
            subtitle: "NDAs classified this week.",
          }),
          loading
            ? h("div", { className: "grid grid-cols-3 gap-3" },
                h("div", { className: "h-20 bg-gray-100 rounded animate-pulse" }),
                h("div", { className: "h-20 bg-gray-100 rounded animate-pulse" }),
                h("div", { className: "h-20 bg-gray-100 rounded animate-pulse" }))
            : h(
                "div",
                { className: "grid grid-cols-3 gap-3" },
                h(
                  "div",
                  { className: "bg-green-50 border border-green-200 rounded-lg p-4 text-center" },
                  h("div", { className: "text-xs font-medium uppercase tracking-wide text-green-700" }, "GREEN"),
                  h("div", { className: "text-3xl font-semibold mt-1 text-green-800" }, String(weeklyNdaCounts.green))
                ),
                h(
                  "div",
                  { className: "bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center" },
                  h("div", { className: "text-xs font-medium uppercase tracking-wide text-yellow-700" }, "YELLOW"),
                  h("div", { className: "text-3xl font-semibold mt-1 text-yellow-800" }, String(weeklyNdaCounts.yellow))
                ),
                h(
                  "div",
                  { className: "bg-red-50 border border-red-200 rounded-lg p-4 text-center" },
                  h("div", { className: "text-xs font-medium uppercase tracking-wide text-red-700" }, "RED"),
                  h("div", { className: "text-3xl font-semibold mt-1 text-red-800" }, String(weeklyNdaCounts.red))
                )
              )
        )
      )
    );
  }

  window.__houston_bundle__ = { IntakeDashboard: IntakeDashboard };
})();
