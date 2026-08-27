// The same shape as the editor's tests: one line per claim, and the detail is
// the measurement, not a restatement of the claim.

let failures = 0;

export function check(ok, label, detail = '') {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

/** Did `fn` refuse, and does the message read like something you'd show a person? */
export function refuses(fn, label, match = null) {
  try {
    fn();
    check(false, label, 'it was accepted');
  } catch (e) {
    const readable = e instanceof Error && e.message.length > 8 && !/undefined|null|\[object/.test(e.message);
    const right = !match || match.test(e.message);
    check(readable && right, label, JSON.stringify(e.message));
  }
}

export function done(name) {
  console.log(failures ? `\n${name}: ${failures} failing check(s)` : `\n${name}: all checks passed`);
  process.exit(failures ? 1 : 0);
}
