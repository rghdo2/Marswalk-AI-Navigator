
/* ==========================================
   MARSWALK - ANIMATED MARS PLANET
   Main Website Visual
========================================== */

(function () {
    function initMarsPlanet() {
        const canvas = document.getElementById("planet");
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const SIZE = 360;
        const TW = 512;
        const TH = 256;
        const TAU = Math.PI * 2;

        canvas.width = SIZE;
        canvas.height = SIZE;

        const radius = SIZE / 2 - 5;

        function hash(x, y) {
            const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
            return n - Math.floor(n);
        }

        function noise(x, y) {
            const xi = Math.floor(x);
            const yi = Math.floor(y);
            const xf = x - xi;
            const yf = y - yi;

            const u = xf * xf * (3 - 2 * xf);
            const v = yf * yf * (3 - 2 * yf);

            return (
                hash(xi, yi) * (1-u) * (1-v) +
                hash(xi+1, yi) * u * (1-v) +
                hash(xi, yi+1) * (1-u) * v +
                hash(xi+1, yi+1) * u * v
            );
        }

        function terrain(x, y) {
            let total = 0;
            let amplitude = 0.5;
            let frequency = 1;

            for (let i = 0; i < 5; i++) {
                total += amplitude * noise(
                    x * frequency,
                    y * frequency
                );
                amplitude *= 0.5;
                frequency *= 2;
            }

            return total;
        }

        const colors = [
            [70, 30, 28],
            [150, 66, 42],
            [201, 110, 72],
            [232, 170, 125]
        ];

        const texture = new Uint8ClampedArray(TW * TH * 3);

        for (let y = 0; y < TH; y++) {
            for (let x = 0; x < TW; x++) {
                const lon = x / TW * TAU;
                const lat = (y / TH - 0.5) * Math.PI;

                const px = Math.cos(lat) * Math.cos(lon);
                const py = Math.sin(lat);
                const pz = Math.cos(lat) * Math.sin(lon);

                const n = terrain(
                    px * 3 + pz * 5.7,
                    py * 3 + pz * 2.3
                );

                const detail = terrain(
                    px * 14 + pz * 9,
                    py * 14 + pz * 6
                );

                const t = Math.min(
                    2.999,
                    Math.max(0, (n * 1.5 - 0.2 +
                    (detail - 0.5) * 0.5) * 3)
                );

                const index = Math.floor(t);
                const blend = t - index;

                const a = colors[index];
                const b = colors[index + 1];

                const offset = (y * TW + x) * 3;

                for (let k = 0; k < 3; k++) {
                    texture[offset + k] =
                        a[k] + (b[k] - a[k]) * blend;
                }
            }
        }

        const latitude = new Int16Array(SIZE * SIZE).fill(-1);
        const longitude = new Float32Array(SIZE * SIZE);
        const lighting = new Float32Array(SIZE * SIZE);

        for (let y = 0; y < SIZE; y++) {
            for (let x = 0; x < SIZE; x++) {
                const nx = (x - SIZE / 2) / radius;
                const ny = (y - SIZE / 2) / radius;
                const d2 = nx * nx + ny * ny;

                if (d2 > 1) continue;

                const nz = Math.sqrt(1 - d2);
                const i = y * SIZE + x;

                latitude[i] = Math.min(
                    TH - 1,
                    Math.floor(
                        (Math.asin(ny) / Math.PI + 0.5) * TH
                    )
                );

                longitude[i] = Math.atan2(nx, nz);

                const light = Math.max(
                    0,
                    -0.62 * nx - 0.3 * ny + 0.72 * nz
                );

                lighting[i] =
                    0.05 +
                    0.95 * Math.pow(light, 0.8);
            }
        }

        const image = ctx.createImageData(SIZE, SIZE);
        const pixels = image.data;

        let rotation = 0;
        let lastFrame = 0;
        let visible = true;

        if ("IntersectionObserver" in window) {
            new IntersectionObserver((entries) => {
                visible = entries[0].isIntersecting;
            }).observe(canvas);
        }

        function drawPlanet() {
            for (let i = 0; i < SIZE * SIZE; i++) {
                const offset = i * 4;

                if (latitude[i] < 0) {
                    pixels[offset + 3] = 0;
                    continue;
                }

                const u = Math.floor(
                    (((longitude[i] + rotation) / TAU % 1
                    + 1) % 1) * TW
                );

                const source =
                    (latitude[i] * TW + u) * 3;

                const light = lighting[i];

                pixels[offset] =
                    texture[source] * light;

                pixels[offset + 1] =
                    texture[source + 1] * light;

                pixels[offset + 2] =
                    texture[source + 2] * light;

                pixels[offset + 3] = 255;
            }

            ctx.putImageData(image, 0, 0);
        }

        drawPlanet();

        if (window.matchMedia(
            "(prefers-reduced-motion: reduce)"
        ).matches) {
            return;
        }

        function animate(now) {
            requestAnimationFrame(animate);

            if (document.hidden || !visible) return;

            // Limit rendering for better performance
            if (now - lastFrame < 85) return;

            lastFrame = now;
            rotation += 0.016;

            drawPlanet();
        }

        requestAnimationFrame(animate);
    }

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            initMarsPlanet,
            { once: true }
        );
    } else {
        initMarsPlanet();
    }
})();

const W=64,H=40,CELL=25,SPD=1.2,BUF=.2,$=id=>document.getElementById(id);
const BASE=[5,34],SITES={A:{n:'Delta Front',s:'Ancient river-delta deposits',p:[51,9],sci:9.4,ex:70},B:{n:'Séítah Ridge',s:'Layered ridge outcrops',p:[30,16],ex:45,sci:8.2}};
const CR=[[20,28,5],[34,22,4],[44,14,4],[14,14,5],[48,30,4],[26,8,3],[40,6,3]];
const E=[],SL=[],HZ=[],CL=[];
function buildTerrain(){for(let y=0;y<H;y++)for(let x=0;x<W;x++){let e=-2600+34*(Math.sin(x*.21)*Math.cos(y*.27)*.5+Math.sin(x*.07+y*.11)*.8+Math.sin(x*.5+y*.3)*.12)+18*x/W;let c=99;
for(const[cx,cy,r]of CR){const d=Math.hypot(x-cx,y-cy);c=Math.min(c,d-r);if(d<r)e-=26*(1-d/r);else if(d<r+1.3)e+=9}
E[y*W+x]=e;CL[y*W+x]=c;HZ[y*W+x]=c<0}
for(let y=0;y<H;y++)for(let x=0;x<W;x++){const g=(a,b)=>E[Math.min(H-1,Math.max(0,b))*W+Math.min(W-1,Math.max(0,a))];
const dx=(g(x+1,y)-g(x-1,y))/(2*CELL),dy=(g(x,y+1)-g(x,y-1))/(2*CELL);SL[y*W+x]=Math.atan(Math.hypot(dx,dy))*180/Math.PI}}
buildTerrain();
const mn=Math.min(...E),mx=Math.max(...E),stops=[[26,16,48],[155,70,110],[255,119,109],[244,182,165]];
const BC=E.map((e,i)=>{const t=(e-mn)/(mx-mn)*3,k=Math.min(2,Math.floor(t)),f=t-k,a=stops[k],b=stops[k+1],x=i%W,y=i/W|0;
const sh=((E[Math.max(0,y-1)*W+Math.max(0,x-1)]-E[Math.min(H-1,y+1)*W+Math.min(W-1,x+1)])*2.2);return a.map((v,j)=>Math.max(0,Math.min(255,v+(b[j]-v)*f+sh)))});
function astar(s,g,pr,maxS){maxS=maxS||(pr==='safe'?14:18);const id=(x,y)=>y*W+x,gs={},cf={},open=[[0,s[0],s[1]]];gs[id(...s)]=0;const closed=new Set();
while(open.length){let bi=0;for(let i=1;i<open.length;i++)if(open[i][0]<open[bi][0])bi=i;const[,x,y]=open.splice(bi,1)[0],k=id(x,y);
if(closed.has(k))continue;closed.add(k);if(x===g[0]&&y===g[1])break;
for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){if(!dx&&!dy)continue;const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=W||ny>=H)continue;const n=id(nx,ny);
if(HZ[n]||SL[n]>maxS)continue;const len=CELL*(dx&&dy?1.414:1),s2=(SL[k]+SL[n])/2;
const c=pr==='safe'?len*(1+s2/5+Math.max(0,5-CL[n])*.6):len*(1+s2/30);const ng=gs[k]+c;
if(gs[n]===undefined||ng<gs[n]){gs[n]=ng;cf[n]=k;open.push([ng+Math.hypot(nx-g[0],ny-g[1])*CELL,nx,ny])}}}
const ge=id(...g);if(gs[ge]===undefined)return maxS<22?astar(s,g,pr,22):null;
const cells=[];let c=ge;while(c!==undefined){cells.push([c%W,c/W|0]);c=cf[c]}cells.reverse();
const cumT=[0],cumD=[0];let ms=0,sa=0,mc=99;
for(let i=1;i<cells.length;i++){const[a,b]=[cells[i-1],cells[i]],len=CELL*(a[0]!==b[0]&&a[1]!==b[1]?1.414:1),s2=(SL[id(...a)]+SL[id(...b)])/2;
cumD.push(cumD[i-1]+len);cumT.push(cumT[i-1]+len/1000/SPD*60*(1+s2/15));ms=Math.max(ms,s2);sa+=s2;mc=Math.min(mc,CL[id(...b)])}
return{cells,cumT,cumD,dist:cumD.at(-1),time:cumT.at(-1),maxS:ms,avgS:sa/(cells.length-1),clr:Math.max(0,mc*CELL)}}
const S={dest:'A',time:360,pr:'safe',R:{},sim:null,layers:{elev:1,slope:1,haz:1,route:1,sites:1},tick:0};
const f0=n=>Math.round(n),fm=m=>f0(m)+' min';
function evalSite(k,pr){const r=astar(BASE,SITES[k].p,pr),ex=SITES[k].ex,tot=r.time*2+ex,buf=tot*BUF;return{r,ex,tot,buf,need:tot+buf}}
function plan(){for(const k in SITES){S.R[k]={safe:evalSite(k,'safe'),short:evalSite(k,'short')}}render()}
function cur(){return S.R[S.dest][S.pr]}
function render(){const c=cur(),T=S.time,go=c.need<=T,other=S.dest==='A'?'B':'A',o=S.R[other][S.pr];
$('tv').textContent=fm(T);$('tr').value=T;
$('optDest').innerHTML=Object.entries(SITES).map(([k,s])=>`<button data-k="${k}" class="${k===S.dest?'on':''}"><b>${s.n}</b><small>${s.s} · science ${s.sci}/10</small></button>`).join('');
$('decT').innerHTML=`<span class="${go?'go':'nogo'}">${go?'GO':'NO-GO'}</span>`;
let w=go?`${SITES[S.dest].n} fits: ${fm(c.need)} needed against ${fm(T)} available (${fm(T-c.need)} spare).`:`${SITES[S.dest].n} needs ${fm(c.need)} but only ${fm(T)} is available, a shortfall of ${fm(c.need-T)}.`;
$('decW').textContent=w;
const seg=[[c.r.time,'var(--cy)','Travel out'],[c.ex,'var(--vi)','Science'],[c.r.time,'var(--ro)','Return'],[c.buf,'var(--co)','Buffer 20%']],sum=Math.max(T,c.need);
$('bar').innerHTML=seg.map(s=>`<i style="width:${s[0]/sum*100}%;background:${s[1]}"></i>`).join('');
$('leg').innerHTML=seg.map(s=>`<span><u style="background:${s[1]}"></u>${s[2]} ${fm(s[0])}</span>`).join('');
const feas=Object.keys(SITES).filter(k=>S.R[k][S.pr].need<=T).sort((a,b)=>SITES[b].sci-SITES[a].sci);
$('rec').textContent=feas.length?`Recommendation: ${SITES[feas[0]].n}, the highest-science site that fits the time available.`+(!go&&feas.length?` Switch destination to complete a mission.`:''):`No site fits ${fm(T)}. The shortest option, ${SITES[o.need<c.need?other:S.dest].n}, needs ${fm(Math.min(o.need,c.need))}. Add time or shorten science.`;
$('optDest').querySelectorAll('button').forEach(b=>b.onclick=()=>{S.dest=b.dataset.k;render()});
$('segP').querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.p===S.pr));
const A=S.R[S.dest].safe,B=S.R[S.dest].short,row=(l,a,b)=>`<tr><td>${l}</td><td>${a}</td><td>${b}</td></tr>`;
$('rt').innerHTML=`<tr><th>${SITES[S.dest].n}</th><th>Safest${S.pr==='safe'?' (selected)':''}</th><th>Shortest${S.pr==='short'?' (selected)':''}</th></tr>`+
row('Distance',f0(A.r.dist)+' m',f0(B.r.dist)+' m')+row('One-way time',fm(A.r.time),fm(B.r.time))+row('Max slope',A.r.maxS.toFixed(1)+'°',B.r.maxS.toFixed(1)+'°')+row('Mean slope',A.r.avgS.toFixed(1)+'°',B.r.avgS.toFixed(1)+'°')+row('Closest hazard edge',f0(A.r.clr)+' m',f0(B.r.clr)+' m')+row('Total mission need',fm(A.need),fm(B.need));
const pick=cur().r,alt=(S.pr==='safe'?B:A).r;
$('why').textContent=`Selected route: ${S.pr==='safe'?'safest':'shortest'}. A* adds cost for slope${S.pr==='safe'?' and for closeness to crater rims':''}, and treats craters and slopes over ${S.pr==='safe'?14:18}° as blocked. Compared with the alternative it is ${f0(Math.abs(pick.dist-alt.dist))} m ${pick.dist>alt.dist?'longer':'shorter'} and keeps ${f0(Math.abs(pick.clr-alt.clr))} m ${pick.clr>=alt.clr?'more':'less'} clearance from hazards.`;
$('dt').innerHTML='<tr><th>Site</th><th>Science</th><th>Distance</th><th>Max slope</th><th>Need</th><th>Call</th></tr>'+Object.entries(SITES).map(([k,s])=>{const e=S.R[k][S.pr];return`<tr><td>${s.n}</td><td>${s.sci}</td><td>${f0(e.r.dist)} m</td><td>${e.r.maxS.toFixed(1)}°</td><td>${fm(e.need)}</td><td class="${e.need<=T?'go':'nogo'}">${e.need<=T?'GO':'NO-GO'}</td>`}).join('');
draw($('cv'),1);syncHelmet();}
function draw(cv,big){const g=cv.getContext('2d'),cs=cv.width/W,L=S.layers;g.clearRect(0,0,cv.width,cv.height);g.fillStyle='#0d0b1e';g.fillRect(0,0,cv.width,cv.height);
for(let i=0;i<W*H;i++){const x=i%W,y=i/W|0;if(L.elev){const c=BC[i];g.fillStyle=`rgb(${c[0]},${c[1]},${c[2]})`;g.fillRect(x*cs,y*cs,cs+.6,cs+.6)}
if(L.slope&&SL[i]>7){g.fillStyle=`rgba(155,124,255,${Math.min(.75,(SL[i]-7)/10)})`;g.fillRect(x*cs,y*cs,cs+.6,cs+.6)}
if(L.haz&&HZ[i]){g.fillStyle='rgba(8,8,18,.55)';g.fillRect(x*cs,y*cs,cs+.6,cs+.6)}}
if(L.haz){g.strokeStyle='#65E6E0';g.lineWidth=big?1.5:1;g.setLineDash([4,4]);CR.forEach(([x,y,r])=>{g.beginPath();g.arc((x+.5)*cs,(y+.5)*cs,r*cs,0,7);g.stroke()});g.setLineDash([])}
const line=(r,col,w,d)=>{g.strokeStyle=col;g.lineWidth=w;g.setLineDash(d||[]);g.beginPath();r.cells.forEach(([x,y],i)=>g[i?'lineTo':'moveTo']((x+.5)*cs,(y+.5)*cs));g.stroke();g.setLineDash([])};
if(L.route&&!S.sim){const sel=cur().r,alt=(S.pr==='safe'?S.R[S.dest].short:S.R[S.dest].safe).r;line(alt,'#F4B6A5',big?2:1.2,[6,5]);g.shadowColor='#65E6E0';g.shadowBlur=big?14:6;line(sel,'#65E6E0',big?4:2);g.shadowBlur=0}
if(S.sim){g.shadowColor='#65E6E0';g.shadowBlur=8;line({cells:S.sim.path},S.sim.phase==='emg'?'#FF776D':'#65E6E0',big?4:2.5);g.shadowBlur=0}
if(L.sites||!big){g.font=`${big?15:9}px Sora,sans-serif`;for(const[k,s]of Object.entries(SITES)){const[x,y]=s.p;g.fillStyle=k===S.dest?'#fff':'#F4B6A5';g.save();g.translate((x+.5)*cs,(y+.5)*cs);g.rotate(.785);g.fillRect(-cs*.5,-cs*.5,cs,cs);g.restore();if(big)g.fillText(s.n,(x+1.5)*cs,(y+.2)*cs)}
g.fillStyle='#9B7CFF';g.beginPath();g.arc((BASE[0]+.5)*cs,(BASE[1]+.5)*cs,cs*.9,0,7);g.fill();if(big){g.fillStyle='#fff';g.fillText('Base Camp',(BASE[0]+2)*cs,(BASE[1]+.3)*cs)}}
const p=S.sim?S.sim.path[S.sim.i]:BASE,pu=1+.25*Math.sin(S.tick/4);g.fillStyle='#65E6E0';g.shadowColor='#65E6E0';g.shadowBlur=14;g.beginPath();g.arc((p[0]+.5)*cs,(p[1]+.5)*cs,cs*.7*pu,0,7);g.fill();g.shadowBlur=0}
$('layers').innerHTML=[['elev','Elevation'],['slope','Slope'],['haz','Hazards'],['route','Routes'],['sites','Sites']].map(([k,n])=>`<button data-k="${k}" class="on">${n}</button>`).join('');
$('layers').querySelectorAll('button').forEach(b=>b.onclick=()=>{
    S.layers[b.dataset.k]^=1;
    b.classList.toggle('on');
    draw($('cv'),1);
});
$('tr').oninput=e=>{
    S.time=+e.target.value;
    render();
};
$('segP').querySelectorAll('button').forEach(b=>b.onclick=()=>{
    S.pr=b.dataset.p;
    render();
});
/* =====================================
   ORIGINAL TEAM HELMET INTEGRATION
   Member 5 Helmet
===================================== */

let helmetFrame = null;
let helmetReady = false;

// Send simulated mission results to helmet
function syncHelmet() {

    if (!helmetReady ||
        !helmetFrame?.contentWindow) {
        return;
    }

    const selected = cur();

    const result = {
        distanceMeters: selected.r.dist,

        routePoints: selected.r.cells
            .slice(0, 2)
            .map(([x, y]) => ({ x, y })),

        missionStatus:
            selected.need <= S.time
                ? "GO"
                : "NO-GO"
    };

    try {
        const helmet = helmetFrame.contentWindow;

        if (typeof helmet.updateHelmet === "function") {

            helmet.updateHelmet(result);

            $("helmetStatus").textContent =
                "Helmet connected to simulated mission results.";

        } else {

            $("helmetStatus").textContent =
                "Helmet loaded, but updateHelmet() was not found.";
        }

    } catch (error) {

        $("helmetStatus").textContent =
            "Helmet opened, but data sharing is unavailable.";

        console.warn(error);
    }
}

// Load Member 5 original helmet
const loadHelmetButton = $("loadHelmet");

if (loadHelmetButton) {

    loadHelmetButton.addEventListener(
        "click",
        function () {

            if (helmetFrame) return;

            const mount = $("helmetMount");

            const iframe = document.createElement("iframe");

            iframe.src = "helmet/helmet.html";

            iframe.title = "Original MarsWalk Smart Helmet";

            iframe.loading = "eager";

            iframe.style.cssText = `
                display: block;
                width: 100%;
                height: 540px;
                border: 1px solid rgba(155,124,255,.4);
                border-radius: 18px;
                background: #080812;
            `;

            iframe.addEventListener("load", function () {

                helmetReady = true;

                syncHelmet();
            });

            mount.replaceChildren(iframe);

            helmetFrame = iframe;

            loadHelmetButton.disabled = true;

            $("helmetStatus").textContent =
                "Loading the original helmet...";
        }
    );
}

// Initialize mission planner
plan();


