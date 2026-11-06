"use client";

import type { ApplicationDto } from "@jobia/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "../lib/api";
import { StatusBadge } from "./StatusBadge";

const dateFmt = new Intl.DateTimeFormat("fr-TN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * Applications list. With `actions`, offers waiting for the user's decision
 * (pending_review) can be approved or dismissed straight from the row.
 */
export function ApplicationsTable({ items, actions = false }: { items: ApplicationDto[]; actions?: boolean }) {
  const qc = useQueryClient();
  const decide = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) => (approve ? api.approve(id) : api.withdraw(id)),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["applications"] });
      void qc.invalidateQueries({ queryKey: ["report"] });
    },
  });
  const showActions = actions && items.some((a) => a.status === "pending_review");

  return (
    <>
      <table>
        <thead>
          <tr>
            <th>Poste</th>
            <th className="hide-mobile">Source</th>
            <th>Statut</th>
            <th className="hide-mobile">Score</th>
            <th>Date d&apos;envoi</th>
            {showActions && <th>Décision</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((a) => {
            const busy = decide.isPending && decide.variables?.id === a.id;
            return (
              <tr key={a.id}>
                <td>
                  <Link href={`/applications/${a.id}`}>{a.job.title}</Link>
                  <div className="muted">{a.job.company}</div>
                </td>
                <td className="hide-mobile">{a.source}</td>
                <td>
                  <StatusBadge status={a.status} />
                </td>
                <td className="hide-mobile">{a.matchScore}</td>
                <td>
                  {a.submittedAt ? (
                    <time dateTime={a.submittedAt} title={new Date(a.submittedAt).toLocaleString("fr-TN")}>
                      {dateFmt.format(new Date(a.submittedAt))}
                    </time>
                  ) : (
                    <span className="muted">Pas encore envoyée</span>
                  )}
                </td>
                {showActions && (
                  <td>
                    {a.status === "pending_review" && (
                      <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                        <a
                          className="btn sm"
                          href={a.job.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          aria-label={`Voir l'offre ${a.job.title} (nouvel onglet)`}
                        >
                          ↗<span className="hide-mobile">Voir</span>
                        </a>
                        <button
                          type="button"
                          className="btn sm primary"
                          disabled={busy}
                          onClick={() => decide.mutate({ id: a.id, approve: true })}
                          aria-label={`Valider ${a.job.title}`}
                        >
                          ✓<span className="hide-mobile">Valider</span>
                        </button>
                        <button
                          type="button"
                          className="btn sm danger"
                          disabled={busy}
                          onClick={() => decide.mutate({ id: a.id, approve: false })}
                          aria-label={`Écarter ${a.job.title}`}
                        >
                          ✕<span className="hide-mobile">Écarter</span>
                        </button>
                      </div>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {decide.isError && (
        <p role="alert" style={{ color: "var(--danger)" }}>
          Action impossible : {decide.error.message}
        </p>
      )}
    </>
  );
}
