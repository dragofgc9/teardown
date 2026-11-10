#!/usr/bin/env node
// Writes the OA-1K page in the shape a claude.ai Artifact wants: no doctype, html, head or body tags (the publisher
// wraps the file), a real <title>, only this page's own CSS, three.js and the two fonts inlined.
//
//   node sims/oa1k-live/artifact.mjs [out.html]      default: teardown-out/dist/oa1k-skyraider.html
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DEPS, DIST, fromDeps} from '../../paths.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const esbuild = fromDeps('esbuild');
const b64 = (f) => fs.readFileSync(path.join(DEPS, f)).toString('base64');
const fonts = [400, 700].map((w) => `@font-face{font-family:'JetBrains Mono';font-weight:${w};font-style:normal;font-display:swap;src:url(data:font/woff2;base64,${b64(`@fontsource/jetbrains-mono/files/jetbrains-mono-latin-${w}-normal.woff2`)}) format('woff2');}`).join('\n') +
  `\n@font-face{font-family:'Inter';font-weight:100 900;font-style:normal;font-display:swap;src:url(data:font/woff2;base64,${b64('@fontsource-variable/inter/files/inter-latin-wght-normal.woff2')}) format('woff2');}`;

const res = await esbuild.build({entryPoints: [path.join(HERE, 'main.js')], bundle: true, nodePaths: [DEPS], format: 'esm', minify: true, write: false, target: 'es2022', legalComments: 'none', logLevel: 'warning'});
const js = res.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
const out = path.resolve(process.argv[2] || path.join(DIST, 'oa1k-skyraider.html'));
fs.mkdirSync(path.dirname(out), {recursive: true});
fs.writeFileSync(out, `<title>OA-1K Skyraider II</title>
<style>
${fonts}
${fs.readFileSync(path.join(HERE, 'style.css'), 'utf8')}
</style>
<div id="app"></div>
<script type="module">
${js}
</script>
`);
console.log(`${out}  ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
