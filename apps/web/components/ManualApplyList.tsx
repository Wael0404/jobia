"use client";

import type { ApplicationDto } from "@jobia/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "../lib/api";

/**
 * LinkedIn Easy Apply offers for which no recruiter email was published:
 * the agent prepared everything, the user applies on LinkedIn in one click.
 */
export function ManualApplyList({ items }: { items: ApplicationDto[] }) {
  const qc = useQueryClient();
  const markApplied = useMutation({
    mutationFn: (id: string) => api.markApplied(id),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ["applications"] }), qc.invalidateQueries({ queryKey: ["report"] })]),
  });

  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {items.map((a) => (
        <li key={a.id} className="row" style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
          <div style={{ marginRight: "auto", minWidth: 200 }}>
            <Link href={`/applications/${a.id}`}>{a.job.title}</Link>
            <div className="muted">
              {a.job.company} · score {a.matchScore}
            </div>
          </div>
          <a className="btn linkedin" href={a.job.url} target="_blank" rel="noreferrer noopener">
            Postuler sur LinkedIn ↗
          </a>
          <button className="btn" onClick={() => markApplied.mutate(a.id)} disabled={markApplied.isPending}>
            J&apos;ai postulé ✓
          </button>
        </li>
      ))}
    </ul>
  );
}
