// Работно копие за един случай: app + tests, повреда, местен сървър, пускане на Playwright Test. Огледало на А.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const IMPL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ROOT = path.resolve(IMPL, '..');
export const TEST_REL = 'tests/checkout.spec.ts';

const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css' };

function walk(dir: string, base = dir, out: Record<string, Buffer> = {}) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out);
    else if (e.name !== 'dom.html') out[path.relative(base, p).split(path.sep).join('/')] = fs.readFileSync(p);
  }
  return out;
}

function run(cmd: string, args: string[], opts: { cwd: string; env: NodeJS.ProcessEnv }, ms: number):
    Promise<{ status: number | null; stdout: string; stderr: string; error?: Error }> {
  return new Promise(resolve => {
    const p = spawn(cmd, args, opts);
    let stdout = '', stderr = '';
    p.stdout.setEncoding('utf8').on('data', d => stdout += d);
    p.stderr.setEncoding('utf8').on('data', d => stderr += d);
    const t = setTimeout(() => { p.kill(); resolve({ status: null, stdout, stderr, error: new Error(`тестът не завърши за ${ms / 1000} s`) }); }, ms);
    p.on('error', error => { clearTimeout(t); resolve({ status: null, stdout, stderr, error }); });
    p.on('close', status => { clearTimeout(t); resolve({ status, stdout, stderr }); });
  });
}

export type RunResult = { passed: boolean; output: string; dom: string; valueMismatch: boolean };

export class Workspace {
  dir: string;
  testFile: string;
  originalTest: string;
  private snap: Record<string, Buffer>;

  constructor(public caseId: string, fixture: string) {
    this.dir = path.join(IMPL, 'work', caseId);
    fs.rmSync(this.dir, { recursive: true, force: true });
    fs.cpSync(path.join(ROOT, 'shared', 'app'), path.join(this.dir, 'app'), { recursive: true });
    fs.cpSync(path.join(IMPL, 'tests'), path.join(this.dir, 'tests'), { recursive: true });
    if (fixture !== 'none') {
      const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'shared', 'fixtures', `${fixture}.json`), 'utf8'));
      for (const e of spec.edits) {
        const f = path.join(this.dir, 'app', e.file);
        const s = fs.readFileSync(f, 'utf8');
        if (s.split(e.old).length !== 2) throw new Error(`повредата ${fixture} не пасва на ${e.file}`);
        fs.writeFileSync(f, s.replace(e.old, () => e.new), 'utf8');
      }
    }
    this.testFile = path.join(this.dir, TEST_REL);
    this.originalTest = fs.readFileSync(this.testFile, 'utf8');
    this.snap = walk(this.dir);
  }

  changedFiles(): string[] {
    const now = walk(this.dir);
    const keys = new Set([...Object.keys(now), ...Object.keys(this.snap)]);
    return [...keys].filter(k => !(now[k] && this.snap[k] && now[k].equals(this.snap[k]))).sort();
  }

  async serve<T>(fn: (url: string) => Promise<T>): Promise<T> {
    const root = path.join(this.dir, 'app');
    const srv = http.createServer((req, res) => {
      const rel = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\/+/, '') || 'index.html';
      const f = path.resolve(root, rel);
      if (!f.startsWith(root + path.sep) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
      res.end(fs.readFileSync(f));
    });
    await new Promise<void>(r => srv.listen(0, '127.0.0.1', () => r()));
    const port = (srv.address() as { port: number }).port;
    try { return await fn(`http://127.0.0.1:${port}/index.html`); }
    finally { await new Promise(r => srv.close(r)); }
  }

  async runTest(url: string): Promise<RunResult> {
    const dom = path.join(this.dir, 'dom.html');
    fs.rmSync(dom, { force: true });
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hc-b-'));
    const json = path.join(tmp, 'report.json');
    // Асинхронно: сървърът е в същия процес и трябва да отговаря, докато тестът върви.
    const r = await run(process.execPath, [path.join(IMPL, 'node_modules', '@playwright', 'test', 'cli.js'), 'test',
      '--config', path.join(IMPL, 'playwright.config.ts'), '--reporter=list,json'], {
      cwd: IMPL,
      env: { ...process.env, APP_URL: url, HEALCHECK_DOM: dom, HC_TESTS: path.join(this.dir, 'tests'), HC_OUT: path.join(tmp, 'out'),
             PLAYWRIGHT_JSON_OUTPUT_NAME: json, FORCE_COLOR: '0', CI: '1' },
    }, 120_000);
    const output = r.error ? `TIMEOUT или грешка при пускане: ${r.error.message}` : `${r.stdout}${r.stderr}`;
    // Минал = точно 1 очакван тест, без пропуснати, нестабилни или паднали (като А).
    let passed = false, valueMismatch = false;
    try {
      const rep = JSON.parse(fs.readFileSync(json, 'utf8'));
      const st = rep.stats || {};
      passed = r.status === 0 && st.expected === 1 && !st.unexpected && !st.skipped && !st.flaky && !(rep.errors || []).length;
    } catch { passed = false; }
    // Елементът е намерен, но текстът е друг: грешка в приложението, не в теста.
    // Playwright 1.65 пише „Received: "60,00"“ и „locator resolved to“; при липсващ елемент е „element(s) not found“.
    valueMismatch = !passed && /toHaveText/.test(output) && /Received(?: string)?: "/.test(output)
      && /locator resolved to/.test(output) && !/element\(s\) not found/.test(output);
    fs.rmSync(tmp, { recursive: true, force: true });
    return { passed, output: output.slice(-6000), dom: fs.existsSync(dom) ? fs.readFileSync(dom, 'utf8') : '', valueMismatch };
  }
}
