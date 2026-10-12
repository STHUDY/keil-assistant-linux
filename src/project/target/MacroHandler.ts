/**
 * Parse ARMClang preprocessor output (e.g. `#define NAME value` lines)
 * into IntelliSense-style macro definitions.
 *
 * Examples:
 *   `#define __GNUC__ 4`        -> `__GNUC__=4`
 *   `#define __nop()`          -> `__nop()=`
 *   `#define MAX(a, b) ((a)>(b)?(a):(b))` -> `MAX(a, b)=`
 */
export class MacroHandler {
    private regMatchers = {
        'normal_macro': /^#define (\w+) (.*)$/,
        'func_macro': /^#define (\w+\([^)]*\)) (.*)$/
    };

    toExpression(macro: string): string | undefined {
        let mList = this.regMatchers['normal_macro'].exec(macro);
        if (mList && mList.length > 2) {
            return `${mList[1]}=${mList[2]}`;
        }

        mList = this.regMatchers['func_macro'].exec(macro);
        if (mList && mList.length > 2) {
            return `${mList[1]}=`;
        }

        return undefined;
    }
}
