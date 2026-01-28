use std::path::{Path};
use std::sync::mpsc::{self, Receiver};
use std::thread;

use anyhow::anyhow;
use eframe::egui;

use crate::processing::{ProcessStats, process_root};
use crate::{Config, updater};

#[derive(Clone)]
pub struct DriveInfo {
    pub path: String,
    pub has_pico: bool,
}

pub fn detect_drives() -> Vec<DriveInfo> {
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

pub struct GuiApp {
    ui_config: UiConfig,
    logs: Vec<String>,
    rx: Option<Receiver<GuiMessage>>,
    running: bool,
    stats: Option<ProcessStats>,
    error: Option<String>,
    drives: Vec<DriveInfo>,
    selected_drive: usize,
    logo_texture: Option<egui::TextureHandle>,
    update_available: Option<String>,
    show_update_dialog: bool,
    show_skipped: bool,
    show_failed: bool,
    show_games_list: bool,
}

#[derive(Clone, Default)]
pub struct UiConfig {
    pub overwrite: bool,
}

enum GuiMessage {
    Log(String),
    Done(ProcessStats, Option<String>),
}

impl GuiApp {
    pub fn new() -> Self {
        let drives = detect_drives();
        let selected_drive = drives.iter().position(|d| d.has_pico).unwrap_or(0);

        // Check for updates in background
        let update_available = updater::check_and_notify_update();

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
            update_available,
            show_update_dialog: false,
            show_skipped: false,
            show_failed: false,
            show_games_list: false,
        }
    }

    fn start_processing(&mut self) -> anyhow::Result<()> {
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
                if self.logo_texture.is_none()
                    && let Some(image_data) = load_logo_image()
                {
                    self.logo_texture =
                        Some(ctx.load_texture("logo", image_data, Default::default()));
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

            // Update notification banner
            if let Some(new_version) = &self.update_available
                && !self.show_update_dialog
            {
                ui.group(|ui| {
                    ui.set_min_width(ui.available_width());
                    ui.horizontal(|ui| {
                        ui.colored_label(
                            egui::Color32::from_rgb(100, 200, 100),
                            format!("🎉 Update available: v{}", new_version),
                        );
                        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                            if ui.button("Update Now").clicked() {
                                self.show_update_dialog = true;
                            }
                        });
                    });
                });
                ui.add_space(10.0);
            }

            // Update dialog
            if self.show_update_dialog {
                egui::Window::new("Update Available")
                    .collapsible(false)
                    .resizable(false)
                    .show(ctx, |ui| {
                        if let Some(new_version) = &self.update_available {
                            ui.label(format!("A new version (v{}) is available!", new_version));
                            ui.add_space(10.0);
                            ui.label("PicoCover will restart after updating.");
                            ui.add_space(10.0);
                            ui.horizontal(|ui| {
                                if ui.button("Update Now").clicked() {
                                    ui.label("Downloading update...");
                                    match updater::perform_update() {
                                        Ok(_) => {
                                            ui.label(
                                                "PicoCover update successful! Please restart.",
                                            );
                                        }
                                        Err(e) => {
                                            ui.colored_label(
                                                egui::Color32::RED,
                                                format!("Update failed: {}", e),
                                            );
                                        }
                                    }
                                    self.show_update_dialog = false;
                                }
                                if ui.button("Later").clicked() {
                                    self.show_update_dialog = false;
                                }
                            });
                        }
                    });
            }

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
                        egui::ComboBox::from_id_salt("drive_selector")
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

            ui.horizontal(|ui| {
                ui.checkbox(&mut self.ui_config.overwrite, "Overwrite existing BMPs");
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

                if ui.add_enabled(start_enabled, button).clicked()
                    && let Err(err) = self.start_processing()
                {
                    self.error = Some(err.to_string());
                    self.running = false;
                }
            });

            ui.add_space(10.0);

            if let Some(stats) = &self.stats {
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

                // Tab selector
                ui.horizontal(|ui| {
                    if ui
                        .selectable_label(!self.show_games_list, "📄 Output Log")
                        .clicked()
                    {
                        self.show_games_list = false;
                    }
                    if ui
                        .selectable_label(self.show_games_list, "📋 Game Lists")
                        .clicked()
                    {
                        self.show_games_list = true;
                    }
                });

                ui.separator();
                ui.add_space(5.0);

                if !self.show_games_list {
                    // Output Log view
                    egui::ScrollArea::vertical()
                        .stick_to_bottom(true)
                        .auto_shrink([false; 2])
                        .show(ui, |ui| {
                            ui.set_min_width(ui.available_width());
                            if self.logs.is_empty() && !self.running {
                                ui.colored_label(
                                    egui::Color32::GRAY,
                                    "Logs will appear here when processing starts...",
                                );
                            }
                            for line in &self.logs {
                                let text = if line.contains("Stored") {
                                    egui::RichText::new(line)
                                        .size(11.0)
                                        .color(egui::Color32::from_rgb(100, 200, 100))
                                        .monospace()
                                } else if line.contains("Skipped") || line.contains("Checking") {
                                    egui::RichText::new(line)
                                        .size(11.0)
                                        .color(egui::Color32::from_rgb(200, 200, 100))
                                        .monospace()
                                } else if line.contains("Error") || line.contains("Not found") {
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
                } else if let Some(stats) = &self.stats {
                    // Game Lists view
                    if !stats.skipped_games.is_empty() {
                        if ui
                            .button(if self.show_skipped {
                                "▼ Skipped Games"
                            } else {
                                "► Skipped Games"
                            })
                            .on_hover_text(format!(
                                "Click to toggle ({} games)",
                                stats.skipped_games.len()
                            ))
                            .clicked()
                        {
                            self.show_skipped = !self.show_skipped;
                        }

                        if self.show_skipped {
                            ui.add_space(3.0);
                            egui::ScrollArea::vertical()
                                .auto_shrink([false; 2])
                                .show(ui, |ui| {
                                    ui.set_min_width(ui.available_width());
                                    for game in &stats.skipped_games {
                                        ui.colored_label(
                                            egui::Color32::from_rgb(200, 200, 100),
                                            format!("  • {}", game),
                                        );
                                    }
                                });
                        }
                    }

                    if !stats.failed_games.is_empty() {
                        ui.add_space(8.0);
                        if ui
                            .button(if self.show_failed {
                                "▼ Failed Games"
                            } else {
                                "► Failed Games"
                            })
                            .on_hover_text(format!(
                                "Click to toggle ({} games)",
                                stats.failed_games.len()
                            ))
                            .clicked()
                        {
                            self.show_failed = !self.show_failed;
                        }

                        if self.show_failed {
                            ui.add_space(3.0);
                            egui::ScrollArea::vertical()
                                .auto_shrink([false; 2])
                                .show(ui, |ui| {
                                    ui.set_min_width(ui.available_width());
                                    for game in &stats.failed_games {
                                        ui.colored_label(
                                            egui::Color32::from_rgb(200, 100, 100),
                                            format!("  • {}", game),
                                        );
                                    }
                                });
                        }
                    }
                } else {
                    ui.colored_label(
                        egui::Color32::GRAY,
                        "Game lists will appear here after processing completes...",
                    );
                }
            });
        });

        if self.running {
            ctx.request_repaint();
        }
    }
}

impl UiConfig {
    fn to_config(&self, drive_path: &str) -> anyhow::Result<Config> {
        let root = std::path::PathBuf::from(drive_path);
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
            overwrite: self.overwrite,
            timeout_secs: 15,
            threads: None,
        })
    }
}

pub fn load_logo_image() -> Option<egui::ColorImage> {
    let bytes = include_bytes!("../assets/icon.png");
    let image = image::load_from_memory(bytes).ok()?.into_rgba8();
    let (width, height) = image.dimensions();
    let pixels: Vec<egui::Color32> = image
        .pixels()
        .map(|p| egui::Color32::from_rgba_premultiplied(p[0], p[1], p[2], p[3]))
        .collect();
    Some(egui::ColorImage {
        size: [width as usize, height as usize],
        source_size: egui::Vec2::new(width as f32, height as f32),
        pixels,
    })
}
