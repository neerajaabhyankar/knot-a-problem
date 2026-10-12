// Can the "one crossing per pair per vertex" model work at all?
//
// Model. Component K_i sits on face F_i (the face opposite vertex v_i). The
// three components meeting at vertex v_k are {K_i : i != k}, and we suppose
// each pair of them crosses ONCE there. Two faces F_i, F_j share an edge whose
// endpoints are the two vertices v_k, v_l with {k,l} the complement of {i,j},
// so each PAIR of components crosses exactly twice in total, once at each of
// those two vertices. That is 4 vertices x 3 crossings = 12 crossings, the
// fewest any link satisfying the two conditions could possibly have.
//
// The stabiliser of v_k in T is a 3-fold rotation, which permutes the three
// components there cyclically. An over/under relation invariant under a 3-cycle
// cannot be a total order, so it must be a CYCLIC order -- and there are
// exactly two of those. Transitivity of T on the vertices then propagates the
// choice at one vertex to all four. So there are exactly two models to test.
//
// For a pair to have linking number 0 with only two crossings, the SAME
// component must be the over-strand at both of them.

const V = [null, [1,1,1], [1,-1,-1], [-1,1,-1], [-1,-1,1]];
const key = (p) => p.map(x => Math.round(x)).join(',');
const idOf = (p) => [1,2,3,4].find(i => key(V[i]) === key(p));

// +120 degrees about the (1,1,1) axis.
const R1 = ([x,y,z]) => [z,x,y];
// the half-turns; U[i] carries v1 to v_i
const U = { 1: (p)=>p, 2: ([x,y,z])=>[x,-y,-z], 3: ([x,y,z])=>[-x,y,-z], 4: ([x,y,z])=>[-x,-y,z] };
const comp = (f,g) => (p) => f(g(p));

/** The +120 rotation about the axis through v_k, as a permutation of vertices. */
function rotAt(k) {
  const r = comp(U[k], comp(R1, U[k]));          // U_k R U_k^{-1}, and U_k^{-1} = U_k
  const perm = {};
  for (const i of [1,2,3,4]) perm[i] = idOf(r(V[i]));
  return perm;
}

for (const k of [1,2,3,4]) {
  const p = rotAt(k);
  console.log(`rotation about v${k}:  ` + [1,2,3,4].map(i=>`${i}->${p[i]}`).join('  '));
}

/** Cyclic order of components at vertex k, as the orbit of the rotation there. */
function cyclicAt(k) {
  const p = rotAt(k);
  const start = [1,2,3,4].find(i => i !== k);
  return [start, p[start], p[p[start]]];           // components, in cyclic order
}

/** In cyclic order (a,b,c): a is over b, b over c, c over a. */
const overIn = (cyc, i, j) => {
  const pos = cyc.indexOf(i), nxt = cyc[(pos+1)%3];
  return nxt === j;          // true means i is over j
};

console.log('\npair      vertices   who is over      verdict');
for (const [i,j] of [[1,2],[1,3],[1,4],[2,3],[2,4],[3,4]]) {
  const [k,l] = [1,2,3,4].filter(x => x !== i && x !== j);
  for (const reverse of [false, true]) {
    const ck = reverse ? cyclicAt(k).slice().reverse() : cyclicAt(k);
    const cl = reverse ? cyclicAt(l).slice().reverse() : cyclicAt(l);
    const atK = overIn(ck,i,j) ? i : j;
    const atL = overIn(cl,i,j) ? i : j;
    if (!reverse) process.stdout.write(`{${i},${j}}      v${k},v${l}      K${atK} / K${atL}`);
    else console.log(`      ${atK===atL ? 'lk = 0' : 'CLASPED, lk = +-1'}   (reversed: K${atK}/K${atL} ${atK===atL?'lk=0':'CLASPED'})`);
  }
}
