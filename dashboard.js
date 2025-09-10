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
*/

// Dashboard Configuration
const dashboardConfig = {
  hostname: 'localhost',
  port: '1323',
  username: 'default',
  password: 'default',
  namespace: 'default',
  refreshInterval: 10000 // 10 seconds
};

// Global variables
let mciData = [];
let vmData = [];
let resourceData = {};
let refreshTimer = null;
let charts = {};
let selectedMciId = null; // Track selected MCI for VM filtering

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  console.log('Dashboard initializing...');
  
  // Load settings from localStorage
  loadSettings();
  
  // Initialize charts
  initializeCharts();
  
  // Load initial data
  refreshDashboard();
  
  // Start auto-refresh
  startAutoRefresh();
  
  // Setup event listeners
  setupEventListeners();
});

// Load settings from localStorage
function loadSettings() {
  const saved = localStorage.getItem('cb-dashboard-settings');
  if (saved) {
    const settings = JSON.parse(saved);
    Object.assign(dashboardConfig, settings);
    
    // Update form fields
    document.getElementById('hostname').value = dashboardConfig.hostname;
    document.getElementById('port').value = dashboardConfig.port;
    document.getElementById('username').value = dashboardConfig.username;
    document.getElementById('password').value = dashboardConfig.password;
    document.getElementById('namespace').value = dashboardConfig.namespace;
    document.getElementById('refreshInterval').value = dashboardConfig.refreshInterval / 1000;
  }
}

// Save settings to localStorage
function saveSettings() {
  dashboardConfig.hostname = document.getElementById('hostname').value;
  dashboardConfig.port = document.getElementById('port').value;
  dashboardConfig.username = document.getElementById('username').value;
  dashboardConfig.password = document.getElementById('password').value;
  dashboardConfig.namespace = document.getElementById('namespace').value;
  dashboardConfig.refreshInterval = parseInt(document.getElementById('refreshInterval').value) * 1000;
  
  localStorage.setItem('cb-dashboard-settings', JSON.stringify(dashboardConfig));
  
  // Close modal
  $('#settingsModal').modal('hide');
  
  // Restart auto-refresh with new interval
  startAutoRefresh();
  
  // Refresh data immediately
  refreshDashboard();
  
  showSuccessMessage('Settings saved successfully!');
}

// Show settings modal
function showSettings() {
  $('#settingsModal').modal('show');
}

// Initialize Chart.js charts
function initializeCharts() {
  // MCI Status Chart
  const mciStatusCtx = document.getElementById('mciStatusChart').getContext('2d');
  charts.mciStatus = new Chart(mciStatusCtx, {
    type: 'doughnut',
    data: {
      labels: ['Running', 'Suspended', 'Failed', 'Creating', 'Other'],
      datasets: [{
        data: [0, 0, 0, 0, 0],
        backgroundColor: [
          '#28a745',
          '#ffc107',
          '#dc3545',
          '#17a2b8',
          '#6c757d'
        ]
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom'
        }
      }
    }
  });

  // Provider Chart
  const providerCtx = document.getElementById('providerChart').getContext('2d');
  charts.provider = new Chart(providerCtx, {
    type: 'bar',
    data: {
      labels: [],
      datasets: [{
        label: 'VM Count',
        data: [],
        backgroundColor: [
          '#007bff',
          '#28a745',
          '#ffc107',
          '#dc3545',
          '#17a2b8',
          '#6f42c1',
          '#e83e8c',
          '#fd7e14'
        ]
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 1
          }
        }
      },
      plugins: {
        legend: {
          display: false
        }
      }
    }
  });

  // Region Chart
  const regionCtx = document.getElementById('regionChart').getContext('2d');
  charts.region = new Chart(regionCtx, {
    type: 'bar',
    data: {
      labels: [],
      datasets: [{
        label: 'VM Count',
        data: [],
        backgroundColor: [
          '#20c997',
          '#fd7e14',
          '#6610f2',
          '#e83e8c',
          '#6f42c1',
          '#17a2b8',
          '#ffc107',
          '#dc3545'
        ]
      }]
    },
    options: {
      indexAxis: 'y', // This makes it horizontal
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          beginAtZero: true,
          ticks: {
            stepSize: 1
          }
        }
      },
      plugins: {
        legend: {
          display: false
        }
      }
    }
  });
}

// Main refresh function
async function refreshDashboard() {
  console.log('Refreshing dashboard...');
  showRefreshIndicator(true);
  updateConnectionStatus('connecting');
  
  try {
    // Test connection first
    await testConnection();
    updateConnectionStatus('connected');
    
    // Load namespaces first
    await loadNamespaces();
    
    // Load MCI data
    await loadMciData();
    
    // Load resource overview
    await loadResourceOverview();
    
    // Update all displays
    updateStatistics();
    updateCharts();
    updateMciTable();
    updateVmTable();
    
    // Update UI controls
    updateShowAllButton();
    
    // Update last refresh time
    document.getElementById('lastUpdated').textContent = new Date().toLocaleTimeString('en-US');
  } catch (error) {
    console.error('Error refreshing dashboard:', error);
    updateConnectionStatus('disconnected');
    showConnectionError('Failed to refresh dashboard: ' + error.message);
  } finally {
    showRefreshIndicator(false);
  }
}

// Test connection to CB-Tumblebug
async function testConnection() {
  const url = `http://${dashboardConfig.hostname}:${dashboardConfig.port}/tumblebug/readyz`;
  
  try {
    const response = await axios.get(url, {
      auth: {
        username: dashboardConfig.username,
        password: dashboardConfig.password
      },
      timeout: 10000
    });
    
    return response.status === 200;
  } catch (error) {
    throw new Error(`Connection failed: ${error.message}`);
  }
}

// Update connection status indicator
function updateConnectionStatus(status) {
  const statusElement = document.getElementById('connectionStatus');
  
  switch (status) {
    case 'connected':
      statusElement.className = 'badge badge-success';
      statusElement.innerHTML = '<i class="fas fa-check-circle"></i> Connected';
      break;
    case 'connecting':
      statusElement.className = 'badge badge-warning';
      statusElement.innerHTML = '<i class="fas fa-sync fa-spin"></i> Connecting';
      break;
    case 'disconnected':
      statusElement.className = 'badge badge-danger';
      statusElement.innerHTML = '<i class="fas fa-times-circle"></i> Disconnected';
      break;
    default:
      statusElement.className = 'badge badge-secondary';
      statusElement.innerHTML = '<i class="fas fa-question-circle"></i> Unknown';
  }
}

// Load namespace list
async function loadNamespaces() {
  const url = `http://${dashboardConfig.hostname}:${dashboardConfig.port}/tumblebug/ns`;
  
  try {
    const response = await axios.get(url, {
      auth: {
        username: dashboardConfig.username,
        password: dashboardConfig.password
      },
      timeout: 30000
    });
    
    const namespaces = response.data.ns || [];
    const namespaceSelect = document.getElementById('namespace');
    
    // Clear existing options
    namespaceSelect.innerHTML = '';
    
    // Add namespaces
    namespaces.forEach(ns => {
      const option = document.createElement('option');
      option.value = ns.id;
      option.textContent = ns.id;
      if (ns.id === dashboardConfig.namespace) {
        option.selected = true;
      }
      namespaceSelect.appendChild(option);
    });
    
    // If current namespace doesn't exist, use first available
    if (!namespaces.find(ns => ns.id === dashboardConfig.namespace) && namespaces.length > 0) {
      dashboardConfig.namespace = namespaces[0].id;
      namespaceSelect.value = dashboardConfig.namespace;
    }
  } catch (error) {
    console.error('Error loading namespaces:', error);
    // Use default namespace if API call fails
  }
}

// Load MCI data
async function loadMciData() {
  if (!dashboardConfig.namespace) {
    throw new Error('No namespace selected');
  }
  
  const url = `http://${dashboardConfig.hostname}:${dashboardConfig.port}/tumblebug/ns/${dashboardConfig.namespace}/mci`;
  
  try {
    const response = await axios.get(url, {
      auth: {
        username: dashboardConfig.username,
        password: dashboardConfig.password
      },
      timeout: 30000
    });
    
    mciData = response.data.mci || [];
    
    // Extract VM data from MCI data
    vmData = [];
    mciData.forEach(mci => {
      if (mci.vm && Array.isArray(mci.vm)) {
        mci.vm.forEach(vm => {
          vmData.push({
            ...vm,
            mciId: mci.id,
            mciStatus: mci.status
          });
        });
      }
    });
    
    console.log(`Loaded ${mciData.length} MCIs with ${vmData.length} VMs`);
  } catch (error) {
    console.error('Error loading MCI data:', error);
    throw error;
  }
}

// Load resource overview
async function loadResourceOverview() {
  if (!dashboardConfig.namespace) return;
  
  const resources = ['vNet', 'securityGroup', 'sshKey'];
  
  for (const resourceType of resources) {
    try {
      const url = `http://${dashboardConfig.hostname}:${dashboardConfig.port}/tumblebug/ns/${dashboardConfig.namespace}/resources/${resourceType}`;
      
      const response = await axios.get(url, {
        auth: {
          username: dashboardConfig.username,
          password: dashboardConfig.password
        },
        timeout: 30000
      });
      
      // Handle different response structures
      if (response.data && response.data[resourceType]) {
        resourceData[resourceType] = response.data[resourceType];
      } else if (Array.isArray(response.data)) {
        resourceData[resourceType] = response.data;
      } else {
        resourceData[resourceType] = [];
      }
      
      console.log(`Loaded ${resourceType}:`, resourceData[resourceType]);
    } catch (error) {
      console.error(`Error loading ${resourceType}:`, error);
      resourceData[resourceType] = [];
    }
  }
  
  updateResourceDisplay();
}

// Function to parse and normalize MCI status
function normalizeMciStatus(status) {
  if (!status) return 'Unknown';
  
  // Convert to string and trim
  const statusStr = String(status).trim();
  
  // Handle complex status patterns
  if (statusStr.includes('Running')) {
    return 'Running';
  } else if (statusStr.includes('Creating')) {
    return 'Creating';
  } else if (statusStr.includes('Preparing')) {
    return 'Preparing';
  } else if (statusStr.includes('Suspended')) {
    return 'Suspended';
  } else if (statusStr.includes('Failed')) {
    return 'Failed';
  } else if (statusStr.includes('Terminating')) {
    return 'Terminating';
  } else if (statusStr.includes('Partial')) {
    // Handle cases like "Partial-Running", "Partial-Failed", etc.
    if (statusStr.includes('Running')) {
      return 'Running';
    } else if (statusStr.includes('Failed')) {
      return 'Failed';
    } else {
      return 'Partial';
    }
  }
  
  // Check for exact matches for simple statuses
  switch (statusStr) {
    case 'Running':
      return 'Running';
    case 'Suspended':
      return 'Suspended';
    case 'Failed':
      return 'Failed';
    case 'Creating':
      return 'Creating';
    case 'Preparing':
      return 'Preparing';
    case 'Terminating':
      return 'Terminating';
    default:
      return 'Other';
  }
}

// Update statistics cards
function updateStatistics() {
  const totalMci = mciData.length;
  
  // Handle complex status counting with improved parsing
  let runningMci = 0;
  let suspendedMci = 0;
  let failedMci = 0;
  let creatingMci = 0;
  let preparingMci = 0;
  
  mciData.forEach(mci => {
    const normalizedStatus = normalizeMciStatus(mci.status);
    
    switch (normalizedStatus) {
      case 'Running':
        runningMci++;
        break;
      case 'Creating':
        creatingMci++;
        break;
      case 'Preparing':
        preparingMci++;
        break;
      case 'Suspended':
        suspendedMci++;
        break;
      case 'Failed':
        failedMci++;
        break;
    }
  });
  
  const totalVm = vmData.length;
  
  // Get unique providers
  const providers = new Set();
  vmData.forEach(vm => {
    if (vm.connectionConfig && vm.connectionConfig.providerName) {
      providers.add(vm.connectionConfig.providerName);
    }
  });
  
  document.getElementById('totalMciCount').textContent = totalMci;
  document.getElementById('runningMciCount').textContent = runningMci;
  document.getElementById('suspendedMciCount').textContent = suspendedMci;
  document.getElementById('failedMciCount').textContent = failedMci;
  document.getElementById('totalVmCount').textContent = totalVm;
  document.getElementById('totalProviderCount').textContent = providers.size;
}

// Update charts
function updateCharts() {
  // Update MCI Status Chart with improved status parsing
  const statusCounts = {
    'Running': 0,
    'Creating': 0,
    'Preparing': 0,
    'Suspended': 0,
    'Failed': 0,
    'Partial': 0,
    'Terminating': 0,
    'Other': 0
  };
  
  console.log('Processing MCI statuses for chart:');
  mciData.forEach(mci => {
    const originalStatus = mci.status;
    const normalizedStatus = normalizeMciStatus(originalStatus);
    
    console.log(`Original: "${originalStatus}" → Normalized: "${normalizedStatus}"`);
    
    if (statusCounts.hasOwnProperty(normalizedStatus)) {
      statusCounts[normalizedStatus]++;
    } else {
      statusCounts['Other']++;
    }
  });
  
  console.log('Final status counts:', statusCounts);
  
  // Filter out zero counts for cleaner chart
  const activeStatuses = [];
  const activeCounts = [];
  const activeColors = [];
  
  const statusColors = {
    'Running': '#28a745',     // green
    'Creating': '#17a2b8',    // blue
    'Preparing': '#6c757d',   // gray
    'Suspended': '#ffc107',   // yellow
    'Failed': '#dc3545',      // red
    'Partial': '#fd7e14',     // orange
    'Terminating': '#e83e8c', // pink
    'Other': '#6c757d'        // gray
  };
  
  Object.entries(statusCounts).forEach(([status, count]) => {
    if (count > 0) {
      activeStatuses.push(status);
      activeCounts.push(count);
      activeColors.push(statusColors[status]);
    }
  });
  
  charts.mciStatus.data.labels = activeStatuses;
  charts.mciStatus.data.datasets[0].data = activeCounts;
  charts.mciStatus.data.datasets[0].backgroundColor = activeColors;
  charts.mciStatus.update();
  
  // Update Provider Chart
  const providerCounts = {};
  vmData.forEach(vm => {
    if (vm.connectionConfig && vm.connectionConfig.providerName) {
      const provider = vm.connectionConfig.providerName;
      providerCounts[provider] = (providerCounts[provider] || 0) + 1;
    }
  });
  
  charts.provider.data.labels = Object.keys(providerCounts);
  charts.provider.data.datasets[0].data = Object.values(providerCounts);
  charts.provider.update();

  // Update Region Chart
  const regionCounts = {};
  vmData.forEach(vm => {
    if (vm.region && vm.region.Region) {
      const region = vm.region.Region;
      regionCounts[region] = (regionCounts[region] || 0) + 1;
    } else if (vm.location && vm.location.cloudType) {
      // Fallback to cloudType if region is not available
      const region = vm.location.cloudType;
      regionCounts[region] = (regionCounts[region] || 0) + 1;
    }
  });
  
  // Sort regions by VM count for better visualization
  const sortedRegions = Object.entries(regionCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10); // Show top 10 regions
  
  charts.region.data.labels = sortedRegions.map(([region]) => region);
  charts.region.data.datasets[0].data = sortedRegions.map(([,count]) => count);
  charts.region.update();
}

// Update MCI table
function updateMciTable() {
  const tbody = document.getElementById('mciTableBody');
  tbody.innerHTML = '';
  
  mciData.forEach(mci => {
    const row = document.createElement('tr');
    
    // Get provider distribution for this MCI
    const providers = new Set();
    let vmCount = 0;
    if (mci.vm && Array.isArray(mci.vm)) {
      vmCount = mci.vm.length;
      mci.vm.forEach(vm => {
        if (vm.connectionConfig && vm.connectionConfig.providerName) {
          providers.add(vm.connectionConfig.providerName);
        }
      });
    }
    
    const providerList = Array.from(providers).join(', ');
    
    // Helper function to truncate text and add tooltip for MCI table
    const truncateWithTooltip = (text, maxLength = 20) => {
      if (!text || text === 'N/A' || text === 'None') return text;
      if (text.length <= maxLength) return text;
      return `<span title="${text.replace(/"/g, '&quot;')}">${text.substring(0, maxLength)}...</span>`;
    };
    
    // Normalize status for CSS class
    let statusClass = mci.status.toLowerCase();
    if (statusClass.startsWith('creating')) {
      statusClass = 'creating';
    } else if (statusClass === 'partial-failed') {
      statusClass = 'failed';
    }
    
    // Determine button states based on actual status
    const actualStatus = mci.status.startsWith('Creating') ? 'Creating' : mci.status;
    const isRunning = actualStatus === 'Running';
    const canResume = ['Suspended', 'Failed', 'Partial-Failed'].includes(actualStatus);
    const canSuspend = isRunning;
    const canRestart = isRunning;
    
    row.innerHTML = `
      <td title="${mci.id}"><strong>${truncateWithTooltip(mci.id, 20)}</strong></td>
      <td><span class="status-badge status-${statusClass}">${mci.status}</span></td>
      <td title="${providerList || 'N/A'}">${truncateWithTooltip(providerList || 'N/A', 15)}</td>
      <td>${vmCount}</td>
      <td title="${mci.targetAction || 'None'}">${truncateWithTooltip(mci.targetAction || 'None', 12)}</td>
      <td title="${mci.description || 'N/A'}">${truncateWithTooltip(mci.description || 'N/A', 25)}</td>
      <td class="action-buttons">
        <button class="btn btn-sm btn-outline-primary" onclick="viewMciDetails('${mci.id}')" title="View Details">
          <i class="fas fa-eye"></i>
        </button>
        <button class="btn btn-sm btn-outline-success" onclick="controlMci('${mci.id}', 'resume')" title="Resume" ${!canResume ? 'disabled' : ''}>
          <i class="fas fa-play"></i>
        </button>
        <button class="btn btn-sm btn-outline-warning" onclick="controlMci('${mci.id}', 'suspend')" title="Suspend" ${!canSuspend ? 'disabled' : ''}>
          <i class="fas fa-pause"></i>
        </button>
        <button class="btn btn-sm btn-outline-info" onclick="controlMci('${mci.id}', 'restart')" title="Restart" ${!canRestart ? 'disabled' : ''}>
          <i class="fas fa-sync-alt"></i>
        </button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteMci('${mci.id}')" title="Delete">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    `;
    
    // Add click event to select MCI
    row.style.cursor = 'pointer';
    row.addEventListener('click', function(e) {
      // Don't trigger when clicking on buttons
      if (e.target.closest('.action-buttons')) {
        return;
      }
      selectMci(mci.id);
    });
    
    // Highlight selected MCI
    if (selectedMciId === mci.id) {
      row.classList.add('table-active');
    }
    
    tbody.appendChild(row);
  });
}

// Select MCI and update VM table
function selectMci(mciId) {
  selectedMciId = mciId;
  console.log(`Selected MCI: ${mciId}`);
  
  // Debug: Check if sync function exists
  console.log(`[DEBUG] In iframe, trying to access parent window`);
  
  try {
    // Try to access parent window function
    if (window.parent && window.parent !== window) {
      console.log(`[DEBUG] Parent window exists, checking for sync function`);
      if (window.parent.syncMciSelectionFromDashboard && typeof window.parent.syncMciSelectionFromDashboard === 'function') {
        console.log(`[DEBUG] Calling parent sync function with:`, mciId);
        window.parent.syncMciSelectionFromDashboard(mciId);
      } else {
        console.log(`[DEBUG] Parent sync function not found`);
      }
    } else {
      console.log(`[DEBUG] No parent window found, trying direct access`);
      if (window.syncMciSelectionFromDashboard && typeof window.syncMciSelectionFromDashboard === 'function') {
        console.log(`[DEBUG] Calling direct sync function with:`, mciId);
        window.syncMciSelectionFromDashboard(mciId);
      } else {
        console.log(`[DEBUG] Direct sync function not available`);
      }
    }
  } catch (error) {
    console.log(`[DEBUG] Error during sync:`, error);
  }
  
  // Update MCI table highlighting
  updateMciTable();
  
  // Update VM table to show only VMs from selected MCI
  updateVmTable();
  
  // Update VM section header
  const vmHeader = document.querySelector('#vmTable').closest('.content-card').querySelector('h5');
  if (vmHeader) {
    vmHeader.innerHTML = `<i class="fas fa-server me-2"></i>Virtual Machine Details - ${mciId} <span class="badge badge-secondary ml-2" id="vmCountBadge">0</span>`;
  }
  
  // Update show all button visibility
  updateShowAllButton();
}

// Show all VMs (clear MCI selection)
function showAllVms() {
  selectedMciId = null;
  console.log('Showing all VMs');
  
  // Update MCI table highlighting
  updateMciTable();
  
  // Update VM table to show all VMs
  updateVmTable();
  
  // Update VM section header
  const vmHeader = document.querySelector('#vmTable').closest('.card').querySelector('.card-header h5');
  if (vmHeader) {
    vmHeader.innerHTML = `<i class="fas fa-server me-2"></i>Virtual Machine Details <span class="badge badge-secondary ml-2" id="vmCountBadge">0</span>`;
  }
  
  // Update show all button visibility
  updateShowAllButton();
}

// Update show all button visibility
function updateShowAllButton() {
  const showAllBtn = document.getElementById('showAllBtn');
  if (showAllBtn) {
    showAllBtn.style.display = selectedMciId ? 'inline-block' : 'none';
  }
}

// Update VM table
function updateVmTable() {
  const tbody = document.getElementById('vmTableBody');
  tbody.innerHTML = '';
  
  // Filter VMs based on selected MCI
  let filteredVms = vmData;
  if (selectedMciId) {
    filteredVms = vmData.filter(vm => vm.mciId === selectedMciId);
  }
  
  // Update VM count display
  const vmCountElement = document.getElementById('vmCountBadge');
  if (vmCountElement) {
    vmCountElement.textContent = filteredVms.length;
  }
  
  if (filteredVms.length === 0 && selectedMciId) {
    // Show message when no VMs found for selected MCI
    const row = document.createElement('tr');
    row.innerHTML = `
      <td colspan="8" class="text-center text-muted py-4">
        <i class="fas fa-info-circle me-2"></i>
        No VMs found for selected MCI: ${selectedMciId}
      </td>
    `;
    tbody.appendChild(row);
    return;
  }
  
  filteredVms.forEach(vm => {
    const row = document.createElement('tr');
    
    const provider = vm.connectionConfig ? vm.connectionConfig.providerName : 'Unknown';
    const region = vm.region ? vm.region.Region : (vm.location ? vm.location.cloudType : 'N/A');
    const spec = vm.specId || 'N/A';
    const publicIp = vm.publicIP || 'N/A';
    const privateIp = vm.privateIP || 'N/A';
    
    // Helper function to truncate text and add tooltip
    const truncateWithTooltip = (text, maxLength = 20) => {
      if (!text || text === 'N/A') return text;
      if (text.length <= maxLength) return text;
      return `<span title="${text.replace(/"/g, '&quot;')}">${text.substring(0, maxLength)}...</span>`;
    };
    
    // Normalize status for CSS class
    let statusClass = vm.status ? vm.status.toLowerCase() : 'unknown';
    
    // Determine button states
    const isRunning = vm.status === 'Running';
    const canResume = ['Suspended', 'Failed'].includes(vm.status);
    const canSuspend = isRunning;
    const canRestart = isRunning;
    
    row.innerHTML = `
      <td title="${vm.id}"><strong>${truncateWithTooltip(vm.id, 15)}</strong></td>
      <td title="${vm.mciId}">${truncateWithTooltip(vm.mciId, 15)}</td>
      <td><span class="status-badge status-${statusClass}">${vm.status || 'Unknown'}</span></td>
      <td title="${provider}">${truncateWithTooltip(provider, 12)}</td>
      <td title="${region}">${truncateWithTooltip(region, 15)}</td>
      <td title="${spec}">${truncateWithTooltip(spec, 18)}</td>
      <td title="${publicIp}">${truncateWithTooltip(publicIp, 15)}</td>
      <td title="${privateIp}">${truncateWithTooltip(privateIp, 15)}</td>
      <td class="action-buttons">
        <button class="btn btn-sm btn-outline-primary" onclick="viewVmDetails('${vm.mciId}', '${vm.id}')" title="View Details">
          <i class="fas fa-eye"></i>
        </button>
        <button class="btn btn-sm btn-outline-success" onclick="controlVm('${vm.mciId}', '${vm.id}', 'resume')" title="Resume" ${!canResume ? 'disabled' : ''}>
          <i class="fas fa-play"></i>
        </button>
        <button class="btn btn-sm btn-outline-warning" onclick="controlVm('${vm.mciId}', '${vm.id}', 'suspend')" title="Suspend" ${!canSuspend ? 'disabled' : ''}>
          <i class="fas fa-pause"></i>
        </button>
        <button class="btn btn-sm btn-outline-info" onclick="controlVm('${vm.mciId}', '${vm.id}', 'restart')" title="Restart" ${!canRestart ? 'disabled' : ''}>
          <i class="fas fa-sync-alt"></i>
        </button>
      </td>
    `;
    
    // Add click event to select MCI when clicking on VM row (but not on buttons)
    row.addEventListener('click', function(event) {
      // Don't trigger if clicking on buttons or links
      if (event.target.closest('button') || event.target.closest('a')) {
        return;
      }
      // Select the MCI this VM belongs to
      if (vm.mciId && selectedMciId !== vm.mciId) {
        selectMci(vm.mciId);
      }
    });
    
    row.style.cursor = 'pointer';
    
    tbody.appendChild(row);
  });
}

// Update resource display
function updateResourceDisplay() {
  // Update Network Resources
  const networkContent = document.getElementById('networkResourcesContent');
  const vNets = resourceData.vNet || [];
  
  // Remove loading overlay
  const networkLoading = networkContent.querySelector('.loading-overlay');
  if (networkLoading) {
    networkLoading.remove();
  }
  
  networkContent.innerHTML = `
    <div class="list-group">
      ${vNets.map(vnet => `
        <div class="list-group-item d-flex justify-content-between align-items-center">
          <div>
            <strong>${vnet.id || vnet.name}</strong>
            <br><small class="text-muted">${vnet.connectionName || vnet.connectionConfig?.configName || 'N/A'}</small>
          </div>
          <span class="badge badge-primary">${vnet.status || 'Available'}</span>
        </div>
      `).join('')}
      ${vNets.length === 0 ? '<div class="text-center text-muted p-3">No vNets found</div>' : ''}
    </div>
  `;

  // Update Security Groups
  const sgContent = document.getElementById('securityGroupsContent');
  const securityGroups = resourceData.securityGroup || [];
  
  // Remove loading overlay
  const sgLoading = sgContent.querySelector('.loading-overlay');
  if (sgLoading) {
    sgLoading.remove();
  }
  
  sgContent.innerHTML = `
    <div class="list-group">
      ${securityGroups.map(sg => `
        <div class="list-group-item d-flex justify-content-between align-items-center">
          <div>
            <strong>${sg.id || sg.name}</strong>
            <br><small class="text-muted">${sg.connectionName || sg.connectionConfig?.configName || 'N/A'}</small>
          </div>
          <span class="badge badge-info">${sg.firewallRules ? sg.firewallRules.length : 0} rules</span>
        </div>
      `).join('')}
      ${securityGroups.length === 0 ? '<div class="text-center text-muted p-3">No security groups found</div>' : ''}
    </div>
  `;

  // Update SSH Keys
  const sshContent = document.getElementById('sshKeysContent');
  const sshKeys = resourceData.sshKey || [];
  
  // Remove loading overlay
  const sshLoading = sshContent.querySelector('.loading-overlay');
  if (sshLoading) {
    sshLoading.remove();
  }
  
  sshContent.innerHTML = `
    <div class="list-group">
      ${sshKeys.map(key => `
        <div class="list-group-item d-flex justify-content-between align-items-center">
          <div>
            <strong>${key.id || key.name}</strong>
            <br><small class="text-muted">${key.connectionName || key.connectionConfig?.configName || 'N/A'}</small>
          </div>
          <span class="badge badge-secondary">SSH</span>
        </div>
      `).join('')}
      ${sshKeys.length === 0 ? '<div class="text-center text-muted p-3">No SSH keys found</div>' : ''}
    </div>
  `;
}

// Control MCI actions
async function controlMci(mciId, action) {
  if (!confirm(`Are you sure you want to ${action} MCI: ${mciId}?`)) {
    return;
  }
  
  const url = `http://${dashboardConfig.hostname}:${dashboardConfig.port}/tumblebug/ns/${dashboardConfig.namespace}/control/mci/${mciId}?action=${action}`;
  
  try {
    showRefreshIndicator(true);
    
    const response = await axios.get(url, {
      auth: {
        username: dashboardConfig.username,
        password: dashboardConfig.password
      },
      timeout: 60000
    });
    
    showSuccessMessage(`MCI ${action} command sent successfully!`);
    
    // Refresh data after a delay to allow the action to take effect
    setTimeout(() => {
      refreshDashboard();
    }, 2000);
    
  } catch (error) {
    console.error(`Error controlling MCI ${mciId}:`, error);
    showErrorMessage(`Failed to ${action} MCI: ${error.response?.data?.message || error.message}`);
  } finally {
    showRefreshIndicator(false);
  }
}

// Control VM actions
async function controlVm(mciId, vmId, action) {
  if (!confirm(`Are you sure you want to ${action} VM: ${vmId}?`)) {
    return;
  }
  
  const url = `http://${dashboardConfig.hostname}:${dashboardConfig.port}/tumblebug/ns/${dashboardConfig.namespace}/control/mci/${mciId}/vm/${vmId}?action=${action}`;
  
  try {
    showRefreshIndicator(true);
    
    const response = await axios.get(url, {
      auth: {
        username: dashboardConfig.username,
        password: dashboardConfig.password
      },
      timeout: 60000
    });
    
    showSuccessMessage(`VM ${action} command sent successfully!`);
    
    // Refresh data after a delay
    setTimeout(() => {
      refreshDashboard();
    }, 2000);
    
  } catch (error) {
    console.error(`Error controlling VM ${vmId}:`, error);
    showErrorMessage(`Failed to ${action} VM: ${error.response?.data?.message || error.message}`);
  } finally {
    showRefreshIndicator(false);
  }
}

// Delete MCI
async function deleteMci(mciId) {
  const result = await Swal.fire({
    title: 'Delete MCI',
    text: `Are you sure you want to delete MCI: ${mciId}? This action cannot be undone.`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc3545',
    cancelButtonColor: '#6c757d',
    confirmButtonText: 'Yes, delete it!',
    cancelButtonText: 'Cancel'
  });
  
  if (!result.isConfirmed) {
    return;
  }
  
  const url = `http://${dashboardConfig.hostname}:${dashboardConfig.port}/tumblebug/ns/${dashboardConfig.namespace}/mci/${mciId}`;
  
  try {
    showRefreshIndicator(true);
    
    const response = await axios.delete(url, {
      auth: {
        username: dashboardConfig.username,
        password: dashboardConfig.password
      },
      timeout: 60000
    });
    
    showSuccessMessage(`MCI ${mciId} deleted successfully!`);
    
    // Refresh data
    refreshDashboard();
    
  } catch (error) {
    console.error(`Error deleting MCI ${mciId}:`, error);
    showErrorMessage(`Failed to delete MCI: ${error.response?.data?.message || error.message}`);
  } finally {
    showRefreshIndicator(false);
  }
}

// View MCI details
async function viewMciDetails(mciId) {
  const mci = mciData.find(m => m.id === mciId);
  if (!mci) {
    showErrorMessage('MCI not found');
    return;
  }
  
  const formatter = new JSONFormatter(mci, 2);
  
  Swal.fire({
    title: `MCI Details: ${mciId}`,
    html: `<div style="text-align: left; max-height: 400px; overflow-y: auto;">${formatter.render().outerHTML}</div>`,
    width: '80%',
    showCloseButton: true,
    showConfirmButton: false
  });
}

// View VM details
async function viewVmDetails(mciId, vmId) {
  const vm = vmData.find(v => v.mciId === mciId && v.id === vmId);
  if (!vm) {
    showErrorMessage('VM not found');
    return;
  }
  
  const formatter = new JSONFormatter(vm, 2);
  
  Swal.fire({
    title: `VM Details: ${vmId}`,
    html: `<div style="text-align: left; max-height: 400px; overflow-y: auto;">${formatter.render().outerHTML}</div>`,
    width: '80%',
    showCloseButton: true,
    showConfirmButton: false
  });
}

// Show create MCI modal
function showCreateMciModal() {
  Swal.fire({
    title: 'Create New MCI',
    html: `
      <div class="form-group text-left">
        <label for="newMciId">MCI ID:</label>
        <input type="text" id="newMciId" class="form-control" placeholder="Enter MCI ID">
      </div>
      <div class="form-group text-left">
        <label for="newMciDescription">Description:</label>
        <input type="text" id="newMciDescription" class="form-control" placeholder="Enter description">
      </div>
      <div class="form-group text-left">
        <label for="newMciPolicy">Recommendation Policy:</label>
        <select id="newMciPolicy" class="form-control">
          <option value="location">Location-based</option>
          <option value="price">Cost-based</option>
          <option value="performance">Performance-based</option>
          <option value="random">Random-based</option>
        </select>
      </div>
      <div class="alert alert-info text-left">
        <small><i class="fas fa-info-circle"></i> For advanced MCI configuration, please use the Map view interface.</small>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'Create MCI',
    cancelButtonText: 'Cancel',
    preConfirm: () => {
      const mciId = document.getElementById('newMciId').value;
      const description = document.getElementById('newMciDescription').value;
      const policy = document.getElementById('newMciPolicy').value;
      
      if (!mciId) {
        Swal.showValidationMessage('Please enter MCI ID');
        return false;
      }
      
      return { mciId, description, policy };
    }
  }).then((result) => {
    if (result.isConfirmed) {
      // For now, redirect to map view for MCI creation
      window.open('index.html', '_blank');
      showInfoMessage('Please use the Map view for detailed MCI configuration and creation.');
    }
  });
}

// Refresh specific lists
function refreshMciList() {
  showRefreshIndicator(true);
  
  loadMciData().then(() => {
    updateStatistics();
    updateCharts();
    updateMciTable();
    updateVmTable();
    showSuccessMessage('MCI list refreshed!', 1500);
  }).catch(error => {
    console.error('Error refreshing MCI list:', error);
    showErrorMessage('Failed to refresh MCI list: ' + (error.response?.data?.message || error.message));
  }).finally(() => {
    showRefreshIndicator(false);
  });
}

function refreshVmList() {
  refreshMciList(); // VM data comes from MCI data
}

// Auto-refresh functionality
function startAutoRefresh() {
  // Clear existing timer
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }
  
  // Start new timer
  refreshTimer = setInterval(() => {
    refreshDashboard();
  }, dashboardConfig.refreshInterval);
  
  console.log(`Auto-refresh started with interval: ${dashboardConfig.refreshInterval}ms`);
}

// Show/hide refresh indicator
function showRefreshIndicator(show) {
  const indicator = document.getElementById('refreshIndicator');
  indicator.style.display = show ? 'inline-block' : 'none';
}

// Message functions
function showSuccessMessage(message, duration = 3000) {
  Swal.fire({
    icon: 'success',
    text: message,
    timer: duration,
    showConfirmButton: false,
    toast: true,
    position: 'top-end'
  });
}

function showErrorMessage(message) {
  Swal.fire({
    icon: 'error',
    title: 'Error',
    text: message,
    confirmButtonText: 'OK'
  });
}

function showConnectionError(message) {
  Swal.fire({
    icon: 'error',
    title: 'Connection Error',
    text: message,
    showConfirmButton: false,
    toast: true,
    position: 'top-end',
    timer: 5000,
    timerProgressBar: true
  });
}

function showInfoMessage(message) {
  Swal.fire({
    icon: 'info',
    text: message,
    confirmButtonText: 'OK'
  });
}

// Setup event listeners
function setupEventListeners() {
  // Handle namespace change
  document.getElementById('namespace').addEventListener('change', function() {
    dashboardConfig.namespace = this.value;
    refreshDashboard();
  });
  
  // Handle refresh interval change in settings
  document.getElementById('refreshInterval').addEventListener('change', function() {
    dashboardConfig.refreshInterval = parseInt(this.value) * 1000;
    startAutoRefresh();
  });
  
  // Handle settings form submission with Enter key
  document.getElementById('settingsForm').addEventListener('submit', function(e) {
    e.preventDefault();
    saveSettings();
  });
  
  // Add keyboard shortcuts
  document.addEventListener('keydown', function(e) {
    // Ctrl+R or F5 for refresh
    if ((e.ctrlKey && e.key === 'r') || e.key === 'F5') {
      e.preventDefault();
      refreshDashboard();
    }
    
    // Ctrl+, for settings
    if (e.ctrlKey && e.key === ',') {
      e.preventDefault();
      showSettings();
    }
  });
}

// Export functions for global access
window.refreshDashboard = refreshDashboard;
window.showSettings = showSettings;
window.saveSettings = saveSettings;
window.controlMci = controlMci;
window.controlVm = controlVm;
window.deleteMci = deleteMci;
window.viewMciDetails = viewMciDetails;
window.viewVmDetails = viewVmDetails;
window.showCreateMciModal = showCreateMciModal;
window.refreshMciList = refreshMciList;
window.refreshVmList = refreshVmList;
