// Which triple-Milnor-invariant assignments survive a given symmetry?
//
// Setup. Components 0..3. mu is an integer-valued function on ORDERED triples
// of distinct components, ALTERNATING (swap two indices, flip the sign). A
// symmetry acting on components by the permutation s gives
//     mu(s i, s j, s k) = eps_i eps_j eps_k * mu(i,j,k),
// where eps_i = +-1 records whether the symmetry preserves the chosen
// orientation of component i.
//
// All eps can be taken +1. The orientation data is an equivariant +-1 bundle
// over the components; it is classified by Hom(stabiliser, +-1), and every
// stabiliser here has ODD order (3 for the tetrahedral action, 1 for C4), which
// admits no non-trivial map to +-1. So the bundle is trivial and orientations
// can be chosen equivariantly. That is why no sign bookkeeping survives below.
//
// Basis: the four 3-subsets, written in increasing order.
//   x0 = mu(1,2,3)   x1 = mu(0,2,3)   x2 = mu(0,1,3)   x3 = mu(0,1,2)

const SUBSETS = [[1,2,3],[0,2,3],[0,1,3],[0,1,2]];
const key = (t) => [...t].sort((a,b)=>a-b).join('');
const INDEX = new Map(SUBSETS.map((t,i)=>[key(t),i]));

/** Sorting parity: +1 if an even number of swaps sorts the triple. */
function parity(t) {
  let p = 1, a = [...t];
  for (let i=0;i<a.length;i++) for (let j=i+1;j<a.length;j++) if (a[i]>a[j]) { [a[i],a[j]]=[a[j],a[i]]; p=-p; }
  return p;
}

const perms = (a) => a.length <= 1 ? [a] : a.flatMap((x,i)=>perms([...a.slice(0,i),...a.slice(i+1)]).map(r=>[x,...r]));
const sgn = (p) => parity(p);
const ALL = perms([0,1,2,3]);
const A4 = ALL.filter(p => sgn(p) === 1);                 // tetrahedral rotations
const C4 = [[0,1,2,3],[1,2,3,0],[2,3,0,1],[3,0,1,2]];     // the 4-cycle, as images of 0,1,2,3

/** Solution space of { mu(s i,s j,s k) = mu(i,j,k) } over the rationals. */
function invariants(group, label) {
  const rows = [];
  for (const s of group) {
    for (const t of SUBSETS) {
      const img = t.map(i => s[i]);
      const lhs = INDEX.get(key(img)), lsign = parity(img);
      const rhs = INDEX.get(key(t)),   rsign = parity(t);
      const row = [0,0,0,0];
      row[lhs] += lsign; row[rhs] -= rsign;
      if (row.some(v => v !== 0)) rows.push(row);
    }
  }
  // Gaussian elimination to get the rank.
  const M = rows.map(r => [...r]);
  let rank = 0;
  for (let c = 0; c < 4 && rank < M.length; c++) {
    let piv = M.findIndex((r,i) => i >= rank && r[c] !== 0);
    if (piv < 0) continue;
    [M[rank], M[piv]] = [M[piv], M[rank]];
    for (let i = 0; i < M.length; i++) {
      if (i !== rank && M[i][c] !== 0) {
        const f = M[i][c] / M[rank][c];
        for (let k = 0; k < 4; k++) M[i][k] -= f * M[rank][k];
      }
    }
    rank++;
  }
  const dim = 4 - rank;
  console.log(`${label.padEnd(26)} order ${String(group.length).padStart(2)}   solution space dimension ${dim}`);
  if (dim > 0) {
    // exhibit a non-zero solution with entries in {-1,0,1} if one exists
    for (const cand of [[1,1,1,1],[-1,1,-1,1],[1,-1,1,-1],[-1,-1,-1,-1]]) {
      const ok = rows.every(r => r.reduce((s,v,i)=>s+v*cand[i],0) === 0);
      if (ok) { console.log(`${' '.repeat(26)} e.g. (x0,x1,x2,x3) = (${cand.join(', ')})  -> every triple can be Borromean`); break; }
    }
  } else {
    console.log(`${' '.repeat(26)} ONLY the zero solution -> no triple can be Borromean. OBSTRUCTED.`);
  }
}

invariants(A4, 'tetrahedral (A4), n=4');
invariants(C4, 'cyclic C4, n=4');
invariants([[1,0,2,3],[0,1,2,3]], 'a single transposition');
