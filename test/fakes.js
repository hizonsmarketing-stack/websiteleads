// An in-memory stand-in for the parts of the Apps Script Spreadsheet service
// this project uses, so the full intake pipeline can be exercised under Node.
function pad(n, w) { return String(n).padStart(w, '0'); }

class FakeRange {
  constructor(sheet, row, col, numRows, numCols) {
    Object.assign(this, { sheet, row, col, numRows, numCols });
  }
  getA1Notation() {
    const letter = n => {
      let s = '';
      while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; }
      return s;
    };
    const from = letter(this.col) + this.row;
    const to = letter(this.col + this.numCols - 1) + (this.row + this.numRows - 1);
    return from === to ? from : from + ':' + to;
  }
  getValues() {
    const out = [];
    for (let r = 0; r < this.numRows; r++) {
      const line = [];
      for (let c = 0; c < this.numCols; c++) line.push(this.sheet.cell(this.row + r, this.col + c));
      out.push(line);
    }
    return out;
  }
  getValue() { return this.sheet.cell(this.row, this.col); }
  setValues(values) {
    values.forEach((line, r) => line.forEach((v, c) => this.sheet.set(this.row + r, this.col + c, v)));
    return this;
  }
  setValue(v) { this.sheet.set(this.row, this.col, v); return this; }
  clearContent() {
    for (let r = 0; r < this.numRows; r++) {
      for (let c = 0; c < this.numCols; c++) this.sheet.set(this.row + r, this.col + c, '');
    }
    return this;
  }
  setDataValidation() { return this; }
  setNumberFormat() { return this; }
  setWrapStrategy() { return this; }
  setFontWeight() { return this; }
  setBackground() { return this; }
  setFontColor() { return this; }
  setFontSize() { return this; }
  setVerticalAlignment() { return this; }
  applyRowBanding() { this.sheet._bandings.push({}); return {}; }
}

class FakeSheet {
  constructor(name) {
    this.name = name;
    this.grid = [];
    this.maxRows = 1000;
    this.maxCols = 30;
    this._hidden = false;
    this._bandings = [];
  }
  getName() { return this.name; }
  cell(row, col) {
    const line = this.grid[row - 1];
    const v = line ? line[col - 1] : undefined;
    return v === undefined ? '' : v;
  }
  set(row, col, value) {
    while (this.grid.length < row) this.grid.push([]);
    const line = this.grid[row - 1];
    while (line.length < col) line.push('');
    line[col - 1] = value === undefined || value === null ? '' : value;
    this.maxRows = Math.max(this.maxRows, row);
    this.maxCols = Math.max(this.maxCols, col);
  }
  getLastRow() {
    for (let r = this.grid.length; r >= 1; r--) {
      if ((this.grid[r - 1] || []).some(v => v !== '' && v !== undefined && v !== null)) return r;
    }
    return 0;
  }
  getLastColumn() {
    let last = 0;
    this.grid.forEach(line => {
      for (let c = (line || []).length; c >= 1; c--) {
        if (line[c - 1] !== '' && line[c - 1] !== undefined && line[c - 1] !== null) {
          last = Math.max(last, c);
          break;
        }
      }
    });
    return last;
  }
  getMaxRows() { return Math.max(this.maxRows, this.getLastRow()); }
  getMaxColumns() { return Math.max(this.maxCols, this.getLastColumn()); }
  getRange(a, b, c, d) {
    if (typeof a === 'string') {
      const m = a.match(/^([A-Z]+)(\d+)$/);
      let col = 0;
      for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
      return new FakeRange(this, Number(m[2]), col, 1, 1);
    }
    return new FakeRange(this, a, b, c === undefined ? 1 : c, d === undefined ? 1 : d);
  }
  appendRow(values) {
    const row = this.getLastRow() + 1;
    values.forEach((v, i) => this.set(row, i + 1, v));
  }
  deleteRow(row) { this.grid.splice(row - 1, 1); }
  deleteRows(row, count) { this.grid.splice(row - 1, count); }
  insertColumnsAfter() { return this; }
  setFrozenRows() { return this; }
  setRowHeight() { return this; }
  setColumnWidth() { return this; }
  getBandings() { return this._bandings; }
  getConditionalFormatRules() { return this._cfRules || (this._cfRules = []); }
  setConditionalFormatRules(rules) { this._cfRules = rules.slice(); }
  hideSheet() { this._hidden = true; }
  isSheetHidden() { return this._hidden; }
  clear() { this.grid = []; }
}

class FakeSpreadsheet {
  constructor() { this.sheets = []; }
  getId() { return 'fake-spreadsheet-id'; }
  getName() { return 'Sales Worksheet (fake)'; }
  getUrl() { return 'https://docs.google.com/spreadsheets/d/fake'; }
  getSheets() { return this.sheets; }
  getSheetByName(name) { return this.sheets.filter(s => s.getName() === name)[0] || null; }
  insertSheet(name) { const s = new FakeSheet(name); this.sheets.push(s); return s; }
  setActiveSheet(sheet) { this._active = sheet; return sheet; }
  moveActiveSheet(pos) {
    const i = this.sheets.indexOf(this._active);
    if (i >= 0) { this.sheets.splice(i, 1); this.sheets.splice(pos - 1, 0, this._active); }
  }
}

function installFakes(global, options) {
  const book = new FakeSpreadsheet();
  const props = {};
  let now = new Date('2026-08-23T10:00:00');

  global.__book = book;
  global.__setNow = d => { now = d; };
  global.__mails = [];

  global.Session = { getScriptTimeZone: () => 'Asia/Manila' };
  global.Utilities = {
    formatDate(date, tz, fmt) {
      const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
      const H = date.getHours(), M = date.getMinutes(), S = date.getSeconds();
      return fmt.replace('yyyy', y).replace('MM', pad(m, 2)).replace('dd', pad(d, 2))
        .replace('HH', pad(H, 2)).replace('mm', pad(M, 2)).replace('ss', pad(S, 2));
    },
    getUuid: () => Math.random().toString(16).slice(2).padEnd(32, '0'),
    formatString: (fmt, n) => pad(n, 6)
  };
  const RealDate = Date;
  global.Date = class extends RealDate {
    constructor(...args) { if (!args.length) super(now.getTime()); else super(...args); }
    static now() { return now.getTime(); }
  };
  global.SpreadsheetApp = {
    getActiveSpreadsheet: () => book,
    openById: () => book,
    newDataValidation: () => ({
      requireValueInList() { return this; },
      setAllowInvalid() { return this; },
      build() { return {}; }
    }),
    newConditionalFormatRule: () => ({
      _r: { text: '', background: '', font: '', ranges: [] },
      whenTextEqualTo(v) { this._r.text = v; return this; },
      setBackground(v) { this._r.background = v; return this; },
      setFontColor(v) { this._r.font = v; return this; },
      setRanges(v) { this._r.ranges = v; return this; },
      build() {
        const r = this._r;
        return {
          getBooleanCondition: () => ({ getCriteriaValues: () => [r.text] }),
          getRanges: () => r.ranges,
          __background: r.background,
          __font: r.font,
          __text: r.text
        };
      }
    }),
    BandingTheme: { LIGHT_GREY: 'LIGHT_GREY' },
    WrapStrategy: { CLIP: 'CLIP' },
    getUi() { throw new Error('no UI in tests'); }
  };
  global.PropertiesService = {
    getScriptProperties: () => ({
      getProperty: k => (props[k] === undefined ? null : props[k]),
      setProperty: (k, v) => { props[k] = v; },
      deleteProperty: k => { delete props[k]; }
    })
  };
  global.LockService = {
    getDocumentLock: () => ({ waitLock() {}, releaseLock() {} })
  };
  global.MailApp = { sendEmail: m => global.__mails.push(m) };
  global.ContentService = {
    MimeType: { JSON: 'JSON' },
    createTextOutput: text => ({ text, setMimeType() { return this; }, getContent() { return this.text; } })
  };
  global.HtmlService = { createHtmlOutputFromFile: () => ({ setWidth() { return this; }, setHeight() { return this; } }) };
  global.ScriptApp = { getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/FAKE/exec' }) };
  return book;
}

module.exports = { installFakes };
