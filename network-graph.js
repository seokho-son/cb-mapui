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
  nlb: true,       // show NLB (regional load balancer) front-end nodes + target edges
  vpn: true,       // show site-to-site VPN tunnel nodes linking the two site connections
  mcnlb: true,     // show Global NLB (MCNLB/HAProxy) as one node fronting the target Infra's VMs
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

  // A Global NLB (MCNLB) is deployed as its own Infra named "{targetInfraId}-nlb".
  // Represent it as a single global-LB node fronting the target's VMs rather than
  // drawing its raw VM cluster, so the "Net" view stays meaningful.
  const mcnlbHosts = infraList.filter((i) =>
    String(i.id || '').endsWith('-nlb') ||
    (i.label && i.label['sys.description'] === 'Infra for Global-NLB'));
  const mcnlbHostIds = new Set(mcnlbHosts.map((i) => i.id));

  // Connections that host an active (Available) site-to-site VPN — their vNets
  // get a darker tint to signal the tunnel is up. Only when the VPN layer is on,
  // so toggling VPN off in the legend also clears the vNet tint.
  const activeVpnConns = new Set();
  if (netOptions.vpn) {
    (centralData.vpn || []).forEach((v) => {
      if (!/available/i.test(v.status || '')) return;
      (v.vpnSites || []).forEach((s) => { if (s.connectionName) activeVpnConns.add(s.connectionName); });
    });
  }

  // Front-facing load-balancer node ids the Internet node should also link to.
  const internetFacing = [];

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
    if (mcnlbHostIds.has(infra.id)) return; // drawn as a Global NLB node instead
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
        vpnActive: activeVpnConns.has(conn),
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
          data: { id: vId, type: 'vnet', parent: connId, label: `vNet ${e.vnetId}`, raw: vnet || { id: e.vnetId }, vpnActive: activeVpnConns.has(e.conn) },
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

    // Surface meaningful user labels (role, accelerator) as chips inside the
    // node, one per label just like the IP chips (and after them), so they never
    // push/clip the node's name.
    const userLabels = n.label || {};
    const labelChips = [];
    if (userLabels.role) labelChips.push(`🏷 role=${userLabels.role}`);
    if (userLabels.accelerator) labelChips.push(`🏷 accelerator=${userLabels.accelerator}`);

    // When SG display is on, nest the VM inside a per-SG group box
    // (subnet ⊃ SG group ⊃ VM) so the SG that applies to each node is shown by
    // containment (no edges), with the firewall-rule summary in the group's
    // label. Applied to subnet-placed VMs (the common case); a VM's first SG is
    // the grouping key, and any additional SGs remain visible in VM details. A
    // NodeGroup spread across subnets shows one same-named group box per subnet.
    if (netOptions.sg && e.subnetId && parentId === subnetElId(e.conn, e.vnetId, e.subnetId)) {
      const grpSgId = (n.securityGroupIds || [])[0];
      if (grpSgId) {
        const grpEl = `ng-sggroup-${parentId}-${grpSgId}`;
        if (!added.has(grpEl)) {
          const sg = sgMap.get(grpSgId) || { id: grpSgId, firewallRules: [] };
          const merged = mergeSgRules([sg]);
          addOnce({
            data: {
              // Keep the box label compact: no SG id (shown on click), rules on one
              // line, and drop the "in:"/"out:" words (the ⬇/⬆ icons already convey direction).
              id: grpEl, type: 'sggroup', parent: parentId,
              label: `🛡 ${merged.label.replace(/\n/g, '   ').replace(/(in|out): /g, '')}`, wideOpen: merged.inWide,
              sgId: grpSgId, rules: merged.rules,
            },
          });
        }
        parentId = grpEl;
      }
    }

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

    // Label chips (role / accelerator), one per label, placed after the IP chips
    // and shown independently of the IP-chip toggle.
    labelChips.forEach((txt, i) => {
      addOnce({
        data: {
          id: `ng-tag-${e.vmId}-${i}`, type: 'tag', parent: e.vmId,
          label: txt, chipOrder: 2 + i, raw: n,
        },
      });
    });

    // Internet edge lands on the public-IP chip when chips are shown
    if (netOptions.publicIp && n.publicIP) {
      hasPublic = true;
      const target = netOptions.ipLabels ? `ng-ippub-${e.vmId}` : e.vmId;
      addOnce({
        data: { id: `ng-pub-${e.vmId}`, source: 'ng-internet', target, type: 'public' },
      });
    }
  });

  // ── NLB (regional load balancers): a front-end node linked to its target VMs ──
  // An NLB fronts a NodeGroup's VMs, so draw it as a distinct node with edges down
  // to each target VM. The label carries the client-facing listener endpoint.
  if (netOptions.nlb) {
    (centralData.nlb || []).forEach((nlb) => {
      const infraId = nlb.infraId;
      const tg = nlb.targetGroup || {};
      let targetNodeIds = tg.nodes || [];
      if (targetNodeIds.length === 0 && tg.nodeGroupId) {
        // Fall back to VMs whose id belongs to the target NodeGroup (id like "{ng}-N").
        targetNodeIds = vmEntries
          .filter((e) => e.infraId === infraId && String(e.node.id || '').startsWith(tg.nodeGroupId + '-'))
          .map((e) => e.node.id);
      }
      const targets = targetNodeIds
        .map((nid) => `ng-vm-${infraId}-${nid}`)
        .filter((vid) => added.has(vid));
      if (targets.length === 0) return; // no visible targets to attach to

      const li = nlb.listener || {};
      const endpoint = li.ip || li.dnsName || '';
      const nlbEl = `ng-nlb-${infraId}-${nlb.id}`;
      addOnce({
        data: {
          id: nlbEl, type: 'nlb', raw: nlb, nlbStatus: nlb.status || '',
          label: `⚖️ ${nlb.name || nlb.id}${endpoint || li.port ? '\n' + (endpoint ? endpoint + ':' : '') + (li.port || '') : ''}`,
        },
      });
      // A PUBLIC NLB is internet-facing → link it from the Internet node.
      if (String(nlb.Type || nlb.type || '').toUpperCase() === 'PUBLIC') internetFacing.push(nlbEl);
      targets.forEach((vid) => {
        addOnce({ data: { id: `ng-nlblink-${nlb.id}-${vid}`, source: nlbEl, target: vid, type: 'nlbLink' } });
      });
    });
  }

  // ── Global NLB (MCNLB): one node fronting the target Infra's VMs ──
  if (netOptions.mcnlb) {
    mcnlbHosts.forEach((hostInfra) => {
      const hostId = hostInfra.id;
      const targetId = String(hostId).endsWith('-nlb') ? hostId.slice(0, -4) : hostId;
      const targetInfra = infraList.find((i) => i.id === targetId);
      const targets = ((targetInfra && targetInfra.node) || [])
        .map((n) => `ng-vm-${targetId}-${n.id}`)
        .filter((vid) => added.has(vid));
      if (targets.length === 0) return; // target VMs not visible
      const hostIps = (hostInfra.node || []).map((n) => n.publicIP).filter(Boolean);
      const mcEl = `ng-mcnlb-${hostId}`;
      addOnce({
        data: {
          id: mcEl, type: 'mcnlb', raw: hostInfra, targetInfraId: targetId,
          label: `🌐 Global NLB${hostIps.length ? '\n' + hostIps[0] : ''}`,
        },
      });
      internetFacing.push(mcEl); // HAProxy front is public → link from the Internet node

      targets.forEach((vid) => {
        addOnce({ data: { id: `ng-mcnlblink-${hostId}-${vid}`, source: mcEl, target: vid, type: 'mcnlbLink' } });
      });
    });
  }

  // ── Site-to-site VPN: a tunnel node bridging the two sites' vNets ──
  // A VPN links two CSP sites (VNets). Connect it to each site's vNet node(s)
  // (per the site connectionName) so it reads as a tunnel between the two vNets;
  // fall back to the connection block only when no vNet node is present.
  if (netOptions.vpn) {
    // connectionName -> vNet element ids visible in the graph
    const connToVnetEls = new Map();
    vNetList.forEach((v) => {
      const conn = connOf(v);
      const el = vnetElId(conn, v.id);
      if (!added.has(el)) return;
      if (!connToVnetEls.has(conn)) connToVnetEls.set(conn, []);
      connToVnetEls.get(conn).push(el);
    });

    // De-duplicate VPNs: the same site-to-site VPN is listed under multiple Infras
    // (notably the "-nlb" MCNLB host that shares the vNets), which would create a
    // second, redundant/floating VPN node. Keep one per identity, preferring a
    // non-host Infra so the right-click manager opens the real Infra.
    const vpnByKey = new Map();
    (centralData.vpn || []).forEach((v) => {
      const key = v.uid || String(v.id);
      const isHost = mcnlbHostIds.has(v.infraId);
      const cur = vpnByKey.get(key);
      if (!cur || (cur.isHost && !isHost)) vpnByKey.set(key, { vpn: v, isHost });
    });

    [...vpnByKey.values()].map((x) => x.vpn).forEach((vpn) => {
      const siteConns = [...new Set((vpn.vpnSites || []).map((s) => s.connectionName).filter(Boolean))];
      const endpoints = [];
      siteConns.forEach((cn) => {
        const vnets = connToVnetEls.get(cn) || [];
        if (vnets.length) endpoints.push(...vnets);
        else if (added.has(`ng-conn-${cn}`)) endpoints.push(`ng-conn-${cn}`);
      });
      const uniq = [...new Set(endpoints)];
      if (uniq.length === 0) return; // neither site visible
      const vpnEl = `ng-vpn-${vpn.infraId}-${vpn.id}`;
      addOnce({
        data: {
          id: vpnEl, type: 'vpn', raw: vpn,
          label: `🔒 ${vpn.name || vpn.id}${vpn.status ? '\n' + vpn.status : ''}`,
        },
      });
      uniq.forEach((eid) => {
        addOnce({ data: { id: `ng-vpnlink-${vpn.id}-${eid}`, source: vpnEl, target: eid, type: 'vpnLink' } });
      });
    });
  }

  // Internet pseudo-node: shown when there is any public-facing element — a VM
  // public IP, a PUBLIC regional NLB, or a Global NLB.
  if (netOptions.publicIp && (hasPublic || internetFacing.length > 0)) {
    addOnce({ data: { id: 'ng-internet', type: 'internet', label: '🌐 Internet' } });
    // Internet → front-facing load balancers (they are the public entry points).
    internetFacing.forEach((el) => {
      if (added.has(el)) addOnce({ data: { id: `ng-pub-${el}`, source: 'ng-internet', target: el, type: 'public' } });
    });
  }

  // Bastion SSH paths + CB-TB command path (independently toggleable).
  // CB-Tumblebug delivers remote commands over SSH to the bastion's PUBLIC IP;
  // from the bastion, other VMs in the SAME SUBNET are reached over their PRIVATE IPs
  // (bastions are assigned per subnet, so each node is served by its own subnet's bastion).
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

    // Mirror the backend's bastion selection so the picture matches how a
    // command actually runs. CB-Tumblebug picks EXACTLY ONE bastion per target
    // node (Rendezvous / Highest-Random-Weight hashing over the target's subnet
    // bastions — see pickBastion in remoteCommand.go), so a command is never
    // executed through more than one bastion. When a subnet has 2+ bastions,
    // drawing an edge (and a flow animation) from every bastion to every member
    // would look like duplicated execution — which is wrong. We reproduce the
    // same one-bastion-per-member assignment here (a synchronous HRW; the
    // backend uses sha256, so the specific pick may differ, but the invariant —
    // one serving bastion per member — is identical).
    const cyrb53 = (str) => {
      let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
      for (let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
      }
      h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
      h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
      return 4294967296 * (2097151 & h2) + (h1 >>> 0);
    };
    const hrwPickBastion = (candidates, memberKey) => {
      let best = null;
      let bestScore = -1;
      candidates.forEach((b) => {
        const score = cyrb53(`${memberKey}|${b.node.id}`);
        if (score > bestScore) {
          bestScore = score;
          best = b;
        }
      });
      return best;
    };

    let hasCbtb = false;
    byVnet.forEach((entry) => {
      // Assign each non-bastion member to the single bastion that serves it,
      // choosing only among bastions in the member's OWN subnet.
      const bastionForMember = new Map(); // member.vmId -> serving bastion entry
      entry.members.forEach((m) => {
        if (m.isBastion) return; // a bastion is entered directly (its own public IP), not via a peer
        const candidates = entry.bastions.filter(
          (b) => b.vmId !== m.vmId && (!m.subnetId || !b.subnetId || m.subnetId === b.subnetId),
        );
        const chosen = hrwPickBastion(candidates, m.node.id);
        if (chosen) bastionForMember.set(m.vmId, chosen);
      });

      // A bastion's command flow is active when the bastion itself is handling a
      // command, or when any member it actually serves is handling one.
      const bastionHandling = new Map(); // bastion.vmId -> bool
      entry.bastions.forEach((b) => {
        if (b.cmdHandling) bastionHandling.set(b.vmId, true);
      });
      bastionForMember.forEach((b, memberVmId) => {
        const m = entry.members.find((x) => x.vmId === memberVmId);
        if (m && m.cmdHandling) bastionHandling.set(b.vmId, true);
      });

      // CB-TB: Command → each bastion's public IP (SSH entry point for remote commands)
      if (netOptions.cbtb) {
        entry.bastions.forEach((b) => {
          if (!b.node.publicIP) return;
          hasCbtb = true;
          addOnce({
            data: {
              id: `ng-cmd-${b.vmId}`, source: 'ng-cbtb', target: pubEnd(b), type: 'cmd', label: 'ssh',
              flowActive: bastionHandling.get(b.vmId) === true,
            },
          });
        });
      }

      // Bastion → member over the private network: exactly one edge per member,
      // from its single serving bastion.
      if (netOptions.bastion) {
        bastionForMember.forEach((b, memberVmId) => {
          const m = entry.members.find((x) => x.vmId === memberVmId);
          if (!m) return;
          addOnce({
            data: {
              id: `ng-ssh-${b.vmId}-${m.vmId}`, source: privEnd(b), target: privEnd(m), type: 'ssh', label: 'ssh',
              flowActive: m.cmdHandling === true,
            },
          });
        });
      }
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
  // vNet joined to an ACTIVE site-to-site VPN → darker/grey tint (semi-transparent
  // so the subnets/VMs inside stay readable). vNets without an active VPN keep the
  // default look.
  {
    selector: 'node[type="vnet"][?vpnActive]',
    style: {
      'background-color': '#374151', 'background-opacity': 0.4,
      'border-color': '#9ca3af', color: '#e5e7eb', 'text-outline-color': '#111827',
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
  // Node label chips (role / accelerator) — same shape/size as IP chips, amber accent.
  {
    selector: 'node[type="tag"]',
    style: {
      shape: 'round-rectangle', width: 178, height: 30,
      'background-color': '#ffffff', 'border-width': 1.5, 'border-color': '#d39e00',
      label: 'data(label)', 'text-valign': 'center', 'text-halign': 'center',
      'font-size': 15, 'font-family': 'monospace', 'font-weight': 'bold', color: '#7a5c00', padding: 6,
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
  // Security Group as a group box (compound) wrapping the VMs it applies to;
  // its label carries the SG name + firewall-rule summary.
  {
    selector: 'node[type="sggroup"]',
    style: {
      // Near-transparent fill + soft dashed border so the group reads as a light
      // overlay, not a prominent box; the rule label carries the meaning.
      shape: 'round-rectangle', 'background-color': '#0d6efd', 'background-opacity': 0.05,
      'border-width': 1, 'border-color': '#9ec0f0', 'border-style': 'dashed',
      label: 'data(label)', 'text-valign': 'top', 'text-halign': 'center', 'text-wrap': 'wrap',
      'font-size': 16, 'font-family': 'monospace', 'font-weight': 'bold', color: '#3a6bb5',
      'text-outline-color': '#ffffff', 'text-outline-width': 2, padding: 6,
    },
  },
  {
    selector: 'node[type="sggroup"][?wideOpen]',
    style: { 'background-color': '#dc3545', 'background-opacity': 0.07, 'border-color': '#e39aa2', color: '#a4333f' },
  },
  {
    selector: 'node[type="sggroup"]:childless',
    style: { width: 180, height: 60 },
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
  // NLB (regional load balancer): a per-region appliance fronting a NodeGroup —
  // compact rounded box, violet.
  {
    selector: 'node[type="nlb"]',
    style: {
      shape: 'round-rectangle', width: 'label', height: 'label',
      'background-color': '#7c3aed', 'background-opacity': 0.92,
      'border-width': 1.5, 'border-color': '#c4b5fd',
      label: 'data(label)', 'text-wrap': 'wrap', 'text-valign': 'center', 'text-halign': 'center',
      'font-size': 14, 'font-family': 'monospace', 'font-weight': 'bold', color: '#ffffff',
      'text-outline-color': '#3d2a63', 'text-outline-width': 1.5, padding: 8,
    },
  },
  {
    selector: 'edge[type="nlbLink"]',
    style: {
      width: 2, 'line-color': '#6f42c1', opacity: 0.7,
      'target-arrow-shape': 'triangle', 'target-arrow-color': '#6f42c1', 'arrow-scale': 0.9,
      'curve-style': 'round-taxi', 'taxi-direction': 'downward', 'taxi-turn': 20, 'taxi-turn-min-distance': 8,
    },
  },
  // Global NLB (MCNLB/HAProxy): a global multi-cloud hub — hexagon, larger/darker.
  {
    selector: 'node[type="mcnlb"]',
    style: {
      shape: 'round-hexagon', width: 'label', height: 'label',
      'background-color': '#3b1e6e', 'background-opacity': 0.96,
      'border-width': 2.5, 'border-color': '#8257e6',
      label: 'data(label)', 'text-wrap': 'wrap', 'text-valign': 'center', 'text-halign': 'center',
      'font-size': 15, 'font-family': 'monospace', 'font-weight': 'bold', color: '#ffffff',
      'text-outline-color': '#180a2e', 'text-outline-width': 2.5, padding: 18,
    },
  },
  {
    selector: 'edge[type="mcnlbLink"]',
    style: {
      width: 2, 'line-color': '#6f42c1', 'line-style': 'dashed', opacity: 0.7,
      'target-arrow-shape': 'triangle', 'target-arrow-color': '#6f42c1', 'arrow-scale': 0.9,
      'curve-style': 'round-taxi', 'taxi-direction': 'downward', 'taxi-turn': 26, 'taxi-turn-min-distance': 8,
    },
  },
  // Site-to-site VPN: a secure tunnel gateway between two vNets — cut-rectangle,
  // near-black with a teal dashed border to read as a secure tunnel endpoint.
  {
    selector: 'node[type="vpn"]',
    style: {
      shape: 'cut-rectangle', width: 'label', height: 'label',
      'background-color': '#111827', 'background-opacity': 0.97,
      'border-width': 2, 'border-color': '#5eead4', 'border-style': 'dashed',
      label: 'data(label)', 'text-wrap': 'wrap', 'text-valign': 'center', 'text-halign': 'center',
      'font-size': 14, 'font-family': 'monospace', 'font-weight': 'bold', color: '#ffffff',
      'text-outline-color': '#000000', 'text-outline-width': 2, padding: 12,
    },
  },
  {
    selector: 'edge[type="vpnLink"]',
    style: {
      width: 4, 'line-color': '#0d9488', 'line-style': 'dashed', 'line-dash-pattern': [10, 6], opacity: 0.9,
      'target-arrow-shape': 'none',
      'curve-style': 'unbundled-bezier', 'control-point-distances': [30], 'control-point-weights': [0.5],
    },
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
  // Right-click a node → bastion management menu (set / unset).
  netCy.on('cxttap', 'node', (evt) => showNetContextMenu(evt));
  // Suppress the browser's native menu over the canvas so ours is the only one.
  container.addEventListener('contextmenu', (e) => e.preventDefault());
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
  sgGroupHeaderH: 34, // top room inside an SG group box for its one-line rule summary
  emptySubnetW: 230, emptySubnetH: 96,
  blockGap: 22,
  padX: 24, padTop: 46, padBottom: 16,
  connGap: 46,
  internetGapY: 110,
};

// VM cell size depends on which chips are currently displayed
function vmCellSize() {
  const ipChips = netOptions.ipLabels ? 2 : 0;
  // Add rows for the tallest VM's label chips so the uniform grid cell fits them.
  let maxTag = 0;
  if (netCy) {
    netCy.nodes('[type="vm"]').forEach((vm) => {
      const c = vm.children('[type="tag"]').length;
      if (c > maxTag) maxTag = c;
    });
  }
  return { w: 240, h: 70 + (ipChips + maxTag) * (DIAG.chipH + 3) };
}

function runNetLayout() {
  if (!netCy) return;
  const cell = vmCellSize();

  const conns = netCy.nodes('[type="conn"]').sort((a, b) => a.id().localeCompare(b.id()));

  // ── Pass 1: measure block sizes bottom-up ──

  // An SG group box (subnet ⊃ SG group ⊃ VM) grids its member VMs under a header
  // that holds the SG name + rule summary.
  const measureSgGroup = (group) => {
    const vms = group.children('[type="vm"]');
    const cols = Math.min(DIAG.vmCols, Math.max(1, vms.length));
    const rows = Math.ceil(Math.max(1, vms.length) / cols);
    return {
      w: cols * cell.w + DIAG.padX,
      h: rows * cell.h + DIAG.sgGroupHeaderH + DIAG.padBottom,
    };
  };

  const measureSubnet = (subnet) => {
    // SG mode: the subnet holds SG group boxes (each wrapping its VMs) stacked
    // vertically (top→bottom): subnet width = widest group, height = sum of groups.
    const groups = subnet.children('[type="sggroup"]');
    if (groups.length > 0) {
      const sizes = groups.map(measureSgGroup);
      return {
        w: Math.max(...sizes.map((s) => s.w)) + DIAG.padX * 2,
        h: sizes.reduce((a, s) => a + s.h, 0) + DIAG.blockGap * Math.max(0, sizes.length - 1) + DIAG.padTop + DIAG.padBottom,
      };
    }
    const vms = subnet.children('[type="vm"]');
    if (vms.length === 0) {
      return { w: DIAG.emptySubnetW, h: DIAG.emptySubnetH };
    }
    const cols = Math.min(DIAG.vmCols, vms.length);
    const rows = Math.ceil(vms.length / cols);
    return {
      w: cols * cell.w + DIAG.padX * 2,
      h: rows * cell.h + DIAG.padTop + DIAG.padBottom,
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

  // Grid a group's member VMs under its header (name + rule summary).
  const posSgGroupContent = (group, originX, originY) => {
    const vms = group.children('[type="vm"]').sort((a, b) => a.id().localeCompare(b.id()));
    const cols = Math.min(DIAG.vmCols, Math.max(1, vms.length));
    vms.forEach((vm, i) => {
      placeVm(vm,
        originX + DIAG.padX + ((i % cols) + 0.5) * cell.w,
        originY + DIAG.sgGroupHeaderH + (Math.floor(i / cols) + 0.5) * cell.h);
    });
  };

  const posSubnetContent = (subnet, originX, originY, size) => {
    // SG mode: stack the subnet's SG group boxes vertically, each gridding its VMs.
    const groups = subnet.children('[type="sggroup"]').sort((a, b) => a.id().localeCompare(b.id()));
    if (groups.length > 0) {
      const gx = originX + DIAG.padX;
      let gy = originY + DIAG.padTop;
      groups.forEach((g) => {
        const gsz = measureSgGroup(g);
        posSgGroupContent(g, gx, gy);
        gy += gsz.h + DIAG.blockGap;
      });
      return;
    }
    const vms = subnet.children('[type="vm"]').sort((a, b) => a.id().localeCompare(b.id()));
    if (vms.length === 0) {
      subnet.position({ x: originX + DIAG.emptySubnetW / 2, y: originY + DIAG.emptySubnetH / 2 });
      return;
    }
    const cols = Math.min(DIAG.vmCols, Math.max(1, vms.length));
    vms.forEach((vm, i) => {
      placeVm(vm,
        originX + DIAG.padX + ((i % cols) + 0.5) * cell.w,
        originY + DIAG.padTop + (Math.floor(i / cols) + 0.5) * cell.h);
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

  // NLB nodes: pin each just above the bounding box of the VMs it targets, so it
  // reads as a front-end sitting in front of its target group.
  netCy.nodes('[type="nlb"]').forEach((nlb) => {
    const targets = nlb.connectedEdges('[type="nlbLink"]').targets();
    if (targets.nonempty()) {
      const bb = targets.boundingBox();
      nlb.position({ x: (bb.x1 + bb.x2) / 2, y: bb.y1 - 84 });
    }
  });

  // Global NLB nodes: pin above their target VMs (higher than regional NLBs).
  netCy.nodes('[type="mcnlb"]').forEach((mc) => {
    const targets = mc.connectedEdges('[type="mcnlbLink"]').targets();
    if (targets.nonempty()) {
      const bb = targets.boundingBox();
      mc.position({ x: (bb.x1 + bb.x2) / 2, y: bb.y1 - 132 });
    }
  });

  // VPN tunnel nodes: pin ABOVE both linked vNets (not at their midpoint —
  // that would land inside a large vNet compound and hide one edge), so both
  // tunnel edges come down to each side and stay visible.
  netCy.nodes('[type="vpn"]').forEach((vpn) => {
    const targets = vpn.connectedEdges('[type="vpnLink"]').targets();
    if (targets.nonempty()) {
      const bb = targets.boundingBox();
      vpn.position({ x: (bb.x1 + bb.x2) / 2, y: bb.y1 - 96 });
    }
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

  // IP / tag chips open their VM's detail
  if (type === 'ipPub' || type === 'ipPriv' || type === 'tag') {
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
  } else if (type === 'nlb') {
    const nlb = node.data('raw') || {};
    const li = nlb.listener || {}, tg = nlb.targetGroup || {}, hc = nlb.healthChecker || {};
    const kvState = ((nlb.keyValueList || []).find((k) => (k.Key || k.key) === 'State') || {});
    const stateM = /Code:\s*([A-Za-z_-]+)/.exec(kvState.Value || kvState.value || '');
    const status = nlb.status || (stateM ? stateM[1] : 'Unknown');
    title = `⚖️ ${esc(nlb.name || nlb.id)}`;
    html = `<table style="font-size:13px;text-align:left">${
      row('Status', status)}${
      row('Type / Scope', `${nlb.Type || nlb.type || ''} / ${nlb.Scope || nlb.scope || ''}`)}${
      row('Connection', nlb.connectionName)}${
      row('Listener', `${li.protocol || ''} ${li.ip || li.dnsName || ''}:${li.port || ''}`)}${
      row('Target NodeGroup', tg.nodeGroupId)}${
      row('Targets', (tg.nodes || []).join(', '))}${
      row('Health check', `interval ${hc.interval || '-'}s / timeout ${hc.timeout || '-'}s / threshold ${hc.threshold || '-'}`)}${
      row('CSP Resource', nlb.cspResourceId || nlb.cspResourceName)}
      </table>`;
  } else if (type === 'mcnlb') {
    const hostInfra = node.data('raw') || {};
    const ips = (hostInfra.node || []).map((n) => n.publicIP).filter(Boolean);
    title = `🌐 Global NLB (${esc(node.data('targetInfraId') || '')})`;
    html = `<table style="font-size:13px;text-align:left">${
      row('Host Infra', hostInfra.id)}${
      row('Fronts', node.data('targetInfraId'))}${
      row('Status', hostInfra.status)}${
      row('Host public IPs', ips.join(', '))}${
      row('HAProxy stats', ips.length ? `http://${ips[0]}:9000/ (admin: default/default)` : '')}
      </table><div style="font-size:11px;color:#888;margin-top:6px;">HAProxy fronts the target Infra's VMs via their public IPs. The host is itself an Infra (${esc(hostInfra.id)}).</div>`;
  } else if (type === 'vpn') {
    const vpn = node.data('raw') || {};
    const sites = (vpn.vpnSites || []).map((s) => {
      const cc = s.connectionConfig || {};
      const region = (cc.regionDetail && cc.regionDetail.regionName) || '';
      return `${esc(s.connectionName)}${region ? ' (' + esc(region) + ')' : ''}`;
    }).join(' ⇄ ');
    title = `🔒 ${esc(vpn.name || vpn.id)}`;
    html = `<table style="font-size:13px;text-align:left">${
      row('Status', vpn.status)}${
      row('Sites', sites)}${
      row('Message', vpn.systemMessage)}
      </table>`;
  } else if (type === 'sggroup') {
    const rules = node.data('rules') || [];
    const members = node.children('[type="vm"]').map((v) => (v.data('raw') || {}).id).filter(Boolean);
    title = `🛡 ${node.data('sgId') || 'Security Group'}`;
    const ruleRows = rules.map((r) =>
      `<tr><td style="padding:2px 8px 2px 0;color:#999">${esc(r.dir)}</td>` +
      `<td style="padding:2px 8px 2px 0">${esc(r.proto)}</td>` +
      `<td style="padding:2px 8px 2px 0">${esc(r.port || '-')}</td>` +
      `<td style="word-break:break-all">${esc(r.cidr)}</td></tr>`).join('');
    html = `<div style="font-size:12px;color:#666;margin-bottom:6px;text-align:left">` +
      `Applies to <b>${members.length}</b> node(s)${members.length ? ': ' + esc(members.join(', ')) : ''}</div>` +
      `<table style="font-size:12px;text-align:left;font-family:monospace">` +
      `<tr style="color:#888"><td>dir</td><td>proto</td><td>port</td><td>cidr</td></tr>${ruleRows}</table>`;
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
// RIGHT-CLICK CONTEXT MENU — bastion management
// ============================================================================
// Lets an operator explicitly SET a bastion (reusing the rich Set-Bastion
// dialog, which supports cross-namespace / cross-Infra / public-IP bastions —
// e.g. an AWS bare-metal node running OpenStack that fronts VMs on a newly
// registered provider) and explicitly UNSET/remove one, straight from the Net
// graph. Bastions are stored per SUBNET, so removal is offered per registered
// bastion on the subnet, and per node when a node itself is a bastion.

function ngApiBase() {
  const cfg = (window.getConfig && window.getConfig()) || {};
  return {
    hostname: cfg.hostname, port: cfg.port,
    username: cfg.username, password: cfg.password,
    ns: window.configNamespace,
  };
}

// VM nodes inside the given subnet — descendants, so it also finds VMs nested one
// level deeper inside SG group boxes (subnet ⊃ SG group ⊃ VM) when SG mode is on.
function subnetMembers(subnetNode) {
  return subnetNode.descendants('[type="vm"]').toArray();
}

async function removeBastionViaApi(infraId, bastionNodeId, bastionNsId, bastionInfraId) {
  const { hostname, port, username, password, ns } = ngApiBase();
  if (!ns || !infraId) {
    Swal.fire({ icon: 'error', title: 'Missing namespace / Infra context' });
    return;
  }

  // Pick the most specific DELETE route the identity requires.
  const sameNs = !bastionNsId || bastionNsId === ns;
  const sameInfra = !bastionInfraId || bastionInfraId === infraId;
  let path = `/tumblebug/ns/${ns}/infra/${infraId}/bastion`;
  if (!sameNs) {
    path += `/${bastionNsId}/${bastionInfraId}/${bastionNodeId}`;
  } else if (!sameInfra) {
    path += `/${bastionInfraId}/${bastionNodeId}`;
  } else {
    path += `/${bastionNodeId}`;
  }

  const confirm = await Swal.fire({
    icon: 'warning',
    title: 'Remove bastion?',
    html: `Unset bastion <b>${esc(bastionNodeId)}</b> from Infra <b>${esc(infraId)}</b>.<br>` +
      `<span style="font-size:12px;color:#888">Removes the bastion registration from its subnet(s). ` +
      `Nodes then fall back to another registered or auto-assigned bastion for remote commands.</span>`,
    showCancelButton: true, confirmButtonText: 'Remove', confirmButtonColor: '#d33',
  });
  if (!confirm.isConfirmed) return;

  try {
    const res = await fetch(`http://${hostname}:${port}${path}`, {
      method: 'DELETE',
      headers: { Authorization: 'Basic ' + btoa(`${username}:${password}`) },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || `HTTP ${res.status}`);
    Swal.fire({ icon: 'success', title: '✅ Bastion removed', text: body.output || body.message || 'Done', timer: 2600 });
    refresh(true);
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Failed to remove bastion', text: String((err && err.message) || err) });
  }
}

function onOutsideContext(e) {
  const m = document.getElementById('ng-context-menu');
  if (m && !m.contains(e.target)) closeNetContextMenu();
}
function closeNetContextMenu() {
  const m = document.getElementById('ng-context-menu');
  if (m) m.remove();
  document.removeEventListener('click', closeNetContextMenu);
  document.removeEventListener('contextmenu', onOutsideContext, true);
}

function buildBastionMenuItems(node, type) {
  const items = [];
  if (type === 'vm') {
    const raw = node.data('raw') || {};
    const infraId = node.data('infraId');
    const nodeId = raw.id;
    const isBastion = node.data('isBastion') === true;
    // Clicking a node to set a bastion means "use this node as the bastion for
    // its subnet", so the dialog opens with this node pre-selected as bastion.
    items.push({
      label: '🛡️ Set bastion for this subnet…',
      action: () => window.setBastionNode({
        targetInfraId: infraId,
        subnetMemberNodeId: nodeId,
        subnetId: raw.subnetId || '',
        defaultBastionNodeId: nodeId,
      }),
    });
    if (isBastion) {
      items.push({
        label: '❌ Unset this node as bastion',
        danger: true,
        action: () => removeBastionViaApi(infraId, nodeId),
      });
    }
  } else if (type === 'subnet') {
    const raw = node.data('raw') || {};
    const members = subnetMembers(node);
    const memberInfraId = members.length ? members[0].data('infraId') : selectedInfraId;
    const memberNodeId = members.length ? (members[0].data('raw') || {}).id : '';
    if (memberNodeId) {
      items.push({
        label: '🔗 Set bastion for this subnet…',
        action: () => window.setBastionNode({
          targetInfraId: memberInfraId,
          subnetMemberNodeId: memberNodeId,
          subnetId: raw.id || '',
          defaultBastionNodeId: '',
        }),
      });
    }
    (raw.bastionNodes || []).forEach((b) => {
      items.push({
        label: `❌ Remove bastion ${b.nodeId}`,
        danger: true,
        action: () => removeBastionViaApi(memberInfraId, b.nodeId, b.nsId, b.infraId),
      });
    });
  } else if (type === 'nlb') {
    // Open the NLB manager scoped to this NLB's Infra, pre-selecting its tab.
    const nlb = node.data('raw') || {};
    if (nlb.infraId && window.manageNLB) {
      items.push({
        label: '⚖️ Open NLB Manager…',
        action: () => window.manageNLB({ infraId: nlb.infraId, preselectNlbId: nlb.id }),
      });
    }
  } else if (type === 'mcnlb') {
    // Open the Global NLB manager scoped to the fronted (target) Infra, and offer
    // to open the host's firewall (the host is its own Infra, e.g. to allow 80/9000).
    const targetId = node.data('targetInfraId');
    const hostId = (node.data('raw') || {}).id;
    if (targetId && window.manageMCNLB) {
      items.push({
        label: '🌐 Open Global NLB Manager…',
        action: () => window.manageMCNLB({ infraId: targetId }),
      });
    }
    if (hostId && window.updateFirewallRules) {
      items.push({
        label: '🔥 Update host firewall rules…',
        action: () => window.updateFirewallRules({ infraId: hostId }),
      });
    }
  } else if (type === 'vpn') {
    // Open the VPN manager scoped to this VPN's Infra, pre-selecting its tab.
    const vpn = node.data('raw') || {};
    if (vpn.infraId && window.manageVPN) {
      items.push({
        label: '🔒 Open VPN Manager…',
        action: () => window.manageVPN({ infraId: vpn.infraId, preselectVpnId: vpn.id }),
      });
    }
  } else if (type === 'sggroup') {
    // Open the Update Security Group Rules dialog scoped to this group's Infra,
    // pre-selecting this SG's tab.
    const sgId = node.data('sgId');
    const members = node.descendants('[type="vm"]').toArray();
    const infraId = members.length ? members[0].data('infraId') : selectedInfraId;
    if (sgId && infraId && infraId !== 'all' && window.updateFirewallRules) {
      items.push({
        label: '🛡️ Update firewall rules…',
        action: () => window.updateFirewallRules({ infraId, preselectSgId: sgId }),
      });
    }
  }
  return items;
}

function showNetContextMenu(evt) {
  closeNetContextMenu();
  const node = evt.target;
  const type = node.data('type');
  const items = buildBastionMenuItems(node, type);
  if (!items.length) return;

  const oe = evt.originalEvent || {};
  const x = oe.clientX != null ? oe.clientX : 0;
  const y = oe.clientY != null ? oe.clientY : 0;

  const menu = document.createElement('div');
  menu.id = 'ng-context-menu';
  menu.style.cssText =
    'position:fixed;z-index:20000;min-width:220px;background:#fff;border:1px solid #d0d7de;' +
    'border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,0.18);padding:6px;font-size:13px;' +
    `left:${x}px;top:${y}px;`;

  const raw = node.data('raw') || {};
  let titleId = type;
  if (type === 'vm') titleId = raw.id;
  else if (type === 'subnet') titleId = `subnet ${raw.id}`;
  else if (type === 'sggroup') titleId = `SG ${node.data('sgId') || ''}`;
  else if (type === 'nlb') titleId = `NLB ${raw.name || raw.id || ''}`;
  else if (type === 'mcnlb') titleId = `Global NLB (${node.data('targetInfraId') || ''})`;
  else if (type === 'vpn') titleId = `VPN ${raw.name || raw.id || ''}`;
  const header = document.createElement('div');
  header.textContent = `⚙️ ${titleId || ''}`;
  header.style.cssText = 'padding:4px 8px 6px;color:#57606a;font-weight:600;border-bottom:1px solid #eaeef2;margin-bottom:4px;';
  menu.appendChild(header);

  items.forEach((it) => {
    const el = document.createElement('div');
    el.textContent = it.label;
    el.style.cssText = 'padding:7px 10px;border-radius:5px;cursor:pointer;white-space:nowrap;' +
      (it.danger ? 'color:#cf222e;' : 'color:#1f2328;');
    el.addEventListener('mouseenter', () => { el.style.background = it.danger ? '#ffebe9' : '#f3f4f6'; });
    el.addEventListener('mouseleave', () => { el.style.background = 'transparent'; });
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      closeNetContextMenu();
      it.action();
    });
    menu.appendChild(el);
  });

  document.body.appendChild(menu);
  // Keep the menu inside the viewport.
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) menu.style.left = `${Math.max(4, window.innerWidth - rect.width - 6)}px`;
  if (rect.bottom > window.innerHeight) menu.style.top = `${Math.max(4, window.innerHeight - rect.height - 6)}px`;

  // Dismiss on the next click anywhere, or a right-click outside the menu.
  setTimeout(() => {
    document.addEventListener('click', closeNetContextMenu);
    document.addEventListener('contextmenu', onOutsideContext, true);
  }, 0);
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
  // NLB data is only loaded while this view is visible; fetch it now on open so
  // NLB nodes appear immediately (subsequent refresh cycles keep it fresh).
  if (window.loadNlbDataFromInfras) window.loadNlbDataFromInfras();
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
