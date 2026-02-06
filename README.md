# Android App Uninstaller Without Root

A desktop application built with Electron that allows you to uninstall Android applications from your device without requiring root access. It provides a user-friendly interface for managing, deleting, and extracting applications.

## Features

- **App Management**:
  - List all user and system apps.
  - Uninstall applications without root access.
  - Enable or disable applications.
  - Extract APK files from your device.
- **Device Connectivity**:
  - Connect to your device via USB.
  - Wireless debugging support with QR code pairing and IP address connection.
  - Support for multiple connected devices.

## How It Works

The application uses the Android Debug Bridge (ADB) to communicate with your Android device. It provides a graphical interface for common ADB commands, making it easy to manage your apps without using the command line.

## Building from Source

To build the application from source, you will need to have Node.js and npm installed.

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Dash2100/uninstall_without_root.git
   ```
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Run the application**:
   ```bash
   npm run dev
   ```
4. **Build the application**:
   ```bash
   npm run build
   ```

## Disclaimer

Uninstalling system applications can cause your device to become unstable or even unusable. Please be careful and only uninstall applications that you know are safe to remove. The developers of this application are not responsible for any damage to your device.