import { JobiaClient, type TokenStore } from "@jobia/api-client";
import type { AuthTokens } from "@jobia/shared";
import Constants from "expo-constants";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";

const KEY = "jobia.tokens";

/** Tokens live in the iOS Keychain / Android Keystore, never in AsyncStorage. */
const secureStore: TokenStore = {
  async get() {
    const raw = await SecureStore.getItemAsync(KEY);
    return raw ? (JSON.parse(raw) as AuthTokens) : null;
  },
  async set(tokens) {
    if (tokens) await SecureStore.setItemAsync(KEY, JSON.stringify(tokens));
    else await SecureStore.deleteItemAsync(KEY);
  },
};

/** EXPO_PUBLIC_API_URL (set at build/start time) wins over app.json `extra.apiUrl`. */
const apiUrl =
  process.env.EXPO_PUBLIC_API_URL ?? (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? "http://localhost:4000";

export const api = new JobiaClient(apiUrl, secureStore, () => router.replace("/"));
export const hasSession = async () => Boolean(await secureStore.get());
export const MOBILE_REDIRECT = "jobia://auth";
