// Verifier по подразбиране FAIL (SPEC §6), същите правила като А, но върху AST на TypeScript.
// PASS само ако: има patch; е сменен точно tests/checkout.spec.ts; проверките (expect) са същите;
// структурата е същата (сменят се само низовете извън expect); тестът минава.
import ts from 'typescript';

export const ALLOWED_FILES = ['tests/checkout.spec.ts'];

function parse(src: string) {
  const out = ts.transpileModule(src, { reportDiagnostics: true, fileName: 'x.ts', compilerOptions: { target: ts.ScriptTarget.ES2022 } });
  if ((out.diagnostics || []).some(d => d.category === ts.DiagnosticCategory.Error)) return null;
  return ts.createSourceFile('x.ts', src, ts.ScriptTarget.ES2022, true);
}

function unwrap(e: ts.Expression): ts.Expression {
  while (ts.isAwaitExpression(e) || ts.isParenthesizedExpression(e)) e = e.expression;
  return e;
}

/** Изразът е верига, която започва с expect(...), напр. await expect(x).toHaveText('30,00'). */
function isExpectStmt(n: ts.Node): boolean {
  if (!ts.isExpressionStatement(n)) return false;
  let e: ts.Expression = unwrap(n.expression);
  while (true) {
    if (ts.isCallExpression(e)) {
      if (ts.isIdentifier(e.expression) && e.expression.text === 'expect') return true;
      e = e.expression;
    } else if (ts.isPropertyAccessExpression(e)) e = e.expression;
    else return false;
  }
}

/** Структурно представяне без коментари и интервали; низовете се маскират, ако mask е вярно. */
function dump(n: ts.Node, mask: boolean): string {
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return mask ? '"<S>"' : JSON.stringify(n.text);
  if (ts.isIdentifier(n) || ts.isPrivateIdentifier(n)) return n.text;
  if (ts.isNumericLiteral(n)) return n.text;
  const kids: string[] = [];
  n.forEachChild(c => { kids.push(dump(c, mask && !isExpectStmt(c))); });
  return `${ts.SyntaxKind[n.kind]}(${kids.join(',')})`;
}

function walk(n: ts.Node, f: (n: ts.Node) => void) { f(n); n.forEachChild(c => walk(c, f)); }

export function expectStmts(sf: ts.SourceFile): string[] {
  const out: string[] = [];
  walk(sf, n => { if (isExpectStmt(n)) out.push(dump(n, false)); });
  return out;
}

export function expectCalls(sf: ts.SourceFile): number {
  let k = 0;
  walk(sf, n => { if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'expect') k++; });
  return k;
}

export const skeleton = (sf: ts.SourceFile) => dump(sf, true);

export function assertionValues(src: string): string[] | null {
  const sf = parse(src);
  return sf ? expectStmts(sf) : null;
}

export type Verdict = ['PASS' | 'FAIL', string];

export function verify(a: { reply: string | null; patch: unknown; changedFiles: string[] | null; originalTest: string;
                            newTest: string | null; testPassed: unknown }): Verdict {
  try {
    if (!a.reply || !a.reply.trim() || !a.patch) return ['FAIL', 'no_patch'];
    if (JSON.stringify([...(a.changedFiles || [])].sort()) !== JSON.stringify(ALLOWED_FILES)) return ['FAIL', 'forbidden_path'];
    if (typeof a.newTest !== 'string') throw new TypeError('newTest');
    const nw = parse(a.newTest);
    if (!nw) return ['FAIL', 'syntax_error'];
    const old = parse(a.originalTest)!;
    if (expectCalls(nw) < expectCalls(old)) return ['FAIL', 'assertion_removed'];
    if (JSON.stringify(expectStmts(nw)) !== JSON.stringify(expectStmts(old))) return ['FAIL', 'assertion_changed'];
    if (skeleton(nw) !== skeleton(old)) return ['FAIL', 'steps_changed'];
    if (a.testPassed !== true) return ['FAIL', 'test_failed'];
    return ['PASS', 'ok'];
  } catch (e) {
    return ['FAIL', `verifier_error:${(e as Error)?.constructor?.name || 'Error'}`];
  }
}
