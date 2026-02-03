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
export async function downloadCover(gameCode: string): Promise<Uint8Array> {
  const wasm = await initWasm()
  return wasm.download_cover(gameCode)
}

/**
 * Process cover image (resize + convert to BMP)
 */
export async function processCoverImage(
  imageData: Uint8Array,
  width: number = 128,
  height: number = 96
): Promise<Uint8Array> {
  const wasm = await initWasm()
  return wasm.process_cover_image(imageData, width, height)
}
