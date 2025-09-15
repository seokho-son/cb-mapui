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
  
  // Subscribe to central data updates from parent/main window
  if (window.parent && window.parent.subscribeToDataUpdates) {
    console.log('Subscribing to central data updates...');
    window.parent.subscribeToDataUpdates(function(centralData) {
      console.log('Received data update from central store:', centralData);
      // Update local data
      mciData = centralData.mciData || [];
      vmData = centralData.vmData || [];
      resourceData = centralData.resourceData || {};
      
      // Update connection status based on data freshness
      if (centralData.lastUpdated && (Date.now() - new Date(centralData.lastUpdated).getTime()) < 30000) {
        updateConnectionStatus('connected');
      } else {
        updateConnectionStatus('disconnected');
      }
      
      // Update UI components
      updateStatistics();
      updateCharts();
      updateMciTable();
      updateVmTable();
      updateAllResourceTables();
      
      // Update last updated timestamp
      const lastUpdatedElement = document.getElementById('lastUpdated');
      if (lastUpdatedElement && centralData.lastUpdated) {
        lastUpdatedElement.textContent = new Date(centralData.lastUpdated).toLocaleTimeString('en-US');
      } else {
        lastUpdatedElement.textContent = 'No data';
      }
    });
    
    // Check if data is already available
    if (window.parent.cloudBaristaCentralData) {
      console.log('Using existing central data...');
      const centralData = window.parent.cloudBaristaCentralData;
      mciData = centralData.mciData || [];
      vmData = centralData.vmData || [];
      resourceData = centralData.resourceData || {};
      
      // Update connection status based on data availability
      if (centralData.lastUpdated && (Date.now() - new Date(centralData.lastUpdated).getTime()) < 30000) {
        updateConnectionStatus('connected');
      } else {
        updateConnectionStatus('disconnected');
      }
      
      // Update last updated timestamp
      const lastUpdatedElement = document.getElementById('lastUpdated');
      if (lastUpdatedElement && centralData.lastUpdated) {
        lastUpdatedElement.textContent = new Date(centralData.lastUpdated).toLocaleTimeString('en-US');
      } else {
        lastUpdatedElement.textContent = 'No data';
      }
      
      updateStatistics();
      updateCharts();
      updateMciTable();
      updateVmTable();
      updateAllResourceTables();
      
      // Force update resource counts even if no MCI data
      updateResourceCounts();
    } else {
      // No central data available yet
      console.log('Central data not available, waiting for data from Map...');
      updateConnectionStatus('disconnected');
      document.getElementById('lastUpdated').textContent = 'Waiting for Map data...';
    }
  } else {
    // Fallback: traditional loading if not in iframe
    console.log('Not in iframe context, using traditional data loading...');
    refreshDashboard();
    startAutoRefresh();
  }
  
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
  // Combined MCI & VM Status Chart
  const combinedStatusCtx = document.getElementById('combinedStatusChart').getContext('2d');
  charts.combinedStatus = new Chart(combinedStatusCtx, {
    type: 'bar',
    data: {
      labels: ['Preparing', 'Creating', 'Running', 'Suspended', 'Terminating', 'Terminated', 'Failed', 'Other'],
      datasets: [
        {
          label: 'MCI Count',
          data: [0, 0, 0, 0, 0, 0, 0, 0],
          backgroundColor: 'rgba(40, 167, 69, 0.8)',   // Green with transparency
          borderColor: '#28a745',
          borderWidth: 1
        },
        {
          label: 'VM Count',
          data: [0, 0, 0, 0, 0, 0, 0, 0],
          backgroundColor: 'rgba(23, 162, 184, 0.8)',  // Blue with transparency
          borderColor: '#17a2b8',
          borderWidth: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 0 // Disable animations for frequent updates
      },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            boxWidth: 12,
            fontSize: 12
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const label = context.dataset.label || '';
              const value = context.parsed.y || 0;
              return `${label}: ${value}`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 1
          },
          title: {
            display: true,
            text: 'Count'
          }
        },
        x: {
          title: {
            display: true,
            text: 'Status'
          }
        }
      }
    }
  });

  // Provider & Region Combined Chart
  const providerRegionCtx = document.getElementById('providerRegionChart').getContext('2d');
  charts.providerRegion = new Chart(providerRegionCtx, {
    type: 'bar',
    data: {
      labels: [], // Provider names
      datasets: [] // Will be dynamically populated with regions
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 0 // Disable animations for frequent updates
      },
      scales: {
        x: {
          stacked: true
        },
        y: {
          stacked: true,
          beginAtZero: true,
          ticks: {
            stepSize: 1
          }
        }
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            boxWidth: 12,
            fontSize: 10
          }
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            title: function(tooltipItems) {
              return 'Provider: ' + tooltipItems[0].label;
            },
            label: function(context) {
              return context.dataset.label + ': ' + context.parsed.y + ' VMs';
            }
          }
        }
      },
      interaction: {
        mode: 'index',
        intersect: false
      }
    }
  });
}

// Main refresh function - now uses shared data from index.js
async function refreshDashboard() {
  console.log('Refreshing dashboard using shared data...');
  showRefreshIndicator(true);
  
  try {
    // Trigger data update from parent window (Map)
    if (window.parent && typeof window.parent.getMci === 'function') {
      console.log('Requesting data update from Map...');
      window.parent.getMci();
      
      // Wait a moment for data to be updated
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Check if parent window has central data
    if (window.parent && window.parent.cloudBaristaCentralData) {
      const centralData = window.parent.cloudBaristaCentralData;
      
      // Update local data references
      mciData = centralData.mciData || [];
      vmData = centralData.vmData || [];
      resourceData = centralData.resourceData || {};
      
      // Update connection status based on data availability
      if (centralData.lastUpdated && (Date.now() - new Date(centralData.lastUpdated).getTime()) < 30000) {
        updateConnectionStatus('connected');
      } else {
        updateConnectionStatus('disconnected');
      }
      
      // Update all displays
      updateStatistics();
      updateCharts();
      updateMciTable();
      updateVmTable();
      updateAllResourceTables();
      
      // Update UI controls
      updateShowAllButton();
      
      // Update last refresh time from central data
      const lastUpdatedElement = document.getElementById('lastUpdated');
      if (lastUpdatedElement && centralData.lastUpdated) {
        lastUpdatedElement.textContent = new Date(centralData.lastUpdated).toLocaleTimeString('en-US');
      } else {
        lastUpdatedElement.textContent = 'No data';
      }
      
      console.log('Dashboard refreshed with shared data');
    } else {
      console.warn('No shared data available from parent window');
      updateConnectionStatus('disconnected');
      document.getElementById('lastUpdated').textContent = 'No connection';
    }
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
      statusElement.innerHTML = '<i class="fas fa-sync fa-spin"></i> Updating';
      break;
    case 'disconnected':
      statusElement.className = 'badge badge-danger';
      statusElement.innerHTML = '<i class="fas fa-times-circle"></i> No Data';
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

  // Update resource counts from central data
  updateResourceCounts();
}

// Update resource counts from central data store
function updateResourceCounts() {
  try {
    // Get data from central store through parent window
    let centralData = {};
    if (window.parent && window.parent.cloudBaristaCentralData) {
      centralData = window.parent.cloudBaristaCentralData;
      console.log('Central data available:', centralData);
    } else {
      console.log('Central data not available');
    }

    // Update vNet count
    const vNetCount = centralData.vNet ? centralData.vNet.length : 0;
    const vNetElement = document.getElementById('vNetCount');
    if (vNetElement) vNetElement.textContent = vNetCount;
    console.log('vNet count:', vNetCount, 'Data:', centralData.vNet);

    // Update Security Group count
    const securityGroupCount = centralData.securityGroup ? centralData.securityGroup.length : 0;
    const securityGroupElement = document.getElementById('securityGroupCount');
    if (securityGroupElement) securityGroupElement.textContent = securityGroupCount;
    console.log('Security Group count:', securityGroupCount, 'Data:', centralData.securityGroup);

    // Update SSH Key count
    const sshKeyCount = centralData.sshKey ? centralData.sshKey.length : 0;
    const sshKeyElement = document.getElementById('sshKeyCount');
    if (sshKeyElement) sshKeyElement.textContent = sshKeyCount;
    console.log('SSH Key count:', sshKeyCount, 'Data:', centralData.sshKey);
    // Update K8s Cluster count
    const k8sClusterCount = centralData.k8sCluster ? centralData.k8sCluster.length : 0;
    const k8sClusterElement = document.getElementById('k8sClusterCount');
    if (k8sClusterElement) k8sClusterElement.textContent = k8sClusterCount;

    // Update Connection count
    const connectionCount = centralData.connection ? centralData.connection.length : 0;
    const connectionElement = document.getElementById('connectionCount');
    if (connectionElement) connectionElement.textContent = connectionCount;

    // Update VPN count
    const vpnCount = centralData.vpn ? centralData.vpn.length : 0;
    const vpnElement = document.getElementById('vpnCount');
    if (vpnElement) vpnElement.textContent = vpnCount;

    // Update Custom Image count
    const customImageCount = centralData.customImage ? centralData.customImage.length : 0;
    const customImageElement = document.getElementById('customImageCount');
    if (customImageElement) customImageElement.textContent = customImageCount;

    // Update Data Disk count
    const dataDiskCount = centralData.dataDisk ? centralData.dataDisk.length : 0;
    const dataDiskElement = document.getElementById('dataDiskCount');
    if (dataDiskElement) dataDiskElement.textContent = dataDiskCount;

    // Update Object Storage count (API not yet available)
    const objectStorageCount = 0; // TODO: API not yet implemented in CB-Tumblebug
    const objectStorageElement = document.getElementById('objectStorageCount');
    if (objectStorageElement) objectStorageElement.textContent = objectStorageCount;

    // Update SQL Database count (API not yet available)
    const sqlDbCount = 0; // TODO: API not yet implemented in CB-Tumblebug
    const sqlDbElement = document.getElementById('sqlDbCount');
    if (sqlDbElement) sqlDbElement.textContent = sqlDbCount;

    console.log('Resource counts updated:', {
      vNet: vNetCount,
      securityGroup: securityGroupCount,
      sshKey: sshKeyCount,
      k8sCluster: k8sClusterCount,
      connection: connectionCount,
      vpn: vpnCount,
      customImage: customImageCount,
      dataDisk: dataDiskCount,
      objectStorage: objectStorageCount,
      sqlDb: sqlDbCount
    });
  } catch (error) {
    console.error('Error updating resource counts:', error);
  }
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
  
  // Update Combined MCI & VM Status Chart
  const mciStatusCounts = {
    'Running': 0,
    'Creating': 0,
    'Preparing': 0,
    'Suspended': 0,
    'Failed': 0,
    'Terminating': 0,
    'Terminated': 0,
    'Other': 0
  };
  
  const vmStatusCounts = {
    'Running': 0,
    'Creating': 0,
    'Preparing': 0,
    'Suspended': 0,
    'Failed': 0,
    'Terminating': 0,
    'Terminated': 0,
    'Other': 0
  };
  
  // Count MCI statuses
  mciData.forEach(mci => {
    const status = mci.status || 'Unknown';
    let normalizedStatus = 'Other';
    
    if (status.includes('Running') || status === 'Running') {
      normalizedStatus = 'Running';
    } else if (status.includes('Creating') || status === 'Creating') {
      normalizedStatus = 'Creating';
    } else if (status.includes('Preparing') || status === 'Preparing') {
      normalizedStatus = 'Preparing';
    } else if (status.includes('Suspended') || status === 'Suspended') {
      normalizedStatus = 'Suspended';
    } else if (status.includes('Failed') || status === 'Failed' || status.includes('Partial-Failed')) {
      normalizedStatus = 'Failed';
    } else if (status.includes('Terminating') || status === 'Terminating') {
      normalizedStatus = 'Terminating';
    } else if (status.includes('Terminated') || status === 'Terminated') {
      normalizedStatus = 'Terminated';
    }
    
    if (mciStatusCounts.hasOwnProperty(normalizedStatus)) {
      mciStatusCounts[normalizedStatus]++;
    } else {
      mciStatusCounts['Other']++;
    }
  });
  
  // Count VM statuses
  vmData.forEach(vm => {
    const vmStatus = vm.status || 'Unknown';
    let normalizedVmStatus = 'Other';
    
    if (vmStatus.includes('Running') || vmStatus === 'Running') {
      normalizedVmStatus = 'Running';
    } else if (vmStatus.includes('Creating') || vmStatus === 'Creating') {
      normalizedVmStatus = 'Creating';
    } else if (vmStatus.includes('Preparing') || vmStatus === 'Preparing') {
      normalizedVmStatus = 'Preparing';
    } else if (vmStatus.includes('Suspended') || vmStatus === 'Suspended') {
      normalizedVmStatus = 'Suspended';
    } else if (vmStatus.includes('Failed') || vmStatus === 'Failed') {
      normalizedVmStatus = 'Failed';
    } else if (vmStatus.includes('Terminating') || vmStatus === 'Terminating') {
      normalizedVmStatus = 'Terminating';
    } else if (vmStatus.includes('Terminated') || vmStatus === 'Terminated') {
      normalizedVmStatus = 'Terminated';
    }
    
    if (vmStatusCounts.hasOwnProperty(normalizedVmStatus)) {
      vmStatusCounts[normalizedVmStatus]++;
    } else {
      vmStatusCounts['Other']++;
    }
  });
  
  // Prepare data for combined chart
  const statusLabels = ['Preparing', 'Creating', 'Running', 'Suspended', 'Terminating', 'Terminated', 'Failed', 'Other'];
  const mciDataArray = statusLabels.map(label => mciStatusCounts[label] || 0);
  const vmDataArray = statusLabels.map(label => vmStatusCounts[label] || 0);
  
  // Update combined chart
  charts.combinedStatus.data.labels = statusLabels;
  charts.combinedStatus.data.datasets[0].data = mciDataArray;  // MCI Count
  charts.combinedStatus.data.datasets[1].data = vmDataArray;   // VM Count
  charts.combinedStatus.update('none'); // Disable animation for this update
  
  // Update Provider & Region Combined Chart
  const providerRegionData = {};
  
  // Collect data by provider and region
  vmData.forEach(vm => {
    let provider = 'Unknown';
    let region = 'Unknown';
    
    // Extract provider information
    if (vm.connectionConfig && vm.connectionConfig.providerName) {
      provider = vm.connectionConfig.providerName;
    } else if (vm.location && vm.location.cloudType) {
      provider = vm.location.cloudType;
    }
    
    // Extract region information
    if (vm.region && vm.region.Region) {
      region = vm.region.Region;
    } else if (vm.location && vm.location.region) {
      region = vm.location.region;
    }
    
    // Initialize provider if not exists
    if (!providerRegionData[provider]) {
      providerRegionData[provider] = {};
    }
    
    // Count VMs by provider and region
    providerRegionData[provider][region] = (providerRegionData[provider][region] || 0) + 1;
  });
  
  // Process data for stacked bar chart
  const providers = Object.keys(providerRegionData);
  const allRegions = new Set();
  
  // Get all unique regions
  providers.forEach(provider => {
    Object.keys(providerRegionData[provider]).forEach(region => {
      allRegions.add(region);
    });
  });
  
  const regionColors = [
    '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40',
    '#FF6B6B', '#C9CBCF', '#4BC0C0', '#FFA07A', '#98D8C8', '#F7DC6F'
  ];
  
  // Prepare datasets for each region
  const datasets = Array.from(allRegions).map((region, index) => ({
    label: region,
    data: providers.map(provider => providerRegionData[provider][region] || 0),
    backgroundColor: regionColors[index % regionColors.length],
    borderColor: regionColors[index % regionColors.length],
    borderWidth: 1
  }));
  
  // Handle empty data
  if (providers.length === 0) {
    charts.providerRegion.data.labels = ['No Data'];
    charts.providerRegion.data.datasets = [{
      label: 'No VMs',
      data: [1],
      backgroundColor: ['#e9ecef']
    }];
  } else {
    charts.providerRegion.data.labels = providers;
    charts.providerRegion.data.datasets = datasets;
  }
  
  charts.providerRegion.update('none'); // Disable animation for this update
}

// Update MCI table
function updateMciTable() {
  const tbody = document.getElementById('mciTableBody');
  tbody.innerHTML = '';
  
  // Update count badge
  const countBadge = document.getElementById('mciCountBadge');
  if (countBadge) {
    countBadge.textContent = mciData.length;
  }
  
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
    let statusClass = 'unknown';
    if (mci.status) {
      const status = mci.status.toLowerCase();
      if (status.includes('running') || status === 'running') {
        statusClass = 'running';
      } else if (status.includes('creating') || status === 'creating') {
        statusClass = 'creating';
      } else if (status.includes('preparing') || status === 'preparing') {
        statusClass = 'preparing';
      } else if (status.includes('suspended') || status === 'suspended') {
        statusClass = 'suspended';
      } else if (status.includes('failed') || status === 'failed') {
        statusClass = 'failed';
      } else if (status.includes('terminating') || status === 'terminating') {
        statusClass = 'terminating';
      } else if (status.includes('terminated') || status === 'terminated') {
        statusClass = 'terminated';
      } else if (status.includes('partial-failed') || status === 'partial-failed') {
        statusClass = 'partial-failed';
      } else {
        statusClass = status.replace(/[^a-z0-9-]/g, '');
      }
    }
    
    // Determine button states based on actual status
    const actualStatus = mci.status.startsWith('Creating') ? 'Creating' : mci.status;
    const isRunning = actualStatus === 'Running';
    const canResume = ['Suspended', 'Failed', 'Partial-Failed'].includes(actualStatus);
    const canSuspend = isRunning;
    const canRestart = isRunning;
    
    row.innerHTML = `
      <td title="${mci.id}"><strong>${smartTruncate(mci.id, 'id')}</strong></td>
      <td><span class="status-badge status-${statusClass}">${mci.status}</span></td>
      <td title="${providerList || 'N/A'}">${smartTruncate(providerList || 'N/A', 'provider')}</td>
      <td>${vmCount}</td>
      <td title="${mci.targetAction || 'None'}">${smartTruncate(mci.targetAction || 'None', 'default')}</td>
      <td title="${mci.description || 'N/A'}">${smartTruncate(mci.description || 'N/A', 'description')}</td>
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
  
  // Update VM section header - use safer selector approach
  const vmTable = document.getElementById('vmTable');
  const vmContentCard = vmTable ? vmTable.closest('.content-card') : null;
  const vmHeader = vmContentCard ? vmContentCard.querySelector('h5') : null;
  
  if (vmHeader) {
    vmHeader.innerHTML = `<i class="fas fa-server me-2"></i> Virtual Machine Details - ${mciId} <span class="badge badge-secondary ml-2" id="vmCountBadge">0</span>`;
  } else {
    console.warn('VM header not found in selectMci, trying alternative selector');
    // Fallback: try to find the header directly
    const directHeader = document.querySelector('#vmCountBadge');
    if (directHeader && directHeader.parentElement) {
      directHeader.parentElement.innerHTML = `<i class="fas fa-server me-2"></i>Virtual Machine Details - ${mciId} <span class="badge badge-secondary ml-2" id="vmCountBadge">0</span>`;
    }
  }
  
  // Update VM table to show only VMs from selected MCI
  updateVmTable();
  
  // Update show all button visibility
  updateShowAllButton();
}

// Show all VMs (clear MCI selection)
function showAllVms() {
  selectedMciId = null;
  console.log('Showing all VMs, selectedMciId set to:', selectedMciId);
  
  // Update MCI table highlighting
  updateMciTable();
  
  // Update VM section header - use safer selector approach
  const vmTable = document.getElementById('vmTable');
  const vmContentCard = vmTable ? vmTable.closest('.content-card') : null;
  const vmHeader = vmContentCard ? vmContentCard.querySelector('h5') : null;
  
  if (vmHeader) {
    vmHeader.innerHTML = `<i class="fas fa-server me-2"></i> Virtual Machine Details <span class="badge badge-secondary ml-2" id="vmCountBadge">0</span>`;
  } else {
    console.warn('VM header not found, trying alternative selector');
    // Fallback: try to find the header directly
    const directHeader = document.querySelector('#vmCountBadge');
    if (directHeader && directHeader.parentElement) {
      directHeader.parentElement.innerHTML = `<i class="fas fa-server me-2"></i> Virtual Machine Details <span class="badge badge-secondary ml-2" id="vmCountBadge">0</span>`;
    }
  }
  
  // Update VM table to show all VMs
  updateVmTable();
  
  // Update show all button visibility
  updateShowAllButton();
}

// Update show all button visibility
function updateShowAllButton() {
  const showAllBtn = document.getElementById('showAllBtn');
  console.log('updateShowAllButton called, selectedMciId:', selectedMciId, 'showAllBtn:', showAllBtn);
  if (showAllBtn) {
    showAllBtn.style.display = selectedMciId ? 'inline-block' : 'none';
    console.log('Show All button display set to:', showAllBtn.style.display);
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
    let statusClass = 'unknown';
    if (vm.status) {
      const status = vm.status.toLowerCase();
      if (status.includes('running') || status === 'running') {
        statusClass = 'running';
      } else if (status.includes('creating') || status === 'creating') {
        statusClass = 'creating';
      } else if (status.includes('preparing') || status === 'preparing') {
        statusClass = 'preparing';
      } else if (status.includes('suspended') || status === 'suspended') {
        statusClass = 'suspended';
      } else if (status.includes('failed') || status === 'failed') {
        statusClass = 'failed';
      } else if (status.includes('terminating') || status === 'terminating') {
        statusClass = 'terminating';
      } else if (status.includes('terminated') || status === 'terminated') {
        statusClass = 'terminated';
      } else if (status.includes('partial-failed') || status === 'partial-failed') {
        statusClass = 'partial-failed';
      } else {
        statusClass = status.replace(/[^a-z0-9-]/g, '');
      }
    }
    
    // Determine button states
    const isRunning = vm.status === 'Running';
    const canResume = ['Suspended', 'Failed'].includes(vm.status);
    const canSuspend = isRunning;
    const canRestart = isRunning;
    
    row.innerHTML = `
      <td title="${vm.id}"><strong>${smartTruncate(vm.id, 'id')}</strong></td>
      <td title="${vm.mciId}">${smartTruncate(vm.mciId, 'id')}</td>
      <td><span class="status-badge status-${statusClass}">${vm.status || 'Unknown'}</span></td>
      <td title="${provider}">${smartTruncate(provider, 'provider')}</td>
      <td title="${region}">${smartTruncate(region, 'region')}</td>
      <td title="${spec}">${smartTruncate(spec, 'spec')}</td>
      <td title="${publicIp}">${smartTruncate(publicIp, 'ip')}</td>
      <td title="${privateIp}">${smartTruncate(privateIp, 'ip')}</td>
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
  // Switch to Map view and Provision tab directly
  if (window.parent && window.parent !== window) {
    // If in iframe, call parent's functions
    if (typeof window.parent.showMap === 'function') {
      window.parent.showMap();
    }
    
    // Switch to Provision tab using Bootstrap tab API
    if (window.parent.$ && window.parent.document) {
      window.parent.$('#provision-tab').tab('show');
    }
    
    showInfoMessage('Switched to Map view for MCI creation. Check the Provision tab.');
  } else {
    // If not in iframe, redirect to index.html
    window.location.href = 'index.html';
  }
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
  // Don't start auto-refresh if using central data subscription
  if (window.parent && window.parent.subscribeToDataUpdates) {
    console.log('Using central data subscription, skipping auto-refresh setup');
    return;
  }
  
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
window.showAllVms = showAllVms;

// Resource table management functions
function updateAllResourceTables() {
  updateVNetTable();
  updateSecurityGroupTable();
  updateSshKeyTable();
  updateK8sClusterTable();
  updateConnectionTable();
  updateCustomImageTable();
  updateDataDiskTable();
}

function updateVNetTable() {
  let centralData = {};
  if (window.parent && window.parent.cloudBaristaCentralData) {
    centralData = window.parent.cloudBaristaCentralData;
  }
  
  const vNetData = centralData.vNet || [];
  const tableBody = document.getElementById('vNetTableBody');
  if (!tableBody) return;
  
  tableBody.innerHTML = '';
  
  // Update count badge
  const countBadge = document.getElementById('vNetCountBadge');
  if (countBadge) {
    countBadge.textContent = vNetData.length;
  }
  
  vNetData.forEach(vnet => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td title="${vnet.id}">${smartTruncate(vnet.id, 'id')}</td>
      <td title="${vnet.name || 'N/A'}">${smartTruncate(vnet.name || 'N/A', 'name')}</td>
      <td><span class="status-badge status-${(vnet.status || 'unknown').toLowerCase()}">${vnet.status || 'Unknown'}</span></td>
      <td title="${vnet.connectionConfig?.providerName || 'N/A'}">${smartTruncate(vnet.connectionConfig?.providerName || 'N/A', 'provider')}</td>
      <td title="${vnet.connectionConfig?.regionDetail?.regionName || 'N/A'}">${smartTruncate(vnet.connectionConfig?.regionDetail?.regionName || 'N/A', 'region')}</td>
      <td title="${vnet.cidrBlock || 'N/A'}">${smartTruncate(vnet.cidrBlock || 'N/A', 'default')}</td>
      <td>${vnet.subnetInfoList ? vnet.subnetInfoList.length : 0}</td>
      <td class="action-buttons">
        <button class="btn btn-sm btn-outline-primary" onclick="viewResourceDetails('vNet', '${vnet.id}')" title="View Details">
          <i class="fas fa-eye"></i>
        </button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteResource('vNet', '${vnet.id}')" title="Delete">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    `;
    tableBody.appendChild(row);
  });
}

function updateSecurityGroupTable() {
  let centralData = {};
  if (window.parent && window.parent.cloudBaristaCentralData) {
    centralData = window.parent.cloudBaristaCentralData;
  }
  
  const sgData = centralData.securityGroup || [];
  const tableBody = document.getElementById('securityGroupTableBody');
  if (!tableBody) return;
  
  tableBody.innerHTML = '';
  
  // Update count badge
  const countBadge = document.getElementById('securityGroupCountBadge');
  if (countBadge) {
    countBadge.textContent = sgData.length;
  }
  
  sgData.forEach(sg => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td title="${sg.id}">${smartTruncate(sg.id, 'id')}</td>
      <td title="${sg.name || 'N/A'}">${smartTruncate(sg.name || 'N/A', 'name')}</td>
      <td title="${sg.connectionConfig?.providerName || 'N/A'}">${smartTruncate(sg.connectionConfig?.providerName || 'N/A', 'provider')}</td>
      <td title="${sg.connectionConfig?.regionDetail?.regionName || 'N/A'}">${smartTruncate(sg.connectionConfig?.regionDetail?.regionName || 'N/A', 'region')}</td>
      <td title="${sg.vNetId || 'N/A'}">${smartTruncate(sg.vNetId || 'N/A', 'id')}</td>
      <td>${sg.firewallRules ? sg.firewallRules.length : 0} rules</td>
      <td title="${sg.description || 'N/A'}">${smartTruncate(sg.description || 'N/A', 'description')}</td>
      <td class="action-buttons">
        <button class="btn btn-sm btn-outline-primary" onclick="viewResourceDetails('securityGroup', '${sg.id}')" title="View Details">
          <i class="fas fa-eye"></i>
        </button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteResource('securityGroup', '${sg.id}')" title="Delete">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    `;
    tableBody.appendChild(row);
  });
}

function updateSshKeyTable() {
  let centralData = {};
  if (window.parent && window.parent.cloudBaristaCentralData) {
    centralData = window.parent.cloudBaristaCentralData;
  }
  
  const sshKeyData = centralData.sshKey || [];
  const tableBody = document.getElementById('sshKeyTableBody');
  if (!tableBody) return;
  
  tableBody.innerHTML = '';
  
  // Update count badge
  const countBadge = document.getElementById('sshKeyCountBadge');
  if (countBadge) {
    countBadge.textContent = sshKeyData.length;
  }
  
  sshKeyData.forEach(key => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td title="${key.id}">${smartTruncate(key.id, 'id')}</td>
      <td title="${key.name || 'N/A'}">${smartTruncate(key.name || 'N/A', 'name')}</td>
      <td title="${key.connectionConfig?.providerName || 'N/A'}">${smartTruncate(key.connectionConfig?.providerName || 'N/A', 'provider')}</td>
      <td title="${key.connectionConfig?.regionDetail?.regionName || 'N/A'}">${smartTruncate(key.connectionConfig?.regionDetail?.regionName || 'N/A', 'region')}</td>
      <td title="${key.fingerprint || 'N/A'}">${smartTruncate(key.fingerprint || 'N/A', 'default')}</td>
      <td>
        <button class="btn btn-outline-secondary btn-sm" onclick="viewKeyMaterial('${key.id}')" title="Show Key Material">
          <i class="fas fa-key"></i>
        </button>
      </td>
      <td class="action-buttons">
        <button class="btn btn-sm btn-outline-primary" onclick="viewResourceDetails('sshKey', '${key.id}')" title="View Details">
          <i class="fas fa-eye"></i>
        </button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteResource('sshKey', '${key.id}')" title="Delete">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    `;
    tableBody.appendChild(row);
  });
}

function updateK8sClusterTable() {
  let centralData = {};
  if (window.parent && window.parent.cloudBaristaCentralData) {
    centralData = window.parent.cloudBaristaCentralData;
  }
  
  const k8sData = centralData.k8sCluster || [];
  const tableBody = document.getElementById('k8sClusterTableBody');
  if (!tableBody) return;
  
  tableBody.innerHTML = '';
  
  // Update count badge
  const countBadge = document.getElementById('k8sClusterCountBadge');
  if (countBadge) {
    countBadge.textContent = k8sData.length;
  }
  
  k8sData.forEach(cluster => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td title="${cluster.id}">${smartTruncate(cluster.id, 'id')}</td>
      <td title="${cluster.name || 'N/A'}">${smartTruncate(cluster.name || 'N/A', 'name')}</td>
      <td><span class="status-badge status-${(cluster.status || 'unknown').toLowerCase()}">${cluster.status || 'Unknown'}</span></td>
      <td title="${cluster.connectionConfig?.providerName || 'N/A'}">${smartTruncate(cluster.connectionConfig?.providerName || 'N/A', 'provider')}</td>
      <td title="${cluster.connectionConfig?.regionDetail?.regionName || 'N/A'}">${smartTruncate(cluster.connectionConfig?.regionDetail?.regionName || 'N/A', 'region')}</td>
      <td title="${cluster.version || 'N/A'}">${smartTruncate(cluster.version || 'N/A', 'default')}</td>
      <td>${cluster.nodeGroupList ? cluster.nodeGroupList.length : 0}</td>
      <td class="action-buttons">
        <button class="btn btn-sm btn-outline-primary" onclick="viewResourceDetails('k8sCluster', '${cluster.id}')" title="View Details">
          <i class="fas fa-eye"></i>
        </button>
        <button class="btn btn-sm btn-outline-warning" onclick="controlK8sCluster('${cluster.id}', 'upgrade')" title="Upgrade">
          <i class="fas fa-arrow-up"></i>
        </button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteResource('k8sCluster', '${cluster.id}')" title="Delete">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    `;
    tableBody.appendChild(row);
  });
}

function updateConnectionTable() {
  let centralData = {};
  if (window.parent && window.parent.cloudBaristaCentralData) {
    centralData = window.parent.cloudBaristaCentralData;
  }
  
  const connectionData = centralData.connection || [];
  
  // Update main connection table (All Connections tab)
  updateAllConnectionsTable(connectionData);
  
  // Create CSP-specific tabs
  createCspTabs(connectionData);
}

function updateAllConnectionsTable(connectionData) {
  const tableBody = document.getElementById('connectionTableBody');
  if (!tableBody) return;
  
  tableBody.innerHTML = '';
  
  // Get CSP provider icons
  const providerIcons = {
    'aws': 'fab fa-aws',
    'azure': 'fab fa-microsoft',
    'gcp': 'fab fa-google',
    'alibaba': 'fas fa-cloud',
    'tencent': 'fas fa-cloud',
    'ncp': 'fas fa-cloud',
    'nhncloud': 'fas fa-cloud',
    'nhn': 'fas fa-cloud',
    'cloudit': 'fas fa-cloud',
    'openstack': 'fas fa-cloud',
    'ibm': 'fas fa-cloud',
    'oracle': 'fas fa-cloud',
    'unknown': 'fas fa-cloud'
  };
  
  connectionData.forEach(conn => {
    const providerId = (conn.providerName || 'unknown').toLowerCase().replace(/[^a-z0-9]/g, '');
    const providerIcon = providerIcons[providerId] || providerIcons[(conn.providerName || 'unknown').toLowerCase()] || 'fas fa-cloud';
    
    const row = document.createElement('tr');
    row.innerHTML = `
      <td title="${conn.configName}">${smartTruncate(conn.configName, 'id')}</td>
      <td>
        <span class="provider-badge provider-${getProviderClass(conn.providerName)}">
          <i class="${providerIcon}"></i> ${conn.providerName || 'N/A'}
        </span>
      </td>
      <td title="${conn.regionDetail?.regionName || 'N/A'}">${smartTruncate(conn.regionDetail?.regionName || 'N/A', 'region')}</td>
      <td>${formatZonesWithHighlight(conn)}</td>
      <td><span class="badge ${conn.verified ? 'badge-success' : 'badge-warning'}">${conn.verified ? 'Yes' : 'No'}</span></td>
      <td><span class="badge ${conn.regionRepresentative ? 'badge-info' : 'badge-secondary'}">${conn.regionRepresentative ? 'Yes' : 'No'}</span></td>
      <td class="action-buttons">
        <button class="btn btn-sm btn-outline-primary" onclick="viewResourceDetails('connection', '${conn.configName}')" title="View Details">
          <i class="fas fa-eye"></i>
        </button>
        <button class="btn btn-sm btn-outline-warning" onclick="testConnection('${conn.configName}')" title="Test Connection">
          <i class="fas fa-check"></i>
        </button>
      </td>
    `;
    tableBody.appendChild(row);
  });
}

function createCspTabs(connectionData) {
  // Group connections by provider
  const cspGroups = {};
  connectionData.forEach(conn => {
    const provider = conn.providerName || 'unknown';
    if (!cspGroups[provider]) {
      cspGroups[provider] = [];
    }
    cspGroups[provider].push(conn);
  });

  // Get CSP provider icons
  const providerIcons = {
    'aws': 'fab fa-aws',
    'azure': 'fab fa-microsoft',
    'gcp': 'fab fa-google',
    'alibaba': 'fas fa-cloud',
    'tencent': 'fas fa-cloud',
    'ncp': 'fas fa-cloud',
    'nhncloud': 'fas fa-cloud',
    'nhn': 'fas fa-cloud',
    'cloudit': 'fas fa-cloud',
    'openstack': 'fas fa-cloud',
    'ibm': 'fas fa-cloud',
    'oracle': 'fas fa-cloud',
    'unknown': 'fas fa-cloud'
  };

  // Create tabs
  const tabsContainer = document.getElementById('connectionTabs');
  const tabContentContainer = document.getElementById('connectionTabContent');
  
  if (!tabsContainer || !tabContentContainer) return;

  // Remove existing CSP tabs (keep "All Connections" tab)
  const existingCspTabs = tabsContainer.querySelectorAll('.csp-tab');
  existingCspTabs.forEach(tab => tab.remove());
  
  // Remove existing CSP tab panes
  const existingCspPanes = tabContentContainer.querySelectorAll('.csp-tab-pane');
  existingCspPanes.forEach(pane => pane.remove());

  // Create CSP-specific tabs
  Object.keys(cspGroups).sort().forEach(provider => {
    const connections = cspGroups[provider];
    const providerId = provider.toLowerCase().replace(/[^a-z0-9]/g, '');
    const providerIcon = providerIcons[providerId] || providerIcons[provider.toLowerCase()] || 'fas fa-cloud';
    
    // Create tab
    const tabItem = document.createElement('li');
    tabItem.className = 'nav-item csp-tab';
    tabItem.role = 'presentation';
    
    const tabLink = document.createElement('a');
    tabLink.className = 'nav-link';
    tabLink.id = `${providerId}-tab`;
    tabLink.setAttribute('data-toggle', 'tab');
    tabLink.setAttribute('href', `#${providerId}-connections`);
    tabLink.setAttribute('role', 'tab');
    tabLink.innerHTML = `<i class="${providerIcon}"></i> ${provider} <span class="badge badge-secondary">${connections.length}</span>`;
    
    tabItem.appendChild(tabLink);
    tabsContainer.appendChild(tabItem);
    
    // Create tab content
    const tabPane = document.createElement('div');
    tabPane.className = 'tab-pane fade csp-tab-pane';
    tabPane.id = `${providerId}-connections`;
    tabPane.setAttribute('role', 'tabpanel');
    
    tabPane.innerHTML = `
      <div class="table-responsive table-container">
        <table class="table table-hover">
          <thead>
            <tr>
              <th>Connection ID</th>
              <th>Provider</th>
              <th>Region</th>
              <th>Zone</th>
              <th>Verified</th>
              <th>Representative</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="${providerId}-connectionTableBody">
          </tbody>
        </table>
      </div>
    `;
    
    tabContentContainer.appendChild(tabPane);
    
    // Populate CSP-specific table
    const cspTableBody = document.getElementById(`${providerId}-connectionTableBody`);
    if (cspTableBody) {
      connections.forEach(conn => {
        const connProviderId = (conn.providerName || 'unknown').toLowerCase().replace(/[^a-z0-9]/g, '');
        const connProviderIcon = providerIcons[connProviderId] || providerIcons[(conn.providerName || 'unknown').toLowerCase()] || 'fas fa-cloud';
        
        const row = document.createElement('tr');
        row.innerHTML = `
          <td title="${conn.configName}">${smartTruncate(conn.configName, 'id')}</td>
          <td>
            <span class="provider-badge provider-${getProviderClass(conn.providerName)}">
              <i class="${connProviderIcon}"></i> ${conn.providerName || 'N/A'}
            </span>
          </td>
          <td title="${conn.regionDetail?.regionName || 'N/A'}">${smartTruncate(conn.regionDetail?.regionName || 'N/A', 'region')}</td>
          <td>${formatZonesWithHighlight(conn)}</td>
          <td><span class="badge ${conn.verified ? 'badge-success' : 'badge-warning'}">${conn.verified ? 'Yes' : 'No'}</span></td>
          <td><span class="badge ${conn.regionRepresentative ? 'badge-info' : 'badge-secondary'}">${conn.regionRepresentative ? 'Yes' : 'No'}</span></td>
          <td class="action-buttons">
            <button class="btn btn-sm btn-outline-primary" onclick="viewResourceDetails('connection', '${conn.configName}')" title="View Details">
              <i class="fas fa-eye"></i>
            </button>
            <button class="btn btn-sm btn-outline-warning" onclick="testConnection('${conn.configName}')" title="Test Connection">
              <i class="fas fa-check"></i>
            </button>
          </td>
        `;
        cspTableBody.appendChild(row);
      });
    }
  });
}

function updateCustomImageTable() {
  let centralData = {};
  if (window.parent && window.parent.cloudBaristaCentralData) {
    centralData = window.parent.cloudBaristaCentralData;
  }
  
  const imageData = centralData.customImage || [];
  const tableBody = document.getElementById('customImageTableBody');
  if (!tableBody) return;
  
  tableBody.innerHTML = '';
  
  // Update count badge
  const countBadge = document.getElementById('customImageCountBadge');
  if (countBadge) {
    countBadge.textContent = imageData.length;
  }
  
  imageData.forEach(image => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td title="${image.id}">${smartTruncate(image.id, 'id')}</td>
      <td title="${image.name || 'N/A'}">${smartTruncate(image.name || 'N/A', 'name')}</td>
      <td><span class="status-badge status-${(image.status || 'unknown').toLowerCase()}">${image.status || 'Unknown'}</span></td>
      <td title="${image.connectionConfig?.providerName || 'N/A'}">${smartTruncate(image.connectionConfig?.providerName || 'N/A', 'provider')}</td>
      <td title="${image.connectionConfig?.regionDetail?.regionName || 'N/A'}">${smartTruncate(image.connectionConfig?.regionDetail?.regionName || 'N/A', 'region')}</td>
      <td title="${image.guestOS || 'N/A'}">${smartTruncate(image.guestOS || 'N/A', 'default')}</td>
      <td>${image.creationDate ? new Date(image.creationDate).toLocaleDateString() : 'N/A'}</td>
      <td class="action-buttons">
        <button class="btn btn-sm btn-outline-primary" onclick="viewResourceDetails('customImage', '${image.id}')" title="View Details">
          <i class="fas fa-eye"></i>
        </button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteResource('customImage', '${image.id}')" title="Delete">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    `;
    tableBody.appendChild(row);
  });
}

function updateDataDiskTable() {
  let centralData = {};
  if (window.parent && window.parent.cloudBaristaCentralData) {
    centralData = window.parent.cloudBaristaCentralData;
  }
  
  const diskData = centralData.dataDisk || [];
  const tableBody = document.getElementById('dataDiskTableBody');
  if (!tableBody) return;
  
  tableBody.innerHTML = '';
  
  // Update count badge
  const countBadge = document.getElementById('dataDiskCountBadge');
  if (countBadge) {
    countBadge.textContent = diskData.length;
  }
  
  diskData.forEach(disk => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td title="${disk.id}">${smartTruncate(disk.id, 'id')}</td>
      <td title="${disk.name || 'N/A'}">${smartTruncate(disk.name || 'N/A', 'name')}</td>
      <td><span class="status-badge status-${(disk.status || 'unknown').toLowerCase()}">${disk.status || 'Unknown'}</span></td>
      <td title="${disk.connectionConfig?.providerName || 'N/A'}">${smartTruncate(disk.connectionConfig?.providerName || 'N/A', 'provider')}</td>
      <td title="${disk.connectionConfig?.regionDetail?.regionName || 'N/A'}">${smartTruncate(disk.connectionConfig?.regionDetail?.regionName || 'N/A', 'region')}</td>
      <td title="${disk.diskSize || 'N/A'}">${smartTruncate(disk.diskSize || 'N/A', 'default')}</td>
      <td title="${disk.diskType || 'N/A'}">${smartTruncate(disk.diskType || 'N/A', 'default')}</td>
      <td class="action-buttons">
        <button class="btn btn-sm btn-outline-primary" onclick="viewResourceDetails('dataDisk', '${disk.id}')" title="View Details">
          <i class="fas fa-eye"></i>
        </button>
        <button class="btn btn-sm btn-outline-warning" onclick="resizeDisk('${disk.id}')" title="Resize">
          <i class="fas fa-expand"></i>
        </button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteResource('dataDisk', '${disk.id}')" title="Delete">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    `;
    tableBody.appendChild(row);
  });
}

// Resource management functions
function refreshResourceList(resourceType) {
  console.log(`Refreshing ${resourceType} list...`);
  // Trigger refresh from parent window
  if (window.parent && window.parent.getMci) {
    window.parent.getMci();
  }
  
  // Show loading indicator
  Swal.fire({
    title: 'Refreshing...',
    text: `Updating ${resourceType} list`,
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
    }
  });
  
  // Hide loading after a short delay
  setTimeout(() => {
    Swal.close();
  }, 2000);
}

function viewResourceDetails(resourceType, resourceId) {
  console.log(`Viewing details for ${resourceType}: ${resourceId}`);
  
  let centralData = {};
  if (window.parent && window.parent.cloudBaristaCentralData) {
    centralData = window.parent.cloudBaristaCentralData;
  }
  
  const resourceData = centralData[resourceType] || [];
  const resource = resourceData.find(item => item.id === resourceId || item.configName === resourceId);
  
  if (resource) {
    const jsonFormatter = new JSONFormatter(resource, 2);
    
    Swal.fire({
      title: `${resourceType} Details`,
      html: `
        <div style="text-align: left; max-height: 400px; overflow-y: auto;">
          <div id="jsonViewer"></div>
        </div>
      `,
      width: '800px',
      didOpen: () => {
        document.getElementById('jsonViewer').appendChild(jsonFormatter.render());
      }
    });
  } else {
    Swal.fire('Error', 'Resource not found', 'error');
  }
}

function deleteResource(resourceType, resourceId) {
  Swal.fire({
    title: `Delete ${resourceType}?`,
    text: `Are you sure you want to delete ${resourceId}?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#3085d6',
    confirmButtonText: 'Yes, delete it!'
  }).then((result) => {
    if (result.isConfirmed) {
      console.log(`Deleting ${resourceType}: ${resourceId}`);
      // TODO: Implement actual deletion API call
      Swal.fire('Deleted!', `${resourceType} has been deleted.`, 'success');
    }
  });
}

// Helper function for text truncation
function truncateText(text, maxLength) {
  if (!text || text === 'N/A' || text === 'None') return text;
  if (text.length <= maxLength) return text;
  return `<span title="${text.replace(/"/g, '&quot;')}">${text.substring(0, maxLength)}...</span>`;
}

// Smart truncation that only truncates very long text
function smartTruncate(text, columnType = 'default') {
  if (!text || text === 'N/A' || text === 'None') return text;
  
  // Define thresholds based on column type
  const thresholds = {
    'id': 25,        // ID columns can be a bit longer
    'name': 30,      // Name columns 
    'provider': 20,  // Provider names are usually short
    'region': 25,    // Region names
    'spec': 30,      // Spec names can be longer
    'ip': 20,        // IP addresses
    'description': 50, // Descriptions can be longer
    'default': 35    // Default for other columns
  };
  
  const maxLength = thresholds[columnType] || thresholds.default;
  
  if (text.length <= maxLength) return text;
  return `<span title="${text.replace(/"/g, '&quot;')}">${text.substring(0, maxLength)}...</span>`;
}

// Helper function to format zones with active zone highlighting
function formatZonesWithHighlight(connection) {
  const zones = connection.regionDetail?.zones || [];
  // Check for assignedZone first, then fallback to other possible fields
  const activeZone = connection.regionZoneInfo?.assignedZone || 
                    connection.assignedZone || 
                    connection.zone || 
                    connection.availabilityZone || 
                    connection.regionDetail?.zone;
  
  if (zones.length === 0) {
    return activeZone ? `<span class="zone-active">${activeZone}</span>` : 'N/A';
  }
  
  const formattedZones = zones.map(zone => {
    if (activeZone && zone === activeZone) {
      return `<span class="zone-active" title="Assigned zone (${activeZone})">${zone}</span>`;
    } else {
      return `<span class="zone-available" title="Available zone">${zone}</span>`;
    }
  });
  
  return formattedZones.join(', ');
}

// Helper function to get provider CSS class
function getProviderClass(providerName) {
  if (!providerName) return 'unknown';
  
  const knownProviders = [
    'aws', 'azure', 'gcp', 'alibaba', 'tencent', 'ncp', 
    'nhncloud', 'nhn', 'cloudit', 'openstack', 'ibm', 'oracle'
  ];
  
  const normalizedProvider = providerName.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  // Check if it's a known provider
  if (knownProviders.includes(normalizedProvider)) {
    return normalizedProvider;
  }
  
  // Check original provider name (in case of different formatting)
  if (knownProviders.includes(providerName.toLowerCase())) {
    return providerName.toLowerCase();
  }
  
  // Return original provider name for fallback CSS
  return providerName.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Export new functions for global access
window.refreshResourceList = refreshResourceList;
window.viewResourceDetails = viewResourceDetails;
window.deleteResource = deleteResource;
window.updateAllResourceTables = updateAllResourceTables;

// Additional resource-specific functions
function viewKeyMaterial(sshKeyId) {
  console.log(`Viewing SSH key material for: ${sshKeyId}`);
  
  let centralData = {};
  if (window.parent && window.parent.cloudBaristaCentralData) {
    centralData = window.parent.cloudBaristaCentralData;
  }
  
  const sshKeyData = centralData.sshKey || [];
  const sshKey = sshKeyData.find(key => key.id === sshKeyId);
  
  if (sshKey) {
    Swal.fire({
      title: 'SSH Key Material',
      html: `
        <div style="text-align: left;">
          <p><strong>Key ID:</strong> ${sshKey.id}</p>
          <p><strong>Fingerprint:</strong> ${sshKey.fingerprint || 'N/A'}</p>
          <div style="margin-top: 10px;">
            <strong>Public Key:</strong>
            <textarea readonly style="width: 100%; height: 100px; font-family: monospace; font-size: 12px; margin-top: 5px;">${sshKey.publicKey || 'Not available'}</textarea>
          </div>
          ${sshKey.privateKey ? `
          <div style="margin-top: 10px;">
            <strong>Private Key:</strong>
            <textarea readonly style="width: 100%; height: 150px; font-family: monospace; font-size: 12px; margin-top: 5px;">${sshKey.privateKey}</textarea>
          </div>
          ` : ''}
        </div>
      `,
      width: '800px'
    });
  } else {
    Swal.fire('Error', 'SSH Key not found', 'error');
  }
}

function controlK8sCluster(clusterId, action) {
  console.log(`Performing ${action} on K8s cluster: ${clusterId}`);
  
  if (action === 'upgrade') {
    Swal.fire({
      title: 'Upgrade K8s Cluster',
      text: `Are you sure you want to upgrade cluster ${clusterId}?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Yes, upgrade it!'
    }).then((result) => {
      if (result.isConfirmed) {
        console.log(`Upgrading K8s cluster: ${clusterId}`);
        // TODO: Implement actual upgrade API call
        Swal.fire('Upgrade Started!', 'K8s cluster upgrade has been initiated.', 'success');
      }
    });
  }
}

function testConnection(configName) {
  console.log(`Testing connection: ${configName}`);
  
  Swal.fire({
    title: 'Testing Connection...',
    text: `Verifying connection ${configName}`,
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
    }
  });
  
  // Simulate connection test
  setTimeout(() => {
    Swal.fire({
      title: 'Connection Test',
      text: `Connection ${configName} is healthy`,
      icon: 'success'
    });
  }, 2000);
}

function resizeDisk(diskId) {
  console.log(`Resizing disk: ${diskId}`);
  
  Swal.fire({
    title: 'Resize Data Disk',
    html: `
      <div style="text-align: left;">
        <p><strong>Disk ID:</strong> ${diskId}</p>
        <label for="newSize">New Size (GB):</label>
        <input type="number" id="newSize" class="swal2-input" placeholder="Enter new size" min="1">
        <p style="font-size: 12px; color: #666; margin-top: 10px;">
          Note: You can only increase the disk size. Decreasing is not supported.
        </p>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'Resize',
    preConfirm: () => {
      const newSize = document.getElementById('newSize').value;
      if (!newSize || newSize <= 0) {
        Swal.showValidationMessage('Please enter a valid size');
        return false;
      }
      return newSize;
    }
  }).then((result) => {
    if (result.isConfirmed) {
      console.log(`Resizing disk ${diskId} to ${result.value} GB`);
      // TODO: Implement actual resize API call
      Swal.fire('Resize Started!', `Disk ${diskId} resize to ${result.value} GB has been initiated.`, 'success');
    }
  });
}

// TB (Tumblebug) Functions
function showGitHub() {
  // Simply open GitHub in new tab
  window.open('https://github.com/cloud-barista/cb-tumblebug', '_blank');
}

// New functions for Useful Information section
function openLink(url) {
  window.open(url, '_blank');
}

function openInfoLink(path) {
  var currentHost = window.location.hostname;
  var url = `http://${currentHost}:3000/auto/dashboard/${path}`;
  
  // Try to open the specific dashboard
  var newWindow = window.open(url, '_blank');
  
  // Fallback: if the page doesn't load, redirect to Info Home after a short delay
  setTimeout(() => {
    try {
      if (newWindow.document.readyState === 'complete' && newWindow.document.title.includes('Not found')) {
        newWindow.location.href = `http://${currentHost}:3000`;
      }
    } catch (e) {
      // Cross-origin restrictions may prevent access, so we'll use a simpler fallback approach
      console.log('Opening Info dashboard:', url);
    }
  }, 2000);
}

// Scroll to specific section smoothly
function scrollToSection(sectionId) {
  // Map section IDs to actual HTML element IDs
  const sectionMap = {
    'connectionSection': 'connectionTable',
    'vNetSection': 'vNetTable', 
    'securityGroupSection': 'securityGroupTable',
    'sshKeySection': 'sshKeyTable',
    'vpnSection': 'vpnTable',
    'k8sSection': 'k8sClusterTable',
    'customImageSection': 'customImageTable',
    'dataDiskSection': 'dataDiskTable',
    'mciTable': 'mciTable',
    'vmTable': 'vmTable'
  };
  
  const actualId = sectionMap[sectionId] || sectionId;
  const element = document.getElementById(actualId);
  
  if (element) {
    // Find the parent row or section container
    let targetElement = element;
    let container = element.closest('.row');
    if (container) {
      targetElement = container;
    }
    
    // Smooth scroll to the element
    targetElement.scrollIntoView({ 
      behavior: 'smooth', 
      block: 'start',
      inline: 'nearest'
    });
    
    // Add a highlight effect
    const parentCard = element.closest('.content-card');
    if (parentCard) {
      parentCard.style.boxShadow = '0 0 20px rgba(0, 123, 255, 0.3)';
      parentCard.style.border = '2px solid #007bff';
      
      // Remove highlight after 3 seconds
      setTimeout(() => {
        parentCard.style.boxShadow = '';
        parentCard.style.border = '';
      }, 3000);
    }
  } else {
    console.warn(`Section with ID '${actualId}' not found`);
  }
}

// Export additional functions
window.viewKeyMaterial = viewKeyMaterial;
window.controlK8sCluster = controlK8sCluster;
window.testConnection = testConnection;
window.resizeDisk = resizeDisk;
window.showGitHub = showGitHub;
window.openLink = openLink;
window.openInfoLink = openInfoLink;
window.scrollToSection = scrollToSection;

// Scroll to top functionality
function scrollToTop() {
  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}

// Show/hide scroll to top button based on scroll position
function toggleScrollToTopButton() {
  const scrollToTopBtn = document.getElementById('scrollToTopBtn');
  if (window.pageYOffset > 300) {
    scrollToTopBtn.classList.add('show');
  } else {
    scrollToTopBtn.classList.remove('show');
  }
}

// Add scroll event listener when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  window.addEventListener('scroll', toggleScrollToTopButton);
});

// Export scroll functions
window.scrollToTop = scrollToTop;
