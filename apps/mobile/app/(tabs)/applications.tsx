import type { ApplicationDto } from "@jobia/shared";
import { useInfiniteQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { FlatList, Pressable, Text, View } from "react-native";
import { Card, StatusBadge, styles } from "../../components/ui";
import { api } from "../../lib/api";

export default function ApplicationsScreen() {
  const query = useInfiniteQuery({
    queryKey: ["applications", "list"],
    queryFn: ({ pageParam }) => api.applications({ cursor: pageParam, limit: 25 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <FlatList<ApplicationDto>
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={items}
      keyExtractor={(a) => a.id}
      onRefresh={() => void query.refetch()}
      refreshing={query.isRefetching}
      onEndReached={() => query.hasNextPage && void query.fetchNextPage()}
      ListEmptyComponent={<Text style={styles.muted}>Aucune candidature pour le moment.</Text>}
      renderItem={({ item }) => (
        <Pressable onPress={() => router.push(`/application/${item.id}`)}>
          <Card>
            <Text style={styles.h3}>{item.job.title}</Text>
            <Text style={styles.muted}>
              {item.job.company} · {item.source} · score {item.matchScore}
            </Text>
            <View style={styles.row}>
              <StatusBadge status={item.status} />
              {item.lastEvent && <Text style={[styles.muted, { flexShrink: 1 }]}>{item.lastEvent}</Text>}
            </View>
          </Card>
        </Pressable>
      )}
    />
  );
}
