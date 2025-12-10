import customtkinter as ctk
import keyboard
import threading
from PIL import Image, ImageDraw
import pystray
from src.constants import *
from src.ui.components import create_tech_button, create_tech_slider, StatCard

class NoctisApp(ctk.CTk):
    def __init__(self, engine, config_manager):
        super().__init__()
        self.engine = engine
        self.config = config_manager
        self.listening_for_hotkey = False
        self.current_hotkey_hook = None
        self.tray_icon = None
        
        self._setup_window()
        self._create_title_bar()
        self._create_layout()
        self._setup_global_hotkey()
        self._setup_tray_icon()
        
        self._update_loop()

    def _setup_window(self):
        self.title("noctis")
        
        # Center Window
        w, h = 400, 680
        screen_w = self.winfo_screenwidth()
        screen_h = self.winfo_screenheight()
        x = int((screen_w / 2) - (w / 2))
        y = int((screen_h / 2) - (h / 2))
        self.geometry(f"{w}x{h}+{x}+{y}")
        self.resizable(False, False)
        
        # Appearance
        ctk.set_appearance_mode("Dark")
        self.configure(fg_color=COLOR_BG)
        self.overrideredirect(True)
        self.attributes('-topmost', True)

    def _create_title_bar(self):
        # Header (Minimal)
        self.title_bar = ctk.CTkFrame(self, height=60, fg_color=COLOR_BG, corner_radius=0)
        self.title_bar.pack(side="top", fill="x", padx=10, pady=(10, 0))

        # Dragging
        self.title_bar.bind("<Button-1>", self._start_move)
        self.title_bar.bind("<B1-Motion>", self._do_move)

        # Title Text (Centered or Left)
        self.title_lbl = ctk.CTkLabel(self.title_bar, text="noctis", font=FONT_TECH_LARGE, text_color=COLOR_TEXT)
        self.title_lbl.pack(side="left", padx=15)
        self.title_lbl.bind("<Button-1>", self._start_move)
        self.title_lbl.bind("<B1-Motion>", self._do_move)

        # Buttons
        self.btn_close = ctk.CTkButton(self.title_bar, text="✕", width=32, height=32, fg_color=COLOR_FRAME, hover_color=COLOR_DANGER, text_color=COLOR_TEXT, corner_radius=CORNER_RADIUS, border_width=BORDER_WIDTH, border_color=COLOR_BORDER, command=self._on_close)
        self.btn_close.pack(side="right", padx=5)
        
        self.btn_min = ctk.CTkButton(self.title_bar, text="—", width=32, height=32, fg_color="transparent", hover_color=COLOR_FRAME, text_color=COLOR_TEXT, corner_radius=CORNER_RADIUS, command=self._minimize)
        self.btn_min.pack(side="right")

    def _create_layout(self):
        self.main_frame = ctk.CTkFrame(self, fg_color="transparent")
        self.main_frame.pack(fill="both", expand=True, padx=25, pady=25)

        # 1. Main Gamma Card (Sharp)
        self.vis_frame = ctk.CTkFrame(self.main_frame, fg_color=COLOR_FRAME, corner_radius=CORNER_RADIUS, border_width=BORDER_WIDTH, border_color=COLOR_BORDER)
        self.vis_frame.pack(fill="x", pady=(0, 20))
        
        self.lbl_gamma_display = ctk.CTkLabel(self.vis_frame, text="1.00", font=FONT_DISPLAY, text_color=COLOR_ACCENT)
        self.lbl_gamma_display.pack(pady=(35, 5))
        ctk.CTkLabel(self.vis_frame, text="Active Gamma", font=FONT_TECH_SMALL, text_color=COLOR_TEXT_DIM).pack(pady=(0, 35))

        # 2. Status Grid
        self.grid_frame = ctk.CTkFrame(self.main_frame, fg_color="transparent")
        self.grid_frame.pack(fill="x")
        self.grid_frame.columnconfigure(0, weight=1)
        self.grid_frame.columnconfigure(1, weight=1)

        self.card_bright = StatCard(self.grid_frame, "SENSOR", "0")
        self.card_bright.grid(row=0, column=0, sticky="ew", padx=(0, 5))
        
        self.card_mode = StatCard(self.grid_frame, "MODE", "OFF")
        self.card_mode.grid(row=0, column=1, sticky="ew", padx=(5, 0))

        # 3. Toggle (Large/Soft)
        self.btn_toggle = create_tech_button(self.main_frame, "Enable System", self._toggle_system)
        self.btn_toggle.pack(fill="x", pady=20)

        # 4. Settings (Clean, no frame)
        self.settings_frame = ctk.CTkFrame(self.main_frame, fg_color="transparent")
        self.settings_frame.pack(fill="x")

        # Threshold
        self.lbl_thresh = ctk.CTkLabel(self.settings_frame, text=f"Sensitivity: {self.config.get('threshold')}", font=FONT_TECH_NORMAL, text_color=COLOR_TEXT_DIM, anchor="w")
        self.lbl_thresh.pack(pady=(0, 5), fill="x")
        
        self.slider_thresh = create_tech_slider(self.settings_frame, self._update_thresh, self.config.get('threshold'), 5, 100)
        self.slider_thresh.pack(pady=(0, 20), fill="x")

        # Max Gamma
        self.lbl_max_gamma = ctk.CTkLabel(self.settings_frame, text=f"Max Boost: {self.config.get('max_gamma')}", font=FONT_TECH_NORMAL, text_color=COLOR_TEXT_DIM, anchor="w")
        self.lbl_max_gamma.pack(pady=(0, 5), fill="x")

        self.slider_gamma = create_tech_slider(self.settings_frame, self._update_gamma, self.config.get('max_gamma'), 1.0, 3.0)
        self.slider_gamma.pack(pady=(0, 20), fill="x")

        # Hotkey Binding
        hotkey_frame = ctk.CTkFrame(self.settings_frame, fg_color="transparent")
        hotkey_frame.pack(fill="x", pady=(0, 10))
        
        ctk.CTkLabel(hotkey_frame, text="Toggle Hotkey:", font=FONT_TECH_NORMAL, text_color=COLOR_TEXT_DIM).pack(side="left")
        
        # Initial key text
        key = self.config.get('hotkey').upper()
        if key == "INSERT": key = "INS"
        if key == "DELETE": key = "DEL"
        if key == "ESCAPE": key = "ESC"
        if key == "CAPS LOCK": key = "CAPS"

        self.btn_hotkey = ctk.CTkButton(
            hotkey_frame, 
            text=key, 
            width=100, 
            height=32,
            fg_color=COLOR_FRAME, 
            hover_color=COLOR_BORDER,
            text_color=COLOR_TEXT,
            font=FONT_TECH_BOLD,
            corner_radius=CORNER_RADIUS,
            border_width=BORDER_WIDTH,
            border_color=COLOR_BORDER,
            command=self._start_hotkey_listen
        )
        self.btn_hotkey.pack(side="right")

    def _toggle_system(self):
        new_state = not self.engine.running
        self.engine.set_running(new_state)

    def _update_thresh(self, value):
        val = int(value)
        self.config.set('threshold', val)
        self.lbl_thresh.configure(text=f"Sensitivity: {val}")

    def _update_gamma(self, value):
        val = round(value, 1)
        self.config.set('max_gamma', val)
        self.lbl_max_gamma.configure(text=f"Max Boost: {val}")

    def _update_loop(self):
        # Poll Engine State
        self.lbl_gamma_display.configure(text=f"{self.engine.current_gamma:.2f}")
        self.card_bright.set_value(f"{self.engine.detected_brightness:.1f}")
        
        # Dynamic Visual Feedback
        if self.engine.current_gamma > 1.05:
            # Active State (Warm Amber)
            active_color = COLOR_NIGHT_VISION
            self.lbl_gamma_display.configure(text_color=active_color)
            self.card_mode.set_value("Active", active_color)
            self.btn_toggle.configure(fg_color=active_color, text_color="#1a1918", text="System Engaged") # Dark text on amber
        else:
            # Passive State (Gamma Normal)
            if self.engine.running:
                # Scanning Mode
                self.lbl_gamma_display.configure(text_color=COLOR_ACCENT)
                self.card_mode.set_value("Scanning", COLOR_ACCENT)
                self.btn_toggle.configure(fg_color=COLOR_ACCENT, text_color="#1a1918", text="System Active")
            else:
                # Offline Mode - Reset to Defaults
                self.lbl_gamma_display.configure(text_color=COLOR_TEXT)
                self.card_mode.set_value("Offline", COLOR_TEXT_DIM)
                self.btn_toggle.configure(fg_color=COLOR_FRAME, text_color=COLOR_TEXT, text="Enable System")
            
        self.after(50, self._update_loop)

    # Window Management
    def _start_move(self, event):
        self.x, self.y = event.x, event.y

    def _do_move(self, event):
        x = self.winfo_x() + (event.x - self.x)
        y = self.winfo_y() + (event.y - self.y)
        self.geometry(f"+{x}+{y}")

    def _minimize(self):
        """Minimize to system tray."""
        self.withdraw()
        if self.tray_icon:
            self.tray_icon.visible = True

    def _restore_from_tray(self):
        """Restore window from system tray."""
        if self.tray_icon:
            self.tray_icon.visible = False
        self.deiconify()
        self.attributes('-topmost', True)

    def _on_close(self):
        # Stop tray icon
        if self.tray_icon:
            self.tray_icon.stop()
        # Unhook keyboard before closing
        if self.current_hotkey_hook:
            keyboard.unhook(self.current_hotkey_hook)
        keyboard.unhook_all_hotkeys()
        self.engine.shutdown()
        self.destroy()

    def _setup_tray_icon(self):
        """Create system tray icon."""
        # Create a simple icon (white circle on black)
        size = 64
        image = Image.new('RGB', (size, size), color='#050505')
        draw = ImageDraw.Draw(image)
        draw.ellipse([size//4, size//4, size*3//4, size*3//4], fill='#FFFFFF')
        
        menu = pystray.Menu(
            pystray.MenuItem('Show', lambda: self.after(0, self._restore_from_tray), default=True),
            pystray.MenuItem('Exit', lambda: self.after(0, self._on_close))
        )
        
        self.tray_icon = pystray.Icon('noctis', image, 'Noctis', menu)
        self.tray_icon.visible = False
        
        # Run tray icon in background thread
        threading.Thread(target=self.tray_icon.run, daemon=True).start()

    # Global Hotkey System
    def _setup_global_hotkey(self):
        """Register the global hotkey to toggle the system."""
        hotkey = self.config.get('hotkey')
        try:
            keyboard.add_hotkey(hotkey, self._hotkey_triggered, suppress=False)
        except Exception as e:
            print(f"Failed to register hotkey '{hotkey}': {e}")

    def _hotkey_triggered(self):
        """Called when the global hotkey is pressed."""
        # Use after() to safely update UI from keyboard thread
        self.after(0, self._toggle_system)

    def _start_hotkey_listen(self):
        """Enter listening mode to capture a new hotkey."""
        if self.listening_for_hotkey:
            return
            
        self.listening_for_hotkey = True
        self.btn_hotkey.configure(text="Press Key...", fg_color=COLOR_ACCENT, text_color="#1a1918")
        
        # Hook the next key press
        self.current_hotkey_hook = keyboard.on_press(self._on_hotkey_captured, suppress=False)

    def _on_hotkey_captured(self, event):
        """Called when a key is pressed while in listening mode."""
        if not self.listening_for_hotkey:
            return
            
        new_key = event.name
        
        # Ignore modifier-only presses
        if new_key in ['shift', 'ctrl', 'alt', 'left shift', 'right shift', 'left ctrl', 'right ctrl', 'left alt', 'right alt']:
            return
        
        # Unhook the listener
        if self.current_hotkey_hook:
            keyboard.unhook(self.current_hotkey_hook)
            self.current_hotkey_hook = None
        
        # Remove old hotkey
        keyboard.unhook_all_hotkeys()
        
        # Save new hotkey
        self.config.set('hotkey', new_key)
        
        # Register new hotkey
        try:
            keyboard.add_hotkey(new_key, self._hotkey_triggered, suppress=False)
        except Exception as e:
            print(f"Failed to register hotkey '{new_key}': {e}")
        
        # Update UI (use after() for thread safety)
        self.after(0, lambda: self._finish_hotkey_listen(new_key))

    def _finish_hotkey_listen(self, new_key):
        """Update UI after hotkey capture."""
        self.listening_for_hotkey = False
        
        # Clean up key display
        display_text = new_key.upper()
        if display_text == "INSERT": display_text = "INS"
        if display_text == "DELETE": display_text = "DEL"
        if display_text == "ESCAPE": display_text = "ESC"
        if display_text == "CAPS LOCK": display_text = "CAPS"
        
        self.btn_hotkey.configure(text=display_text, fg_color=COLOR_FRAME, text_color=COLOR_TEXT)
