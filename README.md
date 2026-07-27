# Myusic 🎵

**Myusic** is a lightweight, transparent, and customizable media overlay for Windows. It integrates seamlessly with your system's media controls (like Apple Music, Spotify, etc.) to display the currently playing song, album art, and lyrics directly on your screen without getting in your way.

## Features ✨

- **Fully Transparent Overlay**: Runs silently on your desktop, blending perfectly with your wallpaper and other applications.
- **Real-Time Media Sync**: Instantly detects and displays what's currently playing, syncing lyrics and album art.
- **Media Controls**: Play, pause, skip, go back, toggle shuffle, and repeat straight from the overlay.
- **Customizable**: Access the built-in settings menu to tweak:
  - Text, Control, and Background Colors (with transparency support)
  - Font Size (for lyrics and song titles)
  - Window Size & Position
  - Idle Opacity (fades out when you aren't interacting with it)
  - Toggle Album Art & Controls visibility
- **System Tray Integration**: Quietly lives in your taskbar tray. Right-click to easily exit the app.
- **Incredibly Lightweight**: Built with Rust and Tauri, ensuring minimal memory and CPU usage compared to Electron-based alternatives.

## Installation 🚀

1. Download the latest `myusic.exe` file.
2. Place it anywhere on your PC (e.g., your Desktop or a dedicated folder).
3. Double-click to run! No complex installation required.

## Development 🛠️

Myusic is built with **Tauri v2**, **Rust**, **React**, and **TypeScript**.

### Prerequisites
- [Node.js](https://nodejs.org/)
- [Rust](https://www.rust-lang.org/tools/install)
- [Tauri Prerequisites for Windows](https://tauri.app/v1/guides/getting-started/prerequisites#windows)

### Setup & Run
1. Clone the repository:
   ```bash
   git clone <your-repo-url>
   cd AppMus
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the app in development mode:
   ```bash
   npm run tauri dev
   ```

### Building for Release
To compile the app into a standalone `.exe`:
```bash
npm run build
```
The compiled executable will be located in `src-tauri/target/release/myusic.exe`.

---
*Enjoy your uninterrupted, beautiful music experience with Myusic!*
