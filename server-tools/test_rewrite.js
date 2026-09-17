const { rewrite } = require('./dsml_proxy.js');
const F = '\uFF5C';
const dsmlArgs = `<${F}DSML${F}invoke name="agendar_evento"><${F}DSML${F}parameter name="arguments" string="false">{"titulo":"TEST-PX","fecha":"2026-10-26","hora":"10:00"}</${F}DSML${F}parameter></${F}DSML${F}invoke>`;
const dsmlParams = `<${F}DSML${F}invoke name="consultar_disponibilidad"><${F}DSML${F}parameter name="fecha">2026-10-26</${F}DSML${F}parameter></${F}DSML${F}invoke>`;
const legacy = `<｜tool▁calls▁begin｜><｜tool▁call▁begin｜>function<｜tool▁sep｜>eliminar_evento\n\`\`\`json\n{"event_id":"abc"}\n\`\`\`<｜tool▁call▁end｜><｜tool▁calls▁end｜>`;
const dsmlDouble = `<${F}${F}DSML${F}${F}invoke name="mover_evento"><${F}${F}DSML${F}${F}parameter name="arguments" string="false">{"event_id":"x","fecha":"2026-10-27"}</${F}${F}DSML${F}${F}parameter></${F}${F}DSML${F}${F}invoke>`;
const dsmlReal = `Voy.\n\n<${F}${F}DSML${F}${F} calls>\n<${F}${F}DSML${F}${F} invoke name="http_request">\n<${F}${F}DSML${F}${F} parameter name="url" string="true">https://n8n/webhook</${F}${F}DSML${F}${F} parameter>\n<${F}${F}DSML${F}${F} parameter name="method" string="true">POST</${F}${F}DSML${F}${F} parameter>\n<${F}${F}DSML${F}${F} parameter name="body" string="true">{"action":"agendar_evento","titulo":"T"}</${F}${F}DSML${F}${F} parameter>\n</${F}${F}DSML${F}${F} invoke>\n</${F}${F}DSML${F}${F} calls>`;
let ok = true;
function check(name, input, expectName, expectArgKey, expectArgVal) {
  const r = rewrite(input);
  const m = r.text.match(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/);
  if (!m) { console.log('FAIL', name, 'no tool_call block:', JSON.stringify(r.text)); ok = false; return; }
  const j = JSON.parse(m[1]);
  if (j.name !== expectName) { console.log('FAIL', name, 'name', j.name); ok = false; }
  if (expectArgKey !== undefined && JSON.stringify(j.arguments[expectArgKey]) !== JSON.stringify(expectArgVal)) {
    console.log('FAIL', name, 'args', JSON.stringify(j.arguments)); ok = false;
  }
  if (r.fixes < 1) { console.log('FAIL', name, 'fixes', r.fixes); ok = false; }
  console.log('OK', name, '=>', m[1].slice(0, 110));
}
check('dsml-args-json', dsmlArgs, 'agendar_evento', 'titulo', 'TEST-PX');
check('dsml-params', dsmlParams, 'consultar_disponibilidad', 'fecha', '2026-10-26');
check('legacy-tokens', legacy, 'eliminar_evento', 'event_id', 'abc');
check('dsml-double-bars', dsmlDouble, 'mover_evento', 'event_id', 'x');
check('dsml-real-capture', dsmlReal, 'http_request', 'url', 'https://n8n/webhook');
const clean = rewrite('Hola, sin herramientas');
if (clean.text !== 'Hola, sin herramientas' || clean.fixes !== 0) { console.log('FAIL clean'); ok = false; } else console.log('OK clean-passthrough');
{
  const r = rewrite(dsmlReal);
  const j = JSON.parse(r.text.match(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/)[1]);
  if (typeof j.arguments.body !== 'string') { console.log('FAIL body-fidelity', typeof j.arguments.body); ok = false; }
  else if (r.text.includes('DSML')) { console.log('FAIL dsml-residue'); ok = false; }
  else console.log('OK body-string-fidelity + no residue');
}
console.log(ok ? 'ALL TESTS PASSED' : 'TESTS FAILED');
process.exit(ok ? 0 : 1);
