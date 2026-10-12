import * as os from 'os';

/**
 * Convert a Windows-style path (e.g. "C:\Keil_v5\UV4\UV4.exe") into the
 * corresponding Linux path inside the given Wine prefix
 * (e.g. "/home/user/.wine/drive_c/Keil_v5/UV4/UV4.exe").
 *
 * If the input is not a Windows path, it is returned with backslashes
 * replaced by forward slashes and otherwise unchanged.
 */
export function windowsPathToLinuxByWinePrefixPath(
    path: string,
    winePrefix: string
): string {
    if (!path) return "";

    const winPath = path.trim();
    let linuxPath = winPath.replace(/\\/g, "/");

    const driveMatch = linuxPath.match(/^([a-zA-Z]):(\/.*)?$/);
    if (driveMatch) {
        const driveLetter = driveMatch[1].toLowerCase();
        const pathRest = driveMatch[2] || "";

        // Expand leading ~ to the user's home directory
        let prefix = winePrefix;
        if (prefix.startsWith("~")) {
            prefix = prefix.replace("~", os.homedir());
        }

        linuxPath = prefix + `/drive_${driveLetter}${pathRest}`;
    }

    return linuxPath;
}
