import { Tabs } from "expo-router";
import { colors } from "../../components/ui";

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: colors.primary }}>
      <Tabs.Screen name="dashboard" options={{ title: "Tableau de bord" }} />
      <Tabs.Screen name="applications" options={{ title: "Candidatures" }} />
      <Tabs.Screen name="settings" options={{ title: "Paramètres" }} />
    </Tabs>
  );
}
