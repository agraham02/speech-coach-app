import { createContext, useContext, useMemo, type ReactNode } from "react";
import { StyleSheet, useColorScheme } from "react-native";
import { buildColors, type Colors, type SchemeName } from "./theme";
import { font, layout, radius, shadows, space, typeScale } from "./tokens";

export type { SchemeName } from "./theme";

export interface Theme {
  scheme: SchemeName;
  colors: Colors;
  type: typeof typeScale;
  space: typeof space;
  radius: typeof radius;
  layout: typeof layout;
  shadow: ReturnType<typeof shadows>;
  // The sans family for a weight — styles use this instead of fontWeight.
  font: typeof font;
}

// Follows the system appearance live: useColorScheme() re-renders the tree
// when it changes, and makeStyles hands each scheme its own StyleSheet.

function buildTheme(scheme: SchemeName): Theme {
  return { scheme, colors: buildColors(scheme), type: typeScale, space, radius, layout, shadow: shadows(scheme), font };
}

const DARK_THEME = buildTheme("dark");
const LIGHT_THEME = buildTheme("light");
const ThemeContext = createContext<Theme>(DARK_THEME);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useColorScheme() === "light" ? LIGHT_THEME : DARK_THEME;
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

// Theme-aware StyleSheet: define styles once at module scope as a function
// of the theme, call the returned hook inside the component.
//   const useStyles = makeStyles(({ colors }) => ({ title: { color: colors.textPrimary } }));
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
