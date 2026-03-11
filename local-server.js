const http = require('http');
const fs = require('fs');
const path = require('path');
const root = process.cwd();
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'application/javascript; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg' };
http.createServer((req,res)=>{
  const u = decodeURIComponent((req.url||'/').split('?')[0]);
  const rel = u === '/' ? '/index.html' : u;
  const file = path.normalize(path.join(root, rel));
  if(!file.startsWith(root)){res.writeHead(403);return res.end('Forbidden');}
  fs.readFile(file,(err,data)=>{
    if(err){res.writeHead(404);return res.end('Not found');}
    res.writeHead(200, {'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream'});
    res.end(data);
  });
}).listen(5510,'127.0.0.1');
