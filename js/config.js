// Google Maps settings.
//
// 1. Create a key: https://console.cloud.google.com/google/maps-apis
//    (enable "Maps JavaScript API"; a billing account is required, but this
//    app stays well inside the monthly free usage for a class project).
// 2. Restrict the key: Credentials → your key → Application restrictions →
//    "Websites", and add:
//        http://localhost:8000/*
//        https://your-project.vercel.app/*
//    and under API restrictions allow only "Maps JavaScript API".
// 3. Paste it below.
//
// A browser map key is always visible in the page source. The website
// restriction is what stops anyone else from using it.

export const GOOGLE_MAPS_API_KEY = '';
