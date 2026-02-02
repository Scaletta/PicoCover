/* @ts-self-types="./pico_cover_wasm.d.ts" */

import * as wasm from "./pico_cover_wasm_bg.wasm";
import { __wbg_set_wasm } from "./pico_cover_wasm_bg.js";
__wbg_set_wasm(wasm);
wasm.__wbindgen_start();
export {
    download_cover, extract_game_code, init, process_cover_image
} from "./pico_cover_wasm_bg.js";
