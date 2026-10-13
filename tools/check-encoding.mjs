import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const extensions=new Set(['.js','.jsx','.mjs','.ts','.tsx','.css','.html','.sql','.md','.json','.ps1','.py']);
const ignored=new Set(['node_modules','dist','build','.git']);
// UTF-8 byte sequences mistakenly interpreted as Windows-1252/Latin-1.
const mojibake=/[\u00c3\u00c2][\u0080-\u00bf\u0192\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u02c6\u02dc\u2013-\u201e\u2020-\u2022\u2026\u2030\u2039\u203a\u20ac\u2122]|\u00e2[\u0080\u20ac\u2020]|\ufffd/;
export function inspectUtf8(bytes){
 let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{return 'Invalid UTF-8 bytes';}
 const match=mojibake.exec(text);
 return match?`Corrupted text on line ${text.slice(0,match.index).split('\n').length}`:null;
}
async function walk(dir){
 const files=[];
 for(const entry of await readdir(dir,{withFileTypes:true})){
  if(ignored.has(entry.name))continue;
  const target=path.join(dir,entry.name);
  if(entry.isDirectory())files.push(...await walk(target));
  else if(extensions.has(path.extname(entry.name)))files.push(target);
 }
 return files;
}
async function main(){
 const files=(await Promise.all(['frontend/src','supabase','tools'].map(dir=>walk(path.join(root,dir))))).flat();
 files.push(path.join(root,'frontend/index.html'));
 const failures=[];
 for(const file of files){const problem=inspectUtf8(await readFile(file));if(problem)failures.push(`${path.relative(root,file)}: ${problem}`);}
 if(failures.length){process.stderr.write(failures.join('\n')+'\n');process.exitCode=1;}
 else process.stdout.write(`UTF-8 verified: ${files.length} files.\n`);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
