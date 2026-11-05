"use client";

import { BOARD_PROVIDERS, type BoardProvider } from "@jobia/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api } from "../../../lib/api";

const LABELS: Record<BoardProvider, string> = {
  linkedin: "LinkedIn",
  tanitjobs: "Tanitjobs",
  keejob: "Keejob",
  emploitunisie: "Emploitunisie",
};

export default function SettingsPage() {
  const qc = useQueryClient();
  const integrations = useQuery({ queryKey: ["integrations"], queryFn: api.integrations });
  const [form, setForm] = useState<{ provider: BoardProvider; login: string; password: string; accepted: boolean }>({
    provider: "tanitjobs",
    login: "",
    password: "",
    accepted: false,
  });
  const [error, setError] = useState<string | null>(null);

  const connect = useMutation({
    mutationFn: () => api.connectBoard(form.provider, form.login, form.password),
    onSuccess: () => {
      setForm({ ...form, login: "", password: "", accepted: false });
      void qc.invalidateQueries({ queryKey: ["integrations"] });
    },
    onError: (e: Error) => setError(e.message),
  });
  const disconnect = useMutation({
    mutationFn: (provider: string) => api.disconnect(provider),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integrations"] }),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    connect.mutate();
  };

  return (
    <div className="stack">
      <h1>Paramètres</h1>

      <section className="card">
        <h3>Comptes connectés</h3>
        <table>
          <tbody>
            {integrations.data?.map((i) => (
              <tr key={i.provider}>
                <td>{i.provider === "google" ? "Google / Gmail" : LABELS[i.provider]}</td>
                <td className="muted">{i.account}</td>
                <td>
                  <span className={`badge ${i.status === "connected" ? "interview" : "needs_user_action"}`}>
                    {i.status === "connected" ? "Connecté" : "Reconnexion requise"}
                  </span>
                  {i.lastError && <div className="muted" style={{ fontSize: 13 }}>{i.lastError}</div>}
                </td>
                <td>
                  {i.provider !== "google" && (
                    <button className="btn danger" onClick={() => disconnect.mutate(i.provider)}>
                      Déconnecter
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <form className="card stack" onSubmit={onSubmit}>
        <h3>Connecter un site d&apos;emploi</h3>
        <div className="row">
          <select value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value as BoardProvider })}>
            {BOARD_PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {LABELS[p]}
              </option>
            ))}
          </select>
          <input placeholder="Email / identifiant" autoComplete="off" value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} required />
          <input type="password" placeholder="Mot de passe" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        </div>
        <div className="card warning muted" style={{ fontSize: 14 }}>
          Votre mot de passe est chiffré (AES-256-GCM) et n&apos;est jamais affiché. L&apos;agent se connecte en votre nom,
          à un rythme limité. {form.provider === "linkedin" && (
            <strong>
              LinkedIn interdit l&apos;automatisation dans ses conditions d&apos;utilisation : votre compte peut être restreint.
              Activez-le en connaissance de cause.
            </strong>
          )}
        </div>
        <label className="row">
          <input type="checkbox" checked={form.accepted} onChange={(e) => setForm({ ...form, accepted: e.target.checked })} />
          J&apos;autorise Jobia à se connecter et à postuler en mon nom sur ce site.
        </label>
        <button className="btn primary" disabled={!form.accepted || connect.isPending} style={{ width: "fit-content" }}>
          Connecter
        </button>
        {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
      </form>

      <section className="card stack">
        <h3>Données personnelles</h3>
        <p className="muted">Supprime définitivement votre compte, vos CV, vos accès et l&apos;historique des candidatures.</p>
        <button
          className="btn danger"
          style={{ width: "fit-content" }}
          onClick={() => {
            if (confirm("Supprimer définitivement votre compte ?")) void api.deleteAccount().then(() => api.signOut()).then(() => window.location.assign("/"));
          }}
        >
          Supprimer mon compte
        </button>
      </section>
    </div>
  );
}
