"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { AgentModeSwitch } from "../../../components/AgentModeSwitch";
import { CvUpload } from "../../../components/CvUpload";
import { ApplicationsTable } from "../../../components/ApplicationsTable";
import { api } from "../../../lib/api";

export default function DashboardPage() {
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  const report = useQuery({ queryKey: ["report"], queryFn: api.reportSummary, refetchInterval: 60_000 });
  const recent = useQuery({ queryKey: ["applications", "recent"], queryFn: () => api.applications({ limit: 8 }) });
  const toReview = useQuery({
    queryKey: ["applications", "pending_review"],
    queryFn: () => api.applications({ status: "pending_review", limit: 5 }),
  });

  const t = report.data?.totals;
  const sent = t ? t.submitted + t.viewed + t.interview + t.offer + t.rejected : 0;

  return (
    <div className="stack">
      <h1>Bonjour {me.data?.name.split(" ")[0] ?? ""} 👋</h1>

      <div className="grid">
        <div className="card">
          <div className="muted">Candidatures envoyées</div>
          <div className="stat">{sent}</div>
        </div>
        <div className="card">
          <div className="muted">Entretiens</div>
          <div className="stat">{t?.interview ?? 0}</div>
        </div>
        <div className="card">
          <div className="muted">En attente de validation</div>
          <div className="stat">{t?.pending_review ?? 0}</div>
        </div>
        <div className="card">
          <div className="muted">Action requise</div>
          <div className="stat" style={{ color: t?.needs_user_action ? "var(--warning)" : undefined }}>
            {t?.needs_user_action ?? 0}
          </div>
        </div>
      </div>

      <div className="grid">
        <CvUpload />
        <AgentModeSwitch />
      </div>

      {report.data && report.data.upcomingInterviews.length > 0 && (
        <section className="card">
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
        <section className="card">
          <h3>Offres proposées par l&apos;agent</h3>
          <ApplicationsTable items={toReview.data.items} />
          <Link href="/applications?status=pending_review">Tout voir →</Link>
        </section>
      )}

      <section className="card">
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
