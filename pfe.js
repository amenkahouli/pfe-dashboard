// =========================
// EyeFish Dashboard PRO
// - Alertes: 1 ligne + modal liste
// - Capteurs: cartes + modal historique avec bandes
// - Pas de mini-diagrammes 1ère page
// =========================

const SENSORS = [
  { key:"temperature", name:"Température", unit:"°C", normal:[15,28], attention:[10,35] },
  { key:"pression",    name:"Pression", unit:"bar", normal:[1,5], attention:[0,8] },
  { key:"oxygene",     name:"Oxygène Dissous", unit:"mg/L", normal:[6,14], attention:[3,18] },
  { key:"turbidite",   name:"Turbidité", unit:"NTU", normal:[0,5], attention:[0,10] },
  { key:"tds",         name:"TDS / Conductivité", unit:"µS/cm", normal:[100,500], attention:[50,900] },
  { key:"ph",          name:"pH", unit:"", normal:[6.5,8.5], attention:[5.5,9.5] },
];

const MAX_POINTS = 60;
const REFRESH_MS = 5000;

// seuil alerte température (garde ton choix)
const TEMP_ALERT_THRESHOLD = 18;

// --------- Alerts storage ----------
const ALERTS_KEY = "eyefish_alerts_log";
const MAX_ALERTS = 50;

function loadAlertsLog(){
  try{ return JSON.parse(localStorage.getItem(ALERTS_KEY) || "[]"); }
  catch(e){ return []; }
}
function saveAlertsLog(list){
  localStorage.setItem(ALERTS_KEY, JSON.stringify(list));
}
function formatTime(ts){
  return new Date(ts).toLocaleString();
}
function addAlertToLog({level, title, message}){
  const log = loadAlertsLog();
  log.unshift({ level, title, message, time: Date.now() });
  if(log.length > MAX_ALERTS) log.pop();
  saveAlertsLog(log);
  renderAlertsLog();
}

// ✅ Résumé alertes + liste modal
function renderAlertsLog(){
  const countEl = document.getElementById("alertsCount");
  const modalList = document.getElementById("alertsModalList");
  const modalSub = document.getElementById("alertsModalSub");

  const log = loadAlertsLog();
  const n = log.length;

  // 1) badge "14 alertes !!!"
  if(countEl){
    countEl.textContent = `${n} alerte${n>1 ? "s" : ""} !!!`;

    const hasCrit = log.some(x => x.level === "crit");
    const hasAlert = log.some(x => x.level === "alert");

    countEl.classList.remove("ok","warn","crit");
    if(n === 0) countEl.classList.add("ok");
    else if(hasCrit) countEl.classList.add("crit");
    else if(hasAlert) countEl.classList.add("warn");
    else countEl.classList.add("ok");
  }

  // 2) remplir le modal (liste)
  if(modalSub){
    modalSub.textContent = n === 0 ? "Aucune alerte enregistrée." : `${n} alerte(s) enregistrée(s).`;
  }

  if(modalList){
    if(n === 0){
      modalList.innerHTML = `<div style="color:rgba(234,242,255,.65);font-size:12px">Aucune alerte pour le moment.</div>`;
    }else{
      modalList.innerHTML = log.map(item => `
        <div class="alertItem">
          <div class="left">
            <span class="alertTag ${item.level}">${item.level === "crit" ? "CRITIQUE" : "ALERTE"}</span>
            <div class="alertText">
              <strong>${item.title}</strong>
              <span>${item.message}</span>
            </div>
          </div>
          <div class="alertTime">${formatTime(item.time)}</div>
        </div>
      `).join("");
    }
  }
}

// --------- Alerts overlay (5s) ----------
// =======================
// 🔊 SIRENE PROFESSIONNELLE
// =======================

let sirenCtx = null;
let sirenOsc = null;
let sirenGain = null;
let sirenInterval = null;

function startAlarm(){

  if(sirenCtx) return; // déjà active

  try{
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    sirenCtx = new AudioCtx();

    sirenOsc = sirenCtx.createOscillator();
    sirenGain = sirenCtx.createGain();

    sirenOsc.type = "sawtooth";  // plus agressif que sine
    sirenOsc.frequency.value = 600;

    sirenGain.gain.value = 0.18; // volume

    sirenOsc.connect(sirenGain);
    sirenGain.connect(sirenCtx.destination);

    sirenOsc.start();

    let high = false;

    // montée / descente fréquence
    sirenInterval = setInterval(()=>{
      if(!sirenOsc) return;

      const now = sirenCtx.currentTime;
      if(high){
        sirenOsc.frequency.setTargetAtTime(600, now, 0.15);
      }else{
        sirenOsc.frequency.setTargetAtTime(1400, now, 0.15);
      }
      high = !high;
    }, 800);

  }catch(e){
    console.log("Audio bloqué par navigateur");
  }
}

function stopAlarm(){

  try{
    if(!sirenCtx) return;

    clearInterval(sirenInterval);

    sirenGain.gain.setTargetAtTime(0.0, sirenCtx.currentTime, 0.05);

    sirenOsc.stop();
    sirenCtx.close();

  }catch(e){}

  sirenCtx = null;
  sirenOsc = null;
  sirenGain = null;
  sirenInterval = null;
}

function showBigAlert(message){
  // si déjà affiché → update texte فقط
  const existing = document.getElementById("bigAlert");
  if(existing){
    const txt = existing.querySelector(".alertMessage");
    if(txt) txt.textContent = message;
    startAlarm();
    return;
  }

  const overlay = document.createElement("div");
  overlay.id = "bigAlert";

  overlay.innerHTML = `
    <div class="alertCenterBox">
      <div class="alertTitle">⚠️ ALERTE CRITIQUE ⚠️</div>
      <div class="alertMessage">${message}</div>
      <button id="closeBigAlert" class="alertCloseBtn">FERMER</button>
      <div style="margin-top:10px; font-size:12px; color:rgba(234,242,255,0.55);">
        Son actif • cliquez “FERMER” pour arrêter
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Lance l'alarme (⚠️ peut demander interaction user selon navigateur)
  startAlarm();

  document.getElementById("closeBigAlert").addEventListener("click", ()=>{
    stopAlarm();
    overlay.remove();
  });
}


// Anti-spam température
let lastTempAlertTs = 0;
const TEMP_ALERT_COOLDOWN_MS = 30000;

function triggerTempAlert(tempValue){
  const now = Date.now();
  if(now - lastTempAlertTs < TEMP_ALERT_COOLDOWN_MS) return;
  lastTempAlertTs = now;

  const msg = `Température > ${TEMP_ALERT_THRESHOLD}°C (actuel: ${tempValue} °C)`;
  showBigAlert(msg);

  addAlertToLog({
    level: "crit",
    title: "Température élevée",
    message: msg
  });
}

// --------- History capteurs ----------
function loadHistory(){
  try{ return JSON.parse(localStorage.getItem("eyefish_history") || "{}"); }
  catch(e){ return {}; }
}
function saveHistory(h){ localStorage.setItem("eyefish_history", JSON.stringify(h)); }
function pushValue(history, key, value){
  if(!history[key]) history[key] = [];
  history[key].push({ t: Date.now(), v: value });
  if(history[key].length > MAX_POINTS) history[key].shift();
}

// Status
function computeStatus(sensor, value){
  const [nmin,nmax] = sensor.normal;
  const [amin,amax] = sensor.attention;

  if(value >= nmin && value <= nmax) return { cls:"normal", label:"Normal" };
  if(value >= amin && value <= amax) return { cls:"alert",  label:"Alerte" };
  return { cls:"crit", label:"Critique" };
}

// Stats
function mean(arr){ return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0; }
function minmax(arr){
  let mn = Infinity, mx = -Infinity;
  for(const x of arr){ if(x<mn) mn=x; if(x>mx) mx=x; }
  return { mn, mx };
}
function trendLast5(arr){
  if(arr.length < 2) return 0;
  const a = arr.slice(-5);
  return a[a.length-1] - a[0];
}

// UI refs
const grid = document.getElementById("grid");
const lastUpdate = document.getElementById("lastUpdate");
const sysBadge = document.getElementById("sysBadge");
const sysText = document.getElementById("sysText");

// Modals
const modal = document.getElementById("modal");
const mClose = document.getElementById("mClose");
const mTitle = document.getElementById("mTitle");
const mSub = document.getElementById("mSub");
const mNow = document.getElementById("mNow");
const mAvg = document.getElementById("mAvg");
const mMin = document.getElementById("mMin");
const mMax = document.getElementById("mMax");
const mTrend = document.getElementById("mTrend");
const mUnit1 = document.getElementById("mUnit1");
const mUnit2 = document.getElementById("mUnit2");
const mUnit3 = document.getElementById("mUnit3");
const mUnit4 = document.getElementById("mUnit4");

// Alertes modal
const alertsModal = document.getElementById("alertsModal");
const btnAlertsDetails = document.getElementById("btnAlertsDetails");
const alertsClose = document.getElementById("alertsClose");

// Hide alerts line when opening sensor modal (avoid covering)
function setAlertsPanelVisible(visible){
  const panel = document.getElementById("alertsPanel");
  if(!panel) return;
  panel.style.display = visible ? "" : "none";
}

// Card template
function cardTemplate(s){
  const isPH = (s.key === "ph");

  return `
    <section class="card" data-key="${s.key}">
      <div class="cardHead">
        <div class="cardTitle">
          <h2>${s.name}</h2>
          <p>Plage: ${s.normal[0]}–${s.normal[1]} ${s.unit}</p>
        </div>
        <span class="status normal" id="st_${s.key}">Normal</span>
      </div>

      <div class="valueRow">
        <div class="value" id="v_${s.key}">--</div>
        <div class="unit">${s.unit}</div>
      </div>

      ${isPH ? `
        <div class="phGauge">
          <div class="phBar">
            <span class="phMarker" id="ph_marker"></span>
          </div>
          <div class="phLabels">
            <span>Acide</span>
            <span>Neutre</span>
            <span>Basique</span>
          </div>
        </div>
      ` : ``}

      <div class="divider"></div>

      <div class="footerRow">
        <span id="tr_${s.key}">Tendance: --</span>
        <a class="link" href="#" data-detail="${s.key}">${isPH ? "Cliquer pour détails →" : "Détails →"}</a>
      </div>
    </section>
  `;
}

if(grid){
  grid.innerHTML = SENSORS.map(cardTemplate).join("");
}

function setSystemState(anyCrit, anyAlert){
  const dot = sysBadge?.querySelector(".dot");
  if(!dot) return;

  if(anyCrit){
    dot.style.background = "var(--red)";
    sysText.textContent = "Critique";
  }else if(anyAlert){
    dot.style.background = "var(--yellow)";
    sysText.textContent = "Alerte";
  }else{
    dot.style.background = "var(--green)";
    sysText.textContent = "Normal";
  }
}

// Demo source
function getNewValuesDemo(){
  const base = {
    temperature: 18.6,
    pression: 3.29,
    oxygene: 8.0,
    turbidite: 2.4,
    tds: 272,
    ph: 8.01
  };

  const out = {};
  for(const k in base){
    const noise = (Math.random()-0.5) * (k==="tds" ? 12 : 0.35);
    out[k] = Number((base[k] + noise).toFixed(2));
  }
  return out;
}

// pH marker update
function updatePHMarker(values){
  const marker = document.getElementById("ph_marker");
  if(!marker) return;

  const phVal = Number(values.ph);
  if(Number.isNaN(phVal)) return;

  const clamped = Math.max(0, Math.min(14, phVal));
  const percent = (clamped / 14) * 100;
  marker.style.left = percent + "%";
}

// Chart modal (bands)
let detailChart = null;

function makeBandsPlugin(normalMin, normalMax, attMin, attMax){
  return {
    id: "bandsPlugin",
    beforeDatasetsDraw(chart){
      const {ctx, chartArea, scales} = chart;
      if(!chartArea) return;

      const y = scales.y;
      const left = chartArea.left;
      const right = chartArea.right;

      const yAttMax = y.getPixelForValue(attMax);
      const yAttMin = y.getPixelForValue(attMin);

      const yNormMax = y.getPixelForValue(normalMax);
      const yNormMin = y.getPixelForValue(normalMin);

      ctx.save();

      ctx.fillStyle = "rgba(247,184,75,0.06)";
      ctx.fillRect(left, yAttMax, right-left, yAttMin - yAttMax);

      ctx.fillStyle = "rgba(25,246,163,0.16)";
      ctx.fillRect(left, yNormMax, right-left, yNormMin - yNormMax);

      ctx.restore();
    }
  };
}

function openModal(sensorKey, history){
  setAlertsPanelVisible(false);

  const sensor = SENSORS.find(x=>x.key===sensorKey);
  const points = (history[sensorKey] || []);
  const arr = points.map(p=>p.v);

  const now = arr.at(-1);
  const avg = arr.length ? mean(arr) : 0;
  const { mn, mx } = arr.length ? minmax(arr) : { mn:0, mx:0 };
  const tr = trendLast5(arr);

  mTitle.textContent = sensor.name;
  mSub.textContent = `Historique détaillé • ${arr.length} mesures`;
  mNow.textContent = (now ?? "--");
  mAvg.textContent = arr.length ? avg.toFixed(2) : "--";
  mMin.textContent = arr.length ? mn.toFixed(2) : "--";
  mMax.textContent = arr.length ? mx.toFixed(2) : "--";
  mUnit1.textContent = sensor.unit;
  mUnit2.textContent = sensor.unit;
  mUnit3.textContent = sensor.unit;
  mUnit4.textContent = sensor.unit;

  const sign = tr >= 0 ? "+" : "";
  mTrend.textContent = `Tendance: ${sign}${tr.toFixed(2)} ${sensor.unit} sur les 5 dernières lectures`;

  const labels = points.map(p => new Date(p.t).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}));

  const ctx = document.getElementById("detailChart");
  if(detailChart) detailChart.destroy();

  const normalMin = sensor.normal[0];
  const normalMax = sensor.normal[1];
  const attMin = sensor.attention[0];
  const attMax = sensor.attention[1];

  let yMin, yMax;
  if(arr.length){
    const aMin = Math.min(...arr, attMin);
    const aMax = Math.max(...arr, attMax);
    const pad = Math.max(1, (aMax - aMin) * 0.10);
    yMin = aMin - pad;
    yMax = aMax + pad;
  }

  const bandsPlugin = makeBandsPlugin(normalMin, normalMax, attMin, attMax);

  detailChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: sensor.name,
          data: arr,
          borderColor: "#19f6a3",
          fill: false,
          tension: 0.35,
          pointRadius: (c) => (c.dataIndex === c.dataset.data.length - 1 ? 3 : 0),
          pointHoverRadius: 4,
          borderWidth: 2
        },
        { label:"Normal min", data: labels.map(() => normalMin), borderColor:"rgba(25,246,163,0.55)", borderDash:[6,6], borderWidth:1.5, pointRadius:0 },
        { label:"Normal max", data: labels.map(() => normalMax), borderColor:"rgba(25,246,163,0.55)", borderDash:[6,6], borderWidth:1.5, pointRadius:0 },
        { label:"Attention min", data: labels.map(() => attMin), borderColor:"rgba(247,184,75,0.65)", borderDash:[6,6], borderWidth:1.3, pointRadius:0 },
        { label:"Attention max", data: labels.map(() => attMax), borderColor:"rgba(247,184,75,0.65)", borderDash:[6,6], borderWidth:1.3, pointRadius:0 }
      ]
    },
    options: {
      responsive:true,
      maintainAspectRatio:false,
      plugins:{
        legend:{
          display:true,
          labels:{ color:"rgba(234,242,255,0.55)", usePointStyle:true, boxWidth:10 }
        },
        tooltip:{
          enabled:true,
          backgroundColor:"rgba(10,18,28,0.85)",
          titleColor:"rgba(234,242,255,0.85)",
          bodyColor:"#eaf2ff",
          borderColor:"rgba(255,255,255,0.12)",
          borderWidth:1,
          displayColors:false,
          callbacks:{ label:(t)=>`${t.parsed.y} ${sensor.unit}` }
        }
      },
      scales:{
        x:{ ticks:{ color:"rgba(234,242,255,0.55)", maxTicksLimit:6 }, grid:{ color:"rgba(255,255,255,0.06)" } },
        y:{ min:yMin, max:yMax, ticks:{ color:"rgba(234,242,255,0.55)" }, grid:{ color:"rgba(255,255,255,0.06)" } }
      }
    },
    plugins:[bandsPlugin]
  });

  modal.classList.add("show");
}

mClose?.addEventListener("click", ()=>{
  modal.classList.remove("show");
  setAlertsPanelVisible(true);
});
modal?.addEventListener("click", (e)=>{
  if(e.target===modal){
    modal.classList.remove("show");
    setAlertsPanelVisible(true);
  }
});

// Open/close alerts modal
btnAlertsDetails?.addEventListener("click", ()=>{
  alertsModal.classList.add("show");
});
alertsClose?.addEventListener("click", ()=>{
  alertsModal.classList.remove("show");
});
alertsModal?.addEventListener("click", (e)=>{
  if(e.target === alertsModal) alertsModal.classList.remove("show");
});

// Main render
let history = loadHistory();

function render(values){
  if(lastUpdate){
    lastUpdate.textContent = "Dernière mise à jour : " + new Date().toLocaleString();
  }

  let anyAlert=false, anyCrit=false;

  for(const s of SENSORS){
    const v = values[s.key];

    const valEl = document.getElementById(`v_${s.key}`);
    if(valEl) valEl.textContent = v;

    const st = computeStatus(s, v);
    const stEl = document.getElementById(`st_${s.key}`);
    if(stEl){
      stEl.className = `status ${st.cls}`;
      stEl.textContent = st.label;
    }

    if(st.cls==="alert") anyAlert=true;
    if(st.cls==="crit") anyCrit=true;

    const arr = (history[s.key] || []).map(p=>p.v);
    const tr = trendLast5(arr);
    const sign = tr >= 0 ? "+" : "";
    const trEl = document.getElementById(`tr_${s.key}`);
    if(trEl){
      trEl.textContent = `Tendance: ${sign}${tr.toFixed(2)} ${s.unit} (5)`;
    }
  }

  setSystemState(anyCrit, anyAlert);
  updatePHMarker(values);

  const temp = Number(values.temperature);
  if(!Number.isNaN(temp) && temp > TEMP_ALERT_THRESHOLD){
    triggerTempAlert(temp);
  }
}

function tick(){
  const values = getNewValuesDemo();

  for(const s of SENSORS){
    pushValue(history, s.key, values[s.key]);
  }
  saveHistory(history);

  render(values);
}

// Buttons
document.getElementById("btnReset")?.addEventListener("click", ()=>{
  if(confirm("Supprimer l'historique capteurs ?")){
    localStorage.removeItem("eyefish_history");
    history = {};
    tick();
  }
});

document.getElementById("btnClearAlerts")?.addEventListener("click", ()=>{
  if(confirm("Vider l'historique des alertes ?")){
    localStorage.removeItem(ALERTS_KEY);
    renderAlertsLog(); // met le badge à 0
  }
});

// Details click
document.addEventListener("click", (e)=>{
  const a = e.target.closest("[data-detail]");
  if(!a) return;
  e.preventDefault();
  openModal(a.dataset.detail, history);
});

// INIT
renderAlertsLog(); // affiche "14 alertes !!!" si tu en as 14 en mémoire
tick();

setInterval(tick, REFRESH_MS);
