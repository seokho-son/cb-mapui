/**
 * Task Management Feature Module
 * @module features/tasks
 */
import Swal from 'sweetalert2';
import axios from 'axios';
import { tbApiBase, getConfig } from '../../core/api.js';
import { escapeHtml } from '../../core/utils.js';

const addSpinnerTask = (name) => (window.addSpinnerTask ? window.addSpinnerTask(name) : name);
const removeSpinnerTask = (id) => { if (window.removeSpinnerTask) window.removeSpinnerTask(id); };
const errorAlert = (msg) => (window.errorAlert ? window.errorAlert(msg) : Swal.fire({ icon: 'error', title: msg, showConfirmButton: true }));
const successAlert = (msg) => (window.successAlert ? window.successAlert(msg) : Swal.fire({ icon: 'success', title: msg, showConfirmButton: false, timer: 2500 }));
const getSelectedInfraId = () => (window.getSelectedInfraId ? window.getSelectedInfraId() : (document.getElementById('infraid')?.value || null));

// ==========================================
// Task Management Functions
// ==========================================

// Global variables for task auto-refresh
window.taskAutoRefreshEnabled = false;
window.taskAutoRefreshInterval = null;
window.taskLastData = null; // Store last task data to prevent unnecessary re-renders

// Load task list and update the modal content
async function loadTaskListInModal(namespace, infraid) {
  var config = getConfig();
  var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;

  const url = `${tbApiBase()}/ns/${namespace}/cmd/infra/${infraid}/task`;

  try {
    const res = await axios.get(url, {
      auth: { username: username, password: password }
    });

    const tasks = res.data.tasks || [];
    
    // Check if data has changed (to avoid unnecessary re-render)
    const currentDataStr = JSON.stringify(tasks);
    if (window.taskLastData === currentDataStr) {
      // Only update the last refresh time
      const lastRefreshEl = document.getElementById('taskLastRefreshTime');
      if (lastRefreshEl) {
        lastRefreshEl.textContent = `Last refresh: ${new Date().toLocaleTimeString('en-US', { hour12: false })}`;
      }
      return;
    }
    window.taskLastData = currentDataStr;
    
    // Sort tasks: active tasks first (Handling, Queued), then by startedAt descending
    const sortedTasks = [...tasks].sort((a, b) => {
      const aActive = ['handling', 'queued'].includes((a.status || '').toLowerCase());
      const bActive = ['handling', 'queued'].includes((b.status || '').toLowerCase());
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;
      // Both same priority, sort by startedAt descending (newest first)
      return new Date(b.startedAt || 0) - new Date(a.startedAt || 0);
    });

    let tasksHtml = '';
    if (sortedTasks.length === 0) {
      tasksHtml = '<p style="text-align: center; color: #666;">No command execution history</p>';
    } else {
      tasksHtml = `
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <thead>
            <tr style="background-color: #f2f2f2;">
              <th style="padding: 8px; text-align: left; border-bottom: 2px solid #ddd;">Command</th>
              <th style="padding: 8px; text-align: left; border-bottom: 2px solid #ddd;">Infra / Node</th>
              <th style="padding: 8px; text-align: center; border-bottom: 2px solid #ddd;">Status</th>
              <th style="padding: 8px; text-align: center; border-bottom: 2px solid #ddd;">Started At</th>
              <th style="padding: 8px; text-align: center; border-bottom: 2px solid #ddd;">Duration</th>
              <th style="padding: 8px; text-align: center; border-bottom: 2px solid #ddd;">Action</th>
            </tr>
          </thead>
          <tbody>
      `;
      
      sortedTasks.forEach(task => {
        // Status uses CommandExecutionStatus: Queued, Handling, Completed, Failed, Timeout, Cancelled, Interrupted
        const statusLower = (task.status || '').toLowerCase();
        let statusColor, statusIcon;
        switch (statusLower) {
          case 'handling':
            statusColor = '#28a745'; // Green
            statusIcon = '⏳';
            break;
          case 'queued':
            statusColor = '#6c757d'; // Gray
            statusIcon = '⏸️';
            break;
          case 'completed':
            statusColor = '#17a2b8'; // Cyan
            statusIcon = '✅';
            break;
          case 'cancelled':
            statusColor = '#ffc107'; // Yellow
            statusIcon = '⚠️';
            break;
          case 'interrupted':
            statusColor = '#fd7e14'; // Orange
            statusIcon = '🔄';
            break;
          case 'failed':
            statusColor = '#dc3545'; // Red
            statusIcon = '❌';
            break;
          case 'timeout':
            statusColor = '#dc3545'; // Red
            statusIcon = '⏰';
            break;
          default:
            statusColor = '#6c757d'; // Gray
            statusIcon = '❓';
            break;
        }
        
        // Format command - show truncated command with tooltip
        const cmdArray = task.command || [];
        const cmdText = Array.isArray(cmdArray) ? cmdArray.join(' ') : String(cmdArray);
        const cmdTruncated = cmdText.length > 40 ? cmdText.substring(0, 40) + '...' : cmdText;
        const cmdEscaped = cmdText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        // Also escape cmdTruncated for HTML content
        const cmdTruncatedEscaped = cmdTruncated.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        
        // Format target - show Node info
        let targetText = task.nodeId || 'N/A';
        if (task.infraId && task.nodeId) {
          targetText = `${task.infraId} / ${task.nodeId}`;
        } else if (task.infraId) {
          targetText = task.infraId;
        }
        // Escape for HTML content
        const targetTextEscaped = targetText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        
        // Started At: format the start time for display
        let startedAtText = '-';
        let startedAtFull = '';
        if (task.startedAt) {
          const startDate = new Date(task.startedAt);
          if (!isNaN(startDate.getTime())) {
            // Short format for table (HH:MM:SS) - use en-US locale for consistency
            startedAtText = startDate.toLocaleTimeString('en-US', { hour12: false });
            // Full format for tooltip
            startedAtFull = startDate.toLocaleString('en-US');
          }
        }
        
        // Duration: show elapsed time or calculate from start time for running tasks
        let durationText = '-';
        let durationTooltip = '';
        if (task.elapsedSeconds && task.elapsedSeconds > 0) {
          // Use provided elapsed time (for completed tasks)
          const totalSecs = task.elapsedSeconds;
          const mins = Math.floor(totalSecs / 60);
          const secs = totalSecs % 60;
          durationText = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
          durationTooltip = `Elapsed: ${totalSecs} seconds`;
        } else if (task.startedAt && (statusLower === 'handling' || statusLower === 'queued')) {
          // Calculate elapsed time for running tasks
          const startDate = new Date(task.startedAt);
          if (!isNaN(startDate.getTime())) {
            const now = new Date();
            const elapsedMs = now - startDate;
            const totalSecs = Math.floor(elapsedMs / 1000);
            const mins = Math.floor(totalSecs / 60);
            const secs = totalSecs % 60;
            durationText = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
            durationTooltip = `Running since ${startedAtFull}`;
          }
        }
        
        // End time for tooltip
        const endTime = task.completedAt ? new Date(task.completedAt).toLocaleString('en-US') : '';
        if (endTime) {
          durationTooltip = `Started: ${startedAtFull}\nEnded: ${endTime}`;
        }
        
        // Can cancel if task is actively running (Handling or Queued)
        const canCancel = statusLower === 'handling' || statusLower === 'queued';
        
        // Escape taskId, nsId, infraId for safe use in data attributes
        const taskIdEscaped = (task.taskId || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
        const nsIdEscaped = (task.nsId || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
        const infraIdEscaped = (task.infraId || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
        const statusEscaped = (task.status || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        
        tasksHtml += `
          <tr style="border-bottom: 1px solid #eee; ${canCancel ? 'background-color: #f8fff8;' : ''}">
            <td style="padding: 8px; max-width: 200px;" title="${cmdEscaped}">
              <code style="font-size: 12px; background: #f4f4f4; padding: 2px 5px; border-radius: 3px;">${cmdTruncatedEscaped}</code>
            </td>
            <td style="padding: 8px; font-size: 12px;">${targetTextEscaped}</td>
            <td style="padding: 8px; text-align: center;">
              <span title="${statusEscaped}" style="font-size: 16px;">${statusIcon}</span>
              <div style="font-size: 10px; color: ${statusColor}; font-weight: bold;">${statusEscaped}</div>
            </td>
            <td style="padding: 8px; text-align: center;" title="${startedAtFull}">
              <span style="font-size: 11px; color: #666;">${startedAtText}</span>
            </td>
            <td style="padding: 8px; text-align: center;" title="${durationTooltip}">
              <span style="font-size: 12px;">${durationText}</span>
            </td>
            <td style="padding: 8px; text-align: center;">
              ${canCancel ? 
                `<button class="task-cancel-btn" data-task-id="${taskIdEscaped}" data-ns-id="${nsIdEscaped}" data-infra-id="${infraIdEscaped}"
                  style="background-color: #dc3545; color: white; border: none; padding: 4px 12px; border-radius: 3px; cursor: pointer; font-size: 12px;">
                  Cancel
                </button>` : 
                '<span style="color: #ccc; font-size: 11px;">-</span>'
              }
            </td>
          </tr>
        `;
      });
      
      tasksHtml += '</tbody></table>';
    }

    // Update the container
    const container = document.getElementById('taskListContainer');
    if (container) {
      container.innerHTML = tasksHtml;
      
      // Attach event listeners to cancel buttons (safer than inline onclick with interpolated values)
      container.querySelectorAll('.task-cancel-btn').forEach(btn => {
        btn.addEventListener('click', function() {
          const taskId = this.dataset.taskId;
          const nsId = this.dataset.nsId;
          const infraId = this.dataset.infraId;
          cancelTaskFromModal(taskId, nsId, infraId);
        });
      });
    }

    // Update active task count in title
    const activeTasks = sortedTasks.filter(t => ['handling', 'queued'].includes((t.status || '').toLowerCase()));
    const activeCountEl = document.getElementById('taskActiveCount');
    if (activeCountEl) {
      activeCountEl.innerHTML = activeTasks.length > 0 
        ? `<span style="font-size: 14px; color: #28a745;">(${activeTasks.length} active)</span>`
        : '';
    }

    // Update last refresh time
    const lastRefreshEl = document.getElementById('taskLastRefreshTime');
    if (lastRefreshEl) {
      lastRefreshEl.textContent = `Last refresh: ${new Date().toLocaleTimeString('en-US', { hour12: false })}`;
    }

  } catch (error) {
    console.error("Failed to fetch tasks:", error);
    const container = document.getElementById('taskListContainer');
    if (container) {
      container.innerHTML = `<p style="text-align: center; color: #dc3545;">Failed to load tasks: ${error.message}</p>`;
    }
  }
}

// Show Task Management Modal
async function showTaskManagementModal() {
  var config = getConfig();
  var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = config.namespace || window.configNamespace || '';
  var infraid = getSelectedInfraId();

  if (!namespace) {
    Swal.fire({
      icon: 'info',
      title: 'Select Namespace',
      text: 'Please select a namespace first.',
      confirmButtonColor: '#3085d6'
    });
    return;
  }

  // Fetch Infra list for selector
  let infraListOptions = [];
  try {
    const infraListUrl = `${tbApiBase()}/ns/${namespace}/infra?option=id`;
    const infraRes = await axios.get(infraListUrl, {
      auth: { username: username, password: password }
    });
    if (infraRes.data.output && infraRes.data.output.length > 0) {
      infraListOptions = infraRes.data.output;
    }
  } catch (err) {
    console.error("Failed to fetch Infra list:", err);
  }

  if (infraListOptions.length === 0) {
    Swal.fire({
      icon: 'info',
      title: 'No Infra Available',
      text: 'No Infra available in this namespace. Please create an Infra first.',
      confirmButtonColor: '#3085d6'
    });
    return;
  }

  // If no Infra selected, use the first one from the list
  if (!infraid) {
    infraid = infraListOptions[0];
  }

  // Build Infra selector options HTML
  const infraOptionsHtml = infraListOptions.map(m => 
    `<option value="${m}" ${m === infraid ? 'selected' : ''}>${m}</option>`
  ).join('');

  Swal.fire({
    title: `<span>📋 Command Execution History</span> <span id="taskActiveCount"></span>`,
    html: `
      <div style="text-align: left;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <label style="font-weight: bold; margin: 0;">Infra:</label>
            <select id="taskInfraSelector" style="padding: 5px; min-width: 200px;">
              ${infraOptionsHtml}
            </select>
          </div>
          <div>
            <button id="taskRefreshNowBtn" class="btn btn-info btn-sm" style="margin-right: 5px;">🔄 Refresh Now</button>
            <button id="taskToggleAutoRefreshBtn" class="btn btn-success btn-sm">⏸️ Pause Auto-refresh</button>
          </div>
        </div>
        <div style="font-size: 11px; color: #6c757d; margin-bottom: 8px;">
          <span id="taskAutoRefreshStatus">🟢 Auto-refreshing every 3 seconds</span> | 
          <span id="taskLastRefreshTime">Last refresh: -</span>
        </div>
        <div id="taskListContainer" style="max-height: 400px; overflow-y: auto;">
          <p class="text-muted" style="text-align: center;">Loading tasks...</p>
        </div>
      </div>
    `,
    width: '1000px',
    showCancelButton: false,
    confirmButtonText: '❌ Close',
    didOpen: async () => {
      // Store context for access from modal functions
      window.currentTaskNamespace = namespace;
      window.currentTaskInfraId = infraid;
      
      // Auto-refresh setup
      window.taskAutoRefreshEnabled = true;
      window.taskAutoRefreshInterval = null;
      window.taskLastData = null; // Reset cached data
      
      // Infra selector change handler
      const infraSelector = document.getElementById('taskInfraSelector');
      if (infraSelector) {
        infraSelector.addEventListener('change', function() {
          window.currentTaskInfraId = this.value;
          window.taskLastData = null; // Force refresh on Infra change
          loadTaskListInModal(window.currentTaskNamespace, window.currentTaskInfraId);
        });
      }
      
      // Setup refresh now button event listener
      const refreshNowBtn = document.getElementById('taskRefreshNowBtn');
      if (refreshNowBtn) {
        refreshNowBtn.addEventListener('click', function() {
          window.taskLastData = null; // Force refresh
          loadTaskListInModal(window.currentTaskNamespace, window.currentTaskInfraId);
        });
      }
      
      // Setup toggle button event listener
      const toggleBtn = document.getElementById('taskToggleAutoRefreshBtn');
      if (toggleBtn) {
        toggleBtn.addEventListener('click', function() {
          window.taskAutoRefreshEnabled = !window.taskAutoRefreshEnabled;
          
          const status = document.getElementById('taskAutoRefreshStatus');
          
          if (window.taskAutoRefreshEnabled) {
            this.innerHTML = '⏸️ Pause Auto-refresh';
            this.className = 'btn btn-success btn-sm';
            if (status) status.innerHTML = '🟢 Auto-refreshing every 3 seconds';
          } else {
            this.innerHTML = '▶️ Resume Auto-refresh';
            this.className = 'btn btn-warning btn-sm';
            if (status) status.innerHTML = '🔴 Auto-refresh paused';
          }
        });
      }
      
      // Initial load with slight delay to ensure DOM is ready
      setTimeout(() => {
        loadTaskListInModal(window.currentTaskNamespace, window.currentTaskInfraId);
      }, 100);
      
      // Clear any existing interval before creating a new one (prevent memory leaks)
      if (window.taskAutoRefreshInterval) {
        clearInterval(window.taskAutoRefreshInterval);
      }
      
      // Start auto-refresh timer (3 seconds for tasks - faster than snapshots)
      window.taskAutoRefreshInterval = setInterval(() => {
        if (window.taskAutoRefreshEnabled) {
          loadTaskListInModal(window.currentTaskNamespace, window.currentTaskInfraId);
        }
      }, 3000); // 3 seconds
    },
    willClose: () => {
      // Cleanup: clear auto-refresh timer when modal closes
      if (window.taskAutoRefreshInterval) {
        clearInterval(window.taskAutoRefreshInterval);
        window.taskAutoRefreshInterval = null;
      }
      window.taskAutoRefreshEnabled = false;
      window.taskLastData = null;
    }
  });
}
window.showTaskManagementModal = showTaskManagementModal;

// Cancel a specific task from the modal
async function cancelTaskFromModal(taskId, nsId, infraId) {
  var config = getConfig();
  var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;

  // nsId and infraId are required (passed from task data)
  if (!nsId || !infraId || nsId === 'undefined' || infraId === 'undefined') {
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: 'Missing namespace or Infra information for this task.',
      confirmButtonColor: '#3085d6'
    });
    return;
  }

  const url = `${tbApiBase()}/ns/${nsId}/cmd/infra/${infraId}/task/${taskId}/cancel`;

  const result = await Swal.fire({
    title: 'Cancel Task?',
    text: `Are you sure you want to cancel task "${taskId.substring(0, 20)}..."?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc3545',
    cancelButtonColor: '#6c757d',
    confirmButtonText: 'Yes, cancel it!',
    cancelButtonText: 'No'
  });

  if (!result.isConfirmed) return;

  try {
    await axios.post(url, {}, {
      auth: { username: username, password: password }
    });

    // Show brief success toast
    Swal.fire({
      icon: 'success',
      title: 'Task Cancelled',
      text: 'The task has been cancelled successfully.',
      timer: 1500,
      showConfirmButton: false,
      toast: true,
      position: 'top-end'
    });
    
    // Force refresh the task list immediately
    window.taskLastData = null;
    if (window.currentTaskNamespace && window.currentTaskInfraId) {
      loadTaskListInModal(window.currentTaskNamespace, window.currentTaskInfraId);
    }

  } catch (error) {
    console.error("Failed to cancel task:", error);
    Swal.fire({
      icon: 'error',
      title: 'Failed to Cancel',
      text: error.response?.data?.message || error.message,
      toast: true,
      position: 'top-end',
      timer: 3000,
      showConfirmButton: false
    });
  }
}
window.cancelTaskFromModal = cancelTaskFromModal;


window.loadTaskListInModal = loadTaskListInModal;
