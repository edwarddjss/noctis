//! Screen brightness sensor - Raw Windows FFI implementation
//! Uses direct linkage to gdi32.dll and user32.dll

use std::ffi::c_void;
use std::ptr;

// GDI constants
const SRCCOPY: u32 = 0x00CC0020;
const BI_RGB: u32 = 0;
const DIB_RGB_COLORS: u32 = 0;

// Bitmap info structures
#[repr(C)]
struct BitmapInfoHeader {
    bi_size: u32,
    bi_width: i32,
    bi_height: i32,
    bi_planes: u16,
    bi_bit_count: u16,
    bi_compression: u32,
    bi_size_image: u32,
    bi_x_pels_per_meter: i32,
    bi_y_pels_per_meter: i32,
    bi_clr_used: u32,
    bi_clr_important: u32,
}

#[repr(C)]
struct RgbQuad {
    blue: u8,
    green: u8,
    red: u8,
    reserved: u8,
}

#[repr(C)]
struct BitmapInfo {
    bmi_header: BitmapInfoHeader,
    bmi_colors: [RgbQuad; 1],
}

type HDC = *mut c_void;
type HBITMAP = *mut c_void;
type HGDIOBJ = *mut c_void;

#[cfg(windows)]
#[link(name = "gdi32")]
extern "system" {
    fn CreateCompatibleDC(hdc: HDC) -> HDC;
    fn CreateCompatibleBitmap(hdc: HDC, cx: i32, cy: i32) -> HBITMAP;
    fn SelectObject(hdc: HDC, h: HGDIOBJ) -> HGDIOBJ;
    fn BitBlt(hdc: HDC, x: i32, y: i32, cx: i32, cy: i32, hdc_src: HDC, x1: i32, y1: i32, rop: u32) -> i32;
    fn GetDIBits(hdc: HDC, hbm: HBITMAP, start: u32, clines: u32, lpv_bits: *mut c_void, lpbmi: *mut BitmapInfo, usage: u32) -> i32;
    fn DeleteObject(ho: HGDIOBJ) -> i32;
    fn DeleteDC(hdc: HDC) -> i32;
}

#[cfg(windows)]
#[link(name = "user32")]
extern "system" {
    fn GetDC(hwnd: *mut c_void) -> HDC;
    fn ReleaseDC(hwnd: *mut c_void, hdc: HDC) -> i32;
    fn GetSystemMetrics(n_index: i32) -> i32;
}

const SM_CXSCREEN: i32 = 0;
const SM_CYSCREEN: i32 = 1;

/// Captures a 100x100 region from the center of the specified monitor region
#[cfg(windows)]
pub fn get_screen_brightness(monitor_x: i32, monitor_y: i32, monitor_w: i32, monitor_h: i32) -> Result<f32, String> {
    unsafe {
        let hdc_screen = GetDC(ptr::null_mut());
        if hdc_screen.is_null() {
            return Err("Failed to get screen DC".to_string());
        }

        let hdc_mem = CreateCompatibleDC(hdc_screen);
        if hdc_mem.is_null() {
            ReleaseDC(ptr::null_mut(), hdc_screen);
            return Err("Failed to create compatible DC".to_string());
        }

        let sample_size: i32 = 100;
        
        // Calculate center of the specified monitor
        let center_x = monitor_x + (monitor_w / 2);
        let center_y = monitor_y + (monitor_h / 2);
        let left = center_x - (sample_size / 2);
        let top = center_y - (sample_size / 2);

        let hbm = CreateCompatibleBitmap(hdc_screen, sample_size, sample_size);
        if hbm.is_null() {
            DeleteDC(hdc_mem);
            ReleaseDC(ptr::null_mut(), hdc_screen);
            return Err("Failed to create bitmap".to_string());
        }

        let old_bm = SelectObject(hdc_mem, hbm);

        if BitBlt(hdc_mem, 0, 0, sample_size, sample_size, hdc_screen, left, top, SRCCOPY) == 0 {
            SelectObject(hdc_mem, old_bm);
            DeleteObject(hbm);
            DeleteDC(hdc_mem);
            ReleaseDC(ptr::null_mut(), hdc_screen);
            return Err("BitBlt failed".to_string());
        }

        let mut bmi = BitmapInfo {
            bmi_header: BitmapInfoHeader {
                bi_size: std::mem::size_of::<BitmapInfoHeader>() as u32,
                bi_width: sample_size,
                bi_height: -sample_size, // Top-down
                bi_planes: 1,
                bi_bit_count: 32,
                bi_compression: BI_RGB,
                bi_size_image: 0,
                bi_x_pels_per_meter: 0,
                bi_y_pels_per_meter: 0,
                bi_clr_used: 0,
                bi_clr_important: 0,
            },
            bmi_colors: [RgbQuad { blue: 0, green: 0, red: 0, reserved: 0 }; 1],
        };

        let pixel_count = (sample_size * sample_size) as usize;
        let mut pixels: Vec<u8> = vec![0; pixel_count * 4];

        let result = GetDIBits(
            hdc_mem,
            hbm,
            0,
            sample_size as u32,
            pixels.as_mut_ptr() as *mut c_void,
            &mut bmi,
            DIB_RGB_COLORS,
        );

        SelectObject(hdc_mem, old_bm);
        DeleteObject(hbm);
        DeleteDC(hdc_mem);
        ReleaseDC(ptr::null_mut(), hdc_screen);

        if result == 0 {
            return Err("GetDIBits failed".to_string());
        }

        // Calculate 10th percentile brightness (responds to darkest areas)
        // This is better than average because it detects "any darkness in view"
        let mut brightness_values: Vec<u8> = Vec::with_capacity(pixel_count);
        
        for chunk in pixels.chunks(4) {
            let b = chunk[0] as u32;
            let g = chunk[1] as u32;
            let r = chunk[2] as u32;
            let luminance = ((r + g + b) / 3) as u8;
            brightness_values.push(luminance);
        }
        
        // Sort to find percentile
        brightness_values.sort_unstable();
        
        // 10th percentile = 10% of the way through sorted values
        let percentile_index = pixel_count / 10;
        let percentile_value = brightness_values[percentile_index] as f32;
        
        // Normalize to 0.0-1.0 range for smart adjustment logic
        Ok(percentile_value / 255.0)
    }
}

#[cfg(not(windows))]
pub fn get_screen_brightness(_x: i32, _y: i32, _w: i32, _h: i32) -> Result<f32, String> {
    Err("Screen capture only supported on Windows".to_string())
}
