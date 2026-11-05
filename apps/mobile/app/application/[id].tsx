import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Linking, ScrollView, Text, TextInput, View } from "react-native";
import { Button, Card, colors, StatusBadge, styles } from "../../components/ui";
import { api } from "../../lib/api";

export default function ApplicationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const app = useQuery({ queryKey: ["application", id], queryFn: () => api.application(id) });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const act = useMutation({
    mutationFn: (fn: () => Promise<void>) => fn(),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ["application", id] }), qc.invalidateQueries({ queryKey: ["report"] })]),
  });

  const a = app.data;
  if (!a) return <View style={styles.screen} />;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>{a.job.title}</Text>
      <Text style={styles.muted}>
        {a.job.company} · {a.source} · score {a.matchScore}/100
      </Text>
      <StatusBadge status={a.status} />

      <View style={styles.row}>
        <Button title="Voir l'offre" onPress={() => void Linking.openURL(a.job.url)} />
        {a.status === "pending_review" && <Button title="Valider et postuler" variant="primary" loading={act.isPending} onPress={() => act.mutate(() => api.approve(a.id))} />}
        {a.status === "failed" && <Button title="Réessayer" onPress={() => act.mutate(() => api.retry(a.id))} />}
        {["pending_review", "queued", "needs_user_action", "submitted", "viewed", "interview"].includes(a.status) && (
          <Button title="Retirer" variant="danger" onPress={() => act.mutate(() => api.withdraw(a.id))} />
        )}
      </View>

      {a.status === "needs_user_action" && a.pendingQuestions.length > 0 && (
        <Card style={{ borderLeftWidth: 4, borderLeftColor: colors.warning }}>
          <Text style={styles.h3}>L&apos;agent a besoin de vous</Text>
          {a.pendingQuestions.map((q) => (
            <View key={q} style={{ gap: 4 }}>
              <Text>{q}</Text>
              <TextInput style={styles.input} value={answers[q] ?? ""} onChangeText={(v) => setAnswers({ ...answers, [q]: v })} />
            </View>
          ))}
          <Button
            title="Envoyer et relancer"
            variant="primary"
            loading={act.isPending}
            onPress={() => act.mutate(async () => { await api.saveAnswers(answers); await api.retry(a.id); })}
          />
        </Card>
      )}

      <Card>
        <Text style={styles.h3}>Pourquoi cette offre ?</Text>
        {a.matchReasons.map((r) => (
          <Text key={r}>• {r}</Text>
        ))}
      </Card>

      <Card>
        <Text style={styles.h3}>Historique</Text>
        {a.events.map((e) => (
          <View key={e.id} style={{ borderLeftWidth: 2, borderLeftColor: colors.primary, paddingLeft: 10, marginBottom: 8 }}>
            <Text>{e.message}</Text>
            <Text style={[styles.muted, { fontSize: 12 }]}>{new Date(e.occurredAt).toLocaleString("fr-TN")}</Text>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}
