/* tslint:disable */
/* eslint-disable */

/**
 * Download cover from PicoCover proxy
 */
export function download_cover(game_code: string, platform: string): Promise<Uint8Array>;

/**
 * Extract game code from either NDS or GBA file (auto-detects based on file extension)
 * This is kept for backwards compatibility with existing code
 */
export function extract_game_code(file_bytes: Uint8Array): string;

/**
 * Extract game code from GBA file header (reads bytes 0xAC-0xB0)
 */
export function extract_gba_game_code(file_bytes: Uint8Array): string;

/**
 * Extract game code from NDS file header (reads bytes 0x0C-0x10)
 */
export function extract_nds_game_code(file_bytes: Uint8Array): string;

export function init(): void;

/**
 * Process cover image: resize and convert to 8bpp BMP (sync version for backwards compatibility)
 */
export function process_cover_image(image_data: Uint8Array, width: number, height: number): Uint8Array;

/**
 * Process cover image: resize and convert to 8bpp BMP (async version)
 */
export function process_cover_image_async(image_data: Uint8Array, width: number, height: number): Promise<Uint8Array>;

/**
 * Helper function to yield to event loop for better concurrency
 */
export function yield_to_event_loop(): Promise<void>;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly download_cover: (a: number, b: number, c: number, d: number) => any;
    readonly extract_game_code: (a: number, b: number) => [number, number, number, number];
    readonly extract_gba_game_code: (a: number, b: number) => [number, number, number, number];
    readonly extract_nds_game_code: (a: number, b: number) => [number, number, number, number];
    readonly init: () => void;
    readonly process_cover_image: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly process_cover_image_async: (a: number, b: number, c: number, d: number) => any;
    readonly yield_to_event_loop: () => any;
    readonly wasm_bindgen__closure__destroy__h6b42acf6049c0920: (a: number, b: number) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h52e09fbcd076dc54: (a: number, b: number, c: any, d: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h50a34ab49655f4b1: (a: number, b: number, c: any) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
