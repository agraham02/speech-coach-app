// Where Tono AI lives. Public values only: the publishable key is built to be
// shipped inside an app (row level security and the edge functions decide what
// it can do), so it is safe to commit, and an over-the-air update cannot lose
// it the way a build-time environment variable could.
//
// Secrets (the database password, the Supabase secret key, the Gemini key,
// the Apple signing key) never go in this file. They live in Supabase's
// function secrets.

export const SUPABASE_URL = "https://dtqbsdhjwmftwozstpwk.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_6J19o2Mo2WYWn4WLaf5nuQ_TXS8o4wx";

// RevenueCat's public iOS SDK key (it starts with "appl_"; RevenueCat →
// Project settings → API keys). Public by design, like the publishable key
// above. The secret key never goes in the app: it is a function secret.
// Empty means this build takes no purchases at all. Whether Plus is actually for
// sale is the server's call (config.plusPurchasable, returned by `me`), so
// launching needs no app update: supabase/README.md, "The launch switch".
export const REVENUECAT_IOS_KEY = "appl_QDSkKCBRvZbobaQfiDhdBjsWPLW";
