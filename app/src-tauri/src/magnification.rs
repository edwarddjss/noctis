//! Magnification API Module - System-wide color transformation
//! Uses Windows Magnification API (MagSetFullscreenColorEffect) for instant shadow lift
//! No admin required, GPU-accelerated, works system-wide

use std::ptr;
use std::ffi::c_void;

/// MAGCOLOREFFECT is a 5x5 matrix that transforms RGBA colors
/// The matrix operates on [R, G, B, A, 1] vectors
#[repr(C)]
#[derive(Clone, Copy)]
pub struct MagColorEffect {
    pub transform: [[f32; 5]; 5],
}

impl Default for MagColorEffect {
    fn default() -> Self {
        // Identity matrix (no change)
        Self {
            transform: [
                [1.0, 0.0, 0.0, 0.0, 0.0],
                [0.0, 1.0, 0.0, 0.0, 0.0],
                [0.0, 0.0, 1.0, 0.0, 0.0],
                [0.0, 0.0, 0.0, 1.0, 0.0],
                [0.0, 0.0, 0.0, 0.0, 1.0],
            ]
        }
    }
}

impl MagColorEffect {
    /// Create an identity matrix (no color change)
    pub fn identity() -> Self {
        Self::default()
    }
    
    /// Create a shadow lift effect matrix (for dark scenes)
    /// intensity: 0.0 (no effect) to 1.0 (max shadow lift)
    /// 
    /// Formula: output = offset + input * scale
    /// This lifts black level while preserving whites
    /// 
    /// MAGCOLOREFFECT matrix layout (row-major, applied as: color_out = color_in * matrix):
    /// Row 0: [R_scale, 0, 0, 0, 0]  - Red output
    /// Row 1: [0, G_scale, 0, 0, 0]  - Green output  
    /// Row 2: [0, 0, B_scale, 0, 0]  - Blue output
    /// Row 3: [0, 0, 0, 1, 0]        - Alpha (unchanged)
    /// Row 4: [R_offset, G_offset, B_offset, 0, 1] - Translation/offset
    pub fn shadow_lift(intensity: f32) -> Self {
        let intensity = intensity.max(0.0).min(1.0);
        // Max 50% lift for strong night vision effect
        let offset = intensity * 0.50;
        let scale = 1.0 - offset;
        
        
        Self {
            transform: [
                [scale, 0.0,   0.0,   0.0, 0.0],    // Red output
                [0.0,   scale, 0.0,   0.0, 0.0],    // Green output
                [0.0,   0.0,   scale, 0.0, 0.0],    // Blue output
                [0.0,   0.0,   0.0,   1.0, 0.0],    // Alpha unchanged
                [offset, offset, offset, 0.0, 1.0], // Offset/translation row
            ]
        }
    }
    
    /// Create a dim effect matrix (for bright scenes)
    /// intensity: 0.0 (no dim) to 1.0 (max dim)
    /// 
    /// Formula: output = input * scale
    /// This reduces overall brightness proportionally
    pub fn dim(intensity: f32) -> Self {
        let intensity = intensity.max(0.0).min(1.0);
        let scale = 1.0 - (intensity * 0.30); // Max 30% dim
        
        Self {
            transform: [
                [scale, 0.0,   0.0,   0.0, 0.0],
                [0.0,   scale, 0.0,   0.0, 0.0],
                [0.0,   0.0,   scale, 0.0, 0.0],
                [0.0,   0.0,   0.0,   1.0, 0.0],
                [0.0,   0.0,   0.0,   0.0, 1.0],
            ]
        }
    }
}

#[cfg(windows)]
mod windows_api {
    use super::*;
    
    #[link(name = "magnification")]
    extern "system" {
        fn MagInitialize() -> i32;
        fn MagUninitialize() -> i32;
        fn MagSetFullscreenColorEffect(pEffect: *const MagColorEffect) -> i32;
        fn MagSetFullscreenTransform(magLevel: f32, xOffset: i32, yOffset: i32) -> i32;
    }
    
    static mut INITIALIZED: bool = false;
    
    /// Initialize the Magnification API
    pub fn init() -> Result<(), String> {
        unsafe {
            if !INITIALIZED {
                if MagInitialize() == 0 {
                    return Err("Failed to initialize Magnification API".to_string());
                }
                // Set magnification to 1.0 (no zoom, just color effect passthrough)
                if MagSetFullscreenTransform(1.0, 0, 0) == 0 {
                    return Err("Failed to set fullscreen transform".to_string());
                }
                INITIALIZED = true;
            }
            Ok(())
        }
    }
    
    /// Apply a color effect to the entire screen
    pub fn set_color_effect(effect: &MagColorEffect) -> Result<(), String> {
        init()?;
        
        unsafe {
            let result = MagSetFullscreenColorEffect(effect as *const _);
            if result == 0 {
                // Get Windows error code for debugging
                #[link(name = "kernel32")]
                extern "system" {
                    fn GetLastError() -> u32;
                }
                let error = GetLastError();
                return Err(format!("Failed to set fullscreen color effect (error: {})", error));
            }
        }
        Ok(())
    }
    
    /// Apply shadow lift effect (for dark scenes)
    pub fn apply_shadow_lift(intensity: f32) -> Result<(), String> {
        let effect = MagColorEffect::shadow_lift(intensity);
        set_color_effect(&effect)
    }
    
    /// Apply dim effect (for bright scenes)
    pub fn apply_dim(intensity: f32) -> Result<(), String> {
        let effect = MagColorEffect::dim(intensity);
        set_color_effect(&effect)
    }
    
    /// Remove all color effects (restore normal)
    pub fn remove_effects() -> Result<(), String> {
        let effect = MagColorEffect::identity();
        set_color_effect(&effect)
    }
    
    /// Smart auto-adjustment based on screen brightness
    /// brightness: 0.0 (completely dark) to 1.0 (completely bright)
    /// 
    /// < 0.4: Lift shadows (dark scene) - helps see in dark areas
    /// >= 0.4: No adjustment (normal/bright)
    pub fn apply_smart_adjustment(brightness: f32) -> Result<(), String> {
        // Higher threshold = more aggressive night vision activation
        const DARK_THRESHOLD: f32 = 0.40;
        
        
        if brightness < DARK_THRESHOLD {
            // Dark scene: calculate lift intensity (0 to 1)
            // The darker it is, the more we lift
            let lift_intensity = (DARK_THRESHOLD - brightness) / DARK_THRESHOLD;
            apply_shadow_lift(lift_intensity)
        } else {
            remove_effects()
        }
    }
}

#[cfg(windows)]
pub use windows_api::*;

#[cfg(not(windows))]
pub fn apply_shadow_lift(_intensity: f32) -> Result<(), String> {
    Err("Magnification API only available on Windows".to_string())
}

#[cfg(not(windows))]
pub fn apply_dim(_intensity: f32) -> Result<(), String> {
    Err("Magnification API only available on Windows".to_string())
}

#[cfg(not(windows))]
pub fn remove_effects() -> Result<(), String> {
    Err("Magnification API only available on Windows".to_string())
}

#[cfg(not(windows))]
pub fn apply_smart_adjustment(_brightness: f32) -> Result<(), String> {
    Err("Magnification API only available on Windows".to_string())
}
