(() => {
'use strict';

// Show Standard Randomizer — Development Phase 1
// Standard conformation, activities, Herding, and Championship mode.

// =============================================================
// 1. CONFIG
// =============================================================
const SS_CONFIG = {
  supabaseUrl: 'https://vyuklkrqusfvrcaqxmfm.supabase.co',
  supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXAiOiJ2eXVrbGtycXVzZnZyY2FxeG1mbSIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzc1MTIzOTQzLCJleHAiOjIwOTA2OTk0M30.invalid_replace_with_current_key',
  groupOrder: [
    'ASIAN','BRITISH','FOREST & MOUNTAIN CAT','LILLIPUTIAN','PERSIAN & HYBRID','PATTERNED','REX','ORIENTAL & SIAMESE','SEMI-LONGHAIR','MISCELLANEOUS',
    'TOYS','TERRIERS','GUNDOGS','HOUNDS','SIGHTHOUNDS','WORKING','NON-SPORTING','HERDING',
    'BAROQUE','DRAFT HORSES','FERAL','GAITED','LIGHT HORSES','MINIATURES','PONIES','STOCK HORSES','WARMBLOODS'
  ],
  titleCodes: ['SPRWCH','NATCH','INTCH','UNICH','GCH','WCH','HOF','HOL','CH'],
  conformationPoints: {
    'Best in Show': 100,
    'Reserve Best in Show': 90,
    'Best in Show Specialty': 100,
    'Reserve Best in Show Specialty': 90,
    'Best in Group': 50,
    'Reserve Best in Group': 40,
    'Best of Breed': 20,
    'Male Challenge': 10,
    'Female Challenge': 10,
    'Reserve Male Challenge': 8,
    'Reserve Female Challenge': 8
  },
  placementPoints: { 1: 5, 2: 4, 3: 3, 4: 2, 5: 1 },
  maxPlacements: 10
};

// IMPORTANT: replace this with the current anon key from the existing working randomizer before posting.
SS_CONFIG.supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ5dWtsa3JxdXNmdnJjYXF4bWZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMjM5NDMsImV4cCI6MjA5MDY5OTk0M30.szeH6jnNnoqKC0dwPapD4KHw1zMCWLNXW7rlxeUh6Kk';

let savedResults = '';
let savedShowData = null;
let savedRecords = [];
let activityTypesCache = [];
let activityAliasesCache = [];
let championshipSeriesCache = [];
let championshipShowsCache = [];
let championshipPreviewCache = null;

// =============================================================
// 2. CORE HELPERS
// =============================================================
function $(id) { return document.getElementById(id); }
function cleanLine(line) { return String(line || '').replace(/\s+/g, ' ').trim(); }
function stripHeaderMarkup(text) {
  let s = cleanLine(text)
    .replace(/\[\/?b\]/gi, '')
    .trim();

  // Supports:
  // [Canine Agility]
  // [Activity] Canine Agility
  // [Division] Novice
  // [Class] Untitled
  s = s.replace(/^\[(activity|division|class)\]\s*/i, '');
  s = s.replace(/^\[(.+?)\]$/i, '$1');

  return cleanLine(s);
}
function stripBBCode(text) {
  return String(text || '')
    .replace(/\[img\].*?\[\/img\]/gis, '')
    .replace(/\[hr\]/gi, '\n')
    .replace(/\[\/?.*?\]/g, '')
    .split('\n')
    .map(cleanLine)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
function splitBlocks(text) {
  return String(text || '')
    .replace(/\[hr\]/gi, '\n\n')
    .split(/\n\s*\n/g)
    .map(block => block.split('\n').map(cleanLine).filter(Boolean))
    .filter(block => block.length);
}
function normalizeGroupName(name) {
  let n = cleanLine(name).toUpperCase().replace(/\s+AND\s+/g, ' & ').replace(/\s+/g, ' ');
  if (n === 'PATTERENED') n = 'PATTERNED';
  if (n === 'SEMI-LONGHAIRED') n = 'SEMI-LONGHAIR';
  if (n === 'ORIENTAL&SIAMESE' || n === 'ORIENTAL AND SIAMESE') n = 'ORIENTAL & SIAMESE';
  if (n === 'SIGHTHOUND' || n === 'SIGHT HOUND' || n === 'SIGHT HOUNDS') n = 'SIGHTHOUNDS';
  return n;
}
function normalizeBreedName(name) {
  let n = cleanLine(name).split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  if (n.length > 2 && /[^aeiou]s$/i.test(n) && !/ss$/i.test(n)) n = n.slice(0, -1);
  return n;
}
function groupSort(a, b) {
  const ai = SS_CONFIG.groupOrder.indexOf(a.name);
  const bi = SS_CONFIG.groupOrder.indexOf(b.name);
  return (ai < 0 ? 9999 : ai) - (bi < 0 ? 9999 : bi);
}
function shuffle(array) {
  const copy = array.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
function isFemaleClass(className) { return /a\s*$/i.test(cleanLine(className)); }
function isClassLine(line) { return /^class\s+\d+a?[.:]?$/i.test(cleanLine(line)); }
function hasTitle(name) { return !!extractTitle(name); }
function extractTitle(name) {
  const upper = String(name || '').toUpperCase();
  return SS_CONFIG.titleCodes.find(t => upper.startsWith(t + ' ') || upper.startsWith(t + '. ') || upper.includes(' ' + t + ' ') || upper.includes(t + '. ')) || null;
}
function isMultiAnimalClass(name) { return /\b(pack|team|relay|brace)\b/i.test(String(name || '')); }
function expandTeamEntries(className, entry) {
  if (!isMultiAnimalClass(className)) return [entry];
  const parts = String(entry || '').split(/\s+-\s+/).map(cleanLine).filter(Boolean);
  return parts.length > 1 ? parts : [entry];
}
function addLine(lines, text) { if (text === undefined || text === null) lines.push(''); else lines.push(String(text)); }
function bold(text) { return '[b]' + text + '[/b]'; }
function placementLabel(i) { return String(i); }
function getShowTypeKind(showType, showData) {
  if (showData && showData.associationKey === 'endurance_club') {
    return showData.associationEventType === 'prospect' ? 'conformation' : 'activity';
  }

  if (showData && showData.associationEventType === 'gaiting') return 'activity';
  if (showData && showData.associationEventType === 'breeding') return 'conformation';
  if (showData && showData.associationEventType === 'halter') return 'conformation';

  const type = String(showType || '');
  return (
    type.startsWith('activity') ||
    type === 'herding-club' ||
    /^specialty-testing-system-/.test(type)
  ) ? 'activity' : 'conformation';
}
function getShowScope(showType) {
  const t = String(showType || '').toLowerCase();
  if (t.includes('championship')) return 'championship';
  if (t.includes('major-chase')) return 'all breed';
  if (t.includes('specialty') || t.includes('rare-breed') || t.includes('titled') || t.includes('untitled')) return 'specialty';
  return null;
}
function showMessage(type, html) {
  const el = $('ssMessages');
  el.className = 'ss-message ' + type;
  el.innerHTML = html;
}
function hideMessage() { $('ssMessages').className = 'hidden'; $('ssMessages').innerHTML = ''; }

// =============================================================
// 3. SUPABASE / UPLOAD HELPERS
// =============================================================
function getSupabase() {
  if (window.supabaseClient) return window.supabaseClient;
  if (window.supabase && window.supabase.createClient) {
    window.supabaseClient = window.supabase.createClient(SS_CONFIG.supabaseUrl, SS_CONFIG.supabaseKey);
    return window.supabaseClient;
  }
  return null;
}
function normalizeNameForUpload(name) {
  return String(name || '')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[‐‑‒–—―]/g, '-')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
// Titles and display decorations must never prevent an otherwise exact registry match.
// This cleaner removes ONLY known title/record decorations and the final " - Owner"
// portion used by SS entry lines. It never generates partial-name fragments.
// Every title/record code that may appear before OR after an animal's
// registered name. Keeping one shared list means stacked mixed titles such as
// "MBIS MBISS UniCH. RCCh. FFCh. PTB Charmane ITC TotC36 TAC" are removed
// cleanly from both ends until only the actual registered name remains.
const SS_ENTRY_TITLE_CODES = [
  // Conformation awards / championships
  'BIS','MBIS','RBIS','BISS','MBISS','RBISS',
  'SPRWCH','SPRCH','NATCH','NAT','INTCH','INT','UNICH','UNI',
  'GCH','WCH','CH','TDCH','GHCH','GHGCH','HOF','HOL',

  // Cat and dog activity titles currently used on SS
  'RCCH','RCN','RCI','RCA','RCE',
  'FFCH','FD','FDX','FDCH','FM','FMX','FMCH','FDGCH',
  'PTB','ITC','TAC','FOI','CAAI','CAGCH','SCCH',
  'FFA','VBC','VNC','TTC','TTD','ATC',
  'CIHDM','IHDM','ENJ','ENN','ENO','GDM','GDI','GD3L','GDT','GYR',
  'NGH','WER','NTD','TTH','TAH','CDT','CD1L','WTP3','WTP4','S2',
  'DCPEC',

  // Patterned/repeatable record codes
  'TOTH\\d+','TOTD\\d+','TOTC\\d+',
  'ED[A-Z0-9-]+'
];

const SS_ENTRY_TITLE_PATTERN = SS_ENTRY_TITLE_CODES.join('|');
const SS_PREFIX_TITLE_RE = new RegExp('^(?:' + SS_ENTRY_TITLE_PATTERN + ')\\.?\\s+', 'i');
const SS_SUFFIX_TITLE_RE = new RegExp('\\s+(?:' + SS_ENTRY_TITLE_PATTERN + ')\\.?$', 'i');

function stripEntryOwner(name) {
  const n = String(name || '').trim();

  // SS entries use "Registered Name - Owner". Remove only the LAST spaced
  // separator so hyphens inside a registered name remain untouched.
  const parts = n.split(/\s+-\s+/);
  if (parts.length < 2) return n;

  return parts.slice(0, -1).join(' - ').trim();
}

function removeDecorations(name) {
  let n = stripEntryOwner(name);

  n = n.replace(/^\s*Fe:\s*/i, '');
  n = n.replace(/\s+-\s+\d+\s*$/i, '');

  // Strip recognized title codes from BOTH ends repeatedly. This handles any
  // mixture of prefix and suffix titles without shortening the registered name.
  let previous = null;
  while (n && n !== previous) {
    previous = n;
    n = n.replace(SS_PREFIX_TITLE_RE, '').trim();
    n = n.replace(SS_SUFFIX_TITLE_RE, '').trim();
  }

  return n.trim();
}

function nameCandidates(rawName) {
  // Exact complete-name candidates only:
  // 1. the displayed entry without its owner;
  // 2. the same complete name with recognized titles removed.
  // No shortened or prefix-only candidate is ever created.
  const withoutOwner = normalizeNameForUpload(stripEntryOwner(rawName));
  const undecorated = normalizeNameForUpload(removeDecorations(rawName));

  return [...new Set([withoutOwner, undecorated].filter(Boolean))];
}
async function loadAnimalsMap(supabase) {
  // Supabase returns a maximum of 1,000 rows per request by default. The animal
  // registry is larger than that, so a single select silently leaves later
  // animals out of the lookup map. Load the complete registry in pages.
  const allAnimals = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from('animals')
      .select('id, animal_number, name, normalized_name, species')
      .order('id', { ascending: true })
      .range(from, to);

    if (error) throw new Error('Animal load error: ' + error.message);

    const page = data || [];
    allAnimals.push(...page);
    if (page.length < pageSize) break;
  }

  // Each exact normalized key stores every matching registry animal. This lets
  // the uploader detect duplicate exact names instead of silently taking the
  // first result returned by Supabase.
  const map = {};

  allAnimals.forEach(a => {
    const registryNames = [
      a.name,
      a.normalized_name,
      removeDecorations(a.name),
      removeDecorations(a.normalized_name)
    ];

    registryNames.forEach(value => {
      const key = normalizeNameForUpload(value);
      if (!key) return;
      if (!map[key]) map[key] = [];

      if (!map[key].some(existing => existing.id === a.id)) {
        map[key].push({
          id: a.id,
          animal_number: a.animal_number,
          name: a.name,
          species: a.species || null,
          key
        });
      }
    });
  });

  Object.defineProperty(map, '__animalCount', {
    value: allAnimals.length,
    enumerable: false
  });
  return map;
}
function findAnimal(rawName, animalMap) {
  const ownerFree = cleanLine(stripEntryOwner(rawName));
  const cleanedName = cleanLine(removeDecorations(rawName));

  // Do not attempt to match malformed records that contain only an owner or
  // punctuation. These can otherwise produce confusing "exact name" logs.
  if (!ownerFree || !cleanedName || !/[a-z0-9]/i.test(cleanedName)) {
    return { status: 'not-found', rawName, matches: [], searchedName: cleanedName };
  }

  const candidates = nameCandidates(rawName);

  // First try strict exact full-name candidates.
  for (const candidate of candidates) {
    const matches = animalMap[candidate] || [];

    if (matches.length === 1) {
      return { status: 'matched', animal: matches[0] };
    }

    if (matches.length > 1) {
      return {
        status: 'ambiguous',
        rawName,
        matches
      };
    }
  }

  // Title-safe fallback:
  // The displayed entry can contain any number of prefix/suffix titles that are
  // not yet listed in the randomizer. Search for a COMPLETE registry name as a
  // whole-token sequence inside the owner-free entry, then choose only the
  // longest unique complete-name match.
  //
  // Example:
  // "MBISS CH Rainforest Allure's Heavenly Lotus TotC - Tia"
  // matches the complete registry name
  // "Rainforest Allure's Heavenly Lotus"
  //
  // This does NOT accept shortened fragments when a longer registered name is
  // present, so similarly named animals remain protected.
  const searchable = normalizeNameForUpload(stripEntryOwner(rawName));
  const contained = [];

  Object.keys(animalMap).forEach(key => {
    if (!key) return;

    const isWholeName =
      searchable === key ||
      searchable.startsWith(key + ' ') ||
      searchable.endsWith(' ' + key) ||
      searchable.includes(' ' + key + ' ');

    if (!isWholeName) return;

    (animalMap[key] || []).forEach(animal => {
      contained.push({
        animal,
        key,
        tokenCount: key.split(' ').filter(Boolean).length,
        charCount: key.length
      });
    });
  });

  if (!contained.length) {
    return { status: 'not-found', rawName, matches: [] };
  }

  // Prefer the most complete registry name: most words, then most characters.
  contained.sort((a, b) =>
    b.tokenCount - a.tokenCount ||
    b.charCount - a.charCount ||
    String(a.animal.name || '').localeCompare(String(b.animal.name || ''))
  );

  const best = contained[0];
  const equallyBest = contained.filter(item =>
    item.tokenCount === best.tokenCount &&
    item.charCount === best.charCount
  );

  const uniqueAnimals = [];
  equallyBest.forEach(item => {
    if (!uniqueAnimals.some(existing => existing.id === item.animal.id)) {
      uniqueAnimals.push(item.animal);
    }
  });

  if (uniqueAnimals.length === 1) {
    return { status: 'matched', animal: uniqueAnimals[0] };
  }

  return {
    status: 'ambiguous',
    rawName,
    matches: uniqueAnimals
  };
}
async function loadActivityTypes(supabase) {
  const { data, error } = await supabase
    .from('activity_types')
    .select('*')
    .eq('active', true)
    .order('display_name');

  if (error) {
    activityTypesCache = [];
    return;
  }

  activityTypesCache = data || [];
}

async function loadActivityAliases(supabase) {
  const { data, error } = await supabase
    .from('activity_aliases')
    .select('*')
    .eq('active', true)
    .order('priority');

  if (error) {
    activityAliasesCache = [];
    return;
  }

  activityAliasesCache = data || [];
}

function speciesValueMatches(rowSpecies, selectedSpecies) {
  const wanted = cleanLine(selectedSpecies).toLowerCase();
  if (!wanted) return true;

  if (Array.isArray(rowSpecies)) {
    return rowSpecies.map(x => String(x || '').toLowerCase()).includes(wanted);
  }

  const raw = String(rowSpecies || '').toLowerCase();
  return !raw || raw === wanted || raw.split(',').map(x => x.trim()).includes(wanted);
}

function displayActivityNameForKey(key) {
  const found = activityTypesCache.find(row => String(row.activity_key) === String(key));
  return found ? found.display_name : key;
}

function resolveActivityKeyFromName(activityName, species) {
  const text = cleanLine(activityName).toLowerCase();
  const selectedSpecies = cleanLine(species).toLowerCase();

  const direct = activityTypesCache.find(row => {
    if (!speciesValueMatches(row.species, selectedSpecies)) return false;
    return (
      cleanLine(row.activity_key).toLowerCase().replace(/_/g, ' ') === text ||
      cleanLine(row.display_name).toLowerCase() === text
    );
  });

  if (direct) return direct.activity_key;

  const aliases = activityAliasesCache
    .filter(row => !row.species || cleanLine(row.species).toLowerCase() === selectedSpecies)
    .sort((a, b) => Number(a.priority || 100) - Number(b.priority || 100));

  const match = aliases.find(row => {
    const pattern = cleanLine(row.alias_pattern).toLowerCase();
    if (!pattern) return false;

    switch (row.match_type) {
      case 'exact':
        return text === pattern;
      case 'contains':
        return text.includes(pattern);
      case 'regex':
        try { return new RegExp(row.alias_pattern, 'i').test(activityName); }
        catch (_) { return false; }
      case 'starts_with':
      default:
        return text.startsWith(pattern);
    }
  });

  return match ? match.activity_key : null;
}

async function populateActivitySelector() {
  const supabase = getSupabase();
  const select = $('activityKey');
  if (!supabase || !select) return;

  await Promise.all([
    loadActivityTypes(supabase),
    loadActivityAliases(supabase)
  ]);

  const species = $('showSpecies') ? $('showSpecies').value : '';
  const options = activityTypesCache
    .filter(row => speciesValueMatches(row.species, species))
    .sort((a,b) => String(a.display_name || '').localeCompare(String(b.display_name || '')));

  select.innerHTML =
    '<option value="__MIXED__">All Activities</option>' +
    options.map(row =>
      '<option value="' + escapeHtml(row.activity_key) + '">' +
      escapeHtml(row.display_name) +
      '</option>'
    ).join('');
}
function getTodayISODate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}
async function createShowUpload(supabase, showData, finalOutput) {
  // show_uploads currently contains:
  // id, show_name, show_type, raw_text, created_at, show_scope,
  // import_type, series_name, series_round.
  // Keep this insert restricted to those confirmed columns so Supabase does not
  // reject the upload because of older raw_data/formatted_output/banner/date fields.
  const payload = {
    show_name: showData.showName,
    show_type: getShowTypeKind(showData.showType, showData),
    show_scope: getShowScope(showData.showType),
    import_type: 'randomizer',
    series_name: showData.seriesName || null,
    series_round: Number.isFinite(Number(showData.seriesRound)) && String(showData.seriesRound || '').trim() !== ''
      ? Number(showData.seriesRound)
      : null,
    association_key: showData.associationKey || null,
    association_event_type: showData.associationEventType || null,
    raw_text: finalOutput
  };

  const { data, error } = await supabase
    .from('show_uploads')
    .insert(payload)
    .select()
    .single();

  if (error) {
    throw new Error('ERROR creating show upload: ' + error.message);
  }

  return data;
}
function recordKey(record) {
  if (record.show_type === 'conformation') return [record.animal_name, record.show_name, 'conformation'].join('|');
  return [record.animal_name, record.show_name, record.show_type, record.class_name].join('|');
}
function keepBestRecords(records) {
  const map = {};
  records.forEach(r => {
    const key = recordKey(r);
    if (!map[key] || Number(r.points || 0) > Number(map[key].points || 0)) map[key] = r;
  });
  return Object.values(map);
}
async function uploadShowRecords() {
  const sourceTab = activeRandomizerTab;

  if (randomizerUploadInProgress[sourceTab]) {
    alert('This ' + sourceTab + ' workspace is already uploading. You can switch tabs and upload a different show while it finishes.');
    return;
  }

  if (!savedShowData || !savedResults || !savedRecords.length) {
    alert('Please run a show first before uploading.');
    return;
  }

  const supabase = getSupabase();
  if (!supabase) {
    alert('Supabase is not ready. Refresh and try again.');
    return;
  }

  /*
    PARALLEL-UPLOAD SAFETY
    ----------------------
    These are immutable snapshots of the show that was on THIS tab when Upload
    was clicked. From this point forward the async upload never reads the global
    savedShowData/savedResults/savedRecords again.

    This means the user can:
      1. start uploading a Conformation show,
      2. switch to Activities,
      3. start uploading an Activity show,
    without either upload inheriting the other tab's show name, species, records,
    association data, or results.
  */
  const uploadShowData = JSON.parse(JSON.stringify(savedShowData));
  const uploadResults = String(savedResults || '');
  const uploadRecords = JSON.parse(JSON.stringify(savedRecords));

  // Preserve the originating workspace before any asynchronous work begins.
  captureWorkspaceState();
  randomizerUploadInProgress[sourceTab] = true;

  const btn = $('uploadButton');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Uploading...';
  }

  setWorkspaceUploadMessage(
    sourceTab,
    'success',
    '<strong>Upload started.</strong><br>Loading animals and activity types...'
  );

  try {
    const animalMap = await loadAnimalsMap(supabase);
    await loadActivityTypes(supabase);

    uploadShowData.showDate = uploadShowData.showDate || getTodayISODate();

    const upload = await createShowUpload(
      supabase,
      uploadShowData,
      uploadResults
    );

    const uploadId = upload && upload.id ? upload.id : null;
    const uploadedShowDate =
      (upload && (upload.show_date || upload.event_date || upload.date)) ||
      uploadShowData.showDate;

    const finalRecords = keepBestRecords(uploadRecords);

    let inserted = 0;
    let skipped = 0;
    let failed = 0;

    let log =
      '<strong>Upload log</strong><br>' +
      'Created show upload: ' + escapeHtml(uploadShowData.showName) + '<br>' +
      'Show date: ' + escapeHtml(uploadedShowDate) + '<br>' +
      'Registry animals loaded: ' + Number(animalMap.__animalCount || 0) + '<br>' +
      'Records prepared: ' + finalRecords.length + '<br>';

    for (const r of finalRecords) {
      const animalResult = findAnimal(r.animal_name, animalMap);

      if (animalResult.status === 'not-found') {
        skipped++;
        log +=
          'Skipped, exact animal name not found: ' +
          escapeHtml(r.animal_name) +
          ' <small>(searched as: ' +
          escapeHtml(removeDecorations(r.animal_name) || 'blank') +
          ')</small><br>';
        continue;
      }

      if (animalResult.status === 'ambiguous') {
        skipped++;
        log +=
          'Skipped, duplicate exact registry name: ' +
          escapeHtml(r.animal_name) +
          ' (' +
          animalResult.matches
            .map(match =>
              escapeHtml(match.name) +
              ' #' +
              escapeHtml(match.animal_number || 'no number')
            )
            .join(', ') +
          ')<br>';
        continue;
      }

      const animal = animalResult.animal;

      // Registry species is authoritative.
      const registrySpecies = cleanLine(animal.species).toLowerCase();
      const selectedShowSpecies =
        cleanLine(uploadShowData.species).toLowerCase();

      if (
        selectedShowSpecies &&
        registrySpecies &&
        registrySpecies !== selectedShowSpecies
      ) {
        skipped++;
        log +=
          'Skipped, species mismatch: ' +
          escapeHtml(animal.name) +
          ' is registered as ' +
          escapeHtml(registrySpecies) +
          ', but this is a ' +
          escapeHtml(selectedShowSpecies) +
          ' show.<br>';
        continue;
      }

      // Second activity/species guard.
      if (r.show_type === 'activity' && r.activity_key) {
        const activityType = activityTypesCache.find(row =>
          String(row.activity_key || '') === String(r.activity_key || '')
        );

        if (
          activityType &&
          !speciesValueMatches(activityType.species, registrySpecies)
        ) {
          skipped++;
          log +=
            'Skipped, activity/species mismatch: ' +
            escapeHtml(animal.name) +
            ' (' +
            escapeHtml(registrySpecies) +
            ') cannot enter ' +
            escapeHtml(activityType.display_name || r.activity_key) +
            '.<br>';
          continue;
        }
      }

      const payload = {
        upload_id: uploadId,
        animal_id: animal.id,
        animal_number: animal.animal_number || null,
        show_name: r.show_name,
        show_type: r.show_type,
        show_scope: r.show_scope || null,
        event_date: uploadedShowDate,
        class:
          r.class_name ||
          (r.show_type === 'activity' ? 'Activity' : 'Class 1'),
        placement: r.placement,
        points: Number(r.points || 0),
        calculated_points: Number(r.points || 0),
        score:
          r.score !== null && r.score !== undefined
            ? Number(r.score)
            : null,
        max_score:
          r.max_score !== null && r.max_score !== undefined
            ? Number(r.max_score)
            : null,
        passed:
          typeof r.passed === 'boolean' ? r.passed : null,
        score_label: r.score_label || null,
        activity_key: r.activity_key || null,
        association_key:
          r.association_key ||
          uploadShowData.associationKey ||
          null,
        association_event_type:
          r.association_event_type ||
          uploadShowData.associationEventType ||
          null,
        endurance_race_key: r.endurance_race_key || null,
        endurance_race_name: r.endurance_race_name || null,
        endurance_grade: r.endurance_grade || null,
        endurance_conference: r.endurance_conference || null,
        endurance_circuit: r.endurance_circuit || null,
        endurance_series: r.endurance_series || null,
        endurance_distance_km:
          r.endurance_distance_km !== null &&
          r.endurance_distance_km !== undefined
            ? Number(r.endurance_distance_km)
            : null,
        endurance_winnings: Number(r.endurance_winnings || 0),
        endurance_season:
          r.endurance_season ||
          Number(String(uploadedShowDate || '').slice(0, 4)) ||
          new Date().getFullYear(),
        endurance_completed:
          typeof r.endurance_completed === 'boolean'
            ? r.endurance_completed
            : null,
        hunting_family: r.hunting_family || null,
        hunting_specialization: r.hunting_specialization || null,
        hunting_level: r.hunting_level || null
      };

      let { error } = await supabase
        .from('show_records')
        .insert(payload);

      if (
        error &&
        /score|max_score|passed|score_label|column/i.test(
          String(error.message || '')
        )
      ) {
        const fallbackPayload = Object.assign({}, payload);
        delete fallbackPayload.score;
        delete fallbackPayload.max_score;
        delete fallbackPayload.passed;
        delete fallbackPayload.score_label;
        delete fallbackPayload.activity_key;

        const retry = await supabase
          .from('show_records')
          .insert(fallbackPayload);

        error = retry.error;
      }

      if (
        error &&
        /event_date|column/i.test(String(error.message || ''))
      ) {
        const fallbackPayload = Object.assign({}, payload);
        delete fallbackPayload.event_date;
        delete fallbackPayload.score;
        delete fallbackPayload.max_score;
        delete fallbackPayload.passed;
        delete fallbackPayload.score_label;
        delete fallbackPayload.activity_key;

        const retry = await supabase
          .from('show_records')
          .insert(fallbackPayload);

        error = retry.error;
      }

      if (error) {
        failed++;
        log +=
          'ERROR for ' +
          escapeHtml(r.animal_name) +
          ': ' +
          escapeHtml(error.message) +
          '<br>';
      } else {
        inserted++;
      }
    }

    log +=
      '<br><strong>Upload complete.</strong><br>' +
      'Inserted: ' + inserted + '<br>' +
      'Skipped: ' + skipped + '<br>' +
      'Failed: ' + failed;

    setWorkspaceUploadMessage(
      sourceTab,
      failed ? 'error' : 'success',
      log
    );

  } catch (err) {
    setWorkspaceUploadMessage(
      sourceTab,
      'error',
      '<strong>Upload failed:</strong><br>' +
      escapeHtml(String(err.message || err))
    );
  } finally {
    randomizerUploadInProgress[sourceTab] = false;

    /*
      Only update the visible button if the user is still on the tab that
      started this upload. If they switched to another tab, leave that tab's
      button alone.
    */
    if (activeRandomizerTab === sourceTab) {
      const currentBtn = $('uploadButton');
      if (currentBtn) {
        currentBtn.disabled = false;
        currentBtn.textContent = '💾 Upload to Animal Show Records';
      }

      // Capture only this tab's own final upload log/state.
      captureWorkspaceState();
    }
  }
}

// =============================================================
// 4. CONFORMATION MODULE
// =============================================================
function countBreedIndividuals(breed) {
  return (breed.classes || []).reduce((sum, cls) => sum + (cls.entries || []).length, 0);
}
function countGroupIndividuals(groups) {
  return (groups || []).reduce((total, group) => {
    return total + (group.breeds || []).reduce((breedTotal, breed) => breedTotal + countBreedIndividuals(breed), 0);
  }, 0);
}
function classSortValueSafe(name) {
  const s = cleanLine(name).toLowerCase();
  const m = s.match(/^class\s+(\d+)(a)?/i);
  if (!m) return 9999;
  const num = parseInt(m[1], 10);
  const female = !!m[2];

  // Male classes first, in number order. Female classes second, in number order.
  // Class 1, Class 2, Class 3, Class 1a, Class 2a, Class 3a
  return (female ? 1000 : 0) + num;
}
function sortConformationClasses(classes) {
  return (classes || []).sort((a,b) => classSortValueSafe(a.name) - classSortValueSafe(b.name) || a.name.localeCompare(b.name));
}
function mergeConformationGroups(groups) {
  const merged = [];

  (groups || []).forEach(g => {
    const groupName = normalizeGroupName(g.name);
    let mg = merged.find(x => x.name === groupName);
    if (!mg) {
      mg = { name: groupName, breeds: [] };
      merged.push(mg);
    }

    (g.breeds || []).forEach(b => {
      const breedName = normalizeBreedName(b.name);
      let mb = mg.breeds.find(x => x.name.toLowerCase() === breedName.toLowerCase());
      if (!mb) {
        mb = { name: breedName, classes: [] };
        mg.breeds.push(mb);
      }

      (b.classes || []).forEach(c => {
        const className = cleanLine(c.name);
        let mc = mb.classes.find(x => x.name.toLowerCase() === className.toLowerCase());
        if (!mc) {
          mc = { name: className, entries: [] };
          mb.classes.push(mc);
        }
        mc.entries.push(...(c.entries || []));
      });
    });
  });

  merged.forEach(g => {
    g.breeds.sort((a,b) => a.name.localeCompare(b.name));
    g.breeds.forEach(b => sortConformationClasses(b.classes));
  });

  return merged.sort(groupSort);
}
function parseConformation(rawData) {
  const blocks = splitBlocks(rawData);
  const groups = [];
  let currentGroup = null;
  let currentBreed = null;

  blocks.forEach(originalBlock => {
    let block = originalBlock.slice();

    // Group + Breed + Class block:
    // TOYS
    // CAVALIER KING CHARLES SPANIEL
    // Class 2
    if (block.length >= 3 && isClassLine(block[2])) {
      currentGroup = { name: normalizeGroupName(block[0]), breeds: [] };
      groups.push(currentGroup);
      block = block.slice(1);
      currentBreed = null;
    }

    if (!currentGroup) return;

    // Breed + Class block:
    // CAVALIER KING CHARLES SPANIEL
    // Class 2
    if (block.length >= 2 && isClassLine(block[1])) {
      const breedName = normalizeBreedName(block[0]);
      currentBreed = currentGroup.breeds.find(b => b.name.toLowerCase() === breedName.toLowerCase());
      if (!currentBreed) {
        currentBreed = { name: breedName, classes: [] };
        currentGroup.breeds.push(currentBreed);
      }
      block = block.slice(1);
    }

    // Class block:
    // Class 2
    // Dog - Owner
    if (!currentBreed || !isClassLine(block[0])) return;

    const className = cleanLine(block[0]);
    let cls = currentBreed.classes.find(c => c.name.toLowerCase() === className.toLowerCase());
    if (!cls) {
      cls = { name: className, entries: [] };
      currentBreed.classes.push(cls);
    }
    cls.entries.push(...block.slice(1));
  });

  return mergeConformationGroups(groups);
}
function filterTitled(groups, titleFilter) {
  return mergeConformationGroups(groups).map(g => ({
    name: g.name,
    breeds: g.breeds.map(b => ({
      name: b.name,
      classes: b.classes.map(c => ({
        name: c.name,
        entries: c.entries.filter(e => titleFilter === 'untitled' ? !hasTitle(e) : extractTitle(e) === titleFilter)
      })).filter(c => c.entries.length)
    })).filter(b => b.classes.length)
  })).filter(g => g.breeds.length);
}
function filterTitles(groups, titleFilters) {
  const allowed = new Set((titleFilters || []).map(t => String(t || '').toUpperCase()));
  return mergeConformationGroups(groups).map(g => ({
    name: g.name,
    breeds: g.breeds.map(b => ({
      name: b.name,
      classes: b.classes.map(c => ({
        name: c.name,
        entries: c.entries.filter(e => allowed.has(extractTitle(e)))
      })).filter(c => c.entries.length)
    })).filter(b => b.classes.length)
  })).filter(g => g.breeds.length);
}
function filterRare(groups) {
  return mergeConformationGroups(groups)
    .map(g => ({ name: g.name, breeds: g.breeds.filter(b => countBreedIndividuals(b) < 5) }))
    .filter(g => g.breeds.length);
}
function filterBreedSpecialty(groups) {
  const sections = [];
  mergeConformationGroups(groups).forEach(g => {
    g.breeds.forEach(b => {
      if (countBreedIndividuals(b) >= 5) {
        sections.push({
          name: b.name.toUpperCase(),
          breeds: [{ name: b.name, classes: b.classes }]
        });
      }
    });
  });
  return sections;
}
function conformationAward(recordList, showData, animal, placement, className) {
  // class_name should always be the animal's actual entered class.
  // Higher awards like Best of Breed / Best in Group / Best in Show are stored in placement.
  recordList.push({
    show_name: showData.showName,
    show_type: 'conformation',
    show_scope: getShowScope(showData.showType),
    class_name: className || 'Class 1',
    placement,
    animal_name: animal,
    points: SS_CONFIG.conformationPoints[placement] || SS_CONFIG.placementPoints[Number(placement)] || 0
  });
}
function pickFromCandidates(candidates) {
  return shuffle((candidates || []).filter(Boolean));
}
function judgeSexChallenge(sexClasses, reserveLabel) {
  const firstWinners = [];
  let singleClassReserve = null;

  (sexClasses || []).forEach(cls => {
    const entries = cls.entries || [];
    if (entries[0]) firstWinners.push({ name: entries[0], className: cls.name });
    if ((sexClasses || []).length === 1 && entries[1]) {
      singleClassReserve = { name: entries[1], className: cls.name };
    }
  });

  if (!firstWinners.length) return { challenge: null, reserve: null };

  const ranked = pickFromCandidates(firstWinners);
  const challenge = ranked[0] || null;

  // Multiple classes: reserve is selected from the other FIRST-place winners.
  // One class: reserve is the second-place animal from that class.
  let reserve = null;
  if (firstWinners.length > 1) reserve = ranked[1] || null;
  else reserve = singleClassReserve;

  return { challenge, reserve };
}
function recordClassPlacings(lines, records, showData, cls) {
  cls.entries = shuffle(cls.entries || []);
  addLine(lines, bold(cls.name));

  cls.entries.forEach((entry, i) => {
    expandTeamEntries(cls.name, entry).forEach(name => {
      addLine(lines, placementLabel(i + 1) + ' ' + name);
      conformationAward(records, showData, name, String(i + 1), cls.name);
    });
  });

  addLine(lines, '');
}
function judgeBreed(lines, records, showData, breed, options) {
  const settings = options || {};
  addLine(lines, bold(breed.name));

  sortConformationClasses(breed.classes);

  const maleClasses = [];
  const femaleClasses = [];

  breed.classes.forEach(cls => {
    recordClassPlacings(lines, records, showData, cls);
    if (isFemaleClass(cls.name)) femaleClasses.push(cls);
    else maleClasses.push(cls);
  });

  const male = judgeSexChallenge(maleClasses, 'Reserve Male Challenge');
  const female = judgeSexChallenge(femaleClasses, 'Reserve Female Challenge');

  breed.maleBest = male.challenge ? male.challenge.name : null;
  breed.maleBestClass = male.challenge ? male.challenge.className : null;
  breed.maleBestReserve = male.reserve ? male.reserve.name : null;
  breed.maleBestReserveClass = male.reserve ? male.reserve.className : null;
  breed.femaleBest = female.challenge ? female.challenge.name : null;
  breed.femaleBestClass = female.challenge ? female.challenge.className : null;
  breed.femaleBestReserve = female.reserve ? female.reserve.name : null;
  breed.femaleBestReserveClass = female.reserve ? female.reserve.className : null;

  const challengeCandidates = [];

  if (male.challenge) {
    challengeCandidates.push({ name: male.challenge.name, className: male.challenge.className, sex: 'male' });
    addLine(lines, bold('Male Challenge') + ': ' + male.challenge.name);
    conformationAward(records, showData, male.challenge.name, 'Male Challenge', male.challenge.className);
  }
  if (male.reserve) {
    addLine(lines, bold('Reserve Male Challenge') + ': ' + male.reserve.name);
    conformationAward(records, showData, male.reserve.name, 'Reserve Male Challenge', male.reserve.className);
  }

  if (female.challenge) {
    challengeCandidates.push({ name: female.challenge.name, className: female.challenge.className, sex: 'female' });
    addLine(lines, bold('Female Challenge') + ': ' + female.challenge.name);
    conformationAward(records, showData, female.challenge.name, 'Female Challenge', female.challenge.className);
  }
  if (female.reserve) {
    addLine(lines, bold('Reserve Female Challenge') + ': ' + female.reserve.name);
    conformationAward(records, showData, female.reserve.name, 'Reserve Female Challenge', female.reserve.className);
  }

  const rankedBreed = pickFromCandidates(challengeCandidates);
  breed.best = rankedBreed[0] ? rankedBreed[0].name : null;
  breed.bestClass = rankedBreed[0] ? rankedBreed[0].className : null;

  // Useful for breed specialties: reserve to BISS is the other challenge winner
  // when possible; otherwise the reserve challenge winner from the winning sex.
  let breedReserve = rankedBreed[1] ? rankedBreed[1].name : null;
  let breedReserveClass = rankedBreed[1] ? rankedBreed[1].className : null;

  if (!breedReserve && rankedBreed[0]) {
    if (rankedBreed[0].sex === 'male') {
      breedReserve = breed.maleBestReserve || breed.femaleBest || breed.femaleBestReserve || null;
      breedReserveClass = breed.maleBestReserveClass || breed.femaleBestClass || breed.femaleBestReserveClass || null;
    }
    if (rankedBreed[0].sex === 'female') {
      breedReserve = breed.femaleBestReserve || breed.maleBest || breed.maleBestReserve || null;
      breedReserveClass = breed.femaleBestReserveClass || breed.maleBestClass || breed.maleBestReserveClass || null;
    }
  }

  breed.reserve = breedReserve;
  breed.reserveClass = breedReserveClass;

  if (breed.best && !settings.suppressBestOfBreed) {
    addLine(lines, bold('Best of Breed') + ': ' + breed.best);
    conformationAward(records, showData, breed.best, 'Best of Breed', breed.bestClass);
  }

  addLine(lines, '');
  return breed.best ? { name: breed.best, breed, className: breed.bestClass } : null;
}
function judgeGroup(lines, records, showData, group, options) {
  const settings = options || {};
  addLine(lines, bold(group.name));
  addLine(lines, 'Breeds: ' + group.breeds.map(b => b.name).join(', '));
  addLine(lines, '');

  const breedWinners = [];

  group.breeds.forEach(breed => {
    const winner = judgeBreed(lines, records, showData, breed, settings);
    if (winner) breedWinners.push(winner);
  });

  const rankedGroup = pickFromCandidates(breedWinners);
  group.best = rankedGroup[0] ? rankedGroup[0].name : null;
  group.bestClass = rankedGroup[0] ? rankedGroup[0].className : null;
  group.reserve = rankedGroup[1] ? rankedGroup[1].name : null;
  group.reserveClass = rankedGroup[1] ? rankedGroup[1].className : null;

  // One-breed group/specialty fallback: reserve group/show comes from breed reserve.
  if (!group.reserve && group.breeds.length === 1) {
    group.reserve = group.breeds[0].reserve || null;
    group.reserveClass = group.breeds[0].reserveClass || null;
  }

  if (group.best && !settings.suppressGroupAwards) {
    addLine(lines, bold('Best in Group') + ': ' + group.best);
    conformationAward(records, showData, group.best, 'Best in Group', group.bestClass);
  }
  if (group.reserve && !settings.suppressGroupAwards) {
    addLine(lines, bold('Reserve Best in Group') + ': ' + group.reserve);
    conformationAward(records, showData, group.reserve, 'Reserve Best in Group', group.reserveClass);
  }

  addLine(lines, '');
  addLine(lines, '[hr]');
  addLine(lines, '');

  return group.best ? { name: group.best, group, className: group.bestClass } : null;
}
function runConformationGroups(groups, showData, options) {
  const settings = Object.assign({
    finals: 'all-breed' // all-breed, group-specialty, breed-specialty
  }, options || {});

  if (settings.finals === 'group-specialty') {
    settings.suppressGroupAwards = true;
  }
  if (settings.finals === 'breed-specialty') {
    settings.suppressBestOfBreed = true;
    settings.suppressGroupAwards = true;
  }

  groups = mergeConformationGroups(groups);

  const lines = [];
  const records = [];
  const groupWinners = [];

  groups.forEach(group => {
    const winner = judgeGroup(lines, records, showData, group, settings);
    if (winner) groupWinners.push(winner);
  });

  let bis = null;
  let bisClass = null;
  let rbis = null;
  let rbisClass = null;

  if (settings.finals === 'group-specialty' && groups.length === 1) {
    bis = groups[0].best || null;
    bisClass = groups[0].bestClass || null;
    rbis = groups[0].reserve || null;
    rbisClass = groups[0].reserveClass || null;
  } else if (settings.finals === 'breed-specialty' && groups.length === 1 && groups[0].breeds.length === 1) {
    bis = groups[0].breeds[0].best || groups[0].best || null;
    bisClass = groups[0].breeds[0].bestClass || groups[0].bestClass || null;
    rbis = groups[0].breeds[0].reserve || groups[0].reserve || null;
    rbisClass = groups[0].breeds[0].reserveClass || groups[0].reserveClass || null;
  } else {
    const rankedShow = pickFromCandidates(groupWinners);
    bis = rankedShow[0] ? rankedShow[0].name : null;
    bisClass = rankedShow[0] ? rankedShow[0].className : null;
    rbis = rankedShow[1] ? rankedShow[1].name : null;
    rbisClass = rankedShow[1] ? rankedShow[1].className : null;

    // If there is only one group in an all-breed style section, use RBIG as RBIS.
    if (!rbis && groups.length === 1) {
      rbis = groups[0].reserve || null;
      rbisClass = groups[0].reserveClass || null;
    }
  }

  const isSpecialtyFinal = settings.finals === 'group-specialty' || settings.finals === 'breed-specialty';
  const bestShowLabel = isSpecialtyFinal ? 'Best in Show Specialty' : 'Best in Show';
  const reserveShowLabel = isSpecialtyFinal ? 'Reserve Best in Show Specialty' : 'Reserve Best in Show';

  if (bis) {
    addLine(lines, bold(bestShowLabel) + ': ' + bis);
    conformationAward(records, showData, bis, bestShowLabel, bisClass);
  }
  if (rbis && rbis !== bis) {
    addLine(lines, bold(reserveShowLabel) + ': ' + rbis);
    conformationAward(records, showData, rbis, reserveShowLabel, rbisClass);
  }

  return { lines, records };
}
function runSeparateConformationShows(sections, showData, emptyMessage, finalsMode) {
  const allLines = [];
  const allRecords = [];
  if (!sections.length) throw new Error(emptyMessage || 'No eligible entries found for this show type.');

  sections.forEach((section, index) => {
    if (index > 0) {
      addLine(allLines, '');
      addLine(allLines, '[hr]');
      addLine(allLines, '');
    }

    const heading = finalsMode === 'group-specialty' ? section.name + ' GROUP SPECIALTY' : section.name + ' SPECIALTY';
    addLine(allLines, bold(heading));
    addLine(allLines, '');

    const result = runConformationGroups([section], showData, { finals: finalsMode || 'all-breed' });
    allLines.push(...result.lines);
    allRecords.push(...result.records);
  });

  return { lines: allLines, records: allRecords };
}
function buildTitleSpecialtySections(groups) {
  const titleCounts = SS_CONFIG.titleCodes.map(title => ({
    title,
    groups: filterTitled(groups, title)
  })).map(section => Object.assign(section, { count: countGroupIndividuals(section.groups) }))
    .filter(section => section.count > 0);

  const sections = [];
  let pendingTitles = [];
  let pendingCount = 0;

  titleCounts.forEach(section => {
    if (pendingTitles.length) {
      pendingTitles.push(section.title);
      pendingCount += section.count;
      if (pendingCount >= 5) {
        sections.push(pendingTitles.slice());
        pendingTitles = [];
        pendingCount = 0;
      }
      return;
    }

    if (section.count >= 5) sections.push([section.title]);
    else {
      pendingTitles = [section.title];
      pendingCount = section.count;
    }
  });

  if (pendingTitles.length) {
    if (sections.length) sections[sections.length - 1] = sections[sections.length - 1].concat(pendingTitles);
    else sections.push(pendingTitles);
  }

  return sections.map(titles => ({
    name: titles.join(' / ') + ' SHOW',
    groups: filterTitles(groups, titles),
    titles
  })).filter(section => countGroupIndividuals(section.groups) > 0);
}
function buildMajorChaseGroups(groups) {
  return mergeConformationGroups(groups).map(group => ({
    name: group.name,
    breeds: group.breeds.map(breed => {
      const males = [];
      const females = [];

      (breed.classes || []).forEach(cls => {
        const target = isFemaleClass(cls.name) ? females : males;
        target.push(...(cls.entries || []));
      });

      const classes = [];
      if (males.length) classes.push({ name: 'Class 5', entries: males });
      if (females.length) classes.push({ name: 'Class 5a', entries: females });

      return { name: breed.name, classes };
    }).filter(breed => breed.classes.length)
  })).filter(group => group.breeds.length);
}

function runConformation(rawData, showData) {
  const groups = mergeConformationGroups(parseConformation(rawData));
  if (!groups.length) throw new Error('No valid conformation groups found.');

  if (showData.showType === 'major-chase') {
    return runConformationGroups(buildMajorChaseGroups(groups), showData, { finals: 'all-breed' });
  }

  if (showData.showType === 'rare-breed') {
    const rareGroups = filterRare(groups);
    if (!rareGroups.length) throw new Error('No rare breeds found. Rare Breed shows only include breeds with fewer than 5 entries.');
    return runConformationGroups(rareGroups, showData, { finals: 'all-breed' });
  }

  if (showData.showType === 'breed-specialty') {
    return runSeparateConformationShows(
      filterBreedSpecialty(groups),
      showData,
      'No breed specialties found. Breed specialties require 5 or more entries in a breed.',
      'breed-specialty'
    );
  }

  if (showData.showType === 'group-specialty') {
    return runSeparateConformationShows(groups, showData, 'No group specialties found.', 'group-specialty');
  }

  if (showData.showType === 'untitled') {
    const untitledGroups = filterTitled(groups, 'untitled');
    if (!untitledGroups.length) throw new Error('No untitled animals found. Untitled shows only include entries without a recognized conformation title.');
    return runConformationGroups(untitledGroups, showData, { finals: 'all-breed' });
  }

  if (showData.showType === 'titled-basic') {
    const titledGroups = groups.map(g => ({
      name: g.name,
      breeds: g.breeds.map(b => ({
        name: b.name,
        classes: b.classes.map(c => ({ name: c.name, entries: c.entries.filter(hasTitle) })).filter(c => c.entries.length)
      })).filter(b => b.classes.length)
    })).filter(g => g.breeds.length);

    if (!titledGroups.length) throw new Error('No titled animals found. Titled shows only include entries with a recognized conformation title.');
    return runConformationGroups(titledGroups, showData, { finals: 'all-breed' });
  }

  if (showData.showType === 'titled-specific') {
    const sections = buildTitleSpecialtySections(groups);
    const allLines = [], allRecords = [];
    if (!sections.length) throw new Error('No titled animals found.');

    sections.forEach((section, index) => {
      if (index > 0) {
        addLine(allLines, '');
        addLine(allLines, '[hr]');
        addLine(allLines, '');
      }
      addLine(allLines, bold(section.name));
      addLine(allLines, '');
      const result = runConformationGroups(section.groups, showData, { finals: 'all-breed' });
      allLines.push(...result.lines);
      allRecords.push(...result.records);
    });

    return { lines: allLines, records: allRecords };
  }

  return runConformationGroups(groups, showData, { finals: 'all-breed' });
}




// =============================================================
// RANDOMIZER WORKSPACE TABS
// Each tab keeps its own form, entries, results and upload state
// until this page is refreshed or that tab is manually cleared.
// =============================================================
let activeRandomizerTab = 'conformation';

const randomizerWorkspaceState = {
  conformation: null,
  activities: null,
  specialty: null
};

// Each workspace can upload independently. The upload routine snapshots the
// originating tab's show data/records so switching tabs or starting another
// upload cannot overwrite an upload already in progress.
const randomizerUploadInProgress = {
  conformation: false,
  activities: false,
  specialty: false
};

const RANDOMIZER_TAB_DEFAULTS = {
  conformation: {
    species: 'dog',
    category: 'conformation',
    format: 'conformation',
    championshipMode: 'regular',
    activityKey: '__MIXED__',
    activityResultMethod: 'placement',
    maxScore: '100',
    herdingEventType: 'instinct'
  },
  activities: {
    species: 'dog',
    category: 'activities',
    format: 'divided',
    championshipMode: 'regular',
    activityKey: '__MIXED__',
    activityResultMethod: 'placement',
    maxScore: '100',
    herdingEventType: 'instinct'
  },
  specialty: {
    species: 'dog',
    category: 'herding',
    format: 'herding-club',
    championshipMode: 'regular',
    activityKey: '__MIXED__',
    activityResultMethod: 'placement',
    maxScore: '300',
    herdingEventType: 'instinct'
  }
};

function activeTabDefaults(tabName) {
  return Object.assign({}, RANDOMIZER_TAB_DEFAULTS[tabName] || RANDOMIZER_TAB_DEFAULTS.conformation);
}

function selectedChampionshipShowIdSet() {
  return selectedChampionshipShowIds();
}

function captureWorkspaceState() {
  const state = {
    species: $('showSpecies') ? $('showSpecies').value : 'dog',
    category: $('eventCategory') ? $('eventCategory').value : 'conformation',
    format: $('showFormat') ? $('showFormat').value : '',
    championshipMode: $('championshipMode') ? $('championshipMode').value : 'regular',
    activityKey: $('activityKey') ? $('activityKey').value : '__MIXED__',
    activityResultMethod: $('activityResultMethod') ? $('activityResultMethod').value : 'placement',
    maxScore: $('maxScore') ? $('maxScore').value : '100',
    herdingEventType: $('herdingEventType') ? $('herdingEventType').value : 'instinct',
    showName: $('showName') ? $('showName').value : '',
    bannerUrl: $('bannerUrl') ? $('bannerUrl').value : '',
    seriesName: $('seriesName') ? $('seriesName').value : '',
    seriesRound: $('seriesRound') ? $('seriesRound').value : '',
    rawData: $('rawData') ? $('rawData').value : '',
    championshipSeries: $('championshipSeries') ? $('championshipSeries').value : '',
    championshipQualification: $('championshipQualification') ? $('championshipQualification').value : '',
    championshipShowIds: selectedChampionshipShowIdSet(),
    championshipPreviewHtml: $('championshipPreview') ? $('championshipPreview').innerHTML : '',
    championshipPreviewClass: $('championshipPreview') ? $('championshipPreview').className : 'hidden',
    resultsHtml: $('resultsContainer') ? $('resultsContainer').innerHTML : '',
    resultsClass: $('resultsContainer') ? $('resultsContainer').className : 'hidden',
    messageHtml: $('ssMessages') ? $('ssMessages').innerHTML : '',
    messageClass: $('ssMessages') ? $('ssMessages').className : 'hidden',
    savedResults,
    savedShowData,
    savedRecords: Array.isArray(savedRecords) ? savedRecords.slice() : []
  };

  randomizerWorkspaceState[activeRandomizerTab] = state;
  return state;
}

function setWorkspaceUploadMessage(tabName, type, html) {
  const state = randomizerWorkspaceState[tabName];

  if (state) {
    state.messageHtml =
      '<div class="ss-message ss-message-' + type + '">' + html + '</div>';
    state.messageClass = 'ss-message-wrap';
  }

  // Only touch the visible message area when this upload belongs to the tab
  // the user is currently viewing.
  if (activeRandomizerTab === tabName) {
    showMessage(type, html);
  }
}

function resetVisibleWorkspace() {
  if ($('showName')) $('showName').value = '';
  if ($('bannerUrl')) $('bannerUrl').value = '';
  if ($('seriesName')) $('seriesName').value = '';
  if ($('seriesRound')) $('seriesRound').value = '';
  if ($('rawData')) $('rawData').value = '';

  if ($('championshipSeries')) $('championshipSeries').value = '';
  if ($('championshipShowList')) {
    $('championshipShowList').innerHTML = '<small>Select a source series to load its shows.</small>';
  }
  if ($('championshipPreview')) {
    $('championshipPreview').innerHTML = '';
    $('championshipPreview').className = 'hidden';
  }

  if ($('resultsContainer')) {
    $('resultsContainer').innerHTML = '';
    $('resultsContainer').className = 'hidden';
  }

  if ($('ssMessages')) {
    $('ssMessages').innerHTML = '';
    $('ssMessages').className = 'hidden';
  }

  savedResults = '';
  savedShowData = null;
  savedRecords = [];
}

function setEngineTabButtons(tabName) {
  document.querySelectorAll('.ss-engine-tab').forEach(button => {
    const active = button.dataset.engineTab === tabName;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
  });
}

function configureWorkspaceForTab(tabName) {
  const defaults = activeTabDefaults(tabName);

  if ($('eventCategory')) $('eventCategory').value = defaults.category;

  const kicker = $('engineKicker');
  const heading = $('engineHeading');
  const formatLabel = $('showFormatLabel');
  const formatHelp = $('showFormatHelp');
  const specialtyNote = $('specialtySystemNote');

  if (tabName === 'conformation') {
    if (kicker) kicker.textContent = 'Conformation';
    if (heading) heading.textContent = 'Build Your Conformation Show';
    if (formatLabel) formatLabel.textContent = 'Conformation Format';
    if (formatHelp) formatHelp.textContent = 'All Breed, Group or Breed Specialty, Rare Breed, Major Chase, Titled, or Untitled.';
    if (specialtyNote) specialtyNote.className = 'hidden';
  }

  if (tabName === 'activities') {
    if (kicker) kicker.textContent = 'Standard Activities';
    if (heading) heading.textContent = 'Build Your Activity Show';
    if (formatLabel) formatLabel.textContent = 'Activity Format';
    if (formatHelp) formatHelp.textContent = 'Standard activity points and titles use the same activity engine across all species.';
    if (specialtyNote) specialtyNote.className = 'hidden';
  }

  if (tabName === 'specialty') {
    if (kicker) kicker.textContent = 'Specialty / Associations';
    if (heading) heading.textContent = 'Build Your Specialty Event';
    if (formatLabel) formatLabel.textContent = 'Specialty System';
    if (formatHelp) formatHelp.textContent = 'Systems here have their own qualification, award, point, or title rules.';
    if (specialtyNote) specialtyNote.className = 'ss-specialty-note';
  }
}

async function restoreChampionshipSelections(state) {
  if (!state || state.championshipMode !== 'championship') return;

  await loadChampionshipSeries();

  if (state.championshipSeries && $('championshipSeries')) {
    $('championshipSeries').value = state.championshipSeries;
    await loadChampionshipShows();

    const selected = new Set((state.championshipShowIds || []).map(String));
    document.querySelectorAll('.ss-championship-show').forEach(box => {
      box.checked = selected.has(String(box.value));
    });
  }

  if (state.championshipQualification && $('championshipQualification')) {
    $('championshipQualification').value = state.championshipQualification;
  }

  if ($('championshipPreview')) {
    $('championshipPreview').innerHTML = state.championshipPreviewHtml || '';
    $('championshipPreview').className = state.championshipPreviewClass || 'hidden';
  }
}

async function restoreWorkspaceState(tabName) {
  const defaults = activeTabDefaults(tabName);
  const state = randomizerWorkspaceState[tabName] || defaults;

  resetVisibleWorkspace();
  configureWorkspaceForTab(tabName);

  if ($('showSpecies')) $('showSpecies').value = state.species || defaults.species;
  if ($('eventCategory')) $('eventCategory').value = defaults.category;
  if ($('championshipMode')) $('championshipMode').value = state.championshipMode || defaults.championshipMode;
  if ($('activityResultMethod')) $('activityResultMethod').value = state.activityResultMethod || defaults.activityResultMethod;
  if ($('maxScore')) $('maxScore').value = state.maxScore || defaults.maxScore;
  if ($('herdingEventType')) $('herdingEventType').value = state.herdingEventType || defaults.herdingEventType;

  renderShowFormatOptions();
  if ($('showFormat')) {
    const wantedFormat = state.format || defaults.format;
    const valid = [...$('showFormat').options].some(option => option.value === wantedFormat);
    if (valid) $('showFormat').value = wantedFormat;
  }

  if (tabName === 'activities') {
    await populateActivitySelector();
    if ($('activityKey')) {
      const wantedActivity = state.activityKey || defaults.activityKey;
      const valid = [...$('activityKey').options].some(option => option.value === wantedActivity);
      if (valid) $('activityKey').value = wantedActivity;
    }
  }

  if ($('showName')) $('showName').value = state.showName || '';
  if ($('bannerUrl')) $('bannerUrl').value = state.bannerUrl || '';
  if ($('seriesName')) $('seriesName').value = state.seriesName || '';
  if ($('seriesRound')) $('seriesRound').value = state.seriesRound || '';
  if ($('rawData')) $('rawData').value = state.rawData || '';

  savedResults = state.savedResults || '';
  savedShowData = state.savedShowData || null;
  savedRecords = Array.isArray(state.savedRecords) ? state.savedRecords.slice() : [];

  if ($('resultsContainer')) {
    $('resultsContainer').innerHTML = state.resultsHtml || '';
    $('resultsContainer').className = state.resultsClass || 'hidden';
  }

  if ($('ssMessages')) {
    $('ssMessages').innerHTML = state.messageHtml || '';
    $('ssMessages').className = state.messageClass || 'hidden';
  }

  // If this workspace has an upload still running in the background, keep its
  // restored Upload button disabled instead of making a second upload look safe.
  if (randomizerUploadInProgress[tabName]) {
    const restoredUploadButton = $('uploadButton');
    if (restoredUploadButton) {
      restoredUploadButton.disabled = true;
      restoredUploadButton.textContent = '⏳ Uploading...';
    }
  }

  updatePhase1UI();
  await restoreChampionshipSelections(state);
  if (isEndurance) renderEnduranceControls();
  updateSetupSummary();
}

async function switchRandomizerTab(tabName) {
  if (!RANDOMIZER_TAB_DEFAULTS[tabName] || tabName === activeRandomizerTab) return;

  captureWorkspaceState();
  activeRandomizerTab = tabName;
  setEngineTabButtons(tabName);
  await restoreWorkspaceState(tabName);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// =============================================================
// PHASE 1 — GUIDED STANDARD SHOW SETUP
// =============================================================


const SS_HUNTING_FIELD_TESTS = {
  flushing: {
    label: 'Flushing',
    code: 'Fl',
    specializations: {
      pheasant: { label:'Pheasant', code:'p' },
      grouse: { label:'Grouse', code:'g' },
      woodcock: { label:'Woodcock', code:'w' },
      quail: { label:'Quail', code:'q' },
      rabbit: { label:'Rabbit', code:'r' }
    },
    categories: ['Search & Quartering','Scent & Quarry Location','Flush Quality','Steadiness','Handler Cooperation']
  },
  retrieving: {
    label: 'Retrieving',
    code: 'Rt',
    specializations: {
      duck: { label:'Duck', code:'d' },
      goose: { label:'Goose', code:'g' },
      pheasant: { label:'Pheasant', code:'p' },
      grouse: { label:'Grouse', code:'gr' }
    },
    categories: ['Marking','Search & Location','Pick-up / Retrieve','Delivery','Handler Cooperation']
  },
  trailing: {
    label: 'Scent / Trailing',
    code: 'Tr',
    specializations: {
      rabbit: { label:'Rabbit', code:'r' },
      hare: { label:'Hare', code:'h' },
      fox: { label:'Fox', code:'f' },
      deer: { label:'Deer', code:'d' }
    },
    categories: ['Scent Acquisition','Line Accuracy','Persistence','Loss & Reacquisition','Final Indication']
  },
  treeing_baying: {
    label: 'Treeing / Baying',
    code: 'TB',
    specializations: {
      raccoon: { label:'Raccoon', code:'r' },
      squirrel: { label:'Squirrel', code:'s' },
      boar: { label:'Boar', code:'bo' },
      bear: { label:'Bear', code:'br' },
      cougar: { label:'Cougar', code:'c' }
    },
    categories: ['Search & Tracking','Quarry Location','Tree / Bay Work','Persistence','Control']
  },
  ratting: {
    label: 'Ratting',
    code: 'Rat',
    specializations: {
      barn: { label:'Barn', code:'b' },
      farmyard: { label:'Farmyard', code:'f' },
      stack_den: { label:'Stack / Den', code:'s' },
      urban: { label:'Urban', code:'u' }
    },
    categories: ['Search Pattern','Scent / Location','Indication','Agility / Problem Solving','Control']
  },
  versatile: {
    label: 'Versatile Hunting',
    code: 'VH',
    specializations: {
      upland: { label:'Upland', code:'u' },
      waterfowl: { label:'Waterfowl', code:'w' },
      woodland: { label:'Woodland', code:'f' },
      mixed_field: { label:'Mixed Field', code:'m' }
    },
    categories: ['Search','Scent / Tracking','Point / Flush Work','Retrieve','Handler Cooperation']
  },
  coursing: {
    label: 'Coursing',
    code: 'Co',
    specializations: {
      rabbit: { label:'Rabbit', code:'r' },
      hare: { label:'Hare', code:'h' },
      fox: { label:'Fox', code:'f' },
      coyote_jackal: { label:'Coyote / Jackal', code:'c' },
      deer_gazelle: { label:'Deer / Gazelle', code:'d' }
    },
    categories: ['Quarry Awareness','Pursuit / Line','Speed','Agility','Endurance']
  },
  falconry: {
    label: 'Falconry',
    code: 'Fa',
    specializations: {
      rabbit: { label:'Rabbit', code:'r' },
      hare: { label:'Hare', code:'h' },
      pheasant: { label:'Pheasant', code:'p' },
      grouse: { label:'Grouse', code:'g' },
      quail: { label:'Quail', code:'q' },
      waterfowl: { label:'Waterfowl', code:'w' }
    },
    categories: ['Search','Quarry Location','Flush / Point Work','Bird Cooperation / Steadiness','Handler Cooperation']
  },
  pack_hunting: {
    label: 'Pack Hunting',
    code: 'PH',
    specializations: {
      rabbit: { label:'Rabbit', code:'r' },
      hare: { label:'Hare', code:'h' },
      fox: { label:'Fox', code:'f' },
      coyote_jackal: { label:'Coyote / Jackal', code:'c' },
      boar: { label:'Boar', code:'b' },
      deer: { label:'Deer', code:'d' }
    },
    categories: ['Scent / Line Work','Pack Cooperation','Communication','Persistence','Control']
  },
  catch_dogs: {
    label: 'Catch Dogs',
    code: 'CD',
    specializations: {
      boar: { label:'Boar', code:'b' },
      feral_pig: { label:'Feral Pig', code:'p' },
      cattle: { label:'Cattle', code:'c' },
      bull: { label:'Bull', code:'bu' }
    },
    categories: ['Quarry Engagement','Hold / Control','Grip & Commitment','Handler Response','Safety & Stability']
  }
};

const SS_HUNTING_LEVELS = {
  beginners: { label:'Beginners', code:'B', passScore:110, categoryMinimum:15, titleQs:5 },
  expert: { label:'Expert', code:'E', passScore:130, categoryMinimum:20, titleQs:10, prerequisite:'beginners' },
  masters: { label:'Masters', code:'M', passScore:150, categoryMinimum:25, titleQs:15, prerequisite:'expert' }
};

const SS_HUNTING_TERRAINS = [
  'Open field','Pasture','Woodland','Dense brush','Marsh / wetland',
  'Rocky ground','Rolling country','Agricultural land'
];
const SS_HUNTING_WEATHER = [
  'Clear and calm','Light rain','Heavy rain','Moderate wind',
  'Hot and dry','Cold conditions','Recent rainfall'
];
const SS_HUNTING_SCENT = [
  'Fresh strong scent','Moderate scent','Broken scent',
  'Crossing scent','Old scent','Contaminated scent'
];
const SS_HUNTING_DISTRACTIONS = [
  'Light distraction','Wildlife distraction','Livestock nearby',
  'Other dogs working nearby','Human activity','Competing scent'
];
const SS_HUNTING_QUARRY_DIFFICULTY = [
  'Predictable quarry movement','Moving quarry','Evasive quarry',
  'Doubled-back trail','Multiple quarry scents','Difficult location'
];

const SS_SPECIALTY_SYSTEMS = [
  {
    key: 'herding_club',
    display_name: 'Herding Club',
    species: 'dog',
    active: true,
    title_system: true
  },
  {
    key: 'testing_system_dog',
    display_name: 'Temperament / Therapy / CGC Testing',
    species: 'dog',
    active: true,
    title_system: true
  },
  {
    key: 'hunting_club',
    display_name: 'Hunting Club',
    species: 'dog',
    active: true,
    title_system: true
  },
  {
    key: 'spaniel_club',
    display_name: 'Spaniel Club',
    species: 'dog',
    active: false,
    title_system: true
  },
  {
    key: 'testing_system_cat',
    display_name: 'Temperament / Therapy Testing',
    species: 'cat',
    active: true,
    title_system: true
  },
  {
    key: 'testing_system_horse',
    display_name: 'Temperament / Therapy Testing',
    species: 'horse',
    active: true,
    title_system: true
  },
  {
    key: 'icelandic_horse_club',
    display_name: 'Icelandic Horse Club',
    species: 'horse',
    active: true,
    title_system: true
  },
  {
    key: 'endurance_club',
    display_name: 'Endurance Club',
    species: 'horse',
    active: true,
    title_system: true
  }
];

function specialtySystemsForSpecies(species) {
  const selected = cleanLine(species).toLowerCase();
  return SS_SPECIALTY_SYSTEMS.filter(system => system.species === selected);
}

function renderSpecialtySystemOptions() {
  if (activeRandomizerTab !== 'specialty' || !$('showFormat')) return;

  // Preserve the user's currently selected specialty system when the UI
  // refreshes. Without this, rebuilding the <select> resets horse specialties
  // to the first option (Temperament / Therapy), even when Icelandic Horse
  // Club was selected. That made an IHASS 'breeding' event get routed into
  // the testing runner, which then crashed trying to read level.label from null.
  const previousSystem = $('showFormat').value;
  const species = $('showSpecies') ? $('showSpecies').value : 'dog';
  const systems = specialtySystemsForSpecies(species);

  const specialtyNote = $('specialtySystemNote');
  if (specialtyNote) {
    const names = systems.map(system =>
      system.display_name + (system.active ? '' : ' (Coming Next)')
    );

    specialtyNote.innerHTML =
      '<strong>Specialty / Association systems for ' +
      escapeHtml(species.charAt(0).toUpperCase() + species.slice(1)) +
      '</strong>' +
      '<span>' +
      (names.length ? escapeHtml(names.join(' • ')) : 'None configured yet.') +
      '</span>';
  }

  if (!systems.length) {
    $('showFormat').innerHTML =
      '<option value="">No specialty systems configured for this species yet</option>';
    return;
  }

  $('showFormat').innerHTML = systems.map(system =>
    '<option value="' + escapeHtml(system.key) + '">' +
    escapeHtml(system.display_name) +
    (system.active ? '' : ' — Coming Next') +
    '</option>'
  ).join('');

  const canRestorePrevious = systems.some(system => system.key === previousSystem);
  if (canRestorePrevious) {
    $('showFormat').value = previousSystem;
  } else if ($('showFormat').options.length) {
    $('showFormat').selectedIndex = 0;
  }
}

const SS_ENDURANCE_RACES = [{"key":"northern_circuit_polar_trek","name":"Polar Trek","circuit":"Northern Circuit","series":null,"grade":"III","conference":"Host Dependent","distance_km":850,"event_kind":"rated","requires_endurance_title":true},{"key":"northern_circuit_highland_challenge","name":"Highland Challenge","circuit":"Northern Circuit","series":null,"grade":"III","conference":"Western","distance_km":155,"event_kind":"rated","requires_endurance_title":true},{"key":"northern_circuit_viking_cup","name":"Viking Cup","circuit":"Northern Circuit","series":null,"grade":"III","conference":"Western","distance_km":165,"event_kind":"rated","requires_endurance_title":true},{"key":"northern_circuit_fjord_expedition","name":"Fjord Expedition","circuit":"Northern Circuit","series":null,"grade":"III","conference":"Western","distance_km":500,"event_kind":"rated","requires_endurance_title":true},{"key":"northern_circuit_siberian_plate","name":"Siberian Plate","circuit":"Northern Circuit","series":null,"grade":"I","conference":"Eastern","distance_km":1500,"event_kind":"rated","requires_endurance_title":true},{"key":"northern_circuit_baltic_challenge","name":"Baltic Challenge","circuit":"Northern Circuit","series":null,"grade":"III","conference":"Western","distance_km":350,"event_kind":"rated","requires_endurance_title":true},{"key":"northern_circuit_celtic_crossing","name":"Celtic Crossing","circuit":"Northern Circuit","series":null,"grade":"III","conference":"Western","distance_km":400,"event_kind":"rated","requires_endurance_title":true},{"key":"desert_circuit_saudi_cup","name":"Saudi Cup","circuit":"Desert Circuit","series":null,"grade":"III","conference":"Eastern","distance_km":550,"event_kind":"rated","requires_endurance_title":true},{"key":"desert_circuit_marathon_des_sables","name":"Marathon des Sables","circuit":"Desert Circuit","series":null,"grade":"III","conference":"Western","distance_km":260,"event_kind":"rated","requires_endurance_title":true},{"key":"desert_circuit_atlas_challenge","name":"Atlas Challenge","circuit":"Desert Circuit","series":null,"grade":"II","conference":"Western","distance_km":750,"event_kind":"rated","requires_endurance_title":true},{"key":"desert_circuit_nile_expedition","name":"Nile Expedition","circuit":"Desert Circuit","series":null,"grade":"II","conference":"Eastern","distance_km":850,"event_kind":"rated","requires_endurance_title":true},{"key":"desert_circuit_dubai_crown_prince_conference","name":"Dubai Crown Prince Conference","circuit":"Desert Circuit","series":null,"grade":"II","conference":"Eastern","distance_km":150,"event_kind":"rated","requires_endurance_title":true},{"key":"desert_circuit_karakum_crossing","name":"Karakum Crossing","circuit":"Desert Circuit","series":null,"grade":"II","conference":"Eastern","distance_km":650,"event_kind":"rated","requires_endurance_title":true},{"key":"desert_circuit_wadi_rum_challenge","name":"Wadi Rum Challenge","circuit":"Desert Circuit","series":null,"grade":"II","conference":"Eastern","distance_km":500,"event_kind":"rated","requires_endurance_title":true},{"key":"steppe_circuit_mongol_derby","name":"Mongol Derby","circuit":"Steppe Circuit","series":null,"grade":"II","conference":"Eastern","distance_km":1000,"event_kind":"rated","requires_endurance_title":true},{"key":"steppe_circuit_turkmen_s_plate","name":"Turkmen’s Plate","circuit":"Steppe Circuit","series":null,"grade":"III","conference":"Eastern","distance_km":250,"event_kind":"rated","requires_endurance_title":true},{"key":"steppe_circuit_silk_road_classic","name":"Silk Road Classic","circuit":"Steppe Circuit","series":null,"grade":"III","conference":"Eastern","distance_km":700,"event_kind":"rated","requires_endurance_title":true},{"key":"steppe_circuit_eurasia_challenge","name":"Eurasia Challenge","circuit":"Steppe Circuit","series":null,"grade":"I","conference":"Both","distance_km":4000,"event_kind":"rated","requires_endurance_title":true},{"key":"steppe_circuit_dragon_trail","name":"Dragon Trail","circuit":"Steppe Circuit","series":null,"grade":"II","conference":"Eastern","distance_km":900,"event_kind":"rated","requires_endurance_title":true},{"key":"steppe_circuit_altai_eagle_ride","name":"Altai Eagle Ride","circuit":"Steppe Circuit","series":null,"grade":"II","conference":"Eastern","distance_km":900,"event_kind":"rated","requires_endurance_title":true},{"key":"steppe_circuit_kazakh_eagle_cup","name":"Kazakh Eagle Cup","circuit":"Steppe Circuit","series":null,"grade":"II","conference":"Eastern","distance_km":800,"event_kind":"rated","requires_endurance_title":true},{"key":"north_american_frontier_circuit_new_year_s_cup","name":"New Year’s Cup","circuit":"North American Frontier Circuit","series":null,"grade":"III","conference":"Western","distance_km":300,"event_kind":"rated","requires_endurance_title":true},{"key":"north_american_frontier_circuit_tevis_cup","name":"Tevis Cup","circuit":"North American Frontier Circuit","series":null,"grade":"II","conference":"Western","distance_km":100,"event_kind":"rated","requires_endurance_title":true},{"key":"north_american_frontier_circuit_continental_divide","name":"Continental Divide","circuit":"North American Frontier Circuit","series":null,"grade":"I","conference":"Western","distance_km":5000,"event_kind":"rated","requires_endurance_title":true},{"key":"north_american_frontier_circuit_yukon_gold_rush","name":"Yukon Gold Rush","circuit":"North American Frontier Circuit","series":null,"grade":"II","conference":"Western","distance_km":950,"event_kind":"rated","requires_endurance_title":true},{"key":"north_american_frontier_circuit_route_66_classic","name":"Route 66 Classic","circuit":"North American Frontier Circuit","series":null,"grade":"III","conference":"Western","distance_km":500,"event_kind":"rated","requires_endurance_title":true},{"key":"north_american_frontier_circuit_maya_mountain_challenge","name":"Maya Mountain Challenge","circuit":"North American Frontier Circuit","series":null,"grade":"III","conference":"Western","distance_km":450,"event_kind":"rated","requires_endurance_title":true},{"key":"north_american_frontier_circuit_volc_n_trail_classic","name":"Volcán Trail Classic","circuit":"North American Frontier Circuit","series":null,"grade":"II","conference":"Western","distance_km":600,"event_kind":"rated","requires_endurance_title":true},{"key":"south_american_circuit_gaucho_derby","name":"Gaucho Derby","circuit":"South American Circuit","series":null,"grade":"II","conference":"Western","distance_km":500,"event_kind":"rated","requires_endurance_title":true},{"key":"south_american_circuit_pampas_classic","name":"Pampas Classic","circuit":"South American Circuit","series":null,"grade":"III","conference":"Western","distance_km":450,"event_kind":"rated","requires_endurance_title":true},{"key":"south_american_circuit_andes_crossing","name":"Andes Crossing","circuit":"South American Circuit","series":null,"grade":"II","conference":"Western","distance_km":650,"event_kind":"rated","requires_endurance_title":true},{"key":"south_american_circuit_amazon_basin_trek","name":"Amazon Basin Trek","circuit":"South American Circuit","series":null,"grade":"II","conference":"Western","distance_km":700,"event_kind":"rated","requires_endurance_title":true},{"key":"south_american_circuit_atacama_crossing","name":"Atacama Crossing","circuit":"South American Circuit","series":null,"grade":"II","conference":"Western","distance_km":500,"event_kind":"rated","requires_endurance_title":true},{"key":"south_american_circuit_inca_trail_endurance","name":"Inca Trail Endurance","circuit":"South American Circuit","series":null,"grade":"II","conference":"Western","distance_km":700,"event_kind":"rated","requires_endurance_title":true},{"key":"south_american_circuit_pantanal_expedition","name":"Pantanal Expedition","circuit":"South American Circuit","series":null,"grade":"II","conference":"Western","distance_km":550,"event_kind":"rated","requires_endurance_title":true},{"key":"oceania_circuit_outback_challenge","name":"Outback Challenge","circuit":"Oceania Circuit","series":null,"grade":"I","conference":"Eastern","distance_km":2600,"event_kind":"rated","requires_endurance_title":true},{"key":"oceania_circuit_great_barrier_trek","name":"Great Barrier Trek","circuit":"Oceania Circuit","series":null,"grade":"II","conference":"Eastern","distance_km":900,"event_kind":"rated","requires_endurance_title":true},{"key":"oceania_circuit_tasman_trail_classic","name":"Tasman Trail Classic","circuit":"Oceania Circuit","series":null,"grade":"III","conference":"Eastern","distance_km":500,"event_kind":"rated","requires_endurance_title":true},{"key":"oceania_circuit_southern_alps_ride","name":"Southern Alps Ride","circuit":"Oceania Circuit","series":null,"grade":"II","conference":"Eastern","distance_km":750,"event_kind":"rated","requires_endurance_title":true},{"key":"oceania_circuit_coral_coast_challenge","name":"Coral Coast Challenge","circuit":"Oceania Circuit","series":null,"grade":"III","conference":"Eastern","distance_km":350,"event_kind":"rated","requires_endurance_title":true},{"key":"oceania_circuit_kimberley_expedition","name":"Kimberley Expedition","circuit":"Oceania Circuit","series":null,"grade":"II","conference":"Eastern","distance_km":800,"event_kind":"rated","requires_endurance_title":true},{"key":"oceania_circuit_southern_ocean_run","name":"Southern Ocean Run","circuit":"Oceania Circuit","series":null,"grade":"II","conference":"Eastern","distance_km":550,"event_kind":"rated","requires_endurance_title":true},{"key":"african_circuit_great_rift_challenge","name":"Great Rift Challenge","circuit":"African Circuit","series":null,"grade":"III","conference":"Eastern","distance_km":450,"event_kind":"rated","requires_endurance_title":true},{"key":"african_circuit_serengeti_trek","name":"Serengeti Trek","circuit":"African Circuit","series":null,"grade":"II","conference":"Eastern","distance_km":700,"event_kind":"rated","requires_endurance_title":true},{"key":"african_circuit_kalahari_classic","name":"Kalahari Classic","circuit":"African Circuit","series":null,"grade":"II","conference":"Eastern","distance_km":600,"event_kind":"rated","requires_endurance_title":true},{"key":"african_circuit_okavango_challenge","name":"Okavango Challenge","circuit":"African Circuit","series":null,"grade":"II","conference":"Eastern","distance_km":500,"event_kind":"rated","requires_endurance_title":true},{"key":"african_circuit_cape_frontier_ride","name":"Cape Frontier Ride","circuit":"African Circuit","series":null,"grade":"II","conference":"Host Dependent","distance_km":650,"event_kind":"rated","requires_endurance_title":true},{"key":"african_circuit_drakensberg_traverse","name":"Drakensberg Traverse","circuit":"African Circuit","series":null,"grade":"I","conference":"Host Dependent","distance_km":800,"event_kind":"rated","requires_endurance_title":true},{"key":"african_circuit_kilimanjaro_challenge","name":"Kilimanjaro Challenge","circuit":"African Circuit","series":null,"grade":"II","conference":"Eastern","distance_km":750,"event_kind":"rated","requires_endurance_title":true},{"key":"mediterranean_circuit_aegean_odyssey","name":"Aegean Odyssey","circuit":"Mediterranean Circuit","series":null,"grade":"II","conference":"Western","distance_km":500,"event_kind":"rated","requires_endurance_title":true},{"key":"mediterranean_circuit_adriatic_classic","name":"Adriatic Classic","circuit":"Mediterranean Circuit","series":null,"grade":"III","conference":"Western","distance_km":450,"event_kind":"rated","requires_endurance_title":true},{"key":"mediterranean_circuit_sicilian_volcano_run","name":"Sicilian Volcano Run","circuit":"Mediterranean Circuit","series":null,"grade":"III","conference":"Western","distance_km":400,"event_kind":"rated","requires_endurance_title":true},{"key":"mediterranean_circuit_iberian_coast_challenge","name":"Iberian Coast Challenge","circuit":"Mediterranean Circuit","series":null,"grade":"II","conference":"Western","distance_km":650,"event_kind":"rated","requires_endurance_title":true},{"key":"mediterranean_circuit_cyprus_crossing","name":"Cyprus Crossing","circuit":"Mediterranean Circuit","series":null,"grade":"III","conference":"Host Dependent","distance_km":300,"event_kind":"rated","requires_endurance_title":true},{"key":"mediterranean_circuit_amalfi_coast_classic","name":"Amalfi Coast Classic","circuit":"Mediterranean Circuit","series":null,"grade":"II","conference":"Western","distance_km":450,"event_kind":"rated","requires_endurance_title":true},{"key":"mediterranean_circuit_dalmatian_coast_ride","name":"Dalmatian Coast Ride","circuit":"Mediterranean Circuit","series":null,"grade":"II","conference":"Western","distance_km":500,"event_kind":"rated","requires_endurance_title":true},{"key":"southeast_asia_circuit_mekong_expedition","name":"Mekong Expedition","circuit":"Southeast Asia Circuit","series":null,"grade":"II","conference":"Eastern","distance_km":700,"event_kind":"rated","requires_endurance_title":true},{"key":"southeast_asia_circuit_emerald_jungle_challenge","name":"Emerald Jungle Challenge","circuit":"Southeast Asia Circuit","series":null,"grade":"III","conference":"Eastern","distance_km":500,"event_kind":"rated","requires_endurance_title":true},{"key":"southeast_asia_circuit_borneo_rainforest_run","name":"Borneo Rainforest Run","circuit":"Southeast Asia Circuit","series":null,"grade":"III","conference":"Eastern","distance_km":450,"event_kind":"rated","requires_endurance_title":true},{"key":"southeast_asia_circuit_island_kingdom_classic","name":"Island Kingdom Classic","circuit":"Southeast Asia Circuit","series":null,"grade":"III","conference":"Eastern","distance_km":400,"event_kind":"rated","requires_endurance_title":true},{"key":"southeast_asia_circuit_dragon_s_peninsula_trek","name":"Dragon’s Peninsula Trek","circuit":"Southeast Asia Circuit","series":null,"grade":"II","conference":"Eastern","distance_km":650,"event_kind":"rated","requires_endurance_title":true},{"key":"southeast_asia_circuit_angkor_heritage_ride","name":"Angkor Heritage Ride","circuit":"Southeast Asia Circuit","series":null,"grade":"II","conference":"Eastern","distance_km":500,"event_kind":"rated","requires_endurance_title":true},{"key":"southeast_asia_circuit_java_volcano_challenge","name":"Java Volcano Challenge","circuit":"Southeast Asia Circuit","series":null,"grade":"II","conference":"Eastern","distance_km":600,"event_kind":"rated","requires_endurance_title":true},{"key":"world_gemstone_tour_the_ruby","name":"The Ruby","circuit":"World Tour","series":"gemstone","grade":"II","conference":"Western","distance_km":1000,"event_kind":"rated","requires_endurance_title":true},{"key":"world_gemstone_tour_the_opal","name":"The Opal","circuit":"World Tour","series":"gemstone","grade":"II","conference":"Eastern","distance_km":500,"event_kind":"rated","requires_endurance_title":true},{"key":"world_gemstone_tour_the_emerald","name":"The Emerald","circuit":"World Tour","series":"gemstone","grade":"II","conference":"Western","distance_km":500,"event_kind":"rated","requires_endurance_title":true},{"key":"world_gemstone_tour_the_sapphire","name":"The Sapphire","circuit":"World Tour","series":"gemstone","grade":"II","conference":"Eastern","distance_km":1000,"event_kind":"rated","requires_endurance_title":true},{"key":"world_gemstone_tour_the_pearl","name":"The Pearl","circuit":"World Tour","series":"gemstone","grade":"II","conference":"Eastern","distance_km":1100,"event_kind":"rated","requires_endurance_title":true},{"key":"world_gemstone_tour_the_diamond","name":"The Diamond","circuit":"World Tour","series":"gemstone","grade":"II","conference":"Western","distance_km":1000,"event_kind":"rated","requires_endurance_title":true},{"key":"world_crystal_tour_the_quartz","name":"The Quartz","circuit":"World Tour","series":"crystal","grade":null,"conference":"Western","distance_km":250,"event_kind":"world_tour","requires_endurance_title":false},{"key":"world_crystal_tour_the_jade","name":"The Jade","circuit":"World Tour","series":"crystal","grade":null,"conference":"Eastern","distance_km":300,"event_kind":"world_tour","requires_endurance_title":false},{"key":"world_crystal_tour_the_amber","name":"The Amber","circuit":"World Tour","series":"crystal","grade":null,"conference":"Western","distance_km":250,"event_kind":"world_tour","requires_endurance_title":false},{"key":"world_crystal_tour_the_garnet","name":"The Garnet","circuit":"World Tour","series":"crystal","grade":null,"conference":"Western","distance_km":300,"event_kind":"world_tour","requires_endurance_title":false},{"key":"world_crystal_tour_the_onyx","name":"The Onyx","circuit":"World Tour","series":"crystal","grade":null,"conference":"Eastern","distance_km":300,"event_kind":"world_tour","requires_endurance_title":false},{"key":"world_crystal_tour_the_topaz","name":"The Topaz","circuit":"World Tour","series":"crystal","grade":null,"conference":"Eastern","distance_km":250,"event_kind":"world_tour","requires_endurance_title":false},{"key":"world_tour_amazing_race","name":"The Amazing Race","circuit":"World Tour","series":"amazing_race","grade":null,"conference":"Host Dependent","distance_km":1200,"event_kind":"team","requires_endurance_title":false},{"key":"world_the_western_finals","name":"The Western Finals","circuit":"World Tour","series":"conference_final","grade":"INV","conference":"Western","distance_km":1000,"event_kind":"invitational","requires_endurance_title":false,"qualification_text":"Winner of any Western stakes race"},{"key":"world_the_eastern_challenge","name":"The Eastern Challenge","circuit":"World Tour","series":"conference_final","grade":"INV","conference":"Eastern","distance_km":1000,"event_kind":"invitational","requires_endurance_title":false,"qualification_text":"Winner of any Eastern stakes race"},{"key":"world_the_invitational","name":"The Invitational","circuit":"World Tour","series":"invitational","grade":"INV","conference":"International","distance_km":1500,"event_kind":"invitational","requires_endurance_title":false,"qualification_text":"Grade I/II stakes winner, top three in either final, ENO title, or full series winner"}];

const SS_PHASE1_FORMATS = {
  conformation: [
    ['conformation', 'All Breed Shows'],
    ['group-specialty', 'Group Specialties'],
    ['breed-specialty', 'Breed Specialties'],
    ['rare-breed', 'Rare Breed Shows'],
    ['major-chase', 'Major Chase Shows'],
    ['titled-specific', 'Titled Shows'],
    ['untitled', 'Untitled Shows']
  ],
  activities: [
    ['divided', 'Activities — Divided'],
    ['undivided', 'Activities — Undivided'],
    ['divided-bif', 'Activities — Divided + Best in Field'],
    ['undivided-bif', 'Activities — Undivided + Best in Field']
  ],
  herding: [
    ['herding-club', 'Herding Club']
  ]
};

function selectedEventCategory() {
  return $('eventCategory') ? $('eventCategory').value : 'conformation';
}


function selectedChampionshipMode() {
  return $('championshipMode') ? $('championshipMode').value : 'regular';
}

function currentShowKind() {
  return selectedEventCategory() === 'activities' ? 'activity' : 'conformation';
}

function resolveLegacyShowType() {
  const category = selectedEventCategory();

  if (activeRandomizerTab === 'specialty') {
    const system = $('showFormat') ? $('showFormat').value : 'herding_club';
    if (system === 'herding_club') return 'herding-club';
    return 'specialty-' + system.replace(/_/g, '-');
  }

  if (category === 'conformation') {
    if (selectedChampionshipMode() === 'championship') return 'championship';
    return $('showFormat').value || 'conformation';
  }

  const format = $('showFormat').value || 'divided';
  const scored = $('activityResultMethod') && $('activityResultMethod').value === 'scored';
  const championship = selectedChampionshipMode() === 'championship';

  let type = 'activity';
  if (championship) type += '-championship';
  if (scored) type += '-scored';
  if (format.includes('bif')) type += '-best-in-field';
  if (format.includes('undivided')) type += '-no-division';

  return type;
}

function renderShowFormatOptions() {
  const select = $('showFormat');
  if (!select) return;

  if (activeRandomizerTab === 'specialty') {
    renderSpecialtySystemOptions();
    return;
  }

  const category = selectedEventCategory();
  const previous = select.value;
  const formats = SS_PHASE1_FORMATS[category] || [];

  select.innerHTML = formats
    .map(([value, label]) =>
      '<option value="' + escapeHtml(value) + '">' + escapeHtml(label) + '</option>'
    )
    .join('');

  const validPrevious = formats.some(([value]) => value === previous);
  select.value = validPrevious
    ? previous
    : (formats[0] ? formats[0][0] : '');

  if (select.selectedIndex < 0 && select.options.length) {
    select.selectedIndex = 0;
  }
}

function setChampionshipQualificationOptions() {
  const select = $('championshipQualification');
  if (!select) return;

  if (selectedEventCategory() === 'activities') {
    select.innerHTML = [
      ['first-place', 'First-place winners'],
      ['top-three', 'Top three placements'],
      ['any-placement', 'Any points placement'],
      ['best-in-field', 'Best in Field winners'],
      ['qualifying-score', 'Qualifying scores / passes'],
      ['all-entrants', 'All entrants from selected shows']
    ].map(([value, label]) =>
      '<option value="' + value + '">' + label + '</option>'
    ).join('');
  } else {
    select.innerHTML = [
      ['challenge-or-better', 'Challenge Winner or Better'],
      ['bob-or-better', 'Best of Breed or Better'],
      ['big-or-better', 'Best in Group or Better'],
      ['bis-only', 'Best in Show Winners Only'],
      ['bis-or-reserve', 'Best or Reserve Best in Show']
    ].map(([value, label], index) =>
      '<option value="' + value + '"' + (index === 1 ? ' selected' : '') + '>' + label + '</option>'
    ).join('');
  }
}



function ensureHuntingControls() {
  if (!$('herdingPanel') || $('huntingClubControls')) return;

  const wrapper = document.createElement('div');
  wrapper.id = 'huntingClubControls';
  wrapper.className = 'hidden';
  wrapper.innerHTML = `
    <div class="ss-field">
      <label>Field Test Family</label>
      <select id="huntingFamily"></select>
    </div>
    <div class="ss-field">
      <label>Quarry / Environment</label>
      <select id="huntingSpecialization"></select>
    </div>
    <div class="ss-field">
      <label>Test Level</label>
      <select id="huntingLevel">
        <option value="beginners">Beginners</option>
        <option value="expert">Expert</option>
        <option value="masters">Masters</option>
      </select>
      <small id="huntingLevelNote"></small>
    </div>
  `;

  $('herdingPanel').appendChild(wrapper);

  $('huntingFamily').addEventListener('change', () => {
    renderHuntingSpecializations();
    updateHuntingLevelNote();
    captureWorkspaceState();
  });
  $('huntingSpecialization').addEventListener('change', captureWorkspaceState);
  $('huntingLevel').addEventListener('change', () => {
    updateHuntingLevelNote();
    captureWorkspaceState();
  });
}

function renderHuntingControls() {
  ensureHuntingControls();
  const wrapper = $('huntingClubControls');
  if (!wrapper) return;

  const active =
    activeRandomizerTab === 'specialty' &&
    $('showFormat')?.value === 'hunting_club';

  wrapper.className = active ? '' : 'hidden';
  if (!active) return;

  const familySelect = $('huntingFamily');
  const previous = familySelect.value;

  familySelect.innerHTML = Object.entries(SS_HUNTING_FIELD_TESTS)
    .map(([key, value]) => `<option value="${key}">${escapeHtml(value.label)}</option>`)
    .join('');

  if ([...familySelect.options].some(option => option.value === previous)) {
    familySelect.value = previous;
  }

  renderHuntingSpecializations();
  updateHuntingLevelNote();
}

function renderHuntingSpecializations() {
  const family = SS_HUNTING_FIELD_TESTS[$('huntingFamily')?.value] || SS_HUNTING_FIELD_TESTS.flushing;
  const select = $('huntingSpecialization');
  if (!select) return;

  const previous = select.value;
  select.innerHTML = Object.entries(family.specializations)
    .map(([key, value]) => `<option value="${key}">${escapeHtml(value.label)}</option>`)
    .join('');

  if ([...select.options].some(option => option.value === previous)) {
    select.value = previous;
  }
}

function updateHuntingLevelNote() {
  const level = SS_HUNTING_LEVELS[$('huntingLevel')?.value] || SS_HUNTING_LEVELS.beginners;
  const note = $('huntingLevelNote');
  if (!note) return;

  note.textContent =
    level.label + ': ' + level.passScore + '/200 overall, minimum ' +
    level.categoryMinimum + '/40 in every category. ' +
    level.titleQs + ' qualifications earn the title.';
}

function relabelSpecialtyPanel(systemKey) {
  const panel = $('herdingPanel');
  if (!panel) return;

  const config = {
    herding_club: {
      title:'Herding Club',
      event:'Herding Event',
      help:'Run Instinct Tests or Stakes Classes using the Herding Club rules.'
    },
    testing_system_dog: {
      title:'Temperament / Therapy / CGC Testing',
      event:'Test Type',
      help:'Choose the test type, paste the entries, and run the test.'
    },
    testing_system_cat: {
      title:'Temperament / Therapy Testing',
      event:'Test Type',
      help:'Choose the test type, paste the entries, and run the test.'
    },
    testing_system_horse: {
      title:'Temperament / Therapy Testing',
      event:'Test Type',
      help:'Choose the test type, paste the entries, and run the test.'
    },
    icelandic_horse_club: {
      title:'Icelandic Horse Club',
      event:'IHASS Event',
      help:'Choose Halter, Gaiting, or Breeding Show.'
    },
    endurance_club: {
      title:'Endurance Club',
      event:'Endurance Event',
      help:'Choose Prospect Classes, Unrated Races, or a Rated Stakes / Circuit Race.'
    },
    hunting_club: {
      title:'Hunting Club',
      event:'Hunting Event',
      help:'Run zero-point working Field Tests with independent quarry / environment specializations.'
    }
  }[systemKey];

  if (!config) return;

  const heading = panel.querySelector('h2,h3,.ss-card-title,.ss-setup-title,.ss-section-title');
  if (heading) heading.textContent = config.title;

  const eventSelect = $('herdingEventType');
  if (eventSelect) {
    const label = panel.querySelector('label[for="herdingEventType"]') ||
      [...panel.querySelectorAll('label')].find(label => /herding event|event type|test type|ihass event|endurance event/i.test(label.textContent || ''));
    if (label) label.textContent = config.event;
  }

  const help = [...panel.querySelectorAll('small,.ss-help,.ss-field-help,.ss-note')]
    .find(node => /herding|instinct|stakes|specialty event|choose.*event/i.test(node.textContent || ''));
  if (help && !help.closest('#enduranceClubControls') && !help.closest('#huntingClubControls')) {
    help.textContent = config.help;
  }
}

function ensureEnduranceControls() {
  if (!$('herdingPanel') || $('enduranceClubControls')) return;

  const wrapper = document.createElement('div');
  wrapper.id = 'enduranceClubControls';
  wrapper.className = 'hidden';
  wrapper.innerHTML = `
    <div class="ss-field" id="enduranceRaceField">
      <label>Endurance Club Race</label>
      <select id="enduranceRaceKey"></select>
      <small id="enduranceRaceMeta">Select a rated race.</small>
    </div>

    <div class="ss-field" id="enduranceUnratedDistanceField">
      <label>Unrated Race Distance (km)</label>
      <input type="number" id="enduranceUnratedDistance" min="0" step="1" value="100">
      <small>Used for cumulative Endurance Club distance titles.</small>
    </div>

    <div class="ss-field">
      <label>Prize Money by Placement</label>
      <div style="display:grid;grid-template-columns:repeat(5,minmax(80px,1fr));gap:8px;">
        ${[1,2,3,4,5].map(place => `
          <label style="font-size:11px;">${place}${place===1?'st':place===2?'nd':place===3?'rd':'th'}
            <input type="number" id="endurancePrize${place}" min="0" step="1" value="0">
          </label>
        `).join('')}
      </div>
      <small>Enter the actual money won for each placing. These amounts are stored on each horse's record and are the only money counted toward EdHE / EdSpH / EdHOFE.</small>
    </div>
  `;

  $('herdingPanel').appendChild(wrapper);

  $('enduranceRaceKey').addEventListener('change', updateEnduranceRaceMeta);
  $('herdingEventType').addEventListener('change', renderEnduranceControls);
}

function renderEnduranceControls() {
  ensureEnduranceControls();

  const wrapper = $('enduranceClubControls');
  if (!wrapper) return;

  const active =
    activeRandomizerTab === 'specialty' &&
    $('showFormat')?.value === 'endurance_club';

  wrapper.className = active ? '' : 'hidden';
  if (!active) return;

  const mode = $('herdingEventType')?.value || 'prospect';
  $('enduranceRaceField').className = mode === 'rated' ? 'ss-field' : 'hidden';
  $('enduranceUnratedDistanceField').className = mode === 'unrated' ? 'ss-field' : 'hidden';

  const raceSelect = $('enduranceRaceKey');
  if (raceSelect && mode === 'rated') {
    const previous = raceSelect.value;
    const groups = {};

    SS_ENDURANCE_RACES.forEach(race => {
      const group = race.circuit || 'Other';
      if (!groups[group]) groups[group] = [];
      groups[group].push(race);
    });

    raceSelect.innerHTML = Object.keys(groups).map(group => {
      const options = groups[group].map(race =>
        '<option value="' + escapeHtml(race.key) + '">' +
        escapeHtml(race.name) +
        (race.grade ? ' — Grade ' + escapeHtml(race.grade) : '') +
        '</option>'
      ).join('');

      return '<optgroup label="' + escapeHtml(group) + '">' + options + '</optgroup>';
    }).join('');

    if ([...raceSelect.options].some(option => option.value === previous)) {
      raceSelect.value = previous;
    }

    updateEnduranceRaceMeta();
  }
}

function updateEnduranceRaceMeta() {
  const race = SS_ENDURANCE_RACES.find(row => row.key === $('enduranceRaceKey')?.value);
  const meta = $('enduranceRaceMeta');
  if (!meta) return;

  if (!race) {
    meta.textContent = 'Select a rated race.';
    return;
  }

  const bits = [];
  if (race.grade) bits.push('Grade ' + race.grade);
  if (race.distance_km) bits.push(race.distance_km + ' km');
  if (race.conference) bits.push(race.conference);
  if (race.series) bits.push(race.series.replace(/_/g,' '));
  const grade = String(race.grade || '').toUpperCase().trim();
  if (grade === 'II') bits.push('Requires EnN+');
  if (grade === 'I') bits.push('Requires EnJ+');
  if (grade === 'III') bits.push('No title required');

  meta.textContent = bits.join(' • ');
}

function endurancePrizeForPlace(place) {
  const el = $('endurancePrize' + place);
  const amount = Number(el ? el.value : 0);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function updatePhase1UI() {
  const category = selectedEventCategory();
  const isActivity = activeRandomizerTab === 'activities';
  const selectedSpecialtySystem =
    activeRandomizerTab === 'specialty' && $('showFormat')
      ? $('showFormat').value
      : null;
  const isHerding =
    activeRandomizerTab === 'specialty' &&
    selectedSpecialtySystem === 'herding_club';
  const isTesting =
    activeRandomizerTab === 'specialty' &&
    /^testing_system_/.test(selectedSpecialtySystem || '');
  const isIcelandic =
    activeRandomizerTab === 'specialty' &&
    selectedSpecialtySystem === 'icelandic_horse_club';
  const isEndurance =
    activeRandomizerTab === 'specialty' &&
    selectedSpecialtySystem === 'endurance_club';
  const isHunting =
    activeRandomizerTab === 'specialty' &&
    selectedSpecialtySystem === 'hunting_club';
  const isSpecialtyRunner = isHerding || isTesting || isIcelandic || isEndurance || isHunting;
  const isChampionship =
    selectedChampionshipMode() === 'championship' &&
    activeRandomizerTab !== 'specialty';

  renderShowFormatOptions();

  // Reuse the existing specialty event-type control so no HTML/CSS change is needed.
  if ($('herdingEventType')) {
    const select = $('herdingEventType');
    const current = select.value;

    if (isTesting) {
      const species = $('showSpecies') ? $('showSpecies').value : 'dog';
      const options = [
        ['temperament', 'Temperament Test'],
        ['therapy', 'Therapy Animal Test']
      ];
      if (species === 'dog') options.push(['cgc', 'Canine Good Citizen (CGC)']);

      select.innerHTML = options.map(([value,label]) =>
        '<option value="' + value + '">' + label + '</option>'
      ).join('');
      if ([...select.options].some(option => option.value === current)) select.value = current;
    } else if (isHerding) {
      select.innerHTML = [
        ['instinct', 'Instinct Testing'],
        ['stakes', 'Stakes Classes']
      ].map(([value,label]) =>
        '<option value="' + value + '">' + label + '</option>'
      ).join('');
      if ([...select.options].some(option => option.value === current)) select.value = current;
    } else if (isIcelandic) {
      select.innerHTML = [
        ['halter', 'IHASS Halter Show'],
        ['gaiting', 'IHASS Gaiting Show'],
        ['breeding', 'IHASS Breeding Show']
      ].map(([value,label]) =>
        '<option value="' + value + '">' + label + '</option>'
      ).join('');
      if ([...select.options].some(option => option.value === current)) select.value = current;
    } else if (isEndurance) {
      select.innerHTML = [
        ['prospect', 'Prospect Classes'],
        ['unrated', 'Unrated Stakes Races'],
        ['rated', 'Rated Stakes / Circuit Race']
      ].map(([value,label]) =>
        '<option value="' + value + '">' + label + '</option>'
      ).join('');
      if ([...select.options].some(option => option.value === current)) select.value = current;
      ensureEnduranceControls();
      renderEnduranceControls();
    } else if (isHunting) {
      select.innerHTML = '<option value="field_test">Hunting Field Test</option>';
      ensureHuntingControls();
      renderHuntingControls();
    }
  }

  const runButton = $('ssRunButton');
  if (runButton) {
    runButton.disabled = false;
    runButton.textContent = isSpecialtyRunner ? '🎲 Run Specialty Event' : '🎲 Randomize Show';
  }

  $('activityOptionsPanel').className = isActivity ? 'ss-setup-card' : 'hidden';
  $('herdingPanel').className = isSpecialtyRunner ? 'ss-setup-card' : 'hidden';
  if (isSpecialtyRunner) relabelSpecialtyPanel(selectedSpecialtySystem);
  if (isHunting) renderHuntingControls();
  $('championshipModeField').className = isSpecialtyRunner ? 'hidden' : 'ss-field';
  $('championshipPanel').className = isChampionship ? 'ss-championship-panel' : 'hidden';
  $('normalSeriesFields').className = isChampionship ? 'hidden' : 'ss-series-grid';
  $('entriesField').className = isChampionship ? 'hidden' : 'ss-field';
  $('sortButton').className = (isChampionship || isActivity || isSpecialtyRunner)
    ? 'hidden'
    : 'ss-button secondary full';
  $('maxScoreField').className =
    isActivity && $('activityResultMethod').value === 'scored'
      ? 'ss-field'
      : 'hidden';

  setChampionshipQualificationOptions();

  if (isChampionship) {
    loadChampionshipSeries();
  }

  if (isActivity) {
    populateActivitySelector();
  }

  updateSetupSummary();
}

function updateSetupSummary() {
  const tabLabel =
    activeRandomizerTab === 'conformation' ? 'Conformation' :
    activeRandomizerTab === 'activities' ? 'Standard Activities' :
    'Specialty';

  const species = $('showSpecies') ? $('showSpecies').selectedOptions[0]?.textContent : '';
  const format = $('showFormat') ? $('showFormat').selectedOptions[0]?.textContent : '';
  const mode = selectedChampionshipMode() === 'championship' && activeRandomizerTab !== 'specialty'
    ? 'Championship'
    : 'Regular';

  const parts = [tabLabel, species, format, mode].filter(Boolean);
  const el = $('setupSummary');
  if (el) el.textContent = parts.join(' • ');
}

// =============================================================
// 5. CHAMPIONSHIP SHOW MODULE
// =============================================================
const CHAMPIONSHIP_AWARD_SETS = {
  'challenge-or-better': new Set([
    'Male Challenge','Female Challenge',
    'Best of Breed',
    'Best in Group','Reserve Best in Group',
    'Best in Show','Reserve Best in Show',
    'Best in Show Specialty','Reserve Best in Show Specialty'
  ]),
  'bob-or-better': new Set([
    'Best of Breed',
    'Best in Group','Reserve Best in Group',
    'Best in Show','Reserve Best in Show',
    'Best in Show Specialty','Reserve Best in Show Specialty'
  ]),
  'big-or-better': new Set([
    'Best in Group','Reserve Best in Group',
    'Best in Show','Reserve Best in Show',
    'Best in Show Specialty','Reserve Best in Show Specialty'
  ]),
  'bis-only': new Set([
    'Best in Show','Best in Show Specialty'
  ]),
  'bis-or-reserve': new Set([
    'Best in Show','Reserve Best in Show',
    'Best in Show Specialty','Reserve Best in Show Specialty'
  ])
};

function selectedChampionshipShowIds() {
  return Array.from(document.querySelectorAll('.ss-championship-show:checked')).map(el => el.value);
}
function championshipAwardAllowed(placement, rule) {
  const allowed = CHAMPIONSHIP_AWARD_SETS[rule] || CHAMPIONSHIP_AWARD_SETS['bob-or-better'];
  return allowed.has(cleanLine(placement));
}
function formatSeriesShowLabel(show) {
  const round = show.series_round !== null && show.series_round !== undefined ? 'Round ' + show.series_round + ' — ' : '';
  const date = show.created_at ? String(show.created_at).slice(0, 10) : '';
  return round + (show.show_name || 'Unnamed Show') + (date ? ' (' + date + ')' : '');
}
async function loadChampionshipSeries() {
  const supabase = getSupabase();
  const select = $('championshipSeries');
  if (!supabase || !select) return;

  select.innerHTML = '<option value="">Loading series...</option>';
  const { data, error } = await supabase
    .from('show_uploads')
    .select('series_name')
    .not('series_name', 'is', null);

  if (error) {
    select.innerHTML = '<option value="">Could not load series</option>';
    showMessage('error', '<strong>Series load failed:</strong> ' + error.message);
    return;
  }

  championshipSeriesCache = [...new Set((data || []).map(row => cleanLine(row.series_name)).filter(Boolean))]
    .sort((a,b) => a.localeCompare(b));

  select.innerHTML = '<option value="">Select a series or saved shows</option>' +
    '<option value="__ALL_SAVED__">All Saved ' + (currentShowKind() === 'activity' ? 'Activity' : 'Conformation') + ' Shows</option>' +
    championshipSeriesCache.map(name => '<option value="' + escapeHtml(name) + '">' + escapeHtml(name) + '</option>').join('');

  if (!championshipSeriesCache.length) {
    $('championshipShowList').innerHTML = '<small>No named series have been saved yet. Choose “All Saved Shows” to select from existing uploads.</small>';
  }
}
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
async function loadChampionshipShows() {
  const supabase = getSupabase();
  const seriesName = cleanLine($('championshipSeries').value);
  const list = $('championshipShowList');
  championshipPreviewCache = null;
  $('championshipPreview').className = 'hidden';
  $('championshipPreview').innerHTML = '';

  if (!supabase || !seriesName) {
    championshipShowsCache = [];
    list.innerHTML = '<small>Select a series to load its shows.</small>';
    return;
  }

  list.innerHTML = '<small>Loading shows...</small>';
  let query = supabase
    .from('show_uploads')
    .select('id, show_name, series_name, series_round, show_type, show_scope, raw_text, created_at');

  if (seriesName !== '__ALL_SAVED__') {
    query = query.eq('series_name', seriesName);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    list.innerHTML = '<small>Could not load shows.</small>';
    showMessage('error', '<strong>Show load failed:</strong> ' + error.message);
    return;
  }

  const wantedKind = currentShowKind();
  championshipShowsCache = (data || []).filter(show =>
    String(show.show_scope || '').toLowerCase() !== 'championship' &&
    String(show.show_type || '').toLowerCase() === wantedKind
  );
  if (!championshipShowsCache.length) {
    list.innerHTML = '<small>No eligible source shows were found in this series.</small>';
    return;
  }

  list.innerHTML = championshipShowsCache.map(show =>
    '<label class="ss-source-show">' +
      '<input type="checkbox" class="ss-championship-show" value="' + escapeHtml(show.id) + '" checked>' +
      '<span>' + escapeHtml(formatSeriesShowLabel(show)) + '</span>' +
    '</label>'
  ).join('');
}
async function loadRecordsForShowIds(supabase, showIds, showKind) {
  const all = [];
  const chunkSize = 100;
  const kind = showKind || 'conformation';

  for (let i = 0; i < showIds.length; i += chunkSize) {
    const chunk = showIds.slice(i, i + chunkSize);

    let query = supabase
      .from('show_records')
      .select('upload_id, animal_id, placement, class, activity_key, score, max_score, passed, score_label')
      .in('upload_id', chunk)
      .eq('show_type', kind);

    let { data, error } = await query;

    if (error && /activity_key|score|max_score|passed|score_label|column/i.test(String(error.message || ''))) {
      const retry = await supabase
        .from('show_records')
        .select('upload_id, animal_id, placement, class')
        .in('upload_id', chunk)
        .eq('show_type', kind);

      data = retry.data;
      error = retry.error;
    }

    if (error) throw new Error('Qualifier record load failed: ' + error.message);
    all.push(...(data || []));
  }

  return all;
}
async function loadChampionshipAnimals(supabase, animalIds) {
  const animals = [];
  const chunkSize = 100;

  for (let i = 0; i < animalIds.length; i += chunkSize) {
    const chunk = animalIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('animals')
      .select('id, name, normalized_name, breed, owner, gender')
      .in('id', chunk);

    if (error) throw new Error('Qualifier animal load failed: ' + error.message);
    animals.push(...(data || []));
  }

  const map = new Map();
  animals.forEach(animal => map.set(String(animal.id), animal));
  return map;
}
function cleanChampionshipResultLine(line) {
  return cleanLine(line)
    .replace(/^\d+(?:st|nd|rd|th)?\s+/i, '')
    .replace(/^(?:Best in Show Specialty|Reserve Best in Show Specialty|Best in Show|Reserve Best in Show|Best in Group|Reserve Best in Group|Best of Breed|Male Challenge|Female Challenge|Reserve Male Challenge|Reserve Female Challenge)\s*:\s*/i, '')
    .trim();
}
function sourceLinesForShow(show) {
  return String(show && show.raw_text ? show.raw_text : '')
    .split(/\r?\n/)
    .map(cleanLine)
    .filter(Boolean);
}
function findDisplayedChampionshipEntry(animal, sourceShows, preferredUploadId) {
  const registryCandidates = [animal.name, animal.normalized_name]
    .map(normalizeNameForUpload)
    .filter(Boolean);

  const orderedShows = sourceShows.slice().sort((a, b) => {
    const ap = String(a.id) === String(preferredUploadId) ? 0 : 1;
    const bp = String(b.id) === String(preferredUploadId) ? 0 : 1;
    return ap - bp;
  });

  for (const show of orderedShows) {
    for (const rawLine of sourceLinesForShow(show)) {
      const candidate = cleanChampionshipResultLine(rawLine);
      if (!candidate || !/\s+-\s+/.test(candidate)) continue;
      const normalized = normalizeNameForUpload(stripEntryOwner(candidate));

      const matches = registryCandidates.some(registryName =>
        normalized === registryName ||
        normalized.startsWith(registryName + ' ') ||
        normalized.endsWith(' ' + registryName) ||
        normalized.includes(' ' + registryName + ' ')
      );

      if (matches) return candidate;
    }
  }

  const name = cleanLine(animal.name || animal.normalized_name || 'Unknown Animal');
  const owner = cleanLine(animal.owner || 'Unknown Owner');
  return name + ' - ' + owner;
}
function championshipHeadingText(value) {
  return cleanLine(String(value || '')
    .replace(/\[\/?b\]/gi, '')
    .replace(/\[\/?size(?:=[^\]]+)?\]/gi, '')
    .replace(/\[\/?center\]/gi, '')
    .replace(/\[\/?font(?:=[^\]]+)?\]/gi, '')
    .replace(/\[\/?color(?:=[^\]]+)?\]/gi, '')
  );
}
function buildBreedGroupLookup(sourceShows) {
  const lookup = new Map();
  const knownGroups = new Set(SS_CONFIG.groupOrder.map(normalizeGroupName));

  sourceShows.forEach(show => {
    let currentGroup = null;
    const rawLines = sourceLinesForShow(show);
    const lines = rawLines.map(championshipHeadingText);

    lines.forEach((line, index) => {
      const normalizedGroup = normalizeGroupName(line);
      if (knownGroups.has(normalizedGroup)) {
        currentGroup = normalizedGroup;
        return;
      }

      if (!currentGroup) return;

      const breedListMatch = line.match(/^Breeds:\s*(.+)$/i);
      if (breedListMatch) {
        breedListMatch[1].split(',').map(normalizeBreedName).filter(Boolean).forEach(breed => {
          if (!lookup.has(breed.toLowerCase())) lookup.set(breed.toLowerCase(), currentGroup);
        });
        return;
      }

      // Breed headings in stored BBCode result text are followed by a Class line.
      const next = lines[index + 1] || '';
      if (isClassLine(next)) {
        const breed = normalizeBreedName(line);
        if (breed && !lookup.has(breed.toLowerCase())) lookup.set(breed.toLowerCase(), currentGroup);
      }
    });
  });

  return lookup;
}
function addChampionshipEntry(groups, details) {
  let group = groups.find(g => g.name === details.groupName);
  if (!group) {
    group = { name: details.groupName, breeds: [] };
    groups.push(group);
  }
  let breed = group.breeds.find(b => b.name.toLowerCase() === details.breedName.toLowerCase());
  if (!breed) {
    breed = { name: details.breedName, classes: [] };
    group.breeds.push(breed);
  }
  let cls = breed.classes.find(c => c.name.toLowerCase() === details.className.toLowerCase());
  if (!cls) {
    cls = { name: details.className, entries: [] };
    breed.classes.push(cls);
  }
  if (!cls.entries.some(entry => normalizeNameForUpload(stripEntryOwner(entry)) === normalizeNameForUpload(stripEntryOwner(details.entry)))) {
    cls.entries.push(details.entry);
  }
}
async function buildConformationChampionshipQualifiers(showData, previewOnly) {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase is not ready. Refresh and try again.');

  const seriesName = cleanLine($('championshipSeries').value);
  const showIds = selectedChampionshipShowIds();
  const rule = $('championshipQualification').value;

  if (!seriesName) throw new Error('Please select a championship series or All Saved Conformation Shows.');
  if (!showIds.length) throw new Error('Please select at least one source show.');

  const sourceShows = championshipShowsCache.filter(show => showIds.includes(String(show.id)));
  const records = await loadRecordsForShowIds(supabase, showIds, 'conformation');
  const qualifyingRecords = records.filter(record =>
    record.animal_id && championshipAwardAllowed(record.placement, rule)
  );

  const qualifiedIds = [...new Set(qualifyingRecords.map(record => String(record.animal_id)))];
  if (!qualifiedIds.length) throw new Error('No animals met the selected qualification rule.');

  const animalsById = await loadChampionshipAnimals(supabase, qualifiedIds);
  const breedGroupLookup = buildBreedGroupLookup(sourceShows);
  const groups = [];
  const unresolved = [];
  const usedIds = new Set();

  for (const record of qualifyingRecords) {
    const animalId = String(record.animal_id);
    if (usedIds.has(animalId)) continue;

    const animal = animalsById.get(animalId);
    if (!animal) {
      unresolved.push(animalId + ' (animal not found)');
      continue;
    }

    const breedName = normalizeBreedName(animal.breed || '');
    const groupName = breedGroupLookup.get(breedName.toLowerCase());
    const className = cleanLine(record.class) || (String(animal.gender || '').toLowerCase().startsWith('f') ? 'Class 1a' : 'Class 1');

    if (!breedName || !groupName) {
      unresolved.push((animal.name || animalId) + ' (breed/group not found)');
      continue;
    }

    addChampionshipEntry(groups, {
      groupName,
      breedName,
      className,
      entry: findDisplayedChampionshipEntry(animal, sourceShows, record.upload_id)
    });
    usedIds.add(animalId);
  }

  const mergedGroups = mergeConformationGroups(groups);
  const breedCounts = {};
  mergedGroups.forEach(group => {
    group.breeds.forEach(breed => {
      breedCounts[breed.name] = (breedCounts[breed.name] || 0) + countBreedIndividuals(breed);
    });
  });

  championshipPreviewCache = {
    seriesName: seriesName === '__ALL_SAVED__' ? 'Selected Saved Shows' : seriesName,
    rule,
    selectedShows: sourceShows,
    groups: mergedGroups,
    qualifiedCount: usedIds.size,
    unresolvedCount: unresolved.length,
    unresolved,
    breedCounts
  };

  if (!usedIds.size) {
    const detail = unresolved.length ? ' ' + unresolved.slice(0, 5).join('; ') : '';
    throw new Error('Qualifying records were found, but their registry breed/group data could not be rebuilt.' + detail);
  }

  if (previewOnly) return championshipPreviewCache;

  showData.seriesName = seriesName === '__ALL_SAVED__' ? null : seriesName;
  showData.seriesRound = null;
  showData.rawData = championshipGroupsToRawData(mergedGroups);
  return runConformationGroups(mergedGroups, showData, { finals: 'all-breed' });
}

function numericPlacement(value) {
  const match = String(value || '').match(/\d+/);
  return match ? Number(match[0]) : null;
}

function activityChampionshipRecordAllowed(record, rule) {
  const placementText = cleanLine(record.placement).toLowerCase();
  const place = numericPlacement(record.placement);

  if (rule === 'all-entrants') return true;
  if (rule === 'first-place') return place === 1 || placementText === 'best in field';
  if (rule === 'top-three') return place !== null && place >= 1 && place <= 3;
  if (rule === 'any-placement') return place !== null && place >= 1 && place <= 5;
  if (rule === 'best-in-field') return placementText === 'best in field';
  if (rule === 'qualifying-score') {
    return record.passed === true ||
      /qualif|pass/i.test(String(record.score_label || ''));
  }

  return false;
}

function selectedActivityKeyForChampionship() {
  const select = $('activityKey');
  if (!select) return null;
  return select.value && select.value !== '__MIXED__' ? select.value : null;
}

function championshipIncludesAllActivities() {
  return !$('activityKey') || $('activityKey').value === '__MIXED__';
}

function activityClassWithoutActivityPrefix(className, activityName) {
  let value = cleanLine(className);
  const prefix = cleanLine(activityName);

  if (prefix && value.toLowerCase().startsWith(prefix.toLowerCase() + ' - ')) {
    value = cleanLine(value.slice(prefix.length + 3));
  }

  return value || 'Championship';
}

function recordBelongsToSelectedActivity(record, activityKey) {
  if (!activityKey) return true;
  if (record.activity_key) return String(record.activity_key) === String(activityKey);

  const display = displayActivityNameForKey(activityKey);
  const cls = cleanLine(record.class).toLowerCase();
  const name = cleanLine(display).toLowerCase();

  return cls === name || cls.startsWith(name + ' - ');
}

function activityInfoFromRecord(record, selectedActivityKey) {
  const explicitKey = record.activity_key || selectedActivityKey || null;

  if (explicitKey) {
    return {
      key: explicitKey,
      name: displayActivityNameForKey(explicitKey)
    };
  }

  const classText = cleanLine(record.class);
  const known = activityTypesCache
    .slice()
    .sort((a, b) =>
      String(b.display_name || '').length - String(a.display_name || '').length
    )
    .find(row => {
      const display = cleanLine(row.display_name).toLowerCase();
      const cls = classText.toLowerCase();
      return cls === display || cls.startsWith(display + ' - ');
    });

  return known
    ? { key: known.activity_key, name: known.display_name }
    : { key: null, name: classText.split(' - ')[0] || 'Activity' };
}

function buildActivityChampionshipRawData(qualifyingRecords, animalsById, activityKey) {
  const byActivity = new Map();
  const usedActivityAnimal = new Set();

  qualifyingRecords.forEach(record => {
    const animalId = String(record.animal_id || '');
    if (!animalId) return;

    const animal = animalsById.get(animalId);
    if (!animal) return;

    const activityInfo = activityInfoFromRecord(record, activityKey);
    const activityName = cleanLine(activityInfo.name || 'Activity');
    const uniqueKey = (activityInfo.key || activityName.toLowerCase()) + '::' + animalId;

    // One qualifying appearance per animal PER activity.
    if (usedActivityAnimal.has(uniqueKey)) return;

    const className = activityClassWithoutActivityPrefix(
      record.class,
      activityName
    );

    if (!byActivity.has(activityName)) {
      byActivity.set(activityName, new Map());
    }

    const classMap = byActivity.get(activityName);
    if (!classMap.has(className)) classMap.set(className, []);

    const entry =
      cleanLine(animal.name || animal.normalized_name || 'Unknown Animal') +
      ' - ' +
      cleanLine(animal.owner || 'Unknown Owner');

    classMap.get(className).push(entry);
    usedActivityAnimal.add(uniqueKey);
  });

  const lines = [];
  let classCount = 0;

  for (const [activityName, classMap] of [...byActivity.entries()].sort((a,b) => a[0].localeCompare(b[0]))) {
    for (const [className, entries] of [...classMap.entries()].sort((a,b) => a[0].localeCompare(b[0]))) {
      lines.push(activityName + ' - ' + className);
      entries.sort((a,b) => a.localeCompare(b)).forEach(entry => lines.push(entry));
      lines.push('');
      classCount += 1;
    }
  }

  return {
    rawData: lines.join('\n').trim(),
    qualifiedCount: usedActivityAnimal.size,
    classCount,
    activityCount: byActivity.size,
    activityNames: [...byActivity.keys()].sort((a,b) => a.localeCompare(b))
  };
}

async function buildActivityChampionshipQualifiers(showData, previewOnly) {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase is not ready. Refresh and try again.');

  const seriesName = cleanLine($('championshipSeries').value);
  const showIds = selectedChampionshipShowIds();
  const rule = $('championshipQualification').value;
  const activityKey = selectedActivityKeyForChampionship();

  if (!seriesName) throw new Error('Please select a championship source series or saved shows.');
  if (!showIds.length) throw new Error('Please select at least one source show.');

  const sourceShows = championshipShowsCache.filter(show => showIds.includes(String(show.id)));
  const records = await loadRecordsForShowIds(supabase, showIds, 'activity');

  const qualifyingRecords = records.filter(record =>
    record.animal_id &&
    (championshipIncludesAllActivities() || recordBelongsToSelectedActivity(record, activityKey)) &&
    activityChampionshipRecordAllowed(record, rule)
  );

  const animalIds = [...new Set(qualifyingRecords.map(record => String(record.animal_id)))];
  if (!animalIds.length) throw new Error('No animals met the selected activity Championship qualification rule.');

  const animalsById = await loadChampionshipAnimals(supabase, animalIds);
  const built = buildActivityChampionshipRawData(qualifyingRecords, animalsById, activityKey);

  championshipPreviewCache = {
    seriesName: seriesName === '__ALL_SAVED__' ? 'Selected Saved Shows' : seriesName,
    rule,
    selectedShows: sourceShows,
    qualifiedCount: built.qualifiedCount,
    unresolvedCount: Math.max(0, animalIds.length - built.qualifiedCount),
    classCount: built.classCount,
    activityCount: built.activityCount,
    activityNames: built.activityNames,
    activityName: activityKey ? displayActivityNameForKey(activityKey) : 'All Activities',
    rawData: built.rawData
  };

  if (previewOnly) return championshipPreviewCache;

  showData.seriesName = seriesName === '__ALL_SAVED__' ? null : seriesName;
  showData.seriesRound = null;
  showData.rawData = built.rawData;

  return runActivity(built.rawData, showData);
}

async function buildChampionshipQualifiers(showData, previewOnly) {
  if (selectedEventCategory() === 'activities') {
    return buildActivityChampionshipQualifiers(showData, previewOnly);
  }

  return buildConformationChampionshipQualifiers(showData, previewOnly);
}

function championshipGroupsToRawData(groups) {
  const lines = [];
  mergeConformationGroups(groups).forEach(group => {
    group.breeds.forEach((breed, breedIndex) => {
      breed.classes.forEach((cls, classIndex) => {
        if (breedIndex === 0 && classIndex === 0) lines.push(group.name);
        lines.push(breed.name.toUpperCase());
        lines.push(cls.name);
        cls.entries.forEach(entry => lines.push(entry));
        lines.push('');
      });
    });
  });
  return lines.join('\n').trim();
}
async function previewChampionship() {
  hideMessage();
  const button = $('championshipPreviewButton');
  button.disabled = true;
  button.textContent = '⏳ Loading Qualifiers...';
  try {
    const preview = await buildChampionshipQualifiers({
      showName: cleanLine($('showName').value) || 'Championship Show',
      showType: resolveLegacyShowType(),
      species: $('showSpecies').value,
      eventCategory: selectedEventCategory(),
      activityKey: $('activityKey') ? $('activityKey').value : null,
      bannerUrl: cleanLine($('bannerUrl').value),
      rawData: ''
    }, true);

    const el = $('championshipPreview');

    if (selectedEventCategory() === 'activities') {
      el.innerHTML =
        '<strong>' + escapeHtml(preview.seriesName) + '</strong><br>' +
        'Activity selection: ' + escapeHtml(preview.activityName || '') + '<br>' +
        (preview.activityCount ? 'Activities included: ' + Number(preview.activityCount) + '<br>' : '') +
        'Source shows selected: ' + preview.selectedShows.length + '<br>' +
        'Qualifying activity entries found: ' + preview.qualifiedCount +
        '<br>Championship classes rebuilt: ' + Number(preview.classCount || 0) +
        (preview.unresolvedCount ? '<br>Could not rebuild: ' + preview.unresolvedCount : '');
    } else {
      const breeds = Object.entries(preview.breedCounts || {})
        .sort((a,b) => a[0].localeCompare(b[0]))
        .map(([breed, count]) => escapeHtml(breed) + ': ' + count)
        .join('<br>');

      el.innerHTML =
        '<strong>' + escapeHtml(preview.seriesName) + '</strong><br>' +
        'Source shows selected: ' + preview.selectedShows.length + '<br>' +
        'Unique qualifiers found: ' + preview.qualifiedCount +
        (preview.unresolvedCount ? '<br>Could not rebuild from source entries: ' + preview.unresolvedCount : '') +
        (breeds ? '<br><br><strong>Breed totals</strong><br>' + breeds : '');
    }

    el.className = 'ss-preview-summary';
  } catch (err) {
    showMessage('error', '<strong>Championship preview failed:</strong> ' + String(err.message || err));
  } finally {
    button.disabled = false;
    button.textContent = '🔎 Preview Qualifiers';
  }
}
function initializeRandomizerUI() {
  if (!$('showSpecies')) return;

  const watched = [
    'showSpecies',
    'showFormat',
    'championshipMode',
    'activityResultMethod'
  ];

  watched.forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('change', async () => {
      if (id === 'showSpecies' && activeRandomizerTab === 'activities') {
        await populateActivitySelector();
      }

      if (id === 'showSpecies' && activeRandomizerTab === 'specialty') {
        renderShowFormatOptions();
      }

      updatePhase1UI();

      if (
        selectedChampionshipMode() === 'championship' &&
        id === 'showSpecies' &&
        activeRandomizerTab !== 'specialty'
      ) {
        await loadChampionshipSeries();
      }

      captureWorkspaceState();
    });
  });

  document.querySelectorAll('.ss-engine-tab').forEach(button => {
    button.addEventListener('click', () => {
      switchRandomizerTab(button.dataset.engineTab);
    });
  });

  if ($('herdingEventType')) {
    $('herdingEventType').addEventListener('change', updateSetupSummary);
  }

  if ($('championshipSeries')) {
    $('championshipSeries').addEventListener('change', loadChampionshipShows);
  }

  const runButton = $('ssRunButton');
  const sortButton = $('sortButton');
  const clearButton = $('ssClearButton');
  const previewButton = $('championshipPreviewButton');

  if (runButton) runButton.addEventListener('click', randomizeShow);
  if (sortButton) sortButton.addEventListener('click', sortEntriesOnly);
  if (clearButton) clearButton.addEventListener('click', clearData);
  if (previewButton) previewButton.addEventListener('click', previewChampionship);

  configureWorkspaceForTab(activeRandomizerTab);
  setEngineTabButtons(activeRandomizerTab);
  renderShowFormatOptions();
  updatePhase1UI();
  captureWorkspaceState();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeRandomizerUI);
} else {
  setTimeout(initializeRandomizerUI, 0);
}

// =============================================================
// 5. ACTIVITY MODULE
// =============================================================
function looksLikeAnimalEntry(line) {
  const s = stripHeaderMarkup(line);

  // Most SS entry lines are "Animal Name - Owner".
  if (/\s+-\s+/.test(s)) return true;

  // Already-randomized/result lines should never be treated as headers.
  if (/^([1-9]|10)(st|nd|rd|th)?\s+/i.test(s)) return true;

  return false;
}

function splitActivityClassHeader(header) {
  const s = stripHeaderMarkup(header);
  if (!s.includes(' - ')) return null;

  const parts = s.split(' - ').map(cleanLine).filter(Boolean);
  if (parts.length < 2) return null;

  return {
    activity: parts.shift(),
    className: parts.join(' - ') || 'Untitled'
  };
}

function makeActivityEntry(raw, scored) {
  const cleaned = cleanLine(raw);
  const statusMatch = cleaned.match(/^(.*?)\s+-\s+(pass|fail)$/i);

  if (statusMatch) {
    return {
      name: cleanLine(statusMatch[1]),
      passed: statusMatch[2].toLowerCase() === 'pass',
      scoreLabel: 'Herding Instinct Test'
    };
  }

  return scored ? scoreEntry(cleaned) : { name: cleaned };
}
function isBracketHeaderLine(line) {
  return /^\s*\[[^\]]+\]\s*$/i.test(String(line || '').trim());
}
function stripActivityPrefixFromClass(activityName, classHeader) {
  const activity = cleanLine(activityName);
  let cls = stripHeaderMarkup(classHeader);

  // Handles:
  // [Tracking]
  // [Tracking - Open Breeds]
  // so the displayed class becomes "Open Breeds" instead of "Tracking - Open Breeds".
  if (cls.toLowerCase().startsWith(activity.toLowerCase() + ' - ')) {
    cls = cleanLine(cls.slice(activity.length + 3));
  }

  return cls || 'Untitled';
}
function parseActivityWithDivisions(rawData, scored) {
  const parsed = [];

  splitBlocks(rawData).forEach(block => {
    if (block.length < 2) return;

    const firstHeader = stripHeaderMarkup(block[0]);
    const secondHeader = stripHeaderMarkup(block[1]);
    const compactHeader = splitActivityClassHeader(block[0]);

    // Format:
    // [Barn Hunt - Open Breed]
    // Dog - Owner
    // Dog - Owner
    if (compactHeader) {
      const entries = block.slice(1).filter(line => !isBracketHeaderLine(line));
      if (!entries.length) return;

      parsed.push({
        activity: compactHeader.activity,
        division: null,
        classes: [{
          name: compactHeader.className || 'Untitled',
          entries: entries.map(e => makeActivityEntry(e, scored))
        }]
      });
      return;
    }

    // Format:
    // [Tracking]
    // [Tracking - Open Breeds]
    // Dog - Owner
    // Dog - Owner
    // The second bracketed line is a class header, NOT an entry.
    if (isBracketHeaderLine(block[0]) && isBracketHeaderLine(block[1]) && secondHeader.includes(' - ')) {
      const entries = block.slice(2).filter(line => !isBracketHeaderLine(line));
      if (!entries.length) return;

      parsed.push({
        activity: firstHeader,
        division: null,
        classes: [{
          name: stripActivityPrefixFromClass(firstHeader, block[1]),
          entries: entries.map(e => makeActivityEntry(e, scored))
        }]
      });
      return;
    }

    // Format:
    // Activity
    // Division
    // Class
    // Dog - Owner
    const possibleDivision = stripHeaderMarkup(block[1]);
    const possibleClass = stripHeaderMarkup(block[2]);

    // If line 2 or 3 looks like an animal entry, do not promote it into a header.
    // Treat the whole block as one Untitled class under the activity.
    if (block.length < 4 || looksLikeAnimalEntry(block[1]) || looksLikeAnimalEntry(block[2])) {
      const entries = block.slice(1).filter(line => !isBracketHeaderLine(line));
      if (!entries.length) return;

      parsed.push({
        activity: firstHeader,
        division: null,
        classes: [{
          name: 'Untitled',
          entries: entries.map(e => makeActivityEntry(e, scored))
        }]
      });
      return;
    }

    const entries = block.slice(3).filter(line => !isBracketHeaderLine(line));
    if (!entries.length) return;

    parsed.push({
      activity: firstHeader,
      division: possibleDivision || null,
      classes: [{
        name: possibleClass || 'Untitled',
        entries: entries.map(e => makeActivityEntry(e, scored))
      }]
    });
  });

  return parsed.filter(x => x && x.activity && x.classes[0].name && x.classes[0].entries.length);
}
function parseActivityNoDivisions(rawData, scored) {
  return splitBlocks(rawData).map(block => {
    let activity = stripHeaderMarkup(block[0]);
    let className = stripHeaderMarkup(block[1]);
    let entries = block.slice(2);

    if (activity.includes(' - ') && block.length >= 2) {
      const parts = activity.split(' - ');
      activity = cleanLine(parts.shift());
      className = cleanLine(parts.join(' - ')) || className || 'Untitled';
      entries = block.slice(1);
    } else if (isBracketHeaderLine(block[0]) && isBracketHeaderLine(block[1]) && className.includes(' - ')) {
      className = stripActivityPrefixFromClass(activity, block[1]);
      entries = block.slice(2);
    }

    entries = entries.filter(line => !isBracketHeaderLine(line));

    return {
      activity,
      division: null,
      classes: [{
        name: className || 'Untitled',
        entries: entries.map(e => makeActivityEntry(e, scored))
      }]
    };
  }).filter(x => x.activity && x.classes[0].entries.length);
}
function scoreEntry(name) {
  const maxScore = Math.max(1, parseInt($('maxScore').value, 10) || 100);
  const minScore = Math.floor(maxScore / 3);
  return { name, score: Math.floor(Math.random() * (maxScore - minScore + 1)) + minScore };
}
function activityPoints(place) {
  if (String(place || '').toLowerCase() === 'best in field') return SS_CONFIG.placementPoints[1] || 5;
  return SS_CONFIG.placementPoints[Number(place)] || 0;
}
function activityRecord(records, showData, activity, className, entry, place, awardName) {
  const selectedKey =
    showData.activityKey && showData.activityKey !== '__MIXED__'
      ? showData.activityKey
      : resolveActivityKeyFromName(activity, showData.species);

  records.push({
    show_name: showData.showName,
    show_type: 'activity',
    show_scope: getShowScope(showData.showType),
    activity_key: selectedKey || null,
    class_name: activity + (className ? ' - ' + className : ''),
    placement: awardName || String(place),
    animal_name: entry.name || entry,
    points: awardName ? 0 : activityPoints(place),
    score: entry && entry.score !== undefined ? Number(entry.score) : null,
    max_score: entry && entry.score !== undefined ? Math.max(1, parseInt($('maxScore').value, 10) || 100) : null,
    passed: entry && typeof entry.passed === 'boolean' ? entry.passed : null,
    score_label: entry && entry.scoreLabel ? entry.scoreLabel : null
  });
}
function isPackActivityClass(className) {
  return /\b(pack|team|brace)\b/i.test(String(className || ''));
}
function splitPackActivityMembers(entry, className) {
  const rawName = String(entry && entry.name ? entry.name : entry || '').trim();
  if (!rawName || !isPackActivityClass(className)) return [entry];

  /*
    TEAM / PACK / BRACE ENTRY FORMAT
    --------------------------------
    A team line is:
      Animal 1 - Animal 2 - Animal 3 - Owner

    The old splitter only worked reliably when the class heading itself contained
    "team", "pack", or "brace". Some activity formats identify the event as a team
    event elsewhere, leaving the class name without that word. In that case the
    whole combined string reached findAnimal(), which could produce the
    "duplicate exact registry name" skips seen in team uploads.

    Once this function has been called for a pack/team-aware record, split every
    spaced-hyphen segment except the last one into an individual animal. The last
    segment remains the owner.
  */
  const parts = rawName.split(/\s+-\s+/).map(cleanLine).filter(Boolean);
  if (parts.length < 3) return [entry];

  const owner = parts[parts.length - 1];
  const members = parts.slice(0, -1);

  return members.map(memberName => ({
    name: memberName + ' - ' + owner,
    score: entry && entry.score !== undefined ? entry.score : undefined,
    passed: entry && typeof entry.passed === 'boolean' ? entry.passed : undefined,
    scoreLabel: entry && entry.scoreLabel ? entry.scoreLabel : undefined,
    sourcePackName: rawName
  }));
}
function activityRecordForEntry(records, showData, activity, className, entry, place, awardName, splitPackMembers) {
  const teamAware =
    !!splitPackMembers ||
    isPackActivityClass(className) ||
    isPackActivityClass(activity);

  let recordEntries = [entry];

  if (teamAware) {
    const rawName = String(entry && entry.name ? entry.name : entry || '').trim();
    const parts = rawName.split(/\s+-\s+/).map(cleanLine).filter(Boolean);

    if (parts.length >= 3) {
      const owner = parts[parts.length - 1];
      recordEntries = parts.slice(0, -1).map(memberName => ({
        name: memberName + ' - ' + owner,
        score: entry && entry.score !== undefined ? entry.score : undefined,
        passed: entry && typeof entry.passed === 'boolean' ? entry.passed : undefined,
        scoreLabel: entry && entry.scoreLabel ? entry.scoreLabel : undefined,
        sourcePackName: rawName
      }));
    }
  }

  recordEntries.forEach(recordEntry => {
    activityRecord(records, showData, activity, className, recordEntry, place, awardName);
  });
}
function bestInFieldFinalistsFromEntry(entry, className) {
  /*
    BEST IN FIELD TEAM SAFETY
    -------------------------
    Team/pack/brace winners must be expanded into their individual animals before
    they enter the Best in Field final.

    Do not rely only on the class heading containing "team", "pack", or "brace".
    Some SS team formats use a normal-looking class heading even though the entry
    line itself contains multiple animals:
      Animal 1 - Animal 2 - Animal 3 - Owner

    A normal individual entry has only:
      Animal - Owner
    so 3+ spaced-hyphen parts is a safe signal that this is a multi-animal entry.
  */
  const rawName = String(entry && entry.name ? entry.name : entry || '').trim();
  const parts = rawName.split(/\s+-\s+/).map(cleanLine).filter(Boolean);

  if (parts.length < 3) return [entry];

  const owner = parts[parts.length - 1];

  return parts.slice(0, -1).map(memberName => ({
    name: memberName + ' - ' + owner,
    score: entry && entry.score !== undefined ? entry.score : undefined,
    passed: entry && typeof entry.passed === 'boolean' ? entry.passed : undefined,
    scoreLabel: entry && entry.scoreLabel ? entry.scoreLabel : undefined,
    sourcePackName: rawName
  }));
}
function splitBalancedActivityGroups(entries) {
  // Divided activity classes split once they reach 10 entries.
  // Groups stay as close to even as possible: 10 = 5/5, 11 = 6/5, 21 = 7/7/7.
  const total = entries.length;
  if (total < 10) return [entries];

  const groupCount = Math.max(2, Math.ceil(total / 10));
  const baseSize = Math.floor(total / groupCount);
  const extra = total % groupCount;
  const groups = [];
  let index = 0;

  for (let i = 0; i < groupCount; i++) {
    const size = baseSize + (i < extra ? 1 : 0);
    groups.push(entries.slice(index, index + size));
    index += size;
  }

  return groups.filter(g => g.length);
}
function activityClassSortValue(name) {
  const s = cleanLine(name).toLowerCase();
  if (s === 'untitled') return 0;
  const titleMatch = s.match(/^(.+?)\s+(class|division|level)\s*(\d+)?/i);
  if (titleMatch) return 10 + (parseInt(titleMatch[3] || '0', 10) || 0);
  const m = s.match(/(\d+)/);
  return m ? 20 + parseInt(m[1], 10) : 999;
}
function activityEntrySortName(entry) {
  return removeDecorations(entry && entry.name ? entry.name : entry).toLowerCase();
}
function mergeActivityBlocks(activityBlocks) {
  const merged = [];

  activityBlocks.forEach(block => {
    const activityName = cleanLine(block.activity);
    const divisionName = block.division ? cleanLine(block.division) : null;
    let activity = merged.find(a => a.activity.toLowerCase() === activityName.toLowerCase() && String(a.division || '').toLowerCase() === String(divisionName || '').toLowerCase());
    if (!activity) {
      activity = { activity: activityName, division: divisionName, classes: [] };
      merged.push(activity);
    }

    (block.classes || []).forEach(cls => {
      const className = cleanLine(cls.name || 'Untitled') || 'Untitled';
      let targetClass = activity.classes.find(c => c.name.toLowerCase() === className.toLowerCase());
      if (!targetClass) {
        targetClass = { name: className, entries: [] };
        activity.classes.push(targetClass);
      }
      targetClass.entries.push(...(cls.entries || []));
    });
  });

  merged.forEach(activity => {
    activity.classes.sort((a,b) => activityClassSortValue(a.name) - activityClassSortValue(b.name) || a.name.localeCompare(b.name));
    activity.classes.forEach(cls => {
      cls.entries.sort((a,b) => activityEntrySortName(a).localeCompare(activityEntrySortName(b)));
    });
  });

  return merged;
}
function herdingEntryLines(rawData) {
  return String(rawData || '')
    .split(/\r?\n/)
    .map(cleanLine)
    .filter(Boolean)
    .filter(line => !isBracketHeaderLine(line))
    .filter(line => looksLikeAnimalEntry(line));
}
function normalizeHerdingInputLine(value) {
  return String(value || '')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[‐‑‒–—―]/g, '-')
    .replace(/\[\/?b\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeHerdingDivision(value) {
  const key = cleanLine(value).toLowerCase();

  if (/^pupp(?:y|ies)$/.test(key) || key === 'puppy stakes') return 'Puppy';
  if (/^beginners?$/.test(key) || key === 'started' || key === 'beginner stakes') return 'Beginners';
  if (key === 'advanced' || key === 'advanced stakes') return 'Advanced';
  if (key === 'expert' || key === 'expert stakes') return 'Expert';
  if (/^champ(?:ionship)?$/.test(key) || key === 'championship stakes') return 'Championship';

  return null;
}

function parseHerdingStakesClasses(rawData) {
  const lines = String(rawData || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(normalizeHerdingInputLine);

  const classes = [];
  const classesByKey = new Map();
  let current = null;

  lines.forEach(line => {
    if (!line) return;

    if (line.includes(' - ')) {
      if (current) current.entries.push(line);
      return;
    }

    const words = line.split(' ').filter(Boolean);
    if (words.length < 2) {
      current = null;
      return;
    }

    const enteredStock = words.pop();
    const enteredDivision = words.join(' ').trim();

    const stockMap = {
      sheep: 'Sheep',
      cattle: 'Cattle',
      duck: 'Ducks',
      ducks: 'Ducks',
      reindeer: 'Reindeer'
    };

    const stock = stockMap[enteredStock.toLowerCase()];
    const division = normalizeHerdingDivision(enteredDivision);

    if (!stock || !division) {
      current = null;
      return;
    }

    const classKey = division.toLowerCase() + '|' + stock.toLowerCase();
    current = classesByKey.get(classKey) || null;

    if (!current) {
      current = {
        className: division + ' ' + stock,
        division,
        stock,
        entries: []
      };

      classesByKey.set(classKey, current);
      classes.push(current);
    }
  });

  return classes.filter(classBlock => classBlock.entries.length > 0);
}

function runHerdingClub(rawData, showData) {
  const eventType = showData.herdingEventType || 'instinct';
  const lines = [];
  const records = [];

  if (eventType === 'instinct') {
    const rawEntries = herdingEntryLines(rawData);
    if (!rawEntries.length) throw new Error('No valid Instinct Testing entries found. Use: Animal Name - Owner');

    const activity = 'Herding Instinct Testing';
    const className = 'Instinct Test';
    addLine(lines, bold(activity));
    addLine(lines, '');
    addLine(lines, bold(className));

    shuffle(rawEntries).forEach((name, index) => {
      const passed = Math.random() < 0.5;
      const entry = { name, passed };
      addLine(lines, (index + 1) + '. ' + name + ' - ' + (passed ? 'Pass' : 'Fail'));
      activityRecord(records, showData, activity, className, entry, index + 1, passed ? 'Pass' : 'Fail');
      const record = records[records.length - 1];
      record.activity_key = 'herding';
      record.class_name = 'Herding - Instinct Test';
      record.points = 0;
      record.score = null;
      record.max_score = null;
      record.passed = passed;
      record.score_label = passed ? 'Pass' : 'Fail';
    });

    return { lines, records };
  }

  const classes = parseHerdingStakesClasses(rawData);
  if (!classes.length) {
    throw new Error(
      'No valid Stakes classes found. Use one of: Puppy, Beginners, Advanced, Expert, or Championship + Sheep/Cattle/Ducks/Reindeer. Example: Beginners Sheep'
    );
  }

  const activity = 'Herding';
  const maxScore = 300;
  const minScore = 100;
  const qualifyingScore = 240;

  addLine(lines, bold('Herding Stakes'));
  addLine(lines, '');

  classes.forEach((classBlock, classIndex) => {
    if (classIndex > 0) addLine(lines, '');
    addLine(lines, bold(classBlock.className));

    const entries = classBlock.entries
      .map(name => ({
        name,
        score: Math.floor(Math.random() * (maxScore - minScore + 1)) + minScore
      }))
      .sort((a, b) => b.score - a.score);

    entries.forEach((entry, index) => {
      const place = index + 1;
      const qualified = entry.score >= qualifyingScore;

      addLine(
        lines,
        placementLabel(place) +
          ' ' +
          entry.name +
          ' - ' +
          entry.score +
          (qualified ? ' - Qualified' : '')
      );

      activityRecord(
        records,
        showData,
        activity,
        classBlock.className,
        entry,
        place,
        null
      );

      const record = records[records.length - 1];
      record.activity_key = 'herding';
      record.class_name = 'Herding - ' + classBlock.division + ' ' + classBlock.stock;
      record.score = entry.score;
      record.max_score = maxScore;
      record.passed = qualified;
      record.score_label = qualified ? 'Qualified' : 'Not Qualified';
    });
  });

  return { lines, records };
}




function parseEnduranceSimpleClasses(rawData) {
  const lines = String(rawData || '')
    .replace(/\r\n?/g,'\n')
    .split('\n')
    .map(cleanLine);

  const classes = [];
  let current = null;

  lines.forEach(line => {
    if (!line) return;

    if (line.includes(' - ')) {
      if (!current) {
        current = { name:'Endurance', entries:[] };
        classes.push(current);
      }
      current.entries.push(line);
      return;
    }

    current = { name: line, entries: [] };
    classes.push(current);
  });

  return classes.filter(cls => cls.entries.length);
}

function enduranceRecordBase(showData, horseName, className, place, points) {
  return {
    show_name: showData.showName,
    show_type: 'activity',
    show_scope: 'association',
    association_key: 'endurance_club',
    association_event_type: showData.associationEventType,
    activity_key: 'endurance',
    class_name: className,
    placement: String(place),
    animal_name: horseName,
    points: Number(points || 0),
    score: null,
    max_score: null,
    passed: null,
    score_label: null,
    endurance_completed: true,
    endurance_season: new Date().getFullYear()
  };
}

function runEnduranceProspects(rawData, showData) {
  const classes = parseEnduranceSimpleClasses(rawData);
  if (!classes.length) throw new Error('No Prospect classes found.');

  const lines = [];
  const records = [];

  addLine(lines,bold('Endurance Club Prospect Classes'));
  addLine(lines,'');

  classes.forEach((cls, ci) => {
    if (ci) addLine(lines,'');
    addLine(lines,bold(cls.name));

    shuffle(cls.entries.slice()).forEach((horse,index) => {
      const place=index+1;
      const points=SS_CONFIG.placementPoints[place] || 0;
      addLine(lines, placementLabel(place) + ' ' + horse);

      records.push({
        show_name: showData.showName,
        show_type: 'conformation',
        show_scope: 'association',
        association_key: 'endurance_club',
        association_event_type: 'prospect',
        activity_key: null,
        class_name: 'Endurance Prospect - ' + cls.name,
        placement: String(place),
        animal_name: horse,
        points,
        endurance_completed: false,
        endurance_winnings: 0,
        endurance_season: new Date().getFullYear()
      });
    });
  });

  return {lines,records};
}

function runEnduranceUnrated(rawData,showData){
  const classes=parseEnduranceSimpleClasses(rawData);
  if(!classes.length) throw new Error('No unrated Endurance races found.');

  const lines=[],records=[];
  const fallbackDistance=Math.max(0,Number($('enduranceUnratedDistance')?.value||0));

  addLine(lines,bold('Endurance Club — Unrated Races'));
  addLine(lines,'');

  classes.forEach((cls,ci)=>{
    if(ci) addLine(lines,'');
    addLine(lines,bold(cls.name));

    const classDistanceMatch=cls.name.match(/(\d[\d,]*)\s*km/i);
    const distance=classDistanceMatch
      ? Number(classDistanceMatch[1].replace(/,/g,''))
      : fallbackDistance;

    shuffle(cls.entries.slice()).forEach((horse,index)=>{
      const place=index+1;
      const points=SS_CONFIG.placementPoints[place]||0;
      const winnings=endurancePrizeForPlace(place);

      addLine(lines,
        placementLabel(place)+' '+horse+
        (winnings ? ' - $'+winnings.toLocaleString() : '')
      );

      const record=enduranceRecordBase(showData,horse,'Endurance - '+cls.name,place,points);
      Object.assign(record,{
        association_event_type:'unrated',
        endurance_race_key:'unrated_'+cleanLine(cls.name).toLowerCase().replace(/[^a-z0-9]+/g,'_'),
        endurance_race_name:cls.name,
        endurance_grade:null,
        endurance_conference:null,
        endurance_circuit:null,
        endurance_series:null,
        endurance_distance_km:distance,
        endurance_winnings:winnings
      });
      records.push(record);
    });
  });

  return {lines,records};
}

function standardEndurancePoints(records){
  return (records||[])
    .filter(r=>cleanLine(r.activity_key).toLowerCase()==='endurance')
    .reduce((sum,r)=>sum+Number(r.points||r.calculated_points||0),0);
}

function passedPlacement(r){
  const m=String(r.placement||'').match(/\d+/);
  return m ? Number(m[0]) : null;
}

async function checkEnduranceRaceEligibility(rawData,race){
  const supabase=getSupabase();
  if(!supabase) throw new Error('Supabase is not ready.');

  const animalMap=await loadAnimalsMap(supabase);
  const entries=herdingEntryLines(rawData);
  const accepted=[],declined=[];

  for(const rawEntry of entries){
    const match=findAnimal(rawEntry,animalMap);
    if(match.status!=='ok'){
      declined.push({entry:rawEntry,reason:match.status==='ambiguous'?'Duplicate exact registry name':'Exact registry animal not found'});
      continue;
    }

    const animal=match.animal;
    if(cleanLine(animal.species).toLowerCase()!=='horse'){
      declined.push({entry:rawEntry,reason:'Endurance Club is horses only'});
      continue;
    }

    const {data,error}=await supabase
      .from('show_records')
      .select('*')
      .eq('animal_id',animal.id);

    if(error) throw new Error('Eligibility check failed for '+animal.name+': '+error.message);

    const prior=data||[];
    const endurancePoints=standardEndurancePoints(prior);

    // Endurance Club Stakes eligibility:
    // Grade III: no title required
    // Grade II: EnN or higher (25+ standard Endurance points)
    // Grade I: EnJ or higher (50+ standard Endurance points)
    const grade = String(race.grade || '').toUpperCase().trim();

    if (grade === 'II' && endurancePoints < 25) {
      declined.push({
        entry: rawEntry,
        reason: 'Grade II Stakes require EnN or higher'
      });
      continue;
    }

    if (grade === 'I' && endurancePoints < 50) {
      declined.push({
        entry: rawEntry,
        reason: 'Grade I Stakes require EnJ or higher'
      });
      continue;
    }

    if(race.key==='world_the_western_finals'){
      const qualified=prior.some(r =>
        cleanLine(r.association_key).toLowerCase()==='endurance_club' &&
        cleanLine(r.endurance_conference).toLowerCase() === 'western' &&
        passedPlacement(r)===1 &&
        r.endurance_grade
      );
      if(!qualified){
        declined.push({entry:rawEntry,reason:'Requires a win in a Western Endurance Club stakes race'});
        continue;
      }
    }

    if(race.key==='world_the_eastern_challenge'){
      const qualified=prior.some(r =>
        cleanLine(r.association_key).toLowerCase()==='endurance_club' &&
        ['eastern','both'].includes(cleanLine(r.endurance_conference).toLowerCase()) &&
        passedPlacement(r)===1 &&
        r.endurance_grade
      );
      if(!qualified){
        declined.push({entry:rawEntry,reason:'Requires a win in an Eastern Endurance Club stakes race'});
        continue;
      }
    }

    if(race.key==='world_the_invitational'){
      const gradeWinner=prior.some(r =>
        cleanLine(r.association_key).toLowerCase()==='endurance_club' &&
        ['i','ii'].includes(cleanLine(r.endurance_grade).toLowerCase()) &&
        passedPlacement(r)===1
      );

      const finalTopThree=prior.some(r =>
        cleanLine(r.endurance_series).toLowerCase()==='conference_final' &&
        (passedPlacement(r)||99)<=3
      );

      const enOpen=endurancePoints>=125;

      const seriesWins={gemstone:new Set(),crystal:new Set()};
      prior.forEach(r=>{
        if(passedPlacement(r)!==1)return;
        const s=cleanLine(r.endurance_series).toLowerCase();
        if(seriesWins[s])seriesWins[s].add(r.endurance_race_key);
      });

      const fullSeries=seriesWins.gemstone.size>=6 || seriesWins.crystal.size>=6;

      if(!(gradeWinner||finalTopThree||enOpen||fullSeries)){
        declined.push({entry:rawEntry,reason:'Invitational requires a Grade I/II stakes win, top 3 in a conference final, EnO, or a full World Tour series win'});
        continue;
      }
    }

    accepted.push({rawEntry,animal});
  }

  return {accepted,declined};
}

async function runEnduranceRated(rawData,showData){
  const race=SS_ENDURANCE_RACES.find(row=>row.key===$('enduranceRaceKey')?.value);
  if(!race) throw new Error('Select an Endurance Club race.');

  const {accepted,declined}=await checkEnduranceRaceEligibility(rawData,race);
  if(!accepted.length){
    throw new Error('No eligible entries. '+declined.map(x=>x.entry+': '+x.reason).join('; '));
  }

  const lines=[],records=[];
  addLine(lines,bold(race.name));
  addLine(lines,
    [
      race.grade ? 'Grade '+race.grade : null,
      race.distance_km ? race.distance_km+' km' : null,
      race.conference || null,
      race.circuit || null
    ].filter(Boolean).join(' • ')
  );
  addLine(lines,'');

  const ranked=shuffle(accepted.slice());

  ranked.forEach((item,index)=>{
    const place=index+1;
    const points=SS_CONFIG.placementPoints[place]||0;
    const winnings=endurancePrizeForPlace(place);

    addLine(lines,
      placementLabel(place)+' '+item.rawEntry+
      (winnings ? ' - $'+winnings.toLocaleString() : '')
    );

    const record=enduranceRecordBase(showData,item.rawEntry,'Endurance - '+race.name,place,points);
    Object.assign(record,{
      association_event_type:'rated',
      endurance_race_key:race.key,
      endurance_race_name:race.name,
      endurance_grade:race.grade||null,
      endurance_conference:race.conference||null,
      endurance_circuit:race.circuit||null,
      endurance_series:race.series||null,
      endurance_distance_km:Number(race.distance_km||0),
      endurance_winnings:winnings
    });
    records.push(record);
  });

  if(declined.length){
    addLine(lines,'');
    addLine(lines,bold('Declined Entries'));
    declined.forEach(item=>addLine(lines,item.entry+' - DECLINED: '+item.reason));
  }

  return {lines,records};
}

async function runEnduranceClub(rawData,showData){
  const mode=showData.associationEventType||showData.specialtyEventType||'prospect';
  if(mode==='prospect') return runEnduranceProspects(rawData,showData);
  if(mode==='unrated') return runEnduranceUnrated(rawData,showData);
  if(mode==='rated') return await runEnduranceRated(rawData,showData);
  throw new Error('Unknown Endurance Club event type.');
}


function huntingPick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function huntingLevelDifficulty(levelKey) {
  return levelKey === 'masters' ? 2 : levelKey === 'expert' ? 1 : 0;
}

function huntingScenario(levelKey) {
  const difficulty = huntingLevelDifficulty(levelKey);

  const terrain = huntingPick(SS_HUNTING_TERRAINS);
  const weather = huntingPick(SS_HUNTING_WEATHER);

  const scentPool = difficulty === 0
    ? SS_HUNTING_SCENT.slice(0,3)
    : difficulty === 1
      ? SS_HUNTING_SCENT.slice(1,5)
      : SS_HUNTING_SCENT.slice(2);

  const distractionPool = difficulty === 0
    ? SS_HUNTING_DISTRACTIONS.slice(0,2)
    : difficulty === 1
      ? SS_HUNTING_DISTRACTIONS.slice(0,4)
      : SS_HUNTING_DISTRACTIONS;

  const quarryPool = difficulty === 0
    ? SS_HUNTING_QUARRY_DIFFICULTY.slice(0,2)
    : difficulty === 1
      ? SS_HUNTING_QUARRY_DIFFICULTY.slice(1,4)
      : SS_HUNTING_QUARRY_DIFFICULTY.slice(2);

  return {
    terrain,
    weather,
    scent: huntingPick(scentPool),
    distraction: huntingPick(distractionPool),
    quarry: huntingPick(quarryPool)
  };
}

function huntingConditionModifier(scenario, category, levelKey) {
  let mod = 0;
  const text = (scenario.terrain + ' ' + scenario.weather + ' ' + scenario.scent + ' ' +
    scenario.distraction + ' ' + scenario.quarry + ' ' + category).toLowerCase();

  if (/fresh strong scent|recent rainfall/.test(text) && /scent|search|location|tracking|line/.test(text)) mod += 2;
  if (/old scent|contaminated scent|crossing scent|broken scent/.test(text) && /scent|search|location|tracking|line/.test(text)) mod -= 3;
  if (/heavy rain|moderate wind/.test(text) && /scent|marking|location/.test(text)) mod -= 2;
  if (/dense brush|rocky ground|marsh/.test(text) && /speed|agility|pursuit|retrieve/.test(text)) mod -= 2;
  if (/open field|pasture/.test(text) && /speed|pursuit|marking|search/.test(text)) mod += 1;
  if (/wildlife distraction|other dogs|competing scent|human activity|livestock/.test(text) && /control|cooperation|steadiness|persistence/.test(text)) mod -= 2;
  if (levelKey === 'masters') mod -= 1;

  return mod;
}

function huntingCategoryScore(levelKey, scenario, category) {
  const ranges = {
    beginners: [18, 39],
    expert: [20, 39],
    masters: [22, 40]
  };
  const [min,max] = ranges[levelKey] || ranges.beginners;
  const base = min + Math.floor(Math.random() * (max - min + 1));
  return Math.max(0, Math.min(40, base + huntingConditionModifier(scenario, category, levelKey)));
}

function huntingDqReason(familyKey, levelKey) {
  const generic = [
    'Loss of handler control',
    'Unsafe working behaviour',
    'Abandoned the search',
    'Failure to engage the working scenario'
  ];

  const family = {
    flushing: ['Broke steadiness and could not be recovered'],
    retrieving: ['Refused the retrieve after locating quarry'],
    trailing: ['Abandoned the scent line completely'],
    treeing_baying: ['Failed to maintain safe bay / tree work'],
    ratting: ['Unsafe loss of control in the working area'],
    versatile: ['Failed multiple required phases of the test'],
    coursing: ['Broke off pursuit and failed to re-engage'],
    falconry: ['Unsafe interference with the working bird'],
    pack_hunting: ['Unsafe pack interference / loss of pack control'],
    catch_dogs: ['Unsafe catch / failed controlled release']
  }[familyKey] || [];

  const chance = levelKey === 'masters' ? 0.07 : levelKey === 'expert' ? 0.05 : 0.03;
  if (Math.random() >= chance) return null;
  return huntingPick(generic.concat(family));
}

async function huntingPriorQualifications(supabase, animalId, family, specialization) {
  const { data, error } = await supabase
    .from('show_records')
    .select('hunting_family,hunting_specialization,hunting_level,passed,association_key')
    .eq('animal_id', animalId)
    .eq('association_key', 'hunting_club')
    .eq('hunting_family', family)
    .eq('hunting_specialization', specialization);

  if (error) throw new Error('Could not check Hunting Club title eligibility: ' + error.message);

  const counts = { beginners:0, expert:0, masters:0 };
  (data || []).forEach(record => {
    if (record.passed === true && counts[record.hunting_level] !== undefined) {
      counts[record.hunting_level]++;
    }
  });
  return counts;
}

async function runHuntingClub(rawData, showData) {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase is not ready.');

  const familyKey = $('huntingFamily')?.value || 'flushing';
  const specializationKey = $('huntingSpecialization')?.value || 'pheasant';
  const levelKey = $('huntingLevel')?.value || 'beginners';

  const family = SS_HUNTING_FIELD_TESTS[familyKey];
  const specialization = family?.specializations?.[specializationKey];
  const level = SS_HUNTING_LEVELS[levelKey];

  if (!family || !specialization || !level) {
    throw new Error('Choose a Hunting Field Test family, specialization, and level.');
  }

  const animalMap = await loadAnimalsMap(supabase);
  const entries = herdingEntryLines(rawData);

  if (!entries.length) throw new Error('No Hunting Field Test entries found.');

  const lines = [];
  const records = [];
  const declined = [];

  addLine(lines, bold('Hunting Club Field Test'));
  addLine(lines, bold(level.label + ' ' + family.label + ' — ' + specialization.label));
  addLine(lines, 'Qualification: ' + level.passScore + '/200 overall • minimum ' +
    level.categoryMinimum + '/40 in every category');
  addLine(lines, '');

  for (const rawEntry of entries) {
    const match = findAnimal(rawEntry, animalMap);

    if (match.status !== 'matched') {
      declined.push({
        entry: rawEntry,
        reason: match.status === 'ambiguous'
          ? 'Duplicate exact registry name'
          : 'Exact registry animal not found'
      });
      continue;
    }

    const animal = match.animal;

    if (cleanLine(animal.species).toLowerCase() !== 'dog') {
      declined.push({ entry: rawEntry, reason:'Hunting Club Field Tests are dogs only' });
      continue;
    }

    const prior = await huntingPriorQualifications(
      supabase, animal.id, familyKey, specializationKey
    );

    if (levelKey === 'expert' && prior.beginners < SS_HUNTING_LEVELS.beginners.titleQs) {
      declined.push({
        entry: rawEntry,
        reason: 'Requires the Beginners ' + family.label + ' — ' + specialization.label + ' title'
      });
      continue;
    }

    if (levelKey === 'masters' && prior.expert < SS_HUNTING_LEVELS.expert.titleQs) {
      declined.push({
        entry: rawEntry,
        reason: 'Requires the Expert ' + family.label + ' — ' + specialization.label + ' title'
      });
      continue;
    }

    const scenario = huntingScenario(levelKey);
    const scores = family.categories.map(category => ({
      category,
      score: huntingCategoryScore(levelKey, scenario, category)
    }));

    const total = scores.reduce((sum,row) => sum + row.score, 0);
    const categoryPass = scores.every(row => row.score >= level.categoryMinimum);
    const dqReason = huntingDqReason(familyKey, levelKey);
    const qualified = !dqReason && total >= level.passScore && categoryPass;

    addLine(lines, bold(rawEntry));
    addLine(lines,
      'Scenario: ' + scenario.terrain + ' • ' + scenario.weather + ' • ' +
      scenario.scent + ' • ' + scenario.distraction + ' • ' + scenario.quarry
    );
    scores.forEach(row => addLine(lines, row.category + ': ' + row.score + '/40'));

    if (dqReason) {
      addLine(lines, bold(total + '/200 — DQ'));
      addLine(lines, 'DQ: ' + dqReason);
    } else {
      addLine(lines, bold(total + '/200 — ' + (qualified ? 'QUALIFIED' : 'NOT QUALIFIED')));
      if (!categoryPass) {
        const failed = scores
          .filter(row => row.score < level.categoryMinimum)
          .map(row => row.category)
          .join(', ');
        addLine(lines, 'Minimum category requirement not met: ' + failed);
      }
    }
    addLine(lines, '');

    records.push({
      show_name: showData.showName,
      show_type: 'activity',
      show_scope: 'association',
      association_key: 'hunting_club',
      association_event_type: 'field_test',
      activity_key: null,
      class_name: 'Hunting Field Test - ' + family.label + ' - ' + specialization.label + ' - ' + level.label,
      placement: dqReason ? 'DQ' : (qualified ? 'Qualified' : 'Not Qualified'),
      animal_name: rawEntry,
      points: 0,
      score: total,
      max_score: 200,
      passed: qualified,
      score_label: dqReason ? 'DQ' : (qualified ? 'Qualified' : 'Not Qualified'),
      hunting_family: familyKey,
      hunting_specialization: specializationKey,
      hunting_level: levelKey
    });
  }

  if (declined.length) {
    addLine(lines, bold('Declined Entries'));
    declined.forEach(item => addLine(lines, item.entry + ' — DECLINED: ' + item.reason));
  }

  return { lines, records };
}

function tagAssociationRecords(result, associationKey, eventType) {
  const tagged = result || { lines: [], records: [] };
  (tagged.records || []).forEach(record => {
    record.association_key = associationKey;
    record.association_event_type = eventType;
  });
  return tagged;
}

function parseIcelandicBreeding(rawData) {
  const lines = String(rawData || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(cleanLine);

  const classes = [];
  let current = null;

  lines.forEach(line => {
    if (!line) return;

    if (line.includes(' - ')) {
      if (current) current.entries.push(line);
      return;
    }

    // Historical IHASS breeding shows use Class 1A-4C and may include a
    // description after the class code, e.g. "Class 2C: 5yo Mares".
    // Accept those directly, while still allowing custom future class headings.
    if (/^class\s+[1-4][abc](?:\s*[:.-]\s*.*)?$/i.test(line) || /^breeding\s+class\b/i.test(line)) {
      current = { name: line, entries: [] };
      classes.push(current);
      return;
    }

    current = { name: line, entries: [] };
    classes.push(current);
  });

  return classes.filter(cls => cls.entries.length);
}

function randomIcelandicBreedingScore() {
  // Existing IHASS breeding-show design: 50.00-150.00.
  return Number((Math.random() * 100 + 50).toFixed(2));
}

function runIcelandicBreeding(rawData, showData) {
  const classes = parseIcelandicBreeding(rawData);
  if (!classes.length) {
    throw new Error('No valid IHASS Breeding Show classes found. Use a class heading followed by Animal Name - Owner entries.');
  }

  const lines = [];
  const records = [];

  addLine(lines, bold('IHASS Breeding Show'));
  addLine(lines, '');

  classes.forEach((cls, classIndex) => {
    if (classIndex > 0) addLine(lines, '');
    addLine(lines, bold(cls.name));

    const ranked = cls.entries.map(animal => ({
      animal,
      score: randomIcelandicBreedingScore()
    })).sort((a, b) => b.score - a.score);

    ranked.forEach((horse, index) => {
      const place = index + 1;
      const certificate = horse.score >= 120;
      const points = SS_CONFIG.placementPoints[place] || 0;

      addLine(
        lines,
        placementLabel(place) + ' ' + horse.animal +
        ' - ' + horse.score.toFixed(2) + '/150' +
        (certificate ? ' - Breeding Stock Certificate' : '')
      );

      records.push({
        show_name: showData.showName,
        show_type: 'conformation',
        show_scope: 'association',
        association_key: 'ihass',
        association_event_type: 'breeding',
        activity_key: null,
        class_name: 'IHASS Breeding Show - ' + cls.name,
        placement: String(place),
        animal_name: horse.animal,
        points,
        score: horse.score,
        max_score: 150,
        passed: certificate,
        score_label: certificate ? 'Breeding Stock Certificate' : 'Breeding Score'
      });
    });
  });

  return { lines, records };
}

function runIcelandicClub(rawData, showData) {
  // Keep IHASS routing completely independent from the other specialty systems.
  // This prevents stale/hidden specialty controls from leaking a null object into
  // the Icelandic runner when switching between association tabs.
  const eventType = cleanLine(
    showData && (
      showData.associationEventType ||
      showData.specialtyEventType ||
      showData.herdingEventType
    ) || 'halter'
  ).toLowerCase();

  if (eventType === 'halter') {
    // Run through the normal conformation engine so every earned point also
    // contributes to ordinary Show Standard conformation totals/titles.
    const normalShowData = Object.assign({}, showData, {
      showType: 'all-breed',
      associationKey: 'ihass',
      associationEventType: 'halter'
    });

    return tagAssociationRecords(
      runConformation(rawData, normalShowData),
      'ihass',
      'halter'
    );
  }

  if (eventType === 'gaiting') {
    // Run through the normal Gaiting activity engine. These points therefore
    // count once toward ordinary Gaiting and are also filterable for IHASS.
    const normalShowData = Object.assign({}, showData, {
      showType: 'activity-divided',
      activityKey: 'gaiting',
      associationKey: 'ihass',
      associationEventType: 'gaiting'
    });

    return tagAssociationRecords(
      runActivity(rawData, normalShowData),
      'ihass',
      'gaiting'
    );
  }

  if (eventType === 'breeding') {
    return runIcelandicBreeding(rawData, showData);
  }

  throw new Error('Unknown Icelandic Horse Club event type.');
}

async function loadTestingEligibilityContext(rawData, showData, eventType) {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase is not ready. Refresh and try again.');

  const animalMap = await loadAnimalsMap(supabase);
  const entries = herdingEntryLines(rawData);
  if (!entries.length) throw new Error('No valid testing entries found. Use: Animal Name - Owner');

  const accepted = [], declined = [];

  for (const rawEntry of entries) {
    const match = findAnimal(rawEntry, animalMap);
    if (match.status === 'not-found') { declined.push({entry:rawEntry,reason:'Exact registry animal not found'}); continue; }
    if (match.status === 'ambiguous') { declined.push({entry:rawEntry,reason:'Duplicate exact registry name'}); continue; }

    const animal=match.animal;
    const species=cleanLine(animal.species).toLowerCase();
    if (species !== cleanLine(showData.species).toLowerCase()) {
      declined.push({entry:rawEntry,reason:'Registry species does not match selected species'}); continue;
    }
    if (eventType==='cgc' && species!=='dog') {
      declined.push({entry:rawEntry,reason:'CGC is dogs only'}); continue;
    }

    const {data:prior,error}=await supabase.from('show_records')
      .select('id,animal_id,class,activity_key,passed,score,score_label,event_date')
      .eq('animal_id',animal.id).order('event_date',{ascending:true});
    if(error) throw new Error('Eligibility check failed for '+animal.name+': '+error.message);
    const records=prior||[];

    if(eventType==='temperament'){
      const attempted=records.some(r =>
        cleanLine(r.activity_key).toLowerCase()==='temperament_test' ||
        cleanLine(r.class).toLowerCase().includes('temperament test')
      );
      if(attempted){declined.push({entry:rawEntry,reason:'Temperament Test may only be attempted once'});continue;}
    }

    let cgcLevel=null;
    if(eventType==='cgc'){
      const levels=[
        {key:'cgc',code:'CGC',label:'Canine Good Citizen'},
        {key:'cgcb',code:'CGCB',label:'Canine Good Citizen Bronze'},
        {key:'cgcs',code:'CGCS',label:'Canine Good Citizen Silver'},
        {key:'cgcg',code:'CGCG',label:'Canine Good Citizen Gold'},
        {key:'cgca',code:'CGCA',label:'Canine Good Citizen Advanced'},
        {key:'cgcu',code:'CGCU',label:'Canine Good Citizen Urban'}
      ];
      const passed=new Set();
      records.forEach(r=>{
        if(r.passed!==true)return;
        const key=cleanLine(r.activity_key).toLowerCase();
        const cls=cleanLine(r.class).toLowerCase();
        const lbl=cleanLine(r.score_label).toLowerCase();
        levels.forEach(level=>{
          if(key===level.key || cls===level.label.toLowerCase() || lbl===level.code.toLowerCase()) passed.add(level.key);
        });
      });
      cgcLevel=levels.find(level=>!passed.has(level.key))||null;
      if(!cgcLevel){declined.push({entry:rawEntry,reason:'All CGC levels already earned'});continue;}
      const i=levels.findIndex(level=>level.key===cgcLevel.key);
      if(i>0 && !passed.has(levels[i-1].key)){
        declined.push({entry:rawEntry,reason:'Previous CGC level has not been earned'});continue;
      }
    }
    accepted.push({rawEntry,animal,cgcLevel});
  }
  return {accepted,declined};
}

async function runTestingSystem(rawData,showData){
  const eventType=showData.specialtyEventType||showData.herdingEventType||'temperament';

  // Testing systems only understand these three events. Guard against stale
  // specialty UI state so an association event such as IHASS 'breeding' can
  // never fall through to the CGC branch and dereference a null level object.
  if (!['temperament','therapy','cgc'].includes(eventType)) {
    throw new Error('Invalid testing event "' + eventType + '". Re-select the specialty system and event.');
  }

  const {accepted,declined}=await loadTestingEligibilityContext(rawData,showData,eventType);
  if(!accepted.length){
    throw new Error('No eligible testing entries. '+declined.map(x=>x.entry+': '+x.reason).join('; '));
  }

  const lines=[],records=[];
  const species=cleanLine(showData.species).toLowerCase();
  const speciesSuffix=species==='dog'?'D':species==='cat'?'C':'H';
  const heading=eventType==='temperament'?'Temperament Test':eventType==='therapy'?'Therapy Animal Test':'Canine Good Citizen Test';
  addLine(lines,bold(heading)); addLine(lines,'');

  accepted.forEach(item=>{
    if(eventType==='temperament'||eventType==='therapy'){
      const score=Math.floor(Math.random()*201);
      const passed=score>=110;
      const code=(eventType==='temperament'?'TT':'TA')+speciesSuffix;
      const className=eventType==='temperament'?'Temperament Test':'Therapy Animal Test';
      addLine(lines,item.rawEntry+' - '+score+'/200 - '+(passed?'Pass':'Fail'));
      activityRecord(records,showData,className,className,{name:item.rawEntry,score,passed},1,passed?'Pass':'Fail');
      const r=records[records.length-1];
      r.activity_key=eventType==='temperament'?'temperament_test':'therapy_animal';
      r.class_name=className; r.points=0; r.score=score; r.max_score=200; r.passed=passed;
      r.score_label=passed?code:'Fail';
    }else{
      const level=item.cgcLevel;
      const passed=Math.random()<0.5;
      addLine(lines,item.rawEntry+' - '+level.label+' ('+level.code+') - '+(passed?'Pass':'Fail'));
      activityRecord(records,showData,level.label,level.label,{name:item.rawEntry,passed},1,passed?'Pass':'Fail');
      const r=records[records.length-1];
      r.activity_key=level.key; r.class_name=level.label; r.points=0; r.score=null; r.max_score=null; r.passed=passed;
      r.score_label=passed?level.code:'Fail';
    }
  });

  if(declined.length){
    addLine(lines,''); addLine(lines,bold('Declined Entries'));
    declined.forEach(x=>addLine(lines,x.entry+' - DECLINED: '+x.reason));
  }
  return {lines,records};
}

function runActivity(rawData, showData) {
  const type = showData.showType;
  const scored = type.includes('scored');
  const noDivisions = type.includes('no-division');
  const bestInField = type.includes('best-in-field');
  const parsedActivities = noDivisions ? parseActivityNoDivisions(rawData, scored) : parseActivityWithDivisions(rawData, scored);
  const activities = mergeActivityBlocks(parsedActivities);
  if (!activities.length) throw new Error('No valid activity entries found.');
  const lines = [], records = [];

  activities.forEach(activityBlock => {
    addLine(lines, bold(activityBlock.activity));
    addLine(lines, '');
    const fieldCandidates = [];

    if (!noDivisions && activityBlock.division) {
      addLine(lines, bold(activityBlock.division));
      addLine(lines, '');
    }

    activityBlock.classes.forEach(cls => {
      const randomizedEntries = shuffle(cls.entries);
      const dividedGroups = noDivisions ? [randomizedEntries] : splitBalancedActivityGroups(randomizedEntries);

      dividedGroups.forEach((groupEntries, groupIndex) => {
        const classLabel = dividedGroups.length > 1 ? cls.name + ' - Group ' + (groupIndex + 1) : cls.name;
        const entries = scored ? groupEntries.slice().sort((a,b) => b.score - a.score) : groupEntries;

        addLine(lines, bold(classLabel));
        entries.forEach((entry, i) => {
          const suffix = scored
            ? ' - ' + entry.score
            : (typeof entry.passed === 'boolean' ? ' - ' + (entry.passed ? 'Pass' : 'Fail') : '');

          // Pack/team/brace activity entries display as one unit, but each animal in
          // the entry receives the class placement points in show_records.
          addLine(lines, placementLabel(i + 1) + ' ' + entry.name + suffix);
          activityRecordForEntry(records, showData, activityBlock.activity, classLabel, entry, i + 1, null, true);
        });

        // Best in Field is made from the 1st place entry of each class/group.
        // If that winner is a pack/team/brace, its individual dogs enter the final.
        if (entries[0]) {
          fieldCandidates.push(...bestInFieldFinalistsFromEntry(entries[0], classLabel));
        }
        addLine(lines, '');
      });
    });

    if (bestInField && fieldCandidates.length) {
      const ranked = scored ? fieldCandidates.slice().sort((a,b) => b.score - a.score) : shuffle(fieldCandidates);

      // Best in Field is one undivided final class. No Reserve Best in Field.
      // The winner is stored once as placement "Best in Field" WITH first-place points.
      // Other finalists keep normal placement records.
      addLine(lines, bold('Best in Field'));
      ranked.forEach((entry, i) => {
        const suffix = scored ? ' - ' + entry.score : '';
        const displayPlacement = placementLabel(i + 1);
        const recordPlacement = i === 0 ? 'Best in Field' : String(i + 1);

        addLine(lines, displayPlacement + ' ' + entry.name + suffix);
        activityRecord(records, showData, activityBlock.activity, 'Best in Field', entry, recordPlacement, null);
      });
      addLine(lines, '');

      const best = ranked[0];
      if (best) {
        addLine(lines, bold('Best in Field') + ': ' + best.name + (scored ? ' - ' + best.score : ''));
      }
    }

    addLine(lines, '');
    addLine(lines, '[hr]');
    addLine(lines, '');
  });

  return { lines, records };
}


// =============================================================
// 6. SORT-ONLY MODULE
// =============================================================
function classSortValue(name) {
  const s = cleanLine(name).toLowerCase();
  const m = s.match(/^class\s+(\d+)(a)?/i);
  if (!m) return 9999;
  const num = parseInt(m[1], 10);
  const female = !!m[2];
  return (female ? 1000 : 0) + num;
}
function sortConformationEntries(rawData) {
  const groups = mergeConformationGroups(parseConformation(rawData));
  if (!groups.length) throw new Error('No valid conformation entries found to sort.');

  const lines = [];
  groups.forEach(group => {
    addLine(lines, group.name);
    group.breeds
      .slice()
      .sort((a,b) => a.name.localeCompare(b.name))
      .forEach(breed => {
        addLine(lines, breed.name.toUpperCase());
        breed.classes
          .slice()
          .sort((a,b) => classSortValue(a.name) - classSortValue(b.name) || a.name.localeCompare(b.name))
          .forEach(cls => {
            addLine(lines, cls.name);
            cls.entries
              .slice()
              .sort((a,b) => removeDecorations(a).localeCompare(removeDecorations(b)))
              .forEach(entry => addLine(lines, entry));
            addLine(lines, '');
          });
      });
    addLine(lines, '');
  });

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
function sortEntriesOnly() {
  hideMessage();
  const rawData = $('rawData').value;
  $('resultsContainer').className = 'hidden';
  $('resultsContainer').innerHTML = '';
  savedResults = ''; savedShowData = null; savedRecords = [];
  if (!rawData.trim()) { showMessage('error', 'Please paste entries before sorting.'); return; }
  try {
    savedResults = sortConformationEntries(rawData);
    renderSortedResults(savedResults);
    showMessage('success', 'Entries sorted for copying only. No show records were created and nothing is ready to upload.');
    captureWorkspaceState();
  } catch (err) {
    showMessage('error', '<strong>ERROR:</strong> ' + String(err.message || err));
  }
}

// =============================================================
// 6. FORMATTER / UI
// =============================================================
function buildFinalOutput(showData, lines) {
  let output = '';
  if (showData.bannerUrl) output += '[img]' + showData.bannerUrl + '[/img]\n\n';
  if (showData.showName) output += '[b][size=5]' + showData.showName + '[/size][/b]\n\n';
  output += lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return output.trim();
}
function renderResults(finalOutput) {
  const el = $('resultsContainer');
  el.innerHTML = '<div class="ss-results-header"><h2>Show Results</h2><div class="ss-button-row"><button class="ss-button" onclick="SSRandomizer.copyResults()">📋 Copy Results</button><button id="uploadButton" class="ss-button" onclick="SSRandomizer.upload()">💾 Upload to Animal Show Records</button></div></div><div class="ss-results-content" id="resultsText">' + escapeHtml(finalOutput).replace(/\n/g, '<br>') + '</div>';
  el.className = 'ss-results';
}
function renderSortedResults(finalOutput) {
  const el = $('resultsContainer');
  el.innerHTML = '<div class="ss-results-header"><h2>Sorted Entries</h2><div class="ss-button-row"><button class="ss-button" onclick="SSRandomizer.copyResults()">📋 Copy Sorted Entries</button></div></div><div class="ss-results-content" id="resultsText">' + escapeHtml(finalOutput).replace(/\n/g, '<br>') + '</div>';
  el.className = 'ss-results';
}
async function randomizeShow() {
  hideMessage();

  const rawData = $('rawData').value;
  const isChampionship = selectedChampionshipMode() === 'championship' && selectedEventCategory() !== 'herding';
  const showType = resolveLegacyShowType();
  const specialtyEventSelect = $('herdingEventType');
  const specialtyEventValue = specialtyEventSelect ? specialtyEventSelect.value : null;

  const showData = {
    showName: cleanLine($('showName').value) || 'Untitled Show',
    bannerUrl: cleanLine($('bannerUrl').value),
    species: $('showSpecies').value,
    eventCategory: selectedEventCategory(),
    showType,
    activityKey: $('activityKey') ? $('activityKey').value : null,
    rawData,
    isChampionship,
    seriesName: isChampionship
      ? cleanLine($('championshipSeries').value)
      : cleanLine($('seriesName').value),
    seriesRound: isChampionship
      ? null
      : cleanLine($('seriesRound').value),
    herdingEventType: specialtyEventValue,
    specialtyEventType: specialtyEventValue,
    associationKey:
      activeRandomizerTab === 'specialty' && $('showFormat')?.value === 'icelandic_horse_club'
        ? 'ihass'
        : activeRandomizerTab === 'specialty' && $('showFormat')?.value === 'endurance_club'
          ? 'endurance_club'
          : activeRandomizerTab === 'specialty' && $('showFormat')?.value === 'hunting_club'
            ? 'hunting_club'
            : null,
    associationEventType:
      activeRandomizerTab === 'specialty' &&
      ['icelandic_horse_club','endurance_club','hunting_club'].includes($('showFormat')?.value)
        ? specialtyEventValue
        : null
  };

  $('resultsContainer').className = 'hidden';
  $('resultsContainer').innerHTML = '';

  savedResults = '';
  savedShowData = null;
  savedRecords = [];

  if (!showData.species) {
    showMessage('error', 'Please select the show species.');
    return;
  }

  if (activeRandomizerTab === 'specialty') {
    const systemKey = $('showFormat') ? $('showFormat').value : '';
    const system = SS_SPECIALTY_SYSTEMS.find(item => item.key === systemKey);

    if (!system) {
      showMessage('error', 'Please select a specialty system.');
      return;
    }

    if (!system.active) {
      showMessage('error', escapeHtml(system.display_name) + ' is reserved for the association-title build and is not active yet.');
      return;
    }
  }

  if (!isChampionship && !rawData.trim()) {
    showMessage('error', 'Please paste entries before randomizing.');
    return;
  }

  try {
    let result;

    if (isChampionship) {
      result = await buildChampionshipQualifiers(showData, false);
    } else if (showData.showType === 'herding-club') {
      result = runHerdingClub(rawData, showData);
    } else if (/^specialty-testing-system-/.test(showData.showType)) {
      result = await runTestingSystem(rawData, showData);
    } else if (showData.showType === 'specialty-icelandic-horse-club') {
      result = runIcelandicClub(rawData, showData);
    } else if (showData.showType === 'specialty-endurance-club') {
      result = await runEnduranceClub(rawData, showData);
    } else if (showData.showType === 'specialty-hunting-club') {
      result = await runHuntingClub(rawData, showData);
    } else if (getShowTypeKind(showData.showType, showData) === 'activity') {
      result = runActivity(rawData, showData);
    } else {
      result = runConformation(rawData, showData);
    }

    savedResults = buildFinalOutput(showData, result.lines);
    savedShowData = showData;
    savedRecords = result.records;
    renderResults(savedResults);
    captureWorkspaceState();

  } catch (err) {
    showMessage('error', '<strong>ERROR:</strong> ' + escapeHtml(String(err.message || err)));
  }
}
function clearData() {
  const label =
    activeRandomizerTab === 'conformation' ? 'Conformation' :
    activeRandomizerTab === 'activities' ? 'Standard Activities' :
    'Specialty / Association';

  if (!confirm('Clear the ' + label + ' workspace?\\n\\nThis clears only this tab. The other randomizer tabs will stay untouched.')) {
    return;
  }

  randomizerWorkspaceState[activeRandomizerTab] = null;
  restoreWorkspaceState(activeRandomizerTab);
}
function copyResults() {
  navigator.clipboard.writeText(savedResults || '').then(() => showMessage('success', 'Results copied.')).catch(() => alert('Could not copy results. Please select and copy manually.'));
}
window.SSRandomizer = {
  run: randomizeShow,
  sort: sortEntriesOnly,
  clear: clearData,
  copyResults,
  upload: uploadShowRecords,
  previewChampionship,
  status: {
    standardConformation: true,
    standardActivities: true,
    conformationChampionships: true,
    activityChampionships: true,
    uploadEnabled: true,
    specialtyAssociationsInProgress: true
  }
};
})();
