// Practice material for the Conversation skill. Original lines written for
// this app. A "partner" is the phone speaking (expo-speech); `threads` are
// the words a good follow-up could pick up — what the reply is checked for.
//
// Tone rules for anything added here: everyday and warm; dating lines are
// friendly and respectful, never pressure or "lines"; nothing that makes a
// stumble feel like a failure.

export type PartnerVoice = "a" | "b" | "c";

export interface PartnerLine {
  voice: PartnerVoice;
  text: string;
}

export type Scenario = "work" | "party" | "outsider" | "friends" | "date" | "group";

export interface PartnerItem {
  id: string;
  scenario: Exclude<Scenario, "group">;
  level: 1 | 2 | 3;
  text: string;
  threads: string[];
}

export const PARTNER_ITEMS: PartnerItem[] = [
  // --- work ---
  { id: "pw01", scenario: "work", level: 1, text: "I just got back from a week in Portugal. The food was unreal.", threads: ["portugal", "food", "week"] },
  { id: "pw02", scenario: "work", level: 1, text: "I finally finished that report. I've been staring at spreadsheets all week.", threads: ["report", "spreadsheets"] },
  { id: "pw03", scenario: "work", level: 1, text: "My commute was a mess this morning. The train just stopped in a tunnel for twenty minutes.", threads: ["commute", "train", "tunnel"] },
  { id: "pw04", scenario: "work", level: 2, text: "We're interviewing for a new designer, and honestly the best candidate so far was the one with the least experience.", threads: ["designer", "candidate", "experience", "interviewing"] },
  { id: "pw05", scenario: "work", level: 2, text: "I started coming in an hour early. It's the only time the office is quiet enough to think.", threads: ["early", "quiet", "office", "think"] },
  { id: "pw06", scenario: "work", level: 2, text: "Our team switched to four-day weeks last month, and I'm still not sure if I love it or if I'm just tired on Fridays.", threads: ["four day", "team", "fridays", "weeks"] },
  { id: "pw07", scenario: "work", level: 3, text: "I got asked to lead the new project, which is great, except half the people on it are senior to me.", threads: ["lead", "project", "senior"] },
  { id: "pw08", scenario: "work", level: 3, text: "I've been mentoring an intern, and she asked me a question last week that I genuinely couldn't answer.", threads: ["mentoring", "intern", "question"] },
  { id: "pw09", scenario: "work", level: 1, text: "Someone brought homemade banana bread in today. It was gone in ten minutes.", threads: ["banana bread", "homemade"] },
  { id: "pw10", scenario: "work", level: 2, text: "I'm trying to learn to code on the side. It's slow, but I built my first little app last weekend.", threads: ["code", "app", "learn"] },

  // --- party ---
  { id: "pp01", scenario: "party", level: 1, text: "I know the host from a pottery class, of all places.", threads: ["host", "pottery", "class"] },
  { id: "pp02", scenario: "party", level: 1, text: "I just moved here from Chicago, so I barely know anyone yet.", threads: ["chicago", "moved"] },
  { id: "pp03", scenario: "party", level: 1, text: "I ran my first half marathon on Sunday. My legs still hate me.", threads: ["half marathon", "marathon", "legs", "sunday"] },
  { id: "pp04", scenario: "party", level: 2, text: "I've been trying to cook one new recipe every week. Last night was a complete disaster.", threads: ["recipe", "cook", "disaster"] },
  { id: "pp05", scenario: "party", level: 2, text: "I spent the summer volunteering at an animal shelter. I came very close to adopting three dogs.", threads: ["shelter", "dogs", "volunteering", "adopting"] },
  { id: "pp06", scenario: "party", level: 2, text: "I'm planning a road trip up the coast, but I can't decide whether to camp or stay in motels.", threads: ["road trip", "coast", "camp", "motels"] },
  { id: "pp07", scenario: "party", level: 3, text: "I quit my job last year to try making furniture full time, and some weeks I'm not sure it was smart.", threads: ["furniture", "quit", "job", "full time"] },
  { id: "pp08", scenario: "party", level: 3, text: "I grew up in a tiny town where everyone knew your business, so a city this size still feels strange.", threads: ["tiny town", "town", "city", "grew up"] },
  { id: "pp09", scenario: "party", level: 1, text: "This is the first party I've been to in months. I forgot how loud they are.", threads: ["party", "months", "loud"] },
  { id: "pp10", scenario: "party", level: 2, text: "I just got back into rock climbing after an injury. My fingers are not happy with me.", threads: ["rock climbing", "climbing", "injury", "fingers"] },

  // --- friends ---
  { id: "pf01", scenario: "friends", level: 1, text: "I finally watched that show everyone's been talking about. I don't get the hype.", threads: ["show", "hype", "watched"] },
  { id: "pf02", scenario: "friends", level: 1, text: "My little brother just got his driver's license. I'm scared for everyone on the road.", threads: ["brother", "license", "driver"] },
  { id: "pf03", scenario: "friends", level: 1, text: "I've been getting up at six to go to the gym. Day four and I'm already negotiating with myself.", threads: ["gym", "six", "day four"] },
  { id: "pf04", scenario: "friends", level: 2, text: "My grandmother started texting me memes. She's better at it than I am.", threads: ["grandmother", "memes", "texting"] },
  { id: "pf05", scenario: "friends", level: 2, text: "I tried to fix my sink by myself with a video tutorial. The kitchen is now partly underwater.", threads: ["sink", "tutorial", "kitchen", "fix"] },
  { id: "pf06", scenario: "friends", level: 2, text: "I've been thinking about getting a cat, but my landlord is weird about pets.", threads: ["cat", "landlord", "pets"] },
  { id: "pf07", scenario: "friends", level: 3, text: "I'm thinking about going back to school, but starting over at this point feels kind of terrifying.", threads: ["school", "starting over", "terrifying"] },
  { id: "pf08", scenario: "friends", level: 3, text: "My parents are selling the house I grew up in, and I didn't expect it to hit me this hard.", threads: ["parents", "house", "selling", "grew up"] },
  { id: "pf09", scenario: "friends", level: 1, text: "I found a twenty-dollar bill in a jacket I haven't worn since last winter.", threads: ["twenty", "jacket", "winter"] },
  { id: "pf10", scenario: "friends", level: 2, text: "I signed up for a cooking class and the instructor is extremely intense about onions.", threads: ["cooking class", "instructor", "onions"] },

  // --- date (friendly, respectful) ---
  { id: "pd01", scenario: "date", level: 1, text: "I almost didn't come tonight because I got lost finding this place.", threads: ["lost", "place", "tonight"] },
  { id: "pd02", scenario: "date", level: 1, text: "I spent the whole weekend reorganizing my bookshelf by color. It looks great and I can't find anything.", threads: ["bookshelf", "color", "weekend"] },
  { id: "pd03", scenario: "date", level: 1, text: "I'm a terrible cook, but I make one really good pasta dish.", threads: ["cook", "pasta"] },
  { id: "pd04", scenario: "date", level: 2, text: "I've been learning Spanish on an app, and I'm pretty sure I can only order coffee and ask where the library is.", threads: ["spanish", "app", "coffee", "library"] },
  { id: "pd05", scenario: "date", level: 2, text: "My friends say I'm way too competitive about board games. I don't think that's fair, but I also never lose.", threads: ["board games", "competitive", "friends"] },
  { id: "pd06", scenario: "date", level: 2, text: "I went to a concert alone last month for the first time, and honestly it was one of the best nights I've had.", threads: ["concert", "alone", "best nights"] },
  { id: "pd07", scenario: "date", level: 3, text: "I used to be really shy, so I joined an improv class to get over it. It worked, mostly.", threads: ["shy", "improv", "class"] },
  { id: "pd08", scenario: "date", level: 3, text: "I have a rule that I say yes to one thing a month that scares me a little. This month it was karaoke.", threads: ["rule", "scares", "karaoke", "month"] },
  { id: "pd09", scenario: "date", level: 1, text: "This is my favorite coffee place. The owner remembers everyone's order.", threads: ["coffee", "owner", "order", "favorite"] },
  { id: "pd10", scenario: "date", level: 2, text: "I just got back from visiting my sister. Her kids decided I'm their personal jungle gym.", threads: ["sister", "kids", "jungle gym", "visiting"] },

  // --- outsider: shop talk you don't know (be the curious outsider) ---
  { id: "po01", scenario: "outsider", level: 1, text: "We're moving the whole fleet to a new dispatch system, and the routing keeps choking on rural addresses.", threads: ["dispatch", "routing", "rural", "fleet", "addresses"] },
  { id: "po02", scenario: "outsider", level: 1, text: "The worst part of being a dental hygienist is when people say they floss every day and their gums tell a very different story.", threads: ["hygienist", "floss", "gums", "dental"] },
  { id: "po03", scenario: "outsider", level: 1, text: "In wine, a cool year means more acidity. Everyone wants the hot vintages, but the cool ones age better.", threads: ["wine", "acidity", "vintages", "cool year"] },
  { id: "po04", scenario: "outsider", level: 2, text: "Our audit found the inventory numbers were off by two percent, which sounds small until you see what it is in dollars.", threads: ["audit", "inventory", "two percent", "dollars"] },
  { id: "po05", scenario: "outsider", level: 2, text: "As a pilot, the landing isn't the hard part. It's the crosswind on the final approach that keeps you honest.", threads: ["pilot", "landing", "crosswind", "approach"] },
  { id: "po06", scenario: "outsider", level: 2, text: "We had a sprint retro today and the whole team agreed the standups have turned into status reports.", threads: ["sprint", "retro", "standups", "status reports"] },
  { id: "po07", scenario: "outsider", level: 3, text: "In ER nursing, triage is the whole game. The loudest patient is almost never the sickest one.", threads: ["triage", "nursing", "patient", "loudest"] },
  { id: "po08", scenario: "outsider", level: 3, text: "Our lab finally got the protein to crystallize after eight months, so now we can actually see its structure.", threads: ["protein", "crystallize", "lab", "structure"] },
  { id: "po09", scenario: "outsider", level: 3, text: "In commercial real estate right now, everyone wants to convert old offices into apartments, but the plumbing makes it a nightmare.", threads: ["real estate", "offices", "apartments", "plumbing"] },
  { id: "po10", scenario: "outsider", level: 2, text: "Working in a bakery, the bread has to go in at four a.m., so my whole life runs about six hours ahead of yours.", threads: ["bakery", "bread", "four", "hours"] },
];

// Two or three voices chatting; you join after each exchange.
export interface GroupScene {
  id: string;
  level: 1 | 2 | 3;
  title: string;
  exchanges: { lines: PartnerLine[]; threads: string[] }[];
}

export const GROUP_SCENES: GroupScene[] = [
  {
    id: "gs01",
    level: 1,
    title: "After-work drinks",
    exchanges: [
      { lines: [{ voice: "a", text: "Did anyone else's meeting run way over today?" }, { voice: "b", text: "Mine went an hour long. It could have been an email." }], threads: ["meeting", "email", "hour"] },
      { lines: [{ voice: "a", text: "Anyway, I'm trying a new taco place this weekend." }, { voice: "b", text: "The one on Fifth? I heard the line is ridiculous." }], threads: ["taco", "weekend", "line", "fifth"] },
      { lines: [{ voice: "b", text: "Speaking of food, I've been trying to cook more." }, { voice: "a", text: "Says the person who burned rice last week. Rice." }], threads: ["cook", "rice", "burned"] },
      { lines: [{ voice: "a", text: "So, any plans for the long weekend?" }, { voice: "b", text: "I'm thinking about a cabin, if I can get the time off." }], threads: ["long weekend", "cabin", "time off"] },
    ],
  },
  {
    id: "gs02",
    level: 2,
    title: "Someone else's coworkers",
    exchanges: [
      { lines: [{ voice: "a", text: "The new project manager wants a dashboard for everything." }, { voice: "b", text: "We spent a week building one nobody opens." }], threads: ["project manager", "dashboard", "week"] },
      { lines: [{ voice: "b", text: "At least the offsite is coming up." }, { voice: "a", text: "Last year's had a ropes course. I am not doing that again." }], threads: ["offsite", "ropes course", "last year"] },
      { lines: [{ voice: "a", text: "Did you see the game last night?" }, { voice: "c", text: "I fell asleep at halftime, which tells you how it went." }], threads: ["game", "halftime", "asleep"] },
      { lines: [{ voice: "c", text: "I'm thinking about switching teams internally." }, { voice: "a", text: "Data team? They have the best snacks, honestly." }], threads: ["switching teams", "data team", "snacks"] },
    ],
  },
  {
    id: "gs03",
    level: 2,
    title: "Birthday dinner",
    exchanges: [
      { lines: [{ voice: "a", text: "I can't believe she's turning thirty." }, { voice: "b", text: "She made us promise no singing waiters." }], threads: ["thirty", "singing", "waiters"] },
      { lines: [{ voice: "b", text: "Has anyone been to that new bouldering gym?" }, { voice: "a", text: "Once. My forearms didn't work for two days." }], threads: ["bouldering", "gym", "forearms"] },
      { lines: [{ voice: "a", text: "I'm finally taking a real vacation next month." }, { voice: "b", text: "Somewhere with no phone signal, I hope." }], threads: ["vacation", "next month", "phone signal"] },
    ],
  },
  {
    id: "gs04",
    level: 3,
    title: "Neighborhood barbecue",
    exchanges: [
      { lines: [{ voice: "a", text: "The city is finally fixing the road on Elm." }, { voice: "c", text: "Only took them three years and a petition." }], threads: ["road", "elm", "petition", "city"] },
      { lines: [{ voice: "c", text: "Our garden got destroyed by rabbits this year." }, { voice: "a", text: "Try marigolds around the edge. My mom swears by them." }], threads: ["garden", "rabbits", "marigolds"] },
      { lines: [{ voice: "b", text: "My daughter wants to start a lemonade stand empire." }, { voice: "a", text: "Empire is the right word. She asked me about pricing strategy." }], threads: ["daughter", "lemonade stand", "pricing"] },
      { lines: [{ voice: "a", text: "Is anyone doing the five-K in October?" }, { voice: "b", text: "Only if walking counts. I'm in it for the free shirt." }], threads: ["five k", "october", "walking", "shirt"] },
    ],
  },
];

// Everyday questions for "Land the plane": answer, one reason or example,
// stop.
export const EVERYDAY_QUESTIONS: { id: string; level: 1 | 2 | 3; text: string }[] = [
  { id: "eq01", level: 1, text: "So, what do you do?" },
  { id: "eq02", level: 1, text: "How was your weekend?" },
  { id: "eq03", level: 1, text: "What's the best thing you've eaten lately?" },
  { id: "eq04", level: 1, text: "Coffee or tea, and why?" },
  { id: "eq05", level: 1, text: "Are you a morning person?" },
  { id: "eq06", level: 1, text: "What have you been watching lately?" },
  { id: "eq07", level: 1, text: "Where did you grow up?" },
  { id: "eq08", level: 1, text: "What are you up to this weekend?" },
  { id: "eq09", level: 1, text: "How do you know the host?" },
  { id: "eq10", level: 1, text: "Do you have any pets?" },
  { id: "eq11", level: 2, text: "What's a hobby you'd pick up if you had more time?" },
  { id: "eq12", level: 2, text: "Would you rather live in a big city or a small town?" },
  { id: "eq13", level: 2, text: "What's something you changed your mind about recently?" },
  { id: "eq14", level: 2, text: "What's the best trip you've ever taken?" },
  { id: "eq15", level: 2, text: "What do you like most about your job?" },
  { id: "eq16", level: 2, text: "What's a skill you're proud of?" },
  { id: "eq17", level: 2, text: "Why did you pick your field?" },
  { id: "eq18", level: 2, text: "What does a normal day look like for you?" },
  { id: "eq19", level: 2, text: "What's a book or podcast you'd recommend?" },
  { id: "eq20", level: 2, text: "What's harder than it looks in your line of work?" },
  { id: "eq21", level: 3, text: "What's your take on working from home?" },
  { id: "eq22", level: 3, text: "Is social media good or bad for friendships?" },
  { id: "eq23", level: 3, text: "What would you change about your city?" },
  { id: "eq24", level: 3, text: "What's the best advice anyone's ever given you?" },
  { id: "eq25", level: 3, text: "What's something most people get wrong about your job?" },
  { id: "eq26", level: 3, text: "If you could switch careers tomorrow, what would you do?" },
  { id: "eq27", level: 3, text: "What's a small habit that changed your life?" },
  { id: "eq28", level: 3, text: "What do you think makes a good friend?" },
  { id: "eq29", level: 3, text: "What are you looking forward to this year?" },
  { id: "eq30", level: 3, text: "What's one thing you'd tell your younger self?" },
];

// "Squeeze it": tell one story long, then shorter, then shortest.
export const SQUEEZE_TOPICS: { id: string; text: string }[] = [
  { id: "sq01", text: "Tell me about a time something went hilariously wrong." },
  { id: "sq02", text: "Tell me about the best day you've had this year." },
  { id: "sq03", text: "Tell me how you ended up in your job or your studies." },
  { id: "sq04", text: "Tell me about a place that means something to you." },
  { id: "sq05", text: "Tell me about someone who changed how you think." },
  { id: "sq06", text: "Tell me about a time you got lost." },
  { id: "sq07", text: "Tell me about the last thing you learned that surprised you." },
  { id: "sq08", text: "Tell me about a meal you'll never forget." },
];

// "Call it back": the first line plants a detail; the last reply should
// bring it back.
export interface CallbackScript {
  id: string;
  lines: string[]; // one partner line per turn
  callbackWords: string[]; // any one of these in the last reply counts
}

export const CALLBACK_SCRIPTS: CallbackScript[] = [
  {
    id: "cb01",
    lines: [
      "My dog Biscuit stole an entire sandwich off the picnic table yesterday.",
      "Anyway, work has been busy. We're short two people right now.",
      "So what are you up to this weekend?",
    ],
    callbackWords: ["biscuit", "sandwich", "dog", "picnic"],
  },
  {
    id: "cb02",
    lines: [
      "I just bought a ridiculously expensive pair of hiking boots.",
      "My sister is visiting next week, so I'm cleaning like a maniac.",
      "Do you have any plans for the holidays?",
    ],
    callbackWords: ["boots", "hiking"],
  },
  {
    id: "cb03",
    lines: [
      "I tried to make sourdough, and the starter basically became a pet. I named it Doug.",
      "Work is fine. Lots of meetings this week.",
      "What did you have for dinner last night?",
    ],
    callbackWords: ["doug", "sourdough", "starter", "bread"],
  },
  {
    id: "cb04",
    lines: [
      "I'm convinced my neighbor's parrot has learned to imitate my ringtone.",
      "I've been trying to read more, but I keep falling asleep after three pages.",
      "How's your week going?",
    ],
    callbackWords: ["parrot", "ringtone", "neighbor"],
  },
  {
    id: "cb05",
    lines: [
      "I signed up for salsa lessons and stepped on my partner's foot about forty times.",
      "My car is in the shop again, so I'm taking the bus.",
      "Got anything fun coming up?",
    ],
    callbackWords: ["salsa", "dance", "dancing", "foot", "lessons"],
  },
];

// "React": something a bit odd or funny. Practice a real-time reaction — a
// laugh, a "no way", a playful exaggeration. Self-rated only.
export const REACTION_LINES: { id: string; level: 1 | 2 | 3; text: string }[] = [
  { id: "rx01", level: 1, text: "I just found out I've been pronouncing my own street name wrong for three years." },
  { id: "rx02", level: 1, text: "My cat learned to open the fridge. I'm genuinely scared." },
  { id: "rx03", level: 1, text: "I waved back at someone today who was waving at the person behind me." },
  { id: "rx04", level: 1, text: "I bought a plant to make my place feel alive, and it died in a week." },
  { id: "rx05", level: 2, text: "My dad just discovered voice texting, so now every message ends with 'period'." },
  { id: "rx06", level: 2, text: "I accidentally replied all to the whole company with a picture of my lunch." },
  { id: "rx07", level: 2, text: "I set three alarms this morning and slept through every single one." },
  { id: "rx08", level: 2, text: "My roommate labels everything in the fridge. Including the ketchup. With a date." },
  { id: "rx09", level: 3, text: "I went to a silent retreat and lasted until lunch on the first day." },
  { id: "rx10", level: 3, text: "My grandma beat me at a video game and then trash talked me about it." },
  { id: "rx11", level: 3, text: "I tried to be healthy and ordered a salad, and it came with fried chicken on top." },
  { id: "rx12", level: 3, text: "I spent an hour assembling a bookshelf and have one mystery screw left over." },
];

// Daily missions — tiny, real-world, one tap to log.
export interface Mission {
  id: string;
  text: string;
  target: number; // how many times to count it done
}

export const MISSIONS: Mission[] = [
  { id: "m_followups", text: "Ask two follow-up questions today.", target: 2 },
  { id: "m_short", text: "Answer one question in under 20 seconds.", target: 1 },
  { id: "m_beat", text: "Take one breath before you reply.", target: 1 },
  { id: "m_spark", text: "Listen for one spark — the word that lights someone up.", target: 1 },
  { id: "m_story", text: "Ask one question that invites a story.", target: 1 },
  { id: "m_metoo", text: "Say a one-sentence 'me too', then hand it back with a question.", target: 1 },
  { id: "m_notice", text: "Catch yourself watching yourself once — then look at them.", target: 1 },
  { id: "m_surprise", text: "Learn one surprising thing about someone.", target: 1 },
  { id: "m_last", text: "Ask about the last thing someone said.", target: 1 },
  { id: "m_headline", text: "Give one answer that starts with the point.", target: 1 },
  { id: "m_sum", text: "Tell someone about a show, book or game in two sentences, then stop.", target: 1 },
  { id: "m_recap", text: "Sum up a meeting, a class or a chat in one sentence.", target: 1 },
  { id: "m_open", text: "Start one conversation with a plain comment about what's around you.", target: 1 },
  { id: "m_exit", text: "End one conversation yourself: something you liked, a reason, goodbye.", target: 1 },
];

// Prime card suggestions.
export const OUTWARD_GOALS = [
  "Learn one surprising thing about someone.",
  "Find out what someone's excited about right now.",
  "Ask two follow-up questions.",
  "Notice one thing someone cares about.",
  "Get one person to tell a story.",
  "Remember one name and use it.",
];

// Story questions ("conversation sparks"): open questions that invite a
// story rather than a one-word answer.
export const STORY_QUESTIONS = [
  "What's the best thing that happened to you this week?",
  "What are you excited about right now?",
  "What's the most surprising thing that's happened at your work?",
  "How did you end up doing what you do?",
  "What's something you're looking forward to?",
  "What's the best part of your job that nobody sees?",
  "What's a recent rabbit hole you went down?",
  "What was the highlight of your weekend?",
  "What's a project you're working on that you actually enjoy?",
  "What's something you've been meaning to try?",
  "What's the story behind that?",
  "What do you do when you're not working?",
];

export const TOPIC_IDEAS = [
  "Something funny that happened this week",
  "A show, book or podcast you're into",
  "A trip — recent or coming up",
  "Something you're learning",
  "Food: a great meal or a disaster",
  "A small win from this week",
  "Something you noticed on the way there",
  "Weekend plans",
];
