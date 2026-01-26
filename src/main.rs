#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Receiver};
use std::thread;
use std::time::Duration;

use anyhow::{anyhow, Context, Result};
use clap::Parser;
use color_quant::NeuQuant;
use eframe::{egui, NativeOptions};
use image::imageops::{replace, resize, FilterType};
use image::{DynamicImage, ImageBuffer, Rgba};
use reqwest::blocking::Client;
use walkdir::WalkDir;

#[derive(Parser, Debug)]
#[command(
    name = "pico-cover",
    about = "Fetch and downscale NDS cover art to 8bpp BMP for Pico Launcher."
)]
struct Args {
    /// Root folder or drive containing NDS ROMs.
    #[arg(long, default_value = ".")]
    root: PathBuf,

    /// Region codes to try (order matters).
    #[arg(long, value_delimiter = ',', default_value = "EN,US,JA,EU")]
    regions: Vec<String>,

    /// Output subdirectory relative to root.
    #[arg(long, default_value = "_pico/covers/nds")]
    output_subdir: String,

    /// Custom URL templates; use {region} and {id} placeholders.
    #[arg(
        long,
        value_delimiter = ';',
        default_value = "https://art.gametdb.com/ds/cover/{region}/{id}.png;https://art.gametdb.com/ds/cover/{region}/{id}.jpg"
    )]
    url_templates: Vec<String>,

    /// Overwrite existing BMPs instead of skipping.
    #[arg(long, default_value_t = false)]
    overwrite: bool,

    /// Network timeout in seconds.
    #[arg(long, default_value_t = 15)]
    timeout_secs: u64,

    /// Launch with CLI instead of GUI.
    #[arg(long, default_value_t = false)]
    cli: bool,
}

#[derive(Clone)]
struct Config {
    root: PathBuf,
    regions: Vec<String>,
    url_templates: Vec<String>,
    overwrite: bool,
    timeout_secs: u64,
}

#[derive(Default, Clone, Copy)]
struct ProcessStats {
    processed: u32,
    saved: u32,
    skipped: u32,
    errors: u32,
}

fn main() -> Result<()> {
    let args = Args::parse();
    if args.cli {
        run_cli(args)?;
    } else {
        run_gui()?;
    }
    Ok(())
}

fn run_cli(args: Args) -> Result<()> {
    let config = config_from_args(&args)?;
    let mut logger = |msg: String| println!("{}", msg);
    let stats = process_root(&config, &mut logger)?;
    println!(
        "Done. Processed={} Saved={} Skipped={} Errors={}",
        stats.processed, stats.saved, stats.skipped, stats.errors
    );
    Ok(())
}

fn run_gui() -> Result<()> {
    let mut viewport = egui::ViewportBuilder::default();
    if let Some(icon) = load_icon() {
        viewport = viewport.with_icon(std::sync::Arc::new(icon));
    }
    let options = NativeOptions {
        viewport,
        ..NativeOptions::default()
    };
    eframe::run_native("PicoCover", options, Box::new(|_| Box::new(GuiApp::new())))
        .map_err(|e| anyhow!(e.to_string()))
}

fn load_icon() -> Option<egui::IconData> {
    let bytes = include_bytes!("../assets/icon.png");
    let image = image::load_from_memory(bytes).ok()?.into_rgba8();
    let (width, height) = image.dimensions();
    Some(egui::IconData {
        rgba: image.into_raw(),
        width,
        height,
    })
}

fn is_nds(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| matches_ignore_ascii_case(ext, "nds"))
        .unwrap_or(false)
}

fn config_from_args(args: &Args) -> Result<Config> {
    Ok(Config {
        root: args.root.clone(),
        regions: args.regions.clone(),
        url_templates: args.url_templates.clone(),
        overwrite: args.overwrite,
        timeout_secs: args.timeout_secs,
    })
}

fn process_root(config: &Config, mut log: impl FnMut(String)) -> Result<ProcessStats> {
    let client = Client::builder()
        .user_agent("pico-cover/0.1")
        .timeout(Duration::from_secs(config.timeout_secs))
        .build()
        .context("Building HTTP client")?;

    let output_dir = config.root.join("_pico/covers/nds");
    fs::create_dir_all(&output_dir).context("Creating output directory")?;

    let mut stats = ProcessStats::default();
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

        stats.processed += 1;
        match handle_file(path, &output_dir, config, &client) {
            Ok(true) => {
                stats.saved += 1;
                log(format!("Stored {}", path.display()));
            }
            Ok(false) => {
                stats.skipped += 1;
                log(format!("Skipped {}", path.display()));
            }
            Err(err) => {
                stats.errors += 1;
                log(format!("Error {}: {}", path.display(), err));
            }
        }
    }

    Ok(stats)
}

fn load_logo_image() -> Option<egui::ColorImage> {
    let bytes = include_bytes!("../assets/icon.png");
    let image = image::load_from_memory(bytes).ok()?.into_rgba8();
    let (width, height) = image.dimensions();
    let pixels: Vec<egui::Color32> = image
        .pixels()
        .map(|p| egui::Color32::from_rgba_premultiplied(p[0], p[1], p[2], p[3]))
        .collect();
    Some(egui::ColorImage {
        size: [width as usize, height as usize],
        pixels,
    })
}

fn matches_ignore_ascii_case(value: &str, needle: &str) -> bool {
    value.len() == needle.len()
        && value
            .chars()
            .zip(needle.chars())
            .all(|(a, b)| a.eq_ignore_ascii_case(&b))
}

fn handle_file(path: &Path, output_dir: &Path, config: &Config, client: &Client) -> Result<bool> {
    let game_code = match read_game_code(path)? {
        Some(code) => code,
        None => return Ok(false),
    };

    let target = output_dir.join(format!("{game_code}.bmp"));
    if target.exists() && !config.overwrite {
        return Ok(false);
    }

    let image = match fetch_cover(&game_code, &config.regions, &config.url_templates, client) {
        Some(img) => img,
        None => return Ok(false),
    };

    let bmp_bytes = render_cover_bmp(image).context("rendering BMP")?;
    let mut file = File::create(&target).context("creating output file")?;
    file.write_all(&bmp_bytes).context("writing BMP")?;
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
    regions: &[String],
    templates: &[String],
    client: &Client,
) -> Option<DynamicImage> {
    let mut url_candidates = Vec::new();
    for region in regions {
        for template in templates {
            let url = template
                .replace("{region}", region)
                .replace("{id}", game_code);
            url_candidates.push(url);
        }
    }

    for url in url_candidates {
        match client.get(&url).send() {
            Ok(resp) if resp.status().is_success() => match resp.bytes() {
                Ok(bytes) => match image::load_from_memory(&bytes) {
                    Ok(img) => return Some(img),
                    Err(err) => eprintln!("Invalid image from {}: {}", url, err),
                },
                Err(err) => eprintln!("Failed reading body from {}: {}", url, err),
            },
            Ok(resp) => eprintln!("HTTP {} for {}", resp.status(), url),
            Err(err) => eprintln!("Request error for {}: {}", url, err),
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

// ---------------- GUI ----------------

#[derive(Clone)]
struct DriveInfo {
    path: String,
    has_pico: bool,
}

fn detect_drives() -> Vec<DriveInfo> {
    let mut drives = Vec::new();

    #[cfg(windows)]
    {
        for letter in b'A'..=b'Z' {
            let drive_path = format!("{}:\\", letter as char);
            if Path::new(&drive_path).exists() {
                let pico_path = Path::new(&drive_path).join("_pico");
                let has_pico = pico_path.exists() && pico_path.is_dir();
                if has_pico {
                    drives.push(DriveInfo {
                        path: drive_path,
                        has_pico,
                    });
                }
            }
        }
    }

    #[cfg(not(windows))]
    {
        // macOS: /Volumes, Linux: /media, /mnt
        for base in &["/Volumes", "/media", "/mnt"] {
            if let Ok(entries) = fs::read_dir(base) {
                for entry in entries.flatten() {
                    if let Ok(path) = entry.path().canonicalize() {
                        let path_str = path.display().to_string();
                        let pico_path = path.join("_pico");
                        let has_pico = pico_path.exists() && pico_path.is_dir();
                        if has_pico {
                            drives.push(DriveInfo {
                                path: path_str,
                                has_pico,
                            });
                        }
                    }
                }
            }
        }
    }

    drives
}

struct GuiApp {
    ui_config: UiConfig,
    logs: Vec<String>,
    rx: Option<Receiver<GuiMessage>>,
    running: bool,
    stats: Option<ProcessStats>,
    error: Option<String>,
    drives: Vec<DriveInfo>,
    selected_drive: usize,
    logo_texture: Option<egui::TextureHandle>,
}

#[derive(Clone, Default)]
struct UiConfig {}

enum GuiMessage {
    Log(String),
    Done(ProcessStats, Option<String>),
}

impl GuiApp {
    fn new() -> Self {
        let drives = detect_drives();
        let selected_drive = drives.iter().position(|d| d.has_pico).unwrap_or(0);

        Self {
            ui_config: UiConfig::default(),
            logs: Vec::new(),
            rx: None,
            running: false,
            stats: None,
            error: None,
            drives,
            selected_drive,
            logo_texture: None,
        }
    }

    fn start_processing(&mut self) -> Result<()> {
        if self.drives.is_empty() {
            return Err(anyhow!("No drives detected"));
        }
        let drive_path = self
            .drives
            .get(self.selected_drive)
            .ok_or_else(|| anyhow!("Invalid drive selection"))?
            .path
            .clone();
        let config = self.ui_config.to_config(&drive_path)?;
        let (tx, rx) = mpsc::channel();
        self.logs.clear();
        self.stats = None;
        self.error = None;
        self.running = true;
        self.rx = Some(rx);

        thread::spawn(move || {
            let send_log = |msg: String| {
                let _ = tx.send(GuiMessage::Log(msg));
            };
            let result = process_root(&config, send_log);
            match result {
                Ok(stats) => {
                    let _ = tx.send(GuiMessage::Done(stats, None));
                }
                Err(err) => {
                    let _ = tx.send(GuiMessage::Done(
                        ProcessStats::default(),
                        Some(err.to_string()),
                    ));
                }
            }
        });

        Ok(())
    }

    fn poll_messages(&mut self) {
        if let Some(rx) = &self.rx {
            while let Ok(msg) = rx.try_recv() {
                match msg {
                    GuiMessage::Log(line) => self.logs.push(line),
                    GuiMessage::Done(stats, err) => {
                        self.running = false;
                        self.stats = Some(stats);
                        self.error = err;
                    }
                }
            }
        }
    }
}

impl eframe::App for GuiApp {
    fn update(&mut self, ctx: &egui::Context, _: &mut eframe::Frame) {
        self.poll_messages();

        egui::TopBottomPanel::bottom("footer").show(ctx, |ui| {
            ui.vertical_centered(|ui| {
                ui.add_space(5.0);
                ui.label(
                    egui::RichText::new(format!("v{}", env!("CARGO_PKG_VERSION")))
                        .size(10.0)
                        .color(egui::Color32::GRAY),
                );
                ui.hyperlink_to(
                    egui::RichText::new("https://github.com/Scaletta/PicoCover")
                        .size(10.0)
                        .color(egui::Color32::from_rgb(100, 150, 200)),
                    "https://github.com/Scaletta/PicoCover",
                );
                ui.add_space(5.0);
            });
        });

        egui::CentralPanel::default().show(ctx, |ui| {
            ui.add_space(10.0);
            ui.vertical_centered(|ui| {
                if self.logo_texture.is_none() {
                    if let Some(image_data) = load_logo_image() {
                        self.logo_texture =
                            Some(ctx.load_texture("logo", image_data, Default::default()));
                    }
                }

                if let Some(texture) = &self.logo_texture {
                    ui.image(egui::load::SizedTexture::new(
                        texture.id(),
                        egui::vec2(64.0, 64.0),
                    ));
                    ui.add_space(10.0);
                }

                ui.heading(egui::RichText::new("PicoCover").size(24.0));
                ui.add_space(5.0);
                ui.label(
                    egui::RichText::new("Automatically download NDS cover art for Pico Launcher")
                        .size(12.0)
                        .color(egui::Color32::GRAY),
                );
            });
            ui.add_space(15.0);

            ui.group(|ui| {
                ui.set_min_width(ui.available_width());
                ui.label(egui::RichText::new("📁 Select Drive").strong());
                ui.add_space(5.0);

                if self.drives.is_empty() {
                    ui.horizontal(|ui| {
                        ui.colored_label(
                            egui::Color32::from_rgb(200, 100, 100),
                            "⚠ No drives with _pico folder found",
                        );
                        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                            if ui
                                .button(egui::RichText::new("🔄 Refresh").size(14.0))
                                .clicked()
                            {
                                self.drives = detect_drives();
                                if self.selected_drive >= self.drives.len() {
                                    self.selected_drive = 0;
                                }
                            }
                        });
                    });
                } else {
                    ui.horizontal(|ui| {
                        egui::ComboBox::from_id_source("drive_selector")
                            .width(ui.available_width() - 100.0)
                            .selected_text(&self.drives[self.selected_drive].path)
                            .show_ui(ui, |ui| {
                                for (idx, drive) in self.drives.iter().enumerate() {
                                    ui.selectable_value(&mut self.selected_drive, idx, &drive.path);
                                }
                            });

                        if ui
                            .button(egui::RichText::new("🔄 Refresh").size(14.0))
                            .clicked()
                        {
                            self.drives = detect_drives();
                            if self.selected_drive >= self.drives.len() {
                                self.selected_drive = 0;
                            }
                        }
                    });
                }
            });

            ui.add_space(10.0);

            ui.vertical_centered(|ui| {
                let start_enabled = !self.running;
                let button_text = if self.running {
                    "⏳ Processing..."
                } else {
                    "▶ Start Processing"
                };

                let button = egui::Button::new(egui::RichText::new(button_text).size(16.0))
                    .min_size(egui::vec2(200.0, 40.0));

                if ui.add_enabled(start_enabled, button).clicked() {
                    if let Err(err) = self.start_processing() {
                        self.error = Some(err.to_string());
                        self.running = false;
                    }
                }
            });

            ui.add_space(10.0);

            if let Some(stats) = self.stats {
                ui.group(|ui| {
                    ui.set_min_width(ui.available_width());
                    ui.horizontal(|ui| {
                        ui.label(egui::RichText::new("📊 Results").strong());
                    });
                    ui.add_space(5.0);
                    ui.horizontal(|ui| {
                        ui.label(egui::RichText::new(format!(
                            "📝 Processed: {}",
                            stats.processed
                        )));
                        ui.separator();
                        ui.colored_label(
                            egui::Color32::from_rgb(100, 200, 100),
                            format!("💾 Saved: {}", stats.saved),
                        );
                        ui.separator();
                        ui.colored_label(
                            egui::Color32::from_rgb(200, 200, 100),
                            format!("⏭ Skipped: {}", stats.skipped),
                        );
                        ui.separator();
                        if stats.errors > 0 {
                            ui.colored_label(
                                egui::Color32::from_rgb(200, 100, 100),
                                format!("❌ Errors: {}", stats.errors),
                            );
                        } else {
                            ui.label(format!("❌ Errors: {}", stats.errors));
                        }
                    });
                });
                ui.add_space(5.0);
            }

            if let Some(err) = &self.error {
                ui.add_space(5.0);
                ui.colored_label(
                    egui::Color32::from_rgb(220, 80, 80),
                    egui::RichText::new(format!("❌ Error: {}", err)).strong(),
                );
                ui.add_space(5.0);
            }

            ui.group(|ui| {
                ui.set_min_width(ui.available_width());
                ui.label(egui::RichText::new("📄 Output Log").strong());
                ui.add_space(5.0);
                egui::ScrollArea::vertical()
                    .stick_to_bottom(true)
                    .max_height(250.0)
                    .show(ui, |ui| {
                        if self.logs.is_empty() && !self.running {
                            ui.colored_label(
                                egui::Color32::GRAY,
                                "Logs will appear here when processing starts...",
                            );
                        }
                        for line in &self.logs {
                            let text = if line.contains("stored") {
                                egui::RichText::new(line)
                                    .size(11.0)
                                    .color(egui::Color32::from_rgb(100, 200, 100))
                                    .monospace()
                            } else if line.contains("skipped") {
                                egui::RichText::new(line)
                                    .size(11.0)
                                    .color(egui::Color32::from_rgb(200, 200, 100))
                                    .monospace()
                            } else if line.contains("error") {
                                egui::RichText::new(line)
                                    .size(11.0)
                                    .color(egui::Color32::from_rgb(200, 100, 100))
                                    .monospace()
                            } else {
                                egui::RichText::new(line)
                                    .size(11.0)
                                    .color(egui::Color32::from_rgb(180, 180, 180))
                                    .monospace()
                            };
                            ui.label(text);
                        }
                    });
            });
        });

        if self.running {
            ctx.request_repaint();
        }
    }
}

impl UiConfig {
    fn to_config(&self, drive_path: &str) -> Result<Config> {
        let root = PathBuf::from(drive_path);
        if !root.exists() {
            return Err(anyhow!("Selected drive does not exist"));
        }

        Ok(Config {
            root,
            regions: vec![
                "EN".to_string(),
                "US".to_string(),
                "JA".to_string(),
                "EU".to_string(),
            ],
            url_templates: vec![
                "https://art.gametdb.com/ds/cover/{region}/{id}.png".to_string(),
                "https://art.gametdb.com/ds/cover/{region}/{id}.jpg".to_string(),
            ],
            overwrite: true,
            timeout_secs: 15,
        })
    }
}
