// The cases the phone tests its own meaning check on before it trusts it
// (docs/overhaul/PLAN.md, sections 6.5 and 6.6). The first four word chains are
// spikes/inference-eval/cases_synthetic.json, word_chain (a test keeps the two in
// step); the rest were written for this check. No user data.

import type { GoldLink, TopicCase } from "./meaning";
import { goldLinks } from "./meaning";

export const WORD_CHAIN_GOLD: { id: string; words: string[]; gold: string[] }[] = [
  { id: "chain_all_good", words: ["pen","ink","octopus","aquarium","fish","chips","salsa","dance","music","guitar"], gold: ["strong","strong","strong","strong","strong","strong","strong","strong","strong"] },
  { id: "chain_with_breaks", words: ["dog","bone","skeleton","halloween","pumpkin","carburetor","engine","refrigerator","cold","ice"], gold: ["strong","strong","strong","strong","none","strong","loose|none","strong","strong"] },
  { id: "chain_puns_and_breaks", words: ["sun","beach","sand","glass","window","house","mortgage","bank","river","stone","banana"], gold: ["strong","strong","strong","strong","strong","strong","strong","strong","strong","none"] },
  { id: "chain_loose_and_random", words: ["coffee","morning","alarm","fire","truck","pizza","cheese","moon","astronaut","purple","keyboard"], gold: ["strong","strong","strong","strong","loose|strong","strong","loose|strong","strong","none","none"] },
  // Written for this check.
  { id: "extra_good", words: ["king", "queen", "castle", "knight", "sword", "blade", "knife", "fork", "spoon", "soup"], gold: ["strong", "strong", "strong", "strong", "strong", "strong", "strong", "strong", "strong"] },
  { id: "extra_broken", words: ["rain", "umbrella", "cloud", "tractor", "wheat", "bread", "violin", "soup", "hat", "helmet"], gold: ["strong", "loose|strong", "none", "loose|strong", "strong", "none", "none", "none", "strong"] },
  { id: "extra_random", words: ["school", "teacher", "blue", "whale", "ocean", "submarine", "penguin", "tax", "calendar", "month"], gold: ["strong", "none", "loose|strong", "strong", "strong", "loose|none", "none", "loose|none", "strong"] },
];

export const WORD_CHAIN_LINKS: GoldLink[] = goldLinks(WORD_CHAIN_GOLD);

// ---------------------------------------------------------------------------
// Words in a category: "table" isn't an animal
// ---------------------------------------------------------------------------

// The one word the phone compares each category's answers to. A category with no
// anchor can't be checked, which is "not checked", never a failure.
export const CATEGORY_ANCHORS: Record<string, string> = {
  animals: "animal",
  foods: "food",
  clothes: "clothing",
  kitchen: "kitchen",
  jobs: "job",
  sports: "sport",
  countries: "country",
  verbs_move: "move",
  emotions: "emotion",
  tools: "tool",
  weather: "weather",
  instruments: "instrument",
  office: "office",
};

export interface CategoryCase {
  category: string;
  yes: string[];
  no: string[];
}

export const CATEGORY_GOLD: CategoryCase[] = [
  { category: "animals", yes: ["dog", "elephant", "sparrow", "salmon", "tiger"], no: ["table", "justice", "carburetor", "umbrella", "tuesday"] },
  { category: "foods", yes: ["bread", "apple", "cheese", "noodles", "omelette"], no: ["hammer", "cloud", "lighthouse", "mortgage", "violin"] },
  { category: "jobs", yes: ["nurse", "plumber", "teacher", "pilot", "farmer"], no: ["banana", "thunder", "pillow", "purple", "river"] },
  { category: "sports", yes: ["tennis", "soccer", "swimming", "hockey", "boxing"], no: ["toaster", "spoon", "carpet", "eyebrow", "sofa"] },
  { category: "emotions", yes: ["anger", "joy", "jealousy", "grief", "pride"], no: ["bicycle", "staircase", "cabbage", "ladder", "teapot"] },
];

// ---------------------------------------------------------------------------
// A take about its prompt
// ---------------------------------------------------------------------------

export const TOPIC_GOLD: TopicCase[] = [
  { kind: "on", prompt: "Describe a time you overcame a challenge.", answer: "Last year I had to give a presentation to my whole department and I was terrified. I practiced every night in front of my sister. On the day my hands were shaking, but I kept going, and by the end people were asking questions. It was the hardest thing I did all year and it taught me I can get through nerves." },
  { kind: "off", prompt: "Describe a time you overcame a challenge.", answer: "The best way to cook rice is to rinse it three times first. Then you add one and a half cups of water for every cup of rice and bring it to a boil. After that you turn it down low, cover the pot, and leave it alone for fifteen minutes." },
  { kind: "gibberish", prompt: "Describe a time you overcame a challenge.", answer: "Window purple the of seven under banana quickly. Table carpet moon because of the sideways. Ladder ladder yes the cheese tomorrow orbit. Spoon and the noisy never elephant." },
  { kind: "on", prompt: "What makes a good teacher?", answer: "A good teacher is patient and explains the same idea in more than one way. They notice when someone is lost without making them feel small. The best one I had made every student feel the subject was worth caring about, and she was always honest when she did not know something." },
  { kind: "off", prompt: "What makes a good teacher?", answer: "Yesterday the train was late again so I walked to the office in the rain. I forgot my umbrella and my shoes were soaked through. Then the coffee machine broke and I had to go across the street to buy a cup." },
  { kind: "gibberish", prompt: "What makes a good teacher?", answer: "Orange running the because lamp is thirteen. Mountain softly under the sandwich of bicycle. Tuesday green the answer knife quietly river. Stairs and and the purple tomorrow." },
  { kind: "on", prompt: "Tell us about your favorite place to travel.", answer: "My favorite place is a small fishing town on the coast of Portugal. I love the early mornings when the boats come in and the whole harbor smells of salt and grilled sardines. The streets are narrow and steep, and every evening everyone gathers by the water to watch the sunset." },
  { kind: "off", prompt: "Tell us about your favorite place to travel.", answer: "To change a flat tire, first loosen the lug nuts before you lift the car. Then place the jack under the frame and raise the vehicle. Take off the wheel, put on the spare, and tighten the nuts in a star pattern." },
  { kind: "gibberish", prompt: "Tell us about your favorite place to travel.", answer: "Coffee under the nineteen slowly of keyboard. Dragon the whenever sideways pencil is ocean. Blue blue nothing the plus jacket elevator. Clock and the loudly seven window." },
  { kind: "on", prompt: "Explain why sleep matters.", answer: "Sleep is when the body repairs itself and the brain sorts what it learned during the day. Without enough of it, attention drops, mood gets worse, and memory suffers. Over years, poor sleep is linked to heart problems and weaker immunity, so it is as important as food or exercise." },
  { kind: "off", prompt: "Explain why sleep matters.", answer: "My cousin's wedding is in June and we still have not picked the venue. The caterer wants a deposit by next week. We are also trying to decide between a band and a DJ, and my aunt has strong opinions about the flowers." },
  { kind: "gibberish", prompt: "Explain why sleep matters.", answer: "Fork the yellow around of tomorrow seven. Hat quickly umbrella the because moon river. Notebook the green and sideways lamp cheese. Staircase never the purple and orbit." },
];
