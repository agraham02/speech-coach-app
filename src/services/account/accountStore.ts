import type { Session } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";
import { AppState } from "react-native";
import {
  parseAccountCache,
  providerFromAuth,
  serializeAccountCache,
  SIGNED_OUT,
  UNKNOWN_ACCOUNT,
  withAllowance,
  type AccountSnapshot,
} from "../../domain/account";
import { logger } from "../../utils/logger";
import { PROVIDER_ORDER } from "../cloud/providers";
import { getAccountCacheRaw, hasChosenCloudProvider, setAccountCacheRaw, setCloudProvider } from "../prefs/prefsStore";
import { getProviderKey } from "../secrets/secretsStore";
import { onAllowance, TonoApiError, tonoMe } from "../tono/tonoApi";
import { getSupabase } from "./supabaseClient";

// Who is signed in and what they have left, as one observable object
// (domain/account.ts). The copy kept between launches means the app knows the
// answer straight away; the server's answer follows and replaces it.

let state: AccountSnapshot = parseAccountCache(getAccountCacheRaw()) ?? UNKNOWN_ACCOUNT;
const listeners = new Set<() => void>();

function commit(next: AccountSnapshot): void {
  state = next;
  setAccountCacheRaw(serializeAccountCache(next));
  listeners.forEach((listener) => listener());
}

export const getAccount = (): AccountSnapshot => state;

export function subscribeAccount(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAccount(): AccountSnapshot {
  return useSyncExternalStore(subscribeAccount, getAccount, getAccount);
}

// A session appeared, changed or went away.
function applySession(session: Session | null): void {
  if (!session) {
    if (state.status !== "signedOut") commit(SIGNED_OUT);
    return;
  }
  const user = session.user;
  const provider = providerFromAuth(user.app_metadata?.provider ?? user.identities?.[0]?.provider);
  const email = user.email ?? null;
  if (state.status === "signedIn" && state.userId === user.id) {
    if (state.provider !== provider || state.email !== email) commit({ ...state, provider, email });
    return;
  }
  // Someone new: nothing from the last person carries over.
  commit({ ...SIGNED_OUT, status: "signedIn", userId: user.id, provider, email });
}

// Asks the server what this person has left. Quiet when offline: the cached
// answer stands.
let refreshing: Promise<void> | null = null;

// `syncPurchases`: the server should re-check the subscription first (right
// after a purchase or restore). A refresh already in flight started before the
// purchase, so it is waited for and the sync runs after it.
export async function refreshAccount(options?: { syncPurchases?: boolean }): Promise<void> {
  if (state.status !== "signedIn") return;
  if (refreshing) {
    if (!options?.syncPurchases) return refreshing;
    await refreshing;
  }
  refreshing = (async () => {
    try {
      const me = await tonoMe(options?.syncPurchases ? { refresh: true } : undefined);
      if (state.status !== "signedIn") return;
      commit({ ...withAllowance(state, me.allowance), allowed: me.allowed, mode: me.mode, killSwitch: me.killSwitch, plusPurchasable: me.plusPurchasable === true });
    } catch (error) {
      if (error instanceof TonoApiError && error.code === "signed_out") {
        // The server will not accept this session even after a refresh.
        logger.warn("[account] session rejected, signing out locally");
        await getSupabase().auth.signOut({ scope: "local" }).catch(() => undefined);
      } else {
        logger.info(`[account] could not refresh — ${(error as Error).message}`);
      }
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

// Phones that already had a key before Tono AI existed would otherwise be moved
// to it silently, which would leave their key unused. Once, they keep what
// they had.
async function keepExistingKeyProvider(): Promise<void> {
  if (hasChosenCloudProvider()) return;
  for (const id of PROVIDER_ORDER) {
    if (await getProviderKey(id).catch(() => null)) {
      setCloudProvider(id);
      return;
    }
  }
}

let started = false;

// Called once at launch.
export async function initAccount(): Promise<void> {
  if (started) return;
  started = true;
  await keepExistingKeyProvider();

  onAllowance((allowance) => {
    if (state.status === "signedIn") commit(withAllowance(state, allowance));
  });

  const auth = getSupabase().auth;
  // Never call back into the auth client inside this listener (it holds a lock);
  // the refresh is queued instead.
  auth.onAuthStateChange((event, session) => {
    applySession(session);
    if (session && (event === "SIGNED_IN" || event === "USER_UPDATED")) setTimeout(() => void refreshAccount(), 0);
  });

  const { data } = await auth.getSession();
  applySession(data.session);
  void refreshAccount();

  let lastRefresh = Date.now();
  AppState.addEventListener("change", (appState) => {
    // Coming back to the app is when the numbers are most likely stale.
    if (appState === "active" && Date.now() - lastRefresh > 60_000) {
      lastRefresh = Date.now();
      void refreshAccount();
    }
  });
}

// Forgets the signed-in person on this phone (after sign-out or deletion).
export function clearAccount(): void {
  commit(SIGNED_OUT);
}
