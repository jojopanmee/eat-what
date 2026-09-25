import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,join,extname} from 'node:path';
const root=resolve(import.meta.dirname,'..',process.argv.includes('--dist')?'dist':'.');
const port=Number(process.env.PORT||5173);
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.json':'application/json'};
createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');let pathname=decodeURIComponent(url.pathname);if(pathname.startsWith('/eat-what/'))pathname=pathname.slice('/eat-what'.length);const file=resolve(root,'.'+pathname);if(!file.startsWith(root)){res.writeHead(403).end();return}const s=await stat(file).catch(()=>null);const target=s?.isDirectory()?join(file,'index.html'):file;const body=await readFile(target);res.writeHead(200,{'content-type':types[extname(target)]||'application/octet-stream'});res.end(body)}catch{res.writeHead(404).end('Not found')}}).listen(port,()=>console.log(`Eat What? → http://localhost:${port}`));
