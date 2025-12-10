import threading
import time
from .gamma import set_hardware_gamma
from .sensor import get_screen_brightness

class NoctisEngine:
    def __init__(self, config_manager):
        self.config = config_manager
        self.running = False
        self.active_thread = True
        
        # State
        self.current_gamma = 1.0
        self.target_gamma = 1.0
        self.detected_brightness = 0.0
        
        self.thread = threading.Thread(target=self._loop, daemon=True)
        self.thread.start()

    def set_running(self, running: bool):
        self.running = running
        if not running:
            # Immediate Reset
            self.target_gamma = 1.0
            set_hardware_gamma(1.0)
            self.current_gamma = 1.0

    def shutdown(self):
        self.active_thread = False
        set_hardware_gamma(1.0)

    def _loop(self):
        # Buffer for brightness smoothing
        brightness_buffer = [] 
        buffer_size = 10
        hysteresis_pad = 10 

        while self.active_thread:
            try:
                # 1. Update Config (hot reload values)
                threshold = self.config.get("threshold")
                max_gamma = self.config.get("max_gamma")

                # 2. Only measure when system is enabled
                if self.running:
                    raw_brightness = get_screen_brightness()
                    
                    # Smooth
                    brightness_buffer.append(raw_brightness)
                    if len(brightness_buffer) > buffer_size:
                        brightness_buffer.pop(0)
                    
                    self.detected_brightness = sum(brightness_buffer) / len(brightness_buffer)

                    # 3. Hysteresis Logic
                    if self.target_gamma > 1.0: 
                        # Currently Active -> Needs to get much brighter to turn off
                        if self.detected_brightness > (threshold + hysteresis_pad):
                            self.target_gamma = 1.0 
                    else:
                        # Currently Normal -> Needs to get darker to turn on
                        if self.detected_brightness < threshold:
                            self.target_gamma = max_gamma
                else:
                    # System Disabled - Clear state
                    brightness_buffer.clear()
                    self.detected_brightness = 0.0
                    self.target_gamma = 1.0

                # 4. Lerp Transition
                diff = self.target_gamma - self.current_gamma
                if abs(diff) > 0.005:
                    self.current_gamma += diff * 0.05
                    set_hardware_gamma(self.current_gamma)
                
                time.sleep(0.05)

            except Exception as e:
                print(f"Engine Loop Error: {e}")
                time.sleep(1)
