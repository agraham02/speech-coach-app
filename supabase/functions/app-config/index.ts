import { handler, HttpError, json } from "../_shared/http.ts";
import { loadConfig } from "../_shared/ledger.ts";

// The switches the app needs before there is any account: whether Tono Plus is
// on sale (the launch switch), whether minors may use Tono AI, the mode and
// the kill switch. No sign-in and nothing about the person: the free path never
// makes an account, but it still has to know whether to show Plus.
Deno.serve(
  handler(async (req) => {
    if (req.method !== "GET" && req.method !== "POST") throw new HttpError(405, "method_not_allowed");
    const config = await loadConfig();
    return json({
      mode: config.mode,
      killSwitch: config.killSwitch,
      plusPurchasable: config.plusPurchasable,
      minorsMayUseAi: config.minorsMayUseAi,
      freeMonthlyJudgedTakes: config.limits.freeMonthlyJudgedTakes,
    });
  }),
);
