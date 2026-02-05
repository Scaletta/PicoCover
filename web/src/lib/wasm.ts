import * as wasmModule from '../../pkg/pico_cover_wasm.js'

export type WasmModule = typeof wasmModule

export interface GameCode {
  code: string
  region: string
}

export interface CoverResult {
  gameCode: string
  coverData: Uint8Array
}

export interface ImageResult {
  bmpData: Uint8Array
  width: number
  height: number
}

/**
 * Initialize WASM module
 */
export async function initWasm(): Promise<WasmModule> {
  return wasmModule
}

/**
 * Extract game code from NDS file
 */
export async function extractGameCode(fileBytes: Uint8Array): Promise<string> {
  const wasm = await initWasm()
  return wasm.extract_game_code(fileBytes)
}

/**
 * Download cover for a game
 */
export async function downloadCover(gameCode: string, platform: 'nds' | 'gba'): Promise<Uint8Array> {
  const wasm = await initWasm()
  return wasm.download_cover(gameCode, platform)
}

/**
 * Process cover image (resize + convert to BMP) - async version for better concurrency
 */
export async function processCoverImageAsync(
  imageData: Uint8Array,
  width: number = 128,
  height: number = 96
): Promise<Uint8Array> {
  const wasm = await initWasm()
  return (wasm as any).process_cover_image_async(imageData, width, height)
}

/**
 * Process cover image (resize + convert to BMP) - sync version for backwards compatibility
 */
export async function processCoverImage(
  imageData: Uint8Array,
  width: number = 128,
  height: number = 96
): Promise<Uint8Array> {
  const wasm = await initWasm()
  return wasm.process_cover_image(imageData, width, height)
}
