/**
 * GIS Geometry & Coordinate Computation Module
 * @module map/geometry
 */
import { Point, Polygon, MultiPoint } from 'ol/geom';

const findNearestInfra = (coord) => (window.findNearestInfra ? window.findNearestInfra(coord) : null);

function createNodePointWithOffset(coordinates, offsetX = 0.008, offsetY = 0.008) {
  return new Point([coordinates[0] + offsetX, coordinates[1] + offsetY]);
}

function changeSizeByName(status) {
  if (status.includes("-best")) {
    return 3.5;
  } else if (status.includes("-df")) {
    return 0.4;
  } else if (status.includes("-ws")) {
    return 0.4;
  } else if (status.includes("NLB")) {
    return 1.5;
  } else {
    return 2.5;
  }
}

/**
 * Compute inter-Infra offset for Nodes at shared locations.
 * When multiple Infras have Nodes at the same region, each Infra gets a directional
 * offset so their Node icons don't fully overlap.
 * @param {number} infraIndex - This Infra's index at the shared location (0-based)
 * @param {number} totalInfras - Total Infras sharing this location
 * @returns {{ox: number, oy: number}} offset in coordinate units
 */
function getInfraLocationOffset(infraIndex, totalInfras) {
  if (totalInfras <= 1 || infraIndex === 0) return { ox: 0, oy: 0 };
  // Place Infras on a ring around the base location
  const ringRadius = 1.5; // coordinate-space radius (scaled by zoom later)
  const angleStep = 2 * Math.PI / totalInfras;
  const startAngle = 3 * Math.PI / 2; // base angle; first offset (index=1) lands near top
  const angle = startAngle + angleStep * infraIndex;
  return {
    ox: ringRadius * Math.cos(angle),
    oy: ringRadius * Math.sin(angle) * 0.78 // compress Y for map projection
  };
}

function returnAdjustmentPoint(index, totalNodes) {
  // Initialize coordinates
  let ax = 0.0;
  let ay = 0.0;

  // First Node (index 0) is placed at center
  if (index === 0) {
    ax = 0;
    ay = 0;
  } else {
    // Circle radius
    const radius = 0.75;

    // Calculate angle step (divide 360° by total Nodes))
    const angleStep = 2 * Math.PI / totalNodes;

    // Start at 12 o'clock position
    const startAngle = 3 * Math.PI / 2;

    // Calculate angle for current Node
    const angle = startAngle + (angleStep * index);

    // Convert polar coordinates to Cartesian
    ax = radius * Math.cos(angle);
    ay = radius * Math.sin(angle);
  }

  // Add small random offset to prevent exact overlapping
  ax = ax + (Math.random() * 0.01);
  ay = ay + (Math.random() * 0.01);

  // Compress y-axis for better map projection appearance
  ay = ay * 0.78;

  return { ax, ay };
}

var n = 400;
var omegaTheta = 600000; // Rotation period in ms
var R = 7;
var r = 2;
var p = 2;

window.n = n;
window.omegaTheta = omegaTheta;
window.R = R;
window.r = r;
window.p = p;

var coordinates = [];
coordinates.push([-180, -90]);

var coordinatesFromX = [];
coordinatesFromX.push([0]);
var coordinatesFromY = [];
coordinatesFromY.push([0]);

var coordinatesToX = [];
coordinatesToX.push([1]);
var coordinatesToY = [];
coordinatesToY.push([1]);

function makeTria(ip1, ip2, ip3) {
  changePoints(ip1, ip2);
  changePoints(ip2, ip3);
  changePoints(ip3, ip1);
  // makeTria is legacy/unused — kept for reference
}

// Build Node dot geometry data for an Infra entry in infraRenderMap
function makePolyDot(infraEntry, nodePoints, nodeStatuses = [], nodeProviders = [], nodeCommandStatuses = []) {
  var resourcePoints = [];
  for (let i = 0; i < nodePoints.length; i++) {
    resourcePoints.push(nodePoints[i]);
  }
  infraEntry.geometryPoints = {
    geometry: new MultiPoint(resourcePoints),
    nodePoints: nodePoints,
    nodeStatuses: nodeStatuses,
    nodeProviders: nodeProviders,
    nodeCommandStatuses: nodeCommandStatuses
  };
}

// Build polygon geometry for an Infra entry in infraRenderMap
function makePolyArray(infraEntry, nodePoints) {
  var resourcePoints = [];
  for (let i = 0; i < nodePoints.length; i++) {
    resourcePoints.push(nodePoints[i]);
  }
  resourcePoints.push(nodePoints[0]);
  infraEntry.geometry = new Polygon([resourcePoints]);
  infraEntry.geo = new Polygon([resourcePoints]);
  // Cache interior point for fast lookup in findNearestInfra (avoids recomputing on every pointermove)
  const ip = infraEntry.geometry.getInteriorPoint().getCoordinates();
  infraEntry.anchorCoord = [ip[0], ip[1]];
}

function cross(a, b, o) {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

// Build a visible polygon ring for a cluster even when it has only 1-2 nodes.
function buildClusterPolygonRing(clusterPoints, zoomLevel, radius) {
  if (!clusterPoints || clusterPoints.length === 0) {
    return null;
  }

  const safeZoom = Math.max(zoomLevel || 1, 1);
  const delta = (2.5 / safeZoom) * radius;
  const circleSegments = 32;

  // 1-node cluster: draw a circle centered on the point.
  if (clusterPoints.length === 1) {
    const [cx, cy] = clusterPoints[0];
    const r = delta;
    const ring = [];
    for (let i = 0; i < circleSegments; i++) {
      const angle = (2 * Math.PI * i) / circleSegments;
      ring.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
    }
    ring.push(ring[0]);
    return ring;
  }

  // 2-node cluster: draw a circle enclosing both nodes.
  if (clusterPoints.length === 2) {
    const [p1, p2] = clusterPoints;
    const cx = (p1[0] + p2[0]) / 2;
    const cy = (p1[1] + p2[1]) / 2;
    const halfDist = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 2;
    const r = halfDist + delta * 0.5;
    const ring = [];
    for (let i = 0; i < circleSegments; i++) {
      const angle = (2 * Math.PI * i) / circleSegments;
      ring.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
    }
    ring.push(ring[0]);
    return ring;
  }

  // 3+ nodes: standard convex hull.
  const hull = convexHull(clusterPoints.map((p) => [p[0], p[1]]));
  if (!hull || hull.length < 3) {
    return null;
  }

  return [...hull, hull[0]];
}

/**
 * @param points An array of [X, Y] coordinates
 */
function convexHull(points) {
  points.sort(function (a, b) {
    return a[0] == b[0] ? a[1] - b[1] : a[0] - b[0];
  });

  var lower = [];
  for (var i = 0; i < points.length; i++) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], points[i]) <= 0
    ) {
      lower.pop();
    }
    lower.push(points[i]);
  }

  var upper = [];
  for (var i = points.length - 1; i >= 0; i--) {
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], points[i]) <= 0
    ) {
      upper.pop();
    }
    upper.push(points[i]);
  }

  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

function changePoints(ipFrom, ipTo) {
  var lon = 360 * Math.random() - 180;
  var lat = 180 * Math.random() - 90;

  var lon1 = 360 * Math.random() - 180;
  var lat1 = 180 * Math.random() - 90;

  // Debug: uncomment if needed for troubleshooting
  // console.log(ipFrom);
  // console.log(ipTo);

  coordinates.push(ipFrom);
  coordinates.push(ipTo);

  var i, j;

  var xFrom = ipFrom[0];
  var yFrom = ipFrom[1];
  var xTo = ipTo[0];
  var yTo = ipTo[1];
  for (j = 1; j < n; ++j) {
    var goX = xFrom + (j * (xTo - xFrom)) / n;
    var goY = ((yTo - yFrom) / (xTo - xFrom)) * (goX - xFrom) + yFrom;
  }
}

var refreshInterval = 5;
window.refreshInterval = window.refreshInterval || refreshInterval;
//setTimeout(() => console.log(getConnection()), refreshInterval*1000);



// Attach to window object for inter-module & map rendering access
window.createNodePointWithOffset = createNodePointWithOffset;
window.changeSizeByName = changeSizeByName;
window.getInfraLocationOffset = getInfraLocationOffset;
window.returnAdjustmentPoint = returnAdjustmentPoint;
window.makeTria = makeTria;
window.makePolyDot = makePolyDot;
window.makePolyArray = makePolyArray;
window.cross = cross;
window.buildClusterPolygonRing = buildClusterPolygonRing;
window.convexHull = convexHull;
window.changePoints = changePoints;
window.omegaTheta = omegaTheta;

export {
  omegaTheta,
  n,
  R,
  r,
  p,
  createNodePointWithOffset,
  changeSizeByName,
  getInfraLocationOffset,
  returnAdjustmentPoint,
  makeTria,
  makePolyDot,
  makePolyArray,
  cross,
  buildClusterPolygonRing,
  convexHull,
  changePoints
};
