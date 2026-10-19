//! Model-facing payload policy and usage accounting. UI payloads stay untouched.
//! Provider/chat composition must use these helpers when those adapters are ported.
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

pub fn project_model_data(value: &Value) -> Value {
    let mut value = value.clone();
    if let Some(object) = value.as_object_mut() {
        object.shift_remove("terminalOutputAnsi");
        if object.get("output").is_some_and(Value::is_string) {
            object.shift_remove("terminalOutput");
        }
    }
    value
}

fn js_len(text: &str) -> usize { text.encode_utf16().count() }
fn prefix(text: &str, length: usize) -> String {
    let mut units: Vec<u16> = text.encode_utf16().take(length).collect();
    if units.last().is_some_and(|u| (0xd800..=0xdbff).contains(u)) { units.pop(); }
    String::from_utf16(&units).expect("complete UTF-16 pairs")
}
pub fn bound_model_data(value: &Value, max_chars: usize) -> Value {
    let serialized = crate::contracts::bounded_json::JsonGraph::from_value(value).stringify().expect("JSON");
    if js_len(&serialized) <= max_chars { return value.clone(); }
    let mut output = json!({"truncated":true,"originalChars":js_len(&serialized),"preview":""});
    for key in ["ok","exitCode","timedOut","needsInteraction","terminalId","outputOffset","outputEndOffset"] {
        if let Some(v) = value.get(key)
            && (v.is_null() || v.is_boolean() || v.is_number() || v.is_string()) {
            output[key] = v.clone();
        }
    }
    let (mut low, mut high) = (0, js_len(&serialized));
    while low < high {
        let mid = low + (high - low).div_ceil(2);
        output["preview"] = json!(prefix(&serialized, mid));
        if js_len(&output.to_string()) <= max_chars { low = mid; } else { high = mid - 1; }
    }
    output["preview"] = json!(prefix(&serialized, low));
    output
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all="camelCase")]
pub struct ModelUsage {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub scope: String,
    #[serde(skip_serializing_if="Option::is_none")]
    pub cached_input_tokens: Option<u64>,
    #[serde(skip_serializing_if="Option::is_none")]
    pub total_tokens: Option<u64>,
    #[serde(skip_serializing_if="Option::is_none")]
    pub request_count: Option<u64>,
    #[serde(skip_serializing_if="Option::is_none")]
    pub id: Option<String>,
    #[serde(skip_serializing_if="Option::is_none")]
    pub last_request: Option<Box<ModelUsage>>,
}
fn count(value: Option<&Value>) -> Option<u64> { value?.as_u64().filter(|v| *v <= 9_007_199_254_740_991) }
fn field<'a>(value: &'a Value, names: &[&str]) -> Option<&'a Value> {
    names.iter().find_map(|key| value.get(key).filter(|v| !v.is_null()))
}
fn counters(value: &Value, scope: &str) -> Option<ModelUsage> {
    let input_tokens = count(field(value, &["inputTokens","input_tokens"]))?;
    let output_tokens = count(field(value, &["outputTokens","output_tokens"]))?;
    let cached_input_tokens = count(field(value, &["cachedInputTokens","cached_input_tokens","cachedReadTokens"]));
    if cached_input_tokens.is_some_and(|n| n > input_tokens) { return None; }
    Some(ModelUsage { input_tokens, output_tokens, scope: scope.into(), cached_input_tokens,
        total_tokens: count(field(value, &["totalTokens","total_tokens"])),
        request_count: count(value.get("requestCount")), id:None, last_request:None })
}
pub fn parse_codex_usage(params: &Value) -> Option<ModelUsage> {
    let body = params.get("msg").unwrap_or(params);
    let usage = body.get("tokenUsage").or_else(|| body.get("info"))?;
    let mut total = counters(usage.get("total").or_else(|| usage.get("total_token_usage"))?, "session")?;
    total.last_request = usage.get("last").or_else(||usage.get("last_token_usage")).and_then(|v|counters(v,"turn")).map(Box::new);
    Some(total)
}
pub fn parse_acp_usage(value: &Value, id: &str) -> Option<ModelUsage> {
    let mut usage = counters(value,"turn")?;
    usage.id = Some(id.into());
    Some(usage)
}
fn sum(values: &[ModelUsage]) -> ModelUsage {
    ModelUsage {
        input_tokens:values.iter().map(|v|v.input_tokens).sum(), output_tokens:values.iter().map(|v|v.output_tokens).sum(), scope:"turn".into(),
        cached_input_tokens:values.iter().map(|v|v.cached_input_tokens).sum(),
        request_count:values.iter().map(|v|v.request_count).sum(),
        total_tokens:None, id:None, last_request:None,
    }
}
#[derive(Default)]
pub struct TurnUsageAccumulator {
    pub baseline: Option<ModelUsage>,
    fresh: bool,
    accumulated: Vec<ModelUsage>,
    turns: std::collections::BTreeMap<String,ModelUsage>,
}
impl TurnUsageAccumulator {
    pub fn new(baseline: Option<ModelUsage>, fresh: bool) -> Self { Self {baseline,fresh,..Self::default()} }
    pub fn add(&mut self, usage: ModelUsage) {
        if usage.scope == "turn" {
            self.turns.insert(usage.id.clone().unwrap_or("turn".into()), usage);
            return;
        }
        let previous = self.baseline.as_ref();
        if previous.is_some_and(|p| usage.input_tokens < p.input_tokens || usage.output_tokens < p.output_tokens ||
            (usage.input_tokens == p.input_tokens && usage.output_tokens == p.output_tokens)) {return;}
        let delta = if let Some(p) = previous {
            let mut d = usage.clone();
            d.input_tokens -= p.input_tokens; d.output_tokens -= p.output_tokens;
            d.cached_input_tokens = usage.cached_input_tokens.zip(p.cached_input_tokens).map(|(a,b)|a.saturating_sub(b));
            d.request_count = usage.request_count.zip(p.request_count).map(|(a,b)|a.saturating_sub(b)); Some(d)
        } else if self.fresh {Some(usage.clone())} else { usage.last_request.as_deref().cloned() };
        self.baseline = Some(usage);
        if let Some(delta) = delta {self.accumulated.push(delta);}
    }
    pub fn metrics(&self, duration: u64) -> Option<Value> {
        let values = if self.turns.is_empty() {self.accumulated.clone()} else {self.turns.values().cloned().collect()};
        if values.is_empty() {return None;}
        let total = sum(&values);
        let mut result = json!({"durationMs":duration,"promptTokens":total.input_tokens,"completionTokens":total.output_tokens,
            "totalTokens":total.input_tokens+total.output_tokens,"tokenUsageEstimated":false});
        if let Some(v) = total.cached_input_tokens {result["cachedPromptTokens"]=json!(v);}
        if let Some(v) = total.request_count {result["requestCount"]=json!(v);}
        Some(result)
    }
}
