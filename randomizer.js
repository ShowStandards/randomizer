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
    'TOYS','TERRIERS','GUNDOGS','HOUNDS','WORKING','NON-SPORTING','HERDING',
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
function getShowTypeKind(showType) {
  const type = String(showType || '');
  return (type.startsWith('activity') || type === 'herding-club') ? 'activity' : 'conformation';
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
  'FFA','VBC','VNC','TTC','ATC',
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
    show_type: getShowTypeKind(showData.showType),
    show_scope: getShowScope(showData.showType),
    import_type: 'randomizer',
    series_name: showData.seriesName || null,
    series_round: Number.isFinite(Number(showData.seriesRound)) && String(showData.seriesRound || '').trim() !== ''
      ? Number(showData.seriesRound)
      : null,
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
  if (!savedShowData || !savedResults || !savedRecords.length) {
    alert('Please run a show first before uploading.');
    return;
  }
  const supabase = getSupabase();
  if (!supabase) { alert('Supabase is not ready. Refresh and try again.'); return; }
  const btn = $('uploadButton');
  btn.disabled = true;
  btn.textContent = '⏳ Uploading...';
  showMessage('success', '<strong>Upload started.</strong><br>Loading animals and activity types...');
  try {
    const animalMap = await loadAnimalsMap(supabase);
    await loadActivityTypes(supabase);
    savedShowData.showDate = savedShowData.showDate || getTodayISODate();
    const upload = await createShowUpload(supabase, savedShowData, savedResults);
    const uploadId = upload && upload.id ? upload.id : null;
    const uploadedShowDate = (upload && (upload.show_date || upload.event_date || upload.date)) || savedShowData.showDate;
    const finalRecords = keepBestRecords(savedRecords);
    let inserted = 0, skipped = 0, failed = 0;
    let log = '<strong>Upload log</strong><br>Created show upload: ' + escapeHtml(savedShowData.showName) + '<br>Show date: ' + escapeHtml(uploadedShowDate) + '<br>Registry animals loaded: ' + Number(animalMap.__animalCount || 0) + '<br>Records prepared: ' + finalRecords.length + '<br>';
    for (const r of finalRecords) {
      const animalResult = findAnimal(r.animal_name, animalMap);

      if (animalResult.status === 'not-found') {
        skipped++;
        log += 'Skipped, exact animal name not found: ' + r.animal_name +
          ' <small>(searched as: ' + (removeDecorations(r.animal_name) || 'blank') + ')</small><br>';
        continue;
      }

      if (animalResult.status === 'ambiguous') {
        skipped++;
        log += 'Skipped, duplicate exact registry name: ' + r.animal_name +
          ' (' + animalResult.matches.map(match => match.name + ' #' + (match.animal_number || 'no number')).join(', ') + ')<br>';
        continue;
      }

      const animal = animalResult.animal;
      const payload = {
        upload_id: uploadId,
        animal_id: animal.id,
        animal_number: animal.animal_number || null,
        show_name: r.show_name,
        show_type: r.show_type,
        show_scope: r.show_scope || null,
        event_date: uploadedShowDate,
        class: r.class_name || (r.show_type === 'activity' ? 'Activity' : 'Class 1'),
        placement: r.placement,
        points: Number(r.points || 0),
        calculated_points: Number(r.points || 0),
        score: r.score !== null && r.score !== undefined ? Number(r.score) : null,
        max_score: r.max_score !== null && r.max_score !== undefined ? Number(r.max_score) : null,
        passed: typeof r.passed === 'boolean' ? r.passed : null,
        score_label: r.score_label || null,
        activity_key: r.activity_key || null
      };
      let { error } = await supabase.from('show_records').insert(payload);
      if (error && /score|max_score|passed|score_label|column/i.test(String(error.message || ''))) {
        const fallbackPayload = Object.assign({}, payload);
        delete fallbackPayload.score;
        delete fallbackPayload.max_score;
        delete fallbackPayload.passed;
        delete fallbackPayload.score_label;
        delete fallbackPayload.activity_key;
        const retry = await supabase.from('show_records').insert(fallbackPayload);
        error = retry.error;
      }
      if (error && /event_date|column/i.test(String(error.message || ''))) {
        const fallbackPayload = Object.assign({}, payload);
        delete fallbackPayload.event_date;
        delete fallbackPayload.score;
        delete fallbackPayload.max_score;
        delete fallbackPayload.passed;
        delete fallbackPayload.score_label;
        delete fallbackPayload.activity_key;
        const retry = await supabase.from('show_records').insert(fallbackPayload);
        error = retry.error;
      }
      if (error) { failed++; log += 'ERROR for ' + r.animal_name + ': ' + error.message + '<br>'; }
      else { inserted++; }
    }
    log += '<br><strong>Upload complete.</strong><br>Inserted: ' + inserted + '<br>Skipped: ' + skipped + '<br>Failed: ' + failed;
    showMessage(failed ? 'error' : 'success', log);
    captureWorkspaceState();
  } catch (err) {
    showMessage('error', '<strong>Upload failed:</strong><br>' + String(err.message || err));
  } finally {
    btn.disabled = false;
    btn.textContent = '💾 Upload to Animal Show Records';
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

  updatePhase1UI();
  await restoreChampionshipSelections(state);
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

const SS_SPECIALTY_SYSTEMS = [
  {
    key: 'herding_club',
    display_name: 'Herding Club',
    species: 'dog',
    active: true,
    title_system: true
  },
  {
    key: 'hunting_club',
    display_name: 'Hunting Club',
    species: 'dog',
    active: false,
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
    key: 'icelandic_horse_club',
    display_name: 'Icelandic Horse Club',
    species: 'horse',
    active: false,
    title_system: true
  },
  {
    key: 'endurance_club',
    display_name: 'Endurance Club',
    species: 'horse',
    active: false,
    title_system: true
  }
];

function specialtySystemsForSpecies(species) {
  const selected = cleanLine(species).toLowerCase();
  return SS_SPECIALTY_SYSTEMS.filter(system => system.species === selected);
}

function renderSpecialtySystemOptions() {
  if (activeRandomizerTab !== 'specialty' || !$('showFormat')) return;

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

  if (!$('showFormat').value && $('showFormat').options.length) {
    $('showFormat').selectedIndex = 0;
  }
}

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
  const isChampionship =
    selectedChampionshipMode() === 'championship' &&
    activeRandomizerTab !== 'specialty';

  renderShowFormatOptions();

  const runButton = $('ssRunButton');
  if (runButton) {
    runButton.disabled = false;
    runButton.textContent = isHerding
      ? '🎲 Run Specialty Event'
      : '🎲 Randomize Show';
  }

  $('activityOptionsPanel').className = isActivity ? 'ss-setup-card' : 'hidden';
  $('herdingPanel').className = isHerding ? 'ss-setup-card' : 'hidden';
  $('championshipModeField').className = isHerding ? 'hidden' : 'ss-field';
  $('championshipPanel').className = isChampionship ? 'ss-championship-panel' : 'hidden';
  $('normalSeriesFields').className = isChampionship ? 'hidden' : 'ss-series-grid';
  $('entriesField').className = isChampionship ? 'hidden' : 'ss-field';
  $('sortButton').className = (isChampionship || isActivity || isHerding)
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

  const parts = rawName.split(/\s+-\s+/).map(cleanLine).filter(Boolean);
  if (parts.length < 3) return [entry];

  const owner = parts[parts.length - 1];
  const members = parts.slice(0, -1);

  return members.map(memberName => ({
    name: memberName + ' - ' + owner,
    score: entry && entry.score !== undefined ? entry.score : undefined,
    sourcePackName: rawName
  }));
}
function activityRecordForEntry(records, showData, activity, className, entry, place, awardName, splitPackMembers) {
  const recordEntries = splitPackMembers ? splitPackActivityMembers(entry, className) : [entry];
  recordEntries.forEach(recordEntry => {
    activityRecord(records, showData, activity, className, recordEntry, place, awardName);
  });
}
function bestInFieldFinalistsFromEntry(entry, className) {
  // Pack/team/brace class winners qualify their individual dogs for Best in Field.
  // Normal activity winners qualify as a single finalist.
  return splitPackActivityMembers(entry, className);
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

    // Entry lines contain the SS Animal Name - Owner separator.
    if (line.includes(' - ')) {
      if (current) current.entries.push(line);
      return;
    }

    // Every other nonblank line is a Stakes class heading.
    // The final word is the stock; everything before it is the owner-chosen division.
    const words = line.split(' ').filter(Boolean);
    if (words.length < 2) {
      current = null;
      return;
    }

    const enteredStock = words.pop();
    const division = words.join(' ').trim();
    const stockKey = enteredStock.toLowerCase();

    const stockMap = {
      sheep: 'Sheep',
      cattle: 'Cattle',
      duck: 'Ducks',
      ducks: 'Ducks',
      reindeer: 'Reindeer'
    };

    const stock = stockMap[stockKey];
    if (!stock || !division) {
      current = null;
      return;
    }

    // Merge every repeated division + stock combination into one class.
    // The normalized key ignores capitalization, extra spacing, and Duck/Ducks.
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
      record.points = 0;
      record.score = null;
      record.max_score = null;
      record.score_label = null;
    });

    return { lines, records };
  }

  const classes = parseHerdingStakesClasses(rawData);
  if (!classes.length) {
    throw new Error('No valid Stakes classes found. Use Puppy Sheep on one line, followed by Animal Name - Owner on the next line.');
  }

  const activity = 'Herding Stakes';
  const maxScore = 300;
  const minScore = 100;
  addLine(lines, bold(activity));
  addLine(lines, '');

  classes.forEach((classBlock, classIndex) => {
    if (classIndex > 0) addLine(lines, '');
    addLine(lines, bold(classBlock.className));

    const entries = classBlock.entries.map(name => ({
      name,
      score: Math.floor(Math.random() * (maxScore - minScore + 1)) + minScore
    })).sort((a, b) => b.score - a.score);

    entries.forEach((entry, index) => {
      const place = index + 1;
      const qualified = entry.score >= 240;
      addLine(lines, placementLabel(place) + ' ' + entry.name + ' - ' + entry.score + (qualified ? ' - Qualified' : ''));
      activityRecord(records, showData, activity, classBlock.className, entry, place, null);
      const record = records[records.length - 1];
      record.max_score = 300;
      record.passed = qualified;
      record.score_label = qualified ? 'Qualified' : 'Not Qualified';
    });
  });

  return { lines, records };
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
    herdingEventType: $('herdingEventType').value
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
    } else if (getShowTypeKind(showData.showType) === 'activity') {
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
window.SSRandomizer = { run: randomizeShow, sort: sortEntriesOnly, clear: clearData, copyResults, upload: uploadShowRecords, previewChampionship };
})();
