import { useSyncExternalStore } from "react";
import { SHOW_DEV_TOOLS } from "../../config/devTools";
import type { AccountSnapshot } from "../../domain/account";
import { mockSnapshot, parseMockConfig, type MockAccountConfig } from "../../domain/dev/mockAccount";
import { TonoApiError } from "../tono/tonoError";
import { getHelperJson, setHelperJson } from "./devHelperStore";

// The mock account (Dev, App tools, Mock account). While a mock is set, the
// app's account store hands out this snapshot instead of the server's, and
// every call to Tono's server is refused here before it leaves the phone: no
// `me`, no app-config, no account made, nothing generated. Persisted on the
// phone (in the helpers' own store, which Reset app keeps). In a production
// build SHOW_DEV_TOOLS is false and none of this is ever active.

const KEY = "mockAccount";

let loaded = false;
let config: MockAccountConfig | null = null;
let snapshot: AccountSnapshot | null = null;
const listeners = new Set<() => void>();

function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  if (!SHOW_DEV_TOOLS) return;
  config = parseMockConfig(getHelperJson<unknown>(KEY, null));
  snapshot = config ? mockSnapshot(config) : null;
}

export function mockAccountConfig(): MockAccountConfig | null {
  ensureLoaded();
  return config;
}

// The snapshot the app should use, or null when no mock is set. The same
// object until the choice changes (React subscribes by identity).
export function mockAccountSnapshot(): AccountSnapshot | null {
  ensureLoaded();
  return snapshot;
}

export const mockAccountActive = (): boolean => mockAccountSnapshot() !== null;

export function setMockAccount(next: MockAccountConfig | null): void {
  if (!SHOW_DEV_TOOLS) return;
  ensureLoaded();
  config = next;
  snapshot = next ? mockSnapshot(next) : null;
  setHelperJson(KEY, next);
  listeners.forEach((l) => l());
}

export function subscribeMockAccount(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useMockAccountConfig(): MockAccountConfig | null {
  return useSyncExternalStore(subscribeMockAccount, mockAccountConfig, mockAccountConfig);
}

// Whether Tono should be shown as for sale on this phone (the paywall and the
// "See Tono Plus" buttons), against the platform's real answer.
export function mockShowsPlusOffers(): boolean {
  return !!mockAccountConfig()?.showPlusOffers;
}

// The one gate in front of Tono's server (tonoApi.ts calls it before every
// request). With a mock set nothing leaves the phone: "server unreachable"
// fails like a dead connection (a TypeError, as fetch does), anything else
// fails with a plain Dev message.
export function refuseTonoCallWhenMocked(what: string): void {
  const c = mockAccountConfig();
  if (!SHOW_DEV_TOOLS || !c) return;
  if (c.serverUnreachable) throw new TypeError("Network request failed (Dev mock account: server unreachable)");
  throw new TonoApiError(503, "dev_mock", `Dev: the mock account is on, so ${what} was not sent to Tono's server. Clear it in Dev, App tools, Mock account.`);
}
