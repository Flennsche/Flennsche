
import { DurableObject } from "cloudflare:workers";

const enc = new TextEncoder();

function json(data, status=200, headers={}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {"content-type":"application/json; charset=utf-8", "cache-control":"no-store", ...headers}
  });
}
function b64(bytes) {
  let s=""; for (const b of new Uint8Array(bytes)) s+=String.fromCharCode(b);
  return btoa(s).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
}
function unb64(s) {
  s=s.replaceAll("-","+").replaceAll("_","/");
  while(s.length%4)s+="=";
  const bin=atob(s); const out=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);
  return out;
}
function token(){return b64(crypto.getRandomValues(new Uint8Array(32)))}
function code(){return "TOGETHER-"+crypto.randomUUID().replaceAll("-","").slice(0,8).toUpperCase()}
async function derive(password,salt){
  const key=await crypto.subtle.importKey("raw",enc.encode(password),"PBKDF2",false,["deriveBits"]);
  const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt:unb64(salt),iterations:100000,hash:"SHA-256"},key,256);
  return b64(bits);
}
async function body(req){try{return await req.json()}catch(_){return {}}}

export default {
  async fetch(request, env) {
    const url=new URL(request.url);
    try {

    if (request.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
      return new Response(null,{status:204,headers:{
        "access-control-allow-origin": url.origin,
        "access-control-allow-methods":"GET,POST,OPTIONS",
        "access-control-allow-headers":"content-type,authorization",
        "cache-control":"no-store"
      }});
    }

    if (url.pathname==="/ws" && request.headers.get("Upgrade")?.toLowerCase()==="websocket") {
      const id=env.CORE.idFromName("global");
      return env.CORE.get(id).fetch(request);
    }

    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({ok:true, service:"together", version:"9.4"});
    }

    if (url.pathname.startsWith("/api/")) {
      const id=env.CORE.idFromName("global");
      return env.CORE.get(id).fetch(request);
    }

    return env.ASSETS.fetch(request);
    } catch (err) {
      console.error("Worker request failed", err);
      return json({error:"Together-Serverfehler. Bitte erneut versuchen.", detail: String(err?.message || "unbekannter Fehler")},500);
    }
  }
};

export class TogetherCore extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx=ctx;
    this.env=env;
  }

  async getUsers(){return (await this.ctx.storage.get("users"))||{}}
  async getSessions(){return (await this.ctx.storage.get("sessions"))||{}}
  async getCodes(){return (await this.ctx.storage.get("codes"))||{}}
  async getCouples(){return (await this.ctx.storage.get("couples"))||{}}

  async userFromRequest(req){
    const auth=req.headers.get("authorization")||"";
    const t=auth.startsWith("Bearer ")?auth.slice(7):"";
    if(!t)return null;
    const sessions=await this.getSessions();
    const uid=sessions[t]; if(!uid)return null;
    const users=await this.getUsers(); return users[uid]||null;
  }

  async fetch(request){
    try {
    const url=new URL(request.url);

    if(url.pathname==="/ws" && request.headers.get("Upgrade")?.toLowerCase()==="websocket"){
      const tokenQ=url.searchParams.get("token")||"";
      const sessions=await this.getSessions(), uid=sessions[tokenQ];
      const users=await this.getUsers(), user=uid&&users[uid];
      if(!user)return new Response("Unauthorized",{status:401});

      const pair=new WebSocketPair();
    const user=await this.userFromRequest(request);
if(url.pathname==="/api/me"){
  return user ? json({user:{id:user.id,name:user.name,email:user.email}}) : json({error:"Nicht angemeldet"},401);
}
    }

    if(url.pathname==="/api/register" && request.method==="POST"){
      const x=await body(request);
      const name=String(x.name||"").trim();
      const email=String(x.email||"").trim().toLowerCase();
      const password=String(x.password||"");
      if(name.length<2)
        return json({error:"Bitte einen Namen mit mindestens 2 Zeichen eingeben."},400);
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return json({error:"Bitte eine gültige E-Mail-Adresse eingeben."},400);
      if(password.length<8)
        return json({error:"Das Passwort muss mindestens 8 Zeichen lang sein."},400);

      const users=await this.getUsers();
      if(Object.values(users).some(u=>u.email===email)) return json({error:"Account existiert bereits."},409);

      const id=crypto.randomUUID(), salt=b64(crypto.getRandomValues(new Uint8Array(16)));
      const pass=await derive(password,salt);
      users[id]={id,name,email,salt,pass,created:Date.now(),coupleId:null};
      await this.ctx.storage.put("users",users);

      const sessions=await this.getSessions(), t=token();
      sessions[t]=id; await this.ctx.storage.put("sessions",sessions);
      return json({token:t,user:{id,name,email}});
    }

    if(url.pathname==="/api/login" && request.method==="POST"){
      const x=await body(request), email=String(x.email||"").trim().toLowerCase(), password=String(x.password||"");
      const users=await this.getUsers(), user=Object.values(users).find(u=>u.email===email);
      if(!user || await derive(password,user.salt)!==user.pass) return json({error:"E-Mail oder Passwort falsch."},401);
      const sessions=await this.getSessions(), t=token(); sessions[t]=user.id;
      await this.ctx.storage.put("sessions",sessions);
      return json({token:t,user:{id:user.id,name:user.name,email:user.email}});
    }

    const user=await this.userFromRequest(request);
    if(url.pathname==="/api/me"){
      return user ? json({user:{id:user.id,name:user.name,email:user.email}}) : json({error:"Nicht angemeldet"},401);
    }
    if(!user)return json({error:"Nicht angemeldet"},401);

    if(url.pathname==="/api/pair/create" && request.method==="POST"){
      const codes=await this.getCodes(), c=code();
      codes[c]=user.id; await this.ctx.storage.put("codes",codes);
      return json({code:c});
    }

    if(url.pathname==="/api/pair/join" && request.method==="POST"){
      const x=await body(request), c=String(x.code||"").trim().toUpperCase();
      const codes=await this.getCodes(), hostId=codes[c];
      if(!hostId || hostId===user.id)return json({error:"Couple-Code ist ungültig oder gehört zu dir."},400);

      const users=await this.getUsers(), host=users[hostId];
      if(!host)return json({error:"Dieser Couple-Code ist nicht mehr aktiv."},404);

      const coupleId=host.coupleId || user.coupleId || crypto.randomUUID();
      host.coupleId=coupleId; user.coupleId=coupleId;
      users[host.id]=host; users[user.id]=user; await this.ctx.storage.put("users",users);
      delete codes[c]; await this.ctx.storage.put("codes",codes);

      const packet=JSON.stringify({type:"PAIR_CONNECTED",name:user.name,from:user.id,at:Date.now()});
      for(const ws of this.ctx.getWebSockets()){
        const a=ws.deserializeAttachment?.() || {};
        if(a.uid===host.id && ws.readyState===1) ws.send(packet);
      }
      return json({ok:true,coupleId});
    }

    return json({error:"Not found"},404);
    } catch (err) {
      console.error("TogetherCore request failed", err);
      return json({error:"Together-Serverfehler: "+(err?.message||"unbekannter Fehler")},500);
    }
  }

  async webSocketMessage(ws, message){
    let p; try{p=JSON.parse(message)}catch(_){return}
    const a=ws.deserializeAttachment?.()||{}, uid=a.uid;
    if(!uid)return;
    const users=await this.getUsers(), user=users[uid];
    if(!user || !user.coupleId)return;

    if(!["SHARED_PULSE","SHARED_LOVE","SHARED_CELEBRATE","CHAT"].includes(p.type))return;
    const out=JSON.stringify({...p,name:user.name,from:user.id,at:Date.now()});
    for(const peer of this.ctx.getWebSockets()){
      if(peer===ws || peer.readyState!==1)continue;
      const b=peer.deserializeAttachment?.()||{};
      const other=users[b.uid];
      if(other?.coupleId===user.coupleId) peer.send(out);
    }
  }
  async webSocketClose(ws){ }
  async webSocketError(ws){ }
}
