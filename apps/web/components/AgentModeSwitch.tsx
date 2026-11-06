"use client";

import type { AgentMode, JobPreferences } from "@jobia/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

const MODES: Array<{ value: AgentMode; label: string; help: string }> = [
  { value: "review", label: "Validation", help: "L'agent propose, vous validez chaque candidature." },
  { value: "autopilot", label: "Pilote automatique", help: "L'agent postule seul aux offres au-dessus de votre score minimum." },
  { value: "paused", label: "En pause", help: "L'agent ne recherche ni ne postule." },
];

export function AgentModeSwitch() {
  const qc = useQueryClient();
  const prefs = useQuery({ queryKey: ["preferences"], queryFn: api.preferences });
  const save = useMutation({
    mutationFn: (agentMode: AgentMode) => api.updatePreferences({ ...prefs.data!, agentMode }),
    // Optimistic update: the selected button changes instantly, rolled back on error.
    onMutate: async (agentMode) => {
      await qc.cancelQueries({ queryKey: ["preferences"] });
      const before = qc.getQueryData<JobPreferences>(["preferences"]);
      if (before) qc.setQueryData<JobPreferences>(["preferences"], { ...before, agentMode });
      return { before };
    },
    onError: (_e, _mode, ctx) => ctx?.before && qc.setQueryData(["preferences"], ctx.before),
    onSuccess: (data) => qc.setQueryData(["preferences"], data),
    onSettled: () => void qc.invalidateQueries({ queryKey: ["me"] }),
  });

  if (!prefs.data) return null;
  const current = MODES.find((m) => m.value === prefs.data.agentMode);

  return (
    <section className="card stack">
      <h3>Mon agent</h3>
      <div className="row" role="radiogroup" aria-label="Mode de l'agent">
        {MODES.map((m) => {
          const selected = m.value === prefs.data.agentMode;
          return (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`btn ${selected ? "primary" : ""}`}
              disabled={save.isPending}
              onClick={() => !selected && save.mutate(m.value)}
            >
              {m.label}
            </button>
          );
        })}
      </div>
      <p className="muted" style={{ margin: 0 }}>
        {current?.help} Score minimum : {prefs.data.minMatchScore}/100 · max {prefs.data.maxApplicationsPerDay} candidatures/jour.
      </p>
      {save.isError && (
        <p role="alert" style={{ color: "var(--danger)", margin: 0 }}>
          Impossible de changer le mode : {save.error.message}
        </p>
      )}
    </section>
  );
}
