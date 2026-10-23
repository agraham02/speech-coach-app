import { parseAuthCallback } from "../oauthCallback";

describe("parseAuthCallback", () => {
  it("reads the code from the query", () => {
    expect(parseAuthCallback("tono://auth/callback?code=abc123")).toEqual({ code: "abc123", error: null });
  });

  it("reads an error and prefers its description", () => {
    expect(parseAuthCallback("tono://auth/callback?error=access_denied&error_description=The+user+said+no")).toEqual({
      code: null,
      error: "The user said no",
    });
    expect(parseAuthCallback("tono://auth/callback?error=access_denied").error).toBe("access_denied");
  });

  it("finds an error in the fragment too, and the query wins", () => {
    expect(parseAuthCallback("tono://auth/callback#error=server_error&error_description=Oops").error).toBe("Oops");
    expect(parseAuthCallback("tono://auth/callback?error=a#error=b").error).toBe("a");
  });

  it("decodes escapes and survives junk", () => {
    expect(parseAuthCallback("tono://auth/callback?code=a%2Fb%3D").code).toBe("a/b=");
    expect(parseAuthCallback("tono://auth/callback?code=%E0%A4%A").code).toBe("%E0%A4%A");
    expect(parseAuthCallback("tono://auth/callback")).toEqual({ code: null, error: null });
    expect(parseAuthCallback("")).toEqual({ code: null, error: null });
  });

  it("takes the first of a repeated key", () => {
    expect(parseAuthCallback("tono://x?code=one&code=two").code).toBe("one");
  });
});
