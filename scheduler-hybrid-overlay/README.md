# Scheduler Hybrid Overlay

📦 Full offline-ready, async-batched, drag & drop CSV post scheduler system.

## Features
- Offline support
- CSV post scheduling
- Drag & drop interface
- Async batch processing

## Local Development Setup

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm start
```

3. Access the application at `http://localhost:3000`

## Deployment

### Option 1: Deploy to Render.com (Recommended)

1. Create a free account on [Render.com](https://render.com)
2. Create a new Web Service
3. Connect your GitHub repository
4. Use the following settings:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Environment: Node
   - Node Version: 18 or higher

### Option 2: Deploy to Heroku

1. Create a free account on [Heroku](https://heroku.com)
2. Install the Heroku CLI
3. Run the following commands:
```bash
heroku create your-app-name
git push heroku main
```

## Environment Variables

No environment variables are required for basic functionality.

## License

ISC

## Structure
- public/ : Static assets (HTML, CSS, icons)
- src/core/ : Core app logic (auth, API, firebase)
- src/features/ : UI features (popup manager, scheduled viewer)
- src/enhancements/ : Async batching, retry helpers, offline sync

## How to Run
- Serve locally using any simple HTTP server:
  - Python: python3 -m http.server
  - Node: npx serve
  - Vite: npm install vite && vite

---
Created by Jake 🥷👾
