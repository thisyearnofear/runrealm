import favicons from 'favicons';
import fs from 'fs/promises';
import path from 'path';

const source = 'assets/running-emoji.svg'; // Source image
const dest = 'public'; // Output directory

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

try {
  const response = await favicons(source, configuration);

  // Write image files
  await Promise.all(
    response.images.map(async (image) => fs.writeFile(path.join(dest, image.name), image.contents))
  );

  // Write other files (manifests, etc.)
  await Promise.all(
    response.files.map(async (file) => fs.writeFile(path.join(dest, file.name), file.contents))
  );

  // Write HTML references
  await fs.writeFile(path.join(dest, 'favicon-tags.html'), response.html.join('\n'));

  console.log('Favicons generated successfully!');
} catch (error) {
  console.error('Error generating favicons:', error.message);
}
