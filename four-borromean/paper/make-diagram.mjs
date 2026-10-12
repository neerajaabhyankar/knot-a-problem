// Draw link diagrams the way they are drawn by hand.
//
// A knot or link diagram has three properties this renderer enforces rather
// than hopes for:
//
//   1. every crossing involves exactly two strands -- no triple points;
//   2. crossings are well separated from each other and from the corners, so
//      the picture never piles up;
//   3. the under-strand is BROKEN by a visible gap, and the break is the only
//      thing that encodes under/over.
//
// Colour carries no information here. Print it in greyscale and it still reads.
//
// The projection direction is searched for, not assumed: among directions that
// give a valid diagram, we keep the one whose worst feature -- closest pair of
// crossings, closest crossing-to-corner, shallowest crossing angle -- is as
// good as possible. That is what buys property 2.
import { writeFileSync } from 'node:fs';

const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const cross3=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const unit=(a)=>{const m=Math.hypot(...a);return [a[0]/m,a[1]/m,a[2]/m];};

function frame(d){
  const w=unit(d);
  const s=Math.abs(w[0])<0.9?[1,0,0]:[0,1,0];
  const u=unit(cross3(s,w));
  return {u,v:cross3(w,u),w};
}

/** Flatten to 2D, keeping the height that decides which strand is on top. */
/** Accept either raw point arrays or knotlib curve objects. */
const asPoints = (r) => Array.isArray(r) ? r : r.points;

function flatten(rings, dir){
  const {u,v,w}=frame(dir);
  return rings.map(r=>asPoints(r)).map(pts=>({
    xy: pts.map(p=>[dot(p,u),dot(p,v)]),
    h : pts.map(p=>dot(p,w)),
  }));
}

/** Every segment of every ring, tagged with which ring and which edge. */
function segments(flat){
  const segs=[];
  flat.forEach((f,ci)=>{
    const n=f.xy.length;
    for(let i=0;i<n;i++) segs.push({ci,i,a:f.xy[i],b:f.xy[(i+1)%n],ha:f.h[i],hb:f.h[(i+1)%n]});
  });
  return segs;
}

/** All crossings, with the parameter along each segment and which is on top. */
function crossings(segs){
  const out=[];
  for(let x=0;x<segs.length;x++) for(let y=x+1;y<segs.length;y++){
    const S=segs[x], T=segs[y];
    if(S.ci===T.ci){
      const n=segs.filter(s=>s.ci===S.ci).length;
      const d=Math.abs(S.i-T.i);
      if(d<=1||d>=n-1) continue;              // neighbouring edges share a corner
    }
    const r=sub2(S.b,S.a), s=sub2(T.b,T.a);
    const den=r[0]*s[1]-r[1]*s[0];
    if(Math.abs(den)<1e-12) continue;          // parallel
    const q=sub2(T.a,S.a);
    const t=(q[0]*s[1]-q[1]*s[0])/den;
    const uu=(q[0]*r[1]-q[1]*r[0])/den;
    if(t<=1e-9||t>=1-1e-9||uu<=1e-9||uu>=1-1e-9) continue;
    const at=[S.a[0]+r[0]*t, S.a[1]+r[1]*t];
    const hS=S.ha+(S.hb-S.ha)*t, hT=T.ha+(T.hb-T.ha)*uu;
    const sinA=Math.abs(den)/(Math.hypot(...r)*Math.hypot(...s));
    out.push({at,sinA,over:hS>hT?x:y,under:hS>hT?y:x,tS:t,tT:uu,x,y});
  }
  return out;
}
const sub2=(a,b)=>[a[0]-b[0],a[1]-b[1]];

function directions(count){
  const g=Math.PI*(3-Math.sqrt(5));
  return Array.from({length:count},(_,i)=>{
    const z=1-(2*i+1)/count, r=Math.sqrt(Math.max(0,1-z*z)), a=g*i;
    return [r*Math.cos(a), r*Math.sin(a), z];
  });
}

/** How good does this direction look as a drawing? Bigger is better. */
function quality(flat,segs,X){
  const all=flat.flatMap(f=>f.xy);
  const w=Math.max(...all.map(p=>p[0]))-Math.min(...all.map(p=>p[0]));
  const h=Math.max(...all.map(p=>p[1]))-Math.min(...all.map(p=>p[1]));
  const diam=Math.max(w,h,1e-9);
  let minSep=Infinity;
  for(let i=0;i<X.length;i++) for(let j=i+1;j<X.length;j++)
    minSep=Math.min(minSep,Math.hypot(X[i].at[0]-X[j].at[0],X[i].at[1]-X[j].at[1]));
  let minCorner=Infinity;
  for(const c of X) for(const s of segs){
    minCorner=Math.min(minCorner,Math.hypot(c.at[0]-s.a[0],c.at[1]-s.a[1]));
  }
  const minAngle=Math.min(...X.map(c=>c.sinA));
  return { score: Math.min(minSep/diam, minCorner/diam, minAngle*0.22), minSep:minSep/diam, minCorner:minCorner/diam, minAngle, diam };
}

/** Pick a direction: fewest crossings first, then the cleanest-looking one. */
export function choose(rings,{samples=4000,tolerance=0}={}){
  let best=null, minN=Infinity;
  const cand=[];
  for(const d of directions(samples)){
    const flat=flatten(rings,d), segs=segments(flat), X=crossings(segs);
    const q=quality(flat,segs,X);
    if(!isFinite(q.score)||q.minAngle<0.08) continue;
    cand.push({d,flat,segs,X,q});
    if(X.length<minN) minN=X.length;
  }
  for(const c of cand){
    if(c.X.length>minN+tolerance) continue;
    if(!best||c.q.score>best.q.score) best=c;
  }
  return best;
}

/** TikZ, with the under-strand broken at every crossing it passes beneath. */
export function tikz(best,{cols,scale=1,lw=1.5,gap=0.11,name}){
  const {flat,segs,X}=best;
  const breaks=new Map();                       // segment index -> parameters
  for(const c of X){
    const t=c.under===c.x?c.tS:c.tT;
    if(!breaks.has(c.under)) breaks.set(c.under,[]);
    breaks.get(c.under).push(t);
  }
  const f=(x)=>(x*scale).toFixed(3);
  const lines=[];
  segs.forEach((s,idx)=>{
    const len=Math.hypot(s.b[0]-s.a[0],s.b[1]-s.a[1])*scale;
    const half=Math.min(gap/Math.max(len,1e-9), 0.42);
    const cuts=(breaks.get(idx)??[]).sort((p,q)=>p-q);
    // the visible pieces of this segment: [0,1] minus a window at each break
    let pieces=[[0,1]];
    for(const t of cuts){
      const lo=t-half, hi=t+half;
      pieces=pieces.flatMap(([p,q])=>{
        if(hi<=p||lo>=q) return [[p,q]];
        const out=[];
        if(lo>p) out.push([p,Math.max(p,lo)]);
        if(hi<q) out.push([Math.min(q,hi),q]);
        return out;
      });
    }
    const P=(t)=>[s.a[0]+(s.b[0]-s.a[0])*t, s.a[1]+(s.b[1]-s.a[1])*t];
    for(const [p,q] of pieces){
      if(q-p<1e-4) continue;
      const A=P(p), B=P(q);
      lines.push(`\\draw[${cols[s.ci]},line width=${lw}pt,line cap=round] (${f(A[0])},${f(A[1])})--(${f(B[0])},${f(B[1])});`);
    }
  });
  writeFileSync(name,`% generated by make-diagram.mjs -- do not edit\n\\begin{tikzpicture}\n${lines.join('\n')}\n\\end{tikzpicture}\n`);
  return {crossings:X.length, ...best.q};
}
