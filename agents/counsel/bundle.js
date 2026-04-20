// Counsel Dashboard — custom bundle for the Houston Counsel agent.
//
// Loaded by the Houston tab resolver as a <script> tag. It must assign a
// component map to window.__houston_bundle__. React is available at
// window.Houston.React. We cannot import @houston-ai/core here (not on
// window), so everything is hand-rolled React.createElement + Tailwind.
//
// The dashboard is READ-ONLY. Every section reads JSON files at the agent
// root and renders. The only user action is a "Review" button per row in
// the "Active reviews" list, which delegates to props.sendMessage — the
// chat agent does the actual work.
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

  function statusLabel(status) {
    switch (status) {
      case "in-review": return "In review";
      case "redlined":  return "Redlined";
      case "sent":      return "Sent";
      case "accepted":  return "Accepted";
      case "closed":    return "Closed";
      default:          return status || "";
    }
  }

  function statusBadgeClass(status) {
    switch (status) {
      case "in-review": return "bg-blue-50 text-blue-700 border-blue-200";
      case "redlined":  return "bg-amber-50 text-amber-700 border-amber-200";
      case "sent":      return "bg-purple-50 text-purple-700 border-purple-200";
      case "accepted":  return "bg-green-50 text-green-700 border-green-200";
      case "closed":    return "bg-gray-100 text-gray-700 border-gray-200";
      default:          return "bg-gray-100 text-gray-700 border-gray-200";
    }
  }

  function riskBadgeClass(score) {
    const n = typeof score === "number" ? score : 0;
    if (n >= 80) return "bg-red-100 text-red-800 border-red-200";
    if (n >= 60) return "bg-orange-100 text-orange-800 border-orange-200";
    if (n >= 30) return "bg-yellow-100 text-yellow-800 border-yellow-200";
    return "bg-gray-100 text-gray-700 border-gray-200";
  }

  // ---------------------------------------------------------------------
  // Risk-matrix constants — 5×5 grid
  // ---------------------------------------------------------------------

  // Severity columns, left-to-right = low-to-high.
  const SEVERITY_ORDER = ["negligible", "minor", "moderate", "major", "critical"];
  const SEVERITY_LABEL = {
    negligible: "Negligible",
    minor: "Minor",
    moderate: "Moderate",
    major: "Major",
    critical: "Critical",
  };

  // Likelihood rows, top-to-bottom = high-to-low, so "almost certain" is
  // at the top of the rendered grid and "rare" at the bottom (reading
  // naturally: top-right = the worst cell).
  const LIKELIHOOD_ROWS = ["almost-certain", "likely", "possible", "unlikely", "rare"];
  const LIKELIHOOD_LABEL = {
    "almost-certain": "Almost certain",
    "likely": "Likely",
    "possible": "Possible",
    "unlikely": "Unlikely",
    "rare": "Rare",
  };

  // Score a (severity, likelihood) cell from 0 (bottom-left) to 8 (top-right).
  // sev index + likelihood-high-to-low index, both 0..4.
  function cellHeat(severity, likelihood) {
    const sev = SEVERITY_ORDER.indexOf(severity);
    // likelihood heat: rare=0, unlikely=1, possible=2, likely=3, almost-certain=4
    const likOrder = ["rare", "unlikely", "possible", "likely", "almost-certain"];
    const lik = likOrder.indexOf(likelihood);
    if (sev < 0 || lik < 0) return 0;
    return sev + lik;
  }

  function cellTone(heat) {
    // Heat range 0..8. Bottom-left (0..2) green, middle (3..5) amber,
    // top-right (6..8) red. Intensities 100 / 200 within each band.
    if (heat >= 7) return "bg-red-200 text-red-900";
    if (heat >= 6) return "bg-red-100 text-red-800";
    if (heat >= 4) return "bg-amber-100 text-amber-800";
    if (heat >= 3) return "bg-amber-50 text-amber-700";
    if (heat >= 1) return "bg-green-100 text-green-800";
    return "bg-green-50 text-green-700";
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
      h("div", { className: "h-4 w-16 bg-gray-100 rounded animate-pulse" }),
      h("div", { className: "h-4 w-40 bg-gray-100 rounded animate-pulse" }),
      h("div", { className: "h-4 flex-1 bg-gray-100 rounded animate-pulse" }),
      h("div", { className: "h-4 w-16 bg-gray-100 rounded animate-pulse" })
    );
  }

  // ---------------------------------------------------------------------
  // Risk heatmap — 5×5 grid (likelihood rows × severity columns)
  // ---------------------------------------------------------------------
  function RiskHeatmap({ assessments }) {
    // Count assessments per (severity, likelihood) cell.
    const counts = useMemo(() => {
      const m = new Map();
      for (const a of assessments || []) {
        if (!a) continue;
        const key = `${a.severity}|${a.likelihood}`;
        m.set(key, (m.get(key) || 0) + 1);
      }
      return m;
    }, [assessments]);

    const cells = [];
    // Header row — severity columns (with an empty top-left corner for row labels).
    cells.push(h(
      "div",
      { key: "hdr-corner", className: "text-xs font-semibold text-gray-500 text-right pr-2 py-1" },
      "Lik ↓ / Sev →"
    ));
    for (const sev of SEVERITY_ORDER) {
      cells.push(h(
        "div",
        {
          key: `hdr-${sev}`,
          className: "text-xs font-semibold text-gray-600 text-center py-1",
        },
        SEVERITY_LABEL[sev]
      ));
    }
    // Body — one row per likelihood (high-to-low), one cell per severity.
    for (const lik of LIKELIHOOD_ROWS) {
      cells.push(h(
        "div",
        {
          key: `row-${lik}`,
          className: "text-xs font-semibold text-gray-600 text-right pr-2 py-1 flex items-center justify-end",
        },
        LIKELIHOOD_LABEL[lik]
      ));
      for (const sev of SEVERITY_ORDER) {
        const heat = cellHeat(sev, lik);
        const tone = cellTone(heat);
        const count = counts.get(`${sev}|${lik}`) || 0;
        cells.push(h(
          "div",
          {
            key: `cell-${sev}-${lik}`,
            className: `rounded-sm text-xs font-semibold py-2 px-2 flex items-center justify-center ${tone}`,
          },
          count ? String(count) : "·"
        ));
      }
    }

    return h(
      "div",
      { className: "bg-white rounded-lg border border-gray-200 p-5" },
      h(SectionHeader, {
        title: "Risk heatmap",
        subtitle: "Severity × likelihood distribution across open matters.",
      }),
      h(
        "div",
        { className: "grid grid-cols-[auto_repeat(5,minmax(0,1fr))] gap-1" },
        cells
      ),
      // Legend
      h(
        "div",
        { className: "flex items-center gap-4 mt-4 text-xs text-gray-600" },
        h("div", { className: "flex items-center gap-1.5" },
          h("span", { className: "inline-block w-3 h-3 rounded-sm bg-green-100 border border-green-200" }),
          "Acceptable"
        ),
        h("div", { className: "flex items-center gap-1.5" },
          h("span", { className: "inline-block w-3 h-3 rounded-sm bg-amber-100 border border-amber-200" }),
          "Monitor"
        ),
        h("div", { className: "flex items-center gap-1.5" },
          h("span", { className: "inline-block w-3 h-3 rounded-sm bg-red-100 border border-red-200" }),
          "Escalate"
        ),
        h("div", { className: "flex items-center gap-1.5" },
          h("span", { className: "inline-block w-3 h-3 rounded-sm bg-red-200 border border-red-300" }),
          "Block"
        )
      )
    );
  }

  // ---------------------------------------------------------------------
  // The dashboard
  // ---------------------------------------------------------------------

  function CounselDashboard(props) {
    const { readFile, sendMessage } = props || {};
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState(null);
    const [reviews, setReviews] = useState([]);
    const [riskAssessments, setRiskAssessments] = useState([]);
    const [playbookDrift, setPlaybookDrift] = useState([]);

    const reload = useCallback(async () => {
      if (typeof readFile !== "function") {
        setErr("readFile is not available in this context.");
        setLoading(false);
        return;
      }
      try {
        const [r, ra, pd] = await Promise.all([
          readJsonArray(readFile, "reviews.json"),
          readJsonArray(readFile, "risk-assessments.json"),
          readJsonArray(readFile, "playbook-drift.json"),
        ]);
        setReviews(r);
        setRiskAssessments(ra);
        setPlaybookDrift(pd);
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

    // Polling fallback — see bundle header comment.
    useEffect(() => {
      const t = setInterval(reload, 5000);
      return () => clearInterval(t);
    }, [reload]);

    // ---- Stats ----
    const stats = useMemo(() => {
      let active = 0;
      let attorneyReview = 0;
      for (const row of reviews) {
        if (!row) continue;
        if (row.status === "in-review" || row.status === "redlined") active++;
        if (row.attorneyReviewRequired) attorneyReview++;
      }
      const escalated = riskAssessments.filter((a) => a && (a.classification === "escalate" || a.classification === "block")).length;
      const drift = playbookDrift.filter((d) => d && d.status === "proposed").length;
      return { active, attorneyReview, escalated, drift };
    }, [reviews, riskAssessments, playbookDrift]);

    // ---- Active reviews (sorted by riskScore desc, null-safe) ----
    const activeReviews = useMemo(() => {
      const rows = reviews
        .filter((r) => r && (r.status === "in-review" || r.status === "redlined"))
        .slice(0, 200);
      rows.sort((a, b) => {
        const ra = typeof a.riskScore === "number" ? a.riskScore : -1;
        const rb = typeof b.riskScore === "number" ? b.riskScore : -1;
        return rb - ra;
      });
      return rows.slice(0, 20);
    }, [reviews]);

    const handleReview = useCallback((reviewId) => {
      if (typeof sendMessage === "function") {
        sendMessage(`Open review ${reviewId}`);
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

      // Section 1 — Stats row
      h(
        "div",
        { className: "flex flex-wrap gap-3" },
        h(StatCard, { label: "Active reviews", value: loading ? "—" : stats.active, tone: "info" }),
        h(StatCard, { label: "Attorney review", value: loading ? "—" : stats.attorneyReview, tone: stats.attorneyReview ? "danger" : "default" }),
        h(StatCard, { label: "Escalated risks", value: loading ? "—" : stats.escalated, tone: stats.escalated ? "danger" : "default" }),
        h(StatCard, { label: "Playbook drift", value: loading ? "—" : stats.drift, tone: stats.drift ? "warn" : "default" })
      ),

      // Section 2 — Risk heatmap
      loading
        ? h("div", { className: "bg-white rounded-lg border border-gray-200 p-5" },
            h(SectionHeader, { title: "Risk heatmap", subtitle: "Loading…" }),
            h("div", { className: "h-40 bg-gray-50 rounded animate-pulse" })
          )
        : h(RiskHeatmap, { assessments: riskAssessments }),

      // Section 3 — Active reviews list
      h(
        "div",
        { className: "bg-white rounded-lg border border-gray-200 p-5" },
        h(SectionHeader, {
          title: "Active reviews",
          subtitle: "Sorted by risk score (highest first).",
        }),
        loading
          ? h("div", { className: "space-y-1" },
              h(SkeletonRow), h(SkeletonRow), h(SkeletonRow), h(SkeletonRow))
          : activeReviews.length === 0
            ? h(EmptyHint, {
                text: "No active reviews. Ask the agent: \"review the latest contract from <counterparty>\" to get started.",
              })
            : h(
                "ul",
                { className: "divide-y divide-gray-100" },
                activeReviews.map((r) => {
                  const riskScore = typeof r.riskScore === "number" ? r.riskScore : 0;
                  const devCount = typeof r.deviationCount === "number" ? r.deviationCount : 0;
                  return h(
                    "li",
                    { key: r.id, className: "flex items-center gap-3 py-2.5" },
                    h(
                      "span",
                      {
                        className: `inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${riskBadgeClass(riskScore)}`,
                      },
                      `Risk ${riskScore}`
                    ),
                    h(
                      "div",
                      { className: "flex-1 min-w-0" },
                      h("div", { className: "flex items-center gap-2" },
                        h("span", { className: "text-sm font-medium text-gray-900 truncate" }, r.contractType || "Contract"),
                        h("span", { className: "text-sm text-gray-600 truncate" }, "·"),
                        h("span", { className: "text-sm text-gray-600 truncate" }, r.counterparty || "(unknown counterparty)"),
                        r.attorneyReviewRequired
                          ? h("span", { className: "text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded px-1.5 py-0.5" }, "Attorney review")
                          : null
                      ),
                      h("div", { className: "text-xs text-gray-500 mt-0.5" },
                        `${devCount} deviation${devCount === 1 ? "" : "s"}`)
                    ),
                    h(
                      "span",
                      {
                        className: `inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${statusBadgeClass(r.status)}`,
                      },
                      statusLabel(r.status)
                    ),
                    h(
                      "button",
                      {
                        type: "button",
                        onClick: () => handleReview(r.id),
                        className: "text-xs font-medium text-blue-700 hover:text-blue-900 hover:bg-blue-50 border border-blue-200 rounded px-2.5 py-1 transition-colors",
                      },
                      "Review"
                    )
                  );
                })
              )
      )
    );
  }

  window.__houston_bundle__ = { CounselDashboard: CounselDashboard };
})();
