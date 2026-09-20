// Local-only preview: expose page assets, never database scripts or configuration files.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pages=new Set(['home.html','index.html','login.html','register.html','用户管理控制台.html']);
http.createServer(async(req,res)=>{
  let pathname;
  try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400).end();return;}
  if(pathname.startsWith('/api/')) {
    const upstream=http.request({hostname:'127.0.0.1',port:18081,path:req.url,method:req.method,headers:req.headers},reply=>{res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);});
    upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502,{'Content-Type':'application/json'});res.end(JSON.stringify({message:'Java服务未启动，请先启动本地18081端口服务'}));});req.pipe(upstream);return;
  }
  const relative=pathname==='/'?'login.html':pathname.slice(1),file=path.resolve(root,relative);
  if(!file.startsWith(root+path.sep) || !(pages.has(relative) || relative.startsWith('assets/')) || !['GET','HEAD'].includes(req.method)) {res.writeHead(404).end();return;}
  try {const content=await fs.readFile(file);const ext=path.extname(file);res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json'})[ext]||'application/octet-stream','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:content);}catch{res.writeHead(404).end();}
}).listen(18080,'127.0.0.1',()=>console.log('本地预览 http://127.0.0.1:18080/login.html；Ctrl+C停止'));
