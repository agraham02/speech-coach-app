// Digit <-> word conversion for 0-999 plus ordinals. Speech recognizers
// (iOS's formattedString especially) routinely render spoken numbers as
// digits ("two" -> "2", "sixth" -> "6th"), so the aligner needs every
// numeric token's spoken readings to compare against a word-only target.

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

const IRREGULAR_ORDINALS: Record<string, string> = {
  one: "first",
  two: "second",
  three: "third",
  five: "fifth",
  eight: "eighth",
  nine: "ninth",
  twelve: "twelfth",
};

// Returns the spoken words for 0-999, or null outside that range.
export function cardinalWords(n: number): string[] | null {
  if (!Number.isInteger(n) || n < 0 || n > 999) return null;
  if (n < 20) return [ONES[n]];
  if (n < 100) {
    const tens = TENS[Math.floor(n / 10)];
    return n % 10 === 0 ? [tens] : [tens, ONES[n % 10]];
  }
  const hundreds = [ONES[Math.floor(n / 100)], "hundred"];
  const rest = n % 100;
  if (rest === 0) return hundreds;
  return [...hundreds, ...(cardinalWords(rest) ?? [])];
}

export function ordinalWords(n: number): string[] | null {
  const words = cardinalWords(n);
  if (!words) return null;
  const last = words[words.length - 1];
  let ordinal: string;
  if (IRREGULAR_ORDINALS[last]) ordinal = IRREGULAR_ORDINALS[last];
  else if (last.endsWith("y")) ordinal = `${last.slice(0, -1)}ieth`;
  else ordinal = `${last}th`;
  return [...words.slice(0, -1), ordinal];
}

// Every plausible spoken form of a numeric token, each concatenated with no
// spaces so it can be compared against a merged multi-word target span:
//   "11"  -> ["eleven", "oneone"]   (digit-by-digit covers "One-one")
//   "6th" -> ["sixth"]
// Returns [] for tokens that aren't numeric.
export function numericReadings(token: string): string[] {
  const ordinalMatch = /^(\d{1,3})(st|nd|rd|th)$/.exec(token);
  if (ordinalMatch) {
    const words = ordinalWords(Number(ordinalMatch[1]));
    return words ? [words.join("")] : [];
  }
  if (!/^\d+$/.test(token)) return [];
  const readings = new Set<string>();
  const cardinal = cardinalWords(Number(token));
  if (cardinal) readings.add(cardinal.join(""));
  if (token.length > 1) {
    readings.add(token.split("").map((digit) => ONES[Number(digit)]).join(""));
  }
  return [...readings];
}
