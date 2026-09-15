/**
 * Ledgerly — Google Sheets backend
 * ---------------------------------------------------------------------------
 * Paste this into Extensions → Apps Script on the spreadsheet that Google Spark
 * (or anything else) writes your card transactions into, set SHARED_TOKEN
 * below, then Deploy → New deployment → Web app.
 *
 *   Execute as:      Me
 *   Who has access:  Anyone
 *
 * "Anyone" is what lets the app call the script without a Google sign-in.
 * The SHARED_TOKEN is what keeps strangers out — it must be a long random
 * string, and it is the only thing standing between the URL and your data.
 *
 * The script never sends data anywhere. It only answers requests that carry
 * your token.
 * ---------------------------------------------------------------------------
 */

/** REQUIRED. Replace with a long random string, then use the same one in the app. */
var SHARED_TOKEN = 'CHANGE-ME-to-a-long-random-string';

/**
 * Optional. The tab holding your transactions. Leave '' to auto-detect the
 * sheet that looks most like a transaction list.
 */
var SHEET_NAME = '';

/** Internal tabs the script manages. You should not need to touch these. */
var CONFIG_SHEET = 'Ledgerly Config';
var ARCHIVE_SHEET = 'Ledgerly Archive';

var VERSION = '1.0.0';

/** Columns the app needs. Any that your sheet lacks get appended on setup. */
var APP_COLUMNS = ['Category', 'Type', 'Who', 'Tags', 'Notes', 'Excluded', 'Reconciled', 'Ledgerly ID'];

/* ============================== entry points ============================== */

function doGet(e) {
  var params = (e && e.parameter) || {};
  try {
    requireToken(params.token);
    if (params.action === 'bootstrap') return json(ok(bootstrap()));
    return json(ok(ping()));
  } catch (err) {
    return json(fail(err));
  }
}

function doPost(e) {
  var body = {};
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (parseErr) {
    return json(fail(new Error('Request body was not valid JSON.')));
  }

  try {
    requireToken(body.token);
    var payload = body.payload || {};
    switch (body.action) {
      case 'ping':
        return json(ok(ping()));
      case 'bootstrap':
        return json(ok(bootstrap()));
      case 'revision':
        return json(ok(revision()));
      case 'upsert':
        return json(ok(upsertTransactions(payload.transactions || [])));
      case 'delete':
        return json(ok(deleteTransactions(payload.ids || [])));
      case 'saveConfig':
        return json(ok(saveAppConfig(payload.config || {})));
      case 'setMapping':
        return json(ok(setMapping(payload.sheetName, payload.mapping)));
      case 'prepareSheet':
        return json(ok(prepareSheet(payload.sheetName)));
      default:
        throw new Error('Unknown action: ' + body.action);
    }
  } catch (err) {
    return json(fail(err));
  }
}

/* ================================ plumbing ================================ */

function requireToken(token) {
  if (!SHARED_TOKEN || SHARED_TOKEN === 'CHANGE-ME-to-a-long-random-string') {
    var e1 = new Error('The script still has the placeholder token. Open Apps Script and set SHARED_TOKEN.');
    e1.code = 'UNAUTHORIZED';
    throw e1;
  }
  if (token !== SHARED_TOKEN) {
    var e2 = new Error('Wrong access code for this Sheet.');
    e2.code = 'UNAUTHORIZED';
    throw e2;
  }
}

function ok(data) {
  return { ok: true, data: data };
}

function fail(err) {
  return {
    ok: false,
    error: (err && err.message) || String(err),
    code: (err && err.code) || 'ERROR',
  };
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function ss() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function ping() {
  var book = ss();
  return {
    spreadsheetName: book.getName(),
    sheets: book.getSheets().map(function (s) {
      return s.getName();
    }),
    version: VERSION,
  };
}

/**
 * A cheap change probe, so a polling client does not have to pull the whole
 * ledger every minute. `revision` moves when the app writes; `rowCount` moves
 * when anything appends rows to the sheet — which is what an automation such as
 * Google Spark does. A hand edit to an existing cell changes neither, so the
 * client still refetches in full whenever the person asks it to.
 */
function revision() {
  var state = getState();
  return {
    revision: readConfigValue('revision', 0) || 0,
    rowCount: Math.max(0, state.sheet.getLastRow() - state.headerRow),
    sheetName: state.sheet.getName(),
  };
}

/* ============================ config persistence ========================== */

function configSheet() {
  var book = ss();
  var sheet = book.getSheetByName(CONFIG_SHEET);
  if (!sheet) {
    sheet = book.insertSheet(CONFIG_SHEET);
    sheet.getRange(1, 1, 1, 2).setValues([['key', 'value']]).setFontWeight('bold');
    sheet.setColumnWidth(2, 640);
    sheet.hideSheet();
  }
  return sheet;
}

function readConfigValue(key, fallback) {
  var sheet = configSheet();
  var last = sheet.getLastRow();
  if (last < 2) return fallback;
  var rows = sheet.getRange(2, 1, last - 1, 2).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][0] === key) {
      try {
        return JSON.parse(rows[i][1]);
      } catch (err) {
        return fallback;
      }
    }
  }
  return fallback;
}

function writeConfigValue(key, value) {
  var sheet = configSheet();
  var serialized = JSON.stringify(value);
  var last = sheet.getLastRow();
  if (last >= 2) {
    var keys = sheet.getRange(2, 1, last - 1, 1).getValues();
    for (var i = 0; i < keys.length; i++) {
      if (keys[i][0] === key) {
        sheet.getRange(i + 2, 2).setValue(serialized);
        return;
      }
    }
  }
  sheet.appendRow([key, serialized]);
}

function bumpRevision() {
  var next = (readConfigValue('revision', 0) || 0) + 1;
  writeConfigValue('revision', next);
  return next;
}

/* =========================== sheet & column setup ========================= */

/** Header hints, longest/most specific first. Lowercased, punctuation stripped. */
var HINTS = {
  date: ['transaction date', 'posting date', 'posted date', 'date', 'التاريخ', 'تاريخ'],
  description: ['description', 'merchant', 'details', 'narrative', 'payee', 'name', 'memo', 'transaction', 'البيان', 'الوصف', 'التفاصيل'],
  amount: ['amount', 'value', 'total', 'debit', 'charge', 'spent', 'المبلغ', 'القيمة'],
  category: ['category', 'التصنيف', 'الفئة'],
  account: ['account', 'card', 'source', 'bank', 'wallet', 'البطاقة', 'الحساب'],
  type: ['type', 'direction', 'kind', 'النوع'],
  member: ['who', 'member', 'person', 'owner', 'paid by', 'user'],
  notes: ['notes', 'note', 'comment', 'remarks', 'ملاحظات'],
  tags: ['tags', 'labels'],
  excluded: ['excluded', 'exclude', 'ignore'],
  cleared: ['reconciled', 'cleared', 'checked'],
};

function normalizeHeader(h) {
  return String(h == null ? '' : h)
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[_\-.:/#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 100 = the header is exactly a hint, 70 = it starts or ends with one,
 * 50 = it contains one somewhere, 0 = no relation.
 */
function scoreHeader(normalized, hints) {
  var best = 0;
  for (var i = 0; i < hints.length; i++) {
    var hint = hints[i];
    if (!hint || hint.length > normalized.length) continue;
    if (normalized === hint) best = Math.max(best, 100);
    else if (normalized.slice(0, hint.length) === hint || normalized.slice(-hint.length) === hint)
      best = Math.max(best, 70);
    else if (normalized.indexOf(hint) !== -1) best = Math.max(best, 50);
  }
  return best;
}

var MAPPING_FIELDS = ['date', 'amount', 'description', 'category', 'account', 'type', 'member', 'notes', 'tags', 'excluded', 'cleared'];

/**
 * Matches sheet columns to fields in tiers: every exact match is settled before
 * any near match, so a loose hint on one field can never steal the column that
 * another field names outright ("Amount" must go to amount even if some other
 * field's hint happens to appear inside it).
 */
function detectMapping(headers) {
  var normalized = headers.map(normalizeHeader);
  var mapping = {};
  var takenColumn = {};
  var i, k, field;

  for (k = 0; k < MAPPING_FIELDS.length; k++) mapping[MAPPING_FIELDS[k]] = '';

  var tiers = [100, 70, 50];
  for (var t = 0; t < tiers.length; t++) {
    for (k = 0; k < MAPPING_FIELDS.length; k++) {
      field = MAPPING_FIELDS[k];
      if (mapping[field]) continue;
      for (i = 0; i < normalized.length; i++) {
        if (takenColumn[i] || !normalized[i]) continue;
        if (scoreHeader(normalized[i], HINTS[field]) === tiers[t]) {
          takenColumn[i] = true;
          mapping[field] = headers[i];
          break;
        }
      }
    }
  }
  return mapping;
}

/**
 * How strongly a row reads as a header row for a transaction list.
 * Real exports rarely start at A1 — a title, a blank spacer row or a leading
 * blank column are all common — so the header row is found, not assumed.
 */
function scoreHeaderRow(values) {
  var mapping = detectMapping(values);
  var score = 0;
  if (mapping.date) score += 3;
  if (mapping.amount) score += 3;
  if (mapping.description) score += 2;
  if (mapping.category) score += 1;
  if (mapping.account) score += 1;
  return score;
}

var HEADER_SEARCH_ROWS = 12;

/** Returns { row, headers, score } for the best header row in a sheet. */
function findHeaderRow(sheet) {
  var lastRow = sheet.getLastRow();
  var lastCol = Math.max(1, sheet.getLastColumn());
  if (lastRow < 1) return { row: 1, headers: [], score: 0 };

  var depth = Math.min(HEADER_SEARCH_ROWS, lastRow);
  var block = sheet.getRange(1, 1, depth, lastCol).getValues();

  var best = { row: 1, headers: [], score: -1 };
  for (var r = 0; r < depth; r++) {
    var values = block[r].map(function (h) {
      return String(h == null ? '' : h).trim();
    });
    // A header row is text, not data; a row of dates and numbers is not one.
    var textCells = 0;
    for (var c = 0; c < values.length; c++) {
      if (values[c] && isNaN(Number(values[c]))) textCells++;
    }
    if (textCells < 2) continue;

    var score = scoreHeaderRow(values);
    if (score > best.score) best = { row: r + 1, headers: values, score: score };
  }

  if (best.score < 0) {
    var first = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) {
      return String(h == null ? '' : h).trim();
    });
    return { row: 1, headers: first, score: 0 };
  }
  return best;
}

/** Picks the tab that looks most like a transaction list. */
function detectSheet() {
  var book = ss();
  if (SHEET_NAME) {
    var named = book.getSheetByName(SHEET_NAME);
    if (named) return named;
    throw new Error('No tab called "' + SHEET_NAME + '" in this spreadsheet.');
  }

  var saved = readConfigValue('sheetName', '');
  if (saved) {
    var savedSheet = book.getSheetByName(saved);
    if (savedSheet) return savedSheet;
  }

  var sheets = book.getSheets();
  var best = null;
  var bestScore = -1;
  for (var i = 0; i < sheets.length; i++) {
    var sheet = sheets[i];
    var name = sheet.getName();
    if (name === CONFIG_SHEET || name === ARCHIVE_SHEET) continue;
    if (sheet.getLastRow() < 2 || sheet.getLastColumn() < 2) continue;

    var found = findHeaderRow(sheet);
    // Row count is only a tie-breaker. A summary tab can be long and still not
    // be the ledger, so the columns decide and the size barely nudges.
    var score = found.score + Math.min(1, sheet.getLastRow() / 500);
    if (score > bestScore) {
      bestScore = score;
      best = sheet;
    }
  }

  if (!best) throw new Error('No tab in this spreadsheet looks like a transaction list.');
  return best;
}

function getState() {
  var sheet = detectSheet();
  var found = findHeaderRow(sheet);
  var saved = readConfigValue('mapping.' + sheet.getName(), null);
  var mapping = saved || detectMapping(found.headers);

  return {
    sheet: sheet,
    headerRow: found.row,
    firstDataRow: found.row + 1,
    headers: found.headers,
    mapping: mapping,
  };
}

function headerIndex(headers, name) {
  if (!name) return -1;
  for (var i = 0; i < headers.length; i++) {
    if (headers[i] === name) return i;
  }
  return -1;
}

/**
 * Adds the columns the app needs but the sheet doesn't have, then re-detects.
 * Nothing existing is moved or renamed — new columns go on the right.
 */
function prepareSheet(sheetName) {
  var lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    if (sheetName) writeConfigValue('sheetName', sheetName);
    var state = getState();
    var sheet = state.sheet;
    var headerRow = state.headerRow;
    var headers = state.headers.slice();
    var mapping = state.mapping;

    var needed = [
      { field: 'category', title: 'Category' },
      { field: 'type', title: 'Type' },
      { field: 'member', title: 'Who' },
      { field: 'tags', title: 'Tags' },
      { field: 'notes', title: 'Notes' },
      { field: 'excluded', title: 'Excluded' },
      { field: 'cleared', title: 'Reconciled' },
    ];

    var added = [];
    for (var i = 0; i < needed.length; i++) {
      var item = needed[i];
      if (mapping[item.field] && headerIndex(headers, mapping[item.field]) >= 0) continue;
      var title = uniqueHeader(headers, item.title);
      headers.push(title);
      mapping[item.field] = title;
      added.push(title);
    }

    // The id column is how edits survive rows being sorted or inserted.
    if (headerIndex(headers, 'Ledgerly ID') < 0) {
      headers.push('Ledgerly ID');
      added.push('Ledgerly ID');
    }

    if (added.length) {
      sheet.getRange(headerRow, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(headerRow, 1, 1, headers.length).setFontWeight('bold');
      sheet.setFrozenRows(headerRow);
    }

    writeConfigValue('mapping.' + sheet.getName(), mapping);
    writeConfigValue('sheetName', sheet.getName());
    bumpRevision();
    return bootstrap();
  } finally {
    lock.releaseLock();
  }
}

function uniqueHeader(headers, base) {
  var title = base;
  var n = 2;
  while (headerIndex(headers, title) >= 0) {
    title = base + ' ' + n;
    n++;
  }
  return title;
}

function setMapping(sheetName, mapping) {
  if (sheetName) writeConfigValue('sheetName', sheetName);
  var target = sheetName || detectSheet().getName();
  writeConfigValue('mapping.' + target, mapping);
  bumpRevision();
  return bootstrap();
}

/* ================================ reading ================================= */

function bootstrap() {
  var state = getState();
  var sheet = state.sheet;
  var headers = state.headers;
  var mapping = state.mapping;
  var firstDataRow = state.firstDataRow;

  var lastRow = sheet.getLastRow();
  var lastCol = Math.max(1, sheet.getLastColumn());
  var values = lastRow >= firstDataRow ? sheet.getRange(firstDataRow, 1, lastRow - firstDataRow + 1, lastCol).getValues() : [];

  var currencyIdx = -1;
  for (var h = 0; h < headers.length; h++) {
    if (normalizeHeader(headers[h]) === 'currency') currencyIdx = h;
  }

  var idx = {
    date: headerIndex(headers, mapping.date),
    description: headerIndex(headers, mapping.description),
    amount: headerIndex(headers, mapping.amount),
    type: headerIndex(headers, mapping.type),
    category: headerIndex(headers, mapping.category),
    account: headerIndex(headers, mapping.account),
    member: headerIndex(headers, mapping.member),
    notes: headerIndex(headers, mapping.notes),
    tags: headerIndex(headers, mapping.tags),
    excluded: headerIndex(headers, mapping.excluded),
    cleared: headerIndex(headers, mapping.cleared),
    id: headerIndex(headers, 'Ledgerly ID'),
  };

  var tz = ss().getSpreadsheetTimeZone();
  var signed = amountsAreSigned(values, idx.amount);
  var transactions = [];
  var missingIds = [];

  for (var r = 0; r < values.length; r++) {
    var row = values[r];
    if (isBlankRow(row)) continue;

    var iso = toIsoDate(idx.date >= 0 ? row[idx.date] : '', tz);
    var rawAmount = idx.amount >= 0 ? parseNumber(row[idx.amount]) : null;
    if (iso === null && rawAmount === null) continue;

    var id = idx.id >= 0 ? String(row[idx.id] || '').trim() : '';
    if (!id) {
      id = 'sh_' + Utilities.getUuid().replace(/-/g, '').slice(0, 14);
      if (idx.id >= 0) missingIds.push({ row: r + firstDataRow, id: id });
    }

    var typeCell = idx.type >= 0 ? String(row[idx.type] || '').trim() : '';
    var type = resolveType(typeCell, rawAmount, signed);
    var amount = rawAmount === null ? 0 : Math.abs(rawAmount);

    transactions.push({
      id: id,
      date: iso || '',
      description: idx.description >= 0 ? String(row[idx.description] == null ? '' : row[idx.description]).trim() : '',
      amount: amount,
      type: type,
      category: idx.category >= 0 ? String(row[idx.category] || '').trim() : '',
      account: idx.account >= 0 ? String(row[idx.account] || '').trim() : '',
      member: idx.member >= 0 ? String(row[idx.member] || '').trim() : '',
      notes: idx.notes >= 0 ? String(row[idx.notes] || '').trim() : '',
      tags: idx.tags >= 0 ? splitTags(row[idx.tags]) : [],
      excluded: idx.excluded >= 0 ? truthy(row[idx.excluded]) : false,
      cleared: idx.cleared >= 0 ? truthy(row[idx.cleared]) : false,
      source: 'sheet',
    });
  }

  // Backfill ids in one write so future edits can find these rows again.
  if (missingIds.length && idx.id >= 0) {
    for (var m = 0; m < missingIds.length; m++) {
      sheet.getRange(missingIds[m].row, idx.id + 1).setValue(missingIds[m].id);
    }
  }

  transactions.sort(function (a, b) {
    return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
  });

  return {
    transactions: transactions,
    config: readConfigValue('appConfig', {}),
    meta: {
      spreadsheetName: ss().getName(),
      sheetName: sheet.getName(),
      headerRow: state.headerRow,
      headers: headers,
      mapping: mapping,
      rowCount: transactions.length,
      // The app adopts this on first connect so nobody has to find the setting.
      detectedCurrency: dominantValue(values, currencyIdx),
      revision: readConfigValue('revision', 0) || 0,
      lastSyncedAt: new Date().toISOString(),
    },
  };
}

/** The value a column holds almost everywhere, or '' if it varies. */
function dominantValue(values, idx) {
  if (idx < 0 || !values.length) return '';
  var counts = {};
  var total = 0;
  for (var i = 0; i < values.length; i++) {
    var v = String(values[i][idx] == null ? '' : values[i][idx]).trim();
    if (!v) continue;
    counts[v] = (counts[v] || 0) + 1;
    total++;
  }
  var bestKey = '';
  var bestCount = 0;
  for (var k in counts) {
    if (counts[k] > bestCount) {
      bestCount = counts[k];
      bestKey = k;
    }
  }
  return total && bestCount / total >= 0.8 ? bestKey : '';
}

function isBlankRow(row) {
  for (var i = 0; i < row.length; i++) {
    if (row[i] !== '' && row[i] !== null && row[i] !== undefined) return false;
  }
  return true;
}

/** A column containing negatives carries direction in its sign. */
function amountsAreSigned(values, amountIdx) {
  if (amountIdx < 0) return false;
  for (var i = 0; i < values.length; i++) {
    var n = parseNumber(values[i][amountIdx]);
    if (n !== null && n < 0) return true;
  }
  return false;
}

function resolveType(typeCell, rawAmount, signed) {
  var t = String(typeCell || '').toLowerCase();
  if (t) {
    if (/transfer|tfr/.test(t)) return 'transfer';
    if (/income|credit|^cr$|deposit|refund|salary|in$/.test(t)) return 'income';
    if (/expense|debit|^dr$|withdrawal|purchase|out$/.test(t)) return 'expense';
  }
  if (signed && rawAmount !== null) return rawAmount < 0 ? 'expense' : 'income';
  return 'expense';
}

function parseNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  if (typeof value === 'number') return isNaN(value) ? null : value;

  var s = String(value).trim();
  if (!s) return null;

  // Arabic-Indic digits → ASCII.
  s = s.replace(/[٠-٩]/g, function (d) {
    return String(d.charCodeAt(0) - 0x0660);
  });

  var negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[^\d.,\-]/g, '');
  if (s.indexOf('-') === 0) {
    negative = true;
    s = s.slice(1);
  }
  s = s.replace(/-/g, '');
  if (!s) return null;

  var lastComma = s.lastIndexOf(',');
  var lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma > -1) {
    var tail = s.length - lastComma - 1;
    var commas = (s.match(/,/g) || []).length;
    s = commas === 1 && tail !== 3 ? s.replace(',', '.') : s.replace(/,/g, '');
  }

  var n = Number(s);
  if (isNaN(n)) return null;
  return negative ? -n : n;
}

function toIsoDate(value, tz) {
  if (value === '' || value === null || value === undefined) return null;
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, tz, 'yyyy-MM-dd');
  }
  if (typeof value === 'number' && value > 20000 && value < 80000) {
    var d = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    return Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd');
  }

  var s = String(value).trim();
  var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + pad2(m[2]) + '-' + pad2(m[3]);

  m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (m) {
    var a = Number(m[1]);
    var b = Number(m[2]);
    var day = a > 12 ? a : b;
    var month = a > 12 ? b : a;
    if (a <= 12 && b <= 12) {
      // Ambiguous — trust the spreadsheet's own locale, which is month-first
      // for en-US and day-first elsewhere.
      var monthFirst = tz && tz.indexOf('America') === 0;
      day = monthFirst ? b : a;
      month = monthFirst ? a : b;
    }
    var year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return year + '-' + pad2(month) + '-' + pad2(day);
  }

  var parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return Utilities.formatDate(parsed, tz, 'yyyy-MM-dd');
  return null;
}

function pad2(n) {
  return ('0' + n).slice(-2);
}

function splitTags(value) {
  if (!value) return [];
  return String(value)
    .split(/[;,]/)
    .map(function (t) {
      return t.trim();
    })
    .filter(function (t) {
      return !!t;
    });
}

function truthy(value) {
  if (value === true) return true;
  if (value === false || value === '' || value === null || value === undefined) return false;
  return /^(y|yes|true|1|x|✓)$/i.test(String(value).trim());
}

/* ================================ writing ================================= */

function upsertTransactions(transactions) {
  if (!transactions.length) return { revision: readConfigValue('revision', 0) || 0, transactions: [] };

  var lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    var state = getState();
    var sheet = state.sheet;
    var headers = state.headers;
    var mapping = state.mapping;
    var firstDataRow = state.firstDataRow;

    var idCol = headerIndex(headers, 'Ledgerly ID');
    if (idCol < 0) {
      // Without an id column there is no safe way to update a specific row.
      prepareSheet(sheet.getName());
      state = getState();
      sheet = state.sheet;
      headers = state.headers;
      mapping = state.mapping;
      firstDataRow = state.firstDataRow;
      idCol = headerIndex(headers, 'Ledgerly ID');
    }

    var lastRow = sheet.getLastRow();
    var lastCol = Math.max(1, sheet.getLastColumn());
    var values = lastRow >= firstDataRow ? sheet.getRange(firstDataRow, 1, lastRow - firstDataRow + 1, lastCol).getValues() : [];

    var rowById = {};
    for (var r = 0; r < values.length; r++) {
      var existingId = String(values[r][idCol] || '').trim();
      if (existingId) rowById[existingId] = r + firstDataRow;
    }

    var signed = amountsAreSigned(values, headerIndex(headers, mapping.amount));
    var dateIsDate = datesAreDateObjects(values, headerIndex(headers, mapping.date));
    var appends = [];

    for (var i = 0; i < transactions.length; i++) {
      var txn = transactions[i];
      var target = rowById[txn.id];
      // `values` starts at firstDataRow, so index back from there — not from a
      // hardcoded row 2, or every untouched column is copied off a neighbour.
      var existingRow = target ? values[target - firstDataRow] : null;
      var rowValues = buildRow(txn, headers, mapping, idCol, signed, dateIsDate, existingRow);

      if (target) {
        sheet.getRange(target, 1, 1, headers.length).setValues([rowValues]);
      } else {
        appends.push(rowValues);
      }
    }

    if (appends.length) {
      var appendAt = Math.max(sheet.getLastRow() + 1, firstDataRow);
      sheet.getRange(appendAt, 1, appends.length, headers.length).setValues(appends);
    }

    return { revision: bumpRevision(), transactions: transactions };
  } finally {
    lock.releaseLock();
  }
}

function datesAreDateObjects(values, dateIdx) {
  if (dateIdx < 0) return true;
  for (var i = 0; i < values.length && i < 50; i++) {
    var v = values[i][dateIdx];
    if (v === '' || v === null) continue;
    return Object.prototype.toString.call(v) === '[object Date]';
  }
  return true;
}

/**
 * Builds a full row. Columns the app doesn't own keep whatever was already
 * there — Google Spark's extra columns are never clobbered.
 */
function buildRow(txn, headers, mapping, idCol, signed, dateIsDate, existingRow) {
  var row = [];
  for (var i = 0; i < headers.length; i++) {
    row.push(existingRow && i < existingRow.length ? existingRow[i] : '');
  }

  function put(field, value) {
    var idx = headerIndex(headers, mapping[field]);
    if (idx >= 0) row[idx] = value;
  }

  if (txn.date) {
    var dateIdx = headerIndex(headers, mapping.date);
    if (dateIdx >= 0) {
      var parts = txn.date.split('-');
      row[dateIdx] = dateIsDate
        ? new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
        : txn.date;
    }
  }

  put('description', txn.description || '');
  put('amount', signed && txn.type === 'expense' ? -Math.abs(txn.amount) : Math.abs(txn.amount));
  put('type', txn.type || 'expense');
  put('category', txn.category || '');
  put('account', txn.account || '');
  put('member', txn.member || '');
  put('notes', txn.notes || '');
  put('tags', (txn.tags || []).join('; '));
  put('excluded', txn.excluded ? 'yes' : '');
  put('cleared', txn.cleared ? 'yes' : '');

  if (idCol >= 0) row[idCol] = txn.id;
  return row;
}

function deleteTransactions(ids) {
  if (!ids.length) return { revision: readConfigValue('revision', 0) || 0, deleted: [] };

  var lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    var state = getState();
    var sheet = state.sheet;
    var headers = state.headers;
    var firstDataRow = state.firstDataRow;
    var idCol = headerIndex(headers, 'Ledgerly ID');

    if (idCol < 0) {
      // Same self-heal as upsert: add the id column and re-read, rather than
      // refusing. Without this a delete fails and the row silently returns.
      prepareSheet(sheet.getName());
      state = getState();
      sheet = state.sheet;
      headers = state.headers;
      firstDataRow = state.firstDataRow;
      idCol = headerIndex(headers, 'Ledgerly ID');
      if (idCol < 0) throw new Error('Could not add a Ledgerly ID column to this sheet.');
    }

    var lastRow = sheet.getLastRow();
    if (lastRow < firstDataRow) return { revision: readConfigValue('revision', 0) || 0, deleted: [] };

    var lastCol = Math.max(1, sheet.getLastColumn());
    var values = sheet.getRange(firstDataRow, 1, lastRow - firstDataRow + 1, lastCol).getValues();

    var wanted = {};
    for (var i = 0; i < ids.length; i++) wanted[ids[i]] = true;

    var targets = [];
    var found = {};
    for (var r = 0; r < values.length; r++) {
      var rowId = String(values[r][idCol] || '').trim();
      if (wanted[rowId]) {
        found[rowId] = true;
        targets.push({ row: r + firstDataRow, values: values[r] });
      }
    }

    // Rows we were asked to delete but could not find. Reporting these matters:
    // staying quiet makes a failed delete look like a success, and the row
    // reappears at the next sync with nothing to explain it.
    var missing = [];
    for (var m = 0; m < ids.length; m++) {
      if (!found[ids[m]]) missing.push(ids[m]);
    }

    if (!targets.length) {
      return { revision: readConfigValue('revision', 0) || 0, deleted: [], missing: missing };
    }

    var archiveOn = readConfigValue('appConfig', {});
    var shouldArchive = !archiveOn || !archiveOn.settings || archiveOn.settings.archiveOnDelete !== false;

    if (shouldArchive) archiveRows(headers, targets);

    // Delete bottom-up so earlier row numbers stay valid.
    targets.sort(function (a, b) {
      return b.row - a.row;
    });
    for (var t = 0; t < targets.length; t++) sheet.deleteRow(targets[t].row);

    var removed = [];
    for (var k = 0; k < ids.length; k++) {
      if (found[ids[k]]) removed.push(ids[k]);
    }
    return { revision: bumpRevision(), deleted: removed, missing: missing };
  } finally {
    lock.releaseLock();
  }
}

function archiveRows(headers, targets) {
  var book = ss();
  var archive = book.getSheetByName(ARCHIVE_SHEET);
  if (!archive) {
    archive = book.insertSheet(ARCHIVE_SHEET);
    archive.getRange(1, 1, 1, headers.length + 1)
      .setValues([['Deleted at'].concat(headers)])
      .setFontWeight('bold');
    archive.setFrozenRows(1);
  }
  var stamp = new Date();
  var rows = targets.map(function (t) {
    return [stamp].concat(t.values);
  });
  archive.getRange(archive.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

function saveAppConfig(config) {
  var lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    writeConfigValue('appConfig', config);
    return { revision: bumpRevision() };
  } finally {
    lock.releaseLock();
  }
}

/* ============================== manual helpers ============================ */

/**
 * Run this once from the Apps Script editor (select it, press Run) to grant the
 * script permission to touch this spreadsheet and to add the app's columns.
 * It prints the result in the execution log.
 */
function setUpLedgerly() {
  var result = prepareSheet('');
  Logger.log('Ready. Tab: %s · rows: %s', result.meta.sheetName, result.meta.rowCount);
  Logger.log('Columns: %s', result.meta.headers.join(' | '));
  return result.meta;
}

/** Prints a strong random token you can paste into SHARED_TOKEN. */
function generateToken() {
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
  Logger.log(token);
  return token;
}
