const $ = id => document.getElementById(id);
const fileInput = $('files'), drop = $('dropArea'), startBtn = $('startBtn');
let pyodide = null, results = [];
const engine = String.raw`
from PIL import Image, ImageOps
from io import BytesIO
import os, json

def _encode(im, fmt, quality):
    b=BytesIO()
    if fmt == 'JPEG':
        if im.mode not in ('RGB','L'):
            if 'A' in im.getbands():
                bg=Image.new('RGB', im.size, 'white'); bg.paste(im.convert('RGB'), mask=im.getchannel('A')); im=bg
            else: im=im.convert('RGB')
        im.save(b, 'JPEG', quality=int(quality), optimize=True, progressive=True, subsampling='4:2:0')
    elif fmt == 'WEBP':
        if im.mode not in ('RGB','RGBA'): im=im.convert('RGBA' if 'A' in im.getbands() else 'RGB')
        im.save(b, 'WEBP', quality=int(quality), method=4)
    return b.getvalue()

def optimize_bytes(src, ext, reduction, min_quality, allow_resize):
    before=len(src); target=max(1, int(before*(100-int(reduction))/100)); ext=ext.lower()
    im0=Image.open(BytesIO(src)); im0.seek(0); im=ImageOps.exif_transpose(im0); im.load()
    fmt={'.jpg':'JPEG','.jpeg':'JPEG','.png':'PNG','.webp':'WEBP'}[ext]
    best=src; method='Original रखा'; resized=False
    if fmt in ('JPEG','WEBP'):
        for current in ([im] if not allow_resize else [im]):
            candidates=[]
            for q in range(92, int(min_quality)-1, -3):
                data=_encode(current, fmt, q); candidates.append((len(data),data,q))
                if len(data)<=target: break
            fit=[x for x in candidates if x[0]<=target]
            chosen=max(fit,key=lambda x:x[2]) if fit else min(candidates,key=lambda x:x[0])
            best=chosen[1]; method=f'{fmt} quality {chosen[2]}'
            if len(best)<=target: break
        if allow_resize and len(best)>target:
            base=im
            for scale in (.9,.8,.7,.6,.5,.4,.3,.2):
                small=base.resize((max(1,int(base.width*scale)),max(1,int(base.height*scale)),), Image.Resampling.LANCZOS)
                candidates=[]
                for q in range(88,int(min_quality)-1,-4):
                    data=_encode(small,fmt,q); candidates.append((len(data),data,q))
                    if len(data)<=target: break
                fit=[x for x in candidates if x[0]<=target]
                chosen=max(fit,key=lambda x:x[2]) if fit else min(candidates,key=lambda x:x[0])
                best=chosen[1]; resized=True; method=f'{fmt} quality {chosen[2]} + resize'
                if len(best)<=target: break
    elif fmt=='PNG':
        b=BytesIO(); im.save(b,'PNG',optimize=True,compress_level=9); best=b.getvalue(); method='Lossless PNG optimize'
        if len(best)>target:
            if im.mode not in ('1','L','P'):
                rgba=im.convert('RGBA')
                for colors in (256,192,128,96,64,48,32,16):
                    qimg=rgba.quantize(colors=colors,method=Image.Quantize.FASTOCTREE,dither=Image.Dither.FLOYDSTEINBERG)
                    b=BytesIO(); qimg.save(b,'PNG',optimize=True,compress_level=9); data=b.getvalue()
                    if len(data)<len(best): best=data; method=f'PNG palette {colors} colors'
                    if len(best)<=target: break
            if allow_resize and len(best)>target:
                base=im
                for scale in (.9,.8,.7,.6,.5,.4,.3,.2):
                    small=base.resize((max(1,int(base.width*scale)),max(1,int(base.height*scale))),Image.Resampling.LANCZOS).convert('RGBA')
                    for colors in (256,128,64,32,16):
                        qimg=small.quantize(colors=colors,method=Image.Quantize.FASTOCTREE,dither=Image.Dither.FLOYDSTEINBERG)
                        b=BytesIO(); qimg.save(b,'PNG',optimize=True,compress_level=9); data=b.getvalue()
                        if len(data)<len(best): best=data; method=f'PNG resize + {colors} colors'
                        if len(best)<=target: break
                    resized=True
                    if len(best)<=target: break
    if len(best)>=before:
        best=src; method='Original रखा (result बड़ा था)'; resized=False
    return best, {'before':before,'after':len(best),'saved':before-len(best),'reduction':round((before-len(best))*100/before,1) if before else 0,'target':target,'target_met':len(best)<=target,'method':method,'resized':resized}
`;
function fmt(n){if(n==null)return '—';if(n<1024)return `${n} B`;if(n<1024*1024)return `${(n/1024).toFixed(1)} KB`;return `${(n/1048576).toFixed(2)} MB`;}
function setSelection(){const fs=Array.from(fileInput.files||[]);$('fileCount').textContent=fs.length?`${fs.length} फाइल · कुल ${fmt(fs.reduce((a,f)=>a+f.size,0))}`:'अभी कोई फाइल नहीं चुनी';startBtn.disabled=!fs.length||!pyodide;}
function setProgress(p,msg){$('progressWrap').classList.remove('hidden');$('bar').style.width=`${p}%`;$('progressPct').textContent=`${p}%`;$('progressText').textContent=msg;}
async function init(){try{$('status').textContent='Python runtime डाउनलोड हो रहा है… पहली बार थोड़ा समय लग सकता है।';pyodide=await loadPyodide();$('status').textContent='Pillow image library लोड हो रही है…';await pyodide.loadPackage('pillow');pyodide.runPython(engine);$('status').textContent='तैयार — इमेज आपके ब्राउज़र में प्रोसेस होंगी।';setSelection();}catch(e){$('status').textContent='Python/Pillow लोड नहीं हो पाया। इंटरनेट कनेक्शन जाँचें और पेज reload करें।';$('error').textContent=String(e);}}
function saveBlob(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function safeName(name){return name.replace(/[\\/:*?"<>|]/g,'_').replace(/^\.+/,'')||'image';}
function render(){const successful=results.filter(r=>r.ok);const before=successful.reduce((s,r)=>s+r.stats.before,0),after=successful.reduce((s,r)=>s+r.stats.after,0);$('summary').replaceChildren();[['Successful',`${successful.length}/${results.length}`],['Original',fmt(before)],['Final',fmt(after)],['Saved',fmt(before-after)]].forEach(([a,b])=>{const d=document.createElement('div');d.className='stat';const sm=document.createElement('small'),st=document.createElement('strong');sm.textContent=a;st.textContent=b;d.append(sm,st);$('summary').append(d);});const body=$('resultsBody');body.replaceChildren();results.forEach((r,i)=>{const tr=document.createElement('tr');const vals=[r.name,r.ok?fmt(r.stats.before):'—',r.ok?fmt(r.stats.after):'—',r.ok?`${fmt(r.stats.saved)} (${r.stats.reduction}%)`:'—',r.ok?(r.stats.after<r.stats.before?'Optimized':'Original kept'):'Failed'];vals.forEach((v,j)=>{const td=document.createElement('td');td.textContent=v;if(j===4)td.className=r.ok?'good':'warn';tr.append(td);});const td=document.createElement('td');if(r.ok){const b=document.createElement('button');b.className='download';b.textContent='डाउनलोड';b.onclick=()=>saveBlob(new Blob([r.data],{type:r.mime}),r.outputName);td.append(b);}else td.textContent=r.error;tr.append(td);body.append(tr);});$('resultsPanel').classList.remove('hidden');const all=$('downloadAll');if(successful.length>1){all.classList.remove('hidden');all.onclick=async()=>{all.disabled=true;all.textContent='ZIP बन रही है…';try{const zip=new JSZip();successful.forEach(r=>zip.file(r.outputName,r.data));const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:5}});saveBlob(blob,'optimized_images.zip');}catch(e){$('error').textContent='ZIP error: '+e;}finally{all.disabled=false;all.textContent='सभी फाइलें ZIP में डाउनलोड करें';}};}else all.classList.add('hidden');}
startBtn.addEventListener('click',async()=>{const fs=Array.from(fileInput.files||[]);if(!fs.length||!pyodide)return;results=[];$('error').textContent='';$('resultsPanel').classList.add('hidden');startBtn.disabled=true;const reduction=Number($('compression').value),minQ=Number($('quality').value),resize=$('resize').checked;const allowed=new Set(['.jpg','.jpeg','.png','.webp']);const used=new Set();try{for(let i=0;i<fs.length;i++){const f=fs[i],dot=f.name.lastIndexOf('.'),ext=(dot>=0?f.name.slice(dot):'').toLowerCase();setProgress(Math.round(i/fs.length*100),`प्रोसेसिंग ${i+1}/${fs.length}: ${f.name}`);if(!allowed.has(ext)){results.push({ok:false,name:f.name,error:'इस फॉर्मेट को सपोर्ट नहीं किया गया'});continue;}const inputBytes=new Uint8Array(await f.arrayBuffer());const inputPath=`/input_${i}${ext}`,outputPath=`/output_${i}${ext}`;pyodide.FS.writeFile(inputPath,inputBytes);pyodide.globals.set('src_path',inputPath);pyodide.globals.set('out_path',outputPath);pyodide.globals.set('file_ext',ext);pyodide.globals.set('reduction_pct',reduction);pyodide.globals.set('minimum_quality',minQ);pyodide.globals.set('resize_allowed',resize);await pyodide.runPythonAsync(`from pathlib import Path\nsource=Path(src_path).read_bytes()\nresult, stats=optimize_bytes(source,file_ext,reduction_pct,minimum_quality,resize_allowed)\nPath(out_path).write_bytes(result)\nresult_stats_json=json.dumps(stats)`);const data=pyodide.FS.readFile(outputPath);const stats=JSON.parse(pyodide.globals.get('result_stats_json'));let outputName=safeName(f.name);if(used.has(outputName)){const p=outputName.lastIndexOf('.');outputName=(p>0?outputName.slice(0,p):outputName)+`_${i+1}`+(p>0?outputName.slice(p):'');}used.add(outputName);results.push({ok:true,name:f.name,outputName,data:new Uint8Array(data),stats,mime:ext==='.png'?'image/png':ext==='.webp'?'image/webp':'image/jpeg'});pyodide.FS.unlink(inputPath);pyodide.FS.unlink(outputPath);setProgress(Math.round((i+1)/fs.length*100),`पूरा हुआ ${i+1}/${fs.length}: ${f.name}`);}render();$('status').textContent='Processing पूरी हुई।';}catch(e){$('error').textContent='Processing error: '+String(e);}finally{startBtn.disabled=!fileInput.files.length;setProgress(100,'प्रोसेसिंग पूरी हुई');}});
fileInput.addEventListener('change',setSelection);['dragenter','dragover'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('drag');}));['dragleave','drop'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('drag');}));drop.addEventListener('drop',e=>{if(e.dataTransfer.files.length){fileInput.files=e.dataTransfer.files;setSelection();}});
init();
