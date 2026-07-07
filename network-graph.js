/**
 * Network Graph Module for CB-MapUI
 *
 * Network-focused topology view of an Infra: how VM nodes are placed inside
 * vNets/Subnets across CSPs, and how traffic can reach them.
 *
 * Visual grammar:
 * - Containment: connection ⊃ vNet ⊃ subnet ⊃ VM (compound nodes)
 * - IPs are chip nodes attached inside each VM (public/private)
 * - Security Groups are NOT drawn as resource nodes; instead their in/outbound
 *   rules are shown as rule chips attached to the scope they apply to —
 *   the whole vNet, a subnet, or an individual VM (auto-detected: the widest
 *   scope where every VM shares the same SG set).
 * - Traffic edges: Internet → public-IP chip, bastion ⤍ VM (ssh path)
 *
 * @author Cloud-Barista
 * @license Apache-2.0
 */

import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import Swal from 'sweetalert2';

cytoscape.use(fcose);

// ============================================================================
// CONFIGURATION
// ============================================================================

const NET_COLORS = {
  internet: '#2c3e50',
  cbtb: '#6f42c1',
  node: '#28a745',
  nodeFailed: '#dc3545',
  nodeStopped: '#6c757d',
  nodeCreating: '#17a2b8',
  bastionBorder: '#e83e8c',
  publicEdge: '#1e90ff',
  bastionEdge: '#e83e8c',
  cmdEdge: '#6f42c1',
  flow: '#ff6b35', // active command flow (matches the map view's Handling color)
};

// Display toggles (all user-toggleable from the legend)
const netOptions = {
  sg: true,        // show SG rule chips (in/outbound summaries per scope)
  publicIp: false, // show Internet node + public-IP edges (default off: dense)
  bastion: true,   // show bastion SSH-path edges (private IP to private IP)
  cbtb: true,      // show CB-TB command path (SSH to the bastion's public IP)
  ipLabels: true,  // show IP chips inside VM nodes
};

// ============================================================================
// MODULE STATE
// ============================================================================

let netCy = null;
let isVisible = false;
let isSubscribed = false;
let selectedInfraId = 'all';
let lastBuildKey = '';

// ============================================================================
// HELPERS
// ============================================================================

function esc(v) {
  const div = document.createElement('div');
  div.textContent = v == null ? '' : String(v);
  return div.innerHTML;
}

function nodeStatusColor(status) {
  const s = (status || '').toLowerCase();
  if (s.includes('running')) return NET_COLORS.node;
  if (s.includes('failed') || s.includes('undefined')) return NET_COLORS.nodeFailed;
  if (s.includes('creating') || s.includes('resuming') || s.includes('rebooting')) return NET_COLORS.nodeCreating;
  return NET_COLORS.nodeStopped;
}

/**
 * Merges the firewall rules of a set of SGs into an in/outbound summary.
 * Returns { label, inWide, rules } where label is a 2-line chip text like
 * "⬇ in: 22, 80, 443 ⚠\n⬆ out: all" and rules keeps per-rule detail for the
 * click-through panel.
 */
function mergeSgRules(sgs) {
  const inPorts = [];
  const outPorts = [];
  let inWide = false;
  let outAll = false;
  const rules = [];

  sgs.forEach((sg) => {
    (sg.firewallRules || []).forEach((r) => {
      const dir = (r.Direction || r.direction || '').toLowerCase();
      const proto = (r.Protocol || r.protocol || '').toUpperCase();
      const port = String(r.Port || r.port || '');
      const cidr = r.CIDR || r.cidr || '';
      rules.push({ sgId: sg.id, dir, proto, port, cidr });
      const label = proto === 'ICMP' ? 'icmp' : (port || (proto === 'ALL' ? 'all' : ''));
      if (!label) return;
      if (dir === 'inbound') {
        if (!inPorts.includes(label)) inPorts.push(label);
        if (label === '1-65535' || label === 'all' || proto === 'ALL') inWide = true;
      } else if (dir === 'outbound') {
        if (label === '1-65535' || label === 'all' || proto === 'ALL') outAll = true;
        else if (!outPorts.includes(label)) outPorts.push(label);
      }
    });
  });

  let inText = inPorts.slice(0, 4).join(', ');
  if (inPorts.length > 4) inText += ` +${inPorts.length - 4}`;
  if (!inText) inText = 'none';
  const outText = outAll ? 'all' : (outPorts.slice(0, 3).join(', ') || 'none');

  return {
    label: `⬇ in: ${inText}${inWide ? ' ⚠' : ''}\n⬆ out: ${outText}`,
    inWide,
    rules,
  };
}

// ============================================================================
// GRAPH DATA BUILD
// ============================================================================

/**
 * Converts central data into cytoscape elements for the network view.
 *
 * The view is network-resource-driven: vNets/Subnets are drawn even when no
 * VM node exists yet (base network skeleton); nodes populate into them as
 * they are created. With a specific Infra selected, only the network
 * resources that infra actually uses are shown.
 *
 * SG rules are attached as rule chips at the widest uniform scope:
 * vNet (all VMs share the same SG set) → subnet → individual VM.
 */
function buildElements(centralData) {
  const infraList = centralData.infraData || [];
  const vNetList = centralData.vNet || [];
  const sgList = centralData.securityGroup || [];

  const vNetMap = new Map();
  vNetList.forEach((v) => vNetMap.set(v.id, v));
  const sgMap = new Map();
  sgList.forEach((s) => sgMap.set(s.id, s));

  const elements = [];
  const added = new Set();
  const addOnce = (el) => {
    if (added.has(el.data.id)) return;
    added.add(el.data.id);
    elements.push(el);
  };

  // Collect displayed VM nodes
  const vmEntries = []; // {infraId, node, vnetId, subnetId, conn, vmId}
  infraList.forEach((infra) => {
    if (selectedInfraId !== 'all' && infra.id !== selectedInfraId) return;
    (infra.node || []).forEach((n) => {
      const vnetInfo = vNetMap.get(n.vNetId);
      vmEntries.push({
        infraId: infra.id,
        node: n,
        vnetId: n.vNetId || '',
        subnetId: n.subnetId || '',
        conn: (vnetInfo && vnetInfo.connectionName) || n.connectionName || 'unknown',
        vmId: `ng-vm-${infra.id}-${n.id}`,
      });
    });
  });

  const connOf = (v) => v.connectionName || 'unknown';
  const vnetElId = (conn, id) => `ng-vnet-${conn}-${id}`;
  const subnetElId = (conn, vnetId, id) => `ng-subnet-${conn}-${vnetId}-${id}`;

  // Skeleton scope: All Infras → every vNet; specific infra → only used vNets
  let skeletonVNets;
  if (selectedInfraId === 'all') {
    skeletonVNets = vNetList;
  } else {
    const usedVNetIds = new Set(vmEntries.map((e) => e.vnetId).filter(Boolean));
    skeletonVNets = vNetList.filter((v) => usedVNetIds.has(v.id));
  }

  // ── Skeleton: connection ⊃ vNet ⊃ all subnets ──
  skeletonVNets.forEach((vnet) => {
    const conn = connOf(vnet);
    const connId = `ng-conn-${conn}`;
    addOnce({ data: { id: connId, type: 'conn', label: `☁ ${conn}` } });
    const cidr = vnet.cidrBlock || '';
    addOnce({
      data: {
        id: vnetElId(conn, vnet.id), type: 'vnet', parent: connId,
        label: `vNet ${vnet.id}${cidr ? '\n' + cidr : ''}`, raw: vnet,
      },
    });
    (vnet.subnetInfoList || []).forEach((subnet) => {
      const scidr = subnet.ipv4_CIDR || '';
      addOnce({
        data: {
          id: subnetElId(conn, vnet.id, subnet.id), type: 'subnet',
          parent: vnetElId(conn, vnet.id),
          label: `subnet ${subnet.id}${scidr ? '\n' + scidr : ''}`, raw: subnet,
        },
      });
    });
  });

  let hasPublic = false;

  // ── VM nodes placed into the skeleton ──
  vmEntries.forEach((e) => {
    const n = e.node;
    const connId = `ng-conn-${e.conn}`;
    addOnce({ data: { id: connId, type: 'conn', label: `☁ ${e.conn}` } });

    let parentId = connId;
    const vnet = vNetMap.get(e.vnetId);
    if (e.vnetId) {
      const vId = vnetElId(e.conn, e.vnetId);
      if (!added.has(vId)) {
        addOnce({
          data: { id: vId, type: 'vnet', parent: connId, label: `vNet ${e.vnetId}`, raw: vnet || { id: e.vnetId } },
        });
      }
      parentId = vId;
      if (e.subnetId) {
        const sId = subnetElId(e.conn, e.vnetId, e.subnetId);
        if (!added.has(sId)) {
          const subnet = ((vnet && vnet.subnetInfoList) || []).find((s) => s.id === e.subnetId);
          addOnce({
            data: { id: sId, type: 'subnet', parent: parentId, label: `subnet ${e.subnetId}`, raw: subnet || { id: e.subnetId } },
          });
        }
        parentId = sId;
      }
    }

    // Bastion check: subnet.bastionNodes lists {infraId, nodeId}
    let isBastion = false;
    if (vnet && vnet.subnetInfoList) {
      vnet.subnetInfoList.forEach((s) => {
        (s.bastionNodes || []).forEach((b) => {
          if (b.infraId === e.infraId && b.nodeId === n.id) isBastion = true;
        });
      });
    }
    e.isBastion = isBastion;

    // Active remote-command state (same source the map view uses):
    // marks the node label and animates the command-path edges below.
    const cmdStatuses = Array.isArray(n.commandStatus) ? n.commandStatus : [];
    e.cmdHandling = cmdStatuses.some((c) => c.status === 'Handling');
    const cmdQueued = cmdStatuses.some((c) => c.status === 'Queued');
    const cmdMark = e.cmdHandling ? '⚡ ' : (cmdQueued ? '⏳ ' : '');

    addOnce({
      data: {
        id: e.vmId, type: 'vm', parent: parentId,
        label: `${isBastion ? '◆ ' : ''}${cmdMark}${n.id}`,
        statusColor: nodeStatusColor(n.status),
        isBastion, infraId: e.infraId, raw: n,
      },
    });

    // IP chips inside the VM
    if (netOptions.ipLabels) {
      if (n.publicIP) {
        addOnce({
          data: {
            id: `ng-ippub-${e.vmId}`, type: 'ipPub', parent: e.vmId,
            label: `🌐 ${n.publicIP}`, chipOrder: 0, raw: n,
          },
        });
      }
      if (n.privateIP) {
        addOnce({
          data: {
            id: `ng-ippriv-${e.vmId}`, type: 'ipPriv', parent: e.vmId,
            label: `🔒 ${n.privateIP}`, chipOrder: 1, raw: n,
          },
        });
      }
    }

    // Internet edge lands on the public-IP chip when chips are shown
    if (netOptions.publicIp && n.publicIP) {
      hasPublic = true;
      const target = netOptions.ipLabels ? `ng-ippub-${e.vmId}` : e.vmId;
      addOnce({
        data: { id: `ng-pub-${e.vmId}`, source: 'ng-internet', target, type: 'public' },
      });
    }
  });

  // ── SG rule chips at the widest uniform scope ──
  if (netOptions.sg) {
    const sgSetKey = (n) => (n.securityGroupIds || []).slice().sort().join(',');
    const sgsOf = (n) => (n.securityGroupIds || []).map((id) => sgMap.get(id) || { id, firewallRules: [] });

    const addRuleChip = (chipId, parentId, sgs, scopeText) => {
      if (!added.has(parentId) || sgs.length === 0) return;
      const merged = mergeSgRules(sgs);
      addOnce({
        data: {
          id: chipId, type: 'rules', parent: parentId,
          label: merged.label, wideOpen: merged.inWide,
          sgIds: sgs.map((s) => s.id), rules: merged.rules, scopeText,
        },
      });
    };

    // Group displayed VMs by vNet element
    const byVnetEl = new Map();
    vmEntries.forEach((e) => {
      if (!e.vnetId) return;
      const key = vnetElId(e.conn, e.vnetId);
      if (!byVnetEl.has(key)) byVnetEl.set(key, []);
      byVnetEl.get(key).push(e);
    });

    byVnetEl.forEach((entries, vnetEl) => {
      const keys = new Set(entries.map((e) => sgSetKey(e.node)));
      if (keys.size === 1 && !keys.has('')) {
        // Every VM in this vNet shares the same SG set → one chip on the vNet
        addRuleChip(`ng-rules-${vnetEl}`, vnetEl, sgsOf(entries[0].node),
          `all nodes in this vNet (${entries.length})`);
        return;
      }
      // Otherwise try per-subnet uniformity, falling back to per-VM chips
      const bySubnet = new Map();
      entries.forEach((e) => {
        const key = e.subnetId ? subnetElId(e.conn, e.vnetId, e.subnetId) : `vm:${e.vmId}`;
        if (!bySubnet.has(key)) bySubnet.set(key, []);
        bySubnet.get(key).push(e);
      });
      bySubnet.forEach((subEntries, subKey) => {
        const subKeys = new Set(subEntries.map((e) => sgSetKey(e.node)));
        if (!subKey.startsWith('vm:') && subKeys.size === 1 && !subKeys.has('')) {
          addRuleChip(`ng-rules-${subKey}`, subKey, sgsOf(subEntries[0].node),
            `all nodes in this subnet (${subEntries.length})`);
        } else {
          subEntries.forEach((e) => {
            if (!sgSetKey(e.node)) return;
            addRuleChip(`ng-rules-${e.vmId}`, e.vmId, sgsOf(e.node), `node ${e.node.id}`);
          });
        }
      });
    });

    // Per-VM chips for VMs without a vNet reference
    vmEntries.filter((e) => !e.vnetId).forEach((e) => {
      if (!sgSetKey(e.node)) return;
      addRuleChip(`ng-rules-${e.vmId}`, e.vmId, sgsOf(e.node), `node ${e.node.id}`);
    });

    // Skeleton vNets without any displayed VM: show the rules its SGs define
    skeletonVNets.forEach((vnet) => {
      const vnetEl = vnetElId(connOf(vnet), vnet.id);
      if (added.has(`ng-rules-${vnetEl}`)) return;
      const hasVm = byVnetEl.has(vnetEl);
      if (hasVm) return;
      const sgs = sgList.filter((s) => s.vNetId === vnet.id);
      addRuleChip(`ng-rules-${vnetEl}`, vnetEl, sgs, 'security groups of this vNet');
    });
  }

  // Internet pseudo-node (only when a public edge exists)
  if (netOptions.publicIp && hasPublic) {
    addOnce({ data: { id: 'ng-internet', type: 'internet', label: '🌐 Internet' } });
  }

  // Bastion SSH paths + CB-TB command path (independently toggleable).
  // CB-Tumblebug delivers remote commands over SSH to the bastion's PUBLIC IP;
  // from the bastion, other VMs in the vNet are reached over their PRIVATE IPs.
  // Edges land on the corresponding IP chips (when shown) to make that visible.
  if (netOptions.bastion || netOptions.cbtb) {
    // Endpoint helpers: prefer the IP chip, fall back to the VM node itself
    const privEnd = (e) => (netOptions.ipLabels && e.node.privateIP ? `ng-ippriv-${e.vmId}` : e.vmId);
    const pubEnd = (e) => (netOptions.ipLabels && e.node.publicIP ? `ng-ippub-${e.vmId}` : e.vmId);

    const byVnet = new Map();
    vmEntries.forEach((e) => {
      if (!e.vnetId) return;
      const key = `${e.conn}|${e.vnetId}`;
      if (!byVnet.has(key)) byVnet.set(key, { bastions: [], members: [] });
      const entry = byVnet.get(key);
      entry.members.push(e);
      if (e.isBastion) entry.bastions.push(e);
    });

    let hasCbtb = false;
    byVnet.forEach((entry) => {
      // A command in progress anywhere in the vNet flows through its bastion
      const anyHandling = entry.members.some((m) => m.cmdHandling);
      entry.bastions.forEach((b) => {
        // CB-TB: Command → bastion's public IP (SSH entry point for remote commands)
        if (netOptions.cbtb && b.node.publicIP) {
          hasCbtb = true;
          addOnce({
            data: {
              id: `ng-cmd-${b.vmId}`, source: 'ng-cbtb', target: pubEnd(b), type: 'cmd', label: 'ssh',
              flowActive: anyHandling,
            },
          });
        }
        // Bastion → members over the private network
        if (netOptions.bastion) {
          entry.members.forEach((m) => {
            if (m.vmId === b.vmId) return;
            addOnce({
              data: {
                id: `ng-ssh-${b.vmId}-${m.vmId}`, source: privEnd(b), target: privEnd(m), type: 'ssh', label: 'ssh',
                flowActive: m.cmdHandling === true,
              },
            });
          });
        }
      });
    });

    if (hasCbtb) {
      addOnce({ data: { id: 'ng-cbtb', type: 'cbtb', label: '🔧 CB-TB: Command' } });
    }
  }

  return elements;
}

// ============================================================================
// CYTOSCAPE STYLES
// ============================================================================

const NET_STYLE = [
  {
    selector: 'node[type="conn"]',
    style: {
      shape: 'round-rectangle', 'background-color': '#eef2f7', 'background-opacity': 0.6,
      'border-width': 1.5, 'border-color': '#9fb3c8', label: 'data(label)',
      'text-valign': 'top', 'text-halign': 'center', 'font-size': 20, 'font-weight': 'bold',
      color: '#14283b', 'text-outline-color': '#ffffff', 'text-outline-width': 2.5, padding: 12,
    },
  },
  {
    selector: 'node[type="vnet"]',
    style: {
      shape: 'round-rectangle', 'background-color': '#fff8e6', 'background-opacity': 0.7,
      'border-width': 1.5, 'border-color': '#e6a700', 'border-style': 'dashed',
      label: 'data(label)', 'text-valign': 'top', 'text-halign': 'center',
      'font-size': 17, 'font-weight': 'bold', color: '#4a3800', 'text-outline-color': '#ffffff', 'text-outline-width': 2.5, padding: 9, 'text-wrap': 'wrap',
    },
  },
  {
    selector: 'node[type="subnet"]',
    style: {
      shape: 'round-rectangle', 'background-color': '#fdefd2', 'background-opacity': 0.75,
      'border-width': 1, 'border-color': '#d39e00', 'border-style': 'dotted',
      label: 'data(label)', 'text-valign': 'top', 'text-halign': 'center',
      'font-size': 16, 'font-weight': 'bold', color: '#4a3800', 'text-outline-color': '#ffffff', 'text-outline-width': 2.5, padding: 8, 'text-wrap': 'wrap',
    },
  },
  // VM as a plain node (no chips)
  {
    selector: 'node[type="vm"]:childless',
    style: {
      shape: 'round-rectangle', width: 'label', height: 'label',
      'background-color': 'data(statusColor)', 'background-opacity': 0.9,
      label: 'data(label)', 'text-wrap': 'wrap', 'text-valign': 'center', 'text-halign': 'center',
      'font-size': 16, 'font-family': 'monospace', 'font-weight': 'bold', color: '#fff',
      'text-outline-color': '#000', 'text-outline-width': 2,
      padding: 12, 'border-width': 1, 'border-color': '#1b4332',
    },
  },
  // VM as a compound holding IP / rule chips
  {
    selector: 'node[type="vm"]:parent',
    style: {
      shape: 'round-rectangle',
      'background-color': 'data(statusColor)', 'background-opacity': 0.14,
      'border-width': 2, 'border-color': 'data(statusColor)',
      label: 'data(label)', 'text-valign': 'top', 'text-halign': 'center',
      'font-size': 16, 'font-family': 'monospace', color: '#000000', 'font-weight': 'bold',
      'text-outline-color': '#ffffff', 'text-outline-width': 2.5, padding: 6,
    },
  },
  {
    selector: 'node[type="vm"][?isBastion]',
    style: { 'border-width': 3, 'border-color': NET_COLORS.bastionBorder },
  },
  // IP chips
  {
    selector: 'node[type="ipPub"]',
    style: {
      shape: 'round-rectangle', width: 178, height: 30,
      'background-color': '#ffffff', 'border-width': 1.5, 'border-color': '#1e90ff',
      label: 'data(label)', 'text-valign': 'center', 'text-halign': 'center',
      'font-size': 15, 'font-family': 'monospace', 'font-weight': 'bold', color: '#0a3d8f', padding: 6,
    },
  },
  {
    selector: 'node[type="ipPriv"]',
    style: {
      shape: 'round-rectangle', width: 178, height: 30,
      'background-color': '#ffffff', 'border-width': 1.5, 'border-color': '#868e96',
      label: 'data(label)', 'text-valign': 'center', 'text-halign': 'center',
      'font-size': 15, 'font-family': 'monospace', 'font-weight': 'bold', color: '#212529', padding: 6,
    },
  },
  // SG rule chips (in/outbound summary attached to their scope)
  {
    selector: 'node[type="rules"]',
    style: {
      shape: 'round-rectangle', width: 'label', height: 'label',
      'background-color': '#ffffff', 'border-width': 1.5, 'border-color': '#dc3545',
      label: 'data(label)', 'text-wrap': 'wrap', 'text-valign': 'center', 'text-halign': 'center',
      'font-size': 15, 'font-family': 'monospace', 'font-weight': 'bold', color: '#8b1a26', padding: 8,
    },
  },
  {
    selector: 'node[type="rules"][?wideOpen]',
    style: { 'background-color': '#ffe3e6', 'border-width': 2.5 },
  },
  {
    selector: 'node[type="internet"]',
    style: {
      shape: 'ellipse', width: 136, height: 64,
      'background-color': NET_COLORS.internet, label: 'data(label)',
      'text-valign': 'center', 'text-halign': 'center', 'font-size': 18, 'font-weight': 'bold', color: '#fff',
      'text-outline-color': '#000', 'text-outline-width': 1.5,
    },
  },
  {
    selector: 'node[type="cbtb"]',
    style: {
      shape: 'round-rectangle', width: 'label', height: 50,
      'background-color': NET_COLORS.cbtb, label: 'data(label)',
      'text-valign': 'center', 'text-halign': 'center', 'font-size': 18,
      'font-weight': 'bold', color: '#fff', 'text-outline-color': '#000', 'text-outline-width': 1.5, padding: 12,
    },
  },
  // Empty compounds (skeleton without members yet) need explicit sizes
  {
    selector: 'node[type="subnet"]:childless',
    style: { width: 200, height: 68 },
  },
  {
    selector: 'node[type="vnet"]:childless',
    style: { width: 230, height: 82 },
  },
  {
    selector: 'edge[type="public"]',
    style: {
      width: 1.6, 'line-color': NET_COLORS.publicEdge, 'target-arrow-shape': 'none',
      'curve-style': 'round-taxi', 'taxi-direction': 'downward',
      'taxi-turn': 42, 'taxi-turn-min-distance': 18,
    },
  },
  {
    selector: 'edge[type="ssh"]',
    style: {
      width: 1.4, 'line-color': NET_COLORS.bastionEdge, 'line-style': 'dashed',
      'target-arrow-shape': 'chevron', 'arrow-scale': 0.8, 'target-arrow-color': NET_COLORS.bastionEdge,
      'curve-style': 'round-taxi', 'taxi-direction': 'horizontal',
      'taxi-turn': 30, 'taxi-turn-min-distance': 12,
      label: 'data(label)', 'font-size': 14, 'font-weight': 'bold', color: NET_COLORS.bastionEdge,
      'text-background-color': '#ffffff', 'text-background-opacity': 0.8, 'text-background-padding': 1,
    },
  },
  {
    selector: 'edge[type="cmd"]',
    style: {
      width: 1.8, 'line-color': NET_COLORS.cmdEdge, 'line-style': 'dashed',
      'target-arrow-shape': 'chevron', 'arrow-scale': 0.9, 'target-arrow-color': NET_COLORS.cmdEdge,
      'curve-style': 'round-taxi', 'taxi-direction': 'downward',
      'taxi-turn': 42, 'taxi-turn-min-distance': 18,
      label: 'data(label)', 'font-size': 14, 'font-weight': 'bold', color: NET_COLORS.cmdEdge,
      'text-background-color': '#ffffff', 'text-background-opacity': 0.8, 'text-background-padding': 1,
    },
  },
  // A remote command is currently flowing over this edge: highlighted dashed
  // line whose dash offset is animated by the flow timer ("marching ants").
  {
    selector: 'edge[?flowActive]',
    style: {
      width: 3.2, 'line-style': 'dashed', 'line-dash-pattern': [12, 7],
      'line-color': NET_COLORS.flow, 'target-arrow-color': NET_COLORS.flow,
      color: NET_COLORS.flow, opacity: 1, 'z-index': 999, label: '⚡ cmd',
    },
  },
];

function initNetworkGraph() {
  const container = document.getElementById('network-graph-canvas');
  if (!container) return;
  netCy = cytoscape({
    container,
    elements: [],
    style: NET_STYLE,
    wheelSensitivity: 0.2,
  });
  netCy.on('tap', 'node', (evt) => showDetail(evt.target));
}

// ============================================================================
// STRUCTURED DIAGRAM LAYOUT
// ============================================================================
// Deterministic grid placement matching the fixed hierarchy
// (connection ⊃ vNet ⊃ subnet ⊃ VM ⊃ chips), like a cloud architecture
// diagram: VMs align in grids inside subnets, subnets sit side by side inside
// a vNet, rule chips dock to the bottom of their scope, connection blocks
// flow left→right with wrapping, and the Internet node is pinned top-center.

const DIAG = {
  vmCols: 3,
  chipH: 36,
  sgCellW: 300, sgRowH: 76,
  emptySubnetW: 230, emptySubnetH: 96,
  blockGap: 22,
  padX: 24, padTop: 46, padBottom: 16,
  connGap: 46,
  internetGapY: 110,
};

// VM cell size depends on which chips are currently displayed
function vmCellSize() {
  const chips = (netOptions.ipLabels ? 2 : 0);
  return { w: 240, h: 70 + chips * (DIAG.chipH + 3) + (netOptions.sg ? 42 : 0) };
}

function runNetLayout() {
  if (!netCy) return;
  const cell = vmCellSize();

  const conns = netCy.nodes('[type="conn"]').sort((a, b) => a.id().localeCompare(b.id()));

  // ── Pass 1: measure block sizes bottom-up ──
  const measureSubnet = (subnet) => {
    const vms = subnet.children('[type="vm"]');
    const hasRules = subnet.children('[type="rules"]').length > 0;
    if (vms.length === 0) {
      return { w: DIAG.emptySubnetW, h: DIAG.emptySubnetH + (hasRules ? DIAG.sgRowH : 0) };
    }
    const cols = Math.min(DIAG.vmCols, vms.length);
    const rows = Math.ceil(vms.length / cols);
    return {
      w: cols * cell.w + DIAG.padX * 2,
      h: rows * cell.h + DIAG.padTop + DIAG.padBottom + (hasRules ? DIAG.sgRowH : 0),
    };
  };

  const measureVnet = (vnet) => {
    const subnets = vnet.children('[type="subnet"]').sort((a, b) => a.id().localeCompare(b.id()));
    const directVms = vnet.children('[type="vm"]');
    const ruleChips = vnet.children('[type="rules"]');
    const blocks = subnets.map((s) => measureSubnet(s));
    if (directVms.length > 0) {
      const cols = Math.min(DIAG.vmCols, directVms.length);
      blocks.push({ w: cols * cell.w + DIAG.padX, h: Math.ceil(directVms.length / cols) * cell.h });
    }
    let w = blocks.reduce((acc, b) => acc + b.w, 0) + DIAG.blockGap * Math.max(0, blocks.length - 1) + DIAG.padX * 2;
    let h = (blocks.length ? Math.max(...blocks.map((b) => b.h)) : 0) + DIAG.padTop + DIAG.padBottom;
    if (ruleChips.length > 0) {
      w = Math.max(w, ruleChips.length * DIAG.sgCellW + DIAG.padX * 2);
      h += DIAG.sgRowH;
    }
    if (blocks.length === 0 && ruleChips.length === 0) { w = 200; h = 80; }
    return { w, h };
  };

  const measureConn = (conn) => {
    const vnets = conn.children('[type="vnet"]').sort((a, b) => a.id().localeCompare(b.id()));
    const looseVms = conn.children('[type="vm"]');
    const vnetSizes = vnets.map((v) => measureVnet(v));
    let w = (vnetSizes.length ? Math.max(...vnetSizes.map((s) => s.w)) : 0) + DIAG.padX * 2;
    let h = vnetSizes.reduce((acc, s) => acc + s.h, 0) + DIAG.blockGap * Math.max(0, vnetSizes.length - 1)
      + DIAG.padTop + DIAG.padBottom;
    if (looseVms.length > 0) {
      w = Math.max(w, looseVms.length * cell.w + DIAG.padX * 2);
      h += cell.h + DIAG.blockGap;
    }
    return { w, h, vnetSizes };
  };

  // ── Pass 2: assign positions top-down ──

  // Stack a VM's chips vertically inside it (the compound auto-sizes around them)
  const placeVm = (vm, cx, cy) => {
    const chips = vm.children().sort((a, b) => (a.data('chipOrder') ?? 9) - (b.data('chipOrder') ?? 9));
    if (chips.length === 0) {
      vm.position({ x: cx, y: cy });
      return;
    }
    const totalH = chips.length * (DIAG.chipH + 3);
    let y = cy - totalH / 2 + DIAG.chipH / 2 + 13; // leaves room for the VM name label on top
    chips.forEach((c) => {
      c.position({ x: cx, y });
      y += DIAG.chipH + 3;
    });
  };

  const posSubnetContent = (subnet, originX, originY, size) => {
    const vms = subnet.children('[type="vm"]').sort((a, b) => a.id().localeCompare(b.id()));
    const ruleChips = subnet.children('[type="rules"]');
    if (vms.length === 0 && ruleChips.length === 0) {
      subnet.position({ x: originX + DIAG.emptySubnetW / 2, y: originY + DIAG.emptySubnetH / 2 });
      return;
    }
    const cols = Math.min(DIAG.vmCols, Math.max(1, vms.length));
    vms.forEach((vm, i) => {
      placeVm(vm,
        originX + DIAG.padX + ((i % cols) + 0.5) * cell.w,
        originY + DIAG.padTop + (Math.floor(i / cols) + 0.5) * cell.h);
    });
    ruleChips.forEach((chip, i) => {
      chip.position({
        x: originX + size.w / 2 + i * DIAG.sgCellW,
        y: originY + size.h - DIAG.sgRowH / 2 - DIAG.padBottom / 2,
      });
    });
  };

  const posVnetContent = (vnet, originX, originY, size) => {
    const subnets = vnet.children('[type="subnet"]').sort((a, b) => a.id().localeCompare(b.id()));
    const directVms = vnet.children('[type="vm"]').sort((a, b) => a.id().localeCompare(b.id()));
    const ruleChips = vnet.children('[type="rules"]').sort((a, b) => a.id().localeCompare(b.id()));
    let x = originX + DIAG.padX;
    const yTop = originY + DIAG.padTop;
    subnets.forEach((s) => {
      const sz = measureSubnet(s);
      posSubnetContent(s, x, yTop, sz);
      x += sz.w + DIAG.blockGap;
    });
    if (directVms.length > 0) {
      const cols = Math.min(DIAG.vmCols, directVms.length);
      directVms.forEach((vm, i) => {
        placeVm(vm,
          x + ((i % cols) + 0.5) * cell.w,
          yTop + (Math.floor(i / cols) + 0.5) * cell.h);
      });
    }
    // Rule chips dock along the bottom of the vNet block
    const chipY = originY + size.h - DIAG.sgRowH / 2 - DIAG.padBottom / 2;
    ruleChips.forEach((chip, i) => {
      chip.position({ x: originX + DIAG.padX + (i + 0.5) * DIAG.sgCellW, y: chipY });
    });
  };

  // Connection blocks flow left→right (horizontal-first): a single row by
  // default; only many connections wrap into two balanced rows. fit() scales
  // the wide result, so a long row still reads better than vertical stacking.
  const connSizes = conns.map((c) => measureConn(c));
  const totalW = connSizes.reduce((acc, s) => acc + s.w, 0) + DIAG.connGap * Math.max(0, connSizes.length - 1);
  const wrapWidth = connSizes.length > 6 ? totalW / 2 + 1 : Infinity;

  let cursorX = 0;
  let cursorY = 0;
  let rowMaxH = 0;
  conns.forEach((conn, ci) => {
    const size = connSizes[ci];
    if (cursorX > 0 && cursorX + size.w > wrapWidth) {
      cursorX = 0;
      cursorY += rowMaxH + DIAG.connGap;
      rowMaxH = 0;
    }
    const vnets = conn.children('[type="vnet"]').sort((a, b) => a.id().localeCompare(b.id()));
    let vy = cursorY + DIAG.padTop;
    vnets.forEach((vnet, i) => {
      const vsize = size.vnetSizes[i];
      posVnetContent(vnet, cursorX + DIAG.padX, vy, vsize);
      vy += vsize.h + DIAG.blockGap;
    });
    // Loose VMs directly under the connection (fallback row at the bottom)
    const looseVms = conn.children('[type="vm"]').sort((a, b) => a.id().localeCompare(b.id()));
    looseVms.forEach((vm, i) => {
      placeVm(vm, cursorX + DIAG.padX + (i + 0.5) * cell.w, cursorY + size.h - cell.h / 2 - DIAG.padBottom);
    });

    cursorX += size.w + DIAG.connGap;
    rowMaxH = Math.max(rowMaxH, size.h);
  });

  // Internet pinned top-center; CB-TB: Command pinned beside it (both are
  // external entry points into the network)
  const inet = netCy.getElementById('ng-internet');
  const cbtb = netCy.getElementById('ng-cbtb');
  const pinned = inet.union(cbtb);
  if (pinned.nonempty()) {
    const bb = netCy.elements().difference(pinned).boundingBox();
    const topY = bb.y1 - DIAG.internetGapY;
    const centerX = (bb.x1 + bb.x2) / 2;
    if (inet.nonempty()) inet.position({ x: centerX, y: topY });
    if (cbtb.nonempty()) {
      cbtb.position({ x: inet.nonempty() ? centerX - 320 : centerX, y: topY });
    }
  }
  netCy.fit(undefined, 24);
}

// ============================================================================
// REFRESH / SUBSCRIPTION
// ============================================================================

function refresh(force = false) {
  if (!netCy) return;
  const centralData = window.cloudBaristaCentralData || {};
  updateInfraSelector(centralData);

  const elements = buildElements(centralData);
  const buildKey = JSON.stringify([
    selectedInfraId,
    netOptions,
    elements.map((e) => `${e.data.id}|${e.data.label || ''}|${e.data.flowActive ? 1 : 0}`),
  ]);
  if (!force && buildKey === lastBuildKey) {
    updateFlowAnimation();
    return;
  }
  lastBuildKey = buildKey;

  netCy.elements().remove();
  // Nodes must exist before edges referencing them
  const nodes = elements.filter((e) => !e.data.source);
  const edges = elements.filter((e) => e.data.source);
  netCy.add(nodes);
  netCy.add(edges);
  updateEmptyState(nodes.length > 0);
  runNetLayout();
  updateFlowAnimation();
}

// ── Command-flow animation ───────────────────────────────────────────────────
// A single timer advances the dash offset of every flow-active edge, making
// the dashes "march" from source to target (CB-TB → bastion → target node)
// while a remote command is in Handling state. Starts/stops on demand.
let flowTimer = null;
let flowOffset = 0;

function updateFlowAnimation() {
  const activeEdges = netCy ? netCy.edges('[?flowActive]') : null;
  const needed = isVisible && activeEdges && activeEdges.length > 0;
  if (needed && !flowTimer) {
    flowTimer = setInterval(() => {
      flowOffset = (flowOffset - 4) % 10000;
      netCy.edges('[?flowActive]').style('line-dash-offset', flowOffset);
    }, 90);
  } else if (!needed && flowTimer) {
    clearInterval(flowTimer);
    flowTimer = null;
  }
}

// Shows a hint overlay when there is nothing to visualize (no network
// resources and no VM nodes for the current selection).
function updateEmptyState(hasElements) {
  const container = document.getElementById('network-graph-container');
  if (!container) return;
  let overlay = document.getElementById('ng-empty-state');
  if (hasElements) {
    if (overlay) overlay.style.display = 'none';
    return;
  }
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'ng-empty-state';
    overlay.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);' +
      'text-align:center;color:#8a94a6;font-size:14px;pointer-events:none;z-index:500;';
    overlay.innerHTML = '<div style="font-size:40px;margin-bottom:10px;">🌐</div>' +
      '<div style="font-weight:600;margin-bottom:4px;">No network topology to display</div>' +
      '<div style="font-size:12px;">Network resources (vNet, Subnet, Security Group) and VM nodes<br>' +
      'will appear here as they are created (or select another Infra above).</div>';
    container.appendChild(overlay);
  }
  overlay.style.display = 'block';
}

function updateInfraSelector(centralData) {
  const sel = document.getElementById('ng-infra-select');
  if (!sel) return;
  const infras = (centralData.infraData || []).map((m) => m.id);
  const desired = ['all', ...infras];
  const existing = Array.from(sel.options).map((o) => o.value);
  if (JSON.stringify(existing) !== JSON.stringify(desired)) {
    sel.innerHTML = '';
    desired.forEach((v) => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v === 'all' ? 'All Infras' : v;
      sel.appendChild(opt);
    });
  }
  // selectedInfraId is the source of truth (it may have been set via
  // NetworkGraph.setInfra, not only via this dropdown); keep the UI in sync
  // and fall back to 'all' when the selected infra no longer exists.
  if (!desired.includes(selectedInfraId)) selectedInfraId = 'all';
  if (sel.value !== selectedInfraId) sel.value = selectedInfraId;
}

function subscribe() {
  if (isSubscribed) return;
  if (window.subscribeToDataUpdates) {
    window.subscribeToDataUpdates(() => {
      if (isVisible) refresh();
    });
    isSubscribed = true;
  } else {
    setTimeout(subscribe, 100);
  }
}

// ============================================================================
// DETAIL PANEL
// ============================================================================

function showDetail(node) {
  const type = node.data('type');

  // IP chips open their VM's detail
  if (type === 'ipPub' || type === 'ipPriv') {
    const parent = node.parent();
    if (parent.nonempty()) showDetail(parent);
    return;
  }

  const raw = node.data('raw');
  let title = '';
  let html = '';
  const row = (k, v) => (v ? `<tr><td style="color:#888;padding:2px 8px 2px 0;white-space:nowrap">${esc(k)}</td><td style="word-break:break-all">${esc(v)}</td></tr>` : '');

  if (type === 'vm' && raw) {
    title = `🖥 ${raw.id}`;
    html = `<table style="font-size:13px;text-align:left">${
      row('Status', raw.status)}${
      row('Public IP', raw.publicIP)}${
      row('Private IP', raw.privateIP)}${
      row('Connection', raw.connectionName)}${
      row('Spec', raw.specId)}${
      row('vNet / Subnet', `${raw.vNetId || '-'} / ${raw.subnetId || '-'}`)}${
      row('Security Groups', (raw.securityGroupIds || []).join(', '))}${
      row('SSH Key', raw.sshKeyId)}${
      row('Bastion', node.data('isBastion') ? 'YES (SSH entry point of this vNet)' : '')}
      </table>`;
  } else if (type === 'rules') {
    const sgIds = node.data('sgIds') || [];
    const rules = node.data('rules') || [];
    title = '🛡 Firewall Rules';
    const ruleRows = rules.map((r) =>
      `<tr><td style="padding:2px 8px 2px 0;color:#999">${esc(r.sgId)}</td>` +
      `<td style="padding:2px 8px 2px 0">${esc(r.dir)}</td>` +
      `<td style="padding:2px 8px 2px 0">${esc(r.proto)}</td>` +
      `<td style="padding:2px 8px 2px 0">${esc(r.port || '-')}</td>` +
      `<td style="word-break:break-all">${esc(r.cidr)}</td></tr>`).join('');
    html = `<div style="font-size:12px;color:#666;margin-bottom:6px;text-align:left">` +
      `Applies to: <b>${esc(node.data('scopeText') || '')}</b><br>Security Groups: ${esc(sgIds.join(', '))}</div>` +
      `<table style="font-size:12px;text-align:left;font-family:monospace">` +
      `<tr style="color:#888"><td>sg</td><td>dir</td><td>proto</td><td>port</td><td>cidr</td></tr>${ruleRows}</table>`;
  } else if (type === 'vnet' && raw) {
    title = `vNet ${raw.id}`;
    const subnets = (raw.subnetInfoList || []).map((s) => `${esc(s.id)} (${esc(s.ipv4_CIDR)})`).join('<br>');
    html = `<table style="font-size:13px;text-align:left">${
      row('CIDR', raw.cidrBlock)}${
      row('Connection', raw.connectionName)}${
      row('Status', raw.status)}
      <tr><td style="color:#888;padding:2px 8px 2px 0;vertical-align:top">Subnets</td><td>${subnets || '-'}</td></tr></table>`;
  } else if (type === 'subnet' && raw) {
    title = `Subnet ${raw.id}`;
    html = `<table style="font-size:13px;text-align:left">${
      row('CIDR', raw.ipv4_CIDR)}${
      row('Zone', raw.zone)}${
      row('Bastions', (raw.bastionNodes || []).map((b) => b.nodeId).join(', '))}
      </table>`;
  } else if (type === 'internet') {
    title = '🌐 Internet';
    html = '<div style="font-size:13px">Public entry point. Edges show nodes reachable via public IP.</div>';
  } else if (type === 'cbtb') {
    title = '🔧 CB-TB: Command';
    html = '<div style="font-size:13px;text-align:left">CB-Tumblebug delivers remote commands over SSH ' +
      'to the <b>bastion node\'s public IP</b>; the other nodes in the vNet are then reached ' +
      'from the bastion over their <b>private IPs</b>.</div>';
  } else {
    return;
  }

  Swal.fire({
    title, html, width: 560, showCloseButton: true, showConfirmButton: false,
    position: 'top-end', backdrop: false,
  });
}

// ============================================================================
// SHOW / HIDE / CONTROLS
// ============================================================================

function showNetworkGraph() {
  const container = document.getElementById('network-graph-container');
  if (!container) return;
  container.style.display = 'block';
  isVisible = true;
  if (!netCy) initNetworkGraph();
  refresh(true);
}

function hideNetworkGraph() {
  const container = document.getElementById('network-graph-container');
  if (container) container.style.display = 'none';
  isVisible = false;
  updateFlowAnimation(); // stop the flow timer while hidden
}

function toggleOption(name) {
  if (!(name in netOptions)) return;
  netOptions[name] = !netOptions[name];
  const el = document.querySelector(`#network-graph-legend [data-net-option="${name}"]`);
  if (el) el.classList.toggle('inactive', !netOptions[name]);
  refresh(true);
}

function setInfra(infraId) {
  selectedInfraId = infraId || 'all';
  refresh(true);
}

function exportPng() {
  if (!netCy) return;
  const png = netCy.png({ full: true, scale: 2, bg: '#f8f9fa' });
  const a = document.createElement('a');
  a.href = png;
  a.download = `network-graph-${selectedInfraId}.png`;
  a.click();
}

// ============================================================================
// GLOBAL EXPORTS
// ============================================================================

window.NetworkGraph = {
  show: showNetworkGraph,
  hide: hideNetworkGraph,
  refresh: () => refresh(true),
  runLayout: runNetLayout,
  toggleOption,
  setInfra,
  exportPng,
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', subscribe);
} else {
  subscribe();
}

console.log('[NetworkGraph] Module loaded');
