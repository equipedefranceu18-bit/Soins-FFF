import { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION SUPABASE
// Remplacer par vos vraies valeurs (voir guide de déploiement)
// ═══════════════════════════════════════════════════════════════════════════════
const SUPABASE_URL = "https://khueuwkglmtvoqctyaor.supabase.co";          // ex: https://xxxx.supabase.co
const SUPABASE_ANON_KEY = "sb_publishable_V3urxdbs15KH7KWDOXOdhw_I81T__Wq"; // clé publique anon

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── DATA ──────────────────────────────────────────────────────────────────────
const PRACTITIONERS = [
  { id: "k1", name: "Guillaume", role: "kiné",  color: "#4fc3f7", initials: "GU" },
  { id: "k2", name: "Denis",     role: "kiné",  color: "#ef5350", initials: "DE" },
  { id: "k3", name: "Alexandre", role: "kiné",  color: "#ffd54f", initials: "AL" },
  { id: "k4", name: "Clément",   role: "kiné",  color: "#81c784", initials: "CL" },
  { id: "o1", name: "Jean-Yves", role: "ostéo", color: "#ce93d8", initials: "JY" },
];

const PLAYERS = [
  "A. Dupont","B. Girard","C. Petit","D. Leroy","E. Moreau",
  "F. Simon","G. Michel","H. Lefebvre","I. Lefevre","J. Garcia",
  "K. David","L. Bertrand","M. Roux","N. Vincent","O. Fournier",
  "P. Morel","Q. Girard","R. Andre","S. Lecomte","T. Dupuis",
  "U. Mercier","V. Blanc","W. Guerin","X. Boyer","Y. Gauthier",
];

const STAFF_PASSWORD     = "staff2024"; // Changer en production !
const BOOKING_ADVANCE_HOURS = 20;
const CASCADE_AFTER_HOUR    = 21;

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function generateBaseSlots() {
  const slots = [];
  for (let h = 9; h <= 23; h++) slots.push(`${String(h).padStart(2,"0")}:00`);
  return slots;
}
const BASE_SLOTS = generateBaseSlots();

function get7Days(dayOffset = 0) {
  const today = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + dayOffset + i);
    return d;
  });
}

function todayStr()       { return new Date().toISOString().split("T")[0]; }
function fmtDate(d)       { return d.toISOString().split("T")[0]; }
function fmtDisplay(d)    { return d.toLocaleDateString("fr-FR", { weekday:"short", day:"numeric", month:"short" }); }
function fmtLong(dateStr) { return new Date(dateStr+"T12:00:00").toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long" }); }
function isWeekend(d)     { const day = d.getDay(); return day === 0 || day === 6; }
function isPast(dateStr)  { return dateStr < todayStr(); }
function dowOf(dateStr)   { return (new Date(dateStr+"T12:00:00").getDay() + 6) % 7; }

function isWithinBookingWindow(date, time) {
  const slotDate   = new Date(`${date}T${time}:00`);
  const hoursUntil = (slotDate - new Date()) / 3600000;
  return hoursUntil >= 0 && hoursUntil <= BOOKING_ADVANCE_HOURS;
}

const DAY_NAMES = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];

// ─── THEME ────────────────────────────────────────────────────────────────────
const T = {
  navy:"#002395", navyDk:"#001a6e", navyLt:"#1a4fd6",
  red:"#ED2939",  redDk:"#b01020",
  gold:"#9a6e00", goldBright:"#c8a84b",
  bg:"#f0f4ff",   surface:"#ffffff", surface2:"#e8edf8", surface3:"#dde4f5",
  border:"rgba(0,35,149,0.15)", border2:"rgba(0,35,149,0.10)",
  text:"#0a1440", textDim:"#4a5a8a", textMid:"#1a2e6e",
};

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK : charge et synchronise toutes les données depuis Supabase
// ═══════════════════════════════════════════════════════════════════════════════
function useAppData() {
  const [open,       setOpen]       = useState({});
  const [recurring,  setRecurring]  = useState({});
  const [closed,     setClosed]     = useState({});
  const [bookings,   setBookings]   = useState({});
  const [splitSlots, setSplitSlots] = useState({});
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);

  // ── Chargement initial ──────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    try {
      setLoading(true);

      const [openRes, closedRes, recurRes, splitRes, bookRes] = await Promise.all([
        supabase.from("open_slots").select("*"),
        supabase.from("closed_slots").select("*"),
        supabase.from("recurring_slots").select("*"),
        supabase.from("split_slots").select("*"),
        supabase.from("bookings").select("*"),
      ]);

      // open_slots → { "k1|2025-01-15|10:00": true }
      const openMap = {};
      (openRes.data || []).forEach(r => { openMap[`${r.pract_id}|${r.date}|${r.time}`] = true; });

      const closedMap = {};
      (closedRes.data || []).forEach(r => { closedMap[`${r.pract_id}|${r.date}|${r.time}`] = true; });

      // recurring_slots → { "k1|dow1|10:00": true }
      const recurMap = {};
      (recurRes.data || []).forEach(r => { recurMap[`${r.pract_id}|dow${r.dow}|${r.time}`] = true; });

      // split_slots → { "k1|2025-01-15|10:00": true }
      const splitMap = {};
      (splitRes.data || []).forEach(r => { splitMap[`${r.pract_id}|${r.date}|${r.base_time}`] = true; });

      // bookings → { "k1|2025-01-15|10:00": { player, locked, note, duration } }
      const bookMap = {};
      (bookRes.data || []).forEach(r => {
        bookMap[`${r.pract_id}|${r.date}|${r.time}`] = {
          player: r.player, locked: r.locked,
          note: r.note || "", duration: r.duration || 60,
          id: r.id,
        };
      });

      setOpen(openMap);
      setClosed(closedMap);
      setRecurring(recurMap);
      setSplitSlots(splitMap);
      setBookings(bookMap);
      setError(null);
    } catch (err) {
      setError("Erreur de connexion à la base de données.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Abonnements temps réel ──────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel("realtime-all")
      .on("postgres_changes", { event: "*", schema: "public", table: "open_slots" },      () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "closed_slots" },    () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "recurring_slots" }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "split_slots" },     () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" },        () => loadAll())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadAll]);

  // ── Helpers de lecture ──────────────────────────────────────────────────────
  function isSlotOpen(practId, date, time) {
    const sk = `${practId}|${date}|${time}`;
    const rk = `${practId}|dow${dowOf(date)}|${time}`;
    if (closed[sk]) return false;
    return !!(open[sk] || recurring[rk]);
  }
  function isRecurring(practId, date, time) {
    return !!recurring[`${practId}|dow${dowOf(date)}|${time}`];
  }
  function getBooking(practId, date, time) {
    return bookings[`${practId}|${date}|${time}`] || null;
  }
  function isSplit(practId, date, baseTime) {
    return !!splitSlots[`${practId}|${date}|${baseTime}`];
  }
  function getSlotsForContext(practId, date) {
    const slots = [];
    for (const base of BASE_SLOTS) {
      slots.push(base);
      if (isSplit(practId, date, base)) {
        const h = base.split(":")[0];
        slots.push(`${h}:30`);
      }
    }
    return slots;
  }
  function isAvailable(practId, date, time) {
    if (!isSlotOpen(practId, date, time)) return false;
    if (getBooking(practId, date, time)) return false;
    if (!isWithinBookingWindow(date, time)) return false;
    // Règle cascade après 21h
    const [h] = time.split(":").map(Number);
    if (h >= CASCADE_AFTER_HOUR) {
      const slotsForDay = getSlotsForContext(practId, date);
      for (const t of slotsForDay) {
        const [th] = t.split(":").map(Number);
        if (th < CASCADE_AFTER_HOUR) continue;
        if (t === time) break;
        if (isSlotOpen(practId, date, t) && !getBooking(practId, date, t)) return false;
      }
    }
    return true;
  }

  // ── Actions staff ───────────────────────────────────────────────────────────
  async function toggleOpen(practId, date, time) {
    const sk = `${practId}|${date}|${time}`;
    const rk = `${practId}|dow${dowOf(date)}|${time}`;
    if (isSlotOpen(practId, date, time)) {
      if (recurring[rk] && !open[sk]) {
        // Fermer via exception
        await supabase.from("closed_slots").upsert({ pract_id:practId, date, time });
      } else {
        await supabase.from("open_slots").delete().match({ pract_id:practId, date, time });
        await supabase.from("closed_slots").delete().match({ pract_id:practId, date, time });
      }
    } else {
      await supabase.from("closed_slots").delete().match({ pract_id:practId, date, time });
      await supabase.from("open_slots").upsert({ pract_id:practId, date, time });
    }
    await loadAll();
  }

  async function toggleRecurring(practId, date, time) {
    const dow = dowOf(date);
    const rk  = `${practId}|dow${dow}|${time}`;
    if (recurring[rk]) {
      await supabase.from("recurring_slots").delete().match({ pract_id:practId, dow, time });
    } else {
      await supabase.from("recurring_slots").upsert({ pract_id:practId, dow, time });
      await supabase.from("closed_slots").delete().match({ pract_id:practId, date, time });
    }
    await loadAll();
  }

  async function toggleSplit(practId, date, baseTime) {
    const key = `${practId}|${date}|${baseTime}`;
    if (splitSlots[key]) {
      await supabase.from("split_slots").delete().match({ pract_id:practId, date, base_time:baseTime });
    } else {
      await supabase.from("split_slots").upsert({ pract_id:practId, date, base_time:baseTime });
    }
    await loadAll();
  }

  async function staffBookSlot(practId, date, time, player) {
    await supabase.from("open_slots").upsert({ pract_id:practId, date, time });
    await supabase.from("closed_slots").delete().match({ pract_id:practId, date, time });
    const duration = time.endsWith(":30") || isSplit(practId, date, time) ? 30 : 60;
    await supabase.from("bookings").upsert({
      pract_id:practId, date, time, player, locked:true, note:"", duration
    });
    await loadAll();
  }

  async function playerBookSlot(practId, date, time, player) {
    const duration = time.endsWith(":30") || isSplit(practId, date, time) ? 30 : 60;
    await supabase.from("bookings").upsert({
      pract_id:practId, date, time, player, locked:false, note:"", duration
    });
    await loadAll();
  }

  async function unbook(practId, date, time) {
    if (isPast(date)) return;
    await supabase.from("bookings").delete().match({ pract_id:practId, date, time });
    await loadAll();
  }

  async function addNote(practId, date, time, note) {
    await supabase.from("bookings").update({ note }).match({ pract_id:practId, date, time });
    await loadAll();
  }

  async function moveBooking(fromPractId, date, time, toPractId) {
    const bk = getBooking(fromPractId, date, time);
    if (!bk) return;
    await supabase.from("bookings").delete().match({ pract_id:fromPractId, date, time });
    await supabase.from("open_slots").upsert({ pract_id:toPractId, date, time });
    await supabase.from("closed_slots").delete().match({ pract_id:toPractId, date, time });
    await supabase.from("bookings").upsert({
      pract_id:toPractId, date, time,
      player:bk.player, locked:bk.locked, note:bk.note, duration:bk.duration
    });
    await loadAll();
  }

  function getPastBookings() {
    const today = todayStr();
    return Object.entries(bookings)
      .filter(([k]) => k.split("|")[1] < today)
      .map(([k,v]) => { const [pId,date,time] = k.split("|"); return { pId,date,time,...v }; })
      .sort((a,b) => (b.date+b.time).localeCompare(a.date+a.time));
  }

  function myBookings(playerName) {
    if (!playerName) return [];
    return Object.entries(bookings)
      .filter(([,v]) => v.player === playerName)
      .map(([k,v]) => { const [pId,date,time] = k.split("|"); return { pId,date,time,...v }; })
      .sort((a,b) => (a.date+a.time).localeCompare(b.date+b.time));
  }

  return {
    loading, error,
    isSlotOpen, isRecurring, getBooking, isSplit, getSlotsForContext, isAvailable,
    toggleOpen, toggleRecurring, toggleSplit,
    staffBookSlot, playerBookSlot, unbook, addNote, moveBooking,
    getPastBookings, myBookings,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// APP ROOT
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [view,       setView]       = useState("home");
  const [dayOffset,  setDayOffset]  = useState(0);
  const days = get7Days(dayOffset);

  // Player state
  const [playerName,    setPlayerName]    = useState("");
  const [playerMode,    setPlayerMode]    = useState("bySlot");
  const [selectedPract, setSelectedPract] = useState(null);
  const [selectedDate,  setSelectedDate]  = useState(null);
  const [selectedTime,  setSelectedTime]  = useState(null);
  const [bookingRole,   setBookingRole]   = useState("kiné");
  const [confirmation,  setConfirmation]  = useState(null);

  // Staff state
  const [staffPwd,        setStaffPwd]        = useState("");
  const [staffAuth,       setStaffAuth]       = useState(false);
  const [staffTarget,     setStaffTarget]     = useState(null);
  const [staffPlayerName, setStaffPlayerName] = useState("");

  const db = useAppData();

  const kines  = PRACTITIONERS.filter(p => p.role === "kiné");
  const osteos = PRACTITIONERS.filter(p => p.role === "ostéo");

  if (db.loading) return (
    <div style={{...css.homeWrap, flexDirection:"column", gap:16}}>
      <FFFShield size={70} />
      <div style={{color:T.navy, fontWeight:700, fontSize:16}}>Chargement…</div>
    </div>
  );

  if (db.error) return (
    <div style={{...css.homeWrap, flexDirection:"column", gap:12, padding:24}}>
      <div style={{fontSize:40}}>⚠️</div>
      <div style={{color:T.navy, fontWeight:700, fontSize:16, textAlign:"center"}}>{db.error}</div>
      <div style={{color:T.textDim, fontSize:13, textAlign:"center"}}>
        Vérifiez votre connexion internet et les paramètres Supabase.
      </div>
      <button style={{...css.btn,...css.btnPlayer}} onClick={() => window.location.reload()}>
        Réessayer
      </button>
    </div>
  );

  async function handleConfirmBooking() {
    if (!playerName.trim() || !selectedPract || !selectedDate || !selectedTime) return;
    const p = PRACTITIONERS.find(x => x.id === selectedPract);
    const is30 = selectedTime.endsWith(":30") || db.isSplit(selectedPract, selectedDate, selectedTime);
    await db.playerBookSlot(selectedPract, selectedDate, selectedTime, playerName.trim());
    setConfirmation({ pract:p, date:selectedDate, time:selectedTime, player:playerName, duration:is30?30:60 });
    setSelectedPract(null); setSelectedDate(null); setSelectedTime(null);
  }

  return (
    <div style={css.root}>
      <style>{globalStyles}</style>
      {view === "home" && <Home setView={setView} />}
      {view === "player" && (
        <PlayerView
          playerName={playerName} setPlayerName={setPlayerName}
          playerMode={playerMode} setPlayerMode={setPlayerMode}
          bookingRole={bookingRole} setBookingRole={setBookingRole}
          days={days} dayOffset={dayOffset} setDayOffset={setDayOffset}
          kines={kines} osteos={osteos}
          selectedPract={selectedPract} setSelectedPract={setSelectedPract}
          selectedDate={selectedDate} setSelectedDate={setSelectedDate}
          selectedTime={selectedTime} setSelectedTime={setSelectedTime}
          isAvailable={db.isAvailable} getBooking={db.getBooking}
          isSlotOpen={db.isSlotOpen} getSlotsForContext={db.getSlotsForContext} isSplit={db.isSplit}
          confirmBooking={handleConfirmBooking}
          confirmation={confirmation} setConfirmation={setConfirmation}
          myBookings={() => db.myBookings(playerName)}
          cancelMyBooking={async (pId,date,time) => {
            const b = db.getBooking(pId,date,time);
            if (b && !b.locked && b.player===playerName && !isPast(date)) await db.unbook(pId,date,time);
          }}
          setView={setView}
        />
      )}
      {view === "staffAuth" && (
        <StaffAuth staffPwd={staffPwd} setStaffPwd={setStaffPwd}
          onAuth={() => { if (staffPwd === STAFF_PASSWORD) { setStaffAuth(true); setView("staff"); }}}
          setView={setView} />
      )}
      {view === "staff" && staffAuth && (
        <StaffView
          practitioners={PRACTITIONERS} days={days}
          dayOffset={dayOffset} setDayOffset={setDayOffset}
          getBooking={db.getBooking} isSlotOpen={db.isSlotOpen} isRecurring={db.isRecurring}
          toggleOpen={db.toggleOpen} toggleRecurring={db.toggleRecurring}
          unbook={db.unbook} staffBookSlot={db.staffBookSlot}
          addNote={db.addNote} moveBooking={db.moveBooking}
          staffTarget={staffTarget} setStaffTarget={setStaffTarget}
          staffPlayerName={staffPlayerName} setStaffPlayerName={setStaffPlayerName}
          getSlotsForContext={db.getSlotsForContext} isSplit={db.isSplit} toggleSplit={db.toggleSplit}
          BASE_SLOTS={BASE_SLOTS}
          getPastBookings={db.getPastBookings}
          PLAYERS={PLAYERS} setView={setView}
        />
      )}
    </div>
  );
}

// ── Composants UI (FFFShield, Home, StaffAuth) ─────────────────────────────────
// [Ces composants sont identiques à la version prototype — voir medical-booking.jsx]
// Pour le déploiement final, copier les composants depuis medical-booking.jsx

function FFFShield({ size = 90 }) {
  const w = size, h = size * 1.15;
  return (
    <svg width={w} height={h} viewBox="0 0 200 230" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M100 4 L192 52 L192 178 L100 226 L8 178 L8 52 Z" fill="#002395"/>
      <path d="M100 4 L192 52 L192 178 L100 226 L8 178 L8 52 Z" fill="none" stroke="#c8a84b" strokeWidth="4"/>
      <clipPath id="hex-clip2"><path d="M100 4 L192 52 L192 178 L100 226 L8 178 L8 52 Z"/></clipPath>
      <g clipPath="url(#hex-clip2)">
        <rect x="8" y="4" width="61" height="224" fill="#002395"/>
        <rect x="69" y="4" width="62" height="224" fill="white" opacity="0.12"/>
        <rect x="131" y="4" width="61" height="224" fill="#ED2939" opacity="0.25"/>
      </g>
      <text x="72" y="38" textAnchor="middle" fill="#c8a84b" fontSize="18" fontWeight="900">★</text>
      <text x="128" y="38" textAnchor="middle" fill="#c8a84b" fontSize="18" fontWeight="900">★</text>
      <ellipse cx="100" cy="63" rx="13" ry="11" fill="#c8a84b"/>
      <path d="M87 63 L80 61 L81 66 L87 65 Z" fill="#ED2939"/>
      <circle cx="94" cy="60" r="2" fill="#002395"/>
      <path d="M100 72 C90 73 82 80 80 92 C78 104 80 118 84 128 C88 138 95 143 100 144 C105 143 112 138 116 128 C120 118 122 104 120 92 C118 80 110 73 100 72Z" fill="#c8a84b"/>
      <text x="100" y="200" textAnchor="middle" fill="white" fontSize="22" fontWeight="900" fontFamily="'Arial Black',Arial,sans-serif" letterSpacing="4">FFF</text>
      <line x1="60" y1="207" x2="140" y2="207" stroke="#c8a84b" strokeWidth="1.5" opacity="0.6"/>
    </svg>
  );
}

function Home({ setView }) {
  return (
    <div style={css.homeWrap}>
      <div style={{position:"fixed",inset:0,zIndex:0,background:"linear-gradient(160deg,#001a5e 0%,#002395 45%,#001a5e 100%)"}} />
      <div style={{...css.homeCard,zIndex:1,position:"relative",background:"rgba(0,10,40,0.88)",border:"1px solid rgba(200,168,75,0.4)",backdropFilter:"blur(20px)",boxShadow:"0 0 60px rgba(0,35,149,0.5)"}}>
        <div style={{display:"flex",justifyContent:"center",marginBottom:8}}><FFFShield size={90}/></div>
        <h1 style={{fontSize:13,letterSpacing:4,textTransform:"uppercase",color:"#c8a84b",fontWeight:700,margin:"0 0 4px",textAlign:"center"}}>Équipe de France</h1>
        <h2 style={{fontSize:22,letterSpacing:1,color:"#ffffff",fontWeight:800,margin:"0 0 4px",textAlign:"center"}}>Soins & Récupération</h2>
        <p style={{color:"rgba(255,255,255,0.5)",marginBottom:28,fontSize:13,textAlign:"center"}}>Réservation des créneaux médicaux</p>
        <div style={{display:"flex",height:3,borderRadius:2,overflow:"hidden",marginBottom:24}}>
          <div style={{flex:1,background:"#002395"}}/><div style={{flex:1,background:"#ffffff"}}/><div style={{flex:1,background:"#ED2939"}}/>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <button style={{...css.btn,background:"linear-gradient(135deg,#002395,#0035cc)",color:"#fff",border:"1px solid rgba(200,168,75,0.3)"}} onClick={()=>setView("player")}>
            <span style={{fontSize:20}}>⚽</span><span>Je suis un joueur</span>
          </button>
          <button style={{...css.btn,background:"linear-gradient(135deg,#7b1011,#ED2939)",color:"#fff",border:"1px solid rgba(200,168,75,0.3)"}} onClick={()=>setView("staffAuth")}>
            <span style={{fontSize:20}}>🩺</span><span>Staff médical</span>
          </button>
        </div>
        <p style={{fontSize:10,color:"rgba(255,255,255,0.2)",marginTop:20,letterSpacing:1,textAlign:"center"}}>FÉDÉRATION FRANÇAISE DE FOOTBALL</p>
      </div>
    </div>
  );
}

function StaffAuth({ staffPwd, setStaffPwd, onAuth, setView }) {
  return (
    <div style={css.homeWrap}>
      <div style={{...css.homeCard,maxWidth:380}}>
        <div style={{fontSize:48,textAlign:"center"}}>🔐</div>
        <h2 style={{fontSize:22,fontWeight:800,textAlign:"center",color:T.navy,margin:"8px 0 20px"}}>Accès Staff Médical</h2>
        <input type="password" style={css.input} placeholder="Mot de passe"
          value={staffPwd} onChange={e=>setStaffPwd(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&onAuth()} />
        <button style={{...css.btn,...css.btnStaff,width:"100%",marginTop:10}} onClick={onAuth}>Connexion</button>
        <button style={css.btnLink} onClick={()=>setView("home")}>← Retour</button>
      </div>
    </div>
  );
}

// ── CSS ────────────────────────────────────────────────────────────────────────
const css = {
  root:        { minHeight:"100vh", background:T.bg, color:T.text, fontFamily:"'Outfit','Segoe UI',sans-serif" },
  homeWrap:    { minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", padding:24 },
  homeCard:    { background:T.surface, border:`1px solid ${T.border}`, borderRadius:20, padding:"40px 32px", maxWidth:440, width:"100%", boxShadow:"0 8px 40px rgba(0,35,149,0.12)" },
  btn:         { border:"none", borderRadius:12, padding:"14px 24px", fontSize:16, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:10, transition:"all 0.2s" },
  btnPlayer:   { background:`linear-gradient(135deg,${T.navy},${T.navyLt})`, color:"#fff" },
  btnStaff:    { background:`linear-gradient(135deg,${T.redDk},${T.red})`, color:"#fff" },
  btnConfirm:  { background:`linear-gradient(135deg,${T.navy},${T.navyLt})`, color:"#fff", fontSize:14, padding:"10px 20px" },
  btnLink:     { background:"none", border:"none", color:T.textDim, cursor:"pointer", marginTop:16, fontSize:14, display:"block", textAlign:"center" },
  input:       { width:"100%", background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, padding:"12px 14px", color:T.text, fontSize:15, boxSizing:"border-box" },
  select:      { width:"100%", background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, padding:"10px 14px", color:T.text, fontSize:15, cursor:"pointer" },
  label:       { display:"block", fontSize:11, color:T.navy, textTransform:"uppercase", letterSpacing:1.5, marginBottom:8, fontWeight:700 },
  pageWrap:    { maxWidth:600, margin:"0 auto", padding:"0 0 120px" },
  pageHeader:  { display:"flex", alignItems:"center", gap:12, padding:"12px 16px", background:`linear-gradient(90deg,${T.navyDk},${T.navy})`, position:"sticky", top:0, zIndex:10, boxShadow:"0 2px 12px rgba(0,35,149,0.2)" },
  backBtn:     { background:"rgba(255,255,255,0.15)", border:"1px solid rgba(255,255,255,0.3)", borderRadius:8, color:"#fff", cursor:"pointer", padding:"6px 12px", fontSize:18 },
  pageTitle:   { flex:1, margin:0, fontSize:17, fontWeight:800, color:"#fff" },
  badgePill:   { padding:"5px 12px", borderRadius:20, border:"1px solid rgba(255,255,255,0.3)", fontSize:13, cursor:"pointer", color:"#fff", background:"rgba(255,255,255,0.15)" },
  staffBadge:  { padding:"4px 12px", borderRadius:20, background:"rgba(237,41,57,0.2)", border:"1px solid rgba(237,41,57,0.5)", fontSize:12, color:"#ff8a8a" },
  section:     { padding:"16px 16px" },
  noticeBar:   { margin:"4px 16px", padding:"8px 12px", background:`${T.navy}11`, border:`1px solid ${T.border}`, borderRadius:8, fontSize:12, color:T.navy, fontWeight:600 },
  tabs:        { display:"flex", padding:"0 16px", borderBottom:`2px solid ${T.border}` },
  tab:         { flex:1, background:"none", border:"none", borderBottom:"3px solid transparent", padding:"12px", color:T.textDim, cursor:"pointer", fontSize:14, fontWeight:600, transition:"all 0.2s" },
  tabActive:   { color:T.navy, borderBottomColor:T.navy },
  modeTabs:    { display:"flex", gap:8, padding:"10px 16px" },
  modeTab:     { flex:1, background:T.surface2, border:`1px solid ${T.border}`, borderRadius:10, padding:"8px", color:T.textDim, cursor:"pointer", fontSize:13, fontWeight:600 },
  modeTabActive:{ background:T.navy, border:`1px solid ${T.navy}`, color:"#fff" },
  playerDayNav:{ display:"flex", alignItems:"center", gap:6, padding:"10px 12px" },
  playerDayBtn:{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, color:T.navy, cursor:"pointer", padding:"8px 12px", fontSize:20, fontWeight:700, flexShrink:0, boxShadow:"0 1px 4px rgba(0,35,149,0.1)" },
  calendarWrap:{ overflowX:"auto", borderRadius:12, border:`1px solid ${T.border}`, margin:"0 12px", boxShadow:"0 2px 12px rgba(0,35,149,0.08)" },
  calGrid:     { display:"grid", minWidth:300 },
  gridSection: { padding:"0 12px" },
  timeColHead: { background:T.surface3, borderBottom:`1px solid ${T.border}`, borderRight:`1px solid ${T.border}`, height:56 },
  dayHead:     { background:T.surface3, borderBottom:`2px solid ${T.border}`, borderRight:`1px solid ${T.border}`, padding:"8px 6px", textAlign:"center", position:"relative" },
  dayHeadWE:   { background:"#f5f0f8" },
  dayHeadToday:{ background:`${T.navy}18`, borderBottom:`3px solid ${T.navy}` },
  todayDot:    { width:6, height:6, borderRadius:"50%", background:T.navy, margin:"2px auto 0" },
  dayName:     { fontSize:12, fontWeight:700, color:T.textMid, textTransform:"capitalize" },
  timeCell:    { background:T.surface2, borderBottom:`1px solid ${T.border2}`, borderRight:`1px solid ${T.border}`, padding:"4px 8px", fontSize:11, color:T.textDim, display:"flex", alignItems:"center", justifyContent:"flex-end", height:56 },
  timeCellHalf:{ height:28, fontSize:10, color:"#e05090", background:"#fce8f3" },
  slotCell:    { height:56, borderBottom:`1px solid ${T.border2}`, borderRight:`1px solid ${T.border}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, transition:"background 0.1s", overflow:"hidden", padding:"0 6px", background:T.surface },
  practDot:    { width:10, height:10, borderRadius:"50%", flexShrink:0 },
  practAvatar: { width:36, height:36, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:800, color:"#fff" },
  practLegend: { display:"flex", gap:12, flexWrap:"wrap", padding:"10px 0", marginTop:6 },
  legendItem:  { display:"flex", alignItems:"center", gap:6, fontSize:12, color:T.textDim },
  confirmBar:  { position:"fixed", bottom:0, left:0, right:0, background:`linear-gradient(90deg,${T.navyDk},${T.navy})`, borderTop:`3px solid ${T.goldBright}`, padding:"16px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, zIndex:20 },
  confirmWrap: { minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", padding:24 },
  confirmCard: { background:T.surface, border:`1px solid ${T.border}`, borderRadius:20, padding:"40px 28px", textAlign:"center", maxWidth:420, width:"100%", boxShadow:"0 8px 40px rgba(0,35,149,0.15)" },
  confirmTitle:{ fontSize:22, fontWeight:800, margin:"16px 0 20px", color:T.navy },
  confirmDetail:{ background:T.surface2, borderRadius:12, padding:16, textAlign:"left", display:"flex", flexDirection:"column", gap:10 },
  confirmRow:  { display:"flex", justifyContent:"space-between", alignItems:"center", fontSize:14, color:T.textDim },
  myBookingsPanel:{ margin:"0 16px 8px", background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, padding:14, boxShadow:"0 2px 8px rgba(0,35,149,0.08)" },
  myBookingsTitle:{ margin:"0 0 10px", color:T.navy, fontSize:13, textTransform:"uppercase", letterSpacing:1, fontWeight:700 },
  myBookingRow:{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderBottom:`1px solid ${T.border2}`, fontSize:14 },
  cancelBtn:   { background:"none", border:`1px solid ${T.red}`, borderRadius:6, color:T.red, cursor:"pointer", padding:"4px 10px", fontSize:12 },
  emptyHint:   { padding:"40px 20px", textAlign:"center", color:T.textDim, fontSize:14 },
  staffActions:{ display:"flex", gap:6, padding:"0 16px 8px", flexWrap:"wrap" },
  staffActBtn: { background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, color:T.textMid, cursor:"pointer", padding:"7px 10px", fontSize:12, fontWeight:600, transition:"all 0.15s" },
  addPlayerPanel:{ margin:"0 16px 10px", background:"#fffbe8", border:`1px solid ${T.goldBright}88`, borderRadius:12, padding:14 },
  staffCell:   { height:56, borderBottom:`1px solid ${T.border2}`, borderRight:`1px solid ${T.border}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, transition:"background 0.1s", overflow:"hidden", padding:"0 6px", background:T.surface },
  deleteBtn:   { background:"none", border:"none", color:T.red, cursor:"pointer", fontSize:11, padding:"2px", marginLeft:"auto", flexShrink:0 },
  staffLegend: { display:"flex", gap:8, flexWrap:"wrap", padding:"10px 16px", fontSize:11, color:T.textDim },
  legendBadge: { background:T.surface2, padding:"3px 8px", borderRadius:6, border:`1px solid ${T.border}`, color:T.textMid },
  histMonthHeader:{ fontSize:13, fontWeight:700, color:T.navy, textTransform:"capitalize", padding:"10px 0 6px", borderBottom:`2px solid ${T.border}`, marginBottom:6 },
  histRow:     { display:"flex", alignItems:"flex-start", gap:10, padding:"10px 0", borderBottom:`1px solid ${T.border2}`, fontSize:14 },
  daySelectorRow:{ display:"flex", alignItems:"center", gap:6, padding:"10px 16px", overflowX:"auto" },
  daySelectBtn:{ flex:"0 0 auto", minWidth:48, background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, color:T.textMid, cursor:"pointer", padding:"6px 8px", textAlign:"center", transition:"all 0.15s" },
  modalOverlay:{ position:"fixed", inset:0, background:"rgba(0,10,50,0.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:50, padding:20 },
  modalCard:   { background:T.surface, border:`1px solid ${T.border}`, borderRadius:16, padding:22, width:"100%", maxWidth:420, boxShadow:"0 20px 60px rgba(0,35,149,0.2)" },
  modalActionBtn:{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", borderRadius:10, cursor:"pointer", border:`1px solid ${T.border}`, background:T.surface2, fontSize:14, fontWeight:600, width:"100%", color:T.text },
};

const globalStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&display=swap');
  * { box-sizing: border-box; }
  body { margin: 0; background: #f0f4ff; }
  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-track { background: #e8edf8; }
  ::-webkit-scrollbar-thumb { background: rgba(0,35,149,0.25); border-radius: 3px; }
  select option { background: #fff; color: #0a1440; }
  button:hover { opacity: 0.88; }
  button:disabled { opacity: 0.35 !important; cursor: default !important; }
`;

// NOTE: Les composants PlayerView, StaffView, ByPractGrid, BySlotGrid, MultiKineDay,
// BookingActionModal, NoteModal sont à copier depuis medical-booking.jsx
// en remplaçant les appels locaux (confirmBooking, etc.) par les props passées.
