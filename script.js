"use strict";

/* ============================================================
   TIMEMARK GENERATOR — vanilla JS canvas renderer
   The preview canvas and the exported image share ONE renderer.
   ============================================================ */

const CONDENSED = "'Roboto Condensed','Arial Narrow','Helvetica Neue Condensed',sans-serif";
const STORE_KEY = "timemark_prefs_v1";

/* Reference metrics for a 1200×1600 image (starting point). */
const REF = {
  width:1200, height:1600,
  marginLeft:30, marginRight:30, marginBottom:30,
  gapTimeDivider:20, gapDividerDate:22, gapTimeLocation:34,
  dividerWidth:5
};

const canvas = document.getElementById('previewCanvas');
const ctx = canvas.getContext('2d');

/* ---------------- Application state ---------------- */
const defaults = {
  timeFont:112, dateFont:40, weekFont:38, locFont:39, locLH:48,
  textColor:'#ffffff', dividerColor:'#e7b41f', brandColor:'#d9de28',
  shadowStrength:75, outlineStrength:55, textOpacity:100,
  tsX:0, tsY:0, crX:0, crY:0, vfX:0, vfY:0,
  locationLine1:'Karugtong ng Kalye Koronel Santos Metro',
  locationLine2:'Manila, 1213 Makati',
  creditName:'Niño John Quijano',
  showCredit:true, useBrand:true, showVerif:true, showAmpm:false,
  showLogo:false, logoSize:120, logoOpacity:100,
  exportFormat:'jpeg'
};

const state = Object.assign({}, defaults, {
  image:null,          // HTMLImageElement / ImageBitmap
  imageName:'photo',
  logo:null,
  dateStr:'',          // yyyy-mm-dd
  timeStr:'',          // HH:MM (24h)
  verifCode:''
});

let scale = 1;
const s = v => v * scale;

/* ============================================================
   Helpers
   ============================================================ */
function generateVerificationCode(length = 14){
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i=0;i<length;i++) out += chars.charAt(Math.floor(Math.random()*chars.length));
  return out;
}

function pad2(n){ return String(n).padStart(2,'0'); }

function clamp(v,min,max){ return Math.max(min,Math.min(max,v)); }

function hexToRgb(hex){
  hex = (hex||'').replace('#','');
  if(hex.length===3) hex = hex.split('').map(c=>c+c).join('');
  const n = parseInt(hex,16);
  if(isNaN(n)) return {r:255,g:255,b:255};
  return {r:(n>>16)&255, g:(n>>8)&255, b:n&255};
}

/* 12-hour formatting; AM/PM optional */
function formatTime(t24, withAmpm){
  const [hRaw,m] = (t24||'00:00').split(':');
  let h = parseInt(hRaw,10);
  const ampm = h>=12 ? 'PM':'AM';
  h = h % 12; if(h===0) h = 12;
  let out = h + ':' + pad2(parseInt(m||'0',10));
  if(withAmpm) out += ' ' + ampm;
  return out;
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const WEEKDAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
function parseDate(ds){
  const [y,mo,d] = (ds||'').split('-').map(Number);
  return new Date(y, (mo||1)-1, d||1);
}
function formatDate(ds){
  const dt = parseDate(ds);
  return MONTHS[dt.getMonth()] + ' ' + dt.getDate() + ', ' + dt.getFullYear();
}
function formatWeekday(ds){
  return WEEKDAYS[parseDate(ds).getDay()];
}

/* Reduce font-size until text fits maxWidth (never crops). */
function fitFontSize(text, baseSize, maxWidth, family, weight){
  let size = baseSize;
  const min = Math.max(s(18), baseSize*0.45);
  ctx.font = weight+' '+size+'px '+family;
  while(ctx.measureText(text).width > maxWidth && size > min){
    size -= 1;
    ctx.font = weight+' '+size+'px '+family;
  }
  return size;
}

/* ============================================================
   Text drawing with soft shadow + subtle outline
   ============================================================ */
function drawText(text, x, y, opt){
  const o = opt || {};
  ctx.save();
  ctx.font = (o.weight||'400')+' '+o.size+'px '+(o.family||CONDENSED);
  ctx.textAlign = o.align || 'left';
  ctx.textBaseline = o.baseline || 'alphabetic';

  const shadowA = (o.shadow!=null?o.shadow:state.shadowStrength)/100;
  const outlineA = (o.outline!=null?o.outline:state.outlineStrength)/100;

  // soft drop shadow (rendered via the outline pass so thin glyphs read well)
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  if(outlineA > 0){
    ctx.shadowColor = 'rgba(0,0,0,'+shadowA+')';
    ctx.shadowBlur = s(o.size>70?7:5);
    ctx.shadowOffsetX = s(2);
    ctx.shadowOffsetY = s(3);
    ctx.lineWidth = s(Math.max(1.4, o.size*0.03));
    ctx.strokeStyle = 'rgba(0,0,0,'+outlineA+')';
    ctx.strokeText(text, x, y);
  } else {
    // shadow only, no outline
    ctx.shadowColor = 'rgba(0,0,0,'+shadowA+')';
    ctx.shadowBlur = s(o.size>70?8:6);
    ctx.shadowOffsetX = s(2);
    ctx.shadowOffsetY = s(3);
    ctx.fillStyle = o.color || '#fff';
    ctx.fillText(text, x, y);
    ctx.restore();
    return;
  }

  // crisp fill on top (shadow disabled)
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  ctx.fillStyle = o.color || '#fff';
  ctx.fillText(text, x, y);
  ctx.restore();
}

/* ============================================================
   Draw modules
   ============================================================ */
function drawLogo(){
  if(!state.logo || !state.showLogo) return;
  const targetW = s(state.logoSize);
  const ratio = state.logo.height / state.logo.width;
  const w = targetW, h = targetW * ratio;
  const x = s(REF.marginLeft);
  const y = s(REF.marginBottom); // top-left area
  ctx.save();
  ctx.globalAlpha = state.logoOpacity/100;
  ctx.drawImage(state.logo, x, y, w, h);
  ctx.restore();
}

/* Timestamp group: TIME | DATE / WEEKDAY  (positions derive from text metrics) */
function layout(){
  const W = canvas.width, H = canvas.height;
  const marginLeft   = s(REF.marginLeft);
  const marginRight  = s(REF.marginRight);
  const marginBottom = s(REF.marginBottom);
  const locFont = s(state.locFont);
  const locLH   = s(state.locLH);
  const timeFont= s(state.timeFont);

  // Location baselines (bottom-up)
  const loc2Base = H - marginBottom - locFont*0.12;
  const loc1Base = loc2Base - locLH;

  // Time baseline sits just above the location block
  const locTop = loc1Base - locFont*0.72;
  const timeBase = locTop - s(REF.gapTimeLocation) + s(state.tsY);

  return { W,H, marginLeft, marginRight, marginBottom, locFont, locLH, timeFont, loc1Base, loc2Base, timeBase };
}

function drawTimestampGroup(L){
  const timeText = formatTime(state.timeStr, state.showAmpm);
  const timeFont = L.timeFont;
  const timeCap = timeFont*0.72;
  const xStart = L.marginLeft + s(state.tsX);

  // measure time width in its font
  ctx.font = '400 '+timeFont+'px '+CONDENSED;
  const timeW = ctx.measureText(timeText).width;

  // Large time
  drawText(timeText, xStart, L.timeBase, {
    size:timeFont, weight:'400', color:state.textColor, align:'left', baseline:'alphabetic'
  });

  // vertical center of the time (used to align divider + date block)
  const centerY = L.timeBase - timeCap/2;

  // Yellow divider (real rectangle)
  const dividerX = xStart + timeW + s(REF.gapTimeDivider);
  const dividerW = s(REF.dividerWidth);
  const dividerH = timeCap*1.02;
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.shadowColor = 'rgba(0,0,0,'+(state.shadowStrength/100*0.7)+')';
  ctx.shadowBlur = s(4); ctx.shadowOffsetX = s(1); ctx.shadowOffsetY = s(2);
  ctx.fillStyle = state.dividerColor;
  const r = Math.min(dividerW/2, s(2));
  roundRect(dividerX, centerY - dividerH/2, dividerW, dividerH, r);
  ctx.fill();
  ctx.restore();

  // Date + weekday block, vertically centered on the time
  const dateFont = s(state.dateFont);
  const weekFont = s(state.weekFont);
  const dateX = dividerX + dividerW + s(REF.gapDividerDate);

  const dateAsc = dateFont*0.72;
  const weekAsc = weekFont*0.72;
  const blockGap = s(12);
  const blockH = dateAsc + blockGap + weekAsc;
  const blockTop = centerY - blockH/2;
  const dateBase = blockTop + dateAsc;
  const weekBase = dateBase + blockGap + weekAsc;

  drawText(formatDate(state.dateStr), dateX, dateBase, {
    size:dateFont, weight:'500', color:state.textColor, align:'left'
  });
  drawText(formatWeekday(state.dateStr), dateX, weekBase, {
    size:weekFont, weight:'400', color:state.textColor, align:'left'
  });
}

function drawLocation(L){
  const maxW = L.W - L.marginLeft - L.marginRight - s(state.tsX);
  const x = L.marginLeft + s(state.tsX);

  const l1 = state.locationLine1 || '';
  const l2 = state.locationLine2 || '';

  // fit each line independently so long addresses never overflow
  const size1 = l1 ? fitFontSize(l1, s(state.locFont), maxW, CONDENSED, '400') : s(state.locFont);
  const size2 = l2 ? fitFontSize(l2, s(state.locFont), maxW, CONDENSED, '400') : s(state.locFont);

  if(l1) drawText(l1, x, L.loc1Base, { size:size1, weight:'400', color:state.textColor, align:'left' });
  if(l2) drawText(l2, x, L.loc2Base, { size:size2, weight:'400', color:state.textColor, align:'left' });
}

function drawCredit(L){
  if(!state.showCredit) return;
  const rightX = L.W - L.marginRight - s(state.crX);
  const largeFont = s(41);
  const smallFont = s(31);

  const brandLine = state.useBrand ? 'Timemark' : (state.creditName || '');
  const largeBase = L.loc2Base + s(state.crY); // align bottom line with location bottom
  const smallBase = largeBase - largeFont*0.9 - s(8);

  drawText('Photo by', rightX, smallBase, {
    size:smallFont, weight:'400', color:'rgba(255,255,255,0.92)', align:'right'
  });
  drawText(brandLine, rightX, largeBase, {
    size:largeFont, weight:'700',
    color: state.useBrand ? state.brandColor : state.textColor,
    align:'right'
  });
}

function drawVerification(L){
  if(!state.showVerif) return;
  const code = state.verifCode || '';
  const label = '© ' + code + '  Timemark Verified';
  const vFont = s(25);
  const rightMargin = s(24) + s(state.vfX);
  const centerY = L.H * 0.40 + s(state.vfY);

  ctx.save();
  ctx.translate(L.W - rightMargin, centerY);
  ctx.rotate(-Math.PI/2);              // rotate the WHOLE line 90° (reads bottom→top)
  drawText(label, 0, 0, {
    size:vFont, weight:'400', color:'rgba(255,255,255,0.95)',
    align:'center', baseline:'middle', shadow:60, outline:40
  });
  ctx.restore();
}

/* rounded rect path helper */
function roundRect(x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}

/* ============================================================
   Master renderer  (order matters — spec §25)
   ============================================================ */
function renderCanvas(){
  if(!state.image) return;
  const W = canvas.width, H = canvas.height;

  // 1. clear + 2. draw photo
  ctx.clearRect(0,0,W,H);
  ctx.drawImage(state.image, 0, 0, W, H);

  // proportional scale (portrait / landscape / square all stay natural)
  scale = clamp(Math.min(W/REF.width, H/REF.height), 0.32, 12);

  const L = layout();

  ctx.save();
  ctx.globalAlpha = state.textOpacity/100;

  drawLogo();               // 3
  drawTimestampGroup(L);    // 4-7
  drawLocation(L);          // 8-9
  drawCredit(L);            // 10-11
  drawVerification(L);      // 12

  ctx.restore();
}

/* ============================================================
   Image loading (handles phone EXIF orientation)
   ============================================================ */
async function loadImageFile(file){
  // Prefer createImageBitmap with orientation applied from EXIF
  try{
    if(window.createImageBitmap){
      const bmp = await createImageBitmap(file, { imageOrientation:'from-image' });
      return bmp;
    }
  }catch(e){ /* fall through */ }
  // Fallback: object URL
  return await new Promise((resolve,reject)=>{
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = ()=>{ resolve(img); };
    img.onerror = reject;
    img.src = url;
  });
}

async function handlePhoto(file){
  if(!file || !file.type.startsWith('image/')) return;
  try{
    const img = await loadImageFile(file);
    state.image = img;
    state.imageName = (file.name||'photo').replace(/\.[^.]+$/,'');
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;

    canvas.width = w;
    canvas.height = h;

    // new photo => fresh verification code + current date/time
    state.verifCode = generateVerificationCode(14);
    $('#verifCode').value = state.verifCode;
    setNow();

    // thumbnail + info
    $('#thumb').src = bitmapToDataURL(img, 120);
    $('#photoName').textContent = file.name || 'photo';
    $('#photoDims').textContent = w + ' × ' + h + ' px';
    $('#photoInfo').style.display = 'block';
    $('#dropzone').style.display = 'none';

    canvas.style.display = 'block';
    $('#emptyStage').style.display = 'none';

    renderCanvas();
  }catch(err){
    console.error(err);
    toast('Could not load that image.');
  }
}

/* tiny helper to make a thumbnail data url from bitmap/image */
function bitmapToDataURL(img, size){
  const c = document.createElement('canvas');
  const w = img.naturalWidth||img.width, h = img.naturalHeight||img.height;
  const rC = size/Math.max(w,h);
  c.width = Math.round(w*rC); c.height = Math.round(h*rC);
  c.getContext('2d').drawImage(img,0,0,c.width,c.height);
  return c.toDataURL('image/jpeg',0.8);
}

/* ============================================================
   Export
   ============================================================ */
function downloadCanvas(){
  if(!state.image){ toast('Upload a photo first.'); return; }
  renderCanvas(); // ensure latest, at full original resolution

  const fmt = state.exportFormat === 'png' ? 'png' : 'jpeg';
  const mime = fmt === 'png' ? 'image/png' : 'image/jpeg';
  const ext  = fmt === 'png' ? 'png' : 'jpg';

  const t = (state.timeStr||'00:00').replace(':','');
  const filename = 'timemark-' + (state.dateStr||'photo') + '-' + t + '.' + ext;

  const done = (blob)=>{
    if(!blob){ toast('Export failed.'); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 1000);
    toast('Saved ' + filename);
  };

  if(fmt === 'jpeg') canvas.toBlob(done, mime, 0.95);
  else canvas.toBlob(done, mime);
}

/* ============================================================
   Preferences (localStorage — prefs only, never the photo)
   ============================================================ */
const PREF_KEYS = ['timeFont','dateFont','weekFont','locFont','locLH','textColor','dividerColor','brandColor','shadowStrength','outlineStrength','textOpacity','tsX','tsY','crX','crY','vfX','vfY','locationLine1','locationLine2','creditName','showCredit','useBrand','showVerif','showAmpm','showLogo','logoSize','logoOpacity','exportFormat'];

function savePrefs(){
  const p = {};
  PREF_KEYS.forEach(k=>p[k]=state[k]);
  try{ localStorage.setItem(STORE_KEY, JSON.stringify(p)); }catch(e){}
}
function loadPrefs(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    if(!raw) return;
    const p = JSON.parse(raw);
    PREF_KEYS.forEach(k=>{ if(k in p) state[k]=p[k]; });
  }catch(e){}
}

/* ============================================================
   DOM wiring
   ============================================================ */
function $(sel){ return document.querySelector(sel); }

let toastTimer;
function toast(msg){
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>t.classList.remove('show'), 2200);
}

function setNow(){
  const d = new Date();
  state.dateStr = d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());
  state.timeStr = pad2(d.getHours())+':'+pad2(d.getMinutes());
  $('#dateInput').value = state.dateStr;
  $('#timeInput').value = state.timeStr;
}

/* number-ish input -> int */
function toInt(v){ const n = parseInt(v,10); return isNaN(n)?0:n; }

function bindRange(id, key, valId, unit){
  const el = $(id);
  el.value = state[key];
  if(valId) $(valId).textContent = state[key];
  el.addEventListener('input', ()=>{
    state[key] = toInt(el.value);
    if(valId) $(valId).textContent = el.value;
    renderCanvas(); savePrefs();
  });
}
function bindText(id, key){
  const el = $(id);
  el.value = state[key] != null ? state[key] : '';
  el.addEventListener('input', ()=>{ state[key] = el.value; renderCanvas(); savePrefs(); });
}
function bindToggle(id, key){
  const el = $(id);
  el.checked = !!state[key];
  el.addEventListener('change', ()=>{ state[key] = el.checked; renderCanvas(); savePrefs(); });
}
function bindColor(colorId, hexId, key){
  const c = $(colorId), h = $(hexId);
  c.value = state[key]; h.value = state[key];
  const apply = (v)=>{ if(/^#?[0-9a-fA-F]{3,6}$/.test(v)){ const hex = v.startsWith('#')?v:'#'+v; state[key]=hex; c.value=hex; h.value=hex; renderCanvas(); savePrefs(); } };
  c.addEventListener('input', ()=>apply(c.value));
  h.addEventListener('input', ()=>apply(h.value.trim()));
}
function bindOffset(id, key){
  const el = $(id);
  el.value = state[key];
  el.addEventListener('input', ()=>{ state[key] = toInt(el.value); renderCanvas(); savePrefs(); });
}

function init(){
  loadPrefs();

  /* Photo upload */
  const dz = $('#dropzone'), fileInput = $('#fileInput');
  dz.addEventListener('click', ()=>fileInput.click());
  $('#replaceBtn').addEventListener('click', ()=>fileInput.click());
  fileInput.addEventListener('change', e=>{ if(e.target.files[0]) handlePhoto(e.target.files[0]); fileInput.value=''; });
  ['dragover','dragenter'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.add('drag');}));
  ['dragleave','drop'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove('drag');}));
  dz.addEventListener('drop', e=>{ const f=e.dataTransfer.files[0]; if(f) handlePhoto(f); });
  $('#removeBtn').addEventListener('click', ()=>{
    state.image=null;
    canvas.style.display='none'; $('#emptyStage').style.display='block';
    $('#photoInfo').style.display='none'; $('#dropzone').style.display='block';
  });

  /* Date & time */
  $('#dateInput').addEventListener('input', e=>{ state.dateStr=e.target.value; renderCanvas(); });
  $('#timeInput').addEventListener('input', e=>{ state.timeStr=e.target.value; renderCanvas(); });
  $('#nowBtn').addEventListener('click', ()=>{ setNow(); renderCanvas(); });
  bindToggle('#showAmpm','showAmpm');

  /* Location */
  bindText('#locationLine1','locationLine1');
  bindText('#locationLine2','locationLine2');
  $('#geoBtn').addEventListener('click', ()=>{
    if(!navigator.geolocation){ toast('Geolocation not supported.'); return; }
    toast('Getting location…');
    navigator.geolocation.getCurrentPosition(pos=>{
      const {latitude,longitude}=pos.coords;
      const coord = latitude.toFixed(5)+'°, '+longitude.toFixed(5)+'°';
      state.locationLine2 = coord; $('#locationLine2').value = coord;
      renderCanvas(); savePrefs(); toast('Coordinates added to line 2.');
    }, ()=>toast('Location permission denied.'), {enableHighAccuracy:true, timeout:8000});
  });

  /* Credit */
  bindToggle('#showCredit','showCredit');
  bindToggle('#useBrand','useBrand');
  bindText('#creditName','creditName');

  /* Verification */
  bindToggle('#showVerif','showVerif');
  const vc = $('#verifCode');
  vc.addEventListener('input', ()=>{ state.verifCode = vc.value; renderCanvas(); });
  $('#newCodeBtn').addEventListener('click', ()=>{ state.verifCode=generateVerificationCode(14); vc.value=state.verifCode; renderCanvas(); });

  /* Logo */
  const logoInput = $('#logoInput');
  $('#logoUploadBtn').addEventListener('click', ()=>logoInput.click());
  logoInput.addEventListener('change', async e=>{
    const f=e.target.files[0]; if(!f) return;
    try{ state.logo = await loadImageFile(f); state.showLogo=true; $('#showLogo').checked=true; renderCanvas(); savePrefs(); }
    catch(err){ toast('Could not load logo.'); }
    logoInput.value='';
  });
  bindToggle('#showLogo','showLogo');
  bindRange('#logoSize','logoSize','#logoSizeVal');
  bindRange('#logoOpacity','logoOpacity','#logoOpacityVal');
  $('#removeLogoBtn').addEventListener('click', ()=>{ state.logo=null; state.showLogo=false; $('#showLogo').checked=false; renderCanvas(); savePrefs(); });

  /* Advanced — typography */
  bindRange('#timeFont','timeFont','#timeFontVal');
  bindRange('#dateFont','dateFont','#dateFontVal');
  bindRange('#weekFont','weekFont','#weekFontVal');
  bindRange('#locFont','locFont','#locFontVal');
  bindRange('#locLH','locLH','#locLHVal');
  /* colors */
  bindColor('#textColor','#textColorHex','textColor');
  bindColor('#dividerColor','#dividerColorHex','dividerColor');
  bindColor('#brandColor','#brandColorHex','brandColor');
  /* legibility */
  bindRange('#shadowStrength','shadowStrength','#shadowVal');
  bindRange('#outlineStrength','outlineStrength','#outlineVal');
  bindRange('#textOpacity','textOpacity','#opacityVal');
  /* offsets */
  bindOffset('#tsX','tsX'); bindOffset('#tsY','tsY');
  bindOffset('#crX','crX'); bindOffset('#crY','crY');
  bindOffset('#vfX','vfX'); bindOffset('#vfY','vfY');

  /* export format */
  const ef = $('#exportFormat'); ef.value = state.exportFormat;
  ef.addEventListener('change', ()=>{ state.exportFormat = ef.value; savePrefs(); });

  /* reset */
  $('#resetBtn').addEventListener('click', ()=>{
    PREF_KEYS.forEach(k=>{ if(k in defaults) state[k]=defaults[k]; });
    savePrefs();
    // repaint controls
    ['timeFont','dateFont','weekFont','locFont','locLH','shadowStrength','outlineStrength','textOpacity','logoSize','logoOpacity'].forEach(k=>{
      const map={timeFont:'#timeFont',dateFont:'#dateFont',weekFont:'#weekFont',locFont:'#locFont',locLH:'#locLH',shadowStrength:'#shadowStrength',outlineStrength:'#outlineStrength',textOpacity:'#textOpacity',logoSize:'#logoSize',logoOpacity:'#logoOpacity'};
      const valmap={timeFont:'#timeFontVal',dateFont:'#dateFontVal',weekFont:'#weekFontVal',locFont:'#locFontVal',locLH:'#locLHVal',shadowStrength:'#shadowVal',outlineStrength:'#outlineVal',textOpacity:'#opacityVal',logoSize:'#logoSizeVal',logoOpacity:'#logoOpacityVal'};
      $(map[k]).value=state[k]; $(valmap[k]).textContent=state[k];
    });
    ['tsX','tsY','crX','crY','vfX','vfY'].forEach(k=>{ const idm={tsX:'#tsX',tsY:'#tsY',crX:'#crX',crY:'#crY',vfX:'#vfX',vfY:'#vfY'}; $(idm[k]).value=state[k]; });
    $('#textColor').value=state.textColor; $('#textColorHex').value=state.textColor;
    $('#dividerColor').value=state.dividerColor; $('#dividerColorHex').value=state.dividerColor;
    $('#brandColor').value=state.brandColor; $('#brandColorHex').value=state.brandColor;
    $('#locationLine1').value=state.locationLine1; $('#locationLine2').value=state.locationLine2;
    $('#creditName').value=state.creditName;
    $('#showCredit').checked=state.showCredit; $('#useBrand').checked=state.useBrand;
    $('#showVerif').checked=state.showVerif; $('#showAmpm').checked=state.showAmpm;
    renderCanvas(); toast('Reset to reference defaults.');
  });

  /* save buttons */
  $('#saveBtn').addEventListener('click', downloadCanvas);
  $('#saveBtnMobile').addEventListener('click', downloadCanvas);

  /* hydrate controls from loaded prefs (text/toggles already bound above with state values) */
  setNow();

  /* re-render once condensed webfont is ready so metrics are correct */
  if(document.fonts && document.fonts.ready){
    document.fonts.ready.then(()=>{ if(state.image) renderCanvas(); });
    document.fonts.load("400 112px 'Roboto Condensed'").then(()=>{ if(state.image) renderCanvas(); }).catch(()=>{});
  }
}

document.addEventListener('DOMContentLoaded', init);
