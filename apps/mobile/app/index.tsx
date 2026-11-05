import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Button, colors, styles } from "../components/ui";
import { api, hasSession, MOBILE_REDIRECT } from "../lib/api";

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void hasSession().then((ok) => ok && router.replace("/(tabs)/dashboard"));
  }, []);

  /**
   * Google sign-in through the system browser (ASWebAuthenticationSession /
   * Custom Tabs). The API holds the OAuth secret; the app only receives a
   * one-time code on the jobia:// deep link and exchanges it for tokens.
   */
  const signIn = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await WebBrowser.openAuthSessionAsync(api.googleSignInUrl(MOBILE_REDIRECT), MOBILE_REDIRECT);
      if (result.type !== "success") return;
      const code = new URL(result.url).searchParams.get("code");
      if (!code) throw new Error("missing code");
      await api.exchangeLoginCode(code);
      router.replace("/(tabs)/dashboard");
    } catch {
      setError("La connexion a échoué. Réessayez.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.screen, { justifyContent: "center", padding: 24, gap: 16 }]}>
      <Text style={[styles.h1, { fontSize: 34 }]}>Jobia</Text>
      <Text style={[styles.muted, { fontSize: 16 }]}>
        Déposez votre CV : votre agent IA postule pour vous sur LinkedIn et les sites d&apos;emploi, puis suit chaque réponse.
      </Text>
      <Button title="Continuer avec Google" variant="primary" onPress={signIn} loading={loading} />
      {error && <Text style={{ color: colors.danger }}>{error}</Text>}
    </View>
  );
}
