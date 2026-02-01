#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod gui;
mod processing;
mod updater;

use std::path::PathBuf;

use anyhow::Result;
use clap::Parser;
use eframe::{egui, NativeOptions};

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

    /// Number of parallel download threads (defaults to CPU core count).
    #[arg(long)]
    threads: Option<usize>,

    /// Launch with CLI instead of GUI.
    #[arg(long, default_value_t = false)]
    cli: bool,
}

#[derive(Clone)]
pub struct Config {
    pub root: PathBuf,
    pub regions: Vec<String>,
    pub url_templates: Vec<String>,
    pub overwrite: bool,
    pub timeout_secs: u64,
    pub threads: Option<usize>,
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
    let config = Config {
        root: args.root,
        regions: args.regions,
        url_templates: args.url_templates,
        overwrite: args.overwrite,
        timeout_secs: args.timeout_secs,
        threads: args.threads,
    };
    let logger = |msg: String| println!("{}", msg);
    let stats = processing::process_root(&config, logger)?;
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
    eframe::run_native(
        "PicoCover",
        options,
        Box::new(|_| Ok(Box::new(gui::GuiApp::new()))),
    )
    .map_err(|e| anyhow::anyhow!(e.to_string()))
}

fn load_icon() -> Option<egui::IconData> {
    let bytes = include_bytes!("../../../assets/icon.png");
    let image = image::load_from_memory(bytes).ok()?.into_rgba8();
    let (width, height) = image.dimensions();
    Some(egui::IconData {
        rgba: image.into_raw(),
        width,
        height,
    })
}
