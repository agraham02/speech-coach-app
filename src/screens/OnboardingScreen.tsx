import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { Txt } from "../components/common/Txt";
import { Card } from "../components/common/Card";
import { Chip } from "../components/common/Chip";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { RatingScale } from "../components/common/RatingScale";
import { LabeledSlider } from "../components/common/LabeledSlider";
import {
  ANCHOR_OPTIONS,
  CHAPTERS,
  CONTEXT_OPTIONS,
  ENGLISH_OPTIONS,
  EVENT_OPTIONS,
  EVENT_WHEN,
  EXPERIENCE_OPTIONS,
  OBSTACLE_OPTIONS,
  PLACE_OPTIONS,
  QUESTIONS,
  RETENTION_OPTIONS,
  SPEECH_OPTIONS,
  VIDEO_OPTIONS,
  type Option,
} from "../content/onboarding";
import { defaultsFromProfile, EMPTY_PROFILE, type UserProfile } from "../domain/profile";
import { defaultExtraHours, type DailyGoal } from "../domain/dailyGoal";
import { formatReminderHour, REMINDER_HOUR_MAX, REMINDER_HOUR_MIN } from "../domain/reminderSettings";
import {
  getDailySessionGoal,
  getPlanMinutes,
  getReminderSettings,
  getUserProfile,
  setCloudReviewDefault,
  setDailySessionGoal,
  setNotionDefault,
  setPlanMinutes,
  setPracticeAnchor,
  setRecordBlindPref,
  setReminderSettings,
  setUserProfile,
  setVideoRetentionDays,
  setWarmUpEnabled,
} from "../services/prefs/prefsStore";
import { requestNotificationPermission, syncDailyReminder } from "../services/notifications/reminderScheduler";
import { isoDateFromDate, todayISODate } from "../utils/dateUtils";
import { makeStyles, useTheme } from "../theme/ThemeProvider";

type Props = NativeStackScreenProps<RootStackParamList, "Onboarding">;

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

// Onboarding chapters 1-3 (practice-expansion-plan.md §8): about you, how you
// speak, your practice. Answers save as you go, so quitting halfway resumes
// where you left off; each one is applied as soon as you move on. "profile"
// mode is the same questions for someone who's used the app already.
export function OnboardingScreen({ route, navigation }: Props) {
  const mode = route.params?.mode ?? "full";
  const styles = useStyles();
  const { colors } = useTheme();
  const [profile, setProfile] = useState<UserProfile>(() => getUserProfile() ?? EMPTY_PROFILE(todayISODate()));
  const [step, setStep] = useState(() => (profile.onboardingStep != null && mode === "full" ? profile.onboardingStep : -1));
  const reminder = getReminderSettings();
  const [goal, setGoal] = useState<DailyGoal>(getDailySessionGoal());
  const [minutes, setMinutes] = useState(getPlanMinutes());
  const [days, setDays] = useState<number[]>(reminder.practiceDays?.length ? reminder.practiceDays : [0, 1, 2, 3, 4, 5, 6]);
  const [anchorKey, setAnchorKey] = useState<string | null>(null);
  const [customAnchor, setCustomAnchor] = useState("");
  const [remind, setRemind] = useState(reminder.enabled);
  const [hour, setHour] = useState(reminder.hour);
  const [extraHours, setExtraHours] = useState<number[]>(reminder.extraHours ?? []);
  const [cloud, setCloud] = useState({ review: false, notion: false });
  const [retention, setRetention] = useState<string | null>(null);
  const [eventKind, setEventKind] = useState(profile.event?.kind ?? null);
  const [eventWhen, setEventWhen] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const question = QUESTIONS[step];
  const chapterIndex = question?.chapter ?? 0;
  const progress = useMemo(() => (step < 0 ? 0 : (step + 1) / QUESTIONS.length), [step]);

  function update(patch: Partial<UserProfile>) {
    setProfile((p) => ({ ...p, ...patch }));
  }

  const answered = (() => {
    if (!question) return true;
    switch (question.id) {
      case "contexts":
        return profile.contexts.length > 0;
      case "obstacles":
        return profile.obstacles.length > 0;
      case "comfort":
        return profile.speakingComfort != null;
      case "video":
        return !!profile.videoComfort;
      case "experience":
        return !!profile.experience;
      case "anchor":
        return !!anchorKey && (anchorKey !== "custom" || customAnchor.trim().length > 2);
      case "place":
        return !!profile.practicePlace;
      case "retention":
        return !!retention;
      default:
        return true;
    }
  })();

  // Applies one answer to the app, right away.
  async function apply(id: string) {
    switch (id) {
      case "event":
        if (eventKind && eventWhen) {
          const date = new Date();
          date.setDate(date.getDate() + eventWhen);
          update({ event: { kind: eventKind, date: isoDateFromDate(date), note: profile.event?.note } });
        } else if (!eventKind) {
          update({ event: null });
        }
        return;
      case "goal":
        setDailySessionGoal(goal);
        return;
      case "minutes":
        setPlanMinutes(minutes as 5 | 8 | 12);
        return;
      case "anchor": {
        const option = ANCHOR_OPTIONS.find((a) => a.key === anchorKey);
        const text = option ? option.anchor : customAnchor.trim() ? `After ${customAnchor.trim().replace(/^after\s+/i, "")}` : null;
        setPracticeAnchor(text);
        if (option) {
          setHour(option.hour);
          setExtraHours(defaultExtraHours(option.hour, goal));
        }
        return;
      }
      case "reminders": {
        let enabled = remind;
        if (enabled) enabled = await requestNotificationPermission();
        const hours = extraHours.length >= goal - 1 ? extraHours : defaultExtraHours(hour, goal);
        setReminderSettings({ enabled, hour, extraHours: hours, practiceDays: days.length === 7 ? [] : days });
        await syncDailyReminder().catch(() => undefined);
        return;
      }
      case "days":
        setReminderSettings({ ...getReminderSettings(), practiceDays: days.length === 7 ? [] : days });
        return;
      case "cloud":
        setCloudReviewDefault(cloud.review);
        setNotionDefault(cloud.notion);
        return;
      case "retention": {
        const option = RETENTION_OPTIONS.find((r) => r.key === retention);
        if (option) setVideoRetentionDays(option.days);
        return;
      }
    }
  }

  async function next() {
    if (busy) return;
    setBusy(true);
    try {
      if (question) await apply(question.id);
      const nextStep = step + 1;
      if (nextStep >= QUESTIONS.length) {
        await finish();
        return;
      }
      setStep(nextStep);
      setProfile((p) => {
        const saved = { ...p, onboardingStep: nextStep };
        setUserProfile(saved);
        return saved;
      });
    } finally {
      setBusy(false);
    }
  }

  function back() {
    if (step <= (mode === "full" ? -1 : 0)) {
      navigation.goBack();
      return;
    }
    setStep((s) => s - 1);
  }

  async function finish() {
    const defaults = defaultsFromProfile(profile);
    setRecordBlindPref(defaults.recordBlind);
    if (defaults.warmUp) setWarmUpEnabled(true);
    const saved: UserProfile = { ...profile, onboardingStep: QUESTIONS.length };
    setUserProfile(saved);
    if (mode === "profile") {
      setUserProfile({ ...saved, onboardingCompletedAt: saved.onboardingCompletedAt ?? new Date().toISOString() });
      navigation.goBack();
      return;
    }
    navigation.replace("SetupCheck");
  }

  function toggle<T extends string>(list: T[], key: T): T[] {
    return list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
  }

  function Choices<T extends string>({ options, value, onPick }: { options: Option<T>[]; value: T | undefined | null; onPick: (key: T) => void }) {
    return (
      <View style={styles.options}>
        {options.map((o) => {
          const on = o.key === value;
          return (
            <Pressable key={o.key} onPress={() => onPick(o.key)} style={[styles.option, on && styles.optionOn]} accessibilityRole="radio" accessibilityState={{ selected: on }}>
              <Txt variant="callout" weight={on ? "700" : "500"} color={on ? colors.onAccent : colors.textPrimary}>
                {o.label}
              </Txt>
            </Pressable>
          );
        })}
      </View>
    );
  }

  function Multi<T extends string>({ options, value, onChange }: { options: Option<T>[]; value: T[]; onChange: (v: T[]) => void }) {
    return (
      <View style={styles.chips}>
        {options.map((o) => (
          <Chip key={o.key} label={o.label} selected={value.includes(o.key)} onPress={() => onChange(toggle(value, o.key))} />
        ))}
      </View>
    );
  }

  function body() {
    if (!question) return null;
    switch (question.id) {
      case "name":
        return <TextInput value={profile.name ?? ""} onChangeText={(name) => update({ name })} placeholder="Your first name" placeholderTextColor={colors.textMuted} style={styles.input} autoFocus returnKeyType="next" onSubmitEditing={next} />;
      case "contexts":
        return <Multi options={CONTEXT_OPTIONS} value={profile.contexts} onChange={(contexts) => update({ contexts })} />;
      case "obstacles":
        return <Multi options={OBSTACLE_OPTIONS} value={profile.obstacles} onChange={(obstacles) => update({ obstacles })} />;
      case "event":
        return (
          <View style={styles.block}>
            <Multi options={EVENT_OPTIONS} value={eventKind ? [eventKind] : []} onChange={(v) => setEventKind(v.filter((k) => k !== eventKind)[0] ?? null)} />
            {eventKind ? (
              <>
                <Txt variant="subhead" tone="secondary">
                  When?
                </Txt>
                <View style={styles.chips}>
                  {EVENT_WHEN.map((w) => (
                    <Chip key={w.days} label={w.label} selected={eventWhen === w.days} onPress={() => setEventWhen(w.days)} />
                  ))}
                </View>
                <TextInput
                  value={profile.event?.note ?? ""}
                  onChangeText={(note) => update({ event: { kind: eventKind, date: profile.event?.date ?? todayISODate(), note } })}
                  placeholder="What is it? (optional)"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                />
              </>
            ) : null}
          </View>
        );
      case "comfort":
        return <RatingScale value={profile.speakingComfort ?? null} onChange={(speakingComfort) => update({ speakingComfort })} lowLabel="I avoid it" highLabel="I enjoy it" />;
      case "video":
        return <Choices options={VIDEO_OPTIONS} value={profile.videoComfort} onPick={(videoComfort) => update({ videoComfort })} />;
      case "experience":
        return <Choices options={EXPERIENCE_OPTIONS} value={profile.experience} onPick={(experience) => update({ experience })} />;
      case "english":
        return <Choices options={ENGLISH_OPTIONS} value={profile.englishFirst} onPick={(englishFirst) => update({ englishFirst })} />;
      case "speech":
        return (
          <View style={styles.block}>
            <Choices options={SPEECH_OPTIONS} value={profile.speechDifference} onPick={(speechDifference) => update({ speechDifference })} />
            {profile.speechDifference === "stutter" || profile.speechDifference === "other" ? (
              <Txt variant="footnote" tone="secondary">
                Thanks for telling us. This app is practice, not therapy — a speech-language pathologist is the right person for that, and nothing here replaces them.
              </Txt>
            ) : null}
          </View>
        );
      case "voiceNote":
        return <TextInput value={profile.voiceNote ?? ""} onChangeText={(voiceNote) => update({ voiceNote })} placeholder="e.g. my voice gets tired quickly" placeholderTextColor={colors.textMuted} style={[styles.input, styles.multiline]} multiline />;
      case "goal":
        return (
          <Choices
            options={[
              { key: "1", label: "Once a day" },
              { key: "2", label: "Twice — plan + a top-up" },
              { key: "3", label: "Three times — plan + two top-ups" },
            ]}
            value={String(goal)}
            onPick={(k) => setGoal(Number(k) as DailyGoal)}
          />
        );
      case "minutes":
        return (
          <Choices
            options={[
              { key: "5", label: "5 minutes" },
              { key: "8", label: "8 minutes" },
              { key: "12", label: "12 minutes" },
            ]}
            value={String(minutes)}
            onPick={(k) => setMinutes(Number(k) as 5 | 8 | 12)}
          />
        );
      case "days":
        return (
          <View style={styles.block}>
            <View style={styles.dayRow}>
              {DAY_LABELS.map((label, day) => {
                const on = days.includes(day);
                return (
                  <Pressable key={day} onPress={() => setDays((d) => (on && d.length > 1 ? d.filter((x) => x !== day) : on ? d : [...d, day].sort()))} style={[styles.day, on && styles.optionOn]} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                    <Txt variant="headline" color={on ? colors.onAccent : colors.textSecondary}>
                      {label}
                    </Txt>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.chips}>
              <Chip label="Every day" onPress={() => setDays([0, 1, 2, 3, 4, 5, 6])} />
              <Chip label="Weekdays" onPress={() => setDays([1, 2, 3, 4, 5])} />
            </View>
          </View>
        );
      case "anchor":
        return (
          <View style={styles.block}>
            <Choices options={[...ANCHOR_OPTIONS.map((a) => ({ key: a.key, label: a.label })), { key: "custom", label: "Something else" }]} value={anchorKey} onPick={setAnchorKey} />
            {anchorKey === "custom" ? (
              <TextInput value={customAnchor} onChangeText={setCustomAnchor} placeholder="After I…" placeholderTextColor={colors.textMuted} style={styles.input} autoFocus />
            ) : null}
          </View>
        );
      case "place":
        return <Choices options={PLACE_OPTIONS} value={profile.practicePlace} onPick={(practicePlace) => update({ practicePlace })} />;
      case "reminders":
        return (
          <View style={styles.block}>
            <Choices
              options={[
                { key: "yes", label: "Yes, remind me" },
                { key: "no", label: "No reminders" },
              ]}
              value={remind ? "yes" : "no"}
              onPick={(k) => setRemind(k === "yes")}
            />
            {remind ? (
              <Card style={styles.block}>
                <LabeledSlider key={`h${hour}`} label={goal > 1 ? "Session 1" : "Time"} value={hour} minimumValue={REMINDER_HOUR_MIN} maximumValue={REMINDER_HOUR_MAX} step={1} formatValue={formatReminderHour} onChange={setHour} />
                {Array.from({ length: goal - 1 }, (_, i) => {
                  const value = (extraHours.length >= goal - 1 ? extraHours : defaultExtraHours(hour, goal))[i];
                  return (
                    <LabeledSlider
                      key={`e${i}${value}`}
                      label={`Session ${i + 2}`}
                      value={value}
                      minimumValue={REMINDER_HOUR_MIN}
                      maximumValue={REMINDER_HOUR_MAX}
                      step={1}
                      formatValue={formatReminderHour}
                      onChange={(h) =>
                        setExtraHours((prev) => {
                          const next = [...(prev.length >= goal - 1 ? prev : defaultExtraHours(hour, goal))];
                          next[i] = h;
                          return next;
                        })
                      }
                    />
                  );
                })}
              </Card>
            ) : null}
          </View>
        );
      case "cloud":
        return (
          <View style={styles.block}>
            <Card style={styles.block}>
              <Txt variant="headline">Phone only</Txt>
              <Txt variant="footnote" tone="secondary">
                Transcripts, pace, pauses, pitch and eye contact are all worked out on this phone. Nothing leaves it.
              </Txt>
            </Card>
            <Pressable onPress={() => setCloud((c) => ({ ...c, review: !c.review }))} accessibilityRole="checkbox" accessibilityState={{ checked: cloud.review }}>
              <Card style={[styles.block, cloud.review && styles.cardOn]}>
                <Txt variant="headline">+ Deep review with Gemini</Txt>
                <Txt variant="footnote" tone="secondary">
                  Uploads the video to Google's Gemini for a detailed review of content and delivery. Needs your own key in Settings.
                </Txt>
              </Card>
            </Pressable>
            <Pressable onPress={() => setCloud((c) => ({ ...c, notion: !c.notion }))} accessibilityRole="checkbox" accessibilityState={{ checked: cloud.notion }}>
              <Card style={[styles.block, cloud.notion && styles.cardOn]}>
                <Txt variant="headline">+ Notion journal</Txt>
                <Txt variant="footnote" tone="secondary">
                  Adds the clean transcript to your Notion journal. Sends the text to Notion.
                </Txt>
              </Card>
            </Pressable>
          </View>
        );
      case "retention":
        return <Choices options={RETENTION_OPTIONS.map((r) => ({ key: r.key, label: r.label }))} value={retention} onPick={setRetention} />;
      case "why":
        return <TextInput value={profile.why ?? ""} onChangeText={(why) => update({ why })} placeholder="e.g. I'll say what I mean in meetings without rehearsing it in my head first" placeholderTextColor={colors.textMuted} style={[styles.input, styles.multiline]} multiline />;
    }
  }

  if (step < 0) {
    return (
      <ScreenContainer style={styles.welcome}>
        <View style={styles.welcomeBody}>
          <Ionicons name="mic-outline" size={44} color={colors.accent} />
          <Txt variant="largeTitle">{mode === "profile" ? "Tell us about you" : "Speaking well is a skill — not a trait."}</Txt>
          <Txt variant="callout" tone="secondary">
            {mode === "profile"
              ? "A few questions so your plan fits you. About three minutes; skip anything you like."
              : "A few questions (about three minutes), a quick setup check, then a short skill check so your plan starts where you are. Nothing is graded, and you can skip anything."}
          </Txt>
        </View>
        <PrimaryButton label="Let's start" onPress={() => setStep(0)} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer style={styles.container}>
      <View style={styles.top}>
        <Pressable onPress={back} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.flex}>
          <Txt variant="caption2" tone="muted" uppercase>
            {CHAPTERS[chapterIndex]} · {chapterIndex + 1} of {CHAPTERS.length}
          </Txt>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${progress * 100}%` }]} />
          </View>
        </View>
      </View>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Txt variant="title2">{question.title}</Txt>
          {question.subtitle ? (
            <Txt variant="subhead" tone="secondary">
              {question.subtitle}
            </Txt>
          ) : null}
          {body()}
          <Txt variant="footnote" tone="muted" style={styles.changes}>
            {question.changes}
          </Txt>
        </ScrollView>
        <View style={styles.actions}>
          {question.optional ? <PrimaryButton label="Skip" variant="ghost" style={styles.flex} onPress={next} disabled={busy} /> : null}
          <PrimaryButton label={step === QUESTIONS.length - 1 ? "Done" : "Next"} style={styles.flexWide} onPress={next} disabled={!answered} loading={busy} />
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const useStyles = makeStyles((t) => ({
  container: { gap: t.space.md },
  welcome: { justifyContent: "space-between" },
  welcomeBody: { flex: 1, justifyContent: "center", gap: t.space.md },
  top: { flexDirection: "row", alignItems: "center", gap: t.space.md },
  track: { height: 6, borderRadius: 3, backgroundColor: t.colors.surfaceRaised, marginTop: 6, overflow: "hidden" },
  fill: { height: "100%", backgroundColor: t.colors.accent },
  scroll: { gap: t.space.md, paddingBottom: t.space.lg },
  block: { gap: t.space.sm },
  options: { gap: t.space.sm },
  option: { paddingVertical: t.space.md, paddingHorizontal: t.space.md, borderRadius: t.radius.md, backgroundColor: t.colors.surface, borderWidth: 1, borderColor: t.colors.border },
  optionOn: { backgroundColor: t.colors.accent, borderColor: t.colors.accent },
  cardOn: { borderColor: t.colors.accent },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: t.space.sm },
  dayRow: { flexDirection: "row", justifyContent: "space-between" },
  day: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: t.colors.surface, borderWidth: 1, borderColor: t.colors.border },
  input: {
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
    color: t.colors.textPrimary,
    paddingHorizontal: t.space.md,
    paddingVertical: t.space.md,
    fontSize: 17,
  },
  multiline: { minHeight: 110, textAlignVertical: "top" },
  changes: { marginTop: t.space.sm },
  actions: { flexDirection: "row", gap: t.space.sm, paddingTop: t.space.sm },
  flex: { flex: 1 },
  flexWide: { flex: 2 },
}));
