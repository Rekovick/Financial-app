/**
 * A small stand-in for the Apps Script runtime so Code.gs can be exercised
 * outside Google. It models only what the script actually touches: a
 * spreadsheet of 2-D cell arrays, ranges, locks, UUIDs and date formatting.
 *
 * Run with:  node apps-script/test/run.mjs
 */

class FakeRange {
  constructor(sheet, row, col, rows, cols) {
    Object.assign(this, { sheet, row, col, rows, cols });
  }
  getValues() {
    const out = [];
    for (let r = 0; r < this.rows; r++) {
      const line = [];
      for (let c = 0; c < this.cols; c++) line.push(this.sheet.cell(this.row + r, this.col + c));
      out.push(line);
    }
    return out;
  }
  setValues(values) {
    values.forEach((line, r) =>
      line.forEach((v, c) => this.sheet.setCell(this.row + r, this.col + c, v)),
    );
    return this;
  }
  setValue(v) {
    this.sheet.setCell(this.row, this.col, v);
    return this;
  }
  setFontWeight() {
    return this;
  }
}

class FakeSheet {
  constructor(name, data = []) {
    this.name = name;
    this.data = data.map((r) => [...r]);
  }
  getName() {
    return this.name;
  }
  cell(row, col) {
    const v = this.data[row - 1]?.[col - 1];
    return v === undefined ? '' : v;
  }
  setCell(row, col, value) {
    while (this.data.length < row) this.data.push([]);
    const line = this.data[row - 1];
    while (line.length < col) line.push('');
    line[col - 1] = value;
  }
  getLastRow() {
    for (let r = this.data.length; r >= 1; r--) {
      if (this.data[r - 1]?.some((v) => v !== '' && v != null)) return r;
    }
    return 0;
  }
  getLastColumn() {
    return this.data.reduce((m, r) => Math.max(m, r.length), 0);
  }
  getRange(row, col, rows = 1, cols = 1) {
    return new FakeRange(this, row, col, rows, cols);
  }
  appendRow(values) {
    this.data.push([...values]);
  }
  deleteRow(row) {
    this.data.splice(row - 1, 1);
  }
  setColumnWidth() {
    return this;
  }
  setFrozenRows() {
    return this;
  }
  hideSheet() {
    return this;
  }
}

class FakeSpreadsheet {
  constructor(name, sheets) {
    this.name = name;
    this.sheets = sheets;
  }
  getName() {
    return this.name;
  }
  getSheets() {
    return this.sheets;
  }
  getSheetByName(n) {
    return this.sheets.find((s) => s.getName() === n) || null;
  }
  insertSheet(n) {
    const s = new FakeSheet(n);
    this.sheets.push(s);
    return s;
  }
  getSpreadsheetTimeZone() {
    return 'America/New_York';
  }
}

let uuidCounter = 0;

export function makeEnvironment(spreadsheet) {
  return {
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet },
    LockService: {
      getDocumentLock: () => ({ waitLock() {}, releaseLock() {} }),
    },
    Utilities: {
      getUuid: () => `uuid-${String(++uuidCounter).padStart(6, '0')}-aaaa-bbbb-cccccccccccc`,
      formatDate: (d, tz, fmt) => {
        // Only yyyy-MM-dd is used by the script.
        if (fmt !== 'yyyy-MM-dd') throw new Error('unsupported format ' + fmt);
        const utc = tz === 'UTC';
        const y = utc ? d.getUTCFullYear() : d.getFullYear();
        const m = (utc ? d.getUTCMonth() : d.getMonth()) + 1;
        const day = utc ? d.getUTCDate() : d.getDate();
        return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      },
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (text) => ({ text, setMimeType: () => ({ text, getContent: () => text }) }),
    },
    Logger: { log: () => {} },
  };
}

export { FakeSheet, FakeSpreadsheet };
