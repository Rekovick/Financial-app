# Connecting Ledgerly to your Google Sheet

Twenty minutes, once. After that both of you just open a link.

Nothing here sends your transactions anywhere new. You are installing a small
script *inside your own spreadsheet* that answers questions from the app, and
the app runs entirely in your browser.

---

## Before you start

You need:

- The spreadsheet Google Spark writes your transactions into
- A Google account that can edit it (the owner's is simplest)
- Ten minutes of not being interrupted, because one step involves a permission
  screen that is easy to misread

You do **not** need a server, a Google Cloud project, or a paid anything.

---

## Step 1 — Pick an access code

Open Ledgerly and go to the connect screen. It generates a long random code for
you. Keep it, or type your own — anything hard to guess.

This code is the password to your transactions. Both your phones will need it.

## Step 2 — Put the script in your sheet

1. Open your spreadsheet
2. **Extensions → Apps Script**. A code editor opens in a new tab.
3. Select everything in the editor and delete it
4. Back in Ledgerly, press **Copy script**. The copy already has your access code
   embedded — you don't have to paste it separately.
5. Paste into the Apps Script editor and press **Save** (the disk icon)

Now run it once, so Google asks for permission while you're watching:

6. In the function dropdown at the top, choose **setUpLedgerly**
7. Press **Run**
8. Google will say *"This app isn't verified"* or similar. That is Google talking
   about **your own script**, which it has never seen before — there is no
   third party here. Choose **Advanced → Go to (your project name)**, then
   **Allow**.
9. The execution log should end with something like
   `Ready. Tab: Transactions · rows: 812`

If the log shows an error instead, jump to [Troubleshooting](#troubleshooting).

What `setUpLedgerly` did: it worked out which tab holds your transactions and
which column is the date, the amount and the description, then added the columns
the app needs but your sheet didn't have — Category, Type, Who, Tags, Notes,
Excluded, Reconciled and a `Ledgerly ID`. Existing columns were not touched,
moved or renamed.

## Step 3 — Publish it as a web app

Still in the Apps Script editor:

1. **Deploy → New deployment**
2. Click the gear next to "Select type" and choose **Web app**
3. Fill in:
   - **Description**: anything, e.g. `Ledgerly`
   - **Execute as**: **Me** — the script runs with your access to the sheet
   - **Who has access**: **Anyone**
4. **Deploy**, then **Copy** the web app URL. It ends in `/exec`.

> **"Anyone" — read this bit.**
>
> It does not mean your spreadsheet is public. It means Google will run the
> script without first demanding a Google sign-in, which is what lets the app
> call it from a phone. Every request still has to carry your access code, and
> requests without it are refused.
>
> So the URL and the code together behave like a password. Share both with your
> partner; share neither with anyone else. To revoke access later, open the
> script, change `SHARED_TOKEN`, save, and re-enter the new code on each device.

## Step 4 — Connect

Paste the `/exec` URL into Ledgerly and press **Connect**. Your transactions
should appear within a few seconds.

## Step 5 — Set it up on the second phone

Open the same Ledgerly link, go to the connect screen, and paste **the same URL
and the same access code**. Do not run steps 2 and 3 again — one script serves
both of you.

On iPhone: Share → *Add to Home Screen*. On Android: the ⋮ menu → *Install app*.
It then behaves like an app, including offline.

---

## Once you're in

A few minutes here will save you a lot later.

**Settings → Money & display.** Set your currency. If your salary lands on the
25th, set "Month starts on day" to 25 and every budget and total will follow
your real cycle instead of the calendar.

**Settings → Who's spending.** Put both your names in. That's what powers the
who-spent-what split.

**Rules.** If your sheet arrives uncategorized, this is the highest-value ten
minutes in the app. One rule — *description contains `UBER` → Transport* —
fixes every past Uber charge and every future one. Build a handful, press **Run
now**, and the rest of the app suddenly means something.

**Budgets.** Press **Suggest** to get starting caps from your own last three
months, then adjust.

---

## Troubleshooting

**"The web app asked for a Google sign-in instead of returning data"**
The deployment's access isn't set to Anyone. **Deploy → Manage deployments →**
pencil icon → change *Who has access* to **Anyone** → **Deploy**. The URL stays
the same.

**"Wrong access code for this Sheet"**
The code in the app doesn't match `SHARED_TOKEN` in the script. The reliable fix
is to copy the script again from the connect screen — that copy always has the
displayed code baked in — and paste it over the old one.

**"The script still has the placeholder token"**
The paste didn't take, or an older version is still deployed. Re-paste, save,
then **Deploy → Manage deployments →** pencil → set Version to **New version** →
**Deploy**. Editing the script does not republish it on its own.

**"No tab in this spreadsheet looks like a transaction list"**
The script looks for a tab with recognisable date and amount columns. Open the
script and set `SHEET_NAME` near the top to your tab's exact name:

```js
var SHEET_NAME = 'Sheet1';
```

Save, deploy a new version, try again.

**Columns matched to the wrong fields**
Rename the header in your sheet to something plainer (`Date`, `Description`,
`Amount`, `Category`, `Card`), then run `setUpLedgerly` again.

**Amounts have the wrong sign, or income shows as spending**
The script decides from your data: if the amount column contains any negative
numbers it treats the sign as the direction; otherwise everything is spending
unless a Type column says otherwise. If your sheet has a Type column with values
like `Credit` / `Debit`, make sure `setUpLedgerly` found it — it appears in the
detected columns in Settings → Data source.

**Dates are a month out**
An ambiguous date like `03/04/2026` is read using the spreadsheet's own
timezone: month-first for a US timezone, day-first otherwise. **File → Settings
→ Time zone** in the spreadsheet fixes it at the source.

**Changes don't show up on the other phone**
Each device caches its own copy and re-checks every couple of minutes. Tap the
sync icon in the top bar to fetch immediately. If you edited the spreadsheet by
hand rather than through the app, tap sync — the automatic check only notices
added rows.

**A change won't save**
The app shows an error and keeps the edit on the device. If it says you're
offline, it will retry by itself. If the sheet rejected it, the message says
why — usually the deployment was replaced and the URL changed.

---

## Getting your data out

Nothing here locks anything in.

- The spreadsheet is always the real copy, readable without this app
- **Transactions → ⋯ → Export these as CSV** exports whatever you're looking at
- **Settings → Your data → Export everything** exports the whole ledger
- **Settings → Your data → Export settings** saves categories, budgets, goals
  and rules as JSON
- Deleting the Apps Script deployment turns the app off and changes nothing
  about your sheet
