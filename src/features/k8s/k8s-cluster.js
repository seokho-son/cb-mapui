/**
 * Kubernetes Cluster & Workload Feature Module
 * @module features/k8s
 */
import Swal from 'sweetalert2';
import axios from 'axios';
import { tbApiBase, getConfig } from '../../core/api.js';
import { generateRandomString, escapeHtml } from '../../core/utils.js';

const addSpinnerTask = (name) => (window.addSpinnerTask ? window.addSpinnerTask(name) : name);
const removeSpinnerTask = (id) => { if (window.removeSpinnerTask) window.removeSpinnerTask(id); };
const errorAlert = (msg) => (window.errorAlert ? window.errorAlert(msg) : Swal.fire({ icon: 'error', title: msg, showConfirmButton: true }));
const successAlert = (msg) => (window.successAlert ? window.successAlert(msg) : Swal.fire({ icon: 'success', title: msg, showConfirmButton: false, timer: 2500 }));
const getSelectedProviders = () => (window.getSelectedProviders ? window.getSelectedProviders() : []);
const updateProviderDropdownText = () => { if (window.updateProviderDropdownText) window.updateProviderDropdownText(); };

const makeArrayProxy = (getArr) => new Proxy([], {
  get: (target, prop) => {
    const arr = getArr() || [];
    const val = arr[prop];
    return typeof val === 'function' ? val.bind(arr) : val;
  },
  set: (target, prop, value) => {
    const arr = getArr();
    if (arr) arr[prop] = value;
    return true;
  },
  has: (target, prop) => prop in (getArr() || []),
  ownKeys: () => Reflect.ownKeys(getArr() || []),
  getOwnPropertyDescriptor: (target, prop) => {
    const arr = getArr() || [];
    return Object.getOwnPropertyDescriptor(arr, prop);
  }
});

const nodeGroupRequestFromSpecList = makeArrayProxy(() => window.nodeGroupRequestFromSpecList);
const recommendedSpecList = makeArrayProxy(() => window.recommendedSpecList);

// Function to check if K8s node image designation is needed
async function checkK8sNodeImageDesignation(providerName, hostname, port, username, password) {
  try {
    const url = `${tbApiBase()}/checkK8sNodeImageDesignation?providerName=${providerName}`;
    
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

// K8s Cluster creation function (supports single and multi-cluster creation)
function createK8sCluster() {
  if (nodeGroupRequestFromSpecList.length < 1) {
    errorAlert("Please configure at least one NodeGroup to create K8s Cluster(s)");
    return;
  }

  const isMultiCluster = nodeGroupRequestFromSpecList.length > 1;
  const nodeGroup = nodeGroupRequestFromSpecList[0];
  const spec = recommendedSpecList[0];
  
  // Generate random names for K8s resources
  const k8sClusterRandomName = "k8s-" + generateRandomString();
  const k8sNodeGroupRandomName = "ng-" + generateRandomString();
  
  const cfg = getConfig();
  const hostname = cfg.hostname || window.configHostname;
  const port = cfg.port || window.configPort;
  const username = cfg.username || window.configUsername;
  const password = cfg.password || window.configPassword;
  const namespace = window.configNamespace || cfg.namespace || '';

  // For multi-cluster, use namePrefix approach (simplified dialog)
  if (isMultiCluster) {
    // Build cluster configuration summary
    const clusterSummary = nodeGroupRequestFromSpecList.map((sg, idx) => {
      const sp = recommendedSpecList[idx];
      return `<tr>
        <td>${idx + 1}</td>
        <td>${sp?.providerName || 'Unknown'}</td>
        <td>${sp?.regionName || 'Unknown'}</td>
        <td style="font-size: 0.8em;">${sp?.cspSpecName || 'Unknown'}</td>
      </tr>`;
    }).join('');

    Swal.fire({
      title: `Create ${nodeGroupRequestFromSpecList.length} K8s Clusters`,
      html: `
        <div style="text-align: left; padding: 15px;">
          <div style="margin-bottom: 15px;">
            <label style="font-weight: bold;">Cluster Name Prefix:</label><br>
            <input type="text" id="k8sNamePrefix" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" 
                   value="${k8sClusterRandomName}" placeholder="Enter name prefix">
            <div style="font-size: 0.8em; color: #666; margin-top: 5px;">
              Clusters will be named: {prefix}-{csp}-{number} (e.g., ${k8sClusterRandomName}-aws-1)
            </div>
          </div>
          <div style="background: #f8f9fa; padding: 10px; border-radius: 5px; margin-bottom: 15px; max-height: 200px; overflow-y: auto;">
            <strong>Clusters to create (${nodeGroupRequestFromSpecList.length}):</strong>
            <table style="width: 100%; font-size: 0.85em; margin-top: 8px;">
              <tr style="background: #e9ecef;"><th>#</th><th>Provider</th><th>Region</th><th>Spec</th></tr>
              ${clusterSummary}
            </table>
          </div>
          <div style="font-size: 0.9em; color: #666;">
            Note: All clusters will be created in parallel. K8s versions will use defaults for each provider.
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: `Create ${nodeGroupRequestFromSpecList.length} Clusters`,
      cancelButtonText: "Cancel",
      preConfirm: () => {
        const namePrefix = document.getElementById('k8sNamePrefix').value.trim();
        if (!namePrefix) {
          Swal.showValidationMessage('Please enter name prefix');
          return false;
        }
        return { namePrefix };
      }
    }).then((result) => {
      if (result.isConfirmed) {
        const { namePrefix } = result.value;
        
        // Build multi-cluster request
        const clusters = nodeGroupRequestFromSpecList.map((sg, idx) => {
          const clusterReq = {
            imageId: sg.imageId || "default",
            specId: sg.specId
          };
          if (sg.rootDiskType) clusterReq.rootDiskType = sg.rootDiskType;
          if (sg.rootDiskSize) clusterReq.rootDiskSize = sg.rootDiskSize;
          if (sg.nodeGroupName || sg.name) clusterReq.nodeGroupName = sg.nodeGroupName || sg.name;
          if (sg.version) clusterReq.version = sg.version;
          if (sg.nodeGroupSize || sg.desiredNodeSize) clusterReq.desiredNodeSize = sg.nodeGroupSize || sg.desiredNodeSize;
          if (sg.minNodeSize) clusterReq.minNodeSize = sg.minNodeSize;
          if (sg.maxNodeSize) clusterReq.maxNodeSize = sg.maxNodeSize;
          if (sg.onAutoScaling) clusterReq.onAutoScaling = sg.onAutoScaling;
          if (sg.connectionName) clusterReq.connectionName = sg.connectionName;
          return clusterReq;
        });

        const multiClusterReq = {
          namePrefix: namePrefix,
          clusters: clusters
        };

        // Do not use skipVersionCheck without explicit version - let CB-TB use default versions per CSP
        const url = `${tbApiBase()}/ns/${namespace}/k8sMultiClusterDynamic`;
        const taskId = addSpinnerTask(`Create ${clusters.length} K8s Clusters`);

        axios.post(url, multiClusterReq, {
          auth: { username, password },
          headers: { 'Content-Type': 'application/json' }
        }).then(function (response) {
          removeSpinnerTask(taskId);
          const createdClusters = response.data?.clusters || [];
          const failedClusters = response.data?.failedClusters || [];
          const successCount = createdClusters.length;
          const failedCount = failedClusters.length;
          const totalCount = clusters.length;
          
          const clusterList = createdClusters.length > 0 
            ? createdClusters.map(c => `<li style="color: #28a745;">\u2713 ${c.name || c.id || 'Unknown'} (${c.connectionName || 'N/A'})</li>`).join('')
            : '<li>No clusters created</li>';

          // Build failed clusters list with details
          const failedList = failedClusters.length > 0
            ? failedClusters.map(f => `<li style="color: #dc3545;">\u2717 ${f.name || 'Unknown'} (${f.connectionName || 'N/A'})<br><small style="color: #888; margin-left: 20px;">${f.error || 'Unknown error'}</small></li>`).join('')
            : '';

          // Check if partial success (HTTP 207)
          const isPartialSuccess = response.status === 207;
          const title = isPartialSuccess ? "Partial Success" : 
                       (successCount === totalCount && successCount > 0 ? "All Clusters Created!" : "Cluster Creation Failed");
          const icon = isPartialSuccess ? "warning" :
                      (successCount === totalCount && successCount > 0 ? "success" : "error");

          Swal.fire({
            title: title,
            html: `
              <div style="text-align: left;">
                <p><strong>Created:</strong> ${successCount} / ${totalCount}</p>
                <ul style="max-height: 150px; overflow-y: auto; list-style: none; padding-left: 0;">${clusterList}</ul>
                ${failedCount > 0 ? `
                  <p style="margin-top: 15px;"><strong>Failed:</strong> ${failedCount}</p>
                  <ul style="max-height: 150px; overflow-y: auto; list-style: none; padding-left: 0;">${failedList}</ul>
                ` : ''}
              </div>
            `,
            icon: icon,
            confirmButtonText: "OK"
          });
        }).catch(function (error) {
          removeSpinnerTask(taskId);
          console.error("Multi-cluster creation failed:", error);
          
          let errorMessage = "Failed to create K8s Clusters";
          if (error.response?.data) {
            errorMessage += `\n${error.response.data.message || error.response.data.error || ''}`;
          }
          errorAlert(errorMessage);
        });
      }
    });
    return;
  }

  // Single cluster creation (original flow)
  // First, get available K8s versions
  const versionUrl = `${tbApiBase()}/availableK8sVersion?providerName=${spec.providerName}&regionName=${spec.regionName}`;
  
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
    let taskId;
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
            <small>Image: ${nodeGroup.imageId}</small>
          </div>
          <div style="font-size: 0.9em; color: #666;">
            Note: This will create a new Kubernetes cluster using the configured NodeGroup settings.
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
      if (result.isConfirmed) {
        const { clusterName, nodeGroupName, k8sVersion } = result.value;
        
        // Check if image designation is needed
        taskId = addSpinnerTask("Checking image requirements");
        
        checkK8sNodeImageDesignation(spec.providerName, hostname, port, username, password)
          .then(imageDesignationNeeded => {
            removeSpinnerTask(taskId);
            
            // Create K8s cluster request body
            const k8sClusterReq = {
              imageId: imageDesignationNeeded ? (nodeGroup.imageId || "default") : "default",
              specId: nodeGroup.specId,
              name: clusterName,
              nodeGroupName: nodeGroupName
            };
            
            // Add version if specified
            if (k8sVersion) {
              k8sClusterReq.version = k8sVersion;
            }
            
            // Add rootDiskType and rootDiskSize if available
            if (nodeGroup.rootDiskType) {
              k8sClusterReq.rootDiskType = nodeGroup.rootDiskType;
            }
            if (nodeGroup.rootDiskSize) {
              k8sClusterReq.rootDiskSize = nodeGroup.rootDiskSize;
            }

            // Check if using custom version (not from available versions list)
            const selectedVersion = document.getElementById('k8sVersionSelect').value;
            const isCustomVersion = selectedVersion === 'custom';
            
            // Add skipVersionCheck parameter for custom versions
            const skipVersionParam = isCustomVersion ? '?skipVersionCheck=true' : '';
            const url = `${tbApiBase()}/ns/${namespace}/k8sClusterDynamic${skipVersionParam}`;
            
            // Debug: uncomment if K8s creation debugging needed
            // console.log("Creating K8s Cluster:", k8sClusterReq);
            // console.log("Image designation needed:", imageDesignationNeeded);
            // console.log("Using custom version:", isCustomVersion);
            
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

// Add NodeGroup to existing K8s Cluster function (supports single and multi-NodeGroup)
function addNodeGroupToK8sCluster() {
  if (nodeGroupRequestFromSpecList.length < 1) {
    errorAlert("Please configure at least one NodeGroup to add NodeGroup(s) to K8s Cluster");
    return;
  }

  const cfg = getConfig();
  const hostname = cfg.hostname || window.configHostname;
  const port = cfg.port || window.configPort;
  const username = cfg.username || window.configUsername;
  const password = cfg.password || window.configPassword;
  const namespace = window.configNamespace || cfg.namespace || '';

  // First, get list of existing K8s clusters
  const listUrl = `${tbApiBase()}/ns/${namespace}/k8sCluster`;
  const listTaskId = addSpinnerTask("listK8sClusters");
  
  axios.get(listUrl, { auth: { username, password } }).then(function (response) {
    removeSpinnerTask(listTaskId);
    
    const clusters = response.data?.cluster || response.data?.K8sClusterInfo || [];
    
    if (clusters.length === 0) {
      errorAlert("No K8s clusters found. Please create a K8s cluster first.");
      return;
    }

    const isMultiNodeGroup = nodeGroupRequestFromSpecList.length > 1;

    if (isMultiNodeGroup) {
      // Multi-NodeGroup: Each NodeGroup maps to a compatible cluster
      showMultiNodeGroupDialog(clusters, hostname, port, username, password, namespace);
    } else {
      // Single NodeGroup (original flow)
      showSingleNodeGroupDialog(clusters, hostname, port, username, password, namespace);
    }
  }).catch(function (error) {
    removeSpinnerTask(listTaskId);
    console.error("Failed to get K8s cluster list:", error);
    errorAlert("Failed to get K8s cluster list");
  });
}

// Single NodeGroup dialog (original behavior)
function showSingleNodeGroupDialog(clusters, hostname, port, username, password, namespace) {
  const nodeGroup = nodeGroupRequestFromSpecList[0];
  const spec = recommendedSpecList[0];
  const k8sNodeGroupRandomName = "ng-" + generateRandomString();
  const nodeGroupProvider = spec.providerName || '';
  const nodeGroupRegion = spec.regionName || '';
  const nodeGroupProviderLower = nodeGroupProvider.toLowerCase();
  const nodeGroupRegionLower = nodeGroupRegion.toLowerCase();

    const clusterOptions = clusters.map(cluster => {
      // Use cluster-level status for determining availability
      const clusterStatus = cluster?.status || 'Unknown';
      const isActive = clusterStatus === 'Active';

      // Check if provider and region match
      const clusterProvider = (cluster?.connectionConfig?.providerName || '').toLowerCase();
      const clusterRegion = (cluster?.connectionConfig?.regionDetail?.regionName || '').toLowerCase();

      const providerRegionMatch = (clusterProvider === nodeGroupProviderLower && clusterRegion === nodeGroupRegionLower);

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
      const clusterProvider = (cluster?.connectionConfig?.providerName || '').toLowerCase();
      const clusterRegion = (cluster?.connectionConfig?.regionDetail?.regionName || '').toLowerCase();
      const providerRegionMatch = (clusterProvider === nodeGroupProviderLower && clusterRegion === nodeGroupRegionLower);
      return isActive && providerRegionMatch;
    });
    
    if (selectableClusters.length === 0) {
      errorAlert(`No compatible K8s clusters found.\n\nRequired:\n- Status: Active\n- Provider: ${nodeGroupProvider}\n- Region: ${nodeGroupRegion}\n\nPlease create a compatible K8s cluster first or check existing cluster configurations.`);
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
              Note: Only Active clusters with matching Provider (${nodeGroupProvider}) and Region (${nodeGroupRegion}) can be selected
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
            <small>Image: ${nodeGroup.imageId}</small>
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
              imageId: imageDesignationNeeded ? (nodeGroup.imageId || "default") : "default",
              specId: nodeGroup.specId,
              name: nodeGroupName
            };
            
            // Add rootDiskType and rootDiskSize if available
            if (nodeGroup.rootDiskType) {
              nodeGroupReq.rootDiskType = nodeGroup.rootDiskType;
            }
            if (nodeGroup.rootDiskSize) {
              nodeGroupReq.rootDiskSize = nodeGroup.rootDiskSize;
            }

            const url = `${tbApiBase()}/ns/${namespace}/k8sCluster/${clusterId}/k8sNodeGroupDynamic`;
            
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
    });
}

// Multi-NodeGroup dialog: maps each NodeGroup to compatible clusters
function showMultiNodeGroupDialog(clusters, hostname, port, username, password, namespace) {
  const nodeGroupPrefix = "ng-" + generateRandomString();
  
  // Build mapping of NodeGroups to compatible clusters
  const nodeGroupMappings = nodeGroupRequestFromSpecList.map((sg, idx) => {
    const spec = recommendedSpecList[idx];
    const provider = spec?.providerName || '';
    const region = spec?.regionName || '';
    const providerLower = provider.toLowerCase();
    const regionLower = region.toLowerCase();

    // Find compatible clusters (Active + matching provider/region)
    const compatibleClusters = clusters.filter(c => {
      const cProvider = (c?.connectionConfig?.providerName || '').toLowerCase();
      const cRegion = (c?.connectionConfig?.regionDetail?.regionName || '').toLowerCase();
      return c?.status === 'Active' && cProvider === providerLower && cRegion === regionLower;
    });
    
    return { idx, sg, spec, provider, region, compatibleClusters };
  });

  // Check if any NodeGroup has compatible clusters
  const hasAnyCompatible = nodeGroupMappings.some(m => m.compatibleClusters.length > 0);
  if (!hasAnyCompatible) {
    errorAlert("No compatible K8s clusters found for any NodeGroup configuration.\n\nEnsure you have Active clusters matching the Provider/Region of your NodeGroups.");
    return;
  }

  // Build HTML for cluster selection per NodeGroup
  const mappingRows = nodeGroupMappings.map(m => {
    const clusterOpts = m.compatibleClusters.length > 0
      ? m.compatibleClusters.map(c => `<option value="${c.id}">${c.name}</option>`).join('')
      : '<option value="" disabled>No compatible cluster</option>';
    
    return `<tr>
      <td>${m.idx + 1}</td>
      <td>${m.provider}</td>
      <td style="font-size:0.8em;">${m.region}</td>
      <td><select id="clusterSelect_${m.idx}" style="width:100%;padding:4px;font-size:0.85em;" ${m.compatibleClusters.length === 0 ? 'disabled' : ''}>
        ${clusterOpts}
      </select></td>
    </tr>`;
  }).join('');

  Swal.fire({
    title: `Add ${nodeGroupRequestFromSpecList.length} NodeGroups`,
    html: `
      <div style="text-align: left; padding: 10px;">
        <div style="margin-bottom: 15px;">
          <label style="font-weight: bold;">NodeGroup Name Prefix:</label><br>
          <input type="text" id="ngNamePrefix" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" 
                 value="${nodeGroupPrefix}" placeholder="Enter prefix">
        </div>
        <div style="background: #f8f9fa; padding: 10px; border-radius: 5px; max-height: 250px; overflow-y: auto;">
          <strong>NodeGroup → Cluster Mapping:</strong>
          <table style="width: 100%; font-size: 0.85em; margin-top: 8px;">
            <tr style="background: #e9ecef;"><th>#</th><th>Provider</th><th>Region</th><th>Target Cluster</th></tr>
            ${mappingRows}
          </table>
        </div>
        <div style="font-size: 0.85em; color: #666; margin-top: 10px;">
          Each NodeGroup will be added to its selected cluster sequentially.
        </div>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: `Add ${nodeGroupRequestFromSpecList.length} NodeGroups`,
    cancelButtonText: "Cancel",
    preConfirm: () => {
      const prefix = document.getElementById('ngNamePrefix').value.trim();
      if (!prefix) {
        Swal.showValidationMessage('Please enter name prefix');
        return false;
      }
      
      // Collect cluster selections
      const selections = [];
      for (let i = 0; i < nodeGroupRequestFromSpecList.length; i++) {
        const sel = document.getElementById(`clusterSelect_${i}`);
        if (sel && sel.value) {
          selections.push({ idx: i, clusterId: sel.value });
        }
      }
      
      if (selections.length === 0) {
        Swal.showValidationMessage('No valid cluster selections');
        return false;
      }
      
      return { prefix, selections };
    }
  }).then((result) => {
    if (result.isConfirmed) {
      const { prefix, selections } = result.value;
      executeMultiNodeGroupAddition(selections, prefix, hostname, port, username, password, namespace);
    }
  });
}

// Execute multiple NodeGroup additions sequentially
async function executeMultiNodeGroupAddition(selections, prefix, hostname, port, username, password, namespace) {
  const results = [];
  const taskId = addSpinnerTask(`Add ${selections.length} NodeGroups`);

  try {
    for (const sel of selections) {
      const sg = nodeGroupRequestFromSpecList[sel.idx];
      const ngName = `${prefix}-${sel.idx + 1}`;
      
      const nodeGroupReq = {
        imageId: sg.imageId || "default",
        specId: sg.specId,
        name: ngName
      };
      if (sg.rootDiskType) nodeGroupReq.rootDiskType = sg.rootDiskType;
      if (sg.rootDiskSize) nodeGroupReq.rootDiskSize = sg.rootDiskSize;

      const url = `${tbApiBase()}/ns/${namespace}/k8sCluster/${sel.clusterId}/k8sNodeGroupDynamic`;
      
      try {
        await axios.post(url, nodeGroupReq, {
          auth: { username, password },
          headers: { 'Content-Type': 'application/json' }
        });
        results.push({ ngName, clusterId: sel.clusterId, success: true });
      } catch (error) {
        console.error(`Failed to add NodeGroup ${ngName}:`, error);
        results.push({ ngName, clusterId: sel.clusterId, success: false, error: error.response?.data?.message || error.message });
      }
    }
  } finally {
    removeSpinnerTask(taskId);
  }

  const successCount = results.filter(r => r.success).length;
  const resultList = results.map(r => 
    `<li style="color: ${r.success ? '#28a745' : '#dc3545'};">${r.ngName} → ${r.clusterId}: ${r.success ? '✓' : '✗ ' + (r.error || 'Failed')}</li>`
  ).join('');

  Swal.fire({
    title: successCount === results.length ? "All NodeGroups Added!" : "NodeGroups Added (Partial)",
    html: `
      <div style="text-align: left;">
        <p><strong>Added:</strong> ${successCount} / ${results.length}</p>
        <ul style="max-height: 150px; overflow-y: auto; font-size: 0.9em;">${resultList}</ul>
      </div>
    `,
    icon: successCount === results.length ? "success" : "warning",
    confirmButtonText: "OK"
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
let currentWorkloadType = 'node'; // default to VM/Node mode (not k8s)

// Helper function to check current workload type
function getCurrentWorkloadType() {
  // First try to get from radio buttons
  const nodeModeInput = document.getElementById("nodeMode");
  const k8sModeInput = document.getElementById("k8sMode");
  
  // Debug: uncomment if workload type debugging needed
  // console.log('getCurrentWorkloadType() called');
  // console.log('nodeModeInput:', nodeModeInput);
  // console.log('k8sModeInput:', k8sModeInput);
  // console.log('nodeModeInput.checked:', nodeModeInput?.checked);
  // console.log('k8sModeInput.checked:', k8sModeInput?.checked);
  
  if (k8sModeInput && k8sModeInput.checked) {
    console.log('Returning k8s from radio button');
    currentWorkloadType = 'k8s';
    return 'k8s';
  } else if (nodeModeInput && nodeModeInput.checked) {
    console.log('Returning node mode from radio button');
    currentWorkloadType = 'node';
    return 'node';
  }
  
  // Fallback to global variable
  console.log('Returning from global variable:', currentWorkloadType);
  return currentWorkloadType;
}
window.getCurrentWorkloadType = getCurrentWorkloadType;

// Function to fetch K8s cluster information
async function fetchK8sClusterInfo() {
  const cfg = getConfig();
  const username = cfg.username || window.configUsername;
  const password = cfg.password || window.configPassword;
  
  const url = `${tbApiBase()}/k8sClusterInfo`;
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

// Function to toggle between MC-Infra (Node) and K8s-Infra
async function toggleWorkloadType() {
  const nodeModeInput = document.getElementById("nodeMode");
  const k8sModeInput = document.getElementById("k8sMode");
  const isK8sMode = k8sModeInput && k8sModeInput.checked;
  
  // Update global workload type
  currentWorkloadType = isK8sMode ? 'k8s' : 'node';
  console.log('toggleWorkloadType: currentWorkloadType set to', currentWorkloadType);
  
  // Save current configuration before switching
  if (isK8sMode) {
    // Switching from Node to K8s - save Node config
    workloadConfigurations.vmInfra.minVCPU = document.getElementById("minVCPU").value || "1";
    workloadConfigurations.vmInfra.minRAM = document.getElementById("minRAM").value || "0.5";
    workloadConfigurations.vmInfra.diskSize = document.getElementById("diskSize").value || "";
    
    // Store current Node provider selection
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
    // Switching from K8s to Node - save Node config
    workloadConfigurations.k8sInfra.minVCPU = document.getElementById("minVCPU").value || "4";
    workloadConfigurations.k8sInfra.minRAM = document.getElementById("minRAM").value || "16";
    workloadConfigurations.k8sInfra.diskSize = document.getElementById("diskSize").value || "100";
    
    // Apply Node configuration (restore previous or defaults)
    document.getElementById("minVCPU").value = workloadConfigurations.vmInfra.minVCPU;
    document.getElementById("minRAM").value = workloadConfigurations.vmInfra.minRAM;
    document.getElementById("diskSize").value = workloadConfigurations.vmInfra.diskSize;
    
    // Restore Node provider selection
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
    
    // No alert needed for Node mode as requested
  }
  
  console.log('Workload Type Changed:', isK8sMode ? 'K8s-Infra' : 'MC-Infra (Node)');
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
