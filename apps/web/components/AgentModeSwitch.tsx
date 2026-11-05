"use client";

import type { AgentMode } from "@jobia/shared";
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
    onSuccess: (data) => qc.setQueryData(["preferences"], data),
  });

  if (!prefs.data) return null;
  const current = MODES.find((m) => m.value === prefs.data.agentMode);

  return (
    <section className="card stack">
      <h3>Mon agent</h3>
      <div className="row">
        {MODES.map((m) => (
          <button
            key={m.value}
            className={`btn ${m.value === prefs.data.agentMode ? "primary" : ""}`}
            disabled={save.isPending}
            onClick={() => save.mutate(m.value)}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="muted" style={{ margin: 0 }}>
        {current?.help} Score minimum : {prefs.data.minMatchScore}/100 · max {prefs.data.maxApplicationsPerDay} candidatures/jour.
      </p>
    </section>
  );
}
