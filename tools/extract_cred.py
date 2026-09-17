import sqlite3, re, base64, os, subprocess

os.system('rm -rf /tmp/n8ndbF && mkdir -p /tmp/n8ndbF')
for f in ['database.sqlite', 'database.sqlite-wal', 'database.sqlite-shm']:
    subprocess.run(f'docker cp n8n-makeiteasy:/home/node/.n8n/{f} /tmp/n8ndbF/{f}',
                   shell=True, capture_output=True, timeout=60)

db = sqlite3.connect('/tmp/n8ndbF/database.sqlite')

print('[A] htmlLinks crudos (eid completo hasta & o comilla):', flush=True)
rows = db.execute('SELECT id FROM execution_entity ORDER BY id DESC LIMIT 12').fetchall()
shown = set()
for (ex_id,) in rows:
    r = db.execute('SELECT data FROM execution_data WHERE executionId=?', (ex_id,)).fetchone()
    if not r or not r[0]:
        continue
    s = r[0] if isinstance(r[0], str) else r[0].decode('utf-8', 'ignore')
    for m in sorted(set(re.findall(r'eid=[A-Za-z0-9+/=_-]+', s))):
        l = m[4:]
        pad = '=' * (-len(l) % 4)
        try:
            dec = base64.urlsafe_b64decode(l + pad).decode('utf-8', 'ignore')
            if dec not in shown:
                shown.add(dec)
                print(f'  exec {ex_id} | b64len={len(l)} | {dec}', flush=True)
        except Exception:
            print(f'  exec {ex_id} | b64len={len(l)} | DECODE_ERR', flush=True)

print('[B] credencial:', flush=True)
row = db.execute("SELECT name, type, length(data) FROM credential_entity WHERE id='lCYjTNtrU371'").fetchone()
print(' ', row, flush=True)
row2 = db.execute("SELECT data FROM credential_entity WHERE id='lCYjTNtrU371'").fetchone()
open('/tmp/cred_payload.txt', 'w').write(row2[0])
print('  payload -> /tmp/cred_payload.txt', flush=True)
