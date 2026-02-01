#[cfg(windows)]
extern crate winres;

#[cfg(windows)]
fn main() {
    if cfg!(target_os = "windows") {
        let mut res = winres::WindowsResource::new();
        res.set_icon("assets/icon.ico")
            .set("PicoCover", "pico_cover.exe")
            // manually set version 2.0.0.0
            .set_version_info(winres::VersionInfo::PRODUCTVERSION, 0x0002000000000000);
        res.compile().unwrap();
    }
}

#[cfg(unix)]
fn main() {}