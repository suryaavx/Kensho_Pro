//! Kensho Pro 1.1.0 — Rust Memory Management & Zero-Copy Arena Kernel (`wasm32-unknown-unknown`)
//! Provides deterministic 16-byte aligned linear memory allocation, cryptographic-grade slice
//! zeroization (`memory.fill`), high-water mark telemetry, and IEEE 802.3 CRC-32 hashing.

#![no_std]

use core::sync::atomic::{AtomicUsize, Ordering};

static BUMP_PTR: AtomicUsize = AtomicUsize::new(4096);
static ALLOCATED_BYTES: AtomicUsize = AtomicUsize::new(0);
static PEAK_BYTES: AtomicUsize = AtomicUsize::new(0);

#[inline]
const fn align16(size: usize) -> usize {
    (size + 15) & !15
}

/// Resets the linear memory arena pointer and active allocation counter.
#[no_mangle]
pub extern "C" fn rust_mem_reset() {
    BUMP_PTR.store(4096, Ordering::SeqCst);
    ALLOCATED_BYTES.store(0, Ordering::SeqCst);
}

/// Allocates a 16-byte aligned region in Rust/WASM linear memory and updates high-water peak metrics.
#[no_mangle]
pub extern "C" fn rust_mem_alloc(size: usize) -> usize {
    let aligned = align16(size);
    let ptr = BUMP_PTR.fetch_add(aligned, Ordering::SeqCst);
    #[cfg(target_arch = "wasm32")]
    {
        let end = ptr.saturating_add(aligned);
        let cur_bytes = core::arch::wasm32::memory_size(0) * 65536;
        if end > cur_bytes {
            let needed_pages = (end - cur_bytes + 65535) / 65536;
            let _ = core::arch::wasm32::memory_grow(0, needed_pages);
        }
    }
    let prev = ALLOCATED_BYTES.fetch_add(aligned, Ordering::SeqCst);
    let next = prev + aligned;
    let mut cur_peak = PEAK_BYTES.load(Ordering::Relaxed);
    while next > cur_peak {
        match PEAK_BYTES.compare_exchange_weak(cur_peak, next, Ordering::SeqCst, Ordering::Relaxed) {
            Ok(_) => break,
            Err(actual) => cur_peak = actual,
        }
    }
    ptr
}

/// Deterministically zeroes `[ptr .. ptr + size]` in linear memory and decrements active allocation count.
#[no_mangle]
pub unsafe extern "C" fn rust_mem_free(ptr: *mut u8, size: usize) -> usize {
    if !ptr.is_null() && size > 0 {
        core::ptr::write_bytes(ptr, 0, size);
    }
    let aligned = align16(size);
    let prev = ALLOCATED_BYTES.load(Ordering::SeqCst);
    let next = prev.saturating_sub(aligned);
    ALLOCATED_BYTES.store(next, Ordering::SeqCst);
    if next == 0 {
        BUMP_PTR.store(4096, Ordering::SeqCst);
    }
    size
}

/// Zeroes `[ptr .. ptr + size]` in linear memory without altering arena counters.
#[no_mangle]
pub unsafe extern "C" fn rust_mem_zero(ptr: *mut u8, size: usize) -> usize {
    if !ptr.is_null() && size > 0 {
        core::ptr::write_bytes(ptr, 0, size);
    }
    size
}

/// Returns currently allocated byte count in the Rust/WASM arena.
#[no_mangle]
pub extern "C" fn rust_mem_allocated() -> usize {
    ALLOCATED_BYTES.load(Ordering::SeqCst)
}

/// Returns peak allocated byte count in the Rust/WASM arena.
#[no_mangle]
pub extern "C" fn rust_mem_peak() -> usize {
    PEAK_BYTES.load(Ordering::SeqCst)
}

/// Computes IEEE 802.3 CRC-32 checksum over `[ptr .. ptr + len]` in Rust linear memory.
#[no_mangle]
pub unsafe extern "C" fn rust_crc32(ptr: *const u8, len: usize) -> u32 {
    if ptr.is_null() || len == 0 {
        return 0;
    }
    let slice = core::slice::from_raw_parts(ptr, len);
    let mut crc: u32 = 0xFFFF_FFFF;
    for &byte in slice {
        crc ^= byte as u32;
        for _ in 0..8 {
            if (crc & 1) != 0 {
                crc = (crc >> 1) ^ 0xEDB8_8320;
            } else {
                crc >>= 1;
            }
        }
    }
    !crc
}

#[cfg(not(test))]
#[panic_handler]
fn panic(_info: &core::panic::PanicInfo) -> ! {
    loop {}
}
