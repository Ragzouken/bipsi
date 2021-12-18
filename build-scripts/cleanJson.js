'use strict';

const fs = require('fs');
const filename = process.argv.slice(2)[0];

let rawdata = fs.readFileSync(filename);

if(rawdata.toString().charCodeAt(0) != 123){ //not a "{"
	let cleaned = JSON.parse(rawdata.toString().substr(1));
	fs.writeFileSync(filename, JSON.stringify(cleaned));
}