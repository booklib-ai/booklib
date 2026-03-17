# Before: Rust in Action

A systems utility that reads a binary log file, parses records, and processes them concurrently — with common systems-level anti-patterns.

```rust
use std::fs::File;
use std::io::Read;
use std::thread;

// Silently panics on any I/O failure; no error type
fn read_log(path: String) -> Vec<u8> {
    let mut file = File::open(path).unwrap();
    let mut buf = vec![];
    file.read_to_end(&mut buf).unwrap();
    buf
}

// Assumes native endianness — corrupts data on big-endian hosts
fn parse_record_id(bytes: &[u8]) -> u32 {
    let arr = [bytes[0], bytes[1], bytes[2], bytes[3]];
    u32::from_ne_bytes(arr)  // native endian — wrong for protocol
}

// Spawns one thread per record — no pooling
fn process_all(records: Vec<Vec<u8>>) {
    for record in records {
        thread::spawn(|| {
            println!("processing {} bytes", record.len());
        });
    }
    // No join — threads may not finish before main exits
}

// Shared mutable state with unsafe global
static mut ERROR_COUNT: u32 = 0;

fn record_error() {
    unsafe {
        ERROR_COUNT += 1;  // data race — undefined behavior
    }
}

// No endianness comment, no checksum, no error type
fn write_record(id: u32, data: &[u8]) -> Vec<u8> {
    let mut out = vec![];
    out.extend_from_slice(&id.to_ne_bytes()); // native endian — wrong
    out.extend_from_slice(data);
    out  // no checksum — corruption undetectable
}

fn main() {
    let bytes = read_log(String::from("data.log"));
    let id = parse_record_id(&bytes);
    println!("id: {}", id);
}
```
