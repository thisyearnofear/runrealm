const favicons = require('favicons');
const fs = require('fs');
const path = require('path');

const source = 'assets/running-emoji.svg';
const destination = 'public';

const configuration = {
  path: '/',
  appName: 'RunRealm',
  appShortName: 'RunRealm',
  appDescription:
    'Cross-chain fitness GameFi app - claim, trade, and defend real-world running territories as NFTs',
  developerName: 'RunRealm Team',
  developerURL: null,
  dir: 'auto',
  lang: 'en-US',
  background: '#1a1a1a',
  theme_color: '#1a1a1a',
  appleStatusBarStyle: 'black-translucent',
  display: 'standalone',
  orientation: 'any',
  scope: '/',
  start_url: '/',
  version: '2.0.0',
  logging: false,
  pixel_art: false,
  loadManifestWithCredentials: false,
  icons: {
    android: true,
    appleIcon: true,
    appleStartup: false,
    coast: false,
    favicons: true,
    firefox: false,
    windows: false,
    yandex: false,
  },
};

favicons(source, configuration, (error, response) => {
  if (error) {
    console.error('Error generating favicons:', error);
    return;
  }

  // Write the HTML tags to a file for reference
  fs.writeFileSync(path.join(destination, 'favicon-tags.html'), response.html.join('\n'));

  // Write all the files
  response.images.forEach((image) => {
    fs.writeFileSync(path.join(destination, image.name), image.contents);
  });

  response.files.forEach((file) => {
    fs.writeFileSync(path.join(destination, file.name), file.contents);
  });

  console.log('Favicons generated successfully!');
});
