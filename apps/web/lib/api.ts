"use client";

import { JobiaClient, type TokenStore } from "@jobia/api-client";
import type { AuthTokens } from "@jobia/shared";

const KEY = "jobia.tokens";

/**
 * Browser token storage. For a stricter posture, move the refresh token to
 * an httpOnly cookie behind a small BFF route; the client API stays the same.
 */
const browserStore: TokenStore = {
  async get() {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AuthTokens) : null;
  },
  async set(tokens) {
    if (tokens) window.localStorage.setItem(KEY, JSON.stringify(tokens));
    else window.localStorage.removeItem(KEY);
  },
};

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export const api = new JobiaClient(API_URL, browserStore, () => {
  if (typeof window !== "undefined" && !window.location.pathname.startsWith("/auth")) window.location.assign("/");
});

export const hasSession = () => browserStore.get().then(Boolean);
