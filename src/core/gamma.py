from ctypes import windll, byref, Structure, c_ushort, sizeof, wintypes

class RAMP(Structure):
    _fields_ = [("Red", c_ushort * 256),
                ("Green", c_ushort * 256),
                ("Blue", c_ushort * 256)]

class DISPLAY_DEVICE(Structure):
    _fields_ = [
        ("cb", wintypes.DWORD),
        ("DeviceName", wintypes.WCHAR * 32),
        ("DeviceString", wintypes.WCHAR * 128),
        ("StateFlags", wintypes.DWORD),
        ("DeviceID", wintypes.WCHAR * 128),
        ("DeviceKey", wintypes.WCHAR * 128)
    ]

def get_primary_device_name():
    """Finds the device name of the primary monitor."""
    i = 0
    d = DISPLAY_DEVICE()
    d.cb = sizeof(DISPLAY_DEVICE)
    
    while windll.user32.EnumDisplayDevicesW(None, i, byref(d), 0):
        # StateFlags: 0x4 is DISPLAY_DEVICE_PRIMARY_DEVICE
        if d.StateFlags & 0x4:
            return d.DeviceName
        i += 1
    return None

def set_hardware_gamma(gamma_value):
    try:
        device_name = get_primary_device_name()
        hdc = None
        
        if not device_name:
            hdc = windll.user32.GetDC(None)
        else:
            hdc = windll.gdi32.CreateDCW("DISPLAY", device_name, None, None)

        if not hdc:
            return

        ramp = RAMP()
        for i in range(256):
            # Calculate gamma curve
            val = int(((i / 255.0) ** (1 / gamma_value)) * 65535)
            val = max(0, min(65535, val))
            ramp.Red[i] = ramp.Green[i] = ramp.Blue[i] = val
        
        windll.gdi32.SetDeviceGammaRamp(hdc, byref(ramp))
        
        # Cleanup
        if device_name:
            windll.gdi32.DeleteDC(hdc)
        else:
            windll.user32.ReleaseDC(None, hdc)
            
    except Exception as e:
        print(f"Gamma Error: {e}")
