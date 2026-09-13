//! Read-only notification decision engine for the Rust shadow deployment.

use std::{collections::HashMap, sync::Arc};

use async_trait::async_trait;
use bluesky_jetstream::{CommitOperation, Event};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;
use tokio::sync::RwLock;
use url::Url;

/// A notification the production bot would be expected to enqueue.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct ShadowDecision {
    /// Stable key compatible with the TypeScript outbox key.
    pub key: String,
    /// Account that would receive the notification.
    pub recipient: String,
    /// Notification category.
    pub notification_type: NotificationType,
    /// Actor responsible for the event.
    pub actor: String,
}

/// Notification categories supported by Lunafications.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum NotificationType {
    /// An actor blocked the recipient.
    Blocked,
    /// An actor added the recipient to a list.
    List,
    /// A monitored actor published a top-level post.
    Post,
}

/// Errors returned while evaluating an event.
#[derive(Debug, Error)]
pub enum ShadowError {
    /// The event record did not have the expected shape.
    #[error("malformed {collection} record: missing {field}")]
    MalformedRecord {
        /// Collection containing the record.
        collection: String,
        /// Missing record field.
        field: &'static str,
    },
    /// The read-only state service failed.
    #[error("state lookup failed: {0}")]
    State(#[from] StateError),
}

/// Errors returned by a state lookup implementation.
#[derive(Debug, Error)]
#[error("{message}")]
pub struct StateError {
    message: String,
}

impl StateError {
    /// Creates a state lookup error.
    #[must_use]
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

/// Minimal read-only view of production notification preferences.
#[async_trait]
pub trait StateLookup: Send + Sync {
    /// Returns block and list preferences for an account.
    async fn settings(&self, did: &str) -> Result<Settings, StateError>;

    /// Returns accounts following posts made by `from`.
    async fn post_subscribers(&self, from: &str) -> Result<Vec<String>, StateError>;
}

/// Notification settings returned by the production service.
#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq)]
pub struct Settings {
    /// Whether block notifications are enabled.
    pub blocks: bool,
    /// Whether list notifications are enabled.
    pub lists: bool,
}

/// HTTP implementation of the read-only production state interface.
#[derive(Clone, Debug)]
pub struct HttpStateLookup {
    client: reqwest::Client,
    base_url: Url,
    token: String,
    snapshot: Arc<RwLock<Snapshot>>,
}

impl HttpStateLookup {
    /// Creates a state client.
    ///
    /// # Errors
    /// Returns an error if the base URL is invalid or the token is too short.
    pub fn new(base_url: &str, token: String) -> Result<Self, StateError> {
        if token.len() < 32 {
            return Err(StateError::new(
                "SHADOW_API_TOKEN must contain at least 32 characters",
            ));
        }
        let mut base_url =
            Url::parse(base_url).map_err(|error| StateError::new(error.to_string()))?;
        if !base_url.path().ends_with('/') {
            base_url.set_path(&format!("{}/", base_url.path()));
        }
        Ok(Self {
            client: reqwest::Client::new(),
            base_url,
            token,
            snapshot: Arc::new(RwLock::new(Snapshot::default())),
        })
    }

    /// Replaces the in-memory state with a fresh production snapshot.
    ///
    /// # Errors
    /// Returns an error if the snapshot request or decoding fails. The prior
    /// snapshot remains available when this happens.
    pub async fn refresh(&self) -> Result<(), StateError> {
        let url = self
            .base_url
            .join("internal/shadow/snapshot")
            .map_err(|error| StateError::new(error.to_string()))?;
        let response: SnapshotResponse = self
            .client
            .get(url)
            .bearer_auth(&self.token)
            .send()
            .await
            .map_err(|error| StateError::new(error.to_string()))?
            .error_for_status()
            .map_err(|error| StateError::new(error.to_string()))?
            .json()
            .await
            .map_err(|error| StateError::new(error.to_string()))?;
        *self.snapshot.write().await = response.into();
        Ok(())
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SnapshotResponse {
    settings: Vec<SettingsRow>,
    post_notifications: Vec<PostNotificationRow>,
}

#[derive(Debug, Deserialize)]
struct SettingsRow {
    did: String,
    blocks: u8,
    lists: u8,
}

#[derive(Debug, Deserialize)]
struct PostNotificationRow {
    did: String,
    from: String,
}

#[derive(Debug, Default)]
struct Snapshot {
    settings: HashMap<String, Settings>,
    subscribers: HashMap<String, Vec<String>>,
}

impl From<SnapshotResponse> for Snapshot {
    fn from(response: SnapshotResponse) -> Self {
        let settings = response
            .settings
            .into_iter()
            .map(|row| {
                (
                    row.did,
                    Settings {
                        blocks: row.blocks == 1,
                        lists: row.lists == 1,
                    },
                )
            })
            .collect();
        let mut subscribers: HashMap<String, Vec<String>> = HashMap::new();
        for row in response.post_notifications {
            subscribers.entry(row.from).or_default().push(row.did);
        }
        Self {
            settings,
            subscribers,
        }
    }
}

#[async_trait]
impl StateLookup for HttpStateLookup {
    async fn settings(&self, did: &str) -> Result<Settings, StateError> {
        Ok(self
            .snapshot
            .read()
            .await
            .settings
            .get(did)
            .copied()
            .unwrap_or_default())
    }

    async fn post_subscribers(&self, from: &str) -> Result<Vec<String>, StateError> {
        Ok(self
            .snapshot
            .read()
            .await
            .subscribers
            .get(from)
            .cloned()
            .unwrap_or_default())
    }
}

/// Evaluates one Jetstream event without performing writes or deliveries.
///
/// # Errors
/// Returns an error for a malformed relevant record or failed state lookup.
pub async fn evaluate_event(
    event: &Event,
    state: &impl StateLookup,
) -> Result<Vec<ShadowDecision>, ShadowError> {
    let Event::Commit {
        did,
        time_us,
        commit,
    } = event
    else {
        return Ok(Vec::new());
    };
    if commit.operation != CommitOperation::Create {
        return Ok(Vec::new());
    }
    let Some(record) = commit.record.as_ref() else {
        return Ok(Vec::new());
    };
    let event_id = format!("{time_us}:{}", commit.rkey);

    match commit.collection.as_str() {
        "app.bsky.graph.block" => {
            let subject = field(record, "subject", &commit.collection)?;
            if !state.settings(subject).await?.blocks {
                return Ok(Vec::new());
            }
            Ok(vec![decision(
                subject,
                NotificationType::Blocked,
                did,
                &event_id,
            )])
        }
        "app.bsky.graph.listitem" => {
            let subject = field(record, "subject", &commit.collection)?;
            let _list = field(record, "list", &commit.collection)?;
            if !state.settings(subject).await?.lists {
                return Ok(Vec::new());
            }
            Ok(vec![decision(
                subject,
                NotificationType::List,
                did,
                &event_id,
            )])
        }
        "app.bsky.feed.post" => {
            if record.get("reply").is_some_and(|reply| !reply.is_null()) {
                return Ok(Vec::new());
            }
            Ok(state
                .post_subscribers(did)
                .await?
                .into_iter()
                .map(|recipient| decision(&recipient, NotificationType::Post, did, &event_id))
                .collect())
        }
        _ => Ok(Vec::new()),
    }
}

fn field<'a>(
    record: &'a Value,
    name: &'static str,
    collection: &str,
) -> Result<&'a str, ShadowError> {
    record
        .get(name)
        .and_then(Value::as_str)
        .ok_or_else(|| ShadowError::MalformedRecord {
            collection: collection.to_owned(),
            field: name,
        })
}

fn decision(
    recipient: &str,
    notification_type: NotificationType,
    actor: &str,
    event_id: &str,
) -> ShadowDecision {
    let kind = match notification_type {
        NotificationType::Blocked => "blocked",
        NotificationType::List => "list",
        NotificationType::Post => "post",
    };
    ShadowDecision {
        key: format!("{recipient}:{kind}:{actor}:{event_id}"),
        recipient: recipient.to_owned(),
        notification_type,
        actor: actor.to_owned(),
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use bluesky_jetstream::{Commit, Event};
    use serde_json::json;

    use super::*;

    struct FakeState {
        settings: HashMap<String, Settings>,
        subscribers: HashMap<String, Vec<String>>,
    }

    #[async_trait]
    impl StateLookup for FakeState {
        async fn settings(&self, did: &str) -> Result<Settings, StateError> {
            Ok(self.settings.get(did).copied().unwrap_or_default())
        }

        async fn post_subscribers(&self, from: &str) -> Result<Vec<String>, StateError> {
            Ok(self.subscribers.get(from).cloned().unwrap_or_default())
        }
    }

    fn event(collection: &str, record: Value) -> Event {
        Event::Commit {
            did: "did:plc:actor".into(),
            time_us: 123,
            commit: Commit {
                operation: CommitOperation::Create,
                rev: "rev".into(),
                collection: collection.into(),
                rkey: "rkey".into(),
                record: Some(record),
                cid: Some("cid".into()),
            },
        }
    }

    fn state() -> FakeState {
        FakeState {
            settings: HashMap::from([(
                "did:plc:subject".into(),
                Settings {
                    blocks: true,
                    lists: true,
                },
            )]),
            subscribers: HashMap::from([(
                "did:plc:actor".into(),
                vec!["did:plc:one".into(), "did:plc:two".into()],
            )]),
        }
    }

    #[tokio::test]
    async fn mirrors_block_and_list_decision_keys() {
        let block = evaluate_event(
            &event(
                "app.bsky.graph.block",
                json!({ "subject": "did:plc:subject" }),
            ),
            &state(),
        )
        .await
        .unwrap();
        assert_eq!(
            block[0].key,
            "did:plc:subject:blocked:did:plc:actor:123:rkey"
        );

        let list = evaluate_event(
            &event(
                "app.bsky.graph.listitem",
                json!({ "subject": "did:plc:subject", "list": "at://did:plc:actor/app.bsky.graph.list/list" }),
            ),
            &state(),
        )
        .await
        .unwrap();
        assert_eq!(list[0].notification_type, NotificationType::List);
    }

    #[tokio::test]
    async fn emits_each_post_subscriber_but_ignores_replies() {
        let decisions = evaluate_event(
            &event("app.bsky.feed.post", json!({ "text": "hello" })),
            &state(),
        )
        .await
        .unwrap();
        assert_eq!(decisions.len(), 2);
        assert_eq!(decisions[0].recipient, "did:plc:one");

        let reply = evaluate_event(
            &event(
                "app.bsky.feed.post",
                json!({ "reply": { "root": {}, "parent": {} } }),
            ),
            &state(),
        )
        .await
        .unwrap();
        assert!(reply.is_empty());
    }

    #[tokio::test]
    async fn ignores_disabled_irrelevant_and_non_create_events() {
        let disabled = FakeState {
            settings: HashMap::new(),
            subscribers: HashMap::new(),
        };
        assert!(
            evaluate_event(
                &event(
                    "app.bsky.graph.block",
                    json!({ "subject": "did:plc:subject" })
                ),
                &disabled,
            )
            .await
            .unwrap()
            .is_empty()
        );
        assert!(
            evaluate_event(&event("app.bsky.feed.like", json!({})), &disabled)
                .await
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn rejects_short_api_tokens() {
        assert!(HttpStateLookup::new("https://example.com", "short".into()).is_err());
    }

    #[test]
    fn converts_api_snapshot_into_indexed_state() {
        let snapshot = Snapshot::from(SnapshotResponse {
            settings: vec![SettingsRow {
                did: "did:plc:subject".into(),
                blocks: 1,
                lists: 0,
            }],
            post_notifications: vec![
                PostNotificationRow {
                    did: "did:plc:one".into(),
                    from: "did:plc:actor".into(),
                },
                PostNotificationRow {
                    did: "did:plc:two".into(),
                    from: "did:plc:actor".into(),
                },
            ],
        });
        assert!(snapshot.settings["did:plc:subject"].blocks);
        assert!(!snapshot.settings["did:plc:subject"].lists);
        assert_eq!(snapshot.subscribers["did:plc:actor"].len(), 2);
    }
}
