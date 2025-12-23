//! Gamma control module - Windows API implementation
//! Supports multi-monitor with position info for layout visualization
//! Uses manual FFI for GDI functions to avoid crate version conflicts.

use std::ffi::c_void;
use std::ptr;

/// The RAMP structure matches Windows GAMMARAMP (768 bytes total)
#[repr(C)]
pub struct GammaRamp {
    pub red: [u16; 256],
    pub green: [u16; 256],
    pub blue: [u16; 256],
}

/// RECT structure for monitor bounds
#[repr(C)]
#[derive(Clone, Copy, Default)]
struct Rect {
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
}

/// MONITORINFOEX structure
#[repr(C)]
struct MonitorInfoEx {
    cb_size: u32,
    rc_monitor: Rect,
    rc_work: Rect,
    dw_flags: u32,
    sz_device: [u16; 32],
}

/// Monitor information returned to frontend with position
#[derive(serde::Serialize, Clone)]
pub struct MonitorInfo {
    pub index: u32,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub x: i32,
    pub y: i32,
    pub is_primary: bool,
}

const MONITORINFOF_PRIMARY: u32 = 0x1;

type MonitorEnumProc = unsafe extern "system" fn(*mut c_void, *mut c_void, *mut Rect, isize) -> i32;

// Windows API function signatures
#[cfg(windows)]
#[link(name = "gdi32")]
extern "system" {
    fn SetDeviceGammaRamp(hdc: *mut c_void, lp_ramp: *const GammaRamp) -> i32;
    fn CreateDCW(driver: *const u16, device: *const u16, output: *const u16, init_data: *const c_void) -> *mut c_void;
    fn DeleteDC(hdc: *mut c_void) -> i32;
}

#[cfg(windows)]
#[link(name = "user32")]
extern "system" {
    fn EnumDisplayMonitors(hdc: *mut c_void, lprc_clip: *const Rect, lpfn_enum: MonitorEnumProc, dw_data: isize) -> i32;
    fn GetMonitorInfoW(hmonitor: *mut c_void, lpmi: *mut MonitorInfoEx) -> i32;
}

/// Convert wide string to Rust string
fn wide_to_string(wide: &[u16]) -> String {
    let len = wide.iter().position(|&c| c == 0).unwrap_or(wide.len());
    String::from_utf16_lossy(&wide[..len])
}

/// Convert Rust string to wide string
fn to_wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Collected monitor data during enumeration
struct MonitorData {
    monitors: Vec<MonitorInfo>,
}

/// Callback for EnumDisplayMonitors
#[cfg(windows)]
unsafe extern "system" fn monitor_enum_callback(
    hmonitor: *mut c_void,
    _hdc: *mut c_void,
    _lprc: *mut Rect,
    dw_data: isize,
) -> i32 {
    let data = &mut *(dw_data as *mut MonitorData);
    
    let mut info = MonitorInfoEx {
        cb_size: std::mem::size_of::<MonitorInfoEx>() as u32,
        rc_monitor: Rect::default(),
        rc_work: Rect::default(),
        dw_flags: 0,
        sz_device: [0; 32],
    };
    
    if GetMonitorInfoW(hmonitor, &mut info) != 0 {
        let is_primary = (info.dw_flags & MONITORINFOF_PRIMARY) != 0;
        let width = (info.rc_monitor.right - info.rc_monitor.left) as u32;
        let height = (info.rc_monitor.bottom - info.rc_monitor.top) as u32;
        
        data.monitors.push(MonitorInfo {
            index: data.monitors.len() as u32 + 1,
            name: wide_to_string(&info.sz_device),
            width,
            height,
            x: info.rc_monitor.left,
            y: info.rc_monitor.top,
            is_primary,
        });
    }
    
    1 // Continue enumeration
}

/// Get list of all connected monitors with position and size
#[cfg(windows)]
pub fn get_monitors() -> Vec<MonitorInfo> {
    unsafe {
        let mut data = MonitorData { monitors: Vec::new() };
        
        EnumDisplayMonitors(
            ptr::null_mut(),
            ptr::null(),
            monitor_enum_callback,
            &mut data as *mut MonitorData as isize,
        );
        
        // Sort by position: primary first, then left-to-right, top-to-bottom
        data.monitors.sort_by(|a, b| {
            if a.is_primary != b.is_primary {
                return b.is_primary.cmp(&a.is_primary); // Primary first
            }
            if a.x != b.x {
                return a.x.cmp(&b.x); // Left to right
            }
            a.y.cmp(&b.y) // Top to bottom
        });
        
        // Reassign indices after sorting
        for (i, m) in data.monitors.iter_mut().enumerate() {
            m.index = i as u32 + 1;
        }
        
        data.monitors
    }
}

#[cfg(not(windows))]
pub fn get_monitors() -> Vec<MonitorInfo> {
    vec![MonitorInfo { 
        index: 1, 
        name: "Primary".to_string(), 
        width: 1920, 
        height: 1080, 
        x: 0, 
        y: 0, 
        is_primary: true 
    }]
}

// Global cache for monitors to avoid constant re-enumeration
// Using a static mutex manually or just re-enumerating is fine given the FFI
// Original code had: static mut CACHED_MONITORS: Option<Vec<MonitorInfo>> = None;
// We'll skip caching for now to keep it simple and stateless.


// "Shadow Hunter" Hybrid Gamma Curve
// intensity: 0.0 (Normal) to 1.0 (Max Night Vision)
// Combines:
// 1. Gamma Correction (Power Law) - brightens midtones
// 2. Black Equalizer (Linear Lift) - lifts absolute black
fn calculate_curve(intensity: f32) -> GammaRamp {
    let intensity = intensity.max(0.0).min(1.0);
    
    let mut ramp = GammaRamp {
        red: [0; 256],
        green: [0; 256],
        blue: [0; 256],
    };

    // 1. Black Equalizer Lift
    // Max 25% lift at full intensity
    let lift = intensity * 0.25;
    
    // 2. Gamma Correction
    // Gamma 1.0 = Normal. Gamma < 1.0 = Brighter.
    // At max intensity, we go down to gamma 0.5
    let gamma = 1.0 - (intensity * 0.5);

    for i in 0..256 {
        let x = i as f32 / 255.0;
        
        // Apply Gamma Power Curve
        // x^gamma
        let mut y = x.powf(gamma);
        
        // Apply Linear Black Lift
        // output = lift + input * (1 - lift)
        y = lift + y * (1.0 - lift);
        
        // Clamp and convert
        let val = (y * 65535.0).max(0.0).min(65535.0) as u16;
        
        ramp.red[i] = val;
        ramp.green[i] = val;
        ramp.blue[i] = val;
    }
    ramp
}


#[cfg(windows)]
pub fn set_gamma(intensity: f32, monitor_index: u32) -> Result<(), String> {
    // 1. Find the monitor handle/name
    let monitor_name_wide = get_monitor_name_wide(monitor_index)
        .ok_or_else(|| format!("Monitor {} not found", monitor_index))?;

    // 2. Calculate the "Shadow Hunter" curve
    let ramp = calculate_curve(intensity);

    // 3. Create DC and Set Gamma
    unsafe {
        let hdc = CreateDCW(
            ptr::null(), 
            monitor_name_wide.as_ptr(), 
            ptr::null(), 
            ptr::null()
        );
        
        if hdc.is_null() {
            return Err("Failed to create device context".to_string());
        }

        let result = SetDeviceGammaRamp(hdc, &ramp as *const _ as *const _);
        DeleteDC(hdc);

        if result == 0 {
            return Err("Failed to set gamma ramp (Driver may be blocking it)".to_string());
        }
    }

    Ok(())
}

// Dim a monitor by reducing brightness linearly
// brightness: 0.0 (black) to 1.0 (normal)
#[cfg(windows)]
pub fn dim_monitor(brightness: f32, monitor_index: u32) -> Result<(), String> {
    // Clamp brightness to 0.5-1.0 due to Windows gamma restrictions
    let brightness = brightness.max(0.5).min(1.0);
    
    let monitor_name_wide = get_monitor_name_wide(monitor_index)
        .ok_or_else(|| format!("Monitor {} not found", monitor_index))?;
    
    // Create linear dimming ramp: output = input * brightness
    let mut ramp = GammaRamp {
        red: [0; 256],
        green: [0; 256],
        blue: [0; 256],
    };
    
    for i in 0..256 {
        // Identity value for this index
        let identity = (i as u32) * 256;
        // Dimmed value
        let dimmed = ((i as f32) * brightness * 256.0) as u32;
        // Clamp to within 32768 of identity (Windows restriction sometimes)
        let min_val = identity.saturating_sub(32768);
        let max_val = identity.saturating_add(32768).min(65535);
        let value = dimmed.max(min_val).min(max_val) as u16;
        
        ramp.red[i] = value;
        ramp.green[i] = value;
        ramp.blue[i] = value;
    }
    
    unsafe {
        let hdc = CreateDCW(
            ptr::null(), 
            monitor_name_wide.as_ptr(), 
            ptr::null(), 
            ptr::null()
        );
        
        if hdc.is_null() {
            return Err("Failed to create device context".to_string());
        }

        let result = SetDeviceGammaRamp(hdc, &ramp as *const _ as *const _);
        DeleteDC(hdc);

        if result == 0 {
            return Err("Failed to dim monitor".to_string());
        }
    }

    Ok(())
}

#[cfg(not(windows))]
pub fn dim_monitor(_brightness: f32, _monitor_index: u32) -> Result<(), String> {
    Err("Dim monitor only supported on Windows".to_string())
}

#[cfg(not(windows))]
pub fn set_gamma(_intensity: f32, _monitor_index: u32) -> Result<(), String> {
    Err("Gamma control only supported on Windows".to_string())
}

// Helper to get monitor device name by index
fn get_monitor_name_wide(index: u32) -> Option<Vec<u16>> {
    let monitors = get_monitors();
    monitors.iter().find(|m| m.index == index).map(|m| {
        to_wide(&m.name)
    })
}
