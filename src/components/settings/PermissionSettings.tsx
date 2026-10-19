import { Txt } from "../common/Txt";
import { PermissionRows } from "./PermissionRows";
import { usePermissions } from "../../hooks/usePermissions";
import { needsAttention } from "../../domain/permissions";
import { makeStyles } from "../../theme/ThemeProvider";

// Settings → Permissions: what Tono can use, and a way back if one was turned
// off by accident.
export function PermissionSettings() {
  const styles = useStyles();
  const { lines, act } = usePermissions();
  const off = lines ? needsAttention(lines).length : 0;
  return (
    <>
      {lines ? <PermissionRows lines={lines} onPress={act} /> : null}
      <Txt variant="footnote" tone="secondary" style={styles.note}>
        {off
          ? "Recording needs the camera and microphone. Anything that's off can be turned on in your phone's Settings, and this list updates when you come back."
          : "Everything is on. To turn one off, use your phone's Settings."}
      </Txt>
    </>
  );
}

const useStyles = makeStyles((t) => ({
  note: { paddingHorizontal: 4, marginTop: -t.space.sm },
}));
