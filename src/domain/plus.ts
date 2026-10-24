// Tono Plus as the paywall shows it: the two plans worked out from what the App
// Store offers, the renewal wording App Review requires next to a subscription
// button, and plain messages for a purchase that did not go through. Pure.

// The judged takes a month Plus includes, and the trial's length and count.
// The server's config is the authority (supabase/functions/_shared/config.ts);
// a test keeps these in step with it. The trial itself is an App Store
// introductory offer on both plans, so its length is also set in App Store
// Connect: the paywall reads the real length from the store.
export const PLUS_MONTHLY_JUDGED_TAKES = 60;
export const TRIAL_DAYS = 14;
export const TRIAL_JUDGED_TAKES = 20;

// The entitlement id set up in RevenueCat; the server reads the same one.
export const PLUS_ENTITLEMENT_ID = "plus";

export const TERMS_URL = "https://www.ahmadgraham.me/tono/terms";
export const PRIVACY_URL = "https://www.ahmadgraham.me/tono/privacy";
export const MANAGE_SUBSCRIPTIONS_URL = "https://apps.apple.com/account/subscriptions";

// The part of a RevenueCat package this file reads. The real object has more.
export interface OfferedIntroPrice {
  price: number;
  periodUnit: string;
  periodNumberOfUnits: number;
  cycles: number;
}

export interface OfferedPackage {
  identifier: string;
  packageType: string;
  product: { identifier: string; price: number; priceString: string; pricePerMonthString: string | null; introPrice?: OfferedIntroPrice | null };
}

export interface PlusPlan {
  id: "annual" | "monthly";
  // The RevenueCat package to buy.
  packageId: string;
  title: string;
  // "$49.99", as the store formats it for this person.
  price: string;
  // "year" or "month".
  period: "year" | "month";
  // What it comes to a month, for the yearly plan ("$4.17").
  perMonth: string | null;
  // How much cheaper a month is on the yearly plan, as a whole percent.
  savePercent: number | null;
  productId: string;
  // Days free before the first payment, when the App Store says this person
  // can still have the trial. Null: no trial (used before, or none offered).
  trialDays: number | null;
}

const UNIT_DAYS: Record<string, number> = { DAY: 1, WEEK: 7, MONTH: 30, YEAR: 365 };

// The free part of an introductory offer, in days. A paid intro price is not
// a free trial and isn't sold here.
export function freeTrialDays(intro: OfferedIntroPrice | null | undefined): number | null {
  if (!intro || intro.price !== 0) return null;
  const unit = UNIT_DAYS[intro.periodUnit.toUpperCase()];
  if (!unit) return null;
  const days = unit * Math.max(1, intro.periodNumberOfUnits) * Math.max(1, intro.cycles);
  return days > 0 ? days : null;
}

const TYPES: Record<string, "annual" | "monthly"> = { ANNUAL: "annual", MONTHLY: "monthly" };

// The yearly plan first (it is the better value), then the monthly one.
// Anything else in the offering (weekly, lifetime) is not sold here.
// `trialEligible`: the products the App Store says this person may still
// start a trial on. An unknown answer counts as no, as RevenueCat advises, so
// the paywall never promises a trial the store won't give.
export function plansFromPackages(packages: OfferedPackage[], trialEligible: ReadonlySet<string> = new Set()): PlusPlan[] {
  const find = (id: "annual" | "monthly") => packages.find((p) => TYPES[p.packageType] === id);
  const annual = find("annual");
  const monthly = find("monthly");
  const savePercent =
    annual && monthly && monthly.product.price > 0
      ? Math.round((1 - annual.product.price / (monthly.product.price * 12)) * 100)
      : null;
  const plans: PlusPlan[] = [];
  if (annual) {
    plans.push({
      id: "annual",
      packageId: annual.identifier,
      title: "Yearly",
      price: annual.product.priceString,
      period: "year",
      perMonth: annual.product.pricePerMonthString,
      savePercent: savePercent !== null && savePercent > 0 ? savePercent : null,
      productId: annual.product.identifier,
      trialDays: trialEligible.has(annual.product.identifier) ? freeTrialDays(annual.product.introPrice) : null,
    });
  }
  if (monthly) {
    plans.push({
      id: "monthly",
      packageId: monthly.identifier,
      title: "Monthly",
      price: monthly.product.priceString,
      period: "month",
      perMonth: null,
      savePercent: null,
      productId: monthly.product.identifier,
      trialDays: trialEligible.has(monthly.product.identifier) ? freeTrialDays(monthly.product.introPrice) : null,
    });
  }
  return plans;
}

// "14 days free, then $49.99 a year", or the plain price without a trial.
export function trialLine(plan: PlusPlan): string {
  return plan.trialDays ? `${plan.trialDays} days free, then ${plan.price} a ${plan.period}` : `${plan.price} a ${plan.period}`;
}

// The subscribe button.
export function buyLabel(plan: PlusPlan): string {
  return plan.trialDays ? `Start ${plan.trialDays}-day free trial` : `Subscribe for ${plan.price} / ${plan.period}`;
}

export function planPriceLine(plan: PlusPlan): string {
  return `${plan.price} / ${plan.period}`;
}

export function planDetail(plan: PlusPlan): string {
  if (plan.id === "annual") {
    const parts = [plan.perMonth ? `${plan.perMonth} a month` : null, plan.savePercent ? `save ${plan.savePercent}%` : null].filter(Boolean);
    return parts.join(" · ");
  }
  return "Cancel any time";
}

// Shown under the subscribe button: App Review 3.1.2 wants the length, the
// price, that it renews by itself, and how to stop it, right where you buy.
// With a trial it must also say how long the trial is, what it costs after,
// and when the first payment is taken.
export function renewalNotice(plan: PlusPlan): string {
  const manage = "Manage or cancel in iOS Settings, under your name, then Subscriptions.";
  if (plan.trialDays) {
    return (
      `Free for ${plan.trialDays} days, then Tono Plus, ${plan.title.toLowerCase()}: ${plan.price} per ${plan.period}. ` +
      `Your Apple ID is charged when the trial ends unless you cancel at least 24 hours before it ends. ` +
      `After that it renews automatically for the same length at the current price unless you cancel at least 24 hours before the period ends. ${manage}`
    );
  }
  return (
    `Tono Plus, ${plan.title.toLowerCase()}: ${plan.price} per ${plan.period}. Payment is charged to your Apple ID when you confirm. ` +
    `It renews automatically for the same length at the current price unless you cancel at least 24 hours before the period ends. ${manage}`
  );
}

// What a purchase or restore that failed means for the person. A cancelled
// purchase is not a failure, so it has no message.
export type PurchaseFailure = { kind: "cancelled" } | { kind: "failed"; message: string };

export function purchaseFailure(error: unknown): PurchaseFailure {
  const e = (error ?? {}) as { userCancelled?: boolean | null; code?: string | number };
  if (e.userCancelled === true || String(e.code) === "1") return { kind: "cancelled" };
  const message = (() => {
    switch (String(e.code)) {
      case "10":
      case "35":
        return "Couldn't reach the App Store. Check your connection and try again.";
      case "3":
        return "Purchases are turned off on this phone (Screen Time or a restriction).";
      case "5":
        return "That plan isn't available right now. Try again in a little while.";
      case "6":
        return "You already have Tono Plus. Tap Restore purchases to bring it back.";
      case "7":
      case "13":
        return "That purchase belongs to another Tono account. Sign in with Apple or Google in Settings with the account you bought it on.";
      case "15":
        return "A purchase is already in progress. Give it a moment.";
      case "20":
        return "Your purchase is waiting for approval. Tono Plus switches on when it comes through.";
      default:
        return "The purchase didn't go through. You haven't been charged. Try again.";
    }
  })();
  return { kind: "failed", message };
}
