//! Native port of `packages/gateway/src/services/messenger-history.ts`.
//!
//! The TypeScript service owns a Matrix Olm machine (real Megolm/curve25519
//! crypto behind `@matrix-org/matrix-sdk-crypto-wasm`) and downloads a room-key
//! backup through `matrix-bot-sdk`. Everything the module itself decides is
//! ported here: recovery-key decoding, Matrix-id validation, backup scoping and
//! request order, the 50 000-session ceiling, per-session merge semantics,
//! close/double-close behaviour and recovery-key zeroization.
//!
//! The two external capabilities stay behind explicit ports because the Rust
//! gateway has no Megolm implementation and must not grow a second HTTP stack
//! per service:
//!
//! * [`BackupCrypto`] performs `BackupDecryptionKey` derivation and V1 session
//!   decryption. No Rust dependency provides it, so the host supplies it (or
//!   keeps the existing TypeScript service for the cryptographic step until a
//!   reviewed native crypto crate is adopted).
//! * [`HistoryMachine`] is the Olm machine handle: import/export of room keys
//!   and single-event decryption with a fixed untrusted trust requirement.
//! * [`BackupClient`] is the authenticated `GET` transport. The bundled
//!   [`MatrixBackupHttpClient`] is a real `reqwest` implementation with an
//!   owned response ceiling; it is exercised against a loopback listener in the
//!   contract test.
//!
//! Deliberate behavioural differences from the TypeScript service are marked
//! `PARITY:` and are limited to the two cases the SDK shape makes unavoidable:
//! typed errors instead of wasm exceptions, and closing the machine when key
//! import fails inside `create` (TypeScript leaks that handle).

use crate::contracts::bounded_json::JsonGraph;
use serde_json::{Map, Value};
use std::fmt;
use std::future::Future;
use std::pin::Pin;
use std::time::Duration;

pub const BACKUP_ALGORITHM: &str = "m.megolm_backup.v1.curve25519-aes-sha2";
pub const SESSION_LIMIT: usize = 50_000;
pub const VERSION_PATH: &str = "/_matrix/client/v3/room_keys/version";
pub const KEYS_PATH: &str = "/_matrix/client/v3/room_keys/keys";
pub const INVALID_RECOVERY_KEY: &str = "Invalid recovery key.";
pub const BACKUP_MISMATCH: &str = "Recovery key does not match this backup.";
pub const RECOVERY_LIMIT_EXCEEDED: &str = "Backup exceeds the recovery limit.";
pub const CLOSED_MACHINE: &str = "null pointer passed to rust";
pub const CANCELLED: &str = "history recovery cancelled";
pub const SIGIL_MESSAGE: &str = "leading sigil is incorrect or missing";
pub const COLON_MESSAGE: &str = "required colon is missing";
pub const SERVER_MESSAGE: &str = "server name is not a valid IP address or domain name";
pub const MAX_RECOVERY_KEY_UNITS: usize = 100;

const RECOVERY_ALPHABET: &[u8] = b"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const RECOVERY_BYTES: usize = 35;
const RECOVERY_PREFIX: [u8; 2] = [0x8b, 1];

pub type MachineFuture<'a, T> = Pin<Box<dyn Future<Output = Result<T, HistoryError>> + Send + 'a>>;
pub type CryptoFuture<'a, T> = Pin<Box<dyn Future<Output = Result<T, String>> + Send + 'a>>;
pub type ClientFuture<'a, T> = Pin<Box<dyn Future<Output = Result<T, String>> + Send + 'a>>;

/// Typed replacement for the exceptions the TypeScript service throws.
///
/// [`HistoryError::class`] is a stable differential label: it lets a contract
/// test compare native and TypeScript outcomes without depending on provider or
/// wasm wording.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum HistoryError {
    InvalidRecoveryKey,
    BackupMismatch,
    RecoveryLimit,
    /// `UserId`/`RoomId` parse failure, message taken from the wasm boundary.
    InvalidMatrixId(&'static str),
    /// Backup `GET` failed: transport failure or Matrix `errcode`/`error` reply.
    BackupRequest(String),
    /// Recovery-key material could not be turned into a backup key.
    BackupCrypto(String),
    /// The downloaded payload has a shape the TypeScript service rejects with a
    /// `TypeError` before reaching wasm.
    MalformedBackup(String),
    /// Session decryption failed inside the SDK (`MegolmDecryptionError`).
    UndecodableSession(String),
    /// `JSON.parse` of a decrypted session or decrypted event failed.
    UnreadablePayload(String),
    /// Event decryption failed; TypeScript's `MegolmDecryptionError` has no
    /// message, so [`HistoryError::message`] is empty for this variant.
    DecryptFailed,
    Closed,
    Cancelled,
}

impl HistoryError {
    pub fn class(&self) -> &'static str {
        match self {
            Self::InvalidRecoveryKey => "invalid-recovery-key",
            Self::BackupMismatch => "backup-mismatch",
            Self::RecoveryLimit => "recovery-limit",
            Self::InvalidMatrixId(_) => "matrix-id",
            Self::BackupRequest(_) => "backup-request",
            Self::BackupCrypto(_) => "backup-crypto",
            Self::MalformedBackup(_) => "malformed-backup",
            Self::UndecodableSession(_) => "undecodable-session",
            Self::UnreadablePayload(_) => "unreadable-payload",
            Self::DecryptFailed => "decrypt-failed",
            Self::Closed => "closed",
            Self::Cancelled => "cancelled",
        }
    }

    pub fn message(&self) -> &str {
        match self {
            Self::InvalidRecoveryKey => INVALID_RECOVERY_KEY,
            Self::BackupMismatch => BACKUP_MISMATCH,
            Self::RecoveryLimit => RECOVERY_LIMIT_EXCEEDED,
            Self::InvalidMatrixId(message) => message,
            Self::BackupRequest(message)
            | Self::BackupCrypto(message)
            | Self::MalformedBackup(message)
            | Self::UndecodableSession(message)
            | Self::UnreadablePayload(message) => message,
            Self::DecryptFailed => "",
            Self::Closed => CLOSED_MACHINE,
            Self::Cancelled => CANCELLED,
        }
    }
}

impl fmt::Display for HistoryError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.message())
    }
}

impl std::error::Error for HistoryError {}

/// A decoded 35-byte backup recovery key: `0x8b`, version `1`, 32 key bytes and
/// a trailing XOR checksum byte.
///
/// The key material is zeroized by [`RecoveryKey::wipe`] and by `Drop`, so the
/// `finally { key.fill(0) }` guarantee of the TypeScript service also holds on
/// every early-return path.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RecoveryKey {
    bytes: [u8; 32],
    wiped: bool,
}

impl RecoveryKey {
    /// Decodes the base58check-style string accepted by the TypeScript module.
    ///
    /// Rejects, in order: empty or over-long input (JS `String.length`, i.e.
    /// UTF-16 units, must stay at or below 100), any character outside the
    /// Bitcoin base58 alphabet, a big-integer that cannot fit the fixed
    /// accumulator, and any payload that is not exactly 35 bytes with the
    /// `0x8b 0x01` prefix and a matching XOR checksum.
    pub fn decode(input: &str) -> Result<Self, HistoryError> {
        let value: String = input.chars().filter(|ch| !js_whitespace(*ch)).collect();
        if value.is_empty() || value.encode_utf16().count() > MAX_RECOVERY_KEY_UNITS {
            return Err(HistoryError::InvalidRecoveryKey);
        }
        // 100 base58 digits need at most 74 bytes; 128 leaves headroom so the
        // accumulator can never wrap before the length check rejects the value.
        let mut accumulator = [0_u8; 128];
        for ch in value.chars() {
            let Some(digit) = RECOVERY_ALPHABET
                .iter()
                .position(|candidate| *candidate as char == ch)
            else {
                accumulator.fill(0);
                return Err(HistoryError::InvalidRecoveryKey);
            };
            let mut carry = digit as u32;
            for slot in accumulator.iter_mut().rev() {
                let total = (*slot as u32) * 58 + carry;
                *slot = (total & 0xff) as u8;
                carry = total >> 8;
            }
            if carry != 0 {
                accumulator.fill(0);
                return Err(HistoryError::InvalidRecoveryKey);
            }
        }
        let start = accumulator
            .iter()
            .position(|byte| *byte != 0)
            .unwrap_or(accumulator.len());
        let mut data = accumulator[start..].to_vec();
        accumulator.fill(0);
        // `decodeRecoveryKey` unshifts one zero byte for every leading `1`.
        for ch in value.chars() {
            if ch != '1' {
                break;
            }
            data.insert(0, 0);
        }
        let valid = data.len() == RECOVERY_BYTES
            && data[0] == RECOVERY_PREFIX[0]
            && data[1] == RECOVERY_PREFIX[1]
            && data.iter().fold(0_u8, |acc, byte| acc ^ byte) == 0;
        if !valid {
            data.fill(0);
            return Err(HistoryError::InvalidRecoveryKey);
        }
        let mut bytes = [0_u8; 32];
        bytes.copy_from_slice(&data[2..RECOVERY_BYTES - 1]);
        data.fill(0);
        Ok(Self { bytes, wiped: false })
    }

    pub fn bytes(&self) -> &[u8; 32] {
        &self.bytes
    }

    pub fn is_wiped(&self) -> bool {
        self.wiped
    }

    /// Overwrites the key bytes. Idempotent; reads after a wipe see zeros.
    pub fn wipe(&mut self) {
        self.bytes.fill(0);
        self.wiped = true;
    }
}

impl Drop for RecoveryKey {
    fn drop(&mut self) {
        self.wipe();
    }
}

/// Validates the `UserId` grammar the TypeScript service accepts.
///
/// The sigil, colon and server-name rules match `ruma`'s `UserId` parser as
/// observed through the wasm boundary (see the lane review for the exact
/// accepted/rejected matrix). The local part is intentionally unchecked, as in
/// `ruma`, and a device id has no grammar at all.
pub fn validate_user_id(value: &str) -> Result<(), HistoryError> {
    let Some(rest) = value.strip_prefix('@') else {
        return Err(HistoryError::InvalidMatrixId(SIGIL_MESSAGE));
    };
    let Some((_, server)) = rest.split_once(':') else {
        return Err(HistoryError::InvalidMatrixId(COLON_MESSAGE));
    };
    if !valid_server_name(server) {
        return Err(HistoryError::InvalidMatrixId(SERVER_MESSAGE));
    }
    Ok(())
}

/// Validates the `RoomId` grammar: only the `!` sigil is enforced.
pub fn validate_room_id(value: &str) -> Result<(), HistoryError> {
    if value.starts_with('!') {
        Ok(())
    } else {
        Err(HistoryError::InvalidMatrixId(SIGIL_MESSAGE))
    }
}

fn valid_server_name(text: &str) -> bool {
    if text.is_empty() {
        return false;
    }
    if let Some(rest) = text.strip_prefix('[') {
        let Some((inside, after)) = rest.split_once(']') else {
            return false;
        };
        let literal = !inside.is_empty()
            && inside
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit() || byte == b':' || byte == b'.');
        return literal && (after.is_empty() || after.strip_prefix(':').is_some_and(valid_port));
    }
    let (host, port) = match text.split_once(':') {
        Some((host, port)) => (host, Some(port)),
        None => (text, None),
    };
    if let Some(port) = port
        && !valid_port(port)
    {
        return false;
    }
    !host.is_empty()
        && host
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-' | b'_'))
}

fn valid_port(text: &str) -> bool {
    !text.is_empty()
        && text.len() <= 5
        && text.bytes().all(|byte| byte.is_ascii_digit())
        && text.parse::<u16>().is_ok()
}

/// One encrypted Megolm session as read out of the backup payload.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EncryptedSession {
    pub ephemeral: String,
    pub mac: String,
    pub ciphertext: String,
}

/// `BackupDecryptionKey` derivation and V1 session decryption.
pub trait BackupCrypto: Send + Sync {
    /// Public key for the recovered key material, base64 encoded. Must match
    /// `auth_data.public_key` of the backup version or the restore is refused
    /// before the keys are downloaded.
    fn public_key(&self, key: &RecoveryKey) -> Result<String, String>;
    /// Decrypts one session blob into the clear-session JSON document.
    fn decrypt_session<'a>(
        &'a self,
        key: &'a RecoveryKey,
        session: &'a EncryptedSession,
    ) -> CryptoFuture<'a, String>;
}

/// Trust requirement passed to `decryptRoomEvent`. The TypeScript service always
/// uses `Untrusted`; the enum makes that choice explicit and greppable.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TrustRequirement {
    Untrusted,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DecryptRequest {
    pub event: String,
    pub room_id: String,
    pub trust: TrustRequirement,
}

/// The Olm machine handle owned by one history service.
pub trait HistoryMachine: Send {
    fn import_room_keys<'a>(&'a mut self, exported: &'a str) -> MachineFuture<'a, ()>;
    fn export_room_keys<'a>(&'a mut self) -> MachineFuture<'a, String>;
    fn decrypt_room_event<'a>(&'a mut self, request: DecryptRequest) -> MachineFuture<'a, String>;
    /// Releases the handle. Calling it twice must fail, mirroring the wasm
    /// "null pointer passed to rust" throw; the service enforces that state
    /// itself so a port cannot silently succeed twice.
    fn close(&mut self) -> Result<(), HistoryError>;
}

/// Creates the machine for a validated user/device pair.
pub trait HistoryMachines: Send + Sync {
    fn initialize<'a>(
        &'a self,
        user_id: &'a str,
        device_id: &'a str,
    ) -> MachineFuture<'a, Box<dyn HistoryMachine>>;
}

/// One authenticated backup `GET`. The query value is already serialized with
/// JavaScript `String()` semantics, matching what `matrix-bot-sdk` puts on the
/// wire (`?version=1`, and an empty value for a non-scalar version).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BackupRequest {
    pub path: &'static str,
    pub query: Vec<(String, String)>,
}

impl BackupRequest {
    pub fn new(path: &'static str) -> Self {
        Self {
            path,
            query: Vec::new(),
        }
    }

    pub fn query(mut self, key: &str, value: impl Into<String>) -> Self {
        self.query.push((key.to_owned(), value.into()));
        self
    }

    /// Wire form of the request, used both for the URL and for audit entries so
    /// native request order can be compared with the TypeScript server log.
    pub fn target(&self) -> String {
        let mut target = self.path.to_owned();
        if !self.query.is_empty() {
            target.push('?');
            for (index, (key, value)) in self.query.iter().enumerate() {
                if index > 0 {
                    target.push('&');
                }
                target.push_str(&encode_query(key));
                target.push('=');
                target.push_str(&encode_query(value));
            }
        }
        target
    }
}

/// Authenticated Matrix backup transport.
pub trait BackupClient: Send + Sync {
    fn get<'a>(&'a self, request: BackupRequest) -> ClientFuture<'a, Value>;
}

/// Cooperative cancellation, checked between observable steps and per session.
pub trait Cancellation: Send + Sync {
    fn is_cancelled(&self) -> bool;
}

pub struct NoCancellation;

impl Cancellation for NoCancellation {
    fn is_cancelled(&self) -> bool {
        false
    }
}

fn checkpoint(cancel: &dyn Cancellation) -> Result<(), HistoryError> {
    if cancel.is_cancelled() {
        Err(HistoryError::Cancelled)
    } else {
        Ok(())
    }
}

/// Observable summary of one restore attempt, populated even on failure.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct RestoreAudit {
    /// Request targets attempted, in order.
    pub requests: Vec<String>,
    /// Sessions decrypted successfully before the attempt stopped.
    pub sessions_read: usize,
    /// Sessions handed to `import_room_keys`.
    pub sessions_imported: usize,
    /// Whether the decoded recovery key was wiped when the attempt finished.
    pub key_wiped: bool,
    /// Whether the download, import and re-export all completed.
    pub completed: bool,
}

/// Native counterpart of the exported `MessengerHistory` class.
pub struct MessengerHistory {
    machine: Option<Box<dyn HistoryMachine>>,
    closed: bool,
    audit: RestoreAudit,
}

impl MessengerHistory {
    /// Validates the user id, creates the machine, and imports previously
    /// exported sessions when the argument is non-empty.
    ///
    /// PARITY: when `import_room_keys` fails the machine is closed before the
    /// error is returned. The TypeScript `create` has no `finally` and leaks the
    /// Olm machine handle in that case.
    pub async fn create(
        machines: &dyn HistoryMachines,
        user_id: &str,
        device_id: &str,
        exported: Option<&str>,
    ) -> Result<Self, HistoryError> {
        validate_user_id(user_id)?;
        let mut machine = machines.initialize(user_id, device_id).await?;
        if let Some(payload) = exported.filter(|value| !value.is_empty()) {
            if let Err(error) = machine.import_room_keys(payload).await {
                let _ = machine.close();
                return Err(error);
            }
        }
        Ok(Self {
            machine: Some(machine),
            closed: false,
            audit: RestoreAudit::default(),
        })
    }

    /// Downloads the backup, decrypts every session and returns the re-exported
    /// key document as a JSON *string*, exactly like the TypeScript service.
    ///
    /// Invalid recovery keys are rejected before any request is made, a version
    /// mismatch stops after the version request, and the 50 000-session ceiling
    /// is checked before each session is decrypted. The decoded key is wiped on
    /// every exit path.
    pub async fn restore(
        &mut self,
        client: &dyn BackupClient,
        crypto: &dyn BackupCrypto,
        recovery_key: &str,
        cancel: &dyn Cancellation,
    ) -> Result<String, HistoryError> {
        let mut key = RecoveryKey::decode(recovery_key)?;
        self.audit = RestoreAudit::default();
        let outcome = self.restore_decoded(client, crypto, &key, cancel).await;
        key.wipe();
        self.audit.key_wiped = key.is_wiped();
        outcome
    }

    async fn restore_decoded(
        &mut self,
        client: &dyn BackupClient,
        crypto: &dyn BackupCrypto,
        key: &RecoveryKey,
        cancel: &dyn Cancellation,
    ) -> Result<String, HistoryError> {
        let public_key = crypto.public_key(key).map_err(HistoryError::BackupCrypto)?;
        checkpoint(cancel)?;
        let version = self
            .request(client, BackupRequest::new(VERSION_PATH))
            .await?;
        let version_value = version.get("version").filter(|value| js_truthy(value));
        let algorithm_ok =
            version.get("algorithm").and_then(Value::as_str) == Some(BACKUP_ALGORITHM);
        let public_key_ok = version
            .get("auth_data")
            .and_then(|auth_data| auth_data.get("public_key"))
            .and_then(Value::as_str)
            == Some(public_key.as_str());
        let Some(version_value) = version_value else {
            return Err(HistoryError::BackupMismatch);
        };
        if !algorithm_ok || !public_key_ok {
            return Err(HistoryError::BackupMismatch);
        }
        checkpoint(cancel)?;
        let scoped = self
            .request(
                client,
                BackupRequest::new(KEYS_PATH).query("version", js_query_string(version_value)),
            )
            .await?;
        if scoped.is_null() {
            return Err(HistoryError::MalformedBackup(
                "null is not an object (evaluating 'response.rooms')".into(),
            ));
        }
        let rooms = scoped.get("rooms").cloned().unwrap_or(Value::Null);
        let mut recovered: Vec<Value> = Vec::new();
        for (room_id, room) in js_entries(&rooms) {
            if room.value().is_null() {
                return Err(HistoryError::MalformedBackup(
                    "null is not an object (evaluating 'room.sessions')".into(),
                ));
            }
            let sessions = match room.value().get("sessions") {
                Some(sessions) if !sessions.is_null() => sessions.clone(),
                _ => Value::Null,
            };
            for (session_id, session) in js_entries(&sessions) {
                if recovered.len() >= SESSION_LIMIT {
                    return Err(HistoryError::RecoveryLimit);
                }
                checkpoint(cancel)?;
                if session.value().is_null() {
                    return Err(HistoryError::MalformedBackup(
                        "null is not an object (evaluating 'session.session_data')".into(),
                    ));
                }
                let Some(session_data) = session.value().get("session_data") else {
                    return Err(HistoryError::MalformedBackup(
                        "undefined is not an object (evaluating 'encrypted.ephemeral')".into(),
                    ));
                };
                if session_data.is_null() {
                    return Err(HistoryError::MalformedBackup(
                        "null is not an object (evaluating 'encrypted.ephemeral')".into(),
                    ));
                }
                let encrypted = EncryptedSession {
                    ephemeral: string_argument(session_data, "ephemeral")?,
                    mac: string_argument(session_data, "mac")?,
                    ciphertext: string_argument(session_data, "ciphertext")?,
                };
                let clear = crypto
                    .decrypt_session(key, &encrypted)
                    .await
                    .map_err(HistoryError::UndecodableSession)?;
                let clear: Value = serde_json::from_str(&clear).map_err(|error| {
                    HistoryError::UnreadablePayload(format!("JSON Parse error: {error}"))
                })?;
                self.audit.sessions_read += 1;
                recovered.push(merge_session(&clear, &room_id, &session_id));
            }
        }
        self.audit.sessions_imported = recovered.len();
        let payload = JsonGraph::from_value(&Value::Array(recovered))
            .stringify()
            .ok_or_else(|| {
                HistoryError::MalformedBackup("session payload is not JSON-serializable".into())
            })?;
        checkpoint(cancel)?;
        let exported = {
            let machine = self.machine_mut()?;
            machine.import_room_keys(&payload).await?;
            machine.export_room_keys().await?
        };
        self.audit.completed = true;
        Ok(exported)
    }

    /// Decrypts one historical event with `TrustRequirement::Untrusted`.
    ///
    /// A closed service still validates the room id first, then fails at the
    /// machine boundary, matching the TypeScript statement order.
    pub async fn decrypt(
        &mut self,
        room_id: &str,
        event: &Value,
    ) -> Result<Value, HistoryError> {
        validate_room_id(room_id)?;
        let request = DecryptRequest {
            event: JsonGraph::from_value(event)
                .stringify()
                .unwrap_or_else(|| "null".to_owned()),
            room_id: room_id.to_owned(),
            trust: TrustRequirement::Untrusted,
        };
        let decrypted = self.machine_mut()?.decrypt_room_event(request).await?;
        serde_json::from_str(&decrypted)
            .map_err(|error| HistoryError::UnreadablePayload(format!("JSON parse: {error}")))
    }

    /// Releases the machine. A second close fails with [`HistoryError::Closed`],
    /// like the wasm null-pointer throw, and leaves the service closed.
    pub fn close(&mut self) -> Result<(), HistoryError> {
        if self.closed {
            return Err(HistoryError::Closed);
        }
        let Some(mut machine) = self.machine.take() else {
            return Err(HistoryError::Closed);
        };
        self.closed = true;
        machine.close()
    }

    pub fn audit(&self) -> &RestoreAudit {
        &self.audit
    }

    pub fn is_closed(&self) -> bool {
        self.closed
    }

    async fn request(
        &mut self,
        client: &dyn BackupClient,
        request: BackupRequest,
    ) -> Result<Value, HistoryError> {
        self.audit.requests.push(request.target());
        client
            .get(request)
            .await
            .map_err(HistoryError::BackupRequest)
    }

    fn machine_mut(&mut self) -> Result<&mut Box<dyn HistoryMachine>, HistoryError> {
        if self.closed {
            return Err(HistoryError::Closed);
        }
        self.machine.as_mut().ok_or(HistoryError::Closed)
    }
}

/// Real `reqwest` transport for the Matrix backup endpoints.
pub struct MatrixBackupHttpClient {
    client: reqwest::Client,
    base_url: String,
    access_token: String,
    max_response_bytes: usize,
    timeout: Duration,
}

impl MatrixBackupHttpClient {
    pub fn new(
        base_url: &str,
        access_token: &str,
        max_response_bytes: usize,
        timeout: Duration,
    ) -> Result<Self, reqwest::Error> {
        Ok(Self {
            client: reqwest::Client::builder()
                .redirect(reqwest::redirect::Policy::none())
                .build()?,
            base_url: base_url.trim_end_matches('/').to_owned(),
            access_token: access_token.to_owned(),
            max_response_bytes,
            timeout,
        })
    }
}

impl BackupClient for MatrixBackupHttpClient {
    fn get<'a>(&'a self, request: BackupRequest) -> ClientFuture<'a, Value> {
        Box::pin(async move {
            let response = self
                .client
                .get(format!("{}{}", self.base_url, request.target()))
                .bearer_auth(&self.access_token)
                .timeout(self.timeout)
                .send()
                .await
                .map_err(|error| error.to_string())?;
            let status = response.status();
            let bytes = response.bytes().await.map_err(|error| error.to_string())?;
            if bytes.len() > self.max_response_bytes {
                return Err("matrix backup response exceeds the size ceiling".into());
            }
            let value: Value = serde_json::from_slice(&bytes)
                .map_err(|error| format!("matrix backup response is not JSON: {error}"))?;
            if !status.is_success() {
                return Err(
                    match (
                        value.get("errcode").and_then(Value::as_str),
                        value.get("error").and_then(Value::as_str),
                    ) {
                        (Some(errcode), Some(message)) => format!("{errcode}: {message}"),
                        // PARITY: a non-JSON error body yields an SDK
                        // `IncomingMessage` whose text is `[object Object]`;
                        // the native transport reports the status instead.
                        _ => format!("HTTP {}", status.as_u16()),
                    },
                );
            }
            Ok(value)
        })
    }
}

fn encode_query(value: &str) -> String {
    let mut encoded = String::with_capacity(value.len());
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
            encoded.push(byte as char);
        } else {
            encoded.push_str(&format!("%{byte:02X}"));
        }
    }
    encoded
}

fn js_whitespace(ch: char) -> bool {
    matches!(
        ch,
        '\u{0009}'..='\u{000d}'
            | '\u{0020}'
            | '\u{00a0}'
            | '\u{1680}'
            | '\u{2000}'..='\u{200a}'
            | '\u{2028}'
            | '\u{2029}'
            | '\u{202f}'
            | '\u{205f}'
            | '\u{3000}'
            | '\u{feff}'
    )
}

fn js_truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(value) => *value,
        Value::Number(number) => number.as_f64().is_some_and(|value| value != 0.0),
        Value::String(value) => !value.is_empty(),
        Value::Array(_) | Value::Object(_) => true,
    }
}

/// JavaScript `String(value)` for the `version` query parameter.
///
/// Non-scalars produce an empty value, which is what `matrix-bot-sdk` put on the
/// wire for an object version (`?version=`). Floats fall back to `serde_json`'s
/// shortest round-trip form; integral values never take that path.
fn js_query_string(value: &Value) -> String {
    match value {
        Value::String(value) => value.clone(),
        Value::Number(number) => {
            if let Some(value) = number.as_u64() {
                value.to_string()
            } else if let Some(value) = number.as_i64() {
                value.to_string()
            } else {
                serde_json::to_string(&number.as_f64().unwrap_or_default())
                    .unwrap_or_else(|_| "0".to_owned())
            }
        }
        Value::Bool(value) => value.to_string(),
        _ => String::new(),
    }
}

enum EntryValue<'a> {
    Ref(&'a Value),
    Owned(Value),
}

impl EntryValue<'_> {
    fn value(&self) -> &Value {
        match self {
            Self::Ref(value) => value,
            Self::Owned(value) => value,
        }
    }
}

fn array_index(key: &str) -> Option<u32> {
    key.parse::<u32>()
        .ok()
        .filter(|index| *index != u32::MAX && index.to_string() == key)
}

/// `Object.entries` semantics, including integer-key ordering and the
/// index-keyed views JavaScript builds for arrays and strings.
fn js_entries(value: &Value) -> Vec<(String, EntryValue<'_>)> {
    match value {
        Value::Object(map) => {
            let mut entries: Vec<(String, EntryValue<'_>)> = map
                .iter()
                .map(|(key, value)| (key.clone(), EntryValue::Ref(value)))
                .collect();
            entries.sort_by(|(left, _), (right, _)| {
                match (array_index(left), array_index(right)) {
                    (Some(left), Some(right)) => left.cmp(&right),
                    (Some(_), None) => std::cmp::Ordering::Less,
                    (None, Some(_)) => std::cmp::Ordering::Greater,
                    (None, None) => std::cmp::Ordering::Equal,
                }
            });
            entries
        }
        Value::Array(values) => values
            .iter()
            .enumerate()
            .map(|(index, value)| (index.to_string(), EntryValue::Ref(value)))
            .collect(),
        Value::String(text) => text
            .encode_utf16()
            .map(|unit| {
                let value = String::from_utf16(&[unit])
                    .map(Value::String)
                    .unwrap_or_else(|_| Value::String("\u{fffd}".into()));
                (String::new(), EntryValue::Owned(value))
            })
            .enumerate()
            .map(|(index, (_, value))| (index.to_string(), value))
            .collect(),
        _ => Vec::new(),
    }
}

/// JavaScript object spread followed by the two overrides.
///
/// `{...clear, room_id, session_id}` keeps an existing property position, so the
/// clear session's own field order survives; `serde_json`'s `preserve_order` map
/// has the same insert-or-keep-position behaviour.
fn merge_session(clear: &Value, room_id: &str, session_id: &str) -> Value {
    let mut merged = Map::new();
    for (key, value) in js_entries(clear) {
        merged.insert(key, value.value().clone());
    }
    merged.insert("room_id".into(), Value::String(room_id.to_owned()));
    merged.insert("session_id".into(), Value::String(session_id.to_owned()));
    Value::Object(merged)
}

fn js_type_name(value: &Value) -> &'static str {
    match value {
        Value::Null => "Null",
        Value::Bool(_) => "Boolean",
        Value::Number(_) => "Number",
        Value::String(_) => "String",
        Value::Array(_) => "Array",
        Value::Object(_) => "Object",
    }
}

/// wasm-bindgen's string-argument check for `ephemeral`, `mac` and `ciphertext`.
fn string_argument(session_data: &Value, name: &str) -> Result<String, HistoryError> {
    match session_data.get(name) {
        Some(Value::String(value)) => Ok(value.clone()),
        Some(other) => Err(HistoryError::MalformedBackup(format!(
            "Expect value to be String, but received {}",
            js_type_name(other)
        ))),
        None => Err(HistoryError::MalformedBackup(
            "Expect value to be String, but received Undefined".into(),
        )),
    }
}
