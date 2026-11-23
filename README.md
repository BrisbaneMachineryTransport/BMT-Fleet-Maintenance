# BMT Fleet Maintenance

Tracks services, tyres by wheel position, registration and COI for Brisbane Machinery Transport's vehicles.

- **Website:** hosted on GitHub Pages.
- **Data:** stored in a Supabase database once it's connected. Until then, the site runs in demo mode and keeps data in your browser only.

**Files**

- `index.html`, `styles.css`, `bmt-logo.jpg`, icons: the website and branding
- `config.js`: database connection and BMT's starting vehicle list (the only file you edit)
- `app.js`: screens, forms and due-date calculations
- `store.js`: saving and loading data
- `km-parse.js`: reads MyTrucking km reports
- `database-setup.sql`: paste into Supabase's SQL Editor once
- `sync-km.mjs`: automatic daily km, for later, once MyTrucking or your GPS provider offers a data feed
