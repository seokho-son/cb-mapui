/*
Copyright 2019 The Cloud-Barista Authors.
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at
    http://www.apache.org/licenses/LICENSE-2.0
Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

----
Copyright for OpenLayers (https://openlayers.org/)

BSD 2-Clause License

Copyright 2005-present, OpenLayers Contributors
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
----
*/

// OpenLayers CSS
import "ol/ol.css";

// OpenLayers core components
import Map from "ol/Map";
import View from "ol/View";
import Feature from "ol/Feature";
import Overlay from "ol/Overlay";

// OpenLayers geometry types
import { MultiPoint, Point, LineString, Polygon } from "ol/geom";

// OpenLayers layer types
import TileLayer from "ol/layer/Tile";
import { Vector as VectorLayer } from "ol/layer";

// OpenLayers source types
import OSM from "ol/source/OSM";
import { TileJSON, Vector as VectorSource } from "ol/source";

// OpenLayers style components
import {
  Circle as CircleStyle,
  Fill,
  Stroke,
  Style,
  Text,
  Icon,
} from "ol/style";

// OpenLayers utilities and controls
import { getVectorContext } from "ol/render";
import { useGeographic, toLonLat } from "ol/proj";
import { toStringHDMS, createStringXY } from "ol/coordinate";
import MousePosition from "ol/control/MousePosition";
import { defaults as defaultControls } from "ol/control";

// Third-party libraries
import Swal from "sweetalert2";
import axios, { AxiosError } from "axios";
import JSONFormatter from "json-formatter-js";

useGeographic();
var i, j;
var cnti, cntj;

const cntInit = 0;
var cnt = cntInit;

//var n = 1000;
var geometries = new Array();
var geometriesPoints = new Array();
var mciName = new Array();
var mciStatus = new Array();
var mciGeo = new Array();

var cspListDisplayEnabled = document.getElementById("displayOn");
var tableDisplayEnabled = document.getElementById("tableOn");
var table = document.getElementById("detailTable");
var recommendPolicy = document.getElementById("recommendPolicy");
var selectApp = document.getElementById("selectApp");

var messageTextArea = document.getElementById("message");
var messageJsonOutput = document.getElementById("jsonoutput");

var hostnameElement = document.getElementById("hostname");
var portElement = document.getElementById("port");
var usernameElement = document.getElementById("username");
var passwordElement = document.getElementById("password");
var namespaceElement = document.getElementById("namespace");
var mciidElement = document.getElementById("mciid");

const typeStringConnection = "connection";
const typeStringProvider = "provider";
const typeStringImage = "image";
const typeStringSpec = "spec";
const typeStringSG = "securityGroup";
const typeStringSshKey = "sshKey";
const typeStringVNet = "vNet";
const typeInfo = "info";
const typeError = "error";

var tileLayer = new TileLayer({
  source: new OSM(),
});

/*
 * Create the map.
 */
var map = new Map({
  layers: [tileLayer],
  target: "map",
  view: new View({
    center: [30, 30],
    zoom: 3,
  }),
  //projection: 'EPSG:4326'
});

// fucntion for clear map.
function clearMap() {
  // table.innerHTML = "";
  messageJsonOutput.value = "";
  messageTextArea.value = "";
  geometries = [];
  geoResourceLocation.k8s = [];
  geoResourceLocation.sg = [];
  geoResourceLocation.sshKey = [];
  geoResourceLocation.vnet = [];
  geoResourceLocation.vpn = [];


  map.render();
}
window.clearMap = clearMap;

function clearCircle(option) {
  //document.getElementById("latLonInputPairArea").innerHTML = '';
  if (option == "clearText") {
    messageTextArea.value = "";
  }
  latLonInputPairIdx = 0;
  vmReqeustFromSpecList = [];
  recommendedSpecList = [];
  cspPointsCircle = [];
  geoCspPointsCircle = [];
  messageJsonOutput.value = "";
  // table.innerHTML = "";
}
window.clearCircle = clearCircle;

function writeLatLonInputPair(idx, lat, lon) {
  var recommendedSpec = getRecommendedSpec(idx, lat, lon);
  var latf = lat.toFixed(4);
  var lonf = lon.toFixed(4);

  //document.getElementById("latLonInputPairArea").innerHTML +=
  `VM ${idx + 1}: (${latf}, ${lonf}) / `;
  if (idx == 0) {
    messageTextArea.value = `[Started MCI configuration]\n`;
  }
  messageTextArea.value += `\n - [VM-${idx + 1
    }]  Location:  ${latf}, ${lonf}\t\t| Best Spec: `;
  messageTextArea.scrollTop = messageTextArea.scrollHeight;
}

var latLonInputPairIdx = 0;
var vmReqeustFromSpecList = new Array();
var recommendedSpecList = new Array();

map.on("singleclick", function (event) {
  const coord = event.coordinate;
  // document.getElementById('latitude').value = coord[1];
  // document.getElementById('longitude').value = coord[0];

  writeLatLonInputPair(latLonInputPairIdx, coord[1], coord[0]);
  latLonInputPairIdx++;
});

// Initialize an object to keep track of the active spinner tasks
let spinnerStack = {};
// A counter to generate unique IDs for spinner tasks
let currentSpinnerId = 0;

// Function to create a unique spinner task ID based on the function name
function generateSpinnerId(functionName) {
  currentSpinnerId++; // Increment the ID
  return "[" + currentSpinnerId + "] " + functionName; // Return the unique task ID
}

// Function to add a new task to the spinner stack and update the spinner's visibility
function addSpinnerTask(functionName) {
  const taskId = generateSpinnerId(functionName); // Create a unique task ID
  spinnerStack[taskId] = true; // Add the task to the stack
  updateSpinnerVisibility(); // Update the spinner display
  return taskId; // Return the task ID for later reference
}

// Function to remove a task from the spinner stack by its ID and update the spinner's visibility
function removeSpinnerTask(taskId) {
  if (spinnerStack[taskId]) {
    delete spinnerStack[taskId]; // Remove the task from the stack
    updateSpinnerVisibility(); // Update the spinner display
  }
}

// Function to update the spinner's visibility based on the active tasks in the stack
function updateSpinnerVisibility() {
  const spinnerContainer = document.getElementById("spinner-container"); // Get the spinner container element
  const spinnerText = document.getElementById("spinner-text"); // Get the spinner text element

  // Check if there are any tasks remaining in the stack
  const tasksRemaining = Object.keys(spinnerStack).length > 0;

  if (tasksRemaining) {
    spinnerContainer.style.display = "flex"; // If there are tasks, display the spinner
    // Update the spinner text to show all active task names
    spinnerText.textContent = Object.keys(spinnerStack).join(",  ");
  } else {
    spinnerContainer.style.display = "none"; // If no tasks, hide the spinner
  }
}

// Display Icon for Cloud locations
// npm i -s csv-parser
const http = require("http");
const csv = require("csv-parser");

const csvPath =
  "https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/assets/cloudlocation.csv";
var cloudLocation = [];
var cspPointsCircle = [];
var geoCspPointsCircle = new Array();
var geoResourceLocation = {
  sshKey: [],
  sg: [],
  k8s: [],
  vnet: [],
  vpn: []
};

var cspPoints = {};
var geoCspPoints = {};

function displayCSPListOn() {
  if (cspListDisplayEnabled.checked) {
    cloudLocation = [];
    http.get(csvPath, (response) => {
      response
        .pipe(csv())
        .on("data", (chunk) => cloudLocation.push(chunk))
        .on("end", () => {
          console.log(cloudLocation);

          messageTextArea.value =
            "[Complete] Display Known Cloud Regions: " +
            cloudLocation.length +
            "\n";

          cloudLocation.forEach((location) => {
            const { CloudType, Longitude, Latitude } = location;
            const cloudTypeLower = CloudType.toLowerCase();
            if (!cspPoints[cloudTypeLower]) {
              cspPoints[cloudTypeLower] = [];
            }
            if (!geoCspPoints[cloudTypeLower]) {
              geoCspPoints[cloudTypeLower] = [];
            }

            cspPoints[cloudTypeLower].push([
              parseFloat(Longitude),
              parseFloat(Latitude),
            ]);
          });

          Object.keys(cspPoints).forEach((csp) => {
            if (cspPoints[csp].length > 0) {
              geoCspPoints[csp][0] = new MultiPoint(cspPoints[csp]);
            }
          });
        });
    });
  } else {
    Object.keys(cspPoints).forEach((csp) => {
      cspPoints[csp] = [];
      geoCspPoints[csp] = [];
    });
  }
}
window.displayCSPListOn = displayCSPListOn;

function displayTableOn() {
  // table.innerHTML = "";
}
window.displayTableOn = displayTableOn;

function endpointChanged() {
  //getMci();
  var hostname = document.getElementById('hostname').value;
  var iframe = document.getElementById('iframe');
  var iframe2 = document.getElementById('iframe2');

  iframe.src = "http://" + hostname + ":1324/swagger.html";
  iframe2.src = "http://" + hostname + ":1024/spider/adminweb";
}
window.endpointChanged = endpointChanged;


var alpha = 0.3;
var cororList = [
  [153, 255, 51, alpha],
  [210, 210, 10, alpha],
  [0, 176, 244, alpha],
  [200, 10, 10, alpha],
  [0, 162, 194, alpha],
  [38, 63, 143, alpha],
  [58, 58, 58, alpha],
  [81, 45, 23, alpha],
  [225, 136, 65, alpha],
  [106, 34, 134, alpha],
  [255, 162, 191, alpha],
  [239, 45, 53, alpha],
  [255, 255, 255, alpha],
  [154, 135, 199, alpha],
];

alpha = 0.6;
var cororLineList = [
  [0, 255, 0, alpha],
  [210, 210, 10, alpha],
  [0, 176, 244, alpha],
  [200, 10, 10, alpha],
  [0, 162, 194, alpha],
  [38, 63, 143, alpha],
  [58, 58, 58, alpha],
  [81, 45, 23, alpha],
  [225, 136, 65, alpha],
  [106, 34, 134, alpha],
  [255, 162, 191, alpha],
  [239, 45, 53, alpha],
  [255, 255, 255, alpha],
  [154, 135, 199, alpha],
];

var polygonFeature = new Feature(
  new Polygon([
    [
      [10, -3],
      [-5, 2],
      [-1, 1],
    ],
  ])
);

function createStyle(src) {
  return new Style({
    image: new Icon({
      anchor: [0.5, 0.5],
      crossOrigin: "anonymous",
      src: src,
      imgSize: [50, 50],
      scale: 0.1,
    }),
  });
}

// temporary point
var pnt = new Point([-68, -50]);

addIconToMap("img/iconVm.png", pnt, "001");
var iconStyleVm = new Style({
  image: new Icon({
    crossOrigin: "anonymous",
    src: "img/iconVm.png",
    opacity: 1.0,
    scale: 0.7,
  }),
});
addIconToMap("img/iconK8s.png", pnt, "001");
var iconStyleK8s = new Style({
  image: new Icon({
    crossOrigin: "anonymous",
    src: "img/iconK8s.png",
    opacity: 1.0,
    scale: 0.7,
  }),
});


addIconToMap("img/iconNlb.png", pnt, "001");
var iconStyleNlb = new Style({
  image: new Icon({
    crossOrigin: "anonymous",
    src: "img/iconNlb.png",
    opacity: 1.0,
    scale: 0.8,
  }),
});
addIconToMap("img/iconVPN.png", pnt, "001");
var iconStyleVPN = new Style({
  image: new Icon({
    crossOrigin: "anonymous",
    src: "img/iconVPN.png",
    opacity: 1.0,
    scale: 0.8,
  }),
});

addIconToMap("img/iconVnet.png", pnt, "001");
var iconStyleVnet = new Style({
  image: new Icon({
    crossOrigin: "anonymous",
    src: "img/iconVnet.png",
    opacity: 1.0,
    scale: 0.8,
  }),
});
addIconToMap("img/iconSG.png", pnt, "001");
var iconStyleSG = new Style({
  image: new Icon({
    crossOrigin: "anonymous",
    src: "img/iconSG.png",
    opacity: 1.0,
    scale: 0.8,
  }),
});
addIconToMap("img/iconKey.png", pnt, "001");
var iconStyleKey = new Style({
  image: new Icon({
    crossOrigin: "anonymous",
    src: "img/iconKey.png",
    opacity: 1.0,
    scale: 0.8,
  }),
});

addIconToMap("img/circle.png", pnt, "001");
var iconStyleCircle = new Style({
  image: new Icon({
    crossOrigin: "anonymous",
    src: "img/circle.png",
    opacity: 1.0,

    anchor: [0.4, 0.4],
    anchorXUnits: "fraction",
    anchorYUnits: "fraction",
    scale: 1.5,
    //imgSize: [50, 50]
  }),
});

// CSP location icon styles
const cspIconImg = {
  azure: "img/ht-azure.png",
  aws: "img/ht-aws.png",
  gcp: "img/ht-gcp.png",
  alibaba: "img/ht-alibaba.png",
  cloudit: "img/ht-cloudit.png",
  ibm: "img/ibm.png",
  tencent: "img/tencent.png",
  ncpvpc: "img/ncpvpc.png",
  ncp: "img/ncp.png",
  ktcloud: "img/kt.png",
  ktcloudvpc: "img/ktvpc.png",
  nhncloud: "img/nhn.png",

  // Add more CSP icons here
};

// cspIconStyles
const cspIconStyles = {};

function createIconStyle(imageSrc) {
  return new Style({
    image: new Icon({
      crossOrigin: "anonymous",
      src: imageSrc,
      opacity: 1.0,
      scale: 1.0,
    }),
  });
}

// addIconToMap
Object.keys(cspIconImg).forEach((csp) => {
  cspIconStyles[csp] = createIconStyle(cspIconImg[csp]);
});
function addIconToMap(imageSrc, point, index) {
  var vectorSource = new VectorSource({ projection: "EPSG:4326" });
  var iconFeature = new Feature(point);
  iconFeature.set("style", createStyle(imageSrc));
  iconFeature.set("index", index);
  vectorSource.addFeature(iconFeature);
  var iconLayer = new VectorLayer({
    style: function (feature) {
      return feature.get("style");
    },
    source: vectorSource,
  });
  map.addLayer(iconLayer);
  map.render();
}
Object.keys(cspIconImg).forEach((csp, index) => {
  const iconIndex = index.toString().padStart(3, "0");
  addIconToMap(cspIconImg[csp], pnt, iconIndex);
});

// magenta black blue orange yellow red grey green
function changeColorStatus(status) {
  if (status.includes("Partial")) {
    return "green";
  } else if (status.includes("Running")) {
    return "blue";
  } else if (status.includes("Suspending")) {
    return "black";
  } else if (status.includes("Creating")) {
    return "orange";
  } else if (status.includes("Terminated")) {
    return "red";
  } else if (status.includes("Terminating")) {
    return "grey";
  } else {
    return "grey";
  }
}

function changeSizeStatus(status) {
  if (status.includes("-df")) {
    return 0.4;
  } else if (status.includes("-ws")) {
    return 0.4;
  } else if (status.includes("NLB")) {
    return 1.5;
  } else if (status.includes("Partial")) {
    return 2.4;
  } else if (status.includes("Running")) {
    return 2.5;
  } else if (status.includes("Suspending")) {
    return 2.4;
  } else if (status.includes("Suspended")) {
    return 2.4;
  } else if (status.includes("Creating")) {
    return 2.5;
  } else if (status.includes("Resuming")) {
    return 2.4;
  } else if (status.includes("Terminated")) {
    return 2.4;
  } else if (status.includes("Terminating")) {
    return 2.4;
  } else {
    return 1.0;
  }
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

function returnAdjustmentPoint(index, totalVMs) {
  // Initialize coordinates
  let ax = 0.0;
  let ay = 0.0;

  // First VM (index 0) is placed at center
  if (index === 0) {
    ax = 0;
    ay = 0;
  } else {
    // Circle radius
    const radius = 0.75;

    // Calculate angle step (divide 360° by total VMs)
    const angleStep = 2 * Math.PI / totalVMs;

    // Start at 12 o'clock position
    const startAngle = 3 * Math.PI / 2;

    // Calculate angle for current VM
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

  geometries[cnt] = new Polygon([[ip1, ip2, ip3, ip1]]);
  //cnt++;
}

function makePolyDot(vmPoints) {
  //for (i = 0; i < vmPoints.length; i++) {
  //coordinates.push(vmPoints[i]);
  //}

  var resourcePoints = [];

  for (i = 0; i < vmPoints.length; i++) {
    resourcePoints.push(vmPoints[i]);
  }

  geometriesPoints[cnt] = new MultiPoint(resourcePoints);

  //cnt++;
}

function makePolyArray(vmPoints) {
  //for (i = 0; i < vmPoints.length; i++) {
  //coordinates.push(vmPoints[i]);
  //}

  var resourcePoints = [];

  for (i = 0; i < vmPoints.length; i++) {
    resourcePoints.push(vmPoints[i]);
  }

  //geometriesPoints[cnt] = new MultiPoint(resourcePoints);

  resourcePoints.push(vmPoints[0]);

  geometries[cnt] = new Polygon([resourcePoints]);

  mciGeo[cnt] = new Polygon([resourcePoints]);
  //cnt++;
}

function cross(a, b, o) {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
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

  console.log(ipFrom);
  console.log(ipTo);

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
// setTimeout(() => getMci(), refreshInterval*1000);
//setTimeout(() => console.log(getConnection()), refreshInterval*1000);

function infoAlert(message) {
  Swal.fire({
    // position: 'top-end',
    icon: "info",
    title: message,
    showConfirmButton: false,
    timer: 2500,
  });
}

function errorAlert(message) {
  Swal.fire({
    // position: 'bottom-start',
    icon: "error",
    title: message,
    showConfirmButton: true,
    //timer: 2000
  });
}

function outputAlert(jsonData, type) {
  const jsonOutputConfig = {
    theme: "dark",
  };
  Swal.fire({
    position: "top-end",
    icon: type,
    html: '<div id="json-output" class="form-control" style="height: auto; background-color: black; text-align: left; white-space: pre-wrap; word-break: break-all; overflow-wrap: break-word; overflow-x: auto;"></div>',
    background: "#0e1746",
    showConfirmButton: true,
    width: '40%',
    //backdrop: false,
    didOpen: () => {
      const container = document.getElementById("json-output");
      const formatter = new JSONFormatter(jsonData, Infinity, jsonOutputConfig);
      container.appendChild(formatter.render());
    },
  });
}

function displayJsonData(jsonData, type) {
  const jsonOutputConfig = {
    theme: "dark",
  };
  outputAlert(jsonData, type);
  const messageJsonOutput = document.getElementById("jsonoutput");
  messageJsonOutput.innerHTML = ""; // Clear existing content
  messageJsonOutput.appendChild(
    new JSONFormatter(jsonData, Infinity, jsonOutputConfig).render()
  );
}

function getMci() {
  var hostname = hostnameElement.value;
  var port = portElement.value;
  var username = usernameElement.value;
  var password = passwordElement.value;
  var namespace = namespaceElement.value;

  refreshInterval = document.getElementById("refreshInterval").value;
  var filteredRefreshInterval = isNormalInteger(refreshInterval)
    ? refreshInterval
    : 5;
  setTimeout(() => getMci(), filteredRefreshInterval * 1000);

  var zoomLevel = map.getView().getZoom() * 2.0;
  var radius = 4.0;

  if (namespace && namespace != "") {
    // get mci list and put them on the map
    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mci?option=status`;

    axios({
      method: "get",
      url: url,
      auth: {
        username: `${username}`,
        password: `${password}`,
      },
      timeout: 60000,
    })
      .then((res) => {
        var obj = res.data;

        cnt = cntInit;
        if (obj.mci != null) {
          for (let item of obj.mci) {
            console.log(item);

            var hideFlag = false;
            for (let hideName of mciHideList) {
              if (item.id == hideName) {
                hideFlag = true;
                break;
              }
            }
            if (hideFlag) {
              continue;
            }

            var vmGeo = [];

            var validateNum = 0;
            if (item.vm == null) {
              console.log(item);
              break;
            }
            for (j = 0; j < item.vm.length; j++) {
              //vmGeo.push([(item.vm[j].location.longitude*1) + (Math.round(Math.random()) / zoomLevel - 1) * Math.random()*1, (item.vm[j].location.latitude*1) + (Math.round(Math.random()) / zoomLevel - 1) * Math.random()*1 ])
              if (j == 0) {
                vmGeo.push([
                  item.vm[j].location.longitude * 1,
                  item.vm[j].location.latitude * 1,
                ]);
              } else {
                var groupCnt = 0;
                if ((item.vm[j].location.longitude == item.vm[j - 1].location.longitude) && (item.vm[j].location.latitude == item.vm[j - 1].location.latitude)) {
                  vmGeo.push([
                    item.vm[j].location.longitude * 1 +
                    (returnAdjustmentPoint(j, item.vm.length).ax / zoomLevel) * radius,
                    item.vm[j].location.latitude * 1 +
                    (returnAdjustmentPoint(j, item.vm.length).ay / zoomLevel) * radius,
                  ]);
                } else {
                  vmGeo.push([
                    item.vm[j].location.longitude * 1,
                    item.vm[j].location.latitude * 1,
                  ]);
                }
              }
              validateNum++;
            }
            if (item.vm.length == 1) {
              // handling if there is only one vm so that we can not draw geometry
              vmGeo.pop();
              vmGeo.push([
                item.vm[0].location.longitude * 1,
                item.vm[0].location.latitude * 1,
              ]);
              vmGeo.push([
                item.vm[0].location.longitude * 1 + Math.random() * 0.001,
                item.vm[0].location.latitude * 1 + Math.random() * 0.001,
              ]);
              vmGeo.push([
                item.vm[0].location.longitude * 1 + Math.random() * 0.001,
                item.vm[0].location.latitude * 1 + Math.random() * 0.001,
              ]);
            }
            if (validateNum == item.vm.length) {
              //console.log("Found all GEOs validateNum : " + validateNum);

              //make dots without convexHull
              makePolyDot(vmGeo);
              vmGeo = convexHull(vmGeo);

              mciStatus[cnt] = item.status;

              var newName = item.name;
              if (newName.includes("-nlb")) {
                newName = "NLB";
              }

              if (item.targetAction == "None" || item.targetAction == "") {
                mciName[cnt] = "[" + newName + "]";
              } else {
                mciName[cnt] = item.targetAction + "-> " + "[" + newName + "]";
              }

              //make poly with convexHull
              makePolyArray(vmGeo);

              cnt++;
            }
          }
        } else {
          geometries = [];
        }
      })
      .catch(function (error) {
        console.log(error);
      });

    // get vnet list and put them on the map
    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/resources/vNet`;
    axios({
      method: "get",
      url: url,
      auth: {
        username: `${username}`,
        password: `${password}`,
      },
      timeout: 10000,
    }).then((res) => {
      var obj = res.data;
      if (obj.vNet != null) {
        var resourceLocation = [];
        for (let item of obj.vNet) {
          resourceLocation.push([
            item.connectionConfig.regionDetail.location.longitude * 1,
            item.connectionConfig.regionDetail.location.latitude * 1 - 0.05,
          ]);
          geoResourceLocation.vnet[0] = new MultiPoint([resourceLocation]);
          //console.log("geoResourceLocation.vnet[0]");
          //console.log(geoResourceLocation.vnet[0]);
        }
      } else {
        geoResourceLocation.vnet = [];
      }
    })
      .catch(function (error) {
        console.log(error);
      });

    // get securityGroup list and put them on the map
    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/resources/securityGroup`;
    axios({
      method: "get",
      url: url,
      auth: {
        username: `${username}`,
        password: `${password}`,
      },
      timeout: 10000,
    }).then((res) => {
      var obj = res.data;
      if (obj.securityGroup != null) {
        var resourceLocation = [];
        for (let item of obj.securityGroup) {
          resourceLocation.push([
            item.connectionConfig.regionDetail.location.longitude * 1 - 0.05,
            item.connectionConfig.regionDetail.location.latitude * 1,
          ]);
          geoResourceLocation.sg[0] = new MultiPoint([resourceLocation]);
        }
      } else {
        geoResourceLocation.sg = [];
      }
    })
      .catch(function (error) {
        console.log(error);
      });


    // get sshKey list and put them on the map
    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/resources/sshKey`;
    axios({
      method: "get",
      url: url,
      auth: {
        username: `${username}`,
        password: `${password}`,
      },
      timeout: 10000,
    }).then((res) => {
      var obj = res.data;
      if (obj.sshKey != null) {
        var resourceLocation = [];
        for (let item of obj.sshKey) {
          resourceLocation.push([
            item.connectionConfig.regionDetail.location.longitude * 1 + 0.05,
            item.connectionConfig.regionDetail.location.latitude * 1,
          ]);
          geoResourceLocation.sshKey[0] = new MultiPoint([resourceLocation]);
        }
      } else {
        geoResourceLocation.sshKey = [];
      }
    })
      .catch(function (error) {
        console.log(error);
      });

    // get k8sCluster list and put them on the map
    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/k8sCluster`;
    axios({
      method: "get",
      url: url,
      auth: {
        username: `${username}`,
        password: `${password}`,
      },
      timeout: 10000,
    }).then((res) => {
      var obj = res.data;
      if (obj.K8sClusterInfo != null && obj.K8sClusterInfo.length > 0) {
        var resourceLocation = [];
        console.log("resourceLocation k8s[0]");
        for (let item of obj.K8sClusterInfo) {
          resourceLocation.push([
            item.connectionConfig.regionDetail.location.longitude * 1,
            item.connectionConfig.regionDetail.location.latitude * 1 + 0.05,
          ]);
        }
        console.log(resourceLocation);
        if (resourceLocation.length > 0) {
          geoResourceLocation.k8s[0] = new MultiPoint([resourceLocation]);
        } else {
          geoResourceLocation.k8s = [];
        }
      } else {
        geoResourceLocation.k8s = [];
      }
    })
      .catch(function (error) {
        console.log(error);
      });

    // get VPN list and put them on the map
    var url = `http://${hostname}:${port}/tumblebug/resources/vpn?labelSelector=togetall%20!exists`;
    axios({
      method: "get",
      url: url,
      auth: {
        username: `${username}`,
        password: `${password}`,
      },
      timeout: 10000,
    }).then((res) => {
      var obj = res.data;
      if (obj != null) {
        var resourceLocation = [];
        if (obj.results != null) {
          for (let result of obj.results) {
            if (result.vpnSites != null) {
              for (let item of result.vpnSites) {
                resourceLocation.push([
                  item.connectionConfig.regionDetail.location.longitude * 1,
                  item.connectionConfig.regionDetail.location.latitude * 1 + 0.05,
                ]);
                geoResourceLocation.vpn[0] = new MultiPoint([resourceLocation]);
                console.log("geoResourceLocation.vpn[0]");
                console.log(geoResourceLocation.vpn[0]);
              }
            }
          }
        }
      } else {
        geoResourceLocation.vpn = [];
      }
    })
      .catch(function (error) {
        console.log(error);
      });
  }
}

// Get list of cloud connections
function getConnection() {
  // let timerInterval;
  // Swal.fire({
  //   title: "Show registered Cloud Regions to the Map",
  //   html: "closed in <b></b> milliseconds.",
  //   timer: 2000,
  //   timerProgressBar: true,
  //   position: "top-end",
  //   didOpen: () => {
  //     Swal.showLoading();
  //     const b = Swal.getHtmlContainer().querySelector("b");
  //     timerInterval = setInterval(() => {
  //       b.textContent = Swal.getTimerLeft();
  //     }, 100);
  //   },
  //   willClose: () => {
  //     clearInterval(timerInterval);
  //   },
  // }).then((result) => {
  //   /* Read more about handling dismissals below */
  //   if (result.dismiss === Swal.DismissReason.timer) {
  //     console.log("I was closed by the timer");
  //   }
  // });

  // Initialize provider select element with "ALL"
  var providerSelect = document.getElementById(typeStringProvider);
  providerSelect.innerHTML = ''; // Clear existing options
  var allOption = document.createElement("option");
  allOption.value = "";
  allOption.text = "ALL";
  providerSelect.appendChild(allOption);

  var separatorOption = document.createElement("option");
  separatorOption.value = "";
  separatorOption.text = "-----";
  separatorOption.disabled = true; // Disable the separator option
  providerSelect.appendChild(separatorOption);

  var hostname = hostnameElement.value;
  var port = portElement.value;
  var username = usernameElement.value;
  var password = passwordElement.value;

  refreshInterval = document.getElementById("refreshInterval").value;
  var filteredRefreshInterval = isNormalInteger(refreshInterval)
    ? refreshInterval
    : 5;
  //setTimeout(() => console.log(getConnection()), filteredRefreshInterval*1000);

  var url = `http://${hostname}:${port}/tumblebug/connConfig?filterVerified=true&filterRegionRepresentative=true`;

  axios({
    method: "get",
    url: url,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
    timeout: 60000,
  })
    .then((res) => {
      var obj = res.data;
      if (obj.connectionconfig != null) {
        messageTextArea.value =
          "[Complete] Registered Cloud Regions: " +
          obj.connectionconfig.length +
          "\n";

        obj.connectionconfig.forEach((config, i) => {
          const providerName = config.providerName;
          const longitude = config.regionDetail.location.longitude;
          const latitude = config.regionDetail.location.latitude;
          const briefAddr = config.regionDetail.location.display;
          const nativeRegion = config.regionDetail.regionName;

          messageTextArea.value +=
            "[" +
            i +
            "] " +
            config.providerName +
            "(" +
            nativeRegion +
            ")" +
            "\t\t\t" +
            "Location: " +
            longitude +
            "|" +
            latitude +
            " (" +
            briefAddr +
            ")\n";

          if (!cspPoints[providerName]) {
            cspPoints[providerName] = [];
          }

          cspPoints[providerName].push([longitude, latitude]);

          // Add the provider to the provider select dropdown if it doesn't already exist
          var providerSelect = document.getElementById(typeStringProvider);
          var isDuplicate = Array.from(providerSelect.options).some(option => option.value === providerName);
          if (!isDuplicate) {
            var option = document.createElement("option");
            option.value = providerName;
            option.text = providerName.toUpperCase();
            providerSelect.appendChild(option);
          }

          if (!geoCspPoints[providerName]) {
            geoCspPoints[providerName] = [];
          }
          geoCspPoints[providerName][0] = new MultiPoint(
            cspPoints[providerName]
          );
        });
        map.render();

        infoAlert("Registered Cloud Regions: " + obj.connectionconfig.length);
      }
    })
    .catch(function (error) {
      if (error.request) {
        document.getElementById("hostname").style.color = "#FF0000";
        document.getElementById("port").style.color = "#FF0000";
      }
      console.log(error);

      Swal.fire({
        title: 'Cannot Get the Cloud information',
        html: `
        <style>
          .swal2-input-container {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            margin-bottom: 10px;
          }
          .swal2-label {
            margin-bottom: 5px;
            font-weight: bold;
          }
          .swal2-input {
            width: 80%;
          }
        </style>
        <p>- Please check the server is ready</p>
        <p>- Update the API endpoint if needed</p>
        <div class="swal2-input-container">
          <label for="hostname-input" class="swal2-label">Hostname:</label>
          <input id="hostname-input" class="swal2-input" placeholder="Enter the hostname" value="${hostnameElement.value}">
        </div>
        <div class="swal2-input-container">
          <label for="port-input" class="swal2-label">Port:</label>
          <input id="port-input" class="swal2-input" placeholder="Enter the port number" value="${portElement.value}">
        </div>
        <div class="swal2-input-container">
          <label for="username-input" class="swal2-label">Username:</label>
          <input id="username-input" class="swal2-input" placeholder="Enter the username" value="${usernameElement.value}">
        </div>
        <div class="swal2-input-container">
          <label for="password-input" class="swal2-label">Password:</label>
          <input id="password-input" class="swal2-input" type="password" placeholder="Enter the password" value="${passwordElement.value}">
        </div>
      `,
        showCancelButton: true,
        confirmButtonText: 'confirm',
        preConfirm: () => {
          const hostname = document.getElementById('hostname-input').value;
          const port = document.getElementById('port-input').value;
          const username = document.getElementById('username-input').value;
          const password = document.getElementById('password-input').value;
          return { hostname, port, username, password };
        }
      }).then((result) => {
        if (result.isConfirmed) {
          const { hostname, port, username, password } = result.value;
          hostnameElement.value = hostname;
          portElement.value = port;
          usernameElement.value = username;
          passwordElement.value = password;
          getConnection();
          updateNsList();
          getMci();
        }
      });

    });
}
window.getConnection = getConnection;

function isNormalInteger(str) {
  var n = Math.floor(Number(str));
  return n !== Infinity && String(n) === str && n > 0;
}

var createMciReqTmplt = {
  description: "Made via cb-mapui",
  installMonAgent: "no",
  name: "mci",
  vm: [],
};

var createMciReqVmTmplt = {
  commonImage: "ubuntu22.04",
  commonSpec: "",
  description: "mapui",
  rootDiskType: "default",
  rootDiskSize: "default",
  subGroupSize: "",
  name: "",
};

function createMci() {
  if (vmReqeustFromSpecList.length != 0) {
    var hostname = hostnameElement.value;
    var port = portElement.value;
    var username = usernameElement.value;
    var password = passwordElement.value;
    var namespace = namespaceElement.value;

    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mciDynamic`;

    var randomString = Math.random().toString(36).substr(2, 5);

    var createMciReq = createMciReqTmplt;
    createMciReq.name = "mc-" + `${randomString}`;
    createMciReq.vm = vmReqeustFromSpecList;
    let totalCost = 0;
    let totalNodeScale = 0;

    var subGroupReqString = "";
    for (i = 0; i < createMciReq.vm.length; i++) {

      totalNodeScale += parseInt(createMciReq.vm[i].subGroupSize);
      let costPerHour = recommendedSpecList[i].costPerHour;
      let subTotalCost = "unknown";
      if (costPerHour == "-1" || costPerHour == "") {
        costPerHour = "unknown";
        costPerHour = "<tr><th style='width: 50%;'>Estimated Price(USD/1H)</th><td><b><span style='color: red; '>$" + subTotalCost + "  ($" + costPerHour + " * " + createMciReq.vm[i].subGroupSize + ")" + "</span></b></td></tr>";
      } else {
        totalCost += parseFloat(costPerHour) * createMciReq.vm[i].subGroupSize;

        subTotalCost = (parseFloat(costPerHour) * createMciReq.vm[i].subGroupSize).toFixed(4);
        costPerHour = "<tr><th style='width: 50%;'>Estimated Price(USD/1H)</th><td><b><span style='color: red; '>$" + subTotalCost + "  ($" + costPerHour + " * " + createMciReq.vm[i].subGroupSize + ")" + "</span></b></td></tr>";
      }
      let acceleratorType = recommendedSpecList[i].acceleratorType;
      let acceleratorModel = recommendedSpecList[i].acceleratorModel;
      if (acceleratorType == "gpu") {
        acceleratorType = "<tr><th style='width: 50%;'>Accelerator</th><td><b><span style='color: red; '>GPU (" + acceleratorModel + ")</span></b></td></tr>"
      } else {
        acceleratorType = "<tr><th style='width: 50%;'>Accelerator</th><td><b><span style='color: black;'>none</span></b></td></tr>"
      }

      var html =
        "<font size=3>" +
        "<table style='width:80%; text-align:left; margin-top:20px; margin-left:10px; table-layout: auto;'>" +
        "<tr><th style='width: 50%;'>[#" + (i + 1).toString() + "] SubGroup Name</th><td><b><span style='color: black; '>" + createMciReq.vm[i].name + " (" + createMciReq.vm[i].subGroupSize + " node(s))</span></b></td></tr>" +
        costPerHour +
        "<tr><th style='width: 50%;'>Spec</th><td><b><span style='color: blue; '>" + createMciReq.vm[i].commonSpec + "</span></b></td></tr>" +
        "<tr><th style='width: 50%;'>vCPU</th><td><b>" + recommendedSpecList[i].vCPU + "</b></td></tr>" +
        "<tr><th style='width: 50%;'>Mem(GiB)</th><td><b>" + recommendedSpecList[i].memoryGiB + "</b></td></tr>" +
        acceleratorType +
        "<tr><th style='width: 50%;'>RootDisk(GB)</th><td><b>" + createMciReq.vm[i].rootDiskSize + " (type: " + createMciReq.vm[i].rootDiskType + ")</b></td></tr>" +
        "<tr><th style='width: 50%;'>Selected Image</th><td><b><span style='color: green; '>" + createMciReq.vm[i].commonImage + "</span></b></td></tr>" +

        ((createMciReq.vm[i].label && Object.keys(createMciReq.vm[i].label).length > 0) ?
          "<tr><th style='width: 50%;'>Labels</th><td><b><span style='color: purple; '>" +
          Object.entries(createMciReq.vm[i].label).map(([key, value]) =>
            `${key}=${value}`
          ).join(", ") +
          "</span></b></td></tr>" : "") +

        "</table>" +
        "<hr>"
        ;

      subGroupReqString = subGroupReqString + html;
    }


    var costDetailsHtml =

      "<table style='width:80%; text-align:left; margin-top:20px; margin-left:10px; table-layout: auto;'>" +
      "<tr><th><b>Usage Period</b></th><td><b>Estimated Cost</b></td></tr>" +
      "<tr><th>Hourly</th><td><span style='color: red; '><b>$" + totalCost.toFixed(4) + "</span></td></tr>" +
      "<tr><th>Daily</th><td><span style='color: red; '><b>$" + (totalCost * 24).toFixed(4) + "</span></td></tr>" +
      "<tr><th>Monthly</th><td><span style='color: red; '><b>$" + (totalCost * 24 * 31).toFixed(4) + "</span></td></tr>" +
      "</table> <br>(Do not rely on this estimated cost. It is just an estimation using spec price.)<br>";


    var hasUserConfirmed = false;

    Swal.fire({
      title: "Enter the name of the MCI you wish to create",
      input: "text",
      inputAttributes: {
        autocapitalize: "off",
      },
      inputValue: createMciReq.name,
      showCancelButton: true,
      confirmButtonText: "Confirm",
    }).then((result) => {
      if (result.value) {
        createMciReq.name = result.value;

        Swal.fire({
          title: "Are you sure you want to create this MCI?",
          width: 750,
          html:
            "<font size=4>" +
            "<br><b><span style='color: black; font-size: larger;'>" + createMciReq.name + " </b> (" + totalNodeScale + " node(s))" + "</span><br>" +
            "<hr>" +
            costDetailsHtml +
            "<hr>" +
            subGroupReqString +
            "<br><br><input type='checkbox' id='hold-checkbox'> Hold VM provisioning of the MCI" +
            "<br><input type='checkbox' id='monitoring-checkbox'> Deploy a monitoring agent" +
            "<br><input type='checkbox' id='postcommand-checkbox'> Add post-deployment commands",
          showCancelButton: true,
          confirmButtonText: "Confirm",
          scrollbarPadding: false,

          preConfirm: () => {
            return {
              monitoring: document.getElementById('monitoring-checkbox').checked,
              hold: document.getElementById('hold-checkbox').checked,
              addPostCommand: document.getElementById('postcommand-checkbox').checked
            };
          }


        }).then((result) => {
          if (result.isConfirmed) {
            createMciReq.installMonAgent = "no";
            if (result.value.monitoring) {
              Swal.fire("Create MCI with a monitoring agent");
              createMciReq.installMonAgent = "yes";
            }
            if (result.value.hold) {
              Swal.fire("Create MCI with hold option. It will not be deployed immediately. Use Action:Continue when you are ready.");
              url += "?option=hold";
            }

            if (result.value.addPostCommand) {
              // Show postCommand input popup
              Swal.fire({
                title: "<font size=5><b>Add post-deployment commands</b></font>",
                width: 900,
                html: `
                  <div id="dynamicContainer" style="text-align: left;">
                    <p><font size=4><b>[Commands]</b></font></p>
                    <div id="cmdContainer" style="margin-bottom: 20px;">
                      <div id="cmdDiv1" class="cmdRow">
                        Command 1: <input type="text" id="cmd1" style="width: 75%" value="${defaultRemoteCommand[0]}">
                        <button onclick="document.getElementById('cmd1').value = ''">Clear</button>
                      </div>
                      <div id="cmdDiv2" class="cmdRow">
                        Command 2: <input type="text" id="cmd2" style="width: 75%" value="${defaultRemoteCommand[1]}">
                        <button onclick="document.getElementById('cmd2').value = ''">Clear</button>
                      </div>
                      <div id="cmdDiv3" class="cmdRow">
                        Command 3: <input type="text" id="cmd3" style="width: 75%" value="${defaultRemoteCommand[2]}">
                        <button onclick="document.getElementById('cmd3').value = ''">Clear</button>
                      </div>
                      <button id="addCmd" onclick="addCmd()" style="margin-left: 1px;"> + </button>
                    </div>

                    <p><font size=4><b>[Predefined Scripts]</b></font></p>
                    <div style="margin-bottom: 15px;">
                      <select id="predefinedScripts" style="width: 75%; padding: 5px;" onchange="loadPredefinedScript()">
                        <option value="">-- Select a predefined script --</option>
            <option value="Nvidia">[GPU Driver] Nvidia CUDA Driver</option>
            <option value="Nvidia-Status">[GPU Driver] Check Nvidia CUDA Driver</option>
            <option value="Setup-CrossNAT">[Network Config] Setup Cross NAT</option>
            <option value="vLLM">[LLM vLLM] vLLM Server</option>
            <option value="Ollama">[LLM Ollama] Ollama LLM Server</option>
            <option value="OllamaPull">[LLM Model] Ollama Model Pull</option>
            <option value="OpenWebUI">[LLM WebUI] Open WebUI for Ollama</option>
            <option value="RayHead-Deploy">[ML Ray] Deploy Ray Cluster (Head)</option>
            <option value="RayWorker-Deploy">[ML Ray] Deploy Ray Cluster (Worker)</option>
            <option value="WeaveScope">[Observability] Weave Scope</option>
            <option value="ELK">[Observability] ELK Stack</option>
            <option value="Jitsi">[Video Conference] Jitsi Meet</option>
            <option value="Xonotic">[Game:FPS] Xonotic Game Server</option>
            <option value="Westward">[Game:MMORPG] Westward Game</option>
            <option value="Nginx">[Web:Server] Nginx Web Server</option>
            <option value="Stress">[Web:Stress] Stress Test</option>
                      </select>
                      <div style="font-size: 0.8em; color: #666; margin-top: 3px;">
                        Select a predefined script to auto-fill the command fields
                      </div>
                    </div>        

                    <p><font size=4><b>[Label Selector]</b></font></p>
                    <div style="margin-bottom: 15px;">
                      <input type="text" id="labelSelector" style="width: 75%" placeholder="ex: role=worker,env=production">
                      <div style="font-size: 0.8em; color: #666; margin-top: 3px;">
                        ex: Optional: set targets by the label (ex: role=worker,env=production,sys.id=g1-2)
                      </div>
                    </div>
                    
                  </div>`,
                showCancelButton: true,
                confirmButtonText: "Confirm",
                didOpen: () => {
                  window.addCmd = () => {
                    const cmdContainer = document.getElementById('cmdContainer');
                    const cmdCount = cmdContainer.children.length;
                    if (cmdCount >= 10) {
                      Swal.showValidationMessage('Maximum 10 commands allowed');
                      return;
                    }
                    const newCmdDiv = document.createElement('div');
                    newCmdDiv.id = `cmdDiv${cmdCount}`;
                    newCmdDiv.className = 'cmdRow';
                    newCmdDiv.innerHTML = `
                      Command ${cmdCount}: <input type="text" id="cmd${cmdCount}" style="width: 75%">
                      <button onclick="document.getElementById('cmd${cmdCount}').value = ''">Clear</button>
                    `;
                    cmdContainer.appendChild(newCmdDiv);
                  };

                  // Use predefined script dropdown to load default commands
                  const scriptSelect = document.getElementById('predefinedScripts');
                  if (scriptSelect) {
                    scriptSelect.removeEventListener('change', window.loadPredefinedScript);
                    scriptSelect.addEventListener('change', window.loadPredefinedScript);
                    if (scriptSelect.value) {
                      window.loadPredefinedScript();
                    }
                  }

                },
                preConfirm: () => {
                  const commands = [];
                  const cmdContainer = document.getElementById('cmdContainer');
                  for (let i = 1; i <= cmdContainer.children.length - 1; i++) {
                    const cmdInput = document.getElementById(`cmd${i}`);
                    if (cmdInput && cmdInput.value.trim()) {
                      commands.push(cmdInput.value.trim());
                    }
                  }
                  return commands;
                },
              }).then((cmdResult) => {
                if (cmdResult.isConfirmed && cmdResult.value && cmdResult.value.length > 0) {
                  createMciReq.postCommand = {
                    command: cmdResult.value,
                    userName: "cb-user"
                  };
                  proceedWithMciCreation(createMciReq, url, username, password);
                }
                // User cancelled the postCommand dialog or no commands were entered
              });
            } else {
              // No postCommand needed, proceed with MCI creation
              proceedWithMciCreation(createMciReq, url, username, password);
            }

            // Extracted the MCI creation process into a function to avoid code duplication
            function proceedWithMciCreation(createMciReq, url, username, password) {
              var jsonBody = JSON.stringify(createMciReq, undefined, 4);
              messageTextArea.value = " Creating MCI ...";
              var spinnerId = addSpinnerTask(
                "Creating MCI: " + createMciReq.name
              );

              var requestId = generateRandomRequestId("mci-" + createMciReq.name + "-", 10);
              addRequestIdToSelect(requestId);

              axios({
                method: "post",
                url: url,
                headers: { "Content-Type": "application/json", "x-request-id": requestId },
                data: jsonBody,
                auth: {
                  username: `${username}`,
                  password: `${password}`,
                },
              })
                .then((res) => {
                  console.log(res); // for debug

                  displayJsonData(res.data, typeInfo);
                  handleAxiosResponse(res);

                  updateMciList();

                  clearCircle("none");
                  messageTextArea.value = "Created " + createMciReq.name;
                })
                .catch(function (error) {
                  errorAlert("Failed to create MCI: " + createMciReq.name);
                  if (error.response) {
                    // status code is not 2xx
                    console.log(error.response.data);
                    console.log(error.response.status);
                    console.log(error.response.headers);
                    displayJsonData(error.response.data, typeError);
                  } else {
                    console.log("Error", error.message);
                  }
                  console.log(error.config);
                })
                .finally(function () {
                  removeSpinnerTask(spinnerId);
                });
            }
          }
        });
      }
    });
  } else {
    messageTextArea.value =
      " To create a MCI, VMs should be configured!\n Click the Map to add a config for VM request.";
    errorAlert("Please configure MCI first\n(Click the Map to add VMs)");
  }
}
window.createMci = createMci;


// Define the toggleTable function in the global scope
function toggleTable() {
  var table = document.getElementById('fullTable');
  table.style.display = table.style.display === 'none' ? 'block' : 'none';
}

function getRecommendedSpec(idx, latitude, longitude) {
  var hostname = hostnameElement.value;
  var port = portElement.value;
  var username = usernameElement.value;
  var password = passwordElement.value;

  var minVCPU = document.getElementById("minVCPU").value;
  var maxVCPU = document.getElementById("maxVCPU").value;
  var minRAM = document.getElementById("minRAM").value;
  var maxRAM = document.getElementById("maxRAM").value;
  var specName = document.getElementById("specName").value;
  var architecture = document.getElementById("architecture").value;
  var providerName = document.getElementById("provider").value;
  var acceleratorType = document.getElementById("acceleratorType").value;
  var acceleratorModel = document.getElementById("acceleratorModel").value;
  var minAcceleratorCount = document.getElementById("minAcceleratorCount").value;
  var maxAcceleratorCount = document.getElementById("maxAcceleratorCount").value;
  var minAMEM = document.getElementById("minAMEM").value;
  var maxAMEM = document.getElementById("maxAMEM").value;

  var url = `http://${hostname}:${port}/tumblebug/mciRecommendVm`;

  function createPolicyConditions(metric, values, type) {
    const conditions = [];

    if (type === 'range') {
      if (values.min) conditions.push({ operand: `${values.min}`, operator: ">=" });
      if (values.max) conditions.push({ operand: `${values.max}`, operator: "<=" });
    } else if (type === 'single') {
      if (values.value) conditions.push({ operand: `${values.value}` });
    }

    return { metric: metric, condition: conditions };
  }

  var policies = [
    createPolicyConditions("vCPU", { min: minVCPU, max: maxVCPU }, "range"),
    createPolicyConditions("MemoryGiB", { min: minRAM, max: maxRAM }, "range"),
    createPolicyConditions("CspSpecName", { value: specName }, "single"),
    createPolicyConditions("ProviderName", { value: providerName }, "single"),
    createPolicyConditions("Architecture", { value: architecture }, "single"),
    createPolicyConditions("AcceleratorType", { value: acceleratorType }, "single"),
    createPolicyConditions("AcceleratorModel", { value: acceleratorModel }, "single"),
    createPolicyConditions("AcceleratorMemoryGB", { min: minAMEM, max: maxAMEM }, "range"),
    createPolicyConditions("AcceleratorCount", { min: minAcceleratorCount, max: maxAcceleratorCount }, "range"),
  ];

  var recommendationPolicy = recommendPolicy.value;
  var priorities = {
    "location": {
      metric: "location",
      parameter: [{ key: "coordinateClose", val: [`${latitude}/${longitude}`] }],
      weight: "1.0"
    },
    "cost": {
      metric: "cost",
      weight: "1.0"
    },
    "performance": {
      metric: "performance",
      weight: "1.0"
    },
    "random": {
      metric: "random",
      weight: "1.0"
    }
  };

  var struct = {
    filter: { policy: policies },
    limit: "200",
    priority: { policy: [priorities[recommendationPolicy]] }
  };

  var jsonBody = JSON.stringify(struct);
  console.log("Request body for mciDynamicCheckRequest:", jsonBody);

  axios({
    method: "post",
    url: url,
    headers: { "Content-Type": "application/json" },
    data: jsonBody,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
  }).then((res) => {
    console.log(res); // for debug
    handleAxiosResponse(res);

    if (res.data == null || res.data.length == 0) {
      errorAlert("No recommended spec found with the given condition");
      return;
    }

    // Spec selection popup
    Swal.fire({
      title: "Select a Spec from the Recommendation List",
      width: 900,

      // Spec selection popup HTML part with row selection instead of buttons
      html: `
  <div class="compact-datatable">
    <div class="table-responsive">
      <table id="specSelectionTable" class="display nowrap" style="width:100%">
        <thead>
          <tr>
            <th>#</th>
            <th>CSP</th>
            <th>Region</th>
            <th>SpecName</th>
            <th>Arch</th>
            <th>vCPU</th>
            <th>Mem(Gi)</th>
            <th>Cost($/h)</th>
            <th>Accelerator</th>
          </tr>
        </thead>
        <tbody>
          ${res.data.map((spec, index) => {
        let costPerHour = spec.costPerHour === "-1" || spec.costPerHour === ""
          ? "unknown"
          : `$${spec.costPerHour}`;


        let acceleratorInfo;
        if (spec.acceleratorModel && spec.acceleratorModel !== "undefined" && spec.acceleratorModel !== "") {
          acceleratorInfo = `<span style="color:red;font-weight:bold">${spec.acceleratorModel} (C:${spec.acceleratorCount} ${spec.acceleratorMemoryGB})</span>`;
        } else {
          acceleratorInfo = "None";
        }

        return `
              <tr id="spec-row-${index}" class="${index === 0 ? 'selected-spec' : ''}" data-index="${index}">
                <td class="text-left">${index + 1}</td>
                <td class="text-left">${spec.providerName.toUpperCase()}</td>
                <td class="text-left">${spec.regionName}</td>
                <td class="text-left">${spec.cspSpecName}</td>
                <td>${spec.architecture}</td>
                <td>${spec.vCPU}</td>
                <td>${spec.memoryGiB}</td>
                <td>${costPerHour}</td>
                <td class="text-left">${acceleratorInfo}</td>
              </tr>
            `;
      }).join('')}
        </tbody>
      </table>
    </div>
    <div id="specDetailsContainer" style="margin-top:15px;padding:8px;border:1px solid #ddd;border-radius:5px;">
      <h5 style="font-size: 0.85rem;margin-bottom:5px;">Selected Spec Details</h5>
      <div id="specDetailsContent"></div>
    </div>
    <input type="hidden" id="selectedSpecIndex" value="0">
  </div>
  <style>
    /* Apply compact styling to all DataTable elements */
    .compact-datatable {
      font-size: 0.8rem;
    }
    
    /* Stronger highlight for selected row */
    .selected-spec {
      background-color: rgba(40, 167, 69, 0.35) !important;
      border-left: 5px solid rgb(40, 167, 69) !important;
      font-weight: bold;
    }
    table.dataTable tbody tr.selected-spec {
      background-color: rgba(40, 167, 69, 0.35) !important;
      border-left: 5px solid rgb(40, 167, 69) !important;
    }
    
    /* Make rows clickable */
    #specSelectionTable tbody tr {
      cursor: pointer;
    }
    #specSelectionTable tbody tr:hover {
      background-color: rgba(0, 123, 255, 0.08) !important;
    }
    
    /* Reduce spacing in details section */
    #specDetailsContent .row p {
      margin-bottom: 0.2rem;
    }
  </style>
`,
      didOpen: () => {
        // Set up row click event for the table
        $('#specSelectionTable tbody').on('click', 'tr', function () {
          const index = $(this).data('index');
          selectSpecRow(index);
        });

        // Spec selection function
        window.selectSpecRow = function (index) {
          // Reset previous selection
          document.querySelectorAll('#specSelectionTable tbody tr').forEach(row => {
            row.classList.remove('selected-spec');
          });

          // Select new row
          const selectedRow = document.getElementById(`spec-row-${index}`);
          if (selectedRow) {
            selectedRow.classList.add('selected-spec');
          }

          // Save selected index and update details
          document.getElementById('selectedSpecIndex').value = index;
          updateSpecDetails(index);
        };

        // Update spec details function
        function updateSpecDetails(index) {
          const spec = res.data[index];
          let costPerHour = spec.costPerHour === "-1" || spec.costPerHour === "" ? "unknown" : `$${spec.costPerHour}`;

          let acceleratorDetails = "";
          if (spec.acceleratorType === "gpu") {
            acceleratorDetails = `
              <div class="row">
                <div class="col-md-6">
                  <p><strong>Accelerator Type:</strong> <span style="color:red">GPU</span></p>
                  <p><strong>Accelerator Model:</strong> <span style="color:red">${spec.acceleratorModel}</span></p>
                </div>
                <div class="col-md-6">
                  <p><strong>Accelerator Count:</strong> ${spec.acceleratorCount}</p>
                  <p><strong>Accelerator Memory:</strong> ${spec.acceleratorMemoryGB} GB</p>
                </div>
              </div>
            `;
          }

          // Format the details as key-value pairs
          let specDetailsHTML = "";
          if (spec.details && Array.isArray(spec.details) && spec.details.length > 0) {
            specDetailsHTML = `
              <div class="mt-2">
                <div style="max-height: 140px; overflow-y: auto; font-size: 0.75rem;">
                  <table class="table table-sm table-bordered">
                    <tbody>
                      ${spec.details.map(item =>
              `<tr>
                          <td style="width: 40%"><strong>${item.key}</strong></td>
                          <td>${item.value}</td>
                        </tr>`
            ).join('')}
                    </tbody>
                  </table>
                </div>
              </div>
            `;
          }
          const detailsHTML = `
            ${acceleratorDetails}
            ${specDetailsHTML}
          `;

          document.getElementById('specDetailsContent').innerHTML = detailsHTML;
        }

        // Initialize DataTable
        $('#specSelectionTable').DataTable({
          "paging": true,
          "searching": true,
          "ordering": true,
          "info": true,
          "responsive": true,
          "scrollX": true,
          "pageLength": 5,
          "lengthMenu": [5, 10, 25, 50],
          "order": [[0, 'asc']],
          "columnDefs": [
            {
              "targets": -1,
              "orderable": false
            }
          ],
          "language": {
            "search": "Filtering Keyword:",
            "lengthMenu": "Show _MENU_ entries",
            "info": "_START_ - _END_ of _TOTAL_",
            "infoEmpty": "No data available",
            "paginate": {
              "first": "First",
              "last": "Last",
              "next": "Next",
              "previous": "Previous"
            }
          }
        });

        // Initialize spec details
        updateSpecDetails(0);
      },
      showCancelButton: true,
      confirmButtonText: "Continue",
      cancelButtonText: "Cancel",
      preConfirm: () => {
        return parseInt(document.getElementById('selectedSpecIndex').value);
      }
    }).then((result) => {
      if (result.isConfirmed) {
        // User selected a spec and confirmed
        var selectedSpec = res.data[result.value];
        console.log("User selected spec:", selectedSpec);

        // Search for images based on the selected spec
        const searchImageURL = `http://${hostname}:${port}/tumblebug/ns/system/resources/searchImage`;
        const searchImageBody = {
          providerName: selectedSpec.providerName,
          regionName: selectedSpec.regionName,
          osType: document.getElementById("osImage").value,
          osArchitecture: selectedSpec.architecture,
        };

        console.log("Searching images for selected spec:", selectedSpec.id);

        // Search images API call
        axios({
          method: "post",
          url: searchImageURL,
          headers: { "Content-Type": "application/json" },
          data: JSON.stringify(searchImageBody),
          auth: {
            username: `${username}`,
            password: `${password}`,
          },
        }).then((searchRes) => {
          console.log("searchImage response:", searchRes.data);

          let availableImages = [];
          if (searchRes.data && searchRes.data.imageList && searchRes.data.imageList.length > 0) {
            availableImages = searchRes.data.imageList.map(img => ({
              id: img.id || "unknown",
              cspImageName: img.cspImageName || "unknown",
              osType: img.osType || "unknown",
              osDistribution: img.osDistribution || "unknown",
              osArchitecture: img.osArchitecture || "unknown",
              creationDate: img.creationDate || "unknown",
              description: img.description || "No description",
              imageStatus: img.imageStatus || "unknown",
              osPlatform: img.osPlatform || "unknown",
              osDiskType: img.osDiskType || "unknown",
              osDiskSizeGB: img.osDiskSizeGB || "unknown",
              providerName: img.providerName || "unknown",
              connectionName: img.connectionName || "unknown",
              infraType: img.infraType || "unknown",
              isGPUImage: img.isGPUImage || false,
              isKubernetesImage: img.isKubernetesImage || false,
              isBasicImage: img.isBasicImage || false,
              details: img.details || []
            }));

            console.log("Available images for this spec:");
            console.table(availableImages);
          }

          if (availableImages.length === 0) {
            errorAlert("No images found for the selected specification");
            return;
          }

          // Image selection popup
          Swal.fire({
            title: "Select an Image from the Image Search List",
            width: 1200,
            html: `
              <div class="compact-datatable">
                <div class="table-responsive">
                  <table id="imageSelectionTable" class="display nowrap" style="width:100%">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>OS Type</th>
                        <th>Image Name</th>
                        <th>Distribution</th>
                        <th>Support</th>
                        <th>Arch</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${availableImages.map((image, index) => {
                        // Simple T/F display for GPU and Kubernetes support
                        const gpuSupport = image.isGPUImage ? 'T' : 'F';
                        const k8sSupport = image.isKubernetesImage ? 'T' : 'F';
                        
                        // Add special styling for basic images
                        const isBasicClass = image.isBasicImage ? 'basic-image-row' : '';
                        const basicIcon = image.isBasicImage ? ' <span class="basic-image-icon" title="Basic OS Image">⭐</span>' : '';
                        const mlIcon = image.isGPUImage ? ' <span class="ml-image-icon" title="GPU Support">🧮</span>' : '';
                        const k8sIcon = image.isKubernetesImage ? ' <span class="k8s-image-icon" title="Kubernetes Support">☸️</span>' : '';
                        
                        // Truncate long text for better table layout - increased limits for more space
                        const truncateText = (text, maxLength) => {
                          if (text.length <= maxLength) return text;
                          return text.substring(0, maxLength) + '..';
                        };
                        
                        const truncatedImageName = truncateText(image.cspImageName, 70);
                        const truncatedDistribution = truncateText(image.osDistribution, 70);
                        
                        return `
                          <tr id="image-row-${index}" class="${index === 0 ? 'selected-image' : ''} ${isBasicClass}" data-index="${index}">
                            <td class="text-left">${index + 1}${basicIcon}</td>
                            <td class="text-left">${image.osType}</td>
                            <td class="text-left" style="font-size: 0.85em; color: #0066cc;" title="${image.cspImageName}">${truncatedImageName}</td>
                            <td class="text-left" style="font-size: 0.9em;" title="${image.osDistribution}">${truncatedDistribution}</td>
                            <td class="text-center">${mlIcon}${k8sIcon}</td>
                            <td class="text-center">${image.osArchitecture}</td>
                          </tr>
                        `;
                      }).join('')}
                    </tbody>
                  </table>
                </div>
                <div id="imageDetailsContainer" style="margin-top:15px;padding:8px;border:1px solid #ddd;border-radius:5px;">
                  <div id="imageDetailsContent"></div>
                </div>
                <input type="hidden" id="selectedImageIndex" value="0">
              </div>
              <style>
                /* Apply compact styling to all DataTable elements */
                .compact-datatable {
                  font-size: 0.8rem;
                }
                
                /* Fix table layout for consistent column widths */
                #imageSelectionTable {
                  table-layout: fixed !important;
                  width: 100% !important;
                }
                
                /* Set specific column widths */
                #imageSelectionTable th:nth-child(1),  /* # */
                #imageSelectionTable td:nth-child(1) {
                  width: 8%;
                }
                
                #imageSelectionTable th:nth-child(2),  /* OS Type */
                #imageSelectionTable td:nth-child(2) {
                  width: 12%;
                }
                
                #imageSelectionTable th:nth-child(3),  /* Image Name */
                #imageSelectionTable td:nth-child(3) {
                  width: 35% !important;
                  max-width: 35% !important;
                  min-width: 35% !important;
                }
                
                #imageSelectionTable th:nth-child(4),  /* OS Distribution */
                #imageSelectionTable td:nth-child(4) {
                  width: 35% !important;
                  max-width: 35% !important;
                  min-width: 35% !important;
                }
                
                #imageSelectionTable th:nth-child(5),  /* Support */
                #imageSelectionTable td:nth-child(5) {
                  width: 10%;
                }
                
                #imageSelectionTable th:nth-child(6),  /* Architecture */
                #imageSelectionTable td:nth-child(6) {
                  width: 10%;
                }
                
                #imageSelectionTable th,
                #imageSelectionTable td {
                  overflow: hidden;
                  text-overflow: ellipsis;
                  white-space: nowrap;
                }
                
                /* Allow text wrapping only for specific columns that need it */
                #imageSelectionTable td:nth-child(3),  /* Image Name */
                #imageSelectionTable td:nth-child(4) { /* OS Distribution */
                  white-space: normal;
                  word-wrap: break-word;
                  word-break: break-all;
                }
                
                /* Stronger highlight for selected row */
                .selected-image {
                  background-color: rgba(40, 167, 69, 0.35) !important;
                  border-left: 5px solid rgb(40, 167, 69) !important;
                  font-weight: bold;
                }
                table.dataTable tbody tr.selected-image {
                  background-color: rgba(40, 167, 69, 0.35) !important;
                  border-left: 5px solid rgb(40, 167, 69) !important;
                }
                
                /* Make rows clickable */
                #imageSelectionTable tbody tr {
                  cursor: pointer;
                }
                #imageSelectionTable tbody tr:hover {
                  background-color: rgba(0, 123, 255, 0.08) !important;
                }
                
                /* Basic Image row styling */
                .basic-image-row {
                  background-color: rgba(255, 193, 7, 0.1) !important;
                  border-left: 3px solid #ffc107 !important;
                }
                .basic-image-row:hover {
                  background-color: rgba(255, 193, 7, 0.15) !important;
                }
                
                /* Basic Image icon */
                .basic-image-icon {
                  color: #ffc107;
                  font-size: 1.1em;
                  margin-left: 5px;
                  text-shadow: 0 0 3px rgba(255, 193, 7, 0.5);
                }
                
                /* ML Image icon */
                .ml-image-icon {
                  color: #e74c3c;
                  font-size: 1.1em;
                  margin-left: 3px;
                  text-shadow: 0 0 3px rgba(231, 76, 60, 0.5);
                }
                
                /* K8s Image icon */
                .k8s-image-icon {
                  color: #3498db;
                  font-size: 1.1em;
                  margin-left: 3px;
                  text-shadow: 0 0 3px rgba(52, 152, 219, 0.5);
                }
                
                /* Reduce spacing in details section */
                #imageDetailsContent .row p {
                  margin-bottom: 0.15rem;
                }
                #imageDetailsContent .row {
                  margin-bottom: 0.3rem;
                }
                
                /* Details table styling */
                .image-details-table {
                  font-size: 0.75rem;
                  max-height: 200px;
                  overflow-y: auto;
                }
                .image-details-table td {
                  padding: 0.25rem 0.5rem;
                  border: 1px solid #dee2e6;
                }
                .image-details-table th {
                  padding: 0.25rem 0.5rem;
                  background-color: #f8f9fa;
                  border: 1px solid #dee2e6;
                  font-weight: bold;
                }
              </style>
            `,
            didOpen: () => {
              // Set up row click event for the table
              $('#imageSelectionTable tbody').on('click', 'tr', function () {
                const index = $(this).data('index');
                selectImageRow(index);
              });

              // Image selection function
              window.selectImageRow = function (index) {
                // Reset previous selection
                document.querySelectorAll('#imageSelectionTable tbody tr').forEach(row => {
                  row.classList.remove('selected-image');
                });

                // Select new row
                const selectedRow = document.getElementById(`image-row-${index}`);
                if (selectedRow) {
                  selectedRow.classList.add('selected-image');
                }

                // Save selected index and update details
                document.getElementById('selectedImageIndex').value = index;
                updateImageDetails(index);
              };

              // Update image details function
              function updateImageDetails(index) {
                const image = availableImages[index];
                
                // Combined image information in 2 columns
                const imageInfoHTML = `
                  <div class="row">
                    <div class="col-md-10" style="text-align: left;">
                      <p style="text-align: left;"><strong>Name:</strong> ${image.cspImageName}</p>
                      <p style="text-align: left;"><strong>Distribution:</strong> ${image.osDistribution}</p>
                      <p style="text-align: left;"><strong>Description:</strong> ${image.description}</p>
                    </div>
                    <div class="col-md-2" style="text-align: left;">
                      <p style="text-align: left;"><strong>Image Status:</strong> <span style="color: ${image.imageStatus === 'Available' || image.imageStatus === 'available' ? 'green' : 'orange'};">${image.imageStatus}</span></p>
                      <p style="text-align: left;"><strong>Created Date:</strong> ${image.creationDate}</p>
                      ${image.isKubernetesImage ? `<p style="text-align: left;"><strong>K8s Support:</strong> <span style="color: blue; font-weight: bold;">✓ Yes</span></p>` : ''}
                      ${image.isGPUImage ? `<p style="text-align: left;"><strong>GPU Support:</strong> <span style="color: red; font-weight: bold;">✓ Yes</span></p>` : ''}
                      ${image.isBasicImage ? `<p style="text-align: left;"><strong>Basic Image:</strong> <span style="color: green; font-weight: bold;">✓ Yes</span></p>` : ''}
                    </div>
                  </div>
                `;

                // Details table (similar to spec details)
                let detailsTableHTML = "";
                if (image.details && Array.isArray(image.details) && image.details.length > 0) {
                  detailsTableHTML = `
                    <div class="mt-2">
                      <div class="image-details-table">
                        <table class="table table-sm table-bordered">
                          <thead>
                            <tr>
                              <th style="width: 35%;">Property</th>
                              <th>Value</th>
                            </tr>
                          </thead>
                          <tbody>
                            ${image.details.map(item =>
                              `<tr>
                                <td><strong>${item.key}</strong></td>
                                <td style="word-wrap: break-word; max-width: 300px;">${item.value}</td>
                              </tr>`
                            ).join('')}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  `;
                }

                const detailsHTML = imageInfoHTML + detailsTableHTML;

                document.getElementById('imageDetailsContent').innerHTML = detailsHTML;
              }

              // Initialize DataTable
              $('#imageSelectionTable').DataTable({
                "paging": true,
                "searching": true,
                "ordering": true,
                "info": true,
                "responsive": true,
                "scrollX": true,
                "pageLength": 5,
                "lengthMenu": [5, 10, 25, 50],
                "order": [[0, 'asc']],
                "columnDefs": [
                  {
                    "targets": 0,
                    "type": "num"
                  },
                  {
                    "targets": -1,
                    "orderable": false
                  },
                  {
                    "targets": -2,
                    "orderable": false
                  }
                ],
                "language": {
                  "search": "Filtering Keyword:",
                  "lengthMenu": "Show _MENU_ entries",
                  "info": "_START_ - _END_ of _TOTAL_",
                  "infoEmpty": "No data available",
                  "paginate": {
                    "first": "First",
                    "last": "Last",
                    "next": "Next",
                    "previous": "Previous"
                  }
                }
              });

              // Initialize image details
              updateImageDetails(0);
            },
            showCancelButton: true,
            confirmButtonText: "Continue",
            cancelButtonText: "Cancel",
            preConfirm: () => {
              return parseInt(document.getElementById('selectedImageIndex').value);
            }
          }).then((imageResult) => {
            if (imageResult.isConfirmed) {
              // User selected an image and confirmed
              var selectedImage = availableImages[imageResult.value];
              console.log("User selected image:", selectedImage);

              // Now proceed to the final spec confirmation step
              addRegionMarker(selectedSpec.id);

              var createMciReqVm = $.extend({}, createMciReqVmTmplt);
              var recommendedSpec = selectedSpec;

              createMciReqVm.name = "g" + (vmReqeustFromSpecList.length + 1).toString();

              var osImage = document.getElementById("osImage");
              var diskSize = document.getElementById("diskSize");

              createMciReqVm.commonSpec = selectedSpec.id;
              createMciReqVm.commonImage = selectedImage.cspImageName; // Use selected image instead of osImage.value
              createMciReqVm.rootDiskType = selectedSpec.rootDiskType;

              var diskSizeInput = diskSize.value;
              if (isNaN(diskSizeInput) || diskSizeInput == "") {
                diskSizeInput = "default";
              }
              createMciReqVm.rootDiskSize = diskSizeInput;
              if (diskSizeInput == "default" && selectedSpec.rootDiskSize != "default" && selectedSpec.rootDiskSize != "-1" && selectedSpec.rootDiskSize != "0") {
                createMciReqVm.rootDiskSize = selectedSpec.rootDiskSize;
                // need to validate requested disk size >= default disk size given by vm spec
              }

              // Create a visually appealing image display for the final confirmation
              const truncateImageText = (text, maxLength) => {
                if (text.length <= maxLength) return text;
                return text.substring(0, maxLength) + '..';
              };

              const truncatedDistribution = truncateImageText(selectedImage.osDistribution, 60);
              const truncatedImageName = truncateImageText(selectedImage.cspImageName, 40);

              let imageSelectHTML = `
                <div style="padding: 10px; border: 1px solid #ddd; border-radius: 6px; background-color: #f8f9fa; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
                  <div style="margin-bottom: 8px;">
                    <div style="font-size: 0.8em; color: #6c757d; line-height: 1.4;">
                      <div style="margin-bottom: 3px;" title="(${selectedImage.cspImageName})">
                        <code style="background-color: #e9ecef; padding: 2px 4px; border-radius: 3px; font-size: 0.75em;">${truncatedImageName}</code>
                      </div>
                    </div>
                    <div style="font-size: 0.9em; font-weight: bold; color: #28a745; margin-bottom: 4px;" title="${selectedImage.osDistribution}">
                    ${truncatedDistribution}
                    </div>
                  </div>
                </div>
              `;

              let costPerHour = selectedSpec.costPerHour;
          if (costPerHour == "-1" || costPerHour == "") {
            costPerHour = "unknown";
          }
          let acceleratorType = selectedSpec.acceleratorType;
          let acceleratorModel = selectedSpec.acceleratorModel;
          if (acceleratorType == "gpu") {
            acceleratorType = "<tr><th style='width: 50%;'>AcceleratorType</th><td><b><span style='color: red; font-size: larger;'>GPU</span></b></td></tr>"
            acceleratorModel = "<tr><th style='width: 50%;'>AcceleratorModel</th><td><b><span style='color: red; font-size: larger;'>" + acceleratorModel + "</span></b></td></tr>"
          } else {
            acceleratorType = "<tr><th style='width: 50%;'>AcceleratorType</th><td><b><span style='color: black;'>None</span></b></td></tr>"
            acceleratorModel = "<tr><th style='width: 50%;'>AcceleratorModel</th><td><b><span style='color: black;'>" + acceleratorModel + "</span></b></td></tr>"
          }


          // Show all recommended specs in a table if needed
          var tableContent = res.data.map((spec, index) => {
            let costPerHour = spec.costPerHour === "-1" || spec.costPerHour === "" ? "unknown" : spec.costPerHour;
            let acceleratorCount = spec.acceleratorType === "gpu"
              ? `<span style='color: red; font-size: larger;'>GPU</span>`
              : `<span style='color: black;'>None</span>`;
            let acceleratorModel = spec.acceleratorModel === "gpu"
              ? `<span style='color: red; font-size: larger;'>${spec.acceleratorModel}</span>`
              : `<span style='color: black;'>${spec.acceleratorModel}</span>`;

            return `
            <tr>
              <th>${index + 1}</th>
              <td>${spec.cspSpecName}</td>
              <td>${spec.providerName.toUpperCase()}</td>
              <td>${spec.regionName}</td>
              <td>${spec.vCPU}</td>
              <td>${spec.memoryGiB}</td>
              <td>$ ${costPerHour}</td>
              <td>${spec.acceleratorCount}</td>
              <td>${spec.acceleratorModel}</td>
              <td>${spec.acceleratorMemoryGB}</td>
            </tr>`;
          }).join("");

          var tableHTML = `
          <table id="recommendationTable" class="display nowrap" style="width:100%; text-align:left;">
            <thead>
              <tr>
                <th> </th>
                <th>Spec</th>
                <th>CSP</th>
                <th>Region</th>
                <th>CPU</th>
                <th>Mem</th>
                <th>Cost</th>
                <th>GPU</th>
                <th>Model</th>
                <th>Mem</th>
              </tr>
            </thead>
              <tfoot>
                <tr>
                  <th></th>
                  <th>Spec</th>
                  <th>CSP</th>
                  <th>Region</th>
                  <th>CPU</th>
                  <th>Mem</th>
                  <th>Cost</th>
                  <th>GPU</th>
                  <th>Model</th>
                  <th>Mem</th>
                </tr>
              </tfoot>
            <tbody>
              ${tableContent}
            </tbody>
          </table>`;

          Swal.fire({
            title: "Recommended Spec and CSP region <br>",
            width: 800,
            html:
              "<font size=3>" +
              "<table style='width:80%; text-align:left; margin-top:20px; margin-left:10px; table-layout: auto;'>" +
              "<tr><th style='width: 50%;'>Recommended Spec</th><td><b><span style='color: black; font-size: larger;'>" + selectedSpec.cspSpecName + "</span></b></td></tr>" +
              "<tr><th style='width: 50%;'>Estimated Price(USD/1H)</th><td><b><span style='color: red; font-size: larger;'> $ " + costPerHour + " (at least)</span></b></td></tr>" +
              "<tr><th style='width: 50%;'>Image</th><td>" + imageSelectHTML + "</td></tr>" +

              "<tr><th style='width: 50%;'>------</th><td><b>" + "" + "</b></td></tr>" +
              "<tr><th style='width: 50%;'>Provider</th><td><b><span style='color: blue; font-size: larger;'>" + selectedSpec.providerName.toUpperCase() + "</span></b></td></tr>" +
              "<tr><th style='width: 50%;'>Region</th><td><b>" + selectedSpec.regionName + "</b></td></tr>" +
              "<tr><th style='width: 50%;'>ConnectionConfig</th><td><b>" + selectedSpec.connectionName + "</b></td></tr>" +

              "<tr><th style='width: 50%;'>------</th><td><b>" + "" + "</b></td></tr>" +
              "<tr><th style='width: 50%;'>vCPU</th><td><b>" + selectedSpec.vCPU + "</b></td></tr>" +
              "<tr><th style='width: 50%;'>Mem(GiB)</th><td><b>" + selectedSpec.memoryGiB + "</b></td></tr>" +
              "<tr><th style='width: 50%;'>RootDiskType</th><td><b>" + selectedSpec.rootDiskType + "</b></td></tr>" +

              "<tr><th style='width: 50%;'>RootDiskSize(GB)</th><td>" +
              "<span style='font-size: 0.9em; color: #666; display: block; margin-bottom: 5px;'>Enter disk size in GB or 'default'</span>" +
              "<input type='text' id='rootDiskSizeCustom' style='width:100%; padding: 5px; border: 1px solid #ccc; border-radius: 4px;' value='" + createMciReqVm.rootDiskSize + "'>" +
              "</td></tr>" +

              "<tr><th style='width: 50%;'>------</th><td><b>" + "" + "</b></td></tr>" +
              acceleratorModel +
              "<tr><th style='width: 50%;'>AcceleratorCount</th><td><b>" + selectedSpec.acceleratorCount + "</b></td></tr>" +
              "<tr><th style='width: 50%;'>AcceleratorMemoryGB</th><td><b>" + selectedSpec.acceleratorMemoryGB + "</b></td></tr>" +

              // Label input field
              "<tr><th style='width: 50%;'>------</th><td><b>" + "" + "</b></td></tr>" +
              "<tr><th style='width: 50%;'>User Labels</th><td>" +
              "<span style='font-size: 0.9em; color: #666; display: block; margin-bottom: 5px;'>Enter in key=value, separated by commas</span>" +
              "<input type='text' id='vmLabels' style='width:100%; padding: 5px; border: 1px solid #ccc; border-radius: 4px;' placeholder='role=worker,env=prod,tier=frontend'>" +
              "</td></tr>" +

              // vm count input field
              "<tr><th style='width: 50%;'>------</th><td><b>" + "" + "</b></td></tr>" +
              "<tr><th style='width: 50%;'>SubGroup Scale</th><td>" +
              "<span style='font-size: 0.9em; color: #666; display: block; margin-bottom: 5px;'>Enter the number of VMs for scaling (1 ~ 100)</span>" +
              "<input type='number' id='vmCount' style='width:100%; padding: 5px; border: 1px solid #ccc; border-radius: 4px;' min='1' max='10' value='1'>" +
              "</td></tr>" +
              "</table><br>" +

              `<div style="margin-top: 10px;">` +
              `<button id="toggleTableButton" class="btn btn-secondary dropdown-toggle w-100">Show All Recommendations</button>` +
              `</div>` +
              `<div id="fullTable" style="display:none">${tableHTML}</div>`,

            didOpen: () => {

              const toggleButton = document.getElementById('toggleTableButton');
              toggleButton.addEventListener('click', toggleTable);

              $('#recommendationTable').DataTable({
                initComplete: function () {
                  this.api().columns().every(function (index) {
                    // Skip filtering for the first column (index column)
                    if (index === 0) {
                      return;
                    }

                    var column = this;

                    // Get column data, extract text only (remove HTML tags), and sort
                    var columnData = column.data().map(function (d) {
                      // Extract plain text from HTML content
                      return $('<div>').html(d).text().trim();
                    }).unique().sort();

                    // Create filter container with scrollable area
                    var select = $('<div class="filter-container" style="height:100px; overflow:auto;"></div>')
                      .appendTo($(column.footer()).empty());

                    // Handle checkbox change events for filtering
                    select.on('change', 'input:checkbox', function () {
                      var checkedValues = [];
                      $('input:checkbox:checked', select).each(function () {
                        // Get trimmed checkbox value
                        checkedValues.push($(this).val().trim());
                      });

                      // Create regex pattern from checked values
                      var regex = checkedValues.length ?
                        checkedValues.map(function (val) {
                          // Escape special regex characters to prevent errors
                          return val.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                        }).join('|') : '';

                      // Apply filter using regex
                      column
                        .search(checkedValues.length ? regex : '', true, false)
                        .draw();

                      console.log("Applied filter for column " + index + ": " + regex);
                    });

                    // Create checkboxes for each unique value in the column
                    columnData.each(function (d, j) {
                      if (d) { // Skip empty values
                        // Clean the value and create checkbox with label
                        var cleanValue = d.trim();
                        var checkbox = $('<label><input type="checkbox" value="' + cleanValue + '"> ' + cleanValue + '</label><br>');
                        select.append(checkbox);
                      }
                    });
                  });
                },
                // Enable pagination
                "paging": true,
                // Set default sorting (first column ascending)
                "order": [[0, 'asc']],
                // Enable responsive behavior
                "responsive": true,
                // Enable horizontal scrolling if needed
                "scrollX": true,
                // Customize language settings
                "language": {
                  "search": "Search:",
                  "lengthMenu": "Show _MENU_ entries",
                  "info": "Showing _START_ to _END_ of _TOTAL_ entries",
                  "infoEmpty": "Showing 0 to 0 of 0 entries",
                  "infoFiltered": "(filtered from _MAX_ total entries)"
                }
              });
              // Add image filtering input
              const filterX86Checkbox = document.getElementById('filterX86');
              const imageSelect = document.getElementById('osImageSelect');
              const searchKeyword = document.getElementById('imageSearchKeyword');

              function filterImages() {
                const keyword = searchKeyword ? searchKeyword.value.toLowerCase() : '';
                const filterX86Only = filterX86Checkbox.checked;

                let matchCount = 0;
                let firstMatchIndex = -1;
                const options = imageSelect.options;

                for (let i = 0; i < options.length; i++) {
                  const optionText = options[i].text.toLowerCase();
                  const optionValue = options[i].value.toLowerCase();
                  const architecture = options[i].dataset.architecture?.toLowerCase() || '';

                  const matchesKeyword = keyword === '' || optionText.includes(keyword) || optionValue.includes(keyword);

                  const matchesArchitecture = filterX86Only 
                        ? architecture.includes('x86')
                        : !architecture.includes('x86'); 

                  if (matchesKeyword && matchesArchitecture) {
                    options[i].style.display = '';
                    matchCount++;

                    if (firstMatchIndex === -1) {
                      firstMatchIndex = i;
                    }
                  } else {
                    options[i].style.display = 'none';
                  }
                }

                if (matchCount > 0 && firstMatchIndex >= 0) {
                  imageSelect.selectedIndex = firstMatchIndex;
                } else if (matchCount === 0) {
                  imageSelect.selectedIndex = -1;
                }
              }

              if (filterX86Checkbox) {
                filterX86Checkbox.addEventListener('change', filterImages);
              }

              if (searchKeyword) {
                searchKeyword.addEventListener('input', filterImages);
              }

              filterImages();

            },

            inputAttributes: {
              autocapitalize: "off",
            },
            showCancelButton: true,
            confirmButtonText: "Confirm",
            //showLoaderOnConfirm: true,
            position: "top-end",
            //back(disabled section)ground color
            backdrop: `rgba(0, 0, 0, 0.08)`,
            preConfirm: () => {
              // vmCount input validation
              const vmCountInput = document.getElementById('vmCount');
              let vmCount = parseInt(vmCountInput.value, 10);
              if (isNaN(vmCount) || vmCount < 1 || vmCount > 100) {
                Swal.showValidationMessage('Enter a valid number between 1 and 100');
                return false;
              }

              // rootDiskSize input validation
              const rootDiskSizeInput = document.getElementById('rootDiskSizeCustom');
              let rootDiskSizeValue = rootDiskSizeInput.value.trim();
              if (rootDiskSizeValue === "-1") {
                rootDiskSizeValue = "";
              }
              if (rootDiskSizeValue !== "default" && rootDiskSizeValue !== "") {
                if (!/^\d+$/.test(rootDiskSizeValue)) {
                  Swal.showValidationMessage('Disk size must be "default", empty, or a number');
                  return false;
                }
              }

              const osImageSelect = document.getElementById('osImageSelect');
              if (osImageSelect && osImageSelect.value) {
                console.log(osImageSelect.value);
                createMciReqVm.commonImage = osImageSelect.value;
              }
              if (!createMciReqVm.commonImage) {
                Swal.showValidationMessage('Select an OS image');
                return false;
              }

              return vmCount;
            },


          }).then((result) => {
            // result.value is false if result.isDenied or another key such as result.isDismissed
            if (result.value) {

              createMciReqVm.subGroupSize = String(result.value);
              if (
                isNaN(parseFloat(createMciReqVm.subGroupSize)) ||
                parseFloat(createMciReqVm.subGroupSize) <= 0
              ) {
                createMciReqVm.subGroupSize = "1";
              }

              const rootDiskSizeInput = document.getElementById('rootDiskSizeCustom').value.trim();
              if (rootDiskSizeInput) {
                console.log(rootDiskSizeInput);
                createMciReqVm.rootDiskSize = rootDiskSizeInput;
              } else {
                createMciReqVm.rootDiskSize = "default";
              }

              const vmLabelsInput = document.getElementById('vmLabels').value.trim();
              if (vmLabelsInput) {

                const labels = {};
                vmLabelsInput.split(',').forEach(pair => {
                  const [key, value] = pair.trim().split('=');
                  if (key && value) {
                    labels[key] = value;
                  }
                });

                if (Object.keys(labels).length > 0) {
                  createMciReqVm.label = labels;
                }
              }


              messageTextArea.value +=
                `${createMciReqVm.commonSpec}` +
                `\t(${createMciReqVm.subGroupSize})`;
              vmReqeustFromSpecList.push(createMciReqVm);
              recommendedSpecList.push(recommendedSpec);
            } else {
              messageTextArea.value = messageTextArea.value.replace(/\n.*$/, "");
              latLonInputPairIdx--;
              cspPointsCircle.pop();
              geoCspPointsCircle[0] = new MultiPoint([cspPointsCircle]);
            }
          });
            } else {
              // User canceled image selection
              messageTextArea.value = messageTextArea.value.replace(/\n.*$/, "");
              latLonInputPairIdx--;
              cspPointsCircle.pop();
              geoCspPointsCircle[0] = new MultiPoint([cspPointsCircle]);
            }
          });
        }).catch(error => {
          console.error("Failed to get image information:", error);
        });
      } else {
        // User canceled spec selection
        messageTextArea.value = messageTextArea.value.replace(/\n.*$/, "");
        latLonInputPairIdx--;
        cspPointsCircle.pop();
        geoCspPointsCircle[0] = new MultiPoint([cspPointsCircle]);
        return;
      }
    }).catch(function (error) {
      console.log(error);
      errorAlert("Cannot show spec selection dialog (Check log for details)");
      if (error.response && error.response.data) {
        displayJsonData(error.response.data, typeError);
      }
    });
  }).catch(function (error) {
    console.log(error);
    errorAlert("Cannot recommend a spec (Check log for details)");
    if (error.response && error.response.data) {
      displayJsonData(error.response.data, typeError);
    }
  });
}
window.getRecommendedSpec = getRecommendedSpec;


function range_change(obj) {
  document.getElementById("myvalue").value = obj.value;
}
window.range_change = range_change;

(function () {
  const parentS = document.querySelectorAll(".range-slider");

  if (!parentS) {
    return;
  }

  parentS.forEach((parent) => {
    const rangeS = parent.querySelectorAll('input[type="range"]'),
      numberS = parent.querySelectorAll('input[type="number"]');

    rangeS.forEach((el) => {
      el.oninput = () => {
        let slide1 = parseFloat(rangeS[0].value),
          slide2 = parseFloat(rangeS[1].value);

        if (slide1 > slide2) {
          [slide1, slide2] = [slide2, slide1];
        }

        numberS[0].value = slide1;
        numberS[1].value = slide2;
      };
    });

    numberS.forEach((el) => {
      el.oninput = () => {
        let number1 = parseFloat(numberS[0].value),
          number2 = parseFloat(numberS[1].value);

        if (number1 > number2) {
          let tmp = number1;
          numberS[0].value = number2;
          numberS[1].value = tmp;
        }

        rangeS[0].value = number1;
        rangeS[1].value = number2;
      };
    });
  });
})();

function addRegionMarker(spec) {
  var hostname = hostnameElement.value;
  var port = portElement.value;
  var username = usernameElement.value;
  var password = passwordElement.value;

  var url = `http://${hostname}:${port}/tumblebug/ns/system/resources/spec/${spec}`;

  axios({
    method: "get",
    url: url,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
  }).then((res) => {
    console.log(res);

    var connConfig = res.data.connectionName;
    console.log(connConfig);

    url = `http://${hostname}:${port}/tumblebug/connConfig/${connConfig}`;

    axios({
      method: "get",
      url: url,
      auth: {
        username: `${username}`,
        password: `${password}`,
      },
    }).then((res2) => {
      console.log(
        "Best cloud location: [" +
        res2.data.regionDetail.location.latitude +
        "," +
        res2.data.regionDetail.location.longitude +
        "]"
      ); // for debug

      // push order [longitute, latitude]
      cspPointsCircle.push([
        res2.data.regionDetail.location.longitude,
        res2.data.regionDetail.location.latitude,
      ]);
      geoCspPointsCircle[0] = new MultiPoint([cspPointsCircle]);
    });
  });
}
window.addRegionMarker = addRegionMarker;

function controlMCI(action) {
  switch (action) {
    case "refine":
    case "suspend":
    case "resume":
    case "reboot":
    case "terminate":
    case "continue":
    case "withdraw":
      break;
    default:
      console.log(
        `The actions ${action} is not supported. Supported actions: refine, continue, withdraw, suspend, resume, reboot, terminate.`
      );
      return;
  }
  //messageTextArea.value = "[MCI " +action +"]";

  var hostname = hostnameElement.value;
  var port = portElement.value;
  var username = usernameElement.value;
  var password = passwordElement.value;
  var namespace = namespaceElement.value;
  var mciid = mciidElement.value;

  var spinnerId = addSpinnerTask(action + ": " + mciid);
  infoAlert(action + ": " + mciid);

  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/control/mci/${mciid}?action=${action}`;

  console.log("MCI control:[" + action + "]");

  axios({
    method: "get",
    url: url,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
  })
    .then((res) => {
      if (res.data != null) {
        console.log(res.data);
        displayJsonData(res.data, typeInfo);
        switch (action) {
          case "refine":
          case "suspend":
          case "resume":
          case "reboot":
          case "terminate":
          case "continue":
          case "withdraw":
            infoAlert(
              JSON.stringify(res.data.message, null, 2).replace(/['",]+/g, "")
            );
            break;
          default:
            console.log(
              `The actions ${action} is not supported. Supported actions: refine, continue, withdraw, suspend, resume, reboot, terminate.`
            );
        }
      }
    })
    .catch(function (error) {
      if (error.response) {
        // status code is not 2xx
        console.log(error.response.data);
        console.log(error.response.status);
        console.log(error.response.headers);
      } else {
        console.log("Error", error.message);
      }
      console.log(error.config);
      errorAlert(
        JSON.stringify(error.response.data, null, 2).replace(/['",]+/g, "")
      );
    })
    .finally(function () {
      removeSpinnerTask(spinnerId);
    });
}
window.controlMCI = controlMCI;

function hideMCI() {
  var hostname = hostnameElement.value;
  var port = portElement.value;
  var username = usernameElement.value;
  var password = passwordElement.value;
  var namespace = namespaceElement.value;

  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mci?option=id`;

  var hideListString = "";
  for (i = 0; i < mciHideList.length; i++) {
    var html = "<br>[" + i + "]" + ": <b>" + mciHideList[i] + "</b> (hidden)";

    hideListString = hideListString + html;
  }

  axios({
    method: "get",
    url: url,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
  }).then((res) => {
    if (res.data.output != null) {
      mciList = res.data.output;

      Swal.fire({
        title: "Hide/Show a MCI from the Map",
        html: "<font size=3>" + hideListString,
        showCancelButton: true,
        confirmButtonText: "Show",
        showDenyButton: true,
        denyButtonText: "Hide",
      }).then((result) => {
        hideListString = "";

        if (result.isConfirmed) {
          if (mciHideList.length != 0) {
            Swal.fire({
              title: "Show a MCI from the Map",
              html: "<font size=3>" + hideListString,
              input: "select",
              inputOptions: mciHideList,
              inputPlaceholder: "Select from dropdown",
              inputAttributes: {
                autocapitalize: "off",
              },
              showCancelButton: true,
              confirmButtonText: "Show",
            }).then((result) => {
              if (result.isConfirmed) {
                mciHideList = mciHideList.filter(
                  (a) => a !== mciHideList[result.value]
                );

                for (i = 0; i < mciHideList.length; i++) {
                  var html =
                    "<br>[" +
                    i +
                    "]" +
                    ": <b>" +
                    mciHideList[i] +
                    "</b> (hidden)";
                  hideListString = hideListString + html;
                }
                infoAlert(
                  "Show: " +
                  mciHideList[result.value] +
                  "<br>" +
                  hideListString
                );
              }
            });
          } else {
            infoAlert("There is no hidden MCI yet");
          }
        } else if (result.isDenied) {
          if (mciList.length != 0) {
            Swal.fire({
              title: "Hide a MCI from the Map",
              html: "<font size=3>" + hideListString,
              input: "select",
              inputOptions: mciList.filter(
                (val) => !mciHideList.includes(val)
              ),
              inputPlaceholder: "Select from dropdown",
              inputAttributes: {
                autocapitalize: "off",
              },
              showCancelButton: true,
              confirmButtonText: "Hide",
            }).then((result) => {
              if (result.isConfirmed) {
                mciHideList.push(mciList[result.value]);
                // remove duplicated items
                mciHideList = [...new Set(mciHideList)];

                for (i = 0; i < mciHideList.length; i++) {
                  var html =
                    "<br>[" +
                    i +
                    "]" +
                    ": <b>" +
                    mciHideList[i] +
                    "</b> (hidden)";
                  hideListString = hideListString + html;
                }
                infoAlert(
                  "Hide: " + mciList[result.value] + "<br>" + hideListString
                );
              }
            });
          } else {
            infoAlert("There is no MCI yet");
          }
        }
      });
    }
  });
}
window.hideMCI = hideMCI;

function statusMCI() {
  messageTextArea.value = "[Get MCI status]";

  var hostname = hostnameElement.value;
  var port = portElement.value;
  var username = usernameElement.value;
  var password = passwordElement.value;
  var namespace = namespaceElement.value;
  var mciid = mciidElement.value;

  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mci/${mciid}`;

  axios({
    method: "get",
    url: url,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
    timeout: 260000,
  })
    .then((res) => {
      console.log("[Status MCI]");
      displayJsonData(res.data, typeInfo);
    })
    .catch(function (error) {
      if (error.response) {
        // status code is not 2xx
        console.log(error.response.data);
        console.log(error.response.status);
        console.log(error.response.headers);
      } else {
        console.log("Error", error.message);
      }
      console.log(error.config);
      errorAlert(
        JSON.stringify(error.response.data, null, 2).replace(/['",]+/g, "")
      );
    });
}
window.statusMCI = statusMCI;

function deleteMCI() {
  messageTextArea.value = "Deleting MCI";

  var hostname = hostnameElement.value;
  var port = portElement.value;
  var username = usernameElement.value;
  var password = passwordElement.value;
  var namespace = namespaceElement.value;
  var mciid = mciidElement.value;

  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mci/${mciid}?option=terminate`;

  var spinnerId = addSpinnerTask("Deleting MCI: " + mciid);
  infoAlert("Delete: " + mciid + " (option=terminate)");

  axios({
    method: "delete",
    url: url,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
  })
    .then((res) => {
      console.log(res);
      displayJsonData(res.data, typeInfo);
      clearMap();
      updateMciList();
    })
    .catch(function (error) {
      console.log(error);
      errorAlert("Failed to delete MCI: " + mciid);
      if (error.response && error.response.data) {
        displayJsonData(error.response.data, typeError);
      }
    })
    .finally(function () {
      removeSpinnerTask(spinnerId);
    });
}
window.deleteMCI = deleteMCI;

function releaseResources() {
  var spinnerId = addSpinnerTask("Removing associated default resources");
  infoAlert("Removing all associated default resources");

  var hostname = hostnameElement.value;
  var port = portElement.value;
  var username = usernameElement.value;
  var password = passwordElement.value;
  var namespace = namespaceElement.value;

  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/sharedResources`;

  axios({
    method: "delete",
    url: url,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
  })
    .then((res) => {
      updateNsList();

      console.log(res); // for debug
      displayJsonData(res.data, typeInfo);
    })
    .finally(function () {
      removeSpinnerTask(spinnerId);
      clearMap();
    });
}
window.releaseResources = releaseResources;

function resourceOverview() {
  var spinnerId = addSpinnerTask("Inspect all resources and overview");
  infoAlert("Inspect all resources and overview");

  var hostname = hostnameElement.value;
  var port = portElement.value;
  var username = usernameElement.value;
  var password = passwordElement.value;

  var url = `http://${hostname}:${port}/tumblebug/inspectResourcesOverview`;

  axios({
    method: "get",
    url: url,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
  })
    .then((res) => {
      console.log(res); // for debug
      displayJsonData(res.data, typeInfo);
    })
    .finally(function () {
      removeSpinnerTask(spinnerId);
    });
}
window.resourceOverview = resourceOverview;

// function for registerCspResource by registerCspResource button item
function registerCspResource() {
  var spinnerId = addSpinnerTask("Registering all CSP's resources");
  infoAlert("Registering all CSP's resources");

  var hostname = hostnameElement.value;
  var port = portElement.value;
  var username = usernameElement.value;
  var password = passwordElement.value;
  var namespace = namespaceElement.value;

  var url = `http://${hostname}:${port}/tumblebug/registerCspResourcesAll?mciFlag=n`;

  var commandReqTmp = {
    mciName: "csp",
    nsId: `${namespace}`,
  };
  var jsonBody = JSON.stringify(commandReqTmp, undefined, 4);

  axios({
    method: "post",
    url: url,
    headers: { "Content-Type": "application/json" },
    data: jsonBody,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
  })
    .then((res) => {
      console.log(res); // for debug

      messageTextArea.value = "[Complete: Registering all CSP's resources]\n";
      displayJsonData(res.data, typeInfo);
    })
    .finally(function () {
      removeSpinnerTask(spinnerId);
    });
}
window.registerCspResource = registerCspResource;

function updateNsList() {
  // Clear options in 'select'
  var selectElement = document.getElementById("namespace");
  var previousSelection = selectElement.value;
  var i,
    L = selectElement.options.length - 1;
  for (i = L; i >= 0; i--) {
    selectElement.remove(i);
  }

  var hostname = hostnameElement.value;
  var port = portElement.value;
  var username = usernameElement.value;
  var password = passwordElement.value;

  if (hostname && hostname != "" && port && port != "") {
    var url = `http://${hostname}:${port}/tumblebug/ns?option=id`;

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
          // mciList = res.data.output;
          for (let item of res.data.output) {
            if (item && item.trim() !== "") {
              var option = document.createElement("option");
              option.value = item;
              option.text = item;
              document.getElementById("namespace").appendChild(option);
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
        updateMciList();
      });
  }
}

document.getElementById("namespace").onmouseover = function () {
  updateNsList();
};
document.getElementById("namespace").onchange = function () {
  updateMciList();
};

var mciList = [];
var mciHideList = [];

function updateMciList() {
  // Clear options in 'select'
  var selectElement = document.getElementById("mciid");
  var previousSelection = selectElement.value;
  var i,
    L = selectElement.options.length - 1;
  for (i = L; i >= 0; i--) {
    selectElement.remove(i);
  }

  var hostname = hostnameElement.value;
  var port = portElement.value;
  var username = usernameElement.value;
  var password = passwordElement.value;
  var namespace = namespaceElement.value;

  if (namespace && namespace != "") {
    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mci?option=id`;

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
          // mciList = res.data.output;
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
        updateSubGroupList();
        updateVmList();
        updateIpList();
        updateResourceList(typeStringVNet);
        updateResourceList(typeStringSG);
        updateResourceList(typeStringSshKey);
        // updateResourceList(typeStringSpec);
        // updateResourceList(typeStringImage);
      });
  }
}
window.updateMciList = updateMciList;

document.getElementById("mciid").onmouseover = function () {
  updateMciList();
};
document.getElementById("mciid").onchange = function () {
  updateSubGroupList();
};

function updateVmList() {
  // Clear options in 'select'
  var selectElement = document.getElementById("vmid");
  var previousSelection = selectElement.value;
  var i,
    L = selectElement.options.length - 1;
  for (i = L; i >= 0; i--) {
    selectElement.remove(i);
  }

  var hostname = hostnameElement.value;
  var port = portElement.value;
  var username = usernameElement.value;
  var password = passwordElement.value;
  var namespace = namespaceElement.value;
  var mciid = mciidElement.value;
  var subgroupid = document.getElementById("subgroupid").value;

  if (namespace && namespace != "" && mciid && mciid != "" && subgroupid && subgroupid != "") {
    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mci/${mciid}/subgroup/${subgroupid}`;

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

      });
  } else {
    // clear public ip and private ip
    var pubip = document.getElementById("pubip");
    var priip = document.getElementById("priip");
    while (pubip.options.length > 0) {
      pubip.remove(0);
    }
    while (priip.options.length > 0) {
      priip.remove(0);
    }
  }
}
window.updateVmList = updateVmList;

document.getElementById("vmid").onmouseover = function () {
  updateVmList();
};
document.getElementById("vmid").addEventListener('change', function () {
  updateIpList();
});

function updateIpList() {
  var pubip = document.getElementById("pubip");
  var priip = document.getElementById("priip");

  var hostname = hostnameElement.value;
  var port = portElement.value;
  var username = usernameElement.value;
  var password = passwordElement.value;
  var namespace = namespaceElement.value;
  var mciid = mciidElement.value;
  var groupid = document.getElementById("subgroupid").value;
  var vmid = document.getElementById("vmid").value;

  if (namespace && namespace != "" && mciid && mciid != "" && subgroupid && subgroupid != "" && vmid && vmid != "") {
    while (pubip.options.length > 0) {
      pubip.remove(0);
    }
    while (priip.options.length > 0) {
      priip.remove(0);
    }
    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mci/${mciid}?option=accessinfo`;

    axios({
      method: "get",
      url: url,
      auth: {
        username: `${username}`,
        password: `${password}`,
      },
    }).then((res) => {
      for (let subGroupAccessInfo of res.data.MciSubGroupAccessInfo) {
        if (subGroupAccessInfo.SubGroupId == groupid) {
          for (let vmAccessInfo of subGroupAccessInfo.MciVmAccessInfo) {
            if (vmAccessInfo.vmId == vmid) {
              var optionPublicIP = document.createElement("option");
              optionPublicIP.value = vmAccessInfo.publicIP;
              optionPublicIP.text = vmAccessInfo.publicIP;
              pubip.appendChild(optionPublicIP);

              var optionPrivateIP = document.createElement("option");
              optionPrivateIP.value = vmAccessInfo.privateIP;
              optionPrivateIP.text = vmAccessInfo.privateIP;
              priip.appendChild(optionPrivateIP);
            }
          }
        }
      }
    });
  } else {
    pubip.options.length = 0;
    priip.options.length = 0;
  }
}
window.updateIpList = updateIpList;

document.getElementById("pubip").onmouseover = function () {
  updateIpList();
};
document.getElementById("priip").onmouseover = function () {
  updateIpList();
};

function updateSubGroupList() {
  var selectElement = document.getElementById("subgroupid");
  var previousSelection = selectElement.value;
  var i,
    L = selectElement.options.length - 1;
  for (i = L; i >= 0; i--) {
    selectElement.remove(i);
  }

  var hostname = hostnameElement.value;
  var port = portElement.value;
  var username = usernameElement.value;
  var password = passwordElement.value;
  var namespace = namespaceElement.value;
  var mciid = mciidElement.value;

  if (namespace && namespace != "" && mciid && mciid != "") {
    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mci/${mciid}/subgroup`;

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
          // console.log("in updateSubGroupList(); res.data.output: " + res.data.output);
          for (let item of res.data.output) {
            if (item && item.trim() !== "") {
              var option = document.createElement("option");
              option.value = item;
              option.text = item;
              document.getElementById("subgroupid").appendChild(option);
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
        updateVmList();
      });
  }
}
window.updateSubGroupList = updateSubGroupList;

document.getElementById("subgroupid").onmouseover = function () {
  updateSubGroupList();
};

function updateResourceList(resourceType) {
  var selectElement = document.getElementById(resourceType);
  var previousSelection = selectElement.value;
  var i,
    L = selectElement.options.length - 1;
  for (i = L; i >= 0; i--) {
    selectElement.remove(i);
  }

  var hostname = hostnameElement.value;
  var port = portElement.value;
  var username = usernameElement.value;
  var password = passwordElement.value;
  var namespace = namespaceElement.value;

  if (namespace && namespace != "" && resourceType && resourceType != "") {
    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/resources/${resourceType}?option=id`;

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

document.getElementById(typeStringVNet).onmouseover = function () {
  updateResourceList(typeStringVNet);
};
document.getElementById(typeStringSG).onmouseover = function () {
  updateResourceList(typeStringSG);
};
document.getElementById(typeStringSshKey).onmouseover = function () {
  updateResourceList(typeStringSshKey);
};
// document.getElementById(typeStringImage).onmouseover = function () {
//   //updateResourceList(typeStringImage);
// };
// document.getElementById(typeStringSpec).onmouseover = function () {
//   //updateResourceList(typeStringSpec);
// };

function updateConnectionList() {
  var selectElement = document.getElementById(typeStringConnection);
  var previousSelection = selectElement.value;
  var i,
    L = selectElement.options.length - 1;
  for (i = L; i >= 0; i--) {
    selectElement.remove(i);
  }

  var hostname = hostnameElement.value;
  var port = portElement.value;
  var username = usernameElement.value;
  var password = passwordElement.value;

  var url = `http://${hostname}:${port}/tumblebug/connConfig?filterVerified=true&filterRegionRepresentative=true`;

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

document.getElementById(typeStringConnection).onmouseover = function () {
  updateConnectionList();
};

function AddMcNLB() {
  var mciid = document.getElementById("mciid").value;
  // var nlbport = document.getElementById("nlbport").value;

  if (!mciid) {
    errorAlert("You need to specify the ID of MCI");
    return;
  }

  var hostname = hostnameElement.value;
  var port = portElement.value;
  var username = usernameElement.value;
  var password = passwordElement.value;
  var namespace = namespaceElement.value;
  var mciid = mciidElement.value;

  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mci/${mciid}/mcSwNlb`;

  Swal.fire({
    title: "Configuration for a new NLB",
    width: 600,
    html:
      "<font size=3>" +
      "Target MCI: <b>" +
      mciid +
      "<br></b> Protocol: <b>" +
      "TCP" +
      "<br></b> Port (listen/target): <b>",
    input: "number",
    inputValue: 80,
    didOpen: () => {
      const input = Swal.getInput();
      //input.setSelectionRange(0, input.value.length)
    },
    inputAttributes: {
      autocapitalize: "off",
    },
    showCancelButton: true,
    confirmButtonText: "Confirm",
    //showLoaderOnConfirm: true,
    position: "top-end",
    //back(disabled section)ground color
    backdrop: `rgba(0, 0, 0, 0.08)`,
  }).then((result) => {
    // result.value is false if result.isDenied or another key such as result.isDismissed
    if (result.value) {
      infoAlert("Creating MC-NLB(special MCI) to : " + mciid);
      messageTextArea.value = " Creating Multi-Cloud NLB (special MCI)";
      var spinnerId = addSpinnerTask(
        "Creating MC-NLB(special MCI) to : " + mciid
      );

      var nlbport = result.value;
      if (isNaN(nlbport) || nlbport <= 0) {
        nlbport = 80;
      }

      var nlbReqTmp = {
        type: "PUBLIC",
        scope: "REGION",
        listener: {
          Protocol: "TCP",
          Port: `${nlbport}`,
        },
        targetGroup: {
          Protocol: "TCP",
          Port: `${nlbport}`,
          // subGroupId: `${subgroupid}`,
        },
        HealthChecker: {
          Interval: "default",
          Timeout: "default",
          Threshold: "default",
        },
      };
      var jsonBody = JSON.stringify(nlbReqTmp, undefined, 4);

      axios({
        method: "post",
        url: url,
        headers: { "Content-Type": "application/json" },
        data: jsonBody,
        auth: {
          username: `${username}`,
          password: `${password}`,
        },
      })
        .then((res) => {
          console.log(res); // for debug
          displayJsonData(res.data, typeInfo);
        })
        .catch(function (error) {
          if (error.response) {
            // status code is not 2xx
            console.log(error.response.data);
            console.log(error.response.status);
            console.log(error.response.headers);
          } else {
            console.log("Error", error.message);
          }
          console.log(error.config);

          errorAlert(
            JSON.stringify(error.response.data, null, 2).replace(/['",]+/g, "")
          );
        })
        .finally(function () {
          removeSpinnerTask(spinnerId);
        });
    } else {
    }
  });
}
window.AddMcNLB = AddMcNLB;

function AddNLB() {
  var hostname = hostnameElement.value;
  var port = portElement.value;
  var username = usernameElement.value;
  var password = passwordElement.value;
  var namespace = namespaceElement.value;
  var mciid = mciidElement.value;
  var subgroupid = document.getElementById("subgroupid").value;
  // var nlbport = document.getElementById("nlbport").value;

  if (!mciid) {
    messageTextArea.value =
      " When calling AddNLB(), you must specify the mciid.";
  }

  if (!subgroupid) {
    messageTextArea.value =
      " When calling AddNLB(), you must specify the subgroupid.";
  }

  messageTextArea.value = " Creating NLB " + subgroupid;

  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mci/${mciid}/nlb`;

  Swal.fire({
    title: "Configuration for a new NLB",
    width: 600,
    html:
      "<font size=3>" +
      "Target MCI: <b>" +
      mciid +
      "<br></b> Target SubGroup: <b>" +
      subgroupid +
      "<br></b> Protocol: <b>" +
      "TCP" +
      "<br></b> Port (listen/target): <b>",
    input: "number",
    inputValue: 80,
    didOpen: () => {
      const input = Swal.getInput();
      //input.setSelectionRange(0, input.value.length)
    },
    inputAttributes: {
      autocapitalize: "off",
    },
    showCancelButton: true,
    confirmButtonText: "Confirm",
    //showLoaderOnConfirm: true,
    position: "top-end",
    //back(disabled section)ground color
    backdrop: `rgba(0, 0, 0, 0.08)`,
  }).then((result) => {
    // result.value is false if result.isDenied or another key such as result.isDismissed
    if (result.value) {
      var nlbport = result.value;
      if (isNaN(nlbport) || nlbport <= 0) {
        nlbport = 80;
      }

      var nlbReqTmp = {
        type: "PUBLIC",
        scope: "REGION",
        listener: {
          Protocol: "TCP",
          Port: `${nlbport}`,
        },
        targetGroup: {
          Protocol: "TCP",
          Port: `${nlbport}`,
          subGroupId: `${subgroupid}`,
        },
        HealthChecker: {
          Interval: "default",
          Timeout: "default",
          Threshold: "default",
        },
      };
      var jsonBody = JSON.stringify(nlbReqTmp, undefined, 4);

      axios({
        method: "post",
        url: url,
        headers: { "Content-Type": "application/json" },
        data: jsonBody,
        auth: {
          username: `${username}`,
          password: `${password}`,
        },
      })
        .then((res) => {
          console.log(res); // for debug

          displayJsonData(res.data, typeInfo);
        })
        .catch(function (error) {
          console.log(error);
          if (error.response) {
            // status code is not 2xx
            console.log(error.response.data);
            console.log(error.response.status);
            console.log(error.response.headers);
          } else {
            console.log("Error", error.message);
          }
          console.log(error.config);

          errorAlert(
            JSON.stringify(error.response.data, null, 2).replace(/['",]+/g, "")
          );
        });
    } else {
    }
  });
}
window.AddNLB = AddNLB;

function DelNLB() {
  var hostname = hostnameElement.value;
  var port = portElement.value;
  var username = usernameElement.value;
  var password = passwordElement.value;
  var namespace = namespaceElement.value;
  var mciid = mciidElement.value;
  var subgroupid = document.getElementById("subgroupid").value;

  if (!mciid) {
    messageTextArea.value =
      " When calling DelNLB(), you must specify the mciid.";
  }

  if (!subgroupid) {
    messageTextArea.value =
      " When calling DelNLB(), you must specify the subgroupid.";
  }

  messageTextArea.value = " Deleting NLB " + subgroupid;

  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mci/${mciid}/nlb/${subgroupid}`;

  axios({
    method: "delete",
    url: url,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
  })
    .then((res) => {
      console.log(res); // for debug

      messageTextArea.value = "[Deleted NLB]\n";
      displayJsonData(res.data, typeInfo);
    })
    .catch(function (error) {
      if (error.response) {
        // status code is not 2xx
        console.log(error.response.data);
        console.log(error.response.status);
        console.log(error.response.headers);
      } else {
        console.log("Error", error.message);
      }
      console.log(error.config);

      errorAlert(
        JSON.stringify(error.response.data, null, 2).replace(/['",]+/g, "")
      );
    });
}
window.DelNLB = DelNLB;

// function for sleep
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

var defaultRemoteCommand = [];
defaultRemoteCommand.push("hostname -I");
defaultRemoteCommand.push("echo $SSH_CLIENT");
defaultRemoteCommand.push("");

/**
 * Sets default remote commands based on application type
 * 
 * @param {string} appName - The name of the application to configure commands for
 * @returns {void} - Modifies the defaultRemoteCommand array directly
 */
function setDefaultRemoteCommandsByApp(appName) {
  switch (appName) {
    case "Xonotic":
      defaultRemoteCommand[0] = "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/xonotic/startServer.sh; chmod +x ~/startServer.sh";
      defaultRemoteCommand[1] = "sudo ~/startServer.sh " + "Cloud-Barista-$$Func(GetMciId())" + " 26000" + " 8" + " 8";
      defaultRemoteCommand[2] = "echo '$$Func(GetPublicIP(target=this,postfix=:26000))'";
      break;
    case "ELK":
      defaultRemoteCommand[0] = "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/elastic-stack/startELK.sh";
      defaultRemoteCommand[1] = "chmod +x ~/startServer.sh";
      defaultRemoteCommand[2] = "sudo ~/startServer.sh ";
      break;
    case "vLLM":
      defaultRemoteCommand[0] = "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/llm/llmServer.py";
      defaultRemoteCommand[1] = "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/llm/startServer.sh; chmod +x ~/startServer.sh";
      defaultRemoteCommand[2] = "~/startServer.sh " + "--ip " + "$$Func(GetPublicIPs(separator=' '))" + " --port 5000" + " --token 1024" + " --model tiiuae/falcon-7b-instruct";
      break;
    case "Nvidia":
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/llm/installCudaDriver.sh | sh";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "Nvidia-Status":
      defaultRemoteCommand[0] = "nvidia-smi";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "Setup-CrossNAT":
      defaultRemoteCommand[0] = "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/setup-cross-cloud-nat.sh";
      defaultRemoteCommand[1] = "chmod +x ~/setup-cross-cloud-nat.sh";
      defaultRemoteCommand[2] = "~/setup-cross-cloud-nat.sh pub=$$Func(GetPublicIPs(target=this)) priv=$$Func(GetPrivateIPs(target=this))";
      break;
    case "Ollama":
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/llm/deployOllama.sh | sh";
      defaultRemoteCommand[1] = "echo '$$Func(GetPublicIP(target=this, prefix=http://, postfix=:3000))'";
      defaultRemoteCommand[2] = "";
      break;
    case "OllamaPull":
      defaultRemoteCommand[0] = "OLLAMA_HOST=0.0.0.0:3000 ollama pull $$Func(AssignTask(task='deepseek-r1, gemma3n, gemma3, qwen3, llama3.3, mistral, phi4-reasoning'))";
      defaultRemoteCommand[1] = "echo '$$Func(GetPublicIP(target=this, prefix=http://, postfix=:3000))'";
      defaultRemoteCommand[2] = "OLLAMA_HOST=0.0.0.0:3000 ollama list";
      break;
    case "OpenWebUI":
      defaultRemoteCommand[0] = "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/llm/deployOpenWebUI.sh; chmod +x ~/deployOpenWebUI.sh";
      defaultRemoteCommand[1] = "sudo ~/deployOpenWebUI.sh \"$$Func(GetPublicIPs(target=this, separator=;, prefix=http://, postfix=:3000))\"";
      defaultRemoteCommand[2] = "echo '$$Func(GetPublicIP(target=this, prefix=http://))'";
      break;
    case "RayHead-Deploy":
      defaultRemoteCommand[0] = "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/ray/ray-head-setup.sh";
      defaultRemoteCommand[1] = "chmod +x ~/ray-head-setup.sh";
      defaultRemoteCommand[2] = "~/ray-head-setup.sh -i $$Func(GetPublicIP(target=this))";
      break;
    case "RayWorker-Deploy":
      defaultRemoteCommand[0] = "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/ray/ray-worker-setup.sh";
      defaultRemoteCommand[1] = "chmod +x ~/ray-worker-setup.sh";
      defaultRemoteCommand[2] = "~/ray-worker-setup.sh -i $$Func(GetPublicIP(target=this)) -h $$Func(GetPublicIP(target=mc-ray.g1-1))";
      break;
    case "Westward":
      defaultRemoteCommand[0] = "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/setgame.sh";
      defaultRemoteCommand[1] = "chmod +x ~/setgame.sh; sudo ~/setgame.sh";
      defaultRemoteCommand[2] = "";
      break;
    case "WeaveScope":
      defaultRemoteCommand[0] = "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/weavescope/startServer.sh";
      defaultRemoteCommand[1] = "chmod +x ~/startServer.sh";
      defaultRemoteCommand[2] = "sudo ~/startServer.sh " + "$$Func(GetPublicIPs(separator=' '))" + " " + "$$Func(GetPrivateIPs(separator=' '))";
      break;
    case "Nginx":
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/nginx/startServer.sh | bash -s -- --ip $$Func(GetPublicIP(target=this))";
      defaultRemoteCommand[1] = "echo '$$Func(GetPublicIP(target=this, prefix=http://))'";
      defaultRemoteCommand[2] = "";
      break;
    case "Jitsi":
      defaultRemoteCommand[0] = "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/jitsi/startServer.sh";
      defaultRemoteCommand[1] = "chmod +x ~/startServer.sh";
      defaultRemoteCommand[2] = "sudo ~/startServer.sh " + "$$Func(GetPublicIPs(separator=' '))" + " " + "DNS EMAIL";
      break;
    case "Stress":
      defaultRemoteCommand[0] = "sudo apt install -y stress > /dev/null; stress -c 16 -t 60";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    default:
      defaultRemoteCommand[0] = "ls -al";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
  }
}


// function for startApp by startApp button item
function startApp() {
  var mciid = mciidElement.value;
  if (mciid) {
    setDefaultRemoteCommandsByApp(selectApp.value);
    executeRemoteCmd();
  } else {
    messageTextArea.value = " MCI ID is not assigned";
  }
}
window.startApp = startApp;

// function for stopApp by stopApp button item
function stopApp() {
  var mciid = mciidElement.value;
  if (mciid) {
    messageTextArea.value = " Stopping " + selectApp.value;

    var hostname = hostnameElement.value;
    var port = portElement.value;
    var username = usernameElement.value;
    var password = passwordElement.value;
    var namespace = namespaceElement.value;

    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/cmd/mci/${mciid}`;
    var cmd = [];
    if (selectApp.value == "Xonotic") {
      cmd.push(
        "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/xonotic/stopServer.sh"
      );
      cmd.push("chmod +x ~/stopServer.sh");
      cmd.push("sudo ~/stopServer.sh");
    } else if (selectApp.value == "ELK") {
      cmd.push(
        "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/elastic-stack/stopELK.sh"
      );
      cmd.push("chmod +x ~/stopELK.sh");
      cmd.push("sudo ~/stopELK.sh");
    } else if (selectApp.value == "Westward") {
      cmd.push(
        "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/xonotic/stopServer.sh"
      );
      cmd.push("chmod +x ~/stopServer.sh");
      cmd.push("sudo ~/stopServer.sh");
    } else if (selectApp.value == "Nginx") {
      cmd.push(
        "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/xonotic/stopServer.sh"
      );
      cmd.push("chmod +x ~/stopServer.sh");
      cmd.push("sudo ~/stopServer.sh");
    } else if (selectApp.value == "Jitsi") {
      cmd.push(
        "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/xonotic/stopServer.sh"
      );
      cmd.push("chmod +x ~/stopServer.sh");
      cmd.push("sudo ~/stopServer.sh");
    } else {
      cmd.push("ls -al");
    }

    var commandReqTmp = {
      command: cmd,
    };
    var jsonBody = JSON.stringify(commandReqTmp, undefined, 4);

    axios({
      method: "post",
      url: url,
      headers: { "Content-Type": "application/json" },
      data: jsonBody,
      auth: {
        username: `${username}`,
        password: `${password}`,
      },
    }).then((res) => {
      console.log(res); // for debug

      messageTextArea.value = "[Complete: Stopping App]\n";
      displayJsonData(res.data, typeInfo);
    });
  } else {
    messageTextArea.value = " MCI ID is not assigned";
  }
}
window.stopApp = stopApp;

// function for statusApp by statusApp button item
function statusApp() {
  var hostname = hostnameElement.value;
  var port = portElement.value;
  var username = usernameElement.value;
  var password = passwordElement.value;
  var namespace = namespaceElement.value;
  var mciid = mciidElement.value;

  if (mciid) {
    messageTextArea.value = " Getting status " + selectApp.value;

    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/cmd/mci/${mciid}`;
    var cmd = [];
    if (selectApp.value == "Xonotic") {
      cmd.push(
        "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/xonotic/statusServer.sh -O ~/statusServer.sh"
      );
      cmd.push("chmod +x ~/statusServer.sh");
      cmd.push("sudo ~/statusServer.sh");
    } else if (selectApp.value == "Westward") {
      cmd.push(
        "wget wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/setgame.sh -O ~/setgame.sh"
      );
      cmd.push("chmod +x ~/setgame.sh");
      cmd.push("sudo ~/setgame.sh");
    } else if (selectApp.value == "Nvidia") {
      cmd.push("nvidia-smi");
      cmd.push("");
      cmd.push("");
    } else if (selectApp.value == "Nginx") {
      cmd.push(
        "wget wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/setweb.sh -O ~/setweb.sh"
      );
      cmd.push("chmod +x ~/setweb.sh");
      cmd.push("sudo ~/setweb.sh");
    } else if (selectApp.value == "Jitsi") {
      cmd.push(
        "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/jitsi/statusServer.sh -O ~/statusServer.sh"
      );
      cmd.push("chmod +x ~/statusServer.sh");
      cmd.push("sudo ~/statusServer.sh");
    } else if (selectApp.value == "ELK") {
      cmd.push(
        "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/elastic-stack/statusELK.sh -O ~/statusServer.sh"
      );
      cmd.push("chmod +x ~/statusServer.sh");
      cmd.push("sudo ~/statusServer.sh");
    } else {
      cmd.push("ls -al");
    }

    var commandReqTmp = {
      command: cmd,
    };
    var jsonBody = JSON.stringify(commandReqTmp, undefined, 4);

    axios({
      method: "post",
      url: url,
      headers: { "Content-Type": "application/json" },
      data: jsonBody,
      auth: {
        username: `${username}`,
        password: `${password}`,
      },
    }).then((res) => {
      console.log(res); // for debug

      messageTextArea.value = "[Complete: Getting App status]\n";
      displayJsonData(res.data, typeInfo);
    });
  } else {
    messageTextArea.value = " MCI ID is not assigned";
  }
}
window.statusApp = statusApp;

// loadPredefinedScript function for loading predefined script
window.loadPredefinedScript = function () {
  const scriptTypeSelect = document.getElementById("predefinedScripts");
  if (!scriptTypeSelect) return;

  const scriptType = scriptTypeSelect.value;
  console.log("Loading predefined script:", scriptType);

  if (scriptType) {
    setDefaultRemoteCommandsByApp(scriptType);
    console.log("Updated defaultRemoteCommand:", defaultRemoteCommand);

    // update the command fields
    for (let i = 0; i < defaultRemoteCommand.length; i++) {
      const cmdField = document.getElementById(`cmd${i + 1}`);
      if (cmdField) {
        cmdField.value = defaultRemoteCommand[i] || "";
        console.log(`Set cmd${i + 1} to:`, cmdField.value);
      }
    }
  }
};


function executeRemoteCmd() {
  var hostname = hostnameElement.value;
  var port = portElement.value;
  var username = usernameElement.value;
  var password = passwordElement.value;
  var namespace = namespaceElement.value;
  var mciid = mciidElement.value;
  var subgroupid = document.getElementById("subgroupid").value;
  var vmid = document.getElementById("vmid").value;

  let cmdCount = 3; // Initial number of textboxes

  if (mciid) {
    var spinnerId = "";

    messageTextArea.value =
      "[Forward remote ssh command to MCI:" + mciid + "]\n";

    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/cmd/mci/${mciid}`;
    var cmd = [];

    Swal.fire({
      title: "<font size=5><b>Put multiple commands to forward</b></font>",
      width: 900,
      html: `
      <div id="dynamicContainer" style="text-align: left;">
        <p><font size=4><b>[Commands]</b></font></p>
        <div id="cmdContainer" style="margin-bottom: 20px;">
          <div id="cmdDiv1" class="cmdRow">
            Command 1: <input type="text" id="cmd1" style="width: 75%" value="${defaultRemoteCommand[0]}">
            <button onclick="document.getElementById('cmd1').value = ''">Clear</button>
          </div>
          <div id="cmdDiv2" class="cmdRow">
            Command 2: <input type="text" id="cmd2" style="width: 75%" value="${defaultRemoteCommand[1]}">
            <button onclick="document.getElementById('cmd2').value = ''">Clear</button>
          </div>
          <div id="cmdDiv3" class="cmdRow">
            Command 3: <input type="text" id="cmd3" style="width: 75%" value="${defaultRemoteCommand[2]}">
            <button onclick="document.getElementById('cmd3').value = ''">Clear</button>
          </div>
          <button id="addCmd" onclick="addCmd()" style="margin-left: 1px;"> + </button>
        </div>

        <p><font size=4><b>[Predefined Scripts]</b></font></p>
        <div style="margin-bottom: 15px;">
          <select id="predefinedScripts" style="width: 75%; padding: 5px;" onchange="loadPredefinedScript()">
            <option value="">-- Select a predefined script --</option>
            <option value="Nvidia">[GPU Driver] Nvidia CUDA Driver</option>
            <option value="Nvidia-Status">[GPU Driver] Check Nvidia CUDA Driver</option>
            <option value="Setup-CrossNAT">[Network Config] Setup Cross NAT</option>
            <option value="vLLM">[LLM vLLM] vLLM Server</option>
            <option value="Ollama">[LLM Ollama] Ollama LLM Server</option>
            <option value="OllamaPull">[LLM Model] Ollama Model Pull</option>
            <option value="OpenWebUI">[LLM WebUI] Open WebUI for Ollama</option>
            <option value="RayHead-Deploy">[ML Ray] Deploy Ray Cluster (Head)</option>
            <option value="RayWorker-Deploy">[ML Ray] Deploy Ray Cluster (Worker)</option>
            <option value="WeaveScope">[Observability] Weave Scope</option>
            <option value="ELK">[Observability] ELK Stack</option>
            <option value="Jitsi">[Video Conference] Jitsi Meet</option>
            <option value="Xonotic">[Game:FPS] Xonotic Game Server</option>
            <option value="Westward">[Game:MMORPG] Westward Game</option>
            <option value="Nginx">[Web:Server] Nginx Web Server</option>
            <option value="Stress">[Web:Stress] Stress Test</option>
          </select>
          <div style="font-size: 0.8em; color: #666; margin-top: 3px;">
            Select a predefined script to auto-fill the command fields
          </div>
        </div>

        <p><font size=4><b>[Select target]</b></font></p>
        <div style="display: flex; align-items: center;">
          <div style="margin-right: 10px;">
            <input type="radio" id="mciOption" name="selectOption" value="MCI" checked>
            <label for="mciOption">MCI: <span style="color:blue;">${mciid}</span></label>
          </div>
          <div style="margin-right: 10px;">
            <input type="radio" id="subGroupOption" name="selectOption" value="SubGroup">
            <label for="subGroupOption">SUBGROUP: <span style="color:green;">${subgroupid}</span></label>
          </div>
          <div>
            <input type="radio" id="vmOption" name="selectOption" value="VM">
            <label for="vmOption">VM: <span style="color:red;">${vmid}</span></label>
          </div>
        </div>

        <p><font size=4><b>[Label Selector]</b></font></p>
        <div style="margin-bottom: 15px;">
          <input type="text" id="labelSelector" style="width: 75%" placeholder="ex: role=worker,env=production">
          <div style="font-size: 0.8em; color: #666; margin-top: 3px;">
            ex: Optional: set targets by the label (ex: role=worker,env=production,sys.id=g1-2)
          </div>
        </div>

      </div>`,
      showCancelButton: true,
      confirmButtonText: "Execute",
      didOpen: () => {
        // Function to add additional textbox
        window.addCmd = () => {
          cmdCount++;
          const newCmd = document.createElement("div");
          newCmd.id = `cmdDiv${cmdCount}`;
          newCmd.className = "cmdRow"; // class for each command row
          newCmd.innerHTML = `Command ${cmdCount}: <input type="text" id="cmd${cmdCount}" style="width: 75%">
                              <button onclick="document.getElementById('cmd${cmdCount}').value = ''">Clear</button>`;
          document.getElementById("cmdContainer").appendChild(newCmd);

          // Move the addCmd button to be next to the last command's Clear button
          const lastCmd = document.getElementById(`cmdDiv${cmdCount}`);
          lastCmd.appendChild(document.getElementById("addCmd"));
        };

        // Use predefined script dropdown to load default commands
        const scriptSelect = document.getElementById('predefinedScripts');
        if (scriptSelect) {
          scriptSelect.removeEventListener('change', window.loadPredefinedScript);
          scriptSelect.addEventListener('change', window.loadPredefinedScript);
          if (scriptSelect.value) {
            window.loadPredefinedScript();
          }
        }

      },
      preConfirm: () => {
        // Collect commands from textboxes
        const commands = [];
        for (let i = 1; i <= cmdCount; i++) {
          const cmd = document.getElementById("cmd" + i).value;
          defaultRemoteCommand[i - 1] = cmd;
          if (cmd) {
            commands.push(cmd);
          }
        }
        return commands;
      },
    }).then((result) => {
      // result.value is false if result.isDenied or another key such as result.isDismissed
      if (result.value) {
        // Handle radio button value
        const radioValue = Swal.getPopup().querySelector(
          'input[name="selectOption"]:checked'
        ).value;
        if (radioValue === "MCI") {
          var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/cmd/mci/${mciid}`;
          console.log("Performing tasks for MCI");
        } else if (radioValue === "SubGroup") {
          var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/cmd/mci/${mciid}?subGroupId=${subgroupid}`;
          console.log("Performing tasks for SubGroup");
        } else if (radioValue === "VM") {
          var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/cmd/mci/${mciid}?vmId=${vmid}`;
          console.log("Performing tasks for VM");
        }

        // Get label selector value and add to URL if provided
        const labelSelector = Swal.getPopup().querySelector('#labelSelector').value;
        if (labelSelector && labelSelector.trim() !== '') {
          url += (url.includes('?') ? '&' : '?') + `labelSelector=${encodeURIComponent(labelSelector)}`;
          console.log("Added labelSelector:", labelSelector);
        }

        cmd = result.value;
        messageTextArea.value += cmd.join(", ");

        var commandReqTmp = {
          command: cmd,
        };

        var jsonBody = JSON.stringify(commandReqTmp, undefined, 4);

        spinnerId = addSpinnerTask("Remote command to " + mciid);

        var requestId = generateRandomRequestId("cmd-" + mciid + "-", 10);
        addRequestIdToSelect(requestId);

        axios({
          method: "post",
          url: url,
          headers: { "Content-Type": "application/json", "x-request-id": requestId },
          data: jsonBody,
          auth: {
            username: `${username}`,
            password: `${password}`,
          },
        }).then((res) => {
          console.log(res); // for debug
          displayJsonData(res.data, typeInfo);
          let formattedOutput = "[Complete: remote ssh command to MCI]\n\n";

          res.data.results.forEach((result) => {
            formattedOutput += `### MCI ID: ${result.mciId} | IP: ${result.vmId} | IP: ${result.vmIp} ###\n`;

            Object.keys(result.command).forEach((key) => {
              formattedOutput += `\nCommand: ${result.command[key]}`;

              if (result.stdout[key].trim()) {
                formattedOutput += `\nOutput:\n${result.stdout[key]}`;
              }

              if (result.stderr[key].trim()) {
                formattedOutput += `\nError:\n${result.stderr[key]}`;
              }
            });

            formattedOutput += "\n--------------------------------------\n";
          });

          messageTextArea.value = formattedOutput;
        })
          .catch(function (error) {
            if (error.response) {
              // status code is not 2xx
              console.log(error.response.data);
              console.log(error.response.status);
              console.log(error.response.headers);
            } else {
              console.log("Error", error.message);
            }
            console.log(error.config);

            errorAlert(
              JSON.stringify(error.response.data, null, 2).replace(
                /['",]+/g,
                ""
              )
            );
          })
          .finally(function () {
            removeSpinnerTask(spinnerId);
          });

      } else {
        messageTextArea.value = "Cannot set command";
        removeSpinnerTask(spinnerId);
      }
    });
  } else {
    errorAlert("MCI ID is not assigned");
    messageTextArea.value = " MCI ID is not assigned";
  }
}
window.executeRemoteCmd = executeRemoteCmd;

// Function for transferFileToMci by remoteCmd button item
function transferFileToMci() {
  var hostname = hostnameElement.value;
  var port = portElement.value;
  var username = usernameElement.value;
  var password = passwordElement.value;
  var namespace = namespaceElement.value;
  var mciid = mciidElement.value;
  var subgroupid = document.getElementById("subgroupid").value;
  var vmid = document.getElementById("vmid").value;

  if (mciid) {
    messageTextArea.value = "[Transfer file to MCI:" + mciid + "]\n";

    // Swal popup for selecting file and target path
    Swal.fire({
      title: "<font size=5><b>Transfer File to MCI</b></font>",
      width: 900,
      html:
        `<div style="text-align: left; padding: 10px;">
        <p><font size=4><b>Select File to Transfer</b></font></p>
        <div style="display: flex; justify-content: flex-start; margin-bottom: 20px;">
            <input type="file" id="fileInput" style="width: 300px; padding: 5px;" />
        </div>

        <p><font size=4><b>File Path on VM (existing path only)</b></font></p>
        <div style="display: flex; justify-content: flex-start; margin-bottom: 20px;">
            <input type="text" id="targetPathInput" style="width: 80%; padding: 5px;" value="/home/cb-user/" placeholder="/home/cb-user/">
        </div>

        <p style="text-align: left;"><font size=4><b>Select Target Group</b></font></p>
        <div style="display: flex; flex-direction: row; align-items: center; justify-content: flex-start; gap: 20px; margin-bottom: 10px;">
            <div>
                <input type="radio" id="mciOption" name="selectOption" value="MCI" checked>
                <label for="mciOption">MCI: <span style="color:blue;">${mciid}</span></label>
            </div>
            <div>
                <input type="radio" id="subGroupOption" name="selectOption" value="SubGroup">
                <label for="subGroupOption">SUBGROUP: <span style="color:green;">${subgroupid}</span></label>
            </div>
            <div>
                <input type="radio" id="vmOption" name="selectOption" value="VM">
                <label for="vmOption">VM: <span style="color:red;">${vmid}</span></label>
            </div>
        </div>
        </div>`,
      showCancelButton: true,
      confirmButtonText: "Transfer",
      didOpen: () => {
        document.getElementById("fileInput").addEventListener("change", function (e) {
          console.log("File selected:", e.target.files[0]);
        });
      },
      preConfirm: () => {
        // Get the file and target path from the input fields
        const fileInput = document.getElementById("fileInput");
        const targetPath = document.getElementById("targetPathInput").value;

        // Check if a file is selected
        if (!fileInput.files[0]) {
          Swal.showValidationMessage("Please select a file to transfer.");
          return false;
        }

        // Return the file and targetPath
        return {
          file: fileInput.files[0],
          targetPath: targetPath,
        };
      },
    }).then((result) => {
      if (result.value) {
        const file = result.value.file;
        const targetPath = result.value.targetPath;

        // Handle radio button value
        const radioValue = Swal.getPopup().querySelector('input[name="selectOption"]:checked').value;
        let url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/transferFile/mci/${mciid}`;
        if (radioValue === "SubGroup") {
          url += `?subGroupId=${subgroupid}`;
        } else if (radioValue === "VM") {
          url += `?vmId=${vmid}`;
        }

        // Prepare the formData to transfer the file
        var formData = new FormData();
        formData.append("file", file);
        formData.append("path", targetPath);

        // Show loading spinner
        Swal.fire({
          title: 'Transferring...',
          html: `Transferring ${file.name} to ${targetPath}...`,
          allowOutsideClick: false,
          didOpen: () => {
            Swal.showLoading();
          },
        });

        axios({
          method: "post",
          url: url,
          headers: {
            "Authorization": `Basic ${btoa(`${username}:${password}`)}`, // Basic Auth
            "Content-Type": "multipart/form-data",
          },
          data: formData,
        })
          .then((res) => {
            // Success message
            Swal.fire({
              icon: 'success',
              title: 'File transferred',
              text: `The file "${file.name}" was transferred successfully.`,
            });
            messageTextArea.value = `[Complete: File transfer to MCI ${mciid}]\n`;
            displayJsonData(res.data, typeInfo);
          })
          .catch((error) => {
            // Error message
            console.error("File transfer error:", error);
            errorAlert(
              JSON.stringify(error.response.data, null, 2).replace(
                /['",]+/g,
                ""
              )
            );
          })
          .finally(() => {
            Swal.hideLoading();
          });
      } else {
        messageTextArea.value = "File transfer was canceled.";
      }
    });
  } else {
    errorAlert("MCI ID is not assigned");
    messageTextArea.value = "MCI ID is not assigned.";
  }
}
window.transferFileToMci = transferFileToMci;

// function for getAccessInfo of MCI
function getAccessInfo() {
  var hostname = hostnameElement.value;
  var port = portElement.value;
  var username = usernameElement.value;
  var password = passwordElement.value;
  var namespace = namespaceElement.value;
  var mciid = mciidElement.value;

  if (mciid) {
    messageTextArea.value =
      "[Retrieve access information for MCI:" + mciid + "]\n";

    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mci/${mciid}?option=accessinfo`;

    axios({
      method: "get",
      url: url,
      auth: {
        username: `${username}`,
        password: `${password}`,
      },
    }).then((res) => {
      console.log(res); // for debug
      displayJsonData(res.data, typeInfo);
    });
  } else {
    messageTextArea.value = " MCI ID is not assigned";
  }
}
window.getAccessInfo = getAccessInfo;


// SSH Key save function
const saveBtn = document.querySelector(".save-file");
saveBtn.addEventListener("click", function () {
  messageTextArea.value = " [Retrieve MCI Access Information ...]\n";

  var hostname = hostnameElement.value;
  var port = portElement.value;
  var username = usernameElement.value;
  var password = passwordElement.value;
  var namespace = namespaceElement.value;
  var mciid = mciidElement.value;
  var groupid = document.getElementById("subgroupid").value;
  var vmid = document.getElementById("vmid").value;

  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mci/${mciid}?option=accessinfo&accessInfoOption=showSshKey`;

  axios({
    method: "get",
    url: url,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
  }).then((res) => {
    console.log(res); // for debug
    displayJsonData(res.data, typeInfo);
    var privateKey = "";

    for (let subGroupAccessInfo of res.data.MciSubGroupAccessInfo) {
      if (subGroupAccessInfo.SubGroupId == groupid) {
        for (let vmAccessInfo of subGroupAccessInfo.MciVmAccessInfo) {
          if (vmAccessInfo.vmId == vmid) {
            privateKey = vmAccessInfo.privateKey.replace(/['",]+/g, "");
            break;
          }
        }
      }
    }

    var tempLink = document.createElement("a");
    var taBlob = new Blob([privateKey], { type: "text/plain" });

    tempLink.setAttribute("href", URL.createObjectURL(taBlob));
    tempLink.setAttribute("download", `${namespace}-${mciid}-${vmid}.pem`);
    tempLink.click();

    URL.revokeObjectURL(tempLink.href);
  });
});

// Global array to store X-Request-Ids
let xRequestIds = [];

// Function to handle Axios response and extract X-Request-Id
function handleAxiosResponse(response) {
  // Extract X-Request-Id from the response headers
  console.log("Response Headers:", response.headers);
  const requestId = response.headers["x-request-id"];
  console.log("X-Request-Id:", requestId);
  if (requestId) {
    addRequestIdToSelect(requestId);
  }
}

// Function to add X-Request-Id to the select element
function addRequestIdToSelect(requestId) {
  // Add X-Request-Id to the global array if it's not already present
  if (!xRequestIds.includes(requestId)) {
    xRequestIds.push(requestId);
    const select = document.getElementById("xRequestIdSelect");
    const option = document.createElement("option");
    option.value = requestId;
    option.text = requestId;
    select.appendChild(option);
  }
}

// Function to generate a random X-Request-Id with a prefix and specified total length
function generateRandomRequestId(prefix, totalLength) {
  const characters = '0123456789';
  let result = prefix;
  const charactersLength = characters.length;
  const randomPartLength = totalLength;
  for (let i = 0; i < randomPartLength; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

// Function to handle selection of an X-Request-Id
function handleRequestIdSelection() {
  const select = document.getElementById("xRequestIdSelect");
  const selectedRequestId = select.value;
  console.log("Selected X-Request-Id:", selectedRequestId);

  // actions based on the selected X-Request-Id

  if (selectedRequestId) {
    var hostname = hostnameElement.value;
    var port = portElement.value;
    var username = usernameElement.value;
    var password = passwordElement.value;

    var url = `http://${hostname}:${port}/tumblebug/request/${selectedRequestId}`;

    axios({
      method: "get",
      url: url,
      auth: {
        username: `${username}`,
        password: `${password}`,
      },
    }).then((res) => {
      console.log(res); // for debug
      displayJsonData(res.data, typeInfo);
    });
  } else {
    console.log("No X-Request-Id selected");
  }
}
window.handleRequestIdSelection = handleRequestIdSelection;

window.onload = function () {
  // Get host address and update text field
  var tbServerAp = window.location.host;
  var strArray = tbServerAp.split(":");
  console.log("Host address: " + strArray[0]);
  document.getElementById("hostname").value = strArray[0];
  setTimeout(getConnection, 1000);

  updateNsList();

  getMci();
};

let drawCounter = 0;
const shuffleInterval = 200; // Shuffle every shuffleInterval draws
let shuffledKeys = Object.keys(cspIconStyles); // Initialize with original keys

function shuffleKeys() {
  shuffledKeys = Object.keys(cspIconStyles)
    .map((key) => ({ key, sort: Math.random() })) // Map to array of objects with random sort values
    .sort((a, b) => a.sort - b.sort) // Sort by random values
    .map(({ key }) => key); // Extract the keys
}

// Draw Objects
function drawObjects(event) {
  //event.frameState = event.frameState / 10;
  //console.log("event.frameState");
  //console.log(event.frameState);

  var vectorContext = getVectorContext(event);
  var frameState = event.frameState;
  var theta = (2 * Math.PI * frameState.time) / omegaTheta;

  // Shuffle keys every shuffleInterval draws
  drawCounter++;
  if (drawCounter % shuffleInterval === 0) {
    shuffleKeys();
  }

  // Get the selected provider from the dropdown
  var selectedProvider = document.getElementById(typeStringProvider).value;

  // Draw CSP location first with the stored random order
  shuffledKeys.forEach((key) => {
    if (selectedProvider === "" || selectedProvider === key) {
      if (Array.isArray(geoCspPoints[key]) && geoCspPoints[key].length) {
        vectorContext.setStyle(cspIconStyles[key]);
        vectorContext.drawGeometry(geoCspPoints[key][0]);
      }
    }
  });

  // Draw MCI Geometry
  for (i = geometries.length - 1; i >= 0; --i) {
    var polyStyle = new Style({
      stroke: new Stroke({
        width: 1,
        color: cororLineList[i % cororList.length],
      }),
      fill: new Fill({
        color: cororList[i % cororList.length],
      }),
    });

    vectorContext.setStyle(polyStyle);
    vectorContext.drawGeometry(geometries[i]);
  }

  if (cspPointsCircle.length) {
    //console.log("cspPointsCircle.length:" +cspPointsCircle.length + "cspPointsCircle["+cspPointsCircle+"]")
    //geoCspPointsCircle[0] = new MultiPoint([cspPointsCircle]);
    vectorContext.setStyle(iconStyleCircle);
    vectorContext.drawGeometry(geoCspPointsCircle[0]);
  }

  if (geoResourceLocation.vnet[0]) {
    vectorContext.setStyle(iconStyleVnet);
    vectorContext.drawGeometry(geoResourceLocation.vnet[0]);
  }
  if (geoResourceLocation.sg[0]) {
    vectorContext.setStyle(iconStyleSG);
    vectorContext.drawGeometry(geoResourceLocation.sg[0]);
  }
  if (geoResourceLocation.sshKey[0]) {
    vectorContext.setStyle(iconStyleKey);
    vectorContext.drawGeometry(geoResourceLocation.sshKey[0]);
  }
  if (geoResourceLocation.k8s[0]) {
    vectorContext.setStyle(iconStyleK8s);
    vectorContext.drawGeometry(geoResourceLocation.k8s[0]);
  }
  if (geoResourceLocation.vpn[0]) {
    vectorContext.setStyle(iconStyleVPN);
    vectorContext.drawGeometry(geoResourceLocation.vpn[0]);
  }

  // Draw MCI Points and Text
  for (i = geometries.length - 1; i >= 0; --i) {

    if (mciName[i].includes("NLB")) {
      vectorContext.setStyle(iconStyleNlb);
    } else {
      vectorContext.setStyle(iconStyleVm);
    }
    vectorContext.drawGeometry(geometriesPoints[i]);

    // MCI status style
    var polyStatusTextStyle = new Style({
      // MCI status text style
      text: new Text({
        text: mciStatus[i],
        font: "bold 10px sans-serif",
        scale: changeSizeStatus(mciName[i] + mciStatus[i]),
        offsetY: 44 * changeSizeStatus(mciName[i] + mciStatus[i]),
        stroke: new Stroke({
          color: "white",
          width: 1,
        }),
        fill: new Fill({
          color: changeColorStatus(mciStatus[i]),
        }),
      }),
    });
    vectorContext.setStyle(polyStatusTextStyle);
    vectorContext.drawGeometry(geometries[i]);
  }

  for (i = geometries.length - 1; i >= 0; --i) {
    // MCI text style
    var polyNameTextStyle = new Style({
      text: new Text({
        text: mciName[i],
        font: "bold 10px sans-serif",
        scale: changeSizeByName(mciName[i] + mciStatus[i]) + 0.8,
        offsetY: 32 * changeSizeByName(mciName[i] + mciStatus[i]),
        stroke: new Stroke({
          color: [255, 255, 255, 1], //white
          width: 1,
        }),
        fill: new Fill({
          color: [0, 0, 0, 1], //black //changeColorStatus(mciStatus[i])
        }),
      }),
    });

    vectorContext.setStyle(polyNameTextStyle);
    vectorContext.drawGeometry(geometries[i]);
  }

  map.render();
}

tileLayer.on("postrender", function (event) {
  drawObjects(event);
});

// Section for general tools

function jsonToTable(jsonText) {
  let arr00 = new Array();
  let arr01 = new Array();
  let arr02 = new Array();
  let arr03 = new Array();
  let arr04 = new Array();
  let arr05 = new Array();

  let json = JSON.parse(jsonText);

  for (i = 0; i < json.length; i++) {
    arr00[i] = json[i].connectionName;
    arr01[i] = json[i].cspSpecName;
    arr02[i] = json[i].vCPU;
    arr03[i] = json[i].memoryGiB;
    arr04[i] = json[i].costPerHour;
    arr05[i] = json[i].evaluationScore09;
  }
  // table.innerHTML = "";

  // Header
  let tr0 = document.createElement("tr");

  let th0 = document.createElement("th");
  th0.appendChild(document.createTextNode("   cspRegion"));
  let th1 = document.createElement("th");
  th1.appendChild(document.createTextNode("   cspSpecName"));
  let th2 = document.createElement("th");
  th2.appendChild(document.createTextNode("   vCPU"));
  let th3 = document.createElement("th");
  th3.appendChild(document.createTextNode("   memoryGiB"));
  let th4 = document.createElement("th");
  th4.appendChild(document.createTextNode("   costPerHour"));
  let th5 = document.createElement("th");
  th5.appendChild(document.createTextNode("   evaluationScore"));

  tr0.appendChild(th0);
  tr0.appendChild(th1);
  tr0.appendChild(th2);
  tr0.appendChild(th3);
  tr0.appendChild(th4);
  tr0.appendChild(th5);
  table.appendChild(tr0);

  for (i = 0; i < arr01.length; i++) {
    let tr = document.createElement("tr");

    let td0 = document.createElement("td");
    td0.appendChild(document.createTextNode(" " + arr00[i] + ""));

    let td1 = document.createElement("td");
    td1.appendChild(document.createTextNode(" " + arr01[i] + ""));

    let td2 = document.createElement("td");
    td2.appendChild(document.createTextNode(" " + arr02[i] + ""));

    let td3 = document.createElement("td");
    td3.appendChild(document.createTextNode(" " + arr03[i] + ""));

    let td4 = document.createElement("td");
    td4.appendChild(document.createTextNode(" " + arr04[i] + ""));

    let td5 = document.createElement("td");
    td5.appendChild(document.createTextNode(" " + arr05[i] + ""));

    tr.appendChild(td0);
    tr.appendChild(td1);
    tr.appendChild(td2);
    tr.appendChild(td3);
    tr.appendChild(td4);
    tr.appendChild(td5);

    table.appendChild(tr);
  }
}


function updateFirewallRules() {
  var hostname = hostnameElement.value;
  var port = portElement.value;
  var username = usernameElement.value;
  var password = passwordElement.value;
  var nsId = namespaceElement.value;
  var mciId = mciidElement.value;
  var subgroupid = document.getElementById("subgroupid").value;
  var vmid = document.getElementById("vmid").value;

  const assocUrl = `http://${hostname}:${port}/tumblebug/ns/${nsId}/mci/${mciId}/associatedResources`;
  axios({
    method: "get",
    url: assocUrl,
    auth: { username, password },
  }).then((assocRes) => {
    const sgIds = (assocRes.data?.securityGroupIds || []);
    if (sgIds.length === 0) {
      errorAlert("No associated Security Groups found for this MCI.");
      return;
    }

    Promise.all(sgIds.map(sgId =>
      axios({
        method: "get",
        url: `http://${hostname}:${port}/tumblebug/ns/${nsId}/resources/securityGroup/${sgId}`,
        auth: { username, password },
      }).then(res => res.data)
    )).then((sgList) => {

      let summaryHtml = `
        <div style="margin-bottom:8px; font-size:12px; color:#444;">
          <b style="font-size:13px;">Security Group Rule Summary</b>
          <div style="margin-top: 10px;">
            <!-- Tab Navigation -->
            <ul class="nav nav-tabs" id="sgTabs" role="tablist" style="margin-bottom: 15px; border-bottom: 2px solid #dee2e6;">
              ${sgList.map((sg, idx) => `
                <li class="nav-item" role="presentation">
                  <button class="nav-link ${idx === 0 ? 'active' : ''}" id="sg-tab-${idx}" data-bs-toggle="tab" data-bs-target="#sg-content-${idx}" type="button" role="tab" aria-controls="sg-content-${idx}" aria-selected="${idx === 0}"
                          style="border: none; border-bottom: 3px solid transparent; padding: 10px 15px; margin-right: 5px; background: none; color: #6c757d; font-weight: 500; transition: all 0.3s ease; ${idx === 0 ? 'color: #007bff; border-bottom-color: #007bff;' : ''}"
                          onmouseover="if(!this.classList.contains('active')) { this.style.color='#007bff'; this.style.backgroundColor='#f8f9fa'; }"
                          onmouseout="if(!this.classList.contains('active')) { this.style.color='#6c757d'; this.style.backgroundColor='transparent'; }">
                    <span style="font-size: 12px; font-weight: 600;">${sg.name}</span>
                    <span style="margin-left: 6px; background-color: ${idx === 0 ? '#007bff' : '#6c757d'}; color: white; font-size: 9px; padding: 2px 6px; border-radius: 10px; font-weight: bold;">${(sg.firewallRules||[]).length}</span>
                  </button>
                </li>
              `).join("")}
            </ul>
            
            <!-- Tab Content -->
            <div class="tab-content" id="sgTabContent">
              ${sgList.map((sg, idx) => `
                <div class="tab-pane fade ${idx === 0 ? 'show active' : ''}" id="sg-content-${idx}" role="tabpanel" aria-labelledby="sg-tab-${idx}">
                  <div style="border: 1px solid #dee2e6; border-radius: 6px; padding: 15px; background-color: #f8f9fa;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                      <div>
                        <h6 style="margin: 0; color: #495057; font-weight: 600;">${sg.name}</h6>
                        <small style="color: #6c757d;">Security Group ID: <code>${sg.id}</code></small>
                      </div>
                      <button class="btn btn-success btn-sm" onclick="addNewRuleToSg('${sg.id}', '${sg.name}')" style="font-size: 11px; padding: 4px 8px;">
                        <span style="margin-right: 3px;">+</span>Add Rule
                      </button>
                    </div>
                    
                    <div style="background: white; border-radius: 4px; overflow: hidden; border: 1px solid #dee2e6;">
                      ${(sg.firewallRules||[]).length > 0 ? `
                        <table class="table table-sm table-hover" style="margin-bottom: 0; font-size: 12px;">
                          <thead style="background-color: #e9ecef;">
                            <tr>
                              <th style="padding: 8px; font-weight: 600; color: #495057; border-bottom: 2px solid #dee2e6;">Direction</th>
                              <th style="padding: 8px; font-weight: 600; color: #495057; border-bottom: 2px solid #dee2e6;">Protocol</th>
                              <th style="padding: 8px; font-weight: 600; color: #495057; border-bottom: 2px solid #dee2e6;">Port</th>
                              <th style="padding: 8px; font-weight: 600; color: #495057; border-bottom: 2px solid #dee2e6;">CIDR</th>
                              <th style="padding: 8px; font-weight: 600; color: #495057; border-bottom: 2px solid #dee2e6; text-align: center; width: 80px;">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            ${sg.firewallRules.map((rule, ruleIdx) => `
                              <tr style="transition: background-color 0.2s;">
                                <td style="padding: 8px; vertical-align: middle;">
                                  <span style="font-size: 9px; padding: 3px 8px; border-radius: 12px; font-weight: 600; color: white; background-color: ${rule.Direction === 'inbound' || (rule.direction && rule.direction.toLowerCase() === 'inbound') ? '#28a745' : '#6c757d'};">
                                    ${(rule.Direction || rule.direction || "").toUpperCase()}
                                  </span>
                                </td>
                                <td style="padding: 8px; vertical-align: middle;">
                                  <code style="background-color: #f8f9fa; padding: 2px 4px; border-radius: 3px; font-size: 10px;">
                                    ${(rule.Protocol || rule.protocol || "").toUpperCase()}
                                  </code>
                                </td>
                                <td style="padding: 8px; vertical-align: middle; font-family: monospace;">
                                  ${rule.Port || rule.port || ""}
                                </td>
                                <td style="padding: 8px; vertical-align: middle; font-family: monospace; color: #6c757d;">
                                  ${rule.CIDR || rule.cidr || ""}
                                </td>
                                <td style="padding: 8px; text-align: center; vertical-align: middle;">
                                  <button class="btn btn-outline-danger btn-xs" onclick="deleteFirewallRule('${sg.id}', '${sg.name}', '${encodeURIComponent(JSON.stringify(rule))}')" 
                                          style="font-size: 9px; padding: 2px 6px; border-radius: 3px;"
                                          title="Delete this rule">
                                    🗑️
                                  </button>
                                </td>
                              </tr>
                            `).join("")}
                          </tbody>
                        </table>
                      ` : `
                        <div style="padding: 20px; text-align: center; color: #6c757d;">
                          <div style="font-size: 24px; margin-bottom: 8px;">🔒</div>
                          <div style="font-weight: 500; margin-bottom: 4px;">No firewall rules defined</div>
                          <div style="font-size: 11px;">Click "Add Rule" to create your first rule</div>
                        </div>
                      `}
                    </div>
                  </div>
                </div>
              `).join("")}
            </div>
          </div>
        </div>
      `;

      let firstRule = null;
      if (sgList.length > 0 && (sgList[0].firewallRules || []).length > 0) {
        firstRule = sgList[0].firewallRules[0];
      }

      let rulesHtml = `
        <div style="background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); border: 1px solid #dee2e6;">
          <div style="background: #343a40; color: white; padding: 12px; font-weight: bold; display: flex; justify-content: space-between; align-items: center;">
            <span>
              <span style="margin-right: 8px;">🔧</span>
              Apply Same Rules to All Security Groups
            </span>
            <button class="btn btn-success btn-sm" onclick="addRuleRowAll()" style="font-size: 11px; padding: 4px 8px; background-color: #28a745; border: none;">
              <span style="margin-right: 3px;">+</span>Add Rule
            </button>
          </div>
          <div style="padding: 15px; background-color: #f8f9fa;">
            <div style="margin-bottom: 10px; font-size: 12px; color: #6c757d;">
              <strong>Note:</strong> These rules will be applied to all Security Groups associated with this MCI, replacing existing rules.
            </div>
            <div style="background: white; border-radius: 4px; overflow: hidden; border: 1px solid #dee2e6;">
              <table class="table table-sm table-hover" style="margin-bottom: 0; font-size: 12px;">
                <thead style="background-color: #e9ecef;">
                  <tr>
                    <th style="padding: 8px; font-weight: 600; color: #495057; border-bottom: 2px solid #dee2e6;">Direction</th>
                    <th style="padding: 8px; font-weight: 600; color: #495057; border-bottom: 2px solid #dee2e6;">Protocol</th>
                    <th style="padding: 8px; font-weight: 600; color: #495057; border-bottom: 2px solid #dee2e6;">Ports</th>
                    <th style="padding: 8px; font-weight: 600; color: #495057; border-bottom: 2px solid #dee2e6;">CIDR</th>
                    <th style="padding: 8px; font-weight: 600; color: #495057; border-bottom: 2px solid #dee2e6; text-align: center; width: 80px;">Actions</th>
                  </tr>
                </thead>
                <tbody id="sg-rules-all" style="background: white;">
                </tbody>
              </table>
              <div id="sg-rules-all-empty" style="padding: 20px; text-align: center; color: #6c757d; display: block;">
                <div style="font-size: 24px; margin-bottom: 8px;">📝</div>
                <div style="font-weight: 500; margin-bottom: 4px;">No rules defined yet</div>
                <div style="font-size: 11px;">Click "Add Rule" to create your first rule</div>
              </div>
            </div>
          </div>
        </div>
      `;


      const presetRules = [
        { direction: "inbound", protocol: "TCP", port: "22", cidr: "0.0.0.0/0", label: "SSH (22)" },
        { direction: "inbound", protocol: "TCP", port: "80", cidr: "0.0.0.0/0", label: "HTTP (80)" },
        { direction: "inbound", protocol: "TCP", port: "443", cidr: "0.0.0.0/0", label: "HTTPS (443)" },
        { direction: "inbound", protocol: "TCP", port: "1-65535", cidr: "0.0.0.0/0", label: "All TCP Ports" },
        { direction: "inbound", protocol: "UDP", port: "1-65535", cidr: "0.0.0.0/0", label: "All UDP Ports" },
        { direction: "inbound", protocol: "ICMP", port: "", cidr: "0.0.0.0/0", label: "ICMP" },
        { direction: "inbound", protocol: "ALL", port: "", cidr: "0.0.0.0/0", label: "All Protocols" },
      ];
      let presetHtml = presetRules.map((p, i) =>
        `<button class="btn btn-outline-secondary btn-sm" style="margin:3px; font-size:11px; padding:4px 8px; border-radius:4px;" onclick="insertPresetRule(${i})">${p.label}</button>`
      ).join("");

      Swal.fire({
        title: "Update Security Group Rules",
        html: `
          <div>
            ${summaryHtml}
            <div style="margin: 15px 0; padding: 12px; background: #e8f4fd; border-radius: 6px; border-left: 4px solid #0066cc;">
              <div style="font-weight: 600; color: #0066cc; margin-bottom: 8px; font-size: 13px;">📋 Frequently Used Rules</div>
              <div>${presetHtml}</div>
            </div>
            <div style="max-height:400px;overflow:auto;">${rulesHtml}</div>
          </div>
        `,
        width: 1200,
        showCancelButton: true,
        confirmButtonText: "Apply",
        cancelButtonText: "Cancel",
        didOpen: () => {
          // Initialize Bootstrap tabs functionality for Security Groups
          const tabButtons = document.querySelectorAll('#sgTabs button[data-bs-toggle="tab"]');
          tabButtons.forEach(button => {
            button.addEventListener('click', function (e) {
              e.preventDefault();
              
              // Remove active class from all tabs and content
              tabButtons.forEach(btn => {
                btn.classList.remove('active');
                btn.style.color = '#6c757d';
                btn.style.borderBottomColor = 'transparent';
                btn.style.backgroundColor = 'transparent';
                // Update badge color
                const badge = btn.querySelector('span:last-child');
                if (badge) badge.style.backgroundColor = '#6c757d';
              });
              document.querySelectorAll('.tab-pane').forEach(pane => {
                pane.classList.remove('show', 'active');
              });
              
              // Add active class to clicked tab
              this.classList.add('active');
              this.style.color = '#007bff';
              this.style.borderBottomColor = '#007bff';
              this.style.backgroundColor = 'transparent';
              // Update badge color for active tab
              const activeBadge = this.querySelector('span:last-child');
              if (activeBadge) activeBadge.style.backgroundColor = '#007bff';
              
              // Show corresponding content
              const target = this.getAttribute('data-bs-target');
              const targetPane = document.querySelector(target);
              if (targetPane) {
                targetPane.classList.add('show', 'active');
              }
            });
          });
          
          window.addRuleRowAll = function () {
            const tbody = document.getElementById("sg-rules-all");
            const emptyDiv = document.getElementById("sg-rules-all-empty");
            
            // Hide empty state message when adding first rule
            if (emptyDiv && tbody.rows.length === 0) {
              emptyDiv.style.display = 'none';
            }
            
            let def = { direction: "inbound", protocol: "TCP", ports: "", cidr: "" };
            if (firstRule) {
              def.direction = firstRule.Direction || firstRule.direction || "inbound";
              def.protocol = (firstRule.Protocol || firstRule.protocol || "TCP").toUpperCase();
              def.ports = firstRule.Ports || firstRule.port || "";
              def.cidr = firstRule.CIDR || firstRule.cidr || "";
            }
            const row = document.createElement("tr");
            row.style.transition = "background-color 0.2s";
            row.innerHTML = `
              <td style="padding: 8px; vertical-align: middle;">
                <select class="form-control" name="direction" style="font-size: 11px; padding: 4px;">
                  <option value="inbound" ${def.direction === "inbound" ? "selected" : ""}>Inbound</option>
                  <option value="outbound" ${def.direction === "outbound" ? "selected" : ""}>Outbound</option>
                </select>
              </td>
              <td style="padding: 8px; vertical-align: middle;">
                <select class="form-control" name="protocol" style="font-size: 11px; padding: 4px;" onchange="togglePortField(this)">
                  <option value="TCP" ${def.protocol === "TCP" ? "selected" : ""}>TCP</option>
                  <option value="UDP" ${def.protocol === "UDP" ? "selected" : ""}>UDP</option>
                  <option value="ICMP" ${def.protocol === "ICMP" ? "selected" : ""}>ICMP</option>
                  <option value="ALL" ${def.protocol === "ALL" ? "selected" : ""}>ALL</option>
                </select>
              </td>
              <td style="padding: 8px; vertical-align: middle;">
                <input type="text" class="form-control" name="Ports" placeholder="ex: 22,80,1000-2000" value="${def.ports}" style="font-size: 11px; padding: 4px; font-family: monospace;">
              </td>
              <td style="padding: 8px; vertical-align: middle;">
                <input type="text" class="form-control" name="cidr" value="${def.cidr}" placeholder="ex: 0.0.0.0/0" style="font-size: 11px; padding: 4px; font-family: monospace;">
              </td>
              <td style="padding: 8px; text-align: center; vertical-align: middle;">
                <button class="btn btn-outline-danger btn-xs" onclick="removeRuleRowAll(this)" style="font-size: 9px; padding: 2px 6px; border-radius: 3px;" title="Delete this rule">
                  🗑️
                </button>
              </td>
            `;
            tbody.appendChild(row);
            
            // Check initial protocol and disable port field if needed
            const protocolSelect = row.querySelector('select[name="protocol"]');
            const portInput = row.querySelector('input[name="Ports"]');
            if (protocolSelect.value === "ICMP" || protocolSelect.value === "ALL") {
              portInput.disabled = true;
              portInput.value = "";
              portInput.placeholder = "Not applicable for " + protocolSelect.value;
              portInput.style.backgroundColor = "#f8f9fa";
            }
          };
          
          // Add remove function for rules
          window.removeRuleRowAll = function(button) {
            const row = button.closest('tr');
            const tbody = document.getElementById("sg-rules-all");
            const emptyDiv = document.getElementById("sg-rules-all-empty");
            
            row.remove();
            
            // Show empty state message if no rules left
            if (emptyDiv && tbody.rows.length === 0) {
              emptyDiv.style.display = 'block';
            }
          };
          
          // Function to toggle port field based on protocol selection
          window.togglePortField = function(protocolSelect) {
            const row = protocolSelect.closest('tr');
            const portInput = row.querySelector('input[name="Ports"]');
            const protocol = protocolSelect.value;
            
            if (protocol === "ICMP" || protocol === "ALL") {
              portInput.disabled = true;
              portInput.value = "";
              portInput.placeholder = "Not applicable for " + protocol;
              portInput.style.backgroundColor = "#f8f9fa";
              portInput.style.color = "#6c757d";
            } else {
              portInput.disabled = false;
              portInput.placeholder = "ex: 22,80,1000-2000";
              portInput.style.backgroundColor = "";
              portInput.style.color = "";
            }
          };
          
          window.insertPresetRule = function (presetIdx) {
            const p = presetRules[presetIdx];
            const tbody = document.getElementById("sg-rules-all");
            const emptyDiv = document.getElementById("sg-rules-all-empty");
            
            // Hide empty state message when adding first rule
            if (emptyDiv && tbody.rows.length === 0) {
              emptyDiv.style.display = 'none';
            }
            
            let def = { direction: "inbound", protocol: "TCP" };
            if (firstRule) {
              def.direction = firstRule.Direction || firstRule.direction || "inbound";
              def.protocol = (firstRule.Protocol || firstRule.protocol || "TCP").toUpperCase();
            }
            const row = document.createElement("tr");
            row.style.transition = "background-color 0.2s";
            row.innerHTML = `
              <td style="padding: 8px; vertical-align: middle;">
                <select class="form-control" name="direction" style="font-size: 11px; padding: 4px;">
                  <option value="inbound" ${p.direction === "inbound" ? "selected" : ""}>Inbound</option>
                  <option value="outbound" ${p.direction === "outbound" ? "selected" : ""}>Outbound</option>
                </select>
              </td>
              <td style="padding: 8px; vertical-align: middle;">
                <select class="form-control" name="protocol" style="font-size: 11px; padding: 4px;" onchange="togglePortField(this)">
                  <option value="TCP" ${p.protocol === "TCP" ? "selected" : ""}>TCP</option>
                  <option value="UDP" ${p.protocol === "UDP" ? "selected" : ""}>UDP</option>
                  <option value="ICMP" ${p.protocol === "ICMP" ? "selected" : ""}>ICMP</option>
                  <option value="ALL" ${p.protocol === "ALL" ? "selected" : ""}>ALL</option>
                </select>
              </td>
              <td style="padding: 8px; vertical-align: middle;">
                <input type="text" class="form-control" name="Ports" placeholder="ex: 22,80,1000-2000" value="${p.port}" style="font-size: 11px; padding: 4px; font-family: monospace;">
              </td>
              <td style="padding: 8px; vertical-align: middle;">
                <input type="text" class="form-control" name="cidr" value="${p.cidr}" style="font-size: 11px; padding: 4px; font-family: monospace;">
              </td>
              <td style="padding: 8px; text-align: center; vertical-align: middle;">
                <button class="btn btn-outline-danger btn-xs" onclick="removeRuleRowAll(this)" style="font-size: 9px; padding: 2px 6px; border-radius: 3px;" title="Delete this rule">
                  🗑️
                </button>
              </td>
            `;
            tbody.appendChild(row);
            
            // Check protocol and disable port field if needed
            const protocolSelect = row.querySelector('select[name="protocol"]');
            const portInput = row.querySelector('input[name="Ports"]');
            if (protocolSelect.value === "ICMP" || protocolSelect.value === "ALL") {
              portInput.disabled = true;
              portInput.value = "";
              portInput.placeholder = "Not applicable for " + protocolSelect.value;
              portInput.style.backgroundColor = "#f8f9fa";
            }
          };
        },
        preConfirm: () => {

          const tbody = document.getElementById("sg-rules-all");
          let rules = [];
          for (let row of tbody.rows) {
            const direction = row.querySelector('select[name="direction"]').value;
            const protocol = row.querySelector('select[name="protocol"]').value;
            const port = row.querySelector('input[name="Ports"]').value.trim();
            const cidr = row.querySelector('input[name="cidr"]').value.trim();
            
            // For ICMP and ALL protocols, port is not required
            const isPortRequired = (protocol === "TCP" || protocol === "UDP");
            const isValidRule = direction && protocol && cidr && (!isPortRequired || (isPortRequired && port));
            
            if (isValidRule) {
              rules.push({
                Ports: port || "", // Use empty string for ICMP/ALL protocols
                Protocol: protocol,
                Direction: direction,
                CIDR: cidr
              });
            }
          }
          return sgList.map(sg => ({ id: sg.id, name: sg.name, firewallRules: rules }));
        }
      }).then((result) => {
        if (result.isConfirmed) {
          
          // Show loading message
          Swal.fire({
            title: 'Updating Security Groups...',
            text: 'Please wait while we update the security group rules.',
            allowOutsideClick: false,
            allowEscapeKey: false,
            showConfirmButton: false,
            didOpen: () => {
              Swal.showLoading();
            }
          });

          // Since we now use UpdateMultipleFirewallRules, make a single API call instead of multiple calls
          const updatePromise = axios({
            method: "put",
            url: `http://${hostname}:${port}/tumblebug/ns/${nsId}/mci/${mciId}/associatedSecurityGroups`,
            headers: { "Content-Type": "application/json" },
            data: JSON.stringify({
              firewallRules: result.value[0].firewallRules // All SGs get the same rules
            }),
            auth: { username, password },
          }).then(response => {
            // Check if response has the new batch format with response array and summary
            const responseData = response.data;
            if (responseData && responseData.response && Array.isArray(responseData.response)) {
              // New batch response format - extract individual results
              return responseData.response.map(sgResponse => ({
                id: sgResponse.id,
                name: sgResponse.name,
                success: sgResponse.success,
                message: sgResponse.message || "Successfully updated",
                response: sgResponse,
                summary: responseData.summary // Include summary information
              }));
            } else {
              // Fallback for unexpected response format
              return sgList.map(sg => ({
                id: sg.id,
                name: sg.name,
                success: false,
                message: "Unexpected response format",
                response: responseData
              }));
            }
          }).catch(error => {
            // Return error result for each security group
            return sgList.map(sg => ({
              id: sg.id,
              name: sg.name,
              success: false,
              message: error.response?.data?.message || error.message || "Unknown error",
              error: error
            }));
          });

          updatePromise.then((results) => {
            const successCount = results.filter(r => r.success).length;
            const failedCount = results.filter(r => r.success === false).length;
            const allSuccess = failedCount === 0;
            
            // Extract summary if available
            const summary = results.length > 0 && results[0].summary ? results[0].summary : null;

            // Calculate update time and other details
            const updateTime = new Date().toLocaleString();
            
            // Create detailed result table with summary information
            let resultHtml = `
              <div style="text-align: left;">
                <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                  <h5 style="margin: 0 0 12px 0; color: #495057; display: flex; align-items: center;">
                    <span style="margin-right: 8px;">📊</span>
                    Security Group Update Results Summary
                    ${summary ? '<span style="font-size: 12px; color: #6c757d; margin-left: 10px;">(Parallel Processing)</span>' : ''}
                  </h5>
                  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 15px; margin-bottom: 10px;">
                    <div style="text-align: center; padding: 8px; background: white; border-radius: 6px; border-left: 4px solid #6c757d;">
                      <div style="font-size: 18px; font-weight: bold; color: #6c757d;">${summary ? summary.total : results.length}</div>
                      <div style="font-size: 12px; color: #6c757d;">Total</div>
                    </div>
                    <div style="text-align: center; padding: 8px; background: white; border-radius: 6px; border-left: 4px solid #28a745;">
                      <div style="font-size: 18px; font-weight: bold; color: #28a745;">${summary ? summary.success : successCount}</div>
                      <div style="font-size: 12px; color: #28a745;">Success</div>
                    </div>
                    <div style="text-align: center; padding: 8px; background: white; border-radius: 6px; border-left: 4px solid #dc3545;">
                      <div style="font-size: 18px; font-weight: bold; color: #dc3545;">${summary ? summary.failed : failedCount}</div>
                      <div style="font-size: 12px; color: #dc3545;">Failed</div>
                    </div>
                    <div style="text-align: center; padding: 8px; background: white; border-radius: 6px; border-left: 4px solid #17a2b8;">
                      <div style="font-size: 11px; font-weight: bold; color: #17a2b8;">${updateTime}</div>
                      <div style="font-size: 12px; color: #17a2b8;">Updated</div>
                    </div>
                  </div>
                  ${summary && summary.allSuccess ? 
                    '<div style="background: #d4edda; color: #155724; padding: 8px; border-radius: 4px; font-size: 12px; text-align: center;"><strong>✅ All security groups updated successfully!</strong></div>' : 
                    summary && !summary.allSuccess ? 
                    '<div style="background: #fff3cd; color: #856404; padding: 8px; border-radius: 4px; font-size: 12px; text-align: center;"><strong>⚠️ Some security groups failed to update</strong></div>' : ''
                  }
                </div>
                
                <div style="background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                  <div style="background: #343a40; color: white; padding: 12px; font-weight: bold;">
                    <span style="margin-right: 8px;">📋</span>
                    Detailed Update Results
                  </div>
                  <div style="max-height: 400px; overflow-y: auto;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                      <thead style="background: #f8f9fa; position: sticky; top: 0; z-index: 1;">
                        <tr>
                          <th style="padding: 12px 8px; text-align: left; border-bottom: 2px solid #dee2e6; font-weight: 600; color: #495057; width: 50px;">#</th>
                          <th style="padding: 12px 8px; text-align: left; border-bottom: 2px solid #dee2e6; font-weight: 600; color: #495057; width: 80px;">Status</th>
                          <th style="padding: 12px 8px; text-align: left; border-bottom: 2px solid #dee2e6; font-weight: 600; color: #495057; min-width: 150px;">Security Group</th>
                          <th style="padding: 12px 8px; text-align: left; border-bottom: 2px solid #dee2e6; font-weight: 600; color: #495057;">ID</th>
                          <th style="padding: 12px 8px; text-align: left; border-bottom: 2px solid #dee2e6; font-weight: 600; color: #495057; min-width: 200px;">Message</th>
                          <th style="padding: 12px 8px; text-align: left; border-bottom: 2px solid #dee2e6; font-weight: 600; color: #495057; width: 100px;">Details</th>
                        </tr>
                      </thead>
                      <tbody>
            `;

            results.forEach((result, index) => {
              const statusIcon = result.success ? '✅' : '❌';
              const statusText = result.success ? 'Success' : 'Failed';
              const statusColor = result.success ? '#28a745' : '#dc3545';
              const rowBgColor = result.success ? '#f8fff8' : '#fff5f5';
              const rulesCount = result.response?.firewallRules?.length || result.response?.updated?.firewallRules?.length || 'N/A';
              
              resultHtml += `
                <tr style="background-color: ${rowBgColor}; border-bottom: 1px solid #f0f0f0;">
                  <td style="padding: 12px 8px; text-align: center; font-weight: bold; color: #6c757d;">${index + 1}</td>
                  <td style="padding: 12px 8px; text-align: center;">
                    <div style="display: flex; align-items: center; justify-content: center; gap: 6px;">
                      <span style="font-size: 16px;">${statusIcon}</span>
                      <span style="font-weight: 600; color: ${statusColor}; font-size: 12px;">${statusText}</span>
                    </div>
                  </td>
                  <td style="padding: 12px 8px;">
                    <div style="font-weight: 600; color: #212529; margin-bottom: 2px;">${result.name}</div>
                    <div style="font-size: 11px; color: #6c757d;">Rules: ${rulesCount}</div>
                  </td>
                  <td style="padding: 12px 8px;">
                    <code style="background: #f8f9fa; padding: 2px 6px; border-radius: 3px; font-size: 11px; color: #495057;">${result.id}</code>
                  </td>
                  <td style="padding: 12px 8px;">
                    <div style="color: #495057; line-height: 1.4; word-break: break-word;">
                      ${result.message}
                    </div>
                  </td>
                  <td style="padding: 12px 8px; text-align: center;">
                    <button onclick="showSgDetails('${result.id}', '${result.name}', ${index})" 
                            style="background: #17a2b8; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 11px; cursor: pointer; transition: background 0.2s;"
                            onmouseover="this.style.background='#138496'" 
                            onmouseout="this.style.background='#17a2b8'">
                      View
                    </button>
                  </td>
                </tr>
              `;
            });

            resultHtml += `
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            `;

            // Add global function for showing details
            window.showSgDetails = function(sgId, sgName, index) {
              const result = results[index];
              let detailsHtml = `
                <div style="text-align: left;">
                  <h6 style="color: #495057; margin-bottom: 15px;">
                    <strong>Security Group:</strong> ${sgName} 
                    <span style="font-size: 12px; color: #6c757d;">(${sgId})</span>
                  </h6>
              `;
              
              if (result.success && result.response) {
                const sgData = result.response.updated || result.response;
                if (sgData.firewallRules && sgData.firewallRules.length > 0) {
                  detailsHtml += `
                    <div style="margin-bottom: 15px;">
                      <strong style="color: #28a745;">✅ Updated Rules (${sgData.firewallRules.length}):</strong>
                      <div style="max-height: 200px; overflow-y: auto; margin-top: 8px; border: 1px solid #dee2e6; border-radius: 4px;">
                        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                          <thead style="background: #f8f9fa;">
                            <tr>
                              <th style="padding: 6px; border-bottom: 1px solid #dee2e6;">Direction</th>
                              <th style="padding: 6px; border-bottom: 1px solid #dee2e6;">Protocol</th>
                              <th style="padding: 6px; border-bottom: 1px solid #dee2e6;">Port</th>
                              <th style="padding: 6px; border-bottom: 1px solid #dee2e6;">CIDR</th>
                            </tr>
                          </thead>
                          <tbody>
                  `;
                  
                  sgData.firewallRules.forEach(rule => {
                    detailsHtml += `
                      <tr>
                        <td style="padding: 6px; border-bottom: 1px solid #f0f0f0;">${rule.Direction || rule.direction || 'N/A'}</td>
                        <td style="padding: 6px; border-bottom: 1px solid #f0f0f0;">${rule.Protocol || rule.protocol || 'N/A'}</td>
                        <td style="padding: 6px; border-bottom: 1px solid #f0f0f0;">${rule.Port || rule.port || rule.Ports || 'N/A'}</td>
                        <td style="padding: 6px; border-bottom: 1px solid #f0f0f0;">${rule.CIDR || rule.cidr || 'N/A'}</td>
                      </tr>
                    `;
                  });
                  
                  detailsHtml += `
                          </tbody>
                        </table>
                      </div>
                    </div>
                  `;
                }
              } else {
                detailsHtml += `
                  <div style="color: #dc3545; background: #f8d7da; padding: 10px; border-radius: 4px; margin-bottom: 10px;">
                    <strong>❌ Update Failed:</strong><br>
                    ${result.message}
                  </div>
                `;
                
                if (result.error && result.error.response) {
                  detailsHtml += `
                    <div style="background: #f8f9fa; padding: 10px; border-radius: 4px; border-left: 4px solid #dc3545;">
                      <strong>Error Details:</strong><br>
                      <code style="font-size: 11px; color: #dc3545;">${JSON.stringify(result.error.response.data, null, 2)}</code>
                    </div>
                  `;
                }
              }
              
              detailsHtml += `</div>`;
              
              Swal.fire({
                title: `Security Group Details`,
                html: detailsHtml,
                width: 600,
                confirmButtonText: "Close",
                confirmButtonColor: "#6c757d"
              });
            };

            if (allSuccess) {
              Swal.fire({
                title: "🎉 All Updates Successful!",
                html: resultHtml,
                icon: "success",
                width: 900,
                confirmButtonText: "Excellent!",
                confirmButtonColor: "#28a745"
              });
            } else if (successCount > 0) {
              Swal.fire({
                title: "⚠️ Partial Success",
                html: resultHtml,
                icon: "warning",
                width: 900,
                confirmButtonText: "Got it",
                confirmButtonColor: "#ffc107"
              });
            } else {
              Swal.fire({
                title: "❌ Update Failed",
                html: resultHtml,
                icon: "error",
                width: 900,
                confirmButtonText: "Retry",
                confirmButtonColor: "#dc3545"
              });
            }
          }).catch((err) => {
            Swal.fire({
              title: "💥 Unexpected Error",
              html: `
                <div style="text-align: left;">
                  <p>An unexpected error occurred while updating security group rules:</p>
                  <div style="background-color: #f8f9fa; padding: 12px; border-radius: 6px; border-left: 4px solid #dc3545;">
                    <code style="color: #dc3545;">${err.response?.data?.message || err.message || err}</code>
                  </div>
                  <p style="margin-top: 12px; color: #6c757d;">Please check your connection and try again.</p>
                </div>
              `,
              icon: "error",
              width: 600,
              confirmButtonText: "Close",
              confirmButtonColor: "#dc3545"
            });
          });
        }
      }).catch((err) => {
        if (err) errorAlert("Popup error: " + err);
      });
    }).catch((err) => {
      errorAlert("Failed to load security group details: " + (err.response?.data?.message || err));
    });
  }).catch((err) => {
    errorAlert("Failed to load associated security group IDs: " + (err.response?.data?.message || err));
  });
}
window.updateFirewallRules = updateFirewallRules;

// Function to delete individual firewall rule
function deleteFirewallRule(sgId, sgName, ruleData) {
  try {
    const rule = JSON.parse(decodeURIComponent(ruleData));
    
    Swal.fire({
      title: "Delete Firewall Rule",
      html: `
        <div style="text-align: left;">
          <p><strong>Security Group:</strong> ${sgName}</p>
          <p><strong>Rule to delete:</strong></p>
          <div style="background: #f8f9fa; padding: 10px; border-radius: 4px; border-left: 4px solid #dc3545;">
            <strong>Direction:</strong> ${rule.Direction || rule.direction || 'N/A'}<br>
            <strong>Protocol:</strong> ${rule.Protocol || rule.protocol || 'N/A'}<br>
            <strong>Port:</strong> ${rule.Port || rule.port || rule.Ports || 'N/A'}<br>
            <strong>CIDR:</strong> ${rule.CIDR || rule.cidr || 'N/A'}
          </div>
          <p style="color: #dc3545; margin-top: 10px;">⚠️ This action cannot be undone.</p>
        </div>
      `,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
      confirmButtonColor: "#dc3545",
      cancelButtonText: "Cancel",
      cancelButtonColor: "#6c757d"
    }).then((result) => {
      if (result.isConfirmed) {
        // Show loading
        Swal.fire({
          title: 'Deleting Rule...',
          text: 'Please wait while we delete the firewall rule.',
          allowOutsideClick: false,
          allowEscapeKey: false,
          showConfirmButton: false,
          didOpen: () => {
            Swal.showLoading();
          }
        });

        var hostname = hostnameElement.value;
        var port = portElement.value;
        var username = usernameElement.value;
        var password = passwordElement.value;
        var nsId = namespaceElement.value;

        // Prepare request data for deletion
        const deleteRule = {
          Direction: rule.Direction || rule.direction,
          Protocol: rule.Protocol || rule.protocol,
          Ports: rule.Port || rule.port || rule.Ports,
          CIDR: rule.CIDR || rule.cidr
        };

        axios({
          method: "delete",
          url: `http://${hostname}:${port}/tumblebug/ns/${nsId}/resources/securityGroup/${sgId}/rules`,
          headers: { "Content-Type": "application/json" },
          data: JSON.stringify({
            firewallRules: [deleteRule]
          }),
          auth: { username, password },
        }).then((response) => {
          const responseData = response.data;
          // Check if the response indicates success
          const isSuccess = responseData.success !== false;
          
          if (isSuccess) {
            Swal.fire({
              title: "✅ Rule Deleted Successfully",
              html: `
                <div style="text-align: left;">
                  <p>The firewall rule has been successfully deleted from security group <strong>${sgName}</strong>.</p>
                  <div style="background: #d4edda; padding: 10px; border-radius: 4px; border-left: 4px solid #28a745; margin-top: 10px;">
                    <strong>Deleted Rule:</strong><br>
                    Direction: ${deleteRule.Direction}<br>
                    Protocol: ${deleteRule.Protocol}<br>
                    Port: ${deleteRule.Ports}<br>
                    CIDR: ${deleteRule.CIDR}
                  </div>
                  ${responseData.message ? `<p style="margin-top: 10px; color: #28a745;"><strong>Message:</strong> ${responseData.message}</p>` : ''}
                </div>
              `,
              icon: "success",
              confirmButtonText: "Refresh View",
              confirmButtonColor: "#28a745"
            }).then(() => {
              // Refresh the firewall rules view
              updateFirewallRules();
            });
          } else {
            throw new Error(responseData.message || 'Failed to delete rule');
          }
        }).catch((error) => {
          Swal.fire({
            title: "❌ Delete Failed",
            html: `
              <div style="text-align: left;">
                <p>Failed to delete the firewall rule:</p>
                <div style="background: #f8d7da; padding: 10px; border-radius: 4px; border-left: 4px solid #dc3545;">
                  <code style="color: #dc3545;">${error.response?.data?.message || error.message || 'Unknown error'}</code>
                </div>
              </div>
            `,
            icon: "error",
            confirmButtonText: "Close",
            confirmButtonColor: "#dc3545"
          });
        });
      }
    });
  } catch (err) {
    errorAlert("Error parsing rule data: " + err.message);
  }
}
window.deleteFirewallRule = deleteFirewallRule;

// Function to add new firewall rule to specific security group
function addNewRuleToSg(sgId, sgName) {
  Swal.fire({
    title: `Add New Rule to ${sgName}`,
    html: `
      <div style="text-align: left;">
        <div style="margin-bottom: 15px;">
          <label style="font-weight: bold; margin-bottom: 5px; display: block;">Direction:</label>
          <select id="newRuleDirection" class="form-control">
            <option value="inbound">Inbound</option>
            <option value="outbound">Outbound</option>
          </select>
        </div>
        <div style="margin-bottom: 15px;">
          <label style="font-weight: bold; margin-bottom: 5px; display: block;">Protocol:</label>
          <select id="newRuleProtocol" class="form-control" onchange="togglePortFieldIndividual()">
            <option value="TCP">TCP</option>
            <option value="UDP">UDP</option>
            <option value="ICMP">ICMP</option>
            <option value="ALL">ALL</option>
          </select>
        </div>
        <div style="margin-bottom: 15px;">
          <label style="font-weight: bold; margin-bottom: 5px; display: block;">Port:</label>
          <input type="text" id="newRulePort" class="form-control" placeholder="ex: 22, 80-100, 22,80,443" />
          <small style="color: #6c757d;">Enter single port (22), port range (80-100), or multiple (22,80,443)</small>
        </div>
        <div style="margin-bottom: 15px;">
          <label style="font-weight: bold; margin-bottom: 5px; display: block;">CIDR:</label>
          <input type="text" id="newRuleCidr" class="form-control" placeholder="ex: 0.0.0.0/0, 192.168.1.0/24" value="0.0.0.0/0" />
          <small style="color: #6c757d;">IP address range in CIDR notation</small>
        </div>
        <div style="background: #f8f9fa; padding: 10px; border-radius: 4px; margin-top: 15px;">
          <strong>Quick Templates:</strong><br>
          <button class="btn btn-outline-secondary btn-sm" onclick="setQuickTemplate('SSH')" style="margin: 2px;">SSH (22)</button>
          <button class="btn btn-outline-secondary btn-sm" onclick="setQuickTemplate('HTTP')" style="margin: 2px;">HTTP (80)</button>
          <button class="btn btn-outline-secondary btn-sm" onclick="setQuickTemplate('HTTPS')" style="margin: 2px;">HTTPS (443)</button>
          <button class="btn btn-outline-secondary btn-sm" onclick="setQuickTemplate('MYSQL')" style="margin: 2px;">MySQL (3306)</button>
          <button class="btn btn-outline-secondary btn-sm" onclick="setQuickTemplate('POSTGRES')" style="margin: 2px;">PostgreSQL (5432)</button>
          <button class="btn btn-outline-secondary btn-sm" onclick="setQuickTemplate('ALL_TCP')" style="margin: 2px;">All TCP Ports</button>
          <button class="btn btn-outline-secondary btn-sm" onclick="setQuickTemplate('ALL_UDP')" style="margin: 2px;">All UDP Ports</button>
          <button class="btn btn-outline-secondary btn-sm" onclick="setQuickTemplate('ICMP')" style="margin: 2px;">ICMP</button>
          <button class="btn btn-outline-secondary btn-sm" onclick="setQuickTemplate('ALL_PROTOCOLS')" style="margin: 2px;">All Protocols</button>
        </div>
      </div>
    `,
    width: 500,
    showCancelButton: true,
    confirmButtonText: "Add Rule",
    confirmButtonColor: "#28a745",
    cancelButtonText: "Cancel",
    cancelButtonColor: "#6c757d",
    didOpen: () => {
      // Function to toggle port field for individual rule addition
      window.togglePortFieldIndividual = function() {
        const protocolSelect = document.getElementById("newRuleProtocol");
        const portInput = document.getElementById("newRulePort");
        const protocol = protocolSelect.value;
        
        if (protocol === "ICMP" || protocol === "ALL") {
          portInput.disabled = true;
          portInput.value = "";
          portInput.placeholder = "Not applicable for " + protocol;
          portInput.style.backgroundColor = "#f8f9fa";
          portInput.style.color = "#6c757d";
        } else {
          portInput.disabled = false;
          portInput.placeholder = "ex: 22, 80-100, 22,80,443";
          portInput.style.backgroundColor = "";
          portInput.style.color = "";
        }
      };
      
      // Initialize port field state
      togglePortFieldIndividual();
      
      // Define quick template function
      window.setQuickTemplate = function(template) {
        const protocolSelect = document.getElementById("newRuleProtocol");
        const portInput = document.getElementById("newRulePort");
        const cidrInput = document.getElementById("newRuleCidr");
        
        switch(template) {
          case 'SSH':
            protocolSelect.value = "TCP";
            portInput.value = "22";
            cidrInput.value = "0.0.0.0/0";
            break;
          case 'HTTP':
            protocolSelect.value = "TCP";
            portInput.value = "80";
            cidrInput.value = "0.0.0.0/0";
            break;
          case 'HTTPS':
            protocolSelect.value = "TCP";
            portInput.value = "443";
            cidrInput.value = "0.0.0.0/0";
            break;
          case 'MYSQL':
            protocolSelect.value = "TCP";
            portInput.value = "3306";
            cidrInput.value = "0.0.0.0/0";
            break;
          case 'POSTGRES':
            protocolSelect.value = "TCP";
            portInput.value = "5432";
            cidrInput.value = "0.0.0.0/0";
            break;
          case 'ALL_TCP':
            protocolSelect.value = "TCP";
            portInput.value = "1-65535";
            cidrInput.value = "0.0.0.0/0";
            break;
          case 'ALL_UDP':
            protocolSelect.value = "UDP";
            portInput.value = "1-65535";
            cidrInput.value = "0.0.0.0/0";
            break;
          case 'ICMP':
            protocolSelect.value = "ICMP";
            portInput.value = "";
            cidrInput.value = "0.0.0.0/0";
            break;
          case 'ALL_PROTOCOLS':
            protocolSelect.value = "ALL";
            portInput.value = "";
            cidrInput.value = "0.0.0.0/0";
            break;
        }
        
        // Update port field state after template selection
        togglePortFieldIndividual();
      };
    },
    preConfirm: () => {
      const direction = document.getElementById("newRuleDirection").value;
      const protocol = document.getElementById("newRuleProtocol").value;
      const port = document.getElementById("newRulePort").value.trim();
      const cidr = document.getElementById("newRuleCidr").value.trim();
      
      // For ICMP and ALL protocols, port is not required
      if (!direction || !protocol || !cidr) {
        Swal.showValidationMessage("Direction, Protocol, and CIDR are required");
        return false;
      }
      
      // Check port requirement based on protocol
      if ((protocol === "TCP" || protocol === "UDP") && !port) {
        Swal.showValidationMessage("Port is required for TCP and UDP protocols");
        return false;
      }
      
      // Basic CIDR validation
      if (!cidr.includes('/')) {
        Swal.showValidationMessage("CIDR must include network prefix (e.g., 0.0.0.0/0)");
        return false;
      }
      
      return { direction, protocol, port: port || "", cidr };
    }
  }).then((result) => {
    if (result.isConfirmed) {
      const { direction, protocol, port, cidr } = result.value;
      
      // Show loading
      Swal.fire({
        title: 'Adding Rule...',
        text: 'Please wait while we add the new firewall rule.',
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false,
        didOpen: () => {
          Swal.showLoading();
        }
      });

      var hostname = hostnameElement.value;
      var portVal = portElement.value;
      var username = usernameElement.value;
      var password = passwordElement.value;
      var nsId = namespaceElement.value;

      // Prepare request data for addition
      const newRule = {
        Direction: direction,
        Protocol: protocol,
        Ports: port,
        CIDR: cidr
      };

      axios({
        method: "post",
        url: `http://${hostname}:${portVal}/tumblebug/ns/${nsId}/resources/securityGroup/${sgId}/rules`,
        headers: { "Content-Type": "application/json" },
        data: JSON.stringify({
          firewallRules: [newRule]
        }),
        auth: { username, password },
      }).then((response) => {
        const responseData = response.data;
        // Check if the response indicates success
        const isSuccess = responseData.success !== false;
        
        if (isSuccess) {
          Swal.fire({
            title: "✅ Rule Added Successfully",
            html: `
              <div style="text-align: left;">
                <p>The new firewall rule has been successfully added to security group <strong>${sgName}</strong>.</p>
                <div style="background: #d4edda; padding: 10px; border-radius: 4px; border-left: 4px solid #28a745; margin-top: 10px;">
                  <strong>Added Rule:</strong><br>
                  Direction: ${newRule.Direction}<br>
                  Protocol: ${newRule.Protocol}<br>
                  ${newRule.Ports ? `Port: ${newRule.Ports}<br>` : ''}
                  CIDR: ${newRule.CIDR}
                </div>
                ${responseData.message ? `<p style="margin-top: 10px; color: #28a745;"><strong>Message:</strong> ${responseData.message}</p>` : ''}
              </div>
            `,
            icon: "success",
            confirmButtonText: "Refresh View",
            confirmButtonColor: "#28a745"
          }).then(() => {
            // Refresh the firewall rules view
            updateFirewallRules();
          });
        } else {
          throw new Error(responseData.message || 'Failed to add rule');
        }
      }).catch((error) => {
        Swal.fire({
          title: "❌ Add Failed",
          html: `
            <div style="text-align: left;">
              <p>Failed to add the new firewall rule:</p>
              <div style="background: #f8d7da; padding: 10px; border-radius: 4px; border-left: 4px solid #dc3545;">
                <code style="color: #dc3545;">${error.response?.data?.message || error.message || 'Unknown error'}</code>
              </div>
            </div>
          `,
          icon: "error",
          confirmButtonText: "Close",
          confirmButtonColor: "#dc3545"
        });
      });
    }
  });
}
window.addNewRuleToSg = addNewRuleToSg;
