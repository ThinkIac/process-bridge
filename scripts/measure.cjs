'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const count = name => [...fs.readFileSync(path.join(root,name),'utf8')].length;
const before = count('test/fixtures/original.cjs');
const after = count('src/index.type');
const wrapper = count('index.cjs');
console.log(JSON.stringify({before,after,saved:before-after,percent:(100*(before-after)/before).toFixed(2),wrapper,withWrapper:after+wrapper,savedWithWrapper:before-after-wrapper,percentWithWrapper:(100*(before-after-wrapper)/before).toFixed(2)},null,2));
