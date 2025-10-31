/*
Copyright 2019 The Cloud-Barista Authors.
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at
    http://www.apache.org/licenses/LICENSE-2.0
Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

----
Copyright for OpenLayers (https://openlayers.org/)

BSD 2-Clause License

Copyright 2005-present, OpenLayers Contributors
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
----
*/

// Debug Configuration
const DEBUG_CONFIG = {
  ENABLE_PERFORMANCE_LOGS: false,  // Map performance related logs
  ENABLE_API_RESPONSE_LOGS: false, // API response logs 
  ENABLE_VM_DEBUG_LOGS: false,     // Detailed VM structure logs
  ENABLE_RESOURCE_LOGS: false,     // Resource loading logs
  ENABLE_MAP_OPERATION_LOGS: false // Map operation logs
};

// Debug helper functions
const debugLog = {
  performance: (...args) => DEBUG_CONFIG.ENABLE_PERFORMANCE_LOGS && console.log('[Performance]', ...args),
  api: (...args) => DEBUG_CONFIG.ENABLE_API_RESPONSE_LOGS && console.log('[API]', ...args),
  vm: (...args) => DEBUG_CONFIG.ENABLE_VM_DEBUG_LOGS && console.log('[VM Debug]', ...args),
  resource: (...args) => DEBUG_CONFIG.ENABLE_RESOURCE_LOGS && console.log('[Resource]', ...args),
  mapOp: (...args) => DEBUG_CONFIG.ENABLE_MAP_OPERATION_LOGS && console.log('[Map]', ...args)
};

// OpenLayers CSS
import "ol/ol.css";

// OpenLayers core components
import Map from "ol/Map";
import View from "ol/View";
import Feature from "ol/Feature";
import Overlay from "ol/Overlay";

// OpenLayers geometry types
import { MultiPoint, Point, LineString, Polygon } from "ol/geom";

// OpenLayers layer types
import TileLayer from "ol/layer/Tile";
import { Vector as VectorLayer } from "ol/layer";

// OpenLayers source types
import OSM from "ol/source/OSM";
import { TileJSON, Vector as VectorSource } from "ol/source";

// OpenLayers style components
import {
  Circle as CircleStyle,
  Fill,
  Stroke,
  Style,
  Text,
  Icon,
} from "ol/style";

// OpenLayers utilities and controls
import { getVectorContext } from "ol/render";
import { useGeographic, toLonLat } from "ol/proj";
import { toStringHDMS, createStringXY } from "ol/coordinate";
import MousePosition from "ol/control/MousePosition";
import { defaults as defaultControls } from "ol/control";

// Third-party libraries
import Swal from "sweetalert2";
import axios, { AxiosError } from "axios";
import JSONFormatter from "json-formatter-js";

useGeographic();
var i, j;
var cnti, cntj;

const cntInit = 0;
var cnt = cntInit;

function getActionAnimation(targetAction) {
  if (!targetAction || targetAction === "None" || targetAction === "") {
    return "";
  }
  
  const spinChars = ['◐', '◓', '◑', '◒'];
  const index = Math.floor(Date.now() / 150) % spinChars.length;
  return ' ' + spinChars[index];
}

// Get color for target action spinner
function getTargetActionColor(targetAction) {
  if (!targetAction) return [0, 0, 0, 1]; // black for default/no action
  
  const action = targetAction.toLowerCase();
  
  switch (action) {
    case 'create':
      return [59, 130, 246, 1]; // blue #3b82f6
    case 'terminate':
      return [239, 68, 68, 1]; // red #ef4444
    case 'suspend':
      return [107, 114, 128, 1]; // gray #6b7280
    case 'resume':
      return [59, 130, 246, 1]; // blue #3b82f6
    case 'restart':
    case 'reboot':
      return [249, 115, 22, 1]; // orange #f97316
    default:
      return [0, 0, 0, 1]; // black for unknown actions
  }
}

//var n = 1000;
var geometries = new Array();
var geometriesPoints = new Array();
var mciName = new Array();
var mciStatus = new Array();
var mciTargetAction = new Array(); // Store targetAction information for each MCI
var mciGeo = new Array();

var k8sName = new Array();
var k8sStatus = new Array();
var k8sCoords = new Array(); // Store individual coordinates for text rendering

var cspListDisplayEnabled = document.getElementById("displayOn");
var recommendPolicy = document.getElementById("recommendPolicy");
var selectApp = document.getElementById("selectApp");

// Configuration variables (previously from removed form elements)
var configHostname = "localhost";
var configPort = "1323";
var configUsername = "default";
var configPassword = "default";

// Helper function to get current configuration
function getConfig() {
  return {
    hostname: configHostname,
    port: configPort,
    username: configUsername,
    password: configPassword
  };
}

var namespaceElement = document.getElementById("namespace");
var mciidElement = document.getElementById("mciid");

// Central Data Store for sharing with Dashboard
window.cloudBaristaCentralData = {
  mciData: [],
  vmData: [],
  resourceData: {},
  vNet: [],
  securityGroup: [],
  sshKey: [],
  k8sCluster: [],
  connection: [],
  vpn: [],
  customImage: [],
  dataDisk: [],
  objectStorage: [],
  sqlDb: [],
  lastUpdated: null,
  subscribers: [],
  // API status tracking for better error handling
  apiStatus: {
    k8sCluster: 'unknown', // 'loading', 'success', 'error', 'unknown'
    lastK8sClusterUpdate: null,
    lastK8sClusterError: null
  }
};

// Subscribe to data updates
window.subscribeToDataUpdates = function(callback) {
  window.cloudBaristaCentralData.subscribers.push(callback);
};

// Notify all subscribers when data changes
function notifyDataSubscribers() {
  window.cloudBaristaCentralData.lastUpdated = new Date();
  window.cloudBaristaCentralData.subscribers.forEach(callback => {
    try {
      callback(window.cloudBaristaCentralData);
    } catch (error) {
      console.log('Error notifying subscriber:', error);
    }
  });
}

// Initialize map's Last Updated display
function initializeMapLastUpdated() {
  const mapLastUpdatedElement = document.getElementById('mapLastUpdatedTime');
  if (!mapLastUpdatedElement) return;
  
  // Subscribe to central data updates
  window.subscribeToDataUpdates(function(centralData) {
    if (centralData.lastUpdated) {
      mapLastUpdatedElement.textContent = new Date(centralData.lastUpdated).toLocaleTimeString('en-US');
    } else {
      mapLastUpdatedElement.textContent = 'Never';
    }
  });
  
  // Initial display
  if (window.cloudBaristaCentralData.lastUpdated) {
    mapLastUpdatedElement.textContent = new Date(window.cloudBaristaCentralData.lastUpdated).toLocaleTimeString('en-US');
  } else {
    mapLastUpdatedElement.textContent = 'Never';
  }
}

// Update map connection status
function updateMapConnectionStatus(status) {
  const statusElement = document.getElementById('mapConnectionStatus');
  if (!statusElement) return;
  
  // Set consistent styling for all states with wider fixed width
  statusElement.style.fontSize = '10px';
  statusElement.style.minWidth = '95px';
  statusElement.style.width = '95px';
  statusElement.style.textAlign = 'center';
  statusElement.style.display = 'inline-block';
  statusElement.style.whiteSpace = 'nowrap';
  statusElement.style.overflow = 'hidden';
  statusElement.style.textOverflow = 'ellipsis';
  
  switch (status) {
    case 'connected':
      statusElement.className = 'badge badge-success';
      statusElement.innerHTML = '<i class="fas fa-check-circle" style="margin-right: 3px;"></i>Connected';
      break;
    case 'connecting':
      statusElement.className = 'badge badge-warning';
      statusElement.innerHTML = '<i class="fas fa-sync fa-spin" style="margin-right: 3px;"></i>Updating';
      break;
    case 'disconnected':
      statusElement.className = 'badge badge-danger';
      statusElement.innerHTML = '<i class="fas fa-times-circle" style="margin-right: 3px;"></i>No Data';
      break;
    default:
      statusElement.className = 'badge badge-secondary';
      statusElement.innerHTML = '<i class="fas fa-question-circle" style="margin-right: 3px;"></i>Unknown';
  }
}

// Show/hide map refresh indicator
function showMapRefreshIndicator(show) {
  const indicator = document.getElementById('mapRefreshIndicator');
  if (indicator) {
    indicator.style.visibility = show ? 'visible' : 'hidden';
  }
}

// Show map settings (simple version)
function showMapSettings() {
  // Get current refresh interval from global variable
  const currentRefreshInterval = refreshInterval.toString();
  
  // Define available refresh intervals
  const intervals = [1, 5, 10, 20, 30, 40, 50, 100];
  
  // Generate radio button options
  const radioOptions = intervals.map(interval => {
    const checked = currentRefreshInterval == interval ? 'checked' : '';
    return `
      <div style="margin: 8px 0; text-align: left;">
        <input type="radio" id="refresh-${interval}" name="refreshInterval" value="${interval}" ${checked}>
        <label for="refresh-${interval}" style="margin-left: 8px; font-weight: normal;">${interval} seconds</label>
      </div>
    `;
  }).join('');
  
  Swal.fire({
    title: 'Map Settings',
    html: `
    <style>
      .swal2-radio-container {
        text-align: left;
        margin: 10px 0;
      }
      .swal2-label {
        margin-bottom: 10px;
        font-weight: bold;
        display: block;
      }
    </style>
    <p>⏱️ Configure Data Refresh Interval</p>
    <div class="swal2-radio-container">
      <label class="swal2-label">⏱️ Select Refresh Interval:</label>
      ${radioOptions}
    </div>
  `,
    showCancelButton: true,
    confirmButtonText: 'Apply Settings',
    preConfirm: () => {
      const selectedInterval = document.querySelector('input[name="refreshInterval"]:checked');
      if (!selectedInterval) {
        Swal.showValidationMessage('Please select a refresh interval');
        return false;
      }
      return { refreshInterval: selectedInterval.value };
    }
  }).then((result) => {
    if (result.isConfirmed) {
      const newRefreshInterval = parseInt(result.value.refreshInterval);
      
      // Update global refresh interval variable
      refreshInterval = newRefreshInterval;
      
      // Show success message
      Swal.fire({
        icon: 'success',
        title: 'Settings Applied',
        text: `Refresh interval set to ${newRefreshInterval} seconds`,
        timer: 2000,
        showConfirmButton: false
      });
    }
  });
}

// Performance monitoring and memory management
let mapPerformanceMetrics = {
  layerCount: 0,
  featureCount: 0,
  lastCleanupTime: Date.now(),
  renderCount: 0
};

// Map performance cleanup function
function performMapCleanup() {
  const now = Date.now();
  const timeSinceLastCleanup = now - mapPerformanceMetrics.lastCleanupTime;
  
  // Run cleanup every 10 minutes or when layer count is high
  if (timeSinceLastCleanup > 600000 || mapPerformanceMetrics.layerCount > 50) {
    debugLog.performance('Running map cleanup...');
    
    // Count current layers
    let currentLayerCount = 0;
    map.getLayers().forEach(() => currentLayerCount++);
    
    // If too many layers, clear and refresh
    if (currentLayerCount > 50) {
      debugLog.performance(`Too many layers (${currentLayerCount}), clearing map...`);
      clearMap();
    }
    
    mapPerformanceMetrics.lastCleanupTime = now;
    mapPerformanceMetrics.layerCount = currentLayerCount;
    
    debugLog.performance(`Cleanup completed. Current layers: ${currentLayerCount}`);
  }
}

// Map cleanup on page unload
function performMapFinalCleanup() {
  debugLog.performance('Performing final map cleanup...');
  
  // Clear all timers
  if (window.mapRenderTimeout) {
    clearTimeout(window.mapRenderTimeout);
  }
  
  // Clear map properly
  clearMap();
  
  // Reset performance metrics
  mapPerformanceMetrics = {
    layerCount: 0,
    featureCount: 0,
    lastCleanupTime: Date.now(),
    renderCount: 0
  };
  
  debugLog.performance('Final cleanup completed');
}

// Add cleanup events
window.addEventListener('beforeunload', performMapFinalCleanup);
window.addEventListener('unload', performMapFinalCleanup);
window.addEventListener('pagehide', performMapFinalCleanup);

// Periodic map performance monitoring
setInterval(performMapCleanup, 300000); // Check every 5 minutes

// Export functions for global access
window.updateMapConnectionStatus = updateMapConnectionStatus;
window.showMapSettings = showMapSettings;
window.showMapRefreshIndicator = showMapRefreshIndicator;
window.performMapCleanup = performMapCleanup;

const typeStringConnection = "connection";
const typeStringProvider = "provider";
const typeStringImage = "image";
const typeStringSpec = "spec";
const typeStringSG = "securityGroup";
const typeStringSshKey = "sshKey";
const typeStringVNet = "vNet";
const typeInfo = "info";
const typeError = "error";

var tileLayer = new TileLayer({
  source: new OSM(),
});

/*
 * Create the map.
 */
var map = new Map({
  layers: [tileLayer],
  target: "map",
  view: new View({
    center: [30, 30],
    zoom: 3,
  }),
  //projection: 'EPSG:4326'
});

// Optimized clearMap function to prevent memory leaks
function clearMap() {
  debugLog.mapOp("Map cleared - optimized");
  
  // Clear geometry arrays
  geometries = [];
  mciTargetAction = [];
  geoResourceLocation.k8s = [];
  geoResourceLocation.sg = [];
  geoResourceLocation.sshKey = [];
  geoResourceLocation.vnet = [];
  geoResourceLocation.vpn = [];

  // Remove all layers except the base tile layer to prevent memory leaks
  const layersToRemove = [];
  map.getLayers().forEach(function(layer) {
    if (layer !== tileLayer) { // Keep only the base tile layer
      layersToRemove.push(layer);
    }
  });
  
  // Remove the layers
  layersToRemove.forEach(function(layer) {
    map.removeLayer(layer);
    
    // Dispose of vector sources to free up memory
    if (layer.getSource && typeof layer.getSource === 'function') {
      const source = layer.getSource();
      if (source && source.clear && typeof source.clear === 'function') {
        source.clear();
      }
      // Dispose features in vector sources
      if (source && source.getFeatures && typeof source.getFeatures === 'function') {
        const features = source.getFeatures();
        features.forEach(feature => {
          if (feature.dispose && typeof feature.dispose === 'function') {
            feature.dispose();
          }
        });
      }
    }
  });

  debugLog.performance(`Removed ${layersToRemove.length} layers`);
  
  // Force garbage collection of map rendering
  map.render();
}
window.clearMap = clearMap;

function clearCircle(option) {
  //document.getElementById("latLonInputPairArea").innerHTML = '';
  if (option == "clearText") {
    debugLog.mapOp("Circle configuration cleared");
  }
  latLonInputPairIdx = 0;
  vmSubGroupReqeustFromSpecList = [];
  recommendedSpecList = [];
  cspPointsCircle = [];
  geoCspPointsCircle = [];
  
  // Update SubGroup review panel
  if (typeof updateSubGroupReview === 'function') {
    updateSubGroupReview();
  }
}
window.clearCircle = clearCircle;

function writeLatLonInputPair(idx, lat, lon) {
  var recommendedSpec = getRecommendedSpec(idx, lat, lon);
  var latf = lat.toFixed(4);
  var lonf = lon.toFixed(4);

  //document.getElementById("latLonInputPairArea").innerHTML +=
  `VM ${idx + 1}: (${latf}, ${lonf}) / `;
  if (idx == 0) {
    debugLog.mapOp("Started MCI configuration");
  }
  debugLog.mapOp(`VM-${idx + 1} Location: ${latf}, ${lonf} | Best Spec: `);
}

var latLonInputPairIdx = 0;
var vmSubGroupReqeustFromSpecList = new Array();
var recommendedSpecList = new Array();

map.on("singleclick", function (event) {
  const coord = event.coordinate;
  // document.getElementById('latitude').value = coord[1];
  // document.getElementById('longitude').value = coord[0];

  // Activate provision-tab when user clicks on map to place circle
  try {
    // Remove active class from all tabs
    document.querySelectorAll('.nav-link').forEach(tab => {
      tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-pane').forEach(pane => {
      pane.classList.remove('show', 'active');
    });
    
    // Activate provision-tab
    const provisionTab = document.getElementById('provision-tab');
    const provisionPane = document.getElementById('provision');
    
    if (provisionTab && provisionPane) {
      provisionTab.classList.add('active');
      provisionPane.classList.add('show', 'active');
      
      // Trigger Bootstrap tab shown event if needed
      if (typeof $ !== 'undefined' && $.fn.tab) {
        $(provisionTab).tab('show');
      }
    }
  } catch (error) {
    console.log('Failed to activate provision tab:', error);
  }

  writeLatLonInputPair(latLonInputPairIdx, coord[1], coord[0]);
  latLonInputPairIdx++;
});

// Right-click context menu for MCI control
map.on("contextmenu", function (event) {
  event.preventDefault(); // Prevent default browser context menu
  
  const coord = event.coordinate;
  const nearestMci = findNearestMci(coord);
  
  if (nearestMci) {
    showMciContextMenu(event.pixel, nearestMci);
  } else {
    // Show message when no MCI is found nearby
    Swal.fire({
      icon: 'info',
      title: 'Right-click Menu: No MC-Infra Selected!',
      text: 'Right-click near a MCI Name to open the Menu.',
      toast: true,
      position: 'top-end',
      showConfirmButton: false,
      timer: 3000,
      timerProgressBar: true
    });
  }
});

// Mouse hover effect to show when MCI is selectable
map.on("pointermove", function (event) {
  const coord = event.coordinate;
  const nearestMci = findNearestMci(coord);
  const mapElement = map.getTargetElement();
  const tooltip = document.getElementById('mouseTooltip');
  
  if (nearestMci) {
    // Change cursor to pointer when MCI is nearby
    mapElement.style.cursor = 'pointer';
    
    // Update tooltip to show MCI name and hint
    if (tooltip) {
      tooltip.innerHTML = `➕ ┃ 🕹️ ${nearestMci.name}`;
    }
  } else {
    // Reset cursor to default crosshair
    mapElement.style.cursor = 'crosshair';
    
    // Reset tooltip to original content
    if (tooltip) {
      tooltip.innerHTML = '➕ ┃ 🕹️';
    }
  }
});

// Function to find the nearest MCI to clicked coordinates
function findNearestMci(clickCoord) {
  let nearestMci = null;
  let minDistance = Infinity;
  
  // Convert click coordinate to pixel coordinate for easier calculation
  const clickPixel = map.getPixelFromCoordinate(clickCoord);
  
  // Search through all MCI geometries
  for (let i = 0; i < geometries.length; i++) {
    if (geometries[i] && mciName[i]) {
      let mciCoord;
      
      // Handle different geometry types
      if (geometries[i].getType() === 'Point') {
        mciCoord = geometries[i].getCoordinates();
      } else if (geometries[i].getType() === 'Polygon') {
        // For polygon, use centroid
        const extent = geometries[i].getExtent();
        mciCoord = [(extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2];
      }
      
      if (mciCoord) {
        // Convert MCI coordinate to pixel coordinate
        const mciPixel = map.getPixelFromCoordinate(mciCoord);
        
        // Calculate text position in pixels (same calculation as in drawObjects)
        const nameLines = splitMciNameToLines(mciName[i]);
        const baseScale = changeSizeByName(mciName[i] + mciStatus[i]) + 0.1;
        const baseOffsetY = 32 * changeSizeByName(mciName[i] + mciStatus[i]);
        const lineHeight = 12 * baseScale;
        
        // Calculate the center of the text block
        const textCenterY = mciPixel[1] + baseOffsetY + (nameLines.length * lineHeight / 2);
        const textPixel = [mciPixel[0], textCenterY];
        
        // Calculate distance in pixels
        const dx = clickPixel[0] - textPixel[0];
        const dy = clickPixel[1] - textPixel[1];
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < minDistance) {
          minDistance = distance;
          nearestMci = {
            name: mciName[i],
            status: mciStatus[i],
            index: i,
            distance: distance
          };
        }
      }
    }
  }
  
  // Only return if MCI is reasonably close (within 100 pixels)
  return (minDistance < 100) ? nearestMci : null;
}

// Function to show MCI context menu
function showMciContextMenu(pixel, mciInfo) {
  // Set the selected MCI in the control panel
  const mciSelect = document.getElementById('mciid');
  if (mciSelect) {
    // Find and select the MCI option
    for (let option of mciSelect.options) {
      if (option.value === mciInfo.name) {
        mciSelect.value = mciInfo.name;
        // Trigger change event to update dependent fields
        mciSelect.dispatchEvent(new Event('change'));
        break;
      }
    }
  }
  
  // Show context menu using SweetAlert
  Swal.fire({
    title: `🕹️ Control MCI: ${mciInfo.name}`,
    html: `
      <div style="text-align: left; margin-bottom: 20px;">
        <p><strong>Status:</strong> ${mciInfo.status}</p>
        <p><strong>Distance:</strong> ${mciInfo.distance.toFixed(3)} units</p>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-top: 15px;">

        <button onclick="showActionsMenu(); Swal.close();" class="btn btn-success btn-context">🕹️ Control</button>      
        <button onclick="statusMCI(); Swal.close();" class="btn btn-success btn-context">📊 Status</button>
        <button onclick="getAccessInfo(); Swal.close();" class="btn btn-success btn-context">🔑 Access Info</button>

        <button onclick="executeRemoteCmd(); Swal.close();" class="btn btn-warning btn-context">💻 Remote Cmd</button>
        <button onclick="transferFileToMci(); Swal.close();" class="btn btn-warning btn-context">📁 File Transfer</button>
        <button onclick="document.querySelector('.save-file').click(); Swal.close();" class="btn btn-warning btn-context">💾 Download Key</button>

        <button onclick="showSnapshotManagementModal(); Swal.close();" class="btn btn-info btn-context">📸 Snapshots</button>       
        <button onclick="manageNLB(); Swal.close();" class="btn btn-info btn-context">⚖️ NLB</button>
        <button onclick="updateFirewallRules(); Swal.close();" class="btn btn-info btn-context">🔥 Firewall</button>

        <button onclick="scaleOutMciFromContext('` + mciInfo.name + `'); Swal.close();" class="btn btn-primary btn-context">⬆️ Scale Out</button>

        <button onclick="executeAction('delete'); Swal.close();" class="btn btn-danger btn-context" style="grid-column: span 2;">🗑️ Delete MCI</button>
      </div>
    `,
    showConfirmButton: false,
    showCancelButton: true,
    cancelButtonText: '❌ Close',
    width: '700px',
    customClass: {
      popup: 'swal2-mci-context'
    }
  });
}

// Initialize an object to keep track of the active spinner tasks
let spinnerStack = {};
// A counter to generate unique IDs for spinner tasks
let currentSpinnerId = 0;

// Function to create a unique spinner task ID based on the function name
function generateSpinnerId(functionName) {
  currentSpinnerId++; // Increment the ID
  return "[" + currentSpinnerId + "] " + functionName; // Return the unique task ID
}

// Function to add a new task to the spinner stack and update the spinner's visibility
function addSpinnerTask(functionName) {
  const taskId = generateSpinnerId(functionName); // Create a unique task ID
  spinnerStack[taskId] = true; // Add the task to the stack
  updateSpinnerVisibility(); // Update the spinner display
  return taskId; // Return the task ID for later reference
}

// Function to remove a task from the spinner stack by its ID and update the spinner's visibility
function removeSpinnerTask(taskId) {
  if (spinnerStack[taskId]) {
    delete spinnerStack[taskId]; // Remove the task from the stack
    updateSpinnerVisibility(); // Update the spinner display
  }
}

// Function to update the spinner's visibility based on the active tasks in the stack
function updateSpinnerVisibility() {
  const spinnerContainer = document.getElementById("spinner-container"); // Get the spinner container element
  const spinnerText = document.getElementById("spinner-text"); // Get the spinner text element

  // Check if there are any tasks remaining in the stack
  const tasksRemaining = Object.keys(spinnerStack).length > 0;

  if (tasksRemaining) {
    spinnerContainer.style.display = "flex"; // If there are tasks, display the spinner
    // Update the spinner text to show all active task names
    spinnerText.textContent = Object.keys(spinnerStack).join(",  ");
  } else {
    spinnerContainer.style.display = "none"; // If no tasks, hide the spinner
  }
}

// Display Icon for Cloud locations
// npm i -s csv-parser
const http = require("http");
const csv = require("csv-parser");

const csvPath =
  "https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/assets/cloudlocation.csv";
var cloudLocation = [];
var cspPointsCircle = [];
var geoCspPointsCircle = new Array();
var geoResourceLocation = {
  sshKey: [],
  sg: [],
  k8s: [],
  vnet: [],
  vpn: []
};

var cspPoints = {};
var geoCspPoints = {};

function displayCSPListOn() {
  if (cspListDisplayEnabled.checked) {
    cloudLocation = [];
    http.get(csvPath, (response) => {
      response
        .pipe(csv())
        .on("data", (chunk) => cloudLocation.push(chunk))
        .on("end", () => {
          debugLog.resource('Loaded cloud location data:', cloudLocation.length, 'regions');

          debugLog.mapOp(
            "[Complete] Display Known Cloud Regions: " +
            cloudLocation.length
          );

          cloudLocation.forEach((location) => {
            const { CloudType, Longitude, Latitude } = location;
            const cloudTypeLower = CloudType.toLowerCase();
            if (!cspPoints[cloudTypeLower]) {
              cspPoints[cloudTypeLower] = [];
            }
            if (!geoCspPoints[cloudTypeLower]) {
              geoCspPoints[cloudTypeLower] = [];
            }

            cspPoints[cloudTypeLower].push([
              parseFloat(Longitude),
              parseFloat(Latitude),
            ]);
          });

          Object.keys(cspPoints).forEach((csp) => {
            if (cspPoints[csp].length > 0) {
              geoCspPoints[csp][0] = new MultiPoint(cspPoints[csp]);
            }
          });
        });
    });
  } else {
    Object.keys(cspPoints).forEach((csp) => {
      cspPoints[csp] = [];
      geoCspPoints[csp] = [];
    });
  }
}
window.displayCSPListOn = displayCSPListOn;

function endpointChanged() {
  //getMci();
  var iframe = document.getElementById('iframe');
  var iframe2 = document.getElementById('iframe2');

  iframe.src = "http://" + configHostname + ":1324/swagger.html";
  iframe2.src = "http://" + configHostname + ":1024/spider/adminweb";
}
window.endpointChanged = endpointChanged;


var alpha = 0.3;
var cororList = [
  [153, 255, 51, alpha],
  [210, 210, 10, alpha],
  [0, 176, 244, alpha],
  [200, 10, 10, alpha],
  [0, 162, 194, alpha],
  [38, 63, 143, alpha],
  [58, 58, 58, alpha],
  [81, 45, 23, alpha],
  [225, 136, 65, alpha],
  [106, 34, 134, alpha],
  [255, 162, 191, alpha],
  [239, 45, 53, alpha],
  [255, 255, 255, alpha],
  [154, 135, 199, alpha],
];

alpha = 0.6;
var cororLineList = [
  [0, 255, 0, alpha],
  [210, 210, 10, alpha],
  [0, 176, 244, alpha],
  [200, 10, 10, alpha],
  [0, 162, 194, alpha],
  [38, 63, 143, alpha],
  [58, 58, 58, alpha],
  [81, 45, 23, alpha],
  [225, 136, 65, alpha],
  [106, 34, 134, alpha],
  [255, 162, 191, alpha],
  [239, 45, 53, alpha],
  [255, 255, 255, alpha],
  [154, 135, 199, alpha],
];

var polygonFeature = new Feature(
  new Polygon([
    [
      [10, -3],
      [-5, 2],
      [-1, 1],
    ],
  ])
);

function createStyle(src) {
  return new Style({
    image: new Icon({
      anchor: [0.5, 0.5],
      crossOrigin: "anonymous",
      src: src,
      imgSize: [50, 50],
      scale: 0.1,
    }),
  });
}

// temporary point
var pnt = new Point([-68, -50]);

addIconToMap("img/iconVm.png", pnt, "001");
var iconStyleVm = new Style({
  image: new Icon({
    crossOrigin: "anonymous",
    src: "img/iconVm.png",
    opacity: 1.0,
    scale: 0.7,
  }),
});
addIconToMap("img/iconK8s.png", pnt, "001");
var iconStyleK8s = new Style({
  image: new Icon({
    crossOrigin: "anonymous",
    src: "img/iconK8s.png",
    opacity: 1.0,
    scale: 0.7,
  }),
});


addIconToMap("img/iconNlb.png", pnt, "001");
var iconStyleNlb = new Style({
  image: new Icon({
    crossOrigin: "anonymous",
    src: "img/iconNlb.png",
    opacity: 1.0,
    scale: 0.8,
  }),
});
addIconToMap("img/iconVPN.png", pnt, "001");
var iconStyleVPN = new Style({
  image: new Icon({
    crossOrigin: "anonymous",
    src: "img/iconVPN.png",
    opacity: 1.0,
    scale: 0.8,
  }),
});

addIconToMap("img/iconVnet.png", pnt, "001");
var iconStyleVnet = new Style({
  image: new Icon({
    crossOrigin: "anonymous",
    src: "img/iconVnet.png",
    opacity: 1.0,
    scale: 0.8,
  }),
});
addIconToMap("img/iconSG.png", pnt, "001");
var iconStyleSG = new Style({
  image: new Icon({
    crossOrigin: "anonymous",
    src: "img/iconSG.png",
    opacity: 1.0,
    scale: 0.8,
  }),
});
addIconToMap("img/iconKey.png", pnt, "001");
var iconStyleKey = new Style({
  image: new Icon({
    crossOrigin: "anonymous",
    src: "img/iconKey.png",
    opacity: 1.0,
    scale: 0.8,
  }),
});

addIconToMap("img/circle.png", pnt, "001");
// Pin emoji style for MCI configuration points
var iconStyleCircle = new Style({
  text: new Text({
    text: '📍',
    font: '32px Arial', 
    fill: new Fill({
      color: '#ff4444'
    }),
    stroke: new Stroke({
      color: '#ffffff',
      width: 4
    }),
    offsetY: -16, 
    scale: 1.0   
  })
});

// CSP location icon styles
const cspIconImg = {
  azure: "img/ht-azure.png",
  aws: "img/ht-aws.png",
  gcp: "img/ht-gcp.png",
  alibaba: "img/ht-alibaba.png",
  ibm: "img/ibm.png",
  tencent: "img/tencent.png",
  ncp: "img/ncp.png",
  kt: "img/kt.png",
  nhn: "img/nhn.png",

  // Add more CSP icons here
};

// cspIconStyles
const cspIconStyles = {};

function createIconStyle(imageSrc) {
  return new Style({
    image: new Icon({
      crossOrigin: "anonymous",
      src: imageSrc,
      opacity: 1.0,
      scale: 1.0,
    }),
  });
}

// addIconToMap
Object.keys(cspIconImg).forEach((csp) => {
  cspIconStyles[csp] = createIconStyle(cspIconImg[csp]);
});
// Optimized addIconToMap function to prevent layer accumulation
function addIconToMap(imageSrc, point, index) {
  var vectorSource = new VectorSource({ projection: "EPSG:4326" });
  var iconFeature = new Feature(point);
  iconFeature.set("style", createStyle(imageSrc));
  iconFeature.set("index", index);
  vectorSource.addFeature(iconFeature);
  var iconLayer = new VectorLayer({
    style: function (feature) {
      return feature.get("style");
    },
    source: vectorSource,
  });
  
  // Set a unique identifier for this layer for potential cleanup
  iconLayer.set('layerType', 'iconLayer');
  iconLayer.set('layerIndex', index);
  
  map.addLayer(iconLayer);
  
  // Update performance metrics
  mapPerformanceMetrics.layerCount++;
  mapPerformanceMetrics.featureCount++;
  
  // Use debounced render to improve performance
  if (window.mapRenderTimeout) {
    clearTimeout(window.mapRenderTimeout);
  }
  window.mapRenderTimeout = setTimeout(() => {
    map.render();
    mapPerformanceMetrics.renderCount++;
  }, 10);
}
Object.keys(cspIconImg).forEach((csp, index) => {
  const iconIndex = index.toString().padStart(3, "0");
  addIconToMap(cspIconImg[csp], pnt, iconIndex);
});

// Provider Icon Mapping for VM visualization (using existing cspIconImg)
function getProviderIcon(providerName) {
  const provider = providerName?.toLowerCase();
  const iconPath = cspIconImg[provider] || "img/circle.png"; // fallback icon
  return iconPath;
}


// Helper function to calculate luminance and determine contrast color
function getContrastColor(hexColor) {
  // Remove # if present and handle alpha values
  const cleanHex = hexColor.replace('#', '').replace(/ff$/i, '');
  
  // Convert hex to RGB
  const r = parseInt(cleanHex.substr(0, 2), 16);
  const g = parseInt(cleanHex.substr(2, 2), 16);
  const b = parseInt(cleanHex.substr(4, 2), 16);
  
  // Calculate relative luminance (W3C formula)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  // Return black for bright colors, white for dark colors
  return luminance > 0.5 ? "#000000" : "#ffffff";
}

// Unified VM/MCI Status Color Mapping with improved visibility and contrasting borders
function getVmStatusColor(status) {
  // Handle both exact status and status that includes keywords (for backward compatibility)
  const statusStr = status?.toString().toLowerCase() || '';
  
  let fillColor;
  
  // Running states - Green shades (healthy/active)
  if (status === "Running" || statusStr.includes("running")) {
    fillColor = "#10b981"; // emerald-500 - bright green for active/healthy state
  }
  // Creating/Starting states - Blue shades (in progress)
  else if (status === "Creating" || statusStr.includes("creating")) {
    fillColor = "#3b82f6"; // blue-500 - bright blue for creation progress
  }
  else if (status === "Resuming" || statusStr.includes("resuming")) {
    fillColor = "#06b6d4"; // cyan-500 - cyan for resuming
  }
  // Preparing states - Orange shades (preparation phase)
  else if (status === "Preparing" || statusStr.includes("Preparing")) {
    fillColor = "#f97316"; // orange-500 - orange for preparing state
  }
  else if (status === "Prepared" || statusStr.includes("Prepared")) {
    fillColor = "#ea580c"; // orange-600 - darker orange for prepared state
  }
  // Suspended/Paused states - Yellow/Orange shades (paused but recoverable)
  else if (status === "Suspended" || statusStr.includes("suspended")) {
    fillColor = "#f59e0b"; // amber-500 - amber for suspended/paused state
  }
  else if (status === "Suspending" || statusStr.includes("suspending")) {
    fillColor = "#d97706"; // amber-600 - darker amber for suspending process
  }
  // Rebooting state - Purple (special operation)
  else if (status === "Rebooting" || statusStr.includes("rebooting")) {
    fillColor = "#8b5cf6"; // violet-500 - purple for reboot operation
  }
  // Terminating states - Red shades (destructive operations)
  else if (status === "Terminating" || statusStr.includes("terminating")) {
    fillColor = "#ef4444"; // red-500 - bright red for terminating
  }
  else if (status === "Terminated" || statusStr.includes("terminated")) {
    fillColor = "#dc2626"; // red-600 - darker red for terminated
  }
  // Failed/Error states - Dark red (critical issues)
  else if (status === "Failed" || statusStr.includes("failed")) {
    fillColor = "#b91c1c"; // red-700 - dark red for failed state
  }
  // Undefined/Unknown states - Gray (neutral/unknown)
  else if (status === "Undefined" || statusStr.includes("undefined")) {
    fillColor = "#6b7280"; // gray-500 - medium gray for undefined
  }
  // Default fallback
  else {
    fillColor = "#9ca3af"; // gray-400 - light gray for unknown states
  }
  
  return {
    fill: fillColor,
    stroke: getContrastColor(fillColor)
  };
}

// Legacy function for MCI status - returns only fill color for backward compatibility
function changeColorStatus(status) {
  const colorObj = getVmStatusColor(status);
  return typeof colorObj === 'object' ? colorObj.fill : colorObj;
}

// K8s Cluster Status Color Mapping
function getK8sStatusColor(status) {
  const statusStr = status?.toString().toLowerCase() || '';
  
  let fillColor;
  
  // Active/Running states - Green (healthy)
  if (status === "Active" || statusStr.includes("active") || 
      status === "Running" || statusStr.includes("running")) {
    fillColor = "#10b981"; // emerald-500
  }
  // Creating/Provisioning states - Blue (in progress)
  else if (status === "Creating" || statusStr.includes("creating") ||
           status === "Provisioning" || statusStr.includes("provisioning")) {
    fillColor = "#3b82f6"; // blue-500
  }
  // Updating/Upgrading states - Orange (maintenance)
  else if (status === "Updating" || statusStr.includes("updating") ||
           status === "Upgrading" || statusStr.includes("upgrading")) {
    fillColor = "#f97316"; // orange-500
  }
  // Error/Failed states - Red (critical)
  else if (status === "Error" || statusStr.includes("error") ||
           status === "Failed" || statusStr.includes("failed")) {
    fillColor = "#ef4444"; // red-500
  }
  // Deleting/Terminating states - Dark red (destructive)
  else if (status === "Deleting" || statusStr.includes("deleting") ||
           status === "Terminating" || statusStr.includes("terminating")) {
    fillColor = "#dc2626"; // red-600
  }
  // Suspended/Stopped states - Yellow (paused)
  else if (status === "Suspended" || statusStr.includes("suspended") ||
           status === "Stopped" || statusStr.includes("stopped")) {
    fillColor = "#f59e0b"; // amber-500
  }
  // Unknown/Default states - Gray
  else {
    fillColor = "#6b7280"; // gray-500
  }
  
  return {
    fill: fillColor,
    stroke: getContrastColor(fillColor)
  };
}

// K8s Cluster Status Color Mapping
function getK8sStatusColor(status) {
  const statusStr = status?.toString().toLowerCase() || '';
  
  let fillColor;
  
  // Active/Running states - Green
  if (status === "Active" || statusStr.includes("active") || 
      status === "Running" || statusStr.includes("running")) {
    fillColor = "#10b981"; // emerald-500 - bright green for active
  }
  // Creating states - Blue
  else if (status === "Creating" || statusStr.includes("creating") ||
           status === "Provisioning" || statusStr.includes("provisioning")) {
    fillColor = "#3b82f6"; // blue-500 - bright blue for creation
  }
  // Updating states - Orange
  else if (status === "Updating" || statusStr.includes("updating") ||
           status === "Upgrading" || statusStr.includes("upgrading")) {
    fillColor = "#f97316"; // orange-500 - orange for updating
  }
  // Error/Failed states - Red
  else if (status === "Error" || statusStr.includes("error") ||
           status === "Failed" || statusStr.includes("failed")) {
    fillColor = "#dc2626"; // red-600 - red for errors
  }
  // Deleting states - Dark red
  else if (status === "Deleting" || statusStr.includes("deleting") ||
           status === "Terminating" || statusStr.includes("terminating")) {
    fillColor = "#b91c1c"; // red-700 - dark red for deletion
  }
  // Suspended/Stopped states - Yellow
  else if (status === "Suspended" || statusStr.includes("suspended") ||
           status === "Stopped" || statusStr.includes("stopped")) {
    fillColor = "#f59e0b"; // amber-500 - amber for suspended
  }
  // Unknown/Default states - Gray
  else {
    fillColor = "#6b7280"; // gray-500 - gray for unknown
  }
  
  return {
    fill: fillColor,
    stroke: getContrastColor(fillColor)
  };
}

// Helper function to truncate MCI name with ellipsis
function truncateMciName(name, maxLength = 25) {
  if (!name) return '';
  if (name.length <= maxLength) return name;
  return name.substring(0, maxLength) + '..';
}

// Helper function to split MCI name into multiple lines for better display
function splitMciNameToLines(name, maxLineLength = 12) {
  if (!name) return [''];
  
  // If the name is short enough, return as single line
  if (name.length <= maxLineLength) {
    return [name];
  }
  
  // Split by common separators first
  const separators = ['-', '_', '.', ' '];
  let parts = [name];
  
  for (const sep of separators) {
    if (name.includes(sep)) {
      parts = name.split(sep);
      break;
    }
  }
  
  // If no separators found or parts are still too long, split by length
  if (parts.length === 1 || parts.some(part => part.length > maxLineLength)) {
    const lines = [];
    let currentLine = '';
    
    for (let i = 0; i < name.length; i++) {
      if (currentLine.length >= maxLineLength && (name[i] === '-' || name[i] === '_' || name[i] === '.' || name[i] === ' ')) {
        lines.push(currentLine);
        currentLine = '';
      } else if (currentLine.length >= maxLineLength * 1.5) {
        lines.push(currentLine);
        currentLine = '';
      }
      currentLine += name[i];
    }
    
    if (currentLine) {
      lines.push(currentLine);
    }
    
    return lines.slice(0, 3); // Limit to 3 lines maximum
  }
  
  // Combine parts intelligently to create 2-3 lines
  const lines = [];
  let currentLine = '';
  
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const separator = i < parts.length - 1 ? (name.includes('-') ? '-' : name.includes('_') ? '_' : '.') : '';
    
    if (currentLine.length + part.length + separator.length <= maxLineLength || currentLine === '') {
      currentLine += part + separator;
    } else {
      if (currentLine) {
        lines.push(currentLine.replace(/[-_.]$/, '')); // Remove trailing separator
        currentLine = part + separator;
      }
    }
  }
  
  if (currentLine) {
    lines.push(currentLine.replace(/[-_.]$/, '')); // Remove trailing separator
  }
  
  return lines.slice(0, 3); // Limit to 3 lines maximum
}

// Generate random string for resource naming
function generateRandomString() {
  return Math.random().toString(36).substr(2, 5);
}

// Helper function to split K8s cluster name into multiple lines for better display
function splitK8sNameToLines(name, maxLineLength = 10) {
  if (!name) return [''];
  
  // If the name is short enough, return as single line
  if (name.length <= maxLineLength) {
    return [name];
  }
  
  // Split by common separators first
  const separators = ['-', '_', '.', ' '];
  let parts = [name];
  
  for (const sep of separators) {
    if (name.includes(sep)) {
      parts = name.split(sep);
      break;
    }
  }
  
  // If no separators found or parts are still too long, split by length
  if (parts.length === 1 || parts.some(part => part.length > maxLineLength)) {
    const lines = [];
    let currentLine = '';
    
    for (let i = 0; i < name.length; i++) {
      if (currentLine.length >= maxLineLength && (name[i] === '-' || name[i] === '_' || name[i] === '.' || name[i] === ' ')) {
        lines.push(currentLine);
        currentLine = '';
      } else if (currentLine.length >= maxLineLength * 1.5) {
        lines.push(currentLine);
        currentLine = '';
      }
      currentLine += name[i];
    }
    
    if (currentLine) {
      lines.push(currentLine);
    }
    
    return lines.slice(0, 2); // Limit to 2 lines maximum for K8s (less than MCI's 3)
  }
  
  // Combine parts intelligently to create 1-2 lines
  const lines = [];
  let currentLine = '';
  
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const testLine = currentLine ? currentLine + '-' + part : part;
    
    if (testLine.length <= maxLineLength || currentLine === '') {
      currentLine = testLine;
    } else {
      lines.push(currentLine);
      currentLine = part;
    }
  }
  
  if (currentLine) {
    lines.push(currentLine);
  }
  
  return lines.slice(0, 2); // Limit to 2 lines maximum for K8s
}

function changeSizeStatus(status) {
  if (status.includes("-df")) {
    return 0.4;
  } else if (status.includes("-ws")) {
    return 0.4;
  } else if (status.includes("NLB")) {
    return 1.5;
  } else if (status.includes("Failed")) {
    return 2.2; // Make Failed VMs more visible with medium-large size
  } else if (status.includes("Partial")) {
    return 2.4;
  } else if (status.includes("Running")) {
    return 2.4;
  } else if (status.includes("Suspending")) {
    return 2.4;
  } else if (status.includes("Suspended")) {
    return 2.4;
  } else if (status.includes("Creating")) {
    return 2.4;
  } else if (status.includes("Resuming")) {
    return 2.4;
  } else if (status.includes("Terminated")) {
    return 2.4;
  } else if (status.includes("Terminating")) {
    return 2.4;
  } else {
    return 2.4;
  }
}

// Create VM icon style with status badge and provider icon
function createVmStyleWithStatusBadge(vmStatus, providerName = null, baseScale = 1.0, vmCoords = null, commandStatus = "None") {
  const statusColors = getVmStatusColor(vmStatus);
  
  const styles = [
    // Main VM icon (center)
    new Style({
      image: new Icon({
        crossOrigin: "anonymous",
        src: "img/iconVm.png",
        opacity: 1.0,
        scale: baseScale * 0.3,
        anchor: [0.5, 0.5], // Center anchor
        anchorXUnits: 'fraction',
        anchorYUnits: 'fraction',
      }),
    }),
    // Status badge (bottom-right using displacement)
    new Style({
      image: new CircleStyle({
        radius: 4,
        fill: new Fill({
          color: statusColors.fill,
        }),
        stroke: new Stroke({
          color: statusColors.stroke,
          width: 1.5, // Slightly thicker border for better visibility
        }),
        displacement: [12, -13], // Move right and down (negative Y for down)
      }),
    })
  ];

  // Add command status icon if there are active commands
  if (commandStatus === "Queued" || commandStatus === "Handling") {
    // Create gear icon using text symbol
    const gearSymbol = commandStatus === "Handling" ? "⚡" : "⏳"; // Same gear symbol
    const rotation = commandStatus === "Handling" ? (Date.now() / 100) % (2 * Math.PI) : 0; // Rotate for Handling
    
    styles.push(
      new Style({
        text: new Text({
          text: gearSymbol,
          font: commandStatus === "Queued" ? '16px sans-serif' : '12px sans-serif', // Larger for Queued
          fill: new Fill({
            color: commandStatus === "Handling" ? '#FF6B35' : '#FFB84D', // Orange for Handling, Yellow-orange for Queued
          }),
          stroke: new Stroke({
            color: '#333',
            width: 0.5,
          }),
          offsetX: 8, // Reduced radius - smaller circular motion
          offsetY: -2, // Adjusted Y offset proportionally
          rotation: rotation, // Animate rotation for Handling
        }),
      })
    );
  }

  // Add provider icon if provider information is available (center-top using anchor)
  if (providerName && providerName !== 'unknown') {
    const providerIconSrc = getProviderIcon(providerName);
    styles.push(
      new Style({
        image: new Icon({
          crossOrigin: "anonymous",
          src: providerIconSrc,
          opacity: 0.9,
          scale: baseScale * 0.3,
          anchor: [0.5, 0.75], 
          anchorXUnits: 'fraction',
          anchorYUnits: 'fraction',
        }),
      })
    );
  }

  return styles;
}

// Create individual VM point with offset for status badge
function createVmPointWithOffset(coordinates, offsetX = 0.008, offsetY = 0.008) {
  return new Point([coordinates[0] + offsetX, coordinates[1] + offsetY]);
}

function changeSizeByName(status) {
  if (status.includes("-best")) {
    return 3.5;
  } else if (status.includes("-df")) {
    return 0.4;
  } else if (status.includes("-ws")) {
    return 0.4;
  } else if (status.includes("NLB")) {
    return 1.5;
  } else {
    return 2.5;
  }
}

function returnAdjustmentPoint(index, totalVMs) {
  // Initialize coordinates
  let ax = 0.0;
  let ay = 0.0;

  // First VM (index 0) is placed at center
  if (index === 0) {
    ax = 0;
    ay = 0;
  } else {
    // Circle radius
    const radius = 0.75;

    // Calculate angle step (divide 360° by total VMs)
    const angleStep = 2 * Math.PI / totalVMs;

    // Start at 12 o'clock position
    const startAngle = 3 * Math.PI / 2;

    // Calculate angle for current VM
    const angle = startAngle + (angleStep * index);

    // Convert polar coordinates to Cartesian
    ax = radius * Math.cos(angle);
    ay = radius * Math.sin(angle);
  }

  // Add small random offset to prevent exact overlapping
  ax = ax + (Math.random() * 0.01);
  ay = ay + (Math.random() * 0.01);

  // Compress y-axis for better map projection appearance
  ay = ay * 0.78;

  return { ax, ay };
}

var n = 400;
var omegaTheta = 600000; // Rotation period in ms
var R = 7;
var r = 2;
var p = 2;

var coordinates = [];
coordinates.push([-180, -90]);

var coordinatesFromX = [];
coordinatesFromX.push([0]);
var coordinatesFromY = [];
coordinatesFromY.push([0]);

var coordinatesToX = [];
coordinatesToX.push([1]);
var coordinatesToY = [];
coordinatesToY.push([1]);

function makeTria(ip1, ip2, ip3) {
  changePoints(ip1, ip2);
  changePoints(ip2, ip3);
  changePoints(ip3, ip1);

  geometries[cnt] = new Polygon([[ip1, ip2, ip3, ip1]]);
  //cnt++;
}

function makePolyDot(vmPoints, vmStatuses = [], vmProviders = [], vmCommandStatuses = []) {
  var resourcePoints = [];

  for (i = 0; i < vmPoints.length; i++) {
    resourcePoints.push(vmPoints[i]);
  }

  // Store geometry and VM metadata including provider info and command status in the geometriesPoints
  geometriesPoints[cnt] = {
    geometry: new MultiPoint(resourcePoints),
    vmPoints: vmPoints,
    vmStatuses: vmStatuses,
    vmProviders: vmProviders,
    vmCommandStatuses: vmCommandStatuses
  };
}

function makePolyArray(vmPoints) {
  //for (i = 0; i < vmPoints.length; i++) {
  //coordinates.push(vmPoints[i]);
  //}

  var resourcePoints = [];

  for (i = 0; i < vmPoints.length; i++) {
    resourcePoints.push(vmPoints[i]);
  }

  //geometriesPoints[cnt] = new MultiPoint(resourcePoints);

  resourcePoints.push(vmPoints[0]);

  geometries[cnt] = new Polygon([resourcePoints]);

  mciGeo[cnt] = new Polygon([resourcePoints]);
  //cnt++;
}

function cross(a, b, o) {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

/**
 * @param points An array of [X, Y] coordinates
 */
function convexHull(points) {
  points.sort(function (a, b) {
    return a[0] == b[0] ? a[1] - b[1] : a[0] - b[0];
  });

  var lower = [];
  for (var i = 0; i < points.length; i++) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], points[i]) <= 0
    ) {
      lower.pop();
    }
    lower.push(points[i]);
  }

  var upper = [];
  for (var i = points.length - 1; i >= 0; i--) {
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], points[i]) <= 0
    ) {
      upper.pop();
    }
    upper.push(points[i]);
  }

  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

function changePoints(ipFrom, ipTo) {
  var lon = 360 * Math.random() - 180;
  var lat = 180 * Math.random() - 90;

  var lon1 = 360 * Math.random() - 180;
  var lat1 = 180 * Math.random() - 90;

  // Debug: uncomment if needed for troubleshooting
  // console.log(ipFrom);
  // console.log(ipTo);

  coordinates.push(ipFrom);
  coordinates.push(ipTo);

  var i, j;

  var xFrom = ipFrom[0];
  var yFrom = ipFrom[1];
  var xTo = ipTo[0];
  var yTo = ipTo[1];
  for (j = 1; j < n; ++j) {
    var goX = xFrom + (j * (xTo - xFrom)) / n;
    var goY = ((yTo - yFrom) / (xTo - xFrom)) * (goX - xFrom) + yFrom;
  }
}

var refreshInterval = 5;
// setTimeout(() => getMci(), refreshInterval*1000);
//setTimeout(() => console.log(getConnection()), refreshInterval*1000);

function infoAlert(message) {
  Swal.fire({
    // position: 'top-end',
    icon: "info",
    title: message,
    showConfirmButton: false,
    timer: 2500,
  });
}

function errorAlert(message) {
  Swal.fire({
    // position: 'bottom-start',
    icon: "error",
    title: message,
    showConfirmButton: true,
    //timer: 2000
  });
}

function successAlert(message) {
  Swal.fire({
    // position: 'top-end',
    icon: "success",
    title: message,
    showConfirmButton: false,
    timer: 2500,
  });
}

function outputAlert(jsonData, type) {
  // Estimate JSON data size
  const jsonString = JSON.stringify(jsonData);
  const isLargeData = jsonString.length > 50000; // 50KB threshold
  
  // Check if it's MCI data with many VMs
  const hasLargeVmList = jsonData?.subGroups?.some(subGroup => 
    subGroup?.vms && Array.isArray(subGroup.vms) && subGroup.vms.length > 20
  ) || (Array.isArray(jsonData?.vm) && jsonData.vm.length > 20);
  
  const jsonOutputConfig = {
    theme: "dark",
    hoverPreviewEnabled: !isLargeData, // Disable hover preview for large data
    hoverPreviewArrayCount: isLargeData ? 10 : 100,
    hoverPreviewFieldCount: isLargeData ? 3 : 5,
    animateOpen: !isLargeData, // Disable animation for large data
    animateClose: !isLargeData,
    useToJSON: true,
    quotesOnKeys: false,
    quotesOnValues: false,
    open: isLargeData || hasLargeVmList ? 1 : 2  // More conservative opening for large data
  };
  Swal.fire({
    position: "top-end",
    icon: type,
    html: '<div id="json-output" class="form-control" style="height: auto; background-color: black; text-align: left; padding: 10px; overflow: auto; max-height: 400px;"></div>',
    background: "#0e1746",
    showConfirmButton: true,
    width: '40%',
    //backdrop: false,
    didOpen: () => {
      // Use setTimeout to ensure DOM is fully ready and improve perceived performance
      setTimeout(() => {
        const container = document.getElementById("json-output");
        if (container) {
          // Show loading message for large data
          if (isLargeData || hasLargeVmList) {
            container.innerHTML = '<div style="color: #888; padding: 10px;">Loading large dataset... Please wait.</div>';
            
            // Delay rendering for large data to improve UX
            setTimeout(() => {
              container.innerHTML = ''; // Clear loading message
              const formatter = new JSONFormatter(jsonData, isLargeData ? 1 : 2, jsonOutputConfig);
              const renderedElement = formatter.render();
              container.appendChild(renderedElement);
              
              // Apply string cleanup for large data too
              if (!isLargeData) {
                setTimeout(() => {
                  const stringElements = container.querySelectorAll('.json-formatter-string');
                  stringElements.forEach(element => {
                    if (element.textContent.startsWith('"') && element.textContent.endsWith('"')) {
                      element.textContent = element.textContent.slice(1, -1);
                    }
                  });
                }, 100);
              }
            }, 100);
          } else {
            // Normal rendering for small data
            const formatter = new JSONFormatter(jsonData, 2, jsonOutputConfig);
            const renderedElement = formatter.render();
            container.appendChild(renderedElement);
            
            // Remove quotes from string values using DOM manipulation
            setTimeout(() => {
              const stringElements = container.querySelectorAll('.json-formatter-string');
              stringElements.forEach(element => {
                if (element.textContent.startsWith('"') && element.textContent.endsWith('"')) {
                  element.textContent = element.textContent.slice(1, -1);
                }
              });
            }, 100);
          }
          
          // Apply custom styles for JSONFormatter value strings
          const style = document.createElement('style');
          style.textContent = `
            #json-output .json-formatter-string {
              word-wrap: break-word !important;
              overflow-wrap: break-word !important;
              white-space: pre-wrap !important;
              word-break: break-all !important;
              max-width: 100% !important;
            }
            #json-output .json-formatter-row .json-formatter-string {
              word-wrap: break-word !important;
              overflow-wrap: break-word !important;
              white-space: pre-wrap !important;
              word-break: break-all !important;
            }
          `;
          document.head.appendChild(style);
        } else {
          console.error("json-output container not found");
        }
      }, isLargeData ? 100 : 50); // Longer delay for large data
    },
  });
}

function displayJsonData(jsonData, type) {
  const jsonOutputConfig = {
    theme: "dark",
    hoverPreviewEnabled: true,
    hoverPreviewArrayCount: 100,
    hoverPreviewFieldCount: 5,
    animateOpen: true,
    animateClose: true,
    useToJSON: true,
    quotesOnKeys: false,
    quotesOnValues: false
  };
  
  // Show JSON data in SweetAlert popup
  outputAlert(jsonData, type);
}

// Handle MCI without VMs (preparing, prepared states)
function handleMciWithoutVms(mciItem, cnt) {
  // Get current map extent to position MCIs in upper-left area
  var mapView = map.getView();
  var mapExtent = mapView.calculateExtent(map.getSize());
  
  // Position MCIs in the upper-left quadrant of the visible map area
  var leftBound = mapExtent[0]; // minimum longitude
  var rightBound = mapExtent[2]; // maximum longitude  
  var bottomBound = mapExtent[1]; // minimum latitude
  var topBound = mapExtent[3]; // maximum latitude
  
  // Calculate upper-left position (offset from the edge for better visibility)
  var edgeLeftOffset = 0.08;
  var edgeTopOffset = 0.02;
  var defaultLon = leftBound + (rightBound - leftBound) * edgeLeftOffset;
  var defaultLat = topBound - (topBound - bottomBound) * edgeTopOffset;

  // If MCI has label with location info, try to extract it (optional override)
  if (mciItem.label && typeof mciItem.label === 'object') {
    if (mciItem.label.location) {
      var locParts = mciItem.label.location.split(',');
      if (locParts.length === 2) {
        var labelLat = parseFloat(locParts[0].trim());
        var labelLon = parseFloat(locParts[1].trim());
        if (!isNaN(labelLat) && !isNaN(labelLon)) {
          defaultLat = labelLat;
          defaultLon = labelLon;
        }
      }
    }
  }
  
  // Add vertical offset to avoid overlapping if multiple preparing MCIs exist
  // Stack them vertically downward from the upper-left position
  var verticalSpacing = (topBound - bottomBound) * 0.05; // 5% of map height per MCI
  var preparingMciCount = 0;
  
  // Count how many preparing/prepared/failed MCIs we already have to determine stacking position
  for (var k = 0; k < cnt; k++) {
    if (mciStatus[k] && (mciStatus[k] === "Preparing" || mciStatus[k] === "Prepared" || mciStatus[k] === "Failed")) {
      preparingMciCount++;
    }
  }
  
  // Apply vertical offset based on the count of existing preparing MCIs
  defaultLat -= verticalSpacing * preparingMciCount;
  
  // Create a simple point geometry for text positioning (no background shape)
  geometries[cnt] = new Point([defaultLon, defaultLat]);
  mciGeo[cnt] = new Point([defaultLon, defaultLat]);
  
  // Store MCI status
  mciStatus[cnt] = mciItem.status;
  
  // Set MCI name
  var newName = mciItem.name;
  if (newName.includes("-nlb")) {
    newName = "NLB";
  }
  
  // Store only the clean name
  mciName[cnt] = newName;
  
  // Store targetAction information separately
  mciTargetAction[cnt] = (mciItem.targetAction && mciItem.targetAction !== "None" && mciItem.targetAction !== "") 
    ? mciItem.targetAction : null;
  
  // Do not create VM points for preparing/prepared MCI (no actual VMs exist)
  geometriesPoints[cnt] = null;
  
  // Debug: uncomment if needed
  // console.log(`Added placeholder geometry for MCI ${mciItem.name} with status ${mciItem.status}`);
}

function getMci() {
  var hostname = configHostname;
  var port = configPort;
  var username = configUsername;
  var password = configPassword;
  var namespace = namespaceElement.value;

  // Use global refreshInterval variable instead of DOM element
  var filteredRefreshInterval = isNormalInteger(refreshInterval.toString())
    ? refreshInterval
    : 5;
  setTimeout(() => getMci(), filteredRefreshInterval * 1000);

  // Show refresh indicator
  showMapRefreshIndicator(true);

  var zoomLevel = map.getView().getZoom() * 2.0;
  var radius = 4.0;

  if (namespace && namespace != "") {
    // get mci list and put them on the map - full details including connectionConfig
    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mci`;

    axios({
      method: "get",
      url: url,
      auth: {
        username: `${username}`,
        password: `${password}`,
      },
      timeout: 60000,
    })
      .then((res) => {
        var obj = res.data;

        // Update central data store for Dashboard
        if (obj.mci) {
          window.cloudBaristaCentralData.mciData = obj.mci;
          
          // Extract VM data from MCI data
          const allVms = [];
          obj.mci.forEach(mci => {
            if (mci.vm && Array.isArray(mci.vm)) {
              mci.vm.forEach(vm => {
                allVms.push({
                  ...vm,
                  mciId: mci.id,
                  mciName: mci.name
                });
              });
            }
          });
          window.cloudBaristaCentralData.vmData = allVms;
          
          // Load VPN data from the MCIs we just fetched (reusing MCI data)
          loadVpnDataFromMcis();
          
          // Notify Dashboard subscribers
          notifyDataSubscribers();
          
          // Update map connection status to connected
          updateMapConnectionStatus('connected');
          
          // Hide refresh indicator
          showMapRefreshIndicator(false);
        }

        // Also load K8s cluster data for dashboard
        loadK8sClusterData();

        cnt = cntInit;
        
        if (obj.mci != null && obj.mci.length > 0) {
          debugLog.api(`Processing ${obj.mci.length} MCIs for map display`);
          for (let item of obj.mci) {
            // Debug: uncomment for detailed MCI inspection
            // console.log(item);

            var hideFlag = false;
            for (let hideName of mciHideList) {
              if (item.id == hideName) {
                hideFlag = true;
                break;
              }
            }
            if (hideFlag) {
              continue;
            }

            // Handle MCI without VMs (preparing, prepared states)
            if (item.vm == null || item.vm.length === 0) {
              // Debug: uncomment if needed
              // console.log("MCI without VMs:", item);
              if (item.status === "Preparing" || item.status === "Prepared" || item.status === "Failed") {
                handleMciWithoutVms(item, cnt);
                cnt++;
              }
              continue;
            }

            var vmGeo = [];

            var validateNum = 0;
            for (j = 0; j < item.vm.length; j++) {
              // Safely extract VM coordinates for vmGeo
              const vm = item.vm[j];
              if (!vm.location || vm.location.longitude === undefined || vm.location.latitude === undefined) {
                console.warn(`VM ${vm.id || j}: missing location data, skipping`);
                continue;
              }
              
              //vmGeo.push([(item.vm[j].location.longitude*1) + (Math.round(Math.random()) / zoomLevel - 1) * Math.random()*1, (item.vm[j].location.latitude*1) + (Math.round(Math.random()) / zoomLevel - 1) * Math.random()*1 ])
              if (j == 0) {
                vmGeo.push([
                  vm.location.longitude * 1,
                  vm.location.latitude * 1,
                ]);
              } else {
                var groupCnt = 0;
                if ((vm.location.longitude == item.vm[j - 1].location.longitude) && (vm.location.latitude == item.vm[j - 1].location.latitude)) {
                  vmGeo.push([
                    vm.location.longitude * 1 +
                    (returnAdjustmentPoint(j, item.vm.length).ax / zoomLevel) * radius,
                    vm.location.latitude * 1 +
                    (returnAdjustmentPoint(j, item.vm.length).ay / zoomLevel) * radius,
                  ]);
                } else {
                  vmGeo.push([
                    vm.location.longitude * 1,
                    vm.location.latitude * 1,
                  ]);
                }
              }
              validateNum++;
            }
            if (item.vm.length == 1) {
              // handling if there is only one vm so that we can not draw geometry
              vmGeo.pop();
              vmGeo.push([
                item.vm[0].location.longitude * 1,
                item.vm[0].location.latitude * 1,
              ]);
              vmGeo.push([
                item.vm[0].location.longitude * 1 + Math.random() * 0.001,
                item.vm[0].location.latitude * 1 + Math.random() * 0.001,
              ]);
              vmGeo.push([
                item.vm[0].location.longitude * 1 + Math.random() * 0.001,
                item.vm[0].location.latitude * 1 + Math.random() * 0.001,
              ]);
            }
            if (validateNum == item.vm.length) {
              // Store VM-specific data for makePolyDot
              var vmStatuses = [];
              var vmProviders = [];
              var vmCommandStatuses = []; // Add command status array
              var vmPoints = [];
              
              for (let vmIndex = 0; vmIndex < item.vm.length; vmIndex++) {
                const vm = item.vm[vmIndex];
                
                // Debug: Log only the first VM structure to avoid spam
                if (vmIndex === 0) {
                  debugLog.vm(`VM ${vm.id || 'unknown'} structure:`, vm);
                }
                
                vmStatuses.push(vm.status || "Undefined");
                
                // Check command status for "Queued" or "Handling"
                let commandStatus = "None";
                if (vm.commandStatus) {
                  const queuedCmd = vm.commandStatus.find(cmd => cmd.status === "Queued");
                  const handlingCmd = vm.commandStatus.find(cmd => cmd.status === "Handling");
                  
                  if (handlingCmd) {
                    commandStatus = "Handling"; // Handling has priority over Queued
                  } else if (queuedCmd) {
                    commandStatus = "Queued";
                  }
                }
                vmCommandStatuses.push(commandStatus);
                
                // Debug: Log command status for first VM
                if (vmIndex === 0 && vm.commandStatus) {
                  debugLog.vm(`VM ${vm.id || 'unknown'} commandStatus:`, vm.commandStatus);
                  debugLog.vm(`VM ${vm.id} command status:`, commandStatus);
                }
                
                // Extract provider from connectionConfig (full API response)
                let provider = "unknown";
                
                // Debug: Log connection-related properties for first VM only
                if (vmIndex === 0) {
                  debugLog.vm(`VM ${vm.id}: connectionName =`, vm.connectionName);
                  debugLog.vm(`VM ${vm.id}: connectionConfig =`, vm.connectionConfig);
                }
                
                if (vm.connectionConfig && vm.connectionConfig.providerName) {
                  provider = vm.connectionConfig.providerName;
                  if (vmIndex === 0) debugLog.vm(`VM ${vm.id}: found provider in connectionConfig = ${provider}`);
                } else if (vm.connectionName) {
                  // Fallback: extract provider from connectionName (e.g., "aws-ap-northeast-2" -> "aws")
                  provider = vm.connectionName.split('-')[0];
                  if (vmIndex === 0) debugLog.vm(`VM ${vm.id}: extracted provider from connectionName = ${provider}`);
                } else {
                  if (vmIndex === 0) {
                    debugLog.vm(`VM ${vm.id}: no provider info found, using unknown`);
                    debugLog.vm(`VM ${vm.id}: available properties:`, Object.keys(vm));
                  }
                }
                
                vmProviders.push(provider);
                
                // Use the same coordinates as vmGeo for consistency
                if (vmIndex == 0) {
                  vmPoints.push([vm.location.longitude * 1, vm.location.latitude * 1]);
                } else {
                  const prevVm = item.vm[vmIndex - 1];
                  if ((vm.location.longitude == prevVm.location.longitude) && (vm.location.latitude == prevVm.location.latitude)) {
                    vmPoints.push([
                      vm.location.longitude * 1 + (returnAdjustmentPoint(vmIndex, item.vm.length).ax / zoomLevel) * radius,
                      vm.location.latitude * 1 + (returnAdjustmentPoint(vmIndex, item.vm.length).ay / zoomLevel) * radius,
                    ]);
                  } else {
                    vmPoints.push([vm.location.longitude * 1, vm.location.latitude * 1]);
                  }
                }
              }

              //make dots without convexHull - now includes VM status and provider info
              makePolyDot(vmGeo, vmStatuses, vmProviders, vmCommandStatuses);
              vmGeo = convexHull(vmGeo);

              mciStatus[cnt] = item.status;

              var newName = item.name;
              if (newName.includes("-nlb")) {
                newName = "NLB";
              }

              // Store only the clean name
              mciName[cnt] = newName;
              
              // Store targetAction information separately
              mciTargetAction[cnt] = (item.targetAction && item.targetAction !== "None" && item.targetAction !== "") 
                ? item.targetAction : null;

              //make poly with convexHull
              makePolyArray(vmGeo);

              cnt++;
            }
          }
        } else {
          // Clear all MCI-related data when list is empty or null
          console.log("No MCI data found, clearing map objects");
          geometries = [];
          geometriesPoints = [];
          mciName = [];
          mciStatus = [];
          mciGeo = [];
          
          // Force map re-render to show empty state
          map.render();
        }
      })
      .catch(function (error) {
        console.log("MCI API error:", error);
        // Don't update geometries on API error to preserve current state
        
        // Update map connection status to disconnected
        updateMapConnectionStatus('disconnected');
        
        // Hide refresh indicator
        showMapRefreshIndicator(false);
      });

    // get vnet list and put them on the map
    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/resources/vNet`;
    axios({
      method: "get",
      url: url,
      auth: {
        username: `${username}`,
        password: `${password}`,
      },
      timeout: 10000,
    }).then((res) => {
      var obj = res.data;
      debugLog.api('vNet API response:', obj);
      
      // Update central data store
      if (obj.vNet) {
        window.cloudBaristaCentralData.vNet = obj.vNet;
        window.cloudBaristaCentralData.resourceData.vNet = obj.vNet;
        debugLog.resource('vNet data stored in central store:', obj.vNet.length, 'items');
      }
      
      if (obj.vNet != null && obj.vNet.length > 0) {
        var resourceLocation = [];
        for (let item of obj.vNet) {
          resourceLocation.push([
            item.connectionConfig.regionDetail.location.longitude * 1,
            item.connectionConfig.regionDetail.location.latitude * 1 - 0.05,
          ]);
        }
        geoResourceLocation.vnet[0] = new MultiPoint([resourceLocation]);
      } else {
        // Clear vnet icons when list is empty
        geoResourceLocation.vnet = [];
      }
      
      // Notify Dashboard of data update
      notifyDataSubscribers();
    })
      .catch(function (error) {
        console.log("vNet API error:", error);
        // Don't update icons on API error to preserve current state
      });

    // get securityGroup list and put them on the map
    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/resources/securityGroup`;
    axios({
      method: "get",
      url: url,
      auth: {
        username: `${username}`,
        password: `${password}`,
      },
      timeout: 10000,
    }).then((res) => {
      var obj = res.data;
      debugLog.api('Security Group API response:', obj);
      
      // Update central data store
      if (obj.securityGroup) {
        window.cloudBaristaCentralData.securityGroup = obj.securityGroup;
        window.cloudBaristaCentralData.resourceData.securityGroup = obj.securityGroup;
        debugLog.resource('Security Group data stored in central store:', obj.securityGroup.length, 'items');
      }
      
      if (obj.securityGroup != null && obj.securityGroup.length > 0) {
        var resourceLocation = [];
        for (let item of obj.securityGroup) {
          resourceLocation.push([
            item.connectionConfig.regionDetail.location.longitude * 1 - 0.05,
            item.connectionConfig.regionDetail.location.latitude * 1,
          ]);
        }
        geoResourceLocation.sg[0] = new MultiPoint([resourceLocation]);
      } else {
        // Clear securityGroup icons when list is empty
        geoResourceLocation.sg = [];
      }
      
      // Notify Dashboard of data update
      notifyDataSubscribers();
    })
      .catch(function (error) {
        console.log("securityGroup API error:", error);
        // Don't update icons on API error to preserve current state
      });


    // get sshKey list and put them on the map
    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/resources/sshKey`;
    axios({
      method: "get",
      url: url,
      auth: {
        username: `${username}`,
        password: `${password}`,
      },
      timeout: 10000,
    }).then((res) => {
      var obj = res.data;
      debugLog.api('SSH Key API response:', obj);
      
      // Update central data store
      if (obj.sshKey) {
        window.cloudBaristaCentralData.sshKey = obj.sshKey;
        window.cloudBaristaCentralData.resourceData.sshKey = obj.sshKey;
        debugLog.resource('SSH Key data stored in central store:', obj.sshKey.length, 'items');
      }
      
      if (obj.sshKey != null && obj.sshKey.length > 0) {
        var resourceLocation = [];
        for (let item of obj.sshKey) {
          resourceLocation.push([
            item.connectionConfig.regionDetail.location.longitude * 1 + 0.05,
            item.connectionConfig.regionDetail.location.latitude * 1,
          ]);
        }
        geoResourceLocation.sshKey[0] = new MultiPoint([resourceLocation]);
      } else {
        // Clear sshKey icons when list is empty
        geoResourceLocation.sshKey = [];
      }
      
      // Notify Dashboard of data update
      notifyDataSubscribers();
    })
      .catch(function (error) {
        console.log("sshKey API error:", error);
        // Don't update icons on API error to preserve current state
      });

    // Load VPN data from all MCIs (reuses MCI data from central store)
    loadVpnDataFromMcis();

    // Get custom images
    var customImageUrl = `http://${hostname}:${port}/tumblebug/ns/${namespace}/resources/customImage`;
    axios({
      method: "get",
      url: customImageUrl,
      auth: {
        username: `${username}`,
        password: `${password}`,
      },
      timeout: 10000,
    }).then((res) => {
      var obj = res.data;
      debugLog.api('Custom Image API response:', obj);
      
      // Handle different possible response structures
      let customImages = [];
      if (obj && obj.customImage && Array.isArray(obj.customImage)) {
        customImages = obj.customImage;
      } else if (obj && Array.isArray(obj)) {
        customImages = obj;
      }
      
      window.cloudBaristaCentralData.customImage = customImages;
      debugLog.resource('Custom Image data stored:', customImages.length, 'items');
    }).catch(function (error) {
      console.log("Custom Image API error:", error);
      // Set empty array on error to prevent undefined issues
      window.cloudBaristaCentralData.customImage = [];
    });

    // Get data disks
    var dataDiskUrl = `http://${hostname}:${port}/tumblebug/ns/${namespace}/resources/dataDisk`;
    axios({
      method: "get",
      url: dataDiskUrl,
      auth: {
        username: `${username}`,
        password: `${password}`,
      },
      timeout: 10000,
    }).then((res) => {
      var obj = res.data;
      debugLog.api('Data Disk API response:', obj);
      
      // Handle different possible response structures
      let dataDisks = [];
      if (obj && obj.dataDisk && Array.isArray(obj.dataDisk)) {
        dataDisks = obj.dataDisk;
      } else if (obj && obj.dataDiskInfo && Array.isArray(obj.dataDiskInfo)) {
        dataDisks = obj.dataDiskInfo;
      } else if (obj && Array.isArray(obj)) {
        dataDisks = obj;
      }
      
      window.cloudBaristaCentralData.dataDisk = dataDisks;
      debugLog.resource('Data Disk data stored:', dataDisks.length, 'items');
    }).catch(function (error) {
      console.log("Data Disk API error:", error);
      // Set empty array on error to prevent undefined issues
      window.cloudBaristaCentralData.dataDisk = [];
    });

    // TODO: Object Storage API not yet available in CB-Tumblebug
    // Get object storage - DISABLED until API is implemented
    // var objectStorageUrl = `http://${hostname}:${port}/tumblebug/ns/${namespace}/resources/objectStorage`;
    // axios({
    //   method: "get",
    //   url: objectStorageUrl,
    //   auth: {
    //     username: `${username}`,
    //     password: `${password}`,
    //   },
    //   timeout: 10000,
    // }).then((res) => {
    //   var obj = res.data;
    //   if (obj && obj.objectStorages) {
    //     window.cloudBaristaCentralData.objectStorage = obj.objectStorages;
    //   }
    // }).catch(function (error) {
    //   console.log("Object Storage API error:", error);
    // });

    // TODO: SQL Database API not yet available in CB-Tumblebug
    // Get SQL databases - DISABLED until API is implemented
    // var sqlDbUrl = `http://${hostname}:${port}/tumblebug/ns/${namespace}/resources/sqlDb`;
    // axios({
    //   method: "get",
    //   url: sqlDbUrl,
    //   auth: {
    //     username: `${username}`,
    //     password: `${password}`,
    //   },
    //   timeout: 10000,
    // }).then((res) => {
    //   var obj = res.data;
    //   if (obj && obj.sqlDbs) {
    //     window.cloudBaristaCentralData.sqlDb = obj.sqlDbs;
    //   }
    // }).catch(function (error) {
    //   console.log("SQL DB API error:", error);
    // });
  }
}

// Get list of cloud connections
function getConnection() {
  // let timerInterval;
  // Swal.fire({
  //   title: "Show registered Cloud Regions to the Map",
  //   html: "closed in <b></b> milliseconds.",
  //   timer: 2000,
  //   timerProgressBar: true,
  //   position: "top-end",
  //   didOpen: () => {
  //     Swal.showLoading();
  //     const b = Swal.getHtmlContainer().querySelector("b");
  //     timerInterval = setInterval(() => {
  //       b.textContent = Swal.getTimerLeft();
  //     }, 100);
  //   },
  //   willClose: () => {
  //     clearInterval(timerInterval);
  //   },
  // }).then((result) => {
  //   /* Read more about handling dismissals below */
  //   if (result.dismiss === Swal.DismissReason.timer) {
  //     console.log("I was closed by the timer");
  //   }
  // });

  // Initialize provider checkboxes with "ALL" option
  var providerCheckboxContainer = document.getElementById("provider-checkboxes");
  if (providerCheckboxContainer) {
    providerCheckboxContainer.innerHTML = ''; // Clear existing checkboxes
  }

  // Handle "ALL" checkbox behavior
  var allCheckbox = document.getElementById("provider-all");
  if (allCheckbox) {
    allCheckbox.addEventListener('change', function() {
      var providerCheckboxes = document.querySelectorAll('#provider-checkboxes input[type="checkbox"]');
      if (this.checked) {
        // Uncheck all individual providers when ALL is selected
        providerCheckboxes.forEach(cb => cb.checked = false);
      }
      // Update map display and dropdown text
      updateMapBasedOnProviders();
      updateProviderDropdownText();
    });
  }

  var hostname = configHostname;
  var port = configPort;
  var username = configUsername;
  var password = configPassword;

  // Use global refreshInterval variable instead of DOM element
  var filteredRefreshInterval = isNormalInteger(refreshInterval.toString())
    ? refreshInterval
    : 5;
  //setTimeout(() => console.log(getConnection()), filteredRefreshInterval*1000);

  var url = `http://${hostname}:${port}/tumblebug/connConfig?filterVerified=true&filterRegionRepresentative=true`;

  axios({
    method: "get",
    url: url,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
    timeout: 60000,
  })
    .then((res) => {
      var obj = res.data;
      if (obj.connectionconfig != null) {
        console.log(
          "[Complete] Registered Cloud Regions: " +
          obj.connectionconfig.length
        );

        // Store connection data in central store
        window.cloudBaristaCentralData.connection = obj.connectionconfig;

        obj.connectionconfig.forEach((config, i) => {
          const providerName = config.providerName;
          const longitude = config.regionDetail.location.longitude;
          const latitude = config.regionDetail.location.latitude;
          const briefAddr = config.regionDetail.location.display;
          const nativeRegion = config.regionDetail.regionName;

          console.log(
            "[" +
            i +
            "] " +
            config.providerName +
            "(" +
            nativeRegion +
            ")" +
            "\t\t\t" +
            "Location: " +
            longitude +
            "|" +
            latitude +
            " (" +
            briefAddr +
            ")"
          );

          if (!cspPoints[providerName]) {
            cspPoints[providerName] = [];
          }

          cspPoints[providerName].push([longitude, latitude]);

          // Add the provider to the provider checkboxes if it doesn't already exist
          var providerCheckboxContainer = document.getElementById("provider-checkboxes");
          if (providerCheckboxContainer) {
            var existingCheckbox = document.getElementById(`provider-${providerName}`);
            if (!existingCheckbox) {
              var checkboxDiv = document.createElement("div");
              checkboxDiv.className = "dropdown-item-text";
              
              var formCheckDiv = document.createElement("div");
              formCheckDiv.className = "form-check";
              
              var checkbox = document.createElement("input");
              checkbox.className = "form-check-input";
              checkbox.type = "checkbox";
              checkbox.id = `provider-${providerName}`;
              checkbox.value = providerName;
              
              var label = document.createElement("label");
              label.className = "form-check-label";
              label.setAttribute("for", `provider-${providerName}`);
              label.textContent = providerName.toUpperCase();
              
              formCheckDiv.appendChild(checkbox);
              formCheckDiv.appendChild(label);
              checkboxDiv.appendChild(formCheckDiv);
              providerCheckboxContainer.appendChild(checkboxDiv);
              
              // Add event listener to uncheck "ALL" when individual provider is selected
              checkbox.addEventListener('change', function() {
                var allCheckbox = document.getElementById("provider-all");
                if (this.checked && allCheckbox) {
                  allCheckbox.checked = false;
                }
                // Update map display and dropdown text
                updateMapBasedOnProviders();
                updateProviderDropdownText();
              });
            }
          }

          if (!geoCspPoints[providerName]) {
            geoCspPoints[providerName] = [];
          }
          geoCspPoints[providerName][0] = new MultiPoint(
            cspPoints[providerName]
          );
        });
        map.render();

        infoAlert("Registered Cloud Regions: " + obj.connectionconfig.length);
      }
    })
    .catch(function (error) {
      if (error.request) {
        document.getElementById("hostname").style.color = "#FF0000";
        document.getElementById("port").style.color = "#FF0000";
      }
      console.log(error);

      Swal.fire({
        title: 'Cannot Get the Cloud information',
        html: `
        <style>
          .swal2-input-container {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            margin-bottom: 10px;
          }
          .swal2-label {
            margin-bottom: 5px;
            font-weight: bold;
          }
          .swal2-input {
            width: 80%;
          }
        </style>
        <p>- Please check the server is ready</p>
        <p>- Update the API endpoint if needed</p>
        <div class="swal2-input-container">
          <label for="hostname-input" class="swal2-label">Hostname:</label>
          <input id="hostname-input" class="swal2-input" placeholder="Enter the hostname" value="${configHostname}">
        </div>
        <div class="swal2-input-container">
          <label for="port-input" class="swal2-label">Port:</label>
          <input id="port-input" class="swal2-input" placeholder="Enter the port number" value="${configPort}">
        </div>
        <div class="swal2-input-container">
          <label for="username-input" class="swal2-label">Username:</label>
          <input id="username-input" class="swal2-input" placeholder="Enter the username" value="${configUsername}">
        </div>
        <div class="swal2-input-container">
          <label for="password-input" class="swal2-label">Password:</label>
          <input id="password-input" class="swal2-input" type="password" placeholder="Enter the password" value="${configPassword}">
        </div>
      `,
        showCancelButton: true,
        confirmButtonText: 'confirm',
        preConfirm: () => {
          const hostname = document.getElementById('hostname-input').value;
          const port = document.getElementById('port-input').value;
          const username = document.getElementById('username-input').value;
          const password = document.getElementById('password-input').value;
          return { hostname, port, username, password };
        }
      }).then((result) => {
        if (result.isConfirmed) {
          const { hostname, port, username, password } = result.value;
          configHostname = hostname;
          configPort = port;
          configUsername = username;
          configPassword = password;
          getConnection();
          updateNsList();
          getMci();
        }
      });

    });
}
window.getConnection = getConnection;

// Helper function to get selected providers
function getSelectedProviders() {
  var allCheckbox = document.getElementById("provider-all");
  if (allCheckbox && allCheckbox.checked) {
    return []; // Empty array means all providers
  }
  
  var selectedProviders = [];
  var providerCheckboxes = document.querySelectorAll('#provider-checkboxes input[type="checkbox"]:checked');
  providerCheckboxes.forEach(cb => {
    selectedProviders.push(cb.value);
  });
  
  return selectedProviders;
}
window.getSelectedProviders = getSelectedProviders;

// Function to update provider dropdown button text
function updateProviderDropdownText() {
  var allCheckbox = document.getElementById("provider-all");
  var dropdownText = document.getElementById("provider-selection-text");
  
  if (!dropdownText) return;
  
  if (allCheckbox && allCheckbox.checked) {
    dropdownText.textContent = "ALL";
    return;
  }
  
  var selectedProviders = [];
  var providerCheckboxes = document.querySelectorAll('#provider-checkboxes input[type="checkbox"]:checked');
  providerCheckboxes.forEach(cb => {
    selectedProviders.push(cb.value.toUpperCase());
  });
  
  if (selectedProviders.length === 0) {
    dropdownText.textContent = "None selected";
  } else if (selectedProviders.length === 1) {
    dropdownText.textContent = selectedProviders[0];
  } else if (selectedProviders.length <= 3) {
    dropdownText.textContent = selectedProviders.join(", ");
  } else {
    dropdownText.textContent = `${selectedProviders.slice(0, 2).join(", ")} + ${selectedProviders.length - 2}`;
  }
}
window.updateProviderDropdownText = updateProviderDropdownText;

// Function to update map display based on selected providers
function updateMapBasedOnProviders() {
  var selectedProviders = getSelectedProviders();
  var allCheckbox = document.getElementById("provider-all");
  var showAll = allCheckbox && allCheckbox.checked;
  
  // If showing all or no specific providers selected, show all CSP points
  if (showAll || selectedProviders.length === 0) {
    Object.keys(geoCspPoints).forEach((csp) => {
      if (geoCspPoints[csp] && geoCspPoints[csp][0]) {
        // Show all CSP points
        var layer = map.getLayers().getArray().find(l => l.get('cspType') === csp);
        if (layer) {
          layer.setVisible(true);
        }
      }
    });
  } else {
    // Show only selected providers
    Object.keys(geoCspPoints).forEach((csp) => {
      if (geoCspPoints[csp] && geoCspPoints[csp][0]) {
        var shouldShow = selectedProviders.includes(csp);
        var layer = map.getLayers().getArray().find(l => l.get('cspType') === csp);
        if (layer) {
          layer.setVisible(shouldShow);
        }
      }
    });
  }
  
  map.render();
}
window.updateMapBasedOnProviders = updateMapBasedOnProviders;

function isNormalInteger(str) {
  var n = Math.floor(Number(str));
  return n !== Infinity && String(n) === str && n > 0;
}

var createMciReqTmplt = {
  description: "Made via cb-mapui",
  installMonAgent: "no",
  name: "mci",
  subGroups: [],
};

var createMciReqVmTmplt = {
  imageId: "ubuntu22.04",
  specId: "",
  description: "mapui",
  rootDiskType: "default",
  rootDiskSize: "default",
  subGroupSize: "",
  name: "",
};

// Final MCI Creation Confirmation with options
function showFinalMciConfirmation(createMciReq, url, totalCost, totalNodeScale, costDetailsHtml, subGroupReqString, username, password) {
  Swal.fire({
    title: "Are you sure you want to create this MCI?",
    width: 750,
    html:
      "<font size=4>" +
      "<br><b><span style='color: black; font-size: larger;'>" + createMciReq.name + " </b> (" + totalNodeScale + " node(s))" + "</span><br>" +
      "<hr>" +
      costDetailsHtml +
      "<hr>" +
      subGroupReqString +
      "<br><br><input type='checkbox' id='hold-checkbox'> Hold VM provisioning of the MCI" +
      "<br><input type='checkbox' id='monitoring-checkbox'> Deploy a monitoring agent" +
      "<br><input type='checkbox' id='postcommand-checkbox'> Add post-deployment commands",
    showCancelButton: true,
    confirmButtonText: "Confirm",
    scrollbarPadding: false,
    preConfirm: () => {
      return {
        monitoring: document.getElementById('monitoring-checkbox').checked,
        hold: document.getElementById('hold-checkbox').checked,
        addPostCommand: document.getElementById('postcommand-checkbox').checked
      };
    }
  }).then((result) => {
    if (result.isConfirmed) {
      createMciReq.installMonAgent = "no";
      if (result.value.monitoring) {
        Swal.fire("Create MCI with a monitoring agent");
        createMciReq.installMonAgent = "yes";
      }
      if (result.value.hold) {
        Swal.fire("Create MCI with hold option. It will not be deployed immediately. Use Action:Continue when you are ready.");
        url += "?option=hold";
      }

      if (result.value.addPostCommand) {
        // Show postCommand input popup
        Swal.fire({
          title: "<font size=5><b>Add post-deployment commands</b></font>",
          width: 900,
          html: `
            <div id="dynamicContainer" style="text-align: left;">
              <p><font size=4><b>[Commands]</b></font></p>
              <div id="cmdContainer" style="margin-bottom: 20px;">
                <div id="cmdDiv1" class="cmdRow">
                  Command 1: <input type="text" id="cmd1" style="width: 75%" value="${defaultRemoteCommand[0]}">
                  <button onclick="document.getElementById('cmd1').value = ''">Clear</button>
                </div>
                <div id="cmdDiv2" class="cmdRow">
                  Command 2: <input type="text" id="cmd2" style="width: 75%" value="${defaultRemoteCommand[1]}">
                  <button onclick="document.getElementById('cmd2').value = ''">Clear</button>
                </div>
                <div id="cmdDiv3" class="cmdRow">
                  Command 3: <input type="text" id="cmd3" style="width: 75%" value="${defaultRemoteCommand[2]}">
                  <button onclick="document.getElementById('cmd3').value = ''">Clear</button>
                </div>
                <button id="addCmd" onclick="addCmd()" style="margin-left: 1px;"> + </button>
              </div>

              <p><font size=4><b>[Predefined Scripts]</b></font></p>
              <div style="margin-bottom: 15px;">
                <select id="predefinedScripts" style="width: 75%; padding: 5px;" onchange="loadPredefinedScript()">
                  <option value="">-- Select a predefined script --</option>
                  <option value="Nvidia">[GPU Driver] Nvidia CUDA Driver</option>
                  <option value="Nvidia-Status">[GPU Driver] Check Nvidia CUDA Driver</option>
                  <option value="Setup-CrossNAT">[Network Config] Setup Cross NAT</option>
                  <option value="vLLM">[LLM vLLM] vLLM Server</option>
                  <option value="Ollama">[LLM Ollama] Ollama LLM Server</option>
                  <option value="OllamaPull">[LLM Model] Ollama Model Pull</option>
                  <option value="OpenWebUI">[LLM WebUI] Open WebUI for Ollama</option>
                  <option value="RayHead-Deploy">[ML Ray] Deploy Ray Cluster (Head)</option>
                  <option value="RayWorker-Deploy">[ML Ray] Deploy Ray Cluster (Worker)</option>
                  <option value="WeaveScope">[Observability] Weave Scope</option>
                  <option value="ELK">[Observability] ELK Stack</option>
                  <option value="Jitsi">[Video Conference] Jitsi Meet</option>
                  <option value="Xonotic">[Game:FPS] Xonotic Game Server</option>
                  <option value="Westward">[Game:MMORPG] Westward Game</option>
                  <option value="Nginx">[Web:Server] Nginx Web Server</option>
                  <option value="Stress">[Web:Stress] Stress Test</option>
                </select>
                <div style="font-size: 0.8em; color: #666; margin-top: 3px;">
                  Select a predefined script to auto-fill the command fields
                </div>
              </div>        

              <p><font size=4><b>[Label Selector]</b></font></p>
              <div style="margin-bottom: 15px;">
                <input type="text" id="labelSelector" style="width: 75%" placeholder="ex: role=worker,env=production">
                <div style="font-size: 0.8em; color: #666; margin-top: 3px;">
                  ex: Optional: set targets by the label (ex: role=worker,env=production,sys.id=g1-2)
                </div>
              </div>
              
            </div>`,
          showCancelButton: true,
          confirmButtonText: "Confirm",
          didOpen: () => {
            window.addCmd = () => {
              const cmdContainer = document.getElementById('cmdContainer');
              const cmdCount = cmdContainer.children.length;
              if (cmdCount >= 10) {
                Swal.showValidationMessage('Maximum 10 commands allowed');
                return;
              }
              const newCmdDiv = document.createElement('div');
              newCmdDiv.id = `cmdDiv${cmdCount}`;
              newCmdDiv.className = 'cmdRow';
              newCmdDiv.innerHTML = `
                Command ${cmdCount}: <input type="text" id="cmd${cmdCount}" style="width: 75%">
                <button onclick="document.getElementById('cmd${cmdCount}').value = ''">Clear</button>
              `;
              cmdContainer.appendChild(newCmdDiv);
            };

            // Use predefined script dropdown to load default commands
            const scriptSelect = document.getElementById('predefinedScripts');
            if (scriptSelect) {
              scriptSelect.removeEventListener('change', window.loadPredefinedScript);
              scriptSelect.addEventListener('change', window.loadPredefinedScript);
              if (scriptSelect.value) {
                window.loadPredefinedScript();
              }
            }
          },
          preConfirm: () => {
            const commands = [];
            const cmdContainer = document.getElementById('cmdContainer');
            for (let i = 1; i <= cmdContainer.children.length - 1; i++) {
              const cmdInput = document.getElementById(`cmd${i}`);
              if (cmdInput && cmdInput.value.trim()) {
                commands.push(cmdInput.value.trim());
              }
            }
            return commands;
          },
        }).then((cmdResult) => {
          if (cmdResult.isConfirmed && cmdResult.value && cmdResult.value.length > 0) {
            createMciReq.postCommand = {
              command: cmdResult.value,
              userName: "cb-user"
            };
            proceedWithMciCreation(createMciReq, url, username, password);
          }
          // User cancelled the postCommand dialog or no commands were entered
        });
      } else {
        // No postCommand needed, proceed with MCI creation
        proceedWithMciCreation(createMciReq, url, username, password);
      }
    }
  });
}

// MCI Creation execution
// Function to build cloud-agnostic custom images
function proceedWithBuildAgnosticImage(createMciReq, snapshotName, snapshotDescription, cleanupMciAfterSnapshot, username, password) {
  const hostname = configHostname;
  const port = configPort;
  const namespace = namespaceElement.value;
  const url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/buildAgnosticImage`;
  
  // Prepare buildAgnosticImage request body
  const buildImageReq = {
    sourceMciReq: createMciReq,
    snapshotReq: {
      name: snapshotName,
      description: snapshotDescription
    },
    cleanupMciAfterSnapshot: cleanupMciAfterSnapshot
  };
  
  const jsonBody = JSON.stringify(buildImageReq, undefined, 4);
  const spinnerId = addSpinnerTask("Building custom images from: " + createMciReq.name);
  const requestId = generateRandomRequestId("build-image-" + createMciReq.name + "-", 10);
  addRequestIdToSelect(requestId);

  // Show progress notification
  Swal.fire({
    title: "📦 Building Cloud-Agnostic Images",
    html: `
      <div style="text-align: left; padding: 15px;">
        <p><strong>Starting workflow...</strong></p>
        <p style="color: #666; font-size: 0.9em;">
          ⏳ This process may take 10-20 minutes<br>
          1️⃣ Creating MCI infrastructure<br>
          2️⃣ Executing post-deployment commands<br>
          3️⃣ Creating custom snapshots<br>
          4️⃣ Waiting for images to become Available<br>
          ${cleanupMciAfterSnapshot ? '5️⃣ Cleaning up infrastructure' : '5️⃣ Preserving infrastructure'}
        </p>
      </div>
    `,
    icon: "info",
    showConfirmButton: true,
    confirmButtonText: "OK, Continue",
    timer: 5000,
    timerProgressBar: true
  });

  axios({
    method: "post",
    url: url,
    headers: { "Content-Type": "application/json", "x-request-id": requestId },
    data: jsonBody,
    auth: {
      username: username,
      password: password,
    },
  })
    .then((res) => {
      console.log("BuildAgnosticImage completed:", res.data);
      
      const result = res.data;
      
      // Activate control-tab after successful operation
      try {
        document.querySelectorAll('.nav-link').forEach(tab => tab.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('show', 'active'));
        
        const controlTab = document.getElementById('control-tab');
        const controlPane = document.getElementById('control');
        
        if (controlTab && controlPane) {
          controlTab.classList.add('active');
          controlPane.classList.add('show', 'active');
          if (typeof $ !== 'undefined' && $.fn.tab) {
            $(controlTab).tab('show');
          }
        }
      } catch (error) {
        console.log('Failed to activate control tab:', error);
      }

      // Display success message with details
      Swal.fire({
        icon: "success",
        title: "✅ Custom Images Created Successfully!",
        html: `
          <div style="text-align: left; padding: 15px;">
            <p><strong>Build Summary:</strong></p>
            <ul style="list-style: none; padding-left: 0;">
              <li>📦 <strong>MCI:</strong> ${result.mciId || 'N/A'}</li>
              <li>⏱️ <strong>Duration:</strong> ${result.totalDuration || 'N/A'}</li>
              <li>✅ <strong>Success:</strong> ${result.snapshotResult?.successCount || 0} images</li>
              <li>❌ <strong>Failed:</strong> ${result.snapshotResult?.failCount || 0} images</li>
              <li>🗑️ <strong>MCI Cleaned:</strong> ${result.mciCleanedUp ? 'Yes' : 'No'}</li>
            </ul>
            ${result.snapshotResult?.results ? `
              <p><strong>Created Images:</strong></p>
              <ul style="max-height: 200px; overflow-y: auto;">
                ${result.snapshotResult.results.map(img => 
                  `<li><strong>${img.imageId}</strong> (${img.subGroupId}) - ${img.status}</li>`
                ).join('')}
              </ul>
            ` : ''}
            <p style="color: #666; font-size: 0.9em; margin-top: 10px;">
              ${result.message || 'Operation completed'}
            </p>
          </div>
        `,
        confirmButtonText: "View Custom Images",
        showCancelButton: true,
        cancelButtonText: "Close"
      }).then((result) => {
        if (result.isConfirmed) {
          // Open Snapshot Management modal to show created images
          showSnapshotManagementModal();
        }
      });

      displayJsonData(res.data, typeInfo);
      handleAxiosResponse(res);
      updateMciList();
      clearCircle("none");
    })
    .catch(function (error) {
      errorAlert("Failed to build agnostic images from: " + createMciReq.name);
      
      let errorDetail = "Unknown error occurred";
      if (error.response) {
        console.log(error.response.data);
        console.log(error.response.status);
        console.log(error.response.headers);
        displayJsonData(error.response.data, typeError);
        errorDetail = error.response.data?.message || JSON.stringify(error.response.data);
      } else {
        console.log("Error", error.message);
        errorDetail = error.message;
      }
      
      Swal.fire({
        icon: "error",
        title: "❌ Image Build Failed",
        html: `
          <div style="text-align: left; padding: 15px;">
            <p><strong>Error Details:</strong></p>
            <div style="background-color: #f8f9fa; padding: 10px; border-radius: 5px; max-height: 200px; overflow-y: auto;">
              <code>${errorDetail}</code>
            </div>
          </div>
        `,
        confirmButtonText: "Close"
      });
      
      console.log(error.config);
    })
    .finally(function () {
      removeSpinnerTask(spinnerId);
    });
}

function proceedWithMciCreation(createMciReq, url, username, password) {
  var jsonBody = JSON.stringify(createMciReq, undefined, 4);
  // MCI creation now tracked by spinner instead of console log
  var spinnerId = addSpinnerTask("Creating MCI: " + createMciReq.name);

  var requestId = generateRandomRequestId("mci-" + createMciReq.name + "-", 10);
  addRequestIdToSelect(requestId);

  axios({
    method: "post",
    url: url,
    headers: { "Content-Type": "application/json", "x-request-id": requestId },
    data: jsonBody,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
  })
    .then((res) => {
      // Debug: uncomment if detailed response debugging needed
      // console.log(res); // for debug

      // Activate control-tab after successful MCI creation
      try {
        // Remove active class from all tabs
        document.querySelectorAll('.nav-link').forEach(tab => {
          tab.classList.remove('active');
        });
        document.querySelectorAll('.tab-pane').forEach(pane => {
          pane.classList.remove('show', 'active');
        });
        
        // Activate control-tab
        const controlTab = document.getElementById('control-tab');
        const controlPane = document.getElementById('control');
        
        if (controlTab && controlPane) {
          controlTab.classList.add('active');
          controlPane.classList.add('show', 'active');
          
          // Trigger Bootstrap tab shown event if needed
          if (typeof $ !== 'undefined' && $.fn.tab) {
            $(controlTab).tab('show');
          }
        }
      } catch (error) {
        console.log('Failed to activate control tab:', error);
      }

      displayJsonData(res.data, typeInfo);
      handleAxiosResponse(res);

      updateMciList();

      clearCircle("none");
      console.log("Created " + createMciReq.name);
    })
    .catch(function (error) {
      errorAlert("Failed to create MCI: " + createMciReq.name);
      if (error.response) {
        // status code is not 2xx
        console.log(error.response.data);
        console.log(error.response.status);
        console.log(error.response.headers);
        displayJsonData(error.response.data, typeError);
      } else {
        console.log("Error", error.message);
      }
      console.log(error.config);
    })
    .finally(function () {
      removeSpinnerTask(spinnerId);
    });
}

// Show post-deployment command dialog
function showPostCommandDialog(createMciReq, mciCreationUrl, username, password, buildAgnosticImage = false) {
  Swal.fire({
    title: buildAgnosticImage ? 
      "<font size=5><b>📦 Build Cloud-Agnostic Custom Image</b></font>" : 
      "<font size=5><b>Add post-deployment commands</b></font>",
    width: 900,
    html: `
      <div id="dynamicContainer" style="text-align: left;">
        ${buildAgnosticImage ? `
          <div style="background-color: #e3f2fd; padding: 12px; border-radius: 8px; margin-bottom: 15px; border-left: 4px solid #2196f3;">
            <p style="margin: 0; font-size: 0.9em; color: #1565c0;">
              <strong>🔧 Image Building Workflow:</strong><br>
              1️⃣ Create MCI infrastructure<br>
              2️⃣ Execute post-deployment commands (setup software)<br>
              3️⃣ Create custom snapshots from VMs<br>
              4️⃣ Wait for images to become Available<br>
              5️⃣ Cleanup infrastructure (optional)
            </p>
          </div>
        ` : ''}
        
        <p><font size=4><b>[Commands]</b></font></p>
        <div id="cmdContainer" style="margin-bottom: 20px;">
          <div id="cmdDiv1" class="cmdRow">
            Command 1: <input type="text" id="cmd1" style="width: 75%" value="${defaultRemoteCommand[0]}">
            <button onclick="document.getElementById('cmd1').value = ''">Clear</button>
          </div>
          <div id="cmdDiv2" class="cmdRow">
            Command 2: <input type="text" id="cmd2" style="width: 75%" value="${defaultRemoteCommand[1]}">
            <button onclick="document.getElementById('cmd2').value = ''">Clear</button>
          </div>
          <div id="cmdDiv3" class="cmdRow">
            Command 3: <input type="text" id="cmd3" style="width: 75%" value="${defaultRemoteCommand[2]}">
            <button onclick="document.getElementById('cmd3').value = ''">Clear</button>
          </div>
          <button id="addCmd" onclick="addCmd()" style="margin-left: 1px;"> + </button>
        </div>

        <p><font size=4><b>[Predefined Scripts]</b></font></p>
        <div style="margin-bottom: 15px;">
          <select id="predefinedScripts" style="width: 75%; padding: 5px;" onchange="loadPredefinedScript()">
            <option value="">-- Select a predefined script --</option>
            <option value="Nvidia">[GPU Driver] Nvidia CUDA Driver</option>
            <option value="Nvidia-Status">[GPU Driver] Check Nvidia CUDA Driver</option>
            <option value="Setup-CrossNAT">[Network Config] Setup Cross NAT</option>
            <option value="vLLM">[LLM vLLM] vLLM Server</option>
            <option value="Ollama">[LLM Ollama] Ollama LLM Server</option>
            <option value="OllamaPull">[LLM Model] Ollama Model Pull</option>
            <option value="OpenWebUI">[LLM WebUI] Open WebUI for Ollama</option>
            <option value="RayHead-Deploy">[ML Ray] Deploy Ray Cluster (Head)</option>
            <option value="RayWorker-Deploy">[ML Ray] Deploy Ray Cluster (Worker)</option>
            <option value="WeaveScope">[Observability] Weave Scope</option>
            <option value="ELK">[Observability] ELK Stack</option>
            <option value="Jitsi">[Video Conference] Jitsi Meet</option>
            <option value="Xonotic">[Game:FPS] Xonotic Game Server</option>
            <option value="Westward">[Game:MMORPG] Westward Game</option>
            <option value="Nginx">[Web:Server] Nginx Web Server</option>
            <option value="Stress">[Web:Stress] Stress Test</option>
          </select>
          <div style="font-size: 0.8em; color: #666; margin-top: 3px;">
            Select a predefined script to auto-fill the command fields
          </div>
        </div>        

        <p><font size=4><b>[Label Selector]</b></font></p>
        <div style="margin-bottom: 15px;">
          <input type="text" id="labelSelector" style="width: 75%" placeholder="ex: role=worker,env=production">
          <div style="font-size: 0.8em; color: #666; margin-top: 3px;">
            ex: Optional: set targets by the label (ex: role=worker,env=production,sys.id=g1-2)
          </div>
        </div>
        
        ${buildAgnosticImage ? `
          <hr style="margin: 20px 0;">
          <p><font size=4><b>[Custom Image Settings]</b></font></p>
          <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 8px;">
              <strong>Image Name Prefix:</strong>
              <input type="text" id="snapshotName" style="width: 75%; margin-top: 5px;" 
                     placeholder="custom-image" value="custom-image">
            </label>
            <div style="font-size: 0.8em; color: #666; margin-top: 3px;">
              The final image name will be: prefix-subgroupname (e.g., custom-image-g1)
            </div>
          </div>
          
          <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 8px;">
              <strong>Image Description:</strong>
              <textarea id="snapshotDescription" style="width: 75%; height: 60px; margin-top: 5px; padding: 5px;" 
                        placeholder="Description about this custom image">Custom image created with BuildAgnosticImage workflow</textarea>
            </label>
          </div>
          
          <div style="margin-bottom: 15px;">
            <label style="display: flex; align-items: center; cursor: pointer;">
              <input type="checkbox" id="cleanupMciCheckbox" checked style="margin-right: 8px; transform: scale(1.2);">
              <span style="color: #333; font-weight: 500;">🗑️ Cleanup MCI after image creation</span>
            </label>
            <div style="font-size: 0.8em; color: #666; margin-top: 3px; margin-left: 28px;">
              Automatically terminate and delete MCI after custom images are created and available
            </div>
          </div>
        ` : ''}
        
      </div>`,
    showCancelButton: true,
    confirmButtonText: buildAgnosticImage ? "🚀 Build Custom Images" : "Add & Create MCI",
    didOpen: () => {
      window.addCmd = () => {
        const cmdContainer = document.getElementById('cmdContainer');
        const cmdCount = cmdContainer.children.length;
        if (cmdCount >= 10) {
          Swal.showValidationMessage('Maximum 10 commands allowed');
          return;
        }
        const newCmdDiv = document.createElement('div');
        newCmdDiv.id = `cmdDiv${cmdCount}`;
        newCmdDiv.className = 'cmdRow';
        newCmdDiv.innerHTML = `
          Command ${cmdCount}: <input type="text" id="cmd${cmdCount}" style="width: 75%">
          <button onclick="document.getElementById('cmd${cmdCount}').value = ''">Clear</button>
        `;
        cmdContainer.appendChild(newCmdDiv);
      };

      // Use predefined script dropdown to load default commands
      const scriptSelect = document.getElementById('predefinedScripts');
      if (scriptSelect) {
        scriptSelect.removeEventListener('change', window.loadPredefinedScript);
        scriptSelect.addEventListener('change', window.loadPredefinedScript);
        if (scriptSelect.value) {
          window.loadPredefinedScript();
        }
      }
    },
    preConfirm: () => {
      const commands = [];
      const cmdContainer = document.getElementById('cmdContainer');
      for (let i = 1; i <= cmdContainer.children.length - 1; i++) {
        const cmdInput = document.getElementById(`cmd${i}`);
        if (cmdInput && cmdInput.value.trim()) {
          commands.push(cmdInput.value.trim());
        }
      }
      const labelSelector = document.getElementById('labelSelector').value.trim();
      
      const result = { commands, labelSelector };
      
      // Add buildAgnosticImage specific parameters if applicable
      if (buildAgnosticImage) {
        const snapshotName = document.getElementById('snapshotName')?.value?.trim() || 'custom-image';
        const snapshotDescription = document.getElementById('snapshotDescription')?.value?.trim() || 'Custom image created with BuildAgnosticImage workflow';
        const cleanupMci = document.getElementById('cleanupMciCheckbox')?.checked !== false;
        
        result.snapshotName = snapshotName;
        result.snapshotDescription = snapshotDescription;
        result.cleanupMciAfterSnapshot = cleanupMci;
      }
      
      return result;
    }
  }).then((commandResult) => {
    if (commandResult.isConfirmed) {
      if (commandResult.value.commands && commandResult.value.commands.length > 0) {
        createMciReq.postCommand = {
          command: commandResult.value.commands,
          userName: "cb-user"
        };
        if (commandResult.value.labelSelector) {
          createMciReq.postCommand.labelSelector = commandResult.value.labelSelector;
        }
      }
      
      // Handle buildAgnosticImage workflow
      if (buildAgnosticImage) {
        proceedWithBuildAgnosticImage(
          createMciReq, 
          commandResult.value.snapshotName,
          commandResult.value.snapshotDescription,
          commandResult.value.cleanupMciAfterSnapshot,
          username, 
          password
        );
      } else {
        proceedWithMciCreation(createMciReq, mciCreationUrl, username, password);
      }
    }
  });
}

// MCI Review function - checks configuration before creation
function reviewMciConfiguration(createMciReq, hostname, port, username, password, namespace, finalUrl, totalCost, totalNodeScale, costDetailsHtml, subGroupReqString) {
  var reviewUrl = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mciDynamicReview`;
  
  // Show loading spinner for review
  Swal.fire({
    title: "Reviewing Configuration...",
    html: "Please wait while we validate your MCI configuration",
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
    }
  });

  var jsonBody = JSON.stringify(createMciReq, undefined, 4);
  var requestId = generateRandomRequestId("review-" + createMciReq.name + "-", 10);

  // Call MCI Dynamic Review API
  axios({
    method: "post",
    url: reviewUrl,
    headers: { 
      "Content-Type": "application/json", 
      "x-request-id": requestId 
    },
    data: jsonBody,
    auth: {
      username: username,
      password: password,
    },
  })
  .then((res) => {
    // Debug: uncomment if detailed review response debugging needed
    // console.log("Review Response:", res); // for debug
    
    var reviewData = res.data;
    var validationStatus = "success";
    var validationDetails = "";
    var warnings = [];
    var errors = [];
    var infos = [];
    var vmDetailsList = [];
    var resourceSummary = {
      totalEstimatedTime: "N/A",
      totalResources: 0,
      providerBreakdown: {},
      regionBreakdown: {},
      specBreakdown: {}
    };
    
    // Parse enhanced review response to extract comprehensive validation information
    if (reviewData) {
      // Extract MCI-level information (prioritize backend-calculated values)
      if (reviewData.mciName) infos.push(`MCI Name: ${reviewData.mciName}`);
      // Use backend-calculated totalVmCount if available, fallback to frontend calculation
      if (reviewData.totalVmCount) {
        infos.push(`SubGroups: ${reviewData.totalVmCount}`);
        // Update totalNodeScale with backend value if available
        totalNodeScale = reviewData.totalVmCount;
      } else {
        infos.push(`SubGroups: ${totalNodeScale} (frontend calculated)`);
      }
      // Use backend-calculated estimatedCost if available
      if (reviewData.estimatedCost) {
        infos.push(`Estimated Cost: ${reviewData.estimatedCost}`);
        // Parse and update totalCost with backend value if numeric
        var backendCostMatch = String(reviewData.estimatedCost).match(/\$?([\d.]+)/);
        if (backendCostMatch) {
          totalCost = parseFloat(backendCostMatch[1]);
        }
      }
      if (reviewData.overallStatus) {
        infos.push(`Overall Status: ${reviewData.overallStatus}`);
        if (reviewData.overallStatus.toLowerCase().includes("error")) {
          errors.push(`MCI Status Error: ${reviewData.overallMessage || reviewData.overallStatus}`);
          validationStatus = "error";
        } else if (reviewData.overallStatus.toLowerCase().includes("warning")) {
          warnings.push(`MCI Status Warning: ${reviewData.overallMessage || reviewData.overallStatus}`);
        }
      }
      
      if (reviewData.overallMessage) infos.push(`Message: ${reviewData.overallMessage}`);
      if (reviewData.creationViable !== undefined) infos.push(`Creation Viable: ${reviewData.creationViable ? 'Yes' : 'No'}`);
      if (reviewData.policyOnPartialFailure) infos.push(`Failure Policy: ${reviewData.policyOnPartialFailure}`);
      if (reviewData.policyDescription) infos.push(`Policy Description: ${reviewData.policyDescription}`);
      
      // Extract ResourceSummary information
      if (reviewData.resourceSummary) {
        var rs = reviewData.resourceSummary;
        if (rs.totalProviders) resourceSummary.totalProviders = rs.totalProviders;
        if (rs.totalRegions) resourceSummary.totalRegions = rs.totalRegions;
        if (rs.availableSpecs !== undefined) resourceSummary.availableSpecs = rs.availableSpecs;
        if (rs.unavailableSpecs !== undefined) resourceSummary.unavailableSpecs = rs.unavailableSpecs;
        if (rs.availableImages !== undefined) resourceSummary.availableImages = rs.availableImages;
        if (rs.unavailableImages !== undefined) resourceSummary.unavailableImages = rs.unavailableImages;
        
        // Provider breakdown
        if (rs.providerNames && Array.isArray(rs.providerNames)) {
          rs.providerNames.forEach(provider => {
            resourceSummary.providerBreakdown[provider] = (resourceSummary.providerBreakdown[provider] || 0) + 1;
          });
        }
        
        // Region breakdown  
        if (rs.regionNames && Array.isArray(rs.regionNames)) {
          rs.regionNames.forEach(region => {
            resourceSummary.regionBreakdown[region] = (resourceSummary.regionBreakdown[region] || 0) + 1;
          });
        }
        
        // Spec breakdown
        if (rs.uniqueSpecs && Array.isArray(rs.uniqueSpecs)) {
          rs.uniqueSpecs.forEach(spec => {
            resourceSummary.specBreakdown[spec] = (resourceSummary.specBreakdown[spec] || 0) + 1;
          });
        }
      }
      
      // Parse VM review results in detail and group by SubGroup
      if (reviewData.vmReviews && Array.isArray(reviewData.vmReviews)) {
        resourceSummary.totalResources = reviewData.vmReviews.length;
        
        // Group VMs by SubGroup name for better organization
        var subGroupVMs = {};
        
        reviewData.vmReviews.forEach((vmReview, index) => {
          var vmDetails = {
            index: index + 1,
            name: vmReview.vmName || `VM-${index + 1}`,
            subGroupName: vmReview.subGroupName || vmReview.vmName || `VM-${index + 1}`,
            subGroupSize: vmReview.subGroupSize || "1",
            status: vmReview.status || "Unknown",
            message: vmReview.message || "",
            canCreate: vmReview.canCreate || false,
            estimatedCost: vmReview.estimatedCost || "Unknown",
            issues: [],
            info: [],
            validations: {}
          };
          
          // VM basic information with enhanced SubGroup details
          if (vmReview.subGroupSize) {
            var actualVMs = parseInt(vmReview.subGroupSize) || 1;
            vmDetails.info.push(`SubGroup Size: ${vmReview.subGroupSize} VM${actualVMs > 1 ? 's' : ''}`);
            if (actualVMs > 1) {
              vmDetails.info.push(`Total VMs in SubGroup: ${actualVMs} instances`);
            }
          }
          if (vmReview.connectionName) vmDetails.info.push(`Connection: ${vmReview.connectionName}`);
          if (vmReview.providerName) vmDetails.info.push(`Provider: ${vmReview.providerName}`);
          if (vmReview.regionName) vmDetails.info.push(`Region: ${vmReview.regionName}`);
          
          // Group VMs by SubGroup name
          var groupKey = vmDetails.subGroupName;
          if (!subGroupVMs[groupKey]) {
            subGroupVMs[groupKey] = [];
          }
          subGroupVMs[groupKey].push(vmDetails);
          
          // Spec validation details
          if (vmReview.specValidation) {
            var sv = vmReview.specValidation;
            vmDetails.validations.spec = {
              resourceId: sv.resourceId,
              resourceName: sv.resourceName,
              isAvailable: sv.isAvailable,
              status: sv.status,
              message: sv.message,
              cspResourceId: sv.cspResourceId
            };
            
            if (!sv.isAvailable) {
              vmDetails.issues.push(`Spec Issue: ${sv.message || 'Spec not available'}`);
            }
          }
          
          // Image validation details
          if (vmReview.imageValidation) {
            var iv = vmReview.imageValidation;
            vmDetails.validations.image = {
              resourceId: iv.resourceId,
              resourceName: iv.resourceName,
              isAvailable: iv.isAvailable,
              status: iv.status,
              message: iv.message,
              cspResourceId: iv.cspResourceId
            };
            
            if (!iv.isAvailable) {
              vmDetails.issues.push(`Image Issue: ${iv.message || 'Image not available'}`);
            }
          }
          
          // VM-level errors, warnings, and info
          if (vmReview.errors && Array.isArray(vmReview.errors)) {
            vmReview.errors.forEach(error => {
              vmDetails.issues.push(`Error: ${error}`);
              errors.push(`VM ${index + 1} (${vmDetails.name}): ${error}`);
              validationStatus = "error";
            });
          }
          
          if (vmReview.warnings && Array.isArray(vmReview.warnings)) {
            vmReview.warnings.forEach(warning => {
              vmDetails.issues.push(`Warning: ${warning}`);
              warnings.push(`VM ${index + 1} (${vmDetails.name}): ${warning}`);
            });
          }
          
          if (vmReview.info && Array.isArray(vmReview.info)) {
            vmReview.info.forEach(info => {
              vmDetails.info.push(info);
            });
          }
          
          // Don't add individual VMs to vmDetailsList anymore, we'll use subGroupVMs
        });
        
        // Convert subGroupVMs to organized vmDetailsList
        Object.keys(subGroupVMs).forEach(groupName => {
          var groupVMs = subGroupVMs[groupName];
          // Add SubGroup as a single entry with consolidated information
          if (groupVMs.length > 0) {
            var representativeVM = groupVMs[0];
            var subGroupSize = parseInt(representativeVM.subGroupSize) || 1;
            
            // Find corresponding VM configuration from createMciReq for additional spec details
            var vmConfig = null;
            if (createMciReq && createMciReq.subGroups) {
              vmConfig = createMciReq.subGroups.find(vm => vm.name === groupName);
            }
            
            var groupDetails = {
              index: representativeVM.index,
              name: groupName,
              isSubGroup: true,
              subGroupSize: subGroupSize,
              status: representativeVM.status,
              message: representativeVM.message,
              canCreate: representativeVM.canCreate,
              estimatedCost: representativeVM.estimatedCost,
              issues: representativeVM.issues,
              info: representativeVM.info,
              validations: representativeVM.validations,
              vmInstances: groupVMs.length,
              // Add VM configuration details
              vmConfig: vmConfig
            };
            
            // Calculate total cost for SubGroup if cost per VM is available
            if (representativeVM.estimatedCost && representativeVM.estimatedCost !== 'Unknown') {
              var costMatch = String(representativeVM.estimatedCost).match(/\$?([\d.]+)/);
              if (costMatch) {
                var costPerVM = parseFloat(costMatch[1]);
                var totalSubGroupCost = (costPerVM * subGroupSize).toFixed(4);
                groupDetails.estimatedCost = `$${totalSubGroupCost}/hour (${subGroupSize} × $${costPerVM})`;
              }
            }
            
            vmDetailsList.push(groupDetails);
          }
        });
      }
      
      // Extract recommendations
      if (reviewData.recommendations && Array.isArray(reviewData.recommendations)) {
        reviewData.recommendations.forEach(rec => {
          if (rec.toLowerCase().includes('warning') || rec.toLowerCase().includes('caution')) {
            warnings.push(`Recommendation: ${rec}`);
          } else {
            infos.push(`Recommendation: ${rec}`);
          }
        });
      }
      
      // Check for any additional validation messages
      if (reviewData.description && reviewData.description.includes("validation")) {
        validationDetails = reviewData.description;
      }
    }

    // Build validation summary HTML
    var validationSummaryHtml = "";
    
    if (validationStatus === "success" && warnings.length === 0 && errors.length === 0) {
      validationSummaryHtml = `
        <div style="margin: 15px 0; padding: 12px; background-color: #f0f8f0; border: 1px solid #28a745; border-radius: 5px;">
          <h4 style="color: #28a745; margin: 0 0 8px 0; font-size: 1em;">✅ Configuration Valid</h4>
          <p style="color: #666; margin: 0; font-size: 0.9em;">Your MCI configuration has been validated successfully. All resources can be provisioned as configured.</p>
        </div>
      `;
    } else {
      if (errors.length > 0) {
        validationSummaryHtml += `
          <div style="margin: 15px 0; padding: 12px; background-color: #fff0f0; border: 1px solid #dc3545; border-radius: 5px;">
            <h4 style="color: #dc3545; margin: 0 0 8px 0; font-size: 1em;">❌ Configuration Errors</h4>
            <ul style="color: #666; margin: 0; padding-left: 20px; font-size: 0.9em;">
              ${errors.map(error => `<li>${error}</li>`).join('')}
            </ul>
          </div>
        `;
      }
      
      if (warnings.length > 0) {
        validationSummaryHtml += `
          <div style="margin: 15px 0; padding: 12px; background-color: #fff8f0; border: 1px solid #ffc107; border-radius: 5px;">
            <h4 style="color: #ffc107; margin: 0 0 8px 0; font-size: 1em;">⚠️ Configuration Warnings</h4>
            <ul style="color: #666; margin: 0; padding-left: 20px; font-size: 0.9em;">
              ${warnings.map(warning => `<li>${warning}</li>`).join('')}
            </ul>
          </div>
        `;
      }
    }

    // Build comprehensive information sections with structured layout
    var mciInfoHtml = "";
    if (infos.length > 0) {
      // Parse structured information from the review response
      var structuredInfo = {
        basic: [],
        status: [],
        policy: [],
        recommendations: []
      };
      
      infos.forEach(info => {
        if (info.includes('MCI Name:') || info.includes('Total VM Count:') || info.includes('Estimated Cost:')) {
          // Special handling for estimated cost
          if (info.includes('Estimated Cost:')) {
            const costValue = info.split(': ')[1];
            if (costValue && (costValue.includes('unavailable') || costValue.includes('Cost estimation'))) {
              // Parse cost unavailability messages
              if (costValue.includes('unavailable for all')) {
                const vmCount = costValue.match(/\d+/);
                structuredInfo.basic.push(`Estimated Cost: Not available (${vmCount ? vmCount[0] : 'all'} VMs)`);
              } else if (costValue.includes('unavailable')) {
                structuredInfo.basic.push(`Estimated Cost: Not available`);
              } else {
                structuredInfo.basic.push(info);
              }
            } else {
              structuredInfo.basic.push(info);
            }
          } else {
            structuredInfo.basic.push(info);
          }
        } else if (info.includes('Message:')) {
          structuredInfo.basic.push(info);
        } else if (info.includes('Overall Status:') || info.includes('Creation Viable:')) {
          structuredInfo.status.push(info);
        } else if (info.includes('Failure Policy:') || info.includes('Policy Description:')) {
          structuredInfo.policy.push(info);
        } else if (info.includes('Recommendation:')) {
          structuredInfo.recommendations.push(info.replace('Recommendation: ', ''));
        } else {
          structuredInfo.basic.push(info);
        }
      });
      
      mciInfoHtml = `
        <div style="margin: 15px 0; padding: 0; background-color: #f8f9fa; border: 1px solid #ddd; border-radius: 5px; overflow: hidden;">
          
          <div style="padding: 16px;">
            ${structuredInfo.status.length > 0 ? `
              <div style="margin-bottom: 16px;">
                <div style="margin-top: 8px;">
                  ${(() => {
                    // Separate status items
                    let overallStatus = null;
                    let creationViable = null;
                    let otherStatus = [];
                    
                    structuredInfo.status.forEach(info => {
                      const colonIndex = info.indexOf(': ');
                      if (colonIndex !== -1) {
                        const label = info.substring(0, colonIndex);
                        const value = info.substring(colonIndex + 2);
                        if (label === 'Overall Status') {
                          overallStatus = { label, value };
                        } else if (label === 'Creation Viable') {
                          creationViable = { label, value };
                        } else {
                          otherStatus.push({ label, value });
                        }
                      }
                    });
                    
                    let html = '';
                    
                    // Display Overall Status and Creation Viable in one row
                    if (overallStatus || creationViable) {
                      html += `
                        <div style="display: flex; gap: 12px; margin: 6px 0; flex-wrap: wrap;">
                      `;
                      
                      if (overallStatus) {
                        let valueStyle = 'color: #666; font-size: 1em; font-weight: bold; line-height: 1.4;';
                        let borderColor = '#007bff';
                        let backgroundColor = '#f8f9fa';
                        let statusIcon = '';
                        
                        if (overallStatus.value && overallStatus.value.toLowerCase().includes('ready')) {
                          valueStyle = 'color: #28a745; font-size: 1em; font-weight: bold; line-height: 1.4;';
                          borderColor = '#28a745';
                          backgroundColor = '#f0f8f0';
                          statusIcon = '✅ ';
                        } else if (overallStatus.value && overallStatus.value.toLowerCase().includes('warning')) {
                          valueStyle = 'color: #ffc107; font-size: 1em; font-weight: bold; line-height: 1.4;';
                          borderColor = '#ffc107';
                          backgroundColor = '#fff8f0';
                          statusIcon = '⚠️ ';
                        } else if (overallStatus.value && overallStatus.value.toLowerCase().includes('error')) {
                          valueStyle = 'color: #dc3545; font-size: 1em; font-weight: bold; line-height: 1.4;';
                          borderColor = '#dc3545';
                          backgroundColor = '#fff0f0';
                          statusIcon = '❌ ';
                        }
                        
                        html += `
                          <div style="flex: 1; min-width: 200px; padding: 8px 12px; background: ${backgroundColor}; border-radius: 4px; border-left: 3px solid ${borderColor};">
                            <div style="font-weight: 600; color: #333; margin-bottom: 4px; font-size: 0.9em;">${overallStatus.label}:</div>
                            <div style="${valueStyle}">${statusIcon}${overallStatus.value || 'N/A'}</div>
                          </div>
                        `;
                      }
                      
                      if (creationViable) {
                        let valueStyle = 'color: #666; font-size: 1em; font-weight: bold; line-height: 1.4;';
                        let borderColor = '#007bff';
                        let backgroundColor = '#f8f9fa';
                        let statusIcon = '';
                        
                        if (creationViable.value === 'Yes') {
                          valueStyle = 'color: #28a745; font-size: 1em; font-weight: bold; line-height: 1.4;';
                          borderColor = '#28a745';
                          backgroundColor = '#f0f8f0';
                          statusIcon = '✅ ';
                        } else if (creationViable.value === 'No') {
                          valueStyle = 'color: #dc3545; font-size: 1em; font-weight: bold; line-height: 1.4;';
                          borderColor = '#dc3545';
                          backgroundColor = '#fff0f0';
                          statusIcon = '❌ ';
                        }
                        
                        html += `
                          <div style="flex: 1; min-width: 200px; padding: 8px 12px; background: ${backgroundColor}; border-radius: 4px; border-left: 3px solid ${borderColor};">
                            <div style="font-weight: 600; color: #333; margin-bottom: 4px; font-size: 0.9em;">${creationViable.label}:</div>
                            <div style="${valueStyle}">${statusIcon}${creationViable.value || 'N/A'}</div>
                          </div>
                        `;
                      }
                      
                      html += '</div>';
                    }
                    
                    // Display other status items
                    otherStatus.forEach(statusInfo => {
                      html += `
                        <div style="margin: 6px 0; padding: 8px 12px; background: #f8f9fa; border-radius: 4px; border-left: 3px solid #007bff;">
                          <div style="font-weight: 600; color: #333; margin-bottom: 4px; font-size: 0.9em;">${statusInfo.label}:</div>
                          <div style="color: #666; font-size: 0.9em; line-height: 1.4; word-wrap: break-word; white-space: normal;">${statusInfo.value || 'N/A'}</div>
                        </div>
                      `;
                    });
                    
                    return html;
                  })()}
                </div>
              </div>
            ` : ''}
          
            ${structuredInfo.basic.length > 0 ? `
              <div style="margin-bottom: 16px;">
                
                <div style="margin-top: 8px;">
                  ${(() => {
                    // Separate Message from other basic info but don't display it here
                    const basicInfoWithoutMessage = [];
                    let messageInfo = null;
                    
                    structuredInfo.basic.forEach(info => {
                      const colonIndex = info.indexOf(': ');
                      if (colonIndex !== -1) {
                        const label = info.substring(0, colonIndex);
                        const value = info.substring(colonIndex + 2);
                        if (label === 'Message') {
                          messageInfo = { label, value };
                        } else {
                          basicInfoWithoutMessage.push({ label, value });
                        }
                      }
                    });
                    
                    // Sort basic info (excluding Message)
                    basicInfoWithoutMessage.sort((a, b) => {
                      const order = ['MCI Name', 'Total VM Count', 'Estimated Cost'];
                      const indexA = order.indexOf(a.label);
                      const indexB = order.indexOf(b.label);
                      
                      if (indexA !== -1 && indexB !== -1) {
                        return indexA - indexB;
                      } else if (indexA !== -1) {
                        return -1;
                      } else if (indexB !== -1) {
                        return 1;
                      } else {
                        return a.label.localeCompare(b.label);
                      }
                    });
                    
                    let html = '';
                    
                    // Display basic info in grid (Message will be shown later)
                    if (basicInfoWithoutMessage.length > 0) {
                      html += `
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 8px;">
                          ${basicInfoWithoutMessage.map(info => `
                            <div style="display: flex; align-items: center; padding: 8px 10px; background: #f8f9fa; border-radius: 4px; border-left: 3px solid #007bff;">
                              <span style="font-weight: 600; color: #333; margin-right: 8px; min-width: 80px; font-size: 0.9em;">${info.label}:</span>
                              <span style="color: #666; font-size: 0.9em;">${info.value || 'N/A'}</span>
                            </div>
                          `).join('')}
                        </div>
                      `;
                    }
                    
                    // Store messageInfo in a global variable to use later
                    window.tempMessageInfo = messageInfo;
                    
                    return html;
                  })()}
                </div>
              </div>
            ` : ''}


            ${(() => {
              // Display Message section after Status Information
              const messageInfo = window.tempMessageInfo;
              if (messageInfo) {
                return `
                  <div style="margin-bottom: 16px;">
                    <div style="margin-top: 8px;">
                      <div style="padding: 10px 12px; background: #f0f8ff; border-radius: 4px; border-left: 3px solid #007bff; border: 1px solid #e3f2fd; width: 100%; box-sizing: border-box;">
                        <div style="color: #333; font-size: 0.9em; line-height: 1.6; background: white; padding: 8px; border-radius: 3px; border: 1px solid #dee2e6; word-wrap: break-word; overflow-wrap: break-word; white-space: normal;">💬 ${messageInfo.value || 'N/A'}</div>
                      </div>
                    </div>
                  </div>
                `;
              }
              return '';
            })()}

            ${structuredInfo.recommendations.length > 0 ? `
              <div style="margin-bottom: 8px;">
                <h6 style="margin: 0 0 8px 0; color: #007bff; font-size: 0.9em; font-weight: 600; border-bottom: 1px solid #ddd; padding-bottom: 4px;">💡 Recommendations</h6>
                <div style="margin-top: 8px;">
                  ${structuredInfo.recommendations.map(rec => {
                    return `
                      <div style="margin: 6px 0; padding: 8px 12px; background: #f8f9fa; border-radius: 4px; border-left: 3px solid #ffc107;">
                        <div style="display: flex; align-items: flex-start;">
                          <span style="margin-right: 8px;">💡</span>
                          <span style="color: #666; font-size: 0.9em; line-height: 1.4;">${rec}</span>
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }

    // Build resource summary HTML
    var resourceSummaryHtml = `
      <div style="margin: 15px 0;">
        <table style="width: 100%; border-collapse: collapse; font-size: 0.9em;">
          <tr style="background-color: #f8f9fa;">
            <th style="border: 1px solid #ddd; padding: 8px; text-align: left; color: #333;">Resource Type</th>
            <th style="border: 1px solid #ddd; padding: 8px; text-align: left; color: #333;">Count/Details</th>
          </tr>
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px; color: #666;">Total VMs</td>
            <td style="border: 1px solid #ddd; padding: 8px; color: #333;"><strong>${resourceSummary.totalResources}</strong></td>
          </tr>
          ${Object.keys(resourceSummary.providerBreakdown).length > 0 ? `
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px; color: #666;">Cloud Providers</td>
            <td style="border: 1px solid #ddd; padding: 8px; color: #333;">
              ${Object.entries(resourceSummary.providerBreakdown).map(([provider, count]) => 
                `<span style="margin-right: 10px;"><strong>${provider}:</strong> ${count}</span>`
              ).join('')}
            </td>
          </tr>` : ''}
          ${Object.keys(resourceSummary.regionBreakdown).length > 0 ? `
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px; color: #666;">Regions</td>
            <td style="border: 1px solid #ddd; padding: 8px; color: #333;">
              ${Object.entries(resourceSummary.regionBreakdown).map(([region, count]) => 
                `<span style="margin-right: 10px;"><strong>${region}:</strong> ${count}</span>`
              ).join('')}
            </td>
          </tr>` : ''}
        </table>
      </div>
    `;

    // Build detailed VM information HTML with enhanced SubGroup validation details
    var vmDetailsHtml = "";
    if (vmDetailsList.length > 0) {
      vmDetailsHtml = vmDetailsList.map(vm => {
        var statusIcon = vm.canCreate ? '✅' : '❌';
        var statusColor = vm.canCreate ? '#28a745' : '#dc3545';
        var bgColor = '#f8f9fa';
        
        // SubGroup-specific display
        var subGroupIndicator = '';
        var vmTitle = '';
        if (vm.isSubGroup) {
          subGroupIndicator = `
            <div style="display: inline-flex; align-items: center; margin-left: 10px; padding: 2px 8px; background: #f0f8ff; border: 1px solid #007bff; border-radius: 12px; font-size: 0.8em; color: #007bff;">
             🖥️ X ${vm.subGroupSize}
            </div>
          `;
          vmTitle = `${vm.name}`;
        } else {
          vmTitle = `${vm.name} (VM #${vm.index})`;
        }
        
        return `
        <div style="margin: 10px 0; padding: 12px; border: 1px solid #ddd; border-radius: 5px; background-color: ${bgColor};">
          <div style="display: flex; align-items: center; margin-bottom: 10px; flex-wrap: wrap;">
            <label style="display: flex; align-items: center; margin-right: 8px; cursor: pointer;">
              <input type="checkbox" class="subgroup-checkbox" data-subgroup-name="${vm.name}" style="margin-right: 6px; transform: scale(1.1);" checked onchange="updateReviewButtonState()">
            </label>
            <span style="font-size: 1em; margin-right: 8px;">${statusIcon}</span>
            <h6 style="margin: 0; color: ${statusColor}; font-size: 1em;">${vmTitle}</h6>
            ${subGroupIndicator}
            ${vm.estimatedCost !== 'Unknown' && vm.estimatedCost !== 'Cost estimation unavailable' ? 
              `<span style="margin-left: auto; padding: 3px 8px; background: #28a745; color: white; border-radius: 14px; font-size: 0.8em;">💰 ${vm.estimatedCost}</span>` : 
              `<span style="margin-left: auto; padding: 3px 8px; background: #ffc107; color: white; border-radius: 14px; font-size: 0.8em;">⚠️ Cost N/A</span>`
            }
          </div>
          
          <div style="margin-bottom: 8px;">
            <div style="margin-bottom: 4px;">
              <strong style="font-size: 0.9em;">Status:</strong> 
              <span style="color: ${statusColor}; font-weight: bold; font-size: 0.9em;">
                ${vm.status}
              </span>
            </div>
            ${vm.message ? `<div style="margin-left: 0; color: #666; font-size: 0.8em; line-height: 1.4; word-wrap: break-word; white-space: normal;">(${vm.message})</div>` : ''}
          </div>
          
          ${vm.isSubGroup ? `
          <div style="margin: 8px 0; padding: 8px; background: #f0f8ff; border-radius: 4px; border-left: 3px solid #007bff;">
            
            ${(() => {
              // Extract Provider and Region from VM info
              var provider = '';
              var region = '';
              if (vm.info && Array.isArray(vm.info)) {
                vm.info.forEach(info => {
                  if (info.includes('Provider:')) provider = info.split(': ')[1] || '';
                  if (info.includes('Region:')) region = info.split(': ')[1] || '';
                });
              }
              
              // Extract spec details from vmConfig if available
              var specDetails = '';
              if (vm.vmConfig) {
                var specs = [];
                
                // Try to find detailed spec info from recommendedSpecList if available
                var detailedSpec = null;
                if (vm.vmConfig.specId && typeof recommendedSpecList !== 'undefined' && Array.isArray(recommendedSpecList)) {
                  detailedSpec = recommendedSpecList.find(spec => 
                    spec.id === vm.vmConfig.specId || 
                    spec.name === vm.vmConfig.specId ||
                    vm.vmConfig.specId.includes(spec.id)
                  );
                }
                
                if (detailedSpec) {
                  // Use detailed spec information from recommendedSpecList
                  if (detailedSpec.vCPU) {
                    specs.push(`💻 <strong>vCPU:</strong> ${detailedSpec.vCPU}`);
                  }
                  if (detailedSpec.memoryGiB) {
                    specs.push(`🧠 <strong>Memory:</strong> ${detailedSpec.memoryGiB} GiB`);
                  }
                  if (detailedSpec.acceleratorType && detailedSpec.acceleratorType !== 'N/A') {
                    var acceleratorInfo = detailedSpec.acceleratorType;
                    if (detailedSpec.acceleratorModel && detailedSpec.acceleratorModel !== 'N/A') {
                      acceleratorInfo += ` (${detailedSpec.acceleratorModel})`;
                    }
                    specs.push(`⚡ <strong>Accelerator:</strong> ${acceleratorInfo}`);
                  }
                } else if (vm.vmConfig.specId) {
                  // Fallback: Try to extract vCPU and memory from spec name if available
                  var specMatch = vm.vmConfig.specId.match(/([0-9]+)vcpu_([0-9.]+)gb/i);
                  if (specMatch) {
                    specs.push(`💻 <strong>vCPU:</strong> ${specMatch[1]}`);
                    specs.push(`🧠 <strong>Memory:</strong> ${specMatch[2]} GB`);
                  } else {
                    // Show spec ID as fallback
                    specs.push(`🖥️ <strong>Spec:</strong> ${vm.vmConfig.specId.split('+').pop() || vm.vmConfig.specId}`);
                  }
                }
                
                // Add RootDisk information if available
                if (vm.vmConfig.rootDiskSize && vm.vmConfig.rootDiskSize !== 'default') {
                  specs.push(`💽 <strong>Root Disk:</strong> ${vm.vmConfig.rootDiskSize} GB`);
                } else {
                  // Show default if explicitly specified
                  specs.push(`💽 <strong>Root Disk:</strong> Default`);
                }
                
                // Add RootDisk type if available
                if (vm.vmConfig.rootDiskType && vm.vmConfig.rootDiskType !== 'default') {
                  specs.push(`📀 <strong>Disk Type:</strong> ${vm.vmConfig.rootDiskType}`);
                }
                
                // Check for accelerator/GPU information from spec name if not found in detailed spec
                if (!detailedSpec && vm.vmConfig.specId && 
                    (vm.vmConfig.specId.toLowerCase().includes('gpu') || 
                     vm.vmConfig.specId.toLowerCase().includes('accelerator'))) {
                  specs.push(`⚡ <strong>Accelerator:</strong> GPU-enabled`);
                }
                
                if (specs.length > 0) {
                  specDetails = `
                    <div style="margin: 8px 0; padding: 8px; background: #f0f8ff; border-radius: 4px; border: 1px solid #b3d9ff;">
                      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 4px; font-size: 0.8em;">
                        ${specs.map(spec => `<div style="color: #004499;">${spec}</div>`).join('')}
                      </div>
                    </div>
                  `;
                }
              }
              
              // Create location info section
              var locationInfo = '';
              if (provider || region) {
                locationInfo = `
                  <div style="margin: 8px 0; padding: 8px; background: #f0f8ff; border-radius: 4px; border: 1px solid #b3d9ff;">
                    <div style="display: flex; gap: 12px; font-size: 0.8em; color: #228b22;">
                      ${provider ? `<div>🏢 <strong>Provider:</strong> ${provider}</div>` : ''}
                      ${region ? `<div>📍 <strong>Region:</strong> ${region}</div>` : ''}
                    </div>
                  </div>
                `;
              }
              
              return locationInfo + specDetails ;
            })()}
          </div>` : ''}
          
          ${vm.validations && (vm.validations.spec || vm.validations.image) ? `
          <div style="margin: 10px 0; padding: 8px; background: #f1f3f4; border-radius: 4px; border-left: 3px solid #007bff;">
            <strong style="color: #495057; font-size: 0.95em;">🔍 Resource Validation</strong>
            ${vm.validations.spec ? `
            <div style="margin: 6px 0; padding: 6px; background: ${vm.validations.spec.isAvailable ? '#e8f5e8' : '#ffe8e8'}; border-radius: 4px;">
              <div style="font-size: 0.9em;"><strong>🖥️ Spec:</strong> ${vm.validations.spec.resourceId || 'N/A'}</div>
              <div style="font-size: 0.8em; color: #666; line-height: 1.4;">
                Status: ${vm.validations.spec.status || 'Unknown'} | 
                Available: ${vm.validations.spec.isAvailable ? 'Yes' : 'No'}
                ${vm.validations.spec.message ? `<div style="margin-top: 4px; word-wrap: break-word; white-space: normal;">📝 ${vm.validations.spec.message}</div>` : ''}
              </div>
            </div>` : ''}
            ${vm.validations.image ? `
            <div style="margin: 6px 0; padding: 6px; background: ${vm.validations.image.isAvailable ? '#e8f5e8' : '#ffe8e8'}; border-radius: 4px;">
              <div style="font-size: 0.9em;"><strong>💿 Image:</strong> ${vm.validations.image.resourceId || 'N/A'}</div>
              <div style="font-size: 0.8em; color: #666; line-height: 1.4;">
                Status: ${vm.validations.image.status || 'Unknown'} | 
                Available: ${vm.validations.image.isAvailable ? 'Yes' : 'No'}
                ${vm.validations.image.message ? `<div style="margin-top: 4px; word-wrap: break-word; white-space: normal;">📝 ${vm.validations.image.message}</div>` : ''}
              </div>
            </div>` : ''}
          </div>` : ''}
          
          ${vm.issues.length > 0 ? `
          <div style="margin: 10px 0; padding: 8px; background: #ffe6e6; border-radius: 4px; border-left: 3px solid #dc3545;">
            <strong style="color: #dc3545; font-size: 0.95em;">⚠️ Issues Found</strong>
            <ul style="margin: 5px 0; padding-left: 20px; color: #dc3545; font-size: 0.85em;">
              ${vm.issues.map(issue => `<li>${issue}</li>`).join('')}
            </ul>
          </div>` : ''}
          
          ${vm.info.length > 0 ? `
          <details style="margin-top: 10px;">
            <summary style="cursor: pointer; font-size: 0.9em; color: #6c757d; font-weight: bold;">📋 View Additional Details</summary>
            <div style="margin: 8px 0; padding: 8px; background: #f8f9fa; border-radius: 4px;">
              <ul style="margin: 0; padding-left: 20px; font-size: 0.85em; color: #6c757d;">
                ${vm.info.filter(info => 
                  !info.includes('Provider:') && 
                  !info.includes('Region:') && 
                  !info.includes('SubGroup Size:') &&
                  !info.includes('Total VMs in SubGroup:')
                ).map(info => `<li style="margin: 2px 0;">${info}</li>`).join('')}
              </ul>
            </div>
          </details>` : ''}
        </div>`;
      }).join('');
    }
    
    // Create enhanced resource summary HTML
    var resourceSummaryHtml = "";
    if (resourceSummary && (resourceSummary.totalProviders || resourceSummary.totalRegions || Object.keys(resourceSummary.providerBreakdown).length > 0)) {
      resourceSummaryHtml = `
        <div style="margin: 12px 0; padding: 12px; border: 1px solid #ddd; border-radius: 5px; background: #f8f9fa;">
          <strong style="color: #333; font-size: 1em;">📊 Resource Summary</strong>
          <div style="margin: 8px 0; font-size: 0.9em; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px;">
            ${resourceSummary.availableSpecs !== undefined ? `<div>✅ Available Specs: <span style="font-weight: bold; color: #28a745;">${resourceSummary.availableSpecs}</span></div>` : ''}
            ${resourceSummary.availableImages !== undefined ? `<div>✅ Available Images: <span style="font-weight: bold; color: #28a745;">${resourceSummary.availableImages}</span></div>` : ''}
            ${resourceSummary.unavailableSpecs !== undefined ? `<div>❌ Unavailable Specs: <span style="font-weight: bold; color: #dc3545;">${resourceSummary.unavailableSpecs}</span></div>` : ''}
            ${resourceSummary.unavailableImages !== undefined ? `<div>❌ Unavailable Images: <span style="font-weight: bold; color: #dc3545;">${resourceSummary.unavailableImages}</span></div>` : ''}
          </div>
          
          ${Object.keys(resourceSummary.providerBreakdown).length > 0 ? `
            <div style="margin: 8px 0;">
              <strong style="font-size: 0.9em; color: #333;">Cloud Provider Distribution:</strong>
              <div style="margin-top: 4px;">
                ${Object.entries(resourceSummary.providerBreakdown).map(([provider, count]) => 
                  `<span style="display: inline-block; margin: 2px 4px; padding: 3px 8px; background: #f0f8ff; border: 1px solid #007bff; border-radius: 12px; font-size: 0.8em; color: #007bff;">${provider}: ${count}</span>`
                ).join('')}
              </div>
            </div>
          ` : ''}
          
          ${Object.keys(resourceSummary.regionBreakdown).length > 0 ? `
            <div style="margin: 8px 0;">
              <strong style="font-size: 0.9em; color: #333;">Region Distribution:</strong>
              <div style="margin-top: 4px;">
                ${Object.entries(resourceSummary.regionBreakdown).map(([region, count]) => 
                  `<span style="display: inline-block; margin: 2px 4px; padding: 3px 8px; background: #f0f8f0; border: 1px solid #28a745; border-radius: 12px; font-size: 0.8em; color: #28a745;">${region}: ${count}</span>`
                ).join('')}
              </div>
            </div>
          ` : ''}
        </div>
      `;
    }

    // Show review results
    Swal.fire({
      title: "MCI Configuration Review Results",
      width: 1000,
      html: `
        ${validationSummaryHtml}
        ${mciInfoHtml}
        <div style="text-align: left;">
          <details>
            <summary style="font-weight: bold; font-size: 1em; margin: 10px 0; cursor: pointer; color: #333;">📋 Configuration Summary</summary>
            <div style="margin-left: 20px;">
              ${resourceSummaryHtml}
            </div>
          </details>
          
          <details>
            <summary style="font-weight: bold; font-size: 1em; margin: 10px 0; cursor: pointer; color: #333;">🖥️ SubGroup Configuration Status</summary>
            <div style="margin-left: 20px;">
              <div style="margin-bottom: 15px; padding: 10px; background: #f8f9fa; border-radius: 5px; border-left: 4px solid #007bff;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                  <strong style="color: #007bff; font-size: 0.95em;">📋 SubGroup Selection</strong>
                  <button id="reviewWithSelectedSubgroups" style="padding: 4px 12px; background: #28a745; color: white; border: none; border-radius: 4px; font-size: 0.8em; cursor: pointer;">
                    🔄 re-validate
                  </button>
                </div>
                <div style="font-size: 0.85em; color: #666; margin-bottom: 8px;">
                  Uncheck SubGroups to exclude them from MCI creation. Click "re-validate" to re-validate your configuration.
                </div>
                <div style="margin: 8px 0;">
                  <label style="display: flex; align-items: center; cursor: pointer; font-size: 0.85em; margin-bottom: 4px;">
                    <input type="checkbox" id="selectAllSubgroups" style="margin-right: 6px;" checked onchange="toggleAllSubgroups()">
                    <span style="color: #333; font-weight: 500;">Select/Deselect All SubGroups</span>
                  </label>
                </div>
              </div>
              ${vmDetailsHtml.length > 0 ? vmDetailsHtml : '<p style="color: #666; font-style: italic; font-size: 0.9em;">No SubGroup details available</p>'}
            </div>
          </details>
          
          <details>
            <summary style="font-weight: bold; font-size: 1em; margin: 10px 0; cursor: pointer; color: #333;">🔍 Raw Review Response</summary>
            <div style="margin-left: 20px;">
              <pre style="background-color: #f8f9fa; padding: 10px; border-radius: 5px; overflow: auto; max-height: 300px; font-size: 0.8em; border: 1px solid #ddd; color: #666;">${JSON.stringify(reviewData, null, 2)}</pre>
            </div>
          </details>
          
          <details>
            <summary style="font-weight: bold; font-size: 1em; margin: 10px 0; cursor: pointer; color: #333;">📋 Current Configuration</summary>
            <div style="margin-left: 20px;">
              <div style="margin-bottom: 15px;">
                <div style="font-size: 0.9em; color: #666; margin-bottom: 8px;">
                  This shows the current MCI request body that will be sent to create the infrastructure.
                </div>
              </div>
              <pre style="background-color: #f8f9fa; padding: 10px; border-radius: 5px; overflow: auto; max-height: 400px; font-size: 0.8em; border: 1px solid #ddd; color: #666;">${JSON.stringify(createMciReq, null, 2)}</pre>
            </div>
          </details>
          
          <div style="margin: 20px 0; padding: 16px; background-color: #f8f9fa; border: 1px solid #ddd; border-radius: 5px;">
            <h6 style="margin: 0 0 12px 0; color: #007bff; font-size: 1em; font-weight: 600; border-bottom: 1px solid #ddd; padding-bottom: 4px;">⚙️ Deployment Options</h6>
            <div style="margin-top: 12px;">
              
              <div style="margin: 8px 0;">
                <label style="display: flex; align-items: center; cursor: not-allowed; font-size: 0.9em; opacity: 0.5;">
                  <input type="checkbox" id="monitoring-checkbox" style="margin-right: 8px; transform: scale(1.2);" disabled>
                  <span style="color: #999; font-weight: 500;">📊 Deploy a monitoring agent (temporarily disabled)</span>
                </label>
                <div style="margin-left: 24px; margin-top: 4px; color: #999; font-size: 0.8em;">
                  Install CB-Dragonfly monitoring agent on all VMs for performance monitoring.
                </div>
              </div>

              <div style="margin: 8px 0;">
                <label style="display: flex; align-items: center; cursor: pointer; font-size: 0.9em;">
                  <input type="checkbox" id="hold-checkbox" style="margin-right: 8px; transform: scale(1.2);">
                  <span style="color: #333; font-weight: 500;">⏸️ Hold VM provisioning of the MCI</span>
                </label>
                <div style="margin-left: 24px; margin-top: 4px; color: #666; font-size: 0.8em;">
                  Create MCI structure without deploying VMs immediately. Use "Continue" action when ready.
                </div>
              </div>

              
              <div style="margin: 8px 0;">
                <label style="display: flex; align-items: center; cursor: pointer; font-size: 0.9em;">
                  <input type="checkbox" id="postcommand-checkbox" style="margin-right: 8px; transform: scale(1.2);">
                  <span style="color: #333; font-weight: 500;">🚀 Add post-deployment commands</span>
                </label>
                <div style="margin-left: 24px; margin-top: 4px; color: #666; font-size: 0.8em;">
                  Execute custom commands on all VMs after successful deployment.
                </div>
              </div>
              
              <div style="margin: 8px 0;">
                <label style="display: flex; align-items: center; cursor: pointer; font-size: 0.9em;">
                  <input type="checkbox" id="buildimage-checkbox" style="margin-right: 8px; transform: scale(1.2);">
                  <span style="color: #333; font-weight: 500;">📦 Build Cloud-Agnostic Custom Image</span>
                </label>
                <div style="margin-left: 24px; margin-top: 4px; color: #666; font-size: 0.8em;">
                  Create custom images from deployed VMs and optionally cleanup infrastructure.
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <script>
          function copyToClipboard(text) {
            try {
              navigator.clipboard.writeText(text);
            } catch (err) {
              // Fallback for older browsers
              const textArea = document.createElement('textarea');
              textArea.value = text;
              document.body.appendChild(textArea);
              textArea.select();
              document.execCommand('copy');
              document.body.removeChild(textArea);
            }
          }
          
          function downloadJson(jsonData, filename) {
            try {
              const jsonString = typeof jsonData === 'string' ? jsonData : JSON.stringify(jsonData, null, 2);
              const blob = new Blob([jsonString], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = filename || 'config.json';
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              URL.revokeObjectURL(url);
            } catch (err) {
              console.error('Failed to download JSON:', err);
              alert('Failed to download JSON file.');
            }
          }
          
        </script>
      `,
      showCancelButton: true,
      confirmButtonText: "Create MCI",
      cancelButtonText: "Cancel",
      confirmButtonColor: validationStatus === "error" ? "#ffc107" : "#28a745",
      scrollbarPadding: false,
      didOpen: () => {
        // Initialize SubGroup management functions
        window.toggleAllSubgroups = function() {
          const selectAllCheckbox = document.getElementById('selectAllSubgroups');
          const subgroupCheckboxes = document.querySelectorAll('.subgroup-checkbox');
          
          subgroupCheckboxes.forEach(checkbox => {
            checkbox.checked = selectAllCheckbox.checked;
          });
          
          updateReviewButtonState();
        };
        
          window.updateReviewButtonState = function() {
          const selectedSubgroups = document.querySelectorAll('.subgroup-checkbox:checked');
          const reviewButton = document.getElementById('reviewWithSelectedSubgroups');
          const selectAllCheckbox = document.getElementById('selectAllSubgroups');
          
          if (reviewButton) {
            if (selectedSubgroups.length === 0) {
              reviewButton.style.background = '#dc3545';
              reviewButton.textContent = '⚠️ No SubGroups Selected';
              reviewButton.disabled = true;
            } else {
              reviewButton.style.background = '#28a745';
              reviewButton.textContent = '🔄 Review Selected (' + selectedSubgroups.length + ')';
              reviewButton.disabled = false;
            }
          }
          
          // Update "Select All" checkbox state
          const allSubgroups = document.querySelectorAll('.subgroup-checkbox');
          if (selectAllCheckbox && allSubgroups.length > 0) {
            selectAllCheckbox.checked = selectedSubgroups.length === allSubgroups.length;
            selectAllCheckbox.indeterminate = selectedSubgroups.length > 0 && selectedSubgroups.length < allSubgroups.length;
          }
        };
        
        // Toggle Build Image options visibility
        window.toggleBuildImageOptions = function() {
          const buildImageCheckbox = document.getElementById('buildimage-checkbox');
          const postCommandCheckbox = document.getElementById('postcommand-checkbox');
          
          if (buildImageCheckbox && buildImageCheckbox.checked) {
            // When build image is enabled, automatically enable post-commands
            if (postCommandCheckbox) {
              postCommandCheckbox.checked = true;
              postCommandCheckbox.disabled = false;
            }
          }
        };
        window.getSelectedSubgroups = function() {
          const selectedCheckboxes = document.querySelectorAll('.subgroup-checkbox:checked');
          return Array.from(selectedCheckboxes).map(cb => cb.getAttribute('data-subgroup-name'));
        };
        
        // Set up event listeners
        const reviewButton = document.getElementById('reviewWithSelectedSubgroups');
        if (reviewButton) {
          reviewButton.addEventListener('click', function() {
            const selectedSubgroups = getSelectedSubgroups();
            if (selectedSubgroups.length === 0) {
              alert('Please select at least one SubGroup to review.');
              return;
            }
            
            // Store selected subgroups and current config for re-review
            window.selectedSubgroupsForReview = selectedSubgroups;
            
            // Close current modal and trigger re-review
            Swal.close();
            
            // Use setTimeout to ensure modal is closed before starting new review
            setTimeout(() => {
              reviewWithSelectedSubgroups(selectedSubgroups);
            }, 100);
          });
        }
        
        // Initialize button state
        updateReviewButtonState();
        
        // Add change listeners to all subgroup checkboxes
        const subgroupCheckboxes = document.querySelectorAll('.subgroup-checkbox');
        subgroupCheckboxes.forEach(checkbox => {
          checkbox.addEventListener('change', updateReviewButtonState);
        });
        
        // Add change listener for build image checkbox
        const buildImageCheckbox = document.getElementById('buildimage-checkbox');
        if (buildImageCheckbox) {
          buildImageCheckbox.addEventListener('change', toggleBuildImageOptions);
        }
      },
      preConfirm: () => {
        if (validationStatus !== "error") {
          return {
            monitoring: document.getElementById('monitoring-checkbox') ? document.getElementById('monitoring-checkbox').checked : false,
            hold: document.getElementById('hold-checkbox') ? document.getElementById('hold-checkbox').checked : false,
            addPostCommand: document.getElementById('postcommand-checkbox') ? document.getElementById('postcommand-checkbox').checked : false,
            buildAgnosticImage: document.getElementById('buildimage-checkbox') ? document.getElementById('buildimage-checkbox').checked : false
          };
        }
        return null;
      }
    }).then((result) => {
      if (result.isConfirmed) {
        if (validationStatus === "error") {
          // Show warning and ask for confirmation to proceed despite errors
          Swal.fire({
            icon: "warning",
            title: "⚠️ Configuration Has Errors",
            html: `
              <p><strong>Your MCI configuration has validation errors.</strong></p>
              <p>Proceeding may result in deployment failures or unexpected behavior.</p>
              <p>Do you want to proceed anyway?</p>
            `,
            showCancelButton: true,
            confirmButtonText: "Yes, Create Anyway",
            cancelButtonText: "Cancel",
            confirmButtonColor: "#dc3545",
            cancelButtonColor: "#6c757d"
          }).then((forceResult) => {
            if (forceResult.isConfirmed) {
              // Force proceed with MCI creation using selected options
              const options = result.value || { monitoring: false, hold: false, addPostCommand: false };
              
              createMciReq.installMonAgent = "no";
              var mciCreationUrl = finalUrl;
              
              if (options.monitoring) {
                createMciReq.installMonAgent = "yes";
              }
              if (options.hold) {
                mciCreationUrl += "?option=hold";
              }
              
              // Handle post-deployment commands for force creation
              if (options.addPostCommand || options.buildAgnosticImage) {
                // Show the same post-command dialog as normal flow (with buildAgnosticImage flag)
                showPostCommandDialog(createMciReq, mciCreationUrl, username, password, options.buildAgnosticImage);
              } else {
                proceedWithMciCreation(createMciReq, mciCreationUrl, username, password);
              }
            }
          });
        } else {
          // Proceed directly to MCI creation with selected options
          const options = result.value || { monitoring: false, hold: false, addPostCommand: false };
          
          createMciReq.installMonAgent = "no";
          var mciCreationUrl = finalUrl;
          
          if (options.monitoring) {
            createMciReq.installMonAgent = "yes";
          }
          if (options.hold) {
            mciCreationUrl += "?option=hold";
          }

          if (options.addPostCommand || options.buildAgnosticImage) {
            // Show post-command dialog (with buildAgnosticImage flag)
            showPostCommandDialog(createMciReq, mciCreationUrl, username, password, options.buildAgnosticImage);
          } else {
            proceedWithMciCreation(createMciReq, mciCreationUrl, username, password);
          }
        }
      }
    });
  })
  .catch(function (error) {
    console.error("Review failed:", error);
    
    var errorMessage = "Unknown error occurred during review";
    if (error.response && error.response.data) {
      errorMessage = error.response.data.message || JSON.stringify(error.response.data);
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    Swal.fire({
      icon: "error",
      title: "Review Failed",
      html: `
        <p>Unable to review MCI configuration:</p>
        <div style="background-color: #f8f9fa; padding: 10px; border-radius: 5px; margin: 10px 0;">
          <code>${errorMessage}</code>
        </div>
        <p>Would you like to proceed without review?</p>
      `,
      showCancelButton: true,
      confirmButtonText: "Proceed Anyway",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#ffc107",
    }).then((result) => {
      if (result.isConfirmed) {
        // Proceed to final confirmation even without review - call the same logic as successful review
        const options = { monitoring: false, hold: false, addPostCommand: false };
        
        createMciReq.installMonAgent = "no";
        
        proceedWithMciCreation(createMciReq, finalUrl, username, password);
      }
    });
  });
}

// Function to review MCI with selected SubGroups only
function reviewWithSelectedSubgroups(selectedSubgroups) {
  // Get current MCI request data
  var hostname = configHostname;
  var port = configPort;
  var username = configUsername;
  var password = configPassword;
  var namespace = namespaceElement.value;
  
  // Get current createMciReq from global vmSubGroupReqeustFromSpecList
  if (vmSubGroupReqeustFromSpecList.length === 0) {
    Swal.fire({
      icon: "error",
      title: "No Configuration Found",
      text: "No MCI configuration found. Please create a new configuration first."
    });
    return;
  }
  
  // Filter VM requests to include only selected SubGroups
  var filteredVmRequests = vmSubGroupReqeustFromSpecList.filter(vmReq => {
    return selectedSubgroups.includes(vmReq.name);
  });
  
  if (filteredVmRequests.length === 0) {
    Swal.fire({
      icon: "warning",
      title: "No SubGroups Selected",
      text: "Please select at least one SubGroup to proceed with the review."
    });
    return;
  }
  
  // Create modified MCI request with filtered VMs
  var modifiedCreateMciReq = JSON.parse(JSON.stringify(createMciReqTmplt));
  var randomString = generateRandomString();
  modifiedCreateMciReq.name = "mc-" + randomString;
  modifiedCreateMciReq.subGroups = filteredVmRequests;
  
  // Calculate costs and details for selected SubGroups
  let totalCost = 0;
  let totalNodeScale = 0;
  let costDetailsHtml = "";
  let subGroupReqString = "";
  
  filteredVmRequests.forEach(vmReq => {
    totalNodeScale += parseInt(vmReq.subGroupSize || 1);
    subGroupReqString += `<b>${vmReq.name}</b> (${vmReq.subGroupSize || 1} VMs)<br>`;
  });
  
  costDetailsHtml = `
    <div style="text-align: left; margin: 10px 0;">
      <strong>Selected SubGroups: ${filteredVmRequests.length}</strong><br>
      <strong>Total VMs: ${totalNodeScale}</strong><br>
      <div style="font-size: 0.9em; color: #666; margin-top: 5px;">
        ${subGroupReqString}
      </div>
    </div>
  `;
  
  var finalUrl = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mciDynamic`;
  
  // Show loading message
  Swal.fire({
    title: "Reviewing Modified Configuration",
    html: `
      <div style="text-align: center;">
        <div style="margin: 20px 0;">
          <div style="display: inline-block; width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #007bff; border-radius: 50%; animation: spin 1s linear infinite;"></div>
        </div>
        <p>Validating configuration with ${filteredVmRequests.length} selected SubGroups...</p>
      </div>
      <style>
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
    `,
    showConfirmButton: false,
    allowOutsideClick: false
  });
  
  // Trigger review with modified configuration
  setTimeout(() => {
    reviewMciConfiguration(modifiedCreateMciReq, hostname, port, username, password, namespace, finalUrl, totalCost, totalNodeScale, costDetailsHtml, subGroupReqString);
  }, 1000);
}

function createMci() {
  if (vmSubGroupReqeustFromSpecList.length != 0) {
    var hostname = configHostname;
    var port = configPort;
    var username = configUsername;
    var password = configPassword;
    var namespace = namespaceElement.value;

    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mciDynamic`;

    var randomString = generateRandomString();

    var createMciReq = createMciReqTmplt;
    createMciReq.name = "mc-" + `${randomString}`;
    createMciReq.subGroups = vmSubGroupReqeustFromSpecList;
    let totalCost = 0;
    let totalNodeScale = 0;

    var subGroupReqString = "";
    for (i = 0; i < createMciReq.subGroups.length; i++) {

      totalNodeScale += parseInt(createMciReq.subGroups[i].subGroupSize);
      let costPerHour = recommendedSpecList[i].costPerHour;
      let subTotalCost = "unknown";
      if (costPerHour == "-1" || costPerHour == "") {
        costPerHour = "unknown";
        costPerHour = "<tr><th style='width: 50%;'>Estimated Price(USD/1H)</th><td><b><span style='color: red; '>$" + subTotalCost + "  ($" + costPerHour + " * " + createMciReq.subGroups[i].subGroupSize + ")" + "</span></b></td></tr>";
      } else {
        totalCost += parseFloat(costPerHour) * createMciReq.subGroups[i].subGroupSize;

        subTotalCost = (parseFloat(costPerHour) * createMciReq.subGroups[i].subGroupSize).toFixed(4);
        costPerHour = "<tr><th style='width: 50%;'>Estimated Price(USD/1H)</th><td><b><span style='color: red; '>$" + subTotalCost + "  ($" + costPerHour + " * " + createMciReq.subGroups[i].subGroupSize + ")" + "</span></b></td></tr>";
      }
      let acceleratorType = recommendedSpecList[i].acceleratorType;
      let acceleratorModel = recommendedSpecList[i].acceleratorModel;
      if (acceleratorType == "gpu") {
        acceleratorType = "<tr><th style='width: 50%;'>Accelerator</th><td><b><span style='color: red; '>GPU (" + acceleratorModel + ")</span></b></td></tr>"
      } else {
        acceleratorType = "<tr><th style='width: 50%;'>Accelerator</th><td><b><span style='color: black;'>none</span></b></td></tr>"
      }

      var html =
        "<font size=3>" +
        "<table style='width:80%; text-align:left; margin-top:20px; margin-left:10px; table-layout: auto;'>" +
        "<tr><th style='width: 50%;'>[#" + (i + 1).toString() + "] SubGroup Name</th><td><b><span style='color: black; '>" + createMciReq.subGroups[i].name + " (" + createMciReq.subGroups[i].subGroupSize + " node(s))</span></b></td></tr>" +
        costPerHour +
        "<tr><th style='width: 50%;'>Spec</th><td><b><span style='color: blue; '>" + createMciReq.subGroups[i].specId + "</span></b></td></tr>" +
        "<tr><th style='width: 50%;'>vCPU</th><td><b>" + recommendedSpecList[i].vCPU + "</b></td></tr>" +
        "<tr><th style='width: 50%;'>Mem(GiB)</th><td><b>" + recommendedSpecList[i].memoryGiB + "</b></td></tr>" +
        acceleratorType +
        "<tr><th style='width: 50%;'>RootDisk(GB)</th><td><b>" + createMciReq.subGroups[i].rootDiskSize + " (type: " + createMciReq.subGroups[i].rootDiskType + ")</b></td></tr>" +
        "<tr><th style='width: 50%;'>Selected Image</th><td><b><span style='color: green; '>" + createMciReq.subGroups[i].imageId + "</span></b></td></tr>" +

        ((createMciReq.subGroups[i].label && Object.keys(createMciReq.subGroups[i].label).length > 0) ?
          "<tr><th style='width: 50%;'>Labels</th><td><b><span style='color: purple; '>" +
          Object.entries(createMciReq.subGroups[i].label).map(([key, value]) =>
            `${key}=${value}`
          ).join(", ") +
          "</span></b></td></tr>" : "") +

        "</table>" +
        "<hr>"
        ;

      subGroupReqString = subGroupReqString + html;
    }

    var costDetailsHtml =
      "<table style='width:80%; text-align:left; margin-top:20px; margin-left:10px; table-layout: auto;'>" +
      "<tr><th><b>Usage Period</b></th><td><b>Estimated Cost</b></td></tr>" +
      "<tr><th>Hourly</th><td><span style='color: red; '><b>$" + totalCost.toFixed(4) + "</span></td></tr>" +
      "<tr><th>Daily</th><td><span style='color: red; '><b>$" + (totalCost * 24).toFixed(4) + "</span></td></tr>" +
      "<tr><th>Monthly</th><td><span style='color: red; '><b>$" + (totalCost * 24 * 31).toFixed(4) + "</span></td></tr>" +
      "</table> <br>(Do not rely on this estimated cost. It is just an estimation using spec price.)<br>";

    // Step 1: MCI Name Input
    Swal.fire({
      title: "Enter the name of the MCI you wish to create",
      input: "text",
      inputAttributes: {
        autocapitalize: "off",
      },
      inputValue: createMciReq.name,
      showCancelButton: true,
      confirmButtonText: "Next: Review Configuration",
    }).then((result) => {
      if (result.value) {
        createMciReq.name = result.value;
        
        // Step 2: Start MCI Review process
        reviewMciConfiguration(createMciReq, hostname, port, username, password, namespace, url, totalCost, totalNodeScale, costDetailsHtml, subGroupReqString);
      }
    });
  } else {
    console.log(
      "To create a MCI, VMs should be configured! Click the Map to add a config for VM request."
    );
    errorAlert("Please configure MCI first\n(Click the Map to add VMs)");
  }
}
window.createMci = createMci;
window.proceedWithBuildAgnosticImage = proceedWithBuildAgnosticImage;

// Function to check if K8s node image designation is needed
async function checkK8sNodeImageDesignation(providerName, hostname, port, username, password) {
  try {
    const url = `http://${hostname}:${port}/tumblebug/checkK8sNodeImageDesignation?providerName=${providerName}`;
    
    const response = await axios.get(url, {
      auth: {
        username: username,
        password: password
      },
      headers: {
        'accept': 'application/json'
      }
    });
    
    // Return true if image designation is needed, false if should use "default"
    return response.data?.result === "true";
  } catch (error) {
    console.warn("Failed to check K8s node image designation:", error);
    // Default to true (use provided imageId) if check fails
    return true;
  }
}

// K8s Cluster creation function
function createK8sCluster() {
  if (vmSubGroupReqeustFromSpecList.length !== 1) {
    errorAlert("Please configure exactly one SubGroup to create K8s Cluster");
    return;
  }

  const subGroup = vmSubGroupReqeustFromSpecList[0];
  const spec = recommendedSpecList[0];
  
  // Generate random names for K8s resources
  const k8sClusterRandomName = "k8s-" + generateRandomString();
  const k8sNodeGroupRandomName = "ng-" + generateRandomString();
  
  const hostname = configHostname;
  const port = configPort;
  const username = configUsername;
  const password = configPassword;
  const namespace = namespaceElement.value;

  // First, get available K8s versions
  const versionUrl = `http://${hostname}:${port}/tumblebug/availableK8sVersion?providerName=${spec.providerName}&regionName=${spec.regionName}`;
  
  const versionTaskId = addSpinnerTask("getK8sVersions");
  
  axios.get(versionUrl, {
    auth: {
      username: username,
      password: password
    }
  }).then(function (versionResponse) {
    removeSpinnerTask(versionTaskId);
    
    const availableVersions = versionResponse.data || [];
    console.log("Available K8s versions:", availableVersions);
    
    // Create version options
    let versionOptions = '<option value="">-- Select K8s Version --</option>';
    if (availableVersions.length > 0) {
      versionOptions += availableVersions.map(version => 
        `<option value="${version.id}">${version.name} (${version.id})</option>`
      ).join('');
    }
    versionOptions += '<option value="custom">-- Custom Version --</option>';

    // Create confirmation dialog with version selection
    Swal.fire({
      title: "Create Kubernetes Cluster",
      html: `
        <div style="text-align: left; padding: 15px;">
          <div style="margin-bottom: 15px;">
            <label style="font-weight: bold;">Cluster Name:</label><br>
            <input type="text" id="k8sClusterName" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" 
                   value="${k8sClusterRandomName}" placeholder="Enter cluster name">
          </div>
          <div style="margin-bottom: 15px;">
            <label style="font-weight: bold;">Node Group Name:</label><br>
            <input type="text" id="k8sNodeGroupName" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" 
                   value="${k8sNodeGroupRandomName}" placeholder="Enter node group name">
          </div>
          <div style="margin-bottom: 15px;">
            <label style="font-weight: bold;">Kubernetes Version:</label><br>
            <select id="k8sVersionSelect" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; margin-bottom: 8px;">
              ${versionOptions}
            </select>
            <input type="text" id="k8sCustomVersion" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; display: none;" 
                   placeholder="Enter custom K8s version (e.g., 1.30.12-gke.1086000)">
            <div style="font-size: 0.8em; color: #666; margin-top: 5px;">
              ${availableVersions.length > 0 ? 'Select from available versions or choose custom to enter manually' : 'No versions available, please enter custom version'}
            </div>
          </div>
          <div style="background: #f8f9fa; padding: 10px; border-radius: 5px; margin-bottom: 15px;">
            <strong>Configuration:</strong><br>
            <small>Provider: ${spec.providerName}</small><br>
            <small>Region: ${spec.regionName}</small><br>
            <small>Spec: ${spec.cspSpecName}</small><br>
            <small>Image: ${subGroup.imageId}</small>
          </div>
          <div style="font-size: 0.9em; color: #666;">
            Note: This will create a new Kubernetes cluster using the configured SubGroup settings.
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "Create K8s Cluster",
      cancelButtonText: "Cancel",
      didOpen: () => {
        // Handle version selection change
        const versionSelect = document.getElementById('k8sVersionSelect');
        const customVersionInput = document.getElementById('k8sCustomVersion');
        
        versionSelect.addEventListener('change', function() {
          if (this.value === 'custom') {
            customVersionInput.style.display = 'block';
            customVersionInput.focus();
          } else {
            customVersionInput.style.display = 'none';
            customVersionInput.value = '';
          }
        });
      },
      preConfirm: () => {
        const clusterName = document.getElementById('k8sClusterName').value.trim();
        const nodeGroupName = document.getElementById('k8sNodeGroupName').value.trim();
        const selectedVersion = document.getElementById('k8sVersionSelect').value;
        const customVersion = document.getElementById('k8sCustomVersion').value.trim();
        
        if (!clusterName) {
          Swal.showValidationMessage('Please enter cluster name');
          return false;
        }
        if (!nodeGroupName) {
          Swal.showValidationMessage('Please enter node group name');
          return false;
        }
        
        let k8sVersion = '';
        if (selectedVersion === 'custom') {
          if (!customVersion) {
            Swal.showValidationMessage('Please enter custom K8s version');
            return false;
          }
          k8sVersion = customVersion;
        } else if (selectedVersion) {
          k8sVersion = selectedVersion;
        }
        // If no version selected, k8sVersion will be empty (default behavior)
        
        return { clusterName, nodeGroupName, k8sVersion };
      }
    }).then((result) => {
      let taskId; // Declare taskId in higher scope for error handling
      
      if (result.isConfirmed) {
        const { clusterName, nodeGroupName, k8sVersion } = result.value;
        
        // Check if image designation is needed
        taskId = addSpinnerTask("Checking image requirements");
        
        checkK8sNodeImageDesignation(spec.providerName, hostname, port, username, password)
          .then(imageDesignationNeeded => {
            removeSpinnerTask(taskId);
            
            // Create K8s cluster request body
            const k8sClusterReq = {
              imageId: imageDesignationNeeded ? (subGroup.imageId || "default") : "default",
              specId: subGroup.specId,
              name: clusterName,
              nodeGroupName: nodeGroupName
            };
            
            // Add version if specified
            if (k8sVersion) {
              k8sClusterReq.version = k8sVersion;
            }

            const url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/k8sClusterDynamic`;
            
            // Debug: uncomment if K8s creation debugging needed
            // console.log("Creating K8s Cluster:", k8sClusterReq);
            // console.log("Image designation needed:", imageDesignationNeeded);
            
            taskId = addSpinnerTask("Create K8s "+k8sClusterReq.name);
            
            axios.post(url, k8sClusterReq, {
          auth: {
            username: username,
            password: password
          },
          headers: {
            'Content-Type': 'application/json'
          }
        }).then(function (response) {
          removeSpinnerTask(taskId);
          // Debug: uncomment if K8s creation response debugging needed
          // console.log("K8s Cluster creation response:", response.data);
          
          Swal.fire({
            title: "K8s Cluster Created Successfully!",
            html: `
              <div style="text-align: left;">
                <p><strong>Cluster ID:</strong> ${response.data?.id || 'Unknown'}</p>
                <p><strong>Status:</strong> ${response.data?.status || 'Unknown'}</p>
                <p><strong>Provider:</strong> ${response.data?.connectionName || 'Unknown'}</p>
                ${k8sVersion ? `<p><strong>Version:</strong> ${k8sVersion}</p>` : ''}
              </div>
            `,
            icon: "success",
            confirmButtonText: "OK"
          });
          
          // K8s cluster created successfully, no additional refresh needed
          
        }).catch(function (error) {
          removeSpinnerTask(taskId);
          console.error("K8s Cluster creation failed:", error);
          
          let errorMessage = "Failed to create K8s Cluster";
          if (error.response && error.response.data) {
            errorMessage += `\n${error.response.data.message || error.response.data.error || ''}`;
          }
          
          errorAlert(errorMessage);
        });
          })
          .catch(function (error) {
            removeSpinnerTask(taskId);
            console.error("Failed to check image designation:", error);
            errorAlert("Failed to check image requirements. Please try again.");
          });
      }
    }).catch(function (error) {
      // Handle any unexpected errors in the Swal dialog
      console.error("K8s Cluster creation dialog error:", error);
      // Clean up spinner if it was started
      if (taskId) {
        removeSpinnerTask(taskId);
      }
    });
    
  }).catch(function (error) {
    removeSpinnerTask(versionTaskId);
    console.error("Failed to get K8s versions:", error);
    
    // Extract error message from server response
    let errorMessage = 'Unknown error occurred';
    if (error.response && error.response.data && error.response.data.message) {
      errorMessage = error.response.data.message;
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    // Show error message and stop execution
    errorAlert(`Failed to get available Kubernetes versions.\n\nError: ${errorMessage}\n\nProvider: ${spec.providerName}\nRegion: ${spec.regionName}`);
    return; // Stop execution
  });
}
window.createK8sCluster = createK8sCluster;

// Add NodeGroup to existing K8s Cluster function
function addNodeGroupToK8sCluster() {
  if (vmSubGroupReqeustFromSpecList.length !== 1) {
    errorAlert("Please configure exactly one SubGroup to add NodeGroup to K8s Cluster");
    return;
  }

  const subGroup = vmSubGroupReqeustFromSpecList[0];
  const spec = recommendedSpecList[0];
  
  // Generate random name for NodeGroup
  const k8sNodeGroupRandomName = "ng-" + generateRandomString();
  
  const hostname = configHostname;
  const port = configPort;
  const username = configUsername;
  const password = configPassword;
  const namespace = namespaceElement.value;

  // First, get list of existing K8s clusters
  const listUrl = `http://${hostname}:${port}/tumblebug/ns/${namespace}/k8sCluster`;
  
  const listTaskId = addSpinnerTask("listK8sClusters");
  
  axios.get(listUrl, {
    auth: {
      username: username,
      password: password
    }
  }).then(function (response) {
    removeSpinnerTask(listTaskId);
    
    // API response can have different structures:
    // 1. Latest API: { cluster: [...] } (according to swagger)
    // 2. Current API: { K8sClusterInfo: [...] } (according to actual response)
    // Handle both cases for compatibility
    const clusters = response.data?.cluster || response.data?.K8sClusterInfo || [];
    
    if (clusters.length === 0) {
      errorAlert("No K8s clusters found. Please create a K8s cluster first.");
      return;
    }
    
    // Create cluster selection dialog - show all clusters but enable only Active ones with matching provider/region
    const subGroupProvider = spec.providerName; // e.g., "gcp"
    const subGroupRegion = spec.regionName; // e.g., "asia-northeast3"
    
    const clusterOptions = clusters.map(cluster => {
      // Use cluster-level status for determining availability
      const clusterStatus = cluster?.status || 'Unknown';
      const isActive = clusterStatus === 'Active';
      
      // Check if provider and region match
      const clusterProvider = cluster?.connectionConfig?.providerName || '';
      const clusterRegion = cluster?.connectionConfig?.regionDetail?.regionId || '';
      
      const providerRegionMatch = (clusterProvider === subGroupProvider && clusterRegion === subGroupRegion);
      
      // Enable only if cluster is Active AND provider/region matches
      const isSelectable = isActive && providerRegionMatch;
      const disabled = !isSelectable ? 'disabled' : '';
      
      // Set colors based on status and compatibility
      let statusColor = '#6c757d'; // Default gray for disabled
      let statusText = clusterStatus;
      
      if (isActive && providerRegionMatch) {
        statusColor = '#28a745'; // Green for selectable
        statusText = `${clusterStatus} ✓`;
      } else if (isActive && !providerRegionMatch) {
        statusColor = '#ffc107'; // Yellow for active but incompatible
        statusText = `${clusterStatus} (Provider/Region mismatch)`;
      }
      
      const clusterId = cluster?.id || '';
      const clusterName = cluster?.name || 'Unknown';
      const connectionName = cluster?.connectionName || 'Unknown';
      
      return `<option value="${clusterId}" ${disabled} style="color: ${statusColor};">
        ${clusterName} (${connectionName}) - ${statusText}
      </option>`;
    }).join('');
    
    // Check if there are any selectable clusters
    const selectableClusters = clusters.filter(cluster => {
      const clusterStatus = cluster?.status || 'Unknown';
      const isActive = clusterStatus === 'Active';
      const clusterProvider = cluster?.connectionConfig?.providerName || '';
      const clusterRegion = cluster?.connectionConfig?.regionDetail?.regionId || '';
      const providerRegionMatch = (clusterProvider === subGroupProvider && clusterRegion === subGroupRegion);
      return isActive && providerRegionMatch;
    });
    
    if (selectableClusters.length === 0) {
      errorAlert(`No compatible K8s clusters found.\n\nRequired:\n- Status: Active\n- Provider: ${subGroupProvider}\n- Region: ${subGroupRegion}\n\nPlease create a compatible K8s cluster first or check existing cluster configurations.`);
      return;
    }
    
    Swal.fire({
      title: "Add NodeGroup to K8s Cluster",
      html: `
        <div style="text-align: left; padding: 15px;">
          <div style="margin-bottom: 15px;">
            <label style="font-weight: bold;">Select K8s Cluster:</label><br>
            <select id="k8sClusterSelect" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
              <option value="">-- Select a cluster --</option>
              ${clusterOptions}
            </select>
            <div style="font-size: 0.8em; color: #666; margin-top: 5px;">
              Note: Only Active clusters with matching Provider (${subGroupProvider}) and Region (${subGroupRegion}) can be selected
            </div>
          </div>
          <div style="margin-bottom: 15px;">
            <label style="font-weight: bold;">Node Group Name:</label><br>
            <input type="text" id="newNodeGroupName" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" 
                   value="${k8sNodeGroupRandomName}" placeholder="Enter node group name">
          </div>
          <div style="background: #f8f9fa; padding: 10px; border-radius: 5px; margin-bottom: 15px;">
            <strong>NodeGroup Configuration:</strong><br>
            <small>Provider: ${spec.providerName}</small><br>
            <small>Region: ${spec.regionName}</small><br>
            <small>Spec: ${spec.cspSpecName}</small><br>
            <small>Image: ${subGroup.imageId}</small>
          </div>
          <div style="font-size: 0.9em; color: #666;">
            Note: This will add a new NodeGroup to the selected active K8s cluster.
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "Add NodeGroup",
      cancelButtonText: "Cancel",
      preConfirm: () => {
        const clusterId = document.getElementById('k8sClusterSelect').value;
        const nodeGroupName = document.getElementById('newNodeGroupName').value.trim();
        
        if (!clusterId) {
          Swal.showValidationMessage('Please select a K8s cluster');
          return false;
        }
        
        // Find selected cluster and check if it's Active
        const selectedCluster = clusters.find(cluster => cluster?.id === clusterId);
        if (!selectedCluster) {
          Swal.showValidationMessage('Selected cluster not found');
          return false;
        }
        
        // Check cluster status - only Active clusters can have NodeGroups added
        const clusterStatus = selectedCluster?.status || 'Unknown';
        if (clusterStatus !== 'Active') {
          Swal.showValidationMessage(`Cluster is not Active (current status: ${clusterStatus}). Please wait for cluster to become Active.`);
          return false;
        }
        
        if (!nodeGroupName) {
          Swal.showValidationMessage('Please enter node group name');
          return false;
        }
        
        return { clusterId, nodeGroupName };
      }
    }).then((result) => {
      let taskId; // Declare taskId in higher scope for error handling
      
      if (result.isConfirmed) {
        const { clusterId, nodeGroupName } = result.value;
        
        // Check if image designation is needed
        taskId = addSpinnerTask("Checking image requirements");
        
        checkK8sNodeImageDesignation(spec.providerName, hostname, port, username, password)
          .then(imageDesignationNeeded => {
            removeSpinnerTask(taskId);
            
            // Create NodeGroup request body
            const nodeGroupReq = {
              imageId: imageDesignationNeeded ? (subGroup.imageId || "default") : "default",
              specId: subGroup.specId,
              name: nodeGroupName
            };

            const url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/k8sCluster/${clusterId}/k8sNodeGroupDynamic`;
            
            console.log("Adding NodeGroup to K8s Cluster:", nodeGroupReq);
            console.log("Image designation needed:", imageDesignationNeeded);

            taskId = addSpinnerTask("Add NodeGroup " + nodeGroupReq.name);

            axios.post(url, nodeGroupReq, {
          auth: {
            username: username,
            password: password
          },
          headers: {
            'Content-Type': 'application/json'
          }
        }).then(function (response) {
          removeSpinnerTask(taskId);
          console.log("NodeGroup addition response:", response.data);
          
          // Safely extract response data with fallbacks
          const clusterId = response.data?.id || 'Unknown';
          const clusterStatus = response.data?.status || 'Unknown';
          
          Swal.fire({
            title: "NodeGroup Added Successfully!",
            html: `
              <div style="text-align: left;">
                <p><strong>Cluster ID:</strong> ${clusterId}</p>
                <p><strong>NodeGroup:</strong> ${nodeGroupName}</p>
                <p><strong>Status:</strong> ${clusterStatus}</p>
              </div>
            `,
            icon: "success",
            confirmButtonText: "OK"
          });
          
          // NodeGroup added successfully, no additional refresh needed
          
        }).catch(function (error) {
          removeSpinnerTask(taskId);
          console.error("NodeGroup addition failed:", error);
          
          let errorMessage = "Failed to add NodeGroup to K8s Cluster";
          if (error.response && error.response.data) {
            errorMessage += `\n${error.response.data.message || error.response.data.error || ''}`;
          }
          
          errorAlert(errorMessage);
        });
          })
          .catch(function (error) {
            removeSpinnerTask(taskId);
            console.error("Failed to check image designation:", error);
            errorAlert("Failed to check image requirements. Please try again.");
          });
      }
    }).catch(function (error) {
      // Handle any unexpected errors in the NodeGroup dialog
      console.error("NodeGroup addition dialog error:", error);
      // Clean up spinner if it was started
      if (taskId) {
        removeSpinnerTask(taskId);
      }
    });
    
  }).catch(function (error) {
    removeSpinnerTask(listTaskId);
    console.error("Failed to get K8s cluster list:", error);
    
    let errorMessage = "Failed to get K8s cluster list";
    if (error.response && error.response.data) {
      errorMessage += `\n${error.response.data.message || error.response.data.error || ''}`;
    }
    
    errorAlert(errorMessage);
  });
}
window.addNodeGroupToK8sCluster = addNodeGroupToK8sCluster;

// Function to set Kubernetes-appropriate configuration values
function setKubernetesConfig() {
  // Set recommended Kubernetes values
  document.getElementById("minVCPU").value = "4";
  document.getElementById("minRAM").value = "16";
  document.getElementById("diskSize").value = "100";
  
  // Get selected providers for display
  var selectedProviders = getSelectedProviders();
  var allCheckbox = document.getElementById("provider-all");
  var providerInfo = "";
  
  if (allCheckbox && allCheckbox.checked) {
    providerInfo = "All Providers";
  } else if (selectedProviders.length > 0) {
    providerInfo = selectedProviders.map(p => p.toUpperCase()).join(", ");
  } else {
    providerInfo = "No Providers Selected";
  }
  
  // Show comprehensive Kubernetes information
  Swal.fire({
    title: "⚙️ Kubernetes Configuration Guide",
    html: `
      <div style="text-align: left; font-size: 13px; line-height: 1.4;">
        <div style="background: #fff3cd; padding: 8px; border-radius: 4px; margin-bottom: 12px; border-left: 4px solid #ffc107;">
          <strong>⚠️ Notice:</strong> Managed Kubernetes Provisioning is under development and may have stability issues.
        </div>
        
        <div style="background: #d1ecf1; padding: 8px; border-radius: 4px; margin-bottom: 12px; border-left: 4px solid #17a2b8;">
          <strong>✅ Configuration Set:</strong> Min vCPU: 4, Min Memory: 16GB, Disk: 100GB<br>
          <strong>🏢 Selected Providers:</strong> ${providerInfo}
        </div>
        
        
        <div style="margin-bottom: 12px;">
          <strong style="color: #28a745;">Node Group created with cluster:</strong><br>
          🟦 Azure, 🟩 GCP, 🟫 IBM, 🟧 NHN
        </div>
        
        <div style="margin-bottom: 15px;">
          <strong style="color: #dc3545;">Node Group added separately after cluster creation:</strong><br>
          🟫 AWS, 🟨 Alibaba, 🟥 Tencent
        </div>

        <details style="margin-bottom: 10px;">
          <summary style="cursor: pointer; font-weight: bold; color: #495057; margin-bottom: 8px;">
            📖 CSP-specific Details & Examples
          </summary>
          <div style="margin-left: 15px; margin-top: 8px; font-size: 12px;">
            
            <div style="margin-bottom: 12px;">
              <strong>🟫 AWS</strong><br>
              • Prerequisites: awscli + <code>aws configure</code><br>
              • Cluster creates without NodeGroup, add separately after status becomes <code>Active</code><br>
              • Example: <code>{"imageId": "default", "specId": "aws+ap-northeast-2+t3a.xlarge"}</code>
            </div>

            <div style="margin-bottom: 12px;">
              <strong>🟨 Alibaba Cloud</strong><br>
              • Use Kubernetes-optimized images<br>
              • Example: <code>{"imageId": "aliyun_3_x64_20G_container_optimized_*.vhd", "specId": "alibaba+ap-northeast-2+ecs.g6e.xlarge"}</code>
            </div>

            <div style="margin-bottom: 12px;">
              <strong>🟦 Azure</strong><br>
              • NodeGroup name must follow <code>^[a-z][a-z0-9]*$</code> regex<br>
              • Example: <code>{"imageId": "default", "specId": "azure+koreacentral+standard_b4ms"}</code>
            </div>

            <div style="margin-bottom: 12px;">
              <strong>🟩 GCP</strong><br>
              • Prerequisites: <code>gcloud</code> CLI + <code>google-cloud-sdk-gke-gcloud-auth-plugin</code><br>
              • Run <code>gcloud auth login</code> first<br>
              • Example: <code>{"imageId": "default", "specId": "gcp+asia-east1+e2-standard-4"}</code>
            </div>

            <div style="margin-bottom: 12px;">
              <strong>🟧 NHN Cloud</strong><br>
              • Use Container-optimized images<br>
              • Example: <code>{"imageId": "efe7f58f-*", "specId": "nhn+kr1+m2.c4m8"}</code>
            </div>

            <div style="margin-bottom: 12px;">
              <strong>🟥 Tencent Cloud</strong><br>
              • ap-hongkong region has kubeconfig access limitations<br>
              • NodeGroup creation enables kubeconfig usage<br>
              • Example: <code>{"imageId": "img-22trbn9x", "specId": "tencent+ap-seoul+s5.medium4"}</code>
            </div>
          </div>
        </details>
      </div>
    `,
    icon: "info",
    confirmButtonText: "OK",
    confirmButtonColor: "#007bff",
    width: "700px"
  });
}
window.setKubernetesConfig = setKubernetesConfig;

// Workload type management - store previous configurations
let workloadConfigurations = {
  vmInfra: {
    minVCPU: "1",
    minRAM: "0.5",
    diskSize: "",
    isActive: true
  },
  k8sInfra: {
    minVCPU: "4",
    minRAM: "16",
    diskSize: "100",
    isActive: false
  }
};

// Store K8s cluster information
let k8sClusterInfo = null;

// Global variable to track current workload type
let currentWorkloadType = 'vm'; // default to VM

// Helper function to check current workload type
function getCurrentWorkloadType() {
  // First try to get from radio buttons
  const vmModeInput = document.getElementById("vmMode");
  const k8sModeInput = document.getElementById("k8sMode");
  
  // Debug: uncomment if workload type debugging needed
  // console.log('getCurrentWorkloadType() called');
  // console.log('vmModeInput:', vmModeInput);
  // console.log('k8sModeInput:', k8sModeInput);
  // console.log('vmModeInput.checked:', vmModeInput?.checked);
  // console.log('k8sModeInput.checked:', k8sModeInput?.checked);
  
  if (k8sModeInput && k8sModeInput.checked) {
    console.log('Returning k8s from radio button');
    currentWorkloadType = 'k8s';
    return 'k8s';
  } else if (vmModeInput && vmModeInput.checked) {
    console.log('Returning vm from radio button');
    currentWorkloadType = 'vm';
    return 'vm';
  }
  
  // Fallback to global variable
  console.log('Returning from global variable:', currentWorkloadType);
  return currentWorkloadType;
}
window.getCurrentWorkloadType = getCurrentWorkloadType;

// Function to fetch K8s cluster information
async function fetchK8sClusterInfo() {
  const hostname = configHostname;
  const port = configPort;
  const username = configUsername;
  const password = configPassword;
  
  const url = `http://${hostname}:${port}/tumblebug/k8sClusterInfo`;
  const auth = btoa(`${username}:${password}`);
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Basic ${auth}`
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      k8sClusterInfo = data;
      return data;
    } else {
      console.error('Failed to fetch K8s cluster info:', response.status);
      return null;
    }
  } catch (error) {
    console.error('Error fetching K8s cluster info:', error);
    return null;
  }
}

// Function to update provider selection based on K8s availability
function updateProvidersForK8s(k8sInfo) {
  if (!k8sInfo || !k8sInfo.k8s_cluster) {
    return;
  }
  
  // Get available K8s providers
  const availableProviders = Object.keys(k8sInfo.k8s_cluster);
  
  // Uncheck ALL first
  const allCheckbox = document.getElementById("provider-all");
  if (allCheckbox) {
    allCheckbox.checked = false;
  }
  
  // Uncheck all individual providers first
  const allProviderCheckboxes = document.querySelectorAll('#provider-checkboxes input[type="checkbox"]');
  allProviderCheckboxes.forEach(cb => cb.checked = false);
  
  // Check only available K8s providers
  availableProviders.forEach(provider => {
    const checkbox = document.getElementById(`provider-${provider}`);
    if (checkbox) {
      checkbox.checked = true;
    }
  });
  
  // Update dropdown text
  updateProviderDropdownText();
}

// Function to toggle between MC-Infra (VM) and K8s-Infra
async function toggleWorkloadType() {
  const vmModeInput = document.getElementById("vmMode");
  const k8sModeInput = document.getElementById("k8sMode");
  const isK8sMode = k8sModeInput && k8sModeInput.checked;
  
  // Update global workload type
  currentWorkloadType = isK8sMode ? 'k8s' : 'vm';
  console.log('toggleWorkloadType: currentWorkloadType set to', currentWorkloadType);
  
  // Save current configuration before switching
  if (isK8sMode) {
    // Switching from VM to K8s - save VM config
    workloadConfigurations.vmInfra.minVCPU = document.getElementById("minVCPU").value || "1";
    workloadConfigurations.vmInfra.minRAM = document.getElementById("minRAM").value || "0.5";
    workloadConfigurations.vmInfra.diskSize = document.getElementById("diskSize").value || "";
    
    // Store current VM provider selection
    workloadConfigurations.vmInfra.selectedProviders = getSelectedProviders();
    workloadConfigurations.vmInfra.allSelected = document.getElementById("provider-all")?.checked || false;
    
    // Apply K8s configuration
    document.getElementById("minVCPU").value = workloadConfigurations.k8sInfra.minVCPU;
    document.getElementById("minRAM").value = workloadConfigurations.k8sInfra.minRAM;
    document.getElementById("diskSize").value = workloadConfigurations.k8sInfra.diskSize;
    
    // Fetch K8s cluster info and update providers
    const k8sInfo = await fetchK8sClusterInfo();
    if (k8sInfo) {
      updateProvidersForK8s(k8sInfo);
    }
    
    // Show K8s configuration info with dynamic data
    showK8sConfigurationInfo(k8sInfo);
    
    // Update active state
    workloadConfigurations.vmInfra.isActive = false;
    workloadConfigurations.k8sInfra.isActive = true;
    
  } else {
    // Switching from K8s to VM - save K8s config
    workloadConfigurations.k8sInfra.minVCPU = document.getElementById("minVCPU").value || "4";
    workloadConfigurations.k8sInfra.minRAM = document.getElementById("minRAM").value || "16";
    workloadConfigurations.k8sInfra.diskSize = document.getElementById("diskSize").value || "100";
    
    // Apply VM configuration (restore previous or defaults)
    document.getElementById("minVCPU").value = workloadConfigurations.vmInfra.minVCPU;
    document.getElementById("minRAM").value = workloadConfigurations.vmInfra.minRAM;
    document.getElementById("diskSize").value = workloadConfigurations.vmInfra.diskSize;
    
    // Restore VM provider selection
    if (workloadConfigurations.vmInfra.allSelected) {
      const allCheckbox = document.getElementById("provider-all");
      if (allCheckbox) {
        allCheckbox.checked = true;
        // Uncheck individual providers
        const providerCheckboxes = document.querySelectorAll('#provider-checkboxes input[type="checkbox"]');
        providerCheckboxes.forEach(cb => cb.checked = false);
      }
    } else {
      // Uncheck ALL first
      const allCheckbox = document.getElementById("provider-all");
      if (allCheckbox) {
        allCheckbox.checked = false;
      }
      
      // Restore individual provider selections
      const allProviderCheckboxes = document.querySelectorAll('#provider-checkboxes input[type="checkbox"]');
      allProviderCheckboxes.forEach(cb => cb.checked = false);
      
      if (workloadConfigurations.vmInfra.selectedProviders) {
        workloadConfigurations.vmInfra.selectedProviders.forEach(provider => {
          const checkbox = document.getElementById(`provider-${provider}`);
          if (checkbox) {
            checkbox.checked = true;
          }
        });
      }
    }
    
    // Update dropdown text
    updateProviderDropdownText();
    
    // Update active state
    workloadConfigurations.vmInfra.isActive = true;
    workloadConfigurations.k8sInfra.isActive = false;
    
    // No alert needed for VM mode as requested
  }
  
  console.log('Workload Type Changed:', isK8sMode ? 'K8s-Infra' : 'MC-Infra (VM)');
  console.log('Current Configuration:', workloadConfigurations);
}
window.toggleWorkloadType = toggleWorkloadType;

// Function to show K8s configuration information with dynamic data
function showK8sConfigurationInfo(k8sInfo = null) {
  // Get selected providers for display
  var selectedProviders = getSelectedProviders();
  var allCheckbox = document.getElementById("provider-all");
  var providerInfo = "";
  
  if (allCheckbox && allCheckbox.checked) {
    providerInfo = "All Providers";
  } else if (selectedProviders.length > 0) {
    providerInfo = selectedProviders.map(p => p.toUpperCase()).join(", ");
  } else {
    providerInfo = "No Providers Selected";
  }
  
  // Generate dynamic provider-specific information
  let providerDetailsHtml = "";
  let nodeGroupCreationInfo = "";
  let nodeGroupSeparateInfo = "";
  
  if (k8sInfo && k8sInfo.k8s_cluster) {
    const providers = k8sInfo.k8s_cluster;
    
    // Separate providers by nodegroups_on_creation
    const withNodeGroups = [];
    const withoutNodeGroups = [];
    
    Object.keys(providers).forEach(provider => {
      const info = providers[provider];
      if (info.nodegroups_on_creation) {
        withNodeGroups.push(provider.toUpperCase());
      } else {
        withoutNodeGroups.push(provider.toUpperCase());
      }
    });
    
    nodeGroupCreationInfo = withNodeGroups.length > 0 ? 
      `🟢 ${withNodeGroups.join(", ")}` : "None";
    nodeGroupSeparateInfo = withoutNodeGroups.length > 0 ? 
      `🔴 ${withoutNodeGroups.join(", ")}` : "None";
    
    // Generate provider details
    Object.keys(providers).forEach(provider => {
      const info = providers[provider];
      const providerUpper = provider.toUpperCase();
      
      providerDetailsHtml += `
        <div style="margin-bottom: 12px;">
          <strong>${providerUpper}</strong><br>
          • NodeGroups on Creation: ${info.nodegroups_on_creation ? '✅ Yes' : '❌ No'}<br>
          • Node Image Designation: ${info.node_image_designation ? '✅ Required' : '❌ Not Required'}<br>
          • Required Subnet Count: ${info.required_subnet_count}<br>
          ${info.nodegroup_naming_rule ? `• NodeGroup Naming Rule: <code>${info.nodegroup_naming_rule}</code><br>` : ''}
        </div>
      `;
    });
  } else {
    nodeGroupCreationInfo = "Unable to fetch current data";
    nodeGroupSeparateInfo = "Unable to fetch current data";
    providerDetailsHtml = "<div>Unable to fetch provider-specific information</div>";
  }
  
  // Show comprehensive Kubernetes information
  Swal.fire({
    title: "⚙️ K8s-Infra Mode Activated",
    html: `
      <div style="text-align: left; font-size: 13px; line-height: 1.4;">
        <div style="background: #fff3cd; padding: 8px; border-radius: 4px; margin-bottom: 12px; border-left: 4px solid #ffc107;">
          <strong>⚠️ Notice:</strong> Managed Kubernetes Provisioning is under development and may have stability issues.
        </div>
        
        <div style="background: #d1ecf1; padding: 8px; border-radius: 4px; margin-bottom: 12px; border-left: 4px solid #17a2b8;">
          <strong>✅ Configuration Applied:</strong> Min vCPU: 4, Min Memory: 16GB, Disk: 100GB<br>
          <strong>🏢 Available K8s Providers:</strong> ${providerInfo}
        </div>
        
        <div style="margin-bottom: 12px;">
          <strong style="color: #28a745;">Node Group created with cluster:</strong><br>
          ${nodeGroupCreationInfo}
        </div>
        
        <div style="margin-bottom: 15px;">
          <strong style="color: #dc3545;">Node Group added separately after cluster creation:</strong><br>
          ${nodeGroupSeparateInfo}
        </div>

        <details style="margin-bottom: 10px;">
          <summary style="cursor: pointer; font-weight: bold; color: #495057; margin-bottom: 8px;">
            📖 Provider-specific Details
          </summary>
          <div style="margin-left: 15px; margin-top: 8px; font-size: 12px;">
            ${providerDetailsHtml}
          </div>
        </details>

        <details style="margin-bottom: 10px;">
          <summary style="cursor: pointer; font-weight: bold; color: #495057; margin-bottom: 8px;">
            📄 Raw K8s Cluster Info (JSON)
          </summary>
          <div style="margin-left: 15px; margin-top: 8px;">
            <pre style="background: #f8f9fa; padding: 10px; border-radius: 4px; font-size: 10px; max-height: 300px; overflow-y: auto; text-align: left;">${k8sInfo ? JSON.stringify(k8sInfo, null, 2) : 'Unable to fetch data'}</pre>
          </div>
        </details>
      </div>
    `,
    icon: "info",
    confirmButtonText: "OK",
    confirmButtonColor: "#007bff",
    width: "700px"
  });
}

// Function to get current workload type
// Function to get workload configuration
function getWorkloadConfiguration() {
  return {
    currentType: getCurrentWorkloadType(),
    configurations: workloadConfigurations
  };
}
window.getWorkloadConfiguration = getWorkloadConfiguration;

function getRecommendedSpec(idx, latitude, longitude) {
  var hostname = configHostname;
  var port = configPort;
  var username = configUsername;
  var password = configPassword;

  var minVCPU = document.getElementById("minVCPU").value;
  var maxVCPU = document.getElementById("maxVCPU").value;
  var minRAM = document.getElementById("minRAM").value;
  var maxRAM = document.getElementById("maxRAM").value;
  var specName = document.getElementById("specName").value;
  var architecture = document.getElementById("architecture").value;
  var selectedProviders = getSelectedProviders();
  var acceleratorModel = document.getElementById("acceleratorModel").value;
  var minAcceleratorCount = document.getElementById("minAcceleratorCount").value;
  var maxAcceleratorCount = document.getElementById("maxAcceleratorCount").value;
  var minAMEM = document.getElementById("minAMEM").value;
  var maxAMEM = document.getElementById("maxAMEM").value;

  var url = `http://${hostname}:${port}/tumblebug/recommendSpec`;

  function createPolicyConditions(metric, values, type) {
    const conditions = [];

    if (type === 'range') {
      if (values.min) conditions.push({ operand: `${values.min}`, operator: ">=" });
      if (values.max) conditions.push({ operand: `${values.max}`, operator: "<=" });
    } else if (type === 'single') {
      if (values.value) conditions.push({ operand: `${values.value}` });
    }

    return { metric: metric, condition: conditions };
  }

  // Handle GPU-related conditions
  var gpuPolicies = [];
  if (acceleratorModel === "any") {
    // For "Any GPU", add acceleratorType as "gpu" but exclude AcceleratorModel
    gpuPolicies.push(createPolicyConditions("AcceleratorType", { value: "gpu" }, "single"));
  } else if (acceleratorModel && acceleratorModel !== "") {
    // For specific GPU models, add AcceleratorModel condition
    gpuPolicies.push(createPolicyConditions("AcceleratorModel", { value: acceleratorModel }, "single"));
  }

  // Handle provider conditions - support multiple providers with comma-separated values
  var providerPolicies = [];
  if (selectedProviders && selectedProviders.length > 0) {
    // Check if ALL is selected or if no specific providers are selected
    var isAllSelected = selectedProviders.includes("ALL") || selectedProviders.length === 0;
    
    if (!isAllSelected) {
      // Create a single condition with comma-separated provider names
      var providerString = selectedProviders.join(",");
      providerPolicies.push(createPolicyConditions("ProviderName", { value: providerString }, "single"));
      console.log("Provider filter applied:", providerString);
    } else {
      console.log("No provider filter applied (ALL selected or none specified)");
    }
  }
  // If no providers selected or ALL is selected, don't add provider conditions (means all providers)

  var policies = [
    createPolicyConditions("vCPU", { min: minVCPU, max: maxVCPU }, "range"),
    createPolicyConditions("MemoryGiB", { min: minRAM, max: maxRAM }, "range"),
    createPolicyConditions("CspSpecName", { value: specName }, "single"),
    ...providerPolicies, // Spread the provider policies array (now supports comma-separated values)
    createPolicyConditions("Architecture", { value: architecture }, "single"), // Architecture can also support comma-separated values
    ...gpuPolicies,
    createPolicyConditions("AcceleratorMemoryGB", { min: minAMEM, max: maxAMEM }, "range"),
    createPolicyConditions("AcceleratorCount", { min: minAcceleratorCount, max: maxAcceleratorCount }, "range"),
  ];

  var recommendationPolicy = recommendPolicy.value;
  var priorities = {
    "location": {
      metric: "location",
      parameter: [{ key: "coordinateClose", val: [`${latitude}/${longitude}`] }],
      weight: "1.0"
    },
    "cost": {
      metric: "cost",
      weight: "1.0"
    },
    "performance": {
      metric: "performance",
      weight: "1.0"
    },
    "random": {
      metric: "random",
      weight: "1.0"
    }
  };

  var struct = {
    filter: { policy: policies },
    limit: "200",
    priority: { policy: [priorities[recommendationPolicy]] }
  };

  var jsonBody = JSON.stringify(struct);
  console.log("Request body for mciDynamicCheckRequest:", jsonBody);

  // // Show loading popup while API is processing
  // Swal.fire({
  //   title: 'Recommending Specification list',
  //   text: 'Please wait for a moment...',
  //   allowOutsideClick: false,
  //   allowEscapeKey: false,
  //   showConfirmButton: false,
  //   didOpen: () => {
  //     Swal.showLoading();
  //   }
  // });

  axios({
    method: "post",
    url: url,
    headers: { "Content-Type": "application/json" },
    data: jsonBody,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
  }).then((res) => {
    // Close loading popup
    Swal.close();
    console.log(res); // for debug
    handleAxiosResponse(res);

    if (res.data == null || res.data.length == 0) {
      errorAlert("No recommended spec found with the given condition");
      return;
    }

    // Spec selection popup
    Swal.fire({
      title: "Select a Spec from the Recommendation List",
      width: 900,

      // Spec selection popup HTML part with row selection instead of buttons
      html: `
  <div class="compact-datatable">
    <div class="table-responsive">
      <table id="specSelectionTable" class="display nowrap" style="width:100%">
        <thead>
          <tr>
            <th>#</th>
            <th>CSP</th>
            <th>Region</th>
            <th>SpecName</th>
            <th>Arch</th>
            <th>vCPU</th>
            <th>Mem(Gi)</th>
            <th>Cost($/h)</th>
            <th>Accelerator</th>
          </tr>
        </thead>
        <tbody>
          ${res.data.map((spec, index) => {
        let costPerHour = spec.costPerHour === "-1" || spec.costPerHour === ""
          ? "unknown"
          : `$${spec.costPerHour}`;


        let acceleratorInfo;
        if (spec.acceleratorModel && spec.acceleratorModel !== "undefined" && spec.acceleratorModel !== "") {
          acceleratorInfo = `<span style="color:red;font-weight:bold">${spec.acceleratorModel} (C:${spec.acceleratorCount} ${spec.acceleratorMemoryGB})</span>`;
        } else {
          acceleratorInfo = "None";
        }

        return `
              <tr id="spec-row-${index}" class="${index === 0 ? 'selected-spec' : ''}" data-index="${index}">
                <td class="text-left">${index + 1}</td>
                <td class="text-left">${spec.providerName.toUpperCase()}</td>
                <td class="text-left">${spec.regionName}</td>
                <td class="text-left">${spec.cspSpecName}</td>
                <td>${spec.architecture}</td>
                <td>${spec.vCPU}</td>
                <td>${spec.memoryGiB}</td>
                <td>${costPerHour}</td>
                <td class="text-left">${acceleratorInfo}</td>
              </tr>
            `;
      }).join('')}
        </tbody>
      </table>
    </div>
    <div id="specDetailsContainer" style="margin-top:15px;padding:8px;border:1px solid #ddd;border-radius:5px;height:280px;overflow-y:auto;display:flex;flex-direction:column;">
      <h5 style="font-size: 0.85rem;margin-bottom:5px;flex-shrink:0;">Selected Spec Details</h5>
      <div id="specDetailsContent" style="flex:1;overflow-y:auto;"></div>
    </div>
    <input type="hidden" id="selectedSpecIndex" value="0">
  </div>
  <style>
    /* Apply compact styling to all DataTable elements */
    .compact-datatable {
      font-size: 0.8rem;
    }
    
    /* Stronger highlight for selected row */
    .selected-spec {
      background-color: rgba(40, 167, 69, 0.35) !important;
      border-left: 5px solid rgb(40, 167, 69) !important;
      font-weight: bold;
    }
    table.dataTable tbody tr.selected-spec {
      background-color: rgba(40, 167, 69, 0.35) !important;
      border-left: 5px solid rgb(40, 167, 69) !important;
    }
    
    /* Make rows clickable */
    #specSelectionTable tbody tr {
      cursor: pointer;
    }
    #specSelectionTable tbody tr:hover {
      background-color: rgba(0, 123, 255, 0.08) !important;
    }
    
    /* Reduce spacing in details section */
    #specDetailsContent .row p {
      margin-bottom: 0.2rem;
    }
  </style>
`,
      didOpen: () => {
        // Set up row click event for the table
        $('#specSelectionTable tbody').on('click', 'tr', function () {
          const index = $(this).data('index');
          selectSpecRow(index);
        });

        // Spec selection function
        window.selectSpecRow = function (index) {
          // Reset previous selection
          document.querySelectorAll('#specSelectionTable tbody tr').forEach(row => {
            row.classList.remove('selected-spec');
          });

          // Select new row
          const selectedRow = document.getElementById(`spec-row-${index}`);
          if (selectedRow) {
            selectedRow.classList.add('selected-spec');
          }

          // Save selected index and update details
          document.getElementById('selectedSpecIndex').value = index;
          updateSpecDetails(index);
        };

        // Update spec details function
        function updateSpecDetails(index) {
          const spec = res.data[index];
          let costPerHour = spec.costPerHour === "-1" || spec.costPerHour === "" ? "unknown" : `$${spec.costPerHour}`;

          // Basic spec information - styled to match image details
          const specInfoHTML = `
            <div style="margin:0; padding:0; text-align: left;">
              <div style="margin-bottom:3px; text-align: left;">
                <strong>CSP:</strong> ${spec.providerName.toUpperCase()}
              </div>
              <div style="margin-bottom:3px; text-align: left;">
                <strong>Region:</strong> ${spec.regionName}
              </div>
              <div style="margin-bottom:3px; text-align: left;">
                <strong>Spec Name:</strong> ${spec.cspSpecName}
              </div>
              <div style="margin-bottom:3px; text-align: left;">
                <strong>Architecture:</strong> ${spec.architecture}
              </div>
              <div style="margin-bottom:3px; text-align: left;">
                <strong>vCPU:</strong> ${spec.vCPU}
              </div>
              <div style="margin-bottom:3px; text-align: left;">
                <strong>Memory:</strong> ${spec.memoryGiB} GiB
              </div>
              <div style="margin-bottom:3px; text-align: left;">
                <strong>Cost:</strong> <span style="color: ${costPerHour === 'unknown' ? 'orange' : 'green'};">${costPerHour}/hour</span>
              </div>
              ${spec.acceleratorType === "gpu" ? `
                <div style="margin-bottom:3px; text-align: left;">
                  <strong>Accelerator:</strong> <span style="color: red; font-weight: bold;">✓ GPU (${spec.acceleratorModel})</span>
                </div>
                <div style="margin-bottom:3px; text-align: left;">
                  <strong>GPU Count:</strong> ${spec.acceleratorCount}
                </div>
                <div style="margin-bottom:3px; text-align: left;">
                  <strong>GPU Memory:</strong> ${spec.acceleratorMemoryGB} GB
                </div>
              ` : `
                <div style="margin-bottom:3px; text-align: left;">
                  <strong>Accelerator:</strong> <span style="color: gray;">None</span>
                </div>
              `}
            </div>
          `;

          // Details table - styled to match image details
          let detailsTableHTML = "";
          if (spec.details && Array.isArray(spec.details) && spec.details.length > 0) {
            detailsTableHTML = `
              <div style="margin-top: 8px; text-align: left;">
                <table style="width:100%; border-collapse: collapse; font-size: 0.75rem; text-align: left;">
                  <thead>
                    <tr>
                      <th style="width: 35%; padding: 3px; border: 1px solid #ddd; background: #f8f9fa; text-align: left;">Property</th>
                      <th style="padding: 3px; border: 1px solid #ddd; background: #f8f9fa; text-align: left;">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${spec.details.map(item =>
                      `<tr>
                        <td style="padding: 3px; border: 1px solid #ddd; text-align: left;"><strong>${item.key}</strong></td>
                        <td style="padding: 3px; border: 1px solid #ddd; word-wrap: break-word; text-align: left;">${item.value}</td>
                      </tr>`
                    ).join('')}
                  </tbody>
                </table>
              </div>
            `;
          }

          const detailsHTML = specInfoHTML + detailsTableHTML;

          document.getElementById('specDetailsContent').innerHTML = detailsHTML;
        }

        // Initialize DataTable
        $('#specSelectionTable').DataTable({
          "paging": true,
          "searching": true,
          "ordering": true,
          "info": true,
          "responsive": true,
          "scrollX": true,
          "pageLength": 5,
          "lengthMenu": [5, 10, 25, 50],
          "order": [[0, 'asc']],
          "columnDefs": [
            {
              "targets": -1,
              "orderable": false
            }
          ],
          "language": {
            "search": "Filtering Keyword:",
            "lengthMenu": "Show _MENU_ entries",
            "info": "_START_ - _END_ of _TOTAL_",
            "infoEmpty": "No data available",
            "paginate": {
              "first": "First",
              "last": "Last",
              "next": "Next",
              "previous": "Previous"
            }
          }
        });

        // Initialize spec details
        updateSpecDetails(0);
      },
      showCancelButton: true,
      confirmButtonText: "Continue",
      cancelButtonText: "Cancel",
      preConfirm: () => {
        return parseInt(document.getElementById('selectedSpecIndex').value);
      }
    }).then((result) => {
      if (result.isConfirmed) {
        // User selected a spec and confirmed
        var selectedSpec = res.data[result.value];
        console.log("User selected spec:", selectedSpec);

        // Search for images based on the selected spec
        const searchImageURL = `http://${hostname}:${port}/tumblebug/ns/system/resources/searchImage`;
        const searchImageBody = {
          matchedSpecId: selectedSpec.id,
          osType: document.getElementById("osImage").value,
        };

        console.log("Searching images for selected spec:", selectedSpec.id);

        // Get namespace for custom image API call
        var namespace = namespaceElement.value;

        // Search images API call and custom images API call in parallel
        Promise.all([
          // Regular images search
          axios({
            method: "post",
            url: searchImageURL,
            headers: { "Content-Type": "application/json" },
            data: JSON.stringify(searchImageBody),
            auth: {
              username: `${username}`,
              password: `${password}`,
            },
          }),
          // Custom images fetch
          axios({
            method: "get",
            url: `http://${hostname}:${port}/tumblebug/ns/${namespace}/resources/customImage`,
            headers: { "Content-Type": "application/json" },
            auth: {
              username: `${username}`,
              password: `${password}`,
            },
          }).catch(err => {
            console.log("Failed to fetch custom images (will continue with regular images only):", err);
            return { data: { customImage: [] } }; // Return empty array if custom images API fails
          })
        ]).then(([searchRes, customImageRes]) => {
          console.log("searchImage response:", searchRes.data);
          console.log("customImage response:", customImageRes.data);

          let availableImages = [];
          let customImages = [];
          
          // Process regular images
          if (searchRes.data && searchRes.data.imageList && searchRes.data.imageList.length > 0) {
            availableImages = searchRes.data.imageList.map(img => ({
              id: img.id || "unknown",
              cspImageName: img.cspImageName || "unknown",
              osType: img.osType || "unknown",
              osDistribution: img.osDistribution || "unknown",
              osArchitecture: img.osArchitecture || "unknown",
              creationDate: img.creationDate || "unknown",
              description: img.description || "No description",
              imageStatus: img.imageStatus || "unknown",
              osPlatform: img.osPlatform || "unknown",
              osDiskType: img.osDiskType || "unknown",
              osDiskSizeGB: img.osDiskSizeGB || "unknown",
              providerName: img.providerName || "unknown",
              connectionName: img.connectionName || "unknown",
              infraType: img.infraType || "unknown",
              isGPUImage: img.isGPUImage || false,
              isKubernetesImage: img.isKubernetesImage || false,
              isBasicImage: img.isBasicImage || false,
              isCustomImage: false,
              details: img.details || []
            }));

            console.log("Available regular images for this spec:");
            console.table(availableImages);
          }

          // Process custom images - filter by matching provider and region
          if (customImageRes.data && customImageRes.data.customImage && customImageRes.data.customImage.length > 0) {
            const selectedProvider = selectedSpec.providerName;
            const selectedRegion = selectedSpec.regionName;
            
            customImages = customImageRes.data.customImage
              .filter(img => {
                // Match provider
                const imgProvider = img.providerName || '';
                if (imgProvider !== selectedProvider) return false;
                
                // Match region (regionList is an array)
                const imgRegions = Array.isArray(img.regionList) ? img.regionList : [img.regionList];
                if (!imgRegions.includes(selectedRegion)) return false;
                
                return true;
              })
              .map(img => ({
                id: img.id || "unknown",
                cspImageName: img.cspImageName || img.name || "unknown",
                osType: img.osType || img.guestOS || "unknown",
                osDistribution: img.osDistribution || img.description || "Custom Image",
                osArchitecture: img.osArchitecture || "unknown",
                creationDate: img.creationDate || "unknown",
                description: img.description || "Custom Image",
                imageStatus: img.imageStatus || img.status || "unknown",
                osPlatform: img.osPlatform || "unknown",
                osDiskType: img.osDiskType || "unknown",
                osDiskSizeGB: img.osDiskSizeGB || "unknown",
                providerName: img.providerName || "unknown",
                connectionName: img.connectionName || "unknown",
                infraType: img.infraType || "unknown",
                isGPUImage: false,
                isKubernetesImage: false,
                isBasicImage: false,
                isCustomImage: true, // Mark as custom image
                details: img.details || []
              }));

            console.log("Available custom images for this spec:");
            console.table(customImages);
          }

          // Merge custom images at the top, then regular images
          availableImages = [...customImages, ...availableImages];

          if (availableImages.length === 0) {
            errorAlert("No images found for the selected specification");
            return;
          }

          // Image selection popup
          Swal.fire({
            title: "Select an Image from the Image Search List",
            width: 1200,
            html: `
              <div class="compact-datatable">
                <div class="table-responsive">
                  <table id="imageSelectionTable" class="display nowrap" style="width:100%">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>OS Type</th>
                        <th>Image Name</th>
                        <th>Distribution</th>
                        <th>Support</th>
                        <th>Arch</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${availableImages.map((image, index) => {
                        // Simple T/F display for GPU and Kubernetes support
                        const gpuSupport = image.isGPUImage ? 'T' : 'F';
                        const k8sSupport = image.isKubernetesImage ? 'T' : 'F';
                        
                        // Add special styling for custom images and basic images
                        const isCustomClass = image.isCustomImage ? 'custom-image-row' : '';
                        const isBasicClass = image.isBasicImage ? 'basic-image-row' : '';
                        const customIcon = image.isCustomImage ? ' <span class="custom-image-icon" title="Custom Image (Snapshot)">📸</span>' : '';
                        const basicIcon = image.isBasicImage ? ' <span class="basic-image-icon" title="Basic OS Image">⭐</span>' : '';
                        const mlIcon = image.isGPUImage ? ' <span class="ml-image-icon" title="GPU Support">🧮</span>' : '';
                        const k8sIcon = image.isKubernetesImage ? ' <span class="k8s-image-icon" title="Kubernetes Support">☸️</span>' : '';
                        
                        // Truncate long text for better table layout - increased limits for more space
                        const truncateText = (text, maxLength) => {
                          if (text.length <= maxLength) return text;
                          return text.substring(0, maxLength) + '..';
                        };
                        
                        const truncatedImageName = truncateText(image.cspImageName, 70);
                        const truncatedDistribution = truncateText(image.osDistribution, 70);
                        
                        return `
                          <tr id="image-row-${index}" class="${index === 0 ? 'selected-image' : ''} ${isCustomClass} ${isBasicClass}" data-index="${index}">
                            <td class="text-left">${index + 1}${customIcon}${basicIcon}</td>
                            <td class="text-left">${image.osType}</td>
                            <td class="text-left" style="font-size: 0.85em; color: #0066cc;" title="${image.cspImageName}">${truncatedImageName}</td>
                            <td class="text-left" style="font-size: 0.9em;" title="${image.osDistribution}">${truncatedDistribution}</td>
                            <td class="text-center">${mlIcon}${k8sIcon}</td>
                            <td class="text-center">${image.osArchitecture}</td>
                          </tr>
                        `;
                      }).join('')}
                    </tbody>
                  </table>
                </div>
                <div id="imageDetailsContainer" style="margin-top:15px;padding:8px;border:1px solid #ddd;border-radius:5px;height:280px;overflow-y:auto;display:flex;flex-direction:column;">
                  <h5 style="font-size: 0.85rem;margin-bottom:5px;flex-shrink:0;">Selected Image Details</h5>
                  <div id="imageDetailsContent" style="flex:1;overflow-y:auto;"></div>
                </div>
                <input type="hidden" id="selectedImageIndex" value="0">
              </div>
              <style>
                /* Apply compact styling to all DataTable elements */
                .compact-datatable {
                  font-size: 0.8rem;
                }
                
                /* Fix table layout for consistent column widths */
                #imageSelectionTable {
                  table-layout: fixed !important;
                  width: 100% !important;
                }
                
                /* Set specific column widths */
                #imageSelectionTable th:nth-child(1),  /* # */
                #imageSelectionTable td:nth-child(1) {
                  width: 8%;
                }
                
                #imageSelectionTable th:nth-child(2),  /* OS Type */
                #imageSelectionTable td:nth-child(2) {
                  width: 12%;
                }
                
                #imageSelectionTable th:nth-child(3),  /* Image Name */
                #imageSelectionTable td:nth-child(3) {
                  width: 35% !important;
                  max-width: 35% !important;
                  min-width: 35% !important;
                }
                
                #imageSelectionTable th:nth-child(4),  /* OS Distribution */
                #imageSelectionTable td:nth-child(4) {
                  width: 35% !important;
                  max-width: 35% !important;
                  min-width: 35% !important;
                }
                
                #imageSelectionTable th:nth-child(5),  /* Support */
                #imageSelectionTable td:nth-child(5) {
                  width: 10%;
                }
                
                #imageSelectionTable th:nth-child(6),  /* Architecture */
                #imageSelectionTable td:nth-child(6) {
                  width: 10%;
                }
                
                #imageSelectionTable th,
                #imageSelectionTable td {
                  overflow: hidden;
                  text-overflow: ellipsis;
                  white-space: nowrap;
                }
                
                /* Allow text wrapping only for specific columns that need it */
                #imageSelectionTable td:nth-child(3),  /* Image Name */
                #imageSelectionTable td:nth-child(4) { /* OS Distribution */
                  white-space: normal;
                  word-wrap: break-word;
                  word-break: break-all;
                }
                
                /* Stronger highlight for selected row */
                .selected-image {
                  background-color: rgba(40, 167, 69, 0.35) !important;
                  border-left: 5px solid rgb(40, 167, 69) !important;
                  font-weight: bold;
                }
                table.dataTable tbody tr.selected-image {
                  background-color: rgba(40, 167, 69, 0.35) !important;
                  border-left: 5px solid rgb(40, 167, 69) !important;
                }
                
                /* Make rows clickable */
                #imageSelectionTable tbody tr {
                  cursor: pointer;
                }
                #imageSelectionTable tbody tr:hover {
                  background-color: rgba(0, 123, 255, 0.08) !important;
                }
                
                /* Basic Image row styling */
                .basic-image-row {
                  background-color: rgba(255, 193, 7, 0.1) !important;
                  border-left: 3px solid #ffc107 !important;
                }
                .basic-image-row:hover {
                  background-color: rgba(255, 193, 7, 0.15) !important;
                }
                
                /* Custom Image row styling */
                .custom-image-row {
                  background-color: rgba(138, 43, 226, 0.1) !important;
                  border-left: 3px solid #8a2be2 !important;
                }
                .custom-image-row:hover {
                  background-color: rgba(138, 43, 226, 0.15) !important;
                }
                
                /* Custom Image icon */
                .custom-image-icon {
                  color: #8a2be2;
                  font-size: 1.1em;
                  margin-left: 5px;
                  text-shadow: 0 0 3px rgba(138, 43, 226, 0.5);
                }
                
                /* Basic Image icon */
                .basic-image-icon {
                  color: #ffc107;
                  font-size: 1.1em;
                  margin-left: 5px;
                  text-shadow: 0 0 3px rgba(255, 193, 7, 0.5);
                }
                
                /* ML Image icon */
                .ml-image-icon {
                  color: #e74c3c;
                  font-size: 1.1em;
                  margin-left: 3px;
                  text-shadow: 0 0 3px rgba(231, 76, 60, 0.5);
                }
                
                /* K8s Image icon */
                .k8s-image-icon {
                  color: #3498db;
                  font-size: 1.1em;
                  margin-left: 3px;
                  text-shadow: 0 0 3px rgba(52, 152, 219, 0.5);
                }
                
                /* Reduce spacing in details section */
                #imageDetailsContent {
                  line-height: 1.2;
                }
                #imageDetailsContent .row {
                  margin: 0;
                }
                #imageDetailsContent p {
                  margin: 2px 0;
                }
                
                /* Details table styling */
                .image-details-table {
                  font-size: 0.75rem;
                  max-height: 200px;
                  overflow-y: auto;
                }
                .image-details-table td {
                  padding: 0.25rem 0.5rem;
                  border: 1px solid #dee2e6;
                }
                .image-details-table th {
                  padding: 0.25rem 0.5rem;
                  background-color: #f8f9fa;
                  border: 1px solid #dee2e6;
                  font-weight: bold;
                }
              </style>
            `,
            didOpen: () => {
              // Set up row click event for the table
              $('#imageSelectionTable tbody').on('click', 'tr', function () {
                const index = $(this).data('index');
                selectImageRow(index);
              });

              // Image selection function
              window.selectImageRow = function (index) {
                // Reset previous selection
                document.querySelectorAll('#imageSelectionTable tbody tr').forEach(row => {
                  row.classList.remove('selected-image');
                });

                // Select new row
                const selectedRow = document.getElementById(`image-row-${index}`);
                if (selectedRow) {
                  selectedRow.classList.add('selected-image');
                }

                // Save selected index and update details
                document.getElementById('selectedImageIndex').value = index;
                updateImageDetails(index);
              };

              // Update image details function
              function updateImageDetails(index) {
                const image = availableImages[index];
                
                // Combined image information - simplified layout
                const imageInfoHTML = `
                  <div style="margin:0; padding:0; text-align: left;">
                    <div style="margin-bottom:3px; text-align: left;">
                      <strong>Name:</strong> ${image.cspImageName}
                    </div>
                    <div style="margin-bottom:3px; text-align: left;">
                      <strong>Distribution:</strong> ${image.osDistribution}
                    </div>
                    <div style="margin-bottom:3px; text-align: left;">
                      <strong>Description:</strong> ${image.description}
                    </div>
                    <div style="margin-bottom:3px; text-align: left;">
                      <strong>Status:</strong> <span style="color: ${image.imageStatus === 'Available' || image.imageStatus === 'available' ? 'green' : 'orange'};">${image.imageStatus}</span>
                    </div>
                    ${image.isKubernetesImage ? `<div style="margin-bottom:3px; text-align: left;"><strong>K8s Support:</strong> <span style="color: blue; font-weight: bold;">✓ Yes</span></div>` : ''}
                    ${image.isGPUImage ? `<div style="margin-bottom:3px; text-align: left;"><strong>GPU Support:</strong> <span style="color: red; font-weight: bold;">✓ Yes</span></div>` : ''}
                    ${image.isBasicImage ? `<div style="margin-bottom:3px; text-align: left;"><strong>Basic Image:</strong> <span style="color: green; font-weight: bold;">✓ Yes</span></div>` : ''}
                  </div>
                `;

                // Details table - simplified
                let detailsTableHTML = "";
                if (image.details && Array.isArray(image.details) && image.details.length > 0) {
                  detailsTableHTML = `
                    <div style="margin-top: 8px; text-align: left;">
                      <table style="width:100%; border-collapse: collapse; font-size: 0.75rem; text-align: left;">
                        <thead>
                          <tr>
                            <th style="width: 35%; padding: 3px; border: 1px solid #ddd; background: #f8f9fa; text-align: left;">Property</th>
                            <th style="padding: 3px; border: 1px solid #ddd; background: #f8f9fa; text-align: left;">Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${image.details.map(item =>
                            `<tr>
                              <td style="padding: 3px; border: 1px solid #ddd; text-align: left;"><strong>${item.key}</strong></td>
                              <td style="padding: 3px; border: 1px solid #ddd; word-wrap: break-word; text-align: left;">${item.value}</td>
                            </tr>`
                          ).join('')}
                        </tbody>
                      </table>
                    </div>
                  `;
                }

                const detailsHTML = imageInfoHTML + detailsTableHTML;

                document.getElementById('imageDetailsContent').innerHTML = detailsHTML;
              }

              // Initialize DataTable
              $('#imageSelectionTable').DataTable({
                "paging": true,
                "searching": true,
                "ordering": true,
                "info": true,
                "responsive": true,
                "scrollX": true,
                "pageLength": 5,
                "lengthMenu": [5, 10, 25, 50],
                "order": [[0, 'asc']],
                "columnDefs": [
                  {
                    "targets": 0,
                    "type": "num"
                  },
                  {
                    "targets": -1,
                    "orderable": false
                  },
                  {
                    "targets": -2,
                    "orderable": false
                  }
                ],
                "language": {
                  "search": "Filtering Keyword:",
                  "lengthMenu": "Show _MENU_ entries",
                  "info": "_START_ - _END_ of _TOTAL_",
                  "infoEmpty": "No data available",
                  "paginate": {
                    "first": "First",
                    "last": "Last",
                    "next": "Next",
                    "previous": "Previous"
                  }
                }
              });

              // Initialize image details
              updateImageDetails(0);
            },
            showCancelButton: true,
            confirmButtonText: "Continue",
            cancelButtonText: "Cancel",
            preConfirm: () => {
              return parseInt(document.getElementById('selectedImageIndex').value);
            }
          }).then((imageResult) => {
            if (imageResult.isConfirmed) {
              // User selected an image and confirmed
              var selectedImage = availableImages[imageResult.value];
              console.log("User selected image:", selectedImage);

              // Now proceed to the final spec confirmation step
              addRegionMarker(selectedSpec.id);

              var createMciReqVm = $.extend({}, createMciReqVmTmplt);
              var recommendedSpec = selectedSpec;

              createMciReqVm.name = "g" + (vmSubGroupReqeustFromSpecList.length + 1).toString();

              var osImage = document.getElementById("osImage");
              var diskSize = document.getElementById("diskSize");

              createMciReqVm.specId = selectedSpec.id;
              createMciReqVm.imageId = selectedImage.cspImageName; // Use selected image instead of osImage.value
              createMciReqVm.rootDiskType = selectedSpec.rootDiskType;

              var diskSizeInput = diskSize.value;
              if (isNaN(diskSizeInput) || diskSizeInput == "") {
                diskSizeInput = "default";
              }
              createMciReqVm.rootDiskSize = diskSizeInput;
              if (diskSizeInput == "default" && selectedSpec.rootDiskSize != "default" && selectedSpec.rootDiskSize != "-1" && selectedSpec.rootDiskSize != "0") {
                //createMciReqVm.rootDiskSize = selectedSpec.rootDiskSize
                // keep "default". selectedSpec.rootDiskSize does not work correctly yet
                createMciReqVm.rootDiskSize = diskSizeInput; 
                // need to validate requested disk size >= default disk size given by vm spec
              }

              // Create a visually appealing image display for the final confirmation
              const truncateImageText = (text, maxLength) => {
                if (text.length <= maxLength) return text;
                return text.substring(0, maxLength) + '..';
              };

              const truncatedDistribution = truncateImageText(selectedImage.osDistribution, 60);
              const truncatedImageName = truncateImageText(selectedImage.cspImageName, 40);

              let imageSelectHTML = `
                <div style="padding: 10px; border: 1px solid #ddd; border-radius: 6px; background-color: #f8f9fa; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
                  <div style="margin-bottom: 8px;">
                    <div style="font-size: 0.8em; color: #6c757d; line-height: 1.4;">
                      <div style="margin-bottom: 3px;" title="(${selectedImage.cspImageName})">
                        <code style="background-color: #e9ecef; padding: 2px 4px; border-radius: 3px; font-size: 0.75em;">${truncatedImageName}</code>
                      </div>
                    </div>
                    <div style="font-size: 0.9em; font-weight: bold; color: #28a745; margin-bottom: 4px;" title="${selectedImage.osDistribution}">
                    ${truncatedDistribution}
                    </div>
                  </div>
                </div>
              `;

              let costPerHour = selectedSpec.costPerHour;
          if (costPerHour == "-1" || costPerHour == "") {
            costPerHour = "unknown";
          }
          let acceleratorType = selectedSpec.acceleratorType;
          let acceleratorModel = selectedSpec.acceleratorModel;
          if (acceleratorType == "gpu") {
            acceleratorType = "<tr><th style='width: 50%;'>AcceleratorType</th><td><b><span style='color: red; font-size: larger;'>GPU</span></b></td></tr>"
            acceleratorModel = "<tr><th style='width: 50%;'>AcceleratorModel</th><td><b><span style='color: red; font-size: larger;'>" + acceleratorModel + "</span></b></td></tr>"
          } else {
            acceleratorType = "<tr><th style='width: 50%;'>AcceleratorType</th><td><b><span style='color: black;'>None</span></b></td></tr>"
            acceleratorModel = "<tr><th style='width: 50%;'>AcceleratorModel</th><td><b><span style='color: black;'>" + acceleratorModel + "</span></b></td></tr>"
          }

          Swal.fire({
            title: "Recommended Spec and CSP region <br>",
            width: 800,
            html:
              "<font size=3>" +
              "<table style='width:80%; text-align:left; margin-top:20px; margin-left:10px; table-layout: auto;'>" +
              "<tr><th style='width: 50%;'>Recommended Spec</th><td><b><span style='color: black; font-size: larger;'>" + selectedSpec.cspSpecName + "</span></b></td></tr>" +
              "<tr><th style='width: 50%;'>Estimated Price(USD/1H)</th><td><b><span style='color: red; font-size: larger;'> $ " + costPerHour + " (at least)</span></b></td></tr>" +
              "<tr><th style='width: 50%;'>Image</th><td>" + imageSelectHTML + "</td></tr>" +

              "<tr><th style='width: 50%;'>------</th><td><b>" + "" + "</b></td></tr>" +
              "<tr><th style='width: 50%;'>Provider</th><td><b><span style='color: blue; font-size: larger;'>" + selectedSpec.providerName.toUpperCase() + "</span></b></td></tr>" +
              "<tr><th style='width: 50%;'>Region</th><td><b>" + selectedSpec.regionName + "</b></td></tr>" +
              "<tr><th style='width: 50%;'>ConnectionConfig</th><td><b>" + selectedSpec.connectionName + "</b></td></tr>" +

              "<tr><th style='width: 50%;'>------</th><td><b>" + "" + "</b></td></tr>" +
              "<tr><th style='width: 50%;'>vCPU</th><td><b>" + selectedSpec.vCPU + "</b></td></tr>" +
              "<tr><th style='width: 50%;'>Mem(GiB)</th><td><b>" + selectedSpec.memoryGiB + "</b></td></tr>" +
              "<tr><th style='width: 50%;'>RootDiskType</th><td><b>" + selectedSpec.rootDiskType + "</b></td></tr>" +

              "<tr><th style='width: 50%;'>RootDiskSize(GB)</th><td>" +
              "<span style='font-size: 0.9em; color: #666; display: block; margin-bottom: 5px;'>Enter disk size in GB or 'default'</span>" +
              "<input type='text' id='rootDiskSizeCustom' style='width:100%; padding: 5px; border: 1px solid #ccc; border-radius: 4px;' value='" + createMciReqVm.rootDiskSize + "'>" +
              "</td></tr>" +

              "<tr><th style='width: 50%;'>------</th><td><b>" + "" + "</b></td></tr>" +
              acceleratorModel +
              "<tr><th style='width: 50%;'>AcceleratorCount</th><td><b>" + selectedSpec.acceleratorCount + "</b></td></tr>" +
              "<tr><th style='width: 50%;'>AcceleratorMemoryGB</th><td><b>" + selectedSpec.acceleratorMemoryGB + "</b></td></tr>" +

              // Label input field
              "<tr><th style='width: 50%;'>------</th><td><b>" + "" + "</b></td></tr>" +
              "<tr><th style='width: 50%;'>User Labels</th><td>" +
              "<span style='font-size: 0.9em; color: #666; display: block; margin-bottom: 5px;'>Enter in key=value, separated by commas</span>" +
              "<input type='text' id='vmLabels' style='width:100%; padding: 5px; border: 1px solid #ccc; border-radius: 4px;' placeholder='role=worker,env=prod,tier=frontend'>" +
              "</td></tr>" +

              // vm count input field
              "<tr><th style='width: 50%;'>------</th><td><b>" + "" + "</b></td></tr>" +
              "<tr><th style='width: 50%;'>SubGroup Scale</th><td>" +
              "<span style='font-size: 0.9em; color: #666; display: block; margin-bottom: 5px;'>Enter the number of VMs for scaling (1 ~ 1000)</span>" +
              "<input type='number' id='vmCount' style='width:100%; padding: 5px; border: 1px solid #ccc; border-radius: 4px;' min='1' max='10' value='1'>" +
              "</td></tr>" +
              "</table><br>",

            didOpen: () => {
              // Focus on the VM count input for better user experience
              const vmCountInput = document.getElementById('vmCount');
              if (vmCountInput) {
                vmCountInput.focus();
              }

              // Add input validation feedback for VM count
              if (vmCountInput) {
                vmCountInput.addEventListener('input', function() {
                  const value = parseInt(this.value, 10);
                  const isValid = !isNaN(value) && value >= 1 && value <= 1000;
                  
                  if (isValid) {
                    this.style.borderColor = '#28a745';
                    this.style.backgroundColor = '#f8fff9';
                  } else {
                    this.style.borderColor = '#dc3545';
                    this.style.backgroundColor = '#fff5f5';
                  }
                });
              }

              // Add input validation feedback for root disk size
              const rootDiskInput = document.getElementById('rootDiskSizeCustom');
              if (rootDiskInput) {
                rootDiskInput.addEventListener('input', function() {
                  const value = this.value.trim();
                  const isValid = value === 'default' || value === '' || /^\d+$/.test(value);
                  
                  if (isValid) {
                    this.style.borderColor = '#28a745';
                    this.style.backgroundColor = '#f8fff9';
                  } else {
                    this.style.borderColor = '#dc3545';
                    this.style.backgroundColor = '#fff5f5';
                  }
                });
              }

              // Add input validation feedback for labels
              const labelsInput = document.getElementById('vmLabels');
              if (labelsInput) {
                labelsInput.addEventListener('input', function() {
                  const value = this.value.trim();
                  // Basic validation for key=value,key=value format
                  const isValid = value === '' || /^[a-zA-Z0-9_-]+=.+?(,[a-zA-Z0-9_-]+=.+?)*$/.test(value);
                  
                  if (isValid) {
                    this.style.borderColor = '#28a745';
                    this.style.backgroundColor = '#f8fff9';
                  } else {
                    this.style.borderColor = '#ffc107';
                    this.style.backgroundColor = '#fffef5';
                  }
                });
              }
            },

            inputAttributes: {
              autocapitalize: "off",
            },
            showCancelButton: true,
            confirmButtonText: "Confirm",
            //showLoaderOnConfirm: true,
            position: "top-end",
            //back(disabled section)ground color
            backdrop: `rgba(0, 0, 0, 0.08)`,
            preConfirm: () => {
              // vmCount input validation
              const vmCountInput = document.getElementById('vmCount');
              let vmCount = parseInt(vmCountInput.value, 10);
              if (isNaN(vmCount) || vmCount < 1 || vmCount > 100) {
                Swal.showValidationMessage('Enter a valid number between 1 and 100');
                return false;
              }

              // rootDiskSize input validation
              const rootDiskSizeInput = document.getElementById('rootDiskSizeCustom');
              let rootDiskSizeValue = rootDiskSizeInput.value.trim();
              if (rootDiskSizeValue === "-1") {
                rootDiskSizeValue = "";
              }
              if (rootDiskSizeValue !== "default" && rootDiskSizeValue !== "") {
                if (!/^\d+$/.test(rootDiskSizeValue)) {
                  Swal.showValidationMessage('Disk size must be "default", empty, or a number');
                  return false;
                }
              }

              const osImageSelect = document.getElementById('osImageSelect');
              if (osImageSelect && osImageSelect.value) {
                console.log(osImageSelect.value);
                createMciReqVm.imageId = osImageSelect.value;
              }
              if (!createMciReqVm.imageId) {
                Swal.showValidationMessage('Select an OS image');
                return false;
              }

              return vmCount;
            },


          }).then((result) => {
            // result.value is false if result.isDenied or another key such as result.isDismissed
            if (result.value) {

              createMciReqVm.subGroupSize = String(result.value);
              if (
                isNaN(parseFloat(createMciReqVm.subGroupSize)) ||
                parseFloat(createMciReqVm.subGroupSize) <= 0
              ) {
                createMciReqVm.subGroupSize = "1";
              }

              const rootDiskSizeInput = document.getElementById('rootDiskSizeCustom').value.trim();
              if (rootDiskSizeInput) {
                console.log(rootDiskSizeInput);
                createMciReqVm.rootDiskSize = rootDiskSizeInput;
              } else {
                createMciReqVm.rootDiskSize = "default";
              }

              const vmLabelsInput = document.getElementById('vmLabels').value.trim();
              if (vmLabelsInput) {

                const labels = {};
                vmLabelsInput.split(',').forEach(pair => {
                  const [key, value] = pair.trim().split('=');
                  if (key && value) {
                    labels[key] = value;
                  }
                });

                if (Object.keys(labels).length > 0) {
                  createMciReqVm.label = labels;
                }
              }


              console.log(
                `${createMciReqVm.specId}` +
                `\t(${createMciReqVm.subGroupSize})`
              );
              vmSubGroupReqeustFromSpecList.push(createMciReqVm);
              recommendedSpecList.push(recommendedSpec);
              
              // Update SubGroup review panel
              updateSubGroupReview();
              
              // Activate provision-tab after successful configuration
              try {
                // Remove active class from all tabs
                document.querySelectorAll('.nav-link').forEach(tab => {
                  tab.classList.remove('active');
                });
                document.querySelectorAll('.tab-pane').forEach(pane => {
                  pane.classList.remove('show', 'active');
                });
                
                // Activate provision-tab
                const provisionTab = document.getElementById('provision-tab');
                const provisionPane = document.getElementById('provision');
                
                if (provisionTab && provisionPane) {
                  provisionTab.classList.add('active');
                  provisionPane.classList.add('show', 'active');
                  
                  // Trigger Bootstrap tab shown event if needed
                  if (typeof $ !== 'undefined' && $.fn.tab) {
                    $(provisionTab).tab('show');
                  }
                }
              } catch (error) {
                console.log('Failed to activate provision tab:', error);
              }
            } else {
              console.log("VM configuration failed for this location");
              latLonInputPairIdx--;
              cspPointsCircle.pop();
              if (cspPointsCircle.length > 0) {
                geoCspPointsCircle[0] = new MultiPoint(cspPointsCircle);
              } else {
                geoCspPointsCircle = [];
              }
            }
          });
            } else {
              // User canceled image selection
              console.log("Image selection canceled");
              latLonInputPairIdx--;
              cspPointsCircle.pop();
              if (cspPointsCircle.length > 0) {
                geoCspPointsCircle[0] = new MultiPoint(cspPointsCircle);
              } else {
                geoCspPointsCircle = [];
              }
            }
          });
        }).catch(error => {
          console.error("Failed to get image information:", error);
        });
      } else {
        // User canceled spec selection
        console.log("Spec selection canceled");
        latLonInputPairIdx--;
        cspPointsCircle.pop();
        if (cspPointsCircle.length > 0) {
          geoCspPointsCircle[0] = new MultiPoint(cspPointsCircle);
        } else {
          geoCspPointsCircle = [];
        }
        return;
      }
    }).catch(function (error) {
      console.log(error);
      errorAlert("Cannot show spec selection dialog (Check log for details)");
      if (error.response && error.response.data) {
        displayJsonData(error.response.data, typeError);
      }
    });
  }).catch(function (error) {
    // Close loading popup on error
    Swal.close();
    
    console.log(error);
    errorAlert("Cannot recommend a spec (Check log for details)");
    if (error.response && error.response.data) {
      displayJsonData(error.response.data, typeError);
    }
  });
}
window.getRecommendedSpec = getRecommendedSpec;

// SubGroup Management Functions
function updateSubGroupReview() {
  const reviewCard = document.getElementById('mci-review-card');
  const subgroupList = document.getElementById('subgroup-list');
  const noSubgroups = document.getElementById('no-subgroups');
  
  // Clear existing items
  subgroupList.innerHTML = '';
  
  if (vmSubGroupReqeustFromSpecList.length === 0) {
    reviewCard.style.display = 'none';
    return;
  }
  
  // Show review card
  reviewCard.style.display = 'block';
  noSubgroups.style.display = 'none';
  
  // Add each SubGroup item
  vmSubGroupReqeustFromSpecList.forEach((vm, index) => {
    const spec = recommendedSpecList[index];
    const subgroupItem = createSubGroupItem(vm, spec, index);
    subgroupList.appendChild(subgroupItem);
  });
  
  // Add action buttons at the bottom of the SubGroup list
  const actionButtonsContainer = document.createElement('div');
  actionButtonsContainer.className = 'mt-3 pt-3 border-top';
  
  // Check if only one SubGroup exists to enable Append SubGroup button
  const hasOneSubGroup = vmSubGroupReqeustFromSpecList.length === 1;
  
  // Get current workload type
  const workloadType = getCurrentWorkloadType();
  console.log('Current workload type:', workloadType);
  console.log('VM radio:', document.getElementById('vmMode'));
  console.log('K8s radio:', document.getElementById('k8sMode'));
  console.log('VM checked:', document.getElementById('vmMode')?.checked);
  console.log('K8s checked:', document.getElementById('k8sMode')?.checked);
  
  // Generate buttons based on workload type
  let buttonsHtml = '<div class="d-flex flex-column" style="gap: 8px;">';
  
  if (workloadType === 'vm') {
    console.log('Generating VM buttons...');
    // VM workload buttons
    buttonsHtml += `
      <button type="button" onClick="createMci();" class="btn btn-success btn-sm" style="font-size: 0.85rem; padding: 8px 12px;">
        🚀 Create MCI
      </button>
      <div class="d-flex" style="gap: 4px;">
        <button type="button" onClick="scaleOutMciWithConfiguration();" class="btn btn-info btn-sm ${!hasOneSubGroup ? 'disabled' : ''}" 
                style="font-size: 0.75rem; padding: 6px 8px; flex: 1;" ${!hasOneSubGroup ? 'disabled' : ''}>
          ➕ ScaleOut existing MCI
        </button>
        <button type="button" onClick="clearCircle('clearText');" class="btn btn-outline-secondary btn-sm" 
                style="font-size: 0.7rem; padding: 6px 8px; min-width: 60px;">
          🗑️
        </button>
      </div>
    `;
  } else if (workloadType === 'k8s') {
    console.log('Generating K8s buttons...');
    // K8s workload buttons
    buttonsHtml += `
      <div class="border-top pt-2">
        <small class="text-muted d-block mb-2">Kubernetes Cluster</small>
        <button type="button" onClick="createK8sCluster();" class="btn btn-primary btn-sm ${!hasOneSubGroup ? 'disabled' : ''}" 
                style="font-size: 0.85rem; padding: 8px 12px; width: 100%; margin-bottom: 4px;" ${!hasOneSubGroup ? 'disabled' : ''}>
          ☸️ Create K8s Cluster
        </button>
        <div class="d-flex" style="gap: 4px;">
          <button type="button" onClick="addNodeGroupToK8sCluster();" class="btn btn-outline-primary btn-sm ${!hasOneSubGroup ? 'disabled' : ''}" 
                  style="font-size: 0.75rem; padding: 6px 8px; flex: 1;" ${!hasOneSubGroup ? 'disabled' : ''}>
            ➕ Add NodeGroup to K8s Cluster
          </button>
          <button type="button" onClick="clearCircle('clearText');" class="btn btn-outline-secondary btn-sm" 
                  style="font-size: 0.7rem; padding: 6px 8px; min-width: 60px;">
            🗑️
          </button>
        </div>
      </div>
    `;
  } else {
    console.log('Generating default VM buttons (fallback)...');
    // Default fallback to VM buttons
    buttonsHtml += `
      <button type="button" onClick="createMci();" class="btn btn-success btn-sm" style="font-size: 0.85rem; padding: 8px 12px;">
        🚀 Create MCI
      </button>
      <div class="d-flex" style="gap: 4px;">
        <button type="button" onClick="scaleOutMciWithConfiguration();" class="btn btn-info btn-sm ${!hasOneSubGroup ? 'disabled' : ''}" 
                style="font-size: 0.75rem; padding: 6px 8px; flex: 1;" ${!hasOneSubGroup ? 'disabled' : ''}>
          ➕ ScaleOut existing MCI
        </button>
        <button type="button" onClick="clearCircle('clearText');" class="btn btn-outline-secondary btn-sm" 
                style="font-size: 0.7rem; padding: 6px 8px; min-width: 60px;">
          🗑️
        </button>
      </div>
    `;
  }
  
  buttonsHtml += '</div>';
  actionButtonsContainer.innerHTML = buttonsHtml;
  subgroupList.appendChild(actionButtonsContainer);
  
  // Auto-scroll to bottom when new items are added (with safety checks)
  setTimeout(() => {
    try {
      const scrollableColumn = document.querySelector('.scrollable-column');
      if (scrollableColumn && scrollableColumn.scrollHeight > scrollableColumn.clientHeight) {
        scrollableColumn.scrollTo({
          top: scrollableColumn.scrollHeight,
          behavior: 'smooth'
        });
      }
    } catch (error) {
      console.log('Auto-scroll failed:', error);
    }
  }, 100);
}

function createSubGroupItem(vm, spec, index) {
  const item = document.createElement('div');
  item.className = 'list-group-item p-2 mb-2 border rounded';
  item.style.backgroundColor = '#f8f9fa';
  
  const providerColor = getProviderColor(spec?.providerName);
  
  item.innerHTML = `
    <div class="d-flex align-items-start justify-content-between">
      <div class="flex-grow-1" style="min-width: 0;">
        <div class="d-flex align-items-center mb-1 flex-wrap">
          <span class="badge badge-primary mr-2" style="font-size: 0.75rem;">${vm.name || `SubGroup-${index + 1}`}</span>
          <span class="badge mr-2" style="background-color: ${providerColor}; color: white; font-size: 0.7rem;">
            ${spec?.providerName || 'Unknown'} - ${spec?.regionName || 'Unknown Region'}
          </span>
          <span class="badge badge-secondary mr-2" style="font-size: 0.75rem; font-weight: bold;">
            💻 ${vm.subGroupSize}
          </span>
        </div>
        <div class="small text-muted" style="font-size: 0.7rem; line-height: 1.2;">
          <div style="margin-bottom: 2px;"><strong>Spec:</strong> ${spec?.cspSpecName || vm.specId}</div>
          <div style="margin-bottom: 2px;"><strong>Image:</strong> ${vm.imageId}</div>
          <div><strong>vCPU:</strong> ${spec?.vCPU || 'N/A'} | <strong>Memory:</strong> ${spec?.memoryGiB || 'N/A'}GB | <strong>Cost:</strong> $${spec?.costPerHour || 'N/A'}/h</div>
        </div>
      </div>
      <div class="d-flex flex-column ml-2" style="gap: 2px;">
        <button type="button" class="btn btn-sm btn-outline-secondary" onclick="editSubGroup(${index})" title="Edit" style="width: 28px; height: 28px; padding: 2px; font-size: 0.7rem;">
          ✏️
        </button>
        <button type="button" class="btn btn-sm btn-outline-danger" onclick="removeSubGroup(${index})" title="Remove" style="width: 28px; height: 28px; padding: 2px; font-size: 0.7rem;">
          🗑️
        </button>
      </div>
    </div>
  `;
  
  return item;
}

function getProviderColor(provider) {
  const definedColors = {
    'aws': '#FF9900',
    'azure': '#0078D4',
    'gcp': '#4285F4',
    'alibaba': '#FF6A00',
    'ibm': '#1261FE',
    'tencent': '#006EFF',
    'ncp': '#03C75A',
    'kt': '#E31837',
    'nhn': '#FF6B35'
  };
  
  if (!provider) return '#6c757d';
  
  const providerKey = provider.toLowerCase();
  
  if (definedColors[providerKey]) {
    return definedColors[providerKey];
  }
  
  return generateProviderColor(provider);
}

// Generate a consistent color for unknown providers based on provider name
function generateProviderColor(provider) {
  if (!provider) return '#6c757d';
  
  // Simple hash function to generate consistent colors
  let hash = 0;
  const str = provider.toLowerCase();
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  // Generate a color from the hash
  const hue = Math.abs(hash) % 360;
  const saturation = 60 + (Math.abs(hash >> 8) % 40); // 60-100%
  const lightness = 40 + (Math.abs(hash >> 16) % 20); // 40-60%
  
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

function editSubGroup(index) {
  const vm = vmSubGroupReqeustFromSpecList[index];
  const spec = recommendedSpecList[index];
  
  Swal.fire({
    title: `✏️ Edit ${vm.name || `SubGroup-${index + 1}`}`,
    html: `
      <div class="text-left">
        <div class="form-group">
          <label>SubGroup Name:</label>
          <input type="text" id="edit-name" class="form-control" value="${vm.name}" placeholder="SubGroup Name">
        </div>
        <div class="form-group">
          <label>VM Count:</label>
          <input type="number" id="edit-count" class="form-control" value="${vm.subGroupSize}" min="1" max="100">
        </div>
        <div class="form-group">
          <label>Root Disk Size:</label>
          <input type="text" id="edit-disk" class="form-control" value="${vm.rootDiskSize}" placeholder="default or size in GB">
        </div>
        <div class="form-group">
          <label>Labels (key=value, comma separated):</label>
          <input type="text" id="edit-labels" class="form-control" value="${vm.label ? Object.entries(vm.label).map(([k,v]) => `${k}=${v}`).join(', ') : ''}" placeholder="env=prod, team=dev">
        </div>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'Save Changes',
    cancelButtonText: 'Cancel',
    preConfirm: () => {
      const name = document.getElementById('edit-name').value.trim();
      const count = parseInt(document.getElementById('edit-count').value);
      const disk = document.getElementById('edit-disk').value.trim();
      const labelsText = document.getElementById('edit-labels').value.trim();
      
      if (!name || isNaN(count) || count < 1) {
        Swal.showValidationMessage('Please provide valid name and VM count');
        return false;
      }
      
      // Parse labels
      const labels = {};
      if (labelsText) {
        labelsText.split(',').forEach(pair => {
          const [key, value] = pair.trim().split('=');
          if (key && value) {
            labels[key.trim()] = value.trim();
          }
        });
      }
      
      return { name, count, disk: disk || 'default', labels };
    }
  }).then((result) => {
    if (result.isConfirmed) {
      // Update the VM configuration
      vmSubGroupReqeustFromSpecList[index].name = result.value.name;
      vmSubGroupReqeustFromSpecList[index].subGroupSize = result.value.count.toString();
      vmSubGroupReqeustFromSpecList[index].rootDiskSize = result.value.disk;
      if (Object.keys(result.value.labels).length > 0) {
        vmSubGroupReqeustFromSpecList[index].label = result.value.labels;
      } else {
        delete vmSubGroupReqeustFromSpecList[index].label;
      }
      
      updateSubGroupReview();
      successAlert('SubGroup updated successfully!');
    }
  });
}

function removeSubGroup(index) {
  const vm = vmSubGroupReqeustFromSpecList[index];
  
  Swal.fire({
    title: 'Remove SubGroup?',
    text: `Are you sure you want to remove "${vm.name || `SubGroup-${index + 1}`}"?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Yes, Remove',
    cancelButtonText: 'Cancel',
    confirmButtonColor: '#dc3545'
  }).then((result) => {
    if (result.isConfirmed) {
      // Remove from arrays
      vmSubGroupReqeustFromSpecList.splice(index, 1);
      recommendedSpecList.splice(index, 1);
      
      // Remove corresponding coordinate point
      if (cspPointsCircle.length > index) {
        cspPointsCircle.splice(index, 1);
        if (cspPointsCircle.length > 0) {
          geoCspPointsCircle[0] = new MultiPoint(cspPointsCircle);
        } else {
          geoCspPointsCircle = [];
        }
      }
      
      // Decrease the index counter
      if (latLonInputPairIdx > 0) {
        latLonInputPairIdx--;
      }
      
      updateSubGroupReview();
      // successAlert('SubGroup removed successfully!');
    }
  });
}

// Make functions available globally
window.updateSubGroupReview = updateSubGroupReview;
window.editSubGroup = editSubGroup;
window.removeSubGroup = removeSubGroup;

function range_change(obj) {
  document.getElementById("myvalue").value = obj.value;
}
window.range_change = range_change;

(function () {
  const parentS = document.querySelectorAll(".range-slider");

  if (!parentS) {
    return;
  }

  parentS.forEach((parent) => {
    const rangeS = parent.querySelectorAll('input[type="range"]'),
      numberS = parent.querySelectorAll('input[type="number"]');

    rangeS.forEach((el) => {
      el.oninput = () => {
        let slide1 = parseFloat(rangeS[0].value),
          slide2 = parseFloat(rangeS[1].value);

        if (slide1 > slide2) {
          [slide1, slide2] = [slide2, slide1];
        }

        numberS[0].value = slide1;
        numberS[1].value = slide2;
      };
    });

    numberS.forEach((el) => {
      el.oninput = () => {
        let number1 = parseFloat(numberS[0].value),
          number2 = parseFloat(numberS[1].value);

        if (number1 > number2) {
          let tmp = number1;
          numberS[0].value = number2;
          numberS[1].value = tmp;
        }

        rangeS[0].value = number1;
        rangeS[1].value = number2;
      };
    });
  });
})();

function addRegionMarker(spec) {
  var hostname = configHostname;
  var port = configPort;
  var username = configUsername;
  var password = configPassword;

  var url = `http://${hostname}:${port}/tumblebug/ns/system/resources/spec/${spec}`;

  axios({
    method: "get",
    url: url,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
  }).then((res) => {
    console.log(res);

    var connConfig = res.data.connectionName;
    console.log(connConfig);

    url = `http://${hostname}:${port}/tumblebug/connConfig/${connConfig}`;

    axios({
      method: "get",
      url: url,
      auth: {
        username: `${username}`,
        password: `${password}`,
      },
    }).then((res2) => {
      console.log(
        "Best cloud location: [" +
        res2.data.regionDetail.location.latitude +
        "," +
        res2.data.regionDetail.location.longitude +
        "]"
      ); // for debug

      // push order [longitute, latitude]
      cspPointsCircle.push([
        res2.data.regionDetail.location.longitude,
        res2.data.regionDetail.location.latitude,
      ]);
      geoCspPointsCircle[0] = new MultiPoint(cspPointsCircle);
    });
  });
}
window.addRegionMarker = addRegionMarker;

function controlMCI(action) {
  switch (action) {
    case "refine":
    case "suspend":
    case "resume":
    case "reboot":
    case "terminate":
    case "continue":
    case "withdraw":
      break;
    default:
      console.log(
        `The actions ${action} is not supported. Supported actions: refine, continue, withdraw, suspend, resume, reboot, terminate.`
      );
      return;
  }
  //console.log("[MCI " +action +"]");

  var config = getConfig();
  var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = namespaceElement.value;
  var mciid = mciidElement.value;

  var spinnerId = addSpinnerTask(action + ": " + mciid);
  infoAlert(action + ": " + mciid);

  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/control/mci/${mciid}?action=${action}`;

  console.log("MCI control:[" + action + "]");

  axios({
    method: "get",
    url: url,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
  })
    .then((res) => {
      if (res.data != null) {
        console.log(res.data);
        displayJsonData(res.data, typeInfo);
        switch (action) {
          case "refine":
          case "suspend":
          case "resume":
          case "reboot":
          case "terminate":
          case "continue":
          case "withdraw":
            infoAlert(
              JSON.stringify(res.data.message, null, 2).replace(/['",]+/g, "")
            );
            break;
          default:
            console.log(
              `The actions ${action} is not supported. Supported actions: refine, continue, withdraw, suspend, resume, reboot, terminate.`
            );
        }
      }
    })
    .catch(function (error) {
      if (error.response) {
        // status code is not 2xx
        console.log(error.response.data);
        console.log(error.response.status);
        console.log(error.response.headers);
      } else {
        console.log("Error", error.message);
      }
      console.log(error.config);
      errorAlert(
        JSON.stringify(error.response.data, null, 2).replace(/['",]+/g, "")
      );
    })
    .finally(function () {
      removeSpinnerTask(spinnerId);
    });
}
window.controlMCI = controlMCI;

function hideMCI() {
  var config = getConfig();
  var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = namespaceElement.value;

  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mci?option=id`;

  var hideListString = "";
  for (i = 0; i < mciHideList.length; i++) {
    var html = "<br>[" + i + "]" + ": <b>" + mciHideList[i] + "</b> (hidden)";

    hideListString = hideListString + html;
  }

  axios({
    method: "get",
    url: url,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
  }).then((res) => {
    if (res.data.output != null) {
      mciList = res.data.output;

      Swal.fire({
        title: "Hide/Show a MCI from the Map",
        html: "<font size=3>" + hideListString,
        showCancelButton: true,
        confirmButtonText: "Show",
        showDenyButton: true,
        denyButtonText: "Hide",
      }).then((result) => {
        hideListString = "";

        if (result.isConfirmed) {
          if (mciHideList.length != 0) {
            Swal.fire({
              title: "Show a MCI from the Map",
              html: "<font size=3>" + hideListString,
              input: "select",
              inputOptions: mciHideList,
              inputPlaceholder: "Select from dropdown",
              inputAttributes: {
                autocapitalize: "off",
              },
              showCancelButton: true,
              confirmButtonText: "Show",
            }).then((result) => {
              if (result.isConfirmed) {
                mciHideList = mciHideList.filter(
                  (a) => a !== mciHideList[result.value]
                );

                for (i = 0; i < mciHideList.length; i++) {
                  var html =
                    "<br>[" +
                    i +
                    "]" +
                    ": <b>" +
                    mciHideList[i] +
                    "</b> (hidden)";
                  hideListString = hideListString + html;
                }
                infoAlert(
                  "Show: " +
                  mciHideList[result.value] +
                  "<br>" +
                  hideListString
                );
              }
            });
          } else {
            infoAlert("There is no hidden MCI yet");
          }
        } else if (result.isDenied) {
          if (mciList.length != 0) {
            Swal.fire({
              title: "Hide a MCI from the Map",
              html: "<font size=3>" + hideListString,
              input: "select",
              inputOptions: mciList.filter(
                (val) => !mciHideList.includes(val)
              ),
              inputPlaceholder: "Select from dropdown",
              inputAttributes: {
                autocapitalize: "off",
              },
              showCancelButton: true,
              confirmButtonText: "Hide",
            }).then((result) => {
              if (result.isConfirmed) {
                mciHideList.push(mciList[result.value]);
                // remove duplicated items
                mciHideList = [...new Set(mciHideList)];

                for (i = 0; i < mciHideList.length; i++) {
                  var html =
                    "<br>[" +
                    i +
                    "]" +
                    ": <b>" +
                    mciHideList[i] +
                    "</b> (hidden)";
                  hideListString = hideListString + html;
                }
                infoAlert(
                  "Hide: " + mciList[result.value] + "<br>" + hideListString
                );
              }
            });
          } else {
            infoAlert("There is no MCI yet");
          }
        }
      });
    }
  });
}
window.hideMCI = hideMCI;

function statusMCI() {
  console.log("[Get MCI status]");

  var config = getConfig();
  var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = namespaceElement.value;
  var mciid = mciidElement.value;

  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mci/${mciid}`;

  axios({
    method: "get",
    url: url,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
    timeout: 260000,
  })
    .then((res) => {
      console.log("[Status MCI]");
      displayJsonData(res.data, typeInfo);
    })
    .catch(function (error) {
      if (error.response) {
        // status code is not 2xx
        console.log(error.response.data);
        console.log(error.response.status);
        console.log(error.response.headers);
      } else {
        console.log("Error", error.message);
      }
      console.log(error.config);
      errorAlert(
        JSON.stringify(error.response.data, null, 2).replace(/['",]+/g, "")
      );
    });
}
window.statusMCI = statusMCI;

function deleteMCI() {
  console.log("Deleting MCI");

  var config = getConfig();
  var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = namespaceElement.value;
  var mciid = mciidElement.value;

  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mci/${mciid}?option=terminate`;

  var spinnerId = addSpinnerTask("Deleting MCI: " + mciid);
  infoAlert("Delete: " + mciid + " (option=terminate)");

  axios({
    method: "delete",
    url: url,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
  })
    .then((res) => {
      console.log(res);
      displayJsonData(res.data, typeInfo);
      clearMap();
      updateMciList();
    })
    .catch(function (error) {
      console.log(error);
      errorAlert("Failed to delete MCI: " + mciid);
      if (error.response && error.response.data) {
        displayJsonData(error.response.data, typeError);
      }
    })
    .finally(function () {
      removeSpinnerTask(spinnerId);
    });
}
window.deleteMCI = deleteMCI;

function releaseResources() {
  var spinnerId = addSpinnerTask("Removing associated default resources");
  infoAlert("Removing all associated default resources");

  var config = getConfig();
  var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = namespaceElement.value;

  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/sharedResources`;

  axios({
    method: "delete",
    url: url,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
  })
    .then((res) => {
      updateNsList();

      console.log(res); // for debug
      displayJsonData(res.data, typeInfo);
    })
    .finally(function () {
      removeSpinnerTask(spinnerId);
      clearMap();
    });
}
window.releaseResources = releaseResources;

function resourceOverview() {
  var spinnerId = addSpinnerTask("Inspect all resources and overview");
  infoAlert("Inspect all resources and overview");

  var config = getConfig();
  var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;

  var url = `http://${hostname}:${port}/tumblebug/inspectResourcesOverview`;

  axios({
    method: "get",
    url: url,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
  })
    .then((res) => {
      console.log(res); // for debug
      displayJsonData(res.data, typeInfo);
    })
    .finally(function () {
      removeSpinnerTask(spinnerId);
    });
}
window.resourceOverview = resourceOverview;

// function for registerCspResource by registerCspResource button item
function registerCspResource() {
  var spinnerId = addSpinnerTask("Registering all CSP's resources");
  infoAlert("Registering all CSP's resources");

  var config = getConfig(); var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = namespaceElement.value;

  var url = `http://${hostname}:${port}/tumblebug/registerCspResourcesAll?mciFlag=n`;

  var commandReqTmp = {
    mciName: "csp",
    nsId: `${namespace}`,
  };
  var jsonBody = JSON.stringify(commandReqTmp, undefined, 4);

  axios({
    method: "post",
    url: url,
    headers: { "Content-Type": "application/json" },
    data: jsonBody,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
  })
    .then((res) => {
      console.log(res); // for debug

      console.log("[Complete: Registering all CSP's resources]\n");
      displayJsonData(res.data, typeInfo);
    })
    .finally(function () {
      removeSpinnerTask(spinnerId);
    });
}
window.registerCspResource = registerCspResource;

// ==================== Schedule Resource Registration Functions ====================

// Global variables for schedule job auto-refresh
window.scheduleJobAutoRefreshEnabled = false;
window.scheduleJobAutoRefreshInterval = null;

// Main Schedule Job Management Modal
async function showScheduleJobManagement() {
  const config = getConfig();
  const hostname = config.hostname;
  const port = config.port;
  const username = config.username;
  const password = config.password;

  // Load namespace and connection lists
  let namespaces = [];
  let connections = [];
  
  try {
    const [nsResponse, connResponse] = await Promise.all([
      axios.get(`http://${hostname}:${port}/tumblebug/ns?option=id`, {
        auth: { username, password }
      }),
      axios.get(`http://${hostname}:${port}/tumblebug/connConfig`, {
        auth: { username, password }
      })
    ]);
    
    namespaces = nsResponse.data.output || nsResponse.data.ns || [];
    connections = connResponse.data.connectionconfig || [];
  } catch (error) {
    console.error('Error loading namespace/connection list:', error);
    Swal.fire('❌ Error', 'Failed to load namespace/connection list', 'error');
    return;
  }

  // Build options
  const nsOptions = namespaces.map(ns => {
    const nsId = typeof ns === 'string' ? ns : (ns.id || ns);
    return `<option value="${nsId}">${nsId}</option>`;
  }).join('');

  const connOptions = '<option value="">All Connections</option>' + 
    connections.map(conn => 
      `<option value="${conn.configName}">${conn.configName} (${conn.providerName})</option>`
    ).join('');

  Swal.fire({
    title: '📅 Schedule Job Management',
    html: `
      <style>
        .schedule-job-modal-popup { min-width: 600px; max-width: 900px; }
        .schedule-compact-form { text-align: left; padding: 0; margin: 0; }
        .schedule-compact-form h5 { margin: 0 0 10px 0; font-size: 16px; }
        .schedule-compact-form .form-row { display: flex; gap: 10px; margin-bottom: 8px; }
        .schedule-compact-form .form-col { flex: 1; min-width: 0; }
        .schedule-compact-form .form-col-full { flex: 1 0 100%; }
        .schedule-compact-form label { display: block; margin: 0 0 3px 0; font-size: 13px; font-weight: 500; }
        .schedule-compact-form .form-control-sm { height: 28px; font-size: 13px; padding: 3px 8px; }
        .schedule-compact-form select.form-control-sm { height: 30px; }
        .schedule-compact-form hr { margin: 12px 0; border-top: 1px solid #dee2e6; }
        .schedule-compact-form .btn { margin: 8px 0; }
        .schedule-compact-form small { font-size: 11px; color: #6c757d; margin-top: 2px; display: block; }
        .job-card { border: 1px solid #dee2e6; border-radius: 6px; padding: 12px; margin-bottom: 10px; background: #f8f9fa; }
        .job-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .job-card-title { font-weight: 600; font-size: 13px; color: #333; }
        .job-card-body { font-size: 12px; }
        .job-card-footer { margin-top: 8px; display: flex; gap: 5px; flex-wrap: wrap; }
        .job-card-footer .btn { margin: 0; font-size: 11px; padding: 2px 8px; }
      </style>
      <div class="schedule-compact-form">
        <h5>➕ Create New Schedule Job</h5>
        <div class="form-row">
          <div class="form-col">
            <label>Namespace ID *</label>
            <select id="sched-nsId" class="form-control form-control-sm">
              ${nsOptions}
            </select>
          </div>
          <div class="form-col">
            <label>Connection Name</label>
            <select id="sched-connection" class="form-control form-control-sm">
              ${connOptions}
            </select>
            <small>Leave empty for all connections</small>
          </div>
        </div>
        <div class="form-row">
          <div class="form-col">
            <label>Interval (seconds) *</label>
            <input type="number" id="sched-interval" class="form-control form-control-sm" value="3600" min="10">
            <small>Min: 10s, Recommended: 1800s+</small>
          </div>
          <div class="form-col">
            <label>MCI Name Prefix</label>
            <input type="text" id="sched-mciPrefix" class="form-control form-control-sm" value="scheduled-mci">
          </div>
        </div>
        <div class="form-row">
          <div class="form-col">
            <label>Registration Option</label>
            <select id="sched-option" class="form-control form-control-sm">
              <option value="">All Resources</option>
              <option value="onlyVm">Only VMs</option>
              <option value="exceptVm">Except VMs</option>
            </select>
          </div>
          <div class="form-col">
            <label>MCI Flag</label>
            <select id="sched-mciFlag" class="form-control form-control-sm">
              <option value="y">Single MCI</option>
              <option value="n">Separate per VM</option>
            </select>
          </div>
        </div>
        <button onclick="createScheduleJobFromModal()" class="btn btn-primary btn-block">➕ Create Schedule Job</button>
        
        <hr>
        
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <h5 style="margin: 0;">📋 Existing Schedule Jobs</h5>
          <div>
            <button id="refreshJobsBtn" class="btn btn-info btn-sm" style="margin-right: 5px;">🔄 Refresh</button>
            <button id="toggleJobAutoRefreshBtn" class="btn btn-success btn-sm">⏸️ Pause Auto-refresh</button>
          </div>
        </div>
        <div style="font-size: 11px; color: #6c757d; margin-bottom: 8px;">
          <span id="jobAutoRefreshStatus">🟢 Auto-refreshing every 10 seconds</span> | 
          <span id="jobLastRefreshTime">Last refresh: -</span>
        </div>
        <div id="scheduleJobListContainer" style="max-height: 450px; overflow-y: auto;">
          <p class="text-muted">Loading schedule jobs...</p>
        </div>
      </div>
    `,
    width: '50%',
    customClass: {
      popup: 'schedule-job-modal-popup'
    },
    showConfirmButton: false,
    showCancelButton: true,
    cancelButtonText: '❌ Close',
    didOpen: () => {
      // Enable auto-refresh
      window.scheduleJobAutoRefreshEnabled = true;
      
      // Setup refresh now button
      const refreshBtn = document.getElementById('refreshJobsBtn');
      if (refreshBtn) {
        refreshBtn.addEventListener('click', () => loadScheduleJobsInModal());
      }
      
      // Setup toggle auto-refresh button
      const toggleBtn = document.getElementById('toggleJobAutoRefreshBtn');
      if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
          window.scheduleJobAutoRefreshEnabled = !window.scheduleJobAutoRefreshEnabled;
          const status = document.getElementById('jobAutoRefreshStatus');
          
          if (window.scheduleJobAutoRefreshEnabled) {
            toggleBtn.innerHTML = '⏸️ Pause Auto-refresh';
            toggleBtn.className = 'btn btn-success btn-sm';
            if (status) status.innerHTML = '🟢 Auto-refreshing every 10 seconds';
          } else {
            toggleBtn.innerHTML = '▶️ Resume Auto-refresh';
            toggleBtn.className = 'btn btn-warning btn-sm';
            if (status) status.innerHTML = '🔴 Auto-refresh paused';
          }
        });
      }
      
      // Initial load
      setTimeout(() => loadScheduleJobsInModal(), 100);
      
      // Start auto-refresh timer (10 seconds)
      if (window.scheduleJobAutoRefreshInterval) {
        clearInterval(window.scheduleJobAutoRefreshInterval);
      }
      window.scheduleJobAutoRefreshInterval = setInterval(() => {
        if (window.scheduleJobAutoRefreshEnabled && Swal.isVisible()) {
          loadScheduleJobsInModal();
        }
      }, 10000);
    },
    willClose: () => {
      // Stop auto-refresh
      window.scheduleJobAutoRefreshEnabled = false;
      if (window.scheduleJobAutoRefreshInterval) {
        clearInterval(window.scheduleJobAutoRefreshInterval);
        window.scheduleJobAutoRefreshInterval = null;
      }
    }
  });
}
window.showScheduleJobManagement = showScheduleJobManagement;

// Load Schedule Jobs in Modal
async function loadScheduleJobsInModal() {
  const config = getConfig();
  const container = document.getElementById('scheduleJobListContainer');
  const lastRefreshTime = document.getElementById('jobLastRefreshTime');
  
  if (!container) return;
  
  try {
    const response = await axios.get(
      `http://${config.hostname}:${config.port}/tumblebug/registerCspResources/schedule`,
      { auth: { username: config.username, password: config.password } }
    );
    
    const jobs = response.data.jobs || [];
    
    if (lastRefreshTime) {
      lastRefreshTime.innerHTML = `Last refresh: ${new Date().toLocaleTimeString()}`;
    }
    
    if (jobs.length === 0) {
      container.innerHTML = '<p class="text-muted text-center" style="padding: 20px;">No schedule jobs found. Create one above!</p>';
      return;
    }
    
    // Build job cards
    container.innerHTML = jobs.map(job => {
      // Execution State Badge (Scheduled, Executing, Stopped)
      let executionStateBadge = '';
      if (job.status === 'Executing') {
        executionStateBadge = '<span class="badge badge-warning">⚙️ Executing</span>';
      } else if (job.status === 'Stopped') {
        executionStateBadge = '<span class="badge badge-secondary">⏹️ Stopped</span>';
      } else { // Default to Scheduled
        executionStateBadge = '<span class="badge badge-info">📅 Scheduled</span>';
      }
      
      // Enabled/Paused Badge (only for active jobs, not for stopped)
      let enabledBadge = '';
      if (job.status !== 'Stopped') {
        enabledBadge = job.enabled ? 
          '<span class="badge badge-success">✅ Active</span>' : 
          '<span class="badge badge-dark">⏸️ Paused</span>';
      }
      
      // Auto-Disabled Warning
      const autoDisabledBadge = job.autoDisabled ? 
        '<span class="badge badge-danger">⚠️ Auto-Disabled</span>' : '';
      
      return `
        <div class="job-card">
          <div class="job-card-header">
            <div class="job-card-title">${job.jobId}</div>
            <div>${executionStateBadge} ${enabledBadge} ${autoDisabledBadge}</div>
          </div>
          <div class="job-card-body" style="padding: 8px 12px;">
            <div style="font-size: 0.9em; line-height: 1.6;">
              <strong>NS:</strong> ${job.nsId} | <strong>Conn:</strong> ${job.connectionName || 'All'} | <strong>Interval:</strong> ${job.intervalSeconds}s (${Math.round(job.intervalSeconds/60)}m) | <strong>MCI Prefix:</strong> ${job.mciNamePrefix} | <strong>Stats:</strong> Exec: ${job.executionCount}, Success: <span class="text-success">${job.successCount}</span>, Fail: <span class="text-danger">${job.failureCount}</span> (Consecutive: ${job.consecutiveFailures}) | <strong>Next:</strong> ${new Date(job.nextExecutionAt).toLocaleString()}${job.lastExecutionAt ? ` | <strong>Last:</strong> ${new Date(job.lastExecutionAt).toLocaleString()}` : ''}
            </div>
          </div>
          <div class="job-card-footer">
            <button class="btn btn-info btn-sm" onclick="viewJobDetails('${job.jobId}')">🔍 Details</button>
            ${job.enabled ? 
              `<button class="btn btn-warning btn-sm" onclick="pauseJobFromModal('${job.jobId}')">⏸️ Pause</button>` :
              `<button class="btn btn-success btn-sm" onclick="resumeJobFromModal('${job.jobId}')">▶️ Resume</button>`
            }
            <button class="btn btn-danger btn-sm" onclick="deleteJobFromModal('${job.jobId}')">🗑️ Delete</button>
          </div>
        </div>
      `;
    }).join('');
    
  } catch (error) {
    console.error('Error loading schedule jobs:', error);
    container.innerHTML = '<p class="text-danger text-center">Error loading jobs. Please try again.</p>';
  }
}
window.loadScheduleJobsInModal = loadScheduleJobsInModal;

// Create Schedule Job from Modal
async function createScheduleJobFromModal() {
  const config = getConfig();
  const nsId = document.getElementById('sched-nsId').value;
  const intervalSeconds = parseInt(document.getElementById('sched-interval').value);
  const connectionName = document.getElementById('sched-connection').value;
  const mciNamePrefix = document.getElementById('sched-mciPrefix').value;
  const option = document.getElementById('sched-option').value;
  const mciFlag = document.getElementById('sched-mciFlag').value;
  
  if (!nsId || !intervalSeconds || intervalSeconds < 10) {
    Swal.fire('❌ Error', 'Please fill required fields correctly (interval min: 10s)', 'error');
    return;
  }
  
  const spinnerId = addSpinnerTask("Creating schedule job");
  
  try {
    const requestBody = {
      jobType: "registerCspResources",
      nsId,
      intervalSeconds,
      connectionName,
      mciNamePrefix,
      option,
      mciFlag
    };
    
    const response = await axios.post(
      `http://${config.hostname}:${config.port}/tumblebug/registerCspResources/schedule`,
      requestBody,
      {
        headers: { "Content-Type": "application/json" },
        auth: { username: config.username, password: config.password }
      }
    );
    
    console.log("Schedule Job Created:", response.data);
    displayJsonData(response.data, typeInfo);
    
    Swal.fire({
      icon: 'success',
      title: '✅ Job Created!',
      html: `Schedule job created successfully: <br><code>${response.data.jobId}</code>`,
      timer: 2000,
      showConfirmButton: false
    }).then(() => {
      // Refresh job list
      loadScheduleJobsInModal();
      // Reopen management modal
      showScheduleJobManagement();
    });
    
  } catch (error) {
    console.error("Error creating schedule job:", error);
    const errorMsg = error.response?.data?.message || error.message || 'Unknown error';
    Swal.fire('❌ Error', `Failed to create job: ${errorMsg}`, 'error');
  } finally {
    removeSpinnerTask(spinnerId);
  }
}
window.createScheduleJobFromModal = createScheduleJobFromModal;

// View Job Details
async function viewJobDetails(jobId) {
  const config = getConfig();
  const spinnerId = addSpinnerTask("Loading job details");
  
  try {
    const response = await axios.get(
      `http://${config.hostname}:${config.port}/tumblebug/registerCspResources/schedule/${jobId}`,
      { auth: { username: config.username, password: config.password } }
    );
    
    const job = response.data;
    displayJsonData(response.data, typeInfo);
    
    const detailsHtml = `
      <div style="text-align: left; font-size: 13px;">
        <table class="table table-sm table-bordered">
          <tr><th style="width: 40%; background-color: #f8f9fa;">Job ID</th><td style="font-family: monospace; font-size: 11px;">${job.jobId}</td></tr>
          <tr><th style="background-color: #f8f9fa;">Job Type</th><td>${job.jobType}</td></tr>
          <tr><th style="background-color: #f8f9fa;">Namespace</th><td><span class="badge badge-info">${job.nsId}</span></td></tr>
          <tr><th style="background-color: #f8f9fa;">Connection</th><td>${job.connectionName || '<span class="badge badge-secondary">All Connections</span>'}</td></tr>
          <tr><th style="background-color: #f8f9fa;">MCI Prefix</th><td>${job.mciNamePrefix}</td></tr>
          <tr><th style="background-color: #f8f9fa;">Option</th><td>${job.option || 'All Resources'}</td></tr>
          <tr><th style="background-color: #f8f9fa;">MCI Flag</th><td>${job.mciFlag === 'y' ? 'Single MCI' : 'Separate per VM'}</td></tr>
          <tr><th style="background-color: #f8f9fa;">Interval</th><td><strong>${job.intervalSeconds}</strong> seconds (${Math.round(job.intervalSeconds/60)} minutes)</td></tr>
          <tr><th style="background-color: #f8f9fa;">Status</th><td>
            ${job.enabled ? '<span class="badge badge-success">🟢 Enabled</span>' : '<span class="badge badge-secondary">⚫ Disabled</span>'}
            ${job.autoDisabled ? '<span class="badge badge-warning">⚠️ Auto-Disabled</span>' : ''}
          </td></tr>
          <tr><th style="background-color: #f8f9fa;">Execution Count</th><td>${job.executionCount}</td></tr>
          <tr><th style="background-color: #f8f9fa;">Success Count</th><td class="text-success"><strong>${job.successCount}</strong></td></tr>
          <tr><th style="background-color: #f8f9fa;">Failure Count</th><td class="text-danger"><strong>${job.failureCount}</strong></td></tr>
          <tr><th style="background-color: #f8f9fa;">Consecutive Failures</th><td>${job.consecutiveFailures}</td></tr>
          <tr><th style="background-color: #f8f9fa;">Next Execution</th><td><strong>${new Date(job.nextExecutionAt).toLocaleString()}</strong></td></tr>
          <tr><th style="background-color: #f8f9fa;">Created At</th><td>${new Date(job.createdAt).toLocaleString()}</td></tr>
          ${job.lastExecutionAt ? `<tr><th style="background-color: #f8f9fa;">Last Execution</th><td>${new Date(job.lastExecutionAt).toLocaleString()}</td></tr>` : ''}
        </table>
      </div>
    `;
    
    Swal.fire({
      title: '🔍 Job Details',
      html: detailsHtml,
      width: '650px',
      confirmButtonText: '👍 OK'
    }).then(() => {
      showScheduleJobManagement();
    });
    
  } catch (error) {
    console.error("Error loading job details:", error);
    const errorMsg = error.response?.data?.message || error.message || 'Unknown error';
    Swal.fire('❌ Error', `Failed to load job details: ${errorMsg}`, 'error');
  } finally {
    removeSpinnerTask(spinnerId);
  }
}
window.viewJobDetails = viewJobDetails;

// Pause Job from Modal
async function pauseJobFromModal(jobId) {
  const config = getConfig();
  const spinnerId = addSpinnerTask("Pausing job");
  
  try {
    await axios.put(
      `http://${config.hostname}:${config.port}/tumblebug/registerCspResources/schedule/${jobId}/pause`,
      {},
      { auth: { username: config.username, password: config.password } }
    );
    
    Swal.fire({
      icon: 'success',
      title: '⏸️ Job Paused',
      text: `Job paused: ${jobId}`,
      timer: 1500,
      showConfirmButton: false
    }).then(() => {
      // Reopen Schedule Job Management modal
      showScheduleJobManagement();
    });
    
  } catch (error) {
    console.error("Error pausing job:", error);
    const errorMsg = error.response?.data?.message || error.message || 'Unknown error';
    Swal.fire('❌ Error', `Failed to pause job: ${errorMsg}`, 'error');
  } finally {
    removeSpinnerTask(spinnerId);
  }
}
window.pauseJobFromModal = pauseJobFromModal;

// Resume Job from Modal
async function resumeJobFromModal(jobId) {
  const config = getConfig();
  const spinnerId = addSpinnerTask("Resuming job");
  
  try {
    await axios.put(
      `http://${config.hostname}:${config.port}/tumblebug/registerCspResources/schedule/${jobId}/resume`,
      {},
      { auth: { username: config.username, password: config.password } }
    );
    
    Swal.fire({
      icon: 'success',
      title: '▶️ Job Resumed',
      text: `Job resumed: ${jobId}`,
      timer: 1500,
      showConfirmButton: false
    }).then(() => {
      // Reopen Schedule Job Management modal
      showScheduleJobManagement();
    });
    
  } catch (error) {
    console.error("Error resuming job:", error);
    const errorMsg = error.response?.data?.message || error.message || 'Unknown error';
    Swal.fire('❌ Error', `Failed to resume job: ${errorMsg}`, 'error');
  } finally {
    removeSpinnerTask(spinnerId);
  }
}
window.resumeJobFromModal = resumeJobFromModal;

// Delete Job from Modal
async function deleteJobFromModal(jobId) {
  const result = await Swal.fire({
    title: '⚠️ Confirm Delete',
    html: `Are you sure you want to delete this job?<br><code>${jobId}</code>`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: '✅ Yes, delete it',
    confirmButtonColor: '#dc3545',
    cancelButtonText: '❌ Cancel'
  });
  
  if (!result.isConfirmed) return;
  
  const config = getConfig();
  const spinnerId = addSpinnerTask("Deleting job");
  
  try {
    await axios.delete(
      `http://${config.hostname}:${config.port}/tumblebug/registerCspResources/schedule/${jobId}`,
      { auth: { username: config.username, password: config.password } }
    );
    
    Swal.fire({
      icon: 'success',
      title: '🗑️ Job Deleted',
      text: `Job deleted: ${jobId}`,
      timer: 1500,
      showConfirmButton: false
    }).then(() => {
      // Reopen Schedule Job Management modal
      showScheduleJobManagement();
    });
    
  } catch (error) {
    console.error("Error deleting job:", error);
    const errorMsg = error.response?.data?.message || error.message || 'Unknown error';
    Swal.fire('❌ Error', `Failed to delete job: ${errorMsg}`, 'error');
  } finally {
    removeSpinnerTask(spinnerId);
  }
}
window.deleteJobFromModal = deleteJobFromModal;

// ==================== End of Schedule Resource Registration Functions ====================

function updateNsList() {
  // Get all namespace select elements
  var namespaceSelects = [
    document.getElementById("namespace"),           // Provision tab
    document.getElementById("namespace-control")    // Control tab  
  ];
  
  // Store previous selections
  var previousSelections = namespaceSelects.map(select => select ? select.value : '');
  
  // Clear options in all namespace selects
  namespaceSelects.forEach(selectElement => {
    if (selectElement) {
      var i, L = selectElement.options.length - 1;
      for (i = L; i >= 0; i--) {
        selectElement.remove(i);
      }
    }
  });

  var config = getConfig(); var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;

  if (hostname && hostname != "" && port && port != "") {
    var url = `http://${hostname}:${port}/tumblebug/ns?option=id`;

    axios({
      method: "get",
      url: url,
      auth: {
        username: `${username}`,
        password: `${password}`,
      },
    })
      .then((res) => {
        if (res.data.output != null) {
          // Update all namespace select elements
          for (let item of res.data.output) {
            if (item && item.trim() !== "") {
              namespaceSelects.forEach((selectElement, index) => {
                if (selectElement) {
                  var option = document.createElement("option");
                  option.value = item;
                  option.text = item;
                  selectElement.appendChild(option);
                }
              });
            }
          }
          
          // Restore previous selections
          namespaceSelects.forEach((selectElement, index) => {
            if (selectElement && previousSelections[index]) {
              for (let i = 0; i < selectElement.options.length; i++) {
                if (selectElement.options[i].value == previousSelections[index]) {
                  selectElement.options[i].selected = true;
                  break;
                }
              }
            }
          });
        }
      })
      .finally(function () {
        updateMciList();
      });
  }
}

// Function to sync namespace selection across all tabs
function syncNamespaceSelection(selectedValue) {
  var namespaceSelects = [
    document.getElementById("namespace"),           // Provision tab
    document.getElementById("namespace-control")    // Control tab  
  ];
  
  namespaceSelects.forEach(selectElement => {
    if (selectElement && selectElement.value !== selectedValue) {
      selectElement.value = selectedValue;
    }
  });
}

var mciList = [];
var mciHideList = [];

function updateMciList() {
  // Clear options in 'select'
  var selectElement = document.getElementById("mciid");
  var previousSelection = selectElement.value;
  var i,
    L = selectElement.options.length - 1;
  for (i = L; i >= 0; i--) {
    selectElement.remove(i);
  }

  var config = getConfig(); var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = namespaceElement.value;

  if (namespace && namespace != "") {
    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mci?option=id`;

    axios({
      method: "get",
      url: url,
      auth: {
        username: `${username}`,
        password: `${password}`,
      },
    })
      .then((res) => {
        if (res.data.output != null) {
          // mciList = res.data.output;
          for (let item of res.data.output) {
            if (item && item.trim() !== "") {
              var option = document.createElement("option");
              option.value = item;
              option.text = item;
              selectElement.appendChild(option);
            }
          }
          for (let i = 0; i < selectElement.options.length; i++) {
            if (selectElement.options[i].value == previousSelection) {
              selectElement.options[i].selected = true;
              break;
            }
          }
        }
      })
      .finally(function () {
        // MCI list updated
      });
  }
}

function updateNsList() {
  // Get all namespace select elements
  var namespaceSelects = [
    document.getElementById("namespace"),           // Provision tab
    document.getElementById("namespace-control")    // Control tab  
  ];
  
  // Store previous selections
  var previousSelections = namespaceSelects.map(select => select ? select.value : '');
  
  // Clear options in all namespace selects
  namespaceSelects.forEach(selectElement => {
    if (selectElement) {
      var i, L = selectElement.options.length - 1;
      for (i = L; i >= 0; i--) {
        selectElement.remove(i);
      }
    }
  });

  var config = getConfig(); var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;

  if (hostname && hostname != "" && port && port != "") {
    var url = `http://${hostname}:${port}/tumblebug/ns?option=id`;

    axios({
      method: "get",
      url: url,
      auth: {
        username: `${username}`,
        password: `${password}`,
      },
    })
      .then((res) => {
        if (res.data.output != null) {
          // Update all namespace select elements
          for (let item of res.data.output) {
            if (item && item.trim() !== "") {
              namespaceSelects.forEach((selectElement, index) => {
                if (selectElement) {
                  var option = document.createElement("option");
                  option.value = item;
                  option.text = item;
                  selectElement.appendChild(option);
                }
              });
            }
          }
          
          // Restore previous selections
          namespaceSelects.forEach((selectElement, index) => {
            if (selectElement && previousSelections[index]) {
              for (let i = 0; i < selectElement.options.length; i++) {
                if (selectElement.options[i].value == previousSelections[index]) {
                  selectElement.options[i].selected = true;
                  break;
                }
              }
            }
          });
        }
      })
      .finally(function () {
        updateMciList();
      });
  }
}

// Function to sync namespace selection across all tabs
function syncNamespaceSelection(selectedValue) {
  var namespaceSelects = [
    document.getElementById("namespace"),           // Provision tab
    document.getElementById("namespace-control")    // Control tab  
  ];
  
  namespaceSelects.forEach(selectElement => {
    if (selectElement && selectElement.value !== selectedValue) {
      selectElement.value = selectedValue;
    }
  });
}

var mciList = [];
var mciHideList = [];

function updateMciList() {
  // Clear options in 'select'
  var selectElement = document.getElementById("mciid");
  var previousSelection = selectElement.value;
  var i,
    L = selectElement.options.length - 1;
  for (i = L; i >= 0; i--) {
    selectElement.remove(i);
  }

  var config = getConfig(); var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = namespaceElement.value;

  if (namespace && namespace != "") {
    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mci?option=id`;

    axios({
      method: "get",
      url: url,
      auth: {
        username: `${username}`,
        password: `${password}`,
      },
    })
      .then((res) => {
        if (res.data.output != null) {
          // mciList = res.data.output;
          for (let item of res.data.output) {
            if (item && item.trim() !== "") {
              var option = document.createElement("option");
              option.value = item;
              option.text = item;
              selectElement.appendChild(option);
            }
          }
          for (let i = 0; i < selectElement.options.length; i++) {
            if (selectElement.options[i].value == previousSelection) {
              selectElement.options[i].selected = true;
              break;
            }
          }
        }
      })
      .finally(function () {
        updateVmAndIpListsFromMci();
        updateResourceList(typeStringVNet);
        updateResourceList(typeStringSG);
        updateResourceList(typeStringSshKey);
        // updateResourceList(typeStringSpec);
        // updateResourceList(typeStringImage);
      });
  }
}
window.updateMciList = updateMciList;

document.getElementById("mciid").onmouseover = function () {
  updateMciList();
};
document.getElementById("mciid").onchange = function () {
  updateVmAndIpListsFromMci();
};

function updateVmList() {
  // This function is now deprecated as VM list is updated via updateVmAndIpListsFromMci()
  // Keeping for backward compatibility, but functionality moved to unified function
}
window.updateVmList = updateVmList;

document.getElementById("vmid").addEventListener('change', function () {
  // When VM is selected, auto-select corresponding IP
  var selectedVmId = this.value;
  var pubipSelect = document.getElementById("pubip");
  
  // Find and select the IP option that contains this VM ID
  for (let i = 0; i < pubipSelect.options.length; i++) {
    var optionText = pubipSelect.options[i].text;
    if (optionText.includes(`(${selectedVmId},`)) {
      pubipSelect.options[i].selected = true;
      break;
    }
  }
});

function updateIpList() {
  // This function is now deprecated as IP list is updated via updateVmAndIpListsFromMci()
  // Keeping for backward compatibility, but functionality moved to unified function
}
window.updateIpList = updateIpList;

function updateSubGroupList() {
  // This function is now deprecated as SubGroup selection is removed from UI
  // SubGroup information is now shown in VM ID dropdown as "vm-id (subgroup-id)"
}
window.updateSubGroupList = updateSubGroupList;

// SubGroup selection element no longer exists in UI

// New unified function to update VM and IP lists from MCI data
function updateVmAndIpListsFromMci() {
  var vmSelectElement = document.getElementById("vmid");
  var ipSelectElement = document.getElementById("pubip");
  var previousVmSelection = vmSelectElement.value;
  var previousIpSelection = ipSelectElement.value;
  
  // Clear existing options
  while (vmSelectElement.options.length > 0) {
    vmSelectElement.remove(0);
  }
  while (ipSelectElement.options.length > 0) {
    ipSelectElement.remove(0);
  }

  var config = getConfig(); var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = namespaceElement.value;
  var mciid = mciidElement.value;

  if (namespace && namespace != "" && mciid && mciid != "") {
    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mci/${mciid}`;

    axios({
      method: "get",
      url: url,
      auth: {
        username: `${username}`,
        password: `${password}`,
      },
    })
      .then((res) => {
        if (res.data && res.data.vm) {
          res.data.vm.forEach(vm => {
            // Add VM option with SubGroup info
            var vmOption = document.createElement("option");
            vmOption.value = vm.id;
            vmOption.text = `${vm.id} (${vm.subGroupId || 'default'})`;
            vmSelectElement.appendChild(vmOption);

            // Add IP option with VM and SubGroup info
            if (vm.publicIP && vm.publicIP.trim() !== "") {
              var ipOption = document.createElement("option");
              ipOption.value = vm.publicIP;
              ipOption.text = `${vm.publicIP} (${vm.id}, ${vm.subGroupId || 'default'})`;
              ipSelectElement.appendChild(ipOption);
            }
          });

          // Restore previous selections if they still exist
          for (let i = 0; i < vmSelectElement.options.length; i++) {
            if (vmSelectElement.options[i].value === previousVmSelection) {
              vmSelectElement.options[i].selected = true;
              break;
            }
          }
          for (let i = 0; i < ipSelectElement.options.length; i++) {
            if (ipSelectElement.options[i].value === previousIpSelection) {
              ipSelectElement.options[i].selected = true;
              break;
            }
          }
        }
      })
      .catch(function (error) {
        console.error("Error updating VM and IP lists:", error);
      });
  }
}
window.updateVmAndIpListsFromMci = updateVmAndIpListsFromMci;

// Helper function to extract SubGroup ID from VM selection text
function getSubGroupIdFromVmSelection() {
  var vmSelect = document.getElementById("vmid");
  var selectedOption = vmSelect.options[vmSelect.selectedIndex];
  if (selectedOption && selectedOption.text) {
    // Extract SubGroup ID from text like "vm-id (subgroup-id)"
    var match = selectedOption.text.match(/\(([^)]+)\)$/);
    if (match) {
      return match[1];
    }
  }
  return "";
}

function updateResourceList(resourceType) {
  var selectElement = document.getElementById(resourceType);
  var previousSelection = selectElement.value;
  var i,
    L = selectElement.options.length - 1;
  for (i = L; i >= 0; i--) {
    selectElement.remove(i);
  }

  var config = getConfig(); var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = namespaceElement.value;

  if (namespace && namespace != "" && resourceType && resourceType != "") {
    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/resources/${resourceType}?option=id`;

    axios({
      method: "get",
      url: url,
      auth: {
        username: `${username}`,
        password: `${password}`,
      },
    }).then((res) => {
      if (res.data.output != null) {
        for (let item of res.data.output) {
          if (item && item.trim() !== "") {
            var option = document.createElement("option");
            option.value = item;
            option.text = item;
            document.getElementById(resourceType).appendChild(option);
          }
        }
        for (let i = 0; i < selectElement.options.length; i++) {
          if (selectElement.options[i].value == previousSelection) {
            selectElement.options[i].selected = true;
            break;
          }
        }
      }
    });
  }
}

// Initialize DOM event handlers when document is ready
document.addEventListener('DOMContentLoaded', function() {
  // Initialize map's Last Updated display
  initializeMapLastUpdated();
  
  // Initialize map's Connection Status
  updateMapConnectionStatus('unknown');
  
  // Initialize provider dropdown text
  updateProviderDropdownText();
  
  // Namespace event handlers
  const namespaceElement = document.getElementById("namespace");
  if (namespaceElement) {
    namespaceElement.onmouseover = function () {
      updateNsList();
    };
    namespaceElement.onchange = function () {
      syncNamespaceSelection(this.value);
      updateMciList();
    };
  }
  
  const namespaceControlElement = document.getElementById("namespace-control");
  if (namespaceControlElement) {
    namespaceControlElement.onmouseover = function () {
      updateNsList();
    };
    namespaceControlElement.onchange = function () {
      syncNamespaceSelection(this.value);
      updateMciList();
    };
  }
  
  // Resource list event handlers
  const vNetElement = document.getElementById(typeStringVNet);
  if (vNetElement) {
    vNetElement.onmouseover = function () {
      updateResourceList(typeStringVNet);
    };
  }
  
  const securityGroupElement = document.getElementById(typeStringSG);
  if (securityGroupElement) {
    securityGroupElement.onmouseover = function () {
      updateResourceList(typeStringSG);
    };
  }
  
  const sshKeyElement = document.getElementById(typeStringSshKey);
  if (sshKeyElement) {
    sshKeyElement.onmouseover = function () {
      updateResourceList(typeStringSshKey);
    };
  }
  
  // document.getElementById(typeStringImage).onmouseover = function () {
  //   //updateResourceList(typeStringImage);
  // };
  // document.getElementById(typeStringSpec).onmouseover = function () {
  //   //updateResourceList(typeStringSpec);
  // };
});

function updateConnectionList() {
  var selectElement = document.getElementById(typeStringConnection);
  var previousSelection = selectElement.value;
  var i,
    L = selectElement.options.length - 1;
  for (i = L; i >= 0; i--) {
    selectElement.remove(i);
  }

  var config = getConfig(); var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;

  var url = `http://${hostname}:${port}/tumblebug/connConfig?filterVerified=true&filterRegionRepresentative=true`;

  axios({
    method: "get",
    url: url,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
  }).then((res) => {
    if (res.data.connectionconfig != null) {
      for (let item of res.data.connectionconfig) {
        var option = document.createElement("option");
        option.value = item.configName;
        option.text = item.configName;
        //option.text = item.providerName + "/" + item.regionDetail.regionName;
        document.getElementById(typeStringConnection).appendChild(option);
      }
      for (let i = 0; i < selectElement.options.length; i++) {
        if (selectElement.options[i].value == previousSelection) {
          selectElement.options[i].selected = true;
          break;
        }
      }
    }
  }).catch(function (error) {
    console.log(error);
    //errorAlert("Failed to get connection list");
    if (error.response && error.response.data) {
      displayJsonData(error.response.data, typeError);
    }
  });
}

document.getElementById(typeStringConnection).onmouseover = function () {
  updateConnectionList();
};

function AddMcNLB() {
  var mciid = mciidElement.value;

  if (!mciid) {
    errorAlert("You need to specify the ID of MCI");
    return;
  }

  var config = getConfig(); var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = namespaceElement.value;

  if (!namespace) {
    errorAlert("Please select a namespace first");
    return;
  }

  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mci/${mciid}/mcSwNlb`;

  Swal.fire({
    title: "Configuration for Global NLB",
    width: 600,
    html:
      "<div style='text-align: left; margin: 20px;'>" +
      "<p><b>Global NLB Configuration:</b></p>" +
      "<p><b>Target MCI:</b> " + mciid + "</p>" +
      "<p><b>Protocol:</b> TCP</p>" +
      "<hr>" +
      "<p><b>Port (listen/target):</b></p>" +
      "</div>",
    input: "number",
    inputValue: 80,
    didOpen: () => {
      const input = Swal.getInput();
      if (input) {
        input.focus();
        input.select();
      }
    },
    inputAttributes: {
      autocapitalize: "off",
    },
    showCancelButton: true,
    confirmButtonText: "Create Global NLB",
    confirmButtonColor: "#28a745",
    position: "top-end",
    backdrop: `rgba(0, 0, 0, 0.08)`,
  }).then((result) => {
    if (result.value) {
      var nlbport = result.value;
      if (isNaN(nlbport) || nlbport <= 0) {
        nlbport = 80;
      }

      var spinnerId = addSpinnerTask("Creating Global NLB");

      var nlbReqTmp = {
        type: "PUBLIC",
        scope: "REGION",
        listener: {
          Protocol: "TCP",
          Port: `${nlbport}`,
        },
        targetGroup: {
          Protocol: "TCP",
          Port: `${nlbport}`,
        },
        HealthChecker: {
          Interval: "default",
          Timeout: "default",
          Threshold: "default",
        },
      };

      axios({
        method: "post",
        url: url,
        headers: { "Content-Type": "application/json" },
        data: JSON.stringify(nlbReqTmp, undefined, 4),
        auth: {
          username: `${username}`,
          password: `${password}`,
        },
      })
        .then((res) => {
          successAlert("Global NLB created successfully");
          getMci();
        })
        .catch(function (error) {
          errorAlert("Error creating Global NLB: " + (error.response?.data?.message || error.message));
        })
        .finally(function () {
          removeSpinnerTask(spinnerId);
        });
    }
  });
}
window.AddMcNLB = AddMcNLB;

function AddNLB() {
  var config = getConfig(); var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = namespaceElement.value;
  var mciid = mciidElement.value;

  if (!mciid) {
    errorAlert("You need to specify the ID of MCI");
    return;
  }

  if (!namespace) {
    errorAlert("Please select a namespace first");
    return;
  }

  // Load SubGroup list for selection
  var subGroupUrl = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mci/${mciid}/subgroup`;
  var spinnerId = addSpinnerTask("Loading SubGroup list");

  axios({
    method: "get",
    url: subGroupUrl,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
    timeout: 30000,
  })
    .then((res) => {
      var subGroupOptions = '';
      
      if (res.data.output && res.data.output.length > 0) {
        res.data.output.forEach((subGroupName) => {
          if (subGroupName && subGroupName.trim() !== "") {
            subGroupOptions += `<option value="${subGroupName}">${subGroupName}</option>`;
          }
        });

        // Show SubGroup selection dialog with port configuration
        Swal.fire({
          title: "Create Regional NLB",
          width: 600,
          html:
            "<div style='text-align: left; margin: 20px;'>" +
            "<p><b>Regional NLB Configuration:</b></p>" +
            "<p><b>Target MCI:</b> " + mciid + "</p>" +
            "<hr>" +
            "<div class='form-group' style='margin-bottom: 20px;'>" +
            "<label for='subgroup-select'><b>Available SubGroups:</b></label>" +
            "<select id='subgroup-select' class='form-control' style='margin-top: 10px;'>" +
            "<option value=''>-- Select SubGroup --</option>" +
            subGroupOptions +
            "</select>" +
            "</div>" +
            "<div class='form-group'>" +
            "<label for='nlb-port'><b>Port (listen/target):</b></label>" +
            "<input type='number' id='nlb-port' class='form-control' value='80' min='1' max='65535' style='margin-top: 10px;'>" +
            "<small class='form-text text-muted'>TCP protocol will be used</small>" +
            "</div>" +
            "</div>",
          showCancelButton: true,
          confirmButtonText: "Create Regional NLB",
          cancelButtonText: "Cancel",
          confirmButtonColor: "#17a2b8",
          position: "top-end",
          backdrop: `rgba(0, 0, 0, 0.08)`,
          didOpen: () => {
            // Focus on port input after dialog opens
            const portInput = document.getElementById('nlb-port');
            if (portInput) {
              portInput.focus();
              portInput.select();
            }
          },
          preConfirm: () => {
            const selectedSubGroup = document.getElementById('subgroup-select').value;
            const nlbPort = document.getElementById('nlb-port').value;
            
            if (!selectedSubGroup) {
              Swal.showValidationMessage('Please select a SubGroup');
              return false;
            }
            
            if (!nlbPort || isNaN(nlbPort) || nlbPort <= 0 || nlbPort > 65535) {
              Swal.showValidationMessage('Please enter a valid port number (1-65535)');
              return false;
            }
            
            return { subGroup: selectedSubGroup, port: parseInt(nlbPort) };
          }
        }).then((result) => {
          if (result.isConfirmed) {
            createRegionalNLB(mciid, result.value.subGroup, result.value.port, namespace, hostname, port, username, password);
          }
        });
      } else {
        errorAlert("No SubGroups found in the selected MCI");
      }
    })
    .catch(function (error) {
      errorAlert("Error loading SubGroups: " + (error.response?.data?.message || error.message));
    })
    .finally(function () {
      removeSpinnerTask(spinnerId);
    });
}

// Create Regional NLB with selected SubGroup and port
function createRegionalNLB(mciid, subgroupid, nlbport, namespace, hostname, port, username, password) {
  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mci/${mciid}/nlb`;

  var nlbReqTmp = {
    type: "PUBLIC",
    scope: "REGION",
    listener: {
      Protocol: "TCP",
      Port: `${nlbport}`,
    },
    targetGroup: {
      Protocol: "TCP",
      Port: `${nlbport}`,
      subGroupId: `${subgroupid}`,
    },
    HealthChecker: {
      Interval: "default",
      Timeout: "default",
      Threshold: "default",
    },
  };

  var spinnerId = addSpinnerTask("Creating Regional NLB");
  
  axios({
    method: "post",
    url: url,
    headers: { "Content-Type": "application/json" },
    data: JSON.stringify(nlbReqTmp, undefined, 4),
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
  })
    .then((res) => {
      successAlert("Regional NLB created successfully");
      getMci();
    })
    .catch(function (error) {
      errorAlert("Error creating Regional NLB: " + (error.response?.data?.message || error.message));
    })
    .finally(function () {
      removeSpinnerTask(spinnerId);
    });
}

window.AddNLB = AddNLB;

function DelNLB() {
  var config = getConfig(); var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = namespaceElement.value;
  var mciid = mciidElement.value;

  if (!mciid) {
    errorAlert("You need to specify the ID of MCI");
    return;
  }

  if (!namespace) {
    errorAlert("Please select a namespace first");
    return;
  }

  // Load SubGroup list for selection
  var subGroupUrl = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mci/${mciid}/subgroup`;
  var spinnerId = addSpinnerTask("Loading SubGroup list");

  axios({
    method: "get",
    url: subGroupUrl,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
    timeout: 30000,
  })
    .then((res) => {
      var subGroupOptions = '';
      
      if (res.data.output && res.data.output.length > 0) {
        res.data.output.forEach((subGroupName) => {
          if (subGroupName && subGroupName.trim() !== "") {
            subGroupOptions += `<option value="${subGroupName}">${subGroupName}</option>`;
          }
        });

        // Show SubGroup selection dialog with deletion confirmation
        Swal.fire({
          title: "Delete Regional NLB",
          width: 600,
          html:
            "<div style='text-align: left; margin: 20px;'>" +
            "<p><b>⚠️ Warning:</b> This action cannot be undone.</p>" +
            "<p><b>Target MCI:</b> " + mciid + "</p>" +
            "<hr>" +
            "<div class='form-group' style='margin-bottom: 20px;'>" +
            "<label for='subgroup-select'><b>Select SubGroup to Delete NLB:</b></label>" +
            "<select id='subgroup-select' class='form-control' style='margin-top: 10px;'>" +
            "<option value=''>-- Select SubGroup --</option>" +
            subGroupOptions +
            "</select>" +
            "</div>" +
            "<div class='alert alert-danger' style='margin-top: 15px; padding: 10px; border-radius: 5px;'>" +
            "<strong>Confirmation:</strong> The Regional NLB for the selected SubGroup will be permanently deleted." +
            "</div>" +
            "</div>",
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: "Delete Regional NLB",
          cancelButtonText: "Cancel",
          confirmButtonColor: "#dc3545",
          position: "top-end",
          backdrop: `rgba(0, 0, 0, 0.08)`,
          preConfirm: () => {
            const selectedSubGroup = document.getElementById('subgroup-select').value;
            if (!selectedSubGroup) {
              Swal.showValidationMessage('Please select a SubGroup');
              return false;
            }
            return selectedSubGroup;
          }
        }).then((result) => {
          if (result.isConfirmed) {
            deleteRegionalNLB(mciid, result.value, namespace, hostname, port, username, password);
          }
        });
      } else {
        errorAlert("No SubGroups found in the selected MCI");
      }
    })
    .catch(function (error) {
      errorAlert("Error loading SubGroups: " + (error.response?.data?.message || error.message));
    })
    .finally(function () {
      removeSpinnerTask(spinnerId);
    });
}

// Show deletion confirmation dialog after SubGroup selection
// Separate function to handle the actual deletion
function deleteRegionalNLB(mciid, subgroupid, namespace, hostname, port, username, password) {
  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mci/${mciid}/nlb/${subgroupid}`;
  var spinnerId = addSpinnerTask("Deleting Regional NLB");
  
  axios({
    method: "delete",
    url: url,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
  })
    .then((res) => {
      successAlert("Regional NLB deleted successfully");
      getMci();
    })
    .catch(function (error) {
      errorAlert("Error deleting Regional NLB: " + (error.response?.data?.message || error.message));
    })
    .finally(function () {
      removeSpinnerTask(spinnerId);
    });
}
window.DelNLB = DelNLB;

// Unified NLB Management function
function manageNLB() {
  Swal.fire({
    title: '⚖️ NLB Management',
    html: `
      <div style="text-align: left; margin-bottom: 20px;">
        <p><strong>Select NLB Operation:</strong></p>
      </div>
      <div style="display: grid; grid-template-columns: 1fr; gap: 10px; margin-top: 15px;">
        <button onclick="executeNLBAction('addGlobal')" class="btn btn-success btn-context" style="width: 100%; padding: 12px;">
          🌍 Add Global-NLB (Multi-Cloud SW NLB)
        </button>
        <button onclick="executeNLBAction('addRegional')" class="btn btn-info btn-context" style="width: 100%; padding: 12px;">
          🏗️ Add Regional-NLB (CSP NLB)
        </button>
        <button onclick="executeNLBAction('delete')" class="btn btn-danger btn-context" style="width: 100%; padding: 12px;">
          🗑️ Delete Regional-NLB
        </button>
      </div>
    `,
    showConfirmButton: false,
    showCancelButton: true,
    cancelButtonText: '❌ Close',
    width: '500px',
    customClass: {
      popup: 'swal2-mci-context'
    }
  });
}
window.manageNLB = manageNLB;

// Function to execute selected NLB action and close SweetAlert
function executeNLBAction(action) {
  Swal.close(); // Close the current SweetAlert
  
  switch(action) {
    case 'addGlobal':
      AddMcNLB();
      break;
    case 'addRegional':
      AddNLB();
      break;
    case 'delete':
      DelNLB();
      break;
    default:
      console.log('Unknown NLB action:', action);
  }
}
window.executeNLBAction = executeNLBAction;
window.manageNLB = manageNLB;

// function for sleep
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

var defaultRemoteCommand = [];
defaultRemoteCommand.push("hostname -I");
defaultRemoteCommand.push("echo $SSH_CLIENT");
defaultRemoteCommand.push("");

/**
 * Sets default remote commands based on application type
 * 
 * @param {string} appName - The name of the application to configure commands for
 * @returns {void} - Modifies the defaultRemoteCommand array directly
 */
function setDefaultRemoteCommandsByApp(appName) {
  switch (appName) {
    case "Xonotic":
      defaultRemoteCommand[0] = "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/xonotic/startServer.sh; chmod +x ~/startServer.sh";
      defaultRemoteCommand[1] = "sudo ~/startServer.sh " + "Cloud-Barista-$$Func(GetMciId())" + " 26000" + " 8" + " 8";
      defaultRemoteCommand[2] = "echo '$$Func(GetPublicIP(target=this,postfix=:26000))'";
      break;
    case "ELK":
      defaultRemoteCommand[0] = "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/elastic-stack/startELK.sh";
      defaultRemoteCommand[1] = "chmod +x ~/startServer.sh";
      defaultRemoteCommand[2] = "sudo ~/startServer.sh ";
      break;
    case "vLLM":
      defaultRemoteCommand[0] = "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/llm/llmServer.py";
      defaultRemoteCommand[1] = "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/llm/startServer.sh; chmod +x ~/startServer.sh";
      defaultRemoteCommand[2] = "~/startServer.sh " + "--ip " + "$$Func(GetPublicIPs(separator=' '))" + " --port 5000" + " --token 1024" + " --model tiiuae/falcon-7b-instruct";
      break;
    case "Nvidia":
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/llm/installCudaDriver.sh | sh";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "Nvidia-Status":
      defaultRemoteCommand[0] = "nvidia-smi";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "Setup-CrossNAT":
      defaultRemoteCommand[0] = "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/setup-cross-cloud-nat.sh";
      defaultRemoteCommand[1] = "chmod +x ~/setup-cross-cloud-nat.sh";
      defaultRemoteCommand[2] = "~/setup-cross-cloud-nat.sh pub=$$Func(GetPublicIPs(target=this)) priv=$$Func(GetPrivateIPs(target=this))";
      break;
    case "Ollama":
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/llm/deployOllama.sh | sh";
      defaultRemoteCommand[1] = "echo '$$Func(GetPublicIP(target=this, prefix=http://, postfix=:3000))'";
      defaultRemoteCommand[2] = "";
      break;
    case "OllamaPull":
      defaultRemoteCommand[0] = "OLLAMA_HOST=0.0.0.0:3000 ollama pull $$Func(AssignTask(task='deepseek-r1, gemma3n, gemma3, qwen3, llama3.3, mistral, phi4-reasoning'))";
      defaultRemoteCommand[1] = "echo '$$Func(GetPublicIP(target=this, prefix=http://, postfix=:3000))'";
      defaultRemoteCommand[2] = "OLLAMA_HOST=0.0.0.0:3000 ollama list";
      break;
    case "OpenWebUI":
      defaultRemoteCommand[0] = "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/llm/deployOpenWebUI.sh; chmod +x ~/deployOpenWebUI.sh";
      defaultRemoteCommand[1] = "sudo ~/deployOpenWebUI.sh \"$$Func(GetPublicIPs(target=this, separator=;, prefix=http://, postfix=:3000))\"";
      defaultRemoteCommand[2] = "echo '$$Func(GetPublicIP(target=this, prefix=http://))'";
      break;
    case "RayHead-Deploy":
      defaultRemoteCommand[0] = "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/ray/ray-head-setup.sh";
      defaultRemoteCommand[1] = "chmod +x ~/ray-head-setup.sh";
      defaultRemoteCommand[2] = "~/ray-head-setup.sh -i $$Func(GetPublicIP(target=this))";
      break;
    case "RayWorker-Deploy":
      defaultRemoteCommand[0] = "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/ray/ray-worker-setup.sh";
      defaultRemoteCommand[1] = "chmod +x ~/ray-worker-setup.sh";
      defaultRemoteCommand[2] = "~/ray-worker-setup.sh -i $$Func(GetPublicIP(target=this)) -h $$Func(GetPublicIP(target=mc-ray.g1-1))";
      break;
    case "Westward":
      defaultRemoteCommand[0] = "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/setgame.sh";
      defaultRemoteCommand[1] = "chmod +x ~/setgame.sh; sudo ~/setgame.sh";
      defaultRemoteCommand[2] = "";
      break;
    case "WeaveScope":
      defaultRemoteCommand[0] = "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/weavescope/startServer.sh";
      defaultRemoteCommand[1] = "chmod +x ~/startServer.sh";
      defaultRemoteCommand[2] = "sudo ~/startServer.sh " + "$$Func(GetPublicIPs(separator=' '))" + " " + "$$Func(GetPrivateIPs(separator=' '))";
      break;
    case "Nginx":
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/nginx/startServer.sh | bash -s -- --ip $$Func(GetPublicIP(target=this))";
      defaultRemoteCommand[1] = "echo '$$Func(GetPublicIP(target=this, prefix=http://))'";
      defaultRemoteCommand[2] = "";
      break;
    case "Jitsi":
      defaultRemoteCommand[0] = "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/jitsi/startServer.sh";
      defaultRemoteCommand[1] = "chmod +x ~/startServer.sh";
      defaultRemoteCommand[2] = "sudo ~/startServer.sh " + "$$Func(GetPublicIPs(separator=' '))" + " " + "DNS EMAIL";
      break;
    case "Stress":
      defaultRemoteCommand[0] = "sudo apt install -y stress > /dev/null; stress -c 16 -t 60";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    default:
      defaultRemoteCommand[0] = "ls -al";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
  }
}


// function for startApp by startApp button item
function startApp() {
  var mciid = mciidElement.value;
  if (mciid) {
    setDefaultRemoteCommandsByApp(selectApp.value);
    executeRemoteCmd();
  } else {
    console.log(" MCI ID is not assigned");
  }
}
window.startApp = startApp;

// function for stopApp by stopApp button item
function stopApp() {
  var mciid = mciidElement.value;
  if (mciid) {
    console.log(" Stopping " + selectApp.value);

    var config = getConfig(); var hostname = config.hostname;
    var port = config.port;
    var username = config.username;
    var password = config.password;
    var namespace = namespaceElement.value;

    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/cmd/mci/${mciid}`;
    var cmd = [];
    if (selectApp.value == "Xonotic") {
      cmd.push(
        "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/xonotic/stopServer.sh"
      );
      cmd.push("chmod +x ~/stopServer.sh");
      cmd.push("sudo ~/stopServer.sh");
    } else if (selectApp.value == "ELK") {
      cmd.push(
        "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/elastic-stack/stopELK.sh"
      );
      cmd.push("chmod +x ~/stopELK.sh");
      cmd.push("sudo ~/stopELK.sh");
    } else if (selectApp.value == "Westward") {
      cmd.push(
        "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/xonotic/stopServer.sh"
      );
      cmd.push("chmod +x ~/stopServer.sh");
      cmd.push("sudo ~/stopServer.sh");
    } else if (selectApp.value == "Nginx") {
      cmd.push(
        "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/xonotic/stopServer.sh"
      );
      cmd.push("chmod +x ~/stopServer.sh");
      cmd.push("sudo ~/stopServer.sh");
    } else if (selectApp.value == "Jitsi") {
      cmd.push(
        "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/xonotic/stopServer.sh"
      );
      cmd.push("chmod +x ~/stopServer.sh");
      cmd.push("sudo ~/stopServer.sh");
    } else {
      cmd.push("ls -al");
    }

    var commandReqTmp = {
      command: cmd,
    };
    var jsonBody = JSON.stringify(commandReqTmp, undefined, 4);

    axios({
      method: "post",
      url: url,
      headers: { "Content-Type": "application/json" },
      data: jsonBody,
      auth: {
        username: `${username}`,
        password: `${password}`,
      },
    }).then((res) => {
      console.log(res); // for debug

      console.log("[Complete: Stopping App]\n");
      displayJsonData(res.data, typeInfo);
    });
  } else {
    console.log(" MCI ID is not assigned");
  }
}
window.stopApp = stopApp;

// function for statusApp by statusApp button item
function statusApp() {
  var config = getConfig(); var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = namespaceElement.value;
  var mciid = mciidElement.value;

  if (mciid) {
    console.log(" Getting status " + selectApp.value);

    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/cmd/mci/${mciid}`;
    var cmd = [];
    if (selectApp.value == "Xonotic") {
      cmd.push(
        "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/xonotic/statusServer.sh -O ~/statusServer.sh"
      );
      cmd.push("chmod +x ~/statusServer.sh");
      cmd.push("sudo ~/statusServer.sh");
    } else if (selectApp.value == "Westward") {
      cmd.push(
        "wget wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/setgame.sh -O ~/setgame.sh"
      );
      cmd.push("chmod +x ~/setgame.sh");
      cmd.push("sudo ~/setgame.sh");
    } else if (selectApp.value == "Nvidia") {
      cmd.push("nvidia-smi");
      cmd.push("");
      cmd.push("");
    } else if (selectApp.value == "Nginx") {
      cmd.push(
        "wget wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/setweb.sh -O ~/setweb.sh"
      );
      cmd.push("chmod +x ~/setweb.sh");
      cmd.push("sudo ~/setweb.sh");
    } else if (selectApp.value == "Jitsi") {
      cmd.push(
        "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/jitsi/statusServer.sh -O ~/statusServer.sh"
      );
      cmd.push("chmod +x ~/statusServer.sh");
      cmd.push("sudo ~/statusServer.sh");
    } else if (selectApp.value == "ELK") {
      cmd.push(
        "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/elastic-stack/statusELK.sh -O ~/statusServer.sh"
      );
      cmd.push("chmod +x ~/statusServer.sh");
      cmd.push("sudo ~/statusServer.sh");
    } else {
      cmd.push("ls -al");
    }

    var commandReqTmp = {
      command: cmd,
    };
    var jsonBody = JSON.stringify(commandReqTmp, undefined, 4);

    axios({
      method: "post",
      url: url,
      headers: { "Content-Type": "application/json" },
      data: jsonBody,
      auth: {
        username: `${username}`,
        password: `${password}`,
      },
    }).then((res) => {
      console.log(res); // for debug

      console.log("[Complete: Getting App status]\n");
      displayJsonData(res.data, typeInfo);
    });
  } else {
    console.log(" MCI ID is not assigned");
  }
}
window.statusApp = statusApp;

// loadPredefinedScript function for loading predefined script
window.loadPredefinedScript = function () {
  const scriptTypeSelect = document.getElementById("predefinedScripts");
  if (!scriptTypeSelect) return;

  const scriptType = scriptTypeSelect.value;
  console.log("Loading predefined script:", scriptType);

  if (scriptType) {
    setDefaultRemoteCommandsByApp(scriptType);
    console.log("Updated defaultRemoteCommand:", defaultRemoteCommand);

    // update the command fields
    for (let i = 0; i < defaultRemoteCommand.length; i++) {
      const cmdField = document.getElementById(`cmd${i + 1}`);
      if (cmdField) {
        cmdField.value = defaultRemoteCommand[i] || "";
        console.log(`Set cmd${i + 1} to:`, cmdField.value);
      }
    }
  }
};


function executeRemoteCmd() {
  var config = getConfig(); var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = namespaceElement.value;
  var mciid = mciidElement.value;
  var subgroupid = getSubGroupIdFromVmSelection();
  var vmid = document.getElementById("vmid").value;

  let cmdCount = 3; // Initial number of textboxes

  if (mciid) {
    var spinnerId = "";

    console.log(
      "Forward remote ssh command to MCI:" + mciid
    );

    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/cmd/mci/${mciid}`;
    var cmd = [];

    Swal.fire({
      title: "<font size=5><b>Put multiple commands to forward</b></font>",
      width: 900,
      html: `
      <div id="dynamicContainer" style="text-align: left;">
        <p><font size=4><b>[Commands]</b></font></p>
        <div id="cmdContainer" style="margin-bottom: 20px;">
          <div id="cmdDiv1" class="cmdRow">
            Command 1: <input type="text" id="cmd1" style="width: 75%" value="${defaultRemoteCommand[0]}">
            <button onclick="document.getElementById('cmd1').value = ''">Clear</button>
          </div>
          <div id="cmdDiv2" class="cmdRow">
            Command 2: <input type="text" id="cmd2" style="width: 75%" value="${defaultRemoteCommand[1]}">
            <button onclick="document.getElementById('cmd2').value = ''">Clear</button>
          </div>
          <div id="cmdDiv3" class="cmdRow">
            Command 3: <input type="text" id="cmd3" style="width: 75%" value="${defaultRemoteCommand[2]}">
            <button onclick="document.getElementById('cmd3').value = ''">Clear</button>
          </div>
          <button id="addCmd" onclick="addCmd()" style="margin-left: 1px;"> + </button>
        </div>

        <p><font size=4><b>[Predefined Scripts]</b></font></p>
        <div style="margin-bottom: 15px;">
          <select id="predefinedScripts" style="width: 75%; padding: 5px;" onchange="loadPredefinedScript()">
            <option value="">-- Select a predefined script --</option>
            <option value="Nvidia">[GPU Driver] Nvidia CUDA Driver</option>
            <option value="Nvidia-Status">[GPU Driver] Check Nvidia CUDA Driver</option>
            <option value="Setup-CrossNAT">[Network Config] Setup Cross NAT</option>
            <option value="vLLM">[LLM vLLM] vLLM Server</option>
            <option value="Ollama">[LLM Ollama] Ollama LLM Server</option>
            <option value="OllamaPull">[LLM Model] Ollama Model Pull</option>
            <option value="OpenWebUI">[LLM WebUI] Open WebUI for Ollama</option>
            <option value="RayHead-Deploy">[ML Ray] Deploy Ray Cluster (Head)</option>
            <option value="RayWorker-Deploy">[ML Ray] Deploy Ray Cluster (Worker)</option>
            <option value="WeaveScope">[Observability] Weave Scope</option>
            <option value="ELK">[Observability] ELK Stack</option>
            <option value="Jitsi">[Video Conference] Jitsi Meet</option>
            <option value="Xonotic">[Game:FPS] Xonotic Game Server</option>
            <option value="Westward">[Game:MMORPG] Westward Game</option>
            <option value="Nginx">[Web:Server] Nginx Web Server</option>
            <option value="Stress">[Web:Stress] Stress Test</option>
          </select>
          <div style="font-size: 0.8em; color: #666; margin-top: 3px;">
            Select a predefined script to auto-fill the command fields
          </div>
        </div>

        <p><font size=4><b>[Select target]</b></font></p>
        <div style="display: flex; align-items: center;">
          <div style="margin-right: 10px;">
            <input type="radio" id="mciOption" name="selectOption" value="MCI" checked>
            <label for="mciOption">MCI: <span style="color:blue;">${mciid}</span></label>
          </div>
          <div style="margin-right: 10px;">
            <input type="radio" id="subGroupOption" name="selectOption" value="SubGroup">
            <label for="subGroupOption">SUBGROUP: <span style="color:green;">${subgroupid}</span></label>
          </div>
          <div>
            <input type="radio" id="vmOption" name="selectOption" value="VM">
            <label for="vmOption">VM: <span style="color:red;">${vmid}</span></label>
          </div>
        </div>

        <p><font size=4><b>[Label Selector]</b></font></p>
        <div style="margin-bottom: 15px;">
          <input type="text" id="labelSelector" style="width: 75%" placeholder="ex: role=worker,env=production">
          <div style="font-size: 0.8em; color: #666; margin-top: 3px;">
            ex: Optional: set targets by the label (ex: role=worker,env=production,sys.id=g1-2)
          </div>
        </div>

      </div>`,
      showCancelButton: true,
      confirmButtonText: "Execute",
      didOpen: () => {
        // Function to add additional textbox
        window.addCmd = () => {
          cmdCount++;
          const newCmd = document.createElement("div");
          newCmd.id = `cmdDiv${cmdCount}`;
          newCmd.className = "cmdRow"; // class for each command row
          newCmd.innerHTML = `Command ${cmdCount}: <input type="text" id="cmd${cmdCount}" style="width: 75%">
                              <button onclick="document.getElementById('cmd${cmdCount}').value = ''">Clear</button>`;
          document.getElementById("cmdContainer").appendChild(newCmd);

          // Move the addCmd button to be next to the last command's Clear button
          const lastCmd = document.getElementById(`cmdDiv${cmdCount}`);
          lastCmd.appendChild(document.getElementById("addCmd"));
        };

        // Use predefined script dropdown to load default commands
        const scriptSelect = document.getElementById('predefinedScripts');
        if (scriptSelect) {
          scriptSelect.removeEventListener('change', window.loadPredefinedScript);
          scriptSelect.addEventListener('change', window.loadPredefinedScript);
          if (scriptSelect.value) {
            window.loadPredefinedScript();
          }
        }

      },
      preConfirm: () => {
        // Collect commands from textboxes
        const commands = [];
        for (let i = 1; i <= cmdCount; i++) {
          const cmd = document.getElementById("cmd" + i).value;
          defaultRemoteCommand[i - 1] = cmd;
          if (cmd) {
            commands.push(cmd);
          }
        }
        return commands;
      },
    }).then((result) => {
      // result.value is false if result.isDenied or another key such as result.isDismissed
      if (result.value) {
        // Handle radio button value
        const radioValue = Swal.getPopup().querySelector(
          'input[name="selectOption"]:checked'
        ).value;
        if (radioValue === "MCI") {
          var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/cmd/mci/${mciid}`;
          console.log("Performing tasks for MCI");
        } else if (radioValue === "SubGroup") {
          var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/cmd/mci/${mciid}?subGroupId=${subgroupid}`;
          console.log("Performing tasks for SubGroup");
        } else if (radioValue === "VM") {
          var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/cmd/mci/${mciid}?vmId=${vmid}`;
          console.log("Performing tasks for VM");
        }

        // Get label selector value and add to URL if provided
        const labelSelector = Swal.getPopup().querySelector('#labelSelector').value;
        if (labelSelector && labelSelector.trim() !== '') {
          url += (url.includes('?') ? '&' : '?') + `labelSelector=${encodeURIComponent(labelSelector)}`;
          console.log("Added labelSelector:", labelSelector);
        }

        cmd = result.value;
        console.log(cmd.join(", "));

        var commandReqTmp = {
          command: cmd,
        };

        var jsonBody = JSON.stringify(commandReqTmp, undefined, 4);

        spinnerId = addSpinnerTask("Remote command to " + mciid);

        var requestId = generateRandomRequestId("cmd-" + mciid + "-", 10);
        addRequestIdToSelect(requestId);

        axios({
          method: "post",
          url: url,
          headers: { "Content-Type": "application/json", "x-request-id": requestId },
          data: jsonBody,
          auth: {
            username: `${username}`,
            password: `${password}`,
          },
        }).then((res) => {
          console.log(res); // for debug
          displayJsonData(res.data, typeInfo);
          let formattedOutput = "[Complete: remote ssh command to MCI]\n\n";

          res.data.results.forEach((result) => {
            formattedOutput += `### MCI ID: ${result.mciId} | IP: ${result.vmId} | IP: ${result.vmIp} ###\n`;

            Object.keys(result.command).forEach((key) => {
              formattedOutput += `\nCommand: ${result.command[key]}`;

              if (result.stdout[key].trim()) {
                formattedOutput += `\nOutput:\n${result.stdout[key]}`;
              }

              if (result.stderr[key].trim()) {
                formattedOutput += `\nError:\n${result.stderr[key]}`;
              }
            });

            formattedOutput += "\n--------------------------------------\n";
          });

          console.log(formattedOutput);
        })
          .catch(function (error) {
            if (error.response) {
              // status code is not 2xx
              console.log(error.response.data);
              console.log(error.response.status);
              console.log(error.response.headers);
            } else {
              console.log("Error", error.message);
            }
            console.log(error.config);

            errorAlert(
              JSON.stringify(error.response.data, null, 2).replace(
                /['",]+/g,
                ""
              )
            );
          })
          .finally(function () {
            removeSpinnerTask(spinnerId);
          });

      } else {
        console.log("Cannot set command");
        removeSpinnerTask(spinnerId);
      }
    });
  } else {
    errorAlert("MCI ID is not assigned");
    console.log(" MCI ID is not assigned");
  }
}
window.executeRemoteCmd = executeRemoteCmd;

// Function for transferFileToMci by remoteCmd button item
function transferFileToMci() {
  var config = getConfig(); var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = namespaceElement.value;
  var mciid = mciidElement.value;
  var subgroupid = getSubGroupIdFromVmSelection();
  var vmid = document.getElementById("vmid").value;

  if (mciid) {
    console.log("[Transfer file to MCI:" + mciid + "]\n");

    // Swal popup for selecting file and target path
    Swal.fire({
      title: "<font size=5><b>Transfer File to MCI</b></font>",
      width: 900,
      html:
        `<div style="text-align: left; padding: 10px;">
        <p><font size=4><b>Select File to Transfer</b></font></p>
        <div style="display: flex; justify-content: flex-start; margin-bottom: 20px;">
            <input type="file" id="fileInput" style="width: 300px; padding: 5px;" />
        </div>

        <p><font size=4><b>File Path on VM (existing path only)</b></font></p>
        <div style="display: flex; justify-content: flex-start; margin-bottom: 20px;">
            <input type="text" id="targetPathInput" style="width: 80%; padding: 5px;" value="/home/cb-user/" placeholder="/home/cb-user/">
        </div>

        <p style="text-align: left;"><font size=4><b>Select Target Group</b></font></p>
        <div style="display: flex; flex-direction: row; align-items: center; justify-content: flex-start; gap: 20px; margin-bottom: 10px;">
            <div>
                <input type="radio" id="mciOption" name="selectOption" value="MCI" checked>
                <label for="mciOption">MCI: <span style="color:blue;">${mciid}</span></label>
            </div>
            <div>
                <input type="radio" id="subGroupOption" name="selectOption" value="SubGroup">
                <label for="subGroupOption">SUBGROUP: <span style="color:green;">${subgroupid}</span></label>
            </div>
            <div>
                <input type="radio" id="vmOption" name="selectOption" value="VM">
                <label for="vmOption">VM: <span style="color:red;">${vmid}</span></label>
            </div>
        </div>
        </div>`,
      showCancelButton: true,
      confirmButtonText: "Transfer",
      didOpen: () => {
        document.getElementById("fileInput").addEventListener("change", function (e) {
          console.log("File selected:", e.target.files[0]);
        });
      },
      preConfirm: () => {
        // Get the file and target path from the input fields
        const fileInput = document.getElementById("fileInput");
        const targetPath = document.getElementById("targetPathInput").value;

        // Check if a file is selected
        if (!fileInput.files[0]) {
          Swal.showValidationMessage("Please select a file to transfer.");
          return false;
        }

        // Return the file and targetPath
        return {
          file: fileInput.files[0],
          targetPath: targetPath,
        };
      },
    }).then((result) => {
      if (result.value) {
        const file = result.value.file;
        const targetPath = result.value.targetPath;

        // Handle radio button value
        const radioValue = Swal.getPopup().querySelector('input[name="selectOption"]:checked').value;
        let url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/transferFile/mci/${mciid}`;
        if (radioValue === "SubGroup") {
          url += `?subGroupId=${subgroupid}`;
        } else if (radioValue === "VM") {
          url += `?vmId=${vmid}`;
        }

        // Prepare the formData to transfer the file
        var formData = new FormData();
        formData.append("file", file);
        formData.append("path", targetPath);

        // Show loading spinner
        Swal.fire({
          title: 'Transferring...',
          html: `Transferring ${file.name} to ${targetPath}...`,
          allowOutsideClick: false,
          didOpen: () => {
            Swal.showLoading();
          },
        });

        axios({
          method: "post",
          url: url,
          headers: {
            "Authorization": `Basic ${btoa(`${username}:${password}`)}`, // Basic Auth
            "Content-Type": "multipart/form-data",
          },
          data: formData,
        })
          .then((res) => {
            // Success message
            Swal.fire({
              icon: 'success',
              title: 'File transferred',
              text: `The file "${file.name}" was transferred successfully.`,
            });
            console.log(`[Complete: File transfer to MCI ${mciid}]\n`);
            displayJsonData(res.data, typeInfo);
          })
          .catch((error) => {
            // Error message
            console.error("File transfer error:", error);
            errorAlert(
              JSON.stringify(error.response.data, null, 2).replace(
                /['",]+/g,
                ""
              )
            );
          })
          .finally(() => {
            Swal.hideLoading();
          });
      } else {
        console.log("File transfer was canceled.");
      }
    });
  } else {
    errorAlert("MCI ID is not assigned");
    console.log("MCI ID is not assigned.");
  }
}
window.transferFileToMci = transferFileToMci;

// function for getAccessInfo of MCI
function getAccessInfo() {
  var config = getConfig(); var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = namespaceElement.value;
  var mciid = mciidElement.value;

  if (mciid) {
    console.log(
      "Retrieve access information for MCI:" + mciid
    );

    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mci/${mciid}?option=accessinfo`;

    axios({
      method: "get",
      url: url,
      auth: {
        username: `${username}`,
        password: `${password}`,
      },
    }).then((res) => {
      console.log(res); // for debug
      displayJsonData(res.data, typeInfo);
    });
  } else {
    console.log(" MCI ID is not assigned");
  }
}
window.getAccessInfo = getAccessInfo;


// SSH Key save function
const saveBtn = document.querySelector(".save-file");
saveBtn.addEventListener("click", function () {
  console.log(" [Retrieve MCI Access Information ...]\n");

  var config = getConfig(); var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = namespaceElement.value;
  var mciid = mciidElement.value;
  var groupid = getSubGroupIdFromVmSelection();
  var vmid = document.getElementById("vmid").value;

  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mci/${mciid}?option=accessinfo&accessInfoOption=showSshKey`;

  axios({
    method: "get",
    url: url,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
  }).then((res) => {
    console.log(res); // for debug
    displayJsonData(res.data, typeInfo);
    var privateKey = "";

    for (let subGroupAccessInfo of res.data.MciSubGroupAccessInfo) {
      if (subGroupAccessInfo.SubGroupId == groupid) {
        for (let vmAccessInfo of subGroupAccessInfo.MciVmAccessInfo) {
          if (vmAccessInfo.vmId == vmid) {
            privateKey = vmAccessInfo.privateKey.replace(/['",]+/g, "");
            break;
          }
        }
      }
    }

    var tempLink = document.createElement("a");
    var taBlob = new Blob([privateKey], { type: "text/plain" });

    tempLink.setAttribute("href", URL.createObjectURL(taBlob));
    tempLink.setAttribute("download", `${namespace}-${mciid}-${vmid}.pem`);
    tempLink.click();

    URL.revokeObjectURL(tempLink.href);
  });
});

// Global array to store X-Request-Ids
let xRequestIds = [];

// Function to handle Axios response and extract X-Request-Id
function handleAxiosResponse(response) {
  // Extract X-Request-Id from the response headers
  console.log("Response Headers:", response.headers);
  const requestId = response.headers["x-request-id"];
  console.log("X-Request-Id:", requestId);
  if (requestId) {
    addRequestIdToSelect(requestId);
  }
}

// Function to add X-Request-Id to the select element
function addRequestIdToSelect(requestId) {
  // Add X-Request-Id to the global array if it's not already present
  if (!xRequestIds.includes(requestId)) {
    xRequestIds.push(requestId);
    const select = document.getElementById("xRequestIdSelect");
    const option = document.createElement("option");
    option.value = requestId;
    option.text = requestId;
    select.appendChild(option);
  }
}

// Function to generate a random X-Request-Id with a prefix and specified total length
function generateRandomRequestId(prefix, totalLength) {
  const characters = '0123456789';
  let result = prefix;
  const charactersLength = characters.length;
  const randomPartLength = totalLength;
  for (let i = 0; i < randomPartLength; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

// Function to handle selection of an X-Request-Id
function handleRequestIdSelection() {
  const select = document.getElementById("xRequestIdSelect");
  const selectedRequestId = select.value;
  console.log("Selected X-Request-Id:", selectedRequestId);

  // actions based on the selected X-Request-Id

  if (selectedRequestId) {
    var config = getConfig(); var hostname = config.hostname;
    var port = config.port;
    var username = config.username;
    var password = config.password;

    var url = `http://${hostname}:${port}/tumblebug/request/${selectedRequestId}`;

    axios({
      method: "get",
      url: url,
      auth: {
        username: `${username}`,
        password: `${password}`,
      },
    }).then((res) => {
      console.log(res); // for debug
      displayJsonData(res.data, typeInfo);
    });
  } else {
    console.log("No X-Request-Id selected");
  }
}
window.handleRequestIdSelection = handleRequestIdSelection;

window.onload = function () {
  // Get host address and update configuration
  var tbServerAp = window.location.host;
  var strArray = tbServerAp.split(":");
  console.log("Host address: " + strArray[0]);
  configHostname = strArray[0];
  setTimeout(getConnection, 1000);

  updateNsList();

  getMci();

  // Add event listener for Provision tab to show map when clicked
  const provisionTab = document.getElementById('provision-tab');
  if (provisionTab) {
    provisionTab.addEventListener('click', function(e) {
      console.log('Provision tab clicked, switching to map view');
      // Small delay to allow tab to activate first
      setTimeout(function() {
        if (typeof showMap === 'function') {
          showMap();
        } else {
          console.log('showMap function not found');
        }
      }, 100);
    });
  }
};

let drawCounter = 0;
const shuffleInterval = 200; // Shuffle every shuffleInterval draws
let shuffledKeys = Object.keys(cspIconStyles); // Initialize with original keys

function shuffleKeys() {
  shuffledKeys = Object.keys(cspIconStyles)
    .map((key) => ({ key, sort: Math.random() })) // Map to array of objects with random sort values
    .sort((a, b) => a.sort - b.sort) // Sort by random values
    .map(({ key }) => key); // Extract the keys
}

// Section for general tools

function jsonToTable(jsonText) {
  let arr00 = new Array();
  let arr01 = new Array();
  let arr02 = new Array();
  let arr03 = new Array();
  let arr04 = new Array();
  let arr05 = new Array();

  let json = JSON.parse(jsonText);

  for (i = 0; i < json.length; i++) {
    arr00[i] = json[i].connectionName;
    arr01[i] = json[i].cspSpecName;
    arr02[i] = json[i].vCPU;
    arr03[i] = json[i].memoryGiB;
    arr04[i] = json[i].costPerHour;
    arr05[i] = json[i].evaluationScore09;
  }

  // Header
  let tr0 = document.createElement("tr");

  let th0 = document.createElement("th");
  th0.appendChild(document.createTextNode("   cspRegion"));
  let th1 = document.createElement("th");
  th1.appendChild(document.createTextNode("   cspSpecName"));
  let th2 = document.createElement("th");
  th2.appendChild(document.createTextNode("   vCPU"));
  let th3 = document.createElement("th");
  th3.appendChild(document.createTextNode("   memoryGiB"));
  let th4 = document.createElement("th");
  th4.appendChild(document.createTextNode("   costPerHour"));
  let th5 = document.createElement("th");
  th5.appendChild(document.createTextNode("   evaluationScore"));

  tr0.appendChild(th0);
  tr0.appendChild(th1);
  tr0.appendChild(th2);
  tr0.appendChild(th3);
  tr0.appendChild(th4);
  tr0.appendChild(th5);
  table.appendChild(tr0);

  for (i = 0; i < arr01.length; i++) {
    let tr = document.createElement("tr");

    let td0 = document.createElement("td");
    td0.appendChild(document.createTextNode(" " + arr00[i] + ""));

    let td1 = document.createElement("td");
    td1.appendChild(document.createTextNode(" " + arr01[i] + ""));

    let td2 = document.createElement("td");
    td2.appendChild(document.createTextNode(" " + arr02[i] + ""));

    let td3 = document.createElement("td");
    td3.appendChild(document.createTextNode(" " + arr03[i] + ""));

    let td4 = document.createElement("td");
    td4.appendChild(document.createTextNode(" " + arr04[i] + ""));

    let td5 = document.createElement("td");
    td5.appendChild(document.createTextNode(" " + arr05[i] + ""));

    tr.appendChild(td0);
    tr.appendChild(td1);
    tr.appendChild(td2);
    tr.appendChild(td3);
    tr.appendChild(td4);
    tr.appendChild(td5);

    table.appendChild(tr);
  }
}


function updateFirewallRules() {
  var config = getConfig(); var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var nsId = namespaceElement.value;
  var mciId = mciidElement.value;
  var subgroupid = getSubGroupIdFromVmSelection();
  var vmid = document.getElementById("vmid").value;

  const assocUrl = `http://${hostname}:${port}/tumblebug/ns/${nsId}/mci/${mciId}/associatedResources`;
  axios({
    method: "get",
    url: assocUrl,
    auth: { username, password },
  }).then((assocRes) => {
    const sgIds = (assocRes.data?.securityGroupIds || []);
    if (sgIds.length === 0) {
      errorAlert("No associated Security Groups found for this MCI.");
      return;
    }

    Promise.all(sgIds.map(sgId =>
      axios({
        method: "get",
        url: `http://${hostname}:${port}/tumblebug/ns/${nsId}/resources/securityGroup/${sgId}`,
        auth: { username, password },
      }).then(res => res.data)
    )).then((sgList) => {

      let summaryHtml = `
        <div style="margin-bottom:8px; font-size:12px; color:#444;">
          <b style="font-size:13px;">Security Group Rule Summary</b>
          <div style="margin-top: 10px;">
            <!-- Tab Navigation -->
            <ul class="nav nav-tabs" id="sgTabs" role="tablist" style="margin-bottom: 15px; border-bottom: 2px solid #dee2e6;">
              ${sgList.map((sg, idx) => `
                <li class="nav-item" role="presentation">
                  <button class="nav-link ${idx === 0 ? 'active' : ''}" id="sg-tab-${idx}" data-bs-toggle="tab" data-bs-target="#sg-content-${idx}" type="button" role="tab" aria-controls="sg-content-${idx}" aria-selected="${idx === 0}"
                          style="border: none; border-bottom: 3px solid transparent; padding: 10px 15px; margin-right: 5px; background: none; color: #6c757d; font-weight: 500; transition: all 0.3s ease; ${idx === 0 ? 'color: #007bff; border-bottom-color: #007bff;' : ''}"
                          onmouseover="if(!this.classList.contains('active')) { this.style.color='#007bff'; this.style.backgroundColor='#f8f9fa'; }"
                          onmouseout="if(!this.classList.contains('active')) { this.style.color='#6c757d'; this.style.backgroundColor='transparent'; }">
                    <span style="font-size: 12px; font-weight: 600;">${sg.name}</span>
                    <span style="margin-left: 6px; background-color: ${idx === 0 ? '#007bff' : '#6c757d'}; color: white; font-size: 9px; padding: 2px 6px; border-radius: 10px; font-weight: bold;">${(sg.firewallRules||[]).length}</span>
                  </button>
                </li>
              `).join("")}
            </ul>
            
            <!-- Tab Content -->
            <div class="tab-content" id="sgTabContent">
              ${sgList.map((sg, idx) => `
                <div class="tab-pane fade ${idx === 0 ? 'show active' : ''}" id="sg-content-${idx}" role="tabpanel" aria-labelledby="sg-tab-${idx}">
                  <div style="border: 1px solid #dee2e6; border-radius: 6px; padding: 15px; background-color: #f8f9fa;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                      <div>
                        <h6 style="margin: 0; color: #495057; font-weight: 600;">${sg.name}</h6>
                        <small style="color: #6c757d;">Security Group ID: <code>${sg.id}</code></small>
                      </div>
                      <button class="btn btn-success btn-sm" onclick="addNewRuleToSg('${sg.id}', '${sg.name}')" style="font-size: 11px; padding: 4px 8px;">
                        <span style="margin-right: 3px;">+</span>Add Rule
                      </button>
                    </div>
                    
                    <div style="background: white; border-radius: 4px; overflow: hidden; border: 1px solid #dee2e6;">
                      ${(sg.firewallRules||[]).length > 0 ? `
                        <table class="table table-sm table-hover" style="margin-bottom: 0; font-size: 12px;">
                          <thead style="background-color: #e9ecef;">
                            <tr>
                              <th style="padding: 8px; font-weight: 600; color: #495057; border-bottom: 2px solid #dee2e6;">Direction</th>
                              <th style="padding: 8px; font-weight: 600; color: #495057; border-bottom: 2px solid #dee2e6;">Protocol</th>
                              <th style="padding: 8px; font-weight: 600; color: #495057; border-bottom: 2px solid #dee2e6;">Port</th>
                              <th style="padding: 8px; font-weight: 600; color: #495057; border-bottom: 2px solid #dee2e6;">CIDR</th>
                              <th style="padding: 8px; font-weight: 600; color: #495057; border-bottom: 2px solid #dee2e6; text-align: center; width: 80px;">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            ${sg.firewallRules.map((rule, ruleIdx) => `
                              <tr style="transition: background-color 0.2s;">
                                <td style="padding: 8px; vertical-align: middle;">
                                  <span style="font-size: 9px; padding: 3px 8px; border-radius: 12px; font-weight: 600; color: white; background-color: ${rule.Direction === 'inbound' || (rule.direction && rule.direction.toLowerCase() === 'inbound') ? '#28a745' : '#6c757d'};">
                                    ${(rule.Direction || rule.direction || "").toUpperCase()}
                                  </span>
                                </td>
                                <td style="padding: 8px; vertical-align: middle;">
                                  <code style="background-color: #f8f9fa; padding: 2px 4px; border-radius: 3px; font-size: 10px;">
                                    ${(rule.Protocol || rule.protocol || "").toUpperCase()}
                                  </code>
                                </td>
                                <td style="padding: 8px; vertical-align: middle; font-family: monospace;">
                                  ${rule.Port || rule.port || ""}
                                </td>
                                <td style="padding: 8px; vertical-align: middle; font-family: monospace; color: #6c757d;">
                                  ${rule.CIDR || rule.cidr || ""}
                                </td>
                                <td style="padding: 8px; text-align: center; vertical-align: middle;">
                                  <button class="btn btn-outline-danger btn-xs" onclick="deleteFirewallRule('${sg.id}', '${sg.name}', '${encodeURIComponent(JSON.stringify(rule))}')" 
                                          style="font-size: 9px; padding: 2px 6px; border-radius: 3px;"
                                          title="Delete this rule">
                                    🗑️
                                  </button>
                                </td>
                              </tr>
                            `).join("")}
                          </tbody>
                        </table>
                      ` : `
                        <div style="padding: 20px; text-align: center; color: #6c757d;">
                          <div style="font-size: 24px; margin-bottom: 8px;">🔒</div>
                          <div style="font-weight: 500; margin-bottom: 4px;">No firewall rules defined</div>
                          <div style="font-size: 11px;">Click "Add Rule" to create your first rule</div>
                        </div>
                      `}
                    </div>
                  </div>
                </div>
              `).join("")}
            </div>
          </div>
        </div>
      `;

      let firstRule = null;
      if (sgList.length > 0 && (sgList[0].firewallRules || []).length > 0) {
        firstRule = sgList[0].firewallRules[0];
      }

      let rulesHtml = `
        <div style="background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); border: 1px solid #dee2e6;">
          <div style="background: #343a40; color: white; padding: 12px; font-weight: bold; display: flex; justify-content: space-between; align-items: center;">
            <span>
              <span style="margin-right: 8px;">🔧</span>
              Apply Same Rules to All Security Groups
            </span>
            <button class="btn btn-success btn-sm" onclick="addRuleRowAll()" style="font-size: 11px; padding: 4px 8px; background-color: #28a745; border: none;">
              <span style="margin-right: 3px;">+</span>Add Rule
            </button>
          </div>
          <div style="padding: 15px; background-color: #f8f9fa;">
            <div style="margin-bottom: 10px; font-size: 12px; color: #6c757d;">
              <strong>Note:</strong> These rules will be applied to all Security Groups associated with this MCI, replacing existing rules.
            </div>
            <div style="background: white; border-radius: 4px; overflow: hidden; border: 1px solid #dee2e6;">
              <table class="table table-sm table-hover" style="margin-bottom: 0; font-size: 12px;">
                <thead style="background-color: #e9ecef;">
                  <tr>
                    <th style="padding: 8px; font-weight: 600; color: #495057; border-bottom: 2px solid #dee2e6;">Direction</th>
                    <th style="padding: 8px; font-weight: 600; color: #495057; border-bottom: 2px solid #dee2e6;">Protocol</th>
                    <th style="padding: 8px; font-weight: 600; color: #495057; border-bottom: 2px solid #dee2e6;">Ports</th>
                    <th style="padding: 8px; font-weight: 600; color: #495057; border-bottom: 2px solid #dee2e6;">CIDR</th>
                    <th style="padding: 8px; font-weight: 600; color: #495057; border-bottom: 2px solid #dee2e6; text-align: center; width: 80px;">Actions</th>
                  </tr>
                </thead>
                <tbody id="sg-rules-all" style="background: white;">
                </tbody>
              </table>
              <div id="sg-rules-all-empty" style="padding: 20px; text-align: center; color: #6c757d; display: block;">
                <div style="font-size: 24px; margin-bottom: 8px;">📝</div>
                <div style="font-weight: 500; margin-bottom: 4px;">No rules defined yet</div>
                <div style="font-size: 11px;">Click "Add Rule" to create your first rule</div>
              </div>
            </div>
          </div>
        </div>
      `;


      const presetRules = [
        { direction: "inbound", protocol: "TCP", port: "22", cidr: "0.0.0.0/0", label: "SSH (22)" },
        { direction: "inbound", protocol: "TCP", port: "80", cidr: "0.0.0.0/0", label: "HTTP (80)" },
        { direction: "inbound", protocol: "TCP", port: "443", cidr: "0.0.0.0/0", label: "HTTPS (443)" },
        { direction: "inbound", protocol: "TCP", port: "1-65535", cidr: "0.0.0.0/0", label: "All TCP Ports" },
        { direction: "inbound", protocol: "UDP", port: "1-65535", cidr: "0.0.0.0/0", label: "All UDP Ports" },
        { direction: "inbound", protocol: "ICMP", port: "", cidr: "0.0.0.0/0", label: "ICMP" },
        { direction: "inbound", protocol: "ALL", port: "", cidr: "0.0.0.0/0", label: "All Protocols" },
      ];
      let presetHtml = presetRules.map((p, i) =>
        `<button class="btn btn-outline-secondary btn-sm" style="margin:3px; font-size:11px; padding:4px 8px; border-radius:4px;" onclick="insertPresetRule(${i})">${p.label}</button>`
      ).join("");

      Swal.fire({
        title: "Update Security Group Rules",
        html: `
          <div>
            ${summaryHtml}
            <div style="margin: 15px 0; padding: 12px; background: #e8f4fd; border-radius: 6px; border-left: 4px solid #0066cc;">
              <div style="font-weight: 600; color: #0066cc; margin-bottom: 8px; font-size: 13px;">📋 Frequently Used Rules</div>
              <div>${presetHtml}</div>
            </div>
            <div style="max-height:400px;overflow:auto;">${rulesHtml}</div>
          </div>
        `,
        width: 1200,
        showCancelButton: true,
        confirmButtonText: "Apply",
        cancelButtonText: "Cancel",
        didOpen: () => {
          // Initialize Bootstrap tabs functionality for Security Groups
          const tabButtons = document.querySelectorAll('#sgTabs button[data-bs-toggle="tab"]');
          tabButtons.forEach(button => {
            button.addEventListener('click', function (e) {
              e.preventDefault();
              
              // Remove active class from all tabs and content
              tabButtons.forEach(btn => {
                btn.classList.remove('active');
                btn.style.color = '#6c757d';
                btn.style.borderBottomColor = 'transparent';
                btn.style.backgroundColor = 'transparent';
                // Update badge color
                const badge = btn.querySelector('span:last-child');
                if (badge) badge.style.backgroundColor = '#6c757d';
              });
              document.querySelectorAll('.tab-pane').forEach(pane => {
                pane.classList.remove('show', 'active');
              });
              
              // Add active class to clicked tab
              this.classList.add('active');
              this.style.color = '#007bff';
              this.style.borderBottomColor = '#007bff';
              this.style.backgroundColor = 'transparent';
              // Update badge color for active tab
              const activeBadge = this.querySelector('span:last-child');
              if (activeBadge) activeBadge.style.backgroundColor = '#007bff';
              
              // Show corresponding content
              const target = this.getAttribute('data-bs-target');
              const targetPane = document.querySelector(target);
              if (targetPane) {
                targetPane.classList.add('show', 'active');
              }
            });
          });
          
          window.addRuleRowAll = function () {
            const tbody = document.getElementById("sg-rules-all");
            const emptyDiv = document.getElementById("sg-rules-all-empty");
            
            // Hide empty state message when adding first rule
            if (emptyDiv && tbody.rows.length === 0) {
              emptyDiv.style.display = 'none';
            }
            
            let def = { direction: "inbound", protocol: "TCP", ports: "", cidr: "" };
            if (firstRule) {
              def.direction = firstRule.Direction || firstRule.direction || "inbound";
              def.protocol = (firstRule.Protocol || firstRule.protocol || "TCP").toUpperCase();
              def.ports = firstRule.Ports || firstRule.port || "";
              def.cidr = firstRule.CIDR || firstRule.cidr || "";
            }
            const row = document.createElement("tr");
            row.style.transition = "background-color 0.2s";
            row.innerHTML = `
              <td style="padding: 8px; vertical-align: middle;">
                <select class="form-control" name="direction" style="font-size: 11px; padding: 4px;">
                  <option value="inbound" ${def.direction === "inbound" ? "selected" : ""}>Inbound</option>
                  <option value="outbound" ${def.direction === "outbound" ? "selected" : ""}>Outbound</option>
                </select>
              </td>
              <td style="padding: 8px; vertical-align: middle;">
                <select class="form-control" name="protocol" style="font-size: 11px; padding: 4px;" onchange="togglePortField(this)">
                  <option value="TCP" ${def.protocol === "TCP" ? "selected" : ""}>TCP</option>
                  <option value="UDP" ${def.protocol === "UDP" ? "selected" : ""}>UDP</option>
                  <option value="ICMP" ${def.protocol === "ICMP" ? "selected" : ""}>ICMP</option>
                  <option value="ALL" ${def.protocol === "ALL" ? "selected" : ""}>ALL</option>
                </select>
              </td>
              <td style="padding: 8px; vertical-align: middle;">
                <input type="text" class="form-control" name="Ports" placeholder="ex: 22,80,1000-2000" value="${def.ports}" style="font-size: 11px; padding: 4px; font-family: monospace;">
              </td>
              <td style="padding: 8px; vertical-align: middle;">
                <input type="text" class="form-control" name="cidr" value="${def.cidr}" placeholder="ex: 0.0.0.0/0" style="font-size: 11px; padding: 4px; font-family: monospace;">
              </td>
              <td style="padding: 8px; text-align: center; vertical-align: middle;">
                <button class="btn btn-outline-danger btn-xs" onclick="removeRuleRowAll(this)" style="font-size: 9px; padding: 2px 6px; border-radius: 3px;" title="Delete this rule">
                  🗑️
                </button>
              </td>
            `;
            tbody.appendChild(row);
            
            // Check initial protocol and disable port field if needed
            const protocolSelect = row.querySelector('select[name="protocol"]');
            const portInput = row.querySelector('input[name="Ports"]');
            if (protocolSelect.value === "ICMP" || protocolSelect.value === "ALL") {
              portInput.disabled = true;
              portInput.value = "";
              portInput.placeholder = "Not applicable for " + protocolSelect.value;
              portInput.style.backgroundColor = "#f8f9fa";
            }
          };
          
          // Add remove function for rules
          window.removeRuleRowAll = function(button) {
            const row = button.closest('tr');
            const tbody = document.getElementById("sg-rules-all");
            const emptyDiv = document.getElementById("sg-rules-all-empty");
            
            row.remove();
            
            // Show empty state message if no rules left
            if (emptyDiv && tbody.rows.length === 0) {
              emptyDiv.style.display = 'block';
            }
          };
          
          // Function to toggle port field based on protocol selection
          window.togglePortField = function(protocolSelect) {
            const row = protocolSelect.closest('tr');
            const portInput = row.querySelector('input[name="Ports"]');
            const protocol = protocolSelect.value;
            
            if (protocol === "ICMP" || protocol === "ALL") {
              portInput.disabled = true;
              portInput.value = "";
              portInput.placeholder = "Not applicable for " + protocol;
              portInput.style.backgroundColor = "#f8f9fa";
              portInput.style.color = "#6c757d";
            } else {
              portInput.disabled = false;
              portInput.placeholder = "ex: 22,80,1000-2000";
              portInput.style.backgroundColor = "";
              portInput.style.color = "";
            }
          };
          
          window.insertPresetRule = function (presetIdx) {
            const p = presetRules[presetIdx];
            const tbody = document.getElementById("sg-rules-all");
            const emptyDiv = document.getElementById("sg-rules-all-empty");
            
            // Hide empty state message when adding first rule
            if (emptyDiv && tbody.rows.length === 0) {
              emptyDiv.style.display = 'none';
            }
            
            let def = { direction: "inbound", protocol: "TCP" };
            if (firstRule) {
              def.direction = firstRule.Direction || firstRule.direction || "inbound";
              def.protocol = (firstRule.Protocol || firstRule.protocol || "TCP").toUpperCase();
            }
            const row = document.createElement("tr");
            row.style.transition = "background-color 0.2s";
            row.innerHTML = `
              <td style="padding: 8px; vertical-align: middle;">
                <select class="form-control" name="direction" style="font-size: 11px; padding: 4px;">
                  <option value="inbound" ${p.direction === "inbound" ? "selected" : ""}>Inbound</option>
                  <option value="outbound" ${p.direction === "outbound" ? "selected" : ""}>Outbound</option>
                </select>
              </td>
              <td style="padding: 8px; vertical-align: middle;">
                <select class="form-control" name="protocol" style="font-size: 11px; padding: 4px;" onchange="togglePortField(this)">
                  <option value="TCP" ${p.protocol === "TCP" ? "selected" : ""}>TCP</option>
                  <option value="UDP" ${p.protocol === "UDP" ? "selected" : ""}>UDP</option>
                  <option value="ICMP" ${p.protocol === "ICMP" ? "selected" : ""}>ICMP</option>
                  <option value="ALL" ${p.protocol === "ALL" ? "selected" : ""}>ALL</option>
                </select>
              </td>
              <td style="padding: 8px; vertical-align: middle;">
                <input type="text" class="form-control" name="Ports" placeholder="ex: 22,80,1000-2000" value="${p.port}" style="font-size: 11px; padding: 4px; font-family: monospace;">
              </td>
              <td style="padding: 8px; vertical-align: middle;">
                <input type="text" class="form-control" name="cidr" value="${p.cidr}" style="font-size: 11px; padding: 4px; font-family: monospace;">
              </td>
              <td style="padding: 8px; text-align: center; vertical-align: middle;">
                <button class="btn btn-outline-danger btn-xs" onclick="removeRuleRowAll(this)" style="font-size: 9px; padding: 2px 6px; border-radius: 3px;" title="Delete this rule">
                  🗑️
                </button>
              </td>
            `;
            tbody.appendChild(row);
            
            // Check protocol and disable port field if needed
            const protocolSelect = row.querySelector('select[name="protocol"]');
            const portInput = row.querySelector('input[name="Ports"]');
            if (protocolSelect.value === "ICMP" || protocolSelect.value === "ALL") {
              portInput.disabled = true;
              portInput.value = "";
              portInput.placeholder = "Not applicable for " + protocolSelect.value;
              portInput.style.backgroundColor = "#f8f9fa";
            }
          };
        },
        preConfirm: () => {

          const tbody = document.getElementById("sg-rules-all");
          let rules = [];
          for (let row of tbody.rows) {
            const direction = row.querySelector('select[name="direction"]').value;
            const protocol = row.querySelector('select[name="protocol"]').value;
            const port = row.querySelector('input[name="Ports"]').value.trim();
            const cidr = row.querySelector('input[name="cidr"]').value.trim();
            
            // For ICMP and ALL protocols, port is not required
            const isPortRequired = (protocol === "TCP" || protocol === "UDP");
            const isValidRule = direction && protocol && cidr && (!isPortRequired || (isPortRequired && port));
            
            if (isValidRule) {
              rules.push({
                Ports: port || "", // Use empty string for ICMP/ALL protocols
                Protocol: protocol,
                Direction: direction,
                CIDR: cidr
              });
            }
          }
          return sgList.map(sg => ({ id: sg.id, name: sg.name, firewallRules: rules }));
        }
      }).then((result) => {
        if (result.isConfirmed) {
          
          // Show loading message
          Swal.fire({
            title: 'Updating Security Groups...',
            text: 'Please wait while we update the security group rules.',
            allowOutsideClick: false,
            allowEscapeKey: false,
            showConfirmButton: false,
            didOpen: () => {
              Swal.showLoading();
            }
          });

          // Since we now use UpdateMultipleFirewallRules, make a single API call instead of multiple calls
          const updatePromise = axios({
            method: "put",
            url: `http://${hostname}:${port}/tumblebug/ns/${nsId}/mci/${mciId}/associatedSecurityGroups`,
            headers: { "Content-Type": "application/json" },
            data: JSON.stringify({
              firewallRules: result.value[0].firewallRules // All SGs get the same rules
            }),
            auth: { username, password },
          }).then(response => {
            // Check if response has the new batch format with response array and summary
            const responseData = response.data;
            if (responseData && responseData.response && Array.isArray(responseData.response)) {
              // New batch response format - extract individual results
              return responseData.response.map(sgResponse => ({
                id: sgResponse.id,
                name: sgResponse.name,
                success: sgResponse.success,
                message: sgResponse.message || "Successfully updated",
                response: sgResponse,
                summary: responseData.summary // Include summary information
              }));
            } else {
              // Fallback for unexpected response format
              return sgList.map(sg => ({
                id: sg.id,
                name: sg.name,
                success: false,
                message: "Unexpected response format",
                response: responseData
              }));
            }
          }).catch(error => {
            // Return error result for each security group
            return sgList.map(sg => ({
              id: sg.id,
              name: sg.name,
              success: false,
              message: error.response?.data?.message || error.message || "Unknown error",
              error: error
            }));
          });

          updatePromise.then((results) => {
            const successCount = results.filter(r => r.success).length;
            const failedCount = results.filter(r => r.success === false).length;
            const allSuccess = failedCount === 0;
            
            // Extract summary if available
            const summary = results.length > 0 && results[0].summary ? results[0].summary : null;

            // Calculate update time and other details
            const updateTime = new Date().toLocaleString();
            
            // Create detailed result table with summary information
            let resultHtml = `
              <div style="text-align: left;">
                <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                  <h5 style="margin: 0 0 12px 0; color: #495057; display: flex; align-items: center;">
                    <span style="margin-right: 8px;">📊</span>
                    Security Group Update Results Summary
                    ${summary ? '<span style="font-size: 12px; color: #6c757d; margin-left: 10px;">(Parallel Processing)</span>' : ''}
                  </h5>
                  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 15px; margin-bottom: 10px;">
                    <div style="text-align: center; padding: 8px; background: white; border-radius: 6px; border-left: 4px solid #6c757d;">
                      <div style="font-size: 18px; font-weight: bold; color: #6c757d;">${summary ? summary.total : results.length}</div>
                      <div style="font-size: 12px; color: #6c757d;">Total</div>
                    </div>
                    <div style="text-align: center; padding: 8px; background: white; border-radius: 6px; border-left: 4px solid #28a745;">
                      <div style="font-size: 18px; font-weight: bold; color: #28a745;">${summary ? summary.success : successCount}</div>
                      <div style="font-size: 12px; color: #28a745;">Success</div>
                    </div>
                    <div style="text-align: center; padding: 8px; background: white; border-radius: 6px; border-left: 4px solid #dc3545;">
                      <div style="font-size: 18px; font-weight: bold; color: #dc3545;">${summary ? summary.failed : failedCount}</div>
                      <div style="font-size: 12px; color: #dc3545;">Failed</div>
                    </div>
                    <div style="text-align: center; padding: 8px; background: white; border-radius: 6px; border-left: 4px solid #17a2b8;">
                      <div style="font-size: 11px; font-weight: bold; color: #17a2b8;">${updateTime}</div>
                      <div style="font-size: 12px; color: #17a2b8;">Updated</div>
                    </div>
                  </div>
                  ${summary && summary.allSuccess ? 
                    '<div style="background: #d4edda; color: #155724; padding: 8px; border-radius: 4px; font-size: 12px; text-align: center;"><strong>✅ All security groups updated successfully!</strong></div>' : 
                    summary && !summary.allSuccess ? 
                    '<div style="background: #fff3cd; color: #856404; padding: 8px; border-radius: 4px; font-size: 12px; text-align: center;"><strong>⚠️ Some security groups failed to update</strong></div>' : ''
                  }
                </div>
                
                <div style="background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                  <div style="background: #343a40; color: white; padding: 12px; font-weight: bold;">
                    <span style="margin-right: 8px;">📋</span>
                    Detailed Update Results
                  </div>
                  <div style="max-height: 400px; overflow-y: auto;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                      <thead style="background: #f8f9fa; position: sticky; top: 0; z-index: 1;">
                        <tr>
                          <th style="padding: 12px 8px; text-align: left; border-bottom: 2px solid #dee2e6; font-weight: 600; color: #495057; width: 50px;">#</th>
                          <th style="padding: 12px 8px; text-align: left; border-bottom: 2px solid #dee2e6; font-weight: 600; color: #495057; width: 80px;">Status</th>
                          <th style="padding: 12px 8px; text-align: left; border-bottom: 2px solid #dee2e6; font-weight: 600; color: #495057; min-width: 150px;">Security Group</th>
                          <th style="padding: 12px 8px; text-align: left; border-bottom: 2px solid #dee2e6; font-weight: 600; color: #495057;">ID</th>
                          <th style="padding: 12px 8px; text-align: left; border-bottom: 2px solid #dee2e6; font-weight: 600; color: #495057; min-width: 200px;">Message</th>
                          <th style="padding: 12px 8px; text-align: left; border-bottom: 2px solid #dee2e6; font-weight: 600; color: #495057; width: 100px;">Details</th>
                        </tr>
                      </thead>
                      <tbody>
            `;

            results.forEach((result, index) => {
              const statusIcon = result.success ? '✅' : '❌';
              const statusText = result.success ? 'Success' : 'Failed';
              const statusColor = result.success ? '#28a745' : '#dc3545';
              const rowBgColor = result.success ? '#f8fff8' : '#fff5f5';
              const rulesCount = result.response?.firewallRules?.length || result.response?.updated?.firewallRules?.length || 'N/A';
              
              resultHtml += `
                <tr style="background-color: ${rowBgColor}; border-bottom: 1px solid #f0f0f0;">
                  <td style="padding: 12px 8px; text-align: center; font-weight: bold; color: #6c757d;">${index + 1}</td>
                  <td style="padding: 12px 8px; text-align: center;">
                    <div style="display: flex; align-items: center; justify-content: center; gap: 6px;">
                      <span style="font-size: 16px;">${statusIcon}</span>
                      <span style="font-weight: 600; color: ${statusColor}; font-size: 12px;">${statusText}</span>
                    </div>
                  </td>
                  <td style="padding: 12px 8px;">
                    <div style="font-weight: 600; color: #212529; margin-bottom: 2px;">${result.name}</div>
                    <div style="font-size: 11px; color: #6c757d;">Rules: ${rulesCount}</div>
                  </td>
                  <td style="padding: 12px 8px;">
                    <code style="background: #f8f9fa; padding: 2px 6px; border-radius: 3px; font-size: 11px; color: #495057;">${result.id}</code>
                  </td>
                  <td style="padding: 12px 8px;">
                    <div style="color: #495057; line-height: 1.4; word-break: break-word;">
                      ${result.message}
                    </div>
                  </td>
                  <td style="padding: 12px 8px; text-align: center;">
                    <button onclick="showSgDetails('${result.id}', '${result.name}', ${index})" 
                            style="background: #17a2b8; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 11px; cursor: pointer; transition: background 0.2s;"
                            onmouseover="this.style.background='#138496'" 
                            onmouseout="this.style.background='#17a2b8'">
                      View
                    </button>
                  </td>
                </tr>
              `;
            });

            resultHtml += `
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            `;

            // Add global function for showing details
            window.showSgDetails = function(sgId, sgName, index) {
              const result = results[index];
              let detailsHtml = `
                <div style="text-align: left;">
                  <h6 style="color: #495057; margin-bottom: 15px;">
                    <strong>Security Group:</strong> ${sgName} 
                    <span style="font-size: 12px; color: #6c757d;">(${sgId})</span>
                  </h6>
              `;
              
              if (result.success && result.response) {
                const sgData = result.response.updated || result.response;
                if (sgData.firewallRules && sgData.firewallRules.length > 0) {
                  detailsHtml += `
                    <div style="margin-bottom: 15px;">
                      <strong style="color: #28a745;">✅ Updated Rules (${sgData.firewallRules.length}):</strong>
                      <div style="max-height: 200px; overflow-y: auto; margin-top: 8px; border: 1px solid #dee2e6; border-radius: 4px;">
                        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                          <thead style="background: #f8f9fa;">
                            <tr>
                              <th style="padding: 6px; border-bottom: 1px solid #dee2e6;">Direction</th>
                              <th style="padding: 6px; border-bottom: 1px solid #dee2e6;">Protocol</th>
                              <th style="padding: 6px; border-bottom: 1px solid #dee2e6;">Port</th>
                              <th style="padding: 6px; border-bottom: 1px solid #dee2e6;">CIDR</th>
                            </tr>
                          </thead>
                          <tbody>
                  `;
                  
                  sgData.firewallRules.forEach(rule => {
                    detailsHtml += `
                      <tr>
                        <td style="padding: 6px; border-bottom: 1px solid #f0f0f0;">${rule.Direction || rule.direction || 'N/A'}</td>
                        <td style="padding: 6px; border-bottom: 1px solid #f0f0f0;">${rule.Protocol || rule.protocol || 'N/A'}</td>
                        <td style="padding: 6px; border-bottom: 1px solid #f0f0f0;">${rule.Port || rule.port || rule.Ports || 'N/A'}</td>
                        <td style="padding: 6px; border-bottom: 1px solid #f0f0f0;">${rule.CIDR || rule.cidr || 'N/A'}</td>
                      </tr>
                    `;
                  });
                  
                  detailsHtml += `
                          </tbody>
                        </table>
                      </div>
                    </div>
                  `;
                }
              } else {
                detailsHtml += `
                  <div style="color: #dc3545; background: #f8d7da; padding: 10px; border-radius: 4px; margin-bottom: 10px;">
                    <strong>❌ Update Failed:</strong><br>
                    ${result.message}
                  </div>
                `;
                
                if (result.error && result.error.response) {
                  detailsHtml += `
                    <div style="background: #f8f9fa; padding: 10px; border-radius: 4px; border-left: 4px solid #dc3545;">
                      <strong>Error Details:</strong><br>
                      <code style="font-size: 11px; color: #dc3545;">${JSON.stringify(result.error.response.data, null, 2)}</code>
                    </div>
                  `;
                }
              }
              
              detailsHtml += `</div>`;
              
              Swal.fire({
                title: `Security Group Details`,
                html: detailsHtml,
                width: 600,
                confirmButtonText: "Close",
                confirmButtonColor: "#6c757d"
              });
            };

            if (allSuccess) {
              Swal.fire({
                title: "🎉 All Updates Successful!",
                html: resultHtml,
                icon: "success",
                width: 900,
                confirmButtonText: "Excellent!",
                confirmButtonColor: "#28a745"
              });
            } else if (successCount > 0) {
              Swal.fire({
                title: "⚠️ Partial Success",
                html: resultHtml,
                icon: "warning",
                width: 900,
                confirmButtonText: "Got it",
                confirmButtonColor: "#ffc107"
              });
            } else {
              Swal.fire({
                title: "❌ Update Failed",
                html: resultHtml,
                icon: "error",
                width: 900,
                confirmButtonText: "Retry",
                confirmButtonColor: "#dc3545"
              });
            }
          }).catch((err) => {
            Swal.fire({
              title: "💥 Unexpected Error",
              html: `
                <div style="text-align: left;">
                  <p>An unexpected error occurred while updating security group rules:</p>
                  <div style="background-color: #f8f9fa; padding: 12px; border-radius: 6px; border-left: 4px solid #dc3545;">
                    <code style="color: #dc3545;">${err.response?.data?.message || err.message || err}</code>
                  </div>
                  <p style="margin-top: 12px; color: #6c757d;">Please check your connection and try again.</p>
                </div>
              `,
              icon: "error",
              width: 600,
              confirmButtonText: "Close",
              confirmButtonColor: "#dc3545"
            });
          });
        }
      }).catch((err) => {
        if (err) errorAlert("Popup error: " + err);
      });
    }).catch((err) => {
      errorAlert("Failed to load security group details: " + (err.response?.data?.message || err));
    });
  }).catch((err) => {
    errorAlert("Failed to load associated security group IDs: " + (err.response?.data?.message || err));
  });
}
window.updateFirewallRules = updateFirewallRules;

// Function to delete individual firewall rule
function deleteFirewallRule(sgId, sgName, ruleData) {
  try {
    const rule = JSON.parse(decodeURIComponent(ruleData));
    
    Swal.fire({
      title: "Delete Firewall Rule",
      html: `
        <div style="text-align: left;">
          <p><strong>Security Group:</strong> ${sgName}</p>
          <p><strong>Rule to delete:</strong></p>
          <div style="background: #f8f9fa; padding: 10px; border-radius: 4px; border-left: 4px solid #dc3545;">
            <strong>Direction:</strong> ${rule.Direction || rule.direction || 'N/A'}<br>
            <strong>Protocol:</strong> ${rule.Protocol || rule.protocol || 'N/A'}<br>
            <strong>Port:</strong> ${rule.Port || rule.port || rule.Ports || 'N/A'}<br>
            <strong>CIDR:</strong> ${rule.CIDR || rule.cidr || 'N/A'}
          </div>
          <p style="color: #dc3545; margin-top: 10px;">⚠️ This action cannot be undone.</p>
        </div>
      `,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
      confirmButtonColor: "#dc3545",
      cancelButtonText: "Cancel",
      cancelButtonColor: "#6c757d"
    }).then((result) => {
      if (result.isConfirmed) {
        // Show loading
        Swal.fire({
          title: 'Deleting Rule...',
          text: 'Please wait while we delete the firewall rule.',
          allowOutsideClick: false,
          allowEscapeKey: false,
          showConfirmButton: false,
          didOpen: () => {
            Swal.showLoading();
          }
        });

        var config = getConfig(); var hostname = config.hostname;
        var port = config.port;
        var username = config.username;
        var password = config.password;
        var nsId = namespaceElement.value;

        // Prepare request data for deletion
        const deleteRule = {
          Direction: rule.Direction || rule.direction,
          Protocol: rule.Protocol || rule.protocol,
          Ports: rule.Port || rule.port || rule.Ports,
          CIDR: rule.CIDR || rule.cidr
        };

        axios({
          method: "delete",
          url: `http://${hostname}:${port}/tumblebug/ns/${nsId}/resources/securityGroup/${sgId}/rules`,
          headers: { "Content-Type": "application/json" },
          data: JSON.stringify({
            firewallRules: [deleteRule]
          }),
          auth: { username, password },
        }).then((response) => {
          const responseData = response.data;
          // Check if the response indicates success
          const isSuccess = responseData.success !== false;
          
          if (isSuccess) {
            Swal.fire({
              title: "✅ Rule Deleted Successfully",
              html: `
                <div style="text-align: left;">
                  <p>The firewall rule has been successfully deleted from security group <strong>${sgName}</strong>.</p>
                  <div style="background: #d4edda; padding: 10px; border-radius: 4px; border-left: 4px solid #28a745; margin-top: 10px;">
                    <strong>Deleted Rule:</strong><br>
                    Direction: ${deleteRule.Direction}<br>
                    Protocol: ${deleteRule.Protocol}<br>
                    Port: ${deleteRule.Ports}<br>
                    CIDR: ${deleteRule.CIDR}
                  </div>
                  ${responseData.message ? `<p style="margin-top: 10px; color: #28a745;"><strong>Message:</strong> ${responseData.message}</p>` : ''}
                </div>
              `,
              icon: "success",
              confirmButtonText: "Refresh View",
              confirmButtonColor: "#28a745"
            }).then(() => {
              // Refresh the firewall rules view
              updateFirewallRules();
            });
          } else {
            throw new Error(responseData.message || 'Failed to delete rule');
          }
        }).catch((error) => {
          Swal.fire({
            title: "❌ Delete Failed",
            html: `
              <div style="text-align: left;">
                <p>Failed to delete the firewall rule:</p>
                <div style="background: #f8d7da; padding: 10px; border-radius: 4px; border-left: 4px solid #dc3545;">
                  <code style="color: #dc3545;">${error.response?.data?.message || error.message || 'Unknown error'}</code>
                </div>
              </div>
            `,
            icon: "error",
            confirmButtonText: "Close",
            confirmButtonColor: "#dc3545"
          });
        });
      }
    });
  } catch (err) {
    errorAlert("Error parsing rule data: " + err.message);
  }
}
window.deleteFirewallRule = deleteFirewallRule;

// Function to add new firewall rule to specific security group
function addNewRuleToSg(sgId, sgName) {
  Swal.fire({
    title: `Add New Rule to ${sgName}`,
    html: `
      <div style="text-align: left;">
        <div style="margin-bottom: 15px;">
          <label style="font-weight: bold; margin-bottom: 5px; display: block;">Direction:</label>
          <select id="newRuleDirection" class="form-control">
            <option value="inbound">Inbound</option>
            <option value="outbound">Outbound</option>
          </select>
        </div>
        <div style="margin-bottom: 15px;">
          <label style="font-weight: bold; margin-bottom: 5px; display: block;">Protocol:</label>
          <select id="newRuleProtocol" class="form-control" onchange="togglePortFieldIndividual()">
            <option value="TCP">TCP</option>
            <option value="UDP">UDP</option>
            <option value="ICMP">ICMP</option>
            <option value="ALL">ALL</option>
          </select>
        </div>
        <div style="margin-bottom: 15px;">
          <label style="font-weight: bold; margin-bottom: 5px; display: block;">Port:</label>
          <input type="text" id="newRulePort" class="form-control" placeholder="ex: 22, 80-100, 22,80,443" />
          <small style="color: #6c757d;">Enter single port (22), port range (80-100), or multiple (22,80,443)</small>
        </div>
        <div style="margin-bottom: 15px;">
          <label style="font-weight: bold; margin-bottom: 5px; display: block;">CIDR:</label>
          <input type="text" id="newRuleCidr" class="form-control" placeholder="ex: 0.0.0.0/0, 192.168.1.0/24" value="0.0.0.0/0" />
          <small style="color: #6c757d;">IP address range in CIDR notation</small>
        </div>
        <div style="background: #f8f9fa; padding: 10px; border-radius: 4px; margin-top: 15px;">
          <strong>Quick Templates:</strong><br>
          <button class="btn btn-outline-secondary btn-sm" onclick="setQuickTemplate('SSH')" style="margin: 2px;">SSH (22)</button>
          <button class="btn btn-outline-secondary btn-sm" onclick="setQuickTemplate('HTTP')" style="margin: 2px;">HTTP (80)</button>
          <button class="btn btn-outline-secondary btn-sm" onclick="setQuickTemplate('HTTPS')" style="margin: 2px;">HTTPS (443)</button>
          <button class="btn btn-outline-secondary btn-sm" onclick="setQuickTemplate('MYSQL')" style="margin: 2px;">MySQL (3306)</button>
          <button class="btn btn-outline-secondary btn-sm" onclick="setQuickTemplate('POSTGRES')" style="margin: 2px;">PostgreSQL (5432)</button>
          <button class="btn btn-outline-secondary btn-sm" onclick="setQuickTemplate('ALL_TCP')" style="margin: 2px;">All TCP Ports</button>
          <button class="btn btn-outline-secondary btn-sm" onclick="setQuickTemplate('ALL_UDP')" style="margin: 2px;">All UDP Ports</button>
          <button class="btn btn-outline-secondary btn-sm" onclick="setQuickTemplate('ICMP')" style="margin: 2px;">ICMP</button>
          <button class="btn btn-outline-secondary btn-sm" onclick="setQuickTemplate('ALL_PROTOCOLS')" style="margin: 2px;">All Protocols</button>
        </div>
      </div>
    `,
    width: 500,
    showCancelButton: true,
    confirmButtonText: "Add Rule",
    confirmButtonColor: "#28a745",
    cancelButtonText: "Cancel",
    cancelButtonColor: "#6c757d",
    didOpen: () => {
      // Function to toggle port field for individual rule addition
      window.togglePortFieldIndividual = function() {
        const protocolSelect = document.getElementById("newRuleProtocol");
        const portInput = document.getElementById("newRulePort");
        const protocol = protocolSelect.value;
        
        if (protocol === "ICMP" || protocol === "ALL") {
          portInput.disabled = true;
          portInput.value = "";
          portInput.placeholder = "Not applicable for " + protocol;
          portInput.style.backgroundColor = "#f8f9fa";
          portInput.style.color = "#6c757d";
        } else {
          portInput.disabled = false;
          portInput.placeholder = "ex: 22, 80-100, 22,80,443";
          portInput.style.backgroundColor = "";
          portInput.style.color = "";
        }
      };
      
      // Initialize port field state
      togglePortFieldIndividual();
      
      // Define quick template function
      window.setQuickTemplate = function(template) {
        const protocolSelect = document.getElementById("newRuleProtocol");
        const portInput = document.getElementById("newRulePort");
        const cidrInput = document.getElementById("newRuleCidr");
        
        switch(template) {
          case 'SSH':
            protocolSelect.value = "TCP";
            portInput.value = "22";
            cidrInput.value = "0.0.0.0/0";
            break;
          case 'HTTP':
            protocolSelect.value = "TCP";
            portInput.value = "80";
            cidrInput.value = "0.0.0.0/0";
            break;
          case 'HTTPS':
            protocolSelect.value = "TCP";
            portInput.value = "443";
            cidrInput.value = "0.0.0.0/0";
            break;
          case 'MYSQL':
            protocolSelect.value = "TCP";
            portInput.value = "3306";
            cidrInput.value = "0.0.0.0/0";
            break;
          case 'POSTGRES':
            protocolSelect.value = "TCP";
            portInput.value = "5432";
            cidrInput.value = "0.0.0.0/0";
            break;
          case 'ALL_TCP':
            protocolSelect.value = "TCP";
            portInput.value = "1-65535";
            cidrInput.value = "0.0.0.0/0";
            break;
          case 'ALL_UDP':
            protocolSelect.value = "UDP";
            portInput.value = "1-65535";
            cidrInput.value = "0.0.0.0/0";
            break;
          case 'ICMP':
            protocolSelect.value = "ICMP";
            portInput.value = "";
            cidrInput.value = "0.0.0.0/0";
            break;
          case 'ALL_PROTOCOLS':
            protocolSelect.value = "ALL";
            portInput.value = "";
            cidrInput.value = "0.0.0.0/0";
            break;
        }
        
        // Update port field state after template selection
        togglePortFieldIndividual();
      };
    },
    preConfirm: () => {
      const direction = document.getElementById("newRuleDirection").value;
      const protocol = document.getElementById("newRuleProtocol").value;
      const port = document.getElementById("newRulePort").value.trim();
      const cidr = document.getElementById("newRuleCidr").value.trim();
      
      // For ICMP and ALL protocols, port is not required
      if (!direction || !protocol || !cidr) {
        Swal.showValidationMessage("Direction, Protocol, and CIDR are required");
        return false;
      }
      
      // Check port requirement based on protocol
      if ((protocol === "TCP" || protocol === "UDP") && !port) {
        Swal.showValidationMessage("Port is required for TCP and UDP protocols");
        return false;
      }
      
      // Basic CIDR validation
      if (!cidr.includes('/')) {
        Swal.showValidationMessage("CIDR must include network prefix (e.g., 0.0.0.0/0)");
        return false;
      }
      
      return { direction, protocol, port: port || "", cidr };
    }
  }).then((result) => {
    if (result.isConfirmed) {
      const { direction, protocol, port, cidr } = result.value;
      
      // Show loading
      Swal.fire({
        title: 'Adding Rule...',
        text: 'Please wait while we add the new firewall rule.',
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false,
        didOpen: () => {
          Swal.showLoading();
        }
      });

      var config = getConfig(); var hostname = config.hostname;
      var portVal = portElement.value;
      var username = config.username;
      var password = config.password;
      var nsId = namespaceElement.value;

      // Prepare request data for addition
      const newRule = {
        Direction: direction,
        Protocol: protocol,
        Ports: port,
        CIDR: cidr
      };

      axios({
        method: "post",
        url: `http://${hostname}:${portVal}/tumblebug/ns/${nsId}/resources/securityGroup/${sgId}/rules`,
        headers: { "Content-Type": "application/json" },
        data: JSON.stringify({
          firewallRules: [newRule]
        }),
        auth: { username, password },
      }).then((response) => {
        const responseData = response.data;
        // Check if the response indicates success
        const isSuccess = responseData.success !== false;
        
        if (isSuccess) {
          Swal.fire({
            title: "✅ Rule Added Successfully",
            html: `
              <div style="text-align: left;">
                <p>The new firewall rule has been successfully added to security group <strong>${sgName}</strong>.</p>
                <div style="background: #d4edda; padding: 10px; border-radius: 4px; border-left: 4px solid #28a745; margin-top: 10px;">
                  <strong>Added Rule:</strong><br>
                  Direction: ${newRule.Direction}<br>
                  Protocol: ${newRule.Protocol}<br>
                  ${newRule.Ports ? `Port: ${newRule.Ports}<br>` : ''}
                  CIDR: ${newRule.CIDR}
                </div>
                ${responseData.message ? `<p style="margin-top: 10px; color: #28a745;"><strong>Message:</strong> ${responseData.message}</p>` : ''}
              </div>
            `,
            icon: "success",
            confirmButtonText: "Refresh View",
            confirmButtonColor: "#28a745"
          }).then(() => {
            // Refresh the firewall rules view
            updateFirewallRules();
          });
        } else {
          throw new Error(responseData.message || 'Failed to add rule');
        }
      }).catch((error) => {
        Swal.fire({
          title: "❌ Add Failed",
          html: `
            <div style="text-align: left;">
              <p>Failed to add the new firewall rule:</p>
              <div style="background: #f8d7da; padding: 10px; border-radius: 4px; border-left: 4px solid #dc3545;">
                <code style="color: #dc3545;">${error.response?.data?.message || error.message || 'Unknown error'}</code>
              </div>
            </div>
          `,
          icon: "error",
          confirmButtonText: "Close",
          confirmButtonColor: "#dc3545"
        });
      });
    }
  });
}
window.addNewRuleToSg = addNewRuleToSg;

// Function for Scale Out SubGroup
function scaleOutSubGroup() {
  var mciid = document.getElementById("mciid").value;
  var subgroupid = getSubGroupIdFromVmSelection();

  if (!mciid) {
    errorAlert("Please select an MCI first");
    return;
  }

  if (!subgroupid) {
    errorAlert("Please select a SubGroup first");
    return;
  }

  var config = getConfig(); var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = namespaceElement.value;

  // Show dialog to get number of VMs to add
  Swal.fire({
    title: "Scale Out SubGroup",
    width: 600,
    html:
      "<font size=3>" +
      "<div style='text-align: left; margin: 20px;'>" +
      "<p><b>Target MCI:</b> " + mciid + "</p>" +
      "<p><b>Target SubGroup:</b> " + subgroupid + "</p>" +
      "<hr>" +
      "<p><b>Enter the number of VMs to add:</b></p>" +
      "</div>",
    input: "number",
    inputValue: 1,
    inputAttributes: {
      min: 1,
      max: 20,
      step: 1,
      autocapitalize: "off"
    },
    showCancelButton: true,
    confirmButtonText: "Scale Out",
    confirmButtonColor: "#28a745",
    cancelButtonText: "Cancel",
    position: "top",
    backdrop: `rgba(0, 0, 0, 0.4)`,
    inputValidator: (value) => {
      if (!value || value < 1) {
        return 'Please enter a valid number (minimum 1)';
      }
      if (value > 20) {
        return 'Maximum 20 VMs can be added at once';
      }
    }
  }).then((result) => {
    if (result.isConfirmed) {
      var numVMsToAdd = parseInt(result.value);
      
      // Confirmation dialog
      Swal.fire({
        title: "Confirm Scale Out",
        html: 
          "<div style='text-align: left; margin: 20px;'>" +
          "<p>You are about to add <b>" + numVMsToAdd + " VM(s)</b> to:</p>" +
          "<ul>" +
          "<li>MCI: <b>" + mciid + "</b></li>" +
          "<li>SubGroup: <b>" + subgroupid + "</b></li>" +
          "</ul>" +
          "<p style='color: #dc3545; margin-top: 15px;'><b>⚠️ Warning:</b> This will incur additional costs.</p>" +
          "</div>",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Proceed with Scale Out",
        cancelButtonText: "Cancel",
        confirmButtonColor: "#28a745",
        cancelButtonColor: "#dc3545"
      }).then((confirmResult) => {
        if (confirmResult.isConfirmed) {
          executeScaleOut(namespace, mciid, subgroupid, numVMsToAdd, hostname, port, username, password);
        }
      });
    }
  });
}
window.scaleOutSubGroup = scaleOutSubGroup;

// Improved Scale Out SubGroup function with MCI and SubGroup selection
function scaleOutSubGroupWithSelection() {
  var config = getConfig(); var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = namespaceElement.value;

  if (!namespace) {
    errorAlert("Please select a namespace first");
    return;
  }

  // Use the common MCI selection dialog for ScaleOut operations
  showMciSelectionForScaleOut(
    "Select MCI for Scale Out",
    "Select the MCI to scale out",
    (selectedMciId) => {
      showSubGroupSelectionForScaleOut(selectedMciId, namespace, hostname, port, username, password);
    }
  );
}
window.scaleOutSubGroupWithSelection = scaleOutSubGroupWithSelection;

// Scale Out function for context menu - bypasses MCI selection
function scaleOutMciFromContext(mciId) {
  var config = getConfig(); var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = namespaceElement.value;

  if (!namespace) {
    errorAlert("Please select a namespace first");
    return;
  }

  if (!mciId) {
    errorAlert("MCI ID is required");
    return;
  }

  // Directly show SubGroup selection for the specified MCI
  showSubGroupSelectionForScaleOut(mciId, namespace, hostname, port, username, password);
}
window.scaleOutMciFromContext = scaleOutMciFromContext;

// Step 2: Show SubGroup selection dialog
function showSubGroupSelectionForScaleOut(selectedMciId, namespace, hostname, port, username, password) {
  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mci/${selectedMciId}/subgroup`;
  
  var spinnerId = addSpinnerTask("Loading SubGroup list");

  axios({
    method: "get",
    url: url,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
    timeout: 30000,
  })
    .then((res) => {
      var subGroupOptions = '';
      
      if (res.data.output && res.data.output.length > 0) {
        res.data.output.forEach((subGroupName) => {
          if (subGroupName && subGroupName.trim() !== "") {
            subGroupOptions += `<option value="${subGroupName}">${subGroupName}</option>`;
          }
        });

        // Show SubGroup selection dialog
        Swal.fire({
          title: "Select SubGroup for Scale Out",
          width: 600,
          html:
            "<div style='text-align: left; margin: 20px;'>" +
            "<p><b>Step 2:</b> Select the SubGroup to scale out</p>" +
            "<p><b>Selected MCI:</b> " + selectedMciId + "</p>" +
            "<hr>" +
            "<div class='form-group'>" +
            "<label for='subgroup-select'><b>Available SubGroups:</b></label>" +
            "<select id='subgroup-select' class='form-control' style='margin-top: 10px;'>" +
            "<option value=''>-- Select SubGroup --</option>" +
            subGroupOptions +
            "</select>" +
            "</div>" +
            "</div>",
          showCancelButton: true,
          confirmButtonText: "Next: Configure Scale Out",
          cancelButtonText: "Back",
          confirmButtonColor: "#007bff",
          preConfirm: () => {
            const selectedSubGroup = document.getElementById('subgroup-select').value;
            if (!selectedSubGroup) {
              Swal.showValidationMessage('Please select a SubGroup');
              return false;
            }
            return selectedSubGroup;
          }
        }).then((result) => {
          if (result.isConfirmed) {
            showScaleOutConfiguration(selectedMciId, result.value, namespace, hostname, port, username, password);
          } else if (result.dismiss === Swal.DismissReason.cancel) {
            // Go back to MCI selection
            scaleOutSubGroupWithSelection();
          }
        });
      } else {
        errorAlert("No SubGroups found in the selected MCI");
      }
    })
    .catch(function (error) {
      console.log("Failed to get SubGroup list:", error);
      errorAlert("Failed to load SubGroup list. Please check your connection.");
    })
    .finally(function () {
      removeSpinnerTask(spinnerId);
    });
}

// Step 3: Show scale out configuration dialog
function showScaleOutConfiguration(mciId, subGroupId, namespace, hostname, port, username, password) {
  Swal.fire({
    title: "Configure Scale Out",
    width: 600,
    html:
      "<div style='text-align: left; margin: 20px;'>" +
      "<p><b>Step 3:</b> Configure the scale out operation</p>" +
      "<p><b>Selected MCI:</b> " + mciId + "</p>" +
      "<p><b>Selected SubGroup:</b> " + subGroupId + "</p>" +
      "<hr>" +
      "<p><b>Enter the number of VMs to add:</b></p>" +
      "</div>",
    input: "number",
    inputValue: 1,
    inputAttributes: {
      min: 1,
      max: 20,
      step: 1,
      autocapitalize: "off"
    },
    showCancelButton: true,
    confirmButtonText: "Scale Out",
    confirmButtonColor: "#28a745",
    cancelButtonText: "Back",
    inputValidator: (value) => {
      if (!value || value < 1) {
        return 'Please enter a valid number (minimum 1)';
      }
      if (value > 20) {
        return 'Maximum 20 VMs can be added at once';
      }
    }
  }).then((result) => {
    if (result.isConfirmed) {
      var numVMsToAdd = parseInt(result.value);
      
      // Final confirmation dialog
      Swal.fire({
        title: "Confirm Scale Out",
        html: 
          "<div style='text-align: left; margin: 20px;'>" +
          "<p>You are about to add <b>" + numVMsToAdd + " VM(s)</b> to:</p>" +
          "<ul>" +
          "<li>MCI: <b>" + mciId + "</b></li>" +
          "<li>SubGroup: <b>" + subGroupId + "</b></li>" +
          "</ul>" +
          "<p style='color: #dc3545; margin-top: 15px;'><b>⚠️ Warning:</b> This will incur additional costs.</p>" +
          "</div>",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Proceed with Scale Out",
        cancelButtonText: "Cancel",
        confirmButtonColor: "#28a745",
        cancelButtonColor: "#dc3545"
      }).then((confirmResult) => {
        if (confirmResult.isConfirmed) {
          executeScaleOut(namespace, mciId, subGroupId, numVMsToAdd, hostname, port, username, password);
        }
      });
    } else if (result.dismiss === Swal.DismissReason.cancel) {
      // Go back to SubGroup selection
      showSubGroupSelectionForScaleOut(mciId, namespace, hostname, port, username, password);
    }
  });
}

// Function to execute the scale out operation
function executeScaleOut(namespace, mciid, subgroupid, numVMsToAdd, hostname, port, username, password) {
  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mci/${mciid}/subgroup/${subgroupid}`;
  
  var scaleOutReq = {
    numVMsToAdd: numVMsToAdd.toString()  // Convert to string as expected by API
  };

  var jsonBody = JSON.stringify(scaleOutReq, undefined, 4);
  
  console.log(` Scaling out SubGroup ${subgroupid} by adding ${numVMsToAdd} VM(s)...`);
  var spinnerId = addSpinnerTask(`Scale Out: ${mciid}/${subgroupid} (+${numVMsToAdd} VMs)`);
  infoAlert(`Starting Scale Out: Adding ${numVMsToAdd} VM(s) to ${subgroupid}`);

  var requestId = generateRandomRequestId("scaleout-" + mciid + "-" + subgroupid + "-", 10);
  addRequestIdToSelect(requestId);

  axios({
    method: "post",
    url: url,
    headers: { 
      "Content-Type": "application/json",
      "x-request-id": requestId 
    },
    data: jsonBody,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
    timeout: 600000  // 10 minutes timeout for scale out operation
  })
    .then((res) => {
      console.log("Scale out response:", res);
      
      displayJsonData(res.data, typeInfo);
      handleAxiosResponse(res);
      
      console.log(`Successfully scaled out SubGroup ${subgroupid} by adding ${numVMsToAdd} VM(s)`);
      
      Swal.fire({
        icon: "success",
        title: "Scale Out Successful!",
        html: 
          "<div style='text-align: left;'>" +
          "<p><b>" + numVMsToAdd + " VM(s)</b> have been successfully added to:</p>" +
          "<ul>" +
          "<li>MCI: <b>" + mciid + "</b></li>" +
          "<li>SubGroup: <b>" + subgroupid + "</b></li>" +
          "</ul>" +
          "<p style='margin-top: 15px; color: #28a745;'>✓ The new VMs are being provisioned.</p>" +
          "</div>",
        confirmButtonText: "OK"
      });
      
      // Refresh MCI status after scale out
      setTimeout(() => {
        getMci();
        updateSubGroupList();
        updateVmList();
      }, 3000);
    })
    .catch(function (error) {
      var errorMsg = "Failed to scale out SubGroup";
      
      if (error.response) {
        console.log(error.response.data);
        console.log(error.response.status);
        
        if (error.response.data) {
          if (typeof error.response.data === 'string') {
            errorMsg = error.response.data;
          } else if (error.response.data.message) {
            errorMsg = error.response.data.message;
          } else if (error.response.data.error) {
            errorMsg = error.response.data.error;
          }
        }
        
        displayJsonData(error.response.data, typeError);
      } else if (error.request) {
        errorMsg = "No response from server. Please check the connection.";
        console.log(error.request);
      } else {
        errorMsg = error.message;
        console.log('Error', error.message);
      }
      
      console.log(errorMsg);
      
      Swal.fire({
        icon: "error",
        title: "Scale Out Failed",
        html: 
          "<div style='text-align: left;'>" +
          "<p>Failed to scale out SubGroup <b>" + subgroupid + "</b></p>" +
          "<p style='margin-top: 10px; color: #dc3545;'>Error: " + errorMsg + "</p>" +
          "</div>",
        confirmButtonText: "OK",
        confirmButtonColor: "#dc3545"
      });
      
      console.log(error.config);
    })
    .finally(function () {
      removeSpinnerTask(spinnerId);
    });
}

// Function to show MCI Actions menu in SweetAlert
function showActionsMenu() {
  var mciid = document.getElementById("mciid").value;
  
  if (!mciid) {
    errorAlert("Please select an MCI first");
    return;
  }

  Swal.fire({
    title: "Control MCI",
    width: 600,
    showCancelButton: true,
    showConfirmButton: false,
    cancelButtonText: "Cancel",
    cancelButtonColor: "#6c757d",
    position: "center",
    backdrop: `rgba(0, 0, 0, 0.4)`,
    html: `
      <div style="text-align: left; margin: 20px;">
        <p><b>Selected MCI:</b> ${mciid}</p>
        <hr>
        <p><b>Choose a lifecycle control action:</b></p>
        
        <!-- First row: 3 buttons -->
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-top: 20px;">
          <button type="button" class="btn btn-warning" onclick="executeAction('suspend')" style="margin: 5px;">
            ⏸️ Suspend
          </button>
          <button type="button" class="btn btn-warning" onclick="executeAction('resume')" style="margin: 5px;">
            ▶️ Resume
          </button>
          <button type="button" class="btn btn-warning" onclick="executeAction('reboot')" style="margin: 5px;">
            🔄 Reboot
          </button>
        </div>
        
        <!-- Second row: 3 buttons -->
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-top: 10px;">
          <button type="button" class="btn btn-primary" onclick="executeAction('refine')" style="margin: 5px;">
            ⬆️ Refine
          </button>
          <button type="button" class="btn btn-primary" onclick="executeAction('continue')" style="margin: 5px;">
            ⏭️ Continue
          </button>
          <button type="button" class="btn btn-primary" onclick="executeAction('withdraw')" style="margin: 5px;">
            ⬅️ Withdraw
          </button>
        </div>
        
        <!-- Third row: Terminate button (full width) -->
        <div style="margin-top: 10px;">
          <button type="button" class="btn btn-danger" onclick="executeAction('terminate')" style="margin: 5px; width: 100%;">
            ⏹️ Terminate
          </button>
        </div>
      </div>
    `,
    customClass: {
      popup: 'swal-wide'
    }
  });
}
window.showActionsMenu = showActionsMenu;

// Function to execute selected action and close SweetAlert
function executeAction(action) {
  Swal.close(); // Close the current SweetAlert
  
  // Add confirmation for dangerous actions
  if (action === 'terminate') {
    var mciid = document.getElementById("mciid").value;
    Swal.fire({
      title: "⚠️ Confirm Termination",
      html: `
        <div style="text-align: left; margin: 20px;">
          <p>You are about to <b style="color: #dc3545;">TERMINATE</b> MCI:</p>
          <p><b>${mciid}</b></p>
          <br>
          <p style="color: #dc3545;"><b>⚠️ WARNING:</b> This action is <b>IRREVERSIBLE</b>!</p>
          <p style="color: #dc3545;">All VMs and associated resources will be permanently deleted.</p>
        </div>
      `,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Terminate",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#dc3545",
      cancelButtonColor: "#6c757d"
    }).then((result) => {
      if (result.isConfirmed) {
        controlMCI(action);
      }
    });
  } else if (action === 'withdraw') {
    var mciid = document.getElementById("mciid").value;
    Swal.fire({
      title: "⚠️ Confirm Withdraw",
      html: `
        <div style="text-align: left; margin: 20px;">
          <p>You are about to <b style="color: #ffc107;">WITHDRAW</b> MCI:</p>
          <p><b>${mciid}</b></p>
          <br>
          <p style="color: #ffc107;"><b>⚠️ WARNING:</b> This will shut down all VMs in the MCI.</p>
        </div>
      `,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Withdraw",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#ffc107",
      cancelButtonColor: "#6c757d"
    }).then((result) => {
      if (result.isConfirmed) {
        controlMCI(action);
      }
    });
  } else if (action === 'delete') {
    var mciid = document.getElementById("mciid").value;
    Swal.fire({
      title: "⚠️ Confirm Delete",
      html: `
        <div style="text-align: left; margin: 20px;">
          <p>You are about to <b style="color: #dc3545;">DELETE</b> MCI:</p>
          <p><b>${mciid}</b></p>
          <br>
          <p style="color: #dc3545;"><b>⚠️ WARNING:</b> This action is <b>IRREVERSIBLE</b>!</p>
          <p style="color: #dc3545;">The MCI and all associated resources will be permanently removed.</p>
        </div>
      `,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Delete",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#dc3545",
      cancelButtonColor: "#6c757d"
    }).then((result) => {
      if (result.isConfirmed) {
        deleteMCI();
      }
    });
  } else {
    // For other actions, execute directly with brief confirmation
    var mciid = document.getElementById("mciid").value;
    var actionName = action.charAt(0).toUpperCase() + action.slice(1);
    
    Swal.fire({
      title: `Confirm ${actionName}`,
      html: `
        <div style="text-align: center; margin: 20px;">
          <p>Execute <b>${actionName}</b> on MCI: <b>${mciid}</b>?</p>
        </div>
      `,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: `Yes, ${actionName}`,
      cancelButtonText: "Cancel",
      confirmButtonColor: "#007bff",
      cancelButtonColor: "#6c757d"
    }).then((result) => {
      if (result.isConfirmed) {
        controlMCI(action);
      }
    });
  }
}
window.executeAction = executeAction;

// Common function for ScaleOut operations - MCI selection dialog
function showMciSelectionForScaleOut(title, description, successCallback) {
  // Get MCI list specifically for ScaleOut operations
  var config = getConfig(); var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = namespaceElement.value;

  if (!namespace || namespace === "") {
    errorAlert("Please select a namespace first");
    return;
  }

  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mci?option=id`;
  var spinnerId = addSpinnerTask("Loading MCI list for ScaleOut");

  axios({
    method: "get",
    url: url,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
    timeout: 30000,
  })
    .then((res) => {
      var mciOptions = '';
      
      if (res.data.output && res.data.output.length > 0) {
        res.data.output.forEach((mciId) => {
          if (mciId && mciId.trim() !== "") {
            mciOptions += `<option value="${mciId}">${mciId}</option>`;
          }
        });

        if (mciOptions) {
          // Show MCI selection dialog
          Swal.fire({
            title: title,
            width: 600,
            html:
              "<div style='text-align: left; margin: 20px;'>" +
              "<p><b>Step 1:</b> " + description + "</p>" +
              (vmSubGroupReqeustFromSpecList && vmSubGroupReqeustFromSpecList.length > 0 ? 
                "<p><b>Available VM Configurations:</b> " + vmSubGroupReqeustFromSpecList.length + " location(s)</p>" : "") +
              "<hr>" +
              "<div class='form-group'>" +
              "<label for='mci-select'><b>Available MCIs:</b></label>" +
              "<select id='mci-select' class='form-control' style='margin-top: 10px;'>" +
              "<option value=''>-- Select MCI --</option>" +
              mciOptions +
              "</select>" +
              "</div>" +
              "</div>",
            showCancelButton: true,
            confirmButtonText: "Next",
            cancelButtonText: "Cancel",
            confirmButtonColor: "#28a745",
            preConfirm: () => {
              const selectedMci = document.getElementById('mci-select').value;
              if (!selectedMci) {
                Swal.showValidationMessage('Please select an MCI');
                return false;
              }
              return selectedMci;
            }
          }).then((result) => {
            if (result.isConfirmed) {
              successCallback(result.value);
            }
          });
        } else {
          errorAlert("No MCIs found in the selected namespace");
        }
      } else {
        errorAlert("No MCIs found in the selected namespace");
      }
    })
    .catch(function (error) {
      console.log("Failed to get MCI list for ScaleOut:", error);
      errorAlert("Failed to load MCI list. Please check your connection.");
    })
    .finally(function () {
      removeSpinnerTask(spinnerId);
    });
}

// ScaleOut MCI function with current map configuration
function scaleOutMciWithConfiguration() {
  var config = getConfig(); var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = namespaceElement.value;

  if (!namespace) {
    errorAlert("Please select a namespace first");
    return;
  }

  // Check if we have any VM configuration from the map
  if (!vmSubGroupReqeustFromSpecList || vmSubGroupReqeustFromSpecList.length === 0) {
    errorAlert("Please configure VM specifications first by clicking on the map or using the configuration form");
    return;
  }

  // Use the common MCI selection dialog for ScaleOut operations
  showMciSelectionForScaleOut(
    "Select MCI for VM Addition",
    "Select the MCI to add new VMs",
    (selectedMciId) => {
      showMciScaleOutConfiguration(selectedMciId, namespace, hostname, port, username, password);
    }
  );
}
window.scaleOutMciWithConfiguration = scaleOutMciWithConfiguration;

// Step 2: Show MCI scale out configuration dialog
function showMciScaleOutConfiguration(selectedMciId, namespace, hostname, port, username, password) {
  // Build VM configuration summary from current map settings
  var vmConfigSummary = "";
  var totalVMs = 0;
  
  if (vmSubGroupReqeustFromSpecList && vmSubGroupReqeustFromSpecList.length > 0) {
    vmSubGroupReqeustFromSpecList.forEach((vmConfig, index) => {
      var vmCount = 1; // Default VM count per location
      totalVMs += vmCount;
      vmConfigSummary += 
        "<div style='margin: 5px 0; padding: 8px; background: #f8f9fa; border-radius: 4px;'>" +
        "<b>Location " + (index + 1) + ":</b><br>" +
        "Spec: " + (vmConfig.specId || "Auto-selected") + "<br>" +
        "Image: " + (vmConfig.imageId || "Auto-selected") + "<br>" +
        "Count: " + vmCount + " VM(s)" +
        "</div>";
    });
  }

  Swal.fire({
    title: "Configure MCI Scale Out",
    width: 700,
    html:
      "<div style='text-align: left; margin: 20px;'>" +
      "<p><b>Step 2:</b> Configure VM addition to MCI</p>" +
      "<p><b>Selected MCI:</b> " + selectedMciId + "</p>" +
      "<hr>" +
      "<div style='margin-bottom: 15px;'>" +
      "<label for='subgroup-name'><b>New SubGroup Name:</b></label>" +
      "<input id='subgroup-name' class='form-control' style='margin-top: 5px;' " +
      "placeholder='Enter subgroup name (e.g., web-servers-2)' value='dynamic-group-" + Date.now() + "'>" +
      "</div>" +
      "<div style='margin-bottom: 15px;'>" +
      "<label for='vm-count'><b>Number of VMs per location:</b></label>" +
      "<input id='vm-count' type='number' class='form-control' style='margin-top: 5px;' " +
      "min='1' max='10' value='1' placeholder='Enter number of VMs'>" +
      "</div>" +
      "<hr>" +
      "<p><b>VM Configuration Summary:</b></p>" +
      "<div style='max-height: 200px; overflow-y: auto;'>" +
      vmConfigSummary +
      "</div>" +
      "<hr>" +
      "<p><b>Total VMs to add:</b> <span id='total-vms'>" + totalVMs + "</span></p>" +
      "</div>",
    showCancelButton: true,
    confirmButtonText: "Review Configuration",
    cancelButtonText: "Back",
    confirmButtonColor: "#17a2b8",
    didOpen: () => {
      // Update total VM count when VM count per location changes
      document.getElementById('vm-count').addEventListener('input', function() {
        var vmPerLocation = parseInt(this.value) || 1;
        var totalLocations = vmSubGroupReqeustFromSpecList.length;
        var newTotal = vmPerLocation * totalLocations;
        document.getElementById('total-vms').textContent = newTotal;
      });
    },
    preConfirm: () => {
      const subGroupName = document.getElementById('subgroup-name').value.trim();
      const vmCount = parseInt(document.getElementById('vm-count').value) || 1;
      
      if (!subGroupName) {
        Swal.showValidationMessage('Please enter a SubGroup name');
        return false;
      }
      
      if (vmCount < 1 || vmCount > 10) {
        Swal.showValidationMessage('VM count must be between 1 and 10');
        return false;
      }
      
      return { subGroupName, vmCount };
    }
  }).then((result) => {
    if (result.isConfirmed) {
      var config = result.value;
      // Go to review step first
      showMciScaleOutReview(selectedMciId, config.subGroupName, config.vmCount, namespace, hostname, port, username, password);
    } else if (result.dismiss === Swal.DismissReason.cancel) {
      // Go back to MCI selection
      scaleOutMciWithConfiguration();
    }
  });
}

// Step 2.5: Show MCI scale out review
function showMciScaleOutReview(selectedMciId, subGroupName, vmCountPerLocation, namespace, hostname, port, username, password) {
  // Use the first VM configuration from the map as the template for review
  if (!vmSubGroupReqeustFromSpecList || vmSubGroupReqeustFromSpecList.length === 0) {
    errorAlert("No VM configuration available for review");
    return;
  }

  var vmTemplate = vmSubGroupReqeustFromSpecList[0];
  
  // Build the review request using the template
  var reviewReq = {
    name: subGroupName,
    subGroupSize: vmCountPerLocation.toString(),
    specId: vmTemplate.specId,
    imageId: vmTemplate.imageId,
    description: "Dynamically added via CB-MapUI Scale Out MCI",
    label: {
      "created-by": "cb-mapui",
      "creation-type": "scale-out-mci",
      "timestamp": new Date().toISOString()
    }
  };

  // Add optional fields if available
  if (vmTemplate.rootDiskType) {
    reviewReq.rootDiskType = vmTemplate.rootDiskType;
  }
  if (vmTemplate.rootDiskSize) {
    reviewReq.rootDiskSize = vmTemplate.rootDiskSize;
  }
  if (vmTemplate.connectionName) {
    reviewReq.connectionName = vmTemplate.connectionName;
  }

  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mci/${selectedMciId}/subGroupDynamicReview`;
  var jsonBody = JSON.stringify(reviewReq, undefined, 4);
  
  console.log("Reviewing SubGroup configuration...");
  var spinnerId = addSpinnerTask(`Reviewing SubGroup: ${subGroupName}`);
  infoAlert(`Reviewing SubGroup configuration for ${selectedMciId}...`);

  var requestId = generateRandomRequestId("review-subgroup-" + selectedMciId + "-" + subGroupName + "-", 10);
  addRequestIdToSelect(requestId);

  axios({
    method: "post",
    url: url,
    headers: { 
      "Content-Type": "application/json",
      "x-request-id": requestId 
    },
    data: jsonBody,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
    timeout: 60000
  })
    .then((res) => {
      console.log("SubGroup review completed successfully");
      console.log("Review response data:", res.data);
      successAlert("SubGroup configuration reviewed successfully");
      
      var reviewData = res.data;
      showMciScaleOutReviewResults(selectedMciId, subGroupName, vmCountPerLocation, reviewData, namespace, hostname, port, username, password);
    })
    .catch(function (error) {
      console.log("Failed to review SubGroup configuration:", error);
      console.log("Error details:", error.response ? error.response.data : error.message);
      
      var errorMsg = "Failed to review SubGroup configuration";
      if (error.response && error.response.data) {
        if (typeof error.response.data === 'string') {
          errorMsg += ": " + error.response.data;
        } else if (error.response.data.message) {
          errorMsg += ": " + error.response.data.message;
        } else if (error.response.data.error) {
          errorMsg += ": " + error.response.data.error;
        }
      } else if (error.message) {
        errorMsg += ": " + error.message;
      }
      errorAlert(errorMsg);
    })
    .finally(function () {
      removeSpinnerTask(spinnerId);
    });
}

// Step 2.6: Show review results and proceed to confirmation
function showMciScaleOutReviewResults(selectedMciId, subGroupName, vmCountPerLocation, reviewData, namespace, hostname, port, username, password) {
  console.log("Processing review results:", reviewData);
  
  // Safely extract data with fallbacks
  var canCreate = reviewData.canCreate !== undefined ? reviewData.canCreate : true;
  var status = reviewData.status || 'Unknown';
  var message = reviewData.message || 'No detailed message available';
  var estimatedCost = reviewData.estimatedCost || 'Cost estimation unavailable';
  
  // Build status display
  var statusColor = canCreate ? 
    (status === 'Ready' ? '#28a745' : '#ffc107') : '#dc3545';
  var statusIcon = canCreate ? 
    (status === 'Ready' ? '✅' : '⚠️') : '❌';
  
  // Build warnings and errors display
  var warningsHtml = '';
  if (reviewData.warnings && Array.isArray(reviewData.warnings) && reviewData.warnings.length > 0) {
    warningsHtml = '<div style="margin-top: 15px;"><strong>⚠️ Warnings:</strong><ul>';
    reviewData.warnings.forEach(warning => {
      warningsHtml += `<li style="color: #856404;">${warning}</li>`;
    });
    warningsHtml += '</ul></div>';
  }
  
  var errorsHtml = '';
  if (reviewData.errors && Array.isArray(reviewData.errors) && reviewData.errors.length > 0) {
    errorsHtml = '<div style="margin-top: 15px;"><strong>❌ Errors:</strong><ul>';
    reviewData.errors.forEach(error => {
      errorsHtml += `<li style="color: #721c24;">${error}</li>`;
    });
    errorsHtml += '</ul></div>';
  }
  
  // Build resource validation display
  var validationHtml = '';
  if (reviewData.specValidation) {
    var specStatus = reviewData.specValidation.isAvailable ? '✅' : '❌';
    var specStatusText = reviewData.specValidation.status || 'No status';
    validationHtml += `<p><strong>Spec Validation:</strong> ${specStatus} ${specStatusText}</p>`;
  }
  if (reviewData.imageValidation) {
    var imageStatus = reviewData.imageValidation.isAvailable ? '✅' : '❌';
    var imageStatusText = reviewData.imageValidation.status || 'No status';
    validationHtml += `<p><strong>Image Validation:</strong> ${imageStatus} ${imageStatusText}</p>`;
  }
  
  // Add info section if available
  var infoHtml = '';
  if (reviewData.info && Array.isArray(reviewData.info) && reviewData.info.length > 0) {
    infoHtml = '<div style="margin-top: 15px;"><strong>ℹ️ Additional Information:</strong><ul>';
    reviewData.info.forEach(info => {
      infoHtml += `<li style="color: #0c5460;">${info}</li>`;
    });
    infoHtml += '</ul></div>';
  }
  
  var totalVMs = vmCountPerLocation * vmSubGroupReqeustFromSpecList.length;
  
  Swal.fire({
    title: "SubGroup Configuration Review",
    width: 700,
    html:
      "<div style='text-align: left; margin: 20px;'>" +
      "<p><b>Review Results for SubGroup Addition</b></p>" +
      "<hr>" +
      "<div style='background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 15px;'>" +
      "<h5>📋 Configuration Summary</h5>" +
      "<p><b>Target MCI:</b> " + selectedMciId + "</p>" +
      "<p><b>SubGroup Name:</b> " + subGroupName + "</p>" +
      "<p><b>VMs per location:</b> " + vmCountPerLocation + "</p>" +
      "<p><b>Total locations:</b> " + vmSubGroupReqeustFromSpecList.length + "</p>" +
      "<p><b>Total VMs to add:</b> " + totalVMs + "</p>" +
      "<p><b>Estimated Cost:</b> " + estimatedCost + "</p>" +
      "</div>" +
      "<div style='background: " + statusColor + "20; padding: 15px; border-radius: 8px; border-left: 4px solid " + statusColor + "; margin-bottom: 15px;'>" +
      "<h5>" + statusIcon + " Review Status</h5>" +
      "<p><b>Status:</b> <span style='color: " + statusColor + "; font-weight: bold;'>" + status + "</span></p>" +
      "<p><b>Message:</b> " + message + "</p>" +
      validationHtml +
      "</div>" +
      infoHtml +
      warningsHtml +
      errorsHtml +
      "</div>",
    showCancelButton: true,
    confirmButtonText: canCreate ? "Proceed with Creation" : "Back to Configuration",
    cancelButtonText: "Cancel",
    confirmButtonColor: canCreate ? "#28a745" : "#6c757d",
    cancelButtonColor: "#dc3545",
    allowOutsideClick: false
  }).then((result) => {
    if (result.isConfirmed) {
      if (canCreate) {
        // Proceed to final confirmation
        showMciScaleOutConfirmation(selectedMciId, subGroupName, vmCountPerLocation, namespace, hostname, port, username, password);
      } else {
        // Go back to configuration
        showMciScaleOutConfiguration(selectedMciId, namespace, hostname, port, username, password);
      }
    } else {
      // Cancel the entire operation
      infoAlert("SubGroup addition cancelled");
    }
  });
}

// Step 3: Show final confirmation and execute MCI scale out
function showMciScaleOutConfirmation(mciId, subGroupName, vmCountPerLocation, namespace, hostname, port, username, password) {
  var totalVMs = vmCountPerLocation * vmSubGroupReqeustFromSpecList.length;
  
  Swal.fire({
    title: "Confirm MCI Scale Out",
    html: 
      "<div style='text-align: left; margin: 20px;'>" +
      "<p>You are about to add <b>" + totalVMs + " VM(s)</b> to MCI:</p>" +
      "<ul>" +
      "<li>MCI: <b>" + mciId + "</b></li>" +
      "<li>New SubGroup: <b>" + subGroupName + "</b></li>" +
      "<li>VMs per location: <b>" + vmCountPerLocation + "</b></li>" +
      "<li>Total locations: <b>" + vmSubGroupReqeustFromSpecList.length + "</b></li>" +
      "</ul>" +
      "<p style='color: #dc3545; margin-top: 15px;'><b>⚠️ Warning:</b> This will incur additional costs.</p>" +
      "</div>",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Proceed with VM Addition",
    cancelButtonText: "Cancel",
    confirmButtonColor: "#28a745",
    cancelButtonColor: "#dc3545"
  }).then((confirmResult) => {
    if (confirmResult.isConfirmed) {
      executeMciScaleOut(namespace, mciId, subGroupName, vmCountPerLocation, hostname, port, username, password);
    }
  });
}

// Execute MCI scale out operation
function executeMciScaleOut(namespace, mciId, subGroupName, vmCountPerLocation, hostname, port, username, password) {
  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mci/${mciId}/subGroupDynamic`;
  
  // Build the request body using current map configuration
  var subGroupDynamicReq = {
    name: subGroupName,
    subGroupSize: vmCountPerLocation.toString(),
    description: "Dynamically added via CB-MapUI Scale Out MCI",
    label: {
      "created-by": "cb-mapui",
      "creation-type": "scale-out-mci",
      "timestamp": new Date().toISOString()
    }
  };

  // Use the first VM configuration from the map as the template
  // In a real scenario, you might want to let users select which configuration to use
  if (vmSubGroupReqeustFromSpecList && vmSubGroupReqeustFromSpecList.length > 0) {
    var templateVm = vmSubGroupReqeustFromSpecList[0];
    
    if (templateVm.specId) {
      subGroupDynamicReq.specId = templateVm.specId;
    }
    if (templateVm.imageId) {
      subGroupDynamicReq.imageId = templateVm.imageId;
    }
    if (templateVm.rootDiskType) {
      subGroupDynamicReq.rootDiskType = templateVm.rootDiskType;
    }
    if (templateVm.rootDiskSize) {
      subGroupDynamicReq.rootDiskSize = templateVm.rootDiskSize;
    }
    if (templateVm.connectionName) {
      subGroupDynamicReq.connectionName = templateVm.connectionName;
    }
  }

  var jsonBody = JSON.stringify(subGroupDynamicReq, undefined, 4);
  
  console.log(`Adding VMs to MCI ${mciId} with subgroup ${subGroupName}...`);
  var spinnerId = addSpinnerTask(`Scale Out MCI: ${mciId} (+${vmCountPerLocation * vmSubGroupReqeustFromSpecList.length} VMs)`);
  infoAlert(`Starting MCI Scale Out: Adding ${vmCountPerLocation * vmSubGroupReqeustFromSpecList.length} VM(s) to ${mciId}`);

  var requestId = generateRandomRequestId("mci-scaleout-" + mciId + "-" + subGroupName + "-", 10);
  addRequestIdToSelect(requestId);

  axios({
    method: "post",
    url: url,
    headers: { 
      "Content-Type": "application/json",
      "x-request-id": requestId 
    },
    data: jsonBody,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
    timeout: 600000  // 10 minutes timeout for scale out operation
  })
    .then((res) => {
      console.log("MCI scale out response:", res);
      
      displayJsonData(res.data, typeInfo);
      handleAxiosResponse(res);
      
      // Switch to Control tab after successful scale out (like createMci)
      try {
        // Deactivate all tabs first
        document.querySelectorAll('.nav-link').forEach(tab => {
          tab.classList.remove('active');
        });
        document.querySelectorAll('.tab-pane').forEach(pane => {
          pane.classList.remove('show', 'active');
        });
        
        // Activate control-tab
        const controlTab = document.getElementById('control-tab');
        const controlPane = document.getElementById('control');
        
        if (controlTab && controlPane) {
          controlTab.classList.add('active');
          controlPane.classList.add('show', 'active');
          
          // Trigger Bootstrap tab shown event if needed
          if (typeof $ !== 'undefined' && $.fn.tab) {
            $(controlTab).tab('show');
          }
        }
      } catch (error) {
        console.log('Failed to activate control tab:', error);
      }
      
      console.log(`Successfully added VMs to MCI ${mciId}`);
      
      Swal.fire({
        icon: "success",
        title: "MCI Scale Out Successful!",
        html: 
          "<div style='text-align: left;'>" +
          "<p><b>" + (vmCountPerLocation * vmSubGroupReqeustFromSpecList.length) + " VM(s)</b> have been successfully added to:</p>" +
          "<ul>" +
          "<li>MCI: <b>" + mciId + "</b></li>" +
          "<li>SubGroup: <b>" + subGroupName + "</b></li>" +
          "</ul>" +
          "<p style='margin-top: 15px; color: #28a745;'>✓ The new VMs are being provisioned.</p>" +
          "</div>",
        confirmButtonText: "OK"
      });
      
      // Clear MCI configuration pins and settings after successful scale out (like createMci)
      clearCircle("none");
      
      // Refresh MCI status after scale out
      setTimeout(() => {
        getMci();
        updateMciList();
      }, 3000);
    })
    .catch(function (error) {
      var errorMsg = "Failed to scale out MCI";
      
      if (error.response) {
        console.log(error.response.data);
        console.log(error.response.status);
        
        if (error.response.data) {
          if (typeof error.response.data === 'string') {
            errorMsg = error.response.data;
          } else if (error.response.data.message) {
            errorMsg = error.response.data.message;
          } else if (error.response.data.error) {
            errorMsg = error.response.data.error;
          }
        }
        
        displayJsonData(error.response.data, typeError);
      } else if (error.request) {
        errorMsg = "No response from server. Please check the connection.";
        console.log(error.request);
      } else {
        errorMsg = error.message;
        console.log('Error', error.message);
      }
      
      console.log(errorMsg);
      
      Swal.fire({
        icon: "error",
        title: "MCI Scale Out Failed",
        html: 
          "<div style='text-align: left;'>" +
          "<p>Failed to scale out MCI <b>" + mciId + "</b></p>" +
          "<p style='margin-top: 10px; color: #dc3545;'>Error: " + errorMsg + "</p>" +
          "</div>",
        confirmButtonText: "OK",
        confirmButtonColor: "#dc3545"
      });
      
      console.log(error.config);
    })
    .finally(function () {
      removeSpinnerTask(spinnerId);
    });
}


// Draw Objects to the Map
function drawObjects(event) {
  //event.frameState = event.frameState / 10;
  //console.log("event.frameState");
  //console.log(event.frameState);

  var vectorContext = getVectorContext(event);
  var frameState = event.frameState;
  var theta = (2 * Math.PI * frameState.time) / omegaTheta;

  // Shuffle keys every shuffleInterval draws
  drawCounter++;
  if (drawCounter % shuffleInterval === 0) {
    shuffleKeys();
  }

  // Get the selected providers from checkboxes
  var selectedProviders = getSelectedProviders();
  var isAllSelected = selectedProviders.includes("ALL") || selectedProviders.length === 0;

  // Draw CSP location first with the stored random order
  shuffledKeys.forEach((key) => {
    if (isAllSelected || selectedProviders.includes(key)) {
      if (Array.isArray(geoCspPoints[key]) && geoCspPoints[key].length) {
        vectorContext.setStyle(cspIconStyles[key]);
        vectorContext.drawGeometry(geoCspPoints[key][0]);
      }
    }
  });

  // Draw MCI Geometry
  for (i = geometries.length - 1; i >= 0; --i) {
    var polyStyle = new Style({
      stroke: new Stroke({
        width: 1,
        color: cororLineList[i % cororList.length],
      }),
      fill: new Fill({
        color: cororList[i % cororList.length],
      }),
    });

    vectorContext.setStyle(polyStyle);
    vectorContext.drawGeometry(geometries[i]);
  }

  if (cspPointsCircle.length) {
    //console.log("cspPointsCircle.length:" +cspPointsCircle.length + "cspPointsCircle["+cspPointsCircle+"]")
    // Fix: Create MultiPoint with proper coordinate structure
    geoCspPointsCircle[0] = new MultiPoint(cspPointsCircle);
    vectorContext.setStyle(iconStyleCircle);
    vectorContext.drawGeometry(geoCspPointsCircle[0]);
    
    // Draw convex hull polygon for configuration points (like existing MCI VMs)
    if (cspPointsCircle.length >= 3) {
      // Create deep copy to avoid modifying original array (convexHull sorts input)
      const pointsCopy = cspPointsCircle.map(point => [point[0], point[1]]);
      
      // Debug: log points before convex hull
      console.log("Original points:", cspPointsCircle);
      console.log("Points copy:", pointsCopy);
      
      const hullPoints = convexHull(pointsCopy);
      
      // Debug: log hull result
      console.log("Hull points:", hullPoints);
      
      if (hullPoints.length >= 3) {
        // Ensure the polygon is closed by adding the first point at the end
        const closedHull = [...hullPoints, hullPoints[0]];
        const configPolygon = new Polygon([closedHull]);
        const configPolyStyle = new Style({
          stroke: new Stroke({
            width: 2,
            color: [169, 169, 169, 0.8], // Light gray with transparency
            lineDash: [5, 5] // Dashed line for config state
          }),
          fill: new Fill({
            color: [192, 192, 192, 0.1], // Very light gray fill
          }),
        });
        vectorContext.setStyle(configPolyStyle);
        vectorContext.drawGeometry(configPolygon);
      }
    }
  }

  if (geoResourceLocation.vnet[0]) {
    vectorContext.setStyle(iconStyleVnet);
    vectorContext.drawGeometry(geoResourceLocation.vnet[0]);
  }
  if (geoResourceLocation.sg[0]) {
    vectorContext.setStyle(iconStyleSG);
    vectorContext.drawGeometry(geoResourceLocation.sg[0]);
  }
  if (geoResourceLocation.sshKey[0]) {
    vectorContext.setStyle(iconStyleKey);
    vectorContext.drawGeometry(geoResourceLocation.sshKey[0]);
  }
  if (geoResourceLocation.k8s[0]) {
    vectorContext.setStyle(iconStyleK8s);
    vectorContext.drawGeometry(geoResourceLocation.k8s[0]);
  }
  if (geoResourceLocation.vpn[0]) {
    vectorContext.setStyle(iconStyleVPN);
    vectorContext.drawGeometry(geoResourceLocation.vpn[0]);
  }

  // Draw MCI Points and Individual VM Status Badges
  for (i = geometries.length - 1; i >= 0; --i) {
    const geometryPoint = geometriesPoints[i];
    
    // Skip if no geometry point (e.g., preparing/prepared MCI)
    if (!geometryPoint) {
      continue;
    }
    
    // Check if geometryPoint has the new structure with VM data
    if (geometryPoint && typeof geometryPoint === 'object' && geometryPoint.geometry) {
      // New structure: Draw individual VMs with status badges and provider icons
      const { geometry, vmPoints, vmStatuses, vmProviders, vmCommandStatuses } = geometryPoint;
      const vmBaseScale = changeSizeStatus(mciName[i] + mciStatus[i]);
      
      // Draw individual VM icons with status badges and provider icons
      if (vmPoints && vmStatuses) {
        vmStatuses.forEach((vmStatus, vmIndex) => {
          if (vmPoints[vmIndex]) {
            const vmCoords = vmPoints[vmIndex];
            const vmProvider = vmProviders ? vmProviders[vmIndex] : null;
            const commandStatus = vmCommandStatuses ? vmCommandStatuses[vmIndex] : "None";
            const vmStyles = createVmStyleWithStatusBadge(vmStatus, vmProvider, vmBaseScale, vmCoords, commandStatus);
            
            // Test displacement approach - apply all styles to same geometry
            const vmPoint = new Point(vmCoords);
            
            vmStyles.forEach(style => {
              vectorContext.setStyle(style);
              vectorContext.drawGeometry(vmPoint);
            });
          }
        });
      }
    } else {
      // Legacy structure: Draw single MCI icon (fallback)
      if (mciName[i].includes("NLB")) {
        vectorContext.setStyle(iconStyleNlb);
      } else {
        vectorContext.setStyle(iconStyleVm);
      }
      
      // Handle legacy geometry structure
      const legacyGeometry = geometryPoint || geometriesPoints[i];
      if (legacyGeometry) {
        vectorContext.drawGeometry(legacyGeometry);
      }
    }
  }

  // Draw K8s cluster text (name and status)
  for (i = 0; i < k8sName.length; i++) {
    if (k8sCoords[i] && k8sName[i]) {
      // Create Point geometry from stored coordinates
      const k8sPoint = new Point(k8sCoords[i]);
      
      // Split K8s cluster name into lines for better display
      const nameLines = splitK8sNameToLines(k8sName[i]);
      const lineHeight = 28; // Spacing between lines (slightly larger than MCI due to bigger font)
      const baseOffsetY = 30; // Position below the icon
      
      // Draw each line of the K8s cluster name
      nameLines.forEach((line, lineIndex) => {
        const k8sNameStyle = new Style({
          text: new Text({
            text: line,
            font: "bold 24px sans-serif", // Increased from 20px to 24px (20% larger)
            scale: 1.0, // Fixed scale for K8s clusters
            offsetY: baseOffsetY + (lineIndex * lineHeight), // Offset each line down
            stroke: new Stroke({
              color: [255, 255, 255, 1], // white stroke
              width: 2, // Adjusted stroke width proportionally
            }),
            fill: new Fill({
              color: [0, 0, 0, 1], // black text
            }),
          }),
        });
        
        vectorContext.setStyle(k8sNameStyle);
        vectorContext.drawGeometry(k8sPoint);
      });

      // K8s cluster status text with appropriate color
      const statusOffsetY = baseOffsetY + (nameLines.length * lineHeight) + 8; // Position below the name lines with gap
      const statusColors = getK8sStatusColor(k8sStatus[i]);
      const k8sStatusStyle = new Style({
        text: new Text({
          text: k8sStatus[i],
          font: "bold 22px sans-serif", // Increased from 18px to 22px (20% larger)
          scale: 0.9, // Slightly smaller for status
          offsetY: statusOffsetY, // Use calculated offset based on name lines
          stroke: new Stroke({
            color: statusColors.stroke,
            width: 2, // Adjusted stroke width proportionally
          }),
          fill: new Fill({
            color: statusColors.fill,
          }),
        }),
      });

      // Draw status text
      vectorContext.setStyle(k8sStatusStyle);
      vectorContext.drawGeometry(k8sPoint);
    }
  }

  for (i = geometries.length - 1; i >= 0; --i) {
    // MCI text style with multi-line support
    const nameLines = splitMciNameToLines(mciName[i]);
    const baseScale = changeSizeByName(mciName[i] + mciStatus[i]) + 0.1;
    const baseOffsetY = 32 * changeSizeByName(mciName[i] + mciStatus[i]);
    const lineHeight = 12 * baseScale; // Spacing between lines
    
    // Draw each line of the MCI name
    nameLines.forEach((line, lineIndex) => {
      let displayText = line;
      
      // Add animation only to the first line if targetAction is active
      if (lineIndex === 0 && mciTargetAction[i]) {
        const spinChars = ['⠿', '⠷', '⠯', '⠟', '⠻', '⠽', '⠾', '⠷','⠿'];
        const animIndex = Math.floor(drawCounter / 10 + i) % spinChars.length;
        displayText = spinChars[animIndex] + ' ' + displayText;
      }
      
      // Get text color - use targetAction color for spinner lines, black for others
      const textColor = (lineIndex === 0 && mciTargetAction[i]) 
        ? getTargetActionColor(mciTargetAction[i])
        : [0, 0, 0, 1]; // black for default
      
      var polyNameTextStyle = new Style({
        text: new Text({
          text: displayText,
          font: "bold 10px sans-serif",
          scale: baseScale,
          offsetY: baseOffsetY + (lineIndex * lineHeight), // Offset each line down
          stroke: new Stroke({
            color: [255, 255, 255, 1], //white
            width: 1,
          }),
          fill: new Fill({
            color: textColor,
          }),
        }),
      });

      vectorContext.setStyle(polyNameTextStyle);
      vectorContext.drawGeometry(geometries[i]);
    });
  }

  // Draw MCI status text
  for (i = geometries.length - 1; i >= 0; --i) {
    const statusColors = getVmStatusColor(mciStatus[i]);
    
    // Calculate dynamic offset for status text based on MCI name lines
    const nameLines = splitMciNameToLines(mciName[i]);
    const baseScale = changeSizeByName(mciName[i] + mciStatus[i]) + 0.1;
    const lineHeight = 12 * baseScale;
    const nameHeight = nameLines.length * lineHeight;
    const statusOffsetY = 32 * changeSizeByName(mciName[i] + mciStatus[i]) + nameHeight + 8; // 8px gap between name and status
    
    // MCI status style
    var polyStatusTextStyle = new Style({
      // MCI status text style
      text: new Text({
        text: mciStatus[i],
        font: "bold 10px sans-serif",
        scale: changeSizeStatus(mciName[i] + mciStatus[i]),
        offsetY: statusOffsetY,
        stroke: new Stroke({
          color: statusColors.stroke,
          width: 2, // Slightly thicker stroke for better readability
        }),
        fill: new Fill({
          color: statusColors.fill,
        }),
      }),
    });
    vectorContext.setStyle(polyStatusTextStyle);
    vectorContext.drawGeometry(geometries[i]);
  }


  map.render();
}

tileLayer.on("postrender", function (event) {
  drawObjects(event);
});

// Function to sync MCI selection from Dashboard
function syncMciSelectionFromDashboard(mciId) {
  console.log(`[SYNC] Attempting to sync MCI selection: ${mciId}`);
  console.log(`[SYNC] mciidElement exists:`, !!mciidElement);
  
  if (mciidElement && mciId) {
    console.log(`[SYNC] Current value: ${mciidElement.value}, New value: ${mciId}`);
    
    // Check if the option exists in the select element
    const optionExists = Array.from(mciidElement.options).some(option => option.value === mciId);
    console.log(`[SYNC] Option exists in select:`, optionExists);
    
    if (optionExists) {
      // Set the value in the MCI select element
      mciidElement.value = mciId;
      
      // Trigger change event to update dependent dropdowns
      const changeEvent = new Event('change', { bubbles: true });
      mciidElement.dispatchEvent(changeEvent);
      
      console.log(`[SYNC] MCI selection synced successfully: ${mciId}`);
    } else {
      console.log(`[SYNC] MCI ${mciId} not found in select options`);
    }
  } else {
    console.log(`[SYNC] Failed - mciidElement:`, !!mciidElement, `mciId:`, mciId);
  }
}

// Load K8s cluster data for dashboard and map
function loadK8sClusterData() {
  var hostname = configHostname;
  var port = configPort;
  var username = configUsername;
  var password = configPassword;
  var namespace = namespaceElement.value;

  if (!namespace || namespace === "") {
    console.log("No namespace specified for K8s cluster data load");
    return;
  }

  // Set loading status
  window.cloudBaristaCentralData.apiStatus.k8sCluster = 'loading';

  // get k8sCluster list and put them on the map
  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/k8sCluster`;
  axios({
    method: "get",
    url: url,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
    timeout: 10000,
  }).then((res) => {
    var obj = res.data;
    console.log('K8s cluster API response:', obj);
    console.log('K8s cluster API response structure:', JSON.stringify(obj, null, 2));
    
    // Update central data store - handle both response formats
    let k8sClusterData = [];
    if (obj.K8sClusterInfo) {
      k8sClusterData = obj.K8sClusterInfo;
      console.log('Using K8sClusterInfo field');
    } else if (obj.cluster) {
      k8sClusterData = obj.cluster;
      console.log('Using cluster field');
    }
    
    console.log('Final k8sClusterData:', k8sClusterData);
    
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
      k8sName = [];
      k8sStatus = [];
      k8sCoords = [];
      
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
        }
      }
      console.log(resourceLocation);
      if (resourceLocation.length > 0) {
        geoResourceLocation.k8s[0] = new MultiPoint([resourceLocation]);
      }
    } else {
      // Clear k8s icons when list is empty
      geoResourceLocation.k8s = [];
      k8sName = [];
      k8sStatus = [];
      k8sCoords = [];
    }
    
    console.log('K8s cluster data loaded successfully:', k8sClusterData.length, 'clusters');
  })
    .catch(function (error) {
      console.log("k8sCluster API error:", error);
      console.log("Keeping existing K8s cluster data to preserve user experience");
      
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

// Load VPN data from all MCIs (reusing existing MCI data)
async function loadVpnDataFromMcis() {
  try {
    const config = getConfig();
    const { hostname, port, username, password } = config;
    const namespace = namespaceElement?.value || config.username;
    
    // Use existing MCI data from central store - no fallback API call
    let mciData = [];
    if (window.cloudBaristaCentralData && window.cloudBaristaCentralData.mci) {
      mciData = window.cloudBaristaCentralData.mci;
      debugLog.resource('Using cached MCI data for VPN loading:', mciData.length, 'MCIs');
    } else {
      debugLog.resource('Central MCI data not available, skipping VPN loading');
      // Clear VPN data and return early - no point in loading VPN without MCIs
      window.cloudBaristaCentralData.vpn = [];
      geoResourceLocation.vpn = [];
      return;
    }
    
    // If no MCIs exist, no point in trying to load VPN data
    if (!mciData || mciData.length === 0) {
      debugLog.resource('No MCIs available, skipping VPN loading');
      window.cloudBaristaCentralData.vpn = [];
      geoResourceLocation.vpn = [];
      return;
    }
    
    let allVpnData = [];
    let resourceLocation = [];
    
    // Load VPN data from each MCI
    for (const mci of mciData) {
      try {
        const vpnUrl = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mci/${mci.id}/vpn`;
        const vpnResponse = await axios({
          method: "get",
          url: vpnUrl,
          auth: { username, password },
          timeout: 5000
        });
        
        const vpnData = vpnResponse.data?.vpn || [];
        debugLog.api(`VPN data for MCI ${mci.id}:`, vpnData.length, 'VPNs');
        
        // Add MCI ID to each VPN for reference
        vpnData.forEach(vpn => {
          vpn.mciId = mci.id;
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
        // Silently continue if VPN API fails for individual MCI
        debugLog.api(`VPN API error for MCI ${mci.id}:`, vpnError.message);
      }
    }
    
    // Store VPN data in central store
    window.cloudBaristaCentralData.vpn = allVpnData;
    debugLog.resource('Total VPN data stored:', allVpnData.length, 'VPNs from', mciData.length, 'MCIs');
    
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
window.syncMciSelectionFromDashboard = syncMciSelectionFromDashboard;

// ============================================
// Snapshot Management Functions
// ============================================

// Global variables for snapshot auto-refresh
window.snapshotAutoRefreshEnabled = false;
window.snapshotAutoRefreshInterval = null;
window.snapshotLastImageData = null; // Store last image data to prevent unnecessary re-renders

// Toggle Auto-refresh for Snapshot Management
function toggleSnapshotAutoRefresh() {
  window.snapshotAutoRefreshEnabled = !window.snapshotAutoRefreshEnabled;
  
  const btn = document.getElementById('toggleAutoRefreshBtn');
  const status = document.getElementById('autoRefreshStatus');
  
  if (window.snapshotAutoRefreshEnabled) {
    btn.innerHTML = '⏸️ Pause Auto-refresh';
    btn.className = 'btn btn-success btn-sm';
    status.innerHTML = '🟢 Auto-refreshing every 5 seconds';
  } else {
    btn.innerHTML = '▶️ Resume Auto-refresh';
    btn.className = 'btn btn-warning btn-sm';
    status.innerHTML = '🔴 Auto-refresh paused';
  }
}

// Show Snapshot Management Modal
async function showSnapshotManagementModal() {
  const namespace = document.getElementById('namespace').value;
  if (!namespace) {
    Swal.fire('Warning', 'Please select a namespace first', 'warning');
    return;
  }

  // Get pre-selected MCI from control panel (if any)
  const preSelectedMci = document.getElementById('mciid')?.value || '';

  // Load MCI list
  const config = getConfig();
  let mciList = [];
  try {
    const response = await axios.get(`http://${config.hostname}:${config.port}/tumblebug/ns/${namespace}/mci`, {
      auth: { username: config.username, password: config.password },
      headers: { 'Content-Type': 'application/json' }
    });
    mciList = response.data.mci || [];
  } catch (error) {
    console.error('Error loading MCI list:', error);
  }

  Swal.fire({
    title: '📸 Snapshot Management',
    html: `
      <style>
        .swal2-html-container { padding: 0 1.6em !important; }
        .snapshot-compact-form { text-align: left; padding: 0; margin: 0; }
        .snapshot-compact-form h5 { margin: 0 0 10px 0; font-size: 16px; }
        .snapshot-compact-form .form-row { display: flex; gap: 10px; margin-bottom: 8px; }
        .snapshot-compact-form .form-col { flex: 1; min-width: 0; }
        .snapshot-compact-form label { display: block; margin: 0 0 3px 0; font-size: 13px; font-weight: 500; }
        .snapshot-compact-form .form-control-sm { height: 28px; font-size: 13px; padding: 3px 8px; }
        .snapshot-compact-form hr { margin: 12px 0; border-top: 1px solid #dee2e6; }
        .snapshot-compact-form .btn { margin: 8px 0; }
      </style>
      <div class="snapshot-compact-form">
        <h5>Create VM Snapshot</h5>
        <div class="form-row">
          <div class="form-col">
            <label>Select MCI:</label>
            <select id="snapshotMciSelect" class="form-control form-control-sm">
              <option value="">-- Select MCI --</option>
              ${mciList.map(mci => `<option value="${mci.id}" ${mci.id === preSelectedMci ? 'selected' : ''}>${mci.id}</option>`).join('')}
            </select>
          </div>
          <div class="form-col">
            <label>Select VM:</label>
            <select id="snapshotVmSelect" class="form-control form-control-sm">
              <option value="">-- Select MCI First --</option>
            </select>
            <small class="form-text text-muted" style="margin-top: 2px;">Select "🌐 All VMs" for MCI-wide snapshot</small>
          </div>
        </div>
        <div class="form-row">
          <div class="form-col">
            <label>Snapshot Name (optional):</label>
            <input type="text" id="snapshotName" class="form-control form-control-sm" placeholder="Auto-generated if empty">
          </div>
          <div class="form-col">
            <label>Description (optional):</label>
            <input type="text" id="snapshotDescription" class="form-control form-control-sm" placeholder="Snapshot description">
          </div>
        </div>
        <button onclick="createVmSnapshotFromModal()" class="btn btn-primary btn-block">📸 Create Snapshot</button>
        
        <hr>
        
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <h5 style="margin: 0;">Custom Images</h5>
          <div>
            <button id="refreshNowBtn" class="btn btn-info btn-sm" style="margin-right: 5px;">🔄 Refresh Now</button>
            <button id="toggleAutoRefreshBtn" class="btn btn-success btn-sm">⏸️ Pause Auto-refresh</button>
          </div>
        </div>
        <div style="font-size: 11px; color: #6c757d; margin-bottom: 5px;">
          <span id="autoRefreshStatus">🟢 Auto-refreshing every 5 seconds</span> | 
          <span id="lastRefreshTime">Last refresh: -</span>
        </div>
        <div id="customImageListContainer" style="max-height: 400px; overflow-y: auto;">
          <p class="text-muted">Loading custom images...</p>
        </div>
      </div>
    `,
    width: '80%',
    showConfirmButton: false,
    showCancelButton: true,
    cancelButtonText: '❌ Close',
    customClass: {
      htmlContainer: 'swal2-html-container-compact'
    },
    didOpen: async () => {
      // Store namespace in window for access from modal functions
      window.currentSnapshotNamespace = namespace;
      
      // MCI selection change handler
      const loadVmsForMci = async function(mciId) {
        const vmSelect = document.getElementById('snapshotVmSelect');
        vmSelect.innerHTML = '<option value="">-- Loading VMs --</option>';
        
        if (!mciId) {
          vmSelect.innerHTML = '<option value="">-- Select MCI First --</option>';
          return;
        }

        try {
          const response = await axios.get(
            `http://${config.hostname}:${config.port}/tumblebug/ns/${namespace}/mci/${mciId}`,
            {
              auth: { username: config.username, password: config.password },
              headers: { 'Content-Type': 'application/json' }
            }
          );
          
          const vms = response.data.vm || [];
          // Add "All VMs" option for MCI-wide snapshot
          vmSelect.innerHTML = '<option value="">-- Select VM or All --</option>' + 
            '<option value="__ALL_VMS__">🌐 All VMs (MCI Snapshot - one per subgroup)</option>' +
            vms.map(vm => `<option value="${vm.id}">${vm.id} (${vm.status})</option>`).join('');
        } catch (error) {
          console.error('Error loading VM list:', error);
          vmSelect.innerHTML = '<option value="">-- Error loading VMs --</option>';
        }
      };
      
      document.getElementById('snapshotMciSelect').addEventListener('change', async function() {
        await loadVmsForMci(this.value);
      });
      
      // If MCI is pre-selected, auto-load its VMs
      if (preSelectedMci) {
        await loadVmsForMci(preSelectedMci);
      }
      
      // Auto-refresh setup (5 seconds interval)
      window.snapshotAutoRefreshEnabled = true;
      window.snapshotAutoRefreshInterval = null;
      window.snapshotLastImageData = null; // Reset cached data
      
      // Setup refresh now button event listener
      const refreshNowBtn = document.getElementById('refreshNowBtn');
      if (refreshNowBtn) {
        refreshNowBtn.addEventListener('click', function() {
          loadCustomImagesInModal(namespace);
        });
      }
      
      // Setup toggle button event listener
      const toggleBtn = document.getElementById('toggleAutoRefreshBtn');
      if (toggleBtn) {
        toggleBtn.addEventListener('click', function() {
          window.snapshotAutoRefreshEnabled = !window.snapshotAutoRefreshEnabled;
          
          const status = document.getElementById('autoRefreshStatus');
          
          if (window.snapshotAutoRefreshEnabled) {
            this.innerHTML = '⏸️ Pause Auto-refresh';
            this.className = 'btn btn-success btn-sm';
            if (status) status.innerHTML = '🟢 Auto-refreshing every 5 seconds';
          } else {
            this.innerHTML = '▶️ Resume Auto-refresh';
            this.className = 'btn btn-warning btn-sm';
            if (status) status.innerHTML = '🔴 Auto-refresh paused';
          }
        });
      }
      
      // Initial load with slight delay to ensure DOM is ready
      setTimeout(() => {
        loadCustomImagesInModal(namespace);
      }, 100);
      
      // Start auto-refresh timer
      window.snapshotAutoRefreshInterval = setInterval(() => {
        if (window.snapshotAutoRefreshEnabled) {
          loadCustomImagesInModal(namespace);
        }
      }, 5000); // 5 seconds
    },
    willClose: () => {
      // Cleanup: clear auto-refresh timer when modal closes
      if (window.snapshotAutoRefreshInterval) {
        clearInterval(window.snapshotAutoRefreshInterval);
        window.snapshotAutoRefreshInterval = null;
      }
      window.snapshotAutoRefreshEnabled = false;
      // Note: Don't clear window.currentSnapshotNamespace here
      // It will be updated when a new modal opens
    }
  });
}

// Create VM Snapshot (supports both single VM and MCI-wide snapshots)
async function createVmSnapshotFromModal() {
  const namespace = document.getElementById('namespace').value;
  const mciId = document.getElementById('snapshotMciSelect').value;
  const vmId = document.getElementById('snapshotVmSelect').value;
  const snapshotName = document.getElementById('snapshotName').value;
  const description = document.getElementById('snapshotDescription').value;

  if (!mciId || !vmId) {
    Swal.fire('Warning', 'Please select MCI and VM (or All VMs)', 'warning');
    return;
  }

  const config = getConfig();
  const isMciSnapshot = (vmId === '__ALL_VMS__');
  
  try {
    Swal.fire({
      title: isMciSnapshot ? 'Creating MCI Snapshots...' : 'Creating VM Snapshot...',
      html: isMciSnapshot ? 
        'Creating snapshots for all subgroups in parallel...<br>This may take several minutes...' : 
        'This may take a few minutes...',
      allowOutsideClick: false,
      didOpen: () => { Swal.showLoading(); }
    });

    const requestBody = {
      name: snapshotName || undefined,
      description: description || undefined
    };

    let response;
    if (isMciSnapshot) {
      // MCI-wide snapshot (all subgroups)
      response = await axios.post(
        `http://${config.hostname}:${config.port}/tumblebug/ns/${namespace}/mci/${mciId}/snapshot`,
        requestBody,
        {
          auth: { username: config.username, password: config.password },
          headers: { 'Content-Type': 'application/json' }
        }
      );
      
      // Display MCI snapshot results
      const results = response.data.results || [];
      const successCount = response.data.successCount || 0;
      const failCount = response.data.failCount || 0;
      
      const resultsHtml = results.map(result => {
        const statusIcon = result.status === 'Success' ? '✅' : '❌';
        const statusClass = result.status === 'Success' ? 'success' : 'danger';
        const statusBadge = result.imageInfo?.imageStatus ? 
          `<span class="badge badge-info" style="font-size: 11px;">${result.imageInfo.imageStatus}</span>` : '';
        
        return `
          <tr>
            <td>${statusIcon}</td>
            <td>${result.subGroupId}</td>
            <td>${result.vmId}</td>
            <td>${result.imageId || 'N/A'} ${statusBadge}</td>
            <td><span class="badge badge-${statusClass}">${result.status}</span></td>
            <td style="font-size: 11px; color: ${result.error ? 'red' : 'inherit'};">${result.error || '-'}</td>
          </tr>
        `;
      }).join('');
      
      Swal.fire({
        icon: successCount > 0 ? 'success' : 'error',
        title: 'MCI Snapshot Completed',
        html: `
          <div style="text-align: left; padding: 10px;">
            <p><strong>MCI ID:</strong> ${response.data.mciId}</p>
            <p><strong>Summary:</strong> 
              <span class="badge badge-success">${successCount} Success</span> 
              <span class="badge badge-danger">${failCount} Failed</span>
            </p>
            <div style="max-height: 400px; overflow-y: auto; margin-top: 10px;">
              <table class="table table-sm table-bordered">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>SubGroup</th>
                    <th>VM ID</th>
                    <th>Image ID</th>
                    <th>Result</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  ${resultsHtml}
                </tbody>
              </table>
            </div>
            ${failCount > 0 ? 
              '<p class="text-warning"><strong>⚠️ Note:</strong> Some snapshots failed. Check error details above.</p>' : 
              '<p class="text-success"><strong>✅ All snapshots created successfully!</strong></p>'}
          </div>
        `,
        width: '900px',
        confirmButtonText: 'OK'
      }).then(() => {
        showSnapshotManagementModal();
      });
      
    } else {
      // Single VM snapshot
      response = await axios.post(
        `http://${config.hostname}:${config.port}/tumblebug/ns/${namespace}/mci/${mciId}/vm/${vmId}/snapshot`,
        requestBody,
        {
          auth: { username: config.username, password: config.password },
          headers: { 'Content-Type': 'application/json' }
        }
      );

      // Create status badge with color
      const statusClass = response.data.imageStatus === 'Available' ? 'success' : 
                         response.data.imageStatus === 'Creating' ? 'info' : 
                         response.data.imageStatus === 'Failed' ? 'danger' : 'warning';
      
      Swal.fire({
        icon: 'success',
        title: 'VM Snapshot Created!',
        html: `
          <div style="text-align: left; padding: 10px;">
            <p><strong>Image ID:</strong> ${response.data.id}</p>
            <p><strong>Image Status:</strong> <span class="badge badge-${statusClass}" style="font-size: 14px;">${response.data.imageStatus}</span></p>
            <p><strong>Provider:</strong> ${response.data.providerName || 'N/A'}</p>
            <p><strong>Region:</strong> ${response.data.regionList ? response.data.regionList.join(', ') : 'N/A'}</p>
            <p><strong>Description:</strong> ${response.data.description || 'N/A'}</p>
            ${response.data.imageStatus !== 'Available' ? 
              '<p class="text-warning"><strong>⚠️ Note:</strong> Snapshot is being created. Status will be updated shortly.</p>' : 
              '<p class="text-success"><strong>✅ Snapshot is ready to use!</strong></p>'}
          </div>
        `,
        confirmButtonText: 'OK'
      }).then(() => {
        showSnapshotManagementModal();
      });
    }

  } catch (error) {
    console.error('Error creating snapshot:', error);
    Swal.fire({
      icon: 'error',
      title: 'Snapshot Creation Failed',
      text: error.response?.data?.message || error.message || 'Unknown error occurred'
    });
  }
}

// Load Custom Images (with smart refresh to prevent flickering)
async function loadCustomImagesInModal(namespace) {
  // Priority: passed parameter > window storage > input field
  if (!namespace) {
    namespace = window.currentSnapshotNamespace || document.getElementById('namespace')?.value;
  }
  
  console.log('loadCustomImagesInModal called with namespace:', namespace);
  
  if (!namespace) {
    console.error('Namespace not available in loadCustomImagesInModal');
    const container = document.getElementById('customImageListContainer');
    if (container) {
      container.innerHTML = '<p class="text-danger">Error: Namespace not available</p>';
    }
    return;
  }
  
  const config = getConfig();
  const container = document.getElementById('customImageListContainer');
  
  if (!container) {
    console.error('customImageListContainer element not found');
    return;
  }
  
  // Update last refresh time
  const lastRefreshElement = document.getElementById('lastRefreshTime');
  if (lastRefreshElement) {
    const now = new Date();
    lastRefreshElement.innerHTML = `Last refresh: ${now.toLocaleTimeString()}`;
  }
  
  // Show loading only on first load
  if (!window.snapshotLastImageData) {
    container.innerHTML = '<p class="text-muted">Loading...</p>';
  }

  try {
    const response = await axios.get(
      `http://${config.hostname}:${config.port}/tumblebug/ns/${namespace}/resources/customImage`,
      {
        auth: { username: config.username, password: config.password },
        headers: { 'Content-Type': 'application/json' }
      }
    );

    const images = response.data.customImage || [];
    
    // Compare with last data to prevent unnecessary re-render
    const currentDataString = JSON.stringify(images);
    if (window.snapshotLastImageData === currentDataString) {
      // Data hasn't changed, skip re-render
      return;
    }
    
    // Update stored data
    window.snapshotLastImageData = currentDataString;
    
    if (images.length === 0) {
      container.innerHTML = '<p class="text-muted">No custom images found</p>';
      return;
    }

    let html = '<div style="overflow-x: auto;"><table class="table table-sm table-striped" style="font-size: 12px;"><thead><tr><th>Provider (Region)</th><th>ID (Status)</th><th>OS (Arch)</th><th>Description</th><th>Source VM UID</th><th>Created</th><th>Action</th></tr></thead><tbody>';
    
    images.forEach(img => {
      // Enhanced status badge with icons and colors
      let statusIcon = '';
      
      if (img.imageStatus === 'Available') {
        statusIcon = '✅';
      } else if (img.imageStatus === 'Unavailable') {
        statusIcon = '⏳';
      } else {
        statusIcon = '⚠️';
      }
      
      // Combine provider and region
      const providerRegion = `${img.providerName || 'N/A'} (${img.regionList && img.regionList.length > 0 ? img.regionList[0] : 'N/A'})`;
      
      // Combine ID and status
      const idWithStatus = `${img.id.substring(0, 12)}${img.id.length > 12 ? '...' : ''} (${statusIcon})`;
      
      // Combine OS type and architecture
      const osInfo = `${img.osType || 'N/A'} (${img.osArchitecture || 'N/A'})`;
      
      // Truncate long description
      const descShort = img.description && img.description.length > 40 ? 
        img.description.substring(0, 40) + '...' : (img.description || 'N/A');
      
      html += `
        <tr>
          <td>${providerRegion}</td>
          <td title="${img.id} - Status: ${img.imageStatus}">${idWithStatus}</td>
          <td>${osInfo}</td>
          <td title="${img.description || 'N/A'}">${descShort}</td>
          <td title="${img.sourceVmUid || 'N/A'}">${img.sourceVmUid ? img.sourceVmUid.substring(0, 12) + '...' : 'N/A'}</td>
          <td>${img.creationDate ? new Date(img.creationDate).toLocaleDateString() : 'N/A'}</td>
          <td style="white-space: nowrap;">
            <button onclick="viewCustomImageDetails('${img.id}')" class="btn btn-sm btn-info" title="View Details">👁️</button>
            <button onclick="deleteCustomImageFromModal('${img.id}')" class="btn btn-sm btn-danger" title="Delete">🗑️</button>
          </td>
        </tr>
      `;
    });
    
    html += '</tbody></table></div>';
    container.innerHTML = html;

  } catch (error) {
    console.error('Error loading custom images:', error);
    container.innerHTML = '<p class="text-danger">Error loading custom images</p>';
  }
}

// View Custom Image Details
async function viewCustomImageDetails(imageId) {
  const namespace = window.currentSnapshotNamespace || document.getElementById('namespace')?.value;
  if (!namespace) {
    Swal.fire('Error', 'Namespace not available', 'error');
    return;
  }
  const config = getConfig();

  try {
    const response = await axios.get(
      `http://${config.hostname}:${config.port}/tumblebug/ns/${namespace}/resources/customImage/${imageId}`,
      {
        auth: { username: config.username, password: config.password },
        headers: { 'Content-Type': 'application/json' }
      }
    );

    const img = response.data;
    
    // Create enhanced status badge with icon
    let statusIcon = '';
    let statusClass = 'warning';
    let statusMessage = '';
    
    if (img.imageStatus === 'Available') {
      statusIcon = '✅';
      statusClass = 'success';
      statusMessage = '<p class="text-success"><strong>This snapshot is ready to use for VM creation.</strong></p>';
    } else if (img.imageStatus === 'Creating') {
      statusIcon = '🔄';
      statusClass = 'info';
      statusMessage = '<p class="text-info"><strong>⏳ Snapshot is being created. Please wait until status becomes Available.</strong></p>';
    } else if (img.imageStatus === 'Failed') {
      statusIcon = '❌';
      statusClass = 'danger';
      statusMessage = '<p class="text-danger"><strong>⚠️ Snapshot creation failed. This image cannot be used.</strong></p>';
    } else {
      statusIcon = '⚠️';
      statusClass = 'warning';
      statusMessage = '<p class="text-warning"><strong>⚠️ Image status is ' + img.imageStatus + '. Check before using.</strong></p>';
    }
    
    Swal.fire({
      title: `📸 ${img.id}`,
      html: `
        <div style="text-align: left; padding: 10px;">
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin-bottom: 15px; border-left: 4px solid var(--${statusClass});">
            <p style="margin: 0;"><strong>Image Status:</strong></p>
            <p style="margin: 10px 0; font-size: 16px;">
              <span class="badge badge-${statusClass}" style="font-size: 16px; padding: 8px 12px;">${statusIcon} ${img.imageStatus}</span>
            </p>
            ${statusMessage}
          </div>
          <p><strong>Provider:</strong> ${img.providerName}</p>
          <p><strong>Region:</strong> ${img.regionList ? img.regionList.join(', ') : 'N/A'}</p>
          <p><strong>OS Type:</strong> ${img.osType || 'N/A'}</p>
          <p><strong>OS Architecture:</strong> ${img.osArchitecture || 'N/A'}</p>
          <p><strong>Description:</strong> ${img.description || 'N/A'}</p>
          <p><strong>Created:</strong> ${img.creationDate || 'N/A'}</p>
          <p><strong>Source VM UID:</strong> ${img.sourceVmUid || 'N/A'}</p>
        </div>
      `,
      confirmButtonText: 'Close',
      width: '600px'
    }).then(() => {
      // Return to Snapshot Management modal after closing
      showSnapshotManagementModal();
    });

  } catch (error) {
    console.error('Error loading custom image details:', error);
    Swal.fire('Error', 'Failed to load image details', 'error').then(() => {
      // Return to Snapshot Management modal even on error
      showSnapshotManagementModal();
    });
  }
}

// Delete Custom Image
async function deleteCustomImageFromModal(imageId) {
  const result = await Swal.fire({
    title: 'Delete Custom Image?',
    text: `Are you sure you want to delete "${imageId}"?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#3085d6',
    confirmButtonText: 'Yes, delete it!',
    cancelButtonText: 'Cancel'
  });

  if (!result.isConfirmed) return;

  const namespace = window.currentSnapshotNamespace || document.getElementById('namespace')?.value;
  if (!namespace) {
    Swal.fire('Error', 'Namespace not available', 'error');
    return;
  }
  const config = getConfig();

  try {
    await axios.delete(
      `http://${config.hostname}:${config.port}/tumblebug/ns/${namespace}/resources/customImage/${imageId}`,
      {
        auth: { username: config.username, password: config.password },
        headers: { 'Content-Type': 'application/json' }
      }
    );

    Swal.fire('Deleted!', 'Custom image has been deleted.', 'success').then(() => {
      // Return to Snapshot Management modal after deletion
      showSnapshotManagementModal();
    });

  } catch (error) {
    console.error('Error deleting custom image:', error);
    Swal.fire('Error', error.response?.data?.message || 'Failed to delete custom image', 'error').then(() => {
      // Return to Snapshot Management modal even on error
      showSnapshotManagementModal();
    });
  }
}

// Make functions globally available
window.showSnapshotManagementModal = showSnapshotManagementModal;
window.createVmSnapshotFromModal = createVmSnapshotFromModal;
window.loadCustomImagesInModal = loadCustomImagesInModal;
window.viewCustomImageDetails = viewCustomImageDetails;
window.deleteCustomImageFromModal = deleteCustomImageFromModal;
