// Prompts for "Three things" — angles to look at yourself from when nothing
// comes to mind. They only nudge; any answer is fine.

export interface ThreeThingsPrompt {
  id: string;
  label: string;
  hint: string;
}

export const THREE_THINGS_PROMPTS: ThreeThingsPrompt[] = [
  { id: "people", label: "How you treat people", hint: "A time you were kind, patient or fair to someone." },
  { id: "skill", label: "Something you're good at", hint: "A skill, big or small — something you can do well." },
  { id: "voice", label: "Your voice", hint: "Something about how you sound, or what you say, that works." },
  { id: "value", label: "What you care about", hint: "A value you act on, even when it's hard." },
  { id: "today", label: "Something you handled today", hint: "A small thing that went fine because of you." },
  { id: "growth", label: "How you've grown", hint: "Something you do now that you couldn't, or wouldn't, before." },
  { id: "others", label: "What others say", hint: "Something someone has said they appreciate about you." },
];
