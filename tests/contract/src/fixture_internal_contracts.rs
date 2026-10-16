//! Rust-owned assertion interpreter for declarative reference vectors.
use crate::internal_driver;
use anyhow::{Context, Result, bail, ensure};
use serde_json::{Value, json};
use std::path::Path;

pub fn cases() -> Result<Vec<Value>> {
    let mut cases = Vec::new();
    for source in [
        include_str!("../vectors/fixtures.json"),
        include_str!("../vectors/provider.json"),
        include_str!("../vectors/storage.json"),
        include_str!("../vectors/storage2.json"),
        include_str!("../vectors/tools.json"),
        include_str!("../vectors/toolsb.json"),
        include_str!("../vectors/services.json"),
        include_str!("../vectors/db.json"),
        include_str!("../vectors/providers.json"),
        include_str!("../vectors/routes.json"),
    ] {
        cases.extend(serde_json::from_str::<Vec<Value>>(source)?);
    }
    for case in &cases {
        ensure!(
            case["id"]
                .as_str()
                .is_some_and(|id| id.starts_with("internal.")),
            "invalid vector id"
        );
        ensure!(
            case["calls"]
                .as_array()
                .is_some_and(|calls| !calls.is_empty() && calls.len() <= 64),
            "invalid vector calls"
        );
        ensure!(
            case["assertions"]
                .as_array()
                .is_some_and(|assertions| !assertions.is_empty()),
            "vector requires assertions"
        );
    }
    Ok(cases)
}
pub fn check(
    root: &Path,
    directory: &Path,
    cancelled: &dyn Fn() -> bool,
    case: &Value,
) -> Result<()> {
    let actual = internal_driver::call(
        root,
        directory,
        json!({"version":1,"calls":case["calls"]}),
        cancelled,
    )?;
    validate(
        &actual,
        case["assertions"]
            .as_array()
            .context("assertions missing")?,
    )
}
fn validate(actual: &Value, assertions: &[Value]) -> Result<()> {
    ensure!(!assertions.is_empty(), "case requires assertions");
    for assertion in assertions {
        let pointer = assertion["path"]
            .as_str()
            .context("missing assertion path")?;
        let original = actual.pointer(pointer).context("missing result path")?;
        let parsed;
        let value = if let Some(inner) = assertion["parse"].as_str() {
            parsed =
                serde_json::from_str::<Value>(original.as_str().context("expected JSON text")?)?;
            parsed
                .pointer(inner)
                .context("missing parsed result path")?
        } else {
            original
        };
        match assertion["kind"]
            .as_str()
            .context("missing assertion kind")?
        {
            "eq" => ensure!(
                value == &assertion["value"],
                "equality assertion failed at {pointer}: {value}"
            ),
            "ne" => ensure!(
                value != &assertion["value"],
                "inequality assertion failed at {pointer}"
            ),
            "contains" => ensure!(
                value
                    .as_str()
                    .context("expected text")?
                    .contains(assertion["value"].as_str().context("expected substring")?),
                "substring absent at {pointer}"
            ),
            "bytes-le" => ensure!(
                value.as_str().context("expected text")?.len()
                    <= assertion["value"].as_u64().context("expected limit")? as usize,
                "byte limit exceeded"
            ),
            "length" => ensure!(
                value.as_array().context("expected array")?.len()
                    == assertion["value"].as_u64().context("expected length")? as usize,
                "wrong array length"
            ),
            "gt" => ensure!(
                value.as_f64().context("expected number")?
                    > assertion["value"].as_f64().context("expected comparison")?,
                "numeric bound failed"
            ),
            "gt-path" => {
                let other = actual
                    .pointer(assertion["other"].as_str().context("missing other path")?)
                    .and_then(Value::as_f64)
                    .context("missing comparison score")?;
                ensure!(
                    value.as_f64().context("expected score")?
                        > other * assertion["factor"].as_f64().unwrap_or(1.0),
                    "relative score assertion failed"
                );
            }
            "each-fields-absent" => {
                for item in value.as_array().context("expected array")? {
                    for field in assertion["value"].as_array().context("expected fields")? {
                        ensure!(
                            item.as_object()
                                .context("expected object")?
                                .get(field.as_str().context("expected field")?)
                                .is_none(),
                            "field should be absent"
                        );
                    }
                }
            }
            _ => bail!("unknown assertion operation"),
        }
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_mutated_outputs_and_empty_assertions() {
        assert!(
            validate(
                &json!([false]),
                &[json!({"path":"/0","kind":"eq","value":true})]
            )
            .is_err()
        );
        assert!(
            validate(
                &json!(["oversized"]),
                &[json!({"path":"/0","kind":"bytes-le","value":2})]
            )
            .is_err()
        );
        assert!(validate(&json!([]), &[]).is_err());
        assert!(
            validate(
                &json!([null]),
                &[json!({"path":"/0","parse":"","kind":"eq","value":{}})]
            )
            .is_err()
        );
    }
}
// Inputs and expected assertions are compiled from lane-owned vectors; TypeScript supplies actual results only.
