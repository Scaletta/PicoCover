use pico_cover_core::game::GameCode;
use pico_cover_core::image_processing::ImageProcessor;
use wasm_bindgen::prelude::*;

#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
    web_sys::console::log_1(&"PicoCover WASM module loaded!".into());
}

/// Extract game code from NDS file header (reads bytes 0x0C-0x10)
#[wasm_bindgen]
pub fn extract_nds_game_code(file_bytes: &[u8]) -> std::result::Result<String, JsValue> {
    if file_bytes.len() < 16 {
        return Err(JsValue::from_str("File too small"));
    }

    let mut header = [0u8; 16];
    header.copy_from_slice(&file_bytes[0..16]);

    GameCode::from_nds_header(&header)
        .map(|code| code.to_string())
        .map_err(|e| JsValue::from_str(&format!("Invalid game code: {}", e)))
}

/// Extract game code from GBA file header (reads bytes 0xAC-0xB0)
#[wasm_bindgen]
pub fn extract_gba_game_code(file_bytes: &[u8]) -> std::result::Result<String, JsValue> {
    if file_bytes.len() < 0xB0 {
        return Err(JsValue::from_str("File too small"));
    }

    GameCode::from_gba_header(file_bytes)
        .map(|code| code.to_string())
        .map_err(|e| JsValue::from_str(&format!("Invalid game code: {}", e)))
}

/// Extract game code from either NDS or GBA file (auto-detects based on file extension)
/// This is kept for backwards compatibility with existing code
#[wasm_bindgen]
pub fn extract_game_code(file_bytes: &[u8]) -> std::result::Result<String, JsValue> {
    // Default to NDS for backwards compatibility
    extract_nds_game_code(file_bytes)
}

/// Process cover image: resize and convert to 8bpp BMP (async version)
#[wasm_bindgen]
pub async fn process_cover_image_async(
    image_data: &[u8],
    width: u32,
    height: u32,
) -> std::result::Result<Vec<u8>, JsValue> {
    // Yield to event loop for concurrency
    crate::yield_to_event_loop().await;

    ImageProcessor::process_cover(image_data, width, height)
        .map_err(|e| JsValue::from_str(&format!("Failed to process image: {}", e)))
}

/// Process cover image: resize and convert to 8bpp BMP (sync version for backwards compatibility)
#[wasm_bindgen]
pub fn process_cover_image(
    image_data: &[u8],
    width: u32,
    height: u32,
) -> std::result::Result<Vec<u8>, JsValue> {
    ImageProcessor::process_cover(image_data, width, height)
        .map_err(|e| JsValue::from_str(&format!("Failed to process image: {}", e)))
}

/// Helper function to yield to event loop for better concurrency
#[wasm_bindgen]
pub async fn yield_to_event_loop() {
    use wasm_bindgen_futures::JsFuture;
    let promise = js_sys::Promise::resolve(&JsValue::null());
    let _ = JsFuture::from(promise).await;
}

/// Download cover from PicoCover proxy
#[wasm_bindgen]
pub async fn download_cover(
    game_code: String,
    platform: String,
) -> std::result::Result<Vec<u8>, JsValue> {
    let base_url = if let Some(window) = web_sys::window() {
        if let Ok(location) = window.location().origin() {
            if location.contains("localhost") || location.contains("127.0.0.1") {
                "http://localhost:8787/"
            } else {
                "https://picocover.retrosave.games/"
            }
        } else {
            "https://picocover.retrosave.games/"
        }
    } else {
        "https://picocover.retrosave.games/"
    };
    let platform_lower = platform.to_lowercase();

    // Validate platform
    if !["nds", "gba"].contains(&platform_lower.as_str()) {
        return Err(JsValue::from_str(
            "Invalid platform. Must be 'nds' or 'gba'",
        ));
    }

    let url = format!("{}{}/{}", base_url, platform_lower, game_code);

    if let Ok(response) = gloo_net::http::Request::get(&url).send().await {
        if response.ok() {
            if let Ok(bytes) = response.binary().await {
                return Ok(bytes);
            }
        }
    }

    Err(JsValue::from_str("No cover found for this game"))
}
