import { STATUS_LABELS } from "@jobia/api-client";
import type { ApplicationStatus } from "@jobia/shared";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";

export const colors = {
  bg: "#f6f7fb",
  surface: "#ffffff",
  text: "#14161f",
  muted: "#5d6475",
  border: "#e3e6ee",
  primary: "#3b5bfd",
  success: "#1f9d55",
  warning: "#c77700",
  danger: "#d93b3b",
};

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button(props: { title: string; onPress: () => void; variant?: "primary" | "default" | "danger"; loading?: boolean; disabled?: boolean }) {
  const variant = props.variant ?? "default";
  return (
    <Pressable
      accessibilityRole="button"
      onPress={props.onPress}
      disabled={props.disabled || props.loading}
      style={({ pressed }) => [styles.button, variant === "primary" && styles.primary, (pressed || props.disabled) && { opacity: 0.6 }]}
    >
      {props.loading ? (
        <ActivityIndicator color={variant === "primary" ? "#fff" : colors.primary} />
      ) : (
        <Text style={[styles.buttonText, variant === "primary" && { color: "#fff" }, variant === "danger" && { color: colors.danger }]}>
          {props.title}
        </Text>
      )}
    </Pressable>
  );
}

const BADGE: Partial<Record<ApplicationStatus, string>> = {
  interview: colors.success,
  offer: colors.success,
  needs_user_action: colors.warning,
  user_to_apply: "#5b3fd6",
  pending_review: colors.warning,
  rejected: colors.danger,
  failed: colors.danger,
};

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  const color = BADGE[status] ?? colors.primary;
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={{ color, fontSize: 12, fontWeight: "600" }}>{STATUS_LABELS[status]}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12 },
  card: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 8 },
  h1: { fontSize: 26, fontWeight: "700", color: colors.text },
  h3: { fontSize: 17, fontWeight: "600", color: colors.text },
  muted: { color: colors.muted },
  stat: { fontSize: 26, fontWeight: "700", color: colors.text },
  row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  button: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: "center" },
  primary: { backgroundColor: colors.primary, borderColor: colors.primary },
  buttonText: { fontWeight: "600", color: colors.text },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2, alignSelf: "flex-start" },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, backgroundColor: colors.surface, color: colors.text },
});
