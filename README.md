# Keil Assistant Linux

## 项目介绍

[keil-assistant-linux]https://github.com/STHUDY/keil-assistant-linux

本项目立志于解决Keil5在Linux上的体验，可以不离开vscode完成代码的编写、编译和烧录。

## 原始简介

[keil-assistant](https://github.com/ruiwarn/keil-assistant)

## 项目实现

### 编译部分

采用Wine进行编译，你需要先安装keil5 和 wine

### 烧录部分

目前仅仅支持ARM ST-Link V2 烧录
（需要安装st-link-cli）

采用命令
```
st-flash write <file> // .bin
st-flash --format ihex write <file> // .hex
```

## 使用方法

### 安装WineHQ
[WineHQ](https://www.winehq.org/)

### 配置Wine

### 安装wine-momo

当你第一次运行 winecfg 或创建新的 Wine 前缀（~/.wine）时，Wine 会提示你安装 Wine Mono。

如果编译没有文件显示或者没有输出，请检查你的wine-momo是否安装

[wine-momo](https://github.com/wine-mono/wine-mono/releases)

#### 使用winetricks

安装
[winetricks](https://github.com/Winetricks/winetricks)

打开终端执行
```
wine
winetricks corefonts allfonts
```

### 安装Keil5
[Keil5](https://www.keil.com/download/product/)

打开终端执行 
```
wine MDK-ARM.exe
```

### 安装st-flash

[st-flash](https://github.com/stlink-org/stlink)

## 问题反馈

如有问题或建议，请通过 GitHub Issues 反馈。
