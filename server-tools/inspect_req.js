const fs = require('fs');
for (const f of process.argv.slice(2)) {
  try {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    console.log('=== ' + f + ' keys=' + Object.keys(j).join(',') + ' stream=' + j.stream + ' model=' + j.model);
    j.messages.forEach((m, i) => {
      const c = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      console.log('[' + i + '] ' + m.role + ' len=' + c.length + (m.tool_calls ? ' tool_calls=' + JSON.stringify(m.tool_calls).slice(0, 120) : ''));
      const re = /<[\w.-]+|DSML|tool_call|<tool|function\s*:/i;
      let idx = 0, n = 0;
      while (n < 8) {
        const mm = c.slice(idx).match(re);
        if (!mm) break;
        const at = idx + mm.index;
        console.log('   >> ' + JSON.stringify(c.slice(Math.max(0, at - 60), at + 200)));
        idx = at + 1; n++;
      }
    });
  } catch (e) { console.log(f, 'ERROR', e.message); }
}
