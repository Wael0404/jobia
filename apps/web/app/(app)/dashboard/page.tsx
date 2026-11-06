"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import type { CSSProperties } from "react";
import { CountUp } from "../../../components/CountUp";
import { AgentActivity } from "../../../components/AgentActivity";
import { AgentModeSwitch } from "../../../components/AgentModeSwitch";
import { CvUpload } from "../../../components/CvUpload";
import { ApplicationsTable } from "../../../components/ApplicationsTable";
import { JobSearchCard } from "../../../components/JobSearchCard";
import { PlanCard } from "../../../components/PlanCard";
import { api } from "../../../lib/api";

export default function DashboardPage() {
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  const prefs = useQuery({ queryKey: ["preferences"], queryFn: api.preferences });
  const report = useQuery({ queryKey: ["report"], queryFn: api.reportSummary, refetchInterval: 60_000 });
  const recent = useQuery({ queryKey: ["applications", "recent"], queryFn: () => api.applications({ limit: 8 }) });
  const toReview = useQuery({
    queryKey: ["applications", "pending_review"],
    queryFn: () => api.applications({ status: "pending_review", limit: 5 }),
  });

  const t = report.data?.totals;
  const sent = t ? t.submitted + t.viewed + t.interview + t.offer + t.rejected : 0;

  const stats = [
    { label: "Candidatures envoyées", value: sent, icon: "🚀", tone: "var(--primary)" },
    { label: "Entretiens", value: t?.interview ?? 0, icon: "📅", tone: "var(--success)" },
    { label: "En attente de validation", value: t?.pending_review ?? 0, icon: "⏳", tone: "var(--warning)" },
    { label: "Action requise", value: t?.needs_user_action ?? 0, icon: "⚠️", tone: "var(--danger)" },
  ];

  return (
    <div className="stack">
      <div className="page-head reveal">
        <div>
          <h1 style={{ marginBottom: 4 }}>
            Bonjour <span className="gradient-text">{me.data?.name.split(" ")[0] ?? ""}</span> 👋
          </h1>
          <p className="muted" style={{ margin: 0 }}>
            Voici où en est votre recherche d&apos;emploi.
          </p>
        </div>
      </div>

      <div className="grid">
        {stats.map((s, i) => (
          <div key={s.label} className="card lift stat-card reveal" style={{ "--i": i + 1, "--tone": s.tone } as CSSProperties}>
            <div className="stat-icon" aria-hidden="true">
              {s.icon}
            </div>
            <div className="muted">{s.label}</div>
            <CountUp value={s.value} />
          </div>
        ))}
      </div>

      {prefs.data?.agentMode === "autopilot" ? <AgentActivity /> : <JobSearchCard />}

      <div className="grid">
        <CvUpload />
        <AgentModeSwitch />
        <PlanCard />
      </div>

      {report.data && report.data.upcomingInterviews.length > 0 && (
        <section className="card on-scroll">
          <h3>Prochains entretiens</h3>
          <ul>
            {report.data.upcomingInterviews.map((i) => (
              <li key={i.applicationId}>
                <Link href={`/applications/${i.applicationId}`}>
                  {new Date(i.scheduledAt).toLocaleString("fr-TN", { dateStyle: "full", timeStyle: "short" })} — {i.title} chez{" "}
                  {i.company}
                </Link>
                {i.location && <span className="muted"> · {i.location}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {toReview.data && toReview.data.items.length > 0 && (
        <section className="card on-scroll">
          <h3 style={{ marginBottom: 4 }}>Offres proposées par l&apos;agent</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            Validez les offres qui vous intéressent, écartez les autres. Rien n&apos;est envoyé sans votre accord.
          </p>
          <ApplicationsTable items={toReview.data.items} actions />
          <Link href="/applications?status=pending_review">Tout voir →</Link>
        </section>
      )}

      <section className="card on-scroll">
        <h3>Dernières activités</h3>
        {recent.data?.items.length ? (
          <ApplicationsTable items={recent.data.items} />
        ) : (
          <p className="muted">Aucune candidature pour le moment. L&apos;agent démarre dès que votre CV est analysé.</p>
        )}
      </section>
    </div>
  );
}
