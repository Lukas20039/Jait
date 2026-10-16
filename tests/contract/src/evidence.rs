//! Bind reference evidence to the gateway and contract sources present during a run.
use anyhow::Result;
use serde_json::{Value, json};
use std::{collections::BTreeMap, fs, path::Path};

fn collect(root: &Path, directory: &Path, files: &mut BTreeMap<String, String>) -> Result<()> {
    for entry in fs::read_dir(directory)? {
        let entry = entry?;
        if [
            "node_modules",
            "dist",
            "build",
            "web-dist",
            "target",
            ".git",
        ]
        .contains(&entry.file_name().to_string_lossy().as_ref())
        {
            continue;
        }
        let kind = entry.file_type()?;
        let path = entry.path();
        if kind.is_dir() {
            collect(root, &path, files)?;
        } else if kind.is_file()
            && path
                .extension()
                .and_then(|ext| ext.to_str())
                .is_some_and(|ext| {
                    ["rs", "ts", "tsx", "js", "mjs", "cjs", "toml", "lock"].contains(&ext)
                        || (ext == "json" && path.starts_with(root.join("tests/contract/vectors")))
                })
        {
            let bytes = fs::read(&path)?;
            let hash = bytes.iter().fold(0xcbf29ce484222325_u64, |hash, byte| {
                (hash ^ u64::from(*byte)).wrapping_mul(0x100000001b3)
            });
            files.insert(
                path.strip_prefix(root)?
                    .to_string_lossy()
                    .replace('\\', "/"),
                format!("{hash:016x}"),
            );
        }
    }
    Ok(())
}

pub fn snapshot(root: &Path) -> Result<Value> {
    let mut files = BTreeMap::new();
    collect(root, &root.join("packages/gateway"), &mut files)?;
    collect(root, &root.join("packages/shared/src"), &mut files)?;
    collect(root, &root.join("tests/contract"), &mut files)?;
    Ok(json!({"algorithm":"fnv1a64-by-file", "files":files}))
}
