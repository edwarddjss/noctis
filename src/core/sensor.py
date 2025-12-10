import mss
import numpy as np

def get_screen_brightness():
    """Captures the center of the primary monitor and returns average brightness."""
    try:
        with mss.mss() as sct:
            # Capture center 300x300 pixels
            # Note: sct.monitors[1] is usually the primary
            if len(sct.monitors) < 2:
                return 0.0

            # Iterate all monitors to find valid signal
            max_brightness = 0.0
            
            # Skip monitor 0 (all combined)
            for i in range(1, len(sct.monitors)):
                monitor = sct.monitors[i]
                
                # Capture center small patch
                size = 100 # Smaller for speed
                left = int(monitor["left"] + (monitor["width"] / 2) - (size / 2))
                top = int(monitor["top"] + (monitor["height"] / 2) - (size / 2))
                box = {"top": top, "left": left, "width": size, "height": size}
                
                try:
                    sct_img = sct.grab(box)
                    img = np.array(sct_img)
                    val = np.mean(img[:,:,:3])
                    
                    if val > max_brightness:
                        max_brightness = val
                except:
                    continue
            
            return max_brightness
            
    except Exception as e:
        print(f"Sensor Error (Detailed): {e}")
        return 0.0
