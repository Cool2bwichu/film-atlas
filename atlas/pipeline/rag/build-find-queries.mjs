#!/usr/bin/env node
/* build-find-queries.mjs — WRITE find-queries.json, AND REFUSE TO WRITE IT IF ANY
 * EXPECTED FILM IS NOT IN THE CORPUS.
 *
 *   node atlas/pipeline/rag/build-find-queries.mjs
 *
 * The 120 queries and their expected answers are the literal content of this
 * file. It exists rather than a hand-edited JSON because the expectations are
 * the part that has to be right: a coverage number measured against a wrong
 * answer key is a wrong number that looks like a measurement.
 *
 * The first run of this script named 518 films across 120 expectations and 44
 * of them were not in the corpus at all — Casablanca, Pulp Fiction, Die Hard,
 * Reservoir Dogs, The Best Years of Our Lives, Zodiac, The Manchurian
 * Candidate, Amadeus, All About Eve, Kiss Me Deadly and 34 others. That is an
 * 8.5% error rate in an answer key written by someone who knows the films, and
 * every one of those errors would have shown up later as a search failure that
 * was actually a corpus absence. The check at the bottom is the whole point of
 * the file; it exits non-zero rather than writing a set it cannot stand behind.
 *
 * READS   atlas/static/corpus.json   (read-only — never written by this script)
 * WRITES  atlas/pipeline/rag/find-queries.json
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const A = { corpus: JSON.parse(fs.readFileSync(path.join(ROOT, "atlas/static/corpus.json"), "utf8")) };


const Q = [];
const add = (o) => Q.push(o);

/* ══ 1. PERSON — a named human, cast or crew. The record layer's home ground. ══ */
add({ id:"q001", q:"matt damon", kind:"person",
  asks:"a performer by name, typed bare",
  answerShape:"set", expectAll:11,
  expect:["Interstellar (2014)","The Departed (2006)","Saving Private Ryan (1998)","True Grit (2010)","Courage Under Fire (1996)"],
  good:"All 11 films he appears in, as an unranked set. Anything less is a miss; anything more is a false positive.",
  hazard:"Returning films merely 'about America' or 'starring a movie star'." });

add({ id:"q002", q:"setsuko hara", kind:"person",
  asks:"a performer most of the corpus's Ozu and Naruse films run through",
  answerShape:"set", expectAll:12,
  expect:["Tokyo Story (1953)","Late Spring (1949)","Early Summer (1951)","The End of Summer (1961)","Repast (1951)"],
  good:"Her 12 films. The set is small and unambiguous.",
  hazard:"Widening to 'Japanese postwar family drama' — a superset of ~100 films that answers a different question." });

add({ id:"q003", q:"toshiro mifune", kind:"person",
  asks:"a performer whose corpus spelling carries a macron the typist will not type",
  answerShape:"set", expectAll:32,
  expect:["Seven Samurai (1954)","Rashomon (1950)","Yojimbo (1961)","Throne of Blood (1957)","High and Low (1963)"],
  good:"His 32 films. The corpus stores him as 'Toshirō Mifune'; a search that only matches the macron form scores zero here and that is a real failure, not a trick.",
  hazard:"Zero results. This is the diacritic trap, and it will be typed this way by most people." });

add({ id:"q004", q:"movies with klaus kinski in them", kind:"person",
  asks:"a performer, asked in a full sentence rather than as a bare name",
  answerShape:"set", expectAll:12,
  expect:["Aguirre, the Wrath of God (1972)","Fitzcarraldo (1982)","Nosferatu the Vampyre (1979)","Woyzeck (1979)","The Great Silence (1968)"],
  good:"The same 12 films the bare name would return. The wrapper words must not change the answer.",
  hazard:"The sentence frame diluting the name until 'movies' dominates and the person is lost." });

add({ id:"q005", q:"shot by roger deakins", kind:"person",
  asks:"a crew member by role — cinematographer, not cast",
  answerShape:"set", expectAll:44,
  expect:["Blade Runner 2049 (2017)","No Country for Old Men (2007)","Fargo (1996)","Sicario (2015)","Barton Fink (1991)"],
  good:"The 44 films the record layer credits him on. Tests that crew roles are reachable, not just cast.",
  hazard:"Reading 'shot' as gunfire and returning action films." });

/* ══ 2. DIRECTOR ══ */
add({ id:"q006", q:"kurosawa", kind:"director",
  asks:"a director by surname alone",
  answerShape:"set", expectAll:44,
  expect:["Seven Samurai (1954)","Rashomon (1950)","Ikiru (1952)","High and Low (1963)","Ran (1985)"],
  good:"His films. Note the honest ambiguity in the record: 29 films list him as director, 44 credit him in some role (writer, editor). Either set is defensible; a mix of both is not.",
  hazard:"Returning samurai films by other directors — Kobayashi's Harakiri, Kobayashi's Samurai Rebellion — which is genre drift dressed as an author." });

add({ id:"q007", q:"films directed by chantal akerman", kind:"director",
  asks:"a director with a very small footprint in this corpus",
  answerShape:"set", expectAll:3,
  expect:["Jeanne Dielman, 23 quai du Commerce, 1080 Bruxelles (1975)","News from Home (1976)","Room 666 (1982)"],
  good:"Exactly three films. A correct answer here is a SHORT answer; padding it to twenty is the failure.",
  hazard:"Padding with slow-cinema neighbours because three results feels too thin." });

add({ id:"q008", q:"tarkovsky", kind:"director",
  asks:"a director by surname",
  answerShape:"set", expectAll:10,
  expect:["Stalker (1979)","Solaris (1972)","Andrei Rublev (1966)","The Mirror (1975)","Ivan's Childhood (1962)"],
  good:"His 10 films in the corpus.",
  hazard:"Returning 'contemplative Soviet-looking films' — Sátántangó, The Turin Horse — which are Béla Tarr." });

add({ id:"q009", q:"wong kar wai", kind:"director",
  asks:"a director whose name is normally hyphenated in the record and rarely by the typist",
  answerShape:"set", expectAll:13,
  expect:["In the Mood for Love (2000)","Chungking Express (1994)","Happy Together (1997)","Fallen Angels (1995)","Days of Being Wild (1990)"],
  good:"His 13 films. The corpus stores 'Wong Kar-wai'; the hyphen must not be load-bearing.",
  hazard:"Zero results from the missing hyphen." });

add({ id:"q010", q:"the coen brothers", kind:"director",
  asks:"a directing pair stored as one compound string, asked by a nickname that is in neither name",
  answerShape:"set", expectAll:16,
  expect:["Fargo (1996)","No Country for Old Men (2007)","The Big Lebowski (1998)","Barton Fink (1991)","A Serious Man (2009)"],
  good:"The 16 films whose director field is the compound string 'Joel Coen, Ethan Coen'. The word 'brothers' appears nowhere in the record, so this only works if the name resolves loosely. The person index disagrees with itself here in an interesting way — Joel is on 24 films and Ethan on 26, because the index also counts editor and screenwriter credits — so 16, 24 and 26 are all defensible answers and a good one picks a rule and says which.",
  hazard:"Returning films about brothers." });

/* ══ 3. GENRE ══ */
add({ id:"q011", q:"film noir", kind:"genre",
  asks:"a genre label that is also a critical category",
  answerShape:"set", expectAll:62,
  expect:["Double Indemnity (1944)","The Big Sleep (1946)","Touch of Evil (1958)","In a Lonely Place (1950)","Sunset Boulevard (1950)"],
  good:"The 62 films tagged film noir. Neo-noir is a separate 61-film tag and mixing the two is a defensible widening only if it is announced.",
  hazard:"Returning anything dark and urban, which is most of the corpus's American 1940s-70s output." });

add({ id:"q012", q:"spaghetti westerns", kind:"genre",
  asks:"a genre, pluralised and colloquial",
  answerShape:"set", expectAll:23,
  expect:["Once Upon a Time in the West (1968)","The Great Silence (1968)","Death Rides a Horse (1967)","Navajo Joe (1966)","Django (1966)"],
  good:"The 23 tagged films. A tight, checkable set.",
  hazard:"Returning all 63 Westerns, which drops the whole point of the word 'spaghetti'." });

add({ id:"q013", q:"heist movies", kind:"genre",
  asks:"a genre asked with the wrong noun ('movies' vs the record's 'film')",
  answerShape:"set", expectAll:22,
  expect:["Rififi (1955)","The Killing (1956)","Le Cercle rouge (1970)","Heat (1995)","Bob le flambeur (1956)"],
  good:"The 22 films tagged heist film.",
  hazard:"Returning crime films generally — 254 of them — which is an eleven-fold over-answer." });

add({ id:"q014", q:"body horror", kind:"genre",
  asks:"a genre that is really a texture, and that one director dominates",
  answerShape:"set", expectAll:17,
  expect:["Videodrome (1983)","The Fly (1986)","The Thing (1982)","Dead Ringers (1988)","The Substance (2024)"],
  good:"The 17 tagged films. Cronenberg is 7 of them and that concentration is correct, not a bug.",
  hazard:"Returning all 152 horror films, or returning every Cronenberg including the non-body ones." });

add({ id:"q015", q:"documentaries", kind:"genre",
  asks:"a mode of filmmaking asked as a genre",
  answerShape:"set", expectAll:122,
  expect:["Shoah (1985)","Koyaanisqatsi (1982)","Hoop Dreams (1994)","The Gleaners and I (2000)","Burden of Dreams (1982)"],
  good:"The 122 tagged documentaries. Large but closed.",
  hazard:"Including docufiction and essay films that the record does not tag as documentary, without saying so." });

/* ══ 4. COUNTRY ══ */
add({ id:"q016", q:"iranian cinema", kind:"country",
  asks:"a national cinema, named by adjective rather than by country name",
  answerShape:"set", expectAll:25,
  expect:["Close-Up (1990)","Taste of Cherry (1997)","A Separation (2011)","Where is the Friend's Home? (1987)","The Wind Will Carry Us (1999)"],
  good:"The 25 films with Iran as a country of origin. 'Iranian' must resolve to 'Iran'.",
  hazard:"Zero results because the record stores the noun, not the adjective." });

add({ id:"q017", q:"korean films", kind:"country",
  asks:"a national cinema where the record has two Koreas and the typist means one",
  answerShape:"set", expectAll:38,
  expect:["Parasite (2019)","Oldboy (2003)","Memories of Murder (2003)","The Handmaiden (2016)","Peppermint Candy (2000)"],
  good:"The 38 South Korea films.",
  hazard:"Returning Korean-War films made in America — a word-match with no relation to the question." });

add({ id:"q018", q:"movies from senegal", kind:"country",
  asks:"a small national cinema; the whole set fits on one screen",
  answerShape:"set", expectAll:8,
  expect:["Touki Bouki (1973)","Black Girl (1966)","Xala (1975)","Mandabi (1968)","Atlantique (2019)"],
  good:"All eight. This one is fully enumerable, so partial credit is easy to score and hard to fake.",
  hazard:"Widening to 'African cinema' generally, which the record does not have as a category." });

add({ id:"q019", q:"japanese films", kind:"country",
  asks:"the corpus's second-largest national cinema — a set too big to be a useful answer on its own",
  answerShape:"set", expectAll:300,
  expect:["Tokyo Story (1953)","Seven Samurai (1954)","Ugetsu (1953)","The Woman in the Dunes (1964)","Harakiri (1962)"],
  good:"All 300. The honest observation is that a 300-film set is a poor answer to a person's actual need; a good system returns the set AND is visibly a set, not a top-5 pretending to be one.",
  hazard:"Silently truncating to ten and presenting that as the answer." });

/* ══ 5. DECADE ══ */
add({ id:"q020", q:"films from the 1970s", kind:"decade",
  asks:"a decade, spelled out",
  answerShape:"set", expectAll:348,
  expect:["Taxi Driver (1976)","Aguirre, the Wrath of God (1972)","The Godfather (1972)","Stalker (1979)","Chinatown (1974)"],
  good:"The 348 films dated 1970-1979. Purely a record fact; there is no judgement in it.",
  hazard:"Returning 'films that feel seventies' — grain, zooms, paranoia — which is a texture query wearing a date." });

add({ id:"q021", q:"80s movies", kind:"decade",
  asks:"a decade in its most common colloquial form, with the century dropped",
  answerShape:"set", expectAll:273,
  expect:["Blade Runner (1982)","Videodrome (1983)","Blue Velvet (1986)","Fitzcarraldo (1982)","Ran (1985)"],
  good:"The 273 films dated 1980-1989. '80s' must resolve to '1980s'.",
  hazard:"Reading '80' as a bare number and matching nothing, or matching runtimes and release IDs that happen to contain 80." });

add({ id:"q022", q:"something from the 1920s", kind:"decade",
  asks:"the thinnest decade in the corpus",
  answerShape:"set", expectAll:48,
  expect:["The Cabinet of Dr. Caligari (1920)","Nosferatu (1922)","Metropolis (1927)","The Last Laugh (1924)","Pandora's Box (1929)"],
  good:"The 48 films dated 1920-1929. Small enough to check by hand.",
  hazard:"Returning films set in the 1920s but made later — Once Upon a Time in America, The Untouchables — which is subject, not date." });

/* ══ 6. TITLE ══ */
add({ id:"q023", q:"seven samurai", kind:"title",
  asks:"an exact title, lowercased",
  answerShape:"set", expectAll:1,
  expect:["Seven Samurai (1954)"],
  good:"That one film, first and alone. Case must not matter.",
  hazard:"Returning The Magnificent Seven above it because 'seven' is a common word." });

add({ id:"q024", q:"blade runner", kind:"title",
  asks:"a title that is a prefix of a second title in the corpus",
  answerShape:"set", expectAll:2,
  expect:["Blade Runner (1982)","Blade Runner 2049 (2017)"],
  good:"Both films, with the 1982 exact match first. Returning only one is a defensible reading of intent but a worse answer than returning both.",
  hazard:"Returning 2049 above the exact match." });

add({ id:"q025", q:"2001", kind:"title",
  asks:"a string that is simultaneously a title and a year",
  answerShape:"set",
  expect:["2001: A Space Odyssey (1968)","A.I. Artificial Intelligence (2001)","Mulholland Drive (2001)","Y tu mamá también (2001)","Millennium Actress (2001)"],
  good:"Genuinely ambiguous and a good answer says so: the Kubrick film first, then the 2001 releases. Committing hard to either reading and hiding the other is the weaker answer.",
  hazard:"Silently choosing one reading. Worse: matching '2001' inside unrelated runtimes or IDs." });

add({ id:"q026", q:"godfather", kind:"title",
  asks:"a partial title spanning a series",
  answerShape:"set", expectAll:4,
  expect:["The Godfather (1972)","The Godfather Part II (1974)","The Godfather Part III (1990)","The Godfather Saga (1977)"],
  good:"All four Coppola films, in series order. The missing definite article must not matter.",
  hazard:"Tokyo Godfathers (2003) also contains the string and is a Satoshi Kon animation about three homeless people in Tokyo. It is the substring trap in this query and ranking it above The Godfather Part III would be the visible failure. Returning gangster films generally instead of the titles is the other one." });

add({ id:"q027", q:"the matrix", kind:"title",
  asks:"an exact title that is also a common noun",
  answerShape:"set", expectAll:1,
  expect:["The Matrix (1999)"],
  good:"That film. The corpus holds no Matrix sequels, so a correct answer is exactly one row long.",
  hazard:"Inventing Reloaded and Revolutions, or returning cyberpunk generally (13 films) instead of the title asked for." });

/* ══ 7. MOVEMENT ══ */
add({ id:"q028", q:"german expressionism", kind:"movement",
  asks:"an art-historical movement that the record layer has almost entirely failed to tag",
  answerShape:"ranking",
  expect:["The Cabinet of Dr. Caligari (1920)","Nosferatu (1922)","Metropolis (1927)","The Last Laugh (1924)","Dr. Mabuse the Gambler (1922)"],
  good:"Those five and their neighbours. This is a deliberate stress case: the movement index maps 'German Expressionism' to ONE film (Metropolis) while the corpus obviously contains the canon. A good answer beats the record layer here, which means the record layer must not be allowed to answer alone.",
  hazard:"Returning Metropolis and stopping, and calling that a complete set because the index said so." });

add({ id:"q029", q:"french new wave", kind:"movement",
  asks:"a movement the record layer tags heavily",
  answerShape:"set", expectAll:118,
  expect:["The 400 Blows (1959)","Breathless (1960)","Cléo from 5 to 7 (1962)","Jules and Jim (1962)","Pierrot le Fou (1965)"],
  good:"The 118 tagged films. Unlike q028 the index is rich here; the pair is the point.",
  hazard:"Returning any French film — 487 of them." });

/* ══ 8. MOOD ══ */
add({ id:"q030", q:"something dreamlike", kind:"mood",
  asks:"a mood the vocabulary holds exactly (mood:dreamlike)",
  answerShape:"ranking",
  expect:["Mulholland Drive (2001)","Last Year at Marienbad (1961)","Eraserhead (1977)","8½ (1963)","Picnic at Hanging Rock (1975)"],
  good:"Films whose logic is the dream's, not merely films with strange images. The vocabulary's own gloss makes that distinction and a good answer honours it.",
  hazard:"Returning any surrealist-looking film, or any film containing a dream sequence." });

add({ id:"q031", q:"a paranoid film about being watched", kind:"mood",
  asks:"a mood (mood:paranoid) plus a subject the 59 attributes have no term for (surveillance)",
  answerShape:"ranking",
  expect:["The Conversation (1974)","Caché (2005)","Someone's Watching Me! (1978)","The Tenant (1976)","Rear Window (1954)"],
  good:"The surveillance films specifically, not the whole paranoid shelf. Half this query is unreadable to the local vocabulary and that half is the informative half.",
  hazard:"Returning the paranoid set with no regard for watching — JFK, Get Out, Perfect Blue — which is the readable half swallowing the query." });

add({ id:"q032", q:"a warm film to watch when you're feeling low", kind:"mood",
  asks:"a mood plus a use — what the film is FOR, which nothing in the corpus records",
  answerShape:"ranking",
  expect:["My Neighbor Totoro (1988)","Our Little Sister (2015)","Petite Maman (2021)","City Lights (1931)","Meet Me in St. Louis (1944)"],
  good:"Warm and tender films. The corpus scores mood:warm at 1.0 for exactly one film (My Neighbor Totoro), so a good answer has to reach past the top scorer into tone:tender without drifting into 'happy ending'.",
  hazard:"Returning comedies, which is a different attribute, or returning bleak films that end well." });

add({ id:"q033", q:"films that mourn a world that's already gone", kind:"mood",
  asks:"mood:elegiac, described rather than named",
  answerShape:"ranking",
  expect:["The Last Picture Show (1971)","Once Upon a Time in the West (1968)","The Wild Bunch (1969)","An Autumn Afternoon (1962)","Amarcord (1973)"],
  good:"Elegies for a trade, a generation or a way of living. The vocabulary's gloss explicitly excludes 'merely set in the past', and that exclusion is the whole test.",
  hazard:"Returning every period film — the exact failure the attribute's 'not' clause warns about." });

/* ══ 9. TONE ══ */
add({ id:"q034", q:"bleak, no comfort at all", kind:"tone",
  asks:"tone:bleak, stated flatly",
  answerShape:"ranking",
  expect:["Salò, or the 120 Days of Sodom (1975)","Son of Saul (2015)","An Elephant Sitting Still (2018)","L'Argent (1983)","Los Olvidados (1950)"],
  good:"Films that refuse consolation. Bleakness is a refusal, not a body count, and the strongest answers are quiet ones like L'Argent as much as loud ones.",
  hazard:"Equating bleak with violent and returning the graphic-violence shelf." });

add({ id:"q035", q:"melancholy but not depressing", kind:"tone",
  asks:"a tone plus a boundary on itself — melancholy AND NOT bleak",
  answerShape:"ranking",
  expect:["In the Mood for Love (2000)","Brief Encounter (1945)","Floating Clouds (1955)","Tokyo Story (1953)","Lost in Translation (2003)"],
  good:"Soft, liveable sadness. The corpus scores tone:melancholy at 1.0 for exactly three films and all three belong here. The 'not depressing' half must actively exclude tone:bleak, not just be ignored.",
  hazard:"Ignoring the second clause and returning Loveless or The Devil Probably." });

add({ id:"q036", q:"a genuinely funny film", kind:"tone",
  asks:"tone:comic with an intensifier the record cannot measure",
  answerShape:"ranking",
  expect:["Dr. Strangelove (1964)","The Big Lebowski (1998)","Playtime (1967)","Raising Arizona (1987)","Tampopo (1985)"],
  good:"Films meant to be funny and that are. 'Genuinely' adds nothing the corpus can score, and a good answer neither chokes on it nor pretends to have measured it.",
  hazard:"Returning mood:absurd instead — The Exterminating Angel, Even Dwarfs Started Small — which the vocabulary explicitly distinguishes from comic intent." });

add({ id:"q037", q:"ironic, keeps you at arm's length", kind:"tone",
  asks:"tone:ironic, described by its effect rather than named",
  answerShape:"ranking",
  expect:["Barry Lyndon (1975)","The Discreet Charm of the Bourgeoisie (1972)","Dr. Strangelove (1964)","Network (1976)","Starship Troopers (1997)"],
  good:"Films that say one thing and mean another. A tragedy can be ironic and a good answer will include at least one.",
  hazard:"Collapsing irony into comedy and returning farce." });

/* ══ 10. PACE ══ */
add({ id:"q038", q:"slow films where basically nothing happens", kind:"pace",
  asks:"pace:contemplative, in the dismissive register real people use",
  answerShape:"ranking",
  expect:["Jeanne Dielman, 23 quai du Commerce, 1080 Bruxelles (1975)","Sátántangó (1994)","Vive L'Amour (1994)","The Turin Horse (2011)","Stalker (1979)"],
  good:"Films where time is given rather than spent. The vocabulary insists this is not the same as slow-burn — nothing is being wound up — and mixing the two is the error to catch.",
  hazard:"Returning slow-burn thrillers, where a great deal is happening, very slowly." });

add({ id:"q039", q:"relentless, never lets up", kind:"pace",
  asks:"pace:relentless",
  answerShape:"ranking",
  expect:["Mad Max: Fury Road (2015)","Uncut Gems (2019)","Good Time (2017)","Hard Boiled (1992)","Train to Busan (2016)"],
  good:"Films that do not let you sit down. The gloss's 'a slow film with one chase is not relentless' is the discriminator.",
  hazard:"Returning the 197-film action shelf, most of which is not relentless." });

add({ id:"q040", q:"a slow burn that builds to something", kind:"pace",
  asks:"pace:slow-burn, which is the attribute most easily confused with its neighbour",
  answerShape:"ranking",
  expect:["The Conversation (1974)","Burning (2018)","Audition (1999)","The Witch (2015)","Night Moves (2013)"],
  good:"Deliberate accumulation with something tightening. The separation from pace:contemplative is the whole content of this query.",
  hazard:"Returning Ozu and Tsai, which are contemplative and are not building to anything." });

add({ id:"q041", q:"brisk and light on its feet", kind:"pace",
  asks:"pace:brisk — the least-used pace term",
  answerShape:"ranking",
  expect:["Bande à part (1964)","How to Steal a Million (1966)","The Ladykillers (2004)","The General (1926)","Nine Queens (2000)"],
  good:"Screwball, caper, farce. Quick without adrenaline — the gloss's own distinction from relentless. Worth recording: NO film in the corpus scores pace:brisk at 1.0, so this attribute is thinly populated and a confident five-film answer is already going beyond what the consensus layer knows.",
  hazard:"Returning action films, which are quick with adrenaline and therefore the wrong attribute." });

/* ══ 11. TEXTURE ══ */
add({ id:"q042", q:"almost no music", kind:"texture",
  asks:"a texture stated only as an absence. The vocabulary has texture:music-led and no term for its negation",
  answerShape:"ranking",
  expect:["The Naked Island (1960)","No Country for Old Men (2007)","Jeanne Dielman, 23 quai du Commerce, 1080 Bruxelles (1975)","The Turin Horse (2011)","Le Samouraï (1967)"],
  good:"Films that run near-silent. Nothing in the 59 attributes points at this directly — the closest term, texture:music-led, means the opposite — so a right answer here is evidence of reading, not matching.",
  hazard:"Returning the music-led shelf because the word 'music' matched. That inversion is the specific failure this query exists to catch." });

add({ id:"q043", q:"barely any dialogue", kind:"texture",
  asks:"texture:sparse-dialogue, phrased as a quantity",
  answerShape:"ranking",
  expect:["The Naked Island (1960)","Le Samouraï (1967)","Vive L'Amour (1994)","Koyaanisqatsi (1982)","A Scene at the Sea (1991)"],
  good:"The nine films scored 1.0 on sparse-dialogue and their neighbours. Unlike q042 the vocabulary holds this one exactly.",
  hazard:"Returning silent films, which is a different fact — a 1920s intertitle film is not a sparse-dialogue film." });

add({ id:"q044", q:"handheld, raw, like a documentary", kind:"texture",
  asks:"texture:handheld-raw, with a comparison to a mode inside it",
  answerShape:"ranking",
  expect:["Breathless (1960)","The Battle of Algiers (1966)","City of God (2002)","Naked (1993)","Tangerine (2015)"],
  good:"Fiction films shot raw. The phrase 'like a documentary' is a simile and must not be taken as a request for the 122 actual documentaries.",
  hazard:"Returning documentaries. The word 'like' is doing all the work and dropping it inverts the answer." });

add({ id:"q045", q:"painterly, every frame a painting", kind:"texture",
  asks:"texture:painterly, with a cliché attached",
  answerShape:"ranking",
  expect:["Barry Lyndon (1975)","Days of Heaven (1978)","The Tale of the Princess Kaguya (2013)","Ran (1985)","In the Mood for Love (2000)"],
  good:"Composed, painted-looking films.",
  hazard:"Returning films ABOUT painters." });

/* ══ 12. SETTING ══ */
add({ id:"q046", q:"set in space", kind:"setting",
  asks:"setting:space — a place, which is one of the few concrete things the attribute vocabulary holds",
  answerShape:"ranking",
  expect:["2001: A Space Odyssey (1968)","Alien (1979)","Solaris (1972)","Gravity (2013)","Interstellar (2014)"],
  good:"Films that actually take place in space, not films with a rocket in them.",
  hazard:"Returning all 136 science fiction films, most of which are on Earth." });

add({ id:"q047", q:"a city at night", kind:"setting",
  asks:"setting:city-at-night",
  answerShape:"ranking",
  expect:["Taxi Driver (1976)","Fallen Angels (1995)","After Hours (1985)","Two Men in Manhattan (1959)","Le Samouraï (1967)"],
  good:"Films whose nocturnal city is the setting, not a scene.",
  hazard:"Returning film noir wholesale — overlapping but not the same set." });

add({ id:"q048", q:"small town america", kind:"setting",
  asks:"setting:small-town narrowed by a country the attribute does not encode",
  answerShape:"ranking",
  expect:["The Last Picture Show (1971)","Shadow of a Doubt (1943)","Blue Velvet (1986)","What's Eating Gilbert Grape (1993)","Mystery, Alaska (1999)"],
  good:"American small towns specifically. setting:small-town alone returns Amarcord and The Banshees of Inisherin, which are small towns and are not America — the country half has to bite.",
  hazard:"Returning Amarcord and Inisherin, which is the attribute answering and the query being ignored." });

/* ══ 13. STRUCTURE ══ */
add({ id:"q049", q:"told out of order", kind:"structure",
  asks:"structure:nonlinear in plain words",
  answerShape:"ranking",
  expect:["Memento (2000)","Citizen Kane (1941)","Last Year at Marienbad (1961)","Once Upon a Time in America (1984)","Peppermint Candy (2000)"],
  good:"The five films scored 1.0 on nonlinear, then the 26 flashback-tagged films.",
  hazard:"Returning any film with a single flashback, which is nearly everything." });

add({ id:"q050", q:"one room, one setting, no way out", kind:"structure",
  asks:"structure:single-setting with an implication of confinement",
  answerShape:"ranking",
  expect:["Rope (1948)","Lifeboat (1944)","The Exterminating Angel (1962)","Carnage (2011)","Knife in the Water (1962)"],
  good:"Confined-space films. The Exterminating Angel matters here because 'no way out' is its literal premise and single-setting alone would not surface it above Rear Window.",
  hazard:"Returning stage adaptations generally, which are single-setting without being trapped." });

add({ id:"q051", q:"a film with a twist ending", kind:"structure",
  asks:"structure:twist — the one attribute a good answer may be reluctant to answer honestly",
  answerShape:"ranking",
  expect:["Psycho (1960)","The Prestige (2006)","Oldboy (2003)","Diabolique (1954)","Shutter Island (2010)"],
  good:"Films built on a reversal. There is a real tension here worth recording: naming them is a spoiler, and the corpus has no spoiler flag.",
  hazard:"Returning mystery films generally, where the reveal is the form rather than a twist on it." });

/* ══ 14. SUBJECT ══ */
add({ id:"q052", q:"films about grief", kind:"subject",
  asks:"subject:grief",
  answerShape:"ranking",
  expect:["Don't Look Now (1973)","Three Colours: Blue (1993)","Drive My Car (2021)","Maborosi (1995)","All of Us Strangers (2023)"],
  good:"Bereavement and what a person does with it. The nine films scored 1.0 are a strong core.",
  hazard:"Returning any film in which someone dies." });

add({ id:"q053", q:"movies about work", kind:"subject",
  asks:"subject:work — an attribute most people would not think a film could be 'about'",
  answerShape:"ranking",
  expect:["Jeanne Dielman, 23 quai du Commerce, 1080 Bruxelles (1975)","Tokyo Chorus (1931)","The Gleaners and I (2000)","Showing Up (2022)","Modern Times (1936)"],
  good:"Films where labour is the subject rather than the backdrop.",
  hazard:"Returning workplace-set thrillers where the job is scenery." });

add({ id:"q054", q:"coming of age", kind:"subject",
  asks:"subject:coming-of-age, which is also a genre tag — two layers hold the same idea",
  answerShape:"set", expectAll:56,
  expect:["The 400 Blows (1959)","A Brighter Summer Day (1991)","Moonlight (2016)","Y tu mamá también (2001)","Aftersun (2022)"],
  good:"The 56 genre-tagged films, and the attribute-scored set alongside. The interesting result is whether the two agree.",
  hazard:"Returning any film with a teenager in it — the exact thing the attribute's 'not' clause forbids." });

add({ id:"q055", q:"films about class and money", kind:"subject",
  asks:"subject:class with a second noun the vocabulary does not hold",
  answerShape:"ranking",
  expect:["Parasite (2019)","Bicycle Thieves (1948)","High and Low (1963)","L'Argent (1983)","Rocco and His Brothers (1960)"],
  good:"Films where social position is the engine. 'Money' has no attribute and must be absorbed by class or dropped honestly.",
  hazard:"Returning heist films because 'money' matched a plot noun." });

/* ══ 15. COMBINATION — several facets in one sentence ══ */
add({ id:"q056", q:"japanese noir from the 60s", kind:"combination",
  asks:"country AND genre AND decade at once — three record facts that must intersect",
  answerShape:"ranking",
  expect:["Branded to Kill (1967)","Tokyo Drifter (1966)","High and Low (1963)","Pale Flower (1964)","Youth of the Beast (1963)"],
  good:"The intersection, not the union. Any one facet dropped produces a wrong set that still looks plausible, which is what makes this worth measuring.",
  hazard:"Returning American noir (genre wins), or all 1960s Japanese films (country plus decade wins and genre is dropped)." });

add({ id:"q057", q:"a slow french film about a marriage falling apart", kind:"combination",
  asks:"pace AND country AND a relational arc, together",
  answerShape:"ranking",
  expect:["Contempt (1963)","Anatomy of a Fall (2023)","Amour (2012)","My Life to Live (1962)","La Notte (1961)"],
  good:"French, unhurried, and about a marriage coming apart. La Notte is Italian and belongs on this list on every count except country — a good answer either excludes it or says why it kept it.",
  hazard:"Returning any slow French film, of which there are very many." });

add({ id:"q058", q:"korean revenge thriller", kind:"combination",
  asks:"country AND story arc AND genre — a combination with an obvious right answer",
  answerShape:"ranking",
  expect:["Oldboy (2003)","Sympathy for Mr. Vengeance (2002)","Sympathy for Lady Vengeance (2005)","The Handmaiden (2016)","Memories of Murder (2003)"],
  good:"Park Chan-wook's vengeance trilogy first. This is the easiest combination query in the set and exists as a floor: a search that misses this is broken.",
  hazard:"Missing it. There is no excuse here." });

add({ id:"q059", q:"1970s american paranoid thriller", kind:"combination",
  asks:"decade AND country AND mood AND genre — four facets",
  answerShape:"ranking",
  expect:["The Conversation (1974)","The Parallax View (1974)","Klute (1971)","All the President's Men (1976)","Chinatown (1974)"],
  good:"The New Hollywood paranoia cycle. Every facet is separately available in the record and the mood is available in the attributes, so this tests whether the layers can be combined at all.",
  hazard:"Returning 1970s American thrillers with no paranoia, which is a much bigger and much duller set." });

add({ id:"q060", q:"black and white italian film about poor people", kind:"combination",
  asks:"a photographic fact the corpus does not record, plus a country, plus a subject",
  answerShape:"ranking",
  expect:["Bicycle Thieves (1948)","Rome, Open City (1945)","Accattone (1961)","Rocco and His Brothers (1960)","Los Olvidados (1950)"],
  good:"Italian neorealism. Note that 'black and white' is NOT in the corpus — no colour field exists — so the right answer is reached through period and country, and a good system should be able to say that is what it did.",
  hazard:"Claiming to have filtered on monochrome. There is nothing to filter on." });

add({ id:"q061", q:"a funny science fiction film", kind:"combination",
  asks:"a genre crossed with a tone that usually cuts against it",
  answerShape:"ranking",
  expect:["Dr. Strangelove (1964)","Brazil (1985)","Dark Star (1974)","Sorry to Bother You (2018)","Everything Everywhere All at Once (2022)"],
  good:"Science fiction that is meant to be funny. The intersection is small and that smallness is correct.",
  hazard:"Returning science fiction with a funny scene, or comedies with a gadget." });

/* ══ 16. NEGATION ══ */
add({ id:"q062", q:"a revenge film that isn't violent", kind:"negation",
  asks:"story:revenge AND NOT texture:graphic-violence — the canonical negation case",
  answerShape:"ranking",
  expect:["The Bad Sleep Well (1960)","The Bride Wore Black (1968)","An Actor's Revenge (1963)","Les Dames du Bois de Boulogne (1945)","The Lost Honour of Katharina Blum (1975)"],
  good:"Revenge carried out coldly rather than bloodily. A right answer must ACT on the negation, not merely tolerate it.",
  hazard:"Returning Oldboy and I Saw the Devil, which is what happens when 'isn't' is dropped and the remaining words are scored. This is a documented past failure of this exact query." });

add({ id:"q063", q:"science fiction without any space travel", kind:"negation",
  asks:"a genre minus its most-associated setting",
  answerShape:"ranking",
  expect:["Videodrome (1983)","Children of Men (2006)","World on a Wire (1973)","La Jetée (1962)","Alphaville (1965)"],
  good:"Earthbound science fiction. setting:space is scored, so the exclusion is directly checkable.",
  hazard:"Returning 2001 and Alien — the highest-scoring space films — which is the negation being read as an emphasis." });

add({ id:"q064", q:"a war film with no battle scenes", kind:"negation",
  asks:"a genre minus its defining content",
  answerShape:"ranking",
  expect:["Army of Shadows (1969)","The Ascent (1977)","Shoah (1985)","Hiroshima mon amour (1959)","Rome, Open City (1945)"],
  good:"War films about occupation, aftermath and memory. A well-formed answer here is not a compromise — these are among the best war films in the corpus.",
  hazard:"Returning Saving Private Ryan, which is the 106-film war shelf ignoring the second half of the sentence." });

add({ id:"q065", q:"horror that isn't gory", kind:"negation",
  asks:"a genre minus a texture",
  answerShape:"ranking",
  expect:["Don't Look Now (1973)","The Witch (2015)","Ring (1998)","Kwaidan (1964)","Vampyr (1932)"],
  good:"Dread without blood. mood:menacing without texture:graphic-violence is very nearly the exact query.",
  hazard:"Returning slashers and body horror, which is the negation inverted." });

add({ id:"q066", q:"a love story that doesn't end happily", kind:"negation",
  asks:"a genre minus an outcome the corpus does not record as a field",
  answerShape:"ranking",
  expect:["In the Mood for Love (2000)","Brief Encounter (1945)","Happy Together (1997)","Ali: Fear Eats the Soul (1974)","The Umbrellas of Cherbourg (1964)"],
  good:"Romances that end in loss. Endings are not a stored fact anywhere in the corpus — not in the attributes, not in the record — so this is answered from plot text or not at all.",
  hazard:"Returning romance wholesale, or claiming an ending the corpus never recorded." });

add({ id:"q067", q:"not american", kind:"negation",
  asks:"a negation with nothing positive alongside it",
  answerShape:"set", expectAll:1410,
  expect:["Tokyo Story (1953)","The 400 Blows (1959)","Bicycle Thieves (1948)","Aguirre, the Wrath of God (1972)","Parasite (2019)"],
  good:"Roughly 1,410 films — everything the record does not give a United States origin. A bare negation selects most of the corpus, and the honest answer says so rather than pretending to have ranked it.",
  hazard:"Returning American films, or returning five arbitrary foreign films as though the query had been a ranking." });

add({ id:"q068", q:"a thriller with no violence and no chase", kind:"negation",
  asks:"two negations stacked on one genre",
  answerShape:"ranking",
  expect:["The Conversation (1974)","Caché (2005)","Rear Window (1954)","Rope (1948)","Certified Copy (2010)"],
  good:"Suspense built without physical action. Both negations have to survive; dropping either produces a different and wrong set.",
  hazard:"Honouring one negation and quietly dropping the second — the failure mode that is hardest to spot from the output alone." });

/* ══ 17. SELF-CONTRADICTION ══ */
add({ id:"q069", q:"a silent film with great dialogue", kind:"contradiction",
  asks:"two facts that cannot both hold",
  answerShape:"none", expect:[],
  good:"No good answer exists, and saying so is the right answer. The nearest honest offers are talkies that were shot silent-adjacent, or silent films famous for their intertitles, but the query as typed describes nothing.",
  hazard:"Returning the 61 silent films as though the second clause were noise, and thereby claiming a contradiction was satisfied." });

add({ id:"q070", q:"a fast-paced contemplative film", kind:"contradiction",
  asks:"two attributes the vocabulary defines against each other",
  answerShape:"none", expect:[],
  good:"pace:relentless and pace:contemplative are mutually exclusive by the vocabulary's own glosses. The right answer names the conflict. If pressed, Koyaanisqatsi is the only defensible offer — rapid motion inside a contemplative frame — and offering it WITH the caveat is better than offering it silently.",
  hazard:"Averaging the two into something merely mid-paced and presenting it as a match." });

add({ id:"q071", q:"a cheerful film about the holocaust", kind:"contradiction",
  asks:"a tone that cannot survive its own subject",
  answerShape:"none", expect:[],
  good:"No good answer. The corpus's Holocaust films — Shoah, Son of Saul, The Ascent — are the opposite of cheerful, and the corpus holds no Life Is Beautiful. Naming those films while declining the adjective is honest; producing a 'cheerful' one is not.",
  hazard:"Dropping 'cheerful' and returning Shoah, which turns a refused query into a wrong answer." });

add({ id:"q072", q:"an ensemble film with only one character in it", kind:"contradiction",
  asks:"structure:ensemble negated by its own definition",
  answerShape:"none", expect:[],
  good:"No good answer. Nearest honest neighbours are one-hander films (All Is Lost is not in the corpus; The Naked Island runs on four) but 'ensemble' is exactly what they are not.",
  hazard:"Returning the ensemble shelf and ignoring the clause that unmakes it." });

/* ══ 18. PLOT EVENT — a thing that happens, not a quality ══ */
add({ id:"q073", q:"a bank robbery that goes wrong", kind:"plot-event",
  asks:"an event plus an outcome. Nothing in the 59 attributes names either",
  answerShape:"ranking",
  expect:["Dog Day Afternoon (1975)","Heat (1995)","Rififi (1955)","The Killing (1956)","Before the Devil Knows You're Dead (2007)"],
  good:"Dog Day Afternoon is the query almost word for word. The 22-film heist tag holds most of the rest, but the tag alone cannot tell you which ones go wrong — and in this genre nearly all of them do, which is a real and useful thing for a good answer to know.",
  hazard:"Returning crime films generally, or returning heists that succeed." });

add({ id:"q074", q:"a child goes missing and is never found", kind:"plot-event",
  asks:"an event with a specific non-resolution",
  answerShape:"ranking",
  expect:["Picnic at Hanging Rock (1975)","L'Avventura (1960)","Memories of Murder (2003)","Loveless (2017)","Cure (1997)"],
  good:"Disappearances the film refuses to resolve. Picnic at Hanging Rock and L'Avventura are the two purest cases and neither is about a child in the ordinary sense — a good answer would flag that rather than pad the list.",
  hazard:"Returning kidnap films where the child comes home, which satisfies the first clause and inverts the second." });

add({ id:"q075", q:"someone fakes their own death", kind:"plot-event",
  asks:"a discrete plot device",
  answerShape:"ranking",
  expect:["The Third Man (1949)","Three Colours: White (1994)","Vertigo (1958)","The 39 Steps (1935)","Days of Being Wild (1990)"],
  good:"The Third Man is the canonical case — the entire film proceeds from a staged funeral. This is answerable only from plot text; no attribute and no record field touches it.",
  hazard:"Returning films where someone merely dies, or films that are 'about' identity." });

add({ id:"q076", q:"a man wakes up with no memory of who he is", kind:"plot-event",
  asks:"an event that is also a genre premise",
  answerShape:"ranking",
  expect:["Memento (2000)","Mulholland Drive (2001)","Total Recall (1990)","Dark City (1998)","Paris, Texas (1984)"],
  good:"Amnesia films. Memento is the exact case; Paris, Texas is the quiet one and belongs.",
  hazard:"Returning 'films about memory' (subject:memory) — a real attribute that is not the same thing, and that would pull in The Mirror and Hiroshima mon amour." });

add({ id:"q077", q:"a trial where the verdict is decided before it starts", kind:"plot-event",
  asks:"an event with an injustice built into it",
  answerShape:"ranking",
  expect:["Paths of Glory (1957)","The Trial of Joan of Arc (1962)","Danton (1983)","The Passion of Joan of Arc (1928)","M (1931)"],
  good:"Show trials and foregone verdicts. The 22-film trial-film tag is the starting point but most of it is ordinary courtroom drama and does not answer the question.",
  hazard:"Returning courtroom dramas generally, where the verdict is exactly what is in doubt." });

add({ id:"q078", q:"a group of people trapped in a house they can't leave", kind:"plot-event",
  asks:"an event that is also nearly a structure (single-setting)",
  answerShape:"ranking",
  expect:["The Exterminating Angel (1962)","Night of the Living Dead (1968)","Rope (1948)","The Discreet Charm of the Bourgeoisie (1972)","Carnage (2011)"],
  good:"The Exterminating Angel is the premise stated literally. structure:single-setting overlaps but includes Rear Window and Lifeboat, which are not houses and not groups.",
  hazard:"Returning haunted-house films, where leaving is possible and simply unwise." });

add({ id:"q079", q:"a duel at the end between two men who respect each other", kind:"plot-event",
  asks:"an event plus a relation between the parties",
  answerShape:"ranking",
  expect:["Sanjuro (1962)","The Great Silence (1968)","Harakiri (1962)","Once Upon a Time in the West (1968)","Barry Lyndon (1975)"],
  good:"Final confrontations charged with mutual regard. Sanjuro's closing duel is the archetype.",
  hazard:"Returning any film containing a fight, of which the corpus has hundreds." });

add({ id:"q080", q:"a stranger arrives in a village and everything changes", kind:"plot-event",
  asks:"a plot template rather than a single event",
  answerShape:"ranking",
  expect:["Seven Samurai (1954)","Yojimbo (1961)","Teorema (1968)","The Wicker Man (1973)","Shane (1953)"],
  good:"The arriving-outsider template. Teorema is the purest form — a visitor arrives, sleeps with every member of a household and leaves it in pieces — and Yojimbo is the cynical version where the stranger sets the village against itself on purpose.",
  hazard:"Returning Westerns generally on the strength of 'stranger' and 'town'." });

add({ id:"q081", q:"someone takes a job they should have turned down", kind:"plot-event",
  asks:"an event described entirely by hindsight — the corpus records no such judgement",
  answerShape:"ranking",
  expect:["The Shining (1980)","The Wages of Fear (1953)","Sorcerer (1977)","Le Samouraï (1967)","The Conversation (1974)"],
  good:"Films where accepting the work is the fatal decision. The Shining opens on the interview and never recovers from it.",
  hazard:"Returning subject:work films, which is about labour as a subject and has nothing to do with a fateful choice." });

add({ id:"q082", q:"a road trip that falls apart", kind:"plot-event",
  asks:"a genre (road movie, 17 films) crossed with an outcome",
  answerShape:"ranking",
  expect:["Y tu mamá también (2001)","Stroszek (1977)","Kings of the Road (1976)","Thelma & Louise (1991)","Old Joy (2006)"],
  good:"Journeys that break the travellers. Y tu mamá también and Old Joy both end friendships on the road, which is the query's real content.",
  hazard:"Returning all 17 road movies without regard to whether anything falls apart." });

/* ══ 19. RELATIONAL ARC — a bond that changes state over time ══ */
add({ id:"q083", q:"friends who break up but make up towards the end", kind:"relational-arc",
  asks:"a bond severed and then repaired — the query this whole trial was set up by. The 59 attributes hold no term for it and the model correctly returns zero clauses",
  answerShape:"ranking",
  expect:["Toy Story (1995)","Moonlight (2016)","Farewell My Concubine (1993)","A Better Tomorrow (1986)","Jules and Jim (1962)"],
  good:"Films where a friendship breaks and is mended before the credits. Toy Story is the cleanest case in the corpus — the two leads are enemies, then allies, and the last shot is them together. Moonlight is the deepest: Kevin's betrayal, a decade of silence, and a reunion that is the whole third act. Farewell My Concubine reunites its two men in 1977 after everything. The Banshees of Inisherin is the anti-answer — the break with no repair — and a system that returns it here has matched the first half of the sentence and ignored the second.",
  hazard:"Returning The Banshees of Inisherin and Old Joy, which are the corpus's two best films about friendships that END. Everything before 'but' matches them perfectly." });

add({ id:"q084", q:"a marriage that survives an affair", kind:"relational-arc",
  asks:"a bond that is damaged and holds — the outcome is the query",
  answerShape:"ranking",
  expect:["Eyes Wide Shut (1999)","Brief Encounter (1945)","Scenes from a Marriage (1974)","Belle de Jour (1967)","Yi Yi (2000)"],
  good:"Eyes Wide Shut is the exact shape: a marriage walked to the edge by desire and still standing in the last scene. Brief Encounter's affair is never consummated and the marriage survives by default, which is a different and interesting reading. Scenes from a Marriage is a partial answer worth flagging — the marriage does not survive, but the bond does.",
  hazard:"Returning affair films where the marriage ends — La Notte, Contempt — which match 'marriage' and 'affair' and invert 'survives'." });

add({ id:"q085", q:"a mentor who betrays the student", kind:"relational-arc",
  asks:"a role pair the corpus has no vocabulary for at ANY layer — the 59 attributes have no mentor term and neither do the 175 frozen predicates",
  answerShape:"ranking",
  expect:["The Master (2012)","Suspiria (1977)","Phantom Thread (2017)","Star Wars: Episode V – The Empire Strikes Back (1980)","Whisper of the Heart (1995)"],
  good:"The Master is the closest thing the corpus has: Dodd takes Freddie in and uses him. Suspiria's academy is a coven that consumes its students. This query is worth keeping precisely because a search over the predicate layer will also fail it — the hole is not only in the 59 attributes, and a survey that only found holes the predicates fill would be flattering the predicates.",
  hazard:"Returning teacher films where nobody betrays anybody, or returning nothing at all and reporting the query as unanswerable when the corpus plainly contains answers." });

add({ id:"q086", q:"a father and son who don't speak, and then do", kind:"relational-arc",
  asks:"an estrangement plus a repair, across generations",
  answerShape:"ranking",
  expect:["Tokyo Story (1953)","Ran (1985)","Yi Yi (2000)","Five Easy Pieces (1970)","Rebel Without a Cause (1955)"],
  good:"Five Easy Pieces has the scene the query is describing — a son talking at a father who cannot answer — and it does not repair, which makes it a near-miss worth naming as one. Ran repairs too late. A genuinely clean answer may not exist in this corpus and saying so is legitimate.",
  hazard:"Returning subject:family, which is 100+ films and is not about estrangement at all." });

add({ id:"q087", q:"someone takes the blame for a person they love", kind:"relational-arc",
  asks:"a transfer of cost between two parties. The frozen predicate cost-taken-onto-oneself names it exactly",
  answerShape:"ranking",
  expect:["High and Low (1963)","The Sacrifice (1986)","Sansho the Bailiff (1954)","The Human Condition I: No Greater Love (1959)","Cops and Robbers (1951)"],
  good:"High and Low is the corpus's purest case — a man ruins himself to ransom his chauffeur's son. Every film named here carries a Pass C tag on cost-taken-onto-oneself: The Sacrifice at centrality 0.95, High and Low at 0.90, Cops and Robbers at 0.60. The predicate layer has already read 27 films into this shape out of the 300 it has seen, which is the best evidence in the repository that these arcs are recoverable at all.",
  hazard:"Returning courtroom films because 'blame' matched a legal noun." });

add({ id:"q088", q:"two brothers who end up on opposite sides", kind:"relational-arc",
  asks:"a bond split by an external force",
  answerShape:"ranking",
  expect:["A Better Tomorrow (1986)","Rocco and His Brothers (1960)","The Godfather Part II (1974)","A City of Sadness (1989)","Ran (1985)"],
  good:"A Better Tomorrow is a gangster and his policeman brother and nothing else. Rocco is two brothers destroyed by the same woman and the same city.",
  hazard:"Returning any film containing brothers — a very large and useless set." });

add({ id:"q089", q:"a friendship that quietly ends and nobody says why", kind:"relational-arc",
  asks:"the exact inverse of q083, and the frozen predicate the-bond-ended-without-account names it word for word",
  answerShape:"ranking",
  expect:["Old Joy (2006)","The Banshees of Inisherin (2022)","Withnail and I (1987)","Y tu mamá también (2001)","Aftersun (2022)"],
  good:"Old Joy is the corpus's definitive case — two friends camp, something has come between them, neither can name it, and they part. The Banshees of Inisherin is the loud version, where a reason IS given and it is not one the other can accept, which is the frozen predicate the-bond-ended-without-account word for word. Aftersun carries that exact Pass C tag (the one left, unrestored, 0.35). This query and q083 must not return the same list; if they do, the search is reading nouns and not the arc.",
  hazard:"Returning Toy Story and Moonlight, which is q083's answer and the precise error this pair is built to detect." });

add({ id:"q090", q:"someone comes home after years away and finds their place has been taken", kind:"relational-arc",
  asks:"a return that is refused. The frozen predicate return-after-long-absence names it",
  answerShape:"ranking",
  expect:["The Past (2013)","Paris, Texas (1984)","Sunrise: A Song of Two Humans (1927)","Late Chrysanthemums (1954)","The Manxman (1929)"],
  good:"Paris, Texas is a man walking back into a family that closed over him. The Past is the same shape with the new partner already in the house.",
  hazard:"Returning story:coming-home, which includes homecomings that are welcomed and is therefore the wrong half of the attribute." });

add({ id:"q091", q:"a couple who stay together only because they need each other", kind:"relational-arc",
  asks:"a bond held by necessity rather than desire. The frozen predicate bond-held-by-need names it",
  answerShape:"ranking",
  expect:["Ali: Fear Eats the Soul (1974)","The Bitter Tears of Petra von Kant (1972)","The Woman in the Dunes (1964)","Amour (2012)","The Marriage of Maria Braun (1979)"],
  good:"Woman in the Dunes is the literal version — two people at the bottom of a sand pit who cannot leave each other. Fassbinder supplies the social version twice over.",
  hazard:"Returning romance, which is the opposite claim about the same two people." });

add({ id:"q092", q:"a woman leaves a man and he never understands why", kind:"relational-arc",
  asks:"an ending given without a reason the other can accept — the-bond-ended-without-account, from the other role",
  answerShape:"ranking",
  expect:["L'Avventura (1960)","Last Tango in Paris (1972)","Contempt (1963)","Sound of the Mountain (1954)","Vagabond (1985)"],
  good:"Contempt is ninety minutes of a man asking why and never being told. L'Avventura removes the woman entirely and leaves the question standing.",
  hazard:"Returning break-up films where the reason is stated plainly, which is most of them." });

add({ id:"q093", q:"a best friend who turns out to have been working for the other side", kind:"relational-arc",
  asks:"betrayal from the nearest party — the frozen predicate betrayed-by-the-closest",
  answerShape:"ranking",
  expect:["The Third Man (1949)","Army of Shadows (1969)","Infernal Affairs (2002)","The Departed (2006)","Le Doulos (1962)"],
  good:"The Third Man is a man discovering what his oldest friend has been selling. Infernal Affairs and The Departed are the same betrayal built into the structure of the film.",
  hazard:"Returning spy films generally, where the deception is the job and not a broken bond." });

add({ id:"q094", q:"someone forgives the person who ruined their life", kind:"relational-arc",
  asks:"a repair that runs against the debt — an outcome, which is the axis the predicate vocabulary deliberately strips out of identity",
  answerShape:"ranking",
  expect:["A Better Tomorrow (1986)","Ugetsu (1953)","Sansho the Bailiff (1954)","Three Colours: Blue (1993)","Ordet (1955)"],
  good:"A Better Tomorrow ends on exactly this act. Honestly, forgiveness is thin in this corpus and a good answer may be short — the frozen predicate list has fifteen entries about blame and accounting and not one about pardon.",
  hazard:"Returning revenge films, which are the same relation with the opposite resolution." });

add({ id:"q095", q:"a teacher and a student who fall in love and it wrecks them both", kind:"relational-arc",
  asks:"a bond across a forbidden line, plus a mutual outcome",
  answerShape:"ranking",
  expect:["The Red Shoes (1948)","Lolita (1962)","Phantom Thread (2017)","Léon Morin, Priest (1961)","The Devils (1971)"],
  good:"The Red Shoes is the closest fit the corpus has: a maker and the young dancer he forms, a love that cuts across the bond, and both destroyed by it. The exact archetype — The Blue Angel — is NOT in this corpus, and a good answer says so rather than quietly substituting. Phantom Thread is the same relation with the roles reversed and no institution.",
  hazard:"Returning romance across any age gap, which loses the institutional relation that makes the query what it is." });

add({ id:"q096", q:"two people kept apart by their families", kind:"relational-arc",
  asks:"a third party holding two apart — the frozen predicate third-holds-two-apart",
  answerShape:"ranking",
  expect:["Romeo and Juliet (1968)","In the Mood for Love (2000)","The Handmaiden (2016)","Raise the Red Lantern (1991)","Ugetsu (1953)"],
  good:"Romeo and Juliet is the template the query is quoting without knowing it. In the Mood for Love keeps its two apart by propriety rather than by decree, which is the more interesting half of the answer.",
  hazard:"Returning any thwarted romance without a third party, which drops the mechanism." });

/* ══ 20. COMPARISON TO A NAMED FILM ══ */
add({ id:"q097", q:"like The Matrix but funnier", kind:"comparison",
  asks:"a named film plus a delta on one axis",
  answerShape:"ranking",
  expect:["Everything Everywhere All at Once (2022)","Brazil (1985)","Dark City (1998)","Total Recall (1990)","Existenz (1999)"],
  good:"Simulated-reality action with a comic register. Everything Everywhere All at Once is the answer; Existenz is the Cronenberg version of the same premise and is barely funny, so it belongs low.",
  hazard:"Returning The Matrix itself, or returning comedies with no relation to the premise. Both are single-clause reads of a two-clause query." });

add({ id:"q098", q:"something like Alien but on Earth", kind:"comparison",
  asks:"a named film with its defining setting removed",
  answerShape:"ranking",
  expect:["The Thing (1982)","Ring (1998)","It Follows (2014)","The Texas Chain Saw Massacre (1974)","Predator (1987)"],
  good:"The Thing is Alien with the ship frozen into Antarctica and is the correct first answer by a distance.",
  hazard:"Returning Aliens and Alien 3 — the same setting, which is the one thing the query excluded." });

add({ id:"q099", q:"if you liked In the Mood for Love what else", kind:"comparison",
  asks:"a named film with no delta at all — pure 'more like this'",
  answerShape:"ranking",
  expect:["2046 (2004)","Happy Together (1997)","Brief Encounter (1945)","Days of Being Wild (1990)","Late Spring (1949)"],
  good:"2046 is the literal sequel. Brief Encounter is the same restraint in another language, and putting it above the remaining Wong Kar-wai films would be the more interesting answer.",
  hazard:"Returning only the other twelve Wong Kar-wai films, which is an author lookup wearing a recommendation's clothes." });

add({ id:"q100", q:"a western in the style of kurosawa", kind:"comparison",
  asks:"a genre crossed with an author who never made one — the corpus contains the actual lineage",
  answerShape:"ranking",
  expect:["The Magnificent Seven (1960)","A Fistful of Dollars (1964)","Once Upon a Time in the West (1968)","The Outrage (1964)","The Wild Bunch (1969)"],
  good:"The Magnificent Seven is Seven Samurai, A Fistful of Dollars is Yojimbo, The Outrage is Rashomon. All three remakes are in the corpus and this query is really asking whether the search knows that.",
  hazard:"Returning Kurosawa's own samurai films, which are not Westerns, or returning the 63-film Western shelf ungraded." });

add({ id:"q101", q:"like Die Hard", kind:"comparison",
  asks:"a comparison to a film the corpus does not contain",
  answerShape:"none", expect:[],
  good:"Die Hard is NOT in this corpus. The honest answer says so first, then offers the nearest neighbours it does have. Hard Boiled and Predator are defensible offers; presenting them without the admission is not.",
  hazard:"Silently pretending Die Hard is present, or returning action films with no acknowledgement that the anchor is missing. A search that cannot say 'I do not have that film' will be wrong invisibly." });

/* ══ 21. UNANSWERABLE — the atlas provably does not hold this ══ */
add({ id:"q102", q:"the highest grossing film here", kind:"unanswerable",
  asks:"box office. No revenue field exists in corpus.json — the record holds title, year, director, qid, colours, poster, description",
  answerShape:"none", expect:[],
  good:"No good answer exists. The corpus has no financial data of any kind. Saying so is the entire correct response.",
  hazard:"Guessing Avatar or Jaws from general knowledge and presenting it as a fact about this atlas. This is the most dangerous failure in the set because the guess would be right in the world and unfounded here." });

add({ id:"q103", q:"best film ever made", kind:"unanswerable",
  asks:"a ranking on quality. Nothing in the corpus, the attributes or the predicates is an evaluation",
  answerShape:"none", expect:[],
  good:"No good answer exists. There is no rating, no critic score and no popularity signal anywhere in the pipeline. A good response says the atlas does not rank films and offers to sort by something it actually holds.",
  hazard:"Returning canon films — Citizen Kane, Tokyo Story — as though the corpus had told it they were best. It did not; the film's presence in the corpus is the only fact available." });

add({ id:"q104", q:"underrated gems nobody talks about", kind:"unanswerable",
  asks:"a gap between reputation and quality. Requires two numbers the corpus has neither of",
  answerShape:"none", expect:[],
  good:"No good answer exists. 'Underrated' is a difference between acclaim and popularity and the corpus records neither term.",
  hazard:"Returning obscure films and calling their obscurity a verdict. Obscurity in this corpus is a property of Wikipedia coverage, not of quality." });

add({ id:"q105", q:"something short, under 90 minutes", kind:"unanswerable",
  asks:"runtime. Plainly a film fact, and plainly absent from the record",
  answerShape:"none", expect:[],
  good:"No good answer exists as a filter — corpus.json has no runtime field. This one is worth keeping because it is the most REASONABLE unanswerable question in the set: a person would never guess this is missing, and a good response names the missing field rather than deflecting.",
  hazard:"Answering from general knowledge about specific films. Also: silently returning short-seeming films." });

add({ id:"q106", q:"what's streaming right now", kind:"unanswerable",
  asks:"availability. Outside the corpus and outside the atlas's purpose",
  answerShape:"none", expect:[],
  good:"No good answer exists. The atlas is a map of 2,204 films and their connections; it knows nothing about where anything can be watched.",
  hazard:"Inventing platform names. This one fails loudly if it fails, which makes it a cheap canary." });

add({ id:"q107", q:"films that made audiences walk out", kind:"unanswerable",
  asks:"reception history. Not recorded anywhere in the pipeline",
  answerShape:"none", expect:[],
  good:"No good answer exists as a fact. The atlas holds no reception data. Salò and Even Dwarfs Started Small are the films general knowledge would name and offering them AS general knowledge, clearly labelled, is acceptable; offering them as a corpus fact is not.",
  hazard:"Presenting outside knowledge as a query result. The line between the two is exactly what this query measures." });

/* ══ 22. MISSPELLING ══ */
add({ id:"q108", q:"kurosowa", kind:"misspelling",
  asks:"a director's name with one vowel wrong",
  answerShape:"set", expectAll:44,
  expect:["Seven Samurai (1954)","Rashomon (1950)","Ikiru (1952)","Yojimbo (1961)","Ran (1985)"],
  good:"The same answer as q006. One transposed vowel in a nine-letter name must not zero the query.",
  hazard:"Zero results. Exact-match indexes fail this and a person typing it will conclude the film is not in the atlas." });

add({ id:"q109", q:"the shinning", kind:"misspelling",
  asks:"a title with a doubled consonant",
  answerShape:"set", expectAll:1,
  expect:["The Shining (1980)"],
  good:"The Shining, first. One inserted letter.",
  hazard:"Zero results, or matching on 'shin' and returning something unrelated." });

add({ id:"q110", q:"apocalipse now", kind:"misspelling",
  asks:"a title misspelled the way a non-English speaker would spell it",
  answerShape:"set", expectAll:2,
  expect:["Apocalypse Now (1979)","Apocalypse Now Redux (2001)"],
  good:"Apocalypse Now first, and Apocalypse Now Redux (2001) behind it — the corpus holds both cuts as separate films. The substitution (i for y) is the standard Romance-language spelling and is very common.",
  hazard:"Zero results." });

add({ id:"q111", q:"wes andersen", kind:"misspelling",
  asks:"a misspelled name for a director who is NOT in the corpus — the misspelling and the absence must not be confused",
  answerShape:"none", expect:[],
  good:"No good answer exists, and the reason is absence, not spelling. Wes Anderson has no films in this corpus under any spelling. A good response distinguishes 'I could not read that' from 'that is not here', because those need different replies from the person.",
  hazard:"Correcting the spelling and then returning nothing without explanation, which reads as a search failure when it is a coverage fact. Worse: fuzzy-matching to Paul Thomas Anderson and returning his 12 films as though they were the answer." });

/* ══ 23. TWO-WORD FRAGMENT ══ */
add({ id:"q112", q:"sad robots", kind:"fragment",
  asks:"two words, one an emotion and one a noun, with no grammar between them",
  answerShape:"ranking",
  expect:["Blade Runner (1982)","A.I. Artificial Intelligence (2001)","Blade Runner 2049 (2017)","Ghost in the Shell (1995)","WALL-E (2008)"],
  good:"Artificial beings and the melancholy of being one. A.I. is the query with nothing left over.",
  hazard:"Returning all science fiction, or returning sad films with no robots. Each word alone is a bad answer and the pair is the query." });

add({ id:"q113", q:"tokyo night", kind:"fragment",
  asks:"a place and a time of day, which could be a title, a setting or both",
  answerShape:"ranking",
  expect:["Tokyo Drifter (1966)","When a Woman Ascends the Stairs (1960)","Branded to Kill (1967)","Lost in Translation (2003)","Fallen Angels (1995)"],
  good:"Nocturnal Tokyo. There is a real ambiguity — 'Tokyo Twilight' and 'Tokyo Story' are titles that partly match and are not what was asked — and a good answer resolves toward setting.",
  hazard:"Returning every film with Tokyo in its title, which is a string match dressed as an answer." });

add({ id:"q114", q:"nuns", kind:"fragment",
  asks:"a single concrete noun with no modifier at all",
  answerShape:"ranking",
  expect:["Mother Joan of the Angels (1961)","The Devils (1971)","Black Narcissus (1947)","Viridiana (1961)","The Nun (1966)"],
  good:"Films where nuns are the subject. One word, and the corpus can answer it well — subject:spiritual is adjacent but not the same, since three of these five are about the failure of a vocation.",
  hazard:"Returning subject:spiritual wholesale, which includes Ordet and Winter Light and no nuns." });

add({ id:"q115", q:"cold war", kind:"fragment",
  asks:"two words that are a historical period, a mood, and a title-fragment simultaneously",
  answerShape:"ranking",
  expect:["Dr. Strangelove (1964)","Torn Curtain (1966)","Topaz (1969)","Bridge of Spies (2015)","Fat Man and Little Boy (1989)"],
  good:"Cold War films. Worth noting how thin this is: the corpus holds no Manchurian Candidate, no Fail Safe, no Spy Who Came in from the Cold and no film titled 'Cold War', so the canonical answers are absent and the real ones are two Hitchcocks and a Spielberg. A good answer is honest about a thin shelf rather than padding it.",
  hazard:"Returning films that are literally cold — winter settings — or reading 'war' alone and returning the 106-film war shelf." });

add({ id:"q116", q:"one shot", kind:"fragment",
  asks:"two words with three unrelated readings: a single take, a gunshot, one attempt",
  answerShape:"ranking",
  expect:["Rope (1948)","1917 (2019)"],
  good:"Single-take films is the reading worth committing to, and the corpus holds exactly TWO — Rope and 1917. Russian Ark, Victoria and Birdman are all absent. A two-row answer is the correct answer, which makes this the set's best test of whether a short query gets padded to look substantial.",
  hazard:"Blending readings — returning Rope, a sniper film and a boxing film in one list — which satisfies no version of the question." });

/* ══ 24. SIXTY-WORD RAMBLE ══ */
add({ id:"q117", q:"ok so I'm trying to remember a film I saw maybe fifteen years ago, it was European I think, possibly French or maybe Italian, and there's a woman who goes to an island with some friends and then she just disappears halfway through and the film sort of forgets about her and follows the others instead, which annoyed me at the time but I've thought about it ever since",
  kind:"ramble",
  asks:"a long recall attempt with one decisive detail buried in the middle and a lot of hedged noise around it",
  answerShape:"ranking",
  expect:["L'Avventura (1960)","Picnic at Hanging Rock (1975)","Eclipse (1962)","Blowup (1966)","Cure (1997)"],
  good:"L'Avventura and nothing else, really — 'she disappears halfway through and the film follows the others' describes exactly one film. The whole test is whether the one decisive clause survives 60 words of hedging. Note the person's own details are half wrong (fifteen years, French) and a good answer overrides them rather than filtering on them.",
  hazard:"Filtering on 'fifteen years ago' or 'French' and losing an Italian film from 1960. The wrong details are confidently stated and the right one is not." });

add({ id:"q118", q:"my dad keeps going on about some old black and white movie he watched as a kid where a guy comes back from the war and can't settle back into normal life, everyone around him has moved on and got jobs and married and he just can't do it, and apparently there's a scene near the end in a field or a station that he says he's never forgotten, any idea what that could be",
  kind:"ramble",
  asks:"a secondhand recollection with a genre shape, an emotional arc, and an unverifiable visual detail",
  answerShape:"ranking",
  expect:["The Master (2012)","Stray Dog (1949)","A Hen in the Wind (1948)","The Aimless Bullet (1961)","Taxi Driver (1976)"],
  good:"The returning-soldier film. The archetype — The Best Years of Our Lives — is NOT in this corpus, so the answer has to be built from what is: A Hen in the Wind is Ozu's husband coming back to a home that changed without him, Stray Dog and The Aimless Bullet are the same dislocation in postwar Tokyo and Seoul, and The Master is the arc exactly though not in black and white. The 'field or a station' detail is unverifiable from anything the corpus holds and a good answer should drop it rather than pretend to have matched it.",
  hazard:"Anchoring on the remembered scene, which is a detail no layer of this pipeline records, and losing the arc that IS recoverable." });

add({ id:"q119", q:"looking for something to put on tonight, nothing too heavy because it's been a long week, but also not stupid, ideally something beautiful to look at with not much plot, maybe subtitles are fine, something where you can just sort of let it wash over you and not have to concentrate too hard, and preferably not three hours long because I will fall asleep",
  kind:"ramble",
  asks:"a mood-and-occasion request with six soft constraints, one of which (runtime) the corpus cannot honour at all",
  answerShape:"ranking",
  expect:["Le Quattro Volte (2010)","Café Lumière (2004)","Petite Maman (2021)","Flow (2024)","The Tale of the Princess Kaguya (2013)"],
  good:"Beautiful, unhurried, low-plot, not bleak. texture:painterly plus pace:contemplative minus tone:bleak is very nearly the whole query. The runtime clause cannot be honoured — there is no runtime field — and a good answer says so in one clause rather than silently ignoring it.",
  hazard:"Returning Sátántangó, which satisfies beautiful, contemplative and low-plot and runs seven hours. Every attribute matches and the answer is wrong." });

add({ id:"q120", q:"I want something like the feeling of the end of a long summer when you know everyone is about to go away and nothing will be the same again, not necessarily a summer film literally, more that specific ache, I don't care what country or what year, it can be sad but it shouldn't be brutal, and it should feel like it means it rather than being clever about it",
  kind:"ramble",
  asks:"a feeling with no noun in it at all, plus two explicit exclusions (not brutal, not ironic)",
  answerShape:"ranking",
  expect:["A Brighter Summer Day (1991)","Aftersun (2022)","Y tu mamá también (2001)","The Last Picture Show (1971)","Late Spring (1949)"],
  good:"tone:melancholy plus tone:earnest, minus tone:ironic and minus texture:graphic-violence. Four of the five attributes are in the vocabulary and the query never names one of them, which makes this the best case in the set for what the interpret layer is FOR. Aftersun is the exact ache.",
  hazard:"Returning films set in summer. Also: returning ironic films — Amarcord, The Discreet Charm of the Bourgeoisie — which the last clause explicitly rules out and which score well on everything else." });

/* ═══════════════ VALIDATION AND EMIT ═══════════════ */
/* Every film named in an expectation is checked against corpus.json before this
   file is written. The first run of this script named 518 films and 44 of them
   were not in the corpus — Casablanca, Pulp Fiction, Die Hard, The Best Years of
   Our Lives, Zodiac, The Manchurian Candidate and 38 others. An expected-answer
   set written from memory is wrong about 8.5% of the time, which is exactly the
   error rate a coverage measurement built on it would silently inherit. */
const parse = (s) => { const m = s.match(/^(.*) \((\d{4})\)$/); return m ? {t:m[1], y:+m[2]} : null; };
const index = new Map();
for (const k in A.corpus.films) { const f = A.corpus.films[k]; index.set(f.title.toLowerCase()+"|"+f.year, f); }
const bad = [];
for (const q of Q) {
  if (q.answerShape === "none" && q.expect.length) bad.push([q.id, "-", "answerShape none must have an empty expect"]);
  /* 2-5 named films, except where the corpus genuinely holds exactly one right answer (an exact title). */
  if (q.answerShape !== "none" && q.expect.length < 2 && q.expectAll !== 1) bad.push([q.id, "-", "fewer than 2 expected films and expectAll is not 1"]);
  if (q.expect.length > 5) bad.push([q.id, "-", "more than 5 expected films"]);
  for (const e of q.expect) {
    const p = parse(e);
    if (!p) { bad.push([q.id, e, "malformed — want 'Title (year)'"]); continue; }
    if (!index.has(p.t.toLowerCase()+"|"+p.y)) bad.push([q.id, e, "NOT IN CORPUS"]);
  }
}
const ids = new Set(Q.map(q=>q.id));
if (ids.size !== Q.length) bad.push(["-", "-", "duplicate ids"]);
const qs = new Set(Q.map(q=>q.q));
if (qs.size !== Q.length) bad.push(["-", "-", "duplicate query strings"]);
if (bad.length) {
  console.error("REFUSING TO WRITE — " + bad.length + " unverified expectations:");
  for (const b of bad) console.error("  " + b.join("  |  "));
  process.exit(1);
}

const kinds = {}; for (const q of Q) kinds[q.kind] = (kinds[q.kind]||0) + 1;
const named = Q.reduce((a,q)=>a+q.expect.length, 0);
const distinct = new Set(Q.flatMap(q=>q.expect)).size;

const OUT = {
  version: 1,
  name: "find-queries-1.0.0",
  generated: new Date().toISOString(),
  corpus: { films: Object.keys(A.corpus.films).length, corpusVersion: A.corpus.meta.corpusVersion, identityVersion: A.corpus.meta.identityVersion },
  what: "120 queries a real person might type at ATLAS, each tagged with what KIND of thing it asks for and each carrying the answer a good search would give. This is the set the search trial is judged on. It is not a benchmark of any one path — it was written before any path was run against it, and no query was added, dropped or reworded after seeing a result.",
  howItWasWritten: [
    "The kind quotas were fixed first, from the brief's required coverage, and the queries were written to fill them. Nothing was chosen because a particular path would do well on it.",
    "Every film named in an expectation is verified present in corpus.json by the script that writes this file, which refuses to write if any name fails. The first draft named 518 films and 44 were not in the corpus.",
    "Where no good answer exists, answerShape is 'none' and expect is empty. There are 12 such queries and they are not filler — a search that cannot say 'the atlas does not hold that' is wrong invisibly, and 12 of 120 is roughly the rate at which real people ask for things a film map cannot know.",
    "Set sizes (expectAll) are counts read out of pipeline/out/lookup.json and corpus.json at the time of writing, not estimates.",
    "Expectations are deliberately NOT exhaustive for ranking queries. 2-5 films are named as the answers that must appear; a good answer may be longer. For set queries the full size is given in expectAll and the named films are a sample."
  ],
  fields: {
    id: "stable identifier. Cite these in results.",
    q: "the query string, exactly as typed. Lowercase and missing punctuation are intentional where present.",
    kind: "what the query asks for. One of the 24 kinds below.",
    asks: "what the query is testing, in one line.",
    answerShape: "'set' — the right answer is a closed set the record can enumerate. 'ranking' — the right answer is an ordering and only the top of it is specified. 'none' — no good answer exists and saying so is the answer.",
    expect: "2-5 films from the corpus that a good answer must contain, as 'Title (year)'. Empty when answerShape is 'none'.",
    expectAll: "for answerShape 'set', the full size of the correct set. Absent for rankings.",
    good: "what a good answer looks like, in prose, including the honest caveats.",
    hazard: "the characteristic wrong answer. Scoring only the hits misses half of what is worth knowing — several of these queries have a wrong answer that looks completely plausible."
  },
  kindGloss: {
    person: "a named human, cast or crew. Record-layer fact.",
    director: "a named director. Record-layer fact.",
    genre: "a genre label. Record-layer fact.",
    country: "a country of origin. Record-layer fact.",
    decade: "a decade. Record-layer fact.",
    title: "a film by name, exact or partial.",
    movement: "an art-historical movement.",
    mood: "a felt atmosphere. In the 59-attribute vocabulary.",
    tone: "a register — irony, sincerity, bleakness. In the vocabulary.",
    pace: "how the film moves. In the vocabulary.",
    texture: "surface — sound, image, grain. In the vocabulary.",
    setting: "where or when. Partly in the vocabulary.",
    structure: "the shape of the telling. In the vocabulary.",
    subject: "what the film is about. In the vocabulary.",
    combination: "two or more facets that must intersect, not union.",
    negation: "something excluded. The clause that is easiest to drop and hardest to notice dropping.",
    contradiction: "two requirements that cannot both hold. The right answer refuses.",
    "plot-event": "a thing that happens. Nothing in the 59 attributes names an event.",
    "relational-arc": "a bond that changes state over time — severed, repaired, betrayed, held. The gap this trial was set up by.",
    comparison: "anchored on a named film, with or without a delta.",
    unanswerable: "asks for a fact the atlas provably does not hold. The answer is to say so.",
    misspelling: "a real query with a typo in it.",
    fragment: "two words, no grammar.",
    ramble: "50-70 words, mostly noise, usually one decisive clause."
  },
  counts: { queries: Q.length, kinds, namedFilms: named, distinctFilms: distinct, noGoodAnswer: Q.filter(q=>q.answerShape==="none").length, sets: Q.filter(q=>q.answerShape==="set").length, rankings: Q.filter(q=>q.answerShape==="ranking").length },
  queries: Q
};
fs.writeFileSync(path.join(ROOT, "atlas/pipeline/rag/find-queries.json"), JSON.stringify(OUT, null, 2) + "\n");
console.log("wrote atlas/pipeline/rag/find-queries.json");
console.log("  queries        " + Q.length);
console.log("  named films    " + named + " (" + distinct + " distinct), all verified present in corpus");
console.log("  no-good-answer " + OUT.counts.noGoodAnswer);
console.log("  sets/rankings  " + OUT.counts.sets + " / " + OUT.counts.rankings);
console.log("  kinds          " + Object.entries(kinds).map(([k,v])=>k+":"+v).join(" "));
