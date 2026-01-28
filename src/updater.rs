use anyhow::Result;
use self_update::cargo_crate_version;
use std::env;
use std::process::Command;

const REPO_OWNER: &str = "Scaletta";
const REPO_NAME: &str = "PicoCover";

pub fn check_for_updates() -> Result<Option<String>> {
    let current_version = cargo_crate_version!();

    let releases = self_update::backends::github::ReleaseList::configure()
        .repo_owner(REPO_OWNER)
        .repo_name(REPO_NAME)
        .build()?
        .fetch()?;

    if let Some(latest_release) = releases.first() {
        let latest_version = latest_release.version.trim_start_matches('v');
        if latest_version != current_version {
            return Ok(Some(latest_version.to_string()));
        }
    }

    Ok(None)
}

pub fn perform_update() -> Result<()> {
    let current_version = cargo_crate_version!();

    // Set target to match GitHub release asset naming (pico_cover-{target}.exe)
    let target = if cfg!(target_os = "windows") {
        "windows-x64"
    } else if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            "macos-arm64"
        } else {
            "macos-x64"
        }
    } else {
        "linux-x64"
    };

    let status = self_update::backends::github::Update::configure()
        .repo_owner(REPO_OWNER)
        .repo_name(REPO_NAME)
        .bin_name("pico_cover")
        .target(target)
        .current_version(current_version)
        .build()?
        .update()?;
    match status {
        self_update::Status::UpToDate(version) => {
            println!("PicoCover is already up to date (v{})", version);
        }
        self_update::Status::Updated(version) => {
            println!("Successfully updated PicoCover to v{}", version);
            println!("Restarting PicoCover...");

            // Get current executable path
            if let Ok(exe_path) = env::current_exe() {
                // Spawn new process with the updated binary
                #[cfg(target_os = "windows")]
                {
                    use std::os::windows::process::CommandExt;
                    const CREATE_NO_WINDOW: u32 = 0x08000000;

                    // Use PowerShell for better reliability
                    Command::new("powershell")
                        .creation_flags(CREATE_NO_WINDOW)
                        .args([
                            "-WindowStyle",
                            "Hidden",
                            "-Command",
                            &format!(
                                "Start-Sleep -Seconds 1; Start-Process '{}'",
                                exe_path.display()
                            ),
                        ])
                        .spawn()
                        .ok();
                }

                #[cfg(target_os = "macos")]
                {
                    Command::new("sh")
                        .arg("-c")
                        .arg(format!("sleep 1 && open '{}'", exe_path.display()))
                        .spawn()
                        .ok();
                }

                #[cfg(target_os = "linux")]
                {
                    Command::new("sh")
                        .arg("-c")
                        .arg(format!("sleep 1 && '{}' &", exe_path.display()))
                        .spawn()
                        .ok();
                }

                // Exit current process
                std::process::exit(0);
            }
        }
    }

    Ok(())
}

pub fn check_and_notify_update() -> Option<String> {
    match check_for_updates() {
        Ok(Some(new_version)) => Some(new_version),
        Ok(None) => None,
        Err(e) => {
            eprintln!("Failed to check for updates: {}", e);
            None
        }
    }
}
