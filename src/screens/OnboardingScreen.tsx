import { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { SafeAreaView } from "react-native-safe-area-context";
import { Aura } from "../components/common/Aura";
import { ChoiceList } from "../components/common/ChoiceList";
import { Enter } from "../components/common/Enter";
import { IconButton } from "../components/common/IconButton";
import Animated, { FadeInLeft, FadeInRight, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { duration, easeOut } from "../theme/motion";
import { Waveform, WelcomeIntro } from "../components/onboarding/WelcomeIntro";
import { Txt } from "../components/common/Txt";
import { Card } from "../components/common/Card";
import { Chip } from "../components/common/Chip";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { ScaleSlider } from "../components/common/ScaleSlider";
import { ReminderHours } from "../components/settings/ReminderHours";
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
import { defaultsFromProfile, EMPTY_PROFILE, type EventKind, type UserProfile } from "../domain/profile";
import { MAX_CUSTOM_THOUGHTS, PRESET_THOUGHTS } from "../domain/innerVoice/thoughts";
import { syncOnboardingThoughts } from "../services/db/selfTalkRepo";
import { defaultExtraHours, sessionHours, type DailyGoal } from "../domain/dailyGoal";
import { setSessionHour } from "../domain/reminderSettings";
import {
  getDailySessionGoal,
  getPlanMinutes,
  getPracticeAnchor,
  getReminderSettings,
  getUserProfile,
  setCloudConsent,
  setCloudProvider,
  setCloudReviewDefault,
  setDailySessionGoal,
  setPlanMinutes,
  setPracticeAnchor,
  setRecordBlindPref,
  setReminderSettings,
  setUserProfile,
  setVideoRetentionDays,
  setWarmUpEnabled,
} from "../services/prefs/prefsStore";
import { requestNotificationPermission, syncDailyReminder } from "../services/notifications/reminderScheduler";
import { anchorOption } from "../domain/notificationCopy";
import { AiCoachSetup, providerForPastedKey } from "../components/onboarding/AiCoachSetup";
import { TranscriptionSetup } from "../components/onboarding/TranscriptionSetup";
import { useTranscriptionModel } from "../hooks/useTranscriptionModel";
import { cleanApiKey } from "../services/cloud/inputGuards";
import { checkProviderKey } from "../services/cloud/textProviders";
import { currentProvider, hasConsent, hasProviderKey, PROVIDERS } from "../services/cloud/providers";
import { setProviderKey } from "../services/secrets/secretsStore";
import { isoDateFromDate, todayISODate } from "../utils/dateUtils";
import { DatePicker, formatEventDate } from "../components/common/DatePicker";
import { createEvent, deleteEvent, listEvents, updateEvent } from "../services/db/eventsRepo";
import { upcomingEvent } from "../domain/events";
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
  // Without the legacy event field: events live in their own table now.
  const [profile, setProfile] = useState<UserProfile>(() => {
    const { event: _legacy, ...stored } = getUserProfile() ?? EMPTY_PROFILE(todayISODate());
    return stored;
  });
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
  const [cloudKey, setCloudKey] = useState("");
  const [cloudError, setCloudError] = useState<string | null>(null);
  // Already set up (profile mode, or a key added before onboarding).
  const [connected, setConnected] = useState<string | null>(null);
  const [retention, setRetention] = useState<string | null>(null);
  // The event question: a kind, a day (a quick chip or one picked from the
  // calendar) and an optional name. Editing the next event when there is one.
  const [eventKind, setEventKind] = useState<EventKind | null>(null);
  const [eventDate, setEventDate] = useState<string | null>(null);
  const [eventWhen, setEventWhen] = useState<number | "picked" | null>(null);
  const [eventNote, setEventNote] = useState("");
  const [eventId, setEventId] = useState<string | null>(null);
  const [pickingDate, setPickingDate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [customThought, setCustomThought] = useState("");

  useEffect(() => {
    listEvents()
      .then((events) => {
        const next = upcomingEvent(events, todayISODate());
        if (!next) return;
        setEventId(next.id);
        setEventKind(next.kind);
        setEventDate(next.date);
        setEventWhen("picked");
        setEventNote(next.title ?? "");
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const provider = currentProvider();
    hasProviderKey(provider.id).then((has) => setConnected(has && hasConsent(provider.id) ? provider.name : null));
  }, []);

  // 1 = forward, -1 = back: which way the next question slides in.
  const [direction, setDirection] = useState(1);
  function go(target: number) {
    setDirection(target >= step ? 1 : -1);
    setStep(target);
  }

  const question = QUESTIONS[step];
  const transcriptionModel = useTranscriptionModel();
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
      // Required, but only to start: the download carries on in the background.
      case "transcription":
        return transcriptionModel.status !== "missing";
      case "cloud":
        return !!connected || cleanApiKey(cloudKey).length > 0;
      // Optional, but a kind needs a day before it can count.
      case "event":
        return !eventKind || !!eventDate;
      default:
        return true;
    }
  })();

  // The AI coach step: checks the pasted key with its provider before going
  // on. Turning it on here is the user's permission to send takes there, so
  // reviews run by default from now on. Returns false to stay on the step.
  async function connectAiCoach(): Promise<boolean> {
    const cleaned = cleanApiKey(cloudKey);
    if (!cleaned) return true;
    const providerId = providerForPastedKey(cleaned);
    setCloudError(null);
    const problem = await checkProviderKey(providerId, cleaned).catch(() => "Couldn't check the key — check your connection and try again.");
    if (problem) {
      setCloudError(problem);
      return false;
    }
    await setProviderKey(providerId, cleaned);
    setCloudProvider(providerId);
    setCloudConsent(providerId, true);
    setCloudReviewDefault(true);
    setConnected(PROVIDERS[providerId].name);
    setCloudKey("");
    return true;
  }

  // Applies one answer to the app, right away. False keeps you on the step.
  async function apply(id: string): Promise<boolean> {
    switch (id) {
      case "innerCritic": {
        const critic = profile.innerCritic ?? { presets: [], custom: [] };
        const draft = customThought.trim();
        const custom = draft && critic.custom.length < MAX_CUSTOM_THOUGHTS && !critic.custom.includes(draft) ? [...critic.custom, draft] : critic.custom;
        update({ innerCritic: { presets: critic.presets, custom } });
        setCustomThought("");
        await syncOnboardingThoughts(critic.presets, custom);
        return true;
      }
      case "event":
        try {
          if (eventKind && eventDate) {
            const input = { kind: eventKind, title: eventNote.trim() || null, date: eventDate };
            if (eventId) await updateEvent(eventId, input);
            else setEventId(await createEvent(input));
          } else if (!eventKind && eventId) {
            await deleteEvent(eventId);
            setEventId(null);
          }
        } catch {
          // Never blocks onboarding: the event can be added again from Today.
        }
        return true;
      case "goal":
        setDailySessionGoal(goal);
        return true;
      case "minutes":
        setPlanMinutes(minutes as 5 | 8 | 12);
        return true;
      case "anchor": {
        const option = ANCHOR_OPTIONS.find((a) => a.key === anchorKey);
        const text = option ? option.anchor : customAnchor.trim() ? `After ${customAnchor.trim().replace(/^after\s+/i, "")}` : null;
        // A habit of their own has no known hour yet; the reminders step ties it to theirs.
        setPracticeAnchor(text, option ? option.hour : null);
        if (option) {
          setHour(option.hour);
          setExtraHours(defaultExtraHours(option.hour, goal));
        }
        return true;
      }
      case "reminders": {
        let enabled = remind;
        if (enabled) enabled = await requestNotificationPermission();
        const hours = sessionHours(hour, extraHours, goal).slice(1);
        setReminderSettings({ enabled, hour, extraHours: hours, practiceDays: days.length === 7 ? [] : days });
        // A habit they wrote themselves happens at the time they just chose.
        const habit = getPracticeAnchor();
        if (habit && !anchorOption(habit)) setPracticeAnchor(habit, hour);
        await syncDailyReminder().catch(() => undefined);
        return true;
      }
      case "days":
        setReminderSettings({ ...getReminderSettings(), practiceDays: days.length === 7 ? [] : days });
        return true;
      case "cloud":
        return connectAiCoach();
      case "retention": {
        const option = RETENTION_OPTIONS.find((r) => r.key === retention);
        if (option) setVideoRetentionDays(option.days);
        return true;
      }
    }
    return true;
  }

  // `skip`: an optional question left unanswered. The AI coach step then
  // sends nothing anywhere, even if a key was half-pasted.
  async function next(skip = false) {
    if (busy) return;
    setBusy(true);
    try {
      if (question && !(skip && question.id === "cloud") && !(await apply(question.id))) return;
      if (skip && question?.id === "cloud") setCloudKey("");
      const nextStep = step + 1;
      if (nextStep >= QUESTIONS.length) {
        await finish();
        return;
      }
      go(nextStep);
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
    go(step - 1);
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
    return <ChoiceList options={options} value={value} onChange={onPick} />;
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
        return <TextInput maxLength={40} value={profile.name ?? ""} onChangeText={(name) => update({ name })} placeholder="Your first name" placeholderTextColor={colors.textMuted} style={styles.input} autoFocus returnKeyType="next" onSubmitEditing={() => next()} />;
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
                    <Chip
                      key={w.days}
                      label={w.label}
                      selected={eventWhen === w.days}
                      onPress={() => {
                        const date = new Date();
                        date.setDate(date.getDate() + w.days);
                        setEventWhen(w.days);
                        setEventDate(isoDateFromDate(date));
                      }}
                    />
                  ))}
                  <Chip label={eventWhen === "picked" && eventDate ? formatEventDate(eventDate) : "Pick a date"} selected={eventWhen === "picked"} onPress={() => setPickingDate(true)} />
                </View>
                <DatePicker
                  visible={pickingDate}
                  value={eventDate}
                  title="When is it?"
                  onPick={(date) => {
                    setEventDate(date);
                    setEventWhen("picked");
                  }}
                  onClose={() => setPickingDate(false)}
                />
                <TextInput maxLength={60}
                  value={eventNote}
                  onChangeText={setEventNote}
                  placeholder="What is it? (optional)"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                />
              </>
            ) : null}
          </View>
        );
      case "comfort":
        return <ScaleSlider value={profile.speakingComfort ?? null} onChange={(speakingComfort) => update({ speakingComfort })} min={1} max={5} lowLabel="I avoid it" highLabel="I enjoy it" accessibilityLabel="How you feel about speaking in front of people, 1 to 5" />;
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
      case "innerCritic": {
        const critic = profile.innerCritic ?? { presets: [], custom: [] };
        return (
          <View style={styles.block}>
            <Multi
              options={PRESET_THOUGHTS.map((p) => ({ key: p.id, label: p.text }))}
              value={critic.presets}
              onChange={(presets) => update({ innerCritic: { ...critic, presets } })}
            />
            {critic.custom.length > 0 ? (
              <View style={styles.chips}>
                {critic.custom.map((c) => (
                  <Chip key={c} label={`${c}  ×`} selected onPress={() => update({ innerCritic: { ...critic, custom: critic.custom.filter((x) => x !== c) } })} />
                ))}
              </View>
            ) : null}
            {critic.custom.length < MAX_CUSTOM_THOUGHTS ? (
              <TextInput
                maxLength={120}
                value={customThought}
                onChangeText={setCustomThought}
                onSubmitEditing={() => {
                  const draft = customThought.trim();
                  if (draft && !critic.custom.includes(draft)) update({ innerCritic: { ...critic, custom: [...critic.custom, draft] } });
                  setCustomThought("");
                }}
                returnKeyType="done"
                placeholder="Something else it says"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
              />
            ) : null}
            <Txt variant="footnote" tone="secondary">
              This is practice, not therapy. If these thoughts feel heavy or constant, a therapist can help.
            </Txt>
          </View>
        );
      }
      case "voiceNote":
        return <TextInput maxLength={300} value={profile.voiceNote ?? ""} onChangeText={(voiceNote) => update({ voiceNote })} placeholder="e.g. my voice gets tired quickly" placeholderTextColor={colors.textMuted} style={[styles.input, styles.multiline]} multiline />;
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
                  <Pressable key={day} onPress={() => setDays((d) => (on && d.length > 1 ? d.filter((x) => x !== day) : on ? d : [...d, day].sort()))} style={[styles.day, on && styles.dayOn]} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
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
              <TextInput maxLength={120} value={customAnchor} onChangeText={setCustomAnchor} placeholder="After I…" placeholderTextColor={colors.textMuted} style={styles.input} autoFocus />
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
                <ReminderHours
                  hours={sessionHours(hour, extraHours, goal)}
                  onChange={(i, h) => {
                    const next = setSessionHour(sessionHours(hour, extraHours, goal), i, h);
                    setHour(next[0]);
                    setExtraHours(next.slice(1));
                  }}
                />
              </Card>
            ) : null}
          </View>
        );
      case "transcription":
        return <TranscriptionSetup />;
      case "cloud":
        return connected && !cloudKey ? (
          <View style={styles.phoneOnly}>
            <Ionicons name="checkmark-circle" size={20} color={colors.success} />
            <View style={styles.flex}>
              <Txt variant="headline">Connected to {connected}</Txt>
              <Txt variant="footnote" tone="secondary">
                Your AI coach is ready. Change the provider, the key, or whether every take gets a review in Settings → Deep reviews.
              </Txt>
            </View>
          </View>
        ) : (
          <AiCoachSetup
            apiKey={cloudKey}
            onChangeKey={(k) => {
              setCloudKey(k);
              setCloudError(null);
            }}
            error={cloudError}
          />
        );
      case "retention":
        return <Choices options={RETENTION_OPTIONS.map((r) => ({ key: r.key, label: r.label }))} value={retention} onPick={setRetention} />;
      case "why":
        return <TextInput maxLength={300} value={profile.why ?? ""} onChangeText={(why) => update({ why })} placeholder="e.g. I'll say what I mean in meetings without rehearsing it in my head first" placeholderTextColor={colors.textMuted} style={[styles.input, styles.multiline]} multiline />;
    }
  }

  if (step < 0 && mode === "full") return <WelcomeIntro onDone={() => go(0)} />;

  if (step < 0) {
    return (
      <View style={styles.welcomeRoot}>
        <Aura color={colors.skill.cadence.fg} secondary={colors.skill.conversation.fg} strength={0.42} at={{ x: 0.2, y: 0.1 }} />
        <SafeAreaView style={styles.welcome}>
          {mode === "profile" ? (
            <View style={styles.welcomeTop}>
              <IconButton icon="close" onPress={() => navigation.goBack()} accessibilityLabel="Close" size={38} />
            </View>
          ) : null}
          <View style={styles.welcomeBody}>
            <Enter index={0}>
              <Waveform />
            </Enter>
            <Enter index={1}>
              <Txt variant="display" style={styles.welcomeTitle}>
                Tell us about you
              </Txt>
            </Enter>
            <Enter index={2}>
              <Txt variant="body" tone="secondary">
                A few questions so your plan fits you. About three minutes; skip anything you like.
              </Txt>
            </Enter>
          </View>
          <Enter index={3}>
            <PrimaryButton label="Let's start" iconRight="arrow-forward" onPress={() => go(0)} />
          </Enter>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <ScreenContainer style={styles.container}>
      <View style={styles.top}>
        <IconButton icon="chevron-back" onPress={back} accessibilityLabel="Back" size={38} />
        <View style={styles.flex}>
          <Txt variant="footnote" weight="500" tone="secondary">
            {CHAPTERS[chapterIndex]} · {chapterIndex + 1} of {CHAPTERS.length}
          </Txt>
          <ProgressBar progress={progress} />
        </View>
      </View>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Animated.View
            key={step}
            entering={(direction > 0 ? FadeInRight : FadeInLeft).duration(duration.slow).easing(easeOut).withInitialValues({ transform: [{ translateX: direction * 24 }] })}
            style={styles.question}
          >
            <View style={styles.questionHead}>
              <Txt variant="title1">{question.title}</Txt>
              {question.subtitle ? (
                <Txt variant="callout" tone="secondary">
                  {question.subtitle}
                </Txt>
              ) : null}
            </View>
            {body()}
            <View style={styles.changes}>
              <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
              <Txt variant="footnote" tone="muted" style={styles.flex}>
                {question.changes}
              </Txt>
            </View>
          </Animated.View>
        </ScrollView>
        <View style={styles.actions}>
          {question.optional && !(question.id === "cloud" && connected && !cloudKey)  ? (
            <PrimaryButton label={question.id === "cloud" ? "Not now" : "Skip"} variant="ghost" style={styles.flex} onPress={() => next(true)} disabled={busy} />
          ) : null}
          <PrimaryButton
            label={step === QUESTIONS.length - 1 ? "Done" : question.id === "cloud" && cloudKey ? "Allow and turn on" : "Continue"}
            style={styles.flexWide}
            onPress={() => next()}
            disabled={!answered}
            loading={busy}
          />
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

// A thin bar that eases to each new value.
function ProgressBar({ progress }: { progress: number }) {
  const styles = useStyles();
  const w = useSharedValue(progress);
  useEffect(() => {
    w.value = withTiming(progress, { duration: duration.slow, easing: easeOut });
  }, [progress, w]);
  const fill = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
  return (
    <View style={styles.track}>
      <Animated.View style={[styles.fill, fill]} />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  container: { gap: t.space.md },
  welcomeRoot: { flex: 1, backgroundColor: t.colors.background },
  welcome: { flex: 1, justifyContent: "space-between", paddingHorizontal: t.layout.gutter, paddingBottom: t.space.md },
  welcomeTop: { paddingTop: t.space.sm, alignItems: "flex-start" },
  welcomeBody: { flex: 1, justifyContent: "center", gap: t.space.lg },
  welcomeTitle: { fontSize: 44, lineHeight: 50, letterSpacing: -1.6 },
  top: { flexDirection: "row", alignItems: "center", gap: t.space.md },
  track: { height: 4, borderRadius: 2, backgroundColor: t.colors.surfaceRaised, marginTop: 8, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 2, backgroundColor: t.colors.accent },
  scroll: { paddingTop: t.space.md, paddingBottom: t.space.lg },
  question: { gap: t.space.lg },
  questionHead: { gap: t.space.sm },
  block: { gap: t.space.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: t.space.sm },
  dayRow: { flexDirection: "row", justifyContent: "space-between" },
  day: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: t.colors.surfaceRaised },
  dayOn: { backgroundColor: t.colors.accent },
  phoneOnly: {
    flexDirection: "row",
    gap: t.space.md - 4,
    padding: t.space.md,
    borderRadius: t.radius.md + 2,
    backgroundColor: t.colors.surfaceRaised,
  },
  input: {
    ...t.type.body,
    fontSize: 17,
    borderRadius: t.radius.md + 2,
    backgroundColor: t.colors.surfaceRaised,
    color: t.colors.textPrimary,
    paddingHorizontal: t.space.md + 2,
    paddingVertical: t.space.md,
  },
  multiline: { minHeight: 120, textAlignVertical: "top" },
  changes: { flexDirection: "row", gap: t.space.sm, alignItems: "flex-start" },
  actions: { flexDirection: "row", gap: t.space.sm, paddingTop: t.space.sm },
  flex: { flex: 1 },
  flexWide: { flex: 2 },
}));
