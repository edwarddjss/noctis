import json
import os

class ConfigManager:
    def __init__(self, filepath="config.json"):
        self.filepath = filepath
        self.settings = {
            "threshold": 35,
            "max_gamma": 2.4,
            "transition_speed": 0.05,
            "hotkey": "insert"
        }
        self.load()

    def load(self):
        if os.path.exists(self.filepath):
            try:
                with open(self.filepath, 'r') as f:
                    data = json.load(f)
                    self.settings.update(data)
            except Exception as e:
                print(f"Failed to load config: {e}")

    def save(self):
        try:
            with open(self.filepath, 'w') as f:
                json.dump(self.settings, f, indent=4)
        except Exception as e:
            print(f"Failed to save config: {e}")

    def get(self, key):
        return self.settings.get(key)

    def set(self, key, value):
        self.settings[key] = value
        self.save()
