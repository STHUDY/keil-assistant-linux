# Keil Assistant Linux

## 项目介绍

[keil-assistant-linux](https://github.com/STHUDY/keil-assistant-linux)

本项目立志于解决 Keil5 在 Linux 上的体验，可以不离开 vscode 完成代码的编写、编译和烧录。

支持三种 Keil 工具链：

- **ARM** (MDK, ARMCC v5 / ARMClang v6)
- **C51** (8051)
- **C251** (8051 增强)

## 原始简介

[keil-assistant-linux](https://github.com/ruiwarn/keil-assistant-linux)

## 项目实现

### 编译部分

采用 Wine 进行编译，需要先安装 **Keil 5** 和 **wine**。

构建会调用 `bin/Uv4Caller.exe`（一个轻量 Windows 包装器，它会再调用 Keil 的 `UV4.exe`），多核并行编译：

- ARM：使用所有可用 CPU 核心
- C51 / C251：最多 4 个核心

### 烧录部分

支持三种烧录器，可在 `KeilAssistantLinux.flash.device` 中选择：

| 设备 | 工具链 | 命令 |
|---|---|---|
| **ST-LINK V2** | ARM | `st-flash [--format ihex] write <hex-or-bin>`（需要 `stlink` 包） |
| **KEIL5 MDK** | ARM / C51 / C251 | 通过 `Uv4Caller.exe` 驱动 Keil 原生 `-f` 烧录流程，**不依赖** Linux 烧录工具 |
| **CMSIS DAP Link** | ARM / C51 / C251 | `openocd -f interface/cmsis-dap.cfg -f <target cfg> -c 'program ...'`（需要 `openocd`） |

## 使用方法

### 1. 安装 WineHQ

[WineHQ](https://www.winehq.org/)

```bash
# Arch / Manjaro
sudo pacman -S wine wine-mono wine-gecko winetricks

# Ubuntu / Debian
sudo dpkg --add-architecture i386
sudo apt update
sudo apt install -y wine64 wine32 winetricks
```

### 2. 配置 Wine

```bash
winetricks corefonts allfonts
```

### 3. 安装 Keil 5

[Keil 5](https://www.keil.com/download/product/)

```bash
wine MDK-ARM.exe   # 或 C51/C251 安装包
```

安装时建议把 Keil 装在 `C:\Keil_v5`（默认路径），这样扩展能自动找到 include 目录。

### 4. （可选）安装烧录工具

按需安装：

```bash
# ST-LINK V2
yay -S stlink               # Arch
sudo apt install stlink     # Ubuntu（部分发行版）

# CMSIS DAP Link
sudo apt install openocd
```

### 5. 在 VSCode 中配置扩展

按 `Ctrl+,` 打开设置，搜索 `KeilAssistantLinux`：

| 配置项 | 说明 |
|---|---|
| `Wine.Path` | `wine` 可执行文件路径（默认 `wine`） |
| `Wine.PrefixPath` | Wine prefix 目录（默认 `~/.wine`，**`~` 会被自动展开**） |
| `C51.Uv4Path` | C51 UV4.exe 路径（Wine 视角，如 `C:\Keil_v5\UV4\UV4.exe`） |
| `C251.Uv4Path` | C251 UV4.exe 路径 |
| `ARM.Uv4Path` | MDK UV4.exe 路径 |
| `Base.AutoReplacePath` | 是否把构建输出中的 `\` 替换为 `/`（默认开） |
| `Project.FileLocationList` | 自定义工程搜索目录 |
| `Project.ExcludeList` | 工程排除名单（默认 `template.uvproj[x]`） |
| `flash.device` | 烧录器类型（`ST-LINK V2` / `KEIL5 MDK` / `CMSIS DAP Link`） |
| `flash.st-flashPath` | `st-flash` 路径（默认 `st-flash`） |
| `flash.openocdPath` | `openocd` 路径（默认 `openocd`） |

### 6. 打开工程

点击 Keil uVision Project 视图的 **+** 按钮（或命令面板 `Keil: Open keil uVision project`），扩展会自动识别 C51 / C251 / ARM 工具链。

## 快捷键

| 快捷键 | 操作 |
|---|---|
| `F7` | Build |
| `Ctrl+Alt+F7` | Rebuild |
| `Ctrl+Alt+D` | Flash |

## 问题反馈

如有问题或建议，请通过 [GitHub Issues](https://github.com/STHUDY/keil-assistant-linux/issues) 反馈。

## 与原插件的不同

- 增加了 wine 设置和 Linux 上的路径修复（`~` 自动展开等）
- 增加了对 `st-flash` 的支持
- 增加了对 **KEIL5 MDK 原生烧录** 的支持（用 `Uv4Caller.exe` 包装 Keil `UV4.exe -f ...`）
- 增加了对 **CMSIS DAP Link / OpenOCD** 烧录的支持
- 多核并行编译
- 修复了激活时 `Class extends value undefined` 的崩溃
