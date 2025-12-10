import mss
import numpy as np

def get_monitor_list():
    """Returns list of monitor names for selection."""
    try:
        with mss.mss() as sct:
            monitors = []
            for i in range(1, len(sct.monitors)):
                m = sct.monitors[i]
                monitors.append(f"Monitor {i} ({m['width']}x{m['height']})")
            return monitors
    except:
        return ["Monitor 1"]

def get_screen_brightness(monitor_index=None):
    """Captures the center of the specified monitor and returns average brightness."""
    try:
        with mss.mss() as sct:
            if len(sct.monitors) < 2:
                return 0.0

            # If no monitor specified, use first non-combined
            if monitor_index is None or monitor_index < 1 or monitor_index >= len(sct.monitors):
                monitor_index = 1
            
            monitor = sct.monitors[monitor_index]
            
            # Capture center small patch
            size = 100
            left = int(monitor["left"] + (monitor["width"] / 2) - (size / 2))
            top = int(monitor["top"] + (monitor["height"] / 2) - (size / 2))
            box = {"top": top, "left": left, "width": size, "height": size}
            
            try:
                sct_img = sct.grab(box)
                img = np.array(sct_img)
                return np.mean(img[:,:,:3])
            except:
                return 0.0
            
    except Exception as e:
        print(f"Sensor Error: {e}")
        return 0.0
