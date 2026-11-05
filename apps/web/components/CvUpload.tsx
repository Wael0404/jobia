"use client";

import { CV_MAX_BYTES, CV_MIME_TYPES } from "@jobia/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ChangeEvent } from "react";
import { api } from "../lib/api";

export function CvUpload() {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const cv = useQuery({
    queryKey: ["cv"],
    queryFn: api.latestCv,
    // Poll while the AI is reading the CV.
    refetchInterval: (q) => (q.state.data?.status === "parsing" ? 3_000 : false),
  });

  const upload = useMutation({
    mutationFn: (file: File) => api.uploadCv({ name: file.name, type: file.type, size: file.size, body: file }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cv"] }),
    onError: (e: Error) => setError(e.message),
  });

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setError(null);
    if (!file) return;
    if (!(CV_MIME_TYPES as readonly string[]).includes(file.type)) return setError("Format accepté : PDF ou DOCX");
    if (file.size > CV_MAX_BYTES) return setError("Fichier trop volumineux (10 Mo max)");
    upload.mutate(file);
  };

  const current = cv.data;
  return (
    <section className="card stack">
      <h3>Mon CV</h3>
      {current ? (
        <div>
          <strong>{current.fileName}</strong>{" "}
          <span className="muted">
            {current.status === "parsing" && "— analyse par l'IA en cours…"}
            {current.status === "ready" && "— analysé ✓"}
            {current.status === "failed" && `— ${current.error ?? "échec de l'analyse"}`}
          </span>
          {current.profile && (
            <p className="muted" style={{ marginBottom: 0 }}>
              {current.profile.headline} · {current.profile.skills.slice(0, 8).join(", ")}
            </p>
          )}
        </div>
      ) : (
        <p className="muted">Aucun CV pour le moment. Ajoutez-le pour lancer votre agent.</p>
      )}
      <label className="btn primary" style={{ width: "fit-content" }}>
        {upload.isPending ? "Envoi…" : current ? "Remplacer mon CV" : "Ajouter mon CV"}
        <input type="file" accept=".pdf,.docx" hidden onChange={onFile} disabled={upload.isPending} />
      </label>
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
    </section>
  );
}
