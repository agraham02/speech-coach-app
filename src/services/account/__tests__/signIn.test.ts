const mockSignInAsync = jest.fn();
const mockDigest = jest.fn();
const mockOpenAuthSession = jest.fn();
const mockSignInWithIdToken = jest.fn();
const mockSignInWithOAuth = jest.fn();
const mockExchange = jest.fn();
const mockSignOut = jest.fn();
const mockAppleToken = jest.fn();
const mockDelete = jest.fn();
const mockClear = jest.fn();
const mockRefresh = jest.fn();
const mockSetConsent = jest.fn();
const mockLinkIdentity = jest.fn();
let mockAnonymous = false;

jest.mock("expo-apple-authentication", () => ({
  signInAsync: (...a: unknown[]) => mockSignInAsync(...a),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));
jest.mock("expo-crypto", () => ({
  getRandomBytes: () => new Uint8Array(16).fill(171),
  digestStringAsync: (...a: unknown[]) => mockDigest(...a),
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
}));
jest.mock("expo-web-browser", () => ({ openAuthSessionAsync: (...a: unknown[]) => mockOpenAuthSession(...a) }));
jest.mock("../supabaseClient", () => ({
  getSupabase: () => ({
    auth: {
      signInWithIdToken: (...a: unknown[]) => mockSignInWithIdToken(...a),
      signInWithOAuth: (...a: unknown[]) => mockSignInWithOAuth(...a),
      exchangeCodeForSession: (...a: unknown[]) => mockExchange(...a),
      signOut: (...a: unknown[]) => mockSignOut(...a),
      linkIdentity: (...a: unknown[]) => mockLinkIdentity(...a),
    },
  }),
}));
jest.mock("../accountStore", () => ({ clearAccount: () => mockClear(), refreshAccount: () => mockRefresh(), getAccount: () => ({ anonymous: mockAnonymous }) }));
jest.mock("../../tono/tonoApi", () => ({
  tonoAppleToken: (...a: unknown[]) => mockAppleToken(...a),
  tonoDeleteAccount: () => mockDelete(),
}));
jest.mock("../../../utils/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../prefs/prefsStore", () => ({ setTonoConsent: (...a: unknown[]) => mockSetConsent(...a) }));

import { AUTH_REDIRECT, deleteAccount, signInWithApple, signInWithGoogle, signOut, SignInError } from "../signIn";

const NONCE = "ab".repeat(16);

beforeEach(() => {
  jest.resetAllMocks();
  mockAnonymous = false;
  mockDigest.mockResolvedValue("hashed-nonce");
  mockSignInWithIdToken.mockResolvedValue({ error: null });
  mockAppleToken.mockResolvedValue({ ok: true });
  mockSignOut.mockResolvedValue({ error: null });
  mockRefresh.mockResolvedValue(undefined);
});

describe("signInWithApple", () => {
  it("gives Apple the hashed nonce and Supabase the plain one", async () => {
    mockSignInAsync.mockResolvedValue({ identityToken: "id-token", authorizationCode: "auth-code-123" });
    await expect(signInWithApple()).resolves.toBe("signedIn");
    expect(mockDigest).toHaveBeenCalledWith("SHA-256", NONCE);
    expect(mockSignInAsync.mock.calls[0][0].nonce).toBe("hashed-nonce");
    expect(mockSignInWithIdToken).toHaveBeenCalledWith({ provider: "apple", token: "id-token", nonce: NONCE });
    expect(mockAppleToken).toHaveBeenCalledWith("auth-code-123");
  });

  it("still signs in when the Apple grant cannot be stored", async () => {
    mockSignInAsync.mockResolvedValue({ identityToken: "t", authorizationCode: "c" });
    mockAppleToken.mockRejectedValue(new Error("offline"));
    await expect(signInWithApple()).resolves.toBe("signedIn");
  });

  it("treats closing the Apple sheet as a cancel, not an error", async () => {
    mockSignInAsync.mockRejectedValue({ code: "ERR_REQUEST_CANCELED" });
    await expect(signInWithApple()).resolves.toBe("cancelled");
    expect(mockSignInWithIdToken).not.toHaveBeenCalled();
  });

  it("explains other failures plainly", async () => {
    mockSignInAsync.mockRejectedValue(new Error("boom"));
    await expect(signInWithApple()).rejects.toBeInstanceOf(SignInError);
    mockSignInAsync.mockResolvedValue({ identityToken: null });
    await expect(signInWithApple()).rejects.toThrow(/sign-in token/);
    mockSignInAsync.mockResolvedValue({ identityToken: "t" });
    mockSignInWithIdToken.mockResolvedValue({ error: { message: "bad nonce" } });
    await expect(signInWithApple()).rejects.toThrow(/couldn't verify/);
  });
});

describe("linking the behind-the-scenes account", () => {
  it("links Apple to the anonymous account instead of making a new one", async () => {
    mockAnonymous = true;
    mockSignInAsync.mockResolvedValue({ identityToken: "id-token", authorizationCode: "c" });
    mockLinkIdentity.mockResolvedValue({ error: null });
    await expect(signInWithApple()).resolves.toBe("signedIn");
    expect(mockLinkIdentity).toHaveBeenCalledWith({ provider: "apple", token: "id-token", nonce: NONCE });
    expect(mockSignInWithIdToken).not.toHaveBeenCalled();
  });

  it("switches to the existing account when that Apple ID already has one", async () => {
    mockAnonymous = true;
    mockSignInAsync.mockResolvedValue({ identityToken: "id-token", authorizationCode: "c" });
    mockLinkIdentity.mockResolvedValue({ error: { code: "identity_already_exists", message: "Identity is already linked" } });
    await expect(signInWithApple()).resolves.toBe("signedIn");
    expect(mockSignInWithIdToken).toHaveBeenCalledWith({ provider: "apple", token: "id-token", nonce: NONCE });
  });

  it("links Google through the browser sheet too", async () => {
    mockAnonymous = true;
    mockLinkIdentity.mockResolvedValue({ data: { url: "https://supabase.example/link" }, error: null });
    mockOpenAuthSession.mockResolvedValue({ type: "success", url: `${AUTH_REDIRECT}?code=abc` });
    mockExchange.mockResolvedValue({ error: null });
    await expect(signInWithGoogle()).resolves.toBe("signedIn");
    expect(mockLinkIdentity.mock.calls[0][0]).toMatchObject({ provider: "google" });
    expect(mockSignInWithOAuth).not.toHaveBeenCalled();
  });
});

describe("signInWithGoogle", () => {
  const start = { data: { url: "https://supabase.example/auth/v1/authorize?x=1" }, error: null };

  it("opens the browser sheet, then trades the code for a session", async () => {
    mockSignInWithOAuth.mockResolvedValue(start);
    mockOpenAuthSession.mockResolvedValue({ type: "success", url: `${AUTH_REDIRECT}?code=abc` });
    mockExchange.mockResolvedValue({ error: null });
    await expect(signInWithGoogle()).resolves.toBe("signedIn");
    expect(mockSignInWithOAuth.mock.calls[0][0]).toMatchObject({ provider: "google", options: { redirectTo: AUTH_REDIRECT, skipBrowserRedirect: true } });
    expect(mockOpenAuthSession).toHaveBeenCalledWith(start.data.url, AUTH_REDIRECT);
    expect(mockExchange).toHaveBeenCalledWith("abc");
  });

  it("is a cancel when the sheet is closed", async () => {
    mockSignInWithOAuth.mockResolvedValue(start);
    mockOpenAuthSession.mockResolvedValue({ type: "cancel" });
    await expect(signInWithGoogle()).resolves.toBe("cancelled");
    expect(mockExchange).not.toHaveBeenCalled();
  });

  it("fails clearly on an error or a missing code", async () => {
    mockSignInWithOAuth.mockResolvedValue(start);
    mockOpenAuthSession.mockResolvedValue({ type: "success", url: `${AUTH_REDIRECT}?error=access_denied` });
    await expect(signInWithGoogle()).rejects.toThrow(/didn't complete/);
    mockOpenAuthSession.mockResolvedValue({ type: "success", url: AUTH_REDIRECT });
    await expect(signInWithGoogle()).rejects.toThrow(/sign-in code/);
    mockOpenAuthSession.mockResolvedValue({ type: "success", url: `${AUTH_REDIRECT}?code=abc` });
    mockExchange.mockResolvedValue({ error: { message: "bad verifier" } });
    await expect(signInWithGoogle()).rejects.toThrow(/finish the Google/);
  });

  it("fails clearly when sign-in cannot start", async () => {
    mockSignInWithOAuth.mockResolvedValue({ data: null, error: { message: "nope" } });
    await expect(signInWithGoogle()).rejects.toBeInstanceOf(SignInError);
  });
});

describe("signOut and deleteAccount", () => {
  it("signs out locally and clears the account", async () => {
    await signOut();
    expect(mockSignOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mockClear).toHaveBeenCalled();
  });

  it("still clears the account if the local sign-out errors", async () => {
    mockSignOut.mockRejectedValue(new Error("x"));
    await signOut();
    expect(mockClear).toHaveBeenCalled();
  });

  it("deletes on the server first, then forgets the consent and the session", async () => {
    mockDelete.mockResolvedValue({ ok: true });
    await deleteAccount();
    expect(mockDelete).toHaveBeenCalled();
    expect(mockSetConsent).toHaveBeenCalledWith(false);
    expect(mockClear).toHaveBeenCalled();
  });

  it("keeps the account on this phone if the server could not delete it", async () => {
    mockDelete.mockRejectedValue(new Error("server down"));
    await expect(deleteAccount()).rejects.toThrow("server down");
    expect(mockClear).not.toHaveBeenCalled();
    expect(mockSetConsent).not.toHaveBeenCalled();
  });
});
