const toIco = require('to-ico');
const fs = require('fs');

// Read the PNG files
const png16 = fs.readFileSync('./public/favicon-16x16.png');
const png32 = fs.readFileSync('./public/favicon-32x32.png');

// Create ICO file
toIco([png16, png32])
  .then(buf => {
    fs.writeFileSync('./public/favicon.ico', buf);
    console.log('Favicon.ico created successfully!');
  })
  .catch(err => {
    console.error('Error creating favicon.ico:', err);
  });