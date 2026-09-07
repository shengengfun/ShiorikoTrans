fn commit_hash() -> String {
    let output = std::process::Command::new("git")
        .args(["rev-parse", "--short", "HEAD"])
        .output();
    match output {
        Ok(output) if output.status.success() => String::from_utf8(output.stdout).unwrap_or_default().trim().to_string(),
        _ => "dev".to_string(),
    }
}

fn main() {
    let hash = commit_hash();
    println!("cargo:rerun-if-env-changed=COMMIT_HASH");
    println!("cargo:rustc-env=COMMIT_HASH={}", hash);

    // Analytics
    println!("cargo:rerun-if-env-changed=APTABASE_KEY");

    tauri_build::build();
}
