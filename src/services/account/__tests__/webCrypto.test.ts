const mockRandom = jest.fn();
const mockDigest = jest.fn();

jest.mock("expo-crypto", () => ({
  getRandomValues: (a: Uint8Array) => mockRandom(a),
  digest: (...a: unknown[]) => mockDigest(...a),
  CryptoDigestAlgorithm: { SHA1: "SHA-1", SHA256: "SHA-256", SHA384: "SHA-384", SHA512: "SHA-512" },
}));

import { installWebCrypto as install } from "../webCrypto";

const installWebCrypto = (target: object) => install(target as Parameters<typeof install>[0]);

beforeEach(() => jest.resetAllMocks());

type Target = { crypto?: { getRandomValues?: (a: ArrayBufferView) => ArrayBufferView; subtle?: { digest?: (a: string, d: BufferSource) => Promise<ArrayBuffer> } } };

describe("installWebCrypto", () => {
  it("adds secure random values and SHA-256 when the platform has none", async () => {
    const target: Target = {};
    installWebCrypto(target);
    const bytes = new Uint8Array(4);
    mockRandom.mockImplementation((a: Uint8Array) => a.fill(7));
    target.crypto!.getRandomValues!(bytes);
    expect(mockRandom).toHaveBeenCalledWith(bytes);
    expect(Array.from(bytes)).toEqual([7, 7, 7, 7]);

    const result = new ArrayBuffer(32);
    mockDigest.mockResolvedValue(result);
    const input = new TextEncoder().encode("verifier");
    await expect(target.crypto!.subtle!.digest!("SHA-256", input)).resolves.toBe(result);
    expect(mockDigest).toHaveBeenCalledWith("SHA-256", input);
  });

  it("accepts the algorithm in either form and refuses unknown ones", async () => {
    const target: Target = {};
    installWebCrypto(target);
    mockDigest.mockResolvedValue(new ArrayBuffer(0));
    await target.crypto!.subtle!.digest!({ name: "sha-512" } as unknown as string, new Uint8Array(1));
    expect(mockDigest).toHaveBeenCalledWith("SHA-512", expect.anything());
    expect(() => target.crypto!.subtle!.digest!("MD5", new Uint8Array(1))).toThrow(/Unsupported/);
  });

  it("leaves a platform's own WebCrypto alone", () => {
    const random = jest.fn();
    const digest = jest.fn();
    const target: Target = { crypto: { getRandomValues: random, subtle: { digest } } };
    installWebCrypto(target);
    expect(target.crypto!.getRandomValues).toBe(random);
    expect(target.crypto!.subtle!.digest).toBe(digest);
  });

  it("fills in only what is missing", () => {
    const random = jest.fn();
    const target: Target = { crypto: { getRandomValues: random } };
    installWebCrypto(target);
    expect(target.crypto!.getRandomValues).toBe(random);
    expect(typeof target.crypto!.subtle!.digest).toBe("function");
  });
});
