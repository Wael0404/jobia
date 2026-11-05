import { BOARD_PROVIDERS, type BoardProvider } from "@jobia/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { Button, Card, colors, styles } from "../../components/ui";
import { api } from "../../lib/api";

const LABELS: Record<BoardProvider, string> = { linkedin: "LinkedIn", tanitjobs: "Tanitjobs", keejob: "Keejob", emploitunisie: "Emploitunisie" };

export default function SettingsScreen() {
  const qc = useQueryClient();
  const integrations = useQuery({ queryKey: ["integrations"], queryFn: api.integrations });
  const [provider, setProvider] = useState<BoardProvider>("tanitjobs");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);

  const connect = useMutation({
    mutationFn: () => api.connectBoard(provider, login, password),
    onSuccess: () => {
      setLogin("");
      setPassword("");
      setAccepted(false);
      void qc.invalidateQueries({ queryKey: ["integrations"] });
    },
  });

  const signOut = () => void api.signOut().then(() => router.replace("/"));
  const deleteAccount = () =>
    Alert.alert("Supprimer le compte", "Toutes vos données seront supprimées définitivement.", [
      { text: "Annuler", style: "cancel" },
      { text: "Supprimer", style: "destructive", onPress: () => void api.deleteAccount().then(signOut) },
    ]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card>
        <Text style={styles.h3}>Comptes connectés</Text>
        {integrations.data?.map((i) => (
          <View key={i.provider} style={[styles.row, { justifyContent: "space-between" }]}>
            <Text>{i.provider === "google" ? "Google / Gmail" : LABELS[i.provider]}</Text>
            <Text style={{ color: i.status === "connected" ? colors.success : colors.warning }}>
              {i.status === "connected" ? "Connecté" : "Reconnexion requise"}
            </Text>
          </View>
        ))}
      </Card>

      <Card>
        <Text style={styles.h3}>Connecter un site d&apos;emploi</Text>
        <View style={styles.row}>
          {BOARD_PROVIDERS.map((p) => (
            <Button key={p} title={LABELS[p]} variant={p === provider ? "primary" : "default"} onPress={() => setProvider(p)} />
          ))}
        </View>
        <TextInput style={styles.input} placeholder="Email / identifiant" autoCapitalize="none" value={login} onChangeText={setLogin} />
        <TextInput style={styles.input} placeholder="Mot de passe" secureTextEntry value={password} onChangeText={setPassword} />
        {provider === "linkedin" && (
          <Text style={{ color: colors.warning }}>
            LinkedIn interdit l&apos;automatisation dans ses conditions d&apos;utilisation : votre compte peut être restreint.
          </Text>
        )}
        <View style={styles.row}>
          <Switch value={accepted} onValueChange={setAccepted} />
          <Text style={{ flex: 1 }}>J&apos;autorise Jobia à se connecter et à postuler en mon nom sur ce site.</Text>
        </View>
        <Button title="Connecter" variant="primary" disabled={!accepted || !login || !password} loading={connect.isPending} onPress={() => connect.mutate()} />
        {connect.error && <Text style={{ color: colors.danger }}>{connect.error.message}</Text>}
      </Card>

      <Button title="Se déconnecter" onPress={signOut} />
      <Button title="Supprimer mon compte" variant="danger" onPress={deleteAccount} />
    </ScrollView>
  );
}
