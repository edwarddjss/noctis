from src.config import ConfigManager
from src.core.engine import NoctisEngine
from src.ui.app import NoctisApp

if __name__ == "__main__":
    # 1. Load Settings
    config = ConfigManager()
    
    # 2. Start Engine
    engine = NoctisEngine(config)
    
    # 3. Launch UI
    app = NoctisApp(engine, config)
    app.mainloop()
