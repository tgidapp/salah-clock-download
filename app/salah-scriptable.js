// ساعة الصلاة — ودجت iOS عبر تطبيق Scriptable
// ضع هذا في سكربت جديد داخل Scriptable، ثم أضف ودجت Scriptable (متوسط) على الشاشة الرئيسية واختر هذا السكربت.
// يحسب المواقيت محلياً (أم القرى). الموقع من GPS الجهاز، والطقس من Open-Meteo.
// ملاحظة: ودجت iOS يُحدَّث دورياً (لا كل ثانية)، فالوقت المتبقي بالساعات/الدقائق.

const NAMES = ["الفجر","الشروق","الظهر","العصر","المغرب","العشاء"];
const KAABA = { lat: 21.422487, lng: 39.826206 };

// ---------- حساب المواقيت (أم القرى) ----------
const rad = d => d*Math.PI/180, deg = r => r*180/Math.PI;
const fixA = a => a - 360*Math.floor(a/360), fixH = a => a - 24*Math.floor(a/24);
function julian(y,m,d){ if(m<=2){y-=1;m+=12;} const a=Math.floor(y/100); const b=2-a+Math.floor(a/4); return Math.floor(365.25*(y+4716))+Math.floor(30.6001*(m+1))+d+b-1524.5; }
function sunPos(jd){ const D=jd-2451545.0; const g=fixA(357.529+0.98560028*D); const q=fixA(280.459+0.98564736*D);
  const L=fixA(q+1.915*Math.sin(rad(g))+0.020*Math.sin(rad(2*g))); const e=23.439-0.00000036*D;
  const ra=deg(Math.atan2(Math.cos(rad(e))*Math.sin(rad(L)),Math.cos(rad(L))))/15; const eqt=q/15-fixH(ra);
  const decl=deg(Math.asin(Math.sin(rad(e))*Math.sin(rad(L)))); return [decl,eqt]; }
function midDay(jd,t){ return fixH(12-sunPos(jd+t)[1]); }
function sunAngle(jd,lat,angle,t,ccw){ const decl=sunPos(jd+t)[0]; const noon=midDay(jd,t);
  const T=deg(Math.acos((-Math.sin(rad(angle))-Math.sin(rad(decl))*Math.sin(rad(lat)))/(Math.cos(rad(decl))*Math.cos(rad(lat)))))/15;
  return noon+(ccw?-T:T); }
function asrTime(jd,lat,f,t){ const decl=sunPos(jd+t)[0]; const angle=-deg(Math.atan(1/(f+Math.tan(rad(Math.abs(lat-decl)))))); return sunAngle(jd,lat,angle,t,false); }
function hijriMonth(ms){ try { return parseInt(new Intl.DateTimeFormat('en-u-ca-islamic-umalqura',{month:'numeric'}).format(new Date(ms))); } catch(e){ return 0; } }
function compute(y,m,d,lat,lng,ram){
  let jd=julian(y,m,d)-lng/(15*24); let t=[5,6,12,13,18,18];
  for(let it=0;it<2;it++){ const p=t.map(x=>x/24);
    t[0]=sunAngle(jd,lat,18.5,p[0],true); t[1]=sunAngle(jd,lat,0.833,p[1],true);
    t[2]=midDay(jd,p[2]); t[3]=asrTime(jd,lat,1,p[3]); t[4]=sunAngle(jd,lat,0.833,p[4],false); }
  const base=Date.UTC(y,m-1,d,0,0,0); let r=[];
  for(let i=0;i<5;i++){ const h=t[i]-lng/15; r[i]=base+Math.round(h*60)*60000; }
  r[5]=r[4]+(ram?120:90)*60000; return r;
}
function forDay(ms,lat,lng){ const c=new Date(ms); c.setHours(12,0,0,0); const ram=hijriMonth(c.getTime())===9;
  return compute(c.getFullYear(),c.getMonth()+1,c.getDate(),lat,lng,ram); }
function qibla(lat,lng){ const p=rad(lat),k=rad(KAABA.lat),dl=rad(KAABA.lng-lng);
  return (deg(Math.atan2(Math.sin(dl),Math.cos(p)*Math.tan(k)-Math.sin(p)*Math.cos(dl)))+360)%360; }

// ---------- الموقع (مع تخزين آخر موقع) ----------
const fm = FileManager.local();
const store = fm.joinPath(fm.cacheDirectory(), "salah_loc.json");
async function getLoc(){
  // دعم تمرير "lat,lng" كمعامل للودجت لتثبيت الموقع
  if (args.widgetParameter && args.widgetParameter.includes(",")) {
    const [a,b] = args.widgetParameter.split(",").map(s=>parseFloat(s.trim()));
    if (!isNaN(a) && !isNaN(b)) return { lat:a, lng:b, name:null };
  }
  try {
    Location.setAccuracyToHundredMeters();
    const l = await Location.current();
    let name = null;
    try { const g = await Location.reverseGeocode(l.latitude, l.longitude, "ar"); name = g[0] && (g[0].locality || g[0].administrativeArea); } catch(e){}
    const loc = { lat:l.latitude, lng:l.longitude, name };
    fm.writeString(store, JSON.stringify(loc)); return loc;
  } catch(e){
    if (fm.fileExists(store)) return JSON.parse(fm.readString(store));
    return null;
  }
}
async function getWx(lat,lng){
  try{ const j = await new Request(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}&current=temperature_2m,relative_humidity_2m,weather_code,is_day&timezone=auto`).loadJSON();
    return j.current; }catch(e){ return null; }
}

// ---------- رسم قرص القبلة ----------
function disc(px, bearing){
  const dc = new DrawContext(); dc.size = new Size(px,px); dc.opaque = false; dc.respectScreenScale = true;
  const r = px/2, cx = r, cy = r;
  dc.setFillColor(new Color("#ffffff", 0.10)); dc.fillEllipse(new Rect(px*0.04,px*0.04,px*0.92,px*0.92));
  let ring = new Path(); ring.addEllipse(new Rect(px*0.05,px*0.05,px*0.90,px*0.90));
  dc.addPath(ring); dc.setStrokeColor(new Color("#a8f0e8")); dc.setLineWidth(px*0.03); dc.strokePath();
  // الاتجاهات
  dc.setTextAlignedCenter();
  const dirs = ["ش","ق","ج","غ"]; const dcol = ["#ff9f9f","#ffffff","#ffffff","#ffffff"];
  const fs = px*0.14;
  for(let i=0;i<4;i++){ const t = rad(i*90); const dx = cx+Math.sin(t)*r*0.72, dy = cy-Math.cos(t)*r*0.72;
    dc.setFont(Font.boldSystemFont(fs)); dc.setTextColor(new Color(dcol[i]));
    dc.drawTextInRect(dirs[i], new Rect(dx-fs, dy-fs*0.75, fs*2, fs*1.5)); }
  // الإبرة نحو الكعبة
  const ta = rad(bearing), kr = r*0.42, kx = cx+Math.sin(ta)*kr, ky = cy-Math.cos(ta)*kr;
  let nd = new Path(); nd.move(new Point(cx,cy)); nd.addLine(new Point(cx+Math.sin(ta)*kr*0.6, cy-Math.cos(ta)*kr*0.6));
  dc.addPath(nd); dc.setStrokeColor(new Color("#a8f0e8")); dc.setLineWidth(px*0.03); dc.strokePath();
  dc.setFillColor(new Color("#a8f0e8")); dc.fillEllipse(new Rect(cx-px*0.035, cy-px*0.035, px*0.07, px*0.07));
  // الكعبة
  const s = px*0.085; dc.setFillColor(new Color("#14171c")); dc.fillRect(new Rect(kx-s, ky-s, s*2, s*2));
  dc.setFillColor(new Color("#e2c26e")); dc.fillRect(new Rect(kx-s, ky-s*0.2, s*2, s*0.5));
  return dc.getImage();
}

// ---------- بناء الودجت ----------
function txt(stack, s, size, color, bold){ const t = stack.addText(s); t.font = bold?Font.boldSystemFont(size):Font.systemFont(size); t.textColor = new Color(color); t.lineLimit = 1; return t; }

async function build(){
  const w = new ListWidget();
  w.backgroundGradient = (()=>{ const g = new LinearGradient(); g.colors=[new Color("#23486B"),new Color("#3f86a8")]; g.locations=[0,1]; g.startPoint=new Point(0,0); g.endPoint=new Point(1,1); return g; })();
  w.setPadding(12,14,12,14);

  const loc = await getLoc();
  const now = Date.now();
  if(!loc){ const t = w.addText("افتح السكربت لتحديد الموقع، أو مرّر «خط العرض,خط الطول» كمعامل للودجت."); t.textColor=Color.white(); t.font=Font.systemFont(14); return w; }

  const wx = await getWx(loc.lat, loc.lng);
  let t = forDay(now, loc.lat, loc.lng), day = now, idx = t.findIndex(x=>x>now);
  if(idx<0){ day = now+86400000; t = forDay(day, loc.lat, loc.lng); idx = 0; }
  const friday = new Date(day).getDay()===5;
  const fmt = ms => new Intl.DateTimeFormat('ar-SA',{hour:'numeric',minute:'2-digit'}).format(ms);

  const row = w.addStack(); row.layoutHorizontally(); row.centerAlignContent();

  // عمود القبلة + الطقس
  const left = row.addStack(); left.layoutVertically(); left.centerAlignContent();
  const pin = left.addStack(); pin.layoutHorizontally(); pin.centerAlignContent();
  txt(pin, "📍 " + (loc.name||"موقعك"), 12, "#a8f0e8", true);
  left.addSpacer(4);
  const discRow = left.addStack(); discRow.layoutHorizontally(); discRow.centerAlignContent();
  const img = discRow.addImage(disc(240, qibla(loc.lat, loc.lng))); img.imageSize = new Size(76,76);
  if(wx){ discRow.addSpacer(8); const wc = discRow.addStack(); wc.layoutVertically(); wc.centerAlignContent();
    txt(wc, (wx.is_day? "☀️":"🌙"), 20, "#ffffff", false);
    txt(wc, Math.round(wx.temperature_2m)+"°", 15, "#ffffff", true);
    txt(wc, wx.relative_humidity_2m+"%", 12, "#dcebf7", false); }

  row.addSpacer(10);

  // عمود التاريخ + الصلوات
  const right = row.addStack(); right.layoutVertically();
  const dnow = new Date(now);
  const day_ar = new Intl.DateTimeFormat('ar-SA',{weekday:'long'}).format(dnow);
  const hij = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura',{day:'numeric',month:'long'}).format(dnow);
  const greg = new Intl.DateTimeFormat('en-GB').format(dnow);
  txt(right, day_ar, 15, "#E6F4FF", true);
  txt(right, hij + " هـ", 13, "#a8f0e8", false);
  txt(right, greg + " م", 13, "#dcebf7", false);
  right.addSpacer(6);

  const prow = right.addStack(); prow.layoutHorizontally();
  for(let i=0;i<6;i++){ const on = i===idx; const cell = prow.addStack(); cell.layoutVertically(); cell.centerAlignContent();
    txt(cell, (i===2&&friday)?"الجمعة":NAMES[i], 10, on?"#a8f0e8":"#dcebf7", false);
    txt(cell, fmt(t[i]), 13, on?"#a8f0e8":"#ffffff", true);
    if(on){ const mins = Math.ceil((t[i]-now)/60000); txt(cell, Math.floor(mins/60)+":"+String(mins%60).padStart(2,"0"), 10, "#a8f0e8", false); }
    else { txt(cell, " ", 10, "#000000", false); }
    if(i<5) prow.addSpacer(4); }

  w.refreshAfterDate = new Date(Math.min(t[idx]+1000, now+15*60000)); // تحديث قرب الصلاة أو كل ربع ساعة
  return w;
}

const widget = await build();
if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentMedium();
Script.complete();
