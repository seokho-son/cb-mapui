# Cloud-Barista 👋
# CB-MapUI (Visual Multi-Cloud Infrastructure Dashboard)

[![License](https://img.shields.io/github/license/cloud-barista/cb-mapui?color=blue)](https://github.com/cloud-barista/cb-mapui/blob/main/LICENSE)
[![Release Version](https://img.shields.io/github/v/release/cloud-barista/cb-mapui?color=blue)](https://github.com/cloud-barista/cb-mapui/releases/latest)
[![Build Status](https://img.shields.io/github/actions/workflow/status/cloud-barista/cb-mapui/docker-image.yml)](https://github.com/cloud-barista/cb-mapui/actions)

## What is CB-MapUI? ✨

**CB-MapUI** is an **interactive visual dashboard** for [CB-Tumblebug](https://github.com/cloud-barista/cb-tumblebug) that provides intuitive map-based and dashboard-style interfaces for managing multi-cloud infrastructure. Part of the Cloud-Barista project, CB-MapUI transforms complex multi-cloud operations into visual, easy-to-understand interactions.

### 🎯 Key Features

- **🗺️ Interactive Map View**: Geographic visualization of multi-cloud infrastructure with real-time status
- **📊 Dashboard View**: Traditional dashboard with statistics, charts, and tabular resource management
- **🛠️ API Explorer**: Built-in Swagger UI for CB-Tumblebug REST API testing and documentation
- **🌐 Multi-Cloud Support**: Unified interface for AWS, Azure, GCP, Alibaba Cloud, and more
- **⚡ Real-time Monitoring**: Automatic refresh with live infrastructure status updates
- **🎮 Interactive Controls**: Point-and-click resource creation, lifecycle management, and monitoring

---

<details>
<summary>📋 Development Status & Notes</summary>

### 🚧 Development Status
CB-MapUI is actively developed for demonstration and testing purposes. Please note:
- **Not production-ready**: Use in development/testing environments only
- **Prototype quality**: Contains experimental code patterns for rapid feature development
- **OpenLayers integration**: Built on OpenLayers with optimized rendering logic

### 🤝 Contributing
We welcome contributions! Please check our [CB-Tumblebug Contributing Guide](https://github.com/cloud-barista/cb-tumblebug/blob/main/CONTRIBUTING.md) for general guidelines.

</details>

---

## Table of Contents

1. [⚡ Quick Start](#quick-start-)
2. [🔧 Prerequisites](#prerequisites-)
3. [🚀 Installation & Setup](#installation--setup-)
4. [🌟 Features & Usage](#features--usage-)
5. [🏗️ Architecture](#architecture-%EF%B8%8F)
6. [🐳 Docker Deployment](#docker-deployment-)

---

## Quick Start ⚡

**🚀 Recommended: Deploy with CB-Tumblebug (Easiest Method)**

CB-MapUI is automatically included when you run CB-Tumblebug via Docker Compose. This is the **easiest and recommended** way to get started:

```bash
# 1. Download CB-Tumblebug (includes CB-MapUI)
curl -sSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/set-tb.sh | bash

# 2. Navigate to CB-Tumblebug directory
cd ~/go/src/github.com/cloud-barista/cb-tumblebug

# 3. Start all services (CB-Tumblebug + CB-MapUI + dependencies)
make up

# 4. Configure credentials
make gen-cred
# Edit ~/.cloud-barista/credentials.yaml with your cloud credentials
make enc-cred
make init

# 5. Access CB-MapUI at http://localhost:1324
# - CB-Tumblebug API: http://localhost:1323/tumblebug/api
# - CB-MapUI: http://localhost:1324
```

> 💡 **Why this method?** You get CB-Tumblebug backend + CB-MapUI frontend + all dependencies (ETCD, PostgreSQL, CB-Spider) in one command!

<details>
<summary><b>Alternative: Standalone CB-MapUI Installation</b></summary>

If you only want to run CB-MapUI (requires existing CB-Tumblebug instance):

```bash
# 1. Clone repository
git clone https://github.com/cloud-barista/cb-mapui.git
cd cb-mapui

# 2. Install dependencies
npm install

# 3. Build and start
npm run build
npm start

# 4. Access UI at http://localhost:1324
```

</details>

---

## Prerequisites 🔧

### System Requirements

| Component | Version | Purpose |
|-----------|---------|---------|
| **Node.js** | 16.x or 18.x | Runtime environment |
| **npm** | 8.x+ | Package management |
| **CB-Tumblebug** | Latest | Backend API server |

### Required Software

- **Node.js & npm**: [Installation Guide](https://github.com/nodesource/distributions)
- **CB-Tumblebug**: [Setup Instructions](https://github.com/cloud-barista/cb-tumblebug#installation--setup-)

---

## Installation & Setup 🚀

### Option 1: Docker Compose with CB-Tumblebug (Recommended)

**🎯 This is the easiest and most reliable way to run CB-MapUI with all dependencies.**

CB-MapUI is automatically deployed when using CB-Tumblebug's Docker Compose setup. You get:
- ✅ CB-Tumblebug (Backend API)
- ✅ CB-MapUI (Frontend Dashboard)
- ✅ CB-Spider (Cloud Driver Interface)
- ✅ ETCD (Metadata Store)
- ✅ PostgreSQL (Data Storage)

#### Quick Setup with Docker Compose

```bash
# 1. Automated setup (installs Docker, dependencies, and CB-Tumblebug)
curl -sSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/set-tb.sh | bash

# 2. Start all services
cd ~/go/src/github.com/cloud-barista/cb-tumblebug
make up

# 3. Initialize with cloud credentials
make gen-cred
# Edit ~/.cloud-barista/credentials.yaml with your cloud provider credentials
make enc-cred
make init
```

**Access Points:**
- **CB-MapUI**: <http://localhost:1324>
- **CB-Tumblebug API**: <http://localhost:1323/tumblebug/api>
- **API Documentation**: <http://localhost:1323/tumblebug/api>

**Managing Services:**
```bash
# Stop all services
make down

# View logs
docker compose logs -f cb-mapui

# Restart specific service
docker compose restart cb-mapui
```

> 📖 **Detailed Guide**: See [CB-Tumblebug Installation Guide](https://github.com/cloud-barista/cb-tumblebug#installation--setup-) for comprehensive setup instructions.

---

### Option 2: Standalone Installation

#### Step 1: Install Node.js (Ubuntu/Debian example)

```bash
# Update system
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg

# Add NodeSource repository
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | \
  sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg

# Install Node.js 18.x
NODE_MAJOR=18
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" | \
  sudo tee /etc/apt/sources.list.d/nodesource.list

sudo apt-get update
sudo apt-get install nodejs -y

# Verify installation
node -v  # Should show v18.x.x
npm -v   # Should show 8.x.x or higher
```

#### Step 2: Clone and Install CB-MapUI

```bash
# Clone repository
git clone https://github.com/cloud-barista/cb-mapui.git
cd cb-mapui

# Install dependencies (includes OpenLayers, Parcel, and all required packages)
npm install
```

#### Step 3: Build and Run

```bash
# Build static assets
npm run build

# Start development server
npm start
```

**Expected Output:**
```
Server running at http://0.0.0.0:1324
✨ Built in 6.32s

Access at: http://localhost:1324
```

#### Step 4: Access CB-MapUI

Open your web browser and navigate to:
- **Local**: <http://localhost:1324>
- **Remote**: <http://your-server-ip:1324>

![CB-MapUI Interface](https://github.com/cloud-barista/cb-mapui/assets/5966944/2423fbcd-0fdb-4511-85e2-488ba15ae8c0)

**⚠️ Note**: This method requires a separately running CB-Tumblebug instance. For most users, **Option 1 (Docker Compose)** is recommended.

---

## Features & Usage 🌟

CB-MapUI provides three main interfaces for managing multi-cloud infrastructure:

### 1. 🗺️ Map View

**Geographic visualization of multi-cloud infrastructure**

- **Interactive Map**: Click on the map to select deployment locations
- **Visual MCI Polygons**: Multi-Cloud Infrastructure displayed as geographic polygons
- **Real-time Status**: Color-coded VM status indicators
- **Location-based Provisioning**: Click map locations for intelligent VM recommendations
- **Lifecycle Management**: Control VMs directly from map interface

**Use Cases:**
- Geographic distribution analysis
- Regional compliance planning
- Latency-optimized deployments
- Visual infrastructure overview

**Access:** Click `🗺️ Map View` button from the main interface

---

### 2. 📊 Dashboard View

**Traditional dashboard with comprehensive statistics and controls**

**Features:**
- **Statistics Cards**: Real-time infrastructure metrics
  - Total MCIs, VMs, Kubernetes clusters
  - Status distribution (Running, Failed, Suspended)
  - Resource counts (vNets, Security Groups, SSH Keys)
  
- **Interactive Charts**:
  - Combined status overview (MCI + VM + K8s)
  - Provider and region distribution
  - Kubernetes cluster and node group status
  
- **Resource Tables**:
  - MCI/VM management with inline controls
  - Kubernetes cluster and node group operations
  - Network resources (vNet, Security Groups, SSH Keys)
  - Custom images and data disks
  - VPN connections and object storage
  
- **Auto-refresh**: Configurable automatic data updates
- **Bulk Operations**: Multi-select resource management
- **Advanced Filtering**: Search and sort capabilities

**Use Cases:**
- Daily operations and monitoring
- Resource inventory management
- Quick status checks across clouds
- Detailed resource configuration review

**Access:** Click `📊 MC Dashboard` button from the main interface

---

### 3. 🛠️ API Explorer

**Built-in Swagger UI for CB-Tumblebug REST API**

- **Interactive API Documentation**: Test all CB-Tumblebug endpoints
- **Request Builder**: Generate API calls with syntax highlighting
- **Response Viewer**: Formatted JSON responses
- **Authentication**: Built-in BasicAuth support

**Use Cases:**
- API testing and development
- Integration planning
- Troubleshooting API issues
- Learning CB-Tumblebug API structure

**Access:** Click `🛠️ TB API` button from the main interface

---

## Configuration ⚙️

### Initial Setup

When you first access CB-MapUI, configure the connection settings:

| Setting | Default | Description |
|---------|---------|-------------|
| **TB Hostname** | `localhost` | CB-Tumblebug API server address |
| **TB Port** | `1323` | CB-Tumblebug API port |
| **TB Username** | `default` | BasicAuth username |
| **TB Password** | `default` | BasicAuth password |
| **Namespace ID** | `default` | Target namespace for operations |
| **Display Interval** | `10` seconds | Auto-refresh interval |

> 💡 **Auto-detection**: TB Hostname is automatically set to match your browser's address

### Creating Your First MCI

1. **Navigate to Map View** or **Dashboard View**
2. **Click "Create MCI"** button
3. **Configure MCI**:
   - Select recommendation policy (location-based, cost, performance)
   - For location-based: Click desired regions on the map
   - Review recommended VM specifications
   - Customize VM configurations as needed
4. **Submit**: Review final configuration and create
5. **Monitor**: Track creation progress in real-time

---

## Architecture 🏗️

### Core Components

```
CB-MapUI Architecture
│
├── 🖥️ Frontend (Browser)
│   ├── index.html          # Main entry point
│   ├── index.js            # Map view logic (OpenLayers)
│   ├── dashboard.html      # Dashboard view
│   ├── dashboard.js        # Dashboard logic
│   └── swagger.html        # API explorer
│
├── 📦 Dependencies
│   ├── OpenLayers         # Map rendering
│   ├── Chart.js           # Dashboard charts
│   ├── DataTables         # Tabular data
│   ├── SweetAlert2        # Modals and alerts
│   └── Bootstrap 4        # UI framework
│
└── 🔌 Backend Integration
    └── CB-Tumblebug API   # REST API calls
```

### How It Works

**Map View Rendering Cycle:**

1. **API Polling**: Periodically fetch MCI/VM data from CB-Tumblebug
2. **Geolocation Parsing**: Extract VM geographic coordinates (longitude, latitude)
3. **Convex Hull Generation**: Group VMs into MCI polygons
4. **Map Rendering**: Draw polygons on OpenLayers map with status indicators
5. **Event Handling**: Capture user interactions for resource management

**Key Implementation Details:**

- **`index.js`**: Core logic using OpenLayers for map operations
  - `getMci()`: Fetches MCI and VM information via REST API
  - `tileLayer.on('postrender')`: OpenLayers rendering loop for polygon updates
  - Real-time status synchronization with visual indicators
  
- **`dashboard.js`**: Dashboard view with centralized data store
  - Shared data model with Map View for consistency
  - Chart.js integration for visualization
  - DataTables for advanced table functionality

---

## Docker Deployment 🐳

### Integrated Deployment (Recommended)

**CB-MapUI is included in CB-Tumblebug's Docker Compose stack.**

The official `docker-compose.yaml` includes CB-MapUI with proper networking:

```yaml
services:
  cb-mapui:
    image: cloudbaristaorg/cb-mapui:latest
    container_name: cb-mapui
    ports:
      - "1324:1324"
    networks:
      - external_network
    depends_on:
      - cb-tumblebug
```

**Deploy the complete stack:**
```bash
# Clone CB-Tumblebug (includes CB-MapUI configuration)
git clone https://github.com/cloud-barista/cb-tumblebug.git
cd cb-tumblebug

# Start all services
make up

# CB-MapUI automatically starts at http://localhost:1324
```

---

### Standalone Docker Container

For development or testing purposes only:

```bash
# Build image
docker build -t cb-mapui:latest .

# Run container (requires external CB-Tumblebug instance)
docker run -d \
  --name cb-mapui \
  -p 1324:1324 \
  cb-mapui:latest

# Access at http://localhost:1324
```

> ⚠️ **Note**: Standalone container requires manual configuration to connect to CB-Tumblebug.

---

## Troubleshooting 🔧

### Common Issues

**Issue: Cannot connect to CB-Tumblebug**
```
Solution:
1. Verify CB-Tumblebug is running: curl http://localhost:1323/tumblebug/readyz
2. Check firewall rules allow port 1323
3. Update TB Hostname/Port in CB-MapUI settings
```

**Issue: Map not rendering**
```
Solution:
1. Check browser console for JavaScript errors
2. Verify OpenLayers loaded: Check network tab
3. Try clearing browser cache and reload
```

**Issue: Slow performance with many VMs**
```
Solution:
1. Increase display interval in settings (e.g., 30 seconds)
2. Filter by specific namespace
3. Use Dashboard View for large-scale environments
```

---

## Development 🛠️

### Building from Source

```bash
# Clone repository
git clone https://github.com/cloud-barista/cb-mapui.git
cd cb-mapui

# Install dependencies
npm install

# Development mode (with hot reload)
npm run dev

# Production build
npm run build

# Run tests (if available)
npm test
```

### Project Structure

```
cb-mapui/
├── index.html              # Main HTML entry
├── index.js                # Map view logic
├── dashboard.html          # Dashboard HTML
├── dashboard.js            # Dashboard logic
├── swagger.html            # API explorer
├── package.json            # Dependencies
├── Dockerfile              # Container definition
└── img/                    # Static assets
    ├── aws.png
    ├── azure.png
    ├── gcp.png
    └── ...
```

---

## Related Projects 🔗

- **[CB-Tumblebug](https://github.com/cloud-barista/cb-tumblebug)**: Multi-cloud infrastructure management framework
- **[CB-Spider](https://github.com/cloud-barista/cb-spider)**: Cloud driver interface
- **[Cloud-Barista](https://github.com/cloud-barista)**: Multi-cloud platform initiative

---

## License 📄

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

**Third-party Licenses:**
- OpenLayers: BSD 2-Clause License
- Other dependencies: See `package.json` for details

---

## Contributors ✨

Thanks to all contributors who have helped build CB-MapUI!

See the [CB-Tumblebug Contributors](https://github.com/cloud-barista/cb-tumblebug#contributors-) page for the full list of Cloud-Barista contributors.

---

## Support & Community 💬

- **Issues**: [GitHub Issues](https://github.com/cloud-barista/cb-mapui/issues)
- **Discussions**: [CB-Tumblebug Discussions](https://github.com/cloud-barista/cb-tumblebug/discussions)
- **Slack**: [Cloud-Barista Workspace](https://cloud-barista.slack.com)

---

**Made with ❤️ by the Cloud-Barista Community**
