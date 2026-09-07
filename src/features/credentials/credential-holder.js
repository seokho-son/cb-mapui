/**
 * Credential Holder & Namespace Management Module
 * @module features/credentials
 */
import axios from 'axios';
import { MultiPoint } from 'ol/geom';
import { tbApiBase, getConfig } from '../../core/api.js';

const addSpinnerTask = (name) => (window.addSpinnerTask ? window.addSpinnerTask(name) : name);
const removeSpinnerTask = (id) => { if (window.removeSpinnerTask) window.removeSpinnerTask(id); };

// Shared CSP points Proxy delegating to window globals
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

// Safe map and UI helper wrappers
const map = {
  render: () => window.map?.render(),
  getView: () => window.map?.getView()
};
const getInfra = () => window.getInfra?.();
const updateInfraList = () => window.updateInfraList?.();
const updateNsList = () => window.updateNsList?.();
const updateMapConnectionStatus = (s) => window.updateMapConnectionStatus?.(s);
const updateMapBasedOnProviders = () => window.updateMapBasedOnProviders?.();
const updateProviderDropdownText = () => window.updateProviderDropdownText?.();

// ==================== Credential Holder Functions ====================

// Cached credential holder list (populated at startup)
var cachedCredentialHolderList = [];

// Load credential holder list from CB-Tumblebug API
function updateCredentialHolderList(callback) {
  var config = getConfig();
  var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;

  if (hostname && hostname != "" && port && port != "") {
    var url = `${tbApiBase()}/credentialHolder`;

    axios({
      method: "get",
      url: url,
      auth: {
        username: `${username}`,
        password: `${password}`,
      },
    })
      .then((res) => {
        cachedCredentialHolderList = res.data.credentialHolderList || [];
        window.cachedCredentialHolderList = cachedCredentialHolderList;
        console.log('[CredentialHolder] Loaded ' + cachedCredentialHolderList.length + ' holders');
        // Update UI displays
        updateHolderStatusDisplays();
        var settingsHolderSelect = document.getElementById('settings-credentialHolder');
        if (settingsHolderSelect) {
          var curHolder = window.configCredentialHolder || 'admin';
          settingsHolderSelect.innerHTML = cachedCredentialHolderList.map(holder => {
            var holderId = (window.escapeHtml ? window.escapeHtml(holder.credentialHolder || holder.id || '') : (holder.credentialHolder || holder.id || ''));
            var connCount = holder.verifiedConnectionCount || holder.connectionCount || 0;
            var providers = (window.escapeHtml ? window.escapeHtml((holder.providers || []).join(', ')) : (holder.providers || []).join(', '));
            var selected = (holder.credentialHolder || holder.id || '') === curHolder ? 'selected' : '';
            return `<option value="${holderId}" ${selected} title="Providers: ${providers || 'none'}">${holderId} (${connCount} conn${connCount !== 1 ? 's' : ''})</option>`;
          }).join('');
        }
        if (callback) callback(cachedCredentialHolderList);
      })
      .catch((err) => {
        console.warn("[CredentialHolder] Failed to load holder list:", err.message || err);
        cachedCredentialHolderList = [{ credentialHolder: "admin", providers: [], verifiedConnectionCount: 0 }];
        window.cachedCredentialHolderList = cachedCredentialHolderList;
        updateHolderStatusDisplays();
        if (callback) callback(cachedCredentialHolderList);
      });
  }
}

// Update all UI displays showing current holder
function updateHolderStatusDisplays() {
  // Update map controls badge
  var holderNameEl = document.getElementById('mapHolderName');
  if (holderNameEl) {
    holderNameEl.textContent = window.configCredentialHolder || 'admin';
  }
}

// Update NS ID map badge
function updateNsDisplays() {
  var nsName = window.configNamespace || '—';
  var mapNsNameEl = document.getElementById('mapNsName');
  if (mapNsNameEl) mapNsNameEl.textContent = nsName;
}

// Change active namespace and refresh dependent lists
function applyNamespace(newNs) {
  if (newNs === window.configNamespace) return;
  var oldNs = window.configNamespace;
  window.configNamespace = newNs;
  console.log('[Namespace] Changed: ' + oldNs + ' → ' + newNs);
  if (window.saveApiConfig) window.saveApiConfig();
  updateNsDisplays();
  updateInfraList();
}

// Change credential holder and reload connections + map
function applyCredentialHolder(newHolder) {
  if (newHolder === window.configCredentialHolder) return;
  
  var oldHolder = window.configCredentialHolder;
  window.configCredentialHolder = newHolder;
  console.log('[CredentialHolder] Changed: ' + oldHolder + ' → ' + newHolder);
  if (window.saveApiConfig) window.saveApiConfig();

  // Update all status displays
  updateHolderStatusDisplays();

  // Reload connections filtered by new holder → re-render map
  reloadConnectionsForHolder();
}

// Reload connections from CB-TB with current holder filter, then refresh map
function reloadConnectionsForHolder() {
  var config = getConfig();
  var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var holder = window.configCredentialHolder || 'admin';

  var url = `${tbApiBase()}/connConfig?filterVerified=true&filterRegionRepresentative=true&filterCredentialHolder=${encodeURIComponent(holder)}`;

  console.log('[CredentialHolder] Reloading connections for holder:', holder);
  updateMapConnectionStatus('connecting');

  axios({
    method: "get",
    url: url,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
    timeout: 15000,
  })
    .then((res) => {
      var connData = res.data;
      if (connData.connectionconfig) {
        console.log('[CredentialHolder] Loaded ' + connData.connectionconfig.length + ' connections for holder: ' + holder);
        
        if (!window.cloudBaristaCentralData) {
          window.cloudBaristaCentralData = {};
        }
        window.cloudBaristaCentralData.connection = connData.connectionconfig;

        // Clear existing CSP points
        Object.keys(cspPoints).forEach(key => { cspPoints[key] = []; });
        Object.keys(geoCspPoints).forEach(key => { geoCspPoints[key] = []; });

        // Re-populate from new connection data
        connData.connectionconfig.forEach((connConfig) => {
          var providerName = connConfig.providerName;
          if (!providerName) return;
          var longitude = connConfig.regionDetail?.location?.longitude;
          var latitude = connConfig.regionDetail?.location?.latitude;
          if (longitude == null || latitude == null) return;

          if (!cspPoints[providerName]) {
            cspPoints[providerName] = [];
          }
          cspPoints[providerName].push([parseFloat(longitude), parseFloat(latitude)]);
        });

        // Rebuild geoCspPoints with MultiPoint geometries
        Object.keys(cspPoints).forEach(providerName => {
          if (cspPoints[providerName].length > 0) {
            if (!geoCspPoints[providerName]) {
              geoCspPoints[providerName] = [];
            }
            geoCspPoints[providerName][0] = new MultiPoint(cspPoints[providerName]);
          }
        });

        // Refresh provider checkboxes to match new connection data
        var providerCheckboxContainer = document.getElementById('provider-checkboxes');
        if (providerCheckboxContainer) {
          providerCheckboxContainer.innerHTML = '';
          Object.keys(cspPoints).forEach(providerName => {
            if (cspPoints[providerName].length === 0) return;
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
              if (this.checked && allCb) { allCb.checked = false; }
              updateMapBasedOnProviders();
              updateProviderDropdownText();
            });
          });
          // Reset "ALL" checkbox to checked
          var allCb = document.getElementById('provider-all');
          if (allCb) { allCb.checked = true; }
          updateProviderDropdownText();
        }

        // Force map re-render
        map.render();
        var view = map.getView();
        if (view) view.changed();
        setTimeout(() => { map.render(); }, 100);
        setTimeout(() => { map.render(); }, 500);

        updateMapConnectionStatus('connected');

        // Also refresh Infra data and namespace list for new holder context
        updateNsList();
        getInfra();
      } else {
        console.log('[CredentialHolder] No connections for holder:', holder);
        // Clear map points
        Object.keys(cspPoints).forEach(key => { cspPoints[key] = []; });
        Object.keys(geoCspPoints).forEach(key => { geoCspPoints[key] = []; });
        if (window.cloudBaristaCentralData) {
          window.cloudBaristaCentralData.connection = [];
        }
        map.render();
        updateMapConnectionStatus('connected');
      }
    })
    .catch((err) => {
      console.error('[CredentialHolder] Failed to reload connections:', err);
      updateMapConnectionStatus('disconnected');
    });
}

// Window attachments for backward compatibility and inter-module access
window.updateCredentialHolderList = updateCredentialHolderList;
window.updateHolderStatusDisplays = updateHolderStatusDisplays;
window.updateNsDisplays = updateNsDisplays;
window.applyNamespace = applyNamespace;
window.applyCredentialHolder = applyCredentialHolder;
window.reloadConnectionsForHolder = reloadConnectionsForHolder;
window.cachedCredentialHolderList = cachedCredentialHolderList;

export {
  updateCredentialHolderList,
  updateHolderStatusDisplays,
  updateNsDisplays,
  applyNamespace,
  applyCredentialHolder,
  reloadConnectionsForHolder,
  cachedCredentialHolderList
};
