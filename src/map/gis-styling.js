/**
 * GIS Map Styling, CSP Icons & Status Colors Module
 * @module map/gis-styling
 */
import { Circle as CircleStyle, Fill, Stroke, Style, Text, Icon } from 'ol/style';
import { hexToRgb, getContrastColor, truncateInfraName } from '../core/utils.js';

const getCspIconStyles = () => window.cspIconStyles || {};
const getCspIconMode = () => window.cspIconMode || 'logo';
const getCspIconImg = () => window.cspIconImg || cspIconImg;

// CSP location icon styles (branded logos)
export const cspIconImg = {
  azure: new URL("../../img/csp-azure.png", import.meta.url).href,
  aws: new URL("../../img/csp-aws.png", import.meta.url).href,
  gcp: new URL("../../img/csp-gcp.png", import.meta.url).href,
  alibaba: new URL("../../img/csp-alibaba.png", import.meta.url).href,
  ibm: new URL("../../img/csp-ibm.png", import.meta.url).href,
  tencent: new URL("../../img/csp-tencent.png", import.meta.url).href,
  ncp: new URL("../../img/csp-ncp.png", import.meta.url).href,
  kt: new URL("../../img/csp-kt.png", import.meta.url).href,
  nhn: new URL("../../img/csp-nhn.png", import.meta.url).href,
  openstack: new URL("../../img/csp-openstack.png", import.meta.url).href,
};
window.cspIconImg = cspIconImg;

// Per-CSP distinct colors for generic cloud icon mode
const cspGenericColors = {
  azure: '#0078D4',
  aws: '#FF9900',
  gcp: '#4285F4',
  alibaba: '#FF6A00',
  ibm: '#054ADA',
  tencent: '#00C2FF',
  ncp: '#2DB400',
  kt: '#E52528',
  nhn: '#1A6DFF',
  openstack: '#ED1944',
};
// Fallback color for unknown CSPs
const CSP_GENERIC_FALLBACK_COLOR = '#888888';

// Draw a cloud shape onto a Canvas and return a pixel-ready HTMLCanvasElement.
// Using Canvas 2D avoids async image loading issues with vectorContext.setStyle().
function createCloudCanvas(fillColor) {
  const W = 44, H = 32;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Cloud shape: 5 overlapping circles
  const circles = [
    { x: 14, y: 20, r: 8 },   // left
    { x: 22, y: 16, r: 10 },  // center-top
    { x: 30, y: 19, r: 7 },   // right
    { x: 18, y: 22, r: 7 },   // bottom-left
    { x: 26, y: 22, r: 7 },   // bottom-right
  ];

  // White outline pass
  ctx.fillStyle = '#ffffff';
  circles.forEach(c => {
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r + 2, 0, Math.PI * 2);
    ctx.fill();
  });

  // Colored fill pass
  ctx.fillStyle = fillColor;
  circles.forEach(c => {
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.fill();
  });

  return canvas;
}

// Create a generic colored cloud style for a CSP using a pre-rendered Canvas.
// Canvas-based icons are synchronously available to vectorContext.setStyle().
function createGenericCloudStyle(csp) {
  const color = cspGenericColors[csp] || CSP_GENERIC_FALLBACK_COLOR;
  return new Style({
    image: new Icon({
      img: createCloudCanvas(color),
      scale: 0.72,
    }),
  });
}

// Cache for generic cloud styles (background CSP map points)
const cspGenericStyles = {};
function getGenericCloudStyle(csp) {
  if (!cspGenericStyles[csp]) {
    cspGenericStyles[csp] = createGenericCloudStyle(csp);
  }
  return cspGenericStyles[csp];
}

// Cache for Node overlay generic cloud styles keyed by "csp:scale"
// Separate from cspGenericStyles because scale varies per Node
const nodeGenericCloudStyleCache = {};
function getNodeGenericCloudStyle(csp, scale) {
  const key = `${csp}:${scale}`;
  if (!nodeGenericCloudStyleCache[key]) {
    const platform = resolveCloudPlatform(csp);
    const color = cspGenericColors[platform] || cspGenericColors[csp] || CSP_GENERIC_FALLBACK_COLOR;
    nodeGenericCloudStyleCache[key] = new Style({
      image: new Icon({
        img: createCloudCanvas(color),
        scale: scale,
        anchor: [0.5, 0.75],
        anchorXUnits: 'fraction',
        anchorYUnits: 'fraction',
      }),
    });
  }
  return nodeGenericCloudStyleCache[key];
}

// Draw a 3D isometric rack/datacenter shape onto a Canvas and return it.
// Faces: lighter top, main-color front-left, darker right side + rack-unit lines + LED dots.
function createDcCanvas(fillColor) {
  // Three-tower server rack cluster — 3D perspective, reads as a datacenter building logo.
  const W = 44, H = 36;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  let r = 136, g = 136, b = 136;
  try {
    const h = fillColor.replace(/^#/, '');
    r = parseInt(h.slice(0,2),16);
    g = parseInt(h.slice(2,4),16);
    b = parseInt(h.slice(4,6),16);
  } catch(e) {}

  // Lit-from-top color model
  const topC   = `rgb(${~~(r*.30+255*.70)},${~~(g*.30+255*.70)},${~~(b*.30+255*.70)})`; // roof: bright
  const frontH = `rgb(${~~(r*.68)},${~~(g*.68)},${~~(b*.68)})`;                          // front top
  const frontL = `rgb(${~~(r*.44)},${~~(g*.44)},${~~(b*.44)})`;                          // front bottom
  const sideC  = `rgb(${~~(r*.18)},${~~(g*.18)},${~~(b*.18)})`;                          // right side: dark

  const DX = 3, DY = -3; // perspective offset: right +3, up +3

  // Fill 4-corner polygon
  const quad = (ax,ay, bx,by, cx,cy, dx,dy, col) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(ax,ay); ctx.lineTo(bx,by); ctx.lineTo(cx,cy); ctx.lineTo(dx,dy);
    ctx.closePath(); ctx.fill();
  };

  // Front face with vertical gradient (lighter top → darker bottom = depth illusion)
  const front = (x,y,w,h) => {
    const gr = ctx.createLinearGradient(x,y,x,y+h);
    gr.addColorStop(0, frontH); gr.addColorStop(1, frontL);
    ctx.fillStyle = gr; ctx.fillRect(x,y,w,h);
  };

  // Tower specs: [x, y, w, h] — all three bottom-align at y=33
  const T = [
    [3,  13, 9,  20], // T1 left,   medium height
    [14, 6,  12, 27], // T2 center, tallest
    [28, 14, 9,  19], // T3 right,  shortest
  ];

  // ── White glow: draw silhouette with shadow, then overdraw cleanly ──
  ctx.save();
  ctx.shadowColor = 'rgba(255,255,255,0.55)'; ctx.shadowBlur = 5;
  ctx.fillStyle = frontL;
  T.forEach(function(t) { ctx.fillRect(t[0], t[1], t[2], t[3]); });
  ctx.restore();

  // ── T3 right side face (shadow side — only rightmost tower shows side) ──
  var t3 = T[2];
  quad(t3[0]+t3[2], t3[1],
       t3[0]+t3[2]+DX, t3[1]+DY,
       t3[0]+t3[2]+DX, t3[1]+t3[3]+DY,
       t3[0]+t3[2],    t3[1]+t3[3], sideC);

  // ── Top caps (all 3 towers, lit roof face) ──
  T.forEach(function(t) {
    quad(t[0],         t[1],
         t[0]+t[2],    t[1],
         t[0]+t[2]+DX, t[1]+DY,
         t[0]+DX,      t[1]+DY, topC);
  });

  // ── Front faces (all 3 towers) ──
  T.forEach(function(t) { front(t[0], t[1], t[2], t[3]); });

  // ── Per-tower details ──
  T.forEach(function(t, i) {
    // CSP-color LED strip across top of each front face
    ctx.save();
    ctx.shadowColor = fillColor; ctx.shadowBlur = 3;
    ctx.fillStyle = fillColor; ctx.globalAlpha = 0.88;
    ctx.fillRect(t[0], t[1], t[2], 2);
    ctx.restore();

    // Horizontal rack unit lines (subtle depth marks)
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 0.5;
    for (var ly = t[1]+5; ly < t[1]+t[3]-2; ly += 4) {
      ctx.beginPath(); ctx.moveTo(t[0]+1, ly); ctx.lineTo(t[0]+t[2]-1, ly); ctx.stroke();
    }
    ctx.restore();

    // Status LED at bottom center (green = active, amber = standby)
    var lc = i < 2 ? '#38e05a' : '#ffbf2a';
    ctx.save();
    ctx.shadowColor = lc; ctx.shadowBlur = 4;
    ctx.fillStyle = lc; ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.arc(t[0]+t[2]/2, t[1]+t[3]-3, 1.2, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  });

  // ── Ground platform base ──
  ctx.fillStyle = sideC;
  ctx.fillRect(T[0][0]-1, 33, T[2][0]+T[2][2]-T[0][0]+2, 2.5);
  // Base right-side perspective wedge
  quad(T[2][0]+T[2][2]+1, 33,
       T[2][0]+T[2][2]+1+DX, 33+DY,
       T[2][0]+T[2][2]+1+DX, 35.5+DY,
       T[2][0]+T[2][2]+1,    35.5, sideC);

  return canvas;
}

function createGenericDcStyle(csp) {
  const color = cspGenericColors[csp] || CSP_GENERIC_FALLBACK_COLOR;
  // scale 0.66: 44×36 canvas → ~29×24 px on screen (similar footprint to cloud icon)
  return new Style({ image: new Icon({ img: createDcCanvas(color), scale: 0.66 }) });
}

const cspDcStyles = {};
function getGenericDcStyle(csp) {
  if (!cspDcStyles[csp]) cspDcStyles[csp] = createGenericDcStyle(csp);
  return cspDcStyles[csp];
}

const nodeDcStyleCache = {};
function getNodeDcStyle(csp, scale) {
  const key = `${csp}:${scale}`;
  if (!nodeDcStyleCache[key]) {
    const platform = resolveCloudPlatform(csp);
    const color = cspGenericColors[platform] || cspGenericColors[csp] || CSP_GENERIC_FALLBACK_COLOR;
    nodeDcStyleCache[key] = new Style({
      image: new Icon({
        img: createDcCanvas(color),
        scale: scale,
        anchor: [0.5, 0.75],
        anchorXUnits: 'fraction',
        anchorYUnits: 'fraction',
      }),
    });
  }
  return nodeDcStyleCache[key];
}

// Get the appropriate CSP style based on current icon mode
function getCspStyle(csp) {
  const cspIconMode = window.cspIconMode || 'logo';
  const cspIconStyles = window.cspIconStyles || {};
  if (cspIconMode === 'datacenter') return getGenericDcStyle(csp);
  if (cspIconMode === 'cloud')      return getGenericCloudStyle(csp);
  // 'logo' mode: branded logo
  // Branded mode: prefer exact CSP match, then fall back via platform, then generic style
  let style = cspIconStyles[csp];
  if (!style) {
    const platform = resolveCloudPlatform(csp);
    if (platform && cspIconStyles[platform]) {
      style = cspIconStyles[platform];
    }
  }
  // Final fallback to generic icon to avoid returning undefined
  if (!style) {
    style = getGenericCloudStyle(csp);
  }
  return style;
}

// Known cloud platform names (used for platform-based fallback resolution)
const knownPlatforms = Object.keys(cspIconImg);

/**
 * Resolve a CSP name to its base cloud platform.
 * e.g., "openstack-new01" → "openstack", "aws" → "aws"
 * If the provider starts with a known platform name followed by '-',
 * the base platform is returned. Otherwise, the lowercased original name is returned.
 */
function resolveCloudPlatform(providerName) {
  if (!providerName) return '';
  const lower = providerName.toLowerCase();
  // Exact match first
  if (knownPlatforms.includes(lower)) return lower;
  // Prefix match: e.g., "openstack-new01" starts with "openstack-"
  for (const platform of knownPlatforms) {
    if (lower.startsWith(platform + '-')) return platform;
  }
  return lower;
}

// Provider Icon Mapping for Node visualization (using existing cspIconImg)
function getProviderIcon(providerName) {
  const cspIconMode = window.cspIconMode || 'logo';
  if (cspIconMode !== 'logo') return null; // non-logo modes use canvas-drawn icons, no overlay
  const provider = providerName?.toLowerCase();
  const platform = resolveCloudPlatform(provider);
  const icons = window.cspIconImg || cspIconImg;
  const iconPath = icons[provider] || icons[platform] || "img/circle.png"; // fallback icon
  return iconPath;
}



// Unified Node/Infra Status Color Mapping with improved visibility and contrasting borders
function getNodeStatusColor(status) {
  // Handle both exact status and status that includes keywords (for backward compatibility)
  const statusStr = status?.toString().toLowerCase() || '';
  
  let fillColor;
  
  // Running states - Green shades (healthy/active)
  if (status === "Running" || statusStr.includes("running")) {
    fillColor = "#10b981"; // emerald-500 - bright green for active/healthy state
  }
  // Creating/Starting states - Blue shades (in progress)
  else if (status === "Creating" || statusStr.includes("creating")) {
    fillColor = "#3b82f6"; // blue-500 - bright blue for creation progress
  }
  // Registering state - Teal (registering existing CSP Node))
  else if (status === "Registering" || statusStr.includes("registering")) {
    fillColor = "#14b8a6"; // teal-500 - teal for registration progress
  }
  // Reconciling state - Indigo (re-syncing Node with CSP truth)
  else if (status === "Reconciling" || statusStr.includes("reconciling")) {
    fillColor = "#6366f1"; // indigo-500 - indigo for reconciliation progress
  }
  else if (status === "Resuming" || statusStr.includes("resuming")) {
    fillColor = "#06b6d4"; // cyan-500 - cyan for resuming
  }
  // Preparing states - Orange shades (preparation phase)
  else if (status === "Preparing" || statusStr.includes("Preparing")) {
    fillColor = "#f97316"; // orange-500 - orange for preparing state
  }
  else if (status === "Prepared" || statusStr.includes("Prepared")) {
    fillColor = "#ea580c"; // orange-600 - darker orange for prepared state
  }
  // Empty state - Gray (Infra exists but has no Nodes)
  else if (status === "Empty" || statusStr.includes("Empty")) {
    fillColor = "#9ca3af"; // gray-400 - gray for empty Infra (no Nodes)
  }
  // Suspended/Paused states - Yellow/Orange shades (paused but recoverable)
  else if (status === "Suspended" || statusStr.includes("suspended")) {
    fillColor = "#f59e0b"; // amber-500 - amber for suspended/paused state
  }
  else if (status === "Suspending" || statusStr.includes("suspending")) {
    fillColor = "#d97706"; // amber-600 - darker amber for suspending process
  }
  // Rebooting state - Purple (special operation)
  else if (status === "Rebooting" || statusStr.includes("rebooting")) {
    fillColor = "#8b5cf6"; // violet-500 - purple for reboot operation
  }
  // Deleting state - Rose (tombstone: deletion requested, not yet confirmed on the CSP)
  else if (status === "Deleting" || statusStr.includes("deleting")) {
    fillColor = "#fb7185"; // rose-400 - pending deletion / tombstone awaiting confirmation
  }
  // Terminating states - Red shades (destructive operations)
  else if (status === "Terminating" || statusStr.includes("terminating")) {
    fillColor = "#ef4444"; // red-500 - bright red for terminating
  }
  else if (status === "Terminated" || statusStr.includes("terminated")) {
    fillColor = "#dc2626"; // red-600 - darker red for terminated
  }
  // Failed/Error states - Dark red (critical issues)
  else if (status === "Failed" || statusStr.includes("failed")) {
    fillColor = "#b91c1c"; // red-700 - dark red for failed state
  }
  // Undefined/Unknown states - Gray (neutral/unknown)
  else if (status === "Undefined" || statusStr.includes("undefined")) {
    fillColor = "#6b7280"; // gray-500 - medium gray for undefined
  }
  // Default fallback
  else {
    fillColor = "#9ca3af"; // gray-400 - light gray for unknown states
  }
  
  return {
    fill: fillColor,
    stroke: getContrastColor(fillColor)
  };
}

// Legacy function for Infra status - returns only fill color for backward compatibility
function changeColorStatus(status) {
  const colorObj = getNodeStatusColor(status);
  return typeof colorObj === 'object' ? colorObj.fill : colorObj;
}

// K8s Cluster Status Color Mapping
function getK8sStatusColor(status) {
  const statusStr = status?.toString().toLowerCase() || '';
  
  let fillColor;
  
  // Active/Running states - Green
  if (status === "Active" || statusStr.includes("active") || 
      status === "Running" || statusStr.includes("running")) {
    fillColor = "#10b981"; // emerald-500 - bright green for active
  }
  // Creating states - Blue
  else if (status === "Creating" || statusStr.includes("creating") ||
           status === "Provisioning" || statusStr.includes("provisioning")) {
    fillColor = "#3b82f6"; // blue-500 - bright blue for creation
  }
  // Updating states - Orange
  else if (status === "Updating" || statusStr.includes("updating") ||
           status === "Upgrading" || statusStr.includes("upgrading")) {
    fillColor = "#f97316"; // orange-500 - orange for updating
  }
  // Error/Failed states - Red
  else if (status === "Error" || statusStr.includes("error") ||
           status === "Failed" || statusStr.includes("failed")) {
    fillColor = "#dc2626"; // red-600 - red for errors
  }
  // Deleting states - Dark red
  else if (status === "Deleting" || statusStr.includes("deleting") ||
           status === "Terminating" || statusStr.includes("terminating")) {
    fillColor = "#b91c1c"; // red-700 - dark red for deletion
  }
  // Suspended/Stopped states - Yellow
  else if (status === "Suspended" || statusStr.includes("suspended") ||
           status === "Stopped" || statusStr.includes("stopped")) {
    fillColor = "#f59e0b"; // amber-500 - amber for suspended
  }
  // Unknown/Default states - Gray
  else {
    fillColor = "#6b7280"; // gray-500 - gray for unknown
  }
  
  return {
    fill: fillColor,
    stroke: getContrastColor(fillColor)
  };
}


// Helper function to split Infra name into multiple lines for better display
function splitInfraNameToLines(name, maxLineLength = 12) {
  if (!name) return [''];
  
  // If the name is short enough, return as single line
  if (name.length <= maxLineLength) {
    return [name];
  }
  
  // Split by common separators first
  const separators = ['-', '_', '.', ' '];
  let parts = [name];
  
  for (const sep of separators) {
    if (name.includes(sep)) {
      parts = name.split(sep);
      break;
    }
  }
  
  // If no separators found or parts are still too long, split by length
  if (parts.length === 1 || parts.some(part => part.length > maxLineLength)) {
    const lines = [];
    let currentLine = '';
    
    for (let i = 0; i < name.length; i++) {
      if (currentLine.length >= maxLineLength && (name[i] === '-' || name[i] === '_' || name[i] === '.' || name[i] === ' ')) {
        lines.push(currentLine);
        currentLine = '';
      } else if (currentLine.length >= maxLineLength * 1.5) {
        lines.push(currentLine);
        currentLine = '';
      }
      currentLine += name[i];
    }
    
    if (currentLine) {
      lines.push(currentLine);
    }
    
    return lines.slice(0, 3); // Limit to 3 lines maximum
  }
  
  // Combine parts intelligently to create 2-3 lines
  const lines = [];
  let currentLine = '';
  
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const separator = i < parts.length - 1 ? (name.includes('-') ? '-' : name.includes('_') ? '_' : '.') : '';
    
    if (currentLine.length + part.length + separator.length <= maxLineLength || currentLine === '') {
      currentLine += part + separator;
    } else {
      if (currentLine) {
        lines.push(currentLine.replace(/[-_.]$/, '')); // Remove trailing separator
        currentLine = part + separator;
      }
    }
  }
  
  if (currentLine) {
    lines.push(currentLine.replace(/[-_.]$/, '')); // Remove trailing separator
  }
  
  return lines.slice(0, 3); // Limit to 3 lines maximum
}

// Generate random string for resource naming
function generateRandomString() {
  return Math.random().toString(36).substr(2, 5);
}

// Infra name word pool — familiar words across animals, fruits, flowers, nature, snacks, fantasy, gems, space
const _infraNameWordPool = [
  // 🐾 Animals
  'lion','tiger','eagle','wolf','bear','fox','panda','hawk','dolphin','penguin',
  'rabbit','shark','whale','parrot','dragon',
  // 🍎 Fruits
  'apple','banana','orange','grape','mango','lemon','peach','cherry','melon','coconut',
  'kiwi','lime','plum','pear','strawberry',
  // 🌸 Flowers
  'rose','lily','daisy','tulip','poppy','violet','orchid','lavender','jasmine','sunflower',
  // 🌍 Nature
  'rainbow','storm','thunder','wind','fire','ice','snow','river','ocean','island',
  'forest','mountain','volcano','desert','glacier',
  // 🍪 Snacks & Drinks
  'cookie','candy','waffle','donut','muffin','brownie','caramel','honey','latte','cocoa',
  // 🎮 Fantasy
  'wizard','knight','ninja','pirate','viking','samurai','hunter','ranger','shadow','blaze',
  // 💎 Gems
  'ruby','sapphire','emerald','diamond','pearl','jade','amber','topaz','opal','crystal',
  // 🚀 Space
  'sun','moon','star','mars','venus','saturn','jupiter','comet','meteor','galaxy',
  'nebula','aurora','eclipse','rocket','orbit',
];

// Returns an Infra-friendly name like "mc-panda", preferring words not recently used.
// Usage history is stored in localStorage so it persists across sessions.
function generateInfraName() {
  const STORAGE_KEY = 'infraNameUsedWords';
  const used = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');

  const unused = _infraNameWordPool.filter(w => !used.includes(w));
  const pool = unused.length > 0 ? unused : _infraNameWordPool; // reset when all used
  const word = pool[Math.floor(Math.random() * pool.length)];

  // Record usage (keep last 100 entries max)
  const updated = [...used.filter(w => w !== word), word].slice(-100);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

  return word;
}

// Helper function to split K8s cluster name into multiple lines for better display
function splitK8sNameToLines(name, maxLineLength = 18) {
  if (!name) return [''];
  
  // If the name is short enough, return as single line
  if (name.length <= maxLineLength) {
    return [name];
  }
  
  // Split by common separators first
  const separators = ['-', '_', '.', ' '];
  let parts = [name];
  
  for (const sep of separators) {
    if (name.includes(sep)) {
      parts = name.split(sep);
      break;
    }
  }
  
  // If no separators found or parts are still too long, split by length
  if (parts.length === 1 || parts.some(part => part.length > maxLineLength)) {
    const lines = [];
    let currentLine = '';
    
    for (let i = 0; i < name.length; i++) {
      if (currentLine.length >= maxLineLength && (name[i] === '-' || name[i] === '_' || name[i] === '.' || name[i] === ' ')) {
        lines.push(currentLine);
        currentLine = '';
      } else if (currentLine.length >= maxLineLength * 1.5) {
        lines.push(currentLine);
        currentLine = '';
      }
      currentLine += name[i];
    }
    
    if (currentLine) {
      lines.push(currentLine);
    }
    
    return lines.slice(0, 3); // Allow up to 3 lines for longer K8s cluster names
  }
  
  // Combine parts intelligently to create lines
  const lines = [];
  let currentLine = '';
  
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const testLine = currentLine ? currentLine + '-' + part : part;
    
    if (testLine.length <= maxLineLength || currentLine === '') {
      currentLine = testLine;
    } else {
      lines.push(currentLine);
      currentLine = part;
    }
  }
  
  if (currentLine) {
    lines.push(currentLine);
  }
  
  return lines.slice(0, 3); // Allow up to 3 lines for longer K8s cluster names
}

function changeSizeStatus(status) {
  if (status.includes("-df")) {
    return 0.4;
  } else if (status.includes("-ws")) {
    return 0.4;
  } else if (status.includes("NLB")) {
    return 1.5;
  } else if (status.includes("Failed")) {
    return 2.2; // Make Failed Nodes more visible with medium-large size
  } else if (status.includes("Partial")) {
    return 2.4;
  } else if (status.includes("Running")) {
    return 2.4;
  } else if (status.includes("Suspending")) {
    return 2.4;
  } else if (status.includes("Suspended")) {
    return 2.4;
  } else if (status.includes("Creating")) {
    return 2.4;
  } else if (status.includes("Resuming")) {
    return 2.4;
  } else if (status.includes("Terminated")) {
    return 2.4;
  } else if (status.includes("Terminating")) {
    return 2.4;
  } else {
    return 2.4;
  }
}

// Create Node icon style with status badge and provider icon
function createNodeStyleWithStatusBadge(nodeStatus, providerName = null, baseScale = 1.0, nodeCoords = null, commandStatus = "None") {
  const statusColors = getNodeStatusColor(nodeStatus);
  
  const styles = [
    // Main Node icon (center)
    new Style({
      image: new Icon({
        crossOrigin: "anonymous",
        src: "img/icon-vm.png",
        opacity: 1.0,
        scale: baseScale * 0.3,
        anchor: [0.5, 0.5], // Center anchor
        anchorXUnits: 'fraction',
        anchorYUnits: 'fraction',
      }),
    }),
    // Status badge (bottom-right using displacement)
    new Style({
      image: new CircleStyle({
        radius: 4,
        fill: new Fill({
          color: statusColors.fill,
        }),
        stroke: new Stroke({
          color: statusColors.stroke,
          width: 1.5, // Slightly thicker border for better visibility
        }),
        displacement: [12, -13], // Move right and down (negative Y for down)
      }),
    })
  ];

  // Add command status icon if there are active commands
  if (commandStatus === "Queued" || commandStatus === "Handling") {
    // Create gear icon using text symbol
    const gearSymbol = commandStatus === "Handling" ? "⚡" : "⏳"; // Same gear symbol
    const rotation = commandStatus === "Handling" ? (Date.now() / 100) % (2 * Math.PI) : 0; // Rotate for Handling
    
    styles.push(
      new Style({
        text: new Text({
          text: gearSymbol,
          font: commandStatus === "Queued" ? '16px sans-serif' : '12px sans-serif', // Larger for Queued
          fill: new Fill({
            color: commandStatus === "Handling" ? '#FF6B35' : '#FFB84D', // Orange for Handling, Yellow-orange for Queued
          }),
          stroke: new Stroke({
            color: '#333',
            width: 0.5,
          }),
          offsetX: 8, // Reduced radius - smaller circular motion
          offsetY: -2, // Adjusted Y offset proportionally
          rotation: rotation, // Animate rotation for Handling
        }),
      })
    );
  }

  // Add provider icon if provider information is available (center-top using anchor)
  if (providerName && providerName !== 'unknown') {
    const providerIconSrc = getProviderIcon(providerName);
    if (providerIconSrc) {
      // Branded image icon mode
      styles.push(
        new Style({
          image: new Icon({
            crossOrigin: "anonymous",
            src: providerIconSrc,
            opacity: 0.9,
            scale: baseScale * 0.3,
            anchor: [0.5, 0.75], 
            anchorXUnits: 'fraction',
            anchorYUnits: 'fraction',
          }),
        })
      );
    }
    // Generic colored cloud icon mode — no overlay icon
  }

  return styles;
}



// Attach to window object for inter-module access
window.cspGenericColors = cspGenericColors;
window.CSP_GENERIC_FALLBACK_COLOR = CSP_GENERIC_FALLBACK_COLOR;
window.createCloudCanvas = createCloudCanvas;
window.createGenericCloudStyle = createGenericCloudStyle;
window.getGenericCloudStyle = getGenericCloudStyle;
window.getNodeGenericCloudStyle = getNodeGenericCloudStyle;
window.createDcCanvas = createDcCanvas;
window.createGenericDcStyle = createGenericDcStyle;
window.getGenericDcStyle = getGenericDcStyle;
window.getNodeDcStyle = getNodeDcStyle;
window.getCspStyle = getCspStyle;
window.knownPlatforms = knownPlatforms;
window.resolveCloudPlatform = resolveCloudPlatform;
window.getProviderIcon = getProviderIcon;
window.getNodeStatusColor = getNodeStatusColor;
window.changeColorStatus = changeColorStatus;
window.getK8sStatusColor = getK8sStatusColor;
window.splitInfraNameToLines = splitInfraNameToLines;
window.splitK8sNameToLines = splitK8sNameToLines;
window.changeSizeStatus = changeSizeStatus;
window.createNodeStyleWithStatusBadge = createNodeStyleWithStatusBadge;
