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
var mcisName = new Array();
var mcisStatus = new Array();
var mcisGeo = new Array();

var cspListDisplayEnabled = document.getElementById("displayOn");
var tableDisplayEnabled = document.getElementById("tableOn");
var table = document.getElementById("detailTable");
var recommendPolicy = document.getElementById("recommendPolicy");
var osImage = document.getElementById("osImage");
var diskSize = document.getElementById("diskSize");
var selectApp = document.getElementById("selectApp");

var messageTextArea = document.getElementById("message");
var messageJsonOutput = document.getElementById("jsonoutput");

var hostnameElement = document.getElementById("hostname");
var portElement = document.getElementById("port");
var usernameElement = document.getElementById("username");
var passwordElement = document.getElementById("password");
var namespaceElement = document.getElementById("namespace");
var mcisidElement = document.getElementById("mcisid");

const typeStringConnection = "connection";
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
  map.render();
}
window.clearMap = clearMap;

function clearCircle(option) {
  //document.getElementById("latLonInputPairArea").innerHTML = '';
  if (option == "clearText") {
    messageTextArea.value = "";
  }
  latLonInputPairIdx = 0;
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
    messageTextArea.value = `[Started MCIS configuration]\n`;
  }
  messageTextArea.value += `\n - [VM-${
    idx + 1
  }]  Location:  ${latf}, ${lonf}\t\t| Best Spec: `;
  messageTextArea.scrollTop = messageTextArea.scrollHeight;
}

var latLonInputPairIdx = 0;
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
  //getMcis();
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

addIconToMap("img/iconNlb.png", pnt, "001");
var iconStyleNlb = new Style({
  image: new Icon({
    crossOrigin: "anonymous",
    src: "img/iconNlb.png",
    opacity: 1.0,
    scale: 0.7,
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

function returnAdjustmentPoint(num) {
  ax = 0.0;
  ay = 0.0;
  if (num == 1) {
    ax = 0;
    ay = 1;
  } else if (num == 2) {
    ax = 0.8;
    ay = 0.8;
  } else if (num == 3) {
    ax = 1;
    ay = 0;
  } else if (num == 4) {
    ax = 0.8;
    ay = -0.8;
  } else if (num == 5) {
    ax = 0;
    ay = -1;
  } else if (num == 6) {
    ax = -0.8;
    ay = -0.8;
  } else if (num == 7) {
    ax = -1;
    ay = -0;
  } else if (num == 8) {
    ax = -0.8;
    ay = 0.8;
  } else {
    ax = Math.random() - Math.random();
    ay = Math.random() - Math.random();
  }
  ax = Math.random() * 0.1 + ax;
  ay = Math.random() * 0.1 + ay;
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

  mcisGeo[cnt] = new Polygon([resourcePoints]);
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
// setTimeout(() => getMcis(), refreshInterval*1000);
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

function getMcis() {
  var hostname = hostnameElement.value;
  var port = portElement.value;
  var username = usernameElement.value;
  var password = passwordElement.value;
  var namespace = namespaceElement.value;

  refreshInterval = document.getElementById("refreshInterval").value;
  var filteredRefreshInterval = isNormalInteger(refreshInterval)
    ? refreshInterval
    : 5;
  setTimeout(() => getMcis(), filteredRefreshInterval * 1000);

  if (namespace && namespace != "") {
    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mcis?option=status`;

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

        var zoomLevel = map.getView().getZoom() * 2.0;
        var radius = 4.0;

        cnt = cntInit;
        if (obj.mcis != null) {
          //console.log(obj.mcis);
          for (let item of obj.mcis) {
            //console.log("Index:[" + "]obj.mcis[i].name = " + item.name);
            console.log(item);

            var hideFlag = false;
            for (let hideName of mcisHideList) {
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
                vmGeo.push([
                  item.vm[j].location.longitude * 1 +
                    (returnAdjustmentPoint(j).ax / zoomLevel) * radius,
                  item.vm[j].location.latitude * 1 +
                    (returnAdjustmentPoint(j).ay / zoomLevel) * radius,
                ]);
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

              mcisStatus[cnt] = item.status;

              var newName = item.name;
              if (newName.includes("-nlb")) {
                newName = "NLB";
              }

              if (item.targetAction == "None" || item.targetAction == "") {
                mcisName[cnt] = "[" + newName + "]";
              } else {
                mcisName[cnt] = item.targetAction + "-> " + "[" + newName + "]";
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

  var hostname = hostnameElement.value;
  var port = portElement.value;
  var username = usernameElement.value;
  var password = passwordElement.value;

  refreshInterval = document.getElementById("refreshInterval").value;
  var filteredRefreshInterval = isNormalInteger(refreshInterval)
    ? refreshInterval
    : 5;
  //setTimeout(() => console.log(getConnection()), filteredRefreshInterval*1000);

  var url = `http://${hostname}:${port}/tumblebug/connConfig`;

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
          "[Complete] Number of Registered Cloud Regions: " +
          obj.connectionconfig.length +
          "\n";

        obj.connectionconfig.forEach((config, i) => {
          const providerName = config.ProviderName.toLowerCase();
          const longitude = config.Location.longitude;
          const latitude = config.Location.latitude;
          const briefAddr = config.Location.briefAddr;
          const nativeRegion = config.Location.nativeRegion;

          messageTextArea.value +=
            "[" +
            i +
            "] " +
            config.ProviderName +
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
    });
}
window.getConnection = getConnection;

function isNormalInteger(str) {
  var n = Math.floor(Number(str));
  return n !== Infinity && String(n) === str && n > 0;
}

var createMcisReqTmplt = {
  description: "Made via cb-mapui",
  installMonAgent: "no",
  label: "cb-mapui",
  name: "mcis",
  vm: [],
};

var createMcisReqVmTmplt = {
  commonImage: "ubuntu18.04",
  commonSpec: "",
  description: "mapui",
  label: "DynamicVM",
  rootDiskType: "default",
  rootDiskSize: "default",
  subGroupSize: "",
  name: "",
};

function createMcis() {
  if (recommendedSpecList.length != 0) {
    var hostname = hostnameElement.value;
    var port = portElement.value;
    var username = usernameElement.value;
    var password = passwordElement.value;
    var namespace = namespaceElement.value;

    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mcisDynamic`;

    var randomString = Math.random().toString(36).substr(2, 5);

    var createMcisReq = createMcisReqTmplt;
    createMcisReq.name = "mc-" + `${randomString}`;
    createMcisReq.vm = recommendedSpecList;

    var subGroupReqString = "";
    for (i = 0; i < createMcisReq.vm.length; i++) {
      createMcisReq.vm.name;

      var html =
        "<br><br></b> <b>[" +
        (i + 1).toString() +
        "]</b> <b>" +
        createMcisReq.vm[i].name +
        "</b> (size:  <b>" +
        createMcisReq.vm[i].subGroupSize +
        "</b>)" +
        "<br> - Image: <b>" +
        createMcisReq.vm[i].commonImage +
        "<br></b> - Spec: <b>" +
        createMcisReq.vm[i].commonSpec +
        "<br></b> - DiskType: <b>" +
        createMcisReq.vm[i].rootDiskType +
        "</b> / DiskSize: <b>" +
        createMcisReq.vm[i].rootDiskSize;

      subGroupReqString = subGroupReqString + html;
    }

    var hasUserConfirmed = false;

    Swal.fire({
      title: "Please change the name of MCIS to create if you wish",
      input: "text",
      inputAttributes: {
        autocapitalize: "off",
      },
      inputValue: createMcisReq.name,
      showCancelButton: true,
      confirmButtonText: "Confirm",
    }).then((result) => {
      if (result.value) {
        createMcisReq.name = result.value;

        Swal.fire({
          title: "Are you sure to create MCIS as follows:",
          width: 600,
          html:
            "<font size=3>" +
            "MCIS name: <b>" +
            createMcisReq.name +
            subGroupReqString,
          showCancelButton: true,
          inputPlaceholder: "Deploy CB-Dragonfly monitoring agent",
          input: "checkbox",
          inputValue: 0,
          confirmButtonText: "Confirm",
          inputPlaceholder:
            "<font size=3> Check to deploy CB-Dragonfly monitoring agent",
          scrollbarPadding: false,
        }).then((result) => {
          if (result.isConfirmed) {
            createMcisReq.installMonAgent = "no";
            if (result.value) {
              Swal.fire("Create MCIS with CB-Dragonfly monitoring agent");
              createMcisReq.installMonAgent = "yes";
            }
            var jsonBody = JSON.stringify(createMcisReq, undefined, 4);

            messageTextArea.value = " Creating MCIS ...";
            var spinnerId = addSpinnerTask(
              "Creating MCIS: " + createMcisReq.name
            );

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
                handleAxiosResponse(res);

                updateMcisList();

                clearCircle("none");
                messageTextArea.value = "Created " + createMcisReq.name;
                //infoAlert("Created " + createMcisReq.name);
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
          }
        });
      }
    });
  } else {
    messageTextArea.value =
      " To create a MCIS, VMs should be configured!\n Click the Map to add a config for VM request.";
    errorAlert("Please configure MCIS first\n(Click the Map to add VMs)");
  }
}
window.createMcis = createMcis;

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

  var url = `http://${hostname}:${port}/tumblebug/mcisRecommendVm`;

  var struct01 = {
    filter: {
      policy: [
        {
          condition: [
            {
              operand: `${minVCPU}`,
              operator: ">=",
            },
            {
              operand: `${maxVCPU}`,
              operator: "<=",
            },
          ],
          metric: "cpu",
        },
        {
          condition: [
            {
              operand: `${minRAM}`,
              operator: ">=",
            },
            {
              operand: `${maxRAM}`,
              operator: "<=",
            },
          ],
          metric: "memory",
        },
        {
          condition: [
            {
              operand: `${specName}`,
            }
          ],
          metric: "specname",
        },
      ],
    },
    limit: "10",
    priority: {
      policy: [
        {
          metric: "location",
          parameter: [
            {
              key: "coordinateClose",
              val: [`${latitude}/${longitude}`],
            },
          ],
          weight: "1.0",
        },
      ],
    },
  };

  var struct02 = {
    filter: {
      policy: [
        {
          condition: [
            {
              operand: `${minVCPU}`,
              operator: ">=",
            },
            {
              operand: `${maxVCPU}`,
              operator: "<=",
            },
          ],
          metric: "cpu",
        },
        {
          condition: [
            {
              operand: `${minRAM}`,
              operator: ">=",
            },
            {
              operand: `${maxRAM}`,
              operator: "<=",
            },
          ],
          metric: "memory",
        },
        {
          condition: [
            {
              operand: `${specName}`,
            }
          ],
          metric: "specname",
        },
      ],
    },
    limit: "10",
    priority: {
      policy: [
        {
          metric: "cost",
          weight: "1.0",
        },
      ],
    },
  };

  var struct03 = {
    filter: {
      policy: [
        {
          condition: [
            {
              operand: `${minVCPU}`,
              operator: ">=",
            },
            {
              operand: `${maxVCPU}`,
              operator: "<=",
            },
          ],
          metric: "cpu",
        },
        {
          condition: [
            {
              operand: `${minRAM}`,
              operator: ">=",
            },
            {
              operand: `${maxRAM}`,
              operator: "<=",
            },
          ],
          metric: "memory",
        },
        {
          condition: [
            {
              operand: `${specName}`,
            }
          ],
          metric: "specname",
        },
      ],
    },
    limit: "10",
    priority: {
      policy: [
        {
          metric: "performance",
          weight: "1.0",
        },
      ],
    },
  };

  var jsonBody = JSON.stringify(struct01);
  if (recommendPolicy.value == "price") {
    jsonBody = JSON.stringify(struct02);
  } else if (recommendPolicy.value == "performance") {
    jsonBody = JSON.stringify(struct03);
  }

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
    addRegionMarker(res.data[0].id);
    //document.getElementById("latLonInputPairArea").innerHTML += `${res.data[0].id}<br>`;

    //displayJsonData(res.data, typeInfo);
    // messageJsonOutput.scrollTop = messageJsonOutput.scrollHeight;

    // if (tableDisplayEnabled.checked){
    //   jsonToTable(JSON.stringify(res.data));
    // }

    var createMcisReqVm = $.extend({}, createMcisReqVmTmplt);

    createMcisReqVm.name = "g" + (recommendedSpecList.length + 1).toString();

    createMcisReqVm.commonSpec = res.data[0].id;
    createMcisReqVm.commonImage = osImage.value;
    createMcisReqVm.rootDiskType = res.data[0].rootDiskType;

    var diskSizeInput = diskSize.value;
    if (isNaN(diskSizeInput)) {
      diskSizeInput = "default";
    }
    createMcisReqVm.rootDiskSize = diskSizeInput;
    if (diskSizeInput == "default" && res.data[0].rootDiskSize != "default") {
      createMcisReqVm.rootDiskSize = res.data[0].rootDiskSize;
      // need to validate requested disk size >= default disk size given by vm spec
    }

    Swal.fire({
      title: "Please provide the number of VMs to create (1 ~ 10)",
      width: 600,
      html:
        "<font size=3>" +
        "VM Spec to add: <b>" +
        res.data[0].cspSpecName +
        "<br></b> VM Image: <b>" +
        createMcisReqVm.commonImage +
        "<br><br></b> vCPU: <b>" +
        res.data[0].numvCPU +
        "<br></b> Mem(GiB): <b>" +
        res.data[0].memGiB +
        "<br></b> Cost($/1H): <b>" +
        res.data[0].costPerHour +
        "<br></b> rootDiskType: <b>" +
        res.data[0].rootDiskType +
        "<br></b> rootDiskSize(GB): <b>" +
        createMcisReqVm.rootDiskSize +
        "<br></b> CSP: <b>" +
        res.data[0].providerName +
        "<br></b> Region: <b>" +
        res.data[0].regionName +
        "<br></b> connConfig: <b>" +
        res.data[0].connectionName,
      input: "number",
      inputValue: 1,
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
        createMcisReqVm.subGroupSize = result.value;
        if (
          isNaN(createMcisReqVm.subGroupSize) ||
          createMcisReqVm.subGroupSize <= 0
        ) {
          createMcisReqVm.subGroupSize = 1;
        }
        messageTextArea.value +=
          `${createMcisReqVm.commonSpec}` +
          `\t(${createMcisReqVm.subGroupSize})`;
        recommendedSpecList.push(createMcisReqVm);
      } else {
        messageTextArea.value = messageTextArea.value.replace(/\n.*$/, "");
        latLonInputPairIdx--;
        cspPointsCircle.pop();
        geoCspPointsCircle[0] = new MultiPoint([cspPointsCircle]);
      }
    });
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

  var url = `http://${hostname}:${port}/tumblebug/ns/system-purpose-common-ns/resources/spec/${spec}`;

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
          res2.data.Location.latitude +
          "," +
          res2.data.Location.longitude +
          "]"
      ); // for debug

      // push order [longitute, latitude]
      cspPointsCircle.push([
        res2.data.Location.longitude,
        res2.data.Location.latitude,
      ]);
      geoCspPointsCircle[0] = new MultiPoint([cspPointsCircle]);
    });
  });
}
window.addRegionMarker = addRegionMarker;

function controlMCIS(action) {
  switch (action) {
    case "refine":
    case "suspend":
    case "resume":
    case "reboot":
    case "terminate":
      break;
    default:
      console.log(
        `The actions ${action} is not supported. Supported actions: refine, suspend, resume, reboot, terminate.`
      );
      return;
  }
  //messageTextArea.value = "[MCIS " +action +"]";

  var hostname = hostnameElement.value;
  var port = portElement.value;
  var username = usernameElement.value;
  var password = passwordElement.value;
  var namespace = namespaceElement.value;
  var mcisid = mcisidElement.value;

  var spinnerId = addSpinnerTask(action + ": " + mcisid);
  infoAlert(action + ": " + mcisid);

  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/control/mcis/${mcisid}?action=${action}`;

  console.log("MCIS control:[" + action + "]");

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
            infoAlert(
              JSON.stringify(res.data.message, null, 2).replace(/['",]+/g, "")
            );
            break;
          default:
            console.log(
              `The actions ${action} is not supported. Supported actions: refine, suspend, resume, reboot, terminate.`
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
window.controlMCIS = controlMCIS;

function hideMCIS() {
  var hostname = hostnameElement.value;
  var port = portElement.value;
  var username = usernameElement.value;
  var password = passwordElement.value;
  var namespace = namespaceElement.value;

  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mcis?option=id`;

  var hideListString = "";
  for (i = 0; i < mcisHideList.length; i++) {
    var html = "<br>[" + i + "]" + ": <b>" + mcisHideList[i] + "</b> (hidden)";

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
      mcisList = res.data.output;

      Swal.fire({
        title: "Hide/Show a MCIS from the Map",
        html: "<font size=3>" + hideListString,
        showCancelButton: true,
        confirmButtonText: "Show",
        showDenyButton: true,
        denyButtonText: "Hide",
      }).then((result) => {
        hideListString = "";

        if (result.isConfirmed) {
          if (mcisHideList.length != 0) {
            Swal.fire({
              title: "Show a MCIS from the Map",
              html: "<font size=3>" + hideListString,
              input: "select",
              inputOptions: mcisHideList,
              inputPlaceholder: "Select from dropdown",
              inputAttributes: {
                autocapitalize: "off",
              },
              showCancelButton: true,
              confirmButtonText: "Show",
            }).then((result) => {
              if (result.isConfirmed) {
                mcisHideList = mcisHideList.filter(
                  (a) => a !== mcisHideList[result.value]
                );

                for (i = 0; i < mcisHideList.length; i++) {
                  var html =
                    "<br>[" +
                    i +
                    "]" +
                    ": <b>" +
                    mcisHideList[i] +
                    "</b> (hidden)";
                  hideListString = hideListString + html;
                }
                infoAlert(
                  "Show: " +
                    mcisHideList[result.value] +
                    "<br>" +
                    hideListString
                );
              }
            });
          } else {
            infoAlert("There is no hidden MCIS yet");
          }
        } else if (result.isDenied) {
          if (mcisList.length != 0) {
            Swal.fire({
              title: "Hide a MCIS from the Map",
              html: "<font size=3>" + hideListString,
              input: "select",
              inputOptions: mcisList.filter(
                (val) => !mcisHideList.includes(val)
              ),
              inputPlaceholder: "Select from dropdown",
              inputAttributes: {
                autocapitalize: "off",
              },
              showCancelButton: true,
              confirmButtonText: "Hide",
            }).then((result) => {
              if (result.isConfirmed) {
                mcisHideList.push(mcisList[result.value]);
                // remove duplicated items
                mcisHideList = [...new Set(mcisHideList)];

                for (i = 0; i < mcisHideList.length; i++) {
                  var html =
                    "<br>[" +
                    i +
                    "]" +
                    ": <b>" +
                    mcisHideList[i] +
                    "</b> (hidden)";
                  hideListString = hideListString + html;
                }
                infoAlert(
                  "Hide: " + mcisList[result.value] + "<br>" + hideListString
                );
              }
            });
          } else {
            infoAlert("There is no MCIS yet");
          }
        }
      });
    }
  });
}
window.hideMCIS = hideMCIS;

function statusMCIS() {
  messageTextArea.value = "[Get MCIS status]";

  var hostname = hostnameElement.value;
  var port = portElement.value;
  var username = usernameElement.value;
  var password = passwordElement.value;
  var namespace = namespaceElement.value;
  var mcisid = mcisidElement.value;

  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mcis/${mcisid}?option=status`;

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
      console.log("[Status MCIS]");
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
window.statusMCIS = statusMCIS;

function deleteMCIS() {
  messageTextArea.value = "Deleting MCIS";

  var hostname = hostnameElement.value;
  var port = portElement.value;
  var username = usernameElement.value;
  var password = passwordElement.value;
  var namespace = namespaceElement.value;
  var mcisid = mcisidElement.value;

  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mcis/${mcisid}?option=terminate`;

  var spinnerId = addSpinnerTask("Deleting MCIS: " + mcisid);
  infoAlert("Delete: " + mcisid + " (option=terminate)");

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
      updateMcisList();
    })
    .catch(function (error) {
      console.log(error);
      if (error.response && error.response.data) {
        displayJsonData(error.response, typeError);
      }
    })
    .finally(function () {
      removeSpinnerTask(spinnerId);
    });
}
window.deleteMCIS = deleteMCIS;

function releaseResources() {
  var spinnerId = addSpinnerTask("Removing associated default resources");
  infoAlert("Removing all associated default resources");

  var hostname = hostnameElement.value;
  var port = portElement.value;
  var username = usernameElement.value;
  var password = passwordElement.value;
  var namespace = namespaceElement.value;

  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/defaultResources`;

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

  var url = `http://${hostname}:${port}/tumblebug/registerCspResourcesAll?mcisFlag=n`;

  var commandReqTmp = {
    mcisName: "csp",
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
          // mcisList = res.data.output;
          for (let item of res.data.output) {
            var option = document.createElement("option");
            option.value = item;
            option.text = item;
            document.getElementById("namespace").appendChild(option);
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
        updateMcisList();
      });
  }
}

document.getElementById("namespace").onmouseover = function () {
  updateNsList();
};
document.getElementById("namespace").onchange = function () {
  updateMcisList();
};

var mcisList = [];
var mcisHideList = [];

function updateMcisList() {
  // Clear options in 'select'
  var selectElement = document.getElementById("mcisid");
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
    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mcis?option=id`;

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
          // mcisList = res.data.output;
          for (let item of res.data.output) {
            var option = document.createElement("option");
            option.value = item;
            option.text = item;
            selectElement.appendChild(option);
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
        updateResourceList(typeStringVNet);
        updateResourceList(typeStringSG);
        updateResourceList(typeStringSshKey);
        updateResourceList(typeStringSpec);
        updateResourceList(typeStringImage);
      });
  }
}
window.updateMcisList = updateMcisList;

document.getElementById("mcisid").onmouseover = function () {
  updateMcisList();
};
document.getElementById("mcisid").onchange = function () {
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
  var mcisid = mcisidElement.value;
  var subgroupid = document.getElementById("subgroupid").value;

  if (subgroupid && subgroupid != "") {
    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mcis/${mcisid}/subgroup/${subgroupid}`;

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
            var option = document.createElement("option");
            option.value = item;
            option.text = item;
            selectElement.appendChild(option);
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
        updateIpList();
      });
  }
}
window.updateVmList = updateVmList;

document.getElementById("vmid").onmouseover = function () {
  updateVmList();
};

function updateIpList() {
  var pubip = document.getElementById("pubip");
  var priip = document.getElementById("priip");

  var hostname = hostnameElement.value;
  var port = portElement.value;
  var username = usernameElement.value;
  var password = passwordElement.value;
  var namespace = namespaceElement.value;
  var mcisid = mcisidElement.value;
  var groupid = document.getElementById("subgroupid").value;
  var vmid = document.getElementById("vmid").value;

  if (vmid && vmid != "") {
    pubip.options.length = 0;
    priip.options.length = 0;
    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mcis/${mcisid}?option=accessinfo`;

    axios({
      method: "get",
      url: url,
      auth: {
        username: `${username}`,
        password: `${password}`,
      },
    }).then((res) => {
      for (let subGroupAccessInfo of res.data.McisSubGroupAccessInfo) {
        if (subGroupAccessInfo.SubGroupId == groupid) {
          for (let vmAccessInfo of subGroupAccessInfo.McisVmAccessInfo) {
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

document.getElementById("vmid").onmouseover = function () {
  updateVmList();
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
  var mcisid = mcisidElement.value;

  if (namespace && namespace != "" && mcisid && mcisid != "") {
    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mcis/${mcisid}/subgroup`;

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
            var option = document.createElement("option");
            option.value = item;
            option.text = item;
            document.getElementById("subgroupid").appendChild(option);
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
          var option = document.createElement("option");
          option.value = item;
          option.text = item;
          document.getElementById(resourceType).appendChild(option);
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
document.getElementById(typeStringImage).onmouseover = function () {
  updateResourceList(typeStringImage);
};
document.getElementById(typeStringSpec).onmouseover = function () {
  updateResourceList(typeStringSpec);
};

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

  var url = `http://${hostname}:${port}/tumblebug/connConfig`;

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
        option.value = item.ConfigName;
        option.text = item.ConfigName;
        document.getElementById(typeStringConnection).appendChild(option);
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

document.getElementById(typeStringConnection).onmouseover = function () {
  updateConnectionList();
};

function AddMcNLB() {
  var mcisid = document.getElementById("mcisid").value;
  // var nlbport = document.getElementById("nlbport").value;

  if (!mcisid) {
    errorAlert("You need to specify the ID of MCIS");
    return;
  }

  var hostname = hostnameElement.value;
  var port = portElement.value;
  var username = usernameElement.value;
  var password = passwordElement.value;
  var namespace = namespaceElement.value;
  var mcisid = mcisidElement.value;

  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mcis/${mcisid}/mcSwNlb`;

  Swal.fire({
    title: "Configuration for a new NLB",
    width: 600,
    html:
      "<font size=3>" +
      "Target MCIS: <b>" +
      mcisid +
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
      infoAlert("Creating MC-NLB(special MCIS) to : " + mcisid);
      messageTextArea.value = " Creating Multi-Cloud NLB (special MCIS)";
      var spinnerId = addSpinnerTask(
        "Creating MC-NLB(special MCIS) to : " + mcisid
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
  var mcisid = mcisidElement.value;
  var subgroupid = document.getElementById("subgroupid").value;
  // var nlbport = document.getElementById("nlbport").value;

  if (!mcisid) {
    messageTextArea.value =
      " When calling AddNLB(), you must specify the mcisid.";
  }

  if (!subgroupid) {
    messageTextArea.value =
      " When calling AddNLB(), you must specify the subgroupid.";
  }

  messageTextArea.value = " Creating NLB " + subgroupid;

  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mcis/${mcisid}/nlb`;

  Swal.fire({
    title: "Configuration for a new NLB",
    width: 600,
    html:
      "<font size=3>" +
      "Target MCIS: <b>" +
      mcisid +
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
  var mcisid = mcisidElement.value;
  var subgroupid = document.getElementById("subgroupid").value;

  if (!mcisid) {
    messageTextArea.value =
      " When calling DelNLB(), you must specify the mcisid.";
  }

  if (!subgroupid) {
    messageTextArea.value =
      " When calling DelNLB(), you must specify the subgroupid.";
  }

  messageTextArea.value = " Deleting NLB " + subgroupid;

  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mcis/${mcisid}/nlb/${subgroupid}`;

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

var defaultRemoteCommand =
  "client_ip=$(echo $SSH_CLIENT | awk '{print $1}'); my_ip=$(hostname -I)";
var defaultRemoteCommand01 =
  "echo SSH client (bastion) IP is: $client_ip";
var defaultRemoteCommand02 =
  "echo IPs of my network: $my_ip";

// function for startApp by startApp button item
function startApp() {
  var mcisid = mcisidElement.value;
  if (mcisid) {
    messageTextArea.value = " Starting " + selectApp.value;

    var hostname = hostnameElement.value;
    var port = portElement.value;
    var username = usernameElement.value;
    var password = passwordElement.value;
    var namespace = namespaceElement.value;

    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mcis/${mcisid}?option=accessinfo`;

    axios({
      method: "get",
      url: url,
      auth: {
        username: `${username}`,
        password: `${password}`,
      },
    }).then((res2) => {
      console.log(res2); // for debug

      var publicIPs = "";
      var privateIPs = "";

      for (let l1 of res2.data.McisSubGroupAccessInfo) {
        for (let l2 of l1.McisVmAccessInfo) {
          publicIPs = publicIPs + " " + l2.publicIP;
          privateIPs = privateIPs + " " + l2.privateIP;
        }
      }

      if (selectApp.value == "Xonotic") {
        defaultRemoteCommand =
          "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/xonotic/startServer.sh";
        defaultRemoteCommand01 = 
          "chmod +x ~/startServer.sh";
        defaultRemoteCommand02 =
          "sudo ~/startServer.sh " + "Xonotic-by-Cloud-Barista-" + mcisid + " 26000" + " 8";
      } else if (selectApp.value == "ELK") {
        defaultRemoteCommand =
          "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/elastic-stack/startELK.sh";
        defaultRemoteCommand01 = 
          "chmod +x ~/startServer.sh";
        defaultRemoteCommand02 =
          "sudo ~/startServer.sh ";
      } else if (selectApp.value == "LLM") {
        defaultRemoteCommand =
          "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/llm/llmServer.py";
        defaultRemoteCommand01 =
          "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/llm/startServer.sh; chmod +x ~/startServer.sh";
        defaultRemoteCommand02 =
          "~/startServer.sh " + "--ip" + publicIPs + " --port 5000" + " --token 1024" + " --model tiiuae/falcon-7b-instruct";
      } else if (selectApp.value == "Westward") {
        defaultRemoteCommand =
          "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/setgame.sh";
        defaultRemoteCommand01 = 
          "chmod +x ~/setgame.sh; sudo ~/setgame.sh";
      } else if (selectApp.value == "WeaveScope") {
        defaultRemoteCommand =
        "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/weavescope/startServer.sh";
        defaultRemoteCommand01 = 
          "chmod +x ~/startServer.sh";
        defaultRemoteCommand02 =
          "sudo ~/startServer.sh " + publicIPs + " " + privateIPs;
      } else if (selectApp.value == "Nginx") {
        defaultRemoteCommand =
          "wget -O ~/setweb.sh https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/setweb.sh; chmod +x ~/setweb.sh; sudo ~/setweb.sh";
      } else if (selectApp.value == "Jitsi") {
        defaultRemoteCommand =
        "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/jitsi/startServer.sh";
        defaultRemoteCommand01 = 
          "chmod +x ~/startServer.sh";
        defaultRemoteCommand02 =
          "sudo ~/startServer.sh " + publicIPs + " " + "DNS EMAIL";
      } else if (selectApp.value == "Stress") {
        defaultRemoteCommand =
          "sudo apt install -y stress > /dev/null; stress -c 16 -t 60";
      } else {
        defaultRemoteCommand = "ls -al";
      }

      executeRemoteCmd();
    });
  } else {
    messageTextArea.value = " MCIS ID is not assigned";
  }
}
window.startApp = startApp;

// function for stopApp by stopApp button item
function stopApp() {
  var mcisid = mcisidElement.value;
  if (mcisid) {
    messageTextArea.value = " Stopping " + selectApp.value;

    var hostname = hostnameElement.value;
    var port = portElement.value;
    var username = usernameElement.value;
    var password = passwordElement.value;
    var namespace = namespaceElement.value;

    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/cmd/mcis/${mcisid}`;
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
    messageTextArea.value = " MCIS ID is not assigned";
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
  var mcisid = mcisidElement.value;

  if (mcisid) {
    messageTextArea.value = " Getting status " + selectApp.value;

    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/cmd/mcis/${mcisid}`;
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
    messageTextArea.value = " MCIS ID is not assigned";
  }
}
window.statusApp = statusApp;

// function for executeRemoteCmd by remoteCmd button item
function executeRemoteCmd() {
  var hostname = hostnameElement.value;
  var port = portElement.value;
  var username = usernameElement.value;
  var password = passwordElement.value;
  var namespace = namespaceElement.value;
  var mcisid = mcisidElement.value;
  var subgroupid = document.getElementById("subgroupid").value;
  var vmid = document.getElementById("vmid").value;

  let cmdCount = 3; // Initial number of textboxes

  if (mcisid) {
    var spinnerId = ""

    messageTextArea.value =
      "[Forward remote ssh command to MCIS:" + mcisid + "]\n";

    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/cmd/mcis/${mcisid}`;
    var cmd = [];

    Swal.fire({
      title: "<font size=5><b>Put multiple commands to forward</b></font>",
      width: 900,
      html: `
      <div id="dynamicContainer" style="text-align: left;">
        <p><font size=4><b>[Commands]</b></font></p>
        <div id="cmdContainer" style="margin-bottom: 20px;">
          <div id="cmdDiv1" class="cmdRow">
            Command 1: <input type="text" id="cmd1" style="width: 75%" value="${defaultRemoteCommand}">
            <button onclick="document.getElementById('cmd1').value = ''">Clear</button>
          </div>
          <div id="cmdDiv2" class="cmdRow">
            Command 2: <input type="text" id="cmd2" style="width: 75%" value="${defaultRemoteCommand01}">
            <button onclick="document.getElementById('cmd2').value = ''">Clear</button>
          </div>
          <div id="cmdDiv3" class="cmdRow">
            Command 3: <input type="text" id="cmd3" style="width: 75%" value="${defaultRemoteCommand02}">
            <button onclick="document.getElementById('cmd3').value = ''">Clear</button>
          </div>
          <button id="addCmd" onclick="addCmd()" style="margin-left: 1px;"> + </button>
        </div>
        
        <p><font size=4><b>[Select target]</b></font></p>
        <div style="display: flex; align-items: center;">
          <div style="margin-right: 10px;">
            <input type="radio" id="mcisOption" name="selectOption" value="MCIS" checked>
            <label for="mcisOption">MCIS: <span style="color:blue;">${mcisid}</span></label>
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
      },
      preConfirm: () => {
        // Collect commands from textboxes
        const commands = [];
        for (let i = 1; i <= cmdCount; i++) {
          const cmd = document.getElementById("cmd" + i).value;
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
        if (radioValue === "MCIS") {
          var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/cmd/mcis/${mcisid}`;
          console.log("Performing tasks for MCIS");
        } else if (radioValue === "SubGroup") {
          var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/cmd/mcis/${mcisid}?subGroupId=${subgroupid}`;
          console.log("Performing tasks for SubGroup");
        } else if (radioValue === "VM") {
          var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/cmd/mcis/${mcisid}?vmId=${vmid}`;
          console.log("Performing tasks for VM");
        }

        cmd = result.value;
        messageTextArea.value += cmd.join(", ");

        var commandReqTmp = {
          command: cmd,
        };

        var jsonBody = JSON.stringify(commandReqTmp, undefined, 4);

        spinnerId = addSpinnerTask("Remote command to " + mcisid);

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
          displayJsonData(res.data, typeInfo);
          let formattedOutput = "[Complete: remote ssh command to MCIS]\n\n";

          res.data.results.forEach((result) => {
            formattedOutput += `### MCIS ID: ${result.mcisId} | IP: ${result.vmId} | IP: ${result.vmIp} ###\n`;

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
    messageTextArea.value = " MCIS ID is not assigned";
  }
}
window.executeRemoteCmd = executeRemoteCmd;

// function for getAccessInfo of MCIS
function getAccessInfo() {
  var hostname = hostnameElement.value;
  var port = portElement.value;
  var username = usernameElement.value;
  var password = passwordElement.value;
  var namespace = namespaceElement.value;
  var mcisid = mcisidElement.value;

  if (mcisid) {
    messageTextArea.value =
      "[Retrieve access information for MCIS:" + mcisid + "]\n";

    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mcis/${mcisid}?option=accessinfo`;

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
    messageTextArea.value = " MCIS ID is not assigned";
  }
}
window.getAccessInfo = getAccessInfo;

// SSH Key save function
const saveBtn = document.querySelector(".save-file");
saveBtn.addEventListener("click", function () {
  messageTextArea.value = " [Retrieve MCIS Access Information ...]\n";

  var hostname = hostnameElement.value;
  var port = portElement.value;
  var username = usernameElement.value;
  var password = passwordElement.value;
  var namespace = namespaceElement.value;
  var mcisid = mcisidElement.value;
  var groupid = document.getElementById("subgroupid").value;
  var vmid = document.getElementById("vmid").value;

  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mcis/${mcisid}?option=accessinfo&accessInfoOption=showSshKey`;

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

    for (let subGroupAccessInfo of res.data.McisSubGroupAccessInfo) {
      if (subGroupAccessInfo.SubGroupId == groupid) {
        for (let vmAccessInfo of subGroupAccessInfo.McisVmAccessInfo) {
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
    tempLink.setAttribute("download", `${namespace}-${mcisid}-${vmid}.pem`);
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
    // Add X-Request-Id to the global array if it's not already present
    if (!xRequestIds.includes(requestId)) {
      xRequestIds.push(requestId);
      addRequestIdToSelect(requestId);
    }
  }
}

// Function to add X-Request-Id to the select element
function addRequestIdToSelect(requestId) {
  const select = document.getElementById("xRequestIdSelect");
  const option = document.createElement("option");
  option.value = requestId;
  option.text = requestId;
  select.appendChild(option);
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
  setTimeout(getConnection, 3000);

  updateNsList();

  getMcis();
};

// Draw

function drawObjects(event) {
  //event.frameState = event.frameState / 10;
  //console.log("event.frameState");
  //console.log(event.frameState);

  var vectorContext = getVectorContext(event);
  var frameState = event.frameState;
  var theta = (2 * Math.PI * frameState.time) / omegaTheta;

  // Draw CSP location first
  Object.keys(cspIconStyles).forEach((csp) => {
    if (Array.isArray(geoCspPoints[csp]) && geoCspPoints[csp].length) {
      // 해당 CSP에 대한 지오메트리 배열이 존재하고 비어있지 않은 경우
      vectorContext.setStyle(cspIconStyles[csp]); // CSP에 맞는 스타일 설정
      vectorContext.drawGeometry(geoCspPoints[csp][0]); // 첫 번째 지오메트리 그리기
    }
  });

  if (cspPointsCircle.length) {
    //console.log("cspPointsCircle.length:" +cspPointsCircle.length + "cspPointsCircle["+cspPointsCircle+"]")
    //geoCspPointsCircle[0] = new MultiPoint([cspPointsCircle]);
    vectorContext.setStyle(iconStyleCircle);
    vectorContext.drawGeometry(geoCspPointsCircle[0]);
  }

  //console.log( geometries );
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

    if (mcisName[i].includes("NLB")) {
      vectorContext.setStyle(iconStyleNlb);
    } else {
      vectorContext.setStyle(iconStyleVm);
    }
    vectorContext.drawGeometry(geometriesPoints[i]);

    // MCIS status style
    var polyStatusTextStyle = new Style({
      // MCIS status text style
      text: new Text({
        text: mcisStatus[i],
        font: "bold 10px sans-serif",
        scale: changeSizeStatus(mcisName[i] + mcisStatus[i]),
        offsetY: 44 * changeSizeStatus(mcisName[i] + mcisStatus[i]),
        stroke: new Stroke({
          color: "white",
          width: 1,
        }),
        fill: new Fill({
          color: changeColorStatus(mcisStatus[i]),
        }),
      }),
    });
    vectorContext.setStyle(polyStatusTextStyle);
    vectorContext.drawGeometry(geometries[i]);
  }

  for (i = geometries.length - 1; i >= 0; --i) {
    // MCIS text style
    var polyNameTextStyle = new Style({
      text: new Text({
        text: mcisName[i],
        font: "bold 10px sans-serif",
        scale: changeSizeByName(mcisName[i] + mcisStatus[i]) + 0.8,
        offsetY: 32 * changeSizeByName(mcisName[i] + mcisStatus[i]),
        stroke: new Stroke({
          color: [255, 255, 255, 1], //white
          width: 1,
        }),
        fill: new Fill({
          color: [0, 0, 0, 1], //black //changeColorStatus(mcisStatus[i])
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
    arr02[i] = json[i].numvCPU;
    arr03[i] = json[i].memGiB;
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
  th2.appendChild(document.createTextNode("   numvCPU"));
  let th3 = document.createElement("th");
  th3.appendChild(document.createTextNode("   memGiB"));
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
