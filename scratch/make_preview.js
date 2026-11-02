const fs = require('fs');
const path = require('path');

const logoB64 = fs.readFileSync('public/card/logo-trimmed.png').toString('base64');
const frontBgB64 = fs.readFileSync('public/card/front-bg.png').toString('base64');
const backBgB64 = fs.readFileSync('public/card/back-bg.png').toString('base64');

let html = fs.readFileSync('public/card-preview.html', 'utf8');
html = html.split('src="/card/logo-trimmed.png"').join('src="data:image/png;base64,' + logoB64 + '"');
html = html.split('src="/card/logo.png"').join('src="data:image/png;base64,' + logoB64 + '"');
html = html.split("url('/card/front-bg.png')").join("url('data:image/png;base64," + frontBgB64 + "')");
html = html.split("url('/card/back-bg.png')").join("url('data:image/png;base64," + backBgB64 + "')");

fs.writeFileSync('public/card-preview-standalone.html', html, 'utf8');
console.log('Saved standalone preview, size:', fs.statSync('public/card-preview-standalone.html').size);


