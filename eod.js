/* ============================================================
   EOD Report tab — builds an .xlsx that mirrors eod.xlsx
   (FIL-GLOBAL "SUPPORT WORK FROM HOME ACCOMPLISHMENT REPORT")
   ============================================================ */

const EOD_STORE_KEY = 'timemark_eod_prefs_v1';
const EOD_TAB_KEY = 'timemark_active_tab';
const EOD_LOGO_PATH = 'assets/fil-global-logo.png';
const EOD_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

let eodLogoBase64Cache = null;

function eodFormatDate(ds){
  if(!ds) return '';
  const [y,m,d] = ds.split('-').map(Number);
  if(!y || !m || !d) return ds;
  return EOD_MONTHS[m-1] + ' ' + d + ', ' + y;
}

function showTab(tab){
  const isEod = tab === 'eod';
  $('#timestampView').style.display = isEod ? 'none' : '';
  $('#eodView').style.display = isEod ? '' : 'none';
  $('#tabTimestamp').classList.toggle('active', !isEod);
  $('#tabEod').classList.toggle('active', isEod);
  try{ localStorage.setItem(EOD_TAB_KEY, tab); }catch(e){}
}

function updateEodPreview(){
  $('#pvName').textContent = $('#eodName').value || ' ';
  const d = $('#eodDate').value;
  $('#pvDate').textContent = d ? eodFormatDate(d) : ' ';
  $('#pvMorning').textContent = $('#eodMorning').value;
  $('#pvAfternoon').textContent = $('#eodAfternoon').value;
}

async function loadLogoBase64(){
  if(eodLogoBase64Cache) return eodLogoBase64Cache;
  const res = await fetch(EOD_LOGO_PATH);
  const blob = await res.blob();
  eodLogoBase64Cache = await new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  return eodLogoBase64Cache;
}

/* Applies a thin black box outline around a rectangular range,
   cell-by-cell — matches how the original template borders a
   merged range so the outline survives the merge. */
function eodBoxOutline(ws, r1, c1, r2, c2){
  const thin = { style:'thin', color:{ argb:'FF000000' } };
  for(let r=r1;r<=r2;r++){
    for(let c=c1;c<=c2;c++){
      const cell = ws.getCell(r,c);
      const b = Object.assign({}, cell.border);
      if(r===r1) b.top = thin;
      if(r===r2) b.bottom = thin;
      if(c===c1) b.left = thin;
      if(c===c2) b.right = thin;
      cell.border = b;
    }
  }
}

function eodFill(ws, r, c1, c2, argb){
  for(let c=c1;c<=c2;c++){
    ws.getCell(r,c).fill = { type:'pattern', pattern:'solid', fgColor:{ argb } };
  }
}

async function buildEodWorkbook({ name, dateStr, morning, afternoon }){
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Timemark Generator';
  wb.created = new Date();

  const ws = wb.addWorksheet('SUPPORT', { views:[{ showGridLines:false }] });
  ws.columns = [
    { width:9.43 },{ width:11.86 },{ width:18.57 },{ width:16.71 },{ width:22.71 },
    { width:5.86 },{ width:21 },{ width:21 },{ width:19.86 }
  ];

  const NAVY = 'FF002060', WHITE = 'FFFFFFFF';

  ws.getRow(1).height = 38;
  ws.getRow(2).height = 48;
  ws.getRow(3).height = 10;
  ws.getRow(4).height = 30;
  ws.getRow(5).height = 30;
  ws.getRow(6).height = 10;
  ws.getRow(7).height = 24;
  for(let r=8;r<=23;r++) ws.getRow(r).height = 17;
  ws.getRow(24).height = 10;
  ws.getRow(25).height = 10;
  ws.getRow(26).height = 24;
  for(let r=27;r<=42;r++) ws.getRow(r).height = 17;

  ws.mergeCells(1,1,2,2);   // logo
  ws.mergeCells(1,3,1,9);   // title
  ws.mergeCells(2,3,2,9);   // subtitle
  ws.mergeCells(4,1,4,2);   // NAME label
  ws.mergeCells(4,3,4,9);   // name value
  ws.mergeCells(5,1,5,2);   // DATE label
  ws.mergeCells(5,3,5,9);   // date value
  ws.mergeCells(7,1,7,9);   // morning bar
  ws.mergeCells(8,1,23,9);  // morning box
  ws.mergeCells(26,1,26,9); // afternoon bar
  ws.mergeCells(27,1,42,9); // afternoon box

  eodBoxOutline(ws,1,1,2,2);
  eodBoxOutline(ws,1,3,1,9);
  eodBoxOutline(ws,2,3,2,9);
  eodBoxOutline(ws,4,1,4,2);
  eodBoxOutline(ws,4,3,4,9);
  eodBoxOutline(ws,5,1,5,2);
  eodBoxOutline(ws,5,3,5,9);
  eodBoxOutline(ws,8,1,23,9);
  eodBoxOutline(ws,27,1,42,9);

  eodFill(ws,1,3,9,WHITE);
  eodFill(ws,2,3,9,WHITE);

  const titleCell = ws.getCell(1,3);
  titleCell.value = 'FIL-GLOBAL IMMIGRATION SERVICES CORPORATION';
  titleCell.font = { name:'Calibri', bold:true, size:16 };
  titleCell.alignment = { horizontal:'center', vertical:'middle', wrapText:true };

  const subCell = ws.getCell(2,3);
  subCell.value = 'SUPPORT WORK FROM HOME ACCOMPLISHMENT REPORT\n(MD, Operations Manager, Marketing, People Ops, BOD, Finance and IT)';
  subCell.font = { name:'Calibri', size:12 };
  subCell.alignment = { horizontal:'center', vertical:'middle', wrapText:true };

  function navyLabel(r, text){
    eodFill(ws, r, 1, 2, NAVY);
    const cell = ws.getCell(r,1);
    cell.value = text;
    cell.font = { name:'Calibri', bold:true, size:16, color:{ argb:WHITE } };
    cell.alignment = { horizontal:'center', vertical:'middle' };
  }
  navyLabel(4,'NAME:');
  navyLabel(5,'DATE:');

  const nameVal = ws.getCell(4,3);
  nameVal.value = name;
  nameVal.font = { name:'Calibri', size:11 };
  nameVal.alignment = { horizontal:'left', vertical:'middle', indent:1 };

  const dateVal = ws.getCell(5,3);
  dateVal.value = dateStr;
  dateVal.font = { name:'Calibri', size:11 };
  dateVal.alignment = { horizontal:'left', vertical:'middle', indent:1 };

  function navyBar(r, text){
    eodFill(ws, r, 1, 9, NAVY);
    const cell = ws.getCell(r,1);
    cell.value = text;
    cell.font = { name:'Calibri', bold:true, size:18, color:{ argb:WHITE } };
    cell.alignment = { horizontal:'center', vertical:'middle' };
  }
  navyBar(7, 'MORNING TASK (8:00 AM - 12:00 PM)');
  navyBar(26, 'AFTERNOON TASK (1:00 PM - 5:00 PM)');

  function taskBox(r, text){
    const cell = ws.getCell(r,1);
    cell.value = text || '';
    cell.font = { name:'Calibri', size:11 };
    cell.alignment = { horizontal:'left', vertical:'top', wrapText:true, indent:1 };
  }
  taskBox(8, morning);
  taskBox(27, afternoon);

  try{
    const base64 = await loadLogoBase64();
    const imgId = wb.addImage({ base64, extension:'png' });
    ws.addImage(imgId, { tl:{ col:0.15, row:0.08 }, ext:{ width:95, height:79 } });
  }catch(e){
    console.warn('EOD logo could not be embedded:', e);
  }

  return wb;
}

async function downloadEod(){
  const name = $('#eodName').value.trim();
  const date = $('#eodDate').value;
  const morning = $('#eodMorning').value.trim();
  const afternoon = $('#eodAfternoon').value.trim();

  if(!name){ toast('Enter your name first.'); $('#eodName').focus(); return; }
  if(!date){ toast('Pick a date first.'); $('#eodDate').focus(); return; }
  if(!morning && !afternoon){ toast('Fill in at least one task.'); return; }
  if(typeof ExcelJS === 'undefined'){ toast('Report library failed to load — check your connection.'); return; }

  const btn = $('#eodDownloadBtn');
  const prevLabel = btn.textContent;
  btn.textContent = 'Building…'; btn.disabled = true;

  try{
    const wb = await buildEodWorkbook({ name, dateStr: eodFormatDate(date), morning, afternoon });
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    const safeName = name.replace(/[^a-z0-9]+/gi,'_').replace(/^_+|_+$/g,'') || 'report';
    const filename = 'EOD_' + safeName + '_' + date + '.xlsx';

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 1000);
    toast('Saved ' + filename);
  }catch(err){
    console.error(err);
    toast('Could not build the file.');
  }finally{
    btn.textContent = prevLabel; btn.disabled = false;
  }
}

function initEod(){
  $('#tabTimestamp').addEventListener('click', ()=>showTab('timestamp'));
  $('#tabEod').addEventListener('click', ()=>showTab('eod'));

  const d = new Date();
  $('#eodDate').value = d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());

  try{
    const raw = localStorage.getItem(EOD_STORE_KEY);
    if(raw){
      const p = JSON.parse(raw);
      if(p.name) $('#eodName').value = p.name;
    }
  }catch(e){}

  ['eodName','eodDate','eodMorning','eodAfternoon'].forEach(id=>{
    $('#'+id).addEventListener('input', ()=>{
      updateEodPreview();
      if(id === 'eodName'){
        try{ localStorage.setItem(EOD_STORE_KEY, JSON.stringify({ name:$('#eodName').value })); }catch(e){}
      }
    });
  });

  $('#eodDownloadBtn').addEventListener('click', downloadEod);

  let savedTab = null;
  try{ savedTab = localStorage.getItem(EOD_TAB_KEY); }catch(e){}
  if(savedTab === 'eod') showTab('eod');

  updateEodPreview();
}

document.addEventListener('DOMContentLoaded', initEod);
