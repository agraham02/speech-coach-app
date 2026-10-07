import { createContext, useContext, useMemo, type ReactNode } from "react";
import { StyleSheet } from "react-native";
import { launchScheme } from "./theme";
import { darkPalette, lightPalette, radius, space, typeScale, type Palette } from "./tokens";

export type SchemeName = "light" | "dark";

export interface Theme {
  scheme: SchemeName;
  colors: Palette;
  type: typeof typeScale;
  space: typeof space;
  radius: typeof radius;
}

// Follows the system appearance as of launch, matching the static legacy
// `colors` (theme.ts) so every screen agrees. A change applies next launch.

function buildTheme(scheme: SchemeName): Theme {
  return { scheme, colors: scheme === "dark" ? darkPalette : lightPalette, type: typeScale, space, radius };
}

const DARK_THEME = buildTheme("dark");
const LIGHT_THEME = buildTheme("light");
const ThemeContext = createContext<Theme>(DARK_THEME);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = launchScheme === "dark" ? DARK_THEME : LIGHT_THEME;
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

// Theme-aware StyleSheet: define styles once at module scope as a function
// of the theme, call the returned hook inside the component.
//   const useStyles = makeStyles((t) => ({ title: { color: t.colors.textPrimary } }));
//   const styles = useStyles();
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(factory: (theme: Theme) => T): () => T {
  const cache = new Map<SchemeName, T>();
  return function useStyles() {
    const theme = useTheme();
    return useMemo(() => {
      const hit = cache.get(theme.scheme);
      if (hit) return hit;
      const created = StyleSheet.create(factory(theme));
      cache.set(theme.scheme, created);
      return created;
    }, [theme]);
  };
}
