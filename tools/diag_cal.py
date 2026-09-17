import sqlite3, json, re, base64, os, subprocess, sys

def sh(cmd):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=60)

print('[1] copiando BD...', flush=True)
sh('rm -rf /tmp/n8ndbE && mkdir -p /tmp/n8ndbE')
for f in ['database.sqlite', 'database.sqlite-wal', 'database.sqlite-shm']:
    r = sh(f'docker cp n8n-makeiteasy:/home/node/.n8n/{f} /tmp/n8ndbE/{f}')
    if r.returncode != 0:
        print(f'  warn {f}: {r.stderr.strip()[:80]}', flush=True)

db = sqlite3.connect('/tmp/n8ndbE/database.sqlite')

print('[2] nodos de calendario WF Daniel:', flush=True)
row = db.execute("SELECT nodes FROM workflow_entity WHERE id='2BT6BgWx27TSg64g'").fetchone()
if row:
    nodes = json.loads(row[0]) if isinstance(row[0], str) else row[0]
    for n in nodes:
        if 'googleCalendar' in n.get('type', ''):
            print(json.dumps({'name': n.get('name'), 'type': n.get('type'),
                              'tv': n.get('typeVersion'), 'params': n.get('parameters', {})},
                             ensure_ascii=False), flush=True)

print('[3] eids decodificados de ejecuciones recientes:', flush=True)
rows = db.execute('SELECT id FROM execution_entity ORDER BY id DESC LIMIT 40').fetchall()
seen = {}
for (ex_id,) in rows:
    r = db.execute('SELECT data FROM execution_data WHERE executionId=?', (ex_id,)).fetchone()
    if not r or not r[0]:
        continue
    s = r[0] if isinstance(r[0], str) else r[0].decode('utf-8', 'ignore')
    for l in set(re.findall(r'eid=([A-Za-z0-9_=-]{10,})', s)):
        pad = '=' * (-len(l) % 4)
        try:
            dec = base64.urlsafe_b64decode(l + pad).decode('utf-8', 'ignore')
            if dec not in seen:
                seen[dec] = ex_id
        except Exception:
            pass
for dec, ex_id in sorted(seen.items(), key=lambda x: x[1]):
    print(f'exec {ex_id}: {dec}', flush=True)
print('[done]', flush=True)
