// Content for the "Say it short" drills (Sum it up, Rolling summary, Explain
// it simply). Every item carries a short example answer: it is what the
// result shows as "one way to say it" when no AI review is available, and
// the reference the AI review is checked against. Examples never run longer
// than the smallest sentence limit (two sentences).

export type SubjectKind = "film" | "book" | "story" | "event" | "idea" | "own";

export interface SumUpSubject {
  id: string;
  level: 1 | 2 | 3;
  kind: SubjectKind;
  // What the phone asks you to sum up.
  text: string;
  // Absent for "own" subjects: only you know the answer.
  example?: string;
}

export const SUM_UP_SUBJECTS: SumUpSubject[] = [
  // Level 1: fables, famous films, simple processes.
  { id: "su01", level: 1, kind: "film", text: "The movie Finding Nemo", example: "A nervous clownfish crosses the ocean to find his lost son, and learns to let go along the way." },
  { id: "su02", level: 1, kind: "film", text: "The movie The Lion King", example: "A young lion runs away after his father's death, then comes home to take back his kingdom." },
  { id: "su03", level: 1, kind: "film", text: "The movie Toy Story", example: "A cowboy doll is jealous of a new space toy, but they become friends when they get lost and have to find their way home." },
  { id: "su04", level: 1, kind: "story", text: "The story of Cinderella", example: "A mistreated girl gets one magical night at a ball, and a lost glass slipper leads the prince to her." },
  { id: "su05", level: 1, kind: "story", text: "The tortoise and the hare", example: "A fast hare naps in the middle of a race, so the slow, steady tortoise wins." },
  { id: "su06", level: 1, kind: "story", text: "The story of Goldilocks and the three bears", example: "A girl sneaks into the bears' house and tries everything until one thing is just right, then runs when they come home." },
  { id: "su07", level: 1, kind: "book", text: "The book Harry Potter and the Sorcerer's Stone", example: "An orphan learns he is a wizard, goes to a magic school, and stops a villain from stealing a stone that gives eternal life." },
  { id: "su08", level: 1, kind: "film", text: "The movie Frozen", example: "A queen with icy powers hides from the world, until her sister's love for her proves stronger than her fear." },
  { id: "su09", level: 1, kind: "story", text: "The story of Romeo and Juliet", example: "Two teenagers from feuding families fall in love and secretly marry, but a chain of mistakes ends in both of their deaths." },
  { id: "su10", level: 1, kind: "story", text: "Jack and the Beanstalk", example: "A boy trades his cow for magic beans, climbs the giant stalk they grow, and escapes a giant with his gold." },
  { id: "su11", level: 1, kind: "own", text: "What you did yesterday, from morning to night" },
  { id: "su12", level: 1, kind: "idea", text: "How to make a peanut butter and jelly sandwich", example: "Spread peanut butter on one slice and jelly on the other, press them together, and cut it in half." },
  { id: "su13", level: 1, kind: "own", text: "Your favorite movie" },
  { id: "su14", level: 1, kind: "film", text: "The movie Shrek", example: "A grumpy ogre rescues a princess to get his swamp back, and ends up falling for her." },
  { id: "su15", level: 1, kind: "story", text: "Little Red Riding Hood", example: "A girl visits her grandmother and finds a wolf in her place, until a woodcutter saves them both." },
  { id: "su16", level: 1, kind: "film", text: "The movie Home Alone", example: "A boy left behind by mistake over Christmas defends his house from two burglars with clever traps." },

  // Level 2: plot-heavier films and books, everyday systems, big events.
  { id: "su17", level: 2, kind: "film", text: "The movie Jaws", example: "A small beach town's police chief has to hunt a great white shark, even though the mayor wants the beaches kept open." },
  { id: "su18", level: 2, kind: "film", text: "The movie Titanic", example: "A rich girl and a poor artist fall in love aboard the doomed ship, and only one of them survives the sinking." },
  { id: "su19", level: 2, kind: "film", text: "The movie The Matrix", example: "A hacker learns his world is a computer simulation and joins a rebellion against the machines that run it." },
  { id: "su20", level: 2, kind: "book", text: "The book The Hobbit", example: "A homebody hobbit joins a band of dwarves to win back their mountain from a dragon, and finds his courage along the way." },
  { id: "su21", level: 2, kind: "book", text: "The novel Pride and Prejudice", example: "A sharp-tongued woman and a proud, wealthy man misjudge each other, then slowly learn who the other really is." },
  { id: "su22", level: 2, kind: "book", text: "The novel 1984", example: "A man in a surveillance state secretly rebels, is caught, and is broken until he loves the very system that controls him." },
  { id: "su23", level: 2, kind: "story", text: "The Odyssey", example: "After the Trojan War, a king spends ten years trying to get home to his family, facing monsters and temptations on the way." },
  { id: "su24", level: 2, kind: "film", text: "The movie Inception", example: "A thief who steals secrets from dreams is hired to plant an idea in someone's mind, through dreams within dreams." },
  { id: "su25", level: 2, kind: "event", text: "The first moon landing", example: "In 1969, Apollo 11 landed two astronauts on the moon, and Neil Armstrong became the first person to walk on it." },
  { id: "su26", level: 2, kind: "event", text: "The fall of the Berlin Wall", example: "In 1989, East Germany opened its border after mass protests, and the wall that divided Berlin soon came down." },
  { id: "su27", level: 2, kind: "idea", text: "How a web page gets to your screen", example: "Your device asks a server for the page, and the server sends it back in small pieces that your browser puts together." },
  { id: "su28", level: 2, kind: "idea", text: "How a bill becomes a law in the United States", example: "A bill has to pass both the House and the Senate, and then the president signs it into law or vetoes it." },
  { id: "su29", level: 2, kind: "idea", text: "How photosynthesis works", example: "Plants use sunlight to turn water and carbon dioxide into sugar for energy, and they release oxygen as a by-product." },
  { id: "su30", level: 2, kind: "own", text: "The best trip you have ever taken" },
  { id: "su31", level: 2, kind: "own", text: "Your job, or what you study" },
  { id: "su32", level: 2, kind: "own", text: "A show you watched recently" },

  // Level 3: abstract ideas and harder plots.
  { id: "su33", level: 3, kind: "book", text: "The novel To Kill a Mockingbird", example: "A lawyer in 1930s Alabama defends a Black man falsely accused of a crime, while his young daughter learns about prejudice." },
  { id: "su34", level: 3, kind: "book", text: "The novel Frankenstein", example: "A scientist creates a living being and abandons it in horror, and the rejected creature takes revenge." },
  { id: "su35", level: 3, kind: "film", text: "The movie Parasite", example: "A poor family talks its way into a rich household by posing as unrelated workers, until a hidden secret in the house unravels everything." },
  { id: "su36", level: 3, kind: "book", text: "The book Animal Farm", example: "Farm animals overthrow their owner, but the pigs who lead them become as tyrannical as the humans they replaced." },
  { id: "su37", level: 3, kind: "idea", text: "Supply and demand", example: "When something is scarce and many people want it, its price rises; when it is plentiful and few want it, the price falls." },
  { id: "su38", level: 3, kind: "idea", text: "Compound interest", example: "Interest earns interest, so money grows faster and faster the longer it stays invested." },
  { id: "su39", level: 3, kind: "idea", text: "Natural selection", example: "Individuals whose traits help them survive and reproduce pass those traits on, so a species gradually changes over generations." },
  { id: "su40", level: 3, kind: "idea", text: "The placebo effect", example: "People sometimes feel better after a fake treatment, simply because they expect it to work." },
  { id: "su41", level: 3, kind: "idea", text: "Opportunity cost", example: "The real cost of a choice is the best alternative you gave up to make it." },
  { id: "su42", level: 3, kind: "idea", text: "The scientific method", example: "Scientists ask a question, make a guess, test it with experiments, and change the guess when the results disagree." },
  { id: "su43", level: 3, kind: "idea", text: "The prisoner's dilemma", example: "Two people each do better by betraying the other, yet both end up worse off than if they had cooperated." },
  { id: "su44", level: 3, kind: "event", text: "The 2008 financial crisis", example: "Banks made risky mortgage loans and bundled them into complex investments. When homeowners couldn't pay, the losses spread and set off a deep recession." },
  { id: "su45", level: 3, kind: "event", text: "The Industrial Revolution", example: "Starting in 18th-century Britain, machines and factories replaced hand production, pulling people into cities and transforming how goods were made." },
  { id: "su46", level: 3, kind: "own", text: "An idea from your work or studies that is hard to explain" },
  { id: "su47", level: 3, kind: "own", text: "A decision you changed your mind about" },
  { id: "su48", level: 3, kind: "own", text: "Something you learned the hard way" },
];

// --- Rolling summary passages -------------------------------------------------

export interface SummaryParagraph {
  text: string;
  // Words the paragraph's main idea turns on; each appears in `text`.
  keyWords: string[];
  // A one- or two-sentence summary.
  example: string;
}

export interface SummaryPassage {
  id: string;
  level: 1 | 2 | 3;
  title: string;
  kind: "story" | "explainer";
  paragraphs: SummaryParagraph[];
}

export const SUMMARY_PASSAGES: SummaryPassage[] = [
  {
    id: "sp01",
    level: 1,
    title: "The lighthouse keeper",
    kind: "story",
    paragraphs: [
      {
        text: "Mara had kept the lighthouse at the edge of the island for thirty years. Every evening she climbed two hundred steps to light the great lamp. Ships she would never meet passed through its beam, and she liked knowing she was a small part of their safe journey home.",
        keyWords: ["lighthouse", "lamp", "ships"],
        example: "Mara has tended a lighthouse for thirty years, lighting its lamp every night to guide ships she never meets.",
      },
      {
        text: "One autumn a storm rolled in faster than anyone had forecast. The waves climbed the rocks and the wind rattled every window in the tower. Mara checked the lamp twice, then sat down to wait, because there was nothing to do now but keep the light burning.",
        keyWords: ["storm", "waves", "lamp"],
        example: "A sudden storm hit, and all Mara could do was keep the light burning.",
      },
      {
        text: "Near midnight the lamp flickered and went out. Mara grabbed a lantern and a can of oil and ran up the stairs, her heart pounding. She found a cracked glass chimney and a dry wick. She had no spare, and the ships were out there in the dark.",
        keyWords: ["lamp", "oil", "wick"],
        example: "The lamp went out at midnight, and Mara found a cracked chimney and a dry wick with no spare.",
      },
      {
        text: "She stood still and thought. Then she carried the old brass mirror from the storeroom and set it behind the lantern. She polished it with her sleeve until it shone. The little flame doubled, then tripled, and a thin beam swept out across the black water.",
        keyWords: ["mirror", "lantern", "beam"],
        example: "Mara placed an old brass mirror behind a lantern to turn its small flame into a beam.",
      },
      {
        text: "By dawn the storm had passed and every ship had made it to harbor. The captain of the largest one rowed out to thank her. Mara only shrugged and said the light was never really the lamp. It was the habit of showing up when it mattered.",
        keyWords: ["harbor", "captain", "habit"],
        example: "All the ships reached the harbor safely, and Mara said what mattered was showing up.",
      },
    ],
  },
  {
    id: "sp02",
    level: 1,
    title: "How bees make honey",
    kind: "explainer",
    paragraphs: [
      {
        text: "Honey starts as nectar, the sweet liquid inside flowers. A worker bee drinks it with a long tongue and stores it in a special stomach. She visits many flowers to fill up, then flies back to the hive carrying her sweet cargo.",
        keyWords: ["nectar", "flowers", "stomach"],
        example: "Bees collect nectar from flowers and carry it home in a special stomach.",
      },
      {
        text: "Back at the hive, she passes the nectar to another worker, who chews on it. Enzymes in the bees' mouths break the sugars down into simpler ones. This handoff happens many times, and each time the nectar changes a little, slowly turning into something thicker.",
        keyWords: ["hive", "enzymes", "sugars"],
        example: "In the hive, workers pass the nectar along while enzymes break down its sugars.",
      },
      {
        text: "Next, the bees spread the nectar into honeycomb cells, which are small wax rooms. The nectar is still too watery to keep. So the bees fan their wings over the cells to blow warm air across them, and the extra water slowly evaporates away.",
        keyWords: ["honeycomb", "wings", "water"],
        example: "The bees fan the nectar in the honeycomb with their wings so the extra water dries out.",
      },
      {
        text: "When the honey is thick enough, the bees seal each cell with a cap of fresh wax. This keeps out air and moisture. Sealed honey can last for years without spoiling, which is why the bees can store it as food for the cold months when there are no flowers.",
        keyWords: ["seal", "wax", "food"],
        example: "Once thick, the honey is sealed with wax, so it keeps through the cold months.",
      },
      {
        text: "A single bee makes only a tiny amount in her whole life, about a twelfth of a teaspoon. A hive of thousands works together to fill the combs. So every spoonful you eat is the lifetime work of many bees.",
        keyWords: ["teaspoon", "hive", "lifetime"],
        example: "One bee makes a tiny bit of honey in her life, so each spoonful comes from many bees working together.",
      },
    ],
  },
  {
    id: "sp03",
    level: 2,
    title: "The borrowed violin",
    kind: "story",
    paragraphs: [
      {
        text: "Daniel had not touched a violin since he was twelve. Then his niece asked him to play at her birthday, and he said yes before he thought about it. That evening he borrowed his old teacher's violin and sat on his bed, staring at the case without opening it.",
        keyWords: ["violin", "niece", "birthday"],
        example: "Daniel promised to play violin at his niece's birthday, even though he hadn't played since childhood.",
      },
      {
        text: "His first notes came out thin and scratchy, and his fingers had forgotten where to go. He practiced every night for a week. His neighbor knocked on the wall twice. Daniel apologized, but he kept going, a little more slowly each time, listening carefully to every note.",
        keyWords: ["notes", "practiced", "neighbor"],
        example: "His first notes were scratchy, but he practiced all week despite his neighbor's complaints.",
      },
      {
        text: "On the day of the party he felt sick with nerves. He stood in the living room with thirty people watching, and his hands shook. The first bar was wobbly. He took a breath, closed his eyes, and remembered the slow way his teacher used to count.",
        keyWords: ["party", "nerves", "teacher"],
        example: "At the party Daniel was shaking with nerves until he remembered his teacher's slow counting.",
      },
      {
        text: "The melody steadied and grew warm. A few people smiled. His niece, who sat cross-legged on the rug, stopped fidgeting and just listened. When he reached the last note he held it for a moment, and the room stayed silent until it faded.",
        keyWords: ["melody", "niece", "silent"],
        example: "The music steadied, his niece listened closely, and the room went quiet at the end.",
      },
      {
        text: "Afterwards his niece hugged him and asked him to teach her. Daniel laughed and said he was no teacher. But the next Saturday he returned the borrowed violin and bought one of his own, along with a small one for her.",
        keyWords: ["teach", "Saturday", "bought"],
        example: "His niece asked him to teach her, so Daniel bought his own violin and a small one for her.",
      },
    ],
  },
  {
    id: "sp04",
    level: 2,
    title: "How coffee gets to your cup",
    kind: "explainer",
    paragraphs: [
      {
        text: "Coffee begins as a small red fruit called a cherry that grows on shrubs in warm, mountainous regions. Inside each cherry are two seeds, and those seeds are what we call coffee beans. Farmers pick the cherries when they are ripe, by hand or with machines.",
        keyWords: ["cherry", "seeds", "farmers"],
        example: "Coffee beans are the seeds inside ripe cherries that farmers pick from shrubs.",
      },
      {
        text: "Next the seeds must be freed from the fruit. In one method, the cherries are dried in the sun and the dry husk is rubbed off. In another, the fruit is washed away in water. Either way, the beans come out pale and green and still have no coffee smell.",
        keyWords: ["dried", "husk", "green"],
        example: "The seeds are separated from the fruit by drying or washing, leaving pale green beans.",
      },
      {
        text: "The green beans are then packed into sacks and shipped around the world, often to countries far from where the coffee grew. Buyers taste samples before they purchase, grading them for flavor and quality, and the best beans earn the highest prices.",
        keyWords: ["sacks", "buyers", "flavor"],
        example: "The green beans are shipped worldwide, where buyers taste and grade them.",
      },
      {
        text: "The real transformation happens in the roaster. Heat makes the beans turn brown, crack open, and release the oils and aromas that we know. A lighter roast tastes brighter and more sour, while a darker roast tastes bolder and more bitter.",
        keyWords: ["roaster", "heat", "aromas"],
        example: "Roasting browns the beans and brings out the aroma, with lighter roasts brighter and darker ones more bitter.",
      },
      {
        text: "Finally the roasted beans are ground and mixed with hot water. The water pulls flavor out of the grounds as it passes through. Grinding finer makes the coffee stronger, because more of the surface is exposed to the water.",
        keyWords: ["ground", "water", "stronger"],
        example: "Finally the beans are ground and brewed with hot water, and finer grounds make stronger coffee.",
      },
    ],
  },
  {
    id: "sp05",
    level: 2,
    title: "The last bus",
    kind: "story",
    paragraphs: [
      {
        text: "Priya missed the last bus by about ten seconds. She stood at the empty stop with her laptop bag and a dead phone, watching the taillights shrink. The next bus was not until morning, and her apartment was across the river, miles away.",
        keyWords: ["bus", "phone", "river"],
        example: "Priya missed the last bus with a dead phone and had to get across town.",
      },
      {
        text: "She started walking toward the bridge, hoping to find a taxi. The streets were quiet and the wind off the water was cold. A man sweeping outside a bakery noticed her shivering and asked if she was all right. She explained, a bit embarrassed.",
        keyWords: ["bridge", "taxi", "bakery"],
        example: "Walking toward the bridge in the cold, Priya was asked by a baker if she was all right.",
      },
      {
        text: "He didn't have a taxi number, but he offered her a cup of tea and the use of the bakery's phone. She called her sister, who was asleep, then her roommate, who didn't answer. She sat on a flour sack, sipped the tea, and laughed at how absurd the night had become.",
        keyWords: ["tea", "sister", "roommate"],
        example: "The baker offered tea and a phone, but neither her sister nor her roommate picked up.",
      },
      {
        text: "At midnight the baker's delivery driver arrived to load the morning bread. When he heard the story he offered to drop her home on his route. The back of the van smelled like warm loaves, and Priya fell half asleep between the crates.",
        keyWords: ["driver", "van", "bread"],
        example: "The baker's delivery driver offered Priya a ride home in his bread van.",
      },
      {
        text: "She got home after one o'clock, tired and oddly happy. The next week she walked back to the bakery to thank them properly, with a card and an order for a dozen rolls. Missing the bus, she decided, had given her the best part of the month.",
        keyWords: ["thank", "rolls", "month"],
        example: "Priya reached home late, then returned to the bakery to thank them, glad she had missed the bus.",
      },
    ],
  },
  {
    id: "sp06",
    level: 3,
    title: "How antibiotic resistance happens",
    kind: "explainer",
    paragraphs: [
      {
        text: "Antibiotics are medicines that kill bacteria or stop them from multiplying. They don't work against viruses, which is why they can't cure a cold or the flu. When a doctor prescribes one correctly, it can turn a deadly infection into a minor illness that clears within days.",
        keyWords: ["antibiotics", "bacteria", "viruses"],
        example: "Antibiotics fight bacterial infections, but they do nothing against viruses like colds.",
      },
      {
        text: "Bacteria multiply extremely fast, and they change by chance as they copy themselves. Most of those changes are harmless or even harmful to the germ. But now and then, one change makes a bacterium slightly harder for a particular antibiotic to kill. That single germ is the start of a problem.",
        keyWords: ["multiply", "change", "chance"],
        example: "Bacteria multiply quickly and change by chance, so some end up able to resist a drug.",
      },
      {
        text: "When someone takes an antibiotic, it kills the weak bacteria first, leaving the resistant ones behind. With less competition, the survivors multiply and fill the space. This is natural selection happening inside a patient's body, and it can occur within days.",
        keyWords: ["resistant", "survivors", "selection"],
        example: "The drug kills the weak bacteria and leaves resistant survivors that then multiply.",
      },
      {
        text: "Resistant germs can also pass their defenses to other bacteria, even different kinds, by sharing small pieces of genetic material. This means resistance can spread through a hospital, a farm, or a whole community, long after the original patient has recovered.",
        keyWords: ["genetic", "hospital", "spread"],
        example: "Resistant germs can share their defenses with other bacteria, so resistance spreads.",
      },
      {
        text: "To slow this down, doctors prescribe antibiotics only when they are truly needed, and patients should take them exactly as directed. Researchers are also hunting for new drugs. Without these steps, ordinary surgeries and infections could become dangerous again.",
        keyWords: ["prescribe", "directed", "researchers"],
        example: "To slow resistance, use antibiotics only when needed, take them as directed, and develop new ones.",
      },
    ],
  },
  {
    id: "sp07",
    level: 3,
    title: "The budget meeting",
    kind: "story",
    paragraphs: [
      {
        text: "Elena had been asked to lead the team's budget meeting, and she dreaded it. Her department was twenty percent over its limit, and the finance director, Mr. Okafor, was known for cutting funding without warning. She spent the weekend rehearsing a long, careful speech full of excuses.",
        keyWords: ["budget", "finance", "excuses"],
        example: "Elena dreaded the budget meeting because her department was over its limit.",
      },
      {
        text: "On Monday morning she stood in the elevator and read the speech one last time. Halfway through she realized it was mostly apologies. Nobody in that room would remember a single line. They would remember only whether she had a plan. So she crossed it all out on the back of the page.",
        keyWords: ["elevator", "apologies", "plan"],
        example: "In the elevator, Elena realized her speech was mostly apologies and decided to focus on a plan instead.",
      },
      {
        text: "In the meeting she began with the number: the department was over by two hundred thousand dollars. Then she gave the reason, which was a supplier's price jump, and the fix, which was changing suppliers. She said it in three sentences and stopped, and the room went still.",
        keyWords: ["number", "supplier", "sentences"],
        example: "Elena opened with the overspend, its cause, and the fix in just three sentences.",
      },
      {
        text: "Mr. Okafor leaned back and asked how soon the new supplier could start. She had the answer ready: within a month, with a small trial first. He asked two more questions, nodded, and wrote something down. For the first time all year, he didn't mention cuts.",
        keyWords: ["supplier", "trial", "cuts"],
        example: "Mr. Okafor asked a few questions about the new supplier and didn't bring up cuts.",
      },
      {
        text: "Afterward a colleague asked how she had stayed so calm. Elena admitted she had thrown away her script in the elevator. Leading with the answer, she said, took away the fear. When you know what you need to say, there is far less to be nervous about.",
        keyWords: ["colleague", "script", "answer"],
        example: "Elena credited her calm to dropping the script and leading with the answer.",
      },
    ],
  },
  {
    id: "sp08",
    level: 3,
    title: "How memory works",
    kind: "explainer",
    paragraphs: [
      {
        text: "Memory isn't one thing but a chain of steps. First, your senses take in information, and most of it fades within seconds. Only what you pay attention to moves into short-term memory, a small workspace that holds a handful of items for about half a minute.",
        keyWords: ["senses", "attention", "workspace"],
        example: "Memory starts with the senses, and only what you pay attention to reaches short-term memory.",
      },
      {
        text: "To keep something longer, the brain has to store it. This happens mainly during rest and sleep, when the hippocampus replays the day's events and strengthens the connections between brain cells. That's one reason cramming all night before a test works poorly.",
        keyWords: ["sleep", "hippocampus", "cramming"],
        example: "The brain stores memories mostly during sleep, which is why all-night cramming works poorly.",
      },
      {
        text: "Each time you recall a memory, you don't play it back like a video. You rebuild it from pieces, and the pieces can shift. A vivid memory may be partly wrong, and your confidence in it tells you very little about whether it is accurate.",
        keyWords: ["rebuild", "pieces", "confidence"],
        example: "Recalling a memory rebuilds it from pieces, so even vivid memories can be wrong.",
      },
      {
        text: "Some techniques help a lot. Spacing your study over several days beats one long session. Testing yourself beats rereading. And linking new facts to things you already know creates more hooks for later. These work because they make the brain struggle just enough.",
        keyWords: ["spacing", "testing", "linking"],
        example: "Spacing out study, testing yourself and linking new facts to old ones all strengthen memory.",
      },
      {
        text: "Forgetting is not simply a failure. The brain drops details that seem unimportant so that it can focus on what matters. The goal of good learning is therefore not to remember everything, but to make the important things easy to find again.",
        keyWords: ["forgetting", "important", "learning"],
        example: "Forgetting helps the brain focus, so learning should make the important things easy to find.",
      },
    ],
  },
];

// --- Explain it simply ---------------------------------------------------------

export interface ExplainTopic {
  id: string;
  level: 1 | 2 | 3;
  // What you are asked to explain.
  text: string;
  // Words that are the subject itself, so they never count as jargon.
  keep: string[];
  example: string;
}

export const EXPLAIN_TOPICS: ExplainTopic[] = [
  { id: "ex01", level: 1, text: "How a microwave heats food", keep: ["microwave"], example: "A microwave shakes the tiny bits of water in your food. The shaking makes heat, and the heat warms the food." },
  { id: "ex02", level: 1, text: "Why the sky is blue", keep: ["sky"], example: "Sunlight has every color in it. The air bounces blue light around the most, so blue is what we see everywhere." },
  { id: "ex03", level: 1, text: "How a rainbow forms", keep: ["rainbow"], example: "Sunlight goes into raindrops and bends. The raindrops split the light into its colors, so we see a rainbow." },
  { id: "ex04", level: 1, text: "Why we have seasons", keep: ["seasons"], example: "The Earth is tilted as it goes around the sun. When our part leans toward the sun it is summer, and when it leans away it is winter." },
  { id: "ex05", level: 1, text: "How a plant grows from a seed", keep: ["seed"], example: "A seed soaks up water and cracks open. A root grows down, a stem grows up, and leaves catch sunlight to make food." },
  { id: "ex06", level: 1, text: "How a refrigerator keeps food cold", keep: ["refrigerator", "fridge"], example: "A fridge pulls heat out of the box and pushes it out the back. That is why the back feels warm and the inside stays cold." },
  { id: "ex07", level: 1, text: "Why we sleep", keep: ["sleep"], example: "While you sleep, your body fixes itself and your brain sorts out what you learned. Without sleep, thinking gets slow and your mood gets worse." },
  { id: "ex08", level: 1, text: "How a tooth gets a cavity", keep: ["cavity", "tooth"], example: "Germs in your mouth eat sugar and make acid. The acid slowly eats a hole in the tooth." },
  { id: "ex09", level: 1, text: "What a magnet does", keep: ["magnet"], example: "Every magnet has two ends, a north and a south. Opposite ends pull together, and matching ends push apart." },
  { id: "ex10", level: 1, text: "Why the moon changes shape", keep: ["moon"], example: "The sun always lights half of the moon. As the moon circles the Earth, we see more or less of the lit half." },

  { id: "ex11", level: 2, text: "How a credit score works", keep: ["credit", "score"], example: "A credit score is a number that tells lenders how safe it is to lend you money. Paying bills on time and owing less push it up." },
  { id: "ex12", level: 2, text: "What inflation is", keep: ["inflation"], example: "Inflation means prices slowly go up over time. The same money buys a little less than it did before." },
  { id: "ex13", level: 2, text: "How a vaccine works", keep: ["vaccine"], example: "A vaccine shows your body a harmless piece of a germ. Your body practices fighting it, so it can win fast if the real germ shows up." },
  { id: "ex14", level: 2, text: "How GPS finds where you are", keep: ["gps"], example: "Satellites high above the Earth send out time signals. Your phone measures how long each signal took to arrive, and uses that to work out where you are." },
  { id: "ex15", level: 2, text: "How a bank makes money", keep: ["bank"], example: "A bank pays you a little interest on your savings and charges more interest on loans. The difference is what it keeps." },
  { id: "ex16", level: 2, text: "How wifi works", keep: ["wifi"], example: "Your router turns internet data into radio waves. Your phone catches them and turns them back into data." },
  { id: "ex17", level: 2, text: "How a plane stays in the air", keep: ["plane"], example: "The wings are shaped so air moving over them pushes the plane up. The engines push the plane forward fast enough to keep that lift." },
  { id: "ex18", level: 2, text: "Why the tides rise and fall", keep: ["tides"], example: "The moon's pull tugs the ocean toward it. As the Earth turns, each shore moves in and out of that bulge, so the water rises and falls." },
  { id: "ex19", level: 2, text: "How a battery works", keep: ["battery"], example: "A battery stores energy in chemicals. When you connect it to a device, the chemicals react and push electricity through." },
  { id: "ex20", level: 2, text: "What a mortgage is", keep: ["mortgage"], example: "A mortgage is a loan to buy a home. You pay it back little by little with interest, and the bank can take the home if you stop paying." },

  { id: "ex21", level: 3, text: "How compound interest works", keep: ["interest"], example: "Interest is extra money you earn on your savings. With compound interest, you also earn interest on the interest, so it grows faster over time." },
  { id: "ex22", level: 3, text: "What a stock is", keep: ["stock"], example: "A stock is a tiny piece of ownership in a company. If the company does well, that piece is usually worth more." },
  { id: "ex23", level: 3, text: "How encryption keeps messages private", keep: ["encryption"], example: "Encryption scrambles a message with a secret key. Only someone with the right key can unscramble it and read it." },
  { id: "ex24", level: 3, text: "How machine learning works", keep: ["machine", "learning"], example: "Instead of being given rules, a computer looks at lots of examples and finds patterns. Then it uses those patterns to guess about new things." },
  { id: "ex25", level: 3, text: "What gravity is", keep: ["gravity"], example: "Gravity is the pull that things have on each other. The more stuff something is made of, the stronger it pulls, which is why Earth holds us down." },
  { id: "ex26", level: 3, text: "How a blockchain works", keep: ["blockchain"], example: "A blockchain is a shared list of records that many computers keep copies of. Each new batch is linked to the last one, so changing an old record would be noticed." },
  { id: "ex27", level: 3, text: "How the immune system works", keep: ["immune"], example: "Your immune system is the body's defense team. It spots germs that don't belong and attacks them, and it remembers them for next time." },
  { id: "ex28", level: 3, text: "What a recession is", keep: ["recession"], example: "A recession is when the economy shrinks for a while. People spend less, businesses make less, and more people lose their jobs." },
  { id: "ex29", level: 3, text: "How a search engine finds answers", keep: ["search"], example: "A search engine keeps a huge list of web pages. When you search, it picks the pages that best match your words and that other pages trust." },
  { id: "ex30", level: 3, text: "What DNA does", keep: ["dna"], example: "DNA is a long code inside your cells. It holds the instructions your body uses to build and run itself." },
];
