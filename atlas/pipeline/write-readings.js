#!/usr/bin/env node
/* The authored layer.
 *
 *   node pipeline/write-readings.js      # -> static/readings.json
 *
 * Records are derived by build-corpus.js from Wikidata. Everything here is
 * written, and is one of two kinds:
 *
 *   attested — someone involved said it, and it can be sourced. Confidence
 *              0.6-0.99: a statement of influence is evidence, but a director
 *              saying "I was thinking of X" does not make the structural claim
 *              automatically true.
 *   reading  — an interpretive claim about form. Arguable, mine, labelled.
 *
 * REGISTER. The audience is anyone, at any level of familiarity. A claim like
 * "the step-printed slow motion in crowded corridors" is precise and also a
 * locked door to everyone who has not seen the film. Every claim here should
 * name the specific thing AND let a newcomer picture it. Not simplified —
 * a good claim teaches you how to watch the film.
 *
 * WHAT I CANNOT DO. These were written from criticism and description, not
 * from having watched the films. For documented influence that is fine and
 * citable. For fine-grained formal claims it is a real limit, and some of
 * these will be wrong in ways a viewer would catch instantly. Confidence
 * values reflect that; the low ones are low on purpose. Cut freely.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const corpus = JSON.parse(fs.readFileSync(path.join(ROOT, "static", "corpus.json"), "utf8"));

/* r = reading, at = attested. Strength is how tightly the two are formally
   bound; confidence is how defensible the claim is as fact. */
const r = (a, b, type, from, strength, confidence, claim) =>
  ({ a, b, type, from, strength, confidence, claim, source: "reading" });
const at = (a, b, type, from, strength, confidence, claim, attribution) =>
  ({ a, b, type, from, strength, confidence, claim, source: "attested", attribution });

const EDGES = [

  /* ---------- attested: someone involved said so ---------- */
  at("the hidden fortress", "star wars episode iv a new hope", "descent", "a", 0.78, 0.88,
    "Lucas took the trick of telling a war story from the two most powerless people in it — here, squabbling peasants; there, two droids.",
    "Lucas, repeatedly in interviews and the Star Wars production histories"),
  at("2001 a space odyssey", "solaris", "rebuttal", "b", 0.8, 0.82,
    "Tarkovsky thought Kubrick's version of space was cold and phoney, and answered it with a station full of water, grief and clutter.",
    "Tarkovsky, Sculpting in Time, and contemporaneous interviews"),
  at("2001 a space odyssey", "interstellar", "descent", "a", 0.83, 0.85,
    "Nolan built from it openly: a silent slab of a machine as the crew's companion, and a final act that abandons physics for a room outside time.",
    "Nolan in press interviews around the 2014 release"),
  at("lawrence of arabia", "dune", "descent", "a", 0.79, 0.8,
    "Villeneuve has named it as the model: an outsider absorbed into a desert people, filmed so the landscape dwarfs the politics.",
    "Villeneuve in interviews around Dune (2021)"),
  at("2001 a space odyssey", "sunshine", "descent", "a", 0.7, 0.72,
    "Boyle sent a crew toward a sublime object with a talking ship for company, and has been open about where the shape came from.",
    "Boyle in interviews and the Sunshine production commentary"),
  at("stalker", "annihilation", "descent", "a", 0.75, 0.7,
    "A fenced-off zone that rewrites whoever walks into it, entered by a small expedition that will not come back whole.",
    "Garland has cited Tarkovsky as a direct influence"),

  /* ---------- Wong Kar-wai outward ---------- */
  r("2046", "vertigo", "rhyme", "none", 0.7, 0.44,
    "A man who cannot stop rebuilding a woman he lost — dressing her double in the same clothes, staging the same encounter again."),
  r("2046", "inception", "rhyme", "none", 0.68, 0.4,
    "Both men design a private architecture whose real purpose is to keep meeting the dead woman inside it."),
  r("2046", "blade runner 2049", "convergence", "none", 0.66, 0.42,
    "A manufactured woman built to be someone's company, and a film that keeps asking whether that makes her less real."),
  r("2046", "la jetee", "rhyme", "none", 0.64, 0.4,
    "Time travel used as a description of memory: the traveller keeps arriving at the same face and cannot get past it."),
  r("chungking express", "rear window", "rhyme", "none", 0.6, 0.36,
    "Falling for someone by watching their room — courtship conducted almost entirely as surveillance from a fixed vantage."),
  r("chungking express", "lost in translation", "convergence", "none", 0.65, 0.46,
    "Two strangers adrift in a loud city, the film built from near-misses at food counters and hotel bars rather than from a plot."),
  r("chungking express", "sans soleil", "convergence", "none", 0.55, 0.35,
    "The city taken in as texture — signage, crowds, snatched glimpses — with a voice over the top turning it into memory."),
  r("fallen angels", "brazil", "rhyme", "none", 0.56, 0.33,
    "Lenses so wide the rooms bend, everybody crammed to the edges of a frame that has too much stuff in it."),
  r("fallen angels", "a clockwork orange", "rhyme", "none", 0.54, 0.31,
    "Young people committing violence in a city shot like a nightclub, the camera closer to them than the film's judgement is."),
  r("fallen angels", "blade runner", "rhyme", "none", 0.57, 0.34,
    "A night city where neon and rain are the only weather, and every interior is lit by somebody else's sign."),
  r("happy together", "brief encounter", "convergence", "none", 0.62, 0.42,
    "A love affair conducted almost entirely in transit — rented rooms, stations, borrowed time — and narrated from after it ends."),
  r("happy together", "portrait of a lady on fire", "convergence", "none", 0.63, 0.42,
    "A relationship told from inside its own ending, so every scene arrives already shaped like a memory of itself."),
  r("days of being wild", "late spring", "rhyme", "none", 0.55, 0.34,
    "A parent and child circling something neither will say, staged in still domestic rooms the camera refuses to leave."),
  r("days of being wild", "vertigo", "rhyme", "none", 0.52, 0.3,
    "A man organising his whole life around a woman who is partly invented, and a film that lets him."),
  r("the grandmaster", "the prestige", "convergence", "none", 0.61, 0.4,
    "Mastery as a closed craft passed between rivals, with the secret technique withheld from us as long as possible."),
  r("the grandmaster", "seven samurai", "descent", "a", 0.6, 0.38,
    "Fighting filmed as inherited discipline — schools, lineages, a technique with a history — rather than as spectacle."),
  r("ashes of time", "yojimbo", "convergence", "none", 0.64, 0.44,
    "A swordsman for hire who sells himself to both sides of a feud and keeps the profit, filmed with no interest in his heroism."),
  r("ashes of time", "once upon a time in the west", "rhyme", "none", 0.58, 0.37,
    "A genre slowed to a crawl and turned elegiac: faces held enormous against empty land while almost nothing happens."),
  r("ashes of time", "the good the bad and the ugly", "rhyme", "none", 0.55, 0.33,
    "Mercenaries drifting through a desert with no cause between them, the landscape doing the moral commentary."),

  /* ---------- Ozu, Mizoguchi, and outward from Japan ---------- */
  r("late spring", "brief encounter", "convergence", "none", 0.64, 0.44,
    "The climax is a refusal: someone gives up the life they want, and the camera stays politely outside the grief."),
  r("late spring", "portrait of a lady on fire", "rhyme", "none", 0.58, 0.37,
    "A woman's future settled by family arrangement, filmed as a series of quiet rooms she is placed in rather than chooses."),
  r("late spring", "ikiru", "convergence", "none", 0.56, 0.36,
    "A life measured near its end, told through small administrative errands rather than through any dramatic reckoning."),
  r("early summer", "the life of oharu", "convergence", "none", 0.6, 0.4,
    "Two 1950s Japanese films on the same subject from opposite temperaments: a woman's worth negotiated by everyone but her."),
  r("early summer", "lost in translation", "rhyme", "none", 0.5, 0.3,
    "A woman politely present at gatherings she has no stake in, the film noticing her drift before she does."),
  r("early summer", "tokyo story", "convergence", "none", 0.54, 0.33,
    "A family photographed at table height, its slow dispersal registered in who is sitting where."),
  r("the life of oharu", "ran", "rhyme", "none", 0.58, 0.36,
    "A long fall from status told as a series of expulsions, each one filmed at a greater distance than the last."),
  r("the life of oharu", "portrait of a lady on fire", "rebuttal", "b", 0.64, 0.44,
    "A life narrated through the men who trade over her, answered by a film in which the looking belongs to the women."),
  r("ikiru", "tokyo story", "convergence", "none", 0.68, 0.47,
    "Two 1950s films arriving separately at the same man: elderly, decent, and quietly surplus to the city he helped rebuild."),
  r("kwaidan", "ugetsu", "descent", "b", 0.7, 0.52,
    "Classical ghost stories staged against painted skies — the supernatural handled as theatre design rather than as effect."),
  r("kwaidan", "the shining", "rhyme", "none", 0.56, 0.34,
    "Dread built from colour and ceremony: long corridors, saturated artificial light, a haunting that takes its time."),
  r("the woman in the dunes", "stalker", "convergence", "none", 0.66, 0.45,
    "A bounded place that reorganises the person trapped in it until escaping stops being the point."),
  r("the woman in the dunes", "the shining", "rhyme", "none", 0.57, 0.35,
    "The location is the antagonist — sand or hotel — and the film is mostly the slow discovery that there is no outside."),
  r("sansho the bailiff", "ran", "rhyme", "none", 0.56, 0.35,
    "A family taken apart by power, filmed in wide static shots that decline to come closer for the suffering."),
  r("high and low", "psycho", "rhyme", "none", 0.54, 0.33,
    "A film that changes genre at the midpoint, abandoning the room it built to follow the city underneath it."),
  r("throne of blood", "ran", "convergence", "none", 0.5, 0.3,
    "Shakespeare relocated to Japanese feudal war, with weather and fog doing the work of soliloquy."),
  r("throne of blood", "the shining", "rhyme", "none", 0.52, 0.31,
    "A man walked toward his fate through fog or corridors by a building that seems to know the ending first."),
  r("sanjuro", "the good the bad and the ugly", "descent", "a", 0.6, 0.4,
    "The bored, scratching, entirely unromantic gunman — a hero written as an inconvenience to everyone around him."),
  r("tokyo story", "sans soleil", "convergence", "none", 0.53, 0.33,
    "Tokyo as a place that keeps overwriting itself, watched by someone trying to hold onto what it used to be."),

  /* ---------- Hitchcock outward ---------- */
  r("psycho", "alien", "descent", "a", 0.74, 0.56,
    "The person you thought was the protagonist is killed early, and the film continues without a guide in a hostile building."),
  r("psycho", "jaws", "rhyme", "none", 0.58, 0.36,
    "An ordinary place people go to relax made permanently unsafe, with the threat withheld until the audience supplies it."),
  r("rear window", "the prestige", "rhyme", "none", 0.52, 0.31,
    "Watching as method: a man who solves the problem by observing obsessively, and the film adopting his exact vantage."),
  r("north by northwest", "sicario", "convergence", "none", 0.57, 0.36,
    "Someone hauled across a landscape by an agency that will not explain itself, adjusting from bewilderment to complicity."),
  r("north by northwest", "once upon a time in the west", "rhyme", "none", 0.6, 0.4,
    "A wide-open nowhere, a very long wait, and violence arriving into an empty frame the film has made us study."),
  r("vertigo", "inception", "rhyme", "none", 0.62, 0.39,
    "A man building a scenario in which to keep meeting the woman whose death he caused, and calling it work."),
  r("vertigo", "12 monkeys", "rhyme", "none", 0.56, 0.35,
    "Circling one remembered scene until he walks into it and finds it was always his own death he was remembering."),

  /* ---------- Kubrick, Nolan, Gilliam, the designed system ---------- */
  r("a clockwork orange", "metropolis", "rhyme", "none", 0.56, 0.34,
    "The state as choreographer: bodies moved in formation through architecture built to make them look small."),
  r("a clockwork orange", "brazil", "convergence", "none", 0.63, 0.42,
    "Institutional cruelty delivered cheerfully, with paperwork and pop music where the horror should be."),
  r("a clockwork orange", "28 days later", "rhyme", "none", 0.55, 0.33,
    "An emptied Britain shot in real streets, the familiar made strange by nothing more than absence."),
  r("the shining", "stalker", "convergence", "none", 0.6, 0.38,
    "A space with rules of its own that the men inside keep testing, filmed in long takes that make the walking the story."),
  r("brazil", "metropolis", "descent", "a", 0.69, 0.48,
    "The city as one enormous machine, with a clerk lost somewhere in its ducts and the machinery given the best shots."),
  r("brazil", "the woman in the dunes", "rhyme", "none", 0.5, 0.29,
    "A man buried in a task that cannot be completed, whose absurdity the film treats with total procedural seriousness."),
  r("the prestige", "rashomon", "convergence", "none", 0.65, 0.44,
    "Two self-serving accounts of the same events, with the film refusing to say which notebook is lying."),
  r("the prestige", "ex machina", "rhyme", "none", 0.55, 0.33,
    "A demonstration staged for one spectator, where the real trick is what the demonstrator wants from the watching."),
  r("inception", "solaris", "rhyme", "none", 0.72, 0.5,
    "A dead wife who keeps manifesting inside the mission and sabotaging it, because the man cannot let her stay dead."),
  r("interstellar", "solaris", "convergence", "none", 0.63, 0.41,
    "Grief treated as something with physical reach, and the reunion staged in a room that cannot exist."),

  /* ---------- Tarkovsky and the essay film ---------- */
  r("the mirror", "sans soleil", "convergence", "none", 0.66, 0.44,
    "Memory assembled as essay rather than story, with the voice and the images deliberately out of step."),
  r("the mirror", "la jetee", "rhyme", "none", 0.6, 0.4,
    "Memory as a handful of still images returned to over and over, until the returning is the plot."),
  r("the mirror", "tokyo story", "rhyme", "none", 0.52, 0.31,
    "A family remembered in fragments, with the camera lingering after everyone has left the room."),
  r("andrei rublev", "seven samurai", "rhyme", "none", 0.58, 0.36,
    "Skilled work carried on inside historical violence — the craftsman's discipline against a countryside being burned."),
  r("andrei rublev", "ran", "rhyme", "none", 0.57, 0.35,
    "A medieval epic where the spectacle of war is staged at enormous cost in order to be found meaningless."),
  r("andrei rublev", "lawrence of arabia", "convergence", "none", 0.55, 0.34,
    "An epic whose subject withdraws into silence, the scale of the production turned against its own hero."),
  r("solaris", "arrival", "convergence", "none", 0.66, 0.44,
    "First contact treated as a problem of grief rather than of technology; the alien mostly returns your own losses."),

  /* ---------- science fiction and the withheld creature ---------- */
  r("metropolis", "blade runner", "descent", "a", 0.71, 0.5,
    "The city as a vertical diagram of class — light and towers at the top, the labour that runs it hidden underneath."),
  r("metropolis", "ex machina", "descent", "a", 0.68, 0.46,
    "The artificial woman built to be tested by the man who made her, with the testing becoming the film's whole structure."),
  r("metropolis", "star wars episode iv a new hope", "rhyme", "none", 0.46, 0.3,
    "The humanoid machine given the most expressive face on screen; the gleaming false Maria is the shape C-3PO inherits."),
  r("blade runner", "ex machina", "convergence", "none", 0.71, 0.5,
    "The interview as the central form: a person questioning a machine to decide whether it counts as one."),
  r("blade runner", "2001 a space odyssey", "convergence", "none", 0.6, 0.4,
    "The most human speech in the film is given to the artificial mind, and staged as its death."),
  r("jaws", "alien", "rhyme", "none", 0.66, 0.46,
    "The creature kept out of frame, a small crew picked off one at a time inside a vessel nobody can leave."),
  r("alien", "sunshine", "rhyme", "none", 0.58, 0.36,
    "A working crew rather than heroes, undone in corridors by something the film keeps mostly off-screen."),
  r("aliens", "seven samurai", "descent", "a", 0.63, 0.4,
    "A squad assembled and introduced one skill at a time, then dug into a fixed position against numbers they cannot beat."),
  r("aliens", "sicario", "rhyme", "none", 0.56, 0.34,
    "The newcomer taken into a professional unit's operation and slowly realising the mission is not the one described."),
  r("close encounters of the third kind", "arrival", "rebuttal", "b", 0.72, 0.5,
    "First contact as awe, answered by first contact as work: the light show replaced by the grind of translation."),
  r("close encounters of the third kind", "2001 a space odyssey", "descent", "a", 0.58, 0.37,
    "Contact staged as a religious event — light, scale, silence — with the human characters reduced to witnesses."),
  r("28 days later", "jaws", "rhyme", "none", 0.5, 0.29,
    "A public place emptied by a threat the authorities will not name, filmed with documentary flatness."),
  r("dune", "star wars episode iv a new hope", "rhyme", "none", 0.58, 0.36,
    "A desert planet, a chosen adolescent, a mystical order behind the throne — the same furniture, arranged more soberly."),
  r("dune", "lawrence of arabia", "descent", "a", 0.74, 0.55,
    "An outsider adopted by a desert people and remade into their prophecy, with the sand given more screen time than the plot."),
  r("blade runner 2049", "solaris", "rhyme", "none", 0.58, 0.36,
    "A man attended by a companion who may be a projection of what he needs, and a film that declines to settle it."),
  r("sicario", "the good the bad and the ugly", "rhyme", "none", 0.54, 0.32,
    "A border filmed as a lawless middle where three parties want incompatible things and none of them is clean."),
  r("12 monkeys", "brazil", "rhyme", "none", 0.5, 0.3,
    "A bureaucracy in charge of a catastrophe, filmed with the same cluttered wide lenses that make institutions look mad."),
  r("star wars episode v the empire strikes back", "the hidden fortress", "descent", "b", 0.6, 0.4,
    "A retreat across hostile country with the party split up, much of it seen from its least powerful members."),
  r("seven samurai", "star wars episode iv a new hope", "descent", "a", 0.66, 0.46,
    "The recruitment sequence as a genre engine: each member introduced through one demonstration of what they can do."),
  r("rashomon", "la jetee", "rhyme", "none", 0.47, 0.33,
    "Memory presented as unreliable testimony, the images quietly withholding what the narration insists on."),
  r("in the mood for love", "lost in translation", "convergence", "none", 0.61, 0.42,
    "Two people thrown together in a hotel, the whole film built out of the corridor between their rooms."),
  r("in the mood for love", "portrait of a lady on fire", "rebuttal", "b", 0.69, 0.48,
    "The withheld glance answered by a look returned directly — longing made mutual instead of missed."),
  r("tokyo story", "in the mood for love", "convergence", "none", 0.52, 0.36,
    "The still, waist-height interior as the shape of everything the characters have decided not to say."),
  r("vertigo", "in the mood for love", "rhyme", "none", 0.62, 0.39,
    "The same encounter restaged again and again, with costume changes standing in for a confession neither will make."),
  r("ugetsu", "in the mood for love", "rhyme", "none", 0.48, 0.32,
    "The camera tracking sideways past screens and partitions that hide the face exactly when it matters most."),
  r("brief encounter", "in the mood for love", "descent", "a", 0.74, 0.55,
    "Restraint used as structure: an affair conducted entirely in public meeting places and never once acted on."),

  /* ==================================================================
     SECOND PASS. The first 93 readings all hung off the original 67
     films, so 738 films had no authored edge at all and their maps were
     almost entirely genre-and-era coincidence. These target the films
     measured as worst off: high degree, and six lines of trivia.

     Chosen in clusters rather than spread evenly. A reading is only
     worth writing where there is a real formal argument to make, and
     arguments come in families — documentary and staging, the body
     against architecture, the western doubting itself. Clustering also
     means each newly covered film gets several edges rather than one,
     which is what decides whether it survives ranking.
     ================================================================== */

  /* ---------- documentary, and the staging inside it ---------- */
  r("nanook of the north", "the act of killing", "rhyme", "none", 0.7, 0.5,
    "Both films get their subjects to act their own lives for the camera — and both are most revealing exactly where the performance shows."),
  r("nanook of the north", "man with a movie camera", "convergence", "none", 0.58, 0.42,
    "Two 1920s films inventing opposite documentary instincts: one builds a story out of real life, the other shows you the machinery doing the building."),
  r("man with a movie camera", "koyaanisqatsi", "descent", "a", 0.74, 0.55,
    "A city cut to music with nobody speaking, the day assembled out of rhythm rather than narration."),
  r("man with a movie camera", "baraka", "descent", "a", 0.62, 0.44,
    "The wordless montage taken worldwide: faces, labour and machinery rhymed across places that never share a scene."),
  r("koyaanisqatsi", "baraka", "descent", "a", 0.76, 0.6,
    "The same instrument — time-lapse crowds, aerial landscape, no dialogue — turned from indictment toward awe."),
  r("the thin blue line", "the act of killing", "descent", "a", 0.72, 0.5,
    "Reenactment used as evidence: the crime staged repeatedly, each version exposing what the last one wanted to leave out."),
  r("the thin blue line", "close up", "convergence", "none", 0.64, 0.45,
    "A real case reopened by having the actual people replay it, until the replay becomes the more truthful record."),
  r("close up", "this is not a film", "descent", "a", 0.68, 0.48,
    "Iranian cinema turning its own restrictions into form — a film about whether what you are watching counts as a film at all."),
  r("the act of killing", "shoah", "rebuttal", "b", 0.66, 0.46,
    "Opposite ethics for filming atrocity: one refuses every reconstruction and stays on the speaking face, the other hands the perpetrators a camera."),
  r("dont look back", "sherman s march", "descent", "a", 0.6, 0.44,
    "Handheld, available light, no interviews — the filmmaker simply present until people forget to perform."),
  r("sherman s march", "the gleaners and i", "convergence", "none", 0.63, 0.45,
    "The director turns the camera on themselves and lets the announced subject drift, until the digression is the film."),
  r("grizzly man", "the act of killing", "rhyme", "none", 0.58, 0.4,
    "A film assembled around a subject who was already filming himself, and which has to decide what to do with his performance."),
  r("f for fake", "the act of killing", "rhyme", "none", 0.55, 0.38,
    "The documentary that admits on screen that it is manipulating you, and dares you to keep trusting it."),
  r("man on wire", "the thin blue line", "convergence", "none", 0.56, 0.4,
    "Documentary built like a heist thriller: reconstruction, score and withheld information used to generate suspense about a known outcome."),
  r("man on wire", "safety last", "rhyme", "none", 0.54, 0.36,
    "A tiny figure very high above a city street, and a film that will not let you stop thinking about the drop."),
  r("hoop dreams", "killer of sheep", "convergence", "none", 0.52, 0.36,
    "Years of ordinary time in a Black American neighbourhood, filmed without an engine of plot to hurry it along."),

  /* ---------- the body against machinery and architecture ---------- */
  r("the general", "steamboat bill jr", "rhyme", "none", 0.66, 0.5,
    "Keaton against a machine too big to argue with — a locomotive, then a cyclone — with the gag and the danger performed in the same unbroken shot."),
  r("safety last", "the general", "convergence", "none", 0.6, 0.44,
    "The stunt done for real and held in wide shot, because cutting away would be the same as admitting it was faked."),
  r("the general", "mad max 2", "descent", "a", 0.64, 0.44,
    "A whole film staged as one pursuit along a single line of travel, with the geography kept legible enough that you always know who is gaining."),
  r("modern times", "playtime", "descent", "a", 0.7, 0.52,
    "The modern building treated as an antagonist: a man defeated less by people than by doors, surfaces and machines that were designed without him in mind."),
  r("city lights", "modern times", "rhyme", "none", 0.6, 0.45,
    "Sound arrives and the tramp still will not speak — the silence kept deliberately, as the last thing that makes him himself."),
  r("playtime", "jeanne dielman 23 quai du commerce 1080 bruxelles", "rhyme", "none", 0.6, 0.42,
    "The fixed wide shot that refuses to tell you where to look, leaving you to find the event somewhere in the frame."),
  r("playtime", "news from home", "convergence", "none", 0.58, 0.4,
    "The city composed as glass, grid and traffic, with people reduced to something moving through the architecture."),
  r("news from home", "sans soleil", "rhyme", "none", 0.62, 0.44,
    "A voice reading letters over footage of a city, until the images stop being the place and become somebody's memory of it."),
  r("news from home", "jeanne dielman 23 quai du commerce 1080 bruxelles", "descent", "b", 0.66, 0.5,
    "Duration as the subject: the shot held long past the point of information, so that waiting becomes what the film is about."),
  r("a ghost story", "jeanne dielman 23 quai du commerce 1080 bruxelles", "rhyme", "none", 0.57, 0.38,
    "A single unbroken take of someone eating, held so long that boredom turns into dread."),
  r("a ghost story", "2001 a space odyssey", "rhyme", "none", 0.55, 0.36,
    "A cut that jumps across centuries in one move, and a figure left watching time from outside it."),

  /* ---------- neorealism, and the films that inherited it ---------- */
  r("killer of sheep", "bicycle thieves", "descent", "b", 0.72, 0.52,
    "Non-professional actors, real streets, and a plot that refuses to arrive — the drama is simply that work is scarce and the days keep coming."),
  r("killer of sheep", "kes", "convergence", "none", 0.62, 0.44,
    "Working-class childhood filmed in documentary light, where the small private escape matters more than any story about escaping."),
  r("kes", "bicycle thieves", "descent", "b", 0.66, 0.48,
    "A boy and an adult failing him, filmed so plainly that the ending lands as fact rather than as tragedy."),
  r("killer of sheep", "moonlight", "descent", "a", 0.64, 0.44,
    "Black American life filmed as texture, weather and silence between people, rather than as incident."),
  r("killer of sheep", "daughters of the dust", "convergence", "none", 0.6, 0.42,
    "Black independent film built out of images and music instead of plot, and trusting you to assemble the rest."),
  r("daughters of the dust", "moonlight", "descent", "a", 0.58, 0.4,
    "Saturated colour and slowed, half-ceremonial movement used to give ordinary Black life the weight of myth."),
  r("meghe dhaka tara", "tokyo story", "convergence", "none", 0.58, 0.4,
    "The family that quietly consumes the one member who keeps it going, filmed without ever naming the cruelty as cruelty."),
  r("meghe dhaka tara", "bicycle thieves", "convergence", "none", 0.54, 0.36,
    "Post-war poverty as an everyday condition rather than a crisis, with melodrama used to make the economics feel personal."),

  /* ---------- American horror, low budget and unrelieved ---------- */
  r("night of the living dead", "the texas chain saw massacre", "rhyme", "none", 0.74, 0.55,
    "A house that offers no safety, shot cheaply enough to look like footage, ending with a survivor and no relief at all."),
  r("night of the living dead", "get out", "descent", "a", 0.66, 0.46,
    "American horror where the real threat is the country the Black protagonist has to survive, and the arriving authorities are the worst of it."),
  r("night of the living dead", "train to busan", "descent", "a", 0.68, 0.48,
    "The siege where the dead are a pressure and the other survivors are the argument — the door held shut from both sides."),
  r("the texas chain saw massacre", "audition", "rhyme", "none", 0.6, 0.42,
    "A long, almost mundane first half that makes the second unbearable, because you were never told which film you were in."),
  r("audition", "psycho", "descent", "b", 0.62, 0.44,
    "The film that changes genre halfway and strands you, having spent its first hour teaching you the wrong rules."),
  r("black sunday", "suspiria", "descent", "a", 0.68, 0.5,
    "Italian horror as designed atmosphere — fog, architecture and cruelty staged for beauty rather than for plausibility."),
  r("the wailing", "audition", "convergence", "none", 0.54, 0.36,
    "Slow domestic unease turning, without a clean seam, into sustained physical horror."),

  /* ---------- the western, doubting itself ---------- */
  r("high noon", "shane", "convergence", "none", 0.66, 0.48,
    "Two westerns a year apart that stop to ask what the gunfighter is actually for, and cannot answer without losing him."),
  r("high noon", "unforgiven", "descent", "a", 0.68, 0.48,
    "The showdown stripped of glamour: a man too old for it, a town that will not help, and killing shown as sordid work."),
  r("shane", "unforgiven", "descent", "a", 0.62, 0.44,
    "A child watching a gunfighter, and a film that knows the watching is how the myth gets passed on."),
  r("high noon", "the wages of fear", "rhyme", "none", 0.56, 0.38,
    "Suspense generated by a clock rather than by a villain, the film cutting to time passing until waiting becomes unbearable."),
  r("the last picture show", "the searchers", "rhyme", "none", 0.58, 0.4,
    "The frontier town after the myth has left it, filmed as dust, boredom and a cinema about to close."),
  r("sholay", "seven samurai", "descent", "b", 0.7, 0.55,
    "Hired fighters recruited to defend a village, each introduced by a demonstration of what he can do, in a film happy to run three hours to do it."),
  r("sholay", "once upon a time in the west", "descent", "b", 0.64, 0.46,
    "The spaghetti western absorbed wholesale: the held close-up, the harmonica-style motif, the villain given an entrance before a line."),

  /* ---------- tableau, ritual, and film that refuses narrative ---------- */
  r("the color of pomegranates", "yeelen", "convergence", "none", 0.6, 0.4,
    "Ritual staged flat to the camera, in frames arranged like painted panels, with almost nothing explained to an outsider."),
  r("the color of pomegranates", "long day s journey into night", "rhyme", "none", 0.56, 0.36,
    "Dream logic given a hard visual system, so that images repeat and rhyme instead of following one another causally."),
  r("long day s journey into night", "stalker", "descent", "b", 0.6, 0.42,
    "The very long take used to make a journey feel like trespass, time passing in the shot rather than between shots."),
  r("yeelen", "touki bouki", "convergence", "none", 0.62, 0.44,
    "African cinema setting inherited myth against the modern world and refusing to resolve which one wins."),
  r("the ascent", "a man escaped", "rhyme", "none", 0.64, 0.46,
    "Captivity filmed as spiritual test, in close-up and process, with faith treated as a physical act rather than a belief."),
  r("the ascent", "come and see", "convergence", "none", 0.7, 0.52,
    "The eastern front rendered as endurance in snow and mud, the camera held on a face until war stops being an event and becomes a state."),
  r("intolerance", "2001 a space odyssey", "rhyme", "none", 0.5, 0.32,
    "A film that cuts between eras thousands of years apart and asks you to hold them as one argument."),

  /* ---------- contested truth, and the modern thriller ---------- */
  r("anatomy of a fall", "rashomon", "descent", "b", 0.68, 0.5,
    "A death told through incompatible accounts, with the film declining to certify which one happened."),
  r("anatomy of a fall", "the thin blue line", "convergence", "none", 0.54, 0.36,
    "The courtroom shown as a place that manufactures a story, where the persuasive version and the true one need not be the same."),
  r("black coal thin ice", "chinatown", "descent", "b", 0.6, 0.42,
    "Neo-noir where the investigation keeps uncovering a system rather than a culprit, and solving it changes nothing."),
  r("black coal thin ice", "memories of murder", "convergence", "none", 0.62, 0.44,
    "An unsolved provincial killing filmed in cold industrial landscape, with police competence quietly the real subject."),
  r("burning", "memories of murder", "convergence", "none", 0.58, 0.4,
    "Korean cinema built on an absence — a disappearance that is never confirmed, and a class grievance underneath it."),
  r("your name", "la jetee", "rhyme", "none", 0.52, 0.34,
    "Two people separated by time trying to reach each other, with the mechanism left deliberately unexplained."),
  r("a fantastic woman", "moonlight", "convergence", "none", 0.56, 0.38,
    "Identity filmed as something other people keep trying to adjudicate, held together by the camera's steady attention to one face."),
  r("greed", "there will be blood", "descent", "a", 0.58, 0.4,
    "Money as a corrosive agent worked through to its end, with the last act stranded in a landscape that will not sustain anyone."),

  /* ==================================================================
     THIRD PASS. Aimed at the thing this layer is actually for: the
     specific shared beat or device, named precisely enough that reading
     it teaches you something you can go and look for. The model is the
     Solaris / Inception edge — not "both are about grief" but "both men
     build a private architecture in order to keep meeting a dead wife
     inside it". A claim that could be swapped onto another pair of
     films without becoming false is not worth writing.
     ================================================================== */

  /* ---------- the recording that will not give up its secret ---------- */
  at("blowup", "the conversation", "descent", "a", 0.82, 0.8,
    "A technician enlarges his own recording over and over, certain a crime is buried in the grain — Coppola moved the idea from a photograph to magnetic tape.",
    "Coppola has repeatedly named Blowup as the starting point for The Conversation"),
  r("blowup", "blade runner", "descent", "a", 0.6, 0.42,
    "The scene where a still photograph is pushed past its own resolution, looking for a body the image was never sharp enough to hold."),
  r("the conversation", "cache", "rhyme", "none", 0.62, 0.44,
    "Surveillance turned back on the watcher: the tape arrives, and the guilt it exposes is the listener's own."),
  r("the conversation", "blue velvet", "convergence", "none", 0.52, 0.34,
    "A man who cannot stop listening at the edge of somebody else's life, and is implicated by the act of watching."),

  /* ---------- Hollywood as a haunted house ---------- */
  r("sunset boulevard", "mulholland drive", "descent", "a", 0.78, 0.58,
    "A silent-era mansion, a woman the industry finished with who refuses to accept it, and a dead man narrating his own story from the pool."),
  r("mulholland drive", "persona", "descent", "b", 0.74, 0.55,
    "Two women alone together whose faces the film eventually merges, until you cannot say which one has been telling it."),
  r("mulholland drive", "vertigo", "descent", "b", 0.72, 0.52,
    "A blonde remade as a brunette and a second half that dismantles the first, revealing the romance as one person's rewrite."),
  r("mulholland drive", "eraserhead", "rhyme", "none", 0.6, 0.42,
    "A stage act revealed as playback — the singer collapses, the voice keeps going — and dread built out of sound rather than event."),
  r("sunset boulevard", "the great beauty", "convergence", "none", 0.54, 0.36,
    "A writer drifting through parties thrown by people who peaked decades ago, narrating his own irrelevance with too much style."),

  /* ---------- deep focus, and power told out of order ---------- */
  r("citizen kane", "rashomon", "convergence", "none", 0.66, 0.46,
    "A life assembled from witnesses who contradict each other, with the film declining to supply the version that would settle it."),
  r("citizen kane", "the godfather", "descent", "a", 0.6, 0.4,
    "Power photographed in deep focus and low ceilings, the man at the centre framed further and further from everyone in the room."),
  r("touch of evil", "the third man", "convergence", "none", 0.62, 0.44,
    "Post-war border corruption shot in tilted frames and wet streets, with the friend you trusted turning out to be the rot."),
  r("the third man", "the conformist", "rhyme", "none", 0.56, 0.38,
    "The canted angle and the shadow thrown across a whole wall, used to make a political betrayal feel architectural."),

  /* ---------- Bresson's process, and what it became ---------- */
  at("pickpocket", "taxi driver", "descent", "a", 0.76, 0.72,
    "The diary voice-over, the solitary man rehearsing his hands, and an ending that grants a grace the film has not obviously earned.",
    "Schrader has written and said this repeatedly, in Transcendental Style in Film and in interviews"),
  r("pickpocket", "le samourai", "rhyme", "none", 0.66, 0.48,
    "Crime filmed as procedure — gloves, timing, the same route walked twice — with the face kept deliberately blank throughout."),
  r("a man escaped", "rififi", "convergence", "none", 0.6, 0.42,
    "Long stretches with no dialogue at all, attention held entirely by hands working at a lock and the risk of a sound."),
  r("au hasard balthazar", "kes", "rhyme", "none", 0.58, 0.4,
    "An animal passed between owners as the only innocent thing on screen, and the measure of everyone who handles it."),
  r("le samourai", "heat", "descent", "a", 0.6, 0.42,
    "The professional as an ascetic: an empty apartment, a fixed ritual, and a code that costs more than the job pays."),
  r("rififi", "heat", "descent", "a", 0.58, 0.4,
    "The heist given in real procedural time, so the theft plays as work rather than as spectacle."),

  /* ---------- upriver, and the leader who has stopped making sense ---------- */
  r("aguirre the wrath of god", "apocalypse now", "rhyme", "none", 0.76, 0.56,
    "A boat pushing upriver into jungle while its commander detaches from reality, filmed on a shoot that was visibly going the same way."),
  r("aguirre the wrath of god", "fitzcarraldo", "rhyme", "none", 0.7, 0.5,
    "An impossible object hauled through the jungle by a man who will not be told it cannot be done, with the film itself doing the hauling."),
  r("the enigma of kaspar hauser", "the elephant man", "convergence", "none", 0.62, 0.44,
    "A person exhibited as a curiosity, and a film that keeps asking whether its own looking is any different."),
  r("apocalypse now", "come and see", "convergence", "none", 0.6, 0.42,
    "War as a descent that keeps removing another layer of the world, until the protagonist's face is the only thing left to read."),

  /* ---------- the disappearance nobody solves ---------- */
  r("l avventura", "picnic at hanging rock", "rhyme", "none", 0.74, 0.55,
    "Someone vanishes early, the search dissolves into landscape, and the film simply declines to ever explain it."),
  r("l avventura", "burning", "descent", "a", 0.6, 0.42,
    "A disappearance left unresolved on purpose, with class resentment quietly supplying the motive the plot withholds."),
  r("blowup", "l avventura", "convergence", "none", 0.58, 0.4,
    "A body that may not exist, and characters whose interest in finding it quietly evaporates."),

  /* ---------- the new wave, and what it was arguing with ---------- */
  r("breathless", "bonnie and clyde", "descent", "a", 0.68, 0.5,
    "American crime pictures re-cut with jump cuts and no remorse, then sold back to Hollywood — Penn's film was first offered to Godard and Truffaut."),
  r("the 400 blows", "kes", "convergence", "none", 0.64, 0.46,
    "A boy failed by school and home, ending on his escape held just long enough to become a question rather than a triumph."),
  r("cleo from 5 to 7", "high noon", "rhyme", "none", 0.6, 0.42,
    "The film runs in something close to real time, with the clock, not the antagonist, generating every ounce of the tension."),
  r("last year at marienbad", "inception", "descent", "a", 0.64, 0.46,
    "Memory laid out as architecture — corridors, mirrored rooms, a scene restaged with the furniture moved — and a man insisting it happened."),
  r("hiroshima mon amour", "la jetee", "convergence", "none", 0.66, 0.48,
    "A voice recounting a love affair over images that keep pulling toward catastrophe, with memory treated as the actual subject."),
  r("hiroshima mon amour", "sans soleil", "rhyme", "none", 0.58, 0.4,
    "An essay spoken in the second person over documentary footage, where the commentary quietly becomes the film's real event."),
  r("pierrot le fou", "badlands", "rhyme", "none", 0.58, 0.4,
    "Lovers driving away from a killing into saturated colour, narrating it in a register far too calm for what they have done."),

  /* ---------- Bergman, and looking straight at a face ---------- */
  r("wild strawberries", "ikiru", "convergence", "none", 0.66, 0.48,
    "An old man given a deadline and made to audit his own life, the film cutting away to what he cannot fix."),
  r("winter light", "first reformed", "descent", "a", 0.74, 0.56,
    "A pastor losing his faith while counselling a despairing man about the end of the world, kept in a cold empty church throughout."),
  r("the passion of joan of arc", "persona", "descent", "a", 0.64, 0.46,
    "The face shot enormous and unadorned for most of the running time, until skin and eyes are carrying the entire argument."),
  r("cries and whispers", "the color of pomegranates", "convergence", "none", 0.5, 0.32,
    "Colour used as a formal system rather than as decor — here a red that floods the cuts, there a palette assigned per panel."),
  r("persona", "3 women", "descent", "a", 0.64, 0.46,
    "Two women whose personalities swap and bleed into one another in a landscape that stops behaving realistically."),
  r("ordet", "first reformed", "convergence", "none", 0.52, 0.34,
    "Faith filmed without irony and without proof, staged so plainly that the miracle has nowhere to hide."),

  /* ---------- the American town with something under it ---------- */
  r("blue velvet", "psycho", "descent", "b", 0.66, 0.48,
    "A tidy small town and a polite young man, with the film's real business being what is kept in the house behind him."),
  r("blue velvet", "shadow of a doubt", "descent", "b", 0.6, 0.42,
    "Evil arriving inside the family home in a nice suit, seen first by the one person nobody will believe."),
  r("halloween", "psycho", "descent", "b", 0.7, 0.52,
    "The camera made complicit — the opening taken from behind the killer's eyes — and the shock moved from a knife to an empty doorway."),
  at("diabolique", "psycho", "descent", "a", 0.68, 0.6,
    "A body in a bath, a death faked mid-film, and an audience begged in the marketing not to give away the ending.",
    "Hitchcock lost the rights to this Boileau-Narcejac novel to Clouzot and " +
    "bought their next one, which became Vertigo. The dramatic 'beaten by " +
    "hours' version of the story was popularized by Truffaut; Narcejac later " +
    "disputed that framing, so the confidence here reflects a real but less " +
    "cinematic rivalry rather than the more colourful legend."),
  r("the thing", "alien", "convergence", "none", 0.7, 0.5,
    "An isolated crew who cannot tell which of them is still themselves, with the creature's design used to make trust impossible."),
  r("videodrome", "the matrix", "descent", "a", 0.6, 0.42,
    "A signal that rewrites the body of whoever receives it, and a hero who can no longer locate the edge of the broadcast."),
  r("the fly", "hereditary", "convergence", "none", 0.5, 0.32,
    "Horror routed through a family watching someone they love become something else, one irreversible stage at a time."),

  /* ---------- occupation, resistance, and the procedural politics film ---------- */
  r("rome open city", "the battle of algiers", "descent", "a", 0.72, 0.55,
    "Shot in the streets it depicts with faces pulled from them, close enough to the events that it reads as recovered footage."),
  r("army of shadows", "the battle of algiers", "convergence", "none", 0.68, 0.5,
    "Resistance shown as grim administration — cells, couriers, executions of your own — with no heroism offered anywhere."),
  r("z", "the battle of algiers", "descent", "b", 0.66, 0.48,
    "Political murder filmed as procedure and paperwork, the investigation's rigour making the eventual cover-up worse."),
  r("investigation of a citizen above suspicion", "z", "convergence", "none", 0.6, 0.42,
    "A state that cannot be embarrassed: the culprit is known early, and the film's subject becomes the machinery that protects him."),
  r("the cranes are flying", "come and see", "descent", "a", 0.62, 0.44,
    "Soviet war film handing the camera to the subjective experience — the spinning sky, the face that stops registering — instead of to strategy."),

  /* ---------- melodrama, borrowed and answered ---------- */
  at("all that heaven allows", "ali fear eats the soul", "descent", "a", 0.8, 0.85,
    "Sirk's widow-and-younger-gardener scandal rebuilt in Munich with a Moroccan labourer, keeping the framing devices and swapping class shame for racism.",
    "Fassbinder wrote at length about Sirk and named this film as the model"),
  r("the marriage of maria braun", "mildred pierce", "convergence", "none", 0.5, 0.32,
    "A woman's rise through a wrecked economy, told so that her competence and her damage cannot be separated."),
  r("ali fear eats the soul", "get out", "convergence", "none", 0.52, 0.34,
    "The liberal circle that welcomes an outsider warmly and keeps appraising him, with the politeness itself as the horror."),

  /* ---------- watchers who cannot touch anything ---------- */
  r("wings of desire", "a ghost story", "descent", "a", 0.68, 0.5,
    "An invisible figure standing in rooms with people who cannot see it, listening to thoughts it has no way to answer."),
  r("wings of desire", "sans soleil", "rhyme", "none", 0.52, 0.34,
    "A city heard as overlapping interior monologue, the film assembling a place out of what people are privately thinking."),
  r("paris texas", "vertigo", "rhyme", "none", 0.62, 0.44,
    "A man who has rebuilt a woman in his head speaking to the real one through glass, unable to look at her while he says it."),
  r("under the skin", "persona", "convergence", "none", 0.56, 0.38,
    "A face learning to perform a person, filmed until the imitation starts producing the feeling it was faking."),
  r("under the skin", "2001 a space odyssey", "rhyme", "none", 0.5, 0.32,
    "Long wordless passages in abstract black space, used to make the human body look like an unfamiliar object."),

  /* ---------- the writer's room, the hotel, the corridor ---------- */
  r("barton fink", "the shining", "rhyme", "none", 0.68, 0.5,
    "A writer alone in an enormous hotel that will not let him work, with the corridor and the wallpaper doing most of the talking."),
  r("barton fink", "eraserhead", "convergence", "none", 0.58, 0.4,
    "A rented room rendered as a state of mind, dread supplied almost entirely by sound and by things seeping through the walls."),
  r("8", "la dolce vita", "rhyme", "none", 0.64, 0.46,
    "A man moving through a crowd of people who all want something from him, the film staged as procession rather than as plot."),
  r("amarcord", "roma", "rhyme", "none", 0.52, 0.34,
    "Memory of a town played as pageant — exaggerated, affectionate, and openly unreliable about its own past."),

  /* ---------- westerns, and the men who arrive too late ---------- */
  r("the magnificent seven", "seven samurai", "descent", "b", 0.82, 0.8,
    "The same structure transposed to the border: a village hires gunmen, each recruited in one scene that shows what he can do."),
  r("a fistful of dollars", "yojimbo", "descent", "b", 0.84, 0.85,
    "A stranger playing two criminal factions against each other in a dead town, close enough that it prompted a lawsuit."),
  r("once upon a time in the west", "the searchers", "rhyme", "none", 0.6, 0.42,
    "The doorway shot and the man who cannot be let indoors — the western admitting its hero has no place in the town he saves."),
  r("the magnificent seven", "sholay", "convergence", "none", 0.6, 0.44,
    "Hired fighters defending a village, restaged for a different national cinema and stretched to fit its own star system."),

  /* ---------- doubles, and the mirror scene ---------- */
  r("persona", "vertigo", "rhyme", "none", 0.56, 0.38,
    "One woman dressed and coached into becoming another, and a film that treats the remaking as an act of violence."),
  r("do the right thing", "get out", "convergence", "none", 0.54, 0.36,
    "American racism written as social comedy that keeps almost passing for friendliness, right up until it does not."),

  /* ==================================================================
     FOURTH PASS. Same bar, aimed at the next tranche of uncovered
     films by degree. Weighted toward directors with several titles in
     the corpus and no authored edge at all — Kubrick, Hitchcock,
     Bresson, Buñuel, Godard, Bergman, Ozu, Miyazaki — because those
     films were drawing maps made entirely of shared crew.
     ================================================================== */

  /* ---------- Buñuel: the room nobody can leave ---------- */
  r("the exterminating angel", "the discreet charm of the bourgeoisie", "rhyme", "none", 0.72, 0.52,
    "Dinner guests who cannot leave, and later guests who can never manage to eat — one absurd rule imposed on polite society and followed to the end."),
  r("the exterminating angel", "playtime", "convergence", "none", 0.5, 0.32,
    "Wealthy people trapped by architecture and etiquette, filmed so that the room's logic outranks anyone's intentions."),
  r("belle de jour", "mulholland drive", "descent", "a", 0.6, 0.42,
    "Fantasy and waking life cut together with no seam offered, and no scene marked as the one that really happened."),
  r("viridiana", "the discreet charm of the bourgeoisie", "rhyme", "none", 0.58, 0.4,
    "Charity and good manners staged as the joke, with a banquet composed to blaspheme the painting it is quoting."),
  r("belle de jour", "eyes wide shut", "descent", "a", 0.58, 0.4,
    "A respectable spouse drawn into a masked erotic ritual, filmed coolly enough that desire looks like a formal system."),

  /* ---------- Kubrick: the pattern imposed on people ---------- */
  r("paths of glory", "full metal jacket", "rhyme", "none", 0.68, 0.5,
    "The army as an administrative machine that consumes its own men, with the film's fury reserved for officers rather than for the enemy."),
  r("paths of glory", "come and see", "convergence", "none", 0.56, 0.38,
    "The trench and the tracking shot: the camera walking a line of men to make the scale of the waste physical rather than statistical."),
  r("the killing", "rififi", "convergence", "none", 0.62, 0.44,
    "A heist assembled from each man's hour, the timeline doubled back so you watch the same minutes from another pair of hands."),
  r("dr strangelove", "network", "convergence", "none", 0.58, 0.4,
    "Institutional catastrophe played as deadpan comedy, with the most reasonable-sounding man in the room the most dangerous."),
  r("barry lyndon", "the age of innocence", "descent", "a", 0.62, 0.44,
    "Period filmed as a set of rules rather than a costume: candlelight, slow zooms out, and a narrator who tells you the ending early."),
  r("barry lyndon", "days of heaven", "convergence", "none", 0.6, 0.42,
    "Available light pushed to its limit — candles, magic hour — so the period looks lit by its own century."),
  r("full metal jacket", "the ascent", "convergence", "none", 0.5, 0.32,
    "War split into two halves, the second stranding you with what the first trained you to accept."),
  r("eyes wide shut", "under the skin", "rhyme", "none", 0.5, 0.32,
    "A city wandered at night as a series of encounters, filmed with the detachment of someone studying a species."),
  r("lolita", "taxi driver", "convergence", "none", 0.46, 0.3,
    "A narrator whose obsession the film reproduces faithfully without ever endorsing, leaving you to notice the gap yourself."),

  /* ---------- Hitchcock: the mechanism made visible ---------- */
  r("rope", "children of men", "descent", "a", 0.62, 0.46,
    "A film engineered to hide its own cuts, so that the take becomes the suspense: nothing can be escaped by editing."),
  r("rebecca", "vertigo", "rhyme", "none", 0.64, 0.46,
    "A woman entirely absent from the film who nevertheless governs it, with the living one pressed into her clothes and her rooms."),
  r("rebecca", "the handmaiden", "descent", "a", 0.58, 0.4,
    "A young woman brought into a great house as an inferior, and a housekeeper whose devotion to the previous mistress is the real plot."),
  r("notorious", "the conformist", "convergence", "none", 0.54, 0.36,
    "Political menace staged as glamour — a party, a staircase, a camera that knows exactly which small object will damn someone."),
  r("the birds", "night of the living dead", "descent", "a", 0.62, 0.44,
    "A siege with no explanation offered and no authority coming, the group barricading a house against something the film refuses to motivate."),
  r("marnie", "vertigo", "rhyme", "none", 0.6, 0.42,
    "A man who insists on curing a woman by remaking her, with the film increasingly unsure he is the one to be trusted."),
  r("the 39 steps", "north by northwest", "rhyme", "none", 0.66, 0.5,
    "An ordinary man accused of a murder he did not commit, running across country while the plot's actual object stays deliberately trivial."),
  r("the man who knew too much", "blowup", "convergence", "none", 0.48, 0.3,
    "An ordinary person accidentally acquires a piece of evidence, and the film becomes about the burden of having noticed."),

  /* ---------- Bresson's later films, and Dardenne-style attention ---------- */
  r("diary of a country priest", "winter light", "convergence", "none", 0.68, 0.5,
    "A priest writing down a faith he is losing, filmed in close-up and cold rooms with no consolation supplied by the score."),
  r("mouchette", "the 400 blows", "convergence", "none", 0.6, 0.42,
    "A child failed by every adult in the film, the camera staying level with them and declining to editorialise."),
  r("l argent", "au hasard balthazar", "rhyme", "none", 0.66, 0.48,
    "An object passed from hand to hand — a forged note, a donkey — indicting each owner in turn as it travels."),
  r("mouchette", "kes", "convergence", "none", 0.62, 0.44,
    "The one tenderness a child has is destroyed by the adults around them, and the film ends immediately after."),
  r("the trial of joan of arc", "the passion of joan of arc", "rebuttal", "a", 0.7, 0.52,
    "The same trial stripped of Dreyer's enormous faces and played from the transcript, refusing ecstasy in favour of procedure."),

  /* ---------- Godard and Truffaut, arguing ---------- */
  r("contempt", "8", "convergence", "none", 0.62, 0.44,
    "A film about the impossibility of making the film, with the producer, the wife and the myth all pulling the director apart."),
  r("day for night", "8", "rhyme", "none", 0.64, 0.46,
    "The shoot itself as the subject, cutting between the crew's small crises and the artificial scene they are assembling."),
  r("alphaville", "blade runner", "descent", "a", 0.6, 0.42,
    "Science fiction shot in an existing city at night with no sets at all, the future implied purely by light and voice."),
  r("my life to live", "vagabond", "convergence", "none", 0.58, 0.4,
    "A woman's life given in numbered episodes toward a death announced in advance, the structure refusing you a rescue."),
  r("weekend", "the discreet charm of the bourgeoisie", "convergence", "none", 0.56, 0.38,
    "Bourgeois life dismantled as farce, with a long traffic jam and an endless dinner used as the same joke about class."),
  r("shoot the piano player", "breathless", "convergence", "none", 0.6, 0.42,
    "American genre picked up affectionately and then handled wrong on purpose, tone swerving mid-scene."),

  /* ---------- Demy, and the musical that hurts ---------- */
  r("the umbrellas of cherbourg", "the young girls of rochefort", "rhyme", "none", 0.66, 0.48,
    "A town repainted into a colour scheme and every line sung, with the choreography carried by ordinary errands."),
  r("the young girls of rochefort", "in the mood for love", "convergence", "none", 0.46, 0.3,
    "Two people who keep just missing each other, the film structured entirely from near-misses in shared spaces."),

  /* ---------- Polanski's apartments ---------- */
  r("repulsion", "the tenant", "rhyme", "none", 0.72, 0.52,
    "A flat that turns hostile as its occupant comes apart — walls that give, neighbours who may be conspiring, and no outside view offered."),
  r("rosemary s baby", "the babadook", "descent", "a", 0.6, 0.42,
    "A mother told she is imagining it by everyone around her, the horror indistinguishable from being disbelieved."),
  r("the tenant", "perfect blue", "convergence", "none", 0.56, 0.38,
    "Identity eroded by an apartment and a watching city, until the character is being played by someone else in their own life."),

  /* ---------- Kieślowski, and coincidence as design ---------- */
  r("the double life of veronique", "persona", "convergence", "none", 0.6, 0.42,
    "Two women who cannot both be entirely real, linked by a feeling neither can source and photographed as one another's echo."),
  r("three colours blue", "amour", "convergence", "none", 0.56, 0.38,
    "Grief filmed as logistics — the apartment, the paperwork, the music that will not stop arriving unbidden."),
  r("three colours red", "the double life of veronique", "rhyme", "none", 0.62, 0.44,
    "Lives that keep nearly touching, with the film arranging coincidences openly enough that you feel an author behind them."),
  r("three colours white", "parasite", "convergence", "none", 0.46, 0.3,
    "Humiliation avenged through an elaborate scheme, class resentment played first as comedy and then not."),

  /* ---------- Czech and Hungarian, the state at the edges ---------- */
  r("daisies", "valerie and her week of wonders", "convergence", "none", 0.62, 0.44,
    "Anarchic girlhood filmed in colour filters and free association, plot abandoned for a series of provocations."),
  r("the cremator", "the white ribbon", "convergence", "none", 0.56, 0.38,
    "Fascism arriving as tidiness and vocation, in a community filmed so calmly that the horror is entirely in the manners."),
  r("werckmeister harmonies", "the turin horse", "rhyme", "none", 0.74, 0.55,
    "Very long takes walking beside people in a collapsing world, with weather and repetition doing the work of plot."),
  r("werckmeister harmonies", "stalker", "convergence", "none", 0.62, 0.44,
    "A journey on foot through a ruined landscape where the destination matters less than what the walking does to the walkers."),
  r("the turin horse", "jeanne dielman 23 quai du commerce 1080 bruxelles", "convergence", "none", 0.6, 0.42,
    "The same domestic routine performed daily until the smallest deviation registers as catastrophe."),

  /* ---------- Ozu late, Naruse, and the Japanese domestic ---------- */
  r("an autumn afternoon", "tokyo story", "rhyme", "none", 0.66, 0.48,
    "A parent quietly arranging their own obsolescence, filmed from a low fixed camera that never rises to comment."),
  r("floating weeds", "la strada", "convergence", "none", 0.54, 0.36,
    "A travelling troupe whose performances are shabby and whose off-stage cruelties are the actual show."),
  r("when a woman ascends the stairs", "street of shame", "convergence", "none", 0.64, 0.46,
    "Women working the bar and brothel economy of post-war Japan, the film accounting for their debts as carefully as their feelings."),
  r("floating clouds", "in the mood for love", "convergence", "none", 0.52, 0.34,
    "An affair that survives only as returning to the same rooms, filmed after the possibility has already closed."),
  r("harakiri", "seven samurai", "rebuttal", "b", 0.7, 0.52,
    "The samurai code examined as a bureaucratic cruelty rather than an ideal, told by a man given his turn to speak in a courtyard."),
  r("samurai rebellion", "harakiri", "rhyme", "none", 0.68, 0.5,
    "A retainer's obedience pushed until refusal is the only honourable act, staged in formal rooms before it becomes violence."),
  r("onibaba", "kwaidan", "convergence", "none", 0.56, 0.38,
    "Japanese folk horror grown out of grass and heat, where the mask and the hole in the ground carry the moral."),

  /* ---------- Japanese crime and the new wave ---------- */
  r("pale flower", "le samourai", "convergence", "none", 0.64, 0.46,
    "A gambler and a hitman filmed as ritual and boredom, the underworld shot in high-contrast monochrome as an aesthetic rather than a milieu."),
  r("branded to kill", "tokyo drifter", "rhyme", "none", 0.66, 0.48,
    "Yakuza formula dismantled into pop-art blocks of colour and nonsense, the studio's genre requirements met and mocked at once."),
  r("cure", "memories of murder", "convergence", "none", 0.62, 0.44,
    "An unsolvable case in which police procedure itself starts to look like the pathology."),

  /* ---------- anime as a corpus, not a genre ---------- */
  /* Downgraded from attested: a web-search pass found the two discussed
     constantly as the towering pair of the genre, sharing a concern with the
     body and identity, but no specific citable "Oshii named Akira" statement
     the way the other attested edges in this file have one. That's a reading,
     not a documented influence — convergence within a genre, not descent. */
  r("akira", "ghost in the shell", "convergence", "none", 0.56, 0.4,
    "The neon megacity, the body dissolving into infrastructure, and animation used for weight and detail rather than for cartoon motion."),
  at("ghost in the shell", "the matrix", "descent", "a", 0.74, 0.85,
    "Green cascading code, a diving jack at the base of the skull, and a heroine who questions whether her body is hers.",
    "The Wachowskis screened it for producers as a direct reference"),
  r("my neighbor totoro", "grave of the fireflies", "rebuttal", "b", 0.66, 0.5,
    "Two films about children left to themselves in wartime countryside, released together — one grants them a forest spirit, the other does not."),
  r("spirited away", "the tale of the princess kaguya", "convergence", "none", 0.56, 0.4,
    "A girl bound by the rules of a world she did not choose, drawn by hand so that the line itself carries the feeling."),
  r("grave of the fireflies", "come and see", "convergence", "none", 0.58, 0.4,
    "A child's war, told with no battle scenes and no adults capable of helping, ending exactly where it says it will at the start."),
  r("princess mononoke", "yeelen", "convergence", "none", 0.48, 0.3,
    "Myth staged as an argument about land and iron, with no side offered as simply right."),

  /* ---------- Korean cinema, tonal whiplash as method ---------- */
  r("parasite", "the exterminating angel", "convergence", "none", 0.5, 0.32,
    "A house whose architecture enforces the class arrangement, until the arrangement is broken from below."),
  r("parasite", "burning", "convergence", "none", 0.62, 0.44,
    "Two young people looking up at a wealth they cannot enter, the film letting resentment build until it detonates."),
  r("oldboy", "the handmaiden", "rhyme", "none", 0.6, 0.42,
    "A revenge engineered years in advance by someone who has been watching, revealed in a reversal that recasts every earlier scene."),
  r("the handmaiden", "rashomon", "rhyme", "none", 0.6, 0.42,
    "The same events replayed from a second point of view, the retelling exposing what the first version was concealing."),
  r("oldboy", "memories of murder", "convergence", "none", 0.5, 0.32,
    "Korean cinema swinging between broad comedy and real brutality inside single scenes, refusing to settle the tone."),

  /* ---------- slow cinema, Taiwan and Thailand ---------- */
  r("yi yi", "tokyo story", "descent", "b", 0.66, 0.48,
    "A family filmed across a wedding and a funeral, each member given their own scale of disappointment and none of it resolved."),
  r("yi yi", "the tree of life", "convergence", "none", 0.56, 0.38,
    "Childhood observed from below and adulthood from a distance, with the film cutting between scales rather than following a plot."),
  r("goodbye dragon inn", "sans soleil", "convergence", "none", 0.5, 0.32,
    "A building filmed as an archive of everyone who used it, with almost no dialogue and time doing the remembering."),
  r("the assassin", "ashes of time", "convergence", "none", 0.62, 0.44,
    "Wuxia slowed until the fights are almost incidental, the film preferring wind, silk and long distances between people."),
  r("uncle boonmee who can recall his past lives", "tropical malady", "rhyme", "none", 0.7, 0.5,
    "A film that changes into a different film halfway, moving from domestic quiet into jungle and myth without explanation."),
  r("uncle boonmee who can recall his past lives", "stalker", "convergence", "none", 0.5, 0.32,
    "A journey into forest where the rules quietly stop being physical, filmed patiently enough that you accept it."),
  r("tropical malady", "beau travail", "convergence", "none", 0.54, 0.36,
    "Desire between men rendered almost entirely as bodies in landscape, with the second half abandoning narrative for movement."),

  /* ---------- Iran, and the film about its own making ---------- */
  r("taste of cherry", "the wind will carry us", "rhyme", "none", 0.7, 0.5,
    "A man drives a dusty landscape asking strangers for something he cannot say plainly, conversations held through a car window."),
  r("taste of cherry", "close up", "rhyme", "none", 0.62, 0.44,
    "The film breaks its own frame at the end, showing the crew and refusing you the ending you were promised."),
  r("the wind will carry us", "the gleaners and i", "convergence", "none", 0.48, 0.3,
    "The documentary impulse turned on a small community, with the filmmaker's own intrusion left in rather than edited out."),

  /* ---------- Latin America ---------- */
  r("city of god", "goodfellas", "descent", "a", 0.64, 0.46,
    "A criminal ecosystem narrated from inside by someone who survived it, restless camera and freeze-frames introducing the dead."),
  r("amores perros", "city of god", "convergence", "none", 0.6, 0.42,
    "Braided stories from opposite ends of one city, joined by a single violent event and told with a restless handheld camera."),
  r("el topo", "the holy mountain", "rhyme", "none", 0.72, 0.52,
    "A quest structured as a series of symbolic encounters with masters, staged as tableau and deliberate blasphemy."),
  r("el topo", "once upon a time in the west", "rebuttal", "b", 0.56, 0.38,
    "The western's iconography kept intact and its morality replaced with something closer to a religious hallucination."),
  r("black orpheus", "city of god", "convergence", "none", 0.5, 0.32,
    "The favela filmed as a self-contained world with its own music and rules, seen by cinema that mostly arrives from outside it."),
  r("the headless woman", "cache", "convergence", "none", 0.6, 0.42,
    "A comfortable person may have killed someone and the film declines to confirm it, class making the not-knowing possible."),

  /* ---------- Africa, and the colonial frame ---------- */
  r("black girl", "cleo from 5 to 7", "convergence", "none", 0.52, 0.34,
    "A woman moving through a city that keeps looking at her, the film built from her interior voice against what others see."),
  r("black girl", "touki bouki", "convergence", "none", 0.62, 0.44,
    "African cinema turning the dream of France into the actual subject, and finding it hollow from two different directions."),
  r("timbuktu", "the battle of algiers", "convergence", "none", 0.5, 0.32,
    "Occupation filmed as daily administration — checkpoints, edicts, small negotiations — rather than as battle."),

  /* ---------- the modern long take, and the engineered spectacle ---------- */
  r("children of men", "gravity", "rhyme", "none", 0.64, 0.46,
    "The extended take used as an endurance test, the camera refusing to cut away from a body in continuous danger."),
  r("mad max fury road", "mad max 2", "descent", "b", 0.8, 0.65,
    "The same chase logic scaled up: a convoy pursued across a wasteland, geography kept legible so every position is readable at speed."),
  r("mad max fury road", "the general", "convergence", "none", 0.5, 0.34,
    "An entire film built as one pursuit along a single line, with the stunts performed physically and framed centrally so you can read them."),
  r("gravity", "2001 a space odyssey", "descent", "b", 0.58, 0.4,
    "Silence used correctly in vacuum, and a human body filmed as a small fragile object against orbital geometry."),

  /* ---------- Malick, and the voice over landscape ---------- */
  r("days of heaven", "the tree of life", "rhyme", "none", 0.7, 0.5,
    "Whispered narration by a child laid over golden-hour landscape, the story arriving in fragments between images of wind and water."),
  r("days of heaven", "badlands", "rhyme", "none", 0.68, 0.5,
    "A flat, unimpressed young woman's voice-over describing violence and flight as though recounting a holiday."),
  r("the tree of life", "2001 a space odyssey", "descent", "b", 0.56, 0.38,
    "A domestic story interrupted by the origin of the universe, the film insisting the two belong in the same edit."),

  /* ---------- Coen brothers ---------- */
  r("fargo", "no country for old men", "rhyme", "none", 0.7, 0.5,
    "A decent local lawman arrives after each act of violence rather than during it, and the film ends on their inability to explain it."),
  r("no country for old men", "the wages of fear", "convergence", "none", 0.5, 0.32,
    "Suspense built almost entirely from process and silence, with the score withheld so that objects and rooms carry the dread."),
  r("fargo", "memories of murder", "convergence", "none", 0.56, 0.38,
    "Provincial police out of their depth, the investigation played for awkward comedy right up against real cruelty."),

  /* ---------- Paul Thomas Anderson, and the modern chamber film ---------- */
  r("the master", "there will be blood", "rhyme", "none", 0.68, 0.5,
    "Two men locked in a dominance ritual that neither can leave, filmed in wide compositions with a score used as irritant."),
  r("phantom thread", "rebecca", "descent", "b", 0.62, 0.44,
    "A young woman brought into a great house governed by a dead woman's rules and a sister who enforces them."),
  r("phantom thread", "vertigo", "rhyme", "none", 0.58, 0.4,
    "A man who dresses a woman to a specification, and a film that gradually hands the power to the person being dressed."),

  /* ---------- recent, and where it came from ---------- */
  r("the zone of interest", "the white ribbon", "convergence", "none", 0.66, 0.48,
    "Atrocity kept entirely outside the frame while a family's domestic routine continues, the sound design carrying what the camera refuses."),
  r("the zone of interest", "shoah", "descent", "b", 0.6, 0.44,
    "The camp approached only from outside and after, on the principle that reconstructing it would be the greater obscenity."),
  r("amour", "tokyo story", "convergence", "none", 0.52, 0.34,
    "Old age filmed in fixed frames inside one apartment, with the adult child's helplessness treated as its own quiet subject."),
  r("aftersun", "past lives", "convergence", "none", 0.6, 0.42,
    "A memory reconstructed by someone now old enough to see what they missed, with the film withholding the reading until very late."),
  r("aftersun", "sans soleil", "rhyme", "none", 0.5, 0.32,
    "Camcorder footage treated as an unreliable archive, the grain and the gaps doing as much as anything recorded."),
  r("all of us strangers", "a ghost story", "convergence", "none", 0.58, 0.4,
    "The dead kept present as ordinary company, the film treating grief as a room somebody is still living in."),
  r("petite maman", "past lives", "convergence", "none", 0.5, 0.32,
    "A quiet fantastic premise used to let two people meet at an age they never shared, resolved without any explanation."),
  r("the lighthouse", "persona", "convergence", "none", 0.56, 0.38,
    "Two people isolated together until identity starts to slip between them, shot in monochrome close to a square frame."),
  r("the lighthouse", "eraserhead", "convergence", "none", 0.58, 0.4,
    "Monochrome dread built out of industrial noise — a foghorn, machinery — with the sound design running the film."),
  r("everything everywhere all at once", "2046", "convergence", "none", 0.46, 0.3,
    "Alternate lives visited as a way of grieving the one that was actually lived."),
  r("oppenheimer", "the conformist", "convergence", "none", 0.48, 0.3,
    "A man's complicity assembled out of hearings and flashbacks, with the film cross-cutting his justification against the record."),
  r("killers of the flower moon", "chinatown", "convergence", "none", 0.56, 0.38,
    "A crime that turns out to be the shape of an entire economy, where solving it changes nothing because everyone already knew."),

  /* ---------- Tarkovsky's other films, and Antonioni's ---------- */
  r("ivan s childhood", "come and see", "descent", "a", 0.64, 0.46,
    "A boy inside a war filmed with dreams cut into the reconnaissance, the child's face used as the whole measure of it."),
  r("nostalghia", "the sacrifice", "rhyme", "none", 0.68, 0.5,
    "A man performing a private ritual nobody asked for — carrying a candle, burning a house — filmed in takes long enough to become an ordeal."),
  r("nostalghia", "sans soleil", "convergence", "none", 0.5, 0.32,
    "Exile filmed as an inability to be in one place, images of home intruding on the country the film is actually in."),
  r("la notte", "l avventura", "rhyme", "none", 0.7, 0.5,
    "A couple walking through modern architecture with nothing left to say, the buildings given more attention than the marriage."),
  r("the passenger", "vertigo", "convergence", "none", 0.54, 0.36,
    "A man takes another's identity and finds it comes with appointments he must keep, the new life closing around him."),
  r("zabriskie point", "badlands", "convergence", "none", 0.5, 0.32,
    "Young Americans drifting through desert landscape toward a violence the film shoots as spectacle rather than as consequence."),

  /* ---------- Bergman's chamber films ---------- */
  r("through a glass darkly", "persona", "rhyme", "none", 0.64, 0.46,
    "Four people on an island, illness rendered as a chamber piece where the camera stays on faces listening."),
  r("autumn sonata", "amour", "convergence", "none", 0.5, 0.32,
    "A reckoning conducted in one house over a night, filmed as two people finally saying the unsayable thing to each other."),
  r("hour of the wolf", "eraserhead", "convergence", "none", 0.52, 0.34,
    "An artist's dread externalised into visitors who may not exist, in a film that stops distinguishing between them and the room."),
  r("fanny and alexander", "the tree of life", "convergence", "none", 0.54, 0.36,
    "Childhood filmed as an enormous house of relatives and rituals, with a father's severity remembered as weather."),
  r("the seventh seal", "the turin horse", "convergence", "none", 0.48, 0.3,
    "A world running out, played as a series of encounters on a road while the ending arrives on schedule."),

  /* ---------- odds worth having ---------- */
  r("la strada", "the elephant man", "convergence", "none", 0.48, 0.3,
    "A person exhibited for money, filmed so that the audience inside the film implicates the one watching it."),
  r("battleship potemkin", "the battle of algiers", "descent", "a", 0.62, 0.44,
    "Insurrection staged as mass movement rather than individual heroism, cut so that the crowd is the protagonist."),
  r("october ten days that shook the world", "battleship potemkin", "rhyme", "none", 0.66, 0.5,
    "History assembled by collision — a statue toppled, a bridge rising — where meaning is produced by the cut rather than the shot."),
  r("mon oncle", "playtime", "rhyme", "none", 0.72, 0.55,
    "A modern house that defeats its inhabitants, gags built entirely from appliances, geometry and the sound of footsteps."),
  r("the american friend", "le samourai", "convergence", "none", 0.54, 0.36,
    "A dying man turned into a hitman, the killing filmed as awkward, badly lit work rather than as competence."),
  r("grey gardens", "sherman s march", "convergence", "none", 0.56, 0.38,
    "Direct cinema that admits the crew are participants, with subjects performing for the camera they clearly enjoy having."),
  r("lessons of darkness", "koyaanisqatsi", "convergence", "none", 0.6, 0.42,
    "Aerial footage of a devastated landscape scored like a requiem, withholding the captions that would make it reportage."),
  r("pather panchali", "bicycle thieves", "descent", "b", 0.7, 0.55,
    "Village poverty filmed with non-professionals and real locations, the story advancing through weather, illness and small errands."),
  r("pather panchali", "killer of sheep", "convergence", "none", 0.52, 0.34,
    "Children playing at the edge of hardship, the film finding its structure in their attention rather than in a plot."),
  r("beau travail", "the ascent", "convergence", "none", 0.46, 0.3,
    "Military discipline filmed as ritual in a hostile landscape, with jealousy and faith carried almost entirely by bodies."),
  r("ulysses gaze", "nostalghia", "convergence", "none", 0.54, 0.36,
    "A filmmaker crossing borders in search of lost footage, the journey shot in very long takes that fold decades into one move."),
  r("underground", "amarcord", "convergence", "none", 0.48, 0.3,
    "National history retold as a drunken carnival, with a brass band playing through events that were not funny."),
  r("ashes and diamonds", "the conformist", "convergence", "none", 0.58, 0.4,
    "A political assassin filmed in deep-focus compositions that keep placing him against the ideology he is serving."),
  r("ida", "winter light", "convergence", "none", 0.56, 0.38,
    "Faith and history examined in cold monochrome, characters framed low in the shot with a great deal of empty air above them."),
  r("cold war", "in the mood for love", "convergence", "none", 0.54, 0.36,
    "A love affair told in ellipses across years, each reunion a separate scene with the intervening life left out."),
  r("loves of a blonde", "the 400 blows", "convergence", "none", 0.46, 0.3,
    "Non-professional faces and a semi-documentary looseness, the drama emerging from a dance hall rather than from a script."),

  /* ==================================================================
     FIFTH PASS. Genre spines — the western, the giallo, the American
     seventies, the studio-era German import — plus the remaining
     director bodies with several corpus titles and no authored edge.
     ================================================================== */

  /* ---------- German expressionism, and the long shadow ---------- */
  r("the cabinet of dr caligari", "nosferatu", "convergence", "none", 0.64, 0.46,
    "Terror carried by design rather than by incident — angles that cannot exist, and a shadow doing the acting."),
  r("nosferatu", "nosferatu the vampyre", "descent", "a", 0.82, 0.8,
    "The same film remade shot for shot in places, keeping the rat-faced vampire as a plague carrier rather than a seducer."),
  r("nosferatu", "bram stoker s dracula", "rebuttal", "b", 0.6, 0.44,
    "The vampire restored to romance and colour, answering a version that made him vermin and daylight the cure."),
  r("m", "seven samurai", "convergence", "none", 0.44, 0.28,
    "A community organising itself against a threat the authorities cannot handle, filmed as logistics before it is filmed as drama."),
  r("dr mabuse the gambler", "the godfather", "convergence", "none", 0.48, 0.3,
    "Criminal power as an organisation with reach into finance and government, filmed as a system rather than a gang."),
  r("the last laugh", "bicycle thieves", "descent", "a", 0.58, 0.42,
    "A working man stripped of the one thing that gave him standing, told almost entirely without words and without pity."),
  r("sunrise a song of two humans", "days of heaven", "descent", "a", 0.6, 0.44,
    "A rural triangle filmed as light and weather, with the city visited as a dream sequence of what the couple could be."),
  r("pandora s box", "vertigo", "convergence", "none", 0.5, 0.32,
    "A woman photographed as an object of fascination by a film that is half in love with the men destroying her."),
  r("napoleon", "koyaanisqatsi", "convergence", "none", 0.44, 0.28,
    "Silent cinema pushing the apparatus itself into the subject — split screens, hand-held cameras, spectacle as technique."),

  /* ---------- Powell and Pressburger ---------- */
  r("the red shoes", "black narcissus", "rhyme", "none", 0.66, 0.5,
    "Technicolor pushed into hallucination, with a woman's vocation and her desire staged as a fight the design has already settled."),
  r("a matter of life and death", "wings of desire", "convergence", "none", 0.6, 0.44,
    "A bureaucracy of the afterlife rendered in a different colour system from the living world, with the crossing itself dramatised."),
  r("the life and death of colonel blimp", "barry lyndon", "convergence", "none", 0.54, 0.36,
    "A life told across decades as a series of formal codes going out of date, with the hero increasingly a period piece himself."),
  r("peeping tom", "psycho", "convergence", "none", 0.72, 0.55,
    "Released the same year: a murderer given the audience's own point of view, and a film that makes looking the crime."),
  r("peeping tom", "blowup", "rhyme", "none", 0.58, 0.4,
    "The camera as the instrument of the story rather than its means, with the photographer's obsession supplying the whole plot."),

  /* ---------- the western: the classical run ---------- */
  r("stagecoach", "rio bravo", "convergence", "none", 0.6, 0.44,
    "A confined group of mismatched types under siege, the genre's pleasure coming from watching a company form under pressure."),
  r("my darling clementine", "the searchers", "rhyme", "none", 0.64, 0.46,
    "The town built up around a hero who cannot stay in it, with the church dance as the image of everything he is outside of."),
  r("red river", "the searchers", "convergence", "none", 0.62, 0.44,
    "John Wayne cast as a man whose obsession curdles into tyranny, the film using his authority against the audience's trust in it."),
  r("winchester 73", "unforgiven", "descent", "a", 0.58, 0.4,
    "A revenge western where the gun is passed from hand to hand, each owner briefly convinced it makes them the protagonist."),
  r("the man who shot liberty valance", "unforgiven", "descent", "a", 0.7, 0.52,
    "The film that prints the legend and then shows you the paperwork — the heroic killing revealed as something quieter and shabbier."),
  r("the man who shot liberty valance", "the last picture show", "convergence", "none", 0.56, 0.38,
    "The west remembered from inside a town that has already stopped being one, filmed in monochrome after colour was standard."),
  r("ride the high country", "the wild bunch", "rhyme", "none", 0.68, 0.5,
    "Ageing men finding their profession has outlived them, and choosing a death that lets them be the thing they used to be."),
  r("the wild bunch", "bonnie and clyde", "convergence", "none", 0.62, 0.44,
    "Slow-motion arterial violence introduced as an aesthetic, the ending staged as a ballet the film has been promising throughout."),
  r("mccabe mrs miller", "unforgiven", "convergence", "none", 0.64, 0.46,
    "The frontier as a wet, cold, commercial place where a killing is a business decision made by men in an office."),
  r("mccabe mrs miller", "the long goodbye", "rhyme", "none", 0.6, 0.44,
    "Overlapping mumbled dialogue and a zoom that keeps drifting, so the genre's hero is never quite given the frame he expects."),
  r("django", "the great silence", "rhyme", "none", 0.7, 0.52,
    "Spaghetti western turned bleak and mud-caked, with an ending that refuses the genre's guarantee that the gunman wins."),
  r("django", "a fistful of dollars", "convergence", "none", 0.62, 0.44,
    "The Italian western's founding year: a lone stranger, an absent state, and violence shot for style rather than for justice."),
  r("dead man", "the great silence", "convergence", "none", 0.54, 0.36,
    "A western played in monochrome and snow as an extended dying, the hero passive and the landscape indifferent."),
  r("dead man", "el topo", "convergence", "none", 0.5, 0.32,
    "The western reworked as a spiritual passage, its encounters symbolic and its violence arriving without warning or meaning."),

  /* ---------- the American seventies ---------- */
  r("mean streets", "the king of comedy", "convergence", "none", 0.56, 0.4,
    "A man whose self-image is entirely borrowed from screens, the film refusing to correct him or to punish him properly."),
  r("the king of comedy", "taxi driver", "rebuttal", "b", 0.68, 0.5,
    "The same lonely man and the same delusional plan, played as excruciating comedy and rewarded, which is the more disturbing answer."),
  r("after hours", "the tenant", "convergence", "none", 0.54, 0.36,
    "One night in a city that will not let a man go home, escalating by absurd increments until paranoia is simply accurate."),
  r("the godfather part ii", "the godfather", "rhyme", "none", 0.78, 0.6,
    "The rise cut against the decay, the father's ascent and the son's hollowing told in the same frames so each comments on the other."),
  r("silence", "winter light", "convergence", "none", 0.6, 0.44,
    "A priest whose god does not answer, filmed patiently enough that the silence in the title is a formal choice, not a theme."),
  r("the departed", "infernal affairs", "descent", "b", 0.8, 0.85,
    "Two moles in mirrored institutions, each hunting the other, remade almost beat for beat with the Catholic guilt turned up."),
  r("the graduate", "rebel without a cause", "descent", "b", 0.56, 0.4,
    "A young man with no vocabulary for what is wrong, and a film that puts him in compositions where adults occupy all the space."),
  r("midnight cowboy", "taxi driver", "convergence", "none", 0.6, 0.42,
    "New York filmed as a place that grinds down whoever arrives believing in it, the loneliness carried by documentary texture."),
  r("dog day afternoon", "serpico", "convergence", "none", 0.62, 0.44,
    "Institutions filmed as sweaty procedure and shouting, the star performance kept inside a naturalism that refuses heroics."),
  r("dog day afternoon", "network", "convergence", "none", 0.56, 0.38,
    "A private crisis converted into live television, the crowd outside becoming the story faster than the story does."),
  r("all the president s men", "z", "convergence", "none", 0.64, 0.46,
    "Investigation as tedium and telephone calls, with the political rot conveyed by how ordinary the work of exposing it looks."),
  r("all the president s men", "klute", "rhyme", "none", 0.6, 0.44,
    "Surveillance-era paranoia built out of composition — figures dwarfed by ceilings, conversations shot from too far away."),
  r("klute", "the conversation", "convergence", "none", 0.62, 0.44,
    "The listener who becomes the subject, in a cycle of American films where the tape recorder is the real antagonist."),
  r("the french connection", "heat", "descent", "a", 0.62, 0.44,
    "Police work as grinding surveillance punctuated by sudden, badly lit violence, shot in real streets with real traffic."),
  r("sorcerer", "the wages of fear", "descent", "b", 0.84, 0.85,
    "The same premise — desperate men driving nitroglycerin over impossible roads — remade with the jungle as an active antagonist."),
  r("deliverance", "aguirre the wrath of god", "convergence", "none", 0.5, 0.32,
    "A river journey by men who have badly misjudged the place they are in, filmed on locations that visibly endangered the crew."),
  r("heaven s gate", "mccabe mrs miller", "convergence", "none", 0.56, 0.38,
    "The west as an immigrant labour dispute settled by capital, filmed in dust and smoke at a scale that ruined its makers."),
  r("nashville", "short cuts", "rhyme", "none", 0.72, 0.55,
    "Two dozen lives crossing a single city, dialogue overlapped and microphones left open so the film never fully privileges anyone."),
  r("short cuts", "magnolia", "descent", "a", 0.7, 0.52,
    "Interlocking Los Angeles stories bound by coincidence and weather, resolving in an event that arrives from outside all of them."),
  r("the long goodbye", "inherent vice", "descent", "a", 0.68, 0.5,
    "A detective who is permanently one step behind a plot he never quite assembles, wandering a stoned Los Angeles that will not cohere."),
  r("the long goodbye", "chinatown", "convergence", "none", 0.6, 0.42,
    "Nineteen-seventies Los Angeles noir where the investigation ends in the discovery that nothing can be done about it."),

  /* ---------- giallo, and the horror that came out of it ---------- */
  r("blood and black lace", "the bird with the crystal plumage", "descent", "a", 0.72, 0.55,
    "The giallo template set: black gloves, a faceless killer, murders staged as fashion photography with the plot a distant second."),
  r("the bird with the crystal plumage", "deep red", "rhyme", "none", 0.7, 0.52,
    "A witness who saw the crucial thing and cannot retrieve it from memory, the film returning to the same image until it yields."),
  r("deep red", "blowup", "descent", "b", 0.6, 0.44,
    "A bystander convinced a detail in what he saw is the solution, replaying the scene rather than investigating it."),
  r("deep red", "suspiria", "rhyme", "none", 0.68, 0.5,
    "Primary-coloured lighting with no source in the room, and a score that behaves like a second antagonist rather than accompaniment."),
  r("blood and black lace", "halloween", "descent", "a", 0.58, 0.42,
    "The murder set piece as the unit of construction, with the killer's anonymity doing the work a character would otherwise do."),
  r("possession", "repulsion", "convergence", "none", 0.62, 0.44,
    "A marriage collapse filmed as physical horror in an apartment, the performance pitched past realism on purpose."),
  r("the devils", "the witch", "convergence", "none", 0.58, 0.4,
    "Religious hysteria treated as a social mechanism, with the accusation spreading faster than anyone can hold it back."),
  r("carrie", "the babadook", "convergence", "none", 0.56, 0.38,
    "A mother and child locked in a religious or grieving folie à deux, the supernatural arriving as the pressure finds an outlet."),
  r("carrie", "the omen", "convergence", "none", 0.52, 0.34,
    "Nineteen-seventies horror relocating evil into the family and the school, with the child as the site of it."),
  r("ring", "it follows", "descent", "a", 0.64, 0.46,
    "A curse that transmits by contact and grants a countdown, making the horror a logistical problem the characters must solve."),
  r("ring", "cure", "convergence", "none", 0.54, 0.36,
    "Japanese horror as flat, grey investigation, the dread built from videotape, procedure and static rather than from shocks."),
  r("jacob s ladder", "angel heart", "convergence", "none", 0.64, 0.46,
    "A man investigating his own past who is the last to understand what the film has already told the audience about his condition."),
  r("angel heart", "chinatown", "convergence", "none", 0.5, 0.32,
    "The private eye whose case resolves into his own implication, the detective genre used to deliver a verdict on the detective."),
  r("the witch", "midsommar", "rhyme", "none", 0.68, 0.5,
    "Folk horror shot in daylight and period detail, where the community's rules are consistent and the outsider's fate is a formality."),
  r("midsommar", "the wicker man", "descent", "b", 0.74, 0.58,
    "An outsider welcomed into a rural community's summer festival, the hospitality and the sacrifice turning out to be the same thing."),
  r("the wicker man", "the white ribbon", "convergence", "none", 0.5, 0.32,
    "A closed community filmed anthropologically, its violence emerging from custom rather than from any individual's malice."),
  r("it follows", "halloween", "descent", "b", 0.62, 0.44,
    "Suburban widescreen with something walking steadily in the background of shots the characters have not noticed yet."),
  r("don t look now", "the wicker man", "convergence", "none", 0.6, 0.42,
    "British horror of the same year built on a rationalist refusing an omen, and on an ending that arrives as an editing trick."),

  /* ---------- Cronenberg's body, and the American genre answer ---------- */
  r("scanners", "akira", "convergence", "none", 0.58, 0.4,
    "Psychic power treated as a physical, damaging force, with the state running the programme and losing control of it."),
  r("dead ringers", "persona", "convergence", "none", 0.58, 0.4,
    "Two identities that cannot be told apart collapsing into one another, performance and design doing the work of an explanation."),
  r("naked lunch", "eraserhead", "convergence", "none", 0.56, 0.38,
    "Interior life externalised as wet machinery, the film declining to mark any point where the hallucination began."),
  r("crash", "videodrome", "rhyme", "none", 0.64, 0.46,
    "Desire rewired by technology and injury, filmed coldly enough that the transgression reads as a thesis rather than a shock."),
  r("a history of violence", "unforgiven", "convergence", "none", 0.6, 0.42,
    "A quiet man's competence at killing exposed as a past he cannot put down, with the family watching him become it again."),
  r("assault on precinct 13", "rio bravo", "descent", "b", 0.74, 0.6,
    "A handful of defenders and prisoners holding a station against a silent, numberless siege — the Hawks structure moved to the city."),
  r("assault on precinct 13", "night of the living dead", "convergence", "none", 0.64, 0.46,
    "A siege where the attackers are deliberately unmotivated, so the film's real material is the alliance forming inside."),
  r("escape from new york", "mad max 2", "convergence", "none", 0.6, 0.42,
    "A near-future built from what could be shot practically, the world implied by costume and wreckage rather than explained."),
  r("they live", "videodrome", "convergence", "none", 0.62, 0.44,
    "Media as a signal that instructs a population, with a device that lets one man see the instruction and nobody believe him."),
  r("in the mouth of madness", "the shining", "convergence", "none", 0.52, 0.34,
    "A writer's work overtaking the world it describes, the film shifting from investigation to being inside the book."),
  r("big trouble in little china", "raiders of the lost ark", "rebuttal", "b", 0.56, 0.4,
    "The adventure hero played as a loud idiot who is actually the sidekick, the genre's competence handed to everyone else."),

  /* ---------- Spielberg, and the machine of it ---------- */
  r("raiders of the lost ark", "the searchers", "descent", "b", 0.5, 0.34,
    "The serial adventure rebuilt with classical Hollywood grammar — geography always legible, action staged in wide masters."),
  r("jaws", "jurassic park", "rhyme", "none", 0.68, 0.5,
    "The creature withheld for an hour while its effects are staged instead, the restraint arrived at partly by necessity."),
  r("e t the extra terrestrial", "close encounters of the third kind", "rhyme", "none", 0.72, 0.55,
    "Suburbia visited by something benign, the camera kept at a child's height and the adults shot as legs and authority."),
  r("schindler s list", "shoah", "rebuttal", "b", 0.6, 0.44,
    "Dramatic reconstruction of the camps set against a film built on the principle that reconstruction is the wrong instrument."),
  r("saving private ryan", "come and see", "convergence", "none", 0.6, 0.42,
    "War rendered as sensory assault — deafness, desaturation, the camera taking hits — to refuse the audience a clean vantage."),
  r("a i artificial intelligence", "blade runner", "convergence", "none", 0.62, 0.44,
    "A manufactured child who wants to be loved as real, in a film that keeps asking the audience to decide what that would require."),
  r("a i artificial intelligence", "2001 a space odyssey", "descent", "b", 0.58, 0.42,
    "A Kubrick project finished by another hand, ending on a coda outside human time that divides audiences on exactly that."),
  r("minority report", "blade runner", "convergence", "none", 0.6, 0.42,
    "Philip K. Dick's premise as a wet, over-lit procedural where the detective is investigating his own certainty."),
  r("munich", "the battle of algiers", "convergence", "none", 0.56, 0.38,
    "Political violence filmed as trade-craft, with the film accumulating operations until the moral arithmetic stops working."),

  /* ---------- the eighties genre machine ---------- */
  r("terminator 2 judgment day", "the terminator", "rebuttal", "b", 0.7, 0.55,
    "The same figure turned protector, the sequel answering its own horror premise by making the machine the only reliable parent."),
  r("the abyss", "solaris", "convergence", "none", 0.5, 0.32,
    "Contact with something incomprehensible staged inside a pressurised station, with the marriage the actual subject."),
  r("titanic", "the tree of life", "convergence", "none", 0.4, 0.26,
    "A vast historical event framed by a survivor's memory, the film moving between spectacle and the small hand holding it together."),
  r("predator", "alien", "descent", "b", 0.64, 0.46,
    "A team picked off one at a time by something that sees differently from them, the creature's point of view given its own grammar."),
  r("robocop", "they live", "convergence", "none", 0.62, 0.44,
    "Satire delivered inside the genre it parodies, with commercial breaks cut into the film to do the political argument."),
  r("robocop", "a history of violence", "convergence", "none", 0.48, 0.3,
    "A man rebuilt around his own capacity for violence, the film locating the horror in his returning memory of a family."),
  r("total recall", "the matrix", "convergence", "none", 0.6, 0.42,
    "A reality that may be a purchased implant, with the film declining to close the question it keeps raising."),
  r("dark city", "the matrix", "convergence", "none", 0.64, 0.46,
    "Released a year apart: a city rebuilt nightly by unseen authorities, and one man who wakes up during the rebuild."),
  r("gladiator", "spartacus", "descent", "b", 0.68, 0.5,
    "The epic revived around a slave who becomes a threat to the empire by being popular in its arena."),
  r("the duellists", "barry lyndon", "descent", "b", 0.66, 0.5,
    "A period feud told across decades in painterly compositions, the code of honour presented as an absurdity nobody can exit."),
  r("thelma louise", "bonnie and clyde", "descent", "b", 0.64, 0.46,
    "Two people driving toward an ending the film has already promised, the landscape widening as their options close."),

  /* ---------- Paul Thomas Anderson and the Coens ---------- */
  r("boogie nights", "goodfellas", "descent", "b", 0.66, 0.5,
    "A subculture entered as a found family and exited as a wreck, narrated by long tracking shots that show off the world before it sours."),
  r("magnolia", "short cuts", "descent", "b", 0.7, 0.52,
    "Los Angeles stories cut together and resolved by an event no character causes, with a shared song used to bind them."),
  r("punch drunk love", "the umbrellas of cherbourg", "convergence", "none", 0.5, 0.34,
    "Romance staged in saturated colour blocks with music running underneath the dialogue, the genre's sweetness kept but the ground made unstable."),
  r("blood simple", "double indemnity", "descent", "b", 0.64, 0.46,
    "A murder plan that works and then keeps going wrong, with each participant acting on a different, incomplete picture."),
  r("miller s crossing", "the godfather", "convergence", "none", 0.58, 0.4,
    "Gangster loyalty filmed as formal ritual and coded dialogue, with the protagonist's real motive withheld to the end."),
  r("the big lebowski", "the long goodbye", "descent", "b", 0.7, 0.55,
    "Chandler's plot handed to a man with no interest in solving it, the detective replaced by someone who just wants his property back."),
  r("the man who wasn t there", "double indemnity", "descent", "b", 0.62, 0.44,
    "Monochrome noir narrated by a passive man whose one decisive act unravels everything, told from a position he cannot alter."),
  r("a serious man", "winter light", "convergence", "none", 0.52, 0.34,
    "A man petitioning a silent god for an explanation, the film supplying authorities who each decline to give one."),
  r("inside llewyn davis", "the last picture show", "convergence", "none", 0.5, 0.32,
    "An artist circling back to where he started, the film built as a loop so that the failure is structural rather than dramatic."),
  r("true grit", "the searchers", "convergence", "none", 0.54, 0.36,
    "A pursuit across territory undertaken by people who should not be travelling together, the journey outlasting its own purpose."),
  r("fargo", "blood simple", "rhyme", "none", 0.6, 0.44,
    "A scheme by people who have overestimated themselves, escalating through misunderstanding rather than through cunning."),

  /* ---------- Lynch's other films ---------- */
  r("lost highway", "mulholland drive", "rhyme", "none", 0.76, 0.58,
    "A story that swaps its protagonist halfway and restarts, the second half reading as the first one's alibi."),
  r("twin peaks fire walk with me", "blue velvet", "rhyme", "none", 0.66, 0.48,
    "Small-town America filmed with the abuse at the centre rather than as a discovery, the tone stripped of its earlier irony."),
  r("wild at heart", "badlands", "convergence", "none", 0.56, 0.38,
    "Lovers on the run through an American landscape rendered as pure iconography, violence arriving without escalation."),
  r("inland empire", "persona", "convergence", "none", 0.58, 0.4,
    "An actress dissolving into the part, shot on degraded video so the image itself stops being able to hold her."),
  r("the straight story", "the turin horse", "convergence", "none", 0.46, 0.3,
    "A journey conducted at the slowest possible speed, with the film's patience the entire formal proposition."),

  /* ---------- Malick's later manner ---------- */
  r("the thin red line", "come and see", "convergence", "none", 0.6, 0.42,
    "War with the interior monologue left in and the tactics taken out, the landscape given as much attention as the battle."),
  r("the thin red line", "apocalypse now", "convergence", "none", 0.58, 0.4,
    "Voice-over from several soldiers at once over a Pacific campaign, the film philosophical where the genre is usually procedural."),
  r("the new world", "aguirre the wrath of god", "convergence", "none", 0.54, 0.36,
    "Europeans arriving in a place they cannot read, the film staying with the incomprehension rather than resolving it."),
  r("to the wonder", "the tree of life", "rhyme", "none", 0.62, 0.46,
    "Narrative dissolved almost entirely into gesture, weather and whispered fragments, with the camera never settling."),
  r("knight of cups", "la dolce vita", "descent", "b", 0.58, 0.42,
    "A man drifting through parties in a city of surfaces, the film structured as episodes rather than as a story that progresses."),

  /* ---------- Ozu's other decades, and Kurosawa early ---------- */
  r("i was born but", "good morning", "rhyme", "none", 0.72, 0.55,
    "Ozu remaking his own comedy about boys going on strike against their father, the second version arguing with television."),
  r("i was born but", "the 400 blows", "convergence", "none", 0.54, 0.36,
    "Children discovering their parents are diminished in the world outside the home, played without sentimentality."),
  r("equinox flower", "late spring", "rhyme", "none", 0.68, 0.5,
    "A father who cannot say what he wants and a daughter's marriage used as the occasion, staged in the same still rooms."),
  r("the end of summer", "an autumn afternoon", "rhyme", "none", 0.66, 0.48,
    "A family adjusting around a death that the film treats as weather, ending on landscape rather than on grief."),
  r("an inn in tokyo", "bicycle thieves", "convergence", "none", 0.56, 0.4,
    "A father and children walking a city looking for work, the film observing poverty as a routine rather than as a crisis."),
  r("the record of a tenement gentleman", "killer of sheep", "convergence", "none", 0.48, 0.3,
    "Post-war poverty filmed through children at play, the adults' hardship visible mainly in what they cannot give."),
  r("sanshiro sugata", "seven samurai", "convergence", "none", 0.5, 0.32,
    "Martial discipline as a moral education, with the fight scenes staged to show what the training has actually changed."),

  /* ---------- Fassbinder, and the German seventies ---------- */
  r("the bitter tears of petra von kant", "persona", "convergence", "none", 0.6, 0.42,
    "Two women in one room across a handful of scenes, the power between them reversing while the camera stays put."),
  r("fox and his friends", "ali fear eats the soul", "rhyme", "none", 0.66, 0.5,
    "A working-class outsider taken up by a moneyed circle who strip him politely, with the cruelty always framed as taste."),
  r("the tin drum", "amarcord", "convergence", "none", 0.5, 0.32,
    "Fascism observed from a child's vantage in a provincial town, the grotesque used because realism would be too forgiving."),
  r("the lost honour of katharina blum", "z", "convergence", "none", 0.54, 0.36,
    "The press and the state converging on one person, the film built as a procedural record of how a reputation is dismantled."),

  /* ---------- Wenders, roads ---------- */
  r("alice in the cities", "paris texas", "rhyme", "none", 0.68, 0.5,
    "A man and a child driving in search of a house neither can describe, the road movie used as a way of not talking."),
  r("kings of the road", "alice in the cities", "rhyme", "none", 0.66, 0.48,
    "Two men and a van along a border, the film letting long stretches of nothing accumulate into the actual subject."),
  r("until the end of the world", "la jetee", "convergence", "none", 0.48, 0.3,
    "A device that lets people watch their own recorded dreams, and characters who become addicted to the playback."),

  /* ---------- French remainder ---------- */
  r("jules and jim", "the umbrellas of cherbourg", "convergence", "none", 0.48, 0.3,
    "A love triangle told across years with the tone kept buoyant, so the eventual ruin arrives without changing register."),
  r("bande a part", "breathless", "rhyme", "none", 0.62, 0.44,
    "American crime picture affectionately mishandled — a dance, a sprint through the Louvre, a heist that barely matters."),
  r("elevator to the gallows", "le samourai", "convergence", "none", 0.6, 0.42,
    "A crime undone by one mechanical failure, the city at night shot with jazz as the only commentary."),
  r("le doulos", "le samourai", "rhyme", "none", 0.68, 0.5,
    "Loyalty among criminals filmed as an unreadable surface, the audience denied the information that would let them judge."),
  r("leon morin priest", "diary of a country priest", "convergence", "none", 0.58, 0.4,
    "Faith argued in conversation between a priest and a sceptic, with the attraction between them never quite named."),
  r("muriel", "hiroshima mon amour", "rhyme", "none", 0.6, 0.44,
    "The past intruding on the present as fragments that will not assemble, with a war nobody in the room will name directly."),
  r("providence", "8", "convergence", "none", 0.52, 0.34,
    "An author drafting and redrafting his own family as characters, the film cutting between the version and the correction."),
  r("paris belongs to us", "the conversation", "convergence", "none", 0.46, 0.3,
    "A conspiracy that may be entirely constructed by the person investigating it, and a film that refuses to adjudicate."),

  /* ---------- British ---------- */
  r("if", "kes", "convergence", "none", 0.56, 0.38,
    "English schooling as an institution designed to reduce its pupils, filmed in the same period from opposite ends of the class system."),
  r("withnail and i", "midnight cowboy", "convergence", "none", 0.44, 0.28,
    "Two dependents at the end of an era, the comedy carried entirely by how badly they misread their own situation."),
  r("trainspotting", "goodfellas", "convergence", "none", 0.56, 0.4,
    "Narrated, needle-dropped, propulsive account of a subculture that keeps promising the audience a good time it will withdraw."),
  r("the night of the hunter", "the witch", "convergence", "none", 0.56, 0.38,
    "American religious menace filmed in storybook compositions, children left alone with an adult reciting scripture at them."),
  r("the night of the hunter", "blue velvet", "descent", "a", 0.54, 0.36,
    "A child's-eye view of an evil that the adult world cannot see, staged in tableaux that look like a hymn book."),
  r("in a lonely place", "sunset boulevard", "convergence", "none", 0.62, 0.44,
    "Hollywood's own bitterness, released within a year of each other, both starring people the industry had already used up."),
  r("johnny guitar", "rebel without a cause", "convergence", "none", 0.5, 0.32,
    "Melodrama in saturated colour where the real conflict is emotional and the genre trappings are barely a pretext."),
  r("rebel without a cause", "moonlight", "descent", "a", 0.5, 0.34,
    "Adolescent tenderness between boys filmed with more attention than the plot's violence, colour used to mark the safe hours."),

  /* ---------- Eisenstein, and montage as argument ---------- */
  r("strike", "battleship potemkin", "rhyme", "none", 0.72, 0.55,
    "Labour and massacre cut as collision, with the crowd as protagonist and individual faces used as evidence rather than character."),
  r("alexander nevsky", "seven samurai", "convergence", "none", 0.5, 0.34,
    "A defensive battle staged across a wide landscape with the tactics kept legible, the score written to cut against the movement."),
  r("strike", "do the right thing", "convergence", "none", 0.44, 0.28,
    "A community's grievance building through vignette until the film converts it into a single act of collective destruction."),

  /* ==================================================================
     SIXTH PASS. The remaining high-degree uncovered films: Kurosawa's
     other two decades, Ghibli and the anime canon, Hong Kong and
     Korean genre cinema, the observational-documentary tradition,
     Western animation, and the contemporary run.

     The four `at()` entries at the top of this block were verified
     against live sources rather than written from memory — see STATE's
     note on the attested tier. Two of them (Burden of Dreams, Hearts of
     Darkness) are making-of documentaries, which is the most literally
     checkable kind of descent this corpus contains: the second film's
     entire subject is the first film's production.
     ================================================================== */

  at("le samourai", "the killer", "descent", "a", 0.82, 0.85,
    "The hitman as a figure of ritual and silence, borrowed wholesale and then drowned in slow motion and gunfire.",
    "Woo has named Melville repeatedly as his formative influence — 'I'm greatly influenced by Jean-Pierre Melville' — and has described The Killer as his homage"),
  at("fitzcarraldo", "burden of dreams", "descent", "a", 0.9, 0.95,
    "A documentary whose entire subject is the first film's production — the boat, the mountain, and a director who would not be told it was impossible.",
    "Les Blank's 1982 film is a making-of documentary shot on location during Fitzcarraldo's production"),
  at("apocalypse now", "hearts of darkness a filmmaker s apocalypse", "descent", "a", 0.9, 0.95,
    "The shoot filmed as its own disaster: a typhoon, a heart attack, and a director losing the thread of the film he is inside.",
    "Assembled from Eleanor Coppola's behind-the-scenes footage shot during the Apocalypse Now production"),
  at("the act of killing", "the look of silence", "descent", "a", 0.86, 0.9,
    "The same killings approached from the other side — a survivor's brother sitting opposite the men who did it, asking them quietly to account for it.",
    "Oppenheimer's companion film, drawn from the same fieldwork on the 1965-66 Indonesian killings"),

  /* ---------- Kurosawa's other two decades ---------- */
  r("drunken angel", "stray dog", "rhyme", "none", 0.7, 0.52,
    "Occupation-era Tokyo as swamp and black market, with Mifune introduced as a young man whose sickness and his criminality are the same condition."),
  r("stray dog", "the maltese falcon", "convergence", "none", 0.5, 0.32,
    "A detective story where the missing object organises everything, the search taking the investigator through every stratum of a city."),
  r("stray dog", "memories of murder", "descent", "a", 0.6, 0.42,
    "Police work as heat, exhaustion and legwork, the detective's competence eroding as the case refuses to close."),
  r("the lower depths", "the exterminating angel", "convergence", "none", 0.5, 0.32,
    "A single set full of people who cannot leave it, the film content to let the confinement generate everything."),
  r("the idiot", "rashomon", "convergence", "none", 0.46, 0.3,
    "Dostoevsky's moral extremity transplanted to a snowbound Japan, faces held long past comfort while a character explains himself."),
  r("red beard", "ikiru", "rhyme", "none", 0.6, 0.44,
    "A man learning what his work is actually for, told in long episodes at a public institution rather than through a plot."),
  r("dodes ka den", "killer of sheep", "convergence", "none", 0.54, 0.36,
    "Life in a slum given as vignettes with no through-line, colour and play used to keep the poverty from becoming only misery."),
  r("dersu uzala", "aguirre the wrath of god", "convergence", "none", 0.5, 0.32,
    "Men out of their depth in a landscape indifferent to them, filmed at real scale in real weather."),
  r("kagemusha", "ran", "rhyme", "none", 0.74, 0.56,
    "Late Kurosawa in enormous colour blocks: armies as moving fields of red and gold, a ruler who has become a symbol nobody needs."),
  r("sanshiro sugata", "drunken angel", "rhyme", "none", 0.52, 0.34,
    "Early Kurosawa working out his subject: a hot-headed young man taken in hand by an older one who is right and unbearable about it."),

  /* ---------- Japanese cinema, the rest ---------- */
  r("yearning", "late spring", "convergence", "none", 0.56, 0.38,
    "A woman's obligations to a family that is not quite hers, the film ending on a refusal rather than a resolution."),
  r("an actor s revenge", "in the mood for love", "convergence", "none", 0.46, 0.3,
    "Theatrical artifice embraced completely — painted backdrops, stylised light — with the emotion carried by staging rather than realism."),
  r("fires on the plain", "come and see", "convergence", "none", 0.66, 0.48,
    "A soldier reduced to a body looking for food, war stripped of objective until only hunger and the next field remain."),
  r("the insect woman", "when a woman ascends the stairs", "convergence", "none", 0.58, 0.4,
    "A woman's economic survival across decades of Japanese history, the film keeping an anthropologist's distance from her choices."),
  r("sonatine", "le samourai", "descent", "b", 0.66, 0.48,
    "A gangster waiting for something to happen, the violence sudden and flat, the boredom between jobs given more screen time than the jobs."),
  r("sonatine", "beau travail", "convergence", "none", 0.5, 0.32,
    "Men killing time on a beach in formation, the film more interested in the games than in the plot they interrupt."),
  r("after life", "wings of desire", "convergence", "none", 0.6, 0.42,
    "The afterlife staffed like a modest bureaucracy, the dead interviewed in plain rooms about which memory they will keep."),
  r("after life", "ikiru", "convergence", "none", 0.54, 0.36,
    "A life audited for the one moment that justified it, the film building to that recollection rather than to an event."),
  r("eureka", "stalker", "convergence", "none", 0.5, 0.32,
    "Survivors travelling together in monochrome across a long running time, the journey a form of convalescence rather than a plot."),

  /* ---------- Ghibli, and the anime canon ---------- */
  r("nausicaa of the valley of the wind", "princess mononoke", "rhyme", "none", 0.74, 0.56,
    "A young woman standing between a poisoned forest and the people destroying it, refusing the film's own offer of a side to take."),
  r("nausicaa of the valley of the wind", "dune", "convergence", "none", 0.54, 0.36,
    "A desert ecology with its own rules and enormous creatures, and a youth read by others as the figure of a prophecy."),
  r("castle in the sky", "spirited away", "rhyme", "none", 0.62, 0.44,
    "A child crossing into a world with its own working machinery and economy, the wonder built from mechanical detail rather than magic."),
  r("kiki s delivery service", "only yesterday", "convergence", "none", 0.56, 0.38,
    "Growing up rendered as ordinary work and small doubts, with no villain and no crisis larger than losing confidence."),
  r("only yesterday", "aftersun", "convergence", "none", 0.52, 0.34,
    "An adult revisiting a childhood trip in fragments, the past cut against the present until the gap between them is the subject."),
  r("porco rosso", "the wind rises", "rhyme", "none", 0.62, 0.44,
    "Miyazaki's two aviation films: flight drawn as the thing he loves most, and war as what it keeps being used for."),
  r("whisper of the heart", "kiki s delivery service", "rhyme", "none", 0.58, 0.4,
    "A teenager discovering what she wants to make, the drama entirely internal and the stakes never larger than her own standard."),
  r("howl s moving castle", "spirited away", "rhyme", "none", 0.6, 0.42,
    "A girl transformed and bound to a household of strange creatures, the war outside kept deliberately incoherent."),
  r("ponyo", "my neighbor totoro", "rhyme", "none", 0.6, 0.42,
    "Miyazaki at his gentlest: a small child, a coastline, and a fantastic event the film refuses to treat as frightening."),
  r("the wind rises", "grave of the fireflies", "convergence", "none", 0.5, 0.32,
    "Ghibli looking directly at the war, one through an engineer's beautiful machines and the other through what they did."),
  r("millennium actress", "8", "descent", "b", 0.68, 0.5,
    "A life told by walking through its own films, the interviewer stepping into the scenes and memory cutting straight into performance."),
  r("millennium actress", "mulholland drive", "convergence", "none", 0.54, 0.36,
    "An actress's reality and her roles edited together until neither the film nor she can separate them."),
  r("paprika", "inception", "convergence", "none", 0.6, 0.44,
    "A device that lets one person enter another's dream, the imagery escaping into waking life as the technology fails."),
  r("paprika", "perfect blue", "rhyme", "none", 0.66, 0.48,
    "Kon cutting between a woman and her other self until the joins disappear, animation used because live action could not hold the transitions."),
  r("tokyo godfathers", "bicycle thieves", "convergence", "none", 0.5, 0.32,
    "Three homeless people crossing a city over a few days, coincidence piling up until the film admits it is a fable."),
  r("patlabor 2 the movie", "ghost in the shell", "rhyme", "none", 0.66, 0.48,
    "Oshii's real subject: long quiet passages of a city under surveillance, with the political thriller conducted mostly in briefing rooms."),
  r("fantastic planet", "nausicaa of the valley of the wind", "convergence", "none", 0.5, 0.32,
    "An alien ecology drawn in detail and treated as a real system, animation used to build a world rather than to caricature one."),

  /* ---------- Hong Kong, Taiwan, mainland ---------- */
  r("a better tomorrow", "the killer", "rhyme", "none", 0.74, 0.56,
    "Loyalty between men staged as melodrama and gunfire, slow motion and doves turning a shootout into an operatic set piece."),
  r("hard boiled", "heat", "convergence", "none", 0.58, 0.4,
    "The extended firefight as the film's real architecture, choreographed and mapped so you always know where everyone is."),
  r("a chinese ghost story", "onibaba", "convergence", "none", 0.5, 0.32,
    "Folk supernatural played for beauty and speed, the ghost a matter of design and wire-work rather than of dread."),
  r("hero", "rashomon", "descent", "b", 0.7, 0.52,
    "The same assassination retold in incompatible versions, each rendered in its own colour scheme so you always know whose account you are in."),
  r("hero", "the assassin", "convergence", "none", 0.56, 0.38,
    "Wuxia slowed and formalised, combat treated as calligraphy and the political question left deliberately unresolved."),
  r("three times", "in the mood for love", "convergence", "none", 0.6, 0.42,
    "Longing across three eras with the same two faces, each section withholding the contact the previous one promised."),
  r("the hole", "playtime", "convergence", "none", 0.5, 0.32,
    "A building's plumbing and architecture as the whole drama, humans reduced to what the structure permits them to do."),
  r("platform", "the world", "rhyme", "none", 0.66, 0.48,
    "Chinese modernisation observed through a troupe and a theme park, long takes letting a decade pass without an event."),
  r("platform", "amarcord", "convergence", "none", 0.46, 0.3,
    "A provincial youth remembered as a series of performances and public occasions rather than as a story."),

  /* ---------- Korean genre ---------- */
  r("sympathy for lady vengeance", "oldboy", "rhyme", "none", 0.7, 0.52,
    "Revenge as an elaborately designed project, the film's sympathy shifting once the audience sees the cost of completing it."),
  r("thirst", "possession", "convergence", "none", 0.54, 0.36,
    "A relationship curdling into physical horror, the performances pitched past realism and the film following them there."),
  r("decision to leave", "vertigo", "descent", "b", 0.72, 0.54,
    "A detective falling for the woman he is investigating, the surveillance itself becoming the courtship and then the trap."),
  r("mother", "memories of murder", "rhyme", "none", 0.66, 0.48,
    "A provincial killing investigated by people the system has failed, the tone lurching from farce to devastation without warning."),
  r("snowpiercer", "metropolis", "convergence", "none", 0.56, 0.38,
    "Class rendered as literal architecture — the front and the back of a train, the surface and the underground — and a revolt that travels through it."),
  r("snowpiercer", "mad max fury road", "convergence", "none", 0.5, 0.32,
    "A single vehicle as the entire world, the plot advancing by moving forward through its compartments."),

  /* ---------- Iran, and the Middle East ---------- */
  r("children of heaven", "bicycle thieves", "descent", "b", 0.64, 0.46,
    "A lost object nobody can afford to replace, the whole film built from a child's attempt to solve it without telling his parents."),
  r("gabbeh", "the color of pomegranates", "convergence", "none", 0.56, 0.38,
    "Narrative dissolved into textile and colour, the film organised as woven panels rather than as scenes."),
  r("the salesman", "a separation", "rhyme", "none", 0.66, 0.48,
    "A moral situation with no clean party, argued in apartments and stairwells until the audience is implicated in the judgement."),
  r("persepolis", "waltz with bashir", "convergence", "none", 0.66, 0.48,
    "Animated memoir of a war remembered from inside it, the drawn image doing what documentary footage could not."),
  r("persepolis", "the wind rises", "convergence", "none", 0.42, 0.26,
    "A life lived across a country's political catastrophe, drawn rather than filmed so that memory can be stylised honestly."),

  /* ---------- Latin America, Africa ---------- */
  r("o dragao da maldade contra o santo guerreiro", "el topo", "convergence", "none", 0.54, 0.36,
    "Political allegory staged as a violent, symbolic western, the landscape treated as myth rather than as geography."),
  r("bacurau", "the wild bunch", "convergence", "none", 0.54, 0.36,
    "A village that turns out to be armed and waiting, the western's siege structure repurposed as an anti-colonial revenge."),
  r("the secret in their eyes", "memories of murder", "convergence", "none", 0.56, 0.38,
    "A cold case reopened decades later, the investigator's obsession revealed as the film's actual subject."),
  r("wild tales", "amores perros", "convergence", "none", 0.5, 0.32,
    "Separate stories bound by a single register of escalating fury, each ending at the point of no return."),
  r("felicite", "bicycle thieves", "convergence", "none", 0.5, 0.32,
    "A parent moving through a city trying to raise money that will not come, the film following the errand rather than a plot."),
  r("felicite", "touki bouki", "convergence", "none", 0.5, 0.32,
    "African urban life filmed with music carrying long passages, realism giving way to something closer to trance."),

  /* ---------- observational documentary, and the essay film ---------- */
  r("chronique d un ete", "sherman s march", "descent", "a", 0.62, 0.46,
    "The filmmakers on screen asking strangers whether they are happy, then showing the subjects the footage and filming their reaction to it."),
  r("chronique d un ete", "the gleaners and i", "descent", "a", 0.56, 0.4,
    "The camera acknowledged as a participant, the interview treated as an event the film caused rather than recorded."),
  r("salesman", "grey gardens", "rhyme", "none", 0.68, 0.5,
    "The Maysles staying with people long enough that performance and self collapse, with no narration to tell you how to feel."),
  r("titicut follies", "high school", "rhyme", "none", 0.76, 0.58,
    "Wiseman inside an institution with no narration, no interviews and no music, the editing alone making the argument."),
  r("titicut follies", "shoah", "convergence", "none", 0.5, 0.32,
    "Documentary that refuses commentary entirely, trusting duration and the unbroken take to be the ethical position."),
  r("high school", "kes", "convergence", "none", 0.54, 0.36,
    "Schooling observed as a system for producing compliance, the camera level with the students and unimpressed by the staff."),
  r("harlan county usa", "the act of killing", "convergence", "none", 0.44, 0.28,
    "The filmmaker's presence acknowledged as a factor in what happens, the camera changing the events it records."),
  r("stories we tell", "f for fake", "descent", "a", 0.64, 0.46,
    "A documentary that stages its own reenactments and then admits it, turning the reliability of the telling into the subject."),
  r("stories we tell", "rashomon", "convergence", "none", 0.56, 0.38,
    "One family's history told by participants who contradict each other, with the film declining to name a true version."),
  r("honeyland", "nanook of the north", "descent", "b", 0.56, 0.4,
    "A subsistence craft filmed across seasons in close observational detail, the outsiders' arrival supplying the conflict."),
  r("cave of forgotten dreams", "lessons of darkness", "rhyme", "none", 0.6, 0.44,
    "Herzog narrating over images of something older than politics, the commentary reaching for the sublime rather than the informative."),
  r("los angeles plays itself", "f for fake", "convergence", "none", 0.58, 0.4,
    "An essay film built entirely from other films, the argument assembled by juxtaposition and a dry, sceptical voice-over."),
  r("los angeles plays itself", "chinatown", "convergence", "none", 0.48, 0.3,
    "Los Angeles read as a city that its own cinema keeps rewriting, water and real estate underneath every version."),
  r("faces places", "the gleaners and i", "rhyme", "none", 0.7, 0.52,
    "Varda on the road with a collaborator, the project's small conceit opening onto portraits of people the film meets."),
  r("the look of silence", "shoah", "convergence", "none", 0.6, 0.42,
    "A survivor's relative sitting opposite perpetrators, the camera holding the silence rather than cutting away from it."),

  /* ---------- Western animation ---------- */
  r("snow white and the seven dwarfs", "pinocchio", "rhyme", "none", 0.66, 0.48,
    "Early Disney feature animation establishing the grammar — full character animation, songs as structure, a genuinely frightening middle act."),
  r("fantasia", "koyaanisqatsi", "convergence", "none", 0.52, 0.34,
    "Image edited to pre-existing music with no narrative, the film asking to be experienced as a visual score."),
  r("fantasia", "yellow submarine", "descent", "a", 0.56, 0.4,
    "Animation freed from story into a sequence of visual movements, each set to a piece of music and stylistically self-contained."),
  r("yellow submarine", "fantastic planet", "convergence", "none", 0.54, 0.36,
    "Late-sixties animation as graphic design and collage, the surreal imagery carrying more weight than the plot it decorates."),
  r("the iron giant", "e t the extra terrestrial", "descent", "b", 0.66, 0.48,
    "A boy hiding an enormous visitor from the authorities, the film's real antagonist a government man who cannot imagine it as anything but a weapon."),
  r("toy story", "pinocchio", "convergence", "none", 0.5, 0.32,
    "An artificial being who wants to be real to the person who owns him, the film making the wish literal and comic."),
  r("wall e", "2001 a space odyssey", "descent", "b", 0.62, 0.46,
    "Forty wordless minutes with a machine, and a ship's automated system that turns antagonist — the homage stated in the design of both."),
  r("wall e", "modern times", "descent", "b", 0.6, 0.44,
    "A silent-comedy body — a small mechanical figure against enormous automated systems — carrying the film's entire first act."),
  r("ratatouille", "8", "convergence", "none", 0.42, 0.26,
    "A film about whether the work is any good, ending on a critic's judgement delivered as an aria."),
  r("spider man into the spider verse", "akira", "convergence", "none", 0.5, 0.32,
    "Animation deliberately refusing photorealism — visible line, print texture, mixed frame rates — as the point rather than a limitation."),
  r("waltz with bashir", "the act of killing", "convergence", "none", 0.6, 0.42,
    "A perpetrator's memory reconstructed on screen, the reenactment exposing what plain testimony had let him avoid."),
  r("flow", "the turin horse", "convergence", "none", 0.46, 0.3,
    "Survival filmed without dialogue and almost without explanation, the weather and the animals carrying the entire narrative."),

  /* ---------- the contemporary run ---------- */
  r("tar", "the master", "convergence", "none", 0.6, 0.42,
    "A charismatic authority filmed in long controlled takes, the film watching them construct a self that the ending dismantles."),
  r("tar", "persona", "convergence", "none", 0.5, 0.32,
    "An artist's identity coming apart, filmed coolly enough that you cannot tell how much is happening and how much is being imagined."),
  r("the worst person in the world", "cleo from 5 to 7", "convergence", "none", 0.52, 0.34,
    "A young woman moving through a city and a set of decisions, the film structured as chapters rather than as a plot."),
  r("the lobster", "the exterminating angel", "convergence", "none", 0.6, 0.42,
    "An absurd social rule stated flatly and obeyed by everyone, the film's comedy generated entirely by nobody questioning it."),
  r("the favourite", "barry lyndon", "convergence", "none", 0.6, 0.42,
    "A court filmed in wide-angle and available light, period manners used to make cruelty look like etiquette."),
  r("poor things", "the favourite", "rhyme", "none", 0.6, 0.44,
    "Fish-eye lenses and enormous rooms, a woman working out how much power she is allowed to take."),
  r("the substance", "videodrome", "convergence", "none", 0.6, 0.42,
    "Body horror as an argument about images, the physical transformation literalising what the industry was already doing to her."),
  r("the substance", "persona", "convergence", "none", 0.48, 0.3,
    "Two versions of one woman who cannot both continue, the film escalating until the split becomes physical."),
  r("anora", "the florida project", "rhyme", "none", 0.62, 0.44,
    "Sean Baker staying with people the industry usually treats as background, the comedy running right up to the moment it stops being funny."),
  r("the florida project", "killer of sheep", "convergence", "none", 0.54, 0.36,
    "Childhood filmed at eye level in a place the adults cannot fix, structured by play rather than by incident."),
  r("tangerine", "good time", "convergence", "none", 0.56, 0.38,
    "One frantic night in a city, shot close and mobile, the protagonist's plan collapsing faster than they can improvise."),
  r("good time", "uncut gems", "rhyme", "none", 0.72, 0.55,
    "Wall-to-wall sound and a protagonist whose every solution creates two problems, the film's anxiety generated by never letting a scene end."),
  r("uncut gems", "mean streets", "descent", "b", 0.58, 0.4,
    "A hustler running a debt he cannot cover, filmed in overlapping shouting with the camera pressed too close to everyone."),
  r("call me by your name", "in the mood for love", "convergence", "none", 0.54, 0.36,
    "A summer of near-touches and withheld statements, the film's ending arriving as a long look rather than an event."),
  r("i am love", "all that heaven allows", "descent", "b", 0.58, 0.42,
    "Melodrama played with full commitment — a wealthy household, a woman's affair beneath her station, and a score doing the arguing."),
  r("nomadland", "the gleaners and i", "convergence", "none", 0.52, 0.34,
    "People living off the edges of an economy, filmed with real subjects playing themselves and no villain named."),
  r("minari", "the tree of life", "convergence", "none", 0.5, 0.32,
    "A family on a patch of American land, the father's ambition and the children's memory of it filmed as different registers."),
  r("the banshees of inisherin", "the lobster", "convergence", "none", 0.56, 0.38,
    "An arbitrary rule announced early and then followed to a self-mutilating conclusion, played deadpan throughout."),
  r("three billboards outside ebbing missouri", "fargo", "convergence", "none", 0.52, 0.34,
    "Small-town crime handled by people out of their depth, the violence arriving in the middle of a comic scene."),
  r("sorry to bother you", "brazil", "convergence", "none", 0.56, 0.38,
    "Corporate absurdity escalating past satire into the openly surreal, the film changing genre once it has your trust."),
  r("us", "get out", "rhyme", "none", 0.66, 0.48,
    "American social horror where the monstrous double is the argument, the reveal reframing the whole film as a political diagram."),
  r("us", "the shining", "convergence", "none", 0.5, 0.32,
    "A family holiday turning into a siege, symmetry and doubling used as the visual system throughout."),
  r("the northman", "the witch", "rhyme", "none", 0.66, 0.48,
    "Eggers reconstructing a period's own belief system in its own idiom, the supernatural presented as simply true within it."),
  r("the northman", "ran", "convergence", "none", 0.5, 0.32,
    "A revenge tragedy staged across enormous landscape, the ritual and the weather given more weight than the psychology."),
  r("first cow", "mccabe mrs miller", "descent", "b", 0.66, 0.48,
    "The frontier as small commerce and mud, a business venture between two outsiders standing in for the whole American project."),
  r("first cow", "killer of sheep", "convergence", "none", 0.46, 0.3,
    "Friendship and work filmed at the pace they actually occur, with the plot's pressure kept almost entirely off screen."),

  /* ---------- the remaining canon entries ---------- */
  r("the maltese falcon", "chinatown", "descent", "a", 0.6, 0.44,
    "The private detective as the genre's fixed point: an office, a client who lies, and an object everyone is chasing."),
  r("raging bull", "the wild bunch", "convergence", "none", 0.48, 0.3,
    "Violence shot in slow motion and sound design as something closer to liturgy than to action."),
  r("casino", "goodfellas", "rhyme", "none", 0.7, 0.52,
    "Narrated criminal enterprise as a business documentary, the voice-over explaining the machinery while it visibly rots."),
  r("the gold rush", "modern times", "rhyme", "none", 0.66, 0.48,
    "The tramp against a hostile system, hunger and machinery turned into set pieces of pure physical invention."),
  r("the gold rush", "greed", "convergence", "none", 0.5, 0.32,
    "Gold as an American derangement, the prospectors' hunger driving both films toward something close to horror."),
  r("the exorcist", "hereditary", "descent", "a", 0.66, 0.48,
    "Possession filmed as a family's medical and domestic ordeal, the supernatural arriving only after everything rational is exhausted."),
  r("christine", "the shining", "convergence", "none", 0.54, 0.36,
    "King's premise twice: an inanimate thing working patiently on a lonely man until he becomes its instrument."),
  r("starship troopers", "robocop", "rhyme", "none", 0.7, 0.52,
    "Verhoeven smuggling the satire inside a competent version of the thing being satirised, with in-film broadcasts doing the commentary."),
  r("licorice pizza", "boogie nights", "convergence", "none", 0.56, 0.38,
    "The San Fernando Valley as its own country, the film structured as episodes and needle-drops rather than as a plot."),
  r("raising arizona", "o brother where art thou", "rhyme", "none", 0.62, 0.44,
    "The Coens in tall-tale register — heightened dialect, a chase structure, and a tone that stays affectionate about its fools."),
  r("rumble fish", "the outsiders", "rhyme", "none", 0.7, 0.52,
    "Coppola filming the same author's teenagers twice in one year — one in colour and sunset romanticism, the other in expressionist monochrome."),
  r("rumble fish", "eraserhead", "convergence", "none", 0.5, 0.32,
    "Monochrome, industrial sound and time-lapse skies used to render a small town as a permanently anxious dream."),
  r("even dwarfs started small", "the enigma of kaspar hauser", "convergence", "none", 0.56, 0.38,
    "Herzog on people society has placed outside it, filmed without the framing of pity and without apologising for looking."),
  r("when father was away on business", "the tin drum", "convergence", "none", 0.52, 0.34,
    "A political history filtered through a child who understands the surfaces and not the danger underneath them."),
  r("mad max", "mad max 2", "descent", "a", 0.76, 0.6,
    "The first film's revenge picture rebuilt as a wasteland western, the world implied entirely by vehicles and costume."),
  r("the piano", "portrait of a lady on fire", "convergence", "none", 0.58, 0.4,
    "A woman's expression routed through an instrument or an artwork because speech is not available to her."),
  r("chopper", "goodfellas", "convergence", "none", 0.46, 0.3,
    "A criminal narrating his own legend directly to camera, the film letting the charm run well past the point of comfort."),

  /* ---------- Hitchcock, Bergman, Fellini, the French remainder ---------- */
  r("strangers on a train", "rope", "rhyme", "none", 0.62, 0.44,
    "Two men bound by a murder and a shared performance of normality, the tension generated by an object that must not be found."),
  r("dial m for murder", "rear window", "convergence", "none", 0.56, 0.38,
    "A crime worked out almost entirely within one apartment, the geography of the room doing the work of suspense."),
  r("to catch a thief", "north by northwest", "rhyme", "none", 0.58, 0.4,
    "Glamour as the actual subject — resorts, clothes and banter — with the thriller plot a pretext for the tour."),
  r("the silence", "persona", "rhyme", "none", 0.66, 0.48,
    "Two women in a foreign hotel unable to speak the language or to each other, the film almost wordless and physically close."),
  r("shame", "come and see", "convergence", "none", 0.54, 0.36,
    "A war arriving at people with no politics, filmed as the slow removal of every decent option they had."),
  r("i vitelloni", "mean streets", "descent", "a", 0.62, 0.46,
    "Young men loafing in a town too small for them, the film built from nights out and postponed decisions."),
  r("juliet of the spirits", "8", "rhyme", "none", 0.62, 0.44,
    "The interior life staged as pageant and colour, memory and fantasy given the same weight as the domestic scenes."),
  r("satyricon", "the holy mountain", "convergence", "none", 0.56, 0.38,
    "Antiquity as hallucination — episodic, grotesque, deliberately incoherent — with the tableau replacing the scene."),
  r("stolen kisses", "the 400 blows", "rhyme", "none", 0.68, 0.5,
    "Truffaut following the same character into adulthood, the comedy resting on how little he has learned."),
  r("the wild child", "the enigma of kaspar hauser", "convergence", "none", 0.68, 0.5,
    "A person raised outside society taken in and educated, the film equally interested in what the teaching costs."),
  r("masculin feminin", "cleo from 5 to 7", "convergence", "none", 0.5, 0.32,
    "Paris youth interviewed almost documentary-style, pop culture and politics cut together as one texture."),
  r("claire s knee", "call me by your name", "descent", "a", 0.56, 0.4,
    "A summer of talk and deferred desire, the film's real events entirely conversational and the setting doing the seduction."),
  r("lancelot of the lake", "the trial of joan of arc", "rhyme", "none", 0.64, 0.46,
    "Bresson filming legend as procedure — armour, hooves, hands — with the myth deliberately drained from it."),

  /* ==================================================================
     SEVENTH PASS. The long tail: Ophuls and the moving camera, Naruse
     and Mizoguchi's working women, the Taiwanese New Wave, Ray's Apu
     trilogy, Sirk's melodrama, Kieslowski's Dekalog features, the
     Iranian and African runs, Reichardt, and the recent arthouse.

     Written in the Codex checkout, which is now the active build.
     ================================================================== */

  /* ---------- Ophuls, and the camera that will not sit down ---------- */
  r("the earrings of madame de", "la ronde", "rhyme", "none", 0.72, 0.54,
    "An object or an encounter passed from hand to hand in a circle, the camera gliding through walls and staircases to follow it."),
  r("the earrings of madame de", "barry lyndon", "convergence", "none", 0.54, 0.36,
    "A society filmed as etiquette and surface, where a small breach of form ends in a duel nobody actually wants."),
  r("letter from an unknown woman", "in the mood for love", "convergence", "none", 0.58, 0.4,
    "A love conducted almost entirely in one person's memory, narrated from after it is far too late to act on."),
  r("la ronde", "wild tales", "convergence", "none", 0.46, 0.3,
    "A film built as linked episodes rather than a plot, each handing off to the next through a single shared figure."),

  /* ---------- Naruse, Mizoguchi, and women counting money ---------- */
  r("sound of the mountain", "tokyo story", "convergence", "none", 0.6, 0.42,
    "An older man watching his family fail its own women, filmed in still rooms that decline to dramatise it."),
  r("repast", "when a woman ascends the stairs", "rhyme", "none", 0.68, 0.5,
    "A marriage or a livelihood weighed in household arithmetic, Naruse letting the accounting carry what the dialogue will not say."),
  r("late chrysanthemums", "the life of oharu", "convergence", "none", 0.6, 0.42,
    "Women whose earning years have passed, filmed without romance about what the culture has already extracted from them."),
  r("osaka elegy", "sisters of the gion", "rhyme", "none", 0.72, 0.54,
    "Mizoguchi's paired 1936 films: a woman monetised by her own family, shot in long unbroken takes that refuse to cut away."),
  r("the story of the last chrysanthemum", "the red shoes", "convergence", "none", 0.5, 0.32,
    "An artist's rise paid for entirely by a woman whose own life is spent as the fuel, staged in long backstage takes."),
  r("sisters of the gion", "street of shame", "descent", "a", 0.62, 0.44,
    "Mizoguchi returning across twenty years to the same subject, the economics of the pleasure district stated more plainly each time."),

  /* ---------- the Taiwanese New Wave ---------- */
  r("a brighter summer day", "yi yi", "rhyme", "none", 0.7, 0.52,
    "Edward Yang building a whole society out of one family's rooms, the film long enough that history stops being background."),
  r("a brighter summer day", "rebel without a cause", "descent", "b", 0.58, 0.42,
    "Teenage gangs and a borrowed American idea of rebellion, transplanted somewhere the politics make it lethal rather than romantic."),
  r("taipei story", "the terrorizers", "rhyme", "none", 0.66, 0.48,
    "A city filmed as glass, vacancy and telephone calls, with characters framed through windows they cannot open."),
  r("that day on the beach", "l avventura", "convergence", "none", 0.56, 0.38,
    "A disappearance that organises the film and is never resolved, the search giving way to the marriage it exposes."),
  r("dust in the wind", "a city of sadness", "rhyme", "none", 0.66, 0.48,
    "Hou filming Taiwanese history from its edges — a village, a family, a shop — with the political events kept off screen."),
  r("a city of sadness", "the tin drum", "convergence", "none", 0.5, 0.32,
    "National catastrophe told through one family who cannot see the whole of it, the film refusing an omniscient vantage."),
  r("flowers of shanghai", "in the mood for love", "convergence", "none", 0.6, 0.42,
    "Interiors lit by lamplight and shot in long takes, desire conducted entirely through etiquette and what nobody says."),
  r("vive l amour", "the hole", "rhyme", "none", 0.66, 0.48,
    "Tsai's near-silent apartments, strangers sharing a space without acknowledging it, the plumbing louder than the dialogue."),
  r("rebels of the neon god", "taipei story", "convergence", "none", 0.56, 0.38,
    "Young men adrift in a Taipei of arcades and scooters, the film observing rather than explaining their drift."),

  /* ---------- Satyajit Ray, and the Bengali line ---------- */
  r("pather panchali", "aparajito", "descent", "a", 0.82, 0.65,
    "The same boy followed out of the village and into the city, the trilogy's method being that time simply passes."),
  r("aparajito", "apur sansar", "descent", "a", 0.82, 0.65,
    "Apu grown, married and bereaved, Ray letting a whole life accumulate across three films rather than one arc."),
  r("charulata", "in the mood for love", "convergence", "none", 0.58, 0.4,
    "A neglected wife and a houseguest circling something neither will name, the film built from glances across a domestic interior."),
  r("devi", "the virgin spring", "convergence", "none", 0.5, 0.32,
    "Faith turned monstrous inside a household, a young woman destroyed by what the men around her decide she is."),
  r("jalsaghar", "the story of the last chrysanthemum", "convergence", "none", 0.54, 0.36,
    "A patron presiding over his own obsolescence, the film staying inside the decaying house for one last performance."),
  r("subarnarekha", "meghe dhaka tara", "rhyme", "none", 0.7, 0.52,
    "Ghatak returning to Partition as a wound that keeps reopening, melodrama pitched high because the history warrants it."),
  r("apur sansar", "tokyo story", "convergence", "none", 0.48, 0.3,
    "Domestic life filmed as small rooms and passing trains, grief arriving between scenes rather than in them."),

  /* ---------- Sirk, and the melodrama that knows ---------- */
  r("written on the wind", "all that heaven allows", "rhyme", "none", 0.72, 0.54,
    "Sirk's saturated Technicolor and mirrored interiors, the décor stating the class trap the dialogue is too polite to name."),
  r("imitation of life", "written on the wind", "rhyme", "none", 0.68, 0.5,
    "A funeral of a finale and a woman punished by the film's own society, staged so the excess reads as indictment."),
  r("magnificent obsession", "all that heaven allows", "rhyme", "none", 0.66, 0.48,
    "The same pairing and the same director, remaking the melodrama's machinery with the irony pitched a little more visibly."),
  r("imitation of life", "moonlight", "convergence", "none", 0.46, 0.3,
    "Identity policed by everyone around a person until performing it becomes the only survivable option."),
  r("leave her to heaven", "vertigo", "convergence", "none", 0.56, 0.38,
    "Technicolor noir where obsession is filmed in glorious daylight, the beauty of the frame doing nothing to soften it."),
  r("now voyager", "letter from an unknown woman", "convergence", "none", 0.5, 0.32,
    "A woman's whole interior life given the weight of an epic, with the renunciation at the end played as victory."),
  r("bigger than life", "blue velvet", "descent", "a", 0.58, 0.4,
    "The American home in CinemaScope colour with a father coming apart inside it, the domestic set lit like a nightmare."),
  r("meet me in st louis", "amarcord", "convergence", "none", 0.46, 0.3,
    "A year in a town remembered as seasons and set pieces, nostalgia acknowledged as a construction rather than hidden."),

  /* ---------- Kieslowski, Wajda, and Polish cinema ---------- */
  r("a short film about killing", "a short film about love", "rhyme", "none", 0.72, 0.55,
    "Two Dekalog hours expanded to features, filmed through filters that make Warsaw look jaundiced and unforgiving."),
  r("a short film about killing", "the ascent", "convergence", "none", 0.56, 0.38,
    "A killing and an execution shown at equal, unbearable length, the film declining to let the state off the hook."),
  r("a short film about love", "rear window", "descent", "b", 0.66, 0.48,
    "Falling for someone by watching them through a window, the film making the voyeur's loneliness the actual subject."),
  r("a generation", "ashes and diamonds", "descent", "a", 0.68, 0.5,
    "Wajda's war trilogy tightening from youthful resistance to the morning after, filmed in deepening shadow."),
  r("kanal", "come and see", "convergence", "none", 0.54, 0.36,
    "An escape route that becomes a tomb, the film keeping its characters in the dark for so long that hope becomes cruelty."),
  r("mother joan of the angels", "the devils", "convergence", "none", 0.64, 0.46,
    "Convent possession filmed in stark white and black, the exorcism reading as an institutional event rather than a spiritual one."),
  r("the saragossa manuscript", "the hour glass sanatorium", "rhyme", "none", 0.7, 0.52,
    "Has building a story that keeps opening into another story, the nesting itself the point rather than any destination."),
  r("the saragossa manuscript", "last year at marienbad", "convergence", "none", 0.5, 0.32,
    "Narrative deliberately looped and unreliable, the film refusing to confirm which layer is the real one."),
  r("closely watched trains", "the fireman s ball", "convergence", "none", 0.62, 0.44,
    "Czech New Wave comedy where the occupation or the Party is handled by simply filming small people bungling a small event."),
  r("marketa lazarova", "andrei rublev", "convergence", "none", 0.64, 0.46,
    "The medieval filmed as mud, weather and belief, with the narrative broken into chapters and no modern vantage offered."),

  /* ---------- Kelly Reichardt, and American slowness ---------- */
  r("old joy", "wendy and lucy", "rhyme", "none", 0.72, 0.54,
    "Reichardt filming Oregon at walking pace, the drama being an economic fact rather than an event."),
  r("wendy and lucy", "bicycle thieves", "descent", "b", 0.66, 0.48,
    "One small loss with no financial cushion beneath it, the film following the errand until the errand becomes the tragedy."),
  r("meek s cutoff", "first cow", "rhyme", "none", 0.7, 0.52,
    "The Oregon trail in a boxed academy frame, the western's scale replaced by chores, thirst and bad decisions."),
  r("meek s cutoff", "the wages of fear", "convergence", "none", 0.5, 0.32,
    "A journey whose entire tension is whether the guide is competent, filmed as process with the destination withheld."),
  r("certain women", "wendy and lucy", "rhyme", "none", 0.64, 0.46,
    "Separate lives in the same cold state, each story stopping before it resolves because that is what the film is arguing."),
  r("the rider", "first cow", "convergence", "none", 0.52, 0.34,
    "Non-professionals playing versions of themselves in a working western landscape, the film's realism its whole argument."),

  /* ---------- Iranian cinema's second row ---------- */
  r("where is the friend s home", "children of heaven", "descent", "a", 0.66, 0.48,
    "A child's errand treated with the gravity of a moral quest, the adults uniformly unable to grasp why it matters."),
  r("where is the friend s home", "bicycle thieves", "convergence", "none", 0.56, 0.38,
    "A search filmed at a child's height through real streets, with non-professionals and no score to soften it."),
  r("a moment of innocence", "close up", "rhyme", "none", 0.7, 0.52,
    "The filmmaker restaging a real incident with the actual participants, the reenactment revising what the event meant."),
  r("the apple", "the wild child", "convergence", "none", 0.58, 0.4,
    "Children raised in confinement and brought into the world, filmed with the family playing themselves."),
  r("the cow", "au hasard balthazar", "convergence", "none", 0.54, 0.36,
    "A man's identity dissolving into his animal, the village watching without any idea what to do about it."),
  r("the runner", "the 400 blows", "convergence", "none", 0.56, 0.38,
    "A boy running through a port city with nothing but momentum, the film ending on him mid-motion."),
  r("about elly", "l avventura", "descent", "b", 0.68, 0.5,
    "A disappearance on a coastal holiday that turns the group against itself, the missing person replaced by everyone's evasions."),
  r("no bears", "this is not a film", "rhyme", "none", 0.7, 0.52,
    "Panahi filming under a ban and making the restriction the form, with his own position inside the frame as the subject."),

  /* ---------- African cinema ---------- */
  r("mandabi", "xala", "rhyme", "none", 0.72, 0.54,
    "Sembène turning post-independence bureaucracy into farce, a man defeated by paperwork and his own status."),
  r("mandabi", "bicycle thieves", "convergence", "none", 0.52, 0.34,
    "A money order or a bicycle as the object the entire film pursues, poverty rendered as an administrative maze."),
  r("moolaade", "xala", "descent", "a", 0.62, 0.44,
    "Sembène's late mode: a village argument staged in the open, the camera static while the community talks itself toward change."),
  r("hyenes", "touki bouki", "rhyme", "none", 0.6, 0.42,
    "Mambéty's Senegal filmed with surreal interruptions and a satirical eye on what money does to a community."),
  r("sambizanga", "the battle of algiers", "convergence", "none", 0.6, 0.42,
    "Anti-colonial struggle told through the people waiting outside the prison rather than the fighters inside it."),

  /* ---------- Latin America's second row ---------- */
  r("los olvidados", "pixote", "descent", "a", 0.68, 0.5,
    "Street children filmed without redemption, the documentary surface making the cruelty land as reportage."),
  r("los olvidados", "city of god", "descent", "a", 0.6, 0.44,
    "Poverty filmed from inside a children's hierarchy, with violence presented as the ordinary economics of the place."),
  r("memories of underdevelopment", "la dolce vita", "convergence", "none", 0.54, 0.36,
    "A bourgeois man drifting through a city in political transformation, unable to commit to anything he observes."),
  r("black god white devil", "o dragao da maldade contra o santo guerreiro", "descent", "a", 0.72, 0.54,
    "Rocha's sertão as myth and revolution, the landscape scorched and the score operatic over it."),
  r("la cienaga", "the headless woman", "rhyme", "none", 0.72, 0.54,
    "Martel filming an Argentine bourgeoisie through overlapping sound and bodies half out of frame, the danger always adjacent."),
  r("zama", "aguirre the wrath of god", "convergence", "none", 0.66, 0.48,
    "A colonial functionary waiting years for a letter that never comes, the empire revealed as indifferent administration."),
  r("japon", "silent light", "rhyme", "none", 0.66, 0.48,
    "Reygadas shooting Mexican landscape in long takes with non-professionals, the spiritual crisis carried by duration."),
  r("silent light", "ordet", "descent", "b", 0.7, 0.52,
    "A miracle staged plainly in a devout rural community, the film committing to it without irony."),
  r("post tenebras lux", "the tree of life", "convergence", "none", 0.5, 0.32,
    "Memory and family rendered as disconnected luminous fragments, the chronology abandoned entirely."),
  r("neighbouring sounds", "bacurau", "rhyme", "none", 0.62, 0.44,
    "Mendonça Filho building dread out of a Brazilian neighbourhood's class arrangement, the threat ambient before it is literal."),
  r("central station", "bicycle thieves", "convergence", "none", 0.56, 0.38,
    "An adult and a child crossing a country together, the journey slowly obliging the adult to become responsible."),
  r("tony manero", "taxi driver", "convergence", "none", 0.58, 0.4,
    "A man modelling himself on a screen idol while committing casual violence, the dictatorship kept at the edge of frame."),
  r("embrace of the serpent", "aguirre the wrath of god", "convergence", "none", 0.62, 0.44,
    "A river journey with an indigenous guide and Europeans who cannot read the place, shot in monochrome."),

  /* ---------- Japanese remainder ---------- */
  r("the human condition i no greater love", "come and see", "convergence", "none", 0.56, 0.38,
    "A decent man ground down by an army over an enormous running time, the film refusing to let him stay decent."),
  r("the burmese harp", "fires on the plain", "rhyme", "none", 0.66, 0.48,
    "Ichikawa's two war films: one man staying behind to bury the dead, another eating what he can find."),
  r("the ballad of narayama", "the naked island", "convergence", "none", 0.56, 0.38,
    "Subsistence life filmed as ritual and labour, the community's hard arithmetic accepted without editorial."),
  r("kuroneko", "onibaba", "rhyme", "none", 0.74, 0.56,
    "Shindō's paired folk horrors: women in tall grass or bamboo, the supernatural growing directly out of wartime hunger."),
  r("the naked island", "the turin horse", "convergence", "none", 0.58, 0.4,
    "A near-wordless film of repeated labour, the same trip made again and again until repetition becomes the drama."),
  r("hana bi", "sonatine", "rhyme", "none", 0.7, 0.52,
    "Kitano cutting between deadpan stillness and sudden violence, with his own painting standing in for what he will not say."),
  r("youth of the beast", "branded to kill", "rhyme", "none", 0.68, 0.5,
    "Suzuki treating a studio yakuza assignment as a excuse for pop composition and colour."),
  r("gate of flesh", "street of shame", "convergence", "none", 0.56, 0.38,
    "Post-war women surviving in the ruins by selling what they can, filmed in deliberately artificial colour."),
  r("boy", "death by hanging", "rhyme", "none", 0.64, 0.46,
    "Ōshima taking a real news item and turning it into a formal experiment about Japanese complicity."),
  r("vengeance is mine", "the act of killing", "convergence", "none", 0.52, 0.34,
    "A killer filmed without psychology or explanation, the film declining to make him legible or to condemn him for us."),
  r("a page of madness", "the cabinet of dr caligari", "convergence", "none", 0.6, 0.42,
    "Silent film about an asylum built from superimposition and distortion, with no intertitles to steady the viewer."),
  r("belladonna of sadness", "fantastic planet", "convergence", "none", 0.58, 0.4,
    "Animation as moving illustration — watercolour panning across a still image — used for adult allegory."),
  r("pulse", "ring", "rhyme", "none", 0.68, 0.5,
    "Kurosawa's flat grey dread arriving through a screen, the ghost a transmission problem rather than a person."),
  r("tokyo sonata", "still walking", "convergence", "none", 0.6, 0.42,
    "A family filmed at the dinner table while the father's unemployment or the son's absence sits unspoken between them."),
  r("still walking", "tokyo story", "descent", "b", 0.7, 0.52,
    "Koreeda taking Ozu's structure — a family gathering, a day, a departure — and letting the resentments surface further."),
  r("maborosi", "nobody knows", "rhyme", "none", 0.64, 0.46,
    "Koreeda holding a static camera on people the story has abandoned, grief handled as routine rather than as scene."),
  r("nobody knows", "the florida project", "convergence", "none", 0.6, 0.42,
    "Children left to run an apartment while an adult is absent, filmed at their height and largely as play."),
  r("shoplifters", "nobody knows", "rhyme", "none", 0.68, 0.5,
    "An improvised family that works better than the legal one, until the state arrives to say otherwise."),
  r("drive my car", "the mother and the whore", "convergence", "none", 0.5, 0.32,
    "Very long conversations in cars and rooms, the film trusting talk to carry three hours of grief."),
  r("perfect days", "tokyo story", "convergence", "none", 0.56, 0.38,
    "Ordinary Tokyo routine filmed with attention rather than pity, the drama arriving only in what the routine excludes."),

  /* ---------- Korea and China's second row ---------- */
  r("sympathy for mr vengeance", "sympathy for lady vengeance", "descent", "a", 0.74, 0.56,
    "Park's trilogy bracket: revenge pursued methodically by people the film keeps refusing to let us fully side with."),
  r("the host", "jaws", "descent", "b", 0.62, 0.46,
    "A creature in the water and a family the authorities will not help, the monster shown early and often on purpose."),
  r("the housemaid", "parasite", "descent", "a", 0.68, 0.5,
    "A domestic worker installed inside a middle-class house who becomes the thing that dismantles it."),
  r("peppermint candy", "memories of murder", "convergence", "none", 0.6, 0.42,
    "A Korean life told backwards through the state's violence, the personal and the political refusing to separate."),
  r("poetry", "amour", "convergence", "none", 0.56, 0.38,
    "An older person facing decline while shouldering a moral obligation nobody else will take, filmed patiently."),
  r("the aimless bullet", "bicycle thieves", "convergence", "none", 0.56, 0.38,
    "Post-war poverty as an unrelieved accumulation, the film ending with its characters worse off than it found them."),
  r("right now wrong then", "the day he arrives", "rhyme", "none", 0.72, 0.54,
    "Hong telling the same encounter twice with tiny variations, the repetition itself the entire formal proposition."),
  r("to live", "raise the red lantern", "rhyme", "none", 0.66, 0.48,
    "Zhang filming a Chinese century through one household, the political turns arriving as things done to a family."),
  r("raise the red lantern", "the earrings of madame de", "convergence", "none", 0.5, 0.32,
    "A woman's status inside a great house tracked through objects and ritual, the architecture enforcing the hierarchy."),
  r("ju dou", "written on the wind", "convergence", "none", 0.5, 0.32,
    "Melodrama in engineered colour, a family business and a marriage rotting in the same saturated frames."),
  r("yellow earth", "the color of pomegranates", "convergence", "none", 0.5, 0.32,
    "Landscape and folk ritual composed as static painted frames, narrative subordinated to the image."),
  r("farewell my concubine", "to live", "convergence", "none", 0.6, 0.42,
    "A Chinese century staged through one pair of lives, the private betrayals timed to the political turns."),
  r("still life", "the world", "rhyme", "none", 0.68, 0.5,
    "Jia filming demolition and displacement in long takes, the modernisation project visible as rubble behind everyone."),
  r("a touch of sin", "wild tales", "convergence", "none", 0.58, 0.4,
    "Separate stories of ordinary people reaching sudden violence, the anger presented as a national symptom."),
  r("an elephant sitting still", "satantango", "convergence", "none", 0.64, 0.46,
    "A day of despair filmed in very long following takes, the running time itself the argument about what living there is like."),
  r("in the heat of the sun", "amarcord", "convergence", "none", 0.52, 0.34,
    "A boyhood in a politically charged decade remembered unreliably, the narrator admitting he is embellishing."),
  r("spring in a small town", "brief encounter", "convergence", "none", 0.62, 0.44,
    "A visitor reopening a marriage's dormant question, resolved by renunciation and staged in a handful of rooms."),

  /* ---------- Europe's remainder ---------- */
  r("red desert", "eclipse", "rhyme", "none", 0.72, 0.54,
    "Antonioni painting the industrial landscape literally, his people small and unmoored in a world designed without them."),
  r("eclipse", "la notte", "rhyme", "none", 0.7, 0.52,
    "A relationship dissolving across a city, ending on a sequence of places the characters have already left."),
  r("bob le flambeur", "le cercle rouge", "rhyme", "none", 0.72, 0.54,
    "Melville's criminals as men keeping a code nobody else observes, the heist rendered as patient procedure."),
  r("le cercle rouge", "rififi", "descent", "b", 0.7, 0.52,
    "A near-wordless robbery sequence held for its full length, professional competence filmed as its own reward."),
  r("the mother and the whore", "scenes from a marriage", "convergence", "none", 0.6, 0.42,
    "Hours of a relationship talking itself apart in a small number of rooms, the camera declining to intervene."),
  r("scenes from a marriage", "amour", "convergence", "none", 0.58, 0.4,
    "A marriage examined in long chapters inside one apartment, the film interested in the administration of love."),
  r("l amour fou", "celine and julie go boating", "rhyme", "none", 0.66, 0.48,
    "Rivette letting a rehearsal or a game run far past its narrative use, until the duration produces the reality."),
  r("celine and julie go boating", "mulholland drive", "convergence", "none", 0.56, 0.38,
    "Two women entering a house and a story that replays itself, the film treating fiction as a place you can visit."),
  r("my night at maud s", "the green ray", "rhyme", "none", 0.68, 0.5,
    "Rohmer filming a moral decision as conversation, the drama entirely in whether someone will act on what they have argued."),
  r("summer with monika", "the 400 blows", "convergence", "none", 0.58, 0.4,
    "A young person's escape filmed as freedom and then as consequence, ending on a look held directly at the audience."),
  r("smiles of a summer night", "the earrings of madame de", "convergence", "none", 0.5, 0.32,
    "A country weekend of couples rearranging themselves, the comedy precise about who holds the power."),
  r("the virgin spring", "the ballad of narayama", "convergence", "none", 0.5, 0.32,
    "A rural community whose moral order is stated as ritual, the violence carried out as something owed rather than chosen."),
  r("in a year of 13 moons", "the bitter tears of petra von kant", "rhyme", "none", 0.62, 0.44,
    "Fassbinder staging a life in decorated rooms as a series of arranged tableaux, the cruelty formal and unhurried."),
  r("stroszek", "paris texas", "convergence", "none", 0.62, 0.44,
    "A European loose in an America of parking lots and diners, the landscape filmed as absurd and enormous."),
  r("heart of glass", "the turin horse", "convergence", "none", 0.54, 0.36,
    "A village awaiting an end it cannot avert, filmed in a hypnotic register that refuses ordinary performance."),
  r("the goalkeeper s fear of the penalty", "le samourai", "convergence", "none", 0.5, 0.32,
    "A man committing a crime and then simply continuing, the film observing his routine rather than his motive."),
  r("landscape in the mist", "ulysses gaze", "convergence", "none", 0.6, 0.42,
    "Angelopoulos sending travellers across borders in long grey takes, the journey outlasting whatever prompted it."),
  r("distant voices still lives", "amarcord", "convergence", "none", 0.54, 0.36,
    "A working-class family remembered as songs and set pieces, chronology abandoned for the shape of memory."),
  r("naked", "taxi driver", "convergence", "none", 0.58, 0.4,
    "A furious articulate man walking a city at night, the film neither endorsing nor quite disowning him."),
  r("get carter", "the long good friday", "rhyme", "none", 0.68, 0.5,
    "British crime with the glamour removed, a hard man discovering the organisation has already moved past him."),
  r("straw dogs", "deliverance", "convergence", "none", 0.62, 0.44,
    "An outsider's competence tested by rural violence, both films uncomfortable about what the audience is enjoying."),
  r("cul de sac", "knife in the water", "rhyme", "none", 0.68, 0.5,
    "Polanski's three-hander on isolated ground, the power between them reversing as the location does the confining."),
  r("knife in the water", "the exterminating angel", "convergence", "none", 0.46, 0.3,
    "A confined social situation in which the rules of politeness do all the damage."),
  r("existenz", "videodrome", "rhyme", "none", 0.7, 0.52,
    "Cronenberg's organic technology plugged into a body, with no reliable exit from the layers of simulation."),
  r("the testament of dr mabuse", "dr mabuse the gambler", "descent", "a", 0.74, 0.56,
    "Lang's criminal mastermind returning as pure influence, issuing instructions from a cell as the state fails to contain him."),
  r("ivan the terrible part i", "the color of pomegranates", "convergence", "none", 0.52, 0.34,
    "History staged as frontal tableau and gesture, actors composed like figures in an icon."),
  r("vampyr", "eraserhead", "convergence", "none", 0.6, 0.42,
    "Dread produced almost entirely by texture and sound, the film's logic dreamlike and never explained."),
  r("the crowd", "modern times", "convergence", "none", 0.6, 0.42,
    "One worker lost inside the machinery of a city, the camera pulling back to find him identical to everyone else."),
  r("the parallax view", "the conversation", "rhyme", "none", 0.7, 0.52,
    "Seventies conspiracy filmed as composition — figures dwarfed by architecture — with the investigator absorbed by what he investigates."),
  r("five easy pieces", "the last picture show", "convergence", "none", 0.6, 0.42,
    "A man who cannot stay anywhere, filmed in an America of oil fields and diners that offers him nothing to stay for."),
  r("one flew over the cuckoo s nest", "titicut follies", "convergence", "none", 0.58, 0.4,
    "The institution as the antagonist, both films arriving at the same conclusion about who the ward actually serves."),
  r("the last wave", "picnic at hanging rock", "rhyme", "none", 0.66, 0.48,
    "Weir filming Australia as a place with older logic underneath it, the rational protagonist steadily overruled."),
  r("walkabout", "picnic at hanging rock", "convergence", "none", 0.62, 0.44,
    "European children in an Australian landscape that will not accommodate them, the editing refusing to explain."),
  r("animal kingdom", "goodfellas", "convergence", "none", 0.5, 0.32,
    "A family criminal enterprise observed by its youngest member, the menace domestic and conversational."),
  r("toni erdmann", "the worst person in the world", "convergence", "none", 0.5, 0.32,
    "A long comedy about a life not going to plan, with one extended set piece that reframes everything preceding it."),
  r("son of saul", "come and see", "descent", "b", 0.68, 0.5,
    "The camp filmed in shallow focus tight on one face, the atrocity kept insistently at the edge of the frame."),
  r("happy as lazzaro", "the tree of life", "convergence", "none", 0.46, 0.3,
    "A rural idyll interrupted by a rupture the film refuses to explain, faith treated as literally as the landscape."),
  r("la chimera", "happy as lazzaro", "rhyme", "none", 0.66, 0.48,
    "Rohrwacher shooting on grainy film stock where the past is materially present, and a man half-belonging to it."),
  r("le quattro volte", "the turin horse", "convergence", "none", 0.6, 0.42,
    "A near-wordless film that hands its attention from a person to an animal to a tree, refusing human centrality."),
  r("gomorrah", "city of god", "convergence", "none", 0.62, 0.44,
    "Organised crime filmed as an economy rather than a story, several strands with no protagonist to reassure you."),
  r("il divo", "the conformist", "convergence", "none", 0.54, 0.36,
    "Italian political power staged as stylised procession, the man at the centre unreadable by design."),
  r("loveless", "scenes from a marriage", "convergence", "none", 0.58, 0.4,
    "A marriage ending while a child goes missing, the film using the search to indict both parents and the state."),
  r("leviathan", "the parallax view", "convergence", "none", 0.5, 0.32,
    "One person against an apparatus that cannot be fought, filmed in wide landscape that dwarfs the legal fight."),
  r("wings", "the ascent", "convergence", "none", 0.58, 0.4,
    "Shepitko filming a person hollowed by war, the heroism the state assigned them refusing to fit."),
  r("ballad of a soldier", "the cranes are flying", "rhyme", "none", 0.68, 0.5,
    "Soviet Thaw cinema handing the war to ordinary young people, the camera mobile and lyrical rather than official."),
  r("i am cuba", "the cranes are flying", "rhyme", "none", 0.62, 0.44,
    "Kalatozov's impossible travelling shots, the camera moving through crowds and buildings as an argument in itself."),
  r("shadows of forgotten ancestors", "the color of pomegranates", "descent", "a", 0.72, 0.54,
    "Parajanov abandoning conventional coverage for folk ritual, saturated colour and frontal composition."),
  r("the round up", "the ascent", "convergence", "none", 0.6, 0.42,
    "Interrogation filmed as bureaucratic process on an empty plain, the power entirely in who is permitted to speak."),
  r("nights of cabiria", "la strada", "rhyme", "none", 0.7, 0.52,
    "Fellini following a woman through repeated betrayals, ending on a look to camera that refuses despair."),
  r("y tu mama tambien", "jules and jim", "convergence", "none", 0.56, 0.38,
    "Two friends and one woman on a journey, a narrator quietly telling you the futures none of them can see."),
  r("dogtooth", "the lobster", "rhyme", "none", 0.74, 0.56,
    "Lanthimos stating an absurd domestic rule and filming its consequences deadpan, the violence arriving without music."),
  r("challengers", "jules and jim", "convergence", "none", 0.5, 0.32,
    "A triangle sustained over years, the film cutting across time so every match replays an older negotiation."),
  r("the brutalist", "there will be blood", "convergence", "none", 0.6, 0.42,
    "An immigrant's ambition and a patron's money curdling across decades, shot in a format that insists on its own scale."),
  r("sound of metal", "persona", "convergence", "none", 0.5, 0.32,
    "Sensory loss rendered through the film's own sound design, forcing the audience into a silence the character cannot leave."),
  r("close", "the 400 blows", "convergence", "none", 0.54, 0.36,
    "A boy's world narrowing after an irreversible event, filmed close and refusing to supply consolation."),
  r("columbus", "certain women", "convergence", "none", 0.56, 0.38,
    "Two people talking in a town's architecture, the compositions doing the emotional work the dialogue withholds."),
  r("the souvenir", "distant voices still lives", "convergence", "none", 0.5, 0.32,
    "A memory film about class and a damaging relationship, filmed in ellipses that assume you already know the ending."),
  r("saint omer", "the passion of joan of arc", "convergence", "none", 0.6, 0.42,
    "A trial filmed almost entirely as faces listening, the verdict less important than what testimony does to a room."),
  r("fire of love", "grizzly man", "rhyme", "none", 0.68, 0.5,
    "A documentary assembled from footage its subjects shot before the thing they loved killed them."),
  r("gimme shelter", "dont look back", "rhyme", "none", 0.68, 0.5,
    "Direct cinema on tour with a band, the camera present at the moment the decade's mood turns."),
  r("all that breathes", "honeyland", "convergence", "none", 0.6, 0.42,
    "Observational documentary staying with people tending animals at the edge of an ecological collapse."),
  r("watership down", "grave of the fireflies", "convergence", "none", 0.5, 0.32,
    "Animation used for genuine mortal stakes, with a children's surface that the film has no intention of honouring."),
  r("the incredibles", "the iron giant", "rhyme", "none", 0.6, 0.42,
    "Brad Bird staging mid-century design and sincere heroism, the family or the boy tested by a bureaucrat's suspicion."),
  r("mother india", "bicycle thieves", "convergence", "none", 0.5, 0.32,
    "Rural poverty as an epic moral test, the mother's endurance standing in for a nation's."),
  r("awaara", "los olvidados", "convergence", "none", 0.48, 0.3,
    "A street childhood used to argue about whether character is inherited or produced by poverty."),
  r("pyaasa", "sunset boulevard", "convergence", "none", 0.54, 0.36,
    "An artist destroyed by the industry that will only value him once he is presumed dead."),
  r("bombay", "do the right thing", "convergence", "none", 0.5, 0.32,
    "A neighbourhood's communal tension building through domestic scenes until it detonates into riot."),
  r("rrr", "sholay", "descent", "b", 0.6, 0.44,
    "Indian action at maximum scale — two heroes, an interval-sized reversal, and set pieces staged as spectacle."),
  r("gangs of wasseypur part 1", "the godfather", "convergence", "none", 0.56, 0.38,
    "A crime dynasty across generations, the family business and the political economy filmed as the same thing."),
  r("elippathayam", "the exterminating angel", "convergence", "none", 0.54, 0.36,
    "A man trapped in a decaying house by his own inertia, the rat trap of the title stated and then literalised."),
  r("earth", "battleship potemkin", "convergence", "none", 0.56, 0.38,
    "Soviet montage applied to the land itself, faces and harvest cut together into an argument about collectivisation."),
  r("un chien andalou", "eraserhead", "convergence", "none", 0.56, 0.38,
    "Dream logic with no narrative obligation, images sequenced to disturb rather than to mean."),
  r("nickel boys", "moonlight", "convergence", "none", 0.56, 0.38,
    "Black American boyhood filmed in close subjective register, the institutional cruelty kept mostly at the frame's edge."),
  r("godland", "silent light", "convergence", "none", 0.56, 0.38,
    "A priest's faith failing in an overwhelming landscape, shot in a boxed frame that makes the terrain the antagonist."),
  r("eo", "au hasard balthazar", "descent", "b", 0.76, 0.58,
    "A donkey passed between owners across a continent, each one revealing themselves by how they treat it."),
  r("atlantique", "touki bouki", "convergence", "none", 0.56, 0.38,
    "Dakar filmed with the sea as the thing that takes people away, realism giving way to the supernatural."),
  r("certain women", "old joy", "rhyme", "none", 0.6, 0.44,
    "Reichardt's Pacific Northwest in winter light, the drama held to the scale of a conversation that does not resolve."),

  /* ---------- the last nine, to finish coverage ----------
     Six of these lost their intended partner to a film the corpus does not
     hold; the rest simply never came up. Every film in the corpus now carries
     at least one authored claim. */
  r("in the realm of the senses", "possession", "convergence", "none", 0.58, 0.4,
    "A couple sealing themselves into a room and an obsession, filmed past the point most cinema stops and refusing to look away."),
  r("sweetie", "la cienaga", "convergence", "none", 0.62, 0.44,
    "A family filmed in oblique framings and bodies cut by the edge of shot, the dysfunction ambient rather than announced."),
  r("police story", "hard boiled", "rhyme", "none", 0.68, 0.5,
    "Hong Kong action where the stunt is performed for real and held in wide shot, because cutting away would be cheating."),
  r("blind chance", "three colours red", "rhyme", "none", 0.66, 0.48,
    "Kieślowski arranging coincidence openly enough that you feel an author deciding, then asking what that means for the people inside it."),
  r("damnation", "satantango", "rhyme", "none", 0.74, 0.56,
    "Tarr's rain, mud and very long takes, a village of people waiting for a deal that will obviously betray them."),
  r("tampopo", "seven samurai", "descent", "b", 0.6, 0.44,
    "A team recruited one by one to rescue somebody who cannot manage alone — the structure lifted wholesale and applied to a noodle shop."),
  r("blind shaft", "gomorrah", "convergence", "none", 0.56, 0.38,
    "Crime filmed as an economy with its own labour market, the violence a line item rather than a climax."),
  r("siegfried", "metropolis", "rhyme", "none", 0.66, 0.48,
    "Lang building myth at architectural scale, the sets monumental enough that the human figures read as ornament on them."),
  r("nine queens", "uncut gems", "convergence", "none", 0.56, 0.38,
    "A hustle that keeps having to be re-solved in real time, every fix opening a worse problem."),

  /* ---------- eighth pass: the 2,204-film expansion ----------
     The growth run tripled the corpus and every new film arrived describable
     only by record coincidence: authored coverage fell 803/803 -> 835/2204 and
     measure-maps went to FAIL on interpretive share. These are written against
     that, and they are deliberately NOT uniform coverage.

     What is here: films I can say something specific and defensible about.
     What is not: the long tail of minor works I know by reputation only, and
     everything dated 2024 or later -- Disclosure Day, Wild Horse Nine, The
     Odyssey, One Battle After Another and the rest. A formal claim about a
     film's camera requires having some purchase on the film. Inventing one
     produces a sentence indistinguishable from a real claim, carrying a
     confidence number, inside a corpus whose whole value is that its claims
     are real. Leaving a film uncovered is visible in the metrics; a fabricated
     reading is not. That asymmetry decides it.

     Bias here is toward pairs in DIFFERENT traditions, per the standing note
     that those are the edges which let a viewer travel somewhere they would
     not otherwise have gone. */

  /* Kurosawa's unharvested run. The corpus held the canon and almost none of
     the rest, which made his region a shelf of famous titles rather than a
     working life. */
  r("the bad sleep well", "hamlet", "descent", "b", 0.72, 0.62,
    "Hamlet relocated to a postwar construction firm: the revenge is against a company, and the ghost is a corruption scandal nobody will name aloud."),
  r("the bad sleep well", "the godfather part ii", "rhyme", "a", 0.62, 0.5,
    "Both open on a ceremony filmed as a business meeting — a wedding where the real transactions happen at the edge of frame, among men who never stop working."),
  r("i live in fear", "dr strangelove", "rebuttal", "b", 0.66, 0.55,
    "Kubrick made nuclear terror absurd and institutional; Kurosawa made it one old man's private conviction, treated by his family as senility rather than sight."),
  r("i live in fear", "black rain", "convergence", "a", 0.6, 0.58,
    "Nuclear dread as a domestic condition rather than an event: one films the slow social consequence of having been under it, the other a man whose terror of it his family treats as a legal problem."),
  r("one wonderful sunday", "bicycle thieves", "convergence", "b", 0.68, 0.6,
    "A couple with almost no money spending a day trying to enjoy a city that keeps charging them for it — postwar poverty filmed as an afternoon rather than a tragedy."),
  r("madadayo", "wild strawberries", "convergence", "b", 0.64, 0.55,
    "An old teacher surrounded by former students, taking stock — age filmed as an annual ritual of being loved, and the quiet terror underneath it."),
  r("rhapsody in august", "hiroshima mon amour", "convergence", "b", 0.66, 0.58,
    "The bomb as something the young must be taught to remember: an elderly survivor and a generation who know it only as history, in a landscape that has healed over."),
  r("dreams", "the mirror", "convergence", "b", 0.63, 0.5,
    "Memory filmed without a plot to carry it — episodes that follow the logic of dreaming, where a house, a fox's wedding or a field of flowers arrives with the weight of something recalled."),
  r("dreams", "fantasia", "rhyme", "a", 0.5, 0.4,
    "An anthology where each part sets its own rules — a portmanteau built so that a change of style between segments is the form, not an inconsistency."),
  r("scandal", "network", "convergence", "b", 0.65, 0.56,
    "A press that has discovered it can manufacture the story rather than find it, filmed with contempt for the machinery and pity for whoever it lands on."),

  /* Bertolucci, Visconti: the Italian historical epic as a class argument. */
  r("1900", "the leopard", "descent", "b", 0.72, 0.6,
    "The same century of Italian land seen from the other end: Visconti mourns an aristocracy that knows it is finished, Bertolucci follows the two boys — landowner's son and peasant's — born on the estate the same day."),
  r("1900", "once upon a time in america", "rebuttal", "b", 0.58, 0.45,
    "Two boys bound to each other across a violent century, the friendship carrying the history — an epic measured in what a lifelong tie survives rather than in events."),
  r("the leopard", "barry lyndon", "convergence", "a", 0.66, 0.55,
    "Aristocratic time filmed at aristocratic pace — long ceremonial sequences where the point is not what happens but how thoroughly a world is furnished before it disappears."),
  r("last tango in paris", "in the mood for love", "rebuttal", "b", 0.6, 0.48,
    "Two strangers meeting in an empty apartment and agreeing to withhold their names: one strips everything away to the bodies, the other everything away except restraint."),

  /* Hitchcock's uncovered early and minor work, which is where the tricks were
     found before they became signatures. */
  r("stage fright", "rashomon", "convergence", "b", 0.7, 0.72,
    "Both stage a flashback that lies. Hitchcock's audience took the image as fact for decades and objected when it wasn't; Kurosawa built the lie in from the start and made it the subject."),
  r("sabotage", "the battle of algiers", "rhyme", "b", 0.64, 0.6,
    "A bomb travelling through ordinary civilian traffic, the camera staying with the carrier and the clock rather than the target — suspense built from knowing what is in the bag."),
  r("the pleasure garden 1925", "citizen kane", "convergence", "b", 0.5, 0.38,
    "A first feature already showing the hand: a director learning that where you put the camera is an argument, not a description."),
  r("the paradine case", "anatomy of a fall", "convergence", "b", 0.6, 0.5,
    "The courtroom as a place where the lawyer's own judgement is on trial — a defence undone by the advocate wanting his client to be innocent."),

  /* Spielberg's uncovered corners: the television thriller, the flop, the
     sequel that broke the rating system. */
  r("duel", "jaws", "descent", "a", 0.8, 0.85,
    "The rehearsal for the shark: an unseen predator with no motive and no face, and a protagonist who cannot get anyone to believe the threat is real."),
  r("duel", "the wages of fear", "convergence", "b", 0.6, 0.5,
    "A road picture where the road is the antagonist — a vehicle, a gradient and a driver's nerve, with almost nothing else in the frame."),

  /* Cronenberg's early body horror, which the corpus held only in its late,
     respectable form. */
  r("shivers", "rear window", "rebuttal", "b", 0.56, 0.45,
    "The apartment block as a closed society, filmed by Hitchcock as a set of windows to be read and by Cronenberg as a single organism to be infected."),
  r("shivers", "the thing", "convergence", "b", 0.7, 0.68,
    "Contagion as the engine: a sealed building, a parasite that rewrites whoever it enters, and no way to tell who is still themselves."),
  r("the dead zone", "minority report", "rhyme", "a", 0.64, 0.55,
    "A man who sees a death before it happens and has to decide whether foreknowledge obliges him to act — precognition treated as a moral problem rather than a power."),

  /* Truffaut and Bresson: French interiors the corpus was missing. */
  r("the green room", "vertigo", "convergence", "b", 0.68, 0.6,
    "A man who keeps a room for the dead and cannot let a living woman occupy it — devotion to a lost person filmed as a slowly closing trap."),
  r("the soft skin", "brief encounter", "rebuttal", "b", 0.62, 0.55,
    "An affair filmed without romance: the hotel corridors, the timetables and the switching of lights, so that the logistics become the subject and the passion is barely visible."),
  r("a gentle woman", "pickpocket", "convergence", "a", 0.66, 0.6,
    "Bresson's method turned on a marriage — hands, objects and flat voices, with the emotional event withheld and reconstructed by the audience from evidence."),
  r("a gentle woman", "cries and whispers", "rhyme", "a", 0.58, 0.45,
    "A woman dying inside a household that cannot address her directly, so her interior life reaches us only as the silence the others arrange themselves around."),

  /* Bergman's uncovered middle period. */
  r("the magician", "persona", "descent", "a", 0.6, 0.5,
    "A performer whose act may be entirely fraudulent, examined by people who want him unmasked — the first working of the question Persona later turns on itself."),
  r("secrets of women", "eyes wide shut", "rhyme", "a", 0.55, 0.42,
    "Married couples telling each other what they have done, filmed so the telling is the event and the marriage is what has to survive it."),

  /* Kieślowski, Wenders, Haneke: European moral cinema. */
  r("happy end", "autumn sonata", "convergence", "b", 0.64, 0.58,
    "A family reunion conducted entirely in good manners, where the accusation arrives as politeness and the damage is decades old before the camera turns up."),
  r("summer in the city", "kings of the road", "descent", "a", 0.62, 0.55,
    "The first sketch of the Wenders road picture: a man moving between German cities with no destination, the film taking its shape from the travelling rather than a plot."),
  r("the scarlet letter", "the witch", "convergence", "b", 0.55, 0.5,
    "Puritan New England as a machine for punishing women publicly — the scaffold as civic architecture."),

  /* Miyazaki and Studio Ghibli's uncovered ends. */
  r("the boy and the heron", "spirited away", "descent", "a", 0.74, 0.72,
    "A child pulled into a world with its own rules while grieving a mother — the same structure re-entered decades later, with the wonder shot through by loss."),
  r("the boy and the heron", "the mirror", "convergence", "b", 0.55, 0.4,
    "Wartime childhood and a mother's absence rendered as association rather than narrative, so the film moves the way a memory does."),
  r("tales from earthsea", "princess mononoke", "rebuttal", "b", 0.52, 0.42,
    "The Ghibli ecological fable attempted by a different hand: the same balance-of-nature argument, without the ambivalence that made the original refuse a villain."),

  /* Asian action and genre cinema the expansion reached. */
  r("once upon a time in china", "hero", "descent", "a", 0.68, 0.62,
    "Wire-work choreographed as argument rather than spectacle — a master whose fighting style is his politics, filmed in long takes that let you read the technique."),
  r("once upon a time in china", "the wind rises", "rhyme", "b", 0.5, 0.38,
    "A national modernisation story told through a single disciplined man watching his country arm itself around him."),

  /* Italian genre: Bava and Petri, the pop end of the 1960s. */
  r("two evil eyes", "spirits of the dead", "convergence", "b", 0.58, 0.55,
    "Poe divided between directors, the portmanteau structure used to set two temperaments against each other on the same source."),

  /* Zhang Yimou, Eisenstein, Ozu: colour, montage, and the family. */
  r("red sorghum", "days of heaven", "rhyme", "b", 0.64, 0.55,
    "A field filmed as the whole world — labour, weather and a love triangle staged in standing crops, with the colour doing the emotional work."),
  r("red sorghum", "raise the red lantern", "descent", "a", 0.7, 0.68,
    "Saturated colour as social structure: red as celebration here, red as surveillance and rank there, by the same hand five years apart."),
  r("the general line", "man with a movie camera", "convergence", "b", 0.66, 0.62,
    "Machinery filmed as ecstasy — a cream separator or a projector cut so fast that the mechanism becomes the emotion of the scene."),
  r("a mother should be loved", "tokyo story", "descent", "a", 0.62, 0.55,
    "The Ozu family drama in its early form: the camera already low and still, the conflict already handled as something the family declines to say out loud."),

  /* Coens, Malle, Wilder: American craft in unfamous registers. */
  r("hail caesar", "the making of fanny and alexander", "convergence", "b", 0.62, 0.58,
    "A picture about making pictures, filmed from inside the machinery — affectionate about the craft and unsentimental about the product it exists to deliver."),
  r("pretty baby", "taxi driver", "rhyme", "b", 0.55, 0.45,
    "A child inside an adult economy, filmed without commentary so that the composure of the framing becomes the accusation."),
  r("the spirit of st louis", "2001 a space odyssey", "convergence", "b", 0.62, 0.58,
    "A man alone in a small machine for a very long time, the achievement measured in fuel, instruments and staying awake — flight filmed as procedure rather than as triumph."),

  /* War, and the long take. */
  r("1917", "come and see", "rebuttal", "b", 0.62, 0.52,
    "Both put you inside a soldier's continuous experience; one uses the unbroken take to make war navigable as a mission, the other to make it a thing done to a face."),
  r("1917", "children of men", "descent", "b", 0.68, 0.7,
    "The long take as a way of refusing cutaways — the camera bound to one body so the audience cannot look away to a wider view that would explain the danger."),
  r("black hawk down", "the battle of algiers", "rebuttal", "b", 0.56, 0.45,
    "Urban combat filmed with documentary grammar but no politics — procedure and geography in place of the argument the older film was built to make."),
  r("fear and desire", "paths of glory", "descent", "a", 0.6, 0.62,
    "The first, disowned run at Kubrick's subject: an anonymous war, a patrol behind an unnamed line, and officers whose reasoning is already the horror."),

  /* Malick, Pasolini, Godard: film as essay. */
  r("voyage of time", "koyaanisqatsi", "convergence", "b", 0.7, 0.68,
    "Cosmic time without narration or characters — geological and biological process filmed as spectacle, the argument carried entirely by scale and cutting."),
  r("arabian nights", "the decameron", "descent", "a", 0.72, 0.72,
    "Pasolini's trilogy method: bawdy folk tales filmed with non-professional faces and real dirt, the frankness offered as pre-industrial rather than transgressive."),

  /* ---------- backported from readings.json ----------
     These were authored directly into static/readings.json and never into this
     file, so every regeneration silently destroyed them: 52 rebuttals and 6
     attested claims, discovered only because a regeneration was diffed against
     HEAD before being merged. readings.json is a BUILD ARTIFACT of this script.
     Anything authored only in the artifact is one `node write-readings.js` away
     from being gone, with no error and no warning -- the file simply comes back
     shorter. Backported so the generator is authoritative again.

     Two of the original 54 are not here: the wuxia-choreography readings on
     "the duel", whose film left the corpus when the key was corrected from Chang
     Cheh to Spielberg. They were written about a film the corpus no longer holds. */
  r("alexander nevsky", "andrei rublev", "rebuttal", "b", 0.78, 0.65,
    "A nation rallied on the ice against the outsider, answered by a cathedral sacked with the prince's own brother guiding the raiders in."),
  r("lawrence of arabia", "burn", "rebuttal", "b", 0.8, 0.6,
    "An Englishman consumed by the revolt he raised, answered by an agent who engineers a slave uprising for sugar, then kills the man he made."),
  at("apocalypse now", "jarhead", "rebuttal", "b", 0.8, 0.78,
    "The helicopter attack flown in to Wagner as an indictment of the war, answered by marines howling along to that same reel on their way to deploy.",
    "Anthony Swofford's memoir Jarhead (2003), the film's source, on marines screening Vietnam films as war pornography before deployment"),
  r("rambo first blood part ii", "born on the fourth of july", "rebuttal", "b", 0.75, 0.6,
    "A veteran sent back to Vietnam to win it properly, answered by one who comes home paralysed to a ward with broken equipment and rats in it."),
  r("rome open city", "difficult years", "rebuttal", "b", 0.72, 0.55,
    "The priest and the communist dying together, answered by a town clerk who signs the Fascist party card to keep a job he loses anyway."),
  r("is paris burning", "section speciale", "rebuttal", "b", 0.75, 0.6,
    "Liberation as a whole city rising to free itself, answered by judges assembling a court that could sentence men retroactively for the occupier."),
  r("the searchers", "meek s cutoff", "rebuttal", "b", 0.75, 0.6,
    "Five years spent hunting the Comanche who took a white girl, answered by a lost party whose water depends on a captive the film never translates."),
  r("walkabout", "rabbit proof fence", "rebuttal", "b", 0.72, 0.55,
    "White children saved in the desert by an Aboriginal boy left unnamed, answered by three Aboriginal girls walking home along a government fence."),
  r("the most beautiful", "no regrets for our youth", "rebuttal", "b", 0.72, 0.62,
    "Girls urged to grind more lenses for the war, answered by the same director with a woman planting rice in a village that shuns her as a spy's widow."),
  r("the 47 ronin", "harakiri", "rebuttal", "b", 0.78, 0.62,
    "Retainers avenging their lord, filmed to order as a morale booster, answered by a masterless samurai pricing what the code costs the poor."),
  r("kanal", "ida", "rebuttal", "b", 0.72, 0.58,
    "An uprising ending in the sewers as martyrdom, answered by two women driving out for one wartime grave and meeting who farms the land now."),
  r("the godfather", "goodfellas", "rebuttal", "b", 0.85, 0.7,
    "The mob as dynasty and amber-lit ceremony, answered by the mob as a job, with bodies that have to be moved before dinner."),
  r("goodfellas", "the irishman", "rebuttal", "b", 0.8, 0.65,
    "A life of appetite and forward motion, answered by the same director with freeze-frames that pre-announce each death and a last stretch in a care home."),
  r("stagecoach", "meek s cutoff", "rebuttal", "b", 0.8, 0.62,
    "Wide vistas and a cavalry bugle over the ridge, answered by a boxed-in near-square frame, no rescue, and a captive who may know where the water is."),
  r("shane", "heaven s gate", "rebuttal", "b", 0.8, 0.6,
    "The range war as one gunfighter saving the homesteaders, answered by cattlemen who draw up a list of names and hire an army."),
  r("high noon", "the great silence", "rebuttal", "b", 0.8, 0.6,
    "A lawman who pleads with his town and wins the street anyway, answered by a gunman whose throat was cut as a child and cannot ask."),
  r("my darling clementine", "mccabe mrs miller", "rebuttal", "b", 0.8, 0.65,
    "A town founded in a dance on its half-built church floor, answered by a settlement whose church never fills and whose first business is a brothel."),
  r("the man who shot liberty valance", "the assassination of jesse james by the coward robert ford", "rebuttal", "b", 0.75, 0.62,
    "The newspaperman who burns his notes and prints the legend, answered by the killer re-enacting the shooting on stage for people who came to hiss."),
  r("the thing from another world", "the thing", "rebuttal", "b", 0.8, 0.65,
    "Wisecrackers who pool what they know and beat the visitor, answered by a version where it wears their faces and only a blood test is trusted."),
  r("the maltese falcon", "klute", "rebuttal", "b", 0.75, 0.6,
    "A private eye whose case is a woman he sees through and hands over, answered by a film that turns to her work and her sessions with an analyst."),
  r("meet me in st louis", "new york new york", "rebuttal", "b", 0.75, 0.6,
    "Painted seasons and a family that will not leave for New York, answered on soundstages just as artificial, where the songs work and the marriage fails."),
  r("two or three things i know about her", "jeanne dielman 23 quai du commerce 1080 bruxelles", "rebuttal", "b", 0.8, 0.65,
    "A housewife selling herself while a man narrates theories over her, answered by a widow nobody explains, the potatoes taking longer than the client."),
  r("bicycle thieves", "los olvidados", "rebuttal", "b", 0.75, 0.65,
    "The poor as a father and son whose bond survives humiliation, refused by a blind beggar turned predator, boys preying on boys, no lesson at the end."),
  r("rear window", "peeping tom", "rebuttal", "b", 0.75, 0.6,
    "Watching the neighbours as a hobby the plot vindicates, refused by a blade in the tripod leg and a mirror, so the filmed woman watches her own face."),
  r("fitzcarraldo", "embrace of the serpent", "rebuttal", "b", 0.75, 0.6,
    "A steamship hauled over an Amazon ridge on indigenous shoulders, answered from the far bank: the rubber trade an atrocity, the white man a sick passenger."),
  r("tokyo story", "the insect woman", "rebuttal", "b", 0.75, 0.65,
    "Decorum at tatami height, answered by the same low camera tracking a woman through farm, mill and brothel like an insect that refuses to die."),
  r("street of shame", "girls of the night", "rebuttal", "b", 0.7, 0.6,
    "Brothel women filmed with sympathy as the law closes the house, answered by his leading actress with a woman expelled from every job her past reaches."),
  r("the color purple", "daughters of the dust", "rebuttal", "b", 0.7, 0.6,
    "Black women of the rural South turned into melodrama with suffering redeemed, answered on the Sea Islands in Gullah, narrated by a child not yet born."),
  r("raise the red lantern", "the story of qiu ju", "rebuttal", "b", 0.7, 0.6,
    "Concubines arranged under red lanterns, a China composed for the eye, answered by the same actress sent into real villages with hidden cameras."),
  r("2001 a space odyssey", "dark star", "rebuttal", "b", 0.75, 0.65,
    "The immaculate white ship and its calm computer, answered by a filthy scout vessel arguing a talking bomb out of detonating."),
  r("close encounters of the third kind", "war of the worlds", "rebuttal", "b", 0.8, 0.65,
    "A father leaving his children for ships descending in benediction, answered by machines rising from the tarmac and a father who only keeps them moving."),
  r("ordet", "winter light", "rebuttal", "b", 0.75, 0.65,
    "The dead raised in a parlour because a son written off as mad asks aloud, answered by a pastor in an empty church whose prayers are met with silence."),
  r("pinocchio", "a i artificial intelligence", "rebuttal", "b", 0.75, 0.6,
    "A wooden boy made real as the reward for goodness, answered by a machine child who asks the same blue fairy and is left asking."),
  r("metropolis", "alphaville", "rebuttal", "b", 0.6, 0.55,
    "A future raised as a colossal set of towers and machine halls, answered by one shot after dark in Paris corridors, with nothing built for it at all."),
  r("children of hiroshima", "hiroshima mon amour", "rebuttal", "b", 0.7, 0.55,
    "The bombing restaged so it can be seen and mourned, answered by a film insisting the museum and the newsreels show you nothing at all."),
  at("chronique d un ete", "lessons of darkness", "rebuttal", "b", 0.8, 0.8,
    "Passers-by asked on camera whether they are happy, answered by burning oil fields shot as alien apocalypse under an invented Pascal epigraph.",
    "Werner Herzog, 'Minnesota Declaration: Truth and Fact in Documentary Cinema' (Walker Art Center, 1999), which attacks cinema verite by name as reaching only 'the truth of accountants'"),
  r("salesman", "the thin blue line", "rebuttal", "b", 0.78, 0.65,
    "Bible salesmen followed by a camera that never asks a question, answered by a crime restaged in slow motion with a Philip Glass score doubting it."),
  r("black orpheus", "black god white devil", "rebuttal", "b", 0.8, 0.65,
    "Favela carnival in ravishing colour for audiences abroad, answered from the parched backlands in hard black and white by a balladeer counting the dead."),
  r("battleship potemkin", "man with a movie camera", "rebuttal", "b", 0.8, 0.7,
    "A mutiny restaged with a cast and a massacre invented for the steps, answered with no script or actors, cutting to the editor splicing what you watch."),
  r("z", "tout va bien", "rebuttal", "b", 0.75, 0.62,
    "Political murder made gripping as a thriller, answered by the occupied factory built as a cutaway dolls' house no one mistakes for real."),
  r("straw dogs", "funny games u s", "rebuttal", "b", 0.8, 0.66,
    "A siege where a mild man discovers his own violence and the audience cheers, answered by an intruder who picks up a remote and rewinds it away."),
  r("dont look back", "rolling thunder revue a bob dylan story by martin scorsese", "rebuttal", "b", 0.72, 0.64,
    "Proximity to the singer as the promise of revelation, answered by a tour film that salts its interviews with people who never existed."),
  r("bicycle thieves", "accattone", "rebuttal", "b", 0.75, 0.66,
    "The poor man as a worker wanting only the bicycle that keeps his job, answered by a hustler who cannot bear a day's labour, framed like a saint to Bach."),
  r("high school", "homework", "rebuttal", "b", 0.7, 0.58,
    "A school watched in silence from the corner, answered by a lens set in front of each child, keeping the moments when it frightens them."),
  at("high noon", "rio bravo", "rebuttal", "b", 0.85, 0.88,
    "A lawman begging his town for help, answered by a sheriff who turns every offer away and holds the jail with a drunk and a crippled old man.",
    "Howard Hawks, interviewed by Joseph McBride in Hawks on Hawks (1982): \"Rio Bravo was made because I didn't like a picture called High Noon… I didn't think a good sheriff was going to go running around town like a chicken with his head off asking for help.\""),
  at("the decameron", "salo or the 120 days of sodom", "rebuttal", "b", 0.82, 0.85,
    "Pasolini renounced his sunlit bawdy tales for making nakedness look like freedom, then filmed the same nakedness as inventory in a locked villa.",
    "Pasolini, \"Abiura dalla Trilogia della vita\", written 15 June 1975, published in Corriere della Sera and collected in Lettere luterane."),
  at("solaris", "stalker", "rebuttal", "b", 0.75, 0.8,
    "Orbital hardware judged to have crowded out the idea, answered by the same director with three men on foot in wet grass, walking towards a room.",
    "Tarkovsky, Sculpting in Time: \"the science-fiction element in Solaris was nonetheless too prominent and became a distraction\"; he adds the idea would have stood out more had the rockets and stations been dispensed with altogether."),
  at("tout va bien", "letter to jane", "rebuttal", "b", 0.7, 0.8,
    "A strike film built on Fonda's stardom, answered by the same directors spending fifty minutes on one press photograph of her listening in Hanoi.",
    "Godard and Gorin's own narration in Letter to Jane, made and screened as a postscript to Tout Va Bien."),
  r("the exorcist", "exorcist ii the heretic", "rebuttal", "b", 0.72, 0.65,
    "A child strapped to a bed, answered by a sequel in which the girl is grown, shares her memories through a hypnosis machine, and is a source of good."),
  r("the ballad of narayama", "the ballad of narayama 1983", "rebuttal", "b", 0.8, 0.68,
    "The old carried up the mountain on painted sets under lights that change on cue, answered by the same story dragged into snow, mud and rutting animals."),
  r("cape fear 1962", "cape fear", "rebuttal", "b", 0.75, 0.65,
    "A hunted family given a spotless lawyer to root for, answered by one who buried a report that would have helped his stalker: the siege as a debt."),
  r("my darling clementine", "the man who shot liberty valance", "rebuttal", "b", 0.7, 0.6,
    "One town raised by a dance on the bare floorboards of its church, answered by the same director with a newspaper choosing legend over what happened."),

  /* ==================================================================
     NINTH PASS — degree-20 films the 2,204 harvest brought in with no
     authored edge at all. Every film below was drawing a map made
     almost entirely of "X appears in both films": Buster's Bedroom got
     six cast lines, The Misfits eleven. merge-corpus supersedes the
     record on any pair a reading claims, so these are aimed at the
     specific pairs where the trivia was loudest — Clift in two films,
     Adjani in two, Madhabi Mukherjee in two — and the claim has to earn
     the slot it takes. Two films from the assigned set are missing
     here on purpose: John Goldfarb and Kristin Lavransdatter have no
     plot section and a description too thin to say anything specific
     and true about, so nothing was written for them.
     ================================================================== */

  /* ---------- the dead comedian's house, and the villa that performs ---------- */
  r("buster s bedroom", "the general", "descent", "b", 0.66, 0.48,
    "Keaton's comedy was a body outlasting the machinery that trapped it; here an admirer makes a pilgrimage to the sanatorium where he was actually strapped into a straitjacket, is put into one herself, and escapes — the gag replayed as biography."),
  r("buster s bedroom", "sunset boulevard", "rhyme", "none", 0.6, 0.42,
    "A decaying villa where the finished go on performing their best scenes for each other — a homecoming embrace staged nightly, a wheelchair with nothing wrong under it — and the visitor who arrived as a fan is absorbed into the act."),

  /* ---------- Prague built somewhere else ---------- */
  r("the unbearable lightness of being", "hangmen also die", "rhyme", "none", 0.58, 0.42,
    "Prague reconstructed twice outside Prague: once by émigrés on Hollywood soundstages while the occupation they were describing was still running, once by a film that degrades its own footage until its actors can be matted into the real 1968 newsreel."),

  /* ---------- Wenders, and the face inside its own pictures ---------- */
  r("pope francis a man of his word", "the salt of the earth", "descent", "b", 0.7, 0.5,
    "The same rig used twice: the subject looks at the interviewer in a mirror while the camera shoots through it, so a man addresses you straight down the lens with his own images sharing the glass — the photographer standing inside his photographs, the pope inside the poverty he is preaching about."),
  r("the salt of the earth", "koyaanisqatsi", "convergence", "none", 0.58, 0.44,
    "Human labour photographed until it turns into pattern — thousands of bodies on ladders in a single pit, crowds sped up until traffic reads as circuitry — and both films are left answering for whether making it beautiful betrays what it shows."),

  /* ---------- the frontier as industry ---------- */
  r("far and away", "heaven s gate", "rhyme", "none", 0.55, 0.38,
    "The same decade of European steerage arrivals staged as mass horse choreography across open prairie, and the two films cannot agree what waits at the end of it: a stake driven into your own quarter-section, or a hired army carrying a list with your name on it."),
  r("wild wild west", "once upon a time in the west", "rhyme", "none", 0.55, 0.38,
    "Both hand the frontier's destruction to a crippled man carried by his own machinery — a railroad baron hauling himself on crutches toward a painted ocean, an inventor on steam legs driving a mechanical spider — so the villain is the industry, wearing a body it has already ruined."),

  /* ---------- the gunfighter's biographer ---------- */
  r("my name is nobody", "the man who shot liberty valance", "descent", "b", 0.68, 0.5,
    "\"Print the legend\" converted into a favour: a young admirer arranges the duel, the photographer and the crowd of witnesses, so the old gunfighter can be dead in the newspapers and alive in a cabin bound for Europe."),
  r("my name is nobody", "once upon a time in the west", "descent", "b", 0.66, 0.48,
    "Fonda's face used a second time as the western's own memory — hired first so the genre's most trustworthy man could shoot a child, brought back here to be walked into retirement by a fan who has memorised his every feat."),
  r("my name is nobody", "unforgiven", "rhyme", "none", 0.6, 0.44,
    "Each stations a besotted chronicler at the aging gunman's elbow — one reciting his hero's kills from memory, one taking them down as dictation — and makes the gap between what happened and what gets written the actual plot."),

  /* ---------- the witness nobody will believe ---------- */
  r("the house on carroll street", "rear window", "descent", "b", 0.62, 0.44,
    "The neighbour's window as the whole case: she hears an argument she cannot see, no official will believe her, and the film sends her into the house alone — except that she is a picture editor just fired for refusing to name people, so scrutinising strangers is the exact crime she stands accused of."),
  r("the house on carroll street", "high noon", "convergence", "none", 0.56, 0.44,
    "Two films written by men the blacklist was happening to, arriving at it from opposite ends: one displaces the abandonment into an empty western street, the other opens in the committee room and then makes its witness the only person willing to look at what the country is quietly importing."),

  /* ---------- the schoolroom as a rehearsal ---------- */
  r("torment", "the white ribbon", "convergence", "none", 0.6, 0.45,
    "The classroom as the place a country's coming cruelty is rehearsed: a disciplinarian shot in hard monochrome as a respectable monster, filmed once in 1944 from inside a country staying out of the war and once in hindsight, about the generation that would fight it."),
  r("torment", "the 400 blows", "convergence", "none", 0.58, 0.44,
    "School filmed as a custodial institution with one adult who visibly enjoys the work, and an ending that simply puts the boy outside in open air with nothing arranged for him and nobody following."),

  /* ---------- Powell and Pressburger, and the cut across centuries ---------- */
  r("a canterbury tale", "2001 a space odyssey", "rhyme", "none", 0.6, 0.46,
    "A falcon loosed above the old pilgrims' road becomes, in one frame, a Spitfire in the same patch of sky — six centuries crossed in a single edit, twenty-four years before Kubrick made the same cut with a thrown bone."),
  r("a canterbury tale", "a matter of life and death", "rhyme", "none", 0.58, 0.44,
    "Two wartime films whose entire apparatus — a pilgrimage, a celestial courtroom — exists to argue one American serviceman into belonging in an English landscape, with the blessing delivered as the last reel's business."),

  /* ---------- the man who finds out he can shoot ---------- */
  r("a dangerous toy", "taxi driver", "convergence", "none", 0.6, 0.46,
    "A solitary man acquires a pistol, discovers he is unexpectedly good with it, kills someone in a public room and is briefly made a hero by the newspapers — and both films treat the applause as the worst thing that happens to him."),

  /* ---------- Farhadi's chain of confessions ---------- */
  r("the past", "a separation", "descent", "b", 0.68, 0.5,
    "The same engine moved to a Paris suburb: no villain anywhere, a chain of people each surrendering one more piece, every confession making the previous account wrong, and the question of who sent the message answered three times before it stops moving."),
  r("the past", "loveless", "convergence", "none", 0.55, 0.4,
    "A divorce filmed as property and paperwork — a flat being emptied, a signature pending — with the child who has been listening at the door as the only real casualty, and neither film granting the parents a scene of remorse."),

  /* ---------- the closed vessel on the last night ---------- */
  r("the palace", "and the ship sails on", "descent", "b", 0.62, 0.44,
    "A sealed luxury vessel packed with grotesques on the last night before the century turns over — a funeral cruise in July 1914, a New Year's party in December 1999 — with the staff sprinting below decks while the guests fail to notice what is arriving."),
  r("the palace", "the trouble with harry", "rhyme", "none", 0.56, 0.42,
    "A corpse demoted to a scheduling problem: the body has to be kept unnoticed and in the correct posture until a legal hour has passed, and the entire comedy is the logistics of moving it past people who must not see it."),
  r("and the ship sails on", "fitzcarraldo", "convergence", "none", 0.64, 0.48,
    "Opera loaded onto a boat and carried where it does not belong, twice within a year and by opposite ethics: one hauls a real steamship over a real hill, the other floats on sheets of plastic and shows you the hydraulic jacks in its final shot."),
  r("and the ship sails on", "man with a movie camera", "rhyme", "none", 0.58, 0.44,
    "The film halts and shows you its own machinery — the ocean revealed as plastic, the ship rocking on jacks, a camera filming the camera — after spending its whole length asking to be believed."),

  /* ---------- the garrison waiting for an enemy ---------- */
  r("the desert of the tartars", "beau travail", "convergence", "none", 0.64, 0.46,
    "A garrison drilling at the edge of a desert against an enemy that never comes, where the ritual of readiness becomes the men's entire content and the real subject is what waiting does to a body over years."),

  /* ---------- Scorsese, the archive and the staged concert ---------- */
  r("no direction home", "dont look back", "descent", "b", 0.66, 0.48,
    "One camera is in the hotel room in 1965 and never asks a question; the other is assembled four decades later out of that same tour footage, cut against the man at sixty finally sitting down to answer — the same face at both ends of the edit."),
  r("no direction home", "the last waltz", "rebuttal", "a", 0.62, 0.46,
    "The farewell concert built as a lit set with a borrowed opera backdrop and cameras placed by name cinematographers, answered by the same director with a portrait that films no performance at all and lives entirely off what other people's cameras happened to catch."),

  /* ---------- the building burned as a prayer ---------- */
  r("enjo", "the sacrifice", "convergence", "none", 0.6, 0.44,
    "A man sets fire to the most beautiful thing he has access to, and the film stages the arson as a devotional act rather than a crime — the blaze is the only prayer either character has left."),
  r("enjo", "first reformed", "convergence", "none", 0.56, 0.4,
    "A servant of the temple whose faith curdles into a plan against the building that houses it, filmed in still centred frames that leave the architecture holding all the power in the room."),

  /* ---------- the picture house and the town ---------- */
  r("empire of light", "the last picture show", "rhyme", "none", 0.56, 0.42,
    "A picture house standing in for the town around it — the screen still running, the upper floors shut and full of pigeons — and the staff more marooned in the place than any customer."),

  /* ---------- the West as leftover work ---------- */
  r("the misfits", "red river", "rebuttal", "a", 0.7, 0.5,
    "The same young actor put back on a horse thirteen years later: the cattle drive that founded the country restaged as three men in a flatbed truck and a spotter plane running down six exhausted mustangs to be sold for dog food."),
  r("the misfits", "junior bonner", "convergence", "none", 0.56, 0.42,
    "The modern West as leftover work: men who can still do a thing nobody needs done any more, filmed in towns that have turned the last of their skill into a weekend event with a ticket price."),

  /* ---------- Death as an official ---------- */
  r("destiny", "the seventh seal", "rhyme", "none", 0.6, 0.45,
    "Death arrives as a courteous functionary who explains the terms, and the film is one person's attempt to buy back a single life under rules that turn out to be administrative rather than moral."),
  r("destiny", "intolerance", "descent", "b", 0.6, 0.44,
    "Griffith cross-cut four centuries into one climax; Lang takes the same argument and runs the eras end to end instead, recasting the same pair of lovers in Baghdad, Venice and China so the point lands by repetition rather than by editing."),
  r("destiny", "a matter of life and death", "rhyme", "none", 0.56, 0.42,
    "A single life formally appealed in the afterlife's own offices: the bereaved is granted a hearing, given conditions and made to argue the case — the beyond imagined as a department with procedures rather than as a mystery."),

  /* ---------- the sequel, and the heist run backwards ---------- */
  r("halloween ii", "halloween", "descent", "b", 0.7, 0.5,
    "The sequel resumes in the minute the first one ended and moves the night indoors into a half-staffed hospital, so wide suburban streets become corridors — and the shape the original deliberately refused to explain is handed a sister and a motive."),
  r("before the devil knows you re dead", "dog day afternoon", "rebuttal", "a", 0.66, 0.48,
    "A robbery played out across one public afternoon with a crowd on the pavement cheering the robber, answered thirty years later by the same director with a robbery that fails in ninety seconds and is then taken apart backwards, in private, one family member at a time."),
  r("before the devil knows you re dead", "the killing", "descent", "b", 0.6, 0.44,
    "The job is over inside the first ten minutes and the film then rewinds it once per participant, each pass supplying what the last one withheld, until the botched robbery is explained entirely by the family that planned it."),

  /* ---------- Ozu twice, and the son's picture of his father ---------- */
  r("a story of floating weeds", "floating weeds", "descent", "a", 0.75, 0.55,
    "Ozu shot his own film again twenty-five years later in colour and sound, and the difference sits in one scene: the quarrel the silent version keeps indoors is moved out into falling rain, the couple shouting from opposite sides of a village street and never once sharing a frame."),
  r("a story of floating weeds", "i was born but", "rhyme", "none", 0.6, 0.44,
    "Two years apart, the same discovery staged twice: a boy's picture of his father collapses — once as comedy, watching him clown for his boss, once as ruin, learning that the uncle who visits is the man who left."),

  /* ---------- the working wife, and the threshold ---------- */
  r("mahanagar", "charulata", "rhyme", "none", 0.66, 0.48,
    "The same actress placed on either side of one threshold: a wife watching the street through opera glasses from a shuttered house, and a wife out in that street with a sample case — each marriage measured by exactly how much she is permitted to see."),
  r("mahanagar", "when a woman ascends the stairs", "convergence", "none", 0.58, 0.44,
    "Two early-sixties films that make a woman's working day a series of thresholds crossed in public — a staircase climbed every evening, a stranger's door knocked on every morning — and price her competence against her respectability at each one."),

  /* ---------- the island, and the animal in the way ---------- */
  r("liza", "the woman in the dunes", "convergence", "none", 0.6, 0.44,
    "Two people sealed into a place with no way off, where the arrangement forced on them stops being a captivity and becomes the only relationship either of them still wants."),
  r("liza", "au hasard balthazar", "rhyme", "none", 0.55, 0.4,
    "The animal is the only uncomplicated attachment on screen and the exact measure of everyone handling it; the moment it is killed for being loved more than they are, the film stops being a romance."),

  /* ---------- the love with one participant ---------- */
  r("the story of adele h", "letter from an unknown woman", "rhyme", "none", 0.62, 0.46,
    "A whole life organised around a man who barely registers her, and handed to us as her own writing — a letter, a journal kept partly in cipher — so the film is her account of a love that only ever had one participant."),
  r("the story of adele h", "possession", "rhyme", "none", 0.56, 0.4,
    "The same actress used twice as a body that cannot contain its own feeling: one film keeps her in lamplit rooms writing the obsession down in a private code, the other lets it out into a subway corridor as pure physical convulsion."),

  /* ---------- casting a person for what they already are ---------- */
  r("invincible", "the enigma of kaspar hauser", "rhyme", "none", 0.62, 0.46,
    "Herzog casts for what a person actually is rather than what they can play — a genuine world's-strongest-man, a man raised inside institutions — so a good part of each performance is simply a body being itself in front of a lens."),

  /* ---------- whose child ---------- */
  r("like father like son", "shoplifters", "rebuttal", "b", 0.68, 0.5,
    "The blood tie interrogated from the comfortable side, where a father can afford to choose between the son he raised and the son he made — answered by a household with no legal claim to any of its members, whose only real crime is having chosen each other."),


  /* ==================================================================
     NINTH PASS, second set — thirty films the harvest brought in at
     degree 17-20 with no authored edge at all. Francesco's twenty
     lines were twenty craft credits; Taira Clan Saga's were one
     composer and nine films made the same year in the same country;
     Gintama's were fourteen consecutive "Japan, the same moment of
     each other". These aim at the pair the record was wasting.

     Written only where the plot section in pipeline/out/plots.json,
     the description or the keyword list could actually carry the
     claim. Where the evidence stopped at a premise — Tricheurs and
     Mata Hari have no plot and three lines of description between
     them — the confidence stops below 0.5 and the interface says so
     rather than the claim being dressed up.
     ================================================================== */

  /* ---------- the saint's life, and what the camera does with a body ---------- */
  r("francesco", "the flowers of st francis", "rebuttal", "a", 0.7, 0.5,
    "Rossellini cast actual friars and played the saint's life as a string of sunlit comic parables; Cavani answers with mud, illness and a body going wrong, so holiness registers as damage."),
  r("francesco", "europe 51", "convergence", "none", 0.66, 0.5,
    "The same scandal in two centuries: someone rich gives everything away and the family reaches not for admiration but for a doctor — one stripped in the square by his cloth-merchant father, the other signed into an asylum by her industrialist husband."),
  r("francesco", "andrei rublev", "convergence", "none", 0.58, 0.4,
    "The medieval century filmed for its cold, its mud and its untreated wounds, with the transcendent moment withheld so long that when it arrives it can only be read as something that happened to a body."),
  r("simon of the desert", "ordet", "rebuttal", "a", 0.66, 0.5,
    "Dreyer stages his resurrection with total gravity and dares you to accept it; Buñuel grants his stylite a miracle and has the man whose hands are restored use them, in the next shot, to cuff his child."),
  r("simon of the desert", "the exterminating angel", "rhyme", "none", 0.64, 0.46,
    "Buñuel's trap twice, and neither time is it sprung: guests who cannot walk out of a drawing room, an ascetic who cannot come down off his pillar — and both films end by moving the confinement somewhere new, into a cathedral, into a Manhattan nightclub."),
  r("europe 51", "the passion of joan of arc", "rhyme", "none", 0.66, 0.5,
    "A woman set in front of a panel of law, medicine and the church and required to account for her charity in their vocabulary; she will not, and the panel decides what she is instead."),
  r("europe 51", "the flowers of st francis", "descent", "b", 0.66, 0.5,
    "Rossellini moved the saint's life out of the thirteenth century and into post-war Rome: the same string of small unexplained charities, except that the world which cannot classify her does not laugh at her, it certifies her."),
  r("europe 51", "diary of a country priest", "convergence", "none", 0.58, 0.42,
    "Sanctity treated as a medical problem — the institutions around a person's charity reaching for a diagnosis, and neither film supplying a miracle that would overrule them."),

  /* ---------- the tribunal, and the verdict written first ---------- */
  r("danton", "the confession", "convergence", "none", 0.62, 0.48,
    "A revolution putting its own founder in the dock with the verdict settled in a committee room before the hearing opens — one accused shouts over the court until it changes its rules, the other is worn down into reciting the script."),
  r("danton", "ashes and diamonds", "rhyme", "none", 0.6, 0.45,
    "Wajda's recurring bet: the doomed man gets the appetite, the noise and the warm rooms, while the side that wins is filmed as thin, cold and correct — a partisan dying on a rubbish heap, then a Danton eating and shouting his way to the scaffold."),
  r("doubt", "winter light", "rebuttal", "a", 0.6, 0.46,
    "Bergman empties the pews around a pastor who has stopped believing; here a nun is given total conviction on no evidence at all, drives the priest out of the parish with it, and is allowed her doubt only in the last line."),
  r("doubt", "anatomy of a fall", "convergence", "none", 0.62, 0.46,
    "A case assembled entirely out of domestic detail — who kept whose shirt, what was on whose breath, which door stood open — by a film that then declines to say whether the detail meant anything, leaving you holding a verdict you have already formed."),

  /* ---------- Bergman's parents, filmed by other people ---------- */
  r("the best intentions", "private confessions", "descent", "a", 0.7, 0.6,
    "Not two roles but one woman: Pernilla August plays Bergman's mother in both, so the marriage being contracted in one film is the marriage being confessed out of in the other, carried across two directors neither of whom is the son who wrote them."),
  r("the best intentions", "fanny and alexander", "rebuttal", "a", 0.66, 0.48,
    "Bergman had already filmed the severe clergyman as a fairy-tale ogre; here he writes that man's youth for another director — a poor theology student marrying above himself — and grants him the sympathy his own film withheld."),
  r("the best intentions", "sunday s children", "rhyme", "none", 0.62, 0.5,
    "The same marriage before and after, from two Bergman scripts filmed the same year by two other hands: the courtship of his parents in one, and in the other a day alone with that father seen from the child's seat, the man already unreachable."),

  /* ---------- the machine you think you can beat ---------- */
  r("tricheurs", "bob le flambeur", "rhyme", "none", 0.58, 0.4,
    "The casino approached as a machine with a solvable fault — a wheel rigged by radio, a safe timed to the hour — by people whose actual problem is that solving it does not touch the appetite that made them try."),
  r("tricheurs", "l argent", "convergence", "none", 0.54, 0.36,
    "Money as the film's real protagonist: a forged note passed from hand to hand until it has produced a murderer, a stake pushed round a wheel until it has produced two cheats, the person in each case a by-product of the transaction."),
  r("the music man", "yojimbo", "rhyme", "none", 0.58, 0.4,
    "A stranger arrives in a town with nothing to sell but a problem he has invented, works both halves of it and takes his fee out of the panic — one manufactures a gang war, the other a moral emergency about a pool table."),
  r("the music man", "f for fake", "convergence", "none", 0.55, 0.4,
    "The fraud that works because the audience needs it to: a bandmaster who cannot read music teaching a town to hear a march nobody is playing, and an essay film that admits mid-flow it has been lying and asks you to enjoy the swindle anyway."),

  /* ---------- the enemy officer, and the rule used as the weapon ---------- */
  r("the battle of the river plate", "the life and death of colonel blimp", "descent", "b", 0.64, 0.5,
    "The same team's insistence on the decent enemy, thirteen years on: the German officer who carried the earlier film's moral weight becomes a Kriegsmarine captain filmed so respectfully that the Royal Navy's closing line is a compliment to him."),
  r("bridge of spies", "the battle of the river plate", "convergence", "none", 0.6, 0.46,
    "Both hand the last act to a rule rather than a weapon — neutrality law, a prisoner-exchange protocol — and both reserve their warmest gesture for the enemy officer who behaves better than the side that sent him."),
  r("bridge of spies", "harakiri", "rhyme", "none", 0.56, 0.4,
    "The rulebook used as the weapon: a lawyer who makes his own government honour a warrant it would rather skip, and a masterless samurai who makes a great house perform its own code to the letter until the house cannot survive it."),

  /* ---------- Truffaut's hidden man, and the woman doing the walking ---------- */
  r("confidentially yours", "the last metro", "descent", "b", 0.7, 0.55,
    "Truffaut ran the same machine twice in three years: the man shut inside the building he owns while the woman who works for him goes out and does everything in the world above — a theatre cellar under the Occupation, then an estate agency in a murder case."),
  r("confidentially yours", "the maltese falcon", "rebuttal", "a", 0.62, 0.45,
    "The private-eye picture with the private eye taken out of it: the suspect hides in his own office while his secretary does the walking, the questioning and the deducing, shot in the same wet monochrome the genre reserved for the man."),
  r("mata hari agent h 21", "notorious", "convergence", "none", 0.58, 0.42,
    "The woman assigned to sleep with the enemy as national service and then held responsible for having done it — one carried out of the house at the last possible moment, the other walked to a firing squad."),

  /* ---------- the recruitment structure, still wearing its source ---------- */
  r("the five man army", "seven samurai", "descent", "b", 0.62, 0.45,
    "The recruitment structure exported twice over and still visible underneath: five specialists introduced one demonstration at a time for a job in the Mexican Revolution, and the fifth of them is a silent Japanese blade man."),
  r("the five man army", "the wild bunch", "rhyme", "none", 0.58, 0.4,
    "Two 1969 westerns in which American professionals hire out to the Mexican Revolution and end by throwing the payday away — one in a suicidal charge for a comrade, the other by handing over the whole gold train and riding out unpaid."),
  r("rob roy", "the duellists", "convergence", "none", 0.6, 0.45,
    "The duel as class argument rather than climax: a schooled English rapier against a broadsword's weight, settled when the worse technician takes the blade in his bare hand — and elsewhere, fifteen years of impeccable fencing etiquette between two men who cannot remember what began it."),
  r("rob roy", "barry lyndon", "rhyme", "none", 0.55, 0.42,
    "The eighteenth century as a credit system in which a man's word and his manners are the only collateral available, and the violence is what happens when a gentleman calls the loan in."),

  /* ---------- the wilderness expert, and the officials who record him ---------- */
  r("the savage innocents", "nanook of the north", "descent", "b", 0.64, 0.48,
    "Flaherty's instructional patience — the seal hunt, the shelter built in real time, the food divided by rule — carried whole into colour fiction, with the crisis arriving when a missionary refuses the hospitality the film has just taught you to read."),
  r("the savage innocents", "dersu uzala", "convergence", "none", 0.58, 0.42,
    "The wilderness man filmed as an expert rather than a curiosity, his weather and shelter and hunting shown as technique you could learn, and then measured against an official world whose law has no category for any of it."),

  /* ---------- the workplace as the whole political world ---------- */
  r("orchestra rehearsal", "the working class goes to heaven", "convergence", "none", 0.62, 0.46,
    "Italian cinema of the same few years staging the workplace as the entire political world — a factory line, a rehearsal room — with a union that turns up and makes things worse, and both films ending with the worker back at his bench."),
  r("orchestra rehearsal", "8", "rhyme", "none", 0.6, 0.44,
    "Fellini's man in charge, twice: a director herding a crowd who all want something from him into a ring, a conductor barking his players back into line — and in both the revolt is where the film comes alive and the restored authority is the ending nobody trusts."),
  r("the river", "harlan county usa", "rebuttal", "a", 0.6, 0.48,
    "The picket line filmed from the wrong side: a documentary that stands with the strikers and their guns, answered by a drama that puts its farmer in among the strikebreakers and asks you to keep rooting for him while the two lines look each other over."),

  /* ---------- the double, and the man who does the job better ---------- */
  r("pardon my past", "double indemnity", "rhyme", "none", 0.56, 0.45,
    "Fred MacMurray's salesman affability used twice inside a year: it talks a woman into killing her husband in one film and a rich family into believing he is their son in the other, and the manner does not shift by a hair between them."),
  r("pardon my past", "kagemusha", "convergence", "none", 0.5, 0.36,
    "The impostor who does the job better than the man he stands in for — a household that prefers the heir it has been handed, a war camp that prefers the thief — so the discovery is less about the double than about how little the position needed the original."),
  r("memoirs of an invisible man", "the conversation", "rhyme", "none", 0.58, 0.44,
    "Two San Francisco men who arranged their lives to leave no trace, no family and nobody who would report them missing, then find the trace is the only thing anyone wants: one tears his own apartment apart hunting a bug, the other watches rain draw his outline."),
  r("memoirs of an invisible man", "a ghost story", "convergence", "none", 0.55, 0.4,
    "Invisibility taken as a social fact rather than an effect: a man standing in rooms where his own life carries on without him, with the joke and the grief working off the identical discovery that nobody is looking."),

  /* ---------- one premise, run more than once ---------- */
  r("melinda and melinda", "crimes and misdemeanors", "descent", "b", 0.64, 0.5,
    "Allen ran the braid twice: one film cuts a murder plot against a comic one and lets them meet for a minute at a wedding, the other puts the device on screen with two playwrights at a table arguing the same premise into tragedy and into farce."),
  r("melinda and melinda", "blind chance", "convergence", "none", 0.58, 0.42,
    "One premise run repeatedly with the same person at its centre, the branch point political in one film and purely tonal in the other, and neither version offered as the true one."),
  r("melinda and melinda", "rashomon", "rebuttal", "a", 0.55, 0.38,
    "Retellings in which the facts never move and only the genre does, so the disagreement stops being about what happened and becomes an argument about whether it is funny."),

  /* ---------- the session, and who is actually dependent ---------- */
  r("holy smoke", "the piano", "descent", "b", 0.66, 0.5,
    "Campion's transaction run again: a man sets the terms of an arrangement over a woman and the film hands her the leverage one item at a time — piano keys traded for skin in one, a deprogramming that ends with the counsellor in a red dress in the desert in the other."),
  r("holy smoke", "the master", "convergence", "none", 0.6, 0.45,
    "The session as the film's central form — one person putting another through repeated processing designed to install or remove a belief — with both films arriving at the conclusion that the examiner is the more dependent of the two."),
  r("chaplin", "citizen kane", "descent", "b", 0.62, 0.46,
    "The biopic borrowing Kane's frame in order to admit what it is: an old man in a lakeside house pressed by an editor invented for the film about everything the memoir left out, so the life arrives as something its subject is still selling."),
  r("chaplin", "modern times", "rhyme", "none", 0.58, 0.42,
    "The film's real stunt is re-performance — an actor rebuilding the routines gesture for gesture, with the last reel handed over to the original footage, so the comparison it cannot possibly win is the one it keeps requesting."),

  /* ---------- endurance, and who keeps the tally ---------- */
  r("unbroken", "come and see", "rebuttal", "a", 0.6, 0.45,
    "Two films made almost entirely of one body absorbing punishment: this one counts the ordeals like laps — days adrift, beatings taken, a beam held overhead — and delivers a record broken, where the other lets a boy's face age past reading and keeps no tally at all."),
  r("unbroken", "schindler s list", "descent", "b", 0.58, 0.45,
    "Both close by handing the film over to the record itself — survivors filed past a grave, then photographs and captions of the real man's later life — so the last feeling the audience is given comes from documents rather than from the drama."),

  /* ---------- the line dissolved, the plot refused ---------- */
  r("my neighbors the yamadas", "the tale of the princess kaguya", "descent", "a", 0.72, 0.6,
    "The Ghibli line dissolved here first: watercolour washes that stop short of the frame's edge and leave the paper showing, tried out on a newspaper-strip family and then pushed to charcoal, blank space and a folk tale fourteen years later."),
  r("my neighbors the yamadas", "grave of the fireflies", "rebuttal", "a", 0.64, 0.48,
    "The same hand that filmed two children starving in the ruins turned to a household whose emergencies are a lost bicycle, a wedding speech and the television remote, and refused it a plot at all — the whole thing staged as gags on white paper."),
  r("black moon", "valerie and her week of wonders", "convergence", "none", 0.62, 0.45,
    "A girl's adolescence staged as folk dream — talking animals, a house of predatory adults, a rule-set the film never states — and shot in plain daylight, so nothing is ever marked as the unreal part."),
  r("black moon", "the night of the hunter", "rhyme", "none", 0.56, 0.4,
    "A child fleeing adult violence across a landscape that stops obeying realism, arriving at a farm where an old woman keeps animals and stray children together like an ark."),

  /* ---------- Resnais forward, and the cell that outlived its war ---------- */
  r("the war is over", "last year at marienbad", "rebuttal", "a", 0.66, 0.5,
    "Resnais turned his own conditional montage around: where the earlier film cut away to a past that may never have happened, this one cuts forward to what has not happened yet, imagining a woman he has never met as three different women before he reaches her door."),
  r("the war is over", "the battle of algiers", "convergence", "none", 0.56, 0.42,
    "Two 1966 films about an underground cell — one shot in the streets as an insurrection that works, one in Paris flats where the same forged papers and safe-house discipline have hardened into a career, twenty-seven years after the war they belong to was lost."),
  r("la luna", "autumn sonata", "convergence", "none", 0.62, 0.46,
    "The performing mother put in front of her child: a pianist made to sit through her daughter playing the same prelude, an opera singer teaching her son to sing while he is coming off heroin — in both, the music is the only channel she has and the child knows it."),
  r("la luna", "oedipus rex", "rhyme", "none", 0.55, 0.4,
    "Italian cinema taking the Oedipus material twice in a dozen years: once restaged in the desert as ancient rite, once in a Roman flat where the mother sings tragedy for a living, so the myth arrives as repertoire."),

  /* ---------- looking as the injury ---------- */
  r("the stendhal syndrome", "vertigo", "rebuttal", "a", 0.64, 0.46,
    "Hitchcock's man remakes a woman into the dead one he wants; here the remaking is handed to the woman herself — after the assault she cuts her hair, takes a blonde wig and a new voice, and the film lets her finish as the man who attacked her."),
  r("the stendhal syndrome", "peeping tom", "convergence", "none", 0.58, 0.44,
    "Both make the act of looking do the damage: a lens that kills what it films, and a painting that pulls the woman studying it out of the room and leaves her defenceless in front of the man who has been watching her look."),
  r("the stendhal syndrome", "repulsion", "rhyme", "none", 0.55, 0.38,
    "A woman's collapse rendered as the architecture around her rather than as a diagnosis — walls that give, rooms that will not hold their dimensions — with the film staying inside the failure instead of examining it from outside."),

  /* ---------- the blade, the ceremony, and the class that takes over ---------- */
  r("gintama the movie", "the sword of doom", "descent", "b", 0.6, 0.42,
    "The cursed blade that consumes whoever holds it, filmed as possession rather than as swordplay: the fighter's own body wrecking itself to feed the weapon while the technique keeps getting better."),
  r("gintama the movie", "hail caesar", "convergence", "none", 0.55, 0.4,
    "Both put the business itself on screen — one from the studio fixer's side keeping the product moving, the other by letting its cast step outside the film and haggle with the distributor over whether a sequel is worth making."),
  r("taira clan saga", "the 47 ronin", "rebuttal", "a", 0.6, 0.46,
    "Mizoguchi filmed the samurai code under wartime commission as obedience unto death; thirteen years after the defeat he filmed the moment that same class first took power from a court that despised it, and gave the young warrior the sympathy."),
  r("taira clan saga", "the leopard", "convergence", "none", 0.58, 0.44,
    "The hinge where one ruling class hands over to another, filmed as ceremony instead of battle — a court procession met by armed monks, a ball that runs for an hour — with the new men's manners doing the historical argument."),

  /* ==================================================================
     NINTH PASS. Aimed at films that arrived in the 2,204-film harvest
     carrying twenty edges of record coincidence and no authored claim
     at all — the tranche where the measured trivia share went back up.
     Selection rule inside that tranche: write only where the plot text
     or the description supports a claim about FORM, and prefer the
     pair whose current connection reads "shares a cinematographer" or
     "both are 1970s thrillers", since displacing one of those is worth
     more than adding a second reading to a film that already has six.
     One film in the set (Krull) is skipped: nothing in the corpus
     evidences a formal claim about it that would not be invented.
     ================================================================== */

  /* ---------- the firm succeeds, the household does not ---------- */
  r("le clan des siciliens", "the godfather", "convergence", "none", 0.62, 0.44,
    "Both films let the business run perfectly and the family fail: the score goes exactly to plan — an airliner full of jewels hijacked in mid-flight and put down on an unopened stretch of motorway — and the clan is destroyed instead by a domestic betrayal that costs nothing, exposed at a dinner table by a six-year-old repeating what he saw. In both, the patriarch personally sentences a member of his own household, and in both the execution is filed as maintenance."),
  r("le clan des siciliens", "rififi", "descent", "b", 0.6, 0.44,
    "The same novelist's underworld fifteen years on and scaled up out of all recognition: Le Breton's earlier gang spend half an hour in silence around one hole in one ceiling, this one runs Rome, Paris and New York and takes an aircraft. What survives the inflation is the failure mode — both crews are undone not by police work but by one member who cannot keep away from a woman, and both films spend their last reel on the tidying rather than the theft."),

  /* ---------- the procedural, and what it does with the criminal ---------- */
  r("castle of sand", "high and low", "convergence", "none", 0.62, 0.46,
    "Two Japanese procedurals that spend their length on legwork — timetables, dialect maps, doors knocked on in the wrong prefecture — and then hand the ending to the criminal's biography instead of to his capture. One closes on class hatred spoken through prison glass; the other lays the detective's summation over a wordless flashback of a father and son begging their way round the coast, scored by the concerto the murderer is premiering in another building at that same hour."),
  r("castle of sand", "memories of murder", "rebuttal", "b", 0.6, 0.42,
    "The Japanese procedural's faith in shoe leather — one mispronounced syllable chased across the country until it yields a name and a childhood — answered by a Korean film that runs the identical exhaustive method and gets nothing at all, and ends with the detective looking into the lens because there is no one left to look at."),

  /* ---------- the town rebuilt indoors ---------- */
  r("cannery row", "one from the heart", "convergence", "none", 0.58, 0.42,
    "Two 1982 American pictures that refused to shoot the real place and built it whole inside a sound stage instead — a Monterey cannery front lit by Sven Nykvist, a Las Vegas strip lit by Vittorio Storaro — so that in both the town is openly a memory of a town rather than a location. Both were received as extravagance rather than as the choice they were, and both films are only legible if you accept the artifice as the point."),

  /* ---------- the newsroom that makes a person ---------- */
  r("it could happen to you", "network", "rhyme", "none", 0.5, 0.34,
    "Both films run on a New York newsroom's power to turn one gesture into a public person: a half-joking promise to split a lottery ticket with a waitress, and an anchorman's on-air threat to shoot himself. One lets the readership it manufactured send its money back and rescue the couple; the other keeps its man alive exactly as long as he performs, and has him shot on camera when the numbers drop."),

  /* ---------- the raid, and the illness kept off screen ---------- */
  r("arrietty", "rififi", "rhyme", "none", 0.58, 0.42,
    "The first borrowing is staged with a heist's grammar: a pin used as a grappling hook, double-sided tape for the climb, one permitted item per trip, and a rule that being seen even once ends the career. Both sequences run almost without dialogue, both make the tools legible before they are used, and both let one dropped object — a sugar cube, a loosened fitting — do the work of a scream."),
  r("arrietty", "my neighbor totoro", "rhyme", "none", 0.58, 0.42,
    "Two Ghibli films that keep the illness just off screen — a mother in a hospital bed, a boy waiting on heart surgery with poor odds — and put the fantasy precisely in the gap the waiting leaves. Neither creature cures anything; what they offer is a way of passing the time, and both films are careful to end with the child still facing the thing they were facing at the start."),

  /* ---------- one actor as the whole pantheon ---------- */
  r("7 faces of dr lao", "dr strangelove", "convergence", "none", 0.56, 0.4,
    "Two 1964 American comedies that hand a single actor every face of the crisis: Tony Randall under seven sets of prosthetics as the entire mythology an Arizona town needs in order to see itself, Peter Sellers as three of the men steering a nuclear exchange. In both the multiplication is the argument — there is only one performer available, so the town or the world is being lectured by the same man wearing different heads."),

  /* ---------- the patter as the symptom ---------- */
  r("the pick up artist", "uncut gems", "rhyme", "none", 0.54, 0.36,
    "A man who cannot stop talking, where the patter is not the trade but the symptom — rehearsed in a car between approaches, or run down a phone line between deals — and a film that finally converts it into one number that has to come up. Both settle the whole plot at a table with money that was raised by liquidating everything else the man owned."),

  /* ---------- the redundancy handled as a hiring problem ---------- */
  r("no other choice", "monsieur verdoux", "convergence", "none", 0.68, 0.5,
    "A devoted family man laid off from a respectable job who turns the removal of other people into his new profession, keeps the household in another room and never tells them, and performs the killings as diligent office work — a shortlist drawn up, each candidate researched, the practical problem of the body treated as an administrative task. Both films end by pointing out that the murderer's employers did it at a scale he could not reach."),
  r("no other choice", "parasite", "rhyme", "none", 0.6, 0.44,
    "Two Korean films in which a household conspires to take jobs that are already occupied, and in which the wife's decision to go along is the real turn. One removes each incumbent with a forged reference and a peach; the other simply shoots them. Both end with a body under the family's own ground, an improved standard of living, and everybody agreeing not to mention it."),

  /* ---------- the mother who will only say it in character ---------- */
  r("the truth 2019", "autumn sonata", "rebuttal", "a", 0.64, 0.46,
    "The great-artist mother and the daughter's ledger of grievances, replayed on a film set. Bergman puts his pianist and her daughter in one house for one night and lets the accusation land directly, in the room; Koreeda makes both women act instead, so the reckoning only becomes sayable when the mother is playing somebody else's mother in a science-fiction picture and the daughter, who wrote the scene, is standing off camera feeding her the lines."),
  r("the truth 2019", "still walking", "rhyme", "none", 0.58, 0.42,
    "Koreeda's Japanese households argue by preparing food and let the grievance go unspoken through an entire visit. Moved to Paris with French actors, the accusations arrive out loud within ten minutes — so he builds a film set inside the film and puts the unsayable part back where the rest of his work keeps it, in a scene the characters are only pretending to mean."),

  /* ---------- Carmen, twice, in one year ---------- */
  r("first name carmen", "carmen", "convergence", "none", 0.6, 0.44,
    "Two Carmens a year apart that agree on nothing. Rosi films the opera whole, on location in Andalusia with real singers and the score performed as written; Godard throws the singing out entirely and replaces it with a string quartet visibly rehearsing late Beethoven — stopping, restarting, arguing over a bar — so the music arrives as unfinished work rather than as a number, and the story around it is a bank robbery."),
  r("first name carmen", "bande a part", "descent", "b", 0.58, 0.42,
    "Godard's heist rebuilt twenty years on with the amateurism moved from the robbers to the film. The earlier gang are three innocents running the Louvre and dancing in a café; this one uses a film shoot as the cover story until nobody on screen can tell whether they are robbing a bank or shooting a scene about robbing one — and the only people in the building who know exactly what they are doing are four musicians rehearsing in the next room."),

  /* ---------- the camp, and what escape is for ---------- */
  r("stalag 17", "a man escaped", "convergence", "none", 0.6, 0.44,
    "Two prison films that agree escape is a craft and disagree completely about what it is for. Bresson gives it to one man's hands in near-silence and films the scraping of a door frame as prayer; Wilder gets two escapees shot in the opening minutes and spends the rest of the picture in a barracks run as a black market, where the real hunt is not for the wire but for whoever is selling the plans."),
  r("stalag 17", "sunset boulevard", "rhyme", "none", 0.58, 0.42,
    "Wilder used the same actor twice as a man who says out loud that he is for sale and is despised for the honesty — a screenwriter kept by an older woman in a Sunset mansion, a sergeant running a distillery and a viewing telescope inside a prison camp. Both films make him the only person in the room telling the truth and then charge him for it: one goes out through the tunnel with the man he was accused of betraying, the other face down in the pool he is narrating from."),

  /* ---------- Lang puts a crowd in the dock ---------- */
  r("fury", "m", "rebuttal", "a", 0.7, 0.5,
    "Lang tried the mob twice. In Berlin the criminals convene their own court and the child-murderer is given a plea good enough to hear; in his first American film the crowd that burned a jail is put in a real dock, and the evidence against them is a newsreel — run, stopped and enlarged frame by frame until each grinning face can be named aloud. The first film asks you to feel a lynch mob's logic from inside; the second makes the camera the witness for the prosecution."),
  r("fury", "blowup", "rhyme", "none", 0.56, 0.4,
    "The photographic image pushed past its own resolution to make it give up a face. One film stops a newsreel of a lynching in open court and blows it up until every bystander is identifiable; the other enlarges a park photograph until the body dissolves into grain and the photographer is left with nothing he can show anyone. One trusts the negative to convict, the other discovers it cannot."),

  /* ---------- the director assembled out of other people's cameras ---------- */
  r("the other side of the wind", "8", "rebuttal", "a", 0.66, 0.48,
    "The blocked director surrounded by people who want something from him, filmed from opposite sides of his skull. Fellini gives Guido an interior — daydream, harem, childhood — and lets us live in it; Welles denies Hannaford one entirely, assembling the whole birthday out of the guests' own cameras in a dozen film stocks, gauges and aspect ratios, so the man exists only as footage other people shot of him and never once gets a scene alone."),
  r("the other side of the wind", "citizen kane", "descent", "b", 0.64, 0.46,
    "Welles built the same machine at both ends of his career and reversed its polarity. Kane is a man assembled after death out of newsreel and the accounts of people who knew him, and the film keeps promising a key; Hannaford is assembled while still alive out of the party guests' handheld cameras, and there is no key, no reporter and no last word — only the footage, and the fact that everyone pointing a camera at him wants to become him."),

  /* ---------- the Italian house after the men ---------- */
  r("let s hope it s a girl", "the leopard", "rebuttal", "a", 0.62, 0.45,
    "The Italian noble house filmed twice as it goes under. Visconti gives the prince a ballroom and an hour of elegy and lets the class die with its dignity intact; Monicelli takes the same decaying estate, kills the count off the side of a cliff in a vintage convertible while a senile uncle releases a pigeon, and ends with the household — daughters, niece, housekeeper, the dead man's creditor-mistress — sitting down to dinner and deciding to keep the place by farming it."),
  r("let s hope it s a girl", "my friends", "rebuttal", "a", 0.58, 0.42,
    "Monicelli's Tuscany twice, with its men and without them. In the earlier film five middle-aged friends organise their whole lives around elaborate pranks and staying out of the house, and the women are an off-screen nuisance; here the men are dead, senile, bankrupt or asking for money, the camera never leaves the villa they failed to keep, and the joke lands the other way round — the household that survives is the one they spent their lives avoiding."),

  /* ---------- the identity taken over by lease ---------- */
  r("single white female", "the tenant", "rhyme", "none", 0.62, 0.45,
    "The lease as the mechanism of possession: someone moves into a space still shaped by its previous occupant and is gradually filled in by them. Polanski's tenant inherits a dead woman's flat, then her dress and wig, then her fall; Schroeder's roommate inherits a living woman's haircut first, then her wardrobe, then her name in a bar and the man who answers to it. In both the transformation is done entirely through hair and clothes, and in both the other residents notice nothing."),
  r("single white female", "3 women", "rhyme", "none", 0.58, 0.4,
    "Altman's Pinky copies her roommate's diary, signature and name until the older woman is simply displaced, and lets the swap happen in desert dream logic that is never explained. Schroeder puts the identical theft into an apartment thriller and gives it a mechanism you can buy — a salon appointment, a duplicate dress, a cut key — which makes the copying legible and turns the ending into a chase down a basement stair."),

  /* ---------- Wenders looking for his fathers ---------- */
  r("tokyo ga", "tokyo story", "descent", "b", 0.7, 0.52,
    "A film that goes to Tokyo looking for the city in Ozu's films and cannot find it — pachinko halls, rooftop driving ranges, wax food being moulded for restaurant windows — and finds the ancestor instead in an old man and a piece of equipment: Ozu's cameraman setting up the special low tripod, showing exactly how far off the floor the camera sat for thirty years, and then breaking down."),
  r("tokyo ga", "sans soleil", "convergence", "none", 0.64, 0.46,
    "Two foreign essayists in the same Tokyo within a year of each other, both assembling the city out of pachinko parlours, sleeping commuters and ceremonies performed over broken objects — and dividing on what they came for. Marker never claims to be looking for anything he could fail to find; Wenders arrives with one dead father to locate and spends the film admitting the search is not going to work."),
  r("tokyo ga", "lightning over water", "rhyme", "none", 0.62, 0.46,
    "Wenders filmed his cinematic fathers twice in five years: once at a bedside, with a dying director staging his own last scene for the camera and the film unable to settle whether that is collaboration or extraction; once at the grave, with the director long dead and only a surviving cameraman and a tripod left to interview. The first cannot look away and the second has nothing left to look at."),

  /* ---------- the professional walks into it ---------- */
  r("the professional", "le samourai", "rhyme", "none", 0.58, 0.4,
    "The French professional walks knowingly into the ambush his own side has arranged, and the film hands the last word to the music rather than to him: Melville's hitman raises an unloaded gun in a nightclub so the police will fire, Lautner's agent completes the assassination he was recalled from, reaches the helicopter and is shot in the back on the tarmac while the score arrives in place of a line. Both suicides are filed as competence."),

  /* ---------- the emperor, near and far ---------- */
  r("war and peace", "napoleon", "rhyme", "none", 0.56, 0.4,
    "The same emperor filmed from opposite ends of the telescope. Gance builds his entire apparatus around Bonaparte — cameras strapped to horses and sledges, the frame finally opening into three panels so one man can fill the horizon; Vidor keeps him a small distant figure crossing a field with a spyglass, and gives the wide screen instead to a bespectacled civilian in a pale coat wandering through Borodino with no idea what he is looking at."),

  /* ---------- the show finishes ---------- */
  r("pret a porter", "nashville", "rhyme", "none", 0.6, 0.44,
    "Altman's ensemble machine pointed twice at an industry that can absorb anything: a country-music week that ends with the crowd singing through an assassination, and a fashion week that ends with a designer sending every model down the runway with no clothes on. In both the outrage is scheduled as the finale, and in both the show finishes and the applause is real."),
  r("pret a porter", "blowup", "rhyme", "none", 0.56, 0.4,
    "A death that refuses to become a plot, inside a business too busy photographing itself to follow it up. Antonioni's photographer enlarges a corpse out of a park and then loses it; Altman opens by choking the head of the fashion council to death in the back of a car and lets the murder inquiry dissolve into fittings, parties and a hotel room. In both, the shoot carries on, and nobody with the power to care does."),

  /* ---------- Ōshima's two crimes ---------- */
  r("empire of passion", "in the realm of the senses", "rebuttal", "a", 0.7, 0.5,
    "Ōshima's two films with the same actor, two years apart, take the same crime in opposite directions. The first seals the couple into a rented room and lets the outside world — an army marching past the window — become genuinely irrelevant; the second has them murder the husband and stay in the village, where the world comes for them in the form of neighbours' questions, a patient policeman, and a dead man who keeps turning up pulling his own rickshaw."),
  r("empire of passion", "the postman always rings twice", "rhyme", "none", 0.6, 0.44,
    "Two lovers kill the husband and are then finished off by the thing they cannot dispose of. In Rafelson's it is suspicion — each begins to read the other as the next candidate; in Ōshima's it is literal, a murdered rickshaw man still arriving for fares, so the guilt is not a private mental state but a passenger the whole village can see and gossip about."),

  /* ---------- the affair with a departure time ---------- */
  r("terminal station", "brief encounter", "convergence", "none", 0.66, 0.48,
    "The affair confined to a railway terminus and timed by the departure board: two films in which the lovers are never once alone, because every scene has to be played in a public concourse under other people's eyes, and it is the clock rather than any moral argument that ends it. Lean's couple have a refreshment room and a Rachmaninoff record; De Sica's have the whole of Roma Termini, a goods wagon and a police office, and are caught."),
  r("terminal station", "bicycle thieves", "descent", "b", 0.62, 0.44,
    "The same director and the same screenwriter running neorealism's method against Hollywood's, five years apart. The earlier film uses non-professionals in real streets so that nothing can look staged; this one keeps the real station and the real crowd and puts Jennifer Jones and Montgomery Clift at the centre of it — and the method turns on itself, because a terminus full of genuine strangers is exactly what makes two stars look like a set-up."),

  /* ---------- the father who performs his own standing ---------- */
  r("champagne", "i was born but", "rhyme", "none", 0.56, 0.4,
    "Two late-silent comedies in which a father stages his own standing for a child, and it collapses in opposite directions. Ozu's boys watch home-movie footage of their father clowning for his boss and lose him on the spot; Hitchcock's millionaire invents the loss of the family fortune to teach his daughter a lesson, watches her take a job in a restaurant and turn out to be good at it, and when the lie is exposed it is the father who comes out smaller."),

  /* ---------- the game that is the film's own structure ---------- */
  r("chinese roulette", "last year at marienbad", "rhyme", "none", 0.62, 0.45,
    "A great house, a camera that never stops gliding past glass and mirrored surfaces, and a game with rules announced aloud that turns out to be the film's own structure. Resnais's guests play a matchstick game the narrator always wins; Fassbinder's are assembled for a weekend by the disabled child who arranged the whole gathering and made to play a guessing game about each other — and the answer she extracts about her mother is the only thing anybody in either film says plainly."),
  r("chinese roulette", "the exterminating angel", "rhyme", "none", 0.54, 0.38,
    "Buñuel's guests physically cannot leave the drawing room; Fassbinder's can leave whenever they like and stay anyway, because the game is more interesting than the door. The same joke about polite society, turned from a trap into an experiment its subjects volunteer for and then cannot stop running."),

  /* ---------- the centenary, celebrated and mourned ---------- */
  r("one hundred and one nights", "sunset boulevard", "rhyme", "none", 0.66, 0.48,
    "The ruined star in the big house with the devoted majordomo and a young hireling engaged to keep them company — except Varda's centenarian is not a forgotten actress but cinema itself, played by Piccoli under a hundred years of make-up, memory failing, mistaking himself for other people, while real stars queue at the gate to be received. Wilder's mansion is a mausoleum; Varda's is a birthday party that keeps tipping over into a diagnosis."),
  r("one hundred and one nights", "goodbye dragon inn", "rebuttal", "b", 0.62, 0.45,
    "Cinema's hundredth birthday marked twice and incompatibly. One is a château outside Paris where Depardieu, Deneuve, Delon and Mastroianni arrive in person to pay court to a century personified as a rich old man with a fortune to leave; the other is a leaking Taipei picture palace on its final night, three people in the auditorium and nobody to say goodbye to. One assumes cinema is a person with a guest list; the other films the building and lets the absence do the work."),
  r("one hundred and one nights", "the other side of the wind", "convergence", "none", 0.56, 0.4,
    "Two films that hire the industry to play itself around a dying patriarch of cinema: Welles fills a Hollywood birthday with real directors and critics circling a man whose picture cannot be finished, Varda fills a château with stars paying court to a hundred-year-old who is cinema in person. In both, the young are there for the estate — one to get a feature completed, one to get a short film funded — and in both the old man's memory is the only thing anybody actually wants."),

  /* ---------- the memory that finishes at the moment of killing ---------- */
  r("death rides a horse", "once upon a time in the west", "rhyme", "none", 0.62, 0.45,
    "The revenge western built on an image the film refuses to complete: a massacre witnessed in childhood returns in short flashes drenched in red, each one giving up one more identifying detail — a skull tattoo, an earring, a scar on the throat — so the plot is an act of recognition rather than a manhunt, and the memory only runs to the end at the moment the last man is killed. Leone did it a year later with a harmonica and a brother standing on a man's shoulders."),
  r("death rides a horse", "for a few dollars more", "rhyme", "none", 0.58, 0.42,
    "Lee Van Cleef twice inside two years as the same figure: the older gunman who attaches himself to a younger one on the same trail and conceals until very late that he has his own account to settle with the men they are both hunting. In both films the partnership is really a competition over who has the better right to the killing, and in both the younger man has to be told to stand down."),

  /* ---------- the actor doubled, the narrator dead ---------- */
  r("legend 2015", "dead ringers", "rhyme", "none", 0.6, 0.44,
    "One actor doubled so that the film's central relationship is a performance played opposite himself, and both films make the technically hardest shot — the two brothers sharing a frame, touching, fighting — carry the emotional weight. In both, the twin who cannot function is the one who destroys the pair, and the functioning one's tragedy is that leaving was always available to him and he never takes it."),
  r("legend 2015", "sunset boulevard", "rhyme", "none", 0.58, 0.42,
    "Both films are narrated by someone who is already dead, and both use it to compromise the audience. Wilder's screenwriter speaks from the pool he is floating in, so the cynicism is retrospective and paid for; Helgeland's narrator is the wife the film shows being ground down and killed, which means the East End glamour is being sold to you in the stolen voice of its principal victim."),

  /* ---------- Taipei 1994, twice ---------- */
  r("a confucian confusion", "vive l amour", "convergence", "none", 0.64, 0.46,
    "Taipei in 1994 from two directors at once, and the two films are exact negatives. Yang's is nothing but talk — a company, a play, a television show about happiness, every conversation an argument about whether anyone's feeling is genuine or a market position; Tsai's is almost wordless, three people circling an empty apartment none of them has a right to be in, never managing to say anything at all. Both are about a city where property and careers have replaced intimacy: one plays it as overtalk, the other as silence."),
  r("a confucian confusion", "yi yi", "descent", "a", 0.6, 0.45,
    "Yang wrote the same city twice. The farce version gives young professionals in glass offices three days to accuse each other of faking sincerity, and keeps everyone at the speed of an argument; six years later he slows the identical material to one family's year and hands the thesis to a child with a camera, photographing the backs of people's heads so they can see the half of themselves they never can."),

  /* ---------- the death converted into a payment ---------- */
  r("scattered clouds", "a separation", "convergence", "none", 0.62, 0.45,
    "A death converted into a sum of money, and a film that watches what the transaction does to the people at either end of it. Naruse's salaryman kills a man in a road accident, is transferred to the provinces and pays the widow compensation in instalments; she takes it, then takes work at the inn where he is staying, and the payments become the only language the two of them are permitted for something neither will name. Farhadi's families argue in stairwells over whether a sum can settle a death; Naruse's answer is that it can, and that this is the horror."),
  r("scattered clouds", "when a woman ascends the stairs", "rhyme", "none", 0.58, 0.42,
    "Naruse's women are always doing arithmetic. A Ginza bar hostess enters her feelings and her debts in the same ledger; a widow receives her grief as an envelope from the man who killed her husband. In both films money is not the obstacle to the romance but the medium it is conducted in, and the tenderness is in how precisely the film keeps count."),

  /* ---------- London, and the decision not to look ---------- */
  r("frenzy", "peeping tom", "rebuttal", "a", 0.6, 0.42,
    "Two London murder films by the two directors who taught audiences to look, solving the same problem in opposite directions. Powell bolts the camera to the killer's own tripod and makes you watch down the blade; Hitchcock, twelve years later, walks his camera up a staircase to a closed door and then reverses all the way back down, out of the building and into the ordinary noise of a Covent Garden street while the murder happens behind him. The most famous shot in the film is a refusal to look, made by the man who invented the habit."),
  r("frenzy", "m", "rhyme", "none", 0.58, 0.42,
    "A city turned into a manhunt, with the wrong man caught inside it. Lang puts police and underworld on the same search and lets a crowd's certainty nearly destroy an innocent in the street; Hitchcock hangs the killings on a man whose real offence is losing his temper in public, and gives the actual murderer a legitimate trade and a stall in a produce market — so the corpse travels across London in a sack of potatoes, in daylight, on a lorry nobody looks at twice."),

  /* ==================================================================
     NINTH PASS, fourth set. Thirty films from the harvest, chosen
     because their maps were almost entirely record coincidence:
     Nazarín's eight
     edges were six Buñuel credits and two "Mexico, within N years";
     There Was a Father's twenty were three Ozu credits and thirteen
     "Japan, the same moment of each other"; Tess, Panic Room, The
     Cowboys and Working Girl were twenty lines of shared crew apiece.

     Written only where the plot section in pipeline/out/plots.json,
     the description or the TMDB keyword list could actually carry the
     claim. Where the evidence stopped at a premise — no plot section,
     two lines of description — the claim stays below 0.5 and the
     interface says "reading, not record" rather than dressing it up.

     Deliberately weighted across traditions: Ozu against Wenders,
     Mizoguchi against Mike Nichols, Ray against Flaherty, a Hungarian
     apartment against a Manhattan brownstone. A pair inside one
     national cinema is usually already carried by a record edge; the
     pairs the record cannot reach are the ones worth authoring.
     ================================================================== */

  /* ---------- the woman moved between households ---------- */
  r("tess", "the life of oharu", "convergence", "none", 0.62, 0.44,
    "Both are built as a descending ladder of households — a girl sent to a rich family to trade on a name her father has just discovered he owns, a court lady sold down one rung at a time — and both keep the camera far enough back that her ruin registers as a change of address rather than as a scene played for grief."),
  r("tess", "barry lyndon", "rhyme", "none", 0.6, 0.42,
    "The countryside filmed as landscape painting in available light, figures kept small in the field, while the entire plot underneath is a question of whose name will be accepted by whom. In both, the beauty of the frame is what makes the class machinery look like weather rather than like something people decided."),
  r("a geisha", "tess", "convergence", "none", 0.56, 0.4,
    "A young woman is put into a richer house to solve a family's money problem — one sent to claim kinship with the branch that owns the name her father has adopted, one asking to be trained because her mother is dead and her father will not pay — and both films keep the ledger on screen, so what is done to her there arrives as a line in the same account rather than as private misfortune."),
  r("a geisha", "working girl", "convergence", "none", 0.58, 0.42,
    "The apprenticeship that quietly includes being handed to a client: a trainee whose debut is financed by a loan the teahouse expects a businessman to recover in kind, and a secretary sent out in a limousine with a customer who has cocaine and expectations. Both make her refusal cost somebody money, and both keep the arithmetic visible."),

  /* ---------- the affair written up and sold ---------- */
  r("with beauty and sorrow", "persona", "convergence", "none", 0.6, 0.42,
    "A young woman attaches herself to an older artist, sleeps with the man who ruined her and then with his son, and carries out a revenge the older woman has never been willing to want. Made a year apart, in Kyoto gardens and on a Baltic shore, both end unable to say whose feeling has just been acted on."),
  r("with beauty and sorrow", "anatomy of a fall", "rhyme", "none", 0.56, 0.4,
    "The bestseller made out of a lover's catastrophe, produced later as evidence: a novel written from a teenage girl's miscarriage and typed up by the writer's own wife, and a novel read aloud in court by a prosecutor as proof of what its author was capable of."),
  r("something s gotta give", "with beauty and sorrow", "rebuttal", "a", 0.56, 0.4,
    "Turning the affair into a hit is the same device on both sides of the world, with the authorship swapped. There, a novelist mines a teenager's ruined pregnancy for a bestseller his wife types up. Here the woman writes the play, puts the man who walked out in it, and he has to buy a ticket and sit in the audience recognising himself."),
  r("something s gotta give", "all that heaven allows", "rebuttal", "a", 0.58, 0.4,
    "Sirk's scandal — a woman of a certain age wanting the wrong-aged man, judged by her grown children and consoled with a television set — replayed with every objection dropped: the daughter's protest lasts one scene, the fatal illness is moved into the man's chest, and the woman gets a writing desk and a hit instead of the console."),

  /* ---------- the voyage, and the face at both ends of it ---------- */
  r("ulysses", "ugetsu", "convergence", "none", 0.6, 0.42,
    "Two films a year apart in which a man is kept in a beautiful house by a woman who is not human while the wife he left holds his home together, and in both the film is shaped toward the homecoming rather than the enchantment — the marvels are what has to be got through."),
  r("ulysses", "vertigo", "rhyme", "none", 0.55, 0.38,
    "One actress plays both the wife waiting at the end of the voyage and the sorceress who detains him halfway, so what keeps him from home and home itself wear the same face — the doubling a later film would build an entire plot out of, one woman made to play two."),

  /* ---------- the room as a diagram ---------- */
  r("panic room", "night of the living dead", "rebuttal", "a", 0.62, 0.44,
    "Romero's siege turns on one argument — barricade the cellar or hold the ground floor — and he settles it by killing everyone who chose wrong. Here the strongest room in the house is the one the intruders have come for, so the safe place and the prize occupy the same few cubic metres and hiding is not a strategy but the thing that loses."),
  r("autumn almanac", "panic room", "rhyme", "none", 0.55, 0.4,
    "The camera takes up positions no person in the building could occupy — up through the glass of the floor, down between the joists, out through a keyhole — so the flat and the brownstone stop being places to live in and become cutaway diagrams with people stuck inside them."),
  r("autumn almanac", "the exterminating angel", "convergence", "none", 0.6, 0.44,
    "A handful of people in one flat who never manage to leave it, filmed until the apartment's own logic outranks anybody's intentions: one household is held by a rule the film refuses to explain, the other by a mother's money, a lease and a lodger, which bind just as hard."),

  /* ---------- the married man's modern arrangement ---------- */
  r("help me", "contempt", "convergence", "none", 0.6, 0.44,
    "The husband who gives his wife away in principle and cannot survive it in fact: one keeps insisting he does not mind while manoeuvring her into the producer's car, the other announces at the wheel that he is modern enough to permit an affair provided they discuss it openly, and ends up beating her on a beach. Both hand that argument far more running time than any plot needs."),
  r("help me", "jules and jim", "rebuttal", "a", 0.55, 0.36,
    "Truffaut treats the shared arrangement as a genuine invention that only time defeats. Here the same modern tolerance is announced by a husband as evidence of his own sophistication, and lasts exactly as long as it stays hypothetical — the first real Wednesday concert ends it."),

  /* ---------- the detective who declines the genre's romance ---------- */
  r("honey don t", "the maltese falcon", "rebuttal", "a", 0.58, 0.44,
    "Huston's detective is propositioned by everyone in the picture and answers with a speech about what a man has to do. This one is propositioned by everyone too — the homicide cop asks twice, in the same words — and answers 'I like girls' every time, so the running gag is also the genre's romantic engine being quietly switched off."),
  r("honey don t", "the night of the hunter", "rhyme", "none", 0.56, 0.42,
    "The preacher as predator with the congregation as his supply: one is a lone hunter with scripture on his knuckles, the other runs a franchise — four numbered virtues, fellowship conducted in bed, a narcotics route underneath — and in both, the town's willingness to trust a collar is the mechanism rather than the disguise."),

  /* ---------- the father, and what is never said out loud ---------- */
  r("there was a father", "paris texas", "rhyme", "none", 0.6, 0.46,
    "Reconciliation staged as matched movement instead of speech: a father and son casting fishing lines into a river in the same rhythm, and a father and son walking parallel down opposite sides of a road until the boy falls into his step. In both, the warmest scene in the film contains no admission of anything."),
  r("there was a father", "tokyo story", "rebuttal", "b", 0.64, 0.5,
    "Ozu filmed the same separation twice, on either side of a war. In 1942 the son who wants to give up his teaching post to live near his father is told his duty is where he was placed, and the film agrees with the father. Eleven years later, children who stayed at their posts while the parents came to visit are the tragedy."),

  /* ---------- the cell, and the signature at the end of it ---------- */
  r("the confession", "a man escaped", "rebuttal", "a", 0.62, 0.46,
    "Bresson's cell is a workshop: every sound, hour and scrap of metal is inventory, and the prisoner's close attention is what gets him out. Here the identical attention — paces counted, hours without sleep, the walking, the bread — is the machinery taking a man apart, and there is nothing in the room to build."),
  r("the confession", "the passion of joan of arc", "rhyme", "none", 0.58, 0.44,
    "Both films end at a signature. Dreyer's girl puts her name to the abjuration, takes it back, and burns. The party man signs everything, performs it word-perfect in court, survives, and is left to go on living as the author of a text he does not believe."),

  /* ---------- the western, and who is handed the gun ---------- */
  r("the cowboys", "shane", "rebuttal", "a", 0.64, 0.48,
    "Shane sends the boy indoors and rides off carrying the killing so the child will not have to. Here the man is shot dead two-thirds of the way through and the schoolboys finish the cattle drive and the revenge themselves, with the film staging their first killings as the completion of the education he began."),
  r("the patriot", "unforgiven", "rhyme", "none", 0.55, 0.4,
    "The retired killer whose children have never seen what he is: both keep the man's reputation offstage as an atrocity nobody will describe, then stage the return of the skill as something appalling to witness rather than thrilling — here, hatchet work done in front of his two youngest sons."),
  r("the patriot", "the battle of algiers", "rebuttal", "b", 0.6, 0.46,
    "Both put the audience with irregulars against a professional army, then split on the only decision that matters. One gives its militia an atrocity to avenge — a church filled with townspeople and set alight — so that everything they do afterwards reads as clean. The other sends its own sympathetic heroine into a milk bar with a bomb and holds on the faces of the people about to be killed."),

  /* ---------- verse, and the bodies made to say it ---------- */
  r("romeo and juliet", "hamlet", "convergence", "none", 0.56, 0.42,
    "Two attempts to stop Shakespeare sounding like recital, from opposite directions. One casts actors the age of the characters and puts them in the right century, sweating in real streets, so the verse comes out of bodies with nothing to do but feel it. The other keeps every word and moves it into a Manhattan of glass towers and camcorders, where the same lines are spoken by someone with nowhere to put a sword."),
  r("romeo and juliet", "mean streets", "rhyme", "none", 0.56, 0.4,
    "Street fighting that begins as showing off for an audience and turns fatal because nobody can stop performing — a word nobody will let go of, a duel fought like horseplay — and both films keep the comic pitch running straight through the killing, so the death arrives while everyone on screen is still laughing."),

  /* ---------- the autobiography assembled out of film ---------- */
  r("my voyage to italy", "the beaches of agnes", "convergence", "none", 0.6, 0.46,
    "Two directors writing an autobiography out of film itself and choosing opposite places to stand: one never appears, narrating a childhood by playing four hours of other people's pictures the way his family watched them on a small television; the other is in nearly every shot, walking backwards through her own past on a beach she has had dressed with mirrors."),
  r("the beaches of agnes", "8", "descent", "b", 0.58, 0.4,
    "The autobiography staged instead of recalled: the maker walks through purpose-built reconstructions of their own past with the apparatus left in shot — a ring holding everyone he has ever known, a beach dressed with mirrors and a room built out of old film cans — so the film's real subject becomes the difficulty of assembling it."),
  r("life and nothing more", "the beaches of agnes", "convergence", "none", 0.55, 0.4,
    "Two directors who put themselves inside their own films and pick opposite methods: one appears in every shot and rebuilds her past on a beach; the other hires an actor to drive his car and be him, so the self-portrait is delivered by a stand-in and the director exists only as the person the camera is sitting beside."),

  /* ---------- the office tower, measured from outside ---------- */
  r("working girl", "the crowd", "rhyme", "none", 0.6, 0.46,
    "One film cranes up the face of an office tower, in at a window and along a hall of identical desks to find its man at one of them. The other ends by starting on the woman who has finally won a door of her own and pulling back until her lit window is one of ten thousand in the block. The same shot run in opposite directions, arriving at the same verdict."),

  /* ---------- the child and the adult, as one economic unit ---------- */
  r("the kid", "the 400 blows", "rhyme", "none", 0.6, 0.46,
    "The child removed by the authorities in the back of a vehicle, filmed from inside on his face as the street pulls away: one reaches back over the tailgate and is chased across the rooftops to get him back, the other says nothing at all while the lights of Paris go past."),
  r("the kid", "bicycle thieves", "descent", "a", 0.6, 0.42,
    "The man and the small boy working a hostile city as a single economic unit — the child who breaks the windows the adult is paid to mend, the child who watches the adult try to steal a bicycle — and in both, the man's humiliation is played on the boy's face rather than his own."),
  r("tom sawyer", "the night of the hunter", "rhyme", "none", 0.55, 0.4,
    "The American river as the only jurisdiction a child can reach: boys who have watched a murder pushing a raft out onto the Mississippi while the town below tries the wrong man for it, and children drifting down the Ohio with the killer still singing somewhere behind them."),
  r("tom sawyer", "the third man", "rhyme", "none", 0.52, 0.36,
    "A funeral held for someone who is not dead: boys slipping into the back of the church to hear what the town says about them, and a racketeer who supplied a substitute corpse so the mourners would let him go on working. In both, the service is where the film weighs what the missing man was actually worth."),
  r("flight of the red balloon", "the 400 blows", "rhyme", "none", 0.5, 0.36,
    "The Paris child who has learned to run his own day around the adult who is the one actually in crisis — the film keeps to his height, so the parent's shouting arrives the way weather does, from somewhere above the top of the frame."),

  /* ---------- the cargo nobody in the car knows about ---------- */
  r("the sucker", "touch of evil", "rhyme", "none", 0.58, 0.44,
    "Welles opens by loading a car with something its occupants know nothing about and holds the shot until crossing a border is unbearable. This runs the identical device for ninety minutes as farce: a Cadillac packed with gold, heroin and a diamond driven across Europe by the one man in the film who has not been told, so every customs post is a punchline instead of a detonation."),
  r("the sucker", "the wages of fear", "rebuttal", "a", 0.55, 0.36,
    "Clouzot's drivers know exactly what is in the truck, and every metre of road is calculated against that knowledge. Here the cargo is just as lethal and the driver has simply not been informed, so the same journey becomes weather he passes through — the road-cargo thriller with the knowledge taken out of the man at the wheel and given entirely to us."),

  /* ---------- the brother, the parent, and the unreadable work ---------- */
  r("tetro", "rumble fish", "descent", "b", 0.62, 0.5,
    "Coppola's brother picture run again twenty-six years later: a younger boy arriving in a city to attach himself to an older brother who has withdrawn into his own legend, shot in high-contrast black and white with colour held back for whatever is remembered, dreamed or performed."),
  r("tetro", "la luna", "convergence", "none", 0.55, 0.4,
    "The celebrated musician as the parent who uses up all the air in the house: an opera singer in Rome teaching her son to sing while he comes off heroin, and a conductor whose son writes his own work in mirror script, so the child's art is built to be unreadable by the parent it is aimed at."),

  /* ---------- the guest, and who is entitled to do the examining ---------- */
  r("the stranger", "teorema", "convergence", "none", 0.6, 0.44,
    "The visitor who arrives in a comfortable household and, largely by declining to explain himself, turns the family's own assumptions into the film's subject: one takes each of them to bed in turn, the other simply refuses to produce proof of who he is — and in both it is the hosts, not the guest, who come apart."),
  r("the stranger", "nanook of the north", "rebuttal", "a", 0.58, 0.42,
    "The ethnographic frame turned around. A camera goes north and has a family stage their own daily life for an audience that will never meet them; here the anthropologist comes back from exactly that kind of fieldwork into a Calcutta drawing room and is cross-examined for a whole film by the educated class that normally does the examining."),

  /* ---------- the same ruins, lit two ways ---------- */
  r("without pity", "bicycle thieves", "rebuttal", "a", 0.58, 0.4,
    "The same wrecked Italy in the same year, lit two ways. De Sica keeps to daylight errands and refuses his film a plot; here the identical locations and untrained faces are lit like an American crime picture, so the ruins acquire shadows, a pistol, and a couple with somewhere to drive."),
  r("without pity", "paisa", "convergence", "none", 0.58, 0.42,
    "The one relationship post-war Italian cinema could film and Hollywood could not — a Black American soldier and an Italian who owns nothing — arriving twice within two years: once as a single episode that ends when he sees the cave the boy who robbed him lives in and walks away, and once stretched to a whole film, with a stolen car and a cliff at the end of it."),

  /* ---------- glass, reflection, and the flat as a stage ---------- */
  r("flight of the red balloon", "playtime", "rhyme", "none", 0.58, 0.44,
    "Paris filmed through glass, so the reflection of the street lies on top of the room's interior and you are never allowed to settle on one plane: a monument that exists only in the swing of a glass door, a balloon that appears in a window above a woman shouting into a telephone."),

  /* ---------- the fairy tale that keeps its cruelty ---------- */
  r("peau d ane", "valerie and her week of wonders", "convergence", "none", 0.6, 0.44,
    "Two 1970 films that keep the incest inside the fairy tale rather than cleaning it out — a girl pursued by her own father, a girl pursued by the elder who calls himself her grandfather — and both stage it in flat pastel daylight with talking animals and magic rings, so nothing is ever marked as the unreal part."),
  r("peau d ane", "black moon", "rhyme", "none", 0.55, 0.4,
    "The machinery of the present left standing inside the fairy tale with no comment offered: a fairy godmother who arrives by helicopter and a prince who quotes a poet born three centuries after him; a girl who drives a car through a war into a house where the unicorn talks and the old woman upstairs works a radio."),

  /* ---------- the sacred, staged without a change of register ---------- */
  r("hail mary", "the passion of joan of arc", "convergence", "none", 0.58, 0.44,
    "A young woman whose body is the site of a claim nobody else can check, held in close-up while the men around her — clerics, a doctor, the man engaged to her — demand that she account for it in their vocabulary, and the film gives them nothing to work with."),
  r("hail mary", "teorema", "convergence", "none", 0.55, 0.4,
    "The sacred dropped into a completely secular modern setting with no change of register to help you — no lighting cue, no music: the annunciation delivered by a man who turns up in a taxi at a filling station, the visitation conducted in the spare bedroom of a Milanese villa."),

  /* ---------- the operation, and the argument about what it was for ---------- */
  r("ogro", "rififi", "rhyme", "none", 0.58, 0.44,
    "Political assassination filmed as a heist: weeks of tunnelling under a Madrid street measured out in sacks of soil, a rented basement, and the fear of a sound carrying up through the pavement — the same near-wordless attention to hands and tools that a safe-cracking sequence runs on, pointed at a car instead of a jeweller's."),
  r("ogro", "the war is over", "convergence", "none", 0.56, 0.42,
    "Two films about clandestine work against the same regime, thirteen years apart. One follows a man carrying forged papers into Spain who privately knows his organisation's certainties expired years ago; the other is the operation those certainties finally produced, with a coda in which the survivors cannot agree what it was for."),

  /* ---------- the village, the soldiers, and the beautiful blast ---------- */
  r("welcome to dongmakgol", "seven samurai", "descent", "b", 0.6, 0.44,
    "Kurosawa's closing arithmetic run again: the fighting men are wanted by nobody, are fed by the village, die defending it, and the farmers who never asked for them go on planting. Here the swords are a North Korean squad and a South Korean squad, who have to be marooned together and disarmed by the villagers' total ignorance of the war before either side is any use to anyone."),
  r("welcome to dongmakgol", "zabriskie point", "rhyme", "none", 0.52, 0.38,
    "The explosion filmed as a slow-motion shower of plenty — a desert house and the contents of its refrigerator coming apart against blue sky, a village's entire winter store of corn falling back to earth as popcorn — with the image at its most beautiful exactly where the damage is worst."),

  /* ---------- the appetite that outlives the catastrophe ---------- */
  r("life and nothing more", "bicycle thieves", "convergence", "none", 0.58, 0.44,
    "The catastrophe interrupted by an appetite the film refuses to treat as a distraction: a father spending the last of his money on a restaurant meal for his son, and survivors two days after an earthquake raising an aerial over the tents so they can watch the World Cup. In both, the ordinary want is offered as the answer rather than as relief from it."),

  /* ---------- the priest whose ministry does not work ---------- */
  r("nazarin", "diary of a country priest", "convergence", "none", 0.6, 0.46,
    "The priest whose ministry visibly fails everyone he offers it to, filmed with no suggestion that a better priest would have done better: one is refused at every door in his parish and writes it down; the other walks out of his parish altogether and is followed by two women who convert him into the miracle-worker he keeps denying he is."),
  r("nazarin", "pickpocket", "convergence", "none", 0.58, 0.46,
    "Two 1959 films that end on a gift the man cannot account for. One takes a hand through the bars as grace and says so outright. The other is offered a pineapple by a fruit seller on the road to prison, refuses it twice, accepts it, and is led away in a confusion the film declines to resolve for him."),
  r("nazarin", "winter light", "convergence", "none", 0.55, 0.42,
    "The clergyman measured entirely by the one person in front of him who needs help, and failing: a pastor who talks a frightened man into going home and shooting himself, and a priest whose charity produces a brawl on a building site, a burnt room, and a fever that breaks only after somebody else's superstitious rite."),


];

/* ---------- assemble ---------- */
const films = corpus.films;
const missing = [];
const seen = new Set();
const edges = [];
for (const e of EDGES) {
  if (!films[e.a] || !films[e.b]) { missing.push(e.a + " -> " + e.b); continue; }
  const sig = [e.a, e.b].sort().join("|") + "|" + e.type;
  if (seen.has(sig)) continue;
  seen.add(sig);
  edges.push(e);
}

/* curated palettes carried forward from the previous readings file */
const prev = JSON.parse(fs.readFileSync(path.join(ROOT, "static", "readings.json"), "utf8"));

const out = {
  note: "Authored layer: attested (someone involved said so, with attribution) and " +
        "reading (interpretive, arguable). Records are derived by the pipeline and " +
        "live in pipeline/out/spine.json. Written for a general audience: name the " +
        "specific thing, but let someone who has not seen the film picture it.",
  palettes: prev.palettes || {},
  edges: edges,
};
fs.writeFileSync(path.join(ROOT, "static", "readings.json"), JSON.stringify(out, null, 1));

const att = edges.filter((e) => e.source === "attested").length;
console.log("written   : " + edges.length + " edges  (attested " + att + " / reading " + (edges.length - att) + ")");
if (missing.length) { console.log("\nunknown film keys (skipped):"); missing.forEach((m) => console.log("  - " + m)); }
console.log("\nwrote static/readings.json");
