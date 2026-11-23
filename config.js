// BMT Fleet Maintenance settings.
// Leave supabaseUrl and supabaseAnonKey empty to run in demo mode (data stays in this browser only).
// To go live, paste the two values from Supabase (see the setup steps).
// The "anon public" key is safe to publish: your data is protected by login and the database's security rules.
window.BMT_CONFIG = {
  supabaseUrl: "https://zaunkysxynifqbvgpgeu.supabase.co/rest/v1/",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InphdW5reXN4eW5pZnFidmdwZ2V1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU0MDg1MTIsImV4cCI6MjExMDk4NDUxMn0.axiCG1OGTpgOYcyA2Hg56dXb4eOA3Y7cbxz4IBMcLfY",
  companyName: "Brisbane Machinery Transport",

  // Offered as a one-click "Add vehicles" button while the fleet is empty.
  // layout: tyre layout code (see LAYOUTS in app.js). Everything can be changed later in the app.
  starterFleet: [
    { name: "12T Bogie (OALT2)",   rego: "OALT2",  type: "Rigid tilt tray", layout: "6x4" },
    { name: "12T Bogie (XB05JM)",  rego: "XB05JM", type: "Rigid tilt tray", layout: "6x4" },
    { name: "6T Tilt (TOWLYF)",    rego: "TOWLYF", type: "Rigid tilt tray", layout: "4x2d" },
    { name: "Kenworth T410",       rego: "BMT410", type: "Prime mover", make: "Kenworth", model: "T410", layout: "6x4" },
    { name: "Western Star 2023",   key: "WSTAR",   type: "Prime mover", make: "Western Star", year: 2023, layout: "6x4" },
    { name: "Drop deck trailer",   key: "DROPDECK", type: "Drop deck trailer", layout: "tr3", towedBy: "WSTAR" },
    { name: "Toyota Prado",        rego: "SH0RT3", type: "Light vehicle (4WD / ute)", make: "Toyota", model: "Prado", layout: "lv" },
    { name: "RAM",                 rego: "741NQ3", type: "Light vehicle (4WD / ute)", make: "RAM", layout: "lv" }
  ]
};
