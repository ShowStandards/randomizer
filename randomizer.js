const supabaseUrl = "https://vyuklkrqusfvrcaqxmfm.supabase.co";
const supabaseKey = "sb_publishable_2LSbJafkRatck5Ei8HXL-g_0tezT6qu";

window.supabaseClient = window.supabase.createClient(
  supabaseUrl,
  supabaseKey
);

function getSupabase() {
  return window.supabaseClient;
}

function getAnimalNumber() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id") || params.get("animal_number");
}

function isUUID(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function isNumberLike(value) {
  return value !== null && value !== "" && !isNaN(Number(value));
}

function normalizeKey(text) {
  return String(text || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/[â€-â€’â€“â€”â€•]/g, "-")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalShowType(value) {
  const key = normalizeKey(value);

  if ([
    "conformation",
    "conformation show",
    "conformation shows",
    "conf"
  ].includes(key)) return "conformation";

  if ([
    "activity",
    "activities",
    "activity show",
    "activity shows",
    "performance",
    "performance show",
    "performance shows"
  ].includes(key)) return "activity";

  return key;
}

function passState(value) {
  if (value === true) return true;
  if (value === false) return false;

  const key = normalizeKey(value);
  if (["true", "1", "pass", "passed", "qualified", "qualifying", "q"].includes(key)) return true;
  if (["false", "0", "fail", "failed", "not qualified", "non qualifying", "nq"].includes(key)) return false;

  return null;
}

function recordPassed(record) {
  const direct = passState(record?.passed);
  if (direct !== null) return direct;

  const text = normalizeKey([
    record?.placement,
    record?.score_label,
    record?.class
  ].filter(Boolean).join(" "));

  if (/\b(fail|failed|not qualified|non qualifying|nq)\b/.test(text)) return false;
  if (/\b(pass|passed|qualified|qualifying)\b/.test(text)) return true;

  return null;
}

function normalizeActivityClassName(className) {
  return String(className || "")
    .normalize("NFKD")
    .toLowerCase()

    // normalize dashes
    .replace(/[â€-â€’â€“â€”â€•]/g, "-")


    // remove punctuation
    .replace(/[():!]/g, "")

    // remove entry counts
    .replace(/\(\s*\d+\s*entries?\s*\)/gi, "")

    // remove group/division/team labels
    .replace(/\s*-\s*group\s*\d+/gi, "")
    .replace(/\s*-\s*division\s*\d+/gi, "")
    .replace(/\s*-\s*team\s*\d+/gi, "")

    // remove trailing short suffixes like -vs -vj -sc1
    .replace(/\s*-\s*[a-z]{1,5}\d*$/gi, "")

    // remove untitled suffixes
    .replace(/\s*-\s*untitled$/gi, "")

    // collapse spaces
    .replace(/\s+/g, " ")

    .trim();
}
/* IMPORTANT: keeps Feline/Canine/Equine so species-specific titles don't mix */
function activityMatchKey(text) {
  return normalizeKey(text)
    .replace(/^(dog|cat|horse)\s+/i, "")
    .trim();
}

function activityBaseKey(text) {
  const key = normalizeKey(normalizeActivityClassName(text)).trim();

  /*
    Historical alias repair | Show Hunter / Show Hunters are ONE activity.
    Keep this deliberately exact so no other activity or title family is changed.
  */
  if (key === "show hunters") return "show hunter";

  return key;
}

function findMatchedActivity(classText, activityTypes) {
  const cleanedClass = activityBaseKey(classText);
  const dashBaseClass = activityMatchKey(classText).split("-")[0].trim();

  return activityTypes.find(a => {
    const displayName = activityBaseKey(a.display_name);
    const activityKey = activityBaseKey(a.activity_key);

    return (
      displayName === cleanedClass ||
      activityKey === cleanedClass ||
      displayName === dashBaseClass ||
      activityKey === dashBaseClass
    );
  }) || null;
}

function getActivityRulesForTotal(total, activityRules) {
  return activityRules.filter(r => {
    const ruleKey = activityBaseKey(r.activity_key);
    const totalKey = activityBaseKey(total.activity_key);
    const totalName = activityBaseKey(total.display_name);

    return ruleKey === totalKey || ruleKey === totalName;
  });
}

function pointsValue(record) {
  return Number(record?.calculated_points ?? record?.points ?? 0) || 0;
}

function getTotalAwardShowKey(showName) {
  let clean = String(showName || "")
    .toLowerCase()
    .replace(/[â€â€‘â€’â€“â€”â€•]/g, "-")
    .replace(/\bspecialities\b/g, "specialties")
    .replace(/\bspeciality\b/g, "specialty")
    .replace(/\s+/g, " ")
    .trim();

  /* Total Awards should match the base event/day, not the show subtype.
     Example:
     - Day 2 - Group Specialty
     - Day 2
     should count as the same show day. */
  const dayMatch = clean.match(/^(.*?\bday\s*\d+)\b/i);
  if (dayMatch) {
    clean = dayMatch[1];
  }

  clean = clean
    .replace(/\s+-\s+(all breed show|untitled show|majors chase show|championship show|group specialty|group specialties|breed specialty|breed specialties|specialty show|specialties|specialty|conformation|activities|activity)\s*$/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return clean;
}

function speciesCode(species) {
  const s = normalizeKey(species);
  if (s === "dog") return "TotD";
  if (s === "cat") return "TotC";
  if (s === "horse") return "TotH";
  return "Tot";
}

function isBOBOrAbove(placement) {
  const p = normalizeKey(placement);
  return p.includes("best of breed") || p.includes("best in group") || p.includes("best in show") || p.includes("best in specialty show") || p === "bis" || p === "biss";
}

function normalizeSpecialtyText(value) {
  return normalizeKey(value)
    .replace(/\bspecialities\b/g, "specialties")
    .replace(/\bspeciality\b/g, "specialty");
}

function isBestInShowPlacement(placement) {
  const p = normalizeSpecialtyText(placement);

  /*
    Explicitly reject reserve results, including abbreviated historical forms.
    A reserve BIS/BISS is not a BIS/BISS win for title-count purposes.
  */
  if (
    p.includes("reserve") ||
    ["rbis", "rbiss"].includes(p)
  ) {
    return false;
  }

  return (
    p === "bis" ||
    p === "biss" ||
    p.includes("best in show") ||
    p.includes("best in specialty show") ||
    p.includes("best specialty show")
  );
}

function isSpecialtyBestInShow(record) {
  const placement = normalizeSpecialtyText(record?.placement);
  const scope = normalizeSpecialtyText(record?.show_scope);
  const showName = normalizeSpecialtyText(record?.show_name);

  return isBestInShowPlacement(record?.placement) &&
    (
      placement === "biss" ||
      placement.includes("biss") ||
      placement.includes("specialty") ||
      scope === "specialty" ||
      scope.includes("specialty") ||
      showName.includes("specialty")
    );
}

function isAllBreedBestInShow(record) {
  const placement = normalizeSpecialtyText(record?.placement);
  const scope = normalizeSpecialtyText(record?.show_scope);
  const showName = normalizeSpecialtyText(record?.show_name);

  return isBestInShowPlacement(record?.placement) &&
    !isSpecialtyBestInShow(record) &&
    (
      placement === "bis" ||
      placement.includes("best in show") ||
      scope === "all breed" ||
      showName.includes("all breed")
    );
}

function isBestInFieldWin(record) {
  if (canonicalShowType(record?.show_type) !== "activity") return false;

  const placement = normalizeKey(record?.placement);
  const className = normalizeKey(record?.class);

  // Never count reserve field awards as BIF wins.
  if (
    placement.includes("reserve") ||
    className.includes("reserve") ||
    ["rbif"].includes(placement) ||
    ["rbif"].includes(className)
  ) {
    return false;
  }

  // Direct award forms used by current and historical uploads.
  if (
    placement === "bif" ||
    placement === "best in field" ||
    placement.startsWith("best in field ")
  ) {
    return true;
  }

  /*
    Some records store "Best in Field" as the class and the actual result as
    first place. Only count that form when the record is explicitly first.
  */
  const isFirstPlace =
    placement === "1" ||
    placement === "1st" ||
    placement.startsWith("1 ") ||
    placement.startsWith("1st") ||
    placement.includes("1st place") ||
    placement.includes("first");

  return className.includes("best in field") && isFirstPlace;
}

function awardWinKey(record, family) {
  /*
    BIS and BISS are separate award families and may both legitimately be
    awarded to the same animal within one show (for example, Sighthound Club).
    The family is therefore always part of the de-duplication key.

    Within each family, duplicate rows from the same upload/show count only
    once so an accidental repeated BIS row cannot manufacture MBIS, and an
    accidental repeated BISS row cannot manufacture MBISS.
  */
  const uploadId = String(record?.upload_id || "").trim();
  if (uploadId) return `${family}|upload:${uploadId}`;

  const eventDate = String(record?.event_date || "").trim();
  const showName = normalizeKey(record?.show_name);
  const showScope = normalizeSpecialtyText(record?.show_scope);

  return `${family}|${eventDate}|${showName}|${showScope}`;
}

function countUniqueAwardWins(records, predicate, family) {
  const keys = new Set();

  (records || []).forEach(record => {
    if (!predicate(record)) return;
    keys.add(awardWinKey(record, family));
  });

  return keys.size;
}


function isBestInFieldActivityRecord(record) {
  if (canonicalShowType(record?.show_type) !== "activity") return false;

  const className = normalizeKey(record?.class);
  const placement = normalizeKey(record?.placement);

  return (
    className.includes("best in field") ||
    placement.includes("best in field") ||
    className === "bif" ||
    className === "mbif" ||
    placement === "bif" ||
    placement === "mbif"
  );
}

function isActivityPlacing(placement) {
  const p = normalizeKey(placement);
  return ["1", "2", "3", "4", "5"].includes(p) || p.includes("1st") || p.includes("2nd") || p.includes("3rd") || p.includes("4th") || p.includes("5th");
}

function isTrueValue(value) {
  return passState(value) === true;
}

function highestTitle(points, rules) {
  return (rules || [])
    .filter(r => Number(r.points_required || 0) <= points)
    .sort((a, b) => {
      const thresholdDifference =
        Number(b.points_required || 0) - Number(a.points_required || 0);

      if (thresholdDifference !== 0) return thresholdDifference;

      /* If duplicate rules share a threshold, prefer the repeatable rule. */
      return Number(isTrueValue(b.repeatable)) - Number(isTrueValue(a.repeatable));
    })[0] || null;
}

function ruleIsRepeatable(rule) {
  const raw = String(rule?.repeatable ?? "").trim().toLowerCase();

  if (
    rule?.repeatable === true ||
    ["true", "1", "yes", "y"].includes(raw)
  ) {
    return true;
  }

  // Some rules identify multiplier behavior by having a repeat increment
  // even if repeatable itself is blank/legacy.
  const increment = Number(rule?.repeat_increment);
  return Number.isFinite(increment) && increment > 0;
}

function hasMaxedBaseTitle(points, rules) {
  const totalPoints = Number(points || 0);

  const ladder = (rules || [])
    .filter(r => Number(r?.points_required || 0) > 0)
    .slice()
    .sort((a, b) => Number(a.points_required || 0) - Number(b.points_required || 0));

  if (!ladder.length) return false;

  const repeatableRules = ladder.filter(ruleIsRepeatable);

  /*
    If the ladder has multiplier/repeatable titles, the FIRST repeatable
    threshold is the point where the ordinary ladder has been maxed.

    Example:
      SHA @ 150, repeat every +150
      150 = SHA      -> medal
      300 = SHA2     -> medal
      450 = SHA3     -> medal

    If there is no repeatable rule, the final rule in the ladder is the max.
  */
  const maxBaseThreshold = repeatableRules.length
    ? Number(repeatableRules[0].points_required || 0)
    : Number(ladder[ladder.length - 1].points_required || 0);

  return Number.isFinite(maxBaseThreshold) &&
         maxBaseThreshold > 0 &&
         totalPoints >= maxBaseThreshold;
}

function toRoman(num) {
  const romans = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
  return romans[num] || String(num);
}

function displayActivityTitle(title, points) {
  if (!title) return "";
  if (!isTrueValue(title.repeatable)) return title.title_code;

  const baseThreshold = Number(title.points_required || 0);
  const repeatIncrement = Number(
    title.repeat_increment || title.points_required || 1
  );
  const totalPoints = Number(points || 0);

  if (
    !Number.isFinite(baseThreshold) ||
    !Number.isFinite(repeatIncrement) ||
    baseThreshold <= 0 ||
    repeatIncrement <= 0 ||
    totalPoints < baseThreshold
  ) {
    return title.title_code;
  }

  /*
    The base title is the first completed threshold.

    Example:
      SHA requires 150 points.
      150-299 points = SHA
      300-449 points = SHA2
      450-599 points = SHA3
  */
  const tier = 1 + Math.floor(
    (totalPoints - baseThreshold) / repeatIncrement
  );

  if (tier <= 1) return title.title_code;

  return title.title_code + String(tier);
}

function manualTitleName(code) {
  const key = String(code || "")
    .toUpperCase()
    .replace(/\./g, "")
    .trim();

  const names = {
    TT: "Temperament Tested",
    TTC: "Temperament Tested Certified",

    TTD: "Temperament Tested Dog",
    TTH: "Temperament Tested Horse",

    TAC: "Therapy Animal Cat",
    TAD: "Therapy Animal Dog",
    TAH: "Therapy Animal Horse",

    CGC: "Canine Good Citizen",
    CGCB: "Canine Good Citizen Bronze",
    CGCS: "Canine Good Citizen Silver",
    CGCG: "Canine Good Citizen Gold",
    CGCA: "Canine Good Citizen Advanced",
    CGCU: "Canine Good Citizen Urban",

    HIC: "Herding Instinct Certificate",
    HIT: "Herding Instinct Tested",
    HCT: "Hunting Club Instinct Tested",
    INST: "Instinct Tested"
  };

  return names[key] || "Manual Title";
}

function manualTitleSort(code) {
  const key = String(code || "")
    .toUpperCase()
    .replace(/\./g, "")
    .trim();

  const order = {
    TT: 80,
    TTC: 81,

    TTD: 82,
    TTH: 83,

    TAC: 84,
    TAD: 85,
    TAH: 86,

    CGC: 90,
    CGCB: 91,
    CGCS: 92,
    CGCG: 93,
    CGCA: 94,
    CGCU: 95,

    HIC: 96,
    HIT: 97,
    HCT: 97,
    INST: 98
  };

  return order[key] || 99;
}

function isManualScoreRecord(record) {
  const cls = normalizeKey(record?.class);
  const label = normalizeKey(record?.score_label);
  const show = normalizeKey(record?.show_name);

  return (
    cls.includes("temperament") ||
    cls.includes("therapy") ||
    cls.includes("canine good citizen") ||
    cls.includes("instinct test") ||
    cls.includes("instinct testing") ||
    label.includes("temperament") ||
    label.includes("therapy") ||
    label.includes("canine good citizen") ||
    label.includes("instinct test") ||
    label.includes("instinct testing") ||
    show.includes("temperament") ||
    show.includes("therapy") ||
    show.includes("canine good citizen") ||
    show.includes("instinct test") ||
    show.includes("instinct testing") ||
    show.includes("cgc")
  );
}

function manualScoreLabel(record) {
  const score = record?.score;
  const maxScore = record?.max_score;
  const passed = record?.passed;

  const scoreText =
    score !== null && score !== undefined && score !== ""
      ? `${score}${maxScore !== null && maxScore !== undefined && maxScore !== "" ? "/" + maxScore : ""}`
      : "-";

  let status = "Recorded";

  const passedState = passState(passed);
  if (passedState === true) status = "Pass";
  if (passedState === false) status = "Fail";

  if (scoreText === "-") return status;

  return `${status} | ${scoreText}`;
}

function bestManualScoreForTitle(records, code) {
  const key = String(code || "")
    .toUpperCase()
    .replace(/\./g, "")
    .trim();

  const manualRecords = records
    .filter(isManualScoreRecord)
    .slice()
    .sort((a, b) => {
      const aDate = String(a.event_date || "");
      const bDate = String(b.event_date || "");
      return bDate.localeCompare(aDate);
    });

  function findByWords(words) {
    return manualRecords.find(r => {
      const haystack = `${r.class || ""} ${r.score_label || ""} ${r.show_name || ""}`.toLowerCase();
      return words.some(word => haystack.includes(word));
    });
  }

  if (key === "TT" || key === "TTC" || key === "TTD" || key === "TTH") {
    return findByWords(["temperament"]);
  }

  if (key === "TAC" || key === "TAD" || key === "TAH") {
    return findByWords(["therapy"]);
  }

  if (["CGC", "CGCB", "CGCS", "CGCG", "CGCA", "CGCU"].includes(key)) {
    return findByWords(["canine good citizen", "cgc"]);
  }

  if (["HIC", "HIT", "HCT", "INST"].includes(key)) {
    return findByWords(["instinct test", "instinct testing"]);
  }

  return null;
}

function titleCodeKey(code) {
  return String(code || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, "")
    .trim();
}

function splitTitleCodes(value) {
  return String(value || "")
    .split(/\s+/)
    .map(t => t.trim())
    .filter(Boolean);
}


function collapseManualTitleCodesForName(value) {
  const codes = splitTitleCodes(value);
  if (!codes.length) return "";

  const cgcGroup = new Set(["CGC", "CGCB", "CGCS", "CGCG", "CGCA", "CGCU"]);
  const bestByGroup = {};
  const output = [];

  codes.forEach(code => {
    const clean = String(code || "")
      .toUpperCase()
      .replace(/\./g, "")
      .trim();

    if (cgcGroup.has(clean)) {
      const current = bestByGroup.cgc;

      if (
        !current ||
        manualTitleSort(clean) > manualTitleSort(current)
      ) {
        bestByGroup.cgc = clean;
      }

      return;
    }

    output.push(code);
  });

  if (bestByGroup.cgc) {
    output.push(bestByGroup.cgc);
  }

  return output.join(" ");
}

const VERSATILITY_TITLES = {
  dog: [
    { name: "Versatility Novice", code: "VND", level: "A" },
    { name: "Versatility Advanced", code: "VAD", level: "B" },
    { name: "Versatility Excellence", code: "VED", level: "C" },
    { name: "Versatility Bronze", code: "VBD", level: "D" },
    { name: "Versatility Silver", code: "VSD", level: "E" },
    { name: "Versatility Gold", code: "VGD", level: "F" }
  ],
  cat: [
    { name: "Versatility Novice", code: "VNC", level: "A" },
    { name: "Versatility Advanced", code: "VAC", level: "B" },
    { name: "Versatility Excellence", code: "VEC", level: "C" },
    { name: "Versatility Bronze", code: "VBC", level: "D" },
    { name: "Versatility Silver", code: "VSC", level: "E" },
    { name: "Versatility Gold", code: "VGC", level: "F" }
  ],
  horse: [
    { name: "Versatility Novice", code: "VNH", level: "A" },
    { name: "Versatility Advanced", code: "VAH", level: "B" },
    { name: "Versatility Excellence", code: "VEH", level: "C" },
    { name: "Versatility Bronze", code: "VBH", level: "D" },
    { name: "Versatility Silver", code: "VSH", level: "E" },
    { name: "Versatility Gold", code: "VGH", level: "F" }
  ]
};

function makeVersatilityMap(categories) {
  const map = {};
  categories.forEach((levels, categoryIndex) => {
    levels.forEach((codes, levelIndex) => {
      codes.forEach(code => {
        map[titleCodeKey(code)] = { category: categoryIndex + 1, level: levelIndex + 1 };
      });
    });
  });
  return map;
}

const VERSATILITY_CODES = {
  dog: makeVersatilityMap([
    [
      ["BN","GN","MFN","MFI","HtMN","HtMI","RN","RI"],
      ["GO","CD","MFO","MFA","HtMO","HtMA","RA","RE"],
      ["CDX","UD","MFE","HtME","RM","RAE"],
      ["UDX","OM","OGM","MFCH","HtMCH","RNC"],
      ["OTCH","NOC","MFGCH","HtMGCH","RACh"]
    ],
    [
      ["Ch","GCh","NatCh","NTD","CGC","CGCB","TAD","TTD"],
      ["IntCh","WCh","ITD","CGCS"],
      ["SprWCh","UniCh","ATD","CGCG"],
      ["HOF","ETD","CGCA"],
      ["HOL","TDCh","CGCU"]
    ],
    [
      ["JH","JHA","CAD","CDN","SHR","RATN","RATO","CJN","CNC","JE","CF","CFN"],
      ["MH","CDI","CDA","HR","RATS","CGN","SE","CFI","CFA"],
      ["MHA","CDE","HRCh","RATM","CSGN","ME","CFE","CFM"],
      ["SH","CDM","GrHCh","RATCh","WNC","EE","CFCh"],
      ["SHA","CDCh","SupHRCh","RATChX","CWGN","EDCh","CFGCh"]
    ],
    [
      ["ObH","PH1","BTr","BH","SD","NDD","ANDD","HT","PT","WD","BkD","CXD","RD","SkD"],
      ["SpH","RS1","SchHI","SDX","DrD","MDD","HS","HI","WRD","BkCh","CXCh","RDX","SkCh"],
      ["RH","RS2","SchHII","SDCh","NBDD","ANBDD","HA","WRDX","BkGrCh","CXGrCh","RDCh","SkGrCh"],
      ["PH2","RS3","SchHIII","SDGrCh","BDD","MBDD","HX","WRDCh","BkSupCh","CXSupCh","RDXCh","SkSupCh"],
      ["Met Lof","RSCh","SchHCh","SDSupCh","GMDD","TDD","HCh","WRDGCh","BkSupGCh","CXSupGCh","RDXGCh","SkSupGCh"]
    ],
    [
      ["JC","JR","JRM","AD","ADX","FD","FDX","CAT","TRJ"],
      ["SC","SR","ADX Bronze","ADX Silver","FDCH Bronze","FDCH Silver","BCAT","TRM"],
      ["MC","SRM","ADX Gold","AgCh","FDCH Gold","FM","DCAT","TRCh"],
      ["LCX","RCh","NAgCh","MAgCh","FMX","FMCh","FCAT","TRChE"],
      ["NFC","SRCh","AgGCH","FDGCh","SCAT","TRGCh"]
    ],
    [
      ["UWP","UWPCh","CTB-B","CTBT-B","DD","DDX","DN","ARJ","HyDN"],
      ["UWPChX","UGWPCh","CTB-I","CTBT-I","DDCh","DJ","ARS","HyDJ"],
      ["UGWPC1","UWPV","CTB-E","CTBT-E","DDACh","DS","ARM","HyDS"],
      ["UWPO","CTB-Ch","CTBT-Ch","DDMCh","DM","ARA","HyDM"],
      ["UWPS","CTB-GCh","CTBT-GCh","DDECh","DE","ARX","HyDE"]
    ],
    [
      ["SWD","SWN","SAR-W","SD-I","SD-II","TD"],
      ["SWNE","SWNA","SAR-U1","SD-III","TDX"],
      ["SWNAE","SWE","SAR-U2","SD-Ch","TDU"],
      ["SWNEE","SWM","SAR-U3","SD-MCh","VST"],
      ["SWME","SAR-Ch","SD-GCh","CT"]
    ]
  ]),

  cat: makeVersatilityMap([
    [
      ["Ch","GCh","NatCh","TAC","TT","TTC","NTD"],
      ["IntCh","WCh","ITD"],
      ["SprWCh","UniCh","ATD"],
      ["HOF","ETD"],
      ["HOL","TDCh"]
    ],
    [
      ["CAB","FON","FRN"],
      ["CAAI","FOI","FRI"],
      ["CAAII","FOA","FRA"],
      ["CACh","FOE","FRE"],
      ["CAGCh","FOCh","FRCh"]
    ],
    [
      ["FFN","RCN","SDN"],
      ["FFI","RCI","SDI"],
      ["FFA","RCA","SDA"],
      ["FFE","RCE","SDE"],
      ["FFCh","RCCh","SDCh"]
    ],
    [
      ["SC1","VN","TB-B","TBB","HJN"],
      ["SC2","VJ","TB-I","TBI","HJI"],
      ["SC3","VS","TB-E","TBE","HJA"],
      ["SC4","VM","TB-Ch","TBCh","HJE"],
      ["SCCh","VE","HJCh"]
    ]
  ]),

  horse: makeVersatilityMap([
    [
      ["Ch","GCh","NatCh","NTD","TTH","TAH","LTI","SMSR"],
      ["IntCh","WCh","ITD","LTT","SMS1"],
      ["SprWCh","UniCh","ATD","LT1L","SMS2"],
      ["HOF","ETD","LT2L","SMS3"],
      ["HOL","TDCh","LT3L","LTM","SMS4","SMSP"]
    ],
    [
      ["DIntro","DTr","CDI","CDT","CBDI","CBDT","WDI","WDT","IHDI","IHDT","CIHDI","CIHDT"],
      ["D1","D2","CD1L","CBD1L","WD1K","IHD1L","CIHD1L"],
      ["D3","D4","C2L","CBD2L","WD2L","IHD2L","CIHD2L"],
      ["DPST","DInt1","CD3L","CBD3L","WD3L","IHD3L","CIHD3L"],
      ["DInt2","DGP","CDM","CBDM","WDM","IHDM","CIHDM"]
    ],
    [
      ["DrPN","NHH","WRPR"],
      ["DrN","IHH","WRP1"],
      ["DrInt","AHH","WTP2"],
      ["DrO","HHCh","WTP3"],
      ["DrA","HHGCh","WTP4"]
    ],
    [
      ["NGH","GDI","GDT"],
      ["IGH","GD1L"],
      ["AGH","GD2L"],
      ["GHCh","GD3L"],
      ["GHGCh","GDM"]
    ],
    [
      ["EnN","RaM","RaA","SRaM","SRaA","HRaM","HRaA","BRR","GYR"],
      ["EnJ","RaL","SRaL","HRaL","BR4","GY1"],
      ["EnI","G3","SG3","HG3","BR3","GY2"],
      ["EnO","G2","SG2","HG2","BR2","GY3"],
      ["G1","SG1","HG1","BR1","GYP"]
    ],
    [
      ["S1","S2","HBG","EPI","EI","EPT"],
      ["S3","S4","HPG","ET","EO"],
      ["S5","S6","H1","E*"],
      ["S7","S8","H2","E**"],
      ["S9","SGP","HR","E***"]
    ],
    [
      ["WPR","WER","TRR","RGr"],
      ["WP1","WE1","TR1","RR"],
      ["WP2","WE2","TR2","RN"],
      ["WP3","WE3","TR3","RNP"],
      ["WPP","WEP","TRP","RP"]
    ],
    [
      ["CR","ROR","WCR"],
      ["C1","RO1","WC1"],
      ["C2","RO2","WC2"],
      ["C3","RO3","WC3"],
      ["CP","ROP","WCP"]
    ]
  ])
};

function getBestVersatilityByCategory(animal, earnedCodes) {
  const species = normalizeKey(animal?.species);
  const map = VERSATILITY_CODES[species];
  const bestByCategory = {};

  if (!map) return bestByCategory;

  (earnedCodes || []).forEach(code => {
    const key = titleCodeKey(code);
    const info = map[key];
    if (!info) return;

    const current = bestByCategory[info.category] || 0;
    bestByCategory[info.category] = Math.max(current, info.level);
  });

  return bestByCategory;
}

function countVersatilityCategoriesAtLeast(bestByCategory, level) {
  return Object.values(bestByCategory)
    .filter(value => Number(value || 0) >= level)
    .length;
}

function calculateVersatilityTitle(animal, earnedCodes) {
  const species = normalizeKey(animal?.species);
  const titles = VERSATILITY_TITLES[species];
  if (!titles) return null;

  const bestByCategory = getBestVersatilityByCategory(animal, earnedCodes);

  const levelA = countVersatilityCategoriesAtLeast(bestByCategory, 1);
  const levelB = countVersatilityCategoriesAtLeast(bestByCategory, 2);
  const levelC = countVersatilityCategoriesAtLeast(bestByCategory, 3);
  const levelD = countVersatilityCategoriesAtLeast(bestByCategory, 4);
  const levelE = countVersatilityCategoriesAtLeast(bestByCategory, 5);

  let earned = null;

  if (levelA >= 3) earned = titles[0];
  if (levelB >= 3) earned = titles[1];
  if (levelC >= 2 && levelB >= 3) earned = titles[2];
  if (levelD >= 1 && levelC >= 2 && levelB >= 3) earned = titles[3];
  if (levelE >= 1 && levelD >= 2 && levelC >= 3) earned = titles[4];
  if (levelE >= 2 && levelD >= 3 && levelC >= 4) earned = titles[5];

  if (!earned) return null;

  return {
    ...earned,
    categoryLevels: bestByCategory
  };
}

function buildSummary(records) {
  const totalPoints = records.reduce((sum, r) => sum + pointsValue(r), 0);

  return `
    <div class="summary-grid">
      <div class="summary-card"><strong>${totalPoints}</strong>Total Points</div>
      <div class="summary-card"><strong>${records.length}</strong>Total Records</div>
    </div>
  `;
}

function formatScore(record) {
  if (isHerdingInstinctRecord(record)) return "-";

  const score = record?.score;
  const maxScore = record?.max_score;
  const scoreLabel = record?.score_label;
  const passed = record?.passed;

  const parts = [];

  if (score !== null && score !== undefined && score !== "") {
    if (maxScore !== null && maxScore !== undefined && maxScore !== "") {
      parts.push(`${score}/${maxScore}`);
    } else {
      parts.push(String(score));
    }
  }

  if (scoreLabel) {
    parts.push(String(scoreLabel));
  }

  const passedState = passState(passed);
  if (passedState === true) {
    parts.push("Pass");
  } else if (passedState === false) {
    parts.push("Fail");
  }

  return parts.length ? parts.join(" | ") : "-";
}


function isRealConformationClassName(value) {
  return /^class\s+\d+a?$/i.test(String(value || "").trim());
}

function isConformationAwardName(value) {
  const p = normalizeKey(value);
  return (
    p === "best of breed" ||
    p === "best in group" ||
    p === "reserve best in group" ||
    p === "best in show" ||
    p === "reserve best in show" ||
    p === "best in show specialty" ||
    p === "reserve best in show specialty"
  );
}

/* Display repair:
   Older randomizer uploads stored major awards as:
   class = "Best of Breed" / "Best in Show Specialty"
   placement = same award
   This does not rewrite the database; it fixes what the popup displays by finding
   the same animal's real class record from that show/day. */
function displayRecordClass(record, sectionRecords) {
  const currentClass = String(record?.class || "").trim();

  if (
    canonicalShowType(record?.show_type) !== "conformation" ||
    isRealConformationClassName(currentClass) ||
    !isConformationAwardName(currentClass)
  ) {
    return currentClass || "-";
  }

  const sameShowClassRecord = (sectionRecords || []).find(other => {
    if (other === record) return false;

    return (
      canonicalShowType(other?.show_type) === "conformation" &&
      String(other?.show_name || "") === String(record?.show_name || "") &&
      String(other?.event_date || "") === String(record?.event_date || "") &&
      isRealConformationClassName(other?.class)
    );
  });

  if (sameShowClassRecord?.class) return sameShowClassRecord.class;

  const sameDayClassRecord = (sectionRecords || []).find(other => {
    if (other === record) return false;

    return (
      canonicalShowType(other?.show_type) === "conformation" &&
      String(other?.event_date || "") === String(record?.event_date || "") &&
      isRealConformationClassName(other?.class)
    );
  });

  if (sameDayClassRecord?.class) return sameDayClassRecord.class;

  const anyClassRecord = (sectionRecords || []).find(other => {
    if (other === record) return false;

    return (
      canonicalShowType(other?.show_type) === "conformation" &&
      isRealConformationClassName(other?.class)
    );
  });

  return anyClassRecord?.class || currentClass || "-";
}

function renderRecordSection(records) {
  if (!records.length) return `<div class="empty">No records in this section.</div>`;

  return `
    ${buildSummary(records)}
    <table class="records-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Show</th>
          <th>Type</th>
          <th>Class</th>
          <th>Placement</th>
          <th>Points</th>
          <th>Score</th>
        </tr>
      </thead>
      <tbody>
        ${records.map(r => `
          <tr>
            <td>${r.event_date || "-"}</td>
            <td>${r.show_name || "-"}</td>
            <td>${r.show_type || "-"}</td>
            <td>${displayRecordClass(r, records)}</td>
            <td>${r.placement || "-"}</td>
            <td>${pointsValue(r)}</td>
            <td>${formatScore(r)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

async function getAnimal(animalRef) {
  const supabase = getSupabase();

  if (!animalRef) return null;

  if (isUUID(animalRef)) {
    const { data, error } = await supabase
      .from("animals")
      .select("*")
      .eq("id", animalRef)
      .maybeSingle();

    if (error) console.warn("Animal UUID lookup error:", error.message);
    if (data) return data;
  }

  if (isNumberLike(animalRef)) {
    const { data, error } = await supabase
      .from("animals")
      .select("*")
      .eq("animal_number", Number(animalRef))
      .maybeSingle();

    if (error) console.warn("Animal number lookup error:", error.message);
    if (data) return data;
  }

  return null;
}

async function loadBreedingAwardData(animal, titleRules) {
  const supabase = getSupabase();

  if (!supabase || !animal?.id) {
    return {
      offspringCount: 0,
      championOffspring: 0,
      supremeWorldChampionOffspring: 0,
      loadError: false
    };
  }

  /*
    ROM-family awards are based on OFFSPRING achievement, not the parent's
    own show records.

    CH. and SprWCH. thresholds come from the active conformation title rules,
    so the breeding-award system cannot drift away from the site's canonical
    conformation ladder if those thresholds are ever changed.
  */
  const conformationRules = (titleRules || []).filter(
    rule => normalizeKey(rule?.applies_to) === "conformation"
  );

  const championRule = conformationRules.find(
    rule => titleCodeKey(rule?.title_code) === "ch"
  );

  const supremeWorldChampionRule = conformationRules.find(
    rule => titleCodeKey(rule?.title_code) === "sprwch"
  );

  const championThreshold = Number(championRule?.points_required);
  const supremeWorldChampionThreshold = Number(supremeWorldChampionRule?.points_required);

  const effectiveChampionThreshold =
    Number.isFinite(championThreshold) && championThreshold > 0
      ? championThreshold
      : 250;

  const effectiveSupremeWorldChampionThreshold =
    Number.isFinite(supremeWorldChampionThreshold) && supremeWorldChampionThreshold > 0
      ? supremeWorldChampionThreshold
      : 5000;

  if (!championRule) {
    console.warn("CH. conformation rule missing; ROM audit fallback threshold 250 is being used.");
  }

  if (!supremeWorldChampionRule) {
    console.warn("SprWCH. conformation rule missing; ROM audit fallback threshold 5000 is being used.");
  }

  const { data, error } = await supabase
    .from("animals")
    .select("id, conformation_points")
    .or(`sire.eq.${animal.id},dam.eq.${animal.id}`);

  if (error) {
    console.warn("Breeding award offspring lookup error:", error.message);
    return {
      offspringCount: 0,
      championOffspring: 0,
      supremeWorldChampionOffspring: 0,
      loadError: true,
      errorMessage: error.message
    };
  }

  const offspring = data || [];

  const championOffspring = offspring.filter(child => {
    const points = Number(child?.conformation_points || 0);
    return Number.isFinite(points) && points >= effectiveChampionThreshold;
  }).length;

  const supremeWorldChampionOffspring = offspring.filter(child => {
    const points = Number(child?.conformation_points || 0);
    return Number.isFinite(points) && points >= effectiveSupremeWorldChampionThreshold;
  }).length;

  return {
    offspringCount: offspring.length,
    championOffspring,
    supremeWorldChampionOffspring,
    championThreshold: effectiveChampionThreshold,
    supremeWorldChampionThreshold: effectiveSupremeWorldChampionThreshold,
    loadError: false
  };
}

function calculateBreedingAwardTitles(animal) {
  const data = animal?._breedingAwards || {};

  if (data.loadError) {
    return {
      suffixes: [],
      rows: [{
        titleName: "Breeding Awards",
        titleCode: "",
        count: "Temporarily unable to load offspring achievement data",
        sort: 269
      }]
    };
  }

  const championCount = Number(data.championOffspring || 0);
  const supremeCount = Number(data.supremeWorldChampionOffspring || 0);

  const isHorse = normalizeKey(animal?.species) === "horse";

  const romRequired = isHorse ? 5 : 10;
  const romxRequired = isHorse ? 10 : 25;
  const sprRomRequired = isHorse ? 5 : 10;
  const sprRomxRequired = isHorse ? 10 : 25;

  const suffixes = [];
  const rows = [];

  // Higher award replaces the lower award within the same ROM track.
  if (championCount >= romxRequired) {
    suffixes.push("ROMX");
    rows.push({
      titleName: "Register of Merit Excellent",
      titleCode: "ROMX",
      count: `${championCount} Champion offspring`,
      sort: 270
    });
  } else if (championCount >= romRequired) {
    suffixes.push("ROM");
    rows.push({
      titleName: "Register of Merit",
      titleCode: "ROM",
      count: `${championCount} Champion offspring`,
      sort: 271
    });
  }

  if (supremeCount >= sprRomxRequired) {
    suffixes.push("SprROMX");
    rows.push({
      titleName: "Supreme Register of Merit Excellent",
      titleCode: "SprROMX",
      count: `${supremeCount} SprWCH offspring`,
      sort: 272
    });
  } else if (supremeCount >= sprRomRequired) {
    suffixes.push("SprROM");
    rows.push({
      titleName: "Supreme Register of Merit",
      titleCode: "SprROM",
      count: `${supremeCount} SprWCH offspring`,
      sort: 273
    });
  }

  return { suffixes, rows };
}

async function getTableRows(tableName) {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from(tableName)
    .select("*")
    .eq("active", true);

  if (error) {
    console.warn(tableName + " error:", error.message);
    return [];
  }

return data || [];
}

function fallbackActivityNameFromClass(className) {
  return String(className || "")
    .normalize("NFKD")
    .replace(/[â€â€‘â€’â€“â€”â€•]/g, "-")
    .replace(/\(\s*\d+\s*entries?\s*\)/gi, "")
    .replace(/\s*-\s*group\s*\d+/gi, "")
    .replace(/\s*-\s*division\s*\d+/gi, "")
    .replace(/\s*-\s*team\s*\d+/gi, "")
    .replace(/\s*-\s*untitled$/gi, "")
    .replace(/\s*-\s*[a-z]{1,5}\d*$/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isHerdingActivityRecord(record) {
  if (canonicalShowType(record?.show_type) !== "activity") return false;

  const classText = normalizeKey(record?.class);
  const showText = normalizeKey(record?.show_name);
  const labelText = normalizeKey(record?.score_label);
  const combined = `${classText} ${showText} ${labelText}`;

  return (
    classText === "herding" ||
    classText.startsWith("herding -") ||
    classText.includes("herding stakes") ||
    (
      combined.includes("herding") &&
      (
        combined.includes("stakes") ||
        combined.includes("instinct") ||
        /\bpt\b/.test(combined)
      )
    )
  );
}

function resolveActivityForRecord(record, activityTypes) {
  /*
    ENDURANCE NORMALIZATION

    Endurance race names are CLASSES / individual races, not separate activities.
    Historical and association uploads may not always store activity_key="endurance",
    so resolve them to the canonical Endurance activity before any class-name fallback.

    Examples that must all total under Endurance:
      Endurance
      50km Open Endurance Run
      200 Km Mares Challenge Endurance Run
      named Endurance Club stakes / circuit races
  */
  const enduranceText = normalizeKey([
    record?.class,
    record?.show_name,
    record?.score_label,
    record?.activity_key,
    record?.association_key,
    record?.association_event_type,
    record?.endurance_race_name,
    record?.endurance_race_key
  ].filter(Boolean).join(" "));

  const isEnduranceRecord = (
    normalizeKey(record?.association_key) === "endurance club" ||
    activityBaseKey(record?.activity_key) === "endurance" ||
    record?.endurance_race_key ||
    record?.endurance_race_name ||
    record?.endurance_distance_km !== null && record?.endurance_distance_km !== undefined ||
    /\bendurance\b/.test(enduranceText)
  );

  if (isEnduranceRecord) {
    const enduranceActivity = (activityTypes || []).find(activity => {
      const key = activityBaseKey(activity?.activity_key);
      const name = activityBaseKey(activity?.display_name);
      return key === "endurance" || name === "endurance";
    });

    return {
      activity_key: enduranceActivity?.activity_key || "endurance",
      display_name: enduranceActivity?.display_name || "Endurance"
    };
  }

  /*
    Every Herding class belongs to one activity total.

    Examples that all resolve to "Herding":
      Herding
      Herding - Puppy Sheep
      Herding - Beginners Cattle
      Herding - PT
      Herding Instinct Test
  */
  if (isHerdingActivityRecord(record)) {
    const herdingActivity = (activityTypes || []).find(activity => {
      const key = activityBaseKey(activity?.activity_key);
      const name = activityBaseKey(activity?.display_name);

      return key === "herding" || name === "herding";
    });

    return {
      activity_key: herdingActivity?.activity_key || "herding",
      display_name: herdingActivity?.display_name || "Herding"
    };
  }

  /*
    Retrieving divisions and open-breed classes are all part of the
    same Canine Retrieving activity total.

    Examples:
      Canine Retrieving
      Retrieving - Open Breeds
      Retrieving - Novice
  */
  const retrievingText = normalizeKey(record?.class);
  if (
    retrievingText === "retrieving" ||
    retrievingText.startsWith("retrieving -") ||
    retrievingText === "canine retrieving" ||
    retrievingText.startsWith("canine retrieving -")
  ) {
    const retrievingActivity = (activityTypes || []).find(activity => {
      const key = activityBaseKey(activity?.activity_key);
      const name = activityBaseKey(activity?.display_name);

      return (
        key === "canine retrieving" ||
        name === "canine retrieving"
      );
    });

    return {
      activity_key: retrievingActivity?.activity_key || "canine_retrieving",
      display_name: retrievingActivity?.display_name || "Canine Retrieving"
    };
  }

  /*
    Prefer the canonical activity_key already stored on the show record.

    The class is the specific event/class the animal entered; activity_key is
    the parent activity whose points/titles the record belongs to.

    Example:
      activity_key = "gaiting"
      class        = "T2: Open Loose Rein TÃ¶lt - Untitled"

    This keeps the detailed Icelandic class visible in the records table while
    correctly adding its points to Gaiting.
  */
  const storedActivityKey = activityBaseKey(record?.activity_key);

  if (storedActivityKey) {
    const storedActivity = (activityTypes || []).find(activity => {
      const key = activityBaseKey(activity?.activity_key);
      const name = activityBaseKey(activity?.display_name);

      return key === storedActivityKey || name === storedActivityKey;
    });

    if (storedActivity) {
      return {
        activity_key: storedActivity.activity_key || record.activity_key,
        display_name: storedActivity.display_name || storedActivity.activity_key || record.activity_key
      };
    }

    /*
      Even if activity_types is temporarily missing that row, trust the stored
      key rather than turning a class name into a brand-new activity bucket.
    */
    return {
      activity_key: record.activity_key,
      display_name: String(record.activity_key || "")
        .replace(/_/g, " ")
        .replace(/\b\w/g, char => char.toUpperCase())
    };
  }

  /* Legacy fallback for historical records that do not have activity_key. */
  const matchedActivity = findMatchedActivity(record?.class, activityTypes);

  if (matchedActivity) {
    return {
      activity_key: matchedActivity.activity_key || matchedActivity.display_name,
      display_name: matchedActivity.display_name || matchedActivity.activity_key
    };
  }

  const fallbackName = fallbackActivityNameFromClass(record?.class);
  if (!fallbackName) return null;

  return {
    activity_key: activityBaseKey(fallbackName),
    display_name: fallbackName
  };
}

function calculateActivityTotals(activityRecords, activityTypes) {
  const activityTotals = {};

  activityRecords.forEach(record => {
    const activity = resolveActivityForRecord(record, activityTypes);
    if (!activity) return;

    const key = activityBaseKey(activity.activity_key || activity.display_name);
    if (!key) return;

    if (!activityTotals[key]) {
      activityTotals[key] = {
        activity_key: key === "show hunter"
          ? "show_hunter"
          : (activity.activity_key || key),
        display_name: key === "show hunter"
          ? "Show Hunter"
          : (activity.display_name || fallbackActivityNameFromClass(record.class) || "Unknown Activity"),
        points: 0
      };
    }

    activityTotals[key].points += pointsValue(record);
  });

  return activityTotals;
}

function addTotalAwardKeyVariants(targetSet, value) {
  const base = activityBaseKey(value);
  if (!base) return;

  targetSet.add(base);

  const withoutSpecies = base
    .replace(/^(feline|cat)\s+/i, '')
    .replace(/^(canine|dog)\s+/i, '')
    .replace(/^(equine|horse)\s+/i, '')
    .trim();

  if (withoutSpecies) targetSet.add(withoutSpecies);

  if (withoutSpecies && normalizeKey(value).startsWith('cat ')) targetSet.add('feline ' + withoutSpecies);
  if (withoutSpecies && normalizeKey(value).startsWith('feline ')) targetSet.add('cat ' + withoutSpecies);
  if (withoutSpecies && normalizeKey(value).startsWith('horse ')) targetSet.add('equine ' + withoutSpecies);
  if (withoutSpecies && normalizeKey(value).startsWith('equine ')) targetSet.add('horse ' + withoutSpecies);
}

function getTotalAwardEligibleKeys(animal, totalRules) {
  const eligible = new Set();
  const animalSpecies = normalizeKey(animal?.species);

  (totalRules || [])
    .filter(r => normalizeKey(r.species) === animalSpecies)
    .forEach(r => addTotalAwardKeyVariants(eligible, r.activity_key));

  if (animalSpecies === 'cat') {
    const fallbackCatActivities = [
    'Feline Agility',
    'Feline Obedience',
    'Feline Rally',
    'Fishing',
    'Feline Retrieving',
    'Stunt Cat',
    'Feline Treibball',
    'Feline Trick',
    'Feline Vaulting',
    'Scent Detection',
    'High Jump'
  ];

    fallbackCatActivities.forEach(activity => addTotalAwardKeyVariants(eligible, activity));
  }

  return eligible;
}

function isTotalAwardEligibleActivity(activity, eligibleKeys) {
  if (!activity || !eligibleKeys || !eligibleKeys.size) return false;

  const options = new Set();
  addTotalAwardKeyVariants(options, activity.activity_key);
  addTotalAwardKeyVariants(options, activity.display_name);

  return [...options].some(key => eligibleKeys.has(key));
}

function uniqueTitleList(items) {
  const seen = new Set();
  const out = [];

  (items || []).forEach(item => {
    const value = String(item || "").trim();
    if (!value) return;

    const key = titleCodeKey(value);
    if (seen.has(key)) return;

    seen.add(key);
    out.push(value);
  });

  return out;
}

function earliestRecordDate(records) {
  const dates = (records || [])
    .map(r => String(r?.event_date || "").trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  return dates[0] || "9999-12-31";
}

function activityTitleEarnedDate(activityKey, activityRecords, activityTypes) {
  const target = activityBaseKey(activityKey);

  const matching = (activityRecords || []).filter(record => {
    const activity = resolveActivityForRecord(record, activityTypes);
    if (!activity) return false;

    const matchedKey = activityBaseKey(activity.activity_key || activity.display_name);
    return matchedKey === target;
  });

  return earliestRecordDate(matching);
}

function manualSuffixDisplayGroup(code) {
  const key = String(code || "")
    .toUpperCase()
    .replace(/\./g, "")
    .trim();

  if (["CGC", "CGCB", "CGCS", "CGCG", "CGCA", "CGCU"].includes(key)) return "cgc";
  if (["TT", "TTC", "TTD", "TTH", "TAC", "TAD", "TAH"].includes(key)) return "therapyTemperament";

  return "manual";
}

function highestManualTitleBySort(codes) {
  const cleanCodes = (codes || [])
    .map(code => String(code || "").trim())
    .filter(Boolean);

  if (!cleanCodes.length) return [];

  return [
    cleanCodes
      .slice()
      .sort((a, b) => manualTitleSort(b) - manualTitleSort(a))[0]
  ];
}

function herdingRecordText(record) {
  return normalizeKey([
    record?.show_name,
    record?.class,
    record?.score_label,
    record?.placement,
    record?.activity_key
  ].filter(Boolean).join(" "));
}

function herdingPassed(record) {
  if (record?.passed === true) return true;

  const passedText = normalizeKey(record?.passed);
  if (["true", "pass", "passed", "qualified", "qualifying"].includes(passedText)) {
    return true;
  }

  const text = herdingRecordText(record);

  return (
    /\b(pass|passed|qualified|qualifying)\b/.test(text) &&
    !/\b(fail|failed|not qualified|non qualifying)\b/.test(text)
  );
}

function isHerdingInstinctRecord(record) {
  const text = herdingRecordText(record);
  const activityKey = normalizeKey(record?.activity_key);

  /*
    Historical Instinct Test uploads did not always save activity_key = herding.
    Treat an explicit Herding/Instinct Test record as Herding instinct even when
    that legacy field is blank, while still accepting the newer herding key.
  */
  const hasInstinctText = (
    text.includes("herding instinct") ||
    text.includes("instinct test") ||
    text.includes("instinct testing")
  );

  if (!hasInstinctText) return false;

  return (
    activityKey === "herding" ||
    activityKey === "" ||
    text.includes("herding")
  );
}

function herdingStockInfoFromRecord(record) {
  /*
    Current Herding uploads may store:
      class       = "Herding"
      score_label = "Herding - Puppy Sheep"

    Older standardized records may instead store the full specialization in
    class itself. Use BOTH record-owned fields as the authority so valid Qs
    are not lost simply because the uploader kept the generic activity name
    in the class column.
  */
  const classText = normalizeKey(record?.class);
  const labelText = normalizeKey(record?.score_label);
  const text = `${classText} ${labelText}`.trim();

  if (/\bcattle\b/.test(text)) {
    return { name: "Cattle", code: "c", sort: 1 };
  }

  if (/\bsheep\b/.test(text)) {
    return { name: "Sheep", code: "s", sort: 2 };
  }

  if (/\bducks?\b/.test(text)) {
    return { name: "Ducks", code: "d", sort: 3 };
  }

  if (/\breindeer\b/.test(text)) {
    return { name: "Reindeer", code: "r", sort: 4 };
  }

  return null;
}

function herdingStockFromRecord(record) {
  return herdingStockInfoFromRecord(record)?.name || null;
}

function herdingDivisionFromRecord(record) {
  /*
    Never infer a Stakes division from the dog's existing Herding title.

    Use the recorded class plus score_label because current uploads may keep
    class="Herding" and store "Herding - Beginners Sheep" / "Puppy Sheep"
    in score_label.
  */
  if (isHerdingInstinctRecord(record)) return "Instinct";

  const classText = normalizeKey(record?.class);
  const labelText = normalizeKey(record?.score_label);
  const text = `${classText} ${labelText}`.trim();

  if (/\bpuppy\b/.test(text)) return "Puppy";
  if (/\bbeginners?\b/.test(text)) return "Beginners";
  if (/\badvanced\b/.test(text)) return "Advanced";
  if (/\bexpert\b/.test(text)) return "Expert";
  if (/\bchampionship\b/.test(text)) return "Championship";

  return null;
}

function normalizeHerdingRule(rule) {
  return {
    ...rule,
    rule_type: normalizeKey(rule?.rule_type),
    division: String(rule?.division || "").trim(),
    stock: rule?.stock ? String(rule.stock).trim() : null,
    title_position: normalizeKey(rule?.title_position || "suffix"),
    qualifying_scores_required: Number(rule?.qualifying_scores_required || 1),
    minimum_score:
      rule?.minimum_score === null ||
      rule?.minimum_score === undefined ||
      rule?.minimum_score === ""
        ? null
        : Number(rule.minimum_score),
    progression_rank: Number(rule?.progression_rank || 0),
    permanent: rule?.permanent === true,
    requires_pass: rule?.requires_pass === true
  };
}

function recordMatchesHerdingRule(record, rawRule) {
  const rule = normalizeHerdingRule(rawRule);

  if (canonicalShowType(record?.show_type) !== "activity") return false;

  /*
    Instinct Tests are deliberately checked before the strict activity_key test.
    Older valid HIC records may have a blank/legacy activity_key, and should still
    count toward HIC when their class/show text clearly identifies the test.
  */
  if (rule.rule_type === "instinct") {
    if (!isHerdingInstinctRecord(record)) return false;
    return !rule.requires_pass || herdingPassed(record);
  }

  /*
    Current records should normally use activity_key="herding", but older
    valid records and a few uploader generations can have a blank key while
    still clearly identifying Herding in class/score_label/show_name.
  */
  const activityKey = normalizeKey(record?.activity_key);

  /*
    Do not use the bare word "herding" as the legacy fallback.

    Other activities legitimately contain Herding as a breed/group label, e.g.
      Fast CAT - HERDING - Group 1
      Barn Hunt - Herding - Group 1
      Hydrodash - Herding - Group 1

    A Stakes record must therefore either:
      1) carry the canonical activity_key="herding", OR
      2) have no stored activity_key and contain an actual parseable Herding
         Stakes specialization (division + stock) in class/score_label.

    This preserves valid older Stakes uploads without allowing unrelated
    Herding-group records into the specialization title engine.
  */
  const division = herdingDivisionFromRecord(record);
  const stock = herdingStockFromRecord(record);

  const hasCanonicalHerdingKey = activityKey === "herding";
  const isLegacyHerdingStakes =
    activityKey === "" &&
    Boolean(division) &&
    Boolean(stock);

  if (!hasCanonicalHerdingKey && !isLegacyHerdingStakes) return false;

  if (rule.rule_type !== "stakes") return false;
  if (isHerdingInstinctRecord(record)) return false;

  if (normalizeKey(division) !== normalizeKey(rule.division)) return false;
  if (normalizeKey(stock) !== normalizeKey(rule.stock)) return false;

  /*
    For scored Stakes rules, the numeric score is authoritative. This keeps
    older legitimate 240+ records from being rejected just because the legacy
    upload never stored passed=true.
  */
  if (rule.requires_pass && rule.minimum_score === null && !herdingPassed(record)) return false;

  if (rule.minimum_score !== null) {
    const score = Number(record?.score);

    /*
      Historical Herding Stakes records may pre-date the modern passed /
      score_label / activity_key fields. If a real numeric score is stored,
      the score itself is authoritative:

        240+  = qualifying score
        <240  = non-qualifying score

      Do NOT require passed=true for these older scored records.
      Truly scoreless historical Stakes records remain visible but do not
      count toward the 240+ specialization total.
    */
    if (!Number.isFinite(score)) return false;
    if (score < rule.minimum_score) return false;
  }

  return true;
}

function herdingBaseCodeForDivision(division) {
  const key = normalizeKey(division);

  if (key === "puppy") return "PS";
  if (key === "beginners") return "HS";
  if (key === "advanced") return "HA";
  if (key === "expert") return "HX";
  if (key === "championship") return "HCh";

  return null;
}

function herdingDivisionSort(division) {
  const key = normalizeKey(division);

  if (key === "puppy") return 0;
  if (key === "beginners") return 1;
  if (key === "advanced") return 2;
  if (key === "expert") return 3;
  if (key === "championship") return 4;

  return 99;
}

function combineHerdingStockRules(rules) {
  /*
    Same-level stock specializations combine:
      HSs + HSd -> HSsd

    Different levels remain separate:
      Sheep Advanced + Ducks Started -> HSd HAs
  */
  const grouped = {};

  (rules || []).forEach(rule => {
    const baseCode = herdingBaseCodeForDivision(rule.division);
    const stockInfo = herdingStockInfoFromRecord({ class: rule.stock });

    if (!baseCode || !stockInfo) return;

    const groupKey = `${normalizeKey(rule.title_position)}|${baseCode}`;

    if (!grouped[groupKey]) {
      grouped[groupKey] = {
        baseCode,
        title_position: rule.title_position,
        division: rule.division,
        progression_rank: rule.progression_rank,
        stocks: []
      };
    }

    grouped[groupKey].stocks.push(stockInfo);
  });

  return Object.values(grouped)
    .sort((a, b) => {
      return (
        herdingDivisionSort(a.division) - herdingDivisionSort(b.division) ||
        Number(a.progression_rank || 0) - Number(b.progression_rank || 0)
      );
    })
    .map(group => {
      const stockCodes = group.stocks
        .slice()
        .sort((a, b) => a.sort - b.sort)
        .map(stock => stock.code)
        .join("");

      return {
        code: group.baseCode + stockCodes,
        title_position: group.title_position
      };
    });
}

function calculateHerdingTitles(records, animal, herdingRules) {
  if (normalizeKey(animal?.species) !== "dog") {
    return { prefixes: [], suffixes: [], rows: [] };
  }

  const activeRules = (herdingRules || [])
    .filter(rule => rule?.active !== false)
    .map(normalizeHerdingRule);

  if (!activeRules.length) {
    return { prefixes: [], suffixes: [], rows: [] };
  }

  /*
    FINAL HERDING V2 SPECIALIZATION LADDER

      Puppy        -> PS_
      Beginners    -> HS_
      Advanced     -> HA_
      Expert       -> HX_
      Championship -> HCh_

    Every Stakes specialization requires 5 scores of 240+
    in the exact same division + stock.

    The normal/base HS / HA / HX / HCh. Herding titles do not
    affect specialization placement.
  */
  const evaluatedRules = activeRules.map(rule => {
    const qualifyingRecords = (records || []).filter(record =>
      recordMatchesHerdingRule(record, rule)
    );

    return {
      ...rule,
      qualifyingCount: qualifyingRecords.length,
      earned:
        qualifyingRecords.length >= rule.qualifying_scores_required
    };
  });

  const earnedRules = evaluatedRules.filter(rule => rule.earned);

  /*
    HIC and any other non-progression rules remain permanently.
    Puppy Stakes rules are permanent and never disappear when the
    dog begins adult specialization work.
  */
  const nonStockPermanentEarned = earnedRules.filter(rule =>
    (rule.permanent || !rule.progression_group) &&
    !rule.stock
  );

  const puppyStockEarned = earnedRules.filter(rule =>
    rule.rule_type === "stakes" &&
    normalizeKey(rule.division) === "puppy" &&
    Boolean(rule.stock)
  );

  /*
    Adult progression is independent by stock.

    The corrected Supabase rule table uses progression groups:
      adult_sheep
      adult_cattle
      adult_ducks
      adult_reindeer

    Only the highest earned adult level in each stock group displays.
  */
  const bestProgressiveByGroup = {};

  earnedRules
    .filter(rule =>
      rule.rule_type === "stakes" &&
      normalizeKey(rule.division) !== "puppy" &&
      !rule.permanent &&
      rule.progression_group
    )
    .forEach(rule => {
      const group = String(rule.progression_group);
      const current = bestProgressiveByGroup[group];

      if (
        !current ||
        rule.progression_rank > current.progression_rank
      ) {
        bestProgressiveByGroup[group] = rule;
      }
    });

  const prefixes = [];
  const suffixes = [];

  /*
    Non-stock permanent titles such as HIC stay as their own codes.
  */
  nonStockPermanentEarned
    .slice()
    .sort((a, b) =>
      String(a.title_code || "").localeCompare(String(b.title_code || ""))
    )
    .forEach(rule => {
      if (rule.title_position === "prefix") {
        prefixes.push(rule.title_code);
      } else {
        suffixes.push(rule.title_code);
      }
    });

  /*
    Puppy stock titles can coexist and are combined by stock letter.
    Example:
      PSs + PSd -> PSsd
  */
  combineHerdingStockRules(puppyStockEarned)
    .forEach(title => {
      if (title.title_position === "prefix") {
        prefixes.push(title.code);
      } else {
        suffixes.push(title.code);
      }
    });

  /*
    Adult stock titles combine ONLY when the current highest title
    for those stocks is at the same level.

    Examples:
      HSs + HSd -> HSsd
      HSd + HAs -> HSd HAs
  */
  combineHerdingStockRules(Object.values(bestProgressiveByGroup))
    .forEach(title => {
      if (title.title_position === "prefix") {
        prefixes.push(title.code);
      } else {
        suffixes.push(title.code);
      }
    });

  /*
    Show qualification progress as soon as at least one qualifying
    score/pass exists. Incomplete titles do not enter the registered
    name until the rule threshold is met.
  */
  const progressRows = evaluatedRules
    .filter(rule => rule.qualifyingCount > 0)
    .sort((a, b) => {
      const aInstinct = a.rule_type === "instinct" ? 0 : 1;
      const bInstinct = b.rule_type === "instinct" ? 0 : 1;

      return (
        aInstinct - bInstinct ||
        herdingDivisionSort(a.division) - herdingDivisionSort(b.division) ||
        Number(a.progression_rank || 0) - Number(b.progression_rank || 0) ||
        String(a.stock || "").localeCompare(String(b.stock || ""))
      );
    })
    .map((rule, index) => {
      const requirementLabel =
        rule.rule_type === "instinct"
          ? `${Math.min(rule.qualifyingCount, rule.qualifying_scores_required)}/${rule.qualifying_scores_required} qualifying pass${rule.qualifying_scores_required === 1 ? "" : "es"}`
          : `${Math.min(rule.qualifyingCount, rule.qualifying_scores_required)}/${rule.qualifying_scores_required} qualifying scores`;

      const progressName =
        rule.rule_type === "instinct"
          ? rule.title_name || "Herding Instinct Certificate"
          : rule.earned
            ? rule.title_name
            : `${rule.division}${rule.stock ? " | " + rule.stock : ""} | In Progress`;

      return {
        titleName: progressName,
        titleCode: rule.title_code,
        count: requirementLabel,
        sort: 700 + index
      };
    });

  return {
    prefixes: uniqueTitleList(prefixes),
    suffixes: uniqueTitleList(suffixes),
    rows: progressRows
  };
}


function calculateTestingTitles(records, animal) {
  const species = normalizeKey(animal?.species);
  const suffixes = [];
  const rows = [];
  const speciesCodes = {
    dog: { temperament: "TTD", therapy: "TAD" },
    cat: { temperament: "TTC", therapy: "TAC" },
    horse: { temperament: "TTH", therapy: "TAH" }
  };
  const codes = speciesCodes[species];
  if (!codes) return { suffixes, rows };

  const temperamentPassed = (records || []).some(r =>
    canonicalShowType(r?.show_type) === "activity" &&
    testingCertificateLabel(r) === "Temperament Testing" &&
    (Number(r?.score) >= 110 || recordPassed(r) === true)
  );
  if (temperamentPassed) {
    suffixes.push(codes.temperament);
    const record = (records || []).find(r =>
      canonicalShowType(r?.show_type) === "activity" &&
      testingCertificateLabel(r) === "Temperament Testing" &&
      (Number(r?.score) >= 110 || recordPassed(r) === true)
    );
    rows.push({
      titleName: manualTitleName(codes.temperament),
      titleCode: codes.temperament,
      count: record ? manualScoreLabel(record) : "Passed",
      sort: 760
    });
  }

  const therapyPasses = (records || []).filter(r =>
    canonicalShowType(r?.show_type) === "activity" &&
    testingCertificateLabel(r) === "Therapy Animal" &&
    (Number(r?.score) >= 110 || recordPassed(r) === true)
  ).length;
  if (therapyPasses) {
    suffixes.push(codes.therapy);
    const record = (records || []).find(r =>
      canonicalShowType(r?.show_type) === "activity" &&
      testingCertificateLabel(r) === "Therapy Animal" &&
      (Number(r?.score) >= 110 || recordPassed(r) === true)
    );
    rows.push({
      titleName: manualTitleName(codes.therapy),
      titleCode: codes.therapy,
      count: therapyPasses === 1
        ? (record ? manualScoreLabel(record) : "1 Pass")
        : `${therapyPasses} Passes`,
      sort: 761
    });
  }

  if (species === "dog") {
    const levels = [
      {key:"cgc",code:"CGC",name:"Canine Good Citizen",rank:1},
      {key:"cgcb",code:"CGCB",name:"Canine Good Citizen Bronze",rank:2},
      {key:"cgcs",code:"CGCS",name:"Canine Good Citizen Silver",rank:3},
      {key:"cgcg",code:"CGCG",name:"Canine Good Citizen Gold",rank:4},
      {key:"cgca",code:"CGCA",name:"Canine Good Citizen Advanced",rank:5},
      {key:"cgcu",code:"CGCU",name:"Canine Good Citizen Urban",rank:6}
    ];
    const earned=levels.filter(level => (records || []).some(r =>
      canonicalShowType(r?.show_type)==="activity" &&
      recordPassed(r)===true &&
      (normalizeKey(r?.activity_key)===level.key || normalizeKey(r?.score_label)===normalizeKey(level.code) || normalizeKey(r?.class)===normalizeKey(level.name))
    ));
    if (earned.length) {
      const highest=earned.sort((a,b)=>b.rank-a.rank)[0];
      suffixes.push(highest.code);
      rows.push({titleName:highest.name,titleCode:highest.code,count:"Passed",sort:762});
    }
  }
  return { suffixes: uniqueTitleList(suffixes), rows };
}


const SS_ENDURANCE_TITLE_RACES = [{"key":"northern_circuit_polar_trek","name":"Polar Trek","circuit":"Northern Circuit","series":null,"grade":"III","conference":"Host Dependent","distance_km":850,"event_kind":"rated","requires_endurance_title":true},{"key":"northern_circuit_highland_challenge","name":"Highland Challenge","circuit":"Northern Circuit","series":null,"grade":"III","conference":"Western","distance_km":155,"event_kind":"rated","requires_endurance_title":true},{"key":"northern_circuit_viking_cup","name":"Viking Cup","circuit":"Northern Circuit","series":null,"grade":"III","conference":"Western","distance_km":165,"event_kind":"rated","requires_endurance_title":true},{"key":"northern_circuit_fjord_expedition","name":"Fjord Expedition","circuit":"Northern Circuit","series":null,"grade":"III","conference":"Western","distance_km":500,"event_kind":"rated","requires_endurance_title":true},{"key":"northern_circuit_siberian_plate","name":"Siberian Plate","circuit":"Northern Circuit","series":null,"grade":"I","conference":"Eastern","distance_km":1500,"event_kind":"rated","requires_endurance_title":true},{"key":"northern_circuit_baltic_challenge","name":"Baltic Challenge","circuit":"Northern Circuit","series":null,"grade":"III","conference":"Western","distance_km":350,"event_kind":"rated","requires_endurance_title":true},{"key":"northern_circuit_celtic_crossing","name":"Celtic Crossing","circuit":"Northern Circuit","series":null,"grade":"III","conference":"Western","distance_km":400,"event_kind":"rated","requires_endurance_title":true},{"key":"desert_circuit_saudi_cup","name":"Saudi Cup","circuit":"Desert Circuit","series":null,"grade":"III","conference":"Eastern","distance_km":550,"event_kind":"rated","requires_endurance_title":true},{"key":"desert_circuit_marathon_des_sables","name":"Marathon des Sables","circuit":"Desert Circuit","series":null,"grade":"III","conference":"Western","distance_km":260,"event_kind":"rated","requires_endurance_title":true},{"key":"desert_circuit_atlas_challenge","name":"Atlas Challenge","circuit":"Desert Circuit","series":null,"grade":"II","conference":"Western","distance_km":750,"event_kind":"rated","requires_endurance_title":true},{"key":"desert_circuit_nile_expedition","name":"Nile Expedition","circuit":"Desert Circuit","series":null,"grade":"II","conference":"Eastern","distance_km":850,"event_kind":"rated","requires_endurance_title":true},{"key":"desert_circuit_dubai_crown_prince_conference","name":"Dubai Crown Prince Conference","circuit":"Desert Circuit","series":null,"grade":"II","conference":"Eastern","distance_km":150,"event_kind":"rated","requires_endurance_title":true},{"key":"desert_circuit_karakum_crossing","name":"Karakum Crossing","circuit":"Desert Circuit","series":null,"grade":"II","conference":"Eastern","distance_km":650,"event_kind":"rated","requires_endurance_title":true},{"key":"desert_circuit_wadi_rum_challenge","name":"Wadi Rum Challenge","circuit":"Desert Circuit","series":null,"grade":"II","conference":"Eastern","distance_km":500,"event_kind":"rated","requires_endurance_title":true},{"key":"steppe_circuit_mongol_derby","name":"Mongol Derby","circuit":"Steppe Circuit","series":null,"grade":"II","conference":"Eastern","distance_km":1000,"event_kind":"rated","requires_endurance_title":true},{"key":"steppe_circuit_turkmen_s_plate","name":"Turkmen’s Plate","circuit":"Steppe Circuit","series":null,"grade":"III","conference":"Eastern","distance_km":250,"event_kind":"rated","requires_endurance_title":true},{"key":"steppe_circuit_silk_road_classic","name":"Silk Road Classic","circuit":"Steppe Circuit","series":null,"grade":"III","conference":"Eastern","distance_km":700,"event_kind":"rated","requires_endurance_title":true},{"key":"steppe_circuit_eurasia_challenge","name":"Eurasia Challenge","circuit":"Steppe Circuit","series":null,"grade":"I","conference":"Both","distance_km":4000,"event_kind":"rated","requires_endurance_title":true},{"key":"steppe_circuit_dragon_trail","name":"Dragon Trail","circuit":"Steppe Circuit","series":null,"grade":"II","conference":"Eastern","distance_km":900,"event_kind":"rated","requires_endurance_title":true},{"key":"steppe_circuit_altai_eagle_ride","name":"Altai Eagle Ride","circuit":"Steppe Circuit","series":null,"grade":"II","conference":"Eastern","distance_km":900,"event_kind":"rated","requires_endurance_title":true},{"key":"steppe_circuit_kazakh_eagle_cup","name":"Kazakh Eagle Cup","circuit":"Steppe Circuit","series":null,"grade":"II","conference":"Eastern","distance_km":800,"event_kind":"rated","requires_endurance_title":true},{"key":"north_american_frontier_circuit_new_year_s_cup","name":"New Year’s Cup","circuit":"North American Frontier Circuit","series":null,"grade":"III","conference":"Western","distance_km":300,"event_kind":"rated","requires_endurance_title":true},{"key":"north_american_frontier_circuit_tevis_cup","name":"Tevis Cup","circuit":"North American Frontier Circuit","series":null,"grade":"II","conference":"Western","distance_km":100,"event_kind":"rated","requires_endurance_title":true},{"key":"north_american_frontier_circuit_continental_divide","name":"Continental Divide","circuit":"North American Frontier Circuit","series":null,"grade":"I","conference":"Western","distance_km":5000,"event_kind":"rated","requires_endurance_title":true},{"key":"north_american_frontier_circuit_yukon_gold_rush","name":"Yukon Gold Rush","circuit":"North American Frontier Circuit","series":null,"grade":"II","conference":"Western","distance_km":950,"event_kind":"rated","requires_endurance_title":true},{"key":"north_american_frontier_circuit_route_66_classic","name":"Route 66 Classic","circuit":"North American Frontier Circuit","series":null,"grade":"III","conference":"Western","distance_km":500,"event_kind":"rated","requires_endurance_title":true},{"key":"north_american_frontier_circuit_maya_mountain_challenge","name":"Maya Mountain Challenge","circuit":"North American Frontier Circuit","series":null,"grade":"III","conference":"Western","distance_km":450,"event_kind":"rated","requires_endurance_title":true},{"key":"north_american_frontier_circuit_volc_n_trail_classic","name":"Volcán Trail Classic","circuit":"North American Frontier Circuit","series":null,"grade":"II","conference":"Western","distance_km":600,"event_kind":"rated","requires_endurance_title":true},{"key":"south_american_circuit_gaucho_derby","name":"Gaucho Derby","circuit":"South American Circuit","series":null,"grade":"II","conference":"Western","distance_km":500,"event_kind":"rated","requires_endurance_title":true},{"key":"south_american_circuit_pampas_classic","name":"Pampas Classic","circuit":"South American Circuit","series":null,"grade":"III","conference":"Western","distance_km":450,"event_kind":"rated","requires_endurance_title":true},{"key":"south_american_circuit_andes_crossing","name":"Andes Crossing","circuit":"South American Circuit","series":null,"grade":"II","conference":"Western","distance_km":650,"event_kind":"rated","requires_endurance_title":true},{"key":"south_american_circuit_amazon_basin_trek","name":"Amazon Basin Trek","circuit":"South American Circuit","series":null,"grade":"II","conference":"Western","distance_km":700,"event_kind":"rated","requires_endurance_title":true},{"key":"south_american_circuit_atacama_crossing","name":"Atacama Crossing","circuit":"South American Circuit","series":null,"grade":"II","conference":"Western","distance_km":500,"event_kind":"rated","requires_endurance_title":true},{"key":"south_american_circuit_inca_trail_endurance","name":"Inca Trail Endurance","circuit":"South American Circuit","series":null,"grade":"II","conference":"Western","distance_km":700,"event_kind":"rated","requires_endurance_title":true},{"key":"south_american_circuit_pantanal_expedition","name":"Pantanal Expedition","circuit":"South American Circuit","series":null,"grade":"II","conference":"Western","distance_km":550,"event_kind":"rated","requires_endurance_title":true},{"key":"oceania_circuit_outback_challenge","name":"Outback Challenge","circuit":"Oceania Circuit","series":null,"grade":"I","conference":"Eastern","distance_km":2600,"event_kind":"rated","requires_endurance_title":true},{"key":"oceania_circuit_great_barrier_trek","name":"Great Barrier Trek","circuit":"Oceania Circuit","series":null,"grade":"II","conference":"Eastern","distance_km":900,"event_kind":"rated","requires_endurance_title":true},{"key":"oceania_circuit_tasman_trail_classic","name":"Tasman Trail Classic","circuit":"Oceania Circuit","series":null,"grade":"III","conference":"Eastern","distance_km":500,"event_kind":"rated","requires_endurance_title":true},{"key":"oceania_circuit_southern_alps_ride","name":"Southern Alps Ride","circuit":"Oceania Circuit","series":null,"grade":"II","conference":"Eastern","distance_km":750,"event_kind":"rated","requires_endurance_title":true},{"key":"oceania_circuit_coral_coast_challenge","name":"Coral Coast Challenge","circuit":"Oceania Circuit","series":null,"grade":"III","conference":"Eastern","distance_km":350,"event_kind":"rated","requires_endurance_title":true},{"key":"oceania_circuit_kimberley_expedition","name":"Kimberley Expedition","circuit":"Oceania Circuit","series":null,"grade":"II","conference":"Eastern","distance_km":800,"event_kind":"rated","requires_endurance_title":true},{"key":"oceania_circuit_southern_ocean_run","name":"Southern Ocean Run","circuit":"Oceania Circuit","series":null,"grade":"II","conference":"Eastern","distance_km":550,"event_kind":"rated","requires_endurance_title":true},{"key":"african_circuit_great_rift_challenge","name":"Great Rift Challenge","circuit":"African Circuit","series":null,"grade":"III","conference":"Eastern","distance_km":450,"event_kind":"rated","requires_endurance_title":true},{"key":"african_circuit_serengeti_trek","name":"Serengeti Trek","circuit":"African Circuit","series":null,"grade":"II","conference":"Eastern","distance_km":700,"event_kind":"rated","requires_endurance_title":true},{"key":"african_circuit_kalahari_classic","name":"Kalahari Classic","circuit":"African Circuit","series":null,"grade":"II","conference":"Eastern","distance_km":600,"event_kind":"rated","requires_endurance_title":true},{"key":"african_circuit_okavango_challenge","name":"Okavango Challenge","circuit":"African Circuit","series":null,"grade":"II","conference":"Eastern","distance_km":500,"event_kind":"rated","requires_endurance_title":true},{"key":"african_circuit_cape_frontier_ride","name":"Cape Frontier Ride","circuit":"African Circuit","series":null,"grade":"II","conference":"Host Dependent","distance_km":650,"event_kind":"rated","requires_endurance_title":true},{"key":"african_circuit_drakensberg_traverse","name":"Drakensberg Traverse","circuit":"African Circuit","series":null,"grade":"I","conference":"Host Dependent","distance_km":800,"event_kind":"rated","requires_endurance_title":true},{"key":"african_circuit_kilimanjaro_challenge","name":"Kilimanjaro Challenge","circuit":"African Circuit","series":null,"grade":"II","conference":"Eastern","distance_km":750,"event_kind":"rated","requires_endurance_title":true},{"key":"mediterranean_circuit_aegean_odyssey","name":"Aegean Odyssey","circuit":"Mediterranean Circuit","series":null,"grade":"II","conference":"Western","distance_km":500,"event_kind":"rated","requires_endurance_title":true},{"key":"mediterranean_circuit_adriatic_classic","name":"Adriatic Classic","circuit":"Mediterranean Circuit","series":null,"grade":"III","conference":"Western","distance_km":450,"event_kind":"rated","requires_endurance_title":true},{"key":"mediterranean_circuit_sicilian_volcano_run","name":"Sicilian Volcano Run","circuit":"Mediterranean Circuit","series":null,"grade":"III","conference":"Western","distance_km":400,"event_kind":"rated","requires_endurance_title":true},{"key":"mediterranean_circuit_iberian_coast_challenge","name":"Iberian Coast Challenge","circuit":"Mediterranean Circuit","series":null,"grade":"II","conference":"Western","distance_km":650,"event_kind":"rated","requires_endurance_title":true},{"key":"mediterranean_circuit_cyprus_crossing","name":"Cyprus Crossing","circuit":"Mediterranean Circuit","series":null,"grade":"III","conference":"Host Dependent","distance_km":300,"event_kind":"rated","requires_endurance_title":true},{"key":"mediterranean_circuit_amalfi_coast_classic","name":"Amalfi Coast Classic","circuit":"Mediterranean Circuit","series":null,"grade":"II","conference":"Western","distance_km":450,"event_kind":"rated","requires_endurance_title":true},{"key":"mediterranean_circuit_dalmatian_coast_ride","name":"Dalmatian Coast Ride","circuit":"Mediterranean Circuit","series":null,"grade":"II","conference":"Western","distance_km":500,"event_kind":"rated","requires_endurance_title":true},{"key":"southeast_asia_circuit_mekong_expedition","name":"Mekong Expedition","circuit":"Southeast Asia Circuit","series":null,"grade":"II","conference":"Eastern","distance_km":700,"event_kind":"rated","requires_endurance_title":true},{"key":"southeast_asia_circuit_emerald_jungle_challenge","name":"Emerald Jungle Challenge","circuit":"Southeast Asia Circuit","series":null,"grade":"III","conference":"Eastern","distance_km":500,"event_kind":"rated","requires_endurance_title":true},{"key":"southeast_asia_circuit_borneo_rainforest_run","name":"Borneo Rainforest Run","circuit":"Southeast Asia Circuit","series":null,"grade":"III","conference":"Eastern","distance_km":450,"event_kind":"rated","requires_endurance_title":true},{"key":"southeast_asia_circuit_island_kingdom_classic","name":"Island Kingdom Classic","circuit":"Southeast Asia Circuit","series":null,"grade":"III","conference":"Eastern","distance_km":400,"event_kind":"rated","requires_endurance_title":true},{"key":"southeast_asia_circuit_dragon_s_peninsula_trek","name":"Dragon’s Peninsula Trek","circuit":"Southeast Asia Circuit","series":null,"grade":"II","conference":"Eastern","distance_km":650,"event_kind":"rated","requires_endurance_title":true},{"key":"southeast_asia_circuit_angkor_heritage_ride","name":"Angkor Heritage Ride","circuit":"Southeast Asia Circuit","series":null,"grade":"II","conference":"Eastern","distance_km":500,"event_kind":"rated","requires_endurance_title":true},{"key":"southeast_asia_circuit_java_volcano_challenge","name":"Java Volcano Challenge","circuit":"Southeast Asia Circuit","series":null,"grade":"II","conference":"Eastern","distance_km":600,"event_kind":"rated","requires_endurance_title":true},{"key":"world_gemstone_tour_the_ruby","name":"The Ruby","circuit":"World Tour","series":"gemstone","grade":"II","conference":"Western","distance_km":1000,"event_kind":"rated","requires_endurance_title":true},{"key":"world_gemstone_tour_the_opal","name":"The Opal","circuit":"World Tour","series":"gemstone","grade":"II","conference":"Eastern","distance_km":500,"event_kind":"rated","requires_endurance_title":true},{"key":"world_gemstone_tour_the_emerald","name":"The Emerald","circuit":"World Tour","series":"gemstone","grade":"II","conference":"Western","distance_km":500,"event_kind":"rated","requires_endurance_title":true},{"key":"world_gemstone_tour_the_sapphire","name":"The Sapphire","circuit":"World Tour","series":"gemstone","grade":"II","conference":"Eastern","distance_km":1000,"event_kind":"rated","requires_endurance_title":true},{"key":"world_gemstone_tour_the_pearl","name":"The Pearl","circuit":"World Tour","series":"gemstone","grade":"II","conference":"Eastern","distance_km":1100,"event_kind":"rated","requires_endurance_title":true},{"key":"world_gemstone_tour_the_diamond","name":"The Diamond","circuit":"World Tour","series":"gemstone","grade":"II","conference":"Western","distance_km":1000,"event_kind":"rated","requires_endurance_title":true},{"key":"world_crystal_tour_the_quartz","name":"The Quartz","circuit":"World Tour","series":"crystal","grade":null,"conference":"Western","distance_km":250,"event_kind":"world_tour","requires_endurance_title":false},{"key":"world_crystal_tour_the_jade","name":"The Jade","circuit":"World Tour","series":"crystal","grade":null,"conference":"Eastern","distance_km":300,"event_kind":"world_tour","requires_endurance_title":false},{"key":"world_crystal_tour_the_amber","name":"The Amber","circuit":"World Tour","series":"crystal","grade":null,"conference":"Western","distance_km":250,"event_kind":"world_tour","requires_endurance_title":false},{"key":"world_crystal_tour_the_garnet","name":"The Garnet","circuit":"World Tour","series":"crystal","grade":null,"conference":"Western","distance_km":300,"event_kind":"world_tour","requires_endurance_title":false},{"key":"world_crystal_tour_the_onyx","name":"The Onyx","circuit":"World Tour","series":"crystal","grade":null,"conference":"Eastern","distance_km":300,"event_kind":"world_tour","requires_endurance_title":false},{"key":"world_crystal_tour_the_topaz","name":"The Topaz","circuit":"World Tour","series":"crystal","grade":null,"conference":"Eastern","distance_km":250,"event_kind":"world_tour","requires_endurance_title":false},{"key":"world_tour_amazing_race","name":"The Amazing Race","circuit":"World Tour","series":"amazing_race","grade":null,"conference":"Host Dependent","distance_km":1200,"event_kind":"team","requires_endurance_title":false},{"key":"world_the_western_finals","name":"The Western Finals","circuit":"World Tour","series":"conference_final","grade":"INV","conference":"Western","distance_km":1000,"event_kind":"invitational","requires_endurance_title":false,"qualification_text":"Winner of any Western stakes race"},{"key":"world_the_eastern_challenge","name":"The Eastern Challenge","circuit":"World Tour","series":"conference_final","grade":"INV","conference":"Eastern","distance_km":1000,"event_kind":"invitational","requires_endurance_title":false,"qualification_text":"Winner of any Eastern stakes race"},{"key":"world_the_invitational","name":"The Invitational","circuit":"World Tour","series":"invitational","grade":"INV","conference":"International","distance_km":1500,"event_kind":"invitational","requires_endurance_title":false,"qualification_text":"Grade I/II stakes winner, top three in either final, ENO title, or full series winner"}];

function calculateIcelandicAssociationTitles(records, animal) {
  if (normalizeKey(animal?.species) !== "horse") {
    return { prefixes: [], suffixes: [], rows: [] };
  }

  const ihass = (records || []).filter(record =>
    normalizeKey(record?.association_key) === "ihass"
  );

  if (!ihass.length) {
    return { prefixes: [], suffixes: [], rows: [] };
  }

  const pointsFor = eventType =>
    ihass
      .filter(record => normalizeKey(record?.association_event_type) === eventType)
      .reduce((sum, record) => sum + pointsValue(record), 0);

  const halterPoints = pointsFor("halter");
  const gaitingPoints = pointsFor("gaiting");
  const breedingPoints = pointsFor("breeding");

  const breedingCertificates = ihass.filter(record =>
    normalizeKey(record?.association_event_type) === "breeding" &&
    Number.isFinite(Number(record?.score)) &&
    Number(record.score) >= 120
  ).length;

  const prefixes = [];
  const rows = [];

  // HALTER: show highest earned title, otherwise next target.
  if (halterPoints >= 1500) {
    prefixes.push("IHGCh.");
    rows.push({
      category:"Halter",
      title:"Icelandic Horse Grand Champion",
      code:"IHGCh.",
      requirement:"1,500 IHASS Halter points",
      current:`${halterPoints.toLocaleString()} points`,
      earned:true,
      sort:780
    });
  } else if (halterPoints >= 500) {
    prefixes.push("IHCh.");
    rows.push({
      category:"Halter",
      title:"Icelandic Horse Champion",
      code:"IHCh.",
      requirement:"500 IHASS Halter points",
      current:`${halterPoints.toLocaleString()} points`,
      earned:true,
      sort:780
    });
  } else {
    rows.push({
      category:"Halter",
      title:"Icelandic Horse Champion",
      code:"IHCh.",
      requirement:"500 IHASS Halter points",
      current:`${halterPoints.toLocaleString()}/500 points`,
      earned:false,
      sort:780
    });
  }

  // GAITING
  if (gaitingPoints >= 500) {
    prefixes.push("GSGCh.");
    rows.push({
      category:"Gaiting",
      title:"Gaiting Show Grand Champion",
      code:"GSGCh.",
      requirement:"500 IHASS Gaiting points",
      current:`${gaitingPoints.toLocaleString()} points`,
      earned:true,
      sort:781
    });
  } else if (gaitingPoints >= 250) {
    prefixes.push("GSCh.");
    rows.push({
      category:"Gaiting",
      title:"Gaiting Show Champion",
      code:"GSCh.",
      requirement:"250 IHASS Gaiting points",
      current:`${gaitingPoints.toLocaleString()} points`,
      earned:true,
      sort:781
    });
  } else {
    rows.push({
      category:"Gaiting",
      title:"Gaiting Show Champion",
      code:"GSCh.",
      requirement:"250 IHASS Gaiting points",
      current:`${gaitingPoints.toLocaleString()}/250 points`,
      earned:false,
      sort:781
    });
  }

  // BREEDING
  if (breedingCertificates >= 8 && breedingPoints >= 1200) {
    prefixes.push("BSGCh.");
    rows.push({
      category:"Breeding",
      title:"Breeding Show Grand Champion",
      code:"BSGCh.",
      requirement:"8 certificates + 1,200 IHASS Breeding points",
      current:`${breedingCertificates} certificates | ${breedingPoints.toLocaleString()} points`,
      earned:true,
      sort:782
    });
  } else if (breedingCertificates >= 3 && breedingPoints >= 500) {
    prefixes.push("BSCh.");
    rows.push({
      category:"Breeding",
      title:"Breeding Show Champion",
      code:"BSCh.",
      requirement:"3 certificates + 500 IHASS Breeding points",
      current:`${breedingCertificates} certificates | ${breedingPoints.toLocaleString()} points`,
      earned:true,
      sort:782
    });
  } else {
    rows.push({
      category:"Breeding",
      title:"Breeding Show Champion",
      code:"BSCh.",
      requirement:"3 certificates + 500 IHASS Breeding points",
      current:`${breedingCertificates}/3 certificates | ${breedingPoints.toLocaleString()}/500 points`,
      earned:false,
      sort:782
    });
  }

  return {
    prefixes: uniqueTitleList(prefixes),
    suffixes: [],
    rows
  };
}


function enduranceNumericPlacement(record) {
  const match = String(record?.placement || "").match(/\d+/);
  return match ? Number(match[0]) : null;
}

function enduranceSeason(record) {
  const explicit = Number(record?.endurance_season);
  if (Number.isFinite(explicit) && explicit > 1900) return explicit;

  const dateText = String(record?.event_date || "");
  const match = dateText.match(/^(\d{4})/);
  return match ? Number(match[1]) : null;
}

function enduranceTitleRaceDefinition(record) {
  const key = String(record?.endurance_race_key || "");
  return SS_ENDURANCE_TITLE_RACES.find(race => race.key === key) || null;
}


const SS_HUNTING_TITLE_DEFS = {
  flushing:{label:'Flushing',code:'Fl',specializations:{pheasant:['Pheasant','p'],grouse:['Grouse','g'],woodcock:['Woodcock','w'],quail:['Quail','q'],rabbit:['Rabbit','r']}},
  retrieving:{label:'Retrieving',code:'Rt',specializations:{duck:['Duck','d'],goose:['Goose','g'],pheasant:['Pheasant','p'],grouse:['Grouse','gr']}},
  trailing:{label:'Scent / Trailing',code:'Tr',specializations:{rabbit:['Rabbit','r'],hare:['Hare','h'],fox:['Fox','f'],deer:['Deer','d']}},
  treeing_baying:{label:'Treeing / Baying',code:'TB',specializations:{raccoon:['Raccoon','r'],squirrel:['Squirrel','s'],boar:['Boar','bo'],bear:['Bear','br'],cougar:['Cougar','c']}},
  ratting:{label:'Ratting',code:'Rat',specializations:{barn:['Barn','b'],farmyard:['Farmyard','f'],stack_den:['Stack / Den','s'],urban:['Urban','u']}},
  versatile:{label:'Versatile Hunting',code:'VH',specializations:{upland:['Upland','u'],waterfowl:['Waterfowl','w'],woodland:['Woodland','f'],mixed_field:['Mixed Field','m']}},
  coursing:{label:'Coursing',code:'Co',specializations:{rabbit:['Rabbit','r'],hare:['Hare','h'],fox:['Fox','f'],coyote_jackal:['Coyote / Jackal','c'],deer_gazelle:['Deer / Gazelle','d']}},
  falconry:{label:'Falconry',code:'Fa',specializations:{rabbit:['Rabbit','r'],hare:['Hare','h'],pheasant:['Pheasant','p'],grouse:['Grouse','g'],quail:['Quail','q'],waterfowl:['Waterfowl','w']}},
  pack_hunting:{label:'Pack Hunting',code:'PH',specializations:{rabbit:['Rabbit','r'],hare:['Hare','h'],fox:['Fox','f'],coyote_jackal:['Coyote / Jackal','c'],boar:['Boar','b'],deer:['Deer','d']}},
  catch_dogs:{label:'Catch Dogs',code:'CD',specializations:{boar:['Boar','b'],cattle:['Cattle','c']}},
  tolling:{label:'Tolling',code:'Tl',specializations:{waterfowl:['Waterfowl','w']}},
  puffin_hunting:{label:'Puffin Hunting',code:'Pu',specializations:{puffin:['Puffin','p']}}
};

const SS_HUNTING_TITLE_LEVELS = {
  beginners:{label:'Beginners',prefix:'B',required:5},
  expert:{label:'Expert',prefix:'E',required:10},
  masters:{label:'Masters',prefix:'M',required:15}
};

function calculateHuntingClubTitles(records, animal) {
  if (normalizeKey(animal?.species) !== 'dog') {
    return {suffixes:[],rows:[]};
  }

  const club = (records || []).filter(record =>
    normalizeKey(record?.association_key) === 'hunting club' &&
    normalizeKey(record?.association_event_type) === 'field test'
  );

  if (!club.length) return {suffixes:[],rows:[]};

  const grouped = {};

  club.forEach(record => {
    const family = normalizeKey(record?.hunting_family).replace(/\s+/g, "_");
    const specialization = normalizeKey(record?.hunting_specialization).replace(/\s+/g, "_");
    const level = normalizeKey(record?.hunting_level);

    if (!family || !specialization || !SS_HUNTING_TITLE_LEVELS[level]) return;

    const key = family + '::' + specialization;

    if (!grouped[key]) {
      grouped[key] = {
        family,
        specialization,
        counts:{beginners:0,expert:0,masters:0}
      };
    }

    if (recordPassed(record) === true) {
      grouped[key].counts[level]++;
    }
  });

  const suffixes = [];
  const rows = [];

  Object.values(grouped).forEach(group => {
    const familyDef = SS_HUNTING_TITLE_DEFS[group.family];
    const specDef = familyDef?.specializations?.[group.specialization];
    if (!familyDef || !specDef) return;

    const beginnerDef = SS_HUNTING_TITLE_LEVELS.beginners;
    const expertDef = SS_HUNTING_TITLE_LEVELS.expert;
    const mastersDef = SS_HUNTING_TITLE_LEVELS.masters;

    let displayLevel = "beginners";
    let earned = false;

    if (group.counts.masters >= mastersDef.required) {
      displayLevel = "masters";
      earned = true;
    } else if (group.counts.expert >= expertDef.required) {
      displayLevel = "expert";
      earned = true;
    } else if (group.counts.beginners >= beginnerDef.required) {
      displayLevel = "beginners";
      earned = true;
    } else {
      displayLevel = "beginners";
    }

    const levelDef = SS_HUNTING_TITLE_LEVELS[displayLevel];
    const current = group.counts[displayLevel] || 0;
    const code = levelDef.prefix + familyDef.code + specDef[1];

    if (earned) suffixes.push(code);

    rows.push({
      category: familyDef.label + " | " + specDef[0],
      title: levelDef.label + " " + familyDef.label + " | " + specDef[0],
      code,
      requirement: levelDef.required + " qualifying tests",
      current: current + "/" + levelDef.required + " qualifications",
      earned,
      sort: 770
    });
  });

  return {
    suffixes: uniqueTitleList(suffixes),
    rows
  };
}

function isEnduranceClubRecord(record) {
  return normalizeKey(record?.association_key) === "endurance club";
}


function enduranceGradeKey(record) {
  const raw = normalizeKey(record?.endurance_grade);

  if (["iii","grade iii","3","grade 3"].includes(raw)) return "III";
  if (["ii","grade ii","2","grade 2"].includes(raw)) return "II";
  if (["i","grade i","1","grade 1"].includes(raw)) return "I";
  if (raw === "inv" || raw === "invitational" || raw.includes("invitational")) return "INV";

  return String(record?.endurance_grade || "").trim().toUpperCase();
}

function getEnduranceTitleProgressData(records, animal) {
  if (normalizeKey(animal?.species) !== "horse") {
    return { rows: [], prefixes: [], suffixes: [] };
  }

  const club = (records || []).filter(isEnduranceClubRecord);
  if (!club.length) return { rows: [], prefixes: [], suffixes: [] };

  const rows = [];
  const prefixes = [];
  const suffixes = [];

  const add = ({category,title,code,requirement,current,earned,position="suffix",sort=0}) => {
    rows.push({category,title,code,requirement,current,earned,position,sort});
    if (earned && code) {
      if (position === "prefix") prefixes.push(code);
      else suffixes.push(code);
    }
  };

  const completed = club.filter(record =>
    record?.endurance_completed !== false &&
    normalizeKey(record?.association_event_type) !== "prospect" &&
    normalizeKey(record?.association_event_type) !== "circuit champion"
  );

  const totalDistance = completed.reduce(
    (sum, record) => sum + Number(record?.endurance_distance_km || 0), 0
  );
  const totalWinnings = club.reduce(
    (sum, record) => sum + Number(record?.endurance_winnings || 0), 0
  );

  const winsByGrade = { I:0, II:0, III:0, INV:0 };
  club.forEach(record => {
    if (enduranceNumericPlacement(record) !== 1) return;
    const grade = enduranceGradeKey(record);
    if (winsByGrade[grade] !== undefined) winsByGrade[grade]++;
  });

  [
    ["III","EdSIII","Endurance Club Stakes III Winner",1,"suffix"],
    ["III","MEdSIII","Multi Endurance Club Stakes III Winner",2,"suffix"],
    ["III","GChEdSIII","Grand Champion Endurance Stakes III Winner",5,"prefix"],
    ["II","EdSII","Endurance Club Stakes II Winner",1,"suffix"],
    ["II","MEdSII","Multi Endurance Club Stakes II Winner",2,"suffix"],
    ["II","GChEdSII","Grand Champion Endurance Stakes II Winner",5,"prefix"],
    ["I","EdSI","Endurance Club Stakes I Winner",1,"suffix"],
    ["I","MEdSI","Multi Endurance Club Stakes I Winner",2,"suffix"]
  ].forEach(([grade,code,title,need,position], index) => {
    const current = winsByGrade[grade] || 0;
    add({category:`Grade ${grade} Stakes`,title,code,requirement:`${need} win${need===1?'':'s'}`,current:`${current} win${current===1?'':'s'}`,earned:current>=need,position,sort:100+index});
  });

  const gradeIGrandCurrent = (winsByGrade.I || 0) + (winsByGrade.INV || 0);
  add({
    category:"Grade I Stakes", title:"Grand Champion Endurance Stakes I Winner", code:"GChEdSI",
    requirement:"5 Grade I / Invitational wins", current:`${gradeIGrandCurrent} qualifying wins`,
    earned:gradeIGrandCurrent>=5, position:"prefix", sort:109
  });

  [
    [20000,"EdDCh","Endurance Club Distance Champion","suffix"],
    [30000,"EdDGCh","Endurance Club Distance Grand Champion","suffix"],
    [50000,"EdDHoF","Endurance Club Distance Hall of Fame","prefix"],
    [100000,"EdDL","Endurance Club Distance Legend","prefix"]
  ].forEach(([need,code,title,position], index) => add({
    category:"Distance",title,code,requirement:`${Number(need).toLocaleString()} km`,
    current:`${Math.round(totalDistance).toLocaleString()} km`,earned:totalDistance>=need,position,sort:200+index
  }));

  [
    [50000,"EdHE","Endurance Club High Earner","suffix"],
    [100000,"EdSpH","Endurance Club Superior High Earner","suffix"],
    [150000,"EdHOFE","Endurance Club Hall of Fame Earner","prefix"]
  ].forEach(([need,code,title,position], index) => add({
    category:"Earnings",title,code,requirement:`$${Number(need).toLocaleString()}`,
    current:`$${Math.round(totalWinnings).toLocaleString()}`,earned:totalWinnings>=need,position,sort:300+index
  }));

  const circuitCodes = {
    "Northern Circuit": {completion:"NCCC",excellence:"NCCE",champion:"NCCCh",sweep:"NCCS"},
    "Desert Circuit": {completion:"DCCC",excellence:"DCCE",champion:"DCCh",sweep:"DCS"},
    "Steppe Circuit": {completion:"SCCC",excellence:"SCCE",champion:"SCCh",sweep:"SCS"},
    "North American Frontier Circuit": {completion:"NaCC",excellence:"NaCE",champion:"NaCh",sweep:"NaCS"},
    "South American Circuit": {completion:"SaCC",excellence:"SaCE",champion:"SaCh",sweep:"SaCS"},
    "Oceania Circuit": {completion:"OCCC",excellence:"OCCE",champion:"OCCh",sweep:"OCS"},
    "African Circuit": {completion:"ACCC",excellence:"ACCE",champion:"ACCh",sweep:"ACCS"},
    "Mediterranean Circuit": {completion:"MdCC",excellence:"MdCE",champion:"MdCCh",sweep:"MdCS"},
    "Southeast Asia Circuit": {completion:"SeaCC",excellence:"SeaCE",champion:"SeaCCh",sweep:"SeaCS"},
    "World Tour": {completion:"WTCC",excellence:"WTCE",champion:"WTCCh",sweep:"WTCS"}
  };

  const seasons = [...new Set(club.map(enduranceSeason).filter(Boolean))].sort((a,b)=>Number(b)-Number(a));
  const touchedCircuits = [...new Set(club.map(r=>String(r?.endurance_circuit||"").trim()).filter(Boolean))];

  touchedCircuits.filter(circuit => circuitCodes[circuit] && circuit !== "World Tour").forEach((circuit, ci) => {
    const required = SS_ENDURANCE_TITLE_RACES.filter(r=>r.circuit===circuit).map(r=>r.key);
    if (!required.length) return;
    const codes = circuitCodes[circuit];

    let bestCompleted=0,bestPlaced=0,bestWon=0,bestSeason="";
    seasons.forEach(season => {
      const recs=club.filter(r=>String(enduranceSeason(r))===String(season) && normalizeKey(r?.endurance_circuit)===normalizeKey(circuit));
      const competed=new Set(recs.filter(r=>r?.endurance_completed!==false).map(r=>r.endurance_race_key));
      const placed=new Set(recs.filter(r=>{const p=enduranceNumericPlacement(r); return p!==null&&p>=1&&p<=5;}).map(r=>r.endurance_race_key));
      const won=new Set(recs.filter(r=>enduranceNumericPlacement(r)===1).map(r=>r.endurance_race_key));
      if (competed.size>bestCompleted){bestCompleted=competed.size;bestSeason=season;}
      bestPlaced=Math.max(bestPlaced,placed.size); bestWon=Math.max(bestWon,won.size);
    });

    const championRecord=club.find(r=>normalizeKey(r?.association_event_type)==="circuit champion" && normalizeKey(r?.endurance_circuit)===normalizeKey(circuit));

    add({category:circuit,title:`${circuit} Completion`,code:codes.completion,requirement:`Complete all ${required.length} circuit races in one season`,current:`${Math.min(bestCompleted,required.length)}/${required.length} completed`,earned:seasons.some(season=>{
      const recs=club.filter(r=>String(enduranceSeason(r))===String(season)&&normalizeKey(r?.endurance_circuit)===normalizeKey(circuit));
      const set=new Set(recs.filter(r=>r?.endurance_completed!==false).map(r=>r.endurance_race_key)); return required.every(k=>set.has(k));}),sort:400+ci*10});
    add({category:circuit,title:`${circuit} Excellence`,code:codes.excellence,requirement:`Place Top 5 in all ${required.length} circuit races in one season`,current:`${Math.min(bestPlaced,required.length)}/${required.length} Top 5`,earned:seasons.some(season=>{
      const recs=club.filter(r=>String(enduranceSeason(r))===String(season)&&normalizeKey(r?.endurance_circuit)===normalizeKey(circuit));
      const set=new Set(recs.filter(r=>{const p=enduranceNumericPlacement(r); return p!==null&&p>=1&&p<=5;}).map(r=>r.endurance_race_key)); return required.every(k=>set.has(k));}),sort:401+ci*10});
    add({category:circuit,title:`${circuit} Sweep`,code:codes.sweep,requirement:`Win all ${required.length} circuit races in one season`,current:`${Math.min(bestWon,required.length)}/${required.length} wins`,earned:seasons.some(season=>{
      const recs=club.filter(r=>String(enduranceSeason(r))===String(season)&&normalizeKey(r?.endurance_circuit)===normalizeKey(circuit));
      const set=new Set(recs.filter(r=>enduranceNumericPlacement(r)===1).map(r=>r.endurance_race_key)); return required.every(k=>set.has(k));}),sort:402+ci*10});
    add({category:circuit,title:`${circuit} Champion`,code:codes.champion,requirement:"Finish season as Circuit Champion",current:championRecord?`${championRecord.endurance_season} Champion`:"Not yet earned",earned:Boolean(championRecord),position:"prefix",sort:403+ci*10});
  });

  // World Tour paths are tracked independently.
  if (touchedCircuits.includes("World Tour")) {
    ["gemstone","crystal"].forEach((series, si) => {
      const required=SS_ENDURANCE_TITLE_RACES.filter(r=>r.circuit==="World Tour"&&r.series===series).map(r=>r.key);
      if (!required.length) return;
      const label=series==="gemstone"?"GemStone":"Crystal";
      const recs=club.filter(r=>normalizeKey(r?.endurance_series)===series);
      const competed=new Set(recs.map(r=>r.endurance_race_key));
      const placed=new Set(recs.filter(r=>{const p=enduranceNumericPlacement(r);return p!==null&&p>=1&&p<=5;}).map(r=>r.endurance_race_key));
      const won=new Set(recs.filter(r=>enduranceNumericPlacement(r)===1).map(r=>r.endurance_race_key));
      add({category:`World Tour - ${label}`,title:"World Tour Circuit Completion",code:"WTCC",requirement:`Complete all ${required.length} ${label} races in one season`,current:`${Math.min(competed.size,required.length)}/${required.length} completed`,earned:required.every(k=>competed.has(k)),sort:600+si*10});
      add({category:`World Tour - ${label}`,title:"World Tour Circuit Excellence",code:"WTCE",requirement:`Top 5 in all ${required.length} ${label} races`,current:`${Math.min(placed.size,required.length)}/${required.length} Top 5`,earned:required.every(k=>placed.has(k)),sort:601+si*10});
      add({category:`World Tour - ${label}`,title:"World Tour Circuit Sweep",code:"WTCS",requirement:`Win all ${required.length} ${label} races`,current:`${Math.min(won.size,required.length)}/${required.length} wins`,earned:required.every(k=>won.has(k)),sort:602+si*10});
      add({category:`World Tour - ${label}`,title:series==="gemstone"?"Gem Stone Series Winner":"Crystal Tour Winner",code:series==="gemstone"?"EdGS":"EdCS",requirement:`Sweep the ${label} path`,current:`${Math.min(won.size,required.length)}/${required.length} wins`,earned:required.every(k=>won.has(k)),sort:603+si*10});
    });
  }

  const firstPlaceRaceNames=new Set(club.filter(r=>enduranceNumericPlacement(r)===1).map(r=>normalizeKey(r?.endurance_race_name)));
  const firstPlaceRaceKeys=new Set(club.filter(r=>enduranceNumericPlacement(r)===1).map(r=>String(r?.endurance_race_key||"").trim()));
  const dcpecEarned=firstPlaceRaceKeys.has("desert_circuit_dubai_crown_prince_conference")||firstPlaceRaceNames.has("dubai crown prince conference")||firstPlaceRaceNames.has("dubai crown prince endurance cup");
  if (club.some(r=>String(r?.endurance_race_key||"").includes("dubai_crown_prince")) || dcpecEarned) {
    add({category:"Named Titles",title:"Dubai Crown Prince Endurance Cup",code:"DCPEC",requirement:"Win the Dubai Crown Prince Conference",current:dcpecEarned?"Winner":"Not yet earned",earned:dcpecEarned,sort:700});
  }

  return {rows:rows.sort((a,b)=>a.sort-b.sort),prefixes:uniqueTitleList(prefixes),suffixes:uniqueTitleList(suffixes)};
}

function highestEnduranceProgressRows(rows) {
  const grouped = {};

  (rows || []).forEach(row => {
    const key = String(row?.category || "Other");
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(row);
  });

  const result = [];

  Object.values(grouped).forEach(group => {
    const ordered = group.slice().sort((a,b) => Number(a.sort || 0) - Number(b.sort || 0));
    const earnedRows = ordered.filter(row => row.earned);

    // Only show the highest title currently earned within this progression.
    // If none are earned yet, show the first target in that progression.
    const chosen = earnedRows.length
      ? earnedRows[earnedRows.length - 1]
      : ordered[0];

    if (chosen) result.push(chosen);
  });

  return result.sort((a,b) => Number(a.sort || 0) - Number(b.sort || 0));
}

function renderEnduranceTitleProgress(records, animal) {
  const data=getEnduranceTitleProgressData(records, animal);
  const progressRows = highestEnduranceProgressRows(data.rows);
  if (!progressRows.length) return `<div class="empty">No Endurance Club title progress yet.</div>`;
  return `
    <div class="table-wrap">
      <table class="titles-table endurance-progress-table">
        <thead><tr>
          <th>Category</th><th>Title</th><th>Code</th><th>Requirement</th><th>Current</th><th>Status</th>
        </tr></thead>
        <tbody>
          ${progressRows.map(row=>`
            <tr>
              <td>${escapeHtml(row.category)}</td>
              <td>${escapeHtml(row.title)}</td>
              <td>${escapeHtml(row.code)}</td>
              <td>${escapeHtml(row.requirement)}</td>
              <td>${escapeHtml(row.current)}</td>
              <td><span class="status-pill ${row.earned?'earned':'progress'}">${row.earned?'Earned':'In Progress'}</span></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>`;
}

function calculateEnduranceClubTitles(records, animal) {
  if (normalizeKey(animal?.species) !== "horse") {
    return { prefixes: [], suffixes: [], rows: [] };
  }

  const club = (records || []).filter(isEnduranceClubRecord);

  if (!club.length) {
    return { prefixes: [], suffixes: [], rows: [] };
  }

  const prefixes = [];
  const suffixes = [];
  const rows = [];

  const completed = club.filter(record =>
    record?.endurance_completed !== false &&
    normalizeKey(record?.association_event_type) !== "prospect"
  );

  const totalDistance = completed.reduce(
    (sum, record) => sum + Number(record?.endurance_distance_km || 0),
    0
  );

  const totalWinnings = club.reduce(
    (sum, record) => sum + Number(record?.endurance_winnings || 0),
    0
  );

  /*
    RACE-WINNING TITLES
    Higher titles replace lower titles within each grade.
  */
  const winsByGrade = { I: 0, II: 0, III: 0, INV: 0 };

  club.forEach(record => {
    if (enduranceNumericPlacement(record) !== 1) return;
    const grade = enduranceGradeKey(record);
    if (winsByGrade[grade] !== undefined) winsByGrade[grade]++;
  });

  const gradeTitle = (grade, single, multi, grand, grandThreshold=5) => {
    const wins = winsByGrade[grade] || 0;

    if (wins >= grandThreshold) {
      prefixes.push(grand);
      rows.push({
        titleName: grand,
        titleCode: grand,
        count: `${wins} Grade ${grade} wins`,
        sort: 810
      });
    } else if (wins >= 2) {
      suffixes.push(multi);
      rows.push({
        titleName: multi,
        titleCode: multi,
        count: `${wins} Grade ${grade} wins`,
        sort: 810
      });
    } else if (wins >= 1) {
      suffixes.push(single);
      rows.push({
        titleName: single,
        titleCode: single,
        count: `${wins} Grade ${grade} win`,
        sort: 810
      });
    }
  };

  gradeTitle("III","EdSIII","MEdSIII","GChEdSIII");
  gradeTitle("II","EdSII","MEdSII","GChEdSII");

  /*
    Grade I:
      EdSI / MEdSI count actual Grade I wins.
      GChEdSI may use Grade I OR Invitational wins.
  */
  const gradeIWins = winsByGrade.I || 0;
  const gradeIOrInvitational = gradeIWins + (winsByGrade.INV || 0);

  if (gradeIOrInvitational >= 5) {
    prefixes.push("GChEdSI");
    rows.push({
      titleName: "Grand Champion Endurance Stakes I Winner",
      titleCode: "GChEdSI",
      count: `${gradeIOrInvitational} Grade I / Invitational wins`,
      sort: 811
    });
  } else if (gradeIWins >= 2) {
    suffixes.push("MEdSI");
    rows.push({
      titleName: "Multi Endurance Club Stakes I Winner",
      titleCode: "MEdSI",
      count: `${gradeIWins} Grade I wins`,
      sort: 811
    });
  } else if (gradeIWins >= 1) {
    suffixes.push("EdSI");
    rows.push({
      titleName: "Endurance Club Stakes I",
      titleCode: "EdSI",
      count: `${gradeIWins} Grade I win`,
      sort: 811
    });
  }

  /*
    DISTANCE TITLES | Endurance Club kilometres only.
  */
  if (totalDistance >= 100000) {
    prefixes.push("EdDL");
    rows.push({titleName:"Endurance Club Distance Legend",titleCode:"EdDL",count:`${Math.round(totalDistance).toLocaleString()} km`,sort:820});
  } else if (totalDistance >= 50000) {
    prefixes.push("EdDHoF");
    rows.push({titleName:"Endurance Club Distance Hall of Fame",titleCode:"EdDHoF",count:`${Math.round(totalDistance).toLocaleString()} km`,sort:820});
  } else if (totalDistance >= 30000) {
    suffixes.push("EdDGCh");
    rows.push({titleName:"Endurance Club Distance Grand Champion",titleCode:"EdDGCh",count:`${Math.round(totalDistance).toLocaleString()} km`,sort:820});
  } else if (totalDistance >= 20000) {
    suffixes.push("EdDCh");
    rows.push({titleName:"Endurance Club Distance Champion",titleCode:"EdDCh",count:`${Math.round(totalDistance).toLocaleString()} km`,sort:820});
  }

  /*
    EARNINGS TITLES | actual money stored on Endurance Club records only.
  */
  const moneyLabel = "$" + Math.round(totalWinnings).toLocaleString();

  if (totalWinnings >= 150000) {
    prefixes.push("EdHOFE");
    rows.push({titleName:"Endurance Club Hall of Fame Earner",titleCode:"EdHOFE",count:moneyLabel,sort:821});
  } else if (totalWinnings >= 100000) {
    suffixes.push("EdSpH");
    rows.push({titleName:"Endurance Club Superior High Earner",titleCode:"EdSpH",count:moneyLabel,sort:821});
  } else if (totalWinnings >= 50000) {
    suffixes.push("EdHE");
    rows.push({titleName:"Endurance Club High Earner",titleCode:"EdHE",count:moneyLabel,sort:821});
  }

  /*
    SAME-SEASON SERIES + CIRCUIT TITLES
  */
  const bySeason = {};

  club.forEach(record => {
    const season = enduranceSeason(record);
    if (!season) return;

    if (!bySeason[season]) bySeason[season] = [];
    bySeason[season].push(record);
  });

  const circuitCodes = {
    "Northern Circuit": {completion:"NCCC",excellence:"NCCE",champion:"NCCCh",sweep:"NCCS"},
    "Desert Circuit": {completion:"DCCC",excellence:"DCCE",champion:"DCCh",sweep:"DCS"},
    "Steppe Circuit": {completion:"SCCC",excellence:"SCCE",champion:"SCCh",sweep:"SCS"},
    "North American Frontier Circuit": {completion:"NaCC",excellence:"NaCE",champion:"NaCh",sweep:"NaCS"},
    "South American Circuit": {completion:"SaCC",excellence:"SaCE",champion:"SaCh",sweep:"SaCS"},
    "Oceania Circuit": {completion:"OCCC",excellence:"OCCE",champion:"OCCh",sweep:"OCS"},
    "African Circuit": {completion:"ACCC",excellence:"ACCE",champion:"ACCh",sweep:"ACCS"},
    "Mediterranean Circuit": {completion:"MdCC",excellence:"MdCE",champion:"MdCCh",sweep:"MdCS"},
    "Southeast Asia Circuit": {completion:"SeaCC",excellence:"SeaCE",champion:"SeaCCh",sweep:"SeaCS"},
    "World Tour": {completion:"WTCC",excellence:"WTCE",champion:"WTCCh",sweep:"WTCS"}
  };

  Object.entries(bySeason).forEach(([season, seasonRecords]) => {
    const seasonNumber = Number(season);

    /*
      Regional circuits: exactly the seven catalog races in that circuit.
    */
    Object.keys(circuitCodes)
      .filter(circuit => circuit !== "World Tour")
      .forEach(circuit => {
        const required = SS_ENDURANCE_TITLE_RACES
          .filter(race => race.circuit === circuit)
          .map(race => race.key);

        if (!required.length) return;

        const circuitRecords = seasonRecords.filter(record =>
          normalizeKey(record?.endurance_circuit) === normalizeKey(circuit)
        );

        const competed = new Set(
          circuitRecords
            .filter(record => record?.endurance_completed !== false)
            .map(record => record.endurance_race_key)
        );

        const placed = new Set(
          circuitRecords
            .filter(record => {
              const place = enduranceNumericPlacement(record);
              return place !== null && place >= 1 && place <= 5;
            })
            .map(record => record.endurance_race_key)
        );

        const won = new Set(
          circuitRecords
            .filter(record => enduranceNumericPlacement(record) === 1)
            .map(record => record.endurance_race_key)
        );

        const codes = circuitCodes[circuit];

        if (required.every(key => competed.has(key))) {
          suffixes.push(codes.completion);
          rows.push({titleName:`${circuit} Completion`,titleCode:codes.completion,count:String(seasonNumber),sort:830});
        }

        if (required.every(key => placed.has(key))) {
          suffixes.push(codes.excellence);
          rows.push({titleName:`${circuit} Excellence`,titleCode:codes.excellence,count:String(seasonNumber),sort:831});
        }

        if (required.every(key => won.has(key))) {
          suffixes.push(codes.sweep);
          rows.push({titleName:`${circuit} Sweep`,titleCode:codes.sweep,count:String(seasonNumber),sort:832});
        }
      });

    /*
      WORLD TOUR:
      GemStone OR Crystal may independently satisfy Completion / Excellence / Sweep.
    */
    const worldCodes = circuitCodes["World Tour"];

    ["gemstone","crystal"].forEach(series => {
      const required = SS_ENDURANCE_TITLE_RACES
        .filter(race => race.circuit === "World Tour" && race.series === series)
        .map(race => race.key);

      if (!required.length) return;

      const seriesRecords = seasonRecords.filter(record =>
        normalizeKey(record?.endurance_series) === series
      );

      const competed = new Set(seriesRecords.map(record => record.endurance_race_key));
      const placed = new Set(
        seriesRecords
          .filter(record => {
            const place = enduranceNumericPlacement(record);
            return place !== null && place >= 1 && place <= 5;
          })
          .map(record => record.endurance_race_key)
      );
      const won = new Set(
        seriesRecords
          .filter(record => enduranceNumericPlacement(record) === 1)
          .map(record => record.endurance_race_key)
      );

      if (required.every(key => competed.has(key))) {
        suffixes.push(worldCodes.completion);
        rows.push({
          titleName:"World Tour Circuit Completion",
          titleCode:worldCodes.completion,
          count:`${seasonNumber} | ${series === "gemstone" ? "GemStone" : "Crystal"} path`,
          sort:834
        });
      }

      if (required.every(key => placed.has(key))) {
        suffixes.push(worldCodes.excellence);
        rows.push({
          titleName:"World Tour Circuit Excellence",
          titleCode:worldCodes.excellence,
          count:`${seasonNumber} | ${series === "gemstone" ? "GemStone" : "Crystal"} path`,
          sort:835
        });
      }

      if (required.every(key => won.has(key))) {
        suffixes.push(worldCodes.sweep);
        rows.push({
          titleName:"World Tour Circuit Sweep",
          titleCode:worldCodes.sweep,
          count:`${seasonNumber} | ${series === "gemstone" ? "GemStone" : "Crystal"} path`,
          sort:836
        });

        if (series === "gemstone") {
          suffixes.push("EdGS");
          rows.push({titleName:"Gem Stone Series Winner",titleCode:"EdGS",count:String(seasonNumber),sort:837});
        }

        if (series === "crystal") {
          suffixes.push("EdCS");
          rows.push({titleName:"Crystal Tour Winner",titleCode:"EdCS",count:String(seasonNumber),sort:837});
        }
      }
    });
  });

  /*
    Circuit Champion synthetic rows are appended by loadRecords() from
    the endurance_circuit_champions view.
  */
  club
    .filter(record => normalizeKey(record?.association_event_type) === "circuit champion")
    .forEach(record => {
      const circuit = record.endurance_circuit;
      const codeMap = circuitCodes[circuit];
      if (!codeMap) return;

      prefixes.push(codeMap.champion);
      rows.push({
        titleName: `${circuit} Champion`,
        titleCode: codeMap.champion,
        count: `${record.endurance_season} | ${Number(record.endurance_circuit_points ?? record.points ?? 0).toLocaleString()} circuit points`,
        sort: 833
      });
    });

  /*
    Explicit named-series titles supported now/future.
  */
  const firstPlaceRaceNames = new Set(
    club
      .filter(record => enduranceNumericPlacement(record) === 1)
      .map(record => normalizeKey(record?.endurance_race_name))
  );

  const firstPlaceRaceKeys = new Set(
    club
      .filter(record => enduranceNumericPlacement(record) === 1)
      .map(record => String(record?.endurance_race_key || "").trim())
  );

  if (
    firstPlaceRaceKeys.has("desert_circuit_dubai_crown_prince_conference") ||
    firstPlaceRaceNames.has("dubai crown prince conference") ||
    firstPlaceRaceNames.has("dubai crown prince endurance cup")
  ) {
    suffixes.push("DCPEC");
    rows.push({titleName:"Dubai Crown Prince Endurance Cup",titleCode:"DCPEC",count:"Winner",sort:840});
  }

  const seriesSweepRules = [
    {series:"world_holiday_challenge",required:4,code:"EdWHC",name:"Endurance Club World Holiday Challenge Winner"},
    {series:"winter_constellation_challenge",required:4,code:"EdWCC",name:"Endurance Club Winter Constellation Challenge"},
    {series:"solar_challenge",required:4,code:"EdSCC",name:"Endurance Club Solar Challenge"}
  ];

  seriesSweepRules.forEach(rule => {
    const winsBySeason = {};

    club.forEach(record => {
      if (
        normalizeKey(record?.endurance_series) !== rule.series ||
        enduranceNumericPlacement(record) !== 1
      ) return;

      const season = enduranceSeason(record);
      if (!season) return;

      if (!winsBySeason[season]) winsBySeason[season] = new Set();
      winsBySeason[season].add(record.endurance_race_key);
    });

    if (Object.values(winsBySeason).some(set => set.size >= rule.required)) {
      suffixes.push(rule.code);
      rows.push({titleName:rule.name,titleCode:rule.code,count:"Same-season series winner",sort:841});
    }
  });

  /*
    Always expose cumulative Endurance Club totals in the title/progress list,
    even before a threshold is reached.
  */
  rows.push({
    titleName:"Endurance Club Distance",
    titleCode:"",
    count:`${Math.round(totalDistance).toLocaleString()} km completed`,
    sort:899
  });

  rows.push({
    titleName:"Endurance Club Winnings",
    titleCode:"",
    count:"$" + Math.round(totalWinnings).toLocaleString(),
    sort:900
  });

  const auditedProgress = getEnduranceTitleProgressData(records, animal);
  prefixes.push(...auditedProgress.prefixes);
  suffixes.push(...auditedProgress.suffixes);

  return {
    prefixes: uniqueTitleList(prefixes),
    suffixes: uniqueTitleList(suffixes),
    rows
  };
}

function calculateTitleData(records, animal, titleRules, activityRules, activityTypes, totalRules, herdingRules) {
  const prefixBestInShowTitles = [];
  const prefixSpecialtyBestInShowTitles = [];
  const prefixBestInFieldTitles = [];
  const prefixConformationTitles = [];
  const prefixActivityChampionshipTitles = [];
  const prefixManualTitles = [];

  const suffixActivityTitles = [];
  const suffixManualTitles = [];
  const suffixVersatilityTitles = [];
  const suffixTotalAwardTitles = [];
  const suffixBreedingAwardTitles = [];
  const suffixCgcTitles = [];
  const suffixTherapyTemperamentTitles = [];
  const suffixHerdingTitles = [];

  const awardTitleRows = [];

  const conformationRecords = records.filter(r => canonicalShowType(r.show_type) === "conformation");
  const activityRecords = records.filter(r => canonicalShowType(r.show_type) === "activity" && !isManualScoreRecord(r) && !isBestInFieldActivityRecord(r));

  const conformationPoints = conformationRecords.reduce((sum, r) => sum + pointsValue(r), 0);
  const confRules = titleRules.filter(r => normalizeKey(r.applies_to) === "conformation");
  const confTitle = highestTitle(conformationPoints, confRules);

  const earnedTitleCodes = [];

  if (confTitle) {
    prefixConformationTitles.push(confTitle.title_code);
    earnedTitleCodes.push(confTitle.title_code);
  }

  const allBreedBIS = countUniqueAwardWins(
    conformationRecords,
    isAllBreedBestInShow,
    "bis"
  );

  const specialtyBIS = countUniqueAwardWins(
    conformationRecords,
    isSpecialtyBestInShow,
    "biss"
  );

  /*
    Unlike BIS/BISS, a single show can legitimately run multiple Best in Field
    classes and the same animal can win more than one of them. Count each
    qualifying BIF result row rather than de-duplicating at show/upload level.
  */
  const bestInFieldCount = records.filter(isBestInFieldWin).length;

  /*
    BIS / BISS / BIF are earned from the actual recorded win.
    They do NOT require the animal to have reached CH. first.
  */
  if (allBreedBIS >= 2) {
    prefixBestInShowTitles.push("MBIS");
    awardTitleRows.push({
      titleName: "Multiple Best in Show Winner",
      titleCode: "MBIS",
      count: allBreedBIS,
      sort: 10
    });
  } else if (allBreedBIS >= 1) {
    prefixBestInShowTitles.push("BIS");
    awardTitleRows.push({
      titleName: "Best in Show Winner",
      titleCode: "BIS",
      count: allBreedBIS,
      sort: 11
    });
  }

  if (specialtyBIS >= 2) {
    prefixSpecialtyBestInShowTitles.push("MBISS");
    awardTitleRows.push({
      titleName: "Multiple Best in Specialty Show Winner",
      titleCode: "MBISS",
      count: specialtyBIS,
      sort: 20
    });
  } else if (specialtyBIS >= 1) {
    prefixSpecialtyBestInShowTitles.push("BISS");
    awardTitleRows.push({
      titleName: "Best in Specialty Show Winner",
      titleCode: "BISS",
      count: specialtyBIS,
      sort: 21
    });
  }

  /* Kept after BIS/BISS and before regular conformation titles so Field awards still display cleanly. */
  if (bestInFieldCount >= 2) {
    prefixBestInFieldTitles.push("MBIF");
    awardTitleRows.push({
      titleName: "Multiple Best in Field Winner",
      titleCode: "MBIF",
      count: bestInFieldCount,
      sort: 30
    });
  } else if (bestInFieldCount >= 1) {
    prefixBestInFieldTitles.push("BIF");
    awardTitleRows.push({
      titleName: "Best in Field Winner",
      titleCode: "BIF",
      count: bestInFieldCount,
      sort: 31
    });
  }

  const activityTotals = calculateActivityTotals(activityRecords, activityTypes);

  Object.keys(activityTotals).forEach(key => {
    const total = activityTotals[key];
    const rules = getActivityRulesForTotal(total, activityRules);
    const title = highestTitle(total.points, rules);
    const displayedTitle = title ? displayActivityTitle(title, total.points) : null;

    if (title) {
      earnedTitleCodes.push(title.title_code);
      earnedTitleCodes.push(displayedTitle);

      /*
        TDCh. (Trick Dog Champion) is always a PREFIX on Show Standard.
        Keep the database title_position for every other activity title, but
        explicitly protect TDCh here so an old/mistyped rule cannot render it
        after the registered name.
      */
      const activityTitleCode = titleCodeKey(title.title_code);
      const activityTitlePosition =
        activityTitleCode === "tdch"
          ? "prefix"
          : normalizeKey(title.title_position || "suffix");

      if (activityTitlePosition === "prefix") {
        prefixActivityChampionshipTitles.push({
          code: displayedTitle,
          earnedDate: activityTitleEarnedDate(total.activity_key || total.display_name, activityRecords, activityTypes),
          activity: total.display_name || total.activity_key || ""
        });
      } else {
        suffixActivityTitles.push({
          code: displayedTitle,
          earnedDate: activityTitleEarnedDate(total.activity_key || total.display_name, activityRecords, activityTypes),
          activity: total.display_name || total.activity_key || ""
        });
      }
    }
  });

  splitTitleCodes(animal?.manual_prefix_titles).forEach(code => {
    prefixManualTitles.push(code);
    earnedTitleCodes.push(code);
  });

  splitTitleCodes(animal?.manual_suffix_titles).forEach(code => {
    const group = manualSuffixDisplayGroup(code);

    if (group === "cgc") {
      suffixCgcTitles.push(code);
    } else if (group === "therapyTemperament") {
      suffixTherapyTemperamentTitles.push(code);
    } else {
      suffixManualTitles.push(code);
    }

    earnedTitleCodes.push(code);
  });

  const herdingTitles = calculateHerdingTitles(records, animal, herdingRules);
  prefixManualTitles.push(...herdingTitles.prefixes);
  suffixHerdingTitles.push(...herdingTitles.suffixes);
  awardTitleRows.push(...herdingTitles.rows);
  herdingTitles.suffixes.forEach(code => earnedTitleCodes.push(code));

  const icelandicTitles = calculateIcelandicAssociationTitles(records, animal);
  prefixManualTitles.push(...icelandicTitles.prefixes);
  awardTitleRows.push(...icelandicTitles.rows);
  icelandicTitles.prefixes.forEach(code => earnedTitleCodes.push(code));

  const enduranceTitles = calculateEnduranceClubTitles(records, animal);
  prefixManualTitles.push(...enduranceTitles.prefixes);
  suffixManualTitles.push(...enduranceTitles.suffixes);
  awardTitleRows.push(...enduranceTitles.rows);
  enduranceTitles.prefixes.forEach(code => earnedTitleCodes.push(code));
  enduranceTitles.suffixes.forEach(code => earnedTitleCodes.push(code));

  const huntingTitles = calculateHuntingClubTitles(records, animal);
  suffixManualTitles.push(...huntingTitles.suffixes);
  awardTitleRows.push(...huntingTitles.rows);
  huntingTitles.suffixes.forEach(code => earnedTitleCodes.push(code));

  const testingTitles = calculateTestingTitles(records, animal);
  testingTitles.suffixes.forEach(code => {
    if (/^CGC/.test(code)) suffixCgcTitles.push(code);
    else suffixTherapyTemperamentTitles.push(code);
    earnedTitleCodes.push(code);
  });
  awardTitleRows.push(...testingTitles.rows);

  const breedingAwardTitles = calculateBreedingAwardTitles(animal);
  suffixBreedingAwardTitles.push(...breedingAwardTitles.suffixes);
  awardTitleRows.push(...breedingAwardTitles.rows);
  breedingAwardTitles.suffixes.forEach(code => earnedTitleCodes.push(code));

  const versatilityTitle = calculateVersatilityTitle(animal, earnedTitleCodes);

  if (versatilityTitle) {
    suffixVersatilityTitles.push(versatilityTitle.code);

    awardTitleRows.push({
      titleName: versatilityTitle.name,
      titleCode: versatilityTitle.code,
      count: "Earned",
      sort: 300
    });
  }

  const eligibleTotalActivities = getTotalAwardEligibleKeys(animal, totalRules);

  const totalAwardShows = {};

  records.forEach(r => {
    const showKey = getTotalAwardShowKey(r.show_name);

    if (!totalAwardShows[showKey]) {
      totalAwardShows[showKey] = { hasConformation: false, hasActivity: false };
    }

    if (canonicalShowType(r.show_type) === "conformation" && isBOBOrAbove(r.placement)) {
      totalAwardShows[showKey].hasConformation = true;
    }

    if (canonicalShowType(r.show_type) === "activity" && isActivityPlacing(r.placement)) {
      const activity = resolveActivityForRecord(r, activityTypes);

      if (isTotalAwardEligibleActivity(activity, eligibleTotalActivities)) {
        totalAwardShows[showKey].hasActivity = true;
      }
    }
  });

  const totalAwardCount = Object.values(totalAwardShows)
    .filter(s => s.hasConformation && s.hasActivity)
    .length;

  if (totalAwardCount > 0) {
    const base = speciesCode(animal?.species);
    const title = totalAwardCount === 1 ? base : base + totalAwardCount;

    suffixTotalAwardTitles.push(title);

    awardTitleRows.push({
      titleName: "Total Award " + (animal?.species || ""),
      titleCode: title,
      count: totalAwardCount,
      sort: 400
    });
  }

  const orderedActivityPrefixes = prefixActivityChampionshipTitles
    .slice()
    .sort((a, b) => a.earnedDate.localeCompare(b.earnedDate) || a.activity.localeCompare(b.activity))
    .map(t => t.code);

  const orderedActivitySuffixes = suffixActivityTitles
    .slice()
    .sort((a, b) => a.earnedDate.localeCompare(b.earnedDate) || a.activity.localeCompare(b.activity))
    .map(t => t.code);

  const prefixTitles = [
    ...prefixBestInShowTitles,
    ...prefixSpecialtyBestInShowTitles,
    ...prefixBestInFieldTitles,
    ...prefixConformationTitles,
    ...orderedActivityPrefixes,
    ...prefixManualTitles
  ];

  const suffixTitles = [
    ...orderedActivitySuffixes,
    ...suffixHerdingTitles,
    ...suffixManualTitles,
    ...suffixBreedingAwardTitles,
    ...suffixVersatilityTitles,
    ...suffixTotalAwardTitles,
    ...highestManualTitleBySort(suffixCgcTitles),
    ...suffixTherapyTemperamentTitles.sort((a, b) => manualTitleSort(a) - manualTitleSort(b))
  ];

  return {
    prefixTitles: uniqueTitleList(prefixTitles),
    suffixTitles: uniqueTitleList(suffixTitles),
    awardTitleRows
  };
}
 

function cleanDisplayText(value) {
  return String(value ?? "")
    // Remove broken em/en dash sequences and real long dashes from DISPLAY text.
    .replace(/â€”|â€“|â€•|â€‘|â€’|â€|—|–/g, "")
    // Remove broken bullet / non-breaking-space garbage.
    .replace(/â€¢|Â/g, " ")
    // Repair a few common UTF-8 mojibake characters that may exist in old records.
    .replace(/â€™|â€˜/g, "'")
    .replace(/â€œ|â€/g, '"')
    .replace(/Ã¶/g, "ö")
    .replace(/Ã¡/g, "á")
    .replace(/Ã©/g, "é")
    .replace(/Ãí/g, "í")
    .replace(/Ã³/g, "ó")
    .replace(/Ãº/g, "ú")
    .replace(/Ã±/g, "ñ")
    // Clean up spacing left behind after garbage removal.
    .replace(/\s{2,}/g, " ")
    .trim();
}

function escapeHtml(value) {
  return cleanDisplayText(value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function buildRegisteredName(animal, titleData) {
  return [
    ...(titleData?.prefixTitles || []),
    animal?.name || "Unnamed",
    ...(titleData?.suffixTitles || [])
  ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function getPointBasedTitleRows(records, titleRules, activityRules, activityTypes) {
  const rows = [];
  const conformationRecords = records.filter(r => canonicalShowType(r.show_type) === "conformation");
  const conformationPoints = conformationRecords.reduce((sum, r) => sum + pointsValue(r), 0);
  const confRules = (titleRules || [])
    .filter(r => normalizeKey(r.applies_to) === "conformation")
    .slice().sort((a,b) => Number(a.points_required || 0) - Number(b.points_required || 0));

  const confTitle = highestTitle(conformationPoints, confRules);
  const confNext = confRules.find(r => Number(r.points_required || 0) > conformationPoints);

  rows.push({
    activity: "Conformation",
    title: confTitle ? `${confTitle.title_code} ${confTitle.title_name || ""}`.trim() : "No title yet",
    required: confTitle ? Number(confTitle.points_required || 0) : Number(confNext?.points_required || 0),
    earned: conformationPoints,
    status: confTitle ? "Earned" : "In Progress",
    maxed: hasMaxedBaseTitle(conformationPoints, confRules),
    sort: 0
  });

  const activityRecords = records.filter(r =>
    canonicalShowType(r.show_type) === "activity" &&
    !isManualScoreRecord(r) &&
    !isBestInFieldActivityRecord(r)
  );
  const activityTotals = calculateActivityTotals(activityRecords, activityTypes);

  Object.values(activityTotals).forEach(total => {
    const herdingText = normalizeKey(`${total.activity_key || ""} ${total.display_name || ""}`);
    if (
      herdingText.includes("herding stakes") ||
      herdingText.includes("herding instinct") ||
      herdingText === "herding"
    ) return;

    const rules = getActivityRulesForTotal(total, activityRules)
      .slice().sort((a,b) => Number(a.points_required || 0) - Number(b.points_required || 0));
    const title = highestTitle(total.points, rules);
    const next = rules.find(r => Number(r.points_required || 0) > Number(total.points || 0));
    const displayedTitle = title ? displayActivityTitle(title, total.points) : null;

    rows.push({
      activity: cleanActivityDisplayName(total.display_name || total.activity_key),
      title: displayedTitle ? `${displayedTitle} ${title.title_name || ""}`.trim() : "No title yet",
      required: title ? Number(title.points_required || 0) : Number(next?.points_required || 0),
      earned: Number(total.points || 0),
      status: title ? "Earned" : "In Progress",
      maxed: hasMaxedBaseTitle(total.points, rules),
      sort: 1
    });
  });

  return rows.sort((a,b) => a.sort - b.sort || String(a.activity).localeCompare(String(b.activity)));
}

function isBestInGroupPlacement(record) {
  const p = normalizeKey(record?.placement);
  if (p.includes("reserve")) return false;
  return p === "big" || p === "best in group" || p.startsWith("best in group ");
}

function isBestOfBreedPlacement(record) {
  const p = normalizeKey(record?.placement);
  if (p.includes("reserve")) return false;
  return p === "bob" || p === "best of breed" || p.startsWith("best of breed ");
}

function buildHighlights(records) {
  const totalPoints = records.reduce((sum,r) => sum + pointsValue(r), 0);
  const bis = countUniqueAwardWins(records, isAllBreedBestInShow, "bis");
  const biss = countUniqueAwardWins(records, isSpecialtyBestInShow, "biss");
  const bif = countUniqueAwardWins(records, isBestInFieldWin, "bif");
  const big = countUniqueAwardWins(records, isBestInGroupPlacement, "big");
  const bob = countUniqueAwardWins(records, isBestOfBreedPlacement, "bob");

  const items = [
    ["Best in Show Wins", bis],
    ["Best in Specialty Show Wins", biss],
    ["Best in Field Wins", bif],
    ["Best in Group Wins", big],
    ["Best of Breed Wins", bob],
    ["Total Points (All Time)", totalPoints.toLocaleString()],
    ["Total Records", records.length.toLocaleString()]
  ];

  return `
    <section class="panel highlights-panel">
      <h3 class="panel-title">Highlights</h3>
      <div class="highlight-list">
        ${items.map(([label,value]) => `
          <div class="highlight-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>
        `).join("")}
      </div>
    </section>
  `;
}

function renderPointBasedTitles(rows) {
  if (!rows.length) return `<div class="empty">No point-based title data yet.</div>`;
  return `
    <section class="panel">
      <h3 class="panel-title">Point-Based Titles</h3>
      <div class="table-wrap">
        <table class="titles-table">
          <thead><tr>
            <th>Activity</th><th>Title</th><th>Required Points</th><th>Earned Points</th><th>Status</th>
          </tr></thead>
          <tbody>
            ${rows.map(row => `
              <tr>
                <td>${escapeHtml(row.activity)}</td>
                <td class="${row.maxed ? "maxed-title-cell" : ""}">${escapeHtml(row.title)}${row.maxed ? ` <span class="max-title-medal" title="Maximum base title reached" aria-label="Maximum base title reached">🏅</span>` : ""}</td>
                <td>${row.required ? Number(row.required).toLocaleString() : ""}</td>
                <td>${Number(row.earned || 0).toLocaleString()}</td>
                <td><span class="status-pill ${row.status === "Earned" ? "earned" : "progress"}">${escapeHtml(row.status)}</span></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function versatilityCategoryNames(species) {
  const s = normalizeKey(species);
  if (s === "dog") return {
    1:"Obedience & Rally", 2:"Conformation, Trick & Testing", 3:"Hunting Sports",
    4:"Protection & Work Sports", 5:"Performance Sports", 6:"Strength & Skill Sports",
    7:"Tracking & Search and Rescue"
  };
  if (s === "cat") return {
    1:"Conformation & Trick", 2:"Agility, Obedience & Rally",
    3:"Fishing, Retrieving & Scent", 4:"Stunt, Vaulting, Treibball & High Jump"
  };
  if (s === "horse") return {
    1:"Conformation, Trick & Testing", 2:"Dressage Sports", 3:"Driving Sports",
    4:"Gaited Sports", 5:"Racing & Endurance", 6:"English Sports",
    7:"Western Sports", 8:"Cow Horse Sports"
  };
  return {};
}

function renderVersatilityPanel(animal, titleData) {
  const earnedCodes = [...(titleData?.prefixTitles || []), ...(titleData?.suffixTitles || [])];
  const current = calculateVersatilityTitle(animal, earnedCodes);
  const levels = getBestVersatilityByCategory(animal, earnedCodes);
  const names = versatilityCategoryNames(animal?.species);
  const categories = Object.keys(names).map(Number).sort((a,b) => a-b);
  const levelLetter = n => ["","A","B","C","D","E"][Number(n) || 0] || "";

  return `
    <section class="panel">
      <div class="versatility-heading">
        <div>
          <h3 class="panel-title">Versatility</h3>
          <p class="panel-subtitle">Highest qualifying title in each category is used. Higher levels substitute downward.</p>
        </div>
        <div class="versatility-current">
          <span>Current Versatility Title</span>
          <strong>${current ? `${escapeHtml(current.code)} | ${escapeHtml(current.name)}` : "Not yet earned"}</strong>
        </div>
      </div>

      <div class="versatility-counts">
        ${[1,2,3,4,5].map(level => `
          <div class="mini-stat">
            <span>Level ${["","A","B","C","D","E"][level]}+</span>
            <strong>${countVersatilityCategoriesAtLeast(levels, level)}</strong>
          </div>
        `).join("")}
      </div>

      <div class="table-wrap">
        <table class="titles-table">
          <thead><tr><th>Category</th><th>Area</th><th>Highest Level</th></tr></thead>
          <tbody>
            ${categories.map(category => `
              <tr>
                <td>Category ${category}</td>
                <td>${escapeHtml(names[category])}</td>
                <td><strong>${levelLetter(levels[category])}</strong></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}


function isTestingCertificateRecord(record) {
  if (canonicalShowType(record?.show_type) !== "activity") return false;

  const activityKey = normalizeKey(record?.activity_key);
  const classText = normalizeKey(record?.class);
  const labelText = normalizeKey(record?.score_label);
  const showText = normalizeKey(record?.show_name);
  const combined = `${activityKey} ${classText} ${labelText} ${showText}`;

  return (
    ["cgc","cgcb","cgcs","cgcg","cgca","cgcu"].includes(activityKey) ||

    // Catch every Temperament variation, not only the exact
    // "Temperament Test" wording used by newer records.
    combined.includes("temperament") ||

    // Catch Therapy Animal / Therapy Test / Therapy Dog-Cat-Horse
    // and older records that simply stored "Therapy".
    combined.includes("therapy") ||

    combined.includes("canine good citizen") ||
    /\bcgc\b/.test(combined)
  );
}

function testingCertificateLabel(record) {
  const key = normalizeKey(record?.activity_key);
  const text = normalizeKey(`${record?.class || ""} ${record?.score_label || ""} ${record?.show_name || ""}`);
  const combined = `${key} ${text}`.trim();

  // Match all historical/current Temperament wording.
  if (combined.includes("temperament")) {
    return "Temperament Testing";
  }

  // Match Therapy Animal, Therapy Test, Therapy Dog/Cat/Horse,
  // and older records that only stored "Therapy".
  if (combined.includes("therapy")) {
    return "Therapy Animal";
  }

  if (
    ["cgc","cgcb","cgcs","cgcg","cgca","cgcu"].includes(key) ||
    combined.includes("canine good citizen") ||
    /\bcgc\b/.test(combined)
  ) {
    return "Canine Good Citizen";
  }

  return "Testing & Certificates";
}

function renderTestingCertificatesPanel(records, animal) {
  const testingRecords = (records || []).filter(isTestingCertificateRecord);
  if (!testingRecords.length) return "";

  const titleData = calculateTestingTitles(records, animal);
  const grouped = ["Temperament Testing", "Therapy Animal", "Canine Good Citizen"]
    .map(label => ({ label, records: testingRecords.filter(r => testingCertificateLabel(r) === label) }))
    .filter(group => group.records.length);

  return `
    <section class="panel">
      <h3 class="panel-title">Testing & Certificates</h3>
      ${titleData.rows?.length ? `
        <div class="testing-title-grid">
          ${titleData.rows.map(row => `
            <div class="testing-title-card">
              <span>${escapeHtml(row.titleName || "")}</span>
              <strong>${escapeHtml(row.titleCode || "")}</strong>
              <small>${escapeHtml(row.count || "")}</small>
            </div>
          `).join("")}
        </div>
      ` : ""}

      ${grouped.map(group => `
        <h4 class="subsection-title">${escapeHtml(group.label)}</h4>
        <div class="table-wrap">
          <table class="records-table">
            <thead><tr>
              <th>Date</th><th>Show</th><th>Test</th><th>Result</th><th>Score</th>
            </tr></thead>
            <tbody>
              ${group.records.map(r => `
                <tr>
                  <td>${escapeHtml(r.event_date || "")}</td>
                  <td>${escapeHtml(r.show_name || "")}</td>
                  <td>${escapeHtml(r.class || r.score_label || group.label)}</td>
                  <td>${recordPassed(r) === true ? "Pass" : recordPassed(r) === false ? "Fail" : "Recorded"}</td>
                  <td>${escapeHtml(formatScore(r))}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `).join("")}
    </section>
  `;
}

function activityFilterKey(record, activityTypes) {
  if (isBestInFieldActivityRecord(record)) return "";

  const activity = resolveActivityForRecord(record, activityTypes);
  const raw =
    activity?.display_name ||
    activity?.activity_key ||
    record?.activity_key ||
    record?.class ||
    "unknown";

  return activityBaseKey(cleanActivityDisplayName(raw));
}

function cleanActivityDisplayName(value) {
  return String(value || "")
    // Activity divisions/groups are class subdivisions, not separate activities.
    // Example: "Canine Treibball Team - Herding" -> "Canine Treibball Team"
    .replace(/\s+-\s+[^-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function activityFilterLabel(record, activityTypes) {
  if (isBestInFieldActivityRecord(record)) return "";

  const activity = resolveActivityForRecord(record, activityTypes);
  const rawLabel =
    activity?.display_name ||
    activity?.activity_key ||
    fallbackActivityNameFromClass(record?.class) ||
    "Other";

  return cleanActivityDisplayName(rawLabel);
}

function activityFilterButtons(records, tableId, activityTypes) {
  const byKey = new Map();

  (records || []).forEach(record => {
    const key = activityFilterKey(record, activityTypes);
    if (!key || byKey.has(key)) return;
    byKey.set(key, activityFilterLabel(record, activityTypes));
  });

  const entries = [...byKey.entries()].sort((a,b) => String(a[1]).localeCompare(String(b[1])));
  if (entries.length <= 1) return "";

  return `
    <div class="activity-tabs" data-target="${escapeHtml(tableId)}">
      <button type="button" class="activity-tab active" data-activity="all">All Activities</button>
      ${entries.map(([key,label]) => `
        <button type="button" class="activity-tab" data-activity="${escapeHtml(key)}">${escapeHtml(label)}</button>
      `).join("")}
    </div>
  `;
}

function renderActivityRecordTable(records, tableId, activityTypes) {
  if (!records.length) return `<div class="empty">No activity records in this section.</div>`;

  return `
    ${activityFilterButtons(records, tableId, activityTypes)}
    ${yearFilterButtons(records, tableId)}
    <div class="table-wrap">
      <table class="records-table" id="${escapeHtml(tableId)}">
        <thead><tr>
          <th>Date</th><th>Show</th><th>Activity</th><th>Class</th><th>Placement</th><th>Points</th><th>Score</th>
        </tr></thead>
        <tbody>
          ${records.map(r => `
            <tr data-year="${escapeHtml(recordYear(r))}" data-activity="${escapeHtml(activityFilterKey(r, activityTypes))}">
              <td>${escapeHtml(r.event_date || "")}</td>
              <td>${escapeHtml(r.show_name || "")}</td>
              <td>${escapeHtml(activityFilterLabel(r, activityTypes))}</td>
              <td>${escapeHtml(displayRecordClass(r, records))}</td>
              <td>${escapeHtml(r.placement || "")}</td>
              <td>${pointsValue(r)}</td>
              <td>${escapeHtml(formatScore(r))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function applyRecordFilters(table) {
  if (!table) return;
  const root = table.closest(".panel") || table.parentElement?.parentElement || document;
  const yearGroup = root.querySelector(`.year-tabs[data-target="${table.id}"]`);
  const activityGroup = root.querySelector(`.activity-tabs[data-target="${table.id}"]`);
  const year = yearGroup?.querySelector(".year-tab.active")?.dataset.year || "all";
  const activity = activityGroup?.querySelector(".activity-tab.active")?.dataset.activity || "all";

  table.querySelectorAll("tbody tr").forEach(row => {
    const yearOk = year === "all" || row.dataset.year === year;
    const activityOk = activity === "all" || row.dataset.activity === activity;
    row.hidden = !(yearOk && activityOk);
  });
}

function recordYear(record) {
  const match = String(record?.event_date || "").match(/^(\d{4})/);
  return match ? match[1] : "Unknown";
}

function yearFilterButtons(records, targetId) {
  const years = [...new Set((records || []).map(recordYear).filter(y => y !== "Unknown"))]
    .sort((a,b) => Number(b) - Number(a));
  if (!years.length) return "";

  return `
    <div class="year-tabs" data-target="${escapeHtml(targetId)}">
      <button type="button" class="year-tab active" data-year="all">All Years</button>
      ${years.map(year => `<button type="button" class="year-tab" data-year="${year}">${year}</button>`).join("")}
    </div>
  `;
}

function renderRecordTable(records, tableId) {
  if (!records.length) return `<div class="empty">No records in this section.</div>`;

  return `
    ${yearFilterButtons(records, tableId)}
    <div class="table-wrap">
      <table class="records-table" id="${escapeHtml(tableId)}">
        <thead><tr>
          <th>Date</th><th>Show</th><th>Class</th><th>Placement</th><th>Points</th><th>Score</th>
        </tr></thead>
        <tbody>
          ${records.map(r => `
            <tr data-year="${escapeHtml(recordYear(r))}">
              <td>${escapeHtml(r.event_date || "-")}</td>
              <td>${escapeHtml(r.show_name || "-")}</td>
              <td>${escapeHtml(displayRecordClass(r, records))}</td>
              <td>${escapeHtml(r.placement || "-")}</td>
              <td>${pointsValue(r)}</td>
              <td>${escapeHtml(formatScore(r))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderStructuredClubProgress(rows) {
  if (!rows?.length) {
    return `<div class="empty">No title progress yet.</div>`;
  }

  return `
    <div class="table-wrap">
      <table class="titles-table">
        <thead>
          <tr>
            <th>Category</th>
            <th>Title</th>
            <th>Code</th>
            <th>Requirement</th>
            <th>Current</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .slice()
            .sort((a,b) => Number(a.sort || 0) - Number(b.sort || 0))
            .map(row => `
              <tr>
                <td>${escapeHtml(row.category || "")}</td>
                <td>${escapeHtml(row.title || row.titleName || "")}</td>
                <td>${escapeHtml(row.code || row.titleCode || "")}</td>
                <td>${escapeHtml(row.requirement || "")}</td>
                <td>${escapeHtml(row.current || row.count || "")}</td>
                <td>
                  <span class="status-pill ${row.earned ? "earned" : "progress"}">
                    ${row.earned ? "Earned" : "In Progress"}
                  </span>
                </td>
              </tr>
            `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderClubProgressTable(rows) {
  if (!rows?.length) return `<div class="empty">This animal has club records, but no club title has been earned yet.</div>`;
  return `
    <div class="table-wrap">
      <table class="titles-table">
        <thead><tr><th>Title</th><th>Code</th><th>Progress / Qualification</th></tr></thead>
        <tbody>
          ${rows.slice().sort((a,b) => Number(a.sort || 0) - Number(b.sort || 0)).map(row => `
            <tr>
              <td>${escapeHtml(row.titleName || "")}</td>
              <td>${escapeHtml(row.titleCode || "")}</td>
              <td>${escapeHtml(row.count || "Earned")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function enduranceClubSummary(records) {
  const club = (records || []).filter(isEnduranceClubRecord);
  const completed = club.filter(r => r?.endurance_completed === true || recordPassed(r) === true);
  const totalDistance = completed.reduce((sum,r) => sum + (Number(r?.endurance_distance_km) || 0), 0);
  const totalMoney = club.reduce((sum,r) => sum + (Number(r?.endurance_winnings) || 0), 0);
  const totalPoints = club.reduce((sum,r) => sum + pointsValue(r), 0);

  return `
    <div class="club-summary-grid">
      <div class="mini-stat"><span>Total Club Points</span><strong>${totalPoints.toLocaleString()}</strong></div>
      <div class="mini-stat"><span>Total Money Earned</span><strong>$${totalMoney.toLocaleString()}</strong></div>
      <div class="mini-stat"><span>Total Distance</span><strong>${totalDistance.toLocaleString()} km</strong></div>
      <div class="mini-stat"><span>Completed Races</span><strong>${completed.length}</strong></div>
    </div>
  `;
}

function isEnduranceClubAwardRecord(record) {
  const eventType = normalizeKey(record?.association_event_type);
  const placement = normalizeKey(record?.placement);
  const classText = normalizeKey(record?.class);

  return (
    eventType.includes("champion") ||
    eventType.includes("award") ||
    placement.includes("circuit champion") ||
    placement.includes("series champion") ||
    classText.includes("circuit champion") ||
    classText.includes("series champion")
  );
}

function enduranceDisplayShowName(record) {
  const raw = String(record?.show_name || "").trim();
  const generic = normalizeKey(raw);

  if (!raw || generic === "untitled show" || generic === "activity show" || generic === "activities") {
    return (
      record?.endurance_conference ||
      record?.endurance_series ||
      record?.endurance_circuit ||
      "Endurance Club"
    );
  }

  return raw;
}

function enduranceDisplayRaceName(record) {
  return (
    record?.endurance_race_name ||
    String(record?.class || "").replace(/^Endurance\s*-\s*/i, "").trim() ||
    record?.endurance_race_key ||
    "Endurance Race"
  );
}

function renderEnduranceRaceTable(records, tableId) {
  const races = (records || []).filter(r => !isEnduranceClubAwardRecord(r));
  if (!races.length) return `<div class="empty">No Endurance Club race records yet.</div>`;

  return `
    ${yearFilterButtons(races, tableId)}
    <div class="table-wrap">
      <table class="records-table" id="${escapeHtml(tableId)}">
        <thead><tr>
          <th>Date</th><th>Show</th><th>Race</th><th>Placement</th><th>Points</th><th>Distance</th><th>Money Earned</th>
        </tr></thead>
        <tbody>
          ${races.map(r => `
            <tr data-year="${escapeHtml(recordYear(r))}">
              <td>${escapeHtml(r.event_date || "")}</td>
              <td>${escapeHtml(enduranceDisplayShowName(r))}</td>
              <td>${escapeHtml(enduranceDisplayRaceName(r))}</td>
              <td>${escapeHtml(r.placement || "")}</td>
              <td>${pointsValue(r)}</td>
              <td>${Number(r?.endurance_distance_km || 0) ? `${Number(r.endurance_distance_km).toLocaleString()} km` : ""}</td>
              <td>${Number(r?.endurance_winnings || 0) ? `$${Number(r.endurance_winnings).toLocaleString()}` : ""}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderEnduranceAwards(records) {
  const awards = (records || []).filter(isEnduranceClubAwardRecord);
  if (!awards.length) return "";

  return `
    <h4 class="subsection-title">Club Awards</h4>
    <div class="table-wrap">
      <table class="titles-table">
        <thead><tr><th>Award</th><th>Result</th><th>Season / Show</th></tr></thead>
        <tbody>
          ${awards.map(r => `
            <tr>
              <td>${escapeHtml(r.class || r.association_event_type || "Endurance Club Award")}</td>
              <td>${escapeHtml(r.placement || "Earned")}</td>
              <td>${escapeHtml(r.show_name || r.endurance_season || "")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function isHerdingClubRecord(record) {
  if (isHerdingInstinctRecord(record)) return true;

  const associationKey = normalizeKey(record?.association_key);
  const showName = normalizeKey(record?.show_name);
  const classText = normalizeKey(record?.class);
  const labelText = normalizeKey(record?.score_label);
  const combined = `${showName} ${classText} ${labelText}`.trim();

  // Explicitly stored club records.
  if (associationKey === "herding club") {
    return (
      combined.includes("stakes") ||
      combined.includes("instinct")
    );
  }

  // Historical/legacy club uploads may not have association_key,
  // but the show/class text clearly identifies Herding Club Stakes.
  const isClubShow = showName.includes("herding club");
  const isStakes =
    combined.includes("stakes") ||
    /\b(beginners?|advanced|expert|championship|puppy)\b/.test(classText) &&
    /\b(sheep|cattle|duck|ducks|reindeer)\b/.test(classText);

  return isClubShow && isStakes;
}

function hasHerdingRecords(records) {
  return (records || []).some(isHerdingClubRecord);
}

function getClubPanels(records, animal, herdingRules) {
  const panels = [];

  const enduranceRecords = records.filter(isEnduranceClubRecord);
  if (enduranceRecords.length) {
    const data = calculateEnduranceClubTitles(records, animal);
    panels.push({
      key:"endurance", label:"Endurance Club",
      html:`<section class="panel">
        <h3 class="panel-title">Endurance Club</h3>
        ${enduranceClubSummary(records)}
        <h4 class="subsection-title">Title Progress</h4>
        ${renderEnduranceTitleProgress(records, animal)}
        <h4 class="subsection-title">Race Records</h4>
        ${renderEnduranceRaceTable(enduranceRecords, "club-records-endurance")}
        ${renderEnduranceAwards(enduranceRecords)}
      </section>`
    });
  }

  const huntingRecords = records.filter(r => normalizeKey(r?.association_key) === "hunting club");
  if (huntingRecords.length) {
    const data = calculateHuntingClubTitles(records, animal);
    panels.push({
      key:"hunting", label:"Hunting Club",
      html:`<section class="panel">
        <h3 class="panel-title">Hunting Club</h3>
        <h4 class="subsection-title">Title Progress</h4>
        ${renderStructuredClubProgress(data.rows)}
        <h4 class="subsection-title">Club Records</h4>
        ${renderRecordTable(huntingRecords, "club-records-hunting")}
      </section>`
    });
  }

  const ihassRecords = records.filter(r => normalizeKey(r?.association_key) === "ihass");
  if (ihassRecords.length) {
    const data = calculateIcelandicAssociationTitles(records, animal);
    panels.push({
      key:"ihass", label:"IHASS",
      html:`<section class="panel">
        <h3 class="panel-title">IHASS</h3>
        <h4 class="subsection-title">Title Progress</h4>
        ${renderStructuredClubProgress(data.rows)}
        <h4 class="subsection-title">Association Records</h4>
        ${renderRecordTable(ihassRecords, "club-records-ihass")}
      </section>`
    });
  }

  if (hasHerdingRecords(records)) {
    const clubHerdingRecords = records.filter(isHerdingClubRecord);
    const data = calculateHerdingTitles(clubHerdingRecords, animal, herdingRules);

    const herdingRecords = records.filter(isHerdingClubRecord);

    panels.push({
      key:"herding", label:"Herding Club",
      html:`<section class="panel">
        <h3 class="panel-title">Herding Club</h3>

        <h4 class="subsection-title">Title Progress</h4>
        ${renderClubProgressTable(data.rows)}

        ${herdingRecords.length ? `
          <h4 class="subsection-title">Herding Records</h4>
          ${renderRecordTable(herdingRecords, "club-records-herding")}
        ` : ""}
      </section>`
    });
  }

  return panels;
}

function animalInfoLine(animal) {
  const bits = [
    animal?.animal_number ? `ID #${animal.animal_number}` : null,
    animal?.breed,
    animal?.colour,
    animal?.gender,
    animal?.birthyear ? `Born: ${animal.birthyear}` : null,
    animal?.owner ? `Owner: ${animal.owner}` : null,
    animal?.breeder ? `Breeder: ${animal.breeder}` : null
  ].filter(Boolean);

  return bits.map(escapeHtml).join(`<span class="meta-sep">|</span>`);
}

function collapseTeamActivityRecords(records) {
  const teamClassPattern = /\b(pack|relay|team|brace)\b/i;
  const seen = {};
  const collapsed = [];

  (records || []).forEach(r => {
    if (canonicalShowType(r.show_type) !== "activity" || !teamClassPattern.test(String(r.class || ""))) {
      collapsed.push(r);
      return;
    }

    const key = [r.show_name || "", r.class || "", r.placement || "", pointsValue(r), r.event_date || ""].join("||");
    if (seen[key]) return;
    seen[key] = true;
    collapsed.push(r);
  });

  return collapsed;
}

function renderRecords(records, animal, titleRules, activityRules, activityTypes, totalRules, herdingRules) {
  const titleData = calculateTitleData(records, animal, titleRules, activityRules, activityTypes, totalRules, herdingRules);
  const registeredName = buildRegisteredName(animal, titleData);
  const pointRows = getPointBasedTitleRows(records, titleRules, activityRules, activityTypes);
  const clubs = getClubPanels(records, animal, herdingRules);
  const conformation = records.filter(r => canonicalShowType(r.show_type) === "conformation");
  const testingRecords = records.filter(isTestingCertificateRecord);
  const activities = collapseTeamActivityRecords(records.filter(r =>
    canonicalShowType(r.show_type) === "activity" &&
    !isTestingCertificateRecord(r) &&
    !isManualScoreRecord(r) &&
    !isBestInFieldActivityRecord(r)
  ));

  const nav = [
    {key:"overview", label:"Overview"},
    {key:"conformation", label:"Conformation Records"},
    {key:"activities", label:"Activity Records"},
    ...(testingRecords.length ? [{key:"testing", label:"Testing & Certificates"}] : []),
    {key:"versatility", label:"Versatility"},
    ...clubs.map(c => ({key:`club-${c.key}`, label:c.label}))
  ];

  return `
    <header class="animal-header">
      <div class="full-name">${escapeHtml(registeredName)}</div>
      <div class="animal-meta">${animalInfoLine(animal)}</div>
    </header>

    <section class="title-strip panel">
      <h3 class="panel-title">Titles</h3>
      <div class="registered-name">${escapeHtml(registeredName)}</div>
    </section>

    <nav class="main-tabs" aria-label="Show record sections">
      ${nav.map((item,index) => `
        <button type="button" class="main-tab ${index === 0 ? "active" : ""}" data-tab="${escapeHtml(item.key)}">${escapeHtml(item.label)}</button>
      `).join("")}
    </nav>

    <div class="tab-panels">
      <section class="tab-panel active" data-panel="overview">
        <div class="overview-grid">
          ${renderPointBasedTitles(pointRows)}
          ${buildHighlights(records)}
        </div>
      </section>

      <section class="tab-panel" data-panel="conformation">
        <section class="panel">
          <h3 class="panel-title">Conformation Records</h3>
          ${renderRecordTable(conformation, "conformation-records-table")}
        </section>
      </section>

      <section class="tab-panel" data-panel="activities">
        <section class="panel">
          <h3 class="panel-title">Activity Records</h3>
          ${renderActivityRecordTable(activities, "activity-records-table", activityTypes)}
        </section>
      </section>

      ${testingRecords.length ? `
        <section class="tab-panel" data-panel="testing">
          ${renderTestingCertificatesPanel(records, animal)}
        </section>
      ` : ""}

      <section class="tab-panel" data-panel="versatility">
        ${renderVersatilityPanel(animal, titleData)}
      </section>

      ${clubs.map(club => `
        <section class="tab-panel" data-panel="club-${escapeHtml(club.key)}">${club.html}</section>
      `).join("")}
    </div>
  `;
}

function wireShowRecordTabs() {
  document.querySelectorAll(".main-tabs").forEach(nav => {
    nav.addEventListener("click", event => {
      const button = event.target.closest(".main-tab");
      if (!button) return;
      const root = nav.parentElement;
      nav.querySelectorAll(".main-tab").forEach(btn => btn.classList.toggle("active", btn === button));
      root.querySelectorAll(".tab-panel").forEach(panel => {
        panel.classList.toggle("active", panel.dataset.panel === button.dataset.tab);
      });
    });
  });

  document.querySelectorAll(".year-tabs").forEach(group => {
    group.addEventListener("click", event => {
      const button = event.target.closest(".year-tab");
      if (!button) return;
      group.querySelectorAll(".year-tab").forEach(btn => btn.classList.toggle("active", btn === button));
      applyRecordFilters(document.getElementById(group.dataset.target));
    });
  });

  document.querySelectorAll(".activity-tabs").forEach(group => {
    group.addEventListener("click", event => {
      const button = event.target.closest(".activity-tab");
      if (!button) return;
      group.querySelectorAll(".activity-tab").forEach(btn => btn.classList.toggle("active", btn === button));
      applyRecordFilters(document.getElementById(group.dataset.target));
    });
  });
}

async function loadUploadMetadataForRecords(supabase, records) {
  const uploadIds = [...new Set(
    (records || [])
      .map(record => record?.upload_id)
      .filter(Boolean)
      .map(String)
  )];

  if (!uploadIds.length) return new Map();

  const map = new Map();
  const chunkSize = 100;

  for (let i = 0; i < uploadIds.length; i += chunkSize) {
    const chunk = uploadIds.slice(i, i + chunkSize);

    const { data, error } = await supabase
      .from("show_uploads")
      .select("id, show_name, series_name, series_round, created_at")
      .in("id", chunk);

    if (error) {
      console.warn("Show upload metadata load error:", error.message);
      continue;
    }

    (data || []).forEach(upload => map.set(String(upload.id), upload));
  }

  return map;
}

function sortRecordsByUploadAndSeries(records, uploadMap) {
  const rows = (records || []).slice();

  // Find the newest upload timestamp represented by each named series.
  const seriesNewest = new Map();

  rows.forEach(record => {
    const upload = uploadMap.get(String(record?.upload_id || ""));
    const series = String(upload?.series_name || '').replace(/\s+/g, ' ').trim();
    if (!series) return;

    const stamp = Date.parse(upload?.created_at || "") || 0;
    const existing = seriesNewest.get(series) || 0;
    if (stamp > existing) seriesNewest.set(series, stamp);
  });

  function info(record) {
    const upload = uploadMap.get(String(record?.upload_id || ""));
    const series = String(upload?.series_name || '').replace(/\s+/g, ' ').trim();
    const uploadStamp =
      Date.parse(upload?.created_at || "") ||
      Date.parse(record?.event_date || "") ||
      0;

    return {
      series,
      groupKey: series ? "series::" + series : "upload::" + String(record?.upload_id || record?.show_name || ""),
      groupStamp: series ? (seriesNewest.get(series) || uploadStamp) : uploadStamp,
      uploadStamp,
      round: Number.isFinite(Number(upload?.series_round)) ? Number(upload.series_round) : null,
      showName: String(record?.show_name || upload?.show_name || "")
    };
  }

  return rows.sort((a, b) => {
    const ai = info(a);
    const bi = info(b);

    // Newest show/series block first.
    if (bi.groupStamp !== ai.groupStamp) return bi.groupStamp - ai.groupStamp;

    // Keep every member of the same series together.
    if (ai.groupKey !== bi.groupKey) {
      return ai.groupKey.localeCompare(bi.groupKey);
    }

    // Within a series, preserve upload order: newest uploaded show first.
    if (bi.uploadStamp !== ai.uploadStamp) return bi.uploadStamp - ai.uploadStamp;

    // If timestamps tie, use round (newest/highest round first) then show name.
    if (ai.round !== bi.round) {
      if (ai.round === null) return 1;
      if (bi.round === null) return -1;
      return bi.round - ai.round;
    }

    return ai.showName.localeCompare(bi.showName);
  });
}

async function loadRecords() {
  const animalRef = getAnimalNumber();
  const supabase = getSupabase();
  const content = document.getElementById("content");

  try {
    if (!supabase) {
      content.innerHTML = `<div class="empty">Supabase is not loaded on this page.</div>`;
      return;
    }

    if (!animalRef) {
      content.innerHTML = `<div class="empty">Missing animal ID in the popup URL.</div>`;
      return;
    }

    const animal = await getAnimal(animalRef);

    if (!animal) {
      content.innerHTML = `<div class="empty">Animal could not be found for this show records page.</div>`;
      return;
    }

    const animalNumber = animal.animal_number;
    const animalId = animal.id;

    const pageSize = 1000;

    async function fetchPagedRecords(filterType) {
      let rowsOut = [];
      let from = 0;
      let to = pageSize - 1;

      while (true) {
        let query = supabase
          .from("show_records")
          .select("*")
          .order("event_date", { ascending: false })
          .range(from, to);

        if (filterType === "animal_number" && animalNumber !== null && animalNumber !== undefined && animalNumber !== "") {
          query = query.eq("animal_number", Number(animalNumber));
        }

        if (filterType === "animal_id" && animalId) {
          query = query.eq("animal_id", animalId);
        }

        const { data: pageData, error } = await query;

        if (error) {
          throw error;
        }

        const rows = pageData || [];
        rowsOut = rowsOut.concat(rows);

        if (rows.length < pageSize) {
          break;
        }

        from += pageSize;
        to += pageSize;
      }

      return rowsOut;
    }

    let allRows = [];

    if (animalNumber !== null && animalNumber !== undefined && animalNumber !== "") {
      const numberRows = await fetchPagedRecords("animal_number");
      allRows = allRows.concat(numberRows);
    }

    if (animalId) {
      const idRows = await fetchPagedRecords("animal_id");
      allRows = allRows.concat(idRows);
    }

    const seen = {};
    allRows = allRows.filter(row => {
      const key = String(row.id || `${row.show_name}-${row.class}-${row.placement}-${row.event_date}`);
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });


    /*
      Add synthetic Circuit Champion records from the database-wide season standings.
      This lets the individual Show Records page award a circuit championship without
      pretending one horse's own records can know everybody else's total.
    */
    if (animalId) {
      const { data: championRows, error: championError } = await supabase
        .from("endurance_circuit_champions")
        .select("*")
        .eq("animal_id", animalId);

      if (!championError) {
        (championRows || []).forEach(row => {
          allRows.push({
            id: `endurance-champion-${row.endurance_circuit}-${row.season}`,
            animal_id: animalId,
            show_name: `${row.endurance_circuit} ${row.season} Season`,
            show_type: "activity",
            show_scope: "association",
            association_key: "endurance_club",
            association_event_type: "circuit_champion",
            activity_key: null,
            class: "Endurance Club Circuit Champion",
            placement: "Circuit Champion",
            // Synthetic title marker only: circuit points already exist on the real race records.
            // Never add them again to popup/activity totals.
            points: 0,
            calculated_points: 0,
            endurance_circuit_points: Number(row.circuit_points || 0),
            endurance_circuit: row.endurance_circuit,
            endurance_season: Number(row.season),
            endurance_completed: false,
            endurance_winnings: 0
          });
        });
      }
    }

    // Order real show records by their parent upload, not event_date. This keeps
    // newly uploaded shows at the top and keeps named series together.
    const uploadMap = await loadUploadMetadataForRecords(supabase, allRows);
    allRows = sortRecordsByUploadAndSeries(allRows, uploadMap);

    const [titleRules, activityRules, activityTypes, totalRules, herdingRules] = await Promise.all([
      getTableRows("title_rules"),
      getTableRows("activity_title_rules"),
      getTableRows("activity_types"),
      getTableRows("total_award_activity_rules"),
      getTableRows("herding_title_rules")
    ]);

    // ROM / ROMX / SprROM / SprROMX depend on offspring conformation achievement.
    // Load the canonical conformation rules first, then calculate breeding awards
    // from those live CH. / SprWCH. thresholds.
    animal._breedingAwards = await loadBreedingAwardData(animal, titleRules);

    content.innerHTML = renderRecords(
      allRows || [],
      animal,
      titleRules,
      activityRules,
      activityTypes,
      totalRules,
      herdingRules
    );

    wireShowRecordTabs();

  } catch (err) {
    console.error(err);
    content.innerHTML = `<div class="empty">JavaScript error: ${err.message}</div>`;
  }
}

function bootShowRecords() {
  if (window.__showRecordsBooted) return;
  window.__showRecordsBooted = true;
  loadRecords();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootShowRecords, { once: true });
} else {
  bootShowRecords();
}
