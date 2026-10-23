import { parseNotation } from "../domain/cadence/notation";
import { countSentences } from "../domain/cadence/sentences";
import type { MarkedText } from "../domain/cadence/marks";

// Built-in lines for Mark It Up: one or two sentences each, marked to the
// guide in docs/history/practice-expansion-plan.md §4.6 (a pause at every phrase
// boundary, an inflection at every sentence end, at most one stress per
// phrase, spans rare). Notation: see domain/cadence/notation.ts.
// Everything is original except the "Quotes" group, which is public domain.

export type LineCategory = "everyday" | "contrast" | "questions" | "lists" | "story" | "work" | "feelings" | "quotes";

export const LINE_CATEGORIES: { id: LineCategory; label: string; practices: string }[] = [
  { id: "everyday", label: "Everyday", practices: "Things you actually say, said like you mean them" },
  { id: "contrast", label: "Contrast", practices: "Stress the two words that pull against each other" },
  { id: "questions", label: "Questions", practices: "Yes/no questions rise; wh- questions fall" },
  { id: "lists", label: "Lists of three", practices: "Rise, rise, fall" },
  { id: "story", label: "Story beats", practices: "Pause before the turn; slow down for the moment" },
  { id: "work", label: "Work", practices: "Statements that land: falling ends, no hedging" },
  { id: "feelings", label: "Feelings", practices: "Say it like it's true for you" },
  { id: "quotes", label: "Quotes", practices: "Famous lines, read for meaning" },
];

export interface LineSource {
  id: string;
  category: LineCategory;
  notation: string;
  credit?: string;
}

const RAW: LineSource[] = [
  // ---------------- Everyday ----------------
  { id: "e01", category: "everyday", notation: "I *really* need you to hear | what I'm *saying*.↘" },
  { id: "e02", category: "everyday", notation: "Can you give me *one* minute↗ | before you *decide*?↗" },
  { id: "e03", category: "everyday", notation: "I'm *not* upset.↘ || I'm just *tired*.↘" },
  { id: "e04", category: "everyday", notation: "Thanks for *waiting*.↘ || I know it took a *while*.↘" },
  { id: "e05", category: "everyday", notation: "Let's grab *coffee* | and figure this *out*.↘" },
  { id: "e06", category: "everyday", notation: "That's the *best* news | I've heard all *week*.↘" },
  { id: "e07", category: "everyday", notation: "*Honestly*,↗ | I had *no* idea.↘" },
  { id: "e08", category: "everyday", notation: "Give me a *second*.↘ || I'm still *thinking*.↘" },
  { id: "e09", category: "everyday", notation: "You were *right*.↘ || I should have *listened*.↘" },
  { id: "e10", category: "everyday", notation: "If you need *anything*,↗ | just *call* me.↘" },
  { id: "e11", category: "everyday", notation: "I'll be there by *six*.↘ || *Promise*.↘" },
  { id: "e12", category: "everyday", notation: "It's *fine*.↘ || It's *really* fine.↘" },
  { id: "e13", category: "everyday", notation: "I didn't mean it like *that*.↘ || Let me try *again*.↘" },
  { id: "e14", category: "everyday", notation: "We should do this more *often*.↘" },
  { id: "e15", category: "everyday", notation: "That was *way* harder | than it *looked*.↘" },
  { id: "e16", category: "everyday", notation: "*Wait*,↗ | say that *again*?↗" },
  { id: "e17", category: "everyday", notation: "I'm *so* glad you came.↘" },
  { id: "e18", category: "everyday", notation: "Let me *think* about it | and get back to you *tomorrow*.↘" },
  { id: "e19", category: "everyday", notation: "Do you have a *minute*↗ | or is now a *bad* time?↘" },
  { id: "e20", category: "everyday", notation: "*Okay*.↘ || Here's what we're going to *do*.↘" },
  { id: "e21", category: "everyday", notation: "Sorry I'm *late*.↘ || The train just *sat* there.↘" },
  { id: "e22", category: "everyday", notation: "I'll *think* about it.↘" },

  // ---------------- Contrast ----------------
  { id: "c01", category: "contrast", notation: "It's not *what* you said.↘ || It's *how* you said it.↘" },
  { id: "c02", category: "contrast", notation: "I'm not asking you to *agree*.↘ || I'm asking you to *listen*.↘" },
  { id: "c03", category: "contrast", notation: "We didn't *lose*.↘ || We *learned*.↘" },
  { id: "c04", category: "contrast", notation: "It's not a *problem*.↘ || It's a *puzzle*.↘" },
  { id: "c05", category: "contrast", notation: "The plan wasn't *wrong*.↘ || The *timing* was.↘" },
  { id: "c06", category: "contrast", notation: "I don't want *more*.↘ || I want *better*.↘" },
  { id: "c07", category: "contrast", notation: "She didn't *quit*.↘ || She was *ready*.↘" },
  { id: "c08", category: "contrast", notation: "It's *small*,↗ | but it's *real*.↘" },
  { id: "c09", category: "contrast", notation: "Not *louder*.↘ || *Clearer*.↘" },
  { id: "c10", category: "contrast", notation: "Confidence comes *after* you start,↗ | not *before*.↘" },
  { id: "c11", category: "contrast", notation: "Being *busy* | isn't the same as being *productive*.↘" },
  { id: "c12", category: "contrast", notation: "I'm not against the *idea*.↘ || I'm against the *deadline*.↘" },
  { id: "c13", category: "contrast", notation: "The question isn't whether we *can*.↘ || It's whether we *should*.↘" },
  { id: "c14", category: "contrast", notation: "Don't tell me it's *easy*.↘ || Tell me it's *worth* it.↘" },
  { id: "c15", category: "contrast", notation: "It looks *simple*↗ | until you *try* it.↘" },
  { id: "c16", category: "contrast", notation: "We weren't *late*.↘ || Everyone *else* was early.↘" },
  { id: "c17", category: "contrast", notation: "Talent gets you *in* the room.↘ || *Work* keeps you there.↘" },
  { id: "c18", category: "contrast", notation: "I'm not *nervous*.↘ || I'm *ready*.↘" },
  { id: "c19", category: "contrast", notation: "Plan the *work*.↘ || Work the *plan*.↘" },
  { id: "c20", category: "contrast", notation: "Say *less*.↘ || Mean *more*.↘" },

  // ---------------- Questions ----------------
  { id: "q01", category: "questions", notation: "Are you *coming* tonight?↗" },
  { id: "q02", category: "questions", notation: "Where are we *meeting*?↘" },
  { id: "q03", category: "questions", notation: "Did you finish the *report*?↗" },
  { id: "q04", category: "questions", notation: "What would you *do* | with an extra *morning*?↘" },
  { id: "q05", category: "questions", notation: "Is this the *right* way?↗" },
  { id: "q06", category: "questions", notation: "Why does this *matter* to you?↘" },
  { id: "q07", category: "questions", notation: "Can I *show* you | how it *works*?↗" },
  { id: "q08", category: "questions", notation: "How did you get *started*?↘" },
  { id: "q09", category: "questions", notation: "Do you want the *good* news↗ | or the *bad* news?↘" },
  { id: "q10", category: "questions", notation: "Who told you *that*?↘" },
  { id: "q11", category: "questions", notation: "Have you ever been to *Lisbon*?↗" },
  { id: "q12", category: "questions", notation: "When did you *know*↗ | it was the right *call*?↘" },
  { id: "q13", category: "questions", notation: "Would you do it *again*?↗" },
  { id: "q14", category: "questions", notation: "What's the *one* thing↗ | you'd *change*?↘" },
  { id: "q15", category: "questions", notation: "*Really*?↗ || You've *never* seen it?↗" },
  { id: "q16", category: "questions", notation: "*Which* part↗ | surprised you the *most*?↘" },
  { id: "q17", category: "questions", notation: "Is it *me*,↗ | or is it *cold* in here?↘" },
  { id: "q18", category: "questions", notation: "So what happens *next*?↘" },

  // ---------------- Lists of three ----------------
  { id: "l01", category: "lists", notation: "We need *speed*,↗ | *clarity*,↗ | and *trust*.↘" },
  { id: "l02", category: "lists", notation: "I packed a *jacket*,↗ | a *map*,↗ | and way too many *snacks*.↘" },
  { id: "l03", category: "lists", notation: "*Show* up,↗ | *speak* up,↗ | and *follow* up.↘" },
  { id: "l04", category: "lists", notation: "It was *cheap*,↗ | *fast*,↗ | and *completely* wrong.↘" },
  { id: "l05", category: "lists", notation: "*Read* it,↗ | *mark* it,↗ | then say it out *loud*.↘" },
  { id: "l06", category: "lists", notation: "First the *coffee*,↗ | then the *emails*,↗ | then the *real* work.↘" },
  { id: "l07", category: "lists", notation: "*Monday*,↗ | *Wednesday*,↗ | and *Friday*.↘" },
  { id: "l08", category: "lists", notation: "Be *brief*,↗ | be *clear*,↗ | and then be *quiet*.↘" },
  { id: "l09", category: "lists", notation: "Breathe *in*,↗ | *hold* it,↗ | and let it *go*.↘" },
  { id: "l10", category: "lists", notation: "*Bread*,↗ | *milk*,↗ | and something for *dinner*.↘" },
  { id: "l11", category: "lists", notation: "The food was *good*,↗ | the music was *loud*,↗ | and the company was *perfect*.↘" },
  { id: "l12", category: "lists", notation: "What *happened*,↗ | why it *matters*,↗ | and what we do *next*.↘" },
  { id: "l13", category: "lists", notation: "*Fewer* meetings,↗ | *shorter* emails,↗ | and *longer* weekends.↘" },
  { id: "l14", category: "lists", notation: "He was *funny*,↗ | *generous*,↗ | and *always* late.↘" },
  { id: "l15", category: "lists", notation: "*Past*,↗ | *present*,↗ | and *future*.↘" },
  { id: "l16", category: "lists", notation: "Pick a *line*,↗ | mark the *pauses*,↗ | and read it like you *mean* it.↘" },

  // ---------------- Story beats ----------------
  { id: "s01", category: "story", notation: "And *then* || the lights went *out*.↘" },
  { id: "s02", category: "story", notation: "I opened the *door*.↘ || *Nobody* was there.↘" },
  { id: "s03", category: "story", notation: "It was *three* in the morning | when the phone *rang*.↘" },
  { id: "s04", category: "story", notation: "We had *one* rule:↘ | *never* go in the basement.↘" },
  { id: "s05", category: "story", notation: "She *looked* at me,↗ | *smiled*,↗ | and walked *away*.↘" },
  { id: "s06", category: "story", notation: "For a *second* | *nobody* moved.↘" },
  { id: "s07", category: "story", notation: "That's when I *realized*↗ | I was on the wrong *train*.↘" },
  { id: "s08", category: "story", notation: "The map said ten *minutes*.↘ || It took us *three* hours.↘" },
  { id: "s09", category: "story", notation: "I'd practiced it a *hundred* times.↘ || Then I *forgot* the first line.↘" },
  { id: "s10", category: "story", notation: "{slow It was *quiet*.↘} || Too *quiet*.↘" },
  { id: "s11", category: "story", notation: "Out of *nowhere*,↗ | a dog ran onto the *field*.↘" },
  { id: "s12", category: "story", notation: "We laughed so *hard* | we couldn't *breathe*.↘" },
  { id: "s13", category: "story", notation: "I knocked *twice*,↗ | and then I heard *footsteps*.↘" },
  { id: "s14", category: "story", notation: "{fast We grabbed our bags | and *ran* for the bus.↘}" },
  { id: "s15", category: "story", notation: "Nobody saw it *coming*.↘ || {softer Not even *me*.↘}" },
  { id: "s16", category: "story", notation: "It started as a *joke*.↘ || It ended as a *business*.↘" },
  { id: "s17", category: "story", notation: "The last thing she *said* was,↗ | *don't* be late.↘" },
  { id: "s18", category: "story", notation: "Ten years *later*,↗ | I still think about that *night*.↘" },

  // ---------------- Work ----------------
  { id: "w01", category: "work", notation: "Here's what I'd do *differently* | next *time*.↘" },
  { id: "w02", category: "work", notation: "The *short* version:↘ | we're two weeks *behind*.↘" },
  { id: "w03", category: "work", notation: "I'll *own* that.↘ || It won't happen *again*.↘" },
  { id: "w04", category: "work", notation: "Can we *pause* here↗ | and check we *agree*?↗" },
  { id: "w05", category: "work", notation: "The goal isn't *perfect*.↘ || It's *shipped*.↘" },
  { id: "w06", category: "work", notation: "Let me *summarize*,↗ | so we're on the same *page*.↘" },
  { id: "w07", category: "work", notation: "The numbers are *up*,↗ | but the work isn't *done*.↘" },
  { id: "w08", category: "work", notation: "I have *one* question | before we move *on*.↘" },
  { id: "w09", category: "work", notation: "That's a *fair* point.↘ || Here's where I see it *differently*.↘" },
  { id: "w10", category: "work", notation: "If we *wait*,↗ | it costs *more*.↘" },
  { id: "w11", category: "work", notation: "My *recommendation* | is to start *small*.↘" },
  { id: "w12", category: "work", notation: "We *tried* it.↘ || It *didn't* work.↘" },
  { id: "w13", category: "work", notation: "I'd love your *honest* feedback | on *this*.↘" },
  { id: "w14", category: "work", notation: "What's *blocking* you right now?↘" },
  { id: "w15", category: "work", notation: "Thank you all for being *here*.↘ || Let's get *started*.↘" },
  { id: "w16", category: "work", notation: "The deadline is *Friday*,↗ | {slow not *Monday*.↘}" },
  { id: "w17", category: "work", notation: "I don't have the answer *yet*,↗ | but I'll *find* it.↘" },
  { id: "w18", category: "work", notation: "Good news *first*:↘ | we *hit* the target.↘" },
  { id: "w19", category: "work", notation: "Before we *decide*,↗ | let's hear from *everyone*.↘" },
  { id: "w20", category: "work", notation: "In *one* sentence:↘ | we make scheduling *disappear*.↘" },

  // ---------------- Feelings ----------------
  { id: "f01", category: "feelings", notation: "I was *so* proud of her | I couldn't *speak*.↘" },
  { id: "f02", category: "feelings", notation: "{softer I miss how *easy* it used to be.↘}" },
  { id: "f03", category: "feelings", notation: "I was *terrified*,↗ | and I did it *anyway*.↘" },
  { id: "f04", category: "feelings", notation: "It *hurt*.↘ || I'm not going to *pretend* it didn't.↘" },
  { id: "f05", category: "feelings", notation: "For the first time in *months*,↗ | I felt *light*.↘" },
  { id: "f06", category: "feelings", notation: "I wasn't *angry*.↘ || I was *disappointed*.↘" },
  { id: "f07", category: "feelings", notation: "That *moment* | still makes me *smile*.↘" },
  { id: "f08", category: "feelings", notation: "I didn't expect to *cry*.↘ || {softer But I *did*.↘}" },
  { id: "f09", category: "feelings", notation: "My heart was *pounding* | before I even said a *word*.↘" },
  { id: "f10", category: "feelings", notation: "I felt like I *belonged* there.↘" },
  { id: "f11", category: "feelings", notation: "It was *relief*,↗ | more than *anything*.↘" },
  { id: "f12", category: "feelings", notation: "I was *jealous*,↗ | and I *hated* that.↘" },
  { id: "f13", category: "feelings", notation: "{louder I *did* it!↘}" },
  { id: "f14", category: "feelings", notation: "I keep *replaying* it | in my *head*.↘" },
  { id: "f15", category: "feelings", notation: "{slow I just *sat* there,↗ | not sure what to *feel*.↘}" },
  { id: "f16", category: "feelings", notation: "It *surprised* me | how *calm* I was.↘" },
  { id: "f17", category: "feelings", notation: "I didn't know how much I *needed* that.↘" },
  { id: "f18", category: "feelings", notation: "I felt *seen*.↘ || That's the *only* word for it.↘" },

  // ---------------- Quotes (public domain) ----------------
  { id: "p01", category: "quotes", credit: "Shakespeare, Hamlet", notation: "To *be*,↗ | or *not* to be,↗ | that is the *question*.↘" },
  { id: "p02", category: "quotes", credit: "Shakespeare, As You Like It", notation: "All the world's a *stage*,↗ | and all the men and *women* | merely *players*.↘" },
  { id: "p03", category: "quotes", credit: "Shakespeare, Julius Caesar", notation: "The *fault*,↗ | dear *Brutus*,↗ | is not in our *stars*,↗ | but in *ourselves*.↘" },
  { id: "p04", category: "quotes", credit: "Shakespeare, Julius Caesar", notation: "*Friends*,↗ | *Romans*,↗ | *countrymen*,↗ | lend me your *ears*.↘" },
  { id: "p05", category: "quotes", credit: "Shakespeare, Twelfth Night", notation: "Some are born *great*,↗ | some *achieve* greatness,↗ | and some have greatness *thrust* upon them.↘" },
  { id: "p06", category: "quotes", credit: "Shakespeare, Hamlet", notation: "We know what we *are*,↗ | but know not what we *may* be.↘" },
  { id: "p07", category: "quotes", credit: "Abraham Lincoln, 1858", notation: "A house divided against *itself* | cannot *stand*.↘" },
  { id: "p08", category: "quotes", credit: "Abraham Lincoln, Gettysburg Address", notation: "The world will little *note*,↗ | nor long remember what we *say* here,↗ | but it can *never* forget | what they *did* here.↘" },
  { id: "p09", category: "quotes", credit: "Charles Dickens, A Tale of Two Cities", notation: "It was the *best* of times,↗ | it was the *worst* of times.↘" },
  { id: "p10", category: "quotes", credit: "Jane Austen, Pride and Prejudice", notation: "It is a truth universally *acknowledged*,↗ | that a single man in possession of a good *fortune*,↗ | must be in want of a *wife*.↘" },
  { id: "p11", category: "quotes", credit: "Franklin D. Roosevelt, 1933", notation: "The only thing we have to *fear* | is fear *itself*.↘" },
  { id: "p12", category: "quotes", credit: "John F. Kennedy, 1961", notation: "Ask *not* | what your country can do for *you* — || ask what *you* can do | for your *country*.↘" },
  { id: "p13", category: "quotes", credit: "Frederick Douglass, 1857", notation: "If there is *no* struggle,↗ | there is *no* progress.↘" },
  { id: "p14", category: "quotes", credit: "Henry David Thoreau, Walden", notation: "I went to the *woods* | because I wished to live *deliberately*.↘" },
  { id: "p15", category: "quotes", credit: "Ralph Waldo Emerson, Circles", notation: "*Nothing* great was ever achieved | without *enthusiasm*.↘" },
  { id: "p16", category: "quotes", credit: "Benjamin Franklin, Poor Richard's Almanack", notation: "Well *done* | is better than well *said*.↘" },
  { id: "p17", category: "quotes", credit: "Mark Twain, Pudd'nhead Wilson", notation: "Courage is resistance to *fear*,↗ | *mastery* of fear — | *not* absence of fear.↘" },
  { id: "p18", category: "quotes", credit: "Abraham Lincoln, Second Inaugural", notation: "With malice toward *none*,↗ | with charity for *all*.↘" },
];

export interface Line extends MarkedText {
  id: string;
  category: LineCategory;
  credit?: string;
  sentences: number;
  wordCount: number;
}

let parsed: Line[] | null = null;

export function getLines(): Line[] {
  if (!parsed) {
    parsed = RAW.map((raw) => {
      const marked = parseNotation(raw.notation);
      return {
        id: raw.id,
        category: raw.category,
        credit: raw.credit,
        ...marked,
        sentences: countSentences(marked.text),
        wordCount: marked.text.split(/\s+/).length,
      };
    });
  }
  return parsed;
}
