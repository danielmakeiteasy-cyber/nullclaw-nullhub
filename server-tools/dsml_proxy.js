// dsml_proxy.js — DeepSeek DSML -> nullhub <tool_call> converter proxy
// Listens on 127.0.0.1:9888, forwards to api.deepseek.com, rewrites tool-call leaks.
const http = require('http');
const https = require('https');
const fs = require('fs');

const PORT = 9888;
const UP_HOST = 'api.deepseek.com';
const LOG = '/root/llm_proxy.log';
const HOLD = 24; // chars held back while streaming so markers never split
const MAX_BUF = 4 * 1024 * 1024;

function log(...a) {
  try { fs.appendFileSync(LOG, new Date().toISOString() + ' ' + a.join(' ') + '\n'); } catch {}
}

// ---------- DSML parsing ----------
const FW = '\uFF5C'; // ｜
const BARS = '(?:\uFF5C\uFF5C|\uFF5C|\\||)';
const OPEN = '<' + BARS + 'DSML' + BARS + '\\s*';
const CLOSE = '<\\/' + BARS + 'DSML' + BARS + '\\s*';
const RE_INVOKE = new RegExp(OPEN + 'invoke\\b([^>]*)>([\\s\\S]*?)' + CLOSE + 'invoke\\s*>', 'g');
const RE_PARAM = new RegExp(OPEN + 'parameter\\b([^>]*)>([\\s\\S]*?)' + CLOSE + 'parameter\\s*>', 'g');
const RE_LEGACY_CALLS = /<｜tool▁calls▁begin｜>([\s\S]*?)<｜tool▁calls▁end｜>/g;
const RE_LEGACY_CALL = /<｜tool▁call▁begin｜>([\s\S]*?)<｜tool▁call▁end｜>/g;

function tryJson(s) {
  try { return JSON.parse(s); } catch { return undefined; }
}

function parseInvoke(attrs, body) {
  const nm = (attrs || '').match(/name\s*=\s*"([^"]+)"/);
  if (!nm) return null;
  const name = nm[1];
  const params = {};
  let m;
  RE_PARAM.lastIndex = 0;
  while ((m = RE_PARAM.exec(body))) {
    const pa = m[1] || '';
    const pn = (pa.match(/name\s*=\s*"([^"]+)"/) || [])[1];
    if (!pn) continue;
    const raw = m[2].trim();
    const asString = /string\s*=\s*"true"/i.test(pa);
    let v = asString ? undefined : tryJson(raw);
    params[pn] = v === undefined ? raw : v;
  }
  let args;
  if (params.hasOwnProperty('arguments')) {
    let a = params.arguments;
    if (typeof a === 'string') { const p = tryJson(a); if (p !== undefined) a = p; }
    args = (a && typeof a === 'object' && !Array.isArray(a)) ? a : {};
  } else {
    args = {};
    for (const k of Object.keys(params)) args[k] = params[k];
  }
  return { name, arguments: args };
}

function toolCallBlock(name, args) {
  return '<tool_call>\n' + JSON.stringify({ name, arguments: args }) + '\n</tool_call>';
}

function hasMarker(text) {
  return text.includes('DSML') || text.includes('<｜tool▁calls▁begin｜>') || text.includes('<|tool▁calls▁begin|>');
}

// Rewrite every known tool-call leak format into gateway protocol text.
function rewrite(text) {
  if (!text) return { text: text || '', fixes: 0 };
  let fixes = 0;
  let out = text;

  out = out.replace(RE_INVOKE, (whole, attrs, body) => {
    const call = parseInvoke(attrs, body);
    if (!call) return whole;
    fixes++;
    return toolCallBlock(call.name, call.arguments);
  });

  out = out.replace(RE_LEGACY_CALLS, (whole, inner) => {
    let blocks = '';
    let m;
    RE_LEGACY_CALL.lastIndex = 0;
    while ((m = RE_LEGACY_CALL.exec(inner))) {
      const seg = m[1];
      const nm = seg.match(/function<｜tool▁sep｜>([^\n`]+)/);
      const jm = seg.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (!nm || !jm) continue;
      const args = tryJson(jm[1].trim());
      if (args === undefined) continue;
      blocks += toolCallBlock(nm[1].trim(), args);
      fixes++;
    }
    return blocks || whole;
  });

  // strip stray leftover DSML tokens
  const before = out;
  out = out.replace(/<[^<>]*DSML[^<>]*>/g, '');
  out = out.split(FW + FW + 'DSML' + FW + FW).join('').split(FW + 'DSML' + FW).join('').split('<|DSML|>').join('');
  out = out.replace(/<\/?\s*calls\s*>/g, '');
  out = out.split('<｜tool▁calls▁begin｜>').join('').split('<｜tool▁calls▁end｜>').join('');
  if (before !== out) fixes++;
  return { text: out, fixes };
}

// ---------- request capture ----------
let reqN = 0;
try { reqN = fs.readdirSync('/root').filter(f => /^llm_req_\d+\.json$/.test(f)).length; } catch {}
function captureReq(bodyStr) {
  try {
    reqN++;
    fs.writeFileSync('/root/llm_req_' + reqN + '.json', bodyStr);
  } catch {}
  return reqN;
}

// ---------- SSE helpers ----------
function sseChunk(id, model, delta, finish) {
  return 'data: ' + JSON.stringify({
    id, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model,
    choices: [{ index: 0, delta, finish_reason: finish === undefined ? null : finish }]
  }) + '\n\n';
}

function upstream(req, bodyBuf, cb) {
  const headers = { ...req.headers };
  delete headers.host; delete headers['content-length']; delete headers.connection;
  headers['host'] = UP_HOST;
  const r = https.request({
    hostname: UP_HOST, port: 443, path: req.url, method: req.method, headers
  }, cb);
  r.on('error', (e) => log('UPSTREAM_ERR', e.message));
  r.write(bodyBuf);
  r.end();
  return r;
}

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => { if (chunks.reduce((a, b) => a + b.length, 0) < MAX_BUF) chunks.push(c); });
  req.on('end', () => {
    const bodyBuf = Buffer.concat(chunks);
    let parsed = null;
    try { parsed = JSON.parse(bodyBuf.toString('utf8')); } catch {}
    const isChat = parsed && (req.url.includes('/chat/completions'));
    let n = 0;
    if (isChat) n = captureReq(bodyBuf.toString('utf8'));
    const stream = !!(parsed && parsed.stream);

    upstream(req, bodyBuf, (up) => {
      if (!isChat || !parsed) { // passthrough
        res.writeHead(up.statusCode, up.headers);
        up.pipe(res);
        return;
      }

      if (!stream) {
        const bufs = [];
        up.on('data', (c) => bufs.push(c));
        up.on('end', () => {
          let txt = Buffer.concat(bufs).toString('utf8');
          let fixes = 0;
          try {
            const j = JSON.parse(txt);
            const ch = j.choices && j.choices[0];
            if (ch && ch.message) {
              const tc = ch.message.tool_calls || [];
              let content = ch.message.content || '';
              const r = rewrite(content);
              content = r.text; fixes += r.fixes;
              for (const c of tc) {
                if (c.function) {
                  const args = tryJson(c.function.arguments || '{}');
                  if (args !== undefined) { content += '\n' + toolCallBlock(c.function.name, args); fixes++; }
                }
              }
              ch.message.content = content;
              delete ch.message.tool_calls;
              if (ch.finish_reason === 'tool_calls') ch.finish_reason = 'stop';
              txt = JSON.stringify(j);
            }
          } catch {}
          if (fixes) log('REQ', n, 'NONSTREAM_FIXES', fixes);
          const h = { ...up.headers }; delete h['content-length']; delete h['transfer-encoding'];
          res.writeHead(up.statusCode, h);
          res.end(txt);
        });
        return;
      }

      // ---- streaming ----
      const h = { ...up.headers };
      delete h['content-length']; delete h['transfer-encoding'];
      res.writeHead(up.statusCode, h);

      let mode = 'passthrough';      // passthrough -> buffered
      let acc = '';                  // full content accumulated
      let sent = 0;                  // content chars already sent
      let pending = '';              // held-back tail
      let toolAcc = {};              // native tool_calls reassembly
      let nativeTools = false;
      let id = 'chatcmpl-proxy', model = parsed.model || 'deepseek-chat';
      let sseBuf = '';
      let done = false;

      function safeWrite(s) { if (mode === 'passthrough' && !done && !res.writableEnded) { try { res.write(s); } catch {} } }
      function sendContent(s) { if (s && !done && !res.writableEnded) { try { res.write(sseChunk(id, model, { content: s }, null)); sent += s.length; } catch {} } }

      function flushPending(final) {
        if (mode !== 'passthrough') return;
        if (final) { sendContent(pending); pending = ''; return; }
        if (pending.length > HOLD) {
          const cut = pending.length - HOLD;
          sendContent(pending.slice(0, cut));
          pending = pending.slice(cut);
        }
      }

      function finishBuffered() {
        try {
          let text = acc;
          if (nativeTools) {
            const calls = Object.keys(toolAcc).sort((a, b) => a - b).map(k => toolAcc[k]);
            for (const c of calls) {
              if (!c || !c.function) continue;
              const args = tryJson(c.function.arguments || '{}');
              if (args !== undefined) text += (text ? '\n' : '') + toolCallBlock(c.function.name, args);
            }
          }
          const r = rewrite(text);
          const fixed = r.text;
          try { fs.writeFileSync('/root/llm_raw_' + n + '.json', JSON.stringify({ raw: text, native: nativeTools, fixed }, null, 1)); } catch {}
          done = true;
          const remain = fixed.length > sent ? fixed.slice(sent) : '';
          try {
            if (remain) res.write(sseChunk(id, model, { content: remain }, null));
            res.write(sseChunk(id, model, {}, 'stop'));
            res.write('data: [DONE]\n\n');
          } catch {}
          log('REQ', n, 'BUFFERED fixes=' + r.fixes, 'native=' + nativeTools, 'len=' + fixed.length);
        } catch (e) {
          log('BUFFERED_ERR', e.message);
          try { res.write(sseChunk(id, model, {}, 'stop')); res.write('data: [DONE]\n\n'); } catch {}
        }
        try { res.end(); } catch {}
      }

      up.on('data', (c) => {
        sseBuf += c.toString('utf8');
        let idx;
        while ((idx = sseBuf.indexOf('\n')) >= 0) {
          const line = sseBuf.slice(0, idx).trim();
          sseBuf = sseBuf.slice(idx + 1);
          if (!line.startsWith('data:')) { safeWrite(line + '\n'); continue; }
          const payload = line.slice(5).trim();
          if (payload === '[DONE]') { if (mode === 'passthrough' && !done) { flushPending(true); try { res.write('data: [DONE]\n\n'); res.end(); } catch {} done = true; } continue; }
          let j;
          try { j = JSON.parse(payload); } catch { safeWrite(line + '\n\n'); continue; }
          if (j.id) id = j.id;
          if (j.model) model = j.model;
          const ch = j.choices && j.choices[0];
          if (!ch) { safeWrite('data: ' + payload + '\n\n'); continue; }
          const d = ch.delta || {};

          if (d.tool_calls) {
            nativeTools = true;
            for (const tc of d.tool_calls) {
              const i = tc.index || 0;
              toolAcc[i] = toolAcc[i] || { id: tc.id, type: 'function', function: { name: '', arguments: '' } };
              if (tc.id) toolAcc[i].id = tc.id;
              if (tc.function) {
                if (tc.function.name) toolAcc[i].function.name += tc.function.name;
                if (tc.function.arguments) toolAcc[i].function.arguments += tc.function.arguments;
              }
            }
            mode = 'buffered';
            log('REQ', n, 'SWITCH native tool_calls');
            continue;
          }

          if (typeof d.content === 'string' && d.content.length) {
            acc += d.content;
            if (mode === 'passthrough') {
              pending += d.content;
              if (hasMarker(acc)) {
                mode = 'buffered';
                log('REQ', n, 'SWITCH dsml marker at', acc.length);
              } else {
                flushPending(false);
              }
            }
            continue;
          }
          // other deltas (role, reasoning...) pass through
          safeWrite(sseChunk(id, model, d, ch.finish_reason === undefined ? null : ch.finish_reason));
        }
      });

      up.on('end', () => {
        if (done || res.writableEnded) return;
        if (mode === 'buffered') finishBuffered();
        else { flushPending(true); try { res.write('data: [DONE]\n\n'); res.end(); } catch {} }
      });
      up.on('error', (e) => {
        log('REQ', n, 'UPSTREAM_STREAM_ERR', e.message);
        if (!res.writableEnded) { try { res.write('data: [DONE]\n\n'); } catch {} res.end(); }
      });
    });
  });
});

if (require.main === module) {
  server.listen(PORT, '127.0.0.1', () => log('dsml converter proxy on', PORT));
} else {
  module.exports = { rewrite, hasMarker, parseInvoke };
}
