
# noctis

> night vision for gamers

**noctis** is a hardware-level adaptive gamma control tool. active sensor monitoring. zero latency. undetectable.

### key features

- **adaptive sensor**: monitors screen brightness in real-time.
- **smart hysteresis**: auto-adjusts gamma based on scene lighting (dark areas -> boost, bright areas -> dim).
- **hardware level**: modifies gpu gamma ramp directly. no overlay.
- **undetectable**: runs external to game process.
- **performance**: written in pure python with optimized numpy processing. <1% cpu usage.

### usage

1. run `Noctis.exe` (as administrator)
2. use **sliders** to adjust sensitivity and max boost.
3. press `INS` (default) to toggle system online/offline.

### build

```bash
pip install -r requirements.txt
python main.py
```

### license

mit

