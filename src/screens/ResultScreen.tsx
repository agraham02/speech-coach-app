import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { Card } from "../components/common/Card";
import { Badge } from "../components/common/Badge";
import { Banner } from "../components/common/Banner";
import { ScoreBar } from "../components/result/ScoreBar";
import { OverallScoreRing } from "../components/result/OverallScoreRing";
import { VideoPlayback } from "../components/result/VideoPlayback";
import { getSessionById } from "../services/db/sessionsRepo";
import { getScoresBySessionId } from "../services/db/scoresRepo";
import { getPrompt } from "../services/db/promptsRepo";
import type { Session, SessionScores } from "../domain/sessionTypes";
import { formatDuration } from "../utils/dateUtils";
import { colors, spacing, typography } from "../theme/theme";

type Props = NativeStackScreenProps<RootStackParamList, "Result">;

export function ResultScreen({ route, navigation }: Props) {
  const { sessionId } = route.params;
  const [session, setSession] = useState<Session | null>(null);
  const [scores, setScores] = useState<SessionScores | null>(null);
  const [showVerbatim, setShowVerbatim] = useState(false);
  const [showVideo, setShowVideo] = useState(false);

  useEffect(() => {
    getSessionById(sessionId).then(setSession);
    getScoresBySessionId(sessionId).then(setScores);
  }, [sessionId]);

  if (!session) {
    return (
      <ScreenContainer style={styles.centered}>
        <LoadingSpinner />
      </ScreenContainer>
    );
  }

  const prompt = getPrompt(session.promptId);

  return (
    <ScreenContainer style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Banner
          tone={session.notionSyncedAt ? "success" : "warning"}
          text={session.notionSyncedAt ? "Saved to Notion" : "Saved locally — not yet synced to Notion"}
        />

        {scores ? (
          <Card style={styles.overallCard}>
            <OverallScoreRing score={scores.overallScore} />
            <View style={styles.overallTextGroup}>
              <Text style={styles.sectionLabel}>OVERALL · {scores.archetypeDetected.toUpperCase()}</Text>
              <Text style={styles.archetypeFit}>{scores.archetypeFitForTopic}</Text>
            </View>
          </Card>
        ) : null}

        {prompt ? (
          <Card style={styles.promptCard}>
            <Badge label={prompt.category} />
            <Text style={styles.promptText}>{prompt.text}</Text>
          </Card>
        ) : null}

        <Pressable
          style={styles.verbatimToggle}
          onPress={() => setShowVideo((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={showVideo ? "Hide recording" : "Watch recording"}
        >
          <Ionicons name={showVideo ? "chevron-up" : "play-circle-outline"} size={18} color={colors.accent} />
          <Text style={styles.verbatimToggleText}>{showVideo ? "Hide recording" : "Watch recording"}</Text>
        </Pressable>
        {showVideo ? <VideoPlayback videoUri={session.videoPath} /> : null}

        {scores ? (
          <Card style={styles.coachingCard}>
            <Text style={styles.sectionLabel}>COACHING</Text>
            <Text style={styles.coachingSummary}>{scores.coachingSummary}</Text>
            <View style={styles.coachingRow}>
              <Ionicons name="thumbs-up-outline" size={16} color={colors.success} />
              <Text style={styles.coachingRowText}>
                <Text style={styles.coachingRowLabel}>Strength: </Text>
                {scores.topStrength}
              </Text>
            </View>
            <View style={styles.coachingRow}>
              <Ionicons name="build-outline" size={16} color={colors.warning} />
              <Text style={styles.coachingRowText}>
                <Text style={styles.coachingRowLabel}>Focus on: </Text>
                {scores.topFocusArea}
              </Text>
            </View>
            <View style={styles.drillBox}>
              <Text style={styles.drillLabel}>NEXT DRILL</Text>
              <Text style={styles.drillText}>{scores.recommendedDrill}</Text>
            </View>
          </Card>
        ) : null}

        {scores ? (
          <Card style={styles.scoresCard}>
            <Text style={styles.sectionLabel}>STRUCTURE</Text>
            <ScoreBar
              label={scores.structureUsed === "none detected" ? "No clear structure" : scores.structureUsed}
              score={scores.structureScore}
              notes={scores.structureNotes}
            />

            <Text style={[styles.sectionLabel, styles.sectionSpacer]}>DELIVERY</Text>
            <ScoreBar label="Rate" score={scores.rateScore} notes={scores.rateNotes} suffix={`${scores.rateWpmAvg} wpm`} />
            <ScoreBar label="Volume" score={scores.volumeScore} notes={scores.volumeNotes} />
            <ScoreBar label="Pitch & Melody" score={scores.pitchMelodyScore} notes={scores.pitchMelodyNotes} />
            <ScoreBar label="Tonality" score={scores.tonalityScore} notes={scores.tonalityNotes} />
            <ScoreBar label="Pausing" score={scores.pausingScore} notes={scores.pausingNotes} />

            <Text style={[styles.sectionLabel, styles.sectionSpacer]}>PRESENCE</Text>
            <ScoreBar label="Eye Contact" score={scores.eyeContactScore} />
            <ScoreBar label="Facial Expressiveness" score={scores.facialExpressivenessScore} />
            <Text style={styles.bodyLanguageNotes}>{scores.bodyLanguageNotes}</Text>

            <Text style={[styles.sectionLabel, styles.sectionSpacer]}>FACE-VOICE CONGRUENCE</Text>
            <ScoreBar label="Congruence" score={scores.faceVoiceCongruenceScore} />
          </Card>
        ) : null}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>YOUR RESPONSE</Text>
          <Text style={styles.duration}>{formatDuration(session.durationSeconds)}</Text>
        </View>
        <Card>
          <Text style={styles.transcript}>{session.transcriptClean}</Text>
        </Card>

        <Pressable style={styles.verbatimToggle} onPress={() => setShowVerbatim((v) => !v)}>
          <Text style={styles.verbatimToggleText}>
            {showVerbatim ? "Hide verbatim transcript" : "Show verbatim transcript"}
          </Text>
          <Ionicons
            name={showVerbatim ? "chevron-up" : "chevron-down"}
            size={16}
            color={colors.accent}
          />
        </Pressable>
        {showVerbatim ? (
          <Card style={styles.verbatimCard}>
            <Text style={styles.verbatim}>{session.transcriptVerbatim}</Text>
          </Card>
        ) : null}
      </ScrollView>

      <PrimaryButton label="Done" onPress={() => navigation.popToTop()} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  centered: { alignItems: "center", justifyContent: "center" },
  scrollContent: { gap: spacing.md, paddingBottom: spacing.lg },
  overallCard: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  overallTextGroup: { flex: 1, gap: spacing.xs },
  archetypeFit: { color: colors.textSecondary, fontSize: typography.caption, lineHeight: 17 },
  promptCard: { gap: spacing.sm },
  promptText: { color: colors.textSecondary, fontSize: typography.body, lineHeight: 21, fontStyle: "italic" },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.sm },
  sectionLabel: { color: colors.accent, fontSize: typography.caption - 1, fontWeight: "700", letterSpacing: 1 },
  sectionSpacer: { marginTop: spacing.sm },
  duration: { color: colors.textMuted, fontSize: typography.caption },
  transcript: { color: colors.textPrimary, fontSize: typography.bodyLarge, lineHeight: 25 },
  verbatimToggle: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, paddingVertical: spacing.sm },
  verbatimToggleText: { color: colors.accent, fontSize: typography.body, fontWeight: "600" },
  verbatimCard: { backgroundColor: colors.surfaceRaised },
  verbatim: { color: colors.textSecondary, fontSize: typography.body, lineHeight: 21, fontStyle: "italic" },
  coachingCard: { gap: spacing.sm },
  coachingSummary: { color: colors.textPrimary, fontSize: typography.body, lineHeight: 21 },
  coachingRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  coachingRowText: { flex: 1, color: colors.textSecondary, fontSize: typography.body, lineHeight: 20 },
  coachingRowLabel: { color: colors.textPrimary, fontWeight: "700" },
  drillBox: { backgroundColor: colors.accentMuted, borderRadius: 10, padding: spacing.md, gap: spacing.xs, marginTop: spacing.xs },
  drillLabel: { color: colors.accent, fontSize: typography.caption - 1, fontWeight: "700", letterSpacing: 1 },
  drillText: { color: colors.textPrimary, fontSize: typography.body, lineHeight: 20 },
  scoresCard: { gap: spacing.md },
  bodyLanguageNotes: { color: colors.textSecondary, fontSize: typography.caption, lineHeight: 17, marginTop: -spacing.xs },
});
