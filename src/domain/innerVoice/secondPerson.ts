// Says something you like about yourself the way a friend would — "you",
// and your name — rather than "I". Talking to yourself in the second person
// or by name (distanced self-talk) lowered speech anxiety and improved how
// the speeches were rated in Kross et al. (2014). Pure; a best-effort
// rewrite, not grammar.

const FIRST_PERSON = /\b(I|i|I'm|i'm|I've|I'd|I'll|my|me|myself|mine)\b/;

// A starting word that is a verb, so "listen well" reads "you listen well"
// rather than "you're listen well".
const VERBS = new Set([
  "listen", "show", "make", "keep", "try", "care", "work", "help", "learn", "speak", "think", "stay", "bring", "notice",
  "remember", "ask", "give", "take", "laugh", "love", "handle", "find", "build", "say", "tell", "can", "always", "never",
  "do", "don't", "have", "get", "turn", "stand", "show", "see", "know", "use", "share", "admit", "respect", "forgive",
]);

const SWAPS: [RegExp, string][] = [
  [/\bI'm\b/gi, "you're"],
  [/\bI am\b/gi, "you're"],
  [/\bI've\b/gi, "you've"],
  [/\bI have\b/gi, "you have"],
  [/\bI'd\b/gi, "you'd"],
  [/\bI'll\b/gi, "you'll"],
  [/\bI was\b/gi, "you were"],
  [/\bmyself\b/gi, "yourself"],
  [/\bmine\b/gi, "yours"],
  [/\bmy\b/gi, "your"],
  [/\bme\b/gi, "you"],
  [/\bI\b/g, "you"],
  // Phones often leave a lone "i" lowercase.
  [/\bi\b/g, "you"],
];

const capitalize = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);

export function toSecondPerson(text: string, name?: string | null): string {
  let s = text.trim().replace(/[’‘]/g, "'").replace(/[.!\s]+$/, "");
  if (!s) return "";

  if (FIRST_PERSON.test(s)) {
    for (const [pattern, replacement] of SWAPS) s = s.replace(pattern, replacement);
  } else if (!/^you\b/i.test(s)) {
    s = s[0].toLowerCase() + s.slice(1);
    const first = s.split(/\s+/)[0];
    if (first.endsWith("ing") && first.length > 4) s = `you're good at ${s}`;
    else if (VERBS.has(first)) s = `you ${s}`;
    else s = `you're ${s}`;
  }
  // "you" opens the sentence in lower case, so a name can lead it.
  s = s.replace(/^You\b/, "you");
  s = s[0].toLowerCase() + s.slice(1);

  const who = name?.trim();
  return who ? `${who}, ${s}.` : `${capitalize(s)}.`;
}
