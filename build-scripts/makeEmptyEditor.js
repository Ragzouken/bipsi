'use strict';
const fs = require('fs');
const HTMLParser = require('node-html-parser');

const inputfile = process.argv.slice(2)[0];
const outputfile = process.argv.slice(2)[1];

let rawhtml = fs.readFileSync(inputfile);

const document = HTMLParser.parse(rawhtml);

document.querySelector("#bundle-embed").innerHTML = "";
document.querySelector("#editor-embed").innerHTML = "";
document.querySelector("#story-embed").innerHTML = "";

fs.writeFileSync(outputfile, document.toString());