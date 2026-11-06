import type { AgentMode } from "@jobia/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { router } from "expo-router";
import { Linking, RefreshControl, ScrollView, Text, View } from "react-native";
import { Button, Card, colors, StatusBadge, styles } from "../../components/ui";
import { api } from "../../lib/api";

const MODES: Array<{ value: AgentMode; label: string }> = [
  { value: "review", label: "Validation" },
  { value: "autopilot", label: "Auto" },
  { value: "paused", label: "Pause" },
];

export default function DashboardScreen() {
  const qc = useQueryClient();
  const report = useQuery({ queryKey: ["report"], queryFn: api.reportSummary, refetchInterval: 60_000 });
  const cv = useQuery({
    queryKey: ["cv"],
    queryFn: api.latestCv,
    refetchInterval: (q) => (q.state.data?.status === "parsing" ? 3_000 : false),
  });
  const prefs = useQuery({ queryKey: ["preferences"], queryFn: api.preferences });
  const recent = useQuery({ queryKey: ["applications", "recent"], queryFn: () => api.applications({ limit: 5 }) });
  const toApply = useQuery({
    queryKey: ["applications", "user_to_apply"],
    queryFn: () => api.applications({ status: "user_to_apply", limit: 10 }),
  });
  const markApplied = useMutation({
    mutationFn: (id: string) => api.markApplied(id),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ["applications"] }), qc.invalidateQueries({ queryKey: ["report"] })]),
  });

  const upload = useMutation({
    mutationFn: async () => {
      const pick = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
        copyToCacheDirectory: true,
      });
      const asset = pick.assets?.[0];
      if (pick.canceled || !asset) return;
      const body = await (await fetch(asset.uri)).blob();
      await api.uploadCv({ name: asset.name, type: asset.mimeType ?? "application/pdf", size: asset.size ?? body.size, body });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cv"] }),
  });

  const setMode = useMutation({
    mutationFn: (agentMode: AgentMode) => api.updatePreferences({ ...prefs.data!, agentMode }),
    onSuccess: (data) => qc.setQueryData(["preferences"], data),
  });

  const t = report.data?.totals;
  const refreshing = report.isRefetching || recent.isRefetching;
  const onRefresh = () => void Promise.all([report.refetch(), recent.refetch(), cv.refetch(), toApply.refetch()]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <View style={[styles.row, { justifyContent: "space-between" }]}>
        {[
          ["Envoyées", t ? t.submitted + t.viewed + t.interview + t.offer + t.rejected : 0],
          ["Entretiens", t?.interview ?? 0],
          ["À valider", t?.pending_review ?? 0],
          ["Action requise", t?.needs_user_action ?? 0],
        ].map(([label, value]) => (
          <Card key={label} style={{ width: "48%" }}>
            <Text style={styles.muted}>{label}</Text>
            <Text style={styles.stat}>{value}</Text>
          </Card>
        ))}
      </View>

      <Card>
        <Text style={styles.h3}>Mon CV</Text>
        {cv.data ? (
          <Text style={styles.muted}>
            {cv.data.fileName} — {cv.data.status === "parsing" ? "analyse en cours…" : cv.data.status === "ready" ? "analysé ✓" : cv.data.error ?? cv.data.status}
          </Text>
        ) : (
          <Text style={styles.muted}>Ajoutez votre CV pour lancer l&apos;agent.</Text>
        )}
        <Button title={cv.data ? "Remplacer mon CV" : "Ajouter mon CV"} variant="primary" onPress={() => upload.mutate()} loading={upload.isPending} />
        {upload.error && <Text style={{ color: colors.danger }}>{upload.error.message}</Text>}
      </Card>

      {prefs.data && (
        <Card>
          <Text style={styles.h3}>Mon agent</Text>
          <View style={styles.row}>
            {MODES.map((m) => (
              <Button key={m.value} title={m.label} variant={prefs.data.agentMode === m.value ? "primary" : "default"} onPress={() => setMode.mutate(m.value)} />
            ))}
          </View>
        </Card>
      )}

      {toApply.data && toApply.data.items.length > 0 && (
        <Card style={{ borderLeftWidth: 4, borderLeftColor: "#5b3fd6" }}>
          <Text style={styles.h3}>À postuler vous-même ({toApply.data.items.length})</Text>
          <Text style={styles.muted}>
            Pas d&apos;email RH pour ces offres LinkedIn. Votre lettre est prête : postulez en un clic, puis confirmez.
          </Text>
          {toApply.data.items.map((a) => (
            <View key={a.id} style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border, gap: 6 }}>
              <Text style={{ fontWeight: "600" }} onPress={() => router.push(`/application/${a.id}`)}>
                {a.job.title}
              </Text>
              <Text style={styles.muted}>{a.job.company} · score {a.matchScore}</Text>
              <View style={styles.row}>
                <Button title="Postuler sur LinkedIn" variant="primary" onPress={() => void Linking.openURL(a.job.url)} />
                <Button title="J'ai postulé ✓" onPress={() => markApplied.mutate(a.id)} loading={markApplied.isPending} />
              </View>
            </View>
          ))}
        </Card>
      )}

      {report.data?.upcomingInterviews.map((i) => (
        <Card key={i.applicationId}>
          <Text style={styles.h3}>📅 Entretien — {i.company}</Text>
          <Text>{new Date(i.scheduledAt).toLocaleString("fr-TN")}</Text>
          <Text style={styles.muted}>{i.title}{i.location ? ` · ${i.location}` : ""}</Text>
        </Card>
      ))}

      <Card>
        <Text style={styles.h3}>Dernières activités</Text>
        {recent.data?.items.map((a) => (
          <View key={a.id} style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border, gap: 4 }}>
            <Text style={{ fontWeight: "600" }} onPress={() => router.push(`/application/${a.id}`)}>
              {a.job.title}
            </Text>
            <Text style={styles.muted}>{a.job.company} · {a.source}</Text>
            <StatusBadge status={a.status} />
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}
