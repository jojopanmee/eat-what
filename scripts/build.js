import {cp,mkdir,rm,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const out=join(root,'dist');
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
for(const p of ['index.html','privacy.html','terms.html','sw.js','src','assets'])await cp(join(root,p),join(out,p),{recursive:true});
const base=process.env.BASE_PATH||'./';
if(!/^\.\/|^\/[A-Za-z0-9._/-]*\/$/.test(base))throw Error('BASE_PATH must be ./ or a path such as /eat-what/');
if(base!=='./'){const html=await readFile(join(out,'index.html'),'utf8');await writeFile(join(out,'index.html'),html.replace('href="./src/style.css"',`href="${base}src/style.css"`).replace('src="./src/app.js"',`src="${base}src/app.js"`));}
console.log(`Built static site in dist/ with base ${base}`);
