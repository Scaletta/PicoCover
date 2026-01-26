#[cfg(windows)]
extern crate winres;

#[cfg(windows)]
fn main() {
    if cfg!(target_os = "windows") {
    let mut res = winres::WindowsResource::new();
    res.set_icon("assets/icon.ico")
       .set("Pico Launcher Cover Tool", "pico_launcher_cover_tool.exe")
       // manually set version 1.0.0.0
       .set_version_info(winres::VersionInfo::PRODUCTVERSION, 0x0001000000000000);
    res.compile().unwrap();
    }
}

#[cfg(unix)]
fn main() {
}