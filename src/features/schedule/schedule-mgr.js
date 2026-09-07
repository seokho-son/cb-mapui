/**
 * Schedule Resource Registration & Management Module
 * @module features/schedule
 */
import Swal from 'sweetalert2';
import axios from 'axios';
import { tbApiBase, getConfig } from '../../core/api.js';
import { escapeHtml } from '../../core/utils.js';

const addSpinnerTask = (name) => (window.addSpinnerTask ? window.addSpinnerTask(name) : name);
const removeSpinnerTask = (id) => { if (window.removeSpinnerTask) window.removeSpinnerTask(id); };
const displayJsonData = (...args) => window.displayJsonData?.(...args);
const typeInfo = window.typeInfo || 'info';

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

  // Generate random Infra name prefix (reg-xxxx)
  const randomSuffix = Math.random().toString(36).substring(2, 6).toLowerCase();
  const defaultInfraPrefix = `reg-${randomSuffix}`;

  // Load namespace and connection lists
  let namespaces = [];
  let connections = [];
  
  try {
    const [nsResponse, connResponse] = await Promise.all([
      axios.get(`${tbApiBase()}/ns?option=id`, {
        auth: { username, password }
      }),
      axios.get(`${tbApiBase()}/connConfig`, {
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

  // Build provider/region/zone hierarchy
  const providerMap = {};
  connections.forEach(conn => {
    const provider = conn.providerName;
    const region = conn.regionZoneInfo?.assignedRegion || '';
    const zone = conn.regionZoneInfo?.assignedZone || '';
    const display = conn.regionDetail?.location?.display || '';

    if (!providerMap[provider]) {
      providerMap[provider] = { regions: {} };
    }
    if (region && !providerMap[provider].regions[region]) {
      providerMap[provider].regions[region] = { zones: [], display };
    } else if (region && display && !providerMap[provider].regions[region].display) {
      providerMap[provider].regions[region].display = display;
    }
    if (zone && !providerMap[provider].regions[region].zones.includes(zone)) {
      providerMap[provider].regions[region].zones.push(zone);
    }
  });

  // Build provider options
  const providerOptions = '<option value="">All Providers</option>' +
    Object.keys(providerMap).sort().map(provider =>
      `<option value="${provider}">${provider}</option>`
    ).join('');

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
        .schedule-option-dropdown { position: relative; width: 100%; }
        .schedule-option-btn { width: 100%; height: 34px; font-size: 14.5px; padding: 4px 10px; padding-right: 36px; text-align: left; background-color: #fff; border: 1px solid #ced4da; border-radius: 0.25rem; cursor: pointer; color: #495057; position: relative; }
        .schedule-option-btn::after { content: ""; position: absolute; right: 4px; top: 50%; width: 0.45em; height: 0.45em; border-right: 0.16em solid #495057; border-bottom: 0.16em solid #495057; transform: translateY(-65%) rotate(45deg); pointer-events: none; color: #495057; opacity: 0.85; }
        .schedule-option-btn:hover { background-color: #fff; border-color: #ced4da; }
        .schedule-option-menu { display: none; position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #ced4da; border-radius: 0.25rem; margin-top: 2px; max-height: 200px; overflow-y: auto; z-index: 1000; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .schedule-option-menu.show { display: block; }
        .schedule-option-item { padding: 6px 10px; cursor: pointer; font-size: 13px; }
        .schedule-option-item:hover { background-color: #f8f9fa; }
        .schedule-option-item .form-check { margin-bottom: 0; }
        .schedule-option-item .form-check-label { cursor: pointer; width: 100%; }
        .schedule-compact-form hr { margin: 12px 0; border-top: 1px solid #dee2e6; }
        .schedule-compact-form .btn { margin: 8px 0; }
        .schedule-compact-form small { font-size: 11px; color: #6c757d; margin-top: 2px; display: block; }
        .job-card { border: 1px solid #dee2e6; border-radius: 6px; padding: 12px; margin-bottom: 10px; background: #f8f9fa; }
        .job-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .job-card-title { font-weight: 600; font-size: 13px; color: #333; }
        .job-card-body { font-size: 12px; }
        .job-card-footer { margin-top: 8px; display: flex; gap: 5px; flex-wrap: wrap; }
        .job-card-footer .btn { margin: 0; font-size: 11px; padding: 2px 8px; }
        .filter-mode-tabs { display: flex; gap: 5px; margin-bottom: 10px; }
        .filter-mode-tab { flex: 1; padding: 6px; border: 1px solid #dee2e6; border-radius: 4px; text-align: center; cursor: pointer; font-size: 12px; background: #fff; }
        .filter-mode-tab.active { background: #007bff; color: white; border-color: #007bff; }
        .filter-mode-content { display: none; }
        .filter-mode-content.active { display: block; }
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
        </div>

        <div class="filter-mode-tabs">
          <div class="filter-mode-tab active" data-mode="hierarchy">
            🌐 Provider/Region/Zone (Recommended)
          </div>
          <div class="filter-mode-tab" data-mode="connection">
            🔗 Connection Name (Legacy)
          </div>
        </div>

        <div id="filter-hierarchy" class="filter-mode-content active">
          <div class="form-row">
            <div class="form-col">
              <label>Provider</label>
              <select id="sched-provider" class="form-control form-control-sm">
                ${providerOptions}
              </select>
              <small>Leave empty for all providers</small>
            </div>
          </div>
          <div class="form-row">
            <div class="form-col">
              <label>Region</label>
              <select id="sched-region" class="form-control form-control-sm" disabled>
                <option value="">All Regions</option>
              </select>
              <small>Select provider first</small>
            </div>
            <div class="form-col">
              <label>Zone</label>
              <select id="sched-zone" class="form-control form-control-sm" disabled>
                <option value="">All Zones</option>
              </select>
              <small>Select region first</small>
            </div>
          </div>
        </div>

        <div id="filter-connection" class="filter-mode-content">
          <div class="form-row">
            <div class="form-col">
              <label>Connection Name</label>
              <select id="sched-connection" class="form-control form-control-sm">
                ${connOptions}
              </select>
              <small>Leave empty for all connections</small>
            </div>
          </div>
        </div>
        <div class="form-row">
          <div class="form-col">
            <label>Interval (seconds) *</label>
            <input type="number" id="sched-interval" class="form-control form-control-sm" value="3600" min="10">
            <small>Min: 10s, Recommended: 1800s+</small>
          </div>
          <div class="form-col">
            <label>Infra Name Prefix</label>
            <input type="text" id="sched-infraPrefix" class="form-control form-control-sm" value="${defaultInfraPrefix}" placeholder="e.g., reg-a3f9">
            <small>Auto-generated: reg-xxxx</small>
          </div>
        </div>
        <div class="form-row">
          <div class="form-col">
            <label>Registration Option</label>
            <div class="schedule-option-dropdown">
              <button type="button" class="schedule-option-btn" id="sched-option-btn">
                <span id="sched-option-text">All Resources</span>
              </button>
              <div class="schedule-option-menu" id="sched-option-menu">
                <div class="schedule-option-item">
                  <div class="form-check">
                    <input class="form-check-input" type="checkbox" id="sched-option-all" value="" checked>
                    <label class="form-check-label" for="sched-option-all">All Resources</label>
                  </div>
                </div>
                <div class="schedule-option-item">
                  <div class="form-check">
                    <input class="form-check-input" type="checkbox" id="sched-option-vnet" value="vNet">
                    <label class="form-check-label" for="sched-option-vnet">vNet</label>
                  </div>
                </div>
                <div class="schedule-option-item">
                  <div class="form-check">
                    <input class="form-check-input" type="checkbox" id="sched-option-sg" value="securityGroup">
                    <label class="form-check-label" for="sched-option-sg">securityGroup</label>
                  </div>
                </div>
                <div class="schedule-option-item">
                  <div class="form-check">
                    <input class="form-check-input" type="checkbox" id="sched-option-sshkey" value="sshKey">
                    <label class="form-check-label" for="sched-option-sshkey">sshKey</label>
                  </div>
                </div>
                <div class="schedule-option-item">
                  <div class="form-check">
                    <input class="form-check-input" type="checkbox" id="sched-option-node" value="node">
                    <label class="form-check-label" for="sched-option-node">node</label>
                  </div>
                </div>
                <div class="schedule-option-item">
                  <div class="form-check">
                    <input class="form-check-input" type="checkbox" id="sched-option-customimage" value="customImage">
                    <label class="form-check-label" for="sched-option-customimage">customImage</label>
                  </div>
                </div>
              </div>
            </div>
            <small>Default : All Resources</small>
          </div>
          <div class="form-col">
            <label>Infra Flag</label>
            <select id="sched-infraFlag" class="form-control form-control-sm">
              <option value="y">Single Infra</option>
              <option value="n">Separate per Node</option>
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
      // Store providerMap for later use
      window.scheduleProviderMap = providerMap;

      // Enable auto-refresh
      window.scheduleJobAutoRefreshEnabled = true;

      // Setup filter mode tabs
      const filterModeTabs = document.querySelectorAll('.filter-mode-tab');
      const filterModeContents = document.querySelectorAll('.filter-mode-content');

      filterModeTabs.forEach(tab => {
        tab.addEventListener('click', function() {
          const mode = this.getAttribute('data-mode');

          // Update tabs
          filterModeTabs.forEach(t => t.classList.remove('active'));
          this.classList.add('active');

          // Update content
          filterModeContents.forEach(content => {
            content.classList.remove('active');
          });
          document.getElementById(`filter-${mode}`).classList.add('active');
        });
      });

      // Setup provider/region/zone cascading selects
      const providerSelect = document.getElementById('sched-provider');
      const regionSelect = document.getElementById('sched-region');
      const zoneSelect = document.getElementById('sched-zone');

      if (providerSelect && regionSelect && zoneSelect) {
        providerSelect.addEventListener('change', function() {
          const selectedProvider = this.value;

          // Reset and disable region/zone
          regionSelect.innerHTML = '<option value="">All Regions</option>';
          regionSelect.disabled = !selectedProvider;
          zoneSelect.innerHTML = '<option value="">All Zones</option>';
          zoneSelect.disabled = true;

          if (selectedProvider && providerMap[selectedProvider]) {
            const regions = Object.keys(providerMap[selectedProvider].regions).sort();
            regions.forEach(region => {
              const option = document.createElement('option');
              option.value = region;
              const display = providerMap[selectedProvider].regions[region].display;
              option.textContent = display ? `${region} (${display})` : region;
              regionSelect.appendChild(option);
            });
          }
        });

        regionSelect.addEventListener('change', function() {
          const selectedProvider = providerSelect.value;
          const selectedRegion = this.value;

          // Reset and disable zone
          zoneSelect.innerHTML = '<option value="">All Zones</option>';
          zoneSelect.disabled = !selectedRegion;

          if (selectedProvider && selectedRegion &&
              providerMap[selectedProvider]?.regions[selectedRegion]) {
            const zones = providerMap[selectedProvider].regions[selectedRegion].zones.sort();
            zones.forEach(zone => {
              const option = document.createElement('option');
              option.value = zone;
              option.textContent = zone;
              zoneSelect.appendChild(option);
            });
          }
        });
      }

      // Setup dropdown toggle
      const dropdownBtn = document.getElementById('sched-option-btn');
      const dropdownMenu = document.getElementById('sched-option-menu');
      const dropdownText = document.getElementById('sched-option-text');
      
      if (dropdownBtn && dropdownMenu) {
        dropdownBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          dropdownMenu.classList.toggle('show');
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', function(e) {
          if (!dropdownMenu.contains(e.target) && e.target !== dropdownBtn) {
            dropdownMenu.classList.remove('show');
          }
        });
      }
      
      // Function to update button text based on selections
      const updateDropdownText = () => {
        const allCheckbox = document.getElementById('sched-option-all');
        if (allCheckbox && allCheckbox.checked) {
          dropdownText.textContent = 'All Resources';
          return;
        }
        
        const selected = [];
        const checkboxes = [
          { id: 'sched-option-vnet', label: 'vNet' },
          { id: 'sched-option-sg', label: 'securityGroup' },
          { id: 'sched-option-sshkey', label: 'sshKey' },
          { id: 'sched-option-node', label: 'node' },
          { id: 'sched-option-customimage', label: 'customImage' }
        ];
        
        checkboxes.forEach(cb => {
          const checkbox = document.getElementById(cb.id);
          if (checkbox && checkbox.checked) {
            selected.push(cb.label);
          }
        });
        
        if (selected.length === 0) {
          dropdownText.textContent = 'Select options...';
        } else if (selected.length <= 2) {
          dropdownText.textContent = selected.join(', ');
        } else {
          dropdownText.textContent = `${selected.length} options selected`;
        }
      };
      
      // Setup checkbox behavior for Registration Option
      const allCheckbox = document.getElementById('sched-option-all');
      const resourceCheckboxes = [
        'sched-option-vnet',
        'sched-option-sg',
        'sched-option-sshkey',
        'sched-option-node',
        'sched-option-customimage'
      ];
      
      if (allCheckbox) {
        allCheckbox.addEventListener('change', function() {
          if (this.checked) {
            resourceCheckboxes.forEach(id => {
              const cb = document.getElementById(id);
              if (cb) cb.checked = false;
            });
          }
          updateDropdownText();
        });
      }
      
      resourceCheckboxes.forEach(id => {
        const cb = document.getElementById(id);
        if (cb) {
          cb.addEventListener('change', function() {
            if (this.checked && allCheckbox) {
              allCheckbox.checked = false;
            }
            updateDropdownText();
          });
        }
      });
      
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
      `${tbApiBase()}/registerCspResources/schedule`,
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
              <strong>NS:</strong> ${job.nsId} |
              ${job.provider || job.region || job.zone ?
                `<strong>Filter:</strong> ${job.provider || 'All'}${job.region ? `/${job.region}` : ''}${job.zone ? `/${job.zone}` : ''} | ` :
                `<strong>Conn:</strong> ${job.connectionName || 'All'} | `
              }
              <strong>Interval:</strong> ${job.intervalSeconds}s (${Math.round(job.intervalSeconds/60)}m) |
              <strong>Infra Prefix:</strong> ${job.infraNamePrefix || '-'} |
              <strong>Stats:</strong> Exec: ${job.executionCount}, Success: <span class="text-success">${job.successCount}</span>, Fail: <span class="text-danger">${job.failureCount}</span> (Consecutive: ${job.consecutiveFailures}) |
              <strong>Next:</strong> ${new Date(job.nextExecutionAt).toLocaleString()}${job.lastExecutionAt ? ` | <strong>Last:</strong> ${new Date(job.lastExecutionAt).toLocaleString()}` : ''}
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
  const infraNamePrefix = document.getElementById('sched-infraPrefix').value;

  // Determine active filter mode
  const activeFilterMode = document.querySelector('.filter-mode-tab.active')?.getAttribute('data-mode') || 'hierarchy';

  // Get filter values based on mode
  let connectionName = '';
  let provider = '';
  let region = '';
  let zone = '';

  if (activeFilterMode === 'connection') {
    connectionName = document.getElementById('sched-connection')?.value || '';
  } else {
    // hierarchy mode
    provider = document.getElementById('sched-provider')?.value || '';
    region = document.getElementById('sched-region')?.value || '';
    zone = document.getElementById('sched-zone')?.value || '';
  }

  // Get selected options from checkboxes
  const allCheckbox = document.getElementById('sched-option-all');
  let option = '';
  if (allCheckbox && allCheckbox.checked) {
    option = ''; // All Resources (empty string)
  } else {
    const selectedOptions = [];
    const optionCheckboxes = [
      { id: 'sched-option-vnet', value: 'vNet' },
      { id: 'sched-option-sg', value: 'securityGroup' },
      { id: 'sched-option-sshkey', value: 'sshKey' },
      { id: 'sched-option-node', value: 'node' },
      { id: 'sched-option-customimage', value: 'customImage' }
    ];
    optionCheckboxes.forEach(opt => {
      const checkbox = document.getElementById(opt.id);
      if (checkbox && checkbox.checked) {
        selectedOptions.push(opt.value);
      }
    });
    option = selectedOptions.join(',');
  }

  const infraFlag = document.getElementById('sched-infraFlag').value;

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
      infraNamePrefix,
      option,
      infraFlag
    };

    // Add filter fields based on mode
    if (activeFilterMode === 'connection') {
      if (connectionName) requestBody.connectionName = connectionName;
    } else {
      if (provider) requestBody.provider = provider;
      if (region) requestBody.region = region;
      if (zone) requestBody.zone = zone;
    }
    
    const response = await axios.post(
      `${tbApiBase()}/registerCspResources/schedule`,
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
      `${tbApiBase()}/registerCspResources/schedule/${jobId}`,
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
          ${job.provider || job.region || job.zone ?
            `<tr><th style="background-color: #f8f9fa;">Target Filter</th><td>
              <strong>Provider:</strong> ${job.provider || 'All'}<br>
              <strong>Region:</strong> ${job.region || 'All'}<br>
              <strong>Zone:</strong> ${job.zone || 'All'}
            </td></tr>` :
            `<tr><th style="background-color: #f8f9fa;">Connection</th><td>${job.connectionName || '<span class="badge badge-secondary">All Connections</span>'}</td></tr>`
          }
          <tr><th style="background-color: #f8f9fa;">Infra Prefix</th><td>${job.infraNamePrefix || '-'}</td></tr>
          <tr><th style="background-color: #f8f9fa;">Option</th><td>${job.option || 'All Resources'}</td></tr>
          <tr><th style="background-color: #f8f9fa;">Infra Flag</th><td>${job.infraFlag === 'y' ? 'Single Infra' : 'Separate per Node'}</td></tr>
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
      `${tbApiBase()}/registerCspResources/schedule/${jobId}/pause`,
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
      `${tbApiBase()}/registerCspResources/schedule/${jobId}/resume`,
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
      `${tbApiBase()}/registerCspResources/schedule/${jobId}`,
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
