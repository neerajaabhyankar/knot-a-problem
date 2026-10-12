// Draw link diagrams the way they are drawn by hand.
//
// Three things make a picture a diagram rather than a projection, and all three
// are enforced here rather than hoped for.
//
//  1. EXACTLY TWO STRANDS AT A CROSSING, and crossings well separated from one
//     another and from the corners.
//  2. NO NEAR MISSES. Two strands that do not cross must not appear to touch.
//     This is a property of the viewing direction, so it is part of what the
//     direction search optimises -- not something a thicker pen can fix.
//  3. A BREAK IN THE UNDER-STRAND, long enough to read. How long depends on the
//     ANGLE: two strands meeting at a shallow angle need a much longer break
//     than two meeting squarely, because the erased length is measured along
//     the under-strand while the gap the eye wants is measured across the
//     over-strand. The erased half-length is (w/2 + g)/sin(theta).
//
// Over and under are carried by the break alone, so every figure reads in
// greyscale; colour only tells the components apart.

const PT = 1/28.45;                               // TeX points per centimetre

const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const cross3=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const unit=(a)=>{const m=Math.hypot(...a);return [a[0]/m,a[1]/m,a[2]/m];};
const sub2=(a,b)=>[a[0]-b[0],a[1]-b[1]];
const asPoints=(r)=>Array.isArray(r)?r:r.points;

function frame(d){
  const w=unit(d);
  const s=Math.abs(w[0])<0.9?[1,0,0]:[0,1,0];
  const u=unit(cross3(s,w));
  return {u,v:cross3(w,u),w};
}

function flatten(rings,dir){
  const {u,v,w}=frame(dir);
  return rings.map(asPoints).map(pts=>({
    xy:pts.map(p=>[dot(p,u),dot(p,v)]),
    h :pts.map(p=>dot(p,w)),
  }));
}

function segments(flat){
  const segs=[];
  flat.forEach((f,ci)=>{
    const n=f.xy.length;
    for(let i=0;i<n;i++) segs.push({ci,i,n,a:f.xy[i],b:f.xy[(i+1)%n],ha:f.h[i],hb:f.h[(i+1)%n]});
  });
  return segs;
}

/** Do these two segments share a corner (so they are allowed to touch)? */
const adjacent=(S,T)=> S.ci===T.ci && (Math.abs(S.i-T.i)<=1 || Math.abs(S.i-T.i)>=S.n-1);

/** Distance between two 2D segments. */
function segDist2(S,T){
  const u=sub2(S.b,S.a), v=sub2(T.b,T.a), w=sub2(S.a,T.a);
  const a=u[0]*u[0]+u[1]*u[1], b=u[0]*v[0]+u[1]*v[1], c=v[0]*v[0]+v[1]*v[1];
  const d=u[0]*w[0]+u[1]*w[1], e=v[0]*w[0]+v[1]*w[1];
  const D=a*c-b*b;
  let s=D<1e-14?0:(b*e-c*d)/D; s=Math.max(0,Math.min(1,s));
  let t=Math.max(0,Math.min(1,(b*s+e)/(c>1e-14?c:1)));
  s=Math.max(0,Math.min(1,(b*t-d)/(a>1e-14?a:1)));
  return Math.hypot(w[0]+s*u[0]-t*v[0], w[1]+s*u[1]-t*v[1]);
}

function crossings(segs){
  const out=[];
  for(let x=0;x<segs.length;x++) for(let y=x+1;y<segs.length;y++){
    const S=segs[x],T=segs[y];
    if(adjacent(S,T)) continue;
    const r=sub2(S.b,S.a), s=sub2(T.b,T.a);
    const den=r[0]*s[1]-r[1]*s[0];
    if(Math.abs(den)<1e-12) continue;
    const q=sub2(T.a,S.a);
    const t=(q[0]*s[1]-q[1]*s[0])/den, u=(q[0]*r[1]-q[1]*r[0])/den;
    if(t<=1e-9||t>=1-1e-9||u<=1e-9||u>=1-1e-9) continue;
    const hS=S.ha+(S.hb-S.ha)*t, hT=T.ha+(T.hb-T.ha)*u;
    out.push({
      at:[S.a[0]+r[0]*t, S.a[1]+r[1]*t],
      sinA:Math.abs(den)/(Math.hypot(...r)*Math.hypot(...s)),
      over:hS>hT?x:y, under:hS>hT?y:x, tS:t, tT:u, x, y,
    });
  }
  return out;
}

function directions(count){
  const g=Math.PI*(3-Math.sqrt(5));
  return Array.from({length:count},(_,i)=>{
    const z=1-(2*i+1)/count, r=Math.sqrt(Math.max(0,1-z*z)), a=g*i;
    return [r*Math.cos(a), r*Math.sin(a), z];
  });
}

function measure(flat,segs,X){
  const all=flat.flatMap(f=>f.xy);
  const diam=Math.max(
    Math.max(...all.map(p=>p[0]))-Math.min(...all.map(p=>p[0])),
    Math.max(...all.map(p=>p[1]))-Math.min(...all.map(p=>p[1])), 1e-9);

  let crossSep=Infinity;
  for(let i=0;i<X.length;i++) for(let j=i+1;j<X.length;j++)
    crossSep=Math.min(crossSep, Math.hypot(X[i].at[0]-X[j].at[0], X[i].at[1]-X[j].at[1]));

  let cornerSep=Infinity;
  for(const c of X) for(const s of segs)
    cornerSep=Math.min(cornerSep, Math.hypot(c.at[0]-s.a[0], c.at[1]-s.a[1]));

  // near misses: segments that do NOT cross must stay apart
  const crossed=new Set(X.map(c=>`${c.x},${c.y}`));
  let nearMiss=Infinity;
  for(let x=0;x<segs.length;x++) for(let y=x+1;y<segs.length;y++){
    if(adjacent(segs[x],segs[y])||crossed.has(`${x},${y}`)) continue;
    nearMiss=Math.min(nearMiss, segDist2(segs[x],segs[y]));
  }

  const minAngle=X.length?Math.min(...X.map(c=>c.sinA)):1;
  return {diam, crossSep:crossSep/diam, cornerSep:cornerSep/diam, nearMiss:nearMiss/diam, minAngle};
}

/**
 * Pick a viewing direction. Fewest crossings first; among those, the one whose
 * worst feature is least bad. Near misses are weighted hardest because they are
 * the failure the eye notices first.
 */
export function choose(rings,{samples=6000,tolerance=0,minAngle=0.26}={}){
  const cand=[];
  let least=Infinity;
  for(const d of directions(samples)){
    const flat=flatten(rings,d), segs=segments(flat), X=crossings(segs);
    const m=measure(flat,segs,X);
    if(m.minAngle<minAngle) continue;
    if(!isFinite(m.crossSep)&&X.length>1) continue;
    cand.push({d,flat,segs,X,m});
    if(X.length<least) least=X.length;
  }
  let best=null;
  for(const c of cand){
    if(c.X.length>least+tolerance) continue;
    const score=Math.min(c.m.crossSep*1.0, c.m.cornerSep*1.0, c.m.nearMiss*1.6, c.m.minAngle*0.14);
    if(!best||score>best.score) best={...c,score};
  }
  return best;
}

/**
 * Draw a set of closed 2D polylines with gaps cut out of them.
 *
 * The gaps are measured in ARC LENGTH along the component, not along the one
 * segment that happens to contain the crossing. That distinction is the whole
 * of this function: on a curve approximated by many short segments a gap wider
 * than one segment is the normal case, and a per-segment implementation
 * silently truncates every break to nothing.
 *
 * @param comps  [{pts: [[x,y],...], col}]  closed, already in centimetres
 * @param cuts   [{ci, s, half}]            arc-length centre and half-width
 */
export function drawCut(comps, cuts, { lw = 1.6, minPiece = 0.13, name }) {
  // A visible piece shorter than minPiece is a stub: it happens when two
  // crossings sit so close that the break for one nearly meets the break for
  // the other. A hand illustrator would merge the two breaks rather than leave
  // a fleck of ink between them, and so does this.
  const out = [];
  comps.forEach((comp, ci) => {
    const pts = comp.pts, n = pts.length;
    const seg = [], acc = [0];
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      seg.push(d); acc.push(acc[i] + d);
    }
    const total = acc[n];
    const at = (s) => {                       // point at arc length s
      s = ((s % total) + total) % total;
      let i = 0; while (i < n - 1 && acc[i + 1] < s) i++;
      const t = seg[i] > 1e-12 ? (s - acc[i]) / seg[i] : 0;
      const a = pts[i], b = pts[(i + 1) % n];
      return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], i };
    };

    // hidden intervals, merged
    let hid = cuts.filter((c) => c.ci === ci)
      .map((c) => [c.s - c.half, c.s + c.half])
      .sort((x, y) => x[0] - y[0]);
    const merged = [];
    for (const h of hid) {
      if (merged.length && h[0] <= merged[merged.length - 1][1]) {
        merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], h[1]);
      } else merged.push([...h]);
    }
    if (!merged.length) {
      out.push(`\\draw[${comp.col},line width=${lw}pt,line join=round] ` +
        pts.map((p) => `(${p[0].toFixed(4)},${p[1].toFixed(4)})`).join('--') + `--cycle;`);
      return;
    }
    // visible runs are the gaps between consecutive hidden intervals
    for (let k = 0; k < merged.length; k++) {
      const from = merged[k][1], to = merged[(k + 1) % merged.length][0] + (k + 1 === merged.length ? total : 0);
      const len = to - from;
      if (len < minPiece) continue;
      const A = at(from), B = at(to);
      const path = [A.p];
      let i = (A.i + 1) % n, guard = 0;
      while (guard++ < n) {
        const sv = acc[i];
        const sNorm = ((sv - from) % total + total) % total;
        if (sNorm >= len) break;
        path.push(pts[i]); i = (i + 1) % n;
      }
      path.push(B.p);
      out.push(`\\draw[${comp.col},line width=${lw}pt,line cap=round,line join=round] ` +
        path.map((p) => `(${p[0].toFixed(4)},${p[1].toFixed(4)})`).join('--') + `;`);
    }
  });
  globalThis.__fs.writeFileSync(name,
    `% generated by make-diagram.mjs -- do not edit\n\\begin{tikzpicture}\n${out.join('\n')}\n\\end{tikzpicture}\n`);
  return out.length;
}

/**
 * Emit TikZ at a stated physical width, so the line weights in the file are the
 * line weights on the page and nothing is rescaled afterwards.
 */
export function tikz(best, { cols, width = 11, lw = 1.6, gap = 0.075, minPiece = 0.13, name }) {
  const { flat, segs, X, m } = best;
  const scale = width / m.diam;
  const lwCm = lw * PT;

  const comps = flat.map((f, ci) => ({ col: cols[ci], pts: f.xy.map((p) => [p[0] * scale, p[1] * scale]) }));

  // arc-length offset of the start of each segment, per component
  const offset = new Map();
  comps.forEach((c, ci) => {
    let a = 0;
    c.pts.forEach((p, i) => {
      const q = c.pts[(i + 1) % c.pts.length];
      offset.set(`${ci},${i}`, a);
      a += Math.hypot(q[0] - p[0], q[1] - p[1]);
    });
  });

  const cuts = X.map((c) => {
    const idx = c.under, s0 = segs[idx];
    const t = idx === c.x ? c.tS : c.tT;
    const segLen = Math.hypot(s0.b[0] - s0.a[0], s0.b[1] - s0.a[1]) * scale;
    return {
      ci: s0.ci,
      s: offset.get(`${s0.ci},${s0.i}`) + t * segLen,
      half: (lwCm / 2 + gap) / Math.max(c.sinA, 1e-6),
    };
  });

  drawCut(comps, cuts, { lw, minPiece, name });
  return { crossings: X.length, widthCm: width, ...m };
}

