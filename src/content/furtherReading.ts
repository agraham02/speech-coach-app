import { SOURCE_GROUPS } from "./sources";

// "Where to go from here" on the path finale: books and coaches the
// curriculum already leans on (content/sources.ts), picked for someone who
// wants to keep growing as a speaker. No research papers and no textbooks.
//
// Store rules this list keeps to (see the PR notes): plain references in
// our own words, no cover art or logos, no affiliate or shop links, links
// only to the author's or organization's own site, and a line saying Tono
// has no tie to any of them. A test checks every entry traces to a source.

export interface FurtherReading {
  // The work's title, or the person or organization for a coach or club.
  title: string;
  by: string | null;
  kind: "book" | "coach" | "club" | "listen";
  // Why it's worth your time after Tono, in a sentence.
  why: string;
  url?: string;
}

const urlFor = (needle: string): string | undefined =>
  SOURCE_GROUPS.flatMap((g) => g.sources).find((s) => s.citation.includes(needle))?.url;

export const FURTHER_READING: FurtherReading[] = [
  {
    title: "Think Faster, Talk Smarter",
    by: "Matt Abrahams",
    kind: "book",
    why: "Structure for speaking on the spot, from the coach behind What, so what, now what.",
    url: urlFor("Think Faster, Talk Smarter"),
  },
  {
    title: "Talk",
    by: "Alison Wood Brooks",
    kind: "book",
    why: "The science of conversation behind the TALK lessons, told with plenty of stories.",
  },
  {
    title: "Captivate",
    by: "Vanessa Van Edwards",
    kind: "book",
    why: "Practical moves for warmer conversations, sparks and stories included.",
    url: urlFor("Captivate"),
  },
  {
    title: "Impro",
    by: "Keith Johnstone",
    kind: "book",
    why: "The classic on spontaneity: accepting offers, and why trying to be clever gets in the way.",
  },
  {
    title: "Freeing the Natural Voice",
    by: "Kristin Linklater",
    kind: "book",
    why: "A deeper course in breath and voice, if the breath lessons were your favorite.",
  },
  {
    title: "Vinh Giang",
    by: null,
    kind: "coach",
    why: "Vocal variety, pausing and self-review, the ideas behind the five vocal foundations.",
    url: urlFor("Vinh Giang"),
  },
  {
    title: "Reece J.M (@progress.playground)",
    by: null,
    kind: "coach",
    why: "Short speech drills like Word Chain and Mark It Up, with new ones often.",
    url: urlFor("progress.playground"),
  },
  {
    title: "Toastmasters International",
    by: null,
    kind: "club",
    why: "A local club gives you a real room and real listeners every week, the one thing an app can't.",
    url: urlFor("Toastmasters"),
  },
  {
    title: "Just a Minute",
    by: "BBC Radio 4",
    kind: "listen",
    why: "Sixty seconds without hesitation, repetition or deviation. Funny, and a masterclass in recovery.",
    url: urlFor("Just a Minute"),
  },
];

export const FURTHER_READING_NOTE = "Tono has no tie to any of these authors or organizations, and none of these links earn us anything.";
