# Design refresh: "Quiet Studio"

A new design language for the whole app. The aim is cleaner, calmer, more
modern, with motion that explains what's happening. This doc is the
reference while building it and afterwards. The **Status** section at the
end tracks what's done.

## What's wrong today

Seen on the emulator (Today, Learn, Progress, Library):

- **Boxes everywhere.** Every section is a bordered card, cards nest inside
  cards (stat tiles inside a card, rows inside a card), and 1px borders
  outline almost everything. Nothing reads as more important than anything
  else.
- **A generic look.** System font, stock blue accent, dark grey cards on
  near-black. It could be any app.
- **Shouting labels.** All-caps, letter-spaced eyebrows ("TODAY · 8 MIN",
  "YOUR SKILLS", "CONVERSATIONS") on nearly every card. They add noise, not
  structure.
- **Two style systems.** Newer screens use `Txt` and `makeStyles`. About 40
  files still hand-roll `<Text>` with `typography.body` and `fontWeight`
  from the legacy `theme.ts`, so sizes and weights drift between screens.
- **Little motion.** A few rings animate. Presses only dim, screens pop in
  all at once, and selection changes snap.
- **Weak hierarchy on Today.** The hero plan card, the conversation
  missions, the feelings card and the skill rings all have the same weight.
  The one thing to do today doesn't stand out.

## Principles

1. **One thing at a time.** Each screen has one primary action, drawn in
   ink. Everything else is quieter.
2. **Spoken words are set in serif.** Prompts, lines to read, quotes, lesson
   and screen titles use Instrument Serif. The interface (labels, buttons,
   data) uses Instrument Sans. The split carries meaning: serif is what you
   say or what matters, sans is the interface.
3. **Color means something.** The UI is monochrome, in warm neutrals with an
   ink accent. Color appears only for:
   - the five skills, where the day's focus skill also tints Today's hero;
   - status (good, needs work, problem);
   - recording (red).
4. **Fewer boxes.** Cards have no borders. No card sits inside another card.
   Grouping comes from spacing and type, and hairlines appear only between
   list rows.
5. **Motion explains.**
   - Presses respond instantly with a small spring scale.
   - Content enters in a short stagger.
   - Progress fills, numbers count up, and selections slide.
   - Nothing loops, except live states (recording, listening).
6. **Calm by default.** Sentence case everywhere and generous space. No
   all-caps.

## Tokens

### Color

The dark scheme is the default. Both schemes use warm neutrals: a hint of
yellow in the greys, so the app feels like paper and ink, not steel.

| Token | Dark | Light | Use |
|---|---|---|---|
| background | `#0E0E0C` | `#F6F5F1` | screen |
| surface | `#181816` | `#FFFFFF` | cards |
| surfaceRaised | `#222220` | `#EFEEE9` | fills inside cards, inputs, chips |
| border | `rgba(255,250,235,0.08)` | `rgba(28,25,15,0.08)` | rare outlines |
| separator | `rgba(255,250,235,0.07)` | `rgba(28,25,15,0.07)` | list hairlines |
| textPrimary | `#F4F2EC` | `#181714` | |
| textSecondary | `#A9A69D` | `#5D5A52` | |
| textMuted | `#77746C` | `#8C887E` | |
| accent (ink) | `#F4F2EC` | `#181714` | primary buttons, selection, focus |
| onAccent | `#0E0E0C` | `#FFFFFF` | text on ink |
| accentMuted | ink at 10% | ink at 7% | selected fills, icon tiles |
| success | `#5FD69B` | `#14824F` | |
| warning | `#F2B54B` | `#A35F00` | |
| danger | `#FF6B5E` | `#C93A2E` | |
| record | `#FF453A` | `#FF3B30` | record button, live dot |

Skill hues are softened to sit on warm neutrals:

| Skill | Dark | Light |
|---|---|---|
| articulation | `#5FE0C3` mint | `#0E7563` |
| cadence | `#B3A1FF` lavender | `#6A3FD6` |
| impromptu | `#FFC85E` amber | `#9A6200` |
| confidence | `#FF92B8` rose | `#B8285F` |
| conversation | `#6FC6FF` sky | `#0A6FA6` |

Making `accent` ink turns every existing accent use (selected chips, links,
rings, buttons) monochrome in one move, with no per-screen change needed.

### Type

The fonts are **Instrument Sans** (400, 500, 600 and 700) and **Instrument
Serif** (regular and italic). Both are OFL and live in `assets/fonts`. They
are loaded at runtime with `useFonts`.

On Android a custom font plus `fontWeight` produces a faked bold. So every
weight is its own family (`InstrumentSans-SemiBold`), and the type styles
carry `fontFamily`, never `fontWeight`. `Txt` maps its `weight` prop to the
right family. Styles use `t.font(weight)` (or `font()` in legacy files).

| Variant | Font | Size/line | Use |
|---|---|---|---|
| display | serif | 56/60 | the score, the big numbers |
| largeTitle | serif | 40/46 | screen titles |
| title1 | serif | 30/36 | hero titles (today's lesson, a prompt) |
| title2 | sans 600 | 21/27 | card titles |
| title3 | sans 600 | 18/24 | section titles, smaller card titles |
| headline | sans 600 | 16/22 | row titles, emphasis |
| body | sans 400 | 16/24 | running text |
| callout | sans 400 | 15/22 | secondary running text |
| subhead | sans 400 | 14/20 | |
| footnote | sans 400 | 13/18 | meta |
| caption1 | sans 500 | 12/16 | small labels |
| caption2 | sans 600 | 11/14 | tiny labels, tags |
| quote | serif | 24/31 | spoken words: prompts, lines, why-you-started |

Numbers in data use tabular figures (`fontVariant: ["tabular-nums"]`).

### Space, radius and elevation

- **Space:** a 4-pt grid (`xs 4`, `sm 8`, `md 16`, `lg 24`, `xl 32`,
  `xxl 48`). Screen gutter 20, gap between sections 28.
- **Radius:** `sm 10`, `md 16`, `lg 24`, `xl 32`, `pill`. Cards are 24,
  buttons pill-shaped, inputs 16.
- **Elevation:** dark mode separates layers by surface tone only. Light mode
  gives cards a soft, low shadow (`0 1 2 / 4%`, `0 8 24 / 5%`) instead of
  borders. Toasts and sheets get a stronger float shadow.

### Motion and haptics

`theme/motion.ts`:

- **Durations:** fast 160ms (press, toggle), base 260ms (state changes),
  slow 420ms (enter, progress).
- **Easing:** standard `bezier(0.2, 0, 0, 1)`, an emphasized deceleration.
- **Springs:**
  - press `{ damping 18, stiffness 380, mass 0.6 }` (scale 0.97);
  - gentle `{ damping 20, stiffness 180 }` for indicators.
- **Enter:** `FadeInDown` from 12px, 420ms, staggered 45ms per item. Runs on
  first mount only.
- **Haptics** (`utils/haptics.ts`, all fire-and-forget):
  - selection tick on chip, segment and tab changes;
  - light impact on primary buttons;
  - success on finishing a step or session.

## Components

These are rebuilt in `components/common`, with existing APIs kept wherever
possible so screens change with little or no edit.

| Component | Change |
|---|---|
| `Txt` | New families and variants; `weight` maps to a family; `uppercase` is retired (renders sentence case); `tabular` prop. |
| `PressableScale` (new) | The press primitive: spring scale and opacity, optional haptic. Used by buttons, cards, rows and chips. |
| `PrimaryButton` | Pill, 56 tall (`size="md"` is 44, `"sm"` is 36). Primary is ink; secondary is a raised fill; ghost is text; danger is red. Optional leading/trailing icon. Light haptic. |
| `IconButton` (new) | 40px circle with a subtle fill, for back, close, settings and more. |
| `Card` | Borderless. Optional `onPress` (it scales), `tone="raised"`, `padding`. |
| `HeroCard` | "Aura": a soft glow in a skill color, layered radial-style gradients, a slow 8s breathing drift. Used once per screen at most. |
| `Header` | IconButton back; serif title (large on roots); sentence-case eyebrow. |
| `Screen` (new) | The layout primitive: safe area, gutter and optional scroll. A large serif title that hands off to a compact title in the bar as you scroll. A sticky footer for the primary action, with a fade. Staggered enter. Handles the tab bar inset. |
| `ScreenContainer` | Kept for camera and custom screens, with the new gutter. |
| `ListGroup` and `ListRow` | Inset-grouped lists: rows in one surface with hairlines, an icon tile, title and subtitle, and a value or chevron. Pressable rows scale. |
| `Chip` / `ChipGroup` | Pill; selected is ink. The background animates; selection tick. |
| `SegmentedControl` | Pill track with a sliding, spring-animated thumb. Haptic. |
| `ProgressRing` / `SkillRings` | Thinner rings with round caps; fill on mount; labels in tabular sans. |
| `StatTile` | Becomes `Stat`: a big number (serif or tabular sans) over a muted label, without a tile. |
| `Badge` / `Tag` | Sentence-case small pill; skill tags carry a color dot. |
| `Banner` | Rebuilt as a notice: tinted surface, icon, text. |
| `SectionHeader` | Sans semibold section title, optional action on the right. |
| `EmptyState` | Icon in a soft circle, serif title, calm copy. |
| `Toast` | A floating pill with a float shadow; springs in from the top; tone icon. |
| `Skeleton` (new) | Shimmering placeholders, replacing spinners in content areas. |
| Tab bar | Android gets a custom bar: ink icons and labels, an animated pill behind the active tab, and a selection haptic. iOS keeps the native Liquid Glass bar. |
| `RecordButton` | Ring and core; the core morphs from circle to rounded square when recording; a pulse ring while live. |

## Screens

The order is by traffic and first impression.

1. **Today.** A greeting eyebrow over a large serif "Today", then a single
   meta line: date · streak · goal dots. Below that is the aura hero in the
   focus skill's color, containing:
   - a skill tag and a 5/8/12 segmented control;
   - the lesson title in serif and a one-line why;
   - the steps as a vertical timeline (done, current, next);
   - an ink "Start session" button.

   Then quieter sections: Feeling of the week, Conversations, Your skills
   (rings, no card), and Practice something else. "Why you started" is set
   as a serif quote.
2. **Onboarding.** The first impression. Full-screen questions:
   - a thin animated progress bar and the chapter name;
   - the question in serif;
   - options as large selectable rows with an animated check;
   - an ink Continue button pinned to the bottom;
   - questions slide in and out horizontally.

   The setup check, skill check and starting point get the same treatment.
3. **Learn.** A row of skill tabs, each with a mini ring in its color. The
   selected skill's header has a big ring. Units are sections, and lessons
   are a vertical path: nodes joined by a line; done nodes filled; the next
   one bigger, in ink, with its minutes and a play affordance.
4. **Lesson and Daily session.** A serif title. Steps as a timeline that
   checks off with an animated fill. Teach content set as calm, readable
   text, not in cards.
5. **Progress.** Big serif streak and goal numbers; a calendar heatmap of
   rounded cells shaded by ink intensity; rings; week-over-week with arrows;
   charts restyled to the new tokens.
6. **Library.** Collections as a horizontal row of soft tiles; a pill search
   field; recordings grouped by month, each row with a small score ring.
7. **Result.** A serif score in an animated ring, counting up. The
   breakdown bars fill in sequence. The coach card and transcript use the
   new type.
8. **Recording, Preview and Drill runner.** Glass pills for the timer and
   prompt over the camera, the morphing record button, cleaner live stats.
9. **Mark It Up, Practice and Settings.** Inset-grouped lists, new shelves,
   and serif for the lines themselves.
10. **Everything else.** Migrated off legacy `theme.ts` styles and raw
    `<Text>` onto `Txt` and `makeStyles`, so every screen uses the same scale.

## Build order

1. **Foundation:** fonts, tokens, `theme.ts` compatibility (legacy exports
   point at the new values, so old screens shift at once), `Txt`, motion
   and haptics.
2. **Core components** from the table above, plus the Android tab bar.
3. **Key screens:** Today, onboarding, Learn, Lesson and Daily session,
   Progress, Library, Result, Settings.
4. **Sweep:** every remaining screen onto the new system; delete what's
   unused.
5. **QA:**
   - emulator pass in dark and light;
   - large text (font scale 1.3);
   - tsc and jest;
   - fix anything clipped or crowded.

Each step is a commit on `feature/design-refresh`.

## Rules for later changes

- No borders on cards. No card inside a card.
- No all-caps labels.
- Only the primary action is ink. At most one per screen.
- Serif only for titles, prompts, lines and big numbers. Never serif for
  controls or body text.
- Custom fonts never get `fontWeight`. Use `Txt weight` or `t.font()`.
- Camera screens stay dark in both schemes (`darkColors`).

## Status

(Updated as the build goes.)
