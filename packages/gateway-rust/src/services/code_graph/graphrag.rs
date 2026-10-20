//! Code-graph to GraphRAG projection and JSONL export. Call filesystem work on
//! a blocking lane with an output directory already authorized by the caller.
use crate::{
    contracts::ecmascript_json::JsonDocument,
    services::calendar::{js_text, truthy},
    time::{Clock, default_clock, iso},
};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use std::{
    collections::{HashMap, HashSet},
    io,
    path::{Component, Path, PathBuf},
};

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphNode {
    pub id: String,
    pub label: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub degree: f64,
    pub properties: Map<String, Value>,
    #[serde(flatten)]
    pub location: Map<String, Value>,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    pub relation: String,
    pub confidence: String,
    pub confidence_score: Option<f64>,
    pub properties: Map<String, Value>,
    #[serde(flatten)]
    pub location: Map<String, Value>,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphIndex {
    pub graph_version: Option<String>,
}
#[derive(Clone, Debug, Deserialize)]
pub struct GraphSnapshot {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
    pub index: GraphIndex,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphRagData {
    pub entities: Vec<Value>,
    pub relationships: Vec<Value>,
    pub text_units: Vec<Value>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphRagExportManifest {
    pub schema_version: u8,
    pub graph_version: String,
    pub generated_at: String,
    pub entities_path: String,
    pub relationships_path: String,
    pub text_units_path: String,
    pub entity_count: usize,
    pub relationship_count: usize,
    pub text_unit_count: usize,
}
fn source_file(location: &Map<String, Value>) -> Option<&str> {
    location
        .get("sourceFile")
        .and_then(Value::as_str)
        .filter(|text| !text.is_empty())
}
fn attributes(
    location: &Map<String, Value>,
    names: &[(&str, &str)],
    properties: &Map<String, Value>,
) -> Value {
    let mut attributes = Map::new();
    for (source, target) in names {
        if let Some(value) = location.get(*source) {
            attributes.insert((*target).into(), value.clone());
        }
    }
    for (key, value) in properties {
        attributes.insert(key.clone(), value.clone());
    }
    Value::Object(attributes)
}
pub fn to_graph_rag_data(snapshot: &GraphSnapshot) -> GraphRagData {
    let nodes: HashMap<_, _> = snapshot
        .nodes
        .iter()
        .map(|node| (node.id.as_str(), node))
        .collect();
    let mut file_entities = HashMap::<&str, Vec<&str>>::new();
    let mut file_relationships = HashMap::<&str, Vec<&str>>::new();
    let entities=snapshot.nodes.iter().enumerate().map(|(index,node)| {
        let source=source_file(&node.location);
        if let Some(source)=source { file_entities.entry(source).or_default().push(&node.id); }
        let location=source.map(|source| {
            let line=node.location.get("line").filter(|value|truthy(value));
            format!("{source}{}",line.map(|value|format!(":{}",js_text(value))).unwrap_or_default())
        }).unwrap_or_else(||"unknown source".into());
        json!({
            "id":node.id,"human_readable_id":index,"title":node.label,"type":node.kind,
            "description":format!("{} is a {} defined at {location}.",node.label,node.kind),
            "text_unit_ids":source.map(|source|vec![format!("file:{source}")]).unwrap_or_default(),
            "degree":node.degree,
            "attributes":attributes(&node.location,&[("sourceFile","source_file"),("line","line"),("endLine","end_line"),("community","community"),("fileType","file_type")],&node.properties)
        })
    }).collect();
    let relationships=snapshot.edges.iter().enumerate().map(|(index,edge)| {
        let source=nodes.get(edge.source.as_str());
        let target=nodes.get(edge.target.as_str());
        let file=source_file(&edge.location);
        if let Some(file)=file { file_relationships.entry(file).or_default().push(&edge.id); }
        let mut edge_attributes=Map::new();
        edge_attributes.insert("relation".into(),json!(edge.relation));
        edge_attributes.insert("confidence".into(),json!(edge.confidence));
        for (from,to) in [("sourceFile","source_file"),("line","line")] {
            if let Some(value)=edge.location.get(from) { edge_attributes.insert(to.into(),value.clone()); }
        }
        for (key,value) in &edge.properties { edge_attributes.insert(key.clone(),value.clone()); }
        json!({
            "id":edge.id,"human_readable_id":index,"source":edge.source,"target":edge.target,
            "description":format!("{} {} {}. Confidence: {}.",source.map(|node|node.label.as_str()).unwrap_or(&edge.source),edge.relation,target.map(|node|node.label.as_str()).unwrap_or(&edge.target),edge.confidence),
            "weight":edge.confidence_score.unwrap_or(if edge.confidence=="EXTRACTED"{1.0}else{0.6}),
            "combined_degree":source.map(|node|node.degree).unwrap_or(0.0)+target.map(|node|node.degree).unwrap_or(0.0),
            "text_unit_ids":file.map(|file|vec![format!("file:{file}")]).unwrap_or_default(),
            "attributes":edge_attributes
        })
    }).collect();
    let files: HashSet<_> = file_entities
        .keys()
        .chain(file_relationships.keys())
        .copied()
        .collect();
    let mut files: Vec<_> = files.into_iter().collect();
    files.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
    let text_units=files.into_iter().enumerate().map(|(index,file)| {
        let entity_ids=file_entities.get(file).cloned().unwrap_or_default();
        let relationship_ids=file_relationships.get(file).cloned().unwrap_or_default();
        let summary=entity_ids.iter().take(100).map(|id|nodes.get(id).map(|node|node.label.as_str()).unwrap_or(id)).collect::<Vec<_>>().join(", ");
        let text=format!("Source file: {file}\nSymbols: {summary}");
        let tokens=text.encode_utf16().count().div_ceil(4).max(1);
        json!({"id":format!("file:{file}"),"human_readable_id":index,"text":text,"n_tokens":tokens,
            "document_ids":[file],"entity_ids":entity_ids,"relationship_ids":relationship_ids,"covariate_ids":[]})
    }).collect();
    GraphRagData {
        entities,
        relationships,
        text_units,
    }
}
/// Canonical JS JSON encoding preserves numeric property ordering and f64 formatting.
pub fn json_lines(rows: &[Value]) -> String {
    let mut result = String::new();
    for row in rows {
        let wire = serde_json::to_string(row).expect("JSON data");
        result.push_str(
            &JsonDocument::parse(&wire)
                .expect("serialized JSON")
                .stringify(),
        );
        result.push('\n');
    }
    result
}
fn clean_join(directory: &Path, name: &str) -> PathBuf {
    let mut result = PathBuf::new();
    for component in directory.join(name).components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                if result.file_name().is_some_and(|name| name != "..") {
                    result.pop();
                } else if !result.has_root() {
                    result.push("..");
                }
            }
            value => result.push(value.as_os_str()),
        }
    }
    result
}
fn io_error(message: impl std::fmt::Display) -> io::Error {
    io::Error::other(message.to_string())
}
pub fn write_graph_rag_export(
    snapshot: &GraphSnapshot,
    output_directory: &Path,
) -> io::Result<GraphRagExportManifest> {
    write_graph_rag_export_with_clock(snapshot, output_directory, &default_clock())
}
pub fn write_graph_rag_export_with_clock(
    snapshot: &GraphSnapshot,
    output_directory: &Path,
    clock: &Clock,
) -> io::Result<GraphRagExportManifest> {
    let version = snapshot
        .index
        .graph_version
        .as_ref()
        .filter(|version| !version.is_empty())
        .ok_or_else(|| {
            io_error("A versioned code graph is required before preparing GraphRAG data")
        })?;
    if output_directory.as_os_str().is_empty() {
        return Err(io::Error::from(io::ErrorKind::NotFound));
    }
    std::fs::create_dir_all(output_directory)?;
    let paths = [
        "entities.jsonl",
        "relationships.jsonl",
        "text_units.jsonl",
        "manifest.json",
    ]
    .map(|name| clean_join(output_directory, name));
    let prepared = to_graph_rag_data(snapshot);
    let manifest = GraphRagExportManifest {
        schema_version: 1,
        graph_version: version.clone(),
        generated_at: iso(clock()).map_err(io_error)?,
        entities_path: paths[0]
            .to_str()
            .ok_or_else(|| io_error("non-Unicode output path"))?
            .into(),
        relationships_path: paths[1]
            .to_str()
            .ok_or_else(|| io_error("non-Unicode output path"))?
            .into(),
        text_units_path: paths[2]
            .to_str()
            .ok_or_else(|| io_error("non-Unicode output path"))?
            .into(),
        entity_count: prepared.entities.len(),
        relationship_count: prepared.relationships.len(),
        text_unit_count: prepared.text_units.len(),
    };
    let contents = [
        json_lines(&prepared.entities),
        json_lines(&prepared.relationships),
        json_lines(&prepared.text_units),
        serde_json::to_string_pretty(&manifest).map_err(io_error)? + "\n",
    ];
    // All four writes are attempted, matching Promise.all's concurrent side effects.
    std::thread::scope(|scope| {
        let workers: Vec<_> = paths
            .iter()
            .zip(&contents)
            .map(|(path, contents)| scope.spawn(move || std::fs::write(path, contents)))
            .collect();
        let mut first_error = None;
        for worker in workers {
            let result = worker
                .join()
                .map_err(|_| io_error("export writer panicked"))
                .and_then(|result| result);
            if first_error.is_none() {
                first_error = result.err();
            }
        }
        first_error.map_or(Ok(()), Err)
    })?;
    Ok(manifest)
}
