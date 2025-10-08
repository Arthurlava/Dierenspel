// src/App.jsx
import React, { useEffect, useRef, useState } from "react";
import { initializeApp } from "firebase/app";
import {
  getDatabase, ref, onValue, set, update, get, runTransaction,
  serverTimestamp, onDisconnect, remove
} from "firebase/database";

/* -------- Config -------- */
const SITE_TITLE = "Dierenspel";

const firebaseConfig = {
  apiKey: "AIzaSyDuYvtJbjj0wQbSwIBtyHuPeF71poPIBUg",
  authDomain: "pimpampof-aec32.firebaseapp.com",
  databaseURL: "https://pimpampof-aec32-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "pimpampof-aec32",
  storageBucket: "pimpampof-aec32.firebasestorage.app",
  messagingSenderId: "872484746189",
  appId: "1:872484746189:web:a76c7345c4f2ebb6790a84"
};
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

/* -------- Spelconstanten --------- */
const MAX_TIME_MS = 120000;
const MAX_POINTS = 200;
const DOUBLE_POF_BONUS = 100;
const JILLA_PENALTY = 25;
const COOLDOWN_MS = 10000; // <-- 10 seconden pauzetijd na beurt

const URL_PPP = import.meta.env.VITE_PIMPAMPOF_URL || "https://pimpampof.vercel.app/";

const PID_KEY = "ppp.playerId", NAME_KEY = "ppp.playerName";
const CODE_CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/* -------- Utils -------- */
function calcPoints(ms) { return Math.max(0, Math.floor(MAX_POINTS * (1 - ms / MAX_TIME_MS))); }
function makeRoomCode(len = 5) { let s = ""; for (let i = 0; i < len; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; return s; }
function getOrCreatePlayerId() { try { const x = localStorage.getItem(PID_KEY); if (x) return x; const id = crypto.randomUUID(); localStorage.setItem(PID_KEY, id); return id; } catch { return crypto.randomUUID(); } }
function normalize(s) { return (s || "").toString().trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, ""); }
function normalizeStrictWord(s){ return normalize(s).replace(/[^a-z0-9]/g,""); } // voor begin/laatste letter & duplicate check
function firstLetter(s){const n=normalizeStrictWord(s);return n.charAt(0)||""}
function lastLetter(s){const n=normalizeStrictWord(s);return n.charAt(n.length-1)||""}
function isDoublePof(word){const a=firstLetter(word),b=lastLetter(word);return a&&b&&a===b;}
function useOnline(){const[online,setOnline]=useState(navigator.onLine);useEffect(()=>{const on=()=>setOnline(true),off=()=>setOnline(false);window.addEventListener("online",on);window.addEventListener("offline",off);return()=>{window.removeEventListener("online",on);window.removeEventListener("offline",off);}},[]);return online;}
function ordinal(n){return `${n}e`;} // NL: 1e, 2e, 3e, ...

/* -------- Style -------- */
const GlobalStyle=()=>(
  <style>{`
  :root{--bg1:#171717;--bg2:#262626;--panel:rgba(255,255,255,.06);--border:rgba(255,255,255,.14);--text:#fff;--muted:rgba(255,255,255,.7);--brand1:#22c55e;--brand2:#16a34a;--warn:#dc2626;--alt:#065f46;}
  *{box-sizing:border-box} html,body,#root{height:100%}
  body{margin:0;background:linear-gradient(180deg,var(--bg1),var(--bg2));color:var(--text);font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}
  .wrap{max-width:760px;margin:0 auto;padding:20px}
  .card{background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:16px;box-shadow:0 20px 60px rgba(0,0,0,.35)}
  .row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
  .btn{padding:10px 14px;border:none;border-radius:12px;background:var(--brand2);color:#041507;font-weight:800;cursor:pointer}
  .btn.alt{background:var(--alt);color:#eafff6} .btn.warn{background:var(--warn);color:#180404} .btn:disabled{opacity:.6;cursor:not-allowed}
  .input{padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.06);color:var(--text);outline:none}
  .badge{display:inline-flex;align-items:center;gap:8px;padding:6px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.06);font-size:12px}
  .muted{color:var(--muted);font-size:12px} .h1{margin:0 0 6px 0;font-size:28px;font-weight:900}
  .center{display:flex;justify-content:center}
  .letterBig{display:grid;place-items:center;width:120px;height:120px;border-radius:28px;background:radial-gradient(circle at 30% 30%, var(--brand1), var(--brand2));color:#041507;font-size:56px;font-weight:900;border:1px solid rgba(0,0,0,.2);box-shadow:0 14px 40px rgba(34,197,94,.35);margin:8px auto 12px;}
  .toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:linear-gradient(90deg,var(--brand1),var(--brand2));color:#041507;padding:10px 14px;border-radius:999px;font-weight:800;box-shadow:0 10px 28px rgba(0,0,0,.35);z-index:10}
  .overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:9998}
  .dialog{width:min(92vw, 760px);background:#0f172a;border:1px solid #1f2937;border-radius:16px;padding:16px;box-shadow:0 24px 70px rgba(0,0,0,.55)}
  table{width:100%;border-collapse:collapse} th,td{padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.12);text-align:left}
  `}</style>
);

/* ========================================================= */
export default function App(){
  const online = useOnline();
  useEffect(()=>{ document.title = SITE_TITLE; },[]);
  const [playerName,setPlayerName]=useState(()=>localStorage.getItem(NAME_KEY)||"");
  const [playerId]=useState(getOrCreatePlayerId);
  useEffect(()=>{ localStorage.setItem(NAME_KEY, playerName||""); },[playerName]);

  const [roomCode,setRoomCode]=useState("");
  const [roomCodeInput,setRoomCodeInput]=useState("");
  const [room,setRoom]=useState(null);
  const [isHost,setIsHost]=useState(false);
  const isOnlineRoom=!!roomCode, isMyTurn=isOnlineRoom && room?.turn===playerId;

  const connIdRef=useRef(null);
  useEffect(()=>{ if(!roomCode) return;
    const connectedRef=ref(db,".info/connected");
    const unsub=onValue(connectedRef,snap=>{
      if(snap.val()===true){
        const cid=crypto.randomUUID(); connIdRef.current=cid;
        const myConn=ref(db,`rooms_animals/${roomCode}/presence/${playerId}/${cid}`);
        set(myConn,serverTimestamp()); onDisconnect(myConn).remove();
      }
    });
    return()=>{ if(connIdRef.current){ remove(ref(db,`rooms_animals/${roomCode}/presence/${playerId}/${connIdRef.current}`)).catch(()=>{}); connIdRef.current=null; } unsub?.(); }
  },[roomCode,playerId]);

  const [now,setNow]=useState(Date.now());
  useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),200);return()=>clearInterval(t);},[]);
  const [toast,setToast]=useState(null);
  const showToast=(txt,ms=1500)=>{setToast(txt);setTimeout(()=>setToast(null),ms);};

  const [animalInput,setAnimalInput]=useState("");
  const [apiState,setApiState]=useState({status:"idle",msg:""});
  const inputRef=useRef(null);

  const inCooldown = room?.phase==="cooldown" && !room?.solo;
  // freeze the clock while paused
  const effectiveNow = room?.paused ? (room?.pausedAt || now) : now;
  
  // timers gebaseerd op de bevroren tijd
  const cooldownLeftMs = Math.max(0, (room?.cooldownEndAt || 0) - effectiveNow);
  const answerElapsedMs = (!room?.solo && room?.phase==="answer" && room?.turnStartAt)
    ? Math.max(0, effectiveNow - room.turnStartAt)
    : 0;
  
  // punten ook bevroren tijdens pauze
  const potentialPoints = !room?.solo ? calcPoints(answerElapsedMs) : 0;

  function attachRoom(code){
    const r=ref(db,`rooms_animals/${code}`);
    onValue(r,(snap)=>{
      const data=snap.val()||null; setRoom(data); setIsHost(!!data && data.hostId===playerId);
      if(!data||!data.players) return;
      if(!data.hostId||!data.players[data.hostId]||!data.turn||!data.players[data.turn]){
        runTransaction(ref(db,`rooms_animals/${code}`),(d)=>{ if(!d||!d.players) return d; const ids=Object.keys(d.players);
          if(!d.hostId||!d.players[d.hostId]) d.hostId=ids[0];
          if(!d.turn||!d.players[d.turn]) d.turn=ids[0];
          if(!Array.isArray(d.playersOrder)) d.playersOrder=ids;
          return d;
        });
      }
    });
  }

  async function createRoom(){
    if(!online){alert("Je bent offline.");return;}
    const code=makeRoomCode();
    const obj={
      createdAt:serverTimestamp(),hostId:playerId,
      players:{[playerId]:{name:playerName||"Host",joinedAt:serverTimestamp()}},
      participants:{[playerId]:{name:playerName||"Host",firstJoinedAt:serverTimestamp()}},
      playersOrder:[playerId],
      turn:playerId,
      lastLetter:"?",
      started:false,solo:false,
      jail:{},scores:{},stats:{},
      usedAnimals:{},               // <-- nieuw: set van alle gebruikte dieren (genormaliseerd)
      paused:false, pausedAt:null,  // <-- pauze state
      phase:"answer", turnStartAt:null, cooldownEndAt:null, version:5
    };
    await set(ref(db,`rooms_animals/${code}`),obj);
    setRoomCode(code); setIsHost(true); attachRoom(code);
  }

  async function joinRoom(){
    if(!online){alert("Je bent offline.");return;}
    const code=(roomCodeInput||"").trim().toUpperCase(); if(!code){alert("Voer een room code in.");return;}
    const r=ref(db,`rooms_animals/${code}`); const s=await get(r); if(!s.exists()){alert("Room niet gevonden.");return;}
    await runTransaction(r,(d)=>{ if(!d) return d;
      d.players??={}; d.players[playerId]={name:playerName||"Speler",joinedAt:serverTimestamp()};
      d.participants??={}; d.participants[playerId]=d.participants[playerId]||{name:playerName||"Speler",firstJoinedAt:serverTimestamp()};
      d.participants[playerId].name=playerName||d.participants[playerId].name;
      d.playersOrder??=[]; if(!d.playersOrder.includes(playerId)) d.playersOrder.push(playerId);
      d.jail??={}; d.scores??={}; d.stats??={}; d.usedAnimals??={};
      d.phase??="answer"; if(d.paused==null){ d.paused=false; d.pausedAt=null; }
      if(!d.turn||!d.players[d.turn]) d.turn=d.playersOrder[0];
      if(!d.hostId||!d.players[d.hostId]) d.hostId=d.playersOrder[0];
      if(!d.turnStartAt && !d.solo && d.started) d.turnStartAt=Date.now();
      return d;
    });
    setRoomCode(code); setIsHost(false); attachRoom(code);
  }

  function advanceTurnWithJail(d){
    const ids=(Array.isArray(d.playersOrder)?d.playersOrder:Object.keys(d.players||{})).filter(id=>d.players&&d.players[id]);
    if(ids.length===0) return null;
    d.jail??={}; let idx=Math.max(0,ids.indexOf(d.turn));
    for(let i=0;i<ids.length;i++){ idx=(idx+1)%ids.length; const cand=ids[idx]; const j=d.jail[cand]||0; if(j>0){d.jail[cand]=j-1; continue;} d.turn=cand; return cand; }
    d.turn=ids[(ids.indexOf(d.turn)+1)%ids.length]; return d.turn;
  }

  // cooldown -> answer overgang, maar NIET als pauze actief is
  useEffect(()=>{ if(!roomCode||!room) return; if(room.solo) return; if(room.paused) return;
    if(room.phase==="cooldown" && room.cooldownEndAt && now>=room.cooldownEndAt){
      runTransaction(ref(db,`rooms_animals/${roomCode}`),(d)=>{ if(!d||d.solo||d.paused) return d; if(d.phase!=="cooldown") return d; if(!d.cooldownEndAt || Date.now()<d.cooldownEndAt) return d; d.phase="answer"; d.turnStartAt=Date.now(); return d; });
    }
  },[roomCode,room?.phase,room?.cooldownEndAt,room?.paused,now,room]);

  // --- Pauzeer / Hervat ---
  async function pauseGame(){
    if(!roomCode||!room) return;
    await runTransaction(ref(db,`rooms_animals/${roomCode}`),(d)=>{ if(!d) return d; if(d.paused) return d; d.paused=true; d.pausedAt=Date.now(); return d; });
  }
  async function resumeGame(){
    if(!roomCode||!room) return;
    await runTransaction(ref(db,`rooms_animals/${roomCode}`),(d)=>{ if(!d) return d; if(!d.paused) return d;
      const delta = Date.now() - (d.pausedAt || Date.now());
      if (d.cooldownEndAt) d.cooldownEndAt += delta;
      if (d.turnStartAt)  d.turnStartAt  += delta;
      d.paused=false; d.pausedAt=null; return d;
    });
  }

  async function submitAnimal(){
    if(!room||!room.started) return;
    if(room.paused){ showToast("⏸️ Spel is gepauzeerd"); return; }

    const raw=animalInput.trim(); if(!raw) return;

    // Duplicate check (room-wide), spatie/accents/streepjes negeren
    const key = normalizeStrictWord(raw);
    if (room.usedAnimals && room.usedAnimals[key]) {
      showToast("❌ Dit dier is al genoemd in deze room");
      return;
    }

    const req=(room.lastLetter && room.lastLetter!=="?")?room.lastLetter:null;
    const beginsOk=!req || firstLetter(raw)===req;

    const isMP=!!room && !room.solo; // solo -> geen punten
    const elapsed=Math.max(0,Date.now()-(room?.turnStartAt??Date.now()));
    const basePoints=isMP?calcPoints(elapsed):0;
    const double=isDoublePof(raw);
    const bonus=isMP&&double?DOUBLE_POF_BONUS:0;
    const totalGain=beginsOk?(basePoints+bonus):0;
    const nextLast=lastLetter(raw)||"?";

    const r=ref(db,`rooms_animals/${roomCode}`);
    await runTransaction(r,(d)=>{ if(!d) return d; if(d.paused) return d; // niet verwerken tijdens pauze
      if(!d.players||!d.players[d.turn]) return d; if(d.turn!==playerId) return d; if(d.phase!=="answer") return d;

      // server-side duplicate guard (race condition-proof)
      d.usedAnimals ??= {};
      const k = normalizeStrictWord(raw);
      if (d.usedAnimals[k]) { return d; } // geweigerd, geen statechange

      // Zet als gebruikt
      d.usedAnimals[k] = { word: raw, by: playerId, at: Date.now() };

      if(isMP){ d.scores??={}; d.stats??={};
        if(beginsOk) d.scores[playerId]=(d.scores[playerId]||0)+totalGain;
        const s=d.stats[playerId]||{totalTimeMs:0,answeredCount:0,jillaCount:0,doubleCount:0};
        s.totalTimeMs+=elapsed; if(beginsOk) s.answeredCount+=1; if(double&&beginsOk) s.doubleCount+=1; d.stats[playerId]=s;
      }
      d.lastLetter=nextLast; advanceTurnWithJail(d);
      if(isMP){ d.phase="cooldown"; d.cooldownEndAt=Date.now()+COOLDOWN_MS; d.turnStartAt=null; } else { d.phase="answer"; d.cooldownEndAt=null; d.turnStartAt=null; }
      return d;
    });

    if(isMP && totalGain>0 && beginsOk){ showToast(`+${totalGain} punten${double?` (incl. +${DOUBLE_POF_BONUS} Dubble pof)`:``}`,1600); }
    if(!beginsOk) showToast("⚠️ Verkeerde beginletter — geen punten");
    setAnimalInput("");
  }

  async function useJilla(){
    if(!room) return; if(room.paused){ showToast("⏸️ Spel is gepauzeerd"); return; }
    const isMP=!!room && !room.solo;
    const r=ref(db,`rooms_animals/${roomCode}`);
    await runTransaction(r,(d)=>{ if(!d) return d; if(d.paused) return d;
      if(!d.players||!d.players[d.turn]) return d; if(d.turn!==playerId) return d; if(d.phase!=="answer") return d;
      d.jail??={}; d.jail[playerId]=(d.jail[playerId]||0)+1;
      if(isMP){ d.scores??={}; d.stats??={}; d.scores[playerId]=(d.scores[playerId]||0)-JILLA_PENALTY;
        const s=d.stats[playerId]||{totalTimeMs:0,answeredCount:0,jillaCount:0,doubleCount:0}; s.jillaCount+=1; d.stats[playerId]=s;
        d.phase="cooldown"; d.cooldownEndAt=Date.now()+COOLDOWN_MS; d.turnStartAt=null;
      } else { d.phase="answer"; d.cooldownEndAt=null; d.turnStartAt=null; }
      advanceTurnWithJail(d); return d;
    });
    if(isMP) showToast(`-${JILLA_PENALTY} punten (Jilla)`);
  }

  // ---- API check (ongewijzigd) ----
  async function checkAnimalViaAPI(){
    const q=animalInput.trim(); if(!q) return setApiState({status:"idle",msg:""});
    try{
      setApiState({status:"checking",msg:"Bezig met controleren…"});
      const r=await fetch(`/api/check-animal?name=${encodeURIComponent(q)}`); const j=await r.json();
      if(!j.ok) return setApiState({status:"error",msg:"API-fout"});
      if(j.found){ const name=j.vernacularName||j.scientificName||q; setApiState({status:"ok",msg:`✅ Gevonden: ${name} (${j.source||"api"})`}); }
      else setApiState({status:"notfound",msg:"ℹ️ Niet gevonden in database"});
    }catch{ setApiState({status:"error",msg:"Netwerkfout"}); }
  }

  const myJail = isOnlineRoom && room?.jail ? (room.jail[playerId]||0) : 0;
  const canType = isMyTurn && myJail===0 && !inCooldown && room?.started && !room?.paused;
  useEffect(()=>{ if(canType) setTimeout(()=>inputRef.current?.focus(),0); },[canType]);

  // Leave + leaderboard (ongewijzigd)
  function buildLeaderboardSnapshot(rm){
    const par = rm.participants ? Object.keys(rm.participants) : [];
    const arr = par.map(id=>{
      const name = rm.participants[id]?.name || rm.players?.[id]?.name || "Speler";
      const score = (!rm.solo && rm.scores && rm.scores[id]) || 0;
      const st = (rm.stats && rm.stats[id]) || { totalTimeMs:0, answeredCount:0, jillaCount:0, doubleCount:0 };
      const avg = st.answeredCount>0 ? (st.totalTimeMs / st.answeredCount) : null;
      return { id, name, score, avgMs: avg, answered: st.answeredCount||0, jilla: st.jillaCount||0, dpf: st.doubleCount||0 };
    });
    arr.sort((a,b)=> b.score - a.score || a.name.localeCompare(b.name));
    return arr;
  }
  const [leaderOpen,setLeaderOpen]=useState(false);
  const [leaderData,setLeaderData]=useState(null);

  async function leaveRoomCore(){
    if(!roomCode) return;
    await runTransaction(ref(db,`rooms_animals/${roomCode}`),(d)=>{ if(!d) return d;
      if(d.players && d.players[playerId]) delete d.players[playerId];
      if(d.jail && d.jail[playerId]!=null) delete d.jail[playerId];
      if(Array.isArray(d.playersOrder)) d.playersOrder=d.playersOrder.filter(id=>id!==playerId && d.players && d.players[id]);
      const ids=d.players?Object.keys(d.players):[]; if(ids.length===0) return null;
      if(!d.hostId||!d.players[d.hostId]) d.hostId=d.playersOrder?.[0]||ids[0];
      if(!d.turn||!d.players[d.turn]) d.turn=d.playersOrder?.[0]||d.hostId||ids[0];
      return d; // scores/stats/participants/usedAnimals blijven!
    });
    if(connIdRef.current){ remove(ref(db,`rooms_animals/${roomCode}/presence/${playerId}/${connIdRef.current}`)).catch(()=>{}); connIdRef.current=null; }
    setRoom(null); setRoomCode(""); setIsHost(false);
  }

  async function onLeaveClick(){
    if(room && (room.participants || room.players)){ const snap=buildLeaderboardSnapshot(room); setLeaderData(snap); setLeaderOpen(true); }
    await leaveRoomCore();
  }

  /* -------------------- UI -------------------- */
  return (
    <>
      <GlobalStyle />
      <div className="wrap">
        {/* Header */}
        <div className="card" style={{ marginBottom: 12 }}>
          <h1 className="h1">{SITE_TITLE}</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            Typ een dier. Het moet beginnen met de <b>vereiste beginletter</b>. De volgende beginletter wordt de <b>laatste letter</b> van jouw woord.
          </p>
          <div className="row">
            {!room?.started && (<input className="input" placeholder="Jouw naam" value={playerName} onChange={e=>setPlayerName(e.target.value)} />)}
            {!isOnlineRoom ? (
              <>
                <button className="btn" onClick={createRoom} disabled={!online}>Room aanmaken</button>
                <input className="input" placeholder="Room code" value={roomCodeInput} onChange={e=>setRoomCodeInput(e.target.value.toUpperCase())} />
                <button className="btn alt" onClick={joinRoom} disabled={!online}>Join</button>
                <button className="btn alt" onClick={() => (window.location.href = URL_PPP)} title="Ga naar PimPamPof">↔️ Naar PimPamPof</button>
              </>
            ) : (
              <>
                {!room?.started && isHost && (
                  <button
                    className="btn"
                    onClick={async()=>{
                      await update(ref(db,`rooms_animals/${roomCode}`),{
                        started:true,lastLetter:"?",phase:"answer",
                        turn:room.playersOrder?.[0]||room.hostId,
                        turnStartAt:Date.now(),cooldownEndAt:null
                      });
                      setTimeout(()=>inputRef.current?.focus(),0);
                    }}
                  >Start spel</button>
                )}
                {!room?.started && !isHost && <span className="badge">Wachten op host…</span>}
                {room?.started && <span className="badge">Multiplayer actief</span>}
                {/* Pauze / Hervat */}
                {room?.started && !room?.paused && <button className="btn alt" onClick={pauseGame}>⏸️ Pauzeer (iedereen)</button>}
                {room?.started &&  room?.paused && <button className="btn" onClick={resumeGame}>▶️ Hervatten</button>}
                <button className="btn warn" onClick={onLeaveClick}>Leave</button>
                {!room?.started && <span className="badge">Room: <b>{roomCode}</b></span>}
              </>
            )}
            {!online && !isOnlineRoom && <span className="badge">Offline: maak verbinding om te spelen</span>}
          </div>
        </div>

        {/* Speelveld */}
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="center"><div className="letterBig">{room?.lastLetter ? room.lastLetter : "?"}</div></div>
          <div className="center" style={{ marginBottom: 8 }}>
            <div className="row" style={{ justifyContent: "center" }}>
              <span className="badge">Vereiste beginletter: <b>{room?.lastLetter || "?"}</b></span>
              {room?.paused && <span className="badge">⏸️ Gepauzeerd</span>}
              {isOnlineRoom && !room?.solo && (
                inCooldown
                  ? <span className="badge">⏳ Volgende ronde over {Math.ceil(cooldownLeftMs/1000)}s</span>
                  : <>
                      <span className="badge">⏱️ Tijd: {Math.floor(answerElapsedMs/1000)}s / {Math.floor(MAX_TIME_MS/1000)}s</span>
                      <span className="badge">🏅 Nu waard: <b>{potentialPoints}</b></span>
                    </>
              )}
            </div>
          </div>

          {isOnlineRoom && room?.started && (room?.jail?.[playerId]||0)>0 && (
            <div className="center" style={{ marginBottom: 8 }}>
              <span className="badge">🔒 Jilla actief — je wordt {room.jail[playerId]} beurt(en) overgeslagen</span>
            </div>
          )}

          {isOnlineRoom && room?.started ? (
            <>
              <div className="row" style={{ justifyContent: "center" }}>
                <input
                  ref={inputRef}
                  className="input"
                  style={{ minWidth: 260, maxWidth: 420, width: "100%" }}
                  placeholder={
                    room?.paused ? "Gepauzeerd…"
                    : !isMyTurn ? "Niet jouw beurt"
                    : (room?.jail?.[playerId]||0)>0 ? "Jilla actief — beurt wordt overgeslagen"
                    : inCooldown ? "Wachten…"
                    : "Typ een dier en druk Enter"
                  }
                  value={animalInput}
                  onChange={(e)=>{ setAnimalInput(e.target.value); setApiState({status:"idle",msg:""}); }}
                  onKeyDown={(e)=>{ if(e.key==="Enter") submitAnimal(); }}
                  disabled={!isMyTurn || (room?.jail?.[playerId]||0)>0 || inCooldown || room?.paused}
                />
              </div>
              <div className="row" style={{ justifyContent: "center", marginTop: 8 }}>
                <button className="btn alt" onClick={checkAnimalViaAPI} disabled={!animalInput.trim() || room?.paused}>Check dier (API)</button>
                {isMyTurn && !inCooldown && !room?.paused && <button className="btn alt" onClick={useJilla}>Jilla (skip)</button>}
                <button className="btn" onClick={submitAnimal} disabled={!isMyTurn || (room?.jail?.[playerId]||0)>0 || inCooldown || room?.paused}>Indienen</button>
              </div>
              {apiState.status!=="idle" && (
                <div className="center" style={{ marginTop: 8 }}>
                  <span className="badge" style={{
                    background: apiState.status==="ok" ? "rgba(34,197,94,.15)" :
                               apiState.status==="notfound" ? "rgba(234,179,8,.12)" :
                               apiState.status==="checking" ? "rgba(59,130,246,.12)" : "rgba(239,68,68,.12)",
                    borderColor: apiState.status==="ok" ? "rgba(34,197,94,.35)" :
                                apiState.status==="notfound" ? "rgba(234,179,8,.35)" :
                                apiState.status==="checking" ? "rgba(59,130,246,.35)" : "rgba(239,68,68,.35)"
                  }}>{apiState.msg}</span>
                </div>
              )}
            </>
          ) : (
            <p className="muted center" style={{ marginTop: 4 }}>Maak of join een room om te spelen.</p>
          )}
        </div>

        {/* Spelers */}
        <div className="card">
          <h3 style={{ marginTop: 0, marginBottom: 8 }}>Spelers</h3>
          {isOnlineRoom && room?.participants ? (
            <ul style={{ listStyle:"none", padding:0, margin:0 }}>
              {(Array.isArray(room.playersOrder)?room.playersOrder:Object.keys(room.players||{}))
                .filter(id=>room.players&&room.players[id])
                .map((id,idx)=>{
                  const pName = room.participants?.[id]?.name || room.players?.[id]?.name || "Speler";
                  const active = room.turn===id;
                  const jcount = (room.jail&&room.jail[id])||0;
                  const score = (!room.solo && room.scores && room.scores[id]) || 0;
                  return (
                    <li key={id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderTop:"1px solid rgba(255,255,255,.1)"}}>
                      <div>{idx+1}. {pName}{room?.hostId===id?" (host)":""} {active&&<span className="badge">🟢 beurt</span>} {jcount>0&&<span className="badge">Jilla x{jcount}</span>}</div>
                      {!room.solo && <div className="badge">Punten: <b>{score}</b></div>}
                    </li>
                  );
                })}
            </ul>
          ) : <p className="muted">Nog geen spelers.</p>}
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}

      {/* Leaderboard overlay */}
      {leaderOpen && leaderData && (
        <div className="overlay" onClick={()=>setLeaderOpen(false)}>
          <div className="dialog" onClick={e=>e.stopPropagation()}>
            <h2 style={{ marginTop:0, marginBottom:8 }}>🏆 Leaderboard</h2>
            <table>
              <thead><tr><th>Rang</th><th>Speler</th><th>Punten</th><th>Gem. tijd / vraag</th><th>Jilla</th><th>Dubble pof</th></tr></thead>
              <tbody>
                {leaderData.map((r,i)=>(
                  <tr key={r.id}>
                    <td>{ordinal(i+1)}</td>
                    <td>{r.name}</td>
                    <td>{r.score}</td>
                    <td>{r.avgMs==null?"—":`${(r.avgMs/1000).toFixed(1)}s`}</td>
                    <td>{r.jilla}</td>
                    <td>{r.dpf}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="row" style={{justifyContent:"flex-end", marginTop:12}}>
              <button className="btn alt" onClick={()=>setLeaderOpen(false)}>Sluiten</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
