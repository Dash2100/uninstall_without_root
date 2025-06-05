#!/usr/bin/env python3
import subprocess
import time
import qrcode
from zeroconf import IPVersion, ServiceBrowser, ServiceStateChange, Zeroconf

# 配置
ADB_PATH = "/Users/dash/Documents/GitHub/Maii/uninstall_without_root/adb/mac-arm64/adb"
NAME = "ADB_WIFI"
PASSWORD = "000000"
device_ports = []

def generate_qr():
    """生成並顯示QR碼"""
    qr_text = f"WIFI:T:ADB;S:{NAME};P:{PASSWORD};;"
    qr = qrcode.QRCode(border=1, version=1)
    qr.add_data(qr_text)
    qr.print_ascii(invert=True)

def on_service_change(zeroconf, service_type, name, state_change):
    """處理服務狀態變化"""
    if state_change is ServiceStateChange.Added:
        info = zeroconf.get_service_info(service_type, name)
        if not info:
            return
            
        addr = info.parsed_addresses()[0]
        
        if service_type == "_adb-tls-pairing._tcp.local.":
            if device_ports:
                # 配對設備
                print("配對中...")
                subprocess.run([ADB_PATH, "pair", f"{addr}:{info.port}", PASSWORD])
                
                # 連接設備
                print("連接中...")
                subprocess.run([ADB_PATH, "connect", f"{addr}:{device_ports[0]}"])
                print("完成！")
                exit(0)
                
        elif service_type == "_adb-tls-connect._tcp.local.":
            device_ports.append(info.port)

def main():
    print("無線ADB連接工具")
    print("請在Android設備上掃描以下QR碼：\n")
    
    generate_qr()
    
    print(f"\n網路名稱: {NAME}")
    print(f"密碼: {PASSWORD}")
    print("\n等待設備連接...")
    
    zc = Zeroconf(ip_version=IPVersion.V4Only)
    ServiceBrowser(
        zc=zc,
        type_=["_adb-tls-connect._tcp.local.", "_adb-tls-pairing._tcp.local."],
        handlers=[on_service_change]
    )
    
    try:
        while True:
            time.sleep(0.1)
    except KeyboardInterrupt:
        print("\n已取消")
    finally:
        zc.close()

if __name__ == "__main__":
    main()