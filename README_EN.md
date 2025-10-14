# Keil Assistant New

## Project Introduce

[keil-assistant-linux]https://github.com/STHUDY/keil-assistant-linux

This Project aims to solve Keil5 in Linux, so that you can write、build and flash in vscode.

## Origin README

[keil-assistant](https://github.com/ruiwarn/keil-assistant)

## Project Make

### Build Part

Use wine to build, you need install keil5 and wine

### Flash Part

Only support flash in ST-Link V2
(need to install st-link-cli)

Use commands
```
st-flash write <file> // .bin
st-flash --format ihex write <file> // .hex
```

## Project Use

### Install WineHQ
[WineHQ](https://www.winehq.org/)

### Configure WineHQ

#### Use winetricks

Install
[winetricks](https://github.com/Winetricks/winetricks)

Open terminal and run
```
wine
winetricks corefonts allfonts
```

### Install Keil5
[Keil5](https://www.keil.com/download/product/)

Open terminal and run
```
wine MDK-ARM.exe
```

### Install st-flash

[st-flash](https://github.com/stlink-org/stlink)

## Issue Reporting

For any issues or suggestions, please report via GitHub Issues.