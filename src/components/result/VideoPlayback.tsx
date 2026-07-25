import { StyleSheet } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { radii } from "../../theme/theme";

// Mounted only while the "Watch recording" section is expanded (see
// ResultScreen) — expo-video's player is cleaned up automatically on unmount,
// so collapsing this fully releases it rather than just hiding it.
export function VideoPlayback({ videoUri }: { videoUri: string }) {
  const player = useVideoPlayer(videoUri, (p) => {
    p.loop = false;
  });

  return (
    <VideoView
      style={styles.video}
      player={player}
      nativeControls
      contentFit="contain"
    />
  );
}

const styles = StyleSheet.create({
  video: {
    width: "100%",
    height: 360,
    borderRadius: radii.lg,
    backgroundColor: "black",
  },
});
