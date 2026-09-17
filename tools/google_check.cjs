const fs = require('fs');
const crypto = require('crypto');

const cfgRaw = fs.readFileSync('/home/node/.n8n/config', 'utf8').trim();
let encKey;
try { encKey = JSON.parse(cfgRaw).key; } catch (e) { encKey = cfgRaw; }
const k = crypto.createHash('md5').update(encKey).digest('hex');

function decrypt(enc) {
  const buf = Buffer.from(enc.trim(), 'base64');
  const d = crypto.createDecipheriv('aes-256-cbc', Buffer.from(k, 'utf8'), buf.subarray(0, 16));
  return Buffer.concat([d.update(buf.subarray(16)), d.final()]).toString('utf8');
}

async function api(url, token) {
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

async function getAccessToken(od) {
  let res = await api('https://www.googleapis.com/oauth2/v3/userinfo', od.access_token);
  if (res.status === 200) return { token: od.access_token, email: res.json.email };
  const body = new URLSearchParams({
    client_id: od.client_id || process.env.GOOGLE_OAUTH_CLIENT_ID || '',
    client_secret: od.client_secret || process.env.GOOGLE_OAUTH_CLIENT_SECRET || '',
    refresh_token: od.refresh_token,
    grant_type: 'refresh_token',
  });
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body });
  const j = await r.json().catch(() => ({}));
  if (!j.access_token) throw new Error('refresh failed: ' + (j.error || r.status));
  const res2 = await api('https://www.googleapis.com/oauth2/v3/userinfo', j.access_token);
  return { token: j.access_token, email: res2.json.email || '?' };
}

(async () => {
  for (const f of ['/tmp/cred0.enc', '/tmp/cred1.enc']) {
    const label = f.includes('cred0') ? 'MAKE IT EASY' : 'PERSONAL';
    try {
      const cred = JSON.parse(decrypt(fs.readFileSync(f, 'utf8')));
      const od = cred.oauthTokenData || cred;
      const { token, email } = await getAccessToken(od);
      console.log(`\n===== ${label} (${f}) =====`);
      console.log('CUENTA:', email);
      const prim = await api('https://www.googleapis.com/calendar/v3/calendars/primary', token);
      console.log('PRIMARY:', prim.status, prim.json.id, '|', prim.json.summary || '');
      const list = await api('https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=50', token);
      console.log('CALENDARIOS (' + (list.json.items || []).length + '):');
      for (const c of list.json.items || []) {
        console.log(' -', c.id, '|', c.summary, '|', c.primary ? '[PRIMARY]' : '', '| rol:', c.accessRole);
      }
      for (const calId of ['primary']) {
        const ev = await api(`https://www.googleapis.com/calendar/v3/calendars/${calId}/events?timeMin=2026-10-18T00:00:00-05:00&timeMax=2026-10-18T23:59:59-05:00&singleEvents=true&orderBy=startTime&maxResults=20`, token);
        console.log(`EVENTOS ${calId} 18-OCT:`, ev.status);
        for (const e of ev.json.items || []) {
          console.log('  *', e.id, '|', e.summary, '|', e.start && (e.start.dateTime || e.start.date), '->', e.end && (e.end.dateTime || e.end.date), '| htmlCal:', (e.htmlLink || '').includes('eid=') ? 'si' : 'no');
        }
      }
      const now = new Date().toISOString();
      const up = await api(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${now}&singleEvents=true&orderBy=startTime&maxResults=10`, token);
      console.log('PROXIMOS EN PRIMARY:', up.status);
      for (const e of up.json.items || []) {
        console.log('  *', e.id, '|', e.summary, '|', e.start && (e.start.dateTime || e.start.date));
      }
    } catch (e) {
      console.log(`\n===== ${label} ERROR:`, e.message);
    }
  }
})();
