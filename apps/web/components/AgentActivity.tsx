"use client";

import type { ApplicationDto } from "@jobia/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useRef, type CSSProperties } from "react";
import { api } from "../lib/api";
import { CountUp } from "./CountUp";
import { RobotAgent, type RobotState } from "./RobotAgent";

type Stage = "think" | "search" | "select" | "send";
const STAGES: Array<{ id: Stage; icon: string; label: string }> = [
  { id: "think", icon: "🧠", label: "Analyse du profil" },
  { id: "search", icon: "🔎", label: "Recherche des offres" },
  { id: "select", icon: "🎯", label: "Sélection" },
  { id: "send", icon: "📨", label: "Candidatures" },
];

const THOUGHTS: Record<Stage | "idle" | "done", string> = {
  idle: "Je suis prêt. Lancez-moi et je m'occupe de tout !",
  think: "Je relis votre CV pour choisir les bons mots-clés…",
  search: "Je parcours les offres d'emploi pour vous…",
  select: "Je compare chaque offre avec votre profil…",
  send: "J'envoie vos candidatures…",
  done: "Mission terminée ! Voici ce que j'ai fait pour vous.",
};

/** One line of the live feed, derived from the application's real status. */
const FEED: Partial<Record<ApplicationDto["status"], { icon: string; text: string; tone: string }>> = {
  pending_review: { icon: "🎯", text: "Offre retenue", tone: "var(--primary)" },
  queued: { icon: "⏳", text: "Candidature en file d'attente", tone: "var(--primary-2)" },
  submitting: { icon: "📨", text: "Envoi en cours", tone: "var(--primary-2)" },
  submitted: { icon: "✅", text: "Candidature envoyée", tone: "var(--success)" },
  viewed: { icon: "👀", text: "Candidature vue par le recruteur", tone: "var(--success)" },
  interview: { icon: "📅", text: "Entretien décroché", tone: "var(--success)" },
  offer: { icon: "🎉", text: "Offre d'emploi reçue", tone: "var(--success)" },
  needs_user_action: { icon: "✋", text: "À finaliser par vous", tone: "var(--warning)" },
  rejected: { icon: "📭", text: "Réponse négative", tone: "var(--muted)" },
  failed: { icon: "⚠️", text: "Envoi impossible", tone: "var(--danger)" },
};

const ago = (iso: string) => {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86_400) return `il y a ${Math.round(s / 3600)} h`;
  return `il y a ${Math.round(s / 86_400)} j`;
};

/**
 * Autopilot view: the agent's real pipeline (search → select → send) with a
 * live feed of what it did. Every state shown comes from the backend.
 */
export function AgentActivity() {
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: ["search-status"],
    queryFn: api.searchStatus,
    refetchInterval: (q) => (q.state.data?.status === "running" ? 2_500 : 15_000),
  });
  const report = useQuery({ queryKey: ["report"], queryFn: api.reportSummary, refetchInterval: 10_000 });
  const t = report.data?.totals;
  const inFlight = (t?.queued ?? 0) + (t?.submitting ?? 0);
  const running = status.data?.status === "running";
  const feed = useQuery({
    queryKey: ["applications", "activity"],
    queryFn: () => api.applications({ limit: 6 }),
    refetchInterval: running || inFlight > 0 ? 3_000 : 20_000,
  });

  const start = useMutation({
    mutationFn: api.startSearch,
    onSuccess: (data) => qc.setQueryData(["search-status"], data),
  });

  // Refresh stats when a search finishes.
  const prev = useRef(status.data?.status);
  useEffect(() => {
    if (prev.current === "running" && status.data?.status === "done") {
      void qc.invalidateQueries({ queryKey: ["report"] });
      void qc.invalidateQueries({ queryKey: ["applications"] });
      void qc.invalidateQueries({ queryKey: ["billing"] });
    }
    prev.current = status.data?.status;
  }, [status.data?.status, qc]);

  const active: Stage | "idle" | "done" = start.isPending || running ? "search" : inFlight > 0 ? "send" : status.data?.status === "done" ? "done" : "idle";
  const order = STAGES.findIndex((s) => s.id === active);
  const stageState = (i: number) => (active === "done" ? "done" : active === "idle" ? "todo" : i < order ? "done" : i === order ? "active" : "todo");
  const robot: RobotState = active === "search" ? "searching" : active === "send" ? "sending" : active === "done" ? "done" : "idle";

  const sent = t ? t.submitted + t.viewed + t.interview + t.offer + t.rejected : 0;
  const retained = t ? Object.values(t).reduce((a, b) => a + b, 0) : 0;

  return (
    <section className="card activity search-card reveal" data-state={robot} aria-labelledby="activity-title">
      <div className="activity-agent">
        <div className="thought" aria-hidden="true">
          <span key={active} className="thought-text">
            {THOUGHTS[active]}
          </span>
          {(active === "search" || active === "send") && (
            <span className="thinking-dots">
              <i />
              <i />
              <i />
            </span>
          )}
        </div>
        <div className="robot-stage">
          <RobotAgent state={robot} size={160} />
        </div>
      </div>

      <div className="stack" style={{ minWidth: 0 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3 id="activity-title" style={{ margin: 0 }}>
            {active !== "idle" && active !== "done" && <span className="live-dot" aria-hidden="true" />}
            Pilote automatique
          </h3>
          <button className="btn sm primary" disabled={running || start.isPending} onClick={() => start.mutate()}>
            {running || start.isPending ? "L'agent travaille…" : "Relancer l'agent"}
          </button>
        </div>
        <p className="sr-only" aria-live="polite">
          {THOUGHTS[active]}
        </p>

        <ol className="pipeline" aria-label="Étapes de l'agent">
          {STAGES.map((s, i) => (
            <li key={s.id} className={`step ${stageState(i)}`} aria-current={stageState(i) === "active" ? "step" : undefined}>
              <span className="step-icon" aria-hidden="true">
                {stageState(i) === "done" ? "✓" : s.icon}
              </span>
              <span className="step-label">{s.label}</span>
            </li>
          ))}
        </ol>

        <div className="search-stats">
          <div>
            <div className="muted">Offres analysées</div>
            <CountUp value={status.data?.offersFound ?? 0} />
          </div>
          <div>
            <div className="muted">Offres retenues</div>
            <CountUp value={retained} />
          </div>
          <div>
            <div className="muted">Candidatures envoyées</div>
            <CountUp value={sent} />
          </div>
        </div>

        <div>
          <h4 className="feed-title">Activité en direct</h4>
          {feed.data?.items.length ? (
            <ul className="feed">
              {feed.data.items.map((a, i) => {
                const f = FEED[a.status] ?? { icon: "•", text: a.status, tone: "var(--muted)" };
                return (
                  <li key={`${a.id}-${a.status}`} style={{ "--i": i, "--tone": f.tone } as CSSProperties}>
                    <span className="feed-icon" aria-hidden="true">
                      {f.icon}
                    </span>
                    <span className="feed-body">
                      <strong>{f.text}</strong>{" "}
                      <Link href={`/applications/${a.id}`}>{a.job.title}</Link>
                      <span className="muted"> · {a.job.company}</span>
                      {a.status === "needs_user_action" && a.lastEvent && <span className="feed-note">{a.lastEvent}</span>}
                    </span>
                    <time className="muted" dateTime={a.updatedAt}>
                      {ago(a.updatedAt)}
                    </time>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              Rien pour l&apos;instant : l&apos;activité de l&apos;agent apparaîtra ici en temps réel.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
