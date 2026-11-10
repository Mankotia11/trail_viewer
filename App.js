import { StatusBar } from 'expo-status-bar';
import * as DocumentPicker from 'expo-document-picker';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import React, { useEffect, useState, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Feather } from '@expo/vector-icons';

const OSM_TEMPLATE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}';
const SATELLITE_TEMPLATE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const SATELLITE_LABELS_TEMPLATE = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';

const MIN_ZOOM = 10;
const MAX_ZOOM = 14;
const OFFLINE_DIR = `${FileSystem.documentDirectory}offline-tiles`;
const TREK_SOURCES = [
  { id: 'beas-kund', label: 'Beas Kund', module: require('./kml/beas-kund.kml') },
  { id: 'chandrakhani', label: 'Chandrakhani Pass', module: require('./kml/chandrakhani.kml') },
  { id: 'friendship-peak-circuit', label: 'Friendship Peak Circuit', module: require('./kml/friendship-peak-circuit.kml') },
  { id: 'gaj-pass', label: 'Gaj Pass', module: require('./kml/gaj-pass.kml') },
  { id: 'gullaba-to-bhrigu-lake', label: 'Gulaba to Bhrigu Lake', module: require('./kml/gullaba-to-bhrigu-lake.kml') },
  { id: 'indrahar-pass', label: 'Indrahar Pass', module: require('./kml/indrahar-pass.kml') },
  { id: 'kareri-lam-dal', label: 'Kareri to Lam Dal', module: require('./kml/kareri to lam dal.kml') },
  { id: 'kinnaur-kailash', label: 'Kinnaur Kailash', module: require('./kml/kinnaur-kailash.kml') },
  { id: 'minkiani-pass', label: 'Minkiani Pass', module: require('./kml/minkiani-pass.kml') },
  { id: 'pin-parvati-trail', label: 'Pin Parvati Trail', module: require('./kml/pin-parvati-trail.kml') },
  { id: 'rupin-pass', label: 'Rupin Pass', module: require('./kml/rupin-pass.kml') },
  { id: 'sar-pass', label: 'Sar Pass', module: require('./kml/sar-pass.kml') },
];

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function lonToTileX(lon, zoom) {
  return Math.floor(((lon + 180) / 360) * (2 ** zoom));
}

function latToTileY(lat, zoom) {
  const latRad = toRadians(lat);
  return Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * (2 ** zoom)
  );
}

function parseCoordinatesFromKml(text) {
  const matches = [...text.matchAll(/<coordinates>([\s\S]*?)<\/coordinates>/gi)];
  const points = [];

  matches.forEach((match) => {
    const row = match[1].trim().split(/\s+/);
    row.forEach((triple) => {
      const [lonRaw, latRaw] = triple.split(',');
      const longitude = Number(lonRaw);
      const latitude = Number(latRaw);
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return;
      points.push({ latitude, longitude });
    });
  });

  return points;
}

function getBounds(points) {
  let minLat = 90;
  let maxLat = -90;
  let minLon = 180;
  let maxLon = -180;

  points.forEach((point) => {
    if (point.latitude < minLat) minLat = point.latitude;
    if (point.latitude > maxLat) maxLat = point.latitude;
    if (point.longitude < minLon) minLon = point.longitude;
    if (point.longitude > maxLon) maxLon = point.longitude;
  });

  const latPad = (maxLat - minLat) * 0.35 || 0.03;
  const lonPad = (maxLon - minLon) * 0.35 || 0.03;

  return {
    minLat: Math.max(-85.0511, minLat - latPad),
    maxLat: Math.min(85.0511, maxLat + latPad),
    minLon: Math.max(-180, minLon - lonPad),
    maxLon: Math.min(180, maxLon + lonPad),
  };
}

function generateMapHtml(coords, offlineMode, mapType, offlineMaxZoom) {
  const activeTemplate = mapType === 'osm' ? OSM_TEMPLATE : SATELLITE_TEMPLATE;
  const tileUrl = offlineMode ? `./offline-tiles/{z}/{x}/{y}.jpg` : activeTemplate;

  const polylineCoords = coords.map(c => [c.latitude, c.longitude]);
  const startPoint = polylineCoords[0];
  const endPoint = polylineCoords[polylineCoords.length - 1];

  let boundsLogic = '';
  if (polylineCoords.length > 0) {
    boundsLogic = `map.fitBounds(${JSON.stringify(polylineCoords)}, { padding: [80, 80] });`;
  } else {
    boundsLogic = `map.setView([20.5937, 78.9629], 5);`; // Default India
  }

  let markersHtml = '';
  if (startPoint) {
    markersHtml += `
      var startIcon = L.divIcon({className: 'custom-pin start-pin', html: '<div class="pin-inner"></div>'});
      L.marker(${JSON.stringify(startPoint)}, {icon: startIcon}).addTo(map).bindPopup('Trailhead');
    `;
  }
  if (endPoint && polylineCoords.length > 1) {
    markersHtml += `
      var endIcon = L.divIcon({className: 'custom-pin end-pin', html: '<div class="pin-inner"></div>'});
      L.marker(${JSON.stringify(endPoint)}, {icon: endIcon}).addTo(map).bindPopup('Destination');
    `;
  }
  
  let polylineHtml = '';
  if (polylineCoords.length > 1) {
    // A rugged Komoot style trail route appearance
    polylineHtml = `
      L.polyline(${JSON.stringify(polylineCoords)}, {color: '#3d3935', weight: 8, opacity: 0.9, lineCap: 'round', lineJoin: 'round'}).addTo(map);
      L.polyline(${JSON.stringify(polylineCoords)}, {color: '#FF6B35', weight: 4, opacity: 1, lineCap: 'round', lineJoin: 'round'}).addTo(map);
    `;
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        body { padding: 0; margin: 0; background-color: #f8f7f4; }
        html, body, #map { height: 100vh; width: 100vw; }
        .leaflet-container { background: #f8f7f4; }
        .leaflet-control-zoom { display: none; }
        .custom-pin { width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 8px rgba(0,0,0,0.5); }
        .start-pin { background: #22c55e; border: 3px solid #fff; }
        .end-pin { background: #ef4444; border: 3px solid #fff; }
        .pin-inner { width: 6px; height: 6px; background: #fff; border-radius: 50%; }
        .leaflet-control-scale-line { background: rgba(255, 255, 255, 0.9) !important; color: #3d3935 !important; border-color: #FF6B35 !important; font-weight: bold; padding: 4px 8px; border-radius: 4px; }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        var map = L.map('map', { zoomControl: false });
        window.baseLayer = L.tileLayer('${tileUrl}', {
          maxZoom: 19,
          ${offlineMode ? `maxNativeZoom: ${offlineMaxZoom},` : ''}
          attribution: 'Esri'
        }).addTo(map);

        ${mapType === 'satellite' ? `
          L.tileLayer('${offlineMode ? `./offline-tiles-labels/{z}/{x}/{y}.png` : SATELLITE_LABELS_TEMPLATE}', {
            maxZoom: 19,
            ${offlineMode ? `maxNativeZoom: ${offlineMaxZoom},` : ''}
          }).addTo(map);
        ` : ''}

        L.control.scale({imperial: false, position: 'bottomleft'}).addTo(map);

        // Geolocation for user tracking on trail
        map.locate({setView: false, watch: true, maxZoom: 16});
        map.on('locationfound', function(e) {
          if(window.userMarker) {
            window.userMarker.setLatLng(e.latlng);
          } else {
            window.userMarker = L.circleMarker(e.latlng, {
              radius: 8, color: '#ffffff', weight: 2, fillColor: '#3b82f6', fillOpacity: 1
            }).addTo(map);
          }
        });

        ${polylineHtml}
        ${markersHtml}
        ${boundsLogic}
      </script>
    </body>
    </html>
  `;
}

function buildTileJobs(bounds, mapType, maxZoom) {
  const template = mapType === 'osm' ? OSM_TEMPLATE : SATELLITE_TEMPLATE;
  const jobs = [];
  for (let z = MIN_ZOOM; z <= maxZoom; z += 1) {
    const xMin = lonToTileX(bounds.minLon, z);
    const xMax = lonToTileX(bounds.maxLon, z);
    const yMin = latToTileY(bounds.maxLat, z);
    const yMax = latToTileY(bounds.minLat, z);

    for (let x = xMin; x <= xMax; x += 1) {
      for (let y = yMin; y <= yMax; y += 1) {
        const url = template.replace('{z}', String(z))
          .replace('{y}', String(y))
          .replace('{x}', String(x));
        const filePath = `${OFFLINE_DIR}/${z}/${x}/${y}.jpg`;
        jobs.push({ filePath, url, z, x, y });

        if (mapType !== 'osm') {
          const labelUrl = SATELLITE_LABELS_TEMPLATE.replace('{z}', String(z))
            .replace('{y}', String(y))
            .replace('{x}', String(x));
          const labelFilePath = `${FileSystem.documentDirectory}offline-tiles-labels/${z}/${x}/${y}.png`;
          jobs.push({ filePath: labelFilePath, url: labelUrl, z, x, y });
        }
      }
    }
  }
  return jobs;
}

async function fileExists(path) {
  const info = await FileSystem.getInfoAsync(path);
  return info.exists;
}

async function ensureFolder(path) {
  await FileSystem.makeDirectoryAsync(path, { intermediates: true });
}

async function cacheTilesForTrail(points, mapType, onProgress, maxZoom = 14) {
  const bounds = getBounds(points);
  const jobs = buildTileJobs(bounds, mapType, maxZoom);
  let completed = 0;
  let saved = 0;

  const workers = 6;
  const queue = [...jobs];

  await ensureFolder(OFFLINE_DIR);

  const runWorker = async () => {
    while (queue.length > 0) {
      const job = queue.shift();
      if (!job) continue;
      const { filePath, url, z, x } = job;
      try {
        if (!(await fileExists(filePath))) {
          const folder = filePath.substring(0, filePath.lastIndexOf('/'));
          await ensureFolder(folder);
          await FileSystem.downloadAsync(url, filePath);
          saved += 1;
        }
      } catch {
        // Continue silently on single tile failure
      } finally {
        completed += 1;
        onProgress?.(completed, jobs.length, saved);
      }
    }
  };

  await Promise.all(Array.from({ length: workers }, runWorker));
  return { total: jobs.length, saved };
}

export default function App() {
  const [coords, setCoords] = useState([]);
  const [trailName, setTrailName] = useState('No trail selected');
  const [offlineMode, setOfflineMode] = useState(false);
  const [mapType, setMapType] = useState('osm');
  const [offlineMaxZoom, setOfflineMaxZoom] = useState(14);
  const [isCaching, setIsCaching] = useState(false);
  const [isLoadingTreks, setIsLoadingTreks] = useState(true);
  const [progressText, setProgressText] = useState('');
  const [treks, setTreks] = useState([]);
  const [selectedTrekId, setSelectedTrekId] = useState(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  
  const webViewRef = useRef(null);

  useEffect(() => {
    const loadBundledTreks = async () => {
      try {
        const loaded = [];
        for (const trek of TREK_SOURCES) {
          const asset = Asset.fromModule(trek.module);
          await asset.downloadAsync();
          const sourceUri = asset.localUri || asset.uri;
          if (!sourceUri) continue;

          const kmlText = await FileSystem.readAsStringAsync(sourceUri);
          const parsedCoords = parseCoordinatesFromKml(kmlText);
          if (parsedCoords.length < 2) continue;

          loaded.push({
            id: trek.id,
            label: trek.label,
            coords: parsedCoords,
          });
        }
        setTreks(loaded);
      } catch (error) {
        Alert.alert('Trek load failed', error?.message || 'Could not load bundled trek files.');
      } finally {
        setIsLoadingTreks(false);
      }
    };

    loadBundledTreks();
  }, []);

  const selectTrek = async (trek) => {
    setSelectedTrekId(trek.id);
    setCoords(trek.coords);
    setTrailName(trek.label);

    setIsCaching(true);
    setProgressText(`Caching ${mapType} maps...`);
    const report = await cacheTilesForTrail(trek.coords, mapType, (done, total) => {
      setProgressText(`Caching ${mapType} maps... ${done}/${total}`);
    });
    setOfflineMaxZoom(14);
    setIsCaching(false);
    setProgressText('');
    Alert.alert('Offline map ready', `Saved ${report.saved} of ${report.total} high-res tiles.`);
  };

  const importKml = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/vnd.google-earth.kml+xml', 'text/xml', 'application/xml', '*/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const text = await FileSystem.readAsStringAsync(asset.uri);
      const parsed = parseCoordinatesFromKml(text);

      if (parsed.length < 2) {
        Alert.alert('Invalid KML', 'Could not find enough coordinates in this file.');
        return;
      }

      setCoords(parsed);
      setTrailName(asset.name || 'Uploaded trail');
      setSelectedTrekId(null);

      setIsCaching(true);
      setProgressText(`Caching ${mapType} maps...`);
      const report = await cacheTilesForTrail(parsed, mapType, (done, total) => {
        setProgressText(`Caching ${mapType} maps... ${done}/${total}`);
      });
      setOfflineMaxZoom(14);
      setIsCaching(false);
      setProgressText('');
      Alert.alert('Offline map ready', `Saved ${report.saved} of ${report.total} high-res tiles.`);
    } catch (error) {
      setIsCaching(false);
      setProgressText('');
      Alert.alert('Upload failed', error?.message || 'Could not open the KML file.');
    }
  };

  const downloadDetailedMaps = async () => {
    setIsCaching(true);
    setProgressText(`Caching detailed ${mapType} maps...`);
    const report = await cacheTilesForTrail(coords, mapType, (done, total) => {
      setProgressText(`Caching detailed maps... ${done}/${total}`);
    }, 16);
    setOfflineMaxZoom(16);
    setIsCaching(false);
    setProgressText('');
    Alert.alert('Detailed offline map ready', `Saved ${report.saved} of ${report.total} high-res tiles.`);
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      
      <View style={styles.mapContainer}>
        <WebView
          ref={webViewRef}
          style={styles.map}
          source={{ 
            html: generateMapHtml(coords, offlineMode, mapType, offlineMaxZoom), 
            baseUrl: FileSystem.documentDirectory 
          }}
          originWhitelist={['*']}
          allowFileAccess={true}
          allowFileAccessFromFileURLs={true}
          allowUniversalAccessFromFileURLs={true}
          scrollEnabled={false}
          bounces={false}
        />
      </View>

      {/* Rugged Header Card */}
      <View style={styles.topCard}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Trail Explorer</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{trailName}</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{mapType.toUpperCase()}</Text>
        </View>
      </View>

      {/* Floating Map Actions */}
      <View style={styles.mapActions}>
        <TouchableOpacity 
          style={styles.actionBtn} 
          onPress={() => setMapType(t => t === 'osm' ? 'satellite' : 'osm')}
        >
          <Feather name={mapType === 'osm' ? 'image' : 'map'} size={20} color="#3d3935" />
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.actionBtn, offlineMode && styles.actionBtnActive]} 
          onPress={() => setOfflineMode(!offlineMode)}
        >
          <Feather name={offlineMode ? "wifi-off" : "wifi"} size={20} color={offlineMode ? "#FF6B35" : "#3d3935"} />
        </TouchableOpacity>
      </View>

      {/* Solid Rugged Bottom Panel */}
      <View style={styles.bottomCard}>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => setIsModalVisible(true)}>
          <Feather name="list" size={20} color="#fff" />
          <Text style={styles.primaryBtnText}>Browse Available Treks</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryBtn} onPress={importKml} disabled={isCaching}>
          {isCaching ? (
            <ActivityIndicator color="#FF6B35" size="small" />
          ) : (
            <Feather name="upload-cloud" size={20} color="#FF6B35" />
          )}
          <Text style={styles.secondaryBtnText}>
            {isCaching ? progressText : 'Load Custom KML'}
          </Text>
        </TouchableOpacity>

        {coords.length > 0 && !isCaching && (
          <TouchableOpacity style={styles.detailedBtn} onPress={downloadDetailedMaps}>
            <Feather name="download" size={16} color="#3d3935" />
            <Text style={styles.detailedBtnText}>Download Detailed Maps</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Treks Modal / Slide-up Sheet */}
      <Modal visible={isModalVisible} animationType="slide" transparent={true} onRequestClose={() => setIsModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Popular Trails</Text>
              <TouchableOpacity onPress={() => setIsModalVisible(false)} style={styles.closeBtn}>
                <Feather name="x" size={24} color="#94a3b8" />
              </TouchableOpacity>
            </View>
            
            {isLoadingTreks ? (
              <ActivityIndicator color="#f97316" size="large" style={{ marginTop: 40 }} />
            ) : (
              <ScrollView contentContainerStyle={styles.trekList}>
                {treks.map((trek) => (
                  <TouchableOpacity
                    key={trek.id}
                    style={[styles.trekRow, selectedTrekId === trek.id && styles.trekRowActive]}
                    onPress={() => { selectTrek(trek); setIsModalVisible(false); }}
                  >
                    <View style={styles.trekIconBox}>
                      <Feather name="map-pin" size={16} color={selectedTrekId === trek.id ? "#f97316" : "#94a3b8"} />
                    </View>
                    <Text style={[styles.trekRowText, selectedTrekId === trek.id && styles.trekRowTextActive]}>
                      {trek.label}
                    </Text>
                    {selectedTrekId === trek.id && <Feather name="check" size={18} color="#f97316" style={{marginLeft: 'auto'}} />}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f7f4' },
  mapContainer: { ...StyleSheet.absoluteFillObject },
  map: { flex: 1, backgroundColor: 'transparent' },
  
  topCard: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 50,
    left: 20, right: 20,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1, borderColor: '#e4e0d8',
    elevation: 8, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: {width:0, height:4}
  },
  headerText: { flex: 1, paddingRight: 10 },
  title: { color: '#1a1714', fontSize: 20, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  subtitle: { color: '#6b6560', fontSize: 14, fontWeight: '500', marginTop: 4 },
  badge: { backgroundColor: '#f8f7f4', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#FF6B35' },
  badgeText: { color: '#FF6B35', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  
  mapActions: {
    position: 'absolute', right: 20, top: 160, gap: 12
  },
  actionBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#ffffff',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#e4e0d8',
    elevation: 5, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5, shadowOffset: {width:0,height:2}
  },
  actionBtnActive: { borderColor: '#FF6B35', backgroundColor: 'rgba(255, 107, 53, 0.08)' },

  bottomCard: {
    position: 'absolute', bottom: 40, left: 20, right: 20,
    backgroundColor: '#ffffff', borderRadius: 20, padding: 20, gap: 14,
    borderWidth: 1, borderColor: '#e4e0d8',
    elevation: 10, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 15, shadowOffset: {width:0, height:-5}
  },
  primaryBtn: {
    backgroundColor: '#FF6B35', flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 16, borderRadius: 12
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
  
  secondaryBtn: {
    backgroundColor: 'transparent', flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 16, borderRadius: 12,
    borderWidth: 1.5, borderColor: '#FF6B35'
  },
  secondaryBtnText: { color: '#FF6B35', fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },

  detailedBtn: {
    backgroundColor: '#f8f7f4', flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1, borderColor: '#e4e0d8', marginTop: 4
  },
  detailedBtnText: { color: '#3d3935', fontSize: 14, fontWeight: '700' },

  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalContent: {
    backgroundColor: '#ffffff', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    height: '65%', padding: 24, borderWidth: 1, borderColor: '#e4e0d8', borderBottomWidth: 0
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { color: '#1a1714', fontSize: 22, fontWeight: '800' },
  closeBtn: { padding: 4, backgroundColor: '#f8f7f4', borderRadius: 20 },
  
  trekList: { gap: 12, paddingBottom: 40 },
  trekRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#ffffff', padding: 16, borderRadius: 14,
    borderWidth: 1, borderColor: '#e4e0d8'
  },
  trekRowActive: { borderColor: '#FF6B35', backgroundColor: 'rgba(255, 107, 53, 0.04)' },
  trekIconBox: { backgroundColor: '#f8f7f4', padding: 8, borderRadius: 10 },
  trekRowText: { color: '#3d3935', fontSize: 16, fontWeight: '600' },
  trekRowTextActive: { color: '#1a1714', fontWeight: '800' },
});
