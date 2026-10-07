import { useEffect } from "react";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { LoadingSpinner } from "../components/common/LoadingSpinner";

type Props = NativeStackScreenProps<RootStackParamList, "Processing">;

// Analysis progress now lives on the Result screen itself (each step fills
// in live there), so this route only forwards older links to it.
export function ProcessingScreen({ route, navigation }: Props) {
  useEffect(() => {
    navigation.replace("Result", { sessionId: route.params.sessionId });
  }, [navigation, route.params.sessionId]);

  return (
    <ScreenContainer>
      <LoadingSpinner />
    </ScreenContainer>
  );
}
