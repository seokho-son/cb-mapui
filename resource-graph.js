/**
 * Resource Graph Module for CB-MapUI
 * 
 * Interactive resource relationship visualization using Cytoscape.js
 * 
 * Features:
 * - Automatic resource tree generation from MCI data
 * - Expand/collapse compound nodes
 * - Click to focus on related resources
 * - Right-click context menu for actions
 * - Real-time updates when MCI data changes
 * 
 * @author Cloud-Barista
 * @license Apache-2.0
 */

import cytoscape from 'cytoscape';
import coseBilkent from 'cytoscape-cose-bilkent';

// Register layout extension
cytoscape.use(coseBilkent);

// ============================================================================
// CONFIGURATION
// ============================================================================

const GRAPH_CONFIG = {
  // Node colors by resource type
  nodeColors: {
    namespace: '#6c757d',
    mci: '#007bff',
    subgroup: '#6610f2',   // Indigo - distinct from subnet
    vm: '#28a745',
    vnet: '#ffc107',
    subnet: '#17a2b8',     // Cyan - matches legend
    securityGroup: '#dc3545',
    sshKey: '#6f42c1',
    dataDisk: '#20c997',
    spec: '#e83e8c',
    image: '#795548'
  },
  // Node shapes by resource type
  nodeShapes: {
    namespace: 'round-rectangle',
    mci: 'round-rectangle',
    subgroup: 'round-rectangle',
    vm: 'ellipse',
    vnet: 'diamond',
    subnet: 'diamond',
    securityGroup: 'hexagon',
    sshKey: 'pentagon',
    dataDisk: 'barrel',
    spec: 'rectangle',
    image: 'rectangle'
  },
  // Layout options - cose-bilkent (force-directed, good for compound nodes)
  layout: {
    name: 'cose-bilkent',
    animate: true,
    animationDuration: 500,
    nodeDimensionsIncludeLabels: true,
    idealEdgeLength: 60,           // Shorter edges (was 80)
    nodeRepulsion: 4000,           // Slightly less repulsion (was 5000)
    nestingFactor: 0.3,            // Children closer to parent center (was 0.5)
    gravity: 0.5,                  // Slightly higher gravity (was 0.4)
    gravityRange: 1.5,
    gravityCompound: 2.5,          // Stronger pull for compound members (was 1.5)
    gravityRangeCompound: 2.5,     // Larger range (was 2.0)
    numIter: 3000,
    tile: true,
    tilingPaddingVertical: 5,      // Tighter tiling (was 10)
    tilingPaddingHorizontal: 5,    // Tighter tiling (was 10)
    edgeElasticity: 0.35,          // More flexible edges (was 0.45)
    randomize: false,
    fit: true,
    padding: 30
  },
  // Alternative layout - Concentric (type-based layers, flat nodes only)
  layoutConcentric: {
    name: 'concentric',
    animate: true,
    animationDuration: 500,
    fit: true,
    padding: 30,
    minNodeSpacing: 20,
    avoidOverlap: true,
    nodeDimensionsIncludeLabels: true,
    startAngle: 3 / 2 * Math.PI,
    clockwise: true,
    equidistant: false,
    spacingFactor: 0.6,
    concentric: function(node) {
      const type = node.data('type');
      const levels = {
        namespace: 5,
        mci: 4,
        subgroup: 3,
        vm: 2,
        vnet: 2,
        subnet: 1,
        securityGroup: 1,
        sshKey: 1,
        dataDisk: 1,
        spec: 0,
        image: 0
      };
      return levels[type] !== undefined ? levels[type] : 0;
    },
    levelWidth: function() { return 2; }
  },
  // Zoom limits
  zoom: {
    min: 0.1,
    max: 2.0,
    postFitMax: 1.5              // Maximum zoom after auto-fit (prevents over-zoom on few nodes)
  }
};

// ============================================================================
// GRAPH STATE
// ============================================================================

let cy = null;
let isGraphVisible = false;
let currentNamespace = null;
let lastDataHash = null;  // For change detection

/**
 * Generate a simple hash for data comparison
 * @param {*} data - Data to hash
 * @returns {string} - Hash string
 */
function generateDataHash(data) {
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(16);
}

// ============================================================================
// GRAPH INITIALIZATION
// ============================================================================

/**
 * Initialize the Cytoscape graph instance
 * @param {string} containerId - DOM container ID for the graph
 */
export function initResourceGraph(containerId = 'resource-graph-container') {
  const container = document.getElementById(containerId);
  if (!container) {
    console.warn('[ResourceGraph] Container not found:', containerId);
    return null;
  }

  cy = cytoscape({
    container: container,
    wheelSensitivity: 0.8,  // Smooth zoom control with mouse wheel (default: 1)
    minZoom: GRAPH_CONFIG.zoom.min,
    maxZoom: GRAPH_CONFIG.zoom.max,
    
    style: [
      // Base node style - rounded rectangle with text wrapping (GoJS-like)
      {
        selector: 'node',
        style: {
          'label': 'data(label)',
          'text-valign': 'center',
          'text-halign': 'center',
          'text-wrap': 'wrap',           // Enable text wrapping
          'text-max-width': function(ele) {  // Dynamic max-width based on node width
            const label = ele.data('label') || '';
            const nodeWidth = Math.max(90, Math.min(160, label.length * 8));
            return nodeWidth - 16;  // Subtract padding
          },
          'font-size': '13px',
          'font-weight': 'bold',
          'color': '#fff',
          'text-outline-color': 'data(color)',
          'text-outline-width': 2,
          'background-color': 'data(color)',
          'shape': 'round-rectangle',    // Rounded rectangle like GoJS
          'width': function(ele) {       // Dynamic width based on label
            const label = ele.data('label') || '';
            return Math.max(90, Math.min(160, label.length * 8));
          },
          'height': function(ele) {      // Dynamic height based on label
            const label = ele.data('label') || '';
            const nodeWidth = Math.max(90, Math.min(160, label.length * 8));
            const charsPerLine = Math.floor((nodeWidth - 16) / 7.5);  // Approx chars per line for 13px font
            const lines = Math.ceil(label.length / charsPerLine);
            return Math.max(40, lines * 18 + 14);
          },
          'padding': '8px'
        }
      },
      // Compound node (parent) style
      {
        selector: 'node:parent',
        style: {
          'text-valign': 'top',
          'text-halign': 'center',
          'background-opacity': 0.2,
          'border-width': 2,
          'border-color': 'data(color)',
          'padding': '20px'
        }
      },
      // VNet compound node - ellipse shape to distinguish from MCI/SubGroup
      {
        selector: 'node[type="vnet"]:parent',
        style: {
          'shape': 'ellipse',
          'background-opacity': 0.15,
          'border-style': 'dashed'
        }
      },
      // Subnet node - wider to accommodate longer names
      {
        selector: 'node[type="subnet"]',
        style: {
          'width': function(ele) {
            const label = ele.data('label') || '';
            return Math.max(100, Math.min(200, label.length * 9));  // Wider range for subnet
          },
          'text-max-width': function(ele) {
            const label = ele.data('label') || '';
            const nodeWidth = Math.max(100, Math.min(200, label.length * 9));
            return nodeWidth - 16;
          },
          'height': function(ele) {
            const label = ele.data('label') || '';
            const nodeWidth = Math.max(100, Math.min(200, label.length * 9));
            const charsPerLine = Math.floor((nodeWidth - 16) / 7.5);
            const lines = Math.ceil(label.length / charsPerLine);
            return Math.max(40, lines * 18 + 14);
          }
        }
      },
      // Edge style
      {
        selector: 'edge',
        style: {
          'width': 2,
          'line-color': '#999',
          'target-arrow-color': '#999',
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier',
          'control-point-step-size': 40,  // Spacing between parallel edges
          'opacity': 0.7
        }
      },
      // Selected node style
      {
        selector: 'node:selected',
        style: {
          'border-width': 4,
          'border-color': '#ff6b6b',
          'background-opacity': 1
        }
      },
      // Highlighted (neighbor) node style
      {
        selector: 'node.highlighted',
        style: {
          'border-width': 3,
          'border-color': '#ffd93d',
          'background-opacity': 0.9
        }
      },
      // Faded style for non-focused elements
      {
        selector: '.faded',
        style: {
          'opacity': 0.2
        }
      },
      // Highlighted edge style for focus view
      {
        selector: 'edge.highlighted-edge',
        style: {
          'width': 3,
          'opacity': 1,
          'line-color': '#333333',
          'target-arrow-color': '#333333',
          'z-index': 999
        }
      },
      // Status-based VM styles
      {
        selector: 'node[status="Running"]',
        style: {
          'border-width': 3,
          'border-color': '#28a745',
          'border-style': 'solid'
        }
      },
      {
        selector: 'node[status="Suspended"]',
        style: {
          'border-width': 3,
          'border-color': '#ffc107',
          'border-style': 'dashed'
        }
      },
      {
        selector: 'node[status="Failed"]',
        style: {
          'border-width': 3,
          'border-color': '#dc3545',
          'border-style': 'dotted'
        }
      },
      // Collapsed node indicator
      {
        selector: 'node.collapsed',
        style: {
          'background-image': 'none',
          'border-style': 'double',
          'border-width': 4
        }
      },
      // Unknown resource indicator (dashed border, slightly transparent)
      {
        selector: 'node[?isUnknown]',
        style: {
          'border-style': 'dashed',
          'border-width': 3,
          'border-color': '#888',
          'opacity': 0.7
        }
      },
      // Invisible edge style (for keeping siblings close)
      {
        selector: 'edge[?invisible]',
        style: {
          'opacity': 0,
          'width': 0
        }
      }
    ],
    
    // Interaction options (zoom levels defined above)
    boxSelectionEnabled: true,
    autounselectify: false
  });

  // Register event handlers
  registerGraphEvents();

  console.log('[ResourceGraph] Initialized successfully');
  return cy;
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function registerGraphEvents() {
  if (!cy) return;

  // Single click - show node info
  cy.on('tap', 'node', function(evt) {
    const node = evt.target;
    showNodeInfo(node);
  });

  // Double click - focus on neighbors
  cy.on('dbltap', 'node', function(evt) {
    const node = evt.target;
    focusOnNeighbors(node);
  });

  // Right click - context menu
  cy.on('cxttap', 'node', function(evt) {
    evt.preventDefault();
    const node = evt.target;
    const position = evt.renderedPosition;
    showContextMenu(node, position);
  });

  // Click on background - reset focus
  cy.on('tap', function(evt) {
    if (evt.target === cy) {
      resetFocus();
      hideContextMenu();
    }
  });

  // Mouse hover - show tooltip
  cy.on('mouseover', 'node', function(evt) {
    const node = evt.target;
    showTooltip(node, evt.renderedPosition);
  });

  cy.on('mouseout', 'node', function() {
    hideTooltip();
  });
}

// ============================================================================
// DATA TRANSFORMATION
// ============================================================================

/**
 * Transform MCI data to Cytoscape graph format
 * @param {Array} mciList - Array of MCI objects from CB-Tumblebug
 * @param {string} namespace - Current namespace
 * @returns {Object} - { nodes: [], edges: [] }
 */
export function mciDataToGraph(mciList, namespace) {
  const nodes = [];
  const edges = [];
  const resourceSet = new Set(); // Track unique resources
  
  // Get resource data from central store
  const centralData = window.cloudBaristaCentralData || {};
  const vNetList = centralData.vNet || [];
  const securityGroupList = centralData.securityGroup || [];
  const sshKeyList = centralData.sshKey || [];
  
  // Build lookup maps for resources
  const vNetMap = new Map();
  const subnetToVNetMap = new Map();
  vNetList.forEach(vnet => {
    vNetMap.set(vnet.id, vnet);
    if (vnet.subnetInfoList) {
      vnet.subnetInfoList.forEach(subnet => {
        subnetToVNetMap.set(subnet.id, vnet.id);
      });
    }
  });
  
  const sgMap = new Map();
  securityGroupList.forEach(sg => sgMap.set(sg.id, sg));
  
  const sshKeyMap = new Map();
  sshKeyList.forEach(key => sshKeyMap.set(key.id, key));

  // Namespace node (root)
  const nsId = `ns-${namespace}`;
  nodes.push({
    data: {
      id: nsId,
      label: `📁 ${namespace}`,
      type: 'namespace',
      color: GRAPH_CONFIG.nodeColors.namespace,
      originalData: { id: namespace, type: 'namespace' }
    }
  });

  // Create VNet nodes with their Subnets as children (compound structure)
  const vnetNodeIds = [];  // Track for sibling edges
  vNetList.forEach(vnet => {
    if (resourceSet.has(`vnet-${vnet.id}`)) return;
    resourceSet.add(`vnet-${vnet.id}`);
    
    const vnetNodeId = `vnet-${vnet.id}`;
    vnetNodeIds.push(vnetNodeId);  // Track for sibling edges
    const vnetParts = vnet.id.split('-');
    const vnetLabel = vnetParts.length > 3 
      ? `${vnetParts[0]}-${vnetParts.slice(-2).join('-')}` 
      : vnet.id;
    
    // VNet as compound node (parent of subnets)
    nodes.push({
      data: {
        id: vnetNodeId,
        label: `🌐 ${vnetLabel}`,
        parent: nsId,
        type: 'vnet',
        color: GRAPH_CONFIG.nodeColors.vnet,
        fullId: vnet.id,
        cidrBlock: vnet.cidrBlock,
        originalData: vnet
      }
    });
    
    // Add Subnet nodes as children of VNet
    const subnetNodeIds = [];
    if (vnet.subnetInfoList && Array.isArray(vnet.subnetInfoList)) {
      vnet.subnetInfoList.forEach(subnet => {
        const subnetNodeId = `subnet-${subnet.id}`;
        if (!resourceSet.has(subnetNodeId)) {
          resourceSet.add(subnetNodeId);
          subnetNodeIds.push(subnetNodeId);
          nodes.push({
            data: {
              id: subnetNodeId,
              label: `🔀 ${subnet.name || subnet.id}`,
              parent: vnetNodeId, // Subnet is child of VNet
              type: 'subnet',
              color: GRAPH_CONFIG.nodeColors.subnet,
              fullId: subnet.id,
              ipv4_CIDR: subnet.ipv4_CIDR,
              originalData: subnet
            }
          });
        }
      });
      
      // Add invisible edges between subnets in the same VNet to keep them close
      // (Subnets are typically few, so invisible edges work better than tiling)
      for (let i = 0; i < subnetNodeIds.length - 1; i++) {
        edges.push({
          data: {
            id: `subnet-link-${vnetNodeId}-${i}`,
            source: subnetNodeIds[i],
            target: subnetNodeIds[i + 1],
            type: 'subnet-sibling',
            invisible: true
          }
        });
      }
    }
  });

  // Add invisible edges between VNets to keep them grouped
  for (let i = 0; i < vnetNodeIds.length - 1; i++) {
    edges.push({
      data: {
        id: `vnet-link-${i}`,
        source: vnetNodeIds[i],
        target: vnetNodeIds[i + 1],
        type: 'vnet-sibling',
        invisible: true
      }
    });
  }

  // Create SecurityGroup nodes (bound to namespace)
  const sgNodeIds = [];  // Track for sibling edges
  securityGroupList.forEach(sg => {
    if (resourceSet.has(`sg-${sg.id}`)) return;
    resourceSet.add(`sg-${sg.id}`);
    sgNodeIds.push(`sg-${sg.id}`);  // Track for sibling edges
    
    const sgParts = sg.id.split('-');
    const sgLabel = sgParts.length > 3 
      ? `${sgParts[0]}-${sgParts.slice(-2).join('-')}` 
      : sg.id;
    
    nodes.push({
      data: {
        id: `sg-${sg.id}`,
        label: `🛡️ ${sgLabel}`,
        parent: nsId,
        type: 'securityGroup',
        color: GRAPH_CONFIG.nodeColors.securityGroup,
        fullId: sg.id,
        originalData: sg
      }
    });
  });

  // Add invisible edges between SecurityGroups to keep them grouped
  for (let i = 0; i < sgNodeIds.length - 1; i++) {
    edges.push({
      data: {
        id: `sg-link-${i}`,
        source: sgNodeIds[i],
        target: sgNodeIds[i + 1],
        type: 'sg-sibling',
        invisible: true
      }
    });
  }

  // Create SSHKey nodes (bound to namespace)
  const sshKeyNodeIds = [];  // Track for sibling edges
  sshKeyList.forEach(key => {
    if (resourceSet.has(`sshkey-${key.id}`)) return;
    resourceSet.add(`sshkey-${key.id}`);
    sshKeyNodeIds.push(`sshkey-${key.id}`);  // Track for sibling edges
    
    const keyParts = key.id.split('-');
    const keyLabel = keyParts.length > 3 
      ? `${keyParts[0]}-${keyParts.slice(-1)}` 
      : key.id;
    
    nodes.push({
      data: {
        id: `sshkey-${key.id}`,
        label: `🔑 ${keyLabel}`,
        parent: nsId,
        type: 'sshKey',
        color: GRAPH_CONFIG.nodeColors.sshKey,
        fullId: key.id,
        originalData: key
      }
    });
  });

  // Add invisible edges between SSHKeys to keep them grouped
  for (let i = 0; i < sshKeyNodeIds.length - 1; i++) {
    edges.push({
      data: {
        id: `sshkey-link-${i}`,
        source: sshKeyNodeIds[i],
        target: sshKeyNodeIds[i + 1],
        type: 'sshkey-sibling',
        invisible: true
      }
    });
  }

  // Return early if no MCI data (but we still show resources)
  if (!mciList || mciList.length === 0) {
    return { nodes, edges };
  }

  const mciNodeIds = [];  // Track for sibling edges
  const specNodeIds = [];  // Track Spec nodes for sibling edges
  const imageNodeIds = [];  // Track Image nodes for sibling edges

  mciList.forEach(mci => {
    const mciId = `mci-${mci.id}`;
    mciNodeIds.push(mciId);  // Track for sibling edges
    
    // MCI node (compound parent)
    nodes.push({
      data: {
        id: mciId,
        label: `🖥️ ${mci.name || mci.id}`,
        parent: nsId,
        type: 'mci',
        status: mci.status,
        color: GRAPH_CONFIG.nodeColors.mci,
        originalData: mci
      }
    });

    // Process VMs
    if (mci.vm && Array.isArray(mci.vm)) {
      // Group VMs by subGroupId
      const subGroups = {};
      
      mci.vm.forEach(vm => {
        const sgId = vm.subGroupId || 'default';
        if (!subGroups[sgId]) {
          subGroups[sgId] = [];
        }
        subGroups[sgId].push(vm);
      });

      // Always create subgroup nodes (even if only 1 subgroup)
      const subGroupIds = Object.keys(subGroups);
      const hasSingleSubGroup = subGroupIds.length === 1;
      
      // Track subgroup node IDs for invisible sibling edges
      const subGroupNodeIds = [];

      // Track edges at different levels for consolidation
      const mciEdges = {
        subnets: new Set(),
        securityGroups: new Set(),
        sshKeys: new Set(),
        specs: new Set(),
        images: new Set()
      };

      Object.entries(subGroups).forEach(([subGroupId, vms]) => {
        const subGroupNodeId = `subgroup-${mci.id}-${subGroupId}`;
        subGroupNodeIds.push(subGroupNodeId);  // Track for sibling edges
        
        // Always create subgroup node
        nodes.push({
          data: {
            id: subGroupNodeId,
            label: `📦 ${subGroupId}`,
            parent: mciId,
            type: 'subgroup',
            color: GRAPH_CONFIG.nodeColors.subgroup,
            originalData: { id: subGroupId, type: 'subgroup', mciId: mci.id }
          }
        });

        // Track edges at subgroup level for consolidation
        const subGroupEdges = {
          subnets: new Set(),
          securityGroups: new Set(),
          sshKeys: new Set(),
          specs: new Set(),
          images: new Set()
        };

        // Track VM node IDs for invisible sibling edges within subgroup
        const vmNodeIds = [];

        vms.forEach(vm => {
          // Include MCI ID in VM node ID to ensure uniqueness across MCIs
          const vmNodeId = `vm-${mci.id}-${vm.id}`;
          vmNodeIds.push(vmNodeId);  // Track for sibling edges
          
          // VM node - parent is always subgroup now
          nodes.push({
            data: {
              id: vmNodeId,
              label: `💻 ${vm.name || vm.id}`,
              parent: subGroupNodeId,
              type: 'vm',
              status: vm.status,
              color: GRAPH_CONFIG.nodeColors.vm,
              publicIP: vm.publicIP,
              privateIP: vm.privateIP,
              originalData: vm
            }
          });

          // Collect subnet connections for consolidation
          if (vm.subnetId) {
            const subnetNodeId = `subnet-${vm.subnetId}`;
            const isUnknown = vm.subnetId === 'unknown';
            
            // Create subnet node only if it doesn't exist
            if (!resourceSet.has(subnetNodeId)) {
              resourceSet.add(subnetNodeId);
              const subnetParts = vm.subnetId.split('-');
              const subnetLabel = isUnknown 
                ? 'Subnet (unknown)'
                : (subnetParts.length > 3 
                    ? `${subnetParts[0]}-${subnetParts.slice(-2).join('-')}` 
                    : vm.subnetId);
              
              const parentVNetId = subnetToVNetMap.get(vm.subnetId);
              const parentNodeId = parentVNetId ? `vnet-${parentVNetId}` : nsId;
              
              nodes.push({
                data: {
                  id: subnetNodeId,
                  label: `🔀 ${subnetLabel}`,
                  parent: parentNodeId,
                  type: 'subnet',
                  color: GRAPH_CONFIG.nodeColors.subnet,
                  isUnknown: isUnknown,
                  fullId: vm.subnetId,
                  originalData: { id: vm.subnetId, type: 'subnet' }
                }
              });
            }
            subGroupEdges.subnets.add(subnetNodeId);
          }

          // Collect SecurityGroup connections for consolidation
          if (vm.securityGroupIds && Array.isArray(vm.securityGroupIds)) {
            vm.securityGroupIds.forEach(sgId => {
              if (!sgId) return;
              
              const sgNodeId = `sg-${sgId}`;
              const isUnknown = sgId === 'unknown';
              
              if (!resourceSet.has(sgNodeId)) {
                resourceSet.add(sgNodeId);
                const sgParts = sgId.split('-');
                const sgLabel = isUnknown
                  ? 'SG (unknown)'
                  : (sgParts.length > 3 
                      ? `${sgParts[0]}-${sgParts.slice(-2).join('-')}` 
                      : sgId);
                nodes.push({
                  data: {
                    id: sgNodeId,
                    label: `🛡️ ${sgLabel}`,
                    parent: nsId,
                    type: 'securityGroup',
                    color: GRAPH_CONFIG.nodeColors.securityGroup,
                    isUnknown: isUnknown,
                    fullId: sgId,
                    originalData: { id: sgId, type: 'securityGroup' }
                  }
                });
              }
              subGroupEdges.securityGroups.add(sgNodeId);
            });
          }

          // Collect SSHKey connections for consolidation
          if (vm.sshKeyId && vm.sshKeyId !== 'unknown') {
            const sshKeyNodeId = `sshkey-${vm.sshKeyId}`;
            
            if (!resourceSet.has(sshKeyNodeId)) {
              resourceSet.add(sshKeyNodeId);
              const sshParts = vm.sshKeyId.split('-');
              const sshLabel = sshParts.length > 3 
                ? `${sshParts[0]}-${sshParts.slice(-1)}` 
                : vm.sshKeyId;
              nodes.push({
                data: {
                  id: sshKeyNodeId,
                  label: `🔑 ${sshLabel}`,
                  parent: nsId,
                  type: 'sshKey',
                  color: GRAPH_CONFIG.nodeColors.sshKey,
                  fullId: vm.sshKeyId,
                  originalData: { id: vm.sshKeyId, type: 'sshKey' }
                }
              });
            }
            subGroupEdges.sshKeys.add(sshKeyNodeId);
          }

          // Collect Spec connections for consolidation
          if (vm.specId && vm.specId !== 'unknown') {
            const specNodeId = `spec-${vm.specId}`;
            
            if (!resourceSet.has(specNodeId)) {
              resourceSet.add(specNodeId);
              specNodeIds.push(specNodeId);  // Track for sibling edges
              const specParts = vm.specId.split('+');
              const specLabel = specParts.length === 3 
                ? `${specParts[0]}/${specParts[2]}` 
                : vm.specId.substring(0, 30);
              nodes.push({
                data: {
                  id: specNodeId,
                  label: `📐 ${specLabel}`,
                  type: 'spec',
                  color: GRAPH_CONFIG.nodeColors.spec,
                  fullId: vm.specId,
                  originalData: { id: vm.specId, type: 'spec' }
                }
              });
            }
            subGroupEdges.specs.add(specNodeId);
          }

          // Collect Image connections for consolidation
          if (vm.imageId && vm.imageId !== 'unknown') {
            const imageNodeId = `image-${vm.imageId}`;
            
            if (!resourceSet.has(imageNodeId)) {
              resourceSet.add(imageNodeId);
              imageNodeIds.push(imageNodeId);  // Track for sibling edges
              const imageLabel = vm.imageId.length > 25 
                ? vm.imageId.substring(0, 22) + '...' 
                : vm.imageId;
              nodes.push({
                data: {
                  id: imageNodeId,
                  label: `🖼️ ${imageLabel}`,
                  type: 'image',
                  color: GRAPH_CONFIG.nodeColors.image,
                  fullId: vm.imageId,
                  originalData: { id: vm.imageId, type: 'image' }
                }
              });
            }
            subGroupEdges.images.add(imageNodeId);
          }

          // DataDisk connections - always individual (each VM has its own disks)
          if (vm.dataDiskIds && Array.isArray(vm.dataDiskIds) && vm.dataDiskIds.length > 0) {
            vm.dataDiskIds.forEach(diskId => {
              if (!diskId || diskId === 'unknown') return;
              
              const diskNodeId = `disk-${diskId}`;
              if (!resourceSet.has(diskNodeId)) {
                resourceSet.add(diskNodeId);
                const diskParts = diskId.split('-');
                const diskLabel = diskParts.length > 3 
                  ? `${diskParts[0]}-${diskParts.slice(-1)}` 
                  : diskId;
                nodes.push({
                  data: {
                    id: diskNodeId,
                    label: `💾 ${diskLabel}`,
                    type: 'dataDisk',
                    color: GRAPH_CONFIG.nodeColors.dataDisk,
                    fullId: diskId,
                    originalData: { id: diskId, type: 'dataDisk' }
                  }
                });
              }
              edges.push({
                data: {
                  id: `edge-${vmNodeId}-${diskNodeId}`,
                  source: vmNodeId,
                  target: diskNodeId,
                  relationship: 'attached'
                }
              });
            });
          }
        }); // end vms.forEach

        // VMs within SubGroup rely on tiling for compact layout (no invisible edges)

        // Check if all VMs in subgroup share the same resources
        const allVmsShareSubnet = subGroupEdges.subnets.size === 1 && vms.every(vm => vm.subnetId);
        const allVmsShareSG = subGroupEdges.securityGroups.size > 0 && 
          vms.every(vm => vm.securityGroupIds && vm.securityGroupIds.length > 0);
        const allVmsShareSSHKey = subGroupEdges.sshKeys.size === 1 && 
          vms.every(vm => vm.sshKeyId && vm.sshKeyId !== 'unknown');
        const allVmsShareSpec = subGroupEdges.specs.size === 1 && 
          vms.every(vm => vm.specId && vm.specId !== 'unknown');
        const allVmsShareImage = subGroupEdges.images.size === 1 && 
          vms.every(vm => vm.imageId && vm.imageId !== 'unknown');

        // Create edges from subgroup if all VMs share the same target, else from individual VMs
        if (allVmsShareSubnet) {
          // Add to MCI-level tracking for further consolidation
          subGroupEdges.subnets.forEach(target => mciEdges.subnets.add(target));
          
          // If not single subgroup, create edge from subgroup
          if (!hasSingleSubGroup) {
            subGroupEdges.subnets.forEach(target => {
              edges.push({
                data: {
                  id: `edge-${subGroupNodeId}-${target}`,
                  source: subGroupNodeId,
                  target: target,
                  relationship: 'uses'
                }
              });
            });
          }
        } else {
          // Create individual edges from VMs
          vms.forEach(vm => {
            if (vm.subnetId) {
              const vmNodeId = `vm-${mci.id}-${vm.id}`;
              edges.push({
                data: {
                  id: `edge-${vmNodeId}-subnet-${vm.subnetId}`,
                  source: vmNodeId,
                  target: `subnet-${vm.subnetId}`,
                  relationship: 'uses'
                }
              });
            }
          });
        }

        // SecurityGroup edges
        if (allVmsShareSG && subGroupEdges.securityGroups.size <= 2) {
          subGroupEdges.securityGroups.forEach(target => mciEdges.securityGroups.add(target));
          
          if (!hasSingleSubGroup) {
            subGroupEdges.securityGroups.forEach(target => {
              edges.push({
                data: {
                  id: `edge-${subGroupNodeId}-${target}`,
                  source: subGroupNodeId,
                  target: target,
                  relationship: 'protected-by'
                }
              });
            });
          }
        } else {
          vms.forEach(vm => {
            if (vm.securityGroupIds && Array.isArray(vm.securityGroupIds)) {
              const vmNodeId = `vm-${mci.id}-${vm.id}`;
              vm.securityGroupIds.forEach(sgId => {
                if (sgId) {
                  edges.push({
                    data: {
                      id: `edge-${vmNodeId}-sg-${sgId}`,
                      source: vmNodeId,
                      target: `sg-${sgId}`,
                      relationship: 'protected-by'
                    }
                  });
                }
              });
            }
          });
        }

        // SSHKey edges
        if (allVmsShareSSHKey) {
          subGroupEdges.sshKeys.forEach(target => mciEdges.sshKeys.add(target));
          
          if (!hasSingleSubGroup) {
            subGroupEdges.sshKeys.forEach(target => {
              edges.push({
                data: {
                  id: `edge-${subGroupNodeId}-${target}`,
                  source: subGroupNodeId,
                  target: target,
                  relationship: 'uses'
                }
              });
            });
          }
        } else {
          vms.forEach(vm => {
            if (vm.sshKeyId && vm.sshKeyId !== 'unknown') {
              const vmNodeId = `vm-${mci.id}-${vm.id}`;
              edges.push({
                data: {
                  id: `edge-${vmNodeId}-sshkey-${vm.sshKeyId}`,
                  source: vmNodeId,
                  target: `sshkey-${vm.sshKeyId}`,
                  relationship: 'uses'
                }
              });
            }
          });
        }

        // Spec edges
        if (allVmsShareSpec) {
          subGroupEdges.specs.forEach(target => mciEdges.specs.add(target));
          
          if (!hasSingleSubGroup) {
            subGroupEdges.specs.forEach(target => {
              edges.push({
                data: {
                  id: `edge-${subGroupNodeId}-${target}`,
                  source: subGroupNodeId,
                  target: target,
                  relationship: 'instance-of'
                }
              });
            });
          }
        } else {
          vms.forEach(vm => {
            if (vm.specId && vm.specId !== 'unknown') {
              const vmNodeId = `vm-${mci.id}-${vm.id}`;
              edges.push({
                data: {
                  id: `edge-${vmNodeId}-spec-${vm.specId}`,
                  source: vmNodeId,
                  target: `spec-${vm.specId}`,
                  relationship: 'instance-of'
                }
              });
            }
          });
        }

        // Image edges
        if (allVmsShareImage) {
          subGroupEdges.images.forEach(target => mciEdges.images.add(target));
          
          if (!hasSingleSubGroup) {
            subGroupEdges.images.forEach(target => {
              edges.push({
                data: {
                  id: `edge-${subGroupNodeId}-${target}`,
                  source: subGroupNodeId,
                  target: target,
                  relationship: 'based-on'
                }
              });
            });
          }
        } else {
          vms.forEach(vm => {
            if (vm.imageId && vm.imageId !== 'unknown') {
              const vmNodeId = `vm-${mci.id}-${vm.id}`;
              edges.push({
                data: {
                  id: `edge-${vmNodeId}-image-${vm.imageId}`,
                  source: vmNodeId,
                  target: `image-${vm.imageId}`,
                  relationship: 'based-on'
                }
              });
            }
          });
        }
      }); // end subGroups forEach

      // Add invisible edges between subgroups in the same MCI to keep them close
      for (let i = 0; i < subGroupNodeIds.length - 1; i++) {
        edges.push({
          data: {
            id: `subgroup-link-${mciId}-${i}`,
            source: subGroupNodeIds[i],
            target: subGroupNodeIds[i + 1],
            type: 'subgroup-sibling',
            invisible: true
          }
        });
      }

      // If single subgroup and all share same resources, create edges from MCI
      if (hasSingleSubGroup) {
        mciEdges.subnets.forEach(target => {
          edges.push({
            data: {
              id: `edge-${mciId}-${target}`,
              source: mciId,
              target: target,
              relationship: 'uses'
            }
          });
        });
        mciEdges.securityGroups.forEach(target => {
          edges.push({
            data: {
              id: `edge-${mciId}-${target}`,
              source: mciId,
              target: target,
              relationship: 'protected-by'
            }
          });
        });
        mciEdges.sshKeys.forEach(target => {
          edges.push({
            data: {
              id: `edge-${mciId}-${target}`,
              source: mciId,
              target: target,
              relationship: 'uses'
            }
          });
        });
        mciEdges.specs.forEach(target => {
          edges.push({
            data: {
              id: `edge-${mciId}-${target}`,
              source: mciId,
              target: target,
              relationship: 'instance-of'
            }
          });
        });
        mciEdges.images.forEach(target => {
          edges.push({
            data: {
              id: `edge-${mciId}-${target}`,
              source: mciId,
              target: target,
              relationship: 'based-on'
            }
          });
        });
      }
    }
  });

  // Add invisible edges between MCIs to keep them grouped
  for (let i = 0; i < mciNodeIds.length - 1; i++) {
    edges.push({
      data: {
        id: `mci-link-${i}`,
        source: mciNodeIds[i],
        target: mciNodeIds[i + 1],
        type: 'mci-sibling',
        invisible: true
      }
    });
  }

  // Add invisible edges between Specs to keep them grouped
  for (let i = 0; i < specNodeIds.length - 1; i++) {
    edges.push({
      data: {
        id: `spec-link-${i}`,
        source: specNodeIds[i],
        target: specNodeIds[i + 1],
        type: 'spec-sibling',
        invisible: true
      }
    });
  }

  // Add invisible edges between Images to keep them grouped
  for (let i = 0; i < imageNodeIds.length - 1; i++) {
    edges.push({
      data: {
        id: `image-link-${i}`,
        source: imageNodeIds[i],
        target: imageNodeIds[i + 1],
        type: 'image-sibling',
        invisible: true
      }
    });
  }

  return { nodes, edges };
}

// ============================================================================
// GRAPH UPDATE & RENDER
// ============================================================================

/**
 * Update graph with new data
 * @param {Array} mciList - MCI data array
 * @param {string} namespace - Current namespace
 * @param {boolean} force - Force update even if data unchanged
 * @param {Object} centralData - Full central data object for change detection
 */
export function updateGraph(mciList, namespace, force = false, centralData = null) {
  if (!cy) {
    console.warn('[ResourceGraph] Graph not initialized');
    return;
  }

  // Check if data has changed (skip update if unchanged)
  // Hash all resource data to detect any changes (MCI, VNet, SG, SSHKey, etc.)
  const dataForHash = centralData ? {
    namespace,
    mciData: centralData.mciData,
    vNet: centralData.vNet,
    securityGroup: centralData.securityGroup,
    sshKey: centralData.sshKey,
    dataDisk: centralData.dataDisk,
    customImage: centralData.customImage
  } : { mciList, namespace };
  
  const newHash = generateDataHash(dataForHash);
  
  if (!force && lastDataHash === newHash) {
    // Data unchanged, skip update
    return;
  }
  
  console.log(`[ResourceGraph] Data changed (hash: ${lastDataHash?.slice(0,8) || 'null'} -> ${newHash.slice(0,8)}), updating graph...`);
  lastDataHash = newHash;

  currentNamespace = namespace;
  const graphData = mciDataToGraph(mciList, namespace);

  // Build set of node IDs for edge validation
  const nodeIdSet = new Set(graphData.nodes.map(n => n.data.id));
  
  // Filter edges to only include those with valid source and target nodes
  const validEdges = graphData.edges.filter(edge => {
    const sourceExists = nodeIdSet.has(edge.data.source);
    const targetExists = nodeIdSet.has(edge.data.target);
    if (!sourceExists || !targetExists) {
      console.debug(`[ResourceGraph] Skipping edge ${edge.data.id}: source=${sourceExists}, target=${targetExists}`);
      return false;
    }
    return true;
  });

  // Batch update for performance
  cy.batch(() => {
    cy.elements().remove();
    cy.add(graphData.nodes);
    cy.add(validEdges);
  });

  // Run layout
  runLayout();

  console.log(`[ResourceGraph] Updated with ${graphData.nodes.length} nodes, ${validEdges.length} edges (${graphData.edges.length - validEdges.length} skipped)`);
}

/**
 * Run the graph layout algorithm
 */
export function runLayout(layoutName = null) {
  if (!cy) return;

  let options;
  if (layoutName === 'concentric') {
    options = GRAPH_CONFIG.layoutConcentric;
  } else if (layoutName === 'cose-bilkent' || layoutName === null) {
    options = GRAPH_CONFIG.layout;  // Default is cose-bilkent
  } else {
    options = { ...GRAPH_CONFIG.layout, name: layoutName };
  }
  
  const layout = cy.layout(options);
  layout.run();
}

// ============================================================================
// FOCUS & HIGHLIGHT
// ============================================================================

/**
 * Focus on a node and highlight its neighbors
 * @param {Object} node - Cytoscape node object
 */
export function focusOnNeighbors(node) {
  if (!cy) return;

  // Get neighborhood (connected elements), excluding invisible edges
  const visibleEdges = node.connectedEdges().filter(edge => !edge.data('invisible'));
  const visibleNeighborNodes = visibleEdges.connectedNodes();
  const neighborhood = node.union(visibleEdges).union(visibleNeighborNodes);
  
  // Also include parent and children for compound nodes
  const parents = node.ancestors();
  const children = node.descendants();
  
  // Get ancestors of all neighbor nodes (to show VNets when Subnets are connected)
  const neighborAncestors = visibleNeighborNodes.ancestors();
  
  // Get neighbors of parent nodes (for consolidated edges), excluding invisible edges
  // When edges are consolidated at SubGroup/MCI level, VM/SubGroup nodes need to show parent's connections
  let parentNeighbors = cy.collection();
  parents.forEach(parent => {
    const parentVisibleEdges = parent.connectedEdges().filter(edge => !edge.data('invisible'));
    const parentVisibleNodes = parentVisibleEdges.connectedNodes();
    parentNeighbors = parentNeighbors.union(parent).union(parentVisibleEdges).union(parentVisibleNodes);
  });
  
  // Also get ancestors of parent's neighbors (to show VNets for parent-connected Subnets)
  const parentNeighborAncestors = parentNeighbors.nodes().ancestors();
  
  // Get neighbors of child nodes (for compound nodes like MCI, SubGroup, VNet)
  // When MCI is selected, show all connections of its SubGroups and VMs
  let childNeighbors = cy.collection();
  children.forEach(child => {
    const childVisibleEdges = child.connectedEdges().filter(edge => !edge.data('invisible'));
    const childVisibleNodes = childVisibleEdges.connectedNodes();
    childNeighbors = childNeighbors.union(childVisibleEdges).union(childVisibleNodes);
  });
  
  // Get ancestors of child's neighbors (to show VNets for child-connected Subnets)
  const childNeighborAncestors = childNeighbors.nodes().ancestors();
  
  // Combine all related elements
  const related = neighborhood
    .union(parents)
    .union(children)
    .union(neighborAncestors)
    .union(parentNeighbors)
    .union(parentNeighborAncestors)
    .union(childNeighbors)
    .union(childNeighborAncestors);

  // Fade all elements and remove previous highlights
  cy.elements().addClass('faded');
  cy.edges().removeClass('highlighted-edge');
  
  // Highlight related elements
  related.removeClass('faded');
  node.removeClass('faded').addClass('highlighted');
  
  // Highlight edges connected to the selected node, its descendants, and parent (consolidated edges)
  // Collect parent visible edges for consolidated edge highlighting
  let parentVisibleEdges = cy.collection();
  parents.forEach(parent => {
    parentVisibleEdges = parentVisibleEdges.union(
      parent.connectedEdges().filter(edge => !edge.data('invisible'))
    );
  });
  
  const highlightEdges = visibleEdges
    .union(childNeighbors.edges())
    .union(parentVisibleEdges)
    .filter(edge => !edge.data('invisible'));
  highlightEdges.addClass('highlighted-edge');

  // Fit view to related elements
  cy.fit(related, 50);
}

/**
 * Reset focus - show all elements
 */
export function resetFocus() {
  if (!cy) return;

  cy.elements().removeClass('faded').removeClass('highlighted');
  cy.edges().removeClass('highlighted-edge');
  cy.fit(undefined, 30);
}

// ============================================================================
// NODE INFORMATION DISPLAY
// ============================================================================

/**
 * Show detailed information for a node
 * @param {Object} node - Cytoscape node object
 */
function showNodeInfo(node) {
  const data = node.data();
  const originalData = data.originalData || {};

  let content = '';
  const type = data.type;

  switch (type) {
    case 'vm':
      content = `
        <div style="text-align: left;">
          <p><strong>Name:</strong> ${originalData.name || 'N/A'}</p>
          <p><strong>ID:</strong> ${originalData.id || 'N/A'}</p>
          <p><strong>Status:</strong> <span style="color: ${getStatusColor(originalData.status)}">${originalData.status || 'N/A'}</span></p>
          <p><strong>Public IP:</strong> ${originalData.publicIP || 'N/A'}</p>
          <p><strong>Private IP:</strong> ${originalData.privateIP || 'N/A'}</p>
          <p><strong>Region:</strong> ${originalData.region?.Region || 'N/A'}</p>
          <p><strong>Connection:</strong> ${originalData.connectionName || 'N/A'}</p>
        </div>
      `;
      break;

    case 'mci':
      content = `
        <div style="text-align: left;">
          <p><strong>Name:</strong> ${originalData.name || 'N/A'}</p>
          <p><strong>ID:</strong> ${originalData.id || 'N/A'}</p>
          <p><strong>Status:</strong> <span style="color: ${getStatusColor(originalData.status)}">${originalData.status || 'N/A'}</span></p>
          <p><strong>VMs:</strong> ${originalData.vm?.length || 0}</p>
          <p><strong>Description:</strong> ${originalData.description || 'N/A'}</p>
        </div>
      `;
      break;

    default:
      content = `
        <div style="text-align: left;">
          <p><strong>Type:</strong> ${type}</p>
          <p><strong>ID:</strong> ${originalData.id || data.id || 'N/A'}</p>
        </div>
      `;
  }

  // Use SweetAlert2 (already included in CB-MapUI)
  if (window.Swal) {
    window.Swal.fire({
      title: `${getTypeEmoji(type)} ${data.label.replace(/^[^\s]+\s/, '')}`,
      html: content,
      icon: 'info',
      confirmButtonText: 'Close',
      showCancelButton: type === 'vm',
      cancelButtonText: 'Focus Related',
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#28a745'
    }).then((result) => {
      if (result.dismiss === window.Swal.DismissReason.cancel) {
        focusOnNeighbors(node);
      }
    });
  }
}

function getStatusColor(status) {
  if (!status) return '#6c757d';
  if (status.includes('Running')) return '#28a745';
  if (status.includes('Suspended')) return '#ffc107';
  if (status.includes('Failed')) return '#dc3545';
  return '#17a2b8';
}

function getTypeEmoji(type) {
  const emojis = {
    namespace: '📁',
    mci: '🖥️',
    subgroup: '📦',
    vm: '💻',
    vnet: '🌐',
    subnet: '🔀',
    securityGroup: '🛡️',
    sshKey: '🔑',
    dataDisk: '💾',
    spec: '📐',
    image: '�️'
  };
  return emojis[type] || '📌';
}

// ============================================================================
// CONTEXT MENU
// ============================================================================

let contextMenuElement = null;

function showContextMenu(node, position) {
  hideContextMenu();

  const data = node.data();
  const type = data.type;
  const originalData = data.originalData || {};

  const menuItems = [
    { label: '🔍 View Details', action: () => showNodeInfo(node) },
    { label: '🎯 Focus Related', action: () => focusOnNeighbors(node) },
    { label: '📊 Reset View', action: () => resetFocus() }
  ];

  // Type-specific menu items
  if (type === 'vm' && originalData.publicIP) {
    menuItems.push({ label: '🔗 Copy Public IP', action: () => copyToClipboard(originalData.publicIP) });
  }

  if (type === 'mci') {
    menuItems.push({ label: '📋 Show VMs', action: () => highlightMciVms(node) });
  }

  // Create menu element
  contextMenuElement = document.createElement('div');
  contextMenuElement.id = 'resource-graph-context-menu';
  contextMenuElement.style.cssText = `
    position: fixed;
    left: ${position.x}px;
    top: ${position.y}px;
    background: white;
    border: 1px solid #ccc;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000;
    min-width: 150px;
    padding: 4px 0;
  `;

  menuItems.forEach(item => {
    const menuItem = document.createElement('div');
    menuItem.textContent = item.label;
    menuItem.style.cssText = `
      padding: 8px 16px;
      cursor: pointer;
      font-size: 13px;
      transition: background 0.2s;
    `;
    menuItem.onmouseover = () => menuItem.style.background = '#f0f0f0';
    menuItem.onmouseout = () => menuItem.style.background = 'transparent';
    menuItem.onclick = () => {
      item.action();
      hideContextMenu();
    };
    contextMenuElement.appendChild(menuItem);
  });

  document.body.appendChild(contextMenuElement);

  // Close menu on outside click (remove any existing listener first)
  document.removeEventListener('click', hideContextMenu);
  setTimeout(() => {
    document.addEventListener('click', hideContextMenu, { once: true });
  }, 0);
}

function hideContextMenu() {
  if (contextMenuElement) {
    contextMenuElement.remove();
    contextMenuElement = null;
  }
}

function copyToClipboard(text) {
  if (!navigator.clipboard) {
    // Fallback for non-HTTPS or unsupported browsers
    console.warn('[ResourceGraph] Clipboard API not available');
    if (window.Swal) {
      window.Swal.fire({
        title: 'Copy Failed',
        text: 'Clipboard not available in this context',
        icon: 'warning',
        timer: 2000,
        showConfirmButton: false
      });
    }
    return;
  }
  
  navigator.clipboard.writeText(text).then(() => {
    if (window.Swal) {
      window.Swal.fire({
        title: 'Copied!',
        text: text,
        icon: 'success',
        timer: 1500,
        showConfirmButton: false
      });
    }
  }).catch(err => {
    console.error('[ResourceGraph] Failed to copy:', err);
    if (window.Swal) {
      window.Swal.fire({
        title: 'Copy Failed',
        text: 'Could not copy to clipboard',
        icon: 'error',
        timer: 2000,
        showConfirmButton: false
      });
    }
  });
}

function highlightMciVms(mciNode) {
  const vms = mciNode.descendants().filter('[type="vm"]');
  if (vms.length > 0) {
    cy.elements().addClass('faded');
    vms.removeClass('faded').addClass('highlighted');
    mciNode.removeClass('faded');
    cy.fit(vms, 30);
  }
}

// ============================================================================
// TOOLTIP
// ============================================================================

let tooltipElement = null;

function showTooltip(node, position) {
  hideTooltip();

  const data = node.data();
  const type = data.type;
  const status = data.status || '';
  const originalData = data.originalData || {};

  let tooltipText = data.label.replace(/^[^\s]+\s/, '');
  if (status) {
    tooltipText += ` (${status})`;
  }
  if (type === 'vm' && originalData.publicIP) {
    tooltipText += `\n${originalData.publicIP}`;
  }

  const container = document.getElementById('resource-graph-container');
  if (!container) return;

  tooltipElement = document.createElement('div');
  tooltipElement.id = 'resource-graph-tooltip';
  tooltipElement.textContent = tooltipText;
  tooltipElement.style.cssText = `
    position: absolute;
    left: ${position.x + 10}px;
    top: ${position.y + 10}px;
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
    pointer-events: none;
    z-index: 9999;
    white-space: pre-line;
  `;

  container.appendChild(tooltipElement);
}

function hideTooltip() {
  if (tooltipElement) {
    tooltipElement.remove();
    tooltipElement = null;
  }
}

// ============================================================================
// VISIBILITY CONTROL
// ============================================================================

/**
 * Show the resource graph panel
 * Note: The caller should handle hiding/showing other containers (map, console)
 */
export function showResourceGraph() {
  const graphContainer = document.getElementById('resource-graph-container');
  
  if (graphContainer) {
    graphContainer.style.display = 'block';
    isGraphVisible = true;
    
    // Initialize if not already done
    if (!cy) {
      initResourceGraph();
    }

    // Get current data
    const mciData = window.cloudBaristaCentralData?.mciData || [];
    const namespace = document.getElementById('namespace')?.value || '';
    
    // Always try to update graph if namespace is available (even with empty data)
    if (namespace) {
      updateGraph(mciData, namespace);
    } else {
      // Show loading message if no namespace selected
      console.log('[ResourceGraph] No namespace selected, waiting for data...');
    }

    // Resize graph to fit container
    setTimeout(() => {
      if (cy) {
        cy.resize();
        cy.fit(undefined, 30);
        // Limit zoom level after fit (prevent over-zoom on few nodes)
        if (cy.zoom() > GRAPH_CONFIG.zoom.postFitMax) {
          cy.zoom(GRAPH_CONFIG.zoom.postFitMax);
          cy.center();
        }
      }
    }, 100);
    
    // Ensure subscription is active
    subscribeToUpdates();
  }
}

/**
 * Hide the resource graph panel
 * Note: Does NOT automatically show the map - let the caller decide what to display
 */
export function hideResourceGraph() {
  const graphContainer = document.getElementById('resource-graph-container');
  
  if (graphContainer) {
    graphContainer.style.display = 'none';
    isGraphVisible = false;
  }
}

/**
 * Toggle resource graph visibility
 */
export function toggleResourceGraph() {
  if (isGraphVisible) {
    hideResourceGraph();
  } else {
    showResourceGraph();
  }
}

// ============================================================================
// AUTO-UPDATE INTEGRATION
// ============================================================================

let isSubscribed = false;

/**
 * Subscribe to central data updates for auto-refresh
 */
export function subscribeToUpdates() {
  // Prevent duplicate subscriptions
  if (isSubscribed) return;
  
  if (window.subscribeToDataUpdates) {
    window.subscribeToDataUpdates((centralData) => {
      if (isGraphVisible) {
        const namespace = document.getElementById('namespace')?.value || '';
        if (namespace) {
          // Pass full centralData for comprehensive change detection
          updateGraph(centralData.mciData || [], namespace, false, centralData);
        }
      }
    });
    isSubscribed = true;
    console.log('[ResourceGraph] Subscribed to data updates');
  } else {
    // Retry after a short delay if subscribeToDataUpdates is not yet available
    console.log('[ResourceGraph] subscribeToDataUpdates not available, retrying in 100ms...');
    setTimeout(subscribeToUpdates, 100);
  }
}

// ============================================================================
// EXPORT UTILITIES
// ============================================================================

/**
 * Export graph as PNG image
 */
export function exportGraphAsPng() {
  if (!cy) return;

  const png64 = cy.png({ full: true, scale: 2 });
  const link = document.createElement('a');
  link.href = png64;
  link.download = `resource-graph-${Date.now()}.png`;
  link.click();
  link.remove();  // Clean up DOM element
}

/**
 * Export graph as JSON
 */
export function exportGraphAsJson() {
  if (!cy) return;

  const json = cy.json();
  const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `resource-graph-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(url);  // Free up memory
  link.remove();  // Clean up DOM element
}

// ============================================================================
// GLOBAL EXPORTS (for use from HTML)
// ============================================================================

window.ResourceGraph = {
  init: initResourceGraph,
  show: showResourceGraph,
  hide: hideResourceGraph,
  toggle: toggleResourceGraph,
  update: updateGraph,
  focus: focusOnNeighbors,
  reset: resetFocus,
  runLayout: runLayout,
  exportPng: exportGraphAsPng,
  exportJson: exportGraphAsJson,
  subscribeToUpdates: subscribeToUpdates
};

// Auto-subscribe when module loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', subscribeToUpdates);
} else {
  subscribeToUpdates();
}

console.log('[ResourceGraph] Module loaded');
