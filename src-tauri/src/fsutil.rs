use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{self, Write};
use std::path::Path;
use std::thread;
use std::time::{Duration, UNIX_EPOCH};

pub fn sha256_hex(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

pub fn modified_ms(path: &Path) -> io::Result<u64> {
    let modified = fs::metadata(path)?.modified()?;
    Ok(modified.duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0))
}

/// Errors worth retrying: on Windows, antivirus scanners and OneDrive briefly
/// hold files open, which surfaces as access denied or a sharing violation.
fn is_transient(e: &io::Error) -> bool {
    e.kind() == io::ErrorKind::PermissionDenied || matches!(e.raw_os_error(), Some(32) | Some(33))
}

/// Writes `<target>.tmp` in the same folder, flushes it to disk, then renames
/// it over `target`, so a crash leaves either the old file or the new one.
pub fn atomic_write(target: &Path, bytes: &[u8]) -> io::Result<()> {
    let file_name = target
        .file_name()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "target has no file name"))?;
    let mut tmp_name = file_name.to_os_string();
    tmp_name.push(".tmp");
    let tmp = target.with_file_name(tmp_name);

    {
        let mut f = File::create(&tmp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
    }

    let mut attempt: u64 = 0;
    loop {
        match fs::rename(&tmp, target) {
            Ok(()) => break,
            Err(e) if attempt < 5 && is_transient(&e) => {
                attempt += 1;
                thread::sleep(Duration::from_millis(150 * attempt));
            }
            Err(e) => {
                let _ = fs::remove_file(&tmp);
                return Err(e);
            }
        }
    }

    // Persist the rename itself; Windows has no directory handle to flush.
    #[cfg(unix)]
    if let Some(parent) = target.parent() {
        File::open(parent)?.sync_all()?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn atomic_write_replaces_and_leaves_no_tmp() {
        let dir = std::env::temp_dir().join(format!("ls-fsutil-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let target = dir.join("lesson.html");
        atomic_write(&target, b"one").unwrap();
        atomic_write(&target, b"two").unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"two");
        assert!(!dir.join("lesson.html.tmp").exists());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn sha256_matches_known_vector() {
        assert_eq!(
            sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }
}
