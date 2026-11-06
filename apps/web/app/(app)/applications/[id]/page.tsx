"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { StatusBadge } from "../../../../components/StatusBadge";
import { api } from "../../../../lib/api";

export default function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const app = useQuery({ queryKey: ["application", id], queryFn: () => api.application(id) });
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["application", id] }), qc.invalidateQueries({ queryKey: ["report"] })]);
  const act = useMutation({ mutationFn: (fn: () => Promise<void>) => fn(), onSuccess: refresh });

  if (!app.data) return <p className="muted">Chargement…</p>;
  const a = app.data;

  const submitAnswers = () =>
    act.mutate(async () => {
      await api.saveAnswers(answers);
      await api.retry(a.id);
    });

  return (
    <div className="stack">
      <div className="row">
        <h1 style={{ marginRight: "auto" }}>
          {a.job.title} <span className="muted">· {a.job.company}</span>
        </h1>
        <StatusBadge status={a.status} />
      </div>

      <div className="row">
        {a.status === "user_to_apply" ? (
          <>
            <a className="btn linkedin" href={a.job.url} target="_blank" rel="noreferrer noopener">
              Postuler sur LinkedIn ↗
            </a>
            <button className="btn primary" onClick={() => act.mutate(() => api.markApplied(a.id))} disabled={act.isPending}>
              J&apos;ai postulé ✓
            </button>
          </>
        ) : (
          <a className="btn" href={a.job.url} target="_blank" rel="noreferrer noopener">
            Voir l&apos;offre ({a.source})
          </a>
        )}
        {a.status === "pending_review" && (
          <button className="btn primary" onClick={() => act.mutate(() => api.approve(a.id))} disabled={act.isPending}>
            Valider et postuler
          </button>
        )}
        {a.status === "failed" && (
          <button className="btn" onClick={() => act.mutate(() => api.retry(a.id))} disabled={act.isPending}>
            Réessayer
          </button>
        )}
        {["pending_review", "queued", "needs_user_action", "user_to_apply", "submitted", "viewed", "interview"].includes(a.status) && (
          <button className="btn danger" onClick={() => act.mutate(() => api.withdraw(a.id))} disabled={act.isPending}>
            {a.status === "user_to_apply" ? "Pas intéressé" : "Retirer"}
          </button>
        )}
      </div>

      {a.appliedVia && a.status !== "user_to_apply" && (
        <p className="muted" style={{ margin: 0 }}>
          Envoyée {a.appliedVia === "email" ? "par email au recruteur" : a.appliedVia === "easy_apply" ? "par vous sur LinkedIn" : "via le formulaire du site"}
        </p>
      )}

      {a.status === "needs_user_action" && a.pendingQuestions.length > 0 && (
        <section className="card warning stack">
          <h3>L&apos;agent a besoin de vous</h3>
          <p className="muted">Ces réponses seront mémorisées et réutilisées pour les prochains formulaires.</p>
          {a.pendingQuestions.map((q) => (
            <label key={q} className="stack" style={{ display: "block" }}>
              <div>{q}</div>
              <input style={{ width: "100%" }} value={answers[q] ?? ""} onChange={(e) => setAnswers({ ...answers, [q]: e.target.value })} />
            </label>
          ))}
          <button className="btn primary" onClick={submitAnswers} disabled={act.isPending}>
            Envoyer et relancer la candidature
          </button>
        </section>
      )}

      <div className="grid">
        <section className="card">
          <h3>Pourquoi cette offre ? ({a.matchScore}/100)</h3>
          <ul>
            {a.matchReasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>
        {a.coverLetter && (
          <section className="card">
            <div className="row">
              <h3 style={{ marginRight: "auto" }}>{a.status === "user_to_apply" ? "Lettre préparée pour vous" : "Message envoyé"}</h3>
              <button className="btn" onClick={() => void navigator.clipboard.writeText(a.coverLetter ?? "")}>
                Copier
              </button>
            </div>
            <p style={{ whiteSpace: "pre-wrap" }}>{a.coverLetter}</p>
          </section>
        )}
      </div>

      <section className="card">
        <h3>Historique</h3>
        <ul className="timeline">
          {a.events.map((e) => (
            <li key={e.id}>
              <div>{e.message}</div>
              <div className="muted" style={{ fontSize: 13 }}>
                {new Date(e.occurredAt).toLocaleString("fr-TN")} · {e.actor === "employer" ? "Recruteur" : e.actor === "agent" ? "Agent" : e.actor === "user" ? "Vous" : "Système"}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
