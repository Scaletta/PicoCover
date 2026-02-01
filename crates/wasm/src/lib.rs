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
pub fn extract_game_code(file_bytes: &[u8]) -> std::result::Result<String, JsValue> {
    if file_bytes.len() < 16 {
        return Err(JsValue::from_str("File too small"));
    }

    let mut header = [0u8; 16];
    header.copy_from_slice(&file_bytes[0..16]);

    GameCode::from_nds_header(&header)
        .map(|code| code.to_string())
        .map_err(|e| JsValue::from_str(&format!("Invalid game code: {}", e)))
}

/// Process cover image: resize and convert to 8bpp BMP
#[wasm_bindgen]
pub fn process_cover_image(
    image_data: &[u8],
    width: u32,
    height: u32,
) -> std::result::Result<Vec<u8>, JsValue> {
    ImageProcessor::process_cover(image_data, width, height)
        .map_err(|e| JsValue::from_str(&format!("Failed to process image: {}", e)))
}

/// Download cover from GameTDB API
#[wasm_bindgen]
pub async fn download_cover(game_code: String) -> std::result::Result<Vec<u8>, JsValue> {
    let regions = vec!["EN", "US", "JA", "EU"];
    let url_templates = vec![
        "https://art.gametdb.com/ds/cover/{region}/{id}.png",
        "https://art.gametdb.com/ds/cover/{region}/{id}.jpg",
    ];

    for region in &regions {
        for template in &url_templates {
            let url = template
                .replace("{region}", region)
                .replace("{id}", &game_code);

            if let Ok(response) = gloo_net::http::Request::get(&url).send().await {
                if response.ok() {
                    if let Ok(bytes) = response.binary().await {
                        return Ok(bytes);
                    }
                }
            }
        }
    }

    Err(JsValue::from_str("No cover found for this game"))
}
