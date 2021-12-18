'use strict';
const fs = require('fs');
const HTMLParser = require('node-html-parser');

const inputfile = process.argv.slice(2)[0];
const outputfile = process.argv.slice(2)[1];

let rawbipsi = fs.readFileSync("data/bipsi.json");
let rawhtml = fs.readFileSync(inputfile);

const document = HTMLParser.parse(rawhtml);
const bundle = JSON.parse(rawbipsi);

document.querySelectorAll("[data-editor-only]").forEach((element) => element.remove());
document.setAttribute("data-app-mode", "player");
document.querySelector("#bundle-embed").innerHTML = JSON.stringify(bundle);

fs.writeFileSync(outputfile, document.toString());