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
import { getAccountCacheRaw, setAccountCacheRaw } from "../prefs/prefsStore";
import { onAllowance, TonoApiError, tonoAppConfig, tonoMe } from "../tono/tonoApi";
import { getSupabase } from "./supabaseClient";

// The person's Tono account and what they have left, as one observable object
// (domain/account.ts). The copy kept between launches means the app knows the
// answer straight away; the server's answer follows and replaces it.
//
// The free path never makes an account. ensureAccount() makes an anonymous
// one, with no sign-in, the first time Tono AI or a purchase needs it.

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

// The server's switches as last heard without an account (app-config), so a
// person who never made one still sees Tono Plus when it is on sale.
let publicSwitches: Pick<AccountSnapshot, "mode" | "killSwitch" | "plusPurchasable" | "minorsMayUseAi"> | null = null;
const signedOut = (): AccountSnapshot => ({ ...SIGNED_OUT, ...(publicSwitches ?? {}) });

// A session appeared, changed or went away.
function applySession(session: Session | null): void {
  if (!session) {
    if (state.status !== "signedOut") commit(signedOut());
    return;
  }
  const user = session.user;
  const anonymous = user.is_anonymous === true;
  const provider = anonymous ? null : providerFromAuth(user.app_metadata?.provider ?? user.identities?.[0]?.provider);
  const email = anonymous ? null : (user.email ?? null);
  if (state.status === "signedIn" && state.userId === user.id) {
    if (state.provider !== provider || state.email !== email || state.anonymous !== anonymous) commit({ ...state, provider, email, anonymous });
    return;
  }
  // Someone new: nothing from the last account carries over.
  commit({ ...signedOut(), status: "signedIn", userId: user.id, anonymous, provider, email });
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
      commit({
        ...withAllowance(state, me.allowance),
        allowed: me.allowed,
        mode: me.mode,
        killSwitch: me.killSwitch,
        plusPurchasable: me.plusPurchasable === true,
        minorsMayUseAi: me.minorsMayUseAi === true,
      });
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

let creating: Promise<void> | null = null;

// Makes sure there is an account to count against, making an anonymous one
// when there's none: no sign-in, no registration, nothing shown. Supabase's
// anonymous sign-ins must be on (supabase/README.md). Throws when it can't be
// made (offline); callers treat that like any other offline failure.
export async function ensureAccount(): Promise<void> {
  if (state.status === "signedIn") return;
  if (creating) return creating;
  creating = (async () => {
    try {
      const { data, error } = await getSupabase().auth.signInAnonymously();
      if (error || !data.session) throw new Error(error?.message ?? "No session");
      applySession(data.session);
      await refreshAccount();
    } finally {
      creating = null;
    }
  })();
  return creating;
}

// Asks the server for its switches without an account. Quiet when offline.
export async function refreshPublicConfig(): Promise<void> {
  try {
    const c = await tonoAppConfig();
    publicSwitches = { mode: c.mode, killSwitch: c.killSwitch, plusPurchasable: c.plusPurchasable, minorsMayUseAi: c.minorsMayUseAi };
    // A signed-in account hears the same switches from `me`.
    if (state.status !== "signedIn") commit({ ...state, ...publicSwitches });
  } catch (error) {
    logger.info(`[account] could not read the app config — ${(error as Error).message}`);
  }
}

let started = false;

// Called once at launch.
export async function initAccount(): Promise<void> {
  if (started) return;
  started = true;

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
  if (!data.session) void refreshPublicConfig();

  let lastRefresh = Date.now();
  AppState.addEventListener("change", (appState) => {
    // Coming back to the app is when the numbers are most likely stale.
    if (appState === "active" && Date.now() - lastRefresh > 60_000) {
      lastRefresh = Date.now();
      if (state.status === "signedIn") void refreshAccount();
      else void refreshPublicConfig();
    }
  });
}

// Forgets the account on this phone (after sign-out or deletion).
export function clearAccount(): void {
  commit(signedOut());
}
