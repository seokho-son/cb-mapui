# cb-mapui
MapUI for CB-Tumblebug (display multi-cloud infra service)

Check CB-Tumblebug project. (https://github.com/cloud-barista/cb-tumblebug)

This project uses Openlayers. You need to know this includes temporal codes which are not readable.

To run this project, follow the following instruction.


Check the instruction from Openlayers.
https://openlayers.org/en/latest/doc/tutorials/bundle.html


npm init

npm install ol

npm install --save-dev parcel-bundler


Change following inforamtion according to your environment.

var namespace = 'ddb11cdf-54bd-4255-b4f3-7d64a8991cd3'; (This is namespace for CB-Tumblebug project)

var geoServiceKey = 'your key';


npm run build


You need to check image file for icon is available in dist/img/icon3.png


npm start


Access to http://localhost:1234/

