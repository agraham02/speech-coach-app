import type { Scenario } from "./conversationContent";

// Who the partner is in a live conversation (Tono Plus). The opening line
// comes from the scripted drills (conversationContent.ts), so every opener a
// free drill uses can also start a live conversation; this file adds who is
// saying it, where, and in which voice. The server's prompt improvises the
// rest in character (supabase/functions/_shared/prompts/conversation.ts).
//
// Names are deliberately ones that suit any voice, so a voice never sounds
// wrong for its name. Tone rules are the same as conversationContent.ts:
// everyday and warm; dates are friendly and respectful.

export interface LivePersona {
  name: string;
  role: string;
  mood?: string;
  // A Gemini voice (domain/conversation/live/voices.ts).
  voice: string;
}

export interface LiveSetting {
  setting: string;
  personas: LivePersona[];
}

export const LIVE_SETTINGS: Record<Exclude<Scenario, "group">, LiveSetting> = {
  work: {
    setting: "At work, by the coffee machine, on an ordinary weekday",
    personas: [
      { name: "Alex", role: "a coworker from another team you know a little", voice: "Achird" },
      { name: "Sam", role: "a friendly coworker who sits near you", mood: "in a good mood", voice: "Sulafat" },
      { name: "Jordan", role: "a coworker you mostly know from meetings", voice: "Umbriel" },
    ],
  },
  party: {
    setting: "At a house party, in the kitchen, where you've just met",
    personas: [
      { name: "Riley", role: "a guest you've just been introduced to", mood: "relaxed and chatty", voice: "Callirrhoe" },
      { name: "Casey", role: "a friend of the host", voice: "Zubenelgenubi" },
      { name: "Morgan", role: "someone standing near the snacks", mood: "a little tired but friendly", voice: "Achird" },
    ],
  },
  friends: {
    setting: "Catching up with a friend at a cafe",
    personas: [
      { name: "Jamie", role: "a good friend you haven't seen for a couple of weeks", voice: "Sulafat" },
      { name: "Taylor", role: "a friend from an old class", mood: "upbeat", voice: "Sadachbia" },
    ],
  },
  date: {
    setting: "On a first date at a quiet coffee place: friendly and relaxed",
    personas: [
      { name: "Robin", role: "your date, who seems easygoing", voice: "Vindemiatrix" },
      { name: "Avery", role: "your date, warm and a little nervous too", voice: "Umbriel" },
    ],
  },
  outsider: {
    setting: "At a friend's dinner, talking with someone about their work",
    personas: [
      { name: "Drew", role: "someone who loves talking about their job", voice: "Sadaltager" },
      { name: "Quinn", role: "a guest who works in a field you don't know", voice: "Charon" },
    ],
  },
};

// "Land the plane" style conversations open with a question, from someone
// who's just curious.
export const QUESTION_SETTING: LiveSetting = {
  setting: "Chatting with someone you've just met at a friend's barbecue",
  personas: [
    { name: "Parker", role: "a friendly guest who asks a lot of questions", voice: "Achird" },
    { name: "Sky", role: "a neighbor of the host", voice: "Callirrhoe" },
  ],
};

// A sample of what a live conversation sounds like, shown to people without
// Plus next to the lesson (so they know what the exercise is). Written for
// the app; not a real recording.
export const SAMPLE_CONVERSATION: { who: "partner" | "you"; text: string }[] = [
  { who: "partner", text: "I just got back from a week in Portugal. The food was unreal." },
  { who: "you", text: "Oh nice. What was the best thing you ate?" },
  { who: "partner", text: "Honestly? These little custard tarts. I had one every single morning." },
  { who: "you", text: "Every morning? Okay, where was the best one?" },
  { who: "partner", text: "A tiny bakery in Lisbon. There was a line around the block at eight a.m." },
];
