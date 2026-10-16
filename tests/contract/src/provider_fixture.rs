//! Bounded, loopback-only scripted HTTP peer. No fetch or provider code is mocked.
use anyhow::{Context, Result, bail, ensure};
use std::{
    collections::BTreeMap,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};

pub struct Reply {
    status: u16,
    body: String,
}
impl Reply {
    pub fn json(status: u16, body: serde_json::Value) -> Self {
        Self {
            status,
            body: body.to_string(),
        }
    }
    pub fn malformed() -> Self {
        Self {
            status: 200,
            body: "{invalid-json".into(),
        }
    }
}

// Deliberately no Debug/Serialize: headers may contain synthetic bearer keys.
pub struct RecordedRequest {
    pub method: String,
    pub path: String,
    pub headers: BTreeMap<String, String>,
    pub body: Vec<u8>,
}

pub struct LocalProvider {
    origin: String,
    stop: Arc<AtomicBool>,
    worker: Option<JoinHandle<Result<Vec<RecordedRequest>>>>,
    expected: usize,
}

impl LocalProvider {
    pub fn start(replies: Vec<Reply>) -> Result<Self> {
        ensure!(replies.len() <= 16, "provider script exceeds 16 requests");
        ensure!(
            replies.iter().all(|r| r.body.len() <= 65_536),
            "provider reply exceeds 64 KiB"
        );
        let expected = replies.len();
        let listener = TcpListener::bind("127.0.0.1:0")?;
        let origin = format!("http://{}", listener.local_addr()?);
        listener.set_nonblocking(true)?;
        let stop = Arc::new(AtomicBool::new(false));
        let cancelled = stop.clone();
        let worker = thread::spawn(move || {
            let deadline = Instant::now() + Duration::from_secs(20);
            let mut replies = replies.into_iter();
            let mut requests = Vec::new();
            while !cancelled.load(Ordering::SeqCst) && Instant::now() < deadline {
                crate::fixture::check_cancelled()?;
                match listener.accept() {
                    Ok((mut stream, peer)) => {
                        ensure!(
                            peer.ip().is_loopback(),
                            "provider accepted non-loopback peer"
                        );
                        let request = read_request(&mut stream, &cancelled)?;
                        let reply = replies
                            .next()
                            .context("unexpected extra provider request")?;
                        requests.push(request);
                        stream.set_write_timeout(Some(Duration::from_secs(2)))?;
                        write!(
                            stream,
                            "HTTP/1.1 {} Fixture\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                            reply.status,
                            reply.body.len(),
                            reply.body
                        )?;
                        stream.flush()?;
                    }
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(5));
                    }
                    Err(error) => return Err(error.into()),
                }
            }
            ensure!(
                cancelled.load(Ordering::SeqCst),
                "provider fixture exceeded 20 second lifetime"
            );
            Ok(requests)
        });
        Ok(Self {
            origin,
            stop,
            worker: Some(worker),
            expected,
        })
    }
    pub fn base_url(&self) -> &str {
        &self.origin
    }
    pub fn finish(mut self) -> Result<Vec<RecordedRequest>> {
        self.stop.store(true, Ordering::SeqCst);
        let requests = self
            .worker
            .take()
            .unwrap()
            .join()
            .map_err(|_| anyhow::anyhow!("provider worker panicked"))??;
        ensure!(
            requests.len() == self.expected,
            "provider request count differs from script"
        );
        Ok(requests)
    }
}
impl Drop for LocalProvider {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

fn read_request(stream: &mut TcpStream, stop: &AtomicBool) -> Result<RecordedRequest> {
    stream.set_read_timeout(Some(Duration::from_millis(100)))?;
    let deadline = Instant::now() + Duration::from_secs(2);
    let mut bytes = Vec::new();
    let mut chunk = [0; 4096];
    let mut head_end = None;
    let mut length = None;
    loop {
        ensure!(!stop.load(Ordering::SeqCst), "provider request cancelled");
        ensure!(
            Instant::now() < deadline,
            "provider request exceeded 2 seconds"
        );
        crate::fixture::check_cancelled()?;
        match stream.read(&mut chunk) {
            Ok(0) => bail!("provider peer closed an incomplete request"),
            Ok(count) => bytes.extend_from_slice(&chunk[..count]),
            Err(error)
                if matches!(
                    error.kind(),
                    std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
                ) =>
            {
                continue;
            }
            Err(error) => return Err(error.into()),
        }
        ensure!(bytes.len() <= 65_536, "provider request exceeds 64 KiB");
        if head_end.is_none() {
            head_end = bytes
                .windows(4)
                .position(|b| b == b"\r\n\r\n")
                .map(|p| p + 4);
            if let Some(end) = head_end {
                ensure!(end <= 16_384, "provider headers exceed 16 KiB");
                let header = std::str::from_utf8(&bytes[..end])?;
                let mut count = None;
                for line in header.split("\r\n").skip(1) {
                    if let Some((key, value)) = line.split_once(':') {
                        ensure!(
                            !key.eq_ignore_ascii_case("transfer-encoding"),
                            "fixture requires Content-Length framing"
                        );
                        if key.eq_ignore_ascii_case("content-length") {
                            ensure!(count.is_none(), "duplicate content-length");
                            count = Some(value.trim().parse::<usize>()?);
                        }
                    }
                }
                length = Some(count.unwrap_or(0));
            } else {
                ensure!(bytes.len() <= 16_384, "provider headers exceed 16 KiB");
            }
        }
        if let (Some(end), Some(count)) = (head_end, length) {
            ensure!(count <= 49_152, "provider body exceeds 48 KiB");
            if bytes.len() >= end + count {
                ensure!(
                    bytes.len() == end + count,
                    "unexpected pipelined provider data"
                );
                let head = std::str::from_utf8(&bytes[..end])?;
                let mut lines = head.split("\r\n");
                let mut first = lines
                    .next()
                    .context("missing request line")?
                    .split_whitespace();
                let method = first.next().context("missing request method")?.into();
                let path = first.next().context("missing request path")?.into();
                let mut headers = BTreeMap::new();
                for line in lines.filter(|line| !line.is_empty()) {
                    let (key, value) = line.split_once(':').context("malformed request header")?;
                    headers.insert(key.to_ascii_lowercase(), value.trim().into());
                }
                return Ok(RecordedRequest {
                    method,
                    path,
                    headers,
                    body: bytes[end..].into(),
                });
            }
        }
    }
}
