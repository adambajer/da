
/* Whiteboard – v12 (Pan + Zoom Slider + snap-synced cursor fix)
   - Fixed board 1800×800; element zoom (Ctrl/Alt/⌘ + wheel or +/-), centered.
   - NEW: Panning (Space+Drag or Middle mouse).
   - NEW: Zoom level slider (0.5x–3x) with % label.
   - FIX: Cursor/brush offset when zoomed — brush preview follows the same
          snapped world coordinates used for drawing (no drift at any zoom).
*/

// ===== Firebase bootstrap =====
const firebaseConfig = {
  databaseURL: "https://voice-noter-default-rtdb.europe-west1.firebasedatabase.app",
};
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// ===== DOM =====
const canvas = document.getElementById('drawingCanvas');
if (!canvas) throw new Error("Missing #drawingCanvas");
const ctx = canvas.getContext('2d', { alpha: true });

// Optional buttons
const clearButton       = document.getElementById('clearButton');
const downloadButton    = document.getElementById('downloadButton');
const toggleGridButton  = document.getElementById('toggleGridButton');
const toggleSnapButton  = document.getElementById('toggleSnapButton');
const colorPickerButton = document.getElementById('colorPickerButton');
const brushSizeSlider   = document.getElementById('brushSizeSlider');
const eraserButton      = document.getElementById('eraserButton');

// ===== Styles =====
(function injectStyles() {
  const css = `
    html,body{margin:0;height:100%;width:100%;background:#e9e9e9;overflow:hidden}
    #boardWrap{position:fixed;left:0;top:0;width:1800px;height:800px;
      box-shadow:0 10px 25px rgba(0,0,0,.15),0 2px 6px rgba(0,0,0,.08);
      border-radius:10px;background:#fff;overflow:hidden;transform-origin:top left}
    #drawingCanvas{display:block;width:100%;height:100%;background:#fff;touch-action:none;cursor:crosshair}
    #infoMessage{position:fixed;left:20px;bottom:20px;background:#fff;border:1px solid #ddd;padding:8px 10px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.06);opacity:0;transition:opacity .25s;z-index:2000}
    #brushPreview{position:fixed;pointer-events:none;border-radius:50%;border:1px solid rgba(0,0,0,.15);box-shadow:0 0 0 1px #fff inset;z-index:2000}
    #measureLabel{position:fixed;transform:translate(-50%,-50%);background:rgba(0,0,0,.82);color:#fff;padding:4px 6px;border-radius:6px;font:12px/1.2 system-ui,sans-serif;pointer-events:none;white-space:nowrap;display:none;z-index:2000}
    #loadingOverlay{position:fixed;inset:0;background:rgba(255,255,255,.8);display:none;align-items:center;justify-content:center;z-index:9999}
    .loader{border:16px solid #f3f3f3;border-top:16px solid #3498db;border-radius:50%;width:96px;height:96px;animation:spin 1.2s linear infinite}
    @keyframes spin{0%{transform:rotate(0)}100%{transform:rotate(360deg)}}
    /* Zoom slider */
    #zoomHud{position:fixed;right:16px;bottom:16px;background:#fff;border:1px solid #ddd;border-radius:10px;padding:8px 10px;box-shadow:0 2px 10px rgba(0,0,0,.06);z-index:2100;display:flex;align-items:center;gap:8px}
    #zoomHud input[type=range]{width:160px}
    #zoomPct{min-width:50px;text-align:right;font:12px system-ui}
  `;
  const s = document.createElement('style'); s.innerHTML = css; document.head.appendChild(s);
})();

// Wrapper for centering/zoom
let boardWrap = document.getElementById('boardWrap');
if (!boardWrap) { boardWrap = document.createElement('div'); boardWrap.id='boardWrap'; canvas.parentNode.insertBefore(boardWrap, canvas); boardWrap.appendChild(canvas); }

// Overlays & HUD
const infoMessage   = document.createElement('div'); infoMessage.id='infoMessage'; document.body.appendChild(infoMessage);
const brushPreview  = document.createElement('div'); brushPreview.id='brushPreview'; document.body.appendChild(brushPreview);
const measureLabel  = document.createElement('div'); measureLabel.id='measureLabel'; document.body.appendChild(measureLabel);
const loadingOverlay= document.createElement('div'); loadingOverlay.id='loadingOverlay'; loadingOverlay.innerHTML='<div class="loader"></div>'; document.body.appendChild(loadingOverlay);

const zoomHud = document.createElement('div');
zoomHud.id = 'zoomHud';
zoomHud.innerHTML = `
  <button id="zoomOutBtn">–</button>
  <input id="zoomRange" type="range" min="0.5" max="3" step="0.01" value="1" />
  <button id="zoomInBtn">+</button>
  <div id="zoomPct">100%</div>
`;
document.body.appendChild(zoomHud);
const zoomRange = zoomHud.querySelector('#zoomRange');
const zoomPct   = zoomHud.querySelector('#zoomPct');

// ===== State =====
const CANVAS_W = 1800, CANVAS_H = 800;
const state = {
  dpr: window.devicePixelRatio || 1,
  brush: { size: 10, color: '#5b35ff' },
  drawing: false,
  erasing: false,
  gridEnabled: false,
  gridSize: 50,
  snap: false,

  // element zoom + panning
  zoom: 1, zoomMin: 0.5, zoomMax: 3, zoomStep: 1.1,
  isPanning: false, spaceDown: false, panStart: {mx:0,my:0,left:0,top:0},

  lastLoadedTimestamp: 0, ignoreNextUpdateTs: null,
  lastDownPos: null, movedSinceDown: false,

  // modifiers for line/circle tools from v11 (kept)
  mod: { shift:false, ctrl:false, alt:false },
};

let strokes = [];  // {mode,color,size,points,type:'stroke'|'dot'|'line'|'circle', line?, circle?}
let redoStack = [];
let currentStroke = null;
let saveTimer = null;
let backgroundImage = null;

// ===== Setup, center, zoom =====
function setupCanvasDPR() {
  state.dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(CANVAS_W * state.dpr);
  canvas.height = Math.round(CANVAS_H * state.dpr);
  canvas.style.width = CANVAS_W + 'px'; canvas.style.height = CANVAS_H + 'px';
  ctx.setTransform(state.dpr,0,0,state.dpr,0,0);
  drawScene();
}

function centerBoard() {
  const vw=window.innerWidth, vh=window.innerHeight;
  const scaledW = CANVAS_W * state.zoom, scaledH = CANVAS_H * state.zoom;
  const left = Math.round((vw - scaledW)/2), top = Math.round((vh - scaledH)/2);
  boardWrap.style.transform = `scale(${state.zoom})`;
  boardWrap.style.left = `${left}px`; boardWrap.style.top = `${top}px`;
  boardWrap.style.width = `${CANVAS_W}px`; boardWrap.style.height = `${CANVAS_H}px`;
  zoomRange.value = String(state.zoom.toFixed(2));
  zoomPct.textContent = Math.round(state.zoom*100) + '%';
}

function setZoom(z, anchorClient=null) {
  const newZoom = Math.max(state.zoomMin, Math.min(state.zoomMax, z));
  if (newZoom === state.zoom) return;
  if (!anchorClient) { state.zoom=newZoom; centerBoard(); return; }
  const rect=canvas.getBoundingClientRect(); const oldScale=rect.width/CANVAS_W;
  const ax=(anchorClient.x-rect.left)/oldScale, ay=(anchorClient.y-rect.top)/oldScale;
  state.zoom=newZoom; centerBoard();
  const rect2=canvas.getBoundingClientRect(); const newScale=rect2.width/CANVAS_W;
  const newLeft=Math.round(anchorClient.x - ax*newScale), newTop=Math.round(anchorClient.y - ay*newScale);
  boardWrap.style.left=`${newLeft}px`; boardWrap.style.top=`${newTop}px`;
}

// ===== Rendering =====
function drawScene() {
  ctx.save(); ctx.setTransform(state.dpr,0,0,state.dpr,0,0);
  ctx.clearRect(0,0,CANVAS_W,CANVAS_H); ctx.fillStyle='#fff'; ctx.fillRect(0,0,CANVAS_W,CANVAS_H); ctx.restore();
  if (backgroundImage && backgroundImage.complete) ctx.drawImage(backgroundImage,0,0,CANVAS_W,CANVAS_H);
  if (state.gridEnabled) drawGrid(ctx);
  for (const s of strokes) drawStroke(ctx, s);
  if (currentStroke) drawStroke(ctx, currentStroke);
}

function drawGrid(gctx) {
  const gs=state.gridSize; gctx.save(); gctx.lineWidth=1; gctx.strokeStyle='rgba(0,0,0,0.08)'; gctx.beginPath();
  for (let x=0;x<=CANVAS_W;x+=gs){ gctx.moveTo(x,0); gctx.lineTo(x,CANVAS_H); }
  for (let y=0;y<=CANVAS_H;y+=gs){ gctx.moveTo(0,y); gctx.lineTo(CANVAS_W,y); }
  gctx.stroke(); gctx.restore();
}

function drawStroke(g,s) {
  g.save();
  g.globalCompositeOperation = s.mode==='erase' ? 'destination-out' : 'source-over';
  g.strokeStyle = s.mode==='erase' ? 'rgba(0,0,0,1)' : s.color;
  g.fillStyle = g.strokeStyle;
  g.lineCap='round'; g.lineJoin='round'; g.lineWidth = s.size;

  if (s.type==='dot') {
    const p=s.points[0]; g.beginPath(); g.arc(p.x,p.y,Math.max(0.5,s.size/2),0,Math.PI*2); g.fill();
  } else if (s.type==='circle') {
    const {cx,cy,r}=s.circle; g.beginPath(); g.arc(cx,cy,Math.max(0,r),0,Math.PI*2); g.stroke();
  } else {
    const pts=s.points; if (!pts||pts.length<2){ g.restore(); return; }
    g.beginPath(); g.moveTo(pts[0].x,pts[0].y); for (let i=1;i<pts.length;i++) g.lineTo(pts[i].x,pts[i].y); g.stroke();
  }
  g.restore();
}

// ===== Coords + Snap =====
function clientToCanvas(eClientX, eClientY) {
  const rect = canvas.getBoundingClientRect(); const scale = rect.width / CANVAS_W;
  return { x: (eClientX - rect.left)/scale, y:(eClientY - rect.top)/scale, scale, rect };
}
function applySnap(p) {
  if (!state.snap) return p;
  const g=state.gridSize;
  return { x: Math.round(p.x/g)*g, y: Math.round(p.y/g)*g };
}
function worldToClient(wx, wy) {
  const rect = canvas.getBoundingClientRect();
  const scale = rect.width / CANVAS_W;
  return { cx: rect.left + wx*scale, cy: rect.top + wy*scale, scale, rect };
}

// ===== Drawing logic (keeps v11 modifiers) =====
function beginStroke(cx, cy, mod) {
  state.drawing = true; state.movedSinceDown=false; state.lastDownPos = {x:cx,y:cy};
  let type='stroke', lineMode=false, axisMode=false, circleMode=false, angleSnap=false;
  if (mod.alt) circleMode = true, type='circle';
  else if (mod.shift) axisMode = true, type='line';
  else if (mod.ctrl) lineMode = true, type='line', angleSnap = mod.shift;

  const base = { mode: state.erasing ? 'erase' : 'draw', color: state.brush.color, size: state.brush.size, points:[{x:cx,y:cy}], type };
  if (circleMode) base.circle = { cx: cx, cy: cy, r: 0 };
  if (lineMode || axisMode) base.line = { start:{x:cx,y:cy}, angleSnap };
  base.axisMode = axisMode;
  currentStroke = base;
  redoStack = [];
  showMeasureForCurrent({x:cx,y:cy});
}
function extendStroke(cx, cy) {
  if (!state.drawing || !currentStroke) return;
  state.movedSinceDown = true;
  if (currentStroke.type==='circle') {
    const dx=cx-currentStroke.circle.cx, dy=cy-currentStroke.circle.cy;
    currentStroke.circle.r = Math.sqrt(dx*dx+dy*dy);
  } else if (currentStroke.type==='line') {
    const start=currentStroke.line.start; let x=cx, y=cy;
    if (currentStroke.axisMode) {
      const dx=Math.abs(cx-start.x), dy=Math.abs(cy-start.y);
      if (dx>=dy) { y=start.y; } else { x=start.x; }
    } else if (currentStroke.line.angleSnap) {
      const ang=Math.atan2(cy-start.y,cx-start.x), step=(15*Math.PI)/180;
      const snapped=Math.round(ang/step)*step, len=Math.hypot(cx-start.x, cy-start.y);
      x=start.x+Math.cos(snapped)*len; y=start.y+Math.sin(snapped)*len;
    }
    currentStroke.points=[start,{x,y}];
  } else {
    currentStroke.points.push({x:cx,y:cy});
  }
  drawScene(); showMeasureForCurrent({x:cx,y:cy});
}
function endStroke() {
  if (!state.drawing) return; state.drawing=false;
  if (currentStroke) {
    if (!state.movedSinceDown) {
      if (currentStroke.type==='circle') currentStroke.circle.r = Math.max(0.5, state.brush.size/2);
      else { currentStroke.type='dot'; currentStroke.points=[ state.lastDownPos ]; }
    }
    strokes.push(currentStroke); currentStroke=null; drawScene(); scheduleAutoSave();
  }
  hideMeasure();
}

// ===== Measure labels =====
function showMeasureForCurrent(cursor) {
  const rect=canvas.getBoundingClientRect(); const scale=rect.width/CANVAS_W;
  let text='', pos=null;
  if (currentStroke?.type==='line') {
    const a=currentStroke.points[0], b=currentStroke.points[1] || cursor;
    const dx=b.x-a.x, dy=b.y-a.y; const length=Math.sqrt(dx*dx+dy*dy);
    const angle=(Math.atan2(dy,dx)*180/Math.PI+360)%360;
    text=`${Math.round(length)} px · ${Math.round(angle)}°`; pos={x:(a.x+b.x)/2, y:(a.y+b.y)/2};
  } else if (currentStroke?.type==='circle') {
    const r=currentStroke.circle.r; text=`r = ${Math.round(r)} px`; pos={x:currentStroke.circle.cx, y:currentStroke.circle.cy - r - 12};
  } else { measureLabel.style.display='none'; return; }
  measureLabel.textContent=text; measureLabel.style.left=(rect.left+pos.x*scale)+'px'; measureLabel.style.top=(rect.top+pos.y*scale)+'px'; measureLabel.style.display='block';
}
function hideMeasure(){ measureLabel.style.display='none'; }

// ===== Brush preview (SNAP-SYNCED) =====
function updateBrushPreviewSnapped(clientX, clientY) {
  const raw = clientToCanvas(clientX, clientY);
  const world = applySnap({x:raw.x, y:raw.y});
  const loc = worldToClient(world.x, world.y); // snapped -> client, same as drawing
  const px = Math.max(2, state.brush.size * loc.scale);
  Object.assign(brushPreview.style, {
    width: px+'px', height:px+'px',
    backgroundColor: state.erasing ? 'transparent' : state.brush.color,
    left: (loc.cx - px/2)+'px', top: (loc.cy - px/2)+'px',
    outline: state.erasing ? '2px dashed #c00' : 'none'
  });
}

// ===== Panning =====
function startPan(e){ state.isPanning=true; const bw=boardWrap.getBoundingClientRect(); state.panStart={mx:e.clientX,my:e.clientY,left:bw.left,top:bw.top}; }
function doPan(e){ if (!state.isPanning) return; const dx=e.clientX-state.panStart.mx, dy=e.clientY-state.panStart.my; boardWrap.style.left=(state.panStart.left+dx)+'px'; boardWrap.style.top=(state.panStart.top+dy)+'px'; }
function endPan(){ state.isPanning=false; }

// ===== Events =====
canvas.addEventListener('mousedown', (e)=>{
  if (e.button===1 || state.spaceDown) { startPan(e); return; }
  const mods={shift:e.shiftKey, ctrl:e.ctrlKey||e.metaKey, alt:e.altKey};
  const raw = clientToCanvas(e.clientX, e.clientY);
  const p0  = applySnap({x:raw.x, y:raw.y});
  beginStroke(p0.x, p0.y, mods);
  updateBrushPreviewSnapped(e.clientX, e.clientY);
});
canvas.addEventListener('mousemove', (e)=>{
  if (state.isPanning) { doPan(e); return; }
  const raw = clientToCanvas(e.clientX, e.clientY);
  const p = applySnap({x:raw.x, y:raw.y});
  if (state.drawing) extendStroke(p.x, p.y);
  updateBrushPreviewSnapped(e.clientX, e.clientY);
});
canvas.addEventListener('mouseup', (e)=>{ if (state.isPanning) endPan(); else endStroke(); });
document.addEventListener('mouseup', endStroke);
canvas.addEventListener('mouseleave', ()=>{ if (state.isPanning) endPan(); if (state.drawing) endStroke(); });

// Touch panning (two-finger pan)
canvas.addEventListener('touchstart',(e)=>{
  if (e.touches.length>=2){ const t=e.touches[0]; startPan({clientX:t.clientX, clientY:t.clientY}); return; }
  e.preventDefault(); const t=e.touches[0]; const raw=clientToCanvas(t.clientX,t.clientY); const p=applySnap({x:raw.x,y:raw.y});
  const mods={shift:false,ctrl:false,alt:false}; beginStroke(p.x,p.y,mods); updateBrushPreviewSnapped(t.clientX,t.clientY);
},{passive:false});
canvas.addEventListener('touchmove',(e)=>{
  if (state.isPanning){ const t=e.touches[0]; doPan({clientX:t.clientX, clientY:t.clientY}); return; }
  e.preventDefault(); const t=e.touches[0]; const raw=clientToCanvas(t.clientX,t.clientY); const p=applySnap({x:raw.x,y:raw.y});
  extendStroke(p.x,p.y); updateBrushPreviewSnapped(t.clientX,t.clientY);
},{passive:false});
canvas.addEventListener('touchend',(e)=>{ e.preventDefault(); if (state.isPanning) endPan(); else endStroke(); },{passive:false});

canvas.addEventListener('contextmenu', (e)=>{ e.preventDefault(); createRadialColorPicker(e.clientX, e.clientY); });

// Wheel: element zoom with modifiers; brush resize without modifiers
window.addEventListener('wheel', (e) => {
  const overCanvas = document.elementFromPoint(e.clientX, e.clientY) === canvas;
  if (e.ctrlKey || e.metaKey || e.altKey) {
    e.preventDefault();
    const factor = Math.pow(1.1, -Math.sign(e.deltaY));
    setZoom(state.zoom * factor, { x:e.clientX, y:e.clientY });
  } else if (overCanvas) {
    e.preventDefault();
    const step = e.deltaY > 0 ? -1 : 1;
    state.brush.size = Math.max(1, Math.min(200, state.brush.size + step));
    if (brushSizeSlider) brushSizeSlider.value = state.brush.size;
    updateBrushPreviewSnapped(e.clientX, e.clientY);
    showInfo(`Brush ${state.brush.size}px`);
  }
}, { passive:false });

// Keyboard mods & panning
document.addEventListener('keydown', (e)=>{
  if (e.code==='Space'){ state.spaceDown=true; }
  if (e.key==='Shift') state.mod.shift=true;
  if (e.key==='Control') state.mod.ctrl=true;
  if (e.key==='Alt') state.mod.alt=true;

  if (e.ctrlKey || e.metaKey || e.altKey) {
    if (e.key.toLowerCase()==='z'){ e.preventDefault(); undo(); }
    if (e.key.toLowerCase()==='y' || (e.shiftKey && e.key.toLowerCase()==='z')){ e.preventDefault(); redo(); }
    if (e.key==='+' || e.key==='='){ e.preventDefault(); setZoom(state.zoom*state.zoomStep, {x:window.innerWidth/2,y:window.innerHeight/2}); }
    if (e.key==='-' || e.key==='_'){ e.preventDefault(); setZoom(state.zoom/state.zoomStep, {x:window.innerWidth/2,y:window.innerHeight/2}); }
    if (e.key==='0'){ e.preventDefault(); setZoom(1); centerBoard(); }
    if (e.key.toLowerCase()==='s'){ e.preventDefault(); doDownload(); }
  } else {
    if (e.key==='['){ state.brush.size=Math.max(1,state.brush.size-1); showInfo(`Brush ${state.brush.size}px`); }
    if (e.key===']'){ state.brush.size=Math.min(200,state.brush.size+1); showInfo(`Brush ${state.brush.size}px`); }
    if (e.key==='g' || e.key==='G'){ state.gridEnabled=!state.gridEnabled; drawScene(); }
    if (e.key==='s' || e.key==='S'){ state.snap=!state.snap; showInfo('Snap '+(state.snap?'ON':'OFF')); }
    if (e.key==='e' || e.key==='E'){ toggleEraser(); }
    if (e.key==='Delete'){ if (clearButton) clearButton.click(); }
  }
});
document.addEventListener('keyup', (e)=>{
  if (e.code==='Space'){ state.spaceDown=false; }
  if (e.key==='Shift') state.mod.shift=false;
  if (e.key==='Control') state.mod.ctrl=false;
  if (e.key==='Alt') state.mod.alt=false;
});

// Zoom slider HUD
zoomRange.addEventListener('input', ()=>{ setZoom(parseFloat(zoomRange.value), {x:window.innerWidth/2,y:window.innerHeight/2}); });
zoomHud.querySelector('#zoomInBtn').addEventListener('click', ()=> setZoom(state.zoom*state.zoomStep, {x:window.innerWidth/2,y:window.innerHeight/2}) );
zoomHud.querySelector('#zoomOutBtn').addEventListener('click',()=> setZoom(state.zoom/state.zoomStep, {x:window.innerWidth/2,y:window.innerHeight/2}) );

// Buttons
if (brushSizeSlider) brushSizeSlider.addEventListener('input', ()=>{ state.brush.size=parseInt(brushSizeSlider.value,10)||1; });
if (eraserButton) eraserButton.addEventListener('click', toggleEraser);
function toggleEraser(){ state.erasing=!state.erasing; if (eraserButton) eraserButton.classList.toggle('active', state.erasing); showInfo(state.erasing ? 'Eraser' : 'Brush'); }
if (toggleGridButton) toggleGridButton.addEventListener('click', ()=>{ state.gridEnabled=!state.gridEnabled; toggleGridButton.classList.toggle('active', state.gridEnabled); drawScene(); });
if (toggleSnapButton) toggleSnapButton.addEventListener('click', ()=>{ state.snap=!state.snap; toggleSnapButton.classList.toggle('active', state.snap); showInfo('Snap '+(state.snap?'ON':'OFF')); });
if (downloadButton) downloadButton.addEventListener('click', doDownload);
if (clearButton) clearButton.addEventListener('click', ()=>{ strokes=[]; redoStack=[]; currentStroke=null; backgroundImage=null; drawScene(); scheduleAutoSave(); hideMeasure(); showInfo('Cleared'); });
if (colorPickerButton) colorPickerButton.addEventListener('click', ()=>{ createRadialColorPicker(window.innerWidth/2, window.innerHeight/2); });

// Undo/Redo
function undo(){ if (!strokes.length) return; redoStack.push(strokes.pop()); drawScene(); scheduleAutoSave(); }
function redo(){ if (!redoStack.length) return; strokes.push(redoStack.pop()); drawScene(); scheduleAutoSave(); }

// Save/Load
function renderFull(){ const temp=document.createElement('canvas'); temp.width=CANVAS_W; temp.height=CANVAS_H; const tctx=temp.getContext('2d');
  tctx.fillStyle='#fff'; tctx.fillRect(0,0,temp.width,temp.height);
  if (backgroundImage && backgroundImage.complete) tctx.drawImage(backgroundImage,0,0,CANVAS_W,CANVAS_H);
  if (state.gridEnabled) drawGrid(tctx);
  for (const s of strokes) drawStroke(tctx, s);
  return temp;
}
function doDownload(){ const temp=renderFull(); const a=document.createElement('a'); a.href=temp.toDataURL('image/png'); a.download='drawing.png'; a.click(); showInfo('Downloaded'); }
function scheduleAutoSave(){ clearTimeout(saveTimer); saveTimer=setTimeout(autoSaveDrawing, 500); }
function autoSaveDrawing(){ clearTimeout(saveTimer); saveTimer=null;
  try{ const temp=renderFull(); const dataURL=temp.toDataURL('image/png'); const ts=Date.now(); state.ignoreNextUpdateTs=ts;
    database.ref('drawings/autoSave').set({imageData:dataURL,timestamp:ts}, (err)=>{ if (err) showInfo('Save error'); else showInfo('Saved'); });
  }catch(err){ console.error(err); showInfo('Save error'); }
}
function loadDrawing(){
  loadingOverlay.style.display='flex';
  database.ref('drawings/autoSave').once('value',(snap)=>{
    const data=snap.val();
    if (data && data.imageData){ state.lastLoadedTimestamp=data.timestamp||0; const img=new Image(); img.onload=()=>{ backgroundImage=img; drawScene(); loadingOverlay.style.display='none'; showInfo('Loaded'); }; img.src=data.imageData; }
    else { loadingOverlay.style.display='none'; showInfo('No saved drawing'); }
  });
}
database.ref('drawings/autoSave').on('value',(snap)=>{
  const data=snap.val(); if (!data||!data.imageData||!data.timestamp) return;
  if (state.ignoreNextUpdateTs && data.timestamp===state.ignoreNextUpdateTs){ state.lastLoadedTimestamp=data.timestamp; state.ignoreNextUpdateTs=null; return; }
  if (data.timestamp<=state.lastLoadedTimestamp) return;
  state.lastLoadedTimestamp=data.timestamp; const img=new Image(); img.onload=()=>{ backgroundImage=img; drawScene(); showInfo('Updated'); }; img.src=data.imageData;
});

// Color Picker
function createRadialColorPicker(x, y) {
  const existing = document.getElementById('radialColorPicker'); if (existing) existing.remove();
  const picker = document.createElement('div');
  picker.id = 'radialColorPicker';
  Object.assign(picker.style, { position:'fixed', left:`${x-150}px`, top:`${y-150}px`, width:'300px', height:'300px', zIndex:3000, transition:'opacity .15s, filter .15s', opacity:'0', filter:'blur(6px)' });
  document.body.appendChild(picker);
  const svgNS='http://www.w3.org/2000/svg', svg=document.createElementNS(svgNS,'svg');
  svg.setAttribute('width','300'); svg.setAttribute('height','300'); svg.setAttribute('viewBox','0 0 300 300'); picker.appendChild(svg);
  requestAnimationFrame(()=>{ picker.style.opacity='1'; picker.style.filter='blur(0)'; });
  const preview=document.createElementNS(svgNS,'circle'); preview.setAttribute('cx','150'); preview.setAttribute('cy','150'); preview.setAttribute('r','100'); preview.setAttribute('fill', state.brush.color); svg.appendChild(preview);
  const rings=6, seg=24;
  for (let r=0;r<rings;r++){ const inner=30+r*20, outer=inner+20;
    if (r===rings-1){ for (let i=0;i<seg;i++){ const start=i*360/seg, end=(i+1)*360/seg, L=100-i*(100/seg); addSlice(inner,outer,start,end,`hsl(0,0%,${L}%)`);} }
    else { const L=80-r*10; for (let i=0;i<seg;i++){ const start=i*360/seg, end=(i+1)*360/seg, H=i*360/seg; addSlice(inner,outer,start,end,`hsl(${H},100%,${L}%)`);} }
  }
  function addSlice(inner,outer,start,end,fill){
    const path=document.createElementNS(svgNS,'path');
    path.setAttribute('d', describeArc(150,150,inner,outer,start,end));
    path.setAttribute('fill', fill); path.setAttribute('stroke','#fff'); path.setAttribute('stroke-width','1');
    path.addEventListener('mouseenter', ()=> preview.setAttribute('fill', fill));
    path.addEventListener('click', ()=>{ setBrushColor(fill); pickerRemove(); });
    svg.appendChild(path);
  }
  function pickerRemove(){ picker.style.opacity='0'; picker.style.filter='blur(6px)'; setTimeout(()=>picker.remove(),140); window.removeEventListener('click', outside, true); }
  function outside(e){ if (picker.contains(e.target)) return; pickerRemove(); }
  window.addEventListener('click', outside, true);
}
function describeArc(x,y,innerR,outerR,startA,endA){
  const startOuter=polarToCartesian(x,y,outerR,endA), endOuter=polarToCartesian(x,y,outerR,startA);
  const startInner=polarToCartesian(x,y,innerR,endA), endInner=polarToCartesian(x,y,innerR,startA);
  const largeArc=endA-startA<=180?0:1;
  return ["M",startOuter.x,startOuter.y,"A",outerR,outerR,0,largeArc,0,endOuter.x,endOuter.y,"L",endInner.x,endInner.y,"A",innerR,innerR,0,largeArc,1,startInner.x,startInner.y,"Z"].join(" ");
}
function polarToCartesian(cx,cy,r,deg){ const a=(deg-90)*Math.PI/180; return {x:cx + r*Math.cos(a), y:cy + r*Math.sin(a)}; }
function setBrushColor(color){ state.brush.color=color; }

function showInfo(msg){ infoMessage.textContent=msg; infoMessage.style.opacity='1'; clearTimeout(showInfo._t); showInfo._t=setTimeout(()=>{ infoMessage.style.opacity='0'; }, 900); }

// Init
window.addEventListener('load', ()=>{ setupCanvasDPR(); centerBoard(); loadDrawing(); drawScene(); });
window.addEventListener('resize', centerBoard);
