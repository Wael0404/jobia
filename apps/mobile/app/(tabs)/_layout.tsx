import { useQuery } from "@tanstack/react-query";
import { Tabs } from "expo-router";
import { colors } from "../../components/ui";
import { api } from "../../lib/api";

export default function TabsLayout() {
  // Badge = Easy Apply offers waiting for the user's one-click application.
  const toApply = useQuery({ queryKey: ["report"], queryFn: api.reportSummary, refetchInterval: 60_000 });
  const pending = toApply.data?.totals.user_to_apply ?? 0;

  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: colors.primary }}>
      <Tabs.Screen name="dashboard" options={{ title: "Tableau de bord", tabBarBadge: pending > 0 ? pending : undefined }} />
      <Tabs.Screen name="applications" options={{ title: "Candidatures" }} />
      <Tabs.Screen name="settings" options={{ title: "Paramètres" }} />
    </Tabs>
  );
}
