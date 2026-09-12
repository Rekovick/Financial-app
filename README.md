# Ledgerly

A fast, shared view of your card transactions — reading and writing the Google
Sheet you already have.

Google Spark (or any other automation) keeps dropping rows into a spreadsheet.
That spreadsheet is a fine place to *store* money, and an awful place to *look*
at it, especially on a phone, especially with two people. Ledgerly is the
looking-at-it part: a small web app that opens the same sheet, presents it
properly, and writes your edits straight back.

**Your data never leaves your spreadsheet.** There is no Ledgerly server, no
account, and no database. The app talks directly to a Google Apps Script that
lives inside your own sheet.

---

## What it does

**See where the money went**
- Spend, income, net and a projected month-end, each against the previous period
- Category breakdown, top merchants, day-of-week patterns, a daily heat map
- A running position across the month, and a twelve-month trend
- Every chart clicks through to the transactions behind it

**Change things**
- Add, edit and delete transactions; changes are written back to the sheet
- Bulk select to re-categorize, reassign or exclude many rows at once
- Undo on every destructive action
- Deleted rows go to an Archive tab by default, so nothing is lost for good

**Stay on top of it**
- Budgets per category, with rollover and a "here's where you'll land" marker
- Recurring charges detected from your history, split into fixed bills and
  regular habits, with what's due in the next 30 days
- Savings goals with a required monthly contribution
- A rules engine that categorizes, renames, tags and excludes rows automatically
- Flags for likely duplicates, unusually large charges and uncategorized rows

**Built for two people on phones**
- Installable as a PWA; works offline and syncs edits when you're back
- Both devices see the same numbers, because the sheet is the single source
- A privacy toggle blurs every amount for glancing at it in public
- Per-person split, so you can see who spent what
- Light and dark, a custom month-start day for salary cycles, any currency

---

## Setting it up

The full walkthrough is in the app itself — open it and follow the three steps
on the connect screen, which generates your access code and hands you a copy of
the script with the code already filled in.

The short version:

1. Open your spreadsheet → **Extensions → Apps Script**
2. Paste in [`apps-script/Code.gs`](apps-script/Code.gs), set `SHARED_TOKEN` to a
   long random string, save, then run `setUpLedgerly` once and approve the
   permission prompt
3. **Deploy → New deployment → Web app**, with *Execute as: Me* and
   *Who has access: Anyone*, then copy the `/exec` URL
4. Paste the URL and your access code into the app

There is a longer version, with the reasoning and the failure modes, in
[`docs/SETUP.md`](docs/SETUP.md).

### Trying it first

The connect screen has two ways to look before you commit:

- **Load a CSV** — in your spreadsheet, *File → Download → Comma-separated
  values*, then drop that file in. Your real numbers, rendered properly, held
  only on that device. Nothing is uploaded and nothing is written back.
- **Try the demo** — a year of realistic made-up data.

### It adapts to the sheet you already have

Automations don't produce tidy A1-anchored tables, so the backend doesn't
assume one:

- **The header row is found, not assumed** — a title row, a blank spacer or a
  leading empty column are all fine, and the right tab is picked by its columns
  rather than by being the longest.
- **Your categories become the app's categories.** A sheet that already
  classifies its rows ("Food Delivery & Dining", "Telecom & Bills") keeps its
  own taxonomy; each name gets a palette colour and a guessed icon, and new ones
  are adopted as they appear. Only a sheet with no categories of its own falls
  back to the built-in list.
- **Currency and cards come from the data** on first connect, so there is no
  settings hunt before the numbers read correctly.
- **A spend-only feed is treated as one.** Many card feeds carry no income at
  all; rather than showing a zero income tile and a large negative "net", the
  overview switches to spend per day and the biggest charge.

### About "Who has access: Anyone"

That setting means Google won't demand a sign-in before running the script. Your
access code is what actually guards the data: requests without it are refused.
So the URL and the code together are a password — share them with your partner
and nobody else. If you ever want to revoke access, change `SHARED_TOKEN` in the
script and re-enter the new code on each device.

---

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
```

```bash
npm run build      # static files in dist/
npm run preview    # serve the build locally
npm test           # unit tests + the Apps Script backend suite
npm run lint       # typecheck
```

The build is plain static files with hash routing, so it works from any static
host — GitHub Pages, Netlify, Cloudflare Pages, a folder on your own machine.

A GitHub Pages workflow is included. Pages has to be switched on once by a
person — **Settings → Pages → Source: GitHub Actions** — because the Actions
token is not permitted to create a Pages site. After that every push
publishes. Pages on a **private** repo needs a
paid GitHub plan; on a free account make the repo public first. That is safe
here — the app ships no data of yours, and the Sheet URL and access code are
stored only in each browser's local storage, never in the build.

There is also a preview build for hosts that cannot make cross-origin requests:

```bash
VITE_PREVIEW_ONLY=1 VITE_BASE=./ npm run build
```

It drops the service worker, uses relative asset paths, opens on the sample
ledger, and says plainly that connecting to a Sheet won't work from there — so
a sandboxed preview link still shows the app and can load a CSV, without
failing at the one thing it can't do.

---

## How it fits together

```
Google Spark ──▶ Google Sheet ◀──▶ Apps Script web app ◀──▶ Ledgerly (browser)
                  (your data)        (in your account)        (this repo)
```

- `apps-script/Code.gs` — the backend. Auto-detects which tab holds your
  transactions and which column is which, adds the columns the app needs
  (category, who, notes, tags, and a stable row id), reads and writes rows, and
  keeps app settings in a hidden config tab. It never touches columns it doesn't
  own, so whatever else your automation writes is left alone.
- `src/lib/` — the domain: types, money and date handling, the analytics engine,
  the rules engine, CSV import/export, and the client store with its offline
  write queue.
- `src/components/`, `src/pages/` — the interface. Charts are hand-rolled SVG
  against a colour-blind-validated palette rather than a charting library.

### Notes on a couple of decisions

**Row identity.** The script adds a `Ledgerly ID` column and backfills it. Row
numbers move when a sheet is sorted or a row is inserted; ids don't, so an edit
made on your phone lands on the right row even if the sheet changed underneath.

**Offline writes.** Edits apply to the screen immediately and queue for the
sheet. If a write is rejected outright it's dropped with a visible error rather
than silently blocking every write behind it.

**Polling.** While the app is open and visible it asks the sheet a cheap
"anything new?" question every couple of minutes and only refetches when the
answer is yes. A hand edit made directly in the spreadsheet won't trip that
check — pull the sync button in the top bar for those.

**Duplicates.** An import only skips rows that match something already in the
ledger, never rows that repeat within the same file. Two identical charges
minutes apart — a phone top-up bought twice, the same transfer sent again — are
ordinary, and dropping the second would quietly understate the month. Possible
duplicates are surfaced on the overview for a person to judge instead.

---

## Keyboard

| | |
|---|---|
| `⌘K` / `Ctrl-K` | Command palette — search, navigate, run actions |
| `N` | Add a transaction |
| `/` | Focus search on the transactions page |
| `Alt-1` … `Alt-8` | Jump to a section |
| `Esc` | Close a dialog, or clear the selection |
