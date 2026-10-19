import { ListGroup, ListRow } from "../common/ListRow";
import { PERMISSION_INFO, stateLabel, type PermissionKey, type PermissionLine } from "../../domain/permissions";
import { useTheme } from "../../theme/ThemeProvider";

// One row for each permission: what it's for, and whether it's on. Tapping
// asks while the phone will, and opens the phone's Settings once it won't.
export function PermissionRows({ lines, onPress, title }: { lines: PermissionLine[]; onPress: (key: PermissionKey) => void; title?: string }) {
  const { colors } = useTheme();
  return (
    <ListGroup title={title}>
      {lines.map((line) => {
        const info = PERMISSION_INFO[line.key];
        return (
          <ListRow
            key={line.key}
            icon={info.icon}
            iconColor={line.state === "granted" ? undefined : colors.warning}
            title={info.title}
            subtitle={line.state === "blocked" ? `${info.why}. Tap to turn it on in Settings.` : info.why}
            value={stateLabel(line.state)}
            onPress={() => onPress(line.key)}
            accessibilityLabel={`${info.title}, ${stateLabel(line.state)}`}
          />
        );
      })}
    </ListGroup>
  );
}
