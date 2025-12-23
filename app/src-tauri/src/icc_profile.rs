//! ICC Profile Module - Creates and applies custom gamma curve profiles
//! Uses Windows Color System (WCS) APIs for MHC pipeline integration

use std::path::PathBuf;

/// Shadow lift intensity levels
pub const SHADOW_LIFT_LIGHT: f32 = 0.10;
pub const SHADOW_LIFT_MEDIUM: f32 = 0.15;
pub const SHADOW_LIFT_STRONG: f32 = 0.20;

/// Profile file name
const PROFILE_NAME: &str = "NoctisShadowLift.icm";

/// Get path to store the ICC profile
fn get_profile_dir() -> PathBuf {
    // Use Windows color profile directory (requires admin)
    let mut path = PathBuf::from(std::env::var("WINDIR").unwrap_or("C:\\Windows".to_string()));
    path.push("System32");
    path.push("spool");
    path.push("drivers");
    path.push("color");
    path
}

/// Get full path to our ICC profile
pub fn get_profile_path() -> PathBuf {
    get_profile_dir().join(PROFILE_NAME)
}

/// Create a shadow lift ICC profile using lcms2
/// 
/// The curve formula: output = offset + (input * (1 - offset))
/// This lifts black to `offset` while keeping white at 1.0
pub fn create_shadow_lift_profile(intensity: f32) -> Result<PathBuf, String> {
    use lcms2::*;
    
    let intensity = intensity.max(0.0).min(1.0);
    let offset = intensity * SHADOW_LIFT_STRONG; // Scale to max 20% lift
    
    // Create tone curve with shadow lift
    // We need to define the curve as a table of values
    let mut curve_values: Vec<u16> = Vec::with_capacity(256);
    for i in 0..256 {
        let input = i as f32 / 255.0;
        let output = offset + (input * (1.0 - offset));
        let value = (output * 65535.0).min(65535.0) as u16;
        curve_values.push(value);
    }
    
    // Create tone curve from the table
    let curve = ToneCurve::new_tabulated(&curve_values);
    let curves = [&curve, &curve, &curve]; // Same curve for R, G, B
    
    // Create RGB profile with our custom curves
    // Using sRGB primaries
    let white_point = CIExyY { x: 0.3127, y: 0.3290, Y: 1.0 };
    let primaries = CIExyYTRIPLE {
        Red: CIExyY { x: 0.64, y: 0.33, Y: 0.2126 },
        Green: CIExyY { x: 0.30, y: 0.60, Y: 0.7152 },
        Blue: CIExyY { x: 0.15, y: 0.06, Y: 0.0722 },
    };
    
    let mut profile = Profile::new_rgb(&white_point, &primaries, &curves)
        .map_err(|e| format!("Failed to create profile: {:?}", e))?;
    
    // Set profile description
    let path = get_profile_path();
    
    // Save the profile
    profile.save_profile_to_file(&path)
        .map_err(|e| format!("Failed to save profile: {:?}", e))?;
    
    Ok(path)
}

#[cfg(windows)]
mod windows_api {
    use super::*;
    use std::ptr;
    
    // WCS Profile Management Scope
    const WCS_PROFILE_MANAGEMENT_SCOPE_CURRENT_USER: u32 = 1;
    
    // EnumDisplayDevices flag to get device interface name
    const EDD_GET_DEVICE_INTERFACE_NAME: u32 = 0x00000001;
    
    // DISPLAY_DEVICE structure
    #[repr(C)]
    struct DisplayDevice {
        cb: u32,
        device_name: [u16; 32],
        device_string: [u16; 128],
        state_flags: u32,
        device_id: [u16; 128],
        device_key: [u16; 128],
    }
    
    // Windows API bindings
    #[link(name = "user32")]
    extern "system" {
        fn EnumDisplayDevicesW(
            device: *const u16,
            dev_num: u32,
            display_device: *mut DisplayDevice,
            flags: u32
        ) -> i32;
    }
    
    #[link(name = "mscms")]
    extern "system" {
        fn InstallColorProfileW(machine: *const u16, profile: *const u16) -> i32;
        
        fn WcsAssociateColorProfileWithDevice(
            scope: u32,
            profile_name: *const u16,
            device_name: *const u16
        ) -> i32;
        
        fn WcsDisassociateColorProfileFromDevice(
            scope: u32, 
            profile_name: *const u16,
            device_name: *const u16
        ) -> i32;
    }
    
    fn to_wide(s: &str) -> Vec<u16> {
        use std::os::windows::ffi::OsStrExt;
        std::ffi::OsStr::new(s)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    }
    
    fn wide_to_string(wide: &[u16]) -> String {
        let len = wide.iter().position(|&c| c == 0).unwrap_or(wide.len());
        String::from_utf16_lossy(&wide[..len])
    }
    
    /// Get the proper DeviceID for WCS APIs (NOT the display name)
    /// The display_name is like "\\.\DISPLAY1", we need the DeviceID from EnumDisplayDevices
    pub fn get_monitor_device_id(display_name: &str) -> Result<String, String> {
        let display_wide = to_wide(display_name);
        
        let mut dev = DisplayDevice {
            cb: std::mem::size_of::<DisplayDevice>() as u32,
            device_name: [0; 32],
            device_string: [0; 128],
            state_flags: 0,
            device_id: [0; 128],
            device_key: [0; 128],
        };
        
        unsafe {
            // First call: get adapter info
            if EnumDisplayDevicesW(ptr::null(), 0, &mut dev, 0) == 0 {
                return Err("EnumDisplayDevices failed".to_string());
            }
            
            // Second call: get monitor info for the adapter with EDD_GET_DEVICE_INTERFACE_NAME
            let mut mon = DisplayDevice {
                cb: std::mem::size_of::<DisplayDevice>() as u32,
                device_name: [0; 32],
                device_string: [0; 128],
                state_flags: 0,
                device_id: [0; 128],
                device_key: [0; 128],
            };
            
            if EnumDisplayDevicesW(display_wide.as_ptr(), 0, &mut mon, EDD_GET_DEVICE_INTERFACE_NAME) == 0 {
                // Try without the flag
                if EnumDisplayDevicesW(display_wide.as_ptr(), 0, &mut mon, 0) == 0 {
                    return Err("EnumDisplayDevices for monitor failed".to_string());
                }
            }
            
            let device_id = wide_to_string(&mon.device_id);
            
            if device_id.is_empty() {
                // Fall back to device_name if device_id is empty
                let device_name = wide_to_string(&mon.device_name);
                return Ok(device_name);
            }
            
            Ok(device_id)
        }
    }
    
    /// Install the ICC profile to Windows
    pub fn install_profile(profile_path: &PathBuf) -> Result<(), String> {
        let path_str = profile_path.to_string_lossy();
        let path_wide = to_wide(&path_str);
        
        
        unsafe {
            if InstallColorProfileW(ptr::null(), path_wide.as_ptr()) == 0 {
                // Profile might already be installed, that's okay
            } else {
            }
        }
        Ok(())
    }
    
    /// Associate profile with a display device using WCS API
    pub fn associate_profile_with_device(profile_name: &str, device_name: &str) -> Result<(), String> {
        let profile_wide = to_wide(profile_name);
        let device_wide = to_wide(device_name);
        
        
        unsafe {
            let result = WcsAssociateColorProfileWithDevice(
                WCS_PROFILE_MANAGEMENT_SCOPE_CURRENT_USER,
                profile_wide.as_ptr(),
                device_wide.as_ptr()
            );
            
            if result == 0 {
                return Err("Failed to associate profile with device (WCS)".to_string());
            }
        }
        Ok(())
    }
    
    /// Remove profile association from device using WCS API
    pub fn disassociate_profile_from_device(profile_name: &str, device_name: &str) -> Result<(), String> {
        let profile_wide = to_wide(profile_name);
        let device_wide = to_wide(device_name);
        
        
        unsafe {
            let result = WcsDisassociateColorProfileFromDevice(
                WCS_PROFILE_MANAGEMENT_SCOPE_CURRENT_USER,
                profile_wide.as_ptr(),
                device_wide.as_ptr()
            );
            
            if result == 0 {
            } else {
            }
        }
        Ok(())
    }
}

#[cfg(windows)]
pub use windows_api::*;

// Track if we've applied a profile (to avoid crashing on disassociate of non-existent profile)
#[cfg(windows)]
static mut PROFILE_APPLIED: bool = false;

/// Apply shadow lift to a specific monitor
#[cfg(windows)]
pub fn apply_shadow_lift(intensity: f32, monitor_device: &str) -> Result<(), String> {
    
    // Get the proper DeviceID for WCS API (NOT the display name)
    let device_id = get_monitor_device_id(monitor_device)?;
    
    // Create the profile
    let profile_path = create_shadow_lift_profile(intensity)?;
    
    // Install it
    install_profile(&profile_path)?;
    
    // Associate with the device (using proper DeviceID)
    associate_profile_with_device(PROFILE_NAME, &device_id)?;
    
    // Mark that we've applied a profile
    unsafe { PROFILE_APPLIED = true; }
    
    Ok(())
}

/// Remove shadow lift from a monitor (restore default)
#[cfg(windows)]
pub fn remove_shadow_lift(monitor_device: &str) -> Result<(), String> {
    
    // Only try to disassociate if we've previously applied a profile
    unsafe {
        if !PROFILE_APPLIED {
            return Ok(());
        }
    }
    
    // Get the proper DeviceID for WCS API
    let device_id = match get_monitor_device_id(monitor_device) {
        Ok(id) => id,
        Err(e) => {
            return Ok(());
        }
    };
    
    // Try to disassociate our profile
    match disassociate_profile_from_device(PROFILE_NAME, &device_id) {
        Ok(_) => {
            unsafe { PROFILE_APPLIED = false; }
        },
        Err(_) => (),
    }
    
    Ok(())
}

// Fallback for non-Windows
#[cfg(not(windows))]
pub fn apply_shadow_lift(_intensity: f32, _monitor_device: &str) -> Result<(), String> {
    Err("ICC profile support only available on Windows".to_string())
}

#[cfg(not(windows))]
pub fn remove_shadow_lift(_monitor_device: &str) -> Result<(), String> {
    Err("ICC profile support only available on Windows".to_string())
}
