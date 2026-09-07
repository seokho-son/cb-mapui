# Cloud-Barista 👋
# CB-MapUI (Visual Multi-Cloud Infrastructure Management Platform)

[![License](https://img.shields.io/github/license/cloud-barista/cb-mapui?color=blue)](https://github.com/cloud-barista/cb-mapui/blob/main/LICENSE)
[![Release Version](https://img.shields.io/github/v/release/cloud-barista/cb-mapui?color=blue)](https://github.com/cloud-barista/cb-mapui/releases/latest)
[![Build Status](https://img.shields.io/github/actions/workflow/status/cloud-barista/cb-mapui/docker-image.yml)](https://github.com/cloud-barista/cb-mapui/actions)
[![Docker Pulls](https://img.shields.io/docker/pulls/cloudbaristaorg/cb-mapui)](https://hub.docker.com/r/cloudbaristaorg/cb-mapui)
[![Vite](https://img.shields.io/badge/bundler-Vite%205-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)

---

## What is CB-MapUI? ✨

**CB-MapUI** is an **interactive visual management console** for [CB-Tumblebug](https://github.com/cloud-barista/cb-tumblebug) that provides intuitive geographic map-based views, topology graphs, and dashboard-style interfaces for orchestrating multi-cloud infrastructures. As an official user-facing frontend of the Cloud-Barista project, CB-MapUI transforms complex multi-cloud operations into visual, point-and-click interactions across heterogeneous cloud service providers (AWS, Azure, GCP, Alibaba Cloud, Tencent Cloud, OpenStack, and more).

```
 ┌────────────────────────────────────────────────────────────────────────┐
 │                     CB-MapUI Visual Console                            │
 ├───────────────────┬─────────────────────┬──────────────────────────────┤
 │  🗺️ Map View      │  🕸️ Topology Graph  │  📊 Multi-Cloud Dashboard    │
 │  (OpenLayers 10)  │  (Cytoscape.js)     │  (DataTables & Chart.js)     │
 └─────────┬─────────┴──────────┬──────────┴──────────────┬───────────────┘
           │                    │                         │
           ▼                    ▼                         ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │                 Unified Gateway / Reverse Proxy (:8080)               │
 └──────────────────────────────────┬─────────────────────────────────────┘
                                    ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │               CB-Tumblebug REST API Backend (:1323)                    │
 └──────────────────────────────────┬─────────────────────────────────────┘
                                    ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │                 CB-Spider Multi-Cloud Driver Layer                     │
 └───────┬──────────────┬──────────────┬──────────────┬─────────────┬─────┘
         ▼              ▼              ▼              ▼             ▼
       [AWS]         [Azure]         [GCP]        [Alibaba]     [Others]
```

### 🎯 Key Features

- **🗺️ Interactive Geographic Map View**:
  - Global map visualization of multi-cloud VMs, clusters, and networks using **OpenLayers 10**.
  - Dynamic **Convex-Hull polygons** representing geographically distributed Infras and node clusters.
  - Color-coded real-time lifecycle status indicators (Running, Suspended, Creating, Failed, Terminating).
  - Location-based point-and-click VM and cluster provisioning.
- **🕸️ Resource & Network Topology Graphs (Cytoscape.js)**:
  - **Resource Graph**: Interactive dependency graph visualizing relationships between Infras, VMs, vNets, Subnets, Security Groups, SSH Keys, and Data Disks.
  - **Network Topology Graph**: Network-centric topology mapping subnets, CIDRs, gateways, and routing paths.
- **📊 Unified Multi-Cloud Dashboard**:
  - Real-time KPI summary cards for Infras, Nodes, K8s clusters, and virtual networks.
  - Interactive distribution charts powered by **Chart.js**.
  - Comprehensive **DataTables** with multi-column filtering, sorting, bulk actions, and auto-refresh.
- **🚀 Dynamic Provisioning Wizard & Pre-flight Review**:
  - Step-by-step multi-cloud VM specification configuration.
  - Instant pricing estimations (USD/hour) and configuration review before deployment.
- **🤖 Autopilot Provisioning**:
  - Automated, policy-driven multi-cloud provisioning optimizing for cost, performance, or geographic distribution.
- **☸️ Multi-Cloud Kubernetes (K8s) Management**:
  - Unified status tracking, node group inspection, and lifecycle operations for Kubernetes clusters running across different clouds.
- **⚡ Multi-Node Remote Command Execution**:
  - Integrated SSH-based remote command execution across multiple VM nodes.
  - Script catalogs and phased workflow automation with execution logs.
- **📚 Multi-View API Explorers**:
  - Built-in **Swagger UI** (`swagger.html`), **ReDoc** (`redoc-swagger.html`), and **Scalar** (`scalar.html`) for interactive CB-Tumblebug REST API testing.

---

## Table of Contents

1. [⚡ Quick Start](#quick-start-)
2. [🔧 Prerequisites](#prerequisites-)
3. [🚀 Deployment & Installation](#deployment--installation-)
   - [Option 1: Kubernetes / Kind with Helm (Recommended)](#option-1-kubernetes--kind-with-helm-recommended)
   - [Option 2: Docker Compose with CB-Tumblebug](#option-2-docker-compose-with-cb-tumblebug)
   - [Option 3: Local Standalone Development (Vite)](#option-3-local-standalone-development-vite)
   - [Option 4: Standalone Docker Container](#option-4-standalone-docker-container)
4. [🌟 Features & Usage Guide](#features--usage-guide-)
5. [⚙️ Configuration & Environment Variables](#configuration--environment-variables-%EF%B8%8F)
6. [🏗️ Architecture & Tech Stack](#architecture--tech-stack-%EF%B8%8F)
7. [🔧 Troubleshooting](#troubleshooting-)
8. [🛠️ Development & Project Structure](#development--project-structure-%EF%B8%8F)
9. [📄 License](#license-)
10. [💬 Support & Community](#support--community-)

---

## Quick Start ⚡

The fastest way to experience CB-MapUI is deploying it alongside **CB-Tumblebug** via the unified Kubernetes (Kind) or Docker Compose environment.

### 1. Kind Cluster Deployment (Recommended)

```bash
# Clone CB-Tumblebug repository
git clone https://github.com/cloud-barista/cb-tumblebug.git
cd cb-tumblebug

# Launch Kind cluster with Helm releases (CB-Tumblebug + CB-MapUI + Gateway)
make k-up

# Access the unified gateway:
# - CB-MapUI:       http://localhost:8080/
# - CB-Tumblebug:   http://localhost:8080/tumblebug/api
# - MCP Server:     http://localhost:8080/mcp
```

### 2. Docker Compose Deployment

```bash
# Start all services via Docker Compose
make up

# Access endpoints:
# - CB-MapUI:       http://localhost:1324
# - CB-Tumblebug:   http://localhost:1323/tumblebug/api
```

---

## Prerequisites 🔧

### For Local Development

| Tool | Version | Purpose |
|------|---------|---------|
| **Node.js** | 18.x or 20.x LTS | JavaScript runtime |
| **npm** | 9.x+ | Package manager |
| **CB-Tumblebug** | v0.13.0+ | Multi-cloud orchestrator backend |

### For Container Deployment

- **Docker** 24.0+ and **Docker Compose** v2+
- *(Optional for Kubernetes)* **Kind** v0.20+ and **Helm** v3.12+

---

## Deployment & Installation 🚀

### Option 1: Kubernetes / Kind with Helm (Recommended)

In modern Cloud-Barista environments, CB-MapUI is deployed alongside CB-Tumblebug and an API Gateway (Envoy/AgentGateway) inside a local Kind Kubernetes cluster.

1. **Start the Kind cluster**:
   ```bash
   cd ~/go/src/github.com/cloud-barista/cb-tumblebug
   make k-up
   ```
2. **Build and load local CB-MapUI changes into the cluster**:
   ```bash
   # From cb-tumblebug directory:
   make k-build-mapui
   ```
3. **Access via Unified Gateway**:
   - **MapUI**: [http://localhost:8080/](http://localhost:8080/)
   - **Tumblebug API**: [http://localhost:8080/tumblebug/api](http://localhost:8080/tumblebug/api)
   - **TLS Endpoint**: [https://localhost:8443/](https://localhost:8443/)

---

### Option 2: Docker Compose with CB-Tumblebug

CB-MapUI is bundled into the `docker-compose.yaml` of CB-Tumblebug:

```bash
# 1. Automated setup of CB-Tumblebug
curl -sSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/set-tb.sh | bash
cd ~/go/src/github.com/cloud-barista/cb-tumblebug

# 2. Launch full stack
make up

# 3. Configure credentials and initialize
make gen-cred
# Edit ~/.cloud-barista/credentials.yaml
make enc-cred
make init
```

- **CB-MapUI**: [http://localhost:1324](http://localhost:1324)
- **CB-Tumblebug API**: [http://localhost:1323/tumblebug/api](http://localhost:1323/tumblebug/api)

---

### Option 3: Local Standalone Development (Vite)

If you are developing or customizing CB-MapUI frontend code:

```bash
# 1. Clone repository
git clone https://github.com/cloud-barista/cb-mapui.git
cd cb-mapui

# 2. Install dependencies
npm install

# 3. Run Vite development server with Hot Module Replacement (HMR)
npm run dev

# 4. Access UI
# http://localhost:1324
```

**Production Build**:
```bash
# Build optimized production bundle to dist/
npm run build

# Preview production build locally
npm run preview
# or: npm start
```

---

### Option 4: Standalone Docker Container

You can build and run CB-MapUI as an independent Docker container:

```bash
# 1. Build Docker image
docker build -t cloudbaristaorg/cb-mapui:latest .

# 2. Run container with runtime configuration
docker run -d \
  --name cb-mapui \
  -p 1324:1324 \
  -e MAPUI_PARAM_TB_HOSTNAME=host.docker.internal \
  -e MAPUI_PARAM_TB_PORT=1323 \
  cloudbaristaorg/cb-mapui:latest

# 3. Access at http://localhost:1324
```

---

## Features & Usage Guide 🌟

### 1. 🗺️ Map View (`index.html`)
- **Geographic Projection**: View multi-cloud infrastructure located across global data centers using geographic coordinates.
- **Convex-Hull Clustering**: Automatically calculates and draws bounding polygons around nodes belonging to the same Infra or region.
- **Locationless Handling**: Infras in preparing, failed, or non-coordinate states are cleanly arranged along the side panels.
- **Resource Actions**: Click on nodes or Infras to view status details, trigger reboot/suspend/resume/terminate actions, or retry failed nodes.

### 2. 🕸️ Topology Views (`resource-graph.js` & `network-graph.js`)
- **Resource Graph**: Click `Topology` on any Infra card to switch to a Cytoscape.js visual graph representing VMs, disks, subnets, and security groups with interactive zoom/pan and node inspection.
- **Network Graph**: Explore subnet CIDR blocks, gateway routing, and multi-cloud virtual network structures.

### 3. 📊 Multi-Cloud Dashboard (`dashboard.html`)
- **KPI Metrics**: Real-time summary of Infras, Nodes, K8s clusters, vNets, and Security Groups.
- **Status Distribution**: Doughnut and bar charts showing running vs suspended vs failed workloads.
- **Resource Inventory**: Filterable and searchable DataTables with direct action buttons.

### 4. 🚀 Dynamic Provisioning Wizard
- **Spec Recommendation**: Select recommendation policies (location-based, cost-optimized, performance-optimized).
- **Interactive Configuration**: Add node groups, select OS images, configure root/data disks, and assign labels.
- **Pre-flight Review**: Review the generated request JSON, estimated hourly cost, and spec validation before provisioning.

### 5. ⚡ Remote Command & Script Automation
- Execute shell commands across multiple target nodes simultaneously.
- Access pre-configured script catalogs (benchmarks, agent installers, system diagnostics).
- Real-time output streaming and execution status tracking.

### 6. 📚 API Explorers
- **Swagger UI**: Accessible via `swagger.html`
- **ReDoc**: Accessible via `redoc-swagger.html`
- **Scalar**: Accessible via `scalar.html`

---

## Configuration & Environment Variables ⚙️

### Map Settings Modal

Click the **Settings** gear icon in the navigation bar to configure connection parameters:

| Setting | Default | Description |
|---------|---------|-------------|
| **TB Hostname** | Current host | CB-Tumblebug server hostname/IP |
| **TB Port** | `1323` (or `8080` in gateway mode) | CB-Tumblebug API port |
| **TB Username** | `default` | BasicAuth username |
| **TB Password** | `default` | BasicAuth password |
| **Namespace** | `default` | Active multi-cloud namespace |
| **Display Interval** | `10` seconds | Periodic auto-refresh interval |

> 💡 Settings are persisted to browser `localStorage` under `mapui-api-config`.

### Docker Runtime Parameters (`MAPUI_PARAM_*`)

When deploying via Docker, `docker-entrypoint.sh` automatically extracts environment variables prefixed with `MAPUI_PARAM_` and writes them into `runtime-params.json` at startup:

```bash
docker run -d -p 1324:1324 \
  -e MAPUI_PARAM_DEFAULT_NAMESPACE=default \
  -e MAPUI_PARAM_TB_HOSTNAME=192.168.1.100 \
  -e MAPUI_PARAM_TB_PORT=1323 \
  cloudbaristaorg/cb-mapui:latest
```

---

## Architecture & Tech Stack 🏗️

### Frontend Technology Stack

| Layer | Technologies |
|-------|--------------|
| **Build & Bundler** | **Vite 5**, `vite-plugin-node-polyfills` |
| **Map Rendering** | **OpenLayers 10** (TileLayer, VectorLayer, Convex Hull, Proj) |
| **Graph Visualization** | **Cytoscape.js** (COSE layout, compound nodes) |
| **Charts & Metrics** | **Chart.js 4** |
| **Data Tables** | **DataTables.net** with Bootstrap 4 styling |
| **UI & Modals** | **Bootstrap 4.6**, **SweetAlert2** |
| **HTTP Client** | **Axios** (with BasicAuth and error handling) |
| **API Docs** | **Swagger UI**, **ReDoc**, **Scalar** |

### High-Level System Architecture

```
User Web Browser
  │
  ├──► http://localhost:8080/ (MapUI Static Files served via Vite / Nginx)
  │
  ├──► http://localhost:8080/tumblebug/* (Reverse Proxied to CB-Tumblebug API)
  │      │
  │      ├──► /ns/{nsId}/infra              # Multi-Cloud Infrastructure management
  │      ├──► /ns/{nsId}/k8sCluster         # Kubernetes Cluster management
  │      ├──► /ns/{nsId}/resources/*        # vNet, Spec, Image, SecurityGroup, KeyPair
  │      └──► /ns/{nsId}/cmd/infra/{id}     # Remote Command Execution
  │
  └──► http://localhost:8080/mcp (CB-Tumblebug MCP Server)
```

---

## Troubleshooting 🔧

### Common Questions & Solutions

#### 1. Cannot connect to CB-Tumblebug (`Network Error` / `401 Unauthorized`)
- **Check Backend Health**:
  ```bash
  curl -s http://localhost:1323/tumblebug/readyz
  # In Gateway mode:
  curl -s http://localhost:8080/tumblebug/readyz
  ```
- **Verify Settings**:
  - Open **Map Settings** (gear icon) and verify `Hostname`, `Port`, and BasicAuth credentials (`default` / `default`).
  - In unified gateway mode (`localhost:8080`), set `Hostname: localhost` and `Port: 8080`.

#### 2. Namespace list shows `(none)`
- Ensure CB-Tumblebug is initialized with credentials:
  ```bash
  cd ~/go/src/github.com/cloud-barista/cb-tumblebug
  make init
  ```
- Check that namespaces exist:
  ```bash
  curl -s -u default:default http://localhost:1323/tumblebug/ns?option=id
  ```

#### 3. Map not rendering or canvas blank
- Ensure WebGL and hardware acceleration are enabled in your browser.
- Open Developer Tools (`F12`) -> Console to inspect any blocked asset loads or CSP errors.
- Try doing a hard refresh (`Ctrl + F5` or `Cmd + Shift + R`).

---

## Development & Project Structure 🛠️

```
cb-mapui/
├── index.html              # Main OpenLayers map dashboard entry
├── index.js                # Map dashboard application logic
├── dashboard.html          # Traditional Multi-Cloud Dashboard entry
├── dashboard.js            # Dashboard logic (KPIs, Chart.js, DataTables)
├── resource-graph.js       # Cytoscape.js multi-cloud resource graph module
├── network-graph.js        # Cytoscape.js network topology visualization module
├── swagger.html            # Swagger UI API explorer
├── redoc-swagger.html      # ReDoc API explorer
├── scalar.html             # Scalar modern API documentation viewer
├── vite.config.js          # Vite build and development configuration
├── package.json            # Node.js dependencies and scripts
├── Dockerfile              # Multi-stage Docker container build (Vite + Alpine)
├── docker-entrypoint.sh    # Container entrypoint injecting runtime parameters
├── runtime-params.json     # Dynamic parameter store for container runtime
└── img/                    # Cloud provider icons and static image assets
```

### Available npm Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `npm run dev` | `vite --host 0.0.0.0 --port 1324` | Starts local development server with HMR |
| `npm run build` | `vite build` | Compiles production assets into `dist/` |
| `npm start` | `vite --host 0.0.0.0 --port 1324` | Starts Vite server on port 1324 |
| `npm run preview` | `vite preview --host 0.0.0.0 --port 1324` | Previews the compiled `dist/` bundle |

---

## Related Projects 🔗

- **[CB-Tumblebug](https://github.com/cloud-barista/cb-tumblebug)**: Multi-Cloud Infrastructure Management Framework
- **[CB-Spider](https://github.com/cloud-barista/cb-spider)**: Multi-Cloud Driver & Infrastructure Interface
- **[CB-Larva](https://github.com/cloud-barista/cb-larva)**: Multi-Cloud Testing and Verification Framework
- **[Cloud-Barista](https://github.com/cloud-barista)**: Open Multi-Cloud Platform Initiative

---

## License 📄

This project is licensed under the **Apache License 2.0** - see the [LICENSE](LICENSE) file for details.

### Third-party Licenses
- **OpenLayers**: [BSD 2-Clause License](https://openlayers.org/)
- **Cytoscape.js**: [MIT License](https://js.cytoscape.org/)
- **Chart.js**: [MIT License](https://www.chartjs.org/)
- **SweetAlert2**: [MIT License](https://sweetalert2.github.io/)

---

## Support & Community 💬

- **GitHub Issues**: [Issues Tracker](https://github.com/cloud-barista/cb-mapui/issues)
- **Discussions**: [Community Discussions](https://github.com/cloud-barista/cb-tumblebug/discussions)
- **Slack Workspace**: Join the `#cb-mapui` channel in the [Cloud-Barista Slack](https://cloud-barista.slack.com)

---

**Made with ❤️ by the Cloud-Barista Community**
