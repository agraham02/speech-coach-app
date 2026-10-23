// Tono Plus as the paywall shows it: the two plans worked out from what the App
// Store offers, the renewal wording App Review requires next to a subscription
// button, and plain messages for a purchase that did not go through. Pure.

// The reviews a month Plus includes. The server's config is the authority
// (supabase/functions/_shared/config.ts); a test keeps this in step with it.
export const PLUS_MONTHLY_REVIEWS = 60;

// The entitlement id set up in RevenueCat; the server reads the same one.
export const PLUS_ENTITLEMENT_ID = "plus";

export const TERMS_URL = "https://www.ahmadgraham.me/tono/terms";
export const PRIVACY_URL = "https://www.ahmadgraham.me/tono/privacy";
export const MANAGE_SUBSCRIPTIONS_URL = "https://apps.apple.com/account/subscriptions";

// The part of a RevenueCat package this file reads. The real object has more.
export interface OfferedPackage {
  identifier: string;
  packageType: string;
  product: { price: number; priceString: string; pricePerMonthString: string | null };
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
}

const TYPES: Record<string, "annual" | "monthly"> = { ANNUAL: "annual", MONTHLY: "monthly" };

// The yearly plan first (it is the better value), then the monthly one.
// Anything else in the offering (weekly, lifetime) is not sold here.
export function plansFromPackages(packages: OfferedPackage[]): PlusPlan[] {
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
    });
  }
  if (monthly) {
    plans.push({ id: "monthly", packageId: monthly.identifier, title: "Monthly", price: monthly.product.priceString, period: "month", perMonth: null, savePercent: null });
  }
  return plans;
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
export function renewalNotice(plan: PlusPlan): string {
  return (
    `Tono Plus, ${plan.title.toLowerCase()}: ${plan.price} per ${plan.period}. Payment is charged to your Apple ID when you confirm. ` +
    `It renews automatically for the same length at the current price unless you cancel at least 24 hours before the period ends. ` +
    `Manage or cancel in iOS Settings, under your name, then Subscriptions.`
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
        return "That purchase belongs to another Tono account. Sign in with the account you bought it with.";
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
