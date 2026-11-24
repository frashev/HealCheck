// Един случай: тест → (зелено? край) → диагноза → ремонт от агент (Claude Agent SDK) → пак тест → verifier → статус.
// Огледало на графа от А, но ремонтът е агент с инструменти Read и Edit, а не JSON отговор. Най-много 1 ремонт.
import fs from 'node:fs';
import path from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { verify } from './verifier.ts';
import { TEST_REL, Workspace, type RunResult } from './workspace.ts';

const SYSTEM =
  'Ти поправяш счупен Playwright тест (TypeScript). Приложението се е променило; тестът трябва да следи новото поведение. ' +
  `Можеш да променяш САМО файла ${TEST_REL}, с инструмента Edit. Не маха и не сменяй проверки (expect) и очаквани стойности, ` +
  'не добавяй и не маха стъпки: смени само селекторите или текстовете, по които се търсят елементите. ' +
  'Ако няма как да поправиш теста без да сменяш стъпките или проверките, не го пипай. Накрая кажи с едно изречение какво направи.';

export type Patch = { file: string; old: string; new: string } | null;
export type State = {
  first?: RunResult; second?: RunResult; kind?: 'real_bug' | 'locator';
  reply: string; patch: Patch; agent_calls: number; reruns: number;
  tokens_in: number; tokens_out: number; cost_usd: number; turns: number; denied: string[];
  verdict?: string; reason?: string; status?: string; wall_seconds?: number;
};

/** Подменени отговори за AC6–AC9: проверяват verifier-а без модел. Прилагат се като JSON patch, като в А. */
function override(kind: string, test: string): string {
  if (kind === 'empty-reply') return '';
  if (kind === 'weaken-assertion') {
    const nw = test.replace('#login-btn', '#signin-btn').split('\n').filter(l => !l.includes('expect(page')).join('\n');
    return JSON.stringify({ file: TEST_REL, old: test, new: nw });
  }
  if (kind === 'extra-steps') {  // AC9: стига до същата сума с повторни кликове вместо липсващия продукт
    const add1 = "await page.getByTestId('add-1').click();";
    return JSON.stringify({ file: TEST_REL, old: "await page.getByTestId('add-2').click();", new: `${add1}\n  ${add1}` });
  }
  if (kind === 'edit-outside-tests') return JSON.stringify({ file: 'app/index.html', old: 'id="signin-btn"', new: 'id="login-btn"' });
  throw new Error(`непозната подмяна ${kind}`);
}

function parsePatch(reply: string): Patch {
  try {
    const p = JSON.parse(reply);
    return p && typeof p.file === 'string' && typeof p.old === 'string' && typeof p.new === 'string' ? p : null;
  } catch { return null; }
}

/** Прилага JSON patch в работното копие. Дали пътят е позволен решава verifier-ът, не тази стъпка. */
function applyPatch(ws: Workspace, patch: Patch): Patch {
  if (!patch) return null;
  try {
    const target = path.resolve(ws.dir, patch.file);
    if (!target.startsWith(ws.dir + path.sep) || !fs.existsSync(target)) return null;
    const src = fs.readFileSync(target, 'utf8');
    if (!src.includes(patch.old)) return null;
    fs.writeFileSync(target, src.replace(patch.old, () => patch.new), 'utf8');
    return patch;
  } catch { return null; }
}

/** Истинският ремонт: агент с Read и Edit, cwd е работното копие; Edit е позволен само върху теста. */
async function agentRepair(ws: Workspace, model: string, first: RunResult, s: State) {
  const test = fs.readFileSync(ws.testFile, 'utf8');
  const prompt = `Тест (${TEST_REL}):\n\`\`\`ts\n${test}\`\`\`\n\nГрешка:\n\`\`\`\n${first.output.slice(-2500)}\n\`\`\`\n\n` +
    `DOM при грешката:\n\`\`\`html\n${first.dom.slice(0, 6000)}\n\`\`\``;
  const inside = (p: unknown) => typeof p === 'string' && path.resolve(ws.dir, p).startsWith(ws.dir + path.sep);
  let reply = '';
  for await (const m of query({
    prompt,
    options: {
      model, cwd: ws.dir, systemPrompt: SYSTEM, tools: ['Read', 'Edit'], settingSources: [], maxTurns: 6,
      permissionMode: 'default',
      canUseTool: async (name, input) => {
        const ok = (name === 'Read' && inside(input.file_path)) ||
                   (name === 'Edit' && typeof input.file_path === 'string' && path.resolve(ws.dir, input.file_path) === ws.testFile);
        if (ok) return { behavior: 'allow', updatedInput: input };
        s.denied.push(`${name} ${String(input.file_path ?? '')}`);
        return { behavior: 'deny', message: `Позволено е само Read в работната папка и Edit на ${TEST_REL}.` };
      },
    },
  })) {
    if (m.type === 'result') {
      reply = m.subtype === 'success' ? m.result : '';
      const u = m.usage as unknown as Record<string, number>;
      s.tokens_in += (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
      s.tokens_out += u.output_tokens || 0;
      s.cost_usd += m.total_cost_usd || 0;
      s.turns = m.num_turns;
    }
  }
  const nw = fs.readFileSync(ws.testFile, 'utf8');
  s.reply = reply;
  s.patch = nw !== test ? { file: TEST_REL, old: test, new: nw } : null;
}

export async function heal(ws: Workspace, url: string, model = 'sonnet', ovr?: string): Promise<State> {
  const t0 = Date.now();
  const s: State = { reply: '', patch: null, agent_calls: 0, reruns: 0, tokens_in: 0, tokens_out: 0, cost_usd: 0, turns: 0, denied: [] };
  s.first = await ws.runTest(url);
  if (s.first.passed) s.status = 'GREEN';
  else {
    s.kind = s.first.valueMismatch ? 'real_bug' : 'locator';
    if (s.kind === 'real_bug') s.status = 'REAL_BUG';
    else {
      s.agent_calls = 1;
      if (ovr) { s.reply = override(ovr, fs.readFileSync(ws.testFile, 'utf8')); s.patch = applyPatch(ws, parsePatch(s.reply)); }
      else await agentRepair(ws, model, s.first, s);
      s.second = await ws.runTest(url);
      s.reruns = 1;
      [s.verdict, s.reason] = verify({ reply: s.reply, patch: s.patch, changedFiles: ws.changedFiles(), originalTest: ws.originalTest,
                                       newTest: fs.readFileSync(ws.testFile, 'utf8'), testPassed: s.second.passed });
      s.status = s.verdict === 'PASS' ? 'HEALED' : 'STOP';
    }
  }
  s.wall_seconds = Math.round((Date.now() - t0) / 100) / 10;
  return s;
}
