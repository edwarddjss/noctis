import customtkinter as ctk
from ..constants import *

def create_tech_button(parent, text, command):
    return ctk.CTkButton(
        parent,
        text=text,
        font=FONT_TECH_BOLD,
        height=40,
        corner_radius=CORNER_RADIUS,
        fg_color=COLOR_FRAME,
        hover_color=COLOR_BORDER,
        text_color=COLOR_TEXT,
        command=command,
        border_width=BORDER_WIDTH,
        border_color=COLOR_BORDER
    )

def create_tech_slider(parent, command, initial_value, from_, to_):
    slider = ctk.CTkSlider(
        parent,
        from_=from_, 
        to=to_, 
        number_of_steps=100, 
        command=command,
        fg_color=COLOR_FRAME,
        progress_color=COLOR_TEXT_DIM,
        button_color=COLOR_ACCENT,
        button_hover_color=COLOR_NIGHT_VISION,
        height=16,
        border_width=0,
    )
    slider.set(initial_value)
    return slider

class StatCard(ctk.CTkFrame):
    def __init__(self, parent, label_text, value_text="0"):
        super().__init__(parent, fg_color=COLOR_FRAME, corner_radius=CORNER_RADIUS, border_width=BORDER_WIDTH, border_color=COLOR_BORDER)
        
        self.value_label = ctk.CTkLabel(self, text=value_text, font=FONT_STAT_VALUE, text_color=COLOR_TEXT)
        self.value_label.pack(pady=(15, 0))
        
        self.desc_label = ctk.CTkLabel(self, text=label_text, font=FONT_TECH_SMALL, text_color=COLOR_TEXT_DIM)
        self.desc_label.pack(pady=(2, 15))

    def set_value(self, text, color=COLOR_TEXT):
        self.value_label.configure(text=text, text_color=color)
