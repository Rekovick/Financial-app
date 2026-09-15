/**
 * Exercises apps-script/Code.gs against the fake Sheets runtime in harness.mjs.
 * These cover the paths that are painful to debug inside Google: column
 * detection, date and amount parsing, id backfill, round-tripping an edit, and
 * archiving on delete.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
import { makeEnvironment, FakeSheet, FakeSpreadsheet } from './harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'Code.gs'), 'utf8');

const TOKEN = 'test-token-0123456789';

function load(spreadsheet) {
  const env = makeEnvironment(spreadsheet);
  const names = Object.keys(env);
  const factory = new Function(
    ...names,
    `${source}
     return { doGet, doPost, SHARED_TOKEN, setUpLedgerly };`,
  );
  const api = factory(...names.map((n) => env[n]));
  // Swap the placeholder token for a test one without editing the file.
  const withToken = new Function(
    ...names,
    `${source.replace(
      "var SHARED_TOKEN = 'CHANGE-ME-to-a-long-random-string';",
      `var SHARED_TOKEN = ${JSON.stringify(TOKEN)};`,
    )}
     return { doGet, doPost, setUpLedgerly };`,
  )(...names.map((n) => env[n]));
  return { ...api, ...withToken };
}

function post(app, action, payload, token = TOKEN) {
  const res = app.doPost({ postData: { contents: JSON.stringify({ token, action, payload }) } });
  return JSON.parse(res.text);
}

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`FAIL  ${name}\n      ${err.message}`);
    process.exitCode = 1;
  }
}

/* A sheet shaped like a typical automated card-transaction export: a date
   column of real Dates, positive amounts, a card column, and a stray column
   the app knows nothing about and must never clobber. */
function sparkSheet() {
  return new FakeSheet('Transactions', [
    ['Transaction Date', 'Description', 'Amount', 'Card', 'Raw Email ID'],
    [new Date(2026, 8, 1), 'GREENVIEW PROPERTIES RENT', 2450, 'Debit •8830', 'msg-001'],
    [new Date(2026, 8, 3), 'WHOLE FOODS MKT #3821', 128.4, 'Visa •4412', 'msg-002'],
    [new Date(2026, 8, 4), 'ACME CORP PAYROLL', 3120, 'Debit •8830', 'msg-003'],
    ['', '', '', '', ''],
    [new Date(2026, 8, 6), 'UBER *TRIP', 18.75, 'Visa •4412', 'msg-004'],
  ]);
}

/**
 * A workbook shaped like an email-scraping expense tracker's export: the header
 * sits on row 2 under a blank spacer, column A is empty, the amount column
 * carries a currency suffix, and a longer summary tab sits alongside the ledger
 * and must not be mistaken for it.
 *
 * The rows are invented. Only the *shape* is copied from a real export, because
 * that shape is what the code has to survive — never anybody's actual
 * transactions, message ids, card digits or balances.
 */
function sparkWorkbook() {
  const transactions = new FakeSheet('Transactions', [
    [],
    ['', 'Transaction ID', 'Bank', 'Card Last 4', 'Date', 'Time', 'Merchant', 'Category', 'Amount (EGP)', 'Currency', 'Available Balance (EGP)', 'Source Email URL'],
    ['', 'msg-0001', 'Example Bank', 1111, new Date(2026, 8, 1), '03:50', 'Talabat Food Delivery', 'Food Delivery & Dining', 100, 'EGP', 9000, 'https://mail.example.com/1'],
    ['', 'msg-0002', 'Sample Bank', 2222, new Date(2026, 8, 1), '15:14', 'Telda Wallet', 'Financial & Wallet Transfers', 250, 'EGP', 8750, 'https://mail.example.com/2'],
    ['', 'msg-0003', 'Sample Bank', 2222, new Date(2026, 8, 1), '20:29', 'Etisalat Top-Up', 'Telecom & Bills', 75, 'EGP', 8675, 'https://mail.example.com/3'],
    ['', 'msg-0004', 'Example Bank', 1111, new Date(2026, 8, 2), '02:52', 'Talabat Food Delivery', 'Food Delivery & Dining', 300, 'EGP', 8375, 'https://mail.example.com/4'],
    ['', 'msg-0005', 'Sample Bank', 2222, new Date(2026, 8, 2), '15:34', 'Bahja Suq', 'Gaming & Entertainment', 325, 'EGP', 8050, 'https://mail.example.com/5'],
  ]);

  // Longer than the ledger, and full of numbers — the tab most likely to be
  // picked by mistake.
  const summary = new FakeSheet('Summary & Analytics', [
    [],
    ['', 'Total Spent', 1050, '', 'Week', 'Transactions', 'Total Spent'],
    ['', 'Total Transactions', 5, '', 'Week 36 (Sep 01 - Sep 06, 2026)', 5, 1050],
    ['', 'Example Bank Spend', 400, '', 'Week 37 (Sep 07 - Sep 11, 2026)', 0, 0],
    [],
    ['', 'Category', 'Amount (EGP)', '% of Total'],
    ...Array.from({ length: 40 }, (_, i) => ['', `Category ${i}`, 100 + i, 0.02]),
  ]);

  const schema = new FakeSheet('API & Schema', [
    [],
    ['', 'Field', 'Data Type', 'Description'],
    ['', 'transaction_id', 'String', 'Unique identifier for the transaction'],
    ['', 'date', 'Date (YYYY-MM-DD)', 'Date of the transaction'],
    ['', 'amount_egp', 'Number', 'Transaction amount in EGP'],
  ]);

  return { book: new FakeSpreadsheet('Card Transactions: Expense Tracker', [transactions, summary, schema]), transactions };
}

console.log('Apps Script backend');

test('rejects a wrong token', () => {
  const app = load(new FakeSpreadsheet('Cards', [sparkSheet()]));
  const res = post(app, 'ping', {}, 'nope');
  assert.equal(res.ok, false);
  assert.equal(res.code, 'UNAUTHORIZED');
});

test('ping reports the spreadsheet and its tabs', () => {
  const app = load(new FakeSpreadsheet('Cards', [sparkSheet()]));
  const res = post(app, 'ping', {});
  assert.equal(res.ok, true);
  assert.equal(res.data.spreadsheetName, 'Cards');
  assert.deepEqual(res.data.sheets, ['Transactions']);
});

test('auto-detects the transaction tab and its columns', () => {
  const book = new FakeSpreadsheet('Cards', [new FakeSheet('Notes', [['hello'], ['world']]), sparkSheet()]);
  const app = load(book);
  const { data } = post(app, 'bootstrap', {});
  assert.equal(data.meta.sheetName, 'Transactions');
  assert.equal(data.meta.mapping.date, 'Transaction Date');
  assert.equal(data.meta.mapping.description, 'Description');
  assert.equal(data.meta.mapping.amount, 'Amount');
  assert.equal(data.meta.mapping.account, 'Card');
});

test('reads rows, skips blanks, and normalises dates', () => {
  const app = load(new FakeSpreadsheet('Cards', [sparkSheet()]));
  const { data } = post(app, 'bootstrap', {});
  assert.equal(data.transactions.length, 4, 'the blank row must not become a transaction');
  const rent = data.transactions.find((t) => t.description.includes('GREENVIEW'));
  assert.equal(rent.date, '2026-09-01');
  assert.equal(rent.amount, 2450);
  assert.equal(rent.account, 'Debit •8830');
  // Newest first.
  assert.equal(data.transactions[0].date, '2026-09-06');
});

test('backfills stable ids into the sheet', () => {
  const sheet = sparkSheet();
  const app = load(new FakeSpreadsheet('Cards', [sheet]));
  post(app, 'prepareSheet', { sheetName: 'Transactions' });
  const first = post(app, 'bootstrap', {}).data.transactions;
  const second = post(app, 'bootstrap', {}).data.transactions;
  assert.ok(first.every((t) => t.id));
  // Ids must survive a second read, or every edit would create a duplicate.
  assert.deepEqual(
    first.map((t) => t.id).sort(),
    second.map((t) => t.id).sort(),
  );
});

test('prepareSheet appends only the missing columns', () => {
  const sheet = sparkSheet();
  const app = load(new FakeSpreadsheet('Cards', [sheet]));
  const { data } = post(app, 'prepareSheet', { sheetName: 'Transactions' });
  const headers = data.meta.headers;
  assert.deepEqual(headers.slice(0, 5), ['Transaction Date', 'Description', 'Amount', 'Card', 'Raw Email ID']);
  for (const needed of ['Category', 'Type', 'Who', 'Tags', 'Notes', 'Excluded', 'Reconciled', 'Ledgerly ID']) {
    assert.ok(headers.includes(needed), `missing ${needed}`);
  }
  // Running it twice must not duplicate anything.
  const again = post(app, 'prepareSheet', { sheetName: 'Transactions' }).data.meta.headers;
  assert.deepEqual(again, headers);
});

test('an edit writes back and keeps unmapped columns intact', () => {
  const sheet = sparkSheet();
  const app = load(new FakeSpreadsheet('Cards', [sheet]));
  post(app, 'prepareSheet', { sheetName: 'Transactions' });

  const before = post(app, 'bootstrap', {}).data.transactions;
  const groceries = before.find((t) => t.description.includes('WHOLE FOODS'));
  const edited = { ...groceries, category: 'Groceries', member: 'Sam', notes: 'weekly shop', tags: ['bulk'], amount: 130.25 };
  const res = post(app, 'upsert', { transactions: [edited] });
  assert.equal(res.ok, true);

  const after = post(app, 'bootstrap', {}).data.transactions;
  assert.equal(after.length, before.length, 'an edit must update in place, not append');
  const updated = after.find((t) => t.id === groceries.id);
  assert.equal(updated.category, 'Groceries');
  assert.equal(updated.member, 'Sam');
  assert.equal(updated.notes, 'weekly shop');
  assert.deepEqual(updated.tags, ['bulk']);
  assert.equal(updated.amount, 130.25);

  // The column the app doesn't know about must be untouched.
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const rawIdCol = headers.indexOf('Raw Email ID');
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const row = rows.find((r) => String(r[1]).includes('WHOLE FOODS'));
  assert.equal(row[rawIdCol], 'msg-002');
});

test('a new transaction is appended', () => {
  const app = load(new FakeSpreadsheet('Cards', [sparkSheet()]));
  post(app, 'prepareSheet', { sheetName: 'Transactions' });
  const before = post(app, 'bootstrap', {}).data.transactions.length;
  post(app, 'upsert', {
    transactions: [
      {
        id: 'tx_new_1',
        date: '2026-09-11',
        description: 'Test coffee',
        amount: 4.5,
        type: 'expense',
        category: 'Dining',
        account: 'Visa •4412',
        member: 'Me',
        notes: '',
        tags: [],
        excluded: false,
        cleared: false,
      },
    ],
  });
  const after = post(app, 'bootstrap', {}).data.transactions;
  assert.equal(after.length, before + 1);
  const added = after.find((t) => t.id === 'tx_new_1');
  assert.equal(added.description, 'Test coffee');
  assert.equal(added.date, '2026-09-11');
  assert.equal(added.amount, 4.5);
  assert.equal(added.category, 'Dining');
});

test('delete archives the row and removes it', () => {
  const book = new FakeSpreadsheet('Cards', [sparkSheet()]);
  const app = load(book);
  post(app, 'prepareSheet', { sheetName: 'Transactions' });
  const rows = post(app, 'bootstrap', {}).data.transactions;
  const victim = rows.find((t) => t.description.includes('UBER'));

  post(app, 'delete', { ids: [victim.id] });
  const after = post(app, 'bootstrap', {}).data.transactions;
  assert.equal(after.length, rows.length - 1);
  assert.ok(!after.some((t) => t.id === victim.id));

  const archive = book.getSheetByName('Ledgerly Archive');
  assert.ok(archive, 'an archive tab should exist');
  const archived = archive.getRange(2, 1, archive.getLastRow() - 1, archive.getLastColumn()).getValues();
  assert.ok(archived.some((r) => r.some((c) => String(c).includes('UBER'))));
});

test('archiving can be turned off', () => {
  const book = new FakeSpreadsheet('Cards', [sparkSheet()]);
  const app = load(book);
  post(app, 'prepareSheet', { sheetName: 'Transactions' });
  post(app, 'saveConfig', { config: { settings: { archiveOnDelete: false } } });
  const rows = post(app, 'bootstrap', {}).data.transactions;
  post(app, 'delete', { ids: [rows[0].id] });
  assert.equal(book.getSheetByName('Ledgerly Archive'), null);
});

test('app settings round-trip through the config tab', () => {
  const app = load(new FakeSpreadsheet('Cards', [sparkSheet()]));
  const config = {
    settings: { currency: 'SAR', locale: 'ar-SA', monthStartDay: 25 },
    categories: [{ id: 'groceries', name: 'Groceries', group: 'needs', slot: 3, icon: '🛒' }],
    budgets: [{ id: 'b1', categoryId: 'groceries', amount: 1200, rollover: true }],
    goals: [],
    rules: [],
  };
  post(app, 'saveConfig', { config });
  const back = post(app, 'bootstrap', {}).data.config;
  assert.deepEqual(back, config);
});

test('a signed amount column carries direction and stays signed on write', () => {
  const sheet = new FakeSheet('Ledger', [
    ['Date', 'Details', 'Amount'],
    ['2026-09-02', 'SALARY', 3000],
    ['2026-09-03', 'GROCER', -84.2],
  ]);
  const app = load(new FakeSpreadsheet('Bank', [sheet]));
  post(app, 'prepareSheet', { sheetName: 'Ledger' });
  const rows = post(app, 'bootstrap', {}).data.transactions;
  const salary = rows.find((t) => t.description === 'SALARY');
  const grocer = rows.find((t) => t.description === 'GROCER');
  assert.equal(salary.type, 'income');
  assert.equal(grocer.type, 'expense');
  assert.equal(grocer.amount, 84.2, 'the app always holds a positive magnitude');

  post(app, 'upsert', { transactions: [{ ...grocer, amount: 90 }] });
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const amountCol = headers.indexOf('Amount');
  const body = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const row = body.find((r) => r[1] === 'GROCER');
  assert.equal(row[amountCol], -90, 'a signed column must keep expenses negative');
});

test('text dates and messy amounts are parsed', () => {
  const sheet = new FakeSheet('Export', [
    ['Date', 'Merchant', 'Amount', 'Type'],
    ['09/07/2026', 'CAFE', '$1,234.50', 'Debit'],
    ['2026-09-08', 'REFUND', '(45.00)', 'Credit'],
    ['09/09/2026', 'SHOP', '12,5', 'Debit'],
  ]);
  const app = load(new FakeSpreadsheet('Export book', [sheet]));
  const rows = post(app, 'bootstrap', {}).data.transactions;
  const cafe = rows.find((t) => t.description === 'CAFE');
  const refund = rows.find((t) => t.description === 'REFUND');
  const shop = rows.find((t) => t.description === 'SHOP');
  assert.equal(cafe.date, '2026-09-07', 'a US-timezone sheet reads 09/07 as September 7th');
  assert.equal(cafe.amount, 1234.5);
  assert.equal(cafe.type, 'expense');
  assert.equal(refund.type, 'income');
  assert.equal(refund.amount, 45);
  assert.equal(shop.amount, 12.5, 'a lone comma with two trailing digits is a decimal comma');
});

test('an explicit Type column wins over the amount sign', () => {
  const sheet = new FakeSheet('Ledger', [
    ['Date', 'Details', 'Amount', 'Type'],
    ['2026-09-02', 'MOVE TO SAVINGS', -600, 'Transfer'],
    ['2026-09-03', 'BONUS', -900, 'Credit'],
  ]);
  const app = load(new FakeSpreadsheet('Bank', [sheet]));
  const rows = post(app, 'bootstrap', {}).data.transactions;
  assert.equal(rows.find((t) => t.description === 'MOVE TO SAVINGS').type, 'transfer');
  assert.equal(rows.find((t) => t.description === 'BONUS').type, 'income');
});

test('the revision probe moves when rows are added or the app writes', () => {
  const sheet = sparkSheet();
  const app = load(new FakeSpreadsheet('Cards', [sheet]));
  post(app, 'prepareSheet', { sheetName: 'Transactions' });

  const first = post(app, 'revision', {}).data;
  assert.equal(typeof first.revision, 'number');
  assert.equal(first.sheetName, 'Transactions');

  // Reading changes nothing, so a polling client can skip the full fetch.
  const again = post(app, 'revision', {}).data;
  assert.deepEqual(again, first);

  post(app, 'upsert', {
    transactions: [
      {
        id: 'tx_probe',
        date: '2026-09-12',
        description: 'Probe',
        amount: 1,
        type: 'expense',
        category: '',
        account: '',
        member: '',
        notes: '',
        tags: [],
        excluded: false,
        cleared: false,
      },
    ],
  });
  const after = post(app, 'revision', {}).data;
  assert.ok(after.revision > first.revision, 'a write must bump the revision');
  assert.equal(after.rowCount, first.rowCount + 1);
});

/* ------------------- a real Google Spark export -------------------------- */

test('Spark export: finds the ledger tab, not the longer summary tab', () => {
  const { book } = sparkWorkbook();
  const app = load(book);
  const { data } = post(app, 'bootstrap', {});
  assert.equal(data.meta.sheetName, 'Transactions');
});

test('Spark export: finds a header row that is not row 1', () => {
  const { book } = sparkWorkbook();
  const app = load(book);
  const { data } = post(app, 'bootstrap', {});
  assert.equal(data.meta.headerRow, 2, 'header is on row 2, under a blank spacer row');
  assert.equal(data.meta.mapping.date, 'Date');
  assert.equal(data.meta.mapping.description, 'Merchant');
  assert.equal(data.meta.mapping.amount, 'Amount (EGP)', 'the currency suffix must not defeat the match');
  assert.equal(data.meta.mapping.category, 'Category');
});

test('Spark export: reads every row past the blank leading column', () => {
  const { book } = sparkWorkbook();
  const app = load(book);
  const { data } = post(app, 'bootstrap', {});
  assert.equal(data.transactions.length, 5);
  const talabat = data.transactions.find((t) => t.description === 'Talabat Food Delivery' && t.date === '2026-09-01');
  assert.ok(talabat, 'the first data row must not be swallowed as a header');
  assert.equal(talabat.amount, 100);
  assert.equal(talabat.category, 'Food Delivery & Dining');
  assert.equal(talabat.type, 'expense', 'an all-positive column with no type is spending');
});

test('Spark export: picks up the sheet currency', () => {
  const { book } = sparkWorkbook();
  const app = load(book);
  const { data } = post(app, 'bootstrap', {});
  assert.equal(data.meta.detectedCurrency, 'EGP');
});

test('Spark export: setup adds columns on the right row and keeps the data', () => {
  const { book, transactions } = sparkWorkbook();
  const app = load(book);
  const { data } = post(app, 'prepareSheet', { sheetName: 'Transactions' });

  assert.equal(data.meta.headerRow, 2);
  assert.equal(data.transactions.length, 5, 'setup must not eat or duplicate rows');
  for (const needed of ['Who', 'Tags', 'Notes', 'Ledgerly ID']) {
    assert.ok(data.meta.headers.includes(needed), `missing ${needed}`);
  }
  // Spark's own columns are untouched and still in place.
  const headerRow = transactions.getRange(2, 1, 1, transactions.getLastColumn()).getValues()[0];
  assert.equal(headerRow[1], 'Transaction ID');
  assert.equal(headerRow[11], 'Source Email URL');
  // Row 1 is still the blank spacer.
  assert.deepEqual(
    transactions.getRange(1, 1, 1, 3).getValues()[0].filter(Boolean),
    [],
  );
});

test('Spark export: an edit lands on the right row and keeps the email link', () => {
  const { book, transactions } = sparkWorkbook();
  const app = load(book);
  post(app, 'prepareSheet', { sheetName: 'Transactions' });

  const rows = post(app, 'bootstrap', {}).data.transactions;
  const wallet = rows.find((t) => t.description === 'Telda Wallet');
  post(app, 'upsert', { transactions: [{ ...wallet, type: 'transfer', notes: 'moved to Telda', member: 'Me' }] });

  const after = post(app, 'bootstrap', {}).data.transactions;
  assert.equal(after.length, rows.length, 'no duplicate row');
  const updated = after.find((t) => t.id === wallet.id);
  assert.equal(updated.type, 'transfer');
  assert.equal(updated.notes, 'moved to Telda');

  const headers = transactions.getRange(2, 1, 1, transactions.getLastColumn()).getValues()[0];
  const body = transactions.getRange(3, 1, transactions.getLastRow() - 2, transactions.getLastColumn()).getValues();
  const row = body.find((r) => r[headers.indexOf('Merchant')] === 'Telda Wallet');
  assert.equal(row[headers.indexOf('Source Email URL')], 'https://mail.example.com/2');
  assert.equal(row[headers.indexOf('Transaction ID')], 'msg-0002');
  assert.equal(row[headers.indexOf('Available Balance (EGP)')], 8750);
});

test('Spark export: a new transaction appends below the real data', () => {
  const { book } = sparkWorkbook();
  const app = load(book);
  post(app, 'prepareSheet', { sheetName: 'Transactions' });
  post(app, 'upsert', {
    transactions: [
      {
        id: 'tx_manual',
        date: '2026-09-12',
        description: 'Cash lunch',
        amount: 85,
        type: 'expense',
        category: 'Food Delivery & Dining',
        account: 'Example Bank',
        member: 'Me',
        notes: '',
        tags: [],
        excluded: false,
        cleared: false,
      },
    ],
  });
  const after = post(app, 'bootstrap', {}).data.transactions;
  assert.equal(after.length, 6);
  assert.ok(after.some((t) => t.description === 'Cash lunch' && t.amount === 85));
});

test('Spark export: delete removes the right row', () => {
  const { book } = sparkWorkbook();
  const app = load(book);
  post(app, 'prepareSheet', { sheetName: 'Transactions' });
  const rows = post(app, 'bootstrap', {}).data.transactions;
  const victim = rows.find((t) => t.description === 'Bahja Suq');
  post(app, 'delete', { ids: [victim.id] });
  const after = post(app, 'bootstrap', {}).data.transactions;
  assert.equal(after.length, rows.length - 1);
  assert.ok(!after.some((t) => t.description === 'Bahja Suq'));
  assert.ok(after.some((t) => t.description === 'Telda Wallet'), 'neighbours must survive');
});

test('a delete that cannot find its rows says so instead of claiming success', () => {
  const { book } = sparkWorkbook();
  const app = load(book);
  post(app, 'prepareSheet', { sheetName: 'Transactions' });
  const rows = post(app, 'bootstrap', {}).data.transactions;

  // A stale id — the row was already removed elsewhere. Silence here is what
  // makes a row "come back" at the next sync with no explanation.
  const res = post(app, 'delete', { ids: ['sh_doesnotexist'] });
  assert.equal(res.ok, true);
  assert.deepEqual(res.data.deleted, []);
  assert.deepEqual(res.data.missing, ['sh_doesnotexist']);
  assert.equal(post(app, 'bootstrap', {}).data.transactions.length, rows.length);

  // A mixed batch reports precisely which half failed.
  const real = rows[0].id;
  const mixed = post(app, 'delete', { ids: [real, 'sh_alsomissing'] }).data;
  assert.deepEqual(mixed.deleted, [real]);
  assert.deepEqual(mixed.missing, ['sh_alsomissing']);
  assert.equal(post(app, 'bootstrap', {}).data.transactions.length, rows.length - 1);
});

test('deleting from a sheet with no id column adds one rather than failing', () => {
  const sheet = new FakeSheet('Ledger', [
    ['Date', 'Details', 'Amount'],
    ['2026-09-02', 'COFFEE', 40],
    ['2026-09-03', 'LUNCH', 90],
  ]);
  const app = load(new FakeSpreadsheet('Bank', [sheet]));
  const rows = post(app, 'bootstrap', {}).data.transactions;
  const victim = rows.find((t) => t.description === 'COFFEE');

  const res = post(app, 'delete', { ids: [victim.id] });
  assert.equal(res.ok, true, res.error);
  const after = post(app, 'bootstrap', {}).data.transactions;
  assert.ok(after.some((t) => t.description === 'LUNCH'), 'the other row survives');
});

test('a sheet with no usable tab fails with a clear message', () => {
  const app = load(new FakeSpreadsheet('Empty', [new FakeSheet('Readme', [['just some notes']])]));
  const res = post(app, 'bootstrap', {});
  assert.equal(res.ok, false);
  assert.match(res.error, /transaction list/i);
});

console.log(`\n${passed} passed`);
