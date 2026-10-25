import { Platform } from "react-native";
import type { PurchasesPackage } from "react-native-purchases";
import { REVENUECAT_IOS_KEY } from "../../config/backend";
import { plansFromPackages, purchaseFailure, type PlusPlan } from "../../domain/plus";
import { logger } from "../../utils/logger";
import { ensureAccount, getAccount, refreshAccount, subscribeAccount } from "../account/accountStore";
import { mockAccountConfig, mockShowsPlusOffers } from "../dev/mockAccount";
import { mockPlans } from "../../domain/dev/mockAccount";

// Tono Plus purchases through RevenueCat, on iPhone. RevenueCat talks to the
// App Store; the server learns the result from RevenueCat (webhook and the
// `me` refresh) and is the only thing that decides what Plus allows. This file
// never decides the plan: it buys, then asks the server what the person has.
//
// No sign-in is needed to buy: the purchase belongs to the anonymous Tono
// account made behind the scenes (its id is the RevenueCat app user id), so
// App Review never sees registration before a purchase (guideline 5.1.1(v)).
// The 14-day trial is Apple's introductory offer on both plans; Apple allows
// one per Apple ID per subscription group, so a new Tono account or a
// reinstall doesn't bring a second trial.

// The SDK's native half only exists in builds made after it was added, so it
// is loaded when first needed rather than when the app starts.
type Sdk = typeof import("react-native-purchases");
let sdk: Sdk | null = null;
function purchases(): Sdk["default"] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  sdk ??= require("react-native-purchases") as Sdk;
  return sdk.default;
}

// This build can take purchases at all: iPhone, with RevenueCat's key in it.
export const purchasesConfigurable = (): boolean => Platform.OS === "ios" && REVENUECAT_IOS_KEY.length > 0;

// Whether to show Tono Plus: the build can take purchases AND the server has it
// on sale (its launch switch). Someone who already has Plus keeps Manage and
// Restore whatever the switch says.
export const purchasesEnabled = (): boolean => {
  // Dev builds: the mock account can show Plus as for sale on a phone that
  // cannot sell it (the paywall and its buttons), without any purchase code.
  if (!purchasesConfigurable() && !mockShowsPlusOffers()) return false;
  const account = getAccount();
  return account.plusPurchasable || account.allowance?.plan === "plus" || account.allowance?.plan === "trial";
};

let configured = false;
// The RevenueCat user the SDK is currently logged in as (a Tono user id), so
// purchases always belong to the signed-in account.
let loggedInAs: string | null = null;
let login: Promise<void> = Promise.resolve();

function follow(): void {
  const userId = getAccount().status === "signedIn" ? getAccount().userId : null;
  if (userId === loggedInAs) return;
  loggedInAs = userId;
  login = login.then(async () => {
    try {
      if (userId) await purchases().logIn(userId);
      else if (!(await purchases().isAnonymous())) await purchases().logOut();
    } catch (error) {
      logger.warn(`[purchases] could not follow the account — ${(error as Error).message}`);
      // Try again at the next change rather than act on a wrong id.
      if (loggedInAs === userId) loggedInAs = null;
    }
  });
}

// Called once at launch, after the account is set up. A no-op in a build with no RevenueCat key.
export function initPurchases(): void {
  // Set up whenever this build can, so the server's launch switch needs no relaunch.
  if (configured || !purchasesConfigurable()) return;
  configured = true;
  try {
    const client = purchases();
    client.setLogLevel(__DEV__ ? sdk!.LOG_LEVEL.DEBUG : sdk!.LOG_LEVEL.WARN);
    client.configure({ apiKey: REVENUECAT_IOS_KEY });
  } catch (error) {
    logger.warn(`[purchases] could not start — ${(error as Error).message}`);
    configured = false;
    return;
  }
  follow();
  subscribeAccount(follow);
}

// The account the purchase belongs to (made anonymously when there's none),
// with RevenueCat logged in as it.
async function readyAccount(): Promise<void> {
  await ensureAccount();
  follow();
  await login;
}

export interface PlusOffer {
  plans: PlusPlan[];
  // The RevenueCat packages, to hand back to buy().
  packages: Map<string, PurchasesPackage>;
}

// The plans the App Store offers this person right now, priced for their store.
export async function loadPlusOffer(): Promise<PlusOffer> {
  if (mockShowsPlusOffers()) {
    // Dev: made-up prices through the real plan builder; nothing is bought.
    const plans = mockPlans(mockAccountConfig()?.offer ?? "trial");
    if (!plans) throw new Error("Dev mock: the prices fail to load.");
    return { plans, packages: new Map() };
  }
  if (!configured) throw new Error("Purchases aren't available.");
  const offerings = await purchases().getOfferings();
  const available = offerings.current?.availablePackages ?? [];
  const plans = plansFromPackages(available, await trialEligible(available.map((p) => p.product.identifier)));
  return { plans, packages: new Map(available.map((p) => [p.identifier, p])) };
}

// The products this Apple ID may still start the free trial on. Unknown or an
// error counts as no, so the paywall never promises a trial the store won't give.
async function trialEligible(productIds: string[]): Promise<Set<string>> {
  if (!productIds.length) return new Set();
  try {
    const eligibility = await purchases().checkTrialOrIntroductoryPriceEligibility(productIds);
    const eligible = sdk!.INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE;
    return new Set(productIds.filter((id) => eligibility[id]?.status === eligible));
  } catch (error) {
    logger.info(`[purchases] couldn't check trial eligibility — ${(error as Error).message}`);
    return new Set();
  }
}

export type PurchaseResult = { ok: true; plus: boolean } | { ok: false; cancelled: true } | { ok: false; cancelled: false; message: string };

// After the store says yes, the server may need a moment to hear it from
// RevenueCat, so the answer is asked for a few times.
async function waitForPlus(): Promise<boolean> {
  for (let attempt = 0; attempt < 4; attempt++) {
    await refreshAccount({ syncPurchases: true });
    const plan = getAccount().allowance?.plan;
    if (plan === "plus" || plan === "trial") return true;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  return false;
}

export async function buyPlus(plan: PlusPlan, offer: PlusOffer): Promise<PurchaseResult> {
  if (mockShowsPlusOffers()) return { ok: false, cancelled: false, message: "Dev: no purchase is made while the mock account shows Plus." };
  const pkg = offer.packages.get(plan.packageId);
  if (!pkg) return { ok: false, cancelled: false, message: "That plan isn't available right now. Try again in a little while." };
  try {
    await readyAccount();
  } catch {
    return { ok: false, cancelled: false, message: "Couldn't reach Tono. Check your connection and try again." };
  }
  try {
    await purchases().purchasePackage(pkg);
  } catch (error) {
    const failure = purchaseFailure(error);
    if (failure.kind === "cancelled") return { ok: false, cancelled: true };
    logger.warn(`[purchases] purchase failed — ${(error as Error).message}`);
    return { ok: false, cancelled: false, message: failure.message };
  }
  return { ok: true, plus: await waitForPlus() };
}

// Brings back a subscription bought earlier, on this or another phone.
export async function restorePlus(): Promise<PurchaseResult> {
  if (mockShowsPlusOffers()) return { ok: false, cancelled: false, message: "Dev: no purchase is restored while the mock account shows Plus." };
  try {
    await readyAccount();
  } catch {
    return { ok: false, cancelled: false, message: "Couldn't reach Tono. Check your connection and try again." };
  }
  try {
    await purchases().restorePurchases();
  } catch (error) {
    const failure = purchaseFailure(error);
    if (failure.kind === "cancelled") return { ok: false, cancelled: true };
    logger.warn(`[purchases] restore failed — ${(error as Error).message}`);
    return { ok: false, cancelled: false, message: failure.message };
  }
  await refreshAccount({ syncPurchases: true });
  const now = getAccount().allowance?.plan;
  return { ok: true, plus: now === "plus" || now === "trial" };
}
