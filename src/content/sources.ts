// What the curriculum is built on — shown under Learn → Frameworks →
// Sources. Every lesson's `source` line should trace back to an entry here;
// add one when content leans on something new. Links are DOIs (checked to
// resolve to the cited paper) or the author's own site.

export interface Source {
  // Reference-list style, with the work's title in *asterisks* (italic).
  citation: string;
  // Where it shows up in the app.
  usedFor: string;
  url?: string;
}

export interface SourceGroup {
  title: string;
  sources: Source[];
}

const doi = (id: string) => `https://doi.org/${id}`;

export const SOURCE_GROUPS: SourceGroup[] = [
  {
    title: "Books",
    sources: [
      {
        citation: "Abrahams, M. (2023). *Think Faster, Talk Smarter: How to Speak Successfully When You're Put on the Spot.* Simon Element.",
        usedFor: "Structured spontaneity — What, so what, now what; Problem, solution, benefit; paraphrasing a question to buy time; and how structure is scored.",
        url: "https://mattabrahams.com",
      },
      {
        citation: "Brooks, A. W. (2025). *Talk: The Science of Conversation and the Art of Being Ourselves.* Crown.",
        usedFor: "The TALK maxims (topics, asking, levity, kindness) behind the conversation lessons.",
      },
      {
        citation: "Van Edwards, V. (2017). *Captivate: The Science of Succeeding with People.* Portfolio.",
        usedFor: "Conversation sparks, asking for the story, and 'me too' moments.",
        url: "https://www.scienceofpeople.com",
      },
      {
        citation: "Provine, R. R. (2000). *Laughter: A Scientific Investigation.* Viking.",
        usedFor: "Most laughter follows ordinary remarks, not jokes — 'React out loud'.",
      },
      {
        citation: "Adams, K. (2007). *How to Improvise a Full-Length Play: The Art of Spontaneous Theater.* Allworth Press.",
        usedFor: "The Story Spine — an improv tool later taught to Pixar's writers.",
      },
      {
        citation: "Johnstone, K. (1979). *Impro: Improvisation and the Theatre.* Faber & Faber.",
        usedFor: "Accepting offers ('yes, and') in the improv and humor lessons.",
      },
      {
        citation: "Laban, R. (1950). *The Mastery of Movement on the Stage.* Macdonald & Evans.",
        usedFor: "The effort actions (punch, press, wring, float…) in Move It.",
      },
      {
        citation: "Linklater, K. (2006). *Freeing the Natural Voice* (Rev. ed.). Nick Hern Books.",
        usedFor: "Low, relaxed breathing and steady air in the breath lessons.",
      },
      {
        citation: "Wells, J. C. (2006). *English Intonation: An Introduction.* Cambridge University Press.",
        usedFor: "Rising and falling tones in the pitch lessons and Mark It Up's arrows.",
      },
      {
        citation: "Ladefoged, P., & Johnson, K. (2015). *A Course in Phonetics* (7th ed.). Cengage Learning.",
        usedFor: "The articulation lessons and minimal pairs.",
      },
      {
        citation: "Guitar, B. (2019). *Stuttering: An Integrated Approach to Its Nature and Treatment* (5th ed.). Wolters Kluwer.",
        usedFor: "Fluency-shaping warm-ups (easy breathing, gentle onsets) and stuttering mode.",
      },
      {
        citation: "Parrott, W. G. (Ed.). (2001). *Emotions in Social Psychology: Essential Readings.* Psychology Press.",
        usedFor: "The emotion tree behind Feeling of the Week.",
      },
      {
        citation: "Schmidt, R. A., & Lee, T. D. (2014). *Motor Learning and Performance: From Principles to Application* (5th ed.). Human Kinetics.",
        usedFor: "Accuracy before speed in articulation drills.",
      },
    ],
  },
  {
    title: "Coaches, programs and shows",
    sources: [
      {
        citation: "Vinh Giang — communication coach.",
        usedFor: "The five vocal foundations (rate, volume, pitch, tonality, pausing), the three-pass self-review, the four communication archetypes, and pausing instead of filling.",
        url: "https://vinhgiang.com",
      },
      {
        citation: "Toastmasters International.",
        usedFor: "Table Topics (impromptu turns), judging structure, content and delivery separately, and pausing practice.",
        url: "https://www.toastmasters.org",
      },
      {
        citation: "Reece J.M (@progress.playground) — speech and communication coach.",
        usedFor: "Association chains (Word Chain), the 'vocally lazy' drills, annotated reading (Mark It Up) and the emotion wheel.",
        url: "https://www.instagram.com/progress.playground/",
      },
      {
        citation: "*Just a Minute.* BBC Radio 4 (1967–present).",
        usedFor: "The inspiration for the Sixty seconds drill — talking for a minute without hesitation, repetition or deviation.",
        url: "https://www.bbc.co.uk/programmes/b006s5dp",
      },
    ],
  },
  {
    title: "Research — voice, delivery and breath",
    sources: [
      {
        citation: "Krahmer, E., & Swerts, M. (2007). The effects of visual beats on prosodic prominence. *Journal of Memory and Language, 57*(3), 396–414.",
        usedFor: "Gestures make spoken emphasis stronger (Move It, emphasis lessons).",
        url: doi("10.1016/j.jml.2007.06.005"),
      },
      {
        citation: "Pouw, W., Harrison, S. J., & Dixon, J. A. (2020). Gesture–speech physics. *Journal of Experimental Psychology: General, 149*(2), 391–404.",
        usedFor: "Arm movement shapes pitch and loudness peaks.",
        url: doi("10.1037/xge0000646"),
      },
      {
        citation: "Foote, J. A., & McDonough, K. (2017). Using shadowing with mobile technology to improve L2 pronunciation. *Journal of Second Language Pronunciation, 3*(1), 34–56.",
        usedFor: "Shadowing for rhythm and intonation.",
        url: doi("10.1075/jslp.3.1.02foo"),
      },
      {
        citation: "Blankenship, K. L., & Holtgraves, T. (2005). The role of different markers of linguistic powerlessness in persuasion. *Journal of Language and Social Psychology, 24*(1), 3–24.",
        usedFor: "Why hedges ('kind of', 'I think') weaken a point.",
        url: doi("10.1177/0261927X04273034"),
      },
      {
        citation: "Clark, H. H., & Fox Tree, J. E. (2002). Using uh and um in spontaneous speaking. *Cognition, 84*(1), 73–111.",
        usedFor: "Why a few ums are normal — they tell listeners you're still thinking.",
        url: doi("10.1016/S0010-0277(02)00017-3"),
      },
      {
        citation: "Mancuso, C., & Miltenberger, R. G. (2016). Using habit reversal to decrease filled pauses in public speaking. *Journal of Applied Behavior Analysis, 49*(1), 188–192.",
        usedFor: "Catch each um as it happens, then pause instead — 'Pause instead of um'.",
        url: doi("10.1002/jaba.267"),
      },
      {
        citation: "Hoit, J. D., Plassman, B. L., Lansing, R. W., & Hixon, T. J. (1988). Abdominal muscle activity during speech production. *Journal of Applied Physiology, 65*(6), 2656–2664.",
        usedFor: "Why 'breathe low': the belly muscles work while you speak.",
        url: doi("10.1152/jappl.1988.65.6.2656"),
      },
      {
        citation: "Winkworth, A. L., Davis, P. J., Adams, R. D., & Ellis, E. (1995). Breathing patterns during spontaneous speech. *Journal of Speech and Hearing Research, 38*(1), 124–144.",
        usedFor: "Breaths fall at phrase and sentence ends — one breath, one phrase.",
        url: doi("10.1044/jshr.3801.124"),
      },
      {
        citation: "Winkworth, A. L., & Davis, P. J. (1997). Speech breathing and the Lombard effect. *Journal of Speech, Language, and Hearing Research, 40*(1), 159–169.",
        usedFor: "Speaking louder takes bigger breaths — breath behind the volume.",
        url: doi("10.1044/jslhr.4001.159"),
      },
      {
        citation: "Balban, M. Y., Neri, E., Kogon, M. M., et al. (2023). Brief structured respiration practices enhance mood and reduce physiological arousal. *Cell Reports Medicine, 4*(1), 100895.",
        usedFor: "Cyclic sighing and long out-breaths to settle nerves (Calm in a minute, and the calming-sigh warm-up).",
        url: doi("10.1016/j.xcrm.2022.100895"),
      },
    ],
  },
  {
    title: "Research — conversation and nerves",
    sources: [
      {
        citation: "Fisher, R. P., & Geiselman, R. E. (1992). *Memory-Enhancing Techniques for Investigative Interviewing: The Cognitive Interview.* Charles C Thomas.",
        usedFor: "Rewind: say everything however small, picture where you were, and go through it in order or backwards to remember more.",
      },
      {
        citation: "Beck, A. T., Rush, A. J., Shaw, B. F., & Emery, G. (1979). *Cognitive Therapy of Depression.* Guilford Press.",
        usedFor: "Talk back: weighing a thought against the evidence for and against it.",
      },
      {
        citation: "Greenberger, D., & Padesky, C. A. (1995). *Mind Over Mood: Change How You Feel by Changing the Way You Think.* Guilford Press.",
        usedFor: "Talk back: the thought record, adapted — what makes a thought feel true, what doesn't fit, and a more balanced version.",
      },
      {
        citation: "Kross, E., Bruehlman-Senecal, E., Park, J., et al. (2014). Self-talk as a regulatory mechanism: How you do it matters. *Journal of Personality and Social Psychology, 106*(2), 304–324.",
        usedFor: "Three things: saying things to yourself as \"you\" or by name, which lowered anxiety before a speech.",
        url: doi("10.1037/a0035173"),
      },
      {
        citation: "Creswell, J. D., Welch, W. T., Taylor, S. E., et al. (2005). Affirmation of personal values buffers neuroendocrine and psychological stress responses. *Psychological Science, 16*(11), 846–851.",
        usedFor: "Three things: why writing down what you value and do well steadies you under stress.",
        url: doi("10.1111/j.1467-9280.2005.01624.x"),
      },
      {
        citation: "Clark, D. M., & Wells, A. (1995). A cognitive model of social phobia. In R. G. Heimberg et al. (Eds.), *Social Phobia: Diagnosis, Assessment, and Treatment* (pp. 69–93). Guilford Press.",
        usedFor: "Self-focused attention and safety behaviours — why attention outward helps.",
      },
      {
        citation: "Hofmann, S. G. (2007). Cognitive factors that maintain social anxiety disorder. *Cognitive Behaviour Therapy, 36*(4), 193–209.",
        usedFor: "Post-event rumination — why a debrief starts with what went okay.",
        url: doi("10.1080/16506070701421313"),
      },
      {
        citation: "Leigh, E., Chiu, K., & Clark, D. M. (2021). Self-focused attention and safety behaviours maintain social anxiety in adolescents. *PLOS ONE, 16*(2), e0247703.",
        usedFor: "Dropping safety behaviours, as in 'Set down the rehearsal'.",
        url: doi("10.1371/journal.pone.0247703"),
      },
      {
        citation: "Eysenck, M. W., Derakshan, N., Santos, R., & Calvo, M. G. (2007). Anxiety and cognitive performance: Attentional control theory. *Emotion, 7*(2), 336–353.",
        usedFor: "Why nerves make blanking more likely, and the attention lessons.",
        url: doi("10.1037/1528-3542.7.2.336"),
      },
      {
        citation: "Brooks, A. W. (2014). Get excited: Reappraising pre-performance anxiety as excitement. *Journal of Experimental Psychology: General, 143*(3), 1144–1158.",
        usedFor: "Saying 'I'm excited' rather than trying to calm down.",
        url: doi("10.1037/a0035325"),
      },
      {
        citation: "Huang, K., Yeomans, M., Brooks, A. W., Minson, J., & Gino, F. (2017). It doesn't hurt to ask: Question-asking increases liking. *Journal of Personality and Social Psychology, 113*(3), 430–452.",
        usedFor: "Follow-up questions in the conversation lessons.",
        url: doi("10.1037/pspi0000097"),
      },
      {
        citation: "Boothby, E. J., Cooney, G., Sandstrom, G. M., & Clark, M. S. (2018). The liking gap in conversations. *Psychological Science, 29*(11), 1742–1756.",
        usedFor: "People like you more than you think after a conversation.",
        url: doi("10.1177/0956797618783714"),
      },
      {
        citation: "Stivers, T., Enfield, N. J., Brown, P., et al. (2009). Universals and cultural variation in turn-taking in conversation. *PNAS, 106*(26), 10587–10592.",
        usedFor: "The reply window, turn-taking drills, and handing the turn back in 'Land the plane'.",
        url: doi("10.1073/pnas.0903616106"),
      },
      {
        citation: "Cunningham, M. R. (1989). Reactions to heterosexual opening gambits: Female selectivity and male responsiveness. *Personality and Social Psychology Bulletin, 15*(1), 27–41.",
        usedFor: "Plain openers get warmer responses than cute ones — 'Open with what's here'.",
        url: doi("10.1177/0146167289151003"),
      },
      {
        citation: "Mastroianni, A. M., Gilbert, D. T., Cooney, G., & Wilson, T. D. (2021). Do conversations end when people want them to? *PNAS, 118*(10), e2011809118.",
        usedFor: "Conversations rarely end when either person wants them to — 'Leaving gracefully'.",
        url: doi("10.1073/pnas.2011809118"),
      },
      {
        citation: "Hall, J. A., Carter, S., Cody, M. J., & Albright, J. M. (2010). Individual differences in the communication of romantic interest. *Communication Quarterly, 58*(4), 365–393.",
        usedFor: "'Kind teasing, real curiosity' — flirting styles vary a lot, so no line works on everyone.",
        url: doi("10.1080/01463373.2010.524874"),
      },
      {
        citation: "Tagalidou, N., Loderer, V., Distlberger, E., & Laireiter, A.-R. (2018). Feasibility of a humor training to promote humor and decrease stress. *Frontiers in Psychology, 9*, 577.",
        usedFor: "Humor as a skill you can practice.",
        url: doi("10.3389/fpsyg.2018.00577"),
      },
      {
        citation: "Seppänen, S., Toivanen, T., Makkonen, T., et al. (2020). Effects of improvisation training on student teachers' responses during the Trier Social Stress Test. *Adaptive Human Behavior and Physiology, 6*(3), 356–380.",
        usedFor: "Improv practice and calmer speaking under pressure.",
        url: doi("10.1007/s40750-020-00145-1"),
      },
    ],
  },
  {
    title: "Research — feelings",
    sources: [
      {
        citation: "Willcox, G. (1982). The Feeling Wheel. *Transactional Analysis Journal, 12*(4), 274–276.",
        usedFor: "The feelings wheel.",
        url: doi("10.1177/036215378201200411"),
      },
      {
        citation: "Lieberman, M. D., Eisenberger, N. I., Crockett, M. J., et al. (2007). Putting feelings into words. *Psychological Science, 18*(5), 421–428.",
        usedFor: "Naming a feeling takes some of its edge off.",
        url: doi("10.1111/j.1467-9280.2007.01916.x"),
      },
      {
        citation: "Kashdan, T. B., Barrett, L. F., & McKnight, P. E. (2015). Unpacking emotion differentiation. *Current Directions in Psychological Science, 24*(1), 10–16.",
        usedFor: "Finer feeling words, not just 'good' or 'bad'.",
        url: doi("10.1177/0963721414550708"),
      },
      {
        citation: "Pennebaker, J. W. (1997). Writing about emotional experiences as a therapeutic process. *Psychological Science, 8*(3), 162–166.",
        usedFor: "Speaking about a real feeling, briefly and honestly.",
        url: doi("10.1111/j.1467-9280.1997.tb00403.x"),
      },
    ],
  },
  {
    title: "Research — learning and habits",
    sources: [
      {
        citation: "Silverman, J., & Barasch, A. (2023). On or off track: How (broken) streaks affect consumer decisions. *Journal of Consumer Research*.",
        usedFor: "Why a missed day can derail a habit, and why streak freezes cover a miss for you.",
      },
      {
        citation: "Wilson, R. C., Shenhav, A., Straccia, M., & Cohen, J. D. (2019). The eighty five percent rule for optimal learning. *Nature Communications, 10*, 4646.",
        usedFor: "Drills adjust so you succeed about 85% of the time.",
        url: doi("10.1038/s41467-019-12552-4"),
      },
      {
        citation: "Kaernbach, C. (1991). Simple adaptive testing with the weighted up-down method. *Perception & Psychophysics, 49*(3), 227–229.",
        usedFor: "How drill difficulty steps up and down.",
        url: doi("10.3758/BF03214307"),
      },
      {
        citation: "Cepeda, N. J., Pashler, H., Vul, E., Wixted, J. T., & Rohrer, D. (2006). Distributed practice in verbal recall tasks. *Psychological Bulletin, 132*(3), 354–380.",
        usedFor: "Spacing sessions through the day (the daily goal).",
        url: doi("10.1037/0033-2909.132.3.354"),
      },
      {
        citation: "Gollwitzer, P. M. (1999). Implementation intentions: Strong effects of simple plans. *American Psychologist, 54*(7), 493–503.",
        usedFor: "The 'After I ___, I'll practice' plan from onboarding.",
        url: doi("10.1037/0003-066X.54.7.493"),
      },
      {
        citation: "Gollwitzer, P. M., & Sheeran, P. (2006). Implementation intentions and goal achievement: A meta-analysis. *Advances in Experimental Social Psychology, 38*, 69–119.",
        usedFor: "Why that plan helps you follow through.",
        url: doi("10.1016/S0065-2601(06)38002-1"),
      },
    ],
  },
  {
    title: "Practices and traditions",
    sources: [
      {
        citation: "PREP (point, reason, example, point).",
        usedFor: "A widely taught business-speaking structure with no single author.",
      },
      {
        citation: "STAR (situation, task, action, result) — the standard structure for behavioral interview answers.",
        usedFor: "'Tell me about a time…' answers.",
      },
      {
        citation: "The tricolon — the rule of three in classical rhetoric.",
        usedFor: "Lists of three in the structure and rhythm lessons.",
      },
      {
        citation: "Bottom line up front (BLUF), from military writing.",
        usedFor: "Leading with the point in 'Headline first'.",
      },
      {
        citation: "Verbal fluency tasks (naming words in a category or starting with a letter).",
        usedFor: "Word retrieval drills. A standard neuropsychology task, adapted.",
      },
      {
        citation: "Script marking from broadcast and stage training.",
        usedFor: "Pause bars, stress and arrows in Mark It Up.",
      },
      {
        citation: "Everyday speaking-coach and voice warm-up practice.",
        usedFor: "Lessons credited to 'speaking-coach practice' or 'warm-up practice' — common exercises (humming, lip trills, compression drills) with no single source.",
      },
      {
        citation: "Filler-word rates (about 5 a minute barely registers; over 10 distracts).",
        usedFor: "A common coaching rule of thumb, not a single study — used to color filler counts.",
      },
    ],
  },
];
