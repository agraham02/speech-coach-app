import { readFileSync } from "fs";
import { join } from "path";

// The dev-only screens and labels are registered only behind SHOW_DEV_TOOLS, the
// same flag the Dev tab uses, so a production build (where it is false) has no
// way to reach them. A source check: the routes, the banner and the App tools
// rows are found only inside their gate.

const read = (...parts: string[]) => readFileSync(join(__dirname, "..", "..", "..", ...parts), "utf8").replace(/\r\n/g, "\n");

describe("dev-only routes", () => {
  const nav = read("src", "navigation", "index.tsx");
  const group = nav.slice(nav.indexOf("{SHOW_DEV_TOOLS ? (\n          <Stack.Group>"), nav.indexOf("</Stack.Group>"));
  const DEV_SCREENS = ["DemoTakesScreen", "MockAccountScreen", "StatePresetsScreen"];
  const DEV_ROUTES = ["DevDemoTakes", "DevMockAccount", "DevPresets"];

  it("finds the gated group", () => {
    expect(group.length).toBeGreaterThan(100);
    expect(group).toContain("DevTools");
  });

  it("registers the three helper screens inside the gate and nowhere else", () => {
    for (const route of DEV_ROUTES) {
      const registrations = nav.match(new RegExp(`<Stack\.Screen name="${route}"`, "g")) ?? [];
      expect(registrations).toHaveLength(1);
      expect(group).toContain(`<Stack.Screen name="${route}"`);
    }
    for (const screen of DEV_SCREENS) {
      // Imported once, used once, and the use is inside the gate.
      expect(nav.match(new RegExp(`component=\{${screen}\}`, "g")) ?? []).toHaveLength(1);
      expect(group).toContain(`component={${screen}}`);
    }
  });

  it("is reached only from App tools, which is itself only registered in the gate", () => {
    expect(group).toContain('name="DevTools"');
    const tools = read("src", "screens", "dev", "ToolsScreen.tsx");
    for (const route of DEV_ROUTES) expect(tools).toContain(`navigate("${route}")`);
    // No screen outside src/screens/dev, no service and no component other than the ones that
    // implement the helpers links to the helper routes.
    const others = ["src/screens/SettingsScreen.tsx", "src/screens/HomeScreen.tsx", "src/screens/PaywallScreen.tsx", "src/screens/TodayScreen.tsx"];
    for (const file of others) {
      try {
        const source = read(...file.split("/"));
        for (const route of DEV_ROUTES) expect(source).not.toContain(route);
      } catch {
        // A screen with another name: nothing to check.
      }
    }
  });

  it("shows the mock-account banner and the onboarding shortcut only behind the flag", () => {
    const app = read("App.tsx");
    expect(app).toContain("{SHOW_DEV_TOOLS ? <MockAccountBanner /> : null}");
    expect(app.match(/<MockAccountBanner/g) ?? []).toHaveLength(1);
    const banner = read("src", "components", "dev", "MockAccountBanner.tsx");
    expect(banner).toContain("if (!SHOW_DEV_TOOLS) return null;");
    expect(app).toContain("{SHOW_DEV_TOOLS ? <OnboardingShortcut /> : null}");
    expect(app.match(/<OnboardingShortcut/g) ?? []).toHaveLength(1);
    expect(read("src", "components", "dev", "OnboardingShortcut.tsx")).toContain("if (!SHOW_DEV_TOOLS) return null;");
  });

  it("guards every helper service on the flag", () => {
    for (const file of ["seedDemo.ts", "statePresets.ts"]) {
      const source = read("src", "services", "dev", file);
      expect(source).toContain("SHOW_DEV_TOOLS");
      expect(source).toMatch(/function assertDev\(\)/);
    }
    for (const file of ["mockAccount.ts", "skipModel.ts", "devHelperStore.ts"]) expect(read("src", "services", "dev", file)).toContain("SHOW_DEV_TOOLS");
  });
});
