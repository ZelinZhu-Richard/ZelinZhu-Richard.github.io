// Daily: content tables, transcribed from the JSON blocks of workspace/daily/CONTENT.md (sections A–I).
// Tables live here; every tunable number the rules read lives in config.js. Where a CONTENT.md block repeats a
// number (caps, prices, formulas), config.js is the copy the engine reads and this one is documentation.
// Season tier 20 lists "sproutCharm": the engine gives the charm kind named by config.charms.season instead
// (default 'tier', the spec's tier charm; the balance script decides).

// CONTENT.md A.2: species, display (line) names, unlocks, patron tags and name pools.
export const SPECIES = [
  {"id":"dragon","name":"Drakelet","unlock":{"type":"launch"},"role":"hoard","patron":"physical","personality":"A proud little hoarder who counts coins in its sleep and treats every workout like a dragon fight.","namePool":["Ember","Cinder","Toast","Saffron","Flint","Paprika","Sizzle","Kindle","Magma","Wick","Sterling","Nova"]},
  {"id":"fox","name":"Kitsu","unlock":{"type":"launch"},"role":"luck","patron":"outdoors","personality":"Quick, cheeky and lucky. It can't sit still until you've been outside.","namePool":["Pip","Kit","Maple","Rusty","Juniper","Clementine","Tango","Ginger","Biscuit","Fennel","Vesper","Scout"]},
  {"id":"slime","name":"Gumdrop","unlock":{"type":"launch"},"role":"efficiency","patron":"food","personality":"Cheerful, squishy and never wastes a crumb.","namePool":["Mochi","Bean","Jelly","Gloop","Dumpling","Boba","Wobble","Pudding","Gummy","Tapioca","Squish","Plop"]},
  {"id":"owl","name":"Hootling","unlock":{"type":"launch"},"role":"scholar","patron":"study","personality":"Studious and a little smug. It celebrates a finished page like a solved mystery.","namePool":["Euler","Ada","Gödel","Turing","Boole","Noether","Quill","Sage","Inky","Hoot","Atlas","Minerva"]},
  {"id":"turtle","name":"Pebbleback","unlock":{"type":"launch"},"role":"guardian","patron":"sleep","personality":"Calm, steady and unbothered. Rest is a skill, and it's very good at it.","namePool":["Pebble","Mossy","Tortellini","Shelly","Basil","Bramble","Cobble","Dune","Sprout","Kale","Juno","Tank"]},
  {"id":"axolotl","name":"Ripplegill","unlock":{"type":"launch"},"role":"regenerator","patron":"lastMissed","personality":"A gentle optimist that grows back stronger. Bad days happen; it's still smiling.","namePool":["Bubbles","Peach","Gil","Wasabi","Coral","Blossom","Mo","Sakura","Ripple","Dot","Noodle","Taffy"]},
  {"id":"hedgehog","name":"Bramblekin","unlock":{"type":"keeper","level":25},"role":"collector","patron":"frog","personality":"A meticulous little collector who believes every small effort belongs somewhere.","namePool":["Bramble","Thimble","Burr","Pipkin","Hazel","Chestnut","Button","Crumb","Prickle","Pocket","Truffle","Tumble"]}
];

// CONTENT.md A.1: patron task tags (cosmetic only).
export const PATRON_TAGS = ["physical","outdoors","food","study","sleep","frog"];

// CONTENT.md A.3.
export const LAUNCH_PROLOGUE = {
  start: "2026-10-25",
  end: "2026-10-31",
  seasonCardCopy: "First season begins November 1. Your Keeper progress is already growing."
};

export const COSMETIC_RULES = {
  accountWide: true,
  survivesDeath: true,
  equipPerPet: 1,
  anchor: "headTop",
  behind: "occlude-front"
};

// CONTENT.md A.3: season-30 cosmetics by month.
export const SEASON_COSMETICS = [
  {"season":"2026-11","seasonName":"Small Beginnings","id":"acornCap","name":"Acorn Cap","colors":["#8a5a3b","#6b4329","#f3e6c8","#5c3b22"],"motion":"stemSway"},
  {"season":"2026-12","seasonName":"A Little Light","id":"snowfallBeanie","name":"Snowfall Beanie","colors":["#3f5fa8","#2f4c8c","#ffffff"],"motion":"pomBounce"},
  {"season":"2027-01","seasonName":"Fresh Pages","id":"paperPartyCrown","name":"Paper Party Crown","colors":["#ffd34d","#e3b23c","#ff7fb6","#9fd4ff"],"motion":"fireworkPop10s"},
  {"season":"2027-02","seasonName":"Warm Company","id":"heartPatchBeret","name":"Heart Patch Beret","colors":["#d98ba0","#fff1df","#b3667c"],"motion":"none"},
  {"season":"2027-03","seasonName":"New Growth","id":"blossomSprig","name":"Blossom Sprig","colors":["#8a5a3b","#ffd3ec","#ff9ecf"],"motion":"petalDrift8s"},
  {"season":"2027-04","seasonName":"Rain and Shine","id":"rainBucketHat","name":"Rain Bucket Hat","colors":["#ffd34d","#e3b23c","#9fd4ff"],"motion":"brimDrip9s"}
];

// CONTENT.md B: skill rules (the numeric caps are mirrored in config.js EFFECT_CAPS, which the engine reads).
export const SKILL_RULES = {
  model: "perSpecies",
  cumulative: true,
  activeOnly: true,
  beaconExtends: "seatAbilityOnly",
  deactivateBelowUnlockLevel: true,
  regrantOnRegain: false,
  globalSameSkillStacks: false,
  shield: {
    appliesTo: ["hungry","starving"],
    maxLevelsPreventedPerPetPerEvent: 1,
    neverShields: ["underfed","upkeep"]
  },
  comeback: {
    base: 2,
    maxBonus: 1,
    max: 3,
    onlyWhileOwed: true
  },
  caps: {
    perPetPctPerType: 100,
    petEggChancePctPerPet: 50,
    teamHatchLuckPts: 3,
    commitBonusPts: 10,
    extraLootItemsTotal: 8
  },
  streakEggBonusRule: "pays on streak nights where streakDay % N == 0",
  petXpNeverAffects: ["foodEarned","keeperXp","seasonXp"],
  NEW: ["globalSameSkillStacks","shield.maxLevelsPreventedPerPetPerEvent","caps.petEggChancePctPerPet","caps.teamHatchLuckPts"]
};

// CONTENT.md B: per-species skills.
export const SKILLS = {
  dragon: [
    {"lv":10,"id":"goldSniffer","name":"Gold Sniffer","desc":"Pays 10% more dividend coins.","effects":[{"type":"dividendPct","value":10,"scope":"self"}]},
    {"lv":25,"id":"treasureSense","name":"Treasure Sense","desc":"Coin piles in every egg come out 8% bigger.","effects":[{"type":"lootCoinPct","value":8,"scope":"global"}]},
    {"lv":40,"id":"warmClutch","name":"Warm Clutch","desc":"Sits on its egg meter like a nest: +10% fill.","effects":[{"type":"eggMeterPct","value":10,"scope":"self"}]},
    {"lv":55,"id":"hoardShare","name":"Hoard Share","desc":"Shares the hoard: every active pet pays 15% more dividends.","effects":[{"type":"dividendPct","value":15,"scope":"team"}]},
    {"lv":70,"id":"dragonsShare","name":"Dragon's Share","desc":"Every coin you earn gets 5% extra shine.","effects":[{"type":"coinPct","value":5,"scope":"global"}]},
    {"lv":85,"id":"wyrmFacets","name":"Wyrm Facets","desc":"Polishes 50% more diamond shards for the team.","effects":[{"type":"shardPct","value":50,"scope":"team"}]},
    {"lv":100,"id":"skySovereign","name":"Sky Sovereign","desc":"The hoard of hoards.","effects":[{"type":"coinPct","value":10,"scope":"global"},{"type":"dividendPct","value":25,"scope":"team"}]}
  ],
  fox: [
    {"lv":10,"id":"quickPaws","name":"Quick Paws","desc":"Slips one more item into every egg it lays.","effects":[{"type":"extraLootItems","value":1,"scope":"self"}]},
    {"lv":25,"id":"errandRunner","name":"Errand Runner","desc":"Quests pay 10% more.","effects":[{"type":"questCoinPct","value":10,"scope":"global"}]},
    {"lv":40,"id":"luckyTail","name":"Lucky Tail","desc":"Its eggs hide pet eggs a bit more often (+10% relative).","effects":[{"type":"petEggChancePct","value":10,"scope":"self"}]},
    {"lv":55,"id":"bagOfTricks","name":"Bag of Tricks","desc":"Another item, from who knows where.","effects":[{"type":"extraLootItems","value":1,"scope":"self"}]},
    {"lv":70,"id":"foxfire","name":"Foxfire","desc":"Its glow warms every hatching egg (+1 pt).","effects":[{"type":"hatchLuckPts","value":1,"scope":"team"}]},
    {"lv":85,"id":"kitsuneGrin","name":"Kitsune Grin","desc":"Luck that's almost suspicious (+15% relative).","effects":[{"type":"petEggChancePct","value":15,"scope":"self"}]},
    {"lv":100,"id":"nineTailed","name":"Nine-Tailed","desc":"Nine tails, nine pockets.","effects":[{"type":"extraLootItems","value":2,"scope":"self"},{"type":"hatchLuckPts","value":1,"scope":"team"}]}
  ],
  slime: [
    {"lv":10,"id":"tinyAppetite","name":"Tiny Appetite","desc":"Counts as fed at 90. Growth still starts after 100.","effects":[{"type":"foodNeedReduce","value":10,"scope":"self"}]},
    {"lv":25,"id":"soakItUp","name":"Soak It Up","desc":"Backpack pets cost 2 less food to keep.","effects":[{"type":"upkeepReduce","value":2,"scope":"global"}]},
    {"lv":40,"id":"bounceBack","name":"Bounce Back","desc":"Squishes back after a bad day: comeback +0.5.","effects":[{"type":"comebackMult","value":0.5,"scope":"self"}]},
    {"lv":55,"id":"budOff","name":"Bud Off","desc":"Little blobs bud off into eggs: +15% egg meter.","effects":[{"type":"eggMeterPct","value":15,"scope":"self"}]},
    {"lv":70,"id":"megaAbsorb","name":"Mega Absorb","desc":"Counts as fed at 70. Nothing wasted.","effects":[{"type":"foodNeedReduce","value":20,"scope":"self"}]},
    {"lv":85,"id":"oneBigBlob","name":"One Big Blob","desc":"The backpack becomes one comfy puddle: upkeep −3 more.","effects":[{"type":"upkeepReduce","value":3,"scope":"global"}]},
    {"lv":100,"id":"kingGumdrop","name":"King Gumdrop","desc":"Royalty, in jelly form.","effects":[{"type":"eggMeterPct","value":25,"scope":"self"},{"type":"extraLootItems","value":1,"scope":"self"}]}
  ],
  owl: [
    {"lv":10,"id":"studyHall","name":"Study Hall","desc":"Learns 10% faster than the others.","effects":[{"type":"xpPct","value":10,"scope":"self"}]},
    {"lv":25,"id":"studyGroup","name":"Study Group","desc":"Everyone learns 5% faster around it.","effects":[{"type":"xpPct","value":5,"scope":"team"}]},
    {"lv":40,"id":"secondWind","name":"Second Wind","desc":"Helps the team win back lost levels: comeback +0.5.","effects":[{"type":"comebackMult","value":0.5,"scope":"team"}]},
    {"lv":55,"id":"officeHours","name":"Office Hours","desc":"Quests pay 15% more when someone's checking your work.","effects":[{"type":"questCoinPct","value":15,"scope":"global"}]},
    {"lv":70,"id":"promiseKeeper","name":"Promise Keeper","desc":"Keep your morning commitment and it pays 3 pts more.","effects":[{"type":"commitBonusPts","value":3,"scope":"global"}]},
    {"lv":85,"id":"clearSight","name":"Clear Sight","desc":"Sees the rarer chick inside the shell (+1 pt).","effects":[{"type":"hatchLuckPts","value":1,"scope":"team"}]},
    {"lv":100,"id":"grandArchivist","name":"Grand Archivist","desc":"Every page you read, remembered.","effects":[{"type":"xpPct","value":20,"scope":"team"},{"type":"commitBonusPts","value":2,"scope":"global"}]}
  ],
  turtle: [
    {"lv":10,"id":"homeShell","name":"Home Shell","desc":"Backpack friends cost 1 less food to keep.","effects":[{"type":"upkeepReduce","value":1,"scope":"global"}]},
    {"lv":25,"id":"longRoad","name":"Long Road","desc":"Every 7th streak night, one extra egg.","effects":[{"type":"streakEggBonus","value":1,"scope":"global","everyN":7}]},
    {"lv":40,"id":"shellUp","name":"Shell Up","desc":"Loses one less level on a Hungry or Starving night.","effects":[{"type":"levelLossShield","value":1,"scope":"self"}]},
    {"lv":55,"id":"shelter","name":"Shelter","desc":"Shields every active pet a little (max 1 level per pet).","effects":[{"type":"levelLossShield","value":1,"scope":"team"}]},
    {"lv":70,"id":"oldSoul","name":"Old Soul","desc":"Recovery is just patience: team comeback +0.5.","effects":[{"type":"comebackMult","value":0.5,"scope":"team"}]},
    {"lv":85,"id":"longRoad2","name":"Long Road II","desc":"Weekly streak nights get one more egg.","effects":[{"type":"streakEggBonus","value":1,"scope":"global","everyN":7}]},
    {"lv":100,"id":"worldTurtle","name":"World Turtle","desc":"Carries everyone, steadily.","effects":[{"type":"dividendPct","value":20,"scope":"team"},{"type":"upkeepReduce","value":2,"scope":"global"}]}
  ],
  axolotl: [
    {"lv":10,"id":"regrow","name":"Regrow","desc":"Gets lost levels back faster: comeback +0.5.","effects":[{"type":"comebackMult","value":0.5,"scope":"self"}]},
    {"lv":25,"id":"bubbleNest","name":"Bubble Nest","desc":"Everyone's egg meter fills 5% quicker.","effects":[{"type":"eggMeterPct","value":5,"scope":"team"}]},
    {"lv":40,"id":"softLanding","name":"Soft Landing","desc":"Loses one less level on a Hungry or Starving night.","effects":[{"type":"levelLossShield","value":1,"scope":"self"}]},
    {"lv":55,"id":"spawnPond","name":"Spawn Pond","desc":"Its eggs hold one more item.","effects":[{"type":"extraLootItems","value":1,"scope":"self"}]},
    {"lv":70,"id":"neoteny","name":"Neoteny","desc":"The whole team bounces back like kids: comeback +0.5.","effects":[{"type":"comebackMult","value":0.5,"scope":"team"}]},
    {"lv":85,"id":"clutchOfPlenty","name":"Clutch of Plenty","desc":"Team egg meters fill 10% quicker.","effects":[{"type":"eggMeterPct","value":10,"scope":"team"}]},
    {"lv":100,"id":"foreverYoung","name":"Forever Young","desc":"Never stops growing: +20% XP and its eggs hide pet eggs 20% more often.","effects":[{"type":"xpPct","value":20,"scope":"self"},{"type":"petEggChancePct","value":20,"scope":"self"}]}
  ],
  hedgehog: [
    {"lv":10,"id":"pocketFinds","name":"Pocket Finds","desc":"Coin piles in eggs come out 5% bigger.","effects":[{"type":"lootCoinPct","value":5,"scope":"global"}]},
    {"lv":25,"id":"tidyPouch","name":"Tidy Pouch","desc":"One more item in every egg it lays.","effects":[{"type":"extraLootItems","value":1,"scope":"self"}]},
    {"lv":40,"id":"thorough","name":"Thorough","desc":"+10% egg meter.","effects":[{"type":"eggMeterPct","value":10,"scope":"self"}]},
    {"lv":55,"id":"curator","name":"Curator","desc":"Quests pay 10% more.","effects":[{"type":"questCoinPct","value":10,"scope":"global"}]},
    {"lv":70,"id":"collectorsEye","name":"Collector's Eye","desc":"Team diamond shards +30%.","effects":[{"type":"shardPct","value":30,"scope":"team"}]},
    {"lv":85,"id":"fullPockets","name":"Full Pockets","desc":"Two more items in every egg it lays.","effects":[{"type":"extraLootItems","value":2,"scope":"self"}]},
    {"lv":100,"id":"grandCollection","name":"Grand Collection","desc":"Everything finds its place.","effects":[{"type":"coinPct","value":10,"scope":"global"},{"type":"eggMeterPct","value":15,"scope":"team"}]}
  ]
};

// CONTENT.md C: shared star abilities.
export const STAR_ABILITIES = [
  {"stars":2,"id":"twinSpark","name":"Twin Spark","desc":"Egg meter and XP both 10% faster.","copies":2,"effects":[{"type":"eggMeterPct","value":10,"scope":"self"},{"type":"xpPct","value":10,"scope":"self"}]},
  {"stars":3,"id":"secondHelping","name":"Second Helping","desc":"+2 items in every egg it lays.","copies":4,"effects":[{"type":"extraLootItems","value":2,"scope":"self"}]},
  {"stars":4,"id":"goldenTouch","name":"Golden Touch","desc":"+25% dividends and shards, +1 item per egg.","copies":8,"effects":[{"type":"dividendPct","value":25,"scope":"self"},{"type":"shardPct","value":25,"scope":"self"},{"type":"extraLootItems","value":1,"scope":"self"}]},
  {"stars":5,"id":"nineLives","name":"Nine Lives","desc":"Survives one death, once per lineage.","copies":16,"visual":"goldRimLight","effects":[{"type":"deathSave","value":1,"scope":"self","recharge":"never; one charge per lineage, granted on first reaching 5 stars"}],"survival":{"level":1,"foodToday":0,"keeps":["species","tier","stars","trinkets"],"owesComebackXp":true},"doesNotPrevent":["streakReset","otherPetsDying","backpackLoss","missCountProcessing","futureUnderfeedPenalties"],"inheritance":"Spent-charge history persists through moving, Phoenix revival and any merge/combine descendant."}
];

// CONTENT.md D.
export const TRINKET_RULES = {
  minimumPetTier: "epic",
  slotsPerPet: 5,
  activeWearerOnly: true,
  beaconExtends: false,
  noDuplicatePerPet: true,
  maxLuckTaggedPerPet: 1,
  foodNeedMin: 70,
  foodReductionRule: "Lowers only the fed/dividend threshold; XP and egg meter still come only from food beyond 100.",
  eggSnapshotRule: "Item-count and meter effects are fixed when an egg is laid.",
  equipSwapRule: "Equipping never retroactively credits food, XP, dividends or laid eggs.",
  extraLootRule: "Extra items never add a pet-egg or Ultra-trinket roll.",
  dropSelection: "Uniform over eligible tiers <= egg tier, then uniform within the tier; Ultra eggs' 10% roll picks a uniform Ultra trinket.",
  NEW: ["noDuplicatePerPet","maxLuckTaggedPerPet"]
};

// CONTENT.md D: Ultra flash sale (numbers mirrored in config.js).
export const ULTRA_SALE = {
  normalAvailability: false,
  basePrice: 22000,
  discountPct: 30,
  salePrice: 15400,
  floor: 15000,
  windowHours: 24,
  offers: "all",
  surface: "shopOnly",
  copy: "A remarkable find. Available until {dateTime}."
};

// CONTENT.md D: trinket catalogue.
export const TRINKETS = [
  {"id":"copperBell","tier":"epic","name":"Copper Bell","flavour":"Rings when breakfast is ready.","effects":[{"type":"eggMeterPct","value":8,"scope":"self"}]},
  {"id":"dogEaredBookmark","tier":"epic","name":"Dog-eared Bookmark","flavour":"It remembers where you left off.","effects":[{"type":"xpPct","value":10,"scope":"self"}]},
  {"id":"luckyPebble","tier":"epic","name":"Lucky Pebble","tags":["luck"],"flavour":"Smooth from a thousand thumb-rubs.","effects":[{"type":"petEggChancePct","value":8,"scope":"self"}]},
  {"id":"coinPurse","tier":"epic","name":"Coin Purse","flavour":"Jingles when it's fed.","effects":[{"type":"dividendPct","value":15,"scope":"self"}]},
  {"id":"mossCloak","tier":"epic","name":"Moss Cloak","flavour":"Soft landing.","effects":[{"type":"levelLossShield","value":1,"scope":"self"}]},
  {"id":"stitchedPatch","tier":"epic","name":"Stitched Patch","flavour":"Mended things have more stories.","effects":[{"type":"comebackMult","value":0.25,"scope":"self"}]},
  {"id":"moonstoneEggcup","tier":"mythic","name":"Moonstone Egg-cup","flavour":"Eggs come quicker under moonlight.","effects":[{"type":"eggMeterPct","value":15,"scope":"self"}]},
  {"id":"fourfoldClover","tier":"mythic","name":"Fourfold Clover","tags":["luck"],"flavour":"Four leaves. Count them.","effects":[{"type":"petEggChancePct","value":15,"scope":"self"}]},
  {"id":"foldingAtlas","tier":"mythic","name":"Folding Atlas","flavour":"The next page is always somewhere new.","effects":[{"type":"xpPct","value":20,"scope":"self"}]},
  {"id":"treasureMap","tier":"mythic","name":"Treasure Map","flavour":"X marks one more item.","effects":[{"type":"extraLootItems","value":1,"scope":"self"}]},
  {"id":"questRibbon","tier":"mythic","name":"Quest Ribbon","flavour":"Pinned on for good work.","effects":[{"type":"questCoinPct","value":15,"scope":"global"}]},
  {"id":"returnCompass","tier":"mythic","name":"Return Compass","flavour":"Its favourite direction is back.","effects":[{"type":"comebackMult","value":0.5,"scope":"self"}]},
  {"id":"sunforgedCrown","tier":"legendary","name":"Sunforged Crown","flavour":"Heavy is the head that pays dividends.","effects":[{"type":"dividendPct","value":40,"scope":"self"},{"type":"shardPct","value":40,"scope":"self"}]},
  {"id":"dragonglassPrism","tier":"legendary","name":"Dragon-glass Prism","tags":["luck"],"flavour":"Bends the odds a little toward rare.","effects":[{"type":"hatchLuckPts","value":1,"scope":"team"}]},
  {"id":"hornOfPlenty","tier":"legendary","name":"Horn of Plenty","flavour":"Overflowing.","effects":[{"type":"extraLootItems","value":2,"scope":"self"}]},
  {"id":"aegisShell","tier":"legendary","name":"Aegis Shell","flavour":"Guards everyone a little.","effects":[{"type":"levelLossShield","value":1,"scope":"team"}]},
  {"id":"meteorShard","tier":"legendary","name":"Meteor Shard","flavour":"Fell from the sky, still warm.","effects":[{"type":"eggMeterPct","value":25,"scope":"self"}]},
  {"id":"oathRing","tier":"legendary","name":"Oath Ring","flavour":"Keep the promise you made this morning.","effects":[{"type":"commitBonusPts","value":3,"scope":"global"}]},
  {"id":"keepersCrown","tier":"ultra","name":"Keeper's Crown","flavour":"Everything you earn, shinier.","effects":[{"type":"coinPct","value":25,"scope":"global"},{"type":"questCoinPct","value":50,"scope":"global"}]},
  {"id":"theLongSun","tier":"ultra","name":"The Long Sun","flavour":"A day that never stops giving.","effects":[{"type":"eggMeterPct","value":50,"scope":"team"}]},
  {"id":"heartstone","tier":"ultra","name":"Heartstone","flavour":"It beats for you.","effects":[{"type":"deathSave","value":1,"scope":"self","recharge":"30 complete days after use; charge state stored on the trinket, not the pet"},{"type":"comebackMult","value":1,"scope":"self"}]},
  {"id":"dawnOath","tier":"ultra","name":"Dawn Oath","flavour":"Commit at sunrise; the world pays out.","effects":[{"type":"commitBonusPts","value":10,"scope":"global"},{"type":"streakEggBonus","value":2,"scope":"global","everyN":7}]},
  {"id":"starMap","tier":"ultra","name":"Star Map","tags":["luck"],"flavour":"Charts where the rare ones hatch.","effects":[{"type":"hatchLuckPts","value":2,"scope":"team"},{"type":"petEggChancePct","value":25,"scope":"self"}]}
];

// CONTENT.md E: real-life rewards (owner-editable defaults).
export const REAL_LIFE = {
  coinsPerGoodDay: 300,
  guidanceCopy: "About 300 coins ≈ one good day. Rewards add to life; they never gate sleep, meals or friends.",
  redemptionCopy: "Redeemed. Enjoy it when it fits your day.",
  rules: {
    screenRewardsEndBy: "21:30",
    expire: false,
    sameDayUseRequired: false,
    log: true,
    markTaken: true,
    gatesBasicNeedsOrRelationships: false,
    cashRule: "Purchases use the owner's normal real-life budget."
  },
  rewards: [
    {"id":"dessertRun","name":"Dessert run","size":"S","coins":450},
    {"id":"cafeDrink","name":"Boba or a good café drink","size":"S","coins":600},
    {"id":"gamingHour","name":"An hour of games, on purpose","size":"S","coins":600,"maxPerDay":1,"endsBy":"21:30"},
    {"id":"nicePen","name":"A really nice pen","size":"S","coins":750},
    {"id":"movieNight","name":"Movie or two episodes","size":"S","coins":900,"endsBy":"21:30"},
    {"id":"takeoutLunch","name":"Favourite takeout lunch","size":"M","coins":1200},
    {"id":"bookshopPick","name":"One bookshop pick, fiction welcome","size":"M","coins":1800},
    {"id":"gamingAfternoon","name":"Weekend gaming afternoon, 3 h","size":"M","coins":2400,"endsBy":"21:30","weekendOnly":true},
    {"id":"modelKit","name":"A model-kit afternoon","size":"M","coins":2700},
    {"id":"indieGame","name":"A new indie game (≤ $20)","size":"L","coins":3600},
    {"id":"museumMorning","name":"A museum morning","size":"L","coins":4500},
    {"id":"bigLego","name":"A big LEGO build (≤ $60)","size":"L","coins":7500},
    {"id":"dayTrip","name":"A day trip somewhere new","size":"L","coins":9000},
    {"id":"ticket","name":"Concert or game ticket","size":"L","coins":12000}
  ]
};

// CONTENT.md F: Keeper road (formulas mirrored in config.js).
export const KEEPER = {
  startLevel: 1,
  grantStartLevelReward: true,
  xpToNext: "1000 + 250 * K",
  xpSource: "final task food after commitment bonus and soft cap, credited once",
  coinsOnReach: "20 + 5 * K",
  bonusCoinsEvery10: 250,
  every5: {
    diamonds: 10,
    backpack: 1
  },
  titles: {
    "1": "Apprentice Keeper",
    "10": "Keeper",
    "20": "Senior Keeper",
    "30": "Warden",
    "40": "Grand Warden",
    "50": "Elder Keeper",
    "60": "Head Keeper"
  },
  special: [
    {"lv":3,"cosmetic":"seedling"},
    {"lv":5,"cosmetic":"keepersCap"},
    {"lv":15,"cosmetic":"studyHeadphones"},
    {"lv":20,"cosmetic":"littleLantern"},
    {"lv":25,"species":"hedgehog"},
    {"lv":30,"cosmetic":"fieldPencil"},
    {"lv":40,"cosmetic":"graduationCap"},
    {"lv":45,"cosmetic":"mossBeret"},
    {"lv":50,"cosmetic":"orbitClub"},
    {"lv":55,"auraAddon":"cometTrail"},
    {"lv":60,"cosmetic":"keepersLaurel"}
  ],
  roadCosmetics: {
    seedling: {
      colors: ["#4f9a45","#7ccf6b"],
      motion: "leafSway"
    },
    keepersCap: {
      colors: ["#e8dcc4","#6b3f7a","#c9a2ff"]
    },
    studyHeadphones: {
      colors: ["#2b2740","#6f6585","#9fd4ff"]
    },
    littleLantern: {
      colors: ["#6b3f7a","#ffb347","#ffe08a"]
    },
    fieldPencil: {
      colors: ["#f3e6c8","#ffd34d","#ff9ecf","#e3cf72"]
    },
    graduationCap: {
      colors: ["#1f1b2e","#ffe08a"],
      motion: "tasselSwing"
    },
    mossBeret: {
      colors: ["#9bb58a","#4f9a45"]
    },
    orbitClub: {
      colors: ["#dfccff","#cfd3e0","#9fd4ff"]
    },
    keepersLaurel: {
      colors: ["#f3e6c8","#e3cf72","#6b3f7a"]
    },
    cometTrail: {
      type: "auraAddon",
      dots: 5,
      fadeS: 0.5
    }
  },
  totalsThrough60: {
    coins: 11850,
    diamonds: 120,
    backpackSpaces: 12,
    speciesUnlocks: 1,
    cosmetics: 9
  },
  beyond60: "Coin formula and every-5 rewards continue; no further unlocks.",
  levelUpCopy: "Keeper {level}. This progress stays."
};

// CONTENT.md G: daily quests and the weekly chest.
export const QUESTS = {
  perDay: 3,
  drawTimeLocal: "05:00",
  timezone: "America/New_York",
  rng: "seeded(account, date), persisted",
  rerolls: 0,
  slots: [
    ["progress"],
    ["task"],
    ["care","task"]
  ],
  maxTimedPerDay: 1,
  noRepeatDays: 3,
  relaxCooldownIfStarved: true,
  exclusive: [
    ["raiseOne","raiseTwo"],
    ["frog","frogUp"]
  ],
  deadlines: {
    weekdayEarliest: "17:00",
    latest: "20:00"
  },
  targets: {
    frog: "non-Sleep task with the latest median tick time over the last 7 days",
    target: "non-Sleep task raised least often in the last 14 days",
    longest: "minutes task with the largest requirement",
    lastMissed: "task unticked on the most recent incomplete day within 14 days",
    pair: "two distinct non-Sleep tasks, seeded"
  },
  eligibility: {
    care: "Chill-level food from today's list + food held >= objective + all active meals + backpack upkeep; exclude expected commitment bonus",
    eggs: "required eggs/food owned at draw time",
    namedTasks: "all referenced tasks exist in the locked list"
  },
  completion: {
    tickMustSurviveUndoMin: 5,
    awardsPerQuestPerDate: 1,
    delivery: "automatic",
    grantsFood: false
  },
  emergencySwap: "replace an affected quest with an eligible quest of equal coins",
  forbidden: ["changingTheLockedList","goddamnTasks","lessSleep","purchases","specificHatchTier","mergeOutcomes","streakLength"],
  pool: [
    {"id":"wholeList","cat":"progress","text":"The whole list: finish today's list.","coins":30},
    {"id":"mediumDay","cat":"progress","text":"Medium or more: finish the list with the day level at Medium or higher.","coins":50},
    {"id":"keepWord","cat":"progress","text":"Keep your word: finish the list without lowering below your morning commitment.","coins":40},
    {"id":"cleanSweep","cat":"progress","timed":true,"text":"Clean sweep: finish the list by 18:00.","deadline":"18:00","coins":50},
    {"id":"eveningToYourself","cat":"progress","timed":true,"text":"An evening to yourself: finish the list by 20:00.","deadline":"20:00","coins":40},
    {"id":"halfBy","cat":"progress","timed":true,"text":"Halfway by five: finish half the list (rounded up) by {deadline}.","deadline":{"weekday":"17:00","weekend":"13:00"},"coins":35},
    {"id":"fourBy","cat":"progress","timed":true,"text":"Four by {deadline}: tick 4 tasks.","deadline":{"weekday":"18:00","weekend":"16:00"},"elig":"taskCount >= 5","coins":40},
    {"id":"momentum","cat":"progress","timed":true,"text":"Momentum: tick 3 tasks within 2 hours.","windowMin":120,"coins":40},
    {"id":"frog","cat":"task","text":"Eat the frog: tick {frog} before any other task except Sleep.","elig":"frogDefined","coins":45},
    {"id":"frogUp","cat":"task","text":"Frog, raised: raise {frog} one level above the day level and finish it.","elig":"frogDefined && dayLevel != hard","coins":55},
    {"id":"raiseOne","cat":"task","text":"Go one up: raise {target} one level above the day level and finish it.","elig":"dayLevel != hard","coins":45},
    {"id":"raiseTwo","cat":"task","text":"Double up: raise {target} and {frog} one level each and finish both.","elig":"frogDefined && target != frog && dayLevel != hard","coins":60},
    {"id":"moveEarly","cat":"task","timed":true,"text":"Move first: tick {physical} by {deadline}.","deadline":{"weekday":"18:00","weekend":"14:00"},"elig":"hasPhysicalTask","coins":35},
    {"id":"deepFirst","cat":"task","timed":true,"text":"Deep before shallow: finish {longest} by {deadline}.","deadline":{"weekday":"19:00","weekend":"15:00"},"elig":"hasMinutesTask","coins":40},
    {"id":"habitStack","cat":"task","timed":true,"text":"Habit stack: tick {pairB} within 60 minutes after {pairA}.","windowMin":60,"coins":40},
    {"id":"lastMissedFirst","cat":"task","text":"Mend the gap: finish {lastMissed} before any other task except Sleep.","elig":"missWithin14Days","coins":40},
    {"id":"restRecorded","cat":"task","text":"Rest, recorded: tick Sleep with last night's actual hours.","elig":"hasSleepTask","coins":30},
    {"id":"goalTag","cat":"task","text":"Receipt with a reason: tag today's Deep work to one of your goals.","elig":"hasDeepWorkTask","private":true,"coins":30},
    {"id":"feedAll","cat":"care","text":"Everyone at the table: tick 2 tasks and feed every active pet to 100.","minTicks":2,"coins":35},
    {"id":"eggDay","cat":"care","text":"Egg day: tick 2 tasks and make any pet lay an egg.","minTicks":2,"elig":"someMeterFillableWithChillSurplus","coins":45},
    {"id":"onTheMend","cat":"care","text":"On the mend: tick 2 tasks and earn comeback XP on any pet.","minTicks":2,"elig":"comebackOwed","coins":35},
    {"id":"fanFavourite","cat":"care","text":"Fan favourite: tick a task while its patron pet is active, plus 1 more task.","minTicks":2,"elig":"activePatronMatch","coins":30},
    {"id":"levelUp","cat":"care","text":"Level up: tick 2 tasks and level up any pet today.","minTicks":2,"elig":"levelUpReachableWithChillSurplus","coins":40},
    {"id":"noWaste","cat":"care","text":"Nothing wasted: finish the list, cover every meal and backpack upkeep, and end with under 30 food unspent.","requiresCompleteDay":true,"coins":35},
    {"id":"crackThree","cat":"care","text":"Work, then wonder: tick 2 tasks and open 3 eggs you already own.","minTicks":2,"elig":"openableEggsOwned >= 3","coins":30},
    {"id":"warmHands","cat":"care","text":"Warm hands: tick 2 tasks and feed 3 servings to the incubator.","minTicks":2,"elig":"incubatingEgg && eggFoodOwned >= 3","coins":30},
    {"id":"hatchDay","cat":"care","text":"Hatch day: tick 2 tasks and hatch a pet egg.","minTicks":2,"elig":"canCompleteHatchWithOwnedFood","coins":50}
  ],
  weeklyChest: {
    starPerAllThreeDone: 1,
    starsRequired: 5,
    week: "Mon 05:00 – next Mon 04:59:59",
    reward: {
      openableEgg: {
        tier: "rare",
        count: 1,
        odds: "streak"
      },
      diamonds: 3
    },
    copy: "Five good quest days. Your weekly chest is ready."
  }
};

// CONTENT.md H.1.
export const MILESTONES = {
  measure: "current complete-day streak; frozen days hold without advancing",
  payout: "oncePerAccount",
  badgesPersistAfterLoss: true,
  celebrationCopy: "{days} days. Look what you kept showing up for.",
  rows: [
    {"days":7,"badgeId":"firstFootprints","badge":"First Footprints","coins":300,"diamonds":0},
    {"days":30,"badgeId":"moonCycle","badge":"Moon Cycle","coins":600,"diamonds":0},
    {"days":50,"badgeId":"stayingPower","badge":"Staying Power","coins":900,"diamonds":0},
    {"days":100,"badgeId":"centurion","badge":"Centurion","coins":1500,"diamonds":20},
    {"days":200,"badgeId":"deepRoots","badge":"Deep Roots","coins":2500,"diamonds":40},
    {"days":365,"badgeId":"oneFullOrbit","badge":"One Full Orbit","coins":4000,"diamonds":80},
    {"days":500,"badgeId":"theLongGame","badge":"The Long Game","coins":5000,"diamonds":100},
    {"days":1000,"badgeId":"thousandDayKeeper","badge":"Thousand-Day Keeper","coins":10000,"diamonds":250}
  ]
};

// CONTENT.md H.2: charm kinds. Which kind the shop and season tier 20 give is config.charms.
export const CHARMS = {
  sproutCharm: {
    NEW: true,
    as: "tierCharm",
    allowedPetEggTiers: ["ordinary","rare","superRare"],
    sources: ["seasonTier20","shop"],
    shopPriceDiamonds: 60
  },
  tierCharm: {
    allowedPetEggTiers: "all",
    sources: ["epicPlusEggLoot"],
    shop: false
  }
};

// CONTENT.md H.2: season track.
export const SEASON = {
  firstMonth: "2026-11",
  tiers: 30,
  xpPerTier: 750,
  totalXp: 22500,
  xpSource: "final task food this local month after commitment bonus and soft cap",
  petXpEffectsApply: false,
  paidTrack: false,
  delivery: "automatic",
  monthBoundary: "close the final day, award tiers, then reset",
  unreachedTiers: "expire",
  eggOdds: "streak",
  track: [
    {"tier":1,"coins":40},
    {"tier":2,"eggFood":{"ordinary":2}},
    {"tier":3,"coins":50},
    {"tier":4,"eggFood":{"rare":1}},
    {"tier":5,"openableEgg":"rare"},
    {"tier":6,"coins":60},
    {"tier":7,"eggFood":{"rare":2}},
    {"tier":8,"coins":70},
    {"tier":9,"eggFood":{"ordinary":4}},
    {"tier":10,"openableEgg":"rare","diamonds":5},
    {"tier":11,"coins":80},
    {"tier":12,"eggFood":{"rare":2}},
    {"tier":13,"coins":90},
    {"tier":14,"eggFood":{"superRare":1}},
    {"tier":15,"openableEgg":"rare"},
    {"tier":16,"coins":100},
    {"tier":17,"eggFood":{"rare":2}},
    {"tier":18,"coins":110},
    {"tier":19,"eggFood":{"superRare":2}},
    {"tier":20,"item":"sproutCharm","diamonds":5},
    {"tier":21,"coins":120},
    {"tier":22,"eggFood":{"superRare":1}},
    {"tier":23,"coins":130},
    {"tier":24,"eggFood":{"superRare":2}},
    {"tier":25,"openableEgg":"rare"},
    {"tier":26,"coins":140},
    {"tier":27,"eggFood":{"superRare":2}},
    {"tier":28,"coins":150},
    {"tier":29,"eggFood":{"epic":1}},
    {"tier":30,"cosmetic":"seasonCosmetic","diamonds":5,"coins":300}
  ],
  totals: {
    coins: 1440,
    diamonds: 15,
    rareEggs: 4,
    sproutCharms: 1,
    cosmetics: 1,
    eggFood: {
      ordinary: 6,
      rare: 7,
      superRare: 8,
      epic: 1
    }
  },
  completeCopy: "Season complete. Your little world grew with you."
};

// CONTENT.md I: task-first loop (grants nothing).
export const ENGAGEMENT = {
  additionalEconomy: {
    coins: 0,
    diamonds: 0,
    petFood: 0,
    keeperXp: 0,
    seasonXp: 0
  },
  behaviours: [
    {"id":"todayRingFlame","mustHave":true,"firstViewport":["petStatusLine","todayRing","streakFlame","dayPicker","list"],"heading":"A little progress, every day.","ringSegment":"equal per task, filled in ticked-level colour","litCopy":"+1 at 22:00","atRiskFrom":"19:00","atRiskCopy":"{left} left · {timeLeft}","noChangesAfter":"21:30","touchTargetPx":44,"tickTargetPx":56},
    {"id":"receiptThenReward","mustHave":true,"receiptFirst":true,"receiptExample":"Read · 23 pages","rewardExample":"+120 food","orbsByLevel":{"chill":3,"easy":4,"medium":6,"hard":9,"goddamn":14},"animationMs":650,"undoRingMin":5,"vibrateMs":10,"soundDefault":false,"reducedMotion":"instant","failureCopy":"That tick didn't save. Try again."},
    {"id":"companionNotices","mustHave":true,"companionPx":200,"reaction":"tickCheer","patronCheer":true,"eatsOnTick":false,"preTickHungerBubbles":false,"queueLimit":1},
    {"id":"raisePreview","mustHave":true,"shows":["requirementChange","foodChange","projectedDailyTotal","softCapLine","petOutcome"],"clientSideOnly":true,"preselect":false,"suggestSleepRaiseAfterShortNight":false},
    {"id":"dinnerThenGrowth","mustHave":true,"buttons":["Feed to dinner","Feed surplus"],"previewCopy":"{meal} to dinner · {growth} growth food → +{xp} XP · +{meter} egg meter","upkeepReservedVisible":true,"silentRedistribution":false},
    {"id":"realFinish","mustHave":true,"sameCelebrationAllLevels":true,"durationMs":900,"heading":"Today's list: complete.","receiptCopy":"Today added {pages} pages, {outsideMinutes} minutes outside and {deepMinutes} minutes of focused work.","preview":["streakEggs","commitmentBonus","questStars"],"cta":"Feed dinner","finishedCopy":"You're done for today. Enjoy your evening.","ultraSaleAnnounced":false},
    {"id":"morningReceipt","mustHave":true,"showsAfter":"05:00","headings":{"complete":"Yesterday counted.","incomplete":"A new day is open."},"eggUnbox":"oneByOne","blocksList":false,"questCardFlip":true,"commitButton":"Commit to {level}","grantsOnOpen":false},
    {"id":"goalsBesideTasks","mustHave":true,"ledgerMustHave":false,"purposeLines":{"sleep":"Protect tomorrow's focus.","outdoors":"Make room to think.","read":"Build range.","veg":"Take care of the engine.","workout":"Build strength steadily.","deep":"Move one important thing forward."},"deepWorkTags":["ILO","Coursework","ML research","College applications","Other"],"ledgerCopy":"{goal} · {hours} h this week","inventPercentages":false,"public":false}
  ]
};

// ---------------------------------------------------------------------------------------------------------
// Hand-written defaults (PLAN.md §1 "Monthly list setup", CONTENT.md I.8 purpose lines).

// Receipt kinds: how a task's real quantity feeds Receipts (PLAN.md §13). To add a task kind, add a row here
// and give tasks `receipt: '<kind>'`. field = the receipts aggregate it adds to; unit conversions are in progress.js.
export const RECEIPT_KINDS = {
  pages: { label: 'Pages read', field: 'pages', agg: 'sum' },
  outside: { label: 'Hours outside', field: 'outsideMin', agg: 'minutes' },
  workout: { label: 'Workouts', field: 'workouts', agg: 'count' },
  sleep: { label: 'Average sleep', field: 'sleep', agg: 'average-hours' },
  deep: { label: 'Focused work', field: 'deepMin', agg: 'minutes' },
  veg: { label: 'Vegetable servings', field: 'veg', agg: 'sum' },
};

export const DEEP_WORK_TAGS = ['ILO', 'Coursework', 'ML research', 'College applications', 'Other'];

// The mockup's default list. Quantity tasks scale chill × config.tasks.qtyMult; quality tasks use `tiers` text.
// tierQty gives the receipt amount a quality task records when no qty is typed. Physical tasks cap duration at
// Hard and scale structure above it (tiers.goddamn).
export const DEFAULT_TASKS = [
  { id: 'sleep', name: 'Sleep', type: 'quality', physical: false, unit: 'hours', tag: 'sleep', receipt: 'sleep',
    purpose: "Protect tomorrow's focus.",
    tiers: { chill: '7 h of sleep', easy: '7.5 h of sleep', medium: '8 h, in bed by 23:30', hard: '8 h, in bed by 23:00', goddamn: '8.5 h, in bed by 22:30' },
    tierQty: [7, 7.5, 8, 8, 8.5] },
  { id: 'grass', name: 'Touch grass', type: 'quantity', physical: false, unit: 'minutes', chill: 20, tag: 'outdoors', receipt: 'outside',
    purpose: 'Make room to think.' },
  { id: 'read', name: 'Read', type: 'quantity', physical: false, unit: 'pages', chill: 15, tag: 'study', receipt: 'pages',
    purpose: 'Build range.' },
  { id: 'veg', name: 'Eat vegetables', type: 'quality', physical: false, unit: 'servings', tag: 'food', receipt: 'veg',
    purpose: 'Take care of the engine.',
    tiers: { chill: '1 serving of vegetables', easy: '2 servings', medium: '3 servings', hard: '5 servings, 2 colours', goddamn: 'Vegetables at every meal, 3 colours' },
    tierQty: [1, 2, 3, 5, 7] },
  { id: 'workout', name: 'Work out', type: 'quantity', physical: true, unit: 'minutes', chill: 15, tag: 'physical', receipt: 'workout',
    purpose: 'Build strength steadily.',
    tiers: { goddamn: 'Hard duration, intervals at race pace' } },
  { id: 'deep', name: 'Deep work', type: 'quantity', physical: false, unit: 'minutes', chill: 30, tag: 'study', receipt: 'deep',
    purpose: 'Move one important thing forward.' },
];
