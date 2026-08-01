#!/bin/sh
# Collect MAPUI_PARAM_<NAME>=<value> env vars into runtime-params.json.
# Parcel bundles the file at startup, and the remote-command parameter popup
# pre-fills matching <NAME> placeholders with these values.
node -e '
const fs = require("fs");
const out = {};
for (const [k, v] of Object.entries(process.env)) {
  if (k.startsWith("MAPUI_PARAM_") && v) out[k.slice("MAPUI_PARAM_".length)] = v;
}
fs.writeFileSync("runtime-params.json", JSON.stringify(out));
const n = Object.keys(out).length;
if (n) console.log(`[entrypoint] preset ${n} remote-command parameter(s): ${Object.keys(out).join(", ")}`);
'
exec npm start
