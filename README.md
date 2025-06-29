# Android App Uninstaller Without Root

This is a desktop application built with Electron that allows you to uninstall Android applications from your device without requiring root access. It provides a user-friendly interface for managing, deleting, and extracting applications.

## Features

- **Cross-Platform Support**: Works on Windows, macOS, and Linux.
- **User-Friendly Interface**: A simple and intuitive interface for managing your Android apps.
- **App Management**:
  - List all user and system apps.
  - Uninstall applications without root access.
  - Enable or disable applications.
  - Extract APK files from your device.
- **Device Connectivity**:
  - Connect to your device via USB.
  - Wireless debugging support with QR code pairing and IP address connection.
  - Support for multiple connected devices.
- **Customizable Settings**:
  - Dark mode theme.
  - Option to delete app data when uninstalling.
  - Debug mode with an ADB terminal.
  - Customizable APK extraction path.

## How It Works

The application uses the Android Debug Bridge (ADB) to communicate with your Android device. It provides a graphical interface for common ADB commands, making it easy to manage your apps without using the command line.

## Getting Started

1. **Enable Developer Options and USB Debugging** on your Android device.
2. **Connect your device** to your computer via USB.
3. **Launch the application** and grant any necessary permissions.
4. **Start managing your apps!**

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
   npm start
   ```
4. **Build the application**:
   ```bash
   npm run build
   ```

## Disclaimer

Uninstalling system applications can cause your device to become unstable or even unusable. Please be careful and only uninstall applications that you know are safe to remove. The developers of this application are not responsible for any damage to your device.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
