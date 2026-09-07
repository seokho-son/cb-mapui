/**
 * Resource & Dropdown Lists Management Feature Module
 * @module features/resource-list
 */
import axios from 'axios';
import { tbApiBase, getConfig } from '../../core/api.js';
import { escapeHtml } from '../../core/utils.js';

const errorAlert = (msg) => (window.errorAlert ? window.errorAlert(msg) : (typeof Swal !== 'undefined' ? Swal.fire({ icon: 'error', title: msg, showConfirmButton: true }) : alert(msg)));
const displayJsonData = (...args) => { if (window.displayJsonData) window.displayJsonData(...args); };
const updateMapConnectionStatus = (s) => { if (window.updateMapConnectionStatus) window.updateMapConnectionStatus(s); };
const initializeMapLastUpdated = () => { if (window.initializeMapLastUpdated) window.initializeMapLastUpdated(); };
const updateProviderDropdownText = () => { if (window.updateProviderDropdownText) window.updateProviderDropdownText(); };
const updateNsDisplays = (ns) => { if (window.updateNsDisplays) window.updateNsDisplays(ns); };

const typeStringConnection = 'connection';
const typeStringVNet = 'vNet';
const typeStringSG = 'securityGroup';
const typeStringSshKey = 'sshKey';
const typeError = 'error';

let cachedNamespaceList = [];
window.cachedNamespaceList = cachedNamespaceList;

function updateNsList() {
  var config = getConfig();
  var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;

  if (!hostname || hostname === "" || !port || port === "") return;

  var url = `${tbApiBase()}/ns?option=id`;

  axios({
    method: "get",
    url: url,
    auth: { username, password },
  })
    .then((res) => {
      if (res.data.output != null) {
        cachedNamespaceList = res.data.output.filter(item => item && item.trim() !== "");
        window.cachedNamespaceList = cachedNamespaceList;

        let currentNs = window.configNamespace;
        // If no namespace selected yet, pick 'default' if present, else first
        if (!currentNs && cachedNamespaceList.length > 0) {
          currentNs = cachedNamespaceList.includes('default') ? 'default' : cachedNamespaceList[0];
          window.configNamespace = currentNs;
        }
        // If current selection no longer in list, reset to 'default' if present, else first
        if (currentNs && !cachedNamespaceList.includes(currentNs) && cachedNamespaceList.length > 0) {
          currentNs = cachedNamespaceList.includes('default') ? 'default' : cachedNamespaceList[0];
          window.configNamespace = currentNs;
        }

        updateNsDisplays();

        // Update Settings modal NS select if currently open
        var settingsNsSelect = document.getElementById('settings-namespace');
        if (settingsNsSelect) {
          settingsNsSelect.innerHTML = cachedNamespaceList.map(ns => {
            const safeNs = window.escapeHtml(ns);
            const selected = ns === currentNs ? 'selected' : '';
            return `<option value="${safeNs}" ${selected}>${safeNs}</option>`;
          }).join('');
        }
      }
    })
    .finally(function () {
      updateInfraList();
    });
}

// (syncNamespaceSelection removed — namespace is now a global configNamespace)

var infraList = [];
var infraHideList = [];

function updateInfraList() {
  // Clear options in 'select'
  var selectElement = document.getElementById("infraid");
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
  var namespace = window.configNamespace || config.namespace || '';

  if (namespace && namespace != "") {
    var url = `${tbApiBase()}/ns/${namespace}/infra?option=id`;

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
          // infraList = res.data.output;
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
        updateNodeAndIpListsFromInfra();
        updateResourceList(typeStringVNet);
        updateResourceList(typeStringSG);
        updateResourceList(typeStringSshKey);
        // updateResourceList(typeStringSpec);
        // updateResourceList(typeStringImage);
      });
  }
}
window.updateInfraList = updateInfraList;

document.getElementById("infraid").onmouseover = function () {
  updateInfraList();
};
document.getElementById("infraid").onchange = function () {
  updateNodeAndIpListsFromInfra();
};

function updateVmList() {
  // This function is now deprecated as Node list is updated via updateNodeAndIpListsFromInfra()
  // Keeping for backward compatibility, but functionality moved to unified function
}
window.updateVmList = updateVmList;

document.getElementById("nodeid").addEventListener('change', function () {
  // When Node is selected, auto-select corresponding IP
  var selectedNodeId = this.value;
  var pubipSelect = document.getElementById("pubip");
  
  // Find and select the IP option that contains this Node ID
  for (let i = 0; i < pubipSelect.options.length; i++) {
    var optionText = pubipSelect.options[i].text;
    if (optionText.includes(`(${selectedNodeId},`)) {
      pubipSelect.options[i].selected = true;
      break;
    }
  }
});

function updateIpList() {
  // This function is now deprecated as IP list is updated via updateNodeAndIpListsFromInfra()
  // Keeping for backward compatibility, but functionality moved to unified function
}
window.updateIpList = updateIpList;

function updateNodeGroupList() {
  // This function is now deprecated as NodeGroup selection is removed from UI
  // NodeGroup information is now shown in Node ID dropdown as "node-id (nodegroup-id)"
}
window.updateNodeGroupList = updateNodeGroupList;

// NodeGroup selection element no longer exists in UI

// New unified function to update Node and IP lists from Infra data
function updateNodeAndIpListsFromInfra() {
  var nodeSelectElement = document.getElementById("nodeid");
  var ipSelectElement = document.getElementById("pubip");
  var previousNodeSelection = nodeSelectElement.value;
  var previousIpSelection = ipSelectElement.value;
  
  // Clear existing options
  while (nodeSelectElement.options.length > 0) {
    nodeSelectElement.remove(0);
  }
  while (ipSelectElement.options.length > 0) {
    ipSelectElement.remove(0);
  }

  var config = getConfig(); var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = window.configNamespace || config.namespace || '';
  var infraid = (window.infraidElement || document.getElementById('infraid'))?.value || '';

  if (namespace && namespace != "" && infraid && infraid != "") {
    var url = `${tbApiBase()}/ns/${namespace}/infra/${infraid}`;

    axios({
      method: "get",
      url: url,
      auth: {
        username: `${username}`,
        password: `${password}`,
      },
    })
      .then((res) => {
        if (res.data && res.data.node) {
          res.data.node.forEach(nd => {
            // Add Node option with NodeGroup info
            var nodeOption = document.createElement("option");
            nodeOption.value = nd.id;
            nodeOption.text = `${nd.id} (${nd.nodeGroupId || 'default'})`;
            nodeSelectElement.appendChild(nodeOption);

            // Add IP option with Node and NodeGroup info
            if (nd.publicIP && nd.publicIP.trim() !== "") {
              var ipOption = document.createElement("option");
              ipOption.value = nd.publicIP;
              ipOption.text = `${nd.publicIP} (${nd.id}, ${nd.nodeGroupId || 'default'})`;
              ipSelectElement.appendChild(ipOption);
            }
          });

          // Restore previous selections if they still exist
          for (let i = 0; i < nodeSelectElement.options.length; i++) {
            if (nodeSelectElement.options[i].value === previousNodeSelection) {
              nodeSelectElement.options[i].selected = true;
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
        console.error("Error updating Node and IP lists:", error);
      });
  }
}
window.updateNodeAndIpListsFromInfra = updateNodeAndIpListsFromInfra;

// Helper function to extract NodeGroup ID from Node selection text
function getNodeGroupIdFromNodeSelection() {
  var nodeSelect = document.getElementById("nodeid");
  var selectedOption = nodeSelect.options[nodeSelect.selectedIndex];
  if (selectedOption && selectedOption.text) {
    // Extract NodeGroup ID from text like "node-id (nodegroup-id)"
    var match = selectedOption.text.match(/\(([^)]+)\)$/);
    if (match) {
      return match[1];
    }
  }
  return "";
}
window.getNodeGroupIdFromNodeSelection = getNodeGroupIdFromNodeSelection;

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
  var namespace = window.configNamespace || config.namespace || '';

  if (namespace && namespace != "" && resourceType && resourceType != "") {
    var url = `${tbApiBase()}/ns/${namespace}/resources/${resourceType}?option=id`;

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
  
  // Namespace is now managed via Map Settings (configNamespace global)
  
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

  const credHolder = window.configCredentialHolder || config.credentialHolder || 'admin';
  var url = `${tbApiBase()}/connConfig?filterVerified=true&filterRegionRepresentative=true&filterCredentialHolder=${encodeURIComponent(credHolder)}`;

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

const attachConnectionListener = () => {
  const connEl = document.getElementById(typeStringConnection);
  if (connEl) {
    connEl.onmouseover = function () {
      updateConnectionList();
    };
  }
};
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachConnectionListener);
  } else {
    attachConnectionListener();
  }
}


// Ensure window exports
window.updateNsList = updateNsList;
window.updateInfraList = updateInfraList;
window.updateVmList = updateVmList;
window.updateIpList = updateIpList;
window.updateNodeGroupList = updateNodeGroupList;
window.updateNodeAndIpListsFromInfra = updateNodeAndIpListsFromInfra;
window.getNodeGroupIdFromNodeSelection = getNodeGroupIdFromNodeSelection;
window.updateResourceList = updateResourceList;
window.updateConnectionList = updateConnectionList;
