/**
 * CB-Tumblebug Connection & Provider Management Module
 * @module core/connection
 */
import Swal from 'sweetalert2';
import axios from 'axios';
import { MultiPoint } from 'ol/geom';
import {
  tbApiBase,
  getConfig,
  saveApiConfig,
  normalizeHostname,
  isValidHostname,
  isValidPort,
  isValidName,
  isValidBaseUrl
} from './api.js';
import { escapeHtml, isNormalInteger } from './utils.js';

const infoAlert = (msg) => (window.infoAlert ? window.infoAlert(msg) : Swal.fire({ icon: 'info', title: msg, showConfirmButton: false, timer: 2500 }));
const updateNsList = () => { if (window.updateNsList) window.updateNsList(); };
const getInfra = () => { if (window.getInfra) window.getInfra(); };
const resolveCloudPlatform = (p) => (window.resolveCloudPlatform ? window.resolveCloudPlatform(p) : p);
const createIconStyle = (src) => (window.createIconStyle ? window.createIconStyle(src) : null);

const map = new Proxy({}, {
  get: (target, prop) => {
    const m = window.map;
    if (!m) return () => {};
    const val = m[prop];
    return typeof val === 'function' ? val.bind(m) : val;
  }
});

const cspIconStyles = new Proxy({}, {
  get: (target, prop) => (window.cspIconStyles || {})[prop],
  set: (target, prop, val) => {
    if (!window.cspIconStyles) window.cspIconStyles = {};
    window.cspIconStyles[prop] = val;
    return true;
  }
});

const cspIconImg = new Proxy({}, {
  get: (target, prop) => (window.cspIconImg || {})[prop]
});

const cspGenericColors = new Proxy({}, {
  get: (target, prop) => (window.cspGenericColors || {})[prop],
  set: (target, prop, val) => {
    if (!window.cspGenericColors) window.cspGenericColors = {};
    window.cspGenericColors[prop] = val;
    return true;
  },
  ownKeys: () => Object.keys(window.cspGenericColors || {}),
  getOwnPropertyDescriptor: (target, prop) => Object.getOwnPropertyDescriptor(window.cspGenericColors || {}, prop)
});

const cspPoints = new Proxy({}, {
  get: (target, prop) => (window.cspPoints || {})[prop],
  set: (target, prop, val) => {
    if (!window.cspPoints) window.cspPoints = {};
    window.cspPoints[prop] = val;
    return true;
  },
  deleteProperty: (target, prop) => {
    if (window.cspPoints) delete window.cspPoints[prop];
    return true;
  },
  ownKeys: () => Object.keys(window.cspPoints || {}),
  getOwnPropertyDescriptor: (target, prop) => Object.getOwnPropertyDescriptor(window.cspPoints || {}, prop)
});

const geoCspPoints = new Proxy({}, {
  get: (target, prop) => (window.geoCspPoints || {})[prop],
  set: (target, prop, val) => {
    if (!window.geoCspPoints) window.geoCspPoints = {};
    window.geoCspPoints[prop] = val;
    return true;
  },
  deleteProperty: (target, prop) => {
    if (window.geoCspPoints) delete window.geoCspPoints[prop];
    return true;
  },
  ownKeys: () => Object.keys(window.geoCspPoints || {}),
  getOwnPropertyDescriptor: (target, prop) => Object.getOwnPropertyDescriptor(window.geoCspPoints || {}, prop)
});

// Connection status constants
const CONNECTION_STATUS = {
  CHECKING: 'checking',
  CONNECTION_FAILED: 'connection_failed',
  NOT_INITIALIZED: 'not_initialized',
  SUCCESS: 'success'
};

// Check CB-Tumblebug connection with automatic retry
// Shows a persistent popup with status updates and allows endpoint configuration
function checkConnectionWithRetry() {
  const maxRetries = 60;      // Maximum retry attempts (60 * 3s = ~3 minutes)
  const retryInterval = 3000; // Retry every 3 seconds
  let retryCount = 0;
  let intervalId = null;
  let isPaused = false;
  let currentStatus = CONNECTION_STATUS.CHECKING;

  // Build the popup HTML content
  function buildPopupHtml() {
    return `
      <style>
        .connection-status-container {
          text-align: center;
          padding: 10px;
        }
        .status-icon {
          font-size: 48px;
          margin-bottom: 10px;
        }
        .status-message {
          font-size: 16px;
          font-weight: bold;
          margin-bottom: 5px;
        }
        .status-detail {
          font-size: 13px;
          color: #666;
          margin-bottom: 15px;
        }
        .retry-info {
          font-size: 12px;
          color: #888;
          padding: 8px;
          background: #f5f5f5;
          border-radius: 4px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .retry-info-left {
          display: flex;
          gap: 15px;
        }
        .pause-btn {
          background: none;
          border: 1px solid #ccc;
          border-radius: 4px;
          padding: 2px 8px;
          cursor: pointer;
          font-size: 11px;
        }
        .pause-btn:hover {
          background: #eee;
        }
        .config-section {
          margin-top: 15px;
          text-align: left;
        }
        .config-section summary {
          cursor: pointer;
          padding: 8px;
          background: #f0f0f0;
          border-radius: 4px;
          font-weight: bold;
        }
        .config-section summary:hover {
          background: #e5e5e5;
        }
        .config-form {
          padding: 15px;
          background: #fafafa;
          border: 1px solid #eee;
          border-radius: 0 0 4px 4px;
        }
        .config-input-group {
          margin-bottom: 10px;
        }
        .config-input-group label {
          display: block;
          font-weight: bold;
          margin-bottom: 3px;
          font-size: 13px;
        }
        .config-input-group input {
          width: 100%;
          padding: 6px 10px;
          border: 1px solid #ccc;
          border-radius: 4px;
          font-size: 14px;
        }
        .apply-config-btn {
          width: 100%;
          padding: 8px;
          background: #007bff;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          margin-top: 10px;
        }
        .apply-config-btn:hover {
          background: #0056b3;
        }
        .spinner {
          display: inline-block;
          width: 20px;
          height: 20px;
          border: 3px solid #f3f3f3;
          border-top: 3px solid #3498db;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          vertical-align: middle;
          margin-right: 8px;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>

      <div class="connection-status-container">
        <div id="status-icon" class="status-icon">⏳</div>
        <div id="status-message" class="status-message">Checking connection...</div>
        <div id="status-detail" class="status-detail">Connecting to CB-Tumblebug server</div>

        <div class="retry-info">
          <div class="retry-info-left">
            <span>Attempt: <span id="retry-count">0</span>/${maxRetries}</span>
            <span id="next-check-info">Next check: 3s</span>
          </div>
          <button id="pause-btn" class="pause-btn">⏸️ Pause</button>
        </div>
      </div>

      <details class="config-section" id="config-details">
        <summary>⚙️ API Endpoint Configuration</summary>
        <div class="config-form">
          <div class="config-input-group">
            <label for="config-hostname">Hostname:</label>
            <input type="text" id="config-hostname" value="${window.escapeHtml(window.configHostname)}">
          </div>
          <div class="config-input-group">
            <label for="config-port">Port:</label>
            <input type="text" id="config-port" value="${window.escapeHtml(window.configPort)}">
          </div>
          <div class="config-input-group">
            <label for="config-username">Username:</label>
            <input type="text" id="config-username" value="${window.escapeHtml(window.configUsername)}">
          </div>
          <div class="config-input-group">
            <label for="config-password">Password:</label>
            <input type="password" id="config-password" value="${window.escapeHtml(window.configPassword)}">
          </div>
          <div class="config-input-group">
            <label for="config-credentialHolder">Credential Holder:</label>
            <input type="text" id="config-credentialHolder" value="${window.escapeHtml(window.configCredentialHolder)}">
          </div>
          <div class="config-input-group">
            <label for="config-apibase">API Base URL (optional; overrides host/port, e.g. https://host/tumblebug):</label>
            <input type="text" id="config-apibase" value="${window.escapeHtml(window.configApiBaseUrl)}" placeholder="auto">
          </div>
          <button id="apply-config-btn" class="apply-config-btn">Apply & Retry Now</button>
        </div>
      </details>
    `;
  }

  // Update the popup UI based on current status
  function updateStatusUI(status, detail = '') {
    const iconEl = document.getElementById('status-icon');
    const messageEl = document.getElementById('status-message');
    const detailEl = document.getElementById('status-detail');
    const retryCountEl = document.getElementById('retry-count');

    if (retryCountEl) retryCountEl.textContent = retryCount;

    if (!iconEl || !messageEl || !detailEl) return;

    switch (status) {
      case CONNECTION_STATUS.CHECKING:
        iconEl.innerHTML = '<div class="spinner"></div>';
        messageEl.textContent = 'Checking connection...';
        detailEl.textContent = 'Connecting to CB-Tumblebug server';
        break;

      case CONNECTION_STATUS.CONNECTION_FAILED:
        iconEl.textContent = '🔴';
        messageEl.textContent = 'Cannot connect to server';
        detailEl.innerHTML = `
          Please check:<br>
          • Is CB-Tumblebug server running?<br>
          • Is the endpoint address correct?<br>
          <small style="color:#999">${detail}</small>
        `;
        break;

      case CONNECTION_STATUS.NOT_INITIALIZED:
        iconEl.textContent = '🟡';
        messageEl.textContent = 'Waiting for initialization';
        detailEl.innerHTML = `
          CB-Tumblebug server is running but initialization is not complete.<br>
          • Waiting for init.py to finish registering cloud providers...<br>
          • This may take up to 30 seconds or more.
        `;
        break;

      case CONNECTION_STATUS.SUCCESS:
        iconEl.textContent = '🟢';
        messageEl.textContent = 'Connection successful!';
        detailEl.innerHTML = `
          <div style="margin-top: 10px;">
            <span style="font-size: 36px; font-weight: bold; color: #28a745;">${detail}</span>
            <span style="font-size: 14px; color: #666;"> cloud regions loaded</span>
          </div>
          <div style="margin-top: 8px; font-size: 12px; color: #888;">
            ☁️ Ready to provision multi-cloud infrastructure
          </div>
        `;
        // Hide retry info on success
        const retryInfo = document.querySelector('.retry-info');
        if (retryInfo) retryInfo.style.display = 'none';
        break;
    }
  }

  // Perform the actual connection check
  async function checkStatus() {
    retryCount++;
    updateStatusUI(CONNECTION_STATUS.CHECKING);

    const readyzUrl = `${tbApiBase()}/readyz`;
    const holder = window.configCredentialHolder || 'admin';
    const connConfigUrl = `${tbApiBase()}/connConfig?filterVerified=true&filterRegionRepresentative=true&filterCredentialHolder=${encodeURIComponent(holder)}`;

    try {
      // Step 1: Check readyz status first
      const readyzResponse = await axios({
        method: 'get',
        url: readyzUrl,
        auth: {
          username: window.configUsername,
          password: window.configPassword
        },
        timeout: 10000
      });

      const readyzData = readyzResponse.data;
      console.log('[Connection Check] readyz response:', readyzData);

      // Check if server is ready
      if (!readyzData.ready) {
        currentStatus = CONNECTION_STATUS.CONNECTION_FAILED;
        updateStatusUI(CONNECTION_STATUS.CONNECTION_FAILED, 'Server not ready');
        console.log('[Connection Check] Server is not ready');
        return;
      }

      // Check if server is initialized (init.py completed)
      if (!readyzData.initialized) {
        currentStatus = CONNECTION_STATUS.NOT_INITIALIZED;
        updateStatusUI(CONNECTION_STATUS.NOT_INITIALIZED);
        console.log('[Connection Check] Server is ready but not initialized (waiting for init.py)');
        return;
      }

      // Step 2: Server is ready and initialized, now fetch connection configs
      const connResponse = await axios({
        method: 'get',
        url: connConfigUrl,
        auth: {
          username: window.configUsername,
          password: window.configPassword
        },
        timeout: 10000
      });

      const connData = connResponse.data;

      if (connData.connectionconfig && connData.connectionconfig.length > 0) {
        // Success - we have connection data
        currentStatus = CONNECTION_STATUS.SUCCESS;
        updateStatusUI(CONNECTION_STATUS.SUCCESS, connData.connectionconfig.length);

        // Stop the retry interval
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }

        // Process the connection data (use existing logic)
        processConnectionData(connData);

        // Load namespace list and Infra data now that server is ready
        updateNsList();
        getInfra();

        // Close popup after showing success message
        setTimeout(() => {
          Swal.close();
          // infoAlert removed - success message already shown in connection check popup
        }, 2000);

      } else {
        // Initialized but no connection configs - unusual state
        currentStatus = CONNECTION_STATUS.NOT_INITIALIZED;
        updateStatusUI(CONNECTION_STATUS.NOT_INITIALIZED);
        console.log('[Connection Check] Server initialized but no connection configs available');
      }

    } catch (error) {
      // Connection failed
      currentStatus = CONNECTION_STATUS.CONNECTION_FAILED;
      const errorMsg = error.code || error.message || 'Unknown error';
      updateStatusUI(CONNECTION_STATUS.CONNECTION_FAILED, errorMsg);
      console.log('[Connection Check] Failed:', error);

      // Mark hostname/port as error in main UI
      const hostnameEl = document.getElementById('hostname');
      const portEl = document.getElementById('port');
      if (hostnameEl) hostnameEl.style.color = '#FF0000';
      if (portEl) portEl.style.color = '#FF0000';
    }

    // Check if max retries reached
    if (retryCount >= maxRetries && currentStatus !== CONNECTION_STATUS.SUCCESS) {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      const nextCheckInfo = document.getElementById('next-check-info');
      if (nextCheckInfo) {
        nextCheckInfo.textContent = 'Max retries reached';
      }
      const pauseBtn = document.getElementById('pause-btn');
      if (pauseBtn) {
        pauseBtn.textContent = '🔄 Retry';
        pauseBtn.onclick = () => {
          retryCount = 0;
          isPaused = false;
          intervalId = setInterval(() => {
            if (!isPaused) checkStatus();
          }, retryInterval);
          checkStatus();
        };
      }
    }
  }

  // Process connection data and update map (extracted from getConnection)
  function processConnectionData(data) {
    console.log('[Complete] Registered Cloud Regions: ' + data.connectionconfig.length);

    // Store connection data in central store
    window.cloudBaristaCentralData.connection = data.connectionconfig;

    // Clear existing CSP points
    Object.keys(cspPoints).forEach(key => {
      cspPoints[key] = [];
    });
    Object.keys(geoCspPoints).forEach(key => {
      geoCspPoints[key] = [];
    });

    // Initialize provider checkboxes container
    var providerCheckboxContainer = document.getElementById('provider-checkboxes');
    if (providerCheckboxContainer) {
      providerCheckboxContainer.innerHTML = '';
    }

    // Setup "ALL" checkbox handler
    var allCheckbox = document.getElementById('provider-all');
    if (allCheckbox) {
      allCheckbox.checked = true;
      allCheckbox.onchange = function() {
        var providerCheckboxes = document.querySelectorAll('#provider-checkboxes input[type="checkbox"]');
        if (this.checked) {
          providerCheckboxes.forEach(cb => cb.checked = false);
        }
        updateMapBasedOnProviders();
        updateProviderDropdownText();
      };
    }

    // Process each connection config
    data.connectionconfig.forEach((config, i) => {
      const providerName = config.providerName;
      const longitude = config.regionDetail.location.longitude;
      const latitude = config.regionDetail.location.latitude;
      const briefAddr = config.regionDetail.location.display;
      const nativeRegion = config.regionDetail.regionName;

      console.log(
        '[' + i + '] ' + providerName + '(' + nativeRegion + ')' +
        '\t\t\tLocation: ' + longitude + '|' + latitude + ' (' + briefAddr + ')'
      );

      // Add to cspPoints
      if (!cspPoints[providerName]) {
        cspPoints[providerName] = [];
      }
      cspPoints[providerName].push([longitude, latitude]);

      // Add provider checkbox if not exists
      if (providerCheckboxContainer) {
        var existingCheckbox = document.getElementById('provider-' + providerName);
        if (!existingCheckbox) {
          var checkboxDiv = document.createElement('div');
          checkboxDiv.className = 'dropdown-item-text';

          var formCheckDiv = document.createElement('div');
          formCheckDiv.className = 'form-check';

          var checkbox = document.createElement('input');
          checkbox.className = 'form-check-input';
          checkbox.type = 'checkbox';
          checkbox.id = 'provider-' + providerName;
          checkbox.value = providerName;

          var label = document.createElement('label');
          label.className = 'form-check-label';
          label.setAttribute('for', 'provider-' + providerName);
          label.textContent = providerName.toUpperCase();

          formCheckDiv.appendChild(checkbox);
          formCheckDiv.appendChild(label);
          checkboxDiv.appendChild(formCheckDiv);
          providerCheckboxContainer.appendChild(checkboxDiv);

          checkbox.addEventListener('change', function() {
            var allCb = document.getElementById('provider-all');
            if (this.checked && allCb) {
              allCb.checked = false;
            }
            updateMapBasedOnProviders();
            updateProviderDropdownText();
          });
        }
      }

      // Create MultiPoint geometry
      if (!geoCspPoints[providerName]) {
        geoCspPoints[providerName] = [];
      }
      geoCspPoints[providerName][0] = new MultiPoint(cspPoints[providerName]);

      // Dynamically register icon style for unknown providers using platform fallback
      if (!cspIconStyles[providerName]) {
        const platform = resolveCloudPlatform(providerName);
        if (cspIconImg[platform]) {
          cspIconStyles[providerName] = createIconStyle(cspIconImg[platform]);
        }
      }
      // Also register generic color for dynamically discovered providers
      if (!cspGenericColors[providerName]) {
        const platform = resolveCloudPlatform(providerName);
        if (cspGenericColors[platform]) {
          cspGenericColors[providerName] = cspGenericColors[platform];
        }
      }
    });

    // Render the map with forced view update to trigger postrender event
    // Single map.render() only schedules the next render cycle but may not trigger postrender
    // Using view.changed() forces the rendering loop to activate immediately
    map.render();
    const view = map.getView();
    if (view) {
      view.changed();  // Signal view change to force postrender event
    }
    // Additional render calls with slight delay to ensure icons are displayed
    setTimeout(() => map.render(), 100);
    setTimeout(() => map.render(), 500);

    // Reset hostname/port color to normal
    const hostnameEl = document.getElementById('hostname');
    const portEl = document.getElementById('port');
    if (hostnameEl) hostnameEl.style.color = '';
    if (portEl) portEl.style.color = '';
  }

  // Setup event listeners for the popup
  function setupEventListeners() {
    // Pause/Resume button
    const pauseBtn = document.getElementById('pause-btn');
    if (pauseBtn) {
      pauseBtn.onclick = () => {
        isPaused = !isPaused;
        pauseBtn.textContent = isPaused ? '▶️ Resume' : '⏸️ Pause';
        const nextCheckInfo = document.getElementById('next-check-info');
        if (nextCheckInfo) {
          nextCheckInfo.textContent = isPaused ? 'Paused' : 'Next check: 3s';
        }
      };
    }

    // Apply config button
    const applyBtn = document.getElementById('apply-config-btn');
    if (applyBtn) {
      applyBtn.onclick = () => {
        // Update config from input fields
        const newHostname = document.getElementById('config-hostname').value;
        const newPort = document.getElementById('config-port').value;
        const newUsername = document.getElementById('config-username').value;
        const newPassword = document.getElementById('config-password').value;

        if (isValidHostname(newHostname)) window.configHostname = normalizeHostname(newHostname);
        else if (newHostname) console.warn('Invalid hostname ignored:', newHostname);
        if (isValidPort(newPort)) window.configPort = newPort;
        else if (newPort) console.warn('Invalid port ignored:', newPort);
        if (isValidName(newUsername)) window.configUsername = newUsername;
        else if (newUsername) console.warn('Invalid username ignored:', newUsername);
        if (newPassword) window.configPassword = newPassword;

        const newCredentialHolder = document.getElementById('config-credentialHolder').value;
        if (isValidName(newCredentialHolder)) window.configCredentialHolder = newCredentialHolder;
        else if (newCredentialHolder) console.warn('Invalid credential holder ignored:', newCredentialHolder);

        const newApiBase = (document.getElementById('config-apibase')?.value || '').trim();
        if (newApiBase === '') window.configApiBaseUrl = '';           // back to auto
        else if (isValidBaseUrl(newApiBase)) window.configApiBaseUrl = newApiBase.replace(/\/+$/, '');
        else console.warn('Invalid API base URL ignored:', newApiBase);

        saveApiConfig();

        console.log('[Config Updated] ' + window.configHostname + ':' + window.configPort + ' holder=' + window.configCredentialHolder);

        // Reset retry count and check immediately
        retryCount = 0;
        isPaused = false;
        const pauseBtn = document.getElementById('pause-btn');
        if (pauseBtn) pauseBtn.textContent = '⏸️ Pause';

        // Collapse the config section
        const configDetails = document.getElementById('config-details');
        if (configDetails) configDetails.removeAttribute('open');

        // Check immediately
        checkStatus();
      };
    }

    // Update countdown display
    let countdown = 3;
    setInterval(() => {
      if (!isPaused && currentStatus !== CONNECTION_STATUS.SUCCESS) {
        countdown--;
        if (countdown <= 0) countdown = 3;
        const nextCheckInfo = document.getElementById('next-check-info');
        if (nextCheckInfo && !isPaused) {
          nextCheckInfo.textContent = 'Next check: ' + countdown + 's';
        }
      }
    }, 1000);
  }

  // Show the main popup
  Swal.fire({
    title: 'CB-Tumblebug Connection Check',
    html: buildPopupHtml(),
    showConfirmButton: false,
    showCancelButton: true,
    cancelButtonText: 'Skip',
    allowOutsideClick: false,
    width: '480px',
    didOpen: () => {
      setupEventListeners();
      // Initial check
      checkStatus();
      // Start periodic checks
      intervalId = setInterval(() => {
        if (!isPaused && currentStatus !== CONNECTION_STATUS.SUCCESS) {
          checkStatus();
        }
      }, retryInterval);
    },
    willClose: () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    }
  }).then((result) => {
    if (result.dismiss === Swal.DismissReason.cancel) {
      console.log('[Connection Check] Skipped by user');
    }
  });
}
window.checkConnectionWithRetry = checkConnectionWithRetry;

// Get list of cloud connections (legacy function, kept for compatibility)
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

  var hostname = window.configHostname;
  var port = window.configPort;
  var username = window.configUsername;
  var password = window.configPassword;
  var holder = window.configCredentialHolder || 'admin';
  var refreshInt = window.refreshInterval || 5;

  // Use global refreshInterval variable instead of DOM element
  var filteredRefreshInterval = isNormalInteger(refreshInt.toString())
    ? refreshInt
    : 5;
  //setTimeout(() => console.log(getConnection()), filteredRefreshInterval*1000);

  var url = `${tbApiBase()}/connConfig?filterVerified=true&filterRegionRepresentative=true&filterCredentialHolder=${encodeURIComponent(holder)}`;

  axios({
    method: "get",
    url: url,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
    timeout: 600000,
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

        // Render the map with forced view update to trigger postrender event
        map.render();
        const view = map.getView();
        if (view) {
          view.changed();  // Signal view change to force postrender event
        }
        // Additional render calls with slight delay to ensure icons are displayed
        setTimeout(() => map.render(), 100);
        setTimeout(() => map.render(), 500);

        infoAlert("Registered Cloud Regions: " + obj.connectionconfig.length);
      }
    })
    .catch(function (error) {
      // Legacy error handling - just log the error
      // The new checkConnectionWithRetry() handles errors with a better UI
      if (error.request) {
        document.getElementById("hostname").style.color = "#FF0000";
        document.getElementById("port").style.color = "#FF0000";
      }
      console.log('[getConnection] Error:', error);
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


window.CONNECTION_STATUS = CONNECTION_STATUS;
window.checkConnectionWithRetry = checkConnectionWithRetry;
window.getConnection = getConnection;
window.getSelectedProviders = getSelectedProviders;
window.updateProviderDropdownText = updateProviderDropdownText;
window.updateMapBasedOnProviders = updateMapBasedOnProviders;
