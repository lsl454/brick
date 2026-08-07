import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const androidRoot = path.join(root, 'android');
if (!fs.existsSync(androidRoot)) {
  console.error('Android project not found. Run: npx cap add android');
  process.exit(1);
}

const sourceRoot = path.join(root, 'resources', 'android');
const targetRoot = path.join(androidRoot, 'app', 'src', 'main', 'res');
for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
  const sourceDir = path.join(sourceRoot, `mipmap-${density}`);
  const targetDir = path.join(targetRoot, `mipmap-${density}`);
  if (!fs.existsSync(sourceDir) || !fs.existsSync(targetDir)) continue;
  for (const name of ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png']) {
    const source = path.join(sourceDir, name);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(targetDir, name));
  }
}

const backgroundFiles = [
  path.join(targetRoot, 'values', 'ic_launcher_background.xml'),
  path.join(targetRoot, 'values', 'colors.xml'),
];
for (const file of backgroundFiles) {
  if (!fs.existsSync(file)) continue;
  let text = fs.readFileSync(file, 'utf8');
  text = text.replace(/#ffffff/gi, '#05070D');
  fs.writeFileSync(file, text);
}

const manifestPath = path.join(androidRoot, 'app', 'src', 'main', 'AndroidManifest.xml');
if (fs.existsSync(manifestPath)) {
  let manifest = fs.readFileSync(manifestPath, 'utf8');
  if (!manifest.includes('android:screenOrientation=')) {
    manifest = manifest.replace(
      /(<activity\b[^>]*android:name="\.MainActivity")/,
      '$1\n            android:screenOrientation="portrait"'
    );
  }
  fs.writeFileSync(manifestPath, manifest);
}

console.log('Android portrait mode and Brick Fall icons applied.');
