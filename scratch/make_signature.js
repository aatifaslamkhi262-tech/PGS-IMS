const sharp = require('sharp');
const fs = require('fs');

const svg = `
<svg width="400" height="150" viewBox="0 0 400 150" xmlns="http://www.w3.org/2000/svg">
  <!-- Fluent Cursive Signature Stroke in Bright Cyan / White for ID Cards -->
  <path d="M 40,95 C 60,30 95,20 115,70 C 130,110 150,100 175,55 C 195,25 210,75 230,65 C 250,55 265,85 285,60 C 310,35 340,90 370,45" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
  <path d="M 50,110 C 120,118 240,115 350,98" fill="none" stroke="#00F0FF" stroke-width="3.5" stroke-linecap="round" />
</svg>
`;

sharp(Buffer.from(svg))
  .png()
  .toFile('public/card/admin-signature.png')
  .then(() => {
    console.log('Successfully created public/card/admin-signature.png');
  })
  .catch(err => {
    console.error('Error creating signature:', err);
  });
