// Пуска AC от shared/acceptance.yaml, сравнява с expect и пише docs/runs/<дата>-b-<модел>-<таг>.md. Огледало на А.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseArgs } from 'node:util';
import YAML from 'yaml';
import { heal, type State } from './agent.ts';
import { assertionValues } from './verifier.ts';
import { ROOT, Workspace } from './workspace.ts';

const countExpect = (s: string) => s.split('expect(').length - 1;

function actual(s: State, ws: Workspace) {
  const nw = fs.readFileSync(ws.testFile, 'utf8');
  return {
    status: s.status, agent_calls: s.agent_calls, reruns: s.reruns, verifier: s.verdict, reason: s.reason,
    changed_files: [...new Set(ws.changedFiles().map(f => f.split('/')[0] + '/'))].sort(),
    assertion_kept: countExpect(nw) >= countExpect(ws.originalTest)
      && JSON.stringify(assertionValues(nw)) === JSON.stringify(assertionValues(ws.originalTest)),
  } as Record<string, unknown>;
}

const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

async function main() {
  const { values: args, positionals } = parseArgs({ allowPositionals: true, options: { model: { type: 'string', default: 'sonnet' }, tag: { type: 'string', default: '1' },
                                                  only: { type: 'string', multiple: true } } });
  const raw = fs.readFileSync(path.join(ROOT, 'shared', 'acceptance.yaml'));
  const want = fs.readFileSync(path.join(ROOT, 'shared', 'acceptance.sha256'), 'utf8').trim();
  if (crypto.createHash('sha256').update(raw).digest('hex') !== want) {  // критериите са сменени без [acceptance] commit
    console.error('СТОП: shared/acceptance.yaml не съвпада с shared/acceptance.sha256'); process.exit(1);
  }
  const spec = YAML.parse(raw.toString('utf8'));
  const known = new Set<string>(spec.cases.map((c: { id: string }) => c.id));
  const only = [...(args.only ?? []), ...positionals];  // --only AC1 AC2 като в А
  const unknown = only.filter(x => !known.has(x));
  if (unknown.length) { console.error(`СТОП: непознати AC в --only: ${unknown}`); process.exit(1); }

  const rows: unknown[][] = [];
  let tin = 0, tout = 0, wall = 0, cost = 0, healed = 0, tried = 0, turns = 0;
  for (const c of spec.cases) {
    if (only.length && !only.includes(c.id)) continue;
    let s: Partial<State> = { wall_seconds: 0 }, a: Record<string, unknown>;
    try {
      const ws = new Workspace(c.id, c.fixture);
      const st = await ws.serve(url => heal(ws, url, args.model, c.agent_override));
      s = st; a = actual(st, ws);
    } catch (e) {  // срив в един случай е несъвпадение, не край на пускането
      console.error(e);
      a = { status: 'CRASH', reason: (e as Error)?.constructor?.name || 'Error', agent_calls: 0 };
    }
    const miss = Object.fromEntries(Object.entries(c.expect).filter(([k, v]) => !eq(a[k], v)).map(([k, v]) => [k, [v, a[k]]]));
    const ok = !Object.keys(miss).length;
    tin += s.tokens_in || 0; tout += s.tokens_out || 0; cost += s.cost_usd || 0; wall += s.wall_seconds || 0; turns += s.turns || 0;
    if (['rename-id', 'change-button-text', 'remove-feature'].includes(c.fixture) && !c.agent_override) { tried++; healed += +(a.status === 'HEALED'); }
    const note = s.denied?.length ? ` · отказани: ${s.denied.join('; ')}` : '';
    rows.push([c.id, c.fixture, c.agent_override || '', a.status, (a.reason || '') + note, a.agent_calls, s.wall_seconds,
               ok ? 'ДА' : `НЕ ${JSON.stringify(miss)}`]);
    console.log(`${c.id}: ${a.status} ${a.reason || ''} (${s.wall_seconds} s) ${ok ? 'ok' : JSON.stringify(miss)}${note}`);
  }
  const okN = rows.filter(r => r[r.length - 1] === 'ДА').length;
  const day = new Date().toISOString().slice(0, 10);
  const out = path.join(ROOT, 'docs', 'runs', `${day}-b-${args.model}-${args.tag}.md`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const partial = only.length ? ` · ЧАСТИЧНО (${only.join(', ')})` : '';
  const lines = [`# HealCheck Б · ${day} · модел ${args.model} · пускане ${args.tag}${partial}`, '',
    `Съвпадение с expect: **${okN} от ${rows.length}**`, '',
    `fix_rate ${healed}/${tried} (истински ремонти от повреди, без подмените отговори) · wall_seconds ${wall.toFixed(1)} · ` +
    `tokens_in ${tin} · tokens_out ${tout} · cost_usd ${cost.toFixed(4)} (по цените на API; плаща се от абонамента) · ходове на агента ${turns}`, '',
    '| AC | повреда | подмяна | статус | причина | извиквания | сек | съвпада |', '|---|---|---|---|---|---|---|---|',
    ...rows.map(r => `| ${r.join(' | ')} |`)];
  fs.writeFileSync(out, lines.join('\n') + '\n', 'utf8');
  console.log(`запис: ${out}`);
  process.exit(rows.length && okN === rows.length ? 0 : 1);
}

main();
