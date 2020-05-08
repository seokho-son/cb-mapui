# cb-mapui
A MapUI Client for CB-Tumblebug (display multi-cloud infra service)

Check CB-Tumblebug project. (https://github.com/cloud-barista/cb-tumblebug)

[NOTE] This project is tempoal and unstable, used only for demonstation purpose.

This project uses Openlayers. You need to know this includes temporal codes which are not readable.

## cb-mapui 설치 및 실행 방법

### Prerequisite

To run this project, follow the following instruction.

Check the instruction from Openlayers.
https://openlayers.org/en/latest/doc/tutorials/bundle.html

npm init

npm install ol

npm install --save-dev parcel-bundler

### 환경 설정 (소스 코드에서 수정)

Change following inforamtion according to your environment.

var namespace = 'ddb11cdf-54bd-4255-b4f3-7d64a8991cd3'; (This is namespace for CB-Tumblebug project)

var geoServiceKey = 'your key';


### 빌드 및 실행

npm run build

You need to check image file for icon is available in dist/img/icon3.png

npm start

Access to http://localhost:1234/

