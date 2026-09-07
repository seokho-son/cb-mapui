/**
 * Central Store Data Loaders Module (K8s Clusters, NLB, VPN)
 * @module core/central-loaders
 */
import axios from 'axios';
import { MultiPoint, Polygon } from 'ol/geom';
import { tbApiBase, getConfig } from './api.js';

const notifyDataSubscribers = () => { if (window.notifyDataSubscribers) window.notifyDataSubscribers(); };
const convexHull = (...args) => (window.convexHull ? window.convexHull(...args) : []);
const map = { render: () => { if (window.map) window.map.render(); } };

const k8sName = new Proxy([], {
  get: (target, prop) => (window.k8sName || [])[prop],
  set: (target, prop, val) => {
    if (!window.k8sName) window.k8sName = [];
    window.k8sName[prop] = val;
    return true;
  }
});
const k8sStatus = new Proxy([], {
  get: (target, prop) => (window.k8sStatus || [])[prop],
  set: (target, prop, val) => {
    if (!window.k8sStatus) window.k8sStatus = [];
    window.k8sStatus[prop] = val;
    return true;
  }
});
const k8sCoords = new Proxy([], {
  get: (target, prop) => (window.k8sCoords || [])[prop],
  set: (target, prop, val) => {
    if (!window.k8sCoords) window.k8sCoords = [];
    window.k8sCoords[prop] = val;
    return true;
  }
});
const k8sClusterGroups = new Proxy([], {
  get: (target, prop) => (window.k8sClusterGroups || [])[prop],
  set: (target, prop, val) => {
    if (!window.k8sClusterGroups) window.k8sClusterGroups = [];
    window.k8sClusterGroups[prop] = val;
    return true;
  }
});
const k8sClusterGroupNames = new Proxy([], {
  get: (target, prop) => (window.k8sClusterGroupNames || [])[prop],
  set: (target, prop, val) => {
    if (!window.k8sClusterGroupNames) window.k8sClusterGroupNames = [];
    window.k8sClusterGroupNames[prop] = val;
    return true;
  }
});

const geoResourceLocation = new Proxy({}, {
  get: (target, prop) => (window.geoResourceLocation || {})[prop],
  set: (target, prop, val) => {
    if (window.geoResourceLocation) window.geoResourceLocation[prop] = val;
    return true;
  }
});

const debugLog = new Proxy({}, {
  get: (target, prop) => {
    if (window.debugLog && typeof window.debugLog[prop] === 'function') {
      return window.debugLog[prop];
    }
    return () => {};
  }
});

const updateMapConnectionStatus = (s) => window.updateMapConnectionStatus?.(s);

// Function to sync Infra selection from Dashboard
function syncInfraSelectionFromDashboard(infraId) {
  const infraidEl = window.infraidElement || document.getElementById('infraid');
  console.log(`[SYNC] Attempting to sync Infra selection: ${infraId}`);
  console.log(`[SYNC] infraidElement exists:`, !!infraidEl);
  
  if (infraidEl && infraId) {
    console.log(`[SYNC] Current value: ${infraidEl.value}, New value: ${infraId}`);
    
    // Check if the option exists in the select element
    const optionExists = Array.from(infraidEl.options).some(option => option.value === infraId);
    console.log(`[SYNC] Option exists in select:`, optionExists);
    
    if (optionExists) {
      // Set the value in the Infra select element
      infraidEl.value = infraId;
      
      // Trigger change event to update dependent dropdowns
      const changeEvent = new Event('change', { bubbles: true });
      infraidEl.dispatchEvent(changeEvent);
      
      console.log(`[SYNC] Infra selection synced successfully: ${infraId}`);
    } else {
      console.log(`[SYNC] Infra ${infraId} not found in select options`);
    }
  } else {
    console.log(`[SYNC] Failed - infraidElement:`, !!infraidEl, `infraId:`, infraId);
  }
}

// Load K8s cluster data for dashboard and map
function loadK8sClusterData() {
  var hostname = window.configHostname;
  var port = window.configPort;
  var username = window.configUsername;
  var password = window.configPassword;
  var namespace = window.configNamespace;

  if (!namespace || namespace === "") {
    console.log("No namespace specified for K8s cluster data load");
    return;
  }

  // Set loading status
  window.cloudBaristaCentralData.apiStatus.k8sCluster = 'loading';

  // get k8sCluster list and put them on the map
  var url = `${tbApiBase()}/ns/${namespace}/k8sCluster`;
  axios({
    method: "get",
    url: url,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
    timeout: 600000,
  }).then((res) => {
    var obj = res.data;
    // console.log('K8s cluster API response:', obj);
    // console.log('K8s cluster API response structure:', JSON.stringify(obj, null, 2));
    
    // Update central data store - handle both response formats
    let k8sClusterData = [];
    if (obj.K8sClusterInfo) {
      k8sClusterData = obj.K8sClusterInfo;
      // console.log('Using K8sClusterInfo field');
    } else if (obj.cluster) {
      k8sClusterData = obj.cluster;
      // console.log('Using cluster field');
    }
    
    // console.log('Final k8sClusterData:', k8sClusterData);
    
    window.cloudBaristaCentralData.k8sCluster = k8sClusterData;
    window.cloudBaristaCentralData.resourceData.k8sCluster = k8sClusterData;
    
    // Update API status to success
    window.cloudBaristaCentralData.apiStatus.k8sCluster = 'success';
    window.cloudBaristaCentralData.apiStatus.lastK8sClusterUpdate = new Date();
    window.cloudBaristaCentralData.apiStatus.lastK8sClusterError = null;
    
    // Notify dashboard subscribers
    notifyDataSubscribers();
    
    // Update map icons and store name/status data
    if (k8sClusterData != null && k8sClusterData.length > 0) {
      var resourceLocation = [];
      
      // Clear previous K8s data
      k8sName.length = 0;
      k8sStatus.length = 0;
      k8sCoords.length = 0;
      k8sClusterGroups.length = 0;
      k8sClusterGroupNames.length = 0;
      
      // Temporary object to group clusters by clustergroup label
      // Note: Using plain object instead of Map because 'Map' is overridden by OpenLayers import
      const clusterGroupMap = {};
      
      console.log("resourceLocation k8s[0]");
      for (let i = 0; i < k8sClusterData.length; i++) {
        const item = k8sClusterData[i];
        if (item.connectionConfig && item.connectionConfig.regionDetail && item.connectionConfig.regionDetail.location) {
          const coords = [
            item.connectionConfig.regionDetail.location.longitude * 1,
            item.connectionConfig.regionDetail.location.latitude * 1 + 0.05,
          ];
          resourceLocation.push(coords);
          
          // Store K8s cluster name, status, and coordinates
          k8sName.push(item.name || item.id);
          k8sStatus.push(item.status || 'Unknown');
          k8sCoords.push(coords);
          
          // Group by clustergroup label if present
          if (item.label && item.label.clustergroup) {
            const groupName = item.label.clustergroup;
            if (!clusterGroupMap[groupName]) {
              clusterGroupMap[groupName] = [];
            }
            clusterGroupMap[groupName].push(coords);
          }
        }
      }
      
      // Create polygons for cluster groups with 2+ clusters
      // Note: 2 points create a line connecting clusters, which is intentional
      Object.entries(clusterGroupMap).forEach(([groupName, coords]) => {
        if (coords.length >= 2) {
          // Create deep copy for convexHull (it modifies the array)
          const pointsCopy = coords.map(c => [...c]);
          const hullPoints = convexHull(pointsCopy);
          
          if (hullPoints.length >= 2) {
            // Close the polygon (or line for 2 points)
            const closedHull = [...hullPoints, hullPoints[0]];
            k8sClusterGroups.push(new Polygon([closedHull]));
            k8sClusterGroupNames.push(groupName);
          }
        }
      });
      
      if (resourceLocation.length > 0) {
        geoResourceLocation.k8s[0] = new MultiPoint(resourceLocation);
      }
      
      // Trigger map re-render to display updated K8s cluster data
      map.render();
    } else {
      // Clear k8s icons when list is empty
      geoResourceLocation.k8s = [];
      k8sName.length = 0;
      k8sStatus.length = 0;
      k8sCoords.length = 0;
      k8sClusterGroups.length = 0;
      k8sClusterGroupNames.length = 0;
      
      // Trigger map re-render to clear K8s icons
      map.render();
    }
    
    // console.log('K8s cluster data loaded successfully:', k8sClusterData.length, 'clusters');
  })
    .catch(function (error) {
      // console.log("k8sCluster API error:", error);
      // console.log("Keeping existing K8s cluster data to preserve user experience");
      
      // Update API status to error but don't clear existing data
      window.cloudBaristaCentralData.apiStatus.k8sCluster = 'error';
      window.cloudBaristaCentralData.apiStatus.lastK8sClusterError = {
        timestamp: new Date(),
        message: error.message || 'Unknown error',
        code: error.code || 'UNKNOWN_ERROR'
      };
      
      // Don't clear existing data on API error - keep current state
      // This prevents UI from showing empty state when there are temporary API issues
      
      // Optional: Show user notification about the error while keeping data
      if (typeof updateMapConnectionStatus === 'function') {
        updateMapConnectionStatus('error');
        // Reset to normal status after a short delay
        setTimeout(() => {
          updateMapConnectionStatus('connected');
        }, 3000);
      }
      
      // Notify subscribers even on error so dashboard knows about the failed update attempt
      notifyDataSubscribers();
    });
}

// Load NLB (regional CSP NLB) data into the central store so the NLB manager, the Net
// graph and the Board table can consume window.cloudBaristaCentralData.nlb.
// One namespace-wide call; each item already carries its parent infraId.
async function loadNlbData() {
  try {
    const config = getConfig();
    const { username, password } = config;
    const res = await axios({
      method: "get",
      url: `${tbApiBase()}/ns/${window.configNamespace || config.username}/resources/nlb`,
      auth: { username, password },
      timeout: 10000,
    });
    window.cloudBaristaCentralData.nlb = (res.data && res.data.nlb) || [];
    notifyDataSubscribers();
  } catch (e) {
    console.log("loadNlbData error:", e && e.message);
    window.cloudBaristaCentralData.nlb = [];
  }
}
window.loadNlbData = loadNlbData;
// Kept for callers written against the previous per-Infra loader
window.loadNlbDataFromInfras = loadNlbData;

async function loadVpnDataFromInfras() {
  try {
    const config = getConfig();
    const { hostname, port, username, password } = config;
    const namespace = window.configNamespace || config.username;
    
    // Use existing Infra data from central store - no fallback API call.
    // NOTE: the central store key is `infraData` (not `infra`); reading `.infra`
    // here silently bailed, so VPN data was never loaded into the store and the
    // Net graph never saw any VPN. Read the correct key.
    let infraData = [];
    if (window.cloudBaristaCentralData && window.cloudBaristaCentralData.infraData) {
      infraData = window.cloudBaristaCentralData.infraData;
      debugLog.resource('Using cached Infra data for VPN loading:', infraData.length, 'Infras');
    } else {
      debugLog.resource('Central Infra data not available, skipping VPN loading');
      // Clear VPN data and return early - no point in loading VPN without Infras
      window.cloudBaristaCentralData.vpn = [];
      geoResourceLocation.vpn = [];
      return;
    }
    
    // If no Infras exist, no point in trying to load VPN data
    if (!infraData || infraData.length === 0) {
      debugLog.resource('No Infras available, skipping VPN loading');
      window.cloudBaristaCentralData.vpn = [];
      geoResourceLocation.vpn = [];
      return;
    }
    
    let allVpnData = [];
    let resourceLocation = [];
    
    // Load VPN data from each Infra
    for (const infra of infraData) {
      try {
        // option=InfoList returns full VpnInfo objects (stored, fast) under
        // vpnInfoList; the default (IdList) returns only ids under vpnIdList.
        const vpnUrl = `${tbApiBase()}/ns/${namespace}/infra/${infra.id}/vpn?option=InfoList`;
        const vpnResponse = await axios({
          method: "get",
          url: vpnUrl,
          auth: { username, password },
          timeout: 8000
        });

        const vpnData = vpnResponse.data?.vpnInfoList || vpnResponse.data?.vpn || [];
        debugLog.api(`VPN data for Infra ${infra.id}:`, vpnData.length, 'VPNs');
        
        // Add Infra ID to each VPN for reference
        vpnData.forEach(vpn => {
          vpn.infraId = infra.id;
          allVpnData.push(vpn);
          
          // Extract location data for map display
          if (vpn.vpnSites && vpn.vpnSites.length > 0) {
            for (let site of vpn.vpnSites) {
              if (site.connectionConfig?.regionDetail?.location) {
                resourceLocation.push([
                  site.connectionConfig.regionDetail.location.longitude * 1,
                  site.connectionConfig.regionDetail.location.latitude * 1 + 0.05,
                ]);
              }
            }
          } else if (vpn.connectionConfig?.regionDetail?.location) {
            resourceLocation.push([
              vpn.connectionConfig.regionDetail.location.longitude * 1,
              vpn.connectionConfig.regionDetail.location.latitude * 1 + 0.05,
            ]);
          }
        });
        
      } catch (vpnError) {
        // Silently continue if VPN API fails for individual Infra
        debugLog.api(`VPN API error for Infra ${infra.id}:`, vpnError.message);
      }
    }
    
    // Store VPN data in central store
    window.cloudBaristaCentralData.vpn = allVpnData;
    debugLog.resource('Total VPN data stored:', allVpnData.length, 'VPNs from', infraData.length, 'Infras');
    
    // Notify Dashboard subscribers about VPN data update
    notifyDataSubscribers();
    
    // Update map display
    if (resourceLocation.length > 0) {
      geoResourceLocation.vpn[0] = new MultiPoint([resourceLocation]);
      debugLog.mapOp("geoResourceLocation.vpn[0] updated with", resourceLocation.length, "locations");
    } else {
      geoResourceLocation.vpn = [];
    }
    
  } catch (error) {
    debugLog.api("VPN data loading error:", error);
    window.cloudBaristaCentralData.vpn = [];
    geoResourceLocation.vpn = [];
  }
}

// Make function available globally for Dashboard to call
window.syncInfraSelectionFromDashboard = syncInfraSelectionFromDashboard;


