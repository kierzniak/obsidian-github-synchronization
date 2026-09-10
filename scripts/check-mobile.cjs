const fs = require('node:fs');
const vm = require('node:vm');
const external = [];
const obsidian = {
  Plugin: class {},
  PluginSettingTab: class {},
  Modal: class {},
  Notice: class {},
  Setting: class {},
};
const sandbox = {
  module: { exports: {} },
  exports: {},
  console,
  TextEncoder,
  TextDecoder,
  URL,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  require(id) {
    external.push(id);
    if (id === 'obsidian') return obsidian;
    throw new Error(`Unavailable mobile dependency: ${id}`);
  },
};
vm.runInNewContext(fs.readFileSync('main.js', 'utf8'), sandbox, { timeout: 10000 });
if (typeof sandbox.module.exports.default !== 'function')
  throw new Error('Plugin export is missing');
console.log(`Mobile bundle load passed; external modules: ${[...new Set(external)].join(', ')}`);
