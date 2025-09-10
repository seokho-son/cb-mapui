# CB-MapUI
Interactive Map-based GUI dashboard for CB-Tumblebug (control and display multi-cloud infra)

Check CB-Tumblebug project. (https://github.com/cloud-barista/cb-tumblebug)

[NOTE] This project is not for a production, used only for development and demonstation of CB-Tumblebug. 
- This project utilizes Openlayers. You need to know this includes temporal codes which are not readable.

## 주요 기능

### 1. Map View (기존 기능)
- 지도 기반 인터랙티브 멀티클라우드 인프라 시각화
- OpenLayers 기반 지도 렌더링
- MCI/VM 생성, 제어, 모니터링

### 2. Dashboard View (신규 기능)
- 전통적인 대시보드 스타일의 멀티클라우드 관리 인터페이스
- 통계 카드 및 차트를 통한 인프라 현황 요약
- 테이블 기반 MCI/VM 목록 및 관리
- 실시간 자동 새로고침 기능
- 리소스 오버뷰 (vNet, Security Groups, SSH Keys)

### 3. 접근 방법
- **Map View**: 기본 인터페이스에서 `🗺️ Map View` 버튼 클릭
- **Dashboard View**: 기본 인터페이스에서 `📊 MC Dashboard` 버튼 클릭
- **API View**: 기본 인터페이스에서 `🛠️ TB API` 버튼 클릭

## cb-mapui 설치 및 실행 방법

### Prerequisite

 - 다운로드
   ```bash
   git clone https://github.com/cloud-barista/cb-mapui.git
   cd ./cb-mapui
   ```

 - npm, Node.js
   - https://github.com/nodesource/distributions 의 Node.js **v16.x** 설치 (아래 설치 명령어 예시 참조)
     ```bash
     # Using Ubuntu
     sudo apt-get update
     sudo apt-get install -y ca-certificates curl gnupg
     sudo mkdir -p /etc/apt/keyrings
     curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg

     NODE_MAJOR=16
     echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" | sudo tee /etc/apt/sources.list.d/nodesource.list

     sudo apt-get update
     sudo apt-get install nodejs -y

     sudo apt-get install npm

     node -v; npm -v
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
   Server running at http://0.0.0.0:1324
   ✨ Built in 6.32s
 
   # Access to http://x.x.x.x:1324/ (ex: http://localhost:1324/)
   ```

 - 서버 접속

  웹브라우저를 통해 http://x.x.x.x:1324 (ex: http://localhost:1324) 접속 

  ![image](https://github.com/cloud-barista/cb-mapui/assets/5966944/2423fbcd-0fdb-4511-85e2-488ba15ae8c0)

 - TextBox에 환경 변수 확인 및 설정
   - TB IP/hostname: 서버 주소
     - 웹브라우저 접속 주소와 동일하게 자동 지정
   - TB Port: 기본값은 `1323`, 사용자가 상황에 따라 `31323` 등으로 변경하여 사용 가능
   - TB Username, Password: CB-Tumblebug REST API (BasicAuth) 호출에 필요한 Username 및 Password (ex: `default`, `default`)
   - NS ID: cb-mapui에 표시할 namespace를 지정
   - Display interval: 기본값은 10 (단위: 초)며, 정상적인 양의 정수를 입력했을 때에만 유효
 - MCI 생성
   - MCI Provisioning에서 MCI 구성을 위한 상세 정보를 설정. Location-based 를 지정한 경우 Map에 클릭하면, 추천 VM이 지정됨.
   - 추천 VM들로 구성한 MCI 요구사항이 마련되면, `Create MCI` 버튼을 클릭하여 구성 정보 확인 후 MCI 생성 요청.
   - 생성 결과는 알림창 및 Text areabox에 표시됨.

## cb-mapui 동작 방식

index.js 에 포함된 로직이 수행되며, 이는 index.html 를 통해서 웹에 출력됨.

아래 과정을 주기적으로 반복함.
1. CB-Tumblebug을 통해 MCI VM 조회
1. 각VM의 기하학적 위치(longitude, latitude)를 획득
1. Convex Hull을 통해 VM들을 폴리곤 형태로 구성 (MCI 형태 표현)
1. Map에 해당 MCI 폴리곤들을 출력 (VM 라이프사이클 정보 아이콘 출력 포함)

### index.js 처리 로직 상세

index.js 는 Openlayers를 기반으로, 

- CB-Tumblebug API를 콜하여 MCI 및 VM 정보를 조회(function getMci())하고,
- MCI를 생성 및 제어할 수 있는 기능을 버튼으로 제공함.
- tileLayer.on('postrender', function (event) Openlayers에서 반복적으로 그래픽 출력을 수행하는 펑션이며, MCI Polygon 객체들을 도형으로 출력. 이때 MCI의 상태도 갱신하여, 정보를 함께 출력.
