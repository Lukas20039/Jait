//! Admission control for blocking work. Give database and CPU work separate lanes.
//! A dropped caller cannot abort a running blocking operation; its permit stays held.
use std::{io, num::NonZeroU16, sync::Arc};
use tokio::sync::{Semaphore, TryAcquireError};

#[derive(Clone)]
pub struct BlockingLane {
    permits: Arc<Semaphore>,
}

impl BlockingLane {
    pub fn new(parallelism: NonZeroU16) -> Self {
        Self {
            permits: Arc::new(Semaphore::new(usize::from(parallelism.get()))),
        }
    }

    /// Reject overload before spawning. Callers map this to their domain/wire contract.
    /// Running closures must enforce their own I/O deadlines and transaction boundaries.
    pub async fn run<T: Send + 'static>(
        &self,
        operation: impl FnOnce() -> T + Send + 'static,
    ) -> io::Result<T> {
        let permit = self
            .permits
            .clone()
            .try_acquire_owned()
            .map_err(|error| match error {
                TryAcquireError::NoPermits => {
                    io::Error::new(io::ErrorKind::WouldBlock, "blocking lane is full")
                }
                TryAcquireError::Closed => {
                    io::Error::new(io::ErrorKind::BrokenPipe, "blocking lane is closed")
                }
            })?;
        tokio::task::spawn_blocking(move || {
            let _permit = permit;
            operation()
        })
        .await
        .map_err(|_| io::Error::other("blocking worker failed"))
    }

    /// Stop new admissions. Existing operations retain their permits until completion.
    pub fn close(&self) {
        self.permits.close();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[tokio::test]
    async fn overload_and_dropped_callers_cannot_exceed_active_work_limit() {
        let lane = BlockingLane::new(NonZeroU16::new(1).unwrap());
        let (entered, started) = tokio::sync::oneshot::channel();
        let (release, wait) = std::sync::mpsc::channel();
        let worker_lane = lane.clone();
        let caller = tokio::spawn(async move {
            worker_lane
                .run(move || {
                    let _ = entered.send(());
                    let _ = wait.recv();
                })
                .await
        });
        tokio::time::timeout(Duration::from_secs(5), started)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(
            lane.run(|| ()).await.unwrap_err().kind(),
            io::ErrorKind::WouldBlock
        );
        caller.abort();
        let _ = caller.await;
        assert_eq!(
            lane.run(|| ()).await.unwrap_err().kind(),
            io::ErrorKind::WouldBlock
        );
        release.send(()).unwrap();
        tokio::time::timeout(Duration::from_secs(5), async {
            loop {
                match lane.run(|| 42).await {
                    Ok(value) => break assert_eq!(value, 42),
                    Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                        tokio::task::yield_now().await;
                    }
                    Err(error) => panic!("{error}"),
                }
            }
        })
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn close_rejects_work_before_any_effect() {
        let lane = BlockingLane::new(NonZeroU16::new(1).unwrap());
        lane.close();
        assert_eq!(
            lane.run(|| panic!("closed lane executed work"))
                .await
                .unwrap_err()
                .kind(),
            io::ErrorKind::BrokenPipe
        );
    }

    #[tokio::test]
    async fn panics_release_capacity_without_leaking_payloads() {
        let lane = BlockingLane::new(NonZeroU16::new(1).unwrap());
        let error = lane
            .run(|| panic!("private worker payload"))
            .await
            .unwrap_err();
        assert_eq!(error.to_string(), "blocking worker failed");
        assert_eq!(lane.run(|| 42).await.unwrap(), 42);
    }
}
