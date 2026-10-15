# Home NAS Panel (家庭 NAS 控制面板)

[![Go Report Card](https://goreportcard.com/badge/github.com/evalexp/home-nas-panel)](https://goreportcard.com/report/github.com/evalexp/home-nas-panel)
[![License](https://img.shields.io/github/license/evalexp/home-nas-panel)](LICENSE)

基于 **Go (Gin) + SQLite + React 19 + Tailwind CSS + PWA** 构建的高性能家庭控制面板。为家庭私有云环境量身打造，聚合常用内网服务卡片导航、Proxmox VE 宿主机与虚拟机管控、OpenWrt 远程网络唤醒（WOL）以及 Passkey 免密生物识别登录。

---

## 🌟 核心特性

### 1. 卡片组件化服务导航面板 (Nav Cards)
- **分类服务卡片**：内网服务（Jellyfin、OpenWrt、qBittorrent、Portainer、Immich 等）分类分组展示与即点即达。
- **图标自定义**：支持主流内置服务图标，并提供自定义 SVG / 图像图标上传与管理。
- **自定义管理**：支持卡片增删改查、排序及分组筛选。

### 2. Proxmox VE 虚拟化管控 (PVE Management)
- **实时资源监控**：通过官方 API Token 安全对接，直观展示 CPU 占用率、内存分配、硬盘使用以及运行时长。
- **VM / LXC 容器电源控制**：一览所有虚拟机与 LXC 容器运行状态，支持一键开机、关机与重启。
- **宿主机电源安全操作**：提供带有防误触二次确认弹窗的宿主机安全关机与重启。
- **顶栏状态实时徽标**：右上角提供呼吸灯状态徽标（在线/停机），支持 10 秒静默后台轮询与点击即时刷新。

### 3. WOL 控制中心与局域网网络唤醒 (WOL Control)
- **多设备管理**：集中管理局域网所有支持网络唤醒的物理机器，记录机器名称与网卡 MAC 地址，支持一键开机唤醒与 MAC 快捷复制。
- **自定义 HTTP 报文模板**：支持配置控制网关域名/IP、端口、TLS 状态与证书跳过，支持直接上传原始 HTTP 报文模板（使用 `{mac}` 作为物理地址占位符，以原生 UTF-8 字节读取并支持回车换行等不可见字符可视化核验预览）。
- **PVE 宿主机联动绑定**：在系统设置的 PVE 配置中可直接从 WOL 设备列表中选择绑定宿主机，实现状态页一键开机唤醒。

> 建议使用 [https://github.com/evalexp/openwrt-wol-webhook](https://github.com/evalexp/openwrt-wol-webhook)

### 4. 现代安全认证 (Passkey & Password)
- **WebAuthn / FIDO2 生物识别**：支持 MacBook Touch ID、Windows Hello、iPhone Face ID/Touch ID 以及 KeePassXC、1Password 等通用 Passkey 管理器一键免密秒级登录。
- **密码兜底机制**：管理员密码经过 bcrypt 强哈希存储，作为传统应急登录方式。
- **单用户极简初始化**：初次启动自动进入引导设置，无繁琐注册流程。

### 5. PWA 移动端与桌面全适配
- 支持“添加到主屏幕”，具备独立 App 全屏沉浸运行模式、Web App Manifest 与 Service Worker 资源缓存。

### 6. 轻量单二进制 & 零 CGO 依赖
- 后端采用纯 Go 实现的 SQLite 驱动，无 CGO 依赖，交叉编译与容器镜像极致轻量。

---

## 🚀 快速启动

### 方式一：Docker Compose 部署 (推荐)

创建 `docker-compose.yml`：

```yaml
services:
  home-nas-panel:
    image: evalexp/home-nas-panel:latest
    container_name: home-nas-panel
    restart: unless-stopped
    ports:
      - "8080:8080"
    volumes:
      - ./data:/app/data
    environment:
      - PORT=8080
      - DB_PATH=/app/data/nas_panel.db
      - TZ=Asia/Shanghai
      - WEBAUTHN_RP_NAME=Home NAS Panel
      # - WEBAUTHN_RP_ID=nas.local # 如果使用特定局域网域名访问可显式指定
```

启动容器：
```bash
docker compose up -d
```
访问浏览器：`http://<NAS_IP>:8080`

---

### 方式二：直接运行预编译二进制文件

```bash
# 启动服务 (默认监听 8080 端口，自动提供前端静态文件与 API)
./dist/nas-panel
```
访问浏览器：`http://localhost:8080`

---

### 方式三：开发模式启动 (前后端热重载)

**1. 启动后端 API：**
```bash
go run cmd/server/main.go
```

**2. 启动前端开发服务器：**
```bash
cd frontend
npm install
npm run dev
```
访问前端开发服务器：`http://localhost:5173`（API 请求自动反向代理至后端的 `:8080`）。

---

## 🛠️ 本地构建

### 构建前端
```bash
cd frontend
npm install
npm run build
```

### 构建后端二进制
```bash
go build -ldflags="-w -s" -o dist/nas-panel cmd/server/main.go
```

### 构建 Docker 镜像
```bash
docker build -t home-nas-panel .
```

---

## ⚙️ 环境变量说明

| 环境变量 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `PORT` | `8080` | 服务监听端口 |
| `DB_PATH` | `nas_panel.db` | SQLite 数据库文件存放路径 |
| `JWT_SECRET` | 动态随机生成 (256位) | JWT 令牌签名秘钥（未提供时启动自动生成 256 位强随机密钥；如需重启持久化保持登录态可自定义配置） |
| `WEBAUTHN_RP_ID` | `localhost` | Passkey 凭证绑定的有效域名，若通过内网域名访问建议配置 |
| `WEBAUTHN_RP_NAME` | `Home NAS Panel` | Passkey 凭证提示的应用显示名称 |

---

## 📄 License

MIT License
