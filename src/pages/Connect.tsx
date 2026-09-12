import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronRight, Copy, ExternalLink, FileSpreadsheet, Info, KeyRound, PlayCircle, ShieldCheck } from 'lucide-react';
import APPS_SCRIPT_SOURCE from '../../apps-script/Code.gs?raw';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Label } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Misc';
import { Logo } from '@/components/layout/AppShell';
import { ImportDialog } from '@/components/ImportDialog';
import { useStore } from '@/lib/store';
import { PREVIEW_ONLY, validateWebAppUrl } from '@/lib/api';
import { cn } from '@/lib/cn';

/** A random token the user pastes into the script — generated locally, never sent anywhere. */
function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function Connect() {
  const navigate = useNavigate();
  const { connect, useDemo, useLocalPreview, status, error, mode } = useStore();

  const [token, setToken] = useState(generateToken);
  const [url, setUrl] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const script = APPS_SCRIPT_SOURCE.replace(
    "var SHARED_TOKEN = 'CHANGE-ME-to-a-long-random-string';",
    `var SHARED_TOKEN = '${token}';`,
  );

  const urlError = touched ? validateWebAppUrl(url) : null;

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard is blocked in some embedded browsers; the textarea is still selectable.
      setCopied('failed');
      setTimeout(() => setCopied(null), 2000);
    }
  };

  const submit = async () => {
    setTouched(true);
    if (validateWebAppUrl(url)) return;
    setBusy(true);
    const okResult = await connect({ url: url.trim(), token: token.trim() });
    setBusy(false);
    if (okResult) navigate('/');
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-10">
      <header className="flex flex-col items-center gap-3 pt-4 text-center">
        <Logo size={48} />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Connect your spreadsheet</h1>
          <p className="mx-auto mt-1.5 max-w-md text-[14px] leading-relaxed text-muted">
            Ledgerly reads and writes the Google Sheet you already have. Nothing is copied to another server — the
            spreadsheet stays the only place your transactions live.
          </p>
        </div>
      </header>

      {PREVIEW_ONLY && (
        <Card className="border-warning/40 bg-warning/[0.08]">
          <CardBody className="flex items-start gap-3 py-4">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div className="min-w-0 text-[13.5px] leading-relaxed">
              <p className="font-semibold">This preview link can't reach Google Sheets.</p>
              <p className="mt-1 text-ink-2">
                It's a sandboxed page, so it isn't allowed to call your Apps Script. Everything else works —
                load a CSV below to see your own numbers, on your phone, with nothing leaving the device.
                For live two-way sync with the spreadsheet, run the app from your own host; the steps below
                are still the ones you'll follow there.
              </p>
            </div>
          </CardBody>
        </Card>
      )}

      <Card className="border-accent/25 bg-accent-soft/40">
        <CardBody className="space-y-3 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <FileSpreadsheet className="h-5 w-5 shrink-0 text-accent" />
            <p className="min-w-0 flex-1 text-[13.5px] leading-snug">
              <span className="font-semibold">Try it on your own numbers first.</span>{' '}
              <span className="text-ink-2">
                In your spreadsheet: <strong>File → Download → Comma-separated values</strong>, then load it here.
                It stays on this device — nothing is uploaded and nothing is written back.
              </span>
            </p>
            <Button
              variant="primary"
              onClick={() => {
                useLocalPreview();
                setImportOpen(true);
              }}
            >
              Load a CSV
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-accent/15 pt-3">
            <PlayCircle className="h-5 w-5 shrink-0 text-muted" />
            <p className="min-w-0 flex-1 text-[13.5px] leading-snug text-ink-2">
              Or open a sample ledger with a year of made-up data.
            </p>
            <Button
              variant="secondary"
              onClick={() => {
                useDemo();
                navigate('/');
              }}
            >
              Try the demo
            </Button>
          </div>
        </CardBody>
      </Card>

      <Step
        n={1}
        title="Pick an access code"
        body="This is the shared secret between the app and your sheet. Keep the generated one, or type your own."
      >
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="pl-9 font-mono text-[13px]"
              aria-label="Access code"
              spellCheck={false}
            />
          </div>
          <Button variant="secondary" onClick={() => setToken(generateToken())}>
            New
          </Button>
        </div>
        <p className="mt-2 text-[12.5px] text-muted">
          Both of you will need this on each device, along with the link from step 3.
        </p>
      </Step>

      <Step
        n={2}
        title="Paste the script into your sheet"
        body={
          <>
            Open your spreadsheet, then <strong>Extensions → Apps Script</strong>. Delete whatever is in the editor,
            paste this in, and press <strong>Save</strong>. Then choose <strong>setUpLedgerly</strong> from the
            function list and press <strong>Run</strong> once, approving the permission prompt.
          </>
        }
      >
        <div className="relative">
          <pre className="max-h-56 overflow-auto rounded-xl border border-hairline bg-raised p-3 text-[11.5px] leading-relaxed text-ink-2">
            <code>{script.slice(0, 1400)}…</code>
          </pre>
          <Button
            variant="primary"
            size="sm"
            className="absolute right-2 top-2"
            onClick={() => void copy(script, 'script')}
          >
            {copied === 'script' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied === 'script' ? 'Copied' : 'Copy script'}
          </Button>
        </div>
        <p className="mt-2 text-[12.5px] text-muted">
          The copy already has your access code filled in. {copied === 'failed' && (
            <span className="text-critical">Copying was blocked — select the text above manually.</span>
          )}
        </p>
      </Step>

      <Step
        n={3}
        title="Deploy it as a web app"
        body={
          <>
            In the Apps Script editor: <strong>Deploy → New deployment</strong>, pick type{' '}
            <strong>Web app</strong>, set <strong>Execute as: Me</strong> and{' '}
            <strong>Who has access: Anyone</strong>, then Deploy and copy the web app URL.
          </>
        }
      >
        <div className="rounded-xl border border-hairline bg-raised p-3">
          <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-ink-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-good" />
            <span>
              <strong>“Anyone” sounds alarming — here's what it means.</strong> Google will let the request through
              without a sign-in, and your access code is what actually guards the data. Anyone who has both the URL
              and the code can read and change your transactions, so treat the pair like a password: share it with
              your partner, and nobody else.
            </span>
          </p>
        </div>

        <div className="mt-3">
          <Label htmlFor="c-url">Web app URL</Label>
          <Input
            id="c-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="https://script.google.com/macros/s/.../exec"
            invalid={!!urlError}
            spellCheck={false}
            className="font-mono text-[13px]"
          />
          {urlError && <p className="mt-1.5 text-[12.5px] text-critical">{urlError}</p>}
        </div>
      </Step>

      {error && status === 'error' && (
        <Card className="border-critical/30 bg-critical/[0.06]">
          <CardBody className="py-3.5 text-[13px] leading-relaxed">
            <p className="font-semibold text-critical">Could not connect</p>
            <p className="mt-0.5 text-ink-2">{error}</p>
          </CardBody>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          size="lg"
          loading={busy}
          onClick={() => void submit()}
          disabled={!url.trim() || PREVIEW_ONLY}
          title={PREVIEW_ONLY ? "This preview link can't call Google Sheets" : undefined}
        >
          Connect
          <ChevronRight className="h-4 w-4" />
        </Button>
        {mode !== 'unset' && (
          <Button variant="ghost" onClick={() => navigate('/')}>
            Back to the app
          </Button>
        )}
        <a
          href="https://script.google.com"
          target="_blank"
          rel="noreferrer"
          className="ml-auto inline-flex items-center gap-1.5 text-[13px] font-medium text-accent hover:underline"
        >
          Open Apps Script
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      <ImportDialog
        open={importOpen}
        onClose={() => {
          setImportOpen(false);
          navigate('/');
        }}
      />

      <Card>
        <CardHeader title="If something goes wrong" />
        <CardBody className="space-y-3 pt-2 text-[13px] leading-relaxed text-ink-2">
          <Trouble title="“The web app asked for a Google sign-in”">
            The deployment's access is not set to <strong>Anyone</strong>. Deploy → Manage deployments → edit → change
            “Who has access”, then Deploy again. The URL stays the same.
          </Trouble>
          <Trouble title="“Wrong access code”">
            The code in the app doesn't match <code className="rounded bg-hairline px-1">SHARED_TOKEN</code> in the
            script. Copy the script again from step 2 — it embeds the code shown above.
          </Trouble>
          <Trouble title="“No tab looks like a transaction list”">
            The script looks for a tab with date and amount columns. Set{' '}
            <code className="rounded bg-hairline px-1">SHEET_NAME</code> at the top of the script to your tab's exact
            name, save, and try again.
          </Trouble>
          <Trouble title="Changes don't show up on the other phone">
            Each device caches its own copy and re-checks about once a minute. Pull down or press the sync icon in the
            top bar to fetch immediately.
          </Trouble>
        </CardBody>
      </Card>
    </div>
  );
}

function Step({
  n,
  title,
  body,
  children,
}: {
  n: number;
  title: string;
  body: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-[13px] font-semibold text-white',
            )}
          >
            {n}
          </span>
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
            <p className="mt-1 text-[13.5px] leading-relaxed text-ink-2">{body}</p>
          </div>
        </div>
        <div className="sm:pl-10">{children}</div>
      </CardBody>
    </Card>
  );
}

function Trouble({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-xl border border-hairline px-3 py-2.5">
      <summary className="cursor-pointer list-none text-[13.5px] font-medium marker:hidden">
        <span className="inline-flex items-center gap-2">
          <Badge tone="neutral">?</Badge>
          {title}
        </span>
      </summary>
      <p className="mt-2 pl-1 text-[13px] leading-relaxed text-muted">{children}</p>
    </details>
  );
}
