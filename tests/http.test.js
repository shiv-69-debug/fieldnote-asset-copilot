import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../server.js';
test('HTTP preserves UTF-8 across chunks, rejects cross-origin writes, and scopes history by user', async () => {
  const {server,store}=createApp({database:':memory:'});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port;
  try {
    const body=Buffer.from(JSON.stringify({question:'WELL-0007 is down for planned work. Café',userId:'U-201',mode:'local'}));
    const split=body.indexOf(Buffer.from('é'))+1;
    const response=await new Promise((resolve,reject)=> {
      const req=http.request({hostname:'127.0.0.1',port,path:'/api/chat',method:'POST',headers:{'Content-Type':'application/json'}},res=>{let text='';res.on('data',c=>text+=c);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(text)}));});
      req.on('error',reject);req.write(body.subarray(0,split));setTimeout(()=>req.end(body.subarray(split)),20);
    });
    assert.equal(response.status,200);assert.match(store.knowledge[0].text,/Café/);
    const rejected=await fetch(`http://127.0.0.1:${port}/api/chat`,{method:'POST',headers:{Origin:'https://unrelated.example','Content-Type':'application/json'},body:'{}'});assert.equal(rejected.status,403);
    const other=await fetch(`http://127.0.0.1:${port}/api/history?userId=U-202`).then(r=>r.json());assert.deepEqual(other,[]);
    const chats=await fetch(`http://127.0.0.1:${port}/api/conversations?userId=U-201`).then(r=>r.json());
    assert.equal(chats.length,1);assert.match(chats[0].title,/Café/);assert.equal(chats[0].response,undefined);
    const sourceId='CHAT-'+store.history('U-201')[0].id;
    const privateSource=await fetch(`http://127.0.0.1:${port}/api/conversation-source?userId=U-201&id=${sourceId}`);assert.equal(privateSource.status,200);
    const forbiddenSource=await fetch(`http://127.0.0.1:${port}/api/conversation-source?userId=U-202&id=${sourceId}`);assert.equal(forbiddenSource.status,404);
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
