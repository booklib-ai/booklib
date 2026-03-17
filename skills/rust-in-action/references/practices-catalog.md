# Rust in Action — Practices Catalog

Systems-focused before/after examples from each chapter group.

---

## Ownership: Use References, Not Moves (Ch 4)

**Before:**
```rust
fn print_log(data: Vec<u8>) {  // consumes — caller loses data
    println!("{} bytes", data.len());
}
let log = vec![1u8, 2, 3];
print_log(log);
// log is gone — can't use it again
```
**After:**
```rust
fn print_log(data: &[u8]) {  // borrows a slice — Vec<u8> derefs to &[u8]
    println!("{} bytes", data.len());
}
let log = vec![1u8, 2, 3];
print_log(&log);
println!("{log:?}");  // still valid
```

---

## Ownership: Resolving Lifetime Issues (Ch 4)

**Before:**
```rust
struct Config {
    name: String,  // owned — always heap-allocates
}
```
**After (borrow when caller controls data):**
```rust
struct Config<'a> {
    name: &'a str,  // borrows — zero allocation if caller has the string
}
// Use when Config doesn't outlive the string it references
```
**Or (own when Config must be independent):**
```rust
struct Config {
    name: String,  // owned — correct when Config outlives the source string
}
```

---

## Smart Pointers: Choosing the Right Type (Ch 6)

```rust
// Box<T>: heap allocation, single owner
let boxed: Box<[u8]> = vec![1, 2, 3].into_boxed_slice();

// Rc<T>: shared ownership, single thread only
use std::rc::Rc;
let shared = Rc::new(vec![1, 2, 3]);
let clone1 = Rc::clone(&shared);  // cheap — increments refcount
// let _ = thread::spawn(move || { clone1; });  // COMPILE ERROR: Rc is not Send

// Arc<T>: shared ownership, multi-thread safe
use std::sync::Arc;
let arc = Arc::new(vec![1, 2, 3]);
let arc2 = Arc::clone(&arc);  // idiomatic — explicit about cheapness
thread::spawn(move || println!("{arc2:?}")).join().unwrap();

// RefCell<T>: interior mutability, single thread, runtime checks
use std::cell::RefCell;
let cache: RefCell<Option<String>> = RefCell::new(None);
*cache.borrow_mut() = Some("computed".into());

// Cow<T>: clone-on-write — avoids allocation when only reading
use std::borrow::Cow;
fn process(input: &str) -> Cow<str> {
    if input.contains("bad") {
        Cow::Owned(input.replace("bad", "good"))  // allocates only when needed
    } else {
        Cow::Borrowed(input)  // zero allocation
    }
}
```

---

## Data: Explicit Endianness (Ch 5, 7)

**Before:**
```rust
fn parse_id(bytes: &[u8]) -> u32 {
    u32::from_ne_bytes([bytes[0], bytes[1], bytes[2], bytes[3]])  // native — wrong on BE hosts
}
fn write_id(id: u32) -> [u8; 4] {
    id.to_ne_bytes()  // corrupts protocol on big-endian
}
```
**After:**
```rust
// Protocol says: little-endian. Be explicit regardless of host.
fn parse_id(bytes: &[u8], offset: usize) -> Result<u32, &'static str> {
    bytes.get(offset..offset + 4)
        .ok_or("buffer too short")
        .map(|b| u32::from_le_bytes(b.try_into().unwrap()))
}

fn write_id(id: u32) -> [u8; 4] {
    id.to_le_bytes()  // always little-endian — deterministic on all hosts
}
```

---

## Data: Bit Manipulation (Ch 5)

```rust
// Named constants for masks — self-documenting (Ch 5)
const SIGN_BIT: u32      = 0x8000_0000;
const EXPONENT_MASK: u32 = 0x7F80_0000;
const MANTISSA_MASK: u32 = 0x007F_FFFF;

fn dissect_f32(n: f32) -> (u32, u32, u32) {
    let bits = n.to_bits();
    let sign     = (bits & SIGN_BIT) >> 31;
    let exponent = (bits & EXPONENT_MASK) >> 23;
    let mantissa =  bits & MANTISSA_MASK;
    (sign, exponent, mantissa)
}
```

---

## Files: Buffered I/O + serde (Ch 7)

**Before:**
```rust
use std::fs::File;
use std::io::Read;
let mut f = File::open("data.bin").unwrap();
let mut buf = vec![];
f.read_to_end(&mut buf).unwrap();  // unbuffered + panics
```
**After:**
```rust
use std::fs::File;
use std::io::{BufReader, Read};
use std::path::Path;

fn read_file(path: &Path) -> Result<Vec<u8>, std::io::Error> {
    let f = File::open(path)?;
    let mut reader = BufReader::new(f);  // batched syscalls
    let mut buf = Vec::new();
    reader.read_to_end(&mut buf)?;
    Ok(buf)
}

// Structured serialization with serde + bincode (Ch 7)
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
struct Record {
    id: u64,
    payload: Vec<u8>,
}

fn write_record(rec: &Record, path: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let f = File::create(path)?;
    let writer = std::io::BufWriter::new(f);
    bincode::serialize_into(writer, rec)?;
    Ok(())
}
```

---

## Error Handling: Library Error Wrapping (Ch 8)

```rust
// Wrapping multiple downstream error types in one domain error (Ch 8)
#[derive(Debug)]
pub enum NetworkError {
    Io(std::io::Error),
    AddrParse(std::net::AddrParseError),
    Timeout,
}

impl std::fmt::Display for NetworkError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            NetworkError::Io(e) => write!(f, "I/O: {e}"),
            NetworkError::AddrParse(e) => write!(f, "address parse: {e}"),
            NetworkError::Timeout => write!(f, "connection timed out"),
        }
    }
}

impl std::error::Error for NetworkError {}

impl From<std::io::Error> for NetworkError {
    fn from(e: std::io::Error) -> Self { NetworkError::Io(e) }
}
impl From<std::net::AddrParseError> for NetworkError {
    fn from(e: std::net::AddrParseError) -> Self { NetworkError::AddrParse(e) }
}

fn connect(addr: &str) -> Result<std::net::TcpStream, NetworkError> {
    let addr: std::net::SocketAddr = addr.parse()?;  // AddrParseError → NetworkError
    let stream = std::net::TcpStream::connect(addr)?;  // io::Error → NetworkError
    Ok(stream)
}
```

---

## Networking: State Machines with Enums (Ch 8)

```rust
#[derive(Debug, Clone, PartialEq)]
enum TcpState {
    Closed,
    Listen,
    SynReceived,
    Established,
    FinWait1,
    Closed_,
}

impl TcpState {
    fn on_syn(self) -> Result<Self, &'static str> {
        match self {
            TcpState::Listen => Ok(TcpState::SynReceived),
            other => Err("SYN received in invalid state"),
        }
    }

    fn on_ack(self) -> Result<Self, &'static str> {
        match self {
            TcpState::SynReceived => Ok(TcpState::Established),
            other => Err("ACK received in invalid state"),
        }
    }
}
```

---

## Concurrency: Thread Pool via Channels (Ch 10)

```rust
use std::sync::{Arc, Mutex, mpsc};
use std::thread;

// move closure required — captures must be 'static (Ch 10)
fn spawn_worker(id: usize, rx: Arc<Mutex<mpsc::Receiver<String>>>) {
    thread::spawn(move || loop {  // move transfers rx into thread
        let msg = rx.lock().expect("mutex poisoned").recv();
        match msg {
            Ok(s) => println!("worker {id}: {s}"),
            Err(_) => break,
        }
    });
}

fn main() {
    let (tx, rx) = mpsc::channel::<String>();
    let rx = Arc::new(Mutex::new(rx));

    for i in 0..4 {
        spawn_worker(i, Arc::clone(&rx));
    }

    tx.send("hello".into()).unwrap();
    tx.send("world".into()).unwrap();
    drop(tx);  // close channel — workers will exit their loops
    thread::sleep(std::time::Duration::from_millis(10));
}
```

---

## Time: Instant vs SystemTime + NTP Offset (Ch 9)

```rust
use std::time::{Instant, SystemTime, UNIX_EPOCH};

// Instant for elapsed — monotonic, cannot go backwards (Ch 9)
let start = Instant::now();
do_work();
println!("elapsed: {:?}", start.elapsed());

// SystemTime for wall clock (can go backwards — don't use for elapsed)
let unix_ts = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .expect("system clock before Unix epoch")
    .as_secs();

// NTP epoch conversion (Ch 9)
// NTP counts from 1900-01-01; Unix counts from 1970-01-01
const NTP_UNIX_OFFSET: u64 = 2_208_988_800;

fn ntp_to_unix(ntp_seconds: u64) -> u64 {
    ntp_seconds.saturating_sub(NTP_UNIX_OFFSET)
}

fn unix_to_ntp(unix_seconds: u64) -> u64 {
    unix_seconds + NTP_UNIX_OFFSET
}
```

---

## Unsafe: Safe Abstraction Pattern (Ch 6)

```rust
// Wrap unsafe in a safe API — callers need not use unsafe (Ch 6)
pub struct AlignedBuffer {
    ptr: *mut u8,
    len: usize,
}

impl AlignedBuffer {
    pub fn new(len: usize) -> Self {
        // SAFETY: len > 0, alignment is a power of 2, ptr checked for null
        let layout = std::alloc::Layout::from_size_align(len, 64).unwrap();
        let ptr = unsafe { std::alloc::alloc_zeroed(layout) };
        assert!(!ptr.is_null(), "allocation failed");
        AlignedBuffer { ptr, len }
    }

    pub fn as_slice(&self) -> &[u8] {
        // SAFETY: ptr valid, len accurate, no mutable alias exists
        unsafe { std::slice::from_raw_parts(self.ptr, self.len) }
    }
}

impl Drop for AlignedBuffer {
    fn drop(&mut self) {
        // SAFETY: same layout as alloc, ptr not yet freed
        let layout = std::alloc::Layout::from_size_align(self.len, 64).unwrap();
        unsafe { std::alloc::dealloc(self.ptr, layout) }
    }
}
```
