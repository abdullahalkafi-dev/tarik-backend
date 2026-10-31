// End-to-end API smoke test: the same calls the app and the dashboard make, against a LOCAL backend with the
// seeded development accounts (never run it against production).
//   1) start the backend (npm run dev)  2) fund the seeded helper: scripts/dev-credit-wallet.ts 0612345671 500
//   3) API_URL=http://127.0.0.1:5000/api/v1 node scripts/smoke-api.js
const fs = require('fs');
const BASE = process.env.API_URL || 'http://127.0.0.1:5000/api/v1';
const env = Object.fromEntries(
  fs.readFileSync('C:/Users/kafik/Desktop/root/Abdullah/2026-Goals/rasul vai/tarik/tarik-backend/.env', 'utf8')
    .split(/\r?\n/).filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => [l.split('=')[0], l.slice(l.indexOf('=') + 1)]));
const RUN = Date.now();
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) { pass++; console.log('PASS ', name); } else { fail++; console.log('FAIL ', name, extra); } };
const call = async (method, path, token, body) => {
  const res = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json, data: json && json.data };
};
(async () => {
  // --- sign in
  const cl = await call('POST', '/auth/phone-login', null, { phone: '0698765431', password: 'Test@1234' });
  ok('client signs in with phone + password', cl.status === 200 && cl.data?.accessToken, JSON.stringify(cl.json).slice(0, 160));
  const he = await call('POST', '/auth/phone-login', null, { phone: '0612345671', password: 'Test@1234' });
  ok('seeded helper signs in', he.status === 200 && he.data?.accessToken, JSON.stringify(he.json).slice(0, 160));
  if (!cl.data || !he.data) return;
  const C = cl.data.accessToken, H = he.data.accessToken;

  // --- public config and categories
  const cfg = await call('GET', '/config');
  ok('public config', cfg.status === 200 && typeof cfg.data.platformFeePercentage === 'number');
  const cats = await call('GET', '/categories?lang=fr');
  ok('categories load (localised)', cats.status === 200 && cats.data.length > 0);
  const cat = cats.data[0];

  // --- profile
  const meC = await call('GET', '/user/me', C);
  ok('client profile', meC.status === 200 && meC.data.notificationPrefs);
  const meH = await call('GET', '/user/me', H);
  ok('helper profile is approved', meH.data?.helperApplicationStatus === 'approved', meH.data?.helperApplicationStatus);

  // --- notification prefs + availability
  const np = await call('PATCH', '/user/me', H, { notificationPrefs: { payments: false } });
  ok('notification switch saved', np.status === 200, JSON.stringify(np.json).slice(0, 140));
  const meH2 = await call('GET', '/user/me', H);
  ok('notification switch is returned', meH2.data?.notificationPrefs?.payments === false);
  await call('PATCH', '/user/me', H, { notificationPrefs: { payments: true } });
  const off = await call('PATCH', '/user/availability', H, { isAvailable: false });
  ok('helper goes off duty', off.status === 200 && off.data?.isAvailable === false, JSON.stringify(off.json).slice(0, 120));
  const on = await call('PATCH', '/user/availability', H, { isAvailable: true });
  ok('helper goes on duty', on.status === 200 && on.data?.isAvailable === true);

  // --- post a job (hourly, cash) and see it as the helper
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const job = await call('POST', '/jobs', C, {
    title: 'Smoke test cleaning', description: 'x', date: tomorrow, startTime: '9:00 AM', endTime: '12:00 PM',
    budget: Math.max(60, cat.minHourlyRate || 0), budgetType: 'hourly', paymentMethod: 'cash',
    address: '12 Rue Test, Rabat', longitude: -6.85, latitude: 33.99, category: cat._id,
  });
  ok('client posts an hourly cash job', job.status === 201 || job.status === 200, JSON.stringify(job.json).slice(0, 200));
  if (!job.data) return;
  const jobId = job.data._id || job.data.id;
  ok('server computed the total (rate x 3 h)', job.data.hours === 3 && job.data.budget === (job.data.hourlyRate * 3), JSON.stringify({ h: job.data.hours, b: job.data.budget, r: job.data.hourlyRate }));
  const nearby = await call('GET', '/jobs/nearby?lat=33.99&lon=-6.85&maxDistance=30000', H);
  const seen = (nearby.data?.docs || nearby.data?.jobs || nearby.data || []).find?.((j) => (j._id || j.id) === jobId);
  ok('helper sees the job nearby', !!seen, JSON.stringify(nearby.json).slice(0, 200));
  ok('nearby job hides client phone / e-mail', seen && !JSON.stringify(seen).includes('omar.client') && !seen.postedBy?.phone);

  // --- accept, travel, arrive, finish, complete
  const acc = await call('POST', `/jobs/${jobId}/accept`, H);
  ok('helper accepts', acc.status === 200, JSON.stringify(acc.json).slice(0, 200));
  const ow = await call('POST', `/jobs/${jobId}/on-the-way`, H);
  ok('helper: on the way', ow.status === 200, JSON.stringify(ow.json).slice(0, 160));
  const ar = await call('POST', `/jobs/${jobId}/arrived`, H);
  ok('helper: arrived', ar.status === 200, JSON.stringify(ar.json).slice(0, 160));
  const fin = await call('POST', `/jobs/${jobId}/finish`, H);
  ok('helper: work finished', fin.status === 200, JSON.stringify(fin.json).slice(0, 160));
  const comp = await call('POST', `/jobs/${jobId}/complete`, C, {});
  ok('client confirms completion', comp.status === 200, JSON.stringify(comp.json).slice(0, 160));
  const priv = await call('GET', `/jobs/${jobId}`, C);
  ok('client sees the helper after acceptance', priv.status === 200);
  const revee = priv.data?.assignedTo?._id || priv.data?.assignedTo;

  // --- review
  const rv = await call('POST', '/reviews', C, { jobId, revieweeId: revee, rating: 5, comment: 'Great job, very careful' });
  ok('client reviews the helper', rv.status === 201 || rv.status === 200, JSON.stringify(rv.json).slice(0, 160));
  const rid = rv.data?._id;
  const rep = await call('POST', `/reviews/${rid}/reply`, H, { text: 'Thank you!' });
  ok('helper replies publicly', rep.status === 200 || rep.status === 201, JSON.stringify(rep.json).slice(0, 140));
  const list = await call('GET', `/reviews/user/${revee}`, C);
  ok('reply is returned in the public list', JSON.stringify(list.data).includes('Thank you!'));

  // --- wallet
  const wb = await call('GET', '/wallet/balance', H);
  ok('wallet balance + lifetime totals', wb.status === 200 && wb.data.totals);
  const wt = await call('GET', '/wallet/transactions?type=topup&limit=5', H);
  ok('wallet history with type filter', wt.status === 200 && Array.isArray(wt.data.docs));

  // --- chat
  const conv = await call('POST', '/chat/conversations', C, { participantId: revee });
  ok('client opens a conversation', conv.status === 200 || conv.status === 201, JSON.stringify(conv.json).slice(0, 200));
  const convId = conv.data?._id || conv.data?.id;
  if (convId) {
    const msg = await call('POST', `/chat/conversations/${convId}/messages`, C, { content: 'Hello, call me on 0612345678', type: 'text' });
    ok('message is sent', msg.status === 200 || msg.status === 201, JSON.stringify(msg.json).slice(0, 200));
    const m2 = await call('GET', `/chat/conversations/${convId}/messages`, H);
    ok('helper reads the message', m2.status === 200 && JSON.stringify(m2.data).includes('Hello'), JSON.stringify(m2.json).slice(0, 200));
    const unread = await call('GET', '/chat/unread-count', H);
    ok('unread counter works', unread.status === 200);
  }

  // --- support
  const t = await call('POST', '/support/tickets', C, { subject: 'Smoke test ticket', message: 'Hello support', category: 'job', jobId });
  ok('support ticket with category + job', t.status === 201 || t.status === 200, JSON.stringify(t.json).slice(0, 200));

  // --- change password and old token behaviour
  const cp = await call('POST', '/auth/change-password', C, { currentPassword: 'Test@1234', newPassword: 'Test@12345' });
  ok('change password returns fresh tokens', cp.status === 200 && cp.data?.accessToken, JSON.stringify(cp.json).slice(0, 140));
  const old = await call('GET', '/user/me', C);
  ok('old token stops working after the change', old.status === 401);
  const fresh = await call('GET', '/user/me', cp.data?.accessToken);
  ok('new token works', fresh.status === 200);
  await call('POST', '/auth/change-password', cp.data?.accessToken, { currentPassword: 'Test@12345', newPassword: 'Test@1234' });

  // --- staff console
  const ad = await call('POST', '/auth/login', null, { email: env.ADMIN_SEED_EMAIL, password: env.ADMIN_SEED_PASSWORD });
  ok('admin signs in', ad.status === 200 && ad.data?.accessToken, String(ad.status));
  if (ad.data) {
    const A = ad.data.accessToken;
    const st = await call('GET', '/admin/stats', A);
    ok('dashboard figures (with trends)', st.status === 200 && st.data.trends, JSON.stringify(st.json).slice(0, 120));
    const jobs = await call('GET', '/jobs?status=all&limit=5', A);
    ok('bookings list for staff', jobs.status === 200);
    const jd = await call('GET', `/jobs/${jobId}`, A);
    ok('booking detail has stored fee + helper net', jd.data?.helperNet != null && jd.data?.feePercentage != null, JSON.stringify({ n: jd.data?.helperNet, f: jd.data?.feePercentage }));
    const tk = await call('GET', '/support/tickets/admin/all?status=open', A);
    ok('support inbox for staff', tk.status === 200 && tk.data.docs?.length >= 1);
    const sh = await call('GET', '/admin/settings/history', A);
    ok('settings history', sh.status === 200);
    const nm = await call('PATCH', '/admin/settings', A, { platformFeePercentage: 500 });
    ok('fee 500 % is refused', nm.status === 400, String(nm.status));
    const mp = await call('GET', '/admin/map/helpers', A);
    ok('fleet map endpoint', mp.status === 200);
    // temp-password staff
    const cs = await call('POST', '/admin/staff', A, { name: 'Test Agent', email: `agent.smoke.${RUN}@tarik.test`, password: 'Temp#Pass12', rolePreset: 'support' });
    ok('super admin creates a staff member', cs.status === 201 || cs.status === 200, JSON.stringify(cs.json).slice(0, 160));
    const sl = await call('POST', '/auth/login', null, { email: `agent.smoke.${RUN}@tarik.test`, password: 'Temp#Pass12' });
    ok('staff signs in with the temporary password', sl.status === 200 && sl.data?.user?.mustChangePassword === true);
    const blocked = await call('GET', '/support/tickets/admin/all', sl.data?.accessToken);
    ok('staff is held back until the password is changed', blocked.status === 403 && blocked.json?.code === 'PASSWORD_CHANGE_REQUIRED', JSON.stringify(blocked.json).slice(0, 140));
    const chg = await call('POST', '/auth/change-password', sl.data?.accessToken, { currentPassword: 'Temp#Pass12', newPassword: 'MyOwn#Pass12' });
    ok('staff changes the password', chg.status === 200 && chg.data?.accessToken);
    const allowed = await call('GET', '/support/tickets/admin/all', chg.data?.accessToken);
    ok('then the support inbox opens', allowed.status === 200, String(allowed.status));
    const denied = await call('GET', '/admin/stats', chg.data?.accessToken);
    ok('support role cannot do finance things (settings)', (await call('PATCH', '/admin/settings', chg.data?.accessToken, { platformFeePercentage: 10 })).status === 403);
    ok('support role can see figures it was given', denied.status === 200);
  }
  console.log(`\nPASSED ${pass}  FAILED ${fail}`);
})().catch((e) => { console.log('SCRIPT ERROR', e); });
