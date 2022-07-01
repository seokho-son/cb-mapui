# cb-mapui
Interactive Map-based GUI for CB-Tumblebug (control and display multi-cloud infra)

Check CB-Tumblebug project. (https://github.com/cloud-barista/cb-tumblebug)

[NOTE] This project is not for a production, used only for development and demonstation of CB-Tumblebug. 
- This project utilizes Openlayers. You need to know this includes temporal codes which are not readable.

## cb-mapui 설치 및 실행 방법

### Prerequisite

 - npm, Node.js
   - https://github.com/nodesource/distributions 의 Node.js **v16.x** 설치 (아래 설치 명령어 예시 참조)
     ```bash
     # Using Ubuntu
     curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
     sudo apt-get install -y nodejs
     ```

 - 의존 node 패키지: `package.json` 참고
    `package.json` 를 기준으로 모든 의존 패키지(ol 및 parcel 포함) 설치
     ```bash
     npm install
     ```
     (Openlayers: https://openlayers.org/en/latest/doc/tutorials/bundle.html )

### 빌드 및 실행

 - 빌드
  ```bash
  npm run build
  ```

 - 서버 실행

  ```bash
  npm start
  ```

  (출력 예시)
  ```
  Server running at http://localhost:1324
  ✨ Built in 6.32s

  # Access to http://x.x.x.x:1324/ (ex: http://localhost:1324/)
  ```

 - 서버 접속

  웹브라우저를 통해 http://x.x.x.x:1324 (ex: http://localhost:1324) 접속 

  ![image](https://user-images.githubusercontent.com/5966944/130864303-a45becd5-c681-4d1f-a02e-593b3fb77279.png)

 - TextBox에 환경 변수 설정
   - TB IP/hostname: 서버 주소
     - 기본값: `localhost` 
     - 예: `localhost`, `192.168.1.6`, `cb-tumblebug`
   - TB Port: 기본값은 `1323`, 사용자가 상황에 따라 `31323` 등으로 변경하여 사용 가능
   - TB Username, Password: CB-Tumblebug REST API (BasicAuth) 호출에 필요한 Username 및 Password 
   - TB namespace: cb-mapui에 표시할 namespace를 지정
   - Refresh interval: 기본값은 5 (단위: 초)며, 정상적인 양의 정수를 입력했을 때에만 유효


## cb-mapui 동작 방식

index.js 에 포함된 로직이 수행되며, 이는 index.html 를 통해서 웹에 출력됨.

아래 과정을 주기적으로 반복함.
1. CB-Tumblebug을 통해 MCIS VM 조회
1. 각VM의 기하학적 위치(longitude, latitude)를 획득
1. Convex Hull을 통해 VM들을 폴리곤 형태로 구성 (MCIS 형태 표현)
1. Map에 해당 MCIS 폴리곤들을 출력 (VM 라이프사이클 정보 아이콘 출력 포함)

### index.js 처리 로직 상세

index.js 는 Openlayers를 기반으로, 

- CB-Tumblebug API를 콜하여 MCIS 및 VM 정보를 조회(function getMcis())하고,
- MCIS를 생성 및 제어할 수 있는 기능을 버튼으로 제공함.
- tileLayer.on('postrender', function (event) Openlayers에서 반복적으로 그래픽 출력을 수행하는 펑션이며, MCIS Polygon 객체들을 도형으로 출력한다. 이때 MCIS의 상태도 갱신하여, 정보를 함께 출력.
