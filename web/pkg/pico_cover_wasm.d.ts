/* tslint:disable */
/* eslint-disable */

/**
 * Download cover from PicoCover proxy
 */
export function download_cover(game_code: string): Promise<Uint8Array>;

/**
 * Extract game code from NDS file header (reads bytes 0x0C-0x10)
 */
export function extract_game_code(file_bytes: Uint8Array): string;

export function init(): void;

/**
 * Process cover image: resize and convert to 8bpp BMP
 */
export function process_cover_image(image_data: Uint8Array, width: number, height: number): Uint8Array;
