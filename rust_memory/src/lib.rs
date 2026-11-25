//! Kensho Pro 1.1.0 — Rust Memory Management & Zero-Copy Arena Kernel (`wasm32-unknown-unknown`)
//! Provides deterministic 16-byte aligned linear memory allocation, cryptographic-grade slice
//! zeroization (`memory.fill`), high-water mark telemetry, and IEEE 802.3 CRC-32 hashing.

#![no_std]

use core::sync::atomic::{AtomicUsize, Ordering};

static BUMP_PTR: AtomicUsize = AtomicUsize::new(4096);
static ALLOCATED_BYTES: AtomicUsize = AtomicUsize::new(0);
static PEAK_BYTES: AtomicUsize = AtomicUsize::new(0);

#[inline]
fn align16_checked(size: usize) -> Option<usize> {
    size.checked_add(15).map(|v| v & !15)
}

#[inline]
fn in_arena_bounds(ptr: *const u8, size: usize) -> bool {
    if ptr.is_null() || size == 0 {
        return false;
    }
    let addr = ptr as usize;
    if addr < 4096 {
        return false;
    }
    let end = match addr.checked_add(size) {
        Some(v) => v,
        None => return false,
    };
    #[cfg(target_arch = "wasm32")]
    {
        let cur_bytes = core::arch::wasm32::memory_size(0).saturating_mul(65536);
        end <= cur_bytes
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        let _ = end;
        true
    }
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
    if size == 0 {
        return 0;
    }
    let aligned = match align16_checked(size) {
        Some(v) if v > 0 => v,
        _ => return 0,
    };
    let ptr = BUMP_PTR.load(Ordering::SeqCst);
    let end = match ptr.checked_add(aligned) {
        Some(v) => v,
        None => return 0,
    };
    #[cfg(target_arch = "wasm32")]
    {
        let cur_bytes = core::arch::wasm32::memory_size(0).saturating_mul(65536);
        if end > cur_bytes {
            let delta = end - cur_bytes;
            let needed_pages = (delta / 65536) + if (delta % 65536) != 0 { 1 } else { 0 };
            let grew = core::arch::wasm32::memory_grow(0, needed_pages);
            if grew == usize::MAX {
                return 0;
            }
        }
    }
    BUMP_PTR.store(end, Ordering::SeqCst);
    let prev = ALLOCATED_BYTES.fetch_add(aligned, Ordering::SeqCst);
    let next = prev.saturating_add(aligned);
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
    if !in_arena_bounds(ptr as *const u8, size) {
        return 0;
    }
    core::ptr::write_bytes(ptr, 0, size);
    let aligned = match align16_checked(size) {
        Some(v) => v,
        None => return 0,
    };
    let prev = ALLOCATED_BYTES.load(Ordering::SeqCst);
    let next = prev.saturating_sub(aligned);
    ALLOCATED_BYTES.store(next, Ordering::SeqCst);
    let addr = ptr as usize;
    let cur_bump = BUMP_PTR.load(Ordering::SeqCst);
    if addr.checked_add(aligned) == Some(cur_bump) {
        BUMP_PTR.store(if next == 0 { 4096 } else { addr }, Ordering::SeqCst);
    }
    size
}

/// Zeroes `[ptr .. ptr + size]` in linear memory without altering arena counters.
#[no_mangle]
pub unsafe extern "C" fn rust_mem_zero(ptr: *mut u8, size: usize) -> usize {
    if !in_arena_bounds(ptr as *const u8, size) {
        return 0;
    }
    core::ptr::write_bytes(ptr, 0, size);
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
