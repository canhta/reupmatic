import ts from '/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js';
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const files = [];
function walk(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
  const name = path.join(dir, entry.name);
  if (entry.isDirectory()) walk(name);
  else if (/\.(ts|tsx|cts|mts)$/.test(name) && !name.endsWith('.d.ts')) files.push(name);
} }
walk(path.join(root, 'app'));
const errors = [];
for (const file of files) {
 const result = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file,
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX }, reportDiagnostics: true });
 for (const diagnostic of result.diagnostics ?? []) if (diagnostic.category === ts.DiagnosticCategory.Error)
  errors.push(`${path.relative(root, file)}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`);
}
console.log(`TypeScript ${ts.version}: syntax/transpilation of ${files.length} implementation files; ${errors.length} errors.`);
console.log('Not dependency-resolved typechecking, installed UI validation, or execution.');
for (const error of errors) console.error(error);
const visited = new Set();
const violations = [];
function inspect(file) {
 if (visited.has(file)) return;
 visited.add(file);
 const output = ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const tree = ts.createSourceFile(file,output,ts.ScriptTarget.ES2022,true,ts.ScriptKind.JS);
 function valueImport(specifier) {
  if (/^(node:|electron(?:\/|$)|fs$|path$|os$|crypto$|child_process$|events$|sqlite$)/.test(specifier)) {
   violations.push(`${path.relative(root,file)} -> ${specifier}`); return;
  }
  if (!specifier.startsWith('.')) return;
  const base=path.resolve(path.dirname(file),specifier).replace(/\.(?:js|jsx|cjs|mjs)$/,'');
  const target=[base+'.ts',base+'.tsx',base+'.cts',base+'.mts',path.join(base,'index.ts'),path.join(base,'index.tsx')].find(f=>fs.existsSync(f));
  if(target) inspect(target);
 }
 function visit(node) {
  if ((ts.isImportDeclaration(node)||ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) valueImport(node.moduleSpecifier.text);
  if (ts.isCallExpression(node) && node.expression.kind===ts.SyntaxKind.ImportKeyword && node.arguments.length && ts.isStringLiteral(node.arguments[0])) valueImport(node.arguments[0].text);
  ts.forEachChild(node,visit);
 }
 visit(tree);
}
for(const file of files.filter(f=>f.startsWith(path.join(root,'app/ui/')))) inspect(file);
console.log(`Renderer value-import AST traversal: ${visited.size} reachable local files; ${violations.length} Node/Electron violations.`);
for(const violation of violations) console.error(violation);
if(errors.length||violations.length) process.exitCode=1;
