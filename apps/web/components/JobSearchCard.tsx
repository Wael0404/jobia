"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useCycle } from "../lib/motion";
import { CountUp } from "./CountUp";
import { RobotAgent, type RobotState } from "./RobotAgent";

/** Generic pipeline steps shown while searching (no site names or crawl details). */
const STEPS = ["Lecture des offres d'emploi…", "Comparaison avec votre profil…", "Sélection des meilleures offres…"] as const;

/**
 * "Start my job search": the search runs in the background on the server.
 * The user sees an animated agent and counts, never the sites being crawled.
 */
export function JobSearchCard() {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const status = useQuery({
    queryKey: ["search-status"],
    queryFn: api.searchStatus,
    refetchInterval: (q) => (q.state.data?.status === "running" ? 3_000 : false),
  });
  const report = useQuery({ queryKey: ["report"], queryFn: api.reportSummary });

  const start = useMutation({
    mutationFn: api.startSearch,
    onMutate: () => setError(null),
    onSuccess: (data) => qc.setQueryData(["search-status"], data),
    onError: (e: Error) => setError(e.message),
  });

  // When a search finishes, refresh the statistics shown on the dashboard.
  const previous = useRef(status.data?.status);
  useEffect(() => {
    const now = status.data?.status;
    if (previous.current === "running" && now === "done") {
      void qc.invalidateQueries({ queryKey: ["report"] });
      void qc.invalidateQueries({ queryKey: ["applications"] });
    }
    previous.current = now;
  }, [status.data?.status, qc]);

  const s = status.data;
  const running = s?.status === "running" || start.isPending;
  const step = useCycle(STEPS, running);
  const t = report.data?.totals;
  const matched = t ? Object.values(t).reduce((sum, n) => sum + n, 0) : 0;
  const sending = (t?.queued ?? 0) + (t?.submitting ?? 0) > 0;
  const robot: RobotState = running ? "searching" : sending ? "sending" : s?.status === "done" ? "done" : "idle";

  const announcement = running
    ? "Recherche en cours"
    : s?.status === "done"
      ? `Recherche terminée : ${s.offersFound} offres analysées, ${matched} retenues pour vous`
      : "";

  return (
    <section className="card search-card reveal" data-state={robot} aria-labelledby="search-title">
      <div className="robot-stage">
        <RobotAgent state={robot} size={170} />
      </div>

      <div className="stack" style={{ minWidth: 0 }}>
        <h3 id="search-title" style={{ marginBottom: 0 }}>
          {running && <span className="live-dot" aria-hidden="true" />}
          Votre agent de recherche
        </h3>

        <p className="search-status" style={{ margin: 0 }}>
          {running ? (
            <span key={step} className="search-step" aria-hidden="true">
              🤖 {step}
            </span>
          ) : sending ? (
            "📨 Envoi de vos candidatures en cours…"
          ) : s?.status === "done" ? (
            "✅ Recherche terminée"
          ) : (
            "Prêt à chercher des offres pour vous."
          )}
        </p>
        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>

        {running && (
          <div className="progress" aria-hidden="true">
            <span />
          </div>
        )}

        <div className="row">
          <button className="btn primary" disabled={running} onClick={() => start.mutate()}>
            {running ? "Recherche en cours…" : s?.status === "done" ? "Relancer la recherche" : "Lancer la recherche"}
          </button>
          {s?.status === "done" && s.finishedAt && !running && (
            <span className="muted">
              Dernière recherche : {new Date(s.finishedAt).toLocaleString("fr-TN", { dateStyle: "short", timeStyle: "short" })}
            </span>
          )}
        </div>

        <div className="search-stats">
          <div>
            <div className="muted">Offres analysées</div>
            <CountUp value={s?.offersFound ?? 0} />
          </div>
          <div>
            <div className="muted">Offres retenues pour vous</div>
            <CountUp value={matched} />
          </div>
        </div>

        {running && (
          <p className="muted" style={{ margin: 0 }}>
            L&apos;agent travaille en arrière-plan, vous pouvez quitter cette page.
          </p>
        )}
        {error && (
          <p role="alert" style={{ color: "var(--danger)", margin: 0 }}>
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
