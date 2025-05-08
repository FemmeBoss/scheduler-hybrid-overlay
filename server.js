// server.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import browserSync from 'browser-sync';

const app = express();
const port = 7248;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static files (html, css, js, etc.)
app.use(express.static(__dirname));

// Basic route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start the server
const server = app.listen(port, () => {
  console.log(`🌐 Server running at http://localhost:${port}`);
});

// Start BrowserSync
browserSync.init({
  proxy: `http://localhost:${port}`,
  files: [
    `${__dirname}/**/*.html`,
    `${__dirname}/**/*.css`,
    `${__dirname}/**/*.js`,
    `${__dirname}/**/*.png`,
    `${__dirname}/**/*.jpg`
  ],
  open: true,
  port: 3000, // <- ngrok now points to 3000!
});