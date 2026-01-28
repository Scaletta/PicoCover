use std::fs::File;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::{Arc, Mutex};

use anyhow::{Context, Result};
use color_quant::NeuQuant;
use image::imageops::{FilterType, replace, resize};
use image::{DynamicImage, ImageBuffer, Rgba};
use rayon::prelude::*;
use reqwest::blocking::Client;
use walkdir::WalkDir;

use crate::Config;

#[derive(Default, Clone)]
pub struct ProcessStats {
    pub processed: u32,
    pub saved: u32,
    pub skipped: u32,
    pub errors: u32,
    pub skipped_games: Vec<String>,
    pub failed_games: Vec<String>,
}

pub fn process_root(config: &Config, log: impl Fn(String) + Send + Sync) -> Result<ProcessStats> {
    let client = Client::builder()
        .user_agent("pico-cover/0.1")
        .timeout(std::time::Duration::from_secs(config.timeout_secs))
        .build()
        .context("Building HTTP client")?;

    let output_dir = config.root.join("_pico/covers/nds");
    std::fs::create_dir_all(&output_dir).context("Creating output directory")?;

    let stats = Arc::new(Mutex::new(ProcessStats::default()));
    let skipped_games = Arc::new(Mutex::new(Vec::new()));
    let failed_games = Arc::new(Mutex::new(Vec::new()));
    let log = Arc::new(log);
    let client = Arc::new(client);
    let config = Arc::new(config.clone());
    let output_dir = Arc::new(output_dir);
    let skipped_games_clone = Arc::clone(&skipped_games);
    let failed_games_clone = Arc::clone(&failed_games);

    // Collect all NDS files first
    let mut nds_files = Vec::new();
    for entry in WalkDir::new(&config.root)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if !entry.file_type().is_file() {
            continue;
        }

        let path = entry.path();
        if !is_nds(path) {
            continue;
        }

        nds_files.push(path.to_path_buf());
    }

    // Process files in parallel with thread pool sized to CPU cores (or custom count)
    let num_threads = config.threads.unwrap_or_else(num_cpus::get);
    rayon::ThreadPoolBuilder::new()
        .num_threads(num_threads)
        .build()
        .context("Building thread pool")?
        .install(|| {
            nds_files.par_iter().for_each(|path| {
                let game_name = path
                    .file_stem()
                    .and_then(|n| n.to_str())
                    .unwrap_or("Unknown")
                    .to_string();

                {
                    let mut stats = stats.lock().unwrap();
                    stats.processed += 1;
                }

                match handle_file(path, &output_dir, &config, &client, &log) {
                    Ok(true) => {
                        let mut stats = stats.lock().unwrap();
                        stats.saved += 1;
                    }
                    Ok(false) => {
                        let mut stats = stats.lock().unwrap();
                        stats.skipped += 1;
                        let mut skipped = skipped_games_clone.lock().unwrap();
                        skipped.push(game_name);
                    }
                    Err(err) => {
                        let mut stats = stats.lock().unwrap();
                        stats.errors += 1;
                        let mut failed = failed_games_clone.lock().unwrap();
                        failed.push(game_name);
                        log(format!("❌ Error {}: {}", path.display(), err));
                    }
                }
            });
        });

    let mut final_stats = stats.lock().unwrap().clone();
    final_stats.skipped_games = skipped_games.lock().unwrap().clone();
    final_stats.failed_games = failed_games.lock().unwrap().clone();
    Ok(final_stats)
}

fn is_nds(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| matches_ignore_ascii_case(ext, "nds"))
        .unwrap_or(false)
}

fn matches_ignore_ascii_case(value: &str, needle: &str) -> bool {
    value.len() == needle.len()
        && value
            .chars()
            .zip(needle.chars())
            .all(|(a, b)| a.eq_ignore_ascii_case(&b))
}

fn handle_file(
    path: &Path,
    output_dir: &Path,
    config: &Config,
    client: &Client,
    log: &Arc<impl Fn(String) + Send + Sync + ?Sized>,
) -> Result<bool> {
    let game_code = match read_game_code(path)? {
        Some(code) => code,
        None => return Ok(false),
    };

    let game_name = path
        .file_stem()
        .and_then(|n| n.to_str())
        .unwrap_or("Unknown");

    let target = output_dir.join(format!("{game_code}.bmp"));
    if target.exists() && !config.overwrite {
        log(format!(
            "⏭ Skipped {} [{}] - already exists",
            game_name, game_code
        ));
        return Ok(false);
    }

    let image = match fetch_cover(
        &game_code,
        game_name,
        &config.regions,
        &config.url_templates,
        client,
        log,
    ) {
        Some(img) => img,
        None => {
            log(format!(
                "❌ Not found {} [{}] - no covers available",
                game_name, game_code
            ));
            return Ok(false);
        }
    };

    let bmp_bytes = render_cover_bmp(image).context("rendering BMP")?;
    let mut file = File::create(&target).context("creating output file")?;
    file.write_all(&bmp_bytes).context("writing BMP")?;
    log(format!("💾 Stored {} [{}]", game_name, game_code));
    Ok(true)
}

fn read_game_code(path: &Path) -> Result<Option<String>> {
    let mut file = File::open(path).context("opening NDS file")?;
    let mut header = [0u8; 16];
    if let Err(err) = file.read_exact(&mut header) {
        if err.kind() == std::io::ErrorKind::UnexpectedEof {
            return Ok(None);
        }
        return Err(err).context("reading NDS header");
    }

    let code_bytes = &header[0x0C..0x10];
    if !code_bytes.iter().all(|b| b.is_ascii_alphanumeric()) {
        return Ok(None);
    }

    let code = String::from_utf8_lossy(code_bytes).to_string();
    Ok(Some(code))
}

fn fetch_cover(
    game_code: &str,
    game_name: &str,
    regions: &[String],
    templates: &[String],
    client: &Client,
    log: &Arc<impl Fn(String) + Send + Sync + ?Sized>,
) -> Option<DynamicImage> {
    for region in regions {
        log(format!(
            "🔍 Checking {} [{}] - {}",
            game_name, game_code, region
        ));
        for template in templates {
            let url = template
                .replace("{region}", region)
                .replace("{id}", game_code);
            match client.get(&url).send() {
                Ok(resp) if resp.status().is_success() => match resp.bytes() {
                    Ok(bytes) => match image::load_from_memory(&bytes) {
                        Ok(img) => {
                            log(format!(
                                "✅ Found {} [{}] - {}",
                                game_name, game_code, region
                            ));
                            return Some(img);
                        }
                        Err(_) => {
                            // Skip invalid image, try next URL
                        }
                    },
                    Err(_) => {
                        // Skip read error, try next URL
                    }
                },
                Ok(resp) if resp.status().as_u16() == 404 => {
                    // 404 is expected, skip to next template
                }
                Ok(_resp) => {
                    // Other HTTP errors, skip to next template
                }
                Err(_) => {
                    // Network error, skip to next template
                }
            }
        }
    }

    None
}

fn render_cover_bmp(image: DynamicImage) -> Result<Vec<u8>> {
    let source = image.to_rgba8();
    let resized = resize(&source, 106, 96, FilterType::Lanczos3);

    let mut canvas: ImageBuffer<Rgba<u8>, Vec<u8>> =
        ImageBuffer::from_pixel(128, 96, Rgba([0, 0, 0, 255]));
    replace(&mut canvas, &resized, 0, 0);

    let rgba_data: Vec<u8> = canvas
        .pixels()
        .flat_map(|p| [p[0], p[1], p[2], p[3]])
        .collect();

    let quantizer = NeuQuant::new(10, 256, &rgba_data);
    let palette = quantizer.color_map_rgb();

    let mut indices = Vec::with_capacity(128 * 96);
    for chunk in rgba_data.chunks(4) {
        indices.push(quantizer.index_of(chunk) as u8);
    }

    Ok(write_paletted_bmp(128, 96, &palette, &indices))
}

fn write_paletted_bmp(width: u32, height: u32, palette: &[u8], indices: &[u8]) -> Vec<u8> {
    let palette_colors = palette.len() / 3;
    let palette_entries = 256usize;

    let row_padding = (4 - (width as usize % 4)) % 4;
    let row_size = width as usize + row_padding;
    let image_size = row_size * height as usize;
    let header_size = 14 + 40 + palette_entries * 4;
    let file_size = header_size + image_size;

    let mut data = Vec::with_capacity(file_size);

    data.extend_from_slice(b"BM");
    data.extend_from_slice(&(file_size as u32).to_le_bytes());
    data.extend_from_slice(&0u16.to_le_bytes());
    data.extend_from_slice(&0u16.to_le_bytes());
    data.extend_from_slice(&(header_size as u32).to_le_bytes());

    data.extend_from_slice(&40u32.to_le_bytes());
    data.extend_from_slice(&(width as i32).to_le_bytes());
    data.extend_from_slice(&(height as i32).to_le_bytes());
    data.extend_from_slice(&1u16.to_le_bytes());
    data.extend_from_slice(&8u16.to_le_bytes());
    data.extend_from_slice(&0u32.to_le_bytes());
    data.extend_from_slice(&(image_size as u32).to_le_bytes());
    data.extend_from_slice(&0i32.to_le_bytes());
    data.extend_from_slice(&0i32.to_le_bytes());
    data.extend_from_slice(&(palette_entries as u32).to_le_bytes());
    data.extend_from_slice(&0u32.to_le_bytes());

    for idx in 0..palette_entries {
        if idx < palette_colors {
            let base = idx * 3;
            data.push(palette[base + 2]);
            data.push(palette[base + 1]);
            data.push(palette[base]);
        } else {
            data.extend_from_slice(&[0u8, 0u8, 0u8]);
        }
        data.push(0u8);
    }

    let width_usize = width as usize;
    for row in (0..height as usize).rev() {
        let start = row * width_usize;
        let end = start + width_usize;
        data.extend_from_slice(&indices[start..end]);
        if row_padding > 0 {
            data.extend(std::iter::repeat_n(0u8, row_padding));
        }
    }

    data
}
