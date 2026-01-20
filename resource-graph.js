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
import fcose from 'cytoscape-fcose';
import Swal from 'sweetalert2';
import JSONFormatter from 'json-formatter-js';

// Register layout extension
cytoscape.use(fcose);

// ============================================================================
// CONFIGURATION
// ============================================================================

const GRAPH_CONFIG = {
  // Character width approximation for 12px font (used for label wrapping)
  charWidth: 7,
  
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
    image: '#795548',
    // CSP hierarchy colors
    cspRoot: '#2c3e50',    // Dark blue-gray - CSP container
    csp: '#ff6b35',        // Orange - cloud provider
    region: '#1e90ff',     // DodgerBlue - region
    zone: '#32cd32'        // LimeGreen - availability zone
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
    image: 'rectangle',
    // CSP hierarchy shapes
    cspRoot: 'round-rectangle',
    csp: 'round-rectangle',
    region: 'round-rectangle',
    zone: 'round-rectangle'
  },
  // Layout options - fcose (faster, better compound node handling)
  layout: {
    name: 'fcose',
    quality: 'default',            // 'draft', 'default', 'proof'
    animate: true,
    animationDuration: 500,
    nodeDimensionsIncludeLabels: true,
    nodeSeparation: 40,            // Minimum distance between nodes (lower = tighter grid)
    idealEdgeLength: edge => 50,   // Edge length (shorter = children closer)
    nodeRepulsion: node => 4500,   // Node repulsion force
    nestingFactor: 0.1,            // Children closer to parent center
    gravity: 0.4,                  // Pull toward center
    gravityRange: 3.8,
    gravityCompound: 1.5,          // Pull compound members closer together
    gravityRangeCompound: 2.0,
    numIter: 2500,
    tile: true,
    tilingPaddingVertical: 5,      // Padding between tiled nodes (grid spacing)
    tilingPaddingHorizontal: 5,    // Padding between tiled nodes (grid spacing)
    edgeElasticity: edge => 0.45,  // Edge flexibility
    randomize: false,              // Consistent layout
    fit: true,
    padding: 30,
    // Packing options for disconnected components (compound nodes)
    packComponents: true,
    componentSpacing: 60           // Space between disconnected components
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
        namespace: 6,
        cspRoot: 6,
        csp: 5,
        region: 4,
        zone: 3,
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

// Node type visibility settings (toggled via legend)
// Some types are disabled by default to reduce visual complexity
const nodeTypeVisibility = {
  // Infrastructure (toggleable)
  mci: true,
  subgroup: true,
  vm: true,
  // Network resources
  vnet: true,
  subnet: false,  // Disabled by default (child of VNet)
  securityGroup: true,
  sshKey: true,
  dataDisk: false,  // Disabled by default
  // CSP/Location hierarchy (disabled by default)
  cspRoot: false,
  csp: false,
  region: false,
  zone: false,
  // Spec/Image (disabled by default - too many connections)
  spec: false,
  image: false
};

// Hierarchical dependencies: child -> parent chain
// When enabling a child, all parents must also be enabled
const nodeTypeDependencies = {
  // Location hierarchy: zone -> region -> csp -> cspRoot
  zone: ['region', 'csp', 'cspRoot'],
  region: ['csp', 'cspRoot'],
  csp: ['cspRoot'],
  // Network hierarchy: subnet -> vnet
  subnet: ['vnet'],
  // Infrastructure hierarchy: vm -> subgroup -> mci
  vm: ['subgroup', 'mci'],
  subgroup: ['mci']
};

// Reverse dependencies: parent -> children
// When disabling a parent, all children should also be disabled
const nodeTypeChildren = {
  cspRoot: ['csp', 'region', 'zone'],
  csp: ['region', 'zone'],
  region: ['zone'],
  vnet: ['subnet'],
  mci: ['subgroup', 'vm'],
  subgroup: ['vm']
};

/**
 * Get maximum width for a node type
 * @param {string} type - Node type
 * @returns {number} - Maximum width in pixels
 */
function getNodeMaxWidth(type) {
  switch (type) {
    case 'namespace':
    case 'cspRoot':
      return 200;
    case 'mci':
    case 'csp':
      return 160;
    case 'subgroup':
    case 'region':
      return 140;
    case 'vm':
    case 'zone':
      return 130;
    case 'vnet':
    case 'subnet':
      return 150;
    case 'securityGroup':
    case 'sshKey':
    case 'dataDisk':
      return 130;
    case 'spec':
    case 'image':
      return 140;
    default:
      return 130;
  }
}

/**
 * Get max characters per line for a node type
 * @param {string} type - Node type
 * @returns {number} - Max characters per line
 */
function getMaxCharsPerLine(type) {
  const maxWidth = getNodeMaxWidth(type);
  return Math.floor(maxWidth / GRAPH_CONFIG.charWidth);
}

/**
 * Check if a node type is a compound/group node
 * Compound nodes expand to fit children, so their width is dynamic
 * @param {string} type - Node type
 * @returns {boolean} - True if compound node
 */
function isCompoundNodeType(type) {
  const compoundTypes = ['namespace', 'mci', 'subgroup', 'vnet', 'cspRoot', 'csp', 'region'];
  return compoundTypes.includes(type);
}

/**
 * Format label with line breaks for long text
 * Cytoscape's text-wrap: 'wrap' only breaks on whitespace,
 * so we manually insert newlines for long continuous strings.
 * For compound nodes, returns label without line breaks (will be updated after layout)
 * @param {string} icon - Emoji icon
 * @param {string} text - Label text
 * @param {number} maxCharsPerLine - Max characters per line
 * @param {string} [nodeType] - Optional node type to check if compound
 * @returns {string} - Formatted label with newlines
 */
function formatLabel(icon, text, maxCharsPerLine, nodeType) {
  // Compound nodes: return without line breaks, will be reformatted after layout
  // based on actual rendered width
  if (nodeType && isCompoundNodeType(nodeType)) {
    return `${icon} ${text}`;
  }
  
  // Account for icon (2 chars including space after)
  const firstLineMax = maxCharsPerLine - 2;
  
  if (text.length <= firstLineMax) {
    return `${icon} ${text}`;
  }
  
  // Split long text into multiple lines
  const lines = [];
  let remaining = text;
  let isFirstLine = true;
  
  while (remaining.length > 0) {
    const lineMax = isFirstLine ? firstLineMax : maxCharsPerLine;
    
    if (remaining.length <= lineMax) {
      lines.push(remaining);
      break;
    }
    
    // Find best break point (prefer after hyphen, underscore, or dot)
    let breakPoint = lineMax;
    const breakChars = ['-', '_', '.', '/'];
    
    for (const char of breakChars) {
      const pos = remaining.lastIndexOf(char, lineMax);
      if (pos > lineMax * 0.4) {  // At least 40% of the line
        breakPoint = pos + 1;  // Break after the character
        break;
      }
    }
    
    lines.push(remaining.substring(0, breakPoint));
    remaining = remaining.substring(breakPoint);
    isFirstLine = false;
  }
  
  return `${icon} ${lines.join('\n')}`;
}

/**
 * Reformat compound node labels based on actual rendered width or node max width
 * Called after layout is complete
 * - For nodes with children (:parent): use actual bounding box width
 * - For nodes without children: use predefined max width (like regular nodes)
 */
function reformatCompoundNodeLabels() {
  if (!cy) return;
  
  // Process all nodes that are compound types (not just :parent)
  cy.nodes().forEach(node => {
    const type = node.data('type');
    if (!isCompoundNodeType(type)) return;
    
    const label = node.data('label') || '';
    // Skip if already has newlines (already formatted)
    if (label.includes('\n')) return;
    
    // Check if this node has children (is actually acting as a parent)
    const hasChildren = node.children().length > 0;
    
    let maxCharsPerLine;
    
    if (hasChildren) {
      // Has children: use actual bounding box width
      const bb = node.boundingBox();
      const actualWidth = bb.w;
      maxCharsPerLine = Math.floor(actualWidth / GRAPH_CONFIG.charWidth);
    } else {
      // No children: use predefined max width (like regular nodes)
      const maxWidth = getNodeMaxWidth(type);
      maxCharsPerLine = Math.floor(maxWidth / GRAPH_CONFIG.charWidth);
    }
    
    if (maxCharsPerLine < 10) return;  // Too narrow, skip
    
    // Extract icon and text from current label
    const iconMatch = label.match(/^([\p{Emoji}\p{Emoji_Presentation}]+)\s*/u);
    if (!iconMatch) return;
    
    const icon = iconMatch[1];
    const text = label.substring(iconMatch[0].length);
    
    // Reformat with calculated width (pass null for nodeType to force formatting)
    const newLabel = formatLabel(icon, text, maxCharsPerLine, null);
    if (newLabel !== label) {
      node.data('label', newLabel);
    }
  });
}

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
      // Base node style - rounded rectangle with manual line breaks (GoJS-like)
      {
        selector: 'node',
        style: {
          'label': 'data(label)',
          'text-valign': 'center',
          'text-halign': 'center',
          'text-wrap': 'wrap',           // Required for \n to work in labels
          'font-size': '12px',
          'font-weight': 'bold',
          'color': '#fff',
          'text-outline-color': 'data(color)',
          'text-outline-width': 2,
          'background-color': 'data(color)',
          'shape': 'round-rectangle',    // Rounded rectangle like GoJS
          'width': function(ele) {       // Fixed max width per type, min based on label
            const label = ele.data('label') || '';
            const type = ele.data('type');
            const maxWidth = getNodeMaxWidth(type);
            // Get longest line for width calculation
            const lines = label.split('\n');
            const longestLine = lines.reduce((a, b) => a.length > b.length ? a : b, '');
            const labelWidth = longestLine.length * 7;  // Approx width for 12px font
            return Math.max(80, Math.min(maxWidth, labelWidth + 20));
          },
          'height': function(ele) {      // Dynamic height based on actual newlines in label
            const label = ele.data('label') || '';
            const lines = label.split('\n').length;
            return Math.max(36, lines * 16 + 12);  // 16px per line + padding
          },
          'padding': '6px'
        }
      },
      // Compound node (parent) style - manual line breaks for group labels
      {
        selector: 'node:parent',
        style: {
          'text-valign': 'top',
          'text-halign': 'center',
          'text-wrap': 'wrap',           // Required for \n to work in labels
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
          'opacity': 0.7,
          'events': 'no'  // Disable mouse events on edges (not selectable)
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
      // Hidden style for completely invisible elements (second click on focused node)
      {
        selector: '.hidden',
        style: {
          'display': 'none'
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
    evt.stopPropagation();  // Prevent background click handler
    const node = evt.target;
    showNodeInfo(node);
  });

  // Double click - focus on neighbors
  cy.on('dbltap', 'node', function(evt) {
    evt.stopPropagation();  // Prevent background click handler
    const node = evt.target;
    focusOnNeighbors(node);
  });

  // Right click - context menu
  cy.on('cxttap', 'node', function(evt) {
    evt.preventDefault();
    evt.stopPropagation();  // Prevent background click handler
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
      label: formatLabel('📁', namespace, getMaxCharsPerLine('namespace'), 'namespace'),
      type: 'namespace',
      color: GRAPH_CONFIG.nodeColors.namespace,
      originalData: { id: namespace, type: 'namespace' }
    }
  });

  // ========== CSP / Region / Zone hierarchy ==========
  // Track created CSP/Region/Zone nodes to avoid duplicates
  const cspNodes = new Set();
  const regionNodes = new Set();
  const zoneNodes = new Set();
  
  // Helper function to extract location info from resource
  function getLocationInfo(resource) {
    if (!resource || !resource.connectionConfig) return null;
    const cc = resource.connectionConfig;
    const rz = cc.regionZoneInfo || {};
    return {
      provider: cc.providerName || null,
      region: rz.assignedRegion || null,
      zone: rz.assignedZone || null
    };
  }
  
  // Helper function to create CSP/Region/Zone hierarchy nodes and return the target node ID
  function ensureLocationNodes(locationInfo) {
    // Skip if CSP nodes are disabled via legend toggle
    if (!nodeTypeVisibility.csp) return null;
    if (!locationInfo || !locationInfo.provider) return null;
    
    const { provider, region, zone } = locationInfo;
    
    // Create CSP root group node if not exists (independent of namespace)
    const cspRootId = 'csp-root';
    if (nodeTypeVisibility.cspRoot && !resourceSet.has(cspRootId)) {
      resourceSet.add(cspRootId);
      nodes.push({
        data: {
          id: cspRootId,
          label: '☁️ Cloud Providers',
          type: 'cspRoot',
          color: GRAPH_CONFIG.nodeColors.cspRoot,
          originalData: { id: 'csp-root', type: 'cspRoot' }
        }
      });
    }
    
    const cspNodeId = `csp-${provider}`;
    
    // Create CSP node if not exists (parent is csp-root if visible, otherwise no parent)
    if (!cspNodes.has(cspNodeId)) {
      cspNodes.add(cspNodeId);
      nodes.push({
        data: {
          id: cspNodeId,
          label: formatLabel('☁️', provider.toUpperCase(), getMaxCharsPerLine('csp'), 'csp'),
          parent: nodeTypeVisibility.cspRoot ? cspRootId : undefined,
          type: 'csp',
          color: GRAPH_CONFIG.nodeColors.csp,
          provider: provider,
          originalData: { id: provider, type: 'csp', provider }
        }
      });
    }
    
    // If no region or region visibility disabled, return CSP node
    if (!region || !nodeTypeVisibility.region) return cspNodeId;
    
    const regionNodeId = `region-${provider}-${region}`;
    
    // Create Region node if not exists
    if (!regionNodes.has(regionNodeId)) {
      regionNodes.add(regionNodeId);
      nodes.push({
        data: {
          id: regionNodeId,
          label: formatLabel('🌍', region, getMaxCharsPerLine('region'), 'region'),
          parent: cspNodeId,
          type: 'region',
          color: GRAPH_CONFIG.nodeColors.region,
          provider: provider,
          region: region,
          originalData: { id: region, type: 'region', provider, region }
        }
      });
    }
    
    // If no zone or zone visibility disabled, return Region node
    if (!zone || !nodeTypeVisibility.zone) return regionNodeId;
    
    const zoneNodeId = `zone-${provider}-${region}-${zone}`;
    
    // Create Zone node if not exists
    if (!zoneNodes.has(zoneNodeId)) {
      zoneNodes.add(zoneNodeId);
      nodes.push({
        data: {
          id: zoneNodeId,
          label: formatLabel('📍', zone, getMaxCharsPerLine('zone')),
          parent: regionNodeId,
          type: 'zone',
          color: GRAPH_CONFIG.nodeColors.zone,
          provider: provider,
          region: region,
          zone: zone,
          originalData: { id: zone, type: 'zone', provider, region, zone }
        }
      });
    }
    
    return zoneNodeId;
  }
  
  // Helper to create edge from resource to its location (Zone > Region > CSP)
  function createLocationEdge(sourceNodeId, resource, edgeSet) {
    const locationInfo = getLocationInfo(resource);
    const targetNodeId = ensureLocationNodes(locationInfo);
    if (targetNodeId) {
      const edgeId = `edge-${sourceNodeId}-${targetNodeId}`;
      if (!edgeSet.has(edgeId)) {
        edgeSet.add(edgeId);
        edges.push({
          data: {
            id: edgeId,
            source: sourceNodeId,
            target: targetNodeId,
            relationship: 'hosted-in'
          }
        });
      }
    }
    return targetNodeId;
  }
  
  // Track location edges to avoid duplicates
  const locationEdgeSet = new Set();
  // Create VNet nodes with their Subnets as children (compound structure)
  const vnetNodeIds = [];  // Track for sibling edges
  if (nodeTypeVisibility.vnet) {
    vNetList.forEach(vnet => {
      if (resourceSet.has(`vnet-${vnet.id}`)) return;
      resourceSet.add(`vnet-${vnet.id}`);
      
      const vnetNodeId = `vnet-${vnet.id}`;
      vnetNodeIds.push(vnetNodeId);  // Track for sibling edges
      
      // VNet as compound node (parent of subnets)
      nodes.push({
        data: {
          id: vnetNodeId,
          label: formatLabel('🌐', vnet.id, getMaxCharsPerLine('vnet'), 'vnet'),
          parent: nsId,
          type: 'vnet',
          color: GRAPH_CONFIG.nodeColors.vnet,
          fullId: vnet.id,
          cidrBlock: vnet.cidrBlock,
          originalData: vnet
        }
      });
      
      // Create edge to CSP/Region/Zone if location info exists
      createLocationEdge(vnetNodeId, vnet, locationEdgeSet);
      
      // Add Subnet nodes as children of VNet (only if subnet visibility is enabled)
      const subnetNodeIds = [];
      if (nodeTypeVisibility.subnet && vnet.subnetInfoList && Array.isArray(vnet.subnetInfoList)) {
        vnet.subnetInfoList.forEach(subnet => {
          // Include vnet.id in subnet node ID for uniqueness across VNets
          const subnetNodeId = `subnet-${vnet.id}-${subnet.id}`;
          if (!resourceSet.has(subnetNodeId)) {
            resourceSet.add(subnetNodeId);
            subnetNodeIds.push(subnetNodeId);
            nodes.push({
              data: {
                id: subnetNodeId,
                label: formatLabel('🔀', subnet.name || subnet.id, getMaxCharsPerLine('subnet')),
                parent: vnetNodeId, // Subnet is child of VNet
                type: 'subnet',
                color: GRAPH_CONFIG.nodeColors.subnet,
                fullId: subnet.id,
                vNetId: vnet.id,
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
  }

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
  if (nodeTypeVisibility.securityGroup) {
    securityGroupList.forEach(sg => {
      if (resourceSet.has(`sg-${sg.id}`)) return;
      resourceSet.add(`sg-${sg.id}`);
      sgNodeIds.push(`sg-${sg.id}`);  // Track for sibling edges
      
      nodes.push({
        data: {
          id: `sg-${sg.id}`,
          label: formatLabel('🛡️', sg.id, getMaxCharsPerLine('securityGroup')),
          parent: nsId,
          type: 'securityGroup',
          color: GRAPH_CONFIG.nodeColors.securityGroup,
          fullId: sg.id,
          vNetId: sg.vNetId,  // Store vNetId for edge creation
          originalData: sg
        }
      });
      
      // Create edge to VNet if vNetId exists and vnet visibility is enabled
      if (sg.vNetId && nodeTypeVisibility.vnet) {
        const vnetNodeId = `vnet-${sg.vNetId}`;
        const edgeId = `edge-sg-vnet-${sg.id}-${sg.vNetId}`;
        // Only create edge if VNet node exists
        if (resourceSet.has(vnetNodeId) && !edges.find(e => e.data.id === edgeId)) {
          edges.push({
            data: {
              id: edgeId,
              source: `sg-${sg.id}`,
              target: vnetNodeId,
              relationship: 'belongs-to',
              type: 'sg-vnet'
            }
          });
        }
      }
      
      // Create edge to CSP/Region/Zone if location info exists
      createLocationEdge(`sg-${sg.id}`, sg, locationEdgeSet);
    });
  }

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
  if (nodeTypeVisibility.sshKey) {
    sshKeyList.forEach(key => {
      if (resourceSet.has(`sshkey-${key.id}`)) return;
      resourceSet.add(`sshkey-${key.id}`);
      sshKeyNodeIds.push(`sshkey-${key.id}`);  // Track for sibling edges
      
      nodes.push({
        data: {
          id: `sshkey-${key.id}`,
          label: formatLabel('🔑', key.id, getMaxCharsPerLine('sshKey')),
          parent: nsId,
          type: 'sshKey',
          color: GRAPH_CONFIG.nodeColors.sshKey,
          fullId: key.id,
          originalData: key
        }
      });
      
      // Create edge to CSP/Region/Zone if location info exists
      createLocationEdge(`sshkey-${key.id}`, key, locationEdgeSet);
    });
  }

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

  // Create DataDisk nodes (bound to namespace)
  const dataDiskList = centralData.dataDisk || [];
  const dataDiskNodeIds = [];  // Track for sibling edges
  
  // Debug: Log namespace-level dataDisk list
  if (dataDiskList.length > 0) {
    console.debug(`[ResourceGraph] Namespace has ${dataDiskList.length} DataDisks:`, dataDiskList.map(d => d.id));
  }
  
  // Build lookup map for dataDisk
  const dataDiskMap = new Map();
  dataDiskList.forEach(disk => dataDiskMap.set(disk.id, disk));
  
  if (nodeTypeVisibility.dataDisk) {
    dataDiskList.forEach(disk => {
      if (resourceSet.has(`disk-${disk.id}`)) return;
      resourceSet.add(`disk-${disk.id}`);
      dataDiskNodeIds.push(`disk-${disk.id}`);  // Track for sibling edges
      
      nodes.push({
        data: {
          id: `disk-${disk.id}`,
          label: formatLabel('💾', disk.id, getMaxCharsPerLine('dataDisk')),
          parent: nsId,
          type: 'dataDisk',
          color: GRAPH_CONFIG.nodeColors.dataDisk,
          fullId: disk.id,
          diskType: disk.diskSize,
          diskSize: disk.diskSize,
          originalData: disk
        }
      });
      
      // Create edge to CSP/Region/Zone if location info exists
      createLocationEdge(`disk-${disk.id}`, disk, locationEdgeSet);
    });
  }

  // Add invisible edges between DataDisks to keep them grouped
  for (let i = 0; i < dataDiskNodeIds.length - 1; i++) {
    edges.push({
      data: {
        id: `disk-link-${i}`,
        source: dataDiskNodeIds[i],
        target: dataDiskNodeIds[i + 1],
        type: 'disk-sibling',
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
    // Skip MCI if visibility disabled
    if (!nodeTypeVisibility.mci) return;
    
    const mciId = `mci-${mci.id}`;
    mciNodeIds.push(mciId);  // Track for sibling edges
    
    // MCI node (compound parent)
    nodes.push({
      data: {
        id: mciId,
        label: formatLabel('🖥️', mci.name || mci.id, getMaxCharsPerLine('mci'), 'mci'),
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
        vNets: new Set(),
        subnets: new Set(),
        securityGroups: new Set(),
        sshKeys: new Set(),
        specs: new Set(),
        images: new Set(),
        dataDisks: new Set()
      };

      Object.entries(subGroups).forEach(([subGroupId, vms]) => {
        const subGroupNodeId = `subgroup-${mci.id}-${subGroupId}`;
        subGroupNodeIds.push(subGroupNodeId);  // Track for sibling edges
        
        // Create subgroup node only if visibility enabled
        if (nodeTypeVisibility.subgroup) {
          nodes.push({
            data: {
              id: subGroupNodeId,
              label: formatLabel('📦', subGroupId, getMaxCharsPerLine('subgroup'), 'subgroup'),
              parent: mciId,
              type: 'subgroup',
              color: GRAPH_CONFIG.nodeColors.subgroup,
              originalData: { id: subGroupId, type: 'subgroup', mciId: mci.id }
            }
          });
        }

        // Track edges at subgroup level for consolidation
        const subGroupEdges = {
          vNets: new Set(),
          subnets: new Set(),
          securityGroups: new Set(),
          sshKeys: new Set(),
          specs: new Set(),
          images: new Set(),
          dataDisks: new Set()
        };

        // Track VM node IDs for invisible sibling edges within subgroup
        const vmNodeIds = [];

        vms.forEach(vm => {
          // Include MCI ID in VM node ID to ensure uniqueness across MCIs
          const vmNodeId = `vm-${mci.id}-${vm.id}`;
          vmNodeIds.push(vmNodeId);  // Track for sibling edges
          
          // Skip VM node creation if visibility disabled
          if (!nodeTypeVisibility.vm) return;
          
          // Debug: Log dataDiskIds for each VM
          if (vm.dataDiskIds && vm.dataDiskIds.length > 0) {
            console.debug(`[ResourceGraph] VM ${vm.id} has dataDiskIds:`, vm.dataDiskIds);
          }
          
          // VM node - parent is subgroup if visible, otherwise MCI
          const vmParent = nodeTypeVisibility.subgroup ? subGroupNodeId : mciId;
          nodes.push({
            data: {
              id: vmNodeId,
              label: formatLabel('💻', vm.name || vm.id, getMaxCharsPerLine('vm')),
              parent: vmParent,
              type: 'vm',
              status: vm.status,
              color: GRAPH_CONFIG.nodeColors.vm,
              publicIP: vm.publicIP,
              privateIP: vm.privateIP,
              originalData: vm
            }
          });
          
          // Create edge to CSP/Region/Zone if location info exists
          createLocationEdge(vmNodeId, vm, locationEdgeSet);

          // Collect subnet connections for consolidation
          // Collect VNet and Subnet connections for consolidation (only if visibility enabled)
          if (vm.subnetId && nodeTypeVisibility.vnet) {
            const isSubnetUnknown = vm.subnetId === 'unknown';
            const isVNetUnknown = !vm.vNetId || vm.vNetId === 'unknown';
            
            // Determine VNet node ID
            const vnetNodeId = isVNetUnknown ? 'vnet-unknown' : `vnet-${vm.vNetId}`;
            
            // Create VNet node if unknown (known VNets are created from vNetList)
            if (isVNetUnknown && !resourceSet.has(vnetNodeId)) {
              resourceSet.add(vnetNodeId);
              nodes.push({
                data: {
                  id: vnetNodeId,
                  label: '🌐 VNet (unknown)',
                  parent: nsId,
                  type: 'vnet',
                  color: GRAPH_CONFIG.nodeColors.vnet,
                  isUnknown: true,
                  fullId: 'unknown',
                  originalData: { id: 'unknown', type: 'vnet' }
                }
              });
            }
            
            // Track VNet edge
            subGroupEdges.vNets.add(vnetNodeId);
            
            // Subnet node ID includes VNet ID for uniqueness (same subnet ID can exist in different VNets)
            const vnetIdForSubnet = isVNetUnknown ? 'unknown' : vm.vNetId;
            const subnetNodeId = isSubnetUnknown 
              ? 'subnet-unknown'  // Single shared node for all unknown subnets
              : `subnet-${vnetIdForSubnet}-${vm.subnetId}`;
            
            // Create subnet node only if it doesn't exist and subnet visibility is enabled
            if (nodeTypeVisibility.subnet && !resourceSet.has(subnetNodeId)) {
              resourceSet.add(subnetNodeId);
              const subnetText = isSubnetUnknown 
                ? 'Subnet (unknown)'
                : vm.subnetId;
              
              nodes.push({
                data: {
                  id: subnetNodeId,
                  label: formatLabel('🔀', subnetText, getMaxCharsPerLine('subnet')),
                  parent: vnetNodeId,  // Subnet is always child of VNet
                  type: 'subnet',
                  color: GRAPH_CONFIG.nodeColors.subnet,
                  isUnknown: isSubnetUnknown,
                  fullId: vm.subnetId,
                  vNetId: vnetIdForSubnet,
                  originalData: { id: vm.subnetId, vNetId: vnetIdForSubnet, type: 'subnet' }
                }
              });
            }
            if (nodeTypeVisibility.subnet) subGroupEdges.subnets.add(subnetNodeId);
          }

          // Collect SecurityGroup connections for consolidation (only if visibility enabled)
          if (nodeTypeVisibility.securityGroup && vm.securityGroupIds && Array.isArray(vm.securityGroupIds)) {
            vm.securityGroupIds.forEach(sgId => {
              if (!sgId) return;
              
              const sgNodeId = `sg-${sgId}`;
              const isUnknown = sgId === 'unknown';
              
              if (!resourceSet.has(sgNodeId)) {
                resourceSet.add(sgNodeId);
                const sgText = isUnknown ? 'SG (unknown)' : sgId;
                nodes.push({
                  data: {
                    id: sgNodeId,
                    label: formatLabel('🛡️', sgText, getMaxCharsPerLine('securityGroup')),
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

          // Collect SSHKey connections for consolidation (only if visibility enabled)
          if (vm.sshKeyId && nodeTypeVisibility.sshKey) {
            const isUnknown = vm.sshKeyId === 'unknown';
            const sshKeyNodeId = `sshkey-${vm.sshKeyId}`;  // Shared node for unknown
            
            if (!resourceSet.has(sshKeyNodeId)) {
              resourceSet.add(sshKeyNodeId);
              const sshText = isUnknown ? 'SSHKey (unknown)' : vm.sshKeyId;
              nodes.push({
                data: {
                  id: sshKeyNodeId,
                  label: formatLabel('🔑', sshText, getMaxCharsPerLine('sshKey')),
                  parent: nsId,
                  type: 'sshKey',
                  color: GRAPH_CONFIG.nodeColors.sshKey,
                  fullId: vm.sshKeyId,
                  isUnknown: isUnknown,
                  originalData: { id: vm.sshKeyId, type: 'sshKey' }
                }
              });
            }
            subGroupEdges.sshKeys.add(sshKeyNodeId);
          }

          // Collect Spec connections for consolidation (only if spec visibility enabled)
          if (vm.specId && nodeTypeVisibility.spec) {
            const isUnknown = vm.specId === 'unknown';
            const specNodeId = `spec-${vm.specId}`;  // Shared node for unknown
            
            if (!resourceSet.has(specNodeId)) {
              resourceSet.add(specNodeId);
              if (!isUnknown) specNodeIds.push(specNodeId);  // Track for sibling edges (not for unknown)
              const specText = isUnknown
                ? 'Spec (unknown)'
                : (() => {
                    const specParts = vm.specId.split('+');
                    return specParts.length === 3 
                      ? `${specParts[0]}/${specParts[2]}` 
                      : vm.specId;
                  })();
              nodes.push({
                data: {
                  id: specNodeId,
                  label: formatLabel('📐', specText, getMaxCharsPerLine('spec')),
                  type: 'spec',
                  color: GRAPH_CONFIG.nodeColors.spec,
                  fullId: vm.specId,
                  isUnknown: isUnknown,
                  originalData: { id: vm.specId, type: 'spec' }
                }
              });
            }
            subGroupEdges.specs.add(specNodeId);
          }

          // Collect Image connections for consolidation (only if image visibility enabled)
          if (vm.imageId && nodeTypeVisibility.image) {
            const isUnknown = vm.imageId === 'unknown';
            const imageNodeId = `image-${vm.imageId}`;  // Shared node for unknown
            
            if (!resourceSet.has(imageNodeId)) {
              resourceSet.add(imageNodeId);
              if (!isUnknown) imageNodeIds.push(imageNodeId);  // Track for sibling edges (not for unknown)
              const imageText = isUnknown ? 'Image (unknown)' : vm.imageId;
              nodes.push({
                data: {
                  id: imageNodeId,
                  label: formatLabel('🖼️', imageText, getMaxCharsPerLine('image')),
                  type: 'image',
                  color: GRAPH_CONFIG.nodeColors.image,
                  fullId: vm.imageId,
                  isUnknown: isUnknown,
                  originalData: { id: vm.imageId, type: 'image' }
                }
              });
            }
            subGroupEdges.images.add(imageNodeId);
          }

          // DataDisk connections - always individual (each VM has its own disks)
          // No subgroup/MCI level consolidation - each VM connects directly to its disks
          if (nodeTypeVisibility.dataDisk && vm.dataDiskIds && Array.isArray(vm.dataDiskIds) && vm.dataDiskIds.length > 0) {
            vm.dataDiskIds.forEach(diskId => {
              if (!diskId) return;
              
              const isUnknown = diskId === 'unknown';
              const diskNodeId = `disk-${diskId}`;
              
              // Check if disk exists in namespace-level dataDiskMap
              const diskData = dataDiskMap.get(diskId);
              
              // Create node only if not already created (from namespace-level or previous VM)
              if (!resourceSet.has(diskNodeId)) {
                resourceSet.add(diskNodeId);
                const diskText = isUnknown ? 'Disk (unknown)' : diskId;
                nodes.push({
                  data: {
                    id: diskNodeId,
                    label: formatLabel('💾', diskText, getMaxCharsPerLine('dataDisk')),
                    parent: nsId,  // DataDisk belongs to namespace
                    type: 'dataDisk',
                    color: GRAPH_CONFIG.nodeColors.dataDisk,
                    fullId: diskId,
                    diskType: diskData?.diskType,
                    diskSize: diskData?.diskSize,
                    isUnknown: isUnknown,
                    originalData: diskData || { id: diskId, type: 'dataDisk' }
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
        const allVmsShareVNet = subGroupEdges.vNets.size === 1 && vms.every(vm => vm.vNetId || vm.subnetId);
        const allVmsShareSubnet = subGroupEdges.subnets.size === 1 && vms.every(vm => vm.subnetId);
        const allVmsShareSG = subGroupEdges.securityGroups.size > 0 && 
          vms.every(vm => vm.securityGroupIds && vm.securityGroupIds.length > 0);
        const allVmsShareSSHKey = subGroupEdges.sshKeys.size === 1 && vms.every(vm => vm.sshKeyId);
        const allVmsShareSpec = subGroupEdges.specs.size === 1 && vms.every(vm => vm.specId);
        const allVmsShareImage = subGroupEdges.images.size === 1 && vms.every(vm => vm.imageId);

        // Create edges from subgroup if all VMs share the same target, else from individual VMs
        // VNet edges
        if (allVmsShareVNet) {
          subGroupEdges.vNets.forEach(target => mciEdges.vNets.add(target));
          
          if (!hasSingleSubGroup) {
            subGroupEdges.vNets.forEach(target => {
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
          // Create individual edges from VMs to VNet
          vms.forEach(vm => {
            const vmNodeId = `vm-${mci.id}-${vm.id}`;
            const isVNetUnknown = !vm.vNetId || vm.vNetId === 'unknown';
            const vnetNodeId = isVNetUnknown ? 'vnet-unknown' : `vnet-${vm.vNetId}`;
            edges.push({
              data: {
                id: `edge-${vmNodeId}-${vnetNodeId}`,
                source: vmNodeId,
                target: vnetNodeId,
                relationship: 'uses'
              }
            });
          });
        }

        // Subnet edges
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
          // Create individual edges from VMs to Subnet
          vms.forEach(vm => {
            if (vm.subnetId) {
              const vmNodeId = `vm-${mci.id}-${vm.id}`;
              const isSubnetUnknown = vm.subnetId === 'unknown';
              const isVNetUnknown = !vm.vNetId || vm.vNetId === 'unknown';
              const vnetIdForSubnet = isVNetUnknown ? 'unknown' : vm.vNetId;
              const subnetNodeId = isSubnetUnknown 
                ? 'subnet-unknown' 
                : `subnet-${vnetIdForSubnet}-${vm.subnetId}`;
              edges.push({
                data: {
                  id: `edge-${vmNodeId}-${subnetNodeId}`,
                  source: vmNodeId,
                  target: subnetNodeId,
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
        mciEdges.vNets.forEach(target => {
          edges.push({
            data: {
              id: `edge-${mciId}-${target}`,
              source: mciId,
              target: target,
              relationship: 'uses'
            }
          });
        });
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
        // Note: DataDisk edges are always from individual VMs, not consolidated to MCI level
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

  // Add invisible edges between CSP nodes to keep them grouped
  const cspNodeArray = Array.from(cspNodes);
  for (let i = 0; i < cspNodeArray.length - 1; i++) {
    edges.push({
      data: {
        id: `csp-link-${i}`,
        source: cspNodeArray[i],
        target: cspNodeArray[i + 1],
        type: 'csp-sibling',
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
  } else if (layoutName === 'fcose' || layoutName === null) {
    options = { ...GRAPH_CONFIG.layout };  // Default is fcose
    
    // Add relative placement constraint: namespace on left, cloud nodes on right
    const nsNodes = cy.nodes('[type="namespace"]');
    const cspRootNode = cy.getElementById('csp-root');
    const cspNodes = cy.nodes('[type="csp"]');
    
    const constraints = [];
    
    if (nsNodes.length) {
      // If cspRoot exists and is visible, use it
      if (cspRootNode.length && cspRootNode.visible()) {
        nsNodes.forEach(ns => {
          constraints.push({ left: ns.id(), right: 'csp-root', gap: 150 });
        });
      } 
      // Otherwise, constrain against individual csp nodes (top-level when cspRoot is hidden)
      else if (cspNodes.length) {
        const topLevelCspNodes = cspNodes.filter(node => !node.parent().length);
        nsNodes.forEach(ns => {
          topLevelCspNodes.forEach(csp => {
            constraints.push({ left: ns.id(), right: csp.id(), gap: 120 });
          });
        });
      }
      
      if (constraints.length) {
        options.relativePlacementConstraint = constraints;
      }
    }
  } else {
    options = { ...GRAPH_CONFIG.layout, name: layoutName };
  }
  
  const layout = cy.layout(options);
  
  // Reformat compound node labels after layout completes
  layout.on('layoutstop', () => {
    reformatCompoundNodeLabels();
  });
  
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

  // If this node is already highlighted, hide faded elements and re-layout
  if (node.hasClass('highlighted')) {
    // Hide all faded elements (make them invisible)
    cy.elements('.faded').addClass('hidden');
    // Re-run layout on visible elements only
    const visibleElements = cy.elements().not('.hidden');
    visibleElements.layout({
      ...GRAPH_CONFIG.layout,
      fit: true,
      padding: 50
    }).run();
    return;
  }

  // Helper: Filter out container/hierarchy compound nodes to avoid selecting all children
  // These nodes have many children that shouldn't be auto-included in focus
  const filterContainerNodes = (nodes) => {
    return nodes.filter(n => {
      const type = n.data('type');
      // Exclude namespace, cspRoot, csp, region - these are container nodes
      return !['namespace', 'cspRoot', 'csp', 'region'].includes(type);
    });
  };

  // Get neighborhood (connected elements), excluding invisible edges
  const visibleEdges = node.connectedEdges().filter(edge => !edge.data('invisible'));
  const visibleNeighborNodes = visibleEdges.connectedNodes();
  const neighborhood = node.union(visibleEdges).union(visibleNeighborNodes);
  
  // Also include parent and children for compound nodes
  const parents = node.ancestors();
  const children = node.descendants();
  
  // Get ancestors of all neighbor nodes (to show VNets when Subnets are connected)
  const neighborAncestors = visibleNeighborNodes.ancestors();
  
  // Get descendants of neighbor nodes, but exclude container nodes
  // to avoid selecting all nodes in the graph
  const filteredNeighbors = filterContainerNodes(visibleNeighborNodes);
  const neighborDescendants = filteredNeighbors.descendants();
  
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
  
  // Get descendants of parent's neighbors, but filter out container nodes
  const filteredParentNeighbors = filterContainerNodes(parentNeighbors.nodes());
  const parentNeighborDescendants = filteredParentNeighbors.descendants();
  
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
  
  // Get descendants of child's neighbors, but filter out container nodes
  const filteredChildNeighbors = filterContainerNodes(childNeighbors.nodes());
  const childNeighborDescendants = filteredChildNeighbors.descendants();
  
  // Combine all related elements
  const related = neighborhood
    .union(parents)
    .union(children)
    .union(neighborAncestors)
    .union(neighborDescendants)
    .union(parentNeighbors)
    .union(parentNeighborAncestors)
    .union(parentNeighborDescendants)
    .union(childNeighbors)
    .union(childNeighborAncestors)
    .union(childNeighborDescendants);

  // Get all edges connected to related nodes (for proper edge fading)
  // Exclude invisible edges from display
  const relatedNodes = related.nodes();
  const allRelatedEdges = relatedNodes.connectedEdges().filter(edge => {
    // Exclude invisible edges
    if (edge.data('invisible')) return false;
    // Only include edges where BOTH source and target are in related nodes
    const source = edge.source();
    const target = edge.target();
    return relatedNodes.contains(source) && relatedNodes.contains(target);
  });

  // Fade all elements first
  cy.elements().addClass('faded');
  cy.elements().removeClass('highlighted').removeClass('highlighted-edge');
  
  // Highlight related elements
  related.removeClass('faded');
  allRelatedEdges.removeClass('faded');
  node.removeClass('faded').addClass('highlighted');
  
  // Highlight edges connected to the selected node, its descendants, and parent (consolidated edges)
  // Collect parent visible edges for consolidated edge highlighting
  let parentVisibleEdges = cy.collection();
  parents.forEach(parent => {
    parentVisibleEdges = parentVisibleEdges.union(
      parent.connectedEdges().filter(edge => !edge.data('invisible'))
    );
  });
  
  // Highlight primary edges (directly connected to selected node or its hierarchy)
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

  // Remove all focus-related classes from all elements
  cy.elements().removeClass('faded highlighted highlighted-edge hidden');
  
  // Fit view with padding
  cy.fit(undefined, 30);
  
  console.debug('[ResourceGraph] Focus reset');
}

// ============================================================================
// NODE INFORMATION DISPLAY
// ============================================================================

/**
 * Show detailed information for a node
 * Uses JSONFormatter for rich JSON viewing when available
 * @param {Object} node - Cytoscape node object
 */
function showNodeInfo(node) {
  try {
    const data = node.data();
    const originalData = data.originalData || {};
    const type = data.type || 'unknown';
    const label = data.label || data.id || 'Unknown';

    console.log('[ResourceGraph] showNodeInfo called for:', type, label);

    // Build summary content for quick overview
    let summaryContent = buildSummaryContent(type, originalData, data);

    // Check if JSONFormatter is available for full details view
    const hasJsonFormatter = typeof JSONFormatter !== 'undefined';

    // Extract display name from label (remove emoji prefix if present)
    const displayName = label.replace(/^[^\s]+\s/, '') || label;

    if (Swal) {
      Swal.fire({
        title: `${getTypeEmoji(type)} ${displayName}`,
        html: `<div style="text-align: left; padding: 15px; color: #e0e0e0;">${summaryContent}</div>`,
        background: "#0e1746",
        color: "#fff",
        confirmButtonText: 'Close',
        showDenyButton: hasJsonFormatter && Object.keys(originalData).length > 0,
        denyButtonText: '📋 Full JSON',
        denyButtonColor: '#6c757d',
        showCancelButton: true,
        cancelButtonText: '🎯 Focus Related',
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#28a745',
        width: '500px'
      }).then((result) => {
        if (result.dismiss === Swal.DismissReason.cancel) {
          focusOnNeighbors(node);
        } else if (result.isDenied) {
          showFullJsonDetails(type, originalData, data);
        }
      });
    } else {
      console.warn('[ResourceGraph] Swal not available for showNodeInfo');
      alert(`${type}: ${displayName}\n\n${JSON.stringify(originalData, null, 2).substring(0, 500)}`);
    }
  } catch (error) {
    console.error('[ResourceGraph] Error in showNodeInfo:', error);
  }
}

/**
 * Build summary HTML content for a node based on its type
 */
function buildSummaryContent(type, originalData, data) {
  switch (type) {
    case 'vm':
      return `
        <div style="text-align: left;">
          <p><strong>Name:</strong> ${originalData.name || 'N/A'}</p>
          <p><strong>ID:</strong> ${originalData.id || 'N/A'}</p>
          <p><strong>Status:</strong> <span style="color: ${getStatusColor(originalData.status)}">${originalData.status || 'N/A'}</span></p>
          <p><strong>Public IP:</strong> ${originalData.publicIP || 'N/A'}</p>
          <p><strong>Private IP:</strong> ${originalData.privateIP || 'N/A'}</p>
          <p><strong>Region:</strong> ${originalData.region?.Region || 'N/A'}</p>
          <p><strong>Zone:</strong> ${originalData.region?.Zone || 'N/A'}</p>
          <p><strong>Spec:</strong> ${originalData.cspSpecName || originalData.specId || 'N/A'}</p>
          <p><strong>Connection:</strong> ${originalData.connectionName || 'N/A'}</p>
        </div>
      `;

    case 'mci':
      return `
        <div style="text-align: left;">
          <p><strong>Name:</strong> ${originalData.name || 'N/A'}</p>
          <p><strong>ID:</strong> ${originalData.id || 'N/A'}</p>
          <p><strong>Status:</strong> <span style="color: ${getStatusColor(originalData.status)}">${originalData.status || 'N/A'}</span></p>
          <p><strong>VMs:</strong> ${originalData.vm?.length || 0}</p>
          <p><strong>Description:</strong> ${originalData.description || 'N/A'}</p>
          <p><strong>Install Mon Agent:</strong> ${originalData.installMonAgent || 'N/A'}</p>
        </div>
      `;

    case 'vnet':
      return `
        <div style="text-align: left;">
          <p><strong>Name:</strong> ${originalData.name || 'N/A'}</p>
          <p><strong>ID:</strong> ${originalData.id || 'N/A'}</p>
          <p><strong>CIDR Block:</strong> ${originalData.cidrBlock || 'N/A'}</p>
          <p><strong>Subnets:</strong> ${originalData.subnetInfoList?.length || 0}</p>
          <p><strong>Connection:</strong> ${originalData.connectionName || 'N/A'}</p>
          <p><strong>CSP Resource ID:</strong> ${originalData.cspResourceId || 'N/A'}</p>
        </div>
      `;

    case 'subnet':
      return `
        <div style="text-align: left;">
          <p><strong>Name:</strong> ${originalData.name || 'N/A'}</p>
          <p><strong>ID:</strong> ${originalData.id || 'N/A'}</p>
          <p><strong>IPv4 CIDR:</strong> ${originalData.ipv4CIDR || 'N/A'}</p>
          <p><strong>Zone:</strong> ${originalData.zone || 'N/A'}</p>
          <p><strong>CSP Resource ID:</strong> ${originalData.cspResourceId || 'N/A'}</p>
        </div>
      `;

    case 'securityGroup':
      const rulesCount = originalData.firewallRules?.length || 0;
      return `
        <div style="text-align: left;">
          <p><strong>Name:</strong> ${originalData.name || 'N/A'}</p>
          <p><strong>ID:</strong> ${originalData.id || 'N/A'}</p>
          <p><strong>VNet ID:</strong> ${originalData.vNetId || 'N/A'}</p>
          <p><strong>Firewall Rules:</strong> ${rulesCount}</p>
          <p><strong>Connection:</strong> ${originalData.connectionName || 'N/A'}</p>
          <p><strong>CSP Resource ID:</strong> ${originalData.cspResourceId || 'N/A'}</p>
        </div>
      `;

    case 'sshKey':
      return `
        <div style="text-align: left;">
          <p><strong>Name:</strong> ${originalData.name || 'N/A'}</p>
          <p><strong>ID:</strong> ${originalData.id || 'N/A'}</p>
          <p><strong>Username:</strong> ${originalData.username || 'N/A'}</p>
          <p><strong>Fingerprint:</strong> ${originalData.fingerprint || 'N/A'}</p>
          <p><strong>Connection:</strong> ${originalData.connectionName || 'N/A'}</p>
          <p><strong>CSP Resource ID:</strong> ${originalData.cspResourceId || 'N/A'}</p>
        </div>
      `;

    case 'dataDisk':
      return `
        <div style="text-align: left;">
          <p><strong>Name:</strong> ${originalData.name || 'N/A'}</p>
          <p><strong>ID:</strong> ${originalData.id || 'N/A'}</p>
          <p><strong>Size (GB):</strong> ${originalData.diskSize || 'N/A'}</p>
          <p><strong>Type:</strong> ${originalData.diskType || 'N/A'}</p>
          <p><strong>Status:</strong> ${originalData.status || 'N/A'}</p>
          <p><strong>Connection:</strong> ${originalData.connectionName || 'N/A'}</p>
        </div>
      `;

    case 'subgroup':
      return `
        <div style="text-align: left;">
          <p><strong>Name:</strong> ${originalData.name || data.label || 'N/A'}</p>
          <p><strong>ID:</strong> ${originalData.id || data.id || 'N/A'}</p>
          <p><strong>VMs:</strong> ${originalData.vmCount || 'N/A'}</p>
        </div>
      `;

    case 'namespace':
      return `
        <div style="text-align: left;">
          <p><strong>Name:</strong> ${originalData.name || data.label || 'N/A'}</p>
          <p><strong>ID:</strong> ${originalData.id || data.id || 'N/A'}</p>
          <p><strong>Description:</strong> ${originalData.description || 'N/A'}</p>
        </div>
      `;

    default:
      return `
        <div style="text-align: left;">
          <p><strong>Type:</strong> ${type}</p>
          <p><strong>ID:</strong> ${originalData.id || data.id || 'N/A'}</p>
          <p><strong>Name:</strong> ${originalData.name || data.label || 'N/A'}</p>
        </div>
      `;
  }
}

/**
 * Show full JSON details using JSONFormatter
 * Styled similar to index.js Get Status popup
 */
function showFullJsonDetails(type, originalData, data) {
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

  const title = `${getTypeEmoji(type)} ${originalData.name || originalData.id || data.label || 'Details'}`;

  if (typeof JSONFormatter === 'undefined') {
    // Fallback to plain JSON with dark style
    Swal.fire({
      title: title,
      html: `<div id="json-output" class="form-control" style="height: auto; background-color: black; text-align: left; padding: 10px; overflow: auto; max-height: 400px;">
        <pre style="color: #fff; margin: 0; white-space: pre-wrap; word-break: break-all;">${JSON.stringify(originalData, null, 2)}</pre>
      </div>`,
      background: "#0e1746",
      width: '50%',
      showCloseButton: true,
      showConfirmButton: true,
      confirmButtonText: 'Close'
    });
    return;
  }

  Swal.fire({
    title: title,
    html: '<div id="resource-json-output" class="form-control" style="height: auto; background-color: black; text-align: left; padding: 10px; overflow: auto; max-height: 400px;"></div>',
    background: "#0e1746",
    width: '50%',
    showCloseButton: true,
    showConfirmButton: true,
    confirmButtonText: 'Close',
    didOpen: () => {
      setTimeout(() => {
        const container = document.getElementById('resource-json-output');
        if (container) {
          const formatter = new JSONFormatter(originalData, 2, jsonOutputConfig);
          const renderedElement = formatter.render();
          container.appendChild(renderedElement);

          // Remove quotes from string values
          setTimeout(() => {
            const stringElements = container.querySelectorAll('.json-formatter-string');
            stringElements.forEach(element => {
              if (element.textContent.startsWith('"') && element.textContent.endsWith('"')) {
                element.textContent = element.textContent.slice(1, -1);
              }
            });
          }, 100);

          // Apply custom styles for JSONFormatter value strings
          const existingStyle = document.getElementById('resource-graph-json-style');
          if (!existingStyle) {
            const style = document.createElement('style');
            style.id = 'resource-graph-json-style';
            style.textContent = `
              #resource-json-output .json-formatter-string {
                word-wrap: break-word !important;
                overflow-wrap: break-word !important;
                white-space: pre-wrap !important;
                word-break: break-all !important;
                max-width: 100% !important;
              }
              #resource-json-output .json-formatter-row .json-formatter-string {
                word-wrap: break-word !important;
                overflow-wrap: break-word !important;
                white-space: pre-wrap !important;
                word-break: break-all !important;
              }
            `;
            document.head.appendChild(style);
          }
        }
      }, 50);
    }
  });
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
    image: '🖼️'
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
    if (Swal) {
      Swal.fire({
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
    if (Swal) {
      Swal.fire({
        title: 'Copied!',
        text: text,
        icon: 'success',
        timer: 1500,
        showConfirmButton: false
      });
    }
  }).catch(err => {
    console.error('[ResourceGraph] Failed to copy:', err);
    if (Swal) {
      Swal.fire({
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
// CSP VISIBILITY TOGGLE
// ============================================================================

/**
 * Toggle CSP/Region/Zone nodes visibility
 * @returns {boolean} - New visibility state
 */
/**
 * Toggle visibility of a specific node type
 * @param {string} nodeType - The node type to toggle (e.g., 'csp', 'region', 'spec', 'image')
 * @returns {boolean} - New visibility state
 */
export function toggleNodeType(nodeType) {
  if (!(nodeType in nodeTypeVisibility)) {
    console.warn(`[ResourceGraph] Unknown node type: ${nodeType}`);
    return { state: false, affectedTypes: [] };
  }
  
  const newState = !nodeTypeVisibility[nodeType];
  nodeTypeVisibility[nodeType] = newState;
  
  const affectedTypes = [nodeType];
  
  if (newState) {
    // Enabling: also enable all parent dependencies
    const parents = nodeTypeDependencies[nodeType] || [];
    parents.forEach(parent => {
      if (!nodeTypeVisibility[parent]) {
        nodeTypeVisibility[parent] = true;
        affectedTypes.push(parent);
      }
    });
  } else {
    // Disabling: also disable all children
    const children = nodeTypeChildren[nodeType] || [];
    children.forEach(child => {
      if (nodeTypeVisibility[child]) {
        nodeTypeVisibility[child] = false;
        affectedTypes.push(child);
      }
    });
  }
  
  console.log(`[ResourceGraph] ${nodeType} visibility: ${newState ? 'ON' : 'OFF'}${affectedTypes.length > 1 ? ` (also affected: ${affectedTypes.slice(1).join(', ')})` : ''}`);
  
  // Force graph refresh with new setting
  lastDataHash = null;  // Reset hash to force update
  
  // Trigger update if we have data
  const centralData = window.cloudBaristaCentralData;
  if (centralData && centralData.mciData && currentNamespace) {
    updateGraph(centralData.mciData, currentNamespace, true, centralData);
  }
  
  // Return both the new state and affected types for UI update
  return { state: nodeTypeVisibility[nodeType], affectedTypes };
}

/**
 * Get visibility state of a specific node type
 * @param {string} nodeType - The node type to check
 * @returns {boolean} - Current visibility state
 */
export function getNodeTypeVisibility(nodeType) {
  return nodeTypeVisibility[nodeType] || false;
}

/**
 * Get all node type visibility states
 * @returns {Object} - Copy of nodeTypeVisibility object
 */
export function getAllNodeTypeVisibility() {
  return { ...nodeTypeVisibility };
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
  subscribeToUpdates: subscribeToUpdates,
  toggleNodeType: toggleNodeType,
  getNodeTypeVisibility: getNodeTypeVisibility,
  getAllNodeTypeVisibility: getAllNodeTypeVisibility
};

// Auto-subscribe when module loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', subscribeToUpdates);
} else {
  subscribeToUpdates();
}

console.log('[ResourceGraph] Module loaded');
