import 'ol/ol.css';
import Map from 'ol/Map';
import View from 'ol/View';
import {MultiPoint, Point} from 'ol/geom';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import {Circle as CircleStyle, Fill, Stroke, Style, Text} from 'ol/style';
import {getVectorContext} from 'ol/render';
import {LineString, Polygon} from 'ol/geom';
import {Vector as VectorLayer} from 'ol/layer';
import Feature from 'ol/Feature';
import {TileJSON, Vector as VectorSource} from 'ol/source';
import {Icon} from 'ol/style';
import {useGeographic} from 'ol/proj';
/*

*/

//var express = require('express');
//var app = express();
//var publicDir = require('path').join(__dirname,'/public');
//app.use(express.static(publicDir));

useGeographic();
var i,j;
var cnti, cntj;

var namespace = 'ddb11cdf-54bd-4255-b4f3-7d64a8991cd3';
var geoServiceKey = 'your key';

//var n = 1000;
var geometries = new Array();
var geometriesPoints = new Array();
var mcisName = new Array();
var mcisGeo = new Array();

var ipMap = [];
var geoMap = [];

//for (i = 0; i < n; ++i) {
//  mcisGeo[i] = new Array();
//}

var mcisGeo2 = [];
//mcisGeo2.push([-180, -90]);


for (var i = 0; i < 1; ++i) {
  var lon = 360 * Math.random() - 180;
  var lat = 180 * Math.random() - 90;
  geometries[i] = new Polygon([[[lon, lat], [lon+5, lat+5], [lon-5, lat-5], [lon, lat]]]);
  geometriesPoints[i] = new MultiPoint([[[lon, lat], [lon+5, lat+5], [lon-5, lat-5], [lon, lat]]]);
  mcisName[i] = "TestPolyGon"
  mcisGeo[i] = new Polygon([[[lon, lat], [lon+5, lat+5], [lon-5, lat-5], [lon, lat]]]);
}

var imgPath = 'https://openlayers.org/en/v3.20.1/examples/data/icon.png'
//var imgPath = './img/icon2.png'



var ipList = [
  "1.0.4.0", 
  "1.0.16.0",
  "1.11.0.0",
  //"52.9.154.255",
  //"72.14.192.0",
  //"74.125.0.0",
  //"81.169.181.179",
  "216.239.32.0",
  "27.116.56.0",
  "79.133.0.0",
  "41.74.0.0",
  "1.6.0.0",
  "41.73.96.0",
  "1.37.0.0",
  "2.23.224.0"
  ];

  var ipTmpList = [
    "54.153.187.176", 
    "3.106.158.182",
    "3.24.244.117",
    "54.66.205.122",
    "13.238.135.53"
    ];

  var geoTmpList = [
    [123.775136, -15.274398],
    [133.775136, -24.274398],
    [153.775136, -25.274398],
    [33.775136, -45.274398],
    [-95.712891, 37.09024]
  ];

  var alpha = 0.5;
  var cororList = [
    [	0, 176, 244      , alpha],
    [	200, 10, 10      , alpha],
    [	0, 162, 194      , alpha],
    [	38, 63, 143, alpha],
    [	58, 58, 58      , alpha],
    [	81, 45, 23      , alpha],
    [	2, 110, 76      , alpha],
    [	225, 136, 65, alpha],
    [		106, 34, 134      , alpha],
    [	255, 162, 191      , alpha],
    [	239, 45, 53      , alpha],
    [	255, 255, 255      , alpha],
    [		255, 255, 0      , alpha],
    [	154, 135, 199      , alpha]
    ];

    alpha = 1;
    var cororLineList = [
      [	0, 176, 244      , alpha],
      [	200, 10, 10      , alpha],
      [	0, 162, 194      , alpha],
      [	38, 63, 143, alpha],
      [	58, 58, 58      , alpha],
      [	81, 45, 23      , alpha],
      [	2, 110, 76      , alpha],
      [	225, 136, 65, alpha],
      [		106, 34, 134      , alpha],
      [	255, 162, 191      , alpha],
      [	239, 45, 53      , alpha],
      [	255, 255, 255      , alpha],
      [		255, 255, 0      , alpha],
      [	154, 135, 199      , alpha]
      ];


var tileLayer = new TileLayer({
  source: new OSM()
});

var polygonFeature = new Feature(
  new Polygon([[[10, -3], [-5, 2], [-1, 1]]])
    );

var pointFeature = new Feature({
  geometry: new Point([10, -3]),
  name: '보이지 않는 꿈의 섬'

}
    );

    function createStyle(src) {
      return new Style({
        image: new Icon( ({
          anchor: [0.5, 0.5],
          crossOrigin: 'anonymous',
          src: src,
          imgSize: [50,50]
        }))
      });
    }    

    var pnt = new Point([-80, -80]);

    import Vector  from 'ol/source/Vector.js';
    var vectorSource = new Vector({projection: 'EPSG:4326'}); //새로운 벡터 생성
var iconFeature = new Feature(pnt);

iconFeature.set('style', createStyle('img/icon3.png'));
iconFeature.set('index', '001');

vectorSource.addFeature(iconFeature);
var iconLayer = new VectorLayer({
  style: function(feature) {
    return feature.get('style');
  },
  source: vectorSource
})

var iconStyle01 = new Style({
  image: new Icon( ({
    //anchor: [0.5, 0.5],
    crossOrigin: 'anonymous',
    src: 'img/icon2.png',
    opacity: 0.60,
    imgSize: [50,50]
  }))
});

var iconStyle02 = new Style({
  image: new Icon( ({
    anchor: [0.5, 46],
    anchorXUnits: 'fraction',
    anchorYUnits: 'pixels',
    opacity: 0.95,
    src: 'img/icon2.png'
  }))
});

var iconStyle03 = new Style({
  image: new Icon( ({
    //anchor: [0.5, 0.5],
    crossOrigin: 'anonymous',
    src: 'img/icon3.png',
    opacity: 0.90,
    imgSize: [50,50]
  }))
});


var vectorLayer = new VectorLayer({
  source: new VectorSource({
    features: [pointFeature]
  }),
  style: new Style({
    image: new Icon({
      anchor: [0.5, 46],
      anchorXUnits: 'fraction',
      anchorYUnits: 'pixels',
      opacity: 0.95,
      src: 'img/icon.png'
    }),
    stroke: new Stroke({
      width: 4,
      color: [255, 0, 0, 1]
    }),
    fill: new Fill({
      color: [0, 0, 255, 0.6]
    })
  })
});

var map = new Map({
  layers: [tileLayer],
  target: 'map',
  view: new View({
    center: [0, 0],
    zoom: 2
  }),
  //projection: 'EPSG:4326'
});

var imageStyle = new Style({
  image: new CircleStyle({
    radius: 2,
    fill: new Fill({color: 'red'}),
    //stroke: new Stroke({color: 'red', width: 1})
  })
});


var lineStyle = new Style({
  stroke: new Stroke({
    width: 5,
    color: [255, 0, 0, 1]
  })
});

var headInnerImageStyle = new Style({
  image: new CircleStyle({
    radius: 1,
    fill: new Fill({color: 'blue'})
  })
});

var headOuterImageStyle = new Style({
  image: new CircleStyle({
    radius: 1,
    fill: new Fill({color: 'black'})
  })
});

var n = 400;
var omegaTheta = 300000; // Rotation period in ms
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

var cnt =1;
function makeTria(ip1, ip2, ip3){
  changePoints(ip1, ip2);
  changePoints(ip2, ip3);
  changePoints(ip3, ip1);

  geometries[cnt] = new Polygon([[ip1, ip2, ip3, ip1]]);
  //cnt++;
}


function makePoly1(p1,p2){
  coordinates.push(p1); 
  geometries[cnt] = new Polygon([[p1, p2]]);
  geometriesPoints[cnt] = new MultiPoint([[p1]]);
  
  mcisGeo[cnt] = new Polygon([[p1, p2]]);
  //cnt++;
}
function makePoly2(p1,p2,p3){
  coordinates.push(p1); 
  coordinates.push(p2);
  geometries[cnt] = new Polygon([[p1, p2, p3]]);
  geometriesPoints[cnt] = new MultiPoint([[p1, p2]]);
  console.log("cnt = " +cnt);

  mcisGeo[cnt] = new Polygon([[p1, p2, p3]]);
  //cnt++;
}
function makePoly3(p1,p2,p3,p4){
  coordinates.push(p1); 
  coordinates.push(p2);
  coordinates.push(p3);
  geometries[cnt] = new Polygon([[p1, p2, p3, p4]]);
  geometriesPoints[cnt] = new MultiPoint([[p1, p2, p3, p4]]);
  //console.log("makePoly3()geometriesPoints[]"+ cnt +" value: " + [p1, p2, p3])
  //cnt++;

  mcisGeo[cnt] = new Polygon([[p1, p2, p3, p4]]);
}
function makePoly4(p1,p2,p3,p4,p5){
  coordinates.push(p1); 
  coordinates.push(p2);
  coordinates.push(p3);
  coordinates.push(p4);
  geometries[cnt] = new Polygon([[p1, p2, p3, p4, p5]]);
  geometriesPoints[cnt] = new MultiPoint([[p1, p2, p3, p4]]);

  mcisGeo[cnt] = new Polygon([[p1, p2, p3, p4, p5]]);
  //cnt++;
}

function makePoly5(p1,p2,p3,p4,p5,p6){
  coordinates.push(p1); 
  coordinates.push(p2);
  coordinates.push(p3);
  coordinates.push(p4);
  coordinates.push(p5);
  geometries[cnt] = new Polygon([[p1, p2, p3, p4, p5, p6]]);
  geometriesPoints[cnt] = new MultiPoint([[p1, p2, p3, p4, p5]]);


  mcisGeo[cnt] = new Polygon([[p1, p2, p3, p4, p5, p6]]);
  //cnt++;
}

function makePoly6(p1,p2,p3,p4,p5,p6,p7){
  coordinates.push(p1); 
  coordinates.push(p2);
  coordinates.push(p3);
  coordinates.push(p4);
  coordinates.push(p5);
  coordinates.push(p6);
  geometries[cnt] = new Polygon([[p1, p2, p3, p4, p5, p6, p7]]);
  geometriesPoints[cnt] = new MultiPoint([[p1, p2, p3, p4, p5, p6]]);


  mcisGeo[cnt] = new Polygon([[p1, p2, p3, p4, p5, p6, p7]]);
  //cnt++;
}

function makePoly7(p1,p2,p3,p4,p5,p6,p7,p8){
  coordinates.push(p1); 
  coordinates.push(p2);
  coordinates.push(p3);
  coordinates.push(p4);
  coordinates.push(p5);
  coordinates.push(p6);
  coordinates.push(p7);
  geometries[cnt] = new Polygon([[p1, p2, p3, p4, p5, p6, p7, p8]]);
  geometriesPoints[cnt] = new MultiPoint([[p1, p2, p3, p4, p5, p6, p7]]);


  mcisGeo[cnt] = new Polygon([[p1, p2, p3, p4, p5, p6, p7, p8]]);
  //cnt++;
}


function makePoly8(p1,p2,p3,p4,p5,p6,p7,p8,p9){
  coordinates.push(p1); 
  coordinates.push(p2);
  coordinates.push(p3);
  coordinates.push(p4);
  coordinates.push(p5);
  coordinates.push(p6);
  coordinates.push(p7);
  coordinates.push(p8);
  geometries[cnt] = new Polygon([[p1, p2, p3, p4, p5, p6, p7, p8, p9]]);
  geometriesPoints[cnt] = new MultiPoint([[p1, p2, p3, p4, p5, p6, p7, p8]]);


  mcisGeo[cnt] = new Polygon([[p1, p2, p3, p4, p5, p6, p7, p8, p9]]);
  //cnt++;
}



function changePoints(ipFrom, ipTo){
  var lon = 360 * Math.random() - 180;
    var lat = 180 * Math.random() - 90;

    var lon1 = 360 * Math.random() - 180;
    var lat1 = 180 * Math.random() - 90;


    //coordinates.push([x, y]);
    //coordinates.push([lon, lat]);  
    console.log(ipFrom);
    console.log(ipTo);

    coordinates.push(ipFrom); 
    coordinates.push(ipTo);   
    //coordinates.push([lon1, lat1]);
/*
    coordinatesFromX.push([lon]);
    coordinatesFromY.push([lat]);
    coordinatesToX.push([lon]);
    coordinatesToY.push([lat]);
*/

    var i,j;

    var xFrom = ipFrom[0]
      var yFrom = ipFrom[1]
      var xTo = ipTo[0]
      var yTo = ipTo[1]
      for (j=1; j < n; ++j){
  
        var goX = xFrom + j*(xTo - xFrom)/n
        var goY = (yTo - yFrom)/(xTo - xFrom)*(goX-xFrom)+yFrom
        //coordinates.push([goX, goY]);

        //console.log(goX)
        //console.log(goY)
        //vectorContext.setStyle(headOuterImageStyle);
        //vectorContext.drawGeometry(new Point([goX*100,goY*100]));
      }
      /*
    for (i = 0; i < coordinatesFromX.length; ++i) {
      //console.log(coordinatesFrom[i])
      //console.log(coordinatesTo[i])
      //vectorContext.drawGeometry(new LineString([coordinatesFrom[i], coordinatesTo[i] ]));
      var xFrom = coordinatesFromX[i]
      var yFrom = coordinatesFromY[i]
      var xTo = coordinatesToX[i]
      var yTo = coordinatesToY[i]
      for (j=1; j < n; ++j){
  
        var goX = xFrom + (xTo - xFrom)/j
        var goY = (yTo - yFrom)/(xTo - xFrom)*(goX-xFrom)+yFrom
        //console.log(goX)
        //console.log(goY)
        vectorContext.setStyle(headOuterImageStyle);
        vectorContext.drawGeometry(new Point([goX*100,goY*100]));
      }
    }
    */


}



tileLayer.on('postrender', function(event) {

  //event.frameState = event.frameState / 10;
  //console.log("event.frameState");
  //console.log(event.frameState);




  var vectorContext = getVectorContext(event);
  var frameState = event.frameState;
  var theta = 2 * Math.PI * frameState.time / omegaTheta;
  
  
  /*
  coordinates = [];
  //var x = 0;
  //var y = 0;

  for (i = 0; i < n; ++i) {
    var t = theta + 2 * Math.PI * i / n;
    var x = (R + r) * Math.cos(t) + p * Math.cos((R + r) * t / r);
    var y = (R + r) * Math.sin(t) + p * Math.sin((R + r) * t / r);
    // x = n * i *100 + 2e6;
    // y = n * i + 1e6;

    var lon = 360 * Math.random() - 180;
    var lat = 180 * Math.random() - 90;

    //coordinates.push([x, y]);
    coordinates.push([lon, lat]);
    //console.log(x);
    //console.log(y);
    
  }
  */
 //changePoints()

  
  //vectorContext.drawGeometry(new MultiPoint(coordinates));

  
  //vectorContext.drawGeometry(new MultiPoint(coordinates));
  //vectorContext.drawGeometry(new MultiPoint(coordinates));

  /*
  for( i=0; i<coordinates.length; ++i){
    var polys = new Polygon([[ coordinates[Math.floor(Math.random()*(coordinates.length-1))], coordinates[Math.floor(Math.random()*(coordinates.length-1))], coordinates[Math.floor(Math.random()*(coordinates.length-1))], coordinates[Math.floor(Math.random()*(coordinates.length-1))] ]]);
    vectorContext.setStyle(polyStyle);
    vectorContext.drawGeometry(polys);
  }
*/
  //console.log( geometries );
  for( i=0; i<geometries.length; ++i){


    var polyStyle = new Style({
    /*  image: new Icon({
        anchor: [0.5, 46],
        anchorXUnits: 'fraction',
        anchorYUnits: 'pixels',
        opacity: 0.95,
        src: 'data/icon.png'
      }),
      */
     image: new Icon( ({
      //anchor: [0.5, 0.5],
      crossOrigin: 'anonymous',
      src: 'img/icon2.png',
      opacity: 0.60,
      imgSize: [50,50]
    })),

    text: new Text({
      text: mcisName[i],
      scale: 2,
      offsetY: 50,
      stroke: new Stroke({
          color: 'black',
          width: 1
      }),
      fill: new Fill({
          color: 'yellow'
      })
  }),


      stroke: new Stroke({
        width: 1,
        color: cororLineList[i%cororList.length]
      }),
      fill: new Fill({
        color: cororList[i%cororList.length]
      })
    });

    vectorContext.setStyle(polyStyle);


    vectorContext.drawGeometry(geometries[i]);

    vectorContext.setStyle(iconStyle03);
    vectorContext.drawGeometry(geometriesPoints[i]);


    vectorContext.drawGeometry(mcisGeo[i]);
  }

//vectorContext.setStyle(imageStyle);

//console.log(imgPath);

  //vectorContext.setStyle(iconStyle01);

  //vectorContext.drawGeometry(new MultiPoint(coordinates));

  /*
  vectorContext.setStyle(lineStyle);
  for (i = 0; i < coordinatesFromX.length; ++i) {
    //console.log(coordinatesFrom[i])
    //console.log(coordinatesTo[i])
    //vectorContext.drawGeometry(new LineString([coordinatesFrom[i], coordinatesTo[i] ]));
    var xFrom = coordinatesFromX[i]
    var yFrom = coordinatesFromY[i]
    var xTo = coordinatesToX[i]
    var yTo = coordinatesToY[i]
    for (j=1; j < n; ++j){

      var goX = xFrom + (xTo - xFrom)/j
      var goY = (yTo - yFrom)/(xTo - xFrom)*(goX-xFrom)+yFrom
      //console.log(goX)
      //console.log(goY)
      vectorContext.setStyle(headOuterImageStyle);
      vectorContext.drawGeometry(new Point([goX*100,goY*100]));
    }
  }
  */
  
  
  //var headPoint = new Point(coordinates[coordinates.length - 1]);

  //vectorContext.setStyle(headOuterImageStyle);
  //vectorContext.drawGeometry(headPoint);

  //vectorContext.setStyle(headInnerImageStyle);
  //vectorContext.drawGeometry(headPoint);


  //var headPoly = new Polygon([[[-1e6, -2e6], [-2e6, 1e6], [-1e6, 3e6]]]);
  //vectorContext.setStyle(imageStyle);
  //vectorContext.drawGeometry(headPoly);



  /*
  setTimeout(function() {


    map.render();
  }, 1000);
  */
  map.render();
  
});

setInterval(() => console.log(getMcis()), 5000);

/*
var geoip2 = require('geoip-lite');
function getGeoIp(){
  var ip2 = "52.64.97.11";
var geo2 = geoip2.lookup(ip2);
console.log(geo2);
}
*/
map.addLayer(iconLayer);


function getMcis(){

  var http = require('http');
  var mcisOptions = {
      hostname: 'localhost',
      port: 1323,
      path: '/ns/' + namespace + '/mcis',
      method: 'GET'
    };

  function handleResponse(response) {
    var serverData = '';
    response.on('data', function (chunk) {
      serverData += chunk;
    });
    response.on('end', function () {
      console.log("received server data:");
      console.log(serverData);
      var obj = JSON.parse(serverData);
      
      //console.log( obj.mcis[0].vm[0].publicIP );
      //var publicIP = obj.mcis[0].vm[0].publicIP
      //getGeoIp()

      //초기화
      cnt = 1;
      //geometries.length = 0;

      console.log("obj.mcis.length = " + obj.mcis.length);

      //console.log( obj.mcis[0].status );
      //console.log( obj.mcis[1].status );

      //for (i = 0; i < obj.mcis.length; i++) {
        for (let item of obj.mcis){
        console.log("Index:[" + "]obj.mcis[i].name = " +item.name );
        console.log( item.status );

        //mcisGeo[i] = new Array();

        var vmGeo = [];

        var validateNum = 0;
        for (j=0; j < item.vm.length; j++){
          //console.log( obj.mcis[i].vm[j].name );
          console.log( item.vm[j].publicIP );
          //console.log( obj.mcis[i].vm[j].status );

          

          //getIpLookup( obj.mcis[i].vm[j].publicIP, 1 ) //1들어가면 1번글로벌 변수에 변수처리 필요함
          //getVmGeo(obj.mcis[i].vm[j].publicIP, i, j)
          //mcisGeo[i][j] = getVmGeoTmp( obj.mcis[i].vm[j].publicIP );


          //vmGeo.push( getVmGeoTmp( item.vm[j].publicIP ) );


          //getVmGeoHttpSync(item.vm[j].publicIP);
          getVmGeo(item.vm[j].publicIP, cnt, j);
          //mcisGeo[i1][i2] = [obj.geo.longitude, obj.geo.latitude];
          
          var ipIndex = -1;
          for (var index in ipMap){
            //console.log("[ipMap[index]] : " + ipMap[index] + "[index] : " + index)
            if( ipMap[index] == item.vm[j].publicIP ){
              ipIndex = index;
            }
            
          }
          if (ipIndex != -1){
            console.log("geoMap[ipIndex] : " + geoMap[ipIndex])
            vmGeo.push(geoMap[ipIndex])
            validateNum++;
          }
        }
        if( validateNum == item.vm.length ){
          console.log("Found all GEOs validateNum : " + validateNum)


        for (j=0; j < vmGeo.length; j++){

          console.log("vmGeo[" + j + "] is" + vmGeo[j] );
          
        }
        //mcisGeo2.push(vmGeo);
        //makePoly4( vmGeo[0], vmGeo[1],[-95.712891, 37.09024], vmGeo[0]);

        //makePoly5( [-15.712891, 47.09024], [-25.712891, 12.09024], [25.712891, 32.09024],[-25.712891, 31.09024], [-15.712891, 47.09024]);

        mcisName[cnt] = "[" +item.name + "] " + item.status
        
        //console.log("vmGeo is" + mcisGeo[i][j]);
          
          if( vmGeo.length == 1){
            makePoly1( vmGeo[0], vmGeo[0] )
          }
          if( vmGeo.length == 2){
            makePoly2( vmGeo[0], vmGeo[1], vmGeo[0] )
          }
          if( vmGeo.length == 3){
            makePoly3( vmGeo[0], vmGeo[1], vmGeo[2], vmGeo[0] )
          }
          if( vmGeo.length == 4){
            makePoly4( vmGeo[0], vmGeo[1], vmGeo[2], vmGeo[3], vmGeo[0] )
          }
          if( vmGeo.length == 5){
            makePoly5( vmGeo[0], vmGeo[1], vmGeo[2], vmGeo[3], vmGeo[4], vmGeo[0] )
          }
          if( vmGeo.length == 6){
            makePoly6( vmGeo[0], vmGeo[1], vmGeo[2], vmGeo[3], vmGeo[4], vmGeo[5], vmGeo[0] )
          }
          if( vmGeo.length == 7){
            makePoly7( vmGeo[0], vmGeo[1], vmGeo[2], vmGeo[3], vmGeo[4], vmGeo[5], vmGeo[6], vmGeo[0] )
          }
          if( vmGeo.length == 8){
            makePoly8( vmGeo[0], vmGeo[1], vmGeo[2], vmGeo[3], vmGeo[4], vmGeo[5], vmGeo[6], vmGeo[7], vmGeo[0] )
          }

          cnt++;


        }

        
      }
      

      var random = Math.floor(Math.random()*(ipList.length-1))
      
      //getIpLookup(publicIP)
      //getIpLookup(ipList[random],1)
      //console.log( ipList[random] );
      //var ipFrom = lonlat
      //console.log( ipFrom );

      //random = Math.floor(Math.random()*(ipList.length-1))
      
      //getIpLookup(ipList[random],2)
      //var ipTo = lonlat2
      
      //console.log( ipTo );

      //random = Math.floor(Math.random()*(ipList.length-1))
      //getIpLookup(ipList[random],3)
      //var ip3rd = lonlat3
      //console.log( ip3rd );

      
      //changePoints(ipFrom, ipTo)
      //makeTria(ipFrom, ipTo, ip3rd)

      //console.log( mcisGeo);
      //console.log( mcisGeo[0]);
      //console.log( mcisGeo[1]);


      /*
      makePoly3( mcisGeo[0][0], mcisGeo[0][1], mcisGeo[0][2]);
      makePoly2( mcisGeo[1][0], mcisGeo[1][1]);

      for (i = 0; i < mcisGeo.length; ++i) {

        console.log( "mcisGeo[i].length" );
        console.log( mcisGeo[i].length );
        
        if( mcisGeo[i].length == 1){
          makePoly1( mcisGeo[i][0] );
          console.log( "makePoly1");
        }
        if( mcisGeo[i].length == 2){
          makePoly2( mcisGeo[i][0], mcisGeo[i][1]);
          console.log( "makePoly2");
        }
        if( mcisGeo[i].length == 3){
          makePoly3( mcisGeo[i][0], mcisGeo[i][1], mcisGeo[i][2]);
          console.log( "makePoly3");
        }
        if( mcisGeo[i].length == 4){
          makePoly4( mcisGeo[i][0], mcisGeo[i][1], mcisGeo[i][2], mcisGeo[i][3]);
        }
        if( mcisGeo[i].length == 5){
          makePoly5( mcisGeo[i][0], mcisGeo[i][1], mcisGeo[i][2], mcisGeo[i][3], mcisGeo[i][4]);
        }       

      }
*/

    });
  }
  
  http.request(mcisOptions, function(response){
    handleResponse(response);
  }).end();

}

function getVmGeoTmp(publicIP){
  for (i=0; i<ipTmpList.length; i++){
    if( ipTmpList[i] == publicIP ){
      var returnTmpx = geoTmpList[i][0]+10*Math.random();
      var returnTmpy = geoTmpList[i][1]+10*Math.random();
      
      return [returnTmpx, returnTmpy];
    }
  }
}

/*
function getVmGeoHttpSync(publicIP){

  var request = require('sync-request');
  var res = request('GET', 'http://cors-anywhere.herokuapp.com/api.ipgeolocationapi.com/geolocate/'+ publicIP);
  var obj = JSON.parse(res.getBody());
  console.log("obj.geo.longitude" + obj.geo.longitude +"obj.geo.latitude"+ obj.geo.latitude);
  var lon = obj.geo.longitude;
  var lat = obj.geo.latitude;
  lon = lon +5*Math.random();
  lat = lat +5*Math.random();
  return [lon, lat];

}
*/
/*
function getVmGeoHttpASync(publicIP, i1, i2){

  var request = require('sync-request');
  var res = request('GET', 'http://cors-anywhere.herokuapp.com/api.ipgeolocationapi.com/geolocate/'+ publicIP);
  var obj = JSON.parse(res.getBody());
  console.log("obj.geo.longitude" + obj.geo.longitude +"obj.geo.latitude"+ obj.geo.latitude);
  var lon = obj.geo.longitude;
  var lat = obj.geo.latitude;
  lon = lon +5*Math.random();
  lat = lat +5*Math.random();
  return [lon, lat];

}*/



function getVmGeo(publicIP, i1, i2){

  var http = require('http');
  
  var Options = {
      //hostname: 'cors-anywhere.herokuapp.com/api.ipgeolocation.io',
      hostname: 'cors-anywhere.herokuapp.com/api.ipgeolocationapi.com',
      //port: 1323,
      path: '/geolocate/'+ publicIP,
      method: 'GET',
      headers: {
        //'Content-Type': 'application/json',
        //'Origin': 'https://ipgeolocation.io',
        //'Referer': 'https://ipgeolocation.io/',
        //'Sec-Fetch-Mode': 'no-cors'
      }
    };

    /*
   var Options = {
    //hostname: 'cors-anywhere.herokuapp.com/api.ipgeolocation.io',
    //http://api.ipstack.com/129.254.175.187?access_key=[geoServiceKey]&format=1
    hostname: 'cors-anywhere.herokuapp.com/api.ipstack.com',
    //port: 1323,
    path: '/'+ publicIP + '?access_key='+geoServiceKey+'&format=1',
    method: 'GET',
    headers: {
      //'access_key': geoServiceKey,
      //'format': '1',
      //'Referer': 'https://ipgeolocation.io/',
      //'Sec-Fetch-Mode': 'no-cors'
    }
  };
*/
   
  function handleResponse(response) {
    var serverData = '';
    response.on('data', function (chunk) {
      serverData += chunk;
    });
    response.on('end', function () {
      console.log("received server data:");
      //console.log(serverData);
      var obj = JSON.parse(serverData);


      //mcisGeo[i1][i2] = [obj.geo.longitude, obj.geo.latitude];


      var ipFlag =0;
      for (let ipStr of ipMap){
        if( publicIP == ipStr ){
          ipFlag =1;
        }
      }
      if (ipFlag == 0){
        ipMap.push(publicIP);
        geoMap.push([obj.geo.longitude + 2*Math.random()- 2*Math.random(), obj.geo.latitude + 2*Math.random()- 2*Math.random() ]);
      }

      //if( Array.isArray(ipGeoMap) && ipGeoMap.length) { 
        
      //}
      //console.log("ipMap : " + ipMap);
      //console.log("geoMap : " + geoMap);
      
      /*
      if (num == 1){
        lonlat = [obj.geo.longitude, obj.geo.latitude]
        console.log(lonlat);
      }
      if (num == 2){
        lonlat2 = lonlat = [obj.geo.longitude, obj.geo.latitude]
        console.log(lonlat2);
      }
      if (num == 3){
        lonlat3 = lonlat = [obj.geo.longitude, obj.geo.latitude]
        console.log(lonlat3);
      }
      */
      
    });

  }
  http.request(Options, function(response){
    handleResponse(response);
    //return lonlat
  }).end();
}





var lonlat = [-180, -90];
var lonlat2 = [-180, -90];
var lonlat3 = [-180, -90];

function getIpLookup(publicIP, num){

  var http = require('http');
  
  var Options = {
      //hostname: 'cors-anywhere.herokuapp.com/api.ipgeolocation.io',
      hostname: 'cors-anywhere.herokuapp.com/api.ipgeolocationapi.com',
      //port: 1323,
      path: '/geolocate/'+ publicIP,
      method: 'GET',
      headers: {
        //'Content-Type': 'application/json',
        //'Origin': 'https://ipgeolocation.io',
        //'Referer': 'https://ipgeolocation.io/',
        //'Sec-Fetch-Mode': 'no-cors'
      }
    };

    /*
   var Options = {
    //hostname: 'cors-anywhere.herokuapp.com/api.ipgeolocation.io',
    //http://api.ipstack.com/129.254.175.187?access_key=[geoServiceKey]&format=1
    hostname: 'cors-anywhere.herokuapp.com/api.ipstack.com',
    //port: 1323,
    path: '/'+ publicIP + '?access_key='+geoServiceKey+'&format=1',
    method: 'GET',
    headers: {
      //'access_key': geoServiceKey,
      //'format': '1',
      //'Referer': 'https://ipgeolocation.io/',
      //'Sec-Fetch-Mode': 'no-cors'
    }
  };
*/
   
  function handleResponse(response) {
    var serverData = '';
    response.on('data', function (chunk) {
      serverData += chunk;
    });
    response.on('end', function () {
      console.log("received server data:");
      console.log(serverData);
      var obj = JSON.parse(serverData);
      //console.log( obj.name );
      //console.log( obj.geo.latitude );
      //console.log( obj.geo.longitude );
      //lonlat = [obj.geo.longitude, obj.geo.latitude]

      //console.log( obj.city );
      //console.log( obj.latitude );
      //console.log( obj.longitude );
      
      /*
      if (num == 1){
        lonlat = [obj.longitude, obj.latitude]
        console.log(lonlat);
      }
      if (num == 2){
        lonlat2 = [obj.longitude, obj.latitude]
        console.log(lonlat2);
      }
      if (num == 3){
        lonlat3 = [obj.longitude, obj.latitude]
        console.log(lonlat3);
      }*/
      if (num == 1){
        lonlat = [obj.geo.longitude, obj.geo.latitude]
        console.log(lonlat);
      }
      if (num == 2){
        lonlat2 = lonlat = [obj.geo.longitude, obj.geo.latitude]
        console.log(lonlat2);
      }
      if (num == 3){
        lonlat3 = lonlat = [obj.geo.longitude, obj.geo.latitude]
        console.log(lonlat3);
      }
      
      
    });

  }
  
  http.request(Options, function(response){
    handleResponse(response);
    //return lonlat
  }).end();

  
}


