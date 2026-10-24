import { useEffect, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "../common/Card";
import { SegmentedControl } from "../common/SegmentedControl";
import { Txt } from "../common/Txt";
import { colorForScore } from "./scoreColor";
import { TimelineProvider } from "./charts/TimelineContext";
import { LoudnessChart, PaceChart, PitchChart } from "./charts/ScoreCharts";
import { sheetFor, type CategoryScore, type ScoreFactor, type SubScore, type TakeScores } from "../../domain/scoring/takeScore";
import type { Layer, SubcategoryId } from "../../domain/scoring/taxonomy";
import type { Session, SessionScores } from "../../domain/sessionTypes";
import { producerName, provenanceLabel } from "../../domain/analysis/provenance";
import { FIXED_PITCH_BAND } from "../../domain/scoring/bands";
import { pitchBandFor } from "../../services/sessions/sessionScoreService";
import { loadVoiceCharts, type VoiceCharts } from "../../services/signals/voiceCharts";
import { tick } from "../../utils/haptics";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

// The deep breakdown of a take: every skill, every subcategory under it with
// its score, who gave it (Tono AI or this phone), the judge's note and the
// measured numbers behind it, and, directly under each, the graph of that
// thing over time. It reads the same score sheets as the Overview's summary
// (domain/scoring/takeScore.ts), so the names and numbers always agree.
interface ScoresTabProps {
  scores: TakeScores;
  // The judge's stored rubric, for the body-language note the totals leave out.
  rubric: SessionScores | null;
  session: Session;
  // Opens the recording at a moment (the Overview's player).
  onPlayFrom?: (ms: number) => void;
}

export function ScoresTab({ scores, rubric, session, onPlayFrom }: ScoresTabProps) {
  const styles = useStyles();
  const [layer, setLayer] = useState<Layer>(scores.headline);
  const [voice, setVoice] = useState<VoiceCharts | null | undefined>(undefined);
  const [fullSt, setFullSt] = useState<number>(FIXED_PITCH_BAND.fullSt);

  useEffect(() => {
    let live = true;
    loadVoiceCharts(session.id)
      .then((v) => live && setVoice(v))
      .catch(() => live && setVoice(null));
    pitchBandFor(session)
      .then((b) => live && setFullSt(b.fullSt))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [session]);

  const both = !!(scores.measured && scores.judged);
  const sheet = sheetFor(scores, layer);
  const judge = producerName(scores.judgedBy);
  const durationMs = Math.max(session.durationSeconds * 1000, voice?.durationMs ?? 0);

  return (
    <TimelineProvider durationMs={durationMs} playFrom={onPlayFrom}>
      <Card style={styles.head}>
        <View style={styles.headTop}>
          <View style={styles.flex}>
            <Txt variant="footnote" tone="muted">
              {layer === "judged" ? `Judged by ${judge}` : "Measured on this phone"}
            </Txt>
            <Txt variant="footnote" tone="secondary">
              {layer === "judged"
                ? "Each score below says whether Tono AI judged it or the phone measured it."
                : "The same formula for every take, from what the phone measured."}
            </Txt>
          </View>
          <Txt variant="title1" tabular>
            {sheet.overall}
          </Txt>
        </View>
        {both ? (
          <SegmentedControl
            size="sm"
            value={layer}
            onChange={setLayer}
            options={[
              { key: "judged", label: judge },
              { key: "measured", label: "This phone" },
            ]}
          />
        ) : null}
        {scores.judged && layer === "judged" ? (
          <Txt variant="caption1" tone="muted">
            {provenanceLabel(scores.judgedBy)}
          </Txt>
        ) : null}
      </Card>

      {sheet.categories.map((category) => (
        <CategoryCard
          key={category.skill}
          category={category}
          judge={judge}
          other={otherScore(scores, layer, category.skill)}
          charts={{
            pace: <PaceChart curve={session.wpmCurve} />,
            melody: <PitchChart voice={voice} fullSt={fullSt} />,
            emphasis: <LoudnessChart voice={voice} />,
          }}
          bodyNote={category.skill === "confidence" && layer === "judged" && rubric?.bodyLanguageNotes ? rubric.bodyLanguageNotes : null}
        />
      ))}
    </TimelineProvider>
  );
}

function otherScore(scores: TakeScores, layer: Layer, skill: CategoryScore["skill"]): { name: string; score: number } | null {
  const other = layer === "judged" ? scores.measured : scores.judged;
  const found = other?.categories.find((c) => c.skill === skill);
  return found ? { name: layer === "judged" ? "This phone" : "Judged", score: found.score } : null;
}

function CategoryCard({
  category: c,
  judge,
  other,
  charts,
  bodyNote,
}: {
  category: CategoryScore;
  judge: string;
  other: { name: string; score: number } | null;
  charts: Partial<Record<SubcategoryId, ReactNode>>;
  bodyNote: string | null;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Card style={styles.category}>
      <View style={styles.categoryHead}>
        <Txt variant="headline" style={styles.flex}>
          {c.label}
        </Txt>
        <Txt variant="title2" tabular color={colorForScore(c.score, colors)}>
          {c.score}
        </Txt>
      </View>
      <Txt variant="caption1" tone="muted">
        {Math.round(c.weight * 100)}% of the total{other ? ` · ${other.name} ${other.score}` : ""}
      </Txt>
      {c.subscores.map((s) => (
        <SubScoreBlock key={s.id} sub={s} judge={judge}>
          {charts[s.id]}
        </SubScoreBlock>
      ))}
      {bodyNote ? (
        <View style={styles.sub}>
          <Txt variant="subhead" weight="600">
            Body language{" "}
            <Txt variant="footnote" tone="muted">
              · {judge}, not in the total
            </Txt>
          </Txt>
          <Txt variant="footnote" tone="secondary">
            {bodyNote}
          </Txt>
        </View>
      ) : null}
    </Card>
  );
}

function SubScoreBlock({ sub: s, judge, children }: { sub: SubScore; judge: string; children?: ReactNode }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const color = colorForScore(s.score, colors);
  return (
    <View style={styles.sub}>
      <View style={styles.subTop}>
        <Txt variant="subhead" weight="600" style={styles.flex}>
          {s.label}{" "}
          <Txt variant="footnote" tone="muted">
            · {s.layer === "judged" ? judge : "measured on the phone"}
            {s.rollsUp ? "" : ", not in the total"}
          </Txt>
        </Txt>
        <Txt variant="subhead" weight="600" tabular color={color}>
          {s.score}
        </Txt>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.max(0, Math.min(10, s.score)) * 10}%`, backgroundColor: color }]} />
      </View>
      {s.notes ? (
        <Txt variant="footnote" tone="secondary">
          {s.notes}
        </Txt>
      ) : null}
      {children}
      {s.factors?.length ? (
        <>
          <Pressable
            onPress={() => {
              tick();
              setOpen((o) => !o);
            }}
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            style={styles.how}
          >
            <Txt variant="footnote" tone="accent" weight="600">
              {open ? "Hide how it's measured" : "How it's measured"}
            </Txt>
            <Ionicons name={open ? "chevron-up" : "chevron-down"} size={13} color={colors.accent} />
          </Pressable>
          {open ? s.factors.map((f) => <FactorRow key={f.label} factor={f} />) : null}
        </>
      ) : null}
    </View>
  );
}

function FactorRow({ factor: f }: { factor: ScoreFactor }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const badge =
    f.delta != null
      ? { text: f.delta > 0 ? `+${f.delta}` : `${f.delta}`, color: f.delta > 0 ? colors.success : colors.warning }
      : f.score != null
        ? { text: `${f.score}`, color: colorForScore(f.score, colors) }
        : null;
  return (
    <View style={styles.factor}>
      <View style={styles.subTop}>
        <Txt variant="footnote" weight="600" style={styles.flex}>
          {f.label}{" "}
          <Txt variant="footnote" tone="muted">
            · {f.value}
          </Txt>
        </Txt>
        {badge ? (
          <Txt variant="footnote" weight="600" tabular color={badge.color}>
            {badge.text}
          </Txt>
        ) : null}
      </View>
      <Txt variant="footnote" tone="secondary">
        {f.rule}
      </Txt>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  head: { gap: t.space.sm },
  headTop: { flexDirection: "row", alignItems: "center", gap: t.space.md },
  category: { gap: t.space.md },
  categoryHead: { flexDirection: "row", alignItems: "baseline", gap: t.space.sm },
  sub: { gap: t.space.xs + 2 },
  subTop: { flexDirection: "row", alignItems: "baseline", gap: t.space.sm },
  track: { height: 6, borderRadius: t.radius.pill, backgroundColor: t.colors.surfaceRaised, overflow: "hidden" },
  fill: { height: 6, borderRadius: t.radius.pill },
  how: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 2 },
  factor: { gap: 2, paddingLeft: t.space.sm },
}));
