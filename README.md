# Trail Viewer

Trail Viewer is a React Native + Expo mobile app for exploring Himalayan trekking routes and other custom GPS trails from KML files. It renders the selected trail on a map, lets you switch between OpenStreetMap and satellite layers, and caches nearby map tiles for offline use while hiking.

## Features

- Browse a curated set of bundled treks from the `kml/` directory
- Import custom KML files from your device
- Show trail route geometry with start and end markers
- Switch between OSM and satellite map layers
- Use a location-aware map while on trail
- Download and cache offline map tiles for the current route
- Built for mobile deployment with Expo and EAS

## Tech stack

- React Native
- Expo
- react-native-webview
- expo-file-system
- expo-document-picker
- expo-asset
- Leaflet (rendered inside WebView)

## Project structure

```text
.
├── App.js                  # Main app UI and route logic
├── index.js                # Expo app entry
├── app.json                # Expo configuration
├── eas.json                # EAS build profiles
├── metro.config.js         # Metro configuration
├── package.json            # Scripts and dependencies
├── package-lock.json       # Dependency lockfile
├── assets/                 # App icon assets
├── kml/                    # Bundled trek KML files
├── .gitignore
└── README.md               # Project documentation
```

## Included trails

The app ships with a set of sample KML files in `kml/`, including tracks like:

- Beas Kund
- Chandrakhani Pass
- Friendship Peak Circuit
- Gaj Pass
- Gulaba to Bhrigu Lake
- Indrahar Pass
- Kareri to Lam Dal
- Kinnaur Kailash
- Minkiani Pass
- Pin Parvati Trail
- Rupin Pass
- Sar Pass

## Requirements

- Node.js
- npm or yarn
- Expo CLI
- Android Studio / Xcode for device emulation (optional if using Expo Go)

## Getting started

```bash
npm install
npx expo start
```

Then choose one of the following:

```bash
npm run android
npm run ios
npm run web
```

## Build commands

```bash
npx eas build --platform android --profile preview
npx eas build --platform android --profile production
```

## How the app works

1. The app reads bundled KML files from `kml/` and extracts coordinate pairs.
2. A selected route is rendered on a Leaflet map inside a `WebView`.
3. The app computes the route bounds and downloads map tiles for those coordinates.
4. Users can switch between map layers or use offline tile mode.
5. Custom KML files may be imported using the document picker and processed the same way.

## Importing custom KML files

From the app UI:

- Tap "Load Custom KML"
- Select an XML/KML file from your device
- The app parses coordinates, renders the route, and begins cache generation for offline use

## Notes

- The app expects KML files with coordinate data in `<coordinates>` elements.
- Offline caching can take time depending on trail length and selected zoom level.
- Tile caching is implemented using the device file system and may require storage permissions depending on platform behavior.

## License

This project does not currently declare a license in the repository.

## Contributing

This repository is small and app-focused. Typical improvements include:

- adding more KML trails
- improving KML parsing robustness
- supporting additional map providers
- adding route statistics (distance, elevation, pace)
- polishing the UI and onboarding flow

