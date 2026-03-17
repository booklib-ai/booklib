# After: Rust in Action

The same utility rewritten with idiomatic systems Rust — explicit endianness, buffered I/O, a domain error type, checksum validation, thread pool, and safe shared state.

```rust
use std::fmt;
use std::fs::File;
use std::io::{BufReader, Read};
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::sync::mpsc;
use std::thread;

// Domain error type — wraps all downstream errors (Ch 3, 8)
#[derive(Debug)]
pub enum LogError {
    Io(std::io::Error),
    InvalidRecord { offset: usize, reason: &'static str },
    ChecksumMismatch { expected: u32, got: u32 },
}

impl fmt::Display for LogError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            LogError::Io(e) => write!(f, "I/O: {e}"),
            LogError::InvalidRecord { offset, reason } =>
                write!(f, "invalid record at {offset}: {reason}"),
            LogError::ChecksumMismatch { expected, got } =>
                write!(f, "checksum mismatch: expected {expected:#010x}, got {got:#010x}"),
        }
    }
}

impl std::error::Error for LogError {}
impl From<std::io::Error> for LogError {
    fn from(e: std::io::Error) -> Self { LogError::Io(e) }
}

// BufReader for batched I/O syscalls; &Path for type-safe path (Ch 7)
// Returns Result — caller decides how to handle failure (Ch 3)
fn read_log(path: &Path) -> Result<Vec<u8>, LogError> {
    let file = File::open(path)?;  // ? converts io::Error → LogError (Ch 8)
    let mut reader = BufReader::new(file);  // batched reads (Ch 7)
    let mut buf = Vec::new();
    reader.read_to_end(&mut buf)?;
    Ok(buf)
}

// Explicit little-endian — deterministic across all hosts (Ch 5, 7)
fn parse_record_id(bytes: &[u8], offset: usize) -> Result<u32, LogError> {
    bytes.get(offset..offset + 4)
        .ok_or(LogError::InvalidRecord { offset, reason: "not enough bytes for id" })
        .map(|b| u32::from_le_bytes(b.try_into().unwrap()))
}

// Simulate a simple CRC32-like checksum (Ch 7)
fn checksum(data: &[u8]) -> u32 {
    data.iter().fold(0u32, |acc, &b| acc.wrapping_add(b as u32))
}

// Explicit little-endian write + checksum (Ch 5, 7)
fn write_record(id: u32, data: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(4 + data.len() + 4);
    out.extend_from_slice(&id.to_le_bytes());  // SAFETY: LE is the protocol spec
    out.extend_from_slice(data);
    let crc = checksum(&out);
    out.extend_from_slice(&crc.to_le_bytes());  // append checksum
    out
}

fn read_record(buf: &[u8]) -> Result<(u32, &[u8]), LogError> {
    let id = parse_record_id(buf, 0)?;
    let payload = buf.get(4..buf.len() - 4)
        .ok_or(LogError::InvalidRecord { offset: 4, reason: "too short for payload + checksum" })?;
    let stored_crc = u32::from_le_bytes(buf[buf.len() - 4..].try_into().unwrap());
    let computed = checksum(&buf[..buf.len() - 4]);
    if computed != stored_crc {
        return Err(LogError::ChecksumMismatch { expected: stored_crc, got: computed });
    }
    Ok((id, payload))
}

// Thread pool via channel — no unbounded thread spawning (Ch 10)
type Job = Box<dyn FnOnce() + Send + 'static>;

struct Pool {
    tx: mpsc::Sender<Job>,
}

impl Pool {
    fn new(workers: usize) -> Self {
        let (tx, rx) = mpsc::channel::<Job>();
        let rx = Arc::new(Mutex::new(rx));
        for _ in 0..workers {
            let rx = Arc::clone(&rx);
            thread::spawn(move || loop {
                match rx.lock().expect("mutex poisoned").recv() {
                    Ok(job) => job(),
                    Err(_) => break,  // sender dropped — shut down
                }
            });
        }
        Pool { tx }
    }

    fn submit(&self, job: impl FnOnce() + Send + 'static) {
        self.tx.send(Box::new(job)).expect("pool closed");
    }
}

// Safe shared error counter via Arc<Mutex<T>> (Ch 6, 10)
fn make_error_counter() -> Arc<Mutex<u32>> {
    Arc::new(Mutex::new(0))
}

fn record_error(counter: &Arc<Mutex<u32>>) {
    *counter.lock().expect("mutex poisoned") += 1;
}

fn main() -> Result<(), LogError> {
    let path = Path::new("data.log");
    let bytes = read_log(path)?;

    let id = parse_record_id(&bytes, 0)?;
    println!("id: {id}");

    let pool = Pool::new(4);
    let errors = make_error_counter();

    // move — closure owns record + error counter clone (Ch 10)
    let record = bytes.clone();
    let err_counter = Arc::clone(&errors);
    pool.submit(move || {
        println!("processing {} bytes, id={}", record.len(), id);
        if record.len() < 8 {
            record_error(&err_counter);
        }
    });

    // Give threads time to finish (production code would use join handles)
    std::thread::sleep(std::time::Duration::from_millis(10));
    println!("errors: {}", errors.lock().unwrap());

    Ok(())
}
```

**Key improvements:**
- `LogError` wraps all downstream errors with `From` impls — `?` converts automatically (Ch 3, 8)
- `BufReader` batches file I/O syscalls — essential for large files (Ch 7)
- `u32::from_le_bytes()` / `to_le_bytes()` — explicit endianness, correct across all hosts (Ch 5)
- Checksum appended and verified on read — corruption is detectable (Ch 7)
- Thread pool via `mpsc::channel` + `Arc<Mutex<Receiver>>` — bounded concurrency (Ch 10)
- `Arc<Mutex<u32>>` replaces `unsafe static mut` — safe shared mutable state (Ch 6, 10)
- `move` closures transfer ownership into threads — required for `'static` bound (Ch 10)
- `&Path` instead of `String` for file path — type-safe, works with literals (Ch 7)
