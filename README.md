# cb-mapui
A MapUI Client for CB-Tumblebug (display multi-cloud infra service)

Check CB-Tumblebug project. (https://github.com/cloud-barista/cb-tumblebug)

[NOTE] This project is tempoal and unstable, used only for demonstation purpose. (lots of static codes)
- This project uses Openlayers. You need to know this includes temporal codes which are not readable.

## cb-mapui 설치 및 실행 방법

### Prerequisite

To run this project, follow the following instruction.

Check the instruction from Openlayers.
https://openlayers.org/en/latest/doc/tutorials/bundle.html

```
npm init

npm install ol

npm install --save-dev parcel-bundler
```

### 환경 설정 (소스 코드에서 수정)

Change following inforamtion according to your environment.

```
var namespace = 'ddb11cdf-54bd-4255-b4f3-7d64a8991cd3'; (This is namespace for CB-Tumblebug project)

var geoServiceKey = 'your key';
// IP to GeoLocation map external service
```

### 빌드 및 실행

```
npm run build

# You need to check image file for icon is available in dist/img/icon3.png

npm start

# Access to http://localhost:1234/
```


## cb-mapui 동작 방식

index.js 에 포함된 로직이 수행되며, 이는 index.html 에 포함되어 표현됨.
1. MCIS VM 조회 및 객체 생성
1. VM의 퍼블릭 IP를 기반으로 기하학적 위치(longitude, latitude)를 저장
1. Convex Hull을 통해 VM들을 폴리곤 형태로 구성 (MCIS 형태 표현)
1. Map에 해당 MCIS 폴리곤들을 출력 (VM 라이프사이클 정보 아이콘 출력 포함)

### index.js 처리 로직 상세

index.js 는 Openlayers를 기반으로, 

- CB-Tumblebug API를 콜하여 MCIS 및 VM 정보를 조회(function getMcis())하고,

[참고] CB-Tumblebug API가 변경되는 경우 아래의 코드 수정이 필요함
  ```
  var mcisOptions = {
    hostname: 'localhost',
    port: 1323,
    path: '/ns/' + namespace + '/mcis',
    method: 'GET'
  };
  ```

- MCIS에 포함된 VM들의 퍼블릭 IP의 기하학적 위치(longitude, latitude) 를 조회하여, 각 VM의 위치를 룩업함.
  - 이때, IP의 기하학적 위치는 외부 서비스(api.ipstack.com 등) : function getVmGeoAcc(publicIP) 로 룩업하거나,
- 이때, IP의 기하학적 위치는 맵을 임의로 지정(static code)하여 : function getVmGeoStatic(publicIP) 로 룩업할 수 있다. (현재 코드는 해당 방식으로 지정되어 있음)

- MCIS의 VM들의 위치를 모두 알게되면, 이를 하나의 연결된 도형으로 만들기 위해서 convexHull 로 정렬하여, Polygon 객체로 저장한다.

- tileLayer.on('postrender', function (event) Openlayers에서 반복적으로 그래픽 출력을 수행하는 펑션이며, MCIS Polygon 객체들을 도형으로 출력한다. 이때 MCIS의 상태도 갱신하여, 정보를 함께 출력한다.
