# The Apps Script backend

`Code.gs` is the entire server side of Ledgerly. It runs inside your own Google
account, on your own spreadsheet. Setup instructions are in
[`../docs/SETUP.md`](../docs/SETUP.md).

## What it exposes

Every call is a `POST` carrying `{ token, action, payload }` as JSON, and every
reply is `{ ok, data }` or `{ ok: false, error, code }`.

| Action | Does |
|---|---|
| `ping` | Liveness and auth check; returns the spreadsheet name and its tabs |
| `bootstrap` | Everything the app needs: transactions, saved config, column mapping |
| `revision` | A few bytes saying whether a full fetch is worth making |
| `upsert` | Update rows by id, appending any that don't exist yet |
| `delete` | Archive (default) or remove rows by id |
| `saveConfig` | Store categories, budgets, goals, rules and settings |
| `prepareSheet` | Add the app-managed columns the sheet is missing |
| `setMapping` | Override the auto-detected column mapping |

`GET` is supported for `ping` and `bootstrap` so you can sanity-check a
deployment from a browser:
`https://…/exec?token=YOUR_CODE&action=ping`

## Why POST bodies are `text/plain`

Apps Script web apps don't answer CORS pre-flight requests. A browser only skips
the pre-flight for a "simple" request, which rules out `application/json`. So the
client sends JSON with a `text/plain` content type and the script parses it
itself. If you change that header, every call will fail with an opaque CORS
error.

## Design notes

**It never clobbers columns it doesn't own.** Writing a row reads the existing
row first and only replaces the cells that map to app fields, so whatever else
your automation writes — a message id, a raw email link — survives every edit.

**Row identity is a column, not a row number.** `Ledgerly ID` is added on setup
and backfilled on every read. Sorting the sheet or inserting a row can't detach
an edit from its transaction.

**Amount convention is detected, not assumed.** If the amount column contains
any negative value the script treats the sign as the direction and writes
expenses back as negative. Otherwise amounts stay positive and direction lives
in the Type column.

**Writes take a document lock**, so two phones saving at once can't interleave.

## Running the tests

The backend has a test suite that runs outside Google, against a small fake of
the Sheets API:

```bash
node apps-script/test/run.mjs   # or: npm test, which runs these too
```

It covers column detection, date and amount parsing, id backfill, editing a row
without disturbing its neighbours, archiving on delete, and config round-trips.
Worth running after any change to `Code.gs` — debugging this logic inside the
Apps Script editor is slow and unpleasant.
