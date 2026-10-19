//! Structured user.ask adapter over the real native pending-question service.
use crate::{
    services::input_requests::{QuestionInput, UserQuestionService},
    text::js_trim,
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::sync::LazyLock;

pub fn metadata() -> &'static Value {
    static DEFINITION: LazyLock<Value> = LazyLock::new(|| {
        serde_json::from_str(include_str!("user-ask-metadata.json"))
            .expect("embedded user.ask definition")
    });
    &DEFINITION
}
#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AskContext {
    pub session_id: String,
    pub user_id: Option<String>,
}
#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserAskInput {
    pub title: Option<String>,
    pub attention: Option<String>,
    pub questions: Vec<AskQuestion>,
}
#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AskQuestion {
    pub id: String,
    pub header: String,
    pub question: String,
    pub multi_select: Option<bool>,
    pub allow_freeform_input: Option<bool>,
    pub options: Option<Vec<AskOption>>,
}
#[derive(Clone, Default, Deserialize)]
pub struct AskOption {
    pub label: String,
    pub description: Option<String>,
    pub recommended: Option<bool>,
}
fn normalize(question: AskQuestion) -> Value {
    let mut result = json!({"id":js_trim(&question.id),"header":js_trim(&question.header),"question":js_trim(&question.question),
        "multiSelect":question.multi_select==Some(true),"allowFreeformInput":question.allow_freeform_input!=Some(false)});
    if let Some(options) = question.options {
        result["options"] = Value::Array(
            options
                .into_iter()
                .filter_map(|option| {
                    let label = js_trim(&option.label);
                    if label.is_empty() {
                        return None;
                    }
                    let mut result =
                        json!({"label":label,"recommended":option.recommended==Some(true)});
                    if let Some(description) = option
                        .description
                        .as_deref()
                        .map(js_trim)
                        .filter(|s| !s.is_empty())
                    {
                        result["description"] = json!(description);
                    }
                    Some(result)
                })
                .collect(),
        );
    }
    result
}
pub async fn execute(
    service: &UserQuestionService,
    input: UserAskInput,
    context: &AskContext,
) -> Value {
    let questions: Vec<_> = input.questions.into_iter().map(normalize).collect();
    if questions.is_empty() {
        return json!({"ok":false,"message":"At least one question is required."});
    }
    if questions.iter().any(|q| {
        ["id", "header", "question"]
            .iter()
            .any(|k| q[k].as_str().unwrap().is_empty())
    }) {
        return json!({"ok":false,"message":"Each question requires id, header, and question."});
    }
    let mut seen = vec![];
    let mut duplicates = vec![];
    for question in &questions {
        let id = question["id"].as_str().unwrap();
        if seen.contains(&id) && !duplicates.contains(&id) {
            duplicates.push(id);
        }
        seen.push(id);
    }
    if !duplicates.is_empty() {
        return json!({"ok":false,"message":format!("Duplicate question id(s): {}",duplicates.join(", "))});
    }
    let handle = service.ask(QuestionInput {
        session_id: context.session_id.clone(),
        user_id: context.user_id.clone(),
        requested_by: Some("user.ask".into()),
        title: input.title,
        attention: input.attention,
        questions,
    });
    match handle.result.await {
        Ok(Some(result)) => {
            json!({"ok":true,"message":"User answered the question request.","data":result})
        }
        _ => json!({"ok":false,"message":"The user did not answer the question request."}),
    }
}
